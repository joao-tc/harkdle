# Playlist loading, logic half — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Done

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 1 | T1, T2, T3, T4, T5 | parallel — 5 subagents | one per task: `feat(spotify): …`, `feat(store): …` |
| 2 | T6 | sequential — playlists client | `feat(spotify): add playlists client` |
| 3 | T7 | sequential — playlists store + dependency | `feat(store): add playlists store` |
| 4 | T8 | sequential — docs | `docs: mark playlist-loading logic implemented` |

Every `Verify` uses `npm test -- <path>` (`vitest run <path>`, `node` environment) plus `npx biome check <own files>`. Subagents must not run `npm run dev`, `npm run build` or the full suite; they never edit `package.json`, `biome.json` or any file they do not own. The orchestrator runs the wave gate after each wave: `npm run lint` → `npm run typecheck` → `npm test` → `npm test -- tools/invariants`, plus `npm run build` after waves 3 and 4.

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | `createSpotifyApi` + `SpotifyApiError` + test, and the one-line `FetchResponse.headers?` | ⚠️ Cohesive (the type change exists only for the 429 policy) |
| T2 | `parsePlaylistLink` + test | ✅ Atomic |
| T3 | `SessionState.expire()` + test | ✅ Atomic |
| T4 | `cleanItems` + `continueGate` + `PlaylistTrack` + test | ⚠️ Cohesive (one file, one classification pass; the gate reads its report) |
| T5 | `buildSuggestionIndex` + test | ✅ Atomic |
| T6 | `createPlaylistsClient` (list, lookup, paged items) + test | ⚠️ Cohesive (one file, the only reader of playlist-summary JSON) |
| T7 | `createPlaylistsStore` + test, and the `@tanstack/query-core` dependency | ⚠️ Cohesive (one store; the dependency exists only for it) |
| T8 | Profile, roadmap and status notes | ✅ Atomic |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in an earlier wave? |
| ---- | ---------- | ---- | ---------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T4 | — (reads merged `game/types`) | 1 | ✅ |
| T5 | — (reads merged `game/normalize`, `game/types`) | 1 | ✅ |
| T6 | T1 (`SpotifyApi`, `SpotifyApiError`) | 2 | ✅ |
| T7 | T1, T2, T3, T4, T5, T6 | 3 | ✅ |
| T8 | T7 | 4 | ✅ |

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | data | `src/spotify/api.ts`, `src/spotify/api.test.ts`, `src/spotify/auth.ts` | — |
| 1 | T2 | data | `src/spotify/playlistLink.ts`, `src/spotify/playlistLink.test.ts` | — |
| 1 | T3 | store | `src/store/session.ts`, `src/store/session.test.ts` | — |
| 1 | T4 | data | `src/spotify/clean.ts`, `src/spotify/clean.test.ts` | — |
| 1 | T5 | data | `src/spotify/suggest.ts`, `src/spotify/suggest.test.ts` | — |
| 2 | T6 | data | `src/spotify/playlists.ts`, `src/spotify/playlists.test.ts` | — |
| 3 | T7 | store | `src/store/playlists.ts`, `src/store/playlists.test.ts`, `package.json`, `package-lock.json` (integration touchpoint) | — |
| 4 | T8 | docs | `.claude/skills/feature-dev/SKILL.md`, `specs/app-v1/spec.md`, `specs/playlist-loading-logic/spec.md`, `specs/playlist-loading-logic/design.md`, `specs/playlist-loading-logic/tasks.md` | — |

Touchpoints: `package.json` and the lockfile belong to T7 alone; `auth.ts` to T1 alone; `session.ts` to T3 alone. No barrel, no `main.tsx`/`App.tsx`, no Biome change (D11).

## Tasks

Common conventions (every code task): imports use the `@/…` alias for cross-layer imports and `./x` inside a folder; tests sit beside the source, are table-driven and deterministic, use `vitest`, and build their fixtures **synthetically** in the shape of spec.md §Verified API shapes (P14: invented names, ids and ISRCs, no personal data). Fixtures not yet seen live (episodes, local files, null items, `is_playable: false`, collaborative, 429) are commented `documented, not yet seen live` (P16). Optional fields are absent rather than `undefined`-valued. Use tabs, as the repo does.

Invariants for `src/spotify/**` tasks: **3** (no React, no zustand, no `ui/` or `store/` imports; `game/` imports are allowed) and **2-in-spirit** (no `Date.now`, `new Date`, `Math.random`; `fetch` and `sleep` are injected) and no storage access. For `src/store/**`: **3** (no React; import `spotify/` and `game/` only) and no storage access. `src/game/**` is not touched by any task.

### T1 — HTTP client with typed errors and the 429 policy

**Wave:** 1 · **Layer:** data · **Requirement:** P-5, P-6
**Depends on:** —
**Owns:** `src/spotify/api.ts`, `src/spotify/api.test.ts`, `src/spotify/auth.ts`
**Reads:** `specs/playlist-loading-logic/design.md` §`spotify/api.ts`, `src/spotify/auth.ts` (`FetchFn`), `src/spotify/account.ts` and `account.test.ts` (client style and the `respond()` / `vi.fn<FetchFn>` test shape)

**Do:** add the optional `headers?: { get(name: string): string | null }` to `FetchResponse` in `auth.ts`, and write `api.ts` exactly as in the design (`API_BASE`, `RATE_LIMIT_RETRIES`, `BACKOFF_MS`, `MAX_WAIT_MS`, `ApiErrorKind`, `SpotifyApiError`, `SpotifyApiDeps`, `SpotifyApi`, `createSpotifyApi`).

**Done when:**
- [ ] A relative `target` is joined to `API_BASE`; an absolute `https://api.spotify.com/…` target is used as is; any other target throws `unexpected` **with no request and no token fetch**.
- [ ] Each attempt (including each retry) calls `getAccessToken` afresh and sends `Authorization: Bearer <token>` via `GET`.
- [ ] Status mapping: 2xx → parsed JSON (parse failure → `unexpected`), 401 → `unauthorized`, 403 → `restricted`, 404 → `not-found`, other → `unexpected`; `getAccessToken` throwing → `unauthorized`; `fetchFn` throwing → `network` with no retry. `SpotifyApiError.status` carries the HTTP status when there was one, else `null`.
- [ ] 429 policy: waits `min(MAX_WAIT_MS, retryAfterMs ?? BACKOFF_MS[retry])` through the injected `sleep`, retries up to 3 times (4 requests in all), then throws `rate-limited`. Cases: unreadable header → 1000/2000/4000; `retry-after: 3` → 3000; `retry-after: 60` → capped at 10000; `retry-after: abc` or negative → backoff; success on the 2nd or 4th attempt; a 429 followed by a 401 → `unauthorized`.
- [ ] `sleep` is a recording fake; no test waits.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/spotify/api` → all passing; `npx biome check src/spotify/api.ts src/spotify/api.test.ts src/spotify/auth.ts` → clean.

### T2 — Pasted playlist link parser

**Wave:** 1 · **Layer:** data · **Requirement:** P-1
**Depends on:** —
**Owns:** `src/spotify/playlistLink.ts`, `src/spotify/playlistLink.test.ts`
**Reads:** `specs/playlist-loading-logic/design.md` §`spotify/playlistLink.ts`

**Do:** write `parsePlaylistLink(input: string): string | null` as specified.

**Done when:**
- [ ] Accepts `spotify:playlist:<id>`, `spotify:user:<name>:playlist:<id>`, `https://open.spotify.com/playlist/<id>` and `/intl-xx/playlist/<id>`, also `http://`, with any `?si=…` query or `#hash`, and surrounding whitespace.
- [ ] Rejects (returns `null`): a bare id, an id that is not 22 base62 characters, an album/track/artist URI or URL, another host (including look-alikes such as `open.spotify.com.evil.test` and `evilopen.spotify.com`), a user-info trick (`https://open.spotify.com@evil.test/playlist/<id>`), an empty string, and unparsable text.
- [ ] Never throws.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/spotify/playlistLink` → all passing; `npx biome check src/spotify/playlistLink.ts src/spotify/playlistLink.test.ts` → clean.

### T3 — Session `expire()`

**Wave:** 1 · **Layer:** store · **Requirement:** P-12
**Depends on:** —
**Owns:** `src/store/session.ts`, `src/store/session.test.ts`
**Reads:** `specs/playlist-loading-logic/design.md` §`store/session.ts` change, `src/store/session.ts`, `src/store/session.test.ts` (`harness()`), `src/App.tsx` (the only other `SessionState` consumer; must still typecheck)

**Do:** add `expire(): void` to `SessionState`, implemented as `show({ name: "setup-error", error: "session-expired" })`.

**Done when:**
- [ ] After `expire()` the screen is `{ name: "setup-error", error: "session-expired" }` from any prior screen (`signed-in`, `checking`, `login`).
- [ ] The existing `retry()` behaviour for `session-expired` (logout, then login screen) still passes after `expire()`.
- [ ] No existing test is changed or weakened.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/store/session` → all passing; `npx biome check src/store/session.ts src/store/session.test.ts` → clean.

### T4 — Cleaning, mapping and the report

**Wave:** 1 · **Layer:** data · **Requirement:** R3, P-3, P-7, R4 (gate), edge cases on empty and malformed items
**Depends on:** —
**Owns:** `src/spotify/clean.ts`, `src/spotify/clean.test.ts`
**Reads:** `specs/playlist-loading-logic/design.md` §`spotify/clean.ts`, spec.md §Verified API shapes and P5, `src/game/types.ts` (`Track`, `AlbumKind`)

**Do:** write `clean.ts` exactly as in the design (`MIN_USABLE_TRACKS`, `PlaylistTrack`, `RemovalReason`, `CleaningReport`, `cleanItems`, `ContinueGate`, `continueGate`), applying the five numbered steps per wrapper in that order.

**Done when:**
- [ ] A wrapper shaped like the verified output (the 108/108 field list, `external_ids.isrc`, 3 album images) maps to a `PlaylistTrack` with `id`, `title`, `artists` (non-blank names, order kept, non-empty), `album: { name, kind }`, `uri`, `durationMs`, and `coverUrl` = `album.images[0].url` (or `null` when there are no images).
- [ ] `album_type` `album`/`single`/`compilation` map to the same `AlbumKind`; unknown or missing maps to `album` (D9).
- [ ] Order of checks is local → episode → unavailable → duplicate, one fate per item: an item that is both local and unplayable counts as `local` only. Cases: `w.is_local` and `item.is_local`; `item.type === "episode"`; `is_playable: false`; `is_playable` **missing** (usable, P5); null `item`; wrapper not an object; missing `id`/`uri`/`name`/`duration_ms`; missing `album` or `album.name`; no artist, or only blank artist names; blank title.
- [ ] Duplicates: same `id` twice → one kept (the first, in playlist order); two ids sharing an ISRC → first kept; no ISRC → deduplicated by id only; a **removed** item's id/ISRC does not enter the seen sets (only kept items do).
- [ ] `usable + sum(removed) === total` on every case, including the empty list and an all-unusable list.
- [ ] `continueGate`: 9 usable → `{ ok: false, reason: "too-few", usable: 9, needed: 10 }`; 10 usable → `{ ok: true }`; 0 → too-few.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/spotify/clean` → all passing; `npx biome check src/spotify/clean.ts src/spotify/clean.test.ts` → clean.

### T5 — Suggestion index

**Wave:** 1 · **Layer:** data · **Requirement:** P-8
**Depends on:** —
**Owns:** `src/spotify/suggest.ts`, `src/spotify/suggest.test.ts`
**Reads:** `specs/playlist-loading-logic/design.md` §`spotify/suggest.ts`, `src/game/normalize.ts` and `normalize.test.ts` (what `normalize` folds), `src/game/types.ts`

**Do:** write `suggest.ts` exactly as in the design (`MAX_SUGGESTIONS`, `SuggestionIndex`, `buildSuggestionIndex`), using `normalize` for candidate keys and for the query.

**Done when:**
- [ ] `title` suggestions come from every track title, `artist` from every name in every `artists` array (main and featured), `album` from `album.name` of tracks whose `album.kind === "album"` only (a single/compilation album name is never suggested).
- [ ] Results are of that field's own kind, display strings as first seen, deduplicated by `normalize(display)`.
- [ ] Matching is a normalized substring from the first character: case-, accent- and punctuation-insensitive. Candidates whose key starts with the query come first, then those that only contain it, each group ordered by key with plain `<` comparison (deterministic).
- [ ] At most 8 entries; a blank or whitespace-only (or normalizes-to-empty) query returns `[]`; no match returns `[]`.
- [ ] An empty track list yields an index whose `suggest` returns `[]`.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/spotify/suggest` → all passing; `npx biome check src/spotify/suggest.ts src/spotify/suggest.test.ts` → clean.

### T6 — Playlists client

**Wave:** 2 · **Layer:** data · **Requirement:** R2, P-2, P-4, P-6 (whole-load failure)
**Depends on:** T1
**Owns:** `src/spotify/playlists.ts`, `src/spotify/playlists.test.ts`
**Reads:** `specs/playlist-loading-logic/design.md` §`spotify/playlists.ts`, spec.md §Verified API shapes, `src/spotify/api.ts` (`SpotifyApi`, `SpotifyApiError`; written by T1)

**Do:** write `playlists.ts` exactly as in the design (`PlaylistSummary`, `PlaylistLookup`, `PlaylistsClient`, `createPlaylistsClient`) on top of a fake `SpotifyApi` in tests.

**Done when:**
- [ ] `listMine(userId)` requests `/me/playlists?limit=50`, follows `next` through every page, keeps only playlists with `owner.id === userId` or `collaborative === true`, skips entries lacking a string `id`/`name` or `owner.id`, and returns `[]` (not an error) when none qualify. With the verified mix (11 owned, 10 followed-only across pages) it returns the 11.
- [ ] A summary has `ownerName` (`owner.display_name`, falling back to `owner.id`), `coverUrl` (`images[0].url`, or `null` with no images or a non-string url), `trackCount` (`items.total`, `0` if absent), `collaborative`, `owned`.
- [ ] `lookup` calls `GET /playlists/{id}` first and never `/items`: an owned playlist (whose `items` is a full page object, with `total` inside) and a collaborative one yield `ok` with the same `PlaylistSummary` shape as a grid entry; a followed-not-owned, non-collaborative one (no `items` field) yields `restricted` with `name` and `ownerName`. A 404 propagates as `not-found`.
- [ ] `fetchItems` starts at `/playlists/{id}/items?market=from_token&limit=100`, follows string `next` until `null`, returns the concatenated raw wrappers, and calls `onProgress(loadedSoFar, page.total)` once after each page.
- [ ] A foreign-host `next` surfaces as the `unexpected` error that `api.get` throws (use the real `createSpotifyApi` with a fake `fetchFn` for this one case, to prove no truncated list is returned); a body that is not an object, or whose `items` is not an array, throws `unexpected`; an error on page 2 rejects the whole call with that error; errors from `api` propagate unchanged.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/spotify/playlists` → all passing; `npx biome check src/spotify/playlists.ts src/spotify/playlists.test.ts` → clean.

### T7 — Playlists store (integration: adds the dependency)

**Wave:** 3 · **Layer:** store · **Requirement:** R4 (selection gate), P-2 (paste), P-9, P-10, P-11, P-12
**Depends on:** T1, T2, T3, T4, T5, T6
**Owns:** `src/store/playlists.ts`, `src/store/playlists.test.ts`, `package.json`, `package-lock.json`
**Reads:** `specs/playlist-loading-logic/design.md` §`store/playlists.ts` and §Error handling, `docs/adr/0002-server-data-via-query-core-in-the-store.md`, `src/store/session.ts` and `session.test.ts` (store-with-injected-deps style, `harness()`, `deferred()`), the files T1-T6 created

**Do:** run `npm install @tanstack/query-core`, then write `createPlaylistsStore` exactly as in the design (types re-exported for `ui/`; one `QueryClient` per store; the Query configuration, `select`, error and `lookupLink` behaviour from the design).

**Done when:**
- [ ] `@tanstack/query-core` is added to `dependencies` (not `@tanstack/react-query`), and only that package changed in `package.json`.
- [ ] `loadList`: `idle` → `loading` → `ready`/`error`; always refetches; concurrent calls share one request; `getUserId() === null` is `unauthorized`.
- [ ] `select`: `loading` (with `loaded`/`total` updated by progress only while that playlist is still the loading selection) → `ready` with `playlist` and `gate`; a re-selected playlist is served from the cache **synchronously** with no client call; `select` of the same id twice while loading runs one `fetchItems`; an `error` is not cached, so a later `select` retries.
- [ ] Latest wins: select A (slow) then B (fast) → the selection ends on B, A's late result does not replace it, and A is cached (selecting A afterwards is instant).
- [ ] Error mapping: `SpotifyApiError` kind → `{ status: "error", error: kind }` (items 403 → `restricted`); any other throw → `unexpected`; `unauthorized` calls `onUnauthorized()` exactly once per failed action; non-unauthorized errors do not.
- [ ] `lookupLink`: unparsable → `invalid-link` with no client call; `ok` → `found`; `restricted` → `restricted` (and `fetchItems` never called); a throw → `error`; it never touches `selection`.
- [ ] `reload` refetches the selected playlist and replaces its cache entry; a failed reload shows the error but a later `select` of that id still serves the old data; with no selection it is a no-op.
- [ ] `clearSelection` goes to `none` and keeps the cache. `reset` returns list, paste and selection to initial, clears the cache (a following `select` calls the client again), **and bumps the sequence number so a load that was in flight before the reset cannot write into the fresh state**.
- [ ] The test uses a fake `PlaylistsClient` and no real timers; nothing reads or writes storage; the file imports no React.
- [ ] Tests written and passing; biome clean on the owned files.

**Verify:** `npm test -- src/store/playlists` → all passing; `npx biome check src/store/playlists.ts src/store/playlists.test.ts` → clean.

### T8 — Docs and status

**Wave:** 4 · **Layer:** docs · **Requirement:** spec §Done when (visual-half hand-off)
**Depends on:** T7
**Owns:** `.claude/skills/feature-dev/SKILL.md`, `specs/app-v1/spec.md`, `specs/playlist-loading-logic/spec.md`, `specs/playlist-loading-logic/design.md`, `specs/playlist-loading-logic/tasks.md`
**Reads:** the wave 1-3 reports, spec.md §Done when

**Do:** edit only these lines: in the SKILL.md profile, replace "TanStack Query arrives with the playlist item." with "`@tanstack/query-core` inside `src/store/` (ADR-0002)."; in `specs/app-v1/spec.md` mark the logic half of roadmap item 2 implemented and add under it the visual half's **required live check** from P16 (the edge-case playlist loaded in the Picker shows the expected removal counts) and update the matching "edge-case playlist" bullet under *Needs verification*; set spec.md status to Implemented and fix design.md's ADR-0002 status (Accepted); set this file's status to Done.

**Done when:**
- [ ] The visual half's P16 live check is written down in `specs/app-v1/spec.md` where the visual spec will pick it up.
- [ ] No other line changed in those files.

**Verify:** `git diff --stat` shows only the five files; `npm run lint` → clean.

## Wave gate (orchestrator, after each wave)

1. Read every report; `Blocked`, `Partial` or a non-empty `Deviated` is handled before advancing.
2. `npm run lint` → `npm test -- tools/invariants` → `npm run typecheck` → `npm test`; after waves 3 and 4 also `npm run build`.
3. Confirm `git status` shows only the wave's owned files, and `git diff main -- src/game` is empty.
4. Update this file's task statuses, then commit one commit per task.

After wave 3, the spec's *Done when* manual item (re-run the probe snippet against the fixtures) is the user's: it needs their live account.
