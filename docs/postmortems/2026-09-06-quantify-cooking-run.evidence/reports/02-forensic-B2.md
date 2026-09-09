# forensic:B2

## summary
Batch B2 (naharkhoran station workbooks) is the *quiet* failure of the run: it never crashed, finished its first pass in 10m56s, and still produced 18 entries — 13 records, 4 rules, 1 note, zero items, zero measurements — from five workbooks. It read 46 files in 46 Read calls (40 distinct, 3 files re-read, 8 partial reads), in a clean order: previous pass → schema → 5 dumps → .gs → processes → index → manifest. It never planned or outlined: after a 2m32s silent thinking gap it announced "Now I have everything. Writing the delta." and emitted one 52,657-char Write in a single 4m12s turn (38,696 output tokens, 10,042 of them thinking — 60% of the 64K cap). It could not self-check: its tool set is `Read, Glob, Write` (declared in quantify.md frontmatter), so it had no way to run `validate facts-delta` even though the validator is a 2-second CLI. Consequences: 21 content errors survived to the coordinator, the fix arrived 2h43m later, and because the agent has no Edit tool the fix — 10 of which were the single string `"cooking-030"` → `"departments/cooking/processes/cooking-030.json"` — cost a full 53,569-char rewrite (4m35s). Ten of the 21 errors were inherited: the dispatch ordered it to "Keep B1's other conventions", and B1 as it read it (line 990 of the version in context) used the bare-id form the validator rejects. Five more came from a FEEL "subset" that is named once in the agent prompt and never defined, against a validator whose whole function whitelist is 12 words — so `date(…)`, `string length(…)`, `trim(…)` are all "undeclared identifiers", and the agent's fix was to *weaken* a faithful `LEN(TRIM(H128))>0` to `item_20 != null`, which a later round weakened again to the semantically wrong `item_20 > 0` now sitting in the store as F-00312. On quality every complaint the user made is visible in this one batch: all 18 statements describe a spreadsheet ("تب «موجودی اول شب» در فایل Pitza.xlsx…"), four cite cells or ranges or a hex fill colour, four pairs of records duplicate byte-identical field lists instead of using `mirror_of`, a hidden empty tab and a Google-Sheets setup helper the agent itself calls "not business logic" both became facts, and the batching permanently broke the item↔record graph — B1's chalebagh records carry 10–12 `of` links each, B2's naharkhoran twins carry 0 out of 120 fields. Underneath all of it, a `SubagentStart:quantify` hook injects 5,229 characters of Ponytail ("You are a lazy senior developer… Deletion over addition… The best code is the code never written") into the extraction agent's context, twice.

## problems
- [high/harness] Ponytail "be lazy / deletion over addition" is injected into the extraction agent by a SubagentStart hook :: agent-a43cc56a1d1ad5644.jsonl line 1 (attachment, type hook_success, hookName "SubagentStart:quantify") and line 2 (hook_additional_context) inject 5,229 chars beginning "PONYTAIL MODE ACTIVE — level: full … You are a lazy senior developer … The best code is the code never written … 1. Does this nee
- [high/harness] The quantify agent cannot run the validator it is judged by — no Bash tool :: quantify.md frontmatter: `tools: Read, Glob, Write`. Transcript tool census: Read×46, Write×2, Glob×1, Bash×0. 21 content errors reached the coordinator (errs_B2.txt read at 21:34:33) and were only discovered 2h43m after B2 finished at 18:51:24. Every one of them is caught by `validate facts-delta`,
- [high/harness] No Edit tool: a 10-string fix costs a full 53,569-char rewrite and 4m35s :: Fix round 21:35:13→21:39:48 (275s) is a single Write of 53,569 chars. Diff of the two Write payloads: 10 lines changing `"ref": "cooking-030"`→`"ref": "departments/cooking/processes/cooking-030.json"` (plus 4 small rule edits). Roughly 30K output tokens re-emitted to change ~500 characters, with ful
- [high/orchestration] B1's malformed process source ref propagated into B2 by explicit instruction :: Dispatch prompt: "Keep B1's other conventions". B1 as B2 read it (tool_result at line 11, file line 990): `{ "type": "process", "ref": "cooking-030", "node": "cooking-030-n016", … }`. B2 copied that shape into 10 entries; errs_B2.txt errors 1-9 and 14 are all "processes[] link to 'cooking-0NN' has n
- [high/agent-prompt] The rule the 10 errors violate is documented only in the coordinator's playbook, never in the agent's prompt :: `_check_process_links` (code-repo/engine/merge_facts/content.py:549-554) requires `s["ref"].endswith(f"{proc_id}.json")`. That requirement appears in data-repo/.claude/skills/quantify/SKILL.md:599 ("whose `ref` ends `{id}.json` (QF-8)") — inside the edit-fact re-point section the extraction agent ne
- [high/validator] The "FEEL subset" is never defined; the validator's whitelist is 12 words and rejects every real FEEL builtin :: content.py:38 `KEYWORDS = frozenset({"if","then","else","and","or","not","min","max","sum","abs","round","over","of"})`. quantify.md:80 is the only mention: "`expr` in the FEEL subset" — no list anywhere. Errors 10, 15, 16, 17, 18 in errs_B2.txt are `expr identifier 'date' / 'string' / 'length' / 't
- [high/validator] Validator pressure destroyed formula fidelity across three rewrite rounds :: Agent's first write: `"expr": "string length(trim(item_20)) > 0"` (faithful to `LEN(TRIM(H128))>0`). After the fix: `"expr": "item_20 != null"`, with the agent flagging it in its own report — "T-2016's `expr` is now a weaker statement than the sheet's formula (non-blank rather than non-blank-after-t
- [high/orchestration] Batching permanently broke the item→record `of` graph for the naharkhoran branch :: write2.json: 120 record fields, 0 with `of`. B2's own summary names the cause: «پیوند `of` از ستون‌های رکورد به ورودی‌های قلم در این پاس نوشته نشد، چون اقلام در دلتای پاس اول با شناسه موقت زندگی می‌کنند و از این دلتا قابل ارجاع نیستند». Confirmed permanent in the committed store: F-00146 `pitza__moj
- [high/output-format] One rule per branch/line instead of one shared rule, at the agent's own protest :: T-2015 key `mojudi_avval_shab__from_akhar_shab_prev__naharkhoran`; its statement ends «این قاعده همتای ناهارخوران قاعده هم‌نام شعبه چاله‌باغ است و در صورت تأیید انسان می‌توان دو مورد را ادغام کرد» — the agent wrote a duplicate and asked a human to merge it. The dispatch forced it: "Records are per-w
- [high/output-format] Mirror tabs written as full duplicate records; `mirror_of` exists and was never used :: Field-key lists are byte-identical across all four avval/akhar pairs: T-2006/T-2007 (13 keys), T-2008/T-2009 (12), T-2010/T-2011 (17), T-2012/T-2013 (9). `mirror_of` appears nowhere in the delta, though quantify.md:186 lists `data.mirror_of` as a supported ref. The four duplicate records are 14,843 
- [high/output-format] Every statement describes the spreadsheet, and four cite cells, ranges or a fill colour :: All 18 statements name the .xlsx file and tab, e.g. T-2006: «تب «موجودی اول شب» در فایل Pitza.xlsx شعبه ناهارخوران: به ازای هر شب یک ردیف …». Cell-level citations inside the prose: T-2014 «شش سلول A18 تا A23 … A18=DATE(2025,12,16)، A19=DATE(2025,12,17)…»; T-2016 «محدوده H128:H226 … پس‌زمینه سبز FFB7
- [medium/data-quality] Cosmetic conditional formatting recorded as a rule whose meaning is admitted to be unknown :: T-2016 → committed F-00312, `"threshold": null, "meaning": null, "effect": "fill=FFB7E1CD"`, statement ends «معنای عملیاتی این علامت‌گذاری در فایل توضیح داده نشده است». It is one of only 4 rules the batch produced.
- [medium/data-quality] A hidden tab with zero data rows became a record :: T-2005 → F-00158 `ashpazkhne_naharkhoran__khamir`, statement: «این تب پنهان است و در زمان استخراج جز سطر عنوان هیچ ردیف داده‌ای ندارد (محدوده A1:D1)». Source dump confirms `"name": "خمیر", "rows": 1, "hidden": true`.
- [medium/data-quality] A Google-Sheets setup helper became a rule the agent itself says is not business logic :: T-2017 → F-00313 `amar_kanter__add_dropdown_columns`, 3,454 chars including four `edge_cases` about `insertColumns(1,3)`. Its own statement: «این تابع یک ابزار راه‌اندازی کاربرگ است و منطق کسب‌وکار نیست، بنابراین نامزد پورت شدن به موتور نیست» and `"port": false`.
- [high/output-format] A quantitative-facts agent that produced zero quantities :: 18 entries: 13 record (table shapes), 4 rule, 1 note, 0 item, 0 measurement. Not a single number, threshold, rate or tolerance was extracted from five workbooks holding 189, 188, 182, 181 and ~100 rows of nightly inventory. Store-wide the department has 13 measurements against 156 records and 156 ru
- [high/engine] The dump hands a quantitative agent 4 data rows out of 189 :: engine/dump_workbook/__init__.py:47 `_HEAD_ROWS = 5` (header + 4 rows). None of B2's five dump dirs contains a `rows.tsv` — it is emitted only for tabs listed in the manifest's `reference_tabs[]`, and none of these has one. sheets.json for `موجودی اول شب` reports `"rows": 189` with `head_rows 5`. Ev
- [medium/data-quality] Unit asserted as kg on columns the same entry says are in grams, with no field_status :: T-2006 field `item_2` `"unit": "kg", "unit_ref": {"ref": "F-00001", "row": "kg"}` while the entry's own `issues[0]` reads «مقادیر ستون‌های وزنی … حدود هزار برابر بزرگ‌تر از مقیاس کیلوگرم است و عدد گرمی به نظر می‌رسد» with `"fix": {"op":"divide","factor":1000}`. `field_status` across the whole 18-ent
- [medium/harness] Read truncation silently dropped 664 lines of the process file 9 entries are anchored to :: attachment line 98: "[Truncated: PARTIAL view — …/cooking-030.json: showing lines 1-1150 of 1814 total (33501 tokens, cap 25000). Call Read with offset=1151 …]". The agent never issued that follow-up read (read list jumps straight to cooking-032 at 18:43:23), yet attached `processes: [{"ref":"cookin
- [medium/agent-prompt] Process anchoring done from 2 of 36 process files, chosen with no information :: Dispatch: `process_paths: departments/cooking/processes/*.json (glob them all)`. The Glob result is 36 bare filenames, no titles. The agent then read only cooking-030 (truncated) and cooking-032 (3 partial reads, 120+120+45 lines of 1,300+). The 36 files total ~1.9MB. cooking-030 and cooking-032 are
- [high/orchestration] Half the write-turn context was a sibling batch's output and one process file, not this batch's inputs :: Actual batch source material: 42,743 bytes across all five dump dirs (~20K tokens) plus a 1,751-byte .gs. Against that: facts-delta-B1.json = 46,483 tokens (truncation banner) read in full, cooking-030.json ≈25K tokens, manifest 15,488 chars, cooking-032 ~12K chars, schema 6,974 chars. Write turn us
- [medium/orchestration] Prompt cache thrashed twice: the 4-minute Write and the 2h43m idle each forced a full re-cache :: After the 251s Write turn the next assistant message (18:50:38) records `cache_read_input_tokens: 0, cache_creation_input_tokens: 184667` — the 5-minute ephemeral TTL (`ephemeral_5m_input_tokens`) expired during generation. Resuming after the idle gap (21:34:33) shows `cache_creation_input_tokens: 1
- [high/orchestration] No planning, no outline, no incremental write — one 4m12s Write with nothing recoverable if it had capped :: Timeline: last read 18:43:41 → 152s silent gap → 18:46:13 "Now I have everything. Writing the delta." → 18:50:25 Write of 52,657 chars. Usage on that turn: `output_tokens: 38696`, `output_tokens_details.thinking_tokens: 10042` — 60% of the 64K cap for five small workbooks and 18 entries (~2,150 outp
- [high/spec] The B1..B8 batching scheme exists nowhere in the playbook — it was improvised at runtime :: grep of data-repo/.claude/skills/quantify/SKILL.md (675 lines) for batch/pass/split/sequential returns nothing about splitting a department. The whole scheme — 8 sequential passes, `parts/facts-delta-B{n}.json`, temp-id blocks (`use only the 2000-block — T-2001, T-2002, …`), "Read the previous pass 
- [medium/orchestration] B1 handed B2 a worked example of exactly the junk the user complains about :: In B1 as B2 read it (tool_result line 14, file lines 1386-1397): a note whose entire payload is `"data": { "text": "149", "meaning": null, "about": {"ref": "T-1028"} }`, sourced from two cell comments. That is the "cell comment 149" the user named. It sat in B2's context for the whole run as the can
- [low/output-format] Enum boilerplate restated in every record instead of referenced once :: 26 `constraints.enum` blocks in the 18-entry delta, 2,906 chars (6.1% of the compact JSON): the integers 1-31, the twelve Persian month names and the years 1404-1420 written out in full in T-2006 through T-2013 and elsewhere. The identical lists are already a fact in the estate — T-2017/F-00313 reco
- [low/spec] `data.kind` shadows the envelope `kind`, with two incompatible meanings already in flight :: B2's first write had `"kind": "flag"` inside a rule's `data`; the agent renamed it to `flag` unprompted during the fix round and said so: "Renamed the `data.kind` key to `data.flag` while I was there, to avoid shadowing the envelope's `kind`." B1's records still carry `"kind": "scale"` and `"kind": 
- [low/agent-prompt] The coordinator's "re-read the schema, it is authoritative" instruction was not followed :: Fix message (21:34:27): "How to fix each class (re-read `facts-delta.schema.json` — it is authoritative)". The agent's only Read in the fix round is errs_B2.txt at 21:34:33; no schema read after 18:40:32. The schema was still in context, so nothing broke — but the instruction was silently dropped, a
- [low/data-quality] A record was written for a column the agent flagged as holding people's names :: T-2018 → F-00466 ends «توجه: ستون توضیحات نام اشخاص را ثبت می‌کند و محتوای آن در این پرونده بازنویسی نشده است», while T-2003 → F-00156 keeps that `توضیحات` column as a declared field of the committed record. quantify.md obligation 6 says "roles, never names".
- [low/harness] Thinking content is stored empty, so the run cannot be audited :: Every `thinking` block in the transcript has `"thinking": ""` with only a `signature` (e.g. line 9, msg_011CeeprnaJ6Q1xJH1bDtxNJ). The 152s planning gap at 18:43:41-18:46:13 and the 10,042 thinking tokens inside the Write turn are entirely unreadable; the only visible reasoning in a 3-hour run is tw

## details
## 1. Inputs handed to it, and what it actually read

**Dispatch** (18:40:28, first user message, 3,735 chars): mode `full`, department `cooking`, run_dir `runs/facts/cooking/20260902-080737/`, explicitly framed as "a PARTIAL pass (batch 2 of 8)", temp ids restricted to the 2000-block, output to `parts/facts-delta-B2.json`. `transcript_paths: []`, `image_paths: []`, `image_descriptions: []` — sheets and one script only.

| Input | On disk | Read? |
|---|---|---|
| `parts/facts-delta-B1.json` (previous pass, 67 entries) | 1,401 lines / 46,483 tokens at read time | yes, 3 Reads (auto-truncated at 640, then off=641 lim=450, off=1091 lim=311) — full coverage |
| `schemas/facts-delta.schema.json` | 6,617 B / 117 lines | yes, once, in full |
| dump `1AuKUUFs…Cl_8` (ashpazkhne_naharkhoran, 5 tabs) | 6,564 B | 7/7 files |
| dump `18Q3QHG…j9Ns` (amar_pitza, 4 tabs) | 6,264 B | 6/7 (no names.tsv) |
| dump `1hGDv6e…L8CU` (amar_farangi, 53 tabs) | 17,976 B | 7/7, sheets.json needed 3 reads (full, then lim=260, off=750, off=690) |
| dump `1Icony…5O2I` (amar_kanter) | 7,040 B | 6/7 (no names.tsv) |
| dump `1Ga0Y9i…xIVU` (fried) | 4,899 B | 6/7 (no names.tsv) |
| `MandeShab__Naharkhoran__Amar__Kanter/Kanter.gs` | 1,751 B | yes, once, in full |
| `departments/cooking/processes/*.json` (36 files, ~1.9 MB) | — | Glob only; **2 of 36 read**: cooking-030 (truncated at 1150/1814 lines, never paged) and cooking-032 (3 partial reads: lim=120, off=560 lim=120, off=515 lim=45) |
| `facts/.index.json` | 619 B at the time (only F-00001) | yes |
| `attachments/sheets/manifest.json` | 13,624 B | yes (read **last**, 18:43:41, after the process files) |
| `NAMED_FUNCTIONS.md` (orientation) | — | never read |

**Tool census:** Read ×46, Glob ×1, Write ×2, Bash ×0. 40 distinct paths. 3 files re-read (B1 ×3, farangi sheets.json ×3, cooking-032 ×3). 8 partial/offset reads.

**Read order:** previous pass → schema → the 5 dumps in dispatch order (each: sheets.json → meta.json → formulas/validations/cf/comments/names) → .gs → Glob processes → cooking-030 → cooking-032 → facts index → manifest. Clean and sensible; the only ordering flaw is reading the manifest last, after it had already decided its record keys.

**Critical input gap:** no `rows.tsv` exists in any of the five dumps (it is emitted only for manifest-confirmed `reference_tabs[]`). `sheets.json` carries `head` = at most 5 rows (`_HEAD_ROWS = 5`). So for `موجودی اول شب` with `"rows": 189`, the agent saw 4 data rows.

## 2. Wall clock

| Stage | Start | End | Duration | What |
|---|---|---|---|---|
| Dispatch | 18:40:28 | — | — | 3,735-char prompt |
| Read B1 + schema | 18:40:31 | 18:40:41 | 10s | 4 Reads |
| Read 5 dumps | 18:40:48 | 18:42:38 | 1m50s | 34 Reads |
| Read .gs | 18:42:59 | 18:42:59 | — | 1 Read |
| Glob + 2 process files | 18:43:05 | 18:43:32 | 27s | 1 Glob, 4 Reads |
| Read index + manifest | 18:43:36 | 18:43:41 | 5s | 2 Reads |
| **Silent gap (planning)** | 18:43:41 | 18:46:13 | **2m32s** | hidden thinking, no tool calls |
| Generate the Write | 18:46:13 | 18:50:25 | **4m12s** | one 52,657-char Write, 38,696 output tokens (10,042 thinking) |
| Persian summary | 18:50:38 | 18:51:24 | 46s | 3,897-char report |
| **IDLE** | 18:51:24 | 21:34:27 | **2h43m03s** | coordinator running B3..B8 |
| Read errs_B2.txt | 21:34:33 | 21:34:33 | — | 1,667 chars, 21 errors |
| Think | 21:34:33 | 21:35:13 | 40s | |
| Rewrite whole file | 21:35:13 | 21:39:48 | **4m35s** | one 53,569-char Write |
| Final summary | 21:39:49 | 21:40:09 | 20s | 3,106-char report (English) |

Active model time **16m38s**; wall clock **2h59m41s**. Two long silent gaps: the 2m32s pre-write planning and the 4m12s / 4m35s single-turn writes (which are generation, not idling). The 2h43m gap is pure scheduling.

## 3. How it built the delta

No plan, no outline, no incremental writing. After the last read it thought for 152s, emitted a single 41-character line — "Now I have everything. Writing the delta." — and then produced the whole file in one Write. Result: 18 entries, 52,657 chars, `{"schema_version": 1, "entries": [...]}`.

Per-entry byte cost (compact JSON, 47,768 chars total): T-2006 4,600 · T-2011 4,461 · T-2010 4,249 · T-2008 4,210 · T-2009 3,791 · T-2007 3,562 · T-2017 3,454 · T-2012 3,357 · T-2013 3,029 · T-2015 2,307 · T-2001 1,780 · T-2002 1,555 · T-2005 1,526 · T-2003 1,295 · T-2004 1,179 · T-2014 1,185 · T-2018 1,161 · T-2016 997. That is ~2,150 output tokens per entry, so the 64K cap is reached at roughly 28 entries.

**It never self-checked, and could not.** `tools: Read, Glob, Write` in quantify.md frontmatter; zero Bash calls in the transcript. It read the schema once at 18:40:32 and reasoned against it from context. The coordinator's later instruction to "re-read `facts-delta.schema.json` — it is authoritative" was not followed (no schema read after the fix message).

## 4. What it struggled with — its own words

- **Cross-batch refs, the one it flagged loudest:** «پیوند `of` از ستون‌های رکورد به ورودی‌های قلم در این پاس نوشته نشد، چون اقلام در دلتای پاس اول با شناسه موقت زندگی می‌کنند و از این دلتا قابل ارجاع نیستند؛ پیوند فعلاً فقط از راه یکسان‌بودن کلید ستون با کلید قلم برقرار است.»
- **Duplicated rule, escalated to a human:** «قاعده «مانده اول شب برابر مانده آخر شب شب گذشته» همتای ناهارخورانِ قاعده هم‌نام پاس اول است و با کلید جداگانه ثبت شد تا با نسخه چاله‌باغ برخورد نکند؛ ادغام این دو در صورت صلاحدید با انسان است.»
- **Sampling, not measuring:** «در ردیف‌های نمونه‌برداری‌شده» recurs in T-2006, T-2008, T-2010, T-2018 and both `issues[]`. Its scale diagnoses («حدود هزار برابر بزرگ‌تر از مقیاس کیلوگرم») rest on 4 rows out of 189.
- **Knowingly weakening a formula to satisfy the validator:** "T-2016's `expr` is now a weaker statement than the sheet's formula (non-blank rather than non-blank-after-trim) — the exact original is preserved in `original`, so no evidence was lost."
- **Unsure its own fix is right:** "T-2017's inputs are the workbook's own tabs, which is honest for a script that reads-then-writes them, but it makes the rule look like a computation over those records in a graph view; if the coordinator prefers, it can instead become a constant…"
- **Volunteering a schema smell:** "Renamed the `data.kind` key to `data.flag` while I was there, to avoid shadowing the envelope's `kind`."
- **Units:** it reported the unit of the `تعداد` column on the ضایعات tab as unknown, and correctly refused to open any `accounts[]` («هیچ فیلد disputed و هیچ accounts‌ای در این پاس باز نشد») — the one contract rule it clearly understood.

Thinking blocks are stored empty (`"thinking": ""` + signature), so the 152s planning gap and the 10,042 thinking tokens inside the Write are unreadable.

## 5. Crash

**It did not crash.** 38,696 output tokens on the Write turn against a 64K cap — 60% — for five small workbooks. `stop_reason: "tool_use"`, no `max_tokens`. No work was lost. This batch is the control case that shows the cap was hit elsewhere because entries cost ~2,150 output tokens each, not because the model misbehaved.

## 6. The fix round

Arrived 21:34:27, 2h43m after B2 finished. 21 errors in four classes; the coordinator supplied per-class remedies and the rule "Do not change any `id` or `key`… Do not touch entries that produced no error."

- Read the error file (6s), thought 40s, then **rewrote the entire file** (53,569 chars, 275s) — it has no Edit tool.
- Content-wise the changes were surgical. Full diff between the two writes: **10 lines** changing `"ref": "cooking-030"`/`"cooking-032"` → the full `departments/cooking/processes/cooking-0NN.json` path, plus edits to T-2014 (drop `expr`/`lang`/`constants`, add `name`+`value` to the output), T-2015 (name 4 inputs and 4 outputs, add a FEEL `expr`, `lang` text→feel, drop the redundant `text`), T-2016 (`string length(trim(item_20)) > 0` → `item_20 != null`, `data.kind`→`data.flag`), T-2017 (declare the workbook's own tabs as inputs so it is no longer a constant).
- Cost of that: ~30K output tokens and 4m35s to change ~500 characters. Resuming after the idle gap also cost `cache_creation_input_tokens: 178067` — the 5-minute cache had long expired.
- Its fix was itself invalid: `null` is not in the validator's KEYWORDS either. The committed store holds a *third* version, `item_20 > 0`, which is semantically wrong for a non-blank CF rule.

## 7. Output quality — 8 sampled statements

| Entry | Statement (excerpt) | Verdict |
|---|---|---|
| T-2006 | «تب «موجودی اول شب» در فایل Pitza.xlsx شعبه ناهارخوران: به ازای هر شب یک ردیف با تاریخ شمسی تفکیک‌شده (روز، ماه، سال) و مانده اول شب هر قلم لاین پیتزا. ستون‌های آن با فایل هم‌نام شعبه چاله‌باغ یکی است…» | Describes the sheet, names the file and tab, and diffs it against another workbook. Reading it still requires the sheet. Also the end-of-night inventory the user called non-quantitative. |
| T-2007 | «برخلاف فایل هم‌نام شعبه چاله‌باغ، این تب ستون اضافه‌ای نسبت به تب اول شب ندارد و دو ستون «سس گوجه کف پیتزا ##33» و «خمیر پیتزا ##26» در آن وجود ندارد.» | A schema diff between two spreadsheets. Zero process content. Mirror of T-2006 — identical 13 field keys, written out again. |
| T-2005 | «این تب پنهان است و در زمان استخراج جز سطر عنوان هیچ ردیف داده‌ای ندارد (محدوده A1:D1)» | A hidden, empty tab recorded as a record. Trivia. |
| T-2014 | «شش سلول A18 تا A23 به‌جای مقدار تاریخ، فرمول ثابت DATE با تاریخ میلادی دارند: A18=DATE(2025,12,16)، A19=DATE(2025,12,17)…» | Pure cell-reference bookkeeping — the user's "where a date cell is read from". Six literal dates as a "fact". |
| T-2016 | «یک قاعده قالب‌بندی شرطی روی محدوده H128:H226 … با پس‌زمینه سبز FFB7E1CD علامت می‌زند… معنای عملیاتی این علامت‌گذاری در فایل توضیح داده نشده است.» | Cosmetic conditional formatting, with `threshold: null` and `meaning: null`. Exactly the complaint. |
| T-2015 | «…این قاعده همتای ناهارخوران قاعده هم‌نام شعبه چاله‌باغ است و در صورت تأیید انسان می‌توان دو مورد را ادغام کرد.» | Per-branch duplicate of an existing rule, admitted in the statement. Also cites «سلول D3» / «سلول D2». |
| T-2017 | «این تابع یک ابزار راه‌اندازی کاربرگ است و منطق کسب‌وکار نیست، بنابراین نامزد پورت شدن به موتور نیست.» | 3,454 chars recording something the agent says is not business logic. |
| T-2018 | «…در ردیف‌های نمونه‌برداری‌شده هرجا این ستون ۳ است سه نفر و هرجا ۲ است دو نفر… این برداشت از داده کاربرگ استنباط شده و در خود فایل تعریف نشده است.» | The one genuinely useful entry: an inferred semantic relation between two columns, honestly marked `field_status: inferred`. Also correctly warns the column holds people's names. |

**Counts:** record 13 · rule 4 · note 1 · **item 0** · **measurement 0**. Not one number, threshold, rate or tolerance from five inventory workbooks. All 18 name the .xlsx file and tab. 4 cite cells, ranges or a hex colour. 4 record pairs duplicate byte-identical field lists (31% of the delta). `mirror_of` never used. `field_status` on 1 of 18 entries.

Colloquial statements are absent — but only because `transcript_paths: []`. This batch had no speech to drop in.

**All 18 landed in the committed store** (F-00154..F-00166 records, F-00310..F-00313 rules, F-00466 note), and the missing `of` links are permanent: B1's F-00146 `pitza__mojudi_avval_shab` has 10 of 13 fields with `of`; B2's F-00159 `amar_pitza__mojudi_avval_shab` has 0 of 13.

## 8. Tokens

25 unique API turns (129 jsonl lines, 72 assistant lines — Claude Code writes one line per content block).

| Metric | Value |
|---|---|
| Assistant API turns | 25 |
| Sum output tokens (as recorded) | 40,932 |
| — of which one turn (the first Write) | 38,696 (incl. 10,042 thinking) |
| Real total output | ≈71,000 — the fix Write's final usage was never persisted (snapshot frozen at `output_tokens: 3`); the 53,569-char payload is ≈30K |
| Sum cache_read | 2,078,636 |
| Sum cache_creation | 712,198 |
| Sum input_tokens (uncached) | 48 |
| Peak context | 145,846 at the first Write (cache_read 137,603 + cache_creation 8,243); 212,158 re-cached on the final turn |

Three full cache re-creations, all avoidable: 184,667 after the 4m12s Write blew the 5-minute ephemeral TTL, 178,067 on resuming after the 2h43m idle, 212,158 at the end. Of the ~146K peak context, roughly 71K was B1 (46.5K) plus cooking-030 (25K) against ~20K tokens of actual batch input.
