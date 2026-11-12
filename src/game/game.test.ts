import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import {
	createGame,
	type GameAction,
	type GameState,
	gameReducer,
	rerollStatus,
	summarize,
} from "@/game/game";
import { createRng, shuffle } from "@/game/rng";
import type { RoundState } from "@/game/round";
import { drawReroll, drawStart } from "@/game/start";
import type { Guess, StartMode, TimedTrack } from "@/game/types";

const LONG_MS = 200_000; // start window 20 s to 182 s
const NO_SPOT_MS = 25_000; // window 2.5 s to 7 s: nothing is 8 s away from a start
const SHORT_MS = 15_000; // too short for any window

function album(n: number, durationMs = LONG_MS): TimedTrack {
	return {
		durationMs,
		id: `album-${n}`,
		title: `Song Number ${n}`,
		artists: [`Artist ${n}`, "Guest Singer"],
		album: { name: `Album Number ${n}`, kind: "album" },
	};
}

function single(n: number): TimedTrack {
	return {
		durationMs: LONG_MS,
		id: `single-${n}`,
		title: `Single Number ${n}`,
		artists: [`Solo ${n}`],
		album: { name: `Single Number ${n}`, kind: "single" },
	};
}

const ALBUMS = [1, 2, 3, 4, 5].map((n) => album(n));
const SINGLES = [1, 2, 3].map(single);

const SUBMIT = (guess: Guess): GameAction => ({ type: "submit", guess });
const SKIP: GameAction = { type: "skip" };
const GIVE_UP: GameAction = { type: "giveUp" };
const NEXT: GameAction = { type: "next" };
const TRACK_FAILED: GameAction = { type: "trackFailed" };
const REROLL: GameAction = { type: "reroll" };

function start(
	tracks: readonly TimedTrack[] = ALBUMS,
	rounds = 3,
	seed = 42,
	startMode: StartMode = "classic",
): GameState {
	return createGame({ tracks, rounds, rng: createRng(seed), startMode });
}

function startRandom(durationMs = LONG_MS, rounds = 3, seed = 42): GameState {
	const tracks = [1, 2, 3, 4, 5].map((n) => album(n, durationMs));
	return start(tracks, rounds, seed, "random");
}

// The rng is a closure: it cannot round-trip through JSON or compare with toEqual.
function plain(state: GameState): Omit<GameState, "rng"> {
	const { rng: _rng, ...rest } = state;
	return rest;
}

function roundOf(state: GameState): RoundState {
	if (state.phase !== "round") throw new Error("not in a round");
	return state.round;
}

function run(state: GameState, ...actions: GameAction[]): GameState {
	return actions.reduce(gameReducer, state);
}

function current(state: GameState): TimedTrack {
	const track = state.queue[state.cursor];
	if (!track) throw new Error("no current track");
	return track;
}

function perfect(state: GameState): GameAction {
	const track = current(state);
	return SUBMIT({
		title: track.title,
		artist: track.artists[0],
		album: track.album.name,
	});
}

function expectSerializable(state: GameState) {
	expect(JSON.parse(JSON.stringify(state))).toEqual(plain(state));
	expect("round" in state).toBe(state.phase === "round");
}

describe("createGame", () => {
	it("shuffles into a permutation without mutating the input", () => {
		const tracks = [...ALBUMS];
		const game = start(tracks, 3);
		expect(tracks).toEqual(ALBUMS);
		expect(game.queue).toHaveLength(ALBUMS.length);
		expect(new Set(game.queue.map((t) => t.id))).toEqual(
			new Set(ALBUMS.map((t) => t.id)),
		);
	});

	it("is deterministic per seed and varies across seeds", () => {
		const ids = (seed: number) => start(ALBUMS, 3, seed).queue.map((t) => t.id);
		expect(ids(7)).toEqual(ids(7));
		const others = [1, 2, 3, 4, 5, 6].map(ids);
		expect(others.some((other) => other.join() !== ids(7).join())).toBe(true);
	});

	it("starts round 1 on queue[0] at step 1", () => {
		const game = start();
		expect(game).toEqual({
			config: expect.objectContaining({ combo: 1.5 }),
			rounds: 3,
			queue: game.queue,
			cursor: 0,
			results: [],
			startMode: "classic",
			rerollsUsed: 0,
			rng: expect.any(Function),
			phase: "round",
			round: {
				track: game.queue[0],
				albumSkipped: false,
				step: 1,
				locks: {},
				ended: null,
				startMs: 0,
				window: null,
				paidRerolls: 0,
			},
		});
	});

	it.each([
		["zero", 0],
		["negative", -1],
		["above the track count", ALBUMS.length + 1],
		["fractional", 1.5],
		["NaN", Number.NaN],
	])("throws RangeError for rounds %s", (_name, rounds) => {
		expect(() => start(ALBUMS, rounds)).toThrow(RangeError);
	});

	it("allows rounds equal to the track count", () => {
		expect(start(ALBUMS, ALBUMS.length).rounds).toBe(ALBUMS.length);
	});
});

describe("round endings", () => {
	it.each<[string, (game: GameState) => GameAction[], string, number]>([
		["perfect at step 1 (album track)", (g) => [perfect(g)], "complete", 2700],
		[
			"skip at step 6",
			() => [SKIP, SKIP, SKIP, SKIP, SKIP, SKIP],
			"out-of-steps",
			0,
		],
		["give up with nothing locked", () => [GIVE_UP], "gave-up", 0],
	])("%s appends one result and reveals", (_name, actions, endedBy, total) => {
		const game = start();
		const track = current(game);
		const next = run(game, ...actions(game));
		expect(next.phase).toBe("reveal");
		expect(next.results).toEqual([
			expect.objectContaining({
				track,
				albumSkipped: false,
				endedBy,
				score: expect.objectContaining({ total }),
			}),
		]);
		expectSerializable(next);
	});

	it("scores a single with the album-skipped combo", () => {
		const game = start(SINGLES, 2);
		const track = current(game);
		const next = run(
			game,
			SUBMIT({ title: track.title, artist: track.artists[0] }),
		);
		expect(next.results[0]).toMatchObject({
			albumSkipped: true,
			score: { total: 2600, hatTrick: true },
		});
	});

	it("keeps an active round after a wrong guess or skip", () => {
		const game = start();
		const skipped = run(game, SKIP);
		expect(skipped.phase).toBe("round");
		expect(skipped.results).toEqual([]);
		expect(skipped.phase === "round" && skipped.round.step).toBe(2);
		expectSerializable(skipped);
	});

	it("returns the same state for a degenerate round action", () => {
		const game = start();
		expect(gameReducer(game, SUBMIT({}))).toBe(game);
	});

	it("ignores round actions and trackFailed during the reveal", () => {
		const reveal = run(start(), GIVE_UP);
		for (const action of [
			SKIP,
			GIVE_UP,
			SUBMIT({ title: "x" }),
			TRACK_FAILED,
		]) {
			expect(gameReducer(reveal, action)).toBe(reveal);
		}
	});
});

describe("next", () => {
	it("starts the next queue track at step 1", () => {
		const reveal = run(start(), GIVE_UP);
		const next = gameReducer(reveal, NEXT);
		expect(next).toMatchObject({
			phase: "round",
			cursor: 1,
			results: reveal.results,
			round: { track: reveal.queue[1], step: 1, locks: {}, ended: null },
		});
		expectSerializable(next);
	});

	it("finishes after the X-th round", () => {
		const done = run(start(ALBUMS, 2), GIVE_UP, NEXT, GIVE_UP, NEXT);
		expect(done.phase).toBe("finished");
		expect(done.results).toHaveLength(2);
		expectSerializable(done);
	});

	it("is ignored in round and finished", () => {
		const game = start();
		expect(gameReducer(game, NEXT)).toBe(game);
		const done = run(start(ALBUMS, 1), GIVE_UP, NEXT);
		expect(gameReducer(done, NEXT)).toBe(done);
		for (const action of [SKIP, GIVE_UP, TRACK_FAILED]) {
			expect(gameReducer(done, action)).toBe(done);
		}
	});

	it("never repeats a track across a full game", () => {
		let game = start(ALBUMS, ALBUMS.length, 5);
		while (game.phase !== "finished") {
			game = run(game, GIVE_UP, NEXT);
		}
		const ids = game.results.map((r) => r.track.id);
		expect(ids).toHaveLength(ALBUMS.length);
		expect(new Set(ids).size).toBe(ALBUMS.length);
	});

	it("finishes early when the queue runs out before X rounds", () => {
		const game = start(ALBUMS.slice(0, 2), 2);
		const done = run(game, TRACK_FAILED, GIVE_UP, NEXT);
		expect(done.phase).toBe("finished");
		expect(done.results).toHaveLength(1);
		expectSerializable(done);
	});
});

describe("trackFailed", () => {
	it("discards the round and starts the next track at step 1", () => {
		const game = start();
		const next = run(game, SKIP, SKIP, TRACK_FAILED);
		expect(next).toMatchObject({
			phase: "round",
			cursor: 1,
			results: [],
			round: { track: game.queue[1], step: 1, locks: {}, ended: null },
		});
		expectSerializable(next);
	});

	it("finishes early once the queue is exhausted", () => {
		const game = start(ALBUMS.slice(0, 2), 2);
		const done = run(game, TRACK_FAILED, TRACK_FAILED);
		expect(done.phase).toBe("finished");
		expect(done.results.length).toBeLessThan(done.rounds);
		expectSerializable(done);
	});
});

describe("summarize", () => {
	it("is all zeros for an empty game", () => {
		expect(summarize(start())).toEqual({
			score: 0,
			stepHistogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
			missed: 0,
			hatTricks: 0,
			roundsPlayed: 0,
		});
	});

	it("totals scores and counts by Title step, misses and hat tricks", () => {
		let game = start(ALBUMS, 4);
		game = run(game, perfect(game), NEXT); // 2700, title at step 1, hat trick
		const title = current(game).title;
		game = run(game, SKIP, SKIP, SUBMIT({ title }), GIVE_UP, NEXT); // 600, step 3
		game = run(game, GIVE_UP, NEXT); // 0, missed
		const artist = current(game).artists[0];
		game = run(game, SUBMIT({ artist }), GIVE_UP); // 300, artist only: missed
		expect(game.phase).toBe("reveal");
		expect(summarize(game)).toEqual({
			score: 3600,
			stepHistogram: { 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0 },
			missed: 2,
			hatTricks: 1,
			roundsPlayed: 4,
		});
	});
});

describe("start points", () => {
	it("draws nothing from the rng after the shuffle in Classic", () => {
		const used = createRng(5);
		const bare = createRng(5);
		createGame({ tracks: ALBUMS, rounds: 3, rng: used });
		shuffle(ALBUMS, bare);
		expect(used()).toBe(bare());
	});

	it("keeps Classic at 0:00 with no window across next and trackFailed", () => {
		let game = start(ALBUMS, 3, 9);
		for (const action of [GIVE_UP, NEXT, TRACK_FAILED, GIVE_UP, NEXT]) {
			game = run(game, action);
			if (game.phase === "round") {
				expect(game.round).toMatchObject({ startMs: 0, window: null });
			}
		}
		expect(game.rerollsUsed).toBe(0);
	});

	it("draws round 1's start right after the shuffle in Random", () => {
		const used = createRng(5);
		const bare = createRng(5);
		const game = createGame({
			tracks: ALBUMS,
			rounds: 3,
			rng: used,
			startMode: "random",
		});
		const queue = shuffle(ALBUMS, bare);
		const expected = drawStart(LONG_MS, bare, DEFAULT_CONFIG);
		expect(game.queue).toEqual(queue);
		expect(roundOf(game)).toMatchObject(expected);
		expect(used()).toBe(bare());
	});

	it("starts every round of a Random game inside its window", () => {
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const first = startRandom(LONG_MS, 3, seed);
			const afterNext = run(first, GIVE_UP, NEXT);
			const afterFailed = run(afterNext, TRACK_FAILED);
			for (const game of [first, afterNext, afterFailed]) {
				const round = roundOf(game);
				expect(round.window).toEqual({ minMs: 20_000, maxMs: 182_000 });
				expect(round.startMs).toBeGreaterThanOrEqual(20_000);
				expect(round.startMs).toBeLessThanOrEqual(182_000);
			}
		}
	});

	it("starts a short track at 0 with no window and no reroll", () => {
		const game = startRandom(SHORT_MS);
		expect(roundOf(game)).toMatchObject({ startMs: 0, window: null });
		expect(rerollStatus(game).available).toBe(false);
		expect(gameReducer(game, REROLL)).toBe(game);
	});

	it("still gives a 0:00 fallback round the Random multiplier", () => {
		const game = startRandom(SHORT_MS);
		const done = run(game, perfect(game));
		expect(done.results[0]?.score).toMatchObject({
			modeMultiplier: 1.25,
			total: 3375,
		});
	});

	it("scores a Random round at 1.25 and leaves Classic at 1", () => {
		const random = startRandom();
		const classic = start();
		expect(run(random, perfect(random)).results[0]?.score.total).toBe(3375);
		expect(run(classic, perfect(classic)).results[0]?.score.total).toBe(2700);
	});

	it("is deterministic for the same seed and actions", () => {
		const play = () => {
			const used = createRng(11);
			const tracks = [1, 2, 3, 4, 5].map((n) => album(n));
			let game = createGame({
				tracks,
				rounds: 3,
				rng: used,
				startMode: "random",
			});
			game = run(game, REROLL, REROLL, GIVE_UP, NEXT, REROLL, TRACK_FAILED);
			return { game, next: used() };
		};
		const a = play();
		const b = play();
		expect(plain(a.game)).toEqual(plain(b.game));
		expect(a.next).toBe(b.next);
	});
});

describe("reroll", () => {
	it("moves the start at least 8 s away and inside the window", () => {
		let game = startRandom();
		for (let i = 0; i < 20; i++) {
			const before = roundOf(game);
			game = run(game, REROLL);
			const after = roundOf(game);
			expect(Math.abs(after.startMs - before.startMs)).toBeGreaterThanOrEqual(
				DEFAULT_CONFIG.rerollMinDistanceMs,
			);
			expect(after.startMs).toBeGreaterThanOrEqual(20_000);
			expect(after.startMs).toBeLessThanOrEqual(182_000);
			expect(after.window).toEqual(before.window);
		}
	});

	it("matches the pure draw it is built on", () => {
		const used = createRng(3);
		const sim = createRng(3);
		const game = createGame({
			tracks: ALBUMS,
			rounds: 3,
			rng: used,
			startMode: "random",
		});
		shuffle(ALBUMS, sim);
		drawStart(LONG_MS, sim, DEFAULT_CONFIG);
		const expected = drawReroll(roundOf(game), sim, DEFAULT_CONFIG);
		expect(expected).not.toBeNull();
		expect(roundOf(run(game, REROLL)).startMs).toBe(expected?.startMs);
	});

	it("spends three free rerolls, then adds to the round's paid count", () => {
		let game = startRandom();
		const paid: number[] = [];
		for (let i = 0; i < 5; i++) {
			game = run(game, REROLL);
			paid.push(roundOf(game).paidRerolls);
		}
		expect(paid).toEqual([0, 0, 0, 1, 2]);
		expect(game.rerollsUsed).toBe(5);
	});

	it("applies 10% per paid reroll to the round score", () => {
		const free = run(startRandom(), REROLL, REROLL, REROLL);
		const paid1 = run(free, REROLL);
		const paid2 = run(free, REROLL, REROLL);
		const title = (g: GameState) => SUBMIT({ title: current(g).title });
		const total = (g: GameState) =>
			run(g, title(g), GIVE_UP).results[0]?.score.total;
		expect(total(free)).toBe(1250);
		expect(total(paid1)).toBe(1125);
		expect(total(paid2)).toBe(1000);
	});

	it("never takes more than half off, however many paid rerolls", () => {
		let game = startRandom();
		for (let i = 0; i < 3 + 6; i++) game = run(game, REROLL);
		expect(roundOf(game).paidRerolls).toBe(6);
		const done = run(game, SUBMIT({ title: current(game).title }), GIVE_UP);
		expect(done.results[0]?.score).toMatchObject({
			rerollMultiplier: 0.5,
			total: 625,
		});
	});

	it("leaves the step, locks and track untouched", () => {
		let game = startRandom();
		game = run(game, SKIP, SUBMIT({ artist: current(game).artists[0] }));
		const before = roundOf(game);
		const after = roundOf(run(game, REROLL));
		expect(before.step).toBe(2);
		expect(after.step).toBe(before.step);
		expect(after.locks).toEqual(before.locks);
		expect(after.track).toBe(before.track);
		expect(after.ended).toBeNull();
		expect(after.startMs).not.toBe(before.startMs);
	});

	it("returns the identical state when it cannot apply", () => {
		const classic = start();
		const reveal = run(startRandom(), GIVE_UP);
		const finished = run(startRandom(LONG_MS, 1), GIVE_UP, NEXT);
		const noSpot = startRandom(NO_SPOT_MS);
		expect(roundOf(noSpot).window).not.toBeNull();
		expect(reveal.phase).toBe("reveal");
		expect(finished.phase).toBe("finished");
		for (const state of [classic, reveal, finished, noSpot]) {
			expect(gameReducer(state, REROLL)).toBe(state);
		}
	});

	it("carries the budget across rounds and resets it in a new game", () => {
		let game = startRandom();
		game = run(game, REROLL, REROLL, GIVE_UP, NEXT);
		expect(game.rerollsUsed).toBe(2);
		expect(roundOf(game).paidRerolls).toBe(0);
		game = run(game, REROLL, REROLL);
		expect(game.rerollsUsed).toBe(4);
		expect(roundOf(game).paidRerolls).toBe(1);
		expect(startRandom().rerollsUsed).toBe(0);
	});

	it("redraws on trackFailed without spending a reroll", () => {
		const used = createRng(8);
		const sim = createRng(8);
		const game = createGame({
			tracks: ALBUMS,
			rounds: 3,
			rng: used,
			startMode: "random",
		});
		const queue = shuffle(ALBUMS, sim);
		const first = drawStart(LONG_MS, sim, DEFAULT_CONFIG);
		drawReroll(first, sim, DEFAULT_CONFIG);
		const second = drawStart(LONG_MS, sim, DEFAULT_CONFIG);

		const failed = run(game, REROLL, TRACK_FAILED);
		expect(failed.rerollsUsed).toBe(1);
		expect(roundOf(failed)).toMatchObject({
			track: queue[1],
			paidRerolls: 0,
			startMs: second.startMs,
		});
	});
});

describe("rerollStatus", () => {
	it("reports the free budget and when the next reroll is paid", () => {
		let game = startRandom();
		expect(rerollStatus(game)).toEqual({
			available: true,
			freeLeft: 3,
			nextIsPaid: false,
		});
		game = run(game, REROLL, REROLL);
		expect(rerollStatus(game)).toEqual({
			available: true,
			freeLeft: 1,
			nextIsPaid: false,
		});
		game = run(game, REROLL);
		expect(rerollStatus(game)).toEqual({
			available: true,
			freeLeft: 0,
			nextIsPaid: true,
		});
		expect(rerollStatus(run(game, REROLL)).freeLeft).toBe(0);
	});

	it("is unavailable in Classic, short or no-spot rounds, reveal and finished", () => {
		const unavailable = [
			start(),
			startRandom(SHORT_MS),
			startRandom(NO_SPOT_MS),
			run(startRandom(), GIVE_UP),
			run(startRandom(LONG_MS, 1), GIVE_UP, NEXT),
		];
		for (const state of unavailable) {
			expect(rerollStatus(state).available).toBe(false);
		}
	});

	it("keeps the budget visible across rounds", () => {
		const game = run(startRandom(), REROLL, REROLL, GIVE_UP, NEXT);
		expect(rerollStatus(game)).toEqual({
			available: true,
			freeLeft: 1,
			nextIsPaid: false,
		});
	});
});
