# Extraction agent — process segmentation & node visibility

**Date:** 2026-07-15
**Source:** user testing session with the domain expert (process consultant), 2026-07-15
**Scope:** the pipeline that extracts business processes from department interview
recordings and renders them as flowchart / IDEF0-IDEF3 nodes.
**Deliverable:** prompt changes only (no code, schema, or CLI changes).

---

## 1. Problem

Two failure modes surfaced during testing. They are one failure surface, not two
independent bugs:

- **Issue #1 — wrong process boundaries.** Extraction quality is not the
  bottleneck (~95–96 % of relevant detail is captured and summarized well). The
  agent fails at *classification*: it **over-fragments**, chopping activities that
  belong to one process into several separate processes. It cuts wherever the
  transcript changes subject because it has no boundary rule.
  - Evidence: when the tester supplied process names up front (e.g. "staff
    arrival + cleaning + setup" as one process, "customer reception" as another)
    and asked the agent to find information about *those* processes, retrieval and
    structuring were correct. The missing capability is the agent **defining the
    boundaries itself**.

- **Issue #2 — content hidden instead of shown in the flow.** Real content does
  not reach the visible flow. It disappears two ways: **compression** (a real
  action shrunk to a vague title) and **demotion** (a real action written into the
  description instead of becoming a node). Result: a skeleton flowchart, unreadable
  on its own.
  - Evidence (compression + demotion in one node): the agent emitted
    «ثبت سفارش دستی توسط سرپرست» when the recording described
    «ثبت سفارش دستی توسط سرپرست و هماهنگی با صندوق جهت ثبت سفارش» — an incomplete
    title, AND two distinct actions that should not share a box.

Fixing #2 without #1 yields a complete flowchart inside the wrong process. Fixing
#1 without #2 yields correct boundaries wrapped around a skeleton flow. They land
together and are re-tested on the same three dining recordings so results are
comparable.

## 2. Root cause (where each issue actually lives)

The pipeline separates *segmentation* from *modelling*:

- **`classify` agent** (`data-repo/.claude/agents/classify.md`) segments a
  transcript into processes and labels each `new`/`update`/`unchanged`. **This is
  where Issue #1 lives.** The `extract` agent only ever receives a pre-segmented
  `process_name` + `transcript_excerpt` — it cannot fix a boundary it was handed.
  Step 2 of `classify.md` currently states only *what counts* as a process, with
  **no boundary heuristic** — the root cause of over-fragmentation.

- **`idef-extraction` skill** (`data-repo/.claude/skills/idef-extraction/SKILL.md`)
  defines the node/label/description contract the `extract` agent emits. **This is
  where Issue #2 lives.** It currently mandates labels of "Persian, **2–6 words**"
  (§2 and the §4 field table) — the direct opposite of what Issue #2 requires — and
  gives no rule for what belongs in the flow vs the description.

No CLI, schema, or `merge`/`allocate-id`/layout change is needed: those consume
whatever the agents emit. The criteria are entirely prompt-resident.

## 3. Decisions taken (from the brainstorming session)

1. **Segmentation scope — per-voice now, holistic later.** Keep one-recording-per-
   run. Add the boundary heuristic to `classify` so it stops over-fragmenting
   *within* a single transcript, and write the rules so a future "read all sibling
   transcripts before segmenting" mode drops in without a rewrite. Do **not**
   re-architect the pipeline this round.

2. **Flow vs nesting — flat flow wins, and nesting becomes semantic.** Default to
   showing sub-steps as flat sibling nodes in the main flow. Create a sub-process
   **only when the group of steps is a self-contained, separately-nameable
   procedure — one the domain expert would refer to as a distinct thing in its own
   right. Step count is never the reason to nest.** Remove the numeric
   "3+ sub-steps" threshold and kill the flag-only "append a prose note to the
   description" path (it demotes actions).

3. **Word-count cap removed.** Titles are self-sufficient; length is not a
   constraint; completeness beats brevity.

4. **Scope — prompt changes only.** Land the three prompt edits. The user runs the
   pipeline through the bot to validate. This spec defines the acceptance test.

## 4. Design

### 4.1 `classify.md` — process segmentation (Issue #1)

Extend Step 2 ("Segment the transcript") with an explicit three-parameter boundary
method, adapted to the file's existing voice and structure (not pasted verbatim).

**Parameter 1 — chronological order (primary axis).** Model the department as one
work shift, from the moment it begins to the moment it ends. Walk the timeline
forward ("what happens first? after that? … what is last?"). **Segments are emitted
in shift-chronological order; off-timeline processes come after the timeline.**
Rationale stated honestly in-prompt: chronological emission improves the Stage-4
checkpoint's readability and makes the seq/IDs allocated downstream track shift
order. (We do *not* claim a hard downstream data dependency that does not exist.)

**Anti-inference guard (mandatory — do not omit).** The shift-walk is a *reasoning
aid for ordering what was found, not a template to complete*. In per-voice mode a
single recording is often partial — it may cover only part of the shift, jump
around, or describe work out of sequence — and an agent told to "model the whole
shift" will otherwise fill the gaps from its own background knowledge of how such a
department normally runs, inventing plausible processes that are therefore hard to
catch. The prompt must state explicitly:

- The agent segments and orders **only work actually described in the transcript**.
  It never infers or reconstructs a process the transcript does not describe,
  however obviously it must happen in reality.
- **Gaps in the timeline are legitimate output** and must not be bridged with
  invented steps. A shift the recording only partly covers yields a partial,
  gapped set of processes — that is correct.
- **Reordering** what the speaker said out of sequence is allowed; **adding** what
  they did not say is not.
- Order comes from **what the speaker says about when work happens** — not from the
  position of the material in the recording, and not from expectations about how
  the department normally operates.

This is INV-3 (no fabrication) applied at the segmentation layer, mirroring the
same rule the `extract`/`idef-extraction` layer already enforces on node content.

**Parameter 2 — change in the nature of the work (the cut rule).** A process ends
where the *nature of the work* changes — different skill, objective, actors, or
mode of working — even if adjacent in time. A process normally contains **many**
tasks (cleaning the floor = sweeping + wiping tables + arranging chairs + preparing
the station: steps *inside* one process, not processes beside it).
**Over-fragmentation is the named failure mode: when in doubt, keep activities of
the same kind together in one process.** Do not cut merely because time passes,
the speaker moved to a new sentence, or the transcript changed subject. Do not
merge two different kinds of work just because they happen close together.

**Parameter 3 — off-timeline processes (the orphan rule).** A repeatable procedure
that does not sit on the shift timeline and cannot be meaningfully attached to a
neighbour (e.g. weekly weekend meetings) is emitted as its own standalone segment —
not forced into an adjacent process.

**Reconciliation with the existing org-overview routing.** `classify.md` already
routes "org-overview material" (structure, roles, reporting lines, personnel) to
the `summarize` agent and does **not** emit it as a segment. The orphan rule must
not collide with this: an off-timeline *procedure* (a repeatable action) is a
segment; only pure structure/roles/personnel go to `summarize`. This distinction
is made explicit so the two rules do not fight.

**Holistic-later bridge (works now).** `classify` Step 4 already reads existing
department `process.json` files to decide `new`/`update`/`unchanged`. Add: **when
an existing process already defines a boundary for related content, align to that
boundary rather than introducing a new split.** This gives cross-recording
consistency inside per-voice mode, and the three parameters are phrased as
department-level reasoning that today runs on one transcript — so a future
"read all sibling transcripts first" step slots in without rewriting them.

**Known limitation (documented, not fixed this round).** In per-voice mode, if
recording 1 over-fragments and its processes are committed, later runs can `update`
or add to those processes but have **no operation to merge two over-fragmented
processes back into one**. The boundary heuristic reduces the chance of the initial
over-fragmentation; the Stage-4 human checkpoint (which lets the user correct
splits/merges before anything is written) remains the backstop; and the
holistic mode is the eventual structural fix.

### 4.2 `idef-extraction/SKILL.md` — what goes in the flow (Issue #2)

**Remove the 2–6 word label cap** everywhere it appears — the §2 "Activities"
bullet and the §4 activity-node field table. Replace with the self-sufficiency
rule below.

Fold the following into §2 (adapted to the skill's voice; Persian remains the
required language for all emitted values):

- **The node test — "does someone DO this?"** For every piece of extracted
  content: is there an actor (person/role/unit) performing an action, and does
  something change state / move the process forward? **YES → it is a node in the
  flow. NO → it is supporting detail on an existing node's description.**
  - MUST be a node: any action by a person/role; any decision or check that
    branches the flow; any handoff between people/roles/units; any action whose
    omission would leave a gap in the sequence.
  - MUST be description (not a node): *how* an action is carried out
    (technique/tools/systems); constraints, timings, thresholds, quality
    standards; exceptions/edge cases attached to a step; background/rationale.
- **Titles are self-sufficient; length is not a constraint.** The flow must be
  fully readable from node titles alone — a reader never needs to open a detail
  view to learn what a step is, nor read a description to discover an action
  exists. A longer title, up to a full sentence, is acceptable. Never drop
  substantive content to shorten a title. Completeness beats brevity, always.
- **One action per node (splitting rule).** If a faithful description of a step
  contains two different actions a person performs, split them into two sequential
  nodes. The "and" test: if the title needs "and" to join two things a person
  actually DOES, it is two nodes. Splitting is the preferred outcome — it
  guarantees nothing is dropped. (Worked example: the order-registration node
  splits into «ثبت سفارش دستی توسط سرپرست» → «هماهنگی با صندوق جهت ثبت سفارش».)
- **Default to node when unsure; never silently drop.** When unsure whether
  something is a step or a description, make it a step. An over-detailed flow is
  fixed by the reviewer in seconds; an action buried in prose or behind a vague
  label is invisible and will be missed. If material does not fit the current
  node, that is a signal to create another node — never to shorten, generalize, or
  demote it.

**Redefine the description field.** Update the §2 activity definition: the
`description` carries *detail about* the step (the "MUST be description" list
above), and is **never** a container for actions that did not fit the flow. If you
find yourself writing an actor + a verb-of-doing into a description, that content
is a node you failed to create.

**Add a self-check** (complementing the existing §6 no-omission re-scan): re-read
every title and every description; every description sentence that passes the node
test must be promoted into the flow as its own node in correct chronological
position; every title must be readable in isolation.

### 4.3 Sub-process criterion — semantic, not numeric (§7 + `extract.md`)

Applies to `idef-extraction/SKILL.md` §7 and the `extract.md`
"Sub-processes (threshold-based auto-creation)" section.

- **Remove the numeric threshold** ("3 or more distinct sequential sub-steps").
- **New criterion:** create a sub-process (a child `process` in `subprocesses` /
  `add_subprocesses`) **only when the group of steps is a self-contained,
  separately-nameable procedure — one the domain expert would refer to as a
  distinct thing in its own right.** Step count is never the reason to nest.
- **Kill the flag-only path** that appends a prose note
  («این مرحله شامل چند زیرگام مجزاست…») to a node's `description` — it demotes
  actions. Steps that are *not* a nameable procedure become **flat sibling nodes**
  in the main flow instead.
- The mechanics are unchanged: temp node keys only (INV-1); `subprocess: null` on
  the parent in the candidate; `merge` allocates the child ID and wires the parent.
  The schema's single-level nesting is unaffected. Only the *reason to create* a
  sub-process changes, which is purely prompt-resident.

**Intended behavior shift (named, not a regression).** Genuinely long processes now
produce longer, flatter top-level flows rather than compact boxes-with-drill-downs.
This is the expert's stated goal (visible flow), so it is intended.

### 4.4 `extract.md` — final self-check

Extend the existing final self-check (currently: junctions for every
decision/exception; §2 entry/exit tests; no dropped timing/quantity/tool/standard)
with the Issue #2 checks from §4.2: no action demoted into a description; every
title readable in isolation; multi-action nodes split.

## 5. Files changed

| File | Change |
|---|---|
| `data-repo/.claude/agents/classify.md` | Step 2: three-parameter segmentation method; chronological emission; orphan rule reconciled with org-overview routing; Step 4: align to existing boundaries |
| `data-repo/.claude/skills/idef-extraction/SKILL.md` | §2/§4: remove 2–6 word cap; node test, self-sufficient titles, one-action-per-node, default-to-node, description redefinition, self-check; §7: semantic sub-process criterion, remove numeric threshold, remove flag-only demotion |
| `data-repo/.claude/agents/extract.md` | Sub-process section → semantic criterion; extend final self-check with Issue #2 checks |

No changes to `schemas/`, engine CLIs, `merge`, `allocate-id`, layout, or
`process-voice.md` (its sub-process mechanics description stays accurate — only the
*reason to nest* moved, which it does not state).

## 6. Acceptance test (run by the user through the bot)

Re-process the same three dining recordings — `dining-1405-04-11`,
`dining-1405-04-14`, `dining-1405-04-15` — and compare against the prior run on two
axes:

1. **Boundaries (Issue #1):** fewer, correctly-bounded processes; activities of the
   same kind (e.g. arrival + cleaning + setup) sit in one process rather than being
   split across several; off-timeline procedures (e.g. weekly meetings) appear as
   their own standalone process. The Stage-4 checkpoint list should read as a
   chronological walk through the shift. **A partial/gapped timeline is acceptable
   output** where a recording only covers part of the shift; every proposed process
   must be traceable to spoken content (the checkpoint's `مستند به:` evidence line),
   and any process that cannot be tied to the transcript is an anti-inference defect.
2. **Node completeness (Issue #2):** the order-registration case emits **two** nodes
   with complete titles («ثبت سفارش دستی توسط سرپرست» →
   «هماهنگی با صندوق جهت ثبت سفارش»); no substantive action is found only in a
   description field; titles are readable without opening a detail view; long
   processes render as flat top-level flows, with drill-down sub-processes only for
   genuinely nameable procedures.

The dining department currently has no committed processes and `runs/` is empty, so
this is a clean fresh run (transcription is skipped — transcripts already exist).
