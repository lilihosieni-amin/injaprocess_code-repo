# audit:items-meas

## summary
I audited all 139 items and all 13 measurements in the store against spec §7/§8. The measurement kind was misused wholesale: the spec defines `data.quantity` as a kind-of-quantity enum (`mass|count|volume|duration|money|ratio|other`) and the kind as "what is captured, by whom, into which record field", but all 13 entries put a *number* (or null) in `quantity`, and 0/13 carry `by`, `when` or `writes_to` — so every one is really a constant that §8 rule 8 sends to `rule` with `inputs: []`, and the "who measures what into which field" knowledge the kind existed for is absent from the store entirely. Items fare better structurally but every one needs rework: 139/139 statements cite a tab/file/cell (the exact defeats-the-purpose complaint), 132/139 carry a category outside the spec's 6-value enum (the agent invented `menu_item|meat|beverage|vegetable|dairy|bread|sauce|prepared|dough|pasta|oil`), all 139 have `data/category: inferred`, and 52/139 assert both branches when their only source is a Chalebagh workbook — with no `field_status` line on scope to mark the guess. Seven of the eleven spec fields for `item` (`group`, `state`, `grade`, `units[]`, `pack`, `tracked`, `code_absent`) are used zero times, so all pack knowledge is lost: 14 beverage SKUs get `unit: pcs` with no distinction between a 330 ml can and a 1.5 l family bottle. I found three exact duplicate pairs (identical BOM vectors, same tab, same title, two codes) that the audit's `_lookalike_title` misses because it folds with `_fold` (digits preserved) while its own docstring promises digit-insensitivity and `_shape` next to it would catch them. The engine has three more evidenced defects: `verbs.resolve` writes only the resolved field, leaving `data/unit_ref` absent on F-00055/F-00057 and leaving four statements saying "left unknown" beside a resolved value; `apply.py:598` sets the predecessor's `valid_to` from the successor's null `valid_from`, so the superseded 200 g parmesan pack (F-00300) is still `is_open()`; and the schema requires only key *presence*, no enums, so 132 invented categories, 13 misused quantities and one invented record role validated clean. `merge facts audit` emits 88 findings and not one names an item or a measurement. Gate B time was spent badly: two of the four disputes it resolved were hedged speech («فکر کنم ۳۵۰، ۴۰۰ گرمیه. یا ۴۵۰») the owner had to arbitrate, and F-00306 now reads `status: confirmed, quantity: 450` under a statement that says the value was left unknown.

## problems
- [high/data-quality] All 13 measurements misuse `data.quantity` — a number where the spec defines an enum :: Spec §7 (2026-08-29-quantitative-facts-design.md:930) — "`quantity`: `mass | count | volume | duration | money | ratio | other`". Store: F-00296 `"quantity": 30`, F-00299 `"quantity": 285`, F-00302 `"quantity": 1.2`, F-00307 `"quantity": 10`; 8 ints, 1 float, 4 nulls, 0 enum members across all 13 (d
- [high/data-quality] The `measurement` kind captured none of what it exists for — 0/13 name who measures, when, or into which field :: Spec §7 header: "`measurement` — what is captured, by whom, into which record field", example carries `method`, `when`, `by`, `writes_to`, `exceptions`. Store: `by` 0/13, `when` 0/13, `writes_to` 0/13, `method` 1/13 (F-00296 only). All 13 sources are `type: voice` transcript lines; the kind became t
- [high/data-quality] Every one of the 13 measurements is a constant that §8 rule 8 routes to `rule` with `inputs: []` :: Spec §8.8: "Is a value stated singly — a literal in a formula, a number in a sentence → **rule with no inputs** (a constant)." F-00296 (30% cook loss), F-00299 (285 g/portion, sample_size 11, tolerance 12 g), F-00303 (200 g alfredo/portion) are values stated singly in a transcript. The store holds 1
- [high/data-quality] F-00304 is the spec's own worked example for `item.units[]`, written as a measurement instead :: Spec §7 line 769-770: "`units[]` gives each pack level its `factor_to_base`, a number or — where the estate says the factor varies, as 30 bacon slices weighing 900–980 g — a `{min, max}` range". Store F-00304 `bacon__vazn_baste_si_adadi`: `{"quantity": null, "unit": "g", "range": [900, 980], "pack_s
- [high/data-quality] All pack/state/group knowledge lost: 7 of 11 `item` data fields are used zero times :: `Counter(k for x in items for k in x['data'])` = `{category:139, unit:139, code:139, unit_ref:129}`. Never used: `group`, `state`, `grade`, `units[]`, `pack`, `tracked`, `code_absent`. Consequence: F-00029 نوشابه قوطی مشکی and F-00035 نوشابه خانواده مشکی both get `unit: pcs` with nothing separating 
- [high/data-quality] 52 of 139 items assert both branches on Chalebagh-only evidence, with no field_status marking the guess :: Joining item `source[].ref` to attachments/sheets/manifest.json: 50 items cite only Chalebagh-branch workbooks (pitza, farangi, sokhari, kanter) and 2 more add only a voice source, yet all 139 carry `scope.branches: [chalebagh, naharkhoran]`. Example F-00002 پنیر پیتزا: sole sources are `1dmH8tCq…` 
- [high/output-format] 139/139 item statements cite a tab, file or cell — the statement defeats its own purpose :: Regex over all 139: 100% match a tab/file/cell/column citation. F-00002: «…که وزن مانده آن در تب‌های «موجودی اول شب» و «موجودی آخر شب» فایل Pitza.xlsx ثبت می‌شود.»; F-00109: «آیتم منوی خانواده ساندویچ با کد #131؛ ردیف ۲ تب «ساندویچ» فایل Mavade Avalie.xlsx…». 66 distinct templates over 139 entries; 
- [high/data-quality] Three exact duplicate menu items — identical BOM vectors, same tab, same title, two codes :: records.json F-00167 (تب پیتزا امریکایی): rows `dish_767` «مخصوص #767» and `dish_1` «مخصوص #1» are byte-identical apart from the code (item_1:180, item_3:90, item_25:90, item_26:230, item_31:10, item_32:30, item_33:20, item_30:8, item_63:1, item_55:1). F-00168 (ایتالیایی): `dish_768`≡`dish_771`. F-0
- [high/validator] `_lookalike_title` cannot catch those duplicates — it folds with `_fold` while its docstring promises digit-insensitivity :: code-repo/engine/merge_facts/audit.py:166 docstring: "titles (and keys) that differ only in spacing, digits, case or ی/ي" — but the loop passes `_fold` (audit.py:103, spaces removed, digits kept). Verified: `_fold('مخصوص #767')='مخصوص#767'` vs `_fold('مخصوص #1')='مخصوص#1'` → no finding; `_shape` (au
- [high/validator] `merge facts audit` has zero coverage of items and measurements :: Ran `merge facts audit` against data-repo: 88 findings — 62 `row_gone`, 15 `unconsumed_constant`, 7 `unknown_role`, 4 `duplicate_output`. Grepping the output for any id in F-00002..F-00140 (items) or F-00296..F-00308 (measurements) returns nothing. No check exists for duplicate item codes, unit/unit
- [high/engine] Schema requires key presence but no vocabulary — 132 invented categories and 1 invented record role validated clean :: schemas/facts-delta.schema.json `$defs/entry` gives item `required: [category, unit]` and measurement `required: [quantity, unit]` with no `enum` anywhere in the file except `$defs/issue/properties/kind`. Store categories: menu_item 69, meat 22, beverage 14, vegetable 8, packaging 7, dairy 6, bread 
- [medium/engine] `verbs.resolve` writes one field and leaves its companions stale — `unit_ref` missing on both items it touched :: engine/merge_facts/verbs.py:113-140: `set_path(entry, field, chosen.get('value'))` and nothing else. Commit 384bc80 resolved `data/unit` to "g" on F-00055 روغن زیتون and F-00057 زیتون سیاه; both now hold `"unit": "g"` with `unit_ref` absent, while 129 of the other 137 items carry `unit_ref: {ref: F-
- [medium/engine] Every Gate-B resolution leaves a statement that contradicts the resolved data :: F-00306 statement: «…و نامشخص گذاشته شده؛ هر سه عدد به‌عنوان account ثبت شده است.» with `data.quantity: 450`, `status: confirmed`. F-00305: «…و نامشخص گذاشته شده؛ هر دو عدد به‌عنوان account ثبت شده» — three accounts exist. F-00055: «…روشن نیست گرم است یا میلی‌لیتر» with `unit: "g"`. F-00057 likewise
- [high/engine] A supersession with a null `valid_from` leaves both eras open — the retired 200 g parmesan pack still reads as live :: engine/merge_facts/apply.py:598 `match["valid_to"] = incoming.get("valid_from")`. F-00301 has `valid_from: null`, so F-00300 (پنیر پارمیسان بسته ۲۰۰ گرمی — رویه پیشین) ended with `valid_to: null, retired: false, status: confirmed, superseded_by: {ref: F-00301}` and `merge_facts/__init__.py:37 is_ope
- [medium/ux] Gate B spent the owner's time arbitrating hedged speech, and one answer is now wrong :: F-00306 دیپ چدار, three accounts from one sentence: «دو تا فکر کنم ۳۵۰، ۴۰۰ گرمیه. یا ۴۵۰ اگه اشتباه نکنم» (transcript cooking-1405-05-26.txt:206). The owner chose 450 — the speaker's least-confident afterthought — and the entry is now `status: confirmed`. F-00305 پنیر گودا, «تو هر کارتنش ۲۰۰، ۳۰۰ ت
- [medium/data-quality] Three measured things have no item at all, while 14 items nobody computes with do :: `of` missing on F-00303 (سس آلفردوی پاستا, 200 g/portion), F-00306 (دیپ چدار) and F-00308 (روغن سرخ‌کن, 8–12 l/night) — none of the three exists in items.json. Meanwhile F-00029..F-00042 (14 beverage SKUs) appear in no reference table and in no rule; they are counter-inventory columns only. Items na
- [medium/data-quality] F-00307 duplicates a BOM cell that §9 says should have taken it as a second source :: F-00307 `loghme__tedad_dar_har_pors`, quantity 10 pcs per portion, `of: F-00051`. records.json F-00176 (تب استارتر) row `dish_7` already holds `item_24: 10`. Spec §9: "a value said in a meeting that belongs to a table cell is attached to that cell as a source or an account, not minted beside it" — a
- [medium/data-quality] F-00308 is `item.tracked` content — the spec's named home for "we do not measure X, because…" — filed as a measurement with a null quantity :: F-00308 روغن سرخ‌کن: «…روغن گران‌ترین و مهم‌ترین قلم لاین سوخاری است ولی هیچ آماری از آن در مانده شب ثبت نمی‌شود، چون مقدار کسری قابل کنترل نیست», `quantity: null`. Spec §7 line 773: "`tracked` records the 'we do not measure X, because…' content of the transcripts as data." `tracked` is used 0 times
- [medium/output-format] 7 of 13 measurement statements carry spoken register and 2 embed verbatim speech :: F-00301: «…سرلاین در مانده آخر شب تعداد بسته‌ها را در ۱۰۰ گرم ضرب می‌کند و مقدار فله را با دقت گرم به آن می‌افزاید («اگه دو بسته داشته باشن خب می‌زنن ۲۰۰ گرم بعد ۲۰ گرم ۳۰ گرم باشه دوباره همونو طبق گرم می‌نویسن»)». F-00297: «بچه‌ها این مقدار را زیر برگه آمار می‌نویسند… برای نمونه «دو کیلو استیک استف
- [medium/output-format] `per`, `range` and `unit_ref` vocabularies drifted across the 13 measurements :: `per` values: pcs×5, portion×3, kg×2, `"shab"`×1 (untransliterated Persian for 'night', F-00308), absent×2. `pcs` is used to mean "per pack" five times, including F-00302 where the pack is 1.2 kg. `range` is written `[28, 32]` (array) in all 6 places it appears, while spec §7 specifies `range: {"min
- [low/output-format] 69 menu-item titles carry the code, duplicating `data.code` and breaking title comparison :: All 69 `menu_item` titles embed their own code: «اینجا برگر #131», «مخصوص #767», «رستبیف #71». `data.code` already holds it. 45 of the 73 aliases in the store are likewise the title plus the code (F-00024 alias 'نان مک ##41' vs title 'نان مک'), carrying zero information. One alias is preserved OCR g
- [medium/data-quality] Size and line variants are indistinguishable in the item payload — the family/single axis lives only in prose :: «رستبیف #71» (تب پیتزا امریکایی, F-00072) and «رستبیف #4» (تب پیتزا سینگل, F-00097) are both `category: menu_item, unit: portion` with no size field; the BOM shows them as genuinely different products (180 g vs 95 g cheese, 230 g vs 180 g dough). Same for #65/#783, #75/#781, #27/#780, #766/#784, #76
- [medium/data-quality] 138 of 139 items link to no process, and only 2 were informed by a transcript :: `processes[]` non-empty on 1 item: F-00133 اینجا باکس #7 → cooking-024. Item source types: 138 sheet-only entries, 2 with an added voice source, 2 with the Gate-B chat source, 1 with a process source. The store's items are a sheet-column census, not a picture of what the kitchen handles.
- [medium/data-quality] No `place` items and no `movement` — the spec's stated reason for making place an item is unrealised :: `category == 'place'`: 0 of 139. Records carrying `movement`: 0 of 156. Spec §7 line 774-776: "A `place` (انبار، آماده‌سازی، ایستگاه، سردخانه) is an item so that a movement (below) can name it; a location kind is deliberately not introduced (§18)." Transcript-sourced entries reference آماده‌سازی in 
- [medium/data-quality] 8 items are definitions of nothing — an empty column with a code and no unit :: F-00012 سس گوجه کف پیتزا ##33, F-00013 خمیر پیتزا ##26, F-00023 قارچ فرنگی ##40, F-00024 نان مک ##41, F-00025 نان باگت ##42, F-00026 مینی مک ##43, F-00027 پاستا پنه خام ##44, F-00052 پنیر چیزا ##38 — all `unit: null`, `status: unknown`, statement «ستون در زمان استخراج خالی بوده و واحد آن نامشخص است»
- [medium/data-quality] Two dedup questions the agent raised and nobody closed :: F-00044 issue `code_collision`: «نام «مینی مک» با دو کد متفاوت در دو فایل ثبت شده است: «مینی مک ##43» … و «تعداد مینی مک ##47» … مشخص نیست یک قلم واحد با دو کد است یا دو قلم متفاوت» (affects F-00026, F-00044). F-00071 issue `junk`: «ستون «پنیر پیتزا میکس» … کد ## ندارد … نسبت آن با «پنیر پیتزا ##1» 

## details
## Scope

All 139 entries in `data-repo/facts/items.json` and all 13 in `data-repo/facts/measurements.json`, read against spec §7 (line 733) and §8 (line 1085) of `code-repo/docs/superpowers/specs/2026-08-29-quantitative-facts-design.md`, cross-checked against `data-repo/facts/records.json`, `rules.json`, `.index.json`, `attachments/sheets/manifest.json`, the applied delta and its 8 parts, `code-repo/schemas/facts-delta.schema.json` and `code-repo/engine/merge_facts/*.py`. `merge facts audit` was run live.

---

## ITEMS — 139 entries, counted

| Measure | Value |
|---|---|
| Statements citing a tab / file / cell / column | **139 / 139** |
| Distinct statement templates | 66 |
| `category` outside spec enum (`ingredient\|product\|packaging\|consumable\|place\|other`) | **132 / 139** (only the 7 `packaging` conform) |
| `field_status: data/category = inferred` | **139 / 139** |
| `field_status: data/unit = inferred` | 103 / 139 |
| `scope.branches` wider than the source workbooks' branches | **52 / 139** |
| Any `field_status` line on a scope path | **0 / 139** |
| `unit: null` | 8 |
| `unit` set but `unit_ref` absent | 2 (F-00055, F-00057 — both Gate-B casualties) |
| Aliases total / that are just title+code | 73 / **45** |
| Exact duplicate pairs (identical BOM row, same tab, same title) | **3** |
| Items using `group`, `state`, `grade`, `units[]`, `pack`, `tracked`, `code_absent` | **0** each |
| `category: place` | 0 |
| Records carrying `movement` | 0 |
| Items with `processes[]` | **1** (F-00133 → cooking-024) |
| Items named by a rule `{ref}` | **6** (F-00002/3/4/6, F-00020, F-00027) |
| Items appearing in a reference/BOM table | 125 |
| Items that are only a log column | 14 (all beverages) |
| Items with a transcript source | 2 |
| Items with `issues[]` / `accounts[]` | 4 / 2 |
| Colloquial register in statement | **0 / 139** (the register break is confined to measurements) |

### Category vocabulary actually emitted
`menu_item` 69, `meat` 22, `beverage` 14, `vegetable` 8, `packaging` 7, `dairy` 6, `bread` 4, `sauce` 3, `prepared` 3, `dough` 1, `pasta` 1, `oil` 1.
Spec §7 line 761: `category`: `ingredient | product | packaging | consumable | place | other`, with `group` as the separate axis for "a minted key for the menu taxonomy". The agent collapsed both axes into `category` and invented the vocabulary; `group` is unused.

### Units
`portion` 71, `pcs` 31, `kg` 19, `g` 10, `null` 8. Every value is a row of the units record F-00001, so the registry check passes; but `unit_raw` (the verbatim estate string the audit's `_unit_raw_uncovered` looks for) appears **0 times** in items.json, measurements.json or records.json, so that check is vacuous.

### Statement templates (top 6, `T`=title, `#N`=code)

| n | example id | template |
|---|---|---|
| 14 | F-00029 | `T، قلم انبارگردانی کانتر با کد #N که تعداد مانده آن در تب‌های «X» و «X» فایل Kanter.xlsx ثبت می‌شود. واحد از صحیح بودن مقادیر ستون استنباط شده است.` |
| 12 | F-00109 | `آیتم منوی خانواده ساندویچ با کد #N؛ ردیف N تب «X» فایل Mavade Avalie.xlsx مصرف مواد اولیه یک واحد آن را تعریف می‌کند. واحد «پرس» استنباطی است.` |
| 11 | F-00084 | same, `خانواده پیتزا ایتالیایی` |
| 9 | F-00073 | same, `خانواده پیتزا امریکایی` |
| 7 | F-00002 | `T، قلم انبارگردانی لاین پیتزا با کد #N که وزن مانده آن در تب‌های «موجودی اول شب» و «موجودی آخر شب» فایل Pitza.xlsx ثبت می‌شود.` |
| 6 | F-00097 | same, `خانواده پیتزا سینگل` |

Each is a provenance sentence. Strip the citation and nothing survives that `title` + `data.code` + `source[]` did not already carry.

### The branch expansion, item by item

Joining `source[].ref` to `manifest.json`:

| source-derived branch set | items |
|---|---|
| chalebagh + naharkhoran | 84 |
| **chalebagh only** | **50** |
| chalebagh + a voice source | 2 |
| chalebagh + naharkhoran + chat (Gate B) | 2 |
| chalebagh + naharkhoran + process | 1 |

All 139 declare `[chalebagh, naharkhoran]`. The 52 with Chalebagh-only sheet evidence are asserted, not sourced. Verified the parts are identical to the final delta for every item (`n diffs 0` comparing `parts/facts-delta-B1.json` + `B3.json` against `facts-delta.json`), so this was written that way by the agent in passes B1 (52 items) and B3 (87 items), not injected by a later coordinator edit.

### Duplicate list

**Exact duplicates — drop one of each pair, keep the dropped code as an alias:**

| keep | drop | tab | evidence |
|---|---|---|---|
| F-00082 `dish_767` «مخصوص #767» | **F-00083** `dish_1` «مخصوص #1» | پیتزا امریکایی (F-00167) | identical row: item_1:180, item_3:90, item_25:90, item_26:230, item_31:10, item_32:30, item_33:20, item_30:8, item_63:1, item_55:1 |
| F-00095 `dish_768` «مخصوص #768» | **F-00096** `dish_771` «مخصوص #771» | پیتزا ایتالیایی (F-00168) | identical row: item_1:190, item_3:120, item_25:120, item_26:280, item_31:10, item_32:40, item_37:20, item_30:8, item_54:1, item_59:1, item_63:1 |
| F-00120 `dish_773` «برگر مخصوص #773» | **F-00121** `dish_769` «برگر مخصوص #769» | ساندویچ (F-00173) | identical row: item_14:1, item_15:1, item_41:1, item_69:1 |

**Open dedup questions the agent flagged and nobody closed:**
- F-00026 `item_43` مینی مک ##43 (Farangi) vs F-00044 `item_47` مینی مک کانتر ##47 (Kanter) — `issues[].kind: code_collision` on F-00044.
- F-00071 `panir_pitza_mix` (no code) vs F-00002 `item_1` پنیر پیتزا ##1 — `issues[].kind: junk` on F-00071, "نسبت آن با «پنیر پیتزا ##1» نامشخص است".

**Same material, per-line stock code — needs a link (`group`), not a merge:**
گوشت چرخ کرده ##6 / گوشت چرخ کرده فرنگی ##23 · گوشت رست بیف ##2 / گوشت رستبیف فرنگی ##11 · مرغ پیتزا ##5 / مرغ فرنگی ##12 · قارچ اسلایس شده ##32 / قارچ فرنگی ##40 / قارچ سوخاری ##39.

**Size variants indistinguishable in the payload** (all `menu_item`/`portion`, family vs single): #71/#4 رستبیف · #65/#783 چیکن آلفردو · #75/#781 پپرونی · #27/#780 میت · #766/#784 کراکف · #768,#771/#782 مخصوص. The BOM proves they differ (e.g. 180 g vs 95 g cheese, 230 g vs 180 g dough); the item entries do not say so.

Correctly handled: the `#27` collision (`dish_27__pitza_americai` میت vs `dish_27__starter` سیب زمینی ویژه) — keys bound by tab per QF-32, with a `code_collision` issue naming both. This is the one place the code-collision machinery worked.

### The 8 unit-less items
F-00012 سس گوجه کف پیتزا ##33 · F-00013 خمیر پیتزا ##26 · F-00023 قارچ فرنگی ##40 · F-00024 نان مک ##41 · F-00025 نان باگت ##42 · F-00026 مینی مک ##43 · F-00027 پاستا پنه خام ##44 · F-00052 پنیر چیزا ##38. All `status: unknown`, all "ستون در زمان استخراج خالی بوده". F-00013 خمیر پیتزا carries a gram value on every BOM row (180/230/280) — the unit was recoverable and was not recovered.

---

## MEASUREMENTS — all 13, verbatim

| id | key | quantity | unit | per | of | status | verdict |
|---|---|---|---|---|---|---|---|
| F-00296 | `morgh_grill__kast_vazn_pokht` | 30 | percent | — | F-00020 | confirmed | → **rule** constant, `nature: observed`, range 28–32; only entry with `method` |
| F-00297 | `steak__khunabe_dar_har_kilo` | null | g | kg | F-00009 | unknown | → **rule** constant, range 70–90; statement colloquial |
| F-00298 | `philadelphia__khunabe_dar_har_kilo` | 110 | g | kg | F-00010 | confirmed | → **retire**; own statement: «دیگر به این شکل استفاده نمی‌شود» yet `retired: false` |
| F-00299 | `kerispi_double__moadel_morgh_har_pors` | 285 | g | portion | F-00020 | confirmed | → **rule** constant; best entry in the file (`sample_size: 11`, `tolerance: {12, g}`, `dishes[]`, a `cross_record` issue) |
| F-00300 | `panir_parmisan__vazn_baste_pishin` | 200 | g | pcs | F-00019 | confirmed | → **retire**; `superseded_by: F-00301` but `valid_to: null, retired: false` → still `is_open()` |
| F-00301 | `panir_parmisan__vazn_baste` | 100 | g | pcs | F-00019 | confirmed | → **item.pack** on F-00019; statement embeds raw speech |
| F-00302 | `pasta_penne__vazn_baste_amade_sazi` | 1.2 | kg | pcs | F-00027 | confirmed | → **item.units[]/pack** on F-00027 (`portions_per_pack: 5`, `gram_per_portion: 240`) |
| F-00303 | `sos_alfredo_pasta__har_pors` | 200 | g | portion | **—** | confirmed | → **rule** constant; the sauce has no item in the store |
| F-00304 | `bacon__vazn_baste_si_adadi` | null | g | — | F-00022 | unknown | → **item.units[]** ranged factor on F-00022; this is spec §7's own worked example |
| F-00305 | `panir_guda_varaghei__tedad_dar_karton` | null | pcs | pcs | F-00069 | unknown | → **item.units[]** ranged carton factor on F-00069; hedged, ate Gate-B time |
| F-00306 | `dip_chedar__vazn_zarf` | 450 | g | pcs | **—** | confirmed | → **drop**; hedged three ways, no item, statement contradicts data |
| F-00307 | `loghme__tedad_dar_har_pors` | 10 | pcs | portion | F-00051 | confirmed | → **source/account** on `F-00176 /data/rows/dish_7/item_24` (already = 10) |
| F-00308 | `roghan_sorkhkon__kasri_shabane` | null | l | `shab` | **—** | unknown | → **item.tracked**; no fryer-oil item exists |

Aggregates: `by` 0/13 · `when` 0/13 · `writes_to` 0/13 · `method` 1/13 · `of` 10/13 · `unit_ref` 3/13 · `quantity: null` 4/13 · sources 13/13 voice (2 add a sheet, 1 a process) · colloquial register 7/13 · embedded spoken quote 2/13 (F-00301, F-00306) · statement cites a tab/file/column 5/13 (F-00296, F-00302, F-00303, F-00304, F-00307) · `retired: true` 0/13.

### The two hedges the owner had to arbitrate

**F-00306** — one sentence, transcript `cooking-1405-05-26.txt:206`: «دو تا فکر کنم ۳۵۰، ۴۰۰ گرمیه. یا ۴۵۰ اگه اشتباه نکنم». Three accounts (`27d5d028` 350 g rejected, `febec5e1` 400 g rejected, `6ff987b0` 450 g **chosen**). Result: `quantity: 450`, `status: confirmed`, under a statement that still reads «…و نامشخص گذاشته شده؛ هر سه عدد به‌عنوان account ثبت شده است». The owner's choice landed on the speaker's least-confident afterthought and the entry now claims to be confirmed.

**F-00305** — same transcript line: «تو هر کارتنش ۲۰۰، ۳۰۰ تا هست». Two accounts rejected, a chat account chosen as a range. Statement says «هر دو عدد به‌عنوان account ثبت شده است» while three accounts exist.

Both entries' underlying content belongs in `item.units[]` as a ranged `factor_to_base` — exactly what spec §7 provides for — where a hedge is a legitimate range and needs no human.

### Gate-B damage on the item side
Commit `384bc80` ("resolve 10 disputed fields from the Gate B answers") touched F-00055 روغن زیتون and F-00057 زیتون سیاه, writing `data/unit: "g"` and flipping `status` from `disputed` to `inferred`. Both now have `unit_ref` absent (the only two such items in the store) and statements that still say «روشن نیست گرم است یا میلی‌لیتر» / «واحد نامشخص گذاشته شده است».

---

## Engine and validator evidence

**`code-repo/engine/merge_facts/audit.py:166` `_lookalike_title`** — docstring: "titles (and keys) that differ only in spacing, digits, case or ی/ي"; the loop passes `_fold` (audit.py:103, spaces stripped, **digits kept**). Verified in-process:
```
_fold('مخصوص #767') = 'مخصوص#767'   _fold('مخصوص #1') = 'مخصوص#1'   → not equal, no finding
_shape('مخصوص #767') = 'مخصوص##'    _shape('مخصوص #1') = 'مخصوص##'   → equal
```
`_shape` (audit.py:109) is defined immediately below and used only by `_recurring_note_shape`. Swapping it in flags all three duplicate pairs (and the six size-variant pairs, which is the right thing for a human to see).

**`code-repo/engine/merge_facts/verbs.py:113-140` `resolve`** — `set_path(entry, field, chosen.get("value"))`, then `status` and `updated_at`. No companion field, no statement. Evidence: F-00055/F-00057 `unit_ref`; F-00055/F-00057/F-00305/F-00306 statements.

**`code-repo/engine/merge_facts/apply.py:598`** — `match["valid_to"] = incoming.get("valid_from")`. F-00301 carries `valid_from: null`, so F-00300 kept `valid_to: null`, `retired: false`, and `merge_facts/__init__.py:37 is_open()` returns True for it.

**`code-repo/schemas/facts-delta.schema.json`** — the only `enum` in the file is `$defs/issue/properties/kind`. `$defs/entry` gives item `required: [category, unit]`, measurement `required: [quantity, unit]`, record `required: [medium, role, location]` with no value constraints. `verbs.py:76-79 _KIND_REQUIRED_KEYS` mirrors the same presence-only rule. Consequences that validated clean: 132 invented item categories, 13 numeric `quantity` values, and record F-00295 `role: "checklist"` outside `log|reference|mirror|report|config`.

**`merge facts audit` live run** — 88 findings: `row_gone` 62, `unconsumed_constant` 15, `unknown_role` 7, `duplicate_output` 4. Grep for any id in F-00002..F-00140 or F-00296..F-00308 returns nothing. (Aside, outside this audit's scope: the 62 `row_gone` findings all name mirror-tab records against workbooks `1shXFbKy…` and `1Kk0lA8h…`, and 70 of 156 records are `role: mirror` — consistent with the user's "mirror tables recorded at all" complaint.)

**`audit.py:727` `_unit_raw_uncovered`** — checks `unit_raw` coverage against the units record; `grep -c unit_raw` returns 0 for items.json, measurements.json and records.json.

---

## Prompt / spec evidence for the root causes

`data-repo/.claude/agents/quantify.md:246-256` is the only place the agent is told what `data` must contain:

| `kind` | `data` requires |
|---|---|
| `item` | `category`, `unit` |
| `measurement` | `quantity`, `unit` |

Names only. No enum for `category`, no statement that `quantity` is a kind-of-quantity, no mention of `group`, `pack`, `units[]`, `tracked`, `state`, `place`. Line 235 defers to the spec: "authoritative on the exact shape and is worth checking before you write, especially for a kind you touch rarely" — a 1,500-line document, consulted by an agent already at its output-token ceiling.

`agents/quantify.md:102` — "a hedged value is `unknown` with the candidates as accounts". The agent obeyed exactly; the gate then escalated the hedge to a human.

Spec line 538 — "**`statement` is the entry's explanation** … the first thing a reviewer reads before the one tick of QF-24 … for an item, what it is." The audience named is the reviewer, and nothing says the statement must stand without its source or must not cite a locator. 139 provenance sentences are the predictable result.

Spec §8's ordered classification ladder (line 1085) never appears in the prompt; `agents/quantify.md:105` reduces it to "Classify with §8 in order".

---

## Proposed KEEP set

**Items — keep 136 identities (139 − 3 exact duplicates); 0 are usable as written.**

Per-entry rework needed:
1. Rewrite all 139 statements to say what the thing *is* («پنیر موزارلای پیتزا، ماده اولیه انبارگردانی‌شده بر حسب کیلوگرم، کد ##1») — provenance already lives in `source[]`.
2. Remap `category` to the spec's 6 values and move the food taxonomy to `group` (`menu_item` → `product` + `group: pizza_americai`; `meat|dairy|vegetable|sauce|dough|pasta|oil|bread|prepared` → `ingredient` + `group`).
3. Narrow `scope.branches` on the 52 unevidenced items to `[chalebagh]`, or mark them `field_status: data/../scope: inferred` if the both-branch claim is deliberate.
4. Split the code out of the 69 menu-item titles; delete the 45 title+code aliases.
5. Fill `pack`/`units[]` for the 14 beverages, the parmesan, the bacon, the gouda and the penne from F-00300..F-00305, then delete those measurements.
6. Recover the 8 null units from the BOM columns that carry the same materials.

Highest-value subset a developer would use today without rework — the 6 entries carrying knowledge not derivable from the sheet: F-00044 (مینی مک code collision), F-00060 (##36 two titles), F-00071 (uncoded cheese column), F-00080/F-00132 (#27 collision, keys tab-bound), F-00055/F-00057 (unit ambiguity with both readings preserved).

**Measurements — keep 0 as `measurement`.**

| destination | entries |
|---|---|
| → `rule`, `inputs: []`, `nature: observed` | F-00296, F-00297, F-00299, F-00303 |
| → `item.units[]` / `item.pack` | F-00301→F-00019, F-00302→F-00027, F-00304→F-00022, F-00305→F-00069 |
| → source/account on an existing BOM cell | F-00307 → `F-00176 /data/rows/dish_7/item_24` |
| → `item.tracked` (item must be minted first) | F-00308 |
| → retire | F-00298, F-00300 |
| → drop | F-00306 |

Net: 13 entries → 4 constants + 4 item payload enrichments + 1 cell source + 1 tracked note + 2 retirements + 1 deletion. The `measurement` kind ends this department empty, which is the honest outcome: nothing in the run captured a capture event.

---

## Intermediate files
`/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/items.tsv` (139 rows: id, key, title, code, category, unit, branches, alias count, aliases, status, source count, source type, statement)
`/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/audit.txt` (88 findings from the live `merge facts audit` run)