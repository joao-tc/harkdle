import {
	type ClipOutcome,
	type CueTarget,
	type InterruptionReason,
	type PlaybackAdapter,
	PlaybackError,
	type PlaybackStatus,
} from "./adapter";
import { type ClipControl, runClip } from "./clip";
import type { Clock } from "./clock";
import {
	ConfirmTimeout,
	isTrack,
	POLL_MS,
	pauseConfirmed,
	seekConfirmed,
	TIMEOUT_MS,
} from "./confirm";
import { type CueDeps, runCue } from "./cue";
import { classifyEvent, classifyTimeout } from "./interrupt";
import {
	type PlayerTransport,
	TransportError,
	type TransportEvent,
} from "./transport";
import type { Visibility } from "./visibility";

export interface PlaybackDeps {
	readonly transport: PlayerTransport;
	readonly clock: Clock;
	readonly visibility: Visibility;
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (error: unknown) => void;
}

interface ActiveClip {
	readonly control: ClipControl;
	readonly outcome: Deferred<ClipOutcome>;
	done: Promise<void>; // the clip loop and, when it ends normally, the re-cue
}

// The single slot for a playClip/reveal requested while a cue is running.
interface Pending {
	readonly kind: "play" | "reveal";
	readonly promise: Promise<unknown>;
	start(): void;
	cancel(): void;
	fail(error: PlaybackError): void;
}

const noop = () => {};

function deferred<T>(): Deferred<T> {
	let resolve: Deferred<T>["resolve"] = noop;
	let reject: Deferred<T>["reject"] = noop;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const superseded = () => new PlaybackError("superseded", "cue superseded");

function toPlaybackError(error: unknown): PlaybackError {
	if (error instanceof PlaybackError) return error;
	const message = error instanceof Error ? error.message : String(error);
	return new PlaybackError(
		error instanceof TransportError && error.kind === "device-gone"
			? "device-lost"
			: "initialization",
		message,
	);
}

function toCueError(error: unknown): PlaybackError {
	if (error instanceof PlaybackError) return error;
	if (error instanceof TransportError && error.kind === "device-gone") {
		return new PlaybackError("device-lost", error.message);
	}
	return new PlaybackError(
		"cue-failed",
		error instanceof Error ? error.message : String(error),
	);
}

function interruptionOf(error: unknown, target: CueTarget): InterruptionReason {
	return error instanceof ConfirmTimeout
		? classifyTimeout(error.lastSeen, target)
		: "device-lost";
}

export function createPlaybackAdapter(deps: PlaybackDeps): PlaybackAdapter {
	const { transport, clock, visibility } = deps;
	const listeners = new Set<(status: PlaybackStatus) => void>();
	let status: PlaybackStatus = { kind: "disconnected" };
	let target: CueTarget | null = null;
	let originMs = 0;
	let userVolume = 1;
	let lastError: string | null = null;
	let muting = 0; // cues between mute and restore
	// Bumped by every cue, stop of a reveal, interruption and disconnect: continuations of older work check it.
	let gen = 0;
	let clip: ActiveClip | null = null;
	let pending: Pending | null = null;
	// Transport sequences (cue, re-cue) must not interleave: a newer one waits for this.
	let busy: Promise<void> = Promise.resolve();
	let connecting: Promise<void> | null = null;
	let detach: (() => void) | null = null;

	const cueDeps: CueDeps = {
		transport,
		clock,
		takeError() {
			const message = lastError;
			lastError = null;
			return message;
		},
		getVolume: () => userVolume,
	};

	function setStatus(next: PlaybackStatus) {
		if (JSON.stringify(next) === JSON.stringify(status)) return;
		status = next;
		for (const listener of [...listeners]) listener(next);
	}

	function track(work: Promise<void>): Promise<void> {
		busy = work.then(noop, noop);
		return work;
	}

	function notPlayable(): PlaybackError {
		return status.kind === "interrupted"
			? new PlaybackError("device-lost", "device lost")
			: new PlaybackError("not-connected", "nothing is ready to play");
	}

	function startPending() {
		const slot = pending;
		pending = null;
		slot?.start();
	}

	function failPending() {
		const slot = pending;
		pending = null;
		slot?.fail(notPlayable());
	}

	function interrupt(reason: InterruptionReason) {
		gen++;
		if (clip) {
			clip.control.cancel = "interrupted";
			clip.outcome.resolve({ kind: "interrupted", reason });
		}
		setStatus({ kind: "interrupted", reason, target });
		failPending();
	}

	function onEvent(event: TransportEvent) {
		if (event.type === "error") {
			if (event.kind === "playback") lastError = event.message;
			return;
		}
		const holding =
			status.kind === "ready" ||
			status.kind === "playing-clip" ||
			status.kind === "revealing";
		if (!holding) return;
		const reason = classifyEvent(event, { target, holding });
		if (reason) interrupt(reason);
	}

	function onVisibility(hidden: boolean) {
		if (!hidden || status.kind !== "playing-clip") return;
		if (!clip || clip.control.cancel !== null) return;
		clip.control.cancel = "hidden";
		// Background timers are throttled: do not wait for the clip loop to notice.
		transport.pause().catch(noop);
	}

	function attach() {
		detach?.();
		const offTransport = transport.subscribe(onEvent);
		const offVisibility = visibility.subscribe(onVisibility);
		detach = () => {
			offTransport();
			offVisibility();
		};
	}

	function release() {
		detach?.();
		detach = null;
	}

	async function runCueRecovering(next: CueTarget, g: number) {
		try {
			return await runCue(cueDeps, next);
		} catch (error) {
			if (!(error instanceof TransportError && error.kind === "device-gone")) {
				throw error;
			}
		}
		if (g !== gen) throw superseded();
		try {
			await transport.connect({ volume: userVolume });
		} catch {
			throw new TransportError("device-gone", "reconnect failed");
		}
		return runCue(cueDeps, next);
	}

	async function cueTarget(next: CueTarget, g: number): Promise<void> {
		lastError = null;
		muting++;
		try {
			const cued = await runCueRecovering(next, g);
			if (g !== gen) throw superseded();
			originMs = cued.originMs;
			setStatus({ kind: "ready", target: next });
		} catch (error) {
			if (g !== gen) throw superseded();
			const failure = toCueError(error);
			if (failure.kind === "device-lost") {
				setStatus({ kind: "interrupted", reason: "device-lost", target: next });
			} else {
				setStatus({ kind: "idle" });
			}
			failPending();
			throw failure;
		} finally {
			muting--;
		}
		startPending();
	}

	// Seeks back to the start point (after a confirmed pause when audio is still running).
	function recue(g: number, next: CueTarget, pauseFirst: boolean) {
		return track(
			(async () => {
				setStatus({ kind: "cueing", target: next });
				try {
					if (pauseFirst) await pauseConfirmed(cueDeps, next.uri, "stop pause");
					const { state } = await seekConfirmed(
						cueDeps,
						next.uri,
						next.startMs,
					);
					if (g !== gen) return;
					originMs = state.positionMs;
					setStatus({ kind: "ready", target: next });
					startPending();
				} catch (error) {
					if (g === gen) interrupt(interruptionOf(error, next));
				}
			})(),
		);
	}

	function startClip(lengthMs: number, outcome: Deferred<ClipOutcome>) {
		if (!target) return;
		// A Play queued during the re-cue must not start in a tab that was hidden meanwhile.
		if (visibility.isHidden()) {
			outcome.resolve({ kind: "hidden" });
			return;
		}
		const clipTarget = target;
		const g = gen;
		const control: ClipControl = { cancel: null };
		const active: ActiveClip = { control, outcome, done: Promise.resolve() };
		clip = active;
		lastError = null;
		setStatus({ kind: "playing-clip", target: clipTarget });
		active.done = (async () => {
			let result: ClipOutcome;
			try {
				const { end } = await runClip(
					cueDeps,
					clipTarget,
					originMs,
					lengthMs,
					control,
				);
				result =
					end === "interrupted"
						? {
								kind: "interrupted",
								reason:
									status.kind === "interrupted" ? status.reason : "device-lost",
							}
						: { kind: end };
			} catch (error) {
				const reason = interruptionOf(error, clipTarget);
				if (g === gen) interrupt(reason);
				result = { kind: "interrupted", reason };
			}
			if (clip === active) clip = null;
			outcome.resolve(result);
			if (result.kind === "revealed" || result.kind === "interrupted") return;
			// Let the awaiters of the clip run before the status moves on.
			await Promise.resolve();
			if (g === gen) await recue(g, clipTarget, false);
		})();
	}

	function startReveal(done: Deferred<void>) {
		if (!target) return;
		const revealTarget = target;
		const g = gen;
		setStatus({ kind: "revealing", target: revealTarget });
		void (async () => {
			let failed = false;
			try {
				const stale = (await transport.getState())?.positionMs ?? null;
				await transport.resume();
				const start = clock.now();
				for (;;) {
					if (g !== gen) break;
					const state = await transport.getState();
					if (
						state &&
						isTrack(state, revealTarget.uri) &&
						!state.paused &&
						state.positionMs > originMs &&
						state.positionMs !== stale
					) {
						break;
					}
					if (clock.now() - start >= TIMEOUT_MS) {
						throw new ConfirmTimeout("reveal playback", state);
					}
					await clock.sleep(POLL_MS);
				}
			} catch (error) {
				if (g === gen) interrupt(interruptionOf(error, revealTarget));
				failed = true;
			}
			if (failed || status.kind === "interrupted") {
				done.reject(new PlaybackError("device-lost", "device lost"));
			} else {
				done.resolve();
			}
		})();
	}

	function hold(slot: Pending): void {
		pending = slot;
	}

	function recueing(): boolean {
		return (
			status.kind === "cueing" || (status.kind === "playing-clip" && !clip)
		);
	}

	function establish(): Promise<void> {
		const g = ++gen;
		setStatus({ kind: "connecting" });
		attach();
		return (async () => {
			try {
				await transport.connect({ volume: userVolume });
			} catch (error) {
				if (g === gen) {
					release();
					setStatus({ kind: "disconnected" });
				}
				throw toPlaybackError(error);
			}
			if (g !== gen) throw superseded();
			setStatus({ kind: "idle" });
		})();
	}

	return {
		getStatus: () => status,

		onStatus(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		connect({ volume }) {
			userVolume = clamp01(volume);
			if (connecting) return connecting;
			if (status.kind !== "disconnected") return Promise.resolve();
			const attempt = establish().finally(() => {
				connecting = null;
			});
			connecting = attempt;
			return attempt;
		},

		disconnect() {
			if (status.kind === "disconnected") return;
			gen++;
			release();
			if (clip) {
				clip.control.cancel = "interrupted";
				clip.outcome.resolve({ kind: "interrupted", reason: "device-lost" });
			}
			setStatus({ kind: "disconnected" });
			failPending();
			transport.disconnect();
		},

		cue(next) {
			if (status.kind === "disconnected" || status.kind === "connecting") {
				return Promise.reject(notPlayable());
			}
			const g = ++gen;
			const wasPlaying =
				status.kind === "playing-clip" || status.kind === "revealing";
			const stopping = clip;
			if (stopping) {
				if (
					stopping.control.cancel === null ||
					stopping.control.cancel === "revealed"
				) {
					stopping.control.cancel = "stopped";
				}
				stopping.outcome.resolve({ kind: "stopped" });
			}
			// A request made against the previous cue must not play the new one.
			const slot = pending;
			pending = null;
			slot?.cancel();
			target = next;
			setStatus({ kind: "cueing", target: next });
			const previous = busy;
			return track(
				(async () => {
					if (wasPlaying) await transport.pause().catch(noop);
					await stopping?.done;
					await previous;
					if (g !== gen) throw superseded();
					await cueTarget(next, g);
				})(),
			);
		},

		playClip(lengthMs) {
			if (clip) return clip.outcome.promise;
			if (pending) {
				return pending.kind === "play"
					? (pending.promise as Promise<ClipOutcome>)
					: Promise.resolve({ kind: "revealed" });
			}
			if (status.kind === "revealing") {
				return Promise.resolve({ kind: "revealed" });
			}
			const outcome = deferred<ClipOutcome>();
			if (status.kind === "ready") {
				startClip(lengthMs, outcome);
			} else if (recueing()) {
				hold({
					kind: "play",
					promise: outcome.promise,
					start: () => startClip(lengthMs, outcome),
					cancel: () => outcome.resolve({ kind: "stopped" }),
					fail: outcome.reject,
				});
			} else {
				return Promise.reject(notPlayable());
			}
			return outcome.promise;
		},

		reveal() {
			if (status.kind === "revealing") return Promise.resolve();
			if (status.kind === "playing-clip" && clip) {
				if (clip.control.cancel === null) {
					clip.control.cancel = "revealed";
					setStatus({ kind: "revealing", target: status.target });
				}
				return Promise.resolve();
			}
			if (pending) return Promise.resolve();
			const done = deferred<void>();
			if (status.kind === "ready") {
				startReveal(done);
			} else if (recueing()) {
				hold({
					kind: "reveal",
					promise: done.promise,
					start: () => startReveal(done),
					cancel: () => done.resolve(),
					fail: done.reject,
				});
			} else {
				return Promise.reject(notPlayable());
			}
			return done.promise;
		},

		async stop() {
			const active = clip;
			if (active) {
				if (
					active.control.cancel === null ||
					active.control.cancel === "revealed"
				) {
					active.control.cancel = "stopped";
				}
				await active.done;
			}
			if (status.kind === "revealing" && target) {
				await recue(++gen, target, true);
			}
		},

		async setVolume(volume) {
			userVolume = clamp01(volume);
			if (muting > 0 || connecting || status.kind === "disconnected") return;
			await transport.setVolume(userVolume).catch(noop);
		},

		async recover() {
			const from = status;
			if (from.kind !== "interrupted" && from.kind !== "disconnected") return;
			const g = ++gen;
			const next = target;
			const reconnect =
				from.kind === "disconnected" || from.reason === "device-lost";
			const stale = clip;
			const previous = busy;
			setStatus({ kind: "connecting" });
			await track(
				(async () => {
					try {
						await stale?.done;
						await previous;
						if (g !== gen) throw superseded();
						if (from.kind === "disconnected") attach();
						if (reconnect) await transport.connect({ volume: userVolume });
						await transport.transferHere();
					} catch (error) {
						if (g === gen) {
							if (from.kind === "disconnected") release();
							setStatus(from);
						}
						throw toPlaybackError(error);
					}
					if (g !== gen) throw superseded();
					if (!next) {
						setStatus({ kind: "idle" });
						return;
					}
					setStatus({ kind: "cueing", target: next });
					await cueTarget(next, g);
				})(),
			);
		},
	};
}
