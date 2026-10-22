# Playback latency spike — spec

**Size:** Medium
**Sub-phase:** single (throwaway; no logic/visual split)
**Status:** Approved (ledger closed; tasks pending approval)
**Branch:** `spike/playback-latency` (never merges; see hand-off)

## Problem

Clip timing is the biggest technical risk in `validation-review.md`: a 0.5s/1s clip is the same order as the Web Playback SDK's seek and buffer latency, and the SDK streams DRM-protected audio with no preloading. Before locking the step ladder in `game-design.md`, we need measured numbers for whether the SDK can give a fair 0.5s, 1s or 2s clip. The same spike also confirms two unverified API assumptions (`market=from_token` + `is_playable`, and `/playlists/{id}/items`). Timebox: one day, one question.

## Ambiguity ledger

| ID  | Question                                                        | Status   | Answer |
| --- | --------------------------------------------------------------- | -------- | ------ |
| A1  | Spike tooling given no stack ADR yet?                           | Resolved | Vite + TypeScript, no React. Vitest for the pure parts. |
| A2  | How is "audible duration" measured?                             | Resolved | Position-based only: resume call → first position change, and first position change → clip end. No audio capture, no ear-test. |
| A3  | Spotify app/account/playlist state?                             | Resolved | Not set up. Plan includes a manual setup checklist (below). User builds the test playlist from the edge-case list below. |
| A4  | Deliverables beyond findings?                                   | Resolved | Findings note with numbers, `PlaybackAdapter` TS interface, draft ADR-0001 (Proposed; user approves before Accepted). |
| A5  | Pass bar per clip length?                                       | Resolved | Spread (IQR) of resume→first-position-change ≤150ms **and** clip-end overshoot ≤100ms. |
| A6  | Flows compared?                                                 | Resolved | Cold (`play` with `position_ms`), pre-seek while paused, pre-loaded during reveal. Not compared: poll vs `setTimeout` end enforcement (polling is used everywhere). |
| A7  | How do outputs reach the real build?                            | Resolved | Cherry-pick findings note, draft ADR and adapter file onto a fresh branch from `main`. Throwaway page stays on the spike branch. |
| A8  | Trials per cell?                                                | Resolved | 20 per flow × clip length cell (3 × 3 = 9 cells, 180 runs). |
| A9  | Browser?                                                        | Resolved | Desktop Chrome only. Safari and mobile are separate follow-ups. |
| A10 | Where does the Spotify client ID live?                          | Resolved | Gitignored `.env` read by Vite (`VITE_SPOTIFY_CLIENT_ID`); `.env.example` committed. |
| A11 | How is the 20-track trial set chosen from the edge-case playlist? | Resolved | The page picks 20 playable tracks stratified by duration (shortest, longest, the rest spread evenly); each gets a start point at a seeded-RNG position in the 10–70% range. |
| A12 | Where do results go?                                            | Resolved | Live results table on the page plus a "download JSON" button. No persistence. |

**Open: 0**

Category sweep: scope ✅ · rules ✅ (n/a, no game rules) · layer ✅ (n/a, throwaway; adapter seam is the only contract) · build order ✅ · data ✅ (A12) · time/random ✅ (A11: seeded RNG for start points; clock = `performance.now()` behind an injected function) · behavior ✅ · errors ✅ (R7) · contracts ✅ (adapter interface only) · platform ✅ (A9) · non-functional ✅ (this is the latency question) · fairness ✅ (n/a, no secrets beyond a public PKCE client ID) · done ✅

## Requirements

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| R1  | WHEN the page loads on `http://127.0.0.1:5173` and the user clicks Login THEN the system SHALL complete Authorization Code + PKCE with scopes `streaming user-read-private user-read-email user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative` and store the tokens in memory plus `sessionStorage`. | P1 |
| R2  | WHEN the access token has under 60s left THEN the SDK token callback SHALL refresh it using the refresh token, and playback SHALL keep working past 1 hour. | P1 |
| R3  | WHEN the user clicks the start button (a user gesture) THEN the system SHALL connect the SDK player, wait for `ready`, transfer playback to its device and report the device ID. | P1 |
| R4  | WHEN a playlist ID is entered THEN the system SHALL fetch `GET /playlists/{id}/items?market=from_token` across all pages and report per item: type, `item.is_playable`, presence of `linked_from`, `is_local`, ISRC (`external_ids.isrc`) and duration. | P1 |
| R5  | WHEN the playlist check runs THEN the system SHALL print which assumed field names exist (`items.item` vs `tracks.track`, `is_playable`, `external_ids`) and which are missing, without throwing on missing fields. | P1 |
| R6  | WHEN a trial runs THEN the system SHALL record, per run: flow, clip length, track ID, start point, `tResume→firstPositionChange` ms, clip-end overshoot ms (position when pause call returned minus target), and whether the run errored. Clip end SHALL be enforced by polling position, not `setTimeout`. | P1 |
| R7  | WHEN a run errors (`playback_error`, unplayable track, timeout of 5s waiting for a position change) THEN the system SHALL record the run as failed with the reason and continue with the next run. | P1 |
| R8  | WHEN all runs finish THEN the system SHALL show, per cell (flow × clip length), the median, IQR, min, max and failure count of both metrics, plus a pass/fail against A5. | P1 |
| R9  | WHEN the run completes THEN the system SHALL offer all raw runs as downloadable JSON. | P2 |
| R10 | WHEN the three flows are run THEN each flow SHALL execute: **cold** = `play` with `position_ms`; **pre-seek** = primed paused at the start point, then seek + resume per replay; **preloaded** = the next track primed paused at its start point while a simulated 2s reveal delay runs, then resumed. | P1 |
| R11 | WHEN the order of runs is generated THEN flows and clip lengths SHALL be interleaved by a seeded RNG so drift over the session isn't confounded with the flow. | P2 |

## Edge cases

- WHEN the page is opened at `localhost` THEN the system SHALL show a banner telling the user to use `127.0.0.1` (the PKCE verifier lives in a different origin otherwise).
- WHEN the account is not Premium (or is Lite/Mini) THEN the system SHALL show the `account_error` and stop.
- WHEN Spotify is already playing on another device THEN the system SHALL transfer playback to the SDK device before each session and say so.
- WHEN the tab is hidden during a session THEN the system SHALL flag every run that overlaps a hidden period, so throttled timers don't pollute the numbers.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Safari, mobile, iOS gesture rules | Separate follow-up (A9). |
| Audio capture / ear-test | A2. |
| Poll vs `setTimeout` comparison | A6; polling is used throughout. |
| Deezer fallback | Only evaluated if the verdict is "SDK can't deliver"; a separate spike. |
| Any game logic, scoring, matching, UI beyond the measurement page | Not what the spike answers. |
| React, Router, Query, Zustand, Tailwind, shadcn | A1; they belong to the stack ADR. |
| GitHub Pages / second redirect URI | Not needed for a local measurement. |

## Manual setup (you do this; I can't)

1. Spotify Developer Dashboard → create an app (Web API + Web Playback SDK). Add redirect URI `http://127.0.0.1:5173/callback`. Copy the client ID into `.env` as `VITE_SPOTIFY_CLIENT_ID`.
2. In the app's User Management, add your Spotify account email. It must be Premium (full, not Lite or Mini).
3. Create the test playlist from the list below, **owned by you** (Dev Mode only returns items for owned or collaborative playlists).
4. Open Chrome at `http://127.0.0.1:5173` (not `localhost`) and keep the tab focused for the whole run.

## Test playlist — edge cases to cover

Aim for roughly 120 items so pagination (100 per page) is exercised; the 20-track trial set is picked from its playable tracks (A11).

**Duration (seek cost and the 10–70% rule)**
- A track under 30s (e.g. an interlude or skit).
- A track around 30–60s.
- A typical 3 min track and a 7+ min track.
- A 10+ min track (long seek offset).

**Titles and matching**
- "Song - Remastered 2011" style suffix; "Song (feat. X)"; "Song - Live"/"- Radio Edit".
- Two different tracks with the same title by different artists.
- The same recording on two albums (original album + a compilation) to check ISRC dedupe.
- The exact same track added twice to the playlist.
- Non-Latin titles (Japanese, Cyrillic, Arabic), emoji or heavy punctuation, and a very long title (80+ characters).

**Artists and albums**
- "A & B" collaboration, a track with 3+ artists, "Various Artists" compilation, a single, and a deluxe edition.

**Availability and item types**
- A track that is region-locked or unavailable in your market (greyed out), and a track removed from the catalogue.
- A relinked track (`linked_from` present).
- A **local file** added from your computer (`is_local`).
- A **podcast episode** in the playlist (item type `episode`).
- An explicit-flagged track.

**Audio start behaviour (for audible-clip judgement)**
- A track with a long silent or quiet intro, and one that starts at full volume on the first frame.
- A gapless live album track, an instrumental, and a track that ends in silence.

**Playlist-level checks**
- A second playlist **you follow but don't own**: the check should confirm `/items` is refused or empty in Dev Mode.
- A **collaborative** playlist, if you have one.

## Done when

- [ ] `npm run typecheck` and `npm test` are green (pure parts only: stats, run-plan generation, flow orchestration with a fake player and injected clock).
- [ ] You ran the full 180-run measurement in desktop Chrome on `127.0.0.1` and downloaded the JSON.
- [ ] The findings note states, per clip length, which flow (if any) meets A5, and the verdict: lock the ladder, adjust it (floor or 1/2/4/8/16s), or take the fallback.
- [ ] The findings note states the `market=from_token` + `is_playable` and `/items` results, with the real field names.
- [ ] ADR-0001 is drafted (Proposed) with the spike's constraints, and the `PlaybackAdapter` interface file exists, extracted from the working SDK wrapper.
- [ ] The three artifacts are cherry-picked onto a fresh branch from `main`.
