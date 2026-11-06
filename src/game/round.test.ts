import { describe, expect, it } from "vitest";
import {
	type RoundAction,
	type RoundState,
	requiredFields,
	roundReducer,
	startRound,
} from "@/game/round";
import type { Guess, Step, Track } from "@/game/types";

function track(overrides: Partial<Track> = {}): Track {
	return {
		id: "t1",
		title: "Señorita",
		artists: ["Shawn Mendes", "Camila Cabello"],
		album: { name: "Shawn Mendes (Deluxe Edition)", kind: "album" },
		...overrides,
	};
}

const SINGLE = track({
	title: "Blinding Lights",
	artists: ["The Weeknd"],
	album: { name: "Blinding Lights", kind: "single" },
});

const RIGHT: Guess = {
	title: "Señorita",
	artist: "Shawn Mendes",
	album: "Shawn Mendes (Deluxe Edition)",
};

function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}

function at(step: Step, overrides: Partial<RoundState> = {}): RoundState {
	return { ...startRound(track()), step, ...overrides };
}

function submit(state: RoundState, guess: Guess): RoundState {
	return roundReducer(state, { type: "submit", guess });
}

describe("startRound", () => {
	it("starts active at step 1 with no locks", () => {
		const t = track();
		expect(startRound(t)).toEqual({
			track: t,
			albumSkipped: false,
			step: 1,
			locks: {},
			ended: null,
		});
	});

	it.each([
		["album", false],
		["single", true],
		["compilation", true],
	] as const)("album kind %s -> albumSkipped %s", (kind, skipped) => {
		const t = track({ album: { name: "X", kind } });
		expect(startRound(t).albumSkipped).toBe(skipped);
	});
});

describe("requiredFields", () => {
	it("includes album for an album track", () => {
		expect(requiredFields(startRound(track()))).toEqual([
			"title",
			"artist",
			"album",
		]);
	});

	it("omits album when skipped", () => {
		expect(requiredFields(startRound(SINGLE))).toEqual(["title", "artist"]);
	});
});

describe("submit: completing", () => {
	it.each([1, 3, 6] as const)("all correct at step %i completes there", (n) => {
		const next = submit(at(n), RIGHT);
		expect(next.ended).toBe("complete");
		expect(next.step).toBe(n);
		expect(next.locks).toEqual({
			title: { step: n, credit: "full" },
			artist: { step: n, credit: "full" },
			album: { step: n, credit: "full" },
		});
	});

	it("completes a skipped-album round with title and artist only", () => {
		const next = submit(startRound(SINGLE), {
			title: "blinding lights",
			artist: "the weeknd",
		});
		expect(next.ended).toBe("complete");
		expect(next.locks).toEqual({
			title: { step: 1, credit: "full" },
			artist: { step: 1, credit: "full" },
		});
	});

	it("locks a later correct field at the step it was guessed at", () => {
		const first = submit(at(1), { title: "Señorita", artist: "Taylor Swift" });
		const second = submit(
			{ ...first, step: 3 },
			{ artist: "Shawn Mendes", album: "Shawn Mendes" },
		);
		expect(second.ended).toBe("complete");
		expect(second.locks).toEqual({
			title: { step: 1, credit: "full" },
			artist: { step: 3, credit: "full" },
			album: { step: 3, credit: "full" },
		});
	});
});

describe("submit: wrong guesses", () => {
	it("wrong title alone advances one step without locks", () => {
		const next = submit(at(2), { title: "Havana" });
		expect(next).toEqual(at(3));
	});

	it("locks the right field at the current step and advances once on mixed", () => {
		const next = submit(at(2), { title: "Señorita", artist: "Taylor Swift" });
		expect(next.step).toBe(3);
		expect(next.ended).toBeNull();
		expect(next.locks).toEqual({ title: { step: 2, credit: "full" } });
	});

	it("advances once even when two fields are wrong", () => {
		const next = submit(at(1), { title: "Havana", artist: "Taylor Swift" });
		expect(next.step).toBe(2);
		expect(next.locks).toEqual({});
	});

	it("advances once when all three fields are wrong", () => {
		const next = submit(at(1), {
			title: "Havana",
			artist: "Taylor Swift",
			album: "Lover",
		});
		expect(next.step).toBe(2);
	});

	it("ends out-of-steps on a wrong submission at the last step, keeping new locks", () => {
		const next = submit(at(6), { title: "Señorita", artist: "Taylor Swift" });
		expect(next.ended).toBe("out-of-steps");
		expect(next.step).toBe(6);
		expect(next.locks).toEqual({ title: { step: 6, credit: "full" } });
	});
});

describe("submit: featured artist", () => {
	it("locks featured credit without advancing", () => {
		const next = submit(at(2), { artist: "Camila Cabello" });
		expect(next.step).toBe(2);
		expect(next.ended).toBeNull();
		expect(next.locks).toEqual({ artist: { step: 2, credit: "featured" } });
	});

	it("ignores a later main-artist guess once the field is locked", () => {
		const featured = submit(at(2), { artist: "Camila Cabello" });
		const later = { ...featured, step: 4 as Step };
		expect(submit(later, { artist: "Shawn Mendes" })).toBe(later);
	});

	it("advances once when featured is paired with a wrong title", () => {
		const next = submit(at(1), { title: "Havana", artist: "Camila Cabello" });
		expect(next.step).toBe(2);
		expect(next.locks).toEqual({ artist: { step: 1, credit: "featured" } });
	});

	it("completes with a featured artist credit when the rest is right", () => {
		const next = submit(at(1), {
			title: "Señorita",
			artist: "Camila Cabello",
			album: "Shawn Mendes",
		});
		expect(next.ended).toBe("complete");
		expect(next.locks.artist).toEqual({ step: 1, credit: "featured" });
	});
});

describe("skip", () => {
	it("advances one step at a time from 1 to 6", () => {
		let state = startRound(track());
		const seen: Step[] = [];
		for (let i = 0; i < 5; i++) {
			state = roundReducer(state, { type: "skip" });
			seen.push(state.step);
		}
		expect(seen).toEqual([2, 3, 4, 5, 6]);
		expect(state.ended).toBeNull();
	});

	it("ends out-of-steps at the last step and keeps locks", () => {
		const locks = { title: { step: 2, credit: "full" } } as const;
		const next = roundReducer(at(6, { locks }), { type: "skip" });
		expect(next.ended).toBe("out-of-steps");
		expect(next.step).toBe(6);
		expect(next.locks).toEqual(locks);
	});
});

describe("giveUp", () => {
	it("ends gave-up, keeping locks and step", () => {
		const locks = { title: { step: 2, credit: "full" } } as const;
		const next = roundReducer(at(4, { locks }), { type: "giveUp" });
		expect(next.ended).toBe("gave-up");
		expect(next.step).toBe(4);
		expect(next.locks).toEqual(locks);
	});
});

describe("degenerate input returns the same state", () => {
	const locked = at(3, {
		locks: {
			title: { step: 1, credit: "full" },
			artist: { step: 2, credit: "full" },
			album: { step: 3, credit: "full" },
		},
	});

	it.each<[string, RoundState, Guess]>([
		["empty guess", at(1), {}],
		[
			"whitespace-only fields",
			at(1),
			{ title: " ", artist: "\t", album: "\n" },
		],
		[
			"only locked fields",
			at(2, { locks: { title: { step: 1, credit: "full" } } }),
			{ title: "Havana" },
		],
		["all fields locked", { ...locked, ended: null }, RIGHT],
		[
			"album guess on a skipped-album round",
			startRound(SINGLE),
			{ album: "X" },
		],
	])("submit: %s", (_name, state, guess) => {
		expect(submit(state, guess)).toBe(state);
	});

	it.each<[string, RoundAction]>([
		["submit", { type: "submit", guess: RIGHT }],
		["skip", { type: "skip" }],
		["giveUp", { type: "giveUp" }],
	])("%s when the round has ended", (_name, action) => {
		for (const ended of ["complete", "out-of-steps", "gave-up"] as const) {
			const state = at(3, { ended });
			expect(roundReducer(state, action)).toBe(state);
		}
	});
});

describe("purity", () => {
	it.each<[string, RoundAction]>([
		["right submit", { type: "submit", guess: RIGHT }],
		["wrong submit", { type: "submit", guess: { title: "Havana" } }],
		[
			"featured submit",
			{ type: "submit", guess: { artist: "Camila Cabello" } },
		],
		["skip", { type: "skip" }],
		["giveUp", { type: "giveUp" }],
	])("%s does not mutate a deep-frozen state", (_name, action) => {
		const state = deepFreeze(at(6));
		const snapshot = structuredClone(state);
		expect(() => roundReducer(state, action)).not.toThrow();
		expect(state).toEqual(snapshot);
	});

	it("keeps state JSON-serializable", () => {
		const next = submit(at(2), { title: "Señorita", artist: "Taylor Swift" });
		expect(JSON.parse(JSON.stringify(next))).toEqual(next);
	});
});
