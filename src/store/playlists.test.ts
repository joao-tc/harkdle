import { describe, expect, it, vi } from "vitest";
import { SpotifyApiError } from "@/spotify/api";
import type {
	PlaylistLookup,
	PlaylistSummary,
	PlaylistsClient,
} from "@/spotify/playlists";
import { createPlaylistsStore, type PlaylistsState } from "./playlists";

type Rec = Record<string, unknown>;
type Progress = ((loaded: number, total: number) => void) | undefined;

const USER = "me_user";
const LINK_ID = "37i9dQZF1DXcBWIGoYBM5M"; // synthetic 22-char base62

function summary(
	id: string,
	over: Partial<PlaylistSummary> = {},
): PlaylistSummary {
	return {
		id,
		name: `List ${id}`,
		ownerName: "Me",
		coverUrl: null,
		trackCount: 20,
		collaborative: false,
		owned: true,
		...over,
	};
}

// A raw item wrapper in the verified shape; every name and id is invented.
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

const items = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, i) => item(prefix, i));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function harness(opts: { userId?: string | null } = {}) {
	const state = { userId: opts.userId === undefined ? USER : opts.userId };
	const client = {
		listMine: vi.fn<PlaylistsClient["listMine"]>(async () => []),
		lookup: vi.fn<PlaylistsClient["lookup"]>(async (id) => ({
			kind: "ok",
			summary: summary(id),
		})),
		fetchItems: vi.fn<PlaylistsClient["fetchItems"]>(async (id) =>
			items(id, 12),
		),
	};
	const onUnauthorized = vi.fn();
	const store = createPlaylistsStore({
		client,
		getUserId: () => state.userId,
		onUnauthorized,
	});
	const get = (): PlaylistsState => store.getState();
	return { client, onUnauthorized, store, get, state };
}

// Lets a test hold one fetchItems call open and resolve it later.
function holdItems(h: ReturnType<typeof harness>, id: string) {
	const d = deferred<readonly unknown[]>();
	const captured: { progress: Progress } = { progress: undefined };
	const previous = h.client.fetchItems.getMockImplementation();
	h.client.fetchItems.mockImplementation((requested, progress) => {
		if (requested !== id)
			return previous ? previous(requested, progress) : Promise.resolve([]);
		captured.progress = progress;
		return d.promise;
	});
	return { ...d, captured };
}

describe("loadList", () => {
	it("goes idle -> loading -> ready", async () => {
		const h = harness();
		const list = [summary("a"), summary("b")];
		const d = deferred<readonly PlaylistSummary[]>();
		h.client.listMine.mockReturnValue(d.promise);
		expect(h.get().list).toEqual({ status: "idle" });
		const done = h.get().loadList();
		expect(h.get().list).toEqual({ status: "loading" });
		d.resolve(list);
		await done;
		expect(h.get().list).toEqual({ status: "ready", playlists: list });
		expect(h.client.listMine).toHaveBeenCalledWith(USER);
	});

	it("an empty list is a ready state, not an error", async () => {
		const h = harness();
		await h.get().loadList();
		expect(h.get().list).toEqual({ status: "ready", playlists: [] });
	});

	it("always refetches", async () => {
		const h = harness();
		await h.get().loadList();
		await h.get().loadList();
		expect(h.client.listMine).toHaveBeenCalledTimes(2);
	});

	it("concurrent calls share one request", async () => {
		const h = harness();
		const d = deferred<readonly PlaylistSummary[]>();
		h.client.listMine.mockReturnValue(d.promise);
		const a = h.get().loadList();
		const b = h.get().loadList();
		d.resolve([summary("a")]);
		await Promise.all([a, b]);
		expect(h.client.listMine).toHaveBeenCalledTimes(1);
		expect(h.get().list).toEqual({
			status: "ready",
			playlists: [summary("a")],
		});
	});

	it("a failure is an error state with the typed kind", async () => {
		const h = harness();
		h.client.listMine.mockRejectedValue(
			new SpotifyApiError("rate-limited", "x", 429),
		);
		await h.get().loadList();
		expect(h.get().list).toEqual({ status: "error", error: "rate-limited" });
		expect(h.onUnauthorized).not.toHaveBeenCalled();
	});

	it("an error is not cached: the next call retries", async () => {
		const h = harness();
		h.client.listMine.mockRejectedValueOnce(
			new SpotifyApiError("network", "x"),
		);
		await h.get().loadList();
		await h.get().loadList();
		expect(h.get().list).toEqual({ status: "ready", playlists: [] });
		expect(h.client.listMine).toHaveBeenCalledTimes(2);
	});

	it("unauthorized calls onUnauthorized exactly once", async () => {
		const h = harness();
		h.client.listMine.mockRejectedValue(
			new SpotifyApiError("unauthorized", "x", 401),
		);
		await h.get().loadList();
		expect(h.get().list).toEqual({ status: "error", error: "unauthorized" });
		expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("no user id is unauthorized, without a request", async () => {
		const h = harness({ userId: null });
		await h.get().loadList();
		expect(h.get().list).toEqual({ status: "error", error: "unauthorized" });
		expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
		expect(h.client.listMine).not.toHaveBeenCalled();
	});

	it("any non-API throw becomes unexpected", async () => {
		const h = harness();
		h.client.listMine.mockRejectedValue(new TypeError("boom"));
		await h.get().loadList();
		expect(h.get().list).toEqual({ status: "error", error: "unexpected" });
	});
});

describe("select", () => {
	it("goes loading (with progress) -> ready with the playlist and its gate", async () => {
		const h = harness();
		const held = holdItems(h, "a");
		const done = h.get().select(summary("a", { trackCount: 12 }));
		expect(h.get().selection).toMatchObject({
			status: "loading",
			summary: { id: "a" },
			loaded: 0,
			total: 12,
		});
		held.captured.progress?.(5, 12);
		expect(h.get().selection).toMatchObject({
			status: "loading",
			loaded: 5,
			total: 12,
		});
		held.resolve(items("a", 12));
		await done;
		const sel = h.get().selection;
		if (sel.status !== "ready")
			throw new Error(`expected ready, got ${sel.status}`);
		expect(sel.summary.id).toBe("a");
		expect(sel.playlist.tracks).toHaveLength(12);
		expect(sel.playlist.report).toMatchObject({ total: 12, usable: 12 });
		expect(
			sel.playlist.index.suggest("title", "song a1").length,
		).toBeGreaterThan(0);
		expect(sel.gate).toEqual({ ok: true });
	});

	it("carries the too-few gate for a short playlist (R4)", async () => {
		const h = harness();
		h.client.fetchItems.mockResolvedValue(items("a", 9));
		await h.get().select(summary("a"));
		expect(h.get().selection).toMatchObject({
			status: "ready",
			gate: { ok: false, reason: "too-few", usable: 9, needed: 10 },
		});
	});

	it("an empty playlist is ready with too-few, not an error", async () => {
		const h = harness();
		h.client.fetchItems.mockResolvedValue([]);
		await h.get().select(summary("a"));
		expect(h.get().selection).toMatchObject({
			status: "ready",
			gate: { ok: false, reason: "too-few", usable: 0 },
		});
	});

	it("serves a re-selected playlist from the cache synchronously, with no client call", async () => {
		const h = harness();
		await h.get().select(summary("a"));
		await h.get().select(summary("b"));
		expect(h.client.fetchItems).toHaveBeenCalledTimes(2);
		const pending = h.get().select(summary("a"));
		expect(h.get().selection).toMatchObject({
			status: "ready",
			summary: { id: "a" },
		});
		await pending;
		expect(h.client.fetchItems).toHaveBeenCalledTimes(2);
	});

	it("selecting the same id twice while it loads runs one request chain", async () => {
		const h = harness();
		const held = holdItems(h, "a");
		const first = h.get().select(summary("a"));
		const second = h.get().select(summary("a"));
		held.resolve(items("a", 12));
		await Promise.all([first, second]);
		expect(h.client.fetchItems).toHaveBeenCalledTimes(1);
		expect(h.get().selection).toMatchObject({ status: "ready" });
	});

	it("progress is ignored once another playlist is the loading selection", async () => {
		const h = harness();
		const a = holdItems(h, "a");
		const b = holdItems(h, "b");
		void h.get().select(summary("a", { trackCount: 100 }));
		void h.get().select(summary("b", { trackCount: 50 }));
		a.captured.progress?.(90, 100);
		expect(h.get().selection).toMatchObject({
			status: "loading",
			summary: { id: "b" },
			loaded: 0,
			total: 50,
		});
		b.captured.progress?.(10, 50);
		expect(h.get().selection).toMatchObject({ loaded: 10, total: 50 });
		a.resolve([]);
		b.resolve([]);
	});

	describe("latest wins", () => {
		it("A (slow) then B (fast): ends on B, A's late result is dropped but cached", async () => {
			const h = harness();
			const a = holdItems(h, "a");
			const pendingA = h.get().select(summary("a"));
			const pendingB = h.get().select(summary("b"));
			await pendingB;
			expect(h.get().selection).toMatchObject({
				status: "ready",
				summary: { id: "b" },
			});

			a.resolve(items("a", 12));
			await pendingA;
			expect(h.get().selection).toMatchObject({
				status: "ready",
				summary: { id: "b" },
			});

			const callsBefore = h.client.fetchItems.mock.calls.length;
			void h.get().select(summary("a"));
			expect(h.get().selection).toMatchObject({
				status: "ready",
				summary: { id: "a" },
			});
			expect(h.client.fetchItems.mock.calls.length).toBe(callsBefore);
		});

		it("a superseded load's failure does not replace the current state", async () => {
			const h = harness();
			const a = holdItems(h, "a");
			const pendingA = h.get().select(summary("a"));
			await h.get().select(summary("b"));
			a.reject(new SpotifyApiError("network", "x"));
			await pendingA;
			expect(h.get().selection).toMatchObject({
				status: "ready",
				summary: { id: "b" },
			});
		});

		it("a cache hit supersedes a load in flight", async () => {
			const h = harness();
			await h.get().select(summary("b"));
			const a = holdItems(h, "a");
			const pendingA = h.get().select(summary("a"));
			void h.get().select(summary("b"));
			a.resolve(items("a", 12));
			await pendingA;
			expect(h.get().selection).toMatchObject({
				status: "ready",
				summary: { id: "b" },
			});
		});

		it("clearSelection supersedes a load in flight", async () => {
			const h = harness();
			const a = holdItems(h, "a");
			const pendingA = h.get().select(summary("a"));
			h.get().clearSelection();
			a.resolve(items("a", 12));
			await pendingA;
			expect(h.get().selection).toEqual({ status: "none" });
		});
	});

	describe("errors", () => {
		it("an items 403 shows restricted and does not call onUnauthorized", async () => {
			const h = harness();
			h.client.fetchItems.mockRejectedValue(
				new SpotifyApiError("restricted", "x", 403),
			);
			await h.get().select(summary("a"));
			expect(h.get().selection).toEqual({
				status: "error",
				summary: summary("a"),
				error: "restricted",
			});
			expect(h.onUnauthorized).not.toHaveBeenCalled();
		});

		it.each(["not-found", "rate-limited", "network", "unexpected"] as const)(
			"%s maps to the same kind",
			async (kind) => {
				const h = harness();
				h.client.fetchItems.mockRejectedValue(new SpotifyApiError(kind, "x"));
				await h.get().select(summary("a"));
				expect(h.get().selection).toMatchObject({
					status: "error",
					error: kind,
				});
				expect(h.onUnauthorized).not.toHaveBeenCalled();
			},
		);

		it("unauthorized calls onUnauthorized exactly once", async () => {
			const h = harness();
			h.client.fetchItems.mockRejectedValue(
				new SpotifyApiError("unauthorized", "x", 401),
			);
			await h.get().select(summary("a"));
			expect(h.get().selection).toMatchObject({
				status: "error",
				error: "unauthorized",
			});
			expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
		});

		it("any other thrown value becomes unexpected", async () => {
			const h = harness();
			h.client.fetchItems.mockRejectedValue("a string");
			await h.get().select(summary("a"));
			expect(h.get().selection).toMatchObject({
				status: "error",
				error: "unexpected",
			});
		});

		it("no user id is unauthorized, without a request", async () => {
			const h = harness({ userId: null });
			await h.get().select(summary("a"));
			expect(h.get().selection).toMatchObject({
				status: "error",
				error: "unauthorized",
			});
			expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
			expect(h.client.fetchItems).not.toHaveBeenCalled();
		});

		it("an error is not cached: a later select retries", async () => {
			const h = harness();
			h.client.fetchItems.mockRejectedValueOnce(
				new SpotifyApiError("network", "x"),
			);
			await h.get().select(summary("a"));
			expect(h.get().selection).toMatchObject({ status: "error" });
			await h.get().select(summary("a"));
			expect(h.get().selection).toMatchObject({ status: "ready" });
			expect(h.client.fetchItems).toHaveBeenCalledTimes(2);
		});
	});
});

describe("lookupLink", () => {
	it("an unparsable link is invalid-link with no client call", async () => {
		const h = harness();
		await h.get().lookupLink("https://example.com/nope");
		expect(h.get().paste).toEqual({ status: "error", error: "invalid-link" });
		expect(h.client.lookup).not.toHaveBeenCalled();
		expect(h.onUnauthorized).not.toHaveBeenCalled();
	});

	it("an ok lookup is found, and nothing is selected", async () => {
		const h = harness();
		const found = summary(LINK_ID);
		h.client.lookup.mockResolvedValue({ kind: "ok", summary: found });
		const done = h
			.get()
			.lookupLink(`https://open.spotify.com/playlist/${LINK_ID}?si=x`);
		expect(h.get().paste).toEqual({ status: "loading" });
		await done;
		expect(h.get().paste).toEqual({ status: "found", summary: found });
		expect(h.client.lookup).toHaveBeenCalledWith(LINK_ID, USER);
		expect(h.get().selection).toEqual({ status: "none" });
		expect(h.client.fetchItems).not.toHaveBeenCalled();
	});

	it("a restricted lookup is restricted and never requests items", async () => {
		const h = harness();
		const lookup: PlaylistLookup = {
			kind: "restricted",
			name: "Theirs",
			ownerName: "Other",
		};
		h.client.lookup.mockResolvedValue(lookup);
		await h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		expect(h.get().paste).toEqual({
			status: "restricted",
			name: "Theirs",
			ownerName: "Other",
		});
		expect(h.client.fetchItems).not.toHaveBeenCalled();
	});

	it("a throw is an error state", async () => {
		const h = harness();
		h.client.lookup.mockRejectedValue(
			new SpotifyApiError("not-found", "x", 404),
		);
		await h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		expect(h.get().paste).toEqual({ status: "error", error: "not-found" });
	});

	it("unauthorized calls onUnauthorized exactly once", async () => {
		const h = harness();
		h.client.lookup.mockRejectedValue(
			new SpotifyApiError("unauthorized", "x", 401),
		);
		await h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		expect(h.get().paste).toEqual({ status: "error", error: "unauthorized" });
		expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("no user id is unauthorized, without a request", async () => {
		const h = harness({ userId: null });
		await h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		expect(h.get().paste).toEqual({ status: "error", error: "unauthorized" });
		expect(h.client.lookup).not.toHaveBeenCalled();
	});

	it("never touches an existing selection", async () => {
		const h = harness();
		await h.get().select(summary("a"));
		const before = h.get().selection;
		await h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		await h.get().lookupLink("junk");
		expect(h.get().selection).toBe(before);
	});

	it("the latest lookup wins", async () => {
		const h = harness();
		const slow = deferred<PlaylistLookup>();
		h.client.lookup.mockReturnValueOnce(slow.promise);
		const first = h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		await h.get().lookupLink("junk");
		slow.resolve({ kind: "ok", summary: summary(LINK_ID) });
		await first;
		expect(h.get().paste).toEqual({ status: "error", error: "invalid-link" });
	});
});

describe("reload", () => {
	it("with no selection it is a no-op", async () => {
		const h = harness();
		await h.get().reload();
		expect(h.get().selection).toEqual({ status: "none" });
		expect(h.client.fetchItems).not.toHaveBeenCalled();
	});

	it("refetches the selected playlist and replaces its cache entry", async () => {
		const h = harness();
		h.client.fetchItems.mockResolvedValueOnce(items("a", 12));
		await h.get().select(summary("a"));
		h.client.fetchItems.mockResolvedValueOnce(items("a", 15));
		await h.get().reload();
		expect(h.client.fetchItems).toHaveBeenCalledTimes(2);
		expect(h.get().selection).toMatchObject({
			status: "ready",
			playlist: { report: { total: 15 } },
		});
		await h.get().select(summary("b"));
		await h.get().select(summary("a"));
		expect(h.get().selection).toMatchObject({
			playlist: { report: { total: 15 } },
		});
		expect(h.client.fetchItems).toHaveBeenCalledTimes(3); // a, a again (reload), b
	});

	it("a failed reload shows the error, but a later select still serves the old data", async () => {
		const h = harness();
		await h.get().select(summary("a"));
		h.client.fetchItems.mockRejectedValueOnce(
			new SpotifyApiError("network", "x"),
		);
		await h.get().reload();
		expect(h.get().selection).toMatchObject({
			status: "error",
			error: "network",
		});
		await h.get().select(summary("a"));
		expect(h.get().selection).toMatchObject({
			status: "ready",
			playlist: { report: { total: 12 } },
		});
		expect(h.client.fetchItems).toHaveBeenCalledTimes(2);
	});

	it("reloads after an error on the first load", async () => {
		const h = harness();
		h.client.fetchItems.mockRejectedValueOnce(
			new SpotifyApiError("network", "x"),
		);
		await h.get().select(summary("a"));
		await h.get().reload();
		expect(h.get().selection).toMatchObject({ status: "ready" });
	});

	it("unauthorized during reload calls onUnauthorized once", async () => {
		const h = harness();
		await h.get().select(summary("a"));
		h.client.fetchItems.mockRejectedValueOnce(
			new SpotifyApiError("unauthorized", "x", 401),
		);
		await h.get().reload();
		expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
	});
});

describe("clearSelection and reset", () => {
	it("clearSelection goes to none and keeps the cache", async () => {
		const h = harness();
		await h.get().select(summary("a"));
		h.get().clearSelection();
		expect(h.get().selection).toEqual({ status: "none" });
		await h.get().select(summary("a"));
		expect(h.get().selection).toMatchObject({ status: "ready" });
		expect(h.client.fetchItems).toHaveBeenCalledTimes(1);
	});

	it("reset returns list, paste and selection to initial and clears the cache", async () => {
		const h = harness();
		await h.get().loadList();
		await h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		await h.get().select(summary("a"));
		h.get().reset();
		expect(h.get().list).toEqual({ status: "idle" });
		expect(h.get().paste).toEqual({ status: "idle" });
		expect(h.get().selection).toEqual({ status: "none" });

		await h.get().select(summary("a"));
		expect(h.client.fetchItems).toHaveBeenCalledTimes(2);
		await h.get().loadList();
		expect(h.client.listMine).toHaveBeenCalledTimes(2);
	});

	it("a select in flight before reset cannot write into the fresh state", async () => {
		const h = harness();
		const a = holdItems(h, "a");
		const pending = h.get().select(summary("a"));
		h.get().reset();
		a.captured.progress?.(5, 20);
		a.resolve(items("a", 12));
		await pending;
		expect(h.get().selection).toEqual({ status: "none" });
	});

	it("a late failure after reset neither writes state nor calls onUnauthorized", async () => {
		const h = harness();
		const a = holdItems(h, "a");
		const pending = h.get().select(summary("a"));
		h.get().reset();
		a.reject(new SpotifyApiError("unauthorized", "x", 401));
		await pending;
		expect(h.get().selection).toEqual({ status: "none" });
		expect(h.onUnauthorized).not.toHaveBeenCalled();
	});

	it("a result from before reset cannot leak into a new selection of the same id", async () => {
		const h = harness();
		const old = holdItems(h, "a");
		const oldPending = h.get().select(summary("a"));
		h.get().reset();
		const fresh = holdItems(h, "a");
		const freshPending = h.get().select(summary("a", { trackCount: 40 }));
		old.captured.progress?.(30, 40);
		expect(h.get().selection).toMatchObject({
			status: "loading",
			loaded: 0,
			total: 40,
		});
		old.resolve(items("old", 12));
		await oldPending;
		expect(h.get().selection).toMatchObject({ status: "loading" });
		fresh.resolve(items("new", 12));
		await freshPending;
		const sel = h.get().selection;
		if (sel.status !== "ready")
			throw new Error(`expected ready, got ${sel.status}`);
		expect(sel.playlist.tracks[0]?.id).toBe("new0");
	});

	it("a list load in flight before reset cannot write into the fresh state", async () => {
		const h = harness();
		const d = deferred<readonly PlaylistSummary[]>();
		h.client.listMine.mockReturnValue(d.promise);
		const pending = h.get().loadList();
		h.get().reset();
		d.resolve([summary("a")]);
		await pending;
		expect(h.get().list).toEqual({ status: "idle" });
	});

	it("a lookup in flight before reset cannot write into the fresh state", async () => {
		const h = harness();
		const d = deferred<PlaylistLookup>();
		h.client.lookup.mockReturnValue(d.promise);
		const pending = h.get().lookupLink(`spotify:playlist:${LINK_ID}`);
		h.get().reset();
		d.resolve({ kind: "ok", summary: summary(LINK_ID) });
		await pending;
		expect(h.get().paste).toEqual({ status: "idle" });
	});
});
