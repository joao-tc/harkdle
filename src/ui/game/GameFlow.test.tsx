// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import { summarize } from "@/game/game";
import type { Track } from "@/game/types";
import {
	createPlaylistsStore,
	type PlaylistSummary,
	type PlaylistsState,
} from "@/store/playlists";
import { GameFlow } from "./GameFlow";
import {
	createHarness,
	PlaybackError,
	run,
	tickCountdown,
} from "./gameTestUtils";

afterEach(cleanup);

type Client = Parameters<typeof createPlaylistsStore>[0]["client"];
type User = ReturnType<typeof userEvent.setup>;

const SUMMARY: PlaylistSummary = {
	id: "pl",
	name: "My Mix",
	ownerName: "Me",
	coverUrl: null,
	trackCount: 12,
	collaborative: false,
	owned: true,
};

function item(n: number): Record<string, unknown> {
	return {
		is_local: false,
		item: {
			type: "track",
			id: `s${n}`,
			uri: `spotify:track:s${n}`,
			name: `Song ${n}`,
			is_playable: true,
			is_local: false,
			duration_ms: 180_000,
			external_ids: { isrc: `ZZ${n}` },
			artists: [{ name: `Artist ${n}` }],
			album: {
				name: `Album ${n}`,
				album_type: n % 4 === 3 ? "single" : "album",
				images: [],
			},
		},
	};
}

async function setup() {
	const h = createHarness();
	const client: Client = {
		listMine: vi.fn(async () => [SUMMARY]),
		lookup: vi.fn(async () => ({ kind: "ok" as const, summary: SUMMARY })),
		fetchItems: vi.fn(async () =>
			Array.from({ length: 12 }, (_, i) => item(i)),
		),
	};
	const playlists: StoreApi<PlaylistsState> = createPlaylistsStore({
		client,
		getUserId: () => "u1",
		onUnauthorized: () => {},
	});
	await playlists.getState().select(SUMMARY);
	const onBack = vi.fn();
	render(
		<GameFlow
			game={h.store}
			playlists={playlists}
			summary={SUMMARY}
			onBack={onBack}
		/>,
	);
	return { h, onBack, user: userEvent.setup() };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const combo = (name: string) => screen.getByRole("combobox", { name });
const ladder = () => screen.getByRole("list").getAttribute("aria-label");
const accentVar = () =>
	screen.getByRole("main").style.getPropertyValue("--art-accent");

function track(h: ReturnType<typeof createHarness>): Track {
	const { game } = h.store.getState();
	if (game?.phase !== "round") throw new Error("not in a round");
	return game.round.track;
}

async function pick(user: User, label: string, value: string) {
	await user.click(combo(label));
	await user.type(combo(label), value);
	await user.click(screen.getByRole("option", { name: value }));
}

async function guessAll(user: User, t: Track) {
	await pick(user, "Title", t.title);
	await pick(user, "Artist", t.artists[0]);
	if (screen.queryByRole("combobox", { name: "Album" })) {
		await pick(user, "Album", t.album.name);
	}
	await user.click(button("Submit"));
	await run(() => {});
}

async function pressNext(user: User, h: ReturnType<typeof createHarness>) {
	await user.click(button("Next"));
	await run(() => {});
	if (h.store.getState().stage === "countdown") {
		expect(screen.getByText("3")).toBeTruthy();
		await act(() => h.tick());
		expect(screen.getByText("2")).toBeTruthy();
		await act(() => h.tick());
		expect(screen.getByText("1")).toBeTruthy();
		await act(() => h.tick());
	}
}

describe("GameFlow", () => {
	it("plays a whole 5-round game: Setup, Connecting, Rounds, Reveals, Countdowns, Results, Play again", async () => {
		const { h, user, onBack } = await setup();

		// Setup
		expect(screen.getByText("My Mix")).toBeTruthy();
		expect(screen.getByText("12 usable tracks")).toBeTruthy();
		expect(accentVar()).toBe("");
		await user.click(button("5"));
		// A synchronous click leaves the store mid-start, before any promise has settled.
		act(() => {
			fireEvent.click(button("Start"));
		});

		// Connecting
		expect(screen.getByText("Connecting to Spotify…")).toBeTruthy();
		expect(screen.queryAllByRole("button")).toHaveLength(0);
		await run(() => {});

		// Round 1: all correct
		expect(screen.getByText("Round 1 of 5")).toBeTruthy();
		expect(ladder()).toBe("Step 1 of 6");
		expect(accentVar()).toBe("");
		await guessAll(user, track(h));
		expect(h.store.getState().stage).toBe("reveal");
		expect(screen.getByRole("link", { name: "PLAY ON SPOTIFY" })).toBeTruthy();
		expect(screen.getByText("Hat trick", { exact: false })).toBeTruthy();
		expect(accentVar()).toBe("#191414");
		await pressNext(user, h);
		expect(accentVar()).toBe("");
		expect(screen.getByText("Round 2 of 5")).toBeTruthy();
		expect(screen.getByText(/^Score [1-9]/)).toBeTruthy();

		// Round 2: a mixed submission, then give up
		const second = track(h);
		const other = second.artists[0] === "Artist 0" ? "Artist 1" : "Artist 0";
		await pick(user, "Title", second.title);
		await pick(user, "Artist", other);
		await user.click(button("Submit"));
		await run(() => {});
		expect(screen.getByText("Not it")).toBeTruthy();
		expect(ladder()).toBe("Step 2 of 6");
		await user.click(button("Give up"));
		await user.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Give up",
			}),
		);
		await run(() => {});
		expect(h.store.getState().stage).toBe("reveal");
		await pressNext(user, h);

		// Round 3: skip to step 6, then skip again to end the round
		expect(screen.getByText("Round 3 of 5")).toBeTruthy();
		for (let i = 0; i < 5; i++) {
			await user.click(button("Skip"));
			await run(() => {});
		}
		expect(ladder()).toBe("Step 6 of 6");
		await user.click(button("Skip (ends the round)"));
		await run(() => {});
		expect(h.store.getState().stage).toBe("reveal");
		await pressNext(user, h);

		// Round 4 solved, round 5 given up
		expect(screen.getByText("Round 4 of 5")).toBeTruthy();
		await guessAll(user, track(h));
		await pressNext(user, h);
		expect(screen.getByText("Round 5 of 5")).toBeTruthy();
		await run(() => h.store.getState().giveUp());
		await user.click(button("Next"));
		await run(() => {});

		// Results
		expect(h.store.getState().stage).toBe("finished");
		const summary = summarize(h.store.getState().game ?? (undefined as never));
		expect(summary.roundsPlayed).toBe(5);
		expect(screen.getByText("Final score")).toBeTruthy();
		expect(
			screen.getByText(summary.score.toLocaleString("en-US")),
		).toBeTruthy();
		expect(screen.getByText("Hat tricks").nextSibling?.textContent).toBe("2");
		expect(screen.getByText("Rounds played").nextSibling?.textContent).toBe(
			"5",
		);
		expect(document.activeElement).toBe(button("Play again"));

		// Play again
		act(() => {
			fireEvent.click(button("Play again"));
		});
		expect(screen.getByText("Connecting to Spotify…")).toBeTruthy();
		await run(() => {});
		expect(screen.getByText("Round 1 of 5")).toBeTruthy();
		expect(screen.getByText("Score 0")).toBeTruthy();

		expect(onBack).not.toHaveBeenCalled();
	});

	it("keeps the Spotify logo and attribution on every stage", async () => {
		const { h, user } = await setup();
		const footer = () => {
			expect(screen.getByRole("img", { name: "Spotify" })).toBeTruthy();
			expect(
				screen.getByText("Track data and artwork from Spotify"),
			).toBeTruthy();
		};
		footer();
		await user.click(button("Start"));
		await run(() => {});
		footer();
		await run(() => h.store.getState().giveUp());
		footer();
		await user.click(button("Next"));
		await run(() => {});
		footer();
	});

	it("keeps one volume slider through the Round and the Reveal, and hides it in the Countdown", async () => {
		const { h, user } = await setup();
		await user.click(button("Start"));
		await run(() => {});

		const slider = screen.getByRole("slider", { name: "Volume" });
		fireEvent.change(slider, { target: { value: "35" } });
		expect(h.store.getState().volume).toBe(0.35);
		expect(h.calls("setVolume").at(-1)).toEqual([0.35]);

		await run(() => h.store.getState().giveUp());
		expect(h.store.getState().stage).toBe("reveal");
		expect(screen.getByRole("slider", { name: "Volume" })).toBe(slider);
		expect((slider as HTMLInputElement).value).toBe("35");

		await user.click(button("Next"));
		await run(() => {});
		expect(h.store.getState().stage).toBe("countdown");
		expect(screen.queryByRole("slider")).toBeNull();
	});

	it("goes back to the Picker from Results with Change playlist", async () => {
		const { h, user, onBack } = await setup();
		await user.click(button("5"));
		await user.click(button("Start"));
		await run(() => {});
		for (let round = 1; round <= 5; round++) {
			await run(() => h.store.getState().giveUp());
			await user.click(button("Next"));
			await run(() => {});
			if (h.store.getState().stage === "countdown") await tickCountdown(h);
		}
		await user.click(button("Change playlist"));
		expect(onBack).toHaveBeenCalledTimes(1);
	});

	it("stays on Setup when the connection is refused", async () => {
		const { h, user } = await setup();
		h.adapter.failNextConnect(new PlaybackError("authentication", "no"));
		await user.click(button("Start"));
		await run(() => {});

		expect(h.store.getState().stage).toBe("idle");
		expect(h.startFailures).toHaveLength(1);
		expect(screen.getByText("My Mix")).toBeTruthy();
		expect(button("Start")).toHaveProperty("disabled", false);
		expect(screen.queryByText("Connecting to Spotify…")).toBeNull();
	});
});
