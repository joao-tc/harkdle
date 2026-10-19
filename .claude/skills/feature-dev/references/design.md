# Design

**Goal:** decide HOW, once, before any subagent writes a line. Output
is `specs/<feature>/design.md` plus 0-N draft ADRs.

**Runs for Large.** Skipped for Medium — unless a decision surfaces
mid-plan, in which case Design runs for that decision alone.

**Skip when** there's no architectural decision, no new pattern, and no
new contract between layers. If you're only wiring existing patterns
together inside one layer, go straight to Tasks.

**Never skip when a layer boundary is crossed.** New game state that
both logic and rendering consume, a new event or message between them, a
new persisted shape — that contract is exactly what Design nails down so
the two sides can then be built in parallel.

## Process

### 1. Research before deciding

Follow the verification chain in SKILL.md — codebase, then project docs
and ADRs, then official docs for the library at the installed version,
then flag uncertainty. **Never fabricate an API.** A hallucinated
library call propagates into every task and every subagent downstream.

Delegate wide research (mapping existing patterns, reading a library's
docs) to a subagent and keep only the summary. See
[sub-agents.md](sub-agents.md).

### 2. Place it in the layer graph

Pin down **which layer owns each new piece**, using the layout in
SKILL.md's Project profile, and confirm dependencies point one way
(rendering/UI → logic).

| New piece         | Layer     | Depends on        | Logic/Visual | Keeps invariants?            |
| ----------------- | --------- | ----------------- | ------------ | ---------------------------- |
| `<state type>`    | logic     | nothing           | logic        | headless, serializable ✅    |
| `<rule/algorithm>`| logic     | state types       | logic        | clock + RNG injected ✅      |
| `<save/load>`     | data      | state types       | logic        | versioned, validated ✅      |
| `<scene/component>`| rendering| logic API         | visual       | no rules restated ✅         |

If a piece seems to want to live in the logic layer but needs the DOM,
a canvas, ambient time or ambient randomness — **stop.** It's in the
wrong layer, or the boundary needs an injected dependency. That's a
decision (often an ADR), not a detail.

**Then split logic vs. visual** (SKILL.md "The logic/visual split").
If both tags appear, it's two sub-phases in two spec folders. Design the
logic contract fully here (it's what lets the visual half be built
later against a stable API); the visual folder gets its own
spec/design once the logic is merged and green.

### 3. Find what already exists

List what you can reuse: existing types, utilities, test fixtures,
neighbouring rules. Every reused thing is a task you don't write.

| Existing        | Where              | How this feature uses it        |
| --------------- | ------------------ | ------------------------------- |
| `<thing>`       | `src/…`            | <extended / called / mirrored>  |

If you're introducing a second way to do something the codebase already
does one way, stop — that's an ADR-bearing decision.

### 4. Design the change

Cover only what applies:

- **Types / modules** — what's new, what changes, which layer, and the
  boundary between them.
- **Interfaces** — the actual **type signatures** in the project's
  language, written out. Downstream tasks go to independent subagents;
  they can only run in parallel if the contract is already nailed here.
- **Data model** — state shape, defaults, optionality, what is derived
  vs. persisted, and the schema version if persisted.
- **Time & randomness** — anything time- or chance-shaped states where
  "now" / the random stream comes from. In logic it is always a
  parameter or an injected dependency.
- **Error handling** — what fails, the typed error, what the player
  sees, and the graceful-degradation path (e.g. corrupt save).
- **Integration points** — shared touchpoints (manifest, entry point,
  router/scene registry, shared fixtures) that Tasks must serialize.

### 5. Record decisions

| #   | Decision           | Alternatives considered | Why          | ADR?     |
| --- | ------------------ | ----------------------- | ------------ | -------- |
| D1  | <what was decided> | <what was rejected>     | <the reason> | ADR-0002 |
| D2  | <what was decided> | <what was rejected>     | <the reason> | no       |

**ADR trigger** — a decision earns an ADR if any of these hold:

- It's expensive to reverse (stack, renderer, a public shared type, a
  persistence or save format, a backend/hosting choice).
- It binds future code ("all randomness goes through the seeded RNG").
- A competent reader would ask "why is it like this?" and the code
  alone wouldn't tell them.

Don't re-litigate what an accepted ADR already decided; cite it.
Everything else is just a design note. One ADR per real decision, none
for routine ones. Each ADR-bearing decision is confirmed with the user
via `AskUserQuestion`. Flow: [adr-authoring.md](adr-authoring.md).

### 6. Map requirements to the design

Every P1 requirement from the spec must be visibly served by something
in this design:

| Requirement | Served by          |
| ----------- | ------------------ |
| R1          | <type/change>      |
| R2          | <type/change>      |

An unserved requirement means the design is incomplete. A design
element serving no requirement is scope creep — cut it.

## Template — `specs/<feature>/design.md`

```markdown
# <Feature> — design

**Spec:** `specs/<feature>/spec.md`

## Approach

[One paragraph: the shape of the solution, in plain language.]

## Layer placement

| New piece | Layer | Depends on | Logic/Visual | Keeps invariants? |
| --------- | ----- | ---------- | ------------ | ----------------- |

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |

## Types

### <Type / interface>

**Layer:** <logic | data | rendering>
**Responsibility:** [one sentence]
**Interface:**

​```
// exact signatures in the project's language — downstream subagents code against these
​```

## Data model

[State shape, defaults, optionality, derived vs persisted, schema
version. Or "none".]

## Time & randomness

[Where "now" and the RNG come from. Or "n/a".]

## Error handling

| Failure | Behavior                  | Surfaced as              |
| ------- | ------------------------- | ------------------------ |
| <case>  | <retry / abort / degrade> | <typed error / log / UI> |

## Integration points (shared touchpoints)

Files multiple tasks would otherwise all write — serialized in Tasks,
never parallelized:

- `<manifest / lockfile>` — new dependency or script
- `<entry point / scene or route registry>` — new screen wiring
- `<shared test fixtures>` — sample game states

## Decisions

| #   | Decision | Alternatives | Why | ADR? |
| --- | -------- | ------------ | --- | ---- |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
```

## Exit gate

`AskUserQuestion`:

```
question: "Design ready (<N> decisions, <M> ADRs drafted). Proceed to Tasks?"
options:
  - Proceed       (→ Tasks)
  - Revise        (capture feedback, re-draft)
  - Rethink <D#>  (reopen a specific decision)
  - Cancel
```

Draft ADRs stay `Proposed` until the plan is approved; they land before
implementation starts.

## Anti-patterns

- **Designing past the spec.** If it's not serving a requirement, it's
  not in the design.
- **Vague interfaces.** "A service that handles game state" gives
  parallel subagents nothing to code against. Write the signatures.
- **Fabricated library APIs.** Verify against the docs for the
  installed version; flag what you can't.
- **Logic that needs the DOM, the clock, or `Math.random()`.** The
  boundary is telling you the design is wrong — inject a dependency or
  move the code; don't weaken the invariant.
- **Rules restated in the renderer.** The visual layer calls the logic;
  it never re-derives it.
- **Silent decisions.** A choice made without surfacing it is a choice
  the user can't correct.
- **Forgetting the shared touchpoints.** The manifest, entry point and
  registries are the difference between a plan that parallelizes and
  one that deadlocks on merge conflicts.
