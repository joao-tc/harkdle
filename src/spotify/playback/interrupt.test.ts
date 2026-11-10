import { describe, expect, it } from "vitest";
import type { CueTarget, InterruptionReason } from "./adapter";
import { classifyEvent, classifyTimeout, type Expectation } from "./interrupt";
import type { TransportEvent, TransportState } from "./transport";

const target: CueTarget = { uri: "spotify:track:ours", startMs: 30_000 };

function state(overrides: Partial<TransportState> = {}): TransportState {
	return {
		positionMs: 30_000,
		paused: true,
		uri: target.uri,
		linkedFromUri: null,
		...overrides,
	};
}

const holding: Expectation = { target, holding: true };
const midCue: Expectation = { target, holding: false };
const noTarget: Expectation = { target: null, holding: true };

const stateEvent = (s: TransportState | null): TransportEvent => ({
	type: "state",
	state: s,
});

describe("classifyEvent", () => {
	const cases: ReadonlyArray<
		[string, TransportEvent, Expectation, InterruptionReason | null]
	> = [
		["not-ready while holding", { type: "not-ready" }, holding, "device-lost"],
		["not-ready mid-cue", { type: "not-ready" }, midCue, "device-lost"],
		[
			"not-ready with no target",
			{ type: "not-ready" },
			noTarget,
			"device-lost",
		],
		["null state while holding", stateEvent(null), holding, "taken-over"],
		["null state mid-cue", stateEvent(null), midCue, null],
		[
			"another track while holding",
			stateEvent(state({ uri: "spotify:track:other" })),
			holding,
			"taken-over",
		],
		[
			"another track mid-cue",
			stateEvent(state({ uri: "spotify:track:other" })),
			midCue,
			null,
		],
		[
			"another track whose linkedFromUri is also another track",
			stateEvent(
				state({ uri: "spotify:track:other", linkedFromUri: "spotify:track:x" }),
			),
			holding,
			"taken-over",
		],
		["our track by uri", stateEvent(state()), holding, null],
		[
			"our track by linkedFromUri",
			stateEvent(
				state({ uri: "spotify:track:relinked", linkedFromUri: target.uri }),
			),
			holding,
			null,
		],
		[
			"null uri while holding",
			stateEvent(state({ uri: null })),
			holding,
			"taken-over",
		],
		["null state with holding but no target", stateEvent(null), noTarget, null],
		[
			"another track with holding but no target",
			stateEvent(state({ uri: "spotify:track:other" })),
			noTarget,
			null,
		],
		[
			"error while holding",
			{ type: "error", kind: "playback", message: "boom" },
			holding,
			null,
		],
		[
			"error mid-cue",
			{ type: "error", kind: "authentication", message: "boom" },
			midCue,
			null,
		],
	];

	it.each(cases)("%s", (_name, event, expectation, expected) => {
		expect(classifyEvent(event, expectation)).toBe(expected);
	});
});

describe("classifyTimeout", () => {
	const cases: ReadonlyArray<
		[string, TransportState | null, InterruptionReason]
	> = [
		["our track by uri", state(), "device-lost"],
		[
			"our track by linkedFromUri",
			state({ uri: "spotify:track:relinked", linkedFromUri: target.uri }),
			"device-lost",
		],
		["another track", state({ uri: "spotify:track:other" }), "taken-over"],
		["no state", null, "taken-over"],
		["null uri", state({ uri: null }), "taken-over"],
	];

	it.each(cases)("%s", (_name, lastSeen, expected) => {
		expect(classifyTimeout(lastSeen, target)).toBe(expected);
	});
});
