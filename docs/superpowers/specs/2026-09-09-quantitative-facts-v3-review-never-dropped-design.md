# Quantitative facts v3.8 — the review is never dropped

**Status:** owner ruling, 2026-09-09. Supersedes §2.6's "one round, no negotiation", the two
review caps and the 50 K digest ceiling of the v3 design
(`2026-09-06-quantitative-facts-v3-design.md`, QF-52) and everything the playbook says about
proceeding without the review.

## 1. Why

Both real runs lost their review, and neither loss was the reviewer being wrong about content.

| Run | Reviewer wrote | Why it was lost |
|---|---|---|
| cooking, 2026-09-08 | 22 decisions, 3 real duplicate merges | attempt 1: a one-member `data` replaced the whole block (engine, fixed 09-09); attempt 2: the reviewer added `code`, which the schema forbids — the whole document refused |
| accounting, 2026-09-09 | 3 decisions, 1 duplicate merge | a `fields[]` rewrite the digest cannot support; the retry error read "primaryKey member … is not a declared field" — the name elided |

The store carries the duplicates today. The owner's ruling: **the review is never dropped.**
What passes is applied; what fails is held back **by decision** and named in the report; a stale
review is redone, never skipped; a digest too big to review is a defect that stops the run, not a
reason to continue without one.

## 2. Rules

**R1 — Per-decision hold-back.** `assemble --review` folds every review decision that passes and
holds back the ones that do not, each with a reason code. `review_status` is `applied` (nothing
held), `partial` (some held) or `absent` (no `review/out.json` — the engine still admits a run
assembled without `--review`, the playbook never does it). `discarded` no longer exists.

Reason codes, one per held decision:

| code | when | Persian (report) |
|---|---|---|
| `no_match` | the address names no assembled entry | نشانی به هیچ موردی نمی‌رسید |
| `ambiguous` | the address names more than one | نشانی به بیش از یک مورد می‌رسید |
| `no_drift` | a `contradiction` on a field no drift flag names | تناقض روی میدانی بود که پرچم اختلاف نداشت |
| `unknown_skeleton` | a `skeleton` no unit of the run decided | نامزدی که نام برده شد در این اجرا نبود |
| `fields_rewrite` | a `keep` carrying `data.fields` (the digest shows minted keys only, never the column keys the shape needs) | بازنویسی ستون‌های جدول از بازبینی پذیرفته نمی‌شود |
| `refused` | the folded entry fails the lint or the store contract (`review: <key>` lines) | نتیجهٔ بازنویسی با قرارداد ثبت جور در نیامد |

A `merge_into` whose `into` address hits zero or more than one entry is `no_match`/`ambiguous` on
that decision. A held decision leaves the unit's version of the entry exactly as the unit wrote it.

`assembly.json` gains `review_held: [{n, action, label, reason, lines}]` — `n` the decision's index
in `review/out.json`, `label` the Persian title of the entry it addressed (the candidate's label
for a `skeleton` address; the bare `kind key` when nothing matched), `lines` the engine's own
messages. Always present, `[]` when nothing was held.

**R2 — The fold loop.** After folding, `assemble` lints as today. A lint line labelled
`review: <key>` names a review decision, not a unit: the decision(s) that touched that entry (a
`keep`, a `merge_into` onto it, or a `contradiction` settled on it) are held back with `refused`,
the review is folded again without them, and the loop repeats to a fixpoint (bounded by the number
of decisions). Unit-labelled lint lines keep today's entry-level hold-back (`undecided[]`). The
run refuses (exit 2) only when nothing at all can be assembled — unchanged.

**R3 — A stale review is redone, never skipped.** `review/input.sha256` no longer matching the
digest makes `assemble --review` exit 2 with «the digest changed since this review was written —
run digest and the review again», and `validate facts-unit review/out.json` says the same. The
playbook re-enters Stage R. Nothing is written.

**R4 — `code` is the engine's.** `decisionData` admits `code` (a leaf) so a document carrying it
passes the schema; the fold removes `code` from every decision's `data` — a unit's and the
review's alike — before merging. Nothing is refused for it.

**R5 — Concrete errors.** `group_messages` keeps grouping by the rule with its quoted spans folded,
but the line it prints carries the **first message's body verbatim**, specifics and all:
`primaryKey member 'tarikh' is not a declared field — 1 entries: review`. A reviewer or a unit
retrying sees what to change.

**R6 — No caps.** `REVIEW_DECISIONS`, `REVIEW_REWRITES`, `_review_caps`, the schema's
`maxItems: 60` and the digest's header line go. The agent is still told where to spend its
attention (duplicates, contradictions, cell-reference statements — not polish); that is guidance,
not a count. Rationale: the rewrite cap guarded against a less-informed reviewer re-authoring the
units' prose, but the lint, the store contract and the report naming every rewrite are the real
guards, and a count was refusing whole reviews.

**R7 — The ceiling is a stop, not a skip.** `DIGEST_CEILING = 400_000` tokens by the engine's own
estimator (the runtime model holds 1 M; cooking, the largest department, digests to ~29 K).
Above it `digest` writes nothing and exits 2 naming the count; the playbook stops the run and
reports a defect in Persian. Slicing the digest across several reviewers is the upgrade path if a
department ever reaches it.

**R8 — Retry, then hold back.** Stage R: validate; on failure re-dispatch once with the validator's
lines appended; on a second failure continue to Stage V anyway — `assemble --review` applies what
passes. The reviewer has the same two attempts a unit has (I5), and what still fails after them is
held back by decision, never the document.

**R9 — The report says what happened.** After the held-back block:
`applied` → «بازبینی انجام شد.»; `partial` → «بازبینی انجام شد؛ {n} تصمیم آن کنار گذاشته شد:» then
one line per held decision, «  • «{label}» — {reason in Persian}»; `absent` → «بازبینی اجرا نشد.»
(engine-only). No id, code, path or unit id — the report is a bot message.

## 3. What changes where

- `engine/facts_plan/assemble.py`: `_review_problems` → per-decision verdicts with reason codes;
  `_fold_review(..., exclude, held)`; `_prepare(..., exclude, held)`; the outer fold loop in
  `assemble`; `state["reviewed_by"]` (skeleton → decision indices, contradictions included);
  `review_held` in `assembly.json`; statuses; `code` stripped where decisions are read; caps and
  their header line removed; `DIGEST_CEILING` and `digest`'s exit; `REVIEW_HELD_FA`; `report`.
- `engine/merge_facts/content.py`: `group_messages` prints the first concrete body.
- `schemas/facts-unit.schema.json`: `code` in `decisionData`; the review `if/then` `maxItems` goes
  (the `else` branch that forbids `contradiction` outside a review stays).
- `engine/tests/…`: the "discarded" tests become hold-back tests; new tests per rule (§4).
- data-repo `.claude/skills/quantify/SKILL.md` (Stage R, Stage V, Stage 7, invariants),
  `.claude/agents/quantify.md` (`review` mode), `.claude/hooks/test_playbook_lint.py`, `CLAUDE.md`.
- `docs/decisions/0017-facts-pipeline-v3.md` (ruling appended), `docs/runbooks/07-facts.md` (§11
  and the refusal table), `docs/guides/quantitative-facts-walkthrough.md` (Stage R, Stage V step 2,
  the report's closing line).

## 4. Tests that pin it

- A review with one bad address and one good decision: status `partial`, the good one applied,
  `review_held` has one `no_match` row naming the address, the entry keeps the unit's title.
- A `contradiction` on an unflagged field: `no_drift`, value untouched, status `partial`.
- A `keep` whose folded entry fails the store contract: `refused`, the unit's version kept, the
  other decisions applied.
- A `keep` carrying `data.fields`: `fields_rewrite`.
- A `keep` carrying `data.code`: applied, `code` unchanged from the skeleton's.
- A stale digest: `assemble --review` raises `SystemExit(2)`, writes no delta; `validate_unit`
  names it.
- 61 decisions and 21 rewrites: accepted.
- A digest over the ceiling: `SystemExit(2)`, no `review/input.md`.
- `group_messages`: a single message keeps its quoted specifics on the printed line.
- `report`: `partial` renders titles and Persian reasons, and the text carries no `F-`, `T-`,
  `S-`, `u-` id, no `/`, no `##` code.
- Playbook lint: the review-mode section states the no-cap/hold-back sentence; `SKILL.md` no
  longer contains "proceed **without** the review" or "proceed without it".
