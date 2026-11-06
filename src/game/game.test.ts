import { describe, expect, it } from "vitest";
import {
	createGame,
	type GameAction,
	type GameState,
	gameReducer,
	summarize,
} from "@/game/game";
import { createRng } from "@/game/rng";
import type { Guess, Track } from "@/game/types";

function album(n: number): Track {
	return {
		id: `album-${n}`,
		title: `Song Number ${n}`,
		artists: [`Artist ${n}`, "Guest Singer"],
		album: { name: `Album Number ${n}`, kind: "album" },
	};
}

function single(n: number): Track {
	return {
		id: `single-${n}`,
		title: `Single Number ${n}`,
		artists: [`Solo ${n}`],
		album: { name: `Single Number ${n}`, kind: "single" },
	};
}

const ALBUMS = [1, 2, 3, 4, 5].map(album);
const SINGLES = [1, 2, 3].map(single);

const SUBMIT = (guess: Guess): GameAction => ({ type: "submit", guess });
const SKIP: GameAction = { type: "skip" };
const GIVE_UP: GameAction = { type: "giveUp" };
const NEXT: GameAction = { type: "next" };
const TRACK_FAILED: GameAction = { type: "trackFailed" };

function start(
	tracks: readonly Track[] = ALBUMS,
	rounds = 3,
	seed = 42,
): GameState {
	return createGame({ tracks, rounds, rng: createRng(seed) });
}

function run(state: GameState, ...actions: GameAction[]): GameState {
	return actions.reduce(gameReducer, state);
}

function current(state: GameState): Track {
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
	expect(JSON.parse(JSON.stringify(state))).toEqual(state);
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
			phase: "round",
			round: {
				track: game.queue[0],
				albumSkipped: false,
				step: 1,
				locks: {},
				ended: null,
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
