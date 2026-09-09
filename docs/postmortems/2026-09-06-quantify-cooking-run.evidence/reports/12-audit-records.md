# audit:records

## summary
Of 156 records, 100 (64%, 172,919 of 421,221 entry bytes) are mirrors (70) and the stubs that exist only to be their mirror_of targets (30); 68 of the 70 mirrors have zero inbound references, and every one of the 30 stubs is referenced by nothing but mirrors, so the whole block deletes as one cascade. The mirrors are mechanically derivable: the Gozaresh markazi dump has exactly 35 tabs with exactly one formula and exactly 35 IMPORT_FROM_SHEET formulas, and each record's `import: {file_id_named_range, source_sheet, range}` is a verbatim re-typing of that formula's LET bindings — two of the eight sequential passes (B5, B7) produced 50 records each consisting of nothing but 35 mirrors + 15 stubs. The 12 BOM records are 76,654 bytes holding 1,015 hand-typed cells (583 of them zeros) sourced from a 12,406-byte rows.tsv; I verified all 1,015 against the dump and found zero transcription errors — the LLM did deterministic work perfectly, which is the argument for the engine doing it instead. The dump's own sheets.json already carries `head` (the verbatim header row), `header_row`, `codes` (the ## codes), `hidden` and `empty` per tab, so the 496 hand-written `fields[]` objects are a mechanical transform of data the engine already computed. 153 of 156 statements cite a tab, cell, column letter or .xlsx filename (140 name a file, 87 name a cell/column/range) — the exact defect the user named. The 179 unit-less fields are mostly not unknowns at all: 123 sit on columns that cannot have a unit (60 string, 52 day/month/year integers, 10 date, 1 datetime — including the unit registry's own `symbol`/`dimension`/`unit_title` columns), leaving 56 real ones, and of the 317 fields that do carry a unit, 119 (38%) are flagged `inferred` guesses. 16 of 20 chalebagh↔naharkhoran record pairs are structurally identical (12 exactly; 4 differ only by a `type` key one pass wrote and the other omitted) and could be one record scoped to both branches. The single most valuable content in the record set — 43 of 74 issues[] findings, including broken import ranges that silently drop ingredient columns from the reports — is attached to the mirror and stub entries that must be deleted, so it needs re-homing onto the import rule, not discarding. Proposed KEEP: 36 entries (182,335 bytes, 43%), with the 12 BOM records keeping identity but taking their rows[] from an engine import.

## problems
- [high/agent-prompt] 70 mirror records (33% of record bytes) that nothing references and that a grep of formulas.tsv reproduces exactly :: data-repo/facts/records.json: role=mirror on 70 of 156 entries, 137,559 of 421,221 entry bytes (32.7%). 68 of 70 have zero inbound {ref} edges from anywhere in the store (the 2 exceptions, F-00214 and F-00225, are only named inside a sibling's issues[].affects). All 70 carry mirror_of and no fields[
- [high/agent-prompt] 30 stub records exist only as mirror_of targets, for workbooks whose dumps are already on disk :: 30 entries with data.stub=true (F-00187..F-00201, F-00244..F-00258), 35,360 bytes, all role=log, all with `scope.departments: []` and `field_status: {"data/role": "inferred"}`. Inbound-reference walk: every one is referenced 1–3 times and by mirrors only — no rule, item, measurement or non-mirror re
- [high/orchestration] An LLM hand-typed 1,015 BOM cells that a 12 KB TSV already contains, deterministically and correctly :: 12 reference records F-00167..F-00178, 76,654 bytes (18.2% of record bytes), rows[] payload alone 20,883 bytes for 1,015 cells. Source: data-repo/attachments/sheets/.dump/15M2ovUmBvK3AMzGxeq-ijwE_KOQBjOZakLvQCs-eE10/rows.tsv, 12,406 bytes, 69 data rows across 12 tabs. I re-checked every cell against
- [medium/data-quality] 11 of 12 BOM records state that zero cells are omitted from rows[], while containing 583 zeros :: F-00167 statement: «سلول صفر یعنی آن ماده در آن آیتم مصرف نمی‌شود (قالب‌بندی شرطی این سلول‌ها را خاکستری می‌کند) و در rows نیامده است» — yet F-00167's rows[] contains 111 zeros. Same false claim with zero counts: F-00168 (155), F-00169 (56), F-00170 (5), F-00171 (2), F-00172 (1), F-00173 (120), F-00
- [high/agent-prompt] 153 of 156 statements describe the spreadsheet instead of the process :: Regex over statements: 153/156 mention a tab, cell, column letter, range, formula or .xlsx name; 140 name a .xlsx file; 87 name a cell address, column letter or A1-style range. Examples — F-00181: «یک ردیف پارامتر که تاریخ شمسی گزارش را در سه سلول روز (C5)، ماه (D5) و سال (E5) … می‌گیرد»; F-00149: «
- [high/spec] The 179 'unit unknown' red cells are mostly a category error: dates, day/month/year and text columns cannot have a unit :: 492 field objects on records: 317 carry a unit, 175 carry an explicit `unit: null`, 4 omit the key entirely (which the prompt forbids). Breakdown of the 179 by declared type: string 60, integer 52 (day/year columns), number 43, untyped 13, date 10, datetime 1 — so 123 of 179 sit on structurally unit
- [medium/data-quality] Units were inferable from the estate and were not propagated :: The dumper already extracts the header verbatim: sheets.json for 1hGDv6eo… gives head[0] = ["روز","ماه","سال","تعداد برگر ##14",…,"وزن گوشت چرخ کرده فرنگی ##23",…] — the وزن/تعداد prefix is the unit, and that is exactly how F-00149 got pcs on تعداد برگر and kg on وزن گوشت چرخ کرده. F-00182's own sta
- [high/data-quality] 16 of 20 chalebagh↔naharkhoran record pairs are structurally identical and should be one entry scoped to both branches :: 12 pairs identical on every (key, title, type, unit) tuple: F-00141/F-00154, F-00142/F-00155, F-00143/F-00156, F-00144/F-00157, F-00145/F-00158, F-00180/F-00238, F-00181/F-00237, F-00182/F-00239, F-00183/F-00240, F-00184/F-00241, F-00185/F-00242, F-00186/F-00243. 4 more identical on keys and titles 
- [medium/orchestration] Sequential passes produced inconsistent payloads for the same structures :: `type: "number"` present on all numeric columns of F-00159/F-00161/F-00163/F-00165 (naharkhoran pass) and absent on the identical columns of F-00146/F-00148/F-00150/F-00152 (chalebagh pass) — 95 fields store-wide carry no `type` at all. The same three date columns are keyed ('day','month','year') on
- [high/agent-prompt] The record payload vocabulary is absent from the agent prompt, so the agent invented one that diverges from the spec :: grep counts, spec vs data-repo/.claude/agents/quantify.md: refItems 17 vs 0, primaryKey 15 vs 0, cadence 6 vs 0, 'column' 0 vs 0, unit_ref 0 vs 0, named_range 0 vs 0, row_meta 0 vs 0. Store usage: `column` on 488 of 496 fields (a spreadsheet coordinate, invented); `unit_ref` 317; `of` 216 (used wher
- [high/validator] The schema validates only that medium/role/location keys exist, so out-of-spec values passed merge facts apply :: code-repo/schemas/facts-delta.schema.json line 105: `"data": { "type": "object", "required": ["medium", "role", "location"] }` — no enums, no shape. Result in the store: F-00295 has `role: "checklist"` and `medium: "app"` (spec §7 fixes role to log|reference|mirror|report|config and medium to sheet|
- [medium/data-quality] `location` lost the spec's sheetId/hidden and gained an ambiguous `file` :: location key vocabulary across 153 sheet records: spreadsheetId 153, file 153, sheet 153 — `sheetId` 0, `hidden` 1. Spec §7: '{spreadsheetId, sheetId, sheet, hidden} for a sheet'. The dump gives `hidden` for every tab in sheets.json and 70 mirror statements say «تب پنهان» in prose while `data.hidden
- [medium/data-quality] `primaryKey` is empty on the ten report/refresher records — a table keyed by nothing :: `primaryKey: []` on F-00180, F-00182, F-00183, F-00184, F-00185, F-00238, F-00239, F-00240, F-00241, F-00242 — the eight branch report tabs plus both Refresher tabs. Positively: every declared primaryKey member does resolve to a declared field (0 violations across 54 records), and the day/month/year
- [medium/data-quality] Records for Excel plumbing that fail the purpose test outright :: F-00180 / F-00238 `Refresher`: a hidden one-cell tab whose value is a recalculation timestamp, stored as data — `rows: [{"key":"refresher","refresher":1783786014375}]`, statement «این سلول به‌عنوان آرگومان صوری به همه فراخوانی‌های توابع سفارشی پاس داده می‌شود تا … دوباره محاسبه شود». F-00181 / F-002
- [low/data-quality] Statements carry transcript narrative rather than a record definition :: 13 records carry a voice source. F-00295: «سرپرست بخش باید تیک بزند و سرپرست شعبه آن را چک می‌کند؛ گوینده گفت گوشی خودش این فرم را بالا نمی‌آورد و تیک‌ها ثبت نمی‌شود و کارها را حضوری پیگیری می‌کند. نسخه در دسترس مربوط به خرداد است…». F-00294: «دستگاه اثر انگشت مستقیم به ژنراتور وصل نیست و به اندازه 
- [high/spec] 58% of the issues[] findings — the most useful content in the record set — are attached to entries that must be deleted :: 74 issues on 64 records: junk 32, column_shift 20, scale 11, cross_record 3, unit_kind 3, bug 3, code_collision 2. 43 of the 74 sit on mirror or stub entries. Examples that would be lost: F-00203 «محدوده نام‌دار Table_Pizza_Last فقط تا ستون M تعریف شده … در حالی که خود تب تا ستون O داده دارد؛ بنابرا
- [high/orchestration] Two of eight passes produced nothing but mirrors and stubs :: data-repo/runs/facts/cooking/20260902-080737/parts/facts-delta-B5.json: 50 entries, all kind=record, 35 role=mirror + 15 stubs, 91,840 bytes. facts-delta-B7.json: identical shape, 50 entries, 102,847 bytes. Neither part contains a single item, rule, measurement or note. Run wall clock (meta.json): s
- [medium/engine] The agent re-derived per-tab metadata the dumper had already computed :: data-repo/attachments/sheets/.dump/*/sheets.json entries carry {sheetId, name, hidden, dimension, rows, cols, head, header_row, codes, empty} — e.g. for 1hGDv6eo… tab «موجودی اول شب»: head[0] = the verbatim header row, header_row = 1, codes = ["##14","##10","##16","##23","##11","##13","##12","##22",

## details
## Files

- Store: `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/records.json` (630,226 B on disk; 421,221 B as compact entry JSON — all byte figures below are compact-entry bytes)
- Per-record verdict CSV: `/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/records-audit.csv` (columns: id, key, verdict, role, medium, bytes, fields, rows_, unit_null, issues, branches, mirror_of, loc_file, loc_sheet, title)

## Shape of the 156 records

| role | n | bytes | % of record bytes |
|---|---|---|---|
| mirror | 70 | 137,559 | 32.7 |
| log | 58 | 151,497 | 36.0 |
| reference | 18 | 89,976 | 21.4 |
| report | 8 | 37,135 | 8.8 |
| config | 1 | 2,473 | 0.6 |
| checklist (out of spec enum) | 1 | 2,581 | 0.6 |

medium: sheet 153, native 1, paper 1, app 1 (out of enum).
Payload key frequency: medium 156, role 156, location 156, grain 125, mirror_of 70, import 70, named_range 70, fields 55, primaryKey 54, stub 30, rows 26, filled_by 11, frequency 11, row_meta 10, approved_by 2, hidden 1.
496 field objects, 167 row objects.

## The deletable cascade

| block | entries | bytes | % |
|---|---|---|---|
| mirrors | 70 | 137,559 | 32.7 |
| stubs (targets of those mirrors only) | 30 | 35,360 | 8.4 |
| **cascade total** | **100** | **172,919** | **41.0** |
| junk plumbing tabs | 7 | 14,921 | 3.5 |
| branch-duplicate halves | 13 | 51,046 | 12.1 |
| **KEEP** | **36** | **182,335** | **43.3** |

Reference-integrity check (walk of every `{ref}` in items+records+measurements+rules+notes): 68/70 mirrors have zero inbound edges; the 2 exceptions (F-00214, F-00225) appear only in a sibling's `issues[].affects`. All 30 stubs are referenced 1–3 times and **only by mirrors**. So the 100 entries drop as one block with no dangling edge.

## Mirrors in detail

- 35 in `Gozaresh markazi.xlsx` (1shXFbKy…), 35 in `Gozaresh naharkhoran.xlsx` (1Kk0lA8h…) — perfectly symmetric.
- All 70 have `mirror_of`, none have `fields[]` or `rows[]` (spec-conformant).
- 35 mirror tabs exist in both report workbooks; 12 of those pairs import the same source (the BOM). The naharkhoran half of the paired mirrors is 73,814 B.
- 24 mirrors (55,107 B) are `Table_Ingredients_*` — the BOM described a second and third time.
- 22 are `Table_SalesData_*`.
- Derivability proof: `formulas.tsv` for 1shXFbKy… has exactly 35 `IMPORT_FROM_SHEET` lines and exactly 35 sheets with exactly one formula. Formula body: `LET(\nsheetName, "موجودی اول شب",\ndataRange,"A:S",\nIMPORT_FROM_SHEET(SheetsFileId_Farangi,sheetName,dataRange)\n)`. Record payload: `"import": {"file_id_named_range": "SheetsFileId_Pizza", "source_sheet": "موجودی اول شب", "range": "A:S"}`.

## Stubs (30)

`F-00187`–`F-00201` (chalebagh) and `F-00244`–`F-00258` (naharkhoran). All `role: log`, all `stub: true`, all `scope.departments: []`, all `field_status: {"data/role": "inferred"}`, none with `fields[]` or `primaryKey`. They stand in for 4 workbooks — and **all four have complete dumps already on disk**:

| stub target spreadsheetId | tabs in dump | first tabs |
|---|---|---|
| 1crVTmnxyXx4w… (Anbar markazi) | 5 | پیتزا، سوخاری، فرنگی، کانتر |
| 1AIjH-sWVc6t5… (Tedade Fooroosh markazi) | 12 | americanPizza، singlePizza، italianPizza |
| 1Te8IMhl4aRip… (Anbar shobe 2) | 6 | پیتزا، سوخاری، فرنگی، کانتر |
| 10JsukIEuvl6S… (Tedade Fooroosh naharkhoran) | 11 | americanPizza، singlePizza، italianPizza |

They were absent only from the run's `meta.json.workbooks` list (13 ids).

## BOM reference records

12 records, 76,654 B; rows[] payload 20,883 B; 1,015 cells; 583 zeros (57%). Source `rows.tsv` = 12,406 B, 69 data rows, 12 tabs.

| id | key | fields | rows | bytes |
|---|---|---|---|---|
| F-00167 | mavade_avalie__pitza_americai | 19 | 12 | 10,470 |
| F-00168 | mavade_avalie__pitza_italiaei | 23 | 13 | 12,059 |
| F-00169 | mavade_avalie__pitza_single | 19 | 6 | 7,541 |
| F-00170 | mavade_avalie__lazania | 8 | 2 | 3,891 |
| F-00171 | mavade_avalie__farangi | 5 | 2 | 3,210 |
| F-00172 | mavade_avalie__pasta | 6 | 2 | 3,566 |
| F-00173 | mavade_avalie__sandvich | 14 | 13 | 9,357 |
| F-00174 | mavade_avalie__sokhari | 11 | 7 | 7,046 |
| F-00175 | mavade_avalie__salad | 9 | 3 | 4,927 |
| F-00176 | mavade_avalie__starter | 16 | 7 | 9,884 |
| F-00177 | mavade_avalie__steak | 3 | 1 | 2,043 |
| F-00178 | mavade_avalie__personeli | 4 | 1 | 2,660 |

Accuracy: I joined every JSON cell back to `rows.tsv` by header title and row label — **0 value mismatches in 1,015 cells**. The transcription is perfect; the objection is that it is a `cut`/`join`, not an LLM task, and it cost a full pass of a 64K-token output budget.

Layout note: the agent used the **wide** shape (product rows × ingredient columns, 19–23 columns, 57% zeros). Spec §7's own BOM example is **long** (`grain: "one row per (product, ingredient)"`, 3 columns, no zero rows) — 432 non-zero pairs instead of 1,015 cells.

## Branch duplication

20 chalebagh↔naharkhoran pairs.

| pair | keys same | titles same | full (key,title,type,unit) same | verdict |
|---|---|---|---|---|
| F-00141/F-00154 … F-00145/F-00158 (5 ashpazkhne tabs) | yes | yes | yes | merge |
| F-00180/F-00238, F-00181/F-00237, F-00186/F-00243 | yes | yes | yes | merge (then drop — plumbing) |
| F-00182/F-00239, F-00183/F-00240, F-00184/F-00241, F-00185/F-00242 (report tabs) | yes | yes | yes | merge |
| F-00146/F-00159, F-00148/F-00161, F-00150/F-00163, F-00152/F-00165 | yes | yes | **no** — only `type` present/absent (+ `column` letters on Kanter) | merge after fixing the drift |
| F-00147/F-00160 (+2 cols), F-00149/F-00162 (+6), F-00151/F-00164 (+3), F-00153/F-00166 (+2) | no | no | no | keep both — branches stock different items |

12 pairs exactly identical, 4 more identical once `column` is dropped and the `type` omission fixed → **16 of 20 collapsible**. Droppable halves outside the mirrors: 13 entries, 51,046 B.

## Units

492 fields: 317 with a unit, 175 explicit `null`, 4 with the key absent.

| declared type of the unit-less field | n | comment |
|---|---|---|
| string | 60 | text columns, incl. F-00001's own `symbol`, `dimension`, `unit_title` |
| integer | 52 | `day`, `year` of the Jalali triple |
| number | 43 | genuine unknowns |
| (no type) | 13 | genuine unknowns |
| date | 10 | `تاریخ` |
| datetime | 1 | F-00179 `Timestamp` |

→ 123 of 179 cannot have a unit at all; only **56** are real. By role: log 93, report 52, reference 30, config 4.
Of the 317 that do carry a unit, **119 (38%) are `field_status: inferred` guesses**, all on reference records. Unit values used: pcs 145, g 83, kg 82, portion 7.
Store-wide index rollup (`.index.json`): unknown 331, inferred 398, informal 3, disputed 0; records' share: unknown 179, inferred 155.
Inferability: `sheets.json` head row prints «وزن …»/«تعداد …» prefixes (that is how F-00149 got kg/pcs), and F-00182's statement records the report tab's own banner «تمام وزن ها به کیلوگرم است» — yet the logs feeding it leave the same quantities null. Only 7 of the 179 have an `of: {ref}` to an item that carries a unit.

## Vocabulary conformance

`fields[]` keys used: key 496, title 496, unit 492, **column 488**, type 401, **unit_ref 317**, **of 216**, constraints 58 (enum only).
`spec grep` vs `quantify.md grep`: refItems 17/0, primaryKey 15/0, cadence 6/0, filled_by 4/1, column 0/0, unit_ref 0/0, named_range 0/0, row_meta 0/0, import 0/0, frequency 0/0.
`refItems` (the spec's mechanism) appears **0 times** in the store; `of: {ref}` was invented for it. `cadence` (closed enum) never used; `frequency` (free Persian) on 11 records.
`fields[].type` values: number 278, **none 95**, string 60, integer 52, date 10, **datetime 1** (out of enum).
`location` keys: spreadsheetId 153, file 153, sheet 153, **sheetId 0, hidden 1**. `file` collides: Pitza.xlsx / Farangi.xlsx / Kanter.xlsx each name two different spreadsheetIds.
`primaryKey`: 54 declared, 0 members undeclared, but 10 are `[]`; `('day','month','year')` ×16 vs `('ruz','mah','sal')` ×2.

## issues[] — the valuable residue

74 issues on 64 records: junk 32, column_shift 20, scale 11, cross_record 3, unit_kind 3, bug 3, code_collision 2. **43 of 74 sit on mirror/stub entries** (column_shift 19, junk 16, unit_kind 2, code_collision 2, bug 2, scale 1, cross_record 1).

## Pass attribution

| part | bytes | contents |
|---|---|---|
| B1 | 142,501 | item 52, record 13, rule 1, note 1 |
| B2 | 76,655 | record 13, rule 4, note 1 |
| B3 | 193,160 | item 87, record 12, rule 1 |
| B4 | 164,816 | record 8, rule 73 |
| **B5** | **91,840** | **record 50 — 35 mirror + 15 stub, nothing else** |
| B6 | 182,283 | record 7, rule 73 |
| **B7** | **102,847** | **record 50 — 35 mirror + 15 stub, nothing else** |
| B8 | 59,979 | rule 4, measurement 13, note 20, record 2 |

Run wall clock: 2026-09-02T08:07:37Z → 21:52:27Z.

## Coverage

13 workbooks, 177 dumped tabs, 156 records. `Gozaresh markazi` 43/43 and `Gozaresh naharkhoran` 42/42 fully covered (70 of those 85 are mirrors); the 53-tab Farangi workbook correctly yielded 2 records because `sheets.json` flags the other 51 `empty: true`.

## 15 verbatim examples

1. **F-00202** `gozaresh_markazi__table_pizza_first` (mirror) — «تب پنهان «Table_Pizza_First» در فایل Gozaresh markazi.xlsx تنها یک فرمول در A1 دارد که با IMPORT_FROM_SHEET محدوده A:S تب «موجودی اول شب» فایل Pitza.xlsx را می‌آورد.» Payload is the LET body re-typed. One of 70.
2. **F-00187** `anbar_markazi__pitza` (stub) — «این رکورد فقط از روی آینه Table_Pizza_Request در گزارش مرکزی شناخته شده است؛ خود فایل در این پاس خوانده نشده و ساختار ستون‌هایش اینجا ثبت نشده است.» Its workbook 1crVTmnx… has a 5-tab dump on disk.
3. **F-00180** `gozaresh_markazi__refresher` — a spreadsheet recalculation hack stored as data: `"rows": [{"key": "refresher", "refresher": 1783786014375}]`, «این سلول به‌عنوان آرگومان صوری به همه فراخوانی‌های توابع سفارشی پاس داده می‌شود تا با تغییر مقدارش کاربرگ دوباره محاسبه شود.» Duplicated as F-00238.
4. **F-00181** `gozaresh_markazi__tarikh` — «یک ردیف پارامتر که تاریخ شمسی گزارش را در سه سلول روز (C5)، ماه (D5) و سال (E5) از فهرست‌های از پیش تعریف‌شده می‌گیرد.» The 'where a date cell is read from' complaint, verbatim. Duplicated as F-00237.
5. **F-00179** `gozaresh_markazi__form_responses_1` — «با دو ستون Timestamp و Untitled Question. در زمان استخراج فقط سطر عنوان وجود داشت و هیچ ردیف داده‌ای ثبت نشده بود.» An empty Google Form, `type: "datetime"`.
6. **F-00167** `mavade_avalie__pitza_americai` — «سلول صفر یعنی آن ماده در آن آیتم مصرف نمی‌شود (قالب‌بندی شرطی این سلول‌ها را خاکستری می‌کند) و در rows نیامده است.» False (111 zeros are in `rows`), plus conditional-format cosmetics, plus «اعتبارسنجی عددی فقط روی ستون‌های B تا H تعریف شده».
7. **F-00170** `mavade_avalie__lazania` — 2 rows, 7 ingredient columns, `"item_6": 120, "item_2": 0, "item_1": 230, "item_33": 30, "item_32": 0, "item_31": 20, "item_30": 0` — 3 of 7 values are zeros; verified identical to `rows.tsv`.
8. **F-00149** `farangi__mojudi_akhar_shab` — «نسبت به تب اول شب شش ستون بیشتر دارد: قارچ فرنگی، نان مک، نان باگت، مینی مک، پاستا پنه خام و پرس دورچین استیک.» A diff against another tab, in a statement meant to define a log.
9. **F-00182** `gozaresh_markazi__pitza` — `primaryKey: []`, `row_meta: [{"row":"item_1","sheet_row":6,"of":{"ref":"F-00002"}}, …]`, and «ستون برچسب قلم در استخراج ثبت نشده و ردیف‌ها فقط با کلید قلم شناسایی می‌شوند.» The tab's own banner «تمام وزن ها به کیلوگرم است» is quoted here but not propagated to the source logs.
10. **F-00186** `gozaresh_markazi__sheets_file_ids` — a table of Google Drive ids: `{"key":"sheets_file_id_farangi","range_name":"SheetsFileId_Farangi","sheets_file_id":"1M_iuhWUW9901F_66pv_g8r0W0QVMzLDrEQJp6GQgnuQ"}`. Duplicated as F-00243.
11. **F-00295** `ashpazkhne_chalebagh__checklist_ebteda_va_entehaye_kar` — `role: "checklist"`, `medium: "app"`, `location: null` (all three out of spec), statement: «گوینده گفت گوشی خودش این فرم را بالا نمی‌آورد و تیک‌ها ثبت نمی‌شود و کارها را حضوری پیگیری می‌کند.»
12. **F-00294** `ashpazkhne_chalebagh__barge_vorud_khorooj_va_morakhasi` — `location: null`, `frequency: "هفتگی"`, statement: «دستگاه اثر انگشت مستقیم به ژنراتور وصل نیست و به اندازه مدت قطعی برق عقب می‌ماند، بنابراین ورود و خروج افراد یکی دو ساعت جلو یا عقب می‌افتد».
13. **F-00203** `gozaresh_markazi__table_pizza_last` (mirror) — the best finding in the set, sitting on a to-be-deleted entry: «محدوده نام‌دار Table_Pizza_Last فقط تا ستون M تعریف شده (Table_Pizza_Last!$A:$M) در حالی که خود تب تا ستون O داده دارد؛ بنابراین دو ستون «سس گوجه کف پیتزا ##33» (N) و «خمیر پیتزا ##26» (O) … هرگز به فرمول‌های گزارش نمی‌رسند.»
14. **F-00216** `gozaresh_markazi__table_sales_data_single_pizza` (mirror) — «روی همین تب یک محدوده نام‌دار با نام «Table_SalesData_AmericanPizza» … نام سراسری هم‌نام … را در این کاربرگ سایه می‌اندازد. هر فرمولی که روی این تب نوشته شود جدول اشتباه را می‌خواند.» Also a to-be-deleted entry.
15. **F-00161** `amar_farangi__mojudi_avval_shab` — a real migration-critical defect: «ستون «وزن گوشت رستبیف فرنگی ##11» … در ردیف ۸ آذر ۱۴۰۴ عدد ۸٫۴ (کیلوگرمی) و در ردیف‌های ۱۳، ۱۴ و ۱۵ آذر اعداد ۱۴۱۰، ۱۳۱۰ و ۱۰۱۰ (گرمی) ثبت شده است.» Confirmed against `sheets.json` head rows for 1hGDv6eo….

## Proposed KEEP set — 36 entries, 182,335 B (43% of current)

| ids | what | rework needed |
|---|---|---|
| F-00001 | `units` registry | drop `unit: null` from its own unitless columns |
| F-00141–F-00145 | 5 Ashpazkhne daily tabs (زمان تحویل، ضایعات، OFF اجرایی، نیازمندیها، خمیر) | scope to **both** branches; retire F-00154–F-00158 |
| F-00146–F-00153 | 8 chalebagh line inventory logs (اول/آخر شب × پیتزا، فرنگی، کانتر، سوخاری) | scope the 4 *اول شب* to both branches (retire F-00159, F-00161, F-00163, F-00165); add the missing `type` |
| F-00160, F-00162, F-00164, F-00166 | 4 naharkhoran *آخر شب* logs that genuinely differ | keep separate; they carry the extra columns |
| F-00167–F-00178 | 12 BOM reference tabs | keep identity + `fields[]` + `issues[]`; **rows[] from an engine import, not typed**; delete the false zero-omission sentence; consider long layout |
| F-00182–F-00185 | 4 report tabs | scope to both branches (retire F-00239–F-00242); give a real `primaryKey` via a `header_fields` date; drop `row_meta.sheet_row` |
| F-00294, F-00295 | paper leave form + shift checklist | fix `location`, fix `role`/`medium` to the enum, move the anecdote out of `statement` |

Delete: 70 mirrors + 30 stubs + F-00179, F-00180, F-00238, F-00181, F-00237, F-00186, F-00243 + the 13 branch-duplicate halves = 120 entries, 238,886 B.
Do **not** discard with them: the 43 issue findings on mirror/stub entries — re-home them onto the import rule (only 2 rules in the store currently mention `IMPORT_FROM_SHEET`: F-00321, F-00394), and re-home F-00181's month/year enums onto the report records' `constraints`.