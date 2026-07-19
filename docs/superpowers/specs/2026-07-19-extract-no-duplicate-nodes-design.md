# Extract — no duplicate nodes across a process and its subprocess

**Date:** 2026-07-19
**Source:** domain-expert testing; a process and its auto-created subprocess sometimes
carry the **same task twice** — the decomposed steps appear both inside the child and as
flat nodes in the parent, or a step is repeated within one flow.
**Scope:** the `extract` agent's prompt rules only — `data-repo/.claude/skills/idef-extraction/SKILL.md`
(§2, §7) and `data-repo/.claude/agents/extract.md` (final self-check). **No schema, no
engine, no test-harness change.**
**Deliverable:** prompt-only. Two rules + one self-check added to the extract agent.

---

## 1. Problem

The `extract` agent builds a process graph and, per §7, may decompose a qualifying
activity box into a **subprocess** (a self-contained, separately-nameable procedure). The
parent keeps the box as a single container activity; the child holds that box's steps.

Two duplication failures are observed:

1. **Level-crossing repeat.** The steps that were decomposed into the child subprocess are
   **also** left as flat nodes in the parent flow — the same task appears at both levels.
2. **Same-flow repeat.** The same (or a near-same) task is emitted as **two** activity
   nodes over the course of a single process's flow.

Neither is desired: a real task should be represented **once**.

**Explicitly NOT a failure (must be preserved):** the parent **container box** and the
child subprocess sit at **different levels of abstraction** and are *expected to differ*.
The box names the area of work; the child's first node is a concrete step. Example — parent
box «مدیریت نوبت در زمان شلوغی»; child's first node «هدایت مشتری به اتاق انتظار». These are
**not** duplicates, must **not** be forced to match, and must **not** be collapsed.

## 2. Rule 1 — Level-crossing (idef-extraction/SKILL.md §7)

When a box is promoted to a subprocess, its constituent steps belong to the **child only**.
The parent keeps **just the container box** — the higher-level activity whose `subprocess`
points at the child. Do **not** also emit those steps as flat nodes in the parent flow.

Add to §7 ("How to create a child process"): an explicit statement that the decomposed
steps live only in the child, and that the container box and the child's first node are at
different levels — neither required to be identical nor treated as a duplicate (with the
queue example).

## 3. Rule 2 — Same-flow (idef-extraction/SKILL.md §2, "What goes in the flow")

Within one process's flow, represent each distinct task with **exactly one** activity node.
If the process **revisits** a step later (a re-check, a return), model it as a **loop-back
edge to the existing node** — never a second copy of the node. This extends the existing §2
loop-back guidance (line ~145): a legitimately-recurring step is an **edge**, not a
duplicate node.

## 4. Self-check (idef-extraction/SKILL.md + extract.md final pass)

Before writing the output, scan the process **together with its subprocess(es)** and
confirm **no real task appears twice** across them. The one legitimate "names the same
area" link is the box→subprocess container relationship (§1), which is not a duplicate.

Concretely, add a sub-point to the "Final self-check (before writing the output file)" list
in `extract.md` (currently items a–e): **(f)** no task is duplicated — not between the
parent flow and a child subprocess (its steps live only in the child), and not twice within
one flow (revisits are loop-back edges, not copies); the parent container box vs. its child
is the one allowed exception.

## 5. Guardrail — do not over-dedup (INV-3)

The `extract` agent already carries a strong no-omission rule (§6, INV-3: "Omitting content
that WAS spoken is equally a defect"). The dedup rules must not erode it. Collapse only
**accidental** duplicates of the **same single occurrence**. A step the process genuinely
performs at two **distinct** points in the workflow, or a loop-back re-check, is **kept** —
as one node plus the appropriate edges. Do not drop distinct work merely because two labels
sound alike. The new rules and §6 must read as consistent: dedup removes redundant *copies*,
never spoken *content*.

## 6. Files touched

| File | Change |
|---|---|
| `data-repo/.claude/skills/idef-extraction/SKILL.md` | §7: Rule 1 (level-crossing) + container-box exception with the queue example; §2 "What goes in the flow": Rule 2 (one node per task, revisit = loop-back edge); a dedup line in the §6/§7 area cross-referencing INV-3 (§5 guardrail) |
| `data-repo/.claude/agents/extract.md` | add self-check item **(f)** to the "Final self-check (before writing the output file)" list |

No changes to `classify`, `summarize`, `consolidate`, `merge`, `allocate-id`, schemas, or UI.

## 7. Verification

Prompt-only, so verification is grep/inspection (the style used for the other prompt tasks):

- Rule 1 present in §7, with the explicit "steps live only in the child" statement and the
  preserved container-box exception (queue example).
- Rule 2 present in §2 "What goes in the flow", tying revisits to loop-back edges.
- Self-check item (f) present in `extract.md`'s final-self-check list.
- **Consistency re-read:** the new rules do not contradict §6 (no-omission) — a reviewer
  confirms the §5 guardrail wording makes dedup-vs-omission unambiguous, and that Rule 2
  does not conflict with the §2 branch/loop-back guidance at line ~145.
