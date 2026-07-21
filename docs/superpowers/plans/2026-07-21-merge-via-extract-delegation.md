# Merge-via-Extract Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make consolidation **merges** be built by the `extract` agent (its hardened restructure path) instead of re-implemented in `consolidate` — fixing timeline order, duplication, and the mid-run subagent hang.

**Architecture:** Prompt-only. `consolidate` becomes reviewer + soundness (drops heir-building); `extract` Mode C gains merge-coverage + shift-timeline ordering + a self-check + a `chosen_shape` input; `process-voice` Stage 10 routes an approved merge through `extract restructure` (the same serial dispatch Stage 5 uses); `idef-extraction` §2 reinforces chronological ordering.

**Tech Stack:** Markdown prompt files in `data-repo/.claude/`. No schema/engine change (the `restructure`/`delta`/`merge` contracts already support this).

## Global Constraints

- **Baseline first — discard the uncommitted apply-rebuild.** `data-repo/.claude/agents/consolidate.md` currently has *uncommitted* "rebuild from scratch" apply edits (the change that hung the bot). **Before Task 3**, restore it to committed HEAD: `git -C <data-repo> checkout -- .claude/agents/consolidate.md`. All tasks build from committed HEAD (`4672a33`).
- **Repo:** all edits in **`data-repo`** on `main` (confirm branch strategy with the user before committing).
- **Prompt-only:** no schema/engine/CLI/test change; no new agent. Only the 4 files below.
- **No new merge agent** — `extract` Mode C *is* the merge builder.
- **INV-1/3/4/5 unchanged:** temp keys only (INV-1); no fabrication / no-omission (INV-3, extended to "no member content lost"); tombstone not delete (INV-4); per-item human approval (INV-5).
- **Hang avoidance:** the merge build MUST be a single **`extract`** dispatch (the Stage-5 serial path), never an ad-hoc `Agent` dispatch from inside an apply — that is what stalled the control-bot (ADRs 0002–0007).
- **Language:** user-facing orchestrator text Persian; prompt-file prose English with Persian examples, matching the files.
- **Shared checkout / live server:** `data-repo` is read live by the running bot and shared with a concurrent session — commit only the 4 edited files; touch nothing under `departments/**`.
- **Spec:** `docs/superpowers/specs/2026-07-21-merge-via-extract-delegation-design.md` is the source of truth.

---

## File Structure

| File | Change |
|---|---|
| `.claude/skills/idef-extraction/SKILL.md` | §2: reinforce chronological (timeline) ordering of the whole flow (Task 1) |
| `.claude/agents/extract.md` | Mode C: merge-coverage rule, shift-timeline ordering, self-check (g)+(h), `chosen_shape` input (Task 2) |
| `.claude/agents/consolidate.md` | apply-mode: remove heir-building; keep only soundness verification; update description/modes (Task 3) |
| `.claude/skills/process-voice/SKILL.md` | Stage 10 `merge` apply → dispatch `extract restructure` + assemble plan + `merge restructure` + `consolidate` soundness (Task 4) |

---

## Task 1: idef-extraction §2 — chronological (timeline) ordering

**Files:** Modify `data-repo/.claude/skills/idef-extraction/SKILL.md` (§2 "What goes in the flow", near the existing "correct chronological position" line).

- [ ] **Step 1: Read the anchor.** In §2, find the "Self-check before emitting" paragraph and the earlier sentence "…its own node in its **correct chronological position**…".

- [ ] **Step 2: Add the timeline-order rule.** Immediately after the "One node per task." paragraph (added by ADR 0013), insert:

```markdown
**Order the whole flow by real timing.** A flow is placed in **chronological (timeline)
order** — the sequence in which the work actually happens, start of the procedure to its
end — not in the order the transcript happens to mention things. When a process is assembled
from several mentions or several source processes, **interleave** the steps at their true
time; never place a block of later-time steps before an earlier-time step. (This is the
`classify` shift-walk applied inside a single process; it is what a merge relies on — see
`extract.md` Mode C.)
```

- [ ] **Step 3: Grep-verify + commit.** `grep -c "Order the whole flow by real timing" .claude/skills/idef-extraction/SKILL.md` → 1. Commit only this file: `feat(idef-extraction): flow is placed in chronological (timeline) order`.

---

## Task 2: extract.md Mode C — merge coverage, timeline order, self-check, chosen_shape

**Files:** Modify `data-repo/.claude/agents/extract.md` (Inputs table; Mode C RESTRUCTURE; Final self-check).

**Interfaces:**
- Consumes: `idef-extraction` §2 timeline rule (Task 1).
- Produces: for a `restructure` merge, `extract` reads all members + their evidence, builds a timeline-ordered, coverage-complete heir candidate, honouring `chosen_shape`. Stage 10 (Task 4) relies on this.

- [ ] **Step 1: Add `chosen_shape` to the Inputs table.** After the `existing_process_paths` row, add:

```markdown
| `chosen_shape` | **RESTRUCTURE merge only (consolidation-driven)** — `flat` or `mother_subprocess`; picks the heir shape (see Mode C). Absent for classify-driven restructures (infer from the segments). |
```

- [ ] **Step 2: Expand Mode C "Step 1 — Read every superseded process".** Replace the current Step-1 paragraph (which reads members "for the real node ids … and hierarchy pointers") with:

```markdown
### Step 1 — Read every member in full, and its evidence

Read **all** committed `process.json` files in `existing_process_paths` **in full** — they are
your **content checklist**: every distinct step, actor, ICOM, timing/quantity/tool they hold
(including a human's manual UI/chat edits) must survive into the heir. Copy their real node
ids/hierarchy pointers verbatim (INV-1); never invent one. Also read **every member's evidence
spans** across `transcript_paths` — the transcripts are the ground truth for **when** each
step happens.

**Build the heir as ONE freshly-modelled flow (a real re-extraction), not a stitch:**
- **Timeline order (idef-extraction §2).** Place every step at its **true shift-chronological
  position**, interleaving the members' work; **never** concatenate one member's whole flow
  after another's.
- **Coverage (INV-3, both ways).** Cover every distinct step/field of every member — nothing
  lost; the transcripts fix order and fill gaps; only genuine **duplicates** collapse to one
  node. Split genuinely divergent paths with junctions rather than leaving shared duplicates.
```

- [ ] **Step 3: State the shape in Mode C.** After the `subprocess_links` example block in Mode C, add:

```markdown
**Heir shape.** If `chosen_shape == "flat"` (or the segments imply one flat process): inline
every member's steps into one flat flow; `subprocess_links: []`. If
`chosen_shape == "mother_subprocess"`: the heir is the **mother** — its nodes are the
high-level steps in timeline order, and each member that becomes a child gets a
`subprocess_links` entry `{parent_key, child}` with its detail left in the child (not inlined).
A member appears **either** inlined in the heir **or** as a `subprocess_links.child`, never
both. (The orchestrator fills `supersedes` accordingly — Stage 10.)
```

- [ ] **Step 4: Extend the Final self-check with (g) and (h).** In the "Final self-check (before writing the output file)" sentence, before its closing period, append:

```markdown
, and (g) **timeline order** — walk the result as a shift and confirm every node sits in its true chronological position (an order-time step never after a serve-time step), and (h) **cross-member coverage (merge only)** — every distinct step/field of every merged member is present exactly once (nothing lost, nothing duplicated across members)
```

- [ ] **Step 5: Grep-verify + commit.** Confirm 1 match each for `chosen_shape`, `Read every member in full`, `Heir shape`, `timeline order` in `extract.md`. Commit only this file: `feat(extract): restructure merge — full-member coverage, timeline order, shape, self-check g/h`.

---

## Task 3: consolidate.md — reviewer + soundness (remove heir-building)

**Files:** Modify `data-repo/.claude/agents/consolidate.md` (frontmatter description; "Two modes"; apply-mode `merge → restructure plan` section; keep the soundness pass).

**Precondition:** the uncommitted apply-rebuild was discarded (Global Constraints) — you edit the committed version whose apply-mode `merge` still says "union the members' nodes".

- [ ] **Step 1: Update the description + apply-mode intro.** In the frontmatter `description`, change "In apply mode, turns ONE approved suggestion into a restructure plan or repair delta." to "In apply mode it runs only the **soundness verification** after a merge/attach is applied (the heir itself is built by `extract`)." In the "Two modes" section, change the `apply mode` bullet to: "**apply mode** — the heir is built by `extract` (restructure); you are called **only** for the **soundness pass** (seam + timeline + no-duplicate verification) on the applied result. You never author a restructure plan and never dispatch a subagent."

- [ ] **Step 2: Remove the `merge → restructure plan` build.** Delete the entire apply-mode subsection that begins `### `merge` → restructure plan` and its numbered steps 1–6 (the "union / rebuild the heir / shape / supersedes" instructions). Replace it with:

```markdown
### `merge` / `attach` → the heir is built elsewhere

You do **not** author the heir. For a `merge`, `extract` (restructure mode) builds the heir
candidate from the members + transcripts (timeline-ordered, coverage-complete); for an
`attach`, `merge attach-subprocess` re-parents the child. In **both** cases you are called
afterwards for the **soundness pass** below — and only that.
```

- [ ] **Step 3: Keep + retarget the soundness pass.** Leave the "Soundness pass (spec §4.7)" and "Post-combination dedup" blocks intact (seam checks, mother/child explicit cross-check, timeline-order check, INV-3 guardrail, delta emission). Confirm they no longer reference building a candidate — they operate on the **already-applied** result and emit repair `delta`s only.

- [ ] **Step 4: Grep-verify + commit.** `grep -c "restructure plan" .claude/agents/consolidate.md` should drop (no build section); `grep -c "the heir is built elsewhere\|built by .extract." .claude/agents/consolidate.md` → ≥1; the soundness/`Post-combination dedup` blocks still present. Commit only this file: `refactor(consolidate): reviewer + soundness only; extract builds merge heirs`.

---

## Task 4: process-voice Stage 10 — delegate the merge build to extract

**Files:** Modify `data-repo/.claude/skills/process-voice/SKILL.md` (Stage 10 §10d step 3 — the `merge` apply branch; and the turn-discipline note if it names `consolidate` apply for building).

**Interfaces:** Consumes `extract` restructure (Task 2) + `consolidate` soundness (Task 3).

- [ ] **Step 1: Read Stage 10d.** Find step 3 (**Run the structural verb**) — its `merge` sub-bullet currently dispatches `Task: consolidate mode: apply … chosen_shape …` and runs `merge restructure`.

- [ ] **Step 2: Replace the `merge` structural verb with an extract dispatch.** Replace the `merge:` sub-bullet under 10d step 3 with:

````markdown
   - **merge:** build the heir with the hardened extract path (not an ad-hoc subagent):
     dispatch **one** `Task: extract  mode: restructure  existing_process_paths: [<member files>]  evidence: [<union of the members' evidence>]  transcript_paths: […]  attachment_texts: {attachment_texts}  chosen_shape: <flat|mother_subprocess>  seq: 01  run_dir: {run_dir}`. It writes a heir candidate to `{run_dir}/candidates/01.json`. Assemble the restructure plan `{department, heirs:[{candidate:<that candidate>, supersedes:<members>, subprocess_links:<from the candidate>}]}` — `supersedes` = all members for `flat`, or the non-child members for `mother_subprocess` (a member id is in `supersedes` OR `subprocess_links.child`, never both). Write it to `{run_dir}/restructure.consolidation.json`, `Bash: validate restructure …`, then `Bash: DATA_ROOT=<data-repo> merge restructure --plan {run_dir}/restructure.consolidation.json --run {run_dir}`. Capture the printed `heir <id>` / `tombstoned <id>` lines.
````

- [ ] **Step 3: Confirm 10d step 4 (soundness) still dispatches `consolidate`.** The soundness step already dispatches `Task: consolidate mode: apply` on the applied result to verify + emit repair deltas — keep it (now the only `consolidate` apply dispatch).

- [ ] **Step 4: Turn-discipline note.** Ensure the turn-discipline list still names `extract` and `consolidate` dispatches as non-stop points; add a one-line caution: "the merge heir is built by a single `extract` dispatch — never improvise an `Agent` subagent to build a candidate (it stalls the SDK bridge, ADRs 0002–0007)."

- [ ] **Step 5: Grep-verify + commit.** `grep -c "mode: restructure" .claude/skills/process-voice/SKILL.md` → ≥1 in Stage 10; the `merge:` bullet no longer dispatches `consolidate mode: apply` for building. Commit only this file: `feat(process-voice): Stage 10 merge builds the heir via extract restructure`.

---

## Acceptance (server dry-run — judgment gate)

Prompt-only → behavioural proof. On the server (dining already at the `4672a33` pre-merge state):

1. Re-run the merge with the same prompt — *«فرایند 5 و 6 و 7 و 8 و 11 و 12 و 13 و 14 … ادغام کن»* → *بله تایید* (flat).
2. Confirm the heir `dining-025`: flow in **shift order** (kiosk-order steps before serving; farewell last), **no duplicate** table-cleaning, every member's steps present — and **no hang** (built via the single `extract` dispatch, one turn).
3. A `mother_subprocess` merge yields a timeline-ordered mother with children under single container nodes and no mother node duplicating a child node.
4. On an already-clean department, `consolidate` still returns `suggestions: []`.

If a check fails, iterate on the corresponding task's file and re-run.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §3.1 consolidate reviewer+soundness → Task 3; §3.2 extract additions (coverage, ordering, self-check g/h, chosen_shape) → Task 2 (+ §2 ordering → Task 1); §3.3 Stage 10 delegation → Task 4; §4 files → Tasks 1–4; §5 verification → Acceptance. All covered.
- **Placeholder scan:** none — every edit gives verbatim text or a precise delete+replace; commands exact.
- **Type/name consistency:** `chosen_shape` (values `flat`/`mother_subprocess`), `mode: restructure`, `existing_process_paths`, `subprocess_links`/`supersedes` used identically across Tasks 2 and 4 and match `extract.md`/`restructure.schema.json`. The "a member is in `supersedes` OR `subprocess_links.child`, never both" invariant is stated in both Task 2 (extract) and Task 4 (orchestrator assembly).
