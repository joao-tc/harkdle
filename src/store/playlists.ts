import { QueryClient } from "@tanstack/query-core";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { type ApiErrorKind, SpotifyApiError } from "@/spotify/api";
import {
	type CleaningReport,
	type ContinueGate,
	cleanItems,
	continueGate,
	type PlaylistTrack,
} from "@/spotify/clean";
import { parsePlaylistLink } from "@/spotify/playlistLink";
import type { PlaylistSummary, PlaylistsClient } from "@/spotify/playlists";
import { buildSuggestionIndex, type SuggestionIndex } from "@/spotify/suggest";

// ui/ may not import spotify/, so it gets every type it needs from here.
export type {
	ApiErrorKind,
	CleaningReport,
	ContinueGate,
	PlaylistSummary,
	PlaylistTrack,
	SuggestionIndex,
};

export interface LoadedPlaylist {
	readonly tracks: readonly PlaylistTrack[];
	readonly report: CleaningReport;
	readonly index: SuggestionIndex;
}

export type ListState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "ready"; readonly playlists: readonly PlaylistSummary[] }
	| { readonly status: "error"; readonly error: ApiErrorKind };

export type PasteState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "found"; readonly summary: PlaylistSummary }
	| {
			readonly status: "restricted";
			readonly name: string;
			readonly ownerName: string;
	  }
	| {
			readonly status: "error";
			readonly error: ApiErrorKind | "invalid-link";
	  };

export type Selection =
	| { readonly status: "none" }
	| {
			readonly status: "loading";
			readonly summary: PlaylistSummary;
			readonly loaded: number;
			readonly total: number;
	  }
	| {
			readonly status: "ready";
			readonly summary: PlaylistSummary;
			readonly playlist: LoadedPlaylist;
			readonly gate: ContinueGate;
	  }
	| {
			readonly status: "error";
			readonly summary: PlaylistSummary;
			readonly error: ApiErrorKind;
	  };

export interface PlaylistsDeps {
	client: PlaylistsClient;
	getUserId: () => string | null; // null when not signed in
	onUnauthorized: () => void;
}

export interface PlaylistsState {
	list: ListState;
	paste: PasteState;
	selection: Selection;
	loadList(): Promise<void>; // always refetches; concurrent calls share one request
	lookupLink(input: string): Promise<void>; // sets `paste`; never selects
	select(summary: PlaylistSummary): Promise<void>; // cache hit sets `ready` synchronously
	reload(): Promise<void>; // refetch the selected playlist, replacing its cache entry
	clearSelection(): void; // back to "none"; keeps the cache
	reset(): void; // logout: list, paste and selection to initial, cache cleared
}

function kindOf(e: unknown): ApiErrorKind {
	return e instanceof SpotifyApiError ? e.kind : "unexpected";
}

function ready(summary: PlaylistSummary, playlist: LoadedPlaylist): Selection {
	return {
		status: "ready",
		summary,
		playlist,
		gate: continueGate(playlist.report),
	};
}

function loading(summary: PlaylistSummary): Selection {
	return { status: "loading", summary, loaded: 0, total: summary.trackCount };
}

const playlistKey = (id: string) => ["playlist", id] as const;

export function createPlaylistsStore(
	deps: PlaylistsDeps,
): StoreApi<PlaylistsState> {
	const { client, getUserId, onUnauthorized } = deps;

	// Query is only a session cache with in-flight de-duplication (ADR-0002): no retries (the
	// client owns the 429 policy) and nothing is ever garbage-collected on a timer.
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
		},
	});

	// `epoch` changes on reset(): whatever was in flight before it must not touch the fresh state.
	// The others make the latest call of each kind win.
	let epoch = 0;
	let listSeq = 0;
	let pasteSeq = 0;
	let selectionSeq = 0;

	return createStore<PlaylistsState>()((set, get) => {
		// Runs a playlist load and applies its outcome to `selection` unless it was superseded.
		async function load(
			summary: PlaylistSummary,
			fresh: boolean,
		): Promise<void> {
			const { id } = summary;
			const mySeq = ++selectionSeq;
			const myEpoch = epoch;
			const current = () => myEpoch === epoch && mySeq === selectionSeq;

			if (getUserId() === null) {
				set({ selection: { status: "error", summary, error: "unauthorized" } });
				onUnauthorized();
				return;
			}

			set({ selection: loading(summary) });

			const progress = (loaded: number, total: number) => {
				const sel = get().selection;
				if (
					myEpoch === epoch &&
					sel.status === "loading" &&
					sel.summary.id === id
				) {
					set({ selection: { ...sel, loaded, total } });
				}
			};

			try {
				const playlist = await queryClient.fetchQuery<LoadedPlaylist>({
					queryKey: playlistKey(id),
					staleTime: fresh ? 0 : Number.POSITIVE_INFINITY,
					queryFn: async () => {
						const raw = await client.fetchItems(id, progress);
						const { tracks, report } = cleanItems(raw);
						return { tracks, report, index: buildSuggestionIndex(tracks) };
					},
				});
				if (current()) set({ selection: ready(summary, playlist) });
			} catch (e) {
				if (myEpoch !== epoch) return;
				const error = kindOf(e);
				if (current()) set({ selection: { status: "error", summary, error } });
				if (error === "unauthorized") onUnauthorized();
			}
		}

		return {
			list: { status: "idle" },
			paste: { status: "idle" },
			selection: { status: "none" },

			async loadList() {
				const mySeq = ++listSeq;
				const myEpoch = epoch;
				const userId = getUserId();
				if (userId === null) {
					set({ list: { status: "error", error: "unauthorized" } });
					onUnauthorized();
					return;
				}
				set({ list: { status: "loading" } });
				try {
					const playlists = await queryClient.fetchQuery({
						queryKey: ["playlists", userId],
						staleTime: 0,
						queryFn: () => client.listMine(userId),
					});
					if (myEpoch === epoch && mySeq === listSeq) {
						set({ list: { status: "ready", playlists } });
					}
				} catch (e) {
					if (myEpoch !== epoch) return;
					const error = kindOf(e);
					if (mySeq === listSeq) set({ list: { status: "error", error } });
					if (error === "unauthorized") onUnauthorized();
				}
			},

			async lookupLink(input) {
				const mySeq = ++pasteSeq;
				const myEpoch = epoch;
				const id = parsePlaylistLink(input);
				if (id === null) {
					set({ paste: { status: "error", error: "invalid-link" } });
					return;
				}
				const userId = getUserId();
				if (userId === null) {
					set({ paste: { status: "error", error: "unauthorized" } });
					onUnauthorized();
					return;
				}
				set({ paste: { status: "loading" } });
				try {
					const result = await client.lookup(id, userId);
					if (myEpoch !== epoch || mySeq !== pasteSeq) return;
					set({
						paste:
							result.kind === "ok"
								? { status: "found", summary: result.summary }
								: {
										status: "restricted",
										name: result.name,
										ownerName: result.ownerName,
									},
					});
				} catch (e) {
					if (myEpoch !== epoch) return;
					const error = kindOf(e);
					if (mySeq === pasteSeq) set({ paste: { status: "error", error } });
					if (error === "unauthorized") onUnauthorized();
				}
			},

			async select(summary) {
				const cached = queryClient.getQueryData<LoadedPlaylist>(
					playlistKey(summary.id),
				);
				if (cached !== undefined) {
					selectionSeq++; // a cache hit is a selection too: it supersedes any load in flight
					set({ selection: ready(summary, cached) });
					return;
				}
				await load(summary, false);
			},

			async reload() {
				const { selection } = get();
				if (selection.status === "none") return;
				await load(selection.summary, true);
			},

			clearSelection() {
				selectionSeq++;
				set({ selection: { status: "none" } });
			},

			reset() {
				epoch++;
				listSeq++;
				pasteSeq++;
				selectionSeq++;
				queryClient.clear();
				set({
					list: { status: "idle" },
					paste: { status: "idle" },
					selection: { status: "none" },
				});
			},
		};
	});
}
