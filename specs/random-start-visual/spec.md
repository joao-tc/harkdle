# Random start + rerolls (visual) — spec

**Size:** Medium
**Sub-phase:** visual (roadmap item 7b. The logic half is [specs/random-start-logic](../random-start-logic/spec.md), merged and green.)
**Status:** Draft
**Branch:** `feat/7b/random-start-visual`, from `main`

## Problem

The store can already pick, cue and reroll start points, and the settings already remember the start type, but no screen reaches any of it: Setup shows a disabled "Random (coming soon)", the Round has no Reroll button, a failed reroll sets a flag nobody reads, and ⌥R is swallowed and does nothing. This half draws those four things. Most of the Reveal work is already there from item 5b (the "Random start ×1.25" and "Rerolls ×0.9" rows), so it only gets tests.

## Ambiguity ledger

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| V1  | A round of a Random game cannot reroll (short track, or no point 8 s away). What does the button do? | Resolved | **Disabled, with a short reason** beside it. The layout does not jump between rounds. In Classic the button is **not rendered** (the item 5b test already pins that). |
| V2  | Where are the free rerolls left and the cost shown? | Resolved | **On the button.** |
| V3  | What does the label promise once the next reroll is paid? | Resolved | **The resulting round multiplier**: `Reroll (round ×0.8)`. It needs a value from `game/`, so it is the one logic exception in this half (V6). At the floor it reads `Reroll (round ×0.5)`, which is true. |
| V4  | How does the Setup toggle read? | Resolved | Buttons **Classic** / **Random**, each with a **tooltip** (hover and keyboard focus) instead of a hint line. |
| V5  | Which tooltip? | Resolved | A **shadcn `Tooltip` primitive** generated from the `radix-ui` package already installed (no new dependency). Both Classic and Random get a tooltip. |
| V6  | Where does the "resulting multiplier" come from? | Resolved | **Inside 7b, as a wave-1 task**: one new field on `rerollStatus` (`nextMultiplier`) and the multiplier formula extracted from `scoreRound` into one exported helper that both use. 7b stays Medium; this is the single place where a visual half touches `game/`. |
| V7  | A reroll's cue fails, and the old start's re-cue also fails (both notices are set)? | Resolved | **Only the skipped-track notice shows**, because the track changed and "kept your old start" would be false. |
| V8  | How is it accepted? | Resolved | jsdom component tests with the real store and the fake adapter, plus **the owner's live check** in desktop Chrome at `127.0.0.1` (the first real non-zero start). |
| V9  | Does the Reveal need new work? | Resolved | **No new rows.** [RevealScreen.tsx](../../src/ui/game/RevealScreen.tsx) already renders `Random start ×…` and `Rerolls ×…` (item 5b, S14 of 7a). 7b adds a test that a Random game with a paid reroll shows both. |
| V10 | Does ⌥R need anything beyond calling `reroll()`? | Resolved | **No.** The store already ignores it in Classic, on the Reveal, while frozen, and while a cue settles (RS-7). The hook only stops swallowing it. |
| V11 | Does the typed text survive a reroll? | Resolved | **Yes.** A reroll does not change the cursor, so `RoundScreen` does not remount: typed text, picks and wrong marks stay (the rule keeps step and locks). |
| V12 | Copy? | Resolved on approval | Drafted in *Copy*; the user edits it when approving this spec. |

**Open: 0**

Category sweep: scope ✅ (V9, out of scope) · rules ✅ (none new except V6's read-only helper; RS-1…RS-12 stay the source) · layer ✅ (`ui/`; one `game/` helper, V6) · build order ✅ (7a merged and green) · data ✅ (nothing new persisted; the start type already is, 7a) · time/random ✅ (no ambient time or randomness; draws stay in the reducer) · behavior ✅ (V1, V7, V10, V11) · errors ✅ (V7, Edge cases) · contracts ✅ (`rerollStatus` gains one field; existing callers keep working) · platform ✅ (desktop Chrome, A4; tooltips need no touch support) · non-functional ✅ (tooltip reachable by keyboard, `aria-live` not needed beyond the existing Alert, visible focus) · fairness ✅ (n/a) · done ✅ (V8)

## Requirements

| ID   | Requirement | Priority |
| ---- | ----------- | -------- |
| RV-1 | WHEN Setup is shown THEN **Random** SHALL be a normal choice next to **Classic** (no "coming soon"), SHALL call `setStartMode`, SHALL show the saved choice as pressed, and each button SHALL have a tooltip that opens on hover and on keyboard focus. | P1 |
| RV-2 | WHEN the game is Random and the round can reroll THEN the Round SHALL show a **Reroll** button labelled with the free rerolls left while any remain (`Reroll (2 free left)`), and with the round's resulting multiplier once the next one is paid (`Reroll (round ×0.8)`). | P1 |
| RV-3 | WHEN the Reroll button is pressed THEN the screen SHALL call `reroll()` and nothing else; the step, locks and typed text SHALL stay. | P1 |
| RV-4 | WHEN the game is Classic THEN the Round SHALL NOT render a Reroll button. | P1 |
| RV-5 | WHEN the game is Random and the round cannot reroll THEN the button SHALL be disabled and a reason SHALL be shown beside it. | P1 |
| RV-6 | WHEN the playback is not `ready` or `playing` (preparing, interrupted) THEN the Reroll button SHALL be disabled, like Submit and Skip, with no reason line. | P1 |
| RV-7 | WHEN `rerollNotice` is set and `skippedNotice` is not THEN the Round SHALL show an Alert with a Dismiss button that calls `dismissRerollNotice()`. WHEN both are set THEN only the skipped-track notice SHALL show. | P1 |
| RV-8 | (R17) WHEN ⌥R is pressed, even inside a field, THEN `useGameShortcuts` SHALL call `reroll()` and SHALL still swallow the key (no character typed). Held repeats SHALL be swallowed without acting. | P2 |
| RV-9 | WHEN `rerollStatus` is asked THEN it SHALL also return `nextMultiplier`: the round's reroll multiplier if the next reroll happens, using the same formula as `scoreRound`. | P1 |
| RV-10 | WHEN a Random game has a paid reroll in a round THEN the Reveal SHALL show `Random start ×1.25` and `Rerolls ×…` rows, and `Rerolls` SHALL be absent in a round with none. | P2 |

## Copy (draft, V12)

| Situation | Text |
| --------- | ---- |
| Setup, Classic | button `Classic`; tooltip `Every clip starts at 0:00.` |
| Setup, Random | button `Random`; tooltip `Each round starts mid-track. Score ×1.25. 3 free rerolls per game.` (the numbers come from the game config, not typed in) |
| Reroll, free left | `Reroll (3 free left)`, `Reroll (1 free left)` |
| Reroll, paid | `Reroll (round ×0.9)`, `Reroll (round ×0.5)` |
| Cannot reroll | `No reroll on this track: it is too short.` |
| Failed reroll notice | `Couldn't load that start point. Your round keeps its old start, and no reroll was spent.` |

## Edge cases

- WHEN the free rerolls are used up and the next round is a fallback round THEN its button is disabled with the reason, and the budget carries over (7a).
- WHEN ⌥R is pressed in Classic, on the Reveal, while frozen or while a cue settles THEN nothing happens (the store guards, V10).
- WHEN the player mashes Reroll THEN at most one reroll applies per settled state (the store's gate).
- WHEN the tooltip's button is disabled (never the case for Classic or Random in Setup) THEN no special handling is needed.
- WHEN a reroll's cue fails THEN the notice shows once and stays until dismissed or the track changes by Next; it does not auto-dismiss (as the skipped-track notice).

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Showing the start position or a waveform | Not in game-design.md (7a). |
| A reroll count on the Results screen | 7a S14. |
| A confirm dialog before a paid reroll | 7a S5. |
| Endless | Item 8. |
| A shortcut hint on the Reroll button | Play and Skip show none either. |
| Mobile layout | A4. |

## Done when

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm test -- tools/invariants` and `npm run build` are green.
- [ ] Component tests cover RV-1 to RV-10 with the real store and the fake adapter (no real timers).
- [ ] **Live check (owner, desktop Chrome at `http://127.0.0.1:5173`):** choose Random in Setup (tooltips show on hover and Tab); the first clip starts mid-track, not at 0:00; Reroll changes the start, keeps the step and typed text; the label counts 3 → 2 → 1 free, then shows `round ×0.9`, `×0.8`; ⌥R rerolls without typing; a short track shows the disabled button with its reason; the Reveal shows `Random start ×1.25` and `Rerolls ×…`; Classic shows no Reroll button and plays from 0:00; reload remembers the start type.
