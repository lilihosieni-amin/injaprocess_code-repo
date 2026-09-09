# map:usefulness

## summary
Only one consumer of a fact exists today: the Panel's two facts screens (`/facts` list, `/facts/:fid` detail) plus the source-download and resolve routes. Nothing else reads `facts/*.json` — not the process pipeline (classify/extract/summarize/consolidate contain zero facts references), not the department report/PDF builder (`exports.py` has none; §18 ceiling), not the reader shell, not the canvas. The ERP intent that justifies the whole store is stated in exactly ONE sentence, in the design spec (§1: "an ERP will be built from these processes with Claude Code's help — so formulas must be stored unambiguously for a machine"); the PRD names facts/quantitative/sheets/ERP nowhere across its 117 FRs, and the ARD has no facts section at all — only three passing mentions of the directory. So "useful" has never been written down as a testable thing, and the agent prompt's step 2 instead orders a mechanical inventory ("per non-empty tab one record… per conditional-format rule a flag rule… per cell comment a constant rule or note"). The result matches every complaint the user made, and is measurable: 452 of 486 statements (93%) name a cell, column, tab or file and 196 (40%) carry an A1 coordinate; 156 rules collapse to 81 distinct shapes, with the deviation rule written 8 times; 70 of 156 records are mirrors; 24 rules are "day/month/year read from the date tab"; 20 rules come from cosmetic conditional formatting. Meanwhile the three edges the spec calls the ERP's real inheritance — `foreignKeys`, `reconciled_against`, `template_of` — are used ZERO times, 139 items carry no `units[]` and no `tracked`, only 11 of 156 records say who fills them in, and reference tables hold 85 rows where the spec says the BOM alone is ~1,200 cells. The process link is effectively dead: 34 of 486 entries (7%) link a process, naming 3 of 36 cooking process files (29 of which use quantitative vocabulary), no process JSON contains an `F-` id, and the server's `?process=`/`?consumes=` reverse indexes are called by no UI code, so no process screen can reach a fact. Audit health: 62 `row_gone`, 15 `unconsumed_constant`, 7 `unknown_role`, 4 `duplicate_output`; `check` adds 589 `source_moved` and coverage 13/28 workbooks. Critically, two of the user's complaints (mirror tables, conditional-format colouring) are the spec working as designed — QF-10 and QF-14 rule 5 order them — so this is a spec correction, not only a prompt fix.

## problems
- [high/agent-prompt] No usefulness test exists anywhere — the agent is told to convert everything :: data-repo/.claude/agents/quantify.md:15 'turn every quantitative statement in them into one of the five fact kinds'; :71 'Work through them in order; nothing here is optional'; :74-84 step 2 = 'per non-empty tab one record … per formula group one rule … per validation a constraints.enum; per conditi
- [high/spec] The product intent for facts is one sentence in a spec; PRD and ARD carry no requirement, no invariant, no acceptance criterion :: grep -n -i 'fact|ERP|quantit' PRD.md → 5 hits, all unrelated ('org-chart fact', 'from the facts'); 117 FR-* in PRD.md, none about facts. grep over ARD.md → only the directory tree (ARD.md:115,120,133), the commit-staging widening (:449) and the git-tracked list (:721); no '## facts' section, no trac
- [high/output-format] Statements are written as sheet navigation instructions — 93% name a cell, column, tab or file :: 452 of 486 statements match سلول|ستون|تب|محدوده|ردیف or an A1 range; 196 contain a bare A1 coordinate. F-00345 statement: «ستون J تب پیتزا (گروه J6:J15): انحراف برابر است با مصرف واقعی منهای مصرف اعلامی.» F-00002 (item): «…که وزن مانده آن در تب‌های «موجودی اول شب» و «موجودی آخر شب» فایل Pitza.xlsx ث
- [high/spec] Key identity is per-tab, which structurally forces one rule per line and per branch :: QF-32 table (spec:379): 'rule from a sheet formula | {record.key}__{column.key}'. Store: 156 rules → 81 distinct (expr + input keys + output keys) shapes; `masraf_vaqei - masraf_elami` written 8×  (F-00345/357/369/378 chalebagh, F-00418/430/442/451 naharkhoran); 22 concepts appear 4× each across the
- [high/agent-prompt] template_of — the spec's only branch-twin collapse mechanism — used zero times, and barely mentioned in the prompt :: grep -o 'template_of' facts/rules.json → 0; '"divergence"' → 0. Spec QF-4 (:442): 'Where two branch workbooks carry the same formula, the entries are related by template_of so a copy and a drift are distinguishable'; Appendix A (:2132) rates 'branch twins with identical formulas' as 'clean' on the s
- [high/spec] Mirror tables are 45% of the record store — and the spec orders them :: 70 of 156 records have role 'mirror' (F-00202…F-00236 chalebagh, F-00259…F-00293 naharkhoran), each carrying only a title and `mirror_of`, no fields. QF-10 (spec:915) 'That dependency graph *is* the data flow and is the single most useful thing the ERP builder inherits' and agent prompt step 2 'a on
- [high/spec] Conditional formatting produces 20 rules for a sign test at zero — also ordered by the spec :: QF-14 rule 5 (spec:1100): 'Is a threshold that exists only as a colour → rule whose output is a flag, with the threshold as a constant rule (in this estate every conditional-format threshold is a sign test at 0 …)'. Store: 16 `__flag_enheraf_{mosbat,manfi}` rules (`expr: enheraf > 0` ×4, `enheraf < 
- [high/data-quality] The three ERP-critical edges are empty: foreignKeys 0, reconciled_against 0, template_of 0 :: Across 156 records: `foreignKeys` 0, `reconciled_against` 0. Across 156 rules: `template_of` 0. Spec §9 (:1160-1170) says reconciled_against is what surfaces 'the report multiplies single-pizza dough by 1 where the BOM says 180 g, and without this edge nothing can surface it'; QF-10 calls the cross-
- [high/data-quality] 139 items are labels: no units[], no tracked, and categories that are not the spec's enum :: items with `units[]`: 0; with `tracked`: 0. `category` values in store: menu_item 69, meat 22, beverage 14, vegetable 8, packaging 7, dairy 6, bread 4, sauce 3, prepared 3, dough 1, pasta 1, oil 1 — none of them the spec's `ingredient|product|packaging|consumable|place|other` (spec:760). schemas/fac
- [high/data-quality] The highest-value payload (the BOM / reference tables) is largely unextracted while the low-value walk completed :: 16 reference records hold 85 rows total. Spec §9 (:1128): 'The BOM in Mavade Avalie is 12 tabs and ~1,200 cells of definitions.' `merge facts check` reports coverage 13 of 28 workbooks and 15 `uncited_workbook` lines. Meanwhile 70 mirrors, 24 date-passthrough rules and 20 cf rules were written.
- [high/ux] The process link is effectively dead: 7% coverage, three processes, and a reverse index no UI calls :: 34 of 486 entries carry `processes[]`, naming cooking-030 (29), cooking-024 (3), cooking-032 (2) — 3 of 36 cooking process files, 29 of which contain انحراف|مغایرت|تلورانس|مصرف اعلامی|مانده. `grep -o 'F-[0-9]{5}' data-repo/departments/*/processes/*.json` → 0. Backend implements both reverse indexes 
- [medium/engine] 62 row_gone: eight report records address rows the estate's own dump does not have :: `merge facts audit`: 62 `row_gone` lines, all from F-00180, F-00182-185 (spreadsheet 1shXFbK…) and F-00238-241 (1Kk0lA8…), e.g. "row 'item_1' is in no row of the latest dump". Those are the report tabs whose rows the agent keyed by item (`item_1`…`item_25`, `refresher`, `dugh`) while the dump's rows
- [medium/data-quality] duplicate_output: five rules claim to write the same field :: `merge facts audit`: "duplicate_output F-00332 F-00182/enheraf_ba_tolerance is written by F-00332, F-00333, F-00334, F-00335, F-00347" and three more of the same shape (F-00336, F-00405, F-00409). The per-item tolerance constants (10 `__tolerance__` rules) each declare they write the deviation-with-
- [high/spec] The note kind is an unvalidated escape hatch and absorbed the content that should have been rules and record fields :: schemas/facts-delta.schema.json:110 — kind 'note' requires `data: {type: object}` and nothing else. Store: 22 notes, including F-00465 (a cell comment reading «149», the only comment-sourced entry in the store), F-00485 (carton air-hole placement), and the pair F-00466 + F-00473 which are two notes 
- [medium/ux] 27% of the store can never be confirmed, so the one human review loop is blocked :: Store statuses: unknown 130 (rule 57, record 56, item 9, measurement 4, note 4), inferred 161, confirmed 192, informal 3. QF-24/QF-25 (spec:1560, 1594): 'An entry whose status is disputed or unknown cannot be confirmed: the endpoint answers 409 and the UI draws the control disabled, labelled «قابل ت
- [medium/engine] QF-34's duplicate-title guard cannot fire across branches, so 12 identical titles landed :: 12 duplicated titles in the store, all of the form «روز تب پیتزا از تب تاریخ» ×2, «ماه تب فرنگی از تب تاریخ» ×2, … QF-34 (spec:395): 'merge refuses a new key whose title byte-equals an existing title in the same kind and scope'. The twins differ in `scope.branches` (chalebagh vs naharkhoran), so the
- [low/data-quality] Role vocabulary has already drifted from the process side :: `merge facts audit`: 7 `unknown_role` lines — «سرپرست بخش» on F-00141-145 and F-00295, «سرپرست شعبه» on F-00295 — 'appears in no process's actor or mechanisms'. Spec §15 Governance (:1737) makes `speaker_role`/`filled_by`/`approved_by`/`by`/`signatures[].role` 'roles drawn from the vocabulary the pr
- [medium/spec] Facts reach no derived output and no other pipeline — they are a Panel-only leaf :: grep -rln 'facts/' --include=*.py over engine + ui-backend (excluding tests): only engine/merge_facts/*, engine/merge/cli.py, and ui-backend's facts_store/models/engine/routers-facts. `grep -n facts ui-backend/inja_ui_backend/exports.py` → nothing. §18 ceilings: 'Facts are not in the reader view in 

## details
## 1. Who reads a fact today, and which fields are rendered

### 1a. The Panel UI — the only human surface (two screens, Panel-only, QF-23)

`ui/src/routes.tsx:43,47` — `/facts` and `/facts/:fid`. There is no third facts route and no facts affordance anywhere else in the app.

**`ui/src/facts/FactsList.tsx` (397 lines) — the list.** Six columns (`HEADS`, :331): `title`, `id` (hidden ≤760px), `kind` (Persian label), `scope` (Persian «آشپزخانه · چاله‌باغ» or «کل سامانه»), `confirmation`, chevron. Under the confirmation chip, `noteLine()` (:381) renders «{n} بی‌پاسخ · {n} متعارض» from `red_counts`, plus «پیش‌ثبت» (stub) and «بازنشسته» (retired) badges. Four filters: kind, department (+«سراسری»), branch, confirmation. Search covers `title`, `id`, `aliases` only (`factsFilter.ts:matches`).

Served but deliberately NOT drawn (documented at :36-45): the coverage line («{n} از {m} کاربرگ خوانده شده» — owner refused it 2026-08-31), a per-row confirm tick, a result count. Also served and unused: `key`, `status`, `updated_at`, `fingerprint`.

**`ui/src/facts/FactDetail.tsx` (388) + `cards/` (2,900 lines) — the entry.** Header: kind·shape·medium chip (`kindLine`, :175 — e.g. «قاعده · مقدار ثابت», «جدول · جدول ثبت · فرم کاغذی»), confirmation chip, scope line, `port` pill, `retired` pill, title, `FactConfirm` tick. Then `statement` in its own card with `aliases` chips. Then, in the design's interleaved order: `RuleValueCards` → `LifecycleCard` (valid_from/valid_to/supersedes/superseded_by) → `RuleCard` (inputs/outputs/expr/calls/edge_cases/«متن اصلی» collapsed) → `RecordCard` (725 lines — location, grain, primaryKey, fields grid, rows grid with per-cell state colour) → `ItemCard` (code, category, units, tracked) → `MeasurementCard` (quantity, unit, method, when, by, writes_to, exceptions) → `AccountsCard` (disputed accounts grouped by `path_labels`, with `speaker_role`) → `FieldStatusCard` («استنباطی»/«عرفی» markers) → `IssuesCard` (from_date, fix, affects) → `SourcesCard`.

`SourcesCard` (:229) is the one place the link graph shows: `source[]` rows (each a download-confirm popup, QF-39 — nothing rendered inline), then «فرایندهای مرتبط» from `bundle.processes` with four orphan classes drawn, then «مصرف‌کنندگان» chips from `bundle.consumers`, then a footer of `id | key | spreadsheetId | «آخرین تغییر» updated_at`.

No raw-JSON view (owner refused, 2026-08-31).

### 1b. ui-backend — `ui-backend/inja_ui_backend/routers/facts.py` (1,036 lines)

| route | what it serves | called by UI? |
|---|---|---|
| `GET /api/facts` | per-row: id, kind, key, title, aliases, scope, status, retired, stub, red_counts, fingerprint, confirmed, updated_at + `coverage` | yes (`useFacts`) |
| `GET /api/facts?process=…` | entries linking a process (`_links`, :445) | **no caller** |
| `GET /api/facts?consumes=F-…` | entries consuming an id (`_consuming`, :431) | **no caller** |
| `GET /api/facts/branches` | branch registry from the manifest | yes |
| `GET /api/facts/{fid}` | `_bundle` (:578): entry, confirmation{fingerprint,confirmed,can_confirm}, red_paths, resolved, row_titles, path_labels, consumers, processes | yes |
| `GET /api/facts/source` | gated file download over `attachments/sheets/**`, `departments/*/attachments/**`, transcripts | yes |
| `POST /api/facts/{fid}/resolve` | runs `merge facts resolve` in a run dir, returns the re-read bundle | yes |
| `POST /api/confirmations/{fid}` | the tick (409 on stale print, 409 on red) | yes |

### 1c. Engine

`merge facts apply|resolve|retire|revert|promote|export|audit|check` is the sole writer plus two read-only reporters. `engine/merge/cli.py` reads the store for the tombstone-relay lookup. `merge facts export --record <key>` (`engine/merge_facts/verbs.py:278`) is the ERP's designed read path and has no caller anywhere.

### 1d. Who does NOT read a fact

- **The process pipeline.** `grep -n 'F-0|facts/|facts\b'` over `classify.md`, `extract.md`, `summarize.md`, `consolidate.md`, `process-voice/SKILL.md`, `idef-extraction/SKILL.md`, `edit-process/SKILL.md` returns only the tombstone-relay sentence (`process-voice/SKILL.md:542`, `edit-process/SKILL.md:118`) and the word "artifact". No process agent has ever read a fact.
- **The department report / PDF export.** `grep -n facts ui-backend/inja_ui_backend/exports.py` → nothing. §18: "Facts are not in the department PDF export".
- **The reader shell** (QF-23), **the flowchart canvas** (§18: "No canvas badge for facts"), **the comment system** (§18: "Facts are not a comment target").
- **Any other engine CLI.** `grep -rln 'facts/' --include=*.py engine ui-backend` (minus tests) lists only `merge_facts/*`, `merge/cli.py`, and ui-backend's five facts modules.

**Conclusion for (1): the audience of a fact today is one reviewer, on one list, ticking a box.** The ERP — the reason the store exists — is not a reader yet, and neither is anything else in the system.

---

## 2. The ERP-future intent, quoted

**PRD.md: nothing.** 117 `FR-*` requirements; `grep -i 'fact|ERP|quantit|sheet|excel'` returns five hits, all of them the ordinary English word "fact" ("an org-chart fact", "settles the same question from the facts"). There is no functional requirement, no acceptance criterion and no invariant for the facts store.

**ARD.md: three passing mentions and no section.** `attachments/sheets/ # the Google Sheets estate, one dir per workbook (quantitative facts)` (:115); `facts/ # global fact store, written only by merge facts (INV-2-style)` (:120); `runs/facts/{department}/{stamp}/` (:133); the commit-staging widening at :449; the git-tracked list at :721. `grep '^## |^### ' ARD.md | grep -i 'fact|quant'` → empty.

**The entire stated intent lives in the spec.** All quotes from `code-repo/docs/superpowers/specs/2026-08-29-quantitative-facts-design.md`:

- §1, :84-87 — the load-bearing one: *"It is **input to a later stage** — an ERP will be built from these processes with Claude Code's help — so formulas must be stored unambiguously for a machine, not merely legibly for a human."*
- §1, :119 — *"Reconstruction is real work. **It must happen once and be saved, not repeated by every future reader.** That is what this design stores."*
- §2 QF-1, :131 — *"«35 kg of cheese on 16 Azar 1404» stays in `Pitza.xlsx`, which is kept verbatim on the server (§3) so the ERP can read history from the files and *meaning* from here."*
- §2, :148 — *"A missing dimension the ERP needs is recorded as seeded constant rules whose output `value` is `null` … so the readiness screen shows it, rather than reading green over it."*
- §4 QF-2, :309 — *"`cooking` writes a tolerance of 5 % and `accounting` writes 313 pieces, in two files, and nothing notices until the ERP builder does."*
- §5 QF-16, :426 — *"duplicate rules do the most damage of any duplicate, because an ERP builder facing two thresholds cannot tell which is authoritative."*
- §7 QF-10, :915 — *"That dependency graph *is* the data flow and is the single most useful thing the ERP builder inherits."*
- §7, :958 — *"'List the ERP's settings table' is `inputs == []`."*
- §7 QF-12, :1055 — *"**`port: true` marks a function the ERP must reproduce exactly**"*
- §9, :1172 — *"The ERP reads the rows from `records.json`; `merge facts export --record <key>` emits a CSV of them on demand as a derived view that is never committed."*
- §7 QF-11, :919 — *"at migration time that is the difference between importing correctly and importing off by a factor of a thousand."*
- §18, :2074 — *"revisit when the ERP names its inventory atom"*; Appendix A, :2121 — *"the ERP's inventory atom (item, qty, from, to, reason) is representable but not first-class"*.

**Read together, the ERP intent is: the store must be able to STAND UP a system — item master with pack conversions, table definitions with units and grain, computed fields with unambiguous expressions, settings-table constants, cross-table joins, and the defects that make a naive import wrong.** Every one of those is a named artefact, and each is a testable question about an entry.

---

## 3. THE USEFULNESS TEST — 8 yes/no questions, evaluated in order, first NO wins

An entry is written only if it passes all eight. Each question is answerable from the entry alone, without re-reading the sheet.

> **U1 — Survives the sheet?** If the workbook, tab and cell this came from were deleted tomorrow, would the entry still say something true about how the restaurant runs?
> *NO → drop. This is the master question; it kills mirrors, cell-to-cell pass-throughs and cosmetic formatting.*

> **U2 — Is it a quantity, a computation, a threshold or a policy?** Does it define a number someone measures, a formula someone computes, a limit someone respects, or a rule about what gets counted at all — as opposed to describing where a number is stored or how a spreadsheet is wired?
> *NO → drop, or fold under U7.*

> **U3 — Can you name the ERP artefact it becomes?** Say it out loud in one phrase: an item-master row; a table column with a unit; a BOM/recipe row; a settings-table constant; a validation constraint; a computed field; a join between two tables; a known data defect. If you cannot name one, it is not a fact.
> *NO → drop.*

> **U4 — Can it be stated without naming a cell, a column letter, a tab or a file?** Write the statement that way first. Locators belong in `source[]`, which already has typed `sheet`/`cell`/`lines` fields. If the sentence collapses when the coordinates are removed, the entry was about the spreadsheet, not the restaurant.
> *NO → drop. YES → keep the rewritten statement.*

> **U5 — Is it the same wherever it appears?** If the same computation, threshold or column meaning occurs on four line tabs and in two branch workbooks, it is ONE entry whose scope names all of them (or is empty). Only a value that genuinely differs is a second entry, and then it carries `template_of` + `divergence` naming exactly what differs.
> *NO (i.e. it is a copy) → merge into the existing entry, add a source, do not mint.*

> **U6 — Does it change every night?** (QF-1, unchanged.) A nightly observation, a cash count, a stock reading is not a fact.
> *YES → drop.*

> **U7 — Does it already have a home?** Is this a column's `description`, `unit` or `constraints.enum` on an existing record; a `tracked` exception on an existing item; a `units[]` pack factor; a second `source`/`account` on an existing cell; an `issues[]` entry; or an `unknown` field on an entry that exists? If so, attach it there.
> *YES → attach, do not mint a new entry.*

> **U8 — If it is a `note`, what does it point at and what does it ask?** A note is what has failed U1–U7 and is still worth a human's attention. It must name at least one other entry (`processes[]`, an `issues[].affects`, or a `{ref}` in its statement) and state the open question. A note that names nothing and asks nothing is discarded, not stored.
> *NO → drop.*

Enforceability: U3, U4, U5 and U8 are mechanically checkable and belong in `merge facts apply`/`validate`, not only in the prompt — U4 as a regex on `statement` (reject an A1 coordinate and the words سلول/ستون/تب when they name a source already in `source[]`), U5 as a refusal when a new rule's `(expr, input keys, output keys)` triple already exists in the store without a `template_of` link, U8 as a required non-empty pointer on `kind: note`.

---

## 4. The user's examples, classified by the test

| example | evidence in the store | test | verdict |
|---|---|---|---|
| **line deviation rule** | F-00345/357/369/378 (chalebagh) + F-00418/430/442/451 (naharkhoran); all `expr: masraf_vaqei - masraf_elami` | U1 ✓ U2 ✓ U3 ✓ (a computed field) U4 ✗ today U5 ✗ ×8 | **KEEP, ONE entry.** «انحراف = مصرف واقعی − مصرف اعلامی», scope empty or naming both branches, no line and no tab in the key. Today it is written 8×. |
| **tomato/pizza per-line copies** | 22 concepts × 4 line tabs in each of 2 report workbooks; 73 rule titles duplicate once the branch suffix is stripped; 156 rules → 81 distinct shapes | U5 | **MERGE.** Where a line genuinely differs (only the tolerance values do), a second entry with `template_of` + `divergence: intentional`. |
| **«روز تب پیتزا از تب تاریخ»** | F-00337/349/361/370 + the naharkhoran four, and the same for ماه/سال — **24 rules**, each `expr: ruz`, input `F-00181/ruz`, output `F-00182/ruz` | U1 ✗ U2 ✗ U3 ✗ | **DROP all 24.** This is a cell reference, not a definition. |
| **cf zero-colouring** | F-00379 (`outputs: [{value: 0, unit: null}]`) + 16 `__flag_enheraf_*` rules; 20 cf-sourced rules total | U1 ✗ U2 ✗ U3 ✗ | **DROP all 20.** Keep a cf rule ONLY when the threshold is a number the business chose (not a sign test at 0) — then it is one constant with the operating meaning, not a flag per tab. **Requires editing QF-14 rule 5**, which currently orders exactly this. |
| **«موجودی آخر شب — لاین پیتزا»** record | F-00147: `role: log`, `grain` «یک ردیف به ازای هر شب», `primaryKey [day,month,year]`, 15 fields — 12 of them item columns each with `unit: kg`, `unit_ref` and `of: {ref}` to the item | U1 ✓ U2 ✓ U3 ✓ (this IS the ERP's nightly stock table) U4 ✗ | **KEEP** — this is one of the most valuable entries in the store, and the user's instinct is wrong here. But: rewrite the statement without «تب … در فایل Pitza.xlsx»; and it must gain `filled_by`/`when` — only **11 of 156** records carry `filled_by`, so QF-1's "who fills it in, when" is missing from 93% of records. |
| **mirror tables** | 70 of 156 records, role `mirror`, each carrying a title and `mirror_of` and no fields | U1 ✗ U2 ✗ U3 ✗ (it becomes nothing in an ERP; the ERP has one table) U7 ✓ | **DROP as entries; keep as an edge** on the report record (`foreignKeys[]` / `inputs[].from`) — which is used **0 times** in the store. **Requires editing QF-10 and agent obligation 2**, which order the mirror record. |
| **cell comment «149»** | F-00465 — the only comment-sourced entry in the whole store; its own statement admits «معنای این کامنت … روشن نیست» | U2 ✗ U3 ✗ U8 ✗ | **DROP.** At most an `issues[]` entry or an `unknown` field on the Kanter record. |
| **«معنای ستون‌های تعداد»** | F-00466 **and** F-00473 — two notes about the same two columns of the same «OFF اجرایی» tab | U7 ✓ (twice) | **FOLD** into `fields[].description` on that record, one description per column; mint neither note. Also an outright duplicate pair. |
| **«اقلامی که سفارش داده می‌شوند ولی مانده ثبت نمی‌شود»** | F-00468, a note listing ~12 items | U1 ✓ U2 ✓ U3 ✓ U7 ✓ | **PROMOTE**: `tracked` on each named item (0 of 139 items carry `tracked` today), or one `rule lang: text` — of which the store contains exactly **1** in 156 rules. This is the single clearest example of a real fact landing in the escape hatch. |

**Additional low-value classes the store contains that the user did not name:** 10 `__tolerance__` per-item constants that five-way duplicate one column's writer (`duplicate_output` ×4 in the audit); 15 `unconsumed_constant` audit lines including two Apps Script triggers (`gozaresh_naharkhoran__gs__on_open`, `__trigger_recalculation`) recorded as constants; and F-00485, a note about the air-hole placement on a fried-chicken carton.

---

## 5. What the process docs need from facts, and whether the link works

**What they need.** 29 of 36 cooking process files contain انحراف / مغایرت / تلورانس / مصرف اعلامی / مانده. A node that says «آمار مانده آخر شب را ثبت کن» needs to reach the record that defines those columns and their units; a node that says «انحراف را بررسی کن» needs the one deviation rule and the review threshold (which exists — F-00478, «حدود ۳۰۰ عدد» — as a note). That is the whole requirement: from a node, one press to the definition.

**Whether it works: no.**

- **Coverage:** 34 of 486 entries (7%) carry `processes[]`, and they name **3** process files — cooking-030 (29 entries), cooking-024 (3), cooking-032 (2) — out of 36. Every fact derived from the report workbooks, the BOM and the scripts is unanchored, which QF-8 explicitly permits ("that is the normal case for most sheet-derived entries") but which means the process side sees almost nothing.
- **Direction:** `grep -o 'F-[0-9]\{5\}' data-repo/departments/*/processes/*.json` → **0**. No process document references a fact. The edge exists only inside the fact.
- **The reverse index is dead code.** `routers/facts.py:445` `_links` and the `?process=` query param are implemented and tested server-side; `grep -rn 'process=\|consumes' ui/src` over non-test sources returns nothing. `ui/src/routes.tsx` registers only `/facts` and `/facts/:fid`, and no process screen draws a facts link. So the round trip a reader needs — node → fact → back — has a built server half and no client half. (`bundle.consumers` IS rendered, but that is fact→fact, not process→fact.)
- **Quality of the links that exist:** they are well-formed — each carries a `process` source with `node` and a real `quote` (e.g. F-00147 cites cooking-030-n016 «ثبت نهایی آمار مانده آخر شب در چک‌لیست…»). The mechanism is sound; it is simply almost unused and unreachable.

**Audit state of the link surface (`DATA_ROOT=… merge facts audit`, 88 lines):**

| class | n | reading |
|---|---|---|
| `row_gone` | 62 | 8 report records (F-00180, F-00182-185, F-00238-241) address rows (`item_1`…`item_25`, `refresher`, `dugh`) that are in no row of the latest dump of `1shXFbK…` / `1Kk0lA8…`. The agent invented a per-item row model for tabs the dump enumerates by date. A real store↔estate break, not staleness. |
| `unconsumed_constant` | 15 | constants no rule reads and no record field derives — 10 of them the per-item tolerances, 2 of them Apps Script triggers. |
| `unknown_role` | 7 | «سرپرست بخش» (F-00141-145, F-00295) and «سرپرست شعبه» (F-00295) appear in no process's `actor` or `mechanisms`. The facts vocabulary has already drifted from the process vocabulary that §15 governance exists to keep shared. |
| `duplicate_output` | 4 | five rules each claim to write `F-00182/enheraf_ba_tolerance`, and the same shape three more times. |

`merge facts check`: 589 `source_moved` (the `.xlsx` binaries are gitignored — expected and benign per QF-5), 15 `uncited_workbook`, and **coverage: 13 of 28 workbooks read**.

Zero `process link whose cited node is gone` and zero `tombstoned process` lines — so of the four link-health classes the audit can report, the process-link ones are clean. The problem is not broken links; it is that there are almost none, and that nothing in the UI can follow the ones there are.