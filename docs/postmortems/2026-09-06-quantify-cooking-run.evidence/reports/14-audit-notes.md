# audit:notes

## summary
All 22 notes were audited against spec §7/§8 and the purpose test. Only 1 of 22 (F-00486, "the kitchen has no conversion form") is genuinely a note; 18 are entries that spec §8 routes to a different kind (rule 3/4/8/11, item.tracked, record.fields[].description, issues[]/unknown), and 3 are droppable trivia (F-00465 a cell comment whose whole text is "149"; F-00475 whose only datum is a meeting time; F-00485 carton vent holes). There is exactly one branch-split duplicate pair, F-00466 (naharkhoran, from the sheet) / F-00473 (chalebagh, from a transcript) — both document the same two columns of the same tab shape — plus a three-way split of one waste policy across F-00470/471/472. The proximate causes are all mechanical and all verifiable: 20 of the 22 notes came from a single delta part (parts/facts-delta-B8.json — the transcript pass, which emitted 20 notes but only 4 rules and 13 measurements), so `note` was effectively that pass's default kind; the delta schema constrains a note's data to `{"type":"object"}`, i.e. nothing, so validate can never push back; `apply.py:336` explicitly exempts notes from the title-twin duplicate guard; and the audit's `recurring_note_shape` detector needs 0.70 Jaccard overlap while the highest actual overlap in the file is 0.221 (F-00466/F-00473) — so the QF-13 promotion machinery is inert and Stage C was shown zero note findings. Two deeper faults sit under those: spec §7 says a note's key is "the statement hash (QF-32)" but the QF-32 key table has no note row and nothing in `merge` derives one, so re-running produces new notes instead of no-ops; and the kinds the notes should have gone to are themselves unenforced — `item.tracked` is used by 0 of 139 items, `fields[].description` by 0 record fields, and 0 of 13 measurements carry `by`/`when`/`writes_to` while F-00469 (a note) carries all three. The scan of rules.json/records.json found the same failure at scale: 10 rule families of 8 byte-identical `expr` rules each (one per line × branch), 70 mirror records, and four housekeeping entries (Refresher ×2, SheetsFileIDs ×2, onOpen/triggerRecalculation ×4) that the spec's own Appendix A ordered into existence.

## problems
- [high/validator] note's data payload is schema-unconstrained — validate can never reject a note :: code-repo/schemas/facts-delta.schema.json, the entry oneOf: `{ "properties": { "kind": { "const": "note" }, "data": { "type": "object" } } }`. Every other kind has a required list (item: category+unit; record: medium+role+location; measurement: quantity+unit; rule: inputs+outputs). Any object at all
- [high/spec] §8's rule 13 is a catch-all with no negative test, and the transcript pass took it 20 times :: runs/facts/cooking/20260902-080737/parts/facts-delta-B8.json contains 39 entries: note 20, measurement 13, rule 4, record 2. The other seven passes produced 2 notes total (B1: 1, B2: 1). 28 of the 33 source entries across all notes are `type: voice`. Spec line ~1128: '13. None of the above → note.'
- [high/orchestration] Branch-split duplicate F-00466 / F-00473 — the same two columns documented twice, once per pass and per branch :: F-00466 `ashpazkhne_naharkhoran__off_ejraei__tedad_nafar_kasb_shode` (from parts/facts-delta-B2.json, source sheet 1AuKUUFs…!OFF اجرایی!B2:D5, scope branches [naharkhoran]) and F-00473 `off_ejraei__mani_do_sotoon` (from parts/facts-delta-B8.json, source voice cooking-1405-05-26.txt:31, scope branche
- [high/engine] apply.py exempts notes from the only duplicate guard in the engine :: code-repo/engine/merge_facts/apply.py:336 — `if entry["kind"] != "note":  # QF-34` guards the `_title_twin` check. Notes therefore bypass the title-twin precondition entirely; F-00466 and F-00473 were applied without a word.
- [high/spec] The note statement-hash key that §7 promises does not exist in QF-32's table or in merge :: Spec line 1073 (§7 `note`): 'title = the first 60 characters of statement, key from the statement hash (QF-32) so a re-run over the same delta is a no-op'. The QF-32 key table (spec lines ~366-380) has rows for sheet record, paper/external record, workbook stub, record column, record row, item, meas
- [high/engine] audit's recurring_note_shape threshold is unreachable for the notes this agent writes :: code-repo/engine/merge_facts/audit.py:48 `NOTE_OVERLAP = 0.7`. Running audit(data-repo) now returns Counter({'row_gone': 62, 'unconsumed_constant': 15, 'unknown_role': 7, 'duplicate_output': 4}) — zero recurring_note_shape. Highest actual pairwise token overlap among the 22 notes is 0.221 (F-00466/F
- [high/agent-prompt] item.tracked is used by 0 of 139 items — the 'we don't count X, because…' content became prose notes instead :: 0 of 139 entries in facts/items.json carry `data.tracked`. Spec §7 item: '`tracked` records the "we do not measure X, because…" content of the transcripts as data.' Prompt obligation 5 names '`item.tracked` exceptions'. That content is instead spread across F-00468 (~18 items listed in one Persian s
- [high/spec] measurement/note inversion: 0 of 13 measurements say who captures what, when — the one entry that does is a note :: facts/measurements.json: `by` 0/13, `when` 0/13, `writes_to` 0/13, `method` 1/13. All 13 are quantities of items (F-00296 کاست وزن مرغ 30%, F-00307 ۱۰ لقمه در هر پرس) — i.e. §8 rule 8 constants. Meanwhile F-00469 (a note) carries exactly the measurement payload: start 01:15, by سرلاین, method وزن‌گی
- [medium/agent-prompt] record fields[].description is used by 0 record fields — column-meaning notes are orphaned from the columns :: F-00143 and F-00156 (OFF اجرایی, both branches) each declare fields date/target_count/achieved_count/notes with `description: None` on every one; the same for F-00145 (خمیر), F-00144 (نیازمندی‌ها), F-00141 (سنجش کیفیت). The meanings of those exact columns live in notes F-00466, F-00473, F-00476, F-0
- [medium/data-quality] issues[] and unknowns attached to notes instead of to the entries they concern :: F-00480 carries the only `issues[]` in notes.json — a `kind: junk` warning that the last 1–2 months of numbers in the central report are unreliable — with `affects: [F-00182, F-00183, F-00184, F-00185]`, but the issue sits on the note, not on those four records. F-00476 records that nobody knows whe
- [high/data-quality] Per-line, per-branch rule explosion: 10 families of 8 rules with byte-identical expr :: Grouping rules.json titles with line/branch words stripped: 8 members each for روز از تب تاریخ (F-00337, F-00349, F-00361, F-00370, F-00410, F-00422, F-00434, F-00443), ماه, سال, موجودی اول شب, دریافت از انبار, موجودی آخر شب, مصرف اعلامی, انحراف (F-00345, F-00357, F-00369, F-00378, F-00418, F-00430,
- [high/data-quality] 24 rules record where a date cell reads from; 16 rules have a bare identifier as their whole expr :: F-00337 «روز تب پیتزا از تب تاریخ», statement «سلول B4 تب پیتزا روز تاریخ گزارش را مستقیم از سلول C5 تب «تاریخ» می‌خواند», data.expr = "ruz", original_ref null. 16 rules have an expr matching ^[a-z_0-9]+$: F-00337, F-00338, F-00339, F-00349, F-00350, F-00351, F-00359, F-00361, F-00362, F-00363, F-00
- [high/spec] Housekeeping entries the spec itself ordered into the store :: Spec Appendix A line 2113: 'hidden id registries, `Refresher` trigger cell | `record role: config` / `note` | forced | a volatility trigger has no semantics worth a kind; it is documented, not modelled'. Store: F-00180 and F-00238 (Refresher, one cell holding a unix ms timestamp 1783786014375), F-00
- [high/validator] Vocabularies frozen in prose only — the agent invented 11 item categories and a new medium and role :: Spec §7: item `category` is `ingredient | product | packaging | consumable | place | other`; record `medium` is `sheet | paper | external | native`; `role` is `log | reference | mirror | report | config`. facts-delta.schema.json contains no occurrence of 'ingredient' or 'consumable' and no enum for 
- [high/data-quality] The purpose test's own example fails on every item: 0 of 139 carry pack or units[] :: facts/items.json: `data.pack` present on 0 of 139, `data.units` on 0 of 139, `data.state` on 0 of 139. Units are portion 71, pcs 31, kg 19, g 10, null 8. Meanwhile the pack facts exist in the store as measurements and notes: F-00302 (پاستا پنه 1.2 kg pack, 5 portions, 240 g each), F-00304 (30-slice 
- [medium/agent-prompt] Prompt obligation 2 makes a note out of every cell comment, unconditionally :: quantify.md line 84 / spec line 1432: 'per cell comment a constant rule or note with `source.type: comment`'. attachments/sheets/.dump/19jHmcKHJm8…/comments.tsv has exactly two rows, both text `149`, author `unknown` (موجودی اول شب!F37, موجودی آخر شب!D36). That produced F-00465, whose own statement 
- [medium/output-format] Note prose cites tabs, cells and filenames — the artefact the facts were meant to replace :: 12 of 22 note statements name a tab, column or cell («تب», «ستون», «سلول»); F-00465 names Kanter.xlsx plus F37 and D36; F-00466 names Ashpazkhne - Naharkhoran.xlsx and a B2:D5 range; F-00479 names سلول L13. Sources already carry every one of those locators structurally (source[].ref/sheet/cell), so 
- [medium/output-format] Verbatim colloquial speech carried into statements :: F-00476: «این نیست بگیم ۱۰۰ تا تولید کن، چون خمیرمون روزانه است» and «همونو می‌زنیم توی لیست این که چند تا فروش رفته»; F-00480: «توی بازه یکی دو ماه اخیر روی این سیستم خیلی حساب نکنید»; F-00479: «خود سیستم هم تلرانس در نظر می‌گیره، یعنی تو سیستم خودش حساب می‌کنه…»; F-00467: «سه بسته است، هر کدام هزا
- [medium/data-quality] Note scope is lopsided by which source happened to mention it, not by where the fact holds :: Branch scopes across the 22 notes: chalebagh only 19, both branches 2, naharkhoran only 1. The three transcripts (cooking-1405-05-26, -05-26-02, -06-01) are chalebagh meetings, so every transcript-derived note inherited chalebagh. F-00473 (chalebagh, from voice) and F-00466 (naharkhoran, from the sh
- [medium/orchestration] Stage C's human gate had nothing to show about notes :: SKILL.md Stage C (line 530) 'Audit review (STOP, per item)' runs `merge facts audit` and offers resolve/retire/promote — line 585: 'promote (a note that turned out to be another kind)'. The audit run today returns 88 findings: row_gone 62, unconsumed_constant 15, unknown_role 7, duplicate_output 4. 

## details
## A. Per-note verdicts (all 22)

Legend for the verdict column: **(1)** should have been another kind · **(2)** duplicate split by branch/source · **(3)** worthless trivia, drop · **(4)** genuinely a note.

| id | key | title | source | verdict | where it belonged |
|---|---|---|---|---|---|
| F-00465 | `kanter__mojudi__comment_149` | کامنت «149» روی ستون نوشابه قوطی مشکی در فایل کانتر | comment 19jHmcKHJm8…!موجودی اول شب!F37 + !موجودی آخر شب!D36 | **(3) drop** | nowhere |
| F-00466 | `ashpazkhne_naharkhoran__off_ejraei__tedad_nafar_kasb_shode` | معنای ستون‌های تعداد در تب OFF اجرایی | sheet 1AuKUUFs…!OFF اجرایی!B2:D5 | **(1)+(2)** | `F-00156.data.fields[achieved_count].description` + `field_status: inferred` |
| F-00467 | `amargiri_mande__meyar_entekhab_aghlam` | معیار انتخاب اقلام برای آمارگیری مانده و انبارگردانی | voice cooking-1405-05-26:55-62, :137 | **(1)** | **rule `lang: text`** + constant for the (unstated) threshold — §8 names this exact case |
| F-00468 | `mande_shab__aghlam_bedun_amar` | اقلامی که سفارش داده می‌شوند ولی مانده آن‌ها ثبت نمی‌شود | voice :122-137, :206-262 | **(1)** | `item.tracked[{record, value:false, reason}]` on ~18 items |
| F-00469 | `mande_shab__ravesh_amargiri` | روش آمارگیری مانده آخر شب | voice :92-104 + process cooking-030 | **(1)** | **measurement** (`when: 01:15`, `by: سرلاین`, `method`, `writes_to: F-00147..153/end_stock`) |
| F-00470 | `zayeat__do_masir_sabt` | دو مسیر ثبت ضایعات: فیش ضایعات و فرم ضایعات | voice :20-30, :394-396, 06-01:65-78 | **(1)** | **rule `lang: table`** — discriminator «محصول؟» → two documented routes |
| F-00471 | `ghazaye_bargashti__asar_bar_amar` | اثر فیش ضایعات غذای برگشتی بر آمار | voice 06-01:65-78 | **(1)** | **rule `lang: text`** — a correction term in the consumption reconciliation (belongs beside F-00345's family) |
| F-00472 | `test_ghaza__ravand_sabt` | ثبت تست غذا | voice :388-408 | **(1)** | **rule `lang: text`** + an absence marker on F-00142 («فرم کاغذی ندارد») |
| F-00473 | `off_ejraei__mani_do_sotoon` | معنای دو ستون تعداد در تب OFF اجرایی | voice :31 | **(2)+(1)** | duplicate of F-00466; belongs as `F-00143.fields[target_count/achieved_count].description` |
| F-00474 | `sanjesh_keyfiyat__meyar_darjebandi` | معیار درجه‌بندی سنجش کیفیت | voice :16-18 | **(1)** | §8 **rule 4** — `F-00141.fields[sanjesh_keyfiyat].constraints.enum` + `grain` («نقص در سطح بخش، نه یک وعده») |
| F-00475 | `niazmandiha__peygiri_jalase_baad` | پیگیری نیازمندی‌ها و مشکلات در جلسه روز بعد | voice :31 | **(3) drop** | its only datum, `meeting_time: 18:18`, folds into `F-00144.data.cadence`/process docs |
| F-00476 | `khamir__mani_sotoonha` | معنای اعداد تب خمیر | voice :31 | **(1)** | an **unknown** — §8 rule 12 / QF-6: `field_status` + `issues[]` on F-00145's three columns |
| F-00477 | `kanter__sabt_delester_yekparche` | تفکیک دلستر در آمار کانتر | voice :46-51 | **(1)** | **rule** (aggregation ##368+##754+##757 → «دلستر و لیموناد» row in F-00185); the "should be split in future" half is a change request, not a fact |
| F-00478 | `enheraf__astane_barresi_va_elal` | آستانه بررسی انحراف و علت‌های محتمل آن | voice 06-01:1-32 | **(1)** | **constant rule** (~300 units → recount) + `edge_cases[]` on the eight انحراف rules. Most useful number in the file, currently unreachable from F-00345 |
| F-00479 | `tolerance__dalil_va_kaarbord` | چرایی ستون‌های تلورانس در گزارش مرکزی | voice :173-182 + sheet 1shXFbKy…!پیتزا!L13 | **(1)** split | rationale → `reason`/`edge_cases` on F-00332..336; «استیک ##8 تلورانس ندارد» → `issues[]`/unknown. The physical basis already exists as data: F-00296 (کاست وزن مرغ 30%), F-00297 (خونابه استیک 70–90 g/kg) |
| F-00480 | `gozaresh_markazi__por_shodan_va_barresi` | پر شدن و بررسی گزارش مرکزی | voice 06-01:34-64, :328-336 | **(1)** split | `reviewed_by: سرپرست شعبه` → F-00182..185; the `issues[]` it already carries (`kind: junk`, last 1–2 months unreliable) belongs **on those four records**, not on the note |
| F-00481 | `tedade_forush__manba_va_bargozari` | منبع جدول تعداد فروش و روش بارگذاری آن | voice :308-320 | **(1)** | `record medium: external` for سپیدز POS with `identifier_scheme` — the store has **0** external records; the multiplication half is already F-00344/F-00328 |
| F-00482 | `bein_bakhshi__enteghal_aghlam_beyn_layn` | انتقال اقلام بین لاین‌ها و اثر آن بر آمار | voice :12, :140-146, :262-270 | **(1)** | `record.movement {from, to, reason}` with `place` items — the store has **0** `place` items, so the shape was unavailable |
| F-00483 | `qarch_sokhari__standard_size_va_bargasht` | استاندارد اندازه قارچ سوخاری و سرنوشت قارچ نامناسب | voice :262 | **(1)** split | «مانده شب ثبت نمی‌شود» → `item.tracked` on F-00053; رجکت→قارچ اسلایس → conversion **rule** F-00053→F-00059; the size standard is process-doc prose |
| F-00484 | `nan__sefaresh_va_amar` | سفارش و آمار نان | voice :254-258, :274 | **(1)** | `item.tracked` on F-00024/F-00025; «بسته ۴۰ کیلویی» → `item.pack`/`units[]` on the flour item; the ordering path is process-doc prose |
| F-00485 | `sokhari__karton_surakh_havakesh` | سوراخ‌های هواکش و نام‌گذاری کارتن سوخاری | voice 05-26-02:18-41 | **(3) drop** | `vents_per_carton: 3`, `names_on_carton: 6` → item F-00063 data; the double-check procedure is a work instruction |
| F-00486 | `ashpazkhne__nabudan_form_tabdil` | نبود فرم تبدیل در آشپزخانه و استثنای آن | voice :4-11 | **(4) keep** | A negative fact — «this record does not exist in this department», with a named exception every 3–4 months. Stops a developer hunting for a form that isn't there. The only one of 22 that passes the purpose test as a note. |

Tally: **(1) 18 · (2) 1 pair (F-00466/F-00473) · (3) 3 · (4) 1.**

Secondary duplication, not branch-split: **F-00470 / F-00471 / F-00472** are one policy — "what leaves the count, and by which document" — cut into three notes (token overlaps 0.158–0.198). F-00483 and F-00484 both re-derive the F-00468 `tracked` content for their own items.

## B. Which pass wrote which note

| part | entries | kinds | notes |
|---|---|---|---|
| B1 | 67 | item 52, record 13, rule 1, note 1 | F-00465 |
| B2 | 18 | record 13, rule 4, note 1 | F-00466 |
| B3 | 100 | item 87, record 12, rule 1 | — |
| B4 | 81 | record 8, rule 73 | — |
| B5 | 50 | record 50 | — |
| B6 (+B6-rules-fixed) | 80 / 64 | rule 73 / rule 64 | — |
| B7 | 50 | record 50 | — |
| **B8** | **39** | **note 20, measurement 13, rule 4, record 2** | the other 20 |

B8 is the transcript pass. It emitted more notes than every other kind combined. That single number is the shape of the problem: read three meeting transcripts, produce 20 notes and 4 rules.

## C. Note-level style measurements

- 28 of 33 total source entries across notes are `type: voice`; only 2 are `sheet`, 2 `comment`, 1 `process`.
- statement length 135–683 chars, mean ≈ 400.
- 12 of 22 statements name a tab/column/cell in prose; 2 name an `.xlsx`; 2 name a cell address (F-00465 F37/D36, F-00479 L13).
- 5 carry verbatim quoted speech longer than 25 chars.
- branch scope: chalebagh-only 19, both 2, naharkhoran-only 1.
- `issues[]` on 1 note (F-00480), `accounts[]` on 0, `field_status` on 2 (F-00466, F-00486).
- `data.about` refs resolve to: records ×14 notes, items ×5, rules ×2 — i.e. 21 of 22 notes point at an entry that could have carried them.

## D. Spec/prompt clauses that caused this

1. **§8 rule 13** (spec:1128) — `None of the above → note`, an unconditional else after twelve positive tests, with no negative test and no "prefer an edit to an existing entry over a new note".
2. **§7 `note` — the escape hatch** (spec:1069-1080) — "Free `data` (no required keys); the `statement` … is here the whole content". Encoded verbatim as `"data": {"type": "object"}` in facts-delta.schema.json, so the note kind has the loosest gate of the five while being the one that needs the tightest.
3. **§7's note key rule** (spec:1073) — "key from the statement hash (QF-32)". QF-32's table (spec:366-380) has no note row; `merge_facts/apply.py` derives keys only for measurements and rows. So the idempotence claim ("a re-run over the same delta is a no-op") and the audit's recurring-shape story both rest on unimplemented machinery.
4. **QF-13 promotion** (spec:1076-1080) — the whole correction path is `merge facts audit` → human review → `merge facts promote`. `audit.py:560 _recurring_note_shape` needs `_shape` equality or ≥0.70 Jaccard; measured max is 0.221, all 22 shapes distinct, detector output empty.
5. **`apply.py:336`** — `if entry["kind"] != "note":  # QF-34` — notes are the one kind exempted from the title-twin precondition, so F-00466/F-00473 applied silently.
6. **Prompt obligation 2** (quantify.md:84, spec:1432) — "per cell comment a constant rule or note with `source.type: comment`", unconditional. The in-scope workbook's entire comment set is two cells both reading `149`, author `unknown` → F-00465.
7. **Prompt obligation 5** (quantify.md, spec:1440s) — "take every quantitative passage: measurements, constants …, rules …, `item.tracked` exceptions". It authorises *creating* entries from a transcript but never *editing* an entry a previous pass minted, which is what F-00466/F-00473 (a field description), F-00468/483/484 (`item.tracked`), F-00480 (an `issues[]` on four records) and F-00484 (an `item.pack`) all required.
8. **Appendix A** (spec:2112-2117) — marks 112 mirror tabs "clean", `Refresher` and id registries "forced … documented, not modelled", and 81 warehouse comments "clean". A fit table with no exclusion column reads as a coverage mandate.

## E. Rule changes that would prevent them (evidence-backed, smallest first)

1. **Give `note` a required payload.** `data: {required: ["why_not_another_kind"], properties: {why_not_another_kind: {type: "string"}}}` — a note must state which of §8's twelve tests it failed and why. On today's 22, 18 could not have written that sentence honestly. One schema line, and it is the only change that raises the cost of a note above the cost of the right kind.
2. **Invert §8's default.** Replace rule 13 with: *none of the above → do not emit an entry; record the passage in the run report's `unclassified[]` for the Stage C review.* A note becomes something a human creates by promotion, never something the agent mints. That alone removes 21 of 22.
3. **Add the missing note key row to QF-32** (`note_` + first 12 hex of sha256 of the folded statement) and implement it in `apply.py`, then delete the `!= "note"` exemption at apply.py:336 so notes get the title-twin guard too.
4. **Replace the audit's Jaccard threshold with a targeted detector set.** `_recurring_note_shape` at 0.70 is unreachable for 400-char prose. Add cheap, high-yield finding types instead — each of these fires on today's store: *note whose `data.about` names a record field* (F-00466, F-00473, F-00476 → 3), *note containing a number with a unit or a comparison* (F-00478, F-00485, F-00469, F-00467 → 4+), *note whose subject item appears in a `tracked`-shaped negative* (F-00468, F-00483, F-00484 → 3), *note pairing a record ref with a role name* (F-00480 → 1). Also lower NOTE_OVERLAP to ~0.20 or compute overlap over the title rather than the statement (F-00466/F-00473's titles are «معنای ستون‌های تعداد در تب OFF اجرایی» / «معنای دو ستون تعداد در تب OFF اجرایی» — overlap far above 0.7).
5. **Make obligation 2's comment clause conditional**: "per cell comment *that states a quantity, a decomposition or a correction*". A comment whose text is a bare number with no author yields nothing.
6. **Make the transcript pass an editing pass.** Obligation 5 should read: for each quantitative passage, first look for the entry it belongs to (`item.tracked`, `record.fields[].description`, `rule.edge_cases`, an `issues[]` on the affected entry) and emit an edit; only a passage with no home at all is reported as unclassified. This requires the transcript pass to run last and to see the whole store — which it did (B8 was last) — so it is a prompt change, not an orchestration one.
7. **Enforce §7's vocabularies as enums in the schema** (item.category, record.medium, record.role). Today: 11 invented item categories, `medium: "app"`, `role: "checklist"`, and 0 `place` items — which is precisely why F-00482's movement could not be modelled.
8. **Give `measurement` the required list §7 describes** (`writes_to`, plus one of `by`/`when`). Today 0/13 have any of them and the one entry that does (F-00469) is a note.

## F. rules.json / records.json — entries that should have been notes or dropped

**Housekeeping, drop outright (8 entries):**

| id | key | what it is |
|---|---|---|
| F-00180 | `gozaresh_markazi__refresher` | one cell holding `1783786014375`, a recalculation trigger timestamp |
| F-00238 | `gozaresh_naharkhoran__refresher` | same, other branch |
| F-00186 | `gozaresh_markazi__sheets_file_ids` | Drive file ids — belongs in `attachments/sheets/manifest.json`, which already holds them |
| F-00243 | `gozaresh_naharkhoran__sheets_file_ids` | same, other branch |
| F-00330 / F-00403 | `…__gs__on_open` | adds an "Actions" menu. `port: false`, edge_case «منطق رابط کاربری گوگل‌شیت است و معادل تجاری ندارد؛ در پیاده‌سازی بیرونی لازم نیست» — the entry states its own uselessness |
| F-00331 / F-00404 | `…__gs__trigger_recalculation` | writes a timestamp into the Refresher cell |

`F-00313 amar_kanter__add_dropdown_columns` (`port: false`) is borderline — it defines the day/month/year dropdown columns, so its enum content is worth keeping as `constraints.enum` on the record; the script itself is not.

**Cosmetic conditional formatting (should be dropped or collapsed):** 20 cf-sourced rules. `F-00312` («رنگی شدن سلول‌های پرشده…», `outputs: []` — a rule with no output) is pure cosmetics. The 16 `flag_enheraf_mosbat`/`flag_enheraf_manfi` rules (F-00380..387, F-00453..460) are one sign test at zero, restated 16 times; §8 rule 5 sanctions a flag rule but §8 rule 2's "never several" was not applied across lines and branches. `F-00314` («صفر یعنی آن ماده اولیه در آن آیتم مصرف نمی‌شود») is the one cf rule worth keeping — it is a real semantic convention.

**Mirror records (70 of 156):** F-00202..F-00236 and F-00259..F-00293. Each holds `mirror_of`, an `import` block and a `named_range`, and no fields. The dependency graph they encode is one fact per source workbook (which report pulls from which file, through which named range), not one fact per tab. Collapsing them into the seven `SheetsFileId_*` edges on the two report records removes 70 entries and loses nothing — the per-tab range (`A:S`, `A:M`) is the only per-tab datum and it is recoverable from the dump.

**Rule families to collapse (≈80 → ≈10):** the ten 8-member families in problem "Per-line, per-branch rule explosion", plus 6× `مصرف واقعی` and 4× each `انحراف با تلورانس` / `انحراف به ازای هر عدد`. The 24 `روز/ماه/سال … از تب تاریخ` rules (F-00337-339, F-00349-351, F-00361-363, F-00370-372, F-00410-412, F-00422-424, F-00434-436, F-00443-445) should not exist at all — a cell reading another cell is not a computation; 16 of them have an expr that is just their own output name.

## G. Files read

- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/{notes,items,records,measurements,rules}.json`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/runs/facts/cooking/20260902-080737/{meta.json,parts/*.json}`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/attachments/sheets/.dump/*/comments.tsv`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/docs/superpowers/specs/2026-08-29-quantitative-facts-design.md` (§5 QF-32, §7, §8, §12, Appendix A)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/schemas/facts-delta.schema.json`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/engine/merge_facts/{apply.py,audit.py,verbs.py}`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/.claude/agents/quantify.md`, `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/.claude/skills/quantify/SKILL.md`