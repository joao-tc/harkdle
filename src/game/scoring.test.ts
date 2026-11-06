import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import { fieldPoints, scoreRound } from "@/game/scoring";
import type { Lock, Locks, Step } from "@/game/types";

const full = (step: Step): Lock => ({ step, credit: "full" });
const featured = (step: Step): Lock => ({ step, credit: "featured" });

describe("fieldPoints", () => {
	it.each([
		[1, 1000, 300, 500],
		[2, 800, 240, 400],
		[3, 600, 180, 300],
		[4, 400, 120, 200],
		[5, 250, 75, 125],
		[6, 100, 30, 50],
	] as const)(
		"step %i: title %i, artist %i, album %i",
		(step, title, artist, album) => {
			expect(fieldPoints(DEFAULT_CONFIG, "title", full(step))).toBeCloseTo(
				title,
				10,
			);
			expect(fieldPoints(DEFAULT_CONFIG, "artist", full(step))).toBeCloseTo(
				artist,
				10,
			);
			expect(fieldPoints(DEFAULT_CONFIG, "album", full(step))).toBeCloseTo(
				album,
				10,
			);
		},
	);

	it.each([
		[1, 150],
		[5, 37.5],
		[6, 15],
	] as const)(
		"a featured artist lock at step %i gives half: %f",
		(step, expected) => {
			expect(fieldPoints(DEFAULT_CONFIG, "artist", featured(step))).toBeCloseTo(
				expected,
				10,
			);
		},
	);
});

describe("scoreRound maximums and hat trick", () => {
	const allAtOne: Locks = {
		title: full(1),
		artist: full(1),
		album: full(1),
	};

	it("a normal round fully locked at step 1 scores 2700", () => {
		const score = scoreRound(DEFAULT_CONFIG, allAtOne, false);
		expect(score.hatTrick).toBe(true);
		expect(score.combo).toBe(1.5);
		expect(score.total).toBe(2700);
	});

	it("an album-skipped round locked at step 1 scores 2600", () => {
		const score = scoreRound(
			DEFAULT_CONFIG,
			{ title: full(1), artist: full(1) },
			true,
		);
		expect(score.hatTrick).toBe(true);
		expect(score.combo).toBe(2);
		expect(score.total).toBe(2600);
	});

	it("a featured artist still counts toward the hat trick", () => {
		// (1000 + 150 + 500) x 1.5 = 2475
		const score = scoreRound(
			DEFAULT_CONFIG,
			{ title: full(1), artist: featured(1), album: full(1) },
			false,
		);
		expect(score.hatTrick).toBe(true);
		expect(score.combo).toBe(1.5);
		expect(score.total).toBe(2475);
	});

	it.each([
		["title", { artist: full(1), album: full(1) }, 800],
		["artist", { title: full(1), album: full(1) }, 1500],
		["album", { title: full(1), artist: full(1) }, 1300],
	] as const)("a missing %s gives no combo", (_missing, locks, total) => {
		const score = scoreRound(DEFAULT_CONFIG, locks, false);
		expect(score.hatTrick).toBe(false);
		expect(score.combo).toBe(1);
		expect(score.total).toBe(total);
	});

	it("a skipped-album round still needs title and artist", () => {
		const score = scoreRound(DEFAULT_CONFIG, { title: full(1) }, true);
		expect(score.hatTrick).toBe(false);
		expect(score.combo).toBe(1);
		expect(score.total).toBe(1000);
	});

	it("a stray album lock on a skipped-album round does not crash or count toward the hat trick", () => {
		const score = scoreRound(
			DEFAULT_CONFIG,
			{ title: full(1), album: full(1) },
			true,
		);
		expect(score.hatTrick).toBe(false);
		expect(score.total).toBe(1500);
	});

	it("artist and album locks without a title still score and have no combo", () => {
		const score = scoreRound(
			DEFAULT_CONFIG,
			{ artist: full(2), album: full(2) },
			false,
		);
		expect(score.hatTrick).toBe(false);
		expect(score.combo).toBe(1);
		expect(score.fields.title).toBeUndefined();
		expect(score.subtotal).toBeCloseTo(640, 10);
		expect(score.total).toBe(640);
	});

	it("has fields only for locked fields", () => {
		const score = scoreRound(DEFAULT_CONFIG, { title: full(3) }, false);
		expect(Object.keys(score.fields)).toEqual(["title"]);
		expect(score.fields.title).toBe(600);
		expect(score.subtotal).toBe(600);
	});

	it("scores 0 with no locks", () => {
		const score = scoreRound(DEFAULT_CONFIG, {}, false);
		expect(score.fields).toEqual({});
		expect(score.subtotal).toBe(0);
		expect(score.hatTrick).toBe(false);
		expect(score.total).toBe(0);
	});
});

describe("scoreRound modifiers", () => {
	it("random start multiplies by 1.25", () => {
		const score = scoreRound(DEFAULT_CONFIG, { title: full(1) }, false, {
			randomStart: true,
		});
		expect(score.modeMultiplier).toBeCloseTo(1.25, 10);
		expect(score.total).toBe(1250);
	});

	it("defaults to no mode or reroll adjustment", () => {
		const score = scoreRound(DEFAULT_CONFIG, { title: full(1) }, false);
		expect(score.modeMultiplier).toBe(1);
		expect(score.rerollMultiplier).toBe(1);
	});

	it.each([
		[0, 1, 1000],
		[1, 0.9, 900],
		[2, 0.8, 800],
		[5, 0.5, 500],
		[6, 0.5, 500],
		[10, 0.5, 500],
	] as const)(
		"%i paid rerolls: multiplier %f, total %i",
		(paidRerolls, multiplier, total) => {
			const score = scoreRound(DEFAULT_CONFIG, { title: full(1) }, false, {
				paidRerolls,
			});
			expect(score.rerollMultiplier).toBeCloseTo(multiplier, 10);
			expect(score.total).toBe(total);
		},
	);

	it("stacks combo, random start and rerolls", () => {
		// 1800 x 1.5 x 1.25 x 0.9 = 3037.5 -> 3038
		const score = scoreRound(
			DEFAULT_CONFIG,
			{ title: full(1), artist: full(1), album: full(1) },
			false,
			{ randomStart: true, paidRerolls: 1 },
		);
		expect(score.total).toBe(3038);
	});
});

describe("scoreRound rounding", () => {
	it("keeps a 37.5 field exact and rounds it up in the total", () => {
		const score = scoreRound(DEFAULT_CONFIG, { artist: featured(5) }, false);
		expect(score.fields.artist).toBeCloseTo(37.5, 10);
		expect(score.total).toBe(38);
	});

	it("rounds once at the end, not per field", () => {
		// 37.5 x 1.25 = 46.875 -> 47 (rounding the field first would give 38 x 1.25 = 47.5 -> 48)
		const score = scoreRound(DEFAULT_CONFIG, { artist: featured(5) }, false, {
			randomStart: true,
		});
		expect(score.total).toBe(47);
	});
});
