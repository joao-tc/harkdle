import { normalize } from "@/game/normalize";
import type { Track } from "@/game/types";

export type ArtistMatch = "main" | "featured";

function matches(guess: string, value: string): boolean {
	const target = normalize(guess);
	return target !== "" && target === normalize(value);
}

export function matchTitle(guess: string, track: Track): boolean {
	return matches(guess, track.title);
}

export function matchArtist(guess: string, track: Track): ArtistMatch | null {
	if (matches(guess, track.artists[0])) return "main";
	return track.artists.slice(1).some((name) => matches(guess, name))
		? "featured"
		: null;
}

export function matchAlbum(guess: string, track: Track): boolean {
	return matches(guess, track.album.name);
}
