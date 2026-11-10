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
	let cueRun = 0;
	let nextCueFailure: PlaybackError | null = null;

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

	return {
		get calls() {
			return calls;
		},

		getStatus: () => status,

		onStatus(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		async connect(connectOptions) {
			record("connect", connectOptions);
			if (status.kind !== "disconnected") return;
			setStatus({ kind: "connecting" });
			await Promise.resolve();
			if ((status as PlaybackStatus).kind === "connecting") {
				setStatus({ kind: "idle" });
			}
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
			if (status.kind === "interrupted") {
				return Promise.reject(new PlaybackError("device-lost", "device lost"));
			}
			if (status.kind !== "ready") {
				return Promise.reject(
					new PlaybackError("not-connected", "nothing is ready to play"),
				);
			}
			let settle: PendingClip["settle"] = () => undefined;
			const promise = new Promise<ClipOutcome>((resolve) => {
				settle = resolve;
			});
			const pending = { promise, settle };
			clip = pending;
			setStatus({ kind: "playing-clip", target: status.target });
			if (options.autoEndClips) {
				queueMicrotask(() => {
					if (clip === pending) void settleClip({ kind: "ended" }, true);
				});
			}
			return promise;
		},

		async reveal() {
			record("reveal");
			if (status.kind !== "ready" && status.kind !== "playing-clip") return;
			const revealed = status.target;
			void settleClip({ kind: "revealed" }, false);
			setStatus({ kind: "revealing", target: revealed });
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
	};
}
