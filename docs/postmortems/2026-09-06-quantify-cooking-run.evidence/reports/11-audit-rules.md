# audit:rules

## summary
156 rules in rules.json collapse to 46 distinct concepts and, after removing plumbing, to ~13-16 rules worth keeping (8-10%). 148 of 156 are exact branch twins: the two report workbooks were extracted by two separate passes (B4 = chalebagh, 73 rules; B6 = naharkhoran, 73 rules) that produced the same 74 rules twice, in two different FEEL dialects (`masraf_vaqei - masraf_elami` vs `enheraf = masraf_vaqei - masraf_elami`) and two different payload vocabularies (io members carry `title` 0x in the chalebagh pass vs 170x in the naharkhoran pass; `unit` 17x vs 178x; `unit_ref`/`per` only in chalebagh). 95 rules (61%) are non-quantitative: 24 "day/month/year read from the date tab", 28 "read column X from mirror tab, divide by 1000", 17 conditional-format flags, 20 named-function/script plumbing (onOpen, triggerRecalculation, IMPORTRANGE, jalali conversion), 3 cell literals. 147 of 156 statements cite cells, columns or tabs; only 9 do not, and 7 of those 9 are script plumbing — so exactly 2 rule statements in the whole store read as business facts without the sheet. 52 statements (33%) contain the agent talking about its own extraction ("the original text is in original", "this pass does not define it", "not expressible in the FEEL subset"). 64 computed rules carry no `expr` at all, only an `original_ref` Sheets formula; 5 of those originals are elided with "..." and 2 are the literal string `JN`. The QF-10 mirror graph is not wired: 70 mirror records exist, zero rule edges point at them, and 71 input/output members name a bare `Table_*` string instead. The schema is the enabler: it requires only `inputs` and `outputs` on a rule and allows anything else, so the agent invented 13 ad-hoc payload keys. On the user's own complaints, colloquialism is NOT a rules problem (1 of 156, F-00464); cell-citation, per-line duplication and non-quantitative content are, overwhelmingly. Byte-wise: rules.json is 383,367 B, of which 34% is pretty-print whitespace, 12.8% statements, 11.4% source[], 9.6% `bindings` (318 per-cell entries), and 0.65% `expr` — the actual business content.

## problems
- [high/orchestration] 156 rules are 46 concepts: 148 of them are exact branch twins of 74 families :: Normalizing keys by stripping the workbook prefix (gozaresh_markazi__ / gozaresh_naharkhoran__) and the __naharkhoran suffix gives 74 families of exactly 2 members + 8 singletons = 156. Further collapsing the line segment (pitza|farangi|sokhari|kanter) gives 46 families. Examples: REPORT__<LINE>__ma
- [high/orchestration] The two passes invented two different rule payload vocabularies and two FEEL dialects for the same rules :: Same 74 rule pairs, different shapes. FEEL: 38 of 74 twin pairs have different expr text — F-00345 'masraf_vaqei - masraf_elami' vs F-00418 'enheraf = masraf_vaqei - masraf_elami'; F-00337 'ruz' vs F-00410 'ruz = tarikh_ruz'; F-00348 'enheraf_ba_tolerance / tedad_forush' vs F-00421 'enheraf_har_adad
- [high/agent-prompt] 95 of 156 rules (61%) are non-quantitative plumbing, not business facts :: Buckets: 24 date-plumbing ("day of the pizza tab from the date tab" — F-00337: «سلول B4 تب پیتزا روز تاریخ گزارش را مستقیم از سلول C5 تب «تاریخ» می‌خواند.», ×4 lines ×2 branches for ruz/mah/sal); 28 mirror-pull columns (F-00340/F-00352/F-00364/F-00373 + naharkhoran twins — "read the item from Table_
- [high/output-format] 147 of 156 statements cite cells, columns or tabs — the statement cannot be read without the sheet :: 117 statements contain a Latin cell ref (regex \\b[A-Z]{1,2}\\d{1,4}(:[A-Z]{1,2}\\d{0,4})?\\b); 147 contain sheet vocabulary (ستون|سلول|تب|کاربرگ|ردیف|محدوده|فرمول|IMPORTRANGE). Only 9 statements have neither, and 7 of those 9 are script plumbing (F-00322, F-00323, F-00330, F-00395, F-00396, F-00401
- [medium/output-format] 52 statements (33%) contain the agent's own housekeeping instead of the fact :: Counts by phrase: 30 «متن اصلی در original آمده / تنها متن اصلی ثبت شده»; 19 «این پاس آن را تعریف نمی‌کند»; 15 «در bindings آمده است»; 13 «در زیرمجموعه FEEL بیان‌پذیر نیست»; 7 «همتای … است / در صورت تأیید انسان می‌توان دو مورد را ادغام کرد». F-00311 ends: «این قاعده همتای ناهارخوران قاعده هم‌نام شعب
- [high/data-quality] 64 computed rules have no expr at all — only a raw Sheets formula, 5 of them truncated :: 81 of 156 rules have no `expr`; 17 are legitimate constants (inputs == []), the other 64 have inputs and fall back to original_ref. All 8 masraf_vaqei rules (the BOM-based actual consumption, the single most valuable computation in the estate) have expr: null. So do all 4 tedad_forush. Worse, 5 orig
- [high/data-quality] The mirror graph the spec's QF-10 is built around was never wired :: records.json holds 70 records with role 'mirror' and mirror_of set. Zero of them are referenced from rules.json (grep of '"ref": "F-xxxxx"' over rules.json vs the mirror id set = 0 hits); 30 of the 70 have zero inbound refs anywhere in the store. Instead 71 rule input/output members carry a bare str
- [high/orchestration] Two entire passes (B5, B7) produced 100 stub records with no fields, and the rules do not use them :: parts/facts-delta-B5.json = 50 records (35 mirror, 15 log), parts/facts-delta-B7.json = 50 records (35 mirror, 15 log) — every one carries "stub": true and no fields[], e.g. anbar_markazi__pitza: {"medium":"sheet","role":"log","location":{...},"stub":true}. Store-wide 101 of 156 records have no fiel
- [high/validator] The schema does not constrain the rule payload, so the agent invented 13 ad-hoc keys :: schemas/facts-delta.schema.json line 109-110: {"properties": {"kind": {"const": "rule"}, "data": {"type": "object", "required": ["inputs", "outputs"]}}} with additionalProperties true. Actual keys found in rules.json data objects beyond the spec's inputs/outputs/expr/lang/original_ref/calls/port/edg
- [medium/output-format] `bindings` is per-cell spreadsheet bloat: 318 entries, 9.6% of the file, duplicating what the record already knows :: 41 rules carry bindings totalling 318 entries and 36,828 pretty-printed bytes of 383,367 (9.6%). Shapes: 96 {cell,ingredient_id,row}, 54 {cell,converts_gr_to_kg,ingredient_id,row}, 34 {cell,row}, 32 {cell,food_codes,ingredient_id,row}, 30 {cell,ingredient_ids,row}. Example F-00340: [{"row":"item_1",
- [medium/data-quality] Provenance is unverifiable for 92% of rule sources, and transcripts barely reached the rules :: 191 source entries across 156 rules (mean 1.22, only 20 rules have more than one source). 175 of 191 carry "hash": null — every source of type 'sheet' (125) and 'cf' (29) is unhashed. By type: sheet 125, cf 29, script 21, process 11, voice 5. Five voice citations in the entire rules store; the 4 ope
- [medium/data-quality] Genuine defect findings are buried inside duplicated rules and will be deleted with them :: 14 rules carry issues[], and they are the highest-value content in the file: F-00324/F-00397 getValueById matches item codes by substring so «##1» hits «##10/##11/##14»; F-00344/F-00368/F-00417/F-00441 the consuming food-code lists are hard-coded per cell so a new menu item silently under-counts act
- [medium/data-quality] 57 of 156 rules (37%) are status 'unknown' :: Counter over rules.json: status confirmed 97, unknown 57, informal 2. retired is false on all 156, valid_from is null on all 156. field_status appears on 2 entries, accounts[] on 1 (F-00461, the cooked→raw chicken factor, where the two transcript readings /0.7 and ×1.3 are correctly recorded as comp
- [low/data-quality] Colloquial speech is NOT a rules problem — the user's complaint does not reproduce here :: Exactly 1 of 156 rule statements carries verbatim transcript speech: F-00464 «… قاعده کار این است که یک کیلو بیشتر از مقدار موردنیاز سفارش داده شود («اگه سه کیلو سس آلفردو پاستا دارن، چهار کیلو باید بزنن») تا وسط شب کم نیاورند.» — and it is one of the few rules that passes the purpose test; the quot

## details
## Scope

`data-repo/facts/rules.json` — 156 entries, 383,367 bytes on disk (pretty-printed, indent=2). All 156 have `scope.departments == ["cooking"]`, `retired == false`, `valid_from == null`, no duplicate keys.

## 1. Bucket classification — every rule, first-match order

| bucket | n | % | bytes (pretty) | % of file | ids |
|---|---|---|---|---|---|
| **c_mirror_pull** — read column from a `Table_*` mirror tab, ÷1000 | 28 | 17.9% | 73,479 | 19.2% | F-00340/341/342/346, 352/353/354/358, 364/365/366, 373/374/375, + 14 naharkhoran twins (413/414/415/419, 425/426/427/431, 437/438/439, 446/447/448) |
| **c_date** — day/month/year from the date tab; jalali↔greg; FORMAT/FILTER/IS_COMBINED/GET_ROW/GET_CELL_BY_PERSIAN_DATE | 38 | 24.4% | 53,276 | 13.9% | 24 × ruz/mah/sal (F-00337-339, 349-351, 361-363, 370-372, 410-412, 422-424, 434-436, 443-445) + F-00315/316/317/318/319/322/323 + twins 388/389/390/391/392/395/396 |
| **a_bom_actual** — actual consumption = Σ(sales × BOM grams), g→kg | 8 | 5.1% | 43,119 | 11.2% | F-00344, 356, 368, 377, 417, 429, 441, 450 |
| **d_cf_flag** — cosmetic conditional-format flags | 17 | 10.9% | 24,004 | 6.3% | F-00380-387, 453-460, + F-00312 |
| **f_gs_lookup** — script lookup helpers (getValueById & wrappers) | 10 | 6.4% | 19,802 | 5.2% | F-00324/325/326/327/329 + twins 397/398/399/400/402 |
| **a_declared_consumption** — start + received − end | 8 | 5.1% | 19,801 | 5.2% | F-00343, 355, 367, 376, 416, 428, 440, 449 |
| **a_deviation_tol** — deviation after tolerance | 4 | 2.6% | 15,999 | 4.2% | F-00347, 359, 420, 432 |
| **a_tolerance_const** — tolerance constants (5, 140, 4, 75, 100 g) | 10 | 6.4% | 13,937 | 3.6% | F-00332-336, 405-409 |
| **a_deviation** — actual − declared | 8 | 5.1% | 11,563 | 3.0% | F-00345, 357, 369, 378, 418, 430, 442, 451 |
| **c_housekeeping** — onOpen, triggerRecalculation, addDropdownColumns | 5 | 3.2% | 9,607 | 2.5% | F-00313, 330, 331, 403, 404 |
| **a_deviation_per_unit** — deviation ÷ sales count, round 3 | 4 | 2.6% | 9,367 | 2.4% | F-00348, 360, 421, 433 |
| **a_operational** — chicken cooked→raw, penne par level, fryer oil, sauce +1kg | 4 | 2.6% | 8,469 | 2.2% | F-00461, 462, 463, 464 |
| **a_carryover** — tonight's opening = last night's closing | 2 | 1.3% | 8,460 | 2.2% | F-00309, 311 |
| **a_zero_semantics** — 0 in the BOM means "not used" | 1 | 0.6% | 5,205 | 1.4% | F-00314 |
| **f_gs_business** — getTotalFoodsIngredient (the BOM×sales core) | 2 | 1.3% | 4,617 | 1.2% | F-00328, 401 |
| **e_cell_literal** — DATE() literals, "the CF threshold is 0" | 3 | 1.9% | 4,109 | 1.1% | F-00310, 379, 452 |
| **c_importrange** — IMPORT_FROM_SHEET | 2 | 1.3% | 3,377 | 0.9% | F-00321, 394 |
| **c_unit_redundant** — CONVERT_GR_TO_KG (= the unit registry) | 2 | 1.3% | 3,131 | 0.8% | F-00320, 393 |
| **TOTAL** | **156** | | 331,322 | | |

Roll-up: **(a) real business 49 (31.4%, 35.5% of bytes) · (c) plumbing 75 (48.1%, 37.3%) · (d) cosmetic CF 17 (10.9%, 6.3%) · (e) cell literals 3 (1.9%, 1.1%) · (f) script functions 12 (7.7%, 6.4%)**. Non-business (c+d+e+f_gs_lookup) = **105 rules, 67%, 49.8% of the file**.

## 2. Bucket (b) — the duplicate groups

Key normalization: strip `gozaresh_(markazi|naharkhoran)__` prefix and `__naharkhoran` suffix → **74 families of exactly 2 + 8 singletons**. Collapse the line segment too → **46 families**.

| family (line × branch) | n | ids |
|---|---|---|
| `<LINE>__ruz` / `__mah` / `__sal` | 8 each = 24 | F-00337-339, 349-351, 361-363, 370-372 (chalebagh) + 410-412, 422-424, 434-436, 443-445 |
| `<LINE>__mojudi_avval_shab` | 8 | F-00340, 352, 364, 373, 413, 425, 437, 446 |
| `<LINE>__daryaft_az_anbar` | 8 | F-00341, 353, 365, 374, 414, 426, 438, 447 |
| `<LINE>__mojudi_akhar_shab` | 8 | F-00342, 354, 366, 375, 415, 427, 439, 448 |
| `<LINE>__masraf_elami` | 8 | F-00343, 355, 367, 376, 416, 428, 440, 449 |
| `<LINE>__masraf_vaqei` | 8 | F-00344, 356, 368, 377, 417, 429, 441, 450 |
| `<LINE>__enheraf` | 8 | F-00345, 357, 369, 378, 418, 430, 442, 451 |
| `<LINE>__flag_enheraf_mosbat` | 8 | F-00380, 382, 384, 387, 453, 455, 457, 460 |
| `<LINE>__flag_enheraf_manfi` | 8 | F-00381, 383, 385, 386, 454, 456, 458, 459 |
| `<LINE>__tedad_forush` | 4 | F-00346, 358, 419, 431 |
| `<LINE>__enheraf_ba_tolerance` | 4 | F-00347, 359, 420, 432 |
| `<LINE>__enheraf_har_adad_ba_tolerance` | 4 | F-00348, 360, 421, 433 |
| `fn__*` named functions (7 kinds × 2 branches) | 14 | F-00315-321, 388-394 |
| `gs__*` script functions (10 kinds × 2 branches) | 20 | F-00322-331, 395-404 |
| `<LINE>__tolerance__item_{1,2,3,5,12}` | 10 | F-00332-336, 405-409 |
| `cf_astane_sefr` | 2 | F-00379, 452 |
| `mojudi_avval_shab__from_akhar_shab_prev` | 2 | F-00309, 311 |
| singletons | 8 | F-00310, 312, 313, 314, 461, 462, 463, 464 |

Semantic identity is confirmed, not assumed: F-00355 and F-00428 have byte-identical statements; F-00386 and F-00459 have byte-identical statements; 38 of the 74 twin pairs differ in `expr` only by FEEL dialect.

## 3. Bucket (g) — rules with no `expr`

- 81 of 156 have no `expr`. 17 are legitimate constants (`inputs == []`, per spec §7). **64 are computed rules with inputs and no expr**, falling back to `original_ref`; all 64 do have an original file.
- lang split of those 64: `sheets` 26, `gs` 19, `feel` 19 (a `lang: feel` rule with no FEEL expression is self-contradicting).
- All 8 `masraf_vaqei` and all 4 `tedad_forush` — the two most valuable computations — have `expr: null`.
- Original files: 140 referenced, 21,577 bytes total; median 245 B, max 1,576 B.
- **Not verbatim**: 5 originals contain an ellipsis where the agent elided source — F-00323, F-00327, F-00396, F-00400, F-00419. `originals/F-00419.txt` literally reads `...` on two lines. **2 originals are the 2-byte string `JN`** (F-00359, F-00432).
- Usability verdict: `originals/F-00413.txt` = `LET(pizzaData, GET_ROW_BY_PERSIAN_DATE(BN,CN,DN,Table_Pizza_First), totalGr, getIngredientValueById(1,pizzaData,Refresher), CONVERT_GR_TO_KG(totalGr))` — readable only if you also have the named functions (F-00319, F-00326, F-00320) and the mirror tab. Nobody outside Google Sheets can execute it.

## 4. Bucket (h) — statements citing cells/columns/tabs

| test | count |
|---|---|
| Latin cell ref (`\b[A-Z]{1,2}\d{1,4}(:[A-Z]{1,2}\d{0,4})?\b`) | 117 / 156 |
| Sheet vocabulary (ستون, سلول, تب, کاربرگ, ردیف, محدوده, فرمول, IMPORTRANGE, LET, LAMBDA) | 147 / 156 |
| Either | 147 / 156 (94%) |
| Neither | 9 — F-00322, 323, 330, 395, 396, 401, 403 (all script plumbing), **F-00462, F-00463** (the only two self-contained business statements) |

Statement length: median 170 chars, max 604 (F-00311).

## 5. Bucket (i) — colloquialism, and what is actually in the statements instead

Only **1 of 156** carries verbatim colloquial speech: F-00464 «…(«اگه سه کیلو سس آلفردو پاستا دارن، چهار کیلو باید بزنن»)…». A 16-marker scan flagged 35 but the other 34 are substring false positives (`دارن` inside `دارند`, `کنن` inside `می‌کنند`). **The colloquialism complaint does not reproduce in rules.json.**

What does pollute the statements is agent housekeeping — **52 of 156 (33%)**:

| phrase class | n |
|---|---|
| «متن اصلی در original آمده» / «تنها متن اصلی ثبت شده» | 30 |
| «این پاس آن را تعریف نمی‌کند» | 19 |
| «در bindings آمده است» | 15 |
| «در زیرمجموعه FEEL بیان‌پذیر نیست» | 13 |
| «همتای …» / «در صورت تأیید انسان می‌توان دو مورد را ادغام کرد» | 7 |
| «در استخراج ثبت نشده است» | 2 |

## 6. inputs/outputs refs — where they point

| target | count |
|---|---|
| `record` (inputs) | 177 |
| `record` (outputs / writes_to) | 108 |
| `rule` (inputs) | 4 |
| **no `ref` at all (inputs)** | **133** |
| **no `ref` at all (outputs)** | **55** |
| dangling refs | 0 |
| edges landing on a record with no `fields[]` | 0 |
| edges naming a field the record doesn't declare | 0 |

Record roles targeted: report 168, reference 94, log 23. **mirror: 0.** Of the 188 ref-less members, 71 name a bare tab string (`{key, sheet}` 51, `{key, sheet, title, unit}` 13, `{key, sheets, title, unit}` 6, `{key, sheet, unit}` 1) covering 35 distinct `Table_*` names. The store holds 70 mirror records; 30 have zero inbound refs anywhere; **0 are referenced from rules.json**.

## 7. Byte accounting for rules.json (383,367 B)

| slice | bytes | % of file |
|---|---|---|
| pretty-print whitespace (383,367 − 253,096 compact) | 130,271 | **34.0%** |
| `statement` | 49,070 | 12.8% |
| `source[]` | 43,795 | 11.4% |
| **`data.bindings`** (318 per-cell entries, 41 rules) | **36,828** | **9.6%** |
| `data.inputs` | 33,665 | 8.8% |
| `data.outputs` | 20,569 | 5.4% |
| `title` | 11,431 | 3.0% |
| `data.edge_cases` (52 items) | 8,587 | 2.2% |
| `scope` | 8,764 | 2.3% |
| `issues[]` (14 rules) | 6,579 | 1.7% |
| `key` | 6,807 | 1.8% |
| `data.original_ref` (paths only) | 4,060 | 1.1% |
| `data.calls` (134 refs) | 2,686 | 0.7% |
| **`data.expr` — the actual business content** | **2,506** | **0.65%** |
| external: `originals/F-*.txt` for rules | 21,577 | (outside the file) |

## 8. Fifteen verbatim examples

| # | id | bucket | statement (verbatim) |
|---|---|---|---|
| 1 | F-00343 | a_declared_consumption (KEEP) | «ستون H تب پیتزا (گروه H6:H15): مصرف اعلامی هر قلم برابر است با موجودی اول شب به‌علاوه دریافت از انبار منهای موجودی آخر شب. همین تعریف را فرایند ثبت آمار مانده هم بیان می‌کند…» |
| 2 | F-00355 | b duplicate of #1 | «ستون H تب فرنگی (گروه H6:H14): موجودی اول شب به‌علاوه دریافت از انبار منهای موجودی آخر شب.» |
| 3 | F-00428 | b — byte-identical twin of #2, other branch | «ستون H تب فرنگی (گروه H6:H14): موجودی اول شب به‌علاوه دریافت از انبار منهای موجودی آخر شب.» |
| 4 | F-00337 | c_date | «سلول B4 تب پیتزا روز تاریخ گزارش را مستقیم از سلول C5 تب «تاریخ» می‌خواند.» |
| 5 | F-00410 | c_date, naharkhoran twin of #4 | «سلول B4 تب پیتزا روز تاریخ گزارش را مستقیم از تب «تاریخ» می‌خواند.» |
| 6 | F-00371 | c_date, ×4 lines | «سلول C4 تب کانتر ماه تاریخ گزارش را از سلول D5 تب «تاریخ» می‌خواند.» |
| 7 | F-00386 | d_cf_flag | «قاعده قالب‌بندی شرطی روی محدوده J6:J10 تب کانتر برای سلول‌های کوچک‌تر از صفر.» |
| 8 | F-00459 | d_cf_flag, byte-identical twin of #7 | «قاعده قالب‌بندی شرطی روی محدوده J6:J10 تب کانتر برای سلول‌های کوچک‌تر از صفر.» |
| 9 | F-00452 | e_cell_literal | «همه قاعده‌های قالب‌بندی شرطی چهار تب گزارش، ستون انحراف را نسبت به عدد صفر می‌سنجند؛ آستانه در هر هشت قاعده صفر است.» |
| 10 | F-00310 | e_cell_literal | «در تب «زمان تحویل و سنجش کیفیت» فایل Ashpazkhne - Naharkhoran.xlsx شش سلول A18 تا A23 به‌جای مقدار تاریخ، فرمول ثابت DATE با تاریخ میلادی دارند: A18=DATE(2025,12,16)…» |
| 11 | F-00404 | c_housekeeping | «تابع اسکریپت که با نوشتن مهر زمانی جاری در سلول A1 تب Refresher همه فرمول‌های وابسته را دوباره محاسبه می‌کند… ورودی داده‌ای ندارد و مقدار نوشته‌شده ساعت لحظه اجراست، پس مقدار خروجی نامعلوم ثبت شده است.» |
| 12 | F-00313 | c_housekeeping — the agent says so itself | «…روی هر تب سه ستون در ابتدای کاربرگ درج می‌کند… **این تابع یک ابزار راه‌اندازی کاربرگ است و منطق کسب‌وکار نیست**، بنابراین نامزد پورت شدن به موتور نیست.» |
| 13 | F-00446 | c_mirror_pull + housekeeping prose | «ستون E تب کانتر (E6 تا E10): برای هر گروه نوشیدنی، مقدار همه اقلام آن گروه در ردیف تاریخ جدول Table_KitchenCounter_First خوانده و با هم جمع می‌شود؛ بدون تبدیل واحد. **جمع روی جدول آینه‌ای اجرا می‌شود که این پاس آن را تعریف نمی‌کند**، بنابراین تنها متن اصلی فرمول ثبت شده است.» |
| 14 | F-00311 | b — the agent flags its own duplicate | «…این قاعده همتای ناهارخوران قاعده هم‌نام شعبه چاله‌باغ است و **در صورت تأیید انسان می‌توان دو مورد را ادغام کرد**.» |
| 15 | F-00463 | a_operational (KEEP) — one of only two sheet-free statements | «لاین سوخاری چهار سرخ‌کن دارد و هر شب یکی از آن‌ها به‌نوبت از سرویس خارج و روغنش عوض می‌شود، یعنی روغن هر سرخ‌کن هر دو شب یک بار تعویض می‌شود… اگر روغن نیم‌حلب از شب قبل مانده باشد، آن شب سفارش داده نمی‌شود.» |

Bonus (best rule in the file, and the only one with competing accounts) — F-00461: «مرغ گریل خام از انبار تحویل گرفته می‌شود و وزن آن خام حساب می‌شود، ولی آخر شب مقداری مرغ گریل پخته می‌ماند… ضریب تبدیل در دو جای همین جلسه به دو شکل بیان شده…» with `accounts[]` holding both readings (`/0.7` chosen, `×1.3` competing).

## 9. Proposed KEEP set — 13-16 rules (8-10% of 156)

| # | keep | replaces | note |
|---|---|---|---|
| 1 | `masraf_elami` — declared consumption = opening + received − closing, parametric over (line, branch) | 8 | scope both branches |
| 2 | `masraf_vaqei` — actual consumption = Σ(sales_qty × BOM grams), g→kg | 8 + F-00328/401 (same computation) | needs a real `expr`; the food-code lists belong in the BOM reference record, not `bindings` |
| 3 | `enheraf` — deviation = actual − declared | 8 | |
| 4 | `enheraf_ba_tolerance` — deviation net of tolerance, three shapes (per portion sold / per kg actual / none) | 4 | shape per item is a column on the tolerance table, not a binding |
| 5 | `enheraf_har_adad_ba_tolerance` — per-unit deviation, round 3 | 4 | rounding inconsistency (F-00433) becomes an issue on this rule |
| 6 | `tedad_forush` — portions sold that consume this item | 4 | currently inside c_mirror_pull but it is a real definition |
| 7 | `mojudi_avval_shab = mojudi_akhar_shab(previous night)` | 2 | |
| 8-12 | tolerance constants: 5 g/portion (پنیر پیتزا ##1), 140 g/kg (رست بیف ##2), 4 g/portion (ژامبون سه گانه ##3), 75 g/kg (مرغ پیتزا ##5), 100 g/kg (مرغ فرنگی ##12) | 10 | better as **one** `role: reference` record with 5 rows (§8 clause 6) → then the keep count drops to 12 |
| 13 | chicken cooked→raw conversion, factor disputed (F-00461) | 1 | keep `accounts[]` |
| 14 | penne par level: 40 portions normal / 65 Thu-Fri, 5 portions per pack (F-00462) | 1 | already `lang: table` — correct per §8 clause 2 |
| 15 | fryer oil rotation: 4 fryers, each every 2 nights (F-00463) | 1 | |
| 16 | sauce ordering: order 1 kg over requirement (F-00464) | 1 | |

Dropped outright: **105** rules (c 75 + d 17 + e 3 + f_gs_lookup 10). Migrated elsewhere rather than kept as rules:
- "0 in the BOM means the ingredient is not used" (F-00314) → `fields[].description` on the BOM reference record (§8 clause 4/6).
- The 1000× scale error (F-00320, F-00393, F-00340/341/342, F-00413/414, F-00425/426/427) → one `issues[]` entry on the mirror-pull definition or on the report record.
- `getValueById` substring code matching (F-00324/397) → one `issues[]` entry on the item-code namespace, which is where the ERP will hit it.
- Hard-coded food-code lists (F-00344/368/417/441), starter code 4 ≠ #27 (F-00356/429), CF range L6:L14 misses L15 (F-00453), tolerance defined for only 4 of 10 items on two bases (F-00347/420) → `issues[]` on the surviving keeps #2, #4.
- Date/IMPORTRANGE/onOpen/refresher/addDropdownColumns → nothing. They describe how Google Sheets is wired, which the ERP replaces.

Sanity check on the target: 46 distinct concepts today, 16 of them business, 30 plumbing. A run that produced ~16 rules instead of 156 would carry the same business content in roughly 40 KB instead of 383 KB.

## Files referenced

- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/rules.json`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/records.json` (70 mirror records, 101 with no `fields[]`)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/originals/F-00419.txt`, `F-00359.txt`, `F-00432.txt` (truncated / 2-byte originals)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/runs/facts/cooking/20260902-080737/parts/facts-delta-B4.json` (73 rules, chalebagh) and `facts-delta-B6.json` (73 rules, naharkhoran)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/runs/facts/cooking/20260902-080737/parts/facts-delta-B5.json` and `facts-delta-B7.json` (50 stub records each)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/schemas/facts-delta.schema.json` lines 109-110 (the unconstrained rule payload)
- intermediate: `/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/rules.tsv`, `buckets.json`