# Quantitative facts — design (v2)

**Date:** 2026-08-30 (v2; v1 was 2026-08-29)
**Status:** draft — pending review; supersedes the v1 text in place
**Decision prefix:** `QF-n`. The `D-n` namespace is already used by at least three
specs, two of which define their own D20, so a distinct prefix is needed.
Numbering: QF-1…QF-27 keep their v1 meaning where the decision survives (the
text is revised). QF-18 is withdrawn and kept as a stub. **QF-3 and QF-13 are
re-used**: their v1 decisions (filing workbooks per department; `consolidate`
owning note promotion) are withdrawn and the numbers now carry the
replacements. New decisions start at QF-28.

---

## 0. What changed in v2

v1 was reviewed against the engine, the ui-backend, the UI, the runtime
playbooks and all 28 exported workbooks. The review confirmed the epistemic
core — `status` before the first entry, `issues[]` apart from `status`, key by
output not by display name, one global file per kind, a written classification
test, definitions not observations — and found the design weak on three axes it
did not model: **identity** (every key was a Persian display string), **time**
(nothing could be superseded, retired or undone) and **machine consumability**
(`feel` unpinned, units free text, references in four notations). It also found
the pipeline section written against an idealised runtime.

Decisions taken since, all folded in below:

- No Persian keys anywhere. Every entry, every record column and every keyed
  structure inside a payload carries an English `key`; Persian is title,
  statement and description only (QF-32). No normalisation machinery.
- Quantitative extraction is its **own** pipeline: a `quantify` playbook and an
  `edit-fact` playbook mirroring `process-voice`/`edit-process`, one `quantify`
  agent with two modes. `process-voice`, `classify` and `segments.schema.json`
  do not change. Recordings are optional inputs, chosen by the user per run
  (QF-38).
- The workbooks live in **one** folder, `attachments/sheets/`, placed on the
  server by hand and described by a manifest whose judgement columns the
  agent proposes and a person confirms at Gate M; the upload bot does not
  change (QF-3, QF-28).
- Images and PDFs are described by **Vertex Gemini** through the engine and also
  viewed by the agent itself; `extract-attachment` becomes a dispatcher that
  reports what it cannot read (QF-30).
- The store has a lifecycle: `valid_from`/`valid_to`, `supersedes`, retire,
  revert (QF-35). Epistemic status is per field but mostly derived — a `null`
  leaf is unknown, an open account is disputed, and only inferred/informal
  values are written down, in a sparse map (QF-6). One reference
  notation, `{ref, field?, row?}` (QF-37). Exactly one writer, `merge` (QF-2).
- **Five kinds, not six.** A parameter is a rule with no inputs; the
  `parameter` kind is merged into `rule` (§7). A table of definitions is a
  `record` whose rows are inside it — no CSV side files, no size threshold;
  the shape of the source decides (§9).
- A fact anchors to a process only through a node that names it, cited as a
  `process` source; node links and untyped fact-to-fact links are gone. A
  tombstoned process is reported three times: by the engine at the
  tombstone (relayed by one sentence in each process playbook — the only
  change they take), live in the UI, and at the next facts audit with the
  heir proposed (QF-8).
- Confirmation is one tick per entry, fingerprinted over the whole entry,
  exactly as a process document (QF-24); facts are visible to editors and
  admins in the Panel and not in the reader view (QF-23); the per-kind
  switches govern the admin's view and default to shown (QF-26).
- Withdrawn: QF-18 ("bot runs only"), the `quantitative` segment label, filing
  workbooks per department, `consolidate` as the owner of note promotion, the
  `parameter` kind, `facts/tables/*.csv`, per-field confirmation.

---

## 1. The problem

The pipeline was built for one input type: meeting audio about *who does what*,
producing IDEF0 diagrams in `departments/{dept}/processes/*.json`. A second
category has arrived that differs in kind:

- Excel exports of the Google Sheets estate — 28 workbooks with their
  `.structure.md` indexes and ten Apps Script files, plus a hand-written
  `NAMED_FUNCTIONS (1).md` (placed as `NAMED_FUNCTIONS.md`, §3);
- photographs of paper forms;
- meeting audio whose subject is numbers and formulas rather than roles (for
  example `cooking-1405-05-26` and `cooking-1405-06-01`).

Three pressures shape where it should live:

1. It is **input to a later stage** — an ERP will be built from these processes
   with Claude Code's help — so formulas must be stored unambiguously for a
   machine, not merely legibly for a human.
2. The system must not become complicated.
3. Precision is brittle. A structure fitted tightly to today's data is
   obsoleted by tomorrow's; a structure too loose loses information silently.

**What the export actually preserves.** v1 assumed Google stripped the named
functions on export. It does not: all seven `LAMBDA` bodies survive verbatim as
`definedName` elements in `xl/workbook.xml`, every call site survives in `<f>`,
and Google-only formulas Excel cannot evaluate are kept inside
`IFERROR(__xludf.DUMMYFUNCTION("…"), cached)` as an Excel string literal
(inner quotes doubled, split every 255 characters with `"&"`), so unwrapping is
a transformation, not a copy — 1,738 such cells estate-wide. What the `.xlsx`
cannot carry is the **Apps Script** layer — the camelCase functions in the
`.gs` files that compute every مصرف واقعی figure — and evaluability in Excel.
The `#NAME?` cells are therefore not artefacts: the 334 in the `Gozareshat`
dashboard (spreadsheetId `1gev9f9y…`) come from `JALALI_TO_GREG`, which no
workbook and no paired script defines, and from the camelCase three-argument
`filterByDate(data, date, 0)` — distinct from the `FILTER_BY_DATE` LAMBDA that
*is* defined there — propagating through `GET_CELL_VALUE_BY_PERSIAN_DATE`. Two
more (`مواد عادی!C79`, undefined `getAverage2`) sit in the control workbook.
They are live defects and must be recorded as such.

So the primary sources are: the `.xlsx` for formulas, names, validations,
conditional formats and cell comments; the `.gs` files for script bodies; the
photographs for paper forms; the transcripts for everything said aloud.
`.structure.md` is a human index that stops at row 400, lists only unique
formulas, omits camelCase functions and has no section for comments,
validations or conditional formats; its one trusted claim is the
`spreadsheetId` on its first lines, because nothing else carries it.
`NAMED_FUNCTIONS.md` is a note whose own claims are checked, not trusted — its
three load-bearing claims (that the named functions are absent from the
`.xlsx`; that `JALALI_TO_GREG` lives in `Gozareshat.gs`; that the
`GREG_TO_JALALI` family is undefined) are all false. Reconstruction is real
work. **It must happen once and be saved, not repeated by every future
reader.** That is what this design stores.

---

## 2. Boundary — definitions, not observations

**QF-1. The test is whether it changes every night.** Stored: what a column
*means*, its unit, who fills it in, when, and how a number is computed from
other numbers. Not stored in the fact files: a number that changes — the
nightly observations. A number that *is* the definition is stored, whether it
stands alone as a constant rule or fills a cell of a reference table (§9); the
test is the night, not the shape. "35 kg of cheese on 16 Azar 1404" stays in
`Pitza.xlsx`, which is kept verbatim on the server (§3) so the ERP can read
history from the files and *meaning* from here.

A recipe line — 250 g cheese per pizza `#61` (`Mavade Avalie!پیتزا
ایتالیایی!B2`) — is a definition, not a daily observation, and is in scope. A
par level, a tolerance, a conversion factor, a tracking policy, the identity
`start_stock(d) = end_stock(d−1)` are all in scope. A cash count is not.

**Consequence.** No data-warehouse component, no import of historical rows, no
schema for time series. Retiring the spreadsheets is a separate project which
reads this one's records as its map.

**Absences are in scope.** The estate carries no unit price, cost, wage or VAT.
The only monetary figures are per-incident waste values in the two cashier
logs (`Sandogh - Chalebagh!ضایعات!C`, `Sandogh - NaharKhoran!ضایعات!C`, «جمع
ریالی ضایعات»), which are observations, not definitions. A missing dimension
the ERP needs is recorded as seeded constant rules whose output `value` is
`null` — which is what `unknown` looks like on disk (§7) — so the readiness
screen shows it, rather than reading green over it.

---

## 3. Inputs and where they live

**QF-3. The estate lives in one folder, placed by hand.**

```
data-repo/
  attachments/
    sheets/                          the Google Sheets estate, one dir per workbook,
      manifest.json                    mirroring the export layout
      NAMED_FUNCTIONS.md               (the export's "NAMED_FUNCTIONS (1).md", renamed on placement)
      _LOG.md                          (the exporter's own log; committed as provenance, read by nothing)
      MandeShab__ChaleBagh__Amar__Pitza/
        Pitza.xlsx                     (ignored by git — QF-28)
        Pitza.structure.md
      MandeShab__ChaleBagh__Gozaresh markazi/
        Gozaresh markazi.xlsx
        Gozaresh markazi.structure.md
        Gozaresh markazi.gs
      …
      .dump/                           dump-workbook cache (committed)
        {spreadsheetId}/…
      .text/                           extract-attachment cache for anything else placed here
  departments/{dept}/attachments/    field material via the upload bot, unchanged:
    photo_….jpg, *.docx, *.pdf         form photographs, scanned forms
    .text/                             extract-attachment cache (tracked today)
```

The estate is one graph, not 28 departmental files: the report workbooks pull
from the station, warehouse, sales and ingredient workbooks through
`IMPORT_FROM_SHEET`, and a script in one directory calls into a workbook in
another (`Gozareshat/Gozareshat.gs` drives the control workbook, not the
dashboard beside it). Filing by department was a category error — v1's table
covered 16 of 28 workbooks and mis-filed the three most definitional ones.
Ownership is therefore expressed where the rest of the design expresses it —
as `scope` tags on the facts (QF-43) — and never as a file location.

**The manifest** (`attachments/sheets/manifest.json`, Appendix B) is the one
description of the estate: one row per `spreadsheetId` with its directory,
file, `short` name, the scripts that call into it, its department(s) and
branch, and the tabs whose cells are definitions (`reference_tabs`, §9), plus
the **branch registry** (QF-33). Nobody types the judgement columns from
scratch: `dump-workbook --init-manifest` fills the mechanical columns and
dumps every tab's structure; the `quantify` agent in `manifest` mode
(QF-19) proposes `departments`, `branches` and `reference_tabs` per workbook
with a one-line reason it can point at — the branch from the directory name
and the hidden `SheetsFileIds` tab, the department from what the tabs record,
a reference tab from its shape (keyed by item codes, no date column, no daily
rows) — and marks `?` what it cannot decide; the playbook shows the 28 rows
as a Persian checkpoint (**Gate M**, §13); the user corrects lines in plain
Persian or confirms; on confirmation the playbook writes the manifest with
`confirmed: true` on each row. Gate M runs before the first Gate A and again
whenever a workbook appears whose row is missing or unconfirmed. A workbook
**file present on disk** under `attachments/sheets/` with no manifest row, or
an unconfirmed one, is a precondition failure for any run that would read it
(a Drive id merely *referenced* from a formula with no file and no row is a
stub — QF-20).

**The upload bot does not change.** Voice recordings and field material keep
arriving through it into `meetings/` and `departments/{dept}/attachments/`
exactly as today. The bot never sees the estate. Two consequences of leaving
it alone are operating instructions, not defects: a form photograph must be
sent **as a file**, not as a Telegram photo (the bot's attachment state
matches documents only), and the bot's sanitiser rewrites spaces and
parentheses in filenames, so a `source.ref` is always written from the name
**on disk**, never from the name as sent. Photographs may equally be placed by
hand beside the workbooks.

**QF-28. Git and the binaries.** `attachments/sheets/**/*.xlsx` is ignored, on
the audio precedent: the workbooks are deployment assets placed by hand and
carry daily values and, in places, named staff. The manifest, `.structure.md`,
`.gs`, `NAMED_FUNCTIONS.md`, `_LOG.md` and the `.dump/` output are committed.
The dump excludes plain-cell values (QF-1) with one exception — the tabs a
manifest row names in `reference_tabs[]`, whose cells are definitions and not
nightly values (§9, Appendix C's `rows.tsv`) — and otherwise carries headers,
formulas with their cached results, defined names, validations, conditional
formats and cell comments; its comment author column is a role or `unknown`,
never a raw name (Appendix C). Those `rows.tsv` files do enter git; that is
intended, and it is why `reference_tabs` is confirmed by a person at Gate M
rather than left to a heuristic. The folder is added to the
server snapshot list (runbook 05, Backup & restore) because git does not hold
it.

**QF-29. Re-export.** A re-exported workbook replaces its file in place — never
a dated copy beside it — and `dump-workbook` is rerun. Every source citation
carries the file's hash (QF-5); `merge facts check` (§12) reports the entries
whose cited file has moved, and `dump-workbook` reports tabs whose export
`sheetId` now resolves to a different name than the previous dump recorded
(the export numbers tabs positionally, so insertion or deletion shifts them).

**QF-30. `extract-attachment` becomes a dispatcher, and images go through
Vertex.** Today it globs `*.docx` under one department and silently ignores
everything else. It keeps its positional `department` argument (so
`process-voice` Stage 5a's call is unchanged) and gains `--path <dir>` for any
other root; the dispatch is a table keyed on extension:

| Extension | Converter | Output |
|---|---|---|
| `.docx` | python-docx (exists) | `.text/{stem}.txt` |
| `.pdf` | Vertex Gemini (native PDF input) | `.text/{stem}.pdf.md` |
| `.jpg .jpeg .png .webp` | Vertex Gemini | `.text/{stem}.image.md` |
| `.csv .md .txt .gs` | none — read directly | — |
| `.xlsx` | none — `skipped {name}: workbooks are dumped by dump-workbook from attachments/sheets/` | — |
| anything else | `skipped {name}: {reason}` on stderr | — |

Exit codes: 0 when every file converted; **3** when some files were skipped
but every convertible file converted (advisory — Stage 2 relays the `skipped`
lines in Persian and continues); 2 only on a real precondition failure with
nothing written. Exit 3 is new and is documented in `engine/README.md` beside
the other verbs' contract. The Vertex rows need the engine's `vertex` extra;
without it they are reported as `skipped {name}: vertex extra not installed`,
not as a failure.

The Vertex path reuses the transcription client and its configuration
(`VERTEX_PROJECT`, `VERTEX_LOCATION`, the service account) with one new
variable, `VERTEX_VISION_MODEL`, set in `config/engine.env.example` and both
compose files to the Gemini 3-family preview id in use (`gemini-3.1-pro-preview`
today, the same id transcription runs on) — never a literal in code.
`GEMINI_MODEL` stays the transcription model; vision is a separate pin so the
two can move independently. The prompt is fixed in the CLI and asks for a
structured description: document title, header fields, columns with units,
fixed rows in order, sections and document-number fields, shaded or read-only
cells, signature bands, a verbatim transcription of all printed text, and a
`handwriting: yes|no` line so a filled-in form is recognised as a values
artefact (QF-1) and not a blank master. The cache is idempotent by file hash —
stronger than the existing `.docx` cache, which is mtime-gated
(`extract_attachment.needs_conversion`); the `.docx` path moves to the same
hash gate so a touched file does not burn a Vertex call.

The agent receives **both** the description and the image path and is
instructed to look at the image itself. Where the two readings disagree on a
field, the agent writes that field `unknown` with both readings in
`accounts[]`; it never picks.

---

## 4. Storage layout

```
data-repo/
  facts/
    .id-seq.json          the global F- ledger (QF-21)
    .index.json           one row per entry — rebuilt by merge on every write (facts-index.schema.json)
    items.json
    records.json          including every reference table's rows (§9)
    measurements.json
    rules.json            including every constant (§7)
    notes.json
    originals/{id}.txt    verbatim formula / script bodies, out of line (QF-31)
  runs/
    facts/{dept}/{stamp}/ one facts run: meta.json, facts-delta.json, id-map.json, validate output
```

**QF-2. Facts are global, one file per kind, with department as a tag — and
`merge` is the only writer.** Per-department fact files were considered and
rejected: `cooking` writes a tolerance of 5 % and `accounting` writes 313
pieces, in two files, and nothing notices until the ERP builder does. With one
global file the second run meets the first entry by key, the disagreement is
recorded on the entry (QF-6) and the list shows its red count the day it is
created. A fact true for everyone is written once, with an empty scope.

Each file is a JSON object `{"schema_version": 1, "entries": [ … ]}`. One file
per kind keeps diffs independent and each file readable whole.

Everything under `facts/` is written by `merge facts` and nothing else. The
facts run, `edit-fact` and the ui-backend are three *callers* of it: each
writes a delta into a run directory and invokes the verb (the ui-backend
through its existing engine-subprocess module, `inja_ui_backend/engine.py`).
There is no direct PUT.

*Ceiling:* five shared files, one writer invoked from three places, no lock.
`merge facts` resolves every precondition and key before its first write and
then writes all five files. If concurrency ever becomes real, shard by a hash
of the key (`facts/{kind}/{NN}.json`) so one key always lands in one file —
never by department, which would reinstate the silent contradiction QF-2
exists to prevent and leave no slot for a universal fact.

**QF-31. Keep the files readable.** Measured against this estate, raw formula
text is ~1.1 MB, ~950 KB of which is one Salon/Sandogh formula repeated ~1,720
times with only the row number changing; deduplicated per formula group it is
~163 KB over 893 groups. The scripts run 1.7–23 KB, the largest being
`Gozareshat.gs`. The BOM's ~1,200 cells — roughly 400 rows of three columns
across 12 tabs — add roughly 100 KB to `records.json`. `original` (§7,
`rule`) is held out of line in `facts/originals/{id}.txt` with
`data.original_ref` in the entry, so the payload files stay small, and
`facts/.index.json` — `{id, kind, key, title, aliases, scope, status,
field_status_counts, processes, retired, valid_to, updated_at}` per entry, where
`field_status_counts` is `{disputed, unknown, informal, inferred}` as counts,
derived from open accounts, `null` leaves and the sparse `field_status` map
(QF-6) — lets the audit, the agent, `edit-fact` and the UI
list without loading payloads; a consumer needing the paths loads the entry.
A size ceiling of
2 MB per file is marked with a `ponytail:` comment in `merge`, naming the
shard trigger above.

**QF-45. Schema version and migration.** Every fact file and the index carry
`schema_version`. The number is bumped only by an append-only migration note
in `schemas/README.md`, mirroring the ui-backend's numbered-migration
convention; a reader that meets a higher number **refuses**, and a lower
number is upgraded by the named migration, never silently half-validated.
Because every `data` payload is `additionalProperties: true`, a shape change
cannot surface as a validation failure — the version is the only marker.

---

## 5. Identity

**QF-32. No Persian keys.** Every fact, every record column and every keyed
structure inside a payload (`sections[]`, `header_fields[]`, `fields[]`,
`rows[]`, `inputs[]`, `outputs[]`) carries a required `key`. Persian appears
only in `title`, `statement`, `description`, `aliases`, `accounts[].statement`
and the prose fields named in §7 (`grain`, `method`, `exceptions`, `reason`,
`issues[].description`). A **minted segment** matches
`^[a-z][a-z0-9]*(_[a-z0-9]+)*$` — single underscores only — and `__` is
reserved as the join operator for composed keys. Keys are derived from the
estate where it supplies one and minted by the agent otherwise:

| Thing | Key |
|---|---|
| sheet record | `{manifest.short}__{tab}` where `tab` is the tab name lower-cased with non-alphanumeric runs folded to `_` when the name is ASCII (`table_pizza_first`), else minted once by the agent (`pizza` for «پیتزا») |
| paper / external-system record | minted (`goods_request_counter`, `pos_sepidz`) |
| workbook stub (QF-20) | `ext_` + the first 12 hex of `sha256(spreadsheetId)` |
| record column | from an item code in the header when there is one (`ing_1` for `##1`, `prod_61` for `#61`), else minted once |
| record row | the `__`-join of the row's `primaryKey` values when every `primaryKey` member is a `fields[]` key present on the row whose value matches the minted-segment pattern (`prod_61__ing_1` in the BOM, `g` in the unit table); otherwise minted once and kept by `merge` as written (`burger` on a paper log, whose `primaryKey` `["date", "item"]` is the grain of a filled sheet, not of a printed row) |
| item | `##N` → `ing_N`, `#N` → `prod_N` when the code is unique in its namespace; a code with two referents (`#27`) → minted (`meat_27`, `potato_special_27`) with the code kept in `data.code` and a `code_collision` issue on each; uncoded → minted (`gouda_cup`) |
| measurement | `{item.key}__{record.key}__{column.key}` — derived by `merge` after ids are known; a delta's measurement key is advisory |
| rule from a sheet formula | `{record.key}__{column.key}` |
| constant from a formula literal | `{record.key}__{column.key}__{binding}`, where `binding` is the `LET` or `definedName` identifier lower-cased (`gozaresh_cb__pizza__deviation_tol__tolerance_per_food_gr`), else `…__c{n}` numbering the group's literals left to right — one constant per formula **group**, never per cell: the ~1,720 Salon copies of one formula yield one rule and one constant per literal, and the same literal in two groups is two constants unless read-before-mint (QF-34) recognises one referent |
| rule from a named function or script | the identifier, lower-cased (`get_row_by_persian_date`); identical bodies under one identifier are one rule with several sources (QF-43); a second body that *differs* takes a `__{short}` suffix (`get_value_by_id__gozareshat`) and is `template_of` the first with `divergence: drift` |
| rule stated singly in a transcript — a constant or a computed rule | minted; must encode the axes that distinguish it (`raw_equivalent_factor_grilled_chicken`, not `factor`) |
| note | `note_` + the first 12 hex of `sha256(statement)` — deterministic |

Every key in this document is the output of this table; where an example reads
well it is because `short` and the minted segments read well. `manifest.short`
matches the minted-segment pattern, is unique across the manifest (two
workbooks are both named `Gozareshat.xlsx`), and is proposed by
`--init-manifest` only when no collision exists.

The export's `sheetId` is positional (1…n in tab order in every one of the 28
workbooks) and shifts when a tab is inserted or deleted, so it is a **hint**,
stored in `location`, never part of a key. A tab rename is caught by
read-before-mint (the agent sees the existing record for the same
`spreadsheetId` and reuses its key) and reported by the dump diff (QF-29).

**QF-34. Read before mint; keys are immutable.** The agent receives the current
`facts/.index.json` and the entries in its department's and the universal
scope, and must reuse an existing key when the referent is the same — matching
«گودا لیوانی» on a form to «پنیر گودا لیوانی ##74» in the sheet is done there,
semantically, and never by a normaliser in the engine. `merge` refuses a new
key whose `title` byte-equals an existing title in the same kind and scope (an
exact-match guard, not identity; skipped for `note`, whose hash key already
makes a re-run a no-op), and the audit (§12) reports look-alike titles for a
human. Keys are immutable once written; a delta that carries a different key
for an existing natural key is a precondition failure. The two sanctioned key
changes are a workbook stub being adopted (QF-20) and the measurement keys
`merge` re-derives when that happens.

**QF-15. Natural key.** For every kind the natural key is
`(kind, key, canonical(scope))` **among open entries** — `valid_to == null`
and `retired == false`. Two open entries sharing a natural key is a
store-integrity failure (`apply` refuses; `audit` reports). A sheet record is
additionally identified by `(location.spreadsheetId, location.sheet)`, and
`merge` matches on that pair first so a re-derived key cannot create a
duplicate. `canonical(scope)` is
`{departments: sorted(unique(d)), branches: sorted(unique(b))}` with absent
lists as `[]`; two scopes are equal iff their canonical forms are equal, and
the index and the UI filters key on the canonical form.

**QF-16. Why not display names.** «انحراف», «مغایرت» and `Mismatch` appear in
different workbooks owned by different departments and denote one quantity; 38
of 151 item codes carry more than one label; the same column is spelled
`نوشابه قوطی (آشپزخانه)` in one branch tab and `نوشابه قوطی ( اشپزخانه )` in
the other. A later run using a different word would create a duplicate, and
duplicate rules do the most damage of any duplicate, because an ERP builder
facing two thresholds cannot tell which is authoritative. `aliases[]` captures
the synonyms for search and is never consulted for identity.

**QF-33. Branches and departments are registered.** The estate's branches
(`chalebagh`, `naharkhoran`) cut across its functional departments and the
department registry does not model them. The manifest carries a `branches`
array of `{code, name}`; `merge facts` refuses a scope naming an unregistered
branch, and checks `scope.departments` the same way against the existing
`departments/registry.json` — the registries are authoritative for both axes
even though they live in two files. The ui-backend exposes the branch list
(`GET /api/facts/branches`, read from the manifest) for the UI's filters.

**QF-4. `scope` is two lists; empty means universal.** `departments` and
`branches` are independent. A value that genuinely differs per branch is two
entries, each scoped to its branch. Where two branch workbooks carry the same
formula, the entries are related by `template_of` (§7, `rule`) so a copy and a
drift are distinguishable. A third axis recurs in the estate — the **sales
channel** (`salon`, `birunbar`, `peyk`, `personnel`, as in `Hesabdari!اهداف
فروش`). It is *not* a scope list: it is encoded in the key
(`sales_target_salon_chalebagh`) and, where a record splits columns by it, on
`fields[].group`. Adding it to `scope` later would be a key change, which is
why it is written down now.

**QF-43. Assigning scope.** A fact derived from an artefact takes the manifest
row's `departments`/`branches` (for a workbook) or the department of the
attachment directory (for field material) by default. A fact from a transcript
takes the run's department. The agent writes an **empty** scope only for a
fact whose statement contains no branch- or department-specific referent — the
Jalali conversion family, the unit table, a calendar rule; the bootstrap seeds
these once, under `management`, before any station run, so the four scripts
that each define `GREG_TO_JALALI` yield one universal rule, not four. A run
may **create** entries scoped to its own department or to none (and the stubs
QF-20 allows); it may **add sources, accounts and issues** to any entry —
that is how a cross-department contradiction surfaces, which is QF-2's whole
point. `merge facts audit` reports a non-empty-scope entry whose key already
exists at empty scope.

---

## 6. The envelope

Every entry in every fact file has the same envelope. The envelope is
`additionalProperties: false`; `data` is not.

```json
{
  "id": "F-00042",
  "kind": "rule",
  "key": "gozaresh_cb__pizza__declared_use",
  "title": "مصرف اعلامی پیتزا",
  "aliases": ["مصرف اعلام‌شده"],
  "statement": "مصرف اعلامی = موجودی اول شب + دریافت از انبار − موجودی آخر شب",
  "scope": { "departments": ["management"], "branches": ["chalebagh"] },
  "source": [
    { "type": "sheet", "ref": "attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.xlsx",
      "sheet": "پیتزا", "cell": "H6", "hash": "sha256:…",
      "run": "runs/facts/management/20260901-101500" },
    { "type": "voice", "ref": "meetings/transcripts/cooking-1405-06-01.txt", "lines": "40",
      "hash": "sha256:…", "run": "runs/facts/cooking/20260902-153000" },
    { "type": "process", "ref": "departments/cooking/processes/cooking-001.json", "node": "cooking-001-n010",
      "quote": "مصرف اعلامی از مانده اول شب، دریافت از انبار و مانده آخر شب محاسبه می‌شود",
      "hash": "sha256:…", "run": "runs/facts/cooking/20260902-153000" }
  ],
  "status": "disputed",
  "field_status": {},
  "accounts": [
    { "id": "a1f0c3d9", "field": "data/expr", "statement": "=MINUS(SUM(F6,E6),G6)",
      "value": "declared_use = start + received - end",
      "source": { "type": "sheet", "ref": "attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.xlsx", "sheet": "پیتزا", "cell": "H6" },
      "speaker_role": null, "status": "open" },
    { "id": "7be2a4c1", "field": "data/expr",
      "statement": "ببینید مصرف اعلامیشون در واقع تفاوت بین مانده اول شب و آخر شبشونه خب؟ که این میزان مصرف انبار ازش کم می‌شه.",
      "value": "declared_use = start - end - received",
      "source": { "type": "voice", "ref": "meetings/transcripts/cooking-1405-06-01.txt", "lines": "40" },
      "speaker_role": null, "status": "open" }
  ],
  "valid_from": "1404-09-01",
  "valid_to": null,
  "supersedes": null,
  "superseded_by": null,
  "retired": false,
  "issues": [],
  "processes": [{ "ref": "cooking-001" }],
  "updated_at": "2026-09-02T15:31:07Z",
  "data": {
    "inputs": [ { "key": "start",    "title": "موجودی اول شب",   "unit": "kg", "from": { "ref": "F-00031", "field": "start_stock" } },
                { "key": "received", "title": "دریافت از انبار", "unit": "kg", "from": { "ref": "F-00032", "field": "amount" } },
                { "key": "end",      "title": "موجودی آخر شب",   "unit": "kg", "from": { "ref": "F-00031", "field": "end_stock" } } ],
    "outputs": [ { "key": "declared_use", "title": "مصرف اعلامی", "unit": "kg", "nature": "observed",
                   "writes_to": { "ref": "F-00040", "field": "declared_use" } } ],
    "expr": "declared_use = start + received - end",
    "lang": "feel",
    "original_ref": "facts/originals/F-00042.txt",
    "calls": [], "port": false, "edge_cases": []
  }
}
```

The example's first account is the incumbent — the sheet formula — which
`merge` materialised when the second run disagreed (QF-17); the second is the
transcript's words, verbatim. `speaker_role` is `null` here because the
transcript labels the speaker only «گوینده مرد ۲»; roles come from the run's
participant list, never from transcript labels.

**Required envelope fields:** `id, kind, key, title, statement, scope, source,
status, retired, updated_at, data`. Everything else may be absent; absent
`valid_from`/`valid_to`/`supersedes`/`superseded_by` is `null`, absent
`aliases`/`accounts`/`issues`/`processes` is `[]`, absent `field_status` is
`{}`. The example's `status` is `disputed` because `data/expr` has open
accounts — nothing else marks it.

**`statement` is the entry's explanation** — a Persian sentence or short
paragraph in the agent's own words, required on every kind: what the entry
means and, where it matters, why («مصرف اعلامی = موجودی اول شب + دریافت از
انبار − موجودی آخر شب»; for a record, what it is and who fills it; for an
item, what it is). It is the first thing a reviewer reads before the one tick
of QF-24. It is distinct from `accounts[].statement`, which holds *verbatim
quotes* from sources, and it is a prose field (§11): never compared, never
disputed, changed only through `edit-fact`.

**QF-5. `source` is a list, with a hash.** A well-sourced fact cites several
places — the sheet formula *and* the meeting where it was explained. `type` is
one of `sheet | script | comment | validation | cf | photo | pdf | docx | voice
| process | chat`; `ref` is a path relative to `data-repo/` (`null` for
`chat`); `sheet`/`cell`, `lines` (`^[0-9]+(-[0-9]+)?$`), `page`, `function`,
and for `process` the `node` id plus the `quote` from its label or
description, are the typed locators; `run` is the run directory that first
cited the source,
stamped by `merge`. `hash` is the SHA-256 of the file at `ref`, computed by
`merge` (never by the agent — an LLM asked for a digest it cannot compute will
invent one) and `null` for `chat`. Resolution: a `ref` under
`attachments/sheets/**/*.xlsx` that is absent is reported by `check` as
"estate not present", never a precondition failure (the binaries are not in
git); any other unresolvable path fails `apply`. `.structure.md` and
`NAMED_FUNCTIONS.md` are read for orientation and may never appear in
`source[]`; `validate` enforces it.

**QF-6. `status` is epistemic, per field, and mandatory.**

| value | meaning | example from this estate |
|---|---|---|
| `confirmed` | someone stated it explicitly | «هر یک پرسش ۶۰ گرمه» (cooking-1405-05-26:146, roast-beef sandwich) |
| `inferred` | we derived it; nobody said it | 10 pieces per portion, from «۳۱۳ تا می‌شه ۳۱ پرس» (cooking-1405-06-01:14) |
| `informal` | stated as habit, no defined standard | «معمولاً وقتی به ۳۰۰ تا می‌رسه یا... عموماً ما این‌جوری می‌گیم. می‌گیم که برید چک کنید» (cooking-1405-06-01:27) |
| `disputed` | accounts conflict | the declared-use formula in the sheet vs the meeting |
| `unknown` | applies, is needed, has no answer | the deviation tolerance («۴، ۷ شاید جزو تلورانسمون باشه… منفی ۱۱۰ دیگه نمی‌شه مجاز», cooking-1405-06-01:11) |

Three of the five values are read off the entry itself, and only two are
written down — the ones nothing else in the entry can carry:

- **`unknown` is a `null` leaf.** The key is present with the JSON value
  `null`; a key absent from `data` altogether means the leaf does not apply
  — so an optional payload key (`identifier`, `template_of`, `divergence`,
  `grade`, `mirror_of`, `writes_to`, a pack factor that is per item) is
  **omitted**, never written `null`, when it does not apply. The rule is
  scoped to `data`; envelope fields such as `valid_to`, `supersedes` and
  `accounts[].speaker_role` use `null` for "none", which is not a gap. That is
  the whole of the present-but-unknown / absent distinction on disk.
- **`disputed` is an open account.** Every account carries its `field`, so
  "which field is disputed" is `accounts[]` with `status: open`.
- **`confirmed` is the default** for a stated, cited value and is never
  written.
- **`inferred` and `informal` are written**, in `field_status` — a sparse
  map from a field path (QF-7's grammar) to one of those two values, listing
  only the paths whose value nobody stated: the 10-per-portion factor derived
  from «۳۱۳ تا می‌شه ۳۱ پرس», the ~300 recheck threshold that is a habit. A
  typical entry has an empty map; a record with nineteen sourced columns and
  one inferred unit has one line, and the reviewer sees which.

The entry-level `status` is **derived** by `merge`, in this order:
`disputed` if any account is open; else `unknown` if any leaf is `null`;
else `informal`, then `inferred`, if the map says so; else `confirmed`. It is
stored only so the index and the UI can filter without loading payloads; a
`status` present in a delta is a precondition failure, and so is a
`field_status` value other than `inferred`/`informal` or a path that does
not exist. A record with nineteen sourced columns and one invented unit is
then a confirmed record with one unknown column, not a lie.

`accounts[]` holds competing statements — `{id, field, statement, value?,
unit?, source, speaker_role?, status: open | chosen | rejected}` — so a human
can resolve them from what was actually said. `id` is written by `merge`
(first 8 hex of `sha256(field|statement|value|source.ref|locator)`) so a
`resolve` command printed at the end of a run still names the right account
later. `speaker_role` is a role, never a name (ARD's names rule); when the
identity of a speaker matters, the transcript line is the sanctioned place,
reached through `source`.

The distinction that earns this field is between a value **absent because it
does not apply** and a value **present but `unknown`**, which blocks the ERP.
This must exist before the first entry is written: retrofitted later, every
field silently defaults to `confirmed` and which ones were contested is
recoverable only by re-reading every transcript. The same argument applies one
level down, which is why the field is per field from the start.

`status` is *not* human review. Reviewed-ness lives in `app.db` (§14) and no
`confirmed` boolean may be added to any document, for the reason
`ui-backend/inja_ui_backend/fingerprint.py` gives: a boolean would have to be
cleared correctly by three independent writers, and missing one leaves a mark
vouching for something stale. Resolving a dispute is a verb (§12) that marks
one account `chosen`, keeps the rest, and sets the field `confirmed`.

**QF-7. The run directory is the provenance; entries carry none.** Every
write happens under `runs/facts/{dept}/{stamp}/` — the facts run's own, the
one `edit-fact` creates for a chat instruction, or the one the ui-backend
creates for a UI action — and that directory is committed with its
`facts-delta.json` (exactly the paths the write carried), `id-map.json` and
`meta.json` (`origin: pipeline | chat | ui`, the actor, the inputs). "Which
run wrote this field" is answered by the deltas on disk; "where did this
value come from" by `source[]`, whose entries carry `run`; and `revert` works
from a run's delta (§12). A per-entry map of path → run was considered and
rejected: it would duplicate what the run directories already hold and would
have to be kept correct on every write. Path grammar, used by `field_status`,
`accounts[].field` and `resolve --field`: segments joined by `/`; an array
of keyed objects is addressed by the member's `key`; paths bottom out at
leaves — `title`, `scope`, `data/expr`, `data/fields/ing_1/unit`,
`data/rows/prod_61__ing_1/grams`, `data/outputs/dough_g/value`. Because keys
are ASCII, no escaping is needed.

**QF-8. A fact anchors to a process only through a node that names it.**
The envelope's `processes[]` is a list of `{ref}` to process ids and nothing
else — no node links (a restructure renumbers every node, so a node link
spends its life as an orphan) and no untyped fact-to-fact links (every
relation that means something has a typed edge: `inputs[].from`,
`writes_to`, `of`, `via`, `calls[]`, `mirror_of`, `template_of`, `derived`,
`reconciled_against`, `supersedes`). A process link is a claim and needs
evidence: the agent may add `{ref: "cooking-001"}` **only** when a node's
label or description in that process names the entry's referent — the
measurement, the record, the rule, the item — and it cites that node as a
`source` of type `process` with the node id and the words (QF-5). Never by
department, never by similarity, never "the process this probably belongs
to". `validate` refuses a `processes[]` entry that has no `process` source
naming that file, or whose cited node is not in the file. `process.schema.json`
does not change; a node does not learn about facts. The UI derives the
reverse index server-side (QF-39).

**Reporting a tombstone.** The process side never blocks a tombstone because
a fact points at the process — that would couple the layers the wrong way
round — but the user hears about it at the three moments that matter:

1. *At the tombstone.* `merge remove` and `merge restructure` (engine verbs,
   not playbooks) look up `facts/.index.json` after tombstoning and print one
   line per referencing entry — `facts: F-00042 «مصرف اعلامی پیتزا» →
   cooking-003 (heir cooking-017)` — a read-only lookup that writes nothing
   and prints nothing when the index is absent. `edit-process` Step 6 and
   `process-voice` Stage 9 each gain one sentence: relay those lines in the
   Persian report. That is the only change either playbook takes.
2. *In the UI, live.* When the ui-backend serves an entry or the list it
   checks each `processes[].ref` against the process's `tombstoned` /
   `superseded_by` and emits the row class «اشاره به فرایند بازنشسته» with
   the heir named — from the moment the tombstone lands, with no facts run.
3. *At the next facts run.* `merge facts audit` lists every such link and,
   where the process has a `superseded_by` heir, proposes the re-point as an
   approvable item at stage C; on approval it is applied like any other edit
   (a one-entry `apply` under that run). It is never automatic and never
   silently dropped.

A link whose cited node is gone while the process survives is reported and
shown the same way, minus the heir.

**QF-35. Lifecycle.** `valid_from`/`valid_to` (Jalali, §10), `supersedes`/
`superseded_by` (a `{ref}`), `retired`. A definition that legitimately changes
— the parmesan pack «۲۰۰ بود الان ۱۰۰ گرمی شده» (cooking-1405-05-26:155; the
hedged first mention at :152 is an account the run resolves against the
restatement) — is a successor entry on `item.pack.size`, not a dispute; a
discontinued item or a replaced form is retired, never deleted (INV-4). A
retired entry leaves the red rollup; edges into it stay resolvable.

**QF-36. `issues[]` lives on the envelope and is anchored in time.** Any kind
may carry a defect in itself *as implemented*, distinct from the definition
being wrong: a sheet whose history switched units, a script with an
argument-shift bug, a report that computes a negative declared use because the
source tab has two placeholder columns. Shape:
`{kind: scale | unit_kind | column_shift | junk | bug | cross_record |
code_collision, from_date?, to_date?, field?, description, fix?: {op:
multiply | divide | shift_columns | ignore, factor?}, affects: [{ref}]}` —
`factor` required for `multiply`/`divide`. Row numbers are not anchors —
duplicate date rows and `SEQUENCE` spills move them — dates are. An issue is
**not** a status: the definition is confirmed, the history is broken, and
conflating the two makes both unusable.

**QF-37. One reference notation.** Every reference to another entity, anywhere
in the envelope or the payload, is an object with a `ref` key and optionally
`field` and `row` — `{"ref": "F-00031"}`, `{"ref": "F-00031", "field":
"end_stock"}`, `{"ref": "F-00090", "field": "grams", "row": "prod_61__ing_1"}`
— and nothing else: no bare ids, no dotted strings, no other keys in the
object. `merge` rewrites temp ids by shape (any object whose keys are a subset
of `{ref, field, row}` containing `ref`) and the audit finds every dangling
edge with one walk. The rewriter and the audit discriminate on the id prefix:
a `ref` matching `^F-[0-9]{5}$` or `^T-[0-9]+$` resolves against `facts/`; one
matching the process grammar (`processes[]` only) resolves against
`departments/**`;
anything else is a precondition failure. Where a `field` is present it must be
declared by the target (a record's `fields[].key` or `header_fields[].key`, a
rule's `outputs[].key`), and where a `row` is present it must be a declared
`rows[].key` of that record — except when the target is a stub, in which case
the edge is recorded as *deferred* and becomes checkable when the stub is
filled. A `{ref}` to a rule with exactly one output means that output. One
exception, stated because the row-key join (QF-32) needs a scalar: a cell of
a `refItems` column holds the target item's **key**, not a `{ref}` object; a
delta may write a temp id there and `merge` substitutes the key it minted for
that id; `validate` rejects a cell value matching no open `item` in the
column's declared namespace, and `audit` walks these cells beside the `{ref}`
edges, reporting a cell whose item is retired or gone.

---

## 7. The five kinds

**QF-9.** Five kinds cover the definitional shapes this survey found
load-bearing in the estate; Appendix A lists 31 of them with the fit each one
gets and what, if anything, is lost. `note` exists because the next department
may bring a shape the survey missed; a sentence claiming the taxonomy is
closed would later be cited to force a new shape into an ill-fitting kind.

Each payload is `additionalProperties: true` with a `required` list; the
required list is what rejects a wrong-kind payload.

### `item` — a thing counted, weighed, or priced

Required: `category`, `unit`.

```json
"data": {
  "code": "##1", "code_absent": false,
  "category": "ingredient",
  "group": "cheese",
  "state": "raw",
  "unit": "g", "unit_raw": "گرم",
  "units": [ { "pack_unit": "carton", "factor_to_base": 10000 } ],
  "pack": { "size": 24, "unit": "pcs" },
  "tracked": [ { "record": { "ref": "F-00031" }, "value": false, "reason": "ارزش ریالی پایین — سیاست ردیابی" } ]
}
```

`category`: `ingredient | product | packaging | consumable | place | other`.
`state`: `raw | cooked | frozen | prepared`, absent when not applicable;
`grade`: free text, absent when not applicable; `group`: a minted key for
the menu taxonomy. `code` is kept verbatim
because the ERP will want it; the estate's own lookup (`getValueById`) matches
codes by substring, so `#1` matches `#10` and `#100` too, and the ERP must not.
A code with two referents (`#27`) is handled by QF-32. `units[]` gives each
pack level its `factor_to_base`, a number or — where the estate says the
factor varies, as 30 bacon slices weighing 900–980 g — a `{min, max}` range;
a rule edge that relies on a ranged factor needs a `via` conversion rule
naming which end it takes. `state` and `grade` exist because prep and
warehouse items are stage-specific and carry no code.
`tracked` records the "we do not measure X, because…" content of the
transcripts as data. A `place` (انبار، آماده‌سازی، ایستگاه، سردخانه) is an
item so that a movement (below) can name it; a location kind is deliberately
not introduced (§18).

### `record` — a persistent place numbers are written, or a table of definitions

A sheet tab, a paper form, an external system of record — or a reference
table whose rows are themselves definitions (§9). Modelled on Frictionless
Table Schema. Required: `medium`, `role`, `location`.

The blank form «مانده شب فرنگی و برگر» (photo 1), which prints no unit:

```json
"data": {
  "medium": "paper",
  "role": "log",
  "location": { "path": "departments/cooking/attachments/photo_2026-08-29_14-23-51.jpg" },
  "blank_master": true,
  "grain": "one row per item, one sheet per shift",
  "cadence": "nightly",
  "day_boundary": "01:15",
  "header_fields": [ { "key": "date", "title": "تاریخ" }, { "key": "operator", "title": "نام متصدی" } ],
  "fields": [
    { "key": "row_no", "title": "ردیف", "type": "integer" },
    { "key": "item", "title": "نام کالا", "type": "string", "refItems": { "namespace": "##", "resolved_by": "title" } },
    { "key": "start_stock", "title": "مانده اول شب", "type": "number", "unit": null, "filled_by": "مسئول واحد" },
    { "key": "received", "title": "درخواست دریافتی", "type": "number", "unit": null,
      "constraints": { "readOnly": true }, "description": "خانه‌ی سایه‌دار — «چیزی ننویسید»" },
    { "key": "end_stock", "title": "مانده آخر شب", "type": "number", "unit": null },
    { "key": "delta", "title": "اختلاف روز", "type": "number", "unit": null, "derived": { "ref": "F-00051" } }
  ],
  "rows": [ { "key": "burger", "title": "برگر" }, { "key": "mini_burger", "title": "مینی برگر" } ],
  "signatures": [ { "role": "مسئول واحد", "row_range": "1-5" }, { "role": "انبار دار", "row_range": "6-10" } ],
  "primaryKey": ["date", "item"],
  "foreignKeys": [],
  "approved_by": "انبار دار"
}
```

— the four `"unit": null` are the point: the form prints no unit, an
inferred gram would be fabrication, so the unit is written `null`, which *is*
`unknown` (QF-6) and counts
in the entry's red counts (QF-6).

The requisition form «درخواست کالا بخش کانتر آشپزخانه» (photo 2) adds what a
sheet never needs — sections with their own document numbers, per-row units
carrying pack sizes, a weekday-conditional row, an open row:

```json
"sections": [ { "key": "direct_use", "title": "مصرف مستقیم", "doc_number_field": "doc_no" },
              { "key": "store_to_store", "title": "ح انبار به انبار", "doc_number_field": "doc_no" },
              { "key": "undocumented", "title": "بدون سند", "doc_number_field": "doc_no" } ],
"rows": [ { "key": "burger_box", "title": "جعبه برگر", "unit": "carton", "unit_raw": "کارتن ۱۰۰تایی", "section": "direct_use" },
          { "key": "staff_sugar", "title": "قند پرسنلی (پنجشنبه‌ها)", "unit": "pack", "section": "direct_use", "when": "thursday" },
          { "key": "off_list", "title": "درخواست خارج از لیست", "section": "undocumented", "open": true } ]
```

And a reference table — the Italian-pizza BOM tab of `Mavade Avalie`, whose
rows carry the definitions themselves:

```json
"data": {
  "medium": "sheet",
  "role": "reference",
  "location": { "spreadsheetId": "15M2ovUm…", "sheetId": 2, "sheet": "پیتزا ایتالیایی", "hidden": false },
  "grain": "one row per (product, ingredient)",
  "fields": [
    { "key": "product",    "title": "محصول",   "type": "string", "refItems": { "namespace": "#",  "resolved_by": "code" } },
    { "key": "ingredient", "title": "ماده اولیه", "type": "string", "refItems": { "namespace": "##", "resolved_by": "code" } },
    { "key": "grams",      "title": "گرم",      "type": "number", "unit": "g" }
  ],
  "primaryKey": ["product", "ingredient"],
  "rows": [
    { "key": "prod_61__ing_1",  "product": "prod_61", "ingredient": "ing_1",  "grams": 250 },
    { "key": "prod_61__ing_26", "product": "prod_61", "ingredient": "ing_26", "grams": 280 }
  ],
  "reconciled_against": [
    { "cell": { "field": "grams", "row": "prod_61__ing_26" }, "against": { "ref": "F-00093", "field": "dough_g" } }
  ]
}
```

`medium`: `sheet | paper | external | native` — `native` for a table that has
no artefact behind it because this store is its origin (the unit registry,
QF-40). `role`: `log | reference | mirror | report | config`. `cadence`: `nightly | shift | daily | weekly | monthly |
ad_hoc`. `fields[].type`: `string | number | integer | boolean | date`
(Frictionless). `constraints` admits `enum`, `readOnly`, `required`,
`minimum`, `maximum` and nothing else. `refItems` is `{namespace: "#" | "##",
resolved_by: "code" | "title"}`; a cell in a `refItems` column stores the
resolved item **key**, never the printed code or label — that is what makes
the row key derivable and the ERP's join unambiguous; the printed text is
recoverable from the dump and, where it disagrees with the resolution, the
disagreement is an `accounts[]` entry on that cell. `header_fields[].key` and
`fields[].key` share one namespace and must be disjoint, because `primaryKey`
and `foreignKeys[].fields` may draw from both — a paper form's date is
captured once per sheet, not per row, and is still half the natural key — and
neither may take one of the names a row object reserves for its own structure
(`key`, `title`, `unit`, `unit_raw`, `section`, `when`, `open`, `retired`,
`valid_to`, `supersedes`), because a reference table's row carries its column
values as siblings of those; `validate` enforces the reservation. Every
member of `primaryKey` and `foreignKeys[].fields` must be declared, every
`rows[].section` must name a declared `sections[].key`, every other member of
a row object must be a declared `fields[].key`, and on a `role: reference`
record every declared field that is not `derived` is present on every open
row — `null` where the source cell is empty. `rows[]` is one field for two
uses: a log's fixed rows carry a key, a title and whatever the form prints
per row; a reference table's rows carry a value for each declared column, and
each cell is a leaf with its own state — `null` when unknown, an open
account when disputed, a `field_status` line when inferred
(`data/rows/prod_61__ing_1/grams`). A row has a lifecycle of its own (§9):
`retired`, `valid_to` and `supersedes` on the row object. A two-row banded
header is carried on `fields[].group` (`{key, title}`); where the band is a
branch, the rules reading those columns take that branch in `scope` — this is
how a branch axis that lives in a header reaches QF-4. `grain`, `method`,
`exceptions`, `reason`, `why`, `fields[].description` and
`issues[].description` are deliberately free Persian prose, like the
envelope's `statement` — the prose class of §11 — and that is the whole
list.

`location` is always an object: `{path}` for paper; `{spreadsheetId,
sheetId, sheet, hidden}` for a sheet (`sheetId` a hint — QF-32); for an
`external` record (the POS, supplier invoices, the accounting document
series) `{identifier_scheme: {authority, format, example}}` so the graph's
roots do not dangle; and `{}` for a `native` record, the only record whose
`location` is empty. A tab or form section that records a transfer rather
than a state carries `movement: {from: {ref}, to: {ref}, reason}`, whose ends
are `place` items.

The estate's cross-workbook graph is carried twice, deliberately:
structurally on `foreignKeys[]` — `{fields: [...], reference: {ref},
reference_fields: [...], transform?: {ref}}`, with composite field lists on
both sides and a `transform` for the date-encoding join the estate reconciles
through `IS_COMBINED_PERSIAN_DATE` — and operationally on the rule that
performs the pull. A hidden one-formula `IMPORT_FROM_SHEET` tab is a record
with `role: mirror`, `mirror_of: {ref}` and no `fields[]`, so a
source→mirror→report chain collapses on read; a tab with no cells produces no
record.

**QF-10. Excel built from Excel is a first-class relation.** `Gozaresh
markazi` holds almost no data of its own; it pulls from the station, warehouse,
sales and ingredient workbooks through `IMPORT_FROM_SHEET`. That dependency
graph *is* the data flow and is the single most useful thing the ERP builder
inherits. The chain is: a `definedName` (`SheetsFileId_Pizza`) → a cell in the
hidden id tab (spelled `SheetsFileIDs` in some workbooks and `SheetsFileIds` in
others) → a Drive id → a manifest row; the sheet name is a caller-local `LET`
binding. `IMPORTRANGE` itself appears only inside the LAMBDA body.

**QF-11. History defects go in `issues[]`** (envelope, QF-36). `Pitza` holds
`39.158` (kg) on 8 Azar and `35000` (g) on 16 Azar with no marker; the
warehouse ledger switched the other way five months later. Per-column `unit`
fixes the definition; `issues[]` says where the history violates it, and at
migration time that is the difference between importing correctly and
importing off by a factor of a thousand.

### `measurement` — what is captured, by whom, into which record field

Required: `quantity`, `unit`.

```json
"data": {
  "of": { "ref": "F-00003" },
  "quantity": "mass", "unit": "g",
  "method": "ترازو؛ اقلام کارتنی بر اساس تعداد کارتن × وزن اسمی",
  "when": "پایان شیفت", "by": "سرلاین",
  "writes_to": { "ref": "F-00031", "field": "end_stock" },
  "exceptions": "آرد وزن‌کشی نمی‌شود؛ ضایعات زیر ۲۰ گرم ثبت نمی‌شود"
}
```

`quantity`: `mass | count | volume | duration | money | ratio | other`. A
measurement that writes nowhere (a verbal report) omits `writes_to` and has a
minted key.

### `rule` — a computation, a decision, or a constant

Required: `inputs`, `outputs`; and `lang` together with `expr` or `original`
when `inputs` is non-empty. A constant carries no `lang`.

**A constant is a rule with no inputs.** What v1 called a `parameter` is a rule
whose `inputs` is empty, whose `expr` and `lang` are omitted, and whose
outputs each carry `value` or `range`. The boundary between "a value a rule
consumes" and "a rule" was the one place two runs could classify the same
evidence differently, and it carried the weakest key and a reverse edge
(`applies[]`) that the consuming rule's `inputs[].from` already expressed.
"List the ERP's settings table" is `inputs == []`.

```json
"data": {
  "inputs": [],
  "outputs": [ { "key": "tolerance_g", "title": "تلورانس هر واحد", "unit": "g", "per": "unit_sold", "nature": "limit", "value": 5 } ],
  "calls": [], "port": false, "edge_cases": []
}
```

— the per-unit tolerance of the Chalebagh pizza report, key
`gozaresh_cb__pizza__deviation_tol__tolerance_per_food_gr`, read as the
literal in `LET(tolerancePerFoodGr, 5, …)` at `پیتزا!L6` and consumed by that
column's rule through `inputs[].from: {ref}`; row 8's `4` is a second
constant, and the Naharkhoran report's are `template_of` instances. A BOM
gram cell is never a constant: it is `data/rows/prod_61__ing_26/grams` on the
reference record (§9). Ranges are `range: {"min": 70, "max": 90}` on the
output. `per` is a minted key naming the basis (`pizza`, `portion`,
`kg_input`). `nature` is `standard | target | observed | limit` — the estate
keeps a prescribed dough weight and an observed conversion beside each other,
and they must not collide. A constant stated as a habit carries
`field_status.data/outputs/<key>/value: informal`; the threshold nobody
stated is a constant whose output `value` is `null` (QF-6). A constant read
from a formula literal is its own rule, one per formula group, keyed by
QF-32.

A computed rule with several outputs — the butchery yield stated in a
warehouse cell comment («29.200Kg راسته گوساله بوده که تبدیل به: … 10.400Kg
استیک رولی … 5.415Kg فیلادلفیا … 11.200Kg خرده راسته … 1.770Kg ضایعات»,
`Anbar!خروجی انبار به آماده سازی`, comment on L452):

```json
"data": {
  "inputs": [ { "key": "input_kg", "title": "راستهٔ ورودی", "unit": "kg", "from": { "ref": "F-00071", "field": "raste_in" } } ],
  "outputs": [ { "key": "steak_roll",   "title": "استیک رولی",  "unit": "kg", "nature": "observed", "share": 0.356, "writes_to": { "ref": "F-00071", "field": "steak_roll_out" } },
               { "key": "philadelphia", "title": "فیلادلفیا",   "unit": "kg", "nature": "observed", "share": 0.185, "writes_to": { "ref": "F-00071", "field": "philadelphia_out" } },
               { "key": "trimmings",    "title": "خرده راسته",  "unit": "kg", "nature": "observed", "share": 0.384, "writes_to": { "ref": "F-00071", "field": "trimmings_out" } },
               { "key": "waste",        "title": "ضایعات",      "unit": "kg", "nature": "observed", "share": 0.061, "writes_to": { "ref": "F-00071", "field": "waste_out" } } ],
  "expr": "steak_roll = input_kg * 0.356; philadelphia = input_kg * 0.185; trimmings = input_kg * 0.384; waste = input_kg * 0.061",
  "lang": "feel",
  "original_ref": "facts/originals/F-00088.txt",
  "calls": [], "port": false, "edge_cases": []
}
```

is **one** rule with a `share` per output and
`field_status.data/outputs/<key>/share: informal` on each of the four, because
the shares vary lot by lot (preparation-1405-06-02-02:107).
The envelope example in §6 shows the single-output shape.

- `inputs[].from` is a record field (`{ref, field}`), a single cell of a
  reference table (`{ref, field, row}`), another rule's output (`{ref}` or
  `{ref, field}`), or the literal `"operator"` / `"calendar"` for values chosen
  at run time — the ordering script's event selection has no other
  representation. `via: {ref}` names the conversion rule on an edge whose
  units differ (§10). A rule that explodes sales into ingredient use reads the
  whole BOM (`{ref, field}`), which is the right semantics for it.
- Every `inputs[]` and `outputs[]` member carries `key` (ASCII — the
  identifier `expr` uses) and `title` (Persian — what the UI shows; QF-42).
  `outputs[]` members further carry `unit`, `nature`, optional `of` (`{ref}`
  to an item), `per`, `writes_to`, `share`, and — on a constant — `value` or
  `range`. `share` is a fraction in (0, 1]; where shares are
  present on more than one output they must sum to 1 ± 0.001 (`validate`). A
  sheet-writing script (`saveOrders`, `updateFoodCount`) writes rows into a
  record: `writes_to` with no `field`. `identifier` (a sibling of `outputs`,
  `null` otherwise) holds the source function name for a named function or
  script.
- `lang` values: `feel`, `table`, `text`, `sheets`, `gs`.
  - **`feel`** is the FEEL subset: numeric literals, identifiers from
    `inputs[].key` and `outputs[].key`, `+ - * /`, comparison, `and or not`,
    `if … then … else`, `min max sum abs round`, `;`-separated assignments for
    multi-output rules, calls to the rule keys in `calls[]`, and **one
    aggregate form** for a rule that reads a whole table: `sum over <input>
    of (<a> * <b>)`, where `<input>` is an input whose `from` is `{ref,
    field}` with no `row` and `<a>`/`<b>` are columns of that table or
    inputs joined on the row key — this is how "standard use = Σ sales ×
    grams per product" over the BOM is written in `expr` rather than left
    to the script. No dates, contexts, ranges or lists beyond that form.
    `validate` tokenises every `expr` and asserts identifiers ⊆ inputs ∪
    outputs ∪ whitelist ∪ calls, and that an aggregate's `<input>` is a
    whole-table edge.
  - **`table`** is `{inputs: [keys], outputs: [keys], rows: [{when, then}],
    hit: first | unique | collect, aggregate?: sum | product | min | max,
    default}`. Weekday coefficients (`getWeekDayCoefficient`: 1.1 Wed, 1.2
    Thu, 1.15 Fri, else 1) are `hit: first` with `default`; the four
    multiplied event factors are `hit: collect, aggregate: product`.
  - **`text`** — a policy with no formalisable expression («معیار ما برای
    اندازه‌گیری مواد، آیتم‌ها، میزان اهمیت و ارزش ریالیشونه»,
    cooking-1405-05-26:55). Its threshold is a separate constant rule,
    typically `unknown`.
  - **`sheets`** / **`gs`** — verbatim forms kept only in `original_ref`.
- The delta carries `original` (the verbatim text); `apply` moves it to
  `facts/originals/{id}.txt` and replaces it with `original_ref` (§4, QF-31).
- `template_of` + `divergence` (`none | intentional | drift | unknown`) relate
  a branch instance to its template (QF-4); the audit reports instances whose
  `expr` differs from their template.

**QF-12. `port: true` marks a function the ERP must reproduce exactly**, and
carries `edge_cases[]` of `{input, expected, why}`. The criterion is "any
function appearing in a cited `expr` or its transitive `calls[]`", which today
means the whole Jalali conversion family in both directions,
`GET_ROW_BY_PERSIAN_DATE`, and `getValueById` — substring header match on
`indicator + id`, first hit wins, reads only `data[1]` (the first result row),
returns the string `"ID not found"` when no header matches. The estate has two
`getValueById` bodies that differ in their null case (`Gozaresh markazi.gs` /
`Gozaresh naharkhoran.gs` map `"#N/A"` → 0; `Gozareshat.gs` maps `""` → 0):
they are two rules — the second keyed with a `__{short}` suffix and
`template_of` the first with `divergence: drift` (QF-32) — each with its own
`edge_cases[]`, never one disputed rule. A boolean beside a name is the prose
description this decision exists to reject; the edge cases are the content.

### `note` — the escape hatch

Free `data` (no required keys); the `statement` every entry carries is here
the whole content; `title` = the first 60 characters of `statement`, key from
the statement hash (QF-32) so a re-run over
the same delta is a no-op — a re-worded statement is a new note, which the
audit's recurring-shape report catches. **QF-13. The facts audit owns
promotion.** `merge facts audit` (§12) reports recurring note shapes beside its
other findings, for human approval in the playbook's review stage; the
approved item runs `merge facts promote`, which keeps the id, changes `kind`,
recomputes the key by the QF-32 table, and treats a key collision as a
precondition failure. `consolidate` is not involved: it is single-department by
design and its output schema cannot name an `F-` id.

---

## 8. The classification rule

**QF-14.** Evaluate **in order; first match wins.** Specific tests precede
general ones.

1. Converts one input into several outputs with shares → one **`rule`** with
   `outputs[]`.
2. Varies by condition → one **`rule` with `lang: table`**, never several
   constants.
3. Decides *which measurements exist at all*, or how something is handled with
   no formula → **`rule` with `lang: text`**.
4. Is a controlled vocabulary for a column → **`record.fields[].constraints.enum`**
   on that record, not a fact of its own.
5. Is a threshold that exists only as a colour → **`rule`** whose output is a
   flag, with the threshold as a constant rule (in this estate every
   conditional-format threshold is a sign test at 0 or a text match, so the
   constant is usually `0` or an enum member).
6. Is presented **as a table** in its source — rows × columns keyed by items
   or codes: a BOM tab, the menu dictionary, a price list → a **`record`**
   with `role: reference` and the table in `rows[]` (§9), never one constant
   per cell.
7. Has inputs and produces an output → **`rule`**.
8. Is a value stated singly — a literal in a formula, a number in a sentence
   → **`rule` with no inputs** (a constant).
9. Is a place numbers are written, or a system they come from → **`record`**.
10. Is a thing that gets counted, or a place stock sits → **`item`**.
11. Says who captures what, when, into which field → **`measurement`**.
12. Is a staff-written gap («نیازمندیها و مشکلات» rows, «آیتم بال پرسنلی در
    گزارش قرار داده نشده») → an **`unknown` field** on the entry it concerns,
    with the row as its source.
13. None of the above → **`note`**.

Applied to the ambiguous cases: weekday coefficients → 2, not four constants
(three conditions plus a default); the tracking policy → 3, with its threshold
as a constant; the butchery yield → 1; the 84-entry code→category dictionary
→ 6; the quality scale `خوب/متوسط/بد` → 4; «۲۵۰ گرم پنیر» said in a meeting
about a product that has a BOM row → not a new constant but a second source
(or account) on that **cell** — `data/rows/prod_61__ing_1/grams` — by QF-34;
par levels → 8 (`nature: target`, `value: null` — the «حداقل (۳ روز)»/«سطح
هدف (۵ روز)» columns of `مواد عادی` are headers with no formula and no data).

---

## 9. Reference tables

The BOM in `Mavade Avalie` is 12 tabs and ~1,200 cells of definitions. They
are not 1,200 entries: the **shape of the source decides**. Where the estate
presents definitions as a table, the fact is one `record` with `role:
reference` and the table is its `rows[]` (§7); where a value is stated singly,
it is a constant rule (§8). There is no size threshold — a two-row reference
tab in `Mavade Avalie` is a record with two rows and the 1,200-cell BOM is a
record with 1,200 cells; the `Table_Ingredients_*` copies in the report
workbooks are mirrors and carry none — and a value said in a meeting that
belongs to a table cell is attached to that cell as a source or an account,
not minted beside it. Rows of a reference table are keyed by the `__`-join of
the `primaryKey` values (QF-32; a log's fixed rows are minted), so each cell
is a leaf the write ladder (§11) reaches at
`data/rows/prod_61__ing_1/grams`, and a meeting that says 250 g
where the BOM says 280 g is a dispute on that cell. The tabs whose cells are
dumped for this are the ones a manifest row names in `reference_tabs[]`
(Appendix B) — proposed by the agent with a reason each and confirmed by a
person at Gate M, not left to a heuristic.

**A row has a lifecycle, like an entry.** A row is retired, never removed:
`rows[]` members admit `retired`, `valid_to` and `supersedes`. When a re-dump
of a reference tab no longer carries a row the store holds, the `quantify`
agent writes `retired: true` with today's `valid_to`; a row whose derived key
changes (a corrected `primaryKey` cell) is the old key retired and the new
appended, linked by `supersedes` on the row. `merge facts audit` reports store
rows absent from the latest dump and retired rows with live `{ref, field,
row}` edges into them. Retired rows are omitted by `export`, excluded from the
red rollup and QF-44's readiness test, and their `null` cells and
open accounts leave the red set.

What the describing record adds that a bare table cannot carry: `mirror_of` on
every cached copy — the BOM exists once in `Mavade Avalie` and three more
times as `Table_Ingredients_*` mirrors in `Gozaresh markazi`, `Gozaresh
naharkhoran` and the control `Gozareshat` — so exactly one table is
authoritative and mirrors carry no rows; and `reconciled_against[]`, a list
of pairs `{cell: {field, row}, against: {ref, field?}}` where `cell` names a
column and a row of *this* record and `against` is the output of a **constant
rule** — a report formula's literal is that formula's constant (§7), which is
what must agree with the table: the report multiplies single-pizza dough by 1
where the BOM says 180 g, and without this edge nothing can surface it.
`validate` requires `cell` to be declared here and `against` to resolve to a
rule with no inputs; the audit compares the two with a 1 % tolerance.

The ERP reads the rows from `records.json`; `merge facts export --record
<key>` emits a CSV of them on demand as a derived view that is never
committed.

---

## 10. Units, quantities and time

**QF-40. Units are a table.** The unit registry is a `record` with `medium:
native`, `role: config`, key `units`, universal scope, whose `fields[]` are
`symbol` (string), `dimension` (string), `factor_to_base` (number, nullable)
and `unit_title` (string), with `primaryKey: ["symbol"]`, so a row reads
`{key: "g", symbol: "g", dimension: "mass", factor_to_base: 1, unit_title:
"گرم"}` — seeded with `g, kg` (mass); `ml, l` (volume); `pcs, slice,
portion` (count); `carton, pack` (pack, `factor_to_base` null — it is per
item); `min, hour, day` (duration); `irr` (money); `percent, ratio`
(dimensionless). It is written by the bootstrap's own `merge facts apply` run
like any other entry (§13), and it must exist before any entry that cites a
unit. Every `unit` field takes a row key from it and every place the estate
wrote a unit keeps the verbatim string in `unit_raw`. A new symbol is a row
added through `edit-fact` like any other definition; `apply`'s failure
message names the missing symbol, and `audit` reports `unit_raw` strings no
row covers. Pack sizes are not units — they live in `item.pack` and
`item.units[].pack_unit`, which the unit check does not walk.
`record.fields[].unit` is authoritative; `item.data.unit` is a default
excluded from the disagreement test. `validate` checks that a rule input's
unit equals its source's unit — a record field's (`{ref, field}`); a table
cell's, which is its column's `fields[].unit` (`{ref, field, row}`); or the
named output of any other rule, constant or computed (`{ref}` or `{ref,
field}`) — unless the edge names a `via` conversion rule; a `from` of
`"operator"` or `"calendar"` has no source, so its declared `unit` is taken as
given. v1's own example wrote grams into a field and read kilograms out of it.

**QF-41. One stored date type.** Business validity is Jalali, because that is
what every speaker and every sheet uses; it is stored as Latin-digit
`YYYY-MM-DD` (day) or `YYYY-MM` (month), `pattern`-enforced by `validate`, in
`valid_from`, `valid_to` and `issues[].from_date/to_date`. Persian numerals
appear only in prose fields. `updated_at` and run stamps stay ISO-8601 UTC.
This amends the convention line in `schemas/README.md`, which says Jalali is
UI-only, and says why. The Latin-digit Jalali spelling
`upload-bot/upload_bot/naming.normalize_date` already produces is the format;
it is not reused as code (it lives in the bot's package, needs `jdatetime`,
and validates day precision only).

---

## 11. Write rules

**QF-17. Write rules, identical for every caller — there is no owner.** Applied
per **leaf field**, by field class:

*Prose fields* (`statement`, `grain`, `method`, `exceptions`, `reason`,
`why`, `fields[].description`, `issues[].description`): filled once, in
Persian, by whichever run first writes the entry; never compared, never
disputed, never rewritten by a later run — a second run's different wording
is discarded — and changed only through `edit-fact`. Free text cannot be
"equal" between two runs, so it is not allowed to raise a dispute.

*Scalar fields* (`title`, an output's `value`, a column's `unit`, a table
cell, `expr`, …):
- absent → create;
- present and empty → fill;
- present, filled, equal (numbers compared as numbers, strings byte-equal) → no
  write;
- present, filled, different, and the incoming value carries a later
  `valid_from` → **supersede**: close the existing entry's `valid_to`, create
  the successor with `supersedes`, link back;
- present, filled, different, no later `valid_from` → on the first dispute for
  this path, materialise the incumbent as an account (its value and the
  `source[]` entry that carried it), then append the challenger — the field
  is disputed by virtue of its open accounts, nothing else is written.
  **Never overwrite.**

*Pure union fields* (`source[]`, `aliases[]`, `processes[]`): set-union on a
dedup key — `source`: `(type, ref, locator)`; `processes`: the ref.

*Keyed collections* (`accounts[]`, `issues[]`, `record.fields[]`,
`header_fields[]`, `sections[]`, `rows[]`, `signatures[]`, `foreignKeys[]`,
`inputs[]`, `outputs[]`, `calls[]`, `edge_cases[]`, `reconciled_against[]`,
`tracked[]`, `units[]`): the dedup key **matches** a member — `accounts`:
`(field, statement, value, source.ref, locator)`; `issues`: `(kind, field,
from_date)`; `foreignKeys`: `(fields, reference)`; `signatures`: `role`;
`edge_cases`: `input`; `reconciled_against`: `cell`; `tracked`:
`record.ref`; `units`: `pack_unit`; lists of refs (`calls`): the ref; every
other keyed object: `key` — a matched member is then merged leaf
by leaf with the scalar ladder (so a second run carrying the same column with
a different `unit`, or the same BOM row with a different `grams`, disputes
that leaf, as QF-2 requires), and an unmatched member is appended. An account
already recorded is a no-op, so re-reading the same transcript never
re-disputes a resolved field.

*Object fields* (`inputs[].from`, `via`, `writes_to`, `derived`, `mirror_of`,
`location`, `pack`, `movement`, `range`, `refItems`, `constraints`,
`identifier_scheme`, `fix`): merged key by key with the scalar ladder per
leaf.

*Stubs* (QF-20): the owning run **adopts** a stub outright — clears `stub`,
overwrites `title` and `location`, keeps `source[]`; `status` is re-derived
as always.

This is the process side's fill-empty discipline carried on the entry instead
of in a separate queue, and it satisfies INV-4 and INV-5 by construction:
nothing is deleted and nothing filled is overwritten without a human verb.

---

## 12. Verbs

All under `merge facts`, deterministic, `DATA_ROOT`-relative, exit 2 on a
failed precondition with nothing written — the contract every existing verb
keeps, so a pipeline that retries on exit 2 cannot double-apply. The writing
verbs (`apply`, `resolve`, `retire`, `revert`, `promote`,
`repair-foreign-keys`, `repair-source-refs`) each take `--run
<run_dir>` (the run directory that records the write, QF-7) and write what
they did into it; the reporting verbs (`audit`, `check`, `export`) take no
`--run` and write nothing under `DATA_ROOT`.

| verb | does |
|---|---|
| `apply --delta <path>` | precondition pass over the whole delta: schema; keys (pattern, immutability, title guard); every `{ref}` resolvable and every `field`/`row` declared or deferred (QF-37); branches registered in the manifest and departments in `departments/registry.json`; unit symbols declared by the `units` record; no `status`, `hash` or `original_ref` present; no unknown kind; scope creation rule (QF-43). Then upsert: allocate `F-` ids only on a key miss, in the order `item → record → measurement → rule → note` so a hit is found before a miss mints; publish one delta-wide temp→real map to `{run_dir}/id-map.json`; rewrite every `{ref}` and every `refItems` cell in a second pass; derive measurement keys, and row keys wherever QF-32's condition holds (a minted row key is kept as written); apply §11; move `original` to `originals/`; compute source hashes; derive `status`; write the five files and `.index.json`; run `validate facts` |
| `resolve --id F-… --field <path> --account <id>` | mark that account `chosen`, the rest for that field `rejected`; with no open account left the field is no longer disputed and `status` is re-derived |
| `retire --id F-… [--heir F-…]` | `retired: true`, `valid_to` today, `superseded_by` the heir; refuses if the heir is retired |
| `revert` | read the run's `facts-delta.json` and `id-map.json`; remove every entry the run created and restore every path it wrote from the commit before the run's; a successor the run created is removed and its predecessor's `valid_to` reopened; refuses (exit 2) if any later run's delta touched one of the same paths |
| `promote --id F-… --kind <kind> [--key <key>]` | keep the id, change `kind`, set the key — recomputed by QF-32 where that table derives one, otherwise taken from `--key`, which is then required — re-derive `status`; a missing `--key` where the table mints, a key failing the pattern, a key collision, or a non-`note` source is a precondition failure |
| `repair-foreign-keys` | drop every `foreignKeys` member that names neither the columns it joins on nor the entry it points at, and the collection with the last of them; touches no other key and re-derives no status; writes nothing at all when the store is already clean, so a second run leaves no snapshot for `revert` to act on. The one verb that removes: §11 has no action that takes a key back out, and QF-2 admits no writer but this one, so a collection the store should never have held has no other way out of it |
| `repair-source-refs` | rewrite every `source[].ref` that names no file into the path this section requires, using the manifest's `dir`/`file` for a bare `spreadsheetId` and the estate root for a path that lost it; a ref it cannot place is left exactly as it is and reported, never guessed. `hash` and `run` are untouched — the hash was `null` because the file could not be found, and `check` is what fills it. The second verb that exists because §11 cannot rewrite a value in place: a corrected `ref` is a different member of a union field, so a delta would add a second citation beside the broken one |
| `export --record <key> [--out <path>] [--all]` | write the record's `rows[]` as a CSV whose header is `key` followed by the declared `fields[].key` in order, retired rows omitted unless `--all`; refuses (exit 2) a record whose `role` is not `reference` or `config`, and any `--out` under `facts/` or `runs/` — the CSV is a derived view and is never committed |
| `audit` | report, never write: duplicate outputs (two rules writing one field); look-alike titles and keys; orphaned `{ref}`s, `{ref, field, row}` edges whose target no longer declares the field or row (including every deferred edge a stub fill has just made checkable), and `refItems` cells whose item is retired or gone; process links whose cited node is no longer in the file or whose process is tombstoned, with the `superseded_by` heir proposed as an approvable re-point; store rows absent from the latest dump, and retired rows with live edges into them; instances whose `expr` differs from their `template_of`; reference-table cells disagreeing beyond 1 % with the constant-rule output their `reconciled_against` pair names; component sums differing from a stated total by more than 1 %; constants no rule consumes and no record field derives; recurring note shapes; stubs untouched for three facts runs in their creating department or older than 30 days; two open entries sharing a natural key; a non-empty-scope entry whose key exists at empty scope; `unit_raw` strings no `units` row covers; role strings in `speaker_role`/`filled_by`/`approved_by`/`by`/`signatures[].role` that appear in no process's `actor` or `mechanisms` |
| `check` | re-hash every cited file; report entries whose source moved and sources whose estate file is not present; report manifest workbooks that no non-stub `record` cites (the coverage denominator: "read") |

`allocate-id fact` mints from the global ledger `facts/.id-seq.json`
(`{"fact": n}`, `facts-idseq.schema.json` — never a second key in a
department ledger, whose writer rewrites the whole file). **QF-21.** One
prefix, `F-`, five digits, for all five kinds; the kind is in the body. `F-`
ids are lexically disjoint from process ids (`{dept}-NNN`), node ids
(`{dept}-NNN-nNNN`, junctions `{dept}-NNN-jN`) and department codes.

`validate facts` and `validate facts-delta` need no engine change beyond a
content pass after the schema: `expr` tokens (§7), unit edges and symbols
(§10), key patterns and `__` reservation (§5), reference shape and prefix
(§6), `refItems` cells resolving to an open item in the declared namespace,
`primaryKey`/`foreignKeys`/`section`/`row` membership and the reserved row
member names (§7), every declared column present on every open row of a
reference record, share sums, constant-rule shape (no inputs ⇒ no `expr` and
no `lang`, every output carries `value` — `null` meaning unknown — or
`range`; inputs ⇒ `lang` with `expr` or `original`, and no `value` or `range`
on any output), `field_status` naming only existing paths and only
`inferred`/`informal`, `reconciled_against` pairs (cell declared here,
`against` resolving to a rule with no inputs), date patterns, and the
`source[]` type exclusions. The schema runner already
resolves any schema name from `SCHEMA_DIR`.

**Guard.** `data-repo/.claude/hooks/guard.py` gains `FACTS_REL_RE =
facts/.+` used with `fullmatch` in `_check_write_path` (everything under
`facts/` is merge-only — the agent writes only
`runs/facts/{dept}/{stamp}/facts-delta.json`) and `FACTS_CMD_RE` beside
`PROCESSES_CMD_RE` in the Bash arm so a redirect is blocked too;
`test_guard.py` gains a `Write` case and a Bash-redirect case.
`data-repo/CLAUDE.md`'s hard-rules block names `facts/**` as merge-only.

**QF-44. Readiness and handover.** A scope is ready to hand over when,
restricted to that scope: `check` reports full manifest coverage, and every
non-retired entry is confirmed for a `confirm` holder.

**Redness does not enter into it** — owner ruling, 2026-09-06: «whatever gets
confirmed means it's complete, period. Whether it's red or not shouldn't matter
at all.» This settles a question the same day's earlier ruling opened. Until
then QF-25 refused the tick to a red entry, so "confirmed" carried "not red"
silently inside it; once a red entry became confirmable, readiness either had to
ask for the absence of red in its own words or stop asking for it. It stops.

A confirmation is a person's signature, and the signature is the whole test. Red
marks an unanswered question about the SOURCE — a value nobody wrote down, or
two people who disagree — and some of those are simply how the restaurant is;
requiring them all resolved would make handover wait on facts that will never
resolve. The reviewer who signs an entry with a red leaf on it is saying they
have read the entry INCLUDING that leaf and that this is what the source says.
Nothing is hidden by the ruling: the red counts still ship on every listing row
(QF-25) and the marks are still drawn beside the tick, so a scope that hands
over with open questions hands them over visibly. The handover artefact is a
**git tag** on `data-repo` naming `facts/`, `attachments/sheets/` (manifest,
dumps, `.gs`, `.structure.md`) and the run directories that produced them; the
`.xlsx` are server-local and are copied alongside from the snapshot. Runbook
07 carries the procedure.

---

## 13. Pipeline

**QF-18 — withdrawn.** v1 tied quantitative extraction to voice runs. Four of
nine departments have no recordings, the department that owns the whole
cross-workbook graph has none, and the process playbook's set resolver admits
only recordings. Facts get their own pipeline.

**QF-38. Two playbooks, one agent, mirroring the process side.**

| | Processes | Facts |
|---|---|---|
| full job over a set of inputs | `process-voice` (skill) | **`quantify`** (skill — the playbook) |
| targeted change, no recording | `edit-process` (skill) | **`edit-fact`** (skill) |
| agent | `classify`, `extract` (+ the `idef-extraction` skill) | **`quantify`** agent (modes `manifest`, `full`, `targeted`); its obligations (QF-19) are one page and live in `agents/quantify.md` itself — the split that justified a separate 588-line skill for `extract` does not arise |
| run directory | `runs/{dept}/{stamp}/` | `runs/facts/{dept}/{stamp}/` |

`classify`, `extract`, `consolidate`, `segments.schema.json` and
`run-meta.schema.json` do not change; `process-voice` and `edit-process`
change by one sentence each — relaying the tombstone warning of QF-8 — and
nothing else. A recording may be consumed by both
playbooks (the 05-26 meeting is half process, half numbers); the `quantify`
Gate A marks a recording an earlier facts run consumed and one a process run
read. `process-voice`'s Gate A is unchanged and does not learn about facts
runs; neither run blocks the other.

### `quantify` playbook

| # | stage | what happens | turn ends |
|---|---|---|---|
| 0 | resume | read `runs/facts/{dept}/{stamp}/meta.json`; route to the first incomplete stage | — |
| M | manifest checkpoint (STOP — only when a workbook's row is missing or unconfirmed) | `dump-workbook --init-manifest` (mechanical columns; structure-only dump); `Task: quantify` (manifest) writes `{run_dir}/manifest-proposal.json` — per workbook `departments`, `branches`, `reference_tabs`, a reason each, `?` where undecided; Persian list of the rows, one line each; a correction re-dispatches the agent; on «تأیید» the playbook writes the manifest with `confirmed: true` and reruns `dump-workbook --manifest` so the confirmed reference tabs gain their `rows.tsv` | yes |
| — | resolve the set | manifest rows for this department; `departments/{dept}/attachments/*`; shared `NAMED_FUNCTIONS.md` and the `.gs` files the manifest pairs with those workbooks; then **ask which recordings**: list `meetings/transcripts/{dept}-*.txt` ∪ `meetings/audio/{dept}-*` without a matching transcript (the glob pair `process-voice` resolves), with a marker for ones an earlier facts run consumed; the user names dates, or none | — |
| A | set checkpoint (STOP) | Persian list of every input with its state (dumped / described / transcript approved / raw / missing) | yes |
| 1 | transcribe missing | `transcribe` and the per-file verbatim gate exactly as `process-voice` Stage 1; skipped when no recording was chosen | — |
| 2 | prepare inputs | `dump-workbook --manifest` over the whole manifest (idempotent, cached — the estate is one graph); `extract-attachment {dept}` and `extract-attachment --path attachments/sheets`; `skipped` lines relayed in Persian, exit 3 continues | — |
| 3 | `Task: quantify` (full) | inputs: department, run_dir, transcript paths, dump paths, image descriptions and image paths, script paths, the department's `processes/*.json` (for QF-8's anchors), `facts/.index.json` and the entries in the department's and universal scope; output: `facts-delta.json` and a Persian summary (counts per kind, every `unknown`/`disputed`, stubs, supersessions) | — |
| 4 | `validate facts-delta` | schema and content checks; on failure re-dispatch the agent with the stderr appended and re-validate; after two failed attempts STOP and report in Persian with the delta path, as `process-voice` bounds `classify` | — |
| B | facts checkpoint (STOP) | Persian: new / updated / superseded per kind; every `unknown` and `disputed` with its accounts; stubs about to be written; a correction re-dispatches the agent only | yes |
| 5 | `merge facts apply` | as §12 | — |
| 6 | finish + commit | `meta.json` (recordings, attachments, workbooks consumed, ids created); `git -C <data-repo> add departments runs facts attachments && git commit` — the allowlist, never `git add -A` (`departments` because the field-material `.text/` caches are tracked) | — |
| 7 | report | Persian open-work delta, counted in field paths («۳۸ سلول بی‌پاسخ، ۲ مورد متعارض»), with the exact `merge facts resolve …` commands, account ids included | — |
| C | audit review (STOP, per item) | `merge facts audit` presented item by item for approval, as `process-voice` Stage 10 presents consolidation; approved items run `resolve`/`retire`/`promote`, or a one-entry `apply` re-pointing a process link to its heir, under this run's directory | yes |

**Bootstrap order** — an efficiency for everything except the `units` record,
which is a correctness prerequisite: `apply` resolves unit symbols against the
store, not against the delta under application, so the `units` record is
written in a run of its own before any entry that cites a unit. Then the
universal seeds under `management` (QF-43), then station and warehouse
workbooks, then sales and ingredients, then the report workbooks, so
cross-workbook references resolve to real records and few stubs are left to
fill. The whole estate is on disk from day one, so a run for any
department can read the dump of a workbook it does not own to derive a key —
it may not create facts scoped to that department (QF-43).

### `edit-fact` playbook

The user says in chat what to change — «پارمسان الان ۱۰۰ گرمه», «این دو تا
قانون یکی هستن», «F-00042 رو بازنشسته کن», «واحد جدید: حلب». The skill
resolves the entry (id, key or title search over `.index.json`), creates
`runs/facts/{dept}/{stamp}/` with `meta.json` recording `origin: chat` and the
instruction, dispatches the `quantify` agent in **targeted** mode with the
instruction and the loaded entry, and receives a one-entry delta — the way
`edit-process` delegates the heir candidate to `extract`. It gates the
destructive cases the way `edit-process` gates its own: retiring and merging
get the one-line Persian confirmation `edit-process` gives a tombstone or a
restructure, and overwriting a filled field gets the field-by-field
current-value-first prompt `edit-process` reserves for `set_process` (INV-5)
— a plain filled-field overwrite is gated here, unlike on the process side,
because a fact has no `pending` queue behind it. Then it runs the matching
verb (`apply`, `resolve`, `retire`, `promote`) against that run directory — so
the edit is revertible like any other run — and commits. It never writes
`facts/*.json` directly.

**QF-19. The `quantify` agent.** A separate agent, not an extension of
`extract`, whose prompt is already 17 KB and delegates to a 588-line skill.
`model: claude-opus-5[1m]`, `tools: Read, Glob, Write` — no Bash, no ids, no
hashing. It inherits the non-negotiables: fill-empty, no fabrication, cite
every source, IDs only from `allocate-id`. Its obligations in full mode:

1. Load the index and the in-scope entries; build the map of keys and titles
   it must reuse (QF-34). Assign scope by QF-43.
2. Walk each workbook dump: per non-empty tab one `record` (key from the tab
   per QF-32, `role` from shape; a one-formula `IMPORT_FROM_SHEET` tab gets
   `role: mirror`, `mirror_of` and no `fields[]`; a BOM or dictionary tab gets
   `role: reference` and its `rows.tsv` cells as `rows[]`; an empty tab yields
   nothing); per formula group one `rule` keyed by output, `original`
   verbatim, `expr` in the FEEL subset with named functions inlined and
   `calls[]` to their rule keys, and each literal it consumes as one constant
   rule per group, keyed by QF-32; per validation a
   `constraints.enum`; per conditional-format rule a flag rule with its
   threshold constant; per cell comment a constant rule or note with
   `source.type: comment`; per `#N`/`##N` code found in a header or in the
   row-label column of a BOM tab an item; per `IMPORT_FROM_SHEET` a
   `mirror_of` and the rule that performs the pull — never a `foreignKeys`
   member, which QF-9 gives a mirror no `fields[]` to build one from.
   `foreignKeys` is for a tab that joins another table on named columns, and
   every member carries both of its sides.
3. Walk each `.gs` paired with the department's workbooks: one `rule lang: gs`
   per function, `port` by the QF-12 criterion with `edge_cases[]`.
4. Walk each described image and view it: one `record medium: paper` per
   blank master (sections, `rows[]` with per-row unit, header fields,
   signature bands); a photograph with handwriting is a values artefact and
   yields no record.
5. Read each chosen transcript in full and take every quantitative passage:
   measurements, constants (value or range, unit, `per`, `of`, `valid_from`),
   rules (`text` / `feel` / `table`), `item.tracked` exceptions; a value that
   belongs to an existing table cell is a source or account on that cell, not
   a new constant; a stated change is a successor with `supersedes`;
   competing statements are `accounts[]`; a habit is `informal`; a hedged
   value is `unknown` with the candidates as accounts.
6. Classify with §8 in order; write `null` for a needed value nobody gave and
   a `field_status` line for a value it inferred or heard as a habit (QF-6);
   cite every source with its locator; roles, never names.
7. Cross-check before writing: units agree on every reference edge or the edge
   names a `via`; every `{ref}` resolves to a temp or real id. It records the
   numbers as stated; arithmetic consistency is the audit's job (§12), not the
   agent's.
8. Anchor to processes only by evidence (QF-8): read the department's
   process files, and give an entry a `processes[]` link only when a node's
   label or description names the entry's referent, citing that node as a
   `process` source with its quote. An entry that no node names has no
   process link, and that is the normal case for most sheet-derived entries.
9. Write `facts-delta.json` — temp ids `T-1…`, `{ref}` envelopes, a `key` on
   every entry — and return only the path and the Persian summary.

In targeted mode it receives one instruction and one entry and returns a delta
touching that entry (and, for a merge, the heir and the retired member).

In **manifest** mode it receives every dump's structure and every
`.structure.md` and returns no delta but a proposal —
`{run_dir}/manifest-proposal.json`: per workbook `departments`, `branches`
and `reference_tabs`, each with a one-line reason it can point at (the
directory name, the hidden `SheetsFileIds` tab, the headers, the presence of
a date column) and `?` where it cannot decide. It proposes; it never writes
the manifest — the playbook does, after Gate M (§3).

**QF-20. Stubs.** Two cases, both the one exception to "a run only writes
what it read", and both writing nothing but identity:

- A reference to a record of a workbook that **is** in the manifest but has
  no entry yet (a cross-department pull) creates a **record stub**: key
  derived from the dump by QF-32, `title` from the tab, `location`,
  `data.stub: true`, no `fields[]`, scope of the workbook's manifest row. The owning run fills it by natural key with no
  key change; edges into it are deferred (QF-37) until then.
- A Drive id referenced from a formula with **no manifest row and no file**
  creates a **workbook stub**: `kind: record`, `data.stub: true`,
  `data.grain: "workbook"`, key `ext_…` (QF-32), `location.spreadsheetId`,
  scope of the creating department. When the workbook joins the manifest, the
  first record written for that `spreadsheetId` **adopts** the stub's id, its
  key and scope are replaced, and `merge` re-derives the measurement keys that
  referenced it; later records for the same workbook are new entries.

Stubs are excluded from the red rollup until filled.

**Facts run metadata** (`facts-run-meta.schema.json`): department, `origin:
pipeline | chat | ui`, actor, started/finished, `recordings[]`,
`attachments[]`, `workbooks[]` (spreadsheetIds), `delta`, `merged`,
`ids_created[]`, and the chat instruction for `edit-fact`.

---

## 14. UI

**QF-22. Its own top-level section, spanning departments**, alongside the
department screens. The reviewer is a person closing data gaps, not a person
reading one department's diagram; attaching facts only to nodes would make
every unlinked fact invisible. The section is **Panel-only**: a `confirm`
holder is in the Panel by construction, the Reader shell has no navigation
tray, and the reviewer workflow QF-39 describes is a Panel workflow. The
Panel's tray gains a second destination link beside «دپارتمان‌ها» (the
«مدیریت» popover is the tray's other entry and is not one): an active/inactive
treatment, a `crumbs` entry, a `data-screen` value, and an owner-approved
design or an explicit exemption from the graded DESIGN row, per the
conformance plan. The design of record for the section is the facts part of
`ui/design/Inja Panel.dc.html` (landed 2026-08-30); the implementation
follows it exactly, corrected only by the conformance notes at the end of
this section.

**QF-23. Visibility — the Panel, not the reader view.** Facts are visible to
editors and admins and are not shown in the reader view in v1. Every facts
route requires a Panel capability on the entry's scope — `edit`, `confirm`,
`set_visibility`, `manage_users` or `view_audit`, the set that routes a
session to the Panel (`PANEL_CAPABILITIES`), with `*` for a universal entry —
and a holder of `view` alone receives the same uniform 404 as for an entry
that does not exist. An **editor** sees everything, unconfirmed entries included. An
**admin** is a non-editor, and sees what the two existing non-editor rules
allow, both unchanged: `disclosure.may_serve` withholds an entry with no
valid confirmation (FR-V4 / D22 — now trivially per entry, since confirmation
is per entry), and QF-26's switches hide whole kinds. Unconfirmed content is
therefore editor-only by construction. Department
filtering reuses the existing model (`scopes.contains`): a holder of
`dept:cooking` sees cooking-tagged entries, `*` sees everything; universal
entries — empty `scope.departments` — have no target string `contains` can
answer for, so the facts list adds an explicit `scope.departments == []`
disjunct. `edit` governs editing, `confirm` governs ticking.

**QF-24. Confirmation is per entry, and reuses `app.db.confirmations`.** A
reviewer reads a whole entry — the rule with its inputs and outputs, the
record with every column and row, the item with its units — and confirms it
with one tick. The target is the entry id, `F-00042`, exactly as a process
document's target is its id; the fingerprint is the SHA-256 of the entry's
canonical form, computed with a facts canonicaliser whose exclusion set is
`{updated_at}` at envelope level only — the process canonicaliser drops
`source` at every depth, which on a fact is content, and a `data` key or a
record column named `updated_at` is hashed like any other content. Any later
write to any part of the entry — a run adding a source, a `resolve`, a row
retired, a cell changed — moves the fingerprint and the mark stops matching;
that is the whole invalidation mechanism, and no `confirmed` flag is ever
stored in the file (QF-6). Re-ticking against a stale fingerprint answers
409, as it does for a process.

What changes in the router, stated so the planner sizes it: a third `_kind`
value, `fact` (today `"process" if "-" in target`, which an `F-` id would
satisfy); a loader that reads the entry from `facts/` instead of
`departments/**`; the facts canonicaliser; a facts listing route that
returns each entry's confirmation state — confirmed or not — computed
server-side from the stored fingerprint (the client is forbidden from
computing one); a stored mark whose fingerprint no longer matches counts as
*not confirmed*, exactly as for a process, and the listing does not
distinguish it from an entry never ticked (the confirmations table and the
audit trail keep the history). **An entry whose `status` is `disputed` or
`unknown` is confirmable like any other** — owner ruling, 2026-09-06: «each of
the quantitative items should be confirmable, regardless of whether it has an
issue or not.» This replaces the rule that stood here, under which red won over
green: the endpoint answered 409 and the UI drew the control disabled, labelled
«قابل تأیید نیست». The reasoning it was written on — that a signature should
not vouch for an unreconciled fact — is answered by what an `unknown` leaf
actually is: a question for the SOURCE, which nothing a reviewer does on that
screen can settle. The refusal therefore withheld the signature without moving
the thing it was waiting on, and did so on precisely the entries most in need of
a reviewer. Confirming says "I have read this and it is what the source says";
the red marks stay drawn beside the tick and say the rest, and confirming
neither clears them nor changes `status`. Each confirmation row also records the `data-repo`
commit id it was taken against (one column, one migration), so a
post-restore reconciliation can tell backup skew from genuine drift. The
audit events (`confirmation.set` / `.revoked`) apply unchanged; the detail
carries the entry's full `scope` (or `*` for a universal fact), because the
gate is an AND over every department in scope.

**QF-27. The gate loads the fact.** `_target_scope` derives a department
lexically (`storage.dept_of` = `rsplit("-", 1)[0]`) so the gate can run
before any disk read — a design that works because a process id carries one
hyphen and cannot extend to `F-00042`, which it would read as department `F`.
`_target_scope` therefore gains a
first branch on the `F-` prefix: for a fact it loads the entry and returns the
requirement from `scope.departments`; the lexical shortcut survives unchanged
for the two process shapes:

- scoped to one or more departments → `confirm` on **every** one of them
  (the existing sequential-AND idiom; a cooking editor does not vouch for a
  fact that binds accounting);
- scoped to none → `confirm` at `*`.

A purpose-built helper does this without emitting one `access.denied` audit row
per miss; `can.ts` gains its client twin (`canConfirmFact(session, entry)`); an
id not on disk answers the same uniform 404 as one out of scope. Universal seed
facts (the date functions, the unit table) are confirmed at `*` during
bootstrap — a numbered operator step in runbook 07 through the confirmations
API, not a seed-script change.

**QF-25. Two states, red counts, badges.** Confirmation is one state per
entry (QF-24) with exactly two values, as for a flowchart: **تأییدشده** — a
`confirmations` row whose fingerprint matches the entry — and **تأییدنشده** —
no row, or a row whose fingerprint no longer matches; the two are not
distinguished on screen. Epistemic status is per field (QF-6) and is a
property of the content, not of the mark, so it is shown where it lives,
never folded into the chip:

| what | where it shows |
|---|---|
| a `null` leaf or an open account | the field or cell is drawn red inside the entry, split into «بی‌پاسخ» and «متعارض» (different jobs for different people); the list row carries the counts beside the chip («۲ بی‌پاسخ · ۱ متعارض»); the tick is drawn disabled with «قابل تأیید نیست» and the endpoint answers 409 (QF-24) |
| `inferred` / `informal` in `field_status` | a marker on the field («استنباطی» / «عرفی») |
| stub | a «پیش‌ثبت» badge beside the title, exactly like «بازنشسته» |
| universal entry, reviewer holds no `*` | no tick is drawn, as for a process outside the holder's departments |

Red wins: an entry with a red field cannot be ticked however it is marked,
and there is no per-field tick. Every colour has a Persian word beside it.

**There is no worklist screen** (decision of 2026-08-30). Open work is found
in the list itself: the «وضعیت تأیید» filter set to «تأییدنشده», the red
counts on each row, and the coverage line from `merge facts check`
(«۱۹ از ۲۸ کاربرگ خوانده شده») in the list header — so an empty filtered
list is distinguishable from "nothing read yet". There is no blockers-first
ordering and no orphan row class; orphaned references — among them
«اشاره به فرایند بازنشسته», derived live from the process's `tombstoned` /
`superseded_by` with the heir named (QF-8) — and moved sources are shown on
the entry's own page and reported by `merge facts audit`.

**QF-39. Evidence and resolution.** A reviewer's decision procedure for a red
row is to look at the evidence, and the Panel **does not render it**: every
file-backed source row — «کاربرگ», «اسکریپت», «یادداشت سلول», «اعتبارسنجی»,
«قالب‌بندی شرطی», «عکس», «PDF», «سند Word», and «جلسه», whose file is the
transcript since audio is not kept — is a click that opens one confirmation
popup («فایل منبع دانلود شود؟», with the file name, «دانلود» / «انصراف»)
and then downloads the file. Nothing is shown inline: no image or PDF
viewer, no transcript excerpt, no cell preview. A `process` source navigates
to the process; a `chat` source is inert. The download is served by one
auth- and scope-gated route over the attachment roots —
`attachments/sheets/**` and `departments/{dept}/attachments/**` — and the
transcript directory, with `resolve()`-both-sides containment against each
root, the `export_pdf` download capability, and a uniform 404 for a path
outside them. The section also provides a server-side reverse index
(`GET /api/facts?process=…`, `?consumes=F-…` — the last returning the
entries whose `inputs[].from`, `via`, `calls[]`, `writes_to`,
`fields[].derived`, `refItems` cells or `reconciled_against` name the given
id; a constant's detail
screen shows its consumers). A disputed field shows its accounts grouped
under the field's `path_labels` label, each with `speaker_role`, source and
value; choosing one posts `resolve`, which the ui-backend runs as `merge
facts resolve` under a run directory it creates (`origin: ui`) — the service
never edits `facts/*.json` itself, so the run record and the audit trail are
the same as from chat. A reference table is shown as a grid with per-cell
state colour and one confirmation for the whole table. The canvas does not
gain a badge (§18).

**QF-26. Content visibility extends the policy table** with six rows —
`fact_items`, `fact_records`, `fact_measurements`, `fact_rules`, `fact_notes`,
`fact_sources` — global switches set only at `*` with `set_visibility`. They
govern what an admin sees (QF-23) and **default to shown**: D17's
"nothing becomes visible at migration" guards the reader view, which facts do
not reach, and the user's decision is that admins see facts. Enforcement is a
fact branch in `visibility.filtered`, the shape filter every process or fact
body passes through (called from `disclosure.redact` and
`exports.build_payload`): a kind whose switch is off is withheld whole; with
`fact_sources` off, `source[]` and `accounts[].source` are stripped and the
source-download route (QF-39) answers 404 for that caller. `FIELDS` and `DEFAULTS`,
the `PolicyField` union, the policy-store test's row count (6 → 12) and six
Persian labels and hints in the Visibility screen change with them; adding
rows moves `policy.version` and therefore every export filename token, which
is accepted.

**QF-42. Digits and vocabulary.** Numeric values, codes, keys and formulas are
declared LTR islands rendered in Latin digits beside Persian prose — the
dataset exists to be read against a sheet cell and by a machine; only chrome
counts and dates use `toFa()`. Every new screen that pins `dir="ltr"` on such
an island is declared in `guards.test.ts`'s `ISLANDS` so the F10 sweep still
passes. Every numeric input runs `toLatinDigits` before it reaches the API.
**Everything the UI shows is Persian**: every kind, status, enumeration value,
field name and row class has a Persian label, given in Appendix D and held in
one file, `ui/src/lib/factsLabels.ts`; a test asserts that every enumeration
member the schemas declare has a label, so a value added to a schema without
one fails the build rather than leaking an English word onto a screen. The
stored values stay English (QF-32); labels are presentation only.

**Nothing served is a bare key.** Keys, ids, row keys and field paths are for
machines; a reviewer never reads `prod_61__ing_22`. With every entry the
ui-backend serves three maps the UI renders from: `resolved` — every id,
item key and process id the entry references (`{ref}` edges, `processes[]`,
the item keys inside `refItems` cells) → `{kind, title, code?}`;
`row_titles` — every row key → the row's title, a reference table's being
composed from its `refItems` titles in `primaryKey` order
(`prod_61__ing_22` → «اینجا پیتزا — گوشت چرخ‌کرده»); and `path_labels` —
every red path, account field and reconciled cell → a Persian label of the
form «ستون — ردیف» (`data/rows/prod_61__ing_41/grams` → «گرم — اینجا پیتزا
— قارچ»). Titles are rendered with the estate code beside an item where
there is one; an id appears only in the URL and in a copyable chip; a key
may appear as a small secondary mono hint beside its Persian title, as the
design does, but never as the only text; `expr` is the one place keys
appear on their own, as an LTR formula island. The raw-JSON view
for a `data` key the forms do not know is read-only in v1 (§18).

**Design conformance notes (review of 2026-08-30, updated against the
design's 22:44 save).** The design of record is followed exactly, with these
corrections, each a defect found against the mock data
(`ui/design/mock/facts/`) rather than a matter of taste. The 22:44 save
already adopted the two-value `CONF` map, resolved `refItems` cells with the
key as a tooltip, Persian decision-table cells, the derived row-key column
hidden when `primaryKey` composes it, and «پاک کردن همهٔ فیلترها»; what
follows is what remains:

1. Red counts and badges beside the two-value chip: the list row carries
   «{n} بی‌پاسخ · {n} متعارض», stub and retired rows a «پیش‌ثبت» /
   «بازنشسته» badge; `stOf` still folds red, stub and universal into
   «تأییدنشده» with nothing beside it.
2. Persian titles come from the served data, not a dictionary: the design's
   `KEY_FA`/`UNIT_FA`/`GROUP_FA`/`ENUM_FA` maps are replaced by
   `inputs[].title` / `outputs[].title` / `fields[].title` / `unit_title`
   from the entry and the `resolved` / `row_titles` / `path_labels` maps
   (QF-42); measurement «ثبت در» renders the record's title and column
   title, not `F-00011 end_stock`.
3. Red is the served `red_paths` and nothing else. The design painted
   «واحد ثبت نشده» on every numeric column without a unit, which turns a
   confirmed entry's `day`/`year` columns red; an omitted `unit` is "not
   applicable", only `unit: null` is «بی‌پاسخ» (QF-6).
4. The accounts card is grouped by disputed field under its `path_labels`
   label and shows `speaker_role` (QF-39).
5. An admin's list is `may_serve`-filtered (QF-23); the design listed every
   entry for every role.
6. The «محل» row does not mix a Persian label into an LTR island (the
   spreadsheet id rendered garbled); the id lives in the footer chip only.
7. Every orphan class of Appendix D is drawn, not only the tombstoned
   process: «گرهٔ ارجاع‌شده حذف شده», «منبع تغییرکرده».
8. `field_status` markers are drawn (the design computed them and never
   rendered them); `original` / `original_ref` are reachable as a collapsed
   «متن اصلی» block; an issue shows its `from_date`, `fix` and `affects`.
9. Labels come from `lib/factsLabels.ts` and the registries (departments,
   branches, the units record), not from inline maps.
10. The six «کاربرگ‌ها» blocks and the inline `BOOKS`/`FACTS` arrays are
    deleted from the design (decision of 2026-08-30); there is no workbook
    screen in v1 — the manifest is edited by hand (Appendix B).

**Export.** The department PDF does not include facts in v1 (§18).

---

## 15. Governance

- Names: `speaker_role`, `filled_by`, `approved_by`, `by` and
  `signatures[].role` are roles drawn from the vocabulary the process side
  already holds (`actor`); the audit reports a role string that appears in
  facts but in no process. `data-repo/CLAUDE.md`'s "roles, not names" line
  names these fields. `dump-workbook` writes a comment author only when it
  maps to a known role, `unknown` otherwise — never the raw name (the
  threaded-comment author list in `xl/persons/person.xml` holds display
  names).
- The workbooks: QF-28.
- `app.db` holds the whole fact review record and is not yet backed up
  off-site. Fact confirmation makes the planned `state-backup`
  service a **prerequisite** for bootstrap, and NFR-16's enumeration gains
  "confirmations". Until it runs, runbook 05's Backup & restore section names
  the fact review record inside its `app.db` bullet as a further thing lost
  with that file, and its opening count grows by one because QF-28 adds
  `attachments/sheets/` to the same list. The commit-id column of QF-24 is
  what makes a post-restore reconciliation possible.
- The attachment route (QF-39) is gated by scope and by `export_pdf`, so
  `reader_no_download` cannot pull a workbook.
- Facts are not a comment target in v1: FR-K1's four targets stand, and a gap
  is closed by an editor from the list, not by the operator who knows the
  answer (§18).

---

## 16. Files touched

**New — code-repo**
- `schemas/facts.schema.json` — file wrapper `{schema_version, entries[]}`;
  envelope `additionalProperties: false` with the required list of §6; the
  kind discriminated with `oneOf` + `const` (house style; `if/then` cannot
  reject a wrong-kind payload); every `data` payload `additionalProperties:
  true` with the `required` list of §7; `{ref, field?, row?}` as a shared
  `$def` with `additionalProperties: false`; patterns for keys, ids, Jalali
  dates, `lines`.
- `schemas/facts-delta.schema.json` — the agent's output: the same envelope
  with `id` re-patterned to `^T-[0-9]+$` (or absent for an entry matched by
  natural key) and `status`, `updated_at`, `source[].hash`, `source[].run`,
  `accounts[].id` and `data.original_ref` removed; `data.original` admitted.
- `schemas/facts-index.schema.json` (with `field_status_counts`),
  `schemas/facts-run-meta.schema.json`, `schemas/facts-idseq.schema.json`,
  `schemas/manifest.schema.json` (with the `short` pattern and uniqueness,
  `reference_tabs[]` and `confirmed`), `schemas/manifest-proposal.schema.json`
  (the agent's `manifest`-mode output).
- `engine/dump_workbook/` — stdlib `zipfile` + `ElementTree`, no dependency
  (Appendix C); `--init-manifest` (mechanical columns, structure-only dump,
  idempotent) and `--manifest` (full dump, `rows.tsv` for confirmed reference
  tabs); the sheetId-drift diff.
- `engine/merge/facts.py` — `apply, resolve, retire, revert, promote, export,
  audit, check, repair-foreign-keys, repair-source-refs`.
- `tests/fixtures/facts/kitchen-quantitative-report.pdf` — the hand-written
  summary of the cooking recordings, the acceptance reference of §17.
- `docs/runbooks/07-facts.md` — where the store lives, what commits it, the
  bootstrap order, seeding the universal confirmations, the comments review,
  the coverage line, undoing a run, readiness and handover (QF-44).

**New — data-repo**
- `.claude/agents/quantify.md`; `.claude/skills/quantify/SKILL.md`;
  `.claude/skills/edit-fact/SKILL.md`.
- `attachments/sheets/manifest.json` (mechanical columns by
  `--init-manifest`, the rest proposed by the agent and confirmed at Gate M);
  `facts/` initialised empty (five files with `{schema_version: 1, entries:
  []}`, the ledger, an empty index), and the `units` record of §10 written by
  the bootstrap's own `merge facts apply` run under
  `runs/facts/management/{stamp}/` like every other entry — runbook 07 carries
  the delta.

**Changed — code-repo**
- `engine/extract_attachment/` — the dispatcher, `--path`, hash-gated cache,
  the Vertex vision path (reusing `engine/transcribe`'s client), exit 3;
  `engine/extract_attachment/README.md`; existing callers see only the new
  `skipped` lines and exit 3 for unknown extensions.
- `engine/merge` process verbs `remove` and `restructure` — after
  tombstoning, a read-only lookup of `facts/.index.json` and one `facts:`
  warning line per referencing entry on stdout (QF-8); no facts write; no
  line when the index is absent.
- `engine/allocate_id` — `fact` subcommand and the global ledger.
- `engine/validate` — the content pass of §12.
- `engine/pyproject.toml` — the `dump-workbook` script, `dump_workbook*` in
  the packages-find include list, and the note that the `.pdf`/image rows need
  the `vertex` extra; `engine/README.md` (verbs, exit 3, variable table).
- `schemas/README.md` — one row per new schema, the date convention (QF-41),
  the `schema_version` migration convention (QF-45).
- `config/engine.env.example`, `deploy/docker-compose.yml` and
  `deploy/docker-compose.local.yml` — `VERTEX_VISION_MODEL` in every service
  that runs `extract-attachment`, beside `GEMINI_MODEL`; `deploy/` — the
  server snapshot list; runbook 04's variable table; runbook 05's backup
  section.
- `ARD.md` §2.2 tree, the committed-set section and the git-add allowlist
  statement; `PRD.md` NFR-16.
- ui-backend: `routers/facts.py` (list with fingerprints and confirmation
  state, get with the `resolved` / `row_titles` / `path_labels` maps of
  QF-42, reverse index, branches, resolve/edit via
  `engine.py` — every route gated on a Panel capability, the write routes
  on `edit`/`confirm`), the source-download
  route, the fact branches in `visibility.py` (kind
  switches, `fact_sources`) and `disclosure.py` (`may_serve`/`servable` per
  entry), the facts canonicaliser in `fingerprint.py`, `_kind: fact`, the
  facts loader in `routers/confirmations.py`, the gate
  helper in `access.py`, `store/policy.py` (`FIELDS`, `DEFAULTS`), a manifest
  reader (`store/manifest.py`), the commit-id column (`db.py`, one
  migration), `tests/test_endpoint_matrix.py` and `test_policy_store.py`.
- ui: the data section, built to `ui/design/Inja Panel.dc.html` with the
  §14 conformance notes — list with kind/scope/branch/confirmation filters
  and red counts, per-kind detail forms (five) including the table grid
  with per-cell state colour, one `ConfirmMark` per entry, the coverage
  line in the list header, dispute resolution grouped by field, the source-download popup, the read-only raw view; `lib/factsLabels.ts` (Appendix D) and its schema-coverage test;
  `auth/can.ts` (`canConfirmFact`), `api/types.ts`, `ConfirmMark.tsx`, shell
  tray/crumbs, `e2e/_harness.ts` DESIGN rows, `Visibility.tsx` labels,
  `guards.test.ts` ISLANDS.

**Changed — data-repo**
- `.claude/skills/process-voice/SKILL.md` (Stage 9) and
  `.claude/skills/edit-process/SKILL.md` (Step 6) — one sentence each: relay
  the `facts:` warning lines `merge remove`/`merge restructure` print (QF-8).
  Nothing else in either playbook changes.
- `.claude/hooks/guard.py` + `test_guard.py` — the `facts/` patterns, both
  arms.
- `.gitignore` — `attachments/sheets/**/*.xlsx`.
- `CLAUDE.md` — QF-1, QF-2, QF-17, QF-32, the `facts/**` hard rule, the roles
  line, the Pointers table (`quantify` agent, `quantify`/`edit-fact` skills),
  the Engine CLIs table (`dump-workbook`; `extract-attachment`'s row rewritten
  for the dispatcher; `merge facts`; `allocate-id fact`), and the Pipeline
  entry point block (`/quantify`, `/edit-fact`).

**Unchanged, deliberately:** `process-voice` and `edit-process` beyond the
one relay sentence each, `classify`, `extract`, `consolidate`,
`segments.schema.json`, `run-meta.schema.json`, `process.schema.json`,
`merge`'s process verbs beyond the warning line, the IDEF0 canvas and
`src/flow/**`, `pending[]`, the upload bot, `seed.py`, and FR-V4 itself —
facts fall under it unchanged (QF-23).

---

## 17. Testing

Scoped runs only — the full sweep is not warranted.

- **Schemas:** one valid fixture per kind validates; an unknown envelope key
  fails; a wrong-kind payload fails on its `required` list; an unknown `data`
  key passes; a Persian key fails; a doubled-underscore minted segment fails;
  a bare-string reference fails; a `{ref}` object with a foreign key fails; a
  delta carrying `status` or `hash` fails; a file at `schema_version: 0` is
  refused with a named migration, and one at an unknown higher version is
  refused; a record column keyed `updated_at` changes the entry's fingerprint.
- **`dump-workbook`:** a fixture workbook with a shared-formula range yields
  one group with the right count (a naive `<f>` walk under-counts
  `Amadesazi!بازدهی` by 97 %); LAMBDA bodies and sheet-scoped duplicate names
  are both emitted; a `DUMMYFUNCTION` string literal is unwrapped across a
  `"&"` split; a threaded comment's text is read from
  `xl/threadedComments/` and its author is a role or `unknown`; the header
  row is found on a tab whose row 1 is a merged band; `spreadsheetId` is read
  from the sibling `.structure.md` and its absence is exit 2; a re-dump after
  a tab insertion reports the sheetId drift; a tab listed in its workbook's
  `reference_tabs[]` yields a `rows.tsv` whose header is the tab's header row
  and whose cells are verbatim, and a tab not listed yields none even when it
  is full of numbers.
- **`extract-attachment`:** an unknown extension produces a `skipped` line and
  exit 3 with every convertible file converted; an `.xlsx` outside
  `attachments/sheets/` is skipped with the workbook reason; the Vertex path
  is exercised with a stubbed client and asserts the `handwriting` line; a
  touched-but-unchanged `.docx` is not reconverted.
- **`merge facts apply`:** create; fill-empty; agreeing rewrite is a no-op;
  disagreeing rewrite materialises the incumbent as an account, appends the
  challenger, sets `disputed` and does not overwrite; a later `valid_from`
  supersedes and the successor is linked both ways; a second citation
  set-unions into `source[]`; a same-key column with a different `unit`, and
  a same-key BOM row with a different `grams`, dispute that leaf; a record
  stub is created once and filled once with no key change, and a deferred
  edge becomes checkable; a workbook stub is adopted and the measurement keys
  that referenced it are re-derived; a delta creating an item, a record and a
  measurement in one call resolves in dependency order and burns no id on a
  hit; **running the same delta twice leaves the five files byte-identical**;
  a failed precondition writes nothing; `status` is derived — an open
  account makes it `disputed`, a `null` leaf `unknown`, a `field_status`
  line `informal` or `inferred`, else `confirmed`; `original` lands in
  `originals/`; row
  keys are derived from `primaryKey` on a reference record, and a paper log's
  minted row keys survive a second `apply` unchanged; a re-dump that drops a
  BOM row retires it (a write to the entry, so its confirmation goes stale);
  a corrected `primaryKey` cell retires the old row rather than leaving two.
- **Preconditions:** a new entry whose title byte-equals an existing title in
  the same kind and scope is refused (and not for `note`); a different key for
  an existing natural key is refused except for a stub; an unregistered branch
  or department is refused; a `unit` no `units` row declares is refused and
  the message names the symbol; a `{ref, field}` naming an undeclared field
  or a `{ref, field, row}` naming an undeclared row is refused unless the
  target is a stub; an entry scoped to another department is refused; a
  `primaryKey` naming an undeclared field fails validation; a rule with
  inputs and an output carrying `value` or `range`, a rule without inputs
  carrying `expr` or `lang`, and a `field_status` naming a missing path or a
  value other than `inferred`/`informal` all fail validation; a reference row carrying an
  undeclared column, or missing a declared one, fails validation; a `refItems`
  cell naming no open item fails validation.
- **Keys and ledger:** two rules with different titles and the same output
  merge into one entry; two constants differing only in `scope` stay
  separate; a renamed tab keeps its record; the four workbooks defining
  `GREG_TO_JALALI` yield one universal rule; the fact counter survives a
  subsequent `next_process_id`; ids are never reused after `revert`.
- **Verbs:** `resolve` by account id marks one account chosen and confirms the
  field; `retire` refuses a retired heir; `revert` restores a byte-identical
  store, reopens a predecessor's `valid_to`, and — run A writes `data/expr`,
  run B rewrites it — `revert --run A` exits 2 and writes nothing; `promote`
  keeps the id, refuses a key collision and refuses promotion to a constant
  without `--key`; `export` emits a CSV whose header is `key` plus the
  record's field keys, omits retired rows, refuses a log record and refuses an
  `--out` inside a run directory; `audit` reports a duplicate output, an
  orphan, a dangling `refItems` cell, a row absent from the latest dump, a
  template drift, a table/constant disagreement, a constant nothing consumes,
  a stale stub, two open entries on one key, a scope duplicate of a universal
  key, an unknown role string and a component sum off by more than 1 %;
  `check` reports a moved source, an absent estate file and an uncited
  workbook.
- **Validate content:** an `expr` with an undeclared identifier fails; a g→kg
  edge without `via` fails, including an edge from a constant rule; shares
  summing to 0.9 fail; a `source` of type `index` fails; a bad Jalali date
  fails; a `processes[]` entry with no `process` source naming that file, or
  whose cited node is absent from it, fails; `audit` reports a process link
  whose node a restructure removed, and proposes the heir for a tombstoned
  process.
- **Manifest:** a run over a workbook whose row is missing or unconfirmed is
  refused; `--init-manifest` rerun over a folder with one new workbook
  appends one `confirmed: false` row and changes nothing else; the
  `manifest`-mode fixture — over the 28 structure dumps the agent proposes
  `cooking` for the four station books, `management` for the two reports and
  the control book, an empty department list for `Mavade Avalie`,
  `chalebagh` / `naharkhoran` from the directory names, and the 12 BOM tabs
  as `reference_tabs`, with a reason on every line.
- **Tombstone reporting (QF-8):** `merge remove` on a process three facts
  reference prints three `facts:` lines naming them and the heir, and prints
  nothing when `facts/.index.json` is absent; a served entry shows
  «اشاره به فرایند بازنشسته» immediately after the tombstone, with no facts
  run in between.
- **Classification fixture for the agent:** `Gozaresh markazi!پیتزا` rows
  6–15 must yield the four derived-arithmetic rules (H مصرف اعلامی, J انحراف,
  L انحراف با تلورانس, M انحراف به ازای هر عدد) beside the five lookup
  columns, four tolerance constants in two models (`tolerancePerFoodGr` 5 g
  and 4 g; `tolerancePerKilogramGr` 140 g/kg and 75 g/kg) and `unknown` on
  the six rows where `L = J` (the fifth tolerance, 100 g/kg, is on `فرنگی`);
  `Mavade Avalie!پیتزا ایتالیایی` must yield one reference record with its
  cells as rows, not 300 constants; `Salon - Chalebagh` must yield between 3
  and 5 rules containing the receipt import, the deviation and the target
  lookup, not 574; photo 1 must yield one record, key
  `mande_shab_farangi_burger`, with every column's `unit` written `null`;
  `cooking-1405-06-01` must yield the declared-use dispute with both accounts,
  the 10-per-portion `inferred` constant and the ~300 `informal` threshold.
  Scored on kind + key + status exact match; `expr` up to normalisation.
- **Cooking acceptance fixture:** `tests/fixtures/facts/kitchen-quantitative-report.pdf`
  is the hand-written summary of the cooking recordings
  (`cooking-1405-05-26`, `-05-26-02`, `-06-01`); a `quantify` run over
  those three recordings plus the four station workbooks must yield, at
  minimum, these entries (kind · key · status), and nothing in the PDF may
  land as a `note` when a row below names its kind:
  - `record` · `spider_report` (`cadence: nightly`, columns for delivery
    band with `constraints.enum` 15/25/30+, quality `خوب/متوسط/بد`, waste,
    off, needs, dough counts) · confirmed;
  - `record` · `mande_shab_pizza`, `mande_shab_farangi`,
    `mande_shab_sokhari`, `mande_shab_counter` (`day_boundary: 01:15`) ·
    confirmed;
  - `record` · `waste_form` (reason column `constraints.enum` of the six
    causes, `signatures`) and `record` · `weekly_leave_form`
    (`medium: paper`, `cadence: weekly`, accounting) · confirmed;
  - `record` · `pos_sepidz` and `supplier_bread` (`medium: external`) ·
    confirmed;
  - `rule text` · `tracking_policy_rial_value` with its threshold constant
    `value: null` · unknown;
  - `rule table` · `waste_cause_to_responsible_department` (six causes →
    department) · confirmed;
  - `rule table` · `par_portions_penne_by_weekday` (40 normal, 65 Thu–Fri) ·
    confirmed; `rule feel` · `order_packs_from_par` · confirmed;
  - constants · `cooked_to_raw_factor_grilled_chicken` (1.30, range
    0.28–0.32 loss) · confirmed; `drip_loss_g_per_kg_steak` (range 70–90) ·
    confirmed; `chicken_g_per_portion_crispy` (285, range 265–310,
    `informal` on the range) · informal; `pack_g_penne` 1200,
    `portion_g_penne` 240, `pack_g_parmesan` 100 with `supersedes` the 200
    · confirmed; `fryer_count` 4, `oil_loss_l_per_night` range 8–12 ·
    confirmed;
  - `item` · `bacon` with `units[].factor_to_base` a range (30 slices =
    900–980 g) and a `measurement` of `quantity: mass` on it · confirmed;
  - `item.tracked: false` with a reason on mushrooms, sauces, oil, spices,
    bread, disposables, Kentucky salad, mini-Mac bread, packaging;
  - `record.movement` on the roast-beef, chicken-to-fried and flour-from-prep
    transfers · confirmed;
  - `rule feel` · `gozaresh_cb__pizza__actual_use` (`start + received -
    end`), `…__standard_use` written with the `sum over` aggregate over the
    BOM, `…__deviation` · confirmed; the Delester split as a row
    `supersedes` on the counter record;
  - the steak lifecycle and the food-test flow yield **no** fact entries
    (they are processes) beyond a `processes[]` link where a cooking node
    names them.
- **Guard:** a `Write` to `facts/rules.json` and a Bash redirect into it are
  both denied.
- **ui-backend:** the gate matrix (all-departments AND, universal at `*`,
  uniform 404, a `view`-only holder denied on every facts route, an admin
  denied on the write routes); an admin's read omits every
  kind whose switch is off and every entry without a valid confirmation, and
  with `fact_sources` off carries no `source[]`; an entry
  tick followed by a `merge` that rewrites any part of that entry — a source
  added, a cell changed, a row retired, a dispute resolved — leaves the mark
  invalid and the listing reports the entry as not confirmed; re-ticking
  against a stale fingerprint answers 409; a tick on a red entry answers 409; the source-download
  route refuses a path outside its roots and never streams a transcript or
  image inline; the endpoint matrix covers the
  new routes; the commit-id column is written at set time; a served entry's
  `resolved`, `row_titles` and `path_labels` cover every id, item key, row
  key and red path it references, so no screen can fall back to a raw key.
- **ui:** a value typed in Persian digits reaches the API as ASCII (unit test
  on the input path); the F10 sweep passes with the new ISLANDS entries;
  every `enum`/`const` member of `facts.schema.json`,
  `manifest.schema.json` and `facts-run-meta.schema.json` has a label in
  `lib/factsLabels.ts` (Appendix D), and a label lookup on an unknown value
  throws in development.

---

## 18. Deliberate ceilings

Marked with `ponytail:` comments at the point of implementation, or, where
there is no code site, in the file named.

- Five shared files, no lock; shard by key hash if concurrency becomes real
  (QF-2) — `merge/facts.py`.
- Persian text is compared byte-wise everywhere — no NFC, ZWNJ, ی/ي or digit
  folding, by decision. Keys are ASCII so identity is unaffected; what is
  affected is the `note` statement hash (a re-worded sentence is a new note),
  QF-17's `title` equality (a re-typed title reads as a dispute; prose fields
  are exempt by §11) and
  title search in `edit-fact` and the UI (a variant spelling misses). The
  audit's look-alike report is the backstop — `merge/facts.py` and the data
  section's search.
- Constant-rule keys are minted; the audit's look-alike report is the
  backstop (QF-15) — `merge/facts.py`.
- A process link whose cited node is gone is reported, never auto-repaired
  and never dropped (QF-8) — `merge/facts.py`.
- Inventory movement is a record-level field and places are items, not a
  kind — revisit when the ERP names its inventory atom — `merge/facts.py`.
- Facts are not in the reader view in v1: a `view`-only holder gets a
  uniform 404 on every facts route (QF-23) — `routers/facts.py`.
- No canvas badge for facts: `src/flow/**` is frozen and shared with the PDF
  export; the reverse index serves the need — `docs/runbooks/07-facts.md`.
- Facts are not in the department PDF export — `exports.py`.
- Facts are not a comment target; FR-K1 stands — `docs/runbooks/07-facts.md`.
- No per-gap question or addressee fields on an entry; an `unknown` field's
  question is its title and path, found through the list's «وضعیت تأیید»
  filter — the data section's list screen.
- The raw-JSON view is read-only; editing an unknown `data` key goes through
  `edit-fact` — the data section's screen file.
- `revert` refuses when a later run touched the same paths rather than
  attempting a three-way merge — `merge/facts.py`.

---

## Appendix A — coverage of this estate's definitional shapes

Census over 28 workbooks, 10 scripts and 2 photographs: 316 tabs (128 hidden —
112 of them one-formula `IMPORT_FROM_SHEET` mirrors, the rest id registries,
`Refresher` cells and three large hidden data tabs including the 47k-cell order
log `سفارشات ثبت شده` — and 58 empty, one of which is also hidden), 5,466
formula cells, 292 data validations, 50 conditional-format rules, ~102 cell
comments (100 threaded), 151 distinct `#`/`##` codes.

| shape | kind | fit | bought by / what is lost |
|---|---|---|---|
| recipe/BOM matrix (~1,200 cells, 12 tabs, source + 3 mirror sets) | `record role: reference` with `rows[]` | clean | per-cell status, one confirmation for the table, `mirror_of`, `reconciled_against` (§9) |
| item codes, two namespaces, `#27` twice, uncoded prep/paper items | `item` | clean | key from code or minted; `code_collision`; `state`/`grade` |
| per-product yield/dough/tolerance factors | constant `rule` | clean | minted keys encode the axis; `nature`; formula literals become constants consumed by their rule |
| sales-channel axis (سالن / بیرون‌بر × branch) | key + `fields[].group` | clean | encoded in the key, not in `scope` (QF-4) |
| target vs actual vs deviation (receipts, staffing) | `record` + `rule` | clean | |
| event coefficients, multiplied over an operator-chosen subset | `rule table` | clean | `hit: collect, aggregate: product`; `from: "operator"` |
| weekday coefficient table; trend and buffer rules | `rule table` / `rule feel` | clean | |
| order-quantity rule `K = (((F·G)·H)+J)−I` | `rule feel` | clean | operator input representable |
| par levels as days-of-cover (headers, no data) | constant `rule`, `unknown` | clean | nothing is lost because nothing exists yet |
| two date encodings reconciled by a function | `foreignKeys.transform` | clean | composite field lists + `transform` |
| 112 hidden mirror tabs | `record role: mirror` | clean | `mirror_of`; empty tabs produce nothing |
| hidden id registries, `Refresher` trigger cell | `record role: config` / `note` | forced | a volatility trigger has no semantics worth a kind; it is documented, not modelled |
| thresholds that exist only as a colour (50 cfRules: sign tests at 0, «کسری», delivery-time bands) | `rule` (flag) + constant | clean | §8 rule 5; `source.type: cf` |
| 292 validations, 7 vocabularies | `constraints.enum` | clean | §8 rule 4; `source.type: validation` |
| numeric-not-date custom validations (137) | `constraints` | forced | Frictionless has no "numeric" constraint; carried as `type: number` with the validation cited |
| 81 warehouse cell comments carrying yield decompositions | `rule` / constant / `note` | clean | `source.type: comment`; roles not names |
| one-input-many-output yields | `rule` with `outputs[].share` | clean | §8 rule 1; shares `informal` where they vary by lot |
| sheet-writing scripts | `rule gs` with `writes_to` | clean | |
| POS, supplier invoices, accounting documents | `record medium: external` | clean | `identifier_scheme`; no dangling roots |
| stock locations and movements | `record.movement` + `place` items | partial | a movement is a record-level field, not an entity; the ERP's inventory atom (item, qty, from, to, reason) is representable but not first-class (§18) |
| paper-form sections, document numbers, weekday-conditional rows, open rows | `record` | clean | `sections[]`, `rows[]` objects, `signatures[]` |
| signature banding by row range | `signatures[].row_range` | clean | |
| item state and grade | `item` | clean | |
| menu taxonomy (11 tabs, 84-entry dictionary) | `record role: reference` + `item.group` | clean | |
| unit registry | `record role: config` | clean | §10 |
| operating-day boundary | `record.day_boundary` | clean | |
| money — absent from the estate | seeded constant rules, `unknown` | clean | §2 |
| cash-drawer status column (one column, three types) | `record` | forced | one column carrying a status, a signed value and a name is described as `type: string` with an `issues[]` entry; the ERP splits it |
| staff gap register «نیازمندیها و مشکلات» (12 workbooks) | `unknown` fields with the row as source | clean | §8 rule 12 |
| dead target/deviation mechanism in 4 workbooks; negative declared use in کانتر; argument-shift bug; undefined `getAverage2` | `issues[]` kind `bug` | clean | QF-36 |
| branch twins with identical formulas; genuine drift in Salon/Sandogh | `template_of` + `divergence` | clean | QF-4 |

## Appendix B — `attachments/sheets/manifest.json`

```json
{
  "schema_version": 1,
  "branches": [
    { "code": "chalebagh",   "name": "چاله‌باغ" },
    { "code": "naharkhoran", "name": "ناهارخوران" }
  ],
  "workbooks": [
    { "spreadsheetId": "1dmH8tCqOuqNr2nt4AwJrHC2cq-rv0tIBHc4kk05bWtU",
      "dir": "MandeShab__ChaleBagh__Amar__Pitza", "file": "Pitza.xlsx",
      "short": "pitza_cb",
      "scripts": [],
      "departments": ["cooking"], "branches": ["chalebagh"],
      "reference_tabs": [],
      "confirmed": true },
    { "spreadsheetId": "1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s",
      "dir": "MandeShab__ChaleBagh__Gozaresh markazi", "file": "Gozaresh markazi.xlsx",
      "short": "gozaresh_cb",
      "scripts": ["MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.gs"],
      "departments": ["management"], "branches": ["chalebagh"],
      "reference_tabs": [],
      "confirmed": true },
    { "spreadsheetId": "15M2ovUm…",
      "dir": "MandeShab__Mavade Avalie", "file": "Mavade Avalie.xlsx",
      "short": "mavad",
      "scripts": [],
      "departments": [], "branches": [],
      "reference_tabs": ["پیتزا ایتالیایی", "پیتزا امریکایی", "پیتزا سینگل", "لازانیا", "فرنگی", "پاستا", "ساندویچ", "سوخاری", "سالاد", "استارتر", "استیک", "پرسنلی"],
      "confirmed": true }
  ]
}
```

Two kinds of column. The **mechanical** ones — `spreadsheetId`, `dir`,
`file`, `short`, `scripts` — are written by `dump-workbook --init-manifest`
from the folder: `short` matches the minted-segment pattern and is unique
(left empty rather than proposed twice); `scripts` pairs a script with the
workbook it *calls into*, proposed by directory and corrected at Gate M
(`Gozareshat/Gozareshat.gs` belongs to the control workbook). The
**judgement** ones — `departments`, `branches` (empty = universal, as for
`Mavade Avalie`), `reference_tabs` (the tabs whose cells are definitions, §9;
`dump-workbook --manifest` dumps those cells as `rows.tsv` and no others) —
are proposed by the `quantify` agent with a reason each and confirmed by a
person at Gate M (§3, §13), which sets `confirmed: true`. There is no
workbook-level `role`: the agent decides each *tab's* role when it writes the
record (§7). `--init-manifest` is idempotent — rerun, it appends rows for new
files with `confirmed: false` and touches nothing confirmed. A workbook file
with no row, or an unconfirmed row, is a precondition failure (§3).

## Appendix C — `dump-workbook` output

Per workbook, under `attachments/sheets/.dump/{spreadsheetId}/`, where
`spreadsheetId` is read from the sibling `.structure.md`'s first
`- spreadsheetId:` line — the single claim of that file that is trusted,
because nothing else carries it — and its absence is exit 2 naming the file:

| file | content |
|---|---|
| `sheets.json` | export `sheetId`, name, hidden, dimensions, the first ≤ 5 rows verbatim plus a `header_row` index chosen as the first row that is mostly non-numeric text (39 of 316 tabs have a merged band or a blank row 1 above the header), `##`/`#` codes found in those rows, empty-tab flag; and the previous dump's `(sheetId → name)` map so drift is reportable |
| `formulas.tsv` | sheet, cell range, shared-formula group id, formula text with row numbers normalised, count of cells in the group, one representative cached value, error class if any (`#NAME?`, `#DIV/0!`, `Loading...`) |
| `names.tsv` | every `definedName` incl. LAMBDA bodies verbatim, with its scope (workbook or a `localSheetId`) |
| `validations.tsv` | sheet, range, type, list values or formula |
| `cf.tsv` | sheet, range, rule type, formula, format summary |
| `comments.tsv` | sheet, cell, author role or `unknown` (from `xl/persons/person.xml` via `personId`, mapped through a role table; never the display name), text — read from `xl/threadedComments/threadedComment*.xml` linked through the sheet `_rels`; legacy `xl/comments*.xml` only for the two non-threaded comments, whose threaded placeholders are discarded |
| `meta.json` | file hash, export timestamp from `.structure.md` if present, sheet count |

`dump-workbook` runs in two passes: `--init-manifest` dumps structure only
(everything above except `rows.tsv`) and fills the manifest's mechanical
columns; `--manifest`, after Gate M, adds `rows.tsv` for the confirmed
reference tabs. Plain-cell values are not dumped (QF-1), with that one
exception: a tab named in its confirmed manifest row's `reference_tabs[]` has
its cells dumped as `rows.tsv` (sheet, row index, one column per header
cell), because those cells *are* definitions (§9); no other tab's plain cells
are dumped. Formulas wrapped in
`IFERROR(__xludf.DUMMYFUNCTION("…"), cached)` are unwrapped to the Google
source by joining the `"&"` 255-character splits and un-doubling the inner
quotes, with the cached value kept beside them. Implemented with the standard
library so the engine gains no dependency.

## Appendix D — Persian labels

The UI shows nothing in English except ids, keys, codes, formulas and
numbers (QF-42). Every label below lives in `ui/src/lib/factsLabels.ts`; the
stored value is the English key on the left. Where the estate's own staff
have a word for a thing, that word is used («آیتم», «مانده شب», «تلورانس»),
so the reviewer reads the vocabulary of the meetings, not a translation of a
schema.

**Kinds**

| value | label | shown as, by shape |
|---|---|---|
| `item` | آیتم | |
| `record` | جدول | `role: log` → «جدول ثبت»; `reference` → «جدول مرجع»; `mirror` → «نسخهٔ پیوندی»; `report` → «گزارش»; `config` → «تنظیمات» |
| `measurement` | اندازه‌گیری | |
| `rule` | قاعده | no inputs → «مقدار ثابت»; `lang: feel` → «فرمول»; `table` → «جدول تصمیم»; `text` → «ضابطه»; `sheets` → «فرمول شیت»; `gs` → «اسکریپت» |
| `note` | یادداشت | |

**Epistemic status of a field — distinct from the confirmation tick** (a
`null` leaf is بی‌پاسخ, an open account is متعارض, a `field_status` line is
استنباطی or عرفی, anything else is صریح — QF-6)

| value | label |
|---|---|
| `confirmed` | صریح |
| `inferred` | استنباطی |
| `informal` | عرفی |
| `disputed` | متعارض |
| `unknown` | بی‌پاسخ |

**Confirmation state of an entry (QF-25)** — two values, as for a flowchart

| state | label |
|---|---|
| confirmed, fingerprint matches | تأییدشده |
| not confirmed (never ticked, or changed since) | تأییدنشده |

**Badges, counts and the disabled tick** — properties of the entry, shown
beside the chip, never inside it

| thing | label |
|---|---|
| stub | پیش‌ثبت |
| retired | بازنشسته |
| red counts on a list row | «{n} بی‌پاسخ» · «{n} متعارض» |
| tick disabled on a red entry | قابل تأیید نیست |
| universal entry the reviewer cannot tick | no control, no label |

**Enumerations**

| field | value → label |
|---|---|
| `item.category` | `ingredient` مادهٔ اولیه · `product` محصول · `packaging` بسته‌بندی · `consumable` مصرفی · `place` محل نگهداری · `other` سایر |
| `item.state` | `raw` خام · `cooked` پخته · `frozen` منجمد · `prepared` آماده‌شده |
| `record.medium` | `sheet` کاربرگ · `paper` فرم کاغذی · `external` سامانهٔ بیرونی · `native` داخلی |
| `record.role` | `log` جدول ثبت · `reference` جدول مرجع · `mirror` نسخهٔ پیوندی · `report` گزارش · `config` تنظیمات |
| `record.cadence` | `nightly` هر شب · `shift` هر شیفت · `daily` روزانه · `weekly` هفتگی · `monthly` ماهانه · `ad_hoc` موردی |
| `fields[].type` | `string` متن · `number` عدد · `integer` عدد صحیح · `boolean` بله/خیر · `date` تاریخ |
| `measurement.quantity` | `mass` وزن · `count` تعداد · `volume` حجم · `duration` مدت · `money` مبلغ · `ratio` نسبت · `other` سایر |
| `outputs[].nature` | `standard` استاندارد تعیین‌شده · `target` هدف · `observed` مشاهده‌شده در عمل · `limit` حد مجاز |
| `rule.lang` | `feel` فرمول · `table` جدول تصمیم · `text` ضابطه · `sheets` فرمول شیت · `gs` اسکریپت |
| `table.hit` | `first` اولین سطر · `unique` تنها سطر · `collect` همهٔ سطرها |
| `table.aggregate` | `sum` جمع · `product` حاصل‌ضرب · `min` کمینه · `max` بیشینه |
| `rule.divergence` | `none` یکسان با الگو · `intentional` تفاوت عمدی · `drift` انحراف از الگو · `unknown` نامشخص |
| `accounts[].status` | `open` باز · `chosen` انتخاب‌شده · `rejected` ردشده |
| `issues[].kind` | `scale` تغییر مقیاس · `unit_kind` تغییر نوع واحد · `column_shift` جابه‌جایی ستون · `junk` دادهٔ نامعتبر · `bug` خطای فرمول یا اسکریپت · `cross_record` ناسازگاری بین دو جدول · `code_collision` تداخل کد |
| `issues[].fix.op` | `multiply` ضرب در · `divide` تقسیم بر · `shift_columns` جابه‌جایی ستون‌ها · `ignore` نادیده گرفتن |
| `source[].type` | `sheet` کاربرگ · `script` اسکریپت · `comment` یادداشت سلول · `validation` اعتبارسنجی · `cf` قالب‌بندی شرطی · `photo` عکس · `pdf` PDF · `docx` سند Word · `voice` جلسه · `process` فرایند · `chat` گفتگو |
| `inputs[].from` literals | `operator` انتخاب اپراتور · `calendar` تقویم |
| `meta.origin` | `pipeline` اجرای خودکار · `chat` گفتگو · `ui` پنل |

**Envelope fields**

| field | label |
|---|---|
| `id` | شناسه |
| `key` | کلید |
| `title` | عنوان |
| `aliases` | نام‌های دیگر |
| `statement` | بیان |
| `scope` / `departments` / `branches` | دامنه / دپارتمان‌ها / شعبه‌ها |
| `source` | منابع |
| `status` | وضعیت |
| `field_status` | وضعیت فیلدها |
| `accounts` | روایت‌ها |
| `accounts[].speaker_role` | گوینده (نقش) |
| `valid_from` / `valid_to` | معتبر از / معتبر تا |
| `supersedes` / `superseded_by` | جایگزینِ / جایگزین‌شده با |
| `retired` | بازنشسته |
| `issues` | نقص‌ها |
| `processes` | فرایندهای مرتبط |
| `updated_at` | آخرین تغییر |

**Payload fields**

| field | label |
|---|---|
| `inputs` / `outputs` | ورودی‌ها / خروجی‌ها |
| `expr` | فرمول |
| `value` / `range` (`min`, `max`) | مقدار / بازه (کمینه، بیشینه) |
| `unit` / `unit_raw` | واحد / واحد به نوشتهٔ منبع |
| `per` | به ازای هر |
| `of` | برای |
| `writes_to` | ثبت در (measurement) · نوشته می‌شود در (rule output) |
| `from` | خوانده می‌شود از |
| `via` | با تبدیل واحد |
| `share` | سهم |
| `calls` | فراخوانی‌ها |
| `identifier` | نام تابع |
| `original` / `original_ref` | متن اصلی |
| `port` | باید عیناً در ERP پیاده شود |
| `edge_cases` (`input`, `expected`, `why`) | موارد خاص (ورودی، خروجی مورد انتظار، چرا) |
| `template_of` / `divergence` | الگو / تفاوت با الگو |
| `fields` / `header_fields` / `rows` / `sections` / `signatures` | ستون‌ها / فیلدهای سربرگ / ردیف‌ها / بخش‌ها / امضاها |
| `fields[].title` / `key` / `type` / `constraints` / `derived` / `group` / `filled_by` / `refItems` | عنوان / کلید / نوع / محدودیت‌ها / محاسبه‌شده با / گروه / تکمیل‌کننده / ارجاع به آیتم |
| `constraints.enum` / `readOnly` / `required` / `minimum` / `maximum` | مقادیر مجاز / فقط‌خواندنی / اجباری / کمینه / بیشینه |
| `rows[].section` / `when` / `open` | بخش / فقط در / ردیف باز |
| `sections[].doc_number_field` | فیلد شمارهٔ سند |
| `signatures[].role` / `row_range` | نقش امضاکننده / ردیف‌ها |
| `primaryKey` / `foreignKeys` / `reference_fields` / `transform` | کلید اصلی / ارتباط با جدول دیگر / ستون‌های مقابل / تبدیل |
| `location` (`path`, `spreadsheetId`, `sheet`, `sheetId`, `hidden`, `identifier_scheme`) | محل (مسیر، شناسهٔ فایل، برگه، شمارهٔ برگه، مخفی، شیوهٔ شناسه) |
| `blank_master` | برگهٔ خالی برای پر کردن |
| `grain` | هر ردیف یعنی |
| `cadence` | تناوب |
| `day_boundary` | مرز روز کاری |
| `approved_by` | تأییدکنندهٔ فرم |
| `mirror_of` | نسخه‌ای از |
| `reconciled_against` (`cell`, `against`) | تطبیق با مقدار ثابت (سلول، مقدار ثابت) |
| `movement` (`from`, `to`, `reason`) | انتقال (از، به، دلیل) |
| `method` / `when` / `by` / `exceptions` | روش / زمان / توسط / استثناها |
| `code` / `code_absent` | کد / بدون کد |
| `category` / `group` / `state` / `grade` | دسته / گروه / حالت / درجه |
| `pack` (`size`, `unit`) / `units` (`pack_unit`, `factor_to_base`) | بسته (تعداد، واحد) / واحدهای بسته‌بندی (واحد بسته، ضریب تبدیل به واحد پایه) |
| `tracked` (`record`, `value`, `reason`) | ردیابی (در جدول، می‌شود/نمی‌شود، دلیل) |
| `stub` | پیش‌ثبت |

**Screens, row classes and actions**

| thing | label |
|---|---|
| the section | داده‌های کمّی |
| coverage line | «{n} از {m} کاربرگ خوانده شده» |
| orphaned reference | ارجاع بی‌مقصد |
| moved source | منبع تغییرکرده |
| link to a tombstoned process | اشاره به فرایند بازنشسته (جایگزین: {heir}) |
| link whose node is gone | گرهٔ ارجاع‌شده حذف شده |
| confirm entry | تأیید این مورد |
| revoke confirmation | برداشتن تأیید |
| resolve a dispute — choose an account | انتخاب این روایت |
| download a source file — the popup | «فایل منبع دانلود شود؟» · دانلود · انصراف |
| consumers of an entry (reverse index) | استفاده‌کنندگان |
| raw view | نمای خام (فقط‌خواندنی) |
| a neighbour the caller may not open — `{"restricted": true}` in `resolved` / `row_titles` / `path_labels` / `consumers` / `processes` | خارج از دسترسی شما |
| filters: kind / scope / branch / confirmation | نوع / دپارتمان / شعبه / وضعیت تأیید |
| confirm dialog | «کل این داده تأیید شود؟» — «اثر انگشت از کل داده گرفته می‌شود؛ هر تغییر بعدی تأیید را باطل می‌کند.» |

**Section headings, from the design**

| card | heading |
|---|---|
| statement | بیان |
| inputs | چه چیزهایی لازم دارد — «عددهایی که این قاعده از جای دیگر می‌خواند» |
| outputs | چه چیزی می‌سازد — «نتیجهٔ این قاعده و جایی که نوشته می‌شود» |
| decision table | جدول تصمیم · «در غیر این صورت» for `default` |
| lifecycle | اعتبار زمانی · «بسته‌شده» beside `valid_to` |
| record structure | ساختار و مکان جدول |
| printed rows of a paper form | قلم‌های چاپ‌شده روی فرم · «دیگر استفاده نمی‌شود» for a retired row · «ردیف خالی» for `open` |
| column without a unit that needs one | واحد ثبت نشده |
| item packaging | واحدهای بسته‌بندی · واحد پایه |
| edge cases | موارد خاص |
| open accounts | روایت‌های متعارض |
| an issue | نقص: {kind} |
| sources | منابع · فرایندهای مرتبط · استفاده‌کنندگان |

Rules for the file: one exported map per enumeration, keyed by the English
value; one exported map for field names; a `label(kind, value)` helper that
throws in development on a missing key; and the test of QF-42, which reads
every `enum` and `const` in `facts.schema.json`, `manifest.schema.json` and
`facts-run-meta.schema.json` and asserts a label for each. Adding a value to a
schema without a label fails the build. A label may be changed at any time
without touching the store.
