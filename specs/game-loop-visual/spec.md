# Game loop (visual) — spec

**Size:** Large (the composition root gets its first real adapter, a new screen set replaces the Setup stand-in, a new keyboard path, and a compliance surface)
**Sub-phase:** visual (roadmap item 5b; the logic half is [specs/game-loop-logic](../game-loop-logic/spec.md), merged)
**Status:** Draft
**Parent:** [specs/app-v1/ROADMAP.md](../app-v1/ROADMAP.md), item 5b (R6, R11–R15, R17, and the screen side of R18)
**Branch:** `feat/5b/game-loop-visual`, from `main` (5a is merged at `f184491`)

## Problem

The game store runs a whole game headless against the fake adapter, but no screen drives it and `main.tsx` still builds neither the real `PlaybackAdapter` nor the game store. A signed-in player reaches a Setup stand-in that says "arrives in a later update". This half builds the screens (Setup, Connecting, Round, Reveal, Countdown, Results), the Play-here banner and the key handler, and wires the composition root. It is also the first time the real SDK adapter runs under the store, so it carries the live check that proves the pair works.

## Ambiguity ledger

The epic ledger (A1–A28) and 5a's G1–G18 answer most of it. Rows below are this half's, or carried from 5a with their answer.

| ID | Question | Status | Answer |
| -- | -------- | ------ | ------ |
| L1 | Wrong-submission feedback (G "to ask here")? | Resolved | **Inline per-field marks.** Wrong fields show a red ✗ and a "not it" line until the player edits that field; locked fields show ✓ and points. The ladder bar advances. No toast. |
| L2 | Does Give up confirm? | Resolved | **Yes, a dialog**: "Give up this round?" with the track kept secret until confirmed. Confirm → `giveUp()`; Cancel or Esc → back to the round. |
| L3 | Ladder bar look? | Resolved | **Six segments labelled with clip lengths** (1s 2s 4s 7s 11s 16s): spent steps filled, current highlighted, upcoming dim. Static, no progress animation. |
| L4 | Play-here (R13) form? | Resolved | **A banner replacing the Play button.** Fields stay visible and editable. Submit, Skip and Give up are disabled. It names the reason (`taken-over` / `device-lost`), offers **Play here**, and shows the working and failed states. |
| L5 | Spotify's rules for the Reveal (ROADMAP "needs verification")? | Resolved | **Verified 2026-11-12** ([developer.spotify.com/documentation/design](https://developer.spotify.com/documentation/design)): metadata unaltered and fully viewable; artwork unaltered, uncropped, nothing over it, 4 px radius on small and 8 px on large screens; playing views carry the full logo (≥ 70 px; white on non-black); a link back reading OPEN / PLAY / LISTEN ON SPOTIFY; **a background colour may be extracted from the artwork, fallback `#191414`**. |
| L6 | Accent colour from the cover (A20) when the image can't be read? | Resolved | Extract through a CORS-enabled load of the cover. If the load or the canvas read fails, use Spotify's documented fallback `#191414` and the neutral theme. The live check settles whether `i.scdn.co` allows it. Never alter or cover the displayed artwork. |
| L7 | Setup's disabled controls (G5)? | Carried | Mode shows X Tracks selected and Endless greyed "coming soon"; Start shows Classic selected and Random greyed "coming soon". |
| L8 | Typed-but-unpicked text, Enter, Tab (G2, G3)? | Carried | Unpicked text is ignored and shown with a "pick a suggestion" hint, and costs no step. Enter picks the highlighted suggestion while the list is open, otherwise it submits. Tab moves between fields and never picks. |
| L9 | Skipped-track notice (G11)? | Carried | A dismissible alert on the round: "A track couldn't be loaded and was skipped." Reads `skippedNotice`; Dismiss calls `dismissNotice()`. |
| L10 | Interruption off the Round (G15)? | Carried | No Play-here UI on the Reveal or Countdown. Only a frozen **Round** shows the banner. |
| L11 | Reroll shortcut and button (G18)? | Carried | None in M1. ⌥R is unmapped and no Reroll button is drawn. |
| L12 | Give up while a clip plays (G9)? | Carried | The store ends the round straight into the Reveal, and the song continues. The dialog is the only new step. |
| L13 | Playwright or other browser tooling (V9 precedent)? | Resolved | None. Acceptance is jsdom component tests (real stores, the fake adapter) plus the owner's live check in desktop Chrome at `127.0.0.1`. |

**Open: 0**

Category sweep: scope ✅ (L7, L11, out of scope below) · rules ✅ (the screens restate none: points come from `fieldPoints`/`RoundScore`, the round count from `game.results.length + 1`; G9–G12 stay in the store) · layer ✅ (`ui/` screens, `main.tsx` composition root, one generated primitive; `store/`, `game/` and `spotify/` untouched) · build order ✅ (5a merged; item 6 persistence comes after) · data ✅ (nothing persisted; guess text and wrong marks are component state that dies with the round; invariant 4 n/a) · time/random ✅ (the real `sleep`, `performance.now` clock and the seed for `newRng` are made in `main.tsx` and injected; screens use no timers) · behavior ✅ (L1–L4, L8–L10, tab hidden = R14 shows nothing, reload = R15) · errors ✅ (connect failure → Setup error through 5a's `onStartFailed`; `roundsPlayed: 0` on Results; recovery failed; cover without a URL or unreadable) · contracts ✅ (component props in design.md; `App` gains a `game` prop) · platform ✅ (desktop Chrome, single column, A4) · non-functional ✅ (keyboard-complete, `aria-live` for score and countdown, visible focus, no motion beyond the countdown number change) · fairness ✅ (n/a; the Round never renders the track's metadata or cover) · done ✅ (L13)

## Requirements

Epic IDs are kept where this half delivers them. `L-` rows are this half's own.

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| R6 | WHEN the Play button or ⌥Space is used in a Round with `playback` `ready` THEN the screen SHALL call `play()` once. The button SHALL read "Play 1s clip" (the current step's length), "Playing…" while `playing`, and be disabled otherwise. | P1 |
| R11 | WHEN the stage is `reveal` THEN the screen SHALL show Next; WHEN Next is pressed THEN the `countdown` stage SHALL show 3, 2, 1 as the store publishes them. | P1 |
| R12 | WHEN the stage is `finished` THEN Results SHALL show the final score, a 1–6 + missed step histogram, the hat-trick count and rounds played, with Play again and Change playlist. | P1 |
| R13 | WHEN `playback` is `interrupted` in a Round THEN the Play-here banner (L4) SHALL show the reason; WHEN Play here is pressed THEN `recover()` SHALL run, with a working state and a failed state that offers a retry. | P1 |
| R14 | WHEN the tab was hidden mid-clip THEN nothing SHALL change on screen and the Play button SHALL work again once the store reports `ready`. | P1 |
| R15 | WHEN the app is composed THEN `connectLeaveGuard(game, window)` SHALL be registered, so reloading or closing mid-game shows the browser's prompt. | P1 |
| R17 | WHEN ⌥Space or ⌥S is pressed anywhere in a Round, even inside a field THEN `play()` / `skip()` SHALL fire, `preventDefault()` SHALL be called, and no character SHALL be typed. | P1 |
| R18 | WHEN the Setup volume slider moves THEN `setVolume()` SHALL run with the 0–1 value. | P2 |
| L-1 | WHEN a playlist is ready and ok and the stage is `idle` THEN the Setup screen SHALL show the playlist name and usable count, the X presets 5 / 10 / 20 from `presetOptions` with larger ones disabled, the disabled Mode and Start controls (L7), the volume slider and Start. | P1 |
| L-2 | WHEN Start is pressed THEN the screen SHALL call `game.start(tracks)` from that click (the user gesture), and the stage `connecting` SHALL show "Connecting to Spotify…" with no actions. | P1 |
| L-3 | WHEN `connect` is rejected THEN the Setup error screen SHALL show (the session's `playerFailed`, wired in `main.tsx`), and no game screen SHALL remain. | P1 |
| L-4 | WHEN the stage is `round` THEN the screen SHALL be the A17 column: header (round n/X, running score), ladder bar, Play, Title / Artist / Album fields, Submit, Skip, Give up. Reroll is absent (L11). | P1 |
| L-5 | WHEN the player types in a field THEN it SHALL list only that field's own suggestions from the playlist's `SuggestionIndex` (at most 8), and SHALL accept the choice by click, by arrows + Enter, and SHALL submit on Enter when no suggestion is highlighted. | P1 |
| L-6 | WHEN Submit is pressed THEN the guess SHALL contain only picked values (L8). Fields locked by an earlier step SHALL be disabled and show ✓, the picked text and their points; a featured-artist lock SHALL say so. | P1 |
| L-7 | WHEN a submission leaves the round open and advances the step THEN each submitted field that is still unlocked SHALL show the ✗ mark (L1) until edited, and the ladder SHALL advance. | P1 |
| L-8 | WHEN a track's album is skipped THEN the Album field SHALL be replaced by "Album skipped — this track is a single/compilation". | P1 |
| L-9 | WHEN Give up is pressed THEN the dialog (L2) SHALL ask first, and only Confirm SHALL call `giveUp()`. | P1 |
| L-10 | WHEN the Reveal is shown THEN it SHALL display the cover (unaltered, 8 px radius, nothing over it), title, artists and album in full, the per-field points, the combo, mode multiplier and reroll penalty when they are not 1, the round total, the running score, a PLAY ON SPOTIFY link to `https://open.spotify.com/track/<id>`, and Next. The page accent SHALL come from the cover (L6). | P1 |
| L-11 | WHEN any game screen is shown THEN the full white Spotify logo (≥ 70 px, clear of artwork) and an attribution line SHALL be in the footer. | P1 |
| L-12 | WHEN `skippedNotice` is true THEN the dismissible notice (L9) SHALL show on the Round; Dismiss SHALL call `dismissNotice()`. | P2 |
| L-13 | WHEN the Round, Reveal or Results mounts THEN focus SHALL go to the first field, Next and Play again respectively. | P2 |
| L-14 | WHEN Play again is pressed THEN `playAgain()` SHALL run (stage `connecting` shows); WHEN Change playlist is pressed THEN the session SHALL return to the Picker, which `leave()`s the game by 5a's wiring. | P1 |
| L-15 | WHEN `roundsPlayed` is 0 THEN Results SHALL say no tracks could be played instead of showing an empty histogram. | P2 |

## Edge cases

- WHEN the player presses ⌥S at step 6 THEN the round ends and the Reveal shows; the Skip button's label SHALL warn "Skip (ends the round)" at step 6.
- WHEN the Give up dialog is open THEN ⌥Space and ⌥S SHALL do nothing.
- WHEN a field holds picked text and the player edits it THEN the pick SHALL clear until a suggestion is chosen again.
- WHEN the playlist selection is not `ready` and ok on the Setup screen (should not happen) THEN the Picker shows, as today.
- WHEN a cover URL is `null` THEN a neutral placeholder fills the cover square and the accent is the fallback.
- WHEN the accent extraction is still running THEN the Reveal renders with the fallback and swaps once.
- WHEN StrictMode double-mounts the Round THEN the key handler SHALL be registered once (cleanup unregisters).
- WHEN `submit` is pressed with every field blank or unpicked THEN nothing happens and the hint shows (the store returns the same state).

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Remembering volume, X, mode, last playlist | Item 6 (A16). Controls read and write memory-only store fields. |
| Random start, Reroll button, ⌥R, free-reroll counter, Endless lives | Items 7 and 8 (L11). |
| A "Quit game" button | G4. |
| Live clip-progress animation on the ladder | L3. |
| A toast system or a slider primitive | L1 and the design (native range input). |
| Playwright or browser automation | L13. |
| Resume after reload | A14. |
| Safari, Firefox, mobile layouts | A4. |

## Done when

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` are green, and `npm test -- tools/invariants` passes (`ui/` imports no `spotify/`; nothing outside `main.tsx` constructs the real adapter).
- [ ] jsdom tests drive a whole 5-round game through `GameFlow` against `createHarness` (Setup → Connecting → Round → Reveal → Countdown → … → Results → Play again), and cover each of L-5 … L-15, R13, R17 and the Give up dialog. No test uses a real timer.
- [ ] **Required live check** in desktop Chrome at `http://127.0.0.1:5173` with the real SDK, the owner's account: a full 5-track game, including a mixed submission, a Give up, a Skip at step 6, ⌥Space / ⌥S typed inside a field on macOS (no "ß"), taking playback over from another device and pressing Play here, hiding the tab during a clip, and reloading mid-game (browser prompt). Record whether the cover is readable for the accent.
- [ ] Manual sign-off at about 1280×800 for layout, the ladder, the Reveal (cover rules, logo ≥ 70 px, link), the countdown and the shortcuts' feel.
- [ ] The ROADMAP row 5b links this spec and the "Needs verification" bullet on Spotify's guidelines is updated.
