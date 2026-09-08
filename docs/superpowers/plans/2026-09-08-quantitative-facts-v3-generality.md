# Quantitative Facts v3 — Generality: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pipeline hold for data it has never seen: the estate's conventions become manifest data (I6), one input never stops a run (I5), and the engine's own candidates pass the engine's own gate on generated estates (I4).

**Architecture:** One `Conventions` reader with today's values as defaults, consumed by the three modules that read the estate. The planner's and the assembly's stops are each turned into a held-back candidate or entry with a reason, except the three that protect finished work or guard an engine invariant. A seeded estate generator feeds a property test that asserts build never raises, preflight is clean, and assembly plus simulate never refuse per entry.

**Tech Stack:** Python 3.11/3.12, pytest; JSON Schema draft 2020-12; the Persian prose rules of the v3 design.

**Spec:** `docs/superpowers/specs/2026-09-08-quantitative-facts-v3-generality-design.md` (addendum v3.6). §2's I4, I5, I6 are the acceptance criteria.

## Global Constraints

- Engine CLIs deterministic, `exit 2` with one `facts-plan:` line and nothing written on refusal (ARD §7); INV-1 unchanged; I1, I2, I3 unchanged (`.venv/bin/pytest -q -k facts` must stay green).
- **I6:** after Task 1 no literal branch name, code namespace, placeholder pattern, month name or `Table_` prefix is used for reading the estate outside `merge_facts/conventions.py`'s defaults (a test greps for them).
- **I5:** after Task 2 the only `SystemExit(2)` sites in `facts_plan/build.py` and `facts_plan/assemble.py` are the four the spec keeps; each kept one has a test asserting it still stops.
- **I4:** after Task 3 `test_facts_plan_generality.py` passes over 24 seeds in under 90 s.
- Owner-facing text (gate-b, report) Persian, no internals; engine messages English with the label.
- Tests scoped: `.venv/bin/pytest -q -k "<expr>"` from the worktree root; never explicit file paths from a worktree.
- Commits: one per task, named paths, footer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DPTHdFJLvB9Zr9hb1AySvY
  ```
  Never push. Workspace: code worktree `.claude/worktrees/facts-v3-gate` (branch `facts-v3-gate`); the data-repo is touched only in Task 4 through `dump-workbook --init-manifest`.

## File structure

| file | responsibility |
|---|---|
| `engine/merge_facts/conventions.py` (new) | T1 — `Conventions` dataclass, `load(root)`, `DEFAULTS`, `branch_tokens_for(manifest)` |
| `engine/facts_plan/build.py`, `engine/dump_workbook/__init__.py`, `engine/merge_facts/content.py` | T1 — consume the loaded conventions |
| `schemas/manifest.schema.json`, `schemas/README.md` | T1 — the `conventions` object |
| `engine/facts_plan/build.py` `split_unit`/`plan_units`, `engine/facts_plan/assemble.py` `_target_of`/`_build_entries`/`_resolve_refs`/`report`/`gate_b` | T2 |
| `engine/tests/fixtures/facts_plan/synth.py` (new), `engine/tests/test_facts_plan_generality.py` (new) | T3 |
| `docs/runbooks/07-facts.md` §10, `docs/decisions/0017-facts-pipeline-v3.md` | T2/T1 docs |
| (operational) | T4 — merge, rebuild, `dump-workbook --init-manifest` on the real estate, preflight all nine, one headless run, reset |

Order: T1 → T2 → T3 → final review → T4.

---

### Task 1: Conventions in the manifest (spec §3.1, I6)

**Files:** create `engine/merge_facts/conventions.py`; modify `engine/facts_plan/build.py` (constants at ~222–226 `_CODE_IN_TEXT`, `_PLACEHOLDER`, `_MONTHS`, `_BRANCH_TOKENS`; `strip_branch` ~290; `code_key` ~300; `_TABLE` ~46 and `tab.startswith("Table_")` ~1122; `_BRANCH_TOKEN`/`group_key` ~1417–1430; `_code_slug` ~1528; the `"##"` marker ~685), `engine/dump_workbook/__init__.py` (`_MONTHS` ~533, `_BRANCH_CODES` ~1066 and its use in the manifest proposal ~1139, `init_manifest` ~1147 writes `conventions` when absent), `engine/merge_facts/content.py` (`_CODE_IN_CELL` ~37), `schemas/manifest.schema.json` (`conventions` object, all members optional, `additionalProperties: false`), `schemas/README.md`; tests `engine/tests/test_conventions.py` (new), existing build/dump/content tests unchanged in outcome.

**Interfaces:**
- `merge_facts.conventions.DEFAULTS: dict` — exactly the spec's object.
- `merge_facts.conventions.load(root) -> Conventions` — reads `attachments/sheets/manifest.json` if present; `Conventions` has `branch_tokens: tuple[str]`, `branch_codes: tuple[str]` (from `manifest.branches[].code`, default `("chalebagh", "naharkhoran")`), `code_namespaces: dict[str, str]`, `placeholder: re.Pattern`, `month_names: tuple[str]`, `table_prefix: str`, and derived `code_in_text: re.Pattern` (built from the namespaces, longest first), `code_key(code) -> str` (`##1` → `ing_1`), `code_in_cell: dict[namespace, re.Pattern]`.
- `branch_tokens_for(manifest) -> tuple[str]` — the default token list: every branch code and name, each with `‌`→space, with and without the space, lower-cased, plus `DEFAULTS["branch_tokens"]`.
- `build(root, …)`, `init_manifest(...)`, `check_document(...)` take the conventions from `load(root)` (pass a `conventions=` keyword where a root is not in hand; every existing call site passes it).

- [ ] **Step 1 (RED):** `test_conventions.py`: `load` on a root with no manifest returns the defaults; on a manifest with `branches` `[{"code": "karaj", "name": "کرج"}]` and no `conventions`, `branch_tokens` contains `karaj` and `کرج`; with `conventions.code_namespaces {"@": "sku"}`, `code_in_text` matches `@12` and `code_key("@12") == "sku_12"`; a grep test asserts none of `چاله باغ|ناهارخوران|chalebagh|naharkhoran|فروردین|Column \[0-9\]|Table_` appears in `build.py`, `dump_workbook/__init__.py`, `content.py` outside a comment or docstring. `init_manifest` on a fresh estate writes `conventions` equal to the effective values; on a confirmed manifest without it, adds it; never rewrites an existing one.
- [ ] **Step 2 (GREEN):** implement; thread `conventions` through `build` (module constants become attributes read from the loaded object; module-level regex compiled once per `load`).
- [ ] **Step 3:** `.venv/bin/pytest -q -k "conventions or facts_plan or dump_workbook or facts_content or validate_facts"`; then `-k facts` once. Commit `feat(estate): the estate's conventions are manifest data`.

### Task 2: Every stop classified (spec §3.2, I5)

**Files:** `engine/facts_plan/build.py` `split_unit` (~1568), `plan_units` (the `oversized` issues into `skeleton["issues"]` — `build()` owns the skeleton write; add the issue kind to `ISSUE_TEXT`/`ISSUE_FA` and `RUN_ONLY`); `engine/facts_plan/assemble.py` `_target_of` (~984), `_build_entries` (~1134), `_resolve_refs` (~1200), `_hold_back`, `report`/`gate_b` (the «کنار گذاشته شد: بزرگ‌تر از یک واحد» block and the grouped undecided reasons); `schemas/facts.schema.json` + `facts-delta.schema.json` `issue.kind` gains `oversized`; `docs/runbooks/07-facts.md` §10 gains the stops table; tests in `test_facts_plan_units.py`, `test_facts_plan_assemble.py`, `test_facts_plan_report.py`, `test_facts_schema.py`.

- [ ] **Step 1 (RED):** a unit over budget with no axis: `plan_units` returns the unit without its largest candidate(s) and the skeleton carries an `oversized` issue per set-aside candidate; `gate-b.md`/`report.md` render the block. `merge_into` cycle: `assemble` returns with the cycle's candidates in `undecided[]` (`reason: "cycle"`), the rest in the delta. `merge_into` a dropped target: the merger waits (`reason: "target_dropped"`, `waits_for`). An `F-` ref in no store entry: the entry waits (`reason: "unknown_ref"`, `refused: [...]`). The four kept stops each have a test asserting `SystemExit(2)` (two-units/none invariant; `check_rebuild`; `_outputs` with attempts left; nothing assembled). A grep test counts `raise SystemExit(2)` + `raise _fail(` in the two modules and asserts exactly the kept sites (by message fragment).
- [ ] **Step 2 (GREEN):** implement; the `undecided[]` member shape `{skeleton, kind, label, unit, reason, refused?, waits_for?, waits_for_unit?}`; `report` groups by `reason` with fixed Persian lines.
- [ ] **Step 3:** scoped tests; `-k facts` once; commit `feat(facts): one input never stops the run — every planner and assembly stop classified`.

### Task 3: Generated estates and the property test (spec §3.3, I4, I5)

**Files:** create `engine/tests/fixtures/facts_plan/synth.py`, `engine/tests/test_facts_plan_generality.py`; may extend `engine/facts_plan/preflight.py` (`preflight(root, department, recordings, *, keep=False)` returning the scratch run dir path for the test's assemble step) and `make_dump.py` helpers it reuses (`_tsv`, `_sheet`).

- [ ] **Step 1:** `synth_estate(root, seed, *, departments=1, workbooks=3, conventions=None) -> dict` (what it wrote: workbook shorts, tab names, attachments, transcript names) — every shape of spec §3.3 drawn from `random.Random(seed)`; deterministic per seed.
- [ ] **Step 2 (the property):** `@pytest.mark.parametrize("seed", range(24))`: `build` either returns a dict or raises `SystemExit(2)` after a `facts-plan:` line on stderr (capture; any other exception fails); when it returns, `preflight`'s bare-keep gate yields `engine_refused == 0`; `assemble` over the bare-keep outputs returns (never raises); the delta validates and `simulate` reports `[]`. Seeds that exit 2 must be fewer than 4 of 24, and each exit's line must be one of the kept stops' fragments.
- [ ] **Step 3:** runtime under 90 s (`--durations=3`); commit `test(facts): generated estates — build never raises, the engine's candidates pass its gate`.

### Task 4: Merge, rebuild, real estate (operational, by the controller)

- [ ] Merge into code-repo main; reinstall the engine; rebuild `control-bot`; recreate.
- [ ] In the container: `dump-workbook --init-manifest` on the real estate (adds `conventions` to the manifest; confirm nothing else changed with `git diff --stat`); commit it in the data-repo (host git → restart the bot).
- [ ] `facts-plan preflight` for all nine departments: `engine_refused 0`.
- [ ] One headless run of a department (dining: 2 workbooks, 3 attachments, 3 transcripts) end to end; then reset the store to the seed and hand the owner the state.
