# 0013 — No duplicate nodes across a process and its subprocess

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-19 |
| **Area** | `data-repo` prompts: `idef-extraction/SKILL.md` (§2, §7) and `extract.md`; reused by `consolidate.md` (apply/soundness) |
| **Related** | [0008](0008-segmentation-node-visibility-semantic-subprocess.md), [0012](0012-consolidation-review-stage.md) |
| **Specs/plans** | `docs/superpowers/specs/2026-07-19-extract-no-duplicate-nodes-design.md` (+ plan) |

## Context

When `extract` decomposes an activity box into a **subprocess** (ADR 0008 §7), the box's
steps sometimes ended up **both** inside the child **and** left as flat nodes in the parent —
the same task modelled twice. The same duplication appeared within a single flow (a step
emitted twice) and, later, in `consolidate`'s mother-assembly (a mother repeating its child's
decision steps). Duplicate nodes bloat the graph and make the flow read incoherently.

## Decision

Establish one **no-duplicate doctrine**, prompt-only, enforced at build time by `extract` and
reused at review time by `consolidate`:

- **Level-crossing.** When a box becomes a subprocess, its steps live in the **child only**;
  the parent keeps just the **container box** that points to the child. A step appears at
  exactly one level.
- **Same-flow.** Each distinct task is **one** activity node; a revisit (re-check, return) is
  a **loop-back edge** to the existing node, never a second copy.
- **Allowed exception.** The container box vs. the child's first node are at different
  abstraction levels and are *expected to differ* (e.g. box «مدیریت نوبت در زمان شلوغی» →
  child first node «هدایت مشتری به اتاق انتظار») — not a duplicate; never forced to match,
  never collapsed.
- **Guardrail (INV-3).** Collapse only *accidental* duplicate copies of the same occurrence;
  a step genuinely performed at two distinct points, or a loop-back re-check, is **kept**.

A final self-check ((f) in `extract.md`) verifies no task is duplicated across a process and
its subprocess(es). `consolidate`'s post-combination soundness pass (ADR 0012) applies the
same doctrine to a merged result.

## Consequences

- ✅ A process and its subprocess never restate the same task; flows stay coherent.
- ✅ Duplication is a *diagnostic signal* for over-cutting (ADR 0012), not something to model.
- 📝 ARD §5.4 references the no-duplicate rule.
- Prompt-only — no schema/engine change; verification is grep + consistency re-read against
  §6 (no-omission) so dedup never erodes INV-3.
