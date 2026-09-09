# forensic:bot

## summary
The Telegram run never got to extraction. From the user's first message (11:31:09, killed 2.5 s later by a 401 OAuth error in session 0cc1648f) to the extraction dispatch (12:03:49) took 32m40s, and 24m20s of that was Gate M — confirming manifest rows for all 28 workbooks in the estate when the cooking run needed 13. Gate M cost two Opus subagent dispatches (11m50s for the proposal, 3m00s to apply a one-field correction) to produce something that is ~85% mechanical: 12/28 department assignments are literally the top-level directory name, 22/28 branches are a substring of the directory path, and 45/58 reference tabs are a `Table_Ingredients_*`/`SheetsFileId*` glob. The bot then offered the user an option the engine cannot honour («فعلاً رها کن» — leave the two unresolved rows), because `dump-workbook --manifest` refuses the whole estate on any unconfirmed row (engine/dump_workbook/cli.py:110 `raise SystemExit(2)`); it had to retract at 12:00:13 and re-ask. The user's bare "." at 11:51:46 came 48 s after a 2385-char gate message that named 31 internal identifiers — 4 of 21 bot messages leak short codes, .gs filenames, English department codes and `exit 2`, against the CLAUDE.md rule (the playbook's own example blocks were the source; fixed only afterwards in data-repo 7b8cf15 at 17:30:31 the same day). The full-mode extraction agent dispatched at 12:03:49 was killed at 12:20:44 after 16m55s, 100 tool calls and ~6.7M cache-read tokens, with zero bytes written — its last act was a bare thinking block after announcing "I have read the full estate. Now writing the delta." Nothing of it was salvaged; the terminal session at 17:31 reused the same run dir and redid the work in 8 sequential parts. The user was never told the run had died. The dispatch prompt itself was false: it asserted "facts/ is EMPTY … no facts/.index.json yet", while a parallel terminal run had seeded the units record at 11:45 and the subagent read F-00001 three seconds after starting.

## problems
- [high/orchestration] Full-mode extraction agent killed after 17 min with zero output; nothing salvaged :: bot-sessions/local-bot/06c1a404-e779-4586-834a-2535a5c34406/subagents/agent-a865492fd24aaf812.jsonl — dispatched 2026-09-02T08:33:49Z, last entry 08:50:44Z (16m55s) is a bare `thinking` block with no text/tool_use after it. 100 tool calls, ALL Read/Glob, zero Write. Last visible words (08:49:00Z): "
- [high/ux] The bot never told the user the run died :: Last user-facing message 12:03:14 «ورودی‌ها آماده شد … حالا استخراج اعداد؛ این مرحله طولانی است.» Then the Agent tool_use at 12:03:49 and the transcript stops. No error record, no failure message, no resume offer in 06c1a404…jsonl. Subagent kept running until 12:20:44; the local-bot dir mtime is 12:
- [high/orchestration] The dispatch prompt asserted a state that was already false (stale context + concurrent writer on shared DATA_ROOT) :: Dispatch prompt at 08:33:49Z: "IMPORTANT CONTEXT … facts/ is EMPTY. There is no facts/.index.json yet and no existing entries to match against, so every entry you emit is new … Because the store is empty, the `units` record does not exist yet either." The subagent's first Glob (12:03:52) returned fa
- [high/spec] Gate M is a whole-estate gate blocking a single-department run :: 11:37:31 `dump-workbook --init-manifest` → "manifest: 28 workbooks, 28 awaiting Gate M". The cooking run needs 13 workbooks (12:01:38 set resolution lists 13). Gate M ran 11:37:12 → 12:01:32 = 24m20s of a 27-minute session, and the user was made to classify logistics, dining, cashier, accounting, wa
- [high/engine] The bot offered «فعلاً رها کن», which the engine cannot honour, then had to retract it :: 11:57:59 option 4: «فعلاً رها کن» — این دو ردیف تأییدنشده می‌مانند … چون هیچ‌کدام مربوط به پخت نیستند، به اجرای امروز آسیبی نمی‌زنند.» User answered "4" at 11:58:55. 11:59:16 `dump-workbook --manifest` → `dump-workbook: Tedade Fooroosh markazi.xlsx: manifest row is not confirmed (Gate M)` ×2, `exit=
- [high/ux] Bot messages leak internals (short codes, filenames, English department codes, exit codes) against the CLAUDE.md rule :: 4 of 21 assistant messages carry internals. 11:50:58 (2385 chars, 27 lines, 31 internal tokens): `ashpazkhne_chalebagh`, `tedade_fooroosh_markazi`, `control_gozareshat`, `Table_Ingredients_*`, `chalebagh`/`naharkhoran`. 11:57:59: `cashier`, `accounting`, `management`. 12:00:13: `exit 2`, `Table_Sale
- [medium/ux] Gate M asks a non-technical owner questions only a spreadsheet engineer can answer :: The 11:50:58 gate asks for confirmation of `reference_tabs` (which hidden Excel tabs count as reference), department codes for 15 workbooks belonging to other departments, and branch codes — with a technical footnote «کد شعبه‌ها به chalebagh و naharkhoran (حروف کوچک) تبدیل می‌شود — قالب لازم دفترچه»
- [medium/orchestration] An LLM subagent doing mechanical directory-name mapping: 11m50s and 44 tool calls for an ~85% derivable answer :: agent-a7e44fc04a2dae38c.jsonl: 11:38:11 → 11:49:56 (11m45s), 44 tool calls (39 Read of sheets.json, 4 Glob, 1 Write), ~1.98M cache-read tokens, 30,672-byte proposal. Measured against the manifest: 12/28 departments equal the transliterated top-level dir segment (Amadesazi→preparation, Anbar→warehous
- [medium/orchestration] A one-field correction cost a second full subagent dispatch that rewrote all 28 rows :: agent-a186999ff1c7e1cb5.jsonl: 11:54:28 → 11:57:28 (3m00s), 4 tool calls, one 23,262-byte Write regenerating the entire proposal; 2m23s elapsed between the model's "Applying the correction" (11:54:44) and the Write landing (11:57:07). Its own report: "Only in one mechanical respect: every branch val
- [medium/orchestration] The bot invented an extra user decision from a premise that was already stale :: 11:50:58, section (ه): «این نخستین اجرای اعداد در کل مجموعه است و انبارهٔ داده‌های عددی خالی است. ترتیب توصیه‌شده این است که ابتدا واحدهای اندازه‌گیری و بذرهای عمومی دپارتمان مدیریت ثبت شوند، بعد پخت … اگر بخواهید، می‌توانم اول یک اجرای کوتاه برای مدیریت انجام دهم.» Re-offered as option 3 at 11:51:5
- [medium/agent-prompt] Extraction dispatch mislabels .docx attachments as images, causing a failed binary read :: Dispatch prompt (12:03:49): `image_descriptions:` and `image_paths:` both list the two شرح_شغل .docx / .txt files. At 12:11:12 the subagent ran `Read /data/departments/cooking/attachments/شرح_شغل_سرپرست_آشپزخانه___2_.docx` → "This tool cannot read binary files. The file appears to be a binary .docx 
- [medium/harness] The Read 25K-token cap fights the dump format; 20 of 94 reads had to be paged :: Full agent: 5 read errors — sheets.json 27,472 tok (12:04:42), Gozaresh markazi.structure.md 33,662 tok (12:04:53), formulas.tsv 30,639 tok (12:04:59), cooking-1405-05-26.txt 26,228 tok (12:08:58), plus the .docx binary error. gozaresh_markazi/sheets.json alone was read in 8 pieces (offsets 0/330/73
- [medium/data-quality] "I have read the full estate" was false — the confirmed reference-tab data was never read :: The agent read `rows.tsv` for exactly ONE workbook (mavade_avalie, 12:04:30). It never read rows.tsv for gozaresh_markazi (13 reference tabs) or gozaresh_naharkhoran (13) — the very cells Gate M had just confirmed and `dump-workbook --manifest` had just dumped at 12:01:25. Yet at 12:19:00 it announc
- [medium/data-quality] The dump feeds cosmetic and trivial artefacts into the agent, and they land in the store as "facts" :: 12:07:20 the agent read kanter/comments.tsv whose entire content is `موجودی اول شب F37 unknown 149` and `موجودی آخر شب D36 unknown 149`. The store now holds F-00465 «کامنت «149» روی ستون نوشابه قوطی مشکی در فایل کانتر» as a note (data-repo/facts/notes.json, source type `comment`, cell F37). The agen
- [medium/spec] Mirror workbooks were scoped into cooking at Gate M, so the same recipe tables entered the run three times :: manifest-proposal.json: gozaresh_markazi → departments ['cooking'], 13 reference tabs (12× Table_Ingredients_* + SheetsFileIDs); gozaresh_naharkhoran → identical; mavade_avalie → ['cooking'], its 12 recipe tabs. The proposal's own reasons say the duplication out loud: mavade_avalie/chalebagh — «همین
- [medium/harness] 401 OAuth error silently ate the user's first request :: bot-sessions/local-bot/0cc1648f-1b7a-413b-810d-1b89dde0ad46.jsonl is 8 lines total: user «میخوام داده های کمی دپارتمان پخت رو پردازش کنی» at 2026-09-02T08:01:09Z, synthetic assistant reply 2.5 s later "Failed to authenticate. API Error: 401 OAuth access token has been revoked." (apiErrorStatus 401, 
- [low/validator] An engine error was masked and reported to the user as normal :: 12:03:06 the bot chained `extract-attachment cooking`, `extract-attachment --path attachments/sheets` and two `ls` calls in one Bash command. Result at 12:03:10: `is_error: true`, "Exit code 2", body contains `exit1=0`, `skipped manifest.json: no converter for .json files`, `exit2=3`. The bot told t
- [low/ux] Twelve minutes of silence at the gate by design :: 11:38:07 Agent dispatch → 11:49:57 result: 11m50s with no message to the user. 11:54:28 → 11:57:28: another 3m00s. The playbook forbids the only remedy: quantify/SKILL.md — "Never send a prose-only message between stages (a message with no tool call ends the turn — the #1 stall); status text rides w

## details
## Sessions read

| File | Lines | Window (Tehran) | Wall clock |
|---|---|---|---|
| `bot-sessions/local-bot/0cc1648f-1b7a-413b-810d-1b89dde0ad46.jsonl` | 8 | 11:31:09 – 11:31:12 | 2.5 s (401) |
| `bot-sessions/local-bot/06c1a404-e779-4586-834a-2535a5c34406.jsonl` | 166 | 11:36:41 – 12:03:49 | 27m08s |
| `…/subagents/agent-a7e44fc04a2dae38c.jsonl` (manifest, propose) | 107 | 11:38:11 – 11:49:56 | 11m45s |
| `…/subagents/agent-a186999ff1c7e1cb5.jsonl` (manifest, anbar fix) | 15 | 11:54:28 – 11:57:28 | 3m00s |
| `…/subagents/agent-a865492fd24aaf812.jsonl` (full extraction) | 246 | 12:03:49 – 12:20:44 | 16m55s, **killed** |

Cost/limits recorded: `budget_usd` used **$0.062** of $100 at 12:03:10; `deploy/local/control-bot.env` sets `CLAUDE_TIMEOUT_SECONDS=3600`. Neither explains the 12:20:44 kill; nothing in either transcript records a cause. Note: `message.usage.output_tokens` in these logs is a partial streaming snapshot (a 23,262-byte `tool_use` is logged as `output_tokens: 2`), so output-token sums are unreliable — cache-read totals and wall clock are the usable signals.

## Timeline (Tehran, 2026-09-02)

| Time | Δ | Event |
|---|---|---|
| 11:31:09 | | User (session 0cc1648f): «میخوام داده های کمی دپارتمان پخت رو پردازش کنی» |
| 11:31:12 | +3 s | `Failed to authenticate. API Error: 401 OAuth access token has been revoked.` Session dies. |
| 11:36:41 | +5m29s | User re-sends the same sentence, new session 06c1a404 |
| 11:36:44 | +3 s | `Skill: quantify پخت` |
| 11:36:48–11:36:59 | | 3 Bash probes. `ls facts/` returns **empty** — the premise every later message rests on |
| 11:37:12 | | `dump-workbook --init-manifest` → 19 s → "manifest: 28 workbooks, 28 awaiting Gate M" |
| 11:37:41 | | `Write runs/facts/cooking/20260902-080737/meta.json` |
| 11:38:07 | | **Agent dispatch #1** (manifest mode, 28 rows) |
| *11:45* | | *(parallel terminal session writes the `units` record — run `runs/facts/management/20260902-081500`, later commit e1ed655)* |
| 11:49:57 | **+11m50s** | Agent #1 returns. 44 tool calls, ~1.98M cache-read tokens, 30,672-byte proposal |
| 11:50:00–11:50:20 | | validate (OK) + 3 inspection Bash calls |
| 11:50:58 | | **Gate M message** — 2385 chars, 27 lines, 31 internal identifiers, 3 `?` rows, plus an unrequested "run management first" option |
| 11:51:46 | +48 s | User: `.` |
| 11:51:58 | | Bot re-offers 3 options (471 chars) |
| 11:53:56 | +2m | User: «تایید / انبار برای هردو شعبه است» |
| 11:54:28 | | **Agent dispatch #2** (apply one correction) |
| 11:57:28 | **+3m00s** | Agent #2 returns; rewrote all 28 rows (23,262-byte Write, 2m23s to emit) |
| 11:57:59 | | Bot asks about the 2 remaining `?`, offering **impossible option 4 «فعلاً رها کن»** |
| 11:58:55 | +57 s | User: `4` |
| 11:59:10 | | Manifest written: "confirmed: 26 left unconfirmed: ['tedade_fooroosh_markazi', 'tedade_fooroosh_naharkhoran']" |
| 11:59:16 | | `dump-workbook --manifest` → **exit=2**, two "manifest row is not confirmed (Gate M)", nothing written |
| 11:59:29–11:59:45 | | Bot digs for evidence in the two blocked workbooks |
| 12:00:13 | | **Retraction**: «فعلاً رها کن» عملاً ممکن نیست…`exit 2`، هیچ‌چیز نوشته نشد» + 5 new options |
| 12:00:57 | +44 s | User: `2` (cashier) |
| 12:01:20 | | Both rows confirmed; manifest validates |
| 12:01:25 | +7 s | `dump-workbook --manifest` → exit 0. **Gate M closes at 12:01:32 — 24m20s after it opened** |
| 12:01:38 | | Set resolution: 13 cooking workbooks, 3 scripts, 2 docx, 8 transcripts |
| 12:02:01 | | **Gate A message** — 1599 chars, 31 lines, 24 internal identifiers |
| 12:02:58 | +58 s | User: «فقط مورد 6و7و8» |
| 12:03:06 | | `extract-attachment` chain → `is_error: true`, "Exit code 2", `exit2=3` — reported to the user as «طبیعی است» |
| 12:03:49 | | **Agent dispatch #3** (full extraction). Parent transcript ends here |
| 12:20:44 | +16m55s | Subagent's last entry: a bare thinking block. **Killed. No file written.** |

Total from the user's first attempt to the extraction dispatch: **32m40s**. Extraction output: **none**.

## Gate M economics

Two Opus dispatches, 14m45s, ~2.06M cache-read tokens, 48 tool calls, to produce a 30 KB proposal that is overwhelmingly derivable from paths and tab names:

| Field | Mechanically derivable | Needs judgement |
|---|---|---|
| `departments` | **12/28** from the top-level dir segment alone (Amadesazi→preparation, Anbar→warehouse, Ashpazkhane→cooking, Hesabdari→accounting, Logestic→logistics, Salon→dining, Sandogh→cashier, Gozareshat→management). A leaf-name map over `MandeShab__*` (Pitza/Farangi/Kanter/Sokhari/FRIED→cooking, Anbar*→warehouse) reaches **24/28** | 4 (of which 2 came back as `?` and went to the user anyway) |
| `branches` | **22/28** are literally a substring of the dir path (`ChaleBagh`/`Naharkhoran`) | 6 dual-branch/shared calls |
| `reference_tabs` | **45/58** match the glob `Table_Ingredients_*` / `SheetsFileId*`; mavade_avalie's 12 = *every* tab in the workbook | 3 (`اهداف فروش`, `مواد حساس`, `مواد عادی`) |

`reasons`: 119 entries, avg 102 chars, and never shown to the user. Most are boilerplate repeated verbatim: «جدول BOM: سطرها با کد آیتم منو #N و ستون‌ها با کد ماده ##N، بدون ستون تاریخ.» ×12 in *each* of gozaresh_markazi, gozaresh_naharkhoran and control_gozareshat.

The genuinely valuable judgement — the part worth an LLM — was small and is visible in the agent's own summary: reading the hidden `SheetsFileIDs` tab to pin the branch of the eight unnamed station workbooks, spotting that `MandeShab__control__Gozareshat` is procurement (columns «موجودی فعلی/بافر/میزان سفارش» + tab «سفارشات ثبت شده»), and *declining* to trust `SheetsFileId_Warehouse_Chalebagh` as evidence for the anbar branch because the same tab labels accounting `Accounting_Chalebagh` while accounting plainly covers both branches. That is roughly 5 of 28 rows.

Sample proposal quality (good end): `control_gozareshat / chalebagh` — «تب مخفی SheetsFileIDs فقط به فایل‌های چاله‌باغ اشاره می‌کند … و مقادیر تب Table_Pizza_Last عیناً با «موجودی آخر شب» ورک‌بوک Pitza چاله‌باغ یکی است.» Sample (weak end): the 12 identical BOM sentences above, and `kanter / chalebagh` — «مسیر پوشه «MandeShab__ChaleBagh__Amar__Kanter»» i.e. the directory name restated.

## What the extraction agent actually did in 17 minutes

100 tool calls (94 Read, 6 Glob, **0 Write**), 76 distinct files, 48 API requests, ~6.73M cumulative cache-read tokens; context at the end ≈292K.

- Read `sheets.json` for all 13 handed dumps ✅
- Read `formulas.tsv`/`validations.tsv`/`comments.tsv`/`cf.tsv` for most ✅
- Read all 3 `.gs` scripts, all 3 transcripts (paged), both `.text` job descriptions, 13 process JSONs ✅
- Read `rows.tsv` for **1 of 13** workbooks (mavade_avalie only) ❌ — never touched the 26 confirmed reference tabs of the two report workbooks that Gate M had just spent 24 minutes confirming and `dump-workbook` had just dumped
- Tried to Read a `.docx` binary (failed) ❌
- Hit the 25K-token Read cap 5 times; paged 20 reads

Then: 12:11:12 → 12:14:07 (2m55s) → 12:19:00 "I have read the full estate. Now writing the delta." → 12:20:44 killed mid-generation.

**Salvage: zero from the extraction.** What *did* survive the bot run: `attachments/sheets/manifest.json` with all 28 rows confirmed, the workbook dumps, and `runs/facts/cooking/20260902-080737/manifest-proposal.json` (mtime Sep 2 12:01). The terminal session re-entered the *same* run dir at 17:31 and produced `parts/facts-delta-B1..B8.json` (Sep 2 22:30 – Sep 3 01:22) totalling ~1.01 MB, merged as commit e802beb "quantify(cooking): 485 created, 0 updated" at 2026-09-03 01:22:34.

## Bot message audit (21 assistant texts)

| Time | Chars | Internals leaked |
|---|---|---|
| 11:50:58 (Gate M) | 2385 | 31 — 28 short codes, `Table_Ingredients_*`, `chalebagh`, `naharkhoran` |
| 11:51:58 (after ".") | 471 | 0 |
| 11:57:59 (`?` question) | 934 | 6 — `anbar`, `tedade_fooroosh_*`, `cashier`, `accounting`, `management` |
| 12:00:13 (retraction) | 1034 | 8 — `exit 2`, `Table_SalesData_*`, `Table_Ingredients_*`, 4 dept codes |
| 12:02:01 (Gate A) | 1599 | 24 — 3 `.gs` filenames, 11 short codes, 8 transcript slugs |
| 12:03:14 | 110 | 1 — `manifest.json` |
| other 15 | 24–128 | 0 (all are one-line status lines riding with a tool call — turn discipline was followed correctly throughout) |

The playbook is the source, not the model: `quantify/SKILL.md`'s Gate M example prints `pitza_cb — MandeShab__ChaleBagh__Amar__Pitza/Pitza.xlsx` and «دپارتمان: cooking». data-repo commit **7b8cf15** (2026-09-02 **17:30:31**, i.e. 5½ hours after this run) rewrites those blocks — «ورودی‌های آمادهٔ اجرای اعداد آشپزخانه», `Pitza.xlsx — خوانده شد` — and its message states the diagnosis outright: "quantify Stage 7 printed two full `merge facts resolve` commands, 8-hex account ids and raw field paths at a non-technical user".

Positives worth keeping: the "." was handled well (three concrete numbered options, no repetition of the wall of text); the retraction at 12:00:13 was honest and came with new evidence rather than a bare "can't"; the turn-discipline rule was never violated (no prose-only message stalled the run).

## Files referenced

- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/bot-sessions/local-bot/06c1a404-e779-4586-834a-2535a5c34406.jsonl`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/bot-sessions/local-bot/06c1a404-e779-4586-834a-2535a5c34406/subagents/agent-a7e44fc04a2dae38c.jsonl`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/bot-sessions/local-bot/06c1a404-e779-4586-834a-2535a5c34406/subagents/agent-a186999ff1c7e1cb5.jsonl`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/bot-sessions/local-bot/06c1a404-e779-4586-834a-2535a5c34406/subagents/agent-a865492fd24aaf812.jsonl`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/bot-sessions/local-bot/0cc1648f-1b7a-413b-810d-1b89dde0ad46.jsonl`
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/runs/facts/cooking/20260902-080737/` (manifest-proposal.json, meta.json, facts-delta.json, parts/)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/.claude/skills/quantify/SKILL.md` (Stage M / Gate M at lines 107–200; Bootstrap-order note at 654–659)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/.claude/agents/quantify.md` (no output-size or batching guidance anywhere)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/engine/dump_workbook/cli.py` lines 96–111 (the all-or-nothing Gate M refusal)
- `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/deploy/local/control-bot.env`
