# Playlist loading, visual half (roadmap item 2) — spec

**Size:** Large (new `Screen` variant, a store↔session wiring contract, the composition root, and a first compliance requirement from Spotify's design guidelines)
**Sub-phase:** visual (the logic half is [specs/playlist-loading-logic](../playlist-loading-logic/spec.md))
**Status:** Draft
**Parent:** [specs/app-v1/ROADMAP.md](../app-v1/ROADMAP.md), item 2 (R2–R4, A19, A22 not here)
**Branch:** `feat/2/playlist-loading-visual`, from `main` **after** `feat/2/playlist-loading-logic` is merged (V1)

## Problem

The playlists store can list, look up, load, clean and gate a playlist, but nothing renders it and nothing builds it: `main.tsx` only knows the session store, and a signed-in player sees a placeholder card. This half builds the Picker screen against the real store, wires the composition root, and runs the P16 live check that the logic half could only code against documented fields.

## Ambiguity ledger

The epic ledger (A1–A28) and the logic half's P1–P18 answer most of it. Rows below are this half's.

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| V1  | What is the branch base? | Resolved | **Merge the logic branch to `main` first**, then branch from `main`. (The spec files were drafted on the logic branch and move with the first commit.) |
| V2  | Where do the cleaning summary and Continue live? | Resolved | A **sticky bottom bar**: selected playlist, load progress or cleaning summary, **Reload**, **Continue**. The grid scrolls above it. |
| V3  | How does the paste flow end? | Resolved | Submit with Enter or **Look up**. A found playlist appears as a **card under the box**, identical to a grid card; the player clicks it to select. Invalid / restricted / not-found / network show inline text. It never auto-selects. |
| V4  | Spotify design guidelines? | Resolved | **Verified now** (see *Spotify compliance*). Cover art unaltered and uncropped, Spotify metadata shown whole, an "Open Spotify" link per card, the full white logo as attribution, and the 20-item rule (V5). |
| V5  | The "no more than 20 items per content set" rule vs a long playlist grid? | Resolved | Show the **first 20**, then a **Show more** button revealing 20 more per press, with an "Open Spotify" link after the grid. |
| V6  | The logo asset? | Resolved | **The owner drops the official white full-logo SVG** into `src/ui/assets/` (gate G2). Nothing is fabricated. |
| V7  | Where does Continue lead, and where does that state live? | Resolved | A **stand-in Setup screen** (P3: playlist name, usable count, Back). The state is **the session store's `Screen`**: a new `setup` variant, with `toSetup()` / `toPicker()` actions (A1). The existing `signed-in` variant keeps its name and now means "the Picker"; item 5 replaces the stand-in's body and adds the real screens. |
| V8  | Refresh controls? | Resolved | **Both, small.** A Refresh icon-button by the grid heading (`loadList()`) and a Reload button in the bottom bar (`reload()`). Each is also the Retry for its own error state. |
| V9  | How is acceptance proven? | Resolved | **jsdom component tests** with the real store and a fake client (every state, every error kind), plus **the owner's live P16 check** in desktop Chrome at `127.0.0.1`. No new test tooling. |
| V10 | User-facing copy? | Discretion (user's choice) | Agent drafts it; the user edits at approval. Drafted in *Copy* below. |
| V11 | When does the Picker call `loadList()`? | Resolved | On mount **only when `list.status` is `idle` or `error`**. Coming back from Setup keeps the grid and the selection (the store keeps both). Refresh always refetches. Derived from D10 of the logic design. |
| V12 | What is preselected? | Resolved | Nothing. Remembering the last playlist is item 6 (P18, A16). |
| V13 | What does logout / session expiry do to the stores? | Resolved | The playlists store is `reset()` whenever the session leaves `signed-in` and `setup` (logout, expire, retry-to-login), via a small wiring module in `store/`. Nothing persists. |
| V14 | How is the cleaning summary worded? | Resolved | From R3 and A19: **per-reason counts, zero reasons omitted**: `412 usable · 9 removed (5 duplicates, 2 unavailable, 1 local, 1 episode)`; none removed reads `412 usable · none removed`. |
| V15 | What if the player can't tell playlists apart (same name)? | Resolved | Cards show owner and track count; a collaborative playlist shows a **Collaborative** badge (outside the artwork). Metadata wraps, never truncates (V4). |

**Open: 0**

Category sweep: scope ✅ (V3, V6, V12; Setup, preselect and persistence are out) · rules ✅ (R2–R4 and the 10-track gate come from the store; the UI restates none) · layer ✅ (`ui/` screens and components; `store/` gets `setup` and a wiring module; `main.tsx` is the composition root; no `game/` or `spotify/` change) · build order ✅ (V1, logic merged first; real Setup is item 5) · data ✅ (no persistence, no new schema; invariant 4 n/a) · time/random ✅ (no ambient time or randomness; the real `sleep` is created in `main.tsx` and injected) · behavior ✅ (V8, V11, V13; loading, supersession and caching are the store's) · errors ✅ (every `ApiErrorKind`, `invalid-link`, restricted paste, empty list, too-few in *Copy*) · contracts ✅ (component props, `Screen`, wiring: design) · platform ✅ (desktop Chrome, single column, A4) · non-functional ✅ (keyboard-operable cards, `aria-pressed`, `aria-live` bar, visible focus; 20-item cap bounds the DOM) · fairness ✅ (n/a) · done ✅ (V9)

## Spotify compliance

Read from Spotify's design guidelines on 2026-11-10 ([developer.spotify.com/documentation/design](https://developer.spotify.com/documentation/design)). What the Picker must honour:

| Guideline | How the Picker complies |
| --------- | ----------------------- |
| Metadata and artwork are accompanied by the Spotify brand | A footer with the **full white Spotify logo** (icon + wordmark), at least 70 px wide, clear of artwork, plus "Playlist data and artwork from Spotify". |
| Artwork unaltered: no crop, overlay, blur or animation; 8 px corner radius on large screens | `object-contain` in a square box, `rounded-[8px]`, nothing drawn on it (selection is a ring on the card, the Collaborative badge sits beside it). No cover: the guidelines allow omitting artwork, so a neutral placeholder block is shown. |
| Titles are shown with Spotify's metadata, untouched; truncation only if the full text stays viewable | Names wrap in full; nothing is trimmed or re-cased. |
| Link back to Spotify; link text "OPEN SPOTIFY" / "PLAY ON SPOTIFY" / "LISTEN ON SPOTIFY" | Each card has an **OPEN SPOTIFY** link to `https://open.spotify.com/playlist/<id>`; the grid ends with one to `https://open.spotify.com/`. |
| Not more than 20 items per content set, followed by a link to Spotify | V5. |
| Logo colour: green only on black or white | The theme is dark grey, not black, so the **white** logo is used. |
| Never place the logo on artwork; keep an exclusion zone of half the icon height | The logo sits in the footer on the plain background with that padding. |

Not applicable here: playback views, explicit badge (South Korea). The same document governs item 5's Reveal.

## Requirements

Epic IDs are kept where this half delivers them (R2–R4). `V-` rows are this half's own.

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| R2  | WHEN the Picker is shown THEN it SHALL list the playlists in `list.playlists` (the store already filtered owned and collaborative) as cards, and SHALL offer a paste box that accepts a playlist URI or URL. | P1 |
| R3  | WHEN a playlist is selected and loaded THEN the bottom bar SHALL show the usable count and the removed count per reason (V14). | P1 |
| R4  | WHEN the selected playlist's gate is `too-few` THEN Continue SHALL be disabled and the bar SHALL show the reason with the usable count. | P1 |
| V-1 | WHEN `list.status` is `loading` THEN the grid area SHALL show skeleton cards, WHEN `error` THEN the mapped message with a Retry, and WHEN `ready` with no playlists THEN the empty-state message. | P1 |
| V-2 | WHEN a card is clicked THEN the Picker SHALL call `select(summary)`, mark that card selected (`aria-pressed`), and the bar SHALL show `loaded / total` progress while loading. | P1 |
| V-3 | WHEN more than 20 playlists exist THEN the grid SHALL render the first 20 and a Show more button that reveals 20 more per press, and SHALL end with an OPEN SPOTIFY link to Spotify. | P1 |
| V-4 | WHEN a pasted link is looked up THEN the box SHALL show: loading, the found card (clickable like a grid card), the restricted explanation naming the playlist and owner, or the mapped error (including `invalid-link`). | P1 |
| V-5 | WHEN the selection is `error` THEN the bar SHALL show the mapped message and a Reload (Retry); `restricted` SHALL explain the Dev Mode limit. | P1 |
| V-6 | WHEN Continue is pressed on a `ready` selection with an `ok` gate THEN the session SHALL show the stand-in Setup screen with the playlist name and usable count, and Back SHALL return to the Picker with grid and selection intact. | P1 |
| V-7 | WHEN the session leaves `signed-in` and `setup` THEN the playlists store SHALL be reset. WHEN a playlists action reports `unauthorized` THEN the session SHALL show `session-expired`. | P1 |
| V-8 | WHEN a card renders THEN its artwork SHALL be unaltered and uncropped and its metadata SHALL be shown in full, with an OPEN SPOTIFY link and, in the footer, the full white Spotify logo and attribution (see *Spotify compliance*). | P1 |
| V-9 | WHEN Refresh is pressed THEN `loadList()` SHALL run, and WHEN Reload is pressed THEN `reload()` SHALL run for the selected playlist. | P2 |
| V-10 | WHEN the player uses only the keyboard THEN cards, Look up, Show more, Refresh, Reload and Continue SHALL be reachable and operable with visible focus. | P2 |

## Copy (draft, V10)

| Situation | Text |
| --------- | ---- |
| Cleaning summary (V14) | `412 usable · 9 removed (5 duplicates, 2 unavailable, 1 local, 1 episode)` / `412 usable · none removed` |
| Loading | `Loading 120 of 412 tracks…` (before a total is known: `Loading tracks…`) |
| Too few (R4) | `Only 7 usable tracks. harkdle needs at least 10. Add songs in Spotify, then press Reload.` |
| Empty list | `No playlists to show. harkdle lists playlists you own or collaborate on. Create one in Spotify and press Refresh, or paste a link.` |
| `restricted` on a selection | `Spotify won't share this playlist's tracks. harkdle runs in Development Mode, which only reads playlists you own or collaborate on. Pick another one.` |
| Paste, restricted | `"<name>" belongs to <owner>. In Development Mode harkdle can only read playlists you own or collaborate on. Ask them to add you as a collaborator, or copy the songs into one of your own playlists.` |
| `invalid-link` | `That isn't a Spotify playlist link. Paste a link like https://open.spotify.com/playlist/… or a spotify:playlist: URI.` |
| `not-found` | `That playlist doesn't exist, or it is private.` |
| `rate-limited` | `Spotify is rate-limiting harkdle. Wait a moment, then retry.` |
| `network` | `Couldn't reach Spotify. Check your connection, then retry.` |
| `unexpected` | `Spotify answered with something harkdle didn't expect. Retry, and tell the owner if it keeps happening.` |
| `unauthorized` | (routes to the `session-expired` Setup-error screen; the Picker shows `Your Spotify session ended.` for the moment before it swaps) |
| List-level `restricted` | `Spotify refused to list your playlists. Ask the owner to check the allowlist.` |
| Attribution | `Playlist data and artwork from Spotify` beside the logo |

## Edge cases

- WHEN the player clicks another card while one is loading THEN the latest click SHALL win (the store's P-11); the bar shows the newest selection only.
- WHEN the player selects a playlist already loaded this session THEN the bar SHALL show `ready` at once, with no progress flash (the store's cache hit).
- WHEN a pasted playlist is also in the grid THEN both cards SHALL mark the same playlist selected (selection is matched by id).
- WHEN a playlist has no cover THEN a neutral placeholder SHALL fill the square (no broken image).
- WHEN a name is very long THEN it SHALL wrap inside the card without overflowing or hiding the OPEN SPOTIFY link.
- WHEN Continue is pressed twice quickly THEN the session SHALL end up on Setup once (the action is idempotent on `signed-in`).
- WHEN the stand-in Setup is reached without a ready selection (should not happen) THEN it SHALL fall back to the Picker.
- WHEN StrictMode double-mounts the Picker THEN one `/me/playlists` chain SHALL run (the store shares in-flight requests).

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Real Setup screen (mode, start, X presets, volume, "presets larger than usable are disabled") | Item 5 (A13). Only the stand-in exists here. |
| Preselecting the last playlist, remembering anything | Item 6 (P18, A16). |
| Playback, SDK connection, the Spotify logo on Reveal | Items 3 and 5. |
| Search or sort in the grid | Not in A19; add after playtesting if the grid is unwieldy. |
| Playwright or any new test tooling | V9. |
| Cancelling an in-flight load | The store's P-11 decision. |
| Liked Songs, followed-only, Spotify-owned playlists | P11. |

## Done when

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` are green; invariants hold (`ui/` imports no `spotify/`, nothing in `store/` imports React).
- [ ] Component tests cover every state in V-1…V-10 with the real store and a fake client, including each `ApiErrorKind`, `invalid-link`, restricted paste, empty list, `too-few`, Show more, and the Back round-trip.
- [ ] **Required live check (P16):** in desktop Chrome at `http://127.0.0.1:5173`, load the edge-case playlist (local files, episodes, unplayable or null items, plus a collaborative playlist as a second pass, and a 429 if it can be provoked) in the real Picker. The summary shows the removal counts the owner computed independently from Spotify.
- [ ] Manual sign-off at about 1280×800: grid, sticky bar, footer logo (≥70 px, clear of artwork), keyboard path, and the stand-in Setup round-trip.
- [ ] Logout and a forced `session-expired` leave no stale selection when logging back in.
