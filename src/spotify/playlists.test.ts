import { describe, expect, it, vi } from "vitest";
import { createSpotifyApi, type SpotifyApi, SpotifyApiError } from "./api";
import type { FetchFn } from "./auth";
import { createPlaylistsClient } from "./playlists";

type Rec = Record<string, unknown>;

const USER = "me_user";
const API = "https://api.spotify.com/v1";

// Shaped like the verified output (spec.md §Verified API shapes); every name and id is invented.
function playlist(id: string, over: Rec = {}): Rec {
	return {
		id,
		name: `List ${id}`,
		collaborative: false,
		public: false,
		owner: { id: USER, display_name: "Me" },
		snapshot_id: `snap-${id}`,
		uri: `spotify:playlist:${id}`,
		images: [{ url: `https://img.test/${id}`, width: null, height: null }],
		items: { href: `${API}/playlists/${id}/items`, total: 12 },
		...over,
	};
}

const followed = (id: string) =>
	playlist(id, { owner: { id: "other", display_name: "Other Person" } });
const collab = (id: string) =>
	// documented, not yet seen live (P16)
	playlist(id, {
		owner: { id: "other", display_name: "Other Person" },
		collaborative: true,
	});

function page(
	items: unknown[],
	next: string | null,
	total = items.length,
): Rec {
	return {
		href: "h",
		items,
		limit: 50,
		next,
		offset: 0,
		previous: null,
		total,
	};
}

// A fake SpotifyApi that answers by exact target and records every call.
function fakeApi(routes: Record<string, unknown>) {
	const calls: string[] = [];
	const api: SpotifyApi = {
		get: vi.fn(async (target: string) => {
			calls.push(target);
			if (!(target in routes))
				throw new SpotifyApiError("not-found", target, 404);
			const out = routes[target];
			if (out instanceof Error) throw out;
			return out;
		}),
		put: vi.fn(async () => {}),
	};
	return { api, calls };
}

describe("listMine", () => {
	it("pages through /me/playlists?limit=50 and keeps owned or collaborative ones", async () => {
		const next = `${API}/me/playlists?offset=50&limit=50`;
		const { api, calls } = fakeApi({
			"/me/playlists?limit=50": page(
				[playlist("a"), followed("b"), collab("c")],
				next,
				5,
			),
			[next]: page([followed("d"), playlist("e")], null, 5),
		});
		const out = await createPlaylistsClient(api).listMine(USER);
		expect(out.map((p) => p.id)).toEqual(["a", "c", "e"]);
		expect(calls).toEqual(["/me/playlists?limit=50", next]);
	});

	it("with the verified mix (11 owned, 10 followed-only) returns the 11", async () => {
		const owned = Array.from({ length: 11 }, (_, i) => playlist(`o${i}`));
		const others = Array.from({ length: 10 }, (_, i) => followed(`f${i}`));
		const mixed = [...others.slice(0, 5), ...owned, ...others.slice(5)];
		const { api } = fakeApi({
			"/me/playlists?limit=50": page(mixed, null, 21),
		});
		expect(await createPlaylistsClient(api).listMine(USER)).toHaveLength(11);
	});

	it("returns [] (not an error) when nothing qualifies", async () => {
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([followed("a"), followed("b")], null),
		});
		expect(await createPlaylistsClient(api).listMine(USER)).toEqual([]);
	});

	it("returns [] for an empty page", async () => {
		const { api } = fakeApi({ "/me/playlists?limit=50": page([], null, 0) });
		expect(await createPlaylistsClient(api).listMine(USER)).toEqual([]);
	});

	it("maps a summary", async () => {
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([playlist("a")], null),
		});
		const [summary] = await createPlaylistsClient(api).listMine(USER);
		expect(summary).toEqual({
			id: "a",
			name: "List a",
			ownerName: "Me",
			coverUrl: "https://img.test/a",
			trackCount: 12,
			collaborative: false,
			owned: true,
		});
	});

	it("marks a collaborative playlist as not owned", async () => {
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([collab("c")], null),
		});
		const [summary] = await createPlaylistsClient(api).listMine(USER);
		expect(summary).toMatchObject({
			collaborative: true,
			owned: false,
			ownerName: "Other Person",
		});
	});

	it.each([
		["a null display_name", { id: USER, display_name: null }],
		["a blank display_name", { id: USER, display_name: "  " }],
		["no display_name", { id: USER }],
	])("falls back to owner.id with %s", async (_label, owner) => {
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([playlist("a", { owner })], null),
		});
		const [summary] = await createPlaylistsClient(api).listMine(USER);
		expect(summary?.ownerName).toBe(USER);
	});

	it.each([
		["no images", { images: [] }],
		["images missing", { images: undefined }],
		["a non-string url", { images: [{ url: 7 }] }],
	])("coverUrl is null with %s", async (_label, over) => {
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([playlist("a", over)], null),
		});
		const [summary] = await createPlaylistsClient(api).listMine(USER);
		expect(summary?.coverUrl).toBeNull();
	});

	it.each([
		["items missing", { items: undefined }],
		["items.total missing", { items: { href: "h" } }],
	])("trackCount is 0 with %s", async (_label, over) => {
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([playlist("a", over)], null),
		});
		const [summary] = await createPlaylistsClient(api).listMine(USER);
		expect(summary?.trackCount).toBe(0);
	});

	it("skips entries lacking a string id or name, or an owner id", async () => {
		const bad: unknown[] = [
			null,
			"x",
			playlist("a", { id: 5 }),
			playlist("b", { name: undefined }),
			playlist("c", { owner: undefined }),
			playlist("d", { owner: { display_name: "No Id" } }),
			playlist("good"),
		];
		const { api } = fakeApi({ "/me/playlists?limit=50": page(bad, null) });
		const out = await createPlaylistsClient(api).listMine(USER);
		expect(out.map((p) => p.id)).toEqual(["good"]);
	});

	it.each([
		["a non-object body", "nope"],
		["a null body", null],
		["items not an array", { items: {}, next: null }],
	])("%s -> unexpected", async (_label, body) => {
		const { api } = fakeApi({ "/me/playlists?limit=50": body });
		await expect(
			createPlaylistsClient(api).listMine(USER),
		).rejects.toMatchObject({
			kind: "unexpected",
		});
	});

	it("an error on page 2 rejects the whole call", async () => {
		const next = `${API}/me/playlists?offset=50&limit=50`;
		const { api } = fakeApi({
			"/me/playlists?limit=50": page([playlist("a")], next),
			[next]: new SpotifyApiError("rate-limited", "slow down", 429),
		});
		await expect(
			createPlaylistsClient(api).listMine(USER),
		).rejects.toMatchObject({
			kind: "rate-limited",
		});
	});
});

describe("lookup", () => {
	it("an owned playlist (items is a full page object) yields the same summary shape as the grid", async () => {
		const owned = playlist("a", {
			items: page([{ item: null }], null, 12), // a metadata lookup also returns the first page of items
		});
		const { api, calls } = fakeApi({
			"/playlists/a": owned,
			"/me/playlists?limit=50": page([playlist("a")], null),
		});
		const client = createPlaylistsClient(api);
		const result = await client.lookup("a", USER);
		const [fromGrid] = await client.listMine(USER);
		expect(result).toEqual({ kind: "ok", summary: fromGrid });
		expect(calls.filter((c) => c.includes("/items"))).toEqual([]);
	});

	it("a collaborative playlist yields ok", async () => {
		const { api } = fakeApi({ "/playlists/c": collab("c") });
		const result = await createPlaylistsClient(api).lookup("c", USER);
		expect(result).toMatchObject({
			kind: "ok",
			summary: { id: "c", collaborative: true, owned: false },
		});
	});

	it("a followed, non-owned playlist (no items field) is restricted, with name and owner", async () => {
		const f = followed("f");
		delete f.items;
		const { api, calls } = fakeApi({ "/playlists/f": f });
		const result = await createPlaylistsClient(api).lookup("f", USER);
		expect(result).toEqual({
			kind: "restricted",
			name: "List f",
			ownerName: "Other Person",
		});
		expect(calls).toEqual(["/playlists/f"]);
	});

	it("calls GET /playlists/{id} first and never /items", async () => {
		const { api, calls } = fakeApi({
			"/playlists/a": playlist("a"),
			"/playlists/f": followed("f"),
		});
		const client = createPlaylistsClient(api);
		await client.lookup("a", USER);
		await client.lookup("f", USER);
		expect(calls).toEqual(["/playlists/a", "/playlists/f"]);
	});

	it("a 404 propagates as not-found", async () => {
		const { api } = fakeApi({});
		await expect(
			createPlaylistsClient(api).lookup("zzz", USER),
		).rejects.toMatchObject({
			kind: "not-found",
		});
	});

	it("a malformed playlist body -> unexpected", async () => {
		const { api } = fakeApi({ "/playlists/a": { nope: true } });
		await expect(
			createPlaylistsClient(api).lookup("a", USER),
		).rejects.toMatchObject({
			kind: "unexpected",
		});
	});
});

describe("fetchItems", () => {
	const START = "/playlists/p/items?market=from_token&limit=100";

	it("starts at the items endpoint with market and limit, and returns the raw wrappers in order", async () => {
		const w = (n: number) => ({ item: { id: `t${n}` }, is_local: false });
		const { api, calls } = fakeApi({ [START]: page([w(1), w(2)], null) });
		const out = await createPlaylistsClient(api).fetchItems("p");
		expect(out).toEqual([w(1), w(2)]);
		expect(calls).toEqual([START]);
	});

	it("follows next until null, concatenating pages", async () => {
		const n2 = `${API}/playlists/p/items?offset=100&limit=100&market=from_token`;
		const n3 = `${API}/playlists/p/items?offset=200&limit=100&market=from_token`;
		const { api, calls } = fakeApi({
			[START]: page([1, 2], n2, 5),
			[n2]: page([3, 4], n3, 5),
			[n3]: page([5], null, 5),
		});
		expect(await createPlaylistsClient(api).fetchItems("p")).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(calls).toEqual([START, n2, n3]);
	});

	it("reports onProgress(loadedSoFar, total) once after each page", async () => {
		const n2 = `${API}/playlists/p/items?offset=2`;
		const { api } = fakeApi({
			[START]: page([1, 2], n2, 3),
			[n2]: page([3], null, 3),
		});
		const progress = vi.fn();
		await createPlaylistsClient(api).fetchItems("p", progress);
		expect(progress.mock.calls).toEqual([
			[2, 3],
			[3, 3],
		]);
	});

	it("an empty playlist yields [] with one progress call", async () => {
		const { api } = fakeApi({ [START]: page([], null, 0) });
		const progress = vi.fn();
		expect(await createPlaylistsClient(api).fetchItems("p", progress)).toEqual(
			[],
		);
		expect(progress.mock.calls).toEqual([[0, 0]]);
	});

	it("falls back to the loaded count when total is absent", async () => {
		const { api } = fakeApi({ [START]: { items: [1, 2], next: null } });
		const progress = vi.fn();
		await createPlaylistsClient(api).fetchItems("p", progress);
		expect(progress.mock.calls).toEqual([[2, 2]]);
	});

	it("encodes the playlist id in the path", async () => {
		const { api, calls } = fakeApi({
			"/playlists/a%2Fb/items?market=from_token&limit=100": page([], null),
		});
		await createPlaylistsClient(api).fetchItems("a/b");
		expect(calls).toHaveLength(1);
	});

	it.each([
		["a non-object body", "nope"],
		["a null body", null],
		["items not an array", { items: "x", next: null }],
		["items missing", { next: null }],
	])("%s -> unexpected", async (_label, body) => {
		const { api } = fakeApi({ [START]: body });
		await expect(
			createPlaylistsClient(api).fetchItems("p"),
		).rejects.toMatchObject({
			kind: "unexpected",
		});
	});

	it("an error on page 2 rejects the whole call with that error, after page 1 progress", async () => {
		const n2 = `${API}/playlists/p/items?offset=2`;
		const { api } = fakeApi({
			[START]: page([1, 2], n2, 4),
			[n2]: new SpotifyApiError("restricted", "forbidden", 403),
		});
		const progress = vi.fn();
		await expect(
			createPlaylistsClient(api).fetchItems("p", progress),
		).rejects.toMatchObject({
			kind: "restricted",
		});
		expect(progress.mock.calls).toEqual([[2, 4]]);
	});

	it("an items 403 on the first page propagates as restricted", async () => {
		const { api } = fakeApi({
			[START]: new SpotifyApiError("restricted", "forbidden", 403),
		});
		await expect(
			createPlaylistsClient(api).fetchItems("p"),
		).rejects.toMatchObject({
			kind: "restricted",
		});
	});

	it("a foreign-host next is an unexpected error, never a truncated list (real api, fake fetch)", async () => {
		const evil = "https://evil.test/v1/playlists/p/items?offset=100";
		const fetchFn = vi.fn<FetchFn>(async (url) => {
			if (url.startsWith("https://api.spotify.com/")) {
				return {
					ok: true,
					status: 200,
					json: async () => page([1, 2], evil, 200),
				};
			}
			throw new Error("must not be requested");
		});
		const api = createSpotifyApi({
			getAccessToken: async () => "tok",
			fetchFn,
			sleep: async () => {},
		});
		const err = await createPlaylistsClient(api)
			.fetchItems("p")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(SpotifyApiError);
		expect((err as SpotifyApiError).kind).toBe("unexpected");
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
