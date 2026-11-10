// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountUser } from "@/spotify/account";
import { SpotifyApiError } from "@/spotify/api";
import type { Auth } from "@/spotify/auth";
import { createPlaylistsStore, type PlaylistSummary } from "@/store/playlists";
import { createSessionStore } from "@/store/session";
import { connectPlaylistsToSession, signedInUserId } from "@/store/wiring";
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
	render(<App session={session} playlists={playlists} devUrl="http://x" />);
	return { state, session, client };
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
		expect(
			screen.queryByText("Game setup arrives in a later update."),
		).toBeNull();
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
