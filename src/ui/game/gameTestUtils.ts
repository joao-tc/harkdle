// Shared by the screen tests. Not imported by any screen.
import { act } from "@testing-library/react";
import type { Field } from "@/game/types";
import { COUNTDOWN_FROM, type PlaylistTrack } from "@/store/game";
import { flush, type GameHarness } from "@/store/gameHarness";

// biome-ignore lint/style/noRestrictedImports: tests drive the fake adapter, which rejects with the adapter's own error type
export { PlaybackError } from "@/spotify/playback/adapter";
export { createHarness, flush, makeTracks } from "@/store/gameHarness";

/** Runs `work` inside act, then lets the store's and the fake adapter's continuations settle. */
export async function run(work: () => void | Promise<void>): Promise<void> {
	await act(async () => {
		await work();
		await flush();
	});
}

export async function startGame(h: GameHarness, rounds = 5): Promise<void> {
	await run(async () => {
		h.store.getState().setRounds(rounds);
		await h.store.getState().start(h.tracks);
	});
}

/** The track being played in the current round. */
export function currentTrack(h: GameHarness): PlaylistTrack {
	const { game } = h.store.getState();
	if (game?.phase !== "round") throw new Error("not in a round");
	const track = h.tracks.find((t) => t.id === game.round.track.id);
	if (!track) throw new Error("unknown track");
	return track;
}

export async function tickCountdown(h: GameHarness): Promise<void> {
	for (let i = 0; i < COUNTDOWN_FROM; i++) await act(() => h.tick());
}

/** Reveal -> next round (or Results), stepping the countdown. */
export async function goNext(h: GameHarness): Promise<void> {
	await run(() => h.store.getState().next());
	if (h.store.getState().stage === "countdown") await tickCountdown(h);
}

/** Submits every field of the current track, which completes the round. */
export async function solveRound(h: GameHarness): Promise<void> {
	const track = currentTrack(h);
	await run(() =>
		h.store.getState().submit({
			title: track.title,
			artist: track.artists[0],
			album: track.album.name,
		}),
	);
}

export async function giveUp(h: GameHarness): Promise<void> {
	await run(() => h.store.getState().giveUp());
}

/** Plays `rounds` rounds to Results: the first is solved, the rest are given up. */
export async function playToResults(h: GameHarness, rounds = 5): Promise<void> {
	await startGame(h, rounds);
	for (let round = 1; round <= rounds; round++) {
		if (round === 1) await solveRound(h);
		else await giveUp(h);
		await goNext(h);
	}
}

/** A `suggest` over the harness tracks: the field's own values containing the query. */
export function suggestFrom(
	tracks: readonly PlaylistTrack[],
): (field: Field, query: string) => readonly string[] {
	return (field, query) => {
		const q = query.trim().toLowerCase();
		if (q === "") return [];
		const values = tracks.flatMap((t) =>
			field === "title"
				? [t.title]
				: field === "artist"
					? t.artists
					: [t.album.name],
		);
		return [...new Set(values)]
			.filter((v) => v.toLowerCase().includes(q))
			.slice(0, 8);
	};
}
