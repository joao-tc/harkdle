# Tasks

**Goal:** turn the design into atomic tasks grouped into **waves of
parallel, disjoint-file work** that generic subagents can execute
concurrently. Output: `specs/<feature>/tasks.md`.

A plan that lists ten sequential steps when six of them could have run
at once is a bad plan, even if every step is correct.

## Atomic tasks

**One task = one deliverable.** One type, one rule, one component, one
scene, one test suite.

| Vague (bad)              | Atomic (good)                                                                  |
| ------------------------ | ------------------------------------------------------------------------------ |
| "Implement scoring"      | T1 score value types · T2 per-move scoring rule · T3 bonus/penalty rules · T4 round total |
| "Build the game screen"  | T1 board component · T2 input handler · T3 HUD · T4 end-of-round overlay        |
| "Add validation"         | T1 error types · T2 input validator · T3 saved-data validator                   |

**Every task names its layer** (per the Project profile). A single task
that lands code in two layers is really two tasks (or a design bug: the
contract between them belongs in `design.md`, decided before either is
written).

Granular tasks parallelize, verify independently, and give a subagent
a single focus it can't drift from. Vague tasks produce sprawl.

## Building waves

A **wave** is a set of tasks that all launch at the same time, one
subagent each. A task joins wave *N* when:

1. **Every dependency is satisfied** by a task in wave < N. Respect the
   layer graph: a rendering task that consumes a new logic type can't
   share a wave with the task creating it.
2. **Its owned-file set is disjoint** from every other task in the
   wave. Two tasks may *read* the same file; they may never *write* the
   same file.
3. **It shares no other mutable resource** with a wave-mate — build
   output directories, a dev-server port, a test database or save
   fixture, a lockfile. Give each subagent isolated ones where the
   toolchain would otherwise collide (see [implement.md](implement.md)).

### Declare ownership per task

Every task states:

- **Layer** — where it lands.
- **Owns** — files it creates or edits. Exclusive within the wave.
- **Reads** — files it needs for context but must not modify. Freely
  shared.

Ownership is declared, never inferred. If you can't say which files a
task will write, the task isn't specified well enough to hand to a
subagent.

### The touchpoints that collide

New files in separate paths rarely collide. These do — **serialize them
into a single integration task** rather than letting two subagents write
them:

| Shared touchpoint | When it collides |
| ----------------- | ---------------- |
| Manifest / lockfile (`package.json`, lockfile) | Adding a dependency or script |
| Barrel / index files | Several tasks re-exporting from the same `index` (prefer not having barrels at all) |
| Entry point, scene/route registry, root component | Wiring a new screen or system into the app |
| An existing file two tasks both extend | Both adding cases/methods to the same module — one owns it, or split it |
| Shared test fixtures / sample states | Two suites extending the same builder |
| Config (bundler, TS, CSS tokens, asset manifest, i18n strings) | Multiple tasks adding keys to one file |

**Rule:** no wave contains two tasks that write the same touchpoint.
Factor those edits into one **integration task** that runs after the
wave and owns all the touchpoint files at once. It's usually small and
mechanical.

```
Wave 1 (parallel):  T1 Board state     → logic, owns src/logic/board.ts (+ test)
                    T2 Move rules      → logic, owns src/logic/moves.ts (+ test)
                    T3 Seeded RNG      → logic, owns src/logic/rng.ts (+ test)
Wave 2 (sequential): T4 wire into entry point → integration, owns src/main.ts
```

### Right-size the fan-out

Aim for **2-5 tasks per wave**. One task in a wave is fine (it's just
sequential). More than ~6 concurrent subagents tends to produce more
reconciliation work than it saves wall-clock time — split into two
waves instead.

## Tests ride with the task

The task that writes code writes that code's tests. "Tests in a later
task" is deferral, and deferred tests don't get written. Each task
carries a **Verify** command that proves it in isolation — its own
suite:

```
Verify: <project test command> <path or filter for this task's suite>   → expect N passing
```

The gate commands come from SKILL.md's Project profile — never invent
one; a subagent runs exactly what you wrote. Time- and chance-dependent
tasks verify against an **injected clock/seeded RNG**, never the real
ones — a test that passes only on a Tuesday, or on a lucky seed, is not
a test.

Visual tasks can't be fully proven by unit tests; their **Done when**
includes the browser check (viewport named) and what a human must
sign off.

## Three validation tables (mandatory)

Run these before showing the plan. Any ❌ means restructure and re-run
— don't present a plan with a failing row.

### A — Granularity

| Task | Scope                    | Verdict   |
| ---- | ------------------------ | --------- |
| T1   | 1 type + test            | ✅ Atomic |
| T2   | 3 scoring rules          | ❌ Split  |

✅ one type / rule / component / suite. ⚠️ 2-3 cohesive things in one
file, if genuinely cohesive. ❌ anything more, or anything spanning two
layers — split it.

### B — Dependency cross-check

The wave assignment and the `Depends on` fields are separate artifacts
and they drift. Verify they agree.

| Task | Depends on | Wave | Deps satisfied in earlier wave? |
| ---- | ---------- | ---- | ------------------------------- |
| T1   | —          | 1    | ✅                              |
| T4   | T1, T2, T3 | 2    | ✅                              |
| T5   | T4         | 2    | ❌ same wave as its dependency  |

Rules: a task never shares a wave with its own dependency; every
`Depends on` names a real task ID; the wave order never contradicts
the layer graph.

### C — File-ownership disjointness

**The table that makes parallelism safe.** For each wave, list every
task's owned files and prove no file appears twice.

| Wave | Task | Layer | Owns                                              | Collision? |
| ---- | ---- | ----- | ------------------------------------------------- | ---------- |
| 1    | T1   | logic | `src/logic/board.ts`, `src/logic/board.test.ts`   | —          |
| 1    | T2   | logic | `src/logic/moves.ts`, `src/logic/moves.test.ts`   | —          |
| 2    | T4   | —     | `src/main.ts` (integration)                       | —          |

Any file appearing under two tasks in the same wave → ❌. Fix by moving
one task to a later wave, or by factoring the shared file into an
integration task.

## Template — `specs/<feature>/tasks.md`

```markdown
# <Feature> — tasks

**Spec:** `specs/<feature>/spec.md` · **Design:** `specs/<feature>/design.md`
**Status:** Draft | Approved | In progress | Done

## Execution plan

| Wave | Tasks      | Mode                     |
| ---- | ---------- | ------------------------ |
| 1    | T1, T2, T3 | parallel — 3 subagents   |
| 2    | T4         | sequential — integration |
| 3    | T5, T6     | parallel — 2 subagents   |

## Validation

**A — Granularity:** ✅ · **B — Dependencies:** ✅ · **C — File ownership:** ✅

[paste the three tables]

## Tasks

### T1 — <Create the board state type>

**Wave:** 1
**Layer:** logic
**Requirement:** R1
**Depends on:** —
**Owns:** `src/logic/board.ts`, `src/logic/board.test.ts`
**Reads:** `specs/<feature>/design.md` §Types, <neighbour file to mirror>

**Do:** [one sentence — the exact deliverable]

**Invariants:** [which apply — e.g. "1,2: no DOM imports; RNG injected"]

**Done when:**
- [ ] <observable condition>
- [ ] <observable condition>
- [ ] Tests written and passing
- [ ] Invariant check clean

**Verify:** `<test command> <filter>` → expect N passing

### T4 — <Wire the new system into the entry point> (integration)

**Wave:** 2
**Layer:** — (integration)
**Requirement:** R1, R2
**Depends on:** T1, T2, T3
**Owns:** `src/main.ts`
**Reads:** the files T1-T3 created

**Do:** [one sentence]

**Done when:**
- [ ] Build succeeds
- [ ] Full suite green

**Verify:** `<build command> && <test command>`
```

## Exit gate

`AskUserQuestion`:

```
question: "Tasks ready — <N> tasks in <W> waves (validation: ✅). Execute?"
options:
  - Plan only        (default — keep tasks.md and stop)
  - Execute wave 1   (run the first wave, report, then ask again)
  - Execute all      (run every wave through to done)
  - Revise           (capture feedback, re-draft)
  - Cancel
```

Skip this gate only when the user already gave an execute signal
("implement now", "plan and execute", "go ahead").

## Anti-patterns

- **A queue disguised as a plan.** If every task depends on the
  previous one, challenge it — usually the tasks are too coarse and
  splitting them reveals real parallelism. (Pure logic modules are
  usually a textbook parallel wave.)
- **Parallelizing two tasks that write the manifest, entry point or a
  registry.** The reason table C is mandatory.
- **A task that spans two layers.** That's a contract; it belongs in
  `design.md` before either side is coded. Split it.
- **Deferring tests to a "testing task".** Tests belong to the task
  that writes the code.
- **Two subagents sharing a mutable resource** (output dir, port, save
  fixture). Isolate them.
- **Tasks that name no files.** A task a subagent can't scope is a task
  it will scope for you, badly.
