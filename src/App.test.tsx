// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRng } from "@/game/rng";
import type { AccountUser } from "@/spotify/account";
import { SpotifyApiError } from "@/spotify/api";
import type { Auth } from "@/spotify/auth";
import { PlaybackError } from "@/spotify/playback/adapter";
import { createFakeAdapter } from "@/spotify/playback/fakeAdapter";
import { createGameStore } from "@/store/game";
import { createPlaylistsStore, type PlaylistSummary } from "@/store/playlists";
import { createSessionStore } from "@/store/session";
import {
	connectGameToSession,
	connectPlaylistsToSession,
	signedInUserId,
} from "@/store/wiring";
import { App } from "./App";

afterEach(cleanup);

type Client = Parameters<typeof createPlaylistsStore>[0]["client"];
type Rec = Record<string, unknown>;

const USER: AccountUser = {
	id: "u1",
	displayName: "Ada",
	product: "premium",
	country: "PT",
};

function summary(id: string): PlaylistSummary {
	return {
		id,
		name: `List ${id}`,
		ownerName: "Me",
		coverUrl: null,
		trackCount: 20,
		collaborative: false,
		owned: true,
	};
}

function item(prefix: string, n: number): Rec {
	return {
		is_local: false,
		item: {
			type: "track",
			id: `${prefix}${n}`,
			uri: `spotify:track:${prefix}${n}`,
			name: `Song ${prefix}${n}`,
			is_playable: true,
			is_local: false,
			duration_ms: 180_000,
			external_ids: { isrc: `ZZ${prefix}${n}` },
			artists: [{ name: `Artist ${prefix}${n}` }],
			album: { name: `Album ${prefix}${n}`, album_type: "album", images: [] },
		},
	};
}

function setup() {
	const state = { loggedIn: true };
	const auth: Auth = {
		startLogin: async () => {},
		handleCallback: async () => false,
		getAccessToken: async () => "token",
		isLoggedIn: () => state.loggedIn,
		logout: () => {
			state.loggedIn = false;
		},
	};
	const session = createSessionStore({
		auth,
		checkAccount: async () => ({ ok: true, user: USER }),
		env: { clientId: "cid", dev: true, hostname: "127.0.0.1" },
		search: "",
	});
	const client = {
		listMine: vi.fn<Client["listMine"]>(async () => [
			summary("a"),
			summary("b"),
		]),
		lookup: vi.fn<Client["lookup"]>(async (id) => ({
			kind: "ok",
			summary: summary(id),
		})),
		fetchItems: vi.fn<Client["fetchItems"]>(async (id) =>
			Array.from({ length: 12 }, (_, i) => item(id, i)),
		),
	};
	const playlists = createPlaylistsStore({
		client,
		getUserId: () => signedInUserId(session),
		onUnauthorized: () => session.getState().expire(),
	});
	connectPlaylistsToSession(session, playlists);
	const adapter = createFakeAdapter();
	const game = createGameStore({
		adapter,
		sleep: () => new Promise<void>(() => {}),
		newRng: () => createRng(1),
		onStartFailed: (error) =>
			session
				.getState()
				.playerFailed({ kind: error.kind, message: error.message }),
	});
	connectGameToSession(session, game);
	render(
		<App
			session={session}
			playlists={playlists}
			game={game}
			devUrl="http://x"
		/>,
	);
	return { state, session, client, adapter, game };
}

describe("App", () => {
	it("goes Picker -> Setup -> Back with the selection intact", async () => {
		const { session, client } = setup();
		const user = userEvent.setup();
		await session.getState().boot();

		expect(await screen.findByText("Signed in as Ada")).toBeTruthy();
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		await screen.findByText("12 usable · none removed");
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(await screen.findByText("List a")).toBeTruthy();
		expect(screen.getByText("12 usable tracks")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Back" }));
		const selected = await screen.findByRole("button", { name: /List a/ });
		expect(selected.getAttribute("aria-pressed")).toBe("true");
		expect(
			screen
				.getByRole("button", { name: /List b/ })
				.getAttribute("aria-pressed"),
		).toBe("false");
		expect(client.listMine).toHaveBeenCalledTimes(1);
	});

	it("falls back to the Picker when Setup is reached without a ready selection", async () => {
		const { session } = setup();
		await session.getState().boot();
		await screen.findByText("Signed in as Ada");
		session.getState().toSetup();
		expect(await screen.findByText("Signed in as Ada")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
	});

	it("shows the game setup, then the first round, for a ready playlist", async () => {
		const { session, adapter } = setup();
		const user = userEvent.setup();
		await session.getState().boot();
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		await screen.findByText("12 usable · none removed");
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(await screen.findByText("X Tracks")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Start" }));
		expect(await screen.findByText("Round 1 of 10")).toBeTruthy();
		expect(adapter.calls.map((call) => call.method)).toContain("connect");
	});

	it("leaves the game when the session leaves Setup", async () => {
		const { session, adapter, game } = setup();
		const user = userEvent.setup();
		await session.getState().boot();
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		await screen.findByText("12 usable · none removed");
		await user.click(screen.getByRole("button", { name: "Continue" }));
		await user.click(await screen.findByRole("button", { name: "Start" }));
		await screen.findByText("Round 1 of 10");

		session.getState().logout();
		expect(game.getState().stage).toBe("idle");
		expect(adapter.calls.map((call) => call.method)).toContain("disconnect");
		expect(
			await screen.findByRole("button", { name: "Log in with Spotify" }),
		).toBeTruthy();
	});

	it("shows the Setup error screen, and no game screen, when the player cannot connect", async () => {
		const { session, adapter } = setup();
		const user = userEvent.setup();
		await session.getState().boot();
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		await screen.findByText("12 usable · none removed");
		await user.click(screen.getByRole("button", { name: "Continue" }));

		adapter.failNextConnect(new PlaybackError("initialization", "no DRM"));
		await user.click(await screen.findByRole("button", { name: "Start" }));

		expect(
			await screen.findByText("Spotify player couldn't start"),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
		expect(screen.queryByText(/Round \d+ of/)).toBeNull();
		expect(screen.queryByText("Connecting to Spotify…")).toBeNull();
	});

	it("starts with no selection after logging out and back in", async () => {
		const { session, state, client } = setup();
		const user = userEvent.setup();
		await session.getState().boot();
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		await screen.findByText("12 usable · none removed");

		await user.click(screen.getByRole("button", { name: "Log out" }));
		expect(
			await screen.findByRole("button", { name: "Log in with Spotify" }),
		).toBeTruthy();

		state.loggedIn = true;
		await session.getState().boot();
		const fresh = await screen.findByRole("button", { name: /List a/ });
		expect(fresh.getAttribute("aria-pressed")).toBe("false");
		expect(
			screen.getByText("Pick a playlist, or paste a link, to start."),
		).toBeTruthy();
		expect(client.listMine).toHaveBeenCalledTimes(2);
	});

	it("shows the session-expired screen when listing is unauthorized", async () => {
		const { session, client } = setup();
		client.listMine.mockRejectedValue(
			new SpotifyApiError("unauthorized", "nope", 401),
		);
		await session.getState().boot();
		expect(await screen.findByText("Session expired")).toBeTruthy();
	});
});
