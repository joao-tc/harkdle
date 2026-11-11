import type { CueTarget, InterruptionReason } from "./adapter";
import type { TransportEvent, TransportState } from "./transport";

export interface Expectation {
	readonly target: CueTarget | null;
	readonly holding: boolean; // a cue is held: status ready, playing-clip or revealing (not mid-cue)
}

function isOurs(state: TransportState, target: CueTarget): boolean {
	return state.uri === target.uri || state.linkedFromUri === target.uri;
}

export function classifyEvent(
	event: TransportEvent,
	expectation: Expectation,
): InterruptionReason | null {
	if (event.type === "not-ready") return "device-lost";
	if (event.type !== "state") return null;
	const { target, holding } = expectation;
	if (!holding || target === null) return null;
	return event.state !== null && isOurs(event.state, target)
		? null
		: "taken-over";
}

export function classifyTimeout(
	lastSeen: TransportState | null,
	target: CueTarget,
): InterruptionReason {
	return lastSeen !== null && isOurs(lastSeen, target)
		? "device-lost"
		: "taken-over";
}
