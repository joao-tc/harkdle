# Playback adapter (roadmap item 3) — spec

**Size:** Large (new shared contract between `spotify/`, `store/` and later `ui/`; the SDK-wrapper pattern; cue protocol from ADR-0001)
**Sub-phase:** logic (no screen. The Round, Reveal and "Play here" UI are item 5)
**Status:** Implemented, live check pending (V1–V5)
**Parent:** [specs/app-v1/ROADMAP.md](../app-v1/ROADMAP.md), item 3 (R6, R13, R14 detection, R18)
**Branch:** `feat/3/playback-adapter` (from `main`)

## Problem

The spike proved that a cued clip starts in about 19 ms, but its player and flows live on `spike/playback-latency` as measurement code with SDK types, a 90-line `runTrial` and no seam. The game loop (item 5) needs one small, SDK-free `PlaybackAdapter` it can drive and fake: cue a track, play a bounded clip, reveal, stop, set the volume, and learn when the device was lost or playback was taken over. This item extracts that adapter from the spike, with the cue protocol of [ADR-0001](../../docs/adr/0001-stack-and-playback.md), and a fake adapter so item 5's store can be tested without Spotify.

## Ambiguity ledger

The epic ledger (A1–A28) answers the rules. Rows below are the ones this item adds or narrows.

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| B1  | Does this item include any UI, store or composition-root wiring? | Resolved | **No.** Logic only, in `src/spotify/playback/`. Nothing consumes the adapter until item 5, so building it in `main.tsx` now would be dead code (same call as item 2's P-wiring). Item 5 wires it. |
| B2  | Which cue and command protocol? | Resolved | ADR-0001 rules 1–5 as the spike's final run used them: `PUT /me/player/play` at the start point → wait for *this track playing* → pause → wait for paused → seek to the start point (the **preSeek** flow). Every pause and seek is confirmed from the player state, with the Web API fallback after a 1.5 s grace. Tracks match by `uri` or `linked_from.uri`; state of any other track is ignored. A 404 on play reconnects the device and retries once. |
| B3  | What does **reveal** do (A5: "the song plays on from the clip start")? | Resolved | `reveal()` **continues** when a clip is playing (the end bound is dropped, no restart, no gap) and **starts from the round's start point** when the clip already ended. |
| B4  | What if **Play** is pressed while the post-clip re-cue (seek back) is still in flight? | Resolved | It is **remembered once** and starts the moment the cue settles. Pressing it again while one is pending, or while a clip plays, does nothing. The adapter exposes a status so the UI can show a brief busy state. |
| B5  | Does item 3 compensate for the clip-end overshoot tail? | Resolved | **No.** Clips end at the exact target by polling. A lead-time option is recorded as a follow-up, to be added only if M1 playtests find the tail unfair. No unused option in the interface. |
| B6  | How is the SDK layer proven live before any screen exists? | Resolved | Unit tests cover everything against fakes. Then the owner runs a **short devtools script, not committed**, in the dev server (Vite serves `/src` modules), and the results are recorded in this spec under **Verified live**, as P16 did for item 2. |
| B7  | The cue plays the clip's first seconds audibly until the pause lands. Is that leak acceptable? | Resolved | **No: mute during cue.** The adapter sets the SDK volume to 0 for the whole cue and restores the player's own volume once the paused, seeked state is confirmed (also on failure). The live check must confirm muting works and leaves the cue timing alone; if it doesn't, the spec records the fallback (accept the leak) before this item is done. |
| B8  | What does the adapter do on tab hidden (A24)? | Resolved | A **clip** stops at once (paused, confirmed) and ends with outcome `hidden`; **reveal audio keeps playing**. Visibility is injected (`Visibility`), so tests drive it. Not advancing the step is the store's job (item 5). |
| B9  | How is an interruption (A15) detected? | Resolved | By the SDK `not_ready` event, by a state that describes a foreign track or `null` while a cue is held, and by a command that never takes effect (timeout while the track is ours). The adapter moves to status `interrupted` with reason `device-lost` or `taken-over` and settles any in-flight clip with outcome `interrupted`. **Which SDK signals actually fire on a takeover is unverified** (see Needs verification), so detection must not depend on one event alone. |
| B10 | How does "Play here" (R13) restore playback? | Resolved | `recover()`: reconnect the device if it was lost, transfer playback to it (`PUT /me/player`, `play: false`), then re-cue the current target. Status ends `ready`. |
| B11 | Where does the Web API fallback traffic go? | Resolved | Through the existing `SpotifyApi` (token, 429 backoff, typed errors), extended with `put`. No second HTTP client. |
| B12 | How does the SDK script load? | Resolved | A loader inside `sdk/` injects `https://sdk.scdn.co/spotify-player.js` on first `connect()` and awaits `onSpotifyWebPlaybackSDKReady`. `index.html` is not touched. A load failure is a typed `sdk-load` error. |
| B13 | How is the SDK typed without leaking it (invariant 5)? | Resolved | `@types/spotify-web-playback-sdk` as a dev dependency (the spike used it), added to `tsconfig` `types`. Only `src/spotify/playback/sdk/**` may reference `Spotify`. The invariant check is extended to cover type-position uses and `window.Spotify` if Biome doesn't already flag them. |
| B14 | Which volume does the adapter start with? | Resolved | `connect({ volume })` takes it from the caller (0–1). Persisting it is item 6 (A16, R16). `setVolume` clamps to 0–1 and remembers the value so the cue's restore returns the *user's* volume. |
| B15 | What happens when a track will not cue (R: edge cases)? | Resolved | `cue()` rejects with `PlaybackError` kind `cue-failed` (timeout, `playback_error`, unplayable). The adapter does not skip or score anything; item 5 maps it to the engine's `trackFailed`. A 404 is retried once after a reconnect (B2) before it counts. |
| B16 | What if `cue()` is called while another cue or a clip is running? | Resolved | The newer call **supersedes**: whatever is playing is stopped, and the older `cue()` rejects with kind `superseded`. |

**Open: 0**

Category sweep: scope ✅ (B1, B5, out of scope below) · rules ✅ (A5, A15, A24 applied in B3, B8–B10; no new game rule) · layer ✅ (`src/spotify/playback/`, SDK types only in `sdk/`; `game/`, `store/`, `ui/` unchanged) · build order ✅ (item 0 merged; item 3 is independent of items 1 and 2, and item 5 depends on it) · data ✅ (all in memory; nothing persisted, so no schema version; volume persistence is item 6, B14) · time/random ✅ (`Clock {now, sleep}` injected, no ambient time in the engine's logic; no randomness. Start points come from the caller, A12/R20) · behavior ✅ (B3, B4, B8, B16; reload mid-game is A14, the browser's prompt) · errors ✅ (B9, B15, typed `PlaybackError`) · contracts ✅ (design: `PlaybackAdapter`, `PlayerTransport`, `SpotifyApi.put`) · platform ✅ (desktop Chrome, A4; the SDK needs a user gesture to connect) · non-functional ✅ (cue start about 19 ms, clip-end per ADR-0001; no new budget) · fairness ✅ (B7 closes the cue leak, the one way playback could hand out the answer) · done ✅ (B6)

## Needs verification (live, before this item is Done)

| # | Question | Why it matters |
| - | -------- | -------------- |
| V1 | Does `setVolume(0)` take effect before the Web API play lands, restore cleanly, and leave resume→first-position latency near 19 ms? | B7 and the roadmap's volume check. |
| V2 | Which SDK signal fires when playback is taken over by another device: `not_ready`, a `null` state, a foreign-track state, or nothing? | B9. If nothing fires, the timeout path is the only detector and the spec says so. |
| V3 | Does closing/disconnecting the device mid-clip produce `not_ready`, and does `recover()` bring it back? | B10, R13. |
| V4 | Does a hidden tab stop a clip within one frame of `visibilitychange`, and does reveal audio continue? | B8, R14. |
| V5 | Does `setVolume` mid-reveal change the audible level without a gap? | R18. |

## Requirements

Epic IDs are kept where this item delivers them. `B-` rows are this item's own.

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| B-1 | WHEN `cue({ uri, startMs })` is called THEN the adapter SHALL run the B2 sequence with the SDK volume at 0, and WHEN the paused, seeked state is confirmed THEN it SHALL restore the player's volume and report status `ready`. The volume SHALL be restored on every exit path, including failure. | P1 |
| B-2 | WHEN a pause or seek is issued THEN the adapter SHALL treat it as done only when the player state confirms it, and WHEN the SDK call is not confirmed within 1.5 s THEN it SHALL repeat it through the Web API. | P1 |
| B-3 | WHEN the player state describes a track other than the target (by `uri` or `linked_from.uri`) THEN the adapter SHALL ignore it for confirmation purposes. | P1 |
| R6  | WHEN `playClip(lengthMs)` is called on a `ready` adapter THEN it SHALL start playback through `resume()`, measure the clip from the first confirmed position change, and end it by polling the position against `origin + lengthMs`, pausing with confirmation, and settling with outcome `ended`. | P1 |
| B-4 | WHEN a clip ends, is stopped, or is hidden THEN the adapter SHALL return to the target's start point (re-cue by seek, confirmed) and report `ready` again, so replays are unlimited. | P1 |
| B-5 | WHEN `playClip` is called while that re-cue is in flight THEN the adapter SHALL start the clip when the cue settles (one pending request at most), and WHEN it is called while a clip or reveal is playing THEN it SHALL do nothing. | P1 |
| B-6 | WHEN `reveal()` is called while a clip plays THEN playback SHALL continue unbounded without a restart and the clip SHALL settle with outcome `revealed`, and WHEN the adapter is `ready` THEN playback SHALL start from the target's start point. `stop()` or `cue()` SHALL end a reveal. | P1 |
| R14 | WHEN the tab becomes hidden during a clip THEN the adapter SHALL stop the clip at once and settle with outcome `hidden`, and WHEN it becomes hidden during a reveal THEN playback SHALL continue. | P1 |
| R13 | WHEN the SDK reports `not_ready`, a foreign or `null` state while a cue is held, or a command times out while the track is ours THEN the adapter SHALL move to status `interrupted` (reason `device-lost` or `taken-over`) and settle an in-flight clip with outcome `interrupted`. WHEN `recover()` is called THEN it SHALL reconnect if needed, transfer playback to the device and re-cue, ending `ready`. | P1 |
| R18 | WHEN `setVolume(v)` is called THEN the SDK volume SHALL become `v` clamped to 0–1 and be remembered, and WHEN a cue is muting THEN it SHALL be applied when the cue restores. | P2 |
| B-7 | WHEN the SDK or a command fails THEN the adapter SHALL throw a typed `PlaybackError` of kind `sdk-load`, `initialization`, `authentication`, `account`, `device-lost`, `cue-failed`, `not-connected` or `superseded`, with a message. `account` and `initialization` are the Setup-error signals item 5 maps. | P1 |
| B-8 | WHEN a play command returns 404 THEN the adapter SHALL reconnect the device and retry the cue once, and WHEN that also fails THEN it SHALL reject with `device-lost`. | P1 |
| B-9 | WHEN `cue()` is called while another cue or clip runs THEN the older `cue()` SHALL reject with `superseded` and playback SHALL stop. | P1 |
| B-10 | WHEN item 5's tests need an adapter THEN `createFakeAdapter` SHALL implement `PlaybackAdapter` with scriptable clip endings, cue failures and interruptions, and record the calls it receives. | P1 |
| B-11 | WHEN code outside `src/spotify/playback/sdk/**` references `Spotify` (value or type position, or `window.Spotify`) THEN `npm run lint` SHALL fail, and `tools/invariants.test.ts` SHALL prove it. | P1 |

## Edge cases

- WHEN `connect()` is called twice THEN the second call SHALL resolve with the same connected device and create no second player.
- WHEN any command is called before `connect()` resolves THEN it SHALL reject with `not-connected`.
- WHEN `playClip` or `reveal` is called while the status is `idle` (nothing cued) or `interrupted` THEN it SHALL reject with `not-connected` or `device-lost` respectively, and play nothing.
- WHEN `stop()` is called with nothing playing THEN it SHALL resolve and change nothing.
- WHEN the state right after a track switch still describes the previous track THEN it SHALL be ignored (B-3), never read as a position.
- WHEN a cue fails after muting THEN the volume SHALL still be restored, and the thrown error SHALL be the cue's, not the restore's.
- WHEN `getCurrentState()` returns `null` before any track loads THEN waiting SHALL continue until the timeout.
- WHEN the access token expires during a clip THEN the next Web API fallback SHALL take a fresh token from `getAccessToken` (the SDK's `getOAuthToken` does the same).
- WHEN `disconnect()` is called THEN pending clip and cue promises SHALL settle (`interrupted` / `superseded`) and the status SHALL be `disconnected`.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Building the adapter in `main.tsx`, a playback store, the Round, Reveal, countdown and "Play here" UI | Item 5 (B1). |
| Mapping `account` / `initialization` errors to the Setup-error screens | Item 5 owns the store routing. |
| Skipping and replacing a track that fails to cue (`trackFailed`) | Item 5 (B15). The engine already has the action. |
| Persisting or restoring volume | Item 6 (B14). |
| Clip-end lead-time compensation | B5. Follow-up if playtests need it. |
| Random start, rerolls | Item 7. They call `cue()` again with a new `startMs`; nothing extra here. |
| Preloading the next track during the reveal | The SDK has no queue preload, and A5's countdown covers the cue. |
| Safari, Firefox, mobile | A4. |
| A committed playground page | B6. |

## Done when

- [x] `npm run typecheck`, `npm run lint` and `npm test` are green and `npm run build` succeeds.
- [x] The engine suite, run on a virtual clock against the fake transport, covers: cue with the SDK pause ignored (Web API fallback), relinked URIs, stale foreign-track state, 404 → reconnect → retry, clip end by polling, hidden mid-clip, hidden mid-reveal, reveal mid-clip, Play during re-cue, mute/restore on success and on failure, supersede, interruption, `recover()`, and `setVolume` during a cue.
- [x] `tools/invariants.test.ts` proves `Spotify` is flagged outside `src/spotify/playback/sdk/**` (value, type position, `window.Spotify`) and not inside it.
- [x] `createFakeAdapter` exists with its own test, ready for item 5.
- [x] Nothing outside `src/spotify/` and the manifest changes, and nothing is wired into `main.tsx`.
- [ ] **Verified live** (V1–V5 above) recorded in this spec by the owner after running the devtools script, with the mute fallback decided if V1 fails.

## Implementation notes

Choices made while implementing, where the spec was silent. Each is pinned by a test in `engine.test.ts`.

- **One pending slot** (B4) holds a `playClip` or a `reveal`. A `reveal()` behind a pending play is a no-op; a `playClip()` behind a pending reveal, or while revealing, resolves `revealed`. An explicit `cue()` settles a pending play as `stopped` so a request made against the old cue never plays the new one.
- **A Play queued during the re-cue** settles `hidden` when the tab was hidden in the meantime, instead of starting a clip in the background (R14).
- **Cues and re-cues are serialised**, so two sequences never interleave on the transport. The older `cue()` rejects `superseded` after the newer one is queued.
- A cue that fails with `device-gone` twice leaves the status `interrupted (device-lost)`, so `recover()` applies; other cue failures leave `idle`.
- `recover()` always emits `connecting → cueing → ready`; it reconnects only after `device-lost` or from `disconnected`. The target survives `disconnect()`.
- `setVolume` is remembered but not sent to the SDK while a cue is muting, while connecting, or while disconnected.
- `engine.ts` is about 560 lines. It is one state machine; it was not split.
- Invariant 5 needed one new rule: Biome's `noRestrictedGlobals` catches `Spotify` in value and type position, but not `window.Spotify`, so `rules/no-sdk-types.grit` covers `window.Spotify` and `globalThis.Spotify`.

## Verified live

Pending: run the V1–V5 script (kept out of the repo) and record the results here. If V1 fails, record the mute fallback and set ADR-0003 to Superseded before this item is Done.

| # | Result | Notes |
| - | ------ | ----- |
| V1 | — | |
| V2 | — | |
| V3 | — | |
| V4 | — | |
| V5 | — | |
