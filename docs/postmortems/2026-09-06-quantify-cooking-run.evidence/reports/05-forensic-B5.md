# forensic:B5

## summary
B5 is the "healthy" batch — it never crashed, never hit the output cap, took 13m02s, and produced a schema-valid 50-entry delta on the first try — and it is still a total loss in value terms: all 50 entries are `record`s, 35 of them `role: mirror` and 15 `stub`, zero items/measurements/rules/notes, and every one of the 50 `statement` strings describes spreadsheet plumbing (hidden tab, IMPORT_FROM_SHEET, A:S range, named range $A:$M) while not one names a unit or carries a quantity. That is precisely the user's "mirror tables recorded at all" and "statements that cite sheet cells/tabs" complaint, and the coordinator's dispatch prompt explicitly ordered it ("most of this pass is thirty-odd small mirror records"). Three defects were baked in before the agent ran: (a) the agent prompt's QF-20 stub rule ("scope the workbook's manifest row") directly contradicts the engine's QF-43 check in apply.py:334, guaranteeing that all 15 stubs would be rejected — they were later blanked to `departments: []`; (b) the same agent prompt forbids a `foreignKeys` member on a mirror, yet the agent put one on all 35 and its own summary brags about it, and the engine's content.py validator had a hole that accepted the IMPORT-shaped member, later requiring a whole new `repair_foreign_keys` engine verb (commit 4a513f5) to clean up 84 such members estate-wide, 35 of them from this batch; (c) obligation 2 also requires "the rule that performs the pull" per IMPORT_FROM_SHEET and the agent wrote zero rules. Mechanically, the agent read 22 times over 10 files, skipped B2 entirely, saw only 60 of 169 lines of B4 (a Read-cap truncation it never paged past, so 53 of 81 prior entries were invisible for QF-34 dedup), and never opened three declared inputs — facts/.index.json (316 KB), the 36 cooking process files, and the .gs script. It planned nothing on paper, spent 3m32s in one silent thinking turn, then emitted the entire 62.5 KB delta in a single 341-second Write of 38,184 output tokens (94% of the run's output in one unretryable call), and could not self-check because its tool list is Read/Glob/Write with no Bash. The one genuinely valuable thing it found — 12 `column_shift` issues showing named ranges silently truncating ingredient columns to zero — is buried inside `issues[]` of the very mirror records that should be deleted, and the check was applied inconsistently: at least six identical truncations (table_pizza_first, table_farangi_first, table_sales_data_italian_pizza, table_sales_data_sandwich, table_ingredients_american_pizza, table_sales_data_steak) went unflagged. Cost: 22 API turns, 2.67M cache-read + 459K cache-create + 40.6K output tokens, context growing 17.7K → 254K, to process about 21.6 KB of actual input signal.

## problems
- [high/orchestration] The whole batch was specified to produce mirror records — the exact artefact the user says should not exist :: Dispatch prompt (first user message, 20:01:57): "Per QF-19 obligation 2 a one-formula import tab is a **`role: mirror` record with `mirror_of` and no `fields[]`** — so most of this pass is thirty-odd small mirror records." Result: 35 of 50 entries are role:mirror. In the merged store /home/lili/Desk
- [high/spec] Agent-prompt stub-scope rule contradicts the engine's QF-43 check — 15 of 50 entries invalid by construction :: .claude/agents/quantify.md §Stubs (QF-20): "**Record stub** … `scope` the workbook's manifest row (`departments`/`branches`)". Manifest rows: Anbar markazi = departments ["warehouse"], Tedade Fooroosh markazi = ["cashier"]. The agent obeyed: T-5001..T-5004 scope departments ["warehouse"], T-5005..T-
- [high/agent-prompt] foreignKeys on all 35 mirrors — explicitly forbidden by the agent prompt, silently accepted by the engine validator, later required a dedicated repair verb :: .claude/agents/quantify.md:87-89: "per `IMPORT_FROM_SHEET` a `mirror_of` and the rule that performs the pull — **never a `foreignKeys` member**, which QF-9 gives a mirror no `fields[]` to build one from." The agent put one on every mirror: `"foreignKeys":[{"spreadsheetId":"1dmH8tCq…","sheet":"موجودی
- [high/agent-prompt] Zero rules produced — the second half of obligation 2 was silently dropped :: quantify.md:87 requires "per `IMPORT_FROM_SHEET` a `mirror_of` **and the rule that performs the pull**". 35 IMPORT_FROM_SHEET formulas in formulas.tsv → 0 rules. The agent's own summary: "همه از نوع record (۰ قلم، ۰ اندازه‌گیری، ۰ قاعده، ۰ یادداشت)". The dispatch prompt never mentioned rules at all.
- [high/orchestration] Three declared inputs never opened — including facts/.index.json, which QF-19 obligation 1 makes mandatory :: Dispatch "## Inputs" lists `process_paths: departments/cooking/processes/*.json` and `facts_index: facts/.index.json`. Full tool-call list (25 calls) contains neither. facts/.index.json is 316,035 bytes; departments/cooking/processes/ holds 36 files. quantify.md obligation 1: "Load the index and the
- [high/harness] Read-cap truncation left B4 read at 36% and B2 unread — QF-34 duplicate avoidance was impossible :: Attachment at transcript line 32: "[Truncated: PARTIAL view — …facts-delta-B4.json: showing lines 1-60 of 169 total (59429 tokens, cap 25000). Call Read with offset=61 … for the next page]". The agent never issued that follow-up: B4 appears exactly once in the tool list (call #10, 20:02:39). T-ids v
- [high/output-format] One 62.5 KB Write at the end — 94% of the run's output in a single 341-second unretryable call :: Tool call #25 at 20:13:54: Write facts-delta-B5.json, content length 62,554 chars. The turn ran 20:08:13→20:13:54 (341 s) with output_tokens=38,184; the run's total output is 40,641, so this one call is 94%. No outline, no plan file, no per-tab incremental writes, no checkpoint. Kinds/counts were de
- [high/validator] The agent structurally cannot validate its own output — tools are Read, Glob, Write with no Bash :: .claude/agents/quantify.md frontmatter: `tools: Read, Glob, Write`. All 25 tool calls are Read/Glob/Write; zero Bash. It read the schema (call #1, 6,617 bytes, untruncated) and then produced 62.5 KB of JSON against it from memory. It never re-read the written file — the Write result even says "file 
- [high/schema] The schema does not constrain `data` at all — every invented shape validates :: code-repo/schemas/facts-delta.schema.json line 98: `"data": { "type": "object" }`. The agent invented `data.import{file_id_named_range, source_sheet, range}`, `data.named_range{name, refers_to}`, `data.foreignKeys[{spreadsheetId, sheet, range, target}]`, `data.mirror_of`, `data.stub`, `role: "mirror
- [high/data-quality] Zero quantitative content: 50/50 entries are records about spreadsheet plumbing, 0 name a unit :: Programmatic scan of the written delta: kinds = Counter({'record': 50}); roles = {mirror: 35, log: 15}; entries with fields[] = 0; with rows[] = 0; with accounts[] = 0; with processes[] = 0. Statements matching /تب |Table_|\.xlsx|ستون [A-Z]|A:[A-Z]|IMPORT_FROM_SHEET/ = 50/50. Statements naming any u
- [high/data-quality] The truncated-range check was applied inconsistently — at least six identical defects went unflagged :: Per-mirror table of import range vs named range: table_ingredients_italian_pizza (A:X vs $A:$V) → 1 issue, but table_ingredients_american_pizza (A:X vs $A:$V, identical shape) → 0 issues. table_sales_data_italian_pizza (A:X vs $A:$O) → 0; table_sales_data_sandwich (A:X vs $A:$O) → 0; table_sales_dat
- [medium/data-quality] The batch's only real findings are trapped inside the entries that should be deleted :: 19 issues across 18 entries: 12 column_shift, 3 junk, 2 code_collision, 1 unit_kind, 1 bug. Several are genuinely valuable — e.g. T-5046: "محدوده وارداتی «A:E» شش ستون کمتر از تب مبدأ است … در نتیجه ردیف «قارچ سوخاری #5» در این آینه کاملاً صفر است، در حالی که در مبدأ ۳۵۰ قارچ سوخاری … دارد" (a silen
- [medium/data-quality] Cross-batch leakage: a finding about B4's tab attached to a B5 record :: T-5048 (gozaresh_markazi__table_ingredients_starter) carries issue kind `bug`: "سلول‌های I9 و K9 و I13 و K13 تب «فرنگی» گزارش، مصرف اقلام ##23 و ##22 را برای غذای شماره ۴ در همین جدول جست‌وجو می‌کنند … نتیجه رشته «ID not found» و سپس خطای #NUM!". The «فرنگی» tab of the report workbook is a non-Table
- [low/data-quality] Verification over-claimed: 'cell-by-cell identical' asserted for rows never in context :: T-5039 statement: "مقادیر آورده‌شده سلول‌به‌سلول با رکورد مرجع مبدأ یکی‌اند", and the final summary generalises it to all twelve: "مقایسه سلول‌به‌سلول دوازده تب نسخه با رکوردهای مرجع پاس سوم نشان داد هر مقداری که آینه می‌آورد دقیقاً با مبدأ یکی است". Cross-checking B3's 69 reference rows against eve
- [medium/harness] The ponytail 'lazy developer / YAGNI / write less' persona was injected into a data-extraction agent :: Transcript attachments at lines 1-2: `{"type":"hook_success","hookName":"SubagentStart:quantify", … "PONYTAIL MODE ACTIVE — level: full\n\n# Ponytail\n\nYou are a lazy senior developer … 1. **Does this need to exist at all?** Speculative need = skip it … Deletion over addition … Shortest working dif
- [medium/orchestration] Bootstrap order violated: the report workbook was processed before the workbooks it points at, manufacturing 15 stubs :: SKILL.md:655-659: "Then the universal seeds under `management` (QF-43), then station and warehouse workbooks, then sales and ingredients, then **the report workbooks**, so cross-workbook references resolve to real records and **few stubs are left to fill**." This run is department-scoped to cooking 
- [medium/output-format] The mandated Persian return summary cost a full 254K-token cache re-creation :: Dispatch "## Return" demands "counts per kind, every `unknown` field, every disputed field with its accounts verbatim, every stub created, the data issues found, and **the full list of `key`s you minted plus the earlier-pass keys you reused**". Result: 5,375 chars of Persian at 20:14:59, largely a v
- [medium/efficiency] 3.13M prompt tokens and 22 API turns to process ~21.6 KB of actual signal :: Per-message accounting: 22 assistant turns; output 40,641; cache_read 2,673,139; cache_creation 458,924; input 43. Context grew 17,702 → 253,968 tokens (14×) over 13m02s. The genuinely load-bearing input is 35 lines of formulas.tsv (~4.5 KB), names.tsv (4,254 B) and rows.tsv (12,879 B) ≈ 21.6 KB. To
- [low/data-quality] Stubs carry invented fields despite the 'nothing but identity' rule :: quantify.md §Stubs: "both the one exception to 'a run only writes what it read', and both writing **nothing but identity**". T-5001 data keys are ['medium','role','location','stub'] with `role: "log"` and `field_status: {"data/role": "inferred"}` — a guessed role on a workbook the agent states in th
- [low/engine] The stub fix left 15 orphan entries scoped to no department at all :: Diff of the agent's Write against the on-disk facts-delta-B5.json: the only change across all 50 entries is `"departments": ["warehouse"|"cashier"] → []` on the 15 stubs. In facts/records.json F-00187 (anbar_markazi__pitza) now reads `"scope": {"departments": [], "branches": ["chalebagh"]}`. Per app
- [low/orchestration] 22 Read calls over 10 files, 14 of them blind offset probes, because prior parts have no index :: Call list: sheets.json ×2, formulas.tsv ×2, B1 ×5 (offsets 100/860/690/920/1250), B3 ×6 (offsets 1/180/148/210/340/123/122 — including two 1-2-line pinpoint probes at 20:08:00 and 20:08:05 purely to confirm that T-3088 = mavade_avalie__pitza_americai before extrapolating T-3089..T-3099). Only meta.j

## details
## 0. Verdict up front

B5 is the control case. It did **not** crash, did **not** hit `max_output_tokens` (40,641 output tokens total against a 64K cap), did **not** receive a fix message, finished in 13m02s, and its delta merged cleanly (all 50 temp ids appear in `id-map.json`). It is still 100% low-value output. **The failure in this batch is not the crash — it is the specification.**

Transcript: `/home/lili/.claude/projects/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-data-repo/ffa1efdd-cf44-4caa-b4e3-9b3853970a43/subagents/agent-a9335cfe8668323f9.jsonl` (79 lines, 646,869 B; 48 assistant records = 22 API turns, 26 user records, 5 attachments). Extracted written delta saved to `/tmp/claude-1000/-home-lili-Desktop-DriveD-work-Moshtaghi-Inja-food-process-process-dev-code-repo/e5187b82-c412-4e53-b8cb-e5802c91a5c1/scratchpad/B5_written.json`; digest at `.../scratchpad/b5.digest.txt`.

**Note on evidence limits:** every `thinking` block in this transcript has `"thinking": ""` with only a `signature` — reasoning content is not persisted. So there are no self-doubt/complaint quotes to mine (item 4 of the brief). What the agent struggled with has to be read off its behaviour, its output, and its final summary.

---

## 1. Inputs handed over vs. what it actually read

Dispatch prompt: 4,807 chars. Declared inputs:

| Declared input | Size | Read? |
|---|---|---|
| `schemas/facts-delta.schema.json` | 6,617 B | ✅ full, call #1 |
| `.dump/1shXFbK…/sheets.json` | 70,063 B | ✅ 2 calls (truncated at line 2745/3549, paged) |
| `.dump/…/formulas.tsv` | 48,980 B | ✅ 2 calls (truncated at 143/207, paged) |
| `.dump/…/names.tsv` | 4,254 B | ✅ full |
| `.dump/…/rows.tsv` | 12,879 B | ✅ full |
| `.dump/…/meta.json` | 742 B | ✅ full |
| `.dump/…/cf.tsv` | 344 B | ❌ globbed 20:02:38, never opened |
| `.dump/…/validations.tsv` | 333 B | ❌ globbed, never opened |
| `.dump/…/comments.tsv` | 23 B | ❌ globbed, never opened |
| `attachments/sheets/manifest.json` | — | ✅ full |
| `parts/facts-delta-B1.json` | 142,501 B | ⚠️ 5 offset reads (100/860/690/920/1250) |
| `parts/facts-delta-B2.json` | 76,655 B | ❌ **never read** |
| `parts/facts-delta-B3.json` | 193,160 B | ⚠️ 6 offset reads |
| `parts/facts-delta-B4.json` | 164,816 B | ⚠️ **1 read, truncated at line 60 of 169, never paged** |
| `facts/.index.json` | 316,035 B | ❌ **never read** (obligation 1 requires it) |
| `departments/cooking/processes/*.json` | 36 files | ❌ **never read** |
| `Gozaresh markazi.gs` | — | ❌ never read (dispatch made it optional) |

**Read-call arithmetic:** 22 Read + 2 Glob + 1 Write = 25 tool calls, 0 errors. 22 Reads over **10 distinct files**; **12 are re-reads** of a file already touched (sheets.json ×2, formulas.tsv ×2, B1 ×5, B3 ×6). **14 of 22 carry an explicit `offset`**; 3 more were silently truncated by the 25K-token cap.

**Coverage of prior parts, measured by which temp ids ever entered context** (regex over all tool_result text): T-1007-1009, T-1044-1066 (25 of B1's 67) · **none of B2's 18** · T-3001-3006 + T-3088-3100 (19 of B3's 100) · T-4001-4028 (**28 of B4's 81**). B4's 73 rules were never visible, so QF-34 rule-duplication checking against the immediately preceding batch of the same workbook was impossible.

The actually load-bearing input for this batch is tiny: **35 lines of `formulas.tsv`** (one `IMPORT_FROM_SHEET` per tab, ~120 chars each), `names.tsv` (4.2 KB) and `rows.tsv` (12.9 KB) — ≈ **21.6 KB**. Total tool_result text pulled into context: **312,307 chars**.

---

## 2. Wall-clock timeline (Tehran, 2026-09-02)

| Stage | Start | End | Dur | What |
|---|---|---|---|---|
| Dispatch received | 20:01:57 | — | — | 4,807-char prompt |
| A. Schema + workbook dump | 20:01:59 | 20:02:31 | 32 s | schema, sheets.json ×2, formulas.tsv ×2, meta.json, names.tsv |
| B. Orientation | 20:02:31 | 20:02:52 | 21 s | 2 Globs, B4 (truncated), manifest.json |
| C. B1 sampling | 20:03:13 | 20:03:39 | 26 s | 5 blind offset reads |
| D. B3 sampling + rows.tsv | 20:03:47 | 20:04:26 | 39 s | 4 offset reads + rows.tsv full |
| **E. SILENT GAP** | **20:04:26** | **20:07:58** | **3 m 32 s** | one turn, thinking only, 2 visible output tokens, no tool call |
| F. Pinpoint id probes | 20:07:58 | 20:08:05 | 7 s | B3 offset 123 limit 2, then offset 122 limit 1 — confirming `T-3088 = mavade_avalie__pitza_americai` |
| **G. The single Write** | **20:08:13** | **20:13:54** | **5 m 41 s** | 62,554 chars, **38,184 output tokens** in one call |
| H. Persian summary | 20:14:05 | 20:14:59 | 53 s | 5,375 chars; `cache_read: 0`, `cache_creation: 253,966` |
| **Total** | 20:01:57 | 20:14:59 | **13 m 02 s** | |

Reading = 2m29s (19%). Silent thinking = 3m32s (27%). Writing = 5m41s (44%). Summarising = 53s (7%). **Generation is 51% of wall clock.**

The 341-second Write is longer than the 5-minute ephemeral prompt-cache TTL, which is why turn H shows `cache_read_input_tokens: 0` alongside `cache_creation_input_tokens: 253,966` — the whole 254K context was re-created at write price.

---

## 3. How it built the delta

- **No plan, no outline, no scratch file.** It went straight from reading to one Write.
- **One giant Write**, tool call #25, 62,554 chars, 50 entries → 1,251 chars/entry.
- **No self-check possible.** `.claude/agents/quantify.md` frontmatter: `tools: Read, Glob, Write`. No Bash → no `merge facts apply --check`, no `python -m json.tool`, no `jq`, no entry count. It read the schema at 20:02:00 and then wrote 62.5 KB against it from memory 12 minutes later.
- **It never re-read its own output.** The Write tool result explicitly discourages it: *"file state is current in your context — no need to Read it back."*
- The two pinpoint reads at F (1 and 2 lines of B3) show it *did* care about ref correctness — it verified `T-3088` and then extrapolated `T-3089..T-3099` by tab order. That extrapolation happened to be correct; nothing verified it. Full ref audit of the written delta: 57 `ref` values, **0 dangling**, all 35 `mirror_of` targets resolve correctly against B1/B3/own. Referential integrity is the one thing this batch got right.

---

## 4. What it got wrong

No thinking text survives, so this is behavioural. Two things it *said*, both over-claims:

> "مقایسه سلول‌به‌سلول دوازده تب نسخه با رکوردهای مرجع پاس سوم نشان داد هر مقداری که آینه می‌آورد دقیقاً با مبدأ یکی است" — 65 of B3's 69 reference rows were in context; 4 (`dish_71`, `dish_309`, `dish_74`, `dish_65`, all in the record T-5039 mirrors) never were.

> "هیچ پیوند فرایندی هم افزوده نشد (این تب‌ها لوله‌کشی پنهان‌اند و هیچ گره فرایندی نامشان را نمی‌برد)" — asserted without opening any of the 36 `departments/cooking/processes/*.json` files.

And one it said as an achievement that is a direct prompt violation:

> "۳۵ رکورد آینه (role: mirror، بدون fields[]، هرکدام با mirror_of و **یک ردیف foreignKeys**)" — vs quantify.md:87 "**never a `foreignKeys` member**".

---

## 5. Crash

None. `stop_reason` is `tool_use`/`None` throughout; peak single-turn output 38,184 tokens against a 64K cap; total output 40,641. No work lost, no fix message in this transcript. The only later edit to `facts-delta-B5.json` came from outside this agent (file mtime Sep 3 01:22 vs the 20:13 write): the 15 stubs' `departments` blanked to `[]`. Nothing else in the 50 entries changed.

---

## 6. Output-quality sample (statements, judged against the user's complaints)

| # | id | statement (abridged) | verdict |
|---|---|---|---|
| 1 | T-5016 | "تب پنهان «Table_Pizza_First» … تنها یک فرمول در A1 دارد که با IMPORT_FROM_SHEET محدوده A:S تب «موجودی اول شب» فایل Pitza.xlsx را می‌آورد." | **mirror + cell refs + non-quantitative** — all three complaints at once |
| 2 | T-5001 | "تب «پیتزا» در فایل Anbar markazi.xlsx … این رکورد فقط از روی آینه Table_Pizza_Request شناخته شده؛ **خود فایل در این پاس خوانده نشده**" | a fact whose content is "we didn't read this" |
| 3 | T-5005 | "تب «americanPizza» در فایل Tedade Fooroosh markazi.xlsx … خود فایل در این پاس خوانده نشده است." | same, ×11 for the sales tabs |
| 4 | T-5039 | "…مقادیر آورده‌شده سلول‌به‌سلول با رکورد مرجع مبدأ یکی‌اند، بنابراین ردیف‌ها اینجا تکرار نشده‌اند" | pure bookkeeping about a copy |
| 5 | T-5040/41/44/45 | identical boilerplate, only the tab name and range letters change | **per-line duplication**, 35× |
| 6 | T-5049 | "…مقدار ستونی که آورده می‌شود (۳۰۰ مرغ فرنگی برای چیکن استیک) با رکورد مرجع مبدأ یکی است" | the one near-quantity in the batch, and it is a restatement of a B3 fact |
| 7 | T-5021 (issue) | "عنوان ستون A در این آینه به‌جای «روز» رشته «Column 1» است … این نقص فعلاً محاسبه را خراب نمی‌کند" | **trivia** — a blank header cell that changes nothing |
| 8 | T-5045 (issue) | "عبارت «پنیر گودا» دو بار تکرار شده … این تکرار فعلاً محاسبه را خراب نمی‌کند" | **trivia** |
| 9 | T-5046 (issue) | "ردیف «قارچ سوخاری #5» در این آینه کاملاً صفر است، در حالی که در مبدأ ۳۵۰ قارچ سوخاری … دارد" | **genuinely valuable** — silent zeroing in the deviation report |
| 10 | T-5048 (issue) | "سلول‌های I9/K9/I13/K13 تب «فرنگی» … نتیجه «ID not found» و سپس #NUM!" | **valuable, but belongs to B4's tab** |

**Counts per kind (all measured, not claimed):**

- `record` 50 / `item` 0 / `measurement` 0 / `rule` 0 / `note` 0
- `role`: mirror 35, log 15 · `stub: true` 15
- `fields[]` 0 · `rows[]` 0 · `accounts[]` 0 · `processes[]` 0 · `field_status` 15
- statements: 50/50 mention a tab/file/column/formula-range; **0/50 name a unit**; median length 240 chars (min 210, max 326) — near-template text
- issues: 19 total (12 `column_shift`, 3 `junk`, 2 `code_collision`, 1 `unit_kind`, 1 `bug`)

**Truncation-check inconsistency (the sharpest quality signal):**

| tab | import | named range | issues |
|---|---|---|---|
| table_ingredients_italian_pizza | A:X | $A:$V | 1 |
| **table_ingredients_american_pizza** | **A:X** | **$A:$V** | **0** ← identical shape |
| **table_sales_data_italian_pizza** | A:X | $A:$O | **0** |
| **table_sales_data_sandwich** | A:X | $A:$O | **0** |
| **table_sales_data_steak** | A:C | $A:$B | **0** |
| table_pizza_last | A:S | $A:$M | 1 |
| **table_pizza_first** | A:S | $A:$M | **0** ← source is A1:U157 (21 cols) |
| **table_farangi_first** | A:S | $A:$M | **0** ← source is A1:W145 (23 cols) |

Named-range values verified against `names.tsv`; source widths against each station workbook's `sheets.json`. Where the check *was* applied it was accurate — every claim I spot-checked (Lasagna $A:$D, Pasta $A:$C, Personel $A:$C, ItalianPizza $A:$V, KitchenCounter $A:$R) is correct.

**Downstream effect on the store** (`facts/records.json`): 156 records, of which **70 are `role: mirror`** — 35 `gozaresh_markazi__table_*` from this batch plus 35 identically-shaped `gozaresh_naharkhoran__table_*` twins from another batch, i.e. the "duplicated per branch" complaint reproduced at record level — and **30 are stubs**. B5 alone put 50 of those 100 there. Store-wide: 139 items, 156 records, **13 measurements**, 156 rules, 22 notes = 486 entries, of which 2.7% are measurements.

---

## 7. Token usage

| Metric | Value |
|---|---|
| API turns (unique assistant message ids) | **22** |
| Total output tokens | **40,641** (94% in one call) |
| Largest single turn | 38,184 (the Write, 341 s ≈ 112 tok/s) |
| Total cache_read | **2,673,139** |
| Total cache_creation | **458,924** |
| Total uncached input | 43 |
| Context, first turn → last turn | **17,702 → 253,968** (14×) |
| Prompt tokens processed overall | ≈ **3.13 M** |
| Actual input signal | ≈ **21.6 KB** |

Turn H (the 53-second Persian summary) alone re-created the full 253,966-token context because the preceding 341-second Write outlived the 5-minute cache TTL.

---

## 8. Cross-references verified in code

- `engine/merge_facts/apply.py:320-323` — department must be in `departments/registry.json` (`warehouse` and `cashier` **are** registered, so this was not the failing check).
- `engine/merge_facts/apply.py:334-335` — QF-43: `if not set(entry["scope"]["departments"]) <= {run_dept}` → "entry … scoped to another department". **This is what rejected the 15 stubs.**
- `engine/merge_facts/content.py:370-392` — the docblock is itself a post-mortem of this defect: *"84 stored records carried an IMPORT descriptor here instead (`{spreadsheetId, sheet, range, target}`), and the membership loop below read `fk.get("fields") or []`, so an absent `fields` was an empty list and every one of them passed this pass cleanly."* B5 supplied 35 of the 84.
- `engine/merge_facts/verbs.py:219-262` — `repair_foreign_keys`, the verb written specifically to undo it (commit `4a513f5`, "a verb that removes, because the ladder never can"). The store now shows **0** foreignKeys members remaining, so the repair has run.
- `code-repo/schemas/facts-delta.schema.json:98` — `"data": { "type": "object" }`, unconstrained.
- `/home/lili/.claude/plugins/cache/ponytail/ponytail/4.9.0/hooks/ponytail-subagent.js` — injects into every subagent when `PONYTAIL_SUBAGENT_MATCHER` is unset (it is).

---

## 9. What a redesign should take from this batch specifically

1. **A mirror tab should produce no entry.** It should add one `mirrored_by` locator to the source record. That alone removes 70 of 156 store records.
2. **The 12 `column_shift` findings are the only output worth keeping.** They are computable deterministically — `named_range width vs import range width vs source tab dimension` is a three-column join over `names.tsv`, `formulas.tsv` and each source `sheets.json`. An engine check would find all ~20, not the 12 an LLM happened to notice. Give the agent the diff table, not the raw TSVs.
3. **A stub for a cross-department workbook has no valid scope under QF-43.** Either QF-43 gains an exception for `data.stub`, or stubs stop existing and the reference stays unresolved until that department's own run — which is what the SKILL.md bootstrap order already implies.
4. **Give the agent one read-only validator command** (Bash allowlisted to `merge facts apply --check`), or the coordinator validates each part before the next dispatch instead of concatenating eight unvalidated parts and discovering 2,068 errors at the end.
5. **Write per tab, not per batch.** 35 small writes cost the same tokens, survive a crash, and make the per-tab checklist structurally enforceable rather than attentional.