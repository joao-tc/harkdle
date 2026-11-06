import { describe, expect, it } from "vitest";
import { createRng, shuffle } from "./rng";

function take(seed: number, n: number): number[] {
	const rng = createRng(seed);
	return Array.from({ length: n }, () => rng());
}

const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("createRng", () => {
	it("gives the same first 20 values for the same seed", () => {
		expect(take(42, 20)).toEqual(take(42, 20));
	});

	it.each([
		[1, 2],
		[0, 1],
		[42, 43],
	])("gives different sequences for seeds %i and %i", (a, b) => {
		expect(take(a, 20)).not.toEqual(take(b, 20));
	});

	it.each([0, 1, 42, 2 ** 32 - 1, -7])(
		"keeps values in [0, 1) for seed %i",
		(seed) => {
			for (const value of take(seed, 1000)) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThan(1);
			}
		},
	);
});

describe("shuffle", () => {
	it("returns a permutation of the input", () => {
		const result = shuffle(ONE_TO_TEN, createRng(7));
		expect([...result].sort((a, b) => a - b)).toEqual(ONE_TO_TEN);
	});

	it("does not mutate its input and returns a new array", () => {
		const input = [...ONE_TO_TEN];
		const result = shuffle(input, createRng(7));
		expect(input).toEqual(ONE_TO_TEN);
		expect(result).not.toBe(input);
	});

	it.each([[[]], [[1]]])("returns a copy of %j unchanged", (items) => {
		expect(shuffle(items, createRng(1))).toEqual(items);
	});

	it("gives the same order for the same seed", () => {
		expect(shuffle(ONE_TO_TEN, createRng(99))).toEqual(
			shuffle(ONE_TO_TEN, createRng(99)),
		);
	});

	it("pins the order for a fixed seed", () => {
		expect(shuffle(ONE_TO_TEN, createRng(12345))).toEqual([
			7, 5, 9, 1, 2, 8, 6, 4, 3, 10,
		]);
	});

	it("reaches all 6 orders of [0, 1, 2] roughly uniformly", () => {
		const rng = createRng(2024);
		const counts = new Map<string, number>();
		for (let i = 0; i < 1000; i++) {
			const key = shuffle([0, 1, 2], rng).join(",");
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		expect(counts.size).toBe(6);
		for (const count of counts.values()) {
			expect(count).toBeGreaterThanOrEqual(100);
			expect(count).toBeLessThanOrEqual(240);
		}
	});
});
