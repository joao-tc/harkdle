import { describe, expect, it } from "vitest";
import {
	createGame,
	type GameAction,
	type GameState,
	gameReducer,
	summarize,
} from "@/game/game";
import { createRng } from "@/game/rng";
import type { Guess, TimedTrack } from "@/game/types";

const BOHEMIAN: TimedTrack = {
	id: "bohemian",
	durationMs: 200_000,
	title: "Bohemian Rhapsody - Remastered 2011",
	artists: ["Queen"],
	album: { name: "A Night at the Opera", kind: "album" },
};
const DREAMS: TimedTrack = {
	id: "dreams",
	durationMs: 200_000,
	title: "Dreams",
	artists: ["Fleetwood Mac"],
	album: { name: "Rumours", kind: "album" },
};
const PRESSURE: TimedTrack = {
	id: "pressure",
	durationMs: 200_000,
	title: "Under Pressure - Remastered 2011",
	artists: ["Queen", "David Bowie"],
	album: { name: "Hot Space", kind: "album" },
};
const BLINDING: TimedTrack = {
	id: "blinding",
	durationMs: 200_000,
	title: "Blinding Lights",
	artists: ["The Weeknd"],
	album: { name: "Blinding Lights", kind: "single" },
};
const LUCKY: TimedTrack = {
	id: "lucky",
	durationMs: 200_000,
	title: "Get Lucky",
	artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
	album: { name: "Random Access Memories", kind: "album" },
};
const HOTEL: TimedTrack = {
	id: "hotel",
	durationMs: 200_000,
	title: "Hotel California - 2013 Remaster",
	artists: ["Eagles"],
	album: { name: "Hotel California", kind: "album" },
};
const NEVERMIND: TimedTrack = {
	id: "nevermind",
	durationMs: 200_000,
	title: "Smells Like Teen Spirit",
	artists: ["Nirvana"],
	album: { name: "Nevermind", kind: "album" },
};

const TRACKS = [BOHEMIAN, DREAMS, PRESSURE, BLINDING, LUCKY, HOTEL, NEVERMIND];
const SEED = 100;
const ROUNDS = 5;

const SUBMIT = (guess: Guess): GameAction => ({ type: "submit", guess });
const SKIP: GameAction = { type: "skip" };
const GIVE_UP: GameAction = { type: "giveUp" };
const NEXT: GameAction = { type: "next" };
const TRACK_FAILED: GameAction = { type: "trackFailed" };
const REROLL: GameAction = { type: "reroll" };

function start(seed: number): GameState {
	return createGame({ tracks: TRACKS, rounds: ROUNDS, rng: createRng(seed) });
}

function run(state: GameState, ...actions: GameAction[]): GameState {
	return actions.reduce(gameReducer, state);
}

// Seed 100 shuffles to: bohemian, lucky, hotel, blinding, pressure, nevermind, dreams.
// Queue positions 0..5 are used (5 played rounds + 1 failed track); dreams is spare.
const QUEUE_IDS = [
	"bohemian",
	"lucky",
	"hotel",
	"blinding",
	"pressure",
	"nevermind",
	"dreams",
];

function play(seed: number): GameState {
	let game = start(seed);

	// Round 1, Bohemian Rhapsody: perfect hat trick at step 1.
	game = run(
		game,
		SUBMIT({
			title: "Bohemian Rhapsody",
			artist: "Queen",
			album: "A Night at the Opera",
		}),
		NEXT,
	);

	// Round 2, Get Lucky: step 1 mixed submission (title right, featured artist right,
	// album wrong) locks title and artist at 1 and burns step 1; the album
	// completes the round at step 2.
	game = run(
		game,
		SUBMIT({
			title: "Get Lucky",
			artist: "Pharrell Williams",
			album: "Discovery",
		}),
		SUBMIT({ album: "Random Access Memories" }),
		NEXT,
	);

	// Hotel California fails to load: it is replaced by the next queue track.
	game = run(game, TRACK_FAILED);

	// Round 3, Blinding Lights (single, album skipped): skip step 1, then
	// title and artist together at step 2.
	game = run(
		game,
		SKIP,
		SUBMIT({ title: "Blinding Lights", artist: "The Weeknd" }),
		NEXT,
	);

	// Round 4, Under Pressure: artist locks at step 1 without consuming it,
	// five skips reach step 6, where a right title and a wrong album run out
	// the steps.
	game = run(
		game,
		SUBMIT({ artist: "Queen" }),
		SKIP,
		SKIP,
		SKIP,
		SKIP,
		SKIP,
		SUBMIT({ title: "Under Pressure", album: "Greatest Hits" }),
		NEXT,
	);

	// Round 5, Smells Like Teen Spirit: two skips, album locks at step 3, then the
	// player gives up.
	return run(game, SKIP, SKIP, SUBMIT({ album: "Nevermind" }), GIVE_UP, NEXT);
}

describe("seeded full-game replay", () => {
	it("shuffles seed 100 into a known queue", () => {
		expect(start(SEED).queue.map((track) => track.id)).toEqual(QUEUE_IDS);
	});

	it("plays 5 rounds plus one failed track, never touching the spare", () => {
		const game = play(SEED);
		expect(game.phase).toBe("finished");
		expect(game.cursor).toBe(5);
		expect(game.results.map((result) => result.track.id)).toEqual([
			"bohemian",
			"lucky",
			"blinding",
			"pressure",
			"nevermind",
		]);
	});

	it("ends each round the expected way", () => {
		expect(play(SEED).results.map((result) => result.endedBy)).toEqual([
			"complete",
			"complete",
			"complete",
			"out-of-steps",
			"gave-up",
		]);
	});

	it("scores each round by hand", () => {
		const results = play(SEED).results;
		// R1: (1000 + 300 + 500) x 1.5 = 1800 x 1.5 = 2700
		// R2: title@1 1000 + featured artist@1 300 x 0.5 = 150 + album@2 400
		//     = 1550 x 1.5 = 2325
		// R3: single, album skipped: title@2 800 + artist@2 240 = 1040 x 2.0 = 2080
		// R4: artist@1 300 + title@6 100 = 400, album missing: no combo, x 1 = 400
		// R5: album@3 300 only: x 1 = 300
		expect(results.map((result) => result.score.total)).toEqual([
			2700, 2325, 2080, 400, 300,
		]);
		expect(results.map((result) => result.score.hatTrick)).toEqual([
			true,
			true,
			true,
			false,
			false,
		]);
		expect(results.map((result) => result.albumSkipped)).toEqual([
			false,
			false,
			true,
			false,
			false,
		]);
	});

	it("records the step and credit each field was locked at", () => {
		const locks = play(SEED).results.map((result) => result.locks);
		expect(locks).toEqual([
			{
				title: { step: 1, credit: "full" },
				artist: { step: 1, credit: "full" },
				album: { step: 1, credit: "full" },
			},
			{
				title: { step: 1, credit: "full" },
				artist: { step: 1, credit: "featured" },
				album: { step: 2, credit: "full" },
			},
			{
				title: { step: 2, credit: "full" },
				artist: { step: 2, credit: "full" },
			},
			{
				title: { step: 6, credit: "full" },
				artist: { step: 1, credit: "full" },
			},
			{ album: { step: 3, credit: "full" } },
		]);
	});

	it("summarizes the game by hand", () => {
		// Score: 2700 + 2325 + 2080 + 400 + 300 = 7805
		// Title steps: R1 1, R2 1, R3 2, R4 6; R5 never locked the title (missed)
		expect(summarize(play(SEED))).toEqual({
			score: 7805,
			stepHistogram: { 1: 2, 2: 1, 3: 0, 4: 0, 5: 0, 6: 1 },
			missed: 1,
			hatTricks: 3,
			roundsPlayed: 5,
		});
	});

	it("replays to a deep-equal state for the same seed and actions", () => {
		const { rng: rngA, ...a } = play(SEED);
		const { rng: rngB, ...b } = play(SEED);
		expect(a).toEqual(b);
		expect(rngA()).toBe(rngB());
	});

	it("replays a Random game with rerolls to the same starts", () => {
		const playRandom = () => {
			let game = createGame({
				tracks: TRACKS,
				rounds: ROUNDS,
				rng: createRng(SEED),
				startMode: "random",
			});
			const starts: number[] = [];
			const note = () => {
				if (game.phase === "round") starts.push(game.round.startMs);
			};
			note();
			game = run(game, REROLL, REROLL, REROLL, REROLL);
			note();
			game = run(game, GIVE_UP, NEXT);
			note();
			game = run(game, REROLL, TRACK_FAILED);
			note();
			game = run(game, GIVE_UP, NEXT);
			note();
			return { game, starts };
		};
		const a = playRandom();
		const b = playRandom();
		expect(a.starts).toEqual(b.starts);
		expect(a.game.rerollsUsed).toBe(5);
		const { rng: _a, ...stateA } = a.game;
		const { rng: _b, ...stateB } = b.game;
		expect(stateA).toEqual(stateB);
	});

	it("shuffles a different seed into a different queue", () => {
		const other = start(SEED + 1).queue.map((track) => track.id);
		expect(other).not.toEqual(QUEUE_IDS);
		expect([...other].sort()).toEqual([...QUEUE_IDS].sort());
	});
});
