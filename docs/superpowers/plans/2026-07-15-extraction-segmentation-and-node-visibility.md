# Extraction Segmentation & Node Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix process over-fragmentation (Issue #1) and hidden node content (Issue #2) in the voice→IDEF extraction pipeline by editing three prompt files.

**Architecture:** Prompt-only changes in `data-repo` (the extraction brain — INV-2). Segmentation rules go into the `classify` agent; node-visibility and sub-process rules go into the `idef-extraction` skill and the `extract` agent. No code, schema, `merge`/`allocate-id`/layout, or `process-voice.md` change — those consume whatever the agents emit; the criteria are entirely prompt-resident.

**Tech Stack:** Markdown prompt files consumed by Claude Code subagents. Validation is by inspection + `grep` (there is no automated test for prompt semantics; the real acceptance test is a manual bot run, spec §6). The "failing test → edit → passing test" cycle here is: a baseline `grep` proving the old text is present, then the edit, then a `grep` proving the old text is gone and the new text is present.

## Global Constraints

- **Repo & branch:** All edits are in `data-repo`, already on branch `feat/extraction-segmentation-node-visibility`. Run every command from the data-repo root: `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo`.
- **Emitted values stay Persian.** All `label`, `description`, `summary`, `actor`, ICOM, and `process_name` values the agents emit remain Persian (idef-extraction §preamble, ARD §4.4). The prompt *instructions* are English; only the examples/emitted text are Persian.
- **INV-1:** temp node keys only (`n1`, `j1`, …); the extract agent never mints a real ID. Unchanged by this plan.
- **INV-3 (no fabrication):** nothing may be invented to fill a template. Issue #1's anti-inference guard is INV-3 applied at the segmentation layer.
- **No CLI/schema/layout change.** Only the three prompt files below are touched. The single-level sub-process nesting the schema enforces is unaffected — only the *reason to create* a sub-process changes.
- **Spec:** `code-repo/docs/superpowers/specs/2026-07-15-extraction-segmentation-and-node-visibility-design.md`.

## File Structure

| File (in data-repo) | Responsibility | Task |
|---|---|---|
| `.claude/agents/classify.md` | Segments a transcript into processes (Issue #1 lives here) | Task 1 |
| `.claude/skills/idef-extraction/SKILL.md` | Node/label/description contract + sub-process rule (Issue #2 + nesting live here) | Tasks 2 & 3 |
| `.claude/agents/extract.md` | Emits nodes; references idef-extraction; sub-process summary + final self-check | Task 3 |

Tasks 2 and 3 both edit `idef-extraction/SKILL.md` but in disjoint sections (§2/§4 vs §7) and are independently reviewable — a reviewer could accept the node-visibility rules while rejecting the nesting change, or vice-versa.

---

### Task 1: Segmentation boundary method in `classify.md` (Issue #1)

**Files:**
- Modify: `.claude/agents/classify.md` (Step 2 → insert a boundary-method subsection; Step 4 → add existing-boundary alignment; Step 5 → add ordering rule)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no code symbols. Behavioral contract for the human checkpoint (Stage 4): segments arrive in shift-chronological order, every segment traces to spoken content, off-timeline procedures are their own segments.

- [ ] **Step 1: Baseline — prove the boundary rule is absent**

Run: `grep -n "boundary\|chronolog\|nature of the work\|orphan\|anti-inference" ".claude/agents/classify.md"`
Expected: no matches (empty output) — Step 2 currently has no boundary heuristic.

- [ ] **Step 2: Insert the boundary method into Step 2**

Edit `.claude/agents/classify.md`. Find this exact text (end of Step 2):

```
For each process, capture a short verbatim `transcript_excerpt` (1–3 sentences) that pins
the passage in the text.

### Step 3 — Assign the true department
```

Replace it with:

```
For each process, capture a short verbatim `transcript_excerpt` (1–3 sentences) that pins
the passage in the text.

### Step 2a — Where one process ends and the next begins (boundary method)

"What counts as a process" tells you what to look for; this tells you where to draw the
lines. **Over-fragmentation** — chopping activities that belong to one process into
several separate processes — is the failure this method exists to prevent. Apply three
parameters, in order.

**Parameter 1 — chronological order (the ordering axis).** Model the department as one
work shift, from the moment it begins to the moment it ends, and walk that timeline
forward: what happens first? after that? … what is last? Emit segments in this
shift-chronological order; place any off-timeline process (Parameter 3) after the
timeline. Chronological emission makes the Stage-4 checkpoint read as a walk through the
shift and makes the downstream IDs track shift order.

  The shift-walk is a reasoning aid for **ordering what you actually found**, never a
  template to fill in. A single recording is often partial — it may cover only part of
  the shift, jump around, or describe work out of sequence. You segment and order **only
  work the transcript actually describes**:
  - Never infer or reconstruct a process the transcript does not describe, however
    obviously it must happen in reality.
  - Gaps in the timeline are legitimate output. Do NOT bridge them with invented steps —
    a partly-covered shift yields a partial, gapped set of processes, and that is correct.
  - Reordering what the speaker said out of sequence is allowed; adding what they did not
    say is not.
  - Order comes from what the speaker says about *when* work happens — not from the
    position of the material in the recording, and not from how the department normally
    operates.
  This is INV-3 (no fabrication) applied to segmentation.

**Parameter 2 — change in the nature of the work (the cut rule).** A process ends where
the *nature of the work* changes — a materially different skill, objective, set of actors,
or mode of working — even when two activities are adjacent in time. A single process
normally contains MANY tasks: "cleaning and setting up the floor" is one process that
includes sweeping, wiping tables, arranging chairs and preparing the station — those are
steps inside it, not processes beside it. When in doubt, keep activities of the same kind
together in one process. Do NOT cut merely because time passes, the speaker moved to a new
sentence, or the transcript changed subject. Do NOT merge two different kinds of work just
because they occur close together. (Worked contrast: "cleaning and setting up the floor"
vs. "taking a customer's order" are different kinds of work → two processes; "end-of-night
cleaning" vs. "order registration" differ in both time and kind → clearly separate.)

**Parameter 3 — off-timeline processes (the orphan rule).** A repeatable procedure that
does not sit on the shift timeline and cannot be meaningfully attached to any neighbour
becomes its own standalone segment. Worked example: "holding the weekly meetings" happens
at weekends, has no position in the shift sequence, and is unrelated to cleaning or
order-taking → emit it separately rather than forcing it into an adjacent process.

  Distinguish this from org-overview material (Step 2, "What does NOT count"): an
  off-timeline **procedure** (a repeatable action staff perform) is a segment; a passage
  that only describes structure, roles, reporting lines, or personnel is org-overview and
  goes to the `summarize` agent, not a segment.

### Step 3 — Assign the true department
```

- [ ] **Step 3: Add existing-boundary alignment to Step 4**

In the same file, find this exact text (end of Step 4, just before Step 5):

```
If the department directory contains no process files (e.g. only a `.gitkeep`), every
segment for that department is `new` with `existing_id: null`.

### Step 5 — Write the output file
```

Replace it with:

```
If the department directory contains no process files (e.g. only a `.gitkeep`), every
segment for that department is `new` with `existing_id: null`.

**Align to existing boundaries.** When an existing process already defines a boundary for
related content (you read it while deciding `update`/`unchanged`), align your segmentation
to that boundary rather than introducing a new split of the same work. This keeps process
boundaries consistent across the several recordings of one department, even though each run
sees only one transcript.

### Step 5 — Write the output file
```

- [ ] **Step 4: Add the ordering rule to Step 5's rules list**

In the same file, find this exact line in the Step 5 "Rules:" list:

```
- `voice` — the voice basename string (e.g. `"cooking-1405-04-19"`; the date is Shamsi).
```

Replace it with:

```
- `voice` — the voice basename string (e.g. `"cooking-1405-04-19"`; the date is Shamsi).
- Emit `segments` in shift-chronological order (Step 2a, Parameter 1); off-timeline
  processes last.
```

- [ ] **Step 5: Verify — old absent, new present, and consistent**

Run: `grep -n "Step 2a\|nature of the work\|orphan rule\|Align to existing boundaries\|shift-chronological order" ".claude/agents/classify.md"`
Expected: matches for all five phrases.

Then Read the whole file top-to-bottom and confirm: the new Step 2a sits between the excerpt line and Step 3; the anti-inference guard is present and unambiguous; the orphan rule does not contradict the "org-overview → summarize" routing in Step 2 (it explicitly distinguishes procedure from structure).

- [ ] **Step 6: Commit**

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
git add .claude/agents/classify.md
git commit -m "$(cat <<'EOF'
fix(classify): 3-parameter process boundary method + anti-inference guard

Adds the segmentation heuristic that was missing (Issue #1 over-fragmentation):
chronological ordering, cut-on-change-of-work, orphan rule. Guards the shift-walk
against inference (INV-3 at the segmentation layer) and aligns to existing process
boundaries for cross-recording consistency in per-voice mode.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Node/title visibility rules in `idef-extraction` §2/§4 (Issue #2)

**Files:**
- Modify: `.claude/skills/idef-extraction/SKILL.md` (§2 Activities bullets; §2 new "What goes in the flow" subsection; §4 field table rows)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `label`/`description` contract that Task 3's §7 text and `extract.md` self-check reference by the section name **"What goes in the flow"**. Use that exact section title so the cross-references resolve.

- [ ] **Step 1: Baseline — prove the word-cap is present and the rule is absent**

Run: `grep -c "2–6 words" ".claude/skills/idef-extraction/SKILL.md"`
Expected: `2` (the §2 bullet and the §4 table row).

Run: `grep -c "What goes in the flow" ".claude/skills/idef-extraction/SKILL.md"`
Expected: `0`.

- [ ] **Step 2: Lift the word cap in the §2 Activities bullets**

Edit `.claude/skills/idef-extraction/SKILL.md`. Find this exact text:

```
An activity is a named step in the process — a unit of work performed by a role. Each activity has:
- A short `label` (Persian, 2–6 words)
- A longer `description` (Persian, one or two sentences)
- An `actor` (Persian role name)
```

Replace it with:

```
An activity is a named step in the process — a unit of work performed by a role. Each activity has:
- A `label` — a self-sufficient Persian title (see "What goes in the flow" below; length is not a constraint)
- A `description` (Persian) carrying only supporting detail ABOUT the step — never an action
- An `actor` (Persian role name)
```

- [ ] **Step 3: Insert the "What goes in the flow" subsection before Entry/exit**

In the same file, find this exact heading:

```
### Entry and exit (start/end discipline)
```

Replace it with the new subsection followed by the original heading:

```
### What goes in the flow — nodes, titles, and descriptions

The flowchart must be fully readable from node titles alone. A reader must never need to
open a node's detail view to understand a step, and must never need to read a description
to discover that an action exists. Content is lost two ways, both forbidden: **compression**
(shrinking a real action into a short, vague label) and **demotion** (writing a real action
into the description instead of the flow).

**The node test — "does someone DO this?"** For every piece of extracted content, ask: is
there an actor (a person, role, or unit) performing an action, and does something change
state / move the process forward?
- YES → it is a STEP: emit it as its own activity node in the flow.
- NO → it is supporting DESCRIPTION on an existing node.

MUST be a node: any action performed by a person or role; any decision or check that
branches the flow (model it as a junction — see "Control-flow completeness" below); any
handoff between people, roles, or units; any action whose omission would leave a gap in the
sequence.

MUST NOT be a node (it is description): HOW an action is carried out (technique/tools/
systems); constraints, timings, thresholds, quality standards; exceptions and edge cases
attached to an existing step; background and rationale. The `description` field is for
detail ABOUT the steps — it is NOT a container for content that did not fit the flow. If
you are about to write an actor plus a verb-of-doing into a description, stop: that is a
node you failed to create.

**Titles are self-sufficient; length is not a constraint.** The `label` must state the
essential substance of the step. Never compress a step into a vague category label. A
longer label, up to a full Persian sentence, is acceptable; never drop substantive content
to make a title shorter. Completeness beats brevity.

**One action per node (the splitting rule).** If a faithful account of a step contains two
different actions a person performs, split them into two sequential nodes — do not put them
in one box. The test: if the title needs «و» ("and") to join two things a person actually
DOES, it is two nodes. Splitting is the preferred outcome because it guarantees nothing is
dropped.
  - WRONG (compressed, drops half): «ثبت سفارش دستی توسط سرپرست»
  - WRONG (complete but two actions in one box): «ثبت سفارش دستی توسط سرپرست و هماهنگی با صندوق جهت ثبت سفارش»
  - CORRECT (two nodes, complete): «ثبت سفارش دستی توسط سرپرست» → «هماهنگی با صندوق جهت ثبت سفارش»

**Default to a node when unsure; never silently drop.** If you cannot tell whether
something is a step or a description, make it a step — an over-detailed flow is fixed by
the reviewer in seconds, but an action buried in prose or behind a vague label is invisible
and will be missed. If material does not fit the current node, that is a signal to create
another node, never to shorten, generalize, or demote it.

**Self-check before emitting.** Re-read every title and description: every description
sentence that passes the node test ("someone does this") must be promoted into the flow as
its own node in its correct chronological position, and every title must be readable in
isolation with no detail view open.

### Entry and exit (start/end discipline)
```

- [ ] **Step 4: Update the §4 field-table rows**

In the same file, find these exact two lines in the §4 activity-node field table:

```
| `label` | Persian, 2–6 words |
| `description` | Persian, describes what happens in this step |
```

Replace them with:

```
| `label` | Persian, self-sufficient title; length is not a constraint (§2 "What goes in the flow") |
| `description` | Persian, supporting detail ABOUT the step — never an action (§2 "What goes in the flow") |
```

- [ ] **Step 5: Verify — cap gone, rule present**

Run: `grep -c "2–6 words" ".claude/skills/idef-extraction/SKILL.md"`
Expected: `0`.

Run: `grep -n "What goes in the flow\|node test\|One action per node\|self-sufficient" ".claude/skills/idef-extraction/SKILL.md"`
Expected: matches present (including two "What goes in the flow" references from the §4 rows plus the heading and the §2 bullet).

Then Read the §2 region and confirm the new subsection sits immediately before "Entry and exit", the reference to "Control-flow completeness" resolves (that subsection exists later in §2), and no other place still promises a 2–6 word label.

- [ ] **Step 6: Commit**

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
git add .claude/skills/idef-extraction/SKILL.md
git commit -m "$(cat <<'EOF'
fix(idef-extraction): node/title visibility rules; lift 2-6 word label cap

Issue #2: flow must be readable from titles alone. Adds the node test, self-
sufficient-title rule, one-action-per-node splitting, default-to-node, and the
pre-emit self-check; redefines description as detail-about-steps, never an action.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Semantic sub-process criterion in `idef-extraction` §7 + `extract.md`

**Files:**
- Modify: `.claude/skills/idef-extraction/SKILL.md` (§7 rewrite; two "§7 threshold rule" cross-references at the `subprocesses`/`add_subprocesses` shape docs)
- Modify: `.claude/agents/extract.md` (Sub-processes section; Completion item 3; final self-check)

**Interfaces:**
- Consumes: the "What goes in the flow" section name defined in Task 2 (referenced from the new §7 text and the extract self-check). Keep the wording identical.
- Produces: no code symbols. Behavioral contract: sub-process creation is gated on "self-contained, separately-nameable procedure", never on step count; the flag-only prose-demotion path no longer exists.

- [ ] **Step 1: Baseline — prove threshold/flag-only language is present**

Run: `grep -n "threshold-based\|auto-create at threshold\|threshold rule\|3 or more\|4 or more\|flag-only\|Below threshold\|sub-steps" ".claude/skills/idef-extraction/SKILL.md" ".claude/agents/extract.md"`
Expected: several matches (idef-extraction §7 heading/body + two "§7 threshold rule" refs; extract.md section title, "4 or more", "flag-only", "Below threshold"). Note: these patterns are stale-specific — they deliberately do NOT match the word "thresholds" that appears legitimately in the §2 description examples ("constraints, timings, thresholds, quality standards").

- [ ] **Step 2: Rewrite idef-extraction §7 (threshold → semantic)**

Edit `.claude/skills/idef-extraction/SKILL.md`. Find this exact block (from the §7 heading down to just before "### What merge does with a submitted child"):

```
## 7. Sub-processes (auto-create at threshold)

### Threshold

Emit a child process in `subprocesses` (candidate) or `add_subprocesses` (delta) **only** when an activity box is genuinely described in the transcript with **3 or more distinct sequential sub-steps**. If the box is described with fewer than 3 distinct sequential sub-steps, use **flag-only** behaviour instead (see below).

### At or above threshold (3+ sub-steps) — emit a child

1. In the `subprocesses` / `add_subprocesses` array, add an entry with:
   - `parent_key` / `parent`: the temp key (or real ID) of the qualifying activity.
   - `process`: a full candidate body capturing those sub-steps as activity nodes with their own temp keys (`n1`, `n2`, …).
2. Keep `subprocess: null` on the parent activity node itself — **merge** allocates the child ID and sets this field (INV-1).
3. **No recursion:** if one of the child process's own activity nodes would itself qualify (3+ sub-steps of its sub-steps), do **not** nest further — apply flag-only on that node instead.
4. Report the parent node key and child process name in your completion message so the orchestrator knows to capture the printed child ID from merge stdout.

### Below threshold — flag-only

1. Keep `subprocess: null` on the node.
2. Append a short Persian note to the node's `description`. Example: «این مرحله شامل چند زیرگام مجزاست و ممکن است در آینده به‌عنوان فرایند مستقل مستندسازی شود.»
3. **Report** the node key and a brief explanation in your completion message to the orchestrator.
```

Replace it with:

```
## 7. Sub-processes (self-contained, separately-nameable procedures)

### When to create a child process

Emit a child process in `subprocesses` (candidate) or `add_subprocesses` (delta) **only
when a group of steps is a self-contained, separately-nameable procedure — one the domain
expert would refer to as a distinct thing in its own right** (e.g. «فرایند تسویه پایان
شیفت»). **Step count is never the reason to nest.** A box is not promoted to a sub-process
because it "has many sub-steps".

If a group of steps is NOT such a nameable procedure, do NOT nest it and do NOT summarise
it in prose: emit each step as a flat sibling activity node in the main flow, under the
"What goes in the flow" rules in §2. Producing a longer, flatter top-level flow is the
intended outcome — visible flow beats hidden hierarchy.

### How to create a child process

1. In the `subprocesses` / `add_subprocesses` array, add an entry with:
   - `parent_key` / `parent`: the temp key (or real ID) of the qualifying activity.
   - `process`: a full candidate body capturing those steps as activity nodes with their
     own temp keys (`n1`, `n2`, …), each obeying the §2 node/title rules.
2. Keep `subprocess: null` on the parent activity node itself — **merge** allocates the
   child ID and sets this field (INV-1).
3. **No recursion:** if one of the child process's own nodes is itself a self-contained
   nameable procedure, do **not** nest further — leave it as a flat node in the child flow.
4. Report the parent node key and child process name in your completion message so the
   orchestrator knows to capture the printed child ID from merge stdout.
```

- [ ] **Step 3: Fix the two "§7 threshold rule" cross-references**

In the same file, there are two lines reading `... (see §7 threshold rule) ...`. Replace each.

First, find:

```
**OPTIONAL** top-level `subprocesses` array. Emit it only when one or more activity boxes qualify (see §7 threshold rule). Each item has the following shape:
```

Replace with:

```
**OPTIONAL** top-level `subprocesses` array. Emit it only when one or more activity boxes qualify as a self-contained, separately-nameable procedure (see §7). Each item has the following shape:
```

Then find:

```
**OPTIONAL** `add_subprocesses` array. Emit it when a box in an **existing** process qualifies (see §7 threshold rule). Each item:
```

Replace with:

```
**OPTIONAL** `add_subprocesses` array. Emit it when a box in an **existing** process qualifies as a self-contained, separately-nameable procedure (see §7). Each item:
```

- [ ] **Step 4: Rewrite the extract.md Sub-processes section**

Edit `.claude/agents/extract.md`. Find this exact block:

```
## Sub-processes (threshold-based auto-creation)

See the `idef-extraction` skill §7 for the full contract. Summary of rules:

**At or above threshold (4 or more distinct sequential sub-steps):**
- Add the child in the top-level `subprocesses` array (Mode A / candidate) or `add_subprocesses` array (Mode B / delta).
- Keep `subprocess: null` on the parent activity node — **merge** sets it after allocating the child ID.
- No recursion: if a child process's own box would also qualify, apply flag-only on it instead.
- Report the parent node key and child process name in your completion message.

**Below threshold — flag-only:**
- Keep `subprocess: null` on the node.
- Append a short Persian note to the node's `description`.
- Report the node key and explanation in your completion message.

**Never mint a process or subprocess ID. Temp node keys only (INV-1).** The `merge` CLI allocates all final IDs.
```

Replace it with:

```
## Sub-processes (self-contained, nameable procedures)

See the `idef-extraction` skill §7 for the full contract. Summary of rules:

**Create a child process only when a group of steps is a self-contained,
separately-nameable procedure** — one the domain expert would call a distinct thing in its
own right. **Step count is never the reason to nest.**
- Add the child in the top-level `subprocesses` array (Mode A / candidate) or
  `add_subprocesses` array (Mode B / delta).
- Keep `subprocess: null` on the parent activity node — **merge** sets it after allocating
  the child ID.
- No recursion: if a child process's own box is itself a nameable procedure, leave it as a
  flat node in the child flow — do not nest further.
- Report the parent node key and child process name in your completion message.

**Otherwise, do NOT nest and do NOT demote into prose:** emit each step as a flat sibling
activity node in the main flow (idef-extraction §2 "What goes in the flow").

**Never mint a process or subprocess ID. Temp node keys only (INV-1).** The `merge` CLI
allocates all final IDs.
```

- [ ] **Step 5: Update extract.md Completion item 3 and the final self-check**

In the same file, find this exact line:

```
3. If any nodes were flagged as subprocess candidates, list their temp keys and the reason.
```

Replace it with:

```
3. If you created any child sub-processes, list each parent node key and child process name.
```

Then find this exact line (the final self-check):

```
**Final self-check (before writing the output file):** re-scan the transcript excerpt and verify (a) every spoken decision/exception/rework loop is modeled as a junction with exhaustive branches, (b) the graph passes the §2 entry/exit tests, and (c) no spoken timing, quantity, tool, or standard was dropped (§6).
```

Replace it with:

```
**Final self-check (before writing the output file):** re-scan the transcript excerpt and verify (a) every spoken decision/exception/rework loop is modeled as a junction with exhaustive branches, (b) the graph passes the §2 entry/exit tests, (c) no spoken timing, quantity, tool, or standard was dropped (§6), and (d) the §2 "What goes in the flow" rules hold — no action was demoted into a `description`, every title is readable in isolation, and any node whose title needed «و» to join two actions was split into sequential nodes.
```

- [ ] **Step 6: Verify — no threshold/flag-only language remains**

Run: `grep -rn "threshold-based\|auto-create at threshold\|threshold rule\|3 or more\|4 or more\|flag-only\|Below threshold\|sub-steps" ".claude/skills/idef-extraction/SKILL.md" ".claude/agents/extract.md"`
Expected: no matches (empty output). (This pattern set is stale-specific and will not match the legitimate word "thresholds" in the §2 description examples.)

Run: `grep -n "separately-nameable\|self-contained" ".claude/skills/idef-extraction/SKILL.md" ".claude/agents/extract.md"`
Expected: matches in both files.

Then Read §7 and the extract.md Sub-processes/Completion/self-check regions and confirm: the "No recursion" bullet no longer says "apply flag-only"; the extract self-check item (d) references the exact section name "What goes in the flow" defined in Task 2; nothing still instructs appending a sub-step note to a `description`.

- [ ] **Step 7: Commit**

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
git add .claude/skills/idef-extraction/SKILL.md .claude/agents/extract.md
git commit -m "$(cat <<'EOF'
fix(idef-extraction,extract): sub-process criterion is semantic, not step-count

Replaces the numeric 3+/4+ sub-step threshold with "self-contained, separately-
nameable procedure" and removes the flag-only prose-demotion path (it hid actions).
Non-nameable step groups now become flat sibling nodes. Extends the extract final
self-check with the Issue #2 visibility checks.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-implementation

No automated tests exist for prompt semantics. After all three tasks commit, hand back to the user for the acceptance test in spec §6: re-process `dining-1405-04-11`, `dining-1405-04-14`, `dining-1405-04-15` through the bot and compare against the prior run on (1) boundaries — fewer, correctly-bounded processes; arrival+cleaning+setup as one process; weekly meetings standalone; checkpoint reads chronologically; a partial/gapped timeline is acceptable and every process traces to a `مستند به:` evidence line — and (2) node completeness — the order-registration case emits two complete-titled nodes; no action lives only in a description; titles readable without a detail view; long processes render flat with sub-processes only for nameable procedures.
