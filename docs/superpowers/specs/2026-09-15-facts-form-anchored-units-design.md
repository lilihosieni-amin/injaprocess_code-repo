# Facts engine: form-anchored units — design

**Status:** proposal for the owner's approval, 2026-09-15. **Nothing in this document is implemented.**
The direction was agreed with the owner in conversation on 2026-09-15 («i'm ok»); the numbers in §4
are the proposal to approve.
**Scope:** the planner (`engine/facts_plan/build.py`), the unit input, `facts-plan status`, the
assembly's account handling, the quantify agent text and playbook. The review stage, the store gate
and the panel are unchanged except where named.
**Builds on:** `2026-09-13-facts-gate-tiers-design.md` (tiers), ADR 0017 (units of ≤20K).

---

## 1. Why

Today a run cuts its inputs by type: one unit per workbook, one per photo batch, one per transcript
chunk. The transcript units work blind to the forms: their input lists the run's tables by title
only — no columns, no values. The reviewer sees digests (key, title, statement, field names), never
a transcript line or a cell.

The owner's observation: the meetings are mostly *about* the Excel files and the photographed forms;
what is said only in a meeting and appears in no file, photo or process exists, but is rare. A
person can also say a number wrong while the form has it right.

The preparation run of 2026-09-14 (`runs/facts/preparation/20260914-064020`, 219 entries) confirms
it:

- **19 of 37 tables were described from speech alone** — no sheet or photo behind them; the other
  18 came from the workbook (7) and the photos (11).
- The reviewer made 31 merges; **8 joined a speech-described table to a form** read from a photo or
  the workbook, matched by title similarity alone. The rest of the speech-only tables stayed.
- A speech value and a form value that disagree on one table never reach the reviewer: the engine
  turns them into an owner dispute (`_cross_unit` → accounts → `_disputes`). The reviewer could not
  judge anyway — it has no evidence in front of it. In that run the path was never exercised.
- The transcript units' «ورودی‌های قابل استفادهٔ مجدد» section printed lines like
  `S-rec-2c14… · record · خروجی آماده‌سازی به انبار` and nothing more.

So the split produces tables that are duplicates at best and wrong at worst, and the final stage
can only merge look-alikes and push conflicts to the owner.

## 2. Principles

1. **Forms are the anchor; speech annotates them.** A table's columns and values come from the
   file or the photo. Talk about that table is read *next to it*, by the unit that decides it.
2. **The engine selects, the model never searches.** A unit reads its `input.md` and nothing else
   (v3 §2.4). What talk a form unit sees is chosen deterministically by the planner, so a run is
   reproducible and its cost is known before the first dispatch.
3. **Nothing spoken is skipped.** The transcripts are still read in full, by units that know what
   the forms already recorded and add only what is not there.
4. **Input may grow; output may not.** ADR 0017's cap exists because three agents crashed on the
   model's *output* limit when handed a whole department. The planner's output estimate (20K) is
   the binding limit and stays; the input budgets rise under it, so a unit reads more but never
   answers more than the model can write.
5. **Tiers stand.** Every gate rule keeps its 2026-09-13 tier; this design changes what a unit sees
   and in what order units run, not what the engine refuses.

## 3. The two phases

`plan.json` gains `phase` per unit. `facts-plan status` lists phase-1 units as pending first; phase-2
units become pending only when every phase-1 unit is `done` or `failed`. The playbook's Stage U
batches are unchanged (≤4 per message, validate on return, retry only refused decisions); it simply
finds phase-2 units in `status` once phase 1 is over.

### Phase 1 — form units (workbook, attachment, items)

The input gains one section, **«گفت‌وگوهای مرتبط»** (related talk), after «## متن»:

- **What is selected.** For each transcript the owner chose at Gate A, the planner scans it in
  windows of 40 lines, stepping 20, and scores each window by the tokens it shares with the unit's
  *anchor vocabulary*: its candidates' titles, aliases, column titles and row labels (a workbook), or
  the attachment texts' headings and first lines (a photo batch), or the item codes and names (items).
  Tokens are the planner's existing `_tokens` (the same function that ranks process steps today).
- **How much.** Windows are taken best-first until the section reaches the context budget (§4);
  windows that touch are merged into one passage; a window with a score of 0 is never taken.
  Passages are printed in transcript order, each headed by the meeting's date and its line range
  (`## ۱۴۰۵/۰۶/۰۱ · L213–L252`), so a citation to it is checkable.
- **Where the budget check happens.** The unit's *core* input (candidates, text, cards) must fit
  the core budget (§4), and `split_unit` runs on the core alone, as today. The talk section is
  appended after the fit check and never causes or prevents a split.
- **What the unit does with it.** The agent text tells a form unit: the table's columns and values
  are the file's or the photo's; use the talk to fill titles, units, cadence, holders, thresholds
  and aliases the file does not state, and to cite the meeting (`source[]` gains a `voice` member
  with the lines). **Contradiction rule:** when the talk gives a value the form contradicts, the
  form's value is written and the spoken one becomes an `account` on the same entry with its `voice`
  source and lines — the panel and the report show it as a dispute for the owner, and no second
  entry is born from it.

### Phase 2 — transcript units

The «ورودی‌های قابل استفادهٔ مجدد» section is replaced by **«آنچه تا کنون ثبت شده»** (what is
recorded so far), rendered from phase 1's folded outputs after they are gated (the same fold the
assembly uses, run over phase-1 units only):

- every record with its columns (`key · title · unit`) and its medium/location line;
- every rule by key, title and statement;
- every item by code and title;
- then, as today, the store's open entries of the department, ranked and capped.

Each phase-1 entry is printed with a handle the transcript unit may reference: the candidate's
`S-…` id where it has one, otherwise a run-wide `N-…` handle the planner mints for a phase-1 `new[]`
entry and `_resolve_refs` resolves at assembly (today `N-` handles are unit-local; this makes the
phase-1 ones run-wide).

The agent text tells a transcript unit: a spoken number about a listed table goes to that table —
as a `new[]` measurement or note addressed to it (`{"ref": …}`), or as an account when it disagrees
with a listed value; a new table is described **only** when no listed table fits, and it stays
marked `inferred` (F6) as today. Everything that is neither a form nor a rule already listed is
written as today.

Phase-2 inputs are rendered when `status` first finds phase 1 complete (the `refresh_inputs` path,
restricted to phase-2 units), so they see the *gated* phase-1 result, not raw outputs.

### Review, assembly, apply — unchanged, with one nudge

The reviewer's digest gains each entry's source kinds (`sheet · voice`, `voice`), and the review
text says: when two entries merge, the one read off a form is the keeper. Accounts written by phase 1
are ordinary accounts to the ladder and to `_disputes`.

## 4. Numbers to approve

| | Today | Proposed |
|---|---|---|
| Core input per unit (candidates + text + cards) | 20K | **50K** (owner, 2026-09-15) |
| Line cap per unit (`MAX_LINES`) | 1,800 | **4,500** (a 50K chunk of Persian speech) |
| Related-talk context per form unit | — | **up to 80K** |
| Total input per unit | 20K | **≤130K** |
| «Recorded so far» slice per transcript unit | ≈40 lines | **up to 20K** |
| Estimated output per unit | 20K | **20K** (unchanged — the binding limit; verified against the model's real output cap in the plan) |
| Candidates per unit, split rules | as today | unchanged (the output estimate splits, as today) |

Model: the runtime already runs `claude-opus-5[1m]`; 130K per call is far inside it. A transcript
chunk is estimated at 0.4 × its input, so 50K of transcript meets the 20K output budget exactly:
Monday's 16 transcript units become about 7, each a longer stretch of one meeting.

Cost on the 2026-09-14 preparation run, estimated: 3 form units × ≤80K talk ≈ 240K extra input
tokens, 16 transcript units × ≈15K extra slice ≈ 240K; at list price under $8 more per run, most of
it cacheable. Time: phase 2 waits for phase 1 — one extra batch round, a few minutes.

## 5. What changes where

| Area | Change |
|---|---|
| `build.py` | `phase` per unit; `related_talk(unit, transcripts)` window ranking; core-vs-context fit; phase-2 rendering from gated phase-1 outputs; run-wide `N-` handles |
| `assemble.py` (`status`) | phase gating of `pending`; renders phase-2 inputs on first completion of phase 1 |
| `assemble.py` (fold / resolve) | resolve run-wide `N-` handles; accounts from a unit carry `voice` sources with lines |
| `facts-unit.schema.json` | `accounts[]` allowed on a unit's decision and `new[]` entry (today accounts are assembly-made) |
| digest / review card | source kinds per entry; "form wins a merge" |
| `agents/quantify.md` | the two sections, the contradiction rule, the "listed table first" rule |
| `quantify/SKILL.md` | Stage U: phase 2 appears in `status` after phase 1; nothing else |
| runbook 07, ADR 0017 | the input budget and its reason; the phases |

Not changed: the store gate, the tiers, the report, the panel.

## 6. Generality

- A department with no chosen recordings runs phase 1 only. One with no workbooks, attachments or
  items runs phase 2 only, exactly as today.
- Selection scoring is over the department's own words; there is no list of Persian keywords to
  maintain.
- A transcript that mentions no form scores 0 everywhere and appears in no talk section; it is still
  read whole in phase 2.

## 7. Tests

- Planner: a fixture with two transcripts and one workbook → the workbook unit's talk section holds
  the windows that name its tabs, in transcript order, under budget; a 0-score window never appears;
  two runs give byte-identical inputs.
- Fit: a workbook whose core is over budget still splits by tab, and each part gets its own talk
  section; the talk never triggers a split.
- Status: with one phase-1 unit pending, no phase-2 unit is listed; once all are done or failed,
  phase-2 inputs exist and list phase-1 tables with columns and handles.
- Assembly: a phase-2 note addressed to a phase-1 `N-` handle lands on that entry; an account written
  by a phase-1 unit reaches the store as an account and the report as a dispute.
- Real-run fixture: the 2026-09-14 preparation run re-planned → the workbook unit's talk section
  contains the passages about «بازدهی» and «فرم درخواست کالا»; the count of speech-only records in
  a re-assembly is reported (target: well under 19).

## 8. Open questions for the owner

1. §4's numbers — 50K core (owner-set), 80K of talk per form unit, 20K of "recorded so far" per
   transcript unit.
2. Whether the talk section should also be given to the **reviewer** for the entries it merges.
   Proposed: no — the reviewer stays a digest reader; the evidence lives in the units.
