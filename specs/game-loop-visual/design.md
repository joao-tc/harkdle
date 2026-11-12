# Game loop (visual) — design

**Spec:** [spec.md](spec.md) · **ADRs:** none new (see D9). Builds on [ADR-0001](../../docs/adr/0001-stack-and-playback.md), [ADR-0002](../../docs/adr/0002-server-data-via-query-core-in-the-store.md), [ADR-0003](../../docs/adr/0003-cues-are-muted.md), and [game-loop-logic design](../game-loop-logic/design.md).

## Approach

The screens are a projection of two stores that already exist: the game store (`stage`, `game`, `revealed`, `playback`, `countdown`, `recovery`, `skippedNotice`, `rounds`, `volume`) and the playlists store (the ready selection's tracks, report and `SuggestionIndex`). A new `GameFlow` component switches on `stage`; each stage is one screen component that renders content only, and `GameFlow` wraps it in a `GameShell` (single column, footer logo, accent variable). The session store still decides whether we are on Setup at all (`screen.name === "setup"`); `App` renders `GameFlow` there instead of `SetupStandIn`. Screens call store actions and write no rules: points come from `fieldPoints` and `RoundScore`, the round number from `results.length + 1`, the running score from `summarize(game).score`.

`main.tsx` is the only place that builds the real thing: SDK transport → `createPlaybackAdapter` → `createGameStore`, `connectGameToSession`, `connectLeaveGuard(game, window)`.

```
main.tsx ── builds ──► adapter ──► game store ◄── connectGameToSession(session) / connectLeaveGuard(window)
                                       │
App ─ screen "setup" ─► GameFlow ─ stage ─► Setup │ Connecting │ Round │ Reveal │ Countdown │ Results
                          │                         (content only; GameShell adds column, logo, accent)
                          └─ playlists store: tracks (Start), SuggestionIndex (Round fields), usable (Setup)
```

## Layer placement

| New piece | Layer | Depends on | Keeps invariants? |
| --------- | ----- | ---------- | ----------------- |
| `ui/game/*` components and hooks | ui | `store/game`, `store/playlists`, `store/shortcuts`, `game/*` (types, `fieldPoints`, `summarize`, `presetOptions`, `pickRounds`) | imports no `spotify/` (3, 5) ✅ |
| `ui/game/accent.ts` (pure colour maths) | ui | nothing | no ambient time or randomness (2 is only enforced in `game/`, but it has none) ✅ |
| `ui/primitives/alert-dialog.tsx` | ui (generated shadcn) | `radix-ui` (already a dependency) | no new dependency ✅ |
| `ui/SpotifyAttribution.tsx` (+ optional `text` prop) | ui | `ui/pickerCopy` | ✅ |
| `App.tsx` (+ `game` prop) | ui | `ui/game/GameFlow` | ✅ |
| `main.tsx` | composition root | `spotify/playback/*`, `store/*`, `game/rng` | the one place real `fetch`, `performance.now`, `document`, `window`, `crypto` are passed in ✅ |

`store/`, `game/` and `spotify/` get no change. If the live check finds a store or adapter bug, that is a new small item against 5a or 3, not part of this plan's file ownership.

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| `createGameStore`, `GameStoreState`, `Stage`, `PlaybackView`, `COUNTDOWN_*` | `src/store/game.ts` | The whole screen state. Type re-exports (`InterruptionReason`, `PlaylistTrack`) keep `ui` off `spotify/`. |
| `createHarness`, `makeTracks`, `flush` | `src/store/gameHarness.ts` | The `GameFlow` integration test and screen tests that need a live store. |
| `shortcutFor`, `KeyInput` | `src/store/shortcuts.ts` | The key hook. |
| `connectLeaveGuard`, `connectGameToSession` | `src/store/leaveGuard.ts`, `wiring.ts` | `main.tsx`. |
| `fieldPoints`, `summarize`, `presetOptions`, `pickRounds`, `requiredFields`-style data | `src/game/*` | Locked-field points, Results, Setup presets. |
| `SuggestionIndex.suggest(field, query)` | `src/store/playlists.ts` (re-export) | Field suggestions. |
| `createSdkTransport`, `createPlaybackAdapter`, `documentVisibility`, `Clock` | `src/spotify/playback/**` | `main.tsx`. |
| `SpotifyAttribution`, `spotify-logo-white.svg`, `OPEN_SPOTIFY_URL` | `src/ui/` | Footer on every game stage. |
| `Button`, `Card`, `Alert`, `Badge`, `Input`, `Skeleton` | `src/ui/primitives/` | Same look as the Picker. |

## Components

All under `src/ui/game/` unless noted. Props are the contract between tasks; each component renders content only.

```ts
// gameCopy.ts — every user-facing string and the plural helpers (see Copy below)

// LadderBar.tsx
LadderBar({ step: Step; clipMs: Readonly<Record<Step, number>> }): JSX.Element
// six <li>, aria-label "Step 3 of 6"; spent = filled, current = highlighted, upcoming = dim

// SuggestField.tsx — an ARIA 1.2 combobox with a listbox; no new dependency (D3)
interface SuggestFieldProps {
  field: Field;                         // "title" | "artist" | "album"
  label: string;
  suggest: (query: string) => readonly string[];
  text: string; picked: string | null;  // controlled by the parent
  onText(text: string): void;           // typing clears `picked`
  onPick(value: string): void;
  onSubmit(): void;                     // Enter with no highlighted suggestion
  lock: { value: string; points: number; featured: boolean } | null; // locked: disabled, ✓
  wrong: boolean;                       // ✗ mark
  hint: boolean;                        // "pick a suggestion" for unpicked text
  disabled: boolean;
  autoFocus?: boolean;
}

// PlayHereBanner.tsx
PlayHereBanner({ reason: InterruptionReason; recovery: Recovery; onRecover(): void })

// GiveUpDialog.tsx — shadcn AlertDialog; trigger is the Give up button
GiveUpDialog({ disabled: boolean; onConfirm(): void; onOpenChange(open: boolean): void })

// VolumeControl.tsx — native <input type="range" min=0 max=100>, label, % readout (D4)
VolumeControl({ volume: number; onChange(volume: number): void })

// useAccent.ts + accentSource.ts
useAccent(coverUrl: string | null): { color: string; onColor: "light" | "dark" } // fallback until/unless extracted

// accent.ts — pure
accentFromPixels(rgba: Uint8ClampedArray): { color: string; onColor: "light" | "dark" } | null
export const FALLBACK_ACCENT = "#191414";

// feedback.ts — pure presentation derivation, no rules
wrongFields(submitted: Guess, before: RoundState, after: GameState): readonly Field[]
// the submitted fields, picked and non-blank, that are not locked in `after`'s round; [] when the round did not continue

// useGameShortcuts.ts
useGameShortcuts(game: StoreApi<GameStoreState>, enabled: boolean): void
// document keydown, capture; shortcutFor(e) → play | skip; preventDefault; ignored when !enabled

// GameShell.tsx
GameShell({ accent?: { color; onColor }; children })
// <main> single column (max-w-md like the Picker), sets --art-accent, then <SpotifyAttribution text=…>

// CountdownScreen.tsx, ConnectingScreen.tsx
CountdownScreen({ value: 3 | 2 | 1 })        // aria-live="assertive" number, reduced-motion safe
ConnectingScreen(_: Record<string, never>)   // "Connecting to Spotify…"

// SetupScreen.tsx
SetupScreen({ game: StoreApi<GameStoreState>; summary: PlaylistSummary; tracks: readonly PlaylistTrack[]; onBack(): void })

// RoundScreen.tsx
RoundScreen({ game: StoreApi<GameStoreState>; suggest: (field: Field, query: string) => readonly string[] })

// RevealScreen.tsx
RevealScreen({ game: StoreApi<GameStoreState> })     // reads game, revealed; Next → game.next()

// ResultsScreen.tsx
ResultsScreen({ game: StoreApi<GameStoreState>; onChangePlaylist(): void })

// GameFlow.tsx
GameFlow({ game; playlists: StoreApi<PlaylistsState>; summary: PlaylistSummary; onBack(): void })
// stage → screen inside GameShell; idle → SetupScreen. Calls useAccent for the Reveal's cover and hands the result to the shell.
```

`SpotifyAttribution` gains `text?: string` (default `ATTRIBUTION_TEXT`).

### Round screen detail

State owned by `RoundScreen`: for each field `{ text, picked }`, `wrong: Set<Field>`, `hintOn: boolean`, `dialogOpen: boolean`. On Submit:

```
guess = picked values of unlocked fields only
if guess is empty → hint on (fields with unpicked text), return      // the store would no-op anyway
before = game.round; game.submit(guess); after = store.getState().game
wrong  = wrongFields(guess, before, after)                            // the store applied it synchronously
```

When the round advances to a new track the screen remounts (keyed by `game.cursor`), so field state resets. Disabled while `playback` is `interrupted` or `preparing`: Submit, Skip, Give up and Play (the store ignores them too; the disabled look is for the player). The Play label is the step's `clipMs / 1000` seconds.

### Accent

`accentFromPixels` averages the cover's downsampled pixels weighted by saturation, clamps lightness into a band that reads on the dark theme, and picks `onColor` by relative luminance. `accentSource.ts` (`loadPixels(url)`) draws the cover on a 32×32 canvas from an off-screen `Image` with `crossOrigin = "anonymous"`; any load or `getImageData` failure resolves `null`, which becomes `FALLBACK_ACCENT` (L6). The visible `<img>` is a separate element that is never drawn on or styled beyond its size and 8 px radius.

### `main.tsx` composition

```ts
const clock = { now: () => performance.now(), sleep };
const transport = createSdkTransport({ getAccessToken: () => auth.getAccessToken(), api });
const adapter = createPlaybackAdapter({ transport, clock, visibility: documentVisibility(document) });
const game = createGameStore({
  adapter, sleep,
  newRng: () => createRng(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1),
  onStartFailed: (e) => session.getState().playerFailed({ kind: e.kind, message: e.message }),
});
connectGameToSession(session, game);
connectLeaveGuard(game, window);
```

`App` gains a `game` prop. **Verify before writing:** `createRng`'s seed type and `createSpotifyApi(...).put` exist as the playback-adapter design says (read them in T20; do not assume).

## Copy (drafted here, edited by the user at approval)

| Situation | Text |
| --------- | ---- |
| Setup title / description | `<playlist name>` · `<n> usable tracks` |
| Setup controls | Mode: **X Tracks** · Endless (coming soon) / Start: **Classic** · Random (coming soon) / Tracks: 5 · 10 · 20 / Volume |
| Start / Back | `Start` / `Back` |
| Connecting | `Connecting to Spotify…` |
| Round header | `Round 3 of 10` · `Score 1,840` |
| Play | `Play 1s clip` / `Playing…` / `Preparing…` |
| Fields | `Title` · `Artist` · `Album` ; placeholder `Start typing…` ; hint `Pick one of the suggestions to submit this field.` |
| Wrong mark | `Not it` |
| Locked | `✓ <value> · +300` ; featured: `✓ <value> · featured artist · +150` |
| Album skipped | `Album skipped — this track is a single/compilation` |
| Buttons | `Submit` · `Skip` · `Skip (ends the round)` (step 6) · `Give up` |
| Give up dialog | `Give up this round?` / `The song will be revealed and the round scores what you have locked.` / `Give up` · `Keep playing` |
| Play here | taken-over: `Spotify is playing elsewhere.` ; device-lost: `harkdle's player disconnected.` ; `Play here` ; working `Reconnecting…` ; failed `Couldn't reconnect. Check Spotify is open and try again.` |
| Skipped track | `A track couldn't be loaded and was skipped.` · `Dismiss` |
| Reveal | `+<field points>` rows; `Hat trick ×1.5` / `×2.0`; `Random start ×1.25`; `Rerolls ×0.9` (omitted when 1) ; `Round total` ; `Score` ; link `PLAY ON SPOTIFY` ; `Next` |
| Countdown | `3` `2` `1` |
| Results | `Final score` · `Hat tricks` · `Rounds played` · histogram rows `Step 1…6`, `Missed` ; `Play again` · `Change playlist` ; zero rounds: `No tracks could be played.` |
| Footer | `Track data and artwork from Spotify` |

## Data model

Nothing is persisted (invariant 4 n/a). Component state is per round and dies with it.

## Time & randomness

The screens use no timers and no randomness. `sleep` for the countdown is the store's. The RNG seed and `performance.now` are created in `main.tsx`.

## Error handling

| Failure | Behavior | Surfaced as |
| ------- | -------- | ----------- |
| `connect` rejected | store → `idle`; `onStartFailed` → `playerFailed` | Setup error screen (R1/A3 copy exists) |
| Cue fails | store skips the track | L9 notice |
| Interrupted in a Round | frozen | L4 banner; `recovery: failed` shows the retry text |
| Cover missing or unreadable | placeholder; fallback accent | none |
| `roundsPlayed: 0` | Results copy L-15 | text |

## Integration points (shared touchpoints)

- `src/App.tsx` + `src/App.test.tsx`, `src/main.tsx`, and the deletion of `SetupStandIn` (+ its test): one task (T20), last.
- `src/ui/SpotifyAttribution.tsx` + test: T5 only.
- `src/ui/game/gameCopy.ts`: T1 only; every later task reads it. If a component needs a string the table lacks, it asks the orchestrator rather than editing the file.
- Not touched: `src/store/**`, `src/game/**`, `src/spotify/**`, `package.json`, `biome.json`, `src/index.css`, `button.tsx`. No barrels.

## Decisions

| #  | Decision | Alternatives | Why | ADR? |
| -- | -------- | ------------ | --- | ---- |
| D1 | Screens render content only; `GameFlow` wraps each in `GameShell` | Each screen renders its own `<main>` and footer | Lets all screens build in parallel and keeps the logo and accent in one place. | no |
| D2 | `GameFlow` switches on `stage` inside the session's `setup` screen; no router, no new `Screen` variant | Add game variants to `Screen` | 5a D1. | no |
| D3 | A custom combobox (`SuggestField`) | shadcn Command / cmdk (new dependency) | The behaviour is small (list, arrows, Enter, click) and A6 needs exact "picked" semantics that a library's free-text mode would fight. No dependency, full control of the `aria-*`. | no |
| D4 | A native `<input type="range">` for volume | Radix Slider primitive | Radix Slider needs `ResizeObserver` and pointer APIs jsdom lacks; a native range is accessible, testable and enough. | no |
| D5 | Add only the `alert-dialog` shadcn primitive | Hand-roll the dialog | L2 needs focus trapping and Esc handling that the primitive gives for free. `radix-ui` is already installed. | no |
| D6 | The key hook listens on `document` in the capture phase while a Round is mounted | Per-input `onKeyDown` | R17 requires it to work in any field and on the buttons; one listener is simpler and `shortcutFor` already drops repeats. | no |
| D7 | Wrong marks are derived in the screen by `wrongFields`, not stored | Add `lastWrong` to the game store | It is presentation. It dies with the round's component state and keeps the store as 5a left it. | no |
| D8 | Accent extraction on an off-screen `Image`, never on the visible one | Draw from the visible `<img>` | The visible cover stays untouched (L5), and a CORS failure can't break its display. | no |
| D9 | No ADR | ADR for "screens are a projection of two stores" | ADR-0002 already sets the pattern; the Picker followed it. Say so at the gate if you disagree. | no |
| D10 | Focus: first field on Round mount, Next on Reveal, Play again on Results | No focus management | Enter and Tab are the primary path (A18); without it the keyboard player must click first. | no |
| D11 | `Skip` is relabelled at step 6 | Same label always | At step 6 a skip ends the round; the player should know. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| R6, R14 | `RoundScreen` Play button reading `playback`; the store handles `hidden` |
| R11 | `RevealScreen`, `CountdownScreen`, `GameFlow` |
| R12, L-15 | `ResultsScreen` |
| R13 | `PlayHereBanner`, `RoundScreen` |
| R15 | `main.tsx` |
| R17 | `useGameShortcuts`, `RoundScreen` |
| R18 | `VolumeControl`, `SetupScreen` |
| L-1, L-2 | `SetupScreen`, `ConnectingScreen`, `GameFlow` |
| L-3 | `main.tsx` (`onStartFailed`), existing Setup error |
| L-4 – L-9, L-12, L-13 | `RoundScreen`, `LadderBar`, `SuggestField`, `GiveUpDialog`, `feedback.ts` |
| L-10 | `RevealScreen`; `GameFlow` + `useAccent` + `accent.ts` for the tint |
| L-11 | `GameShell`, `SpotifyAttribution` |
| L-14 | `ResultsScreen`, `GameFlow`, `App` |
