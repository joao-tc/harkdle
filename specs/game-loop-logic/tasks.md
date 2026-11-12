# Game loop (logic) — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Done

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 0 | — (orchestrator) | Create `feat/5a/game-loop-logic` from `main`. Commit this spec folder and the ROADMAP split. No ADR to land first. | `docs: add game-loop-logic spec, design and tasks` |
| 1 | T1, T2, T3, T5 | parallel — 4 subagents | one per task |
| 2 | T6 | sequential — the store's start and round actions | `feat(store): add the game store start and round actions` |
| 3 | T7, T8, T9 | parallel — 3 subagents (T7 finishes the store: reveal, countdown, results, recovery) | one per task |
| 4 | T10 (orchestrator) | docs and the final gate | `docs: mark game-loop-logic implemented` |

Every `Verify` is `npm test -- <path>` plus `npx biome check <own files>`. Subagents never run `npm run dev`, `npm run build` or the full suite, and never edit `package.json`, `biome.json`, `main.tsx`, `App.tsx` or any file they do not own. After each wave the orchestrator runs `npm run lint` → `npm run typecheck` → `npm test` → `npm test -- tools/invariants`, plus `npm run build` after waves 2 and 3.

Every brief carries: the task block, the design's signatures for its files (pasted, not linked), the spec rows it serves, the invariants (1–5), [coding-principles](../../.claude/skills/feature-dev/references/coding-principles.md), and the rule that tests use `createFakeAdapter`, a manual `sleep` and a seeded `createRng`, never a real timer or network.

## Result

T1–T10 are done. As built, against the plan:

- T7 also edited `gameHarness.ts` (an optional `seeds` option, so `playAgain` can prove a different queue order). Table C is updated.
- A cue pending when the device is taken over rejects `superseded` with the store's epoch unchanged (the engine bumps its generation on every interruption). The store treats that as a frozen round, not a stale one, so neither `start` nor the countdown can hang. A `leave` still stops all work.
- In the countdown the display is 3, then 2 after tick one, then 1 after tick two; the third tick only releases it, so three `tick()` calls open the round. If every remaining track fails to cue, the store still waits for the three ticks before it enters `finished`.
- `createFakeAdapter.failNextCue(device-lost)` leaves its status `idle`, not `interrupted` as the real engine does, so the countdown `device-lost` test asserts the stage and the kept track, and the `interrupted` view is asserted by the interrupt-during-held-cue tests.

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | `presets.ts` (constant, `presetOptions`, `pickRounds`) + test | ✅ Atomic |
| T2 | Four additions to the fake adapter + test | ⚠️ Cohesive (one file, one purpose: reach the engine's behaviours) |
| T3 | `shortcutFor` + test | ✅ Atomic |
| T5 | `session.playerFailed` + test | ✅ Atomic |
| T6 | Game store, first half: state, status listener, `start`/`begin`/`cueCurrent`, `play`, `submit`/`skip`/`giveUp` with the settling gate, `leave`, volume, X, plus the test harness | ⚠️ Cohesive (one closure state machine; the part that ends at the Reveal) |
| T7 | Game store, second half: `next`, countdown, results, `playAgain`, `recover`, `dismissNotice` | ⚠️ Cohesive (continues T6's closure; cannot be a separate file without exporting its internals) |
| T8 | `connectGameToSession` + test | ✅ Atomic |
| T9 | `leaveGuard.ts` + test | ✅ Atomic |

### B — Dependencies

| Task | Depends on | Wave | Satisfied in an earlier wave? |
| ---- | ---------- | ---- | ----------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T5 | — | 1 | ✅ |
| T6 | T1, T2 | 2 | ✅ (T5 is not needed: `onStartFailed` is injected) |
| T7 | T6 | 3 | ✅ |
| T8 | T6, T5 | 3 | ✅ |
| T9 | T6 | 3 | ✅ |
| T10 | T1–T9 | 4 | ✅ |

### C — File ownership

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | game | `src/game/presets.ts`, `src/game/presets.test.ts` | — |
| 1 | T2 | spotify (test support) | `src/spotify/playback/fakeAdapter.ts`, `src/spotify/playback/fakeAdapter.test.ts` | — |
| 1 | T3 | store | `src/store/shortcuts.ts`, `src/store/shortcuts.test.ts` | — |
| 1 | T5 | store | `src/store/session.ts`, `src/store/session.test.ts` | — |
| 2 | T6 | store | `src/store/game.ts`, `src/store/gameHarness.ts`, `src/store/game.round.test.ts` | — |
| 3 | T7 | store | `src/store/game.ts`, `src/store/game.flow.test.ts`, `src/store/gameHarness.ts` (optional `seeds`, backward-compatible) | — (T6 is in wave 2) |
| 3 | T8 | store | `src/store/wiring.ts`, `src/store/wiring.test.ts` | — |
| 3 | T9 | store | `src/store/leaveGuard.ts`, `src/store/leaveGuard.test.ts` | — |
| 4 | T10 | docs | `specs/game-loop-logic/*`, `specs/app-v1/ROADMAP.md` | — |

## Tasks

### T1 — Round presets (A13)

**Wave:** 1 · **Layer:** game · **Requirement:** G-13 · **Depends on:** — · **Owns:** `src/game/presets.ts`, `src/game/presets.test.ts` · **Reads:** design §`game/presets.ts`, `src/game/config.ts` (style)

**Do:** `ROUND_PRESETS = [5, 10, 20]`, `DEFAULT_ROUNDS = 10`, `presetOptions(usable)` and `pickRounds(chosen, usable)`.

**Invariants:** 1, 2 (pure; no ambient). Imports nothing outside `src/game`.

**Done when:**
- [ ] `presetOptions(10)` → 5 and 10 enabled, 20 disabled; `presetOptions(25)` → all enabled; `presetOptions(4)` → all disabled.
- [ ] `pickRounds(20, 12)` → 10; `pickRounds(5, 40)` → 5; `pickRounds(7, 40)` → 20 (a non-preset is not enabled, so the largest enabled wins); `pickRounds(10, 4)` throws `RangeError`.
- [ ] Tests written and passing; invariant check clean.

**Verify:** `npm test -- src/game/presets` and `npx biome check src/game/presets.ts src/game/presets.test.ts`

### T2 — Make the fake adapter match the engine where the store needs it

**Wave:** 1 · **Layer:** spotify (test support) · **Requirement:** G-2, G-6, G-9 (test support) · **Depends on:** — · **Owns:** `src/spotify/playback/fakeAdapter.ts`, `src/spotify/playback/fakeAdapter.test.ts` · **Reads:** design §`fakeAdapter.ts` additions and §Reuse gaps, `src/spotify/playback/engine.ts` (the pending-slot behaviour), `specs/playback-adapter/design.md` §Status machine

**Do:** Add `failNextConnect`, `failNextRecover`, `holdCues`/`releaseCue`, and make `reveal()` and `playClip()` called while `cueing` wait for `ready`; keep every existing test unchanged and green.

**Invariants:** 5 (no SDK types). Test-support only: no app file imports it except tests.

**Done when:**
- [ ] `failNextConnect(e)`: next `connect` rejects `e`, status ends `disconnected`; the one after works.
- [ ] `failNextRecover(e)`: next `recover` rejects, status stays `interrupted`.
- [ ] After `holdCues()`, `cue()` stays `cueing` until `releaseCue()`; two held cues release oldest first; a newer cue still supersedes an older one (`superseded`).
- [ ] `reveal()` during `cueing` resolves after `ready` and the status becomes `revealing`; `playClip()` during `cueing` already works and still does.
- [ ] Tests written and passing; existing fake tests untouched.

**Verify:** `npm test -- src/spotify/playback/fakeAdapter` and `npx biome check <own files>`

### T3 — Keyboard shortcut mapping (R17)

**Wave:** 1 · **Layer:** store · **Requirement:** G-12 · **Depends on:** — · **Owns:** `src/store/shortcuts.ts`, `src/store/shortcuts.test.ts` · **Reads:** design §`store/shortcuts.ts`

**Do:** `shortcutFor(event: KeyInput): "play" | "skip" | null`, matching on `code`, Alt only, ignoring repeats.

**Invariants:** 3 (no React, no DOM types: the input is a plain object).

**Done when:**
- [ ] `{code:"Space", altKey:true}` → `play`; `{code:"KeyS", altKey:true}` → `skip`.
- [ ] `KeyR` with Alt → `null` (G18). Without Alt → `null`. With Alt plus Ctrl, Meta or Shift → `null`. `repeat: true` → `null`.
- [ ] The macOS case is a test: `code: "KeyS"` with `key: "ß"` still maps (the input has no `key`).
- [ ] Tests written and passing.

**Verify:** `npm test -- src/store/shortcuts` and `npx biome check <own files>`

### T5 — Show a player failure as a Setup error

**Wave:** 1 · **Layer:** store · **Requirement:** G-2, G13 · **Depends on:** — · **Owns:** `src/store/session.ts`, `src/store/session.test.ts` · **Reads:** design §`store/session.ts` addition, `src/spotify/playback/adapter.ts` (`PlaybackErrorKind`)

**Do:** Add `playerFailed({ kind, message })` to `SessionState`: `account` → `sdk-account`, `authentication` → the `expire()` outcome, all other kinds → `sdk-init`, with `detail: message` on the first and last.

**Invariants:** 3 (type import from `spotify` is allowed here), 4 n/a (nothing persisted).

**Done when:**
- [ ] One test per mapped kind, asserting the resulting `Screen`.
- [ ] Retry from `sdk-account` / `sdk-init` goes back through `check()` (already how `retry` works); a test proves it lands on `signed-in`.
- [ ] Existing session tests unchanged and green.

**Verify:** `npm test -- src/store/session` and `npx biome check <own files>`

### T6 — The game store: start, round actions, leave

**Wave:** 2 · **Layer:** store · **Requirement:** G-1, G-2, G-3, G-4, G-5, G-8 (first track), G-15, G-16 · **Depends on:** T1, T2 · **Owns:** `src/store/game.ts`, `src/store/gameHarness.ts`, `src/store/game.round.test.ts` · **Reads:** design §`store/game.ts`, §Internals, §Round flow, §Error handling; `src/game/game.ts`, `src/game/round.ts`; `src/spotify/playback/fakeAdapter.ts`; `src/store/session.ts` and `session.test.ts` (style)

**Do:** Write `createGameStore` with the state, the status listener, `setRounds`, `setVolume`, `start` (`begin`, `cueCurrent`), `play`, `submit`, `skip`, `giveUp` (with the `settling` gate), `leave` and the epoch guard; the interface omits `next`, `playAgain`, `recover`, `dismissNotice` and `countdown` handling (T7 adds them). `gameHarness.ts` builds a store with a fake adapter, a manual `sleep` (`tick()` resolves the oldest pending sleep), a seeded `newRng` and fifteen `PlaylistTrack` fixtures (some with `album.kind` `single`), shared with T7.

**Invariants:** 1–3, 5. No `setTimeout`, `Date.now`, `Math.random`, React or `Spotify` use.

**Done when:**
- [ ] `start`: stage `connecting` → `round`; `connect` called once with the volume; the first `cue` is `{ uri, startMs: 0 }` of `queue[0]`; X went through `pickRounds`.
- [ ] `start` with a rejecting `connect` (`failNextConnect`): stage `idle`, `game` null, `onStartFailed` called once with the error.
- [ ] `cue-failed` on the first track: `trackFailed` dispatched, the next track cued, no result added, stage still `connecting` meanwhile (`skippedNotice` is set; T7 clears it).
- [ ] `play` calls `playClip(config.clipMs[step])` for each step (1000 … 16000), once, and ignores a second call while playing.
- [ ] A wrong `submit` mid-clip: step +1, `adapter.stop` called; a title-only correct `submit` locks and, with the album and artist missing, continues; a completing `submit` goes to `reveal`, sets `revealed`, calls `adapter.reveal`.
- [ ] `skip` six times (letting playback settle) ends the round `out-of-steps` and reveals; `giveUp` mid-clip reveals without calling `stop`.
- [ ] Blank submit: same state object, no adapter call.
- [ ] Settling (G12): two `skip()` calls in the same tick advance one step; a third after the adapter is `ready` advances again.
- [ ] `hideTab()` mid-clip: step and locks unchanged, `play` works again (G-5).
- [ ] `interrupt("taken-over")` mid-round: `playback` is `interrupted` and `play`/`submit`/`skip`/`giveUp` change nothing (G-9, the freeze half).
- [ ] `leave` during a held cue and during `start`: nothing changes afterwards, `adapter.disconnect` called once, stage `idle`, X and volume kept.
- [ ] `setVolume(1.5)` → 1, `setVolume(-1)` → 0, forwarded to `adapter.setVolume` only when connected. `start` outside `idle` returns the same state object.
- [ ] Tests written and passing; invariant check clean.

**Verify:** `npm test -- src/store/game.round` and `npx biome check <own files>`

### T7 — The game store: reveal, countdown, results, recovery

**Wave:** 3 · **Layer:** store · **Requirement:** G-6, G-7, G-8, G-9, G-10, G-14 · **Depends on:** T6 · **Owns:** `src/store/game.ts`, `src/store/game.flow.test.ts` · **Reads:** design §`store/game.ts`, §Internals, §Error handling; `src/store/gameHarness.ts`; `src/store/game.round.test.ts` (to see the style, not to edit)

**Do:** Add `next` (with `COUNTDOWN_FROM`, `COUNTDOWN_TICK_MS`), `playAgain`, `recover` with the `recovery` field, and `dismissNotice` to the existing store, extending `cueCurrent` for later tracks.

**Invariants:** 1–3, 5.

**Done when:**
- [ ] `next` from a `reveal` with rounds left: stage `countdown` 3 → 2 → 1 as `tick()` runs; the round opens only after the cue **and** the three ticks; with `holdCues()` it stays at 1 until `releaseCue()`; `skippedNotice` is cleared when the next round begins.
- [ ] `cue-failed` on a later track: `trackFailed`, `skippedNotice` true, the replacement cued; all remaining tracks failing → stage `finished` early with `results.length` below X (and a game where every track fails ends with 0).
- [ ] `device-lost` on a countdown cue → stage `round` with `playback` `interrupted`; the track was not skipped.
- [ ] `next` after the last round → stage `finished`, `adapter.stop` called, `summarize` readable.
- [ ] `recover` → `recovery` `working` → adapter `ready`, and round actions work again; with `failNextRecover`, `recovery` is `failed` and the round is still frozen. An interruption during `reveal` does not block `next`.
- [ ] `playAgain`: a new `GameState` with a different `queue` order (different seed), same X and tracks, stage `connecting` → `round`; `leave` mid-countdown changes nothing afterwards.
- [ ] `next` outside `reveal` and `playAgain` outside `finished` return the same state object.
- [ ] One whole 5-round game played through the public actions ends with the `summarize` numbers expected from the scripted guesses.
- [ ] Tests written and passing; the T6 tests still pass; invariant check clean.

**Verify:** `npm test -- src/store/game` and `npx biome check <own files>`

### T8 — Reset the game when the session leaves Setup

**Wave:** 3 · **Layer:** store · **Requirement:** G-15 · **Depends on:** T5, T6 · **Owns:** `src/store/wiring.ts`, `src/store/wiring.test.ts` · **Reads:** design §`store/wiring.ts` addition, `src/store/game.ts`

**Do:** Add `connectGameToSession(session, game)`: when the session screen changes from `setup` to anything else, call `game.getState().leave()`; return the unsubscribe.

**Invariants:** 3.

**Done when:**
- [ ] Logout, `expire()` and `toPicker()` from `setup` each call `leave` once; a move into `setup` does not; other transitions do not.
- [ ] The returned function unsubscribes.
- [ ] Existing wiring tests unchanged and green.

**Verify:** `npm test -- src/store/wiring` and `npx biome check <own files>`

### T9 — The leave-page guard (R15)

**Wave:** 3 · **Layer:** store · **Requirement:** G-11 · **Depends on:** T6 · **Owns:** `src/store/leaveGuard.ts`, `src/store/leaveGuard.test.ts` · **Reads:** design §`store/leaveGuard.ts`, `src/store/game.ts` (the `Stage` type)

**Do:** `IN_PROGRESS`, `isInProgress(stage)` and `connectLeaveGuard(game, target)` which registers one `beforeunload` listener that reads the stage at event time.

**Invariants:** 3 (the target is passed in; no `window`).

**Done when:**
- [ ] With a fake target: stage `round` → the event gets `preventDefault()` and `returnValue = ""`; `idle` and `finished` → untouched.
- [ ] The stage change after registration is honoured (the listener reads live state).
- [ ] `connecting`, `countdown`, `round` and `reveal` all count as in progress.
- [ ] The unsubscribe removes the same listener.

**Verify:** `npm test -- src/store/leaveGuard` and `npx biome check <own files>`

### T10 — Close out (orchestrator)

**Wave:** 4 · **Layer:** docs · **Depends on:** T1–T9 · **Owns:** `specs/game-loop-logic/spec.md`, `specs/game-loop-logic/tasks.md`, `specs/app-v1/ROADMAP.md`

**Do:** Mark this folder Done, set ROADMAP row 5a to "Done: [specs/game-loop-logic]", and run the full gate.

**Done when:**
- [ ] `npm run lint && npm run typecheck && npm test && npm test -- tools/invariants && npm run build` is green.
- [ ] `git diff main --stat` shows no change to `src/main.tsx`, `src/App.tsx`, `src/ui/**`, `package.json` or `biome.json`.

**Verify:** the command above.
