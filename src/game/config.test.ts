import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import { STEPS } from "@/game/types";

describe("DEFAULT_CONFIG", () => {
	it("pins the per-step clip lengths", () => {
		expect(STEPS.map((s) => DEFAULT_CONFIG.clipMs[s])).toEqual([
			1000, 2000, 4000, 7000, 11000, 16000,
		]);
	});

	it("pins the per-step title points", () => {
		expect(STEPS.map((s) => DEFAULT_CONFIG.titlePoints[s])).toEqual([
			1000, 800, 600, 400, 250, 100,
		]);
	});

	it.each([
		["artistRatio", 0.3],
		["albumRatio", 0.5],
		["featuredArtistCredit", 0.5],
		["combo", 1.5],
		["comboAlbumSkipped", 2.0],
		["randomStartMultiplier", 1.25],
		["rerollPenalty", 0.1],
		["rerollPenaltyFloor", 0.5],
		["startMinRatio", 0.1],
		["startTailMs", 18000],
		["freeRerolls", 3],
		["rerollMinDistanceMs", 8000],
	] as const)("pins %s", (key, value) => {
		expect(DEFAULT_CONFIG[key]).toBe(value);
	});

	it.each([
		["clipMs", "increasing", 1],
		["titlePoints", "decreasing", -1],
	] as const)("keeps %s strictly %s across steps 1-6", (table, _dir, sign) => {
		const values = STEPS.map((s) => DEFAULT_CONFIG[table][s]);
		for (let i = 1; i < values.length; i++) {
			expect(
				((values[i] as number) - (values[i - 1] as number)) * sign,
			).toBeGreaterThan(0);
		}
	});
});
