import { type SpotifyApi, SpotifyApiError } from "./api";

export interface PlaylistSummary {
	readonly id: string;
	readonly name: string;
	readonly ownerName: string; // owner.display_name, falling back to owner.id
	readonly coverUrl: string | null; // images[0].url; null when there is no image
	readonly trackCount: number; // items.total: raw items, before cleaning; 0 if absent
	readonly collaborative: boolean;
	readonly owned: boolean; // owner.id === userId
}

export type PlaylistLookup =
	| { readonly kind: "ok"; readonly summary: PlaylistSummary }
	| {
			readonly kind: "restricted";
			readonly name: string;
			readonly ownerName: string;
	  };

export interface PlaylistsClient {
	// Every page of /me/playlists?limit=50, keeping only owned or collaborative playlists.
	listMine(userId: string): Promise<readonly PlaylistSummary[]>;
	// GET /playlists/{id}. "restricted" = neither owned nor collaborative; items are never requested.
	lookup(id: string, userId: string): Promise<PlaylistLookup>;
	// Every page of /playlists/{id}/items?market=from_token&limit=100, as raw wrappers.
	fetchItems(
		id: string,
		onProgress?: (loaded: number, total: number) => void,
	): Promise<readonly unknown[]>;
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpected(what: string): SpotifyApiError {
	return new SpotifyApiError("unexpected", what);
}

// The only place that reads a playlist object. Null when it lacks a string id or name, or an owner id.
function parsePlaylist(raw: unknown, userId: string): PlaylistSummary | null {
	if (!isRecord(raw)) return null;
	const { id, name, owner } = raw;
	if (typeof id !== "string" || typeof name !== "string") return null;
	if (!isRecord(owner) || typeof owner.id !== "string") return null;

	const displayName = owner.display_name;
	const ownerName =
		typeof displayName === "string" && displayName.trim() !== ""
			? displayName
			: owner.id;

	const images = raw.images;
	const first: unknown = Array.isArray(images) ? images[0] : undefined;
	const coverUrl =
		isRecord(first) && typeof first.url === "string" ? first.url : null;

	const items = raw.items;
	const trackCount =
		isRecord(items) && typeof items.total === "number" ? items.total : 0;

	return {
		id,
		name,
		ownerName,
		coverUrl,
		trackCount,
		collaborative: raw.collaborative === true,
		owned: owner.id === userId,
	};
}

function pageOf(body: unknown): {
	items: readonly unknown[];
	next: string | null;
	total: number | null;
} {
	if (!isRecord(body)) throw unexpected("response body is not an object");
	if (!Array.isArray(body.items))
		throw unexpected("response items is not an array");
	return {
		items: body.items as unknown[],
		next: typeof body.next === "string" ? body.next : null,
		total: typeof body.total === "number" ? body.total : null,
	};
}

export function createPlaylistsClient(api: SpotifyApi): PlaylistsClient {
	return {
		async listMine(userId) {
			const mine: PlaylistSummary[] = [];
			let target: string | null = "/me/playlists?limit=50";
			while (target !== null) {
				const page = pageOf(await api.get(target));
				for (const raw of page.items) {
					const summary = parsePlaylist(raw, userId);
					if (summary && (summary.owned || summary.collaborative)) {
						mine.push(summary);
					}
				}
				target = page.next;
			}
			return mine;
		},

		async lookup(id, userId) {
			const body = await api.get(`/playlists/${encodeURIComponent(id)}`);
			const summary = parsePlaylist(body, userId);
			if (summary === null) throw unexpected("playlist response is malformed");
			if (summary.owned || summary.collaborative)
				return { kind: "ok", summary };
			return {
				kind: "restricted",
				name: summary.name,
				ownerName: summary.ownerName,
			};
		},

		async fetchItems(id, onProgress) {
			const all: unknown[] = [];
			let target: string | null =
				`/playlists/${encodeURIComponent(id)}/items?market=from_token&limit=100`;
			while (target !== null) {
				const page = pageOf(await api.get(target));
				all.push(...page.items);
				onProgress?.(all.length, page.total ?? all.length);
				target = page.next;
			}
			return all;
		},
	};
}
