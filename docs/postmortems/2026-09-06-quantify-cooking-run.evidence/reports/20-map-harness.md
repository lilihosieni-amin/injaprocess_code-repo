# map:harness

## summary
The runtime is claude-code-telegram v1.6.0 in SDK-only mode: **one Telegram message = one bounded `claude_agent_sdk` query** (ADR 0002:28-34), so the whole quantify playbook has to survive inside a single assistant turn or the bot prints "✅ Task completed" over an incomplete run. The tool surface is hard-capped to `Read,Write,Edit,Bash,Glob,Grep,Task` (deploy/local/control-bot.env:10) — there is no Workflow tool, no SendMessage, no TaskStop, no Skill tool, and `run_in_background` is unsupported by the bridge (guard-fix plan:228) with background/deferral additionally killed by `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (docker-compose.yml:75). Parallel `Task` fan-out **does** work — batch-of-4 was probed 4/4 and verified on a live server run (ADR 0011) — but the quantify playbook never uses it: Stage 3 dispatches exactly one full-mode `quantify` over 13 workbooks and 3 transcripts (SKILL.md:324-340). That agent's front-matter is `tools: Read, Glob, Write` (quantify.md:5) — no Bash, so it can never run `validate`, count its own entries, or see its own file size; its only output channel is one `Write` whose content burns against the 64,000-token per-message output cap (ADR 0015:69-71, memory note runtime-model-opus-5-1m). The delta it was asked to produce is 877,739 chars (~440K tokens, ~7× the cap); even the largest of the 8 rescue passes, B3, is 170,762 chars (~1.3× the cap). `CLAUDE_CODE_MAX_OUTPUT_TOKENS` is set nowhere in either repo, and raising it would not help — 64000 is the model/CLI ceiling on the pinned 2.1.220 build. The guard hook is a live liability: I ran it locally against the run's real command shapes and reproduced six false-positive classes, including **the sanctioned writer itself** (`merge facts apply --delta runs/facts/... 2>&1 | tail -5` → BLOCKED) and the natural way to concatenate parallel parts (`jq ... > runs/facts/.../facts-delta.json` → BLOCKED); the written fix plan for exactly this exists but is untracked and unapplied. For a parallel redesign the merge side is the tight spot: `merge facts apply` takes a single `--delta` (merge/cli.py:194) and run-dir reuse is explicitly unsupported (apply.py:697-710), so N parts must be concatenated into one delta by a path the guard currently blocks — and `jq` is not even installed in the control-bot image.

## problems
- [high/orchestration] Stage 3 dispatches one full-mode quantify over the whole department; its only output channel is a single Write bounded by the 64K per-message output cap :: data-repo/.claude/skills/quantify/SKILL.md:324-340 (`Task: quantify / mode: full` with all 13 dump_paths + 3 transcripts in one dispatch, no size budget, no split); data-repo/.claude/agents/quantify.md:229-232 output contract = write `{run_dir}/facts-delta.json`; ADR docs/decisions/0015-control-bot-
- [high/agent-prompt] The quantify agent has no Bash tool, so it can never validate, size-check or count its own output :: data-repo/.claude/agents/quantify.md:5 `tools: Read, Glob, Write`; SKILL.md:350 puts `validate facts-delta` in the COORDINATOR's Bash, one stage after the agent has already returned; SKILL.md:357 on non-zero exit the whole full-mode agent is re-dispatched with the stderr appended (a full re-run, not
- [high/harness] The guard hook blocks the sanctioned merge/validate CLIs whenever the command carries any redirect :: data-repo/.claude/hooks/guard.py:33 `MUTATION_RE` begins with `>>?` and :31 `FACTS_CMD_RE = (^|[^a-z])facts/[^ ]+\.json` matches `runs/facts/**/*.json`; :96-100 denies when both match anywhere in the command, uncorrelated. Reproduced locally: `merge facts apply --delta runs/facts/cooking/x/facts-del
- [high/harness] The guard blocks the concatenation step any parallel design needs :: Reproduced: `jq -s '{schema_version:1, entries: map(.entries)|add}' runs/facts/cooking/x/parts/*.json > runs/facts/cooking/x/facts-delta.json` → rc=2; `cat runs/facts/cooking/x/part-B1.json runs/facts/cooking/x/part-B2.json > runs/facts/cooking/x/facts-delta.json` → rc=2; `mv /tmp/x.json runs/facts/
- [high/harness] The guard blocks reads of .claude/** and of any facts path whenever a `>` appears anywhere — including inside a quoted string :: Reproduced: `sed -n 1,80p .claude/agents/quantify.md 2>/dev/null` → rc=2 'runtime cannot edit .claude/** or CLAUDE.md'; `grep -n "mode" .claude/agents/quantify.md 2>/dev/null` → rc=2; `cat .claude/skills/quantify/SKILL.md 2>/dev/null` → rc=2; heredoc python printing `"->"` while opening a `runs/fact
- [high/harness] The written fix for the guard false positives exists but is untracked and was never applied :: code-repo/docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md is listed as `??` in git status; guard.py at data-repo HEAD (commit 98f4872, 2026-08-31) still contains `MUTATION_RE` at line 33 and the uncorrelated block at :96-104; the plan's own verification step (:220) greps for `REDIRECT_
- [high/engine] merge facts apply takes exactly one --delta and run-dir reuse is unsupported, so N parallel parts cannot be applied as N calls :: code-repo/engine/merge/cli.py:193-194 `fap = fsub.add_parser("apply"); fap.add_argument("--delta", required=True)` (single path, no nargs); engine/merge_facts/apply.py:697-710 `_write_once` docstring: "A reused run dir applying a DIFFERENT delta keeps the first call's now-stale artifacts; that is an
- [high/orchestration] The quantify playbook uses no parallelism at all, although bounded parallel Task fan-out is proven working on this exact bridge :: SKILL.md:629-634 stage table — Stage 3 is a single `Task: quantify`; contrast ADR docs/decisions/0011-extract-bounded-parallel-batch-of-4.md:24-44 (batches of 4 verified on the 2-CPU server, 11 processes in one ~16-min turn, stop_reason only tool_use/end_turn, never stop_sequence) and control-bot/te
- [medium/harness] CLAUDE_CODE_MAX_OUTPUT_TOKENS is set nowhere, and setting it cannot raise the ceiling :: grep across code-repo (deploy/, control-bot/, docs/, config/) and data-repo returns zero hits for CLAUDE_CODE_MAX_OUTPUT_TOKENS; data-repo/.claude/settings.json contains only a `hooks` block (no `env`); ADR 0015:69-71 probe output `maxOutputTokens: 64000`; memory runtime-model-opus-5-1m: "on 2.1.209
- [medium/harness] Everything in one Telegram message shares one $100 per-turn budget cap, and the model is told when it is nearly exhausted :: control-bot/patches/0005-raise-production-budget-caps.patch:36-37 raises ProductionConfig `claude_max_cost_per_request` to 100.0; ADR 0007:20-28 — this becomes `ClaudeAgentOptions.max_budget_usd`, a PER-TURN cap, injected as `{"type":"budget_usd","used":1.97,"total":2,"remaining":0.026}` and the mod
- [medium/harness] No background execution and no task-notification channel exists; a design that dispatches and waits for a notification cannot work here :: deploy/docker-compose.yml:75 and docker-compose.local.yml:62 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1"`; ADR 0006:62 "Loses Claude Code's run_in_background capability"; docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md:228 "Problem 4 — run_in_background unsupported by the SDK bridge"; m
- [medium/harness] N>4 parallel subagents is untested on this host, and the host is 2 CPU / 3.7 GB with no cgroup limit on control-bot :: ADR 0011:63 "The batch cap stays 4 pending a separate test of full N-way fan-out"; ADR 0002:57-65 and ADR 0006:32-33 — 2-CPU, 3.7 GB host running 7 containers, extract subagents 44-108 s each, the stall consistently followed the longest one; deploy/docker-compose.yml has `mem_limit: 1g` only on ui-b
- [medium/harness] Per-query wall-clock ceiling is ~3600 s and is invisible from the repo :: ADR 0007:49 "claude_timeout_seconds = 3600 s, whole-run (not per message)"; deploy/local/control-bot.env:25 `CLAUDE_TIMEOUT_SECONDS=3600`; control-bot/runtime.env.example:43 leaves it blank noting "v1.6.0 default 300"; the server value lives in /opt/inja/secrets/control-bot.env which is not tracked.
- [medium/harness] jq is not installed in the control-bot image :: deploy/control-bot.Dockerfile:5-7 apt list = `git curl ca-certificates patch nodejs npm ffmpeg` only; base is python:3.11-slim (:3)
- [medium/harness] Ending a turn mid-pipeline is reported to the user as success :: ADR 0002:28-34 — each Telegram message is one bounded SDK query; "That query ends the instant the model emits an assistant message with no tool call … at which point the bot prints ✅ Task completed"; SKILL.md:35-49 defends against this with prose only ("either your message carries the next Task/CLI 
- [low/harness] Subscription OAuth credential can expire mid-run and needs a container restart, not just a re-login :: docs/runbooks/05-operations.md:67-90 — "401 OAuth access token has expired" happens when the refresh fails/is revoked/is rotated by another login; fix is `docker compose run --rm -it control-bot claude auth login` PLUS `docker compose restart control-bot` because the running container holds the toke
- [low/ux] Progress feedback is throttled to one edit per 2 s and user-facing text may not contain any internals :: control-bot/patches/0002-throttle-progress-updates.patch:43-48 (skip unchanged text, ≥2.0 s between edits); control-bot/README.md:102-105 (unthrottled edits froze the bar mid-run); data-repo/CLAUDE.md:18-29 and memory bot-messages-hide-internals — no paths, no run directories, no CLI commands, no En

## details
## 1. How the Telegram bot drives Claude Code

| Question | Answer | Evidence |
|---|---|---|
| SDK or CLI? | **SDK only.** `USE_SDK` is not even read by v1.6.0's code. | `control-bot/patches/0003-preset-append-system-prompt.patch:21-22` "this bot version is SDK-only — there is no CLI-subprocess fallback and the `USE_SDK` env var is not read by the code"; ADR `0002:28` |
| Turn model | **One Telegram message = one bounded `claude_agent_sdk` query.** Query ends the instant the model emits an assistant message with no tool call; bot then prints "✅ Task completed" regardless of pipeline state. | `docs/decisions/0002-control-bot-pipeline-stall-root-cause.md:28-34` |
| Options passed to the SDK | `max_turns`, `model`, `max_budget_usd`, `cwd`, `allowed_tools`, `disallowed_tools`, `cli_path`, `include_partial_messages=False`, `sandbox`, `system_prompt={preset:claude_code, append:…}`, `setting_sources=["project"]`, `stderr`. **No `max_tokens`, no context/compaction setting.** | ADR `0015:23-35` (verbatim block from `src/claude/sdk_integration.py`) |
| Tool allowlist | `Read,Write,Edit,Bash,Glob,Grep,Task` | `deploy/local/control-bot.env:10`; `control-bot/runtime.env.example:14`; `ARD.md:155` |
| Tool denylist | `["AskUserQuestion","ExitPlanMode","EnterPlanMode"]` | `deploy/local/control-bot.env:11`; `runtime.env.example:19` |
| Allowlist enforced? | Yes — `DISABLE_TOOL_VALIDATION=false` | `deploy/local/control-bot.env:14` |
| **Workflow tool** | **Not available** (not in the allowlist) | allowlist above |
| **SendMessage / TaskStop / Monitor / WebFetch / WebSearch / Skill** | **Not available** (not in the allowlist) | allowlist above. Note `Skill` is explicitly listed in the upstream default (`control-bot/reference/claude-code-telegram-v1.6.0.env.example:87`) and was deliberately dropped (`docs/superpowers/specs/2026-07-08-phase-4-control-bot-design.md:45`). Playbooks are therefore reached as files (`data-repo/CLAUDE.md:102-106` table) plus Read, not through a Skill tool call. |
| **Parallel subagents from one assistant message?** | **Yes, proven at N=4.** `parallel_task_probe.py` dispatches 4 Task agents in ONE message, each `sleep 100`, PASS = 4/4 under the deployed options. A live `/process-voice dining` run then did 11 extracts as 4+4+3 in a single ~16-min turn, transcript `stop_reason` only `tool_use`(75)/`end_turn`(4), never `stop_sequence`. | `control-bot/testing/parallel_task_probe.py:19-20,30-37`; `docs/decisions/0011-extract-bounded-parallel-batch-of-4.md:24-44` |
| Why parallel used to fail | `include_partial_messages=True` made Claude Code treat long parallel `Task`s as deferred tools and drop them (`interrupted_turn` → "Continue from where you left off." → "[Tool result missing due to internal error]" → `stop_sequence` "No response requested."). A/B repro: 3 parallel `sleep 95` agents FAIL with True, PASS with False. | `control-bot/patches/0004-disable-partial-message-streaming.patch:6-21` |
| **In the background?** | **No.** `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; `run_in_background` is "unsupported by the SDK bridge". Subagents run synchronously to completion. | `deploy/docker-compose.yml:75`, `deploy/docker-compose.local.yml:62`; ADR `0006:51-63`; `docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md:228` |
| How results come back | As `tool_result` blocks in the **same turn**. There are **no task notifications** of any kind in this harness. | consequence of the two rows above |

Bot-level patches in force (all baked at `deploy/control-bot.Dockerfile:38-53`): 0001 no follow-up buttons, 0002 progress edits ≤1/2 s, 0003 `--append-system-prompt` (keeps the agentic harness), 0004 `include_partial_messages=False`, 0005 budget caps → 100.0, 0006 input security filter off.

## 2. Timeouts, output tokens, context, models

| Knob | Effective value | Where |
|---|---|---|
| Per-turn cost cap (`max_budget_usd`) | **$100** (was $2 hardcoded by `ProductionConfig`, which clobbers env vars) | `control-bot/patches/0005-…:36-37`; ADR `0007:20-45` |
| Per-query wall clock | **3600 s**, whole-run not per message | ADR `0007:49`; `deploy/local/control-bot.env:25`. Server value is in untracked `/opt/inja/secrets/control-bot.env`; `runtime.env.example:43` notes the v1.6.0 default is 300 |
| Max turns | **300** (server), 200 (local env, overridden by compose) | `deploy/docker-compose.yml:78`; `deploy/local/control-bot.env:24` |
| Per-Bash-command timeout | **1,800,000 ms (30 min)**, default and max | `deploy/docker-compose.yml:84-85` |
| Session timeout | 12 h (ProductionConfig `session_timeout_hours`) | `control-bot/patches/0005-…:39` context line |
| **`CLAUDE_CODE_MAX_OUTPUT_TOKENS`** | **Not set anywhere** in code-repo or data-repo | grep of `deploy/ control-bot/ docs/ config/` + data-repo: zero hits |
| Max output tokens (effective) | **64,000** | ADR `0015:69-71` probe: `"maxOutputTokens": 64000`; memory `runtime-model-opus-5-1m` (2.1.209 → 32000, 2.1.220 → 64000) |
| CLI pin | `@anthropic-ai/claude-code@2.1.220`, pinned precisely because an unpinned rebuild silently kept 2.1.209 and capped output at 32K | `deploy/control-bot.Dockerfile:9-14` |
| Context window | **1,000,000** via the `[1m]` suffix; the bot imposes no context limit of its own | ADR `0015:36-45,69-71`; memory `runtime-model-opus-5-1m` |
| Main session model | `claude-opus-5[1m]` | `deploy/local/control-bot.env:33`; server env untracked (`docs/superpowers/plans/2026-07-24-opus-5-1m-model-migration.md:108-118`) |
| Subagent model | `claude-opus-5[1m]` in front-matter; the `[1m]` suffix works in subagent front-matter (confirmed) | `data-repo/.claude/agents/quantify.md:3`; memory `runtime-model-opus-5-1m` |

**Output-cap arithmetic for this run** (estimate: ~2 chars/token for Persian-heavy JSON):

| File | bytes | chars | entries | ≈ tokens | vs 64K cap |
|---|---|---|---|---|---|
| `facts-delta.json` (final) | 1,013,794 | 877,739 | 485 | ~439,000 | **6.9×** |
| `parts/facts-delta-B3.json` | 193,160 | 170,762 | 100 | ~85,000 | **1.33×** |
| `parts/…-B6.json` | 182,283 | 159,981 | 80 | ~80,000 | **1.25×** |
| `parts/…-B4.json` | 164,816 | 147,711 | 81 | ~74,000 | **1.15×** |
| `parts/…-B1.json` | 142,501 | 124,080 | 67 | ~62,000 | 0.97× |
| `parts/…-B7.json` | 102,847 | 85,318 | 50 | ~43,000 | 0.67× |
| `parts/…-B5.json` | 91,840 | 78,494 | 50 | ~39,000 | 0.61× |
| `parts/…-B2.json` | 76,655 | 66,099 | 18 | ~33,000 | 0.52× |
| `parts/…-B8.json` | 59,979 | 45,581 | 39 | ~23,000 | 0.36× |

Even after the 8-way split, four of the eight passes were at or over the cap. **A safe per-unit ceiling is roughly 60,000 chars ≈ 30K output tokens ≈ 30-35 entries**, i.e. ~15 units for a department of cooking's size, not 8.

Run envelope: `runs/facts/cooking/20260902-080737/meta.json` — `started_at 2026-09-02T08:07:37Z`, `finished_at 2026-09-02T21:52:27Z` (**13 h 44 m**), `actor: telegram-user`, 3 recordings, 13 workbooks, 485 ids minted (F-00002…F-00486).

## 3. The guard hook — what it blocks, and every false positive I reproduced

Registration: `data-repo/.claude/settings.json:5` — `PreToolUse`, matcher `Write|Edit|MultiEdit|NotebookEdit|Bash`. **Read/Glob/Grep are not hooked**, so Read of `.claude/**` is always fine.

Regexes (`guard.py:30-40`):
```
FACTS_CMD_RE   = (^|[^a-z])facts/[^ ]+\.json       # matches runs/facts/**/*.json too
CLAUDE_CMD_RE  = (^|[\s'"/=])\.claude(/|[\s'"]|$)|CLAUDE\.md
MUTATION_RE    = (>>?|\btee\b|\bsed\b[^|]*\s-i|\bperl\b[^|]*\s-i|\bcp\b|\bmv\b|\brm\b|\btruncate\b|\bdd\b)
FACTS_REL_RE   = facts/.+          # used with .fullmatch() in the Write branch
```
Bash branch (`:96-104`): deny if `MUTATION_RE` matches **anywhere** AND a path regex matches **anywhere**. The two are never correlated — that is the whole bug, and it is documented in the unapplied plan (`2026-07-31-guard-false-positive-fix.md:29-35`).

Local reproduction (`python3 data-repo/.claude/hooks/guard.py` with `{"tool_name":…,"tool_input":{…}}` on stdin, the `test_guard.py:9-24` format):

| Command | rc | Verdict |
|---|---|---|
| `merge facts apply --delta runs/facts/cooking/x/facts-delta.json --department cooking 2>&1 \| tail -5` | **2** | **FALSE POSITIVE — the sanctioned writer itself** |
| same without `2>&1` | 0 | allowed |
| `validate --facts-delta runs/facts/cooking/x/facts-delta.json 2>&1 \| head -40` | **2** | **FALSE POSITIVE** |
| `validate --facts-delta … > /tmp/out.txt` | **2** | **FALSE POSITIVE** |
| `jq -s '…' runs/facts/cooking/x/parts/*.json > runs/facts/cooking/x/facts-delta.json` | **2** | **FALSE POSITIVE — the fan-in step** |
| `cat runs/facts/cooking/x/part-B1.json part-B2.json > runs/facts/cooking/x/facts-delta.json` | **2** | **FALSE POSITIVE** |
| `mv /tmp/x.json runs/facts/cooking/s/facts-delta.json` | **2** | **FALSE POSITIVE** |
| `ls -la runs/facts/cooking/*/facts-delta.json 2>/dev/null` | **2** | **FALSE POSITIVE** |
| `wc -l runs/facts/cooking/*/facts-delta.json 2>/dev/null` | **2** | **FALSE POSITIVE** |
| `jq '.entries\|length' runs/facts/cooking/x/facts-delta.json 2>/dev/null` | **2** | **FALSE POSITIVE** |
| `sed -n 1,80p .claude/agents/quantify.md 2>/dev/null` | **2** | **FALSE POSITIVE** (matches the user's report; the `2>/dev/null` is what trips it) |
| `grep -n "mode" .claude/agents/quantify.md 2>/dev/null` | **2** | **FALSE POSITIVE** |
| `cat .claude/skills/quantify/SKILL.md 2>/dev/null` | **2** | **FALSE POSITIVE** |
| heredoc python opening `runs/facts/**/facts-delta.json` and printing `"->"` | **2** | **FALSE POSITIVE** (`->` inside a string is the "mutation") |
| `python3 -c "d=[e for e in x if e['a']>1]" facts/rules.json` | **2** | **FALSE POSITIVE** (`>` as comparison) |
| `cp facts/rules.json /tmp/backup.json` | **2** | **FALSE POSITIVE** (reading OUT of the store) |
| `ls -d runs/facts/cooking/*/` | 0 | **does NOT reproduce as reported** — needs a `.json` in the path |
| `ls -d runs/facts/cooking/*/ 2>/dev/null` | 0 | ditto |
| `sed -n "1,80p" .claude/agents/quantify.md \| head` | 0 | allowed (no `>` anywhere) |
| `python3 /tmp/join_parts.py runs/facts/…/parts runs/facts/…/facts-delta.json` | 0 | allowed — **the guard-clean fan-in route** |
| `git add runs/facts/…/facts-delta.json && git commit -m x` | 0 | allowed |
| `merge facts apply --delta … ` (no redirect) | 0 | allowed |
| Write `runs/facts/cooking/x/parts/facts-delta-B1.json` | 0 | allowed |
| Write `runs/facts/cooking/x/facts-delta.json` | 0 | allowed |
| Write `facts/rules.json` | 2 | correct block |
| Write `.claude/skills/quantify/SKILL.md` | 2 | correct block |
| Write `/tmp/join.py` | 2 | correct block (rule 4, outside repo) — so helper scripts must live inside data-repo, or be created by a `cat > /tmp/x.py <<EOF` heredoc, which IS allowed |

**Precise minimal reproducer for the whole class:** any Bash command containing one of `> >> tee "sed … -i" "perl … -i" cp mv rm truncate dd` anywhere, together with a `.claude` reference or a `facts/…json` substring anywhere. `2>/dev/null`, `2>&1`, `->` and `>` as comparison all qualify as the first half.

**Asymmetry that matters most for a redesign:** the Write tool correctly exempts `runs/facts/**` (`FACTS_REL_RE.fullmatch` fails on a `runs/`-prefixed rel path, `guard.py:66-67`), but the Bash branch does not (`FACTS_CMD_RE` is a `search`, `guard.py:31,99`). So the run directory is writable by the 64K-capped Write tool and not by a shell redirect — exactly backwards from what the pipeline needs.

## 4. Can the quantify subagent run Bash?

**No.** `data-repo/.claude/agents/quantify.md:5` → `tools: Read, Glob, Write`. Consequences, all verifiable:
- it can never run `validate facts-delta` (the playbook runs it two stages later, `SKILL.md:350`);
- it cannot count its own entries, measure its own file, or detect that it is about to hit the output cap;
- it cannot run `allocate-id` (correct — INV-1) nor `merge` (correct — the guard would allow it, the design does not);
- error recovery is a **full re-dispatch** of the same oversized unit with stderr appended (`SKILL.md:357`), bounded at 2 attempts before the playbook stops.

## 5. Cost/latency profile — what drives the 5-20M cached input tokens

Mechanism, in this harness:
1. A subagent's context is re-sent on **every** assistant turn it takes. Billing is per API call, so an agent that makes 40 tool calls pays 40× its then-current context, mostly as `cache_read_input_tokens`.
2. `quantify` full mode is handed `dump_paths` for **13 workbooks** plus 3 transcripts, `.gs` scripts, image descriptions, image files, `process_paths` and `facts/.index.json` (`SKILL.md:330-340`). Each dump directory is 8 files (`sheets.json, formulas.tsv, rows.tsv, names.tsv, cf.tsv, validations.tsv, comments.tsv, meta.json`). That is on the order of 100+ Read calls, each one **appending** to a context that is then re-sent by every later call.
3. The growth is quadratic in reads: N reads over a context that grows with each read ⇒ Σ context ≈ N²/2 × average-read-size. 100 reads × an average live context of 100-200K = 10-20M cache-read tokens for **one** agent. That matches the reported 5-20M exactly.
4. `facts/.index.json` is 316,035 bytes and `records.json` 630,226 bytes today — reading the index into a full-mode agent adds ~150K tokens to *every subsequent turn* of that agent.

What a design should do (all mechanically forced by the numbers above, no speculation):
- **Pre-digest inputs outside the model.** A deterministic CLI pass that reduces a workbook dump to the rows/formulas that could carry a quantitative fact turns a 100-read agent into a 2-read agent. The dump format is already machine-readable TSV/JSON.
- **Few, large reads, once, at the start.** Every read after the first tool call is charged against the whole accumulated context.
- **Never hand an agent the full facts index.** Hand it the slice of keys its unit could collide with.
- **Small outputs by construction.** ≤~30-35 entries / ~60K chars per unit keeps every Write comfortably inside 64K and removes the crash class entirely.
- **Short-lived agents.** An agent that makes 8 tool calls instead of 80 pays roughly 1/100th of the cache-read bill.

## 6. Constraints on a parallel dispatch-N-then-merge design

**Safe N.** 4 is the only verified number (`ADR 0011:24-44,63`, probe `4/4`). Host is 2 CPU / 3.7 GB with 7 containers (`ADR 0002:57-65`, `ADR 0006:32-33`); `control-bot` has **no** `mem_limit` and no `cpus` in either compose file (only `ui-backend` has `mem_limit: 1g`, `docker-compose.yml:127`). Per-agent wall clock is model-wait dominated (`ADR 0011:59`), so 4-way overlaps well; 6-8 is untested and the failure mode if it goes wrong is the container, not the run.

**Cost envelope.** All N agents in one turn share one `max_budget_usd = $100` (`patch 0005:36-37`, ADR `0007:20-28`), and the model is *told* when it is nearly out and stops. At 5-20M cache-read tokens per agent this is a live risk for a single-turn wave; splitting waves across Telegram messages resets the budget but re-opens the "turn ended = ✅ Task completed" hazard (`ADR 0002:28-34`).

**Time envelope.** One query ≈ 3600 s (`ADR 0007:49`). A wave must finish, fan in, and start the next tool call inside that.

**How results arrive.** Synchronously, as tool_results in the same assistant turn. No notifications, no polling, no `TaskStop`. Combined with the memory note *subagents-stall-on-imaginary-monitor*, the dispatch prompt must state explicitly that nothing runs in the background, no monitor exists, and the agent must produce its file and return.

**Fan-in is the hard constraint:**
- `merge facts apply --delta <one file>` — single path, `required=True`, no `nargs` (`engine/merge/cli.py:193-194`).
- Applying parts one-by-one into the same run dir is explicitly unsupported: `_write_once` keeps only the FIRST call's `id-map.json`/`adopted.json` ("A reused run dir applying a DIFFERENT delta keeps the first call's now-stale artifacts; that is an accepted cost, not a bug — reusing a run dir at all is unsupported", `engine/merge_facts/apply.py:697-710`), and `_finalise` copies each delta over `{run_dir}/facts-delta.json` (`apply.py:736-741`), destroying the run record. `_snapshot` is once-per-run-dir (`apply.py:674-694`), so `facts-before/` would still be correct, but `revert` also needs `id-map.json`/`adopted.json`.
- Therefore the N parts **must** be concatenated into one delta before a single `apply`. The obvious shell forms (`cat … >`, `jq … >`, `mv`) are all guard-blocked; `jq` is not installed anyway (`control-bot.Dockerfile:5-7`); a python helper script invoked as `python3 <script> <parts-dir> <out>` is guard-clean and is the only working route today. Fixing the guard (the unapplied plan) removes this whole detour.

**Naming collision.** The agent contract hardcodes `{run_dir}/facts-delta.json` as the output path (`quantify.md:229-232`). N parallel agents given the same `run_dir` would overwrite each other; each unit needs its own `run_dir` or an explicit distinct output path parameter. The rescue run improvised `parts/facts-delta-B{n}.json`, which is not in the contract.

**Turn discipline across waves.** `SKILL.md:35-49` — any status message must ride *inside* the same assistant message as the next tool call, and a prose-only message between waves ends the query and reports success on an unfinished run.

**Operator-visible output.** Persian only, no paths, no run directories, no CLI commands, no English department codes (`data-repo/CLAUDE.md:9-29`, memory `bot-messages-hide-internals`); progress edits are throttled to ≤1 per 2 s (`patch 0002:43-48`).

## Files read
- `code-repo/control-bot/{README.md,runtime.env.example,VERIFICATION.md}`, `control-bot/reference/claude-code-telegram-v1.6.0.env.example`, `control-bot/patches/{0001..0006,README.md}`, `control-bot/testing/{parallel_task_probe.py,README.md}`
- `code-repo/deploy/{docker-compose.yml,docker-compose.local.yml,control-bot.Dockerfile,local/control-bot.env}`
- `code-repo/docs/decisions/{0002,0006,0007,0011,0015}`, `docs/runbooks/05-operations.md`, `docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md`
- `data-repo/.claude/{settings.json,hooks/guard.py,hooks/test_guard.py,agents/quantify.md,skills/quantify/SKILL.md}`, `data-repo/CLAUDE.md`
- `data-repo/runs/facts/cooking/20260902-080737/{meta.json,parts/*}`, `code-repo/engine/merge/cli.py`, `code-repo/engine/merge_facts/{apply.py,verbs.py}`
- memory: `runtime-model-opus-5-1m.md`, `parallel-agent-cap.md`, `subagents-stall-on-imaginary-monitor.md`, `bot-messages-hide-internals.md`, `local-test-bots.md`, `subagents-opus-and-superpowers.md`