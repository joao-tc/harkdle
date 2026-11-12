# Random start + rerolls (logic) — design

**Spec:** [spec.md](spec.md) · **Status:** Draft
**ADR:** none. Nothing here is expensive to reverse; D2 and D3 are recorded below so the next reader knows why.

## Decisions

| #  | Decision | Why | Rejected |
| -- | -------- | --- | -------- |
| D1 | `game/` reads the length through a new `TimedTrack` (`Track` + `durationMs`). `GameState.queue` and `createGame`'s `tracks` become `TimedTrack`; `PlaylistTrack` extends it. `Track` and `startRound(track)` callers keep working. | The start window depends on the length, and `PlaylistTrack` already carries it. Making `durationMs` required on `Track` would touch every round/match/normalize fixture. | `durationMs` on `Track`; a separate id → length map passed around. |
| D2 | `GameState` keeps the injected `rng`. The reducer draws start points from it for round 1, for every `next` / `trackFailed` replacement, and for `reroll`. Classic never draws after the shuffle. | Keeps `store/game.ts` free of start logic: the store only reads `round.startMs`. The draws stay deterministic for a seed and an action list (the existing replay tests still apply). The reducer is "pure given the RNG", which is what invariant 2 asks for. | Actions that carry `startMs` (the store would have to look up the next track's length, and the first round needs a special path); RNG state as a plain number in the state (rewrites `createRng` and `newRng`). |
| D3 | A reroll **commits first, then cues**. The store keeps the pre-reroll `GameState` and restores it if the cue fails with `cue-failed` (S6). | The adapter sets its target as soon as `cue()` is called. If a takeover cuts the cue, `recover()` re-cues that target, so the game must already hold the same start (S7). The cue-then-commit order would leave them different. Restoring an immutable snapshot is safe because the settling gate admits no other action meanwhile. | Cue first, then dispatch; an undo action in the reducer. |
| D4 | `reroll` is a `GameAction`, not a `RoundAction`. | It needs the game-wide free budget, the RNG and `startMode`. `roundReducer` stays free of all three. | — |

## Contracts

### `src/game/config.ts` — four new keys

```ts
readonly startMinRatio: number;       // 0.1  of the length: the earliest start
readonly startTailMs: number;         // 18000: 16 s longest clip + 2 s margin kept after the start
readonly freeRerolls: number;         // 3 per game
readonly rerollMinDistanceMs: number; // 8000: a reroll lands at least this far from the current start
```

### `src/game/types.ts`

```ts
export interface TimedTrack extends Track { readonly durationMs: number }
export type StartMode = "classic" | "random";
```

### `src/game/start.ts` (new, pure)

```ts
export interface StartWindow { readonly minMs: number; readonly maxMs: number }  // inclusive, integer ms
export interface RoundStart { readonly startMs: number; readonly window: StartWindow | null }
export const CLASSIC_START: RoundStart;                  // { startMs: 0, window: null }

/** [⌈ratio·length⌉, length − tail], or null when that is empty (A12). */
export function startWindow(durationMs: number, config: GameConfig): StartWindow | null;
/** Uniform over the window; the fallback { 0, null } when the window is null. One rng() draw. */
export function drawStart(durationMs: number, rng: Rng, config: GameConfig): RoundStart;
/** True when some point of the window is ≥ rerollMinDistanceMs from startMs. */
export function canReroll(start: RoundStart, config: GameConfig): boolean;
/** Uniform over the window minus (startMs − d, startMs + d); null when nothing is left. One rng() draw. */
export function drawReroll(start: RoundStart, rng: Rng, config: GameConfig): RoundStart | null;
```

Counting works on integers: with `d` the spacing, the low part has `max(0, cur − d − min + 1)` points and the high part `max(0, max − (cur + d) + 1)`. One draw `r = floor(rng() · total)` picks into the low part first, then the high part.

### `src/game/round.ts`

`RoundState` gains `startMs: number`, `window: StartWindow | null`, `paidRerolls: number`. `startRound(track, start = CLASSIC_START)` fills them (`paidRerolls: 0`). `roundReducer` and `RoundAction` do not change.

### `src/game/game.ts`

- `GameBase` gains `startMode: StartMode`, `rerollsUsed: number`, `rng: Rng`. `rebase` copies them. `createGame` takes `startMode?` (default `"classic"`) and keeps its `rng`; after the shuffle it draws round 1's start (Random only).
- `playTrackAt` draws the start for the track at the cursor (Random only). That covers `next` and `trackFailed`.
- `GameAction` gains `{ type: "reroll" }`. In phase `round` with `canReroll(round, config)`: draw with `drawReroll`, then `rerollsUsed + 1`, and `paidRerolls + 1` on the round when `rerollsUsed >= config.freeRerolls` before the increment. Anything else returns the same state.
- `playRound` scores with `{ randomStart: startMode === "random", paidRerolls: round.paidRerolls }`.
- `rerollStatus(state): { available: boolean; freeLeft: number; nextIsPaid: boolean }`. `available` is false outside phase `round`, in Classic, and when `canReroll` is false.

### `src/store/shortcuts.ts`

`ShortcutAction` gains `"reroll"` for `KeyR`. The ⌥R case in `shortcuts.test.ts` flips from `null` to `reroll`. The key handler hook is `ui/` and belongs to the visual half.

### `src/store/game.ts`

State: `startMode: StartMode` (default `"classic"`), `rerollNotice: boolean`. Actions: `setStartMode(mode)`, `reroll()`, `dismissRerollNotice()`.

- `begin` passes `startMode` to `createGame`.
- `cueCurrent` cues `{ uri, startMs: game.round.startMs }`.
- `reroll()`:
  1. Return unless stage is `round`, the phase is `round`, the gate is `open` and the playback is `ready` or `playing` (the guard `act` uses).
  2. `next = gameReducer(game, { type: "reroll" })`. Return if `next === game`.
  3. `gate = "acting"`, `set({ game: next })`, then `adapter.cue({ uri, startMs: next.round.startMs })` (the engine stops a playing clip itself, and the cue is muted, ADR-0003). `followUp` opens the gate once the adapter settles, like Submit and Skip.
  4. On `cue-failed` (and only if the epoch is unchanged): `set({ game: before, rerollNotice: true })`, then run `cueCurrent` again for the old start. Its loop already skips a track that fails a second time, and returns `finished` if the queue runs out.
  5. On any other error: do nothing more. The listener shows the interruption and the reroll stands (S7).
- `leave()` clears `rerollNotice`. `setStartMode` is ignored outside stage `idle`, like `start`.

## Tests

- `start.test.ts`: window edges (19 999 ms → null; 20 000 → one point; 18 000 → null), the 10% rounding, `drawStart` stays inside, same seed same value, `canReroll` for a window narrower than 8 s, one exactly 8 s from a side, and a wide one; `drawReroll` never returns a point within 8 s and reaches both sides over many seeds.
- `round.test.ts`: the defaults, and that `roundReducer` leaves `startMs`, `window` and `paidRerolls` alone.
- `game.test.ts` / `replay.test.ts`: Classic with a fixed seed gives the same queue and totals as before; Random game starts are inside the window; 3 free then paid; the 50% floor after five paid; step and locks unchanged by a reroll; `rerollsUsed` carries across rounds; `trackFailed` redraws; ×1.25 on a fallback round (S4); `rerollStatus`.
- `store/game.reroll.test.ts` (fake adapter, manual `sleep`, seeded rng): round 1 cues the drawn start; a reroll cues the new one and keeps the step; `cue-failed` restores, re-cues the old start and sets the notice; a second `cue-failed` skips the track; an interruption mid-cue keeps the reroll and freezes; ⌥R mashed twice rerolls once; ignored in Classic, on the Reveal and while frozen; Play again resets the budget; `leave` mid-cue changes nothing.

## Invariants

1–3: `start.ts` imports only `config`, `rng` and `types`, and draws only from the injected `Rng`. 4: n/a, nothing is persisted. 5: untouched, the store keeps to the `PlaybackAdapter` interface.
