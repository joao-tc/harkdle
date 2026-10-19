# ADR authoring

An ADR records a decision that future readers would otherwise have to
reverse-engineer. It is not documentation of what the code does — the
code does that. ADRs live in `docs/adr/` (create it on first use).

## First, is it already decided?

Scan `docs/adr/` and any project spec/README. If an accepted ADR or the
spec already makes the decision, cite it — don't write an ADR that
re-decides it. Never edit an accepted ADR — supersede it, and only with
the user's agreement.

On a fresh repo the first ADR is usually the **stack** (language,
framework, renderer, bundler, test runner) — it unblocks the Project
profile in SKILL.md, which must be updated in the same commit.

## Does this deserve an ADR?

Yes if **any** of these hold:

- **Expensive to reverse** — stack, renderer, a public shared type, a
  persistence or save format, hosting/backend, a dependency that shapes
  the code.
- **Binds future code** — "from now on, all randomness goes through the
  seeded RNG / every save carries a version."
- **Non-obvious** — a competent reader would ask "why is it like
  this?" and the code alone wouldn't answer.
- **A real alternative was rejected** — and someone will propose it
  again in six months.

No if:

- It's a routine application of an existing pattern.
- It's easily reversed and touches one file.
- It's already decided in an accepted ADR or the spec.
- It's a naming or formatting preference.

**One ADR per real decision, none for routine ones.** A log full of
trivia is a log nobody reads.

## Flow

1. **Draft** during Design (or when a pre-edit-block flags
   `Decisions: NEW`). Status: `Proposed`.
2. **Number it.** Scan `docs/adr/` for the highest `NNNN` and add one.
   File: `docs/adr/NNNN-<kebab-slug>.md`.
3. **Confirm with the user** via `AskUserQuestion` — present the
   decision and the rejected alternatives, recommend one:

   ```
   question: "ADR-0001: <the decision>. Accept?"
   options:
     - Accept          (status → Accepted, commit before implementation)
     - Pick <alt>      (the alternative, with its trade-off)
     - Revise wording
     - Not an ADR      (downgrade to a design note)
   ```

4. **Flip to `Accepted`** and commit it **before** the code it governs,
   in its own commit: `docs(adr): add ADR-NNNN for <slug>`.
5. Implementation commits reference `ADR-NNNN`.

The agent drafts and prompts; the decision is always the user's. ADRs
are never a side effect of writing code.

## Template — `docs/adr/NNNN-<slug>.md`

```markdown
# ADR-NNNN — <Decision in one line>

**Status:** Proposed | Accepted | Superseded by ADR-NNNN
**Date:** YYYY-MM-DD

## Context

[What forced a decision? The constraint, the problem, the thing that
made the obvious path not obvious. 2-4 sentences.]

## Decision

[What we're doing, stated as a rule someone can follow. Present tense,
imperative: "All game randomness goes through the seeded RNG."
Not "we decided to maybe…"]

## Alternatives considered

| Alternative | Why not                                 |
| ----------- | --------------------------------------- |
| <option>    | <the specific trade-off that killed it> |

## Consequences

**Good:** [what this buys us]
**Bad:** [what it costs — every real decision costs something]
**Follow-ups:** [what this now obliges future code to do]
```

## Superseding

Don't edit an accepted ADR to change its decision — write a new one and
mark the old `Superseded by ADR-NNNN`. The history of a decision is
part of its value. Fixing a typo is fine; rewriting the outcome erases
the paper trail.
