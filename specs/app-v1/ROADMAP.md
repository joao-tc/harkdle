# harkdle v1 — app spec and roadmap

**Size:** Large (epic). Each roadmap item below runs through feature-dev on its own, logic before visual.
**Sub-phase:** epic, split per roadmap item
**Status:** Draft

## Problem

The playback spike proved that the Web Playback SDK can play the 1/2/4/7/11/16 s ladder fairly when every clip is cued first ([findings](../../docs/spike-playback-latency.md), [ADR-0001](../../docs/adr/0001-stack-and-playback.md)). What's missing is the game: a clear flow from login to results, rules with no gaps in [game-design.md](../../game-design.md), and a build order that gets a playable slice to friends early.

## Ambiguity ledger

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| A1  | Settle ADR-0001? | Resolved | Accept, **without TanStack Router**. The current screen is state in Zustand, and there are no hash routes. |
| A2  | What is in v1? | Resolved | Vertical slice. **M1:** X Tracks + Classic start, full guessing and scoring, results. **M2:** Random start + rerolls, Endless. |
| A3  | Who plays? | Resolved | The owner plus up to 4 allowlisted friends. Setup failures get explicit screens. |
| A4  | Devices? | Resolved | Desktop Chrome only. Single-column layout; Safari and mobile are a later spike. |
| A5  | Reveal between rounds? | Resolved | The song plays on from the clip start until the player presses **Next**. Next shows a 3-2-1 countdown that covers cueing the next track. |
| A6  | When is a guess correct? | Resolved | The player must pick a suggestion. The comparison uses normalized text: case- and accent-insensitive, with version suffixes stripped (`- Remastered 2011`, `(feat. X)`, `- Live`, `- Radio Edit`, `(Deluxe Edition)`…). A same-titled song by another artist also counts for Title. |
| A7  | What do suggestions show? | Resolved | Each field suggests only its own kind (titles, artists, albums), deduplicated after normalization. Picking a suggestion reveals nothing about the other fields. |
| A8  | Main vs featured artist? | Resolved | `artists[0]` is main and earns full credit. Any other listed artist earns **50%** of the Artist points. |
| A9  | Mixed submission (one field right, one wrong)? | Resolved | Correct fields lock at the **current** step, then the step advances once. |
| A10 | Featured-artist guess? | Resolved | Locks the Artist field at 50%. It costs no step and is final (no later upgrade). |
| A11 | How do paid rerolls stack? | Resolved | Linearly, per round: ×(1 − 0.1·n) for n paid rerolls in that round, floored at ×0.5. |
| A12 | Random start on short tracks? | Resolved | The latest start is (length − 16 s − 2 s margin). If that is below 10% of the length, the round starts at 0:00 and reroll is disabled for it. |
| A13 | X Tracks lengths and minimum playlist size? | Resolved | Presets of 5 / 10 / 20. A playlist needs at least **10 usable tracks**, and presets larger than the usable count are disabled. |
| A14 | Reload or close mid-game? | Resolved | The browser shows a "leave page?" prompt. If the player leaves, the game is lost. Resuming is deferred. |
| A15 | Spotify taken over mid-game (another device, or the SDK device lost)? | Resolved | The round freezes with no step lost. A "Spotify is playing elsewhere — Play here" overlay reconnects or transfers playback, then re-cues the clip. |
| A16 | What is remembered between visits? | Resolved | The last playlist, mode, start type, X, and volume. They live in versioned `localStorage`. Game history is not kept. |
| A17 | Round-screen layout? | Resolved | A single column: header (round n/X, score) → 6-segment ladder bar → Play button → Title / Artist / Album fields → Submit → Skip · Give up · Reroll. |
| A18 | Replays and keyboard? | Resolved | Replays are free and unlimited. **Enter** submits, **Tab** moves between fields, **⌥Space** plays, **⌥S** skips and **⌥R** rerolls. Shortcuts are matched by `KeyboardEvent.code`, so they work inside fields and type no characters. |
| A19 | Playlist picker? | Resolved | A grid of the player's **owned and collaborative** playlists with covers, plus a "paste a playlist link" box. After loading, it shows a cleaning summary: "412 usable · 9 removed (duplicates, unavailable, local, episodes)". |
| A20 | Visual direction? | Resolved | A dark neutral theme with shadcn defaults. On the reveal, the accent colour comes from the cover art. Spotify attribution goes wherever its guidelines require it. |
| A21 | Does a featured-artist lock still earn the hat trick? | Resolved | Yes. The combo needs every required field locked, at whatever credit. |
| A22 | When does it deploy to Pages? | Resolved | In M1, so friends can playtest the first slice. |
| A23 | Lint/format gate? | Resolved | Biome, run as `npm run lint`. |
| A24 | Tab hidden mid-clip? | Resolved | The clip stops at once and no step is lost. Reveal audio keeps playing. |
| A25 | Invariants? | Resolved | The four in the feature-dev profile, plus **#5: no Spotify SDK types outside the `PlaybackAdapter` implementation**. They are enforced by Biome import restrictions and tests. |
| A26 | Play again: can songs repeat across games? | Resolved | Yes. Every game reshuffles the whole cleaned playlist. |
| A27 | Volume? | Resolved | An in-app slider using SDK `setVolume`, remembered with the settings (A16). |
| A28 | Shortcut conflicts on macOS? | Resolved | Replaced by ⌥ chords (A18). |

**Open: 0**

Category sweep: scope ✅ (A2, out of scope below) · rules ✅ (A6–A12, A21) · layer ✅ (Layers below) · build order ✅ (Roadmap) · data ✅ (A16) · time/random ✅ (shuffle and start points come from an injected seeded RNG, invariant 2; no daily mechanic in v1) · behavior ✅ (A5, A14, A15, A24) · errors ✅ (A3, Edge cases) · contracts ✅ (engine API, `PlaybackAdapter`, settings v1; each designed in its own item) · platform ✅ (A4) · non-functional ✅ (clip timing per ADR-0001; keyboard A18; volume A27) · fairness ✅ (single-player, client-side; cheating via devtools doesn't matter) · done ✅

## Screens and game flow

```
Login ──► Playlist picker ──► Setup ──► Round ⇄ Reveal ──► Results
  │            ▲                 ▲                            │
  ▼            └─ change playlist┴──────── Play again ◄───────┘
Setup error (not Premium · not allowlisted · SDK/browser failure)
```

| Screen | Shows | Leaves via |
| ------ | ----- | ---------- |
| **Login** | What harkdle is, "Log in with Spotify", and the requirements (Premium, allowlist, desktop Chrome). | PKCE login → account check → Playlist picker, or Setup error |
| **Setup error** | One specific message with a fix: not Premium; not on the allowlist (ask the owner); SDK `account_error` / `initialization_error`; opened on `localhost` in dev. | Retry / Log out |
| **Playlist picker** | A grid of owned and collaborative playlists, a paste-link box, and the cleaning summary for the selected playlist. The last playlist is preselected (A16). | Continue (≥10 usable) → Setup |
| **Setup** | Mode (X Tracks; Endless in M2), start (Classic; Random in M2), X = 5/10/20, volume. | **Start** (a user gesture, which connects the SDK) → Round |
| **Round** | The A17 layout. Locked fields show ✓ and their points; an album-skipped round shows the note "Album skipped — this track is a single/compilation". Free rerolls left (M2), lives (Endless, M2). | Round end → Reveal |
| **Reveal** | Cover, title, artists, album; per-field points, combo, mode multiplier and reroll penalty; the round total and the running score. The song plays on. | **Next** (3-2-1 countdown, cueing) → Round, or → Results after the last round |
| **Results** | Final score, step histogram (1–6 + missed), hat-trick count, "Playlist cleared!" (Endless, M2). | Play again (same settings, fresh shuffle) / Change playlist |

**Round loop (per [game-design.md](../../game-design.md) plus A5–A12):** cue → **Play** plays the current step's clip from the stored start → the player submits / skips / gives up / rerolls → a wrong field or a skip advances the step, and correct fields lock at the current step → the round ends when every required field is locked, on a wrong guess or skip at step 6, or on Give up.

## Layers

| Layer | Holds | Rules |
| ----- | ----- | ----- |
| `src/game/` (logic) | Config, normalization and matching, scoring, the round reducer, the game reducer (X Tracks, later Endless), shuffle and start-point selection | Pure and headless. Clock and RNG are injected. It imports no React, SDK, DOM or `fetch` (invariants 1–3). |
| `src/spotify/` (data and playback) | Auth (PKCE), Web API client, playlist loading and cleaning, `PlaybackAdapter` + SDK implementation | SDK types stay inside the adapter implementation (invariant 5). Cleaning and the suggestion index are pure functions with tests. |
| `src/store/` | Zustand stores: the game store dispatching to the reducers and driving the adapter; settings (versioned, invariant 4) | Bridges SDK events and components. |
| `src/ui/` | Screens and components (shadcn + Tailwind) | Consumes the store; writes no rules. |

## Requirements

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| R1  | WHEN a logged-in account is not full Premium, or is not allowlisted, THEN the system SHALL show the matching Setup error instead of the picker. | P1 |
| R2  | WHEN the picker loads THEN it SHALL list only owned and collaborative playlists, and SHALL accept a pasted playlist URI or URL. | P1 |
| R3  | WHEN a playlist is selected THEN the system SHALL drop local files, episodes and `is_playable: false` items, deduplicate by track ID and ISRC, and show the usable and removed counts by reason. | P1 |
| R4  | WHEN a playlist has fewer than 10 usable tracks THEN Continue SHALL be disabled with the reason shown. | P1 |
| R5  | WHEN a game starts THEN the system SHALL shuffle the cleaned list once with the injected RNG, and no track SHALL repeat within that game. | P1 |
| R6  | WHEN the player presses Play THEN the current step's clip SHALL play from the round's stored start point through a cued `resume()`, ending by position polling (ADR-0001). | P1 |
| R7  | WHEN a submission contains wrong fields THEN correct fields SHALL lock at the current step, and the step SHALL advance exactly once. | P1 |
| R8  | WHEN a field is locked THEN its score SHALL follow the step table and config: title, artist at 30% (×50% if featured), album at 50%. | P1 |
| R9  | WHEN a round ends THEN its total SHALL be (title + artist + album) × combo (1.5, or 2.0 when the album is skipped, only if every required field is locked) × mode multiplier × reroll penalty. | P1 |
| R10 | WHEN a track's album is a single, EP or compilation THEN the Album field SHALL be skipped with an explanatory note. | P1 |
| R11 | WHEN the round ends THEN the Reveal SHALL keep the song playing until Next, and Next SHALL show a 3-2-1 countdown while the next clip is cued. | P1 |
| R12 | WHEN the last round of an X Tracks game ends THEN Results SHALL show the final score, a step histogram (1–6 + missed) and the hat-trick count. | P1 |
| R13 | WHEN the SDK device is lost or playback moves to another device mid-round THEN the round SHALL freeze with no step lost, and "Play here" SHALL restore playback and re-cue. | P1 |
| R14 | WHEN the tab becomes hidden during a clip THEN the clip SHALL stop, and the step SHALL NOT advance. | P1 |
| R15 | WHEN the player tries to leave during a game THEN the browser SHALL show a leave-page confirmation. | P1 |
| R16 | WHEN settings change THEN they SHALL persist to versioned `localStorage`, and an unknown or corrupt version SHALL fall back to defaults. | P2 |
| R17 | WHEN ⌥Space / ⌥S / ⌥R is pressed, even inside a field, THEN Play / Skip / Reroll SHALL fire without typing a character. | P2 |
| R18 | WHEN the volume slider moves THEN the SDK volume SHALL follow it, and the value SHALL persist (R16). | P2 |
| R19 | WHEN `main` is pushed THEN GitHub Actions SHALL build and deploy to Pages, and login SHALL work at the Pages root redirect URI. | P1 |
| R20 | (M2) WHEN Random start is chosen THEN each round SHALL pick a start in 10%–(length − 18 s), falling back to 0:00 per A12, and SHALL score ×1.25. | P1 |
| R21 | (M2) WHEN the player rerolls THEN a new start point SHALL be picked without changing the step. The first 3 rerolls per game are free, and later ones apply A11 to their round. | P1 |
| R22 | (M2) WHEN an Endless run reaches 3 misses (title not guessed) THEN it SHALL end, and WHEN the playlist is exhausted it SHALL end with "Playlist cleared!". | P1 |

## Edge cases

- WHEN the access token nears expiry THEN it SHALL refresh silently. Playback past one hour SHALL keep working (spike R2).
- WHEN a track fails to cue (playback error, timeout) THEN the round SHALL be skipped and replaced with the next track. It SHALL NOT be scored as a miss.
- WHEN two suggestions normalize to the same text THEN only one SHALL be shown.
- WHEN a pasted link is a playlist the player neither owns nor collaborates on THEN the picker SHALL explain the Dev Mode restriction.
- WHEN the player double-submits or mashes Skip THEN each action SHALL apply at most once per settled state, with no double advance.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Safari, Firefox, mobile | A4. A separate playback spike first. |
| Resume after reload | A14. Revisit once saved state exists for other reasons. |
| Game history, best scores | "Saved for later". Settings are the only persisted data (A16). |
| Daily seed, release-year bonus | "Saved for later" in game-design.md. |
| 0.5 s first step | Deferred to playtesting (ADR-0001). It's a config change, not a feature. |
| Multiplayer, leaderboards | Single-player. A 5-user Dev Mode cap. |
| URL routing | A1. |

## Roadmap

Each item is its own `specs/<item>/` folder planned through feature-dev, and none starts before the items it depends on are merged and green.

| # | Item | Size | Split | Depends on | Delivers |
| - | ---- | ---- | ----- | ---------- | -------- |
| 0 | **Foundation** | Large | single | — | A fresh branch from `main`; cherry-pick the findings and ADR; ADR-0001 → Accepted (router removed); fill the feature-dev profile, gates and invariants; Vite + React + Tailwind + shadcn + Zustand + Query + Biome (with import rules); fold A6–A12, A21 into game-design.md. **Real code:** PKCE auth ported from the spike, plus the Login and Setup-error screens (R1). |
| 1 | **Game engine** | Large | logic | 0 | `src/game/`: config, normalization and matching, scoring, round reducer, X Tracks game reducer (R5, R7–R10, R12 data). Fully unit-tested. |
| 2 | **Playlist loading** | Medium | logic + visual | 0 | Playlist list, item fetch, cleaning, suggestion index, Picker screen (R2–R4). **Implemented**: logic half ([specs/playlist-loading-logic](../playlist-loading-logic/spec.md)) and visual half ([specs/playlist-loading-visual](../playlist-loading-visual/spec.md)). |
| 3 | **Playback adapter** | Large | logic | 0 | `PlaybackAdapter` extracted from the spike (T9) with cue/play/stop, interruption events, volume. A fake adapter for tests (R6, R13, R14 detection, R18). **Done**: [specs/playback-adapter](../playback-adapter/spec.md). |
| 4 | **Deploy** | Medium | single | 0 | The Pages workflow, base path, second redirect URI (R19). Early, so the redirect works before there's a game to break. **Implemented**: [specs/deploy](../deploy/spec.md); deploys from the `stage` branch, and the first run was green. The live login check and the gate-block proof are pending. |
| 5a | **Game loop (logic)** | Large | logic | 1, 2, 3 | Game store wiring the engine to the adapter (start, round actions, countdown, cue-failure skip, freeze and recover, play again); shortcut mapping; leave-page guard module; X presets; `session.playerFailed`. Tested against the fake adapter. **Done**: [specs/game-loop-logic](../game-loop-logic/spec.md). |
| 5b | **Game loop (visual)** | Large | visual | 5a | `main.tsx` wiring (real adapter); Setup, Round, Reveal, Results screens; key handler; `beforeunload` registration; Play here overlay (R6, R11–R15, R17). **Implemented**: [specs/game-loop-visual](../game-loop-visual/spec.md); the live check and sign-off are pending. |
| 6 | **Settings persistence** | Medium | logic | 5b | Versioned settings store (R16, R18). **Implemented**: [specs/settings-persistence](../settings-persistence/spec.md); the live check is pending. |
| — | *M1 playtest with friends: tune clip lengths and points in config* | | | 4, 5b, 6 | |
| 7a | **Random start + rerolls (logic)** | Large | logic | M1 | Start-point window and draws, reroll budget and penalty in the game reducer, the store cueing `startMs` and `reroll()`, ⌥R mapping (R20, R21). **Implemented**: [specs/random-start-logic](../random-start-logic/spec.md); headless, so no live check. The start type is not persisted yet (S13). |
| 7b | **Random start + rerolls (visual)** | Medium | visual | 7a | Setup's Random toggle, the Reroll button with its cost label, the failed-reroll notice, the ⌥R key handler, Reveal rows. Planned once 7a is merged and green. |
| 8 | **Endless (M2)** | Medium | logic + visual | M1 | R22. |

**Required check for item 2's visual half (P16):** load the edge-case playlist (local files, episodes, unplayable or null items, a collaborative playlist, plus a 429 if it can be provoked) in the real Picker and confirm the cleaning summary shows the expected removal counts. **Run on 2026-11-10:** the Picker's removal counts for the owner's edge-case playlist matched the counts the owner computed independently. A collaborative playlist and a 429 have not been seen live.

Items 1, 2, 3 and 4 have disjoint layers and can run as parallel waves once 0 lands.

## Needs verification (before the item that depends on it)

- How `/me` reports Premium vs Lite/Mini (`product` values), and what a non-allowlisted user gets back (expected 403). This matters for item 0, R1. The SDK `account_error` is the fallback signal.
- ~~Spotify Design Guidelines on attribution, logo and linking back to the track, for item 5's Reveal screen.~~ Verified 2026-11-12 ([developer.spotify.com/documentation/design](https://developer.spotify.com/documentation/design)): metadata unaltered and fully viewable; artwork unaltered, uncropped, with nothing over it (4 px radius on small screens, 8 px on large); playing views carry the full logo (≥ 70 px, white on non-black); a link back reading OPEN / PLAY / LISTEN ON SPOTIFY; a background colour may be extracted from the artwork (fallback `#191414`). Still to confirm live: whether `i.scdn.co` allows the CORS read the accent needs (5b live check).
- ~~Whether the SDK honours `setVolume` under the cued flow without disturbing cue timing (item 3).~~ Checked live: the mute holds and restores cleanly (ADR-0003). Resume→first-position latency was not measured.
- The edge-case playlist was run in the Picker on 2026-11-10 and its removal counts matched (P16). Still unseen live: a collaborative playlist, a null item and a 429.

## Done when (v1 = M1 + M2)

- [ ] `npm run typecheck`, `npm run lint` and `npm test` are green on `main`, with the invariants enforced by Biome and tests.
- [ ] A full 10-track X Tracks game, then an Endless run, played end to end on the Pages deploy in desktop Chrome, by the owner and at least one allowlisted friend.
- [ ] Every Setup error screen is reached deliberately at least once: a non-Premium or non-allowlisted account, and `localhost` in dev.
- [ ] Manual feel sign-off on clip timing, the reveal countdown and the shortcuts.
