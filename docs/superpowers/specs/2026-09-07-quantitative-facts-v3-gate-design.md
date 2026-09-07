# Quantitative Facts v3 — the unit gate closes (design addendum, v3.4)

Addendum to `2026-09-06-quantitative-facts-v3-design.md` (v3.3). It changes §2.4, §2.5, §3.3 and
§4's `validate` row and adds two invariants. Everything not named here stands.

## 1. What the first real run showed (2026-09-07, cooking, run `20260907-052345`)

Fourteen units and the review passed their gates; `assemble` produced 220 entries; Stage V
refused 52 of them (17 records, 5 measurements, 30 rules) on **shape** alone: column types written
as `text`, a computed column marked yes/no instead of a reference, `cadence`/`quantity` in Persian
words instead of the enum, rules with no `inputs`/`outputs`, and two paper forms photographed in
the meeting written as records with invented keys (`blank_master`, `header_fields`, `signatures`,
`sections`) and no `location`. Nothing was wrong with the content. The cause:

- `facts-unit.schema.json` closes a decision's **keys** but leaves its **values** open
  (`fields[]`, `inputs`, `outputs`, `tracked` are "any leaf"; a `new[]` entry's `data` is any
  object), and `validate facts-unit` never checks the entry the decision will become against
  `facts.schema.json`. The store's closed contract is applied only at Stage V, after every unit and
  the reviewer have spent their attempts.
- The unit is never shown the contract: `input.md` carries the expression and style cards, not the
  payload shapes, so a record that has no workbook candidate (a paper form, whatever medium it
  arrived in) is authored freehand.
- `engine_common.validate` reports the first five errors on one line, and for an `entries[N]`
  `oneOf` failure that line is the whole entry; the coordinator chased five at a time, re-dispatched
  units past the two-attempt cap (one unit reached `out.3.json`), ran engine internals from Python
  to dry-run the fold, and ended by asking the owner to lift the cap — postmortem causes D and H
  again.

## 2. Two invariants

**I1 — the output side is closed at the unit's gate.** Whatever a unit writes, from whatever
evidence (sheet, transcript, `.docx`, `.pdf`, image, spoken), is validated at `validate facts-unit`
against the same per-entry contract `merge facts apply` enforces: the store schema per kind and the
content pass. A per-entry refusal after the unit gate is a defect. Stage V keeps only cross-entry
checks (title twins, instance guards, refs between units, the reviewer's caps) and those already name
the unit.

**I2 — the intake is explicit.** `extract-attachment` reads the extensions in its dispatch table and
nothing else. A file it cannot read is never improvised over: the planner records it as an issue,
`gate-b.md` and `report.md` name it once under the same heading as an unplaced workbook, and the
run continues without it.

## 3. Changes

### 3.1 `validate facts-unit` materialises and validates (§4 `validate` row, §2.5)

`facts_plan.assemble.validate_unit(root, run_dir, path)` gains, after its existing checks:

1. **Materialise.** For each decision that keeps or splits, build the entry `assemble` would build —
   candidate payload + the decision's data through the same `_entry`/`_pseudo` path (the shared
   function is `materialise(root, run_dir, doc) -> list[dict]`, used by both `validate_unit` and
   `_build_entries`, so the two cannot drift). Refs that point at other units' candidates keep their
   `S-`/`N-` handles (schema-valid temp forms) — cross-unit resolution stays in `assemble`.
2. **Store schema per kind.** Validate the materialised entries as a delta document
   (`{"schema_version": 2, "entries": [...]}`) against `facts-delta.schema.json`; report every error
   with the decision index, the skeleton id or `new[i]`, the field path and the rule (§3.4).
3. **Content pass.** `merge_facts.content.check_document(doc, "facts-delta", store, unit_symbols)`
   over the same document — the prose lint, the constant/record/param rules, exactly as
   `preconditions` runs them. Cross-entry rules that need the whole delta (twin titles, instance
   ownership) are not run here.
4. **A non-numeric field carrying `unit`** is an error (already promised, now enforced).

The review document goes through the same materialisation over the assembled draft. `facts-plan
status` therefore reports `failed` for exactly the outputs Stage V would refuse.

### 3.2 The shape section (§2.4, §5.2)

`facts_plan.build.shape_card(kinds) -> str` renders, **from `facts.schema.json` at build time**, one
section per kind the unit may write: the closed key list with the required keys marked, every enum
with its values, the five column types, `location` per `medium` (§3.3), a `new[]` example of a paper
form (record, `medium: paper`), one of a measurement and one of a rule with `inputs`/`outputs`. It is
appended to every `units/*/input.md` after the expression card and to `review/input.md`. A test
renders the card and asserts every enum value and required key of the schema appears in it, so the
card cannot drift from the checker (the guard Task 17 put on the expression card). The agent's
prompt says: "the shape section is the contract; a key not in it is refused".

### 3.3 `location` closes (§3.3)

`recordData.location` becomes a `oneOf` chosen by `medium`:

| medium | location |
|---|---|
| `sheet` | `{path, spreadsheetId, sheetId, sheet}` — closed, nothing required (the tree holds the engine's historical shapes and `{}` on a `new[]` record) |
| `paper` | `{kept_at: string, holder: string}` — both required: where the blank/filled forms are kept, who holds them; Persian prose, linted (`kept_at`, `holder`, `system` join the content pass's prose leaves) |
| `external` | `{system: string, kept_at: string}` both required, plus the existing optional `identifier_scheme` (the Sepidz till carries it today) |
| `native` | `{kept_at: string}` optional, plus optional `identifier_scheme` — the seed record `F-00001` carries `location: {}` and must keep validating |

Ruling (owner, 2026-09-07): the paper shape is the controller's to define; `{kept_at, holder}`.
The UI's RecordCard renders `kept_at`/`holder`/`system` in its location row (the no-instances region where «محل» lives); the «نسخه‌ها» band stays the instances band.

### 3.4 Errors say the field, all of them (§4)

`engine_common.validate(schema_name, instance)` raises `ValueError` whose message is one line per
distinct rule: `<path>: <rule> (<n> places: <first three paths>)`, no truncation to five, no entry
dumps. An `entries[N]` that fails `oneOf` is re-validated against the branch of its own `kind`
(`itemData`/`recordData`/…) and reported by field path (`entries[3].data.fields[2].type: 'text' is
not one of ['string','number','integer','boolean','date']`). The CLI prints the lines as they are;
`group_messages` folds identical rules across entries. A cap of 80 lines with `… and N more` keeps a pathological document readable (engine messages are English; Persian is for the owner's files).

### 3.5 Mechanical caps (§2.4, §6)

- `validate facts-unit` refuses `units/<u>/out.<n>.json` with `n > 2` (`attempt cap: two per run`);
  `status` reports such a unit `failed`; `assemble` treats it as failed. The playbook states the cap
  as a rule of the engine, not a choice.
- `facts-plan status` prints `yield true` when `turn.json` is older than 2 400 s; the playbook's
  Stage U says **stop the turn** at that point — send the progress line and end — never continue.

### 3.6 The guard blocks engine internals (data-repo `.claude/hooks/guard.py`)

A Bash command that runs `python`/`python3` with `facts_plan`, `merge_facts` or `engine_common`
imported (`-c`, `-m`, a heredoc or a script under `runs/`) is blocked with one message: the engine
is driven through its CLIs only. The engine CLIs themselves (`facts-plan`, `validate`, `merge`,
`dump-workbook`, `extract-attachment`, `transcribe`, `allocate-id`) stay allowed. Tests for the
blocked and the allowed forms.

### 3.7 Unread attachments are named (I2)

`facts-plan build` compares the department's `attachments/` with its `.text/` sidecars: a file with
an extension `extract-attachment` has no converter for, or a supported file with no sidecar, becomes
a skeleton issue `unread_attachment` (`run_only: true`, new member of the `issue.kind` enum,
`ISSUE_TEXT`/`ISSUE_FA` sentences naming the file by its owner-visible name, no path). `report` lists them under its existing «فایل‌هایی که در این اجرا خوانده نشدند» heading beside unplaced workbooks, and `gate_b` gains the same block — a new line in the Gate B message, so the owner learns at approval time, not only at the end. `.xlsx` is the dumper's and is named by the workbook line, never twice; passthrough text (`.csv`, `.md`, `.txt`, `.gs`) is read directly and is never "unread". A unit never sees an unread file. `extract-attachment` runs before `facts-plan build` (Stage 2 before P), or every supported file would be reported as not yet converted.

### 3.8 The evidence-type fixture

The mini estate (`engine/tests/fixtures/facts_plan/make_dump.py`) gains a department attachment set
with the `.text/` sidecars `extract-attachment` would write: one form as `.docx` text, one as
`.pdf.md`, one as `.image.md`, plus a form that exists only in the transcript, and one unsupported
file (`.xyz`) with no sidecar. Unit-output fixtures write each form as a `new[]` paper record with
the closed `location`; a test drives every one through `validate facts-unit` (must pass), through a
deliberately wrong shape (must fail at the unit gate with a field-path message), and through
`assemble` + `simulate` (must not be refused). The `.xyz` file surfaces as `unread_attachment` in
`skeleton.json`, `gate-b.md` and `report.md`.

### 3.9 Acceptance: the existing run, headless

The run directory `runs/facts/cooking/20260907-052345` is reused (owner's ruling): after the code
lands and the container is rebuilt, the controller runs the playbook headless in the same container
(`claude -p` with the data-repo as cwd, the same credentials volume): `facts-plan status` under the
new gate names the units whose latest output fails; only those are re-dispatched (a fresh
`out.<n>.json` within the cap, or a fresh run directory for the ones already at two); then review,
assemble, Gate B (the controller answers as the owner's proxy only with "approve all"), apply,
report. The owner is handed the report, not a bug list.

## 4. Rulings recorded

- Reuse the existing run directory for acceptance (owner, 2026-09-07).
- Paper `location` = `{kept_at, holder}` (controller, accepted by the owner).
- No new file-type branch anywhere in the units: I1 and I2 are the mechanism, tested by §3.8.
- The store's `source.type` set is unchanged: an entry derived from an attachment cites the member the sidecar's suffix implies — `.txt` (from `.docx`) → `docx`, `.pdf.md` → `pdf`, `.image.md` → `photo` — with the sidecar path as `ref`; `_unit_sources` stops citing every `.md` input as `voice`, and the quote-admission rule admits those three types.
- The shape section is rendered for all five kinds on every unit (v3.3 §2.5 restricts no unit's `new[]` to a kind); it costs about 2 300 tokens of the 20 000 budget and `fits` already counts it.
- `facts-plan build <dept> --run R --refresh-inputs` re-renders every `units/*/input.md` and `review/input.md` from the existing `skeleton.json`/`plan.json` without touching outputs or the plan, so an existing run (the acceptance run) gets the shape section without a rebuild.
- The review document is judged by the same closed gate inside `assemble --review`, over the folded draft, before anything is written — not per `facts-plan status` call.
