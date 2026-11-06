# Game engine — design

**Spec:** [spec.md](spec.md)

## Approach

`src/game/` is a set of small pure modules over plain data. `normalize` and `match` judge a guess. `round` is a reducer over one round (locks, step, end). `scoring` turns a round's locks into points. `game` is a reducer over a whole X Tracks game that owns the shuffled queue, starts rounds, records each finished round's score, and summarizes. Config and the RNG are values passed in, never imported ambient state. All state is JSON-serializable, so the store can hold it and tests can replay it.

## Layer placement

| New piece | Layer | Depends on | Logic/Visual | Keeps invariants? |
| --------- | ----- | ---------- | ------------ | ----------------- |
| `types.ts` (Step, Field, Track, Guess, Lock) | logic | nothing | logic | plain data ✅ |
| `config.ts` (`GameConfig`, `DEFAULT_CONFIG`) | logic | types | logic | one file for every tunable number ✅ |
| `normalize.ts` | logic | nothing | logic | pure string function ✅ |
| `rng.ts` (`Rng`, `createRng`, `shuffle`) | logic | nothing | logic | seeded, no `Math.random` ✅ |
| `match.ts` | logic | types, normalize | logic | pure ✅ |
| `scoring.ts` | logic | types, config | logic | pure ✅ |
| `round.ts` | logic | types, match | logic | pure reducer ✅ |
| `game.ts` | logic | types, config, rng, round, scoring | logic | RNG injected ✅ |

No file is a barrel. Consumers import the module they need (`@/game/round`). Nothing here touches `ui/`, `store/` or `spotify/`, and no later layer's types are needed.

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| Biome `src/game/**` override and `no-ambient.grit` | `biome.json`, `rules/` | Already enforce E-8. Not edited. |
| Rule tables and wording | `game-design.md` | The oracle for test numbers. Gets four short additions (T9). |
| `x.ts` / `x.test.ts` layout, `@/` alias, tabs, double quotes | `src/spotify/auth.ts` | Style to mirror. |

## Types

### `types.ts`

**Layer:** logic · **Responsibility:** the vocabulary every other game module shares.

```ts
export type Step = 1 | 2 | 3 | 4 | 5 | 6;
export const STEPS: readonly Step[] = [1, 2, 3, 4, 5, 6];
export const LAST_STEP: Step = 6;

export type Field = "title" | "artist" | "album";
export type AlbumKind = "album" | "single" | "compilation"; // EPs arrive as "single"

// The rule data only. The store keeps the full Spotify track (uri, duration) by `id`.
export interface Track {
	readonly id: string;
	readonly title: string;
	readonly artists: readonly [string, ...string[]]; // artists[0] is the main artist (A8)
	readonly album: { readonly name: string; readonly kind: AlbumKind };
}

// Strings are the suggestion the player picked. An absent or blank field is "not submitted".
export type Guess = Partial<Record<Field, string>>;

export type Credit = "full" | "featured"; // "featured" only ever occurs on artist
export interface Lock {
	readonly step: Step;
	readonly credit: Credit;
}
export type Locks = Readonly<Partial<Record<Field, Lock>>>;
```

### `config.ts`

**Responsibility:** every gameplay number in one place (game-design.md "Tunable Parameters"). Only keys that item 1 reads, plus the three M2 numbers scoring applies (E1).

```ts
export interface GameConfig {
	readonly clipMs: Readonly<Record<Step, number>>; // 1000, 2000, 4000, 7000, 11000, 16000
	readonly titlePoints: Readonly<Record<Step, number>>; // 1000, 800, 600, 400, 250, 100
	readonly artistRatio: number; // 0.3 of the title points for the same step
	readonly albumRatio: number; // 0.5
	readonly featuredArtistCredit: number; // 0.5 of the artist points
	readonly combo: number; // 1.5
	readonly comboAlbumSkipped: number; // 2.0
	readonly randomStartMultiplier: number; // 1.25
	readonly rerollPenalty: number; // 0.1 per paid reroll
	readonly rerollPenaltyFloor: number; // 0.5
}
export const DEFAULT_CONFIG: GameConfig;
```

### `normalize.ts`

**Responsibility:** one function every comparison goes through.

```ts
export function normalize(text: string): string;
```

Algorithm, in order:

1. `NFD`, remove combining marks (`\p{M}`), lowercase.
2. Repeatedly strip **version tags** until nothing changes: any bracketed group `(…)` or `[…]` anywhere, and any trailing ` - …` dash segment, whose content is a version tag (below). Never strip so much that nothing is left: if the result is empty, use the text from before this step.
3. Delete every character that is not `\p{L}`, `\p{N}` or whitespace. Collapse whitespace runs to one space and trim.
4. If step 3 yields an empty string, return the text from step 1, with whitespace collapsed and trimmed (E6).

A segment's content is a **version tag** when, ignoring a leading four-digit year, it matches one of: contains the word `remaster` or `remastered`; is `live` or starts with `live at`, `live from`, `live in`, `live on`, `live version`, `live session`, `live recording` or `live <year>`; `radio edit`; `single version`; `album version`; starts with `mono` or `stereo`; contains `deluxe`; `expanded edition`; `anniversary edition`; `special edition`; `bonus track`; starts with `feat`, `ft` or `featuring`.

Tags only count at the **end** (dash) or inside a bracket, never at the start of a title: `Live and Let Die` stays whole.

Test table (the task writes more rows around these; none may be dropped):

| Input | Normalizes to the same as | Why |
| ----- | ------------------------- | --- |
| `Hôtel California` | `hotel california` | accents, case |
| `Don’t Stop Believin'` | `Dont Stop Believin` | quotes, punctuation |
| `Bohemian Rhapsody - Remastered 2011` | `Bohemian Rhapsody` | dash tag with year |
| `Yesterday - 2009 Remaster` | `Yesterday` | year first |
| `Song (feat. Someone)` | `Song` | bracket tag |
| `Song [Live at Wembley]` | `Song` | bracket, `live at` |
| `Song - Live` | `Song` | |
| `Song - Radio Edit` | `Song` | |
| `Song - Single Version` / `- Album Version` | `Song` | |
| `Song - Mono` / `(Stereo Mix)` | `Song` | |
| `Song (Deluxe Edition)` / `- 25th Anniversary Edition` | `Song` | |
| `Song (Remastered) - Live` | `Song` | tags stack |
| `Song - feat. A - Remastered 2011` | `Song` | stacked dash tags |
| `Live and Let Die` | itself | leading `live` is part of the title |
| `Song - Remix` / `(Acoustic)` / `- Demo` / `- Instrumental` | **not** `Song` | stay distinct (E4) |
| `Song (Live Forever)` | itself | `live` is a tag only alone or as `live at/from/in/on/version/session/recording/<year> …` |
| `(Live)` | `live` | never normalizes to empty |
| `P!nk` | `Pnk` | punctuation deleted |
| `!!!` | `!!!` | all-symbol text survives (step 4) |
| `   ` | `` (empty) | blank means not submitted |

### `rng.ts`

```ts
export type Rng = () => number; // [0, 1)
export function createRng(seed: number): Rng; // mulberry32; same seed, same sequence
export function shuffle<T>(items: readonly T[], rng: Rng): T[]; // Fisher–Yates; returns a new array, never mutates
```

### `match.ts`

```ts
export function matchTitle(guess: string, track: Track): boolean;
export type ArtistMatch = "main" | "featured";
export function matchArtist(guess: string, track: Track): ArtistMatch | null; // main wins over featured
export function matchAlbum(guess: string, track: Track): boolean;
```

All three compare `normalize(guess)` to `normalize(...)` of the track's own value (E-2). A blank guess never matches. The title match deliberately ignores the artist (A6).

### `scoring.ts`

```ts
export function fieldPoints(config: GameConfig, field: Field, lock: Lock): number; // exact, unrounded

export interface ScoreModifiers {
	readonly randomStart?: boolean; // false
	readonly paidRerolls?: number; // 0
}

export interface RoundScore {
	readonly fields: Readonly<Partial<Record<Field, number>>>; // exact points of each locked field
	readonly subtotal: number; // sum of fields
	readonly hatTrick: boolean; // every required field locked
	readonly combo: number; // 1, config.combo, or config.comboAlbumSkipped
	readonly modeMultiplier: number; // 1 or config.randomStartMultiplier
	readonly rerollMultiplier: number; // max(floor, 1 − penalty·n)
	readonly total: number; // Math.round(subtotal × combo × mode × reroll), once
}

export function scoreRound(
	config: GameConfig,
	locks: Locks,
	albumSkipped: boolean,
	modifiers?: ScoreModifiers,
): RoundScore;
```

The mode multiplier is a boolean flag, not a raw number, so the config key is the only place ×1.25 lives. (E1 said "modeMultiplier"; if you want the raw number instead, it is a one-line change at the plan gate.)

### `round.ts`

```ts
export type RoundEnd = "complete" | "out-of-steps" | "gave-up";

export interface RoundState {
	readonly track: Track;
	readonly albumSkipped: boolean; // track.album.kind !== "album" (R10)
	readonly step: Step; // current step; for a "complete" round, the step it was completed at
	readonly locks: Locks;
	readonly ended: RoundEnd | null; // null while active
}

export type RoundAction =
	| { readonly type: "submit"; readonly guess: Guess }
	| { readonly type: "skip" }
	| { readonly type: "giveUp" };

export function startRound(track: Track): RoundState; // step 1, no locks, active
export function requiredFields(round: RoundState): readonly Field[]; // title, artist, + album unless skipped
export function roundReducer(state: RoundState, action: RoundAction): RoundState;
```

`roundReducer` rules, in order:

1. If `state.ended !== null` → return `state`.
2. `giveUp` → `ended: "gave-up"`, locks and step unchanged.
3. `skip` → at `LAST_STEP`: `ended: "out-of-steps"`; else `step + 1`.
4. `submit` → judge only fields that are **filled (non-blank), not yet locked, and required** (the Album guess is ignored when `albumSkipped`). If none qualify → return `state`. Otherwise:
   - Title right → lock `{ step, credit: "full" }`; artist `main` → full, `featured` → `credit: "featured"` (not wrong); album right → full. Anything else is wrong.
   - If every required field is now locked → `ended: "complete"`, step unchanged. (A wrong field means it cannot be complete.)
   - Else if any judged field was wrong → at `LAST_STEP` `ended: "out-of-steps"`, otherwise `step + 1`. The new locks are kept either way.
   - Else (only featured/right fields, still missing others) → locks updated, step unchanged.

### `game.ts`

```ts
export interface RoundResult {
	readonly track: Track;
	readonly albumSkipped: boolean;
	readonly locks: Locks;
	readonly endedBy: RoundEnd;
	readonly score: RoundScore;
}

interface GameBase {
	readonly config: GameConfig;
	readonly rounds: number; // X
	readonly queue: readonly Track[]; // the whole cleaned list, shuffled once (R5)
	readonly cursor: number; // index in `queue` of the current (or just-finished) track
	readonly results: readonly RoundResult[]; // finished rounds, in order
}

export type GameState = GameBase &
	(
		| { readonly phase: "round"; readonly round: RoundState }
		| { readonly phase: "reveal" } // the last result is the round being revealed
		| { readonly phase: "finished" }
	);

export type GameAction =
	| RoundAction
	| { readonly type: "next" } // leave the reveal
	| { readonly type: "trackFailed" }; // current track could not be cued

export function createGame(options: {
	readonly tracks: readonly Track[];
	readonly rounds: number;
	readonly rng: Rng;
	readonly config?: GameConfig; // DEFAULT_CONFIG
}): GameState; // throws RangeError unless 1 ≤ rounds ≤ tracks.length

export function gameReducer(state: GameState, action: GameAction): GameState;

export interface GameSummary {
	readonly score: number; // sum of round totals
	readonly stepHistogram: Readonly<Record<Step, number>>; // by Title lock step (E5)
	readonly missed: number; // rounds with no Title lock
	readonly hatTricks: number;
	readonly roundsPlayed: number;
}
export function summarize(state: GameState): GameSummary;
```

`gameReducer` rules:

- **phase `round`:** `submit` / `skip` / `giveUp` go to `roundReducer`. If it returns the same object → return `state`. If the round is still active → new state with the new round. If it ended → append a `RoundResult` (scored with `scoreRound(config, locks, albumSkipped)`) and `phase: "reveal"`.
- **phase `round`, `trackFailed`:** discard the round, no result. `cursor + 1`; if no track is left → `phase: "finished"`; else a new round on that track.
- **phase `reveal`, `next`:** if `results.length >= rounds` → `finished`. Else `cursor + 1`; if no track is left → `finished` (early); else `phase: "round"` with `startRound(queue[cursor])`.
- **Anything else** (round actions in `reveal` or `finished`, `next` in `round`, `trackFailed` outside `round`) → return `state` (E8).

`createGame` shuffles a copy of `tracks` with `shuffle(tracks, rng)` and starts round 1 on `queue[0]`. Nothing consumes the RNG after that, so the rest of the game is a pure function of the actions.

## Data model

All of the above is plain JSON (no `Map`, `Set`, `Date`, functions or `undefined`-valued keys that matter; optional fields are simply absent). Nothing is persisted (A14), so there is no schema version. E-7's JSON round-trip test guards the serializable shape.

## Time & randomness

No clock anywhere. The only randomness is `shuffle` in `createGame`, through the injected `Rng`. Production seeding happens in the composition root, in a later item.

## Error handling

| Failure | Behavior | Surfaced as |
| ------- | -------- | ----------- |
| `createGame` with `rounds` outside `1..tracks.length` | Throw | `RangeError` (programmer error; the UI prevents it, A13) |
| Empty submit, locked-field guess, action on an ended round or wrong phase | Ignore | Same state reference (E8) |
| Track fails to cue | Discard round, next track | `trackFailed` action (E2) |
| Queue exhausted by failures | Finish early | `phase: "finished"` with `results.length < rounds` |

## Integration points (shared touchpoints)

- `types.ts` and `config.ts` are written once, by T1, before anything that imports them. After that, no task edits them.
- `game-design.md` is edited only by T9.
- No manifest, lockfile, barrel, entry point or Biome config changes. The existing `src/game/**` Biome override and `no-ambient.grit` already cover the folder.

## Decisions

| #  | Decision | Alternatives | Why | ADR? |
| -- | -------- | ------------ | --- | ---- |
| D1 | `Track` carries only rule data; the store keeps the full Spotify track by `id` | Generic `GameState<T extends Track>`; put `uri`/`durationMs` on `Track` | The engine reads nothing else. A generic would thread a type parameter through every module for one consumer's convenience. `durationMs` arrives with item 7 when it is first read. | no |
| D2 | Guesses are the picked suggestion's text and are compared by `normalize` | Compare by Spotify IDs | A6 specifies normalized-text comparison, and "another artist's song with the same title counts" is a text rule an ID cannot express. | no |
| D3 | `config` lives inside `GameState` | Pass `config` to every reducer call | Keeps `gameReducer(state, action)` uniform for the Zustand store, and the config is plain data. | no |
| D4 | The mode multiplier is a `randomStart` flag, not a raw number | `modeMultiplier: number` | The ×1.25 then lives only in config. Reversible in one line. | no |
| D5 | `phase: "reveal"` carries no round; the reveal reads `results.at(-1)` | Keep the ended `RoundState` in the state too | One source of truth for a finished round. | no |
| D6 | No ADR for the engine contract | An ADR for `GameState` | It is a young internal contract designed in this document; reversing it later is a normal refactor. The invariants it relies on are already in the profile. | no |
| D7 | `Step` is a literal union and tables are `Record<Step, number>` | `number[]` indexed by step − 1 | `noUncheckedIndexedAccess` makes array indexing return `number \| undefined` everywhere. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| R5 | `createGame` (`shuffle`, `queue` is a permutation, `cursor` only moves forward) |
| R7 | `roundReducer` submit rules |
| R8 | `fieldPoints`, `scoreRound` |
| R9 | `scoreRound`, `gameReducer` (scores on round end) |
| R10 | `startRound` (`albumSkipped`), `requiredFields`, submit rule 4 |
| R12 | `summarize` |
| E-1 | `normalize` |
| E-2, E-3 | `match.ts`, `roundReducer` |
| E-4, E-5 | `roundReducer` |
| E-6 | `gameReducer` (`next`, `trackFailed`) |
| E-7 | all of the above (plain data); T8 replay test |
| E-8 | existing Biome override; checked at every wave gate |
| E-9 | T9 |
