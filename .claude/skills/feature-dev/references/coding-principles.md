# Coding principles

Behavioral bias, not a checklist. The orchestrator reads this before
executing; every subagent brief pastes in the parts that apply.

## Before coding

- **State assumptions.** If two readings of the task exist, name both —
  don't silently pick one.
- **Simpler path available?** Say so, even if the plan says otherwise.
- **Something unclear?** Stop and ask. In a dispatched task: report
  `Blocked` with the question. Guessing inside a subagent is how a wave
  produces confidently wrong code.
- **The user's approach seems wrong?** Say so, with the reason. Don't
  be sycophantic.
- **An invariant is in the way?** That's not a coding problem to code
  around — it's a design signal. Report it and stop. Never import the
  DOM or reach for `Math.random()` / `Date.now()` in game logic to make
  a task go.

## While coding

### Simplicity

- Nothing beyond what was asked. No speculative flexibility, no config
  nobody requested, no interface for a single implementation.
- **Plain data by default.** Model game state as plain, serializable
  data and pure functions over it; reach for classes or framework
  objects only where reference semantics or the framework demand it.
- No error handling for impossible states. Validate at the boundaries
  (saved data, network responses, user input); trust your own typed
  data in between.
- Prefer immutability; make illegal states unrepresentable with the
  type system rather than guarding at runtime.
- 200 lines that could be 50? Rewrite it.

### Surgical changes

- Touch **only** the files the task lists. In a wave, other agents are
  editing other files right now — an unlisted edit isn't just scope
  creep, it can destroy someone else's work.
- Don't "improve" adjacent code, comments, or formatting.
- Match the surrounding style, even where you'd do it differently.
- Noticed unrelated dead code? Mention it. Don't delete it.
- Remove only the imports your change orphaned. Don't add an import you
  don't use — and in the logic layer, don't add a forbidden one at all.
- Don't add a dependency without it being in the task or an ADR.

### Emergent structure — don't scaffold

- **No empty placeholder files.** A file exists because real, tested
  logic goes in it, not to reserve a name a plan guessed at.
- Let file boundaries follow the code. Split a rule into its own file
  when it earns one (~150-200 lines, or independently testable), not
  before.

### Test integrity

- Never weaken an assertion to make a test pass.
- Never delete a failing test, or silence it with skip/`only`/filtering,
  to reduce the failure count.
- Never modify a test to match a wrong implementation. If a test is
  genuinely wrong, stop and confirm before touching it.
- **Tests are the spec.** Agreed game rules are pinned by table-driven
  tests over an injected clock and seeded RNG — don't shrink their
  scope to get green.
- Tests must be deterministic: no real time, no unseeded randomness, no
  dependence on execution order.

### Comments

- Default to none. Well-named identifiers say what the code does.
- Write one only for a WHY the code can't show: a game rule the code
  can only obey and not explain, or a workaround for a specific
  browser/library quirk.
- Never write comments about the task, the change, or the reviewer —
  "added for X", "handles the case from the spec", "removed the old
  logic". They're noise the moment the commit lands.

### Don't leave rubble

- No half-finished slices — no calls to code that doesn't exist yet, no
  exports used by nothing.
- No compat shims for callers that no longer exist.
- No `_unused` renames instead of deleting.
- No per-agent scratch output left behind — though that's the
  orchestrator's cleanup, not yours.

## After each change

Ask: **"would a senior engineer call this overcomplicated?"** If yes,
simplify before moving on.

Then verify with the task's `Verify` command and report the **actual**
output, not what you expect it to say.
