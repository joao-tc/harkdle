# Game engine — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Draft

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 1 | T1, T2, T3, T9 | parallel — 4 subagents | one per task: `feat(game): …`, `docs: …` |
| 2 | T4, T5 | parallel — 2 subagents | one per task |
| 3 | T6 | sequential — round reducer | `feat(game): add round reducer` |
| 4 | T7 | sequential — game reducer | `feat(game): add X Tracks game reducer` |
| 5 | T8 | sequential — replay suite | `test(game): add seeded full-game replay` |

Every `Verify` uses `npm test -- <path>`, which runs `vitest run <path>` (the suite is `node` environment). Subagents must not run `npm run dev`. The orchestrator runs the wave gate (lint → typecheck → full tests, plus build after wave 5) after each wave.

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | Shared vocabulary types + the config object and its test | ⚠️ Cohesive (types are what config is typed over; one small file each) |
| T2 | `normalize` + test | ✅ Atomic |
| T3 | `createRng` + `shuffle` + test | ⚠️ Cohesive (one seeded-randomness module) |
| T4 | Three match functions + test | ⚠️ Cohesive (one file, one shared normalization call) |
| T5 | `fieldPoints` + `scoreRound` + test | ⚠️ Cohesive (one scoring file; `scoreRound` is built on `fieldPoints`) |
| T6 | Round reducer + test | ✅ Atomic |
| T7 | Game reducer + `summarize` + test | ⚠️ Cohesive (one state; `summarize` reads it) |
| T8 | Full-game replay suite | ✅ Atomic |
| T9 | Four rule paragraphs in `game-design.md` | ✅ Atomic |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in an earlier wave? |
| ---- | ---------- | ---- | ---------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T9 | — | 1 | ✅ |
| T4 | T1, T2 | 2 | ✅ |
| T5 | T1 | 2 | ✅ |
| T6 | T1, T4 | 3 | ✅ |
| T7 | T1, T3, T5, T6 | 4 | ✅ |
| T8 | T7 (and all before) | 5 | ✅ |

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | logic | `src/game/types.ts`, `src/game/config.ts`, `src/game/config.test.ts` | — |
| 1 | T2 | logic | `src/game/normalize.ts`, `src/game/normalize.test.ts` | — |
| 1 | T3 | logic | `src/game/rng.ts`, `src/game/rng.test.ts` | — |
| 1 | T9 | docs | `game-design.md` | — |
| 2 | T4 | logic | `src/game/match.ts`, `src/game/match.test.ts` | — |
| 2 | T5 | logic | `src/game/scoring.ts`, `src/game/scoring.test.ts` | — |
| 3 | T6 | logic | `src/game/round.ts`, `src/game/round.test.ts` | — |
| 4 | T7 | logic | `src/game/game.ts`, `src/game/game.test.ts` | — |
| 5 | T8 | logic | `src/game/replay.test.ts` | — |

No manifest, lockfile, barrel, Biome config or entry point is touched. `types.ts` and `config.ts` are written in wave 1 and only read afterwards.

## Tasks

Every logic task: **Invariants** 1, 2, 3 — no React, Zustand, DOM globals, `fetch` or storage; no `Math.random()`, `Date.now()`, `new Date()` or `performance.now()`; import only from `src/game/` (and `vitest` in tests). Imports use the `@/game/…` alias. Tests are table-driven, deterministic, and sit beside the source.

### T1 — Shared types and config

**Wave:** 1 · **Layer:** logic · **Requirement:** R8, R9, E-7
**Depends on:** —
**Owns:** `src/game/types.ts`, `src/game/config.ts`, `src/game/config.test.ts`
**Reads:** `specs/game-engine/design.md` §Types (`types.ts`, `config.ts`), `game-design.md` §Tunable Parameters

**Do:** write `types.ts` exactly as in the design and `DEFAULT_CONFIG` with the starting values from `game-design.md`.

**Done when:**
- [ ] `types.ts` exports `Step`, `STEPS`, `LAST_STEP`, `Field`, `AlbumKind`, `Track`, `Guess`, `Credit`, `Lock`, `Locks` with the design's shapes.
- [ ] `DEFAULT_CONFIG` pins: `clipMs` 1000/2000/4000/7000/11000/16000; `titlePoints` 1000/800/600/400/250/100; ratios 0.3 / 0.5 / 0.5; combos 1.5 / 2.0; random start 1.25; reroll 0.1 / floor 0.5.
- [ ] `config.test.ts` asserts those numbers and that both tables are strictly decreasing across steps 1–6.
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/config` → expect the suite passing; `npm run typecheck`

### T2 — Text normalization

**Wave:** 1 · **Layer:** logic · **Requirement:** E-1
**Depends on:** —
**Owns:** `src/game/normalize.ts`, `src/game/normalize.test.ts`
**Reads:** `specs/game-engine/design.md` §`normalize.ts` (algorithm and test table)

**Do:** implement `normalize(text: string): string` exactly per the design's four steps and version-tag list.

**Done when:**
- [ ] Every row of the design's test table is a test (equal-to-`Song` rows assert `normalize(a) === normalize("Song")`; the "stay distinct" and "itself" rows assert inequality or identity).
- [ ] Idempotent: `normalize(normalize(x)) === normalize(x)` for every table input.
- [ ] A tag is stripped only inside brackets or after a trailing dash; `Live and Let Die` is untouched.
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/normalize` → expect the suite passing

### T3 — Seeded RNG and shuffle

**Wave:** 1 · **Layer:** logic · **Requirement:** R5, E-7
**Depends on:** —
**Owns:** `src/game/rng.ts`, `src/game/rng.test.ts`
**Reads:** `specs/game-engine/design.md` §`rng.ts`

**Do:** implement `Rng`, `createRng(seed)` (mulberry32) and `shuffle(items, rng)` (Fisher–Yates, returns a new array).

**Done when:**
- [ ] Same seed gives the same first 20 values; different seeds differ; values stay in `[0, 1)`.
- [ ] `shuffle` returns a permutation (same multiset), does not mutate its input, and gives the same order for the same seed.
- [ ] A fixed seed pins one literal shuffled order of `[1..10]` (written into the test as a literal).
- [ ] Over 1,000 seeded shuffles of `[0,1,2]`, each of the 6 orders occurs, and none is below 100 or above 240 (a loose uniformity check).
- [ ] Invariant check clean (`Math.random` appears nowhere).

**Verify:** `npm test -- src/game/rng` → expect the suite passing

### T9 — Fold the engine rules into game-design.md

**Wave:** 1 · **Layer:** docs · **Requirement:** E-9
**Depends on:** —
**Owns:** `game-design.md`
**Reads:** `specs/game-engine/spec.md` ledger rows E3–E6

**Do:** add four short statements in the places they belong, without rewording existing rules: the rounding rule (under **Scoring**), the exact suffix list and what stays distinct (under **When Is a Guess Correct?**, replacing the open "…"), the punctuation rule (same place), and the histogram rule (under **End-of-Game Stats**).

**Done when:**
- [ ] Each of E3, E4, E5, E6 is stated once, using the ledger's wording.
- [ ] No other text in the file changes.

**Verify:** `git diff --stat game-design.md` → one file, additions only except the replaced "…" example list

### T4 — Matching

**Wave:** 2 · **Layer:** logic · **Requirement:** E-2, E-3, R7
**Depends on:** T1, T2
**Owns:** `src/game/match.ts`, `src/game/match.test.ts`
**Reads:** `src/game/types.ts`, `src/game/normalize.ts`, `specs/game-engine/design.md` §`match.ts`

**Do:** implement `matchTitle`, `matchArtist` (returns `"main" | "featured" | null`, main wins) and `matchAlbum`.

**Done when:**
- [ ] Title: case/accent/suffix variants match; a different title does not; the artist is never consulted (a track by another artist with the same title text matches).
- [ ] Artist: `artists[0]` → `"main"`; any other listed artist → `"featured"`; an artist not on the track → `null`; if main and a featured normalize equally → `"main"`.
- [ ] Album: variant match (for example `(Deluxe Edition)`); a different album does not.
- [ ] A blank or whitespace-only guess never matches in any field.
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/match` → expect the suite passing

### T5 — Scoring

**Wave:** 2 · **Layer:** logic · **Requirement:** R8, R9, A11, A21
**Depends on:** T1
**Owns:** `src/game/scoring.ts`, `src/game/scoring.test.ts`
**Reads:** `src/game/types.ts`, `src/game/config.ts`, `specs/game-engine/design.md` §`scoring.ts`, `game-design.md` §Scoring

**Do:** implement `fieldPoints`, `ScoreModifiers`, `RoundScore` and `scoreRound` exactly as in the design.

**Done when:**
- [ ] A table over all 6 steps pins title, artist and album points to the literal numbers in `game-design.md` (1000…100, 300…30, 500…50). Expected numbers are written as literals, not derived from `DEFAULT_CONFIG`.
- [ ] A featured-artist lock gives 50% of the artist points (step 5 → 37.5, step 6 → 15).
- [ ] The two stated maximums hold: normal round at step 1 = 2700; album-skipped round at step 1 = 2600.
- [ ] Hat trick: all required locked → combo applies (1.5, or 2.0 skipped); a featured artist still counts; a missing required field → combo 1; a skipped-album round does not need an album.
- [ ] Locks only on artist and album (no title) still score and have no combo.
- [ ] Random start multiplies by 1.25. Paid rerolls follow ×(1 − 0.1·n): n = 0, 1, 2, 5 give 1, 0.9, 0.8, 0.5; n = 6 and 10 stay at the 0.5 floor.
- [ ] The total is rounded once at the end (a case with a 37.5 field and a case where a multiplier leaves a fraction both assert the rounded integer). No locks → total 0.
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/scoring` → expect the suite passing

### T6 — Round reducer

**Wave:** 3 · **Layer:** logic · **Requirement:** R7, R10, E-3, E-4, E-5, A9, A10
**Depends on:** T1, T4
**Owns:** `src/game/round.ts`, `src/game/round.test.ts`
**Reads:** `src/game/types.ts`, `src/game/match.ts`, `specs/game-engine/design.md` §`round.ts`

**Do:** implement `RoundEnd`, `RoundState`, `RoundAction`, `startRound`, `requiredFields` and `roundReducer` per the design's rule list.

**Done when:**
- [ ] `startRound`: step 1, no locks, active; `albumSkipped` is true for `single` and `compilation`, false for `album`; `requiredFields` omits `album` when skipped.
- [ ] All-correct submission at step N → three locks at N, `ended: "complete"`, step stays N. Same for a skipped-album round with title + artist only.
- [ ] Wrong title alone → step + 1, no locks, active. Mixed (title right, artist wrong) → title locked at the **current** step, step advances **once**. Two wrong fields → still one step.
- [ ] A later correct field locks at the later step's number (the step it is guessed at).
- [ ] Featured artist alone → artist locked `featured`, step unchanged, active; a later main-artist guess is ignored (field locked, same state reference).
- [ ] Featured artist + wrong title → artist locked `featured`, step advances once.
- [ ] Skip advances 1→6; skip at step 6 → `ended: "out-of-steps"`. A wrong submission at step 6 ends `out-of-steps`, keeping any locks made by the same submission at step 6.
- [ ] `giveUp` ends `gave-up`, keeps locks, step unchanged.
- [ ] Degenerate input returns the identical state object: empty `{}` guess, whitespace-only fields, only-locked fields, Album guess on a skipped-album round, any action when `ended !== null`.
- [ ] Reducer never mutates its input (assert via a deep-frozen state).
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/round` → expect the suite passing

### T7 — Game reducer and summary

**Wave:** 4 · **Layer:** logic · **Requirement:** R5, R9, R12, E-5, E-6, E-7
**Depends on:** T1, T3, T5, T6
**Owns:** `src/game/game.ts`, `src/game/game.test.ts`
**Reads:** `src/game/types.ts`, `src/game/config.ts`, `src/game/rng.ts`, `src/game/round.ts`, `src/game/scoring.ts`, `specs/game-engine/design.md` §`game.ts`

**Do:** implement `RoundResult`, `GameState`, `GameAction`, `createGame`, `gameReducer` and `summarize` per the design.

**Done when:**
- [ ] `createGame`: `queue` is a permutation of `tracks` (no repeats), identical for the same seed and different for another; starts `phase: "round"` on `queue[0]`, `cursor` 0, no results; the input `tracks` array is not mutated. `rounds` of 0, negative, or above `tracks.length` throws `RangeError`; `rounds === tracks.length` is allowed.
- [ ] A round ending via submit, skip-at-6 or giveUp appends one `RoundResult` scored with `scoreRound` and moves to `phase: "reveal"`; further round actions in `reveal` return the same state.
- [ ] `next` from `reveal` starts `queue[cursor + 1]` at step 1; after the X-th round, `next` finishes the game; `next` in `round` or `finished` is ignored.
- [ ] No track repeats across rounds of one game.
- [ ] `trackFailed` in `round`: no result is added, `results.length` unchanged, the next queue track starts at step 1 (even after skips on the failed one). With the queue exhausted it finishes early (`results.length < rounds`). Outside `round` it is ignored.
- [ ] `summarize`: score = sum of totals; histogram counts by Title lock step; `missed` counts rounds with no Title lock (including artist-only and given-up rounds); `hatTricks` counts hat-trick rounds; `roundsPlayed = results.length`. An empty game summarizes to zeros.
- [ ] Every state returned (all three phases) survives `JSON.parse(JSON.stringify(s))` as deep-equal.
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/game` → expect the suite passing

### T8 — Seeded full-game replay

**Wave:** 5 · **Layer:** logic · **Requirement:** R5, R7–R10, R12, E-7
**Depends on:** T7
**Owns:** `src/game/replay.test.ts`
**Reads:** `src/game/game.ts`, `src/game/rng.ts`, `src/game/types.ts`, `game-design.md` §Scoring

**Do:** drive one scripted 5-round game, seeded, through `gameReducer` with realistic tracks, and assert hand-computed outcomes.

**Done when:**
- [ ] The script covers: a perfect step-1 hat trick (2700); a mixed submission then a later completion; a featured-artist lock; a single-release track with the album skipped (2.0 combo); a skip-to-6 round ending out-of-steps; one give up; one `trackFailed` replacement. Fewer than all of these cannot reach 5 rounds, so queue size is 7 tracks.
- [ ] The expected per-round totals and the final `summarize` are literals worked out by hand from the `game-design.md` tables (comment each with its arithmetic). They are not computed by calling `scoreRound` or `fieldPoints`.
- [ ] Replaying the same seed and actions twice gives deep-equal final states; a different seed gives a different `queue`.
- [ ] The shuffle is made predictable for the script by choosing a seed and asserting the `queue` order first (the track order is then asserted, not assumed).
- [ ] Invariant check clean.

**Verify:** `npm test -- src/game/replay` → expect the suite passing
