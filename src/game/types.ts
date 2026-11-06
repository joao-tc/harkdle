export type Step = 1 | 2 | 3 | 4 | 5 | 6;
export const STEPS: readonly Step[] = [1, 2, 3, 4, 5, 6];
export const LAST_STEP: Step = 6;

export type Field = "title" | "artist" | "album";
export type AlbumKind = "album" | "single" | "compilation"; // EPs arrive as "single"

// The rule data only. The store keeps the full Spotify track (uri, duration) by `id`.
export interface Track {
	readonly id: string;
	readonly title: string;
	readonly artists: readonly [string, ...string[]]; // artists[0] is the main artist
	readonly album: { readonly name: string; readonly kind: AlbumKind };
}

// Strings are the suggestion the player picked. An absent or blank field is "not submitted".
export type Guess = Partial<Record<Field, string>>;

export type Credit = "full" | "featured"; // "featured" only ever occurs on artist
export interface Lock {
	readonly step: Step;
	readonly credit: Credit;
}
export type Locks = Readonly<Partial<Record<Field, Lock>>>;
