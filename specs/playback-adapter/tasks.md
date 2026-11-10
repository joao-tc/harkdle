# Playback adapter — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Implemented (T1–T14 done and gated; T15 live check pending)

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 0 | — (orchestrator) | Create `feat/3/playback-adapter` from `main`. Confirm ADR-0003 with the owner, flip it to Accepted, and commit it **alone, before any code**. Commit this spec folder. | `docs(adr): add ADR-0003 for muted cues`, `docs: add playback-adapter spec, design and tasks` |
| 1 | T1, T2, T3, T4, T5 | parallel — 5 subagents | one per task: `feat(spotify): …`, `chore: …`, `test(invariants): …` |
| 2 | T6, T7, T8, T9 | parallel — 4 subagents | one per task |
| 3 | T10, T11 | parallel — 2 subagents | one per task |
| 4 | T12, T13 | parallel — 2 subagents | one per task |
| 5 | T14 | sequential — the engine | `feat(spotify): add the playback adapter engine` |
| 6 | T15 (orchestrator), then the owner's live check | docs and manual | `docs: mark playback-adapter implemented` |

Every `Verify` uses `npm test -- <path>` (`vitest run <path>`) plus `npx biome check <own files>`. Subagents must not run `npm run dev`, `npm run build` or the full suite; they never edit `package.json`, `biome.json` or any file they do not own (T3 and T4 own those). The orchestrator runs the wave gate after each wave: `npm run lint` → `npm run typecheck` → `npm test` → `npm test -- tools/invariants`, plus `npm run build` after waves 3 and 5.

Every subagent brief carries: the task block, the design's signatures for its files (paste them, do not point at the design), the spike excerpts it ports (`git show spike/playback-latency:src/flows.ts` or `sdkPlayer.ts`; the brief names the exact functions), the layer invariants (1–5), and [coding-principles](../../.claude/skills/feature-dev/references/coding-principles.md). Tests use a virtual `Clock`: no real timers, no real network, no `Spotify` global outside `sdk/`.

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | The contract: `PlaybackAdapter` + status/outcome types + `PlaybackError`, `PlayerTransport` + state/event types + `TransportError`, `Clock`, and one test of the two error classes | ⚠️ Cohesive (type declarations that must land together; the two classes are the only runtime code) |
| T2 | `SpotifyApi.put` + test | ✅ Atomic |
| T3 | SDK typings dev dependency and `tsconfig` `types` entry | ✅ Atomic |
| T4 | The invariant-5 probe in `tools/invariants.test.ts`, plus a grit rule only if needed | ✅ Atomic |
| T5 | `Visibility` + `documentVisibility` + test | ✅ Atomic |
| T6 | `createFakeTransport` (virtual time, quirks, `audibleMs`) + test | ✅ Atomic |
| T7 | `createFakeAdapter` + test | ✅ Atomic |
| T8 | `loadSdk` + test | ✅ Atomic |
| T9 | `classifyEvent` / `classifyTimeout` + test | ✅ Atomic |
| T10 | `isTrack`, `waitForState`, `pauseConfirmed`, `seekConfirmed` + test | ⚠️ Cohesive (one confirm-from-state pattern, one file) |
| T11 | `createSdkTransport` + test | ⚠️ Cohesive (one class of SDK glue; the only `Spotify` user besides the loader) |
| T12 | `runCue` + test | ✅ Atomic |
| T13 | `runClip` + test | ✅ Atomic |
| T14 | `createPlaybackAdapter` (status machine, supersede, pending slot, reveal, stop, hidden, interruption, recover, volume) + test | ⚠️ Cohesive (one state machine that composes T9, T12, T13; every behavior is the same status table) |
| T15 | Status and roadmap notes | ✅ Atomic |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in an earlier wave? |
| ---- | ---------- | ---- | ---------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T4 | — | 1 | ✅ |
| T5 | — | 1 | ✅ |
| T6 | T1 | 2 | ✅ |
| T7 | T1 | 2 | ✅ |
| T8 | T3 | 2 | ✅ |
| T9 | T1 | 2 | ✅ |
| T10 | T1, T6 | 3 | ✅ |
| T11 | T1, T2, T3, T8 | 3 | ✅ |
| T12 | T1, T10 | 4 | ✅ |
| T13 | T1, T10 | 4 | ✅ |
| T14 | T1, T5, T6, T9, T12, T13 | 5 | ✅ |
| T15 | T14 | 6 | ✅ |

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | spotify | `src/spotify/playback/adapter.ts`, `transport.ts`, `clock.ts`, `contract.test.ts` | — |
| 1 | T2 | spotify | `src/spotify/api.ts`, `src/spotify/api.test.ts` | — |
| 1 | T3 | manifest | `package.json`, `package-lock.json`, `tsconfig.json` | — |
| 1 | T4 | tooling | `tools/invariants.test.ts`, and only if needed `biome.json`, `rules/no-sdk-types.grit` | — |
| 1 | T5 | spotify | `src/spotify/playback/visibility.ts`, `visibility.test.ts` | — |
| 2 | T6 | spotify | `src/spotify/playback/fakeTransport.ts`, `fakeTransport.test.ts` | — |
| 2 | T7 | spotify | `src/spotify/playback/fakeAdapter.ts`, `fakeAdapter.test.ts` | — |
| 2 | T8 | spotify | `src/spotify/playback/sdk/loadSdk.ts`, `sdk/loadSdk.test.ts` | — |
| 2 | T9 | spotify | `src/spotify/playback/interrupt.ts`, `interrupt.test.ts` | — |
| 3 | T10 | spotify | `src/spotify/playback/confirm.ts`, `confirm.test.ts` | — |
| 3 | T11 | spotify | `src/spotify/playback/sdk/transport.ts`, `sdk/transport.test.ts` | — |
| 4 | T12 | spotify | `src/spotify/playback/cue.ts`, `cue.test.ts` | — |
| 4 | T13 | spotify | `src/spotify/playback/clip.ts`, `clip.test.ts` | — |
| 5 | T14 | spotify | `src/spotify/playback/engine.ts`, `engine.test.ts` | — |
| 6 | T15 | docs | `specs/playback-adapter/*`, `specs/app-v1/ROADMAP.md`, `.claude/skills/feature-dev/SKILL.md` (only if T4 changed the enforcement) | — |

`src/main.tsx`, `src/store/**` and `src/ui/**` are owned by no task (B1). No barrel files. T3 is the only task that touches the lockfile; no wave-mate runs `npm install`.

## Tasks

### T1 — Playback contract types

**Wave:** 1 · **Layer:** spotify · **Requirement:** B-7, B-10 (types)
**Depends on:** —
**Owns:** `src/spotify/playback/adapter.ts`, `src/spotify/playback/transport.ts`, `src/spotify/playback/clock.ts`, `src/spotify/playback/contract.test.ts`
**Reads:** `design.md` §Types, `src/spotify/api.ts` (error-class style)

**Do:** Write the types and the two error classes exactly as in the design (`PlaybackAdapter`, `PlaybackStatus`, `ClipOutcome`, `PlaybackError`, `PlayerTransport`, `TransportState`, `TransportEvent`, `TransportError`, `Clock`).

**Invariants:** 3, 5: no React, no store, no `Spotify` in any form; these files import nothing from `sdk/`.

**Done when:**
- [ ] Every signature in the design compiles and matches it.
- [ ] `PlaybackError` and `TransportError` set `name`, `kind` and `message`, and are `instanceof Error`.
- [ ] `npm run typecheck` is clean for these files.

**Verify:** `npm test -- src/spotify/playback/contract` → expect the error-class tests passing; `npx biome check src/spotify/playback`

### T2 — `SpotifyApi.put`

**Wave:** 1 · **Layer:** spotify · **Requirement:** B11 (feeds B-2, B-8)
**Depends on:** —
**Owns:** `src/spotify/api.ts`, `src/spotify/api.test.ts`
**Reads:** `design.md` §`SpotifyApi.put`, `src/spotify/auth.ts` (`FetchFn`)

**Do:** Add `put(target, body?)`: same token, same 429 retry and backoff, same typed errors and request-target check as `get`; send `Content-Type: application/json` and a JSON body when `body` is given; resolve on any 2xx without reading the body (204 has none). Refactor the private `attempt` to take the method and body; `get` behaves exactly as before.

**Invariants:** 3: no React or store. The existing `get` tests stay untouched and green.

**Done when:**
- [ ] 204 and 200 with an empty body resolve.
- [ ] 401, 403, 404, other statuses and `fetchFn` throwing map to the same `SpotifyApiError` kinds as `get`.
- [ ] 429 retries as `get` does, with fake `sleep`, and the method and body are resent on each retry.
- [ ] A target off the Spotify API throws `unexpected` with no request.

**Verify:** `npm test -- src/spotify/api` → expect the old suite plus the new `put` cases passing; `npx biome check src/spotify/api.ts src/spotify/api.test.ts`

### T3 — SDK typings dependency

**Wave:** 1 · **Layer:** manifest · **Requirement:** B13
**Depends on:** —
**Owns:** `package.json`, `package-lock.json`, `tsconfig.json`
**Reads:** `spike/playback-latency:package.json` (version used there)

**Do:** `npm install -D @types/spotify-web-playback-sdk@^0.1.19` and add `"spotify-web-playback-sdk"` to `tsconfig.json` `types`. Check that the package name and the `types` entry are right for the installed version; if not, say so instead of guessing.

**Invariants:** the global `Spotify` namespace becomes visible to the compiler everywhere; Biome (T4) is what keeps it out of other files.

**Done when:**
- [ ] `npm run typecheck` is green on a scratch `sdk/` file that uses `new Spotify.Player(...)` and `window.onSpotifyWebPlaybackSDKReady` (deleted before committing).
- [ ] The lockfile diff contains only that package.

**Verify:** `npm run typecheck`

### T4 — Invariant 5 probe

**Wave:** 1 · **Layer:** tooling · **Requirement:** B-11
**Depends on:** —
**Owns:** `tools/invariants.test.ts`; `biome.json` and `rules/no-sdk-types.grit` only if the probe shows Biome doesn't already flag the cases below
**Reads:** `biome.json`, `rules/no-ambient.grit`, `.claude/skills/feature-dev/SKILL.md` §Invariants

**Do:** Add fixtures that must be flagged: `src/spotify/playback/engine.ts` using `Spotify` as a value, `const p: Spotify.Player` in type position, and `window.Spotify`; and fixtures that must not be: the same three inside `src/spotify/playback/sdk/`. Run them. If Biome's `noRestrictedGlobals` misses the type-position or `window.Spotify` forms, add `rules/no-sdk-types.grit` (scoped to `src/**` except `src/spotify/playback/sdk/**`) and register it in `biome.json`, and say so in the report.

**Invariants:** 5. A fixture that should fail but passes is a bug in the rule, never a reason to relax the fixture.

**Done when:**
- [ ] Each violating fixture is flagged with the category the test expects; each clean fixture is not.
- [ ] `reports only on the fixtures it wrote` still passes.
- [ ] The report states whether a grit rule was needed.

**Verify:** `npm test -- tools/invariants` → expect all passing; `npm run lint`

### T5 — `Visibility`

**Wave:** 1 · **Layer:** spotify · **Requirement:** R14 (detection)
**Depends on:** —
**Owns:** `src/spotify/playback/visibility.ts`, `src/spotify/playback/visibility.test.ts`
**Reads:** `design.md` §Helpers (visibility)

**Do:** Implement `Visibility` and `documentVisibility(doc)`: `isHidden()` reads `doc.hidden`, `subscribe` listens to `visibilitychange`, passes `doc.hidden` and returns an unsubscribe.

**Invariants:** 3: takes the `Document` as a parameter, never the `document` global.

**Done when:**
- [ ] Listeners fire with `true` on hide and `false` on show, and not after unsubscribe.
- [ ] Two subscribers are independent.

**Verify:** `npm test -- src/spotify/playback/visibility` → expect passing

### T6 — Virtual-time fake transport

**Wave:** 2 · **Layer:** spotify (test support) · **Requirement:** B-1..B-3, B-8, B7 (leak check)
**Depends on:** T1
**Owns:** `src/spotify/playback/fakeTransport.ts`, `src/spotify/playback/fakeTransport.test.ts`
**Reads:** `design.md` §Fakes and §Types, `spike/playback-latency:src/flows.test.ts` (`fake()`), `clock.ts`, `transport.ts`

**Do:** Implement `createFakeTransport` per the design: virtual `Clock` where `sleep` advances time and fires anything scheduled up to that time, the spike's `fake()` behaviour (stale previous-track state, audio starting `latencyMs` after play/resume, position advancing 1:1), the quirks (`sdkPauseIgnored`, `sdkSeekIgnored`, `relinkedTo`, `play404Times`, `setVolumeIgnored`), `getVolume`/`setVolume`, `emit`, `schedule`, a `calls` log, and `audibleMs()`.

**Invariants:** 2: all time comes from its own virtual clock; no `Date.now`, no real timers.

**Done when:**
- [ ] A track started with `playFrom` reports the previous track's state until `latencyMs` passes, then the new track at the right position.
- [ ] Each quirk behaves as documented, and `play404Times` rejects with `TransportError("device-gone")` that many times.
- [ ] `audibleMs()` counts only time where playing and volume > 0, and `schedule` fires in time order during `sleep`.

**Verify:** `npm test -- src/spotify/playback/fakeTransport` → expect passing

### T7 — Fake adapter

**Wave:** 2 · **Layer:** spotify (test support) · **Requirement:** B-10
**Depends on:** T1
**Owns:** `src/spotify/playback/fakeAdapter.ts`, `src/spotify/playback/fakeAdapter.test.ts`
**Reads:** `design.md` §Types (`PlaybackAdapter`) and §Fakes

**Do:** Implement `createFakeAdapter` per the design: a full `PlaybackAdapter` with a status machine simple enough to trust (disconnected → idle → cueing → ready → playing-clip …), `onStatus` subscriptions, a `calls` log, and the controls `endClip`, `interrupt`, `hideTab`, `failNextCue`, plus `autoEndClips` (clips end on the next microtask when set).

**Invariants:** 3, 5. It imports only `adapter.ts`.

**Done when:**
- [ ] It satisfies `PlaybackAdapter` (a type-level assignment in the test).
- [ ] `playClip` settles with `ended`, `hidden` or `interrupted` as the controls dictate; `failNextCue` makes the next `cue` reject once.
- [ ] `reveal` while a clip is pending settles that clip with `revealed`.

**Verify:** `npm test -- src/spotify/playback/fakeAdapter` → expect passing

### T8 — `loadSdk`

**Wave:** 2 · **Layer:** spotify (sdk) · **Requirement:** B12, B-7 (`sdk-load`)
**Depends on:** T3
**Owns:** `src/spotify/playback/sdk/loadSdk.ts`, `src/spotify/playback/sdk/loadSdk.test.ts`
**Reads:** `design.md` §SDK layer, `spike/playback-latency:src/sdkPlayer.ts` (the `onSpotifyWebPlaybackSDKReady` wait)

**Do:** Implement `loadSdk(deps?)`: inject `https://sdk.scdn.co/spotify-player.js` once, resolve on `onSpotifyWebPlaybackSDKReady`, resolve at once if `window.Spotify` already exists, share one load between concurrent callers, and reject `PlaybackError("sdk-load")` on script error or after the timeout. `document`, `window` and the timer are parameters.

**Invariants:** 5: this file may reference `Spotify`/`window.Spotify`; nothing else outside `sdk/` may.

**Done when:**
- [ ] Two concurrent calls add one `<script>` tag and resolve together.
- [ ] A script `error` event and the timeout each reject with `sdk-load`; a later call may retry.
- [ ] The test uses jsdom (`// @vitest-environment jsdom`) and a fake timer parameter.

**Verify:** `npm test -- src/spotify/playback/sdk/loadSdk` → expect passing

### T9 — Interruption classification

**Wave:** 2 · **Layer:** spotify · **Requirement:** R13, B9
**Depends on:** T1
**Owns:** `src/spotify/playback/interrupt.ts`, `src/spotify/playback/interrupt.test.ts`
**Reads:** `design.md` §Helpers (interrupt)

**Do:** Implement `classifyEvent` and `classifyTimeout` per the design as pure functions.

**Invariants:** 1-style purity: no I/O, no clock.

**Done when (table-driven test):**
- [ ] `not-ready` → `device-lost` whether or not a cue is held.
- [ ] A `null` state or a state for another track → `taken-over` only while `holding`; the same events mid-cue → `null`.
- [ ] A state for the target by `uri` or `linkedFromUri` → `null`.
- [ ] `error` events → `null` (cue failures are the cue's business).
- [ ] `classifyTimeout`: ours → `device-lost`; another track or `null` → `taken-over`.

**Verify:** `npm test -- src/spotify/playback/interrupt` → expect passing

### T10 — Confirm-from-state helpers

**Wave:** 3 · **Layer:** spotify · **Requirement:** B-2, B-3
**Depends on:** T1, T6
**Owns:** `src/spotify/playback/confirm.ts`, `src/spotify/playback/confirm.test.ts`
**Reads:** `design.md` §Helpers, `spike/playback-latency:src/flows.ts` (`isTrack`, `waitFor`, `pauseConfirmed`, `seekConfirmed`), `fakeTransport.ts`

**Do:** Port the four helpers with the constants (`POLL_MS`, `TIMEOUT_MS`, `GRACE_MS`, `SEEK_TOLERANCE_MS`) and the `ConfirmTimeout` error carrying `lastSeen`; `waitForState` also throws the string from `takeError()` as an `Error` when one is pending.

**Invariants:** 2: only the injected `Clock`.

**Done when (on `createFakeTransport`):**
- [ ] A pause the SDK ignores is repeated through the Web API after exactly the grace period, and `via` says `webApi`; a pause that works says `sdk`.
- [ ] Same for seek, with the 50 ms tolerance.
- [ ] A state for another track never satisfies `test`; a relinked track (`linkedFromUri`) does.
- [ ] A timeout throws `ConfirmTimeout` with the last raw state, including one for another track and `null`.
- [ ] A pending `takeError()` fails the wait immediately.

**Verify:** `npm test -- src/spotify/playback/confirm` → expect passing

### T11 — SDK transport

**Wave:** 3 · **Layer:** spotify (sdk) · **Requirement:** B-7, B-8, R18, B12, B14
**Depends on:** T1, T2, T3, T8
**Owns:** `src/spotify/playback/sdk/transport.ts`, `src/spotify/playback/sdk/transport.test.ts`
**Reads:** `design.md` §`PlayerTransport` and §SDK layer, `spike/playback-latency:src/sdkPlayer.ts`, `api.ts`

**Do:** Implement `createSdkTransport` against the SDK-free port: `connect` (load, `new Spotify.Player` with `getOAuthToken` and the caller's volume, `activateElement`, `connect()`, wait for `ready`, transfer with `play: false`; errors during connect reject `PlaybackError` of the matching kind), `disconnect`, `transferHere`, `playFrom` (404 → `TransportError("device-gone")`), `pause`/`resume`/`seek`/`setVolume`/`getVolume`/`getState` straight to the SDK, `pauseViaApi`/`seekViaApi`/`transferHere` via `api.put`, and `subscribe` fanning out `player_state_changed` (including `null`), `not_ready` and the four error events as `TransportEvent`s. Map `track_window.current_track.uri` and `linked_from.uri` to `TransportState`. Calling `connect` twice reuses the player.

**Invariants:** 5: this is the one file family allowed to name `Spotify`; no `Spotify` type is exported from it.

**Done when (jsdom, `window.Spotify` replaced by a stub class with scripted events):**
- [ ] The connect sequence runs in order, and each error event during connect rejects with its kind; a second `connect` does nothing.
- [ ] `state`, `not-ready` and `error` events reach subscribers; unsubscribe works.
- [ ] `playFrom`, `pauseViaApi`, `seekViaApi` and `transferHere` call `api.put` with the right path, `device_id` and body; a `not-found` from `api.put` on `playFrom` becomes `device-gone`.
- [ ] `disconnect` then `connect` creates a fresh player (the reconnect path).
- [ ] `getVolume`/`setVolume` call the SDK with the given value.

**Verify:** `npm test -- src/spotify/playback/sdk/transport` → expect passing; `npm run typecheck`

### T12 — Cue sequence

**Wave:** 4 · **Layer:** spotify · **Requirement:** B-1, B-2, B-3, B7
**Depends on:** T1, T10
**Owns:** `src/spotify/playback/cue.ts`, `src/spotify/playback/cue.test.ts`
**Reads:** `design.md` §Behavior (Cue), `confirm.ts`, `fakeTransport.ts`, `spike/playback-latency:src/flows.ts` (`prime`, the preSeek branch)

**Do:** Implement `runCue` in the order of the design, with the mute before `playFrom`, the volume restore in `finally`, and `originMs` from the seeked state.

**Invariants:** 2; ADR-0003.

**Done when (on `createFakeTransport`):**
- [ ] The call log shows `setVolume 0` before `playFrom` and `setVolume <user>` after the seek, and `audibleMs()` is 0 for the whole cue.
- [ ] The volume is restored when `playFrom` rejects, when the wait times out, and when the pause never confirms; the original error is the one thrown.
- [ ] With the SDK pause and seek ignored, the cue still ends paused at `startMs` (within tolerance) via the Web API, and `originMs` is the seeked position.
- [ ] A relinked track and a stale previous-track state do not break it; `device-gone` propagates unchanged.
- [ ] If the mute is not confirmed, the cue continues and the error detail says so.

**Verify:** `npm test -- src/spotify/playback/cue` → expect passing

### T13 — Clip runner

**Wave:** 4 · **Layer:** spotify · **Requirement:** R6, R14, B-6
**Depends on:** T1, T10
**Owns:** `src/spotify/playback/clip.ts`, `src/spotify/playback/clip.test.ts`
**Reads:** `design.md` §Behavior (Clip), `confirm.ts`, `fakeTransport.ts`, `spike/playback-latency:src/flows.ts` (`runTrial`, the resume and wait section)

**Do:** Implement `runClip`: `resume()`, wait for the first moving state (playing, past `originMs`, different from the pre-call position), then poll to `originMs + lengthMs` and `pauseConfirmed`. Check `control.cancel` every iteration: `hidden`, `stopped` and `interrupted` stop with a confirmed pause (best effort for `interrupted`); `revealed` returns at once without pausing.

**Invariants:** 2.

**Done when (on `createFakeTransport`):**
- [ ] A 1 s and a 16 s clip end within one poll interval plus the pause lag of the target, and `resumeToFirstPositionMs` matches the fake's latency.
- [ ] A stale position from the previous clip of the same track is not taken as movement.
- [ ] Each `cancel` value ends the clip as `hidden` / `stopped` / `interrupted` / `revealed`, and only `revealed` leaves the player playing.
- [ ] A cancel set while waiting for the first position change is honoured.
- [ ] A timeout surfaces as `ConfirmTimeout` for the engine to classify.

**Verify:** `npm test -- src/spotify/playback/clip` → expect passing

### T14 — The playback adapter (engine)

**Wave:** 5 · **Layer:** spotify · **Requirement:** R6, R13, R14, R18, B-1..B-9
**Depends on:** T1, T5, T6, T9, T12, T13
**Owns:** `src/spotify/playback/engine.ts`, `src/spotify/playback/engine.test.ts`
**Reads:** `design.md` (whole), `spec.md` §Requirements and §Edge cases, every sibling module

**Do:** Implement `createPlaybackAdapter(deps)` as the status machine in the design: `connect`/`disconnect`; `cue` with the generation counter, the 404 reconnect-and-retry-once, and error mapping to `cue-failed`; `playClip` with the single pending slot and the re-cue after the promise settles; `reveal` (continue or start); `stop`; `setVolume` (clamp, remember, apply at the cue's restore); the hidden handler pausing directly (clip only); interruption detection from `subscribe` events through `classifyEvent` and from timeouts through `classifyTimeout`; `recover`; `onStatus`.

**Invariants:** 2, 3, 5; ADR-0001 rules 1-5 and ADR-0003.

**Done when (all on `createFakeTransport` with a fake `Visibility`, virtual time):**
- [ ] `cue` → `ready` and the status sequence is `idle → cueing → ready`; `playClip(1000)` settles `ended` and the status goes `playing-clip → cueing → ready`, so a second `playClip` replays from the same start point.
- [ ] `playClip` during the re-cue waits and runs once; a second `playClip` while one is pending or playing does nothing; `playClip` before any `cue` rejects `not-connected`.
- [ ] `reveal` mid-clip settles the clip `revealed` with no pause call and no seek; `reveal` when `ready` plays from `startMs`; `stop` and `cue` end it.
- [ ] Hidden mid-clip calls `pause` at the event time (not at the next poll) and settles `hidden`; hidden mid-reveal changes nothing.
- [ ] `not-ready`, a foreign-track state while holding, and a stalled clip each give `interrupted` with the right reason and settle the clip `interrupted`; the same events mid-cue do not.
- [ ] `play404Times: 1` is recovered inside `cue`; `2` rejects `device-lost`.
- [ ] A newer `cue` rejects the older with `superseded` and leaves the newer one ready; `disconnect` settles everything.
- [ ] `recover` after `interrupted` reconnects when needed, transfers, re-cues and ends `ready`.
- [ ] `setVolume` clamps to 0-1, is remembered by the restore, and during a cue takes effect at the restore; `audibleMs()` is 0 across a cue.
- [ ] A cue that fails after muting restores the volume and rejects `cue-failed`.

**Verify:** `npm test -- src/spotify/playback` → expect all playback suites passing; `npx biome check src/spotify`

### T15 — Status notes (orchestrator)

**Wave:** 6 · **Layer:** docs · **Requirement:** —
**Depends on:** T14
**Owns:** `specs/playback-adapter/spec.md`, `specs/playback-adapter/tasks.md`, `specs/app-v1/ROADMAP.md`, `.claude/skills/feature-dev/SKILL.md` (only if T4 added a rule)

**Do:** Mark the spec and tasks Implemented; mark ROADMAP item 3 implemented and link this spec; if T4 added a grit rule, update invariant 5's "Enforced by" cell in the same commit. Then hand the owner the live-check script (written to the scratchpad, **not** committed) and V1-V5; record the results under **Verified live** in the spec, and set ADR-0003 to Superseded if V1 fails.

**Done when:**
- [x] Wave gate clean: `npm run lint`, `npm run typecheck`, `npm test`, `npm test -- tools/invariants`, `npm run build`.
- [ ] V1-V5 recorded by the owner, or this item stays "Implemented, live check pending".

**Verify:** `npm run lint && npm run typecheck && npm test && npm run build`
