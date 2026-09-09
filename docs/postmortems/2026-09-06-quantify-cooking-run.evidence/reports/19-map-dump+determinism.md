# map:dump+determinism

## summary
The dump is a seven-file, purely structural export per workbook (sheets.json, formulas.tsv, names.tsv, validations.tsv, cf.tsv, comments.tsv, meta.json, plus rows.tsv only for manifest-confirmed reference tabs). It is well built but has one fatal blind spot for the cooking run: the report tabs' row-label column (پیتزا!B6:B15 etc.) is a plain cell below `_HEAD_ROWS = 5` and those tabs are not in `reference_tabs[]`, so the ingredient name of every report row is absent from the dump. The agent reconstructed those labels by joining `getIngredientValueById(N,…)` → `##N` → a Table_Ingredients header and invented keys `item_1…item_25`; `merge facts audit` then reports exactly 62 `row_gone` findings — I reproduced all 62. Almost all of obligation 2 is a mechanical transform: of 123 non-empty cooking tabs, 70 are mirrors whose only formula is `IMPORT_FROM_SHEET` (detectable by one string test), and the run spent ~37,000 output tokens writing them as full records the user says should not exist at all. The rule explosion is the same story: 84 column-rules were written for the two gozaresh workbooks, but only 25 are distinct once cell refs and numeric literals are normalised — 59 (70%) are byte-identical duplicates across tab and branch, and the parameterised business-rule count is about 13. Named functions and .gs functions were re-written per workbook (14 rules for 7 byte-identical LAMBDAs, 20 rules for two .gs files that differ only by two blank lines). Conditional formats produced 16 rules from 8 cosmetic rules whose `format` column is empty; the only two cell comments in the whole cooking estate are both the string "149" and one became a note. What genuinely needs an LLM is small: naming a concept in formal Persian, saying what a rule means in business terms, mapping transcript speech to entries, and supplying units — the dump never carries a unit anywhere. With the skeleton pre-built, the whole cooking department is ~289 LLM decisions ≈ 35K output tokens against 100K of dump input plus 30K of transcript, versus the 224K-token delta the run actually produced — i.e. it would fit inside one 64K output budget instead of crashing on it.

## problems
- [high/engine] Report-tab row labels are not in the dump at all — the direct cause of all 62 audit 'row_gone' findings :: Real xlsx `data-repo/attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.xlsx`, tab پیتزا, has its ingredient names in B6:B15 ('وزن پنیر پیتزا' … 'وزن سوسیس کراکف'). `dump_workbook/__init__.py:47` `_HEAD_ROWS = 5` and `_read_sheet` keeps cells only for rows ≤ 5 unless `keep_ro
- [high/agent-prompt] 70 of 123 non-empty cooking tabs are mirrors, detectable by one string test, yet each was written as a full ~530-token record :: Every Table_* tab in .dump/1shXFb… and .dump/1Kk0lA… has exactly one formula, at A1, of the form `LET(sheetName,"…",dataRange,"A:S",IMPORT_FROM_SHEET(SheetsFileId_X,sheetName,dataRange))` (35 + 35 tabs). facts/records.json role counts: mirror=70, log=58, reference=18, report=8, config=1, checklist=1
- [high/data-quality] Mirrors are stale, truncated caches — recording them stores wrong data :: Comparing mavade_avalie rows.tsv (the BOM source) against the same BOM mirrored into gozaresh_markazi: 69 rows compared, 52 identical, 17 differing. Every difference is column truncation: `Table_Ingredients_Fried` pulls `dataRange,"A:E"` (5 columns) while mavade_avalie!سوخاری has 11 columns, so سالا
- [high/agent-prompt] 84 column-rules written for 25 distinct formulas — 70% are pure per-tab / per-branch duplicates :: Grouping .dump/1shXFb… + .dump/1Kk0lA… formulas.tsv by (book, sheet, column letter) over the 4 report tabs gives 84 groups — matching the 84 rules F-00337..378 and F-00410..451 in facts/rules.json. Normalising cell refs and numeric literals collapses them to 25 distinct signatures: 59 are exact dupl
- [high/agent-prompt] Named functions and Apps Script functions re-written per workbook although the sources are byte-identical :: `diff 'MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.gs' 'MandeShab__Naharkhoran__Gozaresh naharkhoran/Gozaresh naharkhoran.gs'` differs only by two blank lines (lines 26a27, 74a76). The 7 LAMBDA definedNames in the two names.tsv files are identical (`diff` of the sorted LAMBDA lines is em
- [high/output-format] Statements cite spreadsheet cells and tabs, defeating the purpose of the store :: Across all 486 store entries: 196 statements contain an A1-style cell reference (records 77, rules 117, notes 2), and 448 name a tab, column, file or Table_* range. Example F-00465: «در تب «موجودی اول شب» سلول F37 و در تب «موجودی آخر شب» سلول D36». Example F-00202: «تب پنهان «Table_Pizza_First» در ف
- [high/orchestration] No deterministic pre-build: 100K tokens of dump in, 224K tokens of delta out, ~85% of it mechanical :: The 13 cooking dumps total ≈99,218 estimated tokens; the 3 transcripts ≈30,426. runs/facts/cooking/20260902-080737/facts-delta.json holds 485 entries ≈223,918 tokens (median 327/entry). With mirrors reduced to pointers, formula groups deduplicated and codes deduplicated globally, the residual decisi
- [medium/agent-prompt] Conditional formats produced 16 rules from 8 cosmetic formats whose `format` column is empty :: .dump/1shXFb…/cf.tsv holds 8 rows, all `cellIs greaterThan 0` / `cellIs lessThan 0` on the deviation column, with the `format` field blank (dxfId unresolved). Same 8 in 1Kk0lA…. rules.json holds F-00379..387 and F-00452..460 = 18 entries (2 threshold constants + 16 flags). mavade_avalie's 10 cf rows
- [medium/agent-prompt] Cell comments mandated as entries; the entire cooking estate has two, both the string '149' :: All 13 cooking dumps' comments.tsv are empty except .dump/19jHmcKH…/comments.tsv: `موجودی اول شب\tF37\tunknown\t149` and `موجودی آخر شب\tD36\tunknown\t149`. This became note F-00465 «کامنت «149» روی ستون نوشابه قوطی مشکی…», whose own statement admits «معنای این کامنت … در فایل مشخص نیست».
- [medium/engine] rows.tsv unions the headers of every reference tab into one line — 73% of the emitted cells are empty :: `_merge_columns` in dump_workbook/__init__.py:804 builds one header as the union across reference tabs. .dump/1shXFb…/rows.tsv is 76 rows × 54 columns = 4,104 cells, 1,128 non-empty (27%). .dump/15M2ov…/rows.tsv is 69 × 60 = 4,140 cells, 1,222 non-empty (29%). The SheetsFileIDs rows fill 2 of 54 fie
- [medium/engine] Units are never present anywhere in the dump :: mavade_avalie rows.tsv header is «پنیر پیتزا ##1» with cell value `180.0` — grams, but nothing says so. The only machine-readable evidence of a unit in the whole estate is `CONVERT_GR_TO_KG` appearing (or not) in a column's formula: پیتزا/فرنگی E:G wrap it, سوخاری/کانتر E:G do not. F-00182's fields[
- [medium/data-quality] NAMED_FUNCTIONS.md is a hand-written companion that is redundant with names.tsv and wrong on its central claim :: attachments/sheets/NAMED_FUNCTIONS.md states «این توابع در فایل‌های .xlsx اکسپورت‌شده وجود ندارند». In fact `grep -l LAMBDA .dump/*/names.tsv` matches 8 workbooks, and .dump/1shXFb…/names.tsv carries all seven verbatim, e.g. `CONVERT_GR_TO_KG\tworkbook\tLAMBDA(weight, DIVIDE(weight,1000))` and the f
- [medium/validator] Duplicate outputs: tolerance rules and the column rule both claim to write the same field :: `merge facts audit` reports 4 duplicate_output findings: `F-00182/enheraf_ba_tolerance is written by F-00332, F-00333, F-00334, F-00335, F-00347` and the same shape for F-00183, F-00239, F-00240.
- [medium/data-quality] 34% of dumped formula lines carry a cached error and 46% carry no cached value — no ground truth to check against :: Across all 28 workbooks' formulas.tsv: 2,721 lines, 938 with an error class (#N/A 474, #NAME? 299, Loading… 140, #REF 17, #NUM 8), 1,256 with an empty `cached` field.
- [low/agent-prompt] A single-cell timestamp tab became a reference record with rows[] :: .dump/1shXFb…/sheets.json: tab `Refresher`, dimension A1:A1, head `[['1.783786014375E12']]`, header_row null. facts/records.json F-00180 `gozaresh_markazi__refresher` has role `reference` and 1 row; F-00238 is its naharkhoran twin. Both produce a `row_gone` audit finding.
- [low/output-format] Duplicate note entries for the same subject :: notes.json F-00466 «معنای ستون‌های تعداد در تب OFF اجرایی» and F-00473 «معنای دو ستون تعداد در تب OFF اجرایی».
- [low/engine] head grid is truncated to the widest of rows 1–5, hiding columns on 4 tabs :: `_head_grid` sets width from `max(cols)` over rows 1–5 only. .dump/1shXFb…/sheets.json: tab پیتزا head width 13 but cols 15; tab تاریخ head width 5 but cols 6. Same two tabs in 1Kk0lA…. 4 of 123 non-empty cooking tabs affected.
- [low/engine] sheets.json republishes the full previous {sheetId: name} map on every dump :: .dump/1shXFb…/sheets.json `previous` holds 43 entries, an exact copy of the current names, adding ~1K tokens to the one file the agent must read per workbook. Drift is already reported on stdout by dump_workbook (`print(f"drift: {old} -> {sheet['name']}")`).

## details
## 1. What each dump file contains

Written by `code-repo/engine/dump_workbook/__init__.py::dump_workbook` into `data-repo/attachments/sheets/.dump/{spreadsheetId}/`. Everything below is verbatim from the real dumps.

| file | columns / keys | one real sample line |
|---|---|---|
| `sheets.json` | top: `schema_version, spreadsheetId, sheet_count, sheets[], previous{sheetId→name}`; per sheet: `sheetId, name, hidden, dimension, rows, cols, head[[str]], header_row, codes[], empty` | `{"sheetId":4,"name":"پیتزا","hidden":false,"dimension":"A1:O18","rows":18,"cols":15,"head":[…,["","","","","موجودی اول شب","مقدار دریافت از انبار","موجودی آخر شب ","مصرف اعلامی","مصرف واقعی","انحراف","تعداد فروش","انحراف (با تلورانس)","انحراف به ازای هر عدد (با تلورانس)"]],"header_row":5,"codes":[],"empty":false}` |
| `formulas.tsv` | `sheet, range, group, formula, count, cached, error` | `پیتزا⇥H6:H15⇥1⇥MINUS(SUM(FN,EN),GN)⇥10⇥0.05⇥` |
| `names.tsv` | `name, scope, formula` | `CONVERT_GR_TO_KG⇥workbook⇥LAMBDA(weight, DIVIDE(weight,1000))` |
| `validations.tsv` | `sheet, range, type, values` | `تاریخ⇥D5⇥list⇥"فروردین,اردیبهشت,…,اسفند"` |
| `cf.tsv` | `sheet, range, type, formula, format` | `پیتزا⇥L6:L15⇥cellIs greaterThan⇥0⇥` (format **empty**) |
| `comments.tsv` | `sheet, cell, author, text` | `موجودی اول شب⇥F37⇥unknown⇥149` |
| `rows.tsv` (confirmed `reference_tabs` only) | `sheet, row,` then the **union** of every reference tab's header cells | `پیتزا امریکایی⇥2⇥رستبیف #71⇥180.0⇥80.0⇥0.0⇥…` |
| `meta.json` | `schema_version, spreadsheetId, file, sha256, bytes, exported, sheet_count, reference_tabs[]` | `{"file":"Gozaresh markazi.xlsx","sha256":"404c289b…","bytes":405891,"exported":"2026-08-29T09:36:28.988Z","sheet_count":43,"reference_tabs":[…13…]}` |

`row` numbers inside `formula` are already normalised to `N` (`normalise_rows`, line 149) and `IFERROR(__xludf.DUMMYFUNCTION(…))` stubs are unwrapped back to the Google source.

### What is missing that the agents needed

| gap | evidence | consequence |
|---|---|---|
| **Row-label column of report tabs** | `Gozaresh markazi.xlsx!پیتزا` labels sit in **B6:B15** ('وزن پنیر پیتزا' … 'وزن سوسیس کراکف'); `_HEAD_ROWS = 5` keeps only rows ≤5, and the tab is not a `reference_tab` | agent invented `item_1…item_25` keys → **62 `row_gone`** audit findings (reproduced exactly) |
| **Units** | mavade_avalie header «پنیر پیتزا ##1», value `180.0` — grams, never stated. Only machine signal is `CONVERT_GR_TO_KG` present in پیتزا/فرنگی E:G and absent in سوخاری/کانتر | F-00182 asserts `kg`/`pcs` with no dumped source |
| **cf `format`** | all 8 report-tab cf rows have an empty `format` (dxfId unresolved) | 16 flag rules that cannot say what they paint |
| **Cross-workbook link resolution** | `SheetsFileIDs` sits in rows.tsv as `SheetsFileId_Pizza → 1dmH8t…`; nothing joins it to the mirror target's record | `mirror_of` resolved by hand |
| **Twin diff** | nothing compares gozaresh_markazi to gozaresh_naharkhoran | 59 duplicate rules |
| **head grid width** | `_head_grid` width = widest of rows 1–5; پیتزا head 13 cols vs `cols: 15`; تاریخ 5 vs 6 | 4 of 123 tabs lose columns |
| **`previous` map** | 43-entry copy of the current names in every `sheets.json` | ~1K wasted tokens/workbook |
| **`NAMED_FUNCTIONS.md`** | claims «این توابع در فایل‌های .xlsx … وجود ندارند» — false; all 7 LAMBDAs are verbatim in `names.tsv` (8 workbooks match `grep -l LAMBDA`) | hand-maintained, redundant, misleading |

Header detection worked: only 2 of 123 non-empty cooking tabs have `header_row: null`, both the 1-cell `Refresher` tab — which is exactly the right signal that a tab is not a table, and it was ignored.

---

## 2. Purely mechanical — a deterministic CLI, zero LLM

| obligation | mechanical rule | measured on the cooking estate |
|---|---|---|
| record skeleton per non-empty tab | key = `short` + slug(tab); `location` from meta.json + sheets.json; `fields[]` = header row cells + column letter (index→letter); `medium: sheet` | 123 non-empty tabs of 177; **51 empty tabs in amar_farangi alone** droppable by `empty: true` |
| reference rows | copy rows.tsv verbatim, narrowed on the `sheet` column | 221 rows (mavade_avalie 69 + gozaresh ×2 76 each) |
| **mirror detection** | tab whose formula count == 1 and whose formula contains `IMPORT_FROM_SHEET` → pointer, not entry; parse `sheetName`, `dataRange`, `SheetsFileId_*` from the LET; resolve the id through rows.tsv(SheetsFileIDs) | **70 of 123** non-empty tabs (35 + 35); 70 records ≈ 37,000 output tokens deleted |
| **formula groups** | group by (sheet, column letter); normalise A1 refs and numeric literals; one rule candidate + verbatim original + range + the per-row parameter table | 417 formula lines → 84 column groups → **25 distinct signatures** |
| validations → enum | `type: list` rows straight to `constraints.enum` | 95 `list` rows estate-wide (day 1–31, 12 Persian months, year list) |
| cf → ignore | 27 rows across cooking; all cosmetic | 16 rules + 2 thresholds deletable |
| comments → ignore | 2 rows in the whole cooking estate, both `149` | 1 note deletable |
| item codes | `#{1,2}[^\s#]+` in headers and BOM row labels; `#N` = food, `##N` = ingredient (proved by `getValueById(id, data, indicator)` in the .gs) | **69 `##` ingredients + 82 `#` foods = 151 distinct**; store has 139 items. 31 codes carry >1 label, all differing only by a «وزن»/«تعداد» prefix |
| named functions → table | `grep LAMBDA names.tsv`; 7 workbook-scope LAMBDAs, byte-identical across the twins | replaces the hand-written NAMED_FUNCTIONS.md outright |
| .gs functions | hash the file; `Gozaresh markazi.gs` vs `Gozaresh naharkhoran.gs` differ by two blank lines only | 20 rules → 10 |
| branch twin diff | compare formulas.tsv keyed on (sheet, range) | 205 vs 206 lines, **189 identical**, 16 differ by whitespace only, **1 genuine divergence**: `فرنگی!M6:M8` exists only in naharkhoran as `DIVIDE(LN,KN)` (unrounded) vs markazi's `ROUND(DIVIDE(LN,KN),3)` |
| mirror truncation check | compare `dataRange` width to the source tab's `cols` | 17 of 69 BOM rows differ; `Table_Ingredients_Fried` imports `A:E` of an 11-column source |

---

## 3. What genuinely needs an LLM

- **Naming the concept in formal Persian** — turning `MINUS(SUM(FN,EN),GN)` into «مصرف اعلامی = موجودی اول شب + دریافت از انبار − موجودی آخر شب». The header cell gives the noun; the sentence does not exist anywhere.
- **The business meaning of a rule and its shared/parametric form** — deciding that پیتزا/فرنگی/سوخاری/کانتر columns E–M are *one* station-parameterised deviation report, not four; that column I is «مصرف واقعی از روی فروش و نسخهٔ غذاها»; that L's three variants are two tolerance policies (5 g per piece, 140 g per kg) plus a no-tolerance pass-through.
- **Units when unstated** — grams vs kilograms per column, «پرس», «کارتن», «برش»; only the presence of `CONVERT_GR_TO_KG` hints, and only for 6 of 42 column groups.
- **Mapping transcript speech to items/rules** — 53 store entries cite the 3 transcripts (46 / 2 / 5). Nothing mechanical connects «تلورانس نداره… ۳۱۳ تا کسر بودش» to rule F-00332.
- **Deciding usefulness** — that a cell comment reading `149` is noise, that grey-on-zero conditional formatting is cosmetic, that a mirror should be a pointer.
- **Canonical label choice** where a code carries two labels (31 of 151 codes: «وزن مرغ فرنگی» vs «مرغ فرنگی»).

---

## 4. LLM work-unit size with the skeleton pre-built

Token estimate = `ascii_chars/4 + non_ascii_chars/1.5`. `NEW_*` columns are deduplicated globally, largest workbook first (so gozaresh_naharkhoran contributes almost nothing once its twin is done). `out_tok_est` = LLM_units × 120 (title ≈12 + statement ≈85 median measured on the store + envelope ≈25).

| workbook | tabs | non-empty | mirror | record titles | shapes | NEW shapes | codes | NEW codes | gs fns | **LLM units** | **out tok** | dump in tok |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| amar_farangi | 53 | 2 | 0 | 2 | 0 | 0 | 9 | 9 | 0 | 11 | 1,320 | 4,505 |
| gozaresh_markazi | 43 | 43 | 35 | 8 | 73 | 73 | 145 | 136 | 10 | 227 | 27,240 | 35,497 |
| gozaresh_naharkhoran | 42 | 42 | 35 | 7 | 74 | **1** | 136 | **0** | 0 | **8** | 960 | 34,213 |
| mavade_avalie | 12 | 12 | 0 | 12 | 0 | 0 | 123 | 6 | 0 | 18 | 2,160 | 9,859 |
| ashpazkhne_chalebagh | 5 | 5 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 5 | 600 | 1,555 |
| ashpazkhne_naharkhoran | 5 | 5 | 0 | 5 | 1 | 1 | 0 | 0 | 0 | 6 | 720 | 1,712 |
| amar_pitza | 4 | 2 | 0 | 2 | 0 | 0 | 10 | 0 | 0 | 2 | 240 | 1,573 |
| kanter | 3 | 2 | 0 | 2 | 0 | 0 | 17 | 0 | 0 | 2 | 240 | 2,560 |
| farangi | 2 | 2 | 0 | 2 | 0 | 0 | 15 | 0 | 0 | 2 | 240 | 1,796 |
| pitza | 2 | 2 | 0 | 2 | 0 | 0 | 12 | 0 | 0 | 2 | 240 | 1,643 |
| sokhari | 2 | 2 | 0 | 2 | 0 | 0 | 8 | 0 | 0 | 2 | 240 | 1,275 |
| fried | 2 | 2 | 0 | 2 | 0 | 0 | 6 | 0 | 0 | 2 | 240 | 1,231 |
| amar_kanter | 2 | 2 | 0 | 2 | 0 | 0 | 14 | 0 | 0 | 2 | 240 | 1,799 |
| **TOTAL** | **177** | **123** | **70** | **53** | 148 | **75** | 495 | **151** | **10** | **289** | **34,680** | **99,218** |

Transcripts:

| transcript | bytes | lines | in tok | entries yielded | out tok |
|---|---|---|---|---|---|
| cooking-1405-05-26 | 67,901 | 451 | 21,763 | 46 | ~16,100 |
| cooking-1405-05-26-02 | 10,853 | 65 | 3,458 | 2 | ~700 |
| cooking-1405-06-01 | 16,253 | 113 | 5,205 | 5 | ~1,750 |
| **TOTAL** | 95,007 | 629 | **30,426** | **53** | **~18,550** |

**Against the actual run:** `runs/facts/cooking/20260902-080737/facts-delta.json` = 485 entries ≈ **223,918 output tokens** (median 327/entry; items 277, records 552, rules 377, notes 421). The skeleton design puts the whole department at ≈53K output tokens — under one 64K budget — with gozaresh_markazi (227 units, 27K) the only unit that needs its own pass, and its twin costing 8 units.

Per-entry token cost measured in the store:

| kind | n | median entry tok | mean | max | median statement tok |
|---|---|---|---|---|---|
| items | 139 | 277 | 298 | 683 | 89 |
| records | 156 | 552 | 740 | 3,161 | 130 |
| rules | 156 | 377 | 441 | 1,275 | 85 |
| measurements | 13 | 351 | 407 | 796 | 147 |
| notes | 22 | 421 | 454 | 709 | 231 |

---

## 5. Distinct formula shapes in gozaresh_markazi (4 report tabs × 2 branches)

Scope: tabs پیتزا, فرنگی, سوخاری, کانتر in `1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s` and `1Kk0lA8hnKYvbJw6Zw6AK4cmOC8Hzat2Dbr50J2vTAC8`.

| level of normalisation | distinct |
|---|---|
| formula **cells** | 495 |
| dump lines (rows already row-normalised by `normalise_rows`) | 341 |
| L0 verbatim | 163 |
| L1 + column letters → `@` | 161 |
| L2 + numeric literals → `#` | 87 |
| L3 + whitespace collapsed | **77** |
| L4–L6 + id-array arity, string literals, local var names | 74 |
| L7 + source table parameterised (`Table_STATION_*`, `Table_SalesData_MENU`) + Σ-arity | **38** |
| grouped by (book, sheet, column) — i.e. **what the run wrote** | **84** |
| distinct column-group signatures after normalisation | **25** |
| business rules once station/menu/Σ-arity are parameters | **≈13** |

**Rules actually written: 84** (`F-00337..378` markazi, `F-00410..451` naharkhoran) — 42 per book, matching the 42 column groups per book exactly. **59 of the 84 (70%) are byte-identical duplicates.**

The duplication, exactly:

| copies | shape | where |
|---|---|---|
| 24 | `'تاریخ'!@` | B, C, D × 4 tabs × 2 books |
| 8 | `MINUS(SUM(@,@),@)` (مصرف اعلامی) | H × 4 tabs × 2 books |
| 8 | `MINUS(@,@)` (انحراف) | J × 4 tabs × 2 books |
| 3 | `ROUND(DIVIDE(@,@),#)` | M × فرنگی/پیتزا |
| 2 each (×20) | every remaining E/F/G/I/K/L group | identical between the two branch workbooks |

The 4 report tabs are one template of ~11 columns:

`B/C/D` date from تاریخ · `E` opening stock · `F` warehouse issue · `G` closing stock · `H = F+E−G` declared consumption · `I` theoretical consumption from sales × BOM · `J = I−H` deviation · `K` sold-unit count · `L` deviation after tolerance · `M = ROUND(L/K,3)` deviation per unit.

The genuine per-row variation is a **parameter table**, not new rules: `getIngredientValueById(N,…)` supplies the ingredient code, and columns I/K carry per-ingredient menu-family id sets (`amFoodIds {71,309,74,…}`, `itFoodIds {61,62,63,…}`). Both are extractable from the formula text with a regex.

**One real branch divergence exists** and it is not among the 84: `فرنگی!M6:M8` in gozaresh_naharkhoran is `DIVIDE(LN,KN)` (unrounded) where gozaresh_markazi has only `M9:M14 = ROUND(DIVIDE(LN,KN),3)`. Everything else differs by whitespace in 16 cells.

---

## Files

- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/engine/dump_workbook/__init__.py` — `_HEAD_ROWS = 5` (line 47), `_head_grid` (437), `header_row` (488), `_formula_rows` (515), `_reference_rows` (561), `_merge_columns` (804)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/engine/dump_workbook/cli.py`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/engine/merge_facts/audit.py` — `_row_present` (356), `_row_gone` (383)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/docs/superpowers/specs/2026-08-29-quantitative-facts-design.md` — Appendix B (2134), Appendix C (2185)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/.claude/agents/quantify.md` — obligations at lines 69–119
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/attachments/sheets/manifest.json`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/attachments/sheets/NAMED_FUNCTIONS.md`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.gs`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/attachments/sheets/.dump/1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s/`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/runs/facts/cooking/20260902-080737/facts-delta.json` (485 entries) and `parts/facts-delta-B1..B8.json`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/{items,records,rules,measurements,notes}.json`