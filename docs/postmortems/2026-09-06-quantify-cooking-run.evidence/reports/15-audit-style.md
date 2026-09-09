# audit:style

## summary
The store's prose fails the purpose test almost everywhere, and the single root cause is that nothing — not the agent prompt, not the playbook, not the JSON schema, not `validate` — ever says what `statement` should contain. The schema declares it `{"type":"string"}`; the agent prompt mentions it only to say it must be Persian; `merge_facts/ladder.py` classes it a PROSE_LEAF that is "never compared, never disputed", so no gate ever looks at it. The agent therefore defaulted to describing the artefact it was reading: 468 of 486 statements (96%) name a tab, file, column, cell, row or range, and only 18 are free of spreadsheet plumbing; 257 (53%) literally open with «تب…»/«ستون…»/«سلول…», including 155 of 156 records and 100 of 156 rules; 196 carry a bare A1 cell reference. All 139 item statements are one of two fill-in-the-blank templates whose only content is which tab of which .xlsx the item's column sits in. 442 of 486 entries (91%) carry Latin tokens in Persian prose beyond the allowed csv/Excel/sheet — 1810 occurrences of 223 distinct tokens, dominated by workbook names, `Table_*` mirror-tab names and A1 refs, plus schema jargon (`account`, `rows`, `FEEL`, `bindings`, `original`) leaking straight into user-facing text. The spec's own §6 exemplar statement is «مصرف اعلامی = موجودی اول شب + دریافت از انبار − موجودی آخر شب» with no locator; the store contains that exact definition eight times (F-00343/355/367/376/416/428/440/449), each prefixed with its column group, because scope was never used to collapse line and branch. Colloquial register is a smaller, contained problem — 6 entries paste ≥40-char verbatim transcript speech into `statement` (F-00301, F-00306, F-00305, F-00464, F-00476, F-00479) where the quote belonged in `accounts[]` or `originals/`. Titles are equally artefact-shaped: 133 start with a Latin file/tab identifier, 54 exceed 60 chars, and 12 exact-duplicate title pairs (all date-plumbing rules) slipped through because `apply` partitions the byte-equality check by scope and `audit._lookalike_title` deliberately skips exact matches. Finally the 331 "unknown" leaves are largely fictitious: 133 of the 175 null record-field units sit on string, date, date-part or row-number fields where a unit is meaningless, and 38 more (22 rule inputs, 16 rule outputs) are directly recoverable from the source field the entry already cites — leaving roughly 42 honest unknowns. The eight sequential passes also each invented their own register: B5/B7 wrote 100% sheet-descriptive statements with 92% Latin-starting titles, B8 wrote 347-char meeting-minute narratives, and B4 wrote every `expr` as a bare expression while B6 wrote the same rules as assignments.

## problems
- [high/agent-prompt] `statement` has no specification anywhere in the pipeline — no content rule, no register rule, no length, no gate :: schemas/facts-delta.schema.json: `/$defs/envelope/properties/statement -> {"type": "string"}` and `/$defs/envelope/properties/title -> {"type": "string"}` — no description, minLength, maxLength or pattern. data-repo/.claude/agents/quantify.md mentions `statement` on only 4 lines (15, 102, 170, 239);
- [high/data-quality] 96% of statements describe where the number lives instead of what it means :: 468/486 statements contain تب|برگه|فایل|ستون|سلول|ردیف|محدوده; only 18 are free of it (9 note, 5 measurement, 3 rule, 1 record). 257 (53%) open with a locator word, incl. 155/156 records and 100/156 rules. 196 entries carry a bare A1 ref in title|statement (117 rule, 77 record, 2 note). Examples: F-
- [high/data-quality] All 139 item statements are one of two fill-in-the-blank templates whose only content is a sheet location :: 139/139 item statements name a tab or file. Two clusters of 26 each after masking numbers/Latin/line-names: «آیتم منوی خانواده W W با کد #N؛ ردیف N تب Q فایل X X مصرف مواد اولیه یک واحد آن را تعریف می‌کند. واحد Q استنباطی است.» (F-00073…F-00102) and the same with one line-word (F-00103…F-00140). The
- [high/data-quality] One concept written as N rules — the spec's own exemplar exists 8 times :: Spec §6:478 gives one rule: `"statement": "مصرف اعلامی = موجودی اول شب + دریافت از انبار − موجودی آخر شب"`, title «مصرف اعلامی پیتزا». Store has F-00343, F-00355, F-00367, F-00376 (chalebagh × 4 lines) and F-00416, F-00428, F-00440, F-00449 (naharkhoran × 4 lines) — identical `expr`, identical defin
- [high/data-quality] 91% of entries carry Latin identifiers inside Persian prose, including pipeline jargon :: 442/486 entries have a non-allowed Latin token in title|statement; 1810 occurrences, 223 distinct. Top: `Mavade`/`Avalie.xlsx` 125 each, `A1` 77, `IMPORT_FROM_SHEET` 74, `Gozaresh` 71, `markazi.xlsx` 66, `Table_*` 218 occurrences. By category: workbook/file names 673, A1 refs 326, mirror-tab names 2
- [medium/data-quality] Transcript speech pasted verbatim into `statement` instead of `accounts[]`/`originals/` :: Of 53 entries citing a transcript, 6 embed a ≥40-char verbatim colloquial run and 14 embed ≥25. F-00301 (93 chars verbatim of cooking-1405-05-26:152-155): «(«اگه دو بسته داشته باشن خب می‌زنن ۲۰۰ گرم بعد ۲۰ گرم ۳۰ گرم باشه دوباره همونو طبق گرم می‌نویسن»)». F-00306 (52 chars, :206): «(«دو تا فکر کنم ۳
- [medium/data-quality] Titles are artefact names, not concept names — 133 start with a Latin file/tab identifier :: 133/486 titles begin with a Latin token (99 record, 34 rule): F-00202 «Table_Pizza_First — آینه موجودی اول شب لاین پیتزا», F-00191 «americanPizza — تعداد فروش پیتزا امریکایی چاله‌باغ», F-00180 «Refresher — سلول ماشه بازمحاسبه», F-00186 «SheetsFileIDs — …», F-00179 «Form Responses 1 — …». 54 titles e
- [medium/validator] 12 exact-duplicate title pairs slipped past both the apply-time check and the audit :: 24 rules in 12 byte-equal title pairs, all date plumbing: «روز/ماه/سال تب پیتزا از تب تاریخ» F-00337/F-00410, F-00338/F-00411, F-00339/F-00412; same for فرنگی (F-00349-351/F-00422-424), سوخاری (F-00361-363/F-00434-436), کانتر (F-00370-372/F-00443-445). quantify.md:202 promises «merge refuses a new k
- [high/orchestration] The eight sequential passes each invented their own register and their own `expr` convention :: Per-pass style (entries attributed via (kind,key) against runs/facts/cooking/20260902-080737/parts/): B1 n=67 meanStmt 177 / 19% locator-opening / 1% Latin-start title; B4 n=81 163 / 72% / 25%; B5 n=50 251 / 100% / 92%; B7 n=50 327 / 100% / 92%; B8 n=39 347 / 8% / 0%. `expr` convention: B4 wrote 38/
- [high/data-quality] 331 'unknown' leaves are mostly not unknowns — 133 are units on fields where a unit is meaningless, 38 are recoverable from the cited source :: .index.json rollup: unknown=331, inferred=398, informal=3, disputed=0 (333 raw nulls under data{}). 308 of them are `unit`: 175 on record fields, 86 on rule inputs, 47 on rule outputs. Of the 175: 81 sit on `string`/`date`/`datetime`-typed fields (F-00141 `date` «تاریخ», F-00142 `reason` «علت ضایعات
- [medium/spec] Notes are meeting-minute narratives, and 0 of 22 follow the spec's own note-title rule :: Note statements mean 405 chars, max 683 (F-00470 «ضایعات دو مسیر دارد…»), min 135. Spec §7:1072 says for a note «`title` = the first 60 characters of `statement`» — 0/22 comply; every title is a hand-written label (F-00469 title «روش آمارگیری مانده آخر شب» vs statement opening «آمارگیری مانده از ساع
- [high/data-quality] 25% of the store is spreadsheet mechanics that no process author or ERP builder would read :: 123 entries (25%) in four style-visible classes: 24 date-plumbing rules (F-00337…F-00445, «سلول B4 تب پیتزا روز تاریخ گزارش را مستقیم از سلول C5 تب «تاریخ» می‌خواند»), 20 conditional-formatting rules (F-00312 «رنگی شدن سلول‌های پرشده…پس‌زمینه سبز FFB7E1CD», F-00379–F-00387, F-00452–F-00460), 70 mirr

## details
## 0. Corpus

| file | entries |
|---|---|
| items.json | 139 |
| records.json | 156 |
| rules.json | 156 |
| notes.json | 22 |
| measurements.json | 13 |
| **total** | **486** |

Envelope-key presence: `field_status` 185, `issues` 84, `aliases` 81, `processes` 34, `accounts` 10, `supersedes`/`superseded_by` 1 each. `.index.json` rollup: `unknown` 331, `inferred` 398, `informal` 3, `disputed` 0; status distribution confirmed 192 / inferred 161 / unknown 130 / informal 3; `stub: true` on 30.

Scripts used: `/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/{lib,t1b,t2b,t2c,t34,t4,t5,t6,t6b,t6c,t7,t8,t9}.py`, intermediates `t1_ts.json`, `t2_quotes.json`, `t2_verbatim.json`.

---

## 1. Cell / tab / column references

Entries with ≥1 match **in `title` or `statement`**:

| pattern | item | record | measurement | rule | note | total |
|---|---|---|---|---|---|---|
| A1 cell ref `[A-Z]{1,3}\d{1,4}(:…)?` | 0 | 77 | 0 | 117 | 2 | **196** |
| «ستون» | 52 | 77 | 4 | 85 | 6 | 224 |
| «سلول»/«خانه X9» | 1 | 28 | 0 | 75 | 2 | 106 |
| «تب»/«برگه»/«شیت» | 139 | 154 | 3 | 133 | 12 | **441** |
| «ردیف ‹عدد›» | 69 | 2 | 0 | 1 | 0 | 72 |
| `Table_*` | 0 | 101 | 0 | 32 | 0 | 133 |
| workbook / file name | 139 | 140 | 1 | 10 | 2 | **292** |
| spreadsheet fn / gs identifier | 0 | 72 | 0 | 14 | 0 | 86 |

**458 / 486 (94%)** entries match at least one pattern in title or statement.
**468 / 486 (96%)** statements contain تب|برگه|فایل|ستون|سلول|ردیف|محدوده. Only **18** are free of it (9 note, 5 measurement, 3 rule, 1 record).

### 20 examples

| id | kind | evidence |
|---|---|---|
| F-00337 | rule | «سلول **B4** تب پیتزا روز تاریخ گزارش را مستقیم از سلول **C5** تب «تاریخ» می‌خواند.» |
| F-00338 | rule | «سلول **C4** تب پیتزا ماه تاریخ گزارش را مستقیم از سلول **D5** تب «تاریخ» می‌خواند.» |
| F-00181 | record | «تب «تاریخ»: … سه سلول روز (**C5**)، ماه (**D5**) و سال (**E5**)…» |
| F-00355 | rule | «**ستون H تب فرنگی (گروه H6:H14)**: موجودی اول شب به‌علاوه دریافت از انبار منهای موجودی آخر شب.» |
| F-00343 | rule | «**ستون H تب پیتزا (گروه H6:H15)**: مصرف اعلامی هر قلم برابر است با…» |
| F-00347 | rule | «ستون L تب پیتزا: … (**L6** و **L8**) … (**L7** و **L10**) … (**L9** و گروه **L11:L15**) … شکل هر سلول در **bindings** آمده» |
| F-00332 | rule | «در سلول **L6** تب پیتزا برای پنیر پیتزا ##1 تلورانس ۵ گرم…» |
| F-00312 | rule | «…قاعده قالب‌بندی شرطی روی محدوده **H128:H226** (ستون «تعداد بال و کتف ##20») … پس‌زمینه سبز **FFB7E1CD**…» |
| F-00310 | rule | «شش سلول **A18** تا **A23** … **A18=DATE(2025,12,16)**، **A19=DATE(2025,12,17)**…» |
| F-00202 | record | «تب پنهان «**Table_Pizza_First**» در فایل **Gozaresh markazi.xlsx** تنها یک فرمول در **A1** دارد که با **IMPORT_FROM_SHEET** محدوده **A:S** …» |
| F-00205 | record | same template, `Table_Farangi_First` / `Farangi.xlsx` |
| F-00208 | record | same template + «عنوان مخدوش ستون ##19 هم از مبدأ…» |
| F-00180 | record | «تب پنهان «**Refresher**» فقط یک سلول **A1** دارد که یک مهر زمانی … نوشته می‌شود.» |
| F-00186 | record | title «**SheetsFileIDs** — شناسه فایل‌های منبع…» |
| F-00179 | record | title «**Form Responses 1** — گزارش مرکزی چاله‌باغ» |
| F-00158 | record | «…هیچ ردیف داده‌ای ندارد (**محدوده A1:D1**)…» |
| F-00177 | record | «…اعتبارسنجی عددی آن فقط روی سلول **B2** است.» |
| F-00178 | record | «…اعتبارسنجی عددی آن روی **B2:C2** است.» |
| F-00002 | item | «پنیر پیتزا، قلم انبارگردانی لاین پیتزا با کد ##1 که وزن مانده آن در **تب‌های «موجودی اول شب» و «موجودی آخر شب» فایل Pitza.xlsx** ثبت می‌شود.» |
| F-00072 | item | «…**ردیف ۲ تب «پیتزا امریکایی» فایل Mavade Avalie.xlsx** مصرف مواد اولیه یک واحد آن را تعریف می‌کند.» |

---

## 2. Colloquial register

53 entries cite a transcript. Longest verbatim overlap between statement and the cited transcript file:

| overlap | entries |
|---|---|
| ≥60 chars | 1 |
| ≥40 | 6 |
| ≥25 | 14 |
| ≥18 | 24 |

### Side-by-side (statement vs the transcript line it came from)

| id | transcript line | statement |
|---|---|---|
| F-00301 | `cooking-1405-05-26:152-155` «…مثلاً **اگه دو بسته داشته باشن خب می‌زنن ۲۰۰ گرم بعد ۲۰ گرم ۳۰ گرم باشه دوباره همونو طبق گرم می‌نویسن** براش.» | «…و مقدار فله را با دقت گرم به آن می‌افزاید (**«اگه دو بسته داشته باشن خب می‌زنن ۲۰۰ گرم بعد ۲۰ گرم ۳۰ گرم باشه دوباره همونو طبق گرم می‌نویسن»**).» — 93 chars verbatim |
| F-00306 | `:206` «…اون دو عدد **دو تا فکر کنم ۳۵۰، ۴۰۰ گرمیه. یا ۴۵۰ اگه اشتباه نکنم**.» | «…وزن هر ظرف در جلسه با تردید گفته شد (**«دو تا فکر کنم ۳۵۰، ۴۰۰ گرمیه. یا ۴۵۰ اگه اشتباه نکنم»**) … هر سه عدد به‌عنوان **account** ثبت شده است.» |
| F-00305 | `:206` «**تو هر کارتونش ۲۰۰، ۳۰۰ تا هست**. اگه باز باشه یعنی یه پلمپ نداریم…» | «…تعداد ورق هر کارتن در جلسه با تردید گفته شد (**«تو هر کارتنش ۲۰۰، ۳۰۰ تا هست»**) … هر دو عدد به‌عنوان **account** ثبت شده است.» |
| F-00464 | `:254` «…مثلا **اگه سه کیلو سس آلفردو پاستا دارن چهار کیلو باید بزنن**…» | «…قاعده کار این است که یک کیلو بیشتر … سفارش داده شود (**«اگه سه کیلو سس آلفردو پاستا دارن، چهار کیلو باید بزنن»**) تا وسط شب کم نیاورند.» |
| F-00476 | `:31` «هر مثلاً **این نیست بگیم ۱۰۰ تا تولید کن. چون خمیرمون** رو در روئه **همونو می‌زنیم توی لیست این که چند تا فروش رفته**.» | «…هدف تولید ثابتی وجود ندارد (**«این نیست بگیم ۱۰۰ تا تولید کن، چون خمیرمون روزانه است»**). گوینده گفت **«همونو می‌زنیم توی لیست این که چند تا فروش رفته»**…» |
| F-00479 | `:173-182` «**خود سیستم هم تلرانس در نظر می‌گیره یعنی تو سیستم خودش حساب می‌کنه اگه بچه‌ها در آخر شب** مثلاً ۳۰ گرم ۳۰ درصد **از اون میزان مصرف بیشتر مصرف کرده باشن خودش متوجه میشه**…» | «…**«خود سیستم هم تلرانس در نظر می‌گیره، یعنی تو سیستم خودش حساب می‌کنه، اگه بچه‌ها در آخر شب از اون میزان مصرف بیشتر مصرف کرده باشن خودش متوجه می‌شه که این به خاطر همون کاست وزن مرغه.»**» |
| F-00297 | `:107-116` «…میان **بچه‌ها زیر برگه آمارشون می‌نویسن** … مثلاً **دو کیلو استیک استفاده کردیم ۱۴۰ گرم خونابه داشته**.» | «…**بچه‌ها** این مقدار را زیر برگه آمار می‌نویسند … برای نمونه **«دو کیلو استیک استفاده کردیم ۱۴۰ گرم خونابه داشته»**…» |
| F-00308 | `:270` «…**هر شب چیزی حدود ۸ تا ۱۲ لیتر** ما از روغنامون کسر میشه.» | «**هر شب چیزی حدود ۸ تا ۱۲ لیتر** از روغن سرخ‌کن‌ها کم می‌شود…» (borderline; register cleaned, hedge kept) |
| F-00474 | `:16-18` | «…نمونه‌ای که گفته شد: **«سوخاری امشب به علت نبود پودر مرینت با پودر دیگری زده شد و کیفیتش بد شد»**…» |
| F-00480 | `1405-06-01:34-64` | «…نکته مهم برای اعتماد به اعداد: … **«توی بازه یکی دو ماه اخیر روی این سیستم خیلی حساب نکنید»**» — 54 chars verbatim |

### 5 rewrites

**F-00301 (measurement)**
- now: «پنیر پارمیسان اکنون در بسته‌های ۱۰۰ گرمی تحویل می‌شود؛ سرلاین در مانده آخر شب تعداد بسته‌ها را در ۱۰۰ گرم ضرب می‌کند و مقدار فله را با دقت گرم به آن می‌افزاید («اگه دو بسته داشته باشن خب می‌زنن ۲۰۰ گرم بعد ۲۰ گرم ۳۰ گرم باشه دوباره همونو طبق گرم می‌نویسن»).»
- rewrite: «پنیر پارمیسان در بستهٔ ۱۰۰ گرمی تحویل می‌شود. مانده انتهای شب برابر است با تعداد بستهٔ کامل × ۱۰۰ گرم، به‌علاوهٔ وزن فلهٔ باقی‌مانده بر حسب گرم.» → quote to `accounts[].statement`; the ۱۰۰ g pack to `item.pack {size:100, unit:"g"}`.

**F-00306 (measurement)**
- now: «…وزن هر ظرف در جلسه با تردید گفته شد («دو تا فکر کنم ۳۵۰، ۴۰۰ گرمیه. یا ۴۵۰ اگه اشتباه نکنم») و نامشخص گذاشته شده؛ هر سه عدد به‌عنوان account ثبت شده است.»
- rewrite: «دیپ چدار در ظرف آماده نگهداری و مانده آن به تعداد ظرف شمرده می‌شود. وزن هر ظرف ۴۵۰ گرم است.» → the three readings already are `accounts[]`; add `field_status["data/quantity"]: "informal"`; the word `account` never appears in prose.

**F-00355 (rule)**
- now: «ستون H تب فرنگی (گروه H6:H14): موجودی اول شب به‌علاوه دریافت از انبار منهای موجودی آخر شب.»
- rewrite: «مصرف اعلامی هر قلم = موجودی اول شب + دریافت از انبار − موجودی آخر شب.» → one entry for all four lines and both branches; `scope.branches: ["chalebagh","naharkhoran"]`; the column group to `data.bindings`.

**F-00002 (item)**
- now: «پنیر پیتزا، قلم انبارگردانی لاین پیتزا با کد ##1 که وزن مانده آن در تب‌های «موجودی اول شب» و «موجودی آخر شب» فایل Pitza.xlsx ثبت می‌شود.»
- rewrite: «پنیر پیتزا؛ مادهٔ اولیهٔ لاین پیتزا با کد انبار ##۱، شمارش‌شده بر حسب کیلوگرم در مانده ابتدا و انتهای شب.» → the tab/file are already in the record's `location`; the item names its unit and its role, not its address.

**F-00332 (rule / constant)**
- now: «در سلول L6 تب پیتزا برای پنیر پیتزا ##1 تلورانس ۵ گرم به ازای هر عدد فروش تعریف شده؛ این مقدار در تعداد فروش ضرب، به کیلوگرم تبدیل و از انحراف کم می‌شود.»
- rewrite: «تلورانس پنیر پیتزا ۵ گرم به ازای هر پرس فروخته‌شده است؛ حاصل‌ضرب آن در تعداد فروش، پس از تبدیل به کیلوگرم، از انحراف کسر می‌شود.»

---

## 3. Language mixing

223 distinct non-allowed Latin tokens, **1810 occurrences**, in **442 / 486 (91%)** entries' title|statement.

| category | occurrences |
|---|---|
| workbook / file name (`Mavade Avalie.xlsx`, `Gozaresh markazi.xlsx`, `Pitza.xlsx`, `FRIED🍤.xlsx`…) | 673 |
| other (single column letters `A`,`S`,`E`,`B`… used as column names) | 456 |
| A1 cell ref (`A1` 77×, `J6` 16×, `L6` 14×, `E6`/`B4`/`C4`/`D4` 8-9× each) | 326 |
| mirror-tab name (`Table_Pizza_Request`, `Table_SalesData_Starter`, …) | 218 |
| spreadsheet function (`IMPORT_FROM_SHEET` 74×, `IMPORTRANGE`, `DATE`, `LET`) | 86 |
| **schema / agent jargon** | **30** |
| gs identifier (`getValueById`, `onOpen`, `triggerRecalculation`, `getTotalFoodsIngredient`) | 21 |

Jargon leak detail: `bindings` 15 (F-00340, F-00344, F-00347, F-00352, F-00353, F-00354, F-00356, F-00368…), `FEEL` 15 (F-00315, F-00316, F-00317, F-00319, F-00321, F-00344, F-00346, F-00388), `rows` 10 (F-00167–F-00176, «…و در rows نیامده است»), `original` 7, `account` 5 (F-00055, F-00057, F-00305, F-00306, F-00461).

---

## 4. Title quality

- **133 titles start with a Latin identifier** (99 record, 34 rule): `Table_Pizza_First`, `americanPizza`, `italianPizza`, `singlePizza`, `pasta`, `starter`, `personel`, `salad`, `fried`, `sandwich`, `farangi`, `steak`, `Refresher`, `SheetsFileIDs`, `Form Responses 1`, `OFF اجرایی`.
- **54 titles > 60 chars** (29 record, 25 rule); max 81 = F-00401 «getTotalFoodsIngredient — مصرف واقعی یک قلم از روی فروش و نسخه (گزارش ناهارخوران)». Others ≥ 73: F-00391, F-00282, F-00283, F-00270, F-00396, F-00271, F-00272, F-00406.
- **12 exact-duplicate title pairs (24 rules)**, all date plumbing — F-00337/F-00410, F-00338/F-00411, F-00339/F-00412, F-00349/F-00422, F-00350/F-00423, F-00351/F-00424, F-00361/F-00434, F-00362/F-00435, F-00363/F-00436, F-00370/F-00443, F-00371/F-00444, F-00372/F-00445. Distinguished only by `scope.branches`.
- **1 branch-suffix pair**: F-00309 «مانده اول شب برابر مانده آخر شب شب گذشته» / F-00311 same «— شعبه ناهارخوران». The other line/branch families disambiguate inside the title instead («… (ناهارخوران)», «— لاین فرنگی»), 13 base titles covering 26 entries.
- **0 / 22 notes** obey spec §7's «`title` = the first 60 characters of `statement`».
- Mean title length: 34.2 chars overall; per pass 15 (B3) → 58 (B7).

---

## 5. What `statement` actually is

First-match-wins classification of all 486:

| role | n | % |
|---|---|---|
| sheet description (opens by naming a tab/file/column/cell/range) | 257 | 53% |
| other | 86 | 18% |
| definition («… یعنی / تعریف می‌کند / برابر است با») | 76 | 16% |
| narrative / procedure (who does what, when) | 32 | 7% |
| script / function description («تابع …») | 20 | 4% |
| computation in prose | 8 | 2% |
| cell plumbing («X را از Y می‌خواند») | 7 | 1% |

Per kind:

| kind | dominant role |
|---|---|
| record 156 | **155 sheet-description**, 1 cell-plumbing — not one record statement says who fills the form or what a row means without first naming the tab |
| rule 156 | **100 sheet-description**, 20 script-description, 7 computation, 7 definition, 3 cell-plumbing, 17 other |
| item 139 | 66 definition, 56 other, 17 narrative — but **139/139 name a tab or file** |
| note 22 | 8 narrative, 9 other — mean 405 chars, max 683 |
| measurement 13 | 5 narrative, 4 other, 2 definition |

Length: mean 224 chars, median 210, max 683; 27 over 400, 6 under 60. Per kind mean: note 405, record 281, measurement 261, rule 180, item 175.

### Boilerplate clusters (statements identical after masking numbers, Latin, line names, quotes)

42 clusters covering **167 / 486 entries (34%)**; 115 in clusters of ≥3.

| n | kind | skeleton | members |
|---|---|---|---|
| 26 | item | «آیتم منوی خانواده W W با کد #N؛ ردیف N تب Q فایل X X مصرف مواد اولیه یک واحد آن را تعریف می‌کند. واحد Q استنباطی است.» | F-00073…F-00102 |
| 26 | item | same, one line-word | F-00103…F-00140 |
| 11 | record | «تب پنهان Q در فایل X X تنها یک فرمول در X دارد که با X محدوده X:X تب Q فایل X X X را می‌آورد. تب داده مستقلی ندارد و آینه رکورد مبدأ است.» | F-00215…F-00280 |
| 6 | rule | «ستون X تب W (گروه X:X): موجودی اول شب به علاوه دریافت از انبار منهای موجودی آخر شب.» | F-00355, F-00367, F-00376, F-00428, F-00440, F-00449 |
| 6 | rule | «ستون X تب W (گروه X:X): مصرف واقعی منهای مصرف اعلامی.» | F-00357, F-00369, F-00378, F-00430, F-00442, F-00451 |
| 6 | rule | «قاعده قالب بندی شرطی روی محدوده X:X تب W برای سلول های کوچک تر از صفر.» | F-00383, F-00385, F-00386, F-00456, F-00458, F-00459 |
| 5 | record | «تب Q در فایل X X X: … این رکورد فقط از روی آینه X … شناخته شده؛ خود فایل در این پاس خوانده نشده است.» | F-00191, F-00192, F-00193, F-00248, F-00249 |
| 4+4 | record | mirror `_Request` / `_First`/`_Last` templates | F-00204–F-00213 |
| 3×4 | rule | «سلول X تب W روز/ماه/سال تاریخ گزارش را از سلول X تب Q می خواند.» | F-00349–F-00372, F-00422–F-00445 |

---

## 6. Field level

`.index.json` rollup: **unknown 331**, inferred 398, informal 3, **disputed 0**. Raw nulls under `data{}`: 333, in 131 entries (record 179, rule 137, item 9, measurement 4, note 4).

| null path | n |
|---|---|
| `data/fields/*/unit` | 175 |
| `data/inputs/*/unit` | 86 |
| `data/outputs/*/unit` | 47 |
| `data/unit` | 8 |
| `data/quantity` | 4 |
| `data/meaning` | 3 |
| everything else | 10 |

### Unknowable vs. laziness

**175 record-field unit nulls:**

| class | n | verdict |
|---|---|---|
| field typed `string` / `date` / `datetime` (`reason` «علت ضایعات», `name` «نام», `sanjesh_keyfiyat`, `timestamp` «Timestamp», `dish` «نام», `mah` «ماه») | 81 | **unit meaningless — the key should be absent, not null.** Schema misuse inflating the red count. |
| numeric date-parts / row numbers (`day`×16, `year`×16, `ruz`×10, `sal`×10 — F-00146..F-00151, F-00182..F-00185) | 52 | **unit meaningless** |
| numeric quantity, source prints no unit (e.g. blank-form columns, BOM gram columns) | 42 | **honest unknown** — spec §7 explicitly endorses `"unit": null` here |

Of the 42 honest ones, 10 already have the unit named in the column title («تعداد» ×6 on F-00142/143/155/156, «مقدار دریافت از انبار» ×4 on F-00183/184/240/241) — recoverable with a cheap heuristic.

**86 rule-input unit nulls:** 22 resolve directly by following the `inputs[].from` edge the entry already carries — F-00343 `mojudi_avval_shab`/`daryaft_az_anbar`/`mojudi_akhar_shab` → F-00182 (`kg`), F-00345 `masraf_vaqei`/`masraf_elami` → F-00182 (`kg`), F-00347 `enheraf`/`masraf_vaqei` → `kg`, `tedad_forush` → `pcs`, F-00348, F-00360, F-00312 `item_20` → F-00165 (`pcs`). 130 inputs have no `from` at all. Spec §10 already mandates `validate` check input-unit == source-unit.

**47 rule-output unit nulls:** 16 resolvable via `writes_to`; **41 outputs carry no `writes_to`**.

### Accounts / disputes

10 entries, **24 accounts**, **0 open** — every one already `chosen`/`rejected`: F-00055 (روغن زیتون g vs ml, 3), F-00057 (زیتون سیاه g vs pcs, 3), F-00141 (enum vs transcript, 2), F-00149, F-00151, F-00153 (sheet column exists vs «مانده نمی‌دیم», 2 each), F-00176 (215 g vs 10 pcs), F-00305 (200/300/variable, 3), F-00306 (350/400/450, 3), F-00461 (`/0.7` vs `*1.3`, 2). Quality here is good — this is the one part of the store where the two readings and the hedge are correctly modelled.

`issues[]`: 84 entries, 96 issues (record 64, rule 14, item 4, measurement 1, note 1).
`field_status`: 185 entries, 401 lines — **398 `inferred`, 3 `informal`, 0 anything else**. Concentrated on `data/category` (139), `data/fields/*/unit` (123), `data/unit` (103), `data/role` (30). Note `inferred` on `data/category` fires on every single item — a blanket stamp, not a judgement.

---

## 7. Pass-to-pass style drift

Entries attributed to their originating pass via `(kind, key)` against `runs/facts/cooking/20260902-080737/parts/facts-delta-B*.json` (485/486 attributed).

| pass | n | mean statement | statement opens with a locator | Latin in statement | mean title | title starts Latin |
|---|---|---|---|---|---|---|
| B1 | 67 | 177 | 19% | 100% | 18 | 1% |
| B2 | 18 | 327 | 72% | 100% | 42 | 6% |
| B3 | 100 | 199 | 12% | 100% | 15 | 0% |
| B4 | 81 | 163 | 72% | 42% | 35 | 25% |
| B5 | 50 | 251 | **100%** | 100% | 48 | **92%** |
| B6 | 80 | 191 | 71% | 40% | 46 | 24% |
| B7 | 50 | 327 | **100%** | 100% | 58 | **92%** |
| B8 | 39 | 347 | 8% | 10% | 34 | 0% |

`expr` convention for the same mirrored rules: B4 **38/38 bare expression** `(mojudi_avval_shab + daryaft_az_anbar) - mojudi_akhar_shab`; B6 **30/31 assignment** `masraf_elami = mojudi_avval_shab + daryaft_az_anbar - mojudi_akhar_shab`. Store-wide: 41 bare / 34 assignment.

---

## 8. Purpose-test failures visible from style alone

| class | n | ids |
|---|---|---|
| date-plumbing rules («سلول B4 … روز تاریخ را از سلول C5 می‌خواند») | 24 | F-00337–339, F-00349–351, F-00361–363, F-00370–372, F-00410–412, F-00422–424, F-00434–436, F-00443–445 |
| conditional-formatting rules (cosmetic) | 20 | F-00312, F-00314, F-00379–387, F-00452–460 |
| mirror records (`role: mirror` / «آینه») | 70 | F-00202–223, F-00270–284, … |
| housekeeping tabs & scripts | 9 | F-00180 (Refresher), F-00186 (SheetsFileIDs), F-00179 (Form Responses 1), F-00331 (triggerRecalculation), … |
| **union** | **123 (25%)** | |

Plus the individually named ones the user cited: **F-00465** note «کامنت «149» روی ستون نوشابه قوطی مشکی» (a cell comment whose meaning is explicitly «مشخص نیست»), **F-00485** note «سوراخ‌های هواکش و نام‌گذاری کارتن سوخاری» (no quantity anywhere).

---

## 9. Style guide for the rewrite / راهنمای سبک

### S1 — بیان = تعریف، نه نشانی. A statement defines the thing; it never says where the thing lives.
Forbidden in `title`/`statement`/`aliases`/prose `data` leaves: tab names, file names, A1 refs and ranges, row numbers, named ranges, spreadsheet or script function names, colour hex codes.
Their homes: `data.location`, `source[].sheet`/`cell`, `data.bindings`, `data.identifier`, `original_ref`.
**Test:** if the sentence starts with «تب…», «ستون…», «سلول…», «فایل…», «قاعده…», «جدول…», rewrite it. (Today: 257 entries fail.)

### S2 — یک مفهوم، یک فکت. One concept, one entry.
Line, branch and workbook are axes of `scope` and `bindings`, never reasons to mint a second entry with the same `expr`. Mint a second entry only when the *computation* differs.
**Test:** two entries with byte-equal `data.expr` (or the same defining sentence after removing line/branch words) must be one entry. (Today: 8 × «مصرف اعلامی», 6 × «انحراف», 6 × «نشانه انحراف منفی», 24 × date-plumbing.)

### S3 — بدون واژهٔ لاتین در متن فارسی. No Latin inside Persian prose.
Allowed: `csv`, `Excel`, `sheet`, `ERP`, `POS`, and unit symbols. Everything else — `Table_SalesData_Starter`, `IMPORT_FROM_SHEET`, `onOpen`, `Pitza.xlsx`, `L6` — is banned from prose and belongs in a typed field. (Today: 442 entries fail, 1810 occurrences.)

### S4 — واژگان درونی سامانه هرگز در متن نمی‌آید. No pipeline jargon in prose.
Banned words in Persian text: `account`, `accounts`, `rows`, `fields`, `field_status`, `FEEL`, `bindings`, `original`, `stub`, `inferred`, `unknown`, `null`. The reader is a process author or an ERP builder, not the pipeline. (Today: 30 occurrences across 30 entries.)

### S5 — زبان نوشتاری معیار. Standard written Persian, third person, simple present, passive or role-as-subject.
Banned spoken forms: «می‌زنیم، نمی‌دیم، می‌گیم، اگه، همونو، اینو، دیگه، خب، فکر کنم، بچه‌ها، یه، ـمون/ـتون/ـشون».
A verbatim quote goes in `accounts[].statement` or `facts/originals/F-*.txt` — **never** inside `statement`. (Today: 6 entries embed ≥40-char verbatim speech.)

### S6 — کمّی بودن، آزمون وجود. Quantitative or it does not exist.
Every `statement` must carry at least one of: (a) a quantity with a unit, (b) an equality or formula, (c) a form's column with who fills it, (d) a decision threshold with its consequence.
A sentence that survives none of these is not a fact — it is not a `note`, it is nothing. (Today this would delete the 24 date-plumbing rules, the 20 CF rules, the 70 mirror records, F-00465 and F-00485.)

### S7 — طول. Length.
`statement`: 1–3 sentences, ≤ 300 characters. `note`: ≤ 2 sentences — a longer note is a `rule` with `lang: text` plus a constant, per spec §8 rule 3. (Today: note mean 405, max 683; 27 entries over 400.)

### S8 — عنوان مفهوم است، نه نام مصنوع. A title names the concept, not the artefact.
3–6 Persian words, ≤ 60 characters, never starting with a Latin letter, no branch or line suffix (that is `scope`). Per spec §7, a `note`'s title **is** the first 60 chars of its statement — derive it, do not write it. (Today: 133 Latin-starting, 54 over 60, 12 exact-dupe pairs, 0/22 notes compliant.)

### S9 — ارقام فارسی در متن، ASCII در `data`. Persian digits in prose, ASCII numerals in payload.

### S10 — مجهولِ واقعی، نه مجهولِ تشریفاتی. Real unknowns only.
`unit: null` is legal only on a numeric quantity whose source genuinely never states a unit. Omit the key entirely on `string`/`date`/`datetime` fields, on date parts (`day`/`month`/`year`/`ruz`/`mah`/`sal`) and on row numbers. Before writing `null` on a rule input or output, follow `from`/`writes_to` and copy the unit the target already carries. (Today this would cut the 331 unknowns to roughly 160, and the 42 honest record-field unknowns to about 32.)

### Enforceable checks to add
1. `validate`: reject `title`/`statement` matching `[A-Z]{1,3}\d{1,4}(:[A-Z]{1,3}\d{1,4})?`, `Table_[A-Za-z0-9_]+`, `\.(xlsx|gs|docx)`, or a jargon word from S4.
2. `validate`: reject `statement` opening with تب|ستون|سلول|فایل|جدول|محدوده|برگه.
3. `validate`: reject `title` starting `[A-Za-z]`, or longer than 60 chars.
4. `apply`: make the byte-equal-title check **scope-independent** within a kind (it is currently partitioned by scope, which is how the 12 date-plumbing pairs got in), and fix `audit._lookalike_title` so it stops skipping exact matches (`len({m.get(attr) …}) < 2: continue`).
5. `apply`: derive a `note`'s `title` from its `statement` rather than accepting the agent's.
6. `apply`: strip `unit` where `type` is not `number`/`integer`, before the red rollup counts it.
7. `validate`: warn when a rule input's `unit` is null and its `from` target's unit is not.
8. `audit`: report clusters of entries whose `data.expr` is byte-equal — the "one rule per line" detector.