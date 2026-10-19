# Playback latency spike — tasks

**Spec:** `specs/playback-spike/spec.md` · **Design:** none (Medium; the only contract is `SdkPlayer`, defined in T3)
**Status:** Draft

## Gates for this spike (profile is TBD, so these are the spike's own)

| Gate | Command |
| ---- | ------- |
| Typecheck | `npx tsc --noEmit` |
| Test | `npx vitest run` (one suite: `npx vitest run src/<file>.test.ts`) |
| Build | `npx vite build` |

T0 creates the scripts, and later tasks use them as `npm run typecheck` / `npm test`. These are the spike's own gates and don't fill in the Project profile.

**Invariants that apply:** 1 (stats, run plan and flow orchestration import no DOM or SDK types), 2 (clock and RNG injected into the harness; `performance.now()` and the seeded RNG are only constructed in `main.ts`). Invariants 3 and 4 don't apply to throwaway code.

## Execution plan

| Wave | Tasks          | Mode                              |
| ---- | -------------- | --------------------------------- |
| 0    | T0             | sequential — scaffold, owns the manifest |
| 1    | T1, T2, T3, T4 | parallel — 4 subagents            |
| 2    | T5, T6         | parallel — 2 subagents            |
| 3    | T7             | sequential — integration          |
| —    | **M1**         | **you run the measurement** (human gate) |
| 4    | T8, T9         | parallel — 2 subagents (after real data) |

## Validation

**A — Granularity:** ✅ · **B — Dependencies:** ✅ · **C — File ownership:** ✅

**A — Granularity**

| Task | Scope                                           | Verdict |
| ---- | ----------------------------------------------- | ------- |
| T0   | scaffold (manifest, config, html shell, env)    | ✅ Atomic (integration/touchpoint) |
| T1   | PKCE login + token refresh                      | ⚠️ Two cohesive things in one module (login, refresh share the token store) |
| T2   | stats + run-plan generation                     | ⚠️ Two cohesive pure modules, one file each |
| T3   | SDK player wrapper (`SdkPlayer`)                | ✅ Atomic |
| T4   | Web API playlist check                          | ✅ Atomic |
| T5   | flow orchestration (3 flows) with fake player   | ✅ Atomic |
| T6   | trial-set picker (stratified, seeded)           | ✅ Atomic |
| T7   | page wiring (UI + results table + JSON)         | ✅ Atomic (integration) |
| T8   | findings note + draft ADR-0001                  | ✅ Atomic (docs) |
| T9   | `PlaybackAdapter` interface extracted           | ✅ Atomic |

**B — Dependencies**

| Task | Depends on | Wave | Deps in earlier wave? |
| ---- | ---------- | ---- | --------------------- |
| T0   | —          | 0    | ✅ |
| T1   | T0         | 1    | ✅ |
| T2   | T0         | 1    | ✅ |
| T3   | T0         | 1    | ✅ |
| T4   | T0         | 1    | ✅ |
| T5   | T2, T3     | 2    | ✅ |
| T6   | T2, T4     | 2    | ✅ |
| T7   | T1–T6      | 3    | ✅ |
| T8   | M1         | 4    | ✅ (human gate) |
| T9   | T3, M1     | 4    | ✅ |

**C — File-ownership disjointness**

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 0 | T0 | integration | `package.json`, lockfile, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.env.example` | — |
| 1 | T1 | spike | `src/auth.ts`, `src/auth.test.ts` | — |
| 1 | T2 | spike (pure) | `src/stats.ts`, `src/stats.test.ts`, `src/runPlan.ts`, `src/runPlan.test.ts` | — |
| 1 | T3 | spike | `src/sdkPlayer.ts` | — |
| 1 | T4 | spike | `src/playlistCheck.ts`, `src/playlistCheck.test.ts` | — |
| 2 | T5 | spike (pure) | `src/flows.ts`, `src/flows.test.ts` | — |
| 2 | T6 | spike (pure) | `src/trialSet.ts`, `src/trialSet.test.ts` | — |
| 3 | T7 | integration | `src/main.ts`, `src/style.css` | — |
| 4 | T8 | docs | `docs/spike-playback-latency.md`, `docs/adr/0001-stack-and-playback.md` | — |
| 4 | T9 | docs | `src/playbackAdapter.ts` | — |

## Tasks

### T0 — Scaffold Vite + TS project

**Wave:** 0 · **Layer:** integration · **Requirement:** R1 (prerequisite)
**Depends on:** — · **Owns:** files in table C wave 0 · **Reads:** `harkdle_techstack_and_hosting.md` §Running locally
**Do:** Create a vanilla-TS Vite project with dev deps `vite`, `typescript`, `vitest`, `@types/spotify-web-playback-sdk`; scripts `dev`, `build`, `typecheck`, `test`; Vite server `{ host: '127.0.0.1', port: 5173, strictPort: true }`; `index.html` that loads the SDK script `https://sdk.scdn.co/spotify-player.js` and `/src/main.ts`; `.gitignore` covering `node_modules`, `dist`, `.env`.
**Done when:** `npm install && npm run typecheck && npm run build` succeed (empty `src/main.ts` stub allowed here only because T7 owns it and the script needs an entry; no other placeholders).
**Verify:** `npm run typecheck && npm run build`

### T1 — PKCE login and token refresh

**Wave:** 1 · **Layer:** spike · **Requirement:** R1, R2, edge case (localhost banner check helper)
**Depends on:** T0 · **Owns:** `src/auth.ts`, `src/auth.test.ts` · **Reads:** spec §R1, R2
**Do:** Export `startLogin()`, `handleCallback()` (reads `?code=`, exchanges it, then cleans the URL), `getAccessToken()` (refreshes when under 60s left), `isLoopbackHost()`. Code verifier/challenge via Web Crypto; `fetch` and `now` injected for tests.
**Invariants:** 2 (clock injected).
**Done when:**
- [ ] Verifier/challenge generation and the refresh-window logic are unit tested with injected `fetch` and `now`
- [ ] Scopes are exactly those in R1
**Verify:** `npx vitest run src/auth.test.ts`

### T2 — Stats and run plan (pure)

**Wave:** 1 · **Layer:** spike (pure) · **Requirement:** R8, R11
**Depends on:** T0 · **Owns:** `src/stats.ts`, `src/stats.test.ts`, `src/runPlan.ts`, `src/runPlan.test.ts` · **Reads:** spec §A5, R6
**Do:** `summarize(values)` → median/IQR/min/max; `evaluateCell(runs)` → pass/fail per A5 (IQR of resume→first-position ≤150ms and max overshoot ≤100ms; failures reported separately); `makeRunPlan(trackIds, flows, clipLengths, runsPerCell, rng)` → interleaved shuffled plan.
**Invariants:** 1, 2 (no DOM; RNG injected).
**Done when:**
- [ ] Even and odd sample counts, a single sample and an empty set are tested
- [ ] The plan has exactly 20 runs per cell for 9 cells and is deterministic for a fixed seed
**Verify:** `npx vitest run src/stats.test.ts src/runPlan.test.ts`

### T3 — SDK player wrapper

**Wave:** 1 · **Layer:** spike · **Requirement:** R3, R7
**Depends on:** T0 · **Owns:** `src/sdkPlayer.ts` · **Reads:** Web Playback SDK docs (verify method names against `@types/spotify-web-playback-sdk` before use)
**Do:** Export an `SdkPlayer` interface (`connect()`, `playFrom(uri, positionMs)`, `pause()`, `resume()`, `seek(ms)`, `getPositionMs()`, `onState(cb)`) and its real implementation over `Spotify.Player`, using `getOAuthToken` from `auth.getAccessToken` (passed in, not imported). `connect()` resolves on `ready` and transfers playback via `PUT /me/player`. `playFrom` calls the Web API `PUT /me/player/play` with `position_ms`.
**Invariants:** the interface is free of SDK types so T5 can fake it.
**Done when:**
- [ ] Typecheck passes
- [ ] No tests (needs DRM and a live account); verified end to end in M1
**Verify:** `npm run typecheck`

### T4 — Playlist item check

**Wave:** 1 · **Layer:** spike · **Requirement:** R4, R5
**Depends on:** T0 · **Owns:** `src/playlistCheck.ts`, `src/playlistCheck.test.ts` · **Reads:** spec §R4, R5, validation-review.md item 1 and 2
**Do:** `fetchAllItems(playlistId, getToken, fetch)` paginates `GET /playlists/{id}/items?market=from_token&limit=100`; `describeItems(items)` normalizes `item`/`track`, flags `is_playable`, `linked_from`, `is_local`, `type`, ISRC, duration, and returns a field-presence report that never throws on missing fields.
**Done when:**
- [ ] Unit tests with fixtures for: old `track` shape, new `item` shape, episode, local file, missing `is_playable`, relinked track, 2-page pagination
**Verify:** `npx vitest run src/playlistCheck.test.ts`

### T5 — Flow orchestration (3 flows)

**Wave:** 2 · **Layer:** spike (pure) · **Requirement:** R6, R7, R10
**Depends on:** T2, T3 · **Owns:** `src/flows.ts`, `src/flows.test.ts` · **Reads:** `src/sdkPlayer.ts` (interface only), `src/stats.ts`
**Do:** `runTrial(player, clock, plan entry)` for cold, pre-seek and preloaded flows; end of clip by polling `getPositionMs()`; records `resumeToFirstPositionMs` and `endOvershootMs`; 5s timeout and error capture; flags runs overlapping a hidden tab period (visibility signal injected).
**Invariants:** 1, 2 (imports only the `SdkPlayer` interface; clock injected).
**Done when:**
- [ ] A fake player with scripted latency yields the expected metrics for each flow
- [ ] Timeout, unplayable track and hidden-tab runs are recorded as failed or flagged and don't stop the batch
**Verify:** `npx vitest run src/flows.test.ts`

### T6 — Trial-set picker

**Wave:** 2 · **Layer:** spike (pure) · **Requirement:** A11
**Depends on:** T2, T4 · **Owns:** `src/trialSet.ts`, `src/trialSet.test.ts` · **Reads:** `src/playlistCheck.ts` (types), `src/runPlan.ts`
**Do:** `pickTrialSet(items, rng, n = 20)` selects playable tracks (excluding episodes and local files; one per ISRC), stratified by duration with the shortest and longest included, and assigns each a start point at a seeded position in 10–70% of duration, clamped so that start + 2s + margin fits for short tracks.
**Invariants:** 1, 2.
**Done when:**
- [ ] Tests cover fewer than 20 playable tracks (returns what exists, reports the shortfall), duplicate ISRC, a short track and determinism for a fixed seed
**Verify:** `npx vitest run src/trialSet.test.ts`

### T7 — Page wiring (integration)

**Wave:** 3 · **Layer:** integration · **Requirement:** R1–R9, edge cases
**Depends on:** T1–T6 · **Owns:** `src/main.ts`, `src/style.css` · **Reads:** all `src/*.ts` from T1–T6
**Do:** Login button and `localhost` banner, start-player button (user gesture), playlist input + "check playlist" report, "run measurement" with progress, results table per cell with pass/fail, and a JSON download. Constructs `performance.now()` and the seeded RNG here and injects them.
**Done when:**
- [ ] `npm run typecheck && npm test && npm run build` green
- [ ] Driven in Chrome at `127.0.0.1:5173`: login completes, the player reports a device ID, the playlist check prints a report (**this part needs you; see M1**)
**Verify:** `npm run typecheck && npm test && npm run build`

### M1 — Run the measurement (you, not a subagent)

Follow the manual setup in the spec, then in Chrome at `http://127.0.0.1:5173`: log in → start player → check playlist → run the 180-run measurement (tab focused, nothing else playing) → download the JSON. Optionally let it run a second time if the first result is borderline.

### T8 — Findings note and draft ADR-0001

**Wave:** 4 · **Layer:** docs · **Requirement:** spec §Done when
**Depends on:** M1 · **Owns:** `docs/spike-playback-latency.md`, `docs/adr/0001-stack-and-playback.md` · **Reads:** the downloaded JSON, `src/stats.ts`, `references/adr-authoring.md`
**Do:** Findings: a per-cell table, the verdict per clip length against A5, the `market`/`is_playable` and `/items` result with real field names. ADR-0001 (status `Proposed`): the stack from the tech-stack doc, plus the spike's constraints (scopes, `market=from_token`, adapter seam, locked clip ladder or fallback). Fill in the feature-dev Project profile gates as a follow-up for you to approve.
**Done when:** every number in the note traces to the JSON; the ADR passes the scope test.
**Verify:** reread by the orchestrator against the JSON.

### T9 — `PlaybackAdapter` interface

**Wave:** 4 · **Layer:** docs/contract · **Requirement:** A4
**Depends on:** T3, M1 · **Owns:** `src/playbackAdapter.ts` · **Reads:** `src/sdkPlayer.ts`, `src/flows.ts`, findings note
**Do:** Extract the smallest interface the winning flow needs (for example `prime`, `playClip(lengthMs)`, `onClipEnded`) with the measured latency compensation as a documented option, free of SDK types. Written only after M1 shows which flow works, so it isn't speculative.
**Done when:** `npm run typecheck` passes and the interface is implemented by the spike's `SdkPlayer` wrapper or a thin adapter in the same file.
**Verify:** `npm run typecheck`

## Hand-off

After T8/T9: create a fresh branch from `main`, then `git checkout spike/playback-latency -- docs/spike-playback-latency.md docs/adr/0001-stack-and-playback.md src/playbackAdapter.ts` and commit. The spike branch is left as is.
