# Playlist loading, visual half — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Done. T1–T12 implemented and green (typecheck, lint, tests, build); M1, M2 and M4 done. M3 (layout, keyboard and logout sign-off) was not confirmed in this session.

**Deviation from the plan:** `biome.json` now also excludes `src/ui/assets` (the vendor logo SVG tripped `noSvgWithoutTitle`), so the "no Biome change" line below no longer holds.

## Gates before wave 1

| Gate | What | Who |
| ---- | ---- | --- |
| G1 | `feat/2/playlist-loading-logic` is merged to `main` and green; branch `feat/2/playlist-loading-visual` is cut from `main` (V1). | You / orchestrator |
| G2 | The official **white full Spotify logo SVG** (icon + wordmark) is saved as `src/ui/assets/spotify-logo-white.svg` (V6). T4 stops if it is missing. | You |

## Execution plan

| Wave | Tasks | Mode |
| ---- | ----- | ---- |
| 1 | T1, T2, T3, T4, T5 | parallel — 5 subagents |
| 2 | T6, T7, T8, T9 | parallel — 4 subagents |
| 3 | T10 | sequential — 1 subagent |
| 4 | T11 | sequential — container |
| 5 | T12 | sequential — integration (composition root) |
| — | Live P16 check and sign-off | you, in desktop Chrome |

After every wave the orchestrator runs `npm run typecheck && npm run lint && npm test`. The dev server is never started by a subagent.

## Validation

**A — Granularity:** ✅ · **B — Dependencies:** ✅ · **C — File ownership:** ✅

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | 2 session actions + 1 variant (one cohesive state change) + test | ✅ |
| T2 | 4 generated primitives, one CLI call | ⚠️ cohesive (one shadcn invocation, no logic) |
| T3 | 1 pure copy module + test | ✅ |
| T4 | 1 component + test | ✅ |
| T5 | 1 component + test | ✅ |
| T6 | 1 wiring module (2 functions) + test | ✅ |
| T7 | 1 component + test | ✅ |
| T8 | 1 component + test | ✅ |
| T9 | 1 component + test | ✅ |
| T10 | 1 component + test | ✅ |
| T11 | 1 container + test | ✅ |
| T12 | composition root + App test (integration) | ⚠️ cohesive, small and mechanical |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps in an earlier wave? |
| ---- | ---------- | ---- | ------------------------ |
| T1 | G1 | 1 | ✅ |
| T2 | G1 | 1 | ✅ |
| T3 | G1 | 1 | ✅ |
| T4 | G1, G2 | 1 | ✅ |
| T5 | G1 | 1 | ✅ |
| T6 | T1 | 2 | ✅ (wave 1) |
| T7 | T2, T3 | 2 | ✅ |
| T8 | T2, T3 | 2 | ✅ |
| T9 | T2, T3 | 2 | ✅ |
| T10 | T2, T3, T7 | 3 | ✅ |
| T11 | T3, T4, T7, T8, T9, T10 | 4 | ✅ |
| T12 | T1, T5, T6, T11 | 5 | ✅ |

### C — File ownership

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | store | `src/store/session.ts`, `src/store/session.test.ts` | — |
| 1 | T2 | ui (generated) | `src/ui/primitives/input.tsx`, `badge.tsx`, `skeleton.tsx`, `progress.tsx`; `package.json`, `package-lock.json` only if the CLI changes them | — |
| 1 | T3 | ui | `src/ui/pickerCopy.ts`, `src/ui/pickerCopy.test.ts` | — |
| 1 | T4 | ui | `src/ui/SpotifyAttribution.tsx`, `src/ui/SpotifyAttribution.test.tsx` | — |
| 1 | T5 | ui | `src/ui/SetupStandIn.tsx`, `src/ui/SetupStandIn.test.tsx` | — |
| 2 | T6 | store | `src/store/wiring.ts`, `src/store/wiring.test.ts` | — |
| 2 | T7 | ui | `src/ui/PlaylistCard.tsx`, `src/ui/PlaylistCard.test.tsx` | — |
| 2 | T8 | ui | `src/ui/PlaylistPasteBox.tsx`, `src/ui/PlaylistPasteBox.test.tsx` | — |
| 2 | T9 | ui | `src/ui/SelectionBar.tsx`, `src/ui/SelectionBar.test.tsx` | — |
| 3 | T10 | ui | `src/ui/PlaylistGrid.tsx`, `src/ui/PlaylistGrid.test.tsx` | — |
| 4 | T11 | ui | `src/ui/PlaylistPicker.tsx`, `src/ui/PlaylistPicker.test.tsx` | — |
| 5 | T12 | integration | `src/App.tsx`, `src/main.tsx`, `src/ui/SignedInShell.tsx` (delete), `src/App.test.tsx` | — |

Shared touchpoints: `package.json`/lock only by T2; `App.tsx`/`main.tsx` only by T12; `session.ts` only by T1; no barrels, no Biome change. `src/ui/assets/` is written by you (G2), read by T4.

## Common brief for every UI task

Invariants 3 and 5: `ui/` imports only from `@/store/*`, `@/ui/*`, `@/lib/*`, `@/game/*` and libraries (never `@/spotify/*`); no `Spotify` global. Spotify compliance (spec): cover art is never cropped, overlaid or altered (`object-contain`, `rounded-[8px]`, nothing drawn on it); metadata is shown whole (wrap, never truncate or re-case); Spotify logo only on plain background. Tests are jsdom (`// @vitest-environment jsdom`, RTL, `afterEach(cleanup)`), mirroring `src/ui/SetupErrorScreen.test.tsx`. Styling: Tailwind and shadcn tokens already in `src/index.css`; match `SetupErrorScreen.tsx`.

## Tasks

### T1 — Add the stand-in Setup screen to the session store

**Wave:** 1 · **Layer:** store · **Requirement:** V-6, V7
**Depends on:** G1 · **Owns:** `src/store/session.ts`, `src/store/session.test.ts` · **Reads:** design §`store/session.ts`
**Do:** Add `{ name: "setup"; user }` to `Screen` and `toSetup()` / `toPicker()` to `SessionState`; both are no-ops unless the current screen is `signed-in` / `setup` respectively.
**Invariants:** 3 (no React).
**Done when:**
- [ ] `toSetup` from `signed-in` shows `setup` with the same user; from any other screen it changes nothing; calling it twice leaves one `setup`.
- [ ] `toPicker` from `setup` returns to `signed-in` with the same user; elsewhere a no-op.
- [ ] `logout()` and `expire()` from `setup` show `login` / `session-expired`.
- [ ] Existing session tests still pass.
**Verify:** `npm test -- src/store/session` → all passing

### T2 — Add the shadcn primitives the Picker needs

**Wave:** 1 · **Layer:** ui (generated) · **Requirement:** supports V-1, V-2, V-4, V-8
**Depends on:** G1 · **Owns:** `src/ui/primitives/input.tsx`, `badge.tsx`, `skeleton.tsx`, `progress.tsx` (+ manifest only if the CLI edits it) · **Reads:** `components.json`, `src/ui/primitives/button.tsx`
**Do:** Run `npx shadcn@latest add input badge skeleton progress` (style `radix-nova`) and keep only the generated files; do not hand-edit them.
**Invariants:** primitives are Biome-excluded; no other file changes.
**Done when:**
- [ ] The four files exist and import only `radix-ui`, `cn` and `@/lib/utils`-style paths already used by `button.tsx`.
- [ ] `git status` shows no changes outside the owned files.
- [ ] `npm run typecheck` is green.
**Verify:** `npm run typecheck && npm run lint`

### T3 — Write the Picker copy module

**Wave:** 1 · **Layer:** ui (pure) · **Requirement:** R3, R4, V-5, V-8, V10, V14
**Depends on:** G1 · **Owns:** `src/ui/pickerCopy.ts`, `src/ui/pickerCopy.test.ts` · **Reads:** design §`pickerCopy.ts`, spec §Copy, `src/store/playlists.ts`
**Do:** Implement exactly the exports in the design with the wording from the spec's Copy table.
**Invariants:** 3 (imports only `@/store/*`); no DOM, so a node-environment test.
**Done when:**
- [ ] `cleaningSummary` gives `412 usable · 9 removed (5 duplicates, 2 unavailable, 1 local, 1 episode)`, singular/plural correct, zero reasons omitted, and `412 usable · none removed` for none.
- [ ] `errorText` has a distinct, non-empty string for every `ApiErrorKind` and `invalid-link` in each context, and `restricted` differs between `selection` (Dev Mode) and `list` (allowlist).
- [ ] `loadingText`, `tooFewText`, `restrictedPasteText`, `playlistUrl` tested.
**Verify:** `npm test -- src/ui/pickerCopy` → all passing

### T4 — Build the Spotify attribution footer

**Wave:** 1 · **Layer:** ui · **Requirement:** V-8
**Depends on:** G1, G2 · **Owns:** `src/ui/SpotifyAttribution.tsx`, `src/ui/SpotifyAttribution.test.tsx` · **Reads:** `src/ui/assets/spotify-logo-white.svg`, spec §Spotify compliance, `src/ui/pickerCopy.ts` (just the text; if T3 has not landed, the orchestrator tells you the string)
**Do:** Render the white logo (`<img alt="Spotify">`, width ≥ 70 px, not stretched) with the attribution text beside it and padding of half the icon height, on the plain background.
**Done when:**
- [ ] The logo is a real `<img>` of the provided SVG with an accessible name and at least 70 px wide (class check).
- [ ] The attribution text is present; nothing is positioned over artwork.
**Verify:** `npm test -- src/ui/SpotifyAttribution` → all passing

### T5 — Build the stand-in Setup screen

**Wave:** 1 · **Layer:** ui · **Requirement:** V-6, P3
**Depends on:** G1 · **Owns:** `src/ui/SetupStandIn.tsx`, `src/ui/SetupStandIn.test.tsx` · **Reads:** design §`SetupStandIn`, `src/ui/LoginScreen.tsx`
**Do:** A centred Card showing the playlist name, "N usable tracks" and a Back button; a one-line note that the real Setup arrives later.
**Done when:**
- [ ] Name and count render; Back calls `onBack` once.
**Verify:** `npm test -- src/ui/SetupStandIn` → all passing

### T6 — Wire the playlists store to the session

**Wave:** 2 · **Layer:** store · **Requirement:** V-7, V13
**Depends on:** T1 · **Owns:** `src/store/wiring.ts`, `src/store/wiring.test.ts` · **Reads:** `src/store/session.ts`, `src/store/playlists.ts`, `src/store/session.test.ts` (fake style)
**Do:** Implement `signedInUserId` and `connectPlaylistsToSession` per the design, using a fake client for the playlists store in tests.
**Invariants:** 3 (no React).
**Done when:**
- [ ] `signedInUserId` returns the user's id on `signed-in` and `setup`, `null` on every other screen.
- [ ] After a playlist is selected, moving the session to `login` / `setup-error` resets the playlists store; moving between `signed-in` and `setup` does not.
- [ ] The returned function unsubscribes (no reset afterwards).
**Verify:** `npm test -- src/store/wiring` → all passing

### T7 — Build the playlist card

**Wave:** 2 · **Layer:** ui · **Requirement:** R2, V-2, V-8, V-10
**Depends on:** T2, T3 · **Owns:** `src/ui/PlaylistCard.tsx`, `src/ui/PlaylistCard.test.tsx` · **Reads:** design §`PlaylistCard`, `src/ui/primitives/badge.tsx`, `src/ui/pickerCopy.ts`
**Do:** `<li>` with a select `<button aria-pressed>` (square `object-contain` cover with placeholder fallback, full-wrap name, "owner · N tracks", Collaborative badge beside the cover) and a sibling `<a target="_blank" rel="noreferrer">` reading OPEN SPOTIFY to `playlistUrl(id)`.
**Done when:**
- [ ] Click and Enter/Space on the button call `onSelect(summary)`; clicking the link does not.
- [ ] `aria-pressed` follows `selected`; selection is a ring on the card, not an element over the cover.
- [ ] `coverUrl: null` and an image `error` event both show the placeholder; the image has no `object-cover`.
- [ ] A very long name renders in full; the Collaborative badge appears only when `collaborative`.
**Verify:** `npm test -- src/ui/PlaylistCard` → all passing

### T8 — Build the paste box

**Wave:** 2 · **Layer:** ui · **Requirement:** R2, V-4, V-10
**Depends on:** T2, T3 · **Owns:** `src/ui/PlaylistPasteBox.tsx`, `src/ui/PlaylistPasteBox.test.tsx` · **Reads:** design §`PlaylistPasteBox`, `src/ui/primitives/input.tsx`
**Do:** Input plus Look up button (Enter submits, blank input disabled); under it draw `loading`, `restricted` (`restrictedPasteText`) or `error` (`errorText(kind, "paste")`); `idle` and `found` draw nothing extra.
**Done when:**
- [ ] Submitting calls `onLookup` with the trimmed text, by button and by Enter; blank does nothing.
- [ ] Each `PasteState` status draws its expected text (every error kind including `invalid-link`); the button is disabled while `loading`.
**Verify:** `npm test -- src/ui/PlaylistPasteBox` → all passing

### T9 — Build the sticky selection bar

**Wave:** 2 · **Layer:** ui · **Requirement:** R3, R4, V-5, V-9
**Depends on:** T2, T3 · **Owns:** `src/ui/SelectionBar.tsx`, `src/ui/SelectionBar.test.tsx` · **Reads:** design §`SelectionBar`, `src/ui/primitives/progress.tsx`
**Do:** Render each `Selection` status per the design (`role="status" aria-live="polite"`, sticky to the bottom); Continue enabled only when `ready` and `gate.ok`.
**Done when:**
- [ ] `none` shows the hint and a disabled Continue; `loading` shows name, progress and `loadingText`; `ready` shows `cleaningSummary`; `error` shows the mapped message.
- [ ] `ready` with `too-few` shows `tooFewText` and a disabled Continue; with `ok` Continue calls `onContinue` once.
- [ ] Reload shows whenever a playlist is selected and calls `onReload`.
**Verify:** `npm test -- src/ui/SelectionBar` → all passing

### T10 — Build the playlist grid

**Wave:** 3 · **Layer:** ui · **Requirement:** R2, V-1, V-3, V-9, V-10
**Depends on:** T2, T3, T7 · **Owns:** `src/ui/PlaylistGrid.tsx`, `src/ui/PlaylistGrid.test.tsx` · **Reads:** design §`PlaylistGrid`, `src/ui/PlaylistCard.tsx`, `src/ui/primitives/skeleton.tsx`
**Do:** Render `ListState`: skeletons while loading, `errorText(…, "list")` with a Retry (`onRefresh`), `EMPTY_LIST_TEXT`, or the grid of `PlaylistCard`s capped at 20 with Show more (+20 per press); heading row with a Refresh icon-button; trailing OPEN SPOTIFY link to `OPEN_SPOTIFY_URL`.
**Done when:**
- [ ] 45 playlists show 20, then 40, then 45 with Show more disappearing at the end.
- [ ] `loading`, `error`, empty `ready` and populated `ready` each render; Retry and Refresh both call `onRefresh`.
- [ ] The card whose id equals `selectedId` is `aria-pressed`; selecting calls `onSelect`.
**Verify:** `npm test -- src/ui/PlaylistGrid` → all passing

### T11 — Build the Picker screen

**Wave:** 4 · **Layer:** ui · **Requirement:** R2–R4, V-1…V-5, V-9, V11
**Depends on:** T3, T4, T7, T8, T9, T10 · **Owns:** `src/ui/PlaylistPicker.tsx`, `src/ui/PlaylistPicker.test.tsx` · **Reads:** every ui file above, `src/store/playlists.ts`, `src/store/playlists.test.ts` (fake client style)
**Do:** Compose header, paste box, found card (`PlaylistCard`), grid, bar and footer from the real playlists store; call `loadList()` on mount only when `list.status` is `idle` or `error`; pass `store.select`, `lookupLink`, `reload`, `loadList` to the children.
**Done when:** (real store + fake client)
- [ ] Mount lists the user's playlists; remounting with a `ready` list does not refetch.
- [ ] Clicking a card shows progress, then the cleaning summary; a gate `too-few` disables Continue; `ok` Continue calls `onContinue`.
- [ ] A pasted link shows the found card; clicking it selects (grid and found card both pressed when the same id); a restricted lookup shows the explanation and no card.
- [ ] A selection error shows its mapped text and Reload retries; list error shows Retry.
- [ ] Log out calls `onLogout`.
**Verify:** `npm test -- src/ui/PlaylistPicker` → all passing

### T12 — Wire the composition root and App (integration)

**Wave:** 5 · **Layer:** integration · **Requirement:** V-6, V-7, D11 of the logic design
**Depends on:** T1, T5, T6, T11 · **Owns:** `src/App.tsx`, `src/main.tsx`, `src/ui/SignedInShell.tsx` (delete), `src/App.test.tsx` · **Reads:** design §`App.tsx` and `main.tsx`, the files above
**Do:** Build the real `sleep`, API, playlists client and store in `main.tsx`, connect them with `connectPlaylistsToSession`, pass both stores to `App`, render the Picker for `signed-in` and the stand-in for `setup`, delete `SignedInShell`.
**Invariants:** 3; `main.tsx` stays the only place real browser APIs are passed in.
**Done when:**
- [ ] `App.test.tsx` (jsdom): `signed-in` shows the Picker, Continue reaches the stand-in with the playlist name and usable count, Back returns with grid and selection intact; logout shows Login and a later login starts with no selection.
- [ ] A fake client returning `unauthorized` ends on the `session-expired` Setup-error screen.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` are green; `rg SignedInShell src` finds nothing.
**Verify:** `npm run typecheck && npm run lint && npm test && npm run build`

## Manual steps (not subagent work)

1. **M1 — Build the edge-case playlist** (you, before the live check): local files, episodes, an unavailable or region-locked track, a duplicate, and ideally a collaborative playlist. Write down the counts you expect per reason.
2. **M2 — Live P16 check:** `npm run dev`, open `http://127.0.0.1:5173` in desktop Chrome, log in, load it in the Picker, compare the removal counts with M1. Note any surprise in the logic spec's P16 row and fix `clean.ts` in a separate commit if the real fields differ.
3. **M3 — Sign-off at about 1280×800:** layout, sticky bar, footer logo, keyboard-only path, Back round-trip, logout/expire leaves no stale selection.
4. **M4 — Docs:** mark item 2 as implemented in `ROADMAP.md` and flip both specs to `Implemented` (orchestrator, after M2–M3).
