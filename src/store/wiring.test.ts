import { describe, expect, it, vi } from "vitest";
import type { AccountResult, AccountUser } from "@/spotify/account";
import type { Auth } from "@/spotify/auth";
import type { PlaylistSummary, PlaylistsClient } from "@/spotify/playlists";
import { createPlaylistsStore } from "./playlists";
import { createSessionStore, type SessionDeps } from "./session";
import { connectPlaylistsToSession, signedInUserId } from "./wiring";

const user: AccountUser = {
	id: "u1",
	displayName: "Ada",
	product: "premium",
	country: "PT",
};

const playlist: PlaylistSummary = {
	id: "pl1",
	name: "List pl1",
	ownerName: "Ada",
	coverUrl: null,
	trackCount: 12,
	collaborative: false,
	owned: true,
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function sessionStore(
	opts: { loggedIn?: boolean; check?: () => Promise<AccountResult> } = {},
) {
	const auth: Auth = {
		startLogin: async () => {},
		handleCallback: async () => false,
		getAccessToken: async () => "token",
		isLoggedIn: () => opts.loggedIn ?? true,
		logout: () => {},
	};
	const deps: SessionDeps = {
		auth,
		checkAccount: opts.check ?? (async () => ({ ok: true, user })),
		env: { clientId: "cid", dev: true, hostname: "127.0.0.1" },
		search: "",
	};
	return createSessionStore(deps);
}

function rawItem(n: number) {
	return {
		is_local: false,
		item: {
			type: "track",
			id: `t${n}`,
			uri: `spotify:track:t${n}`,
			name: `Song ${n}`,
			is_playable: true,
			is_local: false,
			duration_ms: 180_000,
			external_ids: { isrc: `ZZ${n}` },
			artists: [{ name: `Artist ${n}` }],
			album: { name: `Album ${n}`, album_type: "album", images: [] },
		},
	};
}

function playlistsStore(session: ReturnType<typeof sessionStore>) {
	const client = {
		listMine: vi.fn<PlaylistsClient["listMine"]>(async () => [playlist]),
		lookup: vi.fn<PlaylistsClient["lookup"]>(async () => ({
			kind: "ok",
			summary: playlist,
		})),
		fetchItems: vi.fn<PlaylistsClient["fetchItems"]>(async () =>
			Array.from({ length: 12 }, (_, i) => rawItem(i)),
		),
	};
	return createPlaylistsStore({
		client,
		getUserId: () => signedInUserId(session),
		onUnauthorized: () => {},
	});
}

// A signed-in session with a playlist selected and the list loaded, wired together.
async function wired() {
	const session = sessionStore();
	await session.getState().boot();
	const playlists = playlistsStore(session);
	const unsubscribe = connectPlaylistsToSession(session, playlists);
	await playlists.getState().loadList();
	await playlists.getState().select(playlist);
	expect(playlists.getState().selection.status).toBe("ready");
	expect(playlists.getState().list.status).toBe("ready");
	return { session, playlists, unsubscribe };
}

describe("signedInUserId", () => {
	it("is the user's id on signed-in and setup", async () => {
		const session = sessionStore();
		await session.getState().boot();
		expect(signedInUserId(session)).toBe("u1");
		session.getState().toSetup();
		expect(signedInUserId(session)).toBe("u1");
	});

	it("is null on booting", () => {
		expect(signedInUserId(sessionStore())).toBeNull();
	});

	it("is null on login", async () => {
		const session = sessionStore({ loggedIn: false });
		await session.getState().boot();
		expect(session.getState().screen.name).toBe("login");
		expect(signedInUserId(session)).toBeNull();
	});

	it("is null on checking", async () => {
		const d = deferred<AccountResult>();
		const session = sessionStore({ check: () => d.promise });
		const booted = session.getState().boot();
		await Promise.resolve();
		await Promise.resolve();
		expect(session.getState().screen.name).toBe("checking");
		expect(signedInUserId(session)).toBeNull();
		d.resolve({ ok: true, user });
		await booted;
	});

	it("is null on setup-error", async () => {
		const session = sessionStore({
			check: async () => ({ ok: false, error: "not-premium" }),
		});
		await session.getState().boot();
		expect(session.getState().screen.name).toBe("setup-error");
		expect(signedInUserId(session)).toBeNull();
	});
});

describe("connectPlaylistsToSession", () => {
	it("resets the playlists store on logout", async () => {
		const { session, playlists } = await wired();
		session.getState().logout();
		expect(session.getState().screen.name).toBe("login");
		expect(playlists.getState().selection).toEqual({ status: "none" });
		expect(playlists.getState().list).toEqual({ status: "idle" });
	});

	it("resets the playlists store on expire", async () => {
		const { session, playlists } = await wired();
		session.getState().expire();
		expect(session.getState().screen.name).toBe("setup-error");
		expect(playlists.getState().selection).toEqual({ status: "none" });
		expect(playlists.getState().list).toEqual({ status: "idle" });
	});

	it("resets when leaving from setup", async () => {
		const { session, playlists } = await wired();
		session.getState().toSetup();
		session.getState().logout();
		expect(playlists.getState().selection).toEqual({ status: "none" });
	});

	it("does not reset when moving between signed-in and setup", async () => {
		const { session, playlists } = await wired();
		session.getState().toSetup();
		expect(playlists.getState().selection.status).toBe("ready");
		expect(playlists.getState().list.status).toBe("ready");
		session.getState().toPicker();
		expect(playlists.getState().selection.status).toBe("ready");
		expect(playlists.getState().list.status).toBe("ready");
	});

	it("does not reset when a screen without a user changes to another", async () => {
		const session = sessionStore({ loggedIn: false });
		await session.getState().boot();
		const playlists = playlistsStore(session);
		const reset = vi.spyOn(playlists.getState(), "reset");
		connectPlaylistsToSession(session, playlists);
		session.getState().expire();
		expect(reset).not.toHaveBeenCalled();
	});

	it("stops resetting once unsubscribed", async () => {
		const { session, playlists, unsubscribe } = await wired();
		unsubscribe();
		session.getState().logout();
		expect(playlists.getState().selection.status).toBe("ready");
		expect(playlists.getState().list.status).toBe("ready");
	});
});
