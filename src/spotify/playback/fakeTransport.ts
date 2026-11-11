import type { Clock } from "./clock";
import {
	type PlayerTransport,
	TransportError,
	type TransportEvent,
	type TransportState,
} from "./transport";

export interface FakeTransportOptions {
	latencyMs: number; // audio starts this long after play/resume
	sdkPauseIgnored?: boolean; // SDK pause() resolves but does nothing; pauseViaApi works
	sdkSeekIgnored?: boolean; // same for seek()
	relinkedTo?: string; // report this uri, with linkedFromUri = the requested one
	play404Times?: number; // the first N playFrom calls reject with "device-gone"
	setVolumeIgnored?: boolean; // SDK setVolume resolves but the volume does not change
}

export interface FakeTransport {
	transport: PlayerTransport;
	clock: Clock;
	schedule(atMs: number, run: () => void): void;
	emit(event: TransportEvent): void;
	readonly calls: readonly string[];
	audibleMs(): number;
	volume(): number;
}

const PREVIOUS_URI = "spotify:track:previous";
const STALE_POSITION_MS = 999_999;
const CALL_MS = 5; // a play/resume request takes this long to be accepted

export function createFakeTransport(
	options: FakeTransportOptions,
): FakeTransport {
	let t = 0;
	let audibleMs = 0;
	let volume = 1;
	let play404Left = options.play404Times ?? 0;
	const calls: string[] = [];
	const listeners = new Set<(event: TransportEvent) => void>();
	const queue: { at: number; run: () => void }[] = [];

	let uri = PREVIOUS_URI;
	let pendingUri: string | null = null;
	let pos = STALE_POSITION_MS;
	let anchor = 0;
	let paused = true;
	let playingSince: number | null = null; // audio runs from this time on

	const moveTo = (to: number) => {
		if (playingSince !== null && volume > 0) {
			audibleMs += Math.max(0, to - Math.max(t, playingSince));
		}
		t = to;
	};

	const advanceTo = (to: number) => {
		for (let next = queue[0]; next && next.at <= to; next = queue[0]) {
			queue.shift();
			moveTo(Math.max(t, next.at));
			next.run();
		}
		moveTo(Math.max(t, to));
	};

	const position = () =>
		playingSince !== null && t >= playingSince
			? anchor + (t - playingSince)
			: pos;

	const doPause = () => {
		pos = position();
		anchor = pos;
		playingSince = null;
		paused = true;
		if (pendingUri) uri = pendingUri;
	};

	const doSeek = (ms: number) => {
		anchor = ms;
		pos = ms;
		if (playingSince !== null) playingSince = Math.max(playingSince, t);
	};

	const clock: Clock = {
		now: () => t,
		sleep: async (ms) => advanceTo(t + ms),
	};

	const transport: PlayerTransport = {
		async connect({ volume: initial }) {
			calls.push("connect");
			volume = initial;
		},
		disconnect() {
			calls.push("disconnect");
		},
		async transferHere() {
			calls.push("transferHere");
		},
		async playFrom(target, positionMs) {
			calls.push(`playFrom ${target} ${positionMs}`);
			if (play404Left > 0) {
				play404Left--;
				throw new TransportError("device-gone", "PUT /me/player/play 404");
			}
			advanceTo(t + CALL_MS);
			anchor = positionMs;
			pos = positionMs;
			paused = false;
			pendingUri = target;
			playingSince = t + options.latencyMs;
		},
		async pause() {
			calls.push("pause");
			if (!options.sdkPauseIgnored) doPause();
		},
		async pauseViaApi() {
			calls.push("pauseViaApi");
			doPause();
		},
		async resume() {
			calls.push("resume");
			advanceTo(t + CALL_MS);
			if (!paused) return;
			paused = false;
			playingSince = t + options.latencyMs;
		},
		async seek(positionMs) {
			calls.push(`seek ${positionMs}`);
			if (!options.sdkSeekIgnored) doSeek(positionMs);
		},
		async seekViaApi(positionMs) {
			calls.push(`seekViaApi ${positionMs}`);
			doSeek(positionMs);
		},
		async getState(): Promise<TransportState | null> {
			if (pendingUri && playingSince !== null && t >= playingSince) {
				uri = pendingUri;
			}
			const relinked = options.relinkedTo !== undefined && uri !== PREVIOUS_URI;
			return {
				positionMs: position(),
				paused,
				uri: relinked ? (options.relinkedTo ?? uri) : uri,
				linkedFromUri: relinked ? uri : null,
			};
		},
		async setVolume(next) {
			calls.push(`setVolume ${next}`);
			if (!options.setVolumeIgnored) volume = next;
		},
		async getVolume() {
			return volume;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};

	return {
		transport,
		clock,
		schedule(atMs, run) {
			const index = queue.findIndex((entry) => entry.at > atMs);
			queue.splice(index === -1 ? queue.length : index, 0, { at: atMs, run });
		},
		emit(event) {
			for (const listener of [...listeners]) listener(event);
		},
		calls,
		audibleMs: () => audibleMs,
		volume: () => volume,
	};
}
