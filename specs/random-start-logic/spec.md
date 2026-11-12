# Random start + rerolls (logic) — spec

**Size:** Large
**Sub-phase:** logic (roadmap item 7, first half. The screens are `specs/random-start-visual/`, planned once this is merged and green.)
**Status:** Draft

## Problem

M1 plays every clip from 0:00. Item 7 adds the second start type: each round starts somewhere inside the track (×1.25), and the player can reroll that start point (3 free per game, then a 10% penalty on the round). The rules for it are already in [game-design.md](../../game-design.md), and the scoring knobs (`randomStartMultiplier`, `rerollPenalty`, `scoreRound`'s `randomStart` / `paidRerolls`) already exist but nothing feeds them. This half makes the engine pick, store and reroll start points, and makes the store cue them. The visual half then only draws it.

## Ambiguity ledger

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| S1  | Item 7 is "logic + visual". Split it? | Resolved | **Yes**, like 5a/5b: `random-start-logic` (this), then `random-start-visual`. The ROADMAP row becomes 7a / 7b. |
| S2  | Where does the start-point range come from? | Resolved | game-design.md and A12: from 10% of the length to (length − 16 s − 2 s margin). If that range is empty, the round starts at 0:00 and reroll is disabled for it. |
| S3  | Spacing of a reroll from the current start? | Resolved | **At least 8 s away** from the current start (new config value). If the window offers no such point, reroll is disabled for that round. |
| S4  | Do 0:00 fallback rounds of a Random game get ×1.25? | Resolved | **Yes.** The multiplier belongs to the game's start type, not to the round. |
| S5  | Warning before a paid reroll? | Resolved | **No dialog.** The button shows the cost (visual half). ⌥R stays instant. |
| S6  | The cue at the new start fails after a reroll? | Resolved | **Keep the old start, spend nothing**: restore the round as it was, re-cue the old start, show a dismissible notice. If that re-cue also fails with `cue-failed`, the standard cue-failure path applies (the track is skipped and replaced, never scored as a miss), because a `cue-failed` leaves the adapter `idle` and there is no Play-here to freeze on. |
| S7  | A device takeover or loss during the reroll's cue? | Resolved | The reroll **stands** (it was committed before the cue) and the round freezes as usual. Play here re-cues the adapter's target, which is the new start, so the game and the adapter agree. |
| S8  | Is the free-reroll budget per game or per round? | Resolved | Per game (game-design.md). A new game, including Play again, resets it. |
| S9  | When can the player reroll? | Resolved | Any time in a round of a Random game while the round is actionable (adapter `ready` or `playing-clip`, none settling). A reroll continues the round, so by G9 it stops a playing clip. Never on the Reveal, in Classic, or while frozen. It never changes the step or the locks. |
| S10 | Does Classic change? | Resolved | **No.** Classic draws nothing from the RNG, so the same seed gives the same queue and the same results as today. |
| S11 | Where does the RNG for start points live? | Resolved | In `GameState` (see design.md, decision D2). The injected RNG that shuffles the queue keeps drawing, so a replay of the same seed and actions is identical (invariant 2). |
| S12 | How does `game/` learn the track length? | Resolved | A `TimedTrack` type (`Track` + `durationMs`), the queue's element type. `PlaylistTrack` already has `durationMs`. `Track` itself, and every test that builds one for the round reducer, stay as they are. |
| S13 | Is the start type remembered between visits? | Resolved | By item 6 (A16), not here. This half keeps `startMode` in the game store in memory, like X and volume today. Whichever of items 6 and 7 lands second wires the two together. |
| S14 | Does the Results screen show rerolls used? | Resolved | **No.** It is not in game-design.md's end-of-game stats. The Reveal already shows the "Rerolls ×0.9" row (visual half confirms). |
| S15 | The numbers (3 free, 10%, floor 50%, 10%, 18 s, 8 s)? | Resolved | All in `DEFAULT_CONFIG` (game-design.md: one config file). New keys: `startMinRatio`, `startTailMs`, `freeRerolls`, `rerollMinDistanceMs`. |

**Open: 0**

Category sweep: scope ✅ (S1, S14, out of scope below) · rules ✅ (S2–S4, S8–S10) · layer ✅ (game, one type, store, one shortcut mapping) · build order ✅ (needs M1; see the note under Done when) · data ✅ (nothing persisted, invariant 4 n/a; S13) · time/random ✅ (S10, S11) · behavior ✅ (S6, S7, S9) · errors ✅ (S6, S7, Edge cases) · contracts ✅ (design.md) · platform ✅ (headless; A4) · non-functional ✅ (a reroll is one muted cue, ADR-0003) · fairness ✅ (single-player; the reroll limit is a rule, not security) · done ✅

## Requirements

| ID   | Requirement | Priority |
| ---- | ----------- | -------- |
| RS-1 | (R20) WHEN a round of a Random game begins THEN its start SHALL be an integer number of milliseconds drawn uniformly from [⌈0.1·length⌉, length − 18 000]. If that range is empty, the start SHALL be 0 and the round SHALL have no reroll. | P1 |
| RS-2 | WHEN the game is Classic THEN every start SHALL be 0, no reroll SHALL exist, and the RNG SHALL be used for the shuffle only. | P1 |
| RS-3 | (R21) WHEN `reroll` runs in a Random round that can reroll THEN the round SHALL get a new start drawn uniformly from the window with every point closer than 8 s to the current start removed, and its step and locks SHALL not change. | P1 |
| RS-4 | WHEN the window has no point 8 s or more from the current start THEN the round SHALL be unable to reroll, and `reroll` SHALL change nothing. | P1 |
| RS-5 | (R21, A11) WHEN a reroll happens THEN, if fewer than 3 rerolls were used in this game, it SHALL be free; otherwise it SHALL count as a paid reroll of this round. The round score SHALL use `paidRerolls` of that round, and every round score of a Random game SHALL use `randomStart: true`. | P1 |
| RS-6 | WHEN a round starts, after Next, after a replaced track, or after a reroll THEN the store SHALL cue `{ uri, startMs: round.startMs }`. | P1 |
| RS-7 | (S9) WHEN `reroll` runs in stage `round` with the adapter `ready` or `playing-clip`, and nothing is settling, THEN the store SHALL commit the new start, stop the clip, and cue the new start. In any other state it SHALL do nothing, and a second call before the cue settles SHALL be ignored. | P1 |
| RS-8 | (S6) WHEN the reroll's cue rejects `cue-failed` THEN the store SHALL restore the game as it was before the reroll, re-cue the old start, and set `rerollNotice`. | P1 |
| RS-9 | (S7) WHEN the reroll's cue is cut by an interruption THEN the reroll SHALL stand and the round SHALL freeze (G-9). | P1 |
| RS-10 | WHEN `setStartMode` runs THEN the next `start` and `playAgain` SHALL use it. It SHALL survive Play again and `leave`, as X does. | P1 |
| RS-11 | (R17) WHEN a key event has `code` `KeyR` with Alt and no other modifier, and is not a repeat, THEN `shortcutFor` SHALL return `reroll`. | P2 |
| RS-12 | WHEN a UI asks THEN a pure selector SHALL give `{ available, freeLeft, nextIsPaid }` for the current round, so no screen restates a rule. | P1 |

## Edge cases

- WHEN a track is shorter than 20 s THEN the window is empty (max < min) and the round starts at 0:00 with no reroll (RS-1). At exactly 20 s it is a single point, and RS-4 removes the reroll.
- WHEN the free budget is used up mid-game and the next round is a fallback round THEN nothing is spent; the budget carries over to the next rerollable round.
- WHEN a Random game's track fails to cue and is replaced THEN the replacement draws its own start, and no reroll is spent.
- WHEN `reroll` is called with the round ended, in the reveal, or in stage `finished` THEN nothing happens.
- WHEN the player mashes ⌥R THEN at most one reroll is applied per settled state (the same gate as Submit and Skip).
- WHEN `leave` runs during a reroll's cue THEN nothing changes afterwards.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| The Setup toggle, the Reroll button and its label, the notice, the Reveal rows, the ⌥R key handler | `specs/random-start-visual/`. |
| Persisting the start type | Item 6 (A16, R16). |
| Endless | Item 8. |
| Showing the start position or a waveform | Not in game-design.md. |
| Per-round "randomised" flag (S4) | The multiplier is per game. |

## Done when

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm test -- tools/invariants` are green.
- [ ] The new tests use a seeded `createRng` and the fake adapter, never a real timer. They cover the window boundaries (both sides of the 10% and 18 s edges), the fallback, determinism of one seed, Classic unchanged for a fixed seed, 3 free then paid, the 50% floor, an unchanged step and locks, the 8 s spacing, the store's cue arguments, S6, S7 and the mash guard.
- [ ] No browser gate (no surface). The first run of a non-zero start with the real adapter belongs to the visual half's live check.
- [ ] **Prerequisite (ROADMAP):** item 7 starts only after the M1 items it names (4, 5b, 6) are merged and green.
