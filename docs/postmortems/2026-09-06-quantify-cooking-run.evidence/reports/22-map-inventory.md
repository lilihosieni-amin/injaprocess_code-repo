# map:inventory

## summary
The estate is small — 28 workbooks, 316 tabs, 1.75 MB of dumps and 1.63 MB of transcripts — but the cooking run fed it to the agent in the worst possible shape. Three things dominate. (1) Scope: `runs/facts/cooking/20260902-080737/meta.json` lists only 3 of the 8 cooking transcripts and `"attachments": []`, so 520,425 of 615,432 transcript bytes (85%) and both cooking job-description docx were never read at all — yet the run still blew every limit. (2) Input shape: raw dump files are 5.9x larger than the information they carry (500,141 tok raw vs 84,875 tok as a digest; `sandogh_chalebagh/formulas.tsv` is 337,806 bytes of 584 lines holding exactly 2 distinct formula shapes, a 175x ratio), and 96 of the 316 tabs are `Table_*` mirrors whose formulas are nothing but IMPORT_FROM_SHEET. (3) Output shape: the 486 entries in the store average 1,809 bytes ≈ 517 output tokens each, so the 64K output cap is hit at ~124 entries — B3 emitted 100 entries in 193 KB and B4/B6 emitted 81/80; the crashes were arithmetically guaranteed, not bad luck. On top of that sits 18,509 tokens of fixed prompt (quantify.md 18,370 B + SKILL.md 39,795 B + schema 6,617 B) before a single byte of data. The output-quality complaints are all measurable: 463/486 statements use sheet vocabulary, 291 name an .xlsx, 196 cite an A1 cell, 133 name a `Table_*` mirror; 154/156 rules are scoped to one branch and 146/156 rule keys are prefixed `gozaresh_markazi__`/`gozaresh_naharkhoran__`, even though those two workbooks share 78 of their 86/79 distinct formula shapes (Jaccard 0.90) — 11 rule families × 4 lines × 2 branches = 88 rules where 11 would do. Cooking partitions into 12 units of ≤40K input tokens as-is, or 8 units if the fixed prompt is trimmed to ~6K. The manifest declares no workbook under two departments, but real sharing runs through IMPORT_FROM_SHEET and mirror tabs: `mavade_avalie` and the 8 line-inventory workbooks belong to cooking, `tedade_fooroosh_*` to cashier, `anbar_*` to warehouse, `hesabdari` to accounting, and `gozareshat` (imports from 11 workbooks across 7 departments) must run last.

## problems
- [high/orchestration] 85% of cooking's transcript bytes and 100% of its attachments were never in the run's scope :: /home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/runs/facts/cooking/20260902-080737/meta.json lists "recordings": [cooking-1405-05-26, cooking-1405-05-26-02, cooking-1405-06-01] and "attachments": []. The five omitted transcripts total 520,425 of 615,432 bytes (cookin
- [high/orchestration] The unit of work was the whole department: ~291K input tokens for one agent :: Cooking = 13 workbooks (385,090 dump bytes) + 11,075 bytes of .gs + 615,432 transcript bytes + 7,658 bytes of attachment text = 1,019,255 bytes ≈ 291,216 input tokens at bytes/3.5. Measured by /tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-
- [high/spec] The 64K output cap is hit at ~124 entries; the passes were sized above it :: 486 entries in /home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/*.json average 1,809 bytes = ~517 output tokens (item 1,090 B / record 2,700 B / rule 1,622 B / note 1,579 B / measurement 1,448 B; max record 12,059 B). 64000/517 = 124 entries. Actual parts: facts
- [high/agent-prompt] 18,509 tokens of fixed prompt load before any data reaches the agent :: quantify.md 18,370 B + SKILL.md 39,795 B + facts-delta.schema.json 6,617 B = 64,782 B ≈ 18,509 tokens. A 40K-token work unit therefore has only 21,491 tokens left for data. Trimming the fixed load to ~6K collapses cooking from 12 units to 8 (measured by inventory.py plan()).
- [high/harness] Raw dump files are 5.9x larger than the information they carry; formulas.tsv is 68% of all dump bytes :: Estate dumps: 1,750,493 B = 500,141 tok raw vs 297,064 B = 84,875 tok as a digest (tab list + header row + DISTINCT formula shapes + distinct cf/validation rules + names/rows/comments verbatim). formulas.tsv alone is 1,190,202 of 1,750,493 dump bytes yet holds only 293 distinct shapes across the who
- [high/agent-prompt] 96 of 316 tabs are Table_* mirrors fed to the agent as first-class data :: Table_* tabs: gozaresh_markazi 35 of 43, gozaresh_naharkhoran 35 of 42, control_gozareshat 26 of 33. Every one is import-only (its formulas contain nothing but IMPORT_FROM_SHEET/IMPORTRANGE): the inventory's import-only tab count equals the Table_* count in all three. Dropping them cuts the estate d
- [high/output-format] Branch and line duplication is structural in the input and the prompt did not collapse it :: gozaresh_markazi and gozaresh_naharkhoran share 78 distinct formula shapes of 86 and 79 respectively (Jaccard 0.90). All 8 line-inventory workbooks (pitza, farangi, sokhari, kanter, amar_pitza, amar_farangi, amar_kanter, fried) have the identical two tabs «موجودی اول شب» / «موجودی آخر شب». Result in
- [high/output-format] Statements encode sheet location instead of the fact — 40% cite an A1 cell :: Of 486 statements: 463 (95%) contain تب/شیت/فایل/ستون/سلول/xlsx/Table_/Sheet; 291 (60%) name an .xlsx file; 196 (40%) contain an A1-style cell reference; 133 (27%) name a Table_* tab. Example (facts/notes.json F-00465): «در فایل Kanter.xlsx روی سلول ستون ... در تب «موجودی اول شب» سلول F37 و در تب «م
- [high/orchestration] The facts store is already too large to load as dedup context for the next department :: facts/*.json = 1,287,512 bytes ≈ 367,861 tokens for 486 entries (records.json 630,226 B, rules.json 383,367 B, items.json 206,210 B). One department's output alone exceeds any per-unit context budget; the run kept a facts-before/ snapshot per run rather than a queryable index.
- [medium/engine] The dumper ships empty and junk tabs as if they were data :: amar_farangi has 53 tabs of which 51 are empty (Sheet24..Sheet74), costing 16,414 B of sheets.json = 5,136 raw tokens for 2 real tabs; dropping them takes its digest 662 -> 358 tok. Estate-wide 58 of 316 tabs are empty. control_gozareshat also carries 'Copy of مواد حساس' (1012x14, hidden) and 'سفارش
- [medium/spec] The `note` kind is a dumping ground for things that are rules or trivia :: 22 notes total. facts/notes.json key kanter__mojudi__comment_149 records a cell comment whose entire content is «149» and whose own statement admits «معنای این کامنت ... در فایل مشخص نیست». Meanwhile enheraf__astane_barresi_va_elal («آستانه بررسی انحراف»), tolerance__dalil_va_kaarbord and off_ejraei
- [medium/spec] Non-quantitative sheet cosmetics are being turned into entries :: Source-type histogram across the store: sheet 472, voice 64, validation 53, cf 39, process 35, script 23, chat 3, comment 2. 39 entries derive from conditional formatting; the estate has only 50 cf lines total collapsing to a handful of distinct rules (gozaresh_markazi 2 distinct cf rules, salon_* 2
- [medium/harness] Passes were repaired by hand-editing parts, leaving an ambiguous concatenation :: runs/facts/cooking/20260902-080737/parts/ contains both facts-delta-B6.json (182,283 B, 80 entries: 7 record + 73 rule) and facts-delta-B6-rules-fixed.json (97,166 B, 64 rules). The concatenated facts-delta.json is 1,013,794 B / 485 entries; the parts sum to 485 only if exactly one of the two B6 fil

## details
## Script

`/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/inventory.py`
(self-check: `python3 inventory.py --selftest`; full 732-line output saved beside it as `inventory-out.md`)

Formula shapes are counted by normalising A1 refs to `@` and bare numbers to `#`. The dumper's own relative-row notation (`CN-BN`, `AN`) is part of that normalisation; a negative lookahead keeps `MIN(`/`LN(` from being eaten.

---

## 1. Per-workbook inventory

| short | departments | branches | conf | tabs | nonempty | hidden | Table_* | formula lines | shapes | expanded cells | rows.tsv | names | cf | valid | comments | import-only tabs | scripts (bytes) | dump bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| amadesazi | preparation | chalebagh,naharkhoran | Y | 7 | 7 | 0 | 0 | 11 | 1 | 401 | 0 | 0 | 0 | 14 | 10 | 0 | - | 14352 |
| anbar | warehouse | chalebagh,naharkhoran | Y | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | 81 | 0 | - | 17393 |
| ashpazkhne_chalebagh | cooking | chalebagh | Y | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 0 | 0 | - | 6125 |
| ashpazkhne_naharkhoran | cooking | naharkhoran | Y | 5 | 5 | 1 | 0 | 6 | 1 | 6 | 0 | 0 | 0 | 13 | 0 | 0 | - | 6564 |
| gozareshat | management | chalebagh,naharkhoran | Y | 29 | 29 | 18 | 0 | 344 | 78 | 381 | 11 | 34 | 15 | 3 | 0 | 17 | Gozareshat.gs (23030) | 90256 |
| hesabdari | accounting | chalebagh,naharkhoran | Y | 6 | 6 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 15 | 0 | 0 | - | 15892 |
| logestic_chalebagh | logistics | chalebagh | Y | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | - | 3692 |
| logestic_naharkhoran | logistics | naharkhoran | Y | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | - | 4808 |
| anbar_markazi | warehouse | chalebagh | Y | 5 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 6 | 0 | - | 12414 |
| farangi | cooking | chalebagh | Y | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | - | 7105 |
| kanter | cooking | chalebagh | Y | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 2 | 0 | - | 10000 |
| pitza | cooking | chalebagh | Y | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | - | 6532 |
| sokhari | cooking | chalebagh | Y | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | - | 5069 |
| tedade_fooroosh_markazi | cashier | chalebagh | Y | 12 | 11 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | Tedade Fooroosh markazi.gs (13320) | 18023 |
| gozaresh_markazi | cooking | chalebagh | Y | 43 | 43 | 37 | 35 | 205 | 121 | 281 | 76 | 53 | 8 | 3 | 0 | 35 | Gozaresh markazi.gs (4661) | 137618 |
| mavade_avalie | cooking | chalebagh,naharkhoran | Y | 12 | 12 | 0 | 0 | 0 | 0 | 0 | 69 | 0 | 10 | 24 | 0 | 0 | - | 37226 |
| anbar_shobe_2 | warehouse | naharkhoran | Y | 6 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 0 | - | 11168 |
| fried | cooking | naharkhoran | Y | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 8 | 0 | 0 | - | 4899 |
| amar_farangi | cooking | naharkhoran | Y | 53 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | - | 17976 |
| amar_kanter | cooking | naharkhoran | Y | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | Kanter.gs (1751) | 7040 |
| amar_pitza | cooking | naharkhoran | Y | 4 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | - | 6264 |
| tedade_fooroosh_naharkhoran | cashier | naharkhoran | Y | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | Tedade Fooroosh naharkhoran.gs (13320) | 17746 |
| gozaresh_naharkhoran | cooking | naharkhoran | Y | 42 | 42 | 37 | 35 | 206 | 114 | 284 | 76 | 51 | 8 | 3 | 0 | 35 | Gozaresh naharkhoran.gs (4663) | 132672 |
| control_gozareshat | procurement | chalebagh | Y | 33 | 33 | 30 | 26 | 221 | 114 | 252 | 157 | 37 | 0 | 3 | 0 | 26 | - | 158295 |
| salon_chalebagh | dining | chalebagh | Y | 5 | 5 | 1 | 0 | 574 | 2 | 1147 | 1 | 2 | 2 | 10 | 0 | 0 | Salon - Chalebagh.gs (2076) | 326206 |
| salon_naharkhoran | dining | naharkhoran | Y | 5 | 5 | 1 | 0 | 568 | 4 | 1132 | 1 | 2 | 2 | 9 | 0 | 0 | Salon - Naharkhoran.gs (2075) | 324346 |
| sandogh_chalebagh | cashier | chalebagh | Y | 5 | 5 | 1 | 0 | 584 | 2 | 1167 | 1 | 2 | 2 | 8 | 0 | 0 | Sandogh - Chalebagh.gs (2077) | 344203 |
| sandogh_naharkhoran | cashier | naharkhoran | Y | 5 | 5 | 1 | 0 | 1 | 1 | 414 | 1 | 2 | 2 | 8 | 3 | 0 | Sandogh - NaharKhoran.gs (2077) | 6609 |

**Totals**: 28 workbooks, all `confirmed: true`. 316 tabs · 258 non-empty · 128 hidden · **96 `Table_*` mirrors** · 2,721 formula lines · 5,466 expanded formula cells · 394 rows.tsv rows · 183 names · 50 cf · 292 validations · 102 comments · 1,750,493 dump bytes. **Distinct formula shapes across the whole estate: 293.**

`import-only tabs` (formulas are nothing but `IMPORT_FROM_SHEET`/`IMPORTRANGE`) equals the `Table_*` count in gozaresh_markazi (35), gozaresh_naharkhoran (35) and control_gozareshat (26); gozareshat has 17 import-only tabs that are not named `Table_*` (the `Prep-*`, `Warehouse-*`, `Salon-*`, `CashRegister-*`, `Accounting-*` mirrors).

### Per-file bytes

| short | sheets.json | formulas.tsv | rows.tsv | names.tsv | cf.tsv | validations.tsv | comments.tsv | meta.json | total |
|---|---|---|---|---|---|---|---|---|---|
| amadesazi | 10450 | 521 | 0 | 19 | 32 | 1707 | 1317 | 306 | 14352 |
| anbar | 6308 | 45 | 0 | 19 | 32 | 1108 | 9579 | 302 | 17393 |
| ashpazkhne_chalebagh | 4329 | 45 | 0 | 19 | 32 | 1358 | 23 | 319 | 6125 |
| ashpazkhne_naharkhoran | 4324 | 489 | 0 | 19 | 32 | 1356 | 23 | 321 | 6564 |
| gozareshat | 40775 | 43477 | 1087 | 2785 | 1445 | 333 | 23 | 331 | 90256 |
| hesabdari | 13266 | 101 | 205 | 19 | 32 | 1911 | 23 | 335 | 15892 |
| logestic_chalebagh | 2512 | 45 | 0 | 19 | 32 | 745 | 23 | 316 | 3692 |
| logestic_naharkhoran | 3625 | 45 | 0 | 19 | 32 | 745 | 23 | 319 | 4808 |
| anbar_markazi | 9492 | 45 | 0 | 19 | 32 | 2095 | 421 | 310 | 12414 |
| farangi | 5545 | 45 | 0 | 19 | 32 | 1138 | 23 | 303 | 7105 |
| kanter | 7909 | 45 | 0 | 19 | 32 | 1588 | 105 | 302 | 10000 |
| pitza | 4974 | 45 | 0 | 19 | 32 | 1138 | 23 | 301 | 6532 |
| sokhari | 3509 | 45 | 0 | 19 | 32 | 1138 | 23 | 303 | 5069 |
| tedade_fooroosh_markazi | 15884 | 45 | 0 | 19 | 32 | 1699 | 23 | 321 | 18023 |
| gozaresh_markazi | 70063 | 48980 | 12879 | 4254 | 344 | 333 | 23 | 742 | 137618 |
| mavade_avalie | 21617 | 45 | 12406 | 19 | 566 | 1959 | 23 | 591 | 37226 |
| anbar_shobe_2 | 8660 | 45 | 0 | 19 | 32 | 2079 | 23 | 310 | 11168 |
| fried | 3252 | 45 | 0 | 19 | 117 | 1138 | 23 | 305 | 4899 |
| amar_farangi | 16414 | 45 | 0 | 19 | 32 | 1138 | 23 | 305 | 17976 |
| amar_kanter | 5440 | 45 | 0 | 19 | 32 | 1179 | 23 | 302 | 7040 |
| amar_pitza | 4706 | 45 | 0 | 19 | 32 | 1138 | 23 | 301 | 6264 |
| tedade_fooroosh_naharkhoran | 15603 | 45 | 0 | 19 | 32 | 1699 | 23 | 325 | 17746 |
| gozaresh_naharkhoran | 65905 | 49019 | 12238 | 4064 | 344 | 333 | 23 | 746 | 132672 |
| control_gozareshat | 55673 | 70908 | 27985 | 2586 | 32 | 336 | 23 | 752 | 158295 |
| salon_chalebagh | 4293 | **319976** | 142 | 251 | 157 | 1027 | 23 | 337 | 326206 |
| salon_naharkhoran | 4502 | **318047** | 142 | 251 | 157 | 885 | 23 | 339 | 324346 |
| sandogh_chalebagh | 4573 | **337806** | 142 | 251 | 175 | 894 | 23 | 339 | 344203 |
| sandogh_naharkhoran | 4216 | 113 | 142 | 251 | 175 | 894 | 477 | 341 | 6609 |
| **all** | 417819 | **1190202** | 67368 | 15073 | 4088 | 33091 | 12428 | 10424 | **1750493** |

`formulas.tsv` is 68% of all dump bytes. The three worst files (salon_chalebagh, salon_naharkhoran, sandogh_chalebagh = 975,829 B) contain 1,726 formula lines carrying **8 distinct shapes** — the same multi-line `LET(...IMPORT_FROM_SHEET...)` blob repeated once per row.

### Tabs (rows×cols; `*` = Table_ mirror, `h` = hidden; empty tabs omitted)

- **amadesazi** (7 tabs, 0 empty): ضایعات 379x9 · خمیر 244x5 · خروجی آماده سازی به انبار 381x23 · ورودی آماده سازی از انبار 382x12 · OFF اجرایی 330x4 · نیازمندیها و مشکلات 205x3 · بازدهی 136x12
- **anbar** (4, 0): خروجی انبار به آماده سازی 455x13 · ورودی انبار از آماده سازی 458x18 · ضایعات 329x9 · نیازمندیها و مشکلات 61x3
- **ashpazkhne_chalebagh** (5, 0): زمان تحویل و سنجش کیفیت 340x4 · ضایعات 329x4 · OFF اجرایی 329x4 · نیازمندیها و مشکلات 191x3 · خمیر 82x4
- **ashpazkhne_naharkhoran** (5, 0): زمان تحویل و سنجش کیفیت 130x3 · ضایعات 80x4 · OFF اجرایی 103x4 · نیازمندیها و مشکلات 33x3 · خمیر 1x4h
- **gozareshat** (29, 0): تاریخ 8x6 · مغایرت 19x11 · مواد اولیه 37x17 · ضایعات 30x15 · backup مواد اولیه 33x17h · انحراف آمارگیری 39x7 · نیازمندیها و مشکلات 16x7 · OFF اجرایی 12x8 · اطلاعات لجستیک 7x11 · تعداد فیش فروش 11x9 · گزارش بستن صندوق 7x6 · Kitchen-Dough-Chalebagh 82x4h · Kitchen_Dough_Naharkhoran 1x4h · Salon-Recipts-Chalebagh 575x4h · Salon-Recipts-Naharkhoran 566x4h · CashRegister-Recipts-Chalebagh 585x4h · CashRegister-Recipts-Naharkhora 415x4h · Warehouse-Waste 329x9h · Prep-Waste 379x5h · Accounting-CashRegisterClosingR 243x5h · Prep-Dough 244x5 · Prep-PrepOutputToWarehouse 381x23h · Prep-PrepInputFromWarehouse 382x12h · Warehouse-WarehouseOutputToPrep 455x13h · Warehouse-WarehouseInputFromPre 458x18h · Accounting-Statistics 240x13h · SheetsFileIds 12x2h · Accounting-Mismatch-Chalebagh 143x35h · Accounting-Mismatch-NaharKhoran 125x35h
- **hesabdari** (6, 0): انحراف آمارگیری شعبه چاله باغ 143x37 · انحراف آمارگیری شعبه ناهارخوران 125x35 · آمار 240x13 · گزارش بستن صندوق 243x7 · نیازمندیها و مشکلات 13x3 · اهداف فروش 3x7
- **logestic_chalebagh** (3, 0): زمان ها 352x3 · اطلاعات لجستیک 356x5 · نیازمندیها و مشکلات 2x3
- **logestic_naharkhoran** (3, 0): زمان ها 212x3 · اطلاعات لجستیک 215x5 · نیازمندیها و مشکلات 25x3
- **anbar_markazi** (5, 1): پیتزا 191x13 · سوخاری 269x9 · فرنگی 269x12 · کانتر 269x31
- **farangi** (2, 0): موجودی اول شب 145x23 · موجودی آخر شب 161x18
- **kanter** (3, 1): موجودی اول شب 128x41 · موجودی آخر شب 132x20
- **pitza** (2, 0): موجودی اول شب 157x21 · موجودی آخر شب 160x15
- **sokhari** (2, 0): موجودی اول شب 136x9 · موجودی آخر شب 127x11
- **tedade_fooroosh_markazi** (12, 1): americanPizza 187x13 · singlePizza 48x7 · italianPizza 192x14 · farangi 192x3 · pasta 192x5 · sandwich 192x14 · fried 192x8 · salad 192x4 · starter 192x22 · steak 192x2 · personel 193x2
- **gozaresh_markazi** (43, 0): Form Responses 1 1x2 · Refresher 1x1h · تاریخ 8x6 · پیتزا 18x15 · فرنگی 14x13 · سوخاری 11x10 · کانتر 10x10 · SheetsFileIDs 8x2h · Table_Farangi_First 145x19*h · Table_SalesData_AmericanPizza 187x13*h · Table_SalesData_SinglePizza 48x7*h · Table_SalesData_ItalianPizza 192x14*h · Table_SalesData_Pasta 192x5*h · Table_SalesData_Starter 192x20*h · Table_SalesData_Personel 193x2*h · Table_SalesData_Salad 192x4*h · Table_SalesData_Fried 192x8*h · Table_SalesData_Sandwich 192x14*h · Table_Ingredients_ItalianPizza 14x23*h · Table_Ingredients_Lasagna 3x8*h · Table_Ingredients_AmericanPizza 13x19*h · Table_Ingredients_SinglePizza 7x19*h · Table_Ingredients_Farangi 3x4*h · Table_SalesData_Farangi 192x3*h · Table_SalesData_Steak 192x2*h · Table_Ingredients_Pasta 3x6*h · Table_Ingredients_Sandwich 14x14*h · Table_Ingredients_Fried 8x5*h · Table_Ingredients_Salad 4x9*h · Table_Ingredients_Starter 8x5*h · Table_Ingredients_Steak 2x2*h · Table_Ingredients_Personel 2x4*h · Table_Fried_First 136x9*h · Table_Fried_Request 269x9*h · Table_KitchenCounter_First 128x19*h · Table_KitchenCounter_Request 269x19*h · Table_KitchenCounter_Last 132x19*h · Table_Fried_Last 127x11*h · Table_Pizza_First 157x19*h · Table_Pizza_Request 191x13*h · Table_Pizza_Last 160x15*h · Table_Farangi_Request 269x12*h · Table_Farangi_Last 161x18*h
- **mavade_avalie** (12, 0): پیتزا امریکایی 13x19 · پیتزا ایتالیایی 14x23 · پیتزا سینگل 7x19 · لازانیا 3x8 · فرنگی 3x5 · پاستا 3x6 · ساندویچ 14x14 · سوخاری 8x11 · سالاد 4x9 · استارتر 8x16 · استیک 2x3 · پرسنلی 2x4
- **anbar_shobe_2** (6, 2): پیتزا 259x13 · سوخاری 269x9 · فرنگی 271x13 · کانتر 268x17
- **fried** (2, 0): موجودی اول شب 175x9 · موجودی آخر شب 173x9
- **amar_farangi** (53, **51 empty**): موجودی اول شب 182x12 · موجودی آخر شب 181x12
- **amar_kanter** (2, 0): موجودی اول شب 105x17 · موجودی آخر شب 9x17
- **amar_pitza** (4, 2): موجودی اول شب 189x13 · موجودی آخر شب 188x13
- **tedade_fooroosh_naharkhoran** (11, 0): americanPizza 185x13 · singlePizza 49x7 · italianPizza 195x14 · farangi 195x3 · pasta 195x5 · sandwich 195x14 · fried 195x8 · salad 195x4 · starter 195x22 · steak 195x2 · personel 195x2
- **gozaresh_naharkhoran** (42, 0): تاریخ 9x6 · پیتزا 18x15 · Refresher 1x1h · فرنگی 14x13 · سوخاری 11x10 · کانتر 10x10 · SheetsFileIDs 8x2h · Table_Farangi_First 182x12*h · Table_SalesData_AmericanPizza 185x13*h · Table_SalesData_SinglePizza 49x7*h · Table_SalesData_ItalianPizza 195x14*h · Table_SalesData_Pasta 195x5*h · Table_SalesData_Starter 195x20*h · Table_SalesData_Personel 195x2*h · Table_SalesData_Salad 195x4*h · Table_SalesData_Fried 195x8*h · Table_SalesData_Sandwich 195x14*h · Table_Ingredients_ItalianPizza 14x23*h · Table_Ingredients_Lasagna 3x4*h · Table_Ingredients_AmericanPizza 13x19*h · Table_Ingredients_SinglePizza 7x19*h · Table_Ingredients_Farangi 3x4*h · Table_SalesData_Farangi 195x3*h · Table_SalesData_Steak 195x2*h · Table_Ingredients_Pasta 3x3*h · Table_Ingredients_Sandwich 14x14*h · Table_Ingredients_Fried 8x5*h · Table_Ingredients_Salad 4x4*h · Table_Ingredients_Starter 8x5*h · Table_Ingredients_Steak 2x2*h · Table_Ingredients_Personel 2x4*h · Table_Fried_First 175x9*h · Table_Fried_Request 269x9*h · Table_KitchenCounter_First 105x17*h · Table_KitchenCounter_Request 268x17*h · Table_KitchenCounter_Last 9x17*h · Table_Fried_Last 173x9*h · Table_Pizza_First 189x13*h · Table_Pizza_Request 259x13*h · Table_Pizza_Last 188x13*h · Table_Farangi_Request 271x13*h · Table_Farangi_Last 181x12*h
- **control_gozareshat** (33, 0): تاریخ 8x8 · مواد حساس 34x11 · مواد عادی 79x11 · سفارشات ثبت شده 2x33h · Table_Ingredients_Pasta 3x6*h · Table_Ingredients_Steak 2x3*h · Table_Ingredients_Farangi 3x5*h · Table_Ingredients_Starter 8x16*h · Copy of مواد حساس 1012x14h · Refresher 1x1h · Table_Ingredients_Sandwich 14x14*h · Table_Ingredients_Fried 8x11*h · Table_Pizza_Last 160x15*h · Table_Farangi_Last 161x18*h · Table_KitchenCounter_Last 132x20*h · Table_Fried_Last 127x11*h · SheetsFileIDs 8x2h · Table_SalesData_AmericanPizza 187x13*h · Table_SalesData_SinglePizza 48x7*h · Table_SalesData_ItalianPizza 192x14*h · Table_SalesData_Pasta 192x5*h · Table_Ingredients_Lasagna 3x8*h · Table_SalesData_Starter 192x22*h · Table_SalesData_Personel 193x2*h · Table_SalesData_Salad 192x4*h · Table_SalesData_Fried 192x8*h · Table_SalesData_Sandwich 192x12*h · Table_SalesData_Farangi 192x3*h · Table_SalesData_Steak 192x2*h · Table_Ingredients_ItalianPizza 14x23*h · Table_Ingredients_SinglePizza 7x19*h · Table_Ingredients_AmericanPizza 13x18*h · Table_Ingredients_Salad 4x9*h
- **salon_chalebagh** (5, 0): ضایعات 99x4 · تعداد فیش هرشب 575x4 · SheetsFileIds 2x2h · OFF اجرایی 107x4 · نیازمندیها و مشکلات 98x3
- **salon_naharkhoran** (5, 0): تعداد فیش هرشب 566x4 · ضایعات 7x4 · OFF اجرایی 554x4 · SheetsFileIds 2x2h · نیازمندیها و مشکلات 482x3
- **sandogh_chalebagh** (5, 0): ضایعات 363x4 · تعداد فیش هرشب بجز سالن 585x4 · OFF اجرایی 372x4 · SheetsFileIds 2x2h · نیازمندیها و مشکلات 359x3
- **sandogh_naharkhoran** (5, 0): تعداد فیش هرشب بجز سالن 415x5 · OFF اجرایی 276x6 · ضایعات 374x6 · نیازمندیها و مشکلات 101x3 · SheetsFileIds 2x2h

### Scripts

| script | bytes | ~tokens | workbook |
|---|---|---|---|
| Gozareshat/Gozareshat.gs | 23030 | 6580 | gozareshat |
| MandeShab__ChaleBagh__Amar__Tedade Fooroosh markazi/…markazi.gs | 13320 | 3806 | tedade_fooroosh_markazi |
| MandeShab__Naharkhoran__Amar__Tedade Fooroosh naharkhoran/….gs | 13320 | 3806 | tedade_fooroosh_naharkhoran |
| MandeShab__Naharkhoran__Gozaresh naharkhoran/….gs | 4663 | 1332 | gozaresh_naharkhoran |
| MandeShab__ChaleBagh__Gozaresh markazi/….gs | 4661 | 1332 | gozaresh_markazi |
| Sandogh__Sandogh - Chalebagh/….gs | 2077 | 593 | sandogh_chalebagh |
| Sandogh__Sandogh - NaharKhoran/….gs | 2077 | 593 | sandogh_naharkhoran |
| Salon__Salon - Chalebagh/….gs | 2076 | 593 | salon_chalebagh |
| Salon__Salon - Naharkhoran/….gs | 2075 | 593 | salon_naharkhoran |
| MandeShab__Naharkhoran__Amar__Kanter/Kanter.gs | 1751 | 500 | amar_kanter |
| **total** | **69050** | **19729** | |

The two `Tedade Fooroosh` scripts are byte-identical (13,320 each) — one script read twice.

---

## 2. Per-department inventory

| dept | transcripts | transcript bytes | attachments | attach bytes | .text bytes | processes | process bytes | workbooks | dump bytes |
|---|---|---|---|---|---|---|---|---|---|
| accounting | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 15892 |
| cashier | 5 | 349180 | 2 | 39439 | 16296 | 39 | 955046 | 4 | 386581 |
| cooking | 8 | 615432 | 2 | 36588 | 7658 | 36 | 1806107 | 13 | 385090 |
| dining | 3 | 242847 | 3 | 53268 | 9937 | 15 | 268980 | 2 | 650552 |
| logistics | 2 | 165737 | 0 | 0 | 0 | 26 | 686797 | 2 | 8500 |
| management | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 90256 |
| preparation | 6 | 258208 | 0 | 0 | 0 | 0 | 0 | 1 | 14352 |
| procurement | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 158295 |
| warehouse | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 40975 |

Only cashier, cooking and dining have `.text` caches; the other departments have no attachments at all.

### Transcripts

| dept | file | bytes | lines | ~tokens | in the cooking run? |
|---|---|---|---|---|---|
| cashier | cashier-1405-04-21.txt | 79584 | | 22738 | |
| cashier | cashier-1405-04-28.txt | 76967 | | 21991 | |
| cashier | cashier-1405-04-29.txt | 96429 | | 27551 | |
| cashier | cashier-1405-05-04-02.txt | 81509 | | 23288 | |
| cashier | cashier-1405-05-04.txt | 14691 | | 4197 | |
| cooking | cooking-1405-05-16.txt | 138457 | 359 | 39559 | **NO** |
| cooking | cooking-1405-05-19.txt | 67155 | 244 | 19187 | **NO** |
| cooking | cooking-1405-05-21.txt | 125981 | 1329 | 35995 | **NO** |
| cooking | cooking-1405-05-22.txt | 87426 | 824 | 24979 | **NO** |
| cooking | cooking-1405-05-23.txt | 101406 | 1177 | 28973 | **NO** |
| cooking | cooking-1405-05-26-02.txt | 10853 | 65 | 3101 | yes (2 entries) |
| cooking | cooking-1405-05-26.txt | 67901 | 451 | 19400 | yes (47 entries) |
| cooking | cooking-1405-06-01.txt | 16253 | 113 | 4644 | yes (6 entries) |
| dining | dining-1405-04-11.txt | 79673 | | 22764 | |
| dining | dining-1405-04-14.txt | 59312 | | 16946 | |
| dining | dining-1405-04-15.txt | 103862 | | 29675 | |
| logistics | logistics-1405-05-05.txt | 83480 | | 23851 | |
| logistics | logistics-1405-05-07.txt | 82257 | | 23502 | |
| preparation | preparation-1405-05-28-02.txt | 21687 | | 6196 | |
| preparation | preparation-1405-05-28-03.txt | 10234 | | 2924 | |
| preparation | preparation-1405-05-28.txt | 49340 | | 14097 | |
| preparation | preparation-1405-06-01.txt | 92158 | | 26331 | |
| preparation | preparation-1405-06-02-02.txt | 49096 | | 14027 | |
| preparation | preparation-1405-06-02.txt | 35693 | | 10198 | |

**520,425 of 615,432 cooking transcript bytes (85%) were out of scope.**

### Attachments and their `.text` caches

| dept | docx | docx bytes | cached .txt | .txt bytes | ~tokens |
|---|---|---|---|---|---|
| cashier | شرح_شغل_سرپرست_صندوق_.docx | 19434 | شرح_شغل_سرپرست_صندوق_.txt | 7686 | 2196 |
| cashier | شرح_شغل_کارکنان_بخش_صندوق_.docx | 20005 | شرح_شغل_کارکنان_بخش_صندوق_.txt | 4305 | 1230 |
| cashier | — | — | شرح_شغل_کارکنان_بخش_صندوق_-2.txt (orphan dup) | 4305 | 1230 |
| cooking | شرح_شغل_سرپرست_آشپزخانه___2_.docx | 19208 | شرح_شغل_سرپرست_آشپزخانه___2_.txt | 4992 | 1426 |
| cooking | شرح_شغل_کارکنان_آشپزخانه.docx | 17380 | شرح_شغل_کارکنان_آشپزخانه.txt | 2666 | 762 |
| dining | شرح شغل جونیور.docx | 17241 | شرح شغل جونیور.txt | 2331 | 666 |
| dining | شرح شغل سرپرست سالن.docx | 18816 | شرح شغل سرپرست سالن.txt | 5286 | 1510 |
| dining | شرح شغل مهماندار.docx | 17211 | شرح شغل مهماندار.txt | 2320 | 663 |

(cashier has a `-2` duplicate cache with no matching .docx and no .sha256 sibling.)

---

## 3. Token budget: raw vs pre-digested skeleton

**Skeleton** = per workbook: header line; one line per non-empty tab (`name  rows×cols  header-row`); one line per **distinct formula shape** with its line/tab/cell counts; `names.tsv`, `rows.tsv`, `comments.tsv` verbatim; `cf.tsv` and `validations.tsv` collapsed to distinct rules with a multiplicity count. Sample data rows (`head[1..4]` in sheets.json) dropped.

| short | raw tok | skeleton tok | skeleton−mirrors tok | ratio | tabs kept |
|---|---|---|---|---|---|
| amadesazi | 4101 | 859 | 827 | 4.8x | 7/7 |
| anbar | 4969 | 3105 | 3076 | 1.6x | 4/4 |
| ashpazkhne_chalebagh | 1750 | 331 | 302 | 5.3x | 5/5 |
| ashpazkhne_naharkhoran | 1875 | 340 | 306 | 5.5x | 5/5 |
| gozareshat | 25787 | 6128 | 4405 | 4.2x | 12/29 |
| hesabdari | 4541 | 578 | 546 | 7.9x | 6/6 |
| logestic_chalebagh | 1055 | 246 | 217 | 4.3x | 3/3 |
| logestic_naharkhoran | 1374 | 247 | 217 | 5.6x | 3/3 |
| anbar_markazi | 3547 | 799 | 766 | 4.4x | 4/5 |
| farangi | 2030 | 467 | 442 | 4.3x | 2/2 |
| kanter | 2857 | 671 | 641 | 4.3x | 2/3 |
| pitza | 1866 | 405 | 380 | 4.6x | 2/2 |
| sokhari | 1448 | 363 | 338 | 4.0x | 2/2 |
| tedade_fooroosh_markazi | 5149 | 820 | 783 | 6.3x | 11/12 |
| gozaresh_markazi | 39319 | 18340 | 10151 | 2.1x | 8/43 |
| mavade_avalie | 10636 | 4368 | 4337 | 2.4x | 12/12 |
| anbar_shobe_2 | 3191 | 644 | 606 | 5.0x | 4/6 |
| fried | 1400 | 359 | 334 | 3.9x | 2/2 |
| amar_farangi | 5136 | 662 | 358 | 7.8x | 2/53 |
| amar_kanter | 2011 | 500 | 473 | 4.0x | 2/2 |
| amar_pitza | 1790 | 374 | 337 | 4.8x | 2/4 |
| tedade_fooroosh_naharkhoran | 5070 | 815 | 783 | 6.2x | 11/11 |
| gozaresh_naharkhoran | 37906 | 17465 | 9678 | 2.2x | 7/42 |
| control_gozareshat | 45227 | 23689 | 16285 | 1.9x | 7/33 |
| salon_chalebagh | 93202 | 549 | 516 | **169.8x** | 5/5 |
| salon_naharkhoran | 92670 | 686 | 648 | **135.1x** | 5/5 |
| sandogh_chalebagh | 98344 | 561 | 527 | **175.3x** | 5/5 |
| sandogh_naharkhoran | 1888 | 504 | 471 | 3.7x | 5/5 |
| **all 28** | **500141** | **84875** | **58751** | **5.9x / 8.5x** | 158/316 |

### Whole-estate totals

| source | bytes | ~tokens raw | ~tokens digested |
|---|---|---|---|
| sheet dumps (28 dirs) | 1,750,493 | 500,141 | 84,875 (58,751 without mirrors/empties) |
| .gs scripts (10) | 69,050 | 19,729 | 19,729 (not compressible) |
| transcripts (24) | 1,631,404 | 466,115 | 466,115 (not compressible) |
| attachment text (8) | 33,891 | 9,683 | 9,683 |
| **TOTAL** | **3,484,838** | **995,668** | **580,402** (**554,278** dropping mirrors) |

**Cooking only**: raw 291,216 tok → digested 44,645 (dumps) + 3,164 (scripts) + 175,838 (transcripts) + 2,188 (attachments) = **225,835 tok**, or **209,271 tok** with mirrors dropped (dumps fall to 28,078).

### Fixed overhead per agent turn

| file | bytes | ~tokens |
|---|---|---|
| `data-repo/.claude/skills/quantify/SKILL.md` | 39,795 | 11,370 |
| `data-repo/.claude/agents/quantify.md` | 18,370 | 5,249 |
| `code-repo/schemas/facts-delta.schema.json` | 6,617 | 1,891 |
| **total before any data** | **64,782** | **18,509** |

Plus, if the run were to load the existing store for dedup: `facts/*.json` = 1,287,512 B ≈ **367,861 tok** for 486 entries.

### Output side

| kind | n | mean bytes | median | max | ~mean out tok |
|---|---|---|---|---|---|
| item | 139 | 1090 | 1012 | 2457 | 311 |
| record | 156 | 2700 | 1984 | 12059 | 771 |
| rule | 156 | 1622 | 1383 | 4749 | 464 |
| note | 22 | 1579 | 1450 | 2425 | 451 |
| measurement | 13 | 1448 | 1235 | 2751 | 414 |
| **all** | **486** | **1809** | | | **517** |

**64,000 / 517 ≈ 124 entries is the hard ceiling per agent turn.** Observed parts:

| part | bytes | entries | kinds | ~out tok |
|---|---|---|---|---|
| B1 | 142,501 | 67 | 52 item, 13 record, 1 rule, 1 note | 40,715 |
| B2 | 76,655 | 18 | 13 record, 4 rule, 1 note | 21,901 |
| B3 | 193,160 | 100 | 87 item, 12 record, 1 rule | **55,189** |
| B4 | 164,816 | 81 | 8 record, 73 rule | 47,090 |
| B5 | 91,840 | 50 | 50 record | 26,240 |
| B6 | 182,283 | 80 | 7 record, 73 rule | 52,081 |
| B6-rules-fixed | 97,166 | 64 | 64 rule | 27,762 |
| B7 | 102,847 | 50 | 50 record | 29,385 |
| B8 | 59,979 | 39 | 4 rule, 13 measurement, 20 note, 2 record | 17,137 |
| concatenated delta | 1,013,794 | 485 | | 289,655 |

---

## 4. Output-quality metrics (all 486 stored entries)

| metric | count | % |
|---|---|---|
| statements using sheet vocabulary (تب/شیت/فایل/ستون/سلول/xlsx/Table_/Sheet) | 463 | 95% |
| statements naming an .xlsx file | 291 | 60% |
| statements citing an A1 cell reference | 196 | 40% |
| statements naming a `Table_*` mirror tab | 133 | 27% |
| rules scoped to a single branch | 154/156 | 99% |
| rule keys prefixed `gozaresh_markazi__`/`gozaresh_naharkhoran__` | 146/156 | 94% |
| rule titles naming a specific menu line | 108/156 | 69% |
| record titles naming a specific menu line | 132/156 | 85% |
| records scoped to a single branch | 143/156 | 92% |
| items scoped to both branches | 139/139 | 100% (the one kind done right) |

Source-type histogram: sheet 472, voice 64, validation 53, cf 39, process 35, script 23, chat 3, comment 2.

Entries touching each source (deduplicated per entry): gozaresh_markazi 122, gozaresh_naharkhoran 120, mavade_avalie 102, cooking-1405-05-26.txt 47, cooking-030.json 29, kanter 20, farangi 17, pitza 15, Gozaresh markazi.gs 11, Gozaresh naharkhoran.gs 11, sokhari 10, ashpazkhne_naharkhoran 7, cooking-1405-06-01.txt 6, ashpazkhne_chalebagh 5, fried 4, cooking-024.json 3, amar_pitza 3, cooking-1405-05-26-02.txt 2, cooking-032.json 2, amar_farangi 2, amar_kanter 2, Kanter.gs 1.

### The "one rule per line" families

11 key families, each with 4 members (one per line: pitza / farangi / sokhari / kanter), duplicated across both branch workbooks = **88 rules where 11 would do**:

`__ruz` · `__mah` · `__sal` · `__mojudi_avval_shab` · `__daryaft_az_anbar` · `__mojudi_akhar_shab` · `__masraf_elami` · `__masraf_vaqei` · `__enheraf` · `__flag_enheraf_mosbat` · `__flag_enheraf_manfi`

Titles from the largest family: «روز تب پیتزا از تب تاریخ» / «روز تب فرنگی از تب تاریخ» / «روز تب سوخاری از تب تاریخ» / «روز تب کانتر از تب تاریخ».

### Formula-shape overlap (evidence the branches are one logic)

| A | B | \|A\| | \|B\| | shared | Jaccard |
|---|---|---|---|---|---|
| gozaresh_markazi | gozaresh_naharkhoran | 86 | 79 | **78** | **0.90** |
| gozaresh_markazi | control_gozareshat | 86 | 88 | 1 | 0.01 |
| gozaresh_markazi | gozareshat | 86 | 61 | 2 | 0.01 |
| gozaresh_naharkhoran | control_gozareshat | 79 | 88 | 1 | 0.01 |
| salon_chalebagh | salon_naharkhoran | 2 | 4 | 1 | 0.20 |
| sandogh_chalebagh | sandogh_naharkhoran | 2 | 1 | 1 | 0.50 |

Union of the three report workbooks: 174 shapes vs 253 summed. All 8 line-inventory workbooks have the identical tab pair «موجودی اول شب» / «موجودی آخر شب».

---

## 5. Proposed COOKING partition (≤40K input tokens per unit)

Budget: 40,000 total − 18,509 fixed prompt = **21,491 tokens of data per unit**. Workbook skeletons with `Table_*` and import-only tabs dropped; transcripts over budget split by line range.

| unit | data tok | total in tok | sources | est. entries out |
|---|---|---|---|---|
| CO1 | 21,206 | 39,715 | tr:cooking-1405-05-16.txt[1-180] (19,780); att:شرح_شغل_سرپرست_آشپزخانه (1,426) | 10-20 |
| CO2 | 21,394 | 39,903 | tr:cooking-1405-05-16.txt[181-359] (19,780); wb:amar_kanter (973); wb:kanter (641) | 10-20 |
| CO3 | 21,342 | 39,851 | tr:cooking-1405-05-26.txt (19,400); att:شرح_شغل_کارکنان_آشپزخانه (762); wb:farangi (442); wb:pitza (380); wb:amar_farangi (358) | 25-45 |
| CO4 | 20,804 | 39,313 | tr:cooking-1405-05-19.txt (19,187); wb:sokhari (338); wb:amar_pitza (337); wb:fried (334); wb:ashpazkhne_naharkhoran (306); wb:ashpazkhne_chalebagh (302) | 15-30 |
| CO5 | 21,099 | 39,608 | tr:cooking-1405-05-21.txt[1-665] (17,998); tr:cooking-1405-05-26-02.txt (3,101) | 10-20 |
| CO6 | 17,998 | 36,507 | tr:cooking-1405-05-21.txt[666-1329] (17,998) | 10-20 |
| CO7 | 19,131 | 37,640 | tr:cooking-1405-05-23.txt[1-589] (14,487); tr:cooking-1405-06-01.txt (4,644) | 10-20 |
| CO8 | 18,824 | 37,333 | tr:cooking-1405-05-23.txt[590-1177] (14,487); wb:mavade_avalie (4,337) | 20-30 |
| CO9 | 12,490 | 30,999 | tr:cooking-1405-05-22.txt[1-412] (12,490) | 8-15 |
| CO10 | 12,490 | 30,999 | tr:cooking-1405-05-22.txt[413-824] (12,490) | 8-15 |
| CO11 | 11,483 | 29,992 | wb:gozaresh_markazi (11,483, 8 non-mirror tabs, 86 shapes) | ~99 structural → ~15 after branch/line generalisation |
| CO12 | 11,010 | 29,519 | wb:gozaresh_naharkhoran (11,010, 7 non-mirror tabs, 79 shapes) | should be **merged into CO11**: 78 of its 79 shapes are already there |

**12 units, 209,271 data tokens.** Every unit is under the 40K cap and under the 124-entry output ceiling.

Better: CO11+CO12 should be **one** unit reading both branch workbooks together (11,483 + 11,010 = 22,493 data tok — 1,000 over budget, fits the moment the prompt is trimmed). That is the single change that removes the 88-rules-for-11 duplication.

**With a trimmed 6K prompt (34,000 data tok/unit), cooking collapses to 8 units:**

| unit | data tok | total | sources |
|---|---|---|---|
| CO1 | 33,997 | 39,997 | tr:05-23 (28,973); tr:06-01 (4,644); wb:pitza (380) |
| CO2 | 33,843 | 39,843 | tr:05-22 (24,979); wb:mavade_avalie (4,337); tr:05-26-02 (3,101); att:سرپرست (1,426) |
| CO3 | 33,997 | 39,997 | tr:05-16[1-180] (19,780); wb:gozaresh_markazi (11,483); wb:amar_kanter (973); att:کارکنان (762); wb:kanter (641); wb:amar_farangi (358) |
| CO4 | 32,849 | 38,849 | tr:05-16[181-359] (19,780); wb:gozaresh_naharkhoran (11,010); wb:farangi (442); wb:sokhari (338); wb:amar_pitza (337); wb:fried (334); wb:ashpazkhne_naharkhoran (306); wb:ashpazkhne_chalebagh (302) |
| CO5 | 19,400 | 25,400 | tr:05-26 (19,400) |
| CO6 | 19,187 | 25,187 | tr:05-19 (19,187) |
| CO7 | 17,998 | 23,998 | tr:05-21[1-665] |
| CO8 | 17,998 | 23,998 | tr:05-21[666-1329] |

### Structural fact-yield estimate (workbook units)

Estimated entries = kept tabs + distinct formula shapes on kept tabs + distinct validation rules + distinct cf rules.

| workbook | kept tabs | shapes | distinct validations | distinct cf | est. entries |
|---|---|---|---|---|---|
| gozaresh_markazi | 8 | 86 | 3 | 2 | 99 |
| control_gozareshat | 7 | 88 | 3 | 0 | 98 |
| gozaresh_naharkhoran | 7 | 79 | 3 | 2 | 91 |
| gozareshat | 12 | 61 | 3 | 10 | 86 |
| mavade_avalie | 12 | 0 | 2 | 1 | 15 |
| hesabdari | 6 | 1 | 8 | 0 | 15 |
| amadesazi | 7 | 1 | 5 | 0 | 13 |
| tedade_fooroosh_markazi | 11 | 0 | 2 | 0 | 13 |
| tedade_fooroosh_naharkhoran | 11 | 0 | 2 | 0 | 13 |
| salon_chalebagh / salon_naharkhoran | 5 / 5 | 2 / 4 | 4 / 3 | 2 / 2 | 13 / 14 |
| sandogh_chalebagh / sandogh_naharkhoran | 5 / 5 | 2 / 1 | 4 / 3 | 2 / 2 | 13 / 11 |
| ashpazkhne_naharkhoran / _chalebagh | 5 / 5 | 1 / 0 | 6 / 6 | 0 / 0 | 12 / 11 |
| anbar | 4 | 0 | 5 | 0 | 9 |
| anbar_markazi / anbar_shobe_2 | 4 / 4 | 0 / 0 | 4 / 4 | 0 / 0 | 8 / 8 |
| kanter / fried | 2 / 2 | 0 / 0 | 5 / 4 | 0 / 1 | 7 / 7 |
| logestic_chalebagh / _naharkhoran | 3 / 3 | 0 / 0 | 4 / 4 | 0 / 0 | 7 / 7 |
| farangi, pitza, sokhari, amar_farangi, amar_kanter, amar_pitza | 2 each | 0 | 4 | 0 | 6 each |
| **estate total** | | | | | **606** |

The 4 report workbooks account for 374 of those 606, and 78 of gozaresh_naharkhoran's 79 shapes are shared with gozaresh_markazi — so the honest estate-wide target is roughly **380-450 entries**, not the 486 already sitting in the store from cooking alone.

---

## 6. Partition rule, generalised

Per department: build three lists, pack them first-fit into units of `CAP − fixed_prompt` data tokens.

1. **Per workbook tab-group.** One unit per workbook whose digest fits. Digest = non-empty, non-mirror, non-import-only tabs (name, rows×cols, header row) + distinct formula shapes + distinct cf/validation rules + names/rows/comments. Never send raw `formulas.tsv`. A workbook whose digest exceeds the budget splits along its natural tab groups — for `gozaresh_*` that is the four line tabs (پیتزا / فرنگی / سوخاری / کانتر, each 10-18 rows × 10-15 cols) plus the تاریخ header tab; for `gozareshat` the 12 visible tabs. **Branch pairs go in the same unit** (`gozaresh_markazi`+`gozaresh_naharkhoran`, `salon_*`, `sandogh_*`, `logestic_*`, `tedade_fooroosh_*`, `anbar_markazi`+`anbar_shobe_2`, and the 8 line-inventory workbooks) so one rule with `scope.branches: [both]` replaces two.
2. **Per transcript.** One unit per file; split by line range when a file exceeds the budget (cooking-1405-05-16 → 2, 05-21 → 2, 05-23 → 2, 05-22 → 2 at a 21K budget; only 05-16 and 05-21 need splitting at a 34K budget). Split points must be line-aligned because `source[].lines` already cites line numbers.
3. **Per attachment.** Each `.text/*.txt` is 663-2,196 tokens — always a filler, never a unit of its own.

Resulting unit counts (21,491 data tok/unit, mirrors dropped):

| dept | units | data tok | note |
|---|---|---|---|
| cooking | 12 | 209,271 | 11 with a branch-pair merge |
| cashier | 8 | 115,921 | |
| dining | 5 | 74,646 | |
| preparation | 5 | 74,633 | |
| logistics | 4 | 47,847 | |
| procurement | 1 | 16,285 | overflows to 23,689 if mirrors kept |
| management | 1 | 10,985 | overflows to 12,708 if mirrors kept |
| warehouse | 1 | 4,548 | |
| accounting | 1 | 578 | |
| **total** | **38** | **554,714** | vs one 291K-token pass per department today |

Output guard: cap each unit at **60 entries** (≈31K output tokens, half the 64K ceiling) and have the unit return a `truncated: true` marker plus the un-covered tab/line range rather than crashing.

---

## 7. Shared workbooks and who should own them

The manifest declares **zero** workbooks under more than one department. Real sharing runs through `IMPORT_FROM_SHEET` (resolved via each workbook's `SheetsFileIds` tab, recorded in `rows.tsv`) and through mirror tabs.

| consumer workbook (dept) | imports from | owning dept of the source |
|---|---|---|
| gozareshat (management) | amadesazi, anbar, ashpazkhne_chalebagh, ashpazkhne_naharkhoran, hesabdari, logestic_chalebagh, logestic_naharkhoran, salon_chalebagh, salon_naharkhoran, sandogh_chalebagh, sandogh_naharkhoran | preparation, warehouse, cooking×2, accounting, logistics×2, dining×2, cashier×2 |
| gozaresh_markazi (cooking) | anbar_markazi, farangi, kanter, mavade_avalie, pitza, sokhari, tedade_fooroosh_markazi | warehouse, cooking×5, cashier |
| gozaresh_naharkhoran (cooking) | amar_farangi, amar_kanter, amar_pitza, anbar_shobe_2, fried, mavade_avalie, tedade_fooroosh_naharkhoran | cooking×5, warehouse, cashier |
| control_gozareshat (procurement) | anbar_markazi, farangi, kanter, mavade_avalie, pitza, sokhari, tedade_fooroosh_markazi | warehouse, cooking×5, cashier |
| salon_chalebagh, salon_naharkhoran (dining) | hesabdari | accounting |
| sandogh_chalebagh, sandogh_naharkhoran (cashier) | hesabdari | accounting |

### Ownership calls

| workbook | manifest dept | mirrored/imported into | owner of the facts | rationale |
|---|---|---|---|---|
| `mavade_avalie` | cooking | gozaresh_markazi, gozaresh_naharkhoran (cooking), control_gozareshat (procurement) — as `Table_Ingredients_*`, dimensions match exactly (پیتزا امریکایی 13x19 = Table_Ingredients_AmericanPizza 13x19) | **cooking** | it *is* the recipe/BOM master; 102 of 486 entries already touch it. Procurement must reference it, never re-derive it. |
| 8 line-inventory books (`pitza`, `farangi`, `sokhari`, `kanter`, `amar_pitza`, `amar_farangi`, `amar_kanter`, `fried`) | cooking | `Table_<Line>_First/Last/Request` in both gozaresh_* and control_gozareshat | **cooking**, as ONE unit for all 8 | identical two-tab shape across all eight; one shared rule set, `scope.branches: [chalebagh, naharkhoran]` |
| `tedade_fooroosh_markazi`, `tedade_fooroosh_naharkhoran` | cashier | `Table_SalesData_*` in gozaresh_* (cooking) and control_gozareshat (procurement) | **cashier** | they are the sales-count source; their two .gs scripts are byte-identical (13,320 B) so one unit covers both branches |
| `anbar_markazi`, `anbar_shobe_2` | warehouse | gozaresh_markazi / gozaresh_naharkhoran / control_gozareshat | **warehouse** | the warehouse-issue side of the deviation formula |
| `hesabdari` | accounting | salon_* (dining), sandogh_* (cashier), gozareshat (management) — via `اهداف فروش` | **accounting** | it holds the sales targets every branch book divides against |
| `gozareshat` | management | — (it is the top consumer) | **management, and it must run last** | 61 distinct formula shapes, 17 import-only mirror tabs pulling from 7 departments; every rule it yields is about cross-department reconciliation |
| `control_gozareshat` | procurement | — | **procurement** | 88 distinct shapes with Jaccard 0.01 against gozaresh_* — genuinely different logic (sensitive vs ordinary materials, order thresholds), so it is *not* a duplicate; but its 26 `Table_*` tabs must be dropped and referenced, not re-recorded |

### Run order implied by the dependency graph

`cooking` (mavade_avalie + the 8 line books + gozaresh_*) and `cashier`, `warehouse`, `dining`, `preparation`, `logistics`, `accounting` can run **in parallel** — nothing they own depends on another department's facts. Then `procurement` (control_gozareshat references cooking's BOM, cashier's sales, warehouse's issues). Then `management` (gozareshat references all seven).

Only `mavade_avalie` (branches: both) and `hesabdari`, `amadesazi`, `anbar`, `gozareshat` are two-branch workbooks; every other workbook is single-branch and has a sibling. Any unit that reads one sibling must read the other, or the branch duplication comes back.