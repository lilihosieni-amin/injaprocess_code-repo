# forensic:B7

## summary
B7 was the cheapest and cleanest of the eight passes — and that is the problem: it is a 14-minute, ~239K-context, ~50K-output-token Opus run whose entire product is 35 "this hidden tab is a one-formula mirror of that tab" records plus 15 stubs for two workbooks it never opened. Zero items, zero measurements, zero rules, zero notes — a quantitative-facts pass that produced no quantities in structured form. All 50 landed in the store, where they are 32% of all records; store-wide, mirrors + stubs are 100 of 156 records (64%). Its own dispatch prompt already contained the answer (all 35 tab names, "each with exactly one IMPORT_FROM_SHEET-style formula", "mirror B5's structure and key shapes", the likely stub sources and where their file ids live), and I verified all 35 named-range claims byte-for-byte against names.tsv — this batch is a deterministic transcription job handed to an LLM. The dispatch prompt also ordered a documented spec violation (`foreignKeys` on mirrors, which quantify.md:87 forbids); the schema accepted it, the content validator had a hole that let it pass (its own docstring names the 84 members), and a purpose-built engine verb later deleted all 35. Its 15 stubs were scoped `warehouse`/`cashier` per quantify.md:217 and rejected by apply.py's QF-43 — a straight spec-vs-engine contradiction, "fixed" by blanking the scope to `[]`. It never opened three of its listed inputs (36 process files, the 316KB facts index, the .gs), so 0 of 50 entries carry a `processes[]` link. It ignored a truncation banner's explicit resume offset (banner said 144, it read from 168) and silently skipped 24 formula lines it then reasoned about. It never planned or outlined: one 68,899-char Write generated in a silent 389-second burst (46% of wall clock, ~78% of the 64K output cap), with no ability to validate — its toolset is Read/Glob/Write, no Bash. One factual claim ("its last row is 4 Mordad 1405") is extrapolated from a 4-row sample of a 9-row tab and propagates into a cross_record issue affecting two other batches' entries.

## problems
- [high/orchestration] The whole batch is a deterministic transcription job given to Opus :: Dispatch prompt (first user message, 2026-09-02 20:54:57 Tehran) enumerates all 35 tab names, asserts 'all hidden, each with exactly one IMPORT_FROM_SHEET-style formula', says 'Mirror B5's structure and key shapes', names the likely stub sources ('Anbar shobe 2.xlsx', 'Tedade Fooroosh naharkhoran.xl
- [high/orchestration] Dispatch prompt ordered a documented spec violation (foreignKeys on mirrors); 35 members were later deleted by a purpose-built engine verb :: Dispatch prompt: '35 `role: mirror` records keyed `gozaresh_markazi__table_*` with `mirror_of` + a `foreignKeys` row'. quantify.md:87 says of an IMPORT_FROM_SHEET tab: '`mirror_of` and the rule that performs the pull — never a `foreignKeys` member, which QF-9 gives a mirror no `fields[]` to build on
- [high/spec] Spec and engine contradict on stub scope — 15 validation errors, then scope erased to satisfy the validator :: quantify.md:217 (Record stub): 'scope the workbook's manifest row (`departments`/`branches`)'. engine/merge_facts/apply.py:334 (QF-43): 'if not set(entry["scope"]["departments"]) <= {run_dept}: out.append(f"entry {key} scoped to another department")'. B7 as written gave its 15 stubs departments ['wa
- [high/agent-prompt] Agent cannot validate its own output — no Bash, no Grep, one 68.9KB blind Write :: quantify.md frontmatter: `tools: Read, Glob, Write`. The delta is written in a single Write at 21:08:21 whose input JSON is 75,376 chars (content 68,899 chars, 50 entries). No re-read, no second Write, no self-check. It happens to be schema-clean (I ran jsonschema Draft202012 over the exact Write pa
- [high/agent-prompt] No plan, no outline, no incremental write — 389 silent seconds producing one monolithic Write at ~78% of the output cap :: Timeline: 21:01:52 assistant text 'Now I have everything. Writing the delta.' -> 21:08:21 Write (389s, 46% of the 853s run). Context jumps from 189,158 tokens (cache_read 182,743 + cache_creation 6,415 at 21:01:52) to cache_creation 238,798 at 21:09:10 — a ~49.6K-token single-message output against 
- [high/agent-prompt] Three of its listed inputs were never opened; obligations #1 and #8 not executed at all :: Dispatch prompt lists `process_paths: departments/cooking/processes/*.json` (36 files, 1.9 MB), `facts_index: facts/.index.json` (316,035 bytes), and 'B6 covered `Gozaresh naharkhoran.gs`; read it for orientation'. Full tool-call inventory (25 calls) shows none of the three was ever read. Result: 0 
- [medium/harness] Ignored a truncation banner's explicit resume offset and silently lost 24 formula lines it then reasoned about :: Truncation attachment: '[Truncated: PARTIAL view — .../formulas.tsv: showing lines 1-143 of 208 total (30698 tokens, cap 25000). Call Read with offset=144 limit=143 for the next page, or Grep to find a specific section.' Next call (20:55:56) was Read offset=168 limit=41. Lines 144-167 = 4 سوخاری for
- [high/output-format] 100% of the batch is mirrors and stubs — a quantitative-facts pass that produced zero quantitative entries :: Kind counts in the written delta: record 50, item 0, measurement 0, rule 0, note 0. data.role: mirror 35, log(stub) 15. data.fields[] present on 0 entries; data.rows[] on 0 entries. All 50 are in the store today (facts/records.json): 50 of 156 records = 32%. Store-wide mirrors (70, i.e. B5's 35 + B7
- [high/data-quality] Every statement is spreadsheet plumbing — cells, tabs, files, named ranges in A1 notation :: Of 50 statements: 35 name cell A1, 35 name IMPORT_FROM_SHEET, 35 open with «تب پنهان» (hidden tab), 50 name an .xlsx file, 15 quote a named range in A1 notation (e.g. «هر سیزده ستون مبدأ (A تا M) ... زیر محدوده نام‌دار Table_Pizza_First!$A:$M می‌افتند»). Average statement 327 chars. Sample T-7028: «
- [high/output-format] One shared rule written 35 times as per-tab boilerplate :: The sentence fragment «در فایل Gozaresh naharkhoran.xlsx تنها یک فرمول در A1 دارد که با IMPORT_FROM_SHEET محدوده» appears verbatim in 35 of 35 mirror statements = 3,115 chars = 19% of all 16,353 statement chars. «تب داده مستقلی ندارد و آینه رکورد مبدأ است» ×15; «و ردیف‌ها اینجا تکرار نشده‌اند» ×10; 
- [medium/orchestration] Branch duplication — B5 and B7 are the same 35 records twice, and 12 of them describe the same shared source file :: Mean difflib similarity between B5's and B7's twin mirror statements across all 35 pairs: 0.75. The 12 Table_Ingredients_* tabs in both workbooks import from the SAME shared file Mavade Avalie.xlsx (B7 T-7042: 'محدوده A:D تب «لازانیا» فایل Mavade Avalie.xlsx'; B5 same tab: 'محدوده A:K تب «لازانیا» ف
- [high/data-quality] A factual claim extrapolated from a 4-row sample, propagated as a cross_record issue affecting two other batches :: T-7026 issue: «محدوده پرشده این آینه A1:Q9 است، یعنی تنها هشت ردیف داده دارد و آخرین ردیفش ۴ مرداد ۱۴۰۵ است ... GET_ROW_BY_PERSIAN_DATE روی این جدول ردیفی پیدا نمی‌کند و ستون موجودی آخر شب تب «کانتر» صفر می‌شود؛ در نتیجه مصرف اعلامی صفر و انحراف برابر خود مصرف واقعی درمی‌آید.» sheets.json for Table_
- [medium/data-quality] Stubs assert the structure of files the same sentence admits were never read :: 15 stub statements, e.g. T-7001: «تب «پیتزا» در فایل Anbar shobe 2.xlsx: به ازای هر شب یک ردیف با تاریخ شمسی تفکیک‌شده (روز، ماه، سال) و مقدار تحویل‌شده هر قلم لاین پیتزا از انبار شعبه دو. ... خود فایل در این پاس خوانده نشده و ساختار ستون‌هایش اینجا ثبت نشده است.» The two source dumps existed on dis
- [medium/output-format] Batch-run vocabulary leaked into permanent store text :: «در این پاس» ('in this pass') appears in 15 of B7's 50 statements and in 30 records of the current store. The store is permanent; 'this pass' refers to a batch that existed for 14 minutes on 2026-09-02.
- [medium/data-quality] Excel cosmetics and sampling artefacts recorded as issues :: 24 issues total, kinds: junk 13, column_shift 7, scale 1, unit_kind 1, cross_record 1, bug 1. Examples of `junk`: T-7021 «عنوان ستون M در این آینه رشته «Column 1» است و همه سلول‌های آن خالی‌اند»; T-7028 «سه ستون آخر (کراکف #766، مخصوص #767 و مخصوص #1) در ردیف‌های نمونه‌برداری‌شده خالی‌اند» (empty on
- [medium/output-format] Cross-branch comparison prose in 15 statements — facts about two spreadsheets, not about the restaurant :: 15 of 50 statements compare to the چاله‌باغ twin, e.g. T-7025: «برخلاف تب هم‌نام گزارش شعبه چاله‌باغ اینجا ستون خالی ابتدایی وجود ندارد، پس ستون‌ها جابه‌جا نشده‌اند و موجودی اول شب لیموناد خوشگوار ##757 به فرمول‌های تب «کانتر» می‌رسد.» Ordered by the dispatch: 'where this workbook's ingredient table
- [high/validator] The 84 malformed foreignKeys members passed the content validator cleanly :: engine/merge_facts/content.py `_check_record_shape` docstring: 'both halves are required ... 84 stored records carried an IMPORT descriptor here instead (`{spreadsheetId, sheet, range, target}`), and the membership loop below read `fk.get("fields") or []`, so an absent `fields` was an empty list and
- [high/validator] Schema-clean but semantically wrong — the only gate the agent can reach checks almost nothing :: The exact Write payload validates against facts-delta.schema.json with 0 errors (jsonschema Draft202012Validator). Its 15 real errors (QF-43) and its 35 malformed foreignKeys are invisible to that schema. The schema's `entry` def is one `allOf` requiring only {kind,key,title,statement,scope,source,r
- [low/agent-prompt] Wasted round trip on a path built by concatenating an absolute data_root with a relative run_dir :: 20:55:08 Read '/home/lili/.../process dev/runs/facts/cooking/20260902-080737/parts/facts-delta-B5.json' -> error: 'File does not exist. Note: your current working directory is /home/lili/.../process dev/data-repo. Did you mean .../data-repo/runs/facts/...'. The dispatch gives `run_dir: runs/facts/co
- [medium/harness] The 25K-token read cap forced 5 extra paged calls and is where the only content loss happened :: Three truncation notices: facts-delta-B5.json (lines 1-60 of 107, 37,756 tokens), sheets.json (lines 1-2710 of 3,326, 26,073 tokens), formulas.tsv (lines 1-143 of 208, 30,698 tokens). Of 21 Read calls, 12 carried offset/limit and 10 were re-entries into an already-opened file. sheets.json and B5 wer
- [medium/harness] Interleaved thinking is stored empty — the three long silent gaps are unrecoverable :: 15 thinking blocks in the transcript, every one `{"type":"thinking","thinking":"","signature":"CAIS..."}`. The gaps at 20:57:46 (75s), 20:59:42 (113s) and 21:01:52 (85s) contain no readable reasoning, so why it chose offset=168 over the banner's 144, and how it decided the 12 ingredient mirrors were
- [medium/harness] Token accounting in the transcript is unusable for cost or limit monitoring :: The 21:08:21 message whose tool_use block is 75,376 chars reports `output_tokens: 2`. Across the 20 unique assistant messages, last-record output_tokens sums to 3,528 — off by more than an order of magnitude. Real output is only inferable from the cache_creation jump (189,158 -> 238,798 = ~49.6K tok
- [medium/orchestration] Two identical mirror batches (B5, B7) run sequentially inside a ~3-hour chain :: Subagent windows: B5 'Quantify batch 5 central mirror tables' 16:31:57 -> 16:44:59 (13 min), B7 'Quantify batch 7 naharkhoran mirror tables' 17:24:57 -> 17:39:10 (14 min), B8 started 17:39:40. B5 and B7 do the same job on twin workbooks; B7's only dependency on B5 is 'mirror B5's structure and key s
- [medium/orchestration] Cross-part temp-id references work only because a sibling part happened to contain them :: B7 emits 12 refs T-3088..T-3099 (B3's mavade_avalie__* records) and all 12 resolve correctly — but facts-delta-B3.json was never read (25-call inventory). The ids came from B5's mirror_of fields, which B7 did read. Likewise T-2006..T-2013 were confirmed by partial reads of B2 (5 calls, lines 1-2, 3-
- [medium/output-format] No confidence or inference marking on 22 claims that rest on samples and inference :: field_status appears on 15 of 50 entries and always with the same single value `{"data/role": "inferred"}` (the stubs). The 4-row-sample claim in T-7026, the 10 'مقادیر سلول‌به‌سلول با رکورد مرجع مبدأ یکی‌اند' claims made without opening B3 or the Mavade Avalie dump, and the 15 stubs' asserted grain

## details
## 0. Files

- Transcript: `/home/lili/.claude/projects/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-data-repo/ffa1efdd-cf44-4caa-b4e3-9b3853970a43/subagents/agent-ab6dc99e0aaa0a8b0.jsonl` (75 lines, 601,768 B; meta: `agentType: quantify`, `description: "Quantify batch 7 naharkhoran mirror tables"`, `spawnDepth: 1`)
- Digest: `/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/b7.small.txt`
- Exact Write payload extracted: `.../scratchpad/b7.written.json` (68,899 chars, 50 entries)
- Statement dump: `.../scratchpad/b7.statements.txt`
- Diff written-vs-on-disk: `.../scratchpad/b7.diff.txt`

## 1. Inputs handed vs actually read

**Handed** (dispatch prompt, 5,054 chars):

| Input | On disk | Read? |
|---|---|---|
| `schemas/facts-delta.schema.json` | 6,974 chars as returned | yes, once, in full (call 1) |
| dump `1Kk0lA8h…` — `sheets.json` | 65,905 B / 3,326 lines | yes, 2 paged calls, full coverage |
| dump — `formulas.tsv` | 49,019 B / 208 lines | yes, 2 paged calls, **lines 144-167 never read** |
| dump — `rows.tsv` | 12,238 B / 78 lines | yes, full (only the 12 `Table_Ingredients_*` tabs + `SheetsFileIDs` have rows dumped) |
| dump — `names.tsv` | 4,064 B / 52 lines | yes, full |
| dump — `meta.json` | 746 B | yes |
| dump — `cf.tsv` (9 lines), `validations.tsv` (4), `comments.tsv` (header only) | 700 B total | **no** (all three concern non-`Table_*` tabs = B6's scope, so defensible) |
| parts `facts-delta-B1..B6.json` ("Read the previous passes first") | 6 files | **B5, B6, B2 only** — B1, B3, B4 never opened |
| `process_paths: departments/cooking/processes/*.json` | 36 files, 1.9 MB | **no** |
| `facts_index: facts/.index.json` | 316,035 B | **no** |
| `Gozaresh naharkhoran.gs` ("read it for orientation") | — | **no** |
| source dumps `10Jsuk…` (Tedade Fooroosh naharkhoran), `1Te8IM…` (Anbar shobe 2) | full dumps present | **meta.json only** (325 B, 310 B) — file ids, nothing else |

**Tool calls: 25 total — 21 Read (1 error), 3 Glob, 1 Write.** 12 of 21 Reads carried `offset`/`limit`; 10 were re-entries into a file already opened. 264,531 chars of tool_result ingested.

Read order: schema → B5 (full, then 2 pages) → glob dump → names.tsv + meta.json → sheets.json (2 pages) → formulas.tsv (2 pages) → B6 (2 pages) → glob parts → rows.tsv → B2 (5 partial reads) → 2 source meta.json + 1 glob → Write.

## 2. Wall clock (Tehran, 2026-09-02)

| Stage | Start | End | Elapsed | What |
|---|---|---|---|---|
| dispatch | 20:54:57 | — | — | prompt in |
| schema + B5 template | 20:55:01 | 20:55:17 | 16s | 4 calls incl. 1 path error |
| workbook dump | 20:55:28 | 20:55:56 | 28s | names, meta, sheets.json ×2, formulas.tsv ×2 |
| B6 + glob parts | 20:56:12 | 20:56:31 | 19s | 3 calls |
| **silent 75s** | 20:56:31 | 20:57:46 | 75s | thinking (empty in transcript) |
| rows.tsv | 20:57:49 | 20:57:49 | — | 1 call |
| **silent 113s** | 20:57:49 | 20:59:42 | 113s | thinking |
| B2 + source metas | 20:59:45 | 21:00:27 | 42s | 7 calls |
| **silent 85s** | 21:00:27 | 21:01:52 | 85s | thinking → "Now I have everything. Writing the delta." |
| **the Write** | 21:01:52 | 21:08:21 | **389s (46%)** | one 68,899-char tool_use, generated silently |
| write ack | 21:08:22 | — | 1s | "File created successfully" |
| final summary | 21:08:22 | 21:09:10 | 48s | 3,920-char Persian summary |
| **total** | 20:54:57 | 21:09:10 | **853s = 14m13s** | |

## 3. How it built the delta

No plan, no outline, no todo list, no incremental writes. One assistant sentence ("Now I have everything. Writing the delta.") then a single `Write` of 68,899 chars / 50 entries after 389 seconds. Never re-read the file it wrote. Could **not** self-check: `tools: Read, Glob, Write` (quantify.md frontmatter) — no Bash, no Grep, so no `merge facts check`, no `python -c json.load`, not even a line count. It did produce syntactically valid JSON on the first attempt, and the payload validates schema-clean (jsonschema Draft202012Validator: 0 errors).

## 4. What it got wrong / could not know

Reasoning is unrecoverable — all 15 `thinking` blocks are `{"thinking": "", "signature": "CAIS…"}`. What is visible:

- **Ignored the resume offset it was given.** Banner: *"showing lines 1-143 of 208 total (30698 tokens, cap 25000). Call Read with offset=144 limit=143 for the next page, or Grep to find a specific section."* Next call: `offset=168 limit=41`. Lines 144-167 = سوخاری E11/F11/G11/I11 + کانتر B4..G9 (20 of 25). It read only کانتر I9, E10, F10, G10, I10 — yet T-7026's issue reasons about the کانتر consumption/deviation columns.
- **The banner recommends Grep, which this agent does not have.**
- **Sampled `head` read as complete data.** `sheets.json` gives `rows: 9` and a 4-data-row `head` for `Table_KitchenCounter_Last`; the agent wrote «آخرین ردیفش ۴ مرداد ۱۴۰۵ است» as fact.
- **Asserted equality with records it never opened.** 10 ingredient mirrors say «مقادیر سلول‌به‌سلول با رکورد مرجع مبدأ یکی‌اند»; B3 (the source records) was never read.
- **Cross-part refs were lifted from B5, not verified.** All 12 `T-3088..T-3099` refs are correct — I checked them against B3 on disk — but they were copied out of B5's `mirror_of` fields.
- **What it got right, mechanically:** 35/35 `data.named_range` claims match `names.tsv` byte-for-byte; all `foreignKeys` spreadsheetIds match the `SheetsFileIDs` rows of `rows.tsv`; the duplicate-date finding is real (9 of 11 SalesData tabs show `1404/09/14` twice in `head`; AmericanPizza and SinglePizza do not); the scale finding is real (`Table_Pizza_Request` head 13 آذر: rost beef 5000, ham 6000, chicken 8000, while formulas.tsv `پیتزا F7` cached = `0.002`).

## 5. Crash

**None.** The run completed in one turn. But the single Write consumed ~49.6K output tokens (context 189,158 → 238,798) against the 64K cap — **~78% of the ceiling for 50 boilerplate entries.** Any batch with real content at this entry count dies, which is what happened elsewhere.

## 6. Fix message

**None reached this agent** — the transcript's last event is 17:39:10Z, 49 s after the Write. The fix was applied externally: the only diff between the agent's payload and the on-disk `facts-delta-B7.json` is 15 changes, all `"departments": ["warehouse"|"cashier"]` → `"departments": []` (plus a full pretty-print reformat at Sep 3 01:22). Contrast with the other batches, whose transcripts run hours past their first Write:

| Batch | first event | last event |
|---|---|---|
| full-mode | 14:04:35 | 14:51:16 (crash) |
| B1 | 14:55:22 | 18:11:27 |
| B2 | 15:10:28 | 18:10:09 |
| B3 | 15:22:05 | 18:42:55 |
| B4 | 15:48:00 | 18:26:10 |
| **B5** | 16:31:57 | **16:44:59** |
| B6 | 16:45:43 | 19:01:03 |
| **B7** | 17:24:57 | **17:39:10** |
| B8 | 17:39:40 | 18:14:17 |

Only the two mirror batches needed no follow-up.

## 7. Output quality

**Counts:** 50 entries — `record` 50, `item`/`measurement`/`rule`/`note` 0. `data.role`: mirror 35, log (stub) 15. `data.fields[]` 0, `data.rows[]` 0, `processes[]` 0, `accounts[]` 0, `valid_from` 0. `issues[]` on 20 entries, 24 issues: junk 13, column_shift 7, scale 1, unit_kind 1, cross_record 1, bug 1. Avg statement 327 chars.

**Statement-level signals (of 50):** cell `A1` named 35 · `IMPORT_FROM_SHEET` named 35 · «تب پنهان» 35 · `.xlsx` filename 50 · named range in `$A:$M` notation 15 · «خود فایل ... خوانده نشده» 15 · چاله‌باغ comparison 15.

**Sampled statements vs the user's complaints:**

1. T-7016 — «تب پنهان «Table_Pizza_First» ... تنها یک فرمول در A1 دارد که با IMPORT_FROM_SHEET محدوده A:S تب «موجودی اول شب» فایل Pitza.xlsx ... را می‌آورد. ... هر سیزده ستون مبدأ (A تا M) ... زیر محدوده نام‌دار Table_Pizza_First!$A:$M می‌افتند» → **mirror recorded at all + cell/tab/named-range refs + non-quantitative.**
2. T-7033 — «... محدوده A:B تب «personel» ... را می‌آورد. تب داده مستقلی ندارد و آینه رکورد مبدأ است.» → **entire fact is "this tab is a copy of that tab".**
3. T-7028 — «سه ستون آخر (کراکف #766، مخصوص #767 و مخصوص #1) در ردیف‌های نمونه‌برداری‌شده خالی‌اند.» → **trivia, and only true of the 4-row sample.**
4. T-7021 issue(junk) — «عنوان ستون M در این آینه رشته «Column 1» است و همه سلول‌های آن خالی‌اند» → **Excel cosmetic.**
5. T-7001 (stub) — «تب «پیتزا» در فایل Anbar shobe 2.xlsx: به ازای هر شب یک ردیف با تاریخ شمسی ... این رکورد فقط از روی آینه Table_Pizza_Request ... شناخته شده است؛ خود فایل در این پاس خوانده نشده» → **asserts structure + admits ignorance + run vocabulary in permanent text.**
6. T-7025 — «برخلاف تب هم‌نام گزارش شعبه چاله‌باغ اینجا ستون خالی ابتدایی وجود ندارد، پس ... موجودی اول شب لیموناد خوشگوار ##757 به فرمول‌های تب «کانتر» می‌رسد.» → **a fact about two spreadsheets.**
7. T-7042/T-7044/T-7047/T-7048/T-7049 — all end with the identical clause «محدوده وارداتی و محدوده نام‌دار هر دو با فایل گزارش شعبه چاله‌باغ یکی است» → **per-line duplication of one shared statement.**
8. T-7026 issue — «تنها هشت ردیف داده دارد و آخرین ردیفش ۴ مرداد ۱۴۰۵ است ... مصرف اعلامی صفر و انحراف برابر خود مصرف واقعی درمی‌آید» → **the one operationally interesting claim, and it is half-invented.**
9. T-7018 issue(scale) — «۱۳ آذر: گوشت رست بیف ۵۰۰۰ ... سلول F7 تب «پیتزا» ... مقدار ۰٫۰۰۲ می‌دهد ... ستون «مقدار دریافت از انبار» گزارش برای تاریخ‌های اخیر هزار برابر کوچک‌تر از واقعیت است.» → **genuinely valuable, fully evidenced — and it is prose in an `issues[]` description, not a measurement or a rule.**

**Colloquial / transcript speech:** not applicable — the dispatch said "No transcripts this pass" and none appear.

**Boilerplate density:** the 35-times-verbatim template fragment is 3,115 of 16,353 statement chars = **19% of all statement text.** Mean difflib similarity between B5's and B7's 35 twin mirror statements: **0.75**.

**Where it landed:** all 50 in `facts/records.json` (F-00244 onward). 50 of 156 records = **32% of the record store from one 14-minute batch.** Store-wide: 70 mirrors + 30 stubs = **100 of 156 records (64%)**; 30 store records still contain the phrase «در این پاس».

## 8. Tokens

| Metric | Value |
|---|---|
| unique assistant messages | 20 (44 streaming records) |
| wall clock | 853 s |
| Σ `cache_read_input_tokens` over the 20 messages | **2,020,012** |
| Σ `cache_creation_input_tokens` | 417,257 |
| context at last read turn (21:01:52) | 182,743 read + 6,415 created = **189,158** |
| context at final turn (21:09:10) | `cache_read 0`, `cache_creation` **238,798** — peak |
| inferred output of the Write turn | 238,798 − 189,158 ≈ **49,640 tokens (~78% of the 64K cap)** |
| reported `output_tokens` | **unusable** — the 75,376-char Write message reports `output_tokens: 2`; last-record sum across all 20 messages = 3,528 |
| Write payload | 75,376 chars tool input / 68,899 chars file content / 50 entries |
| final summary | 3,920 chars Persian |

## 9. Cross-references into code

- `code-repo/engine/merge_facts/apply.py:334` — QF-43, the check that rejected the 15 stubs.
- `code-repo/engine/merge_facts/apply.py:320` — QF-33 department registry check.
- `code-repo/engine/merge_facts/content.py:~372` — the `foreignKeys` docstring naming the 84 bad members and the `or []` hole.
- `code-repo/engine/merge_facts/verbs.py:219 repair_foreign_keys` — the verb written to delete them (commits `4a513f5`, `5862498`).
- `data-repo/.claude/agents/quantify.md:4` — `tools: Read, Glob, Write`.
- `data-repo/.claude/agents/quantify.md:87` — "never a `foreignKeys` member".
- `data-repo/.claude/agents/quantify.md:217` — stub scope = the workbook's manifest row (contradicts QF-43).
- `data-repo/.claude/agents/quantify.md:75-77` — "per non-empty tab one `record` … a one-formula `IMPORT_FROM_SHEET` tab gets `role: mirror`" — the rule that manufactures the mirrors.