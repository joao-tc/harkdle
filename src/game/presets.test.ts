import { describe, expect, it } from "vitest";
import {
	DEFAULT_ROUNDS,
	pickRounds,
	presetOptions,
	ROUND_PRESETS,
} from "@/game/presets";

describe("round presets", () => {
	it("pins the presets and the default", () => {
		expect(ROUND_PRESETS).toEqual([5, 10, 20]);
		expect(DEFAULT_ROUNDS).toBe(10);
	});
});

describe("presetOptions", () => {
	it.each([
		[4, [false, false, false]],
		[5, [true, false, false]],
		[10, [true, true, false]],
		[19, [true, true, false]],
		[20, [true, true, true]],
		[25, [true, true, true]],
	])("enables presets that fit %i usable tracks", (usable, enabled) => {
		expect(presetOptions(usable)).toEqual(
			ROUND_PRESETS.map((rounds, i) => ({ rounds, enabled: enabled[i] })),
		);
	});
});

describe("pickRounds", () => {
	it.each([
		[20, 12, 10],
		[5, 40, 5],
		[10, 10, 10],
		[7, 40, 20],
		[7, 12, 10],
		[20, 5, 5],
	])("pickRounds(%i, %i) -> %i", (chosen, usable, expected) => {
		expect(pickRounds(chosen, usable)).toBe(expected);
	});

	it("throws RangeError when no preset fits", () => {
		expect(() => pickRounds(10, 4)).toThrow(RangeError);
	});
});
