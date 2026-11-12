# Random start + rerolls (visual) — tasks

**Spec:** [spec.md](spec.md) · **Design:** none (Medium: no new pattern, one added field on an existing selector)
**Status:** Draft

UI tasks are verified with jsdom (`// @vitest-environment jsdom` at the top of the test file, as in `RoundScreen.test.tsx`), `@testing-library/react` and `user-event`. Tests that need a live store use `createHarness` from `@/store/gameHarness`; none uses a real timer. Branch `feat/7b/random-start-visual` from `main`. Commit the spec files first, then one commit per task or wave.

## Execution plan

| Wave | Tasks | Mode |
| ---- | ----- | ---- |
| 1 | T1, T2, T3, T4 | parallel — 4 subagents |
| 2 | T5, T6 | parallel — 2 subagents |
| 3 | T7 | sequential — full-game test |
| — | Docs update, live check and sign-off (spec *Done when*) | orchestrator + owner |

## Validation

**A — Granularity:** ✅ · **B — Dependencies:** ✅ · **C — File ownership:** ✅

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | one helper extracted + one field on `rerollStatus` (same formula, `game/`) | ⚠️ 2 cohesive things, one layer |
| T2 | the copy module's new strings and helpers | ✅ Atomic |
| T3 | one generated primitive | ✅ Atomic |
| T4 | one hook branch | ✅ Atomic |
| T5 | one screen (Setup toggle + tooltips) | ✅ Atomic |
| T6 | one screen (Round: button, reason, notice) | ✅ Atomic |
| T7 | one full-game test file + one Reveal test | ⚠️ 2 test files, one concern ("Random game end to end") |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in earlier wave? |
| ---- | ---------- | ---- | ------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T4 | — | 1 | ✅ |
| T5 | T2, T3 | 2 | ✅ |
| T6 | T1, T2 | 2 | ✅ |
| T7 | T4, T5, T6 | 3 | ✅ |

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | game | `src/game/scoring.ts`, `src/game/scoring.test.ts`, `src/game/game.ts`, `src/game/game.test.ts` | — |
| 1 | T2 | ui | `src/ui/game/gameCopy.ts`, `src/ui/game/gameCopy.test.ts` | — |
| 1 | T3 | ui (primitive) | `src/ui/primitives/tooltip.tsx` | — |
| 1 | T4 | ui | `src/ui/game/useGameShortcuts.ts`, `src/ui/game/useGameShortcuts.test.tsx` | — |
| 2 | T5 | ui | `src/ui/game/SetupScreen.tsx`, `src/ui/game/SetupScreen.test.tsx` | — |
| 2 | T6 | ui | `src/ui/game/RoundScreen.tsx`, `src/ui/game/RoundScreen.test.tsx` | — |
| 3 | T7 | ui | `src/ui/game/GameFlow.test.tsx`, `src/ui/game/RevealScreen.test.tsx` | — |

`gameCopy.ts` is the shared touchpoint (every screen reads it), so one task owns it and the screens wait for it (T5, T6 depend on T2). No barrels, manifest or entry point change.

## Tasks

### T1 — Extract the reroll multiplier and expose `nextMultiplier`

**Wave:** 1
**Layer:** game
**Requirement:** RV-9 (V3, V6)
**Depends on:** —
**Owns:** `src/game/scoring.ts`, `src/game/scoring.test.ts`, `src/game/game.ts`, `src/game/game.test.ts`
**Reads:** `specs/random-start-logic/design.md` §`src/game/game.ts`, `src/game/config.ts`

**Do:** Export `rerollMultiplier(config, paidRerolls)` from `scoring.ts` (`max(rerollPenaltyFloor, 1 − rerollPenalty·n)`), use it inside `scoreRound`, and add `nextMultiplier` to `rerollStatus`: the multiplier of the current round if the next reroll happens (`paidRerolls + 1` when `nextIsPaid`, else `paidRerolls`), and 1 outside phase `round`.

**Invariants:** 1, 2 — pure, no new imports, no ambient time or randomness. 4 n/a (nothing persisted).

**Done when:**
- [ ] `scoreRound`'s results are unchanged (existing tests untouched and green).
- [ ] `rerollStatus` returns `nextMultiplier` 1 while free rerolls remain, 0.9 / 0.8 … for the first paid ones, 0.5 at and past the floor, and 1 outside a round; existing `rerollStatus` `toEqual` tests are extended, not loosened.
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/scoring src/game/game.test` → all passing, then `npm run lint && npm run typecheck`.

### T2 — Copy for Random start and rerolls

**Wave:** 1
**Layer:** ui
**Requirement:** RV-1, RV-2, RV-5, RV-7 (spec *Copy*)
**Depends on:** —
**Owns:** `src/ui/game/gameCopy.ts`, `src/ui/game/gameCopy.test.ts`
**Reads:** `specs/random-start-visual/spec.md` §Copy, the existing helpers in `gameCopy.ts`

**Do:** Add `START_CLASSIC_TOOLTIP`, `startRandomTooltip(multiplier, freeRerolls)`, `rerollLabel(freeLeft, nextMultiplier)` (free text while `freeLeft > 0`, else `Reroll (round ×0.8)` through the existing number formatting), `REROLL_UNAVAILABLE` and `REROLL_NOTICE`; keep `START_RANDOM` and `comingSoon` (Endless still uses it).

**Invariants:** none beyond layering (no imports from `spotify/`).

**Done when:**
- [ ] Each string and helper has a test: `rerollLabel(3, 1)` → `Reroll (3 free left)`, `rerollLabel(1, 1)` → `Reroll (1 free left)`, `rerollLabel(0, 0.9)` → `Reroll (round ×0.9)`, `rerollLabel(0, 0.5)` → `Reroll (round ×0.5)`.
- [ ] `startRandomTooltip(1.25, 3)` reads `Each round starts mid-track. Score ×1.25. 3 free rerolls per game.`

**Verify:** `npm test -- src/ui/game/gameCopy` → all passing.

### T3 — Tooltip primitive

**Wave:** 1
**Layer:** ui (generated shadcn primitive)
**Requirement:** RV-1 (V5)
**Depends on:** —
**Owns:** `src/ui/primitives/tooltip.tsx`
**Reads:** `src/ui/primitives/alert-dialog.tsx` (same import style: `import { Tooltip as TooltipPrimitive } from "radix-ui"`), `components.json`

**Do:** Add shadcn's `Tooltip`, `TooltipTrigger`, `TooltipContent` (each `Tooltip` wraps its own `TooltipPrimitive.Provider`, so no root provider is needed), styled with the project's tokens. Generate it with the shadcn CLI if it works offline against the installed `radix-ui`; otherwise write it by hand in the same shape as the other primitives. No new dependency.

**Invariants:** 3 — `radix-ui` is already a dependency; `package.json` and the lockfile stay unchanged.

**Done when:**
- [ ] The file typechecks and lints (primitives are covered by the project's Biome config like the others).
- [ ] `git diff` shows no change to `package.json` or `package-lock.json`.
- [ ] Its behavior is proven by T5's tests (opens on focus), as for the other primitives.

**Verify:** `npm run typecheck && npm run lint`.

### T4 — ⌥R calls `reroll()`

**Wave:** 1
**Layer:** ui
**Requirement:** RV-8 (V10)
**Depends on:** —
**Owns:** `src/ui/game/useGameShortcuts.ts`, `src/ui/game/useGameShortcuts.test.tsx`
**Reads:** `src/store/shortcuts.ts`, `src/store/game.ts` (`reroll`)

**Do:** Add the `reroll` branch to the hook's dispatch (`play`, `skip`, `reroll`) and update the docs comment; the event is still `preventDefault`ed and a held repeat still does not act.

**Invariants:** 3 — the hook reads the store only.

**Done when:**
- [ ] A test presses ⌥R inside a focused input and asserts `reroll()` was called once and no character was typed.
- [ ] The "⌥R is swallowed and does nothing" test from 7a is replaced by this one; a repeat keydown does not call `reroll()` a second time.
- [ ] The other ⌥ combinations still do nothing.

**Verify:** `npm test -- src/ui/game/useGameShortcuts` → all passing.

### T5 — Setup: Random toggle with tooltips

**Wave:** 2
**Layer:** ui
**Requirement:** RV-1
**Depends on:** T2, T3
**Owns:** `src/ui/game/SetupScreen.tsx`, `src/ui/game/SetupScreen.test.tsx`
**Reads:** `src/ui/game/gameCopy.ts`, `src/ui/primitives/tooltip.tsx`, `src/store/game.ts` (`startMode`, `setStartMode`), `src/game/config.ts` (`DEFAULT_CONFIG`)

**Do:** Make **Random** enabled and pressed from `startMode`, call `setStartMode` on click for both buttons, and wrap each in a `Tooltip` with the T2 text (multiplier and free rerolls read from `DEFAULT_CONFIG` through `startRandomTooltip`).

**Invariants:** 3 — `ui` imports `game/` and `store/`, never `spotify/`.

**Done when:**
- [ ] The "Random (coming soon)" test is replaced: Random is enabled, clicking it sets `startMode` to `random` and marks it pressed; clicking Classic sets it back.
- [ ] Focusing each button with Tab shows its tooltip text; hovering does too.
- [ ] Endless stays disabled with "(coming soon)".
- [ ] Start still disabled outside stage `idle`.

**Verify:** `npm test -- src/ui/game/SetupScreen` → all passing.

### T6 — Round: Reroll button, reason line and failed-reroll notice

**Wave:** 2
**Layer:** ui
**Requirement:** RV-2, RV-3, RV-4, RV-5, RV-6, RV-7, V11
**Depends on:** T1, T2
**Owns:** `src/ui/game/RoundScreen.tsx`, `src/ui/game/RoundScreen.test.tsx`
**Reads:** `src/ui/game/gameCopy.ts`, `src/game/game.ts` (`rerollStatus`), `src/store/game.ts` (`reroll`, `rerollNotice`, `skippedNotice`, `dismissRerollNotice`)

**Do:** In a Random game render **Reroll** after Give up (A17 order), labelled with `rerollLabel(freeLeft, nextMultiplier)` from `rerollStatus(state)`, calling `reroll()` and disabled unless the playback is actionable and `available`; when `!available` show `REROLL_UNAVAILABLE` beside it; render the failed-reroll Alert (dismiss → `dismissRerollNotice()`) only when `skippedNotice` is false.

**Invariants:** 3 — no `spotify/` import; the screen restates no rule (all numbers come from `rerollStatus` and the config).

**Done when:**
- [ ] Random game, round can reroll: button reads `Reroll (3 free left)`, pressing it calls the store's `reroll()`, the step, locks and typed text are unchanged (V11).
- [ ] After three rerolls the label is `Reroll (round ×0.9)`, then `×0.8`.
- [ ] Short track in a Random game: button disabled and the reason shown. Classic: no Reroll button (the existing assertion stays).
- [ ] Button disabled while the playback is `preparing` and while `interrupted`, with no reason line.
- [ ] A failed reroll cue (fake adapter `cue-failed`) shows the notice and Dismiss hides it; with `skippedNotice` also set only the skipped-track Alert shows.
- [ ] Tests use the real store and the fake adapter, no real timers.

**Verify:** `npm test -- src/ui/game/RoundScreen` → all passing.

### T7 — Random game end to end, and the Reveal rows

**Wave:** 3
**Layer:** ui
**Requirement:** RV-1…RV-10 together, V9
**Depends on:** T4, T5, T6
**Owns:** `src/ui/game/GameFlow.test.tsx`, `src/ui/game/RevealScreen.test.tsx`
**Reads:** `src/ui/game/GameFlow.tsx`, `src/ui/game/gameTestUtils.ts`, `src/store/gameHarness.ts`

**Do:** Add a `GameFlow` test that picks Random in Setup, starts, sees round 1 cued with a non-zero start (fake adapter's cue arguments), rerolls by button and by ⌥R, reaches the Reveal and sees `Random start ×1.25`; add a `RevealScreen` test for a paid reroll (`Rerolls ×0.9` shown, and absent in a round with no paid reroll).

**Invariants:** none new.

**Done when:**
- [ ] The two tests are green against the real store and fake adapter; Play again keeps Random selected and resets the free-reroll label to 3.
- [ ] Existing assertions that Classic shows no `Random start` / `Rerolls` row stay.

**Verify:** `npm test -- src/ui/game` → all passing.

## After wave 3 (orchestrator)

1. Full gate: `npm run lint && npm run typecheck && npm test && npm test -- tools/invariants && npm run build`.
2. Update [ROADMAP.md](../app-v1/ROADMAP.md) row 7b to **Implemented** with the pointer to this spec, and set this spec and tasks to `Implemented` with a short *Result* (deviations only).
3. Hand the owner the live-check list from the spec's *Done when*. Dev server: `npm run dev` on `http://127.0.0.1:5173`, started by the orchestrator, never by a subagent.
