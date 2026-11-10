# Playlist loading, logic half — design

**Spec:** [spec.md](spec.md) · **ADR:** [ADR-0002](../../docs/adr/0002-server-data-via-query-core-in-the-store.md) (Accepted)

## Approach

Four small pieces in `src/spotify/` and one store in `src/store/`. A thin **API client** adds the bearer token, maps statuses to typed errors and applies the 429 policy. A **playlists client** uses it to list playlists, look one up and page through its items; it returns raw item wrappers. A pure **cleaning** function classifies each raw item (local, episode, unavailable, duplicate), maps the usable ones to `PlaylistTrack` and returns a report. A pure **suggestion index** turns the usable tracks into per-field autocomplete. The **playlists store** (Zustand vanilla, with a `query-core` `QueryClient` inside) calls the client, runs cleaning and indexing in the query function, caches the result for the session and exposes list, paste-lookup and selection state to `ui/`. All raw-JSON knowledge lives in two files (`playlists.ts` for playlist summaries, `clean.ts` for items); everything else sees typed values.

## Layer placement

| New piece | Layer | Depends on | Logic/Visual | Keeps invariants? |
| --------- | ----- | ---------- | ------------ | ----------------- |
| `spotify/api.ts` (`createSpotifyApi`, `SpotifyApiError`) | data | `auth.ts` (`FetchFn`) | logic | no React, `fetch` and `sleep` injected ✅ |
| `spotify/auth.ts` (`FetchResponse.headers?`) | data | nothing | logic | optional field, no behavior change ✅ |
| `spotify/playlistLink.ts` | data | nothing | logic | pure ✅ |
| `spotify/playlists.ts` (`createPlaylistsClient`) | data | `api.ts` | logic | no storage, no React ✅ |
| `spotify/clean.ts` (`cleanItems`, `continueGate`) | data | `game/types` | logic | pure ✅ |
| `spotify/suggest.ts` (`buildSuggestionIndex`) | data | `game/normalize`, `game/types` | logic | pure ✅ |
| `store/playlists.ts` (`createPlaylistsStore`) | store | `spotify/*`, `query-core` | logic | no React ✅ |
| `store/session.ts` (`expire()`) | store | nothing new | logic | ✅ |

`ui/` is untouched. No barrels. `src/game/` is untouched (`spotify → game` is an allowed direction: invariant 3).

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| `FetchFn`, `FetchResponse` | `src/spotify/auth.ts` | The one injected HTTP type; gains an optional `headers`. |
| `Auth.getAccessToken` | `src/spotify/auth.ts` | Called for **every** request attempt, so a refresh mid-pagination is silent. |
| `AccountUser`, `Screen`, `show()` | `src/store/session.ts` | `expire()` reuses the `session-expired` Setup-error. |
| `Track`, `AlbumKind`, `Field` | `src/game/types.ts` | `PlaylistTrack` extends `Track`; the index takes `Track`. |
| `normalize` | `src/game/normalize.ts` | The key for suggestion de-duplication **and** for the typed query. |
| `respond()`, `vi.fn<FetchFn>` test style | `src/spotify/account.test.ts` | Mirror for client tests. |
| `createSessionStore(deps)` + `harness()` | `src/store/session.ts`, `session.test.ts` | Mirror for the store's dependency injection and tests. |
| Biome overrides for `spotify/**`, `store/**`, `ui/**` | `biome.json` | Already enforce invariant 3 on every new file. Not edited. |

## Types and interfaces

### `spotify/api.ts` — HTTP with typed errors

**Layer:** data · **Responsibility:** one authenticated GET with the 429 policy and status mapping. Knows no endpoint.

```ts
import type { FetchFn } from "./auth";

export const API_BASE = "https://api.spotify.com/v1";
export const RATE_LIMIT_RETRIES = 3; // after the first request
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000]; // used when Retry-After is unreadable
export const MAX_WAIT_MS = 10_000;

export type ApiErrorKind =
	| "unauthorized" // 401, or getAccessToken threw
	| "restricted" // 403
	| "not-found" // 404
	| "rate-limited" // 429 after the last retry
	| "network" // fetchFn threw
	| "unexpected"; // anything else, including a non-JSON body or a bad target

export class SpotifyApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status: number | null; // HTTP status when there was a response
	constructor(kind: ApiErrorKind, message: string, status?: number);
}

export interface SpotifyApiDeps {
	getAccessToken: () => Promise<string>;
	fetchFn: FetchFn;
	sleep: (ms: number) => Promise<void>;
}

export interface SpotifyApi {
	// `target` is "/path?query" (joined to API_BASE) or an absolute URL that starts
	// with "https://api.spotify.com/". Anything else throws `unexpected` with no request.
	get(target: string): Promise<unknown>;
}
export function createSpotifyApi(deps: SpotifyApiDeps): SpotifyApi;
```

Per attempt, in order: take a token (`getAccessToken`; a throw is `unauthorized`); `fetchFn(url, { method: "GET", headers: { Authorization: "Bearer …" } })` (a throw is `network`); then by status: 2xx parse JSON (a parse failure is `unexpected`); 401 `unauthorized`; 403 `restricted`; 404 `not-found`; **429**: if retries remain, wait `min(MAX_WAIT_MS, retryAfterMs ?? BACKOFF_MS[retry])` via `sleep`, then repeat from the token step; otherwise `rate-limited`; any other status is `unexpected`. `retryAfterMs` is `Number(res.headers?.get("retry-after")) * 1000` when that is a finite number ≥ 0, else `undefined`.

`auth.ts` change (one line, type only):

```ts
export interface FetchResponse {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
	headers?: { get(name: string): string | null }; // new; the real Response has it
}
```

### `spotify/playlistLink.ts`

```ts
// Returns the 22-character base62 playlist id, or null for anything else.
// Accepts: spotify:playlist:<id> · spotify:user:<name>:playlist:<id> ·
// https://open.spotify.com/playlist/<id> and /intl-xx/playlist/<id>, with any ?query or #hash.
export function parsePlaylistLink(input: string): string | null;
```

Input is trimmed. Only the host `open.spotify.com` (https or http) is accepted for URLs. The id must match `^[A-Za-z0-9]{22}$`, so a malformed id never reaches the API.

### `spotify/playlists.ts` — endpoints and playlist-summary shapes

**Responsibility:** the only code that knows the shape of `/me/playlists` and `/playlists/{id}`, and how to page `/items`.

```ts
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
	| { readonly kind: "restricted"; readonly name: string; readonly ownerName: string };

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
export function createPlaylistsClient(api: SpotifyApi): PlaylistsClient;
```

Rules: a list entry that lacks a string `id` or `name`, or has no `owner.id`, is skipped. `fetchItems` reads each page's `items` (must be an array, else `unexpected`), reports `onProgress(loadedSoFar, page.total)` after each page, and follows `next` (string) until it is `null`. It passes `next` straight to `api.get`, whose origin check makes a foreign host an `unexpected` error, so a truncated list can never be returned silently. A body that is not an object is `unexpected`. Errors from `api` propagate unchanged.

### `spotify/clean.ts` — classification, mapping and the report

```ts
import type { Track } from "@/game/types";

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

export function cleanItems(items: readonly unknown[]): {
	readonly tracks: readonly PlaylistTrack[]; // playlist order, first occurrence kept
	readonly report: CleaningReport;
};

export type ContinueGate =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: "too-few"; readonly usable: number; readonly needed: number };
export function continueGate(report: CleaningReport): ContinueGate; // ok when usable >= MIN_USABLE_TRACKS
```

Per wrapper `w` (anything that is not an object is `unavailable`), `inner = w.item`:

1. **local** if `w.is_local === true` or `inner.is_local === true`.
2. **episode** if `inner.type === "episode"`.
3. **unavailable** if `inner` is not an object; or `inner.is_playable === false`; or any of these is missing or blank: string `id`, string `uri`, string `name`, number `duration_ms`, `album` as an object with a string `name`, or no artist with a non-blank string `name`. (A missing `is_playable` does **not** count: P5.)
4. **duplicate** if `inner.id` was already kept, or `inner.external_ids.isrc` (a non-blank string) was already kept.
5. Otherwise map it: `title = name`, `artists = artists[].name` (non-blank only, order kept), `album.name`, `album.kind` from `album.album_type` (`"single"` → `single`, `"compilation"` → `compilation`, anything else including missing → `album`), `coverUrl = album.images[0].url` if a string else `null`. Record its id and ISRC as seen.

Each item gets exactly one fate, which is what makes the report add up.

### `spotify/suggest.ts` — autocomplete

```ts
import type { Field, Track } from "@/game/types";

export const MAX_SUGGESTIONS = 8;

export interface SuggestionIndex {
	// Display strings of that field's own kind, at most MAX_SUGGESTIONS; [] for a blank query.
	suggest(field: Field, query: string): readonly string[];
}
export function buildSuggestionIndex(tracks: readonly Track[]): SuggestionIndex;
```

Candidate sets, in track order, each de-duplicated by `normalize(display)` and keeping the **first-seen spelling**: `title` = every track title; `artist` = every name in every track's `artists` (main and featured); `album` = `album.name` of tracks whose `album.kind === "album"` only (P7). `suggest` compares `normalize(query)` to each candidate's key: candidates whose key **starts with** the query come first, then those that merely **contain** it, each group ordered by key (plain `<` comparison, so the order is deterministic). The query is normalized with the same function as the keys, so typing a version tag matches its base title; that is consistent with A6 and is deliberate (D5).

### `store/playlists.ts` — what `ui/` reads

```ts
import type { ApiErrorKind } from "@/spotify/api";
import type { CleaningReport, ContinueGate, PlaylistTrack } from "@/spotify/clean";
import type { PlaylistsClient, PlaylistSummary } from "@/spotify/playlists";
import type { SuggestionIndex } from "@/spotify/suggest";

// ui/ may not import spotify/, so it gets every type it needs from here.
export type { ApiErrorKind, CleaningReport, ContinueGate, PlaylistSummary, PlaylistTrack, SuggestionIndex };

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
	| { readonly status: "restricted"; readonly name: string; readonly ownerName: string }
	| { readonly status: "error"; readonly error: ApiErrorKind | "invalid-link" };

export type Selection =
	| { readonly status: "none" }
	| { readonly status: "loading"; readonly summary: PlaylistSummary; readonly loaded: number; readonly total: number }
	| { readonly status: "ready"; readonly summary: PlaylistSummary; readonly playlist: LoadedPlaylist; readonly gate: ContinueGate }
	| { readonly status: "error"; readonly summary: PlaylistSummary; readonly error: ApiErrorKind };

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
export function createPlaylistsStore(deps: PlaylistsDeps): StoreApi<PlaylistsState>;
```

Behavior:

- **Query configuration.** One `QueryClient` per store. `loadList` uses `fetchQuery({ queryKey: ["playlists", userId], staleTime: 0, retry: false })`. `select` and `reload` use key `["playlist", id]`, `retry: false`, `gcTime: Infinity`, and `staleTime: Infinity` for `select` or `0` for `reload`. The query function for a playlist is `client.fetchItems(id, progress)` → `cleanItems` → `buildSuggestionIndex`, returning `LoadedPlaylist`; `progress` writes `loaded`/`total` into `selection` only while that playlist is still the loading selection.
- **`select`.** Sets `loading` (or, when `getQueryData(["playlist", id])` already holds data, sets `ready` at once with `gate: continueGate(report)` and returns). It takes a sequence number; after the await it applies the result only if that number is still the latest (**latest wins**, P-11). A superseded load still finishes into the cache.
- **Errors.** Any `SpotifyApiError` becomes `{ status: "error", error: kind }`; any other thrown value becomes `unexpected`. When the kind is `unauthorized`, `onUnauthorized()` is called once per failed action. `getUserId() === null` is treated as `unauthorized`.
- **`lookupLink`.** `parsePlaylistLink` null → `error: "invalid-link"` with no request. Otherwise `client.lookup`: `ok` → `found`, `restricted` → `restricted`, a throw → `error`.
- **`select` on a `restricted` failure** (items 403) shows `error: "restricted"` on the selection, the same kind the Picker explains for a pasted link.

`store/session.ts` change:

```ts
export interface SessionState {
	// …existing
	expire(): void; // show({ name: "setup-error", error: "session-expired" })
}
```

## Data model

All in memory; nothing is persisted, so there is **no schema version** (invariant 4 does not apply, P18). Derived vs stored: `tracks`, `report` and `index` are derived from the raw items inside the query function and cached together as one `LoadedPlaylist`; `gate` is derived from `report` when the selection is built. Optional fields are absent rather than `undefined`-valued.

## Time & randomness

None in this item's logic. `sleep` is a dependency (`SpotifyApiDeps`) and the real one is created by the composition root in the visual half; tests pass a recording fake and never wait. `query-core` is configured with `gcTime: Infinity` and `staleTime` of `Infinity` or `0`, so it schedules no timers. Nothing here uses `Math.random`, `Date.now` or `new Date`.

## Error handling

| Failure | Behavior | Surfaced as |
| ------- | -------- | ----------- |
| `getAccessToken` throws | Abort the request | `SpotifyApiError("unauthorized")` → `onUnauthorized()` |
| 401 | Abort | `unauthorized` → `onUnauthorized()` |
| 403 on items | Abort | `restricted` (selection `error`) |
| 403 or foreign owner on a pasted lookup | No items requested | `PasteState` `restricted` with name and owner |
| 404 | Abort | `not-found` |
| 429 | Wait, retry up to 3 times, then abort | `rate-limited` |
| `fetchFn` throws | Abort, no retry | `network` |
| Any page fails mid-pagination | Abort the whole load, keep nothing | the page's error kind; no partial cache entry |
| `next` leaves `https://api.spotify.com/` | Abort | `unexpected` |
| Malformed body (not an object, `items` not an array) | Abort | `unexpected` |
| Malformed individual item | Counted, not fatal | `unavailable` in the report |
| Reload fails | Keep the previous cache entry; show the error | selection `error`; a later `select` of that id serves the old data |

## Integration points (shared touchpoints)

Serialized so no wave has two writers:

- `package.json`, `package-lock.json`: only **T7** (adds `@tanstack/query-core`).
- `src/spotify/auth.ts`: only **T1** (the optional `headers`).
- `src/store/session.ts`, `session.test.ts`: only **T3**.
- `.claude/skills/feature-dev/SKILL.md` (profile), `specs/app-v1/spec.md` (roadmap note): only **T8**.
- No barrels, no `main.tsx` or `App.tsx` change (composition root is the visual half), no Biome change.

## Decisions

| #   | Decision | Alternatives | Why | ADR? |
| --- | -------- | ------------ | --- | ---- |
| D1  | `query-core` `fetchQuery` called from store actions, results copied into Zustand | `QueryObserver`; react-query in `ui/`; Zustand only | One source of truth for `ui/`; keeps invariant 3. | **ADR-0002** |
| D2  | `PlaylistTrack extends Track` | A separate mapped type plus `toGameTrack()` | A `PlaylistTrack` already satisfies the engine's `Track`, so `createGame({ tracks })` takes it unchanged and the store looks a track up by `id` in the same array. Engine D1 ("store keeps the full track by id") still holds. | no |
| D3  | The playlists client returns raw item wrappers; `clean.ts` alone reads their fields | Client maps items to `PlaylistTrack` | Cleaning must see the raw wrapper (`is_local`, `type`, nulls) to classify it, so mapping and classification are one step. | no |
| D4  | `SuggestionIndex` is an object with a `suggest` method | Export a `suggest(index, …)` function | `ui/` may not import `spotify/`; a method needs no import. | no |
| D5  | Keys and the typed query both use the engine's `normalize` | A lighter fold for the query | One normalization everywhere (A6). Cost: typing a full version tag (`- remastered`) matches the base title. Harmless. | no |
| D6  | 429: first request plus 3 retries, `Retry-After` if readable else 1/2/4 s | Honour only `Retry-After`; fail fast | Header is not readable in the browser (verified on 200 and 403). | no |
| D7  | Pasted-link lookup uses plain `GET /playlists/{id}` | Add `fields=` | Verified, whereas `fields=` on the renamed endpoint is not. Cost: an owned playlist's response also carries its first 100 items (tens of KB, once per paste). | no |
| D8  | `MIN_USABLE_TRACKS = 10` lives in `spotify/clean.ts` | `GameConfig` | The engine is merged and this is a loading rule; Setup reads it through the store gate. | no |
| D9  | Unknown or missing `album_type` maps to `album`; a missing `album` makes the item `unavailable` | Map unknown to `single` | A guessable Album field beats silently skipping it, and `album.name` is required anyway. | no |
| D10 | The playlist **list** refetches on every `loadList()` (no session cache) | Cache like cleaned playlists | P9 covers cleaned playlists only. One cheap request lets a playlist created in Spotify appear without a reload. The Picker decides when to call it. | no |
| D11 | No composition-root wiring in this half | Wire `main.tsx` now | Nothing reads the store yet; wiring would be dead code. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| R2 | `playlists.ts` `listMine` (paging, owned-or-collaborative filter) |
| P-1 | `playlistLink.ts` |
| P-2 | `playlists.ts` `lookup`; `store` `lookupLink` (`restricted`, no items request) |
| R3 | `clean.ts` `cleanItems` |
| P-3 | `clean.ts` `CleaningReport` |
| R4 | `clean.ts` `continueGate`; store `Selection.ready.gate` |
| P-4 | `playlists.ts` `fetchItems`; `api.ts` origin check |
| P-5 | `api.ts` 429 policy |
| P-6 | `api.ts` `SpotifyApiError`; whole-load failure in `fetchItems` and the store |
| P-7 | `clean.ts` `PlaylistTrack extends Track` |
| P-8 | `suggest.ts` |
| P-9 | `store/playlists.ts` `Selection`, `fetchQuery` cache |
| P-10 | `store/playlists.ts` `reload`, `reset` |
| P-11 | `store/playlists.ts` sequence number in `select` |
| P-12 | `store/playlists.ts` `onUnauthorized`; `store/session.ts` `expire()` |
