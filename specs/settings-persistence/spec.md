# Settings persistence — spec

**Size:** Large (a persisted shape consumed by two stores and the composition root; small in code)
**Sub-phase:** logic (roadmap item 6. There is no visual half: the Picker and Setup already render store state, so nothing in `src/ui/` changes.)
**Parent:** [specs/app-v1/ROADMAP.md](../app-v1/ROADMAP.md), item 6 (R16, R18, A16, A27)
**Status:** Draft

## Problem

Volume, X and the playlist are forgotten on every reload, so each visit starts with the 80% default, X = 10 and an unselected Picker. Item 5b gave the game store `volume` and `rounds` as memory-only fields on purpose. This item saves them, and the last playlist, in versioned `localStorage` and loads them again on the next visit.

## Ambiguity ledger

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| S1  | What does "the last playlist is preselected" (A16) do? | Resolved | **Auto-select and load it**, through the same `select()` as a click. The cleaning summary appears and Continue is enabled with no click. |
| S2  | When is the last playlist's id saved? | Resolved | **On Continue** (Picker → Setup), only if the selection is `ready`. Browsing and misclicks never overwrite it. |
| S3  | Do mode and start type go in the record now? | Resolved | **No.** v1 holds `volume`, `rounds` and `lastPlaylistId`. Items 7 and 8 add `mode` and `start` as optional fields that default when missing, with no version bump. |
| S4  | A valid version but one bad field? | Resolved | **Per field.** That field falls back to its default (volume is clamped to 0–1 first). Only an unknown version, unparseable JSON or a non-object resets everything (R16). |
| S5  | Per browser or per Spotify account? | Resolved | **One shared record.** Logout leaves it alone. A playlist id from another account is simply not in the new list, so nothing is preselected. |
| S6  | `localStorage` throws on read or write? | Resolved | **Nothing is shown.** Reads give defaults, failed writes are swallowed, and the game runs from memory. |
| S7  | The saved playlist is missing from the list, or its load fails? | Resolved | **Ignore it and keep it saved.** Nothing is preselected and no error is shown for the preselect. The id is replaced on the next Continue. |
| S8  | Two tabs open? | Resolved | **Last write wins.** Settings load once at start and are written on change. There is no `storage` listener. |
| S9  | Split into logic and visual? | Resolved (ROADMAP) | **Logic only.** The roadmap row says "logic", and every control already exists. The live check in Done-when is the surface proof. |
| S10 | Key and shape? | Resolved (codebase) | One key, `harkdle.settings`, holding `{ v: 1, … }`. This mirrors `auth.ts` (`{ v: 1, …tokens }`) and invariant 4. |
| S11 | Write timing? | Resolved (codebase) | Synchronously on every change to a persisted field, and only when one of them changed. The game store changes constantly, so the writer compares fields. `localStorage` writes this small cost nothing, so there is no debounce. |

**Open: 0**

Category sweep: scope ✅ (S3, S5, out of scope below) · rules ✅ (no game rule changes; X fallback stays `pickRounds`) · layer ✅ (all in `src/store/`, plus `main.tsx` as composition root; `game/`, `spotify/` and `ui/` untouched) · build order ✅ (5b is merged; item 7/8 add fields later, S3) · data ✅ (S3, S4, S10: `{ v: 1, volume, rounds, lastPlaylistId }`) · time/random ✅ (none; no clock or RNG involved) · behavior ✅ (S1, S2, S7: preselect once per sign-in; logout keeps settings) · errors ✅ (S4, S6, S7) · contracts ✅ (`Settings`, `createSettings`, two connectors in design.md) · platform ✅ (desktop Chrome, A4) · non-functional ✅ (S11; a slider drag writes about one small string per input event) · fairness ✅ (n/a; devtools can edit the record and that doesn't matter, the values are validated on load) · done ✅

## Requirements

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| P-1 | (R16) WHEN settings are loaded THEN the system SHALL read `harkdle.settings` and use it only if it parses as an object with `v === 1`. A missing key, unparseable JSON, a non-object or any other `v` SHALL give the defaults (volume 0.8, X 10, no playlist). | P2 |
| P-2 | (S4) WHEN the record is valid but a field is not THEN only that field SHALL take its default: `volume` must be a finite number (clamped to 0–1), `rounds` must be one of the presets 5 / 10 / 20, `lastPlaylistId` must be a non-empty string. | P2 |
| P-3 | (R16, S6) WHEN `localStorage` throws on read or write THEN loading SHALL return the defaults and saving SHALL do nothing, with no error surfaced. | P2 |
| P-4 | (R18, S11) WHEN `volume` or `rounds` changes in the game store THEN the new values SHALL be saved. A change to any other game-store field SHALL NOT write. | P2 |
| P-5 | (R18, A16) WHEN the app starts THEN the game store SHALL hold the saved volume and X before the first render, so the slider and the X choice show them and `start` passes the saved volume to `connect`. | P2 |
| P-6 | (S2) WHEN the session screen goes from the Picker to Setup and the playlist selection is `ready` THEN its id SHALL be saved as `lastPlaylistId`. | P2 |
| P-7 | (S1) WHEN the playlist list first becomes `ready` after sign-in, the selection is `none`, and the saved id is in the list THEN the system SHALL `select()` that playlist. It SHALL happen at most once per sign-in, and a refresh of the list SHALL NOT trigger it. | P2 |
| P-8 | (S7) WHEN the saved id is not in the list, or `select()` ends in an error, THEN nothing SHALL be cleared or shown, and the saved id SHALL stay as it was. | P2 |
| P-9 | (S5) WHEN the user logs out THEN the saved record SHALL stay, and the next sign-in SHALL preselect again (P-7). | P2 |

## Edge cases

- WHEN the user picks another playlist (or pastes a link) before the preselect finishes THEN the user's choice wins. `select()` already lets the latest call win, and P-7 does nothing once the selection is not `none`.
- WHEN the user comes back from Setup to the Picker THEN the existing selection and list stay and nothing is preselected (the list is not `idle`, and the selection is not `none`).
- WHEN the stored X is larger than the chosen playlist allows (X = 20, 12 tracks) THEN the record keeps 20 and `pickRounds` shows and uses the largest enabled preset, as today.
- WHEN another tab wrote the record after this tab loaded THEN this tab's next change overwrites it whole (S8).
- WHEN a hand-edited record has `volume: 7` THEN it loads as 1; with `volume: "loud"` it loads as 0.8 (P-2).

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| `mode` and `start` fields, the Endless and Random choices | S3. Items 7 and 8 add them. |
| Any screen change, a "reset settings" control, a "can't save" notice | S6, S9. |
| Per-account records | S5. |
| Syncing between tabs | S8. |
| Game history, best scores, resuming a game | A14, A16. Settings are the only persisted data. |
| Persisting the Setup error, the Reveal accent or any in-game state | Not settings. |

## Done when

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm test -- tools/invariants` are green.
- [ ] Tests prove P-1 to P-4 and P-6 to P-9 against an in-memory `KeyValueStore` and the existing fakes, with no real storage.
- [ ] Live, in desktop Chrome on `http://127.0.0.1:5173`: set volume 35% and X = 5 on Setup, reload, and Setup shows both. Press Continue on a playlist, reload, and the Picker preselects it and loads its summary. In DevTools set the record's `v` to 2, reload, and everything is back to defaults. Set `volume` to `7`, reload, and the slider shows 100%. Log out and in, and the playlist is preselected again.
