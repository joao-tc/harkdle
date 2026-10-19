# Interrogate

**Goal:** leave the phase with **nothing ambiguous**. The output is
`specs/<feature>/spec.md`, whose ambiguity ledger has zero `Open` rows.

Required for Medium and Large. Quick skips it — but if a Quick task
raises a genuine question, it was misclassified: promote to Medium and
interrogate.

## The ambiguity ledger

The ledger is the phase's exit criterion, not a formality. Every
unknown the agent hits — while reading the request, while reading the
code, while hearing an answer — becomes a row.

| ID  | Question                                                | Status     | Answer                             |
| --- | ------------------------------------------------------- | ---------- | ---------------------------------- |
| A1  | Does an abandoned round count as a loss?                | Resolved   | No — it's discarded                |
| A2  | Copy for the empty-state message?                       | Discretion | Agent decides.                     |
| A3  | Is progress per-device or synced?                       | **Open**   | —                                  |

Status values:

- **Open** — unanswered. **Blocks the phase.**
- **Resolved** — the user answered; the answer is written down.
- **Discretion** — the user explicitly said "you decide". Only the
  *user* can put a row here. The agent deciding it's not worth asking
  is exactly the failure this ledger exists to prevent.

**Exit condition: zero Open rows, and a full sweep round that produced
no new rows.** Answers spawn questions; keep going until the sweep
comes back empty.

## The category sweep

Ambiguity you never thought to ask about is what sinks a feature. Walk
every category below, out loud, on every Medium/Large feature. Most
will be "n/a" — say so, then move on. Any category you can't answer
from the request or the codebase becomes a ledger row.

| Category              | Ask yourself                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Scope boundary**    | What is explicitly NOT in this? What will the user assume that isn't included? Is it already on the out-of-scope list? |
| **Rules**             | What are the exact game rules this touches — win/lose/score conditions, valid/invalid moves, tie-breaks? Are they written down anywhere, or only in the user's head? |
| **Layer placement**   | Which layer owns this (logic, rendering, data)? Does it cross a boundary (→ Design)? Does it belong in the pure logic layer — and if so, does it stay headless? |
| **Build order**       | Is a prerequisite layer actually proven yet (e.g. is the core rules loop tested before persistence or polish)? |
| **Data & state**      | What's stored, where, in what shape? Derived or persisted? Source of truth? Does it need a schema version? |
| **Time & randomness** | Where does "now" come from? Any daily/seeded/reset mechanic — whose timezone, what boundary? Where does randomness come from, and is it seedable/replayable? |
| **Behavior**          | Exact flow, step by step. What happens on pause, tab hidden/refocused, reload mid-game, window resize, game already finished? |
| **Errors & edges**    | Invalid input, empty state, corrupt or outdated saved data, storage unavailable/full, rapid repeated input, double-submit. What does the player see? |
| **Contracts**         | What signature do consumers see? New shared type or event? Breaking an existing public shape? Does it change the saved-data format? |
| **Platform**          | Which browsers/devices? Touch, keyboard, gamepad? Mobile viewport? Offline? Does anything need a network or a backend, and is that decided? |
| **Non-functional**    | Frame rate / input latency budget, bundle size and load time, accessibility (keyboard, contrast, reduced motion, screen readers), audio autoplay rules. |
| **Fairness / abuse**  | If there's a score, daily puzzle, or leaderboard: can the client cheat, and does that matter here? Is the answer/seed exposed in shipped code? |
| **Done-definition**   | How do we prove it? Which test suite? For visuals, driven in a real browser — at which viewport(s)? Which parts need manual feel sign-off? |

If three or more categories yield real ambiguity — or layer
placement/contracts are unclear — the feature is **Large**. Promote it
and continue.

## Question protocol

- **Batch 2-4 questions per `AskUserQuestion` call.** Interrogation
  should feel like a fast conversation, not an interview loop.
- **Concrete options only.** "Hard mode reveals no hints" and "Hard mode
  limits hints to one", not "Option A" / "Option B". If you can't
  enumerate 2-4 concrete options, the question is open-ended — ask it in
  prose instead.
- **Recommend.** Put the option you'd pick first and mark it
  "(Recommended)". You are a thinking partner, not a form.
- **Challenge vagueness.** "Fast" means what latency? "Fun" means what
  observable behavior? "Handle the error" means show what, where? Push
  back — never transcribe a fuzzy answer into the spec.
- **Offer "you decide"** when the answer genuinely doesn't matter to
  the user — that's how a row legitimately becomes `Discretion`.
- **Interrogate the code and the docs too.** Half the answers are in
  the repo: existing code, any spec/README, and `docs/adr/`. Don't spend
  a question on something already settled — re-asking is its own
  failure. Read first; delegate heavy exploration to a subagent and
  keep only the summary.
- **Disagree when warranted.** If the requested approach fights the
  architecture or an accepted ADR — rules logic reaching into the
  renderer, ambient `Math.random()`/`Date.now()` in game logic, a
  secret shipped to the client — say so and why. Sycophancy here
  compounds into a bad build.

## Scope guard

The feature boundary set at the start of Interrogate is fixed. New
capabilities that surface mid-interrogation are **deferred**, not
absorbed:

> "That's a separate feature — I'll note it as deferred and keep it out
> of this plan. Back to <topic>."

Deferred ideas go in the spec's out-of-scope table with a reason. Don't
re-open an excluded item without the user explicitly overriding it.

## Template — `specs/<feature>/spec.md`

```markdown
# <Feature> — spec

**Size:** Medium | Large
**Sub-phase:** logic | visual | single
**Status:** Draft | Approved

## Problem

[2-3 sentences: the pain or the player-facing goal, and why now.]

## Ambiguity ledger

| ID  | Question   | Status                     | Answer        |
| --- | ---------- | -------------------------- | ------------- |
| A1  | <question> | Resolved                   | <answer>      |
| A2  | <question> | Discretion (user's choice) | Agent decides |

**Open: 0** ← must be zero to leave Interrogate.

Category sweep: scope ✅ · rules ✅ · layer ✅ · build order ✅ · data ✅ ·
time/random ✅ · behavior ✅ · errors ✅ · contracts ✅ · platform ✅ ·
non-functional ✅ · fairness ✅ · done ✅

## Requirements

Each is testable and traceable. `WHEN <event> THEN system SHALL
<behavior>`.

| ID  | Requirement                                             | Priority |
| --- | ------------------------------------------------------- | -------- |
| R1  | WHEN <event> THEN system SHALL <behavior>               | P1       |
| R2  | WHEN <edge case> THEN system SHALL <graceful handling>  | P1       |
| R3  | WHEN <event> THEN system SHALL <behavior>               | P2       |

P1 = must ship. P2 = should. P3 = nice-to-have.
If a requirement can't be written as WHEN/THEN/SHALL, it isn't crisp
enough — go back and ask.

## Edge cases

- WHEN <boundary> THEN system SHALL <behavior>
- WHEN <failure> THEN system SHALL <behavior>

## Out of scope

| Excluded | Reason                                  |
| -------- | --------------------------------------- |
| <thing>  | <non-goal / later feature / …>          |

## Done when

- [ ] <observable, measurable outcome>
- [ ] <the command that proves it (test suite green) + the flow driven in a real browser at <viewport>>
```

## Exit gate

`AskUserQuestion`:

```
question: "Spec ready — ledger has 0 open rows. Proceed?"
options:
  - Proceed        (→ Design if Large, → Tasks if Medium)
  - Revise         (capture feedback, re-draft)
  - More questions (something still feels underspecified)
  - Cancel
```

## Anti-patterns

- **Resolving a row by guessing.** A row moves to `Resolved` only with
  the user's answer, or to `Discretion` only with the user's
  permission.
- **Asking what the repo already answers.** Read the code, docs and ADRs
  first.
- **One question per turn.** Batch them; respect the user's time.
- **Accepting "make it good".** That's not an answer — make it concrete
  or make it a ledger row.
- **Skipping the rules category because "everyone knows how it works".**
  Unwritten game rules are the most expensive ambiguity there is.
