# forensic:B1

## summary
B1 did not crash and did not misbehave — it followed the quantify prompt literally and produced 67 entries in 14.5 min of work, of which 0 are measurements. Its five workbooks (Ashpazkhne-Chalebagh, Pitza, Farangi, Kanter, Sokhari) have **no `rows.tsv`** in the dump (only 10 of 28 dumps have one; QF-1 emits cells only for confirmed reference tabs), so the only data it ever saw was the 4-row `head` preview inside `sheets.json`. With structure and no values, obligation 2 of the agent prompt ("per non-empty tab one record; per `##N` code in a header an item; per cell comment a constant rule or note; per validation a constraints.enum") mechanically produces exactly what the user complained about: 52 items that are column headers, 13 records that are tabs, and the notorious note "149". 66 of 67 statements name an .xlsx file, 62 name a tab, and 51 of 52 item statements are one boilerplate sentence. It could not self-check: its tools are `Read, Glob, Write` (no Bash → no `validate`, no Edit → no targeted fix). It also self-throttled on context — it read 4 of 36 process files in full (146K chars) and then issued `limit: 5` on the other 32, seeing only their summary line and never their `nodes[]`, yet reported that no node names the remaining tabs. Validation came 2h54m later (the 8 batches ran sequentially; B1 sat idle 174 min). 10 of its 11 errors were one undocumented convention that lives only in `engine/merge_facts/content.py`, not in the schema the prompt calls "authoritative" (both writes are schema-clean under jsonschema). The fix round rewrote all 102,653 bytes (47,736 output tokens) to change 10 entries by +842 chars, and I verified it left 6 NEW errors while the agent reported "Nothing left unfixed". All 67 entries were adopted into the store (T-1001→F-00002 … the "149" note is F-00465).

## problems
- [high/spec] The five B1 workbooks have no rows.tsv — quantitative facts were structurally impossible :: `find /…/data-repo/attachments/sheets/.dump -name rows.tsv` returns 10 files out of 28 dump dirs; none of B1's five (12Q9…, 1dmH…, 1M_i…, 19jH…, 1Xy-…) has one. dump_workbook/__init__.py:788-795 writes rows.tsv only for confirmed `reference_tabs` (QF-1). B1 output: 52 item / 13 record / 1 rule / 1 n
- [high/agent-prompt] Prompt obligation 2 is a structure-transcription spec, not a fact-extraction spec :: quantify.md lines 76-90: "per non-empty tab one `record`", "per `#N`/`##N` code found in a header … an item", "per cell comment a constant rule or note", "per validation a `constraints.enum`". Output matches 1:1 — 13 tabs → 13 records, 52 header codes → 52 items, 1 cell comment → note T-1067 («149»)
- [high/output-format] Statements are sheet-location prose — 66/67 name an .xlsx file, 62 name a tab :: T-1001: «پنیر پیتزا، قلم انبارگردانی لاین پیتزا با کد ##1 که وزن مانده آن در تب‌های «موجودی اول شب» و «موجودی آخر شب» فایل Pitza.xlsx ثبت می‌شود.» — 51 of 52 items use this identical template. T-1058: «تب «موجودی اول شب» در فایل Pitza.xlsx: به ازای هر شب یک ردیف با تاریخ شمسی…». T-1067 cites cells F
- [medium/agent-prompt] The «149» cell comment became a store entry with meaning: null :: T-1067 key `kanter__mojudi__comment_149`, statement «…کامنتی با متن «149» ثبت شده است… معنای این کامنت … مشخص نیست»; data `{"text":"149","meaning":null}`. Source: comments.tsv of 19jHmc… (its entire content is two rows, both the string `149`). Now F-00465 in facts/notes.json.
- [high/validator] The rule that bit 10 entries lives only in Python, not in the schema the prompt calls authoritative :: engine/merge_facts/content.py:541-554 requires a `processes[]` link's id to appear as a `source[].ref` ending `{id}.json`. schemas/facts-delta.schema.json `$defs.source.ref` is `{"type":["string","null"]}` — no pattern, no description. quantify.md obligation 8 says only "citing that node as a `proce
- [high/validator] 'a rule with inputs carries no expr or original' is also undocumented for prose rules :: content.py:458-463. quantify.md's `data` requirements table says `rule` requires only `inputs`, `outputs`; `expr`/`original` appear once, in the sentence about formula groups (line 79-80). T-1066 was a prose rule (`lang: text`) with 4 inputs → error.
- [high/harness] Agent has no Bash — it cannot validate its own delta :: quantify.md frontmatter: `tools: Read, Glob, Write`. Transcript shows 74 Read, 2 Glob, 2 Write and nothing else. The delta was written at 18:38:49; its 11 errors surfaced at 21:34:13 via a coordinator message.
- [high/harness] Agent has no Edit — an 11-error fix cost a 47,736-token full-file rewrite :: Fix Write at 21:41:09, content 102,653 bytes / 47,736 output tokens. Diffing the two Write payloads: 10 of 67 entries changed, net +842 chars. ~98% of the fix's output tokens re-emitted unchanged content.
- [high/engine] The fix round replaced 11 errors with 6 new ones and reported success :: I ran `merge_facts.content.check_document` on both Write payloads: write1 → 11 errors, write2 → 6 errors, all new: "T-1066: expr identifier 'mojudi_avval_shab' / 'item' / 'day' / 'mojudi_akhar_shab' is not declared by inputs, outputs or a resolvable call". The agent's closing report: "Nothing else w
- [medium/validator] The FEEL identifier check drove the one real insight into a meaningless expression :: Final on-disk T-1066: `expr: "pitza_mojudi_avval_shab = pitza_mojudi_akhar_shab_prev and farangi_mojudi_avval_shab = farangi_mojudi_akhar_shab_prev and kanter_… and sokhari_…"` — four tautologies joined by `and`, whose only purpose is that every token resolves to an inputs/outputs key. The honest or
- [high/orchestration] Eight independent batches ran sequentially — B1 sat idle 174 minutes :: Timestamps: dispatch 18:25:22, delta written 18:38:50, final summary 18:39:50, then a 174.4-minute gap to the fix message at 21:34:13, done 21:41:27. Total wall 3h16m04s; actual work 14m28s + 7m14s = 21m42s (11%). The 8 batches cover disjoint workbook sets and share no state.
- [high/orchestration] Validation only after all 8 parts were concatenated — 2,068 errors found at once :: Coordinator scratchpad: errs_B1 11, errs_B2 21, errs_B3 1306, errs_B4 358, errs_B5 0, errs_B6 358, errs_B7 0, errs_B8 12, errs_nokey 2 = 2,068, all written at 21:33. B1's single undocumented mistake (`ref` without `.json`) was repeated across batches before any feedback existed.
- [medium/orchestration] The batch split is not in the playbook — it is a hand-written preamble over a whole-department prompt :: `grep -in 'batch|split|parts|parallel|sequential'` over quantify/SKILL.md (675 lines) finds only one unrelated hit. The dispatch's first 20 lines are improvised: "this is a PARTIAL pass (batch 1 of 8)", "Temp ids: use only T-1001, T-1002, … (the 1000-block)", "do not read transcripts this pass", "th
- [high/orchestration] "do not read transcripts this pass" removed the only source of quantitative values :: Dispatch: `transcript_paths: []` + "do not read transcripts this pass". B1..B7 (sheet passes) produced 0 measurements; B8 (transcripts) produced all 13 measurements in the run.
- [high/orchestration] QF-8 anchoring is unaffordable: the agent read 4 of 36 process files and skimmed 32 at limit:5 :: Glob returned 36 files (44,364 lines total). It read cooking-001/030/024/014 in full (14,507 + 47,382 + 47,107 + 37,464 = 146,460 chars in one turn) then issued `Read {limit: 5}` on the other 32 — I verified each result equals exactly the file's first 5 lines (e.g. cooking-021 result 827 chars vs fi
- [medium/data-quality] It reported a QF-8 negative it had no evidence for :: Summary: «پنج تب دیگر (زمان تحویل و سنجش کیفیت، OFF اجرایی، نیازمندی‌ها و مشکلات، خمیر) لنگر فرایندی ندارند چون هیچ گرهی آن‌ها را نام نمی‌برد» — a claim about the nodes of 36 processes when it had read the nodes of 4. Same pattern: «فایل‌های formulas/cf/names خالی بودند» for all five workbooks, but 
- [medium/output-format] The one genuine finding is a mirror, recorded as 1 rule + 8 records instead of a mirror declaration :: T-1066 states اول شب day n = آخر شب day n−1, verified against sheets.json head (Pitza اول شب 14 آذر = 34.263 = آخر شب 13 آذر; 15 آذر = 43.352 = 14 آذر). That means the «موجودی اول شب» tab is a day-shifted copy of «موجودی آخر شب». It still wrote 4 اول‌شب records with full `fields[]`, plus 26 of the 5
- [medium/output-format] Spreadsheet cosmetics and data-entry defects recorded as facts :: T-1062: «این تب دو ستون خالی در ابتدا دارد، بنابراین ستون تاریخ از C آغاز می‌شود». T-1046: «عنوان صحیح از تب «موجودی آخر شب» گرفته شده، چون عنوان همین ستون در تب «موجودی اول شب» مخدوش است». Summary reports 4 `issues[]` of kind `scale`/`column_shift`/`junk` plus a `code_collision`, and 11 item statem
- [medium/output-format] Payload bloat: fields[] is 26% of the delta, with enums and unit_refs repeated per record :: Of 76,258 JSON chars in the first Write, `fields[]` is 19,975 (26%), the day/month/year `constraints.enum` blocks (31 + 12 + 17 literal values) are 2,646 and repeat in 8 records, and `unit_ref: {ref: F-00001, row: kg}` is 2,698 repeated on nearly every field.
- [medium/data-quality] Units invented from column formatting and a 4-row sample :: 14 counter drinks plus کباب ترکی ##7، سوسیس کراکف ##25، ژامبون میکس ##22: «واحد از صحیح بودن مقادیر ستون استنباط شده است» / «از اعشاری بودن مقادیر ستون». The only values available are the 4 head rows in sheets.json. `field_status` marks these `inferred`, but the inference base is 4 of 157 rows.
- [medium/orchestration] ~100K output tokens and 2.3M cached-context tokens for 67 low-value entries :: Per-message usage: 18 API turns, 99,974 output tokens total of which 49,779 (first Write) + 47,736 (fix rewrite) = 97.5K are the same 67 entries written twice; cache_read 1,271,484; cache_creation 995,990; peak context 256,011 cache-read tokens at the fix write.
- [low/harness] Reasoning is not persisted — 14 thinking blocks with empty text :: Raw jsonl thinking blocks have keys ['type','thinking','signature'] with `len(thinking) == 0` and a 396-char signature, 14 occurrences. The two long silences (3.5 min at 18:27:35→18:31:03, 6.7 min at 18:32:08→18:38:49) have no recoverable content.
- [medium/orchestration] No plan, no outline, no incremental write — one 87KB Write at the end :: Between the last input Read (18:31:14) and the Write (18:38:49) there is exactly one assistant line, «Now I'll write the delta.» (18:32:08), then 6m41s of generation. No TodoWrite, no draft, no per-workbook file. Same shape in the fix round: read errs (21:34:20) → 6m37s → full rewrite (21:41:09).
- [low/orchestration] It read an input it was not given: the 30KB manifest covering 23 out-of-scope workbooks :: Read of `attachments/sheets/manifest.json` at 18:26:28 (6,974 chars returned). The dispatch's Inputs section lists only dump_paths, process_paths, facts_index and NAMED_FUNCTIONS.md-as-orientation; manifest.json is not among them and it names all 28 workbooks and both branches.
- [low/ux] It did not re-read the schema in the fix round despite being told to :: Coordinator message: "How to fix each class (the schema file is authoritative — re-read it)". The fix round's only Read is errs_B1.txt at 21:34:20; the next tool call is the Write.

## details
## 0. Identity

- Transcript: `/home/lili/.claude/projects/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-data-repo/ffa1efdd-cf44-4caa-b4e3-9b3853970a43/subagents/agent-ab4a169f8d48fbaf3.jsonl` (182 lines, 929,447 bytes)
- Model `claude-opus-5`, Claude Code 2.1.258, tools `Read, Glob, Write` (from `data-repo/.claude/agents/quantify.md` frontmatter)
- Batch B1 = چاله‌باغ station workbooks, branch `chalebagh`, dept `cooking`, temp-id block T-1001…
- Output: `data-repo/runs/facts/cooking/20260902-080737/parts/facts-delta-B1.json`
- **It did not crash.** Both Writes ended `stop_reason: tool_use`. Peak single-turn output 49,779 tokens (78% of the 64K ceiling).

## 1. Inputs handed vs. actually read

Dispatch listed: 5 dump dirs, 0 transcripts, 0 images, 0 scripts, `departments/cooking/processes/*.json` (glob), `facts/.index.json`, the schema path.

**74 Read calls, 2 Glob, 2 Write. One re-read (cooking-032).**

| Order | What | Calls | Bytes/notes |
|---|---|---|---|
| 1 | `schemas/facts-delta.schema.json` | 1 | 6,614 B — read first, as instructed |
| 2 | `facts/.index.json` | 1 | 619 chars; store held only F-00001 (`units`) |
| 3 | 5 dump dirs | 31 | sheets.json ×5, meta.json ×5, formulas.tsv ×5, validations.tsv ×5, comments.tsv ×5, cf.tsv ×5, **names.tsv ×1** |
| 4 | `attachments/sheets/manifest.json` | 1 | not an input of this pass; 28 workbooks, 2 branches |
| 5 | Glob `departments/cooking/processes/*.json` | 1 | 36 files |
| 6 | `departments/cooking/order.json` | 1 | |
| 7 | 4 process files **in full** | 4 | cooking-001 (14,507 ch), cooking-030 (47,382), cooking-024 (47,107), cooking-014 (37,464) = **146,460 chars in one turn** |
| 8 | 32 process files at **`limit: 5`** | 32 | first 5 lines only = id/department/name/summary; **no `nodes[]`** |
| 9 | cooking-032 re-read `offset:400 limit:600` | 1 | 19,105 chars — the only targeted follow-up |
| 10 | Glob `facts/*`, Read `facts/records.json` | 2 | to see F-00001's shape |

Verification of the limit:5 truncation: returned chars ≈ file's first-5-lines chars (cooking-021 827 vs 813; cooking-025 3,026 vs 3,012; cooking-034 106 vs 92; cooking-002 1,818 vs 1,804). It is the agent's own `limit` parameter, not a harness truncation.

**What the dump does not contain:** `find .dump -name rows.tsv` → 10 files across 28 dump dirs, **none for B1's five**. `dump_workbook/__init__.py:788-795` writes rows.tsv only for confirmed `reference_tabs` (QF-1). So the entire numeric evidence base for B1 was the 4-row `head` array inside each tab's `sheets.json`.

## 2. Wall clock

| Stage | Start → End | Duration | Doing |
|---|---|---|---|
| Dispatch | 18:25:22 | — | prompt received |
| Schema + index | 18:25:24 → 18:25:26 | 4 s | 2 reads |
| 5 workbook dumps | 18:25:31 → 18:26:22 | 51 s | 31 reads |
| Manifest / glob / order | 18:26:28 → 18:26:35 | 7 s | 3 calls |
| 4 full process files | 18:26:41 → 18:26:43 | 2 s | 146,460 chars |
| 32 process files @limit 5 | 18:26:56 → 18:27:35 | 39 s | 2 batches (20 + 12) |
| **silent gap** | 18:27:35 → 18:31:03 | **3.5 min** | no tool calls, thinking not persisted |
| cooking-032 window + facts/records | 18:31:05 → 18:31:14 | 9 s | 3 calls |
| «Now I'll write the delta.» | 18:32:08 | — | |
| **generating the delta** | 18:32:08 → 18:38:49 | **6 min 41 s** | 49,779 output tokens, 102,653 B |
| Persian summary | 18:39:50 | — | pass done, 14 min 28 s elapsed |
| **idle** | 18:39:50 → 21:34:13 | **2 h 54 min 23 s** | coordinator running B2..B8 sequentially |
| Fix message + read errs | 21:34:13 → 21:34:20 | 7 s | 1 read (932 chars) |
| **regenerating whole file** | 21:34:32 → 21:41:09 | **6 min 37 s** | 47,736 output tokens |
| Fix report | 21:41:27 | — | |
| **Total** | 18:25:22 → 21:41:27 | **3 h 16 min 04 s** | of which 21 min 42 s (11%) is work |

## 3. How it built the delta

- No plan, no todo list, no outline, no per-workbook draft. One line of prose («Now I'll write the delta.»), then a single `Write` of the complete 67-entry document.
- Same in the fix round: read the error list, then rewrite all 67 entries.
- **It never self-checked**, and could not: `tools: Read, Glob, Write` — no Bash, so `validate facts-delta` was unreachable. It did read the schema first (18:25:26), which is the only check available to it, and both payloads are in fact schema-clean (jsonschema Draft202012Validator → 0 errors on write1 and write2). All 11 errors were `merge_facts/content.py` cross-field checks the schema does not encode.

## 4. Entries produced

| kind | count |
|---|---|
| item | 52 |
| record | 13 |
| rule | 1 |
| note | 1 |
| **measurement** | **0** |
| total | 67 |

`source[]` types: sheet 106, process 10, validation 2, comment 2. 10 of 67 entries carry `processes[]` — all pointing at cooking-030 (9) or cooking-032 (1), the only two processes whose nodes it read.

## 5. Sample statements vs. the user's complaints

| id | statement (abridged) | complaint hit |
|---|---|---|
| T-1001 | «پنیر پیتزا، قلم انبارگردانی لاین پیتزا **با کد ##1** که وزن مانده آن در تب‌های «موجودی اول شب» و «موجودی آخر شب» **فایل Pitza.xlsx** ثبت می‌شود.» | cites sheet+tab; non-quantitative; template repeated 51× |
| T-1028 | «نوشابه قوطی مشکی … **واحد از صحیح بودن مقادیر ستون استنباط شده است.**» | unit invented from formatting of 4 sample rows |
| T-1043 | «مینی مک … ستون آن **فقط در تب «موجودی آخر شب»** فایل Kanter.xlsx وجود دارد…» | pure spreadsheet structure |
| T-1053 | «تب روزانه «زمان تحویل و سنجش کیفیت» **در فایل Ashpazkhne - Chalebagh.xlsx**: به ازای هر تاریخ یک ردیف…» | tab-as-fact |
| T-1058 | «تب «موجودی اول شب» در فایل Pitza.xlsx: به ازای هر شب یک ردیف با تاریخ شمسی تفکیک‌شده (روز، ماه، سال)…» | end-of-night inventory of a line, recorded as a fact |
| T-1062 | «**این تب دو ستون خالی در ابتدا دارد، بنابراین ستون تاریخ از C آغاز می‌شود.**» | Excel cosmetics |
| T-1046 | «عنوان صحیح از تب «موجودی آخر شب» گرفته شده، چون عنوان همین ستون در تب اول شب **مخدوش** است.» | typo repair as a fact |
| T-1066 | «موجودی اول شب هر قلم … همان مانده آخر شب همان قلم در شب گذشته است؛ … برای نمونه در فایل Pitza … هر دو ۳۴٫۲۶۳ است.» | the one real insight — but it proves the tab is a **mirror**, and still cites the sheet |
| T-1067 | «کامنتی با متن **«149»** … معنای این کامنت … مشخص نیست» | the trivia note; now F-00465 in the store |

Counts over the 67 statements: **66 name an .xlsx file**, **62 name a tab**, **51/52 items share one boilerplate sentence**, 11 items say «ستون در زمان استخراج خالی بوده».

T-1066's number is checkable and correct against `sheets.json.head` (Pitza اول‌شب 14 آذر D = 34.263 = آخر‌شب 13 آذر D; 15 آذر 43.352 = 14 آذر) — which also shows the اول‌شب tab is a day-shifted copy of آخر‌شب, i.e. a mirror that got 4 more `record` entries anyway.

## 6. Fix round (measured)

Coordinator message 21:34:13: "11 content errors", plus 2 more printed under a key. Error classes:

```
T-1054, T-1058..T-1066 (10×): processes[] link to 'cooking-0NN' has no process-type source naming its file
T-1066:                        a rule with inputs carries no expr or original
```

- Fix cost: **6 min 37 s, 47,736 output tokens, entire 102,653-byte file rewritten.**
- Actual change: **10 of 67 entries, +842 chars net.** ~98% of the output tokens re-typed unchanged content.
- Change 1: `"ref": "cooking-030"` → `"ref": "departments/cooking/processes/cooking-030.json"` (×9) and `cooking-032.json` (×1). Node ids and quotes unchanged; it extended the T-1058 quote to be verbatim.
- Change 2: T-1066 gained `"lang": "feel"` + `"expr": "mojudi_avval_shab(item, day) = mojudi_akhar_shab(item, day - 1)"`, and it explicitly declined to invent an `original`: *"there is no formula anywhere in these five workbooks (`formulas.tsv` is empty in all of them) … inventing one would violate INV-3."* — good judgement.
- **Verified regression:** running `merge_facts.content.check_document` myself → write1 = 11 errors, write2 = **6 errors**, all new (`expr identifier 'mojudi_avval_shab' / 'item' / 'day' / 'mojudi_akhar_shab' is not declared…`) because its `inputs[]`/`outputs[]` members carry `from`/`writes_to` but no `key`. Its report said "Nothing left unfixed."
- A **third** round (file mtime Sep 3 01:22, after the subagent ended) produced the passing but hollow `expr: "pitza_mojudi_avval_shab = pitza_mojudi_akhar_shab_prev and farangi_… and kanter_… and sokhari_…"`. On-disk B1 now validates with 0 errors.

## 7. Tokens

| metric | value |
|---|---|
| distinct API turns | 18 |
| total output tokens | 99,974 |
| — first Write | 49,779 (50%) |
| — fix rewrite | 47,736 (48%) |
| — everything else | 2,459 (2%) |
| cache_read total | 1,271,484 |
| cache_creation total | 995,990 |
| peak context (cache_read on one turn) | 256,011 |
| total tool_result chars ingested | 285,887 |

Context growth: 16,749 → 55,329 (after dumps) → 156,485 (after the 4 full process files) → 199,771 (at the delta write) → 256,011 (at the fix write).

## 8. Run-level context for B1's numbers

- Per-part error counts at 21:33: B1 11, B2 21, B3 1,306, B4 358, B5 0, B6 358, B7 0, B8 12, nokey 2 = **2,068**.
- Per-part entry counts: B1 67, B2 18, B3 100, B4 81, B5 50, B6 80, B7 50, B8 39. **Every measurement in the run (13) came from B8, the transcript pass.** B5 and B7 are 50 records each and nothing else.
- All 67 B1 temp ids were adopted: `id-map.json` maps T-1001→F-00002 … T-1067→F-00465 (the «149» note). 485 ids minted run-wide.
- `grep -in 'batch|split|parts|parallel|sequential'` over `.claude/skills/quantify/SKILL.md` (675 lines): one unrelated hit — the 8-way split exists nowhere in the playbook.
- `engine/merge_facts/content.py`: 554 lines, 12 numbered check families, 32 `messages.append` sites — none of them expressible in, or present in, the 6,614-byte JSON schema the agent was told is authoritative.