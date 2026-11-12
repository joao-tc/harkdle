# Settings persistence — design

**Spec:** [spec.md](spec.md) · **ADRs:** none new (D1–D4 below fall under invariant 4 and the existing wiring pattern). Builds on [ADR-0002](../../docs/adr/0002-server-data-via-query-core-in-the-store.md).

## Approach

A small module reads and writes one versioned record. Two connector functions, in the style of `connectGameToSession` and `connectLeaveGuard`, attach it to the stores that already own the live values. The game store and the playlists store are **not edited**: the connectors apply the saved values with `setState` and subscribe for changes. `main.tsx` calls them before the first render.

```
 localStorage ──► createSettings ──get()──► connectSettingsToGame ──setState──► GameStore {volume, rounds}
 (harkdle.settings)    ▲   │ update(patch)        ▲ subscribe: volume/rounds changed ──┘
                       │   └◄─────────────────────┘
                       └◄── connectLastPlaylist ◄─ subscribe: session Picker→Setup  (save id)
                              └──► PlaylistsStore.select(summary)  ◄─ subscribe: list first ready (preselect)
```

## Layer placement

| New piece | Layer | Depends on | Keeps invariants? |
| --------- | ----- | ---------- | ----------------- |
| `store/settings.ts` (`Settings`, `DEFAULT_SETTINGS`, `createSettings`) | store | `game/presets` (`ROUND_PRESETS`, `DEFAULT_ROUNDS`), `store/game` (`DEFAULT_VOLUME`), the `KeyValueStore` type from `spotify/auth` | no React, no ambient `localStorage` (it is passed in), versioned (3, 4) ✅ |
| `store/settingsGame.ts` (`connectSettingsToGame`) | store | `settings`, `store/game` types | ✅ |
| `store/lastPlaylist.ts` (`connectLastPlaylist`) | store | `settings`, `store/session`, `store/playlists` types | ✅ |
| `store/settingsTestUtils.ts` (`memoryStorage`) | store (test helper) | `KeyValueStore` type | ✅ |
| `main.tsx` | composition root | the three above | the only place `localStorage` is passed in (already is, for auth) ✅ |

`game/`, `spotify/` and `ui/` are untouched. The store layer may import a type from `spotify/` (invariant 3 points `store → spotify`).

## Decisions

| # | Decision | Why / alternative rejected |
| - | -------- | -------------------------- |
| D1 | **A plain `createSettings` object, not a second Zustand store.** The game store stays the live source of truth for `volume` and `rounds`, and the playlists store for the selection. | Nothing would subscribe to a settings store, and a second copy of volume would have to be kept in sync with the first. Record load/save is the whole job. |
| D2 | **Connectors, with the stores unedited.** `setState({ volume, rounds })` applies the saved values once, at wiring time. | `setVolume` also calls the adapter, which is disconnected then. `start` already passes `get().volume` to `connect`. Editing `game.ts` would collide with item 7, which also extends it. |
| D3 | **One record, whole-record writes from memory.** `update(patch)` merges into the in-memory `Settings`, then writes `{ v: 1, …settings }`. | S8: last write wins, so no re-read before writing. Matches `auth.ts`. |
| D4 | **Preselect is armed while the playlists `list` is `idle` and fires on the first `ready`.** Then it disarms. `reset()` (logout) sets `idle`, which re-arms. | Gives "once per sign-in" (P-7) without a flag in the playlists store. A failed first load stays `error`, still armed, and a retry that succeeds preselects. The Picker's Refresh goes `ready → loading → ready` and is already disarmed. |

## Contracts

```ts
// store/settings.ts
export interface Settings {
	readonly volume: number;               // 0-1
	readonly rounds: number;               // 5 | 10 | 20 (a ROUND_PRESETS member)
	readonly lastPlaylistId: string | null;
}
export const SETTINGS_KEY = "harkdle.settings";
export const DEFAULT_SETTINGS: Settings;   // { volume: DEFAULT_VOLUME, rounds: DEFAULT_ROUNDS, lastPlaylistId: null }

export interface SettingsHandle {
	get(): Settings;                       // the in-memory copy, loaded once
	update(patch: Partial<Settings>): void; // merge, then write; a write that throws is swallowed
}
export function createSettings(storage: KeyValueStore): SettingsHandle;

// store/settingsGame.ts
/** Applies settings.get() volume and rounds to the game store now, then saves them when either changes. Returns the unsubscribe. */
export function connectSettingsToGame(settings: SettingsHandle, game: StoreApi<GameStoreState>): () => void;

// store/lastPlaylist.ts
/** Saves the selected id when the session goes signed-in → setup (selection ready), and preselects the saved one (D4). Returns the unsubscribe. */
export function connectLastPlaylist(deps: {
	settings: SettingsHandle;
	session: StoreApi<SessionState>;
	playlists: StoreApi<PlaylistsState>;
}): () => void;
```

**Parsing (P-1, P-2).** `JSON.parse` inside `try`; anything that is not an object with `v === 1` returns `DEFAULT_SETTINGS`. Then per field: `volume` is `typeof number && Number.isFinite` → clamp 0–1, else default; `rounds` is in `ROUND_PRESETS` else default; `lastPlaylistId` is a non-empty string else `null`. `getItem` is also inside the `try` (P-3).

**Change detection (P-4).** `connectSettingsToGame` subscribes to the game store and calls `update` only when `state.volume !== prev.volume` or `state.rounds !== prev.rounds`. `update` writes the fields it was given plus the rest of the in-memory record.

## Data and versioning

The record is `{ "v": 1, "volume": 0.35, "rounds": 5, "lastPlaylistId": "37i9…" }` under `harkdle.settings`. Items 7 and 8 add optional `mode` and `start` and parse them per field with defaults (S3), so no version bump is needed for them. A real shape change later bumps `v`, and old records read as "nothing saved" (invariant 4).

## Requirement trace

| Requirement | Where |
| ----------- | ----- |
| P-1, P-2, P-3 | `settings.ts` parse and `createSettings` |
| P-4, P-5 | `connectSettingsToGame`, wired before render in `main.tsx` |
| P-6, P-7, P-8, P-9 | `connectLastPlaylist` |
