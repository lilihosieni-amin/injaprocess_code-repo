# Facts engine: fewer stops, nothing lost silently — design

**Status:** approved by the owner 2026-09-13 (every row tier and every section 9 default); implemented on branch `gate-tiers` — see ADR 0017 and plan `2026-09-13-facts-gate-tiers.md`.
**Scope:** the quantitative-facts engine (`engine/facts_plan`, `engine/merge_facts`), its two JSON
contracts (`schemas/facts-unit.schema.json`, `schemas/facts.schema.json`, `schemas/facts-delta.schema.json`),
and the quantify playbook. The panel is read to ground the rules; it is not changed except where named.

---

## 1. Why

The preparation analysis on the server (12 September, run `20260912-102718`) is the clearest case of a
pattern the owner has now hit roughly twenty times: a run fails on some rule, the owner reports it, one rule
gets fixed, and the next department trips a different one.

What that run did:

- It read 8 meeting recordings, 13 form photos and 1 Excel file (`Amadesazi.xlsx`, 7 tabs).
- **Eight refusals, all shape or style, none a real error.** Four units were refused for a rule shaped like a
  threshold («حد شروع پخت») stating a value; one for an empty `of` and a stray `lang`; one for the word «بچ»;
  the Excel unit for a `group` label on 31 columns, and then again for an engine bug.
- **The Excel file was lost whole.** Its second attempt was refused only by a check that misreads the
  "inferred" marker on six weight columns (7 problem lines, all that one bug, on 4 of its 10 decisions). After
  two refusals the engine drops the unit: none of its 7 tables and 3 formulas landed, and 31 meeting entries
  that point at them were held back.
- **The 13 photos were never read by any unit, and nothing said so.** They were attached to the last piece of
  one meeting; that piece went over size, the planner halved it, and the halves were built from the transcript
  lines alone.
- The report said «۴۱ مورد بررسی‌نشده» and «یک بخش از داده‌ها ناتمام ماند», which does not tell anyone a whole
  file and 13 photos were lost.
- So the tables that did land were described from speech, and their column names do not match the real forms.

## 2. Principles

1. **The confirm tick is the quality gate, not the engine.** Nothing counts until a person confirms it in the
   panel, and anything wrong can be corrected through the bot. The engine's job is to store what is plausible,
   mark what is uncertain, and refuse only what would genuinely break something.
2. **A refusal costs one decision** — never a unit, never a file.
3. **Nothing is lost silently.** Any input or decision that is not stored is named in the owner's report in
   plain words.
4. **One tier per rule, at every gate.** The unit gate, the assembly, the review, `merge facts apply`,
   `merge facts edit` and `validate facts-delta --store` all apply the same rule the same way, so relaxing a
   rule never just moves the failure later.

## 3. The six fixes from the preparation run

| # | Fix | What exactly changes | What it would have saved | Size |
|---|---|---|---|---|
| F1 | **The inferred-number check** | `validate_unit` (`engine/facts_plan/assemble.py`) compares a column's `type` to `None`/`"number"` without unwrapping the `{"value": …, "inferred": true}` marker, so an inferred number reads as "not a number". Unwrap before comparing. Test with the real refused document. | The Excel file: its second attempt had no other problem. | one line + test |
| F2 | **Column header groups** | The store contract already accepts a column `group` shaped `{key, title}` (`facts-delta.schema.json`), and the panel already draws it (`RecordCard.tsx:378`). Only the unit's contract (`decisionField` in `facts-unit.schema.json`) does not list it. Add it there, with the same shape. The AI wrote exactly that shape: `"group": {"key": "file_morgh", "title": "فیلهٔ مرغ"}`. | The Excel's first attempt. | a few lines + test |
| F3 | **Units hold back per decision** | Today `_outputs` uses a unit's document only if it has zero problems. New: fold the document with its failing decisions excluded; each excluded candidate goes to `undecided[]` with reason `refused` and its lines; the retry lists only the refused decisions and its answer is merged over the first by candidate id. A unit is `failed` only if its output is unreadable. Same rule the review got in v3.8. | Even with the bug, 6 of the Excel's 10 decisions. Every future refusal costs one table, not a file. | medium |
| F4 | **Photos get their own unit** | `plan_units` (`engine/facts_plan/build.py`) no longer appends attachments to the last transcript unit; they form `attachment` units packed to the size budget (one photo per unit if necessary). The plan's existing invariant — every candidate in exactly one unit — extends to inputs: every chosen transcript range and every attachment appears in exactly one unit, or `build` stops naming the file. | The 13 form photos: the burger, fillet and conversion forms. | small–medium |
| F5 | **The report names lost sources** | When a unit fails or an input reached no unit, the report says so first, in plain words and the owner's names: «فایل اکسل «آماده‌سازی» ثبت نشد: ۷ جدول و ۳ فرمول آن بررسی نشد.» / «۱۳ عکس فرم بررسی نشد.» No ids, no paths. With F3 and F4 this should be rare; it must never be hidden. | The owner learning about the loss from the report instead of from a user. | small |
| F6 | **Speech-only tables are marked** | A record whose sources contain no sheet, photo, pdf or docx — only meetings, process files or chat — gets its columns' titles, types and units marked `inferred` in `field_status` at assembly, so the panel shows «استنباطی» on them. | «فرم درخواست کالای روزانهٔ آماده‌سازی» presenting columns taken from a process description as if they were the form's. | small |

## 4. The three tiers

Every rule the engine applies to what the AI writes falls into exactly one tier, and holds that tier at every gate.

| Tier | When | What happens |
|---|---|---|
| **REFUSE** | Only if accepting it would literally: **R1** make the store unreadable or unwritable (not JSON, missing `kind`/`key`/`title`/`scope`, an id the engine did not mint, a duplicate id, a wrong `schema_version`); **R2** crash or misrender the panel or an engine command (a container of the wrong JSON type where code iterates it — checked against section 6); **R3** leave a reference to something that does not exist *and cannot be cut*; **R4** break an inviolable rule (INV-1 ids only from `allocate-id`; INV-3 no fabricated provenance; a scope outside the registered departments; a path escaping the data repo). | **Only that decision waits** (F3). It is retried once; the rest of the unit lands. |
| **REPAIR** | The engine can put it into the accepted form deterministically **without changing its meaning**: drop null/empty/stray members; unwrap a marker; map a spelling to its symbol; keep an unforeseen member in a preserved `extra` bag; derive what the engine can compute. | Fixed silently. No retry, no note. |
| **NOTE** | Everything else: plausible content in an unexpected shape, or a style or judgement call. | Stored as written after any safe repair; the affected field is marked `inferred` in `field_status` or the entry gets an `issues[]` entry the panel shows. No retry, not a failure, **not in the owner's Telegram report**. |

Tie-breaks: unsure between NOTE and REFUSE, choose NOTE unless R1–R4 applies literally. Unsure between REPAIR and NOTE, choose NOTE — the engine never silently changes meaning.

### Prerequisites — without these the tiers cannot hold

| # | Prerequisite | Why |
|---|---|---|
| P1 | **The store schema accepts what the tiers store**: an envelope-level `extra` object, the formerly closed enums as open strings, the `null`s REPAIR writes (C10), severed shapes. | `save_store` validates every write against `facts.schema.json` (C37); otherwise every NOTE becomes a refusal at the last step. |
| P2 | **`merge facts edit` checks only the entry it touched**, not the whole kind file. | Today one old off-contract entry blocks every chat edit of its kind (C37). |
| P3 | **`merge facts apply` checks the delta per entry**, not as one document. | Today one bad entry refuses the whole delta (C1). |
| P4 | **Panel fixes**, shipped in the same release: (a) a rule output shows its `value`/`range` (B22 — otherwise stored thresholds are invisible); (b) `label()` stops throwing on an unknown enum value in development builds (C13); (c) three cards that crash today on shapes the contract already allows — `item.pack: null` (ItemCard.tsx:53), `signatures[].row_range: null` (RecordCard.tsx:357), an object in `edge_cases[].input/expected` (RuleCard.tsx:347); (d) a Persian label for the new `shape` issue kind (C11). | NOTE-tier entries must draw correctly, and today's crashes are bugs regardless. |
| P5 | **Every tier row has a test at every gate it runs at** — REFUSE refuses one decision, REPAIR produces the accepted shape, NOTE stores with its mark and triggers no retry. | Principle 4: a relaxed rule must not just move its failure later. |

**Not changed:** the owner's v3.8 ruling on the review stands — a stale review is redone, never skipped (A40 suggested landing the units without it; that is not proposed).

## 5. Every rule, tiered

About 120 rules across the three gates. Under this proposal:

| Section | Rules | REFUSE | REPAIR | NOTE | Points elsewhere |
|---|---|---|---|---|---|
| 5A unit gate | 42 | 15 | 10 | 11 | 6 |
| 5B content pass | 44 | 2 | 7 | 35 | — |
| 5C store gate | 37 | 12 | 12 | 12 | 1 |
| **Total** | **~120** | **29** | **29** | **58** | |

Every REFUSE is per decision. "Seen" marks a rule that has refused real output in past runs.

### 5A. The unit gate — `validate facts-unit` (`engine/facts_plan/assemble.py`)

Covers `validate_unit` and everything it calls: the `facts-unit.schema.json` check, `_swapped_inputs`, `_citations`, `_lint_decision`, `_gate` → `_contract_problems`, the review branch (`_review_verdicts`, `_fold_review`'s schema hold-back), `_lint_entries` at assemble step 8, and the stop in `_outputs`. Today any single line fails the whole document. After two failed attempts the unit is lost and all its candidates go to `undecided[]`. Where a check lives in `content.py` or `preconditions.py`, this section only points to it.

"Unit gate" means `validate_unit`. `unit_states` (cli.py) and `_outputs` both call it. "Assemble" means step 8 (`_lint_entries`, which already holds back per entry). "Apply" means the store gate (`merge facts apply` / `edit` / `validate facts-delta --store`).

| # | Where (file:function) | What it checks, in plain English | Runs at | Seen | Tier | Under the new tier (the exact repair, or where the note goes, or the R-reason it still refuses) |
|---|---|---|---|---|---|---|
| 1 | assemble.py:validate_unit (L70) | A third attempt file (`out.3.json`) is refused. The limit is two attempts per run. | unit gate | earlier (2026-09-07) | REFUSE | Not R1–R4. This is a limit on how many times the run retries, not a check on content. It only matters for retries, and after this change only REFUSE lines cause a retry. See owner attention. |
| 2 | assemble.py:validate_unit (L73) | The file is not readable JSON | unit gate; `unit_states` deletes such a file without spending an attempt | — | REFUSE | R1: there are no decisions to split, so the whole document is refused. The existing free delete stays. |
| 3 | facts-unit.schema.json root | `schema_version` is not 1 | unit gate, review fold | — | REFUSE | R1: wrong `schema_version`. Whole document. |
| 4 | facts-unit.schema.json root + validate_unit (L147–156) | `unit` or `attempt` is missing or has the wrong type, or `unit` does not match its `units/<id>/` directory | unit gate | — | REPAIR | The directory name sets `unit`, which is already what the code trusts (L144). The file name `out.N.json` sets `attempt`. |
| 5 | facts-unit.schema.json root/`decision`/`newEntry` types | `decisions` or `new` is not a list, or one member is not an object | unit gate, review fold, `_collect` | — | REFUSE | R2: `for decision in doc["decisions"]` → `decision.get(...)`, and `_collect` reads `decision["skeleton"]`, so the engine crashes. A container of the wrong type refuses the whole document. A member that is not an object refuses only that member. A missing `decisions` or `new` is repaired to `[]`. |
| 6 | facts-unit.schema.json, all 9 closed objects (root, `scope`, `entryAddr`, `procCite`, `decisionField`, `decisionData`, `splitPart`, `decision`, `newEntry`) | A key the schema does not name | unit gate, review fold (`_fold_review` refuses the whole review for it) | SEEN: `'group' was unexpected` on record fields | REPAIR | If the store schema knows the key at that spot, pass it through and let the store schema judge it. Example: a field's `group` is `{key,title}` in `facts-delta.schema.json` L136, and `_rename_fields` already copies it onto the field. Otherwise keep it in a preserved `extra` bag on the entry. Never refuse and never retry. |
| 7 | same closures: the members the engine owns | The unit writes a member the engine builds itself: top-level `id`, `source`, `scope`, `field_status`, `accounts`, `retired`; or, in `data`, `code`, `instances`, `applies_to`, `location` | unit gate | — | REPAIR | These stay closed. Drop the unit's copy and keep the engine's. Do not merge them and do not put them in `extra`. The reason is INV-1 (ids) and INV-3: `source[]` is built from `instances` and `location`, and `data.update(given)` would let the model overwrite them. `code` is already dropped this way (`_entry` L1103). None of these needs a REFUSE. |
| 8 | facts-unit.schema.json `mintedKey` / `newEntry.kind` / `keep` requires `key`, `title` | The key is missing or does not match the minted-key pattern; a `new[]` kind is not in the enum; a `keep` has no `title` | unit gate, assemble, apply | — | REFUSE | R1: missing or invalid identity. `materialise` calls `KIND_ORDER.index(kind)` and `_entry` reads `written["key"]` / `["title"]`. First try a repair on the key: trim, lowercase, and turn spaces and `-` into `_`. Refuse that one decision only if it still fails. |
| 9 | facts-unit.schema.json `keep` requires `statement` | A `keep` (or a split part) has no `statement` | unit gate | — | NOTE | Store `""` and add an `issues[]` entry saying there is no statement. Today `_entry` indexes `written["statement"]`; a `.get` fixes that. Nothing iterates this value, so R2 does not apply. |
| 10 | facts-unit.schema.json `action` enum + `else` clause | `action` is not keep/drop/merge_into/split, including a `contradiction` inside a unit document | unit gate | — | REFUSE | R2: `_kept_entries` and `_target_of` branch on `action`. Any other value makes the candidate disappear with no message. Refuse that decision only; its candidate waits in `undecided[]`. |
| 11 | facts-unit.schema.json `drop`/`merge_into`/`split` require `reason_code` (enum) | `reason_code` is missing or not one of the seven codes | unit gate | — | REPAIR | Set it to `other` and keep the unit's wording in `reason`. `_kept_entries` reads `decision["reason_code"]` and `REASON_FA` has a line for `other`. |
| 12 | facts-unit.schema.json `merge_into`/`split` require `into` of the right shape | `into` is missing, or has the wrong shape (a split with an id, a merge with a list) | unit gate | — | REFUSE | R2/R3: `_target_of` follows `into`, and `_kept_entries` loops over the split parts. There is nothing to act on. Refuse that decision only. |
| 13 | facts-unit.schema.json `into` `minItems: 2`, `splitPart.takes` `minItems: 1` | A split with one part, or a part with no `takes` | unit gate | — | NOTE | A split with one part is stored as a `keep` of that part. A part with no `takes` keeps all bindings (what `_entry` already does when `takes` is None). Add an `issues[]` entry in both cases. |
| 14 | facts-unit.schema.json `decision.oneOf` (`skeleton` \| `entry`) | The decision has both `skeleton` and `entry` | unit gate, review gate | — | REPAIR | Keep `skeleton` and drop `entry`. `_review_verdicts` and `_state_for` already look at `skeleton` first. |
| 15 | validate_unit (L163–165) + `oneOf` with neither address | The skeleton is not a candidate of this run, or the decision has no address at all | unit gate | — | REFUSE | R3: the address is the whole decision, so there is nothing to cut off and keep. Refuse that decision only. |
| 16 | validate_unit (L166–167) | The same candidate is decided twice | unit gate (`_collect` keeps the last one silently at assemble) | — | NOTE | If the two copies are identical, remove the duplicate. If they differ, keep the first and put the second in `issues[]`. |
| 17 | validate_unit (L216–219) | A candidate of this unit has no decision | unit gate | — | NOTE | The candidate goes to `undecided[]` with reason "not decided". The rest of the unit lands and there is no retry. |
| 18 | validate_unit (L102–110, L149–153) | The document is in the wrong place: a review document inside `units/`, a document outside `units/`, or a directory that names no unit in the plan | unit gate | — | REFUSE | R3: no plan entry says what the document decides, so its addresses point at nothing. Whole document. |
| 19 | validate_unit (L169–173), link that can be cut | An `S-` ref names no candidate of the run (`derived`, `via`, an extra `about[]` member, `of`/`writes_to` on an output) | unit gate; assemble `_resolve_refs` holds the whole entry back as `waits` | — | NOTE | Set the link to null and add an issue that names the missing target. This is what `_sever_derived` already does for `derived`. |
| 20 | validate_unit (L169–173), required link | Same check, but the store schema requires the link (`appliesTo.record`, a note's only `about[]` member) | unit gate, assemble | — | REFUSE | R3: the link does not exist and cannot be cut. Refuse that decision only. |
| 21 | validate_unit (L174–178) | A field ref starts with `c_` but is not `c_<column letters>` | unit gate | — | REPAIR | Trim and lowercase it (for example `C_H ` → `c_h`). If it still does not resolve, the content pass decides whether the column exists (section B). |
| 22 | validate_unit (L183–187) | `merge_into` across kinds (a rule into a record) | unit gate | — | REFUSE | R1: `_absorb` copies rule-only `applies_to` and `instances` onto a record, and `facts-delta.schema.json` refuses that record, so apply cannot write it. Refuse that decision only. Option in owner attention. |
| 23 | assemble.py:_citations (L346, called L188 and L212) + `procCite` schema | A `processes[]` citation names a node that is not in the department's process index, has a bad `process` pattern, or is missing `process`/`node` | unit gate | — | NOTE | Remove that citation and add an `issues[]` entry. `source[]` then falls back to `_unit_sources` (the transcript, or chat). INV-3 still holds because the bad citation is never stored. `_citations` must use `.get` (it indexes `c["process"]`). |
| 24 | validate_unit (L194–200) + `decisionField.from` | `data.fields[i].from` names no column of the candidate, or is missing or not a string | unit gate | — | NOTE | Today `_rename_fields` drops the field's attributes without a word. Instead, store the written attributes in `issues[]` ("column x not found"). A non-string `from` crashes `by_from`, so remove that member before `_rename_fields`. |
| 25 | facts-unit.schema.json `decisionData`/`splitPart.data` types; `newEntry.data` `type: object` | `data` is not an object, `fields` is not a list, or a field is not an object | unit gate, assemble, apply | — | REFUSE | R2: `_entry` calls `given.pop("fields")` and `_rename_fields` calls `f.get`/`f["from"]`. The panel's `RecordCard.tsx:84,97` calls `(d.fields ?? []).map`. Refuse that decision only. A missing `new[].data` is repaired to `{}`. |
| 26 | assemble.py:_swapped_inputs | A rule input's key is another column of the record it is bound to (the inputs are swapped) | unit gate only | — | NOTE | Store as written. Add an issue on `data.inputs[n]` that names the column the input actually reads, and mark `field_status` `inferred`. Option in owner attention. |
| 27 | validate_unit (L202–205) | A field carries a `unit` but its `type` is not number | unit gate only (no copy in content.py) | SEEN: `field x is {'value': 'number', 'inferred': True} and carries a unit` | NOTE | **Fix the bug first:** unwrap the `{value, inferred}` marker on both `type` and `unit` before comparing, e.g. `v["value"] if isinstance(v, dict) and set(v) == {"value", "inferred"} else v`, the same test `_unwrap` uses. A field that really is non-number and has a unit keeps its unit and gets an issue on that field. |
| 28 | assemble.py:_lint_decision (L404) | Prose lint on title, statement, aliases and issues | unit gate, assemble step 8, review gate | SEEN: `'بچ'`, A1 refs, Latin titles | delegates | Calls into the content pass `content._check_prose` (section B). |
| 29 | assemble.py:_contract_problems → `facts-delta.schema.json` (L265) | A null where the schema expects an object or ref | unit gate, assemble, apply | SEEN: `data.outputs[0].of: None is not of type 'object'` | REPAIR | Drop the null member (`null_paths` already finds them). The full list of store-schema rules belongs with the store-schema tiering; it is listed here because the unit gate runs it. |
| 30 | same, enum/pattern miss | A value outside a store vocabulary | unit gate, assemble, apply | SEEN: `role: ledger`; earlier `rule inputs required` | NOTE | Keep the raw value in `extra` with an issue, and leave the member unset. A required enum falls back to its catch-all (`other`). The same change is needed in the store schema, or the refusal just moves to apply. |
| 31 | same, unknown key on the 44 store closures | A key the store schema does not name | unit gate, assemble, apply | — | REPAIR | Same policy as row 6 (`extra` bag). The same members as row 7 stay closed. |
| 32 | same, wrong container type / missing identity | e.g. `fields`/`rows`/`inputs` not a list; missing `kind`/`key`/`title`/`scope` | unit gate, assemble, apply | — | REFUSE | R1/R2, as in rows 8 and 25. Refuse that decision only. |
| 33 | _contract_problems → `process_source_problems` (L285) | A process citation's file is tombstoned or gone | unit gate, assemble, apply | — | delegates | Calls into the preconditions pass (the preconditions section). |
| 34 | _contract_problems (L286–289) | A `scope.branches` code is not in the sheets manifest | unit gate, assemble; apply through `unregistered_scope_problems` (QF-33) | — | NOTE | Store with an issue. The panel only filters on this value (`factsFilter.ts:84`) and does not crash, and R4 names departments, not branches. Apply's QF-33 must change the same way. Option in owner attention. |
| 35 | _contract_problems (L290–293) | A unit symbol is declared by no row of the units record | unit gate, assemble, apply (`preconditions.py:100`) | SEEN: `unit 'lb'` | REPAIR | If the spelling matches a declared row's key or `unit_raw`, replace it with that symbol. Otherwise store it as written: keep `unit_raw` and add an issue (NOTE). |
| 36 | _contract_problems (L299–305) | A record row still has no `key` after `_derive_row_keys` | unit gate, assemble, apply | SEEN: reference rows kept provisional keys | REPAIR | Give the row a deterministic key (`row_<n>`, the same on every run). Row keys are minted segments, not ids, so INV-1 is untouched. Option in owner attention. |
| 37 | _contract_problems → `check_document` (L317) | The whole content pass | unit gate, assemble, apply | SEEN: output of a rule with inputs carries value/range; constant carries expr/lang; `primaryKey` member; `field_status` path | delegates | Calls into the content pass (section B). The `T-0` expr-identifier skip here is already lenient. |
| 38 | assemble.py:_lint_entries (step 8) + validate_unit review branch (L130–142) | Rows 28–37 run again over the assembled entries | assemble, review gate | — | delegates | Already works per entry: `_hold_back` holds only the failing entries, and `review:` lines hold back only the review decision that caused them. It exits only when every entry fails. Takes the tiers of rows 28–37. |
| 39 | assemble.py:_review_verdicts | The review's address hits zero or several entries, a contradiction has no drift flag, an unknown skeleton, or a `fields[]` rewrite | review gate, `_fold_review` | — | unchanged | Already held back per decision since v3.8 (R1 fold). Not re-tiered. At the review gate these lines still cost the reviewer an attempt; they should only hold back the decision. |
| 40 | assemble.py:_review_verdicts / `_fold_review` (L822–825) | The digest changed since the review was written | review gate, assemble (`SystemExit 2`) | — | REFUSE | R3: the reviewer addressed a different assembly. **Unchanged — the owner's v3.8 ruling stands: a stale review is redone, never skipped.** |
| 41 | assemble.py:_fold_review (L802–820) | The review document fails `facts-unit.schema.json`, so every decision is held back | assemble | — | inherits | A schema failure refuses the whole review today. Apply rows 3–25 to each decision instead, so only the failing decisions are held back. |
| 42 | assemble.py:_outputs (L567–583) + cli.py:unit_states | The unit-output stop: any line on the latest attempt means the unit is not folded. With fewer than 2 attempts, `assemble` exits 2; with 2 attempts, the whole unit is dropped and all its candidates go to `undecided[]` | assemble, `unit_states` (`done` needs zero lines) | SEEN: every preparation-run refusal went through here | REFUSE (per decision) | Only REFUSE lines count. A document with no REFUSE lines is `done`. A document with some REFUSE lines lands its other decisions; only the refused decisions wait and are retried. A unit with only REPAIR or NOTE lines never counts as failed. |

> Rows A29–A32 restate store-schema rules that the unit gate also runs; **5C tiers them in full and governs where the two differ.** Row A36 (a record row with no key) conflicts with C9; section 9 settles it.

### 5B. The content pass — `check_document` and `lint_prose` (`engine/merge_facts/content.py`)

This pass runs at every gate, so each tier below holds at all of them. **Runs at** key:
**U** = unit gate (`facts_plan/assemble.py::_contract_problems`; the prose rules also run earlier, per decision, at `assemble.py:424`),
**A** = `merge facts apply` (`preconditions.py:353`), **E** = `merge facts edit` (`verbs.py::_gate`, reads it as `facts`),
**V** = `validate facts` / `validate facts-delta` (with or without `--store`), **Au** = `merge facts audit` (`audit.py::_lint_failures`, title + statement only, counted toward readiness).
Several rules also appear in the store schema (`schemas/facts.schema.json`). Where they do, the cell says so. The schema's tier is another section's call, but it has to match this one.

| # | Where (file:function) | What it checks, in plain English | Runs at | Seen | Tier | Under the new tier |
|---|---|---|---|---|---|---|
| 1 | content.py:_check_expr | A `lang: feel` expression uses a name that is not an input, an output, a resolvable call, or (inside `sum over … of (…)`) a column of the aggregated table | U A E V | — | NOTE | Store as written. Add `field_status["data/expr"] = inferred`. Nothing evaluates `expr` (no FEEL evaluator in engine/ or ui/); the panel shows it as text (RuleCard.tsx:136). |
| 2 | content.py:_check_expr | The input in `sum over <input> of` does not read `{ref, field}` without `row` | U A E V | — | NOTE | Store as written. Add `field_status["data/expr"] = inferred`. |
| 3 | content.py:_check_unit_edges | An input's unit differs from the unit of the same-file record field or rule output it reads, and no `via` conversion is named | U A E V | — | NOTE | Store as written. Add `field_status["data/inputs/<key>/unit"] = inferred`. |
| 4 | content.py:_check_keys / _check_key_list | A field, header-field, section, input or output `key` is not a minted segment (`^[a-z][a-z0-9]*(_[a-z0-9]+)*$`) | U A E V | — | REFUSE (after safe repair) | Repair first: lower-case, trim, turn spaces and `-` into `_`, collapse repeated `_`. Rewrite the same entry's rows members, `primaryKey`, `foreignKeys.fields`, table columns, `field_status` paths and exact `expr` tokens to match, but only if the result is unique in its list. Whatever is still invalid is refused per decision under **R1**: `save_store` validates every write against `mintedSegment` (`merge_facts/__init__.py:317-319`, `facts.schema.json:15`), so the whole store write fails. Also **R2**: the key is the path segment `edit`/`resolve`/`field_status` address by (`_member_index`, paths split on `/`). |
| 5 | content.py:_check_keys | An output's `per` basis is not a minted segment | U A E V | — | NOTE | Store as written, no mark. The schema has no pattern on `per` (`facts.schema.json:191`), and the panel prints it raw (RuleCard.tsx:106). |
| 6 | content.py:_check_keys | A row `key` is not a minted key (segments joined by `__`) | U A E V | — | REFUSE (after safe repair) | Same safe repair as #4, and also rewrite `reconciled_against.cell.row` in the same entry. Whatever is still invalid is refused per decision under **R1**: `save_store` validates `mintedKey` (`facts.schema.json:13`). Also **R2**: the row key is split on `__` by audit (`audit.py:161`, `:533`) and ui-backend (`facts_store.py:507`), and it is the path segment `edit` addresses. |
| 7 | content.py:_check_keys | A `refItems` cell is neither an item key nor an item code in the estate's namespace | U A E V | SEEN ("a column of names typed refItems") | NOTE | Store the cell as written. Add `field_status["data/fields/<key>/refItems"] = inferred`. `row_titles` already falls back to the row key when a cell resolves to nothing (`facts_store.py:465-467`). |
| 8 | content.py:_check_process_grammar | A `processes[].ref` does not match `<dept>-NNN` | U A E V | — | NOTE | Remove the link. Attach an `issues[]` entry quoting the dropped ref. No process can have that id, so the link can simply be removed, which makes this NOTE, not R3. The schema's `procRef` pattern must allow the same removal. |
| 9 | content.py:_check_record_shape | A declared field or header field uses a reserved row-member name (`key`, `title`, `unit`, `section`, `retired`, …) | U A E V | — | NOTE | Store as written. Add `field_status["data/fields/<key>"] = inferred`. Row members with those names are already read with their reserved meaning whether or not the field is declared; this check only refuses the declaration. |
| 10 | content.py:_check_record_shape | A `primaryKey` member is not a declared field | U A E V | SEEN | NOTE | Store as written. Add `field_status["data/primaryKey"] = inferred`. `_derive_row_keys` already skips derivation in this case (`apply.py:277`). A row left with no key at all is caught by the row-key rule (assemble / schema), not here. |
| 11 | content.py:_check_record_shape | A `foreignKeys` member is not an object, or names no join columns (`fields`), or names no target entry (`reference`); in practice it was an import descriptor | U A E V | — | REPAIR | Drop null or empty members. Move any other malformed member unchanged into the record's preserved `extra.foreignKeys`. The panel already hides such members (RecordCard.tsx:564), and `mirror_of`/`import` already hold the import. |
| 12 | content.py:_check_record_shape | A `foreignKeys` join column is not a declared field | U A E V | — | NOTE | Store as written. Add `field_status["data/foreignKeys"] = inferred`. |
| 13 | content.py:_check_record_shape | A row's `section` is not among `sections[]` | U A E V | — | NOTE | Store as written. Add `field_status["data/rows/<row>/section"] = inferred`. |
| 14 | content.py:_check_record_shape | A row carries a member that is not a declared field | U A E V | — | NOTE | Store as written. Attach an `issues[]` entry naming the member (the panel draws declared columns only, so it would otherwise go unseen). |
| 15 | content.py:_check_record_shape | A typed (non-sheet) reference record's open row is missing a declared, non-derived field | U A E V | — | NOTE | Store as written, no mark. A missing cell is a blank, which is how sheet-derived rows are already treated. |
| 16 | content.py:_check_shares | An output `share` is not in (0, 1] | U A E V | — | NOTE | Store as written. Add `field_status["data/outputs/<key>/share"] = inferred`. A value like 40 could be a percent or a mistake, so there is no silent ÷100. |
| 17 | content.py:_check_shares | Several shares do not add up to 1 ± 0.001 | U A E V | — | NOTE | Store as written. Add `field_status["data/outputs"] = inferred`. |
| 18 | content.py:_check_constant_shape | A rule with no inputs still carries `expr`, or `lang: feel`/`table` | U A E V | SEEN | NOTE (after safe repair) | Repair: a `lang` with no `expr` and no `table` is set to `text`, the store's own policy shape. An `expr` is kept; the panel draws the constant card and the formula card side by side without failing (RuleCard.tsx:62-66). Add `field_status["data/expr"] = inferred`. |
| 19 | content.py:_check_constant_shape | A rule with no inputs has an output with neither `value` nor `range` | U A E V | — | NOTE | Store as written, no mark. The panel draws «—» (RuleCard.tsx:50). |
| 20 | content.py:_check_constant_shape | A rule with inputs carries no `lang` | U A E V | — | NOTE (after safe repair) | Repair: if a `table` object is present, set `lang: table`. Otherwise store with no `lang`; the panel only uses `lang` to pick the note under the original text (RuleCard.tsx:590). |
| 21 | content.py:_check_constant_shape | A rule with inputs carries no body: no `expr`, no original/`original_ref`, no table | U A E V | — | NOTE | Store as written, no mark. Audit already counts rules without an expression toward readiness (`audit.py:717`). |
| 22 | content.py:_check_constant_shape | An output of a rule **with inputs** carries `value` or `range` | U A E V | SEEN (4 units, preparation) | NOTE | **Delete the rule and store as written, with no mark.** A threshold («حد شروع پخت») or a target band on a computed output is legitimate. *Store:* the schema already allows `value`/`range` on any output (`facts.schema.json:194-197`), and nothing in engine or ui-backend fails on it. Audit's reconciliation reads `outputs[].value` (`audit.py:595-602`), so a stored threshold even becomes checkable. *Panel:* today the number is **invisible**. The big-value card is drawn only when `inputs` is empty (RuleCard.tsx:59-63), and `OutputRow` (RuleCard.tsx:525-569) shows title, unit, share, nature, of and writes_to, but never `value`/`range`. Ship this change together with one addition to `OutputRow` that renders the existing `valueText(output)` when `value` or `range` is present. |
| 23 | content.py:_check_table_shape | `lang: table` but no `table` object | U A E V | — | NOTE | Store as written. Add `field_status["data/lang"] = inferred`. The panel skips the decision table when `table` is undefined (RuleCard.tsx:66). |
| 24 | content.py:_check_table_shape | A table rule also carries `expr` | U A E V | — | NOTE | Store as written, no mark. The panel draws both cards. |
| 25 | content.py:_check_table_shape | A `table` is present but `lang` is not `table` | U A E V | — | NOTE (after safe repair) | Repair: an absent or null `lang` becomes `table`. If `lang` names another body, store as written and add `field_status["data/table"] = inferred`. |
| 26 | content.py:_check_table_shape | A `table.inputs`/`table.outputs` column is not one of the rule's declared inputs/outputs | U A E V | — | NOTE | Store as written. Add `field_status["data/table"] = inferred`. The column header falls back to the key (RuleCard.tsx:207-210). |
| 27 | content.py:_check_table_shape | A decision-table row is not an object | U A E V | — | REPAIR | Drop null or empty rows; `row[k]` on `null` would fail in `DecisionTable` (RuleCard.tsx:215). Move any other scalar row into `extra.table_rows` unchanged. |
| 28 | content.py:_check_table_shape | A table row is nested `{when, then}` instead of flat | U A E V | — | REPAIR | Flatten `{...when, ...then}` into one row when both are objects and their keys do not clash. Same meaning, the documented flat shape. If they do clash, store as written and add `field_status["data/table"] = inferred`. |
| 29 | content.py:_check_table_shape | A table row has a key that is not a table column | U A E V | — | NOTE | Store as written, no mark. The panel draws only the declared columns. |
| 30 | content.py:_check_table_shape | A table row fills no output column | U A E V | — | NOTE | Store as written, no mark. The panel draws «پیش‌فرض» (RuleCard.tsx:167-170), which is exactly how a fall-through row reads. |
| 31 | content.py:_check_table_shape | A `table.default` key is not a table output | U A E V | — | NOTE | Store as written. Add `field_status["data/table/default"] = inferred`. |
| 32 | content.py:_check_field_status | A `field_status` value is not `inferred`/`informal` | U A E V | — | REPAIR | Unwrap or normalise the marker. `true` or any other non-empty marker becomes `inferred`, the cautious reading. `false`, `null`, `confirmed` and `stated` drop the member. The schema enum (`facts.schema.json:353`) must accept the repaired form. |
| 33 | content.py:_check_field_status | A `field_status` path names nothing in the entry | U A E V | SEEN | REPAIR | Drop that member; a status on nothing means nothing. The `edit` verb already prunes exactly this way (`verbs.py:478-483`). |
| 34 | content.py:_check_reconciled_against | A `reconciled_against` cell names a field or row this record does not declare | U A E V | — | NOTE | Store as written. Add `field_status["data/reconciled_against"] = inferred`. Audit already skips a row that does not resolve (`audit.py:618`); the panel prints the machine cell. |
| 35 | content.py:_check_issue_dates | An issue's `from_date`/`to_date` is not `YYYY-MM[-DD]` | U A E V | — | REPAIR | Normalise Persian/Arabic digits to Latin, `/` to `-`, and zero-pad. If the date still does not match, remove it and append the raw text to the issue's `description`, so nothing is lost. |
| 36 | content.py:_check_source_exclusions | A `source[].ref` cites a generated `.structure.md` or `NAMED_FUNCTIONS.md` | U A E V | — | NOTE (after safe repair) | Repair: `<book>.structure.md` becomes the sibling `<book>.xlsx` (same folder, same stem, e.g. `attachments/sheets/Salon__Salon - Naharkhoran/`), with `type: sheet` and any `sheet`/`cell` kept. For `NAMED_FUNCTIONS.md`, keep the citation and add `field_status["source/<n>"] = inferred`. The file exists, so this is not fabricated provenance (not R4). |
| 37 | content.py:_check_process_links | A `processes[]` link has no `type: process` source naming that process file | U A E V | — | REPAIR | When `departments/<dept>/processes/<id>.json` exists (the path `audit._process_doc` uses), append `{type: process, ref: <that path>}`. It restates the link and cites a real file. If the file is missing, remove the link and attach an `issues[]` entry (NOTE). |
| 38 | content.py:lint_prose (REF_TOKEN_RE) | Prose names a spreadsheet cell or range (`H6`, `$J$15`, `'تب'!M6:M15`) | U A E V Au | SEEN | NOTE | Store as written. Record no mark on the entry; `merge facts audit` lists it as a style finding that does not block readiness (see owner note). |
| 39 | content.py:lint_prose (artefact_re) | Prose names a file, table or formula artefact (`.xlsx`, `.gs`, the estate's table prefix, `IMPORT_FROM_SHEET`, `LET(`, `LAMBDA`) | U A E V Au | — | NOTE | Same as #38. |
| 40 | content.py:lint_prose (PIPELINE_RE) | Prose uses a pipeline word: «پاس», «اسکلت», «بخش از داده‌ها», «واحد کاری», «بچ», original, bindings, FEEL, account, expr | U A E V Au | SEEN («بچ») | NOTE | Same as #38. **Remove «بچ» from `PIPELINE_WORDS` (content.py:693) and from the style card (`facts_plan/cards/style.md:18`)**, with no replacement. In this restaurant «بچ» is a batch of sauce, and the pipeline sense it was meant to catch is already caught by «واحد کاری» and «بخش از داده‌ها». The Latin entries are already caught by #43. |
| 41 | content.py:lint_prose (COLLOQUIAL_RE) | Prose uses spoken endings («می‌زنن», «می‌کنن», «داشته باشن», «بگیم», «می‌گیم») | U A E V Au | — | NOTE | Same as #38. |
| 42 | content.py:lint_prose (SHEET_WORDS_RE) | «ستون», «تب» or «سلول» appears anywhere except a record's own statement or a field description | U A E V Au | — | NOTE | Same as #38. |
| 43 | content.py:lint_prose (LATIN_WORD_RE) | Prose carries a Latin word of 4+ letters other than csv/excel/sheet or a declared unit symbol | U A E V Au | SEEN (Latin labels as titles) | NOTE | Same as #38. A Latin `title` is still a title, so R1 does not apply. |
| 44 | content.py:lint_prose (QUOTED_SPAN_RE) | A «…» quotation is longer than 8 words | U A E V Au | — | NOTE | Same as #38. |

### 5C. The store gate — `merge facts apply`, `edit`, `validate --store`, `save_store`, and both store schemas

Covers the **store gate**: `merge facts apply` (delta schema at apply.py:84, then `preconditions`), `validate facts-delta --store` (`simulate`, same pass), `merge facts edit` (`verbs._gate`), the write-time schema check (`save_store`), and the policy for the closures, enums, requireds and patterns of `facts.schema.json` / `facts-delta.schema.json`. **Runs at:** U = unit gate (`facts_plan.assemble._contract_problems` repeats part of this pass), A = apply, V = validate `--store`, E = edit, W = `save_store`. Paths are relative to `code-repo/`. The panel's ground truth for R2 is in the appendix at the end.

| # | Where (file:function) | What it checks, in plain English | Runs at | Seen | Tier | Under the new tier (the exact repair, or where the note goes, or the R-reason it still refuses) |
|---|---|---|---|---|---|---|
| C1 | apply.py:78-84 `apply` (run dir used, root of delta schema); verbs.py:434-445 `edit` (meta.json, patch schema, entry found) | The delta is a JSON object with `schema_version: 2` and an `entries` list. The run dir has not applied a delta before. An edit has a meta.json, a valid patch and an entry that exists. | A, V, E (root schema also U) | — | REFUSE | R1: the file or the run plumbing is broken, not one decision. Two changes: an unknown **top-level** key is dropped (repair). Apply must also check the schema **per entry**. Today apply.py:84 checks the whole delta, so one bad entry refuses all of it. U already reports per decision (`_renamed`). |
| C2 | both schemas `entry`/`envelope`: `type: object`, `required` kind/key/title/scope, `kind` enum; preconditions.py:168 `_title_twin`; `__init__.py:305` `build_index` | Every entry is an object with `kind` (one of the five), `key`, a string `title` and a `scope` object. | U, A, V, E, W | — | REFUSE | R1 + R2. `store[entry["kind"]]` raises KeyError (preconditions.py:168). The index reads `e["key"]`/`e["title"]` directly (__init__.py:305). `is_fact` drops an unknown kind, so the entry disappears from the list and its page returns 404 (visibility.py:296-311, routers/facts.py:185, :517). `entry.scope.departments` is read with no guard (FactDetail.tsx:216). A missing title crashes the list search: `r.title.includes` (factsFilter.ts:68). Only that decision waits. |
| C3 | delta `envelope.id` pattern `^T-[0-9]+$`; preconditions.py:300 `by_temp` | A delta entry's `id`, when present, is a temp id. | U, A, V | — | REFUSE | R1/R4 (INV-1): an `F-` id the engine did not mint would be treated as an existing entry. Any other non-temp string: dropped if no `{ref}` in the delta names it (repair). If a ref does name it, the decision is refused (R3). |
| C4 | delta schema has no slot for `status`, `updated_at`, `source[].hash`, `source[].run`, `accounts[].id`, and forbids `data.original_ref` (delta `entry.allOf[2]`) | The AI wrote members the engine owns. | U, A, V | — | REPAIR | Drop them. The engine writes its own: `_stamp`, `derive_status`, `with_account_id` (ladder.py:58-66), and QF-31 writes `original_ref`. The backend reads `original_ref` only inside `facts/originals/` (routers/facts.py:617-626), so dropping it loses only a pointer the engine recreates. |
| C5 | every `additionalProperties: false` object in both schemas (the 44 closures), except the `{ref}` shapes in C6 | An unknown member in a closed object (e.g. `group`, `note`, `unit_title`). | U, A, V, E, W | SEEN (`group` on record fields, at the unit schema) | REPAIR | Move the member into a new envelope-level `extra` object, keyed by its QF-7 path (`extra["data/fields/qty/note"]`), and store the rest. `extra` sits **outside `data`**, so `_red` never counts its nulls as red (facts_store.py:278, engine `null_paths`). No card reads it, and `fact_fingerprint` still covers it. Both schemas gain `extra: {type: object}`. A record-row cell whose name is not a segment goes to `extra` the same way; `row.patternProperties` already accepts segment-named cells. |
| C6 | `ref`, `procRef`, `localCell` closures; `iter_ref_objects` (__init__.py:341-343, facts_store.py:229-231) | A `{ref}` object with a member other than `ref`/`field`/`row`. | U, A, V, E, W | — | REPAIR | Cut it down to `{ref, field, row}` and move the extra member to `extra`. It must never be stored as written: the shape test `set(obj) <= {ref, field, row}` would stop seeing it as a ref. `_rewrite_refs` would then leave a `T-` id in the store (INV-1), and `resolved_map` would not name it. |
| C7 | container types in both schemas: `data`, `location`, `table`, `table.default`, `movement`, `constraints`, `refItems`, `pack`, `range`; lists `fields`, `header_fields`, `rows`, `sections`, `signatures`, `instances`, `imports`, `inputs`, `outputs`, `applies_to`, `calls`, `edge_cases`, `units`, `tracked`, `primaryKey`, `reconciled_against`, `about`, `aliases`, `source`, `accounts`, `issues`, `affects`, `processes`, `scope.departments/branches`, `constraints.enum` | A container of the wrong JSON type, in a form the engine can fix mechanically. | U, A, V, E, W | — | REPAIR | Wrap a single object in `[…]` where a list of objects is expected. Wrap a single string in `[…]` where a list of strings is expected. Drop a `null` list, since absent is allowed. Nothing else changes. |
| C8 | same members as C7 | What C7 cannot wrap: a container of the wrong type, or a list member that is not an object. | U, A, V, E, W | — | REFUSE | R2, and store-wide. If `data` is a string, `_labels` calls `(entry.get("data") or {}).get("code")` over the **whole store**, so *every* detail page returns 500 (facts_store.py:331). If `location` is a string, `coverage` breaks `GET /api/facts` for everyone (facts_store.py:743), and so does engine `_sheet_identities` (__init__.py:70). A string where a list belongs makes `.map`/`.join` throw: RuleCard.tsx:312, RecordCard.tsx:142, :636, FactDetail.tsx:158, :216, FactsList.tsx:372. A `null` or string member crashes the ladder at `m.get("key")` (ladder.py:55, :142), `Object.keys(null)` (RecordCard.tsx:85) and `i.key` (RuleCard.tsx:313). `table: null` crashes RuleCard.tsx:182, `table.default: null` RuleCard.tsx:227, `movement: null` RecordCard.tsx:701. Only that decision waits. |
| C9 | `required: key` on `field`, store `row`, `ruleInput`, `ruleOutput`, `instance`, `appliesTo`, `appliesTo.rows[]`, `sections[]`, `import`; `instance.spreadsheetId/sheet` | A keyed-list member with no `key`, or an instance with no tab. | U, A, V, E, W (`rows[].key` at U after `_derive_row_keys`, assemble.py:301-307) | SEEN (reference rows keeping provisional keys) | REFUSE | R2: the ladder matches members by `key` (ladder.py:142). On the next merge, `None == None` folds every keyless member into the first one, silently corrupting data. The grid reads each cell by `f.key` (RecordCard.tsx:153). Red paths only reach keyed members (facts_store.py:271). For instances it is R1: `_sheet_identities` is a record's second identity (preconditions.py:292, :328). Before refusing, repair what the engine can derive: a reference row's key from `primaryKey` (`_derive_row_keys`, apply.py:267-284). |
| C10 | requireds that are not identity: `source`, `retired`, `issue.affects`, `account.status`, `item.category/unit`, `record.medium/role/location`, paper `kept_at/holder`, external `system/kept_at`, `measurement.quantity/unit`, `note.question`, `rule.inputs/outputs` (rule with no `expr` and no `table`) | A required member is missing, and the engine can compute a value. | U, A, V, E, W | SEEN ("rule inputs required") | REPAIR | `source` → `[]`, `retired` → `false`, `affects` → `[]` (IssuesCard.tsx:66 reads `x.affects.length` with no guard), `account.status` → `open`. `location` is derived from `instances[0]` (`_recompute_location`, apply.py:152-164), else `{}`. A missing scalar (`category`, `unit`, `quantity`, `medium`, `role`, `kept_at`, `holder`, `system`, `question`) → `null`, which is QF-6's «unknown» and shows red. `inputs`/`outputs` → `[]`. The store schema must accept `null` on those enums. |
| C11 | requireds whose absence leaves one member meaningless: `rule.inputs` on a rule with `expr`/`table`; envelope `statement`; `ref.ref`; `import.source`; `reconciled_against[].cell/against`; `tracked[].record`; `units[].pack_unit`; `signatures[].role`; `issue.kind/description`; `fix.op`; `fix.factor` for multiply/divide; `account.field` | A member is incomplete, and filling it would mean guessing. | U, A, V, E, W | — | NOTE | Sever it: move the incomplete list member (or the `fix`) into `extra` and attach an `issues[]` entry. This needs a new issue kind, e.g. `shape`, plus its Persian label in `ISSUE_KIND_LABELS`. A rule with `expr` but no `inputs` is stored with `inputs: []` and `field_status["data/inputs"] = inferred`, because FactDetail.tsx:203 would otherwise call it «مقدار ثابت». A missing `statement` becomes `""` plus an issue. Moving the member out is **required** for `import.source` (RecordCard.tsx:806 reads `.spreadsheetId` of `undefined`) and `reconciled_against[].cell` (RecordCard.tsx:731). |
| C12 | delta `account.required` statement/source; ladder.py:110 `with_account_id` | An account with no `statement` or no `source`. | U, A, V, E | — | REFUSE | R4 (INV-3: an account with no source) and R2: `account_id(path, member["statement"], value, member["source"])` raises KeyError (ladder.py:110). Only that decision waits. |
| C13 | closed enums: `record.role` (log/reference/report/config), `record.medium`, `item.category`, `item.state`, `measurement.quantity`, `rule.lang`, `table.hit`, `table.aggregate`, `record.cadence`, `divergence`, `ruleOutput.nature`, `ruleInput.from` literals (operator/calendar), `field.type`, `refItems.resolved_by`, `source.type`, `issue.kind`, `fix.op`, `field_status` values | A value outside the list. | U, A, V, E, W | SEEN (`role: ledger`) | NOTE | First apply a fixed synonym map (a repair): `int`→`integer`, `float`/`decimal`→`number`, `text`→`string`, `bool`→`boolean`, `spreadsheet`/`sheets`→`sheet`, `audio`→`voice`, `image`→`photo`. Anything left is stored as written with `field_status[path] = inferred` and a note, and the enums become open strings in both schemas. The engine falls back safely: an unknown `role` gets no derived row keys (apply.py:271 derives only for `reference`), so its rows need keys of their own (C9). **Prerequisite:** `label()` returns the raw word in production but *throws in DEV* (factsLabels.ts:834-842), so it must stop throwing on stored values. |
| C14 | `account.status` enum | An account status other than open/chosen/rejected. | U, A, V, E | — | NOTE | Store it as `open`, keep the original in `extra`, and add a note. Stored as written, the dispute would disappear: it is not red (facts_store.py:305) and the accounts card does not show it (AccountsCard.tsx:34). |
| C15 | `mintedKey`/`mintedSegment` patterns on the entry `key` and every member key; preconditions.py:312-313 `KEY_RE` | A key outside QF-32's grammar, in a form the engine can normalise. | U (schema), A, V, E, W | SEEN (provisional / Latin-label keys, related) | REPAIR | Trim, lower-case, turn spaces and `-` into `_`, collapse repeated `_`. |
| C16 | same | A key that still breaks the grammar after C15. | U, A, V, E, W | — | REFUSE | Entry key: R1, because keys are identity and immutable (`find_match`, `_natural_key` preconditions.py:175-182). Member key containing `/` or `__`: R2, because QF-7 paths split on `/` (facts_store.py:578, RecordCard.tsx:183 builds `data/rows/${key}/${f.key}`) and `__` is the binding-key separator (audit.py:161, facts_store.py:507). Any other off-grammar member key (e.g. Persian) is stored as written with a note (NOTE). |
| C17 | other patterns: `jalali` (`valid_from`, `valid_to`, `issue.from_date/to_date`, `row.valid_to`), `source.lines`, `source.page` (integer), `field.columns` letters, `refItems.namespace`, `instance.sheetId` | A scalar in the wrong format. | U, A, V, E, W | — | REPAIR | Persian/Arabic digits → Latin, `/` → `-` in dates, `L12–L20` → `12-20`, `"12"` → `12`. Anything still off is stored as written with a note (NOTE), never dropped. Any non-null `valid_to` closes the entry (`is_open`, __init__.py:49-50), so dropping an unreadable date would reopen it. |
| C18 | scalar `type`s: strings (`title`, `statement`, `description`, `identifier`, `grain`, `source.ref`, `location.path`, `sections[].title`, unit symbols), numbers (`share`, `factor_to_base`, `pack.size`, `minimum`, `maximum`, `range.min/max`), booleans (`retired`, `stub`, `hidden`, `open`, `code_absent`, `blank_master`, `readOnly`, `required`) | A scalar of the wrong JSON type, in a form the engine can convert. | U, A, V, E, W | — | REPAIR | Number/boolean → string where a string is expected. Numeric string → number. `"true"`/`"false"` → boolean. A string `"false"` is truthy: `is_open` would close the entry (__init__.py:49) and `_is_stub` would defer every edge (preconditions.py:59). |
| C19 | same | An object/array where the panel draws a string, or a number/boolean that cannot be read. | U, A, V, E, W | — | NOTE | Move the value to `extra`, leave the leaf `null` (red «unknown»), and add a note. Stored as written it crashes, because React cannot render an object as text: FactDetail.tsx:150, IssuesCard.tsx:64, RuleCard.tsx:252, parts.tsx:241 `<Mono>{symbol}</Mono>`, RecordCard.tsx:454, :462. `.split` also throws on a non-string (sourceText.ts:44, RecordCard.tsx:522). A list inside `instances[].key`/`spreadsheetId` breaks `binding_labels` (facts_store.py:489-493). A wrong-typed `title` is C2. |
| C20 | `if/then` rules: `source.quote` only on voice/comment/sheet/process/docx/pdf/photo; `location` shape by `medium`; `fix.factor` for multiply/divide | A shape rule that ties two members together. | U, A, V, E, W | — | NOTE | Store as written with a note (`fix` with no factor: C11). The panel reads each `location` key on its own whatever the medium (RecordCard.tsx:510-592), and no card reads `quote`. |
| C21 | preconditions.py:284-291 `preconditions` (QF-15) | Two open entries in one delta share kind + key + scope. | A, V | — | REPAIR | Fold the second into the first through the ladder, as if it came in the next run. Equal leaves change nothing, differing leaves become open accounts, and lists merge by key. No second id is minted. |
| C22 | preconditions.py:292-295, :307-308, :328-335 | A tab (spreadsheetId + sheet) is claimed twice in the delta, or is already held by an open record under another key. | A, V | — | REPAIR | Apply the decision to the record that already holds the tab: keep its key, and log the incoming key in the run. QF-47 says one tab is one template entry. Stored as written, `find_match` returns `None` (preconditions.py:302-306), so a second record would be created on the tab, and again on every later run. A stub holder is exempt, as today. |
| C23 | preconditions.py:325-327 | The delta matched an existing entry but carries a different key ("keys are immutable"). | A, V | — | REPAIR | Keep the stored key, apply the delta to that entry, and log the incoming key in the run. It is the same thing under another name, so the meaning does not change. |
| C24 | preconditions.py:82-92 `unregistered_scope_problems`, :314; verbs.py:393-394 | Every `scope.departments` code is in `departments/registry.json`. | A, V, E | — | REFUSE | R4 (a scope write outside the registered departments). The department is also the access boundary: `_targets` turns it into `dept:<code>` (routers/facts.py:139-141), so an unregistered code would leave the entry reachable only by `*` holders. |
| C25 | same, branches; assemble.py:286-290 | Every `scope.branches` code is in the sheets manifest. | U, A, V, E | — | NOTE | Store the entry without the unknown code and add a note naming it. Branches are not an access boundary (`_targets` reads departments only), and the panel draws an unknown code as raw text (FactDetail.tsx:217). |
| C26 | preconditions.py:319-320 (QF-43) | A new entry is scoped to a department other than the run's own. | A, V | — | NOTE | Create it with the scope as written and a note naming the run's department. The code is registered (C24 still applies). An unconfirmed entry is shown only to editors of every department it names (`may_serve_fact`, disclosure.py:176-209), so that department confirms it. |
| C27 | preconditions.py:160-172 `_title_twin`, :321-324 (QF-34) | A new entry's title is byte-identical to an open entry's of the same kind and scope. | A, V | — | NOTE | Create it with an `issues[]` entry (`kind: code_collision`, `affects: [{ref: <twin>}]`), which the panel draws as a link (IssuesCard.tsx:66-68). A different key is a different identity, and no id is duplicated. |
| C28 | preconditions.py:95-114 `undeclared_unit_problems`, :316; verbs.py:392; assemble.py:291-294 (QF-40) | Every `unit` leaf is a symbol declared by an open row of the `units` record. | U, A, V, E | SEEN ("unit 'lb' is declared by no row of the units record") | NOTE | First repair: map the spelling to a declared row by exact case-folded match on the row's `key`/`symbol`/`unit_title`. If nothing matches, store as written, keep `unit_raw`, and add a note. The panel draws an undeclared symbol as plain Latin text and does not crash (parts.tsx:239-242). |
| C29 | preconditions.py:132-157 `_reference_problems` (grammar, existence); verbs.py:395-399 (F- refs in `data`) | Every `{ref}` has an F-/T-/process id and names an entry in the store or the delta (stubs defer). | A, V, E | — | NOTE | Sever: remove the ref, keep its text in `extra`, and add a note. If it sits inside a required slot (`applies_to[].record`, `tracked[].record`, `reconciled_against[].against`, `import.source`), move that whole member to `extra` instead (C11). The panel already draws a dangling ref as nothing (bundle.ts:70-72, parts.tsx:321). It must never be stored: an unresolved `T-` would enter the store (INV-1). |
| C30 | same, `noteData.about` (`minItems: 1`) | Every `about` ref of a note dangles. | A, V, E | — | REFUSE | R3: a note must be about something, and once every target is gone nothing is left to sever. |
| C31 | preconditions.py:152-156 | A `{ref, field}` or `{ref, row}` names a field or row its target does not declare. | A, V | — | NOTE | Drop the `field`/`row` part, keep the entry-level `ref`, and add a note. The panel then shows the target's title without the column (bundle.ts:98-101). |
| C32 | preconditions.py:192-233 `_source_path_problems`; verbs.py:403 | Each `source[].ref` and `accounts[].source.ref` names a file inside the repo (estate `.xlsx` excepted). | A, V, E | — | REPAIR | Apply the fix `repair-source-refs` already knows (verbs.py:518-544 `_repaired_ref`: Drive id → manifest path; add a missing `attachments/sheets/` prefix) at the gate instead of afterwards. |
| C33 | same, after C32 | The ref still names no file, or points outside the repo. | A, V, E | — | REFUSE | R4: INV-3 (a citation to a file that is not there) and a path escaping the data repo. `GET /api/facts/source` could not serve it either (routers/facts.py:788-812). Only that decision waits. |
| C34 | preconditions.py:236-269 `process_source_problems` ("has no file"); verbs.py:404; assemble.py:285 | A `process` source's file is gone. | U, A, V, E | — | REFUSE | R4: a citation to a file that is not there. |
| C35 | same ("is tombstoned") | A `process` source's file exists but is tombstoned. | U, A, V, E | — | NOTE | Store the citation as written with a note naming the heir (`superseded_by`). It was true when made. The audit already suggests the re-point on stored entries (`audit._process_link`, audit.py:338), and the panel draws a tombstone with its heir (FactDetail.tsx:376-377). |
| C36 | preconditions.py:353-355; verbs.py:390-391 → `content.check_document` | The content pass. | U, A, V, E | SEEN (several) | see B | Section B tiers each rule inside it. Each rule's tier is the same at all four gates. |
| C37 | `__init__.py:317-320` `save_store`; verbs.py:384-387, :466-476 `edit`; apply.py:215-222 `simulate` | The store about to be written passes `facts.schema.json`. Edit checks the **whole kind file**, not only the touched entry. | W, E, V | — | REFUSE | R1, kept only as a last safety net. That works only if the store schema accepts everything C5-C35 now stores (`extra`, open enums, the new `null`s, severed shapes); otherwise every NOTE turns into a refusal here. Because edit checks the whole kind file (verbs.py:386), one old off-contract entry blocks every chat edit of that kind. |

## 6. What the panel actually reads

The ground truth for R2 in every section above: what each card reads, the type it assumes, and what happens today if a member is missing or the wrong type.

The app has no error boundary (`createBrowserRouter` with no `errorElement`, main.tsx:16, routes.tsx:43-47). A **crash** below means React Router's default error screen replaces the page. A **500** means the backend request fails. `label()` returns the raw value in production and **throws in DEV** (factsLabels.ts:834-842), so "enum outside list" means raw ASCII in prod and a crash in dev.

**Envelope (every kind)**
- `id` (string, `F-nnnnn`): backend `is_fact` requires it; otherwise the entry is left out of the list and its page returns 404 (visibility.py:308-311, routers/facts.py:185, :517). Drawn at FactDetail.tsx:315.
- `kind` (one of five): an unknown kind is left out / 404 (same lines). Label at FactDetail.tsx:195, FactsList.tsx:249.
- `key` (string): FactDetail.tsx:317. Missing → blank.
- `title` (string): FactDetail.tsx:137, FactsList.tsx:232. Missing → blank, **but crashes** the list search (factsFilter.ts:68 `r.title.includes`). Object → crash.
- `statement` (string): FactDetail.tsx:150. Missing → blank. Object → crash.
- `scope` (`{departments?: string[], branches?: string[]}`): FactDetail.tsx:216-217 reads `entry.scope.departments` with no guard, so a missing scope **crashes** the detail page (the list serves `scope or {}`, routers/facts.py:549). A string `departments` → crash (FactDetail.tsx:216, FactsList.tsx:372). The backend ignores non-string codes (routers/facts.py:139-141).
- `aliases` (string[]): FactDetail.tsx:152-158. A non-empty string → `.map` crash. A non-string member crashes the search (factsFilter.ts:70).
- `retired` (boolean, read as truthy): FactDetail.tsx:129, FactConfirm.tsx:64. `"false"` is drawn as retired and the tick is hidden.
- `updated_at` (ISO string): `jalali()` at FactDetail.tsx:326. An invalid date renders "NaN" digits, no crash.
- `source[]` (`{type, ref: string|null, sheet?, cell?, lines?, node?, function?, page?}`): FactDetail.tsx:247-255, SourceRow.tsx:36-56, sourceText.ts:29-44. A non-null, non-string `ref` → `.split` crash (sourceText.ts:44). Unknown `type` → enum case (SourceRow.tsx:56), and it is treated as downloadable (sourceText.ts:56). A string `source` → `.map` crash.
- `accounts[]` (`{id, field, statement, status, value?, speaker_role?, source?}`): AccountsCard.tsx:34-101. Only `status === 'open'` is shown; any other status is **ignored**. `value` goes through `String()` (:71-73). An object `statement` → crash (parts.tsx:292-299). A string `accounts` → `.filter` crash (:34). The backend guards it (facts_store.py:304-307).
- `field_status` (`{path: 'inferred'|'informal'}`): IssuesCard.tsx:93-109. Unknown value → enum case. A non-object is harmless.
- `issues[]` (`{kind, description, affects[], from_date?, fix?{op, factor?}, instance?}`): IssuesCard.tsx:29-68, RecordCard.tsx:780-786. Missing `affects` → **crash** (:66). Object `description` → crash (:64). A string `issues` → `.filter`/`.map` crash.
- `valid_from`/`valid_to` (string|null): LifecycleCard.tsx:24-44, via `toFa`, no crash.
- `supersedes`/`superseded_by` (`{ref}`|null): LifecycleCard.tsx:22-61 reads `.ref`. A string → blank.
- `processes[]` (`{ref}`): members off the id grammar are **ignored** (facts_store.py:376-379). Drawn from `bundle.processes` (FactDetail.tsx:258-265).
- `data` (object): a truthy non-object makes `_labels` 500 **every** detail request, because it walks the whole store (facts_store.py:331). `_masked_rows` fails the same way (routers/facts.py:371).

**item** (ItemCard.tsx)
- `code` (string|null, :29; backend `str(code)` facts_store.py:331-333) and `code_absent` (boolean, :29).
- `category` (enum, :33): missing → empty pill; unknown → enum case.
- `unit` (string|null, :36 via `Unit`): object → crash (parts.tsx:241).
- `unit_raw` (string, :39).
- `pack` (`{size, unit}`, :45-63): `null` is schema-legal but **crashes** at :53 `d.pack.unit`.
- `group` (string, :67-84) and `grade` (string, :87-89).
- `state` (enum, :92-95).
- `units[]` (`{pack_unit, factor_to_base: number|null|{min, max}}`, :100-112, :142-145).
- `tracked[]` (`{value, reason}`, :119-131): `record` is **not read**.

**record** (RecordCard.tsx; FactDetail.tsx:196-199, :347-350)
- `role`/`medium` (enums): label only, FactDetail.tsx:198-199.
- `fields[]` (`{key, title, unit?, unit_raw?, type?, refItems?, derived?, filled_by?, group?.title, constraints?{enum[], readOnly, required, minimum, maximum}, description?}`): read at :84, :111-176, :254-334, :373-397.
  - Missing `key` → every cell shows «unanswered» (:153).
  - Missing `title` → blank header, or the text "undefined · raw" (:172).
  - Non-array `constraints.enum` → crash (:387).
  - `null` member → crash (:85, :142).
- `rows[]` (objects with `key`, `title`, `unit`, `unit_raw`, `section`, `when`, `open`, `retired`, plus one cell per field key): read at :85, :112-153, :402-430.
  - `null` row → crash (:85).
  - Object cell → "[object Object]", no crash (:192).
  - Object `unit`/`section` → crash (:454, :462).
  - The backend guards rows (facts_store.py:448-465, routers/facts.py:371-384).
- `header_fields[]` (`{key, title?}`, :644-657), `sections[]` (`{key, title, doc_number_field?}`, :663-671).
- `signatures[]` (`{role, row_range?}`, :678-689): `row_range: null` is schema-legal but **crashes** (`rowRange` → `.split`, :357-358).
- `primaryKey` (string[], :115, :636 `.join`): a string → crash.
- `grain` (string, :121, :261, :598-602), `cadence` (enum, :261, :605-607), `day_boundary` (string|null, :611-625), `blank_master` (boolean, :628), `approved_by` (string, :639-641).
- `movement` (`{from?, to?, reason?}`, :696-703): `null` → crash.
- `reconciled_against[]` (`{cell{row, field}, against}`, :727-745): missing `cell` → crash (:731).
- `location` (`{path?, sheet?, spreadsheetId?, identifier_scheme?{authority, format}, system?, kept_at?, holder?}`, :510-592): each key is read on its own. Non-string `path` → `.split` crash (:522). A string `location` is harmless in the UI, but 500s the list (facts_store.py:743).
- `instances[]` (`{key, sheet, hidden?, imports?[{key, source, range?}]}`, :595-596, :777-828):
  - `imports[]` without `source` → crash (:805-806).
  - A list `key`/`spreadsheetId` → 500 in `binding_labels` (facts_store.py:487-494).
- `foreignKeys`: guarded (:564-566).
- `stub` (boolean): FactConfirm.tsx:63.

**measurement** (MeasurementCard.tsx)
- `quantity` (enum, :37) and `unit` (string|null, :38).
- `of`/`writes_to` (`{ref, field?}`, :29-30, :51-52): dangling → blank.
- `when`/`by` (string, :46): object → "[object Object]".
- `method` (string, :57-58): object → crash.
- `exceptions` (string|null, :60-61).

**rule** (RuleCard.tsx; FactDetail.tsx:203)
- `inputs[]` (`{key, title?, unit?, from?: {ref}|{param}|'operator'|'calendar'|null, via?}`, :59, :243, :312-313, :465-522): missing → drawn as a constant «مقدار ثابت». A string → `.map` crash (:312). `null` member → crash (:313).
- `outputs[]` (`{key, title?, unit?, value?, range?{min, max}, nature?, per?, share?, of?, writes_to?}`, :62-63, :77-127, :325-326, :525-568):
  - `value` goes through `String()` (:44).
  - A non-number `share` → "NaN%" (:542).
  - `nature` → enum case.
- `expr` (string, :65): guarded by `typeof`.
- `lang` (enum): FactDetail.tsx:203, :590-591.
- `table` (`{inputs[], outputs[], rows[object], hit?, aggregate?, default?: object}`, :66, :179-232):
  - `table: null` → crash (:182).
  - `default: null` → crash (:227).
  - `null` table row → crash (:215).
- `identifier` (string, :249-252): object → crash.
- `original`/`original_ref` (string, :246-261): the backend reads `original_ref` only inside `facts/originals/` (routers/facts.py:617-626).
- `template_of` (`{ref}`) and `divergence` (enum): :265-275.
- `applies_to[]` (`{key, record, range?, params?}`, :281-282, :396-441): a non-string `key` → 500 (facts_store.py:507 `.split`).
- `calls[]` (`{ref}`, :285-298): `null` member → crash.
- `edge_cases[]` (`{input, expected, why}`, :332-350): the schema allows any JSON in `input`/`expected`, and an object there **crashes**.

**note**
- No card draws `data.about` or `data.question` (FactDetail.tsx:169-179 has no note card), so the note payload is **ignored** except for its `about` refs feeding `resolved` (facts_store.py:421-424). Only the envelope is drawn.

**list row** (FactsList.tsx, served from the index by routers/facts.py:544-566)
- Reads `title` (:232), `kind` (:249), `scope` (:254 → :372), `red_counts` (:392-393), `stub`/`retired` (:394-395) and `confirmed` (:278-281). Every field is filled in by the route with a fallback, except `title`, which crashes the search when missing (factsFilter.ts:68).

## 7. What changes for the owner

- **Runs stop far less.** A run that meets a problem stores everything else and says exactly what waited.
- **More entries carry «استنباطی» or a note in the panel.** Those are the ones to read before ticking confirm.
  The owner's Telegram report stays as short as it is today; notes live on the entry, not in the message.
- **Engine fixes become improvements you schedule**, not something that blocks a department's data until
  the next run.

## 8. Risks, and what stays guarded

| Risk | Guard |
|---|---|
| Imperfect entries reach the panel | Nothing is confirmed until a person ticks it; uncertain fields are marked «استنباطی»; any entry can be corrected through the bot. |
| A relaxed shape the panel draws badly or not at all | Every NOTE and REPAIR row was checked against what the panel actually reads (section 6). Anything that would crash or blank a card stays REFUSE or becomes a REPAIR that produces the shape the panel expects. |
| A later run cannot match entries it should update | Keys, kinds and scopes stay REFUSE-tier identifiers, so a re-run still recognises existing entries. |
| A rule relaxed at the unit gate still refuses at `apply` | Principle 4: one tier per rule at every gate; the tests assert it per row. |
| Invented ids or fabricated sources | INV-1 and INV-3 stay REFUSE, per decision. |

## 9. Decisions for the owner

**1. The six fixes (section 3).** Approve, change or drop F1–F6.

**2. The tier policy (section 4) and prerequisites P1–P5.**

**3. The debatable rules.** Each has a proposed default. **The default applies unless you strike it.**

| Rule | Question | Proposed default | Alternative |
|---|---|---|---|
| A1 | A third attempt file | Keep the cap of two; only refused decisions are retried anyway | Read the latest valid attempt, however many |
| A9 / C11 | An entry with no sentence | Store with an empty statement and a note | Refuse that decision |
| A16 | One table decided twice, differently | Keep the first; the second becomes a note | Both wait |
| A17 | A table the AI forgot to decide | Include it in the retry if the unit retries anyway; otherwise it waits | Always retry for it |
| A22 | A rule merged into a table (different kinds) | Store the rule as its own entry with a note | Refuse that decision |
| A23 | A citation to a process step that does not exist | Drop the citation, add a note | Refuse that decision |
| A26 | Rule inputs that look swapped | Store, mark inferred, add a note naming the column actually read | Refuse that decision (this check has caught a real false formula) |
| A34 / C25 | A branch code not in the manifest | Drop the code, add a note | Refuse |
| **A36 / C9** | **A table row with no key** | **Derive it from the table's key columns; else from the row's title when unique in the table; else refuse that decision.** Positional keys (`row_3`) are rejected: row order changes between runs and would match the wrong rows | A: positional `row_<n>` · C: always refuse |
| C9 | Another keyed member (column, input, output) with no key | Move that member to `extra` with a note; land the rest of the entry | Refuse the decision |
| B4 / B6 / C16 | A key still invalid after cleanup | Refuse that decision — keys are identity and never change | Store with a permanent odd key |
| B38–B44 | Style lint (cell names, pipeline words, spoken endings, Latin words, long quotes) | A note only; **style no longer blocks «آماده» in the audit** | Style still blocks readiness, without retries |
| B40 | Banned words «بچ» and «پاس» | Remove both from the banned list: they are kitchen words here | Remove only «بچ» |
| B19 | A constant rule with no number | Store `value: null`, so it shows «؟» as a question for you | Store with «—» |
| B22 | A threshold on a rule with inputs («حد شروع پخت») | Store as written, **with** the panel fix P4(a) | Store with a note until the panel fix ships |
| B37 | A process link with no citation | The engine adds the citation to the real process file | A note, no citation |
| C12 | A disputed value with no source | Drop that one account with a note; land the entry | Refuse the decision |
| C19 | An object where text belongs | Keep it in `extra`, leave the field unanswered, add a note | Convert it to text in place |
| C21 | The same key twice in one run | Fold the second into the first, as a later run would | Refuse the second |
| C22 | A tab already held under another key | Apply to the holder, keep the holder's key and scope, note the incoming ones | Refuse |
| C26 | A new entry scoped outside the run's department | Create it with a note | Refuse, as today |
| C33 | A citation to a missing file | Drop only that citation when the entry has another valid source; refuse only when none remains | Always refuse |
| C35 | A citation to a retired process | Keep it with a note naming the replacement | Re-point it to the replacement |

**4. The server's preparation data.** After the fixes are in: whether to clear preparation's 160 entries before re-running it.
## 10. Rollout and test plan

1. Implement F1–F6 and the tiers on a branch, test-first. The real refused documents from the preparation run
   (the Excel unit's two attempts and the seven refused meeting attempts) become regression fixtures, copied
   read-only from git history.
2. For every tier row, one test: REFUSE still refuses only that decision; REPAIR produces the accepted shape;
   NOTE stores the entry with its mark and triggers no retry — at the unit gate and at `apply` alike.
3. A full local run of **preparation** with the real Excel file and all 13 photos, before anything reaches the
   server. Success means: the Excel's tables and formulas land, the photos are read by a unit, and the report
   names anything that still waited.
4. A full local run of **cooking** as a regression, compared with the earlier cooking runs.
5. The server is touched only on the owner's word: pull both repos, rebuild, and — the owner's choice — clear
   preparation's entries and re-run it.
