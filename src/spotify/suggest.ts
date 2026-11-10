import { normalize } from "@/game/normalize";
import type { Field, Track } from "@/game/types";

export const MAX_SUGGESTIONS = 8;

export interface SuggestionIndex {
	// Display strings of that field's own kind, at most MAX_SUGGESTIONS; [] for a blank query.
	suggest(field: Field, query: string): readonly string[];
}

interface Candidate {
	readonly key: string; // normalize(display)
	readonly display: string; // first-seen spelling
}

function candidatesOf(displays: Iterable<string>): readonly Candidate[] {
	const byKey = new Map<string, Candidate>();
	for (const display of displays) {
		const key = normalize(display);
		if (key !== "" && !byKey.has(key)) byKey.set(key, { key, display });
	}
	return [...byKey.values()];
}

function* titles(tracks: readonly Track[]): Iterable<string> {
	for (const t of tracks) yield t.title;
}

function* artists(tracks: readonly Track[]): Iterable<string> {
	for (const t of tracks) yield* t.artists;
}

// Only albums of kind "album": a single, EP or compilation never feeds the Album field (P7).
function* albums(tracks: readonly Track[]): Iterable<string> {
	for (const t of tracks) if (t.album.kind === "album") yield t.album.name;
}

function byKey(a: Candidate, b: Candidate): number {
	return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function rank(
	candidates: readonly Candidate[],
	query: string,
): readonly string[] {
	const prefix: Candidate[] = [];
	const inside: Candidate[] = [];
	for (const c of candidates) {
		if (c.key.startsWith(query)) prefix.push(c);
		else if (c.key.includes(query)) inside.push(c);
	}
	return [...prefix.sort(byKey), ...inside.sort(byKey)]
		.slice(0, MAX_SUGGESTIONS)
		.map((c) => c.display);
}

export function buildSuggestionIndex(
	tracks: readonly Track[],
): SuggestionIndex {
	const sets: Record<Field, readonly Candidate[]> = {
		title: candidatesOf(titles(tracks)),
		artist: candidatesOf(artists(tracks)),
		album: candidatesOf(albums(tracks)),
	};
	return {
		suggest(field, query) {
			const q = normalize(query);
			if (q === "") return [];
			return rank(sets[field], q);
		},
	};
}
