import type { AlbumKind, Track } from "@/game/types";

export const MIN_USABLE_TRACKS = 10; // A13 / R4

export interface PlaylistTrack extends Track {
	// `Track` (id, title, artists, album) is what the engine reads; these are kept by id for playback and the Reveal.
	readonly uri: string;
	readonly durationMs: number;
	readonly coverUrl: string | null; // album.images[0].url (the largest)
}

export type RemovalReason = "local" | "episode" | "unavailable" | "duplicate";

export interface CleaningReport {
	readonly total: number; // raw items fetched
	readonly usable: number; // tracks returned
	readonly removed: Readonly<Record<RemovalReason, number>>;
	// invariant: usable + sum(removed) === total
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

function albumKind(albumType: unknown): AlbumKind {
	if (albumType === "single") return "single";
	if (albumType === "compilation") return "compilation";
	return "album";
}

function firstImageUrl(album: Rec): string | null {
	const images = album.images;
	if (!Array.isArray(images)) return null;
	const first: unknown = images[0];
	return isRecord(first) && typeof first.url === "string" ? first.url : null;
}

// Maps a raw track object, or null when a field the engine or playback needs is missing or blank.
function mapTrack(inner: Rec): PlaylistTrack | null {
	const id = text(inner.id);
	const uri = text(inner.uri);
	const title = text(inner.name);
	const durationMs = inner.duration_ms;
	const album = inner.album;
	if (id === null || uri === null || title === null) return null;
	if (typeof durationMs !== "number") return null;
	if (!isRecord(album)) return null;
	const albumName = text(album.name);
	if (albumName === null) return null;

	const artists: string[] = [];
	if (Array.isArray(inner.artists)) {
		for (const artist of inner.artists as unknown[]) {
			const name = isRecord(artist) ? text(artist.name) : null;
			if (name !== null) artists.push(name);
		}
	}
	const [main, ...rest] = artists;
	if (main === undefined) return null;

	return {
		id,
		title,
		artists: [main, ...rest],
		album: { name: albumName, kind: albumKind(album.album_type) },
		uri,
		durationMs,
		coverUrl: firstImageUrl(album),
	};
}

function isrcOf(inner: Rec): string | null {
	const ids = inner.external_ids;
	return isRecord(ids) ? text(ids.isrc) : null;
}

// Each item gets exactly one fate, checked in this order:
// local, episode, unavailable, duplicate (first occurrence kept).
export function cleanItems(items: readonly unknown[]): {
	readonly tracks: readonly PlaylistTrack[];
	readonly report: CleaningReport;
} {
	const removed: Record<RemovalReason, number> = {
		local: 0,
		episode: 0,
		unavailable: 0,
		duplicate: 0,
	};
	const tracks: PlaylistTrack[] = [];
	const seenIds = new Set<string>();
	const seenIsrcs = new Set<string>();

	for (const wrapper of items) {
		if (!isRecord(wrapper)) {
			removed.unavailable++;
			continue;
		}
		const inner: unknown = wrapper.item;
		if (
			wrapper.is_local === true ||
			(isRecord(inner) && inner.is_local === true)
		) {
			removed.local++;
			continue;
		}
		if (isRecord(inner) && inner.type === "episode") {
			removed.episode++;
			continue;
		}
		if (!isRecord(inner) || inner.is_playable === false) {
			removed.unavailable++;
			continue;
		}
		const track = mapTrack(inner);
		if (track === null) {
			removed.unavailable++;
			continue;
		}
		const isrc = isrcOf(inner);
		if (seenIds.has(track.id) || (isrc !== null && seenIsrcs.has(isrc))) {
			removed.duplicate++;
			continue;
		}
		seenIds.add(track.id);
		if (isrc !== null) seenIsrcs.add(isrc);
		tracks.push(track);
	}

	return {
		tracks,
		report: { total: items.length, usable: tracks.length, removed },
	};
}

export type ContinueGate =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly reason: "too-few";
			readonly usable: number;
			readonly needed: number;
	  };

export function continueGate(report: CleaningReport): ContinueGate {
	if (report.usable >= MIN_USABLE_TRACKS) return { ok: true };
	return {
		ok: false,
		reason: "too-few",
		usable: report.usable,
		needed: MIN_USABLE_TRACKS,
	};
}
