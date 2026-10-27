# skills/

Project-specific skills for harkdle.

| Skill | Use it for |
| ----- | ---------- |
| [feature-dev](feature-dev/SKILL.md) | Interrogate → design → tasks → execute for any feature, bug fix, or design decision. Plans by default; executes on an explicit signal. Not for docs-only edits. |

`feature-dev` is stack-agnostic in its process; its "Project profile"
section in `SKILL.md` holds harkdle's stack, gate commands and invariants
([ADR-0001](../../docs/adr/0001-stack-and-playback.md)). When a gate or an
invariant changes, update that section in the same commit as the
mechanism that enforces it (Biome config, `tools/invariants.test.ts`).
A skill that cites a rule nothing checks is worse than no skill.
