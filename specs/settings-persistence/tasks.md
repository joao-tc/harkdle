# Settings persistence — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** T1–T4 done; T5 live check pending

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 0 | — (orchestrator) | Branch `feat/6/settings-persistence` from `main`. Commit this spec folder. No ADR to land first. | `docs: add settings-persistence spec, design and tasks` |
| 1 | T1 | sequential — 1 subagent (the record, the parser and the test helper everything else uses) | `feat(store): add the versioned settings record` |
| 2 | T2, T3 | parallel — 2 subagents | one per task |
| 3 | T4 | sequential — integration in the composition root | `feat: load and save settings in main` |
| 4 | T5 (orchestrator) | live check, ROADMAP and spec status | `docs: mark settings-persistence implemented` |

Every `Verify` is `npm test -- <path>` plus `npx biome check <own files>`. Subagents never run `npm run dev`, `npm run build` or the full suite, and never edit `package.json`, `biome.json`, `main.tsx`, `App.tsx`, `game.ts`, `playlists.ts`, `session.ts` or any file they do not own. After each wave the orchestrator runs `npm run lint` → `npm run typecheck` → `npm test` → `npm test -- tools/invariants`, plus `npm run build` after wave 3.

Every brief carries: the task block, the design's signatures for its files (pasted, not linked), the spec rows it serves, the invariants (1–5), [coding-principles](../../.claude/skills/feature-dev/references/coding-principles.md), and the rule that tests use `memoryStorage()` and the existing fakes (`createHarness`, a fake `PlaylistsClient`, a fake `Auth`), never real `localStorage`, timers or network.

## Validation

**A — Granularity:** ✅ · **B — Dependencies:** ✅ · **C — File ownership:** ✅

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | one module (`createSettings` with its parser) + its suite + a 10-line test helper that three suites share | ⚠️ cohesive: the helper has no other home, and a task of its own would be an empty file |
| T2 | one connector + suite | ✅ Atomic |
| T3 | one connector (save on Continue and preselect share the same `settings` and `playlists` handles) + suite | ⚠️ two cohesive subscriptions in one file, both about the "last playlist" |
| T4 | wiring in the composition root | ✅ Atomic |
| T5 | docs and live check | ✅ Atomic (orchestrator) |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in an earlier wave? |
| ---- | ---------- | ---- | ---------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | T1 | 2 | ✅ |
| T3 | T1 | 2 | ✅ |
| T4 | T1, T2, T3 | 3 | ✅ |
| T5 | T4 | 4 | ✅ |

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | store | `src/store/settings.ts`, `src/store/settings.test.ts`, `src/store/settingsTestUtils.ts` | — |
| 2 | T2 | store | `src/store/settingsGame.ts`, `src/store/settingsGame.test.ts` | — |
| 2 | T3 | store | `src/store/lastPlaylist.ts`, `src/store/lastPlaylist.test.ts` | — |
| 3 | T4 | composition root | `src/main.tsx` | — |
| 4 | T5 | docs | `specs/app-v1/ROADMAP.md`, `specs/settings-persistence/*.md` | — |

## Tasks

### T1 — The versioned settings record

**Wave:** 1
**Layer:** store
**Requirement:** P-1, P-2, P-3
**Depends on:** —
**Owns:** `src/store/settings.ts`, `src/store/settings.test.ts`, `src/store/settingsTestUtils.ts`
**Reads:** `specs/settings-persistence/design.md` §Contracts and §Data, `src/spotify/auth.ts` (the `KeyValueStore` type and its `{ v: 1, … }` handling), `src/spotify/auth.test.ts` (how it fakes storage), `src/game/presets.ts`, `src/store/game.ts` (`DEFAULT_VOLUME`)

**Do:** Write `SETTINGS_KEY`, `DEFAULT_SETTINGS`, `Settings`, `SettingsHandle` and `createSettings(storage)` as in design.md, with the per-field parser, plus `memoryStorage()` (a `KeyValueStore` over a `Map`, with an option to make `getItem`/`setItem` throw) in `settingsTestUtils.ts`.

**Invariants:** 3 (type import from `spotify/auth` only; no React), 4 (this is the persisted shape: version check and corrupt reads as nothing saved), 1/2 n/a (not in `game/`).

**Done when:**
- [ ] A missing key, `"{"`, `"null"`, `"[]"`, `{"v":2,…}` and `{"v":"1"}` all load as `DEFAULT_SETTINGS` (P-1).
- [ ] With `v: 1`, each bad field falls back alone: `volume` 7 → 1, -3 → 0, `"loud"`/`null`/`NaN` → 0.8, `rounds` 7 → 10, `lastPlaylistId` `""`/`5` → `null`, and good fields beside them survive (P-2).
- [ ] `getItem` throwing loads the defaults, and `setItem` throwing is swallowed with `get()` still returning the updated value (P-3).
- [ ] `update` merges, writes `{ v: 1, volume, rounds, lastPlaylistId }` under `harkdle.settings`, and a second `createSettings` over the same storage reads it back.
- [ ] Tests written and passing; `biome check` clean on the three files.

**Verify:** `npm test -- src/store/settings` → expect all passing

### T2 — Game store ↔ settings

**Wave:** 2
**Layer:** store
**Requirement:** P-4, P-5
**Depends on:** T1
**Owns:** `src/store/settingsGame.ts`, `src/store/settingsGame.test.ts`
**Reads:** `specs/settings-persistence/design.md` §Contracts, `src/store/settings.ts`, `src/store/settingsTestUtils.ts`, `src/store/game.ts` (`GameStoreState`, `setVolume`, `setRounds`), `src/store/gameHarness.ts`, `src/store/leaveGuard.ts` (connector style)

**Do:** Write `connectSettingsToGame(settings, game)`: `setState({ volume, rounds })` from `settings.get()` now, then subscribe and call `settings.update` only when `volume` or `rounds` changed; return the unsubscribe.

**Invariants:** 3 (no React; the storage is behind `SettingsHandle`), 4 n/a (T1 owns the shape).

**Done when:**
- [ ] After connecting over a record `{ volume: 0.35, rounds: 5 }`, the game store holds 0.35 and 5, and the `connect` of the next `start` receives `{ volume: 0.35 }` (P-5).
- [ ] `setVolume(0.5)` and `setRounds(20)` each write the record (P-4).
- [ ] A stage change, a `start` and a round action write nothing: assert `setItem` is not called (P-4).
- [ ] `setVolume(7)` persists 1 (the store's clamp, not the raw value).
- [ ] After the returned unsubscribe, changes are not saved.
- [ ] Tests written and passing; `biome check` clean.

**Verify:** `npm test -- src/store/settingsGame` → expect all passing

### T3 — Last playlist: save on Continue, preselect on sign-in

**Wave:** 2
**Layer:** store
**Requirement:** P-6, P-7, P-8, P-9
**Depends on:** T1
**Owns:** `src/store/lastPlaylist.ts`, `src/store/lastPlaylist.test.ts`
**Reads:** `specs/settings-persistence/design.md` §Contracts and D4, `src/store/settings.ts`, `src/store/settingsTestUtils.ts`, `src/store/wiring.ts` and `wiring.test.ts` (how the session and playlists stores are built over fakes), `src/store/playlists.ts` (`list`, `selection`, `select`, `reset`), `src/store/session.ts` (`toSetup`, `toPicker`)

**Do:** Write `connectLastPlaylist({ settings, session, playlists })`: on the session going `signed-in` → `setup` with a `ready` selection call `settings.update({ lastPlaylistId })`; and, armed while `list` is `idle`, on the first `list` `ready` with selection `none` and the saved id in the list, call `select(summary)`, then disarm; return one unsubscribe for both.

**Invariants:** 3 (no React; the stores are passed in), 4 n/a.

**Done when:**
- [ ] Continue with a `ready` selection saves its id; Continue without one (selection `none`, `loading` or `error`) saves nothing (P-6).
- [ ] With a saved id in the list, the first `ready` list selects it and the selection reaches `ready` (P-7).
- [ ] A list refresh (`loadList` again), and a return from Setup to the Picker, do not preselect again (P-7).
- [ ] With a selection already made (a pasted link chosen first), nothing is preselected over it.
- [ ] A saved id missing from the list, and a `select()` that errors, change nothing and leave `lastPlaylistId` as saved (P-8).
- [ ] After `playlists.reset()` (logout) and a fresh list, it preselects again, and the saved id was never cleared (P-9).
- [ ] After the returned unsubscribe, neither behaviour runs.
- [ ] Tests written and passing; `biome check` clean.

**Verify:** `npm test -- src/store/lastPlaylist` → expect all passing

### T4 — Load and wire settings in `main.tsx` (integration)

**Wave:** 3
**Layer:** — (composition root)
**Requirement:** P-5, P-6, P-7
**Depends on:** T1, T2, T3
**Owns:** `src/main.tsx`
**Reads:** `src/store/settings.ts`, `src/store/settingsGame.ts`, `src/store/lastPlaylist.ts`

**Do:** After `game`, `playlists` and `session` exist and before `session.getState().boot()` and `createRoot`, build `createSettings(localStorage)` and call `connectSettingsToGame(settings, game)` and `connectLastPlaylist({ settings, session, playlists })`.

**Invariants:** 3 (the real `localStorage` is passed in only here, as for `auth`).

**Done when:**
- [ ] `npm run build` succeeds and `npm run lint` is clean.
- [ ] `boot()` and the first render come after both connectors.

**Verify:** `npm run typecheck && npm run lint && npm run build`

### T5 — Live check and docs (orchestrator)

**Wave:** 4
**Layer:** — (docs)
**Requirement:** all
**Depends on:** T4
**Owns:** `specs/app-v1/ROADMAP.md`, `specs/settings-persistence/spec.md`, `specs/settings-persistence/tasks.md`

**Do:** Run the Done-when browser flow from spec.md (desktop Chrome, `http://127.0.0.1:5173`, orchestrator-owned dev server). Mark item 6 "Implemented" in the ROADMAP row with a link to this spec, and add the live-check result, or "pending" if the owner hasn't run it.

**Done when:**
- [ ] Every step of the spec's browser flow was seen, or the unseen ones are named in the ROADMAP row.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm test -- tools/invariants` are green.
