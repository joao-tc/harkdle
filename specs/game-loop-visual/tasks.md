# Game loop (visual) — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Draft

Every UI task is verified with jsdom (`// @vitest-environment jsdom` at the top of the test file, as in `PlaylistPicker.test.tsx`), `@testing-library/react` and `user-event`. Tests that need a live store use `createHarness` from `@/store/gameHarness`; none uses a real timer.

## Execution plan

| Wave | Tasks | Mode |
| ---- | ----- | ---- |
| 1 | T1, T2, T3, T4, T5, T6 | parallel — 6 subagents |
| 2 | T7, T8, T9, T10, T11, T12 | parallel — 6 subagents |
| 3 | T13, T14, T15, T16, T17, T18 | parallel — 6 subagents |
| 4 | T19 | sequential — screens joined |
| 5 | T20 | sequential — integration |
| — | Live check and sign-off (spec *Done when*) | orchestrator + owner |

Branch `feat/5b/game-loop-visual` from `main`. Commit the spec files first, then one commit per task or wave.

## Validation

**A — Granularity:** ✅ · **B — Dependencies:** ✅ · **C — File ownership:** ✅

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | the copy module and its plural helpers | ✅ Atomic |
| T2 | one pure colour function | ✅ Atomic |
| T3 | one pure derivation | ✅ Atomic |
| T4 | one generated primitive | ✅ Atomic |
| T5 | one optional prop on one component | ✅ Atomic |
| T6 | one hook | ✅ Atomic |
| T7 | one combobox | ✅ Atomic |
| T8 | one component | ✅ Atomic |
| T9 | one component | ✅ Atomic |
| T10 | one component | ✅ Atomic |
| T11 | one component | ✅ Atomic |
| T12 | one hook and its canvas source (one concern: "cover → accent") | ⚠️ 2 cohesive files |
| T13 | one component | ✅ Atomic |
| T14 | two trivial single-prop screens | ⚠️ 2 cohesive files |
| T15 | one screen | ✅ Atomic |
| T16 | one screen | ✅ Atomic |
| T17 | one screen | ✅ Atomic |
| T18 | one screen | ✅ Atomic |
| T19 | one switch component + the full-game test | ✅ Atomic |
| T20 | integration (3 touchpoints that must move together) | ⚠️ cohesive integration |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in earlier wave? |
| ---- | ---------- | ---- | ------------------------------- |
| T1–T6 | — | 1 | ✅ |
| T7 | T1 | 2 | ✅ |
| T8 | T1 | 2 | ✅ |
| T9 | T1 | 2 | ✅ |
| T10 | T1 | 2 | ✅ |
| T11 | T1, T4 | 2 | ✅ |
| T12 | T2 | 2 | ✅ |
| T13 | T1, T5 | 3 | ✅ |
| T14 | T1 | 3 | ✅ |
| T15 | T1 | 3 | ✅ |
| T16 | T1, T9 | 3 | ✅ |
| T17 | T1 | 3 | ✅ |
| T18 | T1, T3, T6, T7, T8, T10, T11 | 3 | ✅ |
| T19 | T12, T13, T14, T15, T16, T17, T18 | 4 | ✅ |
| T20 | T19 | 5 | ✅ |

### C — File ownership

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | ui | `src/ui/game/gameCopy.ts`, `src/ui/game/gameCopy.test.ts` | — |
| 1 | T2 | ui | `src/ui/game/accent.ts`, `src/ui/game/accent.test.ts` | — |
| 1 | T3 | ui | `src/ui/game/feedback.ts`, `src/ui/game/feedback.test.ts` | — |
| 1 | T4 | ui | `src/ui/primitives/alert-dialog.tsx` | — |
| 1 | T5 | ui | `src/ui/SpotifyAttribution.tsx`, `src/ui/SpotifyAttribution.test.tsx` | — |
| 1 | T6 | ui | `src/ui/game/useGameShortcuts.ts`, `src/ui/game/useGameShortcuts.test.tsx` | — |
| 2 | T7 | ui | `src/ui/game/SuggestField.tsx`, `src/ui/game/SuggestField.test.tsx` | — |
| 2 | T8 | ui | `src/ui/game/LadderBar.tsx`, `src/ui/game/LadderBar.test.tsx` | — |
| 2 | T9 | ui | `src/ui/game/VolumeControl.tsx`, `src/ui/game/VolumeControl.test.tsx` | — |
| 2 | T10 | ui | `src/ui/game/PlayHereBanner.tsx`, `src/ui/game/PlayHereBanner.test.tsx` | — |
| 2 | T11 | ui | `src/ui/game/GiveUpDialog.tsx`, `src/ui/game/GiveUpDialog.test.tsx` | — |
| 2 | T12 | ui | `src/ui/game/useAccent.ts`, `src/ui/game/useAccent.test.tsx`, `src/ui/game/accentSource.ts` | — |
| 3 | T13 | ui | `src/ui/game/GameShell.tsx`, `src/ui/game/GameShell.test.tsx` | — |
| 3 | T14 | ui | `src/ui/game/CountdownScreen.tsx`, `src/ui/game/ConnectingScreen.tsx`, `src/ui/game/transientScreens.test.tsx` | — |
| 3 | T15 | ui | `src/ui/game/ResultsScreen.tsx`, `src/ui/game/ResultsScreen.test.tsx` | — |
| 3 | T16 | ui | `src/ui/game/SetupScreen.tsx`, `src/ui/game/SetupScreen.test.tsx` | — |
| 3 | T17 | ui | `src/ui/game/RevealScreen.tsx`, `src/ui/game/RevealScreen.test.tsx` | — |
| 3 | T18 | ui | `src/ui/game/RoundScreen.tsx`, `src/ui/game/RoundScreen.test.tsx` | — |
| 4 | T19 | ui | `src/ui/game/GameFlow.tsx`, `src/ui/game/GameFlow.test.tsx` | — |
| 5 | T20 | integration | `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`, delete `src/ui/SetupStandIn.tsx` + `.test.tsx`, `specs/app-v1/ROADMAP.md`, this folder's `spec.md` status | — |

No file appears twice in a wave. `package.json`, `biome.json`, lockfile and `src/index.css` are owned by nobody (nothing here changes them); if a task finds it needs one, it stops and reports.

## Tasks

### T1 — Copy module

**Wave:** 1 · **Layer:** ui · **Requirement:** all (strings) · **Depends on:** —
**Owns:** `src/ui/game/gameCopy.ts`, `src/ui/game/gameCopy.test.ts`
**Reads:** design.md §Copy, `src/ui/pickerCopy.ts` (mirror its style and tests)

**Do:** Export every string from the design's Copy table as constants, plus the small functions that need numbers (`usableTracks(n)`, `roundHeader(n, x)`, `fieldPoints(points)` formatting `+300` / `+37.5`, `skipLabel(step)`, `playLabel(ms)`, `multiplierLabel(kind, value)`, `scoreText(n)` with thousands separators).
**Invariants:** 3 (no `spotify/` import).
**Done when:**
- [ ] Every row of the Copy table has an export and no component string is left to invent.
- [ ] Tests pin the numeric helpers, including singular/plural and `+37.5`.
- [ ] Biome clean.

**Verify:** `npm test -- src/ui/game/gameCopy` → all passing

### T2 — Accent colour maths

**Wave:** 1 · **Layer:** ui · **Requirement:** L-10, L6 · **Depends on:** —
**Owns:** `src/ui/game/accent.ts`, `src/ui/game/accent.test.ts`
**Reads:** design.md §Accent

**Do:** `accentFromPixels(rgba)` (saturation-weighted average, lightness clamped to a band that reads on the dark theme, `onColor` by relative luminance; `null` for an empty or fully transparent array) and `FALLBACK_ACCENT = "#191414"`.
**Invariants:** pure; no DOM, no canvas.
**Done when:**
- [ ] Synthetic pixel arrays (solid red, near-white, near-black, grey, empty) give stable, in-band colours and the right `onColor`.
- [ ] A solid-white or solid-black cover does not produce an unreadable accent.

**Verify:** `npm test -- src/ui/game/accent.test` → all passing

### T3 — Wrong-field derivation

**Wave:** 1 · **Layer:** ui · **Requirement:** L-7 · **Depends on:** —
**Owns:** `src/ui/game/feedback.ts`, `src/ui/game/feedback.test.ts`
**Reads:** `src/game/game.ts`, `src/game/round.ts`, `src/game/types.ts`

**Do:** `wrongFields(submitted, before, after)` as in the design.
**Invariants:** pure; restates no rule (it compares locks, never re-matches text).
**Done when:**
- [ ] Mixed submit → only the unlocked submitted field(s); all-correct → `[]`; round ended (phase `reveal`) → `[]`; blank or already-locked fields → never listed; a featured-artist lock counts as locked.

**Verify:** `npm test -- src/ui/game/feedback` → all passing

### T4 — Alert-dialog primitive

**Wave:** 1 · **Layer:** ui (generated) · **Requirement:** L-9 · **Depends on:** —
**Owns:** `src/ui/primitives/alert-dialog.tsx`
**Reads:** `components.json`, `src/ui/primitives/button.tsx`

**Do:** Add shadcn's `alert-dialog` for this project's config (`npx shadcn@latest add alert-dialog`), with no overwrite of `button.tsx` and no `package.json` change.
**Done when:**
- [ ] `git status` shows only `alert-dialog.tsx` added.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] If the CLI wants to edit another file or add a dependency, stop and report instead.

**Verify:** `npm run typecheck && npm run lint`

### T5 — Attribution text prop

**Wave:** 1 · **Layer:** ui · **Requirement:** L-11 · **Depends on:** —
**Owns:** `src/ui/SpotifyAttribution.tsx`, `src/ui/SpotifyAttribution.test.tsx`
**Reads:** `src/ui/pickerCopy.ts`

**Do:** Accept an optional `text` prop that defaults to `ATTRIBUTION_TEXT`; keep the logo and the Picker's output byte-identical.
**Done when:**
- [ ] Existing assertions pass unchanged; one new test renders custom text beside the logo.

**Verify:** `npm test -- src/ui/SpotifyAttribution src/ui/PlaylistPicker` → all passing

### T6 — Shortcut hook

**Wave:** 1 · **Layer:** ui · **Requirement:** R17 · **Depends on:** —
**Owns:** `src/ui/game/useGameShortcuts.ts`, `src/ui/game/useGameShortcuts.test.tsx`
**Reads:** `src/store/shortcuts.ts`, `src/store/game.ts`

**Do:** `useGameShortcuts(game, enabled)` per the design: a capture-phase `keydown` on `document`, `shortcutFor`, `preventDefault`, then `game.getState().play()` or `.skip()`; cleanup on unmount and when `enabled` turns false.
**Invariants:** 3. No key-matching logic of its own (it passes the event's fields to `shortcutFor`).
**Done when:**
- [ ] A test fires `KeyboardEvent`s with `code` `Space` and `KeyS` + `altKey` while an `<input>` is focused: the action fires, the event is default-prevented, the input's value is unchanged.
- [ ] Unmodified keys, ⌥R, repeats and `enabled = false` do nothing; StrictMode mount registers one listener.

**Verify:** `npm test -- src/ui/game/useGameShortcuts` → all passing

### T7 — Suggest field

**Wave:** 2 · **Layer:** ui · **Requirement:** L-5, L-6, L-7, L8 · **Depends on:** T1
**Owns:** `src/ui/game/SuggestField.tsx`, `src/ui/game/SuggestField.test.tsx`
**Reads:** design.md §Components, `src/ui/primitives/input.tsx`, `src/ui/game/gameCopy.ts`

**Do:** The controlled combobox of the design: `role="combobox"` + `aria-expanded/controls/activedescendant`, a `role="listbox"` of the `suggest(text)` results, ArrowUp/Down, Esc closes, click picks, Enter picks the highlighted option or else calls `onSubmit`, Tab never picks; locked, wrong and hint states.
**Invariants:** renders what it is given; calls `suggest` and nothing from `spotify/`.
**Done when:**
- [ ] user-event tests cover typing → options, arrow + Enter pick, click pick, Enter with nothing highlighted → `onSubmit` once, Tab moves focus without picking, editing after a pick calls `onText` (so the parent clears the pick).
- [ ] The locked state is disabled and shows ✓, the value and the points; `wrong` shows the ✗ line; `hint` shows the pick-a-suggestion line.

**Verify:** `npm test -- src/ui/game/SuggestField` → all passing

### T8 — Ladder bar

**Wave:** 2 · **Layer:** ui · **Requirement:** L-4, L3 · **Depends on:** T1
**Owns:** `src/ui/game/LadderBar.tsx`, `src/ui/game/LadderBar.test.tsx`
**Reads:** `src/game/config.ts`, `src/game/types.ts`

**Do:** Six segments labelled from `clipMs` (1s 2s 4s 7s 11s 16s); `aria-label` "Step N of 6"; spent / current / upcoming expressed by `data-state` and classes.
**Done when:**
- [ ] A test per step 1–6 asserts the states; labels come from the passed config, not constants.

**Verify:** `npm test -- src/ui/game/LadderBar` → all passing

### T9 — Volume control

**Wave:** 2 · **Layer:** ui · **Requirement:** R18 · **Depends on:** T1
**Owns:** `src/ui/game/VolumeControl.tsx`, `src/ui/game/VolumeControl.test.tsx`
**Reads:** `src/ui/game/gameCopy.ts`

**Do:** A labelled native range input (0–100) with a percent readout, mapping to and from the 0–1 `volume` prop and `onChange`.
**Done when:**
- [ ] `volume 0.8` shows 80; a change event calls `onChange(0.35)` for 35; arrow keys step by 1 or 5; the label is associated with the input.

**Verify:** `npm test -- src/ui/game/VolumeControl` → all passing

### T10 — Play-here banner

**Wave:** 2 · **Layer:** ui · **Requirement:** R13, L4 · **Depends on:** T1
**Owns:** `src/ui/game/PlayHereBanner.tsx`, `src/ui/game/PlayHereBanner.test.tsx`
**Reads:** `src/ui/primitives/alert.tsx`, `src/ui/game/gameCopy.ts`

**Do:** `PlayHereBanner({ reason, recovery, onRecover })`: reason text, a Play here button, `working` (disabled, "Reconnecting…"), `failed` (the failure line and a retry on the same button). `role="alert"`.
**Done when:**
- [ ] Tests cover both reasons and the three `recovery` values; the button calls `onRecover` once and is disabled while working.

**Verify:** `npm test -- src/ui/game/PlayHereBanner` → all passing

### T11 — Give-up dialog

**Wave:** 2 · **Layer:** ui · **Requirement:** L-9, L2 · **Depends on:** T1, T4
**Owns:** `src/ui/game/GiveUpDialog.tsx`, `src/ui/game/GiveUpDialog.test.tsx`
**Reads:** `src/ui/primitives/alert-dialog.tsx`, `src/ui/game/gameCopy.ts`

**Do:** The Give up button as the dialog trigger, the confirm and cancel actions, and `onOpenChange` reported to the parent so the round can pause its shortcuts.
**Done when:**
- [ ] Click → dialog; Cancel and Esc close without `onConfirm`; Confirm calls it once; `disabled` blocks opening; `onOpenChange` fires true then false.
- [ ] If jsdom needs a stub (for example `ResizeObserver`), it lives in this test file only.

**Verify:** `npm test -- src/ui/game/GiveUpDialog` → all passing

### T12 — Cover accent hook

**Wave:** 2 · **Layer:** ui · **Requirement:** L-10, L6, D8 · **Depends on:** T2
**Owns:** `src/ui/game/useAccent.ts`, `src/ui/game/useAccent.test.tsx`, `src/ui/game/accentSource.ts`
**Reads:** `src/ui/game/accent.ts`

**Do:** `accentSource.loadPixels(url): Promise<Uint8ClampedArray | null>` (off-screen `Image` with `crossOrigin = "anonymous"`, 32×32 canvas, any failure → `null`), and `useAccent(coverUrl, load = loadPixels)` returning the fallback first and the extracted accent after, ignoring a stale result when the URL changes.
**Invariants:** the visible cover is not touched.
**Done when:**
- [ ] Tests inject `load`: `null` URL → fallback and no call; resolved pixels → accent; `null` → fallback; a URL change discards the earlier result.
- [ ] `accentSource.ts` has no unit test (no canvas in jsdom); its behavior is covered by the live check and said so in the file.

**Verify:** `npm test -- src/ui/game/useAccent` → all passing

### T13 — Game shell

**Wave:** 3 · **Layer:** ui · **Requirement:** L-11 · **Depends on:** T1, T5
**Owns:** `src/ui/game/GameShell.tsx`, `src/ui/game/GameShell.test.tsx`
**Reads:** `src/ui/SpotifyAttribution.tsx`, `src/ui/PlaylistPicker.tsx` (column width and spacing to match)

**Do:** `<main>` single column, children, the accent as a `--art-accent` / `--art-on-accent` style on the root, and `SpotifyAttribution` with the game text below.
**Done when:**
- [ ] The logo image and attribution line render with every child; the accent variables are set when given and absent otherwise.

**Verify:** `npm test -- src/ui/game/GameShell` → all passing

### T14 — Connecting and Countdown screens

**Wave:** 3 · **Layer:** ui · **Requirement:** L-2, R11 · **Depends on:** T1
**Owns:** `src/ui/game/CountdownScreen.tsx`, `src/ui/game/ConnectingScreen.tsx`, `src/ui/game/transientScreens.test.tsx`
**Reads:** `src/ui/game/gameCopy.ts`

**Do:** `CountdownScreen({ value })` (a large number in an `aria-live="assertive"` region) and `ConnectingScreen`.
**Done when:**
- [ ] Each renders its text; re-rendering with `2` then `1` updates the announced number; neither renders any button.

**Verify:** `npm test -- src/ui/game/transientScreens` → all passing

### T15 — Results screen

**Wave:** 3 · **Layer:** ui · **Requirement:** R12, L-14, L-15 · **Depends on:** T1
**Owns:** `src/ui/game/ResultsScreen.tsx`, `src/ui/game/ResultsScreen.test.tsx`
**Reads:** `src/store/game.ts`, `src/game/game.ts` (`summarize`), `src/store/gameHarness.ts`

**Do:** From `summarize(game)`: final score, six histogram rows plus Missed (CSS bars scaled to the max), hat tricks, rounds played, Play again (`game.playAgain()`, autofocus) and Change playlist (`onChangePlaylist`).
**Done when:**
- [ ] A test plays a harness game to `finished` and checks score, histogram counts, hat tricks and both buttons; a harness game where every cue fails (`roundsPlayed: 0`) shows the L-15 text and no histogram.

**Verify:** `npm test -- src/ui/game/ResultsScreen` → all passing

### T16 — Setup screen

**Wave:** 3 · **Layer:** ui · **Requirement:** L-1, L-2, R18 · **Depends on:** T1, T9
**Owns:** `src/ui/game/SetupScreen.tsx`, `src/ui/game/SetupScreen.test.tsx`
**Reads:** `src/ui/SetupStandIn.tsx` (the card style it replaces), `src/game/presets.ts`, `src/store/game.ts`

**Do:** Card with the playlist name and usable count; X presets from `presetOptions(tracks.length)` as `aria-pressed` buttons (disabled ones greyed, the effective selection from `pickRounds`); Mode and Start groups with Endless and Random disabled "coming soon"; `VolumeControl` wired to `game.setVolume`; Back; **Start** calling `game.getState().start(tracks)` directly in the click handler.
**Done when:**
- [ ] With 12 usable tracks, 20 is disabled and 10 selected, and choosing 5 calls `setRounds(5)`; Start calls `start` with the same `tracks` array once and a second click while connecting does nothing visible; Endless and Random cannot be selected; the volume slider calls `setVolume`.

**Verify:** `npm test -- src/ui/game/SetupScreen` → all passing

### T17 — Reveal screen

**Wave:** 3 · **Layer:** ui · **Requirement:** R11, L-10, L-11 · **Depends on:** T1
**Owns:** `src/ui/game/RevealScreen.tsx`, `src/ui/game/RevealScreen.test.tsx`
**Reads:** `src/store/game.ts`, `src/game/game.ts`, `src/game/scoring.ts`, design.md §Accent, spec.md L5

**Do:** From `revealed` and `game.results.at(-1)`: the cover (`object-contain`, square, `rounded-[8px]`, nothing over it, placeholder if `null`), full title / artists / album, a row per locked field with its exact points, combo / mode / reroll rows only when ≠ 1, round total, running score (`summarize(game).score`), a **PLAY ON SPOTIFY** link to `https://open.spotify.com/track/<id>` (new tab, `rel="noopener noreferrer"`), **Next** (autofocus → `game.next()`). It does not call `useAccent`; `GameFlow` does (T19) and the shell paints the accent.
**Done when:**
- [ ] Tests cover a hat-trick round, an album-skipped ×2.0 round, a gave-up round with no locks, a featured-artist 50% row, and the link href; nothing is drawn over the cover; Next fires `next()` once.

**Verify:** `npm test -- src/ui/game/RevealScreen` → all passing

### T18 — Round screen

**Wave:** 3 · **Layer:** ui · **Requirement:** R6, R13, R14, R17, L-4 – L-9, L-12, L-13 · **Depends on:** T1, T3, T6, T7, T8, T10, T11
**Owns:** `src/ui/game/RoundScreen.tsx`, `src/ui/game/RoundScreen.test.tsx`
**Reads:** design.md §Round screen detail, `src/store/game.ts`, `src/store/gameHarness.ts`, `src/game/scoring.ts`, `src/ui/PlaylistPicker.tsx` (spacing)

**Do:** The A17 column with the components above: header (round n of X, running score), `LadderBar`, Play (label from `playLabel`, disabled unless `playback` is `ready`), the three `SuggestField`s (or the album-skipped note), Submit / Skip (step-6 label) / `GiveUpDialog`, the `PlayHereBanner` replacing Play while interrupted, the L9 notice with Dismiss, `useGameShortcuts(game, !dialogOpen)`, first-field focus, and per-round field state (remount keyed by `game.cursor`).
**Invariants:** no rule restated; guesses contain only picked values.
**Done when:**
- [ ] Tests against `createHarness` + `makeTracks()`: Play calls `playClip` with the step's length; a mixed submit locks the right field with its points and marks the wrong one; a full-correct submit moves the store to `reveal`; Enter in a field with no highlighted suggestion submits; unpicked text shows the hint and costs no step; the album-skipped track shows the note; Skip at step 6 shows the warning label and ends the round; Give up needs the dialog; `adapter.interrupt("taken-over")` swaps Play for the banner, disables the actions, and Play here calls `recover` and restores Play; `adapter.hideTab()` changes nothing visible; `failNextCue` shows the notice and Dismiss clears it; ⌥Space / ⌥S inside a field act without typing.

**Verify:** `npm test -- src/ui/game/RoundScreen` → all passing

### T19 — Game flow

**Wave:** 4 · **Layer:** ui · **Requirement:** L-1 – L-3, L-10, L-14, R11, R12 · **Depends on:** T12 – T18
**Owns:** `src/ui/game/GameFlow.tsx`, `src/ui/game/GameFlow.test.tsx`
**Reads:** every `src/ui/game/*.tsx`, `src/store/game.ts`, `src/store/playlists.ts`, `src/store/wiring.ts`

**Do:** Subscribe to `stage` and render `idle` → `SetupScreen`, `connecting` → `ConnectingScreen`, `round` → `RoundScreen` (with `suggest` from the selection's `SuggestionIndex`), `reveal` → `RevealScreen`, `countdown` → `CountdownScreen`, `finished` → `ResultsScreen`, each inside `GameShell`; it calls `useAccent(stage is "reveal" ? revealed?.coverUrl ?? null : null)` and passes the result to the shell, so only the Reveal is tinted.
**Done when:**
- [ ] One test plays a 5-round game end to end by clicking and typing (a mix of complete rounds, a give-up and a step-6 skip), stepping the countdown with `harness.tick()`, asserting the screen at every stage, the final score equal to `summarize`, and Play again returning to `connecting` → `round`.
- [ ] A start-failure test (`failNextConnect`) leaves the stage `idle` and the harness records the `onStartFailed` call.

**Verify:** `npm test -- src/ui/game/GameFlow` → all passing

### T20 — Integration: App, main.tsx, stand-in removal, docs

**Wave:** 5 · **Layer:** integration · **Requirement:** R15, L-3, L-14 · **Depends on:** T19
**Owns:** `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`, `src/ui/SetupStandIn.tsx`, `src/ui/SetupStandIn.test.tsx` (deleted), `specs/app-v1/ROADMAP.md`, `specs/game-loop-visual/spec.md` (status)
**Reads:** design.md §`main.tsx` composition, `src/spotify/playback/engine.ts`, `src/spotify/playback/sdk/transport.ts`, `src/spotify/api.ts`, `src/game/rng.ts`

**Do:** First read `createRng`'s signature, `createSpotifyApi`'s `put`, and the transport deps; then build the adapter and game store in `main.tsx` as in the design, register `connectGameToSession` and `connectLeaveGuard(game, window)`, add the `game` prop to `App`, render `GameFlow` in the `setup` case where `SetupStandIn` was, delete the stand-in and its test, link this spec in the ROADMAP row and update its "Needs verification" bullet on Spotify's guidelines (verified 2026-11-12).
**Invariants:** 3 and 5: nothing outside `main.tsx` builds the real adapter.
**Done when:**
- [ ] `App.test.tsx` renders the `setup` screen with a ready playlist and a harness store and sees the Setup screen; a non-ready selection still shows the Picker.
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` are green, and `npm test -- tools/invariants` passes.

**Verify:** `npm run typecheck && npm run lint && npm test && npm run build`

## After wave 5 (not subagent work)

1. The orchestrator starts `npm run dev` (127.0.0.1:5173) and the owner runs the **live check** from the spec's *Done when*.
2. Bugs found there are triaged: screen bugs are fixed in this branch; a rule or adapter bug becomes a small follow-up item against 5a or 3, not an edit here.
3. Manual sign-off at about 1280×800, then mark the spec Implemented and the ROADMAP row Done.
