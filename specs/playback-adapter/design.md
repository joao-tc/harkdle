# Playback adapter — design

**Spec:** [spec.md](spec.md) · **ADRs:** [ADR-0001](../../docs/adr/0001-stack-and-playback.md) (accepted), [ADR-0003](../../docs/adr/0003-cues-are-muted.md) (proposed)

## Approach

Three SDK-free layers and one SDK layer, all under `src/spotify/playback/`. The **engine** (`createPlaybackAdapter`) is the `PlaybackAdapter`: it owns the status machine, the cue sequence, clip polling, reveal, hidden-tab handling and interruption handling, and talks only to a **`PlayerTransport`** port and an injected `Clock` and `Visibility`. The **SDK transport** (`sdk/`) is the only code that touches `Spotify.*`; it implements `PlayerTransport` and sends the Web API fallbacks through the existing `SpotifyApi`. This is the spike's `SdkPlayer` / `flows.ts` split kept: all the timing logic runs on a virtual clock against a **fake transport**, and the SDK layer shrinks to glue. A **fake adapter** gives item 5 a scriptable `PlaybackAdapter` for the store tests. Nothing is wired into `main.tsx`; item 5 builds the real instance.

```
 store (item 5) ──► PlaybackAdapter ◄─ createPlaybackAdapter (engine.ts)
                                         │ cue.ts · clip.ts · confirm.ts · interrupt.ts
                                         ▼
        Clock · Visibility ──►  PlayerTransport (port, SDK-free)
                                         ▲
                       sdk/transport.ts ─┘  (only file family that names `Spotify`)
                         │       └─ sdk/loadSdk.ts
                         └─ SpotifyApi.get/put (token, 429 policy)
```

## Layer placement

| New piece | Layer | Depends on | Logic/Visual | Keeps invariants? |
| --------- | ----- | ---------- | ------------ | ----------------- |
| `playback/adapter.ts` (`PlaybackAdapter`, status, outcome, `PlaybackError`) | spotify | nothing | logic | no SDK types, no React (3, 5) ✅ |
| `playback/transport.ts` (`PlayerTransport`, `TransportState`, `TransportEvent`, `TransportError`) | spotify | `adapter.ts` | logic | no SDK types (5) ✅ |
| `playback/clock.ts` (`Clock`) | spotify | nothing | logic | injected time (2) ✅ |
| `playback/confirm.ts` (`isTrack`, `waitForState`, `pauseConfirmed`, `seekConfirmed`) | spotify | transport | logic | clock injected ✅ |
| `playback/cue.ts` (`runCue`) | spotify | confirm | logic | ✅ |
| `playback/clip.ts` (`runClip`) | spotify | confirm | logic | ✅ |
| `playback/interrupt.ts` (`classifyEvent`, `classifyTimeout`) | spotify | transport | logic | pure ✅ |
| `playback/visibility.ts` (`Visibility`, `documentVisibility`) | spotify | nothing | logic | `Document` passed in ✅ |
| `playback/engine.ts` (`createPlaybackAdapter`) | spotify | all of the above | logic | ✅ |
| `playback/fakeTransport.ts` | spotify (test support) | transport, confirm | logic | virtual time ✅ |
| `playback/fakeAdapter.ts` | spotify (test support) | adapter | logic | ✅ |
| `playback/sdk/loadSdk.ts`, `sdk/transport.ts` | spotify | transport, `SpotifyApi` | logic | the only `Spotify` references (5) ✅ |
| `SpotifyApi.put` in `api.ts` | spotify | `FetchFn` | logic | ✅ |

All of it is `logic`. `store/` and `ui/` are untouched, and `game/` is not imported (the adapter takes a `CueTarget`, not a `Track`).

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| `createSpotifyApi`, `SpotifyApiError`, 429 policy | `src/spotify/api.ts` | Extended with `put`; the SDK transport sends play, pause, seek and transfer through it. |
| `FetchFn`, `FetchResponse` | `src/spotify/auth.ts` | Unchanged; `put` uses the same type. |
| Cue protocol, constants (15 ms poll, 5 s timeout, 1.5 s grace, 50 ms seek tolerance) | `spike/playback-latency:src/flows.ts` | Ported into `confirm.ts` / `cue.ts` / `clip.ts`, minus the measurement code. |
| `SdkPlayer` wiring (listeners, `activateElement`, transfer, reconnect) | `spike/playback-latency:src/sdkPlayer.ts` | Ported into `sdk/transport.ts`, retyped against the `PlayerTransport` port. |
| Virtual-time `fake()` | `spike/playback-latency:src/flows.test.ts` | Grown into `fakeTransport.ts`. |
| `Clock { now, sleep }` shape | spike `flows.ts` | Same shape; main wires `performance.now` and `setTimeout` in item 5. |
| `trackFailed` action | `src/game/game.ts` | Not touched. Item 5 maps `cue-failed` onto it. |

## Types

### `PlaybackAdapter` — `playback/adapter.ts`

**Layer:** spotify (the port item 5 drives and fakes)
**Responsibility:** cue a track, play bounded clips and the reveal, and report status and interruptions, without any SDK type.

```ts
export interface CueTarget {
	readonly uri: string;
	readonly startMs: number; // the round's stored start point (A12, R20)
}

export type InterruptionReason = "device-lost" | "taken-over";

export type PlaybackStatus =
	| { readonly kind: "disconnected" }
	| { readonly kind: "connecting" }
	| { readonly kind: "idle" } // connected, nothing cued
	| { readonly kind: "cueing"; readonly target: CueTarget } // first cue and every re-cue
	| { readonly kind: "ready"; readonly target: CueTarget } // paused at the start point, confirmed
	| { readonly kind: "playing-clip"; readonly target: CueTarget }
	| { readonly kind: "revealing"; readonly target: CueTarget }
	| {
			readonly kind: "interrupted";
			readonly reason: InterruptionReason;
			readonly target: CueTarget | null;
	  };

export type ClipOutcome =
	| { readonly kind: "ended" } // reached origin + lengthMs
	| { readonly kind: "stopped" } // stop() or a new cue()
	| { readonly kind: "hidden" } // tab hidden (R14)
	| { readonly kind: "revealed" } // reveal() dropped the end bound (B3)
	| { readonly kind: "interrupted"; readonly reason: InterruptionReason };

export type PlaybackErrorKind =
	| "sdk-load"
	| "initialization"
	| "authentication"
	| "account"
	| "device-lost"
	| "cue-failed"
	| "not-connected"
	| "superseded";

export class PlaybackError extends Error {
	readonly kind: PlaybackErrorKind;
	constructor(kind: PlaybackErrorKind, message: string);
}

export interface PlaybackAdapter {
	getStatus(): PlaybackStatus;
	onStatus(listener: (status: PlaybackStatus) => void): () => void; // returns unsubscribe
	/** Must run from a user gesture (Start). Idempotent. Rejects with PlaybackError. */
	connect(options: { readonly volume: number }): Promise<void>;
	disconnect(): void;
	/** Stops anything playing, then cues muted (B-1). Resolves at status `ready`. */
	cue(target: CueTarget): Promise<void>;
	/** Resolves when the clip ends, was stopped, hidden, revealed or interrupted. B-5 for timing. */
	playClip(lengthMs: number): Promise<ClipOutcome>;
	/** Continues a playing clip unbounded, or starts from the start point (B3). Resolves once audible. */
	reveal(): Promise<void>;
	/** Stops a clip or reveal, then re-cues to the start point. No-op when idle or ready. */
	stop(): Promise<void>;
	/** 0–1, clamped, remembered. Applied after the cue's mute if one is running (R18). */
	setVolume(volume: number): Promise<void>;
	/** "Play here" (B10): reconnect if needed, transfer playback, re-cue the target. */
	recover(): Promise<void>;
}
```

### `PlayerTransport` — `playback/transport.ts`

**Layer:** spotify (port implemented by `sdk/transport.ts` and `fakeTransport.ts`)
**Responsibility:** the spike's `SdkPlayer`: the raw commands and events, with no SDK types and no judgement about whether a command took effect.

```ts
export interface TransportState {
	readonly positionMs: number;
	readonly paused: boolean;
	readonly uri: string | null;
	readonly linkedFromUri: string | null; // set when Spotify relinked the track (ADR-0001 rule 4)
}

export type TransportEvent =
	| { readonly type: "state"; readonly state: TransportState | null } // null: the SDK reports no playback
	| { readonly type: "not-ready" } // the device went offline
	| {
			readonly type: "error";
			readonly kind: "initialization" | "authentication" | "account" | "playback";
			readonly message: string;
	  };

export type TransportErrorKind = "device-gone" | "not-connected" | "request-failed";

export class TransportError extends Error {
	readonly kind: TransportErrorKind; // "device-gone" = play/transfer answered 404 (ADR-0001 rule 5)
	constructor(kind: TransportErrorKind, message: string);
}

export interface PlayerTransport {
	/** Loads the SDK, creates the device, waits for `ready`, transfers playback (play: false). Rejects with PlaybackError. */
	connect(options: { readonly volume: number }): Promise<void>;
	disconnect(): void;
	transferHere(): Promise<void>; // PUT /me/player, play: false
	playFrom(uri: string, positionMs: number): Promise<void>; // PUT /me/player/play on our device
	pause(): Promise<void>; // SDK call; resolves whether or not it took effect
	pauseViaApi(): Promise<void>; // PUT /me/player/pause
	resume(): Promise<void>;
	seek(positionMs: number): Promise<void>; // SDK call
	seekViaApi(positionMs: number): Promise<void>; // PUT /me/player/seek
	getState(): Promise<TransportState | null>;
	setVolume(volume: number): Promise<void>; // SDK setVolume, 0–1
	getVolume(): Promise<number>; // SDK getVolume
	subscribe(listener: (event: TransportEvent) => void): () => void;
}
```

### Helpers (internal to `playback/`, not exported to other layers)

```ts
// clock.ts (written with the contract, so the fakes can use it before confirm.ts exists)
export interface Clock {
	now(): number;
	sleep(ms: number): Promise<void>;
}

// confirm.ts
export const POLL_MS = 15;
export const TIMEOUT_MS = 5000;
export const GRACE_MS = 1500; // SDK pause/seek gets this long before the Web API fallback
export const SEEK_TOLERANCE_MS = 50;

export interface ConfirmDeps {
	readonly transport: PlayerTransport;
	readonly clock: Clock;
	/** Returns and clears the last transport `playback` error, if any. */
	takeError(): string | null;
}
export type Via = "sdk" | "webApi";
/** Thrown by waitForState when the deadline passes. `lastSeen` is the last raw state (any track) or null. */
export class ConfirmTimeout extends Error {
	readonly lastSeen: TransportState | null;
}
export function isTrack(state: TransportState, uri: string): boolean; // uri or linkedFromUri
export function waitForState(
	deps: ConfirmDeps, uri: string, what: string,
	test: (state: TransportState) => boolean, timeoutMs?: number,
): Promise<{ state: TransportState; at: number }>; // state of other tracks never reaches `test`
export function pauseConfirmed(deps: ConfirmDeps, uri: string, what: string): Promise<{ state: TransportState; via: Via }>;
export function seekConfirmed(deps: ConfirmDeps, uri: string, positionMs: number): Promise<{ state: TransportState; via: Via }>;

// cue.ts
export interface CueDeps extends ConfirmDeps {
	getVolume(): number; // the user's volume, restored after the mute
}
/** B2 with the B7 mute. Returns originMs: the confirmed paused position the clip will count from. */
export function runCue(deps: CueDeps, target: CueTarget): Promise<{ originMs: number }>;

// clip.ts
export interface ClipControl {
	/** Set by the engine (hidden handler, stop, reveal, interruption); polled every iteration. */
	cancel: "hidden" | "stopped" | "revealed" | "interrupted" | null;
}
export type ClipEnd = "ended" | "hidden" | "stopped" | "revealed" | "interrupted";
/** resume → first position change → poll to origin + lengthMs → confirmed pause. On "revealed" it returns without pausing. */
export function runClip(
	deps: ConfirmDeps, target: CueTarget, originMs: number, lengthMs: number, control: ClipControl,
): Promise<{ end: ClipEnd; resumeToFirstPositionMs: number }>;

// interrupt.ts
export interface Expectation {
	readonly target: CueTarget | null;
	readonly holding: boolean; // a cue is held: status ready, playing-clip or revealing (not mid-cue)
}
/** not-ready → "device-lost"; state null or another track while holding → "taken-over"; else null. */
export function classifyEvent(event: TransportEvent, expectation: Expectation): InterruptionReason | null;
/** A timeout while the track is ours → "device-lost"; while another track or null → "taken-over". */
export function classifyTimeout(lastSeen: TransportState | null, target: CueTarget): InterruptionReason;

// visibility.ts
export interface Visibility {
	isHidden(): boolean;
	subscribe(listener: (hidden: boolean) => void): () => void;
}
export function documentVisibility(
	doc: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
): Visibility;

// engine.ts
export interface PlaybackDeps {
	readonly transport: PlayerTransport;
	readonly clock: Clock;
	readonly visibility: Visibility;
}
export function createPlaybackAdapter(deps: PlaybackDeps): PlaybackAdapter;
```

### `SpotifyApi.put` — `src/spotify/api.ts`

```ts
export interface SpotifyApi {
	get(target: string): Promise<unknown>;
	/** JSON body optional. Any 2xx resolves with no body read (the playback endpoints answer 204). Same token, 429 policy and typed errors as `get`. */
	put(target: string, body?: unknown): Promise<void>;
}
```

### SDK layer — `playback/sdk/`

```ts
// loadSdk.ts: injects https://sdk.scdn.co/spotify-player.js once, resolves when onSpotifyWebPlaybackSDKReady fires.
// Rejects PlaybackError("sdk-load") on script error or after a 10 s timeout. Concurrent calls share one load.
export function loadSdk(deps?: { document?: Document; window?: Window; timeoutMs?: number; setTimeout?: ... }): Promise<void>;

// transport.ts
export interface SdkTransportDeps {
	getAccessToken(): Promise<string>;
	api: SpotifyApi;
	deviceName?: string; // default "harkdle"
	loadSdk?: () => Promise<void>; // default: ./loadSdk
}
export function createSdkTransport(deps: SdkTransportDeps): PlayerTransport;
```

### Fakes (test support, not imported by app code)

```ts
// fakeTransport.ts — virtual time. `clock.sleep(ms)` advances time and fires anything scheduled up to then.
export interface FakeTransportOptions {
	latencyMs: number; // audio starts this long after play/resume
	sdkPauseIgnored?: boolean; sdkSeekIgnored?: boolean; // quirks from the spike
	relinkedTo?: string; // report this uri with linkedFromUri = the requested one
	play404Times?: number; // first N playFrom calls reject TransportError("device-gone"), then work after connect()
	setVolumeIgnored?: boolean;
}
export function createFakeTransport(options: FakeTransportOptions): {
	transport: PlayerTransport;
	clock: Clock;
	schedule(atMs: number, run: () => void): void; // e.g. fire a hidden event at t = 1200
	emit(event: TransportEvent): void;
	readonly calls: readonly string[]; // "playFrom spotify:track:a 30000", "pauseViaApi", ...
	audibleMs(): number; // total virtual ms where playing && volume > 0 (B7 leak check)
	volume(): number;
};

// fakeAdapter.ts — for item 5's store tests.
export interface FakeAdapterControls {
	readonly calls: readonly FakeCall[]; // { method: "cue" | "playClip" | ..., args }
	endClip(): void; // settles the pending playClip with "ended"
	interrupt(reason: InterruptionReason): void; // status -> interrupted, settles the clip
	hideTab(): void; // settles the pending playClip with "hidden"
	failNextCue(error: PlaybackError): void;
}
export function createFakeAdapter(options?: { autoEndClips?: boolean }): PlaybackAdapter & FakeAdapterControls;
```

## Behavior

### Status machine (engine)

| From | Event | To | Notes |
| ---- | ----- | -- | ----- |
| `disconnected` | `connect` | `connecting` → `idle` | rejects `PlaybackError`; stays `disconnected` on failure |
| `idle`, `ready`, `playing-clip`, `revealing` | `cue(t)` | `cueing` → `ready` | stops playback; supersedes an older `cue` (B-9) |
| `ready` | `playClip(n)` | `playing-clip` | `runClip` |
| `playing-clip` | clip ends / `stop` / hidden | `cueing` → `ready` | the `playClip` promise settles **before** the re-cue starts; re-cue is `seekConfirmed` to `startMs` |
| `cueing` | `playClip(n)` / `reveal` | (unchanged) | one pending slot (B-5); starts when `ready` is reached |
| `playing-clip` | `reveal` | `revealing` | `cancel = "revealed"`; clip settles `revealed`; no pause |
| `ready` | `reveal` | `revealing` | `resume()` and wait for the first position change |
| `revealing` | `stop` / `cue` | `cueing` → `ready` | reveal ignores hidden (B8) |
| any holding status | not-ready / foreign state / timeout | `interrupted` | in-flight clip settles `interrupted` |
| `interrupted`, `disconnected` | `recover` | `connecting` → `cueing` → `ready` | reconnect only if the device was lost |

### Cue (`runCue`), in order

1. `setVolume(0)` and confirm with `getVolume()`. If muting is not confirmed within the grace period, continue anyway and note it in the thrown/logged detail (V1 decides the fallback).
2. `playFrom(uri, startMs)`. A `device-gone` error propagates; the engine reconnects and retries the whole cue once (B-8).
3. `waitForState` until playing and `positionMs > startMs` on this track.
4. `pauseConfirmed`, then `seekConfirmed(startMs)`. `originMs` is the position of the seeked, paused state.
5. **Always, in `finally`:** `setVolume(getVolume())`.

### Clip (`runClip`)

`resume()` → first state that is playing, past `originMs`, and different from the pre-call position → target = `originMs + lengthMs` → poll every 15 ms until `positionMs >= target` → `pauseConfirmed`. The timer therefore starts when audio actually moves (game-design: "the clip timer must start when the track actually begins playing").

### Why the hidden handler pauses directly

Background tabs throttle timers to about one wake-up per second, so the polling loop would notice a hidden tab, and the clip end, up to a second late. On `hidden = true` during a clip the engine sets `cancel = "hidden"` and calls `transport.pause()` itself from the event handler. The loop then confirms the pause (with the Web API fallback) when it next wakes. Reveal ignores the event.

## Data model

None persisted. In memory: the status, the current `CueTarget`, `originMs`, the user's volume (set by `connect` and `setVolume`), a generation counter (supersede, B-9), one pending-play slot, and the last transport error. No schema version needed.

## Time & randomness

`Clock { now, sleep }` and `Visibility` are injected; `transport` is the only I/O. No randomness. The engine and helpers never call `Date.now`, `performance.now`, `setTimeout` or `document` themselves; `sdk/loadSdk.ts` takes its `document`, `window` and timer as optional parameters for the same reason, and `main.tsx` (item 5) passes the real ones.

## Error handling

| Failure | Behavior | Surfaced as |
| ------- | -------- | ----------- |
| SDK script fails to load or times out | `connect` rejects, status `disconnected` | `PlaybackError("sdk-load")` |
| SDK `initialization_error` / `authentication_error` / `account_error` during connect | `connect` rejects, status `disconnected` | `PlaybackError` of the same kind |
| Play returns 404 (device gone) | reconnect once, retry the cue once | `device-lost` if it fails again |
| Cue times out, `playback_error`, or the track never plays | `cue` rejects after restoring the volume; status `idle` | `PlaybackError("cue-failed")` |
| SDK pause or seek not confirmed in 1.5 s | repeat through the Web API | invisible; recorded in the call log |
| Web API fallback fails (`SpotifyApiError`) | treated as the command not taking effect; the 5 s timeout then applies | `cue-failed`, or `interrupted` during a clip |
| `not_ready`, foreign or `null` state while holding, timeout while ours | status `interrupted`, clip settles `interrupted` | `onStatus` |
| Newer `cue` while one runs | older rejects, playback stops | `PlaybackError("superseded")` |
| Command before `connect` resolves | rejects | `PlaybackError("not-connected")` |
| `setVolume` rejects | the volume is still remembered and retried on the next cue restore | swallowed with the call log; never throws into the cue's `finally` |

## Integration points (shared touchpoints)

- `package.json`, `package-lock.json`, `tsconfig.json` — the `@types/spotify-web-playback-sdk` dev dependency and its `types` entry. One task (T3).
- `src/spotify/api.ts` — `put`. One task (T2); `playlists.ts` and the other consumers only call `get`, so nothing else changes.
- `biome.json`, `rules/`, `tools/invariants.test.ts` — the invariant-5 probe, and a grit rule only if Biome doesn't already flag type-position and `window.Spotify` uses. One task (T4).
- `src/main.tsx`, `src/store/**`, `src/ui/**` — **not touched** (B1).
- No barrel files. Each module is imported by path.

## Decisions

| #   | Decision | Alternatives | Why | ADR? |
| --- | -------- | ------------ | --- | ---- |
| D1  | Engine / transport split: the engine is SDK-free and tested on a virtual clock; `sdk/` is thin glue | One adapter file with the SDK inside (as the spike's player); a fully mocked `Spotify.Player` for engine tests | The timing and recovery logic is the risky part and needs deterministic tests. Faking one narrow port is far smaller than faking `Spotify.Player` and its events. | no (follows ADR-0001's "one seam") |
| D2  | Mute the SDK volume for the whole cue and restore it in `finally` | Accept the audible leak; a different cue strategy | The cue plays the first seconds of clip 1 for about 0.5 s or more, during the countdown. For Classic start that is the answer's first clip. | **ADR-0003** |
| D3  | `reveal()` continues a playing clip, else starts from the start point; one `revealed` outcome | Always restart; always continue | Matches A5 in both situations, with no audible jump. | no (B3 in the spec) |
| D4  | Extend `SpotifyApi` with `put` | A separate playback HTTP client in `sdk/`; raw `fetch` as in the spike | Keeps one token, 429 and typed-error policy. | no |
| D5  | The SDK script is injected by `sdk/loadSdk.ts` on first `connect` | A `<script>` tag in `index.html` (the spike) | Keeps the SDK concern in `sdk/`, avoids loading it for logged-out visitors, and lets tests drive the load. | no |
| D6  | `Visibility` is injected | The engine reads `document` | Testable, and consistent with how the composition root passes `fetch`, `Date.now` and `localStorage`. | no |
| D7  | The hidden handler pauses directly | Rely on the polling loop | Background timers are throttled to about 1 s. | no |
| D8  | `fakeTransport.ts` and `fakeAdapter.ts` are plain source files in `playback/` | A `__fixtures__` folder; mocking in each test | Item 5 imports the fake adapter, and one shared fake transport avoids two tasks growing the same fixture. | no |
| D9  | Generation counter for supersede and stale continuations | A command queue | Smallest mechanism that makes "latest cue wins" and "no double apply" true. | no |
| D10 | `PlaybackStatus` is a discriminated union read through `getStatus` / `onStatus` | One event per transition | The store needs the current state, not a log, and `useSyncExternalStore`-style subscription fits. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| B-1, B-2, B-3, B-8 | `confirm.ts`, `cue.ts`, engine reconnect-retry |
| R6, B-4, B-5 | `clip.ts`, engine status machine and pending slot |
| B-6 | engine `reveal`, `ClipControl.cancel = "revealed"` |
| R14 | `visibility.ts`, engine hidden handler (D7) |
| R13 | `interrupt.ts`, engine `interrupted` status, `recover` |
| R18 | engine `setVolume`, `getVolume` memory, `sdk/transport.ts` |
| B-7 | `PlaybackError`, `sdk/loadSdk.ts`, `sdk/transport.ts` connect mapping |
| B-9 | engine generation counter |
| B-10 | `fakeAdapter.ts` |
| B-11 | T3 (types in `tsconfig`), T4 (probe, grit rule if needed) |
