import { describe, expect, it, vi } from "vitest";
import type { AccountUser } from "@/spotify/account";
import { SpotifyApiError } from "@/spotify/api";
import type { Auth } from "@/spotify/auth";
import type { PlaylistSummary, PlaylistsClient } from "@/spotify/playlists";
import { connectLastPlaylist } from "./lastPlaylist";
import { createPlaylistsStore } from "./playlists";
import { createSessionStore } from "./session";
import { createSettings, SETTINGS_KEY } from "./settings";
import { memoryStorage } from "./settingsTestUtils";
import { connectPlaylistsToSession, signedInUserId } from "./wiring";

const user: AccountUser = {
	id: "u1",
	displayName: "Ada",
	product: "premium",
	country: "PT",
};

function summary(id: string): PlaylistSummary {
	return {
		id,
		name: `List ${id}`,
		ownerName: "Ada",
		coverUrl: null,
		trackCount: 12,
		collaborative: false,
		owned: true,
	};
}

const pl1 = summary("pl1");
const pl2 = summary("pl2");

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

// The preselect is fired without being awaited, so wait for its load to finish.
const settled = (playlists: ReturnType<typeof createPlaylistsStore>) =>
	vi.waitFor(() =>
		expect(playlists.getState().selection.status).not.toBe("loading"),
	);

async function setup(
	opts: {
		saved?: string | null;
		lists?: PlaylistSummary[];
		failItems?: boolean;
	} = {},
) {
	const saved = opts.saved === undefined ? "pl1" : opts.saved;
	const storage = memoryStorage({
		initial: {
			[SETTINGS_KEY]: JSON.stringify({
				v: 1,
				volume: 0.8,
				rounds: 10,
				lastPlaylistId: saved,
			}),
		},
	});
	const settings = createSettings(storage);
	const before = storage.data.get(SETTINGS_KEY);

	const auth: Auth = {
		startLogin: async () => {},
		handleCallback: async () => false,
		getAccessToken: async () => "token",
		isLoggedIn: () => true,
		logout: () => {},
	};
	const session = createSessionStore({
		auth,
		checkAccount: async () => ({ ok: true, user }),
		env: { clientId: "cid", dev: true, hostname: "127.0.0.1" },
		search: "",
	});
	await session.getState().boot();

	const client = {
		listMine: vi.fn<PlaylistsClient["listMine"]>(
			async () => opts.lists ?? [pl1, pl2],
		),
		lookup: vi.fn<PlaylistsClient["lookup"]>(async () => ({
			kind: "ok",
			summary: pl2,
		})),
		fetchItems: vi.fn<PlaylistsClient["fetchItems"]>(async () => {
			if (opts.failItems) throw new SpotifyApiError("network", "boom");
			return Array.from({ length: 12 }, (_, i) => rawItem(i));
		}),
	};
	const playlists = createPlaylistsStore({
		client,
		getUserId: () => signedInUserId(session),
		onUnauthorized: () => {},
	});

	const unsubscribe = connectLastPlaylist({ settings, session, playlists });
	const savedId = () =>
		JSON.parse(storage.data.get(SETTINGS_KEY) as string).lastPlaylistId;
	return {
		storage,
		settings,
		before,
		session,
		playlists,
		client,
		unsubscribe,
		savedId,
	};
}

describe("connectLastPlaylist: save on Continue", () => {
	it("saves the id of a ready selection when going to Setup", async () => {
		const { playlists, session, savedId } = await setup({ saved: null });
		await playlists.getState().loadList();
		await playlists.getState().select(pl2);
		session.getState().toSetup();
		expect(savedId()).toBe("pl2");
	});

	it("saves nothing for selection none", async () => {
		const { session, storage } = await setup();
		session.getState().toSetup();
		expect(storage.writes).toBe(0);
	});

	it("saves nothing for selection loading", async () => {
		const { playlists, session, storage } = await setup({ saved: null });
		const pending = playlists.getState().select(pl2);
		expect(playlists.getState().selection.status).toBe("loading");
		session.getState().toSetup();
		expect(storage.writes).toBe(0);
		await pending;
	});

	it("saves nothing for selection error", async () => {
		const { playlists, session, storage } = await setup({
			saved: null,
			failItems: true,
		});
		await playlists.getState().select(pl2);
		expect(playlists.getState().selection.status).toBe("error");
		session.getState().toSetup();
		expect(storage.writes).toBe(0);
	});
});

describe("connectLastPlaylist: preselect", () => {
	it("selects the saved playlist when the list first becomes ready", async () => {
		const { playlists, client } = await setup();
		await playlists.getState().loadList();
		await settled(playlists);
		const { selection } = playlists.getState();
		expect(selection.status).toBe("ready");
		expect(selection.status === "ready" && selection.summary.id).toBe("pl1");
		expect(client.fetchItems).toHaveBeenCalledTimes(1);
	});

	it("does not preselect again on a list refresh", async () => {
		const { playlists, client } = await setup();
		await playlists.getState().loadList();
		await settled(playlists);
		playlists.getState().clearSelection();
		await playlists.getState().loadList();
		expect(playlists.getState().selection.status).toBe("none");
		expect(client.fetchItems).toHaveBeenCalledTimes(1);
	});

	it("does not preselect when returning from Setup to the Picker", async () => {
		const { playlists, session, client } = await setup();
		await playlists.getState().loadList();
		await settled(playlists);
		playlists.getState().clearSelection();
		session.getState().toSetup();
		session.getState().toPicker();
		expect(playlists.getState().selection.status).toBe("none");
		expect(client.fetchItems).toHaveBeenCalledTimes(1);
	});

	it("does not preselect over a selection already made", async () => {
		const { playlists, client } = await setup();
		await playlists.getState().select(pl2);
		await playlists.getState().loadList();
		const { selection } = playlists.getState();
		expect(selection.status === "ready" && selection.summary.id).toBe("pl2");
		expect(client.fetchItems).toHaveBeenCalledTimes(1);
	});

	it("preselects on a retry after a failed first load", async () => {
		const { playlists, client } = await setup();
		client.listMine.mockRejectedValueOnce(new SpotifyApiError("network", "x"));
		await playlists.getState().loadList();
		expect(playlists.getState().list.status).toBe("error");
		expect(playlists.getState().selection.status).toBe("none");
		await playlists.getState().loadList();
		await settled(playlists);
		expect(playlists.getState().selection.status).toBe("ready");
	});
});

describe("connectLastPlaylist: nothing changes (P-8)", () => {
	it("leaves everything alone when the saved id is not in the list", async () => {
		const { playlists, storage, before } = await setup({ saved: "gone" });
		await playlists.getState().loadList();
		expect(playlists.getState().selection.status).toBe("none");
		expect(storage.writes).toBe(0);
		expect(storage.data.get(SETTINGS_KEY)).toBe(before);
	});

	it("leaves the saved id alone when the preselect errors", async () => {
		const { playlists, storage, before } = await setup({ failItems: true });
		await playlists.getState().loadList();
		await settled(playlists);
		expect(playlists.getState().selection.status).toBe("error");
		expect(storage.writes).toBe(0);
		expect(storage.data.get(SETTINGS_KEY)).toBe(before);
	});

	it("does nothing when no id was ever saved", async () => {
		const { playlists, storage } = await setup({ saved: null });
		await playlists.getState().loadList();
		expect(playlists.getState().selection.status).toBe("none");
		expect(storage.writes).toBe(0);
	});
});

describe("connectLastPlaylist: logout (P-9)", () => {
	it("keeps the saved record and preselects again on the next sign-in", async () => {
		const { playlists, session, storage, before, client, savedId } =
			await setup();
		connectPlaylistsToSession(session, playlists);
		await playlists.getState().loadList();
		await settled(playlists);
		expect(playlists.getState().selection.status).toBe("ready");

		session.getState().logout();
		expect(playlists.getState().list.status).toBe("idle");
		expect(playlists.getState().selection.status).toBe("none");
		expect(storage.writes).toBe(0);
		expect(storage.data.get(SETTINGS_KEY)).toBe(before);

		await session.getState().boot();
		expect(session.getState().screen.name).toBe("signed-in");
		await playlists.getState().loadList();
		await settled(playlists);
		const { selection } = playlists.getState();
		expect(selection.status).toBe("ready");
		expect(selection.status === "ready" && selection.summary.id).toBe("pl1");
		expect(client.fetchItems).toHaveBeenCalledTimes(2);
		expect(savedId()).toBe("pl1");
	});
});

describe("connectLastPlaylist: unsubscribe", () => {
	it("stops saving and preselecting", async () => {
		const { playlists, session, storage, unsubscribe } = await setup({
			saved: null,
		});
		unsubscribe();
		await playlists.getState().select(pl2);
		session.getState().toSetup();
		expect(storage.writes).toBe(0);

		playlists.getState().clearSelection();
		playlists.getState().reset();
		await playlists.getState().loadList();
		expect(playlists.getState().selection.status).toBe("none");
	});

	it("stops preselecting", async () => {
		const { playlists, unsubscribe } = await setup();
		unsubscribe();
		await playlists.getState().loadList();
		expect(playlists.getState().selection.status).toBe("none");
	});
});
