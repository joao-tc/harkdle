import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import { createRng, type Rng } from "@/game/rng";
import {
	CLASSIC_START,
	canReroll,
	drawReroll,
	drawStart,
	type RoundStart,
	type StartWindow,
	startWindow,
} from "@/game/start";

const D = DEFAULT_CONFIG.rerollMinDistanceMs;
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

const throwingRng: Rng = () => {
	throw new Error("rng must not be called");
};

function at(startMs: number, window: StartWindow): RoundStart {
	return { startMs, window };
}

describe("CLASSIC_START", () => {
	it("is the start at 0 with no window", () => {
		expect(CLASSIC_START).toEqual({ startMs: 0, window: null });
	});
});

describe("startWindow", () => {
	it("is null just under 20 000 ms", () => {
		expect(startWindow(19999, DEFAULT_CONFIG)).toBeNull();
	});

	it("is a single point at 20 000 ms", () => {
		expect(startWindow(20000, DEFAULT_CONFIG)).toEqual({
			minMs: 2000,
			maxMs: 2000,
		});
	});

	it("rounds the 10% lower bound up", () => {
		expect(startWindow(20001, DEFAULT_CONFIG)).toEqual({
			minMs: 2001,
			maxMs: 2001,
		});
	});

	it("does not round up on float error in the 10% product", () => {
		const config = { ...DEFAULT_CONFIG, startTailMs: 0 };
		expect(startWindow(70, config)).toEqual({ minMs: 7, maxMs: 70 });
	});

	it("is null for a short track", () => {
		expect(startWindow(5000, DEFAULT_CONFIG)).toBeNull();
		expect(startWindow(0, DEFAULT_CONFIG)).toBeNull();
	});

	it("spans [10% of the length, length - 18 000] above that", () => {
		expect(startWindow(200000, DEFAULT_CONFIG)).toEqual({
			minMs: 20000,
			maxMs: 182000,
		});
	});
});

describe("drawStart", () => {
	it("returns CLASSIC_START for a null window without calling the rng", () => {
		expect(drawStart(19999, throwingRng, DEFAULT_CONFIG)).toBe(CLASSIC_START);
	});

	it("returns the single point of a one-point window", () => {
		const result = drawStart(20000, createRng(1), DEFAULT_CONFIG);
		expect(result.startMs).toBe(2000);
		expect(result.window).toEqual({ minMs: 2000, maxMs: 2000 });
	});

	it("always lands on an integer inside the window", () => {
		for (const len of [20000, 20001, 45000, 215000, 600000]) {
			const window = startWindow(len, DEFAULT_CONFIG) as StartWindow;
			for (const seed of SEEDS) {
				const { startMs, window: w } = drawStart(
					len,
					createRng(seed),
					DEFAULT_CONFIG,
				);
				expect(Number.isInteger(startMs)).toBe(true);
				expect(startMs).toBeGreaterThanOrEqual(window.minMs);
				expect(startMs).toBeLessThanOrEqual(window.maxMs);
				expect(w).toEqual(window);
			}
		}
	});

	it("reaches both ends of the window at the extreme draws", () => {
		const window = startWindow(215000, DEFAULT_CONFIG) as StartWindow;
		expect(drawStart(215000, () => 0, DEFAULT_CONFIG).startMs).toBe(
			window.minMs,
		);
		expect(drawStart(215000, () => 0.9999999999, DEFAULT_CONFIG).startMs).toBe(
			window.maxMs,
		);
	});

	it("is repeatable for a seed and varies across seeds", () => {
		const a = drawStart(215000, createRng(42), DEFAULT_CONFIG);
		const b = drawStart(215000, createRng(42), DEFAULT_CONFIG);
		expect(a).toEqual(b);
		const values = new Set(
			SEEDS.map((s) => drawStart(215000, createRng(s), DEFAULT_CONFIG).startMs),
		);
		expect(values.size).toBeGreaterThan(100);
	});

	it("draws from the rng exactly once", () => {
		let calls = 0;
		const rng: Rng = () => {
			calls++;
			return 0.5;
		};
		drawStart(215000, rng, DEFAULT_CONFIG);
		expect(calls).toBe(1);
	});
});

describe("canReroll", () => {
	it("is false without a window", () => {
		expect(canReroll(CLASSIC_START, DEFAULT_CONFIG)).toBe(false);
	});

	it("is false for a one-point window", () => {
		const window = startWindow(20000, DEFAULT_CONFIG) as StartWindow;
		expect(canReroll(at(2000, window), DEFAULT_CONFIG)).toBe(false);
	});

	it("is false when the window is narrower than 8 s", () => {
		const window = startWindow(25000, DEFAULT_CONFIG) as StartWindow;
		for (let s = window.minMs; s <= window.maxMs; s++) {
			expect(canReroll(at(s, window), DEFAULT_CONFIG)).toBe(false);
		}
	});

	it("is false for a window just under 8 s wide, true at exactly 8 s", () => {
		const under = startWindow(28888, DEFAULT_CONFIG) as StartWindow;
		expect(under.maxMs - under.minMs).toBe(D - 1);
		expect(canReroll(at(under.minMs, under), DEFAULT_CONFIG)).toBe(false);
		expect(canReroll(at(under.maxMs, under), DEFAULT_CONFIG)).toBe(false);

		const exact = startWindow(28889, DEFAULT_CONFIG) as StartWindow;
		expect(exact.maxMs - exact.minMs).toBe(D);
		expect(canReroll(at(exact.minMs, exact), DEFAULT_CONFIG)).toBe(true);
		expect(canReroll(at(exact.maxMs, exact), DEFAULT_CONFIG)).toBe(true);
	});

	it("is true for a point exactly 8 s from a side and false 1 ms short", () => {
		const window: StartWindow = { minMs: 0, maxMs: 20000 };
		expect(canReroll(at(D, window), DEFAULT_CONFIG)).toBe(true);
		expect(canReroll(at(20000 - D, window), DEFAULT_CONFIG)).toBe(true);
		const narrow: StartWindow = { minMs: 0, maxMs: 2 * D - 2 };
		expect(canReroll(at(D - 1, narrow), DEFAULT_CONFIG)).toBe(false);
	});

	it("is true for a wide window from anywhere in it", () => {
		const window = startWindow(215000, DEFAULT_CONFIG) as StartWindow;
		for (const s of [window.minMs, 100000, window.maxMs]) {
			expect(canReroll(at(s, window), DEFAULT_CONFIG)).toBe(true);
		}
	});
});

describe("drawReroll", () => {
	it("returns null without a window", () => {
		expect(drawReroll(CLASSIC_START, throwingRng, DEFAULT_CONFIG)).toBeNull();
	});

	it("returns null, without calling the rng, when nothing is left", () => {
		const window = startWindow(25000, DEFAULT_CONFIG) as StartWindow;
		expect(
			drawReroll(at(window.minMs, window), throwingRng, DEFAULT_CONFIG),
		).toBeNull();
		const under = startWindow(28888, DEFAULT_CONFIG) as StartWindow;
		expect(
			drawReroll(at(under.minMs, under), throwingRng, DEFAULT_CONFIG),
		).toBeNull();
		expect(
			drawReroll(at(under.maxMs, under), throwingRng, DEFAULT_CONFIG),
		).toBeNull();
	});

	it("lands exactly 8 s away when only the edge point is left", () => {
		const window = startWindow(28889, DEFAULT_CONFIG) as StartWindow;
		const fromLow = drawReroll(
			at(window.minMs, window),
			createRng(1),
			DEFAULT_CONFIG,
		);
		expect(fromLow).toEqual({ startMs: window.maxMs, window });
		const fromHigh = drawReroll(
			at(window.maxMs, window),
			createRng(1),
			DEFAULT_CONFIG,
		);
		expect(fromHigh).toEqual({ startMs: window.minMs, window });
	});

	it("never lands within 8 s of the current start and stays in the window", () => {
		const window = startWindow(215000, DEFAULT_CONFIG) as StartWindow;
		const currents = [
			window.minMs,
			window.minMs + 3000,
			100000,
			window.maxMs - 5000,
			window.maxMs,
		];
		for (const cur of currents) {
			for (const seed of SEEDS) {
				const next = drawReroll(
					at(cur, window),
					createRng(seed),
					DEFAULT_CONFIG,
				) as RoundStart;
				expect(Number.isInteger(next.startMs)).toBe(true);
				expect(Math.abs(next.startMs - cur)).toBeGreaterThanOrEqual(D);
				expect(next.startMs).toBeGreaterThanOrEqual(window.minMs);
				expect(next.startMs).toBeLessThanOrEqual(window.maxMs);
				expect(next.window).toBe(window);
			}
		}
	});

	it("reaches both sides of a mid-window start over many seeds", () => {
		const window = startWindow(215000, DEFAULT_CONFIG) as StartWindow;
		const cur = 100000;
		const results = SEEDS.map(
			(seed) =>
				(
					drawReroll(
						at(cur, window),
						createRng(seed),
						DEFAULT_CONFIG,
					) as RoundStart
				).startMs,
		);
		expect(results.some((s) => s < cur)).toBe(true);
		expect(results.some((s) => s > cur)).toBe(true);
	});

	it("maps the extreme draws onto the first and last allowed points", () => {
		const window: StartWindow = { minMs: 0, maxMs: 30000 };
		const cur = 15000;
		expect(drawReroll(at(cur, window), () => 0, DEFAULT_CONFIG)?.startMs).toBe(
			0,
		);
		expect(
			drawReroll(at(cur, window), () => 0.9999999999, DEFAULT_CONFIG)?.startMs,
		).toBe(30000);
		// low part is [0, 7000] (7001 points); the next point is cur + d
		const total = 7001 + 7001;
		expect(
			drawReroll(at(cur, window), () => 7001 / total, DEFAULT_CONFIG)?.startMs,
		).toBe(cur + D);
		expect(
			drawReroll(at(cur, window), () => 7000 / total, DEFAULT_CONFIG)?.startMs,
		).toBe(cur - D);
	});

	it("is repeatable for a seed and draws from the rng exactly once", () => {
		const window = startWindow(215000, DEFAULT_CONFIG) as StartWindow;
		const a = drawReroll(at(50000, window), createRng(9), DEFAULT_CONFIG);
		const b = drawReroll(at(50000, window), createRng(9), DEFAULT_CONFIG);
		expect(a).toEqual(b);
		let calls = 0;
		drawReroll(
			at(50000, window),
			() => {
				calls++;
				return 0.5;
			},
			DEFAULT_CONFIG,
		);
		expect(calls).toBe(1);
	});
});
