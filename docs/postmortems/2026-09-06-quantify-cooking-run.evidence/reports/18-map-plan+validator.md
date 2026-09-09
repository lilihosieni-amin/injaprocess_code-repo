# map:plan+validator

## summary
All 24 tasks of the implementation plan (`docs/superpowers/plans/2026-08-30-quantitative-facts.md`) are DONE — every one maps to a commit in code-repo or data-repo between 2026-08-30 and 2026-09-01, and the facts-scoped engine suite is green (379 passed, 1 skipped in 45s via `.venv/bin/pytest -q -k "facts or merge_facts"`). The plan is exhaustive about engine, schema, backend and UI shape and completely silent about run size: neither the plan's Global Constraints, nor spec §18's twelve "deliberate ceilings", nor runbook 07 §9 records a single bound on delta size, entry count, agent context or output tokens — while ADR 0015 explicitly wrote down the opposite assumption ("the pipeline emits many small turns, not one huge output") and the Opus-5 migration plan listed "large single-response JSON risks truncation" as open risk #1 and never mitigated it. The playbook dispatches exactly one full-mode `quantify` per department with no batching, and its only failure recovery is to re-dispatch the same agent with the same inputs — even though the sibling `process-voice` pipeline solved the same problem in ADR 0011 with verified bounded-parallel batches of 4. The deepest structural defect is the contract gap: `facts-delta.schema.json` types every `data` payload as an open `{"type":"object"}`, so all 32 content-pass rules in `engine/merge_facts/content.py` live nowhere the agent can read them, and the prompt tells the agent the schema is "authoritative". At least 18 of those 32 rules are never stated in `quantify.md` (inputs/outputs/fields/sections keyed by `key`, rows restricted to reserved names + declared field keys, reserved row-member names, `primaryKey`/`foreignKeys` membership, reference-row completeness, constant-vs-rule shape, share arithmetic, `field_status` enum and path existence, Jalali issue dates, the FEEL keyword whitelist, the `sum over … of` aggregate form, and the rule that a `processes[]` link needs a `process`-type source whose `ref` ends in `{proc-id}.json`). One prompt line was outright wrong at run time — obligation 2 said "per `IMPORT_FROM_SHEET` a `foreignKeys` row" — which contradicts spec §8/§9, produced 84 malformed members on 72 records (70 of them mirrors), passed both schema and content pass, crashed the UI, and needed a brand-new `merge facts repair-foreign-keys` verb on 2026-09-06 because the write ladder has no removal action at all. Two harness defects I reproduced: `guard.py`'s `FACTS_CMD_RE` blocks any Bash command that touches `runs/facts/**.json` and contains a mutation token (so `cat parts/*.json > …/facts-delta.json`, `cp`, and even `validate … 2>&1 | tail` are denied — untested in `test_guard.py`), and standalone `validate facts-delta` is *stricter* than `merge facts apply` because it has no store, turning every cross-delta `calls[]` into a false "expr identifier not declared" error. Merging semantics are otherwise excellent for a redesign: I proved empirically that per-work-unit deltas apply incrementally into their own run dirs, that a second delta re-declaring the same natural key merges (and disputes on a differing scalar rather than duplicating), that the title-twin guard catches re-minted duplicates, that cross-delta temp-id refs fail cleanly at exit 2, and that two applies into one run dir silently corrupt `id-map.json` and therefore `revert`.

## problems
- [high/orchestration] Playbook dispatches one full-mode agent per department; no batching, no size bound, no entry-count budget anywhere in spec, plan or runbook :: data-repo/.claude/skills/quantify/SKILL.md:322-340 — Stage 3 is a single `Task: quantify` with mode `full` receiving every dump_path, script_path, image_path and transcript_path for the whole department at once, writing one `{run_dir}/facts-delta.json`. No batch, chunk, per-workbook or per-tab dispa
- [high/orchestration] ADR 0011's proven bounded-parallel-batch-of-4 pattern was never applied to quantify :: code-repo/docs/decisions/0011-extract-bounded-parallel-batch-of-4.md — 'Re-enable Stage-5 extract as bounded parallel batches of at most 4 Task s per message (never full N-way fan-out)', verified live on the 2-CPU server: 11 processes in 3 batches (4+4+3), one ~16-min turn, check_run.py PASS. data-r
- [high/orchestration] Validate-failure recovery re-dispatches the entire full-mode agent with the same inputs, guaranteeing a repeat of the same output-limit crash :: data-repo/.claude/skills/quantify/SKILL.md:353-360 — 'On non-zero exit, re-dispatch `quantify` (mode `full`, same inputs) with the stderr error appended, then re-validate. After 2 failed attempts, STOP'. Gate B's correction path (line ~400) is the same: 're-dispatch only `quantify` (mode full, same 
- [high/harness] guard.py blocks legitimate Bash work on runs/facts/** — shell concatenation, cp/mv, and any command containing 2>&1 :: data-repo/.claude/hooks/guard.py:31 `FACTS_CMD_RE = re.compile(r"(^|[^a-z])facts/[^ ]+\.json")` used with `.search()` at line 99, gated on `MUTATION_RE` (line 33) which matches a bare `>`. Reproduced by piping payloads through the hook: `cat runs/facts/cooking/20260902-080737/parts/*.json > runs/fac
- [high/validator] Standalone `validate facts-delta` is stricter than `merge facts apply`: with no store, every cross-delta `calls[]` becomes a false 'expr identifier not declared' error :: engine/validate/cli.py:33 calls `check_document(instance, kind_of_file)` with no `store` argument; engine/merge_facts/apply.py:346 calls `check_document({...}, "facts-delta", store)`. engine/merge_facts/content.py `_call_keys` resolves `calls[].ref` only through `by_id`, so an unresolved call 'rescu
- [medium/validator] Content pass is inconsistently lenient: an unresolvable `calls[]` fails, an unresolvable aggregate table target is silently skipped :: engine/merge_facts/content.py `_check_expr`: for aggregate bodies, `target = by_id.get(frm["ref"]); if target is None: continue  # unresolvable — F2: skip this body`; for the generic path, an identifier that resolves nowhere always appends a message. Same missing-store condition, two opposite verdic
- [high/agent-prompt] The agent prompt's obligation 2 instructed the agent to write a `foreignKeys` row for every IMPORT_FROM_SHEET mirror — contradicting spec §8/§9 — and nothing caught it :: data-repo `git show e4b2204:.claude/agents/quantify.md` line 87 (the version live during the 2026-09-02 run): 'per `IMPORT_FROM_SHEET` a `foreignKeys` row and `mirror_of`.' Spec :908 defines a mirror as having no `fields[]`, so it has nothing to join on. Result per code-repo/docs/superpowers/plans/2
- [high/spec] facts-delta.schema.json types every payload as an open object, so all 32 content-pass rules are invisible to the agent — while the prompt calls the schema authoritative :: schemas/facts-delta.schema.json `$defs.entry` constrains only `data`'s top-level required keys per kind (item: category+unit; record: medium+role+location; measurement: quantity+unit; rule: inputs+outputs; note: none) and forbids `original_ref`. Nothing inside `fields`, `rows`, `inputs`, `outputs`, 
- [high/agent-prompt] 18 of the 32 content-pass rules are never stated in quantify.md — including that inputs/outputs/fields/sections must be keyed by `key` :: See the details table (item 4). Confirmed absences by grep over data-repo/.claude/agents/quantify.md: refItems=0, primaryKey=0, header_fields=0, reconciled_against=0, 'sum over'=0, unit_raw=0, share (as output share)=0; the word `key` never appears as a member field of inputs/outputs/fields/rows/sec
- [high/engine] The write ladder has no removal action, so any wrong member the agent writes is permanent without a bespoke engine verb :: engine/merge_facts/verbs.py `repair_foreign_keys` docstring: '§11's ladder creates, fills, disputes, appends and unions; it has no action that removes, so no delta can take a key back out — and QF-2 leaves `merge facts` as the only thing permitted to write facts/** at all. `revert` cannot serve eith
- [medium/engine] Two `merge facts apply` calls into one run directory silently corrupt id-map.json and therefore revert :: engine/merge_facts/apply.py `_write_once` writes `id-map.json` and `adopted.json` only if absent. Reproduced: two deltas applied into runs/facts/cooking/20260901-102000 created F-00004 then F-00005; both exit 0; `id-map.json` afterwards holds only `{"T-1": "F-00004"}` — `revert` would leave F-00005 
- [high/agent-prompt] Obligation 2 mechanically manufactures the low-value entries the owner complained about :: quantify.md obligation 2 mandates: 'per formula group one rule … and each literal it consumes as one constant rule per group'; 'per validation a constraints.enum; per conditional-format rule a flag rule with its threshold constant; per cell comment a constant rule or note with source.type: comment';
- [high/agent-prompt] Nothing in the prompt forbids sheet-locator prose in `statement`, and Gate B's own example shows a formula as a statement :: data-repo facts/notes.json F-00465 statement begins «در فایل Kanter.xlsx روی سلول ستون «نوشابه قوطی مشکی ##101» در هر دو تب … سلول F37 …»; another note begins «در تب «OFF اجرایی» فایل Ashpazkhne - Naharkhoran.xlsx ستون …». quantify.md requires locators in `source[]` but says nothing about `statement
- [medium/engine] Branch-scoped notes can never merge: the natural key includes branches, so the same note at two branches is two entries :: engine/merge_facts/apply.py `_natural_key` = (kind, key, tuple(scope.departments), tuple(scope.branches)); engine/merge_facts/__init__.py `find_match` matches on key + canonical scope. Store: facts/notes.json scopes are 19 × ('chalebagh',), 2 × ('chalebagh','naharkhoran'), 1 × ('naharkhoran',) — a p
- [high/data-quality] Per-line rule clones: 36 rules in the store are five shared rules written once per production line :: facts/rules.json title prefixes: 8 × «نشانه انحراف مثبت …», 8 × «نشانه انحراف منفی …», 8 × «دریافت از انبار — …», 6 × «موجودی اول شب لاین…», 6 × «موجودی آخر شب لاین…». The merge machinery would have collapsed them if they shared a key: I verified that a second delta re-declaring an existing natural 
- [high/harness] Known output-token ceiling was documented as a risk and explicitly assumed away for this pipeline :: code-repo/docs/decisions/0015-control-bot-1m-context-window.md:88 — '`maxOutputTokens` for the variant is 64000 (unchanged concern — the pipeline emits many small turns, not one huge output)'. code-repo/docs/superpowers/plans/2026-07-24-opus-5-1m-model-migration.md:171 open risk #1 — '`maxOutputToke
- [high/harness] Whole-run timeout and turn discipline are incompatible with the facts workload :: code-repo/docs/decisions/0007-control-bot-raise-production-budget-caps.md:49 — 'claude_timeout_seconds = 3600 s, whole-run (not per message)'; :48 'max_turns = 200 … CLAUDE_MAX_TURNS=300'. data-repo/.claude/skills/quantify/SKILL.md:18-28 — 'The ONLY legitimate end-of-turn points … are Gate M, Gate A
- [medium/validator] Schema validation reports only the first five errors, truncated, while the content pass reports thousands — both go back to the agent verbatim :: engine/engine_common/__init__.py `validate`: `errors = sorted(v.iter_errors(instance), …); msg = "; ".join(e.message for e in errors[:5])`. engine/validate/cli.py:33-38 prints every content-pass finding to stderr before exit 2. With 485 entries and a systemic shape error, a single content-pass rule 
- [high/spec] No agent-output-quality test exists; the plan deferred the only ones specced :: code-repo/docs/superpowers/plans/2026-08-30-quantitative-facts.md:1711 (self-review checklist) — 'The acceptance fixtures of §17 (classification + cooking PDF) are agent-quality tests, not code tests — they land in Task 14's skill as the written classification test the agent is measured against; aut
- [medium/spec] The design audit that exists covers only the UI; no audit of the pipeline or its output was ever produced :: code-repo/docs/superpowers/plans/facts-design-audit.md — 681 lines, all Task 21 Step 1: §1 screen regions → design values, §2 tokens, §2.1 UNTOKENISED candidates, §3 conformance-note deltas, §4 computed-but-unrendered, §5 rendered-but-never-computed, §6 five consult items, §7 seed facts, §8 inline m
- [low/data-quality] The `units` seed entry F-00001 is red and unconfirmable, contradicting the runbook that says to confirm it :: code-repo/docs/superpowers/plans/2026-09-06-foreignkeys-malformed.md 'Still open from earlier (do not lose)' — 'F-00001 (units) is red and unconfirmable: carton/pack carry factor_to_base: null by spec design, while QF-6 reads an explicit null as «بی‌پاسخ». Contradicts runbook 07 §4, which says to co
- [low/engine] Facts ledger is written non-atomically and per created entry, with no lock :: engine/allocate_id/__init__.py `next_fact_id`: `p.write_text(json.dumps({"fact": nxt}) + "\n", …)` — not `write_json_atomic`, unlike every other engine write. Called once per created entry from `apply._plan`. engine/merge_facts/apply.py module docstring: 'ponytail: five shared files, one writer, no 

## details
## 1. Plan task list — status and produced files

Plan: `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/docs/superpowers/plans/2026-08-30-quantitative-facts.md` (1,713 lines / 132 KB). **Every checkbox in the file is still `- [ ]`** — the plan was never checked off in place; status below is established from commits, not from the document.

**All 24 tasks are DONE.** `git log --oneline --since=2026-08-28` in code-repo, plus data-repo history for Phase 2.

| # | Task | Status | Commit(s) | Files produced |
|---|---|---|---|---|
| 1 | Facts schemas + fixtures | done | `9383c2f`, `2fb477a` | `schemas/facts.schema.json`, `facts-delta`, `facts-index`, `facts-idseq`, `facts-run-meta`, `manifest`, `manifest-proposal`; `tests/fixtures/facts/*.json`; `tests/test_facts_schema.py`; `schemas/README.md` |
| 2 | `allocate-id fact` + global ledger | done | `dd9e794` | `engine/allocate_id/__init__.py` (`next_fact_id`), `engine/tests/test_allocate_id_fact.py`, `facts/.id-seq.json` |
| 3 | `merge_facts` core | done | `f1828dc`, `bba5915` | `engine/merge_facts/__init__.py` (store IO, `find_match`, `canonical_scope`, `derive_status`, `null_paths`, `iter_ref_objects`, `build_index`, `get/set_path`), `test_merge_facts_core.py` |
| 4 | §11 write ladder | done | `e72faf3`, `7fd6833` | `engine/merge_facts/ladder.py`, `test_merge_facts_ladder.py` |
| 5 | `merge facts apply` | done | `74f0a86`, `34b5a46`, `dabacd4` | `engine/merge_facts/apply.py`, `engine/merge/cli.py` facts subtree, `test_merge_facts_apply.py` |
| 6 | `resolve/retire/promote/export` | done | `6cb57ec`, `6114021`, `2bfe309` | `engine/merge_facts/verbs.py`, `engine/tests/facts_helpers.py`, `test_merge_facts_verbs.py` |
| 7 | `revert` | done | `0b8c711`, `db78bfb`, `bb1ae73`, `913bf3f` | `engine/merge_facts/revert.py`, `facts-before/` snapshot in `apply._finalise`, `test_merge_facts_revert.py` |
| 8 | `audit` + `check` | done | `9ba545b`, `baf8aa8` | `engine/merge_facts/audit.py`, `test_merge_facts_audit.py` |
| 9 | `validate facts` content pass | done | `afe8490`, `0641141`, `558682b` (+`5862498` 2026-09-06) | `engine/merge_facts/content.py`, `engine/validate/cli.py`, `test_validate_facts_content.py` |
| 10 | `dump-workbook` | done | `0dde4c5`, `c03913c`, `737324f`, `f853239`, `713394c` | `engine/dump_workbook/`, `engine/tests/fixtures/make_workbook.py`, `test_dump_workbook.py` |
| 11 | `extract-attachment` dispatcher + Vertex vision | done | `52bdb12` | `engine/extract_attachment/`, `test_extract_attachment_dispatch.py` |
| 12 | Tombstone `facts:` warning lines | done | `512e146`, `f5fb291` | `engine/merge/cli.py` `_facts_referencing`, `test_merge_tombstone_facts_warning.py` |
| 13 | Guard + hard rules + gitignore (data-repo) | done | data-repo `98f4872`, `a381f3f` | `.claude/hooks/guard.py` (`FACTS_REL_RE`, `FACTS_CMD_RE`), `test_guard.py`, `CLAUDE.md`, `.gitignore` |
| 14 | `quantify` agent + playbook (data-repo) | done | data-repo `b20293b`, `e4b2204`, `7b8cf15`, `bc53b2d` | `.claude/agents/quantify.md` (276 lines), `.claude/skills/quantify/SKILL.md` (675 lines) |
| 15 | `edit-fact` + relays (data-repo) | done | data-repo `1f7d105`, `69c5042` | `.claude/skills/edit-fact/SKILL.md`, `process-voice` Stage 9, `edit-process` Step 6 |
| 16 | Runbook 07 + doc rows | done | `83668fc`, `cbcca0e` | `docs/runbooks/07-facts.md` (9 sections), `engine/README.md`, `schemas/README.md`, `ARD.md`, `PRD.md`, `CLAUDE.md`, `config/engine.env.example` |
| 17 | Fingerprint, `_kind: fact`, gate, commit column | done | `8341b8e`, `abdd703` | `ui-backend/.../fingerprint.py`, `routers/confirmations.py`, `db.py` migration |
| 18 | `facts_store` bundles | done | `ccbfc5f`, `d388445`, `43a43c8`, `bbfe397`, `5a68842`, `d5bf87e` | `ui-backend/.../facts_store.py`, `store/manifest.py`, `test_facts_store.py` |
| 19 | Read routes, visibility, disclosure | done | `f56cc47`, `2c8a824`, `fb1de3d`, `0d7ea40`, `04aa663`, `f3dfb72`, `981dfd1`, `fc7d963`, `ecef26e` | `ui-backend/.../routers/facts.py`, `access.py`, `visibility.py`, `disclosure.py`, `store/policy.py`, `test_facts_api.py` |
| 20 | Resolve write route + source download | done | `001de3c` | `routers/facts.py` write path, `test_facts_write_and_download.py` |
| 21 | Design audit, labels, types, hooks | done | `d8d9906`, `0143849` | `docs/superpowers/plans/facts-design-audit.md` (681 lines), `ui/src/lib/factsLabels.ts` + test, `ui/src/api/types.ts`, `hooks.ts` |
| 22 | Facts list screen | done | `495e2dd`, `b6c2fca`, `a19a87c`, `573ac23` | `ui/src/facts/FactsList.tsx`, `factsFilter.ts` + tests, `ui/e2e/facts.spec.ts` |
| 23 | Fact detail — five kinds | done | `80e11bb`, `06764c1`, `9c611df`, `17903d5`, `339416d` | `ui/src/facts/FactDetail.tsx`, `cards/*`, `FactConfirm.tsx`, `SourceRow.tsx`, `bundle.ts`, `ui/e2e/fact-detail.spec.ts` |
| 24 | Conformance closure | done | `01df9a6`, `cb15e93`, `d6bc212`, `ca72cbb`, `5687519`, `a8e7d2e`, `a41c312`, `e8305e0` | closure table in `facts-design-audit.md` §9, `guards.test.ts`, sweep spec |

**Post-plan work (not in the plan, all 2026-09-06):** `089d54f` / `5862498` / `4a513f5` / `fbc02c3` — the malformed-`foreignKeys` fix, plan file `docs/superpowers/plans/2026-09-06-foreignkeys-malformed.md`, and the new `merge facts repair-foreign-keys` verb. Plus `2799e5a` (back-nav), `713394c` / `f853239` (dump fixes).

---

## 2. Every recorded limitation, ceiling and "later" item

### 2a. Spec §18 "Deliberate ceilings" (12 items) — `docs/superpowers/specs/2026-08-29-quantitative-facts-design.md`

1. Five shared files, no lock; shard by key hash if concurrency becomes real (QF-2).
2. Persian compared byte-wise everywhere — no NFC/ZWNJ/ی-ي/digit folding. Affects note-statement hashing, QF-17 title equality, and title search.
3. Constant-rule keys are minted; the audit's look-alike report is the backstop.
4. A process link whose cited node is gone is reported, never auto-repaired.
5. Inventory movement is a record field, places are items; revisit when the ERP names its inventory atom.
6. Facts are not in the reader view in v1 — `view`-only gets a uniform 404 on every facts route.
7. No canvas badge for facts (`src/flow/**` frozen, shared with the PDF export).
8. Facts are not in the department PDF export.
9. Facts are not a comment target; FR-K1's four targets stand.
10. No per-gap question or addressee fields on an entry.
11. The raw-JSON view is read-only.
12. `revert` refuses when a later run touched the same paths rather than three-way merging.

**None of these is about run size, output size, agent context, batching, or wall-clock.**

### 2b. Runbook 07 §9 — the two ceilings with no code site
`docs/runbooks/07-facts.md:368-385` — no canvas badge for facts; facts are not a comment target. (Duplicates §18 items 7 and 9.)

### 2c. Plan-level deferrals (`2026-08-30-quantitative-facts.md`)
- **Self-review, line 1711:** "The acceptance fixtures of §17 (classification + cooking PDF) are **agent-quality tests, not code tests** … automating them is **future work, deliberately out of this plan**."
- **Line 1712:** "the only deliberate deferrals are named consult-the-user items (raw JSON view, «متن اصلی») and the §17 agent fixtures above — no TBDs elsewhere."
- **DESIGN LAW (line 15 / 1644):** any UI element with no home in the design → STOP and ask.
- **Line 87 execution order:** phases strictly 1→2→3→4; Phase 4 cannot start before Phase 3's routes exist.
- **Global Constraints:** scoped test runs only; `facts/**` written only by `merge facts`; no cross-file `$ref` in schemas; model ids are env pins (`VERTEX_VISION_MODEL` beside `GEMINI_MODEL`).
- **Task 14, Step 1:** "`model: claude-opus-5[1m]` (the `[1m]` suffix is mandatory — without it the runtime silently gets 200K context)" — **the only model/context statement in the whole 132 KB plan.** No output-token statement anywhere.

### 2d. Design audit (`facts-design-audit.md`) — 100 % UI
§1 screen regions → exact design values; §2 tokens + §2.1 `UNTOKENISED` candidates for the owner (never invented); §3 conformance-note deltas; §4 computed-but-unrendered sweep; §5 rendered-but-never-computed; §6 the five consult items (answered 2026-08-31) + §6.3 four later rulings + §6.4 password-reveal defect; §7 seed facts verified; §8 what the design's inline maps did; §9 conformance closure, §9.1 the one knowingly unpinned note, §9.2 a proposed **eleventh** conformance note (`hasGrid`) still awaiting the owner, §9.3/§9.4 what Task 24 added. **Nothing about the pipeline, the agent, run size or output.**

### 2e. Ceilings recorded elsewhere that bear directly on the failed run

| Source | Limit |
|---|---|
| `docs/decisions/0015-...md:88` | `maxOutputTokens` = **64000**, noted "(unchanged concern — the pipeline emits many small turns, not one huge output)" |
| `docs/decisions/0015-...md:69` | `[1m]` gives `contextWindow: 1000000`; without the suffix, silent 200K |
| `docs/superpowers/plans/2026-07-24-opus-5-1m-model-migration.md:171` | Open risk #1: "`maxOutputTokens` drops 64000 → 32000 on Opus 5 in Claude Code. Large `extract`/`merge` outputs could truncate." |
| `deploy/control-bot.Dockerfile:9-14` | CLI pinned `@anthropic-ai/claude-code@2.1.220`; a stale 2.1.209 layer "capp[ed] claude-opus-5 output at 32K instead of 64K" |
| `docs/decisions/0007-...md:48-54` | `max_turns` 200 → env `CLAUDE_MAX_TURNS=300`; `claude_timeout_seconds` = **3600 s whole-run**; Bash per-command 120 s default → `BASH_*_TIMEOUT_MS=600000`; `claude_max_cost_per_request` raised to **$100** |
| `docs/decisions/0011-...md` | **Bounded parallel batches of at most 4** `Task`s per message — verified live (11 processes, 3 batches, one ~16-min turn) |
| `docs/decisions/0003-...md` | (superseded) the bridge dropped parallel `Task` batches before ADR 0005/0006 |
| `content.py` module docstring | Standalone `validate` has no store, so `calls[]`/aggregate-column resolution is "best-effort there" |
| `apply.py` `_write_once` docstring | "reusing a run dir at all is unsupported" |
| `apply.py` module docstring | `ponytail: five shared files, one writer, no lock` |
| `apply.py` `_title_twin` docstring | `ponytail:` Persian compared byte-wise, no folding |
| `revert` (runbook §6) | A run that adopted a workbook stub **cannot be reverted at all** |
| `foreignkeys-malformed.md` "Still open" | F-00001 units red and unconfirmable; `scroll.ts` has no unit tests; the eleventh conformance note awaits the owner |
| `docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md` | **UNTRACKED / unexecuted** — the guard still blocks read-only Bash |

---

## 3. Test suite layout and how to run only the facts tests

Root `pyproject.toml`: `testpaths = ["upload-bot/tests", "tests", "engine/tests", "ui-backend/tests"]`.

**Engine (Python) facts tests**
```
engine/tests/facts_helpers.py                  70   shared _root/_run_dir/_units_delta/_const_delta/_seed_units
engine/tests/test_merge_facts_core.py         167
engine/tests/test_merge_facts_ladder.py       166
engine/tests/test_merge_facts_apply.py        625
engine/tests/test_merge_facts_verbs.py        193
engine/tests/test_merge_facts_revert.py       176
engine/tests/test_merge_facts_audit.py        590
engine/tests/test_validate_facts_content.py   898
engine/tests/test_allocate_id_fact.py          31
engine/tests/test_dump_workbook.py            545   (+ engine/tests/fixtures/make_workbook.py)
engine/tests/test_extract_attachment_dispatch.py 211
engine/tests/test_merge_tombstone_facts_warning.py 196
tests/test_facts_schema.py                    119
```
`engine/tests/conftest.py` puts `engine/tests` on `sys.path` so `from facts_helpers import …` works as a bare module.

**Backend:** `ui-backend/tests/test_facts_api.py`, `test_facts_confirmations.py`, `test_facts_store.py`, `test_facts_write_and_download.py`.
**Frontend:** `ui/src/facts/*.test.ts(x)` (`bundle`, `FactConfirm`, `FactDetail`, `factsFilter`, `FactsList`, `SourceRow`, `cards/`), `ui/src/lib/factsLabels.test.ts`, `ui/e2e/facts.spec.ts`, `ui/e2e/fact-detail.spec.ts`.

**Run only the facts tests** (from the code-repo root):
```
.venv/bin/pytest -q -k "facts or merge_facts"
```
Verified just now: **379 passed, 1 skipped, 1605 deselected in 45.66 s.**
The `foreignkeys-malformed` plan adds the same command with `or validate`. Note its recorded quirk: **from a git worktree, never pass explicit test file paths** — a rootdir quirk yields `ModuleNotFoundError: conftest`; use `-k` instead. From the main checkout both forms work.
UI: `cd ui && npx vitest run src/facts src/lib/factsLabels guards` and `npx playwright test e2e/facts.spec.ts e2e/fact-detail.spec.ts` (three width projects).

---

## 4. The CONTENT pass contract vs the agent prompt

`engine/merge_facts/content.py` (554 lines) is invoked twice: by `engine/validate/cli.py` with **no store**, and by `apply._preconditions` with the store. **`facts-delta.schema.json` types `data` as an open `{"type":"object"}` with only per-kind required top-level keys, so every rule below is enforced *only* here.**

### 4a. Complete catalogue of emitted messages

| # | Message (literal) | Rule behind it | Stated in `quantify.md`? |
|---|---|---|---|
| 1 | `expr identifier X is not declared by inputs, outputs or a resolvable call` | Under `lang: feel`, every non-numeric token outside KEYWORDS must be an `inputs[].key`, an `outputs[].key`, or a resolvable `calls[].ref` target's `key` | **NO** — the prompt says "`expr` in the FEEL subset … and `calls[]` to their rule keys" but never that every identifier must resolve, nor that a call target contributes its **key** |
| 2 | `expr identifier X is not declared by inputs, outputs, a resolvable call, or the aggregate's table columns` | Inside a `sum over <k> of (...)` body, the referenced record's `fields[].key` are also allowed | **NO** — `sum over` appears 0 times in the prompt |
| 3 | `aggregate 'sum over K of' requires K's from to be {ref, field} with no row` | For every `AGGREGATE_RE` match, that input's `from` must be `{ref, field}` and must NOT carry `row` | **NO** |
| — | (implicit) FEEL keyword whitelist = `if then else and or not min max sum abs round over of` | Any other function name is an undeclared identifier | **NO** — never enumerated anywhere the agent reads |
| 4 | `input K unit U disagrees with REF's V and names no via` | Intra-file only; skipped when `via` is present or `from` is not a dict | **YES** — obligation 7 |
| 5 | `{field|header field|section|input|output} key K is not a minted segment` | `fields`, `header_fields`, `sections`, `inputs`, `outputs` members are keyed by **`key`**, matching `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` | **NO** — the prompt states the segment grammar for *entry* keys only; it never says these five collections have a `key` member at all (this is the `key` vs `name` mismatch) |
| 6 | `output per P is not a minted segment` | `outputs[].per` must be a minted segment | **NO** — `per` is named once, ungoverned |
| 7 | `row key K is not a minted key` | `rows[].key` matches `KEY_RE` (segments joined by `__`) — laxer than #5 | **NO** |
| 8 | `refItems cell F=V on row R is not a minted segment` | A cell under a `refItems` field must hold a minted segment (or a `T-`/`F-` id, substituted by `apply._substitute_ref_items` before this runs) | **NO** — `refItems` appears **0 times** in the prompt |
| 9 | `processes[] ref R does not match the process id grammar` | `^[a-z]+-[0-9]{3}$` | **YES** |
| 10 | `field key K is a reserved row-member name` | No `fields`/`header_fields` key may be one of `key title unit unit_raw section when open retired valid_to supersedes` | **NO** |
| 11 | `primaryKey member M is not a declared field` | | **NO** — `primaryKey` appears 0 times |
| 12 | `foreignKeys member is not an object` | | partially (added 2026-09-06) |
| 13 | `foreignKeys member declares no fields naming the columns it joins on` | `fields` must be a non-empty list of strings | added **only** in `bc53b2d`, 4 days after the run |
| 14 | `foreignKeys member declares no reference naming the entry it points at` | `reference.ref` must be truthy | same |
| 15 | `foreignKeys field M is not a declared field` | | **NO** |
| 16 | `row R names undeclared section S` | | **NO** |
| 17 | `row R member M is not a declared field` | **Every row member must be a reserved name or a declared `fields[].key`** — so a row may carry only `key/title/unit/unit_raw/section/when/open/retired/valid_to/supersedes` plus declared columns | **NO** — prompt says only "its `rows.tsv` cells as `rows[]`" |
| 18 | `reference row R is missing declared field K` | `role: reference` → every **open** row must carry every non-`derived` declared field | **NO** |
| 19 | `output K share S is not in (0, 1]` | | **NO** |
| 20 | `shares sum to X not 1 +/- 0.001` | Only when >1 output carries a share | **NO** |
| 21 | `a constant (no inputs) carries expr/lang` | `inputs == []` → no `expr`, no `lang` | **NO** |
| 22 | `constant output K carries no value or range` | | partially — obligation 5 says "constants (value or range …)" |
| 23 | `a rule with inputs carries no lang` | | **NO** |
| 24 | `a rule with inputs carries no expr or original` (`original_ref` in a store file) | | **NO** |
| 25 | `output K of a rule with inputs carries value or range` | A computed rule's outputs must NOT carry a literal | **NO** |
| 26 | `field_status P has value V, not inferred/informal` | Only these two values | **NO** — obligation 6 says "a `field_status` line", never the enum |
| 27 | `field_status names path P, which does not exist` | The QF-7 path must resolve on this entry | **NO** |
| 28 | `reconciled_against cell field F is not declared here` | | **NO** — 0 mentions |
| 29 | `reconciled_against cell row R is not declared here` | | **NO** |
| 30 | `issue {from_date\|to_date} V is not a Jalali date` | `^\d{4}-\d{2}(-\d{2})?$` | **NO** — `issues[]` dates never mentioned |
| 31 | `source ref R may not cite .structure.md or NAMED_FUNCTIONS.md` | | **YES** — non-negotiables |
| 32 | `processes[] link to P has no process-type source naming its file` | Requires a `source[]` member with `type: "process"` whose **`ref` ends in `{proc-id}.json`** — i.e. the source ref must be the process **file path** | **NO** — the prompt only says a `process` source carries `node`+`quote`; it never says `ref` must be a path ending in the process id's `.json` |

**Score: 4 of 32 messages correspond to a rule the prompt states (#4, #9, #31, partially #22). 18 rules are stated nowhere the agent can read.**

### 4b. Additional prompt/validator asymmetries
- The prompt lists exactly 8 required envelope fields and the per-kind `data` required keys; that is the schema's whole contract, and the prompt correctly calls it "authoritative" — but the schema constrains nothing inside `data`, so "authoritative" is misleading in the one place it matters.
- The prompt says `data.of`, `data.via`, `data.calls[]`, `data.mirror_of`, `data.template_of`, `data.inputs[].from`, `data.outputs[].writes_to`, `issues[].affects` are `{ref}` envelopes. `apply._reference_problems` additionally requires that a named `field`/`row` be **declared by the target** (unless the target is a stub) — the prompt says only "every `{ref}` resolves" (obligation 7).
- Live-at-run-time defect: `git show e4b2204:.claude/agents/quantify.md:87` said *"per `IMPORT_FROM_SHEET` a `foreignKeys` row and `mirror_of`"* — flatly contradicting spec §908 (a mirror has no `fields[]`). Outcome: 84 malformed members on 72 records (70 mirrors, 14 reference), zero correct members store-wide, a UI `TypeError`, and a new engine verb. Re-running today's content pass over the committed run parts still yields exactly **168 messages** (84 × rules #13 and #14) and **0 of any other kind**.

---

## 5. `merge facts apply` — what a redesign can rely on

Read: `engine/merge_facts/apply.py` (753 lines), `ladder.py` (215), `__init__.py`.

### 5a. Order of operations inside one `apply`
1. `read_json(delta)` → `validate("facts-delta.schema.json", …)`.
2. Deep-copy entries; `canonical_scope` each.
3. `load_store(root)` (all five files into memory).
4. `_derive_keys` — substitutes `refItems` cells holding `T-`/`F-` ids with the target's **key**; derives `rows[].key` as `__`-joined `primaryKey` values **only for `role: reference`**; derives every measurement key as `{item.key}__{record.key}__{writes_to.field}`.
5. `_preconditions` — **all of them, over the whole delta, before a single byte is written**. Any problem → each printed as `precondition failed: {msg}` on stderr, `SystemExit(2)`, **store untouched**.
6. `_plan` — decides each entry's target id and action; mints via `next_fact_id` **only on a miss**.
7. `_rewrite_refs` — temp → real ids, this delta only.
8. `_upsert` — create / supersede / merge / adopt.
9. `_finalise` — originals to `facts/originals/{id}.txt`, source hashes + run stamp, `derive_status`, `updated_at` only on actually-changed entries, `facts-before/` snapshot, `save_store`, copy delta, `_write_once` id-map + adopted.

### 5b. Natural keys, scope, matching
- `_natural_key(entry) = (kind, key, tuple(scope.departments), tuple(scope.branches))`.
- `find_match` (in `__init__.py`) tries **sheet identity first** — `(location.spreadsheetId, location.sheet)` among open entries of the same kind (QF-15) — then the natural key. Retired entries never match.
- `canonical_scope` sorts/dedupes; empty `departments` = universal.
- **Preconditions enforced:** duplicate natural key *within* a delta → fail; duplicate sheet identity within a delta → fail; `key` must match `KEY_RE`; every `scope.departments` member must be in `departments/registry.json`; every `scope.branches` member must be in `attachments/sheets/manifest.json`; **every `unit` leaf** (excluding `pack`/`units[]`) must be an open row key of the `units` record (store's ∪ this delta's) — QF-40; **QF-43**: on a *miss*, `scope.departments ⊆ {run_dir.parent.name}`; **QF-34 title twin**: on a miss, no open same-kind same-scope entry may have a byte-equal `title` (notes exempt); keys are immutable — a hit whose stored key differs fails unless the match is a stub.

### 5c. Stubs and accounts
- **Two stub shapes only** (QF-20): a record stub (`data.stub: true`, no `fields[]`) and a workbook stub (`data.stub: true`, `data.grain: "workbook"`, key `ext_<12 hex of sha256(spreadsheetId)>`).
- `_reference_problems` **skips field/row declaration checks when the target is a stub** — a deferred edge, checkable later.
- `_workbook_stub` matches only the **first** real record for a `spreadsheetId`; adoption hands over the stub's **id**, replaces its key + scope, then `_rederive_measurements` re-keys every measurement pointing at it. **A run that adopted a stub cannot be reverted** (runbook §6, `adopted.json`).
- **Accounts:** a delta may declare `accounts[]` on any entry (QF-43); `accounts[].id` is minted by `ladder.with_account_id` / `account_id(field, statement, value, source)`, never by the agent. The ladder's `_dispute` materialises the **incumbent** as an account the first time a field is contested, then appends the challenger. A repeat of a recorded dispute is a `noop`, not a new account. A successor **never inherits** the predecessor's accounts.

### 5d. The write ladder — what merging actually does
Per leaf, by name and shape:
- **Prose leaves** (`statement, grain, method, exceptions, reason, why, description`) — fill once when empty; **never disputed, never rewritten**, at any depth.
- **Union fields** (`source`, `aliases`, `processes`) — pure set-union on a per-field identity; never disputed.
- **Keyed collections** — matched member-by-member with `DEDUP_KEYS` (`accounts`, `issues`, `foreignKeys`, `signatures`, `edge_cases`, `reconciled_against`, `tracked`, `units`, `calls`) or `key` by default; unmatched members are **appended**.
- **Object fields** (`from, via, writes_to, derived, mirror_of, location, pack, movement, range, refItems, constraints, identifier_scheme, fix, of, template_of, supersedes, superseded_by, scope`) — recurse leaf-by-leaf, so `scope` disputes on `scope/branches`, not as a blob.
- **Scalars** — create / fill (`None` or `""`) / noop (equal) / **dispute** (different).
- **Immutable, never touched:** `id, kind, key, status, updated_at, field_status, valid_from, valid_to, retired`.
- **Supersession:** a would-be dispute where the incoming `valid_from` is strictly later (string compare — Jalali is fixed-width) creates a successor instead: deep-copy the incumbent, `_overwrite` the incoming leaves, fresh id, old `valid_to` = incoming `valid_from`, `supersedes`/`superseded_by` links.
- **There is no removal action.** Confirmed by `verbs.repair_foreign_keys`'s docstring; that verb exists solely because of it.

### 5e. Empirically verified answers for a many-small-deltas redesign
Run against a temp `DATA_ROOT` with the real `apply`:

| Question | Answer | Evidence |
|---|---|---|
| Can deltas be applied incrementally, one per work unit? | **Yes.** Each into its own `runs/facts/{dept}/{stamp}/`. | `apply d1 → {'created': ['F-00002']}`; `apply d2 → {'created': ['F-00003']}` |
| Do temp-id refs work **across** deltas? | **No — clean exit 2, nothing written.** | `precondition failed: T-1: reference 'T-9' names no entry in the store or in this delta` |
| Can a delta reference an entry a *previous* delta created? | **Yes, by its real `F-` id** (readable from `id-map.json`, `facts/.index.json`, or the store). Verified with a `calls[]` ref plus a store-resolved `expr` identifier. | `apply d2 (real id ref)` succeeded |
| Two deltas declaring the same natural key? | **Merge, not duplicate.** Second is `updated`, no new id. A differing scalar becomes a **dispute** — `status: disputed`, two accounts materialised. | `apply d4 → {'created': [], 'updated': ['F-00002']}`; `alpha status: disputed` with accounts for values 1 and 2 at `data/outputs/v/value` |
| Duplicate caught if the agent mints a *new* key with the same title? | **Yes, exit 2** (same kind + scope, byte-equal title; notes exempt; byte-wise Persian only). | `precondition failed: T-1: title 'عنوان alpha' is already F-00002's in this kind and scope` |
| Two `apply` calls into **one** run dir? | Both succeed and both write, but `id-map.json` keeps only the **first** — `revert` would leave the second call's entries orphaned. **Silent: exit 0, no warning.** | after two applies: `id-map.json` = `{"T-1": "F-00004"}`, while F-00005 also exists |
| Ordering constraints | The **units record must be applied first, in a run of its own** (runbook §3) — every `unit` leaf is checked against it. `KIND_ORDER` (item, record, measurement, rule, note) governs id minting within one delta so a hit is found before a miss mints. | `apply._plan`, `_unit_row_keys` |
| Revert granularity | Per run dir. `facts-before/` is snapshotted **once** per dir. `revert` refuses if any **later** run's delta touched the same entries — so N batches must be reverted newest-first. A stub adoption cannot be reverted at all. | `apply._snapshot`, runbook §6 |
| Parallel apply | **Unsafe.** No lock on the five store files; `next_fact_id` writes `facts/.id-seq.json` with a plain `write_text` (not atomic) once per created entry. | `apply.py` module docstring; `allocate_id.next_fact_id` |
| Cost per apply | Whole store loaded and all five files rewritten every call. Current store: 486 entries / ~1.3 MB (`items 139`, `records 156`, `rules 156`, `measurements 13`, `notes 22`). N sequential applies = N full rewrites — fine at this scale. | `load_store`/`save_store`; measured file sizes |

**Net for a redesign:** the merge layer is already the right shape for many small deltas. The two rules to design around are (a) **cross-delta references must use real `F-` ids or natural keys, never temp ids**, and (b) **one run directory per delta**, or `revert` silently breaks.

---

## 6. Store-level evidence for the owner's output complaints

| Complaint | Evidence | Instructed by |
|---|---|---|
| "one rule per line" | `facts/rules.json` title prefixes: 8 × «نشانه انحراف مثبت …», 8 × «نشانه انحراف منفی …», 8 × «دریافت از انبار — …», 6 × «موجودی اول شب لاین…», 6 × «موجودی آخر شب لاین…» = 36 rules that are 5 shared rules | obligation 2 "one `rule` **keyed by output**" |
| mirror tables recorded at all | 70 of 156 records are `role: mirror` (45 %) | obligation 2 + spec Appendix A rates "112 hidden mirror tabs → `record role: mirror`" as **clean** |
| useless notes / trivia | `F-00465` «کامنت «149» روی ستون نوشابه قوطی مشکی…» | obligation 2 "per cell comment a constant rule **or note**" |
| statements citing cells/tabs | `F-00465` statement opens «در فایل Kanter.xlsx روی سلول ستون … در تب «موجودی اول شب» سلول F37»; another note opens «در تب «OFF اجرایی» فایل Ashpazkhne - Naharkhoran.xlsx ستون …» | nothing forbids it; Gate B's example in SKILL.md presents «=MINUS(SUM(F6,E6),G6)» as a statement |
| notes duplicated per branch | note scopes: 19 × `('chalebagh',)`, 2 × `('chalebagh','naharkhoran')`, 1 × `('naharkhoran',)` — branch is part of the natural key, so per-branch notes can never merge | QF-4 scope model + no prompt guidance on when to scope |
| colloquial transcript speech | obligation 5: "Read each chosen transcript in full and take **every** quantitative passage" — no quality filter, no de-colloquialisation instruction | obligation 5 |

Rule `lang` distribution in the store: `feel 91`, `sheets 26`, `gs 19`, `None 17`, `cf 1`, `text 1`, `table 1`; constants (`inputs == []`) = 17.