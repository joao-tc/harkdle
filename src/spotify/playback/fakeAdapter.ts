import {
	type ClipOutcome,
	type CueTarget,
	type InterruptionReason,
	type PlaybackAdapter,
	PlaybackError,
	type PlaybackStatus,
} from "./adapter";

export interface FakeCall {
	readonly method:
		| "connect"
		| "disconnect"
		| "cue"
		| "playClip"
		| "reveal"
		| "stop"
		| "setVolume"
		| "recover";
	readonly args: readonly unknown[];
}

export interface FakeAdapterControls {
	readonly calls: readonly FakeCall[];
	endClip(): void;
	interrupt(reason: InterruptionReason): void;
	hideTab(): void;
	failNextCue(error: PlaybackError): void;
	failNextConnect(error: PlaybackError): void; // the next connect() leaves status disconnected and rejects
	failNextRecover(error: PlaybackError): void; // the next recover() leaves status interrupted and rejects
	holdCues(): void; // later cues stay "cueing" until releaseCue()
	releaseCue(): void; // lets the oldest held cue reach "ready"
}

interface PendingClip {
	readonly promise: Promise<ClipOutcome>;
	readonly settle: (outcome: ClipOutcome) => void;
}

export function createFakeAdapter(
	options: { readonly autoEndClips?: boolean } = {},
): PlaybackAdapter & FakeAdapterControls {
	const calls: FakeCall[] = [];
	const listeners = new Set<(status: PlaybackStatus) => void>();
	let status: PlaybackStatus = { kind: "disconnected" };
	let target: CueTarget | null = null;
	let clip: PendingClip | null = null;
	let pendingPlay: Promise<ClipOutcome> | null = null;
	let cueRun = 0;
	let nextCueFailure: PlaybackError | null = null;
	let nextConnectFailure: PlaybackError | null = null;
	let nextRecoverFailure: PlaybackError | null = null;
	let pendingReveal: Promise<void> | null = null;
	let holding = false;
	const heldCues: Array<() => void> = [];

	const record = (method: FakeCall["method"], ...args: unknown[]) => {
		calls.push({ method, args });
	};

	const setStatus = (next: PlaybackStatus) => {
		status = next;
		for (const listener of [...listeners]) listener(next);
	};

	const startCue = async (
		next: CueTarget,
		failure: PlaybackError | null,
	): Promise<void> => {
		const run = ++cueRun;
		target = next;
		setStatus({ kind: "cueing", target: next });
		await Promise.resolve();
		if (holding) {
			await new Promise<void>((release) => {
				heldCues.push(release);
			});
		}
		if (run !== cueRun) {
			throw new PlaybackError("superseded", "cue superseded");
		}
		if (failure) {
			setStatus({ kind: "idle" });
			throw failure;
		}
		setStatus({ kind: "ready", target: next });
	};

	// The clip settles first; the re-cue starts a microtask later so awaiters of the clip run before it.
	const settleClip = async (
		outcome: ClipOutcome,
		recue: boolean,
	): Promise<void> => {
		const pending = clip;
		if (!pending) return;
		clip = null;
		const run = cueRun;
		pending.settle(outcome);
		if (!recue) return;
		await Promise.resolve();
		if (run !== cueRun || !target) return;
		await startCue(target, null).catch(() => undefined);
	};

	const subscribe = (listener: (status: PlaybackStatus) => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	const notPlayable = (current: PlaybackStatus) =>
		current.kind === "interrupted"
			? new PlaybackError("device-lost", "device lost")
			: new PlaybackError("not-connected", "nothing is ready to play");

	const beginClip = (): Promise<ClipOutcome> => {
		let settle: PendingClip["settle"] = () => undefined;
		const promise = new Promise<ClipOutcome>((resolve) => {
			settle = resolve;
		});
		const pending = { promise, settle };
		clip = pending;
		if (status.kind === "ready") {
			setStatus({ kind: "playing-clip", target: status.target });
		}
		if (options.autoEndClips) {
			queueMicrotask(() => {
				if (clip === pending) void settleClip({ kind: "ended" }, true);
			});
		}
		return promise;
	};

	const revealNow = () => {
		if (status.kind !== "ready" && status.kind !== "playing-clip") return;
		const revealed = status.target;
		void settleClip({ kind: "revealed" }, false);
		setStatus({ kind: "revealing", target: revealed });
	};

	return {
		get calls() {
			return calls;
		},

		getStatus: () => status,

		onStatus: subscribe,

		async connect(connectOptions) {
			record("connect", connectOptions);
			if (status.kind !== "disconnected") return;
			const failure = nextConnectFailure;
			nextConnectFailure = null;
			setStatus({ kind: "connecting" });
			await Promise.resolve();
			if ((status as PlaybackStatus).kind !== "connecting") return;
			if (failure) {
				setStatus({ kind: "disconnected" });
				throw failure;
			}
			setStatus({ kind: "idle" });
		},

		disconnect() {
			record("disconnect");
			if (status.kind === "disconnected") return;
			cueRun++;
			target = null;
			void settleClip({ kind: "stopped" }, false);
			setStatus({ kind: "disconnected" });
		},

		cue(next) {
			record("cue", next);
			void settleClip({ kind: "stopped" }, false);
			const failure = nextCueFailure;
			nextCueFailure = null;
			return startCue(next, failure);
		},

		playClip(lengthMs) {
			record("playClip", lengthMs);
			if (clip) return clip.promise;
			if (pendingPlay) return pendingPlay;
			if (pendingReveal) return Promise.resolve({ kind: "revealed" });
			if (status.kind === "cueing") {
				const waiting = new Promise<ClipOutcome>((resolve, reject) => {
					const stop = subscribe((next) => {
						if (next.kind === "cueing") return;
						stop();
						pendingPlay = null;
						if (next.kind === "ready") resolve(beginClip());
						else reject(notPlayable(next));
					});
				});
				pendingPlay = waiting;
				return waiting;
			}
			if (status.kind !== "ready") {
				return Promise.reject(notPlayable(status));
			}
			return beginClip();
		},

		async reveal() {
			record("reveal");
			if (pendingReveal || pendingPlay) return;
			if (status.kind === "cueing") {
				const waiting = new Promise<void>((resolve, reject) => {
					const stop = subscribe((next) => {
						if (next.kind === "cueing") return;
						stop();
						// Deferred so the nested status change cannot reach listeners ahead of "ready".
						queueMicrotask(() => {
							pendingReveal = null;
							if (next.kind === "ready") {
								revealNow();
								resolve();
							} else {
								reject(notPlayable(next));
							}
						});
					});
				});
				pendingReveal = waiting;
				return waiting;
			}
			revealNow();
		},

		async stop() {
			record("stop");
			if (clip) return settleClip({ kind: "stopped" }, true);
			if (status.kind === "revealing" && target) {
				await startCue(target, null).catch(() => undefined);
			}
		},

		async setVolume(volume) {
			record("setVolume", volume);
		},

		async recover() {
			record("recover");
			if (status.kind !== "interrupted") return;
			const failure = nextRecoverFailure;
			nextRecoverFailure = null;
			if (failure) throw failure;
			if (!target) {
				setStatus({ kind: "idle" });
				return;
			}
			await startCue(target, null);
		},

		endClip() {
			void settleClip({ kind: "ended" }, true);
		},

		interrupt(reason) {
			cueRun++;
			void settleClip({ kind: "interrupted", reason }, false);
			setStatus({ kind: "interrupted", reason, target });
		},

		hideTab() {
			void settleClip({ kind: "hidden" }, true);
		},

		failNextCue(error) {
			nextCueFailure = error;
		},

		failNextConnect(error) {
			nextConnectFailure = error;
		},

		failNextRecover(error) {
			nextRecoverFailure = error;
		},

		holdCues() {
			holding = true;
		},

		releaseCue() {
			heldCues.shift()?.();
		},
	};
}
