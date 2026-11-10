# Playlist loading, visual half — design

**Spec:** [spec.md](spec.md) · **Logic design:** [../playlist-loading-logic/design.md](../playlist-loading-logic/design.md) · **ADRs:** none new (ADR-0002 governs the store; nothing here is expensive to reverse)

## Approach

`ui/` renders the playlists store and writes no rules. One container, `PlaylistPicker`, reads `list`, `paste` and `selection` and hands each child exactly the slice it draws: a `PlaylistGrid` of `PlaylistCard`s, a `PlaylistPasteBox`, a sticky `SelectionBar`, and a `SpotifyAttribution` footer. Every user-facing sentence comes from one pure module, `pickerCopy.ts`, so wording is reviewable in one place and testable without a DOM. Navigation to the stand-in Setup is the session store's `Screen` (A1). A small `store/wiring.ts` ties the two stores together (reset on leaving the signed-in screens), and `main.tsx` builds the real client and store, the only place `fetch` and `setTimeout` are passed in.

## Layer placement

| New piece | Layer | Depends on | Keeps invariants? |
| --------- | ----- | ---------- | ----------------- |
| `Screen` `setup` + `toSetup()` / `toPicker()` in `store/session.ts` | store | nothing new | no React ✅ |
| `store/wiring.ts` (`connectPlaylistsToSession`) | store | `session.ts`, `playlists.ts` | no React; reads both stores' state only ✅ |
| `ui/pickerCopy.ts` | ui (pure) | store types (`CleaningReport`, `ApiErrorKind`, …) | imports only `@/store/*` ✅ |
| `ui/PlaylistCard.tsx`, `PlaylistGrid.tsx`, `PlaylistPasteBox.tsx`, `SelectionBar.tsx`, `SpotifyAttribution.tsx`, `SetupStandIn.tsx`, `PlaylistPicker.tsx` | ui | store types, primitives, `pickerCopy` | never import `spotify/` ✅ |
| `ui/primitives/{input,badge,skeleton,progress}.tsx` | ui (generated) | radix-ui | excluded from Biome by config ✅ |
| `App.tsx`, `main.tsx` | composition | everything above | `main.tsx` stays the only place real `fetch`, `Date.now`, `localStorage`, `location` and `setTimeout` appear ✅ |
| `ui/assets/spotify-logo-white.svg` | ui asset | provided by the owner (G2) | n/a |

`src/game/` and `src/spotify/` are untouched. No barrels. `SignedInShell.tsx` is deleted (the Picker replaces it).

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| `PlaylistsState`, `Selection`, `ListState`, `PasteState`, `PlaylistSummary`, `CleaningReport`, `ApiErrorKind` | `src/store/playlists.ts` | The only data types `ui/` sees. |
| `createPlaylistsStore`, `createPlaylistsClient`, `createSpotifyApi` | store / spotify | Built once in `main.tsx`. |
| `Button`, `Card`, `Alert` | `src/ui/primitives/` | Bar, stand-in, error states. |
| `useStore(store, selector)` | `zustand`, used in `App.tsx` | Same pattern in the Picker. |
| `COPY` map style, `// @vitest-environment jsdom` + RTL | `SetupErrorScreen.tsx`, its test | Mirror for copy and component tests. |
| `harness()` style fakes | `session.test.ts`, `playlists.test.ts` | Fake `PlaylistsClient` for UI tests (each test file builds its own; no shared fixture file). |
| `session.expire()` | `store/session.ts` | Passed as `onUnauthorized`. |

## Interfaces

### `store/session.ts` (T1)

```ts
export type Screen =
	| { name: "booting" } | { name: "login" } | { name: "checking" }
	| { name: "setup-error"; error: SetupErrorKind; detail?: string }
	| { name: "signed-in"; user: AccountUser }   // the Picker (name kept; item 5 adds screens)
	| { name: "setup"; user: AccountUser };      // stand-in until item 5

export interface SessionState {
	// …existing
	toSetup(): void;   // only from "signed-in": → { name: "setup", user }; otherwise a no-op (idempotent)
	toPicker(): void;  // only from "setup": → { name: "signed-in", user }; otherwise a no-op
}
```

`retry`/`check` behaviour is unchanged. `logout()` and `expire()` work from `setup` too.

### `store/wiring.ts` (T6)

```ts
import type { StoreApi } from "zustand/vanilla";
import type { PlaylistsState } from "./playlists";
import type { SessionState } from "./session";

// The signed-in user's id while the screen is "signed-in" or "setup", else null.
export function signedInUserId(session: StoreApi<SessionState>): string | null;

// Resets the playlists store whenever the session screen leaves "signed-in"/"setup".
// Returns the unsubscribe function.
export function connectPlaylistsToSession(
	session: StoreApi<SessionState>,
	playlists: StoreApi<PlaylistsState>,
): () => void;
```

### `ui/pickerCopy.ts` (T3), pure

```ts
import type { ApiErrorKind, CleaningReport, Selection } from "@/store/playlists";

export const OPEN_SPOTIFY_URL = "https://open.spotify.com/";
export const playlistUrl = (id: string): string => `https://open.spotify.com/playlist/${id}`;

export function cleaningSummary(report: CleaningReport): string;        // V14
export function loadingText(loaded: number, total: number): string;     // "Loading 120 of 412 tracks…"
export function tooFewText(usable: number, needed: number): string;
export function errorText(
	error: ApiErrorKind | "invalid-link",
	context: "list" | "selection" | "paste",
): string;                                                               // the Copy table
export function restrictedPasteText(name: string, ownerName: string): string;
export const EMPTY_LIST_TEXT: string;
export const ATTRIBUTION_TEXT: string;
```

### Components (props are the contract; each file exports one component)

```ts
// PlaylistCard.tsx (T7) — a <li>: a <button aria-pressed> (cover, name, owner, count, Collaborative badge)
// plus a sibling <a> "OPEN SPOTIFY". Cover: square box, object-contain, rounded-[8px], nothing over it.
PlaylistCard(props: { summary: PlaylistSummary; selected: boolean; onSelect: (s: PlaylistSummary) => void })

// PlaylistPasteBox.tsx (T8) — input + "Look up" (Enter submits); draws loading/restricted/error text only.
// The "found" card is rendered by PlaylistPicker, not here.
PlaylistPasteBox(props: { paste: PasteState; onLookup: (input: string) => void })

// SelectionBar.tsx (T9) — sticky bottom bar, role="status" aria-live="polite".
// none: hint text · loading: name + Progress + loadingText · ready: name + cleaningSummary + (too-few text) ·
// error: errorText + Reload. Always: Reload (when a playlist is selected) and Continue (enabled only when ready && gate.ok).
SelectionBar(props: { selection: Selection; onContinue: () => void; onReload: () => void })

// SpotifyAttribution.tsx (T4) — white full logo (≥70 px wide) + ATTRIBUTION_TEXT, padded by half the icon height.
SpotifyAttribution(props: Record<string, never>)

// SetupStandIn.tsx (T5) — Card: playlist name, "N usable tracks", Back.
SetupStandIn(props: { summary: PlaylistSummary; usable: number; onBack: () => void })

// PlaylistGrid.tsx (T10) — list states (skeletons / error + Retry / empty / grid), Show more (20 at a time),
// Refresh icon-button in its heading row, trailing OPEN SPOTIFY link. Matches selection by id.
PlaylistGrid(props: {
	list: ListState; selectedId: string | null;
	onSelect: (s: PlaylistSummary) => void; onRefresh: () => void;
})

// PlaylistPicker.tsx (T11) — the screen. Header (signed-in name, Log out), paste box, found card,
// grid, SelectionBar, SpotifyAttribution. Calls loadList() on mount when list is idle/error (V11).
PlaylistPicker(props: {
	user: AccountUser; playlists: StoreApi<PlaylistsState>;
	onContinue: () => void; onLogout: () => void;
})
```

### `App.tsx` and `main.tsx` (T12)

```ts
App(props: { session: StoreApi<SessionState>; playlists: StoreApi<PlaylistsState>; devUrl: string })
// "signed-in" → <PlaylistPicker … onContinue={session.toSetup} />
// "setup" → selection ready ? <SetupStandIn … onBack={session.toPicker} /> : <PlaylistPicker …>
```

`main.tsx` additions: `sleep = (ms) => new Promise((r) => setTimeout(r, ms))`; `api = createSpotifyApi({ getAccessToken: () => auth.getAccessToken(), fetchFn, sleep })`; `playlists = createPlaylistsStore({ client: createPlaylistsClient(api), getUserId: () => signedInUserId(session), onUnauthorized: () => session.getState().expire() })`; `connectPlaylistsToSession(session, playlists)`.

## Data model

No new persisted state, so no schema version (invariant 4 n/a). UI-local state only: the grid's visible count (starts at 20), the paste box's input text, and nothing else. Selection, list and paste state are the store's.

## Layout (single column, desktop Chrome, about 1280×800)

```
┌───────────────────────────────────────────────┐
│ harkdle                  Signed in as Ada [Log out]
│ Paste a playlist link  [______________] [Look up]
│   (message, or the found card)
│ Your playlists                         [⟳ Refresh]
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐   responsive grid, 2–5 columns
│ │cover│ …                       cards: cover, name, owner · N tracks,
│ └────┘                          [Collaborative], OPEN SPOTIFY
│ [Show more]   OPEN SPOTIFY →
│ ( Spotify logo )  Playlist data and artwork from Spotify
├───────────────────────────────────────────────┤  ← sticky
│ Name · 412 usable · 9 removed (…)   [Reload] [Continue]
└───────────────────────────────────────────────┘
```

Selection is a ring/border on the card, never an overlay on the cover. The page reserves bottom padding so the bar never covers the footer.

## Error handling

| Situation | Behaviour |
| --------- | --------- |
| Any `ApiErrorKind` on list / selection / paste | `errorText(kind, context)` with Retry (Refresh / Reload / Look up). |
| `unauthorized` | Store calls `onUnauthorized` → `session.expire()` → `session-expired` screen; the wiring then resets the playlists store. |
| Cover URL fails to load | The image keeps its box; `onError` swaps in the placeholder block. |
| `selection.status === "ready"` with `gate.ok === false` | Continue disabled, `tooFewText`. |
| Setup reached without a ready selection | Falls back to the Picker. |

## Decisions

| #   | Decision | Alternatives | Why | ADR? |
| --- | -------- | ------------ | --- | ---- |
| E1  | Picker is `Screen` `signed-in`; add `setup`, no rename | Rename to `picker` | A rename breaks `App.tsx` between waves and gains nothing; item 5 adds the real screens. | no |
| E2  | One pure `pickerCopy.ts` | Strings inline in components | Wording is reviewed (V10) and tested in one place. | no |
| E3  | The found paste card is rendered by `PlaylistPicker`, not the paste box | Box renders the card | Keeps the box independent of the card (parallel build) and puts the "same card as grid" rule in one place. | no |
| E4  | Card is a `<li>` with a `<button>` plus a sibling `<a>` | A clickable `<div>` containing a link | Nested interactive elements are invalid and break keyboard use. | no |
| E5  | Wiring lives in `store/wiring.ts` | Inline in `main.tsx` | `main.tsx` can't be unit-tested; logout-resets-store is a V-7 requirement. | no |
| E6  | `loadList()` on mount only when idle/error | Always on mount | Back from Setup should not blank the grid or refetch (V11). | no |
| E7  | White logo, plain background | Green logo | The theme isn't black; the guideline restricts green to black or white. | no |
| E8  | No search or sort | Add filter box | Not in A19; the 20-item cap keeps the page short. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| R2 | T10 grid, T8 paste box, T11 picker (found card) |
| R3 | T3 `cleaningSummary`, T9 bar |
| R4 | T9 bar (`tooFewText`, Continue disabled) |
| V-1 | T10 |
| V-2 | T7 card, T9 bar, T11 |
| V-3 | T10 |
| V-4 | T8, T11 |
| V-5 | T9, T3 |
| V-6 | T1, T5, T12 |
| V-7 | T6, T12 (and the store's existing `onUnauthorized`) |
| V-8 | T7, T4, T3 |
| V-9 | T10 (Refresh), T9 (Reload) |
| V-10 | T7–T11 (native buttons/links, focus ring from primitives) |
