# Game engine (roadmap item 1) — spec

**Size:** Large (new shared contract that items 5, 7 and 8 consume)
**Sub-phase:** logic (no rendered surface; items 5 and 7 are the visual halves)
**Status:** Draft
**Parent:** [specs/app-v1/spec.md](../app-v1/spec.md), item 1
**Branch:** `feat/1/game-engine` (from `main`)

## Problem

The rules of harkdle exist only as prose in [game-design.md](../../game-design.md). Before any screen or playback code can be built, they have to exist as pure, headless, fully tested code: how a guess is matched, how a round advances and ends, how points are added up, and how an X Tracks game moves from round to round. `src/game/` is that code, and the store (item 5) wires it to the adapter without restating a single rule.

## Ambiguity ledger

The epic ledger (A1–A28) answers most rules. Rows below are the ones this item adds or narrows.

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| E1  | How much of the M2 scoring (mode multiplier, reroll penalty) lands now? | Resolved | The **full R9 formula**, with the M2 inputs defaulted to "none" (no random start, 0 paid rerolls). Config holds ×1.25, −10% per paid reroll and the 50% floor. Tests pin A11. Reroll state, rerolls and start-point selection stay in item 7. |
| E2  | Who handles a track that fails to cue? | Resolved | The game reducer. It holds the **whole shuffled queue** and a cursor. A `trackFailed` action discards the current round unscored and moves to the next track. If the queue runs out, the game finishes early and Results shows the rounds played. |
| E3  | Where are fractional points rounded? | Resolved | Field points stay exact (a featured-artist lock at step 5 is 37.5). The **round total is rounded once**, with `Math.round`, after all multipliers. The running score is a sum of integer totals. |
| E4  | Which version suffixes does normalization strip? | Resolved | The **conservative list**: remaster(ed) [year], feat./ft./featuring, live (including "Live at X"), radio edit, single/album version, mono/stereo version, deluxe/expanded/anniversary/special edition, bonus track. Remix, acoustic, demo, instrumental and cover stay distinct. |
| E5  | What does a round count as in the step histogram? | Resolved | The step where its **Title** was locked. "Missed" = Title never locked, even if artist or album were. This is the same rule as the Endless miss. |
| E6  | How does normalization treat punctuation and spacing? | Resolved | After suffix stripping, **delete every character that is not a Unicode letter, number or whitespace**, then collapse whitespace. "Don’t Stop" = "Dont Stop", "P!nk" = "Pnk". A text that would normalize to empty keeps its trimmed, lowercased, accent-stripped form. |
| E7  | Does `src/game/` ship a seeded RNG? | Resolved | Yes: `createRng(seed)` (mulberry32) and `shuffle(items, rng)` (Fisher–Yates). The composition root seeds it later. |
| E8  | What happens with degenerate input (empty submit, guess for a locked field, any action on an ended round)? | Resolved | It is **ignored**: the reducer returns the same state object. A double-click cannot double-advance. |

**Open: 0**

Category sweep: scope ✅ (E1, E2; start-point selection, rerolls and Endless stay out) · rules ✅ (A6–A12, A21, E3–E6, E8) · layer ✅ (`src/game/` only; nothing else is touched but `game-design.md`) · build order ✅ (item 0 is merged; nothing here depends on items 2–4) · data ✅ (state is plain JSON-serializable data; nothing is persisted, A14) · time/random ✅ (no clock at all; the only randomness is the shuffle, through an injected `Rng`, E7) · behavior ✅ (round and game flow in the design; reveal, countdown and cueing belong to the store) · errors ✅ (E2, E8; programmer errors in `createGame` throw) · contracts ✅ (design: `Track`, `Guess`, `RoundState`, `GameState`, `GameAction`) · platform ✅ (n/a, no DOM) · non-functional ✅ (pure functions; no budget) · fairness ✅ (single-player, A-level) · done ✅

## Requirements

Epic requirement IDs are kept where this item delivers them. `E-` rows are this item's own.

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| R5  | WHEN a game is created THEN the system SHALL shuffle the cleaned list once with the injected RNG, and no track SHALL repeat within that game. | P1 |
| R7  | WHEN a submission contains wrong fields THEN correct fields SHALL lock at the current step, and the step SHALL advance exactly once. | P1 |
| R8  | WHEN a field is locked THEN its points SHALL follow the step table and config: title, artist at 30% (×50% if featured), album at 50%. | P1 |
| R9  | WHEN a round ends THEN its total SHALL be (title + artist + album) × combo × mode multiplier × reroll penalty, rounded once (E3). The combo is 1.5, or 2.0 when the album is skipped, and applies only if every required field is locked. | P1 |
| R10 | WHEN a track's album kind is `single` or `compilation` THEN the round SHALL not require the Album field and SHALL record that it was skipped. | P1 |
| R12 | WHEN a game ends THEN the system SHALL provide the final score, the step histogram (1–6 + missed, E5) and the hat-trick count. | P1 |
| E-1 | WHEN two texts differ only by case, accents, punctuation, spacing or a stripped version suffix (E4, E6) THEN they SHALL normalize to the same string. A suffix not on the list SHALL NOT be stripped. | P1 |
| E-2 | WHEN a guess is judged THEN Title SHALL match on normalized title alone (any artist); Artist SHALL match `artists[0]` as main and any other listed artist as featured; Album SHALL match on normalized album name. | P1 |
| E-3 | WHEN an Artist guess matches a featured artist THEN the Artist field SHALL lock at 50% credit, SHALL cost no step, and SHALL be final. It SHALL still count toward the hat trick (A21). | P1 |
| E-4 | WHEN a round is active THEN it SHALL end when every required field is locked (complete), on a wrong submission or a skip at step 6 (out of steps), or on give up. A wrong submission or skip before step 6 SHALL advance the step by one. | P1 |
| E-5 | WHEN an input is degenerate (E8) THEN the reducer SHALL return the same state object. | P1 |
| E-6 | WHEN the player moves on after a round THEN the game SHALL start the next queue track, or finish after the X-th round. WHEN a track fails to cue THEN the game SHALL discard the round unscored and continue with the next queue track, or finish early if none is left (E2). | P1 |
| E-7 | WHEN the same tracks, rounds, seed and actions are replayed THEN the game SHALL produce the same state. Every state SHALL survive a JSON round trip unchanged. | P1 |
| E-8 | WHEN `src/game/` is linted THEN it SHALL import nothing from React, Zustand, the DOM, `ui/`, `store/` or `spotify/`, and SHALL call no ambient clock or `Math.random` (invariants 1–3). | P1 |
| E-9 | WHEN this item merges THEN `game-design.md` SHALL state the rounding rule (E3), the suffix list (E4), the punctuation rule (E6) and the histogram rule (E5). | P2 |

## Edge cases

- WHEN a track's title is only a version tag (for example `(Live)`) THEN stripping SHALL NOT leave it empty; the unstripped form is used (E6).
- WHEN a guess matches both the main artist and a listed featured artist after normalization THEN main wins.
- WHEN a submission fills only fields that are already locked, or the Album field of a skipped-album round THEN it SHALL be ignored (E8).
- WHEN a mixed submission locks a field and also ends the round at step 6 THEN the lock SHALL be kept at step 6 and the round SHALL end as out-of-steps.
- WHEN `createGame` gets `rounds` below 1 or above the track count THEN it SHALL throw `RangeError`. The UI never allows this (A13), so it is a programmer error.
- WHEN a round is given up with nothing locked THEN its total SHALL be 0 and it counts as missed.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Start-point selection, random start, rerolls, free-reroll budget | Item 7. Scoring already accepts the inputs (E1). |
| Endless mode, lives, "Playlist cleared!" | Item 8. |
| Round-count presets (5/10/20) | UI and picker rules (A13), item 5. `createGame` takes any valid `rounds`. |
| Suggestion index and autocomplete | Item 2. The engine only judges the strings it is handed. |
| Reveal playback, countdown, cueing, shortcuts | Items 3 and 5. |
| `durationMs`, `uri` on `Track` | The engine does not need them yet. The store keeps the full Spotify track by `id`. |
| Persisting a game | A14. |

## Done when

- [ ] `npm test -- src/game` is green, and every P1 requirement above traces to a passing test.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` are green on the branch, and the invariants test still proves each rule fires.
- [ ] A scripted, seeded full game replays to hand-computed scores (the oracle numbers come from the `game-design.md` tables, not from the scoring code).
- [ ] `game-design.md` carries the four rules from E-9.
