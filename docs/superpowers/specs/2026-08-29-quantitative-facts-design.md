# Quantitative facts — design

**Date:** 2026-08-29
**Status:** approved for planning
**Decision prefix:** `QF-n` (the `D-n` namespace belongs to the ui-backend spec)

---

## 1. The problem

The pipeline was built for one input type: meeting audio about *who does what*,
producing IDEF0 diagrams in `departments/{dept}/processes/*.json`. A second
category has arrived that differs in kind:

- Excel exports of the Google Sheets estate (28 workbooks, 68 files) —
  `../EXPORT_FOR_CLAUDE/`
- photographs of blank paper forms
- meeting audio whose subject is numbers and formulas rather than roles

Three pressures shape where it should live:

1. It is **input to a later stage** — an ERP will be built from these processes
   with Claude Code's help — so formulas must be stored unambiguously for a
   machine, not merely legibly for a human.
2. The system must not become complicated.
3. Precision is brittle. A structure fitted tightly to today's data is
   obsoleted by tomorrow's; a structure too loose loses information silently.

`.structure.md` alone does not solve this. Its scan stops at row 400, it lists
only *unique* formulas, and Google strips named functions on export — replacing
each with its last cached value, which is where the `#DIV/0!` and `#NAME?`
artefacts come from. Reconstruction is real work. **It must happen once and be
saved, not repeated by every future reader.** That is what this design stores.

---

## 2. Boundary — what is stored and what is not

**QF-1. Definitions only. Values never enter the system.**

Stored: what a column *means*, its unit, who fills it in, when, and how a number
is computed from other numbers.

Not stored: the numbers themselves. "35 kg of cheese on 16 Azar 1404" stays in
`Pitza.xlsx`. The workbooks are kept verbatim as attachments; the ERP will read
history from those files and *meaning* from here.

A recipe line — 250 g cheese per pizza `#61` — is a **definition**, not a daily
observation, and is therefore in scope. The dividing question is not "is it a
number" but "does it change every night".

**Consequence.** No data-warehouse component, no import of historical rows, no
schema for time series. If the spreadsheets are ever to be retired, that is a
separate project which reads this one's records as its map.

---

## 3. Storage layout

```
data-repo/
  meetings/                       (unchanged — already shared)
  attachments/                    NEW, shared: material owned by no department
    NAMED_FUNCTIONS.md
  facts/                          NEW, shared
    items.json
    records.json
    measurements.json
    parameters.json
    rules.json
    notes.json
  departments/{dept}/
    attachments/                  (unchanged; workbooks and form photos land here)
    processes/                    (unchanged)
```

**QF-2. Facts are global, one file per kind, with department as a tag.**

Per-department fact files were considered and rejected. The failure they cause
is silent: `cooking` writes a tolerance of 5 % and `accounting` writes 313
pieces, in two files, and nothing notices the contradiction until the ERP
builder does. With one global file the second run meets the first entry by
natural key, the disagreement is recorded on the entry (§5, `status: disputed`),
and it appears in the gap worklist the day it is created. A fact true for
everyone is written **once**, with an empty scope.

One file per kind rather than one file for all facts: each stays small enough to
read whole, and two runs touching different kinds produce independent diffs.

*Ceiling:* the six files are shared by all runs, so two concurrent runs could
race. Runs are sequential per bot today and `merge` does read-modify-write in a
single step. If concurrency ever becomes real, shard by kind and department into
`facts/{kind}/{dept}.json` — the entry shape does not change.

**QF-3. Attachment filing.** Every attachment has exactly one home.

| File | Home |
|---|---|
| `Pitza`, `Farangi`, `Sokhari`, `Kanter`, `Anbar`, `Amadesazi`, `Salon`, `Sandogh`, `Logestic`, `Hesabdari`, `Ashpazkhane`, `Mavade Avalie` | the department whose staff **enter** the numbers |
| `Gozaresh markazi`, `Gozaresh naharkhoran`, `Gozareshat`, `MandeShab control` | `management` — they aggregate, they fill in nothing |
| `NAMED_FUNCTIONS.md` | shared top-level `attachments/` |
| form photographs | the department that fills the form |

`NAMED_FUNCTIONS.md` is shared by necessity, not tidiness: any run
reconstructing any formula must inline `GET_ROW_BY_PERSIAN_DATE`,
`FORMAT_PERSIAN_DATE`, `CONVERT_GR_TO_KG`. Filed under one department, the other
eight runs could not resolve the formulas they read. Its content becomes seven
`rule` entries with empty scope; the two signatures the file marks ⚠️ land as
`status: inferred`.

Because the aggregate report workbooks belong to `management`, that department's
run is the one which reconstructs the cross-workbook `IMPORTRANGE` graph and the
deviation logic. The department that reads a report owns that report's formulas.

---

## 4. The envelope

Every entry in every fact file has the same envelope. The envelope is
`additionalProperties: false`; `data` is not.

```json
{
  "id": "F-0042",
  "kind": "rule",
  "name": "مصرف واقعی پیتزا",
  "aliases": ["انحراف", "مغایرت", "Mismatch"],
  "statement": "مصرف واقعی = موجودی اول شب + دریافت از انبار − موجودی آخر شب",
  "scope":  { "departments": ["cooking"], "branches": ["chalebagh"] },
  "source": [
    { "type": "sheet", "ref": "attachments/Gozaresh markazi.structure.md#پیتزا!E6",
      "hash": "sha256:…", "run": "runs/management/0829-1" },
    { "type": "voice", "ref": "meetings/transcripts/cooking-1405-06-01.txt",
      "run": "runs/cooking/0829-1" }
  ],
  "status": "confirmed",
  "accounts": [],
  "links": { "nodes": ["N-0107"], "processes": ["P-0031"], "facts": ["F-0007"] },
  "fields": { "statement": "runs/cooking/0829-1", "data.expr": "runs/management/0829-1" },
  "data": { }
}
```

**QF-4. `scope` is two lists; empty means universal.** `departments` and
`branches` are independent — the estate's branches (chalebagh, naharkhoran) cut
across its functional departments, and the registry models only the latter. A
value that genuinely differs per branch is **two entries**, each scoped to its
branch, not one entry with two values; `scope` answers "to whom does this apply"
and nothing else.

**QF-5. `source` is a list, with a hash.** A well-sourced fact cites several
places — the sheet formula *and* the meeting where it was explained. `hash` on
file-backed sources is what makes "has this file been re-exported since we read
it" answerable, and it replaces the `sources.json` ledger considered earlier: an
index of source paths is derivable from the entries and would be a second place
for the same fact to be recorded, and to rot.

**QF-6. `status` is epistemic, with four values, and is mandatory.**

| value | meaning | example from this estate |
|---|---|---|
| `confirmed` | someone stated it explicitly | «۲۸۰ گرم خمیر برای هر پیتزا» |
| `inferred` | we derived it; nobody said it | the 10-per-portion factor |
| `disputed` | speakers gave conflicting accounts | three different deviation tolerances in one meeting |
| `unknown` | the field applies, is needed, and has no answer yet | the deviation threshold itself |

`accounts[]` holds the competing statements — `{statement, value?, unit?,
source, speaker?}` — so a human can resolve them later from what was actually
said.

The distinction that earns this field is between a value **absent because it
does not apply** (accounting has no physical items) and a value **present but
`unknown`**, which applies, is needed, and blocks the ERP. Without it the agent
has two bad choices at a gap: leave the field empty, so nothing records that a
gap exists and a later reader assumes it was unnecessary; or invent a plausible
number, which then sits there indistinguishable from fact.

This must exist before the first entry is written. Retrofitted later, every
existing entry silently defaults to `confirmed`, and the information needed to
correct them — which ones were contested — was lost at write time and is
recoverable only by re-reading every transcript.

The payoff is one query: **everything `unknown` or `disputed`** is the exact
worklist that must be closed before the ERP can be built. A manual fill exercise
over this estate produced 15 such items, 5 of them genuine blockers, including
an arithmetic inconsistency (910 vs 1000 g for grilled chicken) that nobody in
the meeting noticed.

`status` is *not* human review. Reviewed-ness lives in `app.db` (§8) and no
`confirmed` flag may be added to any document — the ui-backend's D20 forbids it,
for the reason its own comment gives: a boolean would have to be cleared
correctly by the UI's Save, a chat edit and a `merge` run, and missing one
leaves a mark vouching for something stale. A human resolving a dispute sets
`status: confirmed` and **keeps** `accounts[]`.

**QF-7. `fields` is run provenance, one run id per written field path.** Written
by `merge` for envelope fields, each top-level key under `data`, and — for
records — each column by name. Not deeper. It answers "which run wrote this",
which is what makes "new since the last run" renderable without any diff
machinery.

**QF-8. `links` points outward only.** `process.schema.json` does not change; a
node does not learn about facts. A link whose target disappears in a restructure
is shown as an orphan in the UI and reported by `consolidate`; it is never
auto-repaired and never silently dropped.

---

## 5. The six kinds

**QF-9.** These six cover everything observed in *this* estate. That is a weaker
claim than completeness and is meant to be: `note` exists precisely because the
next department may bring a seventh shape, and a sentence claiming the taxonomy
is closed would later be cited to force a new shape into an ill-fitting kind.

### `item` — a thing counted, weighed, or priced

```json
"data": {
  "code": "##1",
  "unit": "g",
  "category": "ingredient",
  "pack": { "size": 24, "unit": "pcs" }
}
```
`category`: `ingredient | product | packaging | consumable | other`. The codes
are the estate's own (`##1` for ingredients, `#61` for products, from the
`Table_Ingredients_*` headers and `getValueById`'s `#` matching); they are kept
verbatim because the ERP will want them and because they are the only durable
key this data has.

### `record` — a persistent place numbers are written

A sheet tab, a named-range table, a paper form, an exported CSV. Modelled on
Frictionless Table Schema, with the fields a form needs that a spreadsheet
does not.

```json
"data": {
  "medium": "paper",
  "role": "log",
  "location": "departments/cooking/attachments/forms/photo_2026-08-29_14-23-51.jpg",
  "grain": "one row per item, one sheet per shift",
  "cadence": "nightly",
  "filled_by": "مسئول واحد",
  "approved_by": "انبار دار",
  "fields": [
    { "name": "نام کالا", "type": "string", "refItems": true },
    { "name": "مانده اول شب", "type": "number", "unit": "g" },
    { "name": "درخواست دریافتی", "type": "number", "unit": "g",
      "constraints": { "readOnly": true },
      "description": "خانه‌ی سایه‌دار — «چیزی ننویسید»" },
    { "name": "مانده آخر شب", "type": "number", "unit": "g" },
    { "name": "اختلاف روز", "type": "number", "unit": "g", "derived": "F-0051" }
  ],
  "primaryKey": ["تاریخ", "نام کالا"],
  "rows_fixed": ["برگر", "مینی برگر", "رست بیف", "مرغ گریل", "هات داگ",
                 "ژامبون دوگانه", "بیکن ورقه ای", "پارمسان", "گودا ورقه ای",
                 "گودا لیوانی"],
  "foreignKeys": [],
  "issues": []
}
```

For `medium: sheet`, `location` is `{spreadsheetId, sheet, namedRange?, hidden?}`
and `foreignKeys[]` carries the workbook graph:

```json
"foreignKeys": [
  { "fields": ["تاریخ"],
    "reference": { "record": "F-0031", "fields": ["تاریخ"] },
    "via": "IMPORT_FROM_SHEET(SheetsFileId_Pizza, …)" }
]
```

**QF-10. Excel built from Excel is a first-class relation.** `Gozaresh markazi`
holds almost no data of its own; it pulls from `Pitza`, `Anbar markazi`,
`Ingredients` and others through `IMPORTRANGE`. That dependency graph *is* the
data flow, and it is the single most useful thing the ERP builder inherits. It
is captured twice, deliberately: structurally on the record's `foreignKeys`, and
operationally on the rule that performs the pull (`inputs[].from`). The hidden
`SheetsFileIDs` tab (name → Drive file id) is what lets the agent resolve those
references to fact ids.

**QF-11. `issues[]` records defects in the record's own history.**

```json
"issues": [
  { "rows": "6+", "field": "وزن پنیر پیتزا ##1",
    "description": "از ۱۶ آذر ۱۴۰۴ مقادیر به گرم ثبت شده‌اند نه کیلوگرم",
    "fix": "برای ردیف‌های ۶ به بعد تقسیم بر ۱۰۰۰" }
]
```

`Pitza/موجودی اول شب` holds `39.158` (kg) on 8 Azar and `35000` (g) on 16 Azar
with no marker. Per-column `unit` fixes the *definition*; without `issues[]`
there is nowhere to say the existing history violates it, and at migration time
that is the difference between importing the history correctly and importing it
off by a factor of a thousand. An issue is **not** a `status` — the definition
is confirmed, the history is broken, and conflating the two makes both unusable.

### `measurement` — what is captured, by whom, into which record field

```json
"data": {
  "of": "F-0003",
  "quantity": "mass",
  "unit": "g",
  "method": "ترازو؛ اقلام کارتنی بر اساس تعداد کارتن × وزن اسمی",
  "when": "پایان شیفت",
  "by": "اپراتور ایستگاه",
  "writes_to": { "record": "F-0031", "field": "مانده آخر شب" },
  "exceptions": "آرد وزن‌کشی نمی‌شود؛ ضایعات زیر ۲۰ گرم ثبت نمی‌شود"
}
```

This is the answer to *where are the measurements written down*: the definition
lives here and links to the IDEF0 node that performs it, the values live in the
record it writes to. It is the only place the "we weigh X but not Y, because…"
content of the transcripts can land without being lost.

### `parameter` — a fixed value a rule consumes

```json
"data": { "value": 280, "unit": "g", "per": "pizza", "of": "F-0026",
          "applies": ["F-0061"], "valid_from": "1405/05" }
```
Ranges are `{"min": 70, "max": 90, "unit": "g/kg"}` — e.g. the drip loss of a
kilo of steak.

### `rule` — a computation or a decision

```json
"data": {
  "inputs": [ {"name": "start",    "unit": "kg", "from": "F-0031.مانده اول شب"},
              {"name": "received", "unit": "kg", "from": "F-0032.مقدار"},
              {"name": "end",      "unit": "kg", "from": "F-0031.مانده آخر شب"} ],
  "output": { "name": "actual_use", "unit": "kg" },
  "expr": "start + received - end",
  "lang": "feel",
  "original": "=LET(pizzaData, GET_ROW_BY_PERSIAN_DATE(B4,C4,D4,Table_Pizza_First), …)",
  "calls": ["F-0012", "F-0013"],
  "port": false
}
```

`lang` values, all five needed by this estate:

- `feel` — arithmetic and if/then in a DMN-style expression over named inputs.
  The ERP-consumable form; snake_case identifiers.
- `table` — a decision table: `rows: [{when, then}]`. Weekday coefficients
  (Wed 1.1, Thu 1.2, Fri 1.15), par levels (40 normal / 65 Thu–Fri).
- `text` — a policy with no formalisable expression ("our criterion for tracking
  is rial value"). A rule with no formula is still a rule; its threshold is a
  separate `parameter`, typically `status: unknown`.
- `sheets` — a verbatim Sheets formula we chose not to or could not simplify.
- `gs` — an Apps Script function.

`original` always holds the source form verbatim, including for `gs`: the `.gs`
files are small, and a pointer that can rot is a false economy.

**QF-12. `port: true` marks a function the ERP must reproduce exactly.**
`jalaliToGregorian`, `JALALI_TO_GREG` and `getValueById` carry it. Jalali→
Gregorian conversion is the join key of the entire estate — every
`FILTER_BY_DATE` and `GET_ROW_BY_PERSIAN_DATE` depends on it, and it determines
whether two rows in two workbooks refer to the same night. Handing the ERP
builder a prose description of the one function that governs row alignment
guarantees a reimplementation with different edge-case behaviour.
`onOpen`/`triggerRecalculation` are described, not ported.

### `note` — the escape hatch

Free `data`, mandatory `statement`. **QF-13. `consolidate` owns promotion.** It
already reviews a department's whole set and surfaces numbered suggestions for
human approval; it gains a section reporting recurring `note` shapes the way it
reports duplicate processes. Without a named owner and a scheduled review,
`note` becomes the junk drawer this design exists to avoid.

### QF-14. The classification rule

The taxonomy is worth less than a written test for choosing within it. Without
one, two runs over the same evidence classify the same fact differently — the
weekday coefficient is a `parameter` on Monday and a `rule` on Tuesday — and
neither is wrong, so neither can be corrected.

1. Has inputs and produces an output → **`rule`**.
2. Is a value that a rule consumes → **`parameter`**.
3. Varies by condition → **one `rule` with `lang: table`**, never several
   parameters.
4. Decides *which measurements exist at all* → **`rule` with `lang: text`**.
5. Is a place numbers are written → **`record`**.
6. Is a thing that gets counted → **`item`**.
7. Says who captures what, when, into which field → **`measurement`**.
8. None of the above → **`note`**.

Applied to the three genuinely ambiguous cases: par levels → rule/table (3);
weekday coefficients → rule/table (3), not five parameters; the tracking policy
→ rule/text (4), with its threshold as a `parameter`.

### Reference grids

A natural grid of more than roughly twenty values — a BOM, a price list, an item
list — is exported once to `departments/{dept}/attachments/tables/{name}.csv`
(shared `attachments/tables/` when it belongs to no department) and described by a
`record` with `role: reference`, rather than becoming hundreds of `parameter`
entries. CSV needs no schema, reads correctly for both humans and machines, and
keeps the values out of the fact files.

---

## 6. Merge identity and write rules

**QF-15. Natural keys.**

| kind | key |
|---|---|
| `item` | `data.code` |
| `record` | `spreadsheetId` + sheet name; for paper, `medium` + title; for csv, path |
| `measurement` | `(data.of, data.writes_to.record, data.writes_to.field)` |
| `parameter` | `(name, scope)` |
| `rule` | **its output** — see below |
| `note` | none; always inserts |

**QF-16. A rule is keyed by what it defines, never by its display name.** For a
sheet formula, the output cell's record + field (as durable as the record key);
for a named function, its English identifier (`GET_ROW_BY_PERSIAN_DATE`).
A Persian display name is the weakest possible key and the live data shows why:
«انحراف», «مغایرت» and `Mismatch` appear in different workbooks owned by
different departments and probably denote one thing. A later run using a
different word would create a duplicate rule rather than update the existing
one, and duplicate rules do the most damage of any duplicate, because an ERP
builder facing two thresholds cannot tell which is authoritative. `aliases[]`
captures the synonyms for search and is never consulted for identity.

A transcript-derived rule with no identifiable output always inserts;
`consolidate` deduplicates it against existing rules by output.

*Ceiling:* `parameter`'s key is the weakest of the six. `consolidate` is the
backstop. If duplicates prove common, key on `(of, per, unit)` instead.

**QF-17. Write rules, identical for every run — there is no owner.**

- The key is absent → create.
- The key exists and the field is empty → fill, and stamp `fields[path]`.
- The key exists, the field is filled, the values agree → no write.
- The key exists, the field is filled, the values disagree → append to
  `accounts[]`, set `status: disputed`. **Never overwrite.**

This is the process side's fill-empty / pending discipline, carried on the entry
instead of in a separate queue.

---

## 7. Pipeline

**QF-18. Bot runs only. No one-time reconstruction pass.** The estate fills in
department by department as runs are processed; there is one code path, and the
reconstruction work is done by the same mechanism that will maintain it.

```
voice / attachment
  └─ classify   → segments.schema.json, gaining a `quantitative` segment label
       ├─ extract   (unchanged — IDEF0)
       └─ quantify  NEW → facts-delta.json (candidate entries, temp ids)
             └─ merge facts → allocates F- ids, validates, upserts per QF-17
```

**QF-19. `quantify` is a new agent, not an extension of `extract`.** `extract`'s
prompt is already long and wholly IDEF0-shaped; mixing quantitative extraction
into it degrades both. `quantify` inherits the same non-negotiables: fill-empty,
no fabrication, cite every source, IDs only from `allocate-id`.

Its inputs are the department's attachments (workbooks, `.structure.md`, `.gs`,
form photos), the shared `attachments/NAMED_FUNCTIONS.md`, and transcript
segments labelled `quantitative`. Its reconstruction obligation is explicit:
walk **every** formula including those past row 400 and those `.structure.md`
deduplicated away, inline the named functions, and emit `expr` over named
inputs. The `.structure.md` files are a starting index, not the source of truth
— Google replaced every named function with a cached value on export, so the
zeros and `#NAME?` in the `.xlsx` are artefacts, not data.

**QF-20. Stubs carry forward references.** A run that meets a reference to a
sheet its department does not own creates a stub `record`: name, file id,
`status: unknown`, `data.stub: true`, no fields. The run that owns that sheet
fills it in later by natural key. Without stubs, `IMPORTRANGE` targets would
have to be either skipped — disconnecting the graph — or read out of scope.
Stub creation is the one exception to "a run only writes what it read", and it
writes nothing but identity.

**QF-21. `allocate-id` gains one prefix, `F-`, for all six kinds.** The kind is
in the body, so a prefix per kind would churn the ID ledger for no gain. `F-`
ids are disjoint from process ids (`{dept}-NNN`) and department codes, which is
what lets §8 reuse the confirmations table.

---

## 8. UI

**QF-22. Its own top-level section**, spanning departments, alongside the
existing department screens. The reviewer is a person closing data gaps, not a
person reading one department's diagram; attaching facts only to nodes would
make every unlinked fact invisible.

**QF-23. Visibility is filtered by the existing scope model, unchanged.** A
holder of `dept:cooking` sees cooking-tagged entries plus universal ones; `*`
sees everything. No new capability, no new role. `edit` governs editing,
`confirm` governs ticking — the same capabilities that govern processes.

**QF-24. Per-field confirmation reuses `app.db.confirmations`. No new table, and
no `confirmed` flag in any file.** The target string becomes
`"F-0042/data.expr"`; the fingerprint is the SHA-256 of that field's canonical
value. Everything the existing router provides then applies unchanged: the
capability gate, the audit events (`confirmation.set` / `.revoked`), and the 409
when the content moved between the reviewer reading it and ticking it. The only
code change is teaching the target resolver to address a field inside a fact
instead of a whole document.

This is what makes "old vs new" answerable without diff machinery:

| colour | meaning | source |
|---|---|---|
| green | confirmed, fingerprint still matches | `confirmations` |
| amber | never confirmed — "new in run X" | `fields[path]` |
| struck amber | was confirmed; a later run changed it | fingerprint mismatch |
| red | `status` is `disputed` or `unknown` | the entry |

An entry's chip is green only when every field is green; that is derived, never
stored. "Confirm entry" posts every field.

**QF-27. A fact's confirmation gate must load the fact. The lexical shortcut
does not extend.** `_target_scope` derives a department from the target string
with `storage.dept_of`, which is `rsplit("-", 1)[0]` — deliberately lexical so
the gate runs before anything is read from disk. That works because a process id
carries exactly one hyphen and a department code carries none. It breaks on
`F-0042/data.expr`, which resolves to `dept:F` and matches nothing.

A fact's scope is a list and may be empty, so it cannot be recovered from the id
at all. The facts branch of the resolver therefore loads the entry and gates on
its `scope.departments`:

- scoped to one or more departments → `confirm` on **any** of them suffices;
- scoped to none (universal) → `confirm` at `*` is required. A universal fact
  binds every department, so vouching for one is a global act.

The cost is one read before the gate on this route only; the process and
department routes keep their lexical path untouched.

**QF-25. The gap worklist is a view, not a store:** every entry with a `red` or
`amber` field, ordered so blockers surface first. This is the query §4 exists
for and the screen that tells you when the ERP can be started.

**QF-26. Content visibility extends the existing policy table.** New rows in
`store/policy.FIELDS` — `fact_items`, `fact_records`, `fact_measurements`,
`fact_parameters`, `fact_rules`, `fact_notes`, `fact_sources` — each a global
switch set only by a holder of `set_visibility` at `*`, defaulting to hidden,
exactly as that module's own documentation anticipates ("it becomes new rows in
`FIELDS` rather than a new mechanism"). Whole kinds of data are hidden or shown;
there is no per-entry hiding, and none should be added without a case a category
switch cannot serve.

---

## 9. Files touched

**New**
- `schemas/facts.schema.json` — envelope plus a per-kind `if/then` block for
  `data`; envelope `additionalProperties: false`, every `data` payload
  `additionalProperties: true`.
- `schemas/facts-delta.schema.json` — the `quantify` agent's output.
- `data-repo/.claude/agents/quantify.md`
- `data-repo/facts/*.json` (six, seeded empty), `data-repo/attachments/`
- `engine/merge` — a `facts` verb (upsert per QF-15/QF-17, stubs per QF-20)
- ui-backend: a facts router (list, get, put), field-target resolution in the
  confirmations router, seven rows in `policy.FIELDS`
- ui: the data section — list with kind filters and scope filtering, per-kind
  detail forms, per-field confirm control reusing `ConfirmMark`, the gap
  worklist, and a raw-JSON editor as the fallback view for any `data` key the
  forms do not know

**Changed**
- `data-repo/.claude/agents/classify.md` — the `quantitative` segment label
- `data-repo/.claude/agents/consolidate.md` — the note-promotion section
- `engine/allocate-id` — the `F-` prefix
- `data-repo/CLAUDE.md` — one paragraph stating QF-1, QF-2, QF-17

**Unchanged, deliberately:** `schemas/process.schema.json`, `merge`'s process
semantics, the IDEF0 canvas, `pending[]`.

---

## 10. Testing

- Schema round-trip: one valid fixture per kind validates; an unknown envelope
  key fails; an unknown `data` key passes.
- `merge facts`: create; fill-empty; agreeing rewrite is a no-op; disagreeing
  rewrite produces `accounts[]` + `disputed` and does not overwrite; a stub is
  created once and filled once.
- Natural keys: two rules with different Persian names and the same output
  merge into one entry; two parameters differing only in `scope` stay separate.
- Confirmation: a field tick followed by a `merge` that rewrites that field
  leaves the mark invalid; re-ticking against a stale fingerprint answers 409.
- Visibility: a non-editor's read omits every field type whose switch is off.

Scoped runs only — the full sweep is not warranted by this change.

## 11. Deliberate ceilings

Marked with `ponytail:` comments at the point of implementation.

- One file per kind, shared by all runs — sequential runs only (QF-2).
- `parameter` natural key is `(name, scope)`; `consolidate` is the backstop (QF-16).
- Orphaned `links` are reported, never auto-repaired (QF-8).
- Per-field confirmation is built here and not back-ported to processes, which
  keep document-level confirmation. Worth revisiting once this proves itself.
