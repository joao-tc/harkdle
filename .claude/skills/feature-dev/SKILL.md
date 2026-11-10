---
name: feature-dev
description: Interrogate→plan→approve→execute workflow for feature work in harkdle (a web game). Interrogates the user until no ambiguity is left (explicit ambiguity ledger), then produces a plan whose tasks are split into parallel waves of disjoint-file work dispatched to generic subagents. Plans by default; executes only for quick fixes or on an explicit user signal. Three sizes (Quick / Medium / Large). Architectural decisions become ADRs in docs/adr/. Use when implementing a feature, planning a change, fixing a bug, or making a design decision. Triggers on "implement feature", "plan feature", "build X", "add X", "quick fix", "small change", "design decision", "draft ADR", "plan and execute", "implement now". Do NOT use for pure docs edits.
---

# feature-dev

Interrogate → plan → approve → execute. Nothing gets built on a
guess: the skill asks until its ambiguity ledger is empty, and the
plan it produces is structured so independent work runs in parallel
across generic subagents instead of dribbling out one file at a time.

```
┌─────────────┐   ┌────────┐   ┌───────┐   ┌─────────┐
│ INTERROGATE │ → │ DESIGN │ → │ TASKS │ → │ EXECUTE │
└─────────────┘   └────────┘   └───────┘   └─────────┘
  ledger must      ADR-bearing   parallel    gated on
  reach empty      choices only  waves       approval

     auto-sized — phases skip when scope doesn't need them
```

## Project profile — the one section to keep current

harkdle is a **client-only React SPA** that plays Spotify tracks through
the Web Playback SDK ([ADR-0001](../../../docs/adr/0001-stack-and-playback.md),
[app spec](../../../specs/app-v1/spec.md)). Everything stack-specific
lives here and nowhere else, so the rest of the skill never goes stale.

| Field | Value |
| ----- | ----- |
| Stack (language, framework, renderer, bundler) | TypeScript, React 19, Vite, Tailwind 4 + shadcn/ui, Zustand (vanilla store), Biome, Vitest. `@tanstack/query-core` inside `src/store/` (ADR-0002). |
| Package manager | npm |
| Layout (where logic / rendering / data live) | `src/game/` rules (pure; item 1) · `src/spotify/` auth, Web API, playback adapter (`playback/sdk/` holds the only SDK types) · `src/store/` Zustand stores, no React · `src/ui/` screens, `src/ui/primitives/` generated shadcn · `src/main.tsx` composition root (the only place real `fetch`, `Date.now`, `localStorage`, `location` are passed in) · `tools/` repo tooling and its tests |
| Persistence & hosting | `localStorage`, versioned (`harkdle.*` keys). GitHub Pages via Actions (item 4). No backend, no URL routing: the current screen is store state. |

**Gates** — the project's real commands (from `package.json`).

| Gate | Command | Notes |
| ---- | ------- | ----- |
| Typecheck | `npm run typecheck` | `tsc --noEmit` |
| Lint / format | `npm run lint` | `biome check .`; also enforces the invariants |
| Test (all) | `npm test` | `vitest run`; node environment, screens opt into jsdom per file |
| Test (one suite) | `npm test -- <path>` | e.g. `npm test -- src/spotify/auth` |
| Build | `npm run build` | `tsc --noEmit && vite build` |
| Invariants | `npm run lint && npm test -- tools/invariants` | the second command proves each rule fires on a violating fixture |

Dev server: `npm run dev` on `http://127.0.0.1:5173` (never `localhost`:
Spotify rejects it and the PKCE verifier lives per origin). Parallel
subagents must not start it; the orchestrator owns the port.

**Invariants** — rules that must hold regardless of feature.

| # | Invariant | Why | Enforced by |
| - | --------- | --- | ----------- |
| 1 | Game rules/logic are **pure and headless**: `src/game/` imports no React, Zustand, DOM globals, `fetch` or storage, and nothing from `ui/`, `store/`, `spotify/` | Rules must be unit-testable and replayable without a browser | Biome `noRestrictedImports` / `noRestrictedGlobals` override on `src/game/**` |
| 2 | **No ambient time or randomness** in game logic: `Math.random()`, `Date.now()`, `new Date()`, `performance.now()` are errors there; clock and RNG are injected (seeded RNG) | Deterministic tests, replays, and any daily/seeded mechanic | `rules/no-ambient.grit` under the `src/game/**` override |
| 3 | Dependencies point one way: `ui → store → spotify → game` (`ui` may also use `game`). `spotify` and `store` import no React; `ui` never imports `spotify` (it gets types re-exported by the store) | Keeps logic reusable and the renderer swappable | Biome `noRestrictedImports` overrides per layer |
| 4 | Persisted/serialized state carries a version, and an unknown or corrupt version reads as "nothing saved" | Schema changes must not corrupt saved progress | Tests (`src/spotify/auth.test.ts`; each new persisted shape adds its own). Not mechanical. |
| 5 | **No Spotify SDK types outside the `PlaybackAdapter` implementation** (`src/spotify/playback/sdk/**`) | One file absorbs the SDK's quirks | Biome `noRestrictedGlobals` denies the global `Spotify` (value and type positions) outside `src/spotify/playback/sdk/**`; `rules/no-sdk-types.grit` denies `window.Spotify` / `globalThis.Spotify` there too. `tools/invariants.test.ts` probes both. |

`tools/invariants.test.ts` writes a violating file per rule into a temp
directory and asserts Biome flags it, so a rule that silently stops
working fails `npm test`.

If an invariant or gate changes, this section and the mechanism enforcing
it are updated **in the same commit**.

## Where the project's knowledge lives

Read these before planning, in this order; whichever don't exist yet are
themselves a gap to flag:

1. The code and its neighbouring patterns.
2. A product/game spec if one exists (README, `docs/`, `specs/`) — what
   the game is and its rules. If the rules aren't written down, the
   first Interrogate for any gameplay feature writes them down.
3. `docs/adr/` — decisions already made. Cite, don't re-litigate.
4. Official docs for the framework/library in question.
5. Otherwise flag: "I'm not certain about X — needs verification."

## Four rules that define this skill

1. **No ambiguity survives Interrogate.** Every unknown becomes a
   numbered ledger entry. The skill cannot leave the phase while a
   single entry is `Open`. See
   [references/interrogate.md](references/interrogate.md).
2. **The plan is parallel by construction.** Tasks are grouped into
   waves; within a wave, every task owns a **disjoint set of files**
   and is dispatched to its own generic subagent, all launched
   together. See [references/tasks.md](references/tasks.md) and
   [references/sub-agents.md](references/sub-agents.md).
3. **Plan-only by default.** The skill stops after the plan and waits
   for an explicit execute signal. Only Quick tasks and explicit
   overrides ("implement now", "plan and execute", "go ahead") skip
   the gate.
4. **The invariants are not negotiable.** The profile's invariant table
   runs on every wave, and a red invariant is never "fixed" by relaxing
   the check. If a task needs to break one, the design is wrong: stop,
   say so, re-plan.

## Auto-sizing

Complexity picks the depth. Classify before doing anything else, and
say which size you picked and why.

| Size       | Triggers                                                        | Pipeline                                              |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **Quick**  | ≤3 files, one-sentence scope, cause already known               | pre-edit-block → execute (no interrogation)           |
| **Medium** | clear feature, ≤5 atomic steps, one layer, no new pattern       | Interrogate → Tasks (inline) → gate → execute         |
| **Large**  | crosses layers, new pattern, new shared contract, or a decision | Interrogate → Design (+ADRs) → Tasks → gate → execute |

Rules:

- **Interrogate and Execute are always required** for Medium and
  Large. You always need to know WHAT, exactly, and then DO it.
- **Quick skips interrogation** — that's what makes it Quick. If a
  "quick fix" raises a real question, it was never Quick: promote it
  to Medium and interrogate.
- **Anything that crosses a layer boundary is Large** (e.g. new game
  state that both logic and rendering consume, or that gets persisted).
  It's a contract between two sides and gets a Design phase.
- **Work with both logic and a rendered surface splits logic/visual
  before sizing** — see below. Don't size a mixed plan as one.
- **Design is skipped** when there is no architectural decision, no
  new pattern, and no new cross-layer contract.
- **Tasks is written to a file** for Large; for Medium it can stay
  inline — but if the inline list exceeds 5 steps, or any two steps
  could run in parallel, write `tasks.md`.
- When torn between two sizes, pick the larger. Over-planning costs
  minutes; under-planning costs a rewrite.

## The logic/visual split

A game feature usually has **rules** (what happens) and a **surface**
(how it looks and feels). They are verified differently, so plan them
separately when both are non-trivial.

- **Logic sub-phase** — everything headless: rules, state transitions,
  scoring, generation, persistence, input→action mapping. Verified by
  automated tests with injected clock/RNG. Imports nothing from the
  renderer.
- **Visual sub-phase** — rendering, layout, animation, audio, input
  capture. **Depends on the logic sub-phase being merged and green**;
  writes no rules — it consumes the logic's API. Its acceptance gate is
  driven in a real browser (and at mobile viewport if the game
  supports it), plus manual sign-off for feel — never "renders
  correctly" in the logic gate.
- **Two folders:** `specs/<feature>-logic/` + `specs/<feature>-visual/`,
  each with its own spec (+ design/tasks per size).
- **Don't split** when there's no surface (pure logic change), or when
  the screen merely renders a rule that already exists and is green —
  manufacturing an empty logic spec is bureaucracy, not rigor. Test:
  *which half holds a rule worth testing?* If "none", it's one visual
  item.

Size each sub-phase on its own.

## Don't scaffold ahead

Structure is created by writing real logic, not by reserving names. A
task whose deliverable is an empty file or a `// TODO` is not a task.
Likewise don't plan work a later, unproven layer owns (e.g. persistence
or polish before the core rules loop is tested). If the user asks for
something out of order, say so and ask whether to reorder deliberately.

## Interrogate — the ambiguity ledger

The spec carries a ledger. Every open question is a row:

| ID  | Question                                              | Status     | Answer                             |
| --- | ----------------------------------------------------- | ---------- | ---------------------------------- |
| A1  | Does an abandoned round count toward the streak?      | Resolved   | No — only completed rounds         |
| A2  | Copy for the empty-state message?                     | Discretion | Agent decides.                     |
| A3  | Is progress per-device or per-account?                | **Open**   | —                                  |

- Sweep for ambiguity across all categories in
  [references/interrogate.md](references/interrogate.md) — scope,
  rules, data, time & randomness, behavior, errors, contracts, layer
  placement, platform, non-functional, done-definition. Ambiguity you
  didn't think to ask about is the failure mode; the sweep exists to
  catch it.
- Ask in batches of 2-4 via `AskUserQuestion`, with concrete options
  (not "Option A / Option B").
- Answers spawn new entries. Keep sweeping until a full round adds
  nothing new.
- `Discretion` is a valid resolution — but only when **the user** says
  "you decide", never when the agent decides to stop asking.
- **Exit condition: zero `Open` rows.** Present the ledger with the
  spec; if a row is still open, the phase isn't done.

## Parallel-by-construction planning

See [references/tasks.md](references/tasks.md).

- **One task = one deliverable** — one module/type, one rule, one
  component, one scene, one test suite. "Implement scoring" is not a task.
- **Every task names its layer** (as defined in the profile's layout).
  A task spanning two layers is two tasks, or a design bug.
- **Waves, not a queue.** A wave is a set of tasks whose dependencies
  are all satisfied and whose **owned-file sets are pairwise
  disjoint**. Every task in a wave launches at once, one generic
  subagent each.
- **File ownership is declared, not inferred.** Each task lists the
  files it *writes* (`Owns`) and *reads* (`Reads`). Wave-mates may read
  the same file; they may never write the same file.
- **Tests ride with their task.** A task that writes code writes that
  code's tests.
- Validate the plan with the three tables in `tasks.md` —
  granularity, dependency cross-check, file-ownership disjointness. Any
  ❌ means restructure before showing the user.

## Sub-agent dispatch

The orchestrator plans and reconciles; **generic subagents
(`subagent_type: general-purpose`) do the implementing.**

| Activity                                          | Runs where        |
| ------------------------------------------------- | ----------------- |
| Sizing, interrogation, design, task planning      | Orchestrator      |
| Codebase research / docs lookups (large output)   | Subagent          |
| Implementing a task                               | Subagent          |
| Every task in a wave                              | One subagent each |
| Wave reconciliation, gate runs, user-facing gates | Orchestrator      |
| Quick-mode fixes                                  | Orchestrator      |

Each dispatch brief is **self-contained**: task definition, owned/read
files, layer invariants, needed code excerpts, verify command, report
format — never the conversation history, never other tasks' definitions.
Contract and templates: [references/sub-agents.md](references/sub-agents.md).

## The pre-edit-block

Before any non-trivial edit — including inside Quick mode — state this
and get approval:

```
Files:      <only what this edit touches>
Layer:      <per the profile's layout>
Approach:   <one sentence>
Verify:     <the exact command that proves it works>
Invariants: <which apply, and why this edit keeps them>
Decisions:  <none | ADR-NNNN | NEW>
```

`Decisions: NEW` means stop and run the ADR flow
([references/adr-authoring.md](references/adr-authoring.md)) before
writing code.

## ADRs

When an architectural decision surfaces (during Interrogate or Design,
or when a pre-edit-block flags `NEW`):

1. **Draft** `docs/adr/NNNN-<slug>.md`, status `Proposed`. Create
   `docs/adr/` if missing; take the next number by scanning it.
2. **Confirm** with the user via `AskUserQuestion` before `Accepted`.
3. **Land it before the code** it governs, in its own commit.

An ADR is warranted when the choice is expensive to reverse, binds
future code, or a competent reader would ask "why is it like this?"
Nothing else. Details: [references/adr-authoring.md](references/adr-authoring.md).

## Artifacts

| Artifact         | Location                     | Lifetime  |
| ---------------- | ---------------------------- | --------- |
| Spec (+ ledger)  | `specs/<feature>/spec.md`    | Committed |
| Design           | `specs/<feature>/design.md`  | Committed |
| Tasks            | `specs/<feature>/tasks.md`   | Committed |
| Decisions (ADRs) | `docs/adr/NNNN-<slug>.md`    | Permanent |

One sub-folder per feature, created **before** non-trivial
implementation starts and kept updated if the plan changes. They are
committed and stay — write them for a reader and prune them when stale.

## Verification chain

```
1. Codebase   → existing code, neighbouring patterns, package manifest
2. Project    → specs, docs/adr/, README
3. Docs       → official docs for the library at the version in the lockfile
4. Flag       → "I'm not certain about X — needs verification"
```

**Never assume or fabricate.** A hallucinated library API poisons
design → tasks → every subagent downstream. When unsure a symbol exists
in the installed version, say so and check.

## Coding principles

Read [references/coding-principles.md](references/coding-principles.md)
before implementing, and paste the relevant parts into every subagent
brief. Highlights: touch only listed files; never weaken or delete a
test to get green; no abstraction for single-use code; no empty
placeholder files; ask "would a senior engineer call this
overcomplicated?"

## Triggers

| User says…                                                   | Mode                          |
| ------------------------------------------------------------ | ----------------------------- |
| "Quick fix", "small change", "just do X"                     | Quick (auto-execute)          |
| "Implement X", "add X", "build X", "plan X", "design X"      | Medium / Large (plan-only)    |
| "Implement X now", "plan and execute X", "go ahead and code" | Medium / Large (auto-execute) |
| "This is a design decision", "draft an ADR for X"            | ADR flow                      |

## File map

| File                                                               | Purpose                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| [references/interrogate.md](references/interrogate.md)             | Ambiguity ledger, category sweep, question protocol, spec  |
| [references/design.md](references/design.md)                       | Design phase, layer placement, decision table, ADR triggers |
| [references/tasks.md](references/tasks.md)                         | Atomic tasks, parallel waves, shared touchpoints, validation tables |
| [references/sub-agents.md](references/sub-agents.md)               | Dispatch brief, parallel launch, report contract           |
| [references/implement.md](references/implement.md)                 | Quick mode, execute loop, gates, commits                   |
| [references/adr-authoring.md](references/adr-authoring.md)         | ADR scope test, numbering, template                        |
| [references/coding-principles.md](references/coding-principles.md) | Behavioral checklist for orchestrator and subagents        |
