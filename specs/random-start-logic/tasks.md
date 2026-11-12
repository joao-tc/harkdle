# Random start + rerolls (logic) — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Draft

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 0 | — (orchestrator) | Only once the M1 items in the ROADMAP are merged. Create `feat/7a/random-start-logic` from `main`. Commit this spec folder and the ROADMAP split (7 → 7a / 7b). No ADR to land first. | `docs: add random-start-logic spec, design and tasks` |
| 1 | T1, T2, T3 | parallel — 3 subagents | one per task |
| 2 | T4 | sequential — the round state | `feat(game): give a round a start point` |
| 3 | T5 | sequential — the game reducer | `feat(game): pick and reroll start points` |
| 4 | T6 | sequential — the store | `feat(store): cue the round's start and add reroll` |
| 5 | T7 (orchestrator) | docs and the final gate | `docs: mark random-start-logic implemented` |

The chain after wave 1 is real, not a queue by habit: each layer consumes the one before (`start.ts` → round → game → store). Wave 1 holds everything that does not depend on another task.

Every `Verify` is `npm test -- <path>` plus `npx biome check <own files>`. Subagents never run `npm run dev`, `npm run build` or the full suite, and never edit `package.json`, `biome.json`, `main.tsx`, `App.tsx` or any file they do not own. After each wave the orchestrator runs `npm run lint` → `npm run typecheck` → `npm test` → `npm test -- tools/invariants`, plus `npm run build` after wave 4.

Every brief carries: the task block, the design's signatures for its files (pasted, not linked), the spec rows it serves, the invariants (1–5), [coding-principles](../../.claude/skills/feature-dev/references/coding-principles.md), and the rule that tests use `createRng`, `createFakeAdapter` and a manual `sleep`, never `Math.random`, a real timer or a network.

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | Four config keys + `start.ts` (window, draw, canReroll, drawReroll) + tests | ⚠️ Cohesive (one rule, "where a clip may start"; the keys have no other reader) |
| T2 | Two types, `PlaylistTrack` extends one | ✅ Atomic (type-only) |
| T3 | `shortcutFor` maps ⌥R + test | ✅ Atomic |
| T4 | `RoundState` start fields, `startRound(track, start)` + test | ✅ Atomic |
| T5 | Game reducer: `startMode`, `rng`, `rerollsUsed`, the draws, `reroll`, scoring modifiers, `rerollStatus` + tests | ⚠️ Cohesive (one reducer; every piece reads the same new fields) |
| T6 | Store: `startMode`, cue at `startMs`, `reroll`, notice + test | ⚠️ Cohesive (one closure state machine; same shape as the 5a store tasks) |
| T7 | Docs and gate | ✅ Atomic |

### B — Dependencies

| Task | Depends on | Wave | Satisfied in an earlier wave? |
| ---- | ---------- | ---- | ----------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T4 | T1 | 2 | ✅ (`RoundStart`, `CLASSIC_START`) |
| T5 | T1, T2, T4 | 3 | ✅ |
| T6 | T5 | 4 | ✅ (T3 is not needed: the key handler is the visual half's) |
| T7 | T1–T6 | 5 | ✅ |

### C — File ownership

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | game | `src/game/config.ts`, `src/game/config.test.ts`, `src/game/start.ts`, `src/game/start.test.ts` | — |
| 1 | T2 | game / spotify | `src/game/types.ts`, `src/spotify/clean.ts` | — |
| 1 | T3 | store | `src/store/shortcuts.ts`, `src/store/shortcuts.test.ts` | — |
| 2 | T4 | game | `src/game/round.ts`, `src/game/round.test.ts` | — |
| 3 | T5 | game | `src/game/game.ts`, `src/game/game.test.ts`, `src/game/replay.test.ts`, `src/ui/game/feedback.test.ts` (fixture: `durationMs` on the tracks it passes to `createGame`) | — |
| 4 | T6 | store | `src/store/game.ts`, `src/store/game.reroll.test.ts` | — |
| 5 | T7 | docs | `specs/app-v1/ROADMAP.md`, `game-design.md`, `specs/random-start-logic/*` | — |

## Tasks

### T1 — Start-point rules and their config

**Wave:** 1 · **Layer:** game · **Requirement:** RS-1, RS-2, RS-3, RS-4
**Depends on:** —
**Owns:** `src/game/config.ts`, `src/game/config.test.ts`, `src/game/start.ts`, `src/game/start.test.ts`
**Reads:** `src/game/rng.ts`, `src/game/scoring.ts` (style), design.md §Contracts

**Do:** Add `startMinRatio` 0.1, `startTailMs` 18000, `freeRerolls` 3 and `rerollMinDistanceMs` 8000 to `GameConfig` and `DEFAULT_CONFIG`, and write `start.ts` exactly as in the design (`startWindow`, `drawStart`, `canReroll`, `drawReroll`, `CLASSIC_START`).

**Invariants:** 1, 2: imports only `config` and `rng`; every draw takes the injected `Rng`.

**Done when:**
- [ ] `startWindow` is null at 19 999 ms, a single point at 20 000 ms, and `[⌈0.1·len⌉, len − 18000]` above
- [ ] `drawStart` always lands inside the window, is repeatable for a seed, and returns `CLASSIC_START` for a null window without calling the rng
- [ ] `canReroll` and `drawReroll` honour the 8 s spacing on both sides, including a start exactly at the window edge and a window just under and just over 8 s wide
- [ ] Tests written and passing; invariant check clean

**Verify:** `npm test -- src/game/start src/game/config` and `npx biome check src/game/config.ts src/game/config.test.ts src/game/start.ts src/game/start.test.ts`

### T2 — `TimedTrack` and `StartMode`

**Wave:** 1 · **Layer:** game (+ the one `PlaylistTrack` line) · **Requirement:** RS-1 (S12)
**Depends on:** —
**Owns:** `src/game/types.ts`, `src/spotify/clean.ts`
**Reads:** design.md §D1

**Do:** Add `TimedTrack` and `StartMode` to `types.ts`, and make `PlaylistTrack` extend `TimedTrack` instead of `Track`, dropping its own `durationMs` line.

**Invariants:** 3: `spotify` may import `game`.

**Done when:**
- [ ] `PlaylistTrack` is unchanged for every consumer
- [ ] No other file needed an edit

**Verify:** `npm run typecheck && npm test -- src/spotify/clean`

### T3 — ⌥R shortcut mapping

**Wave:** 1 · **Layer:** store · **Requirement:** RS-11
**Depends on:** —
**Owns:** `src/store/shortcuts.ts`, `src/store/shortcuts.test.ts`
**Reads:** `src/store/shortcuts.ts`

**Do:** Add `"reroll"` to `ShortcutAction` and map `KeyR` in `ACTIONS`; flip the existing ⌥R "not mapped" test to expect `reroll`, and keep the repeat / extra-modifier cases for it.

**Invariants:** 3: no React.

**Done when:**
- [ ] ⌥R returns `reroll`; ⌘/Ctrl/Shift+⌥R and a repeat return `null`
- [ ] The existing Space and S cases still pass

**Verify:** `npm test -- src/store/shortcuts` and `npx biome check src/store/shortcuts.ts src/store/shortcuts.test.ts`

### T4 — A round knows its start

**Wave:** 2 · **Layer:** game · **Requirement:** RS-1, RS-5
**Depends on:** T1
**Owns:** `src/game/round.ts`, `src/game/round.test.ts`
**Reads:** `src/game/start.ts`, design.md §`round.ts`

**Do:** Add `startMs`, `window` and `paidRerolls` to `RoundState`, and give `startRound` a second parameter `start: RoundStart = CLASSIC_START`.

**Invariants:** 1, 2.

**Done when:**
- [ ] `startRound(track)` gives `startMs: 0`, `window: null`, `paidRerolls: 0`
- [ ] `startRound(track, start)` keeps `start`
- [ ] Submit, skip and give-up leave all three fields untouched
- [ ] All existing round tests pass unchanged

**Verify:** `npm test -- src/game/round` and `npx biome check src/game/round.ts src/game/round.test.ts`

### T5 — The game picks and rerolls start points

**Wave:** 3 · **Layer:** game · **Requirement:** RS-1, RS-2, RS-3, RS-4, RS-5, RS-12
**Depends on:** T1, T2, T4
**Owns:** `src/game/game.ts`, `src/game/game.test.ts`, `src/game/replay.test.ts`, `src/ui/game/feedback.test.ts`
**Reads:** `src/game/start.ts`, `src/game/round.ts`, `src/game/scoring.ts`, design.md §`game.ts`

**Do:** Implement the `game.ts` section of the design: `TimedTrack` queue, `startMode` / `rerollsUsed` / `rng` in `GameBase` and `rebase`, the draws in `createGame` and `playTrackAt`, the `reroll` action, the scoring modifiers in `playRound`, and `rerollStatus`. Add `durationMs` to the tracks the three test files pass to `createGame`.

**Invariants:** 1, 2: the only randomness is the injected `rng`; Classic draws nothing after the shuffle.

**Done when:**
- [ ] A Classic game with a fixed seed gives the same queue and totals as before this change
- [ ] A Random game's round starts are inside their windows, a short track starts at 0 with no reroll, and its score still gets ×1.25 (S4)
- [ ] Rerolls 1–3 are free; the 4th and later add to that round's `paidRerolls`; the multiplier floors at 0.5; the budget carries across rounds and resets in a new game
- [ ] A reroll keeps the step and locks, and returns the same state when it cannot apply (Classic, no spot, ended, reveal, finished)
- [ ] `trackFailed` draws a fresh start and spends nothing
- [ ] `rerollStatus` matches each of those states

**Verify:** `npm test -- src/game src/ui/game/feedback` and `npx biome check` on the four owned files

### T6 — The store cues the start and rerolls

**Wave:** 4 · **Layer:** store · **Requirement:** RS-6, RS-7, RS-8, RS-9, RS-10
**Depends on:** T5
**Owns:** `src/store/game.ts`, `src/store/game.reroll.test.ts`
**Reads:** `src/store/gameHarness.ts`, `src/spotify/playback/fakeAdapter.ts`, `src/store/game.round.test.ts` (style), design.md §`store/game.ts`

**Do:** Implement the `store/game.ts` section of the design: `startMode` and `setStartMode`, `createGame` gets `startMode`, `cueCurrent` cues `round.startMs`, and `reroll()` / `rerollNotice` / `dismissRerollNotice()` with the commit-then-cue flow and the restore on `cue-failed`.

**Invariants:** 3, 5: no React, no SDK types; talks to `PlaybackAdapter` only.

**Done when:**
- [ ] Round 1, each next round and each replacement cue with the drawn `startMs`; Classic still cues 0
- [ ] A reroll cues the new start, keeps the step, and stops a playing clip
- [ ] S6: a `cue-failed` restores the game and re-cues the old start with the notice; a second `cue-failed` skips the track with the existing notice; the free budget is untouched
- [ ] S7: an interruption mid-cue keeps the reroll and freezes the round
- [ ] A second `reroll()` before the adapter settles is ignored; ignored too in Classic, on the Reveal, while frozen, and after `leave`
- [ ] `playAgain` keeps `startMode` and resets the budget
- [ ] Every existing store test passes unchanged

**Verify:** `npm test -- src/store` and `npx biome check src/store/game.ts src/store/game.reroll.test.ts`

### T7 — Docs and the final gate (orchestrator)

**Wave:** 5 · **Layer:** docs · **Requirement:** all
**Depends on:** T1–T6
**Owns:** `specs/app-v1/ROADMAP.md`, `game-design.md`, `specs/random-start-logic/*`

**Do:** In game-design.md add the 8 s spacing (Rerolling section and the Tunable Parameters table), the failed-reroll behaviour, and "×1.25 applies to every round of a Random game, including a 0:00 fallback round". Mark the spec, design and tasks Done, add a Result section for any deviation, and point ROADMAP 7a at this folder.

**Done when:**
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm test -- tools/invariants` and `npm run build` are green

**Verify:** the gate commands above.
