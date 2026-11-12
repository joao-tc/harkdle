// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { PlaylistTrack } from "@/store/game";
import type { GameHarness } from "@/store/gameHarness";
import {
	createHarness,
	giveUp,
	makeTracks,
	run,
	solveRound,
} from "./gameTestUtils";
import { RevealScreen } from "./RevealScreen";

afterEach(cleanup);

const COVER = "https://i.scdn.co/image/abc";

function tracksWith(
	overrides: Partial<PlaylistTrack>,
): readonly PlaylistTrack[] {
	return makeTracks(10).map((track) => ({ ...track, ...overrides }));
}

async function startWith(
	tracks: readonly PlaylistTrack[],
): Promise<GameHarness> {
	const h = createHarness();
	await run(async () => {
		h.store.getState().setRounds(5);
		await h.store.getState().start(tracks);
	});
	return h;
}

function current(h: GameHarness): PlaylistTrack {
	const { game } = h.store.getState();
	if (game?.phase !== "round") throw new Error("not in a round");
	const id = game.round.track.id;
	const track = [...(h.store.getState().game?.queue ?? [])].find(
		(t) => t.id === id,
	);
	if (!track) throw new Error("no track");
	return track as PlaylistTrack;
}

const albumTracks = () =>
	tracksWith({ artists: ["Main Artist", "Guest"], coverUrl: COVER });

async function solve(h: GameHarness) {
	const track = current(h);
	await run(() =>
		h.store.getState().submit({
			title: track.title,
			artist: track.artists[0],
			album: track.album.name,
		}),
	);
}

describe("RevealScreen", () => {
	it("shows the track in full with the points of a hat-trick round", async () => {
		const h = await startWith(albumTracks());
		const track = current(h) as PlaylistTrack;
		await solve(h);
		render(<RevealScreen game={h.store} />);

		expect(screen.getByRole("heading", { name: track.title })).toBeTruthy();
		expect(screen.getByText("Main Artist, Guest")).toBeTruthy();
		expect(screen.getByText(track.album.name)).toBeTruthy();
		expect(screen.getByText("+1,000")).toBeTruthy();
		expect(screen.getByText("+300")).toBeTruthy();
		expect(screen.getByText("+500")).toBeTruthy();
		expect(screen.getByText("Hat trick ×1.5")).toBeTruthy();
		expect(screen.getByText("Round total").nextSibling?.textContent).toBe(
			"+2,700",
		);
		expect(screen.getByText("Score").nextSibling?.textContent).toBe("2,700");
	});

	it("doubles the combo and drops the album row when the album is skipped", async () => {
		const h = await startWith(
			tracksWith({
				album: { name: "A Single", kind: "single" },
				coverUrl: COVER,
			}),
		);
		await solveRound(h);
		render(<RevealScreen game={h.store} />);

		expect(screen.getByText("Hat trick ×2.0")).toBeTruthy();
		expect(screen.queryByText("Album")).toBeNull();
		expect(screen.getByText("Round total").nextSibling?.textContent).toBe(
			"+2,600",
		);
	});

	it("shows what a given-up round scored: nothing, with no multiplier rows", async () => {
		const h = await startWith(albumTracks());
		await giveUp(h);
		render(<RevealScreen game={h.store} />);

		expect(screen.getAllByText("Not guessed")).toHaveLength(3);
		expect(screen.queryByText(/Hat trick/)).toBeNull();
		expect(screen.queryByText(/Rerolls/)).toBeNull();
		expect(screen.queryByText(/Random start/)).toBeNull();
		expect(screen.getByText("Round total").nextSibling?.textContent).toBe("+0");
		expect(screen.getByText("Score").nextSibling?.textContent).toBe("0");
	});

	it("marks a featured-artist lock at half the artist points", async () => {
		const h = await startWith(albumTracks());
		await run(() => h.store.getState().submit({ artist: "Guest" }));
		await giveUp(h);
		render(<RevealScreen game={h.store} />);

		const artistRow = screen.getByText("Artist").closest("div");
		expect(artistRow?.textContent).toContain("featured artist");
		expect(artistRow?.textContent).toContain("+150");
		expect(screen.getAllByText("Not guessed")).toHaveLength(2);
	});

	it("links back to the track on Spotify in a new tab", async () => {
		const h = await startWith(albumTracks());
		const track = current(h);
		await giveUp(h);
		render(<RevealScreen game={h.store} />);

		const link = screen.getByRole("link", { name: "PLAY ON SPOTIFY" });
		expect(link.getAttribute("href")).toBe(
			`https://open.spotify.com/track/${track.id}`,
		);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("shows the cover unaltered, with an 8px radius and nothing over it", async () => {
		const h = await startWith(albumTracks());
		await giveUp(h);
		render(<RevealScreen game={h.store} />);

		const cover = screen.getByRole("img", { name: "Album cover" });
		expect(cover.getAttribute("src")).toBe(COVER);
		expect(cover.classList.contains("rounded-[8px]")).toBe(true);
		expect(cover.classList.contains("object-contain")).toBe(true);
		expect(cover.className).not.toMatch(
			/absolute|fixed|opacity|blur|grayscale/,
		);
		expect(cover.parentElement?.querySelectorAll("img")).toHaveLength(1);
		expect(cover.nextElementSibling?.tagName).not.toBe("IMG");
		// nothing is stacked over it: its parent holds the image and the text blocks, not an overlay
		expect(
			cover.parentElement?.querySelector("[class*='absolute']"),
		).toBeNull();
	});

	it("fills the square with a neutral placeholder when there is no cover", async () => {
		const h = await startWith(tracksWith({ coverUrl: null }));
		await giveUp(h);
		render(<RevealScreen game={h.store} />);

		expect(screen.queryByRole("img", { name: "Album cover" })).toBeNull();
		expect(
			screen.getByRole("img", { name: "No album cover available" }),
		).toBeTruthy();
	});

	it("focuses Next, which advances once", async () => {
		const h = await startWith(albumTracks());
		await giveUp(h);
		const user = userEvent.setup();
		render(<RevealScreen game={h.store} />);

		const next = screen.getByRole("button", { name: "Next" });
		expect(document.activeElement).toBe(next);
		await user.click(next);
		await run(() => {});

		expect(h.store.getState().stage).toBe("countdown");
		expect(h.calls("cue")).toHaveLength(2);
	});
});
