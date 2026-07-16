# 0008 — Process segmentation, node visibility, and the semantic sub-process criterion

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-15 |
| **Area** | `data-repo` `.claude/agents/classify.md`, `.claude/agents/extract.md`, `.claude/skills/idef-extraction/SKILL.md` (prompt-only) |
| **Related** | spec `docs/superpowers/specs/2026-07-15-extraction-segmentation-and-node-visibility-design.md`; superseded in part by [0009](0009-set-based-extraction-and-restructuring.md); PRD FR-P3/FR-D4/FR-D7, INV-3; ARD §5.2/§5.4, §18 |

## Context

A domain-expert testing session found the extraction *quality* was not the bottleneck
(~95–96 % of the relevant detail was captured), but three prompt-level defects hurt the
result:

1. **Over-fragmentation.** `classify` had no rule for where one process ends and the
   next begins, so it cut wherever the transcript changed subject — chopping one process
   into several.
2. **Hidden content.** Real actions vanished two ways: **compressed** into vague titles
   (the reader had to open a node to learn what it meant), or **demoted** into the
   description prose instead of becoming a node. The flowchart read as a skeleton.
3. **Threshold-driven nesting.** Sub-process auto-creation was gated on a numeric
   threshold ("3+/4+ distinct sub-steps"), which nested by count rather than by whether
   the steps were actually a distinct procedure, and appended a prose "flag-only" note
   that re-hid the sub-steps.

## Decision

Prompt-only changes (no code/schema):

1. **A three-parameter segmentation method in `classify`** — (1) chronological order
   (model the department as one shift, walk it forward); (2) cut where the *nature of the
   work* changes, not where the transcript changes subject (a process contains many
   tasks); (3) an orphan rule for off-timeline procedures. Plus an **anti-inference
   guard**: the shift-walk orders only what was actually said — gaps are legitimate,
   inventing a plausible-but-unspoken process is forbidden (INV-3 applied at
   segmentation).
2. **Node/title visibility rules in `idef-extraction`** — the flow must be readable from
   titles alone: if a person does it, it is a node; **the 2–6-word label cap is removed**
   (titles are self-sufficient, length is not a constraint); one action per node (split on
   «و»); default to a node when unsure; the description carries only supporting detail,
   never an action.
3. **The sub-process criterion becomes semantic, not numeric** — create a sub-process
   **only when the steps are a self-contained, separately-nameable procedure** the domain
   expert would call a distinct thing; **step count is never the reason to nest**. The
   numeric threshold and the prose "flag-only" demotion path are removed; non-nameable
   step groups become flat sibling nodes.

## Consequences

- ✅ Correct process boundaries (no over-fragmentation) and a flowchart readable without
  opening any node.
- ✅ **Resolves the "sub-process threshold" open item** (ARD §18, PRD §12): the tuning
  question "how many sub-steps triggers a sub-process" is retired — the criterion is
  semantic.
- ⚠️ Genuinely long processes now render as longer, flatter top-level flows rather than
  compact boxes-with-drill-downs — intended (visible flow beats hidden hierarchy).
- 📝 The transient `classify` **Step-4 "align to existing boundaries"** bridge added here
  was later **removed** by [0009](0009-set-based-extraction-and-restructuring.md) (it
  locked in a boundary that restructuring must be free to revisit).

## Status / deployment note

Landed prompt-only, subagent-driven with per-task review, and merged to `data-repo` main.
Tested on the dining recordings before [0009](0009-set-based-extraction-and-restructuring.md)
built the set-based pipeline on top.
