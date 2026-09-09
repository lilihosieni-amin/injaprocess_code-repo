# 0017 — Facts pipeline v3: a planner mints the candidates, units of ≤20K decide them

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-06 |
| **Area** | `engine/facts_plan/` (new), `engine/merge_facts/`, `engine/dump_workbook/`, `schemas/` (v2); `data-repo` `.claude/agents/quantify.md` + `.claude/skills/quantify/SKILL.md` |
| **Related** | [0006](0006-control-bot-disable-background-task-deferral.md), [0011](0011-extract-bounded-parallel-batch-of-4.md), [0012](0012-consolidation-review-stage.md), [0015](0015-control-bot-1m-context-window.md) |

## Context

The first quantitative-facts run (cooking, 2026-09-02) produced 486 entries the
owner rejected, took 14 hours, and crashed three agents on the output cap. The
postmortem (`docs/postmortems/2026-09-06-quantify-cooking-run.md`) traced its 76
problems to eight causes. Four of them are architectural rather than a matter of
prompt wording:

- **The model re-typed the dump.** One agent was handed a whole department —
  13 workbooks, 316 tabs — and asked to walk it and emit a delta. It spent its
  output budget transcribing column letters and cell addresses that the dumper
  had already written to disk in a machine-readable form.
- **There was no runtime model.** No unit of work, no size budget, no derived
  state, no resume point. The run was one dispatch that either finished or did
  not, and when it did not there was nothing to resume from.
- **The spec ordered the junk.** «one record per tab, one rule per formula
  group, one constant per literal» is a faithful description of a spreadsheet
  and a useless description of a restaurant. A mirror tab became a record; a
  tolerance of 5 grams became an entry; a colour rule testing a sign at zero
  became a fact.
- **The coordinator became the author.** With no engine-written owner message,
  the playbook composed the checkpoint out of the delta — and once it was
  reading the delta it started correcting it, which is how a rescue run
  hand-edited the store.

## Decision

**A deterministic CLI plans the run; the model only decides.**

`facts-plan build` reads the dumps and writes **candidates** — record templates,
items, rule columns, import edges — with every mechanical field already filled,
and packs them with the transcripts and attachments into **units** whose
rendered input is ≤20K tokens and whose estimated output is ≤20K. The model
never reads a dump, a transcript or the store: one Read brings its unit in, one
short Write takes its decisions out.

Four consequences follow, each removing one of the four causes:

1. **QF-46 — the engine writes everything mechanical.** Locations, instances,
   column letters, enum constraints, reference rows, item codes, a rule's
   original text and its bindings, import edges, truncation checks. No key
   segment is ever derived from Persian text; sheet ids, column letters and row
   numbers are the mechanical handles.
2. **QF-51 — units of work are the unit of dispatch.** Units run in bounded
   parallel batches of at most four `Task`s per message (ADR 0011); every unit
   is validated on return; a unit is dispatched at most twice; each attempt is
   persisted under its own file name, so state is *derived from the filesystem*
   rather than tracked, and Stage 0 resumes at the first unfinished unit. The
   turn yields at a stage or batch boundary once its timer passes 40 minutes,
   and `facts-plan status`'s `yield` flag is the only signal the coordinator
   acts on.
3. **QF-47/48/49 — identity is by content, a mirror is an edge, and usefulness
   is rule 0.** One computation across four line tabs and two branches is one
   entry with sixty bindings, not sixty entries. A mirror tab produces no entry
   at all — it produces an `imports[]` member on the instances that read it.
   And a candidate must pass a usefulness test before any kind is assigned.
4. **QF-54 — the coordinator never authors.** `assemble` writes `gate-b.md` and
   `report` writes `report.md`; the playbook sends each verbatim and composes
   nothing. It reads exactly four things: `facts-plan status`, those two files,
   and validator output.

`validate facts-delta --store --run` performs the entire apply in memory —
including the resulting store's schema — and writes nothing, so a delta that
reaches the owner's checkpoint is one `apply` cannot refuse. Stage V is what
makes "a precondition failure after Gate B stops the run" a rule nobody has to
break.

### The rulings that changed the design while it was built

Five questions the design did not answer were settled against the estate during
implementation and are recorded in the plan's pre-flight ledger
(`.superpowers/sdd/2026-09-06-quantitative-facts-v3/progress.md`). Each changed
what the engine does, so each belongs here rather than in a task report:

- **A table-reading function is transitive.** A `.gs` function reads a table if
  its own body does *or* if any function it calls does; the reader set is the
  closure over the estate's script bodies. Grouping by the direct callers alone
  would have split rules whose inlined food-id sets vary per line — the very
  duplication §2.3's grouping exists to prevent (T11).
- **The lint does not walk `applies_to[].params`.** §5.2 reads as if every
  string in a payload were prose; the params are refs and literals by
  construction, and linting them would refuse a binding for carrying the number
  it exists to carry (T6).
- **`twin_of` is the owner's manifest field, not an engine inference.** Two
  spellings of one line («FRIED🍤»/«Sokhari», the two report books) do not fold
  onto one group key, and a candidate whose instances span both would sit in
  two units. `build` refuses that plan outright — exit 2 naming both rows and
  the `twin_of` remedy — instead of silently duplicating the candidate (T13).
- **A transcript unit never decides a sheet record's candidate.** A candidate
  belongs to its own unit, and `assemble` sends it to `undecided[]` when that
  unit returned nothing, whoever else decided it. What a meeting said about a
  sheet record is written by the transcript unit as a `new[]` note or
  measurement addressed to that record, and the reviewer merges the two (T16).
- **The once-per-run-dir `used` marker keys on the run's snapshot, not on
  `id-map.json`.** The map is written after `save_store`, so a crash in that
  window left a mutated store in an unmarked directory and a naive retry would
  have written a wrong map. Keying on the earliest artefact the apply writes
  closes it (T5).

## Consequences

- ✅ No agent is ever handed more than ~20K tokens of input or asked for more
  than ~20K of output, so the output-cap crash has no shape to recur in.
- ✅ A run is resumable at unit granularity, and a turn that ends at a boundary
  is a normal outcome rather than a stall.
- ✅ The 70 cooking mirror tabs become 94 import edges and 0 entries (an edge is
  one *(mirror tab, consumer instance)* pair, so the two numbers differ); the
  tolerances become parameters of one rule rather than five entries.
- ✅ The owner's two messages are engine output, reviewable as fixtures and
  lintable as text (`data-repo/.claude/hooks/test_playbook_lint.py`).
- ⚠️ **The estimator is a heuristic.** Its constants are frozen in
  `engine/tests/fixtures/facts-plan/expected.json`, so a retune shows as a
  fixture diff — but a department whose shape differs from cooking's may still
  split badly, and `build` exits 2 on a group it cannot fit rather than
  guessing.
- ⚠️ **One review round, capped at 60 decisions and 20 rewrites.** Cross-unit
  duplication beyond key, title and normalised-`expr` equality is the audit's
  problem, not the run's.
- 📝 The store is reset and rebuilt (§8) rather than migrated: at one seed entry
  a migration verb would be more code than the thing it migrates.
- 📝 `schema_version` moves to 2 with `additionalProperties: false` on every
  payload, so an invented key now fails at the schema rather than at review.
- 📝 The workbook-coverage metric is withdrawn with it (QF-44 v3): `merge facts
  check` ends with a `readiness:` line, and `merge facts repair-foreign-keys` is
  retired along with the `foreignKeys` collection it repaired.

## Lessons

- **Ask what the model is uniquely for, and give it only that.** Every field the
  first run got wrong at scale was a field a deterministic reader could have
  filled. The prompt was not the problem; the division of labour was.
- **Identity is the design decision, not a naming convention.** Keying a rule by
  where its formula lives guarantees one entry per cell range. Keying it by what
  it computes made 486 entries into a few dozen — the same information, in the
  shape a person can review.
- **A coordinator with no artefact to send will write one.** The fix is not to
  tell it not to; it is to hand it a finished file and forbid it the inputs.

## Addendum — 2026-09-07: the unit gate closes

The first real v3 run (cooking, `20260907-052345`) reached the end of the
pipeline: fourteen units and the review passed their gates, `assemble` produced
220 entries, and the final validation refused **52 of them** — 17 records, 5
measurements, 30 rules — on shape alone. Column types written as `text`; a
computed column marked yes/no instead of a reference; `cadence` and `quantity`
in Persian words rather than their enum values; rules with no
`inputs`/`outputs`; and two paper forms photographed in the meeting written as
records with invented keys and no `location`. The content was right. Three
causes, all of them structural:

- `facts-unit.schema.json` closes a decision's **keys** and leaves its
  **values** open, and `validate facts-unit` never checked the entry a decision
  would become — so the store's closed contract was first applied after every
  unit and the reviewer had spent their attempts.
- The unit was never shown that contract: `input.md` carried the expression and
  style cards, not the payload shapes, so a record with no workbook candidate —
  a paper form, whatever medium it arrived in — was authored freehand.
- `engine_common.validate` reported the first five errors on one line, and for
  an `entries[N]` `oneOf` failure that line was the whole entry. The
  coordinator chased five at a time, re-dispatched a unit past the two-attempt
  cap (one reached `out.3.json`), ran engine internals from Python to dry-run
  the fold, and ended by asking the owner to lift the cap — postmortem causes D
  and H, unchanged by v3 because v3 had made neither cap mechanical.

The remedy is two invariants, designed in
`docs/superpowers/specs/2026-09-07-quantitative-facts-v3-gate-design.md`.
**I1 — the output side is closed at the unit's gate:** whatever a unit writes is
validated there against the same per-entry contract `apply` enforces — the store
schema in its delta form (`facts-delta.schema.json`, the store's shapes with
`original` in place of `original_ref`, without the store-required `rows[].key` —
derived at apply for a reference table, refused at the gate for every other
role — and without the envelope keys apply writes: `id` as a real fact id,
`status`, `updated_at`, `source[].hash`/`run`, `accounts[].id`) and the content
pass, plus branch codes
off the sheets manifest, unit symbols off the units record, `fields[].from`
against the candidate's columns and a cross-kind `merge_into` — and a per-entry
refusal after it is a defect. **I2 — the intake is explicit:** a file
`extract-attachment` cannot read, or one whose cached text is missing or stale,
is recorded as an `unread_attachment` issue and named once to the owner in both
`gate-b.md` and `report.md`, never improvised over. With them: the shape section
rendered into every `input.md` from the delta schema itself, `location` closed
per `medium` (paper `{kept_at, holder}`, external `{system, kept_at}` plus an
optional `identifier_scheme`, native an optional `{kept_at}` and the same
`identifier_scheme`, sheet the engine's own optional keys), field-path error
lines with no truncation and an 80-line cap, the attempt cap and the yield stop
enforced by the engine, and a guard that blocks driving the engine from Python.
No new file-type branch anywhere in the units — I1 and I2 are the mechanism.

2026-09-08 (addendum v3.5): a tombstoned process is never read as content (I3);
intake walks subdirectories; the reviewer's contradictions are bounded to
flagged fields; see the v3.5 spec.

2026-09-08 (addendum v3.6, generality): **I4** — the engine's own candidates pass
the engine's own gate for any estate the dumper can read (`facts-plan preflight`
reports `engine_refused: 0`, over generated estates as well as the fixture);
**I5** — a run stops only when nothing at all can be assembled, and every other
refusal names one candidate or one entry, holds it back into `undecided[]` and
lets the rest land (the five kept stops are listed in runbook §10); **I6** — the
estate's own spellings (branch tokens, item-code namespaces, placeholder header,
month names, table prefix) are data in `attachments/sheets/manifest.json` under
`conventions`, written by `dump-workbook --init-manifest`, and no module that
reads the estate carries one as a literal. See the v3.6 spec.

2026-09-09 (addendum v3.7): **I7** — a chat instruction is one round trip:
`merge facts edit` rewrites a value in place (the write ladder could only
create, fill, dispute, append and union, so «change this word» had no verb at
all), settles any dispute its `set` touches, and leaves the entry confirmed as
the chat actor's — a filesystem ledger, `facts/.confirmations.json`, keyed by
the entry's own `updated_at` and read by the ui-backend beside its `app.db`
marks, because the engine cannot reach that database (ARD §1). `edit` writes a
row always; `apply`/`resolve`/`retire`/`promote` only when the run's `meta.json`
says `origin: chat`; `revert` forgets the rows its run wrote; and `save_store`
prunes every row whose entry has moved on or gone, so the file can never carry a
stale vouch — with one corollary of keying on `updated_at`'s second resolution: a
write landing in the same UTC second as the vouched one leaves the row standing.
Both sides of the ledger serialise their read-modify-write on
`facts/.confirmations.lock`. See the v3.7 spec §2–§3.

**I8** — a `lang: table` rule's `data.table.rows[]` is a list of **flat**
objects keyed by the table's own `inputs[]`/`outputs[]`, and no other shape
survives. Three contracts had left the row shape undefined —
both store schemas typed `table` as a bare object, and the shape card the model
is shown gave no example — so the engine's units wrote flat rows while the UI
was built from a design mock that nested them as `{when, then}`, and neither
side was ever refused. Now both schemas close `table` (`inputs`, `outputs`,
`rows` required; `hit`, `aggregate`, `default` optional), `content.py`'s
`_check_table_shape` refuses a nested row by name, a row key that is not a
column, a row that names no output, a table column that is not a declared
input/output, an `expr` on a table rule and a `table` on a rule whose `lang` is
not `table`; the shape card names the fourth rule body and carries a worked
example of it; and the card reads the declared shape only. See the v3.7 spec §4.
