# Game loop (logic) — design

**Spec:** [spec.md](spec.md) · **ADRs:** none new (see D7). Builds on [ADR-0001](../../docs/adr/0001-stack-and-playback.md), [ADR-0002](../../docs/adr/0002-server-data-via-query-core-in-the-store.md), [ADR-0003](../../docs/adr/0003-cues-are-muted.md).

## Approach

One new vanilla Zustand store, `createGameStore`, in `src/store/game.ts`. It holds the engine's `GameState` and drives it: each action runs `gameReducer`, then tells the `PlaybackAdapter` what to do (`cue`, `playClip`, `stop`, `reveal`, `recover`). It subscribes to `adapter.onStatus` and republishes a small `playback` view. It adds the things that are not rules but are not rendering either: the 3-2-1 countdown, the cue-failure loop, the "settling" gate against double presses, and the freeze on interruption. Everything it needs from the outside (`adapter`, `sleep`, `newRng`, `onStartFailed`) is passed in, so tests use `createFakeAdapter` and a manual `sleep`. The session store stays the owner of "which screen": it gains one action to show a player failure as a Setup error, and a wiring function resets the game store when the session leaves `setup`. A game in progress is *the Setup screen's content changing* (`stage !== "idle"`), not a new `Screen` variant, so nothing else in `session.ts` changes.

```
 ui (visual half) ──reads/calls──► GameStore ──gameReducer──► game/ (item 1)
                                      │  ▲ onStatus
                                      ▼  │
                                 PlaybackAdapter (item 3, fake in tests)
 session ◄── onStartFailed ── GameStore            wiring: session leaves "setup" ─► game.leave()
```

## Layer placement

| New piece | Layer | Depends on | Logic/Visual | Keeps invariants? |
| --------- | ----- | ---------- | ------------ | ----------------- |
| `game/presets.ts` (`ROUND_PRESETS`, `presetOptions`, `pickRounds`) | game | nothing | logic | pure; no ambient ✅ (1, 2) |
| `store/game.ts` (`createGameStore`, state, actions) | store | `game/*`, `spotify/playback/adapter` types, `spotify/clean` type | logic | no React; time and RNG injected; SDK-free (3, 5) ✅ |
| `store/shortcuts.ts` (`shortcutFor`) | store | nothing | logic | pure; no DOM type (it takes a plain object) ✅ |
| `store/leaveGuard.ts` (`connectLeaveGuard`, `isInProgress`) | store | `store/game` types | logic | the event target is passed in ✅ |
| `store/session.ts` + `playerFailed` | store | `spotify/playback/adapter` types | logic | ✅ |
| `store/wiring.ts` + `connectGameToSession` | store | `store/game`, `store/session` | logic | ✅ |
| `spotify/playback/fakeAdapter.ts` (extended) | spotify (test support) | `adapter.ts` | logic | no SDK types (5) ✅ |

`ui/` gets nothing in this half. To keep invariant 3 (`ui` never imports `spotify`), `store/game.ts` re-exports the types the screens will need (`InterruptionReason`, `PlaylistTrack`), as `store/playlists.ts` does.

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| `createGame`, `gameReducer`, `summarize`, `GameState` | `src/game/game.ts` | The store never re-derives a rule. `trackFailed` and `next` are already actions. |
| `DEFAULT_CONFIG.clipMs` | `src/game/config.ts` | Clip length per step for `playClip`. |
| `Rng`, `createRng` | `src/game/rng.ts` | `newRng: () => Rng` is injected; the composition root seeds it (visual half). |
| `PlaybackAdapter`, `PlaybackStatus`, `PlaybackError` | `src/spotify/playback/adapter.ts` | The only playback surface the store sees. |
| `createFakeAdapter` | `src/spotify/playback/fakeAdapter.ts` | Store tests. Extended in T2 (gaps below). |
| `PlaylistTrack` (extends `Track`) | `src/spotify/clean.ts` | Passed to `createGame` as the tracks; the store keeps a `Map` by id for `uri`, `coverUrl`, `durationMs`. |
| `createStore` vanilla + `StoreApi`, deps object, `session.test.ts` harness style | `src/store/session.ts` | Same shape and test style. |
| `connectPlaylistsToSession` | `src/store/wiring.ts` | Mirrored by `connectGameToSession`. |

**Gaps in `createFakeAdapter` (T2)**, found by reading it against the engine's status machine (playback-adapter design §Status machine):

1. `reveal()` and `playClip()` while `cueing`: the engine holds them until `ready`. The fake's `reveal()` returns without revealing.
2. No way to make `connect` reject (G-2).
3. No way to make `recover` reject (G-9).
4. No way to keep a cue pending, so a test cannot prove "the countdown waits for a slow cue" (G-6).

## Types

### `game/presets.ts`

**Layer:** game · **Responsibility:** A13, the X presets and which are allowed for a playlist.

```ts
export const ROUND_PRESETS: readonly [5, 10, 20];
export const DEFAULT_ROUNDS: 10;

export interface PresetOption {
	readonly rounds: number;
	readonly enabled: boolean; // rounds <= usable
}
export function presetOptions(usable: number): readonly PresetOption[];
/** `chosen` if it is an enabled preset, else the largest enabled preset; throws RangeError if none is (usable < 5). */
export function pickRounds(chosen: number, usable: number): number;
```

### `store/game.ts`

**Layer:** store · **Responsibility:** run one game against the adapter and publish what a screen needs.

```ts
export type { InterruptionReason } from "@/spotify/playback/adapter";
export type { PlaylistTrack } from "@/spotify/clean";

export type Stage = "idle" | "connecting" | "countdown" | "round" | "reveal" | "finished";

/** The adapter status, reduced to what a screen can show. */
export type PlaybackView =
	| { readonly kind: "preparing" } // connecting, idle, cueing, or disconnected before Start
	| { readonly kind: "ready" } // paused at the start point
	| { readonly kind: "playing" } // a clip is running
	| { readonly kind: "revealing" }
	| { readonly kind: "interrupted"; readonly reason: InterruptionReason }; // incl. disconnected after Start (reason "device-lost")

export type Recovery = "idle" | "working" | "failed";

export interface GameStoreDeps {
	readonly adapter: PlaybackAdapter;
	readonly newRng: () => Rng; // one per game
	readonly sleep: (ms: number) => Promise<void>;
	readonly onStartFailed: (error: PlaybackError) => void; // connect rejected (G-2)
	readonly config?: GameConfig; // DEFAULT_CONFIG
}

export interface GameStoreState {
	readonly stage: Stage;
	readonly game: GameState | null; // non-null from Start until leave()
	readonly revealed: PlaylistTrack | null; // the just-finished round's track, only in stage "reveal" and "finished"
	readonly countdown: 3 | 2 | 1 | null; // only in stage "countdown"
	readonly playback: PlaybackView;
	readonly recovery: Recovery;
	readonly skippedNotice: boolean; // a track failed to cue and was replaced (G-8)
	readonly rounds: number; // chosen X, default DEFAULT_ROUNDS
	readonly volume: number; // 0–1, default 0.8

	setRounds(rounds: number): void;
	setVolume(volume: number): void; // G-16

	start(tracks: readonly PlaylistTrack[]): Promise<void>; // G-1, G-2; resolves when stage is "round" or start failed
	play(): void; // G-3
	submit(guess: Guess): void; // G-4
	skip(): void; // G-4
	giveUp(): void; // G-4
	next(): void; // G-6, G-7
	recover(): Promise<void>; // G-9
	dismissNotice(): void;
	playAgain(): Promise<void>; // G-14
	leave(): void; // G-15
}

export const COUNTDOWN_FROM: 3;
export const COUNTDOWN_TICK_MS: 1000;
export const DEFAULT_VOLUME: 0.8;

export function createGameStore(deps: GameStoreDeps): StoreApi<GameStoreState>;
```

Action preconditions (all violations are silent no-ops that keep the same state object):

| Action | Allowed when |
| ------ | ------------ |
| `start` | `stage === "idle"` |
| `play` | `stage === "round"` and `playback.kind === "ready"` |
| `submit`, `skip`, `giveUp` | `stage === "round"`, `playback.kind` is `ready` or `playing`, and not settling |
| `next` | `stage === "reveal"` |
| `recover` | `playback.kind === "interrupted"` and `recovery !== "working"` |
| `playAgain` | `stage === "finished"` |
| `leave` | always |

### Internals (not exported)

- `epoch`: bumped by `start`/`playAgain` begin and by `leave`. Every `await` continuation compares it and returns if stale, so a leave mid-cue or mid-countdown changes nothing afterwards.
- `settling`: set synchronously by `submit`/`skip`/`giveUp` when they pass the check, cleared when the follow-up (`stop()` or `reveal()`) has settled **and** the adapter is `ready`/`revealing`/`interrupted`. This is G12. A held key never reaches here because the shortcut mapper drops repeats.
- `tracksById`: `Map<string, PlaylistTrack>` built in `begin()`; used for `revealed` and for the cue target.
- `begin(tracks)` (shared by `start` and `playAgain`): `pickRounds` → `createGame` → stage `connecting` → `adapter.connect` → `cueCurrent` → stage `round`.
- `cueCurrent(epoch)`: loop: `adapter.cue({ uri, startMs: 0 })`; `cue-failed` → `gameReducer(trackFailed)`, set `skippedNotice`, continue (or stage `finished` if the game is `finished`); `device-lost` / `not-connected` → return `"frozen"`; `superseded` or a stale epoch → return `"stale"`; success → `"ready"`.
- The status listener maps `PlaybackStatus` → `PlaybackView`. `disconnected` maps to `interrupted/device-lost` unless the stage is `idle` or `connecting`.

### Round flow (G-4), the one place the audio rules meet the reducer

```
submit/skip/giveUp:
  guard (table above)               → return
  next = gameReducer(game, action)
  next === game                      → return           // blank submit, nothing changes
  settling = true
  next.phase === "round"  → set game; await adapter.stop()        // clip, if any, stops; re-cues
  next.phase === "reveal" → set game, stage "reveal", revealed;   // clip continues as the reveal
                            await adapter.reveal()
  settling = false (once the adapter is ready / revealing / interrupted)
```

### `store/shortcuts.ts`

```ts
export type ShortcutAction = "play" | "skip";
export interface KeyInput {
	readonly code: string; // KeyboardEvent.code
	readonly altKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
	readonly repeat: boolean;
}
export function shortcutFor(event: KeyInput): ShortcutAction | null;
```

`Space` / `KeyS` with Alt only, not repeating. Matching on `code` is what makes ⌥S work on macOS, where it types "ß".

### `store/leaveGuard.ts`

```ts
export const IN_PROGRESS: ReadonlySet<Stage>; // connecting, countdown, round, reveal
export function isInProgress(stage: Stage): boolean;

export interface UnloadTarget {
	addEventListener(type: "beforeunload", listener: (event: { preventDefault(): void; returnValue: unknown }) => void): void;
	removeEventListener(type: "beforeunload", listener: (event: { preventDefault(): void; returnValue: unknown }) => void): void;
}
/** Listens for beforeunload; while the game is in progress it calls preventDefault() and sets returnValue = "". Returns the unsubscribe. */
export function connectLeaveGuard(game: StoreApi<GameStoreState>, target: UnloadTarget): () => void;
```

### `store/session.ts` addition

```ts
// SessionState gains:
playerFailed(failure: { readonly kind: PlaybackErrorKind; readonly message: string }): void;
// account → { name: "setup-error", error: "sdk-account", detail: message }
// authentication → same as expire()
// anything else → { name: "setup-error", error: "sdk-init", detail: message }
```

### `store/wiring.ts` addition

```ts
/** When the session screen leaves "setup" (logout, expiry, Picker), calls game.leave(). Returns the unsubscribe. */
export function connectGameToSession(session: StoreApi<SessionState>, game: StoreApi<GameStoreState>): () => void;
```

### `fakeAdapter.ts` additions (T2)

```ts
export interface FakeAdapterControls {
	// existing members stay as they are, plus:
	failNextConnect(error: PlaybackError): void; // the next connect() leaves status disconnected and rejects
	failNextRecover(error: PlaybackError): void; // the next recover() leaves status interrupted and rejects
	holdCues(): void; // later cues stay "cueing" until releaseCue()
	releaseCue(): void; // lets the oldest held cue reach "ready"
}
// plus: reveal() and playClip() called while "cueing" wait for "ready" like the engine's pending slot.
```

## Data model

In memory only; nothing is persisted, so no schema version (invariant 4 does not apply). `GameState` is the engine's, unchanged. `tracksById` is private. Volume and X are plain fields that item 6 will later load and save.

## Time & randomness

`sleep(ms)` is the only clock and `newRng()` the only randomness, both in `GameStoreDeps`. Tests pass a `sleep` that resolves on demand and `() => createRng(seed)`. The store never calls `setTimeout`, `Date.now` or `Math.random`. `src/game/` gets no new ambient use.

## Error handling

| Failure | Behavior | Surfaced as |
| ------- | -------- | ----------- |
| `connect` rejects | discard game, stage `idle` | `onStartFailed(error)` → `session.playerFailed` → Setup error |
| `cue` rejects `cue-failed` | `trackFailed`, next track, notice | `skippedNotice: true`; `finished` early if the queue empties |
| `cue` rejects `device-lost` / `not-connected` | stage `round`, frozen | `playback: interrupted` → the visual half's Play-here overlay |
| `cue` rejects `superseded` or epoch stale | stop quietly | nothing |
| `playClip` / `reveal` reject | the adapter has already moved to `interrupted` | `playback: interrupted` |
| `recover` rejects | stay interrupted | `recovery: "failed"` |
| `createGame` `RangeError` | cannot happen after `pickRounds`; if `tracks.length < 5` it throws before any state change | programmer error (Continue is gated at 10 usable) |

## Integration points (shared touchpoints)

- `src/store/session.ts` and `session.test.ts`: one task (T5).
- `src/store/wiring.ts` and `wiring.test.ts`: one task (T8).
- `src/spotify/playback/fakeAdapter.ts` and its test: one task (T2). Existing assertions stay.
- `src/store/game.ts`: written by T6, extended by T7 in the next wave (never in parallel).
- Not touched: `src/main.tsx`, `src/App.tsx`, `src/ui/**`, `package.json`, `biome.json`, `src/game/{game,round,scoring,config,types}.ts`. No barrels.

## Decisions

| #  | Decision | Alternatives | Why | ADR? |
| -- | -------- | ------------ | --- | ---- |
| D1 | A separate game store; the session `Screen` gets no `playing` variant | Add `Screen` variants for round / reveal / results | The game has its own state machine (stage, countdown, playback). Putting it in `Screen` would mix two machines and touch every `switch`. `setup` + `stage !== "idle"` is enough. | no |
| D2 | `playback` is a reduced view of `PlaybackStatus` | Expose `PlaybackStatus` to the screens | Invariant 3: `ui` never imports `spotify`; the screens need five states, not eight. | no |
| D3 | The countdown and the cue run concurrently and the round opens when both finish | Cue first, then count; count first, then cue | A5: the countdown covers the cue. A slow cue holds the "1". | no |
| D4 | Actions are silent no-ops outside their preconditions | Throw | The UI and key handlers fire them freely; the edge case wants "at most once". | no |
| D5 | `settling` gate instead of a time lockout | 300 ms lockout; auto-repeat filter only | The user's answer (G12): ignore until playback settles. | no |
| D6 | Presets live in `game/presets.ts`, not `config.ts` | Add to `GameConfig` | A13 is a rule over the usable count and not a tuning number; `config.ts` belongs to item 1 and stays untouched. | no |
| D7 | No ADR | ADR for "store drives engine and adapter" | It is the pattern ADR-0002 already sets (data and orchestration in the store, UI as a projection) applied to a second store, and reversing it is a normal refactor. Say so at the plan gate if you disagree. | no |
| D8 | `playerFailed` takes `{kind, message}`, not `PlaybackError` | Pass the class | The session needs two fields; a structural type keeps `session.ts` free of a class import. | no |
| D9 | `leave()` disconnects the adapter | Keep the SDK connected between games | A new Start is a user gesture (the browser needs one), and a device that stays registered while the player is in the Picker is surprising. Play again does not leave, so it keeps the connection. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| G-1, G-2, G-14, G-15 | `begin`, `cueCurrent`, `leave`, `session.playerFailed`, `connectGameToSession` |
| G-3, G-4, G-5 (R6, R7, R14) | `play`, the round flow above, `PlaybackView` |
| G-6, G-7, G-8, G-10 (R11, R12) | `next`, `cueCurrent`, countdown, `summarize` |
| G-9 (R13) | status listener, `recover`, `recovery` |
| G-11 (R15) | `leaveGuard.ts` |
| G-12 (R17) | `shortcuts.ts` |
| G-13 (A13) | `game/presets.ts`, `pickRounds` inside `begin` |
| G-16 (R18) | `setVolume`, `connect({ volume })` |
