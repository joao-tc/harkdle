import type { Clock } from "./clock";
import type { PlayerTransport, TransportState } from "./transport";

export const POLL_MS = 15;
export const TIMEOUT_MS = 5000;
export const GRACE_MS = 1500; // SDK pause/seek gets this long before the Web API fallback
export const SEEK_TOLERANCE_MS = 50;

export interface ConfirmDeps {
	readonly transport: PlayerTransport;
	readonly clock: Clock;
	/** Returns and clears the last transport `playback` error, if any. */
	takeError(): string | null;
}

export type Via = "sdk" | "webApi";

/** Thrown by waitForState when the deadline passes. `lastSeen` is the last raw state (any track) or null. */
export class ConfirmTimeout extends Error {
	readonly lastSeen: TransportState | null;

	constructor(what: string, lastSeen: TransportState | null) {
		super(`timeout waiting for ${what}`);
		this.name = "ConfirmTimeout";
		this.lastSeen = lastSeen;
	}
}

export function isTrack(state: TransportState, uri: string): boolean {
	return state.uri === uri || state.linkedFromUri === uri;
}

export async function waitForState(
	deps: ConfirmDeps,
	uri: string,
	what: string,
	test: (state: TransportState) => boolean,
	timeoutMs: number = TIMEOUT_MS,
): Promise<{ state: TransportState; at: number }> {
	const start = deps.clock.now();
	let lastSeen: TransportState | null = null;
	for (;;) {
		const error = deps.takeError();
		if (error) throw new Error(error);
		lastSeen = await deps.transport.getState();
		const at = deps.clock.now();
		if (lastSeen && isTrack(lastSeen, uri) && test(lastSeen)) {
			return { state: lastSeen, at };
		}
		if (at - start >= timeoutMs) throw new ConfirmTimeout(what, lastSeen);
		await deps.clock.sleep(POLL_MS);
	}
}

async function confirmedWithFallback(
	deps: ConfirmDeps,
	uri: string,
	what: string,
	test: (state: TransportState) => boolean,
	viaSdk: () => Promise<void>,
	viaApi: () => Promise<void>,
): Promise<{ state: TransportState; via: Via }> {
	const start = deps.clock.now();
	await viaSdk();
	try {
		const { state } = await waitForState(deps, uri, what, test, GRACE_MS);
		return { state, via: "sdk" };
	} catch (e) {
		if (!(e instanceof ConfirmTimeout)) throw e;
	}
	// A failed fallback just means the command did not take effect; the wait below then times out.
	await viaApi().catch(() => {});
	const remaining = TIMEOUT_MS - (deps.clock.now() - start);
	const { state } = await waitForState(
		deps,
		uri,
		`${what} (Web API fallback)`,
		test,
		remaining,
	);
	return { state, via: "webApi" };
}

export function pauseConfirmed(
	deps: ConfirmDeps,
	uri: string,
	what: string,
): Promise<{ state: TransportState; via: Via }> {
	return confirmedWithFallback(
		deps,
		uri,
		what,
		(state) => state.paused,
		() => deps.transport.pause(),
		() => deps.transport.pauseViaApi(),
	);
}

export function seekConfirmed(
	deps: ConfirmDeps,
	uri: string,
	positionMs: number,
): Promise<{ state: TransportState; via: Via }> {
	return confirmedWithFallback(
		deps,
		uri,
		"seek",
		(state) => Math.abs(state.positionMs - positionMs) <= SEEK_TOLERANCE_MS,
		() => deps.transport.seek(positionMs),
		() => deps.transport.seekViaApi(positionMs),
	);
}
