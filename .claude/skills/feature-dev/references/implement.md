# Execute

Covers Quick mode (no plan) and the wave loop (planned features).

## The gates

The gates are defined in SKILL.md's **Project profile**. Use them as
written; don't substitute half-remembered ones, and don't invent gates
the project doesn't have.

Before running any of them:

- **Check they exist.** If the profile still says TBD, or the script is
  not in `package.json`/CI, there is no gate yet — say so and ask the
  user rather than guessing. On a brand-new repo the first task is
  often creating the gate (test runner, typecheck), which is itself a
  planned item.
- **Don't add a linter, formatter or CI step without asking.**
- **Prefer the narrowest gate that proves the change** for per-task
  `Verify`; run the full set at the wave gate.
- **Visual work needs a real browser.** Passing unit tests say nothing
  about whether a screen renders or a game feels right. Run the dev
  server, drive the flow (use the `run` skill if available), and name
  the viewport you checked.

### Parallel verification: isolate shared resources

If two subagents would contend for the same output directory, dev-server
port, or test fixture, give each its own (a per-task output dir, a
distinct port) in its brief. Whatever the toolchain's collision points
are, record them in the Project profile once discovered. The
orchestrator's wave gate uses the shared defaults — by then nothing else
is running.

## Quick mode

For ≤3 files, one-sentence scope, known cause. No interrogation, no
plan files.

1. State the **pre-edit-block**:

   ```
   Files:      src/logic/scoring.ts, src/logic/scoring.test.ts
   Layer:      logic
   Approach:   a repeated letter was double-counted; count each occurrence once
   Verify:     <test command> scoring
   Invariants: 1,2 — no DOM; no ambient clock/RNG
   Decisions:  none
   ```

2. Get approval (`AskUserQuestion`, or just proceed if the user
   already said "just do it").
3. Implement — **only the listed files**.
4. Run the `Verify` command. Show the actual output.
5. Report what changed in one or two sentences.

**If the fix balloons** — a fourth file, a second layer, an
unexpected cause, a real question — stop. It wasn't Quick. Promote to
Medium and interrogate.

## The wave loop (Medium / Large)

For each wave in `specs/<feature>/tasks.md`:

1. **Confirm dependencies.** Every prior wave's tasks are ✅.
2. **Dispatch every task in the wave at once** — one `general-purpose`
   subagent per task, all `Agent` calls in a single message. See
   [sub-agents.md](sub-agents.md).
3. **Collect the reports.** Status / Files / Verify / Deviated /
   Issues.
4. **Run the wave gate** yourself, in this order:
   1. invariants — cheapest, and the most important
   2. typecheck, if the stack has one
   3. tests (full suite)
   4. build

   Tasks were verified in isolation. Only this gate proves they compose.
5. **Review before committing:**
   - Did the invariant check come back clean? A DOM import in the logic
     layer, or ambient time/randomness in a rule, is not a style nit —
     it's the architecture failing.
   - Did any subagent write a file it didn't own? (planning bug — fix
     table C for the remaining waves)
   - Did any deviate from the task? (accept, fix, or escalate — never
     ignore)
   - Did the test count go *up*? A suite that shrank means a test was
     deleted or skipped. Investigate immediately.
   - Any empty/placeholder files? Delete them — structure is created by
     writing logic, not by reserving a name.
   - Would a senior engineer call any of this overcomplicated?
6. **Clean up** any per-agent scratch output.
7. **Commit** — one commit per task, or one per wave for tightly
   coupled work. Conventional Commits, referencing the ADR if one
   governs the change.
8. **Update `tasks.md`** — mark each task ✅ / ❌ / ⚠️.
9. If executing wave-by-wave rather than "execute all", ask:

   ```
   question: "Wave <N> done (<n> tasks, gate green). Continue with wave <N+1>?"
   options: Continue · Pause here · Show me the diff · Re-plan
   ```

## Stop conditions

Stop and re-plan — don't push through — when:

- **A task can only be done by breaking an invariant.** This is the
  loudest possible signal that the design is wrong. Flag it.
- A task needs a file no task owns, or that another wave-mate owns.
- A task's scope grows past what its block described.
- The same task fails verification twice.
- An unforeseen decision surfaces (that's an ADR, not an improvisation).
- The user's answer during interrogation turns out to be wrong or
  impossible. Go back and ask; don't silently reinterpret it.

## Test integrity (non-negotiable, orchestrator and subagents alike)

- Never weaken an assertion to make a test pass.
- Never delete a failing test, or neuter it with skip/`only`/filtering,
  to reduce the failure count.
- Never rewrite a test to match a wrong implementation. If the test is
  genuinely wrong, stop and confirm with the user first.
- **Rule tests are the spec.** Game rules agreed with the user are
  pinned by table-driven tests over an injected clock and seeded RNG.
  Deleting a row because it's inconvenient deletes a rule the user
  agreed to.
- Tests are the spec. The implementation conforms to them, not the
  other way around.

## Finishing the feature

1. Full gate green — invariants, typecheck, tests, build.
2. Every P1 requirement in the spec traced to a passing verification.
   Walk them explicitly: `R1 → T1, T4 → green`.
3. If the feature is user-facing, **actually drive it** in a real
   browser at the viewport(s) the spec named. Green logic tests say
   nothing about whether the screen works or the game feels right;
   list what only a human can sign off.
4. `specs/<feature>/` is committed, not scratch. Leave it in place, but
   bring it in line with what actually shipped — a plan that describes
   work you didn't do is worse than no plan. If it has no further
   value, ask before deleting it.
5. Report honestly. If something is partial, skipped, or still red, say
   so plainly with the output — a green summary over a red suite is the
   worst possible outcome of this skill.
