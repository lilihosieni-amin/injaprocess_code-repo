# 0009 — Set-based department extraction + process restructuring

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-16 |
| **Area** | whole pipeline — `data-repo` prompts (`process-voice`, `classify`, `extract`, `summarize`, `idef-extraction`, new `edit-process`); `code-repo` engine (`merge`, `allocate-id`), schemas, and UI (`ui`, `ui-backend`) |
| **Related** | spec `docs/superpowers/specs/2026-07-15-set-based-extraction-and-restructuring-design.md`; builds on [0008](0008-segmentation-node-visibility-semantic-subprocess.md); PRD FR-P3/FR-P4/FR-P8/FR-M1/FR-M2, INV-1/INV-4; ARD §2.2/§4.1/§5/§6/§8/§13 |

## Context

The pipeline ran **one recording at a time**: the first recording produced the baseline
set of processes, and every later recording was applied to that baseline as a **patch**
(`new`/`update`/`unchanged`).

The domain expert's objection: **a single recording never contains a complete process.**
What staff describe in the first meeting is routinely reworked in the third or fourth
(detail added, rules changed, sequence rearranged). So the pipeline built its foundation
from the *least reliable* material and then defended it. Two confirmed consequences:

- **A wrong baseline is never corrected, only extended** — patching cannot undo a
  structural decision made from partial information.
- **Genuinely new processes cannot emerge** — material that should have been separate gets
  attached to the existing structure (a de-duplication failure).

When the expert bypassed the flow and handed **three recordings in at once**, she got a
materially better result. That behaviour — read all the raw material together — is what
this change makes the pipeline's only behaviour.

## Decision

1. **The unit of work is a department transcript SET**, given by department (all its
   recordings) or by explicit list. **One path** — a set of one is just the smallest case;
   no per-voice or batch mode. Read the raw transcripts, **in full, every run. No
   distillation** — a mandatory digest would reintroduce the exact compression failure
   [0008](0008-segmentation-node-visibility-semantic-subprocess.md) fixed, one layer down
   and unrecoverably. Context budget is handled by running the reasoning agents on the
   largest-context Opus and, if a set exceeds it, **stopping with an explicit message** —
   never silently compressing or reverting to one-at-a-time.

2. **A `supersedes` relation replaces the scalar `new`/`update`/`unchanged` match.** Each
   desired process lists the committed process ids it replaces: `[]`→new, `[X]`→update or
   unchanged, `[X,Y]`→**merge**, two desired each `[X]`→**split**. Committed boundaries are
   **provisional** — `classify` proposes restructuring instead of aligning to them (the
   [0008](0008-segmentation-node-visibility-semantic-subprocess.md) Step-4 alignment bridge
   is removed).

3. **New deterministic restructuring operations** in `merge`: `restructure` (merge/split),
   `attach-subprocess` (re-parent an existing process, keeps its id), and `remove`.
   Merge/split heirs get **fresh ids** and every superseded original is **tombstoned**
   (`tombstoned:true` + `superseded_by:[heir ids]`), with **full hierarchy redirect** of
   `subprocess`/`parent` pointers (hierarchy-closed; the engine refuses a dangling
   reference by name). INV-4 holds: the engine **never deletes** a process — it tombstones.

4. **Ids are never reused, even after permanent delete** — a durable per-department
   `.id-seq.json` high-water ledger. `next_process_id` (mint) persists it;
   `peek_process_id` (preview, used by the UI `/next-id`) does not, so rendering a form
   never burns an id. This changes the old "scan the disk, max+1" rule (ARD §4.1).

5. **Two human gates.** **Gate A** — set confirmation, before any transcription (discloses
   the set and what an explicit list leaves out). **Gate B** — the segmentation/restructure
   checkpoint (proposed process set with op labels, attributed evidence, contradictions),
   the former single checkpoint. The run is now scoped to **one department** (`runs/{department}/{stamp}/`).

6. **Direct conversational edits** — a new `edit-process` skill lets the user edit committed
   work by chat with no voice ("change node X's label in process Y"). It goes through the
   same `merge` verbs (never a direct write), is committed with `source.type:"chat"`, and
   preserves INV-1/3/4 and the merge-is-sole-writer rule.

7. **The delta gains `revise_nodes`** (overwrite a committed field on supersession, distinct
   from fill-empty `enrich_nodes`) **and `remove_edges`** (edge hygiene — drop an edge made
   redundant by a re-route; edges are structure, hard-deleted, not INV-4-protected content).

8. **UI**: tombstoned processes are shown labelled («باطل‌شده»), **view-only** everywhere
   (list, summary, flowchart), with links to their heirs and a user-initiated **permanent
   delete** (the allowed exception to "never delete" — automatic deletion never happens).

## Consequences

- ✅ A wrong baseline is **correctable** (merge over-fragmented processes, split a
  conflated one) and genuinely new processes can emerge — because every run re-reads the
  **raw** evidence, not the distilled structure a past mistake produced.
- ✅ De-duplication happens by reconciling all the evidence against committed processes via
  `supersedes`, rather than hoping the first recording was right.
- ✅ Ids are monotonic and never reused across tombstone, restructure, and permanent delete.
- ⚠️ **Every run re-reads the whole set** (cost scales with the department's transcript
  count). This is deliberate — it is exactly what lets a later run restructure. The hard
  limit is an **explicit stop**, never a silent degrade.
- ⚠️ **One department per run replaces the multi-department voice fan-out** (old ARD §5.8 /
  PRD FR-P8): `classify` still assigns each segment its true department, but a *run* commits
  one department's set; cross-department material is picked up by that department's own run.
- ⚠️ **Two mid-run pauses** (Gate A, Gate B) instead of one — both are legitimate turn-end
  points under the SDK bridge's turn discipline (cf. [0003](0003-extract-serial-no-parallel-fan-out.md)).
- 📝 ARD (§2.2 run layout, §4.1 ids, §5 pipeline, §6 merge, §8 CLIs, §13 UI) and PRD
  (FR-P3/P4/P8, FR-M, INV-4) updated to match.

## Implementation note

Built in three subagent-driven, per-task-reviewed phases with three whole-branch reviews
(spec §9): **Phase 1** engine + schemas (durable id ledger; `remove_edges`/`revise_nodes`;
`restructure`/`attach-subprocess`/`remove` + hierarchy redirect + tombstones); **Phase 2**
set-based orchestration + agent prompts + `edit-process`; **Phase 3** UI tombstone display +
permanent delete. Merged to `main` in both repos (code-repo + data-repo). A pre-merge
full-suite run caught a real regression (schema fixtures still on the old shape) that the
per-task reviews had missed — fixed before merge. Tests: engine 259, ui-backend 66, frontend
93, all green.

## Lessons

- **Reading all the raw material beats distilling it.** The one run that produced a
  materially better result was the expert handing over three raw transcripts at once — the
  behaviour to reproduce, not improve on. A digest is a summary; summarising is the very
  failure being fixed.
- **Restructuring needs the original evidence, not the artifact the mistake produced.** You
  cannot judge "these two over-fragmented processes are really one" from the structure the
  over-fragmentation produced — only from the raw transcripts that built it.
- **Run the full test suite before merging.** Per-task schema reviews validated ad-hoc
  instances and missed that the committed fixtures were still the old shape; the pre-merge
  gate caught the 5 failures.
