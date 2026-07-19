# Extract — No Duplicate Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prompt rules so the `extract` agent never represents the same task twice across a process and its subprocess (or twice within one flow), while preserving the legitimate parent-box→child-subprocess abstraction link.

**Architecture:** Prompt-only. Two rules + a self-check item added to the `extract` agent's rule files in the data-repo. No schema, engine, or test-harness change. Verification is grep/inspection plus a consistency re-read against the existing no-omission rule (§6) and loop-back guidance (§2), matching how the other prompt tasks in this project are verified.

**Tech Stack:** Markdown prompt files (`data-repo/.claude/skills/idef-extraction/SKILL.md`, `data-repo/.claude/agents/extract.md`).

## Global Constraints

- **Repo:** all edits are in **`data-repo`**, currently on branch `consolidation-reviewer` (confirm branch strategy with the user before committing — this change is independent of the consolidation work).
- **Prompt-only:** no schema, engine, CLI, or test change. Do NOT touch `classify`, `summarize`, `consolidate`, `merge`, `allocate-id`, or any schema/UI file.
- **INV-3 (no fabrication / no omission):** the dedup rules must NOT erode §6's rule that omitting spoken content is a defect. Collapse only *accidental* duplicate copies of the same single occurrence; a step genuinely performed at two distinct points, or a loop-back re-check, is KEPT (one node + edges).
- **Preserve the allowed exception:** the parent container box and the child subprocess's first node are at different abstraction levels — never force them to match, never collapse the box into the child. (Spec §1, worked example: box «مدیریت نوبت در زمان شلوغی» / child first node «هدایت مشتری به اتاق انتظار».)
- **Language:** rule text is internal agent instruction — English prose with Persian examples, matching the existing files' style.
- **Shared checkout:** the data-repo working tree is shared with a concurrent human session — commit ONLY the two files this plan edits; touch nothing under `departments/**`.
- **Spec:** `docs/superpowers/specs/2026-07-19-extract-no-duplicate-nodes-design.md` is the source of truth.

---

## File Structure

| File | Change |
|---|---|
| `data-repo/.claude/skills/idef-extraction/SKILL.md` | §7: new "No duplication across a process and its subprocess" rule (level-crossing + container-box exception); §2 "What goes in the flow": new "One node per task" rule (revisit = loop-back edge, with the §6 guardrail cross-ref) |
| `data-repo/.claude/agents/extract.md` | add self-check item **(f)** to the "Final self-check (before writing the output file)" list |

---

## Task 1: Add no-duplicate-node rules to the extract agent

**Files:**
- Modify: `data-repo/.claude/skills/idef-extraction/SKILL.md` (§2 "What goes in the flow" ~line 59; §7 "How to create a child process" ~line 496–508)
- Modify: `data-repo/.claude/agents/extract.md` (the "Final self-check (before writing the output file)" list, ~line 231)

**Interfaces:** none (prompt text only). Rule 1 depends on the existing §7 subprocess mechanism; Rule 2 extends the existing §2 loop-back guidance (line ~145); the guardrail cross-references §6 (INV-3).

- [ ] **Step 1: Read the target files and locate the anchors**

Read `data-repo/.claude/skills/idef-extraction/SKILL.md` and confirm the anchors: `## 2. IDEF3 …` → `### What goes in the flow — nodes, titles, and descriptions` (~line 59); `## 7. Sub-processes …` → `### How to create a child process` (~line 496) with its numbered list ending before `### What merge does with a submitted child` (~line 509). Read `data-repo/.claude/agents/extract.md` and locate `**Final self-check (before writing the output file):**` (~line 231) with its items (a)–(e).

- [ ] **Step 2: Add Rule 1 (level-crossing) to §7**

In `idef-extraction/SKILL.md`, immediately AFTER the numbered "How to create a child process" list (after the item that ends "...capture the printed child ID from merge stdout.") and BEFORE `### What merge does with a submitted child`, insert this block verbatim:

```markdown
### No duplication across a process and its subprocess

A real task appears **exactly once** across a process and its subprocess(es). When you
promote a box to a subprocess, its constituent steps belong to the **child only** — the
parent keeps **just the container box** (the higher-level activity whose `subprocess`
points at the child). Do **not** also emit those same steps as flat activity nodes in the
parent flow. If you find the decomposed steps sitting in both the parent flow and the
child, remove them from the parent — the box is their single parent-level representative.

**Allowed (do not treat as duplication):** the container box and the child's first node sit
at **different levels of abstraction** and are *expected to differ* — the box names the area
of work, the child's first node is a concrete first step. Example: a parent box
«مدیریت نوبت در زمان شلوغی» whose child subprocess begins «هدایت مشتری به اتاق انتظار».
These are **not** duplicates; never force them to match, and never collapse the box into
the child.

**Guardrail (§6, INV-3):** collapse only *accidental* duplicate copies of the same single
occurrence. A step the process genuinely performs at two **distinct** points, or a
loop-back re-check, is **kept** — as one node plus the appropriate edges. Never drop
distinct spoken work merely because two labels sound alike.
```

- [ ] **Step 3: Add Rule 2 (one node per task) to §2 "What goes in the flow"**

In `idef-extraction/SKILL.md`, within the `### What goes in the flow — nodes, titles, and descriptions` subsection (~line 59–109), append this bullet at the end of that subsection (immediately before the `### Entry and exit (start/end discipline)` heading at ~line 110):

```markdown
- **One node per task.** Represent each distinct task with **exactly one** activity node in
  a flow. If the process **revisits** a step later (a re-check, a return, a second pass),
  model it as a **loop-back edge to the existing node** (see the junction/loop-back rule
  below) — never a second copy of the node. A recurring step is an *edge*, not a duplicated
  node. (Do not collapse genuinely distinct steps that merely sound alike — §6.)
```

- [ ] **Step 4: Add self-check item (f) to extract.md**

In `data-repo/.claude/agents/extract.md`, the `**Final self-check (before writing the output file):**` sentence currently lists items (a)–(e) and ends with "...`revise_nodes` (not `enrich_nodes`)." Extend that list by inserting item (f) right before the closing period of item (e)'s clause, so the list reads (a)…(e)…, and **(f)**. Insert this text:

```markdown
, and (f) **no duplicated task** — a step decomposed into a subprocess appears **only** in
the child (never also as a flat node in the parent flow), and no task is emitted twice
within one flow (a revisit is a loop-back edge, not a copy); the parent container box vs.
its child subprocess is the one allowed level-crossing exception (§7 "No duplication across
a process and its subprocess")
```

(Place it so the sentence's final period ends after item (f). If the existing sentence already ends with a period after (e), replace that period with the inserted clause followed by a period.)

- [ ] **Step 5: Grep-verify the rules are present**

Run:
```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
grep -n "No duplication across a process and its subprocess" .claude/skills/idef-extraction/SKILL.md
grep -n "One node per task" .claude/skills/idef-extraction/SKILL.md
grep -n "no duplicated task" .claude/agents/extract.md
```
Expected: each grep prints exactly one matching line (the §7 rule appears twice — its heading and the extract.md reference to it — so the first grep may show one line in SKILL.md; the extract.md cross-ref is caught by the third grep).

- [ ] **Step 6: Consistency re-read (no contradiction)**

Read the edited regions of both files once more and confirm:
- The new §7 rule does not contradict the existing §7 "produce a longer, flatter top-level flow" guidance (they agree: steps that are NOT promoted stay flat in the parent; steps that ARE promoted move wholly to the child — neither leaves a step in both places).
- Rule 2 ("one node per task; revisit = loop-back edge") is consistent with the §2 loop-back guidance (~line 145) and does not tell the agent to drop spoken content (§6).
- The container-box exception is stated and unambiguous (the queue example is present).
Note the confirmation in the commit body or report; no code to run.

- [ ] **Step 7: Commit (only the two prompt files)**

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
git add .claude/skills/idef-extraction/SKILL.md .claude/agents/extract.md
git commit -m "feat(extract): forbid duplicate nodes across a process and its subprocess

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Confirm with `git show --stat HEAD` that exactly these two files changed and nothing under `departments/**` was staged.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §2 Rule 1 (level-crossing) → Task 1 Step 2; §3 Rule 2 (same-flow) → Step 3; §4 self-check → Step 4; §5 guardrail (INV-3) → folded into the Step 2 block + the Step 3 parenthetical; §6 files-touched → the two files in Task 1; §7 verification → Steps 5–6. All covered.
- **Placeholder scan:** none — every insertion is verbatim text; the two commands are exact.
- **Type consistency:** N/A (no code). Cross-references are consistent: the §7 heading "No duplication across a process and its subprocess" is referenced verbatim in the extract.md item (f); Rule 2 points to the §2 loop-back rule and §6.
