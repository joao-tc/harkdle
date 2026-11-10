# Playlist loading, logic half (roadmap item 2) — spec

**Size:** Large (new shared contract across `spotify/`, `store/` and later `ui/`; adds a dependency and a data-fetching pattern)
**Sub-phase:** logic (the Picker screen is the visual half, specced after this merges)
**Status:** Draft
**Parent:** [specs/app-v1/spec.md](../app-v1/spec.md), item 2 (R2–R4)
**Branch:** `feat/2/playlist-loading-logic` (from `main`)

## Problem

The player needs to turn "one of my Spotify playlists" into a clean list of playable tracks and the suggestion lists the guess fields autocomplete from. Today nothing talks to the playlist endpoints, so the Picker, the game store and the guess fields have nothing to consume. This half builds all of it headlessly: the Web API client, the cleaning rules, the suggestion index and the store that holds the list, the selection and the load state. The Picker screen is built against it afterwards.

## Ambiguity ledger

The epic ledger (A1–A28) answers most rules. Rows below are the ones this item adds or narrows.

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| P1  | Does this planning cover the Picker screen? | Resolved | **No.** Logic only, in this folder. The visual half gets its own spec after logic merges, so its layout is decided against the real API. |
| P2  | How does TanStack Query fit the layering (invariant 3: `store/` and `spotify/` import no React, `ui/` never imports `spotify/`)? | Resolved | **`@tanstack/query-core` inside `src/store/`**, no React. The store exposes playlists, the selection and the load state as plain store state; `ui/` reads only the store. |
| P3  | What does Continue do before Setup exists? | Resolved | A **stand-in screen** (playlist name, usable count, Back), replaced by item 5. It belongs to the visual half. |
| P4  | How were the real API shapes captured? | Resolved | A read-only devtools snippet printed structure only (names, types, counts). Results are in **Verified API shapes** below. Fixtures are written from them. |
| P5  | How does cleaning resolve its corner cases? | Resolved | Check order: **local file → episode → unavailable → duplicate**; each removed item is counted once, so the reasons add up to the removed total. *Unavailable* = `is_playable === false`, a null item, or no `id`. Keep the **first** occurrence in playlist order. Dedupe by track ID, then ISRC; no ISRC means dedupe by ID only. A **missing** `is_playable` counts as playable (a failed cue is handled in-game by `trackFailed`). |
| P6  | How does typing match suggestions? | Resolved | Case-, accent- and punctuation-insensitive **substring** match from the first character. Matches that start with the query rank first, then alphabetical. **At most 8** are returned. Deduplicated after normalization, showing the first-seen spelling. |
| P7  | Which albums feed Album suggestions? | Resolved | **Only albums of kind `album`.** Singles, EPs and compilations are never suggested (their Album field is skipped). |
| P8  | What does the client do when a request fails? | Resolved | On **429**: wait, then retry, up to **3 attempts per request** with each wait capped at **10 s**. After that, or on any other failure, fail with a typed error. A failure on any page fails the whole load; there are **no partial playlists**. The UI offers Retry. |
| P9  | How long is a cleaned playlist reused? | Resolved | The **whole session**. A `reload` action refetches. Logout clears the cache. |
| P10 | Does the loader report progress? | Resolved | Yes: `onProgress(loaded, total)` per page, exposed by the store. |
| P11 | Which sources are out? | Resolved | **Liked Songs** (not a playlist; needs another scope), **followed-only** playlists and **Spotify-owned** playlists (Dev Mode returns no items for them). They are filtered from the grid. |
| P12 | How is a pasted link handled? | Resolved | Accept `spotify:playlist:<id>` and `https://open.spotify.com/playlist/<id>` (any `?si=` query and any `/intl-xx/` prefix). **Look up `GET /playlists/{id}` first.** If the user is neither owner nor collaborator, report the Dev Mode restriction **without requesting items**. |
| P13 | What happens on 401 mid-load? | Resolved | The playlist store reports `unauthorized` and the composition root routes to the existing **`session-expired`** Setup-error screen. |
| P14 | What goes into the test fixtures? | Resolved | **Synthetic**, shaped like the verified output (invented names, ids, ISRCs). No personal data enters the repo. |
| P15 | What proves the logic half before the Picker exists? | Resolved | Typecheck, lint and tests green (client, cleaning, index, store, with fake `fetch` and `sleep`), and the snippet output matching the fixtures. The first live end-to-end pagination happens in the visual half. |
| P16 | The local-file, episode, null-item, unplayable and collaborative cases were not seen live. How are they treated? | Resolved | **Proceed.** Code against the documented fields (`is_local`, `item.type`, `is_playable`, null item) with synthetic fixtures marked *documented, not yet seen live*. The visual half has a **required check**: the edge-case playlist loaded in the Picker shows the expected removal counts. |
| P17 | `Retry-After` is not in the browser-readable response headers. What does the 429 policy become? | Resolved | **Read it if present, else back off 1 s, 2 s, 4 s** (each wait capped at 10 s). That is the initial request plus **3 retries**, so P8's "3 attempts" means 3 retries. `FetchResponse` gains an optional `headers.get`. `sleep` is injected. |
| P18 | Is the last-used playlist preselected here? | Resolved | **No.** Persisting it is item 6 (A16, R16). Nothing in this item writes to `localStorage`. |

**Open: 0**

Category sweep: scope ✅ (P1, P3, P11, P18; Picker, preselect and cancellation are out) · rules ✅ (P5–P7, P12; the Dev Mode owned-or-collaborative rule from game-design.md) · layer ✅ (`spotify/` client, cleaning, index; `store/` query-core store; nothing in `game/` or `ui/` changes) · build order ✅ (item 0 and item 1 are merged; `normalize` from item 1 is reused) · data ✅ (all in memory, nothing persisted, so no schema version; P9, P18) · time/random ✅ (no ambient time or randomness; `sleep` is injected, P17; query-core is configured with `staleTime: Infinity` so it schedules nothing) · behavior ✅ (rapid re-selection, reload, logout in Edge cases) · errors ✅ (P8, P13, typed errors) · contracts ✅ (design: `PlaylistSummary`, `PlaylistTrack`, `CleaningReport`, `PlaylistsClient`, store state) · platform ✅ (desktop Chrome, A4; `Retry-After` unreadable, P17) · non-functional ✅ (index build is linear in tracks; no budget beyond that) · fairness ✅ (single-player, client-side) · done ✅ (P15, P16)

## Verified API shapes

Captured on 2026-11-10 from the owner's account (Dev Mode, desktop Chrome). Field names and types only.

| Endpoint | Verified |
| -------- | -------- |
| `GET /me/playlists?limit=50` | 200. Page object with `items[]`, `next`, `total`. Each playlist has `id`, `name`, `collaborative`, `public`, `owner.id`, `owner.display_name`, `snapshot_id`, `uri`, `images[]` (here 1 entry whose `width`/`height` are `null`) and **`items: { href, total }`** (the renamed `tracks`). The account's 21 playlists include 11 owned and 10 followed-only, which come back in the same list. |
| `GET /playlists/{id}` (owned) | 200. The same playlist fields, but `items` is a **full page object** (`{ href, items[], limit, next, offset, previous, total }`), so a metadata lookup also returns the first page of items. |
| `GET /playlists/{id}` (followed, not owned) | 200 with the same metadata and **no `items` field**. `owner.id` differs from the user's id and `collaborative` is false. |
| `GET /playlists/{id}/items?market=from_token&limit=100` (owned) | 200, `limit=100` accepted, `next` is an absolute URL. Wrapper keys: `added_at`, `added_by`, `is_local`, `primary_color`, `item`, `video_thumbnail`. |
| `GET /playlists/{id}/items?…` (followed, not owned) | **403** `Forbidden`. |

Track `item` fields seen on 108/108 items: `type: "track"`, `id`, `uri`, `name`, `is_playable: true`, `is_local: false`, `duration_ms`, `external_ids.isrc`, `artists[]` (`name`, 1 to 5 per track), `album.name`, `album.album_type` (`album` 82, `single` 23, `compilation` 3), `album.images[]` (3 entries, 640 / 300 / 64 px). The item also carries `episode` and `track` boolean flags. `linked_from` and `restrictions` never appear.

Response headers readable from the browser: `cache-control`, `content-length`, `content-type` only. `Retry-After` is **not** readable on 200 or 403 and is assumed unreadable on 429 (P17).

**Not yet seen live (P16):** episodes, local files, null items, `is_playable: false`, collaborative playlists, and a 429.

## Requirements

Epic requirement IDs are kept where this item delivers them. `P-` rows are this item's own.

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| R2  | WHEN the playlist list loads THEN the system SHALL read every page of `/me/playlists` and expose only playlists the user owns (`owner.id` equals the user's id) or that are `collaborative`. | P1 |
| P-1 | WHEN a pasted string is a Spotify playlist URI or `open.spotify.com` playlist URL (optional `?si=` and `/intl-xx/` prefix) THEN the system SHALL extract the playlist id, and WHEN it is anything else THEN it SHALL report `invalid-link`. | P1 |
| P-2 | WHEN a pasted id is looked up THEN the system SHALL call `GET /playlists/{id}` first, and WHEN the user is neither owner nor collaborator THEN it SHALL report `restricted` WITHOUT requesting items. | P1 |
| R3  | WHEN a playlist is selected THEN the system SHALL drop, in this order, local files, episodes, unavailable items (`is_playable === false`, null item, no `id`) and duplicates (same track ID, then same ISRC), keeping the first occurrence. | P1 |
| P-3 | WHEN cleaning finishes THEN the system SHALL return a report with the usable count and the removed count per reason (`local`, `episode`, `unavailable`, `duplicate`), where the reasons add up to the removed total and usable + removed equals the items fetched. | P1 |
| R4  | WHEN a cleaned playlist has fewer than 10 usable tracks THEN the store's selection SHALL be `ready: false` with reason `too-few`, carrying the usable count. | P1 |
| P-4 | WHEN items are fetched THEN the system SHALL request `/playlists/{id}/items?market=from_token&limit=100`, follow `next` through every page, follow it only when it stays on `https://api.spotify.com`, and call `onProgress(loaded, total)` after each page. | P1 |
| P-5 | WHEN a request returns 429 THEN the client SHALL wait (the `Retry-After` seconds if readable, else 1 s, 2 s, 4 s), capped at 10 s, and retry up to **3 times** (4 requests in all), then fail with `rate-limited`. | P1 |
| P-6 | WHEN a request fails THEN the client SHALL throw a typed `SpotifyApiError` of kind `unauthorized` (401, or no usable token), `restricted` (403), `not-found` (404), `rate-limited`, `network` or `unexpected`, and a failure on any page SHALL fail the whole load with no partial result. | P1 |
| P-7 | WHEN a usable item is mapped THEN the system SHALL produce the engine's `Track` (`id`, `title`, `artists` non-empty, `album: { name, kind }`) plus the playback fields the store keeps by id (`uri`, `durationMs`), where `album_type` `album`/`single`/`compilation` becomes the engine's `AlbumKind`. | P1 |
| P-8 | WHEN the suggestion index is built from usable tracks THEN `suggest(field, query)` SHALL return at most 8 entries of that field's own kind, deduplicated after `normalize`, matching by normalized substring with prefix matches first then alphabetical, and Album suggestions SHALL come only from albums of kind `album`. | P1 |
| P-9 | WHEN a playlist is selected THEN the store SHALL expose its state as `idle`, `loading` (with progress), `ready` (tracks, report, suggestion index) or `error` (typed), and a re-selected playlist SHALL be served from the session cache without a request. | P1 |
| P-10 | WHEN `reload` is called THEN the store SHALL refetch the selected playlist and replace the cached result, and WHEN the user logs out THEN it SHALL drop every cache entry and the selection. | P1 |
| P-11 | WHEN the player selects another playlist while one is loading THEN the latest selection SHALL win, and a result for a superseded selection SHALL NOT replace the current state (it may still be cached). | P1 |
| P-12 | WHEN any store action sees `unauthorized` THEN the playlists store SHALL call its injected `onUnauthorized`, and the session store SHALL expose `expire()`, which shows the existing `session-expired` Setup-error screen. (The composition root connects the two in the visual half.) | P1 |

## Edge cases

- WHEN a playlist has 0 items or only unusable items THEN the system SHALL return an empty usable list, a report accounting for every item, and `ready: false` (`too-few`).
- WHEN an item has no artists, or an empty title THEN it SHALL count as `unavailable` (the engine `Track` requires `artists[0]`).
- WHEN `/me/playlists` has no owned or collaborative playlists THEN the list SHALL be empty (a state, not an error).
- WHEN a playlist has no cover image THEN the summary SHALL carry `coverUrl: null`.
- WHEN a pasted link's playlist does not exist or is private THEN the system SHALL report `not-found`.
- WHEN a pasted link is an owned playlist THEN its metadata SHALL produce the same `PlaylistSummary` shape as a grid entry, so selecting it behaves identically.
- WHEN the same track is in the playlist twice by ID, or under two IDs with one ISRC THEN one SHALL remain and the other SHALL count as `duplicate`.
- WHEN `/items` returns 403 for a playlist the metadata said was accessible (collaborator edge) THEN it SHALL surface as `restricted`.
- WHEN the access token expires mid-pagination THEN each request SHALL take a fresh token from `getAccessToken`, which refreshes silently.
- WHEN `select` is called twice for the same id while it loads THEN one request chain SHALL run (query-core de-duplicates).
- WHEN a suggestion query is blank THEN `suggest` SHALL return no entries.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Picker screen, grid, paste box, cleaning-summary text, stand-in Continue screen | Visual half (P1, P3), specced after this merges. |
| Preselecting the last playlist | Item 6 persists settings (P18, A16). |
| Setup's "presets larger than the usable count are disabled" | Item 5 (A13). This item only provides the usable count. |
| Liked Songs, followed-only and Spotify-owned playlists | P11. |
| Cancelling an in-flight load | Superseded loads finish and are cached (P-11). Cancellation needs `signal` plumbing nobody needs yet. |
| Invalidating the cache by `snapshot_id` | P9: session cache plus manual reload. `snapshot_id` is available if that ever changes. |
| `fields=` trimming of responses | Unverified on the renamed endpoints. |
| Handling `linked_from` | Never seen on 912 + 108 items; relinking is a playback concern (item 3). |
| Persisting anything | P18. |
| Composition-root wiring (building the client and store in `main.tsx`, the real `sleep`, connecting `onUnauthorized` to `session.expire()`) | Nothing consumes the store until the Picker exists, so wiring now would be dead code. The visual half does it. |

## Done when

- [ ] `npm run typecheck`, `npm run lint` and `npm test` are green, and `npm run build` succeeds.
- [ ] The client, cleaning, mapping, suggestion index and store each have a test suite built on synthetic fixtures that pin the verified field names, with fake `fetch` and `sleep` (no real network, no real waiting).
- [ ] Invariants hold: `src/spotify/` and `src/store/` import no React, `src/ui/` does not import `spotify/` (new files covered by the existing Biome overrides), nothing under `src/game/` changes, and nothing is written to storage.
- [ ] The visual half's spec carries the P16 live check (edge-case playlist, expected removal counts) as a required item.
- [ ] Manual: re-running the probe snippet shows the same shapes the fixtures encode.
