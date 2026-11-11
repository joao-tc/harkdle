# Game loop (logic) — spec

**Size:** Large
**Sub-phase:** logic (roadmap item 5, first half. The screens are `specs/game-loop-visual/`, planned once this is merged and green.)
**Status:** Draft

## Problem

The engine (item 1), the playlists (item 2) and the playback adapter (item 3) all exist, but nothing joins them. Something has to own "which round are we in, is the clip playing, did the device get taken over, is the countdown still running", so the screens can be a thin projection of it. This half builds that owner as a headless store, tested against the fake adapter, so the visual half writes no rules.

## Ambiguity ledger

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| G1  | Item 5 is listed as "visual". Split it? | Resolved | **Yes.** `game-loop-logic` (this) then `game-loop-visual`. The store holds the rules worth testing (countdown, cue-failure skip, freeze, no double-apply, leave guard). The ROADMAP row becomes 5a / 5b. |
| G2  | Typed but un-picked text in a guess field? | Resolved | Ignored and shown with a "pick a suggestion" hint. It is "not submitted": no step is lost. The store only ever receives picked values, so the hint is the visual half's. |
| G3  | Enter in a guess field? | Resolved | Enter picks the highlighted suggestion while the list is open; otherwise it submits. Tab moves between fields. (Visual half.) |
| G4  | A way to abandon a game? | Resolved | **No.** Close the tab, or Give up each round. |
| G5  | Setup's Mode and Start controls in M1? | Resolved | **Shown disabled** (Endless and Random greyed out as "coming soon"). Visual half. |
| G6  | What runs before round 1 and after Play again? | Resolved | A "Connecting…" stage (connect if needed, cue track 1), then straight to the round. The 3-2-1 is only on Next between rounds. |
| G7  | Audio on Results? | Resolved | **Stops.** Next after the last round stops the song as Results opens. Play again cues round 1 directly. Change playlist and logout disconnect. |
| G8  | Default volume (memory only until item 6)? | Resolved | **80%.** |
| G9  | Submit / Skip / Give up while a clip plays? | Resolved | A submit or skip that **continues** the round stops the clip at once. An action that **ends** the round (complete, step 6, Give up) goes straight to the reveal, which continues the song. |
| G10 | Does the next step's clip auto-play? | Resolved | **No.** Play (or ⌥Space) for every clip (R6, A17). |
| G11 | What does the player see when a track fails to cue? | Resolved | The track is dropped and the next is cued. That round shows a dismissible notice: "A track couldn't be loaded and was skipped." Never scored as a miss. |
| G12 | What is "settled" for double-press (edge case)? | Resolved | After Submit / Skip / Give up, further round actions are **ignored until playback has settled** (adapter back to `ready`, or the reveal started). Key auto-repeat is always ignored. |
| G13 | Where do the SDK failures at Start go? | Resolved | A rejected `connect` returns to Setup's `idle` stage and the session shows the Setup error: `account` → `sdk-account`, `authentication` → `session-expired`, `initialization`, `sdk-load` and anything else → `sdk-init` (A3). |
| G14 | Does this half wire `main.tsx` and replace `SetupStandIn`? | Resolved | **No.** Same call as items 2 and 3 (adapter B1): a real adapter in `main.tsx` with no screen using it would be dead code. The visual half wires it. |
| G15 | Is an interruption on the Reveal or during the countdown shown as "Play here"? | Resolved | **No overlay there.** Only a frozen **round** needs one (R13). Next re-cues, which takes the device back; if that cue itself finds the device lost, the round opens frozen with the overlay. |
| G16 | Start point in M1? | Resolved | Always `startMs: 0` (Classic). Random start and rerolls add a per-round start in item 7. |
| G17 | Where does "round n/X" come from? | Resolved | `game.results.length + 1` while in a round. A dropped (failed-cue) track does not count. |
| G18 | ⌥R (reroll) now? | Resolved | **Not mapped.** Reroll is item 7 (R21). |

**Open: 0**

Category sweep: scope ✅ (G1, G4, G14, G18, out of scope below) · rules ✅ (A5–A13, A21 live in `game/`; this half restates none, G9–G12 are loop rules) · layer ✅ (store, one pure `game/` file, one fake-adapter extension, one session action) · build order ✅ (items 1–3 merged; item 6 is after the visual half) · data ✅ (nothing persisted: volume and X are memory only, so no schema version, invariant 4 n/a) · time/random ✅ (`sleep` and `newRng` injected; nothing in `game/` changes) · behavior ✅ (G6–G12, G15) · errors ✅ (G11, G13, Edge cases) · contracts ✅ (store state and actions in design.md) · platform ✅ (A4, desktop Chrome; headless here) · non-functional ✅ (latency lives in the adapter; the store adds no waits except the countdown) · fairness ✅ (n/a, single-player) · done ✅

## Requirements

Epic IDs are kept where this half delivers them. `G-` rows are this half's own.

| ID   | Requirement | Priority |
| ---- | ----------- | -------- |
| G-1  | WHEN `start` runs with the selected tracks THEN the store SHALL create a game (`rounds`, a fresh RNG from `newRng`), enter stage `connecting`, connect (idempotent), cue round 1 at `startMs: 0`, and enter stage `round` only once the cue resolved. | P1 |
| G-2  | WHEN `connect` rejects THEN the store SHALL discard the game, return to stage `idle`, and call `onStartFailed(error)`. The session SHALL map it to a Setup error (G13). | P1 |
| G-3  | (R6) WHEN `play` runs in stage `round` with the adapter `ready` THEN the store SHALL call `playClip(config.clipMs[step])` once. A `play` while the adapter is not `ready` SHALL be ignored. | P1 |
| G-4  | (R7) WHEN `submit`, `skip` or `giveUp` runs in stage `round` with the adapter `ready` or `playing-clip`, and none is already settling (G12), THEN the store SHALL apply `gameReducer`. If the result is the same object (empty submit, ended round) nothing else happens. If the round continues it SHALL `stop()` the adapter; if the round ended it SHALL move to stage `reveal` and call `reveal()`. | P1 |
| G-5  | (R14) WHEN a clip settles `hidden` THEN the store SHALL change nothing: the step and locks stay, and `play` works again once the adapter is `ready`. | P1 |
| G-6  | (R11) WHEN `next` runs in stage `reveal` and rounds remain THEN the store SHALL enter stage `countdown` (3, 2, 1 at 1000 ms per tick through `sleep`) while cueing the next track, and enter `round` only when both the countdown and the cue are done. If the cue is slower, the countdown stays at 1. | P1 |
| G-7  | (R12) WHEN `next` runs after the last round (or the queue ran out) THEN the store SHALL enter stage `finished` and `stop()` the adapter. `summarize(game)` supplies the Results data. | P1 |
| G-8  | WHEN `cue` rejects with `cue-failed` THEN the store SHALL dispatch `trackFailed`, set `skippedNotice`, and cue the replacement, repeating until one cues or the queue is exhausted (then stage `finished`, early). A cue that rejects `superseded` (a leave) SHALL stop all work. | P1 |
| G-9  | (R13) WHEN the adapter reports `interrupted` (or `disconnected` after Start) during stage `round` THEN `playback` SHALL be `interrupted`, round actions SHALL be ignored, and the step and locks SHALL stay as they were. `recover` SHALL call `adapter.recover()`; on success the adapter is `ready` again, on failure `recovery` is `failed` and the round stays frozen. | P1 |
| G-10 | WHEN a cue during the countdown rejects `device-lost` or `not-connected` THEN the store SHALL enter stage `round` with the round frozen (G-9), not skip the track. | P1 |
| G-11 | (R15) WHEN the page is about to unload while the stage is `connecting`, `countdown`, `round` or `reveal` THEN the leave guard SHALL ask the browser to confirm. In `idle` and `finished` it SHALL do nothing. | P1 |
| G-12 | (R17) WHEN a key event has `code` `Space` or `KeyS` with Alt and no other modifier, and is not a repeat, THEN `shortcutFor` SHALL return `play` or `skip`. Anything else, including ⌥R, SHALL return `null`. | P2 |
| G-13 | (A13) WHEN the usable count is known THEN `presetOptions` SHALL list 5 / 10 / 20 with those larger than the count disabled, and a chosen X that is disabled SHALL fall back to the largest enabled preset when the game starts. | P1 |
| G-14 | WHEN `playAgain` runs from stage `finished` THEN the store SHALL start a new game on the same tracks and X with a fresh RNG, through the same path as `start`. | P1 |
| G-15 | WHEN `leave` runs, or the session leaves its `setup` screen (logout, expiry), THEN the store SHALL disconnect the adapter, drop in-flight work, and return to stage `idle`, keeping X and volume. | P1 |
| G-16 | (R18) WHEN `setVolume` runs THEN the value SHALL be clamped to 0–1, kept, and forwarded to the adapter when it is connected. `start` SHALL pass it to `connect`. | P2 |

## Edge cases

- WHEN the first track fails to cue THEN the loop of G-8 runs before round 1 (the player stays on `connecting`).
- WHEN every track fails to cue THEN the game finishes with fewer rounds than X, possibly 0. The Results screen must cope with `roundsPlayed: 0`.
- WHEN `leave` runs while a cue, a countdown or a `start` is in flight THEN none of it may change the store afterwards.
- WHEN `start` is called outside stage `idle`, or `next` outside `reveal`, THEN nothing happens.
- WHEN the tab is hidden during a clip THEN the adapter stops it. The store sees only the `hidden` outcome (G-5).
- WHEN `submit` carries only blank fields THEN the engine returns the same state and the audio is untouched.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Every screen, the shortcut key handler, the `beforeunload` registration, the Play-here overlay, the accent colour, Spotify attribution on the Reveal | `specs/game-loop-visual/`. |
| `main.tsx` wiring (real adapter, `sleep`, `newRng` seed, `playerFailed`) and replacing `SetupStandIn` | G14. Visual half. |
| Remembering volume, X, mode, last playlist | Item 6 (A16, R16). |
| Random start, rerolls, ⌥R, Endless lives | Items 7 and 8. |
| A "Quit game" button | G4. |
| Resume after reload | A14. |

## Carried to the visual half (decided here, to be built there)

G2, G3, G5, G11 (the notice's wording and dismiss), G15 (no overlay off the Round). Still to ask there: feedback on a wrong submission, whether Give up asks to confirm, how the ladder bar and locked fields look, the Reveal layout. Verify there: that `i.scdn.co` artwork can be read for the accent colour (canvas needs CORS, unverified), and Spotify's artwork and linking rules on the Reveal (the Picker's table in `specs/playlist-loading-visual/spec.md` is the starting point).

## Done when

- [ ] `npm run lint`, `npm run typecheck` and `npm test` are green, and `npm test -- tools/invariants` still passes.
- [ ] The store's tests drive a whole 5-round game, plus each of G-2, G-5, G-8–G-10, G-12 and G-15, against `createFakeAdapter`, with a controllable `sleep` and a seeded `newRng`. No test uses a real timer.
- [ ] No file outside the listed ones changed, and `src/main.tsx` is untouched.
- [ ] No browser gate: there is no surface here. The first real-adapter run is the visual half's gate.
