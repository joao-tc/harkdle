# Sub-agent dispatch

The orchestrator plans, dispatches, and reconciles. **Generic
subagents (`subagent_type: general-purpose`) do the implementing.** The
split keeps the orchestrator's context clean — file reads, edits, and
test output stay inside the subagent; only the report comes back.

## What runs where

| Activity                                      | Where             | Why                                                        |
| --------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| Sizing, interrogation, design, task planning  | Orchestrator      | Needs the full conversation; can't be delegated coherently |
| Wide codebase research / library docs lookup  | Subagent          | Large output, only the summary matters                     |
| Implementing a task                           | Subagent          | Keeps edits and test noise out of the main context         |
| Every task in a wave                          | One subagent each | The only way work actually runs in parallel                |
| Running the wave gate, reconciling reports    | Orchestrator      | Needs to see across all the tasks                          |
| User-facing gates (`AskUserQuestion`)         | Orchestrator      | Subagents don't talk to the user                           |
| Quick-mode fixes                              | Orchestrator      | Too small to be worth the spin-up                          |

## Launching a wave

Launch **every task in the wave in a single message** — multiple
`Agent` calls in one block. Sequential dispatch of parallel-safe tasks
throws away the whole point of the wave.

```
[one message]
  Agent(subagent_type: "general-purpose", description: "T1 Board state", prompt: <brief T1>)
  Agent(subagent_type: "general-purpose", description: "T2 Move rules", prompt: <brief T2>)
  Agent(subagent_type: "general-purpose", description: "T3 Seeded RNG", prompt: <brief T3>)
```

Wait for all of them. Do not start wave N+1 until every task in wave N
has reported and the wave gate is green.

## The dispatch brief

Each brief is **self-contained**. The subagent has none of the
conversation, none of the interrogation, and no idea what the other
tasks are doing. Everything it needs goes in the prompt.

```
You are implementing task T1 of a planned feature in harkdle (a web game;
stack: <from the Project profile>). Do exactly this task — nothing else.

## Task
<paste the task block from tasks.md verbatim: Layer / Do / Invariants /
Done when / Verify>

## Files you own (you may create or edit ONLY these)
- src/logic/board.ts
- src/logic/board.test.ts

## Files you may read (do NOT modify)
- <neighbour file>  ← mirror this style & test shape
- <any interface/contract excerpt from design.md, pasted inline>
- <the relevant game rule from the spec, pasted inline>

Other agents are editing other files in parallel right now. Writing to a
file you don't own will destroy their work. If the task seems to require
touching a file outside your owned list (manifest, entry point, shared
fixture), STOP and report it instead.

## Invariants you must not break (this task is in the <layer> layer)
<paste the applicable rows from the Project profile's invariant table, e.g.:>
- Logic is headless: no DOM, canvas or framework imports.
- No ambient time or randomness: no Date.now(), new Date(), Math.random().
  Take a clock / seeded RNG as a parameter.
- Dependencies point one way: logic never imports from rendering.
If an invariant is in your way, STOP and report — the design is wrong,
do not work around it.

## Conventions you must follow
<paste the relevant coding-principles.md points, any ADR that governs this
surface, and the neighbouring pattern to mirror>

<Visual-layer tasks ONLY — drop this block for logic tasks:>
## Visual requirements
- Call the logic layer; never restate or re-derive a game rule.
- Check at the viewport(s) named in the task; keyboard/touch input as specced.
- Respect reduced-motion and contrast requirements from the spec.
- Unit tests prove the wiring; the real gate is the browser check and the
  human sign-off listed in "Done when".

## Verify before reporting
Run: <exact verify command from the task, with any per-agent isolation
(output dir / port) the orchestrator assigned>
Expected: <N passing>.

## Report back exactly this
Status:   Complete | Blocked | Partial
Files:    <each file you wrote, one line each on what changed>
Verify:   <the command you ran and its result>
Deviated: <anything you did differently from the task, and why — or "none">
Issues:   <anything the orchestrator needs to know: ambiguity you hit, a
           file you needed but didn't own, an invariant that got in the
           way, a flaky test — or "none">
```

What the subagent **never** gets: the conversation history, the other
tasks' definitions, the full spec, unrelated parts of the codebase.
It's a focused worker, not a co-planner.

## The wave gate

When all reports are in, the **orchestrator** (not a subagent):

1. **Reads the reports.** Any `Blocked` / `Partial` / non-empty
   `Deviated` gets handled before advancing.
2. **Runs the invariant check first** (the profile's Invariants gate;
   if none exists yet, grep for the forbidden imports/calls by hand).
   It's the cheapest check and the one that protects the architecture.
   A new forbidden import, or a `Math.random()` in game logic, is a
   hard stop, not a nit.
3. **Runs the project gates** from the profile (typecheck, tests,
   build) in the shared workspace, now that no subagent is running.
   Tasks verified in isolation; only the gate proves they compose.
4. **Resolves collisions.** If two subagents somehow touched the same
   file, that's a planning bug — reconcile by hand and fix table C for
   the remaining waves.
5. **Cleans up** any per-agent scratch output.
6. **Updates `tasks.md`** with each task's status.
7. **Commits** — one commit per task (or one per wave for tightly
   coupled work). Conventional Commits.

Only then does wave N+1 launch.

## When a task fails

- **Blocked on ambiguity** — the interrogation missed something. Add a
  row to the spec's ledger, ask the user, then re-dispatch.
- **Blocked on a file it doesn't own** — planning bug: the ownership
  split was wrong. Re-plan the wave, don't grant ad-hoc write access.
- **Blocked on an invariant** — the *design* is wrong, not the task.
  Re-open Design; never tell the subagent to break the invariant.
- **Verify failed** — dispatch a fix-forward task with the failure
  output pasted in. Two failed attempts on the same task means the task
  was wrongly sized: split it and re-plan.
- **One task fails, others succeed** — keep the good work, fix the
  failure, don't roll back the wave.

## Anti-patterns

- **Dispatching a wave one agent at a time.** That's just sequential
  execution with extra steps.
- **Delegating interrogation or design.** A subagent producing a spec
  in isolation loses everything the conversation established.
- **Briefs that say "see the plan file" or "follow the spec".** Paste
  what the subagent needs — the task block, its owned files, its
  layer's invariants. Don't make it hunt for context and guess.
- **Accepting "done" as a report.** Enforce the report shape — the
  orchestrator can't reconcile what it can't see.
- **Skipping the invariant check because every task said Complete.**
  That check is how you catch the one subagent that reached for
  `Math.random()` to make its life easier.
