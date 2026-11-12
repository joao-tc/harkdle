import { describe, expect, it } from "vitest";
import { createGame, type GameState, gameReducer } from "@/game/game";
import { createRng } from "@/game/rng";
import type { Guess, Track } from "@/game/types";
import { wrongFields } from "./feedback";

const TRACKS: readonly Track[] = [
	{
		id: "a",
		title: "Alpha",
		artists: ["Ann", "Bob"],
		album: { name: "First", kind: "album" },
	},
	{
		id: "b",
		title: "Beta",
		artists: ["Cy"],
		album: { name: "Second", kind: "single" },
	},
];

function roundOf(trackId: string): Extract<GameState, { phase: "round" }> {
	let game = createGame({ tracks: TRACKS, rounds: 2, rng: createRng(1) });
	while (game.phase === "round" && game.round.track.id !== trackId) {
		game = gameReducer(game, { type: "trackFailed" });
	}
	if (game.phase !== "round") throw new Error("track not found");
	return game;
}

function submit(game: Extract<GameState, { phase: "round" }>, guess: Guess) {
	return {
		before: game.round,
		after: gameReducer(game, { type: "submit", guess }),
	};
}

describe("wrongFields", () => {
	it("lists only the submitted fields that did not lock", () => {
		const { before, after } = submit(roundOf("a"), {
			title: "Alpha",
			artist: "Nobody",
			album: "Nothing",
		});
		expect(
			wrongFields(
				{ title: "Alpha", artist: "Nobody", album: "Nothing" },
				before,
				after,
			),
		).toEqual(["artist", "album"]);
	});

	it("lists nothing when every submitted field locked", () => {
		const guess = { title: "Alpha" };
		const { before, after } = submit(roundOf("a"), guess);
		expect(wrongFields(guess, before, after)).toEqual([]);
	});

	it("lists nothing when the round completed", () => {
		const guess = { title: "Alpha", artist: "Ann", album: "First" };
		const { before, after } = submit(roundOf("a"), guess);
		expect(after.phase).toBe("reveal");
		expect(wrongFields(guess, before, after)).toEqual([]);
	});

	it("lists nothing when a wrong guess ended the round at the last step", () => {
		let game = roundOf("a");
		for (let step = 1; step < 6; step++) {
			const next = gameReducer(game, { type: "skip" });
			if (next.phase !== "round") throw new Error("ended early");
			game = next;
		}
		const guess = { title: "Wrong" };
		const { before, after } = submit(game, guess);
		expect(after.phase).toBe("reveal");
		expect(wrongFields(guess, before, after)).toEqual([]);
	});

	it("never lists blank or unsubmitted fields", () => {
		const guess = { title: "Wrong", artist: "   " };
		const { before, after } = submit(roundOf("a"), guess);
		expect(wrongFields(guess, before, after)).toEqual(["title"]);
	});

	it("never lists a field that was already locked", () => {
		const first = submit(roundOf("a"), { title: "Alpha", artist: "Nobody" });
		if (first.after.phase !== "round") throw new Error("round ended");
		const guess = { title: "Alpha", artist: "Nobody" };
		const second = submit(first.after, guess);
		expect(wrongFields(guess, second.before, second.after)).toEqual(["artist"]);
	});

	it("counts a featured-artist lock as locked", () => {
		const guess = { artist: "Bob", title: "Wrong" };
		const { before, after } = submit(roundOf("a"), guess);
		if (after.phase !== "round") throw new Error("round ended");
		expect(after.round.locks.artist?.credit).toBe("featured");
		expect(wrongFields(guess, before, after)).toEqual(["title"]);
	});

	it("does not list the album of a track whose album is skipped", () => {
		const guess = { title: "Wrong", album: "Whatever" };
		const { before, after } = submit(roundOf("b"), guess);
		expect(wrongFields(guess, before, after)).toEqual(["title"]);
	});
});
