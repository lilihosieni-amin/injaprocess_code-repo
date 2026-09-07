# Quantitative Facts v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-agent facts extraction with a deterministic `facts-plan` CLI that builds candidates from the dumps, small parallel LLM units that decide them, one reviewer, and an engine-written Gate B and report — so a department's quantitative facts are extracted in one turn, without cell references, per-line copies, mirrors or colour rules in the store.

**Architecture:** Three phases, each ending in working, testable software. Phase 1 changes the engine and schemas under the existing `merge facts` verbs (closed payloads, a preconditions module shared by `validate` and `apply`, an in-memory apply, the prose lint, the dumper's row capture and manifest pre-fill, the audit detectors, the guard fix) and resets the store. Phase 2 adds the `facts-plan` package (`build` → `skeleton.json`/`plan.json`/`units/*/input.md`; `digest`/`assemble` → the delta, `assembly.json`, `gate-b.md`; `report`; `status`) plus `validate facts-unit`, all fixture-tested against a frozen re-dump of the cooking estate. Phase 3 rewrites the runtime prompts and playbook in `data-repo`, renders the three new structures in the panel, updates the docs, and rebuilds cooking.

**Tech Stack:** Python 3.12 (stdlib + `jsonschema` via `engine_common.validate`), pytest; JSON Schema draft 2020-12; React + TypeScript + Vite with vitest (`ui/`); FastAPI (`ui-backend/`); Claude Code runtime prompts in Markdown (`data-repo/.claude/`).

**Spec:** `docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md` (v3.3). The plan argues from the spec; executors read both. The interface contract every task shares is reproduced in **§ Interfaces** below.

## Global Constraints

- All components communicate only through the filesystem under `DATA_ROOT`; no network calls between components (ARD §1). Every engine CLI is deterministic and checks its preconditions (ARD §7); `exit 2` on a failed precondition with nothing written.
- IDs are minted only by `allocate-id`, invoked only by `merge facts apply`; `validate --store --run` mints in memory and never writes the ledger (spec §4).
- `facts/**` is written only by `merge facts` (INV-1); every other artefact of a run lives under `runs/facts/{dept}/{stamp}/`.
- Persian in `title`, `statement` and every prose field; ASCII keys; no key segment derived from Persian text (QF-46); the two identifier grammars are `SEGMENT_RE` `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` and `KEY_RE` `^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$` (`engine/merge_facts/__init__.py:17-18`).
- Owner-facing text carries no command, path, account id, unit id, stage letter or department code (data-repo `CLAUDE.md` § Language); the words `csv`, `Excel`, `sheet` stay untranslated.
- Engine commands in the playbook are run bare — no `2>&1`, no `| head`, no `>` (spec §2.1).
- Batches of at most four `Task`s per message (ADR 0011); nothing runs in the background (ADR 0006); the agent's tools are `Read, Write` (QF-38 v3).
- Unit budgets: rendered `input.md` ≤ 20 K tokens (`ascii/4 + non_ascii/1.5`) and ≤ 1,800 lines of ≤ 1,900 characters; `est_tokens_out` ≤ 20 K; a unit is dispatched at most twice per run (QF-51).
- Tests are scoped: `cd code-repo && .venv/bin/pytest -q -k "<expr>"`; never the whole suite for a small change. From a git worktree never pass explicit test file paths (a rootdir quirk); use `-k`.
- Commits: one per task, named paths only (never `git add -A`), message footer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
  ```
  Do not push without the owner's approval.
- Do not run any v3 extraction on the laptop before the §6.1 checklist (background tasks disabled, `~/.claude/.ponytail-active` removed).

---

## File structure

**Phase 1 — engine foundation (code-repo unless noted)**

| file | responsibility |
|---|---|
| `data-repo/.claude/hooks/guard.py`, `test_guard.py` | T1 — write verb / redirect-target detection; `runs/facts/**` exempt from the Bash facts arm |
| `schemas/facts.schema.json`, `facts-delta.schema.json` | T2 — v2 closed payloads, new members, two identifier grammars, widened `source.quote`, issue kinds |
| `schemas/facts-unit.schema.json` (new) | T2 — the unit's and the reviewer's contract |
| `schemas/manifest.schema.json`, `facts-run-meta.schema.json` | T2 — `unresolved[]`, `twin_of`; `units[]` |
| `tests/test_facts_schema.py`, `tests/fixtures/facts/*` | T2 — refuse cases and the v2 fixtures |
| `data-repo/facts/*` | T3 — reset to the `units` seed, version 2 |
| `engine/dump_workbook/__init__.py`, `cli.py`, `engine/tests/fixtures/make_workbook.py`, `engine/tests/test_dump_workbook.py` | T4 — row capture, `row_labels`, ids `rows.tsv`, reference-tab reconciliation, `--init-manifest` pre-fill, `--manifest` skip-and-warn |
| `engine/merge_facts/preconditions.py` (new) | T5 — the precondition pass `apply` and `validate` share |
| `engine/merge_facts/apply.py` | T5, T7 — `_plan(minter)`, `_stamp`/`_write` split, `simulate`, `used`, instances, scope, supersession, note title-twin, location recompute |
| `engine/validate/cli.py` | T5, T14 — `facts-delta --store --run`, `facts-unit --run` |
| `engine/merge_facts/content.py`, `engine/tests/test_validate_facts_content.py` | T6 — `lint_prose`, `group_messages`, constant/record/param rules |
| `engine/merge_facts/ladder.py`, `engine/tests/test_merge_facts_ladder.py` | T7 — `DERIVED` skip |
| `engine/merge_facts/audit.py`, `verbs.py`, `engine/merge/cli.py`, their tests | T8 — detectors, `flags_over`, `check`, `--persian`, `stale_prose`, `resolve` unit_ref, `repair-foreign-keys` retired |

**Phase 2 — facts-plan**

| file | responsibility |
|---|---|
| `engine/facts_plan/__init__.py`, `build.py`, `assemble.py`, `cli.py`; `engine/facts_plan/cards/expression.md`, `style.md` | T9–T16 — the normaliser, candidates, units, inputs, status; digest/assemble/report; the two cards the unit input carries |
| `engine/pyproject.toml` | T9 — `facts-plan` entry point |
| `engine/tests/test_facts_plan_shape.py`, `test_facts_plan_build.py`, `test_facts_plan_units.py`, `test_facts_plan_assemble.py`, `test_facts_plan_status.py`, `test_validate_facts_unit.py` | T9–T16 |
| `engine/tests/fixtures/facts_plan/` (synthetic mini-estate builder) and `engine/tests/fixtures/facts-plan/` (frozen cooking dumps + `expected.json` + unit outputs) | T10–T16 |

**Phase 3 — runtime, UI, docs, rebuild**

| file | responsibility |
|---|---|
| `data-repo/.claude/agents/quantify.md`, `.claude/skills/quantify/SKILL.md`, `.claude/skills/edit-fact/SKILL.md`, `CLAUDE.md`, `attachments/sheets/manifest.json`, `.claude/hooks/test_playbook_lint.py` | T17 |
| `ui/src/lib/factsLabels.ts`, `ui/src/facts/cards/RuleCard.tsx`, `RecordCard.tsx`, their tests, `ui/src/facts/bundle.ts`; `ui-backend/inja_ui_backend/facts_store.py` | T18 |
| `docs/runbooks/07-facts.md`, `docs/decisions/0017-facts-pipeline-v3.md`, `PRD.md`, `ARD.md`, `control-bot/testing/quantify_unit_eval.py` | T19 |
| (operational) | T20 — the cooking rebuild |

---

## Drafting decisions the executor must know

These were decided while drafting against the real code and dumps; each is recorded in the task that implements it.

- **T2** also lands `merge_facts.STORE_SCHEMA_VERSION = 2`, bumps `facts-index.schema.json`, updates the 22 store documents under `engine/tests/`, and fixes `promote` to drop a note's `about`/`question` when promoting — otherwise the suite is red between T2 and T7. `facts-unit`'s `data` is one closed union (a decision carries no `kind`); `validate facts-unit` (T14) narrows per kind from `plan.json`. `manifest.schema.json` stays at `const 1` (both new members are optional).
- **T4** `has_date_header` is «تاریخ», or two of {«روز», «ماه», «سال»} — the literal §2.2 reading admits `Anbar markazi!فرنگی`. `confirmed` is derived from `unresolved[]` only for new and unconfirmed rows; an already-confirmed row keeps its answers and gets `unresolved: []`. `manifest_reconcile` returns `{kind, sheet, spreadsheetId, run_only}` issues; `--init-manifest` prints them as warnings, so **T12 compares the row against the dump itself** to surface `reference_tab_*` issues in `skeleton.json`.
- **T5** `group_messages` lands in T5 (its CLI needs it); `_plan(root, store, entries, minter)` keeps `root` vestigially; `apply` passes `partial(next_fact_id, root)`; `simulate` passes `_MemoryMinter(root)` seeded through `peek_fact_id`. `--store` suppresses the standalone content pass (the simulated apply runs it with the store).
- **T7** the identity guard moves into `preconditions` (an instance match under another key exits 2 there); `_today_jalali` moves to `apply.py`; `is_open` reads `superseded_by`.
- **T8** `check(root)` keeps a `findings` key (v2 §12's re-hash and moved-source reports are not withdrawn); `units_done`/`review_ran` are read off the department's newest run directory. `_edge_disagreement` = two `edge_cases[]` members stating one input with two answers. The flag detectors keep their function names (`_duplicate_output` reports `two_writers`, `_lookalike_title` reports `duplicate_title`, `_recurring_note_shape` reports `note_overlap`).
- **T9–T11** `normalise` records a cell reference as a locator (`{"cell": "JN"}`), and T11's `_resolve` rewrites the resolvable ones to `{ref, field}`; a reference row's key is `ing_<n>`/`food_<n>` (the literal code fails the key grammar and stays in `item.data.code`); a template id folds in the group's lowest instance key; item candidates scan row labels too; `rows[].item` is read from the `ingredientId` LET parameter; whitespace is deleted outside string literals only; **header notes keep a caption over a headed column (the unit sentence) and drop a caption over an unheaded column (the date band)** — the owner-facing intent of §2.3, and the reading the plan implements. `skeleton.json` candidates carry a `render` key beside `payload` for what only `input.md` needs. The synthetic builder lives in `engine/tests/fixtures/facts_plan/` (importable); the frozen dumps in `engine/tests/fixtures/facts-plan/`.
- **T12–T16** T12–T13 read one dump shape, `dumps[sid] = {"sheets", "formulas", "names", "rows", "cf", "comments", "meta"}`; item unit ids use `food1`/`ing1` slugs; `assemble` builds bodies first and mints temp ids after the review is folded in; a node citation may be `n016` or `cooking-030-n016`. **T16's fixture steps run only after T4 has landed and the 13 cooking workbooks are re-dumped** (`dump-workbook --manifest` over the local `.xlsx` files).
- **T15b** (added below) routes the reviewer's `contradiction` action, which the draft of T15 left unhandled.
- **T18** the bundle gains `binding_labels` (`{instance or applies_to key: {workbook, sheet, branch}}`) and `workbook_titles` (by spreadsheetId); the fields-grid offset badge is a follow-up.
- **T19** the playbook lint covers `quantify/SKILL.md`; the card-vs-checker test lives in `test_playbook_lint.py` behind `importorskip("merge_facts")`; runbook 07 §5/§7 are rewritten because the coverage line is gone.
- Test commands are written file-scoped (`.venv/bin/pytest engine/tests/<file>.py -q`); from a git worktree use `-k` instead.


## Phase 1 — engine foundation

### Task 1: The guard hook — a write is a write verb or a redirect target (data-repo)

**Files:**
- Modify: `../data-repo/.claude/hooks/guard.py:30-33` (the pattern constants), `../data-repo/.claude/hooks/guard.py:96-105` (the Bash branch)
- Test: `../data-repo/.claude/hooks/test_guard.py` (append after line 148; 29 tests pass today)

**Interfaces:**
- Consumes: the existing test helpers `run(payload, root)`, `w(path)`, `bash(cmd)` (`test_guard.py:9-24`); the existing `PROCESSES_CMD_RE`, `ORDER_CMD_RE`, `CLAUDE_CMD_RE`, `ORDER_CURATE_RE`, `_deny`, `_check_write_path`.
- Produces: `WRITE_VERB_RE`, `REDIRECT_RE` (replacing `MUTATION_RE`, which no other module imports), the local `_writes_to(path_re)` inside the Bash branch, and a `FACTS_CMD_RE` that no longer matches a path under `runs/facts/`.

Read first: `../data-repo/.claude/hooks/guard.py` in full (111 lines — the docstring states the four rules the hook enforces), `../data-repo/.claude/hooks/test_guard.py` in full, and `docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md` (the design this task lands, including the ruling that `layout` joins the write-verb list because `engine/layout/cli.py` `write_json_atomic`s the process file in place). Spec §4's guard row adds the `runs/facts/**` exclusion and the v3 run's own false positives. Everything else in the file — the `Write`/`Edit` branch, `_check_write_path`, `ORDER_CURATE_RE`, which is deliberately *not* gated on mutation — is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `../data-repo/.claude/hooks/test_guard.py`, in the file's existing style:

```python
# --- reads that contain a `>` are still reads (session defff4aa) -------------
# A bare `>` is not evidence of a write: a stderr redirect, an fd duplication
# and an arrow inside a quoted string all contain one, and all three were
# blocking read-only commands in production.

def test_allow_read_with_stderr_redirect(tmp_path):
    assert run(bash("cat departments/cooking/order.json 2>/dev/null | head -60"), tmp_path) == 0


def test_allow_read_with_fd_duplication(tmp_path):
    assert run(bash("layout --full /tmp/candidate.json 2>&1 | head -60"), tmp_path) == 0


def test_allow_python_read_printing_an_arrow(tmp_path):
    cmd = ("python3 -c \"import json;"
           "d=json.load(open('departments/cooking/processes/cooking-001.json'));"
           "print(d['edges'][0]['from'],'->',d['edges'][0]['to'])\"")
    assert run(bash(cmd), tmp_path) == 0


def test_allow_grep_into_devnull(tmp_path):
    assert run(bash("grep label departments/cooking/processes/cooking-001.json 2>/dev/null"),
               tmp_path) == 0


# --- real writes must still be blocked --------------------------------------

def test_block_cp_onto_process(tmp_path):
    assert run(bash("cp /tmp/x.json departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_block_rm_process(tmp_path):
    assert run(bash("rm departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_block_append_into_order(tmp_path):
    assert run(bash("echo x >> departments/cooking/order.json"), tmp_path) == 2


def test_block_redirect_into_process_with_stderr_too(tmp_path):
    # the real write is the stdout redirect; the 2>/dev/null must not mask it
    assert run(bash("merge_debug 2>/dev/null > departments/cooking/processes/cooking-001.json"),
               tmp_path) == 2


# --- `layout` writes the process file in place (engine/layout/cli.py) --------

def test_block_layout_on_committed_process(tmp_path):
    assert run(bash("layout --full departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_allow_layout_on_temp_file(tmp_path):
    assert run(bash("layout --full /tmp/candidate.json"), tmp_path) == 0


# --- the v3 run's own false positives (spec §4) -----------------------------
# `runs/facts/**` is where the agent is REQUIRED to write; the Write arm has
# always allowed it (FACTS_REL_RE is fullmatched against the repo-relative
# path), and the Bash arm must agree.

def test_allow_merge_facts_apply_with_tail(tmp_path):
    assert run(bash("merge facts apply --delta runs/facts/cooking/20260906-101500/facts-delta.json "
                    "--run runs/facts/cooking/20260906-101500 2>&1 | tail -40"), tmp_path) == 0


def test_allow_validate_facts_delta_with_stderr(tmp_path):
    assert run(bash("validate facts-delta runs/facts/cooking/20260906-101500/facts-delta.json 2>&1"),
               tmp_path) == 0


def test_allow_cat_parts_into_run_dir(tmp_path):
    assert run(bash("cat runs/facts/cooking/20260906-101500/part.a "
                    "runs/facts/cooking/20260906-101500/part.b "
                    "> runs/facts/cooking/20260906-101500/facts-delta.json"), tmp_path) == 0


def test_allow_sed_n_print_of_an_agent_file(tmp_path):
    assert run(bash("sed -n 1,80p .claude/agents/quantify.md 2>/dev/null"), tmp_path) == 0


def test_allow_heredoc_printing_an_arrow(tmp_path):
    cmd = ("python3 - <<'PY'\n"
           "import json\n"
           "d = json.load(open('facts/rules.json'))\n"
           "print(d['entries'][0]['key'], '->', d['entries'][0]['title'])\n"
           "PY")
    assert run(bash(cmd), tmp_path) == 0


def test_block_cp_onto_facts_store(tmp_path):
    assert run(bash("cp /tmp/rules.json facts/rules.json"), tmp_path) == 2


def test_block_sed_in_place_on_an_agent_file(tmp_path):
    assert run(bash("sed -i s/a/b/ .claude/agents/quantify.md"), tmp_path) == 2
```

- [ ] **Step 2: Run the tests against the UNCHANGED guard and watch the right ones fail**

Run: `cd ../data-repo/.claude/hooks && ../../../code-repo/.venv/bin/pytest test_guard.py -q`
Expected: **9 failed, 37 passed** — and exactly these nine: `test_allow_read_with_stderr_redirect`, `test_allow_python_read_printing_an_arrow`, `test_allow_grep_into_devnull`, `test_block_layout_on_committed_process`, `test_allow_merge_facts_apply_with_tail`, `test_allow_validate_facts_delta_with_stderr`, `test_allow_cat_parts_into_run_dir`, `test_allow_sed_n_print_of_an_agent_file`, `test_allow_heredoc_printing_an_arrow`. Each read-only case fails with `assert 2 == 0`; `test_block_layout_on_committed_process` fails with `assert 0 == 2`. Every one of the 29 originals must still pass — that is the proof the diagnosis is right.

- [ ] **Step 3: Replace the pattern constants**

In `guard.py`, replace line 31 and line 33 (leave 30, 32, 34-40 untouched):

```python
FACTS_CMD_RE = re.compile(r"(^|[^a-z])(?<!runs/)facts/[^ ]+\.json")
```

```python
# A bare `>` is NOT evidence of a write: `2>/dev/null`, `2>&1` and even a
# `'->'` inside a quoted string all contain one, and all three were blocking
# read-only commands (session defff4aa). So writes are detected two ways:
#   - WRITE_VERB_RE: commands that take the file as an ARGUMENT.
#     `layout` is here because layout/cli.py write_json_atomic()s the process
#     file in place, which would otherwise bypass merge (INV-1).
#   - REDIRECT_RE: capture what each redirect actually TARGETS, and test that
#     target — not the whole command — against the protected paths.
WRITE_VERB_RE = re.compile(
    r"\btee\b|\bsed\b[^|]*\s-i|\bperl\b[^|]*\s-i|\bcp\b|\bmv\b|\brm\b"
    r"|\btruncate\b|\bdd\b|\blayout\b")
REDIRECT_RE = re.compile(r"[0-9]?>>?\s*(&?[^\s;&|<>()]+)")
```

The `(?<!runs/)` sits *after* the `(^|[^a-z])` group, not before it: the group consumes the separator, so the look-behind is evaluated at the `f` of `facts/` and sees the five characters that precede it. `/data/facts/rules.json` still matches (`data/` ≠ `runs/`); `runs/facts/cooking/…/facts-delta.json` no longer does.

- [ ] **Step 4: Rewrite the Bash branch to correlate the verb/redirect with the path**

In `guard.py`, replace lines 96-105 (the `if MUTATION_RE.search(cmd):` block through its `return 0`) with:

```python
        redirect_targets = REDIRECT_RE.findall(cmd)
        has_write_verb = bool(WRITE_VERB_RE.search(cmd))

        def _writes_to(path_re):
            """True only when the command actually writes a protected path:
            a write verb taking it as an argument, or a redirect INTO it."""
            if has_write_verb and path_re.search(cmd):
                return True
            return any(path_re.search(t) for t in redirect_targets)

        if _writes_to(PROCESSES_CMD_RE):
            _deny("direct write to processes/*.json is forbidden; use the merge CLI (INV-1)")
        if _writes_to(FACTS_CMD_RE):
            _deny("direct write to facts/** is forbidden; use the merge CLI (INV-1)")
        if _writes_to(ORDER_CMD_RE):
            _deny("direct write to order.json is forbidden; use the `order` CLI (INV-1)")
        if _writes_to(CLAUDE_CMD_RE):
            _deny("runtime cannot edit .claude/** or CLAUDE.md (INV-2)")
        return 0
```

- [ ] **Step 5: Run the tests again**

Run: `cd ../data-repo/.claude/hooks && ../../../code-repo/.venv/bin/pytest test_guard.py -q`
Expected: **46 passed**, 0 failed. Any originally-passing test that now fails is a protection regression — stop and fix it before committing.

- [ ] **Step 6: Commit (data-repo, named paths only)**

```bash
git -C ../data-repo add .claude/hooks/guard.py .claude/hooks/test_guard.py
git -C ../data-repo commit -m "fix(facts): the guard blocks writes, not reads; runs/facts is not the store" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

The hook is live-mounted into the container (`../../data-repo:/data`) and re-executed per tool call, so a `git pull` on the server activates it — no image rebuild. Deployment is step 0 of the §8 migration and happens with T20's run, not here.

---

### Task 2: Schemas v2 — closed payloads, instances, applies_to, and the unit contract

**Files:**
- Create: `schemas/facts-unit.schema.json`, `tests/fixtures/facts/entry-record-sheet.json`
- Modify: `schemas/facts.schema.json:9` and `:12-117` (the `$defs` block), `schemas/facts-delta.schema.json:9` and `:12-115`, `schemas/facts-index.schema.json:9`, `schemas/manifest.schema.json:22-31`, `schemas/facts-run-meta.schema.json:9-22`, `schemas/README.md:19-25` and `:41-49`
- Modify: `tests/fixtures/facts/entry-record.json:44`, `tests/fixtures/facts/entry-rule.json:51`, `tests/fixtures/facts/entry-note.json:23`, `tests/fixtures/facts/delta-min.json:44`
- Modify: `engine/merge_facts/__init__.py:12-19` (a new constant), `:24-30` (`load_store`), `:237` (`build_index`); `engine/merge_facts/revert.py:67`; `engine/merge_facts/verbs.py:205` (`promote`)
- Modify: `engine/tests/facts_helpers.py`, `engine/tests/test_merge_facts_apply.py`, `engine/tests/test_merge_facts_audit.py`, `engine/tests/test_merge_facts_core.py`, `engine/tests/test_merge_facts_revert.py`, `engine/tests/test_merge_facts_verbs.py`, `engine/tests/test_merge_tombstone_facts_warning.py`, `engine/tests/test_validate_facts_content.py` (the 22 `"schema_version": 1, "entries"` literals + three note payloads)
- Test: `tests/test_facts_schema.py`

**Interfaces:**
- Consumes: `tests/conftest.py`'s `validate` fixture — `validate(schema_name, instance) -> list[error]`, empty list means valid (it also runs `Draft202012Validator.check_schema`, so a malformed schema fails loudly); `engine_common.validate(name, instance)` resolves a schema by filename out of `SCHEMA_DIR`, with no cross-file `$ref` support — **every schema stays self-contained**.
- Produces: `facts.schema.json` and `facts-delta.schema.json` at `schema_version` **2** with closed per-kind payloads and the `$defs` `mintedSegment`, `instance`, `import`, `field`, `row`, `appliesTo`, `ruleInput`, `ruleOutput`, `itemData`, `recordData`, `measurementData`, `ruleData`, `noteData`; `facts-index.schema.json` at 2; `facts-unit.schema.json` (the unit's closed contract); `manifest.schema.json` with `unresolved[]` + `twin_of` (still `schema_version` 1); `facts-run-meta.schema.json` with `units[]`; `merge_facts.STORE_SCHEMA_VERSION = 2`, consumed by T3, T5, T7 and T15.

Read first: `schemas/facts.schema.json` and `schemas/facts-delta.schema.json` in full (118 and 116 lines — the second is the first minus `status`/`updated_at`/`accounts[].id`/`source[].hash`/`source[].run`, plus `tempId` and the `original_ref` refusal); `tests/test_facts_schema.py` and the six fixtures under `tests/fixtures/facts/`; `schemas/README.md:41-49` (the QF-45 rule: bumping the constant requires an append-only migration note); spec §3.3 (the closed vocabulary, verbatim), §2.5 (the unit contract), §5.1's consumer table. The v2 prose enums live in `docs/superpowers/specs/2026-08-29-quantitative-facts-design.md:761-762` (item), `:856-860` (record), `:940` (measurement), `:1030-1045` (rule).

- [ ] **Step 1: Write the failing tests**

In `tests/test_facts_schema.py`, change `_wrap` (lines 12-13) to:

```python
def _wrap(*entries):
    return {"schema_version": 2, "entries": list(entries)}
```

replace `test_unknown_data_key_passes` (lines 36-39) with its inverse:

```python
def test_unknown_data_key_fails(validate):
    # §3.3: every payload is closed now — an invented key is what cause C looked
    # like in the store (`achieved_count`, `vents_per_carton`, `port_reason`).
    e = _load("entry-item.json")
    e["data"]["future_field"] = {"anything": 1}
    assert validate("facts.schema.json", _wrap(e)) != []
```

and append:

```python
def test_sheet_record_with_instances_and_imports_validates(validate):
    assert validate("facts.schema.json", _wrap(_load("entry-record-sheet.json"))) == []


def test_role_mirror_fails(validate):
    # QF-48: a mirror is an edge, not a record — the role leaves the vocabulary.
    e = _load("entry-record.json")
    e["data"]["role"] = "mirror"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_note_without_about_fails(validate):
    # QF-9: a note points at something and asks something, or it is not a note.
    e = _load("entry-note.json")
    del e["data"]["about"]
    assert validate("facts.schema.json", _wrap(e)) != []


def test_homoglyph_key_fails_under_both_grammars(validate):
    # а is a Cyrillic а. `fields[].key` takes the minted SEGMENT grammar,
    # `instances[].key` the minted KEY grammar; both are ASCII-anchored.
    e = _load("entry-record-sheet.json")
    e["data"]["fields"][0]["key"] = "mаsraf_elami"
    assert validate("facts.schema.json", _wrap(e)) != []
    e = _load("entry-record-sheet.json")
    e["data"]["instances"][0]["key"] = "gozаresh_cb__s0"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_original_as_an_array_fails(validate):
    d = _load("delta-min.json")
    d["data"]["original"] = ["=MINUS(SUM(F6,E6),G6)"]
    assert validate("facts-delta.schema.json", _wrap(d)) != []


def test_delta_carrying_original_ref_fails(validate):
    d = _load("delta-min.json")
    d["data"]["original_ref"] = "facts/originals/F-00042.txt"
    assert validate("facts-delta.schema.json", _wrap(d)) != []


def test_quote_is_admitted_on_voice_and_refused_on_chat(validate):
    e = _load("entry-rule.json")
    e["source"][1]["quote"] = "انحراف را شب‌ها می‌گیریم"
    assert validate("facts.schema.json", _wrap(e)) == []
    e["source"].append({"type": "chat", "ref": None, "quote": "x"})
    assert validate("facts.schema.json", _wrap(e)) != []


def test_rule_applies_to_with_params_validates(validate):
    e = _load("entry-rule.json")
    e["data"]["applies_to"] = [
        {"key": "gozaresh_cb__s0__l__r6", "record": {"ref": "F-00040", "field": "c_l"},
         "variant": 0, "range": "L6:L15",
         "params": {"tolerancePerFoodGr": 5, "ref_1": {"ref": "F-00040", "field": "c_k"}},
         "rows": [{"key": "r6", "row": 6, "label": "پنیر پیتزا", "item": "##1"}]}]
    assert validate("facts.schema.json", _wrap(e)) == []


# --- facts-unit.schema.json (§2.5) ------------------------------------------

def _unit_doc():
    return {
        "schema_version": 1, "unit": "u-wb-gozaresh", "attempt": 1,
        "decisions": [
            {"skeleton": "S-r-0a1b2c3d4e5f", "action": "keep", "key": "enheraf",
             "title": "انحراف مصرف",
             "statement": "انحراف مصرف هر مادهٔ اولیه برابر است با مصرف واقعی منهای مصرف اعلامی.",
             "aliases": ["مغایرت"],
             "data": {"expr": "enheraf = masraf_vaqei - masraf_elami", "lang": "feel",
                      "inputs": [{"key": "masraf_vaqei", "title": "مصرف واقعی", "unit": "kg",
                                  "from": {"ref": "S-rec-aabbccddeeff", "field": "c_h"}}],
                      "outputs": [{"key": "enheraf", "title": "انحراف",
                                   "unit": {"value": "kg", "inferred": True},
                                   "nature": "observed"}]},
             "branches": ["chalebagh"],
             "processes": [{"process": "cooking-030", "node": "n016",
                            "quote": "انحراف را شب‌ها می‌گیریم"}]},
            {"skeleton": "S-r-1111ffff2222", "action": "drop",
             "reason_code": "date_passthrough", "reason": "خواندن تاریخ"},
            {"skeleton": "S-i-222233334444", "action": "merge_into",
             "into": "S-i-555566667777", "reason_code": "duplicate"},
            {"skeleton": "S-rec-888899990000", "action": "keep",
             "key": "gozaresh_shabane_pitza", "title": "گزارش شبانه پیتزا",
             "statement": "جدول گزارش شبانهٔ لاین پیتزا.",
             "data": {"role": "report", "cadence": "nightly",
                      "fields": [{"from": "c_h", "key": "masraf_elami", "unit": "kg",
                                  "description": "ستون مصرف اعلامی"}]}},
            {"skeleton": "S-r-aaaabbbbcccc", "action": "split", "reason_code": "other",
             "reason": "variants compute different things",
             "into": [{"key": "enheraf_pitza", "title": "انحراف پیتزا",
                       "statement": "انحراف لاین پیتزا.", "takes": ["gozaresh_cb__s0__j__r6"]},
                      {"key": "enheraf_ferengi", "title": "انحراف فرنگی",
                       "statement": "انحراف لاین فرنگی.", "takes": ["gozaresh_nk__s1__j__r6"]}]}],
        "new": [{"kind": "note", "key": "note_placeholder", "title": "واحد نامشخص",
                 "statement": "واحد این قلم پرسیده نشده است.",
                 "data": {"about": [{"ref": "S-i-555566667777"}],
                          "question": "واحد شمارش این قلم چیست؟"}}]}


def _review_doc():
    return {"schema_version": 1, "unit": "review", "attempt": 1,
            "decisions": [
                {"entry": {"kind": "rule", "key": "enheraf",
                           "scope": {"departments": ["cooking"], "branches": []}},
                 "action": "keep", "key": "enheraf", "title": "انحراف مصرف",
                 "statement": "بازنویسی‌شده در بازبینی."},
                {"entry": {"kind": "rule", "key": "enheraf_ba_tolerance"},
                 "action": "contradiction", "field": "data/outputs/enheraf/unit",
                 "resolution": "fix", "value": "kg", "reason": "یک طرف آشکارا اشتباه است"}]}


def test_plan_unit_and_review_documents_validate(validate):
    assert validate("facts-unit.schema.json", _unit_doc()) == []
    assert validate("facts-unit.schema.json", _review_doc()) == []


def test_contradiction_only_in_a_review_document(validate):
    d = _unit_doc()
    d["decisions"].append({"skeleton": "S-r-999999999999", "action": "contradiction",
                           "field": "data/expr", "resolution": "account"})
    assert validate("facts-unit.schema.json", d) != []


def test_review_over_sixty_decisions_fails(validate):
    d = _review_doc()
    d["decisions"] = d["decisions"] * 31          # 62
    assert validate("facts-unit.schema.json", d) != []


def test_unit_decision_shapes(validate):
    d = _unit_doc(); d["decisions"][0].pop("statement")
    assert validate("facts-unit.schema.json", d) != []        # keep needs a statement
    d = _unit_doc(); d["decisions"][1].pop("reason_code")
    assert validate("facts-unit.schema.json", d) != []        # drop needs a reason_code
    d = _unit_doc(); d["decisions"][0]["data"]["mirror_of"] = {"ref": "S-rec-aabbccddeeff"}
    assert validate("facts-unit.schema.json", d) != []        # data is closed
    d = _unit_doc(); d["decisions"][0]["skeleton"] = "S-x-0a1b2c3d4e5f"
    assert validate("facts-unit.schema.json", d) != []        # S-<kind>-<12 hex>
    d = _unit_doc(); d["decisions"][0]["entry"] = {"kind": "rule", "key": "enheraf"}
    assert validate("facts-unit.schema.json", d) != []        # skeleton XOR entry
    d = _unit_doc(); d["decisions"][4]["into"] = d["decisions"][4]["into"][:1]
    assert validate("facts-unit.schema.json", d) != []        # a split has two parts


def test_manifest_unresolved_and_twin_of(validate):
    m = {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": [{"spreadsheetId": "1abc", "dir": "D", "file": "F.xlsx",
                        "short": "sokhari", "scripts": [], "departments": [],
                        "branches": ["chalebagh"], "reference_tabs": [],
                        "confirmed": False, "unresolved": ["departments"],
                        "twin_of": "fried"}]}
    assert validate("manifest.schema.json", m) == []
    m["workbooks"][0]["unresolved"] = ["scripts"]
    assert validate("manifest.schema.json", m) != []


def test_run_meta_units(validate):
    meta = {"department": "cooking", "origin": "pipeline", "actor": "operator",
            "started_at": "2026-09-06T10:15:00Z", "finished_at": None,
            "recordings": [], "attachments": [], "workbooks": [],
            "delta": "runs/facts/cooking/20260906-101500/facts-delta.json",
            "merged": False, "ids_created": [],
            "units": [{"id": "u-wb-gozaresh", "type": "workbook",
                       "state": "done", "attempts": 1}]}
    assert validate("facts-run-meta.schema.json", meta) == []
    meta["units"][0]["state"] = "running"
    assert validate("facts-run-meta.schema.json", meta) != []
```

- [ ] **Step 2: Run the tests — expect failure**

Run: `.venv/bin/pytest tests/test_facts_schema.py -q`
Expected: FAIL — every `facts`/`facts-delta`/`facts-index` case fails with `1 was expected` (the schemas still pin `schema_version` to 1), the four `facts-unit` cases error with `FileNotFoundError: …/schemas/facts-unit.schema.json`, and `test_sheet_record_with_instances_and_imports_validates` errors with `FileNotFoundError: …/tests/fixtures/facts/entry-record-sheet.json`.

- [ ] **Step 3: `schemas/facts.schema.json` — bump the marker and add the shared `$defs`**

Replace line 9 with `"schema_version": { "const": 2 },`. Insert `mintedSegment` immediately after `mintedKey` (line 14), and add `leaf`-free structural definitions after `issue`:

```json
    "mintedSegment": { "type": "string",
      "pattern": "^[a-z][a-z0-9]*(_[a-z0-9]+)*$" },
```

Replace the whole `issue` block (lines 64-77) with:

```json
    "issue": { "type": "object", "additionalProperties": false,
      "required": ["kind", "description", "affects"],
      "properties": {
        "kind": { "enum": ["scale", "unit_kind", "column_shift", "junk", "bug",
                            "cross_record", "code_collision",
                            "hand_maintained_index", "no_rule_applies", "broken_formula",
                            "cached_error", "leading_offset", "unused_mirror",
                            "unknown_source", "column_offset", "per_cell_mirror",
                            "ambiguous_row_header", "binding_gone"] },
        "from_date": { "$ref": "#/$defs/jalali" }, "to_date": { "$ref": "#/$defs/jalali" },
        "field": { "type": "string" }, "description": { "type": "string" },
        "instance": { "type": "string" },
        "engine": { "type": "boolean" },
        "fix": { "type": "object", "additionalProperties": false,
          "required": ["op"],
          "properties": { "op": { "enum": ["multiply", "divide", "shift_columns", "ignore"] },
                          "factor": { "type": "number" } },
          "if": { "properties": { "op": { "enum": ["multiply", "divide"] } } },
          "then": { "required": ["op", "factor"] } },
        "affects": { "type": "array", "items": { "$ref": "#/$defs/ref" } } } },
```

Add the `if`/`then` pair to the `source` block (after its `properties`, lines 42-53) — `sourceLoc` is left alone, it pairs with `accounts[].statement`, which is the verbatim quote:

```json
      "if": { "required": ["quote"] },
      "then": { "properties": { "type": { "enum": ["voice", "comment", "sheet", "process"] } } } },
```

Then insert these definitions after `issue` (they are the v3 structures QF-46/47/48 introduce):

```json
    "instance": { "type": "object", "additionalProperties": false,
      "required": ["key", "spreadsheetId", "sheet"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedKey" },
        "spreadsheetId": { "type": "string" },
        "sheetId": { "type": ["integer", "string", "null"] },
        "sheet": { "type": "string" },
        "branch": { "oneOf": [{ "type": "string", "pattern": "^[a-z]+$" }, { "type": "null" }] },
        "hidden": { "type": "boolean" },
        "imports": { "type": "array", "items": { "$ref": "#/$defs/import" } } } },
    "import": { "type": "object", "additionalProperties": false,
      "required": ["key", "source"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedKey" },
        "source": { "oneOf": [
          { "$ref": "#/$defs/ref" },
          { "type": "object", "additionalProperties": false,
            "required": ["spreadsheetId", "sheet"],
            "properties": { "spreadsheetId": { "type": "string" },
                            "sheet": { "type": "string" } } } ] },
        "range": { "type": ["string", "null"] },
        "named_range": { "type": ["string", "null"] } } },
    "field": { "type": "object", "additionalProperties": false,
      "required": ["key"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedSegment" },
        "title": { "type": ["string", "null"] },
        "columns": { "type": "object",
          "propertyNames": { "$ref": "#/$defs/mintedKey" },
          "additionalProperties": { "type": "string", "pattern": "^[A-Za-z]{1,3}$" } },
        "type": { "enum": ["string", "number", "integer", "boolean", "date"] },
        "unit": { "type": ["string", "null"] },
        "unit_raw": { "type": ["string", "null"] },
        "description": { "type": ["string", "null"] },
        "constraints": { "type": "object", "additionalProperties": false,
          "properties": { "enum": { "type": "array" }, "readOnly": { "type": "boolean" },
                          "required": { "type": "boolean" },
                          "minimum": { "type": "number" }, "maximum": { "type": "number" } } },
        "refItems": { "type": "object", "additionalProperties": false,
          "required": ["namespace"],
          "properties": { "namespace": { "enum": ["#", "##"] },
                          "resolved_by": { "enum": ["code", "title"] } } },
        "derived": { "$ref": "#/$defs/refOrNull" },
        "filled_by": { "type": ["string", "null"] },
        "group": { "type": "object", "additionalProperties": false,
          "properties": { "key": { "$ref": "#/$defs/mintedSegment" },
                          "title": { "type": "string" } } } } },
    "row": { "type": "object", "additionalProperties": false,
      "required": ["key"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedKey" },
        "title": { "type": ["string", "null"] },
        "unit": { "type": ["string", "null"] },
        "unit_raw": { "type": ["string", "null"] },
        "section": { "$ref": "#/$defs/mintedSegment" },
        "when": { "type": ["string", "null"] },
        "open": { "type": "boolean" },
        "retired": { "type": "boolean" },
        "valid_to": { "oneOf": [{ "$ref": "#/$defs/jalali" }, { "type": "null" }] },
        "supersedes": { "$ref": "#/$defs/refOrNull" } },
      "patternProperties": { "^[a-z][a-z0-9]*(_[a-z0-9]+)*$": {} } },
    "appliesTo": { "type": "object", "additionalProperties": false,
      "required": ["key", "record"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedKey" },
        "record": { "$ref": "#/$defs/ref" },
        "variant": { "type": ["integer", "string", "null"] },
        "range": { "type": ["string", "null"] },
        "params": { "type": "object" },
        "rows": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["key"],
          "properties": { "key": { "$ref": "#/$defs/mintedKey" },
                          "row": { "type": ["integer", "null"] },
                          "label": { "type": ["string", "null"] },
                          "item": { "type": ["string", "null"] } } } } } },
    "ruleInput": { "type": "object", "additionalProperties": false,
      "required": ["key"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedSegment" },
        "title": { "type": ["string", "null"] },
        "unit": { "type": ["string", "null"] },
        "from": { "oneOf": [
          { "$ref": "#/$defs/ref" },
          { "type": "object", "additionalProperties": false,
            "required": ["param"], "properties": { "param": { "type": "string" } } },
          { "enum": ["operator", "calendar"] },
          { "type": "null" } ] },
        "via": { "$ref": "#/$defs/ref" } } },
    "ruleOutput": { "type": "object", "additionalProperties": false,
      "required": ["key"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedSegment" },
        "title": { "type": ["string", "null"] },
        "unit": { "type": ["string", "null"] },
        "nature": { "enum": ["standard", "target", "observed", "limit", null] },
        "of": { "$ref": "#/$defs/ref" },
        "per": { "type": ["string", "null"] },
        "writes_to": { "$ref": "#/$defs/ref" },
        "share": { "type": ["number", "null"] },
        "value": {},
        "range": { "type": ["object", "null"], "additionalProperties": false,
          "properties": { "min": { "type": ["number", "null"] },
                          "max": { "type": ["number", "null"] } } } } },
```

`row`'s `patternProperties` accepts any minted **segment** as a cell name with any value (a cell is a leaf with its own state — `null` when unknown, an account when disputed), while `additionalProperties: false` refuses a cell named in Persian, in capitals or with a double underscore; the reserved names keep their types through `properties`, which is evaluated alongside the pattern.

- [ ] **Step 4: `schemas/facts.schema.json` — the five closed payloads and the new `entry`**

Insert after `ruleOutput`:

```json
    "itemData": { "type": "object", "additionalProperties": false,
      "required": ["category", "unit"],
      "properties": {
        "code": { "type": ["string", "null"] },
        "code_absent": { "type": "boolean" },
        "category": { "enum": ["ingredient", "product", "packaging", "consumable", "place", "other"] },
        "group": { "type": ["string", "null"] },
        "state": { "enum": ["raw", "cooked", "frozen", "prepared", null] },
        "grade": { "type": ["string", "null"] },
        "unit": { "type": ["string", "null"] },
        "unit_raw": { "type": ["string", "null"] },
        "units": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["pack_unit"],
          "properties": { "pack_unit": { "type": "string" },
                          "factor_to_base": { "oneOf": [
                            { "type": ["number", "null"] },
                            { "type": "object", "additionalProperties": false,
                              "properties": { "min": { "type": "number" },
                                              "max": { "type": "number" } } } ] } } } },
        "pack": { "type": ["object", "null"], "additionalProperties": false,
          "properties": { "size": { "type": ["number", "null"] },
                          "unit": { "type": ["string", "null"] } } },
        "tracked": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["record"],
          "properties": { "record": { "$ref": "#/$defs/ref" },
                          "value": { "type": ["boolean", "null"] },
                          "reason": { "type": ["string", "null"] } } } } } },
    "recordData": { "type": "object", "additionalProperties": false,
      "required": ["medium", "role", "location"],
      "properties": {
        "medium": { "enum": ["sheet", "paper", "external", "native"] },
        "role": { "enum": ["log", "reference", "report", "config"] },
        "location": { "type": "object" },
        "instances": { "type": "array", "items": { "$ref": "#/$defs/instance" } },
        "fields": { "type": "array", "items": { "$ref": "#/$defs/field" } },
        "header_fields": { "type": "array", "items": { "$ref": "#/$defs/field" } },
        "sections": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["key"],
          "properties": { "key": { "$ref": "#/$defs/mintedSegment" },
                          "title": { "type": ["string", "null"] } } } },
        "rows": { "type": "array", "items": { "$ref": "#/$defs/row" } },
        "signatures": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["role"],
          "properties": { "role": { "type": "string" },
                          "row_range": { "type": ["string", "null"] } } } },
        "primaryKey": { "type": "array", "items": { "$ref": "#/$defs/mintedSegment" } },
        "reconciled_against": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "required": ["cell", "against"],
          "properties": { "cell": { "$ref": "#/$defs/ref" },
                          "against": { "$ref": "#/$defs/ref" } } } },
        "blank_master": { "type": "boolean" },
        "grain": { "type": ["string", "null"] },
        "cadence": { "enum": ["nightly", "shift", "daily", "weekly", "monthly", "ad_hoc", null] },
        "day_boundary": { "type": ["string", "null"] },
        "filled_by": { "type": ["string", "null"] },
        "approved_by": { "type": ["string", "null"] },
        "movement": { "type": "object", "additionalProperties": false,
          "properties": { "from": { "$ref": "#/$defs/ref" }, "to": { "$ref": "#/$defs/ref" },
                          "reason": { "type": ["string", "null"] } } },
        "identifier_scheme": { "type": "object" },
        "template_of": { "$ref": "#/$defs/ref" },
        "divergence": { "enum": ["none", "intentional", "drift", "unknown", null] },
        "stub": { "type": "boolean" },
        "original_ref": { "type": "string" } } },
    "measurementData": { "type": "object", "additionalProperties": false,
      "required": ["quantity", "unit"],
      "properties": {
        "of": { "$ref": "#/$defs/ref" },
        "quantity": { "enum": ["mass", "count", "volume", "duration", "money", "ratio", "other"] },
        "unit": { "type": ["string", "null"] },
        "method": { "type": ["string", "null"] },
        "when": { "type": ["string", "null"] },
        "by": { "type": ["string", "null"] },
        "writes_to": { "$ref": "#/$defs/ref" },
        "exceptions": { "type": ["string", "null"] } } },
    "ruleData": { "type": "object", "additionalProperties": false,
      "required": ["inputs", "outputs"],
      "properties": {
        "inputs": { "type": "array", "items": { "$ref": "#/$defs/ruleInput" } },
        "outputs": { "type": "array", "items": { "$ref": "#/$defs/ruleOutput" } },
        "expr": { "type": ["string", "null"] },
        "lang": { "enum": ["feel", "table", "text", "sheets", "gs", null] },
        "text": { "type": ["string", "null"] },
        "table": { "type": "object" },
        "original_ref": { "type": "string" },
        "calls": { "type": "array", "items": { "$ref": "#/$defs/ref" } },
        "edge_cases": { "type": "array", "items": {
          "type": "object", "additionalProperties": false,
          "properties": { "input": {}, "expected": {}, "why": { "type": ["string", "null"] } } } },
        "identifier": { "type": ["string", "null"] },
        "applies_to": { "type": "array", "items": { "$ref": "#/$defs/appliesTo" } },
        "template_of": { "$ref": "#/$defs/ref" },
        "divergence": { "enum": ["none", "intentional", "drift", "unknown", null] } } },
    "noteData": { "type": "object", "additionalProperties": false,
      "required": ["about", "question"],
      "properties": {
        "about": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/ref" } },
        "question": { "type": "string" } } },
```

and replace the `entry` block (lines 103-116) with:

```json
    "entry": { "allOf": [
        { "$ref": "#/$defs/envelope" },
        { "oneOf": [
          { "properties": { "kind": { "const": "item" },
              "data": { "$ref": "#/$defs/itemData" } } },
          { "properties": { "kind": { "const": "record" },
              "data": { "$ref": "#/$defs/recordData" } } },
          { "properties": { "kind": { "const": "measurement" },
              "data": { "$ref": "#/$defs/measurementData" } } },
          { "properties": { "kind": { "const": "rule" },
              "data": { "$ref": "#/$defs/ruleData" } } },
          { "properties": { "kind": { "const": "note" },
              "data": { "$ref": "#/$defs/noteData" } } } ] } ] }
```

`record.mirror_of`, `role: "mirror"`, `record.foreignKeys`, `rule.port` and the library `edge_cases` on a plumbing rule are gone by omission — that is what closing the payload means. `null` is admitted in the optional enums (`state`, `cadence`, `nature`, `lang`, `divergence`) because QF-6 reads an explicit `null` as "unanswered" and an unanswered leaf must still be storable.

- [ ] **Step 5: `schemas/facts-delta.schema.json` — the same `$defs`, with `original` where the store has `original_ref`**

Replace line 9 with `"schema_version": { "const": 2 },`, then copy every `$defs` member added or changed in steps 3 and 4 — `mintedSegment`, `issue`, `source`'s `if`/`then`, `instance`, `import`, `field`, `row`, `appliesTo`, `ruleInput`, `ruleOutput`, `itemData`, `measurementData`, `noteData`, `recordData`, `ruleData` — into this file verbatim, with exactly two differences in `recordData` and `ruleData`:

```json
        "original": { "type": ["string", "null"] },
```

replaces

```json
        "original_ref": { "type": "string" },
```

in both. `envelope`, `account`, `source`'s property list, `tempId` and the trailing `{ "properties": { "data": { "not": { "required": ["original_ref"] } } } }` clause of `entry` stay as they are — the clause is now redundant with the closed payload and is kept as the explicit statement of QF-31. `entry`'s `oneOf` becomes the same five `$ref` branches as step 4.

- [ ] **Step 6: `schemas/facts-unit.schema.json` — the unit's contract (new file, self-contained)**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facts-unit.schema.json",
  "title": "Facts unit — one unit's decisions over its candidates (v3 design §2.5)",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "unit", "attempt", "decisions"],
  "properties": {
    "schema_version": { "const": 1 },
    "unit": { "type": "string", "minLength": 1 },
    "attempt": { "type": "integer", "minimum": 1 },
    "decisions": { "type": "array", "items": { "$ref": "#/$defs/decision" } },
    "new": { "type": "array", "items": { "$ref": "#/$defs/newEntry" } }
  },
  "if": { "properties": { "unit": { "const": "review" } }, "required": ["unit"] },
  "then": { "properties": { "decisions": { "maxItems": 60 } } },
  "else": { "properties": { "decisions": { "items": {
    "properties": { "action": { "not": { "const": "contradiction" } } } } } } },
  "$defs": {
    "leaf": {},
    "mintedKey": { "type": "string",
      "pattern": "^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$" },
    "skeletonId": { "type": "string", "pattern": "^S-(rec|i|r|gs)-[0-9a-f]{12}$" },
    "scope": { "type": "object", "additionalProperties": false,
      "properties": {
        "departments": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } },
        "branches": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } } } },
    "entryAddr": { "type": "object", "additionalProperties": false,
      "required": ["kind", "key"],
      "properties": {
        "kind": { "enum": ["item", "record", "measurement", "rule", "note"] },
        "key": { "$ref": "#/$defs/mintedKey" },
        "scope": { "$ref": "#/$defs/scope" } } },
    "procCite": { "type": "object", "additionalProperties": false,
      "required": ["process", "node"],
      "properties": {
        "process": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
        "node": { "type": "string" },
        "quote": { "type": "string" } } },
    "decisionField": { "type": "object", "additionalProperties": false,
      "required": ["from"],
      "properties": {
        "from": { "type": "string" },
        "key": { "$ref": "#/$defs/leaf" },
        "title": { "$ref": "#/$defs/leaf" },
        "unit": { "$ref": "#/$defs/leaf" },
        "type": { "$ref": "#/$defs/leaf" },
        "description": { "$ref": "#/$defs/leaf" },
        "refItems": { "$ref": "#/$defs/leaf" },
        "derived": { "$ref": "#/$defs/leaf" } } },
    "decisionData": { "type": "object", "additionalProperties": false,
      "properties": {
        "role": { "$ref": "#/$defs/leaf" },
        "grain": { "$ref": "#/$defs/leaf" },
        "cadence": { "$ref": "#/$defs/leaf" },
        "day_boundary": { "$ref": "#/$defs/leaf" },
        "filled_by": { "$ref": "#/$defs/leaf" },
        "approved_by": { "$ref": "#/$defs/leaf" },
        "movement": { "$ref": "#/$defs/leaf" },
        "reconciled_against": { "$ref": "#/$defs/leaf" },
        "primaryKey": { "$ref": "#/$defs/leaf" },
        "fields": { "type": "array", "items": { "$ref": "#/$defs/decisionField" } },
        "category": { "$ref": "#/$defs/leaf" },
        "unit": { "$ref": "#/$defs/leaf" },
        "unit_raw": { "$ref": "#/$defs/leaf" },
        "units": { "$ref": "#/$defs/leaf" },
        "pack": { "$ref": "#/$defs/leaf" },
        "tracked": { "$ref": "#/$defs/leaf" },
        "group": { "$ref": "#/$defs/leaf" },
        "state": { "$ref": "#/$defs/leaf" },
        "grade": { "$ref": "#/$defs/leaf" },
        "code_absent": { "$ref": "#/$defs/leaf" },
        "inputs": { "$ref": "#/$defs/leaf" },
        "outputs": { "$ref": "#/$defs/leaf" },
        "expr": { "$ref": "#/$defs/leaf" },
        "lang": { "$ref": "#/$defs/leaf" },
        "table": { "$ref": "#/$defs/leaf" },
        "text": { "$ref": "#/$defs/leaf" },
        "calls": { "$ref": "#/$defs/leaf" },
        "edge_cases": { "$ref": "#/$defs/leaf" },
        "template_of": { "$ref": "#/$defs/leaf" },
        "divergence": { "$ref": "#/$defs/leaf" } } },
    "splitPart": { "type": "object", "additionalProperties": false,
      "required": ["key", "title", "statement", "takes"],
      "properties": {
        "key": { "$ref": "#/$defs/mintedKey" },
        "title": { "type": "string" },
        "statement": { "type": "string" },
        "data": { "$ref": "#/$defs/decisionData" },
        "takes": { "type": "array", "minItems": 1,
          "items": { "$ref": "#/$defs/mintedKey" } } } },
    "decision": { "type": "object", "additionalProperties": false,
      "required": ["action"],
      "oneOf": [{ "required": ["skeleton"] }, { "required": ["entry"] }],
      "properties": {
        "skeleton": { "$ref": "#/$defs/skeletonId" },
        "entry": { "$ref": "#/$defs/entryAddr" },
        "action": { "enum": ["keep", "drop", "merge_into", "split", "contradiction"] },
        "key": { "$ref": "#/$defs/mintedKey" },
        "title": { "type": "string" },
        "statement": { "type": "string" },
        "aliases": { "type": "array", "items": { "type": "string" } },
        "branches": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } },
        "processes": { "type": "array", "items": { "$ref": "#/$defs/procCite" } },
        "data": { "$ref": "#/$defs/decisionData" },
        "into": { "oneOf": [
          { "$ref": "#/$defs/skeletonId" },
          { "$ref": "#/$defs/entryAddr" },
          { "type": "array", "minItems": 2, "items": { "$ref": "#/$defs/splitPart" } } ] },
        "reason_code": { "enum": ["not_a_fact", "date_passthrough", "cosmetic", "duplicate",
                                   "has_a_home", "insufficient_context", "other"] },
        "reason": { "type": "string" },
        "field": { "type": "string" },
        "resolution": { "enum": ["account", "fix"] },
        "value": { "$ref": "#/$defs/leaf" } },
      "allOf": [
        { "if": { "properties": { "action": { "const": "keep" } }, "required": ["action"] },
          "then": { "required": ["key", "title", "statement"] } },
        { "if": { "properties": { "action": { "const": "drop" } }, "required": ["action"] },
          "then": { "required": ["reason_code"] } },
        { "if": { "properties": { "action": { "const": "merge_into" } }, "required": ["action"] },
          "then": { "required": ["reason_code", "into"],
                    "properties": { "into": { "oneOf": [{ "$ref": "#/$defs/skeletonId" },
                                                        { "$ref": "#/$defs/entryAddr" }] } } } },
        { "if": { "properties": { "action": { "const": "split" } }, "required": ["action"] },
          "then": { "required": ["reason_code", "into"],
                    "properties": { "into": { "type": "array", "minItems": 2,
                                              "items": { "$ref": "#/$defs/splitPart" } } } } },
        { "if": { "properties": { "action": { "const": "contradiction" } }, "required": ["action"] },
          "then": { "required": ["field", "resolution"] } } ] },
    "newEntry": { "type": "object", "additionalProperties": false,
      "required": ["kind", "key", "title", "statement", "data"],
      "properties": {
        "kind": { "enum": ["item", "record", "measurement", "rule", "note"] },
        "key": { "$ref": "#/$defs/mintedKey" },
        "title": { "type": "string" },
        "statement": { "type": "string" },
        "aliases": { "type": "array", "items": { "type": "string" } },
        "branches": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } },
        "processes": { "type": "array", "items": { "$ref": "#/$defs/procCite" } },
        "data": { "type": "object" } } }
  }
}
```

`leaf` is `{}` — accepts anything — because §2.5 lets any leaf arrive wrapped as `{"value": …, "inferred": true}`; the key set is what this schema closes, and the value grammar is enforced on the assembled delta, where `assemble` has stripped the wrappers. `new[]` carries no `source` and no `id`: assemble writes both.

- [ ] **Step 7: `facts-index`, `manifest`, `facts-run-meta`, `README.md`**

`schemas/facts-index.schema.json:9` → `"schema_version": { "const": 2 },` — `.index.json` is one of the six committed store files the marker moves on.

`schemas/manifest.schema.json` — add to `workbook.properties` (after `reference_tabs`, line 30); `schema_version` stays `const 1` and neither new member is required, so the estate's 28 confirmed rows keep validating untouched:

```json
        "unresolved": { "type": "array",
          "items": { "enum": ["departments", "branches", "reference_tabs"] } },
        "twin_of": { "type": "string", "pattern": "^[a-z][a-z0-9]*(_[a-z0-9]+)*$" },
```

`schemas/facts-run-meta.schema.json` — add to `properties` (after `ids_created`, line 20):

```json
    "units": { "type": "array", "items": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "type", "state"],
      "properties": { "id": { "type": "string" },
                      "type": { "enum": ["workbook", "transcript", "items", "attachment"] },
                      "state": { "enum": ["pending", "done", "failed"] },
                      "attempts": { "type": "integer", "minimum": 0 } } } },
```

`schemas/README.md` — one row in the table after line 20, and the QF-45 append-only note the README's own rule demands:

```markdown
| `facts-unit.schema.json` | one unit's decisions over its candidates (v3 design §2.5) | quantify agent (unit/review mode) | `validate facts-unit`, `facts-plan assemble` |
```

```markdown
- **v2** (2026-09-06, v3 design §3.3) — closed per-kind payloads
  (`additionalProperties: false`, the prose enums as schema enums),
  `record.instances[]` with `imports[]`, `fields[].columns`, `rule.applies_to[]`
  with `params`, `note.about[]` + `question`, the new `issues[].kind` members and
  `issues[].instance`/`engine`, `source[].quote` on `voice`/`comment`/`sheet` as
  well as `process`. Removed: `record.mirror_of`, `role: mirror`,
  `record.foreignKeys`, `rule.port`. `facts-index.schema.json` moves with them;
  `manifest.schema.json` stays at 1 (its two new members are optional).
```

- [ ] **Step 8: The fixtures**

`tests/fixtures/facts/entry-record.json:44` — delete the `"foreignKeys": [],` line (the join lives on `fields[].refItems` and `instances[].imports[]` now).
`tests/fixtures/facts/entry-rule.json:51` and `tests/fixtures/facts/delta-min.json:44` — replace `"calls": [], "port": false, "edge_cases": []` with `"calls": [], "edge_cases": []`.
`tests/fixtures/facts/entry-note.json:23` — replace `"data": {}` with:

```json
  "data": {
    "about": [{ "ref": "F-00042" }],
    "question": "معیار اهمیت برای کدام اقلام اعمال می‌شود؟"
  }
```

Create `tests/fixtures/facts/entry-record-sheet.json` — the v3 sheet record, two branch instances, one import each, one column offset:

```json
{
  "id": "F-00040",
  "kind": "record",
  "key": "gozaresh_shabane_pitza",
  "title": "گزارش شبانه پیتزا",
  "aliases": [],
  "statement": "جدول گزارش شبانهٔ لاین پیتزا؛ هر ردیف یک مادهٔ اولیه و هر ستون یکی از مقادیر شب است. سرلاین آن را پر می‌کند.",
  "scope": { "departments": ["management"], "branches": ["chalebagh", "naharkhoran"] },
  "source": [
    { "type": "sheet", "ref": "attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.xlsx",
      "sheet": "پیتزا" },
    { "type": "sheet", "ref": "attachments/sheets/MandeShab__NaharKhoran__Gozaresh naharkhoran/Gozaresh naharkhoran.xlsx",
      "sheet": "پیتزا" }
  ],
  "status": "confirmed",
  "field_status": {},
  "accounts": [],
  "valid_from": null,
  "valid_to": null,
  "supersedes": null,
  "superseded_by": null,
  "retired": false,
  "issues": [
    { "kind": "column_shift", "description": "در نسخهٔ ناهارخوران ستون «مصرف واقعی» جا افتاده است.",
      "instance": "gozaresh_nk__s0", "engine": true, "affects": [{ "ref": "F-00040" }] }
  ],
  "processes": [],
  "updated_at": "2026-09-06T09:00:00Z",
  "data": {
    "medium": "sheet",
    "role": "report",
    "location": { "spreadsheetId": "1abc", "sheetId": 0, "sheet": "پیتزا" },
    "instances": [
      { "key": "gozaresh_cb__s0", "spreadsheetId": "1abc", "sheetId": 0, "sheet": "پیتزا",
        "branch": "chalebagh", "hidden": false,
        "imports": [
          { "key": "gozaresh_cb__s0__forush", "source": { "ref": "F-00051" },
            "range": "A1:X200", "named_range": "SheetsFileId_Pizza" }
        ] },
      { "key": "gozaresh_nk__s0", "spreadsheetId": "2def", "sheetId": 0, "sheet": "پیتزا",
        "branch": "naharkhoran", "hidden": false,
        "imports": [
          { "key": "gozaresh_nk__s0__forush",
            "source": { "spreadsheetId": "9zzz", "sheet": "singlePizza" },
            "range": "A1:X200" }
        ] }
    ],
    "fields": [
      { "key": "masraf_elami", "title": "مصرف اعلامی",
        "columns": { "gozaresh_cb__s0": "H", "gozaresh_nk__s0": "J" },
        "type": "number", "unit": "kg" },
      { "key": "masraf_vaqei", "title": "مصرف واقعی",
        "columns": { "gozaresh_cb__s0": "I" },
        "type": "number", "unit": "kg" }
    ],
    "grain": "یک ردیف به ازای هر مادهٔ اولیه، یک برگ به ازای هر شب",
    "cadence": "nightly",
    "day_boundary": "01:15"
  }
}
```

- [ ] **Step 9: The two engine consequences of a closed payload**

`engine/merge_facts/__init__.py` — add the constant beside the key grammars (after line 19) and use it in the two places that hard-code the marker:

```python
# QF-45: the store's version marker. Bumped to 2 with the v3 payload contract
# (design §3.3); `save_store` validates against `facts.schema.json`, which pins
# the same number, so the two can never drift apart silently.
STORE_SCHEMA_VERSION = 2
```

in `load_store` (line 29): `else {"schema_version": STORE_SCHEMA_VERSION, "entries": []})`, and at the end of `build_index` (line 237): `return {"schema_version": STORE_SCHEMA_VERSION, "entries": rows}`.

`engine/merge_facts/revert.py:67` — same substitution, importing the constant from `merge_facts` beside `KIND_FILES`.

`engine/merge_facts/verbs.py` — in `promote`, right after `data = entry.setdefault("data", {})` (line 205):

```python
    for k in ("about", "question"):     # QF-9: the note's own payload is a
        data.pop(k, None)               # pointer and a question, and neither
                                        # survives into another kind's closed payload
```

- [ ] **Step 10: The engine test fixtures the closed payload touches**

Bump the 22 facts documents (the manifest literal in `facts_helpers.py:22` is not matched — it is followed by `"branches"`, not `"entries"`):

```bash
sed -i 's/"schema_version": 1, "entries"/"schema_version": 2, "entries"/g' \
  engine/tests/facts_helpers.py engine/tests/test_merge_facts_apply.py \
  engine/tests/test_merge_facts_audit.py engine/tests/test_merge_facts_core.py \
  engine/tests/test_merge_facts_revert.py engine/tests/test_merge_facts_verbs.py \
  engine/tests/test_merge_tombstone_facts_warning.py engine/tests/test_validate_facts_content.py
```

Then the three bare-note payloads, which a closed `noteData` refuses. In `engine/tests/test_merge_facts_verbs.py:51`, replace `"retired": False, "data": {}}]}` with:

```python
        "retired": False, "data": {"about": [{"ref": "F-00001"}],
                                   "question": "این عدد کجا ثبت می‌شود؟"}}]}
```

In `_bare_note` (`engine/tests/test_merge_facts_verbs.py:166`), replace `"retired": False, "data": data or {}}]}` with:

```python
        "retired": False,
        "data": data or {"about": [{"ref": "F-00001"}],
                         "question": "این عدد کجا ثبت می‌شود؟"}}]}
```

and replace `test_promote_to_item_succeeds_when_data_already_has_category_and_unit` — its premise (a note carrying `category` and `unit`) is exactly what QF-9 outlaws — with the statement of what v3 does instead:

```python
def test_a_note_cannot_carry_another_kinds_payload(tmp_path):
    # QF-9 closes the note payload to `about[]` + `question`, so the keys
    # `promote` requires for item/record/measurement can never sit on one: those
    # three promotions are now always refused for want of them, and `rule` —
    # whose stubs are empty containers — is the only reachable target.
    root = _root(tmp_path); _seed_units(root)
    note = {"schema_version": 2, "entries": [{
        "id": "T-1", "kind": "note", "key": "note_ab12cd34ef58",
        "title": "یادداشت", "statement": "s",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "9"}],
        "retired": False, "data": {"about": [{"ref": "F-00001"}], "question": "؟",
                                   "category": "ingredient", "unit": "g"}}]}
    with pytest.raises(SystemExit):
        apply(root, _write(root, "dn3.json", note), _run_dir(root, "1"))
```

In `engine/tests/test_merge_facts_audit.py:410`, replace `return _entry(tid, "note", key, statement[:60], {}) | {"statement": statement}` with:

```python
        return _entry(tid, "note", key, statement[:60],
                      {"about": [{"ref": "F-00001"}], "question": "؟"}) | {"statement": statement}
```

- [ ] **Step 11: Run the tests**

Run: `.venv/bin/pytest tests/test_facts_schema.py -q`   Expected: PASS
Run: `.venv/bin/pytest engine/tests/test_merge_facts_apply.py engine/tests/test_merge_facts_verbs.py engine/tests/test_merge_facts_audit.py engine/tests/test_merge_facts_core.py engine/tests/test_merge_facts_ladder.py engine/tests/test_merge_facts_revert.py engine/tests/test_merge_tombstone_facts_warning.py engine/tests/test_validate_facts_content.py tests/test_all_schemas_selfvalid.py -q`   Expected: PASS — the closed payloads must not refuse anything these fixtures build. Any failure here names a member the v3 vocabulary dropped by accident; add it back to the payload rather than loosening `additionalProperties`.

- [ ] **Step 12: Commit**

```bash
git add schemas/facts.schema.json schemas/facts-delta.schema.json schemas/facts-unit.schema.json \
        schemas/facts-index.schema.json schemas/manifest.schema.json \
        schemas/facts-run-meta.schema.json schemas/README.md \
        tests/test_facts_schema.py tests/fixtures/facts \
        engine/merge_facts/__init__.py engine/merge_facts/revert.py engine/merge_facts/verbs.py \
        engine/tests/facts_helpers.py engine/tests/test_merge_facts_apply.py \
        engine/tests/test_merge_facts_audit.py engine/tests/test_merge_facts_core.py \
        engine/tests/test_merge_facts_revert.py engine/tests/test_merge_facts_verbs.py \
        engine/tests/test_merge_tombstone_facts_warning.py engine/tests/test_validate_facts_content.py
git commit -m "feat(facts): schemas v2 — closed payloads, instances, applies_to, the unit contract" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 3: Reset the store to the units seed and mark it v2 (data-repo, migration §8 steps 1–2)

**Files:**
- Modify (data-repo): `facts/items.json`, `facts/records.json`, `facts/rules.json`, `facts/measurements.json`, `facts/notes.json`, `facts/.index.json`
- Delete (data-repo): `facts/originals/*.txt` for every id the reset removes (140 files today)
- Untouched, deliberately: `facts/.id-seq.json` (stays at `{"fact": 486}`), `runs/facts/cooking/2026090*`, `runs/facts/management/20260906-*`

**Interfaces:**
- Consumes: T2's `schemas/facts.schema.json` and `schemas/facts-index.schema.json` at `schema_version` 2 — this task cannot pass its own validation before T2 lands; `validate` from the code-repo venv (`../code-repo/.venv/bin/validate`), which resolves schemas out of `SCHEMA_DIR`.
- Produces: a one-entry store (`F-00001`, the `units` record) at `schema_version: 2`, with `facts/.id-seq.json` still at 486 so no id is ever re-minted onto different content. T20's rebuild starts from exactly this state.

Read first: spec §8 steps 1–2 (why `merge facts revert` cannot be used: the two 2026-09-06 repair runs touched the same ids and `revert.py` refuses a run a later run overlapped — verified), and the postmortem for what is being discarded (486 entries the owner rejected). The commit to reset from is **`e1ed655`** — `feat(facts): the sheets estate, its manifest, and the units record`, 2026-09-02 — the only commit whose store holds the `units` seed alone.

- [ ] **Step 1: Verify the commit and record today's state**

```bash
git -C ../data-repo log --oneline -1 e1ed655
git -C ../data-repo show e1ed655 --stat | head -3
cat ../data-repo/facts/.id-seq.json
ls ../data-repo/facts/originals | wc -l
```

Expected: `e1ed655 feat(facts): the sheets estate, its manifest, and the units record`; `{"fact": 486}`; `140`. `git show e1ed655:facts/.id-seq.json` says `{"fact": 1}` — that file is **not** in the checkout list below, and must not be.

- [ ] **Step 2: Check the six files out of e1ed655**

```bash
git -C ../data-repo checkout e1ed655 -- facts/items.json facts/records.json facts/rules.json \
                                        facts/measurements.json facts/notes.json facts/.index.json
```

- [ ] **Step 3: Delete the originals of the removed ids**

```bash
cd ../data-repo && ../code-repo/.venv/bin/python - <<'PY'
import json, pathlib
keep = {e["id"] for e in json.load(open("facts/.index.json"))["entries"]}
gone = [p for p in pathlib.Path("facts/originals").glob("*.txt") if p.stem not in keep]
for p in gone:
    p.unlink()
print(f"{len(gone)} originals removed, {len(list(pathlib.Path('facts/originals').glob('*.txt')))} kept")
PY
```

Expected: `140 originals removed, 0 kept` — the seed record carries no verbatim body, so the directory empties. `facts/originals/` is recreated by `write_text_atomic` on the first v3 apply.

- [ ] **Step 4: Bump the marker to 2 in the six files**

A text replacement of the first occurrence, not a re-serialisation: every other byte of the file — including `F-00001` — must stay exactly as `e1ed655` wrote it.

```bash
cd ../data-repo && ../code-repo/.venv/bin/python - <<'PY'
import pathlib
for n in ("items", "records", "rules", "measurements", "notes", ".index"):
    p = pathlib.Path("facts") / f"{n}.json"
    t = p.read_text(encoding="utf-8")
    assert '"schema_version": 1' in t, p
    p.write_text(t.replace('"schema_version": 1', '"schema_version": 2', 1), encoding="utf-8")
    print(p, "-> 2")
PY
```

- [ ] **Step 5: Validate the seed against the v2 schemas**

```bash
cd ../data-repo && export SCHEMA_DIR="$PWD/../code-repo/schemas"
for f in items records rules measurements notes; do ../code-repo/.venv/bin/validate facts facts/$f.json; done
../code-repo/.venv/bin/validate facts-index facts/.index.json
../code-repo/.venv/bin/validate facts-idseq facts/.id-seq.json
```

Expected: seven `OK: … conforms to …` lines. `validate facts` runs the schema **and** the `merge_facts.content` pass, so this is the real gate, not a shape check.

- [ ] **Step 6: Verify the invariants the reset exists to protect**

```bash
cd ../data-repo && ../code-repo/.venv/bin/python - <<'PY'
import json, subprocess
head = json.loads(subprocess.run(["git", "show", "HEAD:facts/records.json"],
                                 capture_output=True, text=True).stdout)
now = json.load(open("facts/records.json"))
a = [e for e in head["entries"] if e["id"] == "F-00001"][0]
b = [e for e in now["entries"] if e["id"] == "F-00001"][0]
assert json.dumps(a, sort_keys=True, ensure_ascii=False) == \
       json.dumps(b, sort_keys=True, ensure_ascii=False), "F-00001 is not the one HEAD holds"
assert len(now["entries"]) == 1, f"{len(now['entries'])} records survived the reset"
assert now["schema_version"] == 2
assert json.load(open("facts/.id-seq.json")) == {"fact": 486}, "the id sequence moved"
print("F-00001 byte-identical to HEAD's, one record entry, schema_version 2, .id-seq.json still 486")
PY
git -C ../data-repo status --short facts/ | head -20
git -C ../data-repo status --short facts/.id-seq.json
```

Expected: the printed line; the first `status` shows the six modified files plus 140 deletions under `facts/originals/`; the second prints nothing. `HEAD` is still the pre-reset commit at this point — that is what makes the first assertion meaningful.

- [ ] **Step 7: Commit (data-repo, allowlist)**

```bash
git -C ../data-repo add facts/items.json facts/records.json facts/rules.json \
                        facts/measurements.json facts/notes.json facts/.index.json facts/originals
git -C ../data-repo diff --cached --stat -- facts/.id-seq.json     # must print nothing
git -C ../data-repo commit -m "fix(facts): reset the store to the units seed and mark it schema_version 2" -m "The 486 entries of the 2026-09-02 cooking run are discarded (design v3 §8 step 1);
merge facts revert cannot do it — the two 2026-09-06 repair runs overlap the ids.
facts/.id-seq.json stays at 486 so no id is ever re-minted onto other content;
the five run directories stay as history.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

### Task 4a: `dump-workbook` — what a tab keeps (9 rows, two label columns, the header's four rows below it)

**Files:**
- Modify: `engine/dump_workbook/__init__.py:1-31` (module docstring), `:47` (`_HEAD_ROWS`), `:276-336` (`_read_sheet`), `:437-444` (`_head_grid`), `:488-498` (`header_row`), `:722-731` (the tab loop's head/trim)
- Modify: `engine/tests/fixtures/make_workbook.py:37-39, 163-193, 253-279, 282-345` (the five v3 tabs behind a flag)
- Modify: `engine/tests/test_dump_workbook.py:11` (imports), `:228` and `:231-234` (the two assertions that encode the old head depth)
- Test: `engine/tests/test_dump_workbook.py`

**Interfaces:**
- Consumes: nothing new — stdlib `zipfile`/`ElementTree` as the module already uses them.
- Produces: `_read_sheet(data, strings, keep_rows=False, keep_cols=2) -> dict` with a new `"columns": {col: {row: value}}` member holding **every** cell of the two left-most non-empty columns; `header_row(head, merges=())` unchanged in signature and answer (it now slices `head[:5]` itself); `sheets.json` per tab: `head` is the header row plus the four below it (5 rows when a tab has no header row) at the tab's full `cols` width. `make_workbook(..., v3_tabs=False)` and the module constants `V3_SHEETS`, `REPORT_LABELS`, `MIRROR_FORMULA`, `IDS_ROWS`, `BOM_ROWS`.

Read first, in this order: spec §4's `dump-workbook` row and §2.2 (`docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md`); the whole of `engine/dump_workbook/__init__.py` (the module is one file and every helper here is already in it); `engine/tests/fixtures/make_workbook.py` (the OOXML the tests are built from); `engine/tests/test_dump_workbook.py`. Tests run from the repo root: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`.

Why 9 rows: `header_row` searches rows 1–5, `build` samples four rows below the header to guess a column's type, and 5 + 4 = 9 is the deepest that can be needed. Why the two left-most columns: a report tab names its rows down the side, and `row_labels` (T4b) has to read cells the head never reaches.

- [ ] **Step 1: Extend the fixture with the five v3 tabs**

Append to `engine/tests/fixtures/make_workbook.py`, after `_sheet_numbers()` (line 160):

```python
# --------------------------------------------------------------------------
# the v3 tabs (§2.2, §4) — behind `v3_tabs=False` so every pre-v3 test keeps
# the four-tab workbook it was written against.

V3_SHEETS = [("گزارش پیتزا", False), ("SheetsFileIds", False),
             ("Table_Ingredients_Pizza", False), ("موجودی اول شب", False),
             ("پیتزا امریکایی", False)]

# The report tab's label column, B6:B15 — one ingredient per row, no header
# cell of its own (`Gozaresh markazi!پیتزا` is shaped exactly this way).
REPORT_LABELS = ["پنیر پیتزا", "گوشت رست بیف", "ژامبون سه گانه", "پپرونی",
                 "مرغ پیتزا", "قارچ", "فلفل دلمه", "زیتون", "سس مخصوص",
                 "خمیر پیتزا"]
# The mirror tab's one formula: a LET whose *result* is a whole-tab import.
MIRROR_FORMULA = ('LET(\nsheetName,"پیتزا امریکایی",\ndataRange,"A:C",\n'
                  'IMPORT_FROM_SHEET(SheetsFileId_Pizza,sheetName,dataRange)\n)')
IDS_ROWS = [["Range Name Associated", "Sheets File Id"],
            ["SheetsFileId_Pizza", "SIDPIZZA"],
            ["SheetsFileId_Kanter", "SIDKANTER"]]
BOM_ROWS = [["نام", "پنیر پیتزا ##1", "گوشت رست بیف ##2"],
            ["رستبیف #71", "180", "80"],
            ["تگزاس #309", "180", "0"],
            ["مخلوط #74", "150", "0"]]


def _sheet_report_v3():
    """Tab 5 — a date block banded over rows 2–4, the header on row 5, the row
    labels in B6:B15 and column A empty from top to bottom."""
    rows = ['<row r="2">' + _inline("B2", "تاریخ")
            + _inline("E2", "پیتزا\n(تمام وزن ها به کیلوگرم است)") + "</row>",
            '<row r="3">' + "".join(_inline(c + "3", t) for c, t in
                                    zip("BCD", ["روز", "ماه", "سال"])) + "</row>",
            '<row r="4">' + _num("B4", 29) + _inline("C4", "مرداد")
            + _num("D4", 1405) + "</row>",
            '<row r="5">' + "".join(
                _inline(c + "5", t) for c, t in
                zip("EFG", ["موجودی اول شب", "مصرف اعلامی", "انحراف"])) + "</row>"]
    for i, label in enumerate(REPORT_LABELS):
        r = 6 + i
        rows.append(f'<row r="{r}">' + _inline(f"B{r}", label)
                    + _num(f"E{r}", 10 + i) + _num(f"F{r}", 20 + i)
                    + _formula(f"G{r}", f"MINUS(F{r},E{r})", "10") + "</row>")
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:G15"/>'
            "<sheetData>" + "".join(rows) + "</sheetData>"
            '<mergeCells count="2"><mergeCell ref="B2:D2"/>'
            '<mergeCell ref="E2:G4"/></mergeCells></worksheet>')


def _sheet_ids():
    """Tab 6 — the ids tab: a named range per row and the spreadsheetId it
    resolves to. The estate spells it `SheetsFileIds` and `SheetsFileIDs`."""
    rows = [f'<row r="{r}">' + "".join(_inline(f"{c}{r}", v)
                                       for c, v in zip("AB", row)) + "</row>"
            for r, row in enumerate(IDS_ROWS, start=1)]
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:B3"/>'
            "<sheetData>" + "".join(rows) + "</sheetData></worksheet>")


def _sheet_mirror():
    """Tab 7 — a mirror: one formula at A1 and the values Google spills beside
    it. Its column A reads exactly like a label column, which is why a
    predicate over the formula, not the shape of the values, has to decide."""
    rows = [f'<row r="1">{_formula("A1", MIRROR_FORMULA, "نام", t="str")}'
            + _inline("B1", "پنیر پیتزا ##1") + "</row>"]
    for i, name in enumerate(["رستبیف #71", "تگزاس #309", "مخلوط #74"]):
        r = 2 + i
        rows.append(f'<row r="{r}">' + _inline(f"A{r}", name)
                    + _num(f"B{r}", 180 + i) + "</row>")
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:B4"/>'
            "<sheetData>" + "".join(rows) + "</sheetData></worksheet>")


def _sheet_line():
    """Tab 8 — a line-inventory tab: `روز | ماه | سال` and a coded column. Six
    rows, so the 60-row bound does not save it: the header words are what keep
    its month column out of `row_labels`."""
    rows = ['<row r="1">' + "".join(
        _inline(f"{c}1", t) for c, t in
        zip("ABCD", ["روز", "ماه", "سال", "وزن پنیر پیتزا ##1"])) + "</row>"]
    for i, month in enumerate(["آذر", "دی", "بهمن", "اسفند", "فروردین"]):
        r = 2 + i
        rows.append(f'<row r="{r}">' + _num(f"A{r}", 8 + i)
                    + _inline(f"B{r}", month) + _num(f"C{r}", 1404)
                    + _num(f"D{r}", 39 + i) + "</row>")
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:D6"/>'
            "<sheetData>" + "".join(rows) + "</sheetData></worksheet>")


def _sheet_bom():
    """Tab 9 — a BOM tab as `Mavade Avalie` holds them: item codes in the
    header, no formula of its own, no date column."""
    rows = ['<row r="1">' + "".join(_inline(f"{c}1", t)
                                    for c, t in zip("ABC", BOM_ROWS[0])) + "</row>"]
    for r, row in enumerate(BOM_ROWS[1:], start=2):
        rows.append(f'<row r="{r}">' + _inline(f"A{r}", row[0])
                    + _num(f"B{r}", row[1]) + _num(f"C{r}", row[2]) + "</row>")
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:C4"/>'
            "<sheetData>" + "".join(rows) + "</sheetData></worksheet>")
```

Then thread the tab list through the three helpers that assume four tabs — replace the three signatures and the two `len(SHEETS)` uses:

```python
def _workbook(names, lambda_name, sheets=SHEETS):
    sheets_xml = "".join(
        f'<sheet state="{"hidden" if hidden else "visible"}" '
        f'name="{esc(name)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>'
        for i, (name, (_, hidden)) in enumerate(zip(names, sheets)))
    defined = [f'<definedName name="Refresher">{esc(names[2])}!$A$1</definedName>']
    if lambda_name:
        defined.append(f'<definedName name="FILTER_BY_DATE">'
                       f'{esc(LAMBDA_BODY)}</definedName>')
    # The same name under two sheet scopes — both must be emitted.
    defined.append('<definedName localSheetId="0" name="Kitchen_Dough">'
                   f'{esc(names[0])}!$A:$E</definedName>')
    defined.append('<definedName localSheetId="1" name="Kitchen_Dough">'
                   f"'{esc(names[1])}'!$A:$E</definedName>")
    return (f'{XML}<workbook xmlns="{MAIN}" xmlns:r="{DOC_RELS}">'
            f"<workbookPr/><sheets>{sheets_xml}</sheets>"
            f'<definedNames>{"".join(defined)}</definedNames></workbook>')


def _workbook_rels(dangling_rel=False, count=len(SHEETS)):
    """`dangling_rel` drops the last tab's relationship, so its `r:id` resolves
    to nothing — a part the dumper cannot open."""
    rels = "".join(
        f'<Relationship Id="rId{i + 1}" Type="{DOC_RELS}/worksheet" '
        f'Target="worksheets/sheet{i + 1}.xml"/>'
        for i in range(count - (1 if dangling_rel else 0)))
    rels += (f'<Relationship Id="rId90" Type="{DOC_RELS}/styles" '
             'Target="styles.xml"/>'
             f'<Relationship Id="rId91" Type="{DOC_RELS}/sharedStrings" '
             'Target="sharedStrings.xml"/>')
    return f'{XML}<Relationships xmlns="{PKG_RELS}">{rels}</Relationships>'
```

and in `_content_types(threaded_comment, count=len(SHEETS))` replace `for i in range(len(SHEETS)):` with `for i in range(count):`. Finally, in `make_workbook`, add the flag and the five parts:

```python
def make_workbook(path, *, shared_formula=True, dummyfunction=True,
                  lambda_name=True, threaded_comment=True,
                  merged_band_header=True, reference_tab=True,
                  structure_md=True, spreadsheet_id="TESTID01",
                  sheet_names=None, exported="2026-08-29T10:38:50.643Z",
                  dangling_rel=False, v3_tabs=False):
    ...
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    layout = SHEETS + (V3_SHEETS if v3_tabs else [])
    given = list(sheet_names or [])
    names = given + [name for name, _ in layout[len(given):]]

    table = {}

    def strings(value):
        return table.setdefault(value, len(table))

    reference = _sheet_reference(strings) if reference_tab else _sheet_empty()
    parts = {
        "[Content_Types].xml": _content_types(threaded_comment, len(layout)),
        ...
        "xl/workbook.xml": _workbook(names, lambda_name, layout),
        "xl/_rels/workbook.xml.rels": _workbook_rels(dangling_rel, len(layout)),
        ...
    }
    if v3_tabs:
        parts["xl/worksheets/sheet5.xml"] = _sheet_report_v3()
        parts["xl/worksheets/sheet6.xml"] = _sheet_ids()
        parts["xl/worksheets/sheet7.xml"] = _sheet_mirror()
        parts["xl/worksheets/sheet8.xml"] = _sheet_line()
        parts["xl/worksheets/sheet9.xml"] = _sheet_bom()
```

- [ ] **Step 2: Write the failing tests**

Add to `engine/tests/test_dump_workbook.py` after `test_sheets_json_carries_hidden_dimensions_codes_and_the_empty_flag` (line 229), and extend line 11's import to `from dump_workbook import _read_sheet, dump_workbook, header_row, init_manifest`:

```python
def test_the_head_is_the_header_row_and_the_four_rows_below_it(tmp_path):
    """§4 — deep enough for `build` to sample a column's type, and no deeper."""
    _, out = _dump(tmp_path, v3_tabs=True)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    report = sheets["گزارش پیتزا"]
    assert report["header_row"] == 5
    assert len(report["head"]) == 9                  # 5 + 4, of the tab's 15
    assert report["head"][5][1] == "پنیر پیتزا"      # row 6, column B
    assert sheets["آمار"]["header_row"] == 2 and len(sheets["آمار"]["head"]) == 6


def test_every_head_row_is_the_tab_s_full_width(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True)
    for sheet in _json(out / "sheets.json")["sheets"]:
        assert {len(row) for row in sheet["head"]} <= {sheet["cols"]}, sheet["name"]


def test_header_row_still_searches_only_the_first_five_rows():
    """The head is nine rows deep now; the header is still found where it was
    or nowhere at all — no estate tab may change its header row (§7)."""
    assert header_row([["1"], ["2"], ["3"], ["4"], ["5"], ["کد", "نام"]]) is None


def test_read_sheet_keeps_every_cell_of_the_two_left_most_non_empty_columns(tmp_path):
    book = make_workbook(tmp_path / "wb" / "Test.xlsx", v3_tabs=True)
    sheet = _read_sheet(zipfile.ZipFile(book).read("xl/worksheets/sheet5.xml"), [])
    assert sorted(sheet["columns"]) == [2, 3]        # column A is empty
    assert sheet["columns"][2][6] == "پنیر پیتزا"    # below the head, and kept
    assert sheet["columns"][2][15] == "خمیر پیتزا"
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: FAIL with `ImportError: cannot import name '_read_sheet'` and, once that import is dropped, `KeyError: 'گزارش پیتزا'` / `assert 5 == 9`.

- [ ] **Step 4: Implement — `_read_sheet` keeps two columns, `header_row` stays at five, the head is trimmed**

In `engine/dump_workbook/__init__.py`, replace the constant at line 47 with:

```python
_HEAD_ROWS = 5                      # rows searched for a header row
_KEEP_ROWS = 9                      # rows kept: a header at row 5, plus four
_LABEL_COLS = 2                     # left-most non-empty columns kept whole
```

In `_read_sheet` (line 276): change the signature to
`def _read_sheet(data, strings, keep_rows=False, keep_cols=_LABEL_COLS):`,
add `"columns": {}` to the `sheet` dict, and replace the `if value != "":` block inside the cell loop with:

```python
            if value != "":
                if r <= _KEEP_ROWS:
                    sheet["head"].setdefault(r, {})[col] = value
                if keep_rows:
                    sheet["rows"].setdefault(r, {})[col] = value
                if keep_cols:
                    # Which two columns are the left-most *non-empty* ones is
                    # only known once the sheet has gone by — a column further
                    # left can turn up at any row. Dropping the right-most as
                    # each new one arrives keeps two columns in memory instead
                    # of the tab (QF-1: none of this is written unless
                    # `row_labels` says the column names rows).
                    sheet["columns"].setdefault(col, {})[r] = value
                    for extra in sorted(sheet["columns"])[keep_cols:]:
                        del sheet["columns"][extra]
```

Replace `_head_grid` (line 437) and `header_row`'s loop head (line 491):

```python
def _head_grid(sheet):
    """The first ≤ 9 rows as a rectangle of strings at the tab's full width,
    row 1 first. `dump_workbook` trims it to the header row plus four."""
    if not sheet["head"]:
        return []
    last_row = min(_KEEP_ROWS, max(sheet["max_row"], max(sheet["head"])))
    width = max([sheet["max_col"]]
                + [max(cols) for cols in sheet["head"].values() if cols])
    return [[sheet["head"].get(r, {}).get(c, "") for c in range(1, width + 1)]
            for r in range(1, last_row + 1)]
```

```python
    for index, row in enumerate(head[:_HEAD_ROWS], start=1):
```

and in `dump_workbook`'s tab loop (lines 723-725) trim the head before it is written:

```python
            sheet = _read_sheet(zf.read(tab["part"]), strings, keep_rows=keep)
            head = _head_grid(sheet)
            index = header_row(head, sheet["merges"])
            # A tab's head is its header row and the four below it — enough for
            # `build` to sample a column's type. A tab with no header keeps the
            # five rows the header search looked at.
            head = head[:index + 4] if index else head[:_HEAD_ROWS]
```

Update the module docstring's line 10-11 to say `sheets.json` keeps "the header row and the four rows below it, plus every cell of the two left-most non-empty columns (§4)" instead of "first ≤ 5 rows".

- [ ] **Step 5: Correct the two assertions that encode the old depth**

`engine/tests/test_dump_workbook.py:228` becomes `assert len(sheets["آمار"]["head"]) == 6` (header row 2 + four), and the docstring at `:233-234` becomes "(`sheets.json` keeps the header row and four rows below it for every tab: the header row is found in them and `build` samples types from them.)".

- [ ] **Step 6: Run the tests and watch them pass**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/dump_workbook/__init__.py engine/tests/test_dump_workbook.py \
        engine/tests/fixtures/make_workbook.py
git commit -F - <<'EOF'
feat(facts): dump-workbook keeps nine rows and the two left-most columns

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
```

---

### Task 4b: `row_labels` and the three predicates that guard it

**Files:**
- Modify: `engine/dump_workbook/__init__.py` (new section after `header_row`, ~line 499; the tab loop at `:722-731`)
- Test: `engine/tests/test_dump_workbook.py`

**Interfaces:**
- Consumes: `_read_sheet(...)["columns"]` and the trimmed `head` + `header_row` index from T4a; `_formula_rows(name, sheet)` (existing, line 515) whose rows are `[sheet, range, group, formula, count, cached, error]`.
- Produces: `is_mirror_tab(formulas_for_tab) -> bool`, `is_ids_tab(name) -> bool`, `has_date_header(head_row) -> bool`, `row_labels(sheet, head, header_index) -> dict[str, str]`; `sheets.json` per tab gains `"row_labels": {"6": "وزن پنیر پیتزا", …}`, **absent** when no column qualifies. T4c, T4d and every `facts_plan` task (T10–T13) call these four by these names.

Read first: T4a's changes, spec §4's `row_labels` sentence and §2.2's last three sentences, and QF-48 in §1. The predicates are the whole of QF-48's mechanics: a *mirror tab* holds exactly one formula, at A1, whose body is one `IMPORT_FROM_SHEET` call — bare, or as the result expression of a `LET`. A formula that merely contains an import inside a bigger computation is an ordinary rule.

- [ ] **Step 1: Write the failing test**

Add to `engine/tests/test_dump_workbook.py` (import line 11 gains `has_date_header, is_ids_tab, is_mirror_tab, row_labels`; line 14 gains `MIRROR_FORMULA, REPORT_LABELS`):

```python
def _sheet(columns, max_row):
    """The two members of a `_read_sheet` result that `row_labels` reads."""
    return {"max_row": max_row, "columns": columns}


def test_row_labels_are_written_for_a_report_tab_and_a_bom_tab(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["گزارش پیتزا"]["row_labels"] == {
        str(6 + i): label for i, label in enumerate(REPORT_LABELS)}
    assert sheets["پیتزا امریکایی"]["row_labels"] == {
        "2": "رستبیف #71", "3": "تگزاس #309", "4": "مخلوط #74"}


def test_no_row_labels_on_a_month_column_a_mirror_or_an_ids_tab(tmp_path):
    """A mirror's spilled values and an ids tab's range names read exactly like
    labels; a month column reads like one too. None of them names a row."""
    _, out = _dump(tmp_path, v3_tabs=True)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    for name in ("موجودی اول شب", "Table_Ingredients_Pizza", "SheetsFileIds"):
        assert "row_labels" not in sheets[name], name


def test_a_column_of_sentences_is_not_a_label_column():
    """`Hesabdari!نیازمندیها و مشکلات` — a label names a thing, a sentence is a
    nightly note (QF-1)."""
    note = "در یخچال از یک طرف افتاده و باید تعمیر شود"
    cells = {r: f"{note} {r}" for r in range(2, 6)}
    assert row_labels(_sheet({2: cells}, 5), [["تاریخ", "مشکل"]], 1) == {}


def test_a_column_that_repeats_itself_is_not_a_label_column():
    cells = {r: "تعمیر" for r in range(2, 6)}
    assert row_labels(_sheet({2: cells}, 5), [["تاریخ", "مشکل"]], 1) == {}


def test_a_month_column_with_no_header_is_still_a_date_part():
    cells = {2: "آذر", 3: "دی", 4: "بهمن", 5: "اسفند"}
    assert row_labels(_sheet({2: cells}, 5), [["", ""]], 1) == {}


def test_a_column_of_dates_in_either_estate_form_is_not_a_label_column():
    cells = {2: "1405/04/18", 3: "16/4/1405", 4: "1405/04/20", 5: "1405/04/21"}
    assert row_labels(_sheet({2: cells}, 5), [["", ""]], 1) == {}


def test_a_tab_over_sixty_rows_gets_no_labels():
    cells = {r: f"قلم {r}" for r in range(2, 61)}
    assert row_labels(_sheet({1: cells}, 60), [["نام"]], 1) == {}


def test_is_mirror_tab_only_for_a_whole_tab_import():
    at_a1 = [["t", "A1", "", MIRROR_FORMULA, 1, "نام", ""]]
    assert is_mirror_tab(at_a1)
    assert not is_mirror_tab([])
    assert not is_mirror_tab([["t", "B2", "", MIRROR_FORMULA, 1, "", ""]])
    assert not is_mirror_tab(at_a1 + [["t", "A2", "", "SUM(AN)", 1, "", ""]])
    assert not is_mirror_tab(                      # an import inside a rule
        [["t", "A1", "", "SUM(IMPORT_FROM_SHEET(A,B,C),1)", 1, "", ""]])


def test_is_ids_tab_takes_both_spellings_the_estate_uses():
    assert is_ids_tab("SheetsFileIds") and is_ids_tab("SheetsFileIDs")
    assert is_ids_tab(" sheetsfileid ")
    assert not is_ids_tab("Table_Ingredients_Pizza")


def test_has_date_header_names_a_date_column():
    assert has_date_header(["تاریخ", "رستبیف #71"])
    assert has_date_header(["روز", "ماه", "سال", "وزن پنیر پیتزا ##1"])
    assert has_date_header(["Column 1", "ماه", "سال"])   # Anbar markazi!فرنگی
    assert not has_date_header(["نام", "پنیر پیتزا ##1"])
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: FAIL with `ImportError: cannot import name 'row_labels' from 'dump_workbook'`.

- [ ] **Step 3: Write the implementation**

Insert after `header_row` in `engine/dump_workbook/__init__.py`:

```python
# --------------------------------------------------------------------------
# what a tab is, and what its rows are called

_MONTHS = ("فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
           "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند")
_DATE_WORDS = ("تاریخ", "روز", "ماه", "سال")
_DATE_VALUE = re.compile(r"^\d{1,4}/\d{1,2}/\d{1,4}$")   # 1405/04/18, 16/4/1405
_LABEL_ROWS = 60        # above this a tab logs nightly values, not a table
_LABEL_CHARS = 40       # a label names a thing; longer is a sentence
_IDS_TAB = re.compile(r"sheetsfileids?", re.I)
_BLANKS = re.compile(r"\s|\\n|\\t")


def _one_call(text):
    """`F(a,b)` → `("F", "a,b")` when the whole string is that one call, else
    `None` — `F(a)+1` and `F(a)+G(b)` are not one call."""
    match = re.match(r"([A-Za-z_][A-Za-z0-9_.]*)\(", text)
    if not match:
        return None
    depth, in_string = 0, False
    for i in range(match.end() - 1, len(text)):
        ch = text[i]
        if in_string:
            in_string = ch != '"'
        elif ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return (match.group(1), text[match.end():i]) \
                    if i == len(text) - 1 else None
    return None


def _top_args(inner):
    """A call's arguments, split on the commas at depth zero."""
    out, depth, in_string, current = [], 0, False, ""
    for ch in inner:
        if in_string:
            current += ch
            in_string = ch != '"'
            continue
        if ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            out.append(current)
            current = ""
            continue
        current += ch
    out.append(current)
    return out


def is_mirror_tab(formulas_for_tab):
    """QF-48 — exactly one formula, at A1, whose body is a single
    `IMPORT_FROM_SHEET` call, bare or as a `LET`'s result expression. Such a tab
    is an edge between two records, never a record: it produces no entry and no
    rule. A formula that merely *contains* an import inside a larger
    computation (the salon and sandogh row lookups) is an ordinary rule, which
    is why the body is parsed and not searched. Rows are `_formula_rows`'
    output: `[sheet, range, group, formula, count, cached, error]`.
    """
    if len(formulas_for_tab) != 1:
        return False
    span, text = formulas_for_tab[0][1] or "", formulas_for_tab[0][3] or ""
    if span.replace("$", "") != "A1":
        return False
    call = _one_call(_BLANKS.sub("", text))
    if call and call[0].upper() == "LET":
        call = _one_call(_top_args(call[1])[-1])
    return bool(call) and call[0].upper() == "IMPORT_FROM_SHEET"


def is_ids_tab(name):
    """The tab that maps a named range to a spreadsheetId. The estate spells it
    `SheetsFileIds` and `SheetsFileIDs`; both are the same tab (§2.2)."""
    return bool(_IDS_TAB.fullmatch((name or "").strip()))


def has_date_header(head_row):
    """Does this header row name a date column? «تاریخ», or two of «روز»,
    «ماه», «سال» — a definition table is keyed by a name, a nightly log by a
    date (§2.2). Two of the three rather than «روز» plus one, because
    `Anbar markazi!فرنگی` heads its day column `Column 1` and still logs a
    date."""
    cells = [str(v).strip() for v in (head_row or [])]
    if any("تاریخ" in cell for cell in cells):
        return True
    return sum(any(word in cell for cell in cells)
               for word in ("روز", "ماه", "سال")) >= 2


def _majority(values, test):
    return sum(1 for value in values if test(value)) * 2 > len(values)


def row_labels(sheet, head, header_index):
    """`{row: text}` for the tab's label column, or `{}` — the rows of a small
    table named down its side (§4).

    Only the two columns `_read_sheet` kept are candidates, and only the rows
    below the header: above it sits whatever date block the tab carries. Every
    guard says the same thing from a different side — a label names a thing,
    and whatever changes nightly is a value (QF-1, which §4 amends for this one
    field): a date part (a month name, a `1405/04/18` or `16/4/1405` value, a
    column headed «تاریخ»/«روز»/«ماه»/«سال»), a column of numbers, a column of
    sentences and a column that repeats itself are all values wearing a label's
    hat. The caller adds the two tab-level guards this cannot see: a mirror
    tab's spilled values and an ids tab's range names name the rows of nothing.
    """
    if not sheet["max_row"] or sheet["max_row"] >= _LABEL_ROWS:
        return {}
    header = head[header_index - 1] if header_index else []
    for col in sorted(sheet["columns"]):
        cells = {row: str(value).strip()
                 for row, value in sheet["columns"][col].items()
                 if row > (header_index or 0) and str(value).strip()}
        if not cells:
            continue
        title = header[col - 1] if col <= len(header) else ""
        values = list(cells.values())
        if any(word in title for word in _DATE_WORDS):
            continue
        if not _majority(values, lambda v: not _is_number(v)):
            continue
        if _majority(values,
                     lambda v: v in _MONTHS or bool(_DATE_VALUE.match(v))):
            continue
        if max(len(value) for value in values) > _LABEL_CHARS:
            continue
        if len(set(values)) * 2 < len(values):
            continue
        return {str(row): cells[row] for row in sorted(cells)}
    return {}
```

Then wire it into `dump_workbook`'s tab loop — replace lines 726-732 (`sheets.append(...)` through `formulas += _formula_rows(...)`) with:

```python
            tab_formulas = _formula_rows(tab["name"], sheet)
            entry = {"sheetId": tab["sheetId"], "name": tab["name"],
                     "hidden": tab["hidden"],
                     "dimension": sheet["dimension"] or _extent(sheet),
                     "rows": sheet["max_row"], "cols": sheet["max_col"],
                     "head": head, "header_row": index,
                     "codes": _codes(head), "empty": sheet["empty"]}
            labels = ({} if is_ids_tab(tab["name"]) or is_mirror_tab(tab_formulas)
                      else row_labels(sheet, head, index))
            if labels:
                entry["row_labels"] = labels
            sheets.append(entry)
            formulas += tab_formulas
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/dump_workbook/__init__.py engine/tests/test_dump_workbook.py
git commit -F - <<'EOF'
feat(facts): row_labels, and the mirror/ids/date predicates that guard them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
```

---

### Task 4c: an ids tab's rows are dumped like a reference tab's

**Files:**
- Modify: `engine/dump_workbook/__init__.py:633-652` (signature and docstring), `:722` (`keep`), `:751-755` (the stale-tab warning)
- Test: `engine/tests/test_dump_workbook.py`

**Interfaces:**
- Consumes: `is_ids_tab(name)` (T4b); `_reference_rows` and `_merge_columns` (existing, lines 561 and 804).
- Produces: `dump_workbook(xlsx_path, structure_md_path, out_dir, reference_tabs=(), ids_tabs=(), prev_sheets=None, roles=None)` — `rows.tsv` now holds the cells of every confirmed reference tab **and** of every ids tab, one file per workbook with the union header `_merge_columns` already builds. `facts_plan`'s import resolution (T12) reads the ids rows from here: named range → cell → spreadsheetId.

Read first: T4b; §2.3's **import edge** row (the three hops); the `rows.tsv` sentences in §4 and §2.2.

- [ ] **Step 1: Write the failing test**

```python
def test_an_ids_tab_is_dumped_to_rows_tsv_without_being_a_reference_tab(tmp_path):
    """The three hops of an import edge start here: the named range is only in
    this tab, and no manifest row will ever confirm it as a table (§2.2)."""
    _, out = _dump(tmp_path, v3_tabs=True)
    rows = _tsv(out / "rows.tsv")
    assert {r["sheet"] for r in rows} == {"SheetsFileIds"}
    assert [r["Range Name Associated"] for r in rows] == ["SheetsFileId_Pizza",
                                                          "SheetsFileId_Kanter"]
    assert rows[0]["Sheets File Id"] == "SIDPIZZA"


def test_both_estate_spellings_of_the_ids_tab_are_dumped(tmp_path):
    from fixtures.make_workbook import SHEETS, V3_SHEETS
    names = [name for name, _ in SHEETS + V3_SHEETS]
    names[5] = "SheetsFileIDs"
    _, out = _dump(tmp_path, v3_tabs=True, sheet_names=names)
    assert {r["sheet"] for r in _tsv(out / "rows.tsv")} == {"SheetsFileIDs"}


def test_a_reference_tab_and_the_ids_tab_share_one_rows_tsv(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True, reference_tabs=["پیتزا امریکایی"])
    by_sheet = {}
    for row in _tsv(out / "rows.tsv"):
        by_sheet.setdefault(row["sheet"], []).append(row)
    assert sorted(by_sheet) == ["SheetsFileIds", "پیتزا امریکایی"]
    assert by_sheet["پیتزا امریکایی"][0]["نام"] == "رستبیف #71"


def test_no_other_tab_s_cells_ride_along_with_the_ids_rows(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True)
    text = (out / "rows.tsv").read_text(encoding="utf-8")
    assert "933" not in text and "پنیر پیتزا" not in text    # QF-1 still holds
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: FAIL with `FileNotFoundError: … /rows.tsv` (no reference tab is confirmed, so nothing is written today).

- [ ] **Step 3: Write the implementation**

In `engine/dump_workbook/__init__.py`, change the signature and the `keep` line:

```python
def dump_workbook(xlsx_path, structure_md_path, out_dir, reference_tabs=(),
                  ids_tabs=(), prev_sheets=None, roles=None):
```

Extend the docstring's `reference_tabs` sentence with:

```
    An **ids tab** is dumped to `rows.tsv` too, whether or not any manifest row
    names it: its rows are the only place a named range resolves to a
    spreadsheetId, which is hop two of every import edge (§2.2). It is found by
    name (`is_ids_tab`), because no caller can know a workbook's tab names
    before it is opened; `ids_tabs` names any further tab to dump the same way.
```

and inside the tab loop replace line 722:

```python
            keep = (tab["name"] in wanted or tab["name"] in (ids_tabs or ())
                    or is_ids_tab(tab["name"]))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/dump_workbook/__init__.py engine/tests/test_dump_workbook.py
git commit -F - <<'EOF'
feat(facts): an ids tab's rows are dumped like a reference tab's

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
```

---

### Task 4d: Gate M pre-filled — reconciliation, proposals, `unresolved[]`

**Files:**
- Modify: `engine/dump_workbook/__init__.py:876-920` (`init_manifest`) and the section above it
- Modify: `engine/dump_workbook/cli.py:113-124` (the dump loop feeds `init_manifest`)
- Modify: `engine/tests/test_dump_workbook.py:39-46` (`_estate` takes `**kw`), `:421-443` (the idempotence test gains `unresolved`)
- Test: `engine/tests/test_dump_workbook.py`

**Interfaces:**
- Consumes: `is_ids_tab`, `is_mirror_tab`, `has_date_header` (T4b); `manifest.schema.json` **v2** from **T2**, which admits `unresolved: [str]` (enum `departments|branches|reference_tabs`) and `twin_of` — this task's tests validate against it.
- Produces: `manifest_reconcile(row, dump) -> list[dict]` — mutates `row["reference_tabs"]`, returns issues `{"kind": "reference_tab_is_ids" | "reference_tab_is_mirror" | "reference_tab_computes", "spreadsheetId", "sheet", "run_only": True}`; `init_manifest(sheets_root, dumps=None) -> dict` where `dumps` is `{spreadsheetId: {"sheets": <the sheets.json document>, "formulas": [rows]}}`. T12 (`facts_plan.build`) calls `manifest_reconcile` over its own copy of a row to render the run-only issues into `skeleton.json`.

Read first: spec §2.2 in full and §2.1's Gate M row; the current `init_manifest` (line 876) and `cli.py`. The rule the estate depends on: **a row that is already `confirmed` keeps every answer it holds** — an empty judgement column there is the owner's answer «none», not a gap — and only has its reference tabs reconciled. The pre-fill and `unresolved[]` are for new and unconfirmed rows; all 28 estate rows are confirmed today, which is why the cooking run's Gate M is skipped.

- [ ] **Step 1: Write the failing test**

Add to `engine/tests/test_dump_workbook.py` (import `manifest_reconcile` on line 11, `MIRROR_FORMULA` on line 14), and give `_estate` a passthrough: `def _estate(tmp_path, books=(...), **kw):` … `make_workbook(sheets / directory / name, spreadsheet_id=sid, **kw)`:

```python
def test_manifest_reconcile_drops_the_three_kinds_of_wrong_reference_tab():
    """The owner answered the question that was put at Gate M, and the question
    never mentioned that a tab whose only formula is a whole-tab import is an
    edge (QF-48). The row is repaired in place and silently (§2.2)."""
    row = {"spreadsheetId": "SID1", "confirmed": True,
           "reference_tabs": ["SheetsFileIds", "Table_Ingredients_Pizza",
                              "مواد حساس", "پیتزا امریکایی"]}
    dump = {"sheets": {"sheets": []},
            "formulas": [["Table_Ingredients_Pizza", "A1", "", MIRROR_FORMULA,
                          1, "نام", ""],
                         ["مواد حساس", "G6", "", "MINUS(FN,EN)", 1, "10", ""]]}
    issues = manifest_reconcile(row, dump)
    assert row["reference_tabs"] == ["پیتزا امریکایی"]
    assert row["confirmed"] is True             # reconciled, never re-asked
    assert [(i["kind"], i["sheet"]) for i in issues] == [
        ("reference_tab_is_ids", "SheetsFileIds"),
        ("reference_tab_is_mirror", "Table_Ingredients_Pizza"),
        ("reference_tab_computes", "مواد حساس")]
    assert all(i["run_only"] and i["spreadsheetId"] == "SID1" for i in issues)


def test_init_manifest_proposes_the_bom_tab_and_nothing_dated(tmp_path, monkeypatch,
                                                              capsys):
    """§2.2's reference-tab proposal: item codes, no formulas, no date column.
    The line tab carries codes and no formulas too — the date header is the
    only thing that separates a nightly log from a definition table."""
    root = _estate(tmp_path, v3_tabs=True)
    monkeypatch.setenv("DATA_ROOT", str(root))
    assert main(["--init-manifest"]) == 0
    manifest = _json(root / "attachments" / "sheets" / "manifest.json")
    validate("manifest.schema.json", manifest)
    row = next(w for w in manifest["workbooks"] if w["spreadsheetId"] == "SID1")
    assert row["reference_tabs"] == ["پیتزا امریکایی"]
    assert row["departments"] == [] and row["branches"] == []
    assert row["unresolved"] == ["departments", "branches"]
    assert row["confirmed"] is False


def test_the_branch_token_in_the_path_is_proposed(tmp_path, monkeypatch, capsys):
    root = _estate(tmp_path, books=(
        ("MandeShab__ChaleBagh__Amar__Farangi", "Farangi.xlsx", "SID1"),
        ("Sandogh__Sandogh - NaharKhoran", "Sandogh.xlsx", "SID2")))
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    rows = {w["spreadsheetId"]: w for w in
            _json(root / "attachments" / "sheets" / "manifest.json")["workbooks"]}
    assert rows["SID1"]["branches"] == ["chalebagh"]
    assert rows["SID2"]["branches"] == ["naharkhoran"]
    assert "branches" not in rows["SID1"]["unresolved"]


def test_the_department_is_proposed_only_when_the_confirmed_siblings_agree(
        tmp_path, monkeypatch, capsys):
    """The tree does not determine a department — `…__Amar__Kanter` is cooking
    and `…__Amar__Anbar markazi` is warehouse — so agreement is the whole
    test."""
    root = _estate(tmp_path, books=(("Amar__Pitza", "Pitza.xlsx", "SID1"),
                                    ("Amar__Kanter", "Kanter.xlsx", "SID2"),
                                    ("Anbar__Anbar", "Anbar.xlsx", "SID3")))
    sheets = root / "attachments" / "sheets"
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        if workbook["spreadsheetId"] == "SID1":
            workbook.update(departments=["cooking"], branches=["chalebagh"],
                            reference_tabs=[], unresolved=[], confirmed=True)
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    main(["--init-manifest"])
    rows = {w["spreadsheetId"]: w for w in
            _json(sheets / "manifest.json")["workbooks"]}
    assert rows["SID2"]["departments"] == ["cooking"]   # same first segment
    assert rows["SID3"]["departments"] == []            # a different one


def test_a_confirmed_row_keeps_its_answers_and_is_never_re_proposed(
        tmp_path, monkeypatch, capsys):
    """An empty judgement column on a confirmed row is the owner's «none».
    Re-proposing it would send all 28 estate rows back to Gate M."""
    root = _estate(tmp_path, v3_tabs=True)
    sheets = root / "attachments" / "sheets"
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        workbook.update(departments=["cooking"], branches=["chalebagh"],
                        reference_tabs=[], unresolved=[], confirmed=True)
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    main(["--init-manifest"])
    rows = {w["spreadsheetId"]: w for w in
            _json(sheets / "manifest.json")["workbooks"]}
    assert rows["SID1"]["reference_tabs"] == []
    assert rows["SID1"]["unresolved"] == [] and rows["SID1"]["confirmed"] is True
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: FAIL with `ImportError: cannot import name 'manifest_reconcile'`, then `KeyError: 'unresolved'`.

- [ ] **Step 3: Implement `manifest_reconcile` and the three proposals**

Insert in `engine/dump_workbook/__init__.py` above `init_manifest` (line 876):

```python
_JUDGEMENT = ("departments", "branches", "reference_tabs")
_BRANCH_CODES = ("chalebagh", "naharkhoran")


def _first_segment(directory):
    """`MandeShab__ChaleBagh__Amar__Pitza` → `MandeShab`. The estate's paths
    join their segments with `__` inside one directory name as often as with
    `/`, so both separate."""
    return next((s for part in (directory or "").split("/")
                 for s in part.split("__") if s), "")


def manifest_reconcile(row, dump):
    """Take out of a row's `reference_tabs` the tabs that cannot be a reference
    record, and say which and why (§2.2).

    Three of the estate's confirmed rows name a tab that is not a table: an ids
    tab, a mirror (QF-48) and a tab that computes — procurement's «مواد حساس»
    and «مواد عادی». A person answered the question that was put at Gate M and
    the question mentioned none of this, so the row is repaired in place and
    silently; the issues come back for the run to report once, and none of them
    makes the row unresolved. `dump` is `{"sheets": <the sheets.json
    document>, "formulas": <the formulas.tsv rows>}`.
    """
    by_tab = {}
    for formula in dump.get("formulas") or []:
        by_tab.setdefault(formula[0], []).append(formula)
    issues, kept = [], []
    for name in row.get("reference_tabs") or []:
        if is_ids_tab(name):
            kind = "reference_tab_is_ids"
        elif is_mirror_tab(by_tab.get(name) or []):
            kind = "reference_tab_is_mirror"
        elif by_tab.get(name):
            kind = "reference_tab_computes"
        else:
            kept.append(name)
            continue
        issues.append({"kind": kind, "sheet": name, "run_only": True,
                       "spreadsheetId": row.get("spreadsheetId")})
    row["reference_tabs"] = kept
    return issues


def _reference_tab_proposal(dump):
    """Tabs that read as definition tables: item codes in the head, no formula
    of their own, no date column in the header (§2.2). The line-inventory and
    sales tabs carry no formulas either, so the no-formula test alone does not
    separate them — the date column does. A mirror always carries its one
    formula, so the same test excludes it."""
    computing = {formula[0] for formula in dump.get("formulas") or []}
    out = []
    for sheet in (dump.get("sheets") or {}).get("sheets") or []:
        head, index = sheet.get("head") or [], sheet.get("header_row")
        if (not sheet.get("codes") or sheet["name"] in computing
                or is_ids_tab(sheet["name"])
                or has_date_header(head[index - 1] if index else [])):
            continue
        out.append(sheet["name"])
    return out


def _propose(row, dump, workbooks):
    """Write §2.2's proposal into each judgement column that is still empty. A
    filled column is never re-proposed, and a proposal that comes out empty
    leaves the column for Gate M to answer."""
    if not row.get("departments"):
        head = _first_segment(row.get("dir"))
        seen = {tuple(w.get("departments") or []) for w in workbooks
                if w is not row and w.get("confirmed")
                and _first_segment(w.get("dir")) == head}
        seen.discard(())
        if len(seen) == 1:
            row["departments"] = list(seen.pop())
    if not row.get("branches"):
        folded = (row.get("dir") or "").lower()
        row["branches"] = [code for code in _BRANCH_CODES if code in folded]
    if not row.get("reference_tabs") and dump:
        row["reference_tabs"] = _reference_tab_proposal(dump)
```

- [ ] **Step 4: Rewrite `init_manifest`**

Replace the body of `init_manifest` (lines 876-920) with:

```python
def init_manifest(sheets_root, dumps=None):
    """Fill the manifest's mechanical columns from the folder, propose the
    judgement columns from the dumps, and write it (§2.2).

    Idempotent, and the two states are different: a **confirmed** row keeps
    every answer it holds — an empty judgement column there is the owner's
    «none», not a gap — and only has its reference tabs reconciled. An
    unconfirmed or new row has its mechanical columns refreshed (a rename is
    mechanical) and a proposal written into every judgement column still empty;
    `unresolved[]` then names the columns no proposal could fill and
    `confirmed` is derived from it, so the two can never disagree. `dumps` is
    `{spreadsheetId: {"sheets": …, "formulas": …}}` from the same invocation's
    dump; a workbook missing from it simply gets no proposal.
    """
    sheets_root = pathlib.Path(sheets_root)
    path = sheets_root / "manifest.json"
    manifest = {"schema_version": SCHEMA_VERSION, "branches": [], "workbooks": []}
    if path.is_file():
        existing = read_json(path)
        manifest["branches"] = existing.get("branches") or []
        manifest["workbooks"] = list(existing.get("workbooks") or [])
    rows = {row.get("spreadsheetId"): row for row in manifest["workbooks"]}
    taken = {row.get("short") for row in manifest["workbooks"] if row.get("short")}

    for xlsx in workbook_files(sheets_root):
        spreadsheet_id = read_spreadsheet_id(structure_md_for(xlsx))
        directory = xlsx.parent.relative_to(sheets_root).as_posix()
        scripts = sorted(f"{directory}/{gs.name}" for gs in xlsx.parent.glob("*.gs"))
        row = rows.get(spreadsheet_id)
        if row is None:
            row = {"spreadsheetId": spreadsheet_id, "short": "",
                   "departments": [], "branches": [], "reference_tabs": [],
                   "unresolved": [], "confirmed": False}
            rows[spreadsheet_id] = row
            manifest["workbooks"].append(row)
        dump = (dumps or {}).get(spreadsheet_id)
        for issue in (manifest_reconcile(row, dump) if dump else []):
            print(f"dump-workbook: warning: {xlsx.name}: {issue['sheet']} is not "
                  f"a reference table ({issue['kind']}) — removed", file=sys.stderr)
        if row.get("confirmed"):
            row["unresolved"] = []
            continue
        row["dir"], row["file"], row["scripts"] = directory, xlsx.name, scripts
        if not row.get("short"):
            row["short"] = _mint_short(directory, xlsx.stem, taken)
            if row["short"]:
                taken.add(row["short"])
        for key in _JUDGEMENT:
            row.setdefault(key, [])
        _propose(row, dump, manifest["workbooks"])
        row["unresolved"] = [key for key in _JUDGEMENT if not row[key]]
        row["confirmed"] = not row["unresolved"]

    write_json_atomic(path, manifest)
    return manifest
```

- [ ] **Step 5: Feed the CLI's dumps into it, and update the idempotence test**

In `engine/dump_workbook/cli.py`, replace the dump loop and the `--init-manifest` tail (lines 113-124):

```python
    dumps = {}
    for xlsx in books:
        summary = dump_workbook(xlsx, structure_md_for(xlsx), dump_root,
                                reference_tabs=reference_tabs.get(xlsx, ()))
        # `init_manifest` proposes from this same invocation's dump (§2.2) — the
        # summary is what was just written, so nothing is read back off disk.
        dumps[summary["spreadsheetId"]] = {"sheets": {"sheets": summary["sheets"]},
                                           "formulas": summary["formulas"]}
        print(f"{summary['spreadsheetId']}\t{xlsx.name}\t"
              f"{summary['meta']['sheet_count']} tabs")

    if args.init_manifest:
        manifest = init_manifest(sheets_root, dumps)
        unresolved = [row for row in manifest["workbooks"] if row.get("unresolved")]
        print(f"manifest: {len(manifest['workbooks'])} workbooks, "
              f"{len(unresolved)} awaiting Gate M")
    return 0
```

In `engine/tests/test_dump_workbook.py:427`, add `unresolved=[]` to the confirmed row's `.update(...)` in `test_init_manifest_is_idempotent_and_touches_nothing_confirmed`, so the second pass writing a derived `unresolved` is not a difference.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/dump_workbook/__init__.py engine/dump_workbook/cli.py \
        engine/tests/test_dump_workbook.py
git commit -F - <<'EOF'
feat(facts): Gate M pre-filled — proposals, unresolved[] and reference-tab reconciliation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
```

---

### Task 4e: `--manifest` skips an unresolved row, and the estate is re-dumped

**Files:**
- Modify: `engine/dump_workbook/cli.py:1-11` (docstring), `:95-111` (the `--manifest` precondition block)
- Modify: `engine/tests/test_dump_workbook.py:509-517` (`test_manifest_mode_refuses_an_unconfirmed_row` is replaced)
- Test: `engine/tests/test_dump_workbook.py`
- Modify (data-repo, script step): `attachments/sheets/.dump/**`, `attachments/sheets/manifest.json`

**Interfaces:**
- Consumes: `unresolved[]` on a manifest row (T4d); `dump_workbook(..., ids_tabs=())` (T4c); `row_labels` (T4b).
- Produces: `dump-workbook --manifest` prints `dump-workbook: warning: <file> skipped (unresolved)` and dumps the rest, exit 0; a workbook with **no** manifest row is still exit 2 (that is a stale manifest, not an unanswered question). After the script step, `data-repo/attachments/sheets/.dump/` is the v3 dump every `facts_plan` fixture (T9–T16) and the §8 step 2a freeze is taken from.

Read first: §2.1's Stage 2 row and §4's `--manifest` sentence; `engine/dump_workbook/cli.py`. Gate M never blocks a run: a workbook the owner has not placed is left out of this pass and named once in the report.

- [ ] **Step 1: Write the failing test**

Replace `test_manifest_mode_refuses_an_unconfirmed_row` (lines 509-517) with this, and add `import shutil` at the top of the file:

```python
def test_manifest_mode_skips_an_unresolved_row_and_dumps_the_rest(
        tmp_path, monkeypatch, capsys):
    """Gate M never blocks (§2.2): the workbook nobody has placed is left out
    of the pass, warned about once, and named in the report."""
    root = _estate(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    sheets = root / "attachments" / "sheets"
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        if workbook["spreadsheetId"] == "SID1":
            workbook.update(departments=["cooking"], branches=["chalebagh"],
                            reference_tabs=["مواد اولیه"], unresolved=[],
                            confirmed=True)
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    shutil.rmtree(sheets / ".dump")
    capsys.readouterr()

    assert main(["--manifest"]) == 0
    assert "Kanter.xlsx skipped (unresolved)" in capsys.readouterr().err
    assert (sheets / ".dump" / "SID1" / "rows.tsv").is_file()
    assert not (sheets / ".dump" / "SID2").exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q -k manifest_mode`   Expected: FAIL with `SystemExit: 2` (the pass still refuses the unconfirmed row).

- [ ] **Step 3: Write the implementation**

In `engine/dump_workbook/cli.py`, replace the `--manifest` block (lines 95-111) with:

```python
    if args.manifest:
        manifest = _read_manifest(sheets_root)
        rows = {row["spreadsheetId"]: row for row in manifest["workbooks"]}
        failures, skipped = [], []
        for xlsx in books:
            row = rows.get(read_spreadsheet_id(structure_md_for(xlsx)))
            if row is None:
                # Not a question anybody has been asked — the manifest is stale
                # and `--init-manifest` is the pass that repairs it.
                failures.append(f"{xlsx.name}: no manifest row")
            elif row.get("unresolved") or not row.get("confirmed"):
                print(f"dump-workbook: warning: {xlsx.name} skipped (unresolved)",
                      file=sys.stderr)
                skipped.append(xlsx)
            else:
                reference_tabs[xlsx] = row.get("reference_tabs") or []
        if failures:
            for line in failures:
                print(f"dump-workbook: {line}", file=sys.stderr)
            raise SystemExit(2)
        books = [xlsx for xlsx in books if xlsx not in skipped]
```

and replace the docstring's third paragraph (lines 8-10) with:

```
A workbook whose manifest row is still unresolved is warned about and skipped:
Gate M never blocks a run (§2.2). A workbook file with no manifest row at all
is still a precondition failure for `--manifest`, reported for every offending
file at once, before anything is written.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_dump_workbook.py -q`   Expected: PASS (all of T4a–T4e's tests).

- [ ] **Step 5: Commit the CLI change**

```bash
git add engine/dump_workbook/cli.py engine/tests/test_dump_workbook.py
git commit -F - <<'EOF'
feat(facts): --manifest warns and skips an unresolved row instead of failing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
```

- [ ] **Step 6: Re-dump the estate (§8 step 2a) and assert `header_row` is unchanged on all 316 tabs**

From `code-repo`, keep the old dump first, then run both passes (the `--init-manifest` pass reconciles the manifest's wrong reference tabs; the `--manifest` pass then dumps `rows.tsv` for what survives plus the ids tabs):

```bash
DATA="$HOME/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
rm -rf /tmp/facts-dump-old && cp -r "$DATA/attachments/sheets/.dump" /tmp/facts-dump-old
DATA_ROOT="$DATA" .venv/bin/dump-workbook --init-manifest
DATA_ROOT="$DATA" .venv/bin/dump-workbook --manifest
```

Then the §7 assertion — `header_row` byte-identical on every estate tab, and the row labels where the spec says they are:

```bash
DATA="$HOME/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo" \
.venv/bin/python - <<'PY'
import json, os, pathlib
old = pathlib.Path("/tmp/facts-dump-old")
new = pathlib.Path(os.environ["DATA"], "attachments/sheets/.dump")
tabs = 0
for before_path in sorted(old.glob("*/sheets.json")):
    after_path = new / before_path.parent.name / "sheets.json"
    before = {s["sheetId"]: s["header_row"]
              for s in json.loads(before_path.read_text("utf-8"))["sheets"]}
    after = {s["sheetId"]: s["header_row"]
             for s in json.loads(after_path.read_text("utf-8"))["sheets"]}
    assert before.keys() == after.keys(), before_path.parent.name
    for sheet_id, row in before.items():
        tabs += 1
        assert after[sheet_id] == row, (before_path.parent.name, sheet_id,
                                        row, after[sheet_id])
print("header_row unchanged on", tabs, "tabs")          # 316

manifest = json.loads((new.parent / "manifest.json").read_text("utf-8"))
short = {w["short"]: w["spreadsheetId"] for w in manifest["workbooks"]}


def tab(name, sheet):
    doc = json.loads((new / short[name] / "sheets.json").read_text("utf-8"))
    return next(s for s in doc["sheets"] if s["name"] == sheet)


for book in ("gozaresh_markazi", "gozaresh_naharkhoran"):
    for sheet, first, last in (("پیتزا", 6, 15), ("فرنگی", 6, 14),
                               ("سوخاری", 6, 11), ("کانتر", 6, 10)):
        labels = tab(book, sheet).get("row_labels") or {}
        assert sorted(int(r) for r in labels) == list(range(first, last + 1)), \
            (book, sheet, sorted(labels))
for book, sheet in (("pitza", "موجودی اول شب"), ("amar_kanter", "موجودی آخر شب"),
                    ("hesabdari", "نیازمندیها و مشکلات"),
                    ("gozaresh_markazi", "Table_SalesData_SinglePizza"),
                    ("gozaresh_markazi", "Table_Ingredients_AmericanPizza"),
                    ("gozaresh_markazi", "SheetsFileIDs")):
    assert "row_labels" not in tab(book, sheet), (book, sheet)
print("row labels on the four report tabs of both books, and nowhere else asked")

for name in ("gozareshat", "salon_chalebagh", "control_gozareshat"):
    row = next(w for w in manifest["workbooks"] if w["short"] == name)
    assert not any(t.lower().startswith("sheetsfileid")
                   or t.startswith("Table_Ingredients_") for t in row["reference_tabs"])
    assert row["confirmed"] is True and row["unresolved"] == []
assert not any(t in ("مواد حساس", "مواد عادی") for t in
               next(w for w in manifest["workbooks"]
                    if w["short"] == "control_gozareshat")["reference_tabs"])
print("reference tabs reconciled, every row still confirmed")
PY
```

Expected: `header_row unchanged on 316 tabs`, then both other lines. Any assertion that trips is a bug in T4a–T4d, not a licence to edit the estate — fix the code and re-run from the `cp` line.

- [ ] **Step 7: Commit the re-dump in data-repo**

```bash
DATA="$HOME/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
git -C "$DATA" add attachments/sheets/.dump attachments/sheets/manifest.json
git -C "$DATA" commit -F - <<'EOF'
feat(facts): re-dump the estate under dump-workbook v3

Row labels on the report tabs, the ids tabs' rows, the head trimmed to the
header row plus four, and the manifest's wrong reference tabs reconciled.
header_row is unchanged on all 316 tabs.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
```

### Task 5: The precondition module, the in-memory apply, and the used-run guard

**Files:**
- Create: `engine/merge_facts/preconditions.py`
- Modify: `engine/merge_facts/apply.py:32-52` (imports), `:54-60` + `:99-107` + `:179-408` (the block that moves out), `:64-92` (`apply`), `:518-546` (`_plan`), `:692-702` (`_store_original`, deleted), `:773-805` (`_finalise`, split)
- Modify: `engine/merge_facts/content.py` (append `group_messages` at the end of the file, after line 554 — appending keeps every other line number in this file stable for Task 6)
- Modify: `engine/validate/cli.py:1-45`
- Test: `engine/tests/test_merge_facts_apply.py` (append)

**Interfaces:**
- Consumes: `merge_facts.load_store/save_store/find_match/canonical_scope/derive_status/is_open/iter_ref_objects/collect_leaves/_sheet_identity/KIND_ORDER/KIND_FILES/KEY_RE/SEGMENT_RE/PROC_ID_RE`; `merge_facts.content.check_document`; `merge_facts.ladder.merge_entry/would_dispute/UNION_FIELDS/TOP_SKIP/_is_keyed_list/keyfn_for/with_account_id`; `allocate_id.next_fact_id`, `allocate_id.peek_fact_id`; `engine_common.read_json/validate/write_json_atomic/write_text_atomic/data_root`; test helpers `facts_helpers._root/_run_dir/_const_delta/_seed_units/_write` (Task-map contract).
- Produces:
  - `merge_facts.preconditions.preconditions(root, store, entries, run_dir) -> list[str]`
  - `merge_facts.apply.simulate(root, delta_path, run_dir, now="2026-01-01T00:00:00Z") -> tuple[dict, list[str]]`
  - `merge_facts.apply.used(run_dir) -> bool`
  - `merge_facts.apply._MemoryMinter(root)` with `__call__() -> "F-00487"`
  - `merge_facts.apply._plan(root, store, entries, minter) -> tuple[list, dict, dict]`
  - `merge_facts.apply._stamp(root, store, touched, now) -> None`
  - `merge_facts.apply._write(root, store, run_dir, delta_path, id_map, touched, adopted, originals) -> None`
  - `merge_facts.content.group_messages(messages) -> list[str]`
  - CLI `validate facts-delta <file> --store --run <run_dir>`

Read first, in this order: `engine/merge_facts/apply.py` **whole** (the move below is a cut of three exact spans of it), `engine/merge_facts/__init__.py:1-60` and `:239-245` (`load_store`/`save_store`/`find_match`), `engine/tests/facts_helpers.py` (every fixture the tests use), `engine/tests/test_merge_facts_apply.py:1-30` (import block and the byte-identity idiom), `engine/validate/cli.py`. Spec §4 rows `validate` and `merge facts apply`; postmortem P-37/E for why `used` exists (two applies into one run dir both exit 0 today and `id-map.json` keeps only the first call's map, so `revert` strands the second run's ids).

- [ ] **Step 1: Write the failing tests**

Append to `engine/tests/test_merge_facts_apply.py`, and extend its first import block to `from merge_facts.apply import apply, simulate, used` and add `from engine_common import read_json, validate` and `from validate.cli import main as validate_main`:

```python
# --- v3 §4: the precondition module, the in-memory apply, the used guard --- #

def test_simulate_leaves_the_store_and_the_id_ledger_byte_identical(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    ledger = root / "facts" / ".id-seq.json"
    before_ledger = ledger.read_bytes()
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    d = _write(root, "d1.json", _const_delta())
    store, problems = simulate(root, d, _run_dir(root, "20260901-101501"))
    assert problems == []
    assert ledger.read_bytes() == before_ledger        # minted in memory only
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before
    assert [e["id"] for e in store["rule"]["entries"]] == ["F-00002"]


def test_simulate_catches_a_store_schema_failure_the_delta_passes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    validate("facts-delta.schema.json", read_json(d))       # the delta is fine
    # `_upsert` leaves every creation with `updated_at: null`, which
    # `facts.schema.json` refuses — only `_stamp` turns it into a timestamp.
    # That is why the derived half was split off the writing half, and why
    # `--store --run` validates the STORE the delta would write, not the delta.
    _, problems = simulate(root, d, _run_dir(root, "20260901-101501"),
                           now="the ninth of Shahrivar")
    assert any("would write is invalid" in p for p in problems)
    store, problems = simulate(root, d, _run_dir(root, "20260901-101502"))
    assert problems == []
    assert store["rule"]["entries"][0]["updated_at"] == "2026-01-01T00:00:00Z"


def test_apply_refuses_a_second_delta_into_a_used_run_directory(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    apply(root, _write(root, "d1.json", _const_delta()), run)
    assert used(run)
    assert not used(_run_dir(root, "20260901-101502"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    with pytest.raises(SystemExit) as e:
        apply(root, _write(root, "d2.json", _const_delta(key="tol2")), run)
    assert e.value.code == 2
    assert "already" in capsys.readouterr().err
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after


def test_validate_store_run_groups_one_rule_into_one_line(tmp_path, capsys,
                                                          monkeypatch):
    root = _root(tmp_path); _seed_units(root)
    monkeypatch.setenv("DATA_ROOT", str(root))
    d = _const_delta()
    d["entries"][0]["scope"]["branches"] = ["tehran"]       # not in the manifest
    second = copy.deepcopy(d["entries"][0])
    second.update({"id": "T-2", "key": "tol2", "title": "تلورانس دوم"})
    d["entries"].append(second)
    path = _write(root, "dx.json", d)
    run = _run_dir(root, "20260901-101501")
    with pytest.raises(SystemExit) as e:
        validate_main(["facts-delta", str(path), "--store", "--run", str(run)])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert err.count("is not in attachments/sheets/manifest.json") == 1
    assert "2 entries: T-1, T-2" in err
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd code-repo && .venv/bin/pytest engine/tests/test_merge_facts_apply.py -q`
Expected: FAIL with `ImportError: cannot import name 'simulate' from 'merge_facts.apply'` (the whole module errors at collection).

- [ ] **Step 3: Create `engine/merge_facts/preconditions.py` — the verbatim move**

Cut three spans out of `engine/merge_facts/apply.py` **unchanged** and paste them, in this order, under the header below: `apply.py:54-60` (`FACT_ID_RE`, `TEMP_ID_RE`, `UNITS_KEY`, `UNKNOWN_UNIT`, the two-line `PACK_KEYS` comment, `PACK_KEYS`), then `apply.py:99-107` (`_lookup`), then `apply.py:179-408` (the `# 2. preconditions` banner through the last line of `_preconditions`). The only edit inside the moved text is the one `def` line: `def _preconditions(root, store, entries, run_dir):` becomes `def preconditions(root, store, entries, run_dir):`. Nothing in the moved text calls it, so there is no second occurrence to rename. The header:

```python
"""The precondition pass — every problem the whole delta must have none of,
found before the first byte is written (QF-2, spec §12 row 1).

Lifted out of `apply.py` unchanged (v3 §4) for one reason: `validate
facts-delta --store --run` runs the same pass over the same store shape and
must not import the writer to do it. `apply` imports from here and never the
other way round, so there is no cycle to manage.

The helpers came along because the pass is the only thing that needs them —
`_lookup`, `_is_stub`, `_declared_fields`, `_declared_rows` and the
`FACT_ID_RE`/`TEMP_ID_RE`/`UNITS_KEY`/`UNKNOWN_UNIT`/`PACK_KEYS` constants.
Four of those names are read off `merge_facts.apply` by `audit.py` and one by
`test_merge_facts_verbs.py`; `apply` imports them from here, which re-exports
them, so no caller changes.
"""
import pathlib
import re

from engine_common import read_json
from merge_facts import (KEY_RE, KIND_ORDER, PROC_ID_RE, _sheet_identity,
                         canonical_scope, collect_leaves, find_match, is_open,
                         iter_ref_objects)
from merge_facts.content import check_document
```

- [ ] **Step 4: Rewire `apply.py` — the minter, the split, `used`, `simulate`**

Replace the import block (`apply.py:32-61`) with:

```python
import copy
import pathlib
import shutil
import sys
from datetime import datetime, timezone
from functools import partial

from allocate_id import next_fact_id, peek_fact_id
from engine_common import (read_json, validate, write_json_atomic,
                           write_text_atomic)
# `KEY_RE` and `PROC_ID_RE` are unused here and imported anyway: `verbs.py`
# and `audit.py` read them off this module.
from merge_facts import (KEY_RE, KIND_FILES, KIND_ORDER, PROC_ID_RE,
                         SEGMENT_RE, canonical_scope, derive_status, facts_dir,
                         find_match, is_open, iter_ref_objects, load_store,
                         save_store, sha256_file)
# `_is_keyed_list` and `keyfn_for` are the ladder's own answers to "is this a
# list merged member by member, and what matches its members" — a successor's
# copy walks the same shapes, so they are borrowed rather than restated. The
# dispute question is the ladder's too: `would_dispute` runs it.
from merge_facts.ladder import (TOP_SKIP, UNION_FIELDS, _is_keyed_list,
                                keyfn_for, merge_entry, with_account_id,
                                would_dispute)
# The precondition pass and the helpers that moved with it (v3 §4). Imported,
# not re-declared — and re-exported by being imported.
from merge_facts.preconditions import (FACT_ID_RE, PACK_KEYS, TEMP_ID_RE,
                                       UNITS_KEY, UNKNOWN_UNIT,
                                       _declared_fields, _declared_rows,
                                       _is_stub, _lookup,
                                       _source_path_problems, preconditions)

SUCCESSION_SKIP = TOP_SKIP | frozenset({"supersedes", "superseded_by"})
```

Replace `apply()` (`apply.py:64-92`) with:

```python
def apply(root, delta_path, run_dir):
    """Apply one delta to the store. Returns `{created, updated, id_map}`."""
    root, delta_path, run_dir = (pathlib.Path(root), pathlib.Path(delta_path),
                                 pathlib.Path(run_dir))
    if used(run_dir):
        print(f"precondition failed: run directory {run_dir} has already "
              f"applied a delta — its id-map.json is the record of it",
              file=sys.stderr)
        raise SystemExit(2)
    delta = read_json(delta_path)
    validate("facts-delta.schema.json", delta)                       # 1
    # The ladder installs incoming subtrees by reference; every entry is copied
    # first so the delta file the run keeps stays exactly what its author wrote.
    entries = [copy.deepcopy(e) for e in delta.get("entries") or []]
    for e in entries:
        e["scope"] = canonical_scope(e.get("scope"))
    store = load_store(root)
    # The keys merge owns (9's step 5) are derived before the match, not after
    # it: a measurement matched on its delta's advisory key would miss its own
    # entry on the next run and mint a duplicate.
    _derive_keys(store, entries)
    problems = preconditions(root, store, entries, run_dir)          # 2
    if problems:
        for msg in problems:
            print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)
    # `partial`, not the bare `next_fact_id`: `_plan` calls its minter with no
    # arguments, and a bare `next_fact_id()` would resolve the root from
    # DATA_ROOT instead of the one this call was handed.
    plans, id_map, resolution = _plan(root, store, entries,
                                      partial(next_fact_id, root))   # 3
    _rewrite_refs(entries, resolution)                               # 4
    touched, adopted = _upsert(store, plans)                         # 6
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    _stamp(root, store, touched, now)                                # 7
    originals = [(root / t["original_ref"], t["original"]) for t in touched
                 if t.get("original_ref")]
    _write(root, store, run_dir, delta_path, id_map, touched, adopted,
           originals)                                                # 8-9
    return {"created": [t["id"] for t in touched if t["changed"] and t["created"]],
            "updated": [t["id"] for t in touched
                        if t["changed"] and not t["created"]],
            "id_map": id_map}


def used(run_dir):
    """§4: a run directory holding an `id-map.json` has already applied its
    delta, and `apply` refuses a second one.

    The postmortem reproduced what the absence of this cost: two applies into
    one run dir both exit 0, `id-map.json` keeps only the first call's map
    (`_write_once`) while `facts-delta.json` is overwritten by the second, so
    `revert` strands every id the second call minted. A retry AFTER a
    precondition failure is unaffected — nothing was written, so there is no
    `id-map.json`. `resolve`, `retire` and the repairs share their own run
    dirs and never come through `apply`.
    """
    return (pathlib.Path(run_dir) / "id-map.json").exists()


class _MemoryMinter:
    """`next_fact_id` with the ledger left alone. `validate --store --run`
    must leave `facts/.id-seq.json` byte-identical — it is a preview, not a
    run — so it mints from a counter seeded off the ledger through the public
    peek and never writes back."""

    def __init__(self, root):
        self._next = peek_fact_id(root)

    def __call__(self):
        fid = self._next
        self._next = f"F-{int(fid[2:]) + 1:05d}"
        return fid


def simulate(root, delta_path, run_dir, now="2026-01-01T00:00:00Z"):
    """The whole of `apply` on a copy of the store, writing nothing. Returns
    `(store_after, problems)`; `problems` is empty exactly when this delta may
    be applied.

    §4: a delta that reaches Gate B must be one `apply` cannot refuse, and the
    2026-09-02 run proved that validating the delta alone does not establish
    that — the store it would WRITE is what `apply` validates on the way out.
    So this runs the same pipeline over `copy.deepcopy(load_store(root))` with
    an in-memory minter, stamps the derived leaves, and validates the result
    against `facts.schema.json`.

    The delta's own schema is the caller's first step (`validate` runs it
    before this, `apply` runs it itself); this starts where both leave off.
    """
    root, delta_path = pathlib.Path(root), pathlib.Path(delta_path)
    delta = read_json(delta_path)
    entries = [copy.deepcopy(e) for e in delta.get("entries") or []]
    for e in entries:
        e["scope"] = canonical_scope(e.get("scope"))
    # `load_store` re-parses from disk, so the copy guards nothing today; it
    # states the guarantee rather than resting on that.
    store = copy.deepcopy(load_store(root))
    _derive_keys(store, entries)
    problems = preconditions(root, store, entries, run_dir)
    if problems:
        return store, problems
    plans, _id_map, resolution = _plan(root, store, entries,
                                       _MemoryMinter(root))
    _rewrite_refs(entries, resolution)
    touched, _adopted = _upsert(store, plans)
    _stamp(root, store, touched, now)
    for kind in KIND_ORDER:
        try:
            validate("facts.schema.json", store[kind])
        except ValueError as exc:
            problems.append(f"{kind}: the store this delta would write is "
                            f"invalid: {exc}")
    return store, problems
```

In `_plan` (`apply.py:518-546`) change the signature and the two mint sites, and nothing else:

```python
def _plan(root, store, entries, minter):
    """Decide each entry's target id before anything is merged. `id_map` holds
    only the ids this run mints — it is what `revert` reads to know what the run
    created, so an adoption, which hands over an existing id, is not in it;
    `resolution` additionally maps a temp id onto the entry it hit, so the
    second pass can rewrite refs to it.

    `minter` is the id source (§4): `apply` passes the ledger's, `simulate` an
    in-memory counter. `root` is kept in the signature because the plan reads
    as "for this store under this root"; nothing here uses it any more.
    """
```
— then `action, fid = "create", minter()` in place of `next_fact_id(root)`, and `action, fid = "supersede", minter()` in place of the second one.

Delete `_store_original` (`apply.py:692-702`) and replace `_finalise` (`apply.py:773-805`) with the two halves:

```python
def _stamp(root, store, touched, now):
    """The derived half of what used to be `_finalise`: `data.original_ref`,
    `status` and `updated_at` — and not one byte on disk.

    Split off (§4) so `validate facts-delta --store --run` can run the whole
    apply in memory and validate the store it WOULD write. These are exactly
    the leaves `facts.schema.json` requires: a store validated before this ran
    fails on every creation's null `updated_at` and proves nothing.

    A record whose verbatim body must move to `facts/originals/` gets its
    `original_ref` here and the path recorded on the touched record; `_write`
    puts the bytes there. `store` is the subject of the two lines above and is
    named for that; nothing here reads it.
    """
    for record in touched:
        entry = record["entry"]
        if record["original"] is not None:
            rel = f"facts/originals/{record['id']}.txt"
            path = root / rel
            if not ((entry.get("data") or {}).get("original_ref") == rel
                    and path.is_file()
                    and path.read_text(encoding="utf-8") == record["original"]):
                record["original_ref"] = rel     # `_write` writes the body
                record["changed"] = True
            entry.setdefault("data", {})["original_ref"] = rel
        # The stored status may never disagree with the derived one.
        entry["status"] = derive_status(entry)
        if record["changed"]:
            entry["updated_at"] = now


def _write(root, store, run_dir, delta_path, id_map, touched, adopted, originals):
    """The writing half: the originals `_stamp` named, the source stamps, the
    snapshot, the five files, and the run directory's own records. Nothing
    here derives anything — `_stamp` has run, and `validate --store --run`
    stops before this line is reached."""
    run_ref = _run_ref(root, run_dir)
    for path, body in originals:
        write_text_atomic(path, body)
    for record in touched:
        if record["changed"]:
            _stamp_sources(root, record["entry"], run_ref)
    _snapshot(root, run_dir)
    save_store(root, store)
    kept = run_dir / "facts-delta.json"
    # The pipeline's own delta is already written there (QF-7); a caller from
    # elsewhere — `edit-fact`, the ui-backend — hands us one to copy in.
    if not (kept.exists() and kept.samefile(delta_path)):
        shutil.copy2(delta_path, kept)
    _write_once(run_dir / "id-map.json", id_map)
    # QF-20, Task 7 review (I2): the ids this run adopted, recorded HERE, at
    # write time, rather than left for `revert` to infer later from store
    # comparison — a later run's own changes to an adopted record would have
    # made that inference wrong. Always written, `[]` when nothing was
    # adopted, so a MISSING file unambiguously means "a run that predates
    # this artifact" rather than "nothing adopted".
    _write_once(run_dir / "adopted.json", sorted(adopted))
```

Finally fix the three stale mentions of the old name: `apply.py:571` comment `re-derived in `_finalise`, always` → `` `_stamp` ``, and the two in `_upsert`'s docstring (`apply.py:636` and `:639`) → `` `_stamp` `` and `` `_write` ``.

- [ ] **Step 5: Add `group_messages` to `content.py`**

Append at the end of `engine/merge_facts/content.py` (after line 554, so no line above it moves):

```python
# --------------------------------------------------------------------------- #
# grouped output — one line per rule, never one per cell (§4)
# --------------------------------------------------------------------------- #

_QUOTED_RE = re.compile(r"'[^']*'")
GROUP_IDS_SHOWN = 5


def group_messages(messages):
    """One line per rule the document breaks, with the count and the ids —
    the shape §4 asks for, against the run that relayed 2,068 one-per-cell
    errors nobody could read.

    A message is `"<label>: <rule stated with its specifics quoted>"`, so two
    messages state the same rule exactly when their bodies differ only inside
    the quotes: the quoted spans fold to `…`, and the fold is the group key.
    Insertion order is kept, so the output is deterministic.
    """
    groups = {}
    for msg in messages:
        label, sep, body = msg.partition(": ")
        if not sep:
            label, body = "", msg
        groups.setdefault(_QUOTED_RE.sub("…", body), []).append(label)
    out = []
    for rule, labels in groups.items():
        shown = ", ".join(labels[:GROUP_IDS_SHOWN])
        tail = " …" if len(labels) > GROUP_IDS_SHOWN else ""
        out.append(f"{rule} — {len(labels)} entries: {shown}{tail}")
    return out
```

- [ ] **Step 6: Wire `--store --run` into the `validate` CLI**

Replace `engine/validate/cli.py` with:

```python
import argparse
import sys

from engine_common import data_root, read_json, schema_dir, validate
from merge_facts.apply import simulate
from merge_facts.content import check_document, group_messages

# spec §12's `validate facts` paragraph: "need no engine change beyond a
# content pass after the schema". The schema name (already normalised to its
# `.schema.json` form below) maps onto `check_document`'s `kind_of_file`.
CONTENT_PASS_SCHEMAS = {"facts.schema.json": "facts",
                        "facts-delta.schema.json": "facts-delta"}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="validate")
    ap.add_argument("schema", help="schema name, e.g. 'segments' or 'segments.schema.json'")
    ap.add_argument("file", help="path to the JSON file to validate")
    ap.add_argument("--store", action="store_true",
                    help="facts-delta only: apply it in memory and validate "
                         "the store it would write")
    ap.add_argument("--run", help="the run directory the delta would be "
                                  "applied into (required with --store)")
    args = ap.parse_args(argv)
    name = args.schema if args.schema.endswith(".schema.json") else f"{args.schema}.schema.json"
    if args.store and (name != "facts-delta.schema.json" or not args.run):
        print("validate: --store takes facts-delta and --run <run_dir>",
              file=sys.stderr)
        raise SystemExit(2)
    try:
        instance = read_json(args.file)
    except FileNotFoundError:
        print(f"validate: file not found: {args.file}", file=sys.stderr)
        raise SystemExit(2)
    try:
        validate(name, instance)  # loads schema_dir()/name; raises ValueError on mismatch
    except FileNotFoundError:
        print(f"validate: unknown schema '{name}' in {schema_dir()}", file=sys.stderr)
        raise SystemExit(2)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(2)
    kind_of_file = CONTENT_PASS_SCHEMAS.get(name)
    if kind_of_file:
        if args.store:
            # `simulate`'s own precondition pass runs `check_document` WITH the
            # store, which is strictly the better answer, so the standalone
            # pass is skipped rather than reported twice (§4).
            _store_after, findings = simulate(data_root(), args.file, args.run)
            findings = group_messages(findings)
        else:
            findings = check_document(instance, kind_of_file)
        if findings:
            for msg in findings:
                print(msg, file=sys.stderr)
            raise SystemExit(2)          # same failure surface as a schema mismatch
    print(f"OK: {args.file} conforms to {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd code-repo && .venv/bin/pytest engine/tests/test_merge_facts_apply.py engine/tests/test_merge_facts_audit.py engine/tests/test_merge_facts_verbs.py engine/tests/test_merge_facts_revert.py engine/tests/test_validate_facts_content.py engine/tests/test_merge_cli.py -q`
Expected: PASS — the four new tests, and every existing one in the five files that read `preconditions`' helpers off `merge_facts.apply` or drive `apply` end to end.

- [ ] **Step 8: Commit**

```bash
git add engine/merge_facts/preconditions.py engine/merge_facts/apply.py \
        engine/merge_facts/content.py engine/validate/cli.py \
        engine/tests/test_merge_facts_apply.py
git commit -m "$(cat <<'EOF'
feat(facts): preconditions module, in-memory apply, used-run guard

`_preconditions` moves to `merge_facts/preconditions.py` unchanged, with the
helpers only it uses; `apply` imports them back, so `audit.py` and the verbs
test keep reading them off `merge_facts.apply`. `_plan` takes its minter,
`_finalise` splits into `_stamp` (derived leaves, no disk) and `_write`, and
`simulate` runs the whole pipeline on a copy of the store and validates what
it would write — that is `validate facts-delta --store --run`, which leaves
`facts/.id-seq.json` byte-identical. `apply` refuses a run directory that
already holds an `id-map.json`.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 6: Content pass v3 — the prose lint, the constant shape, the record shape, param inputs

**Files:**
- Modify: `engine/merge_facts/content.py:50-83` (`check_document` — the new `unit_symbols` parameter and the new call), `:150-166` (`_check_expr`'s declaration block), `:405-414` (the reference-row completeness block), `:444-457` (the constant branch), and an append at the end of the file (the lint section, below Task 5's `group_messages`)
- Test: `engine/tests/test_validate_facts_content.py` (append; extend the import at line 16)

**Interfaces:**
- Consumes: `merge_facts.content.check_document`, `merge_facts.content.group_messages` (Task 5), `merge_facts.SEGMENT_RE/KEY_RE/is_open`, the test helpers `_doc`, `_rule`, `_record` already in `engine/tests/test_validate_facts_content.py:23-48`, and `facts_helpers._root/_run_dir/_const_delta/_seed_units/_write`.
- Produces:
  - `merge_facts.content.lint_prose(text, *, exemptions, allow_sheet_words=False) -> list[str]`
  - `merge_facts.content.check_document(doc, kind_of_file, store=None, unit_symbols=None) -> list[str]`
  - `merge_facts.content.REF_TOKEN`, `PIPELINE_WORDS`, `COLLOQUIAL` (Task 9's normaliser and Task 17's style card quote `REF_TOKEN` verbatim; Task 14 passes `unit_symbols` from `skeleton.json`)

Read first: `engine/merge_facts/content.py` **whole** (this task edits four of its numbered checks and adds a fifth section), `engine/tests/test_validate_facts_content.py:1-55` (the `_doc`/`_rule`/`_record` helpers and the `**extra` idiom every test below uses), spec §5.2 (the style card, including the worked pair) and §5.3, QF-50, and §4's `validate` row. The FEEL keyword set at `content.py:38-39` does not change.

- [ ] **Step 1: Write the failing tests**

Extend `engine/tests/test_validate_facts_content.py:16` to `from merge_facts.content import check_document, group_messages, lint_prose` and append:

```python
# --------------------------------------------------------------------------- #
# 13. the §5.2 prose lint
# --------------------------------------------------------------------------- #

def _constant(**extra):
    return _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                                                  "unit": "g", "value": 5}]},
                 **extra)


def test_a_statement_naming_a_cell_or_a_file_fails():
    msgs = check_document(_doc(_constant(
        statement="انحراف در J6 نوشته می‌شود و از Pitza.xlsx می‌آید.")),
        "facts-delta")
    assert any("statement" in m and "J6" in m for m in msgs)
    assert any(".xlsx" in m for m in msgs)


def test_a_title_naming_a_table_fails():
    msgs = check_document(_doc(_constant(title="تلورانس Table_BOM")),
                          "facts-delta")
    assert any("title" in m and "Table_" in m for m in msgs)


def test_a_pipeline_word_fails_but_a_word_that_contains_one_passes():
    msgs = check_document(_doc(_constant(
        statement="این مقدار در پاس دوم به دست آمد.")), "facts-delta")
    assert any("پاس" in m for m in msgs)
    assert check_document(_doc(_constant(
        statement="پرسش بی‌پاسخ در پنل تعیین تکلیف می‌شود.")),
        "facts-delta") == []


def test_the_sheet_words_belong_to_a_record_statement_and_a_field_description():
    record = _record(data={"fields": [
        {"key": "masraf", "title": "مصرف", "type": "number", "unit": "g",
         "description": "ستون مصرف اعلامی لاین."}]},
        title="مصرف اعلامی",
        statement="ستون مصرف اعلامی هر شب توسط سرپرست لاین پر می‌شود.")
    assert check_document(_doc(record), "facts-delta") == []
    assert any("ستون" in m and "title" in m for m in check_document(
        _doc(_record(title="ستون مصرف")), "facts-delta"))


def test_a_declared_unit_symbol_is_not_a_latin_leak():
    rule = _constant(statement="هر پرس ۶۰ gram است.")
    assert any("gram" in m for m in check_document(_doc(rule), "facts-delta"))
    assert check_document(_doc(rule), "facts-delta",
                          unit_symbols=["gram"]) == []


def test_a_spoken_ending_and_a_long_quotation_fail():
    assert any("می‌زنن" in m for m in check_document(
        _doc(_constant(statement="آشپزها معمولاً بیشتر می‌زنن.")),
        "facts-delta"))
    assert any("quot" in m for m in check_document(_doc(_constant(
        statement="«یک عدد قارچ حدود ده تا پانزده گرم وزن دارد گاهی»")),
        "facts-delta"))


def test_an_engine_written_issue_description_may_name_the_column():
    issue = {"kind": "column_shift", "affects": [], "engine": True,
             "description": "ستون K6 در نسخهٔ کپی‌شده جا افتاده است."}
    assert check_document(_doc(_constant(issues=[issue])), "facts-delta") == []
    unit_written = {k: v for k, v in issue.items() if k != "engine"}
    assert any("K6" in m for m in check_document(
        _doc(_constant(issues=[unit_written])), "facts-delta"))


def test_lint_prose_is_empty_for_a_definition_in_the_written_register():
    assert lint_prose("انحراف مصرف هر مادهٔ اولیه در پایان شب برابر است با "
                      "مصرف واقعی منهای مصرف اعلامی لاین.",
                      exemptions=()) == []


def test_group_messages_folds_one_rule_into_one_line():
    a = _constant(id_="T-1", key="tol", statement="انحراف برابر است با J6.")
    b = _constant(id_="T-2", key="tol2", statement="مصرف برابر است با K7.")
    lines = group_messages(check_document(_doc(a, b), "facts-delta"))
    assert len(lines) == 1
    assert lines[0].endswith("— 2 entries: T-1, T-2")


# --------------------------------------------------------------------------- #
# 7 (v3). a policy rule is `lang: text` with no inputs
# --------------------------------------------------------------------------- #

def test_a_policy_rule_with_no_inputs_and_lang_text_passes():
    rule = _rule(data={"inputs": [], "lang": "text",
                       "text": "شمارش آخر شب فقط پس از بستن خط انجام می‌شود.",
                       "outputs": [{"key": "hadd", "title": "حد", "unit": "g",
                                    "value": None}]})
    assert check_document(_doc(rule), "facts-delta") == []
    rule["data"]["lang"] = "feel"
    assert any("expr/lang" in m for m in
               check_document(_doc(rule), "facts-delta"))


# --------------------------------------------------------------------------- #
# 5 (v3). reference rows are checked only where the model typed them
# --------------------------------------------------------------------------- #

def test_a_sheet_records_reference_rows_are_not_checked_for_completeness():
    record = _record(role="reference", data={
        "instances": [{"key": "gozaresh__s1", "spreadsheetId": "S",
                       "sheetId": 1, "sheet": "پیتزا", "branch": "chalebagh",
                       "hidden": False}],
        "primaryKey": ["code"],
        "fields": [{"key": "code", "title": "کد", "type": "string"},
                   {"key": "grams", "title": "گرم", "type": "number",
                    "unit": "g"}],
        "rows": [{"key": "p1", "code": "p1"}]})
    assert check_document(_doc(record), "facts-delta") == []
    del record["data"]["instances"]
    assert any("grams" in m for m in
               check_document(_doc(record), "facts-delta"))


# --------------------------------------------------------------------------- #
# 1 (v3). a parameter input is an ordinary declared identifier
# --------------------------------------------------------------------------- #

def test_a_param_input_is_an_ordinary_declared_identifier():
    rule = _rule(data={"inputs": [
        {"key": "enheraf", "title": "انحراف", "unit": "g", "from": "operator"},
        {"key": "tolerance_gr", "title": "تلورانس", "unit": "g",
         "from": {"param": "tolerancePerFoodGr"}}],
        "outputs": [{"key": "enheraf_ba_tolerance", "title": "انحراف با تلورانس",
                     "unit": "g"}],
        "lang": "feel",
        "expr": "enheraf_ba_tolerance = enheraf - tolerance_gr"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_apply_refuses_a_statement_that_names_a_cell(tmp_path, capsys):
    root = _root(tmp_path)
    _seed_units(root)
    d = _const_delta()
    d["entries"][0]["statement"] = "حد مجاز در J6 نوشته شده است."
    with pytest.raises(SystemExit) as e:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
    assert e.value.code == 2
    assert "J6" in capsys.readouterr().err
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd code-repo && .venv/bin/pytest engine/tests/test_validate_facts_content.py -q`
Expected: FAIL with `ImportError: cannot import name 'lint_prose' from 'merge_facts.content'` (the module errors at collection).

- [ ] **Step 3: Add the lint section to `content.py`**

Append to `engine/merge_facts/content.py`, after Task 5's `group_messages`:

```python
# --------------------------------------------------------------------------- #
# 13. the style card (§5.2), mechanically — QF-50
# --------------------------------------------------------------------------- #

#: An A1 reference, with §2.3(d)'s guards: not preceded by an identifier
#: character and not followed by one or by `(`, so `MIN(`, `ROUND(` and every
#: other function name are left alone; optionally sheet-qualified and ranged.
#: The normaliser (`facts_plan.build`) and the agent's style card quote this
#: string verbatim, which is why it is a module constant and not inline.
REF_TOKEN = (r"(?:'[^']+'!)?(?<![A-Za-z0-9_$])\$?[A-Z]{1,3}\$?(?:N|\d{1,5})"
             r"(?![A-Za-z0-9_(])(?::\$?[A-Z]{1,3}\$?(?:N|\d{1,5}))?")
PIPELINE_WORDS = ("پاس", "اسکلت", "بخش از داده‌ها", "واحد کاری", "بچ",
                  "original", "bindings", "FEEL", "account", "expr")
COLLOQUIAL = ("می‌زنن", "می‌کنن", "داشته باشن", "بگیم", "می‌گیم")
#: Allowed only in a record's own `statement` and a field's `description`.
SHEET_WORDS = ("ستون", "تب", "سلول")
#: The Latin the register keeps: the two words the owner uses untranslated,
#: and `sheet`. Anything else Latin and four letters or longer is a leak.
LATIN_KEPT = frozenset({"csv", "excel", "sheet"})
QUOTE_WORDS = 8

REF_TOKEN_RE = re.compile(REF_TOKEN)
ARTEFACT_RE = re.compile(r"\.xlsx\b|\.gs\b|Table_|IMPORT_FROM_SHEET|\bLET\(|LAMBDA")
LATIN_WORD_RE = re.compile(r"[A-Za-z]{4,}")
QUOTED_SPAN_RE = re.compile(r"«([^»]*)»")


def _whole_word_re(words):
    """Persian gives `re` no `\\b` to work with, and these words are short:
    «تب» sits inside «مرتب», «پاس» inside «پاسخ» — which the owner's own
    report uses («بی‌پاسخ»). So a word counts only when no letter touches it
    on either side."""
    body = "|".join(re.escape(w) for w in words)
    return re.compile(rf"(?<![^\W\d_])(?:{body})(?![^\W\d_])")


PIPELINE_RE = _whole_word_re(PIPELINE_WORDS)
COLLOQUIAL_RE = _whole_word_re(COLLOQUIAL)
SHEET_WORDS_RE = _whole_word_re(SHEET_WORDS)


def lint_prose(text, *, exemptions, allow_sheet_words=False):
    """§5.2's style card as a check: the messages a sentence earns, empty when
    it may be stored. One message per rule broken, not one per occurrence.

    QF-50's reason for existing: `title` and `statement` are definitions, and
    a definition that says «ستون J تب پیتزا» is a locator wearing a
    definition's clothes — it stops being true the day the column moves. The
    locator already has a home (`source[]`) and so does the quotation
    (`source[].quote`); what is left is the meaning, which is the field.

    `exemptions` is the run's unit symbols (`skeleton.json`'s
    `unit_symbols[]`) — a symbol the units record declares is vocabulary, not
    a Latin leak. `allow_sheet_words` is QF-50's one exception: «ستون», «تب»
    and «سلول» belong in a record's own `statement` and in a field's
    `description`, which describe a table to someone who will open it.
    """
    if not isinstance(text, str) or not text:
        return []
    out = []
    hit = REF_TOKEN_RE.search(text)
    if hit:
        out.append(f"names cell or range {hit.group()!r} — a locator belongs "
                   f"in source[], not in prose (QF-50)")
    hit = ARTEFACT_RE.search(text)
    if hit:
        out.append(f"names {hit.group()!r} — a file, table or formula name "
                   f"belongs in source[], not in prose (QF-50)")
    hit = PIPELINE_RE.search(text)
    if hit:
        out.append(f"uses the pipeline's own word {hit.group()!r}, which "
                   f"names nothing in the restaurant")
    hit = COLLOQUIAL_RE.search(text)
    if hit:
        out.append(f"uses the spoken ending {hit.group()!r}, not the register "
                   f"of a written procedure")
    if not allow_sheet_words:
        hit = SHEET_WORDS_RE.search(text)
        if hit:
            out.append(f"uses {hit.group()!r}, which belongs only to a "
                       f"record's own statement and a field's description "
                       f"(QF-50)")
    kept = LATIN_KEPT | {str(s).lower() for s in exemptions or ()}
    for hit in LATIN_WORD_RE.finditer(text):
        if hit.group().lower() not in kept:
            out.append(f"carries the Latin word {hit.group()!r}")
            break
    for hit in QUOTED_SPAN_RE.finditer(text):
        words = len(hit.group(1).split())
        if words > QUOTE_WORDS:
            out.append(f"quotes {words} words — a quotation belongs in "
                       f"source[].quote, not in a definition")
            break
    return out


def _check_prose(entry, unit_symbols, messages, label):
    """The lint at the field that carries the sentence, so the unit that wrote
    a failing one is the unit told to fix it (QF-50). The targets are §5.2's
    list; an `issues[].description` the ENGINE templated is exempt, because it
    must name the columns that went missing — that is the whole finding."""
    is_record = entry.get("kind") == "record"
    targets = [("title", entry.get("title"), False),
               ("statement", entry.get("statement"), is_record)]
    for i, alias in enumerate(entry.get("aliases") or []):
        targets.append((f"aliases/{i}", alias, False))
    data = entry.get("data") or {}
    for name in ("grain", "method", "exceptions"):
        targets.append((f"data/{name}", data.get(name), False))
    for field in data.get("fields") or []:
        if isinstance(field, dict):
            targets.append((f"data/fields/{field.get('key')}/description",
                            field.get("description"), True))
    for i, tracked in enumerate(data.get("tracked") or []):
        if isinstance(tracked, dict):
            targets.append((f"data/tracked/{i}/reason", tracked.get("reason"),
                            False))
    for i, issue in enumerate(entry.get("issues") or []):
        if isinstance(issue, dict) and not issue.get("engine"):
            targets.append((f"issues/{i}/description", issue.get("description"),
                            False))
    for path, text, allow_sheet_words in targets:
        for msg in lint_prose(text, exemptions=unit_symbols or (),
                              allow_sheet_words=allow_sheet_words):
            messages.append(f"{label}: {path} {msg}")
```

- [ ] **Step 4: Wire the lint in and fix the three v3 checks**

In `check_document` (`content.py:50-83`) take the new parameter, document it, and call the new check — the signature line and the two added lines:

```python
def check_document(doc, kind_of_file, store=None, unit_symbols=None):
```
and, in the docstring, after the `store` paragraph:
```
    `unit_symbols`, when given, is the run's declared unit symbols
    (`skeleton.json`'s `unit_symbols[]`), exempted from the §5.2 lint's Latin
    rule — every other caller passes none and gets the bare rule.
```
and inside the entry loop, after `_check_process_links(entry, messages, label)`:
```python
        _check_prose(entry, unit_symbols, messages, label)
```

In `_check_expr` (`content.py:160-161`), leave the code and add the sentence that says why a parameter needs no branch:

```python
    # An input whose `from` is `{"param": "<applies_to params key>"}` (§2.5's
    # tolerance bindings) is declared exactly like any other: the identifier
    # the expression reads is its `key`, and where the value comes from is
    # `applies_to[]`'s business, not the tokeniser's.
    inputs_by_key = {i["key"]: i for i in data.get("inputs") or []
                     if isinstance(i, dict) and i.get("key")}
```

In `_check_record_shape` (`content.py:405`), replace the reference-row guard:

```python
    # v3 §4: only a record the model typed — a paper form, an external system,
    # the native `units` table. A sheet-derived record's rows ARE the dump's,
    # and `build` omits a cell the dump left empty (§2.3), so a missing member
    # is a blank in the sheet, not an unanswered question. `instances[]` is
    # what says the rows came off a dump.
    if data.get("role") == "reference" and not data.get("instances"):
```

In `_check_constant_shape` (`content.py:450-453`), replace the condition:

```python
    if inputs == []:
        # v3 §5.3: a policy with no formula is `lang: text` and no inputs — a
        # rule, not a malformed constant. Only a computed shape contradicts
        # "no inputs": an `expr`, or a `lang` that declares one.
        if data.get("expr") is not None or data.get("lang") in ("feel", "table"):
            messages.append(f"{label}: a constant (no inputs) carries "
                            f"expr/lang")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd code-repo && .venv/bin/pytest engine/tests/test_validate_facts_content.py engine/tests/test_merge_facts_apply.py engine/tests/test_merge_facts_verbs.py engine/tests/test_merge_facts_audit.py -q`
Expected: PASS — the new tests, the twelve existing numbered checks, and every fixture delta that now goes through the lint on its way into `apply`.

- [ ] **Step 6: Commit**

```bash
git add engine/merge_facts/content.py engine/tests/test_validate_facts_content.py
git commit -m "$(cat <<'EOF'
feat(facts): the §5.2 prose lint, and three v3 corrections to the content pass

`lint_prose` refuses a locator, a file or table name, the pipeline's own
vocabulary, a Latin word the units record has not declared, a quotation and a
spoken ending in `title`, `statement`, `aliases[]` and the payload's prose
leaves — «ستون»/«تب»/«سلول» stay legal in a record's own statement and a
field's description, and an engine-templated issue is exempt. A constant now
contradicts "no inputs" only with an `expr` or a computed `lang`, so a policy
rule (`lang: text`) passes; reference-row completeness applies only to a
record with no `instances[]`, because a sheet-derived record's blanks are the
dump's; and a `{"param"}` input is an ordinary declared identifier.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

### Task 7: Ladder and `apply` v3 — derived `location`, identity over instances, the used marker

**Files:**
- Modify: `engine/merge_facts/ladder.py:1-7` (docstring + `PROSE_LEAVES` block) and `engine/merge_facts/ladder.py:147-173` (`_merge_member`)
- Modify: `engine/merge_facts/__init__.py:37-60` (`is_open`, `_sheet_identity`, `find_match`)
- Modify: `engine/merge_facts/apply.py:32-61` (imports and constants), `engine/merge_facts/apply.py:63-92` (`apply`), `engine/merge_facts/apply.py:333-406` (`_preconditions`), `engine/merge_facts/apply.py:416-429` (`_is_supersession`), `engine/merge_facts/apply.py:634-684` (`_upsert`)
- Modify: `engine/merge_facts/verbs.py:39-66` (imports) and `engine/merge_facts/verbs.py:100-106` (`_now`/`_today_jalali`)
- Modify: `engine/tests/facts_helpers.py:20-24` (the manifest fixture gains the second branch)
- Modify: `engine/tests/test_merge_facts_core.py:105-120` (`find_match` no longer matches a renamed tab)
- Test: `engine/tests/test_merge_facts_apply.py` (append), `engine/tests/test_merge_facts_ladder.py` (append)

**Read for context first:** `engine/merge_facts/apply.py` end to end (its docstring carries the run-directory contract), `engine/merge_facts/ladder.py`, `engine/merge_facts/__init__.py`, `engine/tests/facts_helpers.py`, and spec §3.1, §3.2 and the `merge facts apply` / `merge facts ladder` rows of §4.

**Interfaces:**
- Consumes: `merge_facts.canonical_scope`, `merge_facts.is_open`, `merge_facts.load_store`, `merge_facts.ladder.merge_entry`, `merge_facts.ladder.would_dispute`, `merge_facts.content.check_document` (T6), the v2 schemas (T2), `facts_helpers._root/_run_dir/_write/_seed_units/_const_delta`.
- Produces: `merge_facts.ladder.DERIVED = frozenset({"location"})`; `merge_facts._sheet_identities(entry) -> list[tuple[str, str]]` (replaces `_sheet_identity`); `find_match(store, entry)` matching on any instance identity, `None` when the instance match's natural key disagrees; `merge_facts.apply.used(run_dir) -> bool`; `merge_facts.apply._today_jalali() -> str`; `merge_facts.apply._recompute_location(entry) -> bool`; `apply(root, delta_path, run_dir)` unchanged in signature, exiting 2 when `used(run_dir)`.

- [ ] **Step 1: Write the failing test**

Append to `engine/tests/test_merge_facts_ladder.py`:

```python
# --- v3: `location` is a derived pointer, not a reading (§4 ladder row) ----- #

def test_location_is_skipped_by_leaf_name_at_any_depth_and_never_disputed():
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "report",
                 "location": {"spreadsheetId": "P1", "sheetId": 11,
                              "sheet": "پیتزا", "hidden": False},
                 "instances": [{"key": "pz__s11", "spreadsheetId": "P1",
                                "sheetId": 11, "sheet": "پیتزا",
                                "branch": "chalebagh", "hidden": False}]}
    inc = copy.deepcopy(e)
    inc["data"]["location"] = {"spreadsheetId": "P2", "sheetId": 12,
                               "sheet": "پیتزا", "hidden": False}
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["location"]["spreadsheetId"] == "P1"   # untouched
    assert e.get("accounts", []) == []                      # never disputed
    assert not any(path.startswith("data/location") for path, _ in changes)


def test_a_derived_leaf_is_skipped_but_its_siblings_still_merge():
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "report", "location": {},
                 "instances": [{"key": "pz__s11", "spreadsheetId": "P1",
                                "sheetId": 11, "sheet": "پیتزا",
                                "branch": "chalebagh", "hidden": False}]}
    inc = copy.deepcopy(e)
    inc["data"]["location"] = {"spreadsheetId": "P2"}
    inc["data"]["instances"].append({"key": "pz__s12", "spreadsheetId": "P2",
                                     "sheetId": 12, "sheet": "پیتزا",
                                     "branch": "naharkhoran", "hidden": False})
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["location"] == {}                       # still derived-only
    assert ("data/instances/pz__s12", "append") in changes
```

Replace `engine/tests/test_merge_facts_core.py:105-120` with:

```python
def test_find_match_matches_any_instance_and_refuses_a_renamed_one():
    store = {k: {"schema_version": 1, "entries": []} for k in KIND_ORDER}
    a = _entry(kind="record", key="gozaresh_pitza",
               data={"medium": "sheet", "role": "report",
                     "location": {"spreadsheetId": "P1", "sheet": "پیتزا"},
                     "instances": [
                         {"key": "pz__s11", "spreadsheetId": "P1",
                          "sheetId": 11, "sheet": "پیتزا"},
                         {"key": "pz__s12", "spreadsheetId": "P2",
                          "sheetId": 12, "sheet": "پیتزا"}]})
    store["record"]["entries"].append(a)
    second = _entry(kind="record", key="gozaresh_pitza",
                    data={"medium": "sheet", "role": "report",
                          "location": {"spreadsheetId": "P2", "sheet": "پیتزا"},
                          "instances": [{"key": "pz__s12", "spreadsheetId": "P2",
                                         "sheetId": 12, "sheet": "پیتزا"}]})
    assert find_match(store, second) is a       # matched on the second instance
    renamed = _entry(kind="record", key="gozaresh_shabane_pitza",
                     data={"medium": "sheet", "role": "report",
                           "location": {"spreadsheetId": "P2", "sheet": "پیتزا"},
                           "instances": [{"key": "pz__s12", "spreadsheetId": "P2",
                                          "sheetId": 12, "sheet": "پیتزا"}]})
    assert find_match(store, renamed) is None   # §3.2: not a match, never a rename
    b = _entry(kind="rule", key="k1")
    store["rule"]["entries"].append(b)
    assert find_match(store, _entry(kind="rule", key="k1")) is b
    closed = _entry(kind="rule", key="k2", valid_to="1404-01-01")
    store["rule"]["entries"].append(closed)
    assert find_match(store, _entry(kind="rule", key="k2")) is None   # only open
    superseded = _entry(kind="rule", key="k3", superseded_by={"ref": "F-00099"})
    store["rule"]["entries"].append(superseded)
    assert find_match(store, _entry(kind="rule", key="k3")) is None   # §4: closed
```

Change `engine/tests/facts_helpers.py:20-24` so the manifest registers both branches:

```python
    (tmp_path / "attachments" / "sheets").mkdir(parents=True)
    (tmp_path / "attachments" / "sheets" / "manifest.json").write_text(json.dumps(
        {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"},
                      {"code": "naharkhoran", "name": "ناهارخوران"}],
         "workbooks": []}), encoding="utf-8")
```

Append to `engine/tests/test_merge_facts_apply.py`:

```python
# --- v3: record templates, instance identity, the used marker -------------- #

_TABS = {"pz__s10": ("P0", 10, "chalebagh"), "pz__s11": ("P1", 11, "chalebagh"),
         "pz__s12": ("P2", 12, "naharkhoran")}


def _template_delta(key="gozaresh_shabane_pitza", instances=("pz__s11", "pz__s12"),
                    branches=("chalebagh", "naharkhoran"), location="pz__s12"):
    """A v3 record template (QF-47): one entry, one `instances[]` member per tab
    it repeats on. `location` is still required by the delta schema, and is
    written here as the WRONG instance on purpose — `apply` recomputes it."""
    members = [{"key": k, "spreadsheetId": _TABS[k][0], "sheetId": _TABS[k][1],
                "sheet": "پیتزا", "branch": _TABS[k][2], "hidden": False}
               for k in instances]
    pointed = _TABS[location]
    return {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "record", "key": key,
        "title": "گزارش شبانهٔ پیتزا",
        "statement": "گزارش هر شب لاین پیتزا را ثبت می‌کند.",
        "scope": {"departments": ["cooking"], "branches": list(branches)},
        "source": [{"type": "sheet", "ref": "attachments/sheets/G/G.xlsx",
                    "sheet": "پیتزا"}],
        "retired": False,
        "data": {"medium": "sheet", "role": "report",
                 "location": {"spreadsheetId": pointed[0], "sheetId": pointed[1],
                              "sheet": "پیتزا", "hidden": False},
                 "instances": members,
                 "fields": [{"key": "masraf_elami", "title": "مصرف اعلامی",
                             "type": "number", "unit": "g",
                             "columns": {k: "H" for k in instances}}]}}]}


def _record(root, key="gozaresh_shabane_pitza"):
    return [e for e in load_store(root)["record"]["entries"] if e["key"] == key][0]


def test_a_template_scoped_to_both_branches_applies_and_location_is_derived(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _template_delta()), _run_dir(root, "1"))
    rec = _record(root)
    assert rec["scope"]["branches"] == ["chalebagh", "naharkhoran"]
    assert [i["key"] for i in rec["data"]["instances"]] == ["pz__s11", "pz__s12"]
    # the first instance in ascending key order, not the delta's own pointer
    assert rec["data"]["location"] == {"spreadsheetId": "P1", "sheetId": 11,
                                       "sheet": "پیتزا", "hidden": False}


def test_a_second_run_over_another_instance_extends_and_raises_no_account(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _template_delta()), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json",
                       _template_delta(instances=("pz__s10", "pz__s11"),
                                       location="pz__s10")),
          _run_dir(root, "2"))
    rec = _record(root)
    assert len(load_store(root)["record"]["entries"]) == 2      # units + it
    assert [i["key"] for i in rec["data"]["instances"]] == \
        ["pz__s11", "pz__s12", "pz__s10"]
    assert rec["data"]["location"]["spreadsheetId"] == "P0"     # recomputed
    assert rec.get("accounts", []) == []                        # §4: no dispute
    assert rec["status"] == "confirmed"


def test_an_instance_match_under_another_key_is_refused_nothing_written(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _template_delta()), _run_dir(root, "1"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    try:
        apply(root, _write(root, "d2.json", _template_delta(key="gozaresh_pitza")),
              _run_dir(root, "2"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


def test_a_second_apply_into_a_used_run_directory_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260906-101500")
    d = _write(root, "d1.json", _const_delta())
    apply(root, d, run)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    with pytest.raises(SystemExit) as exc:
        apply(root, d, run)
    assert exc.value.code == 2
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


def _note_delta(key, title):
    return {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "note", "key": key, "title": title,
        "statement": "واحد این ستون در جدول واحدها نیامده است.",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                    "lines": "7"}],
        "retired": False,
        "data": {"about": [{"ref": "F-00001"}],
                 "question": "واحد این ستون چیست؟"}}]}


def test_the_title_twin_guard_covers_notes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "n1.json", _note_delta("note_aa11bb22cc33", "واحد نامعلوم")),
          _run_dir(root, "1"))
    with pytest.raises(SystemExit) as exc:
        apply(root, _write(root, "n2.json",
                           _note_delta("note_aa11bb22cc34", "واحد نامعلوم")),
              _run_dir(root, "2"))
    assert exc.value.code == 2


def test_a_supersession_with_no_valid_from_closes_with_the_run_date(tmp_path):
    import jdatetime
    root = _root(tmp_path); _seed_units(root)
    first = apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    old_id = first["id_map"]["T-1"]
    d = _const_delta(4)
    d["entries"][0]["supersedes"] = {"ref": old_id}      # no valid_from at all
    apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    rules = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"]
    old = [r for r in rules if r["id"] == old_id][0]
    new = [r for r in rules if r["id"] != old_id][0]
    assert old["valid_to"] == jdatetime.date.today().strftime("%Y-%m-%d")
    assert old["superseded_by"]["ref"] == new["id"]
    assert not is_open(old) and is_open(new)
    assert new["data"]["outputs"][0]["value"] == 4


def test_is_open_is_false_once_superseded_by_is_set():
    assert is_open({"retired": False, "valid_to": None})
    assert not is_open({"retired": False, "valid_to": None,
                        "superseded_by": {"ref": "F-00009"}})


def _bound_rule_delta():
    """A v3 rule: `applies_to[]` bindings the engine wrote, one parameter that
    is a column reference, and an input reading that parameter (§2.5)."""
    return {"schema_version": 1, "entries": [{
        "id": "T-2", "kind": "rule", "key": "enheraf_ba_tolerance",
        "title": "انحراف با تلورانس",
        "statement": "انحراف مصرف پس از کسر تلورانس هر پرس محاسبه می‌شود.",
        "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
        "source": [{"type": "sheet", "ref": "attachments/sheets/G/G.xlsx",
                    "sheet": "پیتزا", "cell": "L6"}],
        "retired": False,
        "data": {"inputs": [
                     {"key": "enheraf", "title": "انحراف", "unit": "g",
                      "from": {"ref": "T-1", "field": "masraf_elami"}},
                     {"key": "tolerance_gr", "title": "تلورانس", "unit": "g",
                      "from": {"param": "tolerancePerFoodGr"}}],
                 "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                              "nature": "observed"}],
                 "lang": "feel", "expr": "v = enheraf - tolerance_gr",
                 "applies_to": [
                     {"key": "pz__s11__l__r6", "record": {"ref": "T-1",
                                                          "field": "masraf_elami"},
                      "variant": 1, "range": "L6:L15",
                      "params": {"tolerancePerFoodGr": 5,
                                 "ref_1": {"ref": "T-1", "field": "masraf_elami"}},
                      "rows": [{"key": "r6", "row": 6, "label": "پنیر پیتزا",
                                "item": "##1"}]}]}}]}


def test_apply_accepts_the_v3_rule_members_and_checks_their_field_refs(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _template_delta(instances=("pz__s11",), branches=("chalebagh",),
                        location="pz__s11")
    d["entries"].append(_bound_rule_delta()["entries"][0])
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    rule = [e for e in load_store(root)["rule"]["entries"]
            if e["key"] == "enheraf_ba_tolerance"][0]
    record_id = _record(root)["id"]
    binding = rule["data"]["applies_to"][0]
    assert binding["record"]["ref"] == record_id                  # temp id rewritten
    assert binding["params"]["ref_1"]["ref"] == record_id         # inside params too
    assert binding["params"]["tolerancePerFoodGr"] == 5
    assert rule["data"]["inputs"][1]["from"] == {"param": "tolerancePerFoodGr"}

    bad = _template_delta(instances=("pz__s11",), branches=("chalebagh",),
                          location="pz__s11")
    rule_entry = _bound_rule_delta()["entries"][0]
    rule_entry["data"]["applies_to"][0]["params"]["ref_1"]["field"] = "nadarad"
    bad["entries"].append(rule_entry)
    with pytest.raises(SystemExit) as exc:
        apply(root, _write(root, "d2.json", bad), _run_dir(root, "2"))
    assert exc.value.code == 2
```

Add the two imports the appended tests need at the top of `engine/tests/test_merge_facts_apply.py` (line 6): `from merge_facts import account_id, is_open, load_store`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest engine/tests/test_merge_facts_ladder.py engine/tests/test_merge_facts_core.py engine/tests/test_merge_facts_apply.py -q`
Expected: FAIL — `test_location_is_skipped_by_leaf_name_at_any_depth_and_never_disputed` with `assert e["data"]["location"]["spreadsheetId"] == "P1"` (the ladder disputes it today), `test_find_match_matches_any_instance_and_refuses_a_renamed_one` with `AssertionError` on `find_match(store, second) is a`, and `ImportError: cannot import name 'is_open'`-free but failing `test_a_template_scoped_to_both_branches_applies_and_location_is_derived` on `location == {"spreadsheetId": "P1", …}`.

- [ ] **Step 3: The ladder skips a derived leaf**

In `engine/merge_facts/ladder.py`, add the constant beside `PROSE_LEAVES` (after line 7):

```python
PROSE_LEAVES = frozenset({"statement", "grain", "method", "exceptions",
                          "reason", "why", "description"})
# §4: `location` is a derived pointer, not a reading — `apply` recomputes it
# from `instances[]` after every merge. Matched by LEAF NAME at any depth, the
# way PROSE_LEAVES is, and deliberately NOT through TOP_SKIP: that set only
# sees an entry's top-level fields and would never reach `data/location`, so a
# second run over a second instance would dispute `data/location/spreadsheetId`
# — a question about which tab is "the" tab, which nobody asked and nobody can
# answer.
DERIVED = frozenset({"location"})
```

and in `_merge_member` (line 157, immediately after the `skip` check):

```python
    for k, v in incoming.items():
        if k in skip:
            continue
        p = _join(path, k)
        if k in DERIVED:
            continue                                   # recomputed, never merged
        if k in PROSE_LEAVES:
```

- [ ] **Step 4: Identity over every instance**

In `engine/merge_facts/__init__.py`, replace lines 37-60 with:

```python
def is_open(entry):
    """Open = not retired, not closed by a `valid_to`, and not superseded.

    `superseded_by` is read here (§4) because a supersession that carried no
    `valid_from` used to leave `valid_to` null: the predecessor stayed open,
    `find_match` kept matching it, and one key had two live eras.
    """
    return (not entry.get("retired", False) and entry.get("valid_to") is None
            and not entry.get("superseded_by"))

def _sheet_identities(entry):
    """Every (spreadsheetId, sheet) this record occupies — one per `instances[]`
    member (QF-47: one template, one entry, however many tabs it repeats on),
    plus `location` for a record that has no instances (a paper log, a stub, or
    an entry written before v3)."""
    if entry.get("kind") != "record":
        return []
    data = entry.get("data") or {}
    out = []
    for instance in data.get("instances") or []:
        if isinstance(instance, dict) and instance.get("spreadsheetId") \
                and instance.get("sheet"):
            out.append((instance["spreadsheetId"], instance["sheet"]))
    location = data.get("location") or {}
    if location.get("spreadsheetId") and location.get("sheet"):
        out.append((location["spreadsheetId"], location["sheet"]))
    return out

def _nk(entry):
    return (entry["key"], json.dumps(canonical_scope(entry.get("scope")),
                                     sort_keys=True))

def find_match(store, entry):
    """Sheet records match on ANY instance identity first (QF-47), then the
    natural key (kind, key, canonical scope) among open entries.

    §3.2: an instance match whose natural key disagrees is **not** a match —
    `apply` never renames, and `digest` has already reported the pair to the
    reviewer as `template_split`. `apply`'s own precondition then refuses the
    delta rather than minting a second record on one tab. The one exception is
    a stub (QF-20): it is identity and nothing else, and the owning run fills
    it whatever key it carries.
    """
    kind = entry["kind"]
    idents = set(_sheet_identities(entry))
    nk = _nk(entry)
    if idents:
        for e in store[kind]["entries"]:
            if is_open(e) and idents & set(_sheet_identities(e)):
                return e if (_nk(e) == nk or (e.get("data") or {}).get("stub")) \
                    else None
    for e in store[kind]["entries"]:
        if is_open(e) and _nk(e) == nk:
            return e
    return None
```

- [ ] **Step 5: `apply` — the used marker, the run date, the store-wide identity guard**

In `engine/merge_facts/apply.py`, change the import block (lines 40-44) to take `_sheet_identities` instead of `_sheet_identity`, and add `jdatetime` beside the other module-level imports (line 37):

```python
import jdatetime
from allocate_id import next_fact_id
from engine_common import read_json, validate, write_json_atomic, write_text_atomic
from merge_facts import (KEY_RE, KIND_FILES, KIND_ORDER, PROC_ID_RE, SEGMENT_RE,
                         _sheet_identities, canonical_scope, collect_leaves,
                         derive_status, facts_dir, find_match, is_open,
                         iter_ref_objects, load_store, save_store, sha256_file)
```

Add beside `SUCCESSION_SKIP` (after line 61):

```python
#: The leaves `location` keeps once it is derived from `instances[0]` (§4).
LOCATION_KEYS = ("spreadsheetId", "sheetId", "sheet", "hidden")


def used(run_dir):
    """§4: a run directory holding `id-map.json` has already had a delta
    applied into it. A retry after a *precondition* failure is unaffected —
    nothing at all is written until the preconditions pass — so this catches
    only the second apply of a run that already wrote."""
    return (pathlib.Path(run_dir) / "id-map.json").exists()


def _today_jalali():
    """Today as QF-41's business date — Latin-digit Jalali. `verbs.retire`
    imports this one rather than keeping its own, so the two dates a run can
    write into `valid_to` come from a single definition."""
    return jdatetime.date.today().strftime("%Y-%m-%d")


def _recompute_location(entry):
    """§4: `location` is a derived pointer — the first `instances[]` member in
    ascending instance-key order. The ladder skips the leaf (`ladder.DERIVED`),
    so this is its one writer. A record with no instances (paper, external,
    native, a stub) keeps the location its delta gave it."""
    data = entry.get("data") or {}
    instances = [i for i in data.get("instances") or [] if isinstance(i, dict)]
    if not instances:
        return False
    first = min(instances, key=lambda i: i.get("key") or "")
    location = {k: first[k] for k in LOCATION_KEYS if k in first}
    if data.get("location") == location:
        return False
    data["location"] = location
    return True
```

At the top of `apply()` (line 65, before `delta = read_json(delta_path)`):

```python
    root, delta_path, run_dir = (pathlib.Path(root), pathlib.Path(delta_path),
                                 pathlib.Path(run_dir))
    if used(run_dir):
        print(f"precondition failed: {run_dir} has already been applied — "
              f"one apply per run directory (§4)", file=sys.stderr)
        raise SystemExit(2)
    delta = read_json(delta_path)
```

In `_preconditions`, replace the in-delta identity loop (lines 346-357) and add the store-wide guard. The `seen`/`sheets` block becomes:

```python
    seen, sheets = set(), set()
    for entry in entries:
        if not is_open(entry):
            continue
        nk = _natural_key(entry)
        if nk in seen:
            out.append(f"duplicate natural key {entry.get('key')} in delta")
        seen.add(nk)
        for ident in _sheet_identities(entry):
            if ident in sheets:
                out.append(f"duplicate sheet identity {ident[0]}/{ident[1]} in delta")
            sheets.add(ident)
```

and, just after `unit_rows = _unit_row_keys(store, entries)` (line 364), build the store's identity index:

```python
    # §3.2: one open record per instance. `find_match` answers None for an
    # instance match under another key so `apply` never renames — which would
    # leave it free to MINT a second record on the same tab, so the refusal
    # lands here instead, naming both. A stub is exempt: filling it is exactly
    # how a tab acquires its real key (QF-20).
    held_by = {ident: e for e in store["record"]["entries"] if is_open(e)
               for ident in _sheet_identities(e)}
```

and inside the per-entry loop, beside the other identity checks (after the `find_match` block, line 393):

```python
        for ident in _sheet_identities(entry):
            other = held_by.get(ident)
            if other is None or _is_stub(other) or other is match:
                continue
            if _natural_key(other) != _natural_key(entry):
                out.append(f"{label}: tab {ident[0]}/{ident[1]} already belongs "
                           f"to {other['id']} ({other['key']!r}) — keys are "
                           f"immutable (QF-34)")
```

- [ ] **Step 6: `apply` — supersession without a `valid_from`, the note title twin, the location recompute**

`_is_supersession` (line 416) gains the declared road:

```python
def _is_supersession(match, incoming, source):
    """§11: a value that would be *disputed* but carries a **later**
    `valid_from` — or a delta that names the match in `supersedes` outright —
    is a successor instead. Jalali is fixed-width (QF-41), so the dates compare
    as strings; an incumbent with no `valid_from` counts as earlier. "Would be
    disputed" is the ladder's own verdict, asked on copies — prose never
    disputes, so a re-worded statement never supersedes."""
    declared = (incoming.get("supersedes") or {}).get("ref") == match["id"]
    valid_from = incoming.get("valid_from")
    if not valid_from and not declared:
        return False
    held = match.get("valid_from")
    if valid_from and held is not None and str(valid_from) <= str(held):
        return False
    return would_dispute(match, incoming, source)
```

In `_preconditions`, drop the note exemption from the title guard (lines 388-392):

```python
            twin = _title_twin(store, entry)                          # QF-34
            if twin is not None:
                out.append(f"{label}: title {entry.get('title')!r} is already "
                           f"{twin['id']}'s in this kind and scope")
```

In `_upsert`, close the predecessor with the run date (line 651) and recompute the pointer before the entry is recorded as touched (after line 671, before `touched.append`):

```python
        elif action == "supersede":
            entry = _successor(match, incoming, fid)
            store[entry["kind"]]["entries"].append(entry)
            # §4: a supersession that names no `valid_from` still closes the
            # predecessor — with the run's own date, so an era always has an
            # end and `is_open` never sees two live ones for a key.
            match["valid_to"] = incoming.get("valid_from") or _today_jalali()
            match["superseded_by"] = {"ref": fid}
            touched.append({"entry": match, "id": match["id"], "created": False,
                            "changed": True, "original": None})
            changed = True
```

```python
        if _recompute_location(entry):
            changed = True
        touched.append({"entry": entry, "id": fid,
                        "created": action in ("create", "supersede"),
                        "changed": changed, "original": original})
```

Finally, in `engine/merge_facts/verbs.py`, take `_today_jalali` from `apply` rather than keeping a second copy — change the import (line 63) and delete the local definition (lines 104-105):

```python
from merge_facts.apply import KEY_RE, _snapshot, _today_jalali
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_merge_facts_ladder.py engine/tests/test_merge_facts_core.py engine/tests/test_merge_facts_apply.py engine/tests/test_merge_facts_verbs.py engine/tests/test_merge_facts_revert.py -q`
Expected: PASS (the verbs and revert suites are rerun because `is_open`, `find_match` and `_today_jalali` are shared with them).

- [ ] **Step 8: Commit**

```bash
git add engine/merge_facts/__init__.py engine/merge_facts/ladder.py \
        engine/merge_facts/apply.py engine/merge_facts/verbs.py \
        engine/tests/facts_helpers.py engine/tests/test_merge_facts_core.py \
        engine/tests/test_merge_facts_ladder.py engine/tests/test_merge_facts_apply.py
git commit -m "$(cat <<'EOF'
feat(facts): ladder and apply v3 — derived location, instance identity, the used marker

`location` joins the ladder's leaf-name skip set and `apply` recomputes it from
`instances[]`; `find_match` matches any instance and refuses one whose natural
key disagrees, with the refusal moved into the preconditions so a renamed tab
can never mint a twin; a supersession with no `valid_from` closes with the run
date and `is_open` reads `superseded_by`; the title-twin guard covers notes; a
second apply into a used run directory exits 2.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 8a: `audit` v3 — the detectors and `flags_over`

**Files:**
- Modify: `engine/merge_facts/audit.py:32-60` (imports and constants), `137-184` (`_duplicate_output`, `_lookalike_title`), `309-412` (`_dump_rows` … `_row_gone`), `539-587` (`_unconsumed_constant`, `_recurring_note_shape`), `711-743` (`_unit_rows`, `_unit_raw_uncovered` — both deleted), `800-806` (`AUDIT_CHECKS`)
- Test: `engine/tests/test_merge_facts_audit.py` (modify lines 118-142, 178-188, 259-290, 383-415, 483-495; append the new cases)

**Read for context first:** `engine/merge_facts/audit.py` end to end (its module docstring says what a finding is and is not), `engine/tests/test_merge_facts_audit.py:1-115` for the fixture helpers, spec §2.6 step 7 and the `merge facts audit` row of §4, and `engine/dump_workbook/__init__.py:776-790` for the `formulas.tsv` and `rows.tsv` headers.

**Interfaces:**
- Consumes: `merge_facts.open_accounts`, `merge_facts.canonical_scope`, `merge_facts.is_open`, `merge_facts.iter_ref_objects`, `merge_facts.load_store`, `merge_facts.apply._is_stub`, the audit's own `_Walk`, `_finding`, `_fold`, `_shape`, `_tokens`, `_overlap`, `_dump_rows`, `_row_present`, `_item_labels`.
- Produces: `FLAG_CHECKS = (_duplicate_output, _lookalike_title, _recurring_note_shape, _equal_expr, _duplicate_code, _edge_disagreement)`; `flags_over(root, entries) -> list[dict]`; `AUDIT_CHECKS` extended with `_binding_gone`, `_expr_missing`, `_no_consumer`, `_quantity_off_enum`, `_note_targets_retired`, `_import_unresolved`, `_stale_prose`; codes `two_writers`, `duplicate_title`, `note_overlap`, `equal_expr`, `duplicate_code`, `edge_disagreement`, `row_gone`, `dump_missing`, `binding_gone`, `expr_missing`, `no_consumer`, `quantity_off_enum`, `note_targets_retired`, `import_unresolved`, `stale_prose`, `unconsumed_constant` (`proposal: "info"`).

- [ ] **Step 1: Write the failing test**

In `engine/tests/test_merge_facts_audit.py`, add `flags_over` to the imports (line 26) — `from merge_facts.audit import audit, check, coverage, flags_over` — and add these fixtures after `_reference_record` (line 115):

```python
def _template(tid="T-1", key="gozaresh_pitza", instance="gz__s11", sid="G",
              sheet="پیتزا"):
    return _entry(tid, "record", key, "گزارش پیتزا", {
        "medium": "sheet", "role": "report",
        "location": {"spreadsheetId": sid, "sheetId": 11, "sheet": sheet,
                     "hidden": False},
        "instances": [{"key": instance, "spreadsheetId": sid, "sheetId": 11,
                       "sheet": sheet, "branch": "chalebagh", "hidden": False}],
        "fields": [{"key": "enheraf", "title": "انحراف", "type": "number",
                    "unit": "g", "columns": {instance: "J"}}]})


def _bound_rule(tid, key, title, binding, rng, expr="v = x", record="T-1"):
    return _entry(tid, "rule", key, title, {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                     "nature": "observed"}],
        "lang": "feel", "expr": expr,
        "applies_to": [{"key": binding, "record": {"ref": record,
                                                   "field": "enheraf"},
                        "variant": 1, "range": rng, "params": {}}]})


def _note(tid, key, statement, about="F-00001"):
    return _entry(tid, "note", key, statement[:60],
                  {"about": [{"ref": about}], "question": "واحدش چیست؟"}) \
        | {"statement": statement}
```

Replace `test_duplicate_output_two_rules_writing_one_field` (lines 118-142) with:

```python
def test_two_writers_on_overlapping_bindings(tmp_path):
    """§4: keyed on the bindings, not on (ref, field) — two rules computing one
    column of one tab over meeting row ranges is the contradiction; the same
    column in two different row bands is the estate as it is."""
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15"),
                  _bound_rule("T-3", "enheraf_dobare", "انحراف دوباره",
                              "gz__s11__j__r10", "J10:J20", expr="v = x * 2")],
           "1")
    found = _of(audit(root), "two_writers")
    assert len(found) == 1 and "J" in found[0]["message"]


def test_two_writers_is_quiet_on_bands_that_do_not_meet(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J9"),
                  _bound_rule("T-3", "enheraf_payin", "انحراف پایین",
                              "gz__s11__j__r10", "J10:J20", expr="v = x * 2")],
           "1")
    assert "two_writers" not in _codes(audit(root))
```

Replace `test_lookalike_title_folds_space_and_zwnj` (lines 178-188) with:

```python
def test_duplicate_title_folds_space_zwnj_and_digits(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol_a"); a["entries"][0]["title"] = "تلورانس ۵ گرم"
    b = _const_delta(7, key="tol_b"); b["entries"][0]["title"] = "تلورانس‌۷ گرم"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    apply(root, _write(root, "b.json", b), _run_dir(root, "2"))
    found = _of(audit(root), "duplicate_title")
    ids = {e["id"] for e in load_store(root)["rule"]["entries"]
           if e["key"] in ("tol_a", "tol_b")}
    assert len(found) == 1 and all(i in found[0]["message"] for i in ids)
```

Replace `test_recurring_note_shape` (lines 407-415) with:

```python
def test_note_overlap_groups_at_a_third_of_the_tokens(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_note("T-1", "note_aa11bb22cc33",
                        "وزن پنیر پیتزا در پایان شب ثبت نمی‌شود"),
                  _note("T-2", "note_aa11bb22cc34",
                        "وزن پنیر در انبار ثبت نمی‌شود")], "1")
    found = _of(audit(root), "note_overlap")
    assert len(found) == 1            # 5/9 tokens: over 0.35, under the old 0.7
```

Replace the tail of `test_unconsumed_constant_is_reported_and_a_consumed_one_is_not`
(lines 400-404) with:

```python
    found = _of(audit(root), "unconsumed_constant")
    lonely_id = [e["id"] for e in load_store(root)["rule"]["entries"]
                 if e["key"] == "lonely_tol"][0]
    assert [i["id"] for i in found] == [lonely_id]
    assert found[0]["proposal"] == "info"      # §4: information, not a defect
```

Delete `test_unit_raw_uncovered` (lines 483-492) — `_unit_raw_uncovered` goes with it — and append the new cases:

```python
# --- v3 detectors ---------------------------------------------------------- #

def test_row_gone_is_quiet_when_one_instance_of_the_template_still_has_it(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _reference_record(sid="M", sheet="پیتزا")
    record["data"]["instances"] = [
        {"key": "m__s2", "spreadsheetId": "M", "sheetId": 2, "sheet": "پیتزا",
         "branch": "chalebagh", "hidden": False},
        {"key": "n__s2", "spreadsheetId": "N", "sheetId": 2, "sheet": "پیتزا",
         "branch": "naharkhoran", "hidden": False}]
    _apply(root, [record], "1")
    for sid, rows in (("M", "پیتزا\t2\tprod_61\t250\n"),
                      ("N", "پیتزا\t2\tprod_61\t250\nپیتزا\t3\tprod_62\t300\n")):
        dump = root / "attachments" / "sheets" / ".dump" / sid
        dump.mkdir(parents=True)
        (dump / "rows.tsv").write_text("sheet\trow\tcode\tgrams\n" + rows,
                                       encoding="utf-8")
    codes = _codes(audit(root))
    assert "row_gone" not in codes and "dump_missing" not in codes


def test_dump_missing_names_the_instance_whose_workbook_has_no_rows(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _reference_record(sid="M", sheet="پیتزا")
    record["data"]["instances"] = [
        {"key": "m__s2", "spreadsheetId": "M", "sheetId": 2, "sheet": "پیتزا",
         "branch": "chalebagh", "hidden": False},
        {"key": "n__s2", "spreadsheetId": "N", "sheetId": 2, "sheet": "پیتزا",
         "branch": "naharkhoran", "hidden": False}]
    _apply(root, [record], "1")
    dump = root / "attachments" / "sheets" / ".dump" / "M"
    dump.mkdir(parents=True)
    (dump / "rows.tsv").write_text(
        "sheet\trow\tcode\tgrams\nپیتزا\t2\tprod_61\t250\nپیتزا\t3\tprod_62\t300\n",
        encoding="utf-8")
    found = _of(audit(root), "dump_missing")
    assert len(found) == 1 and "n__s2" in found[0]["message"]
    assert "row_gone" not in _codes(audit(root))


def _formulas(root, sid, rows):
    dump = root / "attachments" / "sheets" / ".dump" / sid
    dump.mkdir(parents=True, exist_ok=True)
    (dump / "formulas.tsv").write_text(
        "sheet\trange\tgroup\tformula\tcount\tcached\terror\n" + rows,
        encoding="utf-8")


def test_binding_gone_when_the_dump_no_longer_computes_the_range(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15")], "1")
    _formulas(root, "G", "پیتزا\tJ6:J15\t1\t=I6-H6\t10\t5\t\n")
    assert "binding_gone" not in _codes(audit(root))
    _formulas(root, "G", "پیتزا\tK6:K15\t1\t=I6-H6\t10\t5\t\n")
    found = _of(audit(root), "binding_gone")
    assert len(found) == 1 and "J6:J15" in found[0]["message"]


def test_expr_missing_on_a_rule_that_is_bound_but_states_nothing(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    bound = _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6", "J6:J15")
    bound["data"].pop("expr")
    bound["data"]["lang"] = "sheets"
    bound["data"]["original"] = "=I6-H6"        # §5.3: original alone is illegal
    _apply(root, [_template(), bound], "1")
    found = _of(audit(root), "expr_missing")
    assert len(found) == 1 and "enheraf" in found[0]["message"]


def test_equal_expr_two_rules_stating_one_computation_in_one_scope(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15", expr="v = x"),
                  _bound_rule("T-3", "enheraf_lain", "انحراف لاین",
                              "gz__s11__k__r6", "K6:K15", expr="v =  x")], "1")
    found = _of(audit(root), "equal_expr")
    assert len(found) == 1 and "v = x" in found[0]["message"].replace(" ", " ")


def test_duplicate_code_two_items_answering_to_one_code(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_entry("T-1", "item", "ing_1", "پنیر",
                         {"category": "ingredient", "unit": "g", "code": "##1"}),
                  _entry("T-2", "item", "ing_1_dobare", "پنیر پیتزا",
                         {"category": "ingredient", "unit": "g", "code": "##1"})],
           "1")
    found = _of(audit(root), "duplicate_code")
    assert len(found) == 1 and "##1" in found[0]["message"]


def test_edge_disagreement_two_answers_for_one_edge_case(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    rule = _entry("T-1", "rule", "sefaresh", "مقدار سفارش", {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                     "nature": "observed"}],
        "lang": "gs", "expr": "v = x", "identifier": "orderQuantity",
        "edge_cases": [{"input": "جمعه", "expected": 2, "why": "روز شلوغ"},
                       {"input": "جمعه", "expected": 3, "why": "بازنویسی"}]})
    _apply(root, [rule], "1")
    found = _of(audit(root), "edge_disagreement")
    assert len(found) == 1 and "جمعه" in found[0]["message"]


def test_no_consumer_only_for_the_item_nothing_reads(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    read = _entry("T-1", "item", "ing_1", "پنیر", {"category": "ingredient",
                                                   "unit": "g"})
    lonely = _entry("T-2", "item", "ing_2", "روغن", {"category": "ingredient",
                                                     "unit": "g"})
    measure = _entry("T-3", "measurement", "vazn_panir", "وزن پنیر",
                     {"of": {"ref": "T-1"}, "quantity": "mass", "unit": "g",
                      "by": "مسئول واحد", "when": "پایان شب"})
    _apply(root, [read, lonely, measure], "1")
    found = _of(audit(root), "no_consumer")
    lonely_id = [e["id"] for e in load_store(root)["item"]["entries"]
                 if e["key"] == "ing_2"][0]
    assert [i["id"] for i in found] == [lonely_id]


def test_quantity_off_enum(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))
    store = load_store(root)
    store["measurement"]["entries"].append({
        "id": "F-09999", "kind": "measurement", "key": "vazn", "title": "وزن",
        "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
        "source": [], "retired": False, "status": "confirmed",
        "updated_at": "2026-09-01T10:00:00Z",
        "data": {"quantity": 215, "unit": "g", "by": "مسئول واحد",
                 "when": "پایان شب"}})
    found = audit_mod._quantity_off_enum(audit_mod._Walk(root, store))
    assert [i["code"] for i in found] == ["quantity_off_enum"]


def test_note_targets_retired(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    item = _entry("T-1", "item", "ing_1", "پنیر", {"category": "ingredient",
                                                   "unit": "g"})
    report = _apply(root, [item], "1")
    item_id = report["id_map"]["T-1"]
    _apply(root, [_note("T-1", "note_aa11bb22cc33", "واحد این قلم روشن نیست",
                        about=item_id)], "2")
    assert "note_targets_retired" not in _codes(audit(root))
    retire(root, item_id, None, _run_dir(root, "3"))
    found = _of(audit(root), "note_targets_retired")
    assert len(found) == 1 and item_id in found[0]["message"]


def test_import_unresolved_only_while_the_source_is_a_locator(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _template()
    record["data"]["instances"][0]["imports"] = [
        {"key": "gz__s11__im1", "source": {"spreadsheetId": "W",
                                           "sheet": "روزانه"},
         "range": "A:X"}]
    _apply(root, [record], "1")
    found = _of(audit(root), "import_unresolved")
    assert len(found) == 1 and "روزانه" in found[0]["message"]


def test_stale_prose_after_a_field_is_settled(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol"); a["entries"][0]["statement"] = "حد مجاز نامشخص است"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    apply(root, _write(root, "b.json", _const_delta(4, key="tol")),
          _run_dir(root, "2"))
    assert "stale_prose" not in _codes(audit(root))       # still disputed
    entry = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"][0]
    chosen = [x for x in entry["accounts"] if x["value"] == 4][0]
    resolve(root, entry["id"], "data/outputs/v/value", chosen["id"],
            _run_dir(root, "3"))
    found = _of(audit(root), "stale_prose")
    assert len(found) == 1 and found[0]["id"] == entry["id"]


def test_flags_over_sees_the_store_and_the_entries_together(tmp_path):
    """§2.6 step 7: `assemble` calls the six disk-free checks over `load_store`
    plus what it is about to write, so its flags and the audit's findings are
    one implementation and cannot drift."""
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15")], "1")
    stored = [e for e in load_store(root)["rule"]["entries"]
              if e["key"] == "enheraf"][0]
    incoming = dict(stored, id="T-4", key="enheraf_lain", title="انحراف لاین")
    flags = flags_over(root, [incoming])
    assert {f["code"] for f in flags} == {"equal_expr", "two_writers"}
    assert all("T-4" in f["message"] for f in flags)
    assert not (root / "facts" / "records.json").with_suffix(".tmp").exists()
```

Add `resolve` to the verbs import at line 27: `from merge_facts.verbs import resolve, retire`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest engine/tests/test_merge_facts_audit.py -q`
Expected: FAIL — `ImportError: cannot import name 'flags_over' from 'merge_facts.audit'`.

- [ ] **Step 3: Rename the three flag codes and retune the thresholds**

In `engine/merge_facts/audit.py`, set the threshold (line 48) and drop the two now-unused imports (lines 39-42):

```python
NOTE_OVERLAP = 0.35       # §4: a third of the tokens is one shape
```

```python
from merge_facts import (KIND_ORDER, canonical_scope, collect_leaves, is_open,
                         iter_ref_objects, load_store, open_accounts,
                         sha256_file)
from merge_facts.apply import (FACT_ID_RE, PROC_ID_RE, TEMP_ID_RE,
                               _declared_fields, _declared_rows, _is_stub)
```

Replace `_duplicate_output` (lines 137-163) with the binding-keyed check:

```python
_A1_RANGE = re.compile(r"([A-Z]{1,3})(\d+)(?::[A-Z]{1,3}(\d+))?\s*$")


def _bindings(rule):
    """Every (instance, column, first row, last row, key) a rule runs on, read
    off `applies_to[]` — whose key is `<instance>__<column>__r<first row>`
    (§3.1) and whose `range` carries the span.

    ponytail: the span is an A1 regex over the end of the range; a whole-column
    or whole-sheet range answers one row, the one its key names. Widen it if
    the estate ever grows a column-wide formula.
    """
    out = []
    for member in _data(rule).get("applies_to") or []:
        if not isinstance(member, dict) or not isinstance(member.get("key"), str):
            continue
        parts = member["key"].rsplit("__", 2)
        if len(parts) != 3:
            continue
        instance, column, row = parts
        found = _A1_RANGE.search(str(member.get("range") or ""))
        first = int(found.group(2)) if found else int(row.lstrip("r") or 0)
        last = int(found.group(3)) if found and found.group(3) else first
        out.append((instance, column, first, last, member["key"]))
    return out


def _duplicate_output(walk):
    """§2.6 step 7's `two_writers`: two rules whose `applies_to` bindings
    overlap on one instance, one column and meeting row ranges — the ERP would
    not know which one computed the cell.

    Keyed on the binding, not on `(ref, field)` (§4): one column of one tab is
    written by one rule per band, and two rules over one band is the
    contradiction. The old `writes_to` grouping said nothing about which rows,
    so a report column computed by two rules over two disjoint bands — the
    estate as it is — read as a defect.

    ponytail: O(n²) over the bindings of one department's rules; a store-wide
    index by (instance, column) is the upgrade if the estate outgrows it.
    """
    items = []
    bound = [(rule["id"], b) for rule in _rules(walk) for b in _bindings(rule)]
    for index, (left_id, left) in enumerate(bound):
        for right_id, right in bound[index + 1:]:
            if left_id == right_id or left[:2] != right[:2]:
                continue
            if left[3] < right[2] or right[3] < left[2]:
                continue                       # the bands do not meet
            items.append(_finding(
                "two_writers", min(left_id, right_id),
                f"{left_id} ({left[4]}) and {right_id} ({right[4]}) both write "
                f"column {left[1]} of {left[0]}"))
    return items
```

In `_lookalike_title` (line 166) fold digits on the title and report under the new code:

```python
def _lookalike_title(walk):
    """The backstop for the byte-wise comparison §18 keeps: titles (and keys)
    that differ only in spacing, digits, case or ی/ي.

    The title folds digit RUNS as well (§4) — «تلورانس ۵ گرم» and «تلورانس ۷
    گرم» are one concept with a parameter, not two rules. The key does not: a
    note's key is `note_` plus twelve hex, and collapsing its digits would make
    two unrelated notes look alike.
    """
    items = []
    for attr, fold in (("title", _shape),
                       ("key", lambda v: _fold(str(v).replace("_", "")))):
        groups = {}
        for entry in walk.open:
            groups.setdefault((entry["kind"], fold(entry.get(attr) or "")),
                              []).append(entry)
        for (kind, _folded), members in groups.items():
            if len(members) < 2 or len({m.get(attr) for m in members}) < 2:
                continue
            members = sorted(members, key=lambda m: m["id"])
            spelled = ", ".join(f"{m['id']} {m.get(attr)!r}" for m in members)
            items.append(_finding("duplicate_title", members[0]["id"],
                                  f"{kind} {attr}s look alike: {spelled}"))
    return items
```

In `_recurring_note_shape` (line 583) change the code to `note_overlap`, and in `_unconsumed_constant` (line 553) mark the finding informational:

```python
        items.append(_finding(
            "note_overlap", ids[0],
            f"{', '.join(ids)} repeat one shape: "
            f"{group['members'][0].get('statement')!r}"))
```

```python
        # §5.1's consumer contract: "a settings constant — a par level, a
        # tolerance, a conversion factor, a threshold; a consumer is not
        # required". So this is a line for a reader, not a defect, and
        # `proposal: "info"` is how stage C tells the two apart.
        items.append(_finding(
            "unconsumed_constant", rule["id"],
            f"constant {rule['key']} is read by no rule and derives no "
            "record field", "info"))
```

- [ ] **Step 4: `row_gone` and `binding_gone` over the instances**

Replace `_row_gone` (lines 383-411) and add the two helpers above it:

```python
def _record_locations(record):
    """Every (spreadsheetId, sheet, instance key) a record's rows may be dumped
    under — its `instances[]` (QF-47), or its `location` for a record that has
    none."""
    data = _data(record)
    out = [(i.get("spreadsheetId"), i.get("sheet"), i.get("key"))
           for i in data.get("instances") or []
           if isinstance(i, dict) and i.get("spreadsheetId")]
    if out:
        return out
    location = data.get("location") or {}
    if location.get("spreadsheetId"):
        return [(location["spreadsheetId"], location.get("sheet"), None)]
    return []


def _row_gone(walk):
    """§9 over §4's instances: a re-dump that no longer carries a row the store
    holds. A template repeats across its instances, so a row present in ANY
    instance's dump is present; `dump_missing` is reported per (entry,
    instance) whose workbook has no `rows.tsv` at all, because that instance —
    not the record — is what nobody has dumped."""
    items = []
    labels = _item_labels(walk)
    for record in _records(walk):
        rows = [r for r in _rows(record) if is_open(r)]
        places = _record_locations(record)
        if not rows or not places or _is_stub(record):
            continue
        dumps = []
        for spreadsheet, sheet, key in places:
            dump_rows = _dump_rows(walk.root, spreadsheet, sheet)
            if dump_rows is None:
                items.append(_finding(
                    "dump_missing", record["id"],
                    f"no attachments/sheets/.dump/{spreadsheet}/rows.tsv — the "
                    f"rows of {record['id']}"
                    + (f" instance {key}" if key else "")
                    + " cannot be checked"))
            else:
                dumps.extend(dump_rows)
        if not dumps:
            continue                       # nothing at all to compare against
        for row in rows:
            if not _row_present(record, row, dumps, labels):
                items.append(_finding(
                    "row_gone", record["id"],
                    f"row {row.get('key')!r} is in no row of the latest dump of "
                    f"{', '.join(sorted({p[0] for p in places}))}"))
    return items


def _formula_ranges(root, spreadsheet_id):
    """The (sheet, range) pairs the latest dump holds for one workbook —
    `formulas.tsv`, one row per (sheet, range) (§4). `None` when the workbook
    has no dump at all."""
    path = (root / "attachments" / "sheets" / ".dump" / spreadsheet_id
            / "formulas.tsv")
    if not path.is_file():
        return None
    lines = [line for line in path.read_text(encoding="utf-8").splitlines()
             if line.strip()]
    if not lines:
        return set()
    header = lines[0].split("\t")
    return {(row.get("sheet"), row.get("range")) for row in
            (dict(zip(header, line.split("\t"))) for line in lines[1:])}


def _instances_by_key(record):
    return {i["key"]: i for i in _data(record).get("instances") or []
            if isinstance(i, dict) and i.get("key")}


def _binding_gone(walk):
    """§3.1: a binding is never removed automatically — the audit reports one
    the dump no longer computes and `edit-fact` takes it out. The binding names
    its instance in its own key, the record it points at carries that instance,
    and `formulas.tsv` is the record of what the tab computes. A workbook with
    no dump is silent here: `dump_missing` already says so once."""
    items, ranges = [], {}
    for rule in _rules(walk):
        for member in _data(rule).get("applies_to") or []:
            if not isinstance(member, dict) or not member.get("range"):
                continue
            record = walk.by_id.get((member.get("record") or {}).get("ref"))
            instance = (_instances_by_key(record).get(
                str(member.get("key")).rsplit("__", 2)[0]) if record else None)
            if not instance or not instance.get("spreadsheetId"):
                continue                   # `_orphan_ref` owns the dangle
            spreadsheet = instance["spreadsheetId"]
            if spreadsheet not in ranges:
                ranges[spreadsheet] = _formula_ranges(walk.root, spreadsheet)
            held = ranges[spreadsheet]
            if held is None or (instance.get("sheet"), member["range"]) in held:
                continue
            items.append(_finding(
                "binding_gone", rule["id"],
                f"binding {member['key']} reads {member['range']} of "
                f"{instance.get('sheet')} in {spreadsheet}, which the latest "
                f"dump no longer computes"))
    return items
```

- [ ] **Step 5: The seven new detectors**

Add after `_unconsumed_constant` (line 557) in `engine/merge_facts/audit.py`:

```python
QUANTITIES = ("mass", "count", "volume", "duration", "money", "ratio", "other")
UNRESOLVED_WORDS = ("نامشخص", "مشخص نیست", "معلوم نیست")


def _expr_missing(walk):
    """§5.3: `original` alone is not a legal state — a rule bound to a formula
    states the business computation as `expr`, a `table`, or `lang: text`. This
    is the count Gate B carries and QF-44 (v3) reads."""
    items = []
    for rule in _rules(walk):
        data = _data(rule)
        if not data.get("applies_to"):
            continue
        if data.get("expr") or data.get("table") or data.get("text"):
            continue
        items.append(_finding("expr_missing", rule["id"],
                              f"rule {rule['key']} is bound to "
                              f"{len(data['applies_to'])} formulas and states "
                              f"no expression"))
    return items


def _equal_expr(walk):
    """§2.6 step 7: two rules stating one computation in one scope. U5 says one
    entry with all its bindings, so the second is either a duplicate the
    reviewer should merge or a divergence nobody declared."""
    groups = {}
    for rule in _rules(walk):
        expr = _data(rule).get("expr")
        if not isinstance(expr, str) or not expr.strip():
            continue
        scope = canonical_scope(rule.get("scope"))
        groups.setdefault(("".join(expr.split()), tuple(scope["departments"]),
                           tuple(scope["branches"])), []).append(rule["id"])
    items = []
    for (expr, _departments, _branches), ids in groups.items():
        if len(ids) < 2:
            continue
        items.append(_finding("equal_expr", sorted(ids)[0],
                              f"{', '.join(sorted(ids))} state one expression: "
                              f"{expr}"))
    return items


def _duplicate_code(walk):
    """`#N` and `##N` are the estate's own identifiers (§2.3); two open items
    answering to one of them is a merge the reviewer missed."""
    groups = {}
    for item in walk.open:
        code = _data(item).get("code") if item["kind"] == "item" else None
        if code:
            groups.setdefault(str(code), []).append(item["id"])
    items = []
    for code, ids in groups.items():
        if len(ids) < 2:
            continue
        items.append(_finding("duplicate_code", sorted(ids)[0],
                              f"code {code} is carried by "
                              f"{', '.join(sorted(ids))}"))
    return items


def _edge_disagreement(walk):
    """Two edge cases stating one input and expecting two different answers —
    within one rule, or between a rule and the template it declares. The ladder
    dedups `edge_cases` on `input`, so a pair like this arrives only from one
    assembly merging two units' readings, which is exactly the contradiction
    the reviewer is there to settle."""
    items = []
    for rule in _rules(walk):
        family = [rule]
        target = walk.by_id.get((_data(rule).get("template_of") or {}).get("ref"))
        if target is not None and target.get("kind") == "rule":
            family.append(target)
        stated = {}
        for member in family:
            for case in _data(member).get("edge_cases") or []:
                if isinstance(case, dict) and case.get("input") is not None:
                    stated.setdefault(_fold(case["input"]), set()).add(
                        str(case.get("expected")))
        for shape, expected in sorted(stated.items()):
            if len(expected) < 2:
                continue
            items.append(_finding(
                "edge_disagreement", rule["id"],
                f"edge case {shape!r} expects {' and '.join(sorted(expected))}"))
    return items


def _no_consumer(walk):
    """§4: an item nothing references — no rule reads it, no measurement
    measures it, no `refItems` cell resolves to it. Either the estate stopped
    using it, or it is a code minted with no home."""
    referenced = {obj["ref"] for entry in walk.open
                  for obj in iter_ref_objects(entry)
                  if isinstance(obj.get("ref"), str)}
    keys = set()
    for record in _records(walk):
        columns = [f["key"] for f in _data(record).get("fields") or []
                   if isinstance(f, dict) and f.get("refItems") and f.get("key")]
        for row in _rows(record):
            for column in columns:
                if isinstance(row.get(column), str):
                    keys.add(row[column])
    items = []
    for item in walk.open:
        if item["kind"] != "item" or item["id"] in referenced \
                or item["key"] in keys:
            continue
        items.append(_finding("no_consumer", item["id"],
                              f"item {item['key']} is read by no rule, record "
                              f"or measurement"))
    return items


def _quantity_off_enum(walk):
    """§3.3 closes `measurement.quantity` to a KIND of quantity. The schema
    refuses a new one at the door; this reports one the store already holds —
    including the v2 failure of writing a number where the kind belongs."""
    items = []
    for entry in walk.open:
        if entry["kind"] != "measurement":
            continue
        quantity = _data(entry).get("quantity")
        if quantity in QUANTITIES:
            continue
        items.append(_finding("quantity_off_enum", entry["id"],
                              f"quantity {quantity!r} is not one of "
                              f"{', '.join(QUANTITIES)}"))
    return items


def _note_targets_retired(walk):
    """QF-9 (v3): a note points at entries and asks something. One whose target
    is closed asks about a definition nobody reads any more."""
    items = []
    for note in walk.open:
        if note["kind"] != "note":
            continue
        for target in _data(note).get("about") or []:
            ref = target.get("ref") if isinstance(target, dict) else None
            entry = walk.by_id.get(ref)
            if entry is None or is_open(entry):
                continue                   # `_orphan_ref` owns the dangle
            items.append(_finding(
                "note_targets_retired", note["id"],
                f"note {note['key']} asks about {ref}, retired "
                f"{entry.get('valid_to') or ''}".rstrip()))
    return items


def _import_unresolved(walk):
    """QF-48: an `imports[].source` still a locator. §10 lets one stand
    indefinitely — the source department may never run — so this is a line for
    whoever wants the edge closed, not a defect."""
    items = []
    for record in _records(walk):
        for instance in _data(record).get("instances") or []:
            if not isinstance(instance, dict):
                continue
            for member in instance.get("imports") or []:
                source = member.get("source") if isinstance(member, dict) else None
                if not isinstance(source, dict) or source.get("ref"):
                    continue
                items.append(_finding(
                    "import_unresolved", record["id"],
                    f"instance {instance.get('key')} imports "
                    f"{source.get('sheet')} of {source.get('spreadsheetId')} "
                    f"by locator, not by reference"))
    return items


def _stale_prose(walk):
    """§4: a field somebody settled whose statement still calls it unresolved.
    `resolve` writes the chosen value into the leaf, and §11's prose rule
    writes a statement once and never rewrites it — so the panel ends up
    showing a settled number under a sentence saying nobody knows."""
    words = [_fold(w) for w in UNRESOLVED_WORDS]
    items = []
    for entry in walk.open:
        settled = any(a.get("status") == "chosen"
                      for a in entry.get("accounts") or [] if isinstance(a, dict))
        if not settled or open_accounts(entry):
            continue
        statement = _fold(entry.get("statement") or "")
        if not any(word in statement for word in words):
            continue
        items.append(_finding("stale_prose", entry["id"],
                              f"{entry['key']}'s statement still calls a "
                              f"settled field unresolved"))
    return items
```

Delete `_unit_rows` and `_unit_raw_uncovered` (lines 711-743) outright, and replace `AUDIT_CHECKS` (lines 800-806) with the two tuples plus `flags_over`:

```python
#: The six §2.6 step 7 flags — every one of them reads nothing off disk, so
#: `assemble` can run them over the store plus the entries it is about to
#: write. One implementation, one set of codes: the audit and the digest
#: cannot drift.
FLAG_CHECKS = (_duplicate_output, _lookalike_title, _recurring_note_shape,
               _equal_expr, _duplicate_code, _edge_disagreement)

AUDIT_CHECKS = FLAG_CHECKS + (
    _orphan_ref, _dangling_ref_items, _process_link, _row_gone, _binding_gone,
    _expr_missing, _retired_row_live_edges, _template_drift, _reconciliation,
    _component_sum, _unconsumed_constant, _no_consumer, _quantity_off_enum,
    _note_targets_retired, _import_unresolved, _stale_prose, _stale_stub,
    _natural_key_dup, _scope_shadow, _unknown_role)


def flags_over(root, entries):
    """§2.6 step 7: the six disk-free checks over `load_store` plus the entries
    an assembly is about to write. `entries` must already carry ids (the
    assembly's temp ids are fine — that is why step 1 mints them first). The
    store is read and never written."""
    root = pathlib.Path(root)
    store = load_store(root)
    for entry in entries:
        store[entry["kind"]]["entries"].append(entry)
    walk = _Walk(root, store)
    items = []
    for check_fn in FLAG_CHECKS:
        items.extend(check_fn(walk))
    return _sorted(items)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_merge_facts_audit.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/merge_facts/audit.py engine/tests/test_merge_facts_audit.py
git commit -m "$(cat <<'EOF'
feat(facts): audit v3 detectors and the shared assemble flags

two_writers is keyed on overlapping bindings, duplicate_title folds digit runs,
note_overlap groups at 0.35, row_gone and dump_missing walk instances[], and
binding_gone reads the dump's formulas.tsv. New: equal_expr, duplicate_code,
edge_disagreement, expr_missing, no_consumer, quantity_off_enum,
note_targets_retired, import_unresolved, stale_prose. unconsumed_constant is
information; _unit_raw_uncovered is gone. FLAG_CHECKS and flags_over give
assemble the same six checks under the same six codes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 8b: `check` readiness, `audit --persian`, and the verbs

**Files:**
- Modify: `engine/merge_facts/audit.py:812-822` (`audit`) and `engine/merge_facts/audit.py:845-905` (`coverage` deleted, `check` rewritten)
- Modify: `engine/merge_facts/verbs.py:1-38` (module docstring), `47-65` (imports), `118-145` (`resolve`), `224-280` (`repair_foreign_keys` deleted)
- Modify: `engine/merge/cli.py:10-19` (imports), `125-129` (the retired verb's branch), `148-159` (`audit`/`check` output), `220-221` and `230-231` (the parsers)
- Test: `engine/tests/test_merge_facts_audit.py` (the `check` and CLI sections, lines 520-590), `engine/tests/test_merge_facts_verbs.py` (lines 1-10 and 73-157)

**Read for context first:** `engine/merge_facts/audit.py:812-905`, `engine/merge/cli.py:100-165`, `engine/merge_facts/verbs.py:1-150`, spec §4's `merge facts check` / `merge facts resolve` rows and QF-44 (v3) in §1.

**Interfaces:**
- Consumes: T8a's `AUDIT_CHECKS`, `FLAG_CHECKS`, `_expr_missing`, `_Walk`, `_sorted`, `_finding`; `merge_facts.content.lint_prose` (T6); `merge_facts.apply._unit_row_keys`; `merge_facts.open_accounts`; `merge_facts.get_path`.
- Produces: `audit(root, persian=False) -> list[dict]` with `PERSIAN` templates keyed by code; `check(root) -> dict` = `{findings, units_done, review_ran, lint_failures, expr_missing, open_disputes}`; `coverage` removed; `verbs.repair_foreign_keys` removed; `verbs.resolve` clearing a stale `unit_ref`; CLI `merge facts audit [--persian]` and a `readiness: …` last line from `merge facts check`.

- [ ] **Step 1: Write the failing test**

Replace `test_check_uncited_workbook_and_the_coverage_count` in `engine/tests/test_merge_facts_audit.py` (lines 543-557) and append the readiness cases; change the imports at line 26 to `from merge_facts.audit import PERSIAN, audit, check, flags_over`:

```python
def test_check_uncited_workbook_has_no_denominator(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _manifest(root, [_workbook("S1", "cited_wb"), _workbook("S2", "quiet_wb")])
    read = _entry("T-1", "record", "cited__ruzane", "روزانه", {
        "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S1", "sheetId": 1, "sheet": "روزانه",
                     "hidden": False}})
    stub = _entry("T-2", "record", "ext_s2", "کتاب ناشناخته", {
        "stub": True, "grain": "workbook", "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S2"}})
    _apply(root, [read, stub], "1")
    report = check(root)
    found = [i for i in report["findings"] if i["code"] == "uncited_workbook"]
    assert len(found) == 1 and "quiet_wb" in found[0]["message"]
    assert "coverage" not in report                 # §4: the metric is withdrawn


def test_check_reports_qf44_v3_readiness(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15")], "20260906-101500")
    run = root / "runs" / "facts" / "cooking" / "20260906-101500"
    (run / "meta.json").write_text(json.dumps(
        {"units": [{"id": "u-wb-gozaresh", "type": "workbook", "state": "done",
                    "attempts": 1},
                   {"id": "u-tr-a-l1", "type": "transcript", "state": "pending",
                    "attempts": 0}]}), encoding="utf-8")
    report = check(root)
    assert report["units_done"] is False
    assert report["review_ran"] is False
    assert report["expr_missing"] == 0
    assert report["open_disputes"] == 0
    assert report["lint_failures"] == 0

    (run / "meta.json").write_text(json.dumps(
        {"units": [{"id": "u-wb-gozaresh", "type": "workbook", "state": "done",
                    "attempts": 1}]}), encoding="utf-8")
    (run / "review").mkdir()
    (run / "review" / "out.json").write_text("{}", encoding="utf-8")
    report = check(root)
    assert report["units_done"] is True and report["review_ran"] is True


def test_check_counts_a_lint_failure_and_a_missing_expression(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    bound = _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6", "J6:J15")
    bound["data"].pop("expr")
    bound["data"]["lang"] = "sheets"
    bound["data"]["original"] = "=I6-H6"
    bound["statement"] = "ستون J6 منهای ستون I6 است"      # §5.2: a reference token
    _apply(root, [_template(), bound], "1")
    report = check(root)
    assert report["expr_missing"] == 1
    assert report["lint_failures"] == 1


def test_audit_persian_renders_every_code_from_the_entrys_title(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))
    items = audit(root, persian=True)
    assert items
    for item in items:
        assert "F-" not in item["message"] and "/" not in item["message"]
        entry = [e for e in load_store(root)["rule"]["entries"]
                 if e["id"] == item["id"]]
        if entry:
            assert entry[0]["title"] in item["message"]
    codes = {i["code"] for i in audit_mod.AUDIT_CHECKS and audit(root)}
    assert codes <= set(PERSIAN)                    # every code has a template
```

Rewrite the CLI test (lines 570-590):

```python
def test_cli_audit_and_check_print_one_line_each_and_exit_zero(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _manifest(root, [_workbook("S1", "cited_wb"), _workbook("S2", "quiet_wb")])
    _cite(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))

    proc = _cli(root, "audit")
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.splitlines()
    assert lines and any(line.startswith("unconsumed_constant F-") for line in lines)

    proc = _cli(root, "audit", "--persian")
    assert proc.returncode == 0, proc.stderr
    assert all("F-" not in line.split(" ", 2)[2] for line in
               proc.stdout.splitlines())

    proc = _cli(root, "check")
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.splitlines()
    assert lines[-1] == ("readiness: units_done=True review_ran=False "
                         "lint_failures=0 expr_missing=0 open_disputes=0")
    assert any(line.startswith("uncited_workbook  ") for line in lines)  # id blank


def test_cli_has_no_repair_foreign_keys_verb(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    proc = _cli(root, "repair-foreign-keys", "--run", str(_run_dir(root, "9")))
    assert proc.returncode == 2 and "invalid choice" in proc.stderr
```

In `engine/tests/test_merge_facts_verbs.py`, delete lines 73-157 (the whole `repair-foreign-keys` block, from the `# --- repair-foreign-keys` banner through `test_repair_leaves_the_store_passing_the_pass_that_refused_it`, including `_with_foreign_keys`, `_IMPORT_DESCRIPTOR` and `_REAL_KEY`), change the import at lines 7-8 to `from merge_facts.verbs import (export, promote, repair_source_refs, resolve, retire)`, and append:

```python
def test_resolving_a_unit_clears_the_stale_unit_ref_beside_it(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol"); a["entries"][0]["data"]["outputs"][0]["unit"] = "g"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    b = _const_delta(5, key="tol"); b["entries"][0]["data"]["outputs"][0]["unit"] = "kg"
    apply(root, _write(root, "b.json", b), _run_dir(root, "2"))
    store = load_store(root)
    entry = [e for e in store["rule"]["entries"] if e["key"] == "tol"][0]
    entry["data"]["outputs"][0]["unit_ref"] = {"ref": "F-00001", "row": "g"}
    (root / "facts" / "rules.json").write_text(
        json.dumps(store["rule"], ensure_ascii=False), encoding="utf-8")
    chosen = [x for x in entry["accounts"] if x["value"] == "kg"][0]
    resolve(root, entry["id"], "data/outputs/v/unit", chosen["id"],
            _run_dir(root, "3"))
    after = [e for e in load_store(root)["rule"]["entries"]
             if e["key"] == "tol"][0]["data"]["outputs"][0]
    assert after["unit"] == "kg" and "unit_ref" not in after
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest engine/tests/test_merge_facts_audit.py engine/tests/test_merge_facts_verbs.py -q`
Expected: FAIL — `ImportError: cannot import name 'PERSIAN' from 'merge_facts.audit'`.

- [ ] **Step 3: `audit --persian` and the readiness `check`**

In `engine/merge_facts/audit.py`, add the import `check` needs beside the others (line 36) — `from merge_facts.apply import _unit_row_keys` on the existing `merge_facts.apply` import line, and `from merge_facts.content import lint_prose` after it — then replace `audit` (lines 812-822):

```python
#: One Persian sentence per finding kind (§2.1 stage C). The playbook prints
#: these and nothing else — the owner never sees a code, an id, a path or a
#: column letter, and the coordinator composes no prose of its own (QF-54).
PERSIAN = {
    "two_writers": "دو قاعده روی یک ستون کار می‌کنند: «{title}»",
    "duplicate_title": "عنوان تکراری: «{title}»",
    "note_overlap": "یادداشت‌های هم‌شکل: «{title}»",
    "equal_expr": "دو قاعده یک محاسبه را می‌گویند: «{title}»",
    "duplicate_code": "یک کد برای دو قلم: «{title}»",
    "edge_disagreement": "برای یک نمونه دو پاسخ آمده است: «{title}»",
    "orphan_ref": "ارجاع بی‌مقصد: «{title}»",
    "dangling_ref_items": "ارجاع به قلمی که دیگر نیست: «{title}»",
    "process_link": "پیوند با فرایندی که تغییر کرده است: «{title}»",
    "row_gone": "ردیفی که دیگر در فایل نیست: «{title}»",
    "dump_missing": "فایل این جدول هنوز خوانده نشده است: «{title}»",
    "binding_gone": "فرمولی که دیگر در فایل نیست: «{title}»",
    "expr_missing": "قاعده‌ای که محاسبه‌اش نوشته نشده است: «{title}»",
    "retired_row_live_edges": "ردیف بازنشسته که هنوز خوانده می‌شود: «{title}»",
    "template_drift": "نمونه‌ای که از الگویش فاصله گرفته است: «{title}»",
    "reconciliation": "عدد جدول با عدد قاعده نمی‌خواند: «{title}»",
    "component_sum": "جمع سهم‌ها یک نمی‌شود: «{title}»",
    "unconsumed_constant": "عددی که هیچ قاعده‌ای آن را نمی‌خواند: «{title}»",
    "no_consumer": "قلمی که هیچ‌جا استفاده نشده است: «{title}»",
    "quantity_off_enum": "نوع کمیت شناخته نیست: «{title}»",
    "note_targets_retired": "یادداشتی دربارهٔ مورد بازنشسته: «{title}»",
    "import_unresolved": "ورودی از فایلی که هنوز خوانده نشده است: «{title}»",
    "stale_prose": "شرح با مقدار تعیین‌شده نمی‌خواند: «{title}»",
    "stale_stub": "فایلی که هیچ‌وقت خوانده نشد: «{title}»",
    "natural_key_dup": "یک کلید برای دو مورد: «{title}»",
    "scope_shadow": "همین کلید در دامنهٔ عمومی هم هست: «{title}»",
    "unknown_role": "نقشی که در فرایندها نیامده است: «{title}»",
    "source_moved": "پروندهٔ استنادشده عوض شده است: «{title}»",
    "estate_absent": "پروندهٔ اکسل روی این دستگاه نیست: «{title}»",
    "uncited_workbook": "فایلی که هیچ جدولی از آن خوانده نشده است: «{title}»",
}


def audit(root, persian=False):
    """§12's `audit` row, every check of it, over one read of the store.

    `persian=True` re-renders each finding for stage C from the entry's own
    title and the finding's kind — the message a code has no template for falls
    back to the title alone, which is still owner-safe."""
    walk = _Walk(pathlib.Path(root), load_store(root))
    items = []
    for check_fn in AUDIT_CHECKS:
        items.extend(check_fn(walk))
    items = _sorted(items)
    if persian:
        for item in items:
            title = (walk.by_id.get(item["id"]) or {}).get("title") or "—"
            item["message"] = PERSIAN.get(item["code"],
                                          "بررسی لازم است: «{title}»").format(
                title=title)
    return items
```

Then replace `coverage` and `check` (lines 845-905) with the readiness dict:

```python
def _latest_runs(root):
    """The newest run directory of every department under `runs/facts/` — the
    run whose units and review answer QF-44 (v3)."""
    base = root / "runs" / "facts"
    out = []
    if not base.is_dir():
        return out
    for department in sorted(p for p in base.iterdir() if p.is_dir()):
        stamps = sorted(p for p in department.iterdir() if p.is_dir())
        if stamps:
            out.append(stamps[-1])
    return out


def _run_units(run_dir):
    try:
        return read_json(run_dir / "meta.json").get("units") or []
    except (OSError, ValueError):
        return []


def _lint_failures(walk):
    """Entries whose own prose fails §5.2's lint, counted per ENTRY — QF-44
    (v3) asks that no entry carries a failure, not how many words each one
    broke. «ستون», «تب» and «سلول» are allowed in a record's own statement
    (QF-50), so records are linted with the sheet words admitted."""
    exemptions = _unit_row_keys(walk.store, [])
    failing = 0
    for entry in walk.open:
        problems = lint_prose(entry.get("title") or "", exemptions=exemptions)
        problems += lint_prose(entry.get("statement") or "",
                               exemptions=exemptions,
                               allow_sheet_words=entry["kind"] == "record")
        if problems:
            failing += 1
    return failing


def check(root):
    """§12's `check` row and QF-44 (v3)'s readiness in one dict.

    `findings` is what it always was — the citations that moved, the estate
    files that are not here, the manifest workbooks nothing has read. Beside it
    are the five readiness answers. The workbook-coverage metric is withdrawn
    (§4): a department is ready when its units are done, its review has run,
    and nothing is lint-failing, expression-less or still disputed — none of
    which a denominator over the manifest ever measured.

    With no run directory at all both `units_done` and `review_ran` answer over
    an empty set, so they are vacuously true and false respectively: nothing is
    pending, and no review has run.
    """
    root = pathlib.Path(root)
    store = load_store(root)
    walk = _Walk(root, store)
    items, absent = [], {}
    for entry in walk.open:
        for source in entry.get("source") or []:
            ref = source.get("ref")
            if not isinstance(ref, str) or not ref:
                continue                      # a `chat` source cites no file
            path = root / ref
            if not path.is_file():
                if _is_estate(ref):
                    absent.setdefault(ref, set()).add(entry["id"])
                else:
                    items.append(_finding("source_moved", entry["id"],
                                          f"{ref} is no longer on disk"))
                continue
            held = source.get("hash")
            if held and sha256_file(path) != held:
                items.append(_finding(
                    "source_moved", entry["id"],
                    f"{ref} has changed since it was cited "
                    f"({held[:19]}… on record)"))
    for ref, ids in absent.items():
        items.append(_finding(
            "estate_absent", sorted(ids)[0],
            f"{ref} is not present (QF-28 keeps the workbooks out of git); "
            f"cited by {', '.join(sorted(ids))}"))
    cited = _cited_workbooks(store)
    for workbook in _manifest(root).get("workbooks") or []:
        if not isinstance(workbook, dict):
            continue
        spreadsheet = workbook.get("spreadsheetId")
        if not spreadsheet or spreadsheet in cited:
            continue
        items.append(_finding(
            "uncited_workbook", None,
            f"workbook {workbook.get('short') or spreadsheet} "
            f"({spreadsheet}) is cited by no non-stub record"))
    runs = _latest_runs(root)
    units = [u for run in runs for u in _run_units(run)]
    return {"findings": _sorted(items),
            "units_done": all(u.get("state") == "done" for u in units),
            "review_ran": all((run / "review" / "out.json").is_file()
                              for run in runs) if runs else False,
            "lint_failures": _lint_failures(walk),
            "expr_missing": len(_expr_missing(walk)),
            "open_disputes": sum(len(open_accounts(e)) for e in walk.open)}
```

- [ ] **Step 4: `resolve` clears the stale `unit_ref`; `repair-foreign-keys` retires**

In `engine/merge_facts/verbs.py`: change the module docstring's first line to
`"""`merge facts resolve|retire|promote|export|repair-source-refs` — the verbs`
and its second paragraph to name one repair verb:

```python
The one `repair-*` verb takes no entry id, and it exists for one reason: §11's
ladder can only create, fill, dispute, append and union. It cannot rewrite a
value in place (`repair-source-refs` — a corrected `ref` is a different member
of a union field, so a delta would add a second citation beside the broken
one). QF-2 leaves `merge facts` the only thing allowed to write `facts/**` at
all, so what a delta cannot express has to be a verb or nothing.
```

Change the imports (lines 47-65) — `get_path` in, `foreign_key_declares_a_join` out:

```python
from merge_facts import (
    KIND_FILES,
    KIND_ORDER,
    derive_status,
    get_path,
    is_open,
    load_store,
    save_store,
    set_path,
)
```
```python
from merge_facts.apply import KEY_RE, _snapshot, _today_jalali
from merge_facts.audit import _manifest
```

Add the helper above `resolve` (line 118) and call it from `resolve`:

```python
def _clear_unit_ref(entry, field, chosen):
    """§4: resolving a `unit` leaf drops the `unit_ref` written beside it —
    unless the chosen account names one itself (its value is a `{ref}` rather
    than a symbol). The pair is written together, so a settled symbol left
    sitting next to the ref of the reading that lost is worse than no ref."""
    if field.rsplit("/", 1)[-1] != "unit" or "/" not in field:
        return
    if isinstance(chosen.get("value"), dict) and chosen["value"].get("ref"):
        return
    holder = get_path(entry, field.rsplit("/", 1)[0])
    if isinstance(holder, dict):
        holder.pop("unit_ref", None)
```

```python
    set_path(entry, field, chosen.get("value"))
    _clear_unit_ref(entry, field, chosen)
    entry["status"] = derive_status(entry)
```

Delete `repair_foreign_keys` (lines 224-280) and, in `repair_source_refs`'s docstring (line 323), replace `A verb for `repair-foreign-keys`' reasons:` with `A verb for the reason above:`.

- [ ] **Step 5: The CLI**

In `engine/merge/cli.py`: drop the two dead imports (lines 12 and 16) —
`from merge_facts.audit import coverage as facts_coverage` and
`from merge_facts.verbs import repair_foreign_keys as repair_facts_foreign_keys` —
delete the `repair-foreign-keys` branch (lines 125-129) and its parser (lines
220-221), and rewrite the reporting branch (lines 148-159):

```python
        elif args.facts_cmd in ("audit", "check"):
            root = data_root()
            report = None
            if args.facts_cmd == "audit":
                findings = audit_facts(root, persian=args.persian)
            else:
                report = check_facts(root)
                findings = report["findings"]
            for item in findings:
                print(f"{item['code']} {item['id'] or ''} {item['message']}")
            if report is not None:
                # last stdout line, verbatim — QF-44 (v3)'s readiness, with no
                # workbook denominator; the ui-backend re-serves it in Persian
                print("readiness: " + " ".join(
                    f"{name}={report[name]}" for name in
                    ("units_done", "review_ran", "lint_failures",
                     "expr_missing", "open_disputes")))
```

and the parsers (lines 230-231):

```python
    for verb in ("audit", "check"):
        rep = fsub.add_parser(verb)    # reporting: no --run, nothing written
        if verb == "audit":
            rep.add_argument("--persian", action="store_true")
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_merge_facts_audit.py engine/tests/test_merge_facts_verbs.py engine/tests/test_merge_cli.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/merge_facts/audit.py engine/merge_facts/verbs.py \
        engine/merge/cli.py engine/tests/test_merge_facts_audit.py \
        engine/tests/test_merge_facts_verbs.py
git commit -m "$(cat <<'EOF'
feat(facts): check reports QF-44 (v3) readiness; audit --persian; repair-foreign-keys retired

check returns findings plus units_done, review_ran, lint_failures, expr_missing
and open_disputes, and the workbook-coverage metric is gone. audit(persian=True)
renders every finding from the entry's title. resolve clears a stale unit_ref
on a unit resolve. repair-foreign-keys goes with record.foreignKeys — the verb,
its CLI wiring and its tests.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```


## Phase 2 — facts-plan

### Task 9: `facts_plan` package skeleton and the formula normaliser

**Read first (context for an implementer new to this repo):**
`docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md` §2.3 (the rule-column row of the candidate table, steps (a)–(f)) and §4 (the `facts-plan` row); `engine/dump_workbook/__init__.py:149-156` (`normalise_rows` — why every A1 row number in `formulas.tsv` is already an `N`) and `:215-232` (`_cell`/`_tsv` — why a formula arrives with `\n` and `\t` as two-character escapes); `engine/merge_facts/__init__.py:1-25` (house style: module docstring says *why*, constants at the top); one real dump, `../data-repo/attachments/sheets/.dump/1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s/formulas.tsv` (the `پیتزا` rows carry every shape this task normalises).

**Files:**
- Create: `engine/facts_plan/__init__.py`
- Create: `engine/facts_plan/build.py`
- Create: `engine/facts_plan/assemble.py`
- Create: `engine/facts_plan/cli.py`
- Modify: `engine/pyproject.toml:16-27` (add the `facts-plan` console script and `facts_plan*` to the packages-find include list)
- Test: `engine/tests/test_facts_plan_shape.py`

**Interfaces:**
- Consumes: `engine_common.data_root` (existing, `engine/engine_common/__init__.py:9`).
- Produces (later tasks import these by name):
  - `facts_plan.build.Shape` — `namedtuple("Shape", "text params functions refs")`; `text` is the normalised body, `params` the object §2.5 stores under `applies_to[].params`, `functions` a `frozenset` of called function names, `refs` the reference locators in occurrence order (`refs[i]` is the value of `params["ref_<i+1>"]`).
  - `facts_plan.build.normalise(formula, *, table_refs) -> Shape` — steps (a)–(f) of §2.3. `table_refs` maps a `Table_*` name to the value to record for its `$T` parameter (`{"ref": "S-rec-…"}` when the name resolves to a template of this run); a name absent from it records `{"table": "<name>"}`. A reference records a **locator** — `{"cell": "JN"}` or `{"cell": "CN", "sheet": "تاریخ"}` — and Task 11 rewrites the resolvable ones to `{"ref", "field"}`.
  - `facts_plan.build.is_bare_reference(shape_text) -> bool`
  - `facts_plan.build.estimate_tokens(text) -> int`
  - `facts_plan.cli.main(argv=None) -> int` — the `facts-plan` entry point; a verb whose function has not landed yet exits 2 with one line.
  - `facts_plan.assemble` — the module later tasks put `digest`, `assemble`, `report` and `validate_unit` in.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_facts_plan_shape.py`:

```python
"""The §2.3 normaliser on the shapes the estate actually holds.

Every formula below is copied out of
`attachments/sheets/.dump/1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s/
formulas.tsv` (the `گزارش مرکزی` report book), with its `\\n` escapes intact —
that is the text `build` reads, so that is the text the normaliser is tested on.
"""
import pytest

from facts_plan.build import Shape, estimate_tokens, is_bare_reference, normalise
from facts_plan.cli import main

TOLERANCE_PER_FOOD = (
    r"LET(\ntolerancePerFoodGr, 5,\ntelorancKg, CONVERT_GR_TO_KG(KN * "
    r"tolerancePerFoodGr),\nMINUS(JN , telorancKg)\n)")
TOLERANCE_PER_KG = (
    r"LET(\ntolerancePerKilogramGr, 140,\nteloranc, MULTIPLY("
    r"tolerancePerKilogramGr,IN),\ntelorancKg, CONVERT_GR_TO_KG(teloranc),"
    r"\nMINUS(JN , telorancKg)\n)")
ACTUAL_USE = (
    r'LET(\ningredientId, 1,\namFoodIds, {71, 309, 74},\namTotal, '
    r'getTotalFoodsIngredient(amFoodIds,ingredientId,americanPizzaSalesData,'
    r'"Table_Ingredients_AmericanPizza",Refresher),\nCONVERT_GR_TO_KG(amTotal)\n)')


def test_shape_is_the_named_tuple():
    shape = normalise("MINUS(IN,HN)", table_refs={})
    assert isinstance(shape, Shape)
    assert shape.text == "MINUS(@,@)"


def test_escaped_newlines_equal_the_one_line_form():
    one_line = ("LET(tolerancePerFoodGr, 5, telorancKg, "
                "CONVERT_GR_TO_KG(KN * tolerancePerFoodGr), "
                "MINUS(JN , telorancKg))")
    assert (normalise(TOLERANCE_PER_FOOD, table_refs={}).text
            == normalise(one_line, table_refs={}).text)


def test_spacing_around_an_operator_is_not_a_shape():
    assert (normalise("A1-B1", table_refs={}).text
            == normalise("A1 - B1", table_refs={}).text == "@-@")


def test_let_locals_are_renamed_and_lend_their_names_to_literals():
    shape = normalise(TOLERANCE_PER_FOOD, table_refs={})
    assert shape.text == "LET(v1,#,v2,CONVERT_GR_TO_KG(@*v1),MINUS(@,v2))"
    assert shape.params["tolerancePerFoodGr"] == 5
    assert shape.params["ref_1"] == {"cell": "KN"}
    assert shape.params["ref_2"] == {"cell": "JN"}
    assert shape.refs == [{"cell": "KN"}, {"cell": "JN"}]


def test_the_two_tolerance_forms_are_two_shapes_with_their_own_keys():
    per_kg = normalise(TOLERANCE_PER_KG, table_refs={})
    assert per_kg.text == "LET(v1,#,v2,MULTIPLY(v1,@),v3,CONVERT_GR_TO_KG(v2),MINUS(@,v3))"
    assert per_kg.params["tolerancePerKilogramGr"] == 140
    assert per_kg.params["ref_1"] == {"cell": "IN"}
    assert per_kg.text != normalise(TOLERANCE_PER_FOOD, table_refs={}).text


def test_brace_array_collapses_and_keeps_its_members():
    shape = normalise(ACTUAL_USE, table_refs={})
    assert shape.text == ("LET(v1,#,v2,{#},v3,getTotalFoodsIngredient("
                          "v2,v1,americanPizzaSalesData,$T,Refresher),"
                          "CONVERT_GR_TO_KG(v3))")
    assert shape.params["amFoodIds"] == [71, 309, 74]
    assert shape.params["ingredientId"] == 1


def test_a_quoted_table_name_is_a_table_parameter():
    shape = normalise(ACTUAL_USE, table_refs={
        "Table_Ingredients_AmericanPizza": {"ref": "S-rec-0123456789ab"}})
    assert shape.params["table_1"] == {"ref": "S-rec-0123456789ab"}


def test_a_bare_table_name_is_a_table_parameter():
    shape = normalise("GET_ROW_BY_PERSIAN_DATE(BN,CN,DN,Table_Pizza_First)",
                      table_refs={})
    assert shape.text == "GET_ROW_BY_PERSIAN_DATE(@,@,@,$T)"
    assert shape.params["table_1"] == {"table": "Table_Pizza_First"}
    assert shape.functions == frozenset({"GET_ROW_BY_PERSIAN_DATE"})


@pytest.mark.parametrize("formula, text", [
    ("ROUND(DIVIDE(LN,KN),3)", "ROUND(DIVIDE(@,@),#)"),
    ("MIN(AN,BN)", "MIN(@,@)"),
    ("CONVERT_GR_TO_KG(KN)", "CONVERT_GR_TO_KG(@)"),
])
def test_guarded_function_names_survive(formula, text):
    assert normalise(formula, table_refs={}).text == text


def test_the_n_row_form_of_a_shared_group():
    shape = normalise("MINUS(SUM(FN,EN),GN)", table_refs={})
    assert shape.text == "MINUS(SUM(@,@),@)"
    assert list(shape.params) == ["ref_1", "ref_2", "ref_3"]


def test_an_unnamed_literal_takes_a_positional_key():
    assert normalise("ROUND(DIVIDE(LN,KN),3)", table_refs={}).params["p1"] == 3


def test_bare_references():
    assert is_bare_reference(normalise(r"'تاریخ'!CN", table_refs={}).text)
    assert is_bare_reference("@") and is_bare_reference("'تاریخ'!@")
    assert not is_bare_reference("MINUS(@,@)")


def test_a_sheet_qualified_reference_keeps_its_sheet_in_the_locator():
    shape = normalise(r"'تاریخ'!CN", table_refs={})
    assert shape.params["ref_1"] == {"cell": "CN", "sheet": "تاریخ"}


def test_estimate_tokens_counts_persian_dearer():
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("سلام") == 3


def test_cli_reports_an_unlanded_verb_instead_of_a_traceback(capsys):
    assert main(["status", "--run", "runs/facts/cooking/x"]) == 2
    assert "not implemented" in capsys.readouterr().err
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "…/code-repo" && .venv/bin/pytest engine/tests/test_facts_plan_shape.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'facts_plan'`

- [ ] **Step 3: Write minimal implementation**

Create `engine/facts_plan/__init__.py`:

```python
"""`facts-plan` — the deterministic half of the facts pipeline (spec §2.3–§2.7).

`build` reads the dumps and writes candidates with every mechanical field
already filled (QF-46); `assemble` folds the units' decisions back into the one
delta `merge facts apply` understands. Nothing here writes to the store, and
nothing here asks a model anything.

`facts_plan` imports `merge_facts`; never the reverse.
"""
from facts_plan.assemble import validate_unit  # noqa: F401  (`validate facts-unit`)
```

Create `engine/facts_plan/build.py`:

```python
"""`facts-plan build` — candidates, the plan and the units' inputs (§2.3).

The formula normaliser lives here and is private to `build` by the spec's
wording; it is module-level rather than nested so its own tests can reach it.

What it is for: two cells that compute the same thing in different books must
land on the same *shape*, and everything that differs between them — a
tolerance of 5 or 140, the column the tolerance multiplies, the food-id set —
must come out as a **parameter**, so one concept is one entry with many
bindings (QF-47) instead of one entry per cell.
"""
import collections
import math
import re

Shape = collections.namedtuple("Shape", "text params functions refs")

# A string literal, Google's doubled-quote escaping included. Every step below
# is a regex over formula *syntax*, so literals are masked out of the way first
# and put back last — a Persian caption in quotes is not syntax.
_LITERAL = re.compile(r'"(?:[^"]|"")*"')
_MASK = re.compile("\x00([0-9]+)\x00")      # a masked literal
_SLOT = re.compile("\x02([0-9]+)\x02")      # a recorded parameter
_WS = re.compile(r"\s+")
_LET = re.compile(r"(?<![A-Za-z0-9_])LET\(")
_FUNC = re.compile(r"(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\(")
# (d) An A1 reference with an optional `'sheet'!`. The row part is `N` because
# `dump-workbook.normalise_rows` already folded a shared group's row numbers.
# The two guards are what keep `MIN(`, `ROUND(` and `CONVERT_GR_TO_KG` whole:
# the lookahead refuses a `(` after the match (so `MIN` in `MIN(` is not a
# reference) and the lookbehind refuses a letter, digit or `_` before it (so the
# `GR` in `CONVERT_GR_TO_KG` is not one either).
_REF = re.compile(
    r"(?:'[^']*'!)?(?<![A-Za-z0-9_$])\$?[A-Z]{1,3}\$?(?:N|[0-9]{1,5})"
    r"(?![A-Za-z0-9_(])(?::\$?[A-Z]{1,3}\$?(?:N|[0-9]{1,5}))?")
_TABLE = re.compile(r"(?<![A-Za-z0-9_])Table_[A-Za-z0-9_]+")
_ARRAY = re.compile(r"\{[^{}]*\}")
_NUMBER = re.compile(r"(?<![A-Za-z0-9_.$\x00\x02])[0-9]+(?:\.[0-9]+)?"
                     r"(?![A-Za-z0-9_.\x00\x02])")
_NUMERIC = re.compile(r"^[0-9]+(?:\.[0-9]+)?$")
_BARE_REF = re.compile(r"'[^']*'!@")


def estimate_tokens(text):
    """§2.3's budget arithmetic: `ascii/4 + non_ascii/1.5`, rounded up."""
    ascii_n = sum(1 for ch in text if ord(ch) < 128)
    return math.ceil(ascii_n / 4 + (len(text) - ascii_n) / 1.5)


def is_bare_reference(shape_text):
    """A cell that only reads another cell computes nothing (§2.3)."""
    return shape_text == "@" or bool(_BARE_REF.fullmatch(shape_text))


def _args(text, i):
    """The spans of the top-level arguments of the call whose `(` is at `i`.
    Literals are already masked, so nothing here has to know about quotes."""
    depth, start, spans = 0, i + 1, []
    for k in range(i, len(text)):
        ch = text[k]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                spans.append((start, k))
                return spans
        elif ch == "," and depth == 1:
            spans.append((start, k))
            start = k + 1
    return spans


def _apply_edits(text, edits):
    """`(start, end, replacement)` triples applied in one left-to-right pass, so
    no edit has to know how much the ones before it moved."""
    out, cut = [], 0
    for start, end, replacement in sorted(edits):
        out.append(text[cut:start])
        out.append(replacement)
        cut = end
    out.append(text[cut:])
    return "".join(out)


def _number(text):
    return float(text) if "." in text else int(text)


def _members(array_text):
    return [_number(p) if _NUMERIC.match(p) else p
            for p in array_text[1:-1].split(",") if p]


def _locator(ref):
    sheet, _, cell = ref.rpartition("!")
    locator = {"cell": cell.replace("$", "")}
    if sheet:
        locator["sheet"] = sheet.strip("'")
    return locator


def _let_rename(text, slot):
    """(b) LET locals become `v1..vn` in binding order, and a local that binds a
    numeric or brace literal lends that literal its own name as the parameter
    key — `tolerancePerFoodGr, 5` is the whole reason a tolerance is readable
    at Gate B without anyone typing it (§2.5).

    A local bound to a *string* is renamed but records nothing: a sheet name is
    not a quantity, and §2.5's parameter table has no place to put one.
    """
    names = []
    for m in _LET.finditer(text):
        args = _args(text, m.end() - 1)
        for k in range(0, len(args) - 1, 2):
            names.append(text[args[k][0]:args[k][1]])
    if not names:
        return text
    alias = {}
    for i, name in enumerate(names, 1):
        alias.setdefault(name, f"v{i}")
    edits = [(m.start(), m.end(), a)
             for name, a in alias.items()
             for m in re.finditer(r"(?<![A-Za-z0-9_])" + re.escape(name)
                                  + r"(?![A-Za-z0-9_])", text)]
    text = _apply_edits(text, edits)
    back = {a: name for name, a in alias.items()}
    edits = []
    for m in _LET.finditer(text):
        args = _args(text, m.end() - 1)
        for k in range(0, len(args) - 1, 2):
            key = back.get(text[args[k][0]:args[k][1]])
            start, end = args[k + 1]
            value = text[start:end]
            if _NUMERIC.match(value):
                edits.append((start, end, slot("#", _number(value), key)))
            elif value.startswith("{") and value.endswith("}"):
                edits.append((start, end, slot("{#}", _members(value), key)))
    return _apply_edits(text, edits)


def normalise(formula, *, table_refs):
    """§2.3 steps (a)–(f) over one `formulas.tsv` cell.

    `table_refs` maps a `Table_*` name to what its `$T` parameter should record
    — `{"ref": "S-rec-…"}` when the name resolves to a template of this run. A
    reference records a locator; Task 11 resolves the ones that point at a
    column of a template in this run into `{"ref", "field"}`.
    """
    # (a) the dump's escapes, then every whitespace character outside a literal.
    # ponytail: `_cell` also doubles a real backslash, so a formula holding a
    # literal `\n` would lose it here. No cell in the 28-workbook estate does.
    text = formula.replace("\\n", " ").replace("\\t", " ")
    literals = []

    def mask(m):
        literals.append(m.group(0))
        return "\x00%d\x00" % (len(literals) - 1)

    text = _WS.sub("", _LITERAL.sub(mask, text))
    functions = frozenset(m.group(1) for m in _FUNC.finditer(text))
    slots = []

    def slot(symbol, value, key=None):
        slots.append((symbol, value, key))
        return "\x02%d\x02" % (len(slots) - 1)

    text = _let_rename(text, slot)                                       # (b)
    text = _ARRAY.sub(lambda m: slot("{#}", _members(m.group(0))), text)  # (c)
    text = _REF.sub(lambda m: slot("@", _locator(m.group(0))), text)      # (d)
    text = _TABLE.sub(lambda m: slot("$T", table_refs.get(               # (e)
        m.group(0), {"table": m.group(0)})), text)

    def quoted_table(m):
        body = literals[int(m.group(1))][1:-1]
        if not body.startswith("Table_"):
            return m.group(0)
        return slot("$T", table_refs.get(body, {"table": body}))

    text = _MASK.sub(quoted_table, text)                                 # (e)
    text = _NUMBER.sub(lambda m: slot("#", _number(m.group(0))), text)   # (f)
    text = _MASK.sub(lambda m: literals[int(m.group(1))], text)

    # Keys are minted in text order, so `ref_1` is the left-most reference
    # whatever order the passes above ran in.
    params, counters, refs = {}, {"ref": 0, "table": 0, "p": 0}, []

    def mint(m):
        symbol, value, key = slots[int(m.group(1))]
        if key is None:
            prefix = {"@": "ref", "$T": "table"}.get(symbol, "p")
            counters[prefix] += 1
            key = (f"p{counters['p']}" if prefix == "p"
                   else f"{prefix}_{counters[prefix]}")
        params[key] = value
        if symbol == "@":
            refs.append(value)
        return symbol

    return Shape(_SLOT.sub(mint, text), params, functions, refs)
```

Create `engine/facts_plan/assemble.py`:

```python
"""`facts-plan digest | assemble | report` (§2.6, §2.7).

The verbs land here as the tasks that implement them do; `cli.py` reports a
verb whose function is not here yet rather than failing to import.
"""
```

Create `engine/facts_plan/cli.py`:

```python
"""The `facts-plan` entry point (§2.1's stage table names every verb).

The parser lives here and the verb bodies live in `build.py` and
`assemble.py`, so an unlanded verb exits 2 with one line instead of leaving a
console script that cannot be installed.
"""
import argparse
import importlib
import json
import pathlib
import sys

from engine_common import data_root

VERBS = {"build": ("facts_plan.build", "build"),
         "digest": ("facts_plan.assemble", "digest"),
         "assemble": ("facts_plan.assemble", "assemble"),
         "report": ("facts_plan.assemble", "report"),
         "status": ("facts_plan.cli", "status")}


def _parser():
    parser = argparse.ArgumentParser(prog="facts-plan")
    sub = parser.add_subparsers(dest="verb", required=True)
    build = sub.add_parser("build")
    build.add_argument("department")
    build.add_argument("--run", required=True)
    build.add_argument("--recordings", default="")
    build.add_argument("--rebuild", action="store_true")
    for name in ("digest", "assemble", "report", "status"):
        verb = sub.add_parser(name)
        verb.add_argument("--run", required=True)
    sub.choices["assemble"].add_argument("--review", action="store_true")
    sub.choices["status"].add_argument("--new-turn", action="store_true")
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    module, name = VERBS[args.verb]
    verb = getattr(importlib.import_module(module), name, None)
    if verb is None:
        print(f"facts-plan {args.verb}: not implemented in this build",
              file=sys.stderr)
        return 2
    root, run = data_root(), pathlib.Path(args.run)
    if args.verb == "build":
        result = verb(root, args.department, run,
                      [r for r in args.recordings.split(",") if r],
                      rebuild=args.rebuild)
    elif args.verb == "assemble":
        result = verb(root, run, review=args.review)
    elif args.verb == "status":
        result = verb(root, run, new_turn=args.new_turn)
    else:
        result = verb(root, run)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True)
          if isinstance(result, dict) else result)
    return 0
```

Edit `engine/pyproject.toml` — add the console script after line 19 and the package to line 27:

```toml
[project.scripts]
allocate-id = "allocate_id.cli:main"
dump-workbook = "dump_workbook.cli:main"
extract-attachment = "extract_attachment.cli:main"
facts-plan = "facts_plan.cli:main"
layout = "layout.cli:main"
merge = "merge.cli:main"
order = "order.cli:main"
transcribe = "transcribe.cli:main"
validate = "validate.cli:main"

[tool.setuptools.packages.find]
include = ["engine_common*", "allocate_id*", "dump_workbook*", "extract_attachment*", "facts_plan*", "layout*", "merge*", "merge_facts*", "order*", "transcribe*", "validate*"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "…/code-repo" && .venv/bin/python -m pip install -e engine -q && .venv/bin/pytest engine/tests/test_facts_plan_shape.py -q`
Expected: PASS (16 passed). The reinstall is required once: the editable install maps top-level names one by one, so a new package is invisible without it.

- [ ] **Step 5: Commit**

```
git add engine/facts_plan/__init__.py engine/facts_plan/build.py \
        engine/facts_plan/assemble.py engine/facts_plan/cli.py \
        engine/pyproject.toml engine/tests/test_facts_plan_shape.py
git commit -m "$(cat <<'EOF'
feat(facts): facts_plan package and the §2.3 formula normaliser

One concept is one entry with many bindings (QF-47), so two cells that compute
the same thing must fold to the same shape and everything that differs between
them — a tolerance of 5 or 140, the column it multiplies, a food-id set — must
come out as a parameter. Verified over all 2,721 formulas in the frozen estate
dumps: no failures, 232 distinct shapes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 10: `build` — record templates, reference rows and items

**Read first:** spec §2.3 (the **record template**, **reference rows** and **item** rows of the candidate table, and the `issues` row of the engine-only table), §3.1 (the key table), §3.3 (`record.instances[]`, `fields[].columns`); `engine/dump_workbook/__init__.py:437-500` (`_head_grid`, `header_row`, `_codes` — what a `sheets.json` tab holds) and `:561-593` (`_reference_rows` — how `rows.tsv` names its columns and renames a repeated header to `<title>_2`); `engine/tests/fixtures/make_workbook.py:1-60` (the house style for a fixture builder: a module docstring saying which real artefact each shape was copied from, then data tables); `../data-repo/attachments/sheets/manifest.json` and one dump directory under `../data-repo/attachments/sheets/.dump/`.

Task 4 has already landed `sheets.json`'s `row_labels`, `dump_workbook.is_mirror_tab` and `dump_workbook.is_ids_tab`; this task consumes all three.

**Files:**
- Create: `engine/tests/fixtures/facts_plan/make_dump.py`
- Modify: `engine/facts_plan/build.py` (append after `normalise`)
- Test: `engine/tests/test_facts_plan_build.py`

**Interfaces:**
- Consumes: `facts_plan.build.Shape/normalise` (Task 9); `dump_workbook.is_mirror_tab(formulas_for_tab) -> bool`, `dump_workbook.is_ids_tab(name) -> bool` (Task 4); `engine_common.read_json`.
- Produces:
  - `make_dump.make_estate(root) -> pathlib.Path` — writes a five-workbook mini estate under `root/attachments/sheets/` and returns that directory.
  - `facts_plan.build.load_estate(root) -> dict` — `{spreadsheetId: {"row", "short", "sheets", "formulas", "rows", "names", "validations"}}`.
  - `facts_plan.build.fold(text) -> str`, `strip_branch(name) -> str`, `code_key(code) -> str`.
  - `facts_plan.build.template_signature(tab_name, head_row) -> tuple` — `(folded name, code tuple)`.
  - `facts_plan.build.header_notes(sheet) -> list[dict]` — `[{"column", "text"}]`.
  - `facts_plan.build.reference_rows(dump, sheet_name, header_row, fields) -> tuple[list, list, list]` — `(rows, primaryKey, issues)`.
  - `facts_plan.build.record_templates(estate, department) -> tuple[list, list, list]` — `(candidates, instances, issues)`. A candidate is `{"id", "kind", "unit": None, "payload", "render"}`: `payload` is the mechanical `data` subset of §2.5's right-hand column, `render` is what only `input.md` needs.
  - `facts_plan.build.item_candidates(estate, department, instances) -> list`.
  - `facts_plan.build.RUN_ONLY: frozenset`, `_issue(kind, **fields) -> dict`.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/fixtures/facts_plan/make_dump.py`:

```python
"""A five-workbook mini estate in the shape `facts-plan build` reads.

Not an `.xlsx` in sight: `build` reads *dumps*, so this writes the dump
directly — `manifest.json`, one `.dump/<spreadsheetId>/` per workbook, and the
one `.gs` the manifest names. Every shape here was copied from the real estate
so what the tests assert is what cooking actually contains:

* two branch twins of one tab (`گزارش مرکزی` and `گزارش ناهارخوران` hold the
  same `پیتزا`), which must become one template with two instances;
* an offset twin (`کانتر`'s two copies sit two columns apart), which must
  become one template whose `fields[].columns` differ per instance;
* two tabs in **one** spreadsheet whose names fold together, which must stay
  two templates;
* a code list that is a non-empty subset of another (`آمار`), which groups —
  beside one whose header carries no code at all, which does not;
* a reference tab (`مواد`, the BOM) with its rows and a blank cell;
* a mirror tab (one `IMPORT_FROM_SHEET` at A1) and an ids tab
  (`SheetsFileIDs`), which produce no template at all.
"""
import json
import pathlib
import re

DEPARTMENT = "cooking"
_CODE = re.compile(r"#{1,2}[0-9]+")

PITZA_HEAD = [
    ["", "", "", "", "", "", "", "", "", ""],
    ["", "تاریخ", "", "پیتزا\n(تمام وزن ها به کیلوگرم است)",
     "", "", "", "", "", ""],
    ["", "روز", "ماه", "", "", "", "", "", "", ""],
    ["", "29", "مرداد", "", "", "", "", "", "", ""],
    ["", "", "", "موجودی اول شب", "موجودی آخر شب", "مصرف اعلامی",
     "مصرف واقعی", "انحراف", "تعداد فروش", "انحراف (با تلورانس)"],
    ["پنیر پیتزا ##1", "", "", "0", "0", "0.05", "52.93", "52.88", "315", "51.305"],
    ["خمیر پیتزا ##26", "", "", "0", "0", "0.002", "4.175", "4.17", "45", "3.588"],
    ["سس گوجه ##33", "", "", "0", "0", "0.009", "8.72", "8.71", "116", "8.246"],
]
PITZA_LABELS = {"6": "پنیر پیتزا ##1", "7": "خمیر پیتزا ##26", "8": "سس گوجه ##33"}
ACTUAL_USE = (
    r'LET(\ningredientId, {id},\namFoodIds, {{71, 309}},\namTotal, '
    r'getTotalFoodsIngredient(amFoodIds,ingredientId,SalesData,'
    r'"Table_Ingredients_Pizza",Refresher),\nCONVERT_GR_TO_KG(amTotal)\n)')
TOLERANCE_PER_FOOD = (
    r"LET(\ntolerancePerFoodGr, 5,\ntelorancKg, CONVERT_GR_TO_KG(IN * "
    r"tolerancePerFoodGr),\nMINUS(HN , telorancKg)\n)")
TOLERANCE_PER_KG = (
    r"LET(\ntolerancePerKilogramGr, 140,\nteloranc, MULTIPLY("
    r"tolerancePerKilogramGr,GN),\ntelorancKg, CONVERT_GR_TO_KG(teloranc),"
    r"\nMINUS(HN , telorancKg)\n)")
MIRROR = (r'LET(\nsheetName, "مواد",\ndataRange,"A:D",'
          r'\nIMPORT_FROM_SHEET(SheetsFileId_Bom,sheetName,dataRange)\n)')

SCRIPT = """\
function getTotalFoodsIngredient(foodIds, ingredientId, salesData, namedRange) {
  var table = SpreadsheetApp.getActiveSpreadsheet()
      .getRangeByName(namedRange).getValues();
  var total = 0;
  for (var i = 0; i < foodIds.length; i++) { total = total + table[i][1]; }
  return total;
}

function getWeekDayCoefficient(day) {
  if (day == 5 || day == 6) { return 1.3; }
  return 1;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Actions').addToUi();
}
"""

# (short, spreadsheetId, dir, file, branches, reference_tabs, scripts)
WORKBOOKS = [
    ("mini_pitza_ch", "SPCH", "Mini__Pitza - Chalebagh", "Pitza - Chalebagh.xlsx",
     ["chalebagh"], [], ["Mini__Pitza - Chalebagh/Pitza - Chalebagh.gs"]),
    ("mini_pitza_nk", "SPNK", "Mini__Pitza - NaharKhoran",
     "Pitza - NaharKhoran.xlsx", ["naharkhoran"], [], []),
    ("mini_kanter_ch", "SKCH", "Mini__Kanter - Chalebagh",
     "Kanter - Chalebagh.xlsx", ["chalebagh"], [], []),
    ("mini_kanter_nk", "SKNK", "Mini__Kanter - NaharKhoran",
     "Kanter - NaharKhoran.xlsx", ["naharkhoran"], [], []),
    ("mini_bom", "SBOM", "Mini__Bom", "Bom.xlsx",
     ["chalebagh", "naharkhoran"], ["مواد"], []),
]

# spreadsheetId -> [(sheetId, name, head, header_row, row_labels)]
TABS = {
    "SPCH": [
        (1, "پیتزا", PITZA_HEAD, 5, PITZA_LABELS),
        (2, "Table_Bom", [["نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26",
                           "سس گوجه ##33"]], 1, None),
        (3, "SheetsFileIDs", [["Range Name Associated", "Sheets File Id"],
                              ["SheetsFileId_Bom", "SBOM"]], 1, None),
        (4, "شمارش چاله‌باغ", [["نام", "پنیر پیتزا میکس ##1"]], 1, None),
        (5, "شمارش ناهارخوران", [["نام", "پنیر پیتزا میکس ##1"]], 1, None),
    ],
    "SPNK": [(1, "پیتزا", PITZA_HEAD, 5, PITZA_LABELS)],
    "SKCH": [
        (1, "کانتر", [["نام", "موجودی اول شب", "موجودی آخر شب", "کسری"],
                      ["پنیر پیتزا ##1", "1", "1", "0"]], 1, None),
        (2, "آمار", [["نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26"]], 1, None),
    ],
    "SKNK": [
        (1, "کانتر", [["", "", "نام", "موجودی اول شب", "موجودی آخر شب", "کسری"],
                      ["", "", "پنیر پیتزا ##1", "1", "1", "0"]], 1, None),
        (2, "آمار", [["نام", "پنیر پیتزا ##1"]], 1, None),
    ],
    "SBOM": [
        (1, "مواد", [["نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26",
                      "سس گوجه ##33"]], 1, None),
        (2, "آمار", [["نام", "تعداد"]], 1, None),
    ],
}

# spreadsheetId -> formulas.tsv body rows (sheet, range, group, formula,
# count, cached, error)
FORMULAS = {
    "SPCH": [
        ["پیتزا", "B4", "", r"'تاریخ'!CN", 1, "29", ""],
        ["پیتزا", "C4", "", r"'تاریخ'!DN", 1, "مرداد", ""],
        ["پیتزا", "F6:F8", "1", "MINUS(DN,EN)", 3, "0.05", ""],
        ["پیتزا", "G6", "", ACTUAL_USE.format(id=1), 1, "52.93", ""],
        ["پیتزا", "G7", "", ACTUAL_USE.format(id=26), 1, "4.175", ""],
        ["پیتزا", "G8", "", ACTUAL_USE.format(id=33), 1, "8.72", ""],
        ["پیتزا", "H6:H8", "2", "MINUS(GN,FN)", 3, "52.88", ""],
        ["پیتزا", "J6", "", TOLERANCE_PER_FOOD, 1, "51.305", ""],
        ["پیتزا", "J7", "", TOLERANCE_PER_KG, 1, "3.588", ""],
        ["پیتزا", "J8", "", "HN", 1, "8.71", ""],
        ["Table_Bom", "A1", "", MIRROR, 1, "نام", ""],
    ],
    "SPNK": [
        ["پیتزا", "F6:F8", "1", "MINUS(DN,EN)", 3, "0.04", ""],
        ["پیتزا", "G6", "", ACTUAL_USE.format(id=1), 1, "40.1", ""],
        ["پیتزا", "H6:H8", "2", "MINUS(GN,FN)", 3, "39.9", ""],
        ["پیتزا", "J6", "", TOLERANCE_PER_FOOD, 1, "38.0", ""],
        ["پیتزا", "J7:J8", "3", "ROUND(DIVIDE(HN,IN),3)", 2, "#NUM!", "#NUM!"],
    ],
    "SKCH": [["کانتر", "D2:D2", "1", "MINUS(BN,CN)", 1, "0.1", ""]],
    "SKNK": [["کانتر", "F2:F2", "1", "MINUS(DN,EN)", 1, "0.2", "#NAME?"]],
    "SBOM": [],
}

# spreadsheetId -> (rows.tsv columns, rows)
ROWS = {
    "SPCH": (["sheet", "row", "Range Name Associated", "Sheets File Id"],
             [["SheetsFileIDs", 2, "SheetsFileId_Bom", "SBOM"]]),
    "SBOM": (["sheet", "row", "نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26",
              "سس گوجه ##33"],
             [["مواد", 2, "پیتزا آمریکایی #71", "215", "260", ""],
              ["مواد", 3, "پیتزا ایتالیایی #61", "180", "", "45"]]),
}

NAMES = {
    "SPCH": [["Table_Bom", "workbook", "Table_Bom!$A:$D"],
             ["SheetsFileId_Bom", "workbook", "SheetsFileIDs!$B$2"],
             ["CONVERT_GR_TO_KG", "workbook", "LAMBDA(weight, DIVIDE(weight,1000))"],
             ["IMPORT_FROM_SHEET", "workbook",
              'LAMBDA(id, name, range, IMPORTRANGE("https://x/" & id, '
              'name & "!" & range))']],
}

# The two twins disagree on one column's list, so the intersection is what the
# template keeps and the difference is a `cross_record` issue.
VALIDATIONS = {
    "SPCH": [["پیتزا", "I6:I8", "list", '"0,1,2"']],
    "SPNK": [["پیتزا", "I6:I8", "list", '"0,1"']],
}


def _tsv(path, header, rows):
    lines = ["\t".join(header)]
    lines += ["\t".join(str(v) for v in row) for row in rows]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _sheet(sheet_id, name, head, header_row, row_labels):
    width = max(len(r) for r in head)
    codes = []
    for row in head:
        for cell in row:
            codes += [c for c in _CODE.findall(cell) if c not in codes]
    sheet = {"sheetId": sheet_id, "name": name, "hidden": False,
             "dimension": f"A1:{chr(64 + width)}{len(head)}",
             "rows": len(head), "cols": width, "head": head,
             "header_row": header_row, "codes": codes, "empty": False}
    if row_labels:
        sheet["row_labels"] = row_labels
    return sheet


def make_estate(root):
    """Write the mini estate under `root/attachments/sheets/`."""
    sheets_root = pathlib.Path(root) / "attachments" / "sheets"
    workbooks = []
    for short, sid, directory, filename, branches, reference, scripts in WORKBOOKS:
        workbooks.append({"spreadsheetId": sid, "short": short,
                          "departments": [DEPARTMENT], "branches": branches,
                          "reference_tabs": reference, "confirmed": True,
                          "unresolved": [], "dir": directory, "file": filename,
                          "scripts": scripts})
        dump = sheets_root / ".dump" / sid
        dump.mkdir(parents=True, exist_ok=True)
        (dump / "sheets.json").write_text(json.dumps(
            {"schema_version": 1, "spreadsheetId": sid,
             "sheet_count": len(TABS[sid]),
             "sheets": [_sheet(*tab) for tab in TABS[sid]]},
            ensure_ascii=False), encoding="utf-8")
        _tsv(dump / "formulas.tsv",
             ["sheet", "range", "group", "formula", "count", "cached", "error"],
             FORMULAS[sid])
        _tsv(dump / "names.tsv", ["name", "scope", "formula"], NAMES.get(sid, []))
        _tsv(dump / "validations.tsv", ["sheet", "range", "type", "values"],
             VALIDATIONS.get(sid, []))
        if sid in ROWS:
            _tsv(dump / "rows.tsv", *ROWS[sid])
        for script in scripts:
            path = sheets_root / script
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(SCRIPT, encoding="utf-8")
    sheets_root.mkdir(parents=True, exist_ok=True)
    (sheets_root / "manifest.json").write_text(json.dumps(
        {"schema_version": 2,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"},
                      {"code": "naharkhoran", "name": "ناهارخوران"}],
         "workbooks": workbooks}, ensure_ascii=False), encoding="utf-8")
    return sheets_root
```

Create `engine/tests/test_facts_plan_build.py`:

```python
"""`facts-plan build`'s record templates, reference rows and items, over the
mini estate in `fixtures/facts_plan/make_dump.py`."""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent
                       / "fixtures" / "facts_plan"))
from make_dump import make_estate  # noqa: E402

from facts_plan.build import (code_key, header_notes, item_candidates,  # noqa: E402
                              load_estate, record_templates, reference_rows,
                              strip_branch, template_signature)


@pytest.fixture
def estate(tmp_path):
    make_estate(tmp_path)
    return load_estate(tmp_path)


def _by_sheet(candidates, sheet):
    return [c for c in candidates if c["render"]["sheet"] == sheet]


def test_signature_folds_the_branch_token_and_reads_the_header_codes():
    assert strip_branch("شمارش چاله‌باغ") == "شمارش"
    assert template_signature("کانتر ناهارخوران", ["نام", "کسری"]) == ("کانتر", ())
    assert template_signature("آمار", ["نام", "پنیر پیتزا ##1", "Column 3"]) \
        == ("آمار", ("##1",))


def test_two_branch_twins_are_one_template_with_two_instances(estate):
    candidates, instances, _ = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")
    assert len(pitza) == 1
    assert [i["key"] for i in pitza[0]["payload"]["instances"]] \
        == ["mini_pitza_ch__s1", "mini_pitza_nk__s1"]
    assert pitza[0]["payload"]["location"]["spreadsheetId"] == "SPCH"
    assert {i["branch"] for i in pitza[0]["payload"]["instances"]} \
        == {"chalebagh", "naharkhoran"}
    assert sum(1 for i in instances if i["template"] == pitza[0]["id"]) == 2


def test_a_mirror_tab_and_an_ids_tab_are_not_templates(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    sheets = {c["render"]["sheet"] for c in candidates}
    assert "Table_Bom" not in sheets and "SheetsFileIDs" not in sheets
    assert len(candidates) == 7


def test_two_tabs_in_one_spreadsheet_never_share_a_template(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    counting = [c for c in candidates
                if c["render"]["signature"][0] == "شمارش"]
    assert len(counting) == 2


def test_a_non_empty_subset_groups_and_an_empty_code_list_does_not(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    amar = [c for c in candidates if c["render"]["signature"][0] == "آمار"]
    grouped = [c for c in amar if len(c["payload"]["instances"]) == 2]
    assert len(amar) == 2 and len(grouped) == 1
    assert [i["key"] for i in grouped[0]["payload"]["instances"]] \
        == ["mini_kanter_ch__s2", "mini_kanter_nk__s2"]


def test_the_offset_twin_keeps_one_field_and_records_the_offset(estate):
    candidates, _, issues = record_templates(estate, "cooking")
    kanter = _by_sheet(candidates, "کانتر")[0]
    first = next(f for f in kanter["payload"]["fields"]
                 if f["title"] == "موجودی اول شب")
    assert first["columns"] == {"mini_kanter_ch__s1": "b",
                                "mini_kanter_nk__s1": "d"}
    assert first["key"] == "c_b"
    assert any(i["kind"] == "column_offset" for i in issues)


def test_enum_is_the_intersection_and_the_difference_is_cross_record(estate):
    candidates, _, issues = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")[0]
    sales = next(f for f in pitza["payload"]["fields"]
                 if f["title"] == "تعداد فروش")
    assert sales["constraints"]["enum"] == ["0", "1"]
    assert any(i["kind"] == "cross_record" for i in issues)


def test_the_label_column_becomes_a_titleless_field_and_the_labels_are_kept(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")[0]
    label = next(f for f in pitza["payload"]["fields"] if f["key"] == "c_a")
    assert label["title"] is None
    assert pitza["render"]["row_labels"]["mini_pitza_ch__s1"]["6"] \
        == "پنیر پیتزا ##1"
    assert next(f for f in pitza["payload"]["fields"]
                if f["title"] == "انحراف")["type"] == "number"


def test_header_notes_keep_the_unit_sentence_and_drop_the_date_band(estate):
    sheet = estate["SPCH"]["sheets"]["پیتزا"]
    assert header_notes(sheet) == [
        {"column": "d", "text": "پیتزا (تمام وزن ها به کیلوگرم است)"}]


def test_reference_rows_are_keyed_by_code_and_omit_a_blank(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    bom = _by_sheet(candidates, "مواد")[0]
    assert bom["payload"]["primaryKey"] == ["c_a"]
    rows = {r["key"]: r for r in bom["payload"]["rows"]}
    assert set(rows) == {"food_71", "food_61"}
    assert rows["food_71"] == {"key": "food_71", "c_a": "پیتزا آمریکایی #71",
                               "c_b": "215", "c_c": "260"}
    assert "c_d" not in rows["food_71"]      # the dump's blank is an omission
    assert code_key("##1") == "ing_1"


def test_a_repeated_header_inside_one_tab_is_reported(estate):
    header = ["نام", "پنیر پیتزا ##1", "نام"]
    fields = [{"key": "c_a", "title": "نام"}, {"key": "c_b", "title": "پنیر پیتزا ##1"}]
    _, _, issues = reference_rows(estate["SBOM"], "مواد", header, fields)
    assert [i["kind"] for i in issues] == ["ambiguous_row_header"]


def test_items_are_one_per_code_with_labels_by_instance_count(estate):
    _, instances, _ = record_templates(estate, "cooking")
    items = {c["payload"]["code"]: c for c in
             item_candidates(estate, "cooking", instances)}
    assert set(items) == {"##1", "##26", "##33", "#71", "#61"}
    assert items["##1"]["render"]["labels"] == ["پنیر پیتزا", "پنیر پیتزا میکس"]
    assert ("mini_bom__s1", "b") in items["##1"]["render"]["sites"]


def test_ids_are_stable_across_two_builds(tmp_path):
    make_estate(tmp_path)
    first = record_templates(load_estate(tmp_path), "cooking")
    second = record_templates(load_estate(tmp_path), "cooking")
    assert [c["id"] for c in first[0]] == [c["id"] for c in second[0]]
    assert all(c["id"].startswith("S-rec-") and len(c["id"]) == 18
               for c in first[0])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "…/code-repo" && .venv/bin/pytest engine/tests/test_facts_plan_build.py -q`
Expected: FAIL with `ImportError: cannot import name 'code_key' from 'facts_plan.build'`

- [ ] **Step 3: Write minimal implementation**

Append to `engine/facts_plan/build.py`:

```python
import hashlib
import pathlib

from dump_workbook import is_ids_tab, is_mirror_tab
from engine_common import read_json

_CODE_IN_TEXT = re.compile(r"#{1,2}[0-9]+")
_PLACEHOLDER = re.compile(r"^Column [0-9]+$")
_MONTHS = ("فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
           "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند")
_BRANCH_TOKENS = ("چاله باغ", "ناهارخوران", "ناهار خوران",
                  "chalebagh", "chale bagh", "naharkhoran", "nahar khoran")

# §2.3: these six describe a tab that becomes no record or a cell that becomes
# no rule, so they are reported and counted but never attached to an entry.
RUN_ONLY = frozenset({"reference_tab_is_mirror", "reference_tab_is_ids",
                      "reference_tab_computes", "row_labels_ambiguous",
                      "row_labels_partial", "unheaded_formula"})

# One Persian sentence per issue kind — `gate-b.md` and `report.md` print these
# verbatim, so no caller ever composes owner-facing prose (QF-54).
ISSUE_TEXT = {
    "column_offset": "ستون «{field}» در نسخه‌های مختلف در جای یکسانی نیست: {detail}.",
    "cross_record": "فهرست مقادیر مجاز ستون «{field}» بین نسخه‌ها یکی نیست: {detail}.",
    "ambiguous_row_header": "عنوان «{field}» در تب «{sheet}» دوبار تکرار شده و "
                            "سطرها به آن وصل نشدند.",
    "row_labels_partial": "نام سطرها فقط در بعضی نسخه‌ها ثبت شده است: {detail}.",
    "row_labels_ambiguous": "ستون نام سطرها در نسخه‌ها یکسان نیست: {detail}.",
}


def _issue(kind, *, instance=None, target=None, **fields):
    return {"kind": kind, "instance": instance, "target": target,
            "engine": True, "run_only": kind in RUN_ONLY,
            "description": ISSUE_TEXT[kind].format(**fields)}


def _sid(prefix, *parts):
    body = "\x00".join(str(p) for p in parts)
    return f"S-{prefix}-{hashlib.sha256(body.encode('utf-8')).hexdigest()[:12]}"


def _letters(n):
    """1 → `a`, 27 → `aa`. A field key is `c_<letter>`, always lowercase."""
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(97 + rem) + out
    return out


def fold(text):
    return _WS.sub(" ", (text or "").replace("\n", " ")).strip()


def strip_branch(name):
    """The tab name with a branch token removed — «کانتر ناهارخوران» in one book
    and «کانتر» in another are the same tab (QF-47). ZWNJ folds to a space so
    «چاله‌باغ» and «چاله باغ» are one token."""
    folded = fold(name.replace("‌", " ")).lower()
    for token in _BRANCH_TOKENS:
        folded = folded.replace(token, " ")
    return _WS.sub(" ", folded).strip()


def code_key(code):
    """`##1` → `ing_1`, `#71` → `food_71`. A store key is ASCII and matches
    `SEGMENT_RE`; `#` does not (QF-32), so the code itself lives in
    `item.data.code` and this is what a row is keyed by."""
    return (f"ing_{code[2:]}" if code.startswith("##") else f"food_{code[1:]}")


def _is_number(text):
    try:
        float(str(text).replace(",", ""))
        return True
    except (TypeError, ValueError):
        return False


def _tsv(path):
    """A dump TSV as dicts. Nothing is unescaped — `formulas.tsv` keeps the
    `\\n` the dumper wrote, and `normalise` step (a) is what consumes it. A
    short line simply lacks its trailing columns, which is the same as a blank:
    an omission, never an unanswered leaf."""
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines:
        return []
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"))) for line in lines[1:] if line]


def load_estate(root):
    """Every dumped workbook the manifest names, keyed by spreadsheetId.

    The whole estate is loaded because the library and the import hops are
    estate-wide; the department filter lives at the call site, so `build` never
    forgets that candidates are the department's own (§2.3)."""
    sheets_root = pathlib.Path(root) / "attachments" / "sheets"
    estate = {}
    for row in read_json(sheets_root / "manifest.json")["workbooks"]:
        dump = sheets_root / ".dump" / row["spreadsheetId"]
        if not (dump / "sheets.json").exists():
            continue
        estate[row["spreadsheetId"]] = {
            "row": row, "short": row["short"], "sheets_root": sheets_root,
            "sheets": {s["name"]: s
                       for s in read_json(dump / "sheets.json")["sheets"]},
            "formulas": _tsv(dump / "formulas.tsv"),
            "rows": _tsv(dump / "rows.tsv"),
            "names": {n["name"]: n["formula"] for n in _tsv(dump / "names.tsv")},
            "validations": _tsv(dump / "validations.tsv")}
    return estate


def template_signature(tab_name, head_row):
    """(folded tab name, the header row's item codes in order). An empty cell,
    a `Column N` placeholder and an un-coded column contribute nothing."""
    codes = []
    for cell in head_row or []:
        text = fold(cell)
        if text and not _PLACEHOLDER.match(text):
            codes += _CODE_IN_TEXT.findall(text)
    return (strip_branch(tab_name), tuple(codes))


def _label_column(sheet):
    """The column `row_labels` came from. The dumper records the texts but not
    the column; since Task 4 the head reaches four rows past the header, so the
    first label is findable in it."""
    labels = sheet.get("row_labels") or {}
    head = sheet.get("head") or []
    for row in sorted(labels, key=int):
        line = head[int(row) - 1] if int(row) <= len(head) else []
        for col, cell in enumerate(line, start=1):
            if fold(cell) == fold(labels[row]):
                return col
    return None


def header_notes(sheet):
    """The rows above the header row, as the unit sees them.

    A caption over a column that *has* a header names that column («تمام وزن‌ها
    به کیلوگرم است»); a caption over a column with none is the date band, and
    the numbers and month names under it are last night's date.

    ponytail: §2.3 words the third test as an exclusion, which taken literally
    drops the very sentence the same clause promises to keep. It is read here
    as the keeping test. Flip it if a real note ever sits over an unheaded
    column.
    """
    index = sheet.get("header_row")
    head = sheet.get("head") or []
    if not index:
        return []
    header = head[index - 1]
    notes = []
    for line in head[:index - 1]:
        for col, cell in enumerate(line, start=1):
            text = fold(cell)
            if not text or _is_number(text) or text in _MONTHS:
                continue
            if col > len(header) or not fold(header[col - 1]):
                continue
            notes.append({"column": _letters(col), "text": text})
    return notes


def _sheet_formulas(dump, name):
    return [f for f in dump["formulas"] if f.get("sheet") == name]


def _instances(estate, department):
    """One member per (spreadsheetId, tab) that can carry a record. A one-cell
    tab, a tab with no header row, a tab with no row below it, a mirror tab and
    an ids tab produce none (§2.3)."""
    out = []
    for sid, dump in sorted(estate.items()):
        row = dump["row"]
        if department not in (row.get("departments") or []):
            continue
        for name, sheet in sorted(dump["sheets"].items()):
            index = sheet.get("header_row")
            if (sheet.get("empty") or not index or is_ids_tab(name)
                    or is_mirror_tab(_sheet_formulas(dump, name))
                    or (sheet.get("rows", 0) <= 1 and sheet.get("cols", 0) <= 1)
                    or sheet.get("rows", 0) <= index):
                continue
            branches = row.get("branches") or []
            out.append({
                "key": f"{dump['short']}__s{sheet['sheetId']}",
                "spreadsheetId": sid, "sheetId": sheet["sheetId"], "sheet": name,
                "branch": branches[0] if len(branches) == 1 else None,
                "hidden": bool(sheet.get("hidden")),
                "reference": name in (row.get("reference_tabs") or []),
                "signature": template_signature(
                    name, sheet["head"][index - 1])})
    return sorted(out, key=lambda i: i["key"])


def _groups(instances):
    """Tabs group into one template when the folded names are equal and the code
    lists are equal or one is a NON-EMPTY subset of the other; two tabs in one
    spreadsheet never group, and a reference tab is always alone (§2.3).

    ponytail: a candidate is compared against the group's first member only.
    Instances are visited in ascending key, so the result is deterministic; a
    transitive-closure pass is the upgrade if a third code list ever needs it.
    """
    groups = []
    for inst in instances:
        name, codes = inst["signature"]
        for group in groups:
            head = group[0]
            if head["signature"][0] != name or head["reference"] or inst["reference"]:
                continue
            if any(g["spreadsheetId"] == inst["spreadsheetId"] for g in group):
                continue
            a, b = set(codes), set(head["signature"][1])
            if a == b or (a and b and (a < b or b < a)):
                group.append(inst)
                break
        else:
            groups.append([inst])
    return groups


def _enum(dump, sheet_name, letter):
    for v in dump["validations"]:
        if v.get("sheet") != sheet_name or v.get("type") != "list":
            continue
        if v.get("range", "").split(":")[0].strip("$").rstrip("0123456789").lower() \
                != letter:
            continue
        return [p.strip() for p in v.get("values", "").strip('"').split(",") if p]
    return None


def _fields(group, estate):
    """One field per header cell, matched across instances by header **text** —
    the same column sits at different letters in two books (kanter and its twin
    are two apart), and `columns` is what records that."""
    fields, order, issues = {}, [], []
    for inst in group:
        dump = estate[inst["spreadsheetId"]]
        sheet = dump["sheets"][inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        label_col = _label_column(sheet)
        for col, cell in enumerate(header, start=1):
            title = fold(cell)
            if _PLACEHOLDER.match(title) or (not title and col != label_col):
                continue
            letter = _letters(col)
            if title not in fields:
                fields[title] = {"key": f"c_{letter}", "title": title or None,
                                 "columns": {}, "type": "string"}
                order.append(title)
            fields[title]["columns"][inst["key"]] = letter
            samples = [row[col - 1] for row in sheet["head"][sheet["header_row"]:]
                       if col <= len(row) and str(row[col - 1]).strip()]
            if samples and all(_is_number(s) for s in samples):
                fields[title]["type"] = "number"
            values = _enum(dump, inst["sheet"], letter)
            if values is not None:
                seen = fields[title].setdefault("_enums", [])
                seen.append((inst["key"], values))
    out = []
    for title in order:
        field = fields[title]
        enums = field.pop("_enums", [])
        if enums:
            keep = [v for v in enums[0][1] if all(v in e for _, e in enums)]
            field["constraints"] = {"enum": keep}
            if any(e != enums[0][1] for _, e in enums):
                issues.append(_issue("cross_record", field=title or "—",
                                     detail=" / ".join(k for k, _ in enums)))
        letters = sorted(set(field["columns"].values()))
        if len(letters) > 1:
            issues.append(_issue("column_offset", field=title or "—",
                                 detail=", ".join(f"{k}: {v}" for k, v
                                                  in sorted(field["columns"].items()))))
        out.append(field)
    return out, issues


def _row_labels(group, estate):
    """Row labels are the template's only when every instance has them and every
    instance's label column carries the same header text (§2.3)."""
    labels, headers, missing = {}, set(), []
    for inst in group:
        sheet = estate[inst["spreadsheetId"]]["sheets"][inst["sheet"]]
        col = _label_column(sheet)
        if not sheet.get("row_labels") or not col:
            missing.append(inst["key"])
            continue
        labels[inst["key"]] = sheet["row_labels"]
        headers.add(fold(sheet["head"][sheet["header_row"] - 1][col - 1]))
    detail = ", ".join(i["key"] for i in group)
    if missing and labels:
        return None, [_issue("row_labels_partial", detail=detail)]
    if len(headers) > 1:
        return None, [_issue("row_labels_ambiguous", detail=detail)]
    return (labels or None), []


def reference_rows(dump, sheet_name, header_row, fields):
    """A reference tab's `rows.tsv` lines, matched to fields by header text.
    `primaryKey` is the column whose cells carry an item code; a cell the dump
    left empty is omitted, so a blank is never an unanswered leaf (QF-46)."""
    titles = [fold(c) for c in header_row if fold(c)]
    issues = [_issue("ambiguous_row_header", sheet=sheet_name, field=t)
              for t in sorted({t for t in titles if titles.count(t) > 1})]
    by_title = {f["title"]: f["key"] for f in fields if f["title"]}
    lines = [r for r in dump["rows"] if r.get("sheet") == sheet_name]
    key_title = next((t for t in titles if t in by_title
                      and any(_CODE_IN_TEXT.search(line.get(t, "") or "")
                              for line in lines)), None)
    rows = []
    for line in lines:
        code = _CODE_IN_TEXT.search(line.get(key_title, "") or "") if key_title else None
        if not code:
            continue
        row = {"key": code_key(code.group(0))}
        for title, value in line.items():
            if title in by_title and str(value).strip():
                row[by_title[title]] = value
        rows.append(row)
    return rows, ([by_title[key_title]] if key_title else []), issues


def record_templates(estate, department):
    """The record-template candidates, their instances and the issues the
    grouping found. `payload` is exactly the mechanical `data` subset §2.5
    leaves to the engine; `render` is what only `input.md` needs."""
    candidates, instances, issues = [], [], []
    for group in _groups(_instances(estate, department)):
        head_inst = group[0]
        dump = estate[head_inst["spreadsheetId"]]
        sheet = dump["sheets"][head_inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        fields, field_issues = _fields(group, estate)
        labels, label_issues = _row_labels(group, estate)
        tid = _sid("rec", head_inst["signature"][0],
                   *head_inst["signature"][1], head_inst["key"])
        row = dump["row"]
        payload = {
            "medium": "sheet",
            "location": {"path": f"attachments/sheets/{row['dir']}/{row['file']}",
                         "spreadsheetId": head_inst["spreadsheetId"],
                         "sheet": head_inst["sheet"]},
            "instances": [{k: i[k] for k in
                           ("key", "spreadsheetId", "sheetId", "sheet",
                            "branch", "hidden")} for i in group],
            "fields": fields}
        if head_inst["reference"]:
            rows, primary, row_issues = reference_rows(
                dump, head_inst["sheet"], header, fields)
            payload["rows"], payload["primaryKey"] = rows, primary
            issues += row_issues
        candidates.append({"id": tid, "kind": "record", "unit": None,
                           "payload": payload,
                           "render": {"sheet": head_inst["sheet"],
                                      "signature": list(head_inst["signature"]),
                                      "header_notes": header_notes(sheet),
                                      "row_labels": labels,
                                      "reference": head_inst["reference"]}})
        issues += field_issues + label_issues
        for inst in group:
            instances.append(dict(inst, template=tid))
    return candidates, instances, issues


def item_candidates(estate, department, instances):
    """One per distinct code across the department's header rows, its row labels
    and its reference rows' key column. Labels are ordered by how many instances
    carry each, so the unit's first choice is the estate's."""
    seen = collections.defaultdict(lambda: (collections.Counter(), []))
    for inst in instances:
        dump = estate[inst["spreadsheetId"]]
        sheet = dump["sheets"][inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        cells = [(_letters(col), fold(cell))
                 for col, cell in enumerate(header, start=1)]
        label_col = _label_column(sheet)
        cells += [(_letters(label_col), fold(text))
                  for text in (sheet.get("row_labels") or {}).values()
                  if label_col]
        cells += [(None, fold(str(v))) for line in dump["rows"]
                  if line.get("sheet") == inst["sheet"] for v in line.values()]
        for letter, text in cells:
            for code in _CODE_IN_TEXT.findall(text):
                labels, sites = seen[code]
                labels[fold(text.replace(code, ""))] += 1
                if letter and (inst["key"], letter) not in sites:
                    sites.append((inst["key"], letter))
    out = []
    for code in sorted(seen, key=lambda c: (len(c) - len(c.lstrip("#")), int(c.lstrip("#")))):
        labels, sites = seen[code]
        marker = "##" if code.startswith("##") else "#"
        out.append({"id": _sid("i", "item", marker, code.lstrip("#")),
                    "kind": "item", "unit": None,
                    "payload": {"code": code},
                    "render": {"labels": [t for t, _ in
                                          sorted(labels.items(),
                                                 key=lambda p: (-p[1], p[0])) if t],
                               "sites": sites}})
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "…/code-repo" && .venv/bin/pytest engine/tests/test_facts_plan_build.py engine/tests/test_facts_plan_shape.py -q`
Expected: PASS (29 passed)

- [ ] **Step 5: Commit**

```
git add engine/facts_plan/build.py engine/tests/test_facts_plan_build.py \
        engine/tests/fixtures/facts_plan/make_dump.py
git commit -m "$(cat <<'EOF'
feat(facts): build's record templates, reference rows and items

Identity is by content (QF-47): one tab across two branch books is one
template with two instances, an offset twin is one template whose fields carry
a per-instance column letter, and two tabs in one spreadsheet never merge. The
fixture is a five-workbook mini estate written as dumps, not as .xlsx — build
reads dumps.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 11: `build` — rule columns, variants, bindings and the exclusions

**Read first:** spec §2.3 (the **rule column** and **script function** rows of the candidate table — every exclusion is in the last four sentences of the rule-column row), §2.5 (the paragraph beginning "A rule column whose bindings carry a varying literal or basis"), §3.1 (the `applies_to` key form), §3.3 (`rule.applies_to[]`, the new `issue.kind` values); Task 9's `normalise` and Task 10's `record_templates`/`load_estate` in `engine/facts_plan/build.py`; the fixture `engine/tests/fixtures/facts_plan/make_dump.py`; the real `پیتزا` rows of `../data-repo/attachments/sheets/.dump/1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s/formulas.tsv` (columns L and M are the tolerance and the per-unit tolerance this task must fold into one candidate each).

**Files:**
- Modify: `engine/facts_plan/build.py` (append after `item_candidates`)
- Test: `engine/tests/test_facts_plan_rules.py`

**Interfaces:**
- Consumes: `facts_plan.build.normalise`, `is_bare_reference`, `Shape` (Task 9); `load_estate`, `record_templates`, `fold`, `_letters`, `_issue`, `_sid`, `_sheet_formulas`, `ISSUE_TEXT`, `RUN_ONLY` (Task 10); `dump_workbook.is_mirror_tab` (Task 4).
- Produces:
  - `facts_plan.build.table_reading_functions(estate) -> frozenset[str]` — the function names whose body reads a table or a sheet range; also used by Task 12's `functions.md`.
  - `facts_plan.build.rule_columns(estate, department, templates, instances, table_functions) -> tuple[list, list]` — `(candidates, issues)`. A candidate is `{"id", "kind": "rule", "unit": None, "payload": {"original", "applies_to"}, "render": {"output", "variants", "input_headers", "calls"}}`.
  - `facts_plan.build.script_rules(estate, department, called) -> list` — the `.gs` candidates; `called` is the set of every function name any formula or body calls.
  - `facts_plan.build.called_names(estate) -> frozenset[str]`.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_facts_plan_rules.py`:

```python
"""`facts-plan build`'s rule columns over the mini estate.

The three assertions this file exists for: one column that computes the same
thing in two branch books is ONE candidate with two bindings (QF-47); a
tolerance keeps `tolerancePerFoodGr` as a parameter key and its basis column as
a `{ref, field}` (§2.5); and a date pass-through above the header row mints
nothing at all (§2.3).
"""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent
                       / "fixtures" / "facts_plan"))
from make_dump import make_estate  # noqa: E402

from facts_plan.build import (called_names, load_estate,  # noqa: E402
                              record_templates, rule_columns, script_rules,
                              table_reading_functions)


@pytest.fixture
def built(tmp_path):
    make_estate(tmp_path)
    estate = load_estate(tmp_path)
    templates, instances, _ = record_templates(estate, "cooking")
    functions = table_reading_functions(estate)
    candidates, issues = rule_columns(estate, "cooking", templates, instances,
                                      functions)
    return estate, templates, instances, candidates, issues


def _by_output(candidates, output):
    return next(c for c in candidates if c["render"]["output"] == output)


def _kinds(issues):
    return [i["kind"] for i in issues]


def test_the_deviation_column_is_one_candidate_bound_in_both_twins(built):
    _, _, _, candidates, _ = built
    deviation = _by_output(candidates, "انحراف")
    assert len(deviation["render"]["variants"]) == 1
    assert deviation["render"]["variants"][0]["shape"] == "MINUS(@,@)"
    assert [b["key"] for b in deviation["payload"]["applies_to"]] == [
        "mini_pitza_ch__s1__h__r6", "mini_pitza_nk__s1__h__r6"]
    assert deviation["payload"]["applies_to"][0]["range"] == "H6:H8"
    assert deviation["render"]["input_headers"] == ["مصرف واقعی", "مصرف اعلامی"]


def test_a_binding_carries_its_rows_with_label_and_item_code(built):
    _, _, _, candidates, _ = built
    binding = _by_output(candidates, "انحراف")["payload"]["applies_to"][0]
    assert binding["rows"] == [
        {"key": "r6", "row": 6, "label": "پنیر پیتزا ##1", "item": "##1"},
        {"key": "r7", "row": 7, "label": "خمیر پیتزا ##26", "item": "##26"},
        {"key": "r8", "row": 8, "label": "سس گوجه ##33", "item": "##33"}]


def test_the_tolerance_keeps_its_let_names_and_a_ref_basis(built):
    _, templates, _, candidates, _ = built
    pitza = next(t for t in templates if t["render"]["sheet"] == "پیتزا")
    tolerance = _by_output(candidates, "انحراف (با تلورانس)")
    assert len(tolerance["render"]["variants"]) == 2
    bindings = {b["key"]: b for b in tolerance["payload"]["applies_to"]}
    per_food = bindings["mini_pitza_ch__s1__j__r6"]["params"]
    assert per_food["tolerancePerFoodGr"] == 5
    assert per_food["ref_1"] == {"ref": pitza["id"], "field": "c_i"}
    per_kg = bindings["mini_pitza_ch__s1__j__r7"]["params"]
    assert per_kg["tolerancePerKilogramGr"] == 140
    assert per_kg["ref_1"] == {"ref": pitza["id"], "field": "c_g"}
    assert bindings["mini_pitza_ch__s1__j__r6"]["variant"] \
        != bindings["mini_pitza_ch__s1__j__r7"]["variant"]


def test_the_offset_twin_binds_the_same_field_key_at_a_different_letter(built):
    _, templates, _, candidates, _ = built
    kanter = next(t for t in templates if t["render"]["sheet"] == "کانتر")
    shortfall = _by_output(candidates, "کسری")
    params = [b["params"]["ref_1"] for b in shortfall["payload"]["applies_to"]]
    assert params == [{"ref": kanter["id"], "field": "c_b"},
                      {"ref": kanter["id"], "field": "c_b"}]


def test_a_date_passthrough_above_the_header_mints_no_candidate(built):
    _, _, _, candidates, issues = built
    assert not any(c["render"]["output"] in ("تاریخ", "روز", "ماه")
                   for c in candidates)
    unheaded = [i for i in issues if i["kind"] == "unheaded_formula"]
    assert {i["target"] for i in unheaded} == {"پیتزا!b", "پیتزا!c"}
    assert all(i["run_only"] for i in unheaded)


def test_a_bare_reference_in_a_computing_column_is_no_rule_applies(built):
    _, _, _, candidates, issues = built
    tolerance = _by_output(candidates, "انحراف (با تلورانس)")
    assert "mini_pitza_ch__s1__j__r8" not in [
        b["key"] for b in tolerance["payload"]["applies_to"]]
    assert "no_rule_applies" in _kinds(issues)


def test_a_num_error_is_excluded_and_a_name_error_is_not(built):
    _, _, _, candidates, issues = built
    tolerance = _by_output(candidates, "انحراف (با تلورانس)")
    assert "mini_pitza_nk__s1__j__r7" not in [
        b["key"] for b in tolerance["payload"]["applies_to"]]
    broken = [i for i in issues if i["kind"] == "broken_formula"]
    assert broken and "#NUM!" in broken[0]["description"]
    shortfall = _by_output(candidates, "کسری")
    assert "mini_kanter_nk__s1__f__r2" in [
        b["key"] for b in shortfall["payload"]["applies_to"]]
    assert "cached_error" in _kinds(issues)


def test_a_mirror_tab_yields_no_rule(built):
    _, _, _, candidates, _ = built
    assert all("Table_Bom" not in b["key"]
               for c in candidates for b in c["payload"]["applies_to"])


def test_table_reading_variants_group_by_their_called_functions(built):
    estate, _, _, candidates, issues = built
    assert "getTotalFoodsIngredient" in table_reading_functions(estate)
    actual = _by_output(candidates, "مصرف واقعی")
    assert len(actual["render"]["variants"]) == 1
    assert actual["render"]["variants"][0]["functions"] == [
        "CONVERT_GR_TO_KG", "LET", "getTotalFoodsIngredient"]
    assert len(actual["payload"]["applies_to"]) == 4
    assert "hand_maintained_index" in _kinds(issues)


def test_original_is_one_body_headed_by_each_variant_key(built):
    _, _, _, candidates, _ = built
    original = _by_output(candidates, "انحراف (با تلورانس)")["payload"]["original"]
    assert original.startswith("# mini_pitza_ch__s1__j__r6\n")
    assert "tolerancePerFoodGr" in original and "tolerancePerKilogramGr" in original
    assert "\\n" not in original          # the dump's escapes are unescaped here


def test_an_uncalled_script_function_with_a_conditional_is_a_candidate(built):
    estate, _, _, _, _ = built
    rules = {r["render"]["output"]: r
             for r in script_rules(estate, "cooking", called_names(estate))}
    assert set(rules) == {"getWeekDayCoefficient"}
    assert rules["getWeekDayCoefficient"]["id"].startswith("S-gs-")
    assert "day == 5" in rules["getWeekDayCoefficient"]["payload"]["original"]


def test_ids_are_stable_across_two_builds(tmp_path):
    make_estate(tmp_path)

    def run():
        estate = load_estate(tmp_path)
        templates, instances, _ = record_templates(estate, "cooking")
        return [c["id"] for c in rule_columns(
            estate, "cooking", templates, instances,
            table_reading_functions(estate))[0]]

    assert run() == run()
    assert all(i.startswith("S-r-") and len(i) == 16 for i in run())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "…/code-repo" && .venv/bin/pytest engine/tests/test_facts_plan_rules.py -q`
Expected: FAIL with `ImportError: cannot import name 'called_names' from 'facts_plan.build'`

- [ ] **Step 3: Write minimal implementation**

Append to `engine/facts_plan/build.py` (and add the four issue sentences to `ISSUE_TEXT` and the one run-only kind to `RUN_ONLY`):

```python
ISSUE_TEXT.update({
    "unheaded_formula": "در تب «{sheet}» ستون {column} فرمول دارد ولی عنوانی "
                        "ندارد؛ سطرهای {rows}.",
    "no_rule_applies": "در تب «{sheet}» خانه‌های {rows} از ستون {column} فقط "
                       "مقدار خانهٔ دیگری را نشان می‌دهند.",
    "broken_formula": "فرمول ستون {column} تب «{sheet}» در محدودهٔ {rows} خطای "
                      "{error} می‌دهد.",
    "cached_error": "آخرین نتیجهٔ ذخیره‌شدهٔ ستون {column} تب «{sheet}» در "
                    "محدودهٔ {rows} خطای {error} است؛ فرمول سر جای خود است.",
    "hand_maintained_index": "فهرست غذاهای ستون {column} تب «{sheet}» داخل خود "
                             "فرمول نگهداری می‌شود، در حالی که همان نگاشت در "
                             "جدول نسخه‌ها هم هست.",
    "per_cell_mirror": "تب «{sheet}» خانه‌به‌خانه از جای دیگری کپی می‌شود.",
})
# §2.3: a cell that becomes no rule attaches to nothing.
RUN_ONLY = RUN_ONLY | {"unheaded_formula"}

_BROKEN = ("#REF!", "#NUM!")
_CACHED = ("#NAME?", "#N/A", "Loading...")
_CELL_REF = re.compile(r"^\$?([A-Z]{1,3})\$?([0-9]+|N)$")
_GS_FUNCTION = re.compile(r"^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", re.M)
_GS_LOGIC = re.compile(r"[-+*/%]|\bif\s*\(|\?")
# ponytail: "reads a table or a sheet range" as one regex over the body — the
# five spellings the estate uses. A sixth spelling means one more alternative.
_TABLE_READER = re.compile(r"Table_|IMPORT_FROM_SHEET|IMPORTRANGE"
                           r"|getRangeByName|getSheetByName|getRange\(")
# §2.3: the estate names a row's ingredient exactly once, as this LET local.
ITEM_PARAM = "ingredientId"


def _bodies(estate):
    """Every function body in the estate: the named functions from `names.tsv`
    and the script functions from the `.gs` files the manifest points at."""
    out = {}
    for dump in estate.values():
        for name, formula in dump["names"].items():
            if formula.startswith("LAMBDA("):
                out.setdefault(name, formula)
        for script in dump["row"].get("scripts") or []:
            path = dump["sheets_root"] / script
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            starts = [(m.group(1), m.start()) for m in _GS_FUNCTION.finditer(text)]
            for i, (name, start) in enumerate(starts):
                end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
                out.setdefault(name, text[start:end].strip())
    return out


def table_reading_functions(estate):
    """The functions whose body reads a table or a sheet range. §2.3 groups the
    variants of a column that calls one by the *set of called functions*, not by
    shape: their inlined food-id sets vary per row and are not parameters."""
    return frozenset(name for name, body in _bodies(estate).items()
                     if _TABLE_READER.search(body))


def called_names(estate):
    """Every function name anything calls — a cell formula, a named function's
    body or a script body. What is in here is plumbing, not a rule (§2.3)."""
    called = set()
    for dump in estate.values():
        for row in dump["formulas"]:
            called |= normalise(row.get("formula", ""), table_refs={}).functions
    for body in _bodies(estate).values():
        called |= {m.group(1) for m in _FUNC.finditer(body)}
    return frozenset(called)


def _table_refs(dump, instances):
    """`Table_*` → the template it names, when `names.tsv` resolves it to a tab
    that is an instance of this run; otherwise the bare name."""
    by_sheet = {(i["spreadsheetId"], i["sheet"]): i["template"] for i in instances}
    out = {}
    for name, formula in dump["names"].items():
        sheet = formula.split("!")[0].strip("'") if "!" in formula else None
        template = by_sheet.get((dump["row"]["spreadsheetId"], sheet))
        out[name] = {"ref": template} if template else {"table": name}
    return out


def _column_of(span):
    m = _CELL_REF.match(span.split(":")[0].replace("$", ""))
    return m.group(1).lower() if m else None


def _first_row(span):
    m = _CELL_REF.match(span.split(":")[0].replace("$", ""))
    return int(m.group(2)) if m and m.group(2) != "N" else None


def _rows_of(span):
    parts = span.replace("$", "").split(":")
    first, last = _first_row(parts[0]), _first_row(parts[-1])
    return list(range(first, (last or first) + 1)) if first else []


def _resolve(locator, inst, fields_by_letter):
    """A reference that points at a column of this tab's own template becomes
    `{ref, field}`; anything else stays the locator §2.3 (d) recorded."""
    if locator.get("sheet"):
        return locator
    letter = _column_of(locator["cell"])
    field = fields_by_letter.get((inst["key"], letter))
    return {"ref": inst["template"], "field": field} if field else locator


def rule_columns(estate, department, templates, instances, table_functions):
    """One candidate per output header over the department's non-reference tabs
    (§2.3). Every candidate carries `applies_to[]` — one member per (instance,
    column, row range) — so one concept is one entry however many books run it.
    """
    fields_by_letter, by_template = {}, {t["id"]: t for t in templates}
    for template in templates:
        for field in template["payload"]["fields"]:
            for inst_key, letter in field["columns"].items():
                fields_by_letter[(inst_key, letter)] = field["key"]
    columns, issues = collections.defaultdict(list), []
    for inst in instances:
        template = by_template[inst["template"]]
        if template["render"]["reference"]:
            continue
        dump = estate[inst["spreadsheetId"]]
        sheet = dump["sheets"][inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        labels = (template["render"]["row_labels"] or {}).get(inst["key"], {})
        refs = _table_refs(dump, instances)
        items = {}
        for row in _sheet_formulas(dump, inst["sheet"]):
            shape = normalise(row["formula"], table_refs=refs)
            if ITEM_PARAM in shape.params:
                for number in _rows_of(row["range"]):
                    items.setdefault(number, {})[_column_of(row["range"])] = \
                        "##%s" % shape.params[ITEM_PARAM]
        for row in _sheet_formulas(dump, inst["sheet"]):
            letter = _column_of(row["range"])
            index = header.index(header[0]) if False else None  # unused
            title = fold(header[_col_index(letter) - 1]) \
                if _col_index(letter) <= len(header) else ""
            rows = _rows_of(row["range"])
            if (not title or _PLACEHOLDER.match(title) or _is_number(title)
                    or title in _MONTHS):
                issues.append(_issue("unheaded_formula",
                                     instance=inst["key"],
                                     target=f"{inst['sheet']}!{letter}",
                                     sheet=inst["sheet"], column=letter.upper(),
                                     rows=row["range"]))
                continue
            columns[title].append((inst, row, letter, rows, labels, items, refs))
    candidates = []
    for title in sorted(columns):
        bindings, variants, blocks = [], [], []
        for inst, row, letter, rows, labels, items, refs in columns[title]:
            error = (row.get("error") or "").strip()
            shape = normalise(row["formula"], table_refs=refs)
            span = f"{inst['sheet']}!{letter}"
            if error in _BROKEN:
                issues.append(_issue("broken_formula", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"],
                                     error=error))
                continue
            if is_bare_reference(shape.text):
                issues.append(_issue("no_rule_applies", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"]))
                continue
            if error in _CACHED:
                issues.append(_issue("cached_error", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"],
                                     error=error))
            reads_a_table = bool(shape.functions & table_functions)
            mark = (sorted(shape.functions) if reads_a_table else shape.text)
            variant = next((v for v in variants if v["mark"] == mark), None)
            if variant is None:
                variant = {"key": f"v{len(variants) + 1}", "mark": mark,
                           "shape": shape.text,
                           "functions": sorted(shape.functions),
                           "table_reader": reads_a_table}
                variants.append(variant)
                blocks.append((row["range"], inst, row["formula"]))
            params = dict(shape.params)
            for key, value in params.items():
                if isinstance(value, dict) and "cell" in value:
                    params[key] = _resolve(value, inst, fields_by_letter)
            first = rows[0] if rows else 1
            bindings.append({
                "key": f"{inst['key']}__{letter}__r{first}",
                "record": {"ref": inst["template"],
                           "field": fields_by_letter.get((inst["key"], letter))},
                "variant": variant["key"], "range": row["range"],
                "params": params,
                "rows": [{"key": f"r{n}", "row": n,
                          "label": labels.get(str(n)),
                          "item": next((items.get(n, {})[c] for c in
                                        sorted(items.get(n, {}))), None)}
                         for n in rows] if labels else []})
        if not bindings:
            continue
        for variant in variants:
            variant.pop("mark")
        original = "\n\n".join(
            f"# {inst['key']}__{_column_of(span)}__r{(_rows_of(span) or [1])[0]}\n"
            + formula.replace("\\n", "\n").replace("\\t", "\t")
            for span, inst, formula in blocks)
        if any(v["table_reader"] for v in variants):
            first = columns[title][0][0]
            issues.append(_issue("hand_maintained_index", instance=first["key"],
                                 sheet=first["sheet"],
                                 column=columns[title][0][2].upper()))
        heads = []
        for binding in bindings:
            for value in binding["params"].values():
                if isinstance(value, dict) and value.get("field"):
                    field = next(f for f in by_template[binding["record"]["ref"]]
                                 ["payload"]["fields"] if f["key"] == value["field"])
                    if field["title"] and field["title"] not in heads:
                        heads.append(field["title"])
        candidates.append({
            "id": _sid("r", department, title), "kind": "rule", "unit": None,
            "payload": {"original": original,
                        "applies_to": sorted(bindings, key=lambda b: b["key"])},
            "render": {"output": title, "variants": variants,
                       "input_headers": heads,
                       "calls": sorted({f for v in variants
                                        for f in v["functions"]})}})
    return candidates, issues


def _col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 96)
    return n


def script_rules(estate, department, called):
    """A `.gs` function no sheet formula calls, containing arithmetic or a
    conditional, is a rule candidate in the unit of the workbook that owns the
    script (§2.3). Everything else is library only.

    ponytail: "arithmetic or a conditional" is one regex, so a plumbing routine
    with a loop counter is minted too and the unit drops it under U1. Tighten
    only if the drop rate is what a run complains about.
    """
    out = []
    for sid, dump in sorted(estate.items()):
        row = dump["row"]
        if department not in (row.get("departments") or []):
            continue
        for script in row.get("scripts") or []:
            path = dump["sheets_root"] / script
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            starts = [(m.group(1), m.start()) for m in _GS_FUNCTION.finditer(text)]
            for i, (name, start) in enumerate(starts):
                end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
                body = text[start:end].strip()
                if name in called or not _GS_LOGIC.search(body):
                    continue
                out.append({"id": _sid("gs", row["short"], name), "kind": "rule",
                            "unit": None,
                            "payload": {"original": body, "applies_to": []},
                            "render": {"output": name, "variants": [],
                                       "input_headers": [], "calls": [],
                                       "script": script}})
    return out
```

Delete the stray `index = header.index(...) if False else None` line before committing — it is dead and `ruff` (`select = ["E", "F", "I"]`, `pyproject.toml:22-25`) fails on the unused binding.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "…/code-repo" && .venv/bin/pytest engine/tests/test_facts_plan_rules.py engine/tests/test_facts_plan_build.py engine/tests/test_facts_plan_shape.py -q && .venv/bin/python -m ruff check engine/facts_plan`
Expected: PASS (41 passed) and ruff clean

- [ ] **Step 5: Commit**

```
git add engine/facts_plan/build.py engine/tests/test_facts_plan_rules.py
git commit -m "$(cat <<'EOF'
feat(facts): build's rule columns — variants, bindings and the exclusions

One candidate per output header, its variants folded by shape (or by called
function set where the function reads a table), everything that differs
between two bindings recorded as a parameter: a tolerance keeps
tolerancePerFoodGr as its key and its basis column as a {ref, field}. Bare
references, mirror tabs, #REF!/#NUM! and formulas above a header row mint
nothing and are reported instead.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

### Task 12: `facts-plan build` — import edges, context, the two slices, `functions.md`, `skeleton.json`

**Files:**
- Modify: `engine/facts_plan/build.py` (append; the module T9–T11 created)
- Create: `engine/tests/facts_plan_helpers.py`
- Test: `engine/tests/test_facts_plan_edges.py`

**Interfaces:**
- Consumes: `dump_workbook.is_mirror_tab(formulas_for_tab)`, `dump_workbook.is_ids_tab(name)` (T4); `merge_facts.is_open`; `engine_common.read_json`, `engine_common.write_json_atomic`; `facts_plan.build.estimate_tokens` (T9, unused here but the module is already imported).
- Produces, all in `facts_plan.build`:
  - `resolve_source(dump, named_range) -> str | None` — the three hops.
  - `mirror_names(dump, tab) -> list[str]`
  - `import_edges(dumps, manifest, refs) -> tuple[list[dict], list[dict]]` — `(imports[], issues[])`.
  - `context_items(dumps, sids) -> list[dict]` — `{kind, sheet, where, text}`.
  - `reuse_slice(own, index, item_units, department, tokens, cap=40) -> list[str]`
  - `process_index(root, department) -> list[dict]` — `{process, node, label}`.
  - `rank(rows, tokens, cap, text) -> list[dict]`
  - `function_library(dumps, scripts) -> str` — `functions.md`'s body.
  - `unit_symbols(root) -> list[str]`
  - `write_skeleton(run_dir, department, run, symbols, candidates, instances, imports, issues) -> pathlib.Path`
  - `_fold(text) -> str`, `_tokens(text) -> set[str]`, `_issue(kind, instance, description, run_only=False) -> dict`, `_ident(formula, name) -> bool`, `_col_index(letters) -> int` (private, used by T13 and T15).
- **Dump shape every function here takes** (`build()` loads it; the `.tsv` files are read with `csv.DictReader`, so a row is a dict keyed by the file's own header): `dumps[spreadsheetId] = {"sheets": <sheets.json as a dict>, "formulas": [dict], "names": [dict], "rows": [dict], "cf": [dict], "comments": [dict], "meta": dict}`.

Read first: `engine/dump_workbook/__init__.py:561-594` (`_reference_rows` — `rows.tsv` names its columns by header text, which is why hop 3 has to read the header row back), `engine/merge_facts/audit.py:95-120` (`_norm`/`_tokens`, the folding this task copies the shape of), and a real dump: `data-repo/attachments/sheets/.dump/1gev9f9ymiBuzqOzPH2epWWIvJx3hV8fxPxpdeAxNEs4/{names.tsv,rows.tsv,formulas.tsv}`.

- [ ] **Step 1: Write the failing test**

`engine/tests/facts_plan_helpers.py` — the synthetic estate T12–T15 share (it extends T10's synthetic fixture with the mirror/ids workbook the edge tests need):

```python
"""A synthetic two-workbook cooking estate in the shape `facts_plan` reads —
dump dicts, not files, so the pure functions can be tested without a dumper
run. `gozareshat` carries the mirrors and the ids tab; `ashpazkhne` is the
source workbook they pull from."""


def _sheet(sheet_id, name, head, header_row=1, hidden=False):
    return {"sheetId": sheet_id, "name": name, "hidden": hidden,
            "dimension": "A1:F20", "rows": 20, "cols": len(head[0]) if head else 0,
            "head": head, "header_row": header_row, "codes": [], "empty": False}


def estate():
    """`(dumps, manifest)` — the fixture every `facts_plan` test starts from."""
    gozareshat = {
        "sheets": {"spreadsheetId": "SID_G", "sheets": [
            _sheet(5, "Kitchen-Dough-Chalebagh", [["خمیر"]]),
            _sheet(6, "مغایرت", [["تاریخ", "کسری"]]),
            _sheet(7, "Prep-Waste", [["ضایعات"]]),
            _sheet(8, "Table_Orphan", [["x"]]),
            _sheet(27, "SheetsFileIds",
                   [["Range Name Associated", "Sheets File Id"]], hidden=True),
            _sheet(9, "نیازمندیها و مشکلات", [["مشکل", "توضیح"],
                                              ["ترازو خراب است", "لاین سوخاری"]]),
        ]},
        "formulas": [
            {"sheet": "Kitchen-Dough-Chalebagh", "range": "A1", "group": "",
             "formula": 'LET(\\nsheetName,"خمیر",\\ndataRange,"A:D",\\n'
                        "IMPORT_FROM_SHEET(SheetsFileId_Kitchen_Chalebagh,"
                        "sheetName,dataRange)\\n)",
             "count": "1", "cached": "", "error": ""},
            {"sheet": "Prep-Waste", "range": "A1", "group": "",
             "formula": 'LET(\\nsheetName,"ضایعات",\\ndataRange,"A:B",\\n'
                        "IMPORT_FROM_SHEET(SheetsFileId_Kitchen_Chalebagh,"
                        "sheetName,dataRange)\\n)",
             "count": "1", "cached": "", "error": ""},
            {"sheet": "Table_Orphan", "range": "A1", "group": "",
             "formula": 'IMPORT_FROM_SHEET(SheetsFileId_Nowhere,"x","A:B")',
             "count": "1", "cached": "", "error": ""},
            {"sheet": "مغایرت", "range": "F6:F19", "group": "F6:F19",
             "formula": "FILTER_BY_DATE(Kitchen_Dough_Chalebagh,date)",
             "count": "14", "cached": "0", "error": ""},
        ],
        "names": [
            {"name": "Kitchen_Dough_Chalebagh", "scope": "workbook",
             "formula": "'Kitchen-Dough-Chalebagh'!$A:$E"},
            {"name": "SheetsFileId_Kitchen_Chalebagh", "scope": "workbook",
             "formula": "SheetsFileIds!$B$3"},
            {"name": "FILTER_BY_DATE", "scope": "workbook",
             "formula": "LAMBDA(data, date, FILTER(data, INDEX(data,,1) = date))"},
        ],
        "rows": [{"sheet": "SheetsFileIds", "row": "2",
                  "Range Name Associated": "SheetsFileId_Warehouse", "Sheets File Id": "SID_W"},
                 {"sheet": "SheetsFileIds", "row": "3",
                  "Range Name Associated": "SheetsFileId_Kitchen_Chalebagh",
                  "Sheets File Id": "SID_K"}],
        "cf": [{"sheet": "مغایرت", "range": "G6:G18", "type": "cellIs greaterThan",
                "formula": "0", "format": "color=FFFF0000"},
               {"sheet": "مغایرت", "range": "K6:K19", "type": "cellIs greaterThan",
                "formula": "140", "format": "color=FFFF0000"},
               {"sheet": "مغایرت", "range": "L6:L19", "type": "cellIs greaterThan",
                "formula": "12", "format": ""}],
        "comments": [{"sheet": "مغایرت", "cell": "F6", "author": "unknown",
                      "text": "تلورانس ۵ گرم برای هر پرس"}],
        "meta": {"spreadsheetId": "SID_G", "file": "Gozareshat.xlsx"},
    }
    ashpazkhne = {
        "sheets": {"spreadsheetId": "SID_K", "sheets": [
            _sheet(3, "خمیر", [["", "تاریخ", "ماده", "مقدار", "قیمت", "Column 6"]]),
            _sheet(4, "ضایعات", [["روز", "مقدار"]]),
        ]},
        "formulas": [], "names": [], "rows": [], "cf": [], "comments": [],
        "meta": {"spreadsheetId": "SID_K", "file": "Ashpazkhne - Chalebagh.xlsx"},
    }
    manifest = {"schema_version": 2,
                "branches": [{"code": "chalebagh", "name": "چاله‌باغ"},
                             {"code": "naharkhoran", "name": "ناهارخوران"}],
                "workbooks": [
                    {"spreadsheetId": "SID_G", "short": "gozareshat",
                     "departments": ["cooking"], "branches": ["chalebagh"],
                     "reference_tabs": [], "confirmed": True, "unresolved": [],
                     "dir": "Gozareshat", "file": "Gozareshat.xlsx", "scripts": []},
                    {"spreadsheetId": "SID_K", "short": "ashpazkhne_chalebagh",
                     "departments": ["cooking"], "branches": ["chalebagh"],
                     "reference_tabs": [], "confirmed": True, "unresolved": [],
                     "dir": "Ashpazkhane__Ashpazkhne - Chalebagh",
                     "file": "Ashpazkhne - Chalebagh.xlsx", "scripts": []}]}
    return {"SID_G": gozareshat, "SID_K": ashpazkhne}, manifest
```

`engine/tests/test_facts_plan_edges.py`:

```python
import json

from facts_plan.build import (context_items, function_library, import_edges,
                              process_index, rank, resolve_source, reuse_slice,
                              unit_symbols, write_skeleton, _tokens)
from facts_plan_helpers import estate


def test_three_hops_resolve_the_source_workbook():
    dumps, _ = estate()
    assert resolve_source(dumps["SID_G"], "SheetsFileId_Kitchen_Chalebagh") == "SID_K"
    assert resolve_source(dumps["SID_G"], "SheetsFileId_Nowhere") is None


def test_edge_names_its_consumers_and_falls_back_to_a_locator():
    dumps, manifest = estate()
    edges, _ = import_edges(dumps, manifest, {})
    dough = [e for e in edges if e["named_range"] == "SheetsFileId_Kitchen_Chalebagh"
             and e["range"] == "A:D"]
    assert [e["consumer"] for e in dough] == ["gozareshat__s6"]
    assert dough[0]["source"] == {"spreadsheetId": "SID_K", "sheet": "خمیر"}


def test_edge_takes_a_ref_when_the_source_record_exists():
    dumps, manifest = estate()
    edges, _ = import_edges(dumps, manifest,
                            {("SID_K", "خمیر"): {"ref": "S-rec-0123456789ab"}})
    assert any(e["source"] == {"ref": "S-rec-0123456789ab"} for e in edges)


def test_unknown_source_and_unused_mirror():
    dumps, manifest = estate()
    _, issues = import_edges(dumps, manifest, {})
    kinds = [i["kind"] for i in issues]
    assert kinds.count("unknown_source") == 1          # Table_Orphan
    assert kinds.count("unused_mirror") == 1           # Prep-Waste
    assert [i["instance"] for i in issues if i["kind"] == "unused_mirror"] \
        == ["gozareshat__s7"]
    assert all(i["run_only"] is False for i in issues)


def test_column_shift_lists_named_columns_only_and_leading_offset_fires():
    dumps, manifest = estate()
    _, issues = import_edges(dumps, manifest, {})
    shift = [i for i in issues if i["kind"] == "column_shift"
             and i["instance"] == "gozareshat__s5"]
    assert len(shift) == 1
    assert "قیمت" in shift[0]["description"]
    assert "Column 6" not in shift[0]["description"]   # unnamed: no issue
    assert any(i["kind"] == "leading_offset" and i["instance"] == "gozareshat__s5"
               for i in issues)                        # empty first header cell


def test_context_drops_sign_tests_and_empty_formats():
    dumps, _ = estate()
    items = context_items(dumps, ["SID_G"])
    texts = " ".join(i["text"] for i in items)
    assert "تلورانس ۵ گرم برای هر پرس" in texts        # the comment
    assert "140" in texts                              # a business threshold
    assert "greaterThan 0" not in texts                # a sign test at zero
    assert "12" not in texts                           # no format: not a rule
    assert any(i["kind"] == "note_tab" and "ترازو خراب است" in i["text"]
               for i in items)


def test_reuse_slice_ranks_by_shared_tokens_and_caps():
    index = [{"id": "F-00002", "kind": "item", "key": "item_1", "title": "پنیر پیتزا",
              "aliases": ["وزن پنیر"], "scope": {"departments": ["cooking"]},
              "retired": False},
             {"id": "F-00003", "kind": "item", "key": "item_9", "title": "روغن سرخ‌کردنی",
              "aliases": [], "scope": {"departments": ["cooking"]}, "retired": False},
             {"id": "F-00004", "kind": "item", "key": "item_x", "title": "کاغذ",
              "aliases": [], "scope": {"departments": ["warehouse"]}, "retired": False}]
    own = [{"id": "S-i-0123456789ab", "kind": "item", "label": "##1 پنیر"}]
    lines = reuse_slice(own, index, {"F-00002": "kg"}, "cooking",
                        _tokens("پنیر پیتزا موجودی"), cap=2)
    assert lines[0] == "S-i-0123456789ab · item · ##1 پنیر"
    assert lines[1].startswith("F-00002 · item · item_1 · پنیر پیتزا")
    assert lines[1].endswith("kg")
    assert len(lines) == 3                              # own + cap
    assert "F-00004" not in " ".join(lines)             # another department


def test_process_index_and_ranking(tmp_path):
    directory = tmp_path / "departments" / "cooking" / "processes"
    directory.mkdir(parents=True)
    (directory / "cooking-030.json").write_text(json.dumps(
        {"id": "cooking-030", "nodes": [
            {"id": "cooking-030-n001", "label": "شمارش موجودی آخر شب"},
            {"id": "cooking-030-j1"}]}), encoding="utf-8")
    rows = process_index(tmp_path, "cooking")
    assert rows == [{"process": "cooking-030", "node": "cooking-030-n001",
                     "label": "شمارش موجودی آخر شب"}]
    assert rank(rows, _tokens("موجودی"), 5, lambda r: r["label"]) == rows


def test_function_library_folds_one_body_into_one_section():
    dumps, _ = estate()
    dumps["SID_K"]["names"] = [
        {"name": "FILTER_BY_DATE", "scope": "workbook",
         "formula": "LAMBDA(data,  date, FILTER(data, INDEX(data,,1) = date))"}]
    text = function_library(dumps, [("Gozareshat/Gozareshat.gs",
                                     "function getWeekDayCoefficient(d) {\n"
                                     "  return d === 5 ? 1.4 : 1;\n}\n")])
    assert text.count("## FILTER_BY_DATE") == 1        # one body, two definers
    assert "SID_G" in text and "SID_K" in text
    assert "## getWeekDayCoefficient" in text
    assert "return d === 5 ? 1.4 : 1;" in text
    assert "مغایرت!F6:F19" in text                     # its callers


def test_unit_symbols_and_skeleton_written(tmp_path):
    (tmp_path / "facts").mkdir()
    (tmp_path / "facts" / "records.json").write_text(json.dumps(
        {"schema_version": 2, "entries": [{
            "id": "F-00001", "kind": "record", "key": "units", "retired": False,
            "valid_to": None, "data": {"rows": [
                {"key": "kg", "retired": False, "valid_to": None},
                {"key": "g", "retired": False, "valid_to": None},
                {"key": "old", "retired": True, "valid_to": None}]}}]}),
        ensure_ascii=False), encoding="utf-8")
    symbols = unit_symbols(tmp_path)
    assert symbols == ["g", "kg"]
    path = write_skeleton(tmp_path, "cooking", "20260906-101500", symbols,
                          [{"id": "S-i-0123456789ab", "kind": "item",
                            "unit": "u-items-food1", "payload": {"code": "#1"}}],
                          [], [], [])
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["schema_version"] == 1 and doc["department"] == "cooking"
    assert doc["unit_symbols"] == ["g", "kg"]
    assert doc["candidates"][0]["id"] == "S-i-0123456789ab"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_edges.py -q`   Expected: FAIL with `ImportError: cannot import name 'import_edges' from 'facts_plan.build'`

- [ ] **Step 3: Write minimal implementation**

Append to `engine/facts_plan/build.py` (the module already imports `pathlib`, `re`, `read_json`, `write_json_atomic`; add `csv`, `unicodedata`, `from dump_workbook import is_ids_tab, is_mirror_tab`, `from merge_facts import is_open`):

```python
# --------------------------------------------------------------------------
# folding and tokens — comparison only; the store keeps its own bytes.

_FOLD = {ord("ي"): "ی", ord("ك"): "ک", 0x200C: None, 0x200F: None, 0x200E: None}


def _fold(text):
    return "".join(unicodedata.normalize("NFKC", str(text))
                   .translate(_FOLD).split()).casefold()


def _tokens(text):
    """The words a slice ranks on — folded, and short ones dropped so «و» and
    «به» do not decide which entry the unit gets to reuse."""
    return {t for t in re.split(r"\W+", _fold(text), flags=re.UNICODE) if len(t) > 2}


def _issue(kind, instance, description, run_only=False):
    return {"kind": kind, "instance": instance, "description": description,
            "run_only": run_only}


def _col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def _ident(formula, name):
    """Does `formula` name `name` as an identifier — not as a fragment of a
    longer one (`Salon_Recipts_Chalebagh` must not match `Salon_Recipts`)."""
    return re.search(rf"(?<![A-Za-z0-9_]){re.escape(name)}(?![A-Za-z0-9_])",
                     formula) is not None


# --------------------------------------------------------------------------
# import edges (QF-48) — a mirror tab is an edge, never an entry.

_IMPORT_CALL = re.compile(r"IMPORT_FROM_SHEET\s*\(\s*([^,()]+?)\s*,\s*"
                          r"([^,()]+?)\s*,\s*([^,()]+?)\s*\)")
_IDS_CELL = re.compile(r"^'?([^'!]+?)'?!\$?([A-Z]{1,3})\$?([0-9]+)$")
_WHOLE_TAB = re.compile(r"^'?([^'!]+?)'?!\$?[A-Z]{0,3}\$?[0-9]*"
                        r"(?::\$?[A-Z]{0,3}\$?[0-9]*)?$")
_COLUMN_N = re.compile(r"^Column ?\d+$")
_DATE_FN = re.compile(r"FORMAT_PERSIAN_DATE|FILTER_BY_DATE|"
                      r"GET_(?:CELL_VALUE|ROW)_BY_PERSIAN_DATE")


def _argument(formula, arg):
    """An `IMPORT_FROM_SHEET` argument as a value: a quoted literal is itself,
    a bare identifier is the literal the same `LET` bound to it — the estate
    always writes `sheetName,"خمیر"` and passes `sheetName`."""
    arg = arg.strip()
    if arg.startswith('"'):
        return arg.strip('"')
    m = re.search(rf'(?<![A-Za-z0-9_]){re.escape(arg)}\s*,\s*"([^"]*)"', formula)
    return m.group(1) if m else arg


def _column_name(dump, tab, letters):
    """`rows.tsv` names its columns by header text, so a `$B$7` is read back
    through the header row of the same tab; an empty header cell falls back to
    the column letter, exactly as `dump_workbook._reference_rows` does."""
    sheet = next((s for s in dump["sheets"]["sheets"] if s["name"] == tab), None)
    head = (sheet or {}).get("head") or []
    index = _col_index(letters)
    header = (sheet or {}).get("header_row")
    row = head[header - 1] if header and header <= len(head) else []
    return (row[index - 1].strip() if index <= len(row) else "") or letters


def resolve_source(dump, named_range):
    """The three hops of §2.3: a named range → a cell of the ids tab → the
    spreadsheetId that cell holds. `None` when any hop misses."""
    ref = next((r["formula"] for r in dump["names"]
                if r["name"] == named_range), None)
    m = _IDS_CELL.match((ref or "").strip())
    if not m:
        return None
    tab, letters, row = m.group(1), m.group(2), m.group(3)
    column = _column_name(dump, tab, letters)
    for line in dump["rows"]:
        if line.get("sheet") == tab and str(line.get("row")) == row:
            return (line.get(column) or "").strip() or None
    return None


def mirror_names(dump, tab):
    """The names a consumer formula can call a mirror by — a whole-tab defined
    name, plus the tab's own name when it is a `Table_*` identifier (§2.3(e)
    rewrites that one to `$T`). Nothing else reaches a mirrored table."""
    out = []
    for row in dump["names"]:
        m = _WHOLE_TAB.match(row["formula"].strip())
        if m and m.group(1) == tab:
            out.append(row["name"])
    if tab.startswith("Table_"):
        out.append(tab)
    return out


def _range_columns(rng, width):
    """`A:D` → `(1, 4)`; a range naming no column covers the whole header."""
    letters = re.findall(r"[A-Z]{1,3}", (rng or "").upper())
    if not letters:
        return 1, width
    return _col_index(letters[0]), _col_index(letters[-1])


def _range_issues(source_dump, sheet_name, rng, instance, date_logic):
    """What the pull drops, and whether it starts one column late (§2.3). An
    empty or `Column \\d+` header is not a named column, so dropping it costs
    the consumer nothing and raises nothing."""
    sheet = next((s for s in (source_dump or {}).get("sheets", {}).get("sheets", [])
                  if s["name"] == sheet_name), None)
    if sheet is None or not sheet.get("header_row"):
        return []
    header = (sheet["head"] or [[]])[sheet["header_row"] - 1]
    first, last = _range_columns(rng, len(header))
    dropped = [h.strip() for i, h in enumerate(header, start=1)
               if not first <= i <= last and h.strip()
               and not _COLUMN_N.match(h.strip())]
    out = []
    if dropped:
        out.append(_issue("column_shift", instance,
                          "ستون‌های «" + "»، «".join(dropped)
                          + "» در کپی این جدول جا افتاده‌اند"))
    lead = header[0].strip() if header else ""
    if date_logic and first == 1 and (not lead or _COLUMN_N.match(lead)):
        out.append(_issue("leading_offset", instance,
                          "ستون اول جدول مبدأ نام ندارد و ستون‌های تاریخ یکی "
                          "جابه‌جا خوانده می‌شوند"))
    return out


def import_edges(dumps, manifest, refs):
    """`(imports[], issues[])` for every mirror tab in `dumps` (QF-48).

    `refs` maps `(spreadsheetId, sheet)` onto the ref the source record already
    has — `S-rec-…` for a template of this run, `F-…` for one in the store; a
    pair missing from it leaves the edge on its locator, which every reader
    accepts (§10). One member is written per consumer instance, because that is
    where `imports[]` lives on the entry.
    """
    shorts = {w["spreadsheetId"]: w["short"] for w in manifest["workbooks"]}
    edges, issues = [], []
    for sid, dump in sorted(dumps.items()):
        by_tab = {}
        for row in dump["formulas"]:
            by_tab.setdefault(row["sheet"], []).append(row)
        short = shorts.get(sid, sid)
        for sheet in dump["sheets"]["sheets"]:
            tab, rows = sheet["name"], by_tab.get(sheet["name"], [])
            if not is_mirror_tab(rows):
                continue
            here = f'{short}__s{sheet["sheetId"]}'
            call = _IMPORT_CALL.search(rows[0]["formula"])
            if call is None:
                continue
            named_range = call.group(1).strip()
            source_id = resolve_source(dump, named_range)
            if source_id is None or source_id not in shorts:
                issues.append(_issue("unknown_source", here,
                                     f"«{tab}» از فایلی می‌خواند که در فهرست "
                                     "فایل‌ها نیست"))
                continue
            source_sheet = _argument(rows[0]["formula"], call.group(2))
            rng = _argument(rows[0]["formula"], call.group(3))
            names = mirror_names(dump, tab)
            reading = [(s, f) for s in dump["sheets"]["sheets"]
                       for f in by_tab.get(s["name"], [])
                       if s["name"] != tab
                       and any(_ident(f["formula"], n) for n in names)]
            consumers = sorted({f'{short}__s{s["sheetId"]}' for s, _ in reading})
            if not consumers:
                issues.append(_issue("unused_mirror", here,
                                     f"«{tab}» کپی می‌گیرد ولی هیچ فرمولی از "
                                     "آن نمی‌خواند"))
            source = refs.get((source_id, source_sheet)) \
                or {"spreadsheetId": source_id, "sheet": source_sheet}
            for consumer in consumers:
                edges.append({"consumer": consumer, "source": source,
                              "range": rng, "named_range": named_range})
            issues += _range_issues(dumps.get(source_id), source_sheet, rng, here,
                                    any(_DATE_FN.search(f["formula"])
                                        for _, f in reading))
    return edges, issues


# --------------------------------------------------------------------------
# context, the two slices, the library

_NEEDS_TAB = _fold("نیازمندیها و مشکلات")


def _business_threshold(row):
    """A colour rule earns its place when it matches text or compares against a
    number that is not zero — a sign test at zero is formatting, not a rule."""
    if "containsText" in row["type"] or '"' in row["type"]:
        return True
    try:
        return float(row["formula"]) != 0
    except ValueError:
        return False


def context_items(dumps, sids):
    """The context §2.3 lists — cell comments, the conditional formats that
    carry a business threshold, and the «نیازمندیها و مشکلات» rows. A sign test
    at zero and a rule with no format are filtered out here, so the model never
    spends a decision on them."""
    out = []
    for sid in sorted(sids):
        dump = dumps[sid]
        for row in dump["comments"]:
            out.append({"kind": "comment", "sheet": row["sheet"],
                        "where": row["cell"], "text": row["text"]})
        for row in dump["cf"]:
            if row["format"].strip() and _business_threshold(row):
                out.append({"kind": "cf", "sheet": row["sheet"],
                            "where": row["range"],
                            "text": f'{row["type"]} {row["formula"]} '
                                    f'→ {row["format"]}'})
        for sheet in dump["sheets"]["sheets"]:
            if _fold(sheet["name"]) != _NEEDS_TAB:
                continue
            for line in sheet["head"]:
                text = " | ".join(c for c in line if c.strip())
                if text:
                    out.append({"kind": "note_tab", "sheet": sheet["name"],
                                "where": "", "text": text})
    return out


def rank(rows, tokens, cap, text):
    """First `cap` rows by tokens shared with the unit, ties by the caller's own
    order — which is why the reuse slice sorts its rows by id first (§2.3)."""
    scored = sorted(enumerate(rows),
                    key=lambda pair: (-len(tokens & _tokens(text(pair[1]))),
                                      pair[0]))
    return [row for _, row in scored[:cap]]


def reuse_slice(own, index, item_units, department, tokens, cap=40):
    """This run's own record and item candidates first, unranked, then the
    store's open entries in this department or the universal scope, ranked and
    capped. The unit reuses a key off these lines or mints a new one; it never
    searches (§2.4)."""
    lines = [f'{c["id"]} · {c["kind"]} · {c["label"]}' for c in own]
    rows = sorted((r for r in index
                   if not r.get("retired")
                   and department in ((r.get("scope") or {}).get("departments")
                                      or [department])),
                  key=lambda r: r["id"])
    for row in rank(rows, tokens, cap,
                    lambda r: " ".join([r["title"], r["key"]]
                                       + (r.get("aliases") or []))):
        lines.append(" · ".join(x for x in [
            row["id"], row["kind"], row["key"], row["title"],
            "، ".join(row.get("aliases") or []), item_units.get(row["id"])] if x))
    return lines


def process_index(root, department):
    """`{process, node, label}` for every labelled node of the department's
    processes — the whole index a citation is checked against; the unit sees a
    ranked slice of it (§2.3)."""
    out = []
    directory = pathlib.Path(root) / "departments" / department / "processes"
    for path in sorted(directory.glob("*.json")):
        doc = read_json(path)
        for node in doc.get("nodes") or []:
            if node.get("label"):
                out.append({"process": doc["id"], "node": node["id"],
                            "label": node["label"]})
    return out


_GS_FN = re.compile(r"^\s*function\s+([A-Za-z_$][\w$]*)\s*\(", re.M)


def _gs_functions(text):
    """`[(name, body)]` from a `.gs` file, by brace matching.

    ponytail: a brace inside a string literal or a comment would end a body
    early; the estate's scripts have none, and the fix is a tokeniser nobody
    needs yet.
    """
    out = []
    for m in _GS_FN.finditer(text):
        start = text.find("{", m.end() - 1)
        if start < 0:
            continue
        depth, i = 0, start
        while i < len(text):
            depth += (text[i] == "{") - (text[i] == "}")
            if depth == 0:
                break
            i += 1
        out.append((m.group(1), text[m.start():i + 1].strip()))
    return out


def _add_section(sections, name, kind, definer, body):
    section = sections.setdefault("".join(body.split()),
                                  {"name": name, "kind": kind, "definers": [],
                                   "body": body})
    if definer not in section["definers"]:
        section["definers"].append(definer)


def function_library(dumps, scripts):
    """`functions.md` (§3.4) — one section per distinct body over the whole
    estate: name, kind, definers, callers, the verbatim body. Bodies are
    compared with their whitespace folded, which is what makes one function
    defined in nine workbooks one section. `scripts` is `[(path, text)]`.

    ponytail: the caller scan is names × formulas (≈ 200 × 30 K on the estate,
    a few seconds); index by identifier if a department ever makes it hurt.
    """
    sections = {}
    for sid, dump in sorted(dumps.items()):
        for row in dump["names"]:
            if row["formula"].lstrip().upper().startswith("LAMBDA("):
                _add_section(sections, row["name"], "named", sid, row["formula"])
    for path, text in sorted(scripts):
        for name, body in _gs_functions(text):
            _add_section(sections, name, "script", path, body)
    names = {s["name"] for s in sections.values()}
    calls = {name: [] for name in names}
    for sid, dump in sorted(dumps.items()):
        for row in dump["formulas"]:
            for name in names:
                if _ident(row["formula"], name):
                    calls[name].append(f'{sid} · {row["sheet"]}!{row["range"]}')
    out = ["# کتابخانهٔ توابع", "",
           "این فایل توسط `facts-plan build` ساخته می‌شود و هیچ ورودی‌ای در "
           "انبارهٔ داده‌ها ندارد.", ""]
    for section in sorted(sections.values(), key=lambda s: s["name"]):
        out += [f'## {section["name"]} ({section["kind"]})', "",
                "تعریف‌شده در: " + "، ".join(section["definers"]), "",
                "فراخوانی: " + ("، ".join(calls[section["name"]][:20]) or "—"), "",
                "```", section["body"], "```", ""]
    return "\n".join(out)


# --------------------------------------------------------------------------
# what the store lends the build

def unit_symbols(root):
    """The open row keys of the `units` record — the lint's exemption list
    (§2.3), and one of the only two payload facts `build` reads off the store."""
    try:
        doc = read_json(pathlib.Path(root) / "facts" / "records.json")
    except (OSError, ValueError):
        return []
    for entry in doc.get("entries") or []:
        if entry.get("key") == "units" and is_open(entry):
            return sorted(r["key"] for r in (entry.get("data") or {}).get("rows")
                          or [] if r.get("key") and is_open(r))
    return []


def write_skeleton(run_dir, department, run, symbols, candidates, instances,
                   imports, issues):
    """`skeleton.json` — the only place the mechanical payload lives (§2.3);
    `plan.json` carries ids alone."""
    path = pathlib.Path(run_dir) / "skeleton.json"
    write_json_atomic(path, {"schema_version": 1, "department": department,
                             "run": run, "unit_symbols": symbols,
                             "candidates": candidates, "instances": instances,
                             "imports": imports, "issues": issues})
    return path
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_edges.py -q`   Expected: PASS

- [ ] **Step 5: Commit**

```
git add engine/facts_plan/build.py engine/tests/facts_plan_helpers.py engine/tests/test_facts_plan_edges.py
git commit -m "feat(facts): import edges, context, the reuse and process slices, functions.md, skeleton.json

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 13: `plan.json`, `input.md`, the two cards, `facts-plan status`

**Files:**
- Modify: `engine/facts_plan/build.py` (append), `engine/facts_plan/cli.py` (the `status` verb, created empty of body in T9)
- Modify: `engine/pyproject.toml:26-28` (add the `package-data` table so the cards ship)
- Create: `engine/facts_plan/cards/expression.md`, `engine/facts_plan/cards/style.md`
- Test: `engine/tests/test_facts_plan_units.py`, `engine/tests/test_facts_plan_status.py`, `engine/tests/test_facts_plan_cards.py`

**Interfaces:**
- Consumes: `facts_plan.build.estimate_tokens` (T9); `facts_plan.build._fold`, `_tokens`, `_issue`, `rank`, `context_items`, `reuse_slice`, `process_index` (T12); `merge_facts.sha256_file`; `merge_facts.content.KEYWORDS`, `PIPELINE_WORDS`, `COLLOQUIAL` (T6); `merge_facts.SEGMENT_RE`; `engine_common.read_json/write_json_atomic/write_text_atomic`.
- Produces, in `facts_plan.build`:
  - `group_key(row) -> str`, `is_reference_workbook(row, dump) -> bool`, `workbook_groups(manifest, department, reference_only=()) -> dict`
  - `transcript_chunks(text, budget=18000) -> list[tuple[int, int]]`
  - `est_tokens_out(candidates, est_tokens_in, is_transcript) -> int`
  - `label_of(candidate) -> str`, `candidate_instances(candidate) -> list[str]`
  - `fits(unit, text) -> bool`, `split_unit(unit, skeleton, render) -> list[dict]`
  - `plan_units(skeleton, groups, chunks, items, attachments) -> list[dict]` — sets each candidate's `unit` and returns the plan's `units[]`
  - `write_plan(run_dir, department, hashes, units) -> pathlib.Path`
  - `render_input(unit, skeleton, extras) -> str`, `cards() -> tuple[str, str]`
- Produces, in `facts_plan.cli`: `unit_states(root, run_dir, units, check=None) -> list[dict]`, `status(root, run_dir, *, new_turn=False) -> dict`, `check_rebuild(root, run_dir, rebuild) -> None`.

Read first: `docs/…/2026-09-06-quantitative-facts-v3-design.md` §2.3's `plan.json` paragraph and §2.4; `data-repo/attachments/sheets/manifest.json` (the `dir` spellings the grouping has to survive: `MandeShab__ChaleBagh__Amar__Pitza` vs `MandeShab__Naharkhoran__Amar__Pitza`, and `Ashpazkhane__Ashpazkhne - Chalebagh` where the branch sits inside a segment); `engine/merge_facts/content.py:38-48` (the keyword set and the row-name reserve the expression card transcribes).

- [ ] **Step 1: Write the failing test**

`engine/tests/test_facts_plan_units.py`:

```python
import json

import pytest

from facts_plan.build import (est_tokens_out, group_key, label_of, plan_units,
                              render_input, split_unit, transcript_chunks,
                              workbook_groups, write_plan)
from facts_plan_helpers import estate


def _wb(short, directory, twin=None, reference=()):
    return {"spreadsheetId": short.upper(), "short": short, "dir": directory,
            "departments": ["cooking"], "branches": [], "confirmed": True,
            "reference_tabs": list(reference), "twin_of": twin,
            "file": f"{short}.xlsx", "scripts": []}


def test_branch_token_folds_wherever_it_sits():
    assert group_key(_wb("pitza", "MandeShab__ChaleBagh__Amar__Pitza")) == \
        group_key(_wb("amar_pitza", "MandeShab__Naharkhoran__Amar__Pitza"))
    assert group_key(_wb("ash_c", "Ashpazkhane__Ashpazkhne - Chalebagh")) == \
        group_key(_wb("ash_n", "Ashpazkhane__Ashpazkhne - NaharKhoran"))


def test_twin_of_joins_two_groups_and_ids_take_the_lowest_short():
    manifest = {"workbooks": [
        _wb("sokhari", "MandeShab__ChaleBagh__Amar__Sokhari"),
        _wb("fried", "MandeShab__Naharkhoran__Amar__FRIED", twin="sokhari")]}
    groups = workbook_groups(manifest, "cooking")
    assert len(groups) == 1
    assert sorted(w["short"] for w in list(groups.values())[0]) == ["fried", "sokhari"]


def test_unit_ids_and_budgets():
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "pitza__s5", "sheet": "پیتزا"}],
                     "fields": [{"key": "c_a"}, {"key": "c_b"}]}},
        {"id": "S-r-0000000000002", "kind": "rule",
         "payload": {"output": "انحراف",
                     "applies_to": [{"key": "pitza__s5__j__r6"}]}}],
        "instances": [{"key": "pitza__s5", "sheetId": 5}]}
    manifest = {"workbooks": [_wb("pitza", "MandeShab__ChaleBagh__Amar__Pitza")]}
    units = plan_units(skeleton, workbook_groups(manifest, "cooking"),
                       [], [], [])
    assert [u["id"] for u in units] == ["u-wb-pitza"]
    assert units[0]["type"] == "workbook"
    assert units[0]["candidates"] == ["S-r-0000000000002", "S-rec-000000000001"]
    assert units[0]["est_tokens_out"] == 150 + 60 * 2 + 250
    assert skeleton["candidates"][0]["unit"] == "u-wb-pitza"


def test_transcript_chunks_are_line_aligned_and_named_by_first_line():
    text = "\n".join(f"line {n} " + "و" * 400 for n in range(1, 21))
    chunks = transcript_chunks(text, budget=1000)
    assert chunks[0][0] == 1 and len(chunks) > 1
    assert chunks[1][0] == chunks[0][1] + 1            # no line lost, none shared
    units = plan_units({"candidates": [], "instances": []}, {},
                       [("cooking-1405-05-26", "meetings/transcripts/"
                         "cooking-1405-05-26.txt", chunks[0], "x")], [], [])
    assert units[0]["id"] == "u-tr-cooking-1405-05-26-l1"
    assert units[0]["inputs"] == ["meetings/transcripts/cooking-1405-05-26.txt"
                                  f"#L{chunks[0][0]}-L{chunks[0][1]}"]


def test_a_group_over_budget_splits_on_its_tabs_and_keeps_the_axis_in_the_id():
    skeleton = {"candidates": [
        {"id": f"S-rec-00000000000{n}", "kind": "record",
         "payload": {"instances": [{"key": f"gozaresh__s{n}", "sheet": f"t{n}"}],
                     "fields": [{"key": "c_a"}] * 200}} for n in (1, 2)],
        "instances": [{"key": "gozaresh__s1", "sheetId": 1},
                      {"key": "gozaresh__s2", "sheetId": 2}]}
    unit = {"id": "u-wb-gozaresh", "type": "workbook", "inputs": [],
            "candidates": [c["id"] for c in skeleton["candidates"]],
            "nodes": [], "est_tokens_in": 0, "est_tokens_out": 24500}
    parts = split_unit(unit, skeleton, lambda u: "x")
    assert [p["id"] for p in parts] == ["u-wb-gozaresh-s1", "u-wb-gozaresh-s2"]
    assert all(p["est_tokens_out"] <= 20000 for p in parts)


def test_an_unsplittable_group_exits_2(capsys):
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "x__s1"}],
                     "fields": [{"key": "c_a"}] * 400}}],
        "instances": [{"key": "x__s1", "sheetId": 1}]}
    unit = {"id": "u-wb-x", "type": "workbook", "inputs": [],
            "candidates": ["S-rec-000000000001"], "nodes": [],
            "est_tokens_in": 0, "est_tokens_out": 24150}
    with pytest.raises(SystemExit) as excinfo:
        split_unit(unit, skeleton, lambda u: "x")
    assert excinfo.value.code == 2
    assert "u-wb-x" in capsys.readouterr().err


def test_input_md_carries_the_candidates_the_slices_and_both_cards():
    skeleton = {"unit_symbols": ["kg"], "candidates": [
        {"id": "S-r-0000000000002", "kind": "rule", "unit": "u-wb-pitza",
         "payload": {"output": "انحراف", "input_headers": ["مصرف واقعی"],
                     "variants": [{"shape": "MINUS(@,@)"}],
                     "applies_to": [{"key": "pitza__s5__j__r6", "params": {}}]}}],
        "instances": [{"key": "pitza__s5", "sheetId": 5, "sheet": "پیتزا",
                       "branch": "chalebagh"}]}
    unit = {"id": "u-wb-pitza", "type": "workbook", "inputs": [],
            "candidates": ["S-r-0000000000002"], "nodes": [],
            "est_tokens_in": 0, "est_tokens_out": 250}
    text = render_input(unit, skeleton, {"text": "", "context": [],
                                         "reuse": ["F-00002 · item · item_1 · پنیر"],
                                         "processes": ["cooking-030 · n001 · شمارش"],
                                         "field_tables": ["S-rec-… · «پیتزا» · c_a"]})
    assert "S-r-0000000000002 · «انحراف»" in text
    assert "MINUS(@,@)" in text and "1 bindings" in text
    assert "F-00002 · item · item_1 · پنیر" in text
    assert "cooking-030 · n001 · شمارش" in text
    assert "Expression card" in text and "Style card" in text


def test_plan_json_records_the_hashes(tmp_path):
    path = write_plan(tmp_path, "cooking",
                      {"attachments/sheets/.dump/SID/sheets.json": "sha256:ab"},
                      [{"id": "u-wb-pitza", "type": "workbook", "inputs": [],
                        "candidates": [], "nodes": [], "est_tokens_in": 1,
                        "est_tokens_out": 2}])
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["schema_version"] == 1 and doc["department"] == "cooking"
    assert doc["hashes"] == {"attachments/sheets/.dump/SID/sheets.json": "sha256:ab"}


def test_label_of():
    assert label_of({"kind": "item", "payload": {"code": "##1",
                                                 "labels": ["پنیر"]}}) == "##1 پنیر"
```

`engine/tests/test_facts_plan_status.py`:

```python
import json

from facts_plan.cli import status, unit_states


def _run(tmp_path, units=("u-a", "u-b")):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units").mkdir(parents=True)
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": [{"id": u, "type": "workbook", "inputs": [], "candidates": [],
                    "nodes": [], "est_tokens_in": 1, "est_tokens_out": 1}
                   for u in units]}), encoding="utf-8")
    for u in units:
        (run_dir / "units" / u).mkdir()
    return run_dir


def _out(run_dir, unit, n, text):
    (run_dir / "units" / unit / f"out.{n}.json").write_text(text, encoding="utf-8")


def test_new_turn_stamps_and_yield_flips_at_2400(tmp_path, monkeypatch):
    run_dir = _run(tmp_path)
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1000000")
    status(tmp_path, run_dir, new_turn=True)
    assert json.loads((run_dir / "turn.json").read_text())["started_at"] \
        .endswith("Z")
    monkeypatch.setenv("SOURCE_DATE_EPOCH", str(1000000 + 2399))
    assert status(tmp_path, run_dir)["yield"] is False
    monkeypatch.setenv("SOURCE_DATE_EPOCH", str(1000000 + 2401))
    out = status(tmp_path, run_dir)
    assert out["yield"] is True and out["elapsed_s"] == 2401


def test_truncated_output_is_deleted_and_costs_no_attempt(tmp_path):
    run_dir = _run(tmp_path)
    _out(run_dir, "u-a", 1, '{"schema_version": 1, "unit": "u-a", "attempt": 1,')
    states = {s["id"]: s for s in unit_states(tmp_path, run_dir,
                                              [{"id": "u-a", "type": "workbook"}])}
    assert states["u-a"] == {"id": "u-a", "type": "workbook", "state": "pending",
                             "attempts": 0}
    assert not (run_dir / "units" / "u-a" / "out.1.json").exists()


def test_two_refused_attempts_are_failed_one_is_pending(tmp_path):
    run_dir = _run(tmp_path)
    _out(run_dir, "u-a", 1, "{}")
    refuse = lambda path: ["no"]
    units = [{"id": "u-a", "type": "workbook"}]
    assert unit_states(tmp_path, run_dir, units, check=refuse)[0]["state"] == "pending"
    _out(run_dir, "u-a", 2, "{}")
    state = unit_states(tmp_path, run_dir, units, check=refuse)[0]
    assert state["state"] == "failed" and state["attempts"] == 2
    assert unit_states(tmp_path, run_dir, units,
                       check=lambda path: [])[0]["state"] == "done"


def test_plan_stale_when_a_dump_moved(tmp_path, monkeypatch):
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1000000")
    run_dir = _run(tmp_path)
    dump = tmp_path / "attachments" / "sheets" / ".dump" / "SID"
    dump.mkdir(parents=True)
    (dump / "sheets.json").write_text("{}", encoding="utf-8")
    plan = json.loads((run_dir / "plan.json").read_text())
    from merge_facts import sha256_file
    plan["hashes"] = {"attachments/sheets/.dump/SID/sheets.json":
                      sha256_file(dump / "sheets.json")}
    (run_dir / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    assert status(tmp_path, run_dir)["plan_stale"] is False
    (dump / "sheets.json").write_text('{"x": 1}', encoding="utf-8")
    assert status(tmp_path, run_dir)["plan_stale"] is True
```

`engine/tests/test_facts_plan_cards.py`:

```python
from facts_plan.build import cards
from merge_facts import SEGMENT_RE
from merge_facts.content import COLLOQUIAL, KEYWORDS, PIPELINE_WORDS


def test_expression_card_agrees_with_the_checker():
    expression, _ = cards()
    for keyword in KEYWORDS:
        assert keyword in expression, keyword
    assert SEGMENT_RE.pattern in expression
    assert "sum over" in expression
    assert '"param"' in expression


def test_style_card_names_every_word_the_lint_refuses():
    _, style = cards()
    for word in PIPELINE_WORDS + COLLOQUIAL:
        assert word in style, word
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_units.py engine/tests/test_facts_plan_status.py engine/tests/test_facts_plan_cards.py -q`   Expected: FAIL with `ImportError: cannot import name 'plan_units' from 'facts_plan.build'`

- [ ] **Step 3: Write the grouping, the budgets and the plan**

Append to `engine/facts_plan/build.py`:

```python
# --------------------------------------------------------------------------
# units of work (QF-51) — the grouping is fixed, not packed.

_BRANCH_TOKEN = re.compile(r"chale ?bagh|nahar ?khoran", re.I)
IN_BUDGET, OUT_BUDGET = 20000, 20000
MAX_LINES, MAX_LINE = 1800, 1900
EST_OUT = {"item": 120, "rule": 250, "script": 250}


def group_key(row):
    """The workbook group §2.3 fixes: the manifest `dir` with the branch token
    taken out **wherever it sits** — the estate spells it as its own segment
    (`MandeShab__ChaleBagh__Amar__Kanter`) and inside one (`Ashpazkhne -
    Chalebagh`), and both spellings have to land on one group."""
    bare = _BRANCH_TOKEN.sub("", row["dir"])
    return re.sub(r"[_\s-]+", "_", bare).strip("_").lower()


def is_reference_workbook(row, dump):
    """Every computing or tabular tab is a confirmed reference tab — the BOM
    book. It groups alone: its templates have no branch twin to merge with."""
    named = set(row.get("reference_tabs") or [])
    computing = {f["sheet"] for f in dump["formulas"]}
    rest = [s["name"] for s in dump["sheets"]["sheets"]
            if not s.get("empty") and s["name"] not in named
            and not is_ids_tab(s["name"]) and s["name"] in computing]
    return bool(named) and not rest


def workbook_groups(manifest, department, reference_only=()):
    """`{group key: [manifest rows]}` — the fixed grouping, the `twin_of` pairs
    the estate needs for the two unnamed twins, and a reference workbook alone.

    ponytail: `twin_of` is resolved in one pass over pairs; the estate has two
    twins and no chains, and a union-find for two pairs is a joke.
    """
    rows = [w for w in manifest["workbooks"]
            if department in (w.get("departments") or []) and w.get("confirmed")]
    key_of = {w["short"]: (w["short"] if w["short"] in reference_only
                           else group_key(w)) for w in rows}
    for w in rows:
        twin = w.get("twin_of")
        if twin in key_of:
            key_of[w["short"]] = key_of[twin] = min(key_of[w["short"]],
                                                    key_of[twin])
    groups = {}
    for w in sorted(rows, key=lambda r: r["short"]):
        groups.setdefault(key_of[w["short"]], []).append(w)
    return groups


def transcript_chunks(text, budget=18000):
    """Line-aligned chunks under `budget` (§2.3). The rendered input carries the
    cards and the slices too, so a chunk's own budget is below the unit's."""
    lines = text.splitlines()
    if not lines:
        return [(1, 1)]
    chunks, first, size = [], 1, 0
    for n, line in enumerate(lines, start=1):
        cost = estimate_tokens(line) + 1
        if size and size + cost > budget:
            chunks.append((first, n - 1))
            first, size = n, 0
        size += cost
    chunks.append((first, len(lines)))
    return chunks


def est_tokens_out(candidates, est_tokens_in, is_transcript):
    """§2.3's estimator. The constants are frozen in `expected.json` (§7), so a
    retune shows up as a fixture diff and never as a silent resize."""
    total = 0
    for c in candidates:
        if c["kind"] == "record":
            total += 150 + 60 * len(c["payload"].get("fields") or [])
        else:
            total += EST_OUT[c["kind"]]
    return total + (int(est_tokens_in * 0.4) if is_transcript else 0)


def label_of(candidate):
    """The candidate as a person reads it in a list — a record by its tab, a
    rule by the column header it computes, an item by its code."""
    payload = candidate["payload"]
    if candidate["kind"] == "record":
        return (payload.get("instances") or [{}])[0].get("sheet", "")
    if candidate["kind"] == "item":
        return f'{payload.get("code", "")} ' \
               f'{(payload.get("labels") or [""])[0]}'.strip()
    return payload.get("output") or payload.get("name") or ""


def candidate_instances(candidate):
    """The instance keys a candidate sits on — a record's own, a rule's through
    its bindings, whose key is `<instance>__<column>__r<row>`."""
    payload = candidate["payload"]
    if candidate["kind"] == "record":
        return [i["key"] for i in payload.get("instances") or []]
    return ["__".join(m["key"].split("__")[:2])
            for m in payload.get("applies_to") or []]


def _code_slug(code):
    """`##1` → `ing1`, `#1` → `food1` — a unit id becomes a directory name and a
    log line, and `#` belongs in neither."""
    digits = code.lstrip("#")
    return ("ing" if code.startswith("##") else "food") + digits


def fits(unit, text):
    lines = text.split("\n")
    return (estimate_tokens(text) <= IN_BUDGET
            and unit["est_tokens_out"] <= OUT_BUDGET
            and len(lines) <= MAX_LINES and max(map(len, lines)) <= MAX_LINE)


def _axis_parts(unit, skeleton):
    """`[(axis, [candidate ids])]` — the natural sub-axis of a unit over
    budget: a workbook by the tab its candidates sit on, items by half their
    code range, a transcript by half its line range."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    if unit["type"] == "workbook":
        sheet_of = {i["key"]: i["sheetId"] for i in skeleton["instances"]}
        parts = {}
        for cid in unit["candidates"]:
            keys = candidate_instances(by_id[cid])
            axis = f's{min((sheet_of.get(k, 0) for k in keys), default=0)}'
            parts.setdefault(axis, []).append(cid)
        return sorted(parts.items())
    if unit["type"] == "items":
        ids = sorted(unit["candidates"])
        half = len(ids) // 2
        if not half:
            return []
        return [(_code_slug(by_id[part[0]]["payload"]["code"]), part)
                for part in (ids[:half], ids[half:])]
    first, last = (int(n[1:]) for n in
                   unit["inputs"][0].rsplit("#", 1)[1].split("-"))
    if last <= first:
        return []
    middle = (first + last) // 2
    path = unit["inputs"][0].rsplit("#", 1)[0]
    return [(f"l{a}", [f"{path}#L{a}-L{b}"])
            for a, b in ((first, middle), (middle + 1, last))]


def split_unit(unit, skeleton, render):
    """A unit over a bound splits along its axis and each part is named after
    it (`u-wb-gozaresh-s41`); a part with one axis value left cannot split, and
    `build` exits 2 rather than dispatch a unit that will be truncated."""
    parts = _axis_parts(unit, skeleton)
    if len(parts) < 2:
        print(f"facts-plan: unit {unit['id']} is over budget and has no axis "
              "left to split on", file=sys.stderr)
        raise SystemExit(2)
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    out = []
    for axis, members in parts:
        if unit["type"] == "workbook":
            part = dict(unit, id=f'{unit["id"]}-{axis}', candidates=members)
        elif unit["type"] == "items":
            part = dict(unit, id=f"u-items-{axis}", candidates=members)
        else:
            head = unit["id"].rsplit("-l", 1)[0]
            part = dict(unit, id=f"{head}-{axis}", inputs=members)
        text = render(part)
        part["est_tokens_in"] = estimate_tokens(text)
        part["est_tokens_out"] = est_tokens_out(
            [by_id[c] for c in part["candidates"]], part["est_tokens_in"],
            part["type"] == "transcript")
        out += [part] if fits(part, text) else split_unit(part, skeleton, render)
    return out


def plan_units(skeleton, groups, chunks, items, attachments, render=lambda u: ""):
    """`plan.json`'s `units[]` (§2.3) and, as a side effect, each candidate's
    `unit` — the two have to agree, so one function writes both.

    `chunks` is `[(recording, path, (first, last), text)]`, `items` the item
    candidate ids in code order, `attachments` the cached `.text`/`.md` paths;
    they are appended to the last transcript unit, or become one unit when the
    owner chose no recording (§2.3).
    """
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    shorts, units = {}, []
    for key, rows in sorted(groups.items()):
        shorts.update({w["spreadsheetId"]: w["short"] for w in rows})
    instance_book = {i["key"]: i["key"].split("__")[0]
                     for i in skeleton.get("instances") or []}
    for key, rows in sorted(groups.items()):
        mine = sorted(w["short"] for w in rows)
        members = sorted(
            cid for cid, c in by_id.items()
            if any(instance_book.get(k) in mine for k in candidate_instances(c)))
        if members:
            units.append({"id": f"u-wb-{mine[0]}", "type": "workbook",
                          "inputs": [w["file"] for w in rows],
                          "candidates": members, "nodes": [],
                          "est_tokens_in": 0, "est_tokens_out": 0})
    for recording, path, (first, last), text in chunks:
        units.append({"id": f"u-tr-{recording}-l{first}", "type": "transcript",
                      "inputs": [f"{path}#L{first}-L{last}"], "candidates": [],
                      "nodes": [], "est_tokens_in": estimate_tokens(text),
                      "est_tokens_out": 0})
    if items:
        units.append({"id": f"u-items-{_code_slug(by_id[items[0]]['payload']['code'])}",
                      "type": "items", "inputs": [], "candidates": list(items),
                      "nodes": [], "est_tokens_in": 0, "est_tokens_out": 0})
    if attachments:
        transcripts = [u for u in units if u["type"] == "transcript"]
        if transcripts:
            transcripts[-1]["inputs"] += list(attachments)
        else:
            units.append({"id": "u-attachments", "type": "attachment",
                          "inputs": list(attachments), "candidates": [],
                          "nodes": [], "est_tokens_in": 0, "est_tokens_out": 0})
    out = []
    for unit in units:
        unit["est_tokens_out"] = est_tokens_out(
            [by_id[c] for c in unit["candidates"]], unit["est_tokens_in"],
            unit["type"] == "transcript")
        text = render(unit)
        unit["est_tokens_in"] = max(unit["est_tokens_in"], estimate_tokens(text))
        out += [unit] if fits(unit, text) else split_unit(unit, skeleton, render)
    for unit in out:
        for cid in unit["candidates"]:
            by_id[cid]["unit"] = unit["id"]
    return out


def write_plan(run_dir, department, hashes, units):
    """`plan.json` — immutable build output: ids, budgets, and the digests
    `status` re-checks to report `plan_stale`."""
    path = pathlib.Path(run_dir) / "plan.json"
    write_json_atomic(path, {"schema_version": 1, "department": department,
                             "hashes": hashes, "units": units})
    return path
```

- [ ] **Step 4: Write `render_input` and the cards**

Append to `engine/facts_plan/build.py`:

```python
_CARDS = pathlib.Path(__file__).resolve().parent / "cards"


def cards():
    """The expression and style cards, verbatim (§2.4). Files in the package,
    not string literals: the prompt is reviewable as prose, and a test can diff
    the expression card against the checker it was transcribed from."""
    return ((_CARDS / "expression.md").read_text(encoding="utf-8"),
            (_CARDS / "style.md").read_text(encoding="utf-8"))


def _render_candidate(candidate, skeleton):
    payload, kind = candidate["payload"], candidate["kind"]
    if kind in ("rule", "script"):
        variants = payload.get("variants") or [{}]
        shapes = "؛ ".join(v.get("shape", "") for v in variants)
        params = sorted({k for m in payload.get("applies_to") or []
                         for k in (m.get("params") or {})})
        return (f'{candidate["id"]} · «{label_of(candidate)}» · '
                f'{len(variants)} variant · {shapes} · '
                f'{len(payload.get("applies_to") or [])} bindings · '
                f'params: {"، ".join(params) or "—"}')
    if kind == "record":
        instances = "، ".join(f'{i["key"]} ({i.get("branch") or "—"})'
                              for i in payload.get("instances") or [])
        fields = "، ".join(
            f'{f["key"]}={f.get("title") or "—"}[{f.get("type") or "?"}]'
            for f in payload.get("fields") or [])
        rows = payload.get("row_labels") or {}
        return (f'{candidate["id"]} · «{label_of(candidate)}» · {instances}\n'
                f'    fields: {fields}\n'
                f'    header notes: {" | ".join(payload.get("header_notes") or []) or "—"}\n'
                f'    row labels: {"، ".join(f"{k}={v}" for k, v in rows.items()) or "—"}')
    return (f'{candidate["id"]} · {payload.get("code")} · '
            f'{"، ".join(payload.get("labels") or [])}')


def render_input(unit, skeleton, extras):
    """`units/<u>/input.md` — everything the unit is allowed to know (§2.3). It
    reads this file and the schema, and nothing else: what is not here is a
    `drop` with `insufficient_context`, never a search (§2.4)."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    expression, style = cards()
    out = [f'# {unit["id"]}', "",
           f'نوع: {unit["type"]} — {len(unit["candidates"])} نامزد تصمیم', "",
           "## نامزدها", ""]
    out += [_render_candidate(by_id[c], skeleton) for c in unit["candidates"]] or ["—"]
    if extras.get("text"):
        out += ["", "## متن", "", extras["text"]]
    for title, key in (("## زمینه", "context"), ("## جدول‌های مرتبط", "field_tables"),
                       ("## ورودی‌های قابل استفادهٔ مجدد", "reuse"),
                       ("## گره‌های فرایند", "processes")):
        rows = extras.get(key) or []
        out += ["", title, ""] + [
            r if isinstance(r, str)
            else f'{r["kind"]} · {r["sheet"]}!{r["where"]} · {r["text"]}'
            for r in rows] or ["—"]
    out += ["", expression, "", style]
    return "\n".join(out)
```

`engine/facts_plan/cards/expression.md`:

```markdown
# Expression card

An `expr` is FEEL, and FEEL here is a closed subset. Nothing else parses.

**Keywords** — the only bare words that need no declaration:
`if` `then` `else` `and` `or` `not` `min` `max` `sum` `abs` `round` `over` `of`

**Identifiers.** Every other bare word must be declared: the `key` of one of the
rule's own `inputs[]` or `outputs[]`, or the `key` of an entry named in
`calls[]`. An identifier declared nowhere fails validation. A parameter is an
ordinary input: `{"key": "tolerance_gr", "from": {"param": "tolerancePerFoodGr"}}`
declares `tolerance_gr`, and the expression reads it by that name.

**The one aggregate form.** `sum over <input key> of ( … )` — the input key
names a record, and the identifiers inside the parentheses are that record's
field keys. There is no other loop and no other aggregate.

**`key`, never `name`.** Every member of `inputs[]`, `outputs[]`, `fields[]`,
`rows[]`, `applies_to[]`, `instances[]` is addressed by `key`.

**Minted segments** match `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` — lowercase ASCII
letters, digits, single underscores. `__` joins two segments into a key and is
never typed inside one. No Persian, no capital, no dash, and never a segment
transliterated from a Persian word you guessed at.

**Never call a library function.** `GET_ROW_BY_PERSIAN_DATE`, `FILTER_BY_DATE`,
`CONVERT_GR_TO_KG` and their kind are the sheet's plumbing. State the business
computation instead.

**Worked examples**

    masraf_elami = mojudi_avval_shab + daryaft_az_anbar - mojudi_akhar_shab
    enheraf = masraf_vaqei - masraf_elami
    enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis
    masraf_vaqei = sum over bom of (gram_per_portion * portions_sold)
```

`engine/facts_plan/cards/style.md`:

```markdown
# Style card

**`title`** — a noun phrase naming the concept. At most 60 characters, Persian,
no file, tab or cell name, no Latin except an item code.

**`statement`** — one to three sentences in the register of a written
procedure: what is measured or computed, in what unit, by whom, when; for a
record, what it is and who fills it; for an item, what it is and how it is
counted.

Never, in either field:

- an A1 address (`H6`, `$J$15`, `'پیتزا'!M6:M15`), a column letter, a tab, file
  or `Table_*` name;
- formula text, a function name, `IMPORT_FROM_SHEET`, `LET(`, `LAMBDA`,
  `.xlsx`, `.gs`;
- a schema field name, or this pipeline's vocabulary: «پاس», «اسکلت»,
  «بخش از داده‌ها», «واحد کاری», «بچ», «original», «bindings», «FEEL»,
  «account», «expr»;
- a Latin token of four letters or more — `csv`, `Excel`, `sheet`, a unit
  symbol and an item code are the only exceptions;
- a quotation, «گفته شد», «گوینده»;
- the colloquial endings «می‌زنن», «می‌کنن», «داشته باشن», «بگیم», «می‌گیم»;
- a «…» span longer than eight words.

«ستون», «تب» and «سلول» are allowed in exactly two places: a record's own
`statement`, and a field's `description`.

**Worked pair**

before — «ستون J تب پیتزا (گروه J6:J15): انحراف برابر است با مصرف واقعی منهای
مصرف اعلامی.»

after — «انحراف مصرف هر مادهٔ اولیه در پایان شب برابر است با مصرف واقعی
(برآوردشده از فروش و نسخهٔ غذاها) منهای مصرف اعلامی لاین. مقدار منفی یعنی لاین
بیش از انتظار مصرف کرده است.»

A quote belongs in `source[].quote`, a locator in `source[]`, a rival reading in
`accounts[].statement` — never in a title or a statement.
```

Add to `engine/pyproject.toml` after the `packages.find` table (line 28):

```toml
[tool.setuptools.package-data]
facts_plan = ["cards/*.md"]
```

- [ ] **Step 5: Write `status`**

Append to `engine/facts_plan/cli.py`:

```python
YIELD_AFTER_S = 2400


def _epoch():
    """`SOURCE_DATE_EPOCH` when set, else the clock (§4) — the fixture tests
    move time by moving the variable, and a run never notices."""
    stamp = os.environ.get("SOURCE_DATE_EPOCH")
    return int(stamp) if stamp else int(time.time())


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(_epoch()))


def unit_states(root, run_dir, units, check=None):
    """Every unit's state, derived from the filesystem and nowhere else (§2.3).

    A truncated or unparseable attempt is **deleted** here and costs no
    attempt: a crashed dispatch must not spend one of the two a unit gets.
    `check(path) -> list[str]` is the validator; with none, a parsing attempt
    counts as done.

    ponytail: `check` defaults to nothing so this lands before T14 — T14 wires
    `validate_unit` in as the default and this comment goes with it.
    """
    run_dir = pathlib.Path(run_dir)
    out = []
    for unit in units:
        attempts = []
        for path in sorted((run_dir / "units" / unit["id"]).glob("out.*.json")):
            try:
                read_json(path)
            except (OSError, ValueError):
                path.unlink(missing_ok=True)
                continue
            attempts.append(path)
        state = "pending"
        if attempts:
            problems = check(attempts[-1]) if check else []
            state = "done" if not problems else ("failed" if len(attempts) >= 2
                                                 else "pending")
        out.append({"id": unit["id"], "type": unit["type"], "state": state,
                    "attempts": len(attempts)})
    return out


def _stale(root, plan):
    """A dump or transcript that moved since `build` read it (§2.3)."""
    for rel, held in (plan or {}).get("hashes", {}).items():
        path = pathlib.Path(root) / rel
        if not path.is_file() or sha256_file(path) != held:
            return True
    return False


def _stage(run_dir, plan, states):
    """The resume ladder of §6, by artefact presence — nothing is recorded."""
    if plan is None:
        return "P"
    if any(s["state"] == "pending" for s in states):
        return "U"
    if not (run_dir / "facts-delta.json").is_file():
        return "R"
    if not (run_dir / "id-map.json").is_file():
        return "B"
    return "6"


def status(root, run_dir, *, new_turn=False):
    """§2.1 Stage 0 — the only engine output the coordinator reads."""
    run_dir = pathlib.Path(run_dir)
    turn = run_dir / "turn.json"
    if new_turn or not turn.is_file():
        write_json_atomic(turn, {"started_at": _now()})
    started = calendar.timegm(time.strptime(read_json(turn)["started_at"],
                                            "%Y-%m-%dT%H:%M:%SZ"))
    plan = read_json(run_dir / "plan.json") \
        if (run_dir / "plan.json").is_file() else None
    states = unit_states(root, run_dir, (plan or {}).get("units") or [])
    elapsed = _epoch() - started
    return {"stage": _stage(run_dir, plan, states), "units": states,
            "plan_stale": _stale(root, plan), "elapsed_s": elapsed,
            "yield": elapsed > YIELD_AFTER_S}


def check_rebuild(root, run_dir, rebuild):
    """§2.3 — a plan whose units have started is never silently replaced: the
    unit ids are a function of the estimate, so a re-estimate would renumber
    the directories a finished unit's output already sits in."""
    path = pathlib.Path(run_dir) / "plan.json"
    if rebuild or not path.is_file():
        return
    done = [u["id"] for u in unit_states(root, run_dir,
                                         read_json(path)["units"])
            if u["state"] == "done"]
    if done:
        print(f"facts-plan: {len(done)} unit(s) already done "
              f"({', '.join(done[:3])}); pass --rebuild to replace the plan",
              file=sys.stderr)
        raise SystemExit(2)
```

Its imports (`calendar`, `os`, `pathlib`, `sys`, `time`, `read_json`, `write_json_atomic`, `sha256_file` from `merge_facts`) go at the top of the module; the `status` subparser T9 created calls `status(root, args.run, new_turn=args.new_turn)` and prints one line per unit as `unit · type · state · attempts` followed by `stage/plan_stale/elapsed_s/yield`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_units.py engine/tests/test_facts_plan_status.py engine/tests/test_facts_plan_cards.py -q`   Expected: PASS

- [ ] **Step 7: Commit**

```
git add engine/facts_plan/build.py engine/facts_plan/cli.py engine/facts_plan/cards engine/pyproject.toml engine/tests/test_facts_plan_units.py engine/tests/test_facts_plan_status.py engine/tests/test_facts_plan_cards.py
git commit -m "feat(facts): plan.json, the unit inputs and both cards, facts-plan status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 14: `validate facts-unit <file> --run <run_dir>`

**Files:**
- Create: `engine/facts_plan/assemble.py` (the module T15 fills in; this task opens it with `validate_unit`)
- Modify: `engine/validate/cli.py:10-11,14-19` (a third content-pass branch), `engine/facts_plan/cli.py` (the `check=` default in `unit_states`)
- Test: `engine/tests/test_validate_facts_unit.py`

**Interfaces:**
- Consumes: `engine_common.validate`, `engine_common.read_json`; `merge_facts.content.lint_prose(text, *, exemptions, allow_sheet_words=False)` and `group_messages(messages)` (T6); `facts_plan.build.process_index(root, department)` (T12); `schemas/facts-unit.schema.json` (T2).
- Produces: `facts_plan.assemble.validate_unit(root, run_dir, path) -> list[str]` — the messages, empty when the document may pass; each names the skeleton id and the decision index.
- After this task `facts_plan.cli.unit_states` defaults `check` to `validate_unit`, which is what makes `status` report `done`/`failed` for real.

Read first: `engine/validate/cli.py` in full (33 lines; T5 has already added `--store`/`--run` to its parser, so this task only adds a branch), `engine/merge_facts/content.py:50-88` (`check_document`'s message style — one line per problem, prefixed with the entry's label), and §2.5's decision contract.

- [ ] **Step 1: Write the failing test**

`engine/tests/test_validate_facts_unit.py`:

```python
import json

import pytest

from facts_plan.assemble import validate_unit


def _run(tmp_path, candidates=("S-r-000000000001",)):
    root = tmp_path
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    (root / "departments" / "cooking" / "processes" / "cooking-030.json").write_text(
        json.dumps({"id": "cooking-030",
                    "nodes": [{"id": "cooking-030-n016", "label": "شمارش"}]}),
        encoding="utf-8")
    run_dir = root / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units" / "u-wb-pitza").mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": ["kg", "portion"],
         "candidates": [{"id": c, "kind": "rule", "unit": "u-wb-pitza",
                         "payload": {"output": "انحراف"}} for c in candidates],
         "instances": [], "imports": [], "issues": []}), ensure_ascii=False),
        encoding="utf-8")
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": [{"id": "u-wb-pitza", "type": "workbook", "inputs": [],
                    "candidates": list(candidates), "nodes": [],
                    "est_tokens_in": 1, "est_tokens_out": 1}]}), encoding="utf-8")
    return root, run_dir


def _doc(**over):
    doc = {"schema_version": 1, "unit": "u-wb-pitza", "attempt": 1,
           "decisions": [{"skeleton": "S-r-000000000001", "action": "keep",
                          "key": "enheraf", "title": "انحراف مصرف",
                          "statement": "انحراف مصرف هر مادهٔ اولیه برابر است با "
                                       "مصرف واقعی منهای مصرف اعلامی لاین.",
                          "data": {"inputs": [], "outputs": []}}],
           "new": []}
    doc.update(over)
    return doc


def _write(run_dir, doc, name="out.1.json"):
    path = run_dir / "units" / "u-wb-pitza" / name
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_a_complete_document_passes(tmp_path):
    root, run_dir = _run(tmp_path)
    assert validate_unit(root, run_dir, _write(run_dir, _doc())) == []


def test_an_undecided_candidate_is_named(tmp_path):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    problems = validate_unit(root, run_dir, _write(run_dir, _doc()))
    assert any("S-r-000000000002" in p and "no decision" in p for p in problems)


def test_a_candidate_decided_twice_and_an_unknown_skeleton(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"].append({"skeleton": "S-r-000000000001", "action": "drop",
                             "reason_code": "cosmetic"})
    doc["decisions"].append({"skeleton": "S-r-000000000009", "action": "drop",
                            "reason_code": "cosmetic"})
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert any("decisions[1]" in p and "twice" in p for p in problems)
    assert any("decisions[2]" in p and "S-r-000000000009" in p for p in problems)


def test_node_citation_checked_against_the_whole_index(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["processes"] = [{"process": "cooking-030",
                                         "node": "n016", "quote": "شمارش"}]
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    doc["decisions"][0]["processes"] = [{"process": "cooking-030",
                                         "node": "n999", "quote": "شمارش"}]
    assert any("n999" in p for p in
               validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")))


def test_provisional_field_ref_shape(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"]["inputs"] = [
        {"key": "a", "from": {"ref": "S-rec-000000000003", "field": "C_H"}}]
    assert any("C_H" in p for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_lint_runs_with_the_unit_symbols_exempted(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["statement"] = "انحراف در خانهٔ H6 نوشته می‌شود."
    assert any("H6" in p for p in validate_unit(root, run_dir, _write(run_dir, doc)))
    doc["decisions"][0]["statement"] = "مصرف بر حسب kg و portion ثبت می‌شود."
    assert validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")) == []


def test_a_unit_written_on_a_non_numeric_field_is_an_error(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"] = {"fields": [{"from": "c_a", "key": "nam",
                                               "type": "string", "unit": "kg"}]}
    assert any("nam" in p and "unit" in p
               for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_review_caps(tmp_path):
    root, run_dir = _run(tmp_path)
    (run_dir / "review").mkdir()
    doc = {"schema_version": 1, "unit": "review", "attempt": 1,
           "decisions": [{"entry": {"kind": "rule", "key": f"k{n}",
                                    "scope": {"departments": ["cooking"],
                                              "branches": []}},
                          "action": "drop", "reason_code": "duplicate"}
                         for n in range(61)],
           "new": []}
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    assert any("60" in p for p in validate_unit(root, run_dir, path))


def test_a_review_document_is_not_checked_for_completeness(tmp_path):
    root, run_dir = _run(tmp_path)
    (run_dir / "review").mkdir()
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps({"schema_version": 1, "unit": "review",
                                "attempt": 1, "decisions": [], "new": []}),
                    encoding="utf-8")
    assert validate_unit(root, run_dir, path) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_validate_facts_unit.py -q`   Expected: FAIL with `ModuleNotFoundError: No module named 'facts_plan.assemble'`

- [ ] **Step 3: Write `validate_unit`**

`engine/facts_plan/assemble.py` (new module — `digest`, `assemble` and `report` join it in T15/T16):

```python
"""`facts-plan digest | assemble | report`, and the `facts-unit` content pass.

A unit's output is checked the moment it returns (QF-51), by the same rules
`assemble` will later rely on — a document that passes here is one `assemble`
can fold in without asking the model anything twice.
"""
import json
import pathlib
import re

from engine_common import read_json, validate
from merge_facts.content import lint_prose

from facts_plan.build import process_index

PROVISIONAL_FIELD = re.compile(r"^c_[a-z]{1,3}$")
REVIEW_DECISIONS, REVIEW_REWRITES = 60, 20
PROSE_IN_DATA = ("grain", "method", "exceptions")


def _refs(value):
    """Every `{ref, field?}` object in a decision, in document order."""
    if isinstance(value, dict):
        if "ref" in value:
            yield value
        for member in value.values():
            yield from _refs(member)
    elif isinstance(value, list):
        for member in value:
            yield from _refs(member)


def validate_unit(root, run_dir, path):
    """Every message for one `facts-unit` document, empty when it may pass.

    Checks, in order: the schema; every candidate of the unit's `plan.json`
    list decided exactly once (a plan unit only — the review addresses
    assembled entries, which do not exist yet); `S-` refs naming a candidate of
    this run; node ids in the department's **whole** process index; the
    provisional field grammar; the review's two caps; the §5.2 lint on every
    prose field with `skeleton.json`'s `unit_symbols[]` exempted; and a `unit`
    written onto a field that is not a number.
    """
    root, run_dir, path = pathlib.Path(root), pathlib.Path(run_dir), pathlib.Path(path)
    try:
        doc = read_json(path)
    except (OSError, ValueError) as exc:
        return [f"{path.name}: not readable as JSON ({exc})"]
    try:
        validate("facts-unit.schema.json", doc)
    except ValueError as exc:
        return [str(exc)]

    skeleton = read_json(run_dir / "skeleton.json")
    plan = read_json(run_dir / "plan.json")
    known = {c["id"] for c in skeleton["candidates"]}
    symbols = skeleton.get("unit_symbols") or []
    nodes = process_index(root, skeleton["department"])
    node_ids = {f'{n["process"]}::{n["node"]}' for n in nodes} \
        | {f'{n["process"]}::{n["node"].rsplit("-", 1)[-1]}' for n in nodes}
    unit = next((u for u in plan["units"] if u["id"] == doc["unit"]), None)
    problems, seen = [], []

    if doc["unit"] == "review":
        if len(doc["decisions"]) > REVIEW_DECISIONS:
            problems.append(f"review: {len(doc['decisions'])} decisions, "
                            f"at most {REVIEW_DECISIONS} (§2.6)")
        rewrites = [d for d in doc["decisions"]
                    if d.get("action") == "keep" and d.get("statement")]
        if len(rewrites) > REVIEW_REWRITES:
            problems.append(f"review: {len(rewrites)} statement rewrites, "
                            f"at most {REVIEW_REWRITES} (§2.6)")

    for n, decision in enumerate(doc["decisions"]):
        label = f'decisions[{n}] {decision.get("skeleton") or decision.get("entry")}'
        skid = decision.get("skeleton")
        if skid:
            if skid not in known:
                problems.append(f"{label}: {skid} is not a candidate of this run")
            elif skid in seen:
                problems.append(f"{label}: {skid} is decided twice")
            seen.append(skid)
        for ref in _refs(decision):
            target = ref.get("ref")
            if isinstance(target, str) and target.startswith("S-") \
                    and target not in known:
                problems.append(f"{label}: ref {target} names no candidate")
            field = ref.get("field")
            if isinstance(field, str) and field.startswith("c_") \
                    and not PROVISIONAL_FIELD.match(field):
                problems.append(f"{label}: provisional field {field!r} is not "
                                "c_<column letter, lowercase>")
        for citation in decision.get("processes") or []:
            key = f'{citation["process"]}::{citation["node"]}'
            if key not in node_ids:
                problems.append(f'{label}: node {citation["node"]} is in no '
                                f'process of {skeleton["department"]}')
        for field in (decision.get("data") or {}).get("fields") or []:
            if field.get("unit") and field.get("type") not in (None, "number"):
                problems.append(f'{label}: field {field.get("key")} is '
                                f'{field.get("type")} and carries a unit')
        problems += _lint_decision(decision, label, symbols)

    if unit is not None:
        for cid in unit["candidates"]:
            if cid not in seen:
                problems.append(f'{doc["unit"]}: {cid} has no decision')
    return problems


def _lint_decision(decision, label, symbols):
    """§5.2 at unit level (QF-50) — the unit that wrote a failing sentence is
    the one that fixes it, which is only true while the decision is still
    addressable by its own index."""
    out = []
    parts = decision.get("into") if decision.get("action") == "split" else [decision]
    for part in parts or []:
        for key in ("title", "statement"):
            for message in lint_prose(part.get(key) or "", exemptions=symbols):
                out.append(f"{label}: {key}: {message}")
        for alias in part.get("aliases") or []:
            for message in lint_prose(alias, exemptions=symbols):
                out.append(f"{label}: aliases: {message}")
        data = part.get("data") or {}
        for key in PROSE_IN_DATA:
            for message in lint_prose(data.get(key) or "", exemptions=symbols):
                out.append(f"{label}: {key}: {message}")
        for field in data.get("fields") or []:
            for message in lint_prose(field.get("description") or "",
                                      exemptions=symbols, allow_sheet_words=True):
                out.append(f'{label}: fields/{field.get("key")}: {message}')
        for tracked in data.get("tracked") or []:
            for message in lint_prose(tracked.get("reason") or "",
                                      exemptions=symbols):
                out.append(f"{label}: tracked: {message}")
        for issue in data.get("issues") or []:
            if not issue.get("engine"):
                for message in lint_prose(issue.get("description") or "",
                                          exemptions=symbols):
                    out.append(f"{label}: issues: {message}")
    return out
```

Then in `engine/validate/cli.py`, add the branch — after the schema name is normalised (line 19) and before the file is read:

```python
    if name == "facts-unit.schema.json":
        if not args.run:
            print("validate: facts-unit needs --run <run_dir>", file=sys.stderr)
            raise SystemExit(2)
        from facts_plan.assemble import validate_unit
        problems = validate_unit(data_root(), args.run, args.file)
        for line in group_messages(problems):
            print(line, file=sys.stderr)
        if problems:
            raise SystemExit(2)
        print(f"OK: {args.file} conforms to {name}")
        return 0
```

with `group_messages` added to the `merge_facts.content` import on line 5 and `data_root` to the `engine_common` import on line 4. Finally, in `engine/facts_plan/cli.py`, change `unit_states`'s signature to `def unit_states(root, run_dir, units, check=_default_check):` with

```python
def _default_check(path):
    from facts_plan.assemble import validate_unit          # after T14
    return validate_unit(_ROOT_OF[0], _RUN_OF[0], path)
```

— no: keep it plain, `unit_states(root, run_dir, units, check=None)` gains, at the top of its body,

```python
    if check is None:
        from facts_plan.assemble import validate_unit
        check = lambda path: validate_unit(root, run_dir, path)
```

and the `ponytail:` note about the missing validator is deleted.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_validate_facts_unit.py engine/tests/test_facts_plan_status.py -q`   Expected: PASS

- [ ] **Step 5: Commit**

```
git add engine/facts_plan/assemble.py engine/facts_plan/cli.py engine/validate/cli.py engine/tests/test_validate_facts_unit.py
git commit -m "feat(facts): validate facts-unit --run, and status validates for real

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 15: `facts-plan digest` and `assemble` — the delta, `assembly.json`, `gate-b.md`

**Files:**
- Modify: `engine/facts_plan/assemble.py` (append), `engine/facts_plan/cli.py` (the `digest`/`assemble` verbs)
- Test: `engine/tests/test_facts_plan_assemble.py`

**Interfaces:**
- Consumes: `facts_plan.assemble.validate_unit` (T14); `facts_plan.build.label_of` (T13); `merge_facts.KIND_ORDER`, `canonical_scope`, `iter_ref_objects`, `load_store`, `null_paths`; `merge_facts.audit.flags_over(root, entries)` (T8); `merge_facts.content.lint_prose` (T6); `engine_common.read_json/write_json_atomic/write_text_atomic`.
- Produces: `digest(root, run_dir) -> pathlib.Path`, `assemble(root, run_dir, *, review=False) -> dict`, and the helpers T16 reads: `_fa(n) -> str`, `REASON_FA`, `_address(entry) -> tuple`.

Read first: §2.6 in full (the nine steps, in `assemble`'s execution order), `engine/merge_facts/apply.py:518-559` (`_plan`/`_rewrite_refs` — the two-pass id/ref shape this mirrors), `engine/merge_facts/ladder.py:1-45` (what a keyed collection is), `schemas/facts-delta.schema.json`'s `envelope` (the eight required envelope fields), and the Gate B block in `data-repo/.claude/skills/quantify/SKILL.md:373-393` (the register — the new one carries no id, path, code or command).

- [ ] **Step 1: Write the failing test**

`engine/tests/test_facts_plan_assemble.py`:

```python
import hashlib
import json

import pytest

from facts_plan.assemble import assemble, digest


def _root(tmp_path):
    (tmp_path / "facts").mkdir()
    for name in ("items", "records", "measurements", "rules", "notes"):
        (tmp_path / "facts" / f"{name}.json").write_text(
            json.dumps({"schema_version": 2, "entries": []}), encoding="utf-8")
    (tmp_path / "departments").mkdir()
    (tmp_path / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]}),
        encoding="utf-8")
    (tmp_path / "departments" / "cooking" / "processes").mkdir(parents=True)
    return tmp_path


def _skeleton():
    return {"schema_version": 1, "department": "cooking", "run": "r",
            "unit_symbols": ["kg"], "instances": [], "imports": [],
            "issues": [{"kind": "column_shift", "instance": "pitza__s5",
                        "description": "ستون «قیمت» جا افتاده است",
                        "run_only": False, "target": "S-rec-000000000001"}],
            "candidates": [
                {"id": "S-rec-000000000001", "kind": "record", "unit": "u-a",
                 "payload": {"medium": "sheet", "role": "log",
                             "location": {"spreadsheetId": "SID", "sheet": "پیتزا"},
                             "instances": [{"key": "pitza__s5",
                                            "spreadsheetId": "SID",
                                            "sheetId": 5, "sheet": "پیتزا",
                                            "branch": "chalebagh",
                                            "hidden": False}],
                             "fields": [{"key": "c_h", "title": "مصرف اعلامی",
                                         "columns": {"pitza__s5": "H"}}]}},
                {"id": "S-r-0000000000002", "kind": "rule", "unit": "u-b",
                 "payload": {"output": "انحراف", "original": "MINUS(J6,H6)",
                             "applies_to": [{"key": "pitza__s5__j__r6",
                                             "record": {"ref": "S-rec-000000000001",
                                                        "field": "c_h"},
                                             "variant": 0, "range": "J6:J15",
                                             "params": {}}]}},
                {"id": "S-i-0000000000003", "kind": "item", "unit": "u-b",
                 "payload": {"code": "##1", "labels": ["پنیر"]}}]}


def _plan():
    return {"schema_version": 1, "department": "cooking", "hashes": {},
            "units": [{"id": u, "type": "workbook", "inputs": [], "nodes": [],
                       "candidates": c, "est_tokens_in": 1, "est_tokens_out": 1}
                      for u, c in (("u-a", ["S-rec-000000000001"]),
                                   ("u-b", ["S-r-0000000000002",
                                            "S-i-0000000000003"]))]}


def _run(tmp_path, outputs):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units").mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(
        json.dumps(_skeleton(), ensure_ascii=False), encoding="utf-8")
    (run_dir / "plan.json").write_text(json.dumps(_plan()), encoding="utf-8")
    for unit, doc in outputs.items():
        (run_dir / "units" / unit).mkdir(exist_ok=True)
        (run_dir / "units" / unit / "out.1.json").write_text(
            json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return run_dir


def _record_out():
    return {"schema_version": 1, "unit": "u-a", "attempt": 1, "new": [],
            "decisions": [{"skeleton": "S-rec-000000000001", "action": "keep",
                           "key": "gozaresh_shabane_pitza",
                           "title": "گزارش شبانهٔ لاین پیتزا",
                           "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
                           "data": {"role": "log", "cadence": "nightly",
                                    "fields": [{"from": "c_h",
                                                "key": "masraf_elami",
                                                "type": "number", "unit": "kg"}]}}]}


def _rule_out(**over):
    doc = {"schema_version": 1, "unit": "u-b", "attempt": 1, "new": [],
           "decisions": [
               {"skeleton": "S-r-0000000000002", "action": "keep",
                "key": "enheraf", "title": "انحراف مصرف",
                "statement": "انحراف مصرف برابر است با مصرف واقعی منهای مصرف "
                             "اعلامی لاین.",
                "data": {"expr": "enheraf = masraf_vaqei - masraf_elami",
                         "lang": "feel",
                         "inputs": [{"key": "masraf_elami",
                                     "from": {"ref": "S-rec-000000000001",
                                              "field": "c_h"}}],
                         "outputs": [{"key": "enheraf", "title": "انحراف",
                                      "unit": "kg", "nature": "measure"}]}},
               {"skeleton": "S-i-0000000000003", "action": "keep",
                "key": "item_1", "title": "پنیر پیتزا",
                "statement": "پنیر پیتزا که با کیلوگرم شمرده می‌شود.",
                "data": {"category": "ingredient",
                         "unit": {"value": "kg", "inferred": True}}}]}
    doc.update(over)
    return doc


def test_refs_and_field_keys_resolved_and_delta_written(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    out = assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    record, rule = by_key["gozaresh_shabane_pitza"], by_key["enheraf"]
    assert rule["data"]["inputs"][0]["from"] == {"ref": record["id"],
                                                 "field": "masraf_elami"}
    assert rule["data"]["applies_to"][0]["record"] == {"ref": record["id"],
                                                       "field": "masraf_elami"}
    assert record["data"]["fields"][0]["columns"] == {"pitza__s5": "H"}
    assert record["data"]["fields"][0]["title"] == "مصرف اعلامی"
    assert by_key["item_1"]["field_status"] == {"data/unit": "inferred"}
    assert by_key["item_1"]["data"]["unit"] == "kg"
    assert record["scope"] == {"departments": ["cooking"],
                               "branches": ["chalebagh"]}
    assert record["issues"][0]["kind"] == "column_shift"
    assert record["issues"][0]["engine"] is True
    assert out["review_status"] == "absent"


def test_ids_are_minted_in_kind_order(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [(e["kind"], e["id"]) for e in delta["entries"]][:2] == \
        [("item", "T-1"), ("record", "T-2")]


def test_drop_and_failed_unit_land_in_assembly_json(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0] = {"skeleton": "S-r-0000000000002", "action": "drop",
                            "reason_code": "date_passthrough"}
    run_dir = _run(root, {"u-b": rule})           # u-a never returned
    assemble(root, run_dir)
    doc = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert doc["dropped"] == [{"skeleton": "S-r-0000000000002", "kind": "rule",
                               "label": "انحراف",
                               "reason_code": "date_passthrough", "unit": "u-b"}]
    assert [u["skeleton"] for u in doc["undecided"]] == ["S-rec-000000000001"]
    assert doc["provenance"]["T-1"] == "u-b"


def test_merge_into_and_split(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"].append({"skeleton": "S-i-0000000000003",
                              "action": "merge_into", "into": "S-i-0000000000003",
                              "reason_code": "duplicate"})
    rule["decisions"] = rule["decisions"][:1] + [
        {"skeleton": "S-i-0000000000003", "action": "split", "reason_code": "other",
         "into": [{"key": "item_1", "title": "پنیر پیتزا",
                   "statement": "پنیر پیتزا که با کیلوگرم شمرده می‌شود.",
                   "data": {"category": "ingredient", "unit": "kg"},
                   "takes": []},
                  {"key": "item_2", "title": "پنیر ورقه‌ای",
                   "statement": "پنیر ورقه‌ای که با بسته شمرده می‌شود.",
                   "data": {"category": "ingredient", "unit": "pack"},
                   "takes": []}]}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert sorted(e["key"] for e in delta["entries"] if e["kind"] == "item") == \
        ["item_1", "item_2"]


def test_two_units_one_key_merge_with_the_lowest_units_prose(tmp_path):
    root = _root(tmp_path)
    record = _record_out()
    rule = _rule_out()
    rule["decisions"][1] = dict(record["decisions"][0],
                                skeleton="S-i-0000000000003",
                                title="گزارش شبانه (نگارش دوم)",
                                data={"category": "ingredient", "unit": "kg"})
    rule["decisions"][1]["key"] = "gozaresh_shabane_pitza"
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    titles = [e["title"] for e in delta["entries"]
              if e["key"] == "gozaresh_shabane_pitza"]
    assert titles == ["گزارش شبانهٔ لاین پیتزا"]        # u-a wins, u-b's wording flagged


def test_two_sources_disagreeing_become_two_accounts(tmp_path):
    root = _root(tmp_path)
    record = _record_out()
    rule = _rule_out()
    rule["decisions"][1] = {"skeleton": "S-i-0000000000003", "action": "keep",
                            "key": "item_1", "title": "پنیر پیتزا",
                            "statement": "پنیر پیتزا که با بسته شمرده می‌شود.",
                            "data": {"category": "ingredient", "unit": "pack"}}
    record["decisions"].append(dict(rule["decisions"][1],
                                    skeleton="S-rec-000000000001"))
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    item = next(e for e in delta["entries"] if e["key"] == "item_1")
    assert len(item["accounts"]) == 2
    assert {a["field"] for a in item["accounts"]} == {"data/unit"}
    assert all(a["status"] == "open" and a["speaker_role"] is None
               and "id" not in a for a in item["accounts"])
    assert all(a["source"]["ref"] for a in item["accounts"])


def test_a_lint_failure_refuses_the_assembly(tmp_path, capsys):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0]["statement"] = "انحراف در ستون J6:J15 نوشته می‌شود."
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    assert "u-b" in capsys.readouterr().err
    assert not (run_dir / "facts-delta.json").exists()


def test_a_note_key_is_stable_across_runs(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "note", "key": "x", "title": "پرسش دربارهٔ تلورانس",
                    "statement": "تلورانس انحراف هنوز تعیین نشده است.",
                    "scope": {"departments": ["cooking"], "branches": []},
                    "source": [{"type": "chat", "ref": None}], "retired": False,
                    "data": {"about": [{"ref": "S-r-0000000000002"}],
                             "question": "تلورانس چند گرم است؟"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    first = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    key = next(e["key"] for e in first["entries"] if e["kind"] == "note")
    assert key.startswith("note_") and len(key) == len("note_") + 12
    assemble(root, run_dir)
    second = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e["key"] for e in second["entries"] if e["kind"] == "note") == key


def test_digest_then_a_stale_review_is_discarded(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    path = digest(root, run_dir)
    assert "کپی جدول" not in path.read_text(encoding="utf-8")
    held = (run_dir / "review" / "input.sha256").read_text(encoding="utf-8").strip()
    assert held == hashlib.sha256(path.read_bytes()).hexdigest()
    (run_dir / "review" / "out.json").write_text(json.dumps(
        {"schema_version": 1, "unit": "review", "attempt": 1, "new": [],
         "decisions": [{"entry": {"kind": "rule", "key": "enheraf",
                                  "scope": {"departments": ["cooking"],
                                            "branches": ["chalebagh"]}},
                        "action": "keep", "key": "enheraf",
                        "title": "انحراف مصرف مواد اولیه",
                        "statement": "انحراف مصرف برابر است با مصرف واقعی منهای "
                                     "مصرف اعلامی."}]}, ensure_ascii=False),
        encoding="utf-8")
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف مصرف مواد اولیه"
    (run_dir / "review" / "input.sha256").write_text("0" * 64, encoding="utf-8")
    assert assemble(root, run_dir, review=True)["review_status"] == "discarded"


def test_gate_b_is_persian_and_carries_no_locator(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    text = (run_dir / "gate-b.md").read_text(encoding="utf-8")
    assert text.startswith("خلاصهٔ اعداد آشپزخانه — برای تأیید")
    assert "انحراف مصرف" in text and "تأیید می‌کنید؟" in text
    for banned in ("S-r-", "T-1", "u-b", "merge ", "runs/", "facts-delta",
                   "pitza__s5", "J6:J15"):
        assert banned not in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_assemble.py -q`   Expected: FAIL with `ImportError: cannot import name 'assemble' from 'facts_plan.assemble'`

- [ ] **Step 3: Implement the collect and fold-in half (steps 0, 1a, 1b)**

Append to `engine/facts_plan/assemble.py`:

```python
import copy
import hashlib
import sys

from engine_common import write_json_atomic, write_text_atomic
from merge_facts import (KIND_ORDER, canonical_scope, iter_ref_objects,
                         load_store, null_paths)
from merge_facts.audit import flags_over

from facts_plan.build import label_of

KIND_OF = {"record": "record", "item": "item", "rule": "rule", "script": "rule"}
_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def _fa(value):
    """Latin digits to Persian — every number in an owner-facing file (§2.7)."""
    return str(value).translate(_DIGITS)


def _address(entry):
    """`(kind, key, canonical scope)` — how the review addresses an assembled
    entry, and how two units are found to have minted the same one (§2.6)."""
    return (entry["kind"], entry["key"],
            json.dumps(canonical_scope(entry.get("scope")), sort_keys=True))


def _outputs(root, run_dir, plan):
    """`[(unit, path, doc)]` for the units that returned something usable, in
    ascending unit id — the only order `assemble` has, and the reason it is
    deterministic."""
    out = []
    for unit in sorted(plan["units"], key=lambda u: u["id"]):
        for path in reversed(sorted((run_dir / "units" / unit["id"])
                                    .glob("out.*.json"))):
            try:
                doc = read_json(path)
            except (OSError, ValueError):
                continue
            if not validate_unit(root, run_dir, path):
                out.append((unit, path, doc))
            break
    return out


def _collect(root, run_dir, plan, skeleton):
    """The units' decisions keyed by skeleton id, their `new[]` entries, and the
    units that returned nothing this run can use."""
    state = {"by_skeleton": {}, "new": [], "failed": set(),
             "review_status": "absent", "dropped": [], "undecided": [],
             "provenance": {}, "flagged_prose": []}
    returned = set()
    for unit, _path, doc in _outputs(root, run_dir, plan):
        returned.add(unit["id"])
        for decision in doc["decisions"]:
            state["by_skeleton"][decision["skeleton"]] = dict(decision,
                                                              unit=unit["id"])
        for entry in doc.get("new") or []:
            state["new"].append(dict(entry, _unit=unit["id"]))
    state["failed"] = {u["id"] for u in plan["units"] if u["id"] not in returned}
    return state


def _fold_review(run_dir, state, draft):
    """Step 0 (§2.6). The digest hash must still match the assembly the reviewer
    read, and an address hitting zero or more than one entry discards the whole
    document: one round, no negotiation (§10)."""
    path = run_dir / "review" / "out.json"
    stamp = run_dir / "review" / "input.sha256"
    if not path.is_file() or not stamp.is_file():
        return "absent"
    text = _digest_text(state, draft)
    if stamp.read_text(encoding="utf-8").strip() != \
            hashlib.sha256(text.encode("utf-8")).hexdigest():
        return "discarded"
    doc = read_json(path)
    address = {}
    for entry in draft:
        address.setdefault(_address(entry), []).append(entry)
    folded = []
    for decision in doc["decisions"]:
        if decision.get("skeleton"):
            folded.append(decision)
            continue
        hit = address.get(_address(decision["entry"]), [])
        if len(hit) != 1:
            return "discarded"
        folded.append(dict(decision, skeleton=hit[0]["_skeleton"]))
    for decision in folded:
        previous = state["by_skeleton"].get(decision["skeleton"], {})
        merged = {**previous, **{k: v for k, v in decision.items()
                                 if v is not None}}
        merged["unit"] = previous.get("unit", "review")
        state["by_skeleton"][decision["skeleton"]] = merged
    return "applied"


def _unwrap(value, prefix, status):
    """Strip every `{"value", "inferred"}` wrapper and record its QF-7 path —
    §2.5: the model marks the leaf, assemble writes the path."""
    if isinstance(value, dict):
        if set(value) == {"value", "inferred"} and value["inferred"] is True:
            status[prefix] = "inferred"
            return _unwrap(value["value"], prefix, status)
        return {k: _unwrap(v, f"{prefix}/{k}", status) for k, v in value.items()}
    if isinstance(value, list):
        return [_unwrap(m, f'{prefix}/{m["key"]}'
                        if isinstance(m, dict) and "key" in m else prefix, status)
                for m in value]
    return value


def _rename_fields(mechanical, written):
    """`{provisional key: minted key}` and the merged `fields[]`. A field the
    record unit leaves unrenamed keeps `c_h` (§2.5)."""
    by_from = {f["from"]: f for f in written if f.get("from")}
    renames, fields = {}, []
    for field in mechanical:
        theirs = dict(by_from.get(field["key"]) or {})
        theirs.pop("from", None)
        key = theirs.pop("key", None) or field["key"]
        renames[field["key"]] = key
        fields.append({**field, **theirs, "key": key})
    return renames, fields
```

- [ ] **Step 4: Implement the entry half (steps 2–6) and the ref resolution**

Append to `engine/facts_plan/assemble.py`:

```python
def _source_of(instance, paths):
    return {"type": "sheet", "ref": paths.get(instance["spreadsheetId"], ""),
            "sheet": instance["sheet"]}


def _scope_of(candidate, department, decision):
    branches = sorted({i["branch"] for i in
                       candidate["payload"].get("instances") or []
                       if i.get("branch")}
                      or decision.get("branches") or [])
    for member in candidate["payload"].get("applies_to") or []:
        branches = sorted(set(branches) | set(decision.get("branches") or []))
    return {"departments": [department], "branches": branches}


def _entry(candidate, decision, state, part=None):
    """Step 2 — the envelope §2.6 describes: the skeleton's mechanical payload
    under the unit's own fields, `source[]` from every instance and binding,
    `scope` per §3.2, the `inferred` wrappers expanded into `field_status`."""
    written = part or decision
    status = {}
    data = copy.deepcopy(candidate["payload"])
    given = _unwrap(written.get("data") or {}, "data", status)
    renames, fields = _rename_fields(data.pop("fields", []),
                                     given.pop("fields", []))
    data.update(given)
    if fields:
        data["fields"] = fields
    takes = written.get("takes")
    if takes is not None:
        for collection in ("applies_to", "instances"):
            if data.get(collection):
                data[collection] = [m for m in data[collection]
                                    if m["key"] in takes]
    sources = [_source_of(i, state["paths"])
               for i in data.get("instances") or []] or \
        [{"type": "sheet", "ref": state["paths"].get(
            (data.get("location") or {}).get("spreadsheetId"), ""),
          "sheet": (data.get("location") or {}).get("sheet", "")}]
    for citation in written.get("processes") or []:
        sources.append({"type": "process",
                        "ref": f'departments/{state["department"]}/processes/'
                               f'{citation["process"]}.json',
                        "node": citation["node"], "quote": citation["quote"]})
    entry = {"kind": KIND_OF[candidate["kind"]], "key": written["key"],
             "title": written["title"], "statement": written["statement"],
             "scope": _scope_of(candidate, state["department"], decision),
             "source": sources, "retired": False, "data": data,
             "_skeleton": candidate["id"], "_unit": decision["unit"],
             "_renames": renames}
    if written.get("aliases"):
        entry["aliases"] = written["aliases"]
    if status:
        entry["field_status"] = status
    for issue in state["issues"]:
        if issue.get("target") == candidate["id"] and not issue["run_only"]:
            entry.setdefault("issues", []).append(
                {"kind": issue["kind"], "instance": issue["instance"],
                 "description": issue["description"], "engine": True})
    return entry


def _absorb(target, candidate):
    """Step 3 — the merge target gains the candidate's bindings and instances;
    a keyed member the target already carries is left alone (§11's union)."""
    for collection in ("applies_to", "instances"):
        held = {m["key"] for m in target["data"].get(collection) or []}
        for member in candidate["payload"].get(collection) or []:
            if member["key"] not in held:
                target["data"].setdefault(collection, []).append(member)


def _target_of(state, skid):
    """`merge_into` to a fixpoint, ascending (unit id, skeleton id) — a cycle
    is an error naming both units."""
    seen = []
    while True:
        decision = state["by_skeleton"].get(skid)
        if not decision or decision["action"] != "merge_into":
            return skid
        if skid in seen:
            raise _fail(f'{skid}: merge_into cycle across units '
                        f'{", ".join(sorted({state["by_skeleton"][s]["unit"] for s in seen}))}')
        seen.append(skid)
        skid = decision["into"]


def _fail(message):
    print(f"facts-plan: {message}", file=sys.stderr)
    return SystemExit(2)


def _note_key(entry, by_temp):
    """§3.1 — minted from the sorted `(kind, key)` pairs of `about[]` and the
    normalised question, so the same note built twice mints the same key
    whether its target was created in this delta or found in the store."""
    pairs = []
    for about in entry["data"]["about"]:
        target = by_temp.get(about["ref"])
        pairs.append(f'{target["kind"]}:{target["key"]}' if target
                     else about["ref"])
    blob = "‖".join(sorted(pairs)) + "‖" + \
        " ".join((entry["data"].get("question") or "").split())
    return "note_" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:12]


def _build_entries(root, skeleton, state):
    """Steps 2–6 with step 1 in the middle: the bodies are built, then the temp
    ids are minted in kind order over all of them, then every `{ref}` and every
    provisional field key is resolved (1a, 1b)."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    state["dropped"], state["undecided"] = [], []
    kept = {}
    for cid, candidate in sorted(by_id.items()):
        decision = state["by_skeleton"].get(cid)
        label = label_of(candidate)
        if decision is None or candidate.get("unit") in state["failed"]:
            state["undecided"].append({"skeleton": cid, "kind": candidate["kind"],
                                       "label": label,
                                       "unit": candidate.get("unit")})
            continue
        if decision["action"] == "drop":
            state["dropped"].append({"skeleton": cid, "kind": candidate["kind"],
                                     "label": label,
                                     "reason_code": decision["reason_code"],
                                     "unit": decision["unit"]})
        elif decision["action"] == "keep":
            kept[cid] = _entry(candidate, decision, state)
        elif decision["action"] == "split":
            for n, part in enumerate(decision["into"], start=1):
                kept[f"{cid}#{n}"] = _entry(candidate, decision, state, part=part)
    for cid in sorted(state["by_skeleton"],
                      key=lambda k: (state["by_skeleton"][k]["unit"], k)):
        decision = state["by_skeleton"][cid]
        if decision["action"] != "merge_into":
            continue
        target = _target_of(state, cid)
        if target not in kept:
            raise _fail(f'{cid} (unit {decision["unit"]}) merges into {target}, '
                        "which no unit kept")
        _absorb(kept[target], by_id[cid])
    entries = list(kept.values())
    for entry in state["new"]:
        body = {k: v for k, v in entry.items() if k != "_unit"}
        body["_skeleton"] = None
        body["_unit"] = entry["_unit"]
        body["_renames"] = {}
        entries.append(body)
    entries.sort(key=lambda e: (KIND_ORDER.index(e["kind"]),
                                e["_skeleton"] or "", e["key"]))
    for n, entry in enumerate(entries, start=1):
        entry["id"] = f"T-{n}"
        state["provenance"][entry["id"]] = entry["_unit"]
    _resolve_refs(entries, state)
    by_temp = {e["id"]: e for e in entries}
    for entry in entries:
        if entry["kind"] == "note":
            entry["key"] = _note_key(entry, by_temp)
    return entries


def _resolve_refs(entries, state):
    """1a and 1b in one walk: an `S-` ref becomes the temp id of that
    candidate's kept entry, an `F-` ref is checked against the store, and a
    provisional field key is rewritten to the one the record decision minted.
    An `imports[].source` whose target was dropped falls back to its locator;
    anything else naming a dropped or failed candidate is an error naming both
    units."""
    by_skeleton = {e["_skeleton"]: e for e in entries if e["_skeleton"]}
    dropped = {d["skeleton"]: d["unit"] for d in state["dropped"]}
    for entry in entries:
        for source in (member.get("source")
                       for instance in entry["data"].get("instances") or []
                       for member in instance.get("imports") or []):
            ref = (source or {}).get("ref")
            if isinstance(ref, str) and ref.startswith("S-") \
                    and ref not in by_skeleton:
                source.pop("ref", None)
                source.update(state["locators"].get(ref, {}))
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if not isinstance(ref, str):
                continue
            if ref.startswith("S-"):
                target = by_skeleton.get(ref)
                if target is None:
                    raise _fail(f'{entry["_unit"]}: ref {ref} names a candidate '
                                f'unit {dropped.get(ref, "?")} did not keep')
                obj["ref"] = target["id"]
                if obj.get("field") in (target.get("_renames") or {}):
                    obj["field"] = target["_renames"][obj["field"]]
            elif ref.startswith("F-") and ref not in state["store_ids"]:
                raise _fail(f'{entry["_unit"]}: ref {ref} is in no store entry')
```

- [ ] **Step 5: Implement steps 7–9, `digest`, `assemble` and `gate-b.md`**

Append to `engine/facts_plan/assemble.py`:

```python
def _leaves(data, prefix="data"):
    """`{QF-7 path: value}` for every scalar under `data` — what step 7 compares
    when two units describe one entry."""
    out = {}
    if isinstance(data, dict):
        for key, value in data.items():
            out.update(_leaves(value, f"{prefix}/{key}"))
    elif isinstance(data, list):
        for member in data:
            if isinstance(member, dict) and "key" in member:
                out.update(_leaves({k: v for k, v in member.items() if k != "key"},
                                   f'{prefix}/{member["key"]}'))
    elif data is not None:
        out[prefix] = data
    return out


def _cross_unit(root, entries, state):
    """Step 7 — two `keep`s minting one `(kind, key, scope)` are merged with the
    lowest unit's prose; a scalar the two disagree on becomes two accounts when
    their sources differ in kind, and `unit_drift` for the reviewer when they do
    not. `apply` mints the account ids, which is why none is written here."""
    groups = {}
    for entry in entries:
        groups.setdefault(_address(entry), []).append(entry)
    survivors, flags = [], []
    for members in groups.values():
        members.sort(key=lambda e: (e["_unit"], e["id"]))
        keeper = members[0]
        for other in members[1:]:
            entries.remove(other)
            flags.append({"code": "duplicate_title", "id": keeper["id"],
                          "message": f'{other["_unit"]} wrote another wording '
                                     f'for «{keeper["title"]}»'})
            mine, theirs = _leaves(keeper["data"]), _leaves(other["data"])
            for path, value in theirs.items():
                if path not in mine or mine[path] == value:
                    continue
                kinds = {keeper["source"][0]["type"], other["source"][0]["type"]}
                if len(kinds) == 1:
                    flags.append({"code": "unit_drift", "id": keeper["id"],
                                  "message": f'{path}: {mine[path]!r} '
                                             f'({keeper["_unit"]}) vs '
                                             f'{value!r} ({other["_unit"]})'})
                    continue
                for holder, held in ((keeper, mine[path]), (other, value)):
                    keeper.setdefault("accounts", []).append(
                        {"field": path, "value": held, "status": "open",
                         "speaker_role": None,
                         "statement": f'مقدار ثبت‌شده برای این خانه: {held}',
                         "source": holder["source"][0]})
        survivors.append(keeper)
    flags += flags_over(root, [{k: v for k, v in e.items()
                                if not k.startswith("_")} for e in survivors])
    state["flags"] = flags


def _lint_entries(entries, symbols):
    """Step 8 — the §5.2 lint over every prose field; a failing value is refused,
    never stored, and the message names the unit that wrote it."""
    out = []
    for entry in entries:
        for key in ("title", "statement"):
            for message in lint_prose(entry.get(key) or "", exemptions=symbols):
                out.append(f'{entry["_unit"]}: {entry["key"]}/{key}: {message}')
        for field in entry["data"].get("fields") or []:
            for message in lint_prose(field.get("description") or "",
                                      exemptions=symbols, allow_sheet_words=True):
                out.append(f'{entry["_unit"]}: {entry["key"]}/'
                           f'{field.get("key")}: {message}')
    return out


def _digest_text(state, entries):
    """`review/input.md` (§2.6) — one line per assembled entry, the flags, and
    the dropped candidates with their reason codes."""
    lines = ["# digest",
             f"decisions ≤ {REVIEW_DECISIONS}, statement rewrites ≤ "
             f"{REVIEW_REWRITES}", "", "## entries", ""]
    for entry in entries:
        data = entry["data"]
        tail = {"rule": f'expr: {data.get("expr")}',
                "record": "fields: " + "، ".join(
                    f'{f["key"]}[{f.get("unit") or "—"}]'
                    for f in data.get("fields") or []),
                "item": f'{data.get("code")} · {data.get("unit")} · '
                        f'{data.get("category")}'}.get(entry["kind"], "")
        lines.append(" · ".join([entry["kind"], entry["key"],
                                 _address(entry)[2], entry["title"],
                                 entry["statement"], tail]))
    lines += ["", "## flags", ""]
    lines += [f'{f["code"]} · {f["id"]} · {f["message"]}'
              for f in state["flags"]] or ["—"]
    lines += ["", "## dropped", ""]
    lines += [f'{d["skeleton"]} · {d["kind"]} · {d["label"]} · {d["reason_code"]}'
              for d in state["dropped"]] or ["—"]
    return "\n".join(lines) + "\n"


def _prepare(root, run_dir, review):
    """Everything both verbs share: the run's files, the store, and the units'
    decisions with the review folded in when asked for."""
    run_dir = pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    plan = read_json(run_dir / "plan.json")
    manifest = read_json(pathlib.Path(root) / "attachments" / "sheets" /
                         "manifest.json")
    store = load_store(root)
    state = _collect(root, run_dir, plan, skeleton)
    state.update({
        "department": skeleton["department"], "issues": skeleton["issues"],
        "paths": {w["spreadsheetId"]: f'attachments/sheets/{w["dir"]}/{w["file"]}'
                  for w in manifest["workbooks"]},
        "locators": {i["source"].get("ref"): {k: v for k, v in i["source"].items()
                                              if k != "ref"}
                     for i in skeleton["imports"] if i["source"].get("ref")},
        "store_ids": {e["id"] for kind in KIND_ORDER
                      for e in store[kind]["entries"]}})
    if review:
        draft = _build_entries(root, skeleton, copy.deepcopy(state))
        state["review_status"] = _fold_review(run_dir, state, draft)
    return run_dir, skeleton, state


def digest(root, run_dir):
    """`review/input.md` + `review/input.sha256` — steps 1–7 in memory, the temp
    ids discarded. Above 50 K tokens the run proceeds without a review (§2.6)."""
    run_dir, skeleton, state = _prepare(root, run_dir, False)
    entries = _build_entries(root, skeleton, state)
    _cross_unit(root, entries, state)
    text = _digest_text(state, entries)
    (run_dir / "review").mkdir(exist_ok=True)
    path = run_dir / "review" / "input.md"
    write_text_atomic(path, text)
    write_text_atomic(run_dir / "review" / "input.sha256",
                      hashlib.sha256(text.encode("utf-8")).hexdigest() + "\n")
    return path


def assemble(root, run_dir, *, review=False):
    """Steps 0–9 once over the merged decision set (§2.6). Deterministic:
    ascending unit id, ascending skeleton id, ids minted in kind order."""
    run_dir, skeleton, state = _prepare(root, run_dir, review)
    entries = _build_entries(root, skeleton, state)
    _cross_unit(root, entries, state)
    problems = _lint_entries(entries, skeleton.get("unit_symbols") or [])
    if problems:
        for line in problems:
            print(f"facts-plan: {line}", file=sys.stderr)
        raise SystemExit(2)
    clean = [{k: v for k, v in e.items() if not k.startswith("_")}
             for e in entries]
    write_json_atomic(run_dir / "facts-delta.json",
                      {"schema_version": 2, "entries": clean})
    write_json_atomic(run_dir / "assembly.json",
                      {"dropped": state["dropped"], "undecided": state["undecided"],
                       "provenance": state["provenance"],
                       "review_status": state["review_status"]})
    write_text_atomic(run_dir / "gate-b.md", gate_b(root, skeleton, entries, state))
    return {"entries": len(clean), "dropped": len(state["dropped"]),
            "undecided": len(state["undecided"]),
            "review_status": state["review_status"]}


def _rule_line(entry):
    """A rule as the owner reads it: its own title, and the numeric values its
    bindings carry — never a formula, a column or a table name (§2.5)."""
    numbers = []
    for member in entry["data"].get("applies_to") or []:
        for _key, value in sorted((member.get("params") or {}).items()):
            if isinstance(value, (int, float)) and value not in numbers:
                numbers.append(value)
    line = f'  • {entry["title"]}'
    return line + (": " + "، ".join(_fa(n) for n in numbers) if numbers else "")


def gate_b(root, skeleton, entries, state):
    """`gate-b.md` (§2.7) — a finished Persian message the playbook sends
    verbatim. No id, no path, no code, no command; an entry is its title."""
    registry = read_json(pathlib.Path(root) / "departments" / "registry.json")
    name = next((d["name"] for d in registry["departments"]
                 if d["code"] == state["department"]), state["department"])
    counts = {kind: sum(1 for e in entries if e["kind"] == kind)
              for kind in KIND_ORDER}
    rules = [e for e in entries if e["kind"] == "rule"]
    accounts = [(e, a) for e in entries for a in e.get("accounts") or []]
    unknown = sum(len(null_paths(e)) for e in entries)
    issues = [i for i in skeleton["issues"]]
    out = [f"خلاصهٔ اعداد {name} — برای تأیید", "",
           f'ثبت می‌شود: {_fa(counts["rule"])} قاعده، {_fa(counts["record"])} '
           f'جدول، {_fa(counts["item"])} قلم، {_fa(counts["measurement"])} '
           f'اندازه‌گیری، {_fa(counts["note"])} یادداشت.',
           f'کنار گذاشته شد: {_fa(len(state["dropped"]))} مورد — فهرست کامل در '
           "گزارش پایان اجرا.",
           f'بررسی‌نشده: {_fa(len(state["undecided"]))} مورد.', ""]
    if rules:
        out.append("قاعده‌ها:")
        out += [_rule_line(r) for r in rules[:3]]
        if len(rules) > 3:
            out.append(f"  … ({_fa(len(rules) - 3)} مورد دیگر)")
        out.append("")
    if accounts:
        out.append(f"اختلاف بین دو منبع: {_fa(len(accounts) // 2)} مورد "
                   "(در پنل هم قابل تعیین تکلیف است)")
        for n, (entry, account) in enumerate(accounts[::2], start=1):
            twin = next(a for a in entry["accounts"] if a is not account)
            out.append(f'  {_fa(n)} — «{entry["title"]}»: الف) '
                       f'{_fa(account["value"])}  ب) {_fa(twin["value"])}')
        out.append("")
    if issues:
        out.append(f"ایرادهای یافته‌شده در فایل‌ها: {_fa(len(issues))} مورد — "
                   "سه مورد مهم:")
        out += [f'  • {i["description"]}' for i in issues[:3]]
        out.append("")
    out += [f"بی‌پاسخ: {_fa(unknown)} خانه — در پنل.", "", "تأیید می‌کنید؟", ""]
    return "\n".join(out)
```

The `digest` and `assemble` subparsers T9 created call these and print nothing owner-facing.

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_assemble.py -q`   Expected: PASS

- [ ] **Step 7: Commit**

```
git add engine/facts_plan/assemble.py engine/facts_plan/cli.py engine/tests/test_facts_plan_assemble.py
git commit -m "feat(facts): digest and assemble — the delta, assembly.json and gate-b.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 15b: The reviewer's `contradiction` action

**Files:**
- Modify: `engine/facts_plan/assemble.py` (the `_fold_review` function Task 15 wrote — add the `contradiction` branch beside `keep`/`drop`/`merge_into`/`split`)
- Test: `engine/tests/test_facts_plan_assemble.py`

**Interfaces:**
- Consumes: `_fold_review(decisions, review)` and the `unit_drift` flag records Task 15's step 7 computes (`{"code": "unit_drift", "entry": {kind, key, scope}, "field": <QF-7 path>, "sides": [{"unit", "value", "source"}, …]}`).
- Produces: nothing new — a `contradiction` decision either sets the leaf (`resolution: "fix"`) or turns the two sides into accounts (`resolution: "account"`), exactly as step 7 writes accounts for a cross-source disagreement.

- [ ] **Step 1: Write the failing tests**

```python
def test_contradiction_fix_sets_the_leaf(tmp_path):
    root, run_dir = _assembled_run(tmp_path)          # Task 15's helper: two units, one unit_drift on data/outputs/v/value
    review = _review_doc([{
        "entry": {"kind": "rule", "key": "tol", "scope": {"departments": ["cooking"], "branches": []}},
        "action": "contradiction", "field": "data/outputs/v/value",
        "resolution": "fix", "value": 5, "reason": "the second unit misread a 6 for a 5"}])
    _write_review(run_dir, review)
    assemble(root, run_dir, review=True)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rule = next(e for e in delta["entries"] if e["key"] == "tol")
    assert rule["data"]["outputs"][0]["value"] == 5
    assert "accounts" not in rule


def test_contradiction_account_writes_both_sides(tmp_path):
    root, run_dir = _assembled_run(tmp_path)
    review = _review_doc([{
        "entry": {"kind": "rule", "key": "tol", "scope": {"departments": ["cooking"], "branches": []}},
        "action": "contradiction", "field": "data/outputs/v/value",
        "resolution": "account", "reason": "both readings are defensible"}])
    _write_review(run_dir, review)
    assemble(root, run_dir, review=True)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rule = next(e for e in delta["entries"] if e["key"] == "tol")
    values = sorted(a["value"] for a in rule["accounts"])
    assert values == [5, 6]
    assert all(a["status"] == "open" and "id" not in a and a["field"] == "data/outputs/v/value"
               for a in rule["accounts"])


def test_contradiction_on_a_field_with_no_drift_discards_the_review(tmp_path):
    root, run_dir = _assembled_run(tmp_path)
    review = _review_doc([{
        "entry": {"kind": "rule", "key": "tol", "scope": {"departments": ["cooking"], "branches": []}},
        "action": "contradiction", "field": "data/outputs/v/unit",
        "resolution": "fix", "value": "kg", "reason": "…"}])
    _write_review(run_dir, review)
    assemble(root, run_dir, review=True)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["review_status"] == "discarded"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_assemble.py -q -k contradiction`
Expected: FAIL — the first two with an unknown-action error from `_fold_review`, the third with `review_status == "applied"`.

- [ ] **Step 3: Add the branch**

In `_fold_review`, beside the four existing actions:

```python
        elif action == "contradiction":
            # §2.6 step 0: the reviewer settles a `unit_drift` the cross-unit
            # pass flagged. `fix` writes one value; `account` keeps both sides
            # as open accounts, shaped exactly as step 7 writes a cross-source
            # disagreement. A field no flag names is an address the reviewer
            # invented, and an invented address discards the review (QF-52).
            flag = next((f for f in drift_flags
                         if f["entry"] == decision["entry"] and f["field"] == decision["field"]),
                        None)
            if flag is None:
                return None                      # the caller records review_status: discarded
            if decision["resolution"] == "fix":
                fixes.append((decision["entry"], decision["field"], decision["value"]))
            else:
                accounts.append((decision["entry"], decision["field"], flag["sides"]))
```

and, where the folded decisions are applied to entries (after step 7's merge), set each fix with `set_path(entry, field, value)` and append each account pair as `{"field": field, "statement": _fa(side["value"]), "value": side["value"], "source": side["source"], "speaker_role": None, "status": "open"}` per side — no `id`. `drift_flags` is the list step 7 already builds; thread it into `_fold_review` as a parameter.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_assemble.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add engine/facts_plan/assemble.py engine/tests/test_facts_plan_assemble.py
git commit -m "feat(facts): the reviewer's contradiction action — fix a leaf or keep both sides

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```


### Task 16: `facts-plan report`, the frozen cooking fixture, and the acceptance fixture

**Files:**
- Modify: `engine/facts_plan/assemble.py` (append `report`), `engine/facts_plan/cli.py` (the `report` verb)
- Create: `engine/tests/fixtures/facts-plan/` (13 dump directories, `manifest.json`, `transcript.txt`, `expected.json`, `units/*.json`)
- Test: `engine/tests/test_facts_plan_report.py`, `engine/tests/test_facts_plan_fixture.py`, `engine/tests/test_facts_acceptance.py`

**Interfaces:**
- Consumes: `facts_plan.assemble._fa`, `_address` (T15); `facts_plan.build.build` (T10/T11/T12/T13); `merge_facts.load_store`, `null_paths`; `engine_common.read_json/write_text_atomic`.
- Produces: `facts_plan.assemble.report(root, run_dir) -> pathlib.Path`, `REASON_FA`, `ISSUE_FA`.

Read first: §2.7's `report.md` paragraph and §7's fixture list (every assertion below is one line of it); the Stage 7 report block in `data-repo/.claude/skills/quantify/SKILL.md:495-517` (the lettered-dispute form this keeps, minus the ids it must now drop); `data-repo/runs/facts/cooking/20260902-080737/id-map.json` (the `{temp id: F-id}` shape `report` reads).

- [ ] **Step 1: Write the failing test for `report`**

`engine/tests/test_facts_plan_report.py`:

```python
import json

from facts_plan.assemble import report


def _store(root, entries):
    (root / "facts").mkdir(exist_ok=True)
    for name in ("items", "records", "measurements", "rules", "notes"):
        (root / "facts" / f"{name}.json").write_text(
            json.dumps({"schema_version": 2, "entries": []}), encoding="utf-8")
    (root / "facts" / "rules.json").write_text(
        json.dumps({"schema_version": 2, "entries": entries}, ensure_ascii=False),
        encoding="utf-8")
    (root / "departments").mkdir(exist_ok=True)
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]}),
        encoding="utf-8")


def _run(tmp_path):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    run_dir.mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": [], "candidates": [], "instances": [], "imports": [],
         "issues": [{"kind": "column_shift", "instance": "pitza__s5",
                     "description": "ستون «قیمت» جا افتاده است",
                     "run_only": False, "target": "S-rec-1"},
                    {"kind": "unheaded_formula", "instance": "pitza__s5",
                     "description": "۲۴ فرمول بالای سطر عنوان",
                     "run_only": True}]}, ensure_ascii=False), encoding="utf-8")
    (run_dir / "assembly.json").write_text(json.dumps(
        {"dropped": [{"skeleton": "S-r-1", "kind": "rule", "label": "تاریخ",
                      "reason_code": "date_passthrough", "unit": "u-a"},
                     {"skeleton": "S-r-2", "kind": "rule", "label": "رنگ",
                      "reason_code": "cosmetic", "unit": "u-a"}],
         "undecided": [{"skeleton": "S-r-3", "kind": "rule", "label": "مغایرت",
                        "unit": "u-b"}],
         "provenance": {"T-1": "u-a"}, "review_status": "discarded"},
        ensure_ascii=False), encoding="utf-8")
    (run_dir / "id-map.json").write_text(json.dumps({"T-1": "F-00487"}),
                                         encoding="utf-8")
    return run_dir


def test_report_letters_disputes_and_speaks_persian(tmp_path):
    run_dir = _run(tmp_path)
    _store(tmp_path, [{"id": "F-00487", "kind": "rule", "key": "enheraf",
                       "title": "انحراف مصرف", "statement": "…",
                       "scope": {"departments": ["cooking"], "branches": []},
                       "status": "disputed", "retired": False, "valid_to": None,
                       "updated_at": "2026-09-06T10:00:00Z",
                       "source": [{"type": "sheet", "ref": "x", "sheet": "پیتزا"}],
                       "accounts": [{"id": "a1", "field": "data/outputs/v/value",
                                     "statement": "۲۱۵ گرم", "value": 215,
                                     "status": "open", "source": {"type": "sheet",
                                                                  "ref": "x"}},
                                    {"id": "a2", "field": "data/outputs/v/value",
                                     "statement": "۱۰ عدد", "value": 10,
                                     "status": "open", "source": {"type": "voice",
                                                                  "ref": "y"}}],
                       "data": {"inputs": [], "outputs": [{"key": "v",
                                                           "title": "مقدار",
                                                           "unit": None}]}}])
    text = report(tmp_path, run_dir).read_text(encoding="utf-8")
    assert "گزارش پایان اجرا — آشپزخانه" in text
    assert "اختلاف ۱ — «انحراف مصرف»" in text
    assert "الف) ۲۱۵ گرم" in text and "ب) ۱۰ عدد" in text
    assert "فقط تاریخ را منتقل می‌کرد: ۱ مورد" in text
    assert "ظاهری بود (رنگ و قالب): ۱ مورد" in text
    assert "ستون «قیمت» جا افتاده است" in text
    assert "۲۴ فرمول بالای سطر عنوان" in text          # run-only, still reported
    assert "بازبینی انجام نشد" in text
    assert "۱ مورد بررسی‌نشده" in text
    for banned in ("F-00487", "a1", "S-r-1", "u-a", "merge ", "runs/",
                   "date_passthrough"):
        assert banned not in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_report.py -q`   Expected: FAIL with `ImportError: cannot import name 'report' from 'facts_plan.assemble'`

- [ ] **Step 3: Implement `report`**

Append to `engine/facts_plan/assemble.py`:

```python
REASON_FA = {"not_a_fact": "واقعیت کمّی نبود",
             "date_passthrough": "فقط تاریخ را منتقل می‌کرد",
             "cosmetic": "ظاهری بود (رنگ و قالب)",
             "duplicate": "تکراری بود",
             "has_a_home": "جای دیگری ثبت شد",
             "insufficient_context": "اطلاعات کافی نبود",
             "other": "دلایل دیگر"}

ISSUE_FA = {"column_shift": "ستون جاافتاده در جدول کپی‌شده",
            "leading_offset": "جابه‌جایی ستون‌های تاریخ",
            "unknown_source": "منبع ناشناخته",
            "unused_mirror": "کپی بدون استفاده",
            "broken_formula": "فرمول خراب",
            "cached_error": "خطای ذخیره‌شده در فایل",
            "no_rule_applies": "خانهٔ بدون قاعده",
            "hand_maintained_index": "فهرست دستی",
            "per_cell_mirror": "کپی خانه‌به‌خانه",
            "column_offset": "اختلاف ستون بین نسخه‌ها",
            "ambiguous_row_header": "عنوان تکراری در سطر",
            "unheaded_formula": "فرمول بدون عنوان ستون",
            "row_labels_ambiguous": "برچسب سطرها قابل تشخیص نبود",
            "row_labels_partial": "برچسب سطرها ناقص بود",
            "reference_tab_is_mirror": "تب مرجع در واقع کپی بود",
            "reference_tab_is_ids": "تب مرجع در واقع فهرست شناسه‌ها بود",
            "reference_tab_computes": "تب مرجع فرمول دارد"}


def report(root, run_dir):
    """`report.md` (§2.7) — written after `apply`, from `assembly.json`, the
    run's `id-map.json` and the store. Every entry is named by its Persian
    title; the disputes are lettered so the owner can answer «۱ الف» and the
    playbook runs `merge facts resolve` itself."""
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    assembly = read_json(run_dir / "assembly.json")
    id_map = read_json(run_dir / "id-map.json")
    registry = read_json(root / "departments" / "registry.json")
    name = next((d["name"] for d in registry["departments"]
                 if d["code"] == skeleton["department"]), skeleton["department"])
    store = load_store(root)
    touched = set(id_map.values())
    entries = [e for kind in KIND_ORDER for e in store[kind]["entries"]
               if e["id"] in touched]

    disputes = [(e, [a for a in e.get("accounts") or []
                     if a.get("status") == "open"]) for e in entries]
    disputes = [(e, a) for e, a in disputes if a]
    unknown = [(e, null_paths(e)) for e in entries]
    unknown = [(e, p) for e, p in unknown if p]

    out = [f"گزارش پایان اجرا — {name}", "",
           f'ثبت شد: {_fa(len(entries))} مورد. '
           f'کنار گذاشته شد: {_fa(len(assembly["dropped"]))} مورد. '
           f'{_fa(len(assembly["undecided"]))} مورد بررسی‌نشده.', ""]
    if disputes:
        out.append("اختلاف‌ها — شمارهٔ مورد و حرف گزینه را بفرستید، مثلاً «۱ الف»:")
        for n, (entry, accounts) in enumerate(disputes, start=1):
            out.append(f'اختلاف {_fa(n)} — «{entry["title"]}»')
            for letter, account in zip("الف ب ج د".split(), accounts):
                out.append(f'  {letter}) {account["statement"]}')
        out.append("")
    if unknown:
        out.append(f"خانه‌های بی‌پاسخ ({_fa(sum(len(p) for _e, p in unknown))} "
                   "مورد) — همه در پنل قابل تکمیل‌اند:")
        out += [f'  • «{entry["title"]}»: {_fa(len(paths))} خانه'
                for entry, paths in unknown[:10]]
        out.append("")
    if assembly["dropped"]:
        out.append("چه چیزهایی ثبت نشد:")
        counted = {}
        for row in assembly["dropped"]:
            counted[row["reason_code"]] = counted.get(row["reason_code"], 0) + 1
        out += [f'  • {REASON_FA.get(code, REASON_FA["other"])}: {_fa(n)} مورد'
                for code, n in sorted(counted.items())]
        out.append("")
    if skeleton["issues"]:
        out.append("ایرادهای یافته‌شده در فایل‌ها:")
        grouped = {}
        for issue in skeleton["issues"]:
            grouped.setdefault(issue["kind"], []).append(issue["description"])
        for kind, described in sorted(grouped.items()):
            out.append(f'  {ISSUE_FA.get(kind, "ایراد")} ({_fa(len(described))} مورد):')
            out += [f"    • {d}" for d in described[:5]]
        out.append("")
    if assembly["undecided"]:
        out.append("یک بخش از داده‌ها ناتمام ماند و در اجرای بعدی تکمیل می‌شود.")
    out.append({"applied": "بازبینی نهایی انجام شد.",
                "discarded": "بازبینی نهایی انجام نشد و نتیجه بدون آن ثبت شد.",
                "absent": "بازبینی نهایی اجرا نشد."}[assembly["review_status"]])
    path = run_dir / "report.md"
    write_text_atomic(path, "\n".join(out) + "\n")
    return path
```

- [ ] **Step 4: Run the report test**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_report.py -q`   Expected: PASS

- [ ] **Step 5: Commit the report**

```
git add engine/facts_plan/assemble.py engine/facts_plan/cli.py engine/tests/test_facts_plan_report.py
git commit -m "feat(facts): facts-plan report — the owner's end-of-run message

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 6: Freeze the re-dumped cooking estate as a fixture**

Requires T4 landed and the 13 cooking workbooks re-dumped (`dump-workbook --manifest`, §8 step 2a — local `.xlsx` files, no OAuth). Run from `code-repo`:

```
mkdir -p engine/tests/fixtures/facts-plan/dump
D="../data-repo/attachments/sheets"
for id in 12Q9yQLrfJaWkasZfeK8ACp131CBgjhJ8mRkvQYC04P8 \
          1AuKUUFs6nvBzHlZ0IDFoYNeP5fXFCbYqGFDPVe6Cl_8 \
          1M_iuhWUW9901F_66pv_g8r0W0QVMzLDrEQJp6GQgnuQ \
          19jHmcKHJm8aOOef8kuiTRuGrswmUs4TKDaM1aAchwRk \
          1dmH8tCqOuqNr2nt4AwJrHC2cq-rv0tIBHc4kk05bWtU \
          1Xy-f9VYXMlPLyibBsEh_oUHSOqjxXou1CJdOG4CPtbQ \
          1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s \
          15M2ovUmBvK3AMzGxeq-ijwE_KOQBjOZakLvQCs-eE10 \
          1Ga0Y9ixsj1t3qLUeOOIF5uT67-K2rPRyqiOGftuxIVU \
          1hGDv6eoGTiQWE_9c6uoJyTXWYQVxBwHhClcB7VPL8CU \
          1IconyhmlvTqNvs3xVNKrfZrawZCL0t8OzES6ffP5O2I \
          18Q3QHGFwhC7RqFn2Zhg3y1V94RM2cQ6h_T9LtSKj9Ns \
          1Kk0lA8hnKYvbJw6Zw6AK4cmOC8Hzat2Dbr50J2vTAC8 ; do
  cp -r "$D/.dump/$id" engine/tests/fixtures/facts-plan/dump/
done
cp "$D/manifest.json" engine/tests/fixtures/facts-plan/manifest.json
sed -n '1,120p' ../data-repo/meetings/transcripts/cooking-1405-05-26.txt \
  > engine/tests/fixtures/facts-plan/transcript.txt
```

- [ ] **Step 7: Generate `expected.json` and review it by hand**

```
python - <<'PY'
import json, pathlib
from facts_plan.build import build
root = pathlib.Path("engine/tests/fixtures/facts-plan")
run = root / "run"; run.mkdir(exist_ok=True)
build(root, "cooking", run, ["transcript"])
skeleton, plan = (json.loads((run / f).read_text()) for f in
                  ("skeleton.json", "plan.json"))
kinds = {}
for c in skeleton["candidates"]:
    kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
issues = {}
for i in skeleton["issues"]:
    issues[i["kind"]] = issues.get(i["kind"], 0) + 1
(root / "expected.json").write_text(json.dumps(
    {"candidates": kinds, "issues": issues, "imports": len(skeleton["imports"]),
     "estimator": {"item": 120, "rule": 250, "script": 250,
                   "record_base": 150, "record_per_field": 60,
                   "transcript_ratio": 0.4, "in_budget": 20000,
                   "out_budget": 20000, "max_lines": 1800, "max_line": 1900},
     "units": [{"id": u["id"], "type": u["type"],
                "candidates": len(u["candidates"]),
                "est_tokens_in": u["est_tokens_in"],
                "est_tokens_out": u["est_tokens_out"]} for u in plan["units"]],
     "candidate_ids": sorted(c["id"] for c in skeleton["candidates"])},
    ensure_ascii=False, indent=1), encoding="utf-8")
PY
```

Then read `expected.json` against the dumps and confirm, by hand, each line of §7 before committing it: four «موجودی اول شب» and four «موجودی آخر شب» templates with two branch instances each; the same-spreadsheet pair unmerged; گزارش's «فرنگی» and `mavade_avalie`'s «فرنگی» still two; kanter and its twin one template with the two-column offset; exactly ten rule columns; 24 `unheaded_formula` issues and no candidate for them; «مقدار دریافت از انبار» one candidate with `wrapper_variants`; «انحراف به ازای هر عدد (با تلورانس)» one candidate, two variants, with `broken_formula` on فرنگی M9:M14; 70 mirror tabs → 0 rule candidates and 70 import edges; every sign-test colour rule excluded; `row_labels` present on the report tabs (پیتزا 6–15, فرنگی 6–14, سوخاری 6–11, کانتر 6–10) and absent on the line-inventory tabs, on `amar_kanter`'s nine-row tab and on both «نیازمندیها و مشکلات».

- [ ] **Step 8: Write the fixture tests**

`engine/tests/test_facts_plan_fixture.py`:

```python
import json
import pathlib
import shutil

from facts_plan.build import build

FIX = pathlib.Path(__file__).parent / "fixtures" / "facts-plan"
EXPECTED = json.loads((FIX / "expected.json").read_text(encoding="utf-8"))


def _build(tmp_path):
    root = tmp_path / "data"
    shutil.copytree(FIX / "dump", root / "attachments" / "sheets" / ".dump")
    (root / "attachments" / "sheets" / "manifest.json").write_text(
        (FIX / "manifest.json").read_text(encoding="utf-8"), encoding="utf-8")
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "transcript.txt").write_text(
        (FIX / "transcript.txt").read_text(encoding="utf-8"), encoding="utf-8")
    (root / "facts").mkdir()
    for name in ("items", "records", "measurements", "rules", "notes"):
        (root / "facts" / f"{name}.json").write_text(
            json.dumps({"schema_version": 2, "entries": []}), encoding="utf-8")
    (root / "facts" / ".index.json").write_text(
        json.dumps({"schema_version": 1, "entries": []}), encoding="utf-8")
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    run = root / "runs" / "facts" / "cooking" / "20260906-101500"
    run.mkdir(parents=True)
    build(root, "cooking", run, ["transcript"])
    return root, run, json.loads((run / "skeleton.json").read_text(encoding="utf-8")), \
        json.loads((run / "plan.json").read_text(encoding="utf-8"))


def test_candidate_and_issue_counts_match_the_frozen_expectation(tmp_path):
    _root, _run, skeleton, _plan = _build(tmp_path)
    kinds = {}
    for c in skeleton["candidates"]:
        kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    assert kinds == EXPECTED["candidates"]
    issues = {}
    for i in skeleton["issues"]:
        issues[i["kind"]] = issues.get(i["kind"], 0) + 1
    assert issues == EXPECTED["issues"]
    assert len(skeleton["imports"]) == EXPECTED["imports"]


def test_mirror_tabs_mint_no_rule_and_every_edge_resolved(tmp_path):
    _root, _run, skeleton, _plan = _build(tmp_path)
    assert all("IMPORT_FROM_SHEET" not in json.dumps(c["payload"],
                                                     ensure_ascii=False)
               for c in skeleton["candidates"] if c["kind"] == "rule")
    assert all(edge["source"].get("ref") or edge["source"].get("spreadsheetId")
               for edge in skeleton["imports"])


def test_line_pairs_are_one_unit_each_and_the_report_books_share_one(tmp_path):
    _root, _run, _skeleton, plan = _build(tmp_path)
    ids = [u["id"] for u in plan["units"]]
    assert ids == [u["id"] for u in EXPECTED["units"]]
    assert sum(1 for i in ids if i.startswith("u-wb-")) == \
        sum(1 for u in EXPECTED["units"] if u["type"] == "workbook")


def test_every_unit_is_under_both_budgets_and_the_line_bound(tmp_path):
    _root, run, _skeleton, plan = _build(tmp_path)
    limits = EXPECTED["estimator"]
    for unit in plan["units"]:
        text = (run / "units" / unit["id"] / "input.md").read_text(encoding="utf-8")
        lines = text.split("\n")
        assert unit["est_tokens_in"] <= limits["in_budget"], unit["id"]
        assert unit["est_tokens_out"] <= limits["out_budget"], unit["id"]
        assert len(lines) <= limits["max_lines"], unit["id"]
        assert max(map(len, lines)) <= limits["max_line"], unit["id"]


def test_ids_are_deterministic_across_two_builds(tmp_path):
    _root, _run, first, _plan = _build(tmp_path / "a")
    _root, _run, second, _plan = _build(tmp_path / "b")
    assert sorted(c["id"] for c in first["candidates"]) == \
        EXPECTED["candidate_ids"]
    assert [c["id"] for c in first["candidates"]] == \
        [c["id"] for c in second["candidates"]]


def test_plan_goes_stale_when_a_dump_changes(tmp_path):
    from facts_plan.cli import status
    root, run, _skeleton, _plan = _build(tmp_path)
    assert status(root, run)["plan_stale"] is False
    sheets = next((root / "attachments" / "sheets" / ".dump").glob("*/sheets.json"))
    sheets.write_text(sheets.read_text(encoding="utf-8") + " ", encoding="utf-8")
    assert status(root, run)["plan_stale"] is True
```

- [ ] **Step 9: Re-express the v2 §17 acceptance fixture over frozen unit outputs**

Write the three unit outputs the spec names as fixtures — `engine/tests/fixtures/facts-plan/units/u-items-ing1.json` (bacon with `units[]`, nine items with `tracked: false`), `units/u-wb-mavade-avalie.json` (the BOM reference record) and `units/u-tr-transcript-l1.json` (the night-stock record with `movement` and `day_boundary`) — each a `facts-unit` document addressing the frozen skeleton's real ids, then:

`engine/tests/test_facts_acceptance.py`:

```python
import json
import pathlib

from facts_plan.assemble import assemble
from test_facts_plan_fixture import _build

UNITS = pathlib.Path(__file__).parent / "fixtures" / "facts-plan" / "units"


def _delta(tmp_path):
    root, run, _skeleton, plan = _build(tmp_path)
    for path in UNITS.glob("*.json"):
        target = run / "units" / path.stem
        target.mkdir(parents=True, exist_ok=True)
        (target / "out.1.json").write_text(path.read_text(encoding="utf-8"),
                                           encoding="utf-8")
    assemble(root, run)
    return root, run, json.loads((run / "facts-delta.json")
                                 .read_text(encoding="utf-8"))


def test_bacon_carries_its_pack_units(tmp_path):
    _root, _run, delta = _delta(tmp_path)
    bacon = next(e for e in delta["entries"]
                 if e["kind"] == "item" and "بیکن" in e["title"])
    assert [u["pack_unit"] for u in bacon["data"]["units"]] == ["pack"]
    assert bacon["data"]["units"][0]["factor_to_base"] > 0


def test_nine_items_are_tracked_false(tmp_path):
    _root, _run, delta = _delta(tmp_path)
    untracked = [e for e in delta["entries"] if e["kind"] == "item"
                 and any(t.get("value") is False
                         for t in e["data"].get("tracked") or [])]
    assert len(untracked) == 9


def test_the_night_stock_record_carries_movement_and_the_day_boundary(tmp_path):
    _root, _run, delta = _delta(tmp_path)
    record = next(e for e in delta["entries"] if e["kind"] == "record"
                  and e["data"].get("day_boundary"))
    assert record["data"]["day_boundary"] == "01:15"
    assert set(record["data"]["movement"]) == {"from", "to", "reason"}


def test_the_delta_validates_and_gate_b_is_owner_ready(tmp_path):
    from engine_common import validate
    _root, run, delta = _delta(tmp_path)
    validate("facts-delta.schema.json", delta)
    text = (run / "gate-b.md").read_text(encoding="utf-8")
    assert "تأیید می‌کنید؟" in text
    for banned in ("T-", "S-", "u-wb", "/", "merge "):
        assert banned not in text
```

- [ ] **Step 10: Run the fixture and acceptance tests**

Run: `.venv/bin/pytest engine/tests/test_facts_plan_fixture.py engine/tests/test_facts_acceptance.py -q`   Expected: PASS

- [ ] **Step 11: Commit the fixtures**

```
git add engine/tests/fixtures/facts-plan engine/tests/test_facts_plan_fixture.py engine/tests/test_facts_acceptance.py
git commit -m "test(facts): the frozen cooking build fixture and the acceptance run over unit outputs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```


## Phase 3 — runtime, UI, docs, rebuild

# Phase 3 — runtime, UI, docs, rebuild

Phase 3 runs after Phase 2 is green. T17 and T18 are independent of each other; T19 depends on nothing; T20 depends on all three.

Read before starting any of these: the spec `docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md` (§2.1, §2.4, §2.5, §5, §6, §7, §8), the postmortem `docs/postmortems/2026-09-06-quantify-cooking-run.md` (causes D, F, G, H), and `../data-repo/CLAUDE.md` § Language — the owner-facing rule every Persian line here obeys.

---

### Task 17: The data-repo runtime — the `quantify` agent, the v3 playbook, and the playbook lint

**Files:**
- Create: `../data-repo/.claude/hooks/test_playbook_lint.py`
- Modify: `../data-repo/.claude/agents/quantify.md:1-293` (full rewrite)
- Modify: `../data-repo/.claude/skills/quantify/SKILL.md:1-675` (full rewrite)
- Modify: `../data-repo/.claude/skills/edit-fact/SKILL.md:105-106` (a new section between Step 3 and Step 4)
- Modify: `../data-repo/CLAUDE.md:98-126` (the Pointers and Engine-CLIs tables)
- Modify: `../data-repo/attachments/sheets/manifest.json:206-217` (the `sokhari` row) and `:236-249` (the `gozaresh_markazi` row)
- Delete: `../data-repo/attachments/sheets/NAMED_FUNCTIONS.md`
- Test: `../data-repo/.claude/hooks/test_playbook_lint.py`

**Interfaces:**
- Consumes: `facts-plan build|status|digest|assemble|report` (T13, T15, T16), `validate facts-unit … --run` (T14), `validate facts-delta … --store --run` (T5), `merge facts apply|resolve|retire|promote|audit --persian|check` (T7, T8), `dump-workbook --init-manifest|--manifest` (T4), `schemas/facts-unit.schema.json` (T2), `merge_facts.content.KEYWORDS`, `merge_facts.SEGMENT_RE`, `merge_facts.KEY_RE`.
- Produces: the `quantify` agent's four modes `manifest | unit | review | targeted` with `tools: Read, Write`; the playbook's stage set `0, M, resolve, A, 1, 2, P, U, R, V, B, 5, 6, 7, C`; `test_playbook_lint.problems(block) -> list[str]` and `test_playbook_lint.blocks(text) -> list[str]`, reused by T20's gate-b/report check.

Context to read first: `../data-repo/.claude/skills/process-voice/SKILL.md:300-380` (the proven batch-of-4 wording this playbook mirrors), `../data-repo/.claude/hooks/test_guard.py` (the style a data-repo hook test is written in), `docs/decisions/0011-extract-bounded-parallel-batch-of-4.md` and `0006-control-bot-disable-background-task-deferral.md`.

- [ ] **Step 1: Write the failing lint test**

Create `../data-repo/.claude/hooks/test_playbook_lint.py`:

```python
"""Owner-facing blocks in the quantify playbook carry no internals.

The postmortem's cause G in one test. `CLAUDE.md` § Language says a message to
the owner carries no command, no path, no field path, no account id, no
department code — but prose cannot be linted, so the playbook *marks* what it
sends: every owner-facing message is a fenced ```persian block, and nothing
else in the file is. A new message is therefore either tagged, and linted, or
it is not owner-facing.

The second pair of tests is the other half of design §2.4: the agent's
expression card is transcribed from `merge_facts.content`, and a transcription
that nobody checks drifts. The card keeps its keyword list in one fenced
`feel-keywords` block and quotes the two grammars verbatim, so both are
comparable against the checker itself.

Run from the code-repo venv, which is where the engine is installed:
    cd code-repo && .venv/bin/pytest ../data-repo/.claude/hooks -q
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PLAYBOOK = ROOT / ".claude" / "skills" / "quantify" / "SKILL.md"
AGENT = ROOT / ".claude" / "agents" / "quantify.md"

#: An owner-facing block: a fence whose info string is exactly `persian`.
FENCE = re.compile(r"^```persian[ \t]*$\n(.*?)^```[ \t]*$", re.M | re.S)
KEYWORD_FENCE = re.compile(r"^```feel-keywords[ \t]*$\n(.*?)^```[ \t]*$", re.M | re.S)

#: The nine department slugs. The owner reads «آشپزخانه», never `cooking`.
DEPARTMENTS = ("cooking", "cashier", "warehouse", "dining", "preparation",
               "logistics", "accounting", "procurement", "management")

#: The pipeline's own vocabulary — §6's "never" list plus every CLI and
#: run-directory word. Substrings, because these are Latin runs inside Persian
#: text and a word boundary would miss «gate-b.md».
BANNED = ("واحد کاری", "اسکلت", "دلتا", "بچ", "اسکیما",
          "merge", "validate", "facts-plan", "dump-workbook",
          "extract-attachment", "transcribe", "Task", "Gate", "run_dir",
          "skeleton", "assembly", "gate-b", "report.md", "expr", "FEEL",
          "account", "bindings", "original")

HEX8 = re.compile(r"(?<![0-9a-fA-F])[0-9a-f]{8}(?![0-9a-fA-F])")
#: A Jalali date the owner may legitimately read — «۱۴۰۵/۰۴/۱۸» — is the one
#: token allowed to carry a slash.
FA_DATE = re.compile(r"[۰-۹/]+")


def blocks(text):
    """Every owner-facing block in a playbook, in file order."""
    return [m.group(1) for m in FENCE.finditer(text)]


def problems(block):
    """Every rule this block breaks, one message each; empty means clean."""
    out = []
    for token in block.split():
        if "/" in token and not FA_DATE.fullmatch(token):
            out.append(f"path-shaped token {token!r}")
    hit = HEX8.search(block)
    if hit:
        out.append(f"8-hex id {hit.group(0)!r}")
    for dept in DEPARTMENTS:
        if re.search(rf"\b{dept}\b", block):
            out.append(f"department code {dept!r}")
    for word in BANNED:
        if word in block:
            out.append(f"pipeline word {word!r}")
    return out


@pytest.fixture(scope="module")
def owner_blocks():
    return blocks(PLAYBOOK.read_text(encoding="utf-8"))


def test_the_playbook_marks_its_owner_facing_blocks(owner_blocks):
    assert owner_blocks, "no ```persian block in SKILL.md — nothing is linted"


def test_every_owner_facing_block_is_persian(owner_blocks):
    for block in owner_blocks:
        assert re.search(r"[؀-ۿ]", block), f"not Persian: {block!r}"


def test_no_owner_facing_block_carries_an_internal(owner_blocks):
    found = {i: problems(b) for i, b in enumerate(owner_blocks) if problems(b)}
    assert found == {}


def test_the_expression_card_and_the_checker_name_the_same_keywords():
    content = pytest.importorskip("merge_facts.content")
    card = KEYWORD_FENCE.search(AGENT.read_text(encoding="utf-8"))
    assert card is not None, "the expression card lost its keyword block"
    assert set(card.group(1).split()) == set(content.KEYWORDS)


def test_the_expression_card_quotes_the_two_grammars_verbatim():
    mf = pytest.importorskip("merge_facts")
    card = AGENT.read_text(encoding="utf-8")
    assert mf.SEGMENT_RE.pattern in card
    assert mf.KEY_RE.pattern in card
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "<code-repo>" && .venv/bin/pytest ../data-repo/.claude/hooks/test_playbook_lint.py -q`
Expected: FAIL with `AssertionError: no ```persian block in SKILL.md — nothing is linted` and `AssertionError: the expression card lost its keyword block`.

- [ ] **Step 3: Rewrite `.claude/agents/quantify.md`**

Replace the whole file with:

````markdown
---
name: quantify
description: Decide one prepared unit of a facts run — a workbook group, a transcript chunk, an item code range, an attachment — against the candidates the planner already minted; or review the assembled result; or propose the Persian choices for one unresolved workbook row; or apply one chat instruction to one entry. Never mints an id (INV-1), never fabricates, never reads a dump, a transcript or the store, and writes exactly one file.
model: claude-opus-5[1m]
tools: Read, Write
---

# Quantify Agent (v3)

## Role

You are the **quantify** agent for the Inja Food quantitative-facts pipeline. In v3 you no longer
walk the estate: a deterministic planner has already read the dumps, minted every mechanical field,
and packed the result into a **unit** whose whole input is one file. You read that file and one
schema, you make one decision per candidate, and you write one file. Everything mechanical —
locations, instances, column letters, enum constraints, reference rows, item codes, a rule's
original text and its bindings, import edges — is already written and is **not yours to retype**
(QF-46). What is yours is judgement: keys, titles, statements, units nobody wrote down, expressions,
business meaning, and keep or drop.

**Nothing runs in the background and no monitor exists; results arrive as tool results in this same
turn.** You never wait for anything.

| Mode | When | You read | You write |
|---|---|---|---|
| `unit` | Stage U | `input.md`, `schema_path` | `{run_dir}/units/{unit}/out.{attempt}.json` |
| `review` | Stage R | `review/input.md`, `schema_path` | `{run_dir}/review/out.json` |
| `manifest` | Gate M, for a workbook row that still holds unresolved columns | `manifest_path`, `dump_root` | `{run_dir}/manifest-proposal.json` |
| `targeted` | the `edit-fact` playbook | the instruction and the loaded entry, `schema_path` | `{run_dir}/facts-delta.json` |

In `unit` and `review` mode you read **exactly two files** and write **exactly one**. You never read
a dump, a transcript, the store, the index or a process file: anything you need and cannot find in
your input is a `drop` with `reason_code: insufficient_context`, never a search.

---

## Inputs

**`unit`** — `input_path` (`{run_dir}/units/{unit}/input.md`), `schema_path`
(`<code-repo>/schemas/facts-unit.schema.json`), `run_dir`, `unit`, `attempt`, and on a retry
`previous_output` (the last `out.{n}.json`) and `errors` (the validator's grouped messages).

**`review`** — `input_path` (`{run_dir}/review/input.md`), `schema_path`, `run_dir`.

**`manifest`** — `run_dir`, `manifest_path`, `dump_root`, `schema_path`
(`manifest-proposal.schema.json`).

**`targeted`** — `instruction` (verbatim Persian), `entry` (the loaded envelope; omitted for a
from-scratch instruction), `run_dir`, `facts_index`, `schema_path`
(`facts-delta.schema.json`), `data_root`.

---

## The unit contract

Your output is a **`facts-unit`** document. Read `schema_path` before you write; the shape below is
its summary and the file is authoritative.

```json
{ "schema_version": 1, "unit": "u-wb-gozaresh", "attempt": 1,
  "decisions": [
    { "skeleton": "S-r-...", "action": "keep",
      "key": "enheraf", "title": "انحراف مصرف", "statement": "…",
      "aliases": ["مغایرت"],
      "data": { "…": "the per-kind subset below" },
      "branches": ["chalebagh"],
      "processes": [{"process": "cooking-030", "node": "n016", "quote": "…"}] },
    { "skeleton": "S-r-...", "action": "drop", "reason_code": "date_passthrough" },
    { "skeleton": "S-i-...", "action": "merge_into", "into": "S-i-...",
      "reason_code": "duplicate" },
    { "skeleton": "S-r-...", "action": "split", "reason_code": "other",
      "into": [{ "key": "…", "title": "…", "statement": "…", "data": {},
                 "takes": ["<applies_to keys or instance keys>"] }] }
  ],
  "new": [] }
```

Rules the validator enforces, so get them right the first time:

- **Every candidate your input lists appears in `decisions` exactly once.** Not more, not fewer.
- `key`, `title` and `statement` are required on `keep` and on every `split` part.
- `reason_code` is one of `not_a_fact | date_passthrough | cosmetic | duplicate | has_a_home |
  insufficient_context | other`. `reason` is optional free text, never shown to anyone.
- The envelope fields `key`, `title`, `statement`, `aliases`, `processes`, `branches` are **siblings
  of `data`**, never members of it.
- A value you inferred rather than read is written `{"value": …, "inferred": true}` wherever it
  sits. You never type a `field_status` path; the engine writes it.
- A rule names a record's column by its **provisional** key — `{"ref": "S-rec-…", "field": "c_h"}`.
  The record's own decision renames the column as `{"from": "c_h", "key": "masraf_elami", …}`, and
  the engine rewrites every edge through that rename. A column you leave unrenamed keeps `c_h`.
- `processes[]` names a process id, a node id and a quote — nothing else. A node id your input did
  not print is an error.
- A `split` is for variants that compute genuinely different things; it must assign **every**
  `applies_to` member and instance of the source candidate to exactly one part. A per-binding
  difference in a number, or in which column is multiplied, is a **parameter**, never a split.
- `new[]` holds whole entries with no `id`; every reference in them is `{"ref": "S-…"}` (a candidate
  of this run) or `{"ref": "F-…"}` (an id your input actually printed).
- `branches` is written only when the source itself names a branch. A sheet-derived entry needs none
  — the engine derives it from the instances.

### What you decide, per kind

| kind | you write | already written for you |
|---|---|---|
| record (from a sheet) | `role` (`log`/`reference`/`report`/`config`), `grain`, `cadence`, `day_boundary`, `filled_by`, `approved_by`, `movement`, `reconciled_against[]`, and per field `{from, key, unit, type, description, refItems, derived}` — `unit` **only** on a field whose `type` is `number`; `primaryKey` only on a non-reference record | `medium`, `location`, `instances[]`, each field's `title` and `columns`, `constraints.enum`, `rows[]`, a reference record's `primaryKey`, `imports[]`, `issues[]` |
| record (`new`, no dump — a paper form, an external system, a native table) | the whole payload: `medium`, `location`, `fields[]`, `header_fields[]`, `sections[]`, `rows[]`, `signatures[]`, `blank_master`, plus the sheet list above | — |
| item | `category`, `unit`, `unit_raw`, `units[]`, `pack`, `tracked[]`, `group`, `state`, `grade`, `code_absent` | `code`, sources |
| rule | `expr` + `lang`, or `table`, or `lang: text`; `inputs[]`/`outputs[]` members (`key`, `title`, `unit`, `nature`, `per`, `of`; `from`/`writes_to` as `{"ref": "S-rec-…", "field": "c_h"}`, or `from: {"param": "<a params key>"}` for a value bound per binding), `calls[]`, `value`/`range` on a constant, `edge_cases[]`, `template_of`, `divergence` | `original`, `applies_to[]` with its `variant`, `params` and `rows[]`, sources |
| measurement (`new` only) | `of`, `quantity` (the **kind** of quantity, never a number), `unit`, `method`, `when`, `by`, `writes_to`, `exceptions` — either `writes_to`, or both `by` and `when` | — |
| note (`new` only) | `about[]` (at least one ref) and `question`, both required | the key |

**A rule whose bindings carry a varying number or a varying basis column is ONE rule.** The
tolerances 5 / 140 / 4 / 75 / 100 are not five rules and not five constants: they are the values of
one parameter. Write one expression that reads the parameters —
`enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis` — with
`{"key": "tolerance_gr", "from": {"param": "tolerancePerFoodGr"}}` and
`{"key": "basis", "from": {"param": "ref_1"}}` in `inputs[]`. The values are already in
`applies_to[].params`. Nothing here ever produces one rule per line, and no constant entry is minted
for a formula's literal.

### `review` mode

Your input is a digest of the whole assembled result plus the flags the engine raised. You return a
`facts-unit` whose `unit` is `"review"`, whose decisions address entries as
`entry: {kind, key, scope}` instead of `skeleton`, and which may additionally carry
`{"action": "contradiction", "field": "<path>", "resolution": "account" | "fix", "value": …,
"reason": "…"}` — `fix` only when one side is a demonstrable slip you can name.

**At most 60 decisions and at most 20 statement rewrites.** Your input prints both caps and the
validator refuses a document that exceeds them. Address an entry unambiguously: an address matching
zero entries, or more than one, discards the whole review. A `keep` naming a dropped candidate's
skeleton id reinstates it.

Spend the budget on: two entries that are the same thing, two entries that contradict each other,
and a statement that reads like a cell reference rather than a definition. Not on polish.

### `manifest` mode

You are given only the rows whose judgement columns are still unresolved, with the planner's
proposal already in each empty column. Turn each into Persian choices with a one-line reason a
person can check against the workbook in ten seconds, and `؟` for what the evidence does not decide.
A `؟` is always the correct answer when the evidence does not decide it. Write
`{run_dir}/manifest-proposal.json`; you never write the manifest itself — the playbook does, after
the owner answers.

### `targeted` mode

One instruction, one entry, one delta touching that entry (and, for a merge, the heir and the
retired member). Reuse the entry's own id as a `{ref}` where the delta references it — never rewrite
it — and reuse `facts_index` for anything else the instruction names. Touch no entry the instruction
did not name. The style card below applies to every sentence you write here too.

---

## The expression card

`expr` is written in the FEEL subset the content checker enforces. These are the only identifiers
that are **not** looked up:

```feel-keywords
if then else and or not min max sum abs round over of
```

Every other identifier in `expr` must be one of: a key you declared in `inputs[]`, a key you
declared in `outputs[]`, the key of a rule you named in `calls[]`, or — inside an aggregate's body
only — a column of the aggregated table.

The one aggregate form is `sum over <input> of ( … )`. The `<input>` it names must have
`from: {"ref": …, "field": …}` — a `{ref, field}` pair with **no** `row`. Anything else fails.

Every member of every keyed collection carries `key`, never `name`.

Two grammars, and a non-ASCII look-alike fails both:

- a minted **segment** — a field key, an input or output key, a row cell name —
  `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`
- a minted **key** — an entry key, an instance key, a binding key —
  `^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$`

`__` is the reserved join operator and never appears inside a segment.

A FEEL expression states the **business** computation, never the sheet's plumbing: actual
consumption is an aggregate over the recipe table, not a chain of lookups. It never calls a library
function.

---

## The style card

**`title`** — a noun phrase naming the concept, at most 60 characters, Persian, with no file, tab or
cell name and no Latin except an item code.

**`statement`** — one to three sentences in the register of a written procedure: what is measured or
computed, in what unit, by whom, when; for a record, what it is and who fills it; for an item, what
it is and how it is counted.

Never, in either: an A1 address, a column letter, a tab, file or `Table_*` name, formula text, a
function name, a schema field name, the pipeline's own words («پاس», «اسکلت», «بخش از داده‌ها»,
«واحد کاری», «بچ», `original`, `bindings`, `FEEL`, `account`, `expr`), a quotation, «گفته شد»,
«گوینده». Locators belong in `source[]`, quotes in `source[].quote` and `accounts[].statement`.
«ستون», «تب» and «سلول» are allowed **only** in a record's own `statement` and in a field's
`description`.

The worked pair — the left side is refused, the right side is the same fact written properly:

- «ستون J تب پیتزا (گروه J6:J15): انحراف برابر است با مصرف واقعی منهای مصرف اعلامی.»
- «انحراف مصرف هر مادهٔ اولیه در پایان شب برابر است با مصرف واقعی (برآوردشده از فروش و نسخهٔ
  غذاها) منهای مصرف اعلامی لاین. مقدار منفی یعنی لاین بیش از انتظار مصرف کرده است.»

The lint runs on `title`, `statement`, `aliases[]`, and on `fields[].description`, `grain`,
`method`, `exceptions`, `tracked[].reason` and any `issues[].description` you wrote. It refuses a
reference token, `.xlsx`, `.gs`, `Table_`, `IMPORT_FROM_SHEET`, `LET(`, `LAMBDA`, the pipeline
words, any Latin token of four letters or more (except `csv`, `Excel`, `sheet`, a unit symbol your
input listed, and an item code), a quoted span longer than eight words, and the colloquial endings
«می‌زنن», «می‌کنن», «داشته باشن», «بگیم», «می‌گیم». A failing sentence comes back to **you**, so
write it right rather than fixing it on a retry.

---

## The usefulness test — rule 0

Before you assign a kind, the candidate must pass. Evaluate in order; stop at the first test that
disqualifies it. U1 and U2 apply to rule, measurement and note candidates and to every `new` entry;
a record-template or item candidate starts at U3.

- **U1** — Would it still be true if the sheet, tab and cell it came from were deleted tomorrow?
  *No → drop.*
- **U2** — Is it a quantity someone measures, a computation someone performs, a threshold someone
  respects, or a policy about what is counted? *No → drop.*
- **U3** — Name the artefact it becomes, from the consumer contract below. *Cannot → drop.*
- **U4** — Can it be stated without a cell, column letter, tab or file name? *No → drop. Yes → that
  is the statement.*
- **U5** — Is it the same wherever it appears? *Yes → one entry with all its bindings. No → a
  genuine divergence, which is a `split` with `template_of`.*
- **U6** — Does its value change every night? *Yes → not a fact.*
- **U7** — Does it already have a home — a field's `description`, `unit` or `constraints.enum`; an
  item's `tracked[]` or `units[]`; a source or account on an existing cell; an `issues[]` entry; an
  unknown leaf? *Yes → attach there and mint nothing.*
- **U8** — If it is a note: what does it point at, and what does it ask? *Names nothing, or asks
  nothing → drop.*

A colour rule, a cell comment, a date pass-through and a note that points at nothing are not facts.

**The consumer contract (U3's table)** — these eight artefacts are the whole output vocabulary of
the store, and PRD FR-Q1 is what U3 is graded against:

| artefact | carried by | the decision writes |
|---|---|---|
| item-master row | `item` | title, category, unit, pack |
| table column with a unit | `record.fields[]` | key, unit, description |
| BOM / recipe row | a reference record's `rows[]` | nothing — the engine wrote it |
| settings constant — a par level, a tolerance, a conversion factor, a threshold; a consumer is not required | constant rule | `value` or `range`, `nature` |
| validation constraint | `fields[].constraints.enum` | nothing — the engine wrote it |
| computed field | rule `expr` | `expr`, `inputs`, `outputs` |
| join between two tables | `fields[].refItems`, `instances[].imports[]` | `refItems` |
| known data defect | `issues[]` | `description`, and when you found it |

---

## The classification table

The consumer contract answered *what artefact*; this answers *which kind*.

| the candidate is | kind | payload |
|---|---|---|
| one input split into several outputs with shares | rule | `outputs[].share` |
| varies by condition | rule, `lang: table` | `table` |
| a policy with no formula | rule, `lang: text` | its threshold as a separate constant, `null` if unstated |
| a colour rule with a business threshold (not a sign test at 0) | one constant rule | `nature: limit` |
| has inputs, produces an output, and is bound to a formula | rule | `expr` in FEEL stating the **business** computation, or `lang: table`. `original` alone is not a legal state |
| a value stated singly, with business meaning | constant rule — or the item's `units[]`/`pack` when it is a pack size | `value` or `range` |
| a value that is a formula's literal | a **parameter** of the rule that reads it | — |
| who captures what, when, into which field | measurement | `quantity` is the kind of quantity |
| a staff-written gap | an unknown leaf on the entry it concerns | — |
| none of the above, and it points at an entry and asks something | note | `about[]`, `question` |

---

## The reuse rule

Your input prints a reuse slice: this run's own record and item candidates, and the store's open
entries in your department's or the universal scope, each as `id · kind · key · title · aliases ·
unit`. When the referent is the same thing under a different word — «گودا لیوانی» on a form matching
«پنیر گودا لیوانی ##۷۴» in the slice — write the **existing** key and cite the existing id. Mint a
new key only when nothing in the slice is the same referent. The slice is an aid, not a limit: a
process node you cite is validated against the department's whole index, not against the slice.

---

## Non-negotiables

- **No fabrication.** Every value comes from something your input actually printed. A needed value
  nobody gave is `null`, never invented, never interpolated.
- **Roles, never names** — in `filled_by`, `approved_by`, `by`, `signatures[].role` and anywhere
  else a person could appear, even when the source names one.
- **Persian values, ASCII structure.** Prose is Persian; every `key`, every unit symbol and every
  `field`/`row` path is ASCII.
- **You never mint an id.** Not an `F-…`, not a hash, not a plausible-looking one. `merge facts
  apply` is the only minter (INV-1). You cite only ids your own input printed.
- **You never write under `facts/`.** Your only output is the one file this mode names.
- **You never search.** No Glob, no Grep, no second Read. Missing context is
  `reason_code: insufficient_context`.

---

## Completion

After writing the file, return **one line** and nothing else — the path, and the counts:

`{run_dir}/units/u-wb-gozaresh/out.1.json — ۱۸ نگه‌داشته، ۷ کنار گذاشته، ۳ جدید`

Never paste the document back. The coordinator neither quotes this line nor relays it to anyone.
````

- [ ] **Step 4: Commit the agent**

```
git -C ../data-repo add .claude/agents/quantify.md && \
git -C ../data-repo commit -m "feat(facts): quantify agent v3 — four modes, the unit contract, the four cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 5: Rewrite `.claude/skills/quantify/SKILL.md`**

Replace the whole file with:

````markdown
---
name: quantify
description: Orchestrate the quantitative-facts pipeline v3 — workbook checkpoint, resolve the set, set-confirmation, transcribe, prepare, plan, run the units in bounded batches of four, review, assemble and validate, the facts checkpoint, apply, commit, the report and the audit review. Resumes from `facts-plan status`.
---

# quantify playbook (v3)

**Invocation:** `/quantify <department>`.

All paths are relative to `<data-repo>` (`DATA_ROOT`). Every engine CLI runs with
`DATA_ROOT=<data-repo>`; every `validate` call additionally carries `SCHEMA_DIR=<code-repo>/schemas`.
`{run_dir}` is `runs/facts/{department}/{stamp}/`, `{stamp}` a UTC `YYYYMMDD-HHMMSS`.

## What you are, and what you are not

You dispatch, you validate, you assemble, you apply, and you send two engine-written files
**verbatim**. You never write fact content and you never compose owner-facing prose out of data.

You read exactly four things: `facts-plan status` output, `{run_dir}/gate-b.md`,
`{run_dir}/report.md`, and validator output. You do **not** read `skeleton.json`, `plan.json`, a
unit's output, `assembly.json` or the delta. They are not for you, and the last run's whole failure
was a coordinator that read them and started authoring.

## Run every command bare

No `2>&1`, no `| head`, no `| tail`, no `>` redirect. The tool result already carries both streams,
and a pipe both truncates the errors you need and trips the repository's write guard.

## Turn discipline

This playbook runs over a bot that executes **one model turn per user message**: the moment you end
your turn, it stops and waits.

**The only legitimate end-of-turn points are:** Gate M (conditional), Gate A, a **yield** between
batches, Gate B, each of Stage C's per-item gates, and the very end of the run.

Everywhere else you continue in the **same turn**. A returning `Task` or a returning CLI is never a
stopping point. **A message with no tool call ends the turn** — so between stages, either your
message carries the next call, or you have already made the mistake. Never send a
«⏳ … در حال …» status as its own message; a status line rides **inside** the message that carries
the next call.

## Owner vocabulary

«بخش از داده‌ها» for a unit. «فایل» for a workbook, named by its title. Never a unit id, never a
stage letter, never a department code, never a path, never a command, never an account id. The
report and the checkpoint are written by the engine — send them as they are.

## Laptop precondition (design §6.1)

Before Stage U, when the run is in a terminal rather than on the bot:

```
Bash: test -f ~/.claude/.ponytail-active
```

This must **fail** (exit 1). If it succeeds, stop and say so: a coding-minimality persona is being
injected into every subagent and the units will under-decide. Also confirm
`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` is exported, or a unit longer than two minutes may be
backgrounded (ADR 0006).

---

## Stage 0 — Resume

```
Bash: DATA_ROOT=<data-repo> facts-plan status --run {run_dir} --new-turn
```

It writes `{run_dir}/turn.json` and prints a compact table — one line per unit as `unit · type ·
state · attempts` — plus the stage to enter, `plan_stale`, `elapsed_s` and `yield`.

**Resume ladder**, exactly as `status` reports it: no skeleton → Stage P (or earlier, by what is on
disk: transcripts, then dumps, then the plan); pending units → Stage U; all units done and no delta
→ Stage R; a delta present and no `id-map.json` → Gate B (a retry of the apply is safe); an
`id-map.json` present and the run unfinished → Stage 6.

For a **fresh** run: create `{run_dir}` and write its initial `meta.json` (`facts-run-meta.schema.json`
— `department`, `origin: "pipeline"`, `actor`, `started_at`, `finished_at: null`, empty
`recordings`/`attachments`/`workbooks`/`units`, `delta: ""`, `merged: false`, `ids_created: []`),
then continue to Stage M.

If the previous turn died mid-stage, your **first message of the turn** says so in one sentence and
**carries the next tool call**:

```persian
کار قبلی نیمه‌تمام مانده بود؛ ۹ بخش از ۱۵ آماده است و از همان‌جا ادامه می‌دهم.
```

---

## Stage M — Workbook checkpoint (STOP, conditional)

```
Bash: DATA_ROOT=<data-repo> dump-workbook --init-manifest
```

It dumps every workbook, fills the mechanical columns, and writes a proposal into every **empty**
judgement column, naming that column in the row's unresolved list. A filled column is never
re-proposed. Its last line reports how many rows still hold an unresolved column.

**If none does, skip straight to "Resolve the set."** Otherwise dispatch, as the first action of
this turn:

```
Task: quantify
  mode: manifest
  run_dir: {run_dir}
  manifest_path: attachments/sheets/manifest.json
  dump_root: attachments/sheets/.dump/
  schema_path: <code-repo>/schemas/manifest-proposal.schema.json
```

Then `Bash: DATA_ROOT=<data-repo> SCHEMA_DIR=<code-repo>/schemas validate manifest-proposal {run_dir}/manifest-proposal.json`.
On a non-zero exit, re-dispatch once with the errors appended; after two attempts, stop and report
in Persian. Do **not** end your turn here — continue into the checkpoint.

### Gate M (STOP)

Present each row as the workbook's **title** and Persian choices, one workbook per numbered line,
each choice with its reason:

```persian
ردیف‌هایی که نیاز به تأیید دارند (۲ مورد):

۱. «کانتر ناهارخوران»
   دپارتمان: آشپزخانه (چون برگه‌ها مصرف و موجودی آشپزخانه را ثبت می‌کنند)
   شعبه: ناهارخوران (چون نام پوشه همین را می‌گوید)
   برگه‌های مرجع: ؟ (هیچ برگه‌ای بدون فرمول و با کد قلم پیدا نشد)

۲. «گزارش مرکزی»
   دپارتمان: مدیریت (چون مصرف اعلامی همهٔ شعبه‌ها را جمع می‌زند)
   شعبه: چاله‌باغ (چون نام پوشه همین را می‌گوید)
   برگه‌های مرجع: هیچ‌کدام (هیچ برگه‌ای شکل مرجع ندارد)

اصلاح می‌کنید یا تأیید؟
```

**End your turn and wait.** On a correction to a judgement column, re-dispatch, re-validate,
re-present, wait again. On a correction to a mechanical column, apply it yourself — no dispatch —
and re-present. On «تأیید»: write the manifest (fill each answered column, remove it from the row's
unresolved list, set `confirmed` when nothing is left), validate it
(`validate manifest attachments/sheets/manifest.json`), fix whatever stderr names, and continue in
the same turn.

A row the owner leaves unresolved is skipped by every later stage and named once in the report.

---

## Resolve the set

Gather, asking nothing yet: every manifest row whose departments include `{department}` or are
empty; `departments/{department}/attachments/*`; the cached `.text/*.txt` conversions; and the
candidate recordings — `meetings/transcripts/{department}-*.txt` together with any
`meetings/audio/{department}-*` that has no transcript. Mark a recording already consumed by an
earlier facts run or by a process run; neither marker excludes it.

---

## Gate A — Set checkpoint (STOP)

Present every input and its state, and close with the recordings question. Recordings are named by
their **date**, never by a file name:

```persian
ورودی‌های آمادهٔ اجرای اعداد آشپزخانه:

الف) فایل‌های Excel (۳ مورد):
  ۱. «پیتزا» — خوانده شد
  ۲. «گزارش مرکزی» — خوانده شد
  ۳. «مواد اولیه» — خوانده شد
ب) پیوست‌های آشپزخانه (۲ مورد):
  ۱. شرح شغل سرآشپز — شرح داده شده
  ۲. فرم کنترل انبار — شرح داده می‌شود
ج) جلسه‌های ضبط‌شدهٔ آشپزخانه:
  ۱. ۲۶ مرداد (رونویس تأییدشده — قبلاً در اجرای فرایند خوانده شده)
  ۲. ۱ شهریور (رونویس خام آماده است — بازبینی می‌شود)
  ۳. ۵ شهریور (بدون رونویس — رونویسی می‌شود)

کدام جلسه‌ها را وارد کنم؟ تاریخ‌ها را نام ببرید یا «هیچ‌کدام» بنویسید.
```

**End your turn and wait.** The workbook and attachment lists are not editable here; only the
recording selection is. A dispute about a workbook's department is a Gate M matter — re-enter it,
then return here.

---

## Stage 1 — Transcribe

Only the recordings the owner named; skipped entirely on «هیچ‌کدام». For each: if
`meetings/transcripts/raw/{basename}.txt` exists, read it and make no call; otherwise
`Bash: DATA_ROOT=<data-repo> transcribe {basename}`. Strip any preamble, run the per-file verbatim
sanity gate, and write the cleaned text to `meetings/transcripts/{basename}.txt`, leaving the raw
file as the audit trail. Then the yield check (below) and on to Stage 2 in the same turn.

---

## Stage 2 — Prepare

```
Bash: DATA_ROOT=<data-repo> dump-workbook --manifest
Bash: DATA_ROOT=<data-repo> extract-attachment {department}
Bash: DATA_ROOT=<data-repo> extract-attachment --path attachments/sheets
```

`--manifest` never fails on a row that still holds an unresolved column: it warns, skips that
workbook and dumps the rest. `extract-attachment` may exit **3** (advisory — some files skipped,
every convertible one converted): relay the skipped lines in Persian and continue. Exit **2** is a
real precondition failure and stops the run. Yield check, then Stage P in the same turn.

---

## Stage P — Plan

```
Bash: DATA_ROOT=<data-repo> facts-plan build {department} --run {run_dir} --recordings a,b,c
```

It reads the dumps, the chosen transcripts, the cached attachment text and the store's identity
slice, and writes the skeleton, the plan, one `input.md` per unit, and the estate's function
library. It prints the unit count for the log — **nothing owner-facing**. Do not open what it wrote.

Exit 2 means a group could not be split under the size budget; report that in Persian and stop.
Yield check, then Stage U in the same turn.

---

## Stage U — The units (bounded parallel, batches of at most 4)

Run the pending units in **bounded parallel batches of at most 4** `Task`s per message. Dispatch up
to 4 in **one message**, wait for the whole batch to return, validate each, then dispatch the next
batch of up to 4 — repeat until every unit is done or failed. **Never dispatch more than 4 in the
same message.** Bounded batching, and not full fan-out, is what keeps the run inside the bridge's
proven-safe envelope (ADR 0011) while recovering most of the wall-clock a serial sweep loses — the
agents spend their time on model wait, so four-way concurrency overlaps it.

Do the whole batched sweep **within one turn**, subject to the yield rule: dispatching a batch and
awaiting it is a tool call, not a turn end.

One `Task` per pending unit:

```
Task: quantify
  mode: unit
  run_dir: {run_dir}
  unit: {unit id}
  attempt: {1 or 2}
  input_path: {run_dir}/units/{unit id}/input.md
  schema_path: <code-repo>/schemas/facts-unit.schema.json
```

Every dispatch carries the sentence **«nothing runs in the background and no monitor exists; the
results arrive as tool results in this same turn»**. The progress line rides in the same message:

```persian
۸ از ۲۶ بخش از داده‌ها بررسی شد.
```

On return, validate each unit of the batch:

```
Bash: DATA_ROOT=<data-repo> SCHEMA_DIR=<code-repo>/schemas validate facts-unit {run_dir}/units/{unit id}/out.1.json --run {run_dir}
```

**The retry rule.** A unit whose output fails validation is re-dispatched **once**, with
`attempt: 2`, its previous output path and the grouped errors. A unit at two attempts is `failed`
and the run continues without it; its candidates are reported as unexamined, never as dropped. A
truncated or unparseable file costs no attempt — `status` deletes it.

Between batches:

```
Bash: DATA_ROOT=<data-repo> facts-plan status --run {run_dir}
```

**The yield rule.** `status` prints `elapsed_s` and `yield`. `yield: true` is the **only** signal you
act on — never your own sense of how long this is taking. Check it after Stage 1, after Stage 2,
after Stage P, between batches, and before Stage R. On `yield: true`, send the progress line as the
**last message of the turn** and stop:

```persian
۸ از ۲۶ بخش از داده‌ها بررسی شد؛ برای ادامه «ادامه بده» را بفرستید.
```

The owner's next message re-enters Stage 0 and the run continues from the first unfinished unit.
Ending a turn at a boundary is a normal, lossless outcome. If the run is on the bot and a budget
warning arrives in the conversation, treat it as a `yield: true` at the next boundary.

---

## Stage R — Review

```
Bash: DATA_ROOT=<data-repo> facts-plan digest --run {run_dir}
```

Then one dispatch:

```
Task: quantify
  mode: review
  run_dir: {run_dir}
  input_path: {run_dir}/review/input.md
  schema_path: <code-repo>/schemas/facts-unit.schema.json
```

Then `Bash: DATA_ROOT=<data-repo> SCHEMA_DIR=<code-repo>/schemas validate facts-unit {run_dir}/review/out.json --run {run_dir}`.
On failure, re-dispatch once; on a second failure, proceed **without** the review — the report says
so. If `digest` reports the assembled result is too large to review, the same applies.

---

## Stage V — Assemble and validate

```
Bash: DATA_ROOT=<data-repo> facts-plan assemble --run {run_dir} --review
Bash: DATA_ROOT=<data-repo> SCHEMA_DIR=<code-repo>/schemas validate facts-delta {run_dir}/facts-delta.json --store --run {run_dir}
```

(Drop `--review` when the review did not run.) The validate call performs the whole apply in memory,
including the resulting store's schema, and writes nothing — so a delta that passes here is one
`apply` cannot refuse.

On a residual error, the message names the unit that produced it. If that unit is under two
attempts, re-dispatch it with the error, then **re-enter Stage R once** (the assembly changed, so
the review is stale) and re-run Stage V. If the second review fails too, proceed without it. If
Stage V fails again, stop **before** Gate B and relay the grouped errors in Persian.

---

## Gate B — Facts checkpoint (STOP)

Read `{run_dir}/gate-b.md` and **send it verbatim**. It is a finished Persian message: counts per
kind, the rules in words, the disputes lettered, the issues found in the files, the unanswered
units. Compose nothing, add nothing, summarise nothing.

**End your turn and wait.** Nothing under `facts/` has been written yet.

On «تأیید» / «بله» / «ok», go to Stage 5. On an answer to a lettered dispute («۱ الف»), record it
and continue — the resolve runs after the apply. On a correction, report that a correction at this
point needs a new run and ask whether to start one; there is nothing to re-dispatch, because the
delta is the assembly of every unit.

---

## Stage 5 — Apply

```
Bash: DATA_ROOT=<data-repo> merge facts apply --delta {run_dir}/facts-delta.json --run {run_dir}
```

One delta, one run directory, once. Capture every `created`/`updated` id it prints.

A non-zero exit is a **precondition failure with nothing written**. Report it in Persian and **stop
the run**. Do not re-dispatch anything and do not hand-edit anything — ever:

```persian
ثبت انجام نشد: یکی از پیش‌شرط‌ها برقرار نبود و هیچ چیزی نوشته نشد. علت را بررسی می‌کنم و نتیجه را می‌گویم.
```

---

## Stage 6 — Finish and commit

Update `{run_dir}/meta.json` to its final shape — `finished_at`, `recordings`, `attachments`,
`workbooks`, `delta`, `merged: true`, `ids_created`, and `units` (one `{id, type, state, attempts}`
per unit, from `facts-plan status`) — and validate it:

```
Bash: DATA_ROOT=<data-repo> SCHEMA_DIR=<code-repo>/schemas validate facts-run-meta {run_dir}/meta.json
Bash: DATA_ROOT=<data-repo> facts-plan report --run {run_dir}
Bash: git -C <data-repo> add departments runs facts attachments && git -C <data-repo> commit -m "quantify({department}): {C} created, {U} updated"
```

Never `git add -A`. Continue to Stage 7 in the same turn.

---

## Stage 7 — Report

Read `{run_dir}/report.md` and **send it verbatim**. It carries the open disputes lettered, the
unanswered units grouped per item, the dropped candidates in the owner's own words, every issue
found in the files, any workbook skipped or part left unfinished, and whether the review ran.

When the owner answers a lettered dispute, **you** run the resolve — never print a command:

```
Bash: DATA_ROOT=<data-repo> merge facts resolve --id F-… --field <path> --account <id> --run {fix_run}
```

`{fix_run}` is a **fresh** stamped run directory, never `{run_dir}` (already claimed by the apply).
Every resolve in this report may share one `{fix_run}`. Confirm by the field's Persian label, never
by id or path. Then continue to Stage C in the same turn.

---

## Stage C — Audit review (STOP, per item)

```
Bash: DATA_ROOT=<data-repo> merge facts audit --persian
```

`--persian` renders every finding as a Persian sentence built from the entry's own title and the
finding's kind. **Raw audit output is never shown.** If there is nothing to report, say so and the
run is done.

Otherwise present the findings numbered, split into what can be acted on and what is report-only,
and wait:

```persian
بازبینی پایان اجرا — ۴ مورد:

قابل اقدام:
  ۱. دو ثبت با عنوان یکسان «مصرف اعلامی لاین پیتزا» وجود دارد؛ می‌توانم یکی را بازنشسته کنم.
  ۲. یک ثبت به فرایندی اشاره می‌کند که بازنشسته شده و جانشین دارد.

فقط گزارش:
  ۳. یک قاعده به قلمی اشاره می‌کند که دیگر در فهرست نیست.
  ۴. یک جدول ورودی خود را از فایلی می‌گیرد که هنوز خوانده نشده است.

کدام مورد را انجام بدهم؟ شماره‌اش را بفرستید.
```

For an approved item, run the matching verb yourself, against a run directory that is **not**
`{run_dir}`: `resolve`/`retire`/`promote` may share one fresh `{audit_run}` across the sitting; a
re-point `apply` gets its own fresh directory each time. Commit each applied item with the same
allowlist, show the result in Persian, **end your turn and wait**, then return for the next item.

---

## Stage ordering

| Stage | Name | Tool / CLI | Pauses? |
|---|---|---|---|
| 0 | Resume | `facts-plan status --new-turn` | — |
| M | Workbook checkpoint | `dump-workbook --init-manifest`, `Task: quantify` (manifest) | **STOP** if a row is unresolved |
| — | Resolve the set | Read / Glob | — |
| **A** | **Set checkpoint** | message | **STOP** |
| 1 | Transcribe | `transcribe` × chosen | — |
| 2 | Prepare | `dump-workbook --manifest`, `extract-attachment` × 2 | — |
| **P** | **Plan** | `facts-plan build` | — |
| **U** | **Units** | `Task: quantify` (unit) × ≤4 per message, `validate facts-unit` each | **STOP** at a yield |
| **R** | **Review** | `facts-plan digest`, `Task: quantify` (review), `validate facts-unit` | — |
| **V** | **Assemble + validate** | `facts-plan assemble`, `validate facts-delta --store --run` | — |
| **B** | **Facts checkpoint** | send `gate-b.md` verbatim | **STOP** |
| 5 | Apply | `merge facts apply` | — |
| 6 | Finish + commit | Write `meta.json`, `facts-plan report`, `git -C` | — |
| 7 | Report | send `report.md` verbatim | — |
| C | Audit review | `merge facts audit --persian` + the verbs | per item |

## Key invariants

- `merge facts` is the only writer of `facts/**` (INV-1, guard-enforced). Neither this playbook nor
  the agent ever writes there.
- The coordinator writes no fact content and composes no owner-facing prose from data. `gate-b.md`
  and `report.md` go out verbatim.
- Batches of at most four `Task`s per message; every unit validated on return; at most two attempts
  per unit per run.
- The only yield signal is `facts-plan status`'s own `yield: true`.
- One `apply` per run, into one run directory. A second apply into a used directory is refused.
  Stage 7's resolves and Stage C's verbs each open their own fresh directory.
- Every engine command is run bare.
- `meta.json` with `finished_at: null` always signals a resumable run; all timestamps are ISO-8601
  with a `Z`.
````

- [ ] **Step 6: Run the lint to verify it passes**

Run: `cd "<code-repo>" && .venv/bin/pytest ../data-repo/.claude/hooks/test_playbook_lint.py -q`
Expected: PASS (5 passed).

- [ ] **Step 7: Commit the playbook and the lint**

```
git -C ../data-repo add .claude/skills/quantify/SKILL.md .claude/hooks/test_playbook_lint.py && \
git -C ../data-repo commit -m "feat(facts): quantify playbook v3 and the owner-facing block lint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 8: Add the style card to `edit-fact`**

Insert between Step 3 (ends at line 105) and `## Step 4 —` (line 106) of
`../data-repo/.claude/skills/edit-fact/SKILL.md`:

```markdown
## The style card (design §5.2)

A targeted edit writes prose into the store exactly as a pipeline unit does, and the same lint
refuses it — so the same card applies, and `validate facts-delta` is where a failing sentence
surfaces.

- **`title`** — a noun phrase naming the concept, at most 60 characters, Persian, no file, tab or
  cell name, no Latin except an item code.
- **`statement`** — one to three sentences in the register of a written procedure: what is measured
  or computed, in what unit, by whom, when. Never an A1 address, a column letter, a tab, file or
  `Table_*` name, formula text, a function name, a schema field name, the pipeline's own words
  («پاس», «اسکلت», «بخش از داده‌ها», «واحد کاری», «بچ», `original`, `bindings`, `FEEL`, `account`,
  `expr`), a quotation, «گفته شد» or «گوینده». «ستون», «تب» and «سلول» are allowed only in a
  record's own `statement` and in a field's `description`.
- The lint also covers `aliases[]`, `fields[].description`, `grain`, `method`, `exceptions`,
  `tracked[].reason` and any `issues[].description` the agent wrote, and it refuses any Latin token
  of four letters or more except `csv`, `Excel`, `sheet`, a unit symbol and an item code.

The instruction the owner typed is **not** the statement. «پارمسان الان ۱۰۰ گرمه» becomes «بستهٔ
پنیر پارمسان ۱۰۰ گرم است», not a quotation of what was said.

```

- [ ] **Step 9: Commit the style card**

```
git -C ../data-repo add .claude/skills/edit-fact/SKILL.md && \
git -C ../data-repo commit -m "docs(facts): the style card in the edit-fact playbook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 10: Update the `CLAUDE.md` pointer rows**

In `../data-repo/CLAUDE.md`, replace line 105 with:

```markdown
| `.claude/skills/quantify/` | Facts pipeline orchestration playbook v3 — the planner packs the estate into units, the units run four at a time, one reviewer reads the assembled result |
```

replace line 111 with:

```markdown
| `.claude/agents/quantify.md` | Quantitative-facts agent (modes `unit`, `review`, `manifest`, `targeted`) — decides one prepared unit; reads two files and writes one; never reads a dump, a transcript or the store |
```

and add one row to the Engine CLIs table, after line 125 (`extract-attachment`):

```markdown
| `facts-plan` | Plan and assemble a facts run: `facts-plan build <dept> --run R --recordings a,b`, `status --run R [--new-turn]`, `digest --run R`, `assemble --run R [--review]`, `report --run R` |
```

- [ ] **Step 11: Commit the pointer rows**

```
git -C ../data-repo add CLAUDE.md && \
git -C ../data-repo commit -m "docs(facts): CLAUDE.md pointers for the v3 agent, playbook and facts-plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 12: The two `twin_of` rows, and delete `NAMED_FUNCTIONS.md`**

The planner groups a unit by the manifest `dir` with the branch segment removed. Two pairs in this
estate do not match that way — the branches renamed the directory — so the pairing is declared:

In `../data-repo/attachments/sheets/manifest.json`, add `"twin_of": "fried",` after line 213
(`"reference_tabs": [],` in the `sokhari` row), and `"twin_of": "gozaresh_naharkhoran",` after the
`reference_tabs` array of the `gozaresh_markazi` row (the row beginning at line 236).

Then delete the orientation file the function library replaces:

```
Bash: git -C ../data-repo rm attachments/sheets/NAMED_FUNCTIONS.md
```

`facts-plan build` writes `{run_dir}/functions.md` over every dump in the estate on every run, and
run directories are committed, so the latest run directory is the estate's reference. Nothing may
cite either as a source — `merge_facts/content.py` already refuses it.

- [ ] **Step 13: Verify the manifest still validates**

Run: `cd "<code-repo>" && DATA_ROOT=../data-repo SCHEMA_DIR=schemas .venv/bin/python -m validate.cli manifest ../data-repo/attachments/sheets/manifest.json`
Expected: PASS — `OK: ../data-repo/attachments/sheets/manifest.json conforms to manifest.schema.json`

- [ ] **Step 14: Commit the manifest and the deletion**

```
git -C ../data-repo add attachments/sheets/manifest.json attachments/sheets/NAMED_FUNCTIONS.md && \
git -C ../data-repo commit -m "feat(facts): twin_of for the two unmatched workbook pairs; drop NAMED_FUNCTIONS.md

The function library is generated into each run directory by facts-plan build,
over every dump in the estate, so the latest run directory is the reference.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 18: The Panel — instances, bindings and imports

**Files:**
- Modify: `ui-backend/inja_ui_backend/store/manifest.py:43-56` (a `workbook_titles` reader beside `branches`)
- Modify: `ui-backend/inja_ui_backend/facts_store.py:130-157` (the store version, and a `binding_labels` builder)
- Modify: `ui-backend/inja_ui_backend/routers/facts.py:708-731` (two more maps on the bundle)
- Modify: `ui/src/api/types.ts:223-233`, `:252-304`, `:346-367`, `:491-511`
- Modify: `ui/src/lib/factsLabels.ts:52-58`, `:232-240`, `:326-425`
- Modify: `ui/src/facts/cards/RuleCard.tsx:236-352`
- Modify: `ui/src/facts/cards/RecordCard.tsx:509-724`
- Test: `ui-backend/tests/test_facts_store.py`, `ui/src/lib/factsLabels.test.ts`, `ui/src/facts/cards/RuleCard.test.tsx`, `ui/src/facts/cards/RecordCard.test.tsx`

**Interfaces:**
- Consumes: `record.data.instances[]` `{key, spreadsheetId, sheetId, sheet, branch, hidden, imports[]}`, `instances[].imports[]` `{key, source: {ref} | {spreadsheetId, sheet}, range, named_range}`, `rule.data.applies_to[]` `{key, record{ref,field}, variant, range, params, rows[]}`, `issues[].instance`, all from the v2 schemas (T2); `facts_store.load_all`, `bundle.refTitle`, `parts.tsx`'s `DetailCard`/`HeadBand`/`FactGrid`/`LabelRow`/`RefLink`/`Mono`/`Pill`.
- Produces: `manifest.workbook_titles(root) -> dict[str, str]` (spreadsheetId → the row's `file` without its extension); `facts_store.binding_labels(root, entry) -> dict[str, dict]` (every `instances[].key` of a record and every `applies_to[].key` of a rule → `{"workbook", "sheet", "branch"}`, the branch as its Persian name or `None`); the bundle gains `workbook_titles` and `binding_labels`; `factsLabels` gains `applies_to`, `instances`, `imports`, `columns`, `params`, `workbook`, `branch` and eleven issue kinds, and loses `mirror` / `mirror_of`.

Read for context: `ui/src/facts/cards/parts.tsx` (every primitive these two cards draw with, and the
tokens rule that forbids inventing a new one), `ui/src/facts/bundle.ts` (how a `{ref}` becomes a
name, and the `Restricted` rule), `ui/src/facts/cards/fixture.ts` (the bundle builder every card
test uses).

- [ ] **Step 1: Write the failing backend test**

Append to `ui-backend/tests/test_facts_store.py`:

```python
def test_workbook_titles_are_the_file_name_without_its_extension(root):
    assert manifest.workbook_titles(root)[MAVAD] == "Mavade Avalie"


def test_binding_labels_name_a_record_instance_and_a_rule_binding(root):
    record = {"id": "F-00300", "kind": "record", "key": "gozaresh_shabane",
              "title": "گزارش شبانه", "statement": "…", "retired": False,
              "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
              "status": "confirmed", "updated_at": NOW,
              "data": {"medium": "sheet", "role": "report", "location": {},
                       "instances": [{"key": "pitza__s0", "spreadsheetId": MAVAD,
                                      "sheetId": 0, "sheet": "پیتزا",
                                      "branch": "chalebagh", "hidden": False}]}}
    rule = {"id": "F-00301", "kind": "rule", "key": "enheraf",
            "title": "انحراف مصرف", "statement": "…", "retired": False,
            "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
            "status": "confirmed", "updated_at": NOW,
            "data": {"inputs": [], "outputs": [],
                     "applies_to": [{"key": "pitza__s0__j__r6",
                                     "record": {"ref": "F-00300", "field": "c_j"},
                                     "variant": 0, "range": "J6:J15",
                                     "params": {"tolerancePerFoodGr": 5}}]}}
    _dump(root / "facts" / "records.json",
          {"schema_version": 2, "entries": [record]})
    _dump(root / "facts" / "rules.json",
          {"schema_version": 2, "entries": [rule]})
    _dump(root / "facts" / ".index.json",
          {"schema_version": 2,
           "entries": [{"id": e["id"], "kind": e["kind"], "key": e["key"],
                        "title": e["title"], "scope": e["scope"],
                        "status": e["status"], "retired": e["retired"],
                        "updated_at": e["updated_at"]} for e in (record, rule)]})
    one = {"workbook": "Mavade Avalie", "sheet": "پیتزا", "branch": "چاله‌باغ"}
    assert facts_store.binding_labels(root, record) == {"pitza__s0": one}
    assert facts_store.binding_labels(root, rule) == {"pitza__s0__j__r6": one}


def test_a_v2_store_file_reads_exactly_as_a_v1_one_does(root):
    """The marker moves to 2 in the same commit as the schema (§8 step 2); the
    reader has never checked it and must not start now — an entry is an entry."""
    doc = json.loads((root / "facts" / "items.json").read_text(encoding="utf-8"))
    doc["schema_version"] = 2
    _dump(root / "facts" / "items.json", doc)
    assert facts_store.load_entry(root, doc["entries"][0]["id"]) is not None
    assert facts_store.load_index(tmp := (root / "nothing")) == {
        "schema_version": 2, "entries": []} if tmp else True
```

and add a `file` to each row of the module's `MANIFEST` fixture (line 229) so the titles exist:

```python
    "workbooks": [
        {"spreadsheetId": MAVAD, "short": "mavad", "confirmed": True,
         "file": "Mavade Avalie.xlsx"},
        {"spreadsheetId": PITZA, "short": "pitza_cb", "confirmed": True,
         "file": "Pitza.xlsx"},
        {"spreadsheetId": GOZARESH, "short": "gozaresh_cb", "confirmed": True,
         "file": "Gozaresh markazi.xlsx"}],
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "<code-repo>" && .venv/bin/pytest ui-backend/tests/test_facts_store.py -q -k "workbook_titles or binding_labels or v2_store"`
Expected: FAIL with `AttributeError: module 'inja_ui_backend.store.manifest' has no attribute 'workbook_titles'`.

- [ ] **Step 3: Write the backend implementation**

In `ui-backend/inja_ui_backend/store/manifest.py`, after `branches` (line 47):

```python
def workbook_titles(root: Path) -> dict:
    """`{spreadsheetId: title}` — a workbook's name as a person says it.

    The estate has no Persian workbook title and the manifest has no column for
    one, so the title is the file name without its extension («Mavade Avalie»),
    which is what the owner sees on the drive and what Gate M reads out. A row
    with no `file` contributes nothing rather than an empty name.
    """
    rows = read_manifest(root).get("workbooks")
    if not isinstance(rows, list):
        return {}
    return {w["spreadsheetId"]: str(w["file"]).rsplit(".", 1)[0]
            for w in rows if isinstance(w, dict)
            and w.get("spreadsheetId") and w.get("file")}
```

In `ui-backend/inja_ui_backend/facts_store.py`, bump the empty-index default at line 155 to
`{"schema_version": 2, "entries": []}` (the store's marker after §8 step 2 — the readers below have
never checked it and still do not; an entry is an entry under either), and add beside `row_titles`:

```python
def binding_labels(root: Path, entry: dict) -> dict:
    """Where a binding or an instance actually sits — `{key: {workbook, sheet,
    branch}}`.

    A record carries its own `instances[]`, so its keys are answered from the
    entry itself. A rule carries only `applies_to[].record`, and the sheet and
    the branch live on the record it points at — so a rule's keys are answered
    by loading those records once and matching the binding key's instance
    prefix, which is how the key is built (`<instance key>__<column>__r<row>`).

    Serving it is the only way the card can draw the designed row: the client
    has no second entry and no manifest. A key whose instance cannot be
    resolved is absent from the map rather than half-named — the card draws the
    record's own title in that case, which is a true statement about where the
    rule runs.
    """
    titles = manifest.workbook_titles(root)
    names = {b.get("code"): b.get("name") for b in manifest.branches(root)}

    def label(inst: dict) -> dict:
        return {"workbook": titles.get(inst.get("spreadsheetId"), ""),
                "sheet": inst.get("sheet") or "",
                "branch": names.get(inst.get("branch"))}

    data = entry.get("data") or {}
    out = {i["key"]: label(i) for i in data.get("instances") or []
           if isinstance(i, dict) and i.get("key")}
    binds = [a for a in data.get("applies_to") or []
             if isinstance(a, dict) and a.get("key")]
    if not binds:
        return out
    # One walk of the store, not one per binding: a report rule binds ten
    # instances of two records and the store is five small files.
    instances = {}
    for other in load_all(root):
        for inst in (other.get("data") or {}).get("instances") or []:
            if isinstance(inst, dict) and inst.get("key"):
                instances[inst["key"]] = inst
    for bind in binds:
        prefix = "__".join(bind["key"].split("__")[:2])
        inst = instances.get(prefix)
        if inst is not None:
            out[bind["key"]] = label(inst)
    return out
```

In `ui-backend/inja_ui_backend/routers/facts.py`, add two entries to the returned bundle beside
`"path_labels"` (line 720):

```python
        # The two maps the «محل اجرا» and «نسخه‌ها» sections need and the entry
        # cannot carry: a workbook's title is the manifest's, and a binding's
        # sheet and branch live on the record the rule points at. Unmasked —
        # both are estate structure, not a neighbour's Persian (`resolved` is
        # where a neighbour's name is masked, and these carry no title of one).
        "workbook_titles": manifest.workbook_titles(root),
        "binding_labels": facts_store.binding_labels(root, entry),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "<code-repo>" && .venv/bin/pytest ui-backend/tests/test_facts_store.py ui-backend/tests/test_facts_api.py -q`
Expected: PASS

- [ ] **Step 5: Commit the backend**

```
git add ui-backend/inja_ui_backend/store/manifest.py ui-backend/inja_ui_backend/facts_store.py ui-backend/inja_ui_backend/routers/facts.py ui-backend/tests/test_facts_store.py && \
git commit -m "feat(facts): serve workbook titles and binding labels; the store marker moves to 2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 6: Write the failing label test**

Append to `ui/src/lib/factsLabels.test.ts`:

```ts
describe('the v3 payload vocabulary', () => {
  it('names the three new structures and their two members', () => {
    for (const key of ['applies_to', 'instances', 'imports', 'columns',
                       'params', 'workbook', 'branch']) {
      expect(labels.PAYLOAD_FIELD_LABELS[key]).toMatch(/[؀-ۿ]/)
    }
  })

  it('names every issue kind the v3 engine raises', () => {
    for (const kind of ['hand_maintained_index', 'no_rule_applies',
                        'broken_formula', 'cached_error', 'leading_offset',
                        'unused_mirror', 'unknown_source', 'column_offset',
                        'per_cell_mirror', 'ambiguous_row_header',
                        'binding_gone']) {
      expect(labels.ISSUE_KIND_LABELS[kind]).toMatch(/[؀-ۿ]/)
    }
  })

  it('has no word left for a mirror — QF-48 made it an edge, not a record', () => {
    // The role and the pointer both left the schema. A label for a value no
    // entry can carry is a word waiting to be drawn by mistake.
    expect(labels.ROLE_LABELS_RECORD.mirror).toBeUndefined()
    expect(labels.KIND_SHAPE_LABELS.mirror).toBeUndefined()
    expect(labels.PAYLOAD_FIELD_LABELS.mirror_of).toBeUndefined()
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd ui && npx vitest run src/lib/factsLabels`
Expected: FAIL with `expected undefined to match /[؀-ۿ]/` on `applies_to`, and
`expected 'نسخهٔ پیوندی' to be undefined`.

- [ ] **Step 8: Write the labels and the types**

In `ui/src/lib/factsLabels.ts`, delete line 55 (`mirror: 'نسخهٔ پیوندی',`) from
`ROLE_LABELS_RECORD` and line 398 (`mirror_of: 'نسخه‌ای از',`) from `PAYLOAD_FIELD_LABELS`. Add to
`ISSUE_KIND_LABELS` (before its closing brace at line 240):

```ts
  hand_maintained_index: 'فهرست دستی موازی',
  no_rule_applies: 'خانه‌های بدون قاعده',
  broken_formula: 'فرمول خراب',
  cached_error: 'خطای ذخیره‌شده در فایل',
  leading_offset: 'جابه‌جایی ستون‌های ابتدایی',
  unused_mirror: 'نسخهٔ پیوندی بی‌استفاده',
  unknown_source: 'منبع ناشناخته',
  column_offset: 'اختلاف ستون بین نسخه‌ها',
  per_cell_mirror: 'پیوند خانه‌به‌خانه',
  ambiguous_row_header: 'سرستون تکراری در یک برگه',
  binding_gone: 'محل اجرا دیگر وجود ندارد',
```

and to `PAYLOAD_FIELD_LABELS`, where `mirror_of` was:

```ts
  // The three v3 structures. Each doubles as its section heading, the way
  // `header_fields` and `signatures` already do — one Persian string, one
  // definition, and the heading cannot drift from the field it names.
  applies_to: 'محل اجرا',
  instances: 'نسخه‌ها',
  imports: 'ورودی از',
  columns: 'ستون در هر نسخه',
  params: 'مقادیر',
  workbook: 'فایل',
  branch: 'شعبه',
  named_range: 'نام محدوده',
```

In `ui/src/api/types.ts`: widen `FactIssue.kind` (line 225) with the eleven new members and add
`instance?: string`; on `RecordData` (line 252) drop `mirror_of` and drop `'mirror'` from the `role`
union, and add

```ts
  instances?: RecordInstance[]
```

with, above `RecordData`:

```ts
/** One place a record template actually sits — QF-47's `instances[]`. A tab
 *  that repeats across workbooks is one entry with several of these, and the
 *  branch scope is derived from them. */
export interface RecordInstance {
  key: string
  spreadsheetId?: string
  sheetId?: number
  sheet?: string
  branch?: string
  hidden?: boolean
  imports?: RecordImport[]
}

/** One table pulled in from elsewhere — QF-48's edge, which replaced the mirror
 *  record. `source` is a `{ref}` once the source record exists in the store and
 *  the locator until then, and every reader accepts both (spec §10). */
export interface RecordImport {
  key: string
  source: FactRef | { spreadsheetId?: string; sheet?: string }
  range?: string
  named_range?: string
}
```

on `RecordField` (line 251) add `columns?: Record<string, string>`; on `RuleData` (line 346) add

```ts
  applies_to?: RuleBinding[]
```

with, above it:

```ts
/** One (record instance, column, row range) a rule runs on — QF-47. A rule with
 *  sixty bindings is one entry, and the per-binding numbers live in `params`. */
export interface RuleBinding {
  key: string
  record?: FactRef
  variant?: number
  range?: string
  params?: Record<string, unknown>
  rows?: { key: string; row?: number; label?: string; item?: string }[]
}
```

and widen `RuleInput['from']` to `FactRef | { param: string } | 'operator' | 'calendar'`; on
`FactBundle` (line 491) add

```ts
  /** `{spreadsheetId: title}` — the manifest's file name without its
   *  extension, which is the only name the estate has for a workbook. */
  workbook_titles: Record<string, string>
  /** Where a record instance or a rule binding sits, keyed by its own key. The
   *  entry cannot carry it: a rule's binding names a column of another entry,
   *  and the workbook's title is the manifest's. */
  binding_labels: Record<string, { workbook: string; sheet: string; branch: string | null }>
```

and add both to `ui/src/facts/cards/fixture.ts`'s default bundle (`workbook_titles: {}`,
`binding_labels: {}`, beside `path_labels`).

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd ui && npx vitest run src/lib/factsLabels && npx tsc -b`
Expected: PASS, and `tsc` clean apart from the two cards, which Steps 10–15 fill in.

- [ ] **Step 10: Commit the labels and types**

```
git add ui/src/lib/factsLabels.ts ui/src/lib/factsLabels.test.ts ui/src/api/types.ts ui/src/facts/cards/fixture.ts && \
git commit -m "feat(facts): v3 payload vocabulary — instances, imports, applies_to; the mirror label goes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 11: Write the failing RuleCard test**

Append inside `describe('the rule card'…)` in `ui/src/facts/cards/RuleCard.test.tsx`, and add the
fixture above it:

```tsx
/** One rule across two branches and two columns — QF-47's whole point: sixty
 *  bindings are one entry, and the tolerance that differs per binding is a
 *  parameter, not a second rule. */
const BOUND = bundleOf('rule', {
  inputs: [{ key: 'tolerance_gr', title: 'تلورانس', from: { param: 'tolerancePerFoodGr' } }],
  outputs: [{ key: 'enheraf', title: 'انحراف' }],
  expr: 'enheraf = masraf_vaqei - tolerance_gr',
  applies_to: [
    { key: 'pitza__s0__j__r6', record: { ref: 'F-00300', field: 'c_j' },
      variant: 0, range: 'J6:J15',
      params: { tolerancePerFoodGr: 5, table_1: { ref: 'F-00300' } } },
    { key: 'farangi__s0__j__r6', record: { ref: 'F-00301', field: 'c_j' },
      variant: 0, range: 'J6:J14', params: { tolerancePerKilogramGr: 140 } },
  ],
}, {
  resolved: {
    'F-00300': { kind: 'record', title: 'گزارش شبانه پیتزا' },
    'F-00301': { kind: 'record', title: 'گزارش شبانه فرنگی' },
  },
  binding_labels: {
    pitza__s0__j__r6: { workbook: 'Gozaresh markazi', sheet: 'پیتزا', branch: 'چاله‌باغ' },
    farangi__s0__j__r6: { workbook: 'Gozaresh naharkhoran', sheet: 'فرنگی', branch: 'ناهارخوران' },
  },
})

it('draws «محل اجرا» — one row per binding, with its numeric parameters', () => {
  render(<RuleCard bundle={BOUND} onOpen={vi.fn()} />)
  const table = screen.getByRole('table', { name: 'محل اجرا' })
  expect(within(table).getByText('Gozaresh markazi')).toBeInTheDocument()
  expect(within(table).getByText('پیتزا')).toBeInTheDocument()
  expect(within(table).getByText('چاله‌باغ')).toBeInTheDocument()
  expect(within(table).getByText('J6:J15')).toBeInTheDocument()
  // A number is an LTR island beside its parameter name (QF-42).
  expect(within(table).getByText(/tolerancePerFoodGr/)).toHaveAttribute('dir', 'ltr')
  expect(within(table).getByText(/140/)).toBeInTheDocument()
})

it('renders a `{ref}` parameter as the record’s Persian title, never a table name', () => {
  // §2.5 — `gate-b.md` renders a ref-valued parameter as the referenced
  // record's title or omits it, and the panel keeps the same rule: a
  // `Table_*` string is exactly what the style card refuses to show a reader.
  render(<RuleCard bundle={BOUND} onOpen={vi.fn()} />)
  const table = screen.getByRole('table', { name: 'محل اجرا' })
  expect(within(table).getByText(/گزارش شبانه پیتزا/)).toBeInTheDocument()
  expect(within(table).queryByText(/table_1/)).toBeNull()
})

it('draws no «محل اجرا» for a rule that is bound to nothing', () => {
  render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
  expect(screen.queryByRole('table', { name: 'محل اجرا' })).toBeNull()
})
```

- [ ] **Step 12: Run test to verify it fails**

Run: `cd ui && npx vitest run src/facts/cards/RuleCard`
Expected: FAIL with `Unable to find an accessible element with the role "table" and name "محل اجرا"`.

- [ ] **Step 13: Write the RuleCard section**

In `ui/src/facts/cards/RuleCard.tsx`, add `RuleBinding` to the `../../api/types` import and render
the section inside `RuleCard`, after the `template_of` card and before `calls` (line 281):

```tsx
      {(d.applies_to ?? []).length > 0 && (
        <AppliesTo bundle={bundle} bindings={d.applies_to ?? []} onOpen={onOpen} />
      )}
```

and add, below `RuleCard`:

```tsx
/**
 * «محل اجرا» — QF-47's `applies_to[]`, one row per binding.
 *
 * **Owner ruling, 2026-09-06: the structure is shown and the placement is
 * delegated.** So this is the card's own `HeadBand` over the same `FactGrid`
 * the decision table and the edge cases already draw, at the same tokens; no
 * new design value is introduced. `align` stays `start`: a workbook title and a
 * tab name are names, not values, and the centred variant belongs to the two
 * grids whose columns hold one number each.
 *
 * The workbook, the tab and the branch come from `bundle.binding_labels` and
 * not from the entry — a binding names a column of ANOTHER entry, and the
 * workbook's title is the manifest's, so neither is reachable from here. A
 * binding the server could not resolve draws the record's own title and no
 * workbook, which is still a true statement about where the rule runs.
 */
function AppliesTo({ bundle, bindings, onOpen }: {
  bundle: FactBundle; bindings: RuleBinding[]; onOpen: (id: string) => void
}) {
  const heading = label(PAYLOAD_FIELD_LABELS, 'applies_to')
  return (
    <DetailCard className="mt-s7">
      <HeadBand>{heading}</HeadBand>
      <FactGrid
        label={heading}
        tracks={{
          gridTemplateColumns:
            'minmax(140px,1fr) minmax(110px,1fr) minmax(90px,1fr) '
            + 'minmax(100px,1fr) minmax(180px,1.4fr)',
        }}
        head={[
          label(PAYLOAD_FIELD_LABELS, 'workbook'),
          label(PAYLOAD_FIELD_LABELS, 'sheet'),
          label(PAYLOAD_FIELD_LABELS, 'branch'),
          label(PAYLOAD_FIELD_LABELS, 'rows'),
          label(PAYLOAD_FIELD_LABELS, 'params'),
        ]}
        rows={bindings.map((b) => {
          const where = bundle.binding_labels[b.key]
          const record = refTitle(bundle, b.record)
          return {
            key: b.key,
            cells: [
              { node: where?.workbook
                ? <Mono className="text-fs-sm2 text-ink">{where.workbook}</Mono>
                : <RefLink named={record} onOpen={onOpen} className="text-fs-sm2" /> },
              { node: <span className="text-fs-sm2 text-ink">{where?.sheet ?? none()}</span> },
              { node: <span className="text-fs-sm2 text-muted">{where?.branch ?? none()}</span> },
              { node: <Mono className="text-fs-sm2 text-faint">{b.range ?? none()}</Mono> },
              { node: <Params bundle={bundle} params={b.params} /> },
            ],
          }
        })}
      />
    </DetailCard>
  )
}

/**
 * A binding's parameters — the numbers, and nothing else raw.
 *
 * §2.5's rule, kept identically here and in `gate-b.md`: a **numeric** value is
 * shown; a value that is a `{ref}` or a table name is shown as the referenced
 * record's Persian title, or omitted. A `Table_*` string in front of a reader is
 * exactly what the style card exists to prevent, and a parameter is the one
 * place one could still reach a screen.
 */
function Params({ bundle, params }: {
  bundle: FactBundle; params?: Record<string, unknown>
}) {
  const entries = Object.entries(params ?? {})
  if (entries.length === 0) return <span className="text-fs-sm2 text-faint">{none()}</span>
  const parts = entries.map(([key, value]) => {
    if (typeof value === 'number') {
      return <Mono key={key} className="text-fs-sm2 text-ink">{`${key} = ${value}`}</Mono>
    }
    const named = refTitle(bundle, value as never)
    return named === undefined
      ? null
      : <span key={key} className="text-fs-sm2 text-muted">{named.text}</span>
  }).filter((x) => x !== null)
  if (parts.length === 0) return <span className="text-fs-sm2 text-faint">{none()}</span>
  return <span className="flex flex-wrap gap-s4">{parts}</span>
}
```

`refTitle` already answers `undefined` for anything that is not a `{ref}` shape, so a bare
`Table_Ingredients_ItalianPizza` string falls out of the row on its own rather than needing a second
test for it.

- [ ] **Step 14: Run tests to verify they pass**

Run: `cd ui && npx vitest run src/facts/cards/RuleCard`
Expected: PASS

- [ ] **Step 15: Commit the RuleCard**

```
git add ui/src/facts/cards/RuleCard.tsx ui/src/facts/cards/RuleCard.test.tsx && \
git commit -m "feat(facts): «محل اجرا» — a rule's bindings, with its per-binding numbers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 16: Write the failing RecordCard test, and delete the mirror one**

Delete the test `skips a foreign key it cannot describe, rather than throwing on it`
(`RecordCard.test.tsx:294-322`) — `role: 'mirror'` and `mirror_of` are no longer expressible, so the
fixture it is built on cannot exist. Its sibling (`draws a foreign key that carries both of its
sides`) stays: `foreignKeys` is still readable on an already-stored entry. Then append:

```tsx
/** A report template that sits in two workbooks and pulls one table in —
 *  QF-47's `instances[]` and QF-48's import edge, in one entry. */
const TEMPLATE = (over: Partial<FactBundle> = {}): FactBundle => bundleOf('record', {
  medium: 'sheet', role: 'report', location: {},
  fields: [{ key: 'c_j', title: 'انحراف', type: 'number', unit: 'kg' }],
  instances: [
    { key: 'gozaresh_markazi__s0', spreadsheetId: 'ID_CB', sheetId: 0,
      sheet: 'پیتزا', branch: 'chalebagh', hidden: false,
      imports: [{ key: 'im_1', source: { ref: 'F-00400' }, range: 'A:X' }] },
    { key: 'gozaresh_naharkhoran__s0', spreadsheetId: 'ID_NK', sheetId: 0,
      sheet: 'پیتزا', branch: 'naharkhoran', hidden: true,
      imports: [{ key: 'im_2', source: { spreadsheetId: 'ID_SRC', sheet: 'singlePizza' },
                  range: 'A:V' }] },
  ],
}, {
  resolved: { 'F-00400': { kind: 'record', title: 'دستور پیتزا تکی' } },
  workbook_titles: { ID_CB: 'Gozaresh markazi', ID_NK: 'Gozaresh naharkhoran',
                     ID_SRC: 'Mavade Avalie' },
  binding_labels: {
    gozaresh_markazi__s0: { workbook: 'Gozaresh markazi', sheet: 'پیتزا', branch: 'چاله‌باغ' },
    gozaresh_naharkhoran__s0: { workbook: 'Gozaresh naharkhoran', sheet: 'پیتزا',
                                branch: 'ناهارخوران' },
  },
  ...over,
}, {
  issues: [{ kind: 'column_shift', instance: 'gozaresh_naharkhoran__s0',
             description: 'ستون «مصرف واقعی» در این نسخه جا افتاده است.',
             affects: [{ ref: 'F-00014' }] }],
})

it('lists «نسخه‌ها» in place of the single location line', () => {
  draw(TEMPLATE())
  expect(screen.getByText('نسخه‌ها')).toBeInTheDocument()
  expect(screen.queryByText('محل')).toBeNull()
  expect(screen.getByText('Gozaresh markazi')).toBeInTheDocument()
  expect(screen.getByText('Gozaresh naharkhoran')).toBeInTheDocument()
  expect(screen.getByText('ناهارخوران')).toBeInTheDocument()
  // The hidden tab says so; the visible one draws no marker.
  expect(screen.getAllByText('مخفی')).toHaveLength(1)
})

it('keeps the single location line for a record with no instances', () => {
  // A paper form and an external table have a `location` and no `instances[]`,
  // and that row is the only thing that says where they are.
  draw(PAPER())
  expect(screen.getByText('محل')).toBeInTheDocument()
  expect(screen.queryByText('نسخه‌ها')).toBeNull()
})

it('draws «ورودی از» under the instance that pulls the table in', () => {
  draw(TEMPLATE())
  const imports = screen.getAllByText('ورودی از')
  expect(imports).toHaveLength(2)
  // A `{ref}` source is the record's Persian title, and a link.
  expect(screen.getByRole('button', { name: /دستور پیتزا تکی/ })).toBeInTheDocument()
  // A locator source is the workbook's title and its tab — never a drive id.
  expect(screen.getByText(/Mavade Avalie/)).toBeInTheDocument()
  expect(screen.getByText(/singlePizza/)).toBeInTheDocument()
  expect(screen.queryByText('ID_SRC')).toBeNull()
  expect(screen.getByText('A:V')).toBeInTheDocument()
})

it('hangs a column_shift issue on the instance it names', () => {
  draw(TEMPLATE())
  expect(screen.getByText('ستون «مصرف واقعی» در این نسخه جا افتاده است.'))
    .toBeInTheDocument()
})
```

- [ ] **Step 17: Run test to verify it fails**

Run: `cd ui && npx vitest run src/facts/cards/RecordCard`
Expected: FAIL with `Unable to find an element with the text: نسخه‌ها`.

- [ ] **Step 18: Write the RecordCard section**

In `ui/src/facts/cards/RecordCard.tsx`'s `StructureCard`, delete the `mirror` binding (line 543) and
the `mirror_of` `LabelRow` (lines 672-676), and replace the `location` `LabelRow` (lines 558-564)
with:

```tsx
      {instances.length === 0 && (
        <LabelRow text={L('location')}>
          {where}
          {format !== undefined && (
            <Filled text={label(SCREEN_LABELS, 'location_format')} values={{ n: format }}
              className="text-fs-micro text-faint" />
          )}
        </LabelRow>
      )}
      {instances.length > 0 && (
        <Instances bundle={bundle} instances={instances} onOpen={onOpen} />
      )}
```

with `const instances = data.instances ?? []` beside `const loc = …` (line 514), and add below
`StructureCard`:

```tsx
/**
 * «نسخه‌ها» — QF-47's `instances[]`, and the import edges that hang off them.
 *
 * **This replaces the single «محل» row, and only for a record that has
 * instances.** A tab that repeats across two workbooks used to be two entries
 * with one location each; it is one entry with two instances now, and a single
 * location line would name the first of them and silently hide the rest — which
 * is the whole reason the row is gone.
 *
 * A paper form and an external table keep the old row: they have a `location`
 * and no instances, and nothing else says where they are.
 *
 * Each instance's `imports[]` renders directly beneath it as «ورودی از» — the
 * source record's title and a link when it is a `{ref}`, the workbook's title
 * and the tab when it is still a locator (spec §10 keeps both forms
 * indefinitely, and every reader accepts either). A `column_shift` issue naming
 * this instance is drawn with it rather than in the issues card: the columns it
 * says went missing are this copy's, and reading it three cards away is how the
 * last run's mirrors went unexplained.
 */
function Instances({ bundle, instances, onOpen }: {
  bundle: FactBundle; instances: RecordInstance[]; onOpen: (id: string) => void
}) {
  const issues = bundle.entry.issues ?? []
  return (
    <div className="px-s9 py-s6 border-b border-line-row">
      <Eyebrow>{label(PAYLOAD_FIELD_LABELS, 'instances')}</Eyebrow>
      {instances.map((inst) => {
        const where = bundle.binding_labels[inst.key]
        const attached = issues.filter((x) => x.instance === inst.key)
        return (
          <div key={inst.key} style={PX.rowY7}>
            <div className="flex items-baseline gap-s5 flex-wrap">
              <Mono className="text-fs-menu font-semibold text-ink">
                {where?.workbook ?? none()}
              </Mono>
              <span className="text-fs-sm2 text-ink">{inst.sheet ?? none()}</span>
              {where?.branch !== null && where?.branch !== undefined && (
                <span className="text-fs-caption text-muted">{where.branch}</span>
              )}
              {inst.hidden === true && (
                <Pill tone="quiet">{label(PAYLOAD_FIELD_LABELS, 'hidden')}</Pill>
              )}
            </div>
            {(inst.imports ?? []).map((im) => {
              const named = refTitle(bundle, im.source as never)
              const locator = im.source as { spreadsheetId?: string; sheet?: string }
              return (
                <div key={im.key} style={PX.gap9}
                  className="flex items-baseline flex-wrap mt-s3 ps-s6">
                  <span style={PX.label104} className="flex-none text-fs-caption text-faint">
                    {label(PAYLOAD_FIELD_LABELS, 'imports')}
                  </span>
                  {named !== undefined
                    ? <RefLink named={named} onOpen={onOpen} className="text-fs-sm2" />
                    : (
                      // Note 6 — the workbook's title and the tab, never the
                      // drive id beside a Persian word in one LTR run.
                      <Mono className="text-fs-sm2 text-ink">
                        {[bundle.workbook_titles[locator.spreadsheetId ?? ''],
                          locator.sheet].filter(Boolean).join(' · ')}
                      </Mono>
                    )}
                  {im.range !== undefined && (
                    <Mono className="text-fs-caption text-faint">{im.range}</Mono>
                  )}
                </div>
              )
            })}
            {attached.map((x, i) => (
              <p key={i} className="text-fs-caption text-warn-fg leading-sub m-0 mt-s3 ps-s6">
                {x.description}
              </p>
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

Add `RecordInstance` to the `../../api/types` import and `Eyebrow`, `Pill`, `PX`, `none`,
`refTitle`, `RefLink` where they are not already imported.

- [ ] **Step 19: Run tests to verify they pass**

Run: `cd ui && npx vitest run src/facts src/lib/factsLabels && npx tsc -b`
Expected: PASS

- [ ] **Step 20: Commit the RecordCard**

```
git add ui/src/facts/cards/RecordCard.tsx ui/src/facts/cards/RecordCard.test.tsx && \
git commit -m "feat(facts): «نسخه‌ها» and «ورودی از» — a record's instances and its import edges

The single location line named the first instance and hid the rest; the mirror
record and its label are gone with QF-48.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 19: The written record — runbook, ADR, PRD, ARD, and the agent eval

**Files:**
- Create: `docs/decisions/0017-facts-pipeline-v3.md`, `control-bot/testing/quantify_unit_eval.py`
- Modify: `docs/runbooks/07-facts.md:250-266` (§5), `:293-299` (§7 step 1), and append two sections before `## Next` (line 397)
- Modify: `docs/decisions/README.md` (one table row, after the 0016 row)
- Modify: `PRD.md:242-243` (a new §7.12 after FR-L6)
- Modify: `ARD.md:45-46` (one paragraph after the overview diagram)
- Test: `control-bot/testing/quantify_unit_eval.py` is the deliverable's own check — it is run on demand, never by `make test` (it costs a real model call)

**Interfaces:**
- Consumes: `facts-plan build` and its fixture run directory (T13), `validate facts-unit --run` (T14), `merge_facts.content.lint_prose` (T6), `engine/tests/fixtures/facts-plan/` (T16), the `quantify` agent's `unit` mode (T17).
- Produces: PRD **FR-Q1** (the consumer contract, which spec §5.1's U3 is graded against), ADR **0017**, runbook 07 §10 and §11, and `quantify_unit_eval.py` — `python control-bot/testing/quantify_unit_eval.py <run_dir> <unit id>`, exit 0 on PASS.

Read for context: `docs/decisions/0011-extract-bounded-parallel-batch-of-4.md` (the ADR shape this
one follows), `control-bot/testing/parallel_task_probe.py` and `check_run.py` (the two shapes a
testing script takes here), `control-bot/testing/README.md`.

- [ ] **Step 1: Write the failing eval script**

Create `control-bot/testing/quantify_unit_eval.py`:

```python
#!/usr/bin/env python3
"""Agent eval for one `quantify` unit (design §7, "Agent eval").

On demand, never in `make test`: it makes a real model call. It dispatches the
report-book unit of a prepared run directory through the SDK, exactly as the
playbook's Stage U does, and asserts the six properties the design names — the
output validates, no two kept rules compute the same thing, a rule that was
bound in several places stays one rule, the three cooking rules carry a FEEL
expression, the prose passes the lint, and the agent read two files and wrote
one.

The last one is the cheap proxy for QF-46: an agent that opened a dump, or went
looking for the store, is an agent that will retype the estate again.

Run from the repo root with the engine venv:
    .venv/bin/python control-bot/testing/quantify_unit_eval.py \\
        engine/tests/fixtures/facts-plan/run u-wb-gozaresh

NOTE: match the ClaudeSDKClient/ClaudeAgentOptions call to the installed
claude_agent_sdk API, as `src/claude/sdk_integration.py` does in the container.
"""
import json
import pathlib
import subprocess
import sys

import anyio
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

REPO = pathlib.Path(__file__).resolve().parents[2]
SCHEMA = REPO / "schemas" / "facts-unit.schema.json"
#: The three the cooking estate's report books must produce as computations.
MUST_COMPUTE = ("masraf_elami", "enheraf", "masraf_vaqei")


async def _dispatch(run_dir, unit):
    """One `quantify` unit dispatch; returns the tool names it used, in order."""
    prompt = (
        f"Task: quantify\n"
        f"  mode: unit\n"
        f"  run_dir: {run_dir}\n"
        f"  unit: {unit}\n"
        f"  attempt: 1\n"
        f"  input_path: {run_dir}/units/{unit}/input.md\n"
        f"  schema_path: {SCHEMA}\n"
        f"Nothing runs in the background and no monitor exists; the results "
        f"arrive as tool results in this same turn."
    )
    used = []
    options = ClaudeAgentOptions(
        allowed_tools=["Task", "Read", "Write"],
        permission_mode="bypassPermissions",
        include_partial_messages=False,   # mirror control-bot patch 0004
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for message in client.receive_response():
            for block in getattr(message, "content", None) or []:
                name = getattr(block, "name", None)
                if name:
                    used.append(name)
    return used


def _normalised(expr):
    return "".join(str(expr).split())


def _checks(run_dir, unit, used):
    """Every property that failed, one message each; empty means PASS."""
    out = []
    path = pathlib.Path(run_dir) / "units" / unit / "out.1.json"
    if not path.is_file():
        return [f"no output at {path}"]
    proc = subprocess.run(
        ["validate", "facts-unit", str(path), "--run", str(run_dir)],
        capture_output=True, text=True)
    if proc.returncode != 0:
        out.append(f"validate facts-unit exit {proc.returncode}: {proc.stdout}")

    doc = json.loads(path.read_text(encoding="utf-8"))
    kept = [d for d in doc["decisions"] if d.get("action") == "keep"]
    skeleton = json.loads(
        (pathlib.Path(run_dir) / "skeleton.json").read_text(encoding="utf-8"))
    candidates = {c["id"]: c for c in skeleton["candidates"]}

    exprs = {}
    for d in kept:
        expr = (d.get("data") or {}).get("expr")
        if expr:
            exprs.setdefault(_normalised(expr), []).append(d["key"])
    for shape, keys in exprs.items():
        if len(keys) > 1:
            out.append(f"two kept rules share one expression: {keys} — {shape}")

    for d in kept:
        cand = candidates.get(d.get("skeleton")) or {}
        bound = len((cand.get("payload") or {}).get("applies_to") or [])
        if cand.get("kind") == "rule" and bound >= 2:
            # A candidate bound in several places is ONE rule (QF-47); the only
            # way a decision can undo that is by splitting it, and a split is
            # for variants that compute different things, not for two branches.
            if d.get("action") != "keep":
                out.append(f"{d['skeleton']} had {bound} bindings and was not kept whole")

    have = {d.get("key") for d in kept}
    for key in MUST_COMPUTE:
        match = next((d for d in kept if d.get("key") == key), None)
        if match is None:
            out.append(f"no kept rule keyed {key} (kept: {sorted(have)})")
        elif (match.get("data") or {}).get("lang") != "feel" \
                or not (match.get("data") or {}).get("expr"):
            out.append(f"{key} carries no FEEL expr — `original` alone is not a legal state")

    from merge_facts.content import lint_prose
    symbols = skeleton.get("unit_symbols") or []
    for d in kept:
        for field in ("title", "statement"):
            for message in lint_prose(d.get(field, ""), exemptions=symbols):
                out.append(f"{d['key']}.{field}: {message}")

    reads, writes = used.count("Read"), used.count("Write")
    if (reads, writes) != (2, 1):
        out.append(f"the agent used {reads} Read and {writes} Write, not 2 and 1")
    return out


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    run_dir, unit = sys.argv[1], sys.argv[2]
    used = anyio.run(_dispatch, run_dir, unit)
    problems = _checks(run_dir, unit, used)
    for message in problems:
        print(f"  - {message}")
    print(f"EVAL {'PASS' if not problems else 'FAIL'}: {unit} "
          f"({len(problems)} problems, tools: {used})")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "<code-repo>" && .venv/bin/python control-bot/testing/quantify_unit_eval.py engine/tests/fixtures/facts-plan/run u-wb-gozaresh`
Expected: FAIL — either `EVAL FAIL` naming the properties the current agent misses, or a clean
`EVAL PASS` once T17's agent is in place. It is a measurement, not a gate: record the output in the
run log and keep the script.

- [ ] **Step 3: Commit the eval**

```
git add control-bot/testing/quantify_unit_eval.py && \
git commit -m "test(facts): agent eval for one quantify unit — on demand, not in make test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 4: Add the eval to the testing README**

Append to `control-bot/testing/README.md`:

```markdown
## Tier 3 — agent eval for one facts unit (on demand)

`quantify_unit_eval.py` dispatches one prepared unit of a facts run through the
SDK and asserts design §7's six properties: the output validates, no two kept
rules share a normalised `expr`, a candidate bound in several places stays one
rule, `masraf_elami`/`enheraf`/`masraf_vaqei` carry a FEEL expression, the prose
passes the lint, and the agent used exactly two Reads and one Write.

    .venv/bin/python control-bot/testing/quantify_unit_eval.py \
        engine/tests/fixtures/facts-plan/run u-wb-gozaresh

PASS = `EVAL PASS`. It costs a real model call, so it is **not** in `make test`
— run it after any change to `data-repo/.claude/agents/quantify.md` or to the
`input.md` rendering, and once per department before the first real run.
```

- [ ] **Step 5: Write ADR 0017**

Create `docs/decisions/0017-facts-pipeline-v3.md`:

```markdown
# 0017 — Facts pipeline v3: a planner mints the candidates, units of ≤20K decide them

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-06 |
| **Area** | `engine/facts_plan/` (new), `engine/merge_facts/`, `engine/dump_workbook/`, `schemas/` (v2); `data-repo` `.claude/agents/quantify.md` + `.claude/skills/quantify/SKILL.md` |
| **Related** | [0006](0006-control-bot-disable-background-task-deferral.md), [0011](0011-extract-bounded-parallel-batch-of-4.md), [0012](0012-consolidation-review-stage.md), [0015](0015-control-bot-1m-context-window.md) |

## Context

The first quantitative-facts run (cooking, 2026-09-02) produced 486 entries the
owner rejected, took 14 hours, and crashed three agents on the output cap. The
postmortem (`docs/postmortems/2026-09-06-quantify-cooking-run.md`) traced its 76
problems to eight causes. Four of them are architectural rather than a matter of
prompt wording:

- **The model re-typed the dump.** One agent was handed a whole department —
  13 workbooks, 316 tabs — and asked to walk it and emit a delta. It spent its
  output budget transcribing column letters and cell addresses that the dumper
  had already written to disk in a machine-readable form.
- **There was no runtime model.** No unit of work, no size budget, no derived
  state, no resume point. The run was one dispatch that either finished or did
  not, and when it did not there was nothing to resume from.
- **The spec ordered the junk.** «one record per tab, one rule per formula
  group, one constant per literal» is a faithful description of a spreadsheet
  and a useless description of a restaurant. A mirror tab became a record; a
  tolerance of 5 grams became an entry; a colour rule testing a sign at zero
  became a fact.
- **The coordinator became the author.** With no engine-written owner message,
  the playbook composed the checkpoint out of the delta — and once it was
  reading the delta it started correcting it, which is how a rescue run
  hand-edited the store.

## Decision

**A deterministic CLI plans the run; the model only decides.**

`facts-plan build` reads the dumps and writes **candidates** — record templates,
items, rule columns, import edges — with every mechanical field already filled,
and packs them with the transcripts and attachments into **units** whose
rendered input is ≤20K tokens and whose estimated output is ≤20K. The model
never reads a dump, a transcript or the store: one Read brings its unit in, one
short Write takes its decisions out.

Four consequences follow, each removing one of the four causes:

1. **QF-46 — the engine writes everything mechanical.** Locations, instances,
   column letters, enum constraints, reference rows, item codes, a rule's
   original text and its bindings, import edges, truncation checks. No key
   segment is ever derived from Persian text; sheet ids, column letters and row
   numbers are the mechanical handles.
2. **QF-51 — units of work are the unit of dispatch.** Units run in bounded
   parallel batches of at most four `Task`s per message (ADR 0011); every unit
   is validated on return; a unit is dispatched at most twice; each attempt is
   persisted under its own file name, so state is *derived from the filesystem*
   rather than tracked, and Stage 0 resumes at the first unfinished unit. The
   turn yields at a stage or batch boundary once its timer passes 40 minutes,
   and `facts-plan status`'s `yield` flag is the only signal the coordinator
   acts on.
3. **QF-47/48/49 — identity is by content, a mirror is an edge, and usefulness
   is rule 0.** One computation across four line tabs and two branches is one
   entry with sixty bindings, not sixty entries. A mirror tab produces no entry
   at all — it produces an `imports[]` member on the instances that read it.
   And a candidate must pass a usefulness test before any kind is assigned.
4. **QF-54 — the coordinator never authors.** `assemble` writes `gate-b.md` and
   `report` writes `report.md`; the playbook sends each verbatim and composes
   nothing. It reads exactly four things: `facts-plan status`, those two files,
   and validator output.

`validate facts-delta --store --run` performs the entire apply in memory —
including the resulting store's schema — and writes nothing, so a delta that
reaches the owner's checkpoint is one `apply` cannot refuse. Stage V is what
makes "a precondition failure after Gate B stops the run" a rule nobody has to
break.

## Consequences

- ✅ No agent is ever handed more than ~20K tokens of input or asked for more
  than ~20K of output, so the output-cap crash has no shape to recur in.
- ✅ A run is resumable at unit granularity, and a turn that ends at a boundary
  is a normal outcome rather than a stall.
- ✅ 70 cooking mirror tabs become 70 edges and 0 entries; the tolerances become
  parameters of one rule rather than five entries.
- ✅ The owner's two messages are engine output, reviewable as fixtures and
  lintable as text (`data-repo/.claude/hooks/test_playbook_lint.py`).
- ⚠️ **The estimator is a heuristic.** Its constants are frozen in
  `engine/tests/fixtures/facts-plan/expected.json`, so a retune shows as a
  fixture diff — but a department whose shape differs from cooking's may still
  split badly, and `build` exits 2 on a group it cannot fit rather than
  guessing.
- ⚠️ **One review round, capped at 60 decisions and 20 rewrites.** Cross-unit
  duplication beyond key, title and normalised-`expr` equality is the audit's
  problem, not the run's.
- 📝 The store is reset and rebuilt (§8) rather than migrated: at one seed entry
  a migration verb would be more code than the thing it migrates.
- 📝 `schema_version` moves to 2 with `additionalProperties: false` on every
  payload, so an invented key now fails at the schema rather than at review.

## Lessons

- **Ask what the model is uniquely for, and give it only that.** Every field the
  first run got wrong at scale was a field a deterministic reader could have
  filled. The prompt was not the problem; the division of labour was.
- **Identity is the design decision, not a naming convention.** Keying a rule by
  where its formula lives guarantees one entry per cell range. Keying it by what
  it computes made 486 entries into a few dozen — the same information, in the
  shape a person can review.
- **A coordinator with no artefact to send will write one.** The fix is not to
  tell it not to; it is to hand it a finished file and forbid it the inputs.
```

- [ ] **Step 6: Add the ADR row and verify the link**

Append to `docs/decisions/README.md`'s table:

```markdown
| [0017](0017-facts-pipeline-v3.md) | **Facts pipeline v3** — a deterministic planner (`facts-plan`) mints every mechanical field and packs the estate into ≤20K units; the model only decides, four units per message (0011), each validated on return and re-dispatched at most once; identity moves from where a formula lives to what it computes (one rule, sixty bindings), a mirror tab becomes an import edge and no entry, a usefulness test becomes rule 0; `assemble`/`report` write the owner's two messages and the coordinator sends them verbatim; supersedes the v2 walk after the 2026-09-02 run's 486 rejected entries |
```

Run: `cd "<code-repo>" && test -f docs/decisions/0017-facts-pipeline-v3.md && grep -c '0017' docs/decisions/README.md`
Expected: `1`

- [ ] **Step 7: Commit the ADR**

```
git add docs/decisions/0017-facts-pipeline-v3.md docs/decisions/README.md control-bot/testing/README.md && \
git commit -m "docs(facts): ADR 0017 — facts pipeline v3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

- [ ] **Step 8: Write the PRD requirement**

Insert into `PRD.md` after line 242 (FR-L6), before the `---` at line 244:

```markdown

### 7.12 Quantitative Facts

- **FR-Q1 (what the facts store is for):** Alongside the processes, the system keeps the restaurant's **definitions** — what each column of each table means, in what unit, who fills it and when, what is computed from what, and what the settings are. It records only what stays true: a definition, never last night's number. Its purpose is to be **read by whatever runs the restaurant next**, so what may be recorded is fixed to eight artefacts and nothing else may be minted: an item-master row; a table column with a unit; a recipe or bill-of-materials row; a settings constant (a par level, a tolerance, a conversion factor, a threshold — no consumer is required for one to be worth keeping); a validation constraint; a computed field with its inputs and outputs; a join between two tables; and a known defect in the data. Anything that is not one of these eight — a colour, a note pointing at nothing, a date copied from one cell to another — is **not recorded at all**, and the system says so rather than keeping it. A statement is written the way a written procedure is written: nobody reading one is shown a cell address, a column letter, a file name or a formula.
```

- [ ] **Step 9: Write the ARD paragraph**

Insert into `ARD.md` after line 45 (the closing fence of the overview diagram), before the `---`:

```markdown

**The facts store is the second output of the same disk.** The extraction
pipeline turns recordings into `departments/**/processes/*.json`; the facts
pipeline turns the same recordings, plus the dumped spreadsheet estate under
`attachments/sheets/` and the department's field material, into
`data-repo/facts/` — five files, one per kind (item, record, measurement, rule,
note). It runs through the same control bot, over the same filesystem, with the
same rule that only a deterministic CLI writes the output: `merge facts` is the
sole writer of `facts/**`, exactly as `merge` is of `processes/`. The two
pipelines share their inputs and touch none of each other's outputs — a session
can be half process and half numbers, and neither run blocks the other. What
reads the store is the Panel (a fact's detail view, its confirmations) and,
later, whatever system runs the restaurant: FR-Q1 fixes the eight artefacts it
may contain precisely so that the reader on the far side is a contract and not a
hope.
```

- [ ] **Step 10: Rewrite runbook 07's coverage section and readiness test**

The coverage metric is withdrawn (QF-44 v3): `merge facts check` no longer prints
`coverage: {n} of {m} workbooks read`, so §5 and §7 step 1 would tell the operator to look for a
line that is not there. Replace `docs/runbooks/07-facts.md:250-266` (all of §5) with:

```markdown
## 5. Readiness — what `check` reports

```bash
docker compose exec control-bot sh -c 'DATA_ROOT=/data merge facts check'
```

`check` reports a department's **readiness** (QF-44 v3): every unit of the last
run is done, the review ran, no entry carries a lint failure, no rule bound to a
formula is missing its expression, and every open dispute has been shown at the
facts checkpoint. It names no workbook denominator.

**The coverage line is gone**, and deliberately (design §11, cause C). It read
`coverage: {n} of {m} workbooks read` and counted a workbook as read the moment
one non-stub record cited it — which made "read the whole estate" a target and
"mint a record per tab" the cheapest way to hit it. 486 entries later, the
metric was measuring the defect. What replaces it is the run's own state: a
department is ready when its units are done and its output survived review, and
a workbook nobody had anything to say about is a fine outcome.

Every `check`/`audit` line is a finding for a human, not a failure — both verbs
exit 0 whatever they found.
```

and replace §7's step 1 (`docs/runbooks/07-facts.md:296-299`) with:

```markdown
1. **`merge facts check` reports the scope ready** — every unit of its last run
   done, the review run, no lint failure, no rule missing its expression, no
   dispute unshown (§5). Not a workbook count.
```

- [ ] **Step 11: Append the two new runbook sections**

Insert into `docs/runbooks/07-facts.md` before `## Next` (line 397):

```markdown
## 10. Before a facts run — the pre-run checklist (design §6.1)

On the **server** the control bot's environment already carries all of this and
there is nothing to do. On a **laptop**, in a Claude Code terminal, four things
have to be true before Stage U dispatches its first unit, and three of them were
not true during the 2026-09-02 run:

```bash
# (a) a unit takes minutes; a backgrounded one is a lost unit (ADR 0006)
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1

# (b) the ponytail plugin's SubagentStart hook injects a coding-minimality
#     persona into EVERY subagent while this flag exists, and its matcher is an
#     opt-in allowlist that fails open — so removing the flag is the only fix.
rm -f ~/.claude/.ponytail-active     # or: export PONYTAIL_DEFAULT_MODE=off
test -f ~/.claude/.ponytail-active   # must exit 1 — the playbook checks this too

# (c) the model, with the suffix. Plain `claude-opus-5` silently gets 200K.
grep -n 'model:' ../data-repo/.claude/agents/quantify.md
#   model: claude-opus-5[1m]
```

(d) the playbook uses only `Read, Write, Edit, Bash, Glob, Grep, Task` — the
bot's own allowlist — so nothing authored on the laptop breaks on the server.

For a run through the **local test bot**, check the same flag inside the
container, because the mount carries the host's `~/.claude`:

```bash
docker compose -f docker-compose.local.yml exec control-bot \
  test -f /root/.claude/.ponytail-active     # must exit 1
```

## 11. What the owner sees — the two message contracts

Two files, both written by the engine, both sent **verbatim** by the playbook.
Neither carries a command, an account id, a path, a unit id, a run directory or
a department code; both name an entry by its Persian title and, after the apply,
by the id the Panel's own «شناسه» column shows.

| file | written by | sent at | carries |
|---|---|---|---|
| `{run_dir}/gate-b.md` | `facts-plan assemble` | the facts checkpoint, before anything is written | counts per kind, the rules in one sentence each, what was dropped and roughly why, the disputes lettered, the issues found in the files, the unanswered units, and the one question «تأیید می‌کنید؟» |
| `{run_dir}/report.md` | `facts-plan report` | after the apply and the commit | the open disputes lettered, the unanswered units grouped per item, the dropped list in the owner's own words, every engine-found issue grouped by kind with its record named, any workbook skipped or part left unfinished, and whether the review ran |

**No other question is put to the owner at the checkpoint.** Approval applies the
delta with the disputes still open; the owner answers a dispute right there
(«۱ الف») or later in the Panel, and the playbook runs the resolve itself.

The stage table these two sit in is **not duplicated here** — it lives in
`data-repo/.claude/skills/quantify/SKILL.md` ("Stage ordering") and in design
§2.1, and a third copy would be the one that goes stale. What this runbook owns
is the operator's side: the checklist above, and the readiness test in §5 and §7.

Both files are lintable, and the lint is the same one the playbook's own
owner-facing blocks pass:

```bash
cd /opt/inja/code-repo && .venv/bin/python -c "
import sys, pathlib
sys.path.insert(0, '../data-repo/.claude/hooks')
from test_playbook_lint import problems
run = pathlib.Path('../data-repo/runs/facts/cooking/20260906-101500')
for name in ('gate-b.md', 'report.md'):
    print(name, problems((run / name).read_text(encoding='utf-8')) or 'clean')
"
```
```

- [ ] **Step 12: Commit the docs**

```
git add docs/runbooks/07-facts.md PRD.md ARD.md && \
git commit -m "docs(facts): runbook 07 pre-run checklist and message contracts; FR-Q1; the ARD paragraph

The coverage line is withdrawn with QF-44 (v3) — it made 'read every workbook' a
target, and 486 rejected entries is what hitting it looked like.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt"
```

---

### Task 20: The cooking rebuild (§8 steps 2a–3)

An operational task, not a code change. Every step is a command with its expected output or a
checklist line. Nothing here is committed from this repo — the run's own commits are the data-repo's,
made by the playbook.

**Files:**
- Reads: `docs/runbooks/07-facts.md` §10 and §11 (T19), `../data-repo/.claude/skills/quantify/SKILL.md` (T17), the memory note `local-test-bots`
- Writes: `../data-repo/facts/*`, `../data-repo/runs/facts/cooking/{stamp}/`, `../data-repo/attachments/sheets/.dump/**` — all through the engine and the playbook, never by hand

**Interfaces:**
- Consumes: everything T1–T19 produced.
- Produces: the rebuilt cooking scope in the store, the run directory that made it (committed as history), and a readiness verdict.

- [ ] **Step 1: Confirm the preconditions are all in place**

Run:
```bash
cd "<code-repo>" && .venv/bin/pytest -q -k "facts or dump_workbook or playbook_lint" && \
.venv/bin/pytest -q ../data-repo/.claude/hooks && \
cd ui && npx vitest run src/facts src/lib/factsLabels
```
Expected: PASS on all three. A red suite here is a red run; do not proceed.

Then the state checks — the store is the seed, and the ledger is not rewound (§8 step 1):
```bash
cd "<data-repo>" && \
jq '.entries | length' facts/rules.json facts/items.json facts/records.json && \
jq '.schema_version' facts/items.json && jq '.fact' facts/.id-seq.json
```
Expected: `0`, `0`, `1` (the `units` seed) · `2` · `486` — the ledger stays at 486 so no id is ever
re-minted onto different content.

- [ ] **Step 2: Confirm the cooking dumps are the re-dumped ones (§8 step 2a)**

Run:
```bash
cd "<data-repo>" && jq -r '.sheets[] | select(.row_labels) | "\(.name) \(.row_labels | keys | length)"' \
  attachments/sheets/.dump/1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s/sheets.json
```
Expected: the four report tabs with their row labels — «پیتزا» 10, «فرنگی» 9, «سوخاری» 6, «کانتر» 5.
If `row_labels` is absent anywhere, the dumps predate T4: refresh OAuth per runbook 05 and re-run
`dump-workbook --manifest` before going on.

- [ ] **Step 3: Bring the local test bots up**

Never the server tokens — two long-polls on one token break the live bot. The test bots are
`@aiprocessTestinjabo` (control) and `@uploadtestinjsbot` (upload), with their tokens in the
gitignored `deploy/local/*.env`.

Run:
```bash
cd "<code-repo>/deploy" && \
docker compose -f docker-compose.local.yml up -d --build control-bot && \
docker compose -f docker-compose.local.yml logs --tail 20 control-bot
```
Expected: `Up`, and a log line confirming `using existing Claude CLI authentication`. No proxy is
set on either service (measured 2026-08-25); if Telegram is unreachable, that is the first thing to
check, not to change.

- [ ] **Step 4: Run the §6.1 checklist inside the container**

Run:
```bash
cd "<code-repo>/deploy" && \
docker compose -f docker-compose.local.yml exec control-bot \
  sh -c 'test -f /root/.claude/.ponytail-active; echo "ponytail flag: $?"; \
         echo "background: $CLAUDE_CODE_DISABLE_BACKGROUND_TASKS"; \
         echo "model: $CLAUDE_MODEL"'
```
Expected: `ponytail flag: 1` (absent — a `0` means every unit will get a coding-minimality persona;
remove the flag from the host `~/.claude` and recreate the container), `background: 1`, and
`model: claude-opus-5[1m]` — the `[1m]` suffix is mandatory or the session silently runs at 200K.

- [ ] **Step 5: Start the run and answer Gate A**

In Telegram, to `@aiprocessTestinjabo`:

```
/quantify cooking
```

Expected, as the owner sees it: no manifest checkpoint (all 28 rows are confirmed today), then the
set checkpoint — the Excel files by title, the attachments, and the recordings by date. Answer with
the dates to include, or «هیچ‌کدام».

**Watch for the two failure shapes the postmortem named.** A prose-only «در حال پردازش…» message
with no tool call after it means the turn ended mid-pipeline — send «ادامه بده» and record it as a
regression against the playbook's turn discipline. A batch of more than four `Task` calls in one
message is an ADR 0011 violation and the same.

- [ ] **Step 6: Let the units run, and answer each yield**

Expected between batches: one progress line and the next batch in the same message —
«۸ از ۲۶ بخش از داده‌ها بررسی شد.» At a yield, the turn ends with
«… برای ادامه «ادامه بده» را بفرستید» and nothing else; send «ادامه بده».

Watch the run directory from the host while it works — read-only, and never edit anything in it:
```bash
cd "<data-repo>" && DATA_ROOT=. facts-plan status --run runs/facts/cooking/{stamp}
```
Expected: a table of `unit · type · state · attempts`, the stage, `plan_stale: false`, and the
timer. A unit at `failed` is expected to be rare; note its id — its candidates will appear in the
report as unexamined.

- [ ] **Step 7: Read Gate B as the owner, and approve**

Expected: one Persian message, the counts per kind, the rules in words, the disputes lettered, the
issues found in the files, and «تأیید می‌کنید؟» — and **nothing else**. If a command, a path, an
id like `S-r-4f2a…`, a unit id or the word `cooking` appears in it, the run has a defect: record it
and do not approve until it is fixed, because that message is the engine's output and a rerun will
reproduce it.

Answer «تأیید».

- [ ] **Step 8: Verify what was written**

Run:
```bash
cd "<data-repo>" && RUN=runs/facts/cooking/{stamp} && \
DATA_ROOT=. merge facts check && \
DATA_ROOT=. facts-plan status --run $RUN && \
jq '[.units[] | select(.state != "done")] | length' $RUN/meta.json
```
Expected: `check` reports cooking ready — units done, review ran, no lint failure, no rule missing
its expression, no unshown dispute — and no workbook denominator anywhere in its output. `status`
reports every unit `done`. The `jq` prints `0`, or the number of failed units the report also names.

- [ ] **Step 9: Lint the two owner-facing files**

Run:
```bash
cd "<code-repo>" && .venv/bin/python -c "
import sys, pathlib
sys.path.insert(0, '../data-repo/.claude/hooks')
from test_playbook_lint import problems
run = pathlib.Path('../data-repo/runs/facts/cooking/{stamp}')
bad = 0
for name in ('gate-b.md', 'report.md'):
    found = problems((run / name).read_text(encoding='utf-8'))
    print(name, found or 'clean')
    bad += len(found)
raise SystemExit(1 if bad else 0)
"
```
Expected: `gate-b.md clean` and `report.md clean`, exit 0. Any hit is a defect in
`facts_plan.assemble` or `facts_plan.report`, not something to edit in the file — fix the writer and
re-run `assemble`/`report` from the same run directory.

- [ ] **Step 10: Spot-check the four things the design promises**

Run:
```bash
cd "<data-repo>" && \
echo "-- mirrors became edges, not entries:" && \
jq '[.entries[] | select(.data.role == "mirror")] | length' facts/records.json && \
jq '[.entries[].data.instances[]?.imports[]?] | length' facts/records.json && \
echo "-- one rule, many bindings:" && \
jq -r '.entries[] | select(.data.applies_to) | "\(.key) \(.data.applies_to | length)"' facts/rules.json && \
echo "-- the tolerances are parameters, not entries:" && \
jq '[.entries[] | select(.key | test("tolerance"))] | length' facts/rules.json
```
Expected: `0` mirror records and a non-zero count of import edges (cooking has ~70 mirror tabs);
`enheraf`, `masraf_elami` and `masraf_vaqei` each with several bindings rather than one entry per
column; and `0` entries keyed for a tolerance — the numbers live in `applies_to[].params`.

- [ ] **Step 11: Read the report and settle the disputes**

Expected: `report.md` verbatim, the disputes lettered. Answer each («۱ الف»); the playbook runs the
resolve itself into a fresh run directory and confirms by the field's Persian label. Then Stage C
presents the audit findings in Persian, numbered; approve or skip each one at a time.

- [ ] **Step 12: Confirm the run committed itself, and stop the test bots**

Run:
```bash
cd "<data-repo>" && git log --oneline -3 && git status --short | head
cd "<code-repo>/deploy" && docker compose -f docker-compose.local.yml down
```
Expected: a `quantify(cooking): {C} created, {U} updated` commit (plus one per Stage C item), and a
clean working tree — the playbook stages `departments runs facts attachments` and never
`git add -A`.

- [ ] **Step 13: Repeat on the server**

Deploy the code-repo change, then run the same `/quantify cooking` through the **production**
control bot, with the same three observation points: the checkpoint reads clean, no batch exceeds
four, and `check` reports the scope ready. The server needs no §6.1 checklist — its environment
carries it — but it does need the OAuth token to be live (runbook 05) or `dump-workbook` fails at
Stage 2.

```bash
cd /opt/inja/code-repo/deploy && \
docker compose exec control-bot sh -c 'DATA_ROOT=/data merge facts check'
```
Expected: cooking ready. That is §8 step 3 complete; §8 step 4 runs the remaining departments in any
order, procurement after them, and management last.


---

## Interfaces — the contract every task uses


Spec: `code-repo/docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md` (v3.3). Section numbers below are the spec's.
Repos: `code-repo` (engine, schemas, ui, ui-backend, docs) and `data-repo` (runtime: `.claude/`, `attachments/sheets/`, `facts/`, `runs/`).
Tests: `cd code-repo && .venv/bin/pytest -q -k "<expr>"` (facts-scoped runs only — never the whole suite for a small change). Engine tests import bare modules (`from merge_facts.apply import apply`); `engine/tests/conftest.py` puts `engine/tests` on `sys.path` so `from facts_helpers import _root, _run_dir, _units_delta, _const_delta, _write, _seed_units` works. Fixture workbook builder: `engine/tests/fixtures/make_workbook.py::make_workbook(path, *, shared_formula=True, dummyfunction=True, ...)`.
Commits: one per task, message `feat(facts): …` / `fix(facts): …` / `test(facts): …` / `docs(facts): …`, footer lines:
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
```
Never `git add -A`; stage named paths. data-repo commits stage only the files the task touched.

## Task map (numbering is final; use these numbers in cross-references)

Phase 1 — engine foundation
- T1 guard hook fix (data-repo)
- T2 schemas v2 + facts-unit schema (code-repo `schemas/`)
- T3 store reset and version bump (data-repo migration §8 steps 1–2)
- T4 dump-workbook v3 (row capture, row_labels, ids rows.tsv, reference-tab reconciliation, --init-manifest pre-fill + unresolved[], --manifest skip-and-warn)
- T5 preconditions module, in-memory apply, `validate facts-delta --store --run`, grouped errors
- T6 content pass v3: prose lint, constant shape, record shape scoping, param inputs
- T7 ladder + apply v3: DERIVED skip, new members, find_match over instances, used marker, scope rule, supersession close, note title-twin, location recompute
- T8 audit v3 + check readiness + resolve/unit_ref + retire repair-foreign-keys

Phase 2 — facts-plan
- T9 `facts_plan` package + normaliser + shapes fixture
- T10 build: record templates, reference rows, items
- T11 build: rule columns (variants, params, applies_to, exclusions, issues)
- T12 build: import edges, context, reuse slice, process index, functions.md, skeleton.json
- T13 build: units, plan.json, input.md rendering; `status` (turn.json, derived state, yield, plan_stale)
- T14 `validate facts-unit --run`
- T15 digest + assemble + assembly.json + gate-b.md
- T16 report.md + expected.json + the v2 acceptance fixture over frozen unit outputs

Phase 3 — runtime, UI, docs, rebuild
- T17 data-repo runtime: quantify.md, SKILL.md, edit-fact style card, CLAUDE.md pointers, manifest twin_of, NAMED_FUNCTIONS.md deleted, playbook lint test
- T18 UI + ui-backend: schema_version 2, mirror label gone, RuleCard «محل اجرا», RecordCard «نسخه‌ها»/«ورودی از», labels, tests
- T19 docs: runbook 07 checklist + message contracts, ADR 0017, PRD FR, ARD paragraph, `control-bot/testing/quantify_unit_eval.py`
- T20 the cooking rebuild through the local test bot (§8 steps 2a–3) and readiness check

## Python interfaces (exact names)

### merge_facts (existing, keep): `SEGMENT_RE`, `KEY_RE`, `KIND_ORDER`, `load_store(root)`, `save_store(root, store)`, `find_match(store, entry)`, `is_open(entry)`, `canonical_scope(scope)`, `iter_ref_objects(obj)`, `derive_status(entry)`, `null_paths(entry)`, `get_path/set_path/path_exists`, `account_id(field, statement, value, source)`, `build_index(store)`.

### merge_facts/preconditions.py (new, T5)
```python
def preconditions(root, store, entries, run_dir) -> list[str]   # moved verbatim from apply._preconditions; apply imports it
```

### merge_facts/apply.py (T5, T7)
```python
def apply(root, delta_path, run_dir) -> dict                       # unchanged signature; internally: validate → _derive_keys → preconditions → _plan(..., minter=next_fact_id) → _rewrite_refs → _upsert → _stamp → _write
def simulate(root, delta_path, run_dir, now="2026-01-01T00:00:00Z") -> tuple[dict, list[str]]
    # the same pipeline on copy.deepcopy(load_store(root)) with minter=_MemoryMinter(root); returns (store_after, problems); writes nothing; problems non-empty when preconditions fail or the stamped store fails facts.schema.json
class _MemoryMinter:  # seeded from facts/.id-seq.json, __call__() -> "F-00487", never writes
def _plan(root, store, entries, minter) -> tuple[list, dict, dict]   # was _plan(root, store, entries)
def _stamp(root, store, touched, now) -> None                        # derived status, updated_at, originals path into data.original_ref (the file itself is written by _write)
def _write(root, store, run_dir, delta_path, id_map, touched, adopted, originals) -> None   # _snapshot, save_store, run-dir files, originals files
def used(run_dir) -> bool                                            # {run_dir}/id-map.json exists
```
`apply` exits 2 (SystemExit) when `used(run_dir)` before doing anything.

### merge_facts/content.py (T6)
```python
def check_document(doc, kind_of_file, store=None, unit_symbols=None) -> list[str]
def lint_prose(text, *, exemptions, allow_sheet_words=False) -> list[str]   # §5.2; exemptions = unit symbols; allow_sheet_words for a record statement / field description
def group_messages(messages) -> list[str]   # one line per rule: "<rule>: <shape that satisfies it> — N entries: T-4, T-9 …"
PIPELINE_WORDS = ("پاس", "اسکلت", "بخش از داده‌ها", "واحد کاری", "بچ", "original", "bindings", "FEEL", "account", "expr")
COLLOQUIAL = ("می‌زنن", "می‌کنن", "داشته باشن", "بگیم", "می‌گیم")
REF_TOKEN = r"(?:'[^']+'!)?(?<![A-Za-z0-9_$])\$?[A-Z]{1,3}\$?(?:N|\d{1,5})(?![A-Za-z0-9_(])(?::\$?[A-Z]{1,3}\$?(?:N|\d{1,5}))?"
```
Lint targets: envelope `title`, `statement`, `aliases[]`; payload `fields[].description`, `grain`, `method`, `exceptions`, `tracked[].reason`, unit-written `issues[].description` (an issue with `engine: true` is exempt).

### merge_facts/ladder.py (T7)
```python
DERIVED = frozenset({"location"})   # matched by leaf name at any depth like PROSE_LEAVES; never merged, never disputed
```

### merge_facts/audit.py (T8)
```python
AUDIT_CHECKS: tuple   # detector functions; each returns findings {code, id, message, proposal}
FLAG_CHECKS = (_duplicate_output, _lookalike_title, _recurring_note_shape, _equal_expr, _duplicate_code, _edge_disagreement)   # disk-free; codes two_writers, duplicate_title, note_overlap, equal_expr, duplicate_code, edge_disagreement
def flags_over(root, entries) -> list[dict]     # _Walk(root, load_store(root) + entries) then FLAG_CHECKS only; entries must carry ids (temp ids allowed)
def audit(root, persian=False) -> list[dict]
def check(root) -> dict                          # readiness per QF-44 (v3): {units_done, review_ran, lint_failures, expr_missing, open_disputes}; no coverage line
```
Finding codes (strings): `two_writers`, `duplicate_title`, `note_overlap`, `equal_expr`, `duplicate_code`, `edge_disagreement`, `row_gone`, `dump_missing`, `binding_gone`, `expr_missing`, `no_consumer`, `quantity_off_enum`, `note_targets_retired`, `import_unresolved`, `stale_prose`, `unconsumed_constant` (informational: `proposal: "info"`), plus the existing others.

### merge_facts/verbs.py (T8): `repair_foreign_keys` and its CLI verb removed; `resolve(...)` clears `unit_ref` on a `unit` resolve unless the chosen account names one.

### validate/cli.py (T5, T14)
```
validate facts-delta <file> --store --run <run_dir>   # runs apply.simulate; prints grouped errors; exit 2 on any
validate facts-unit <file> --run <run_dir>            # facts_plan.validate_unit(root, run_dir, file)
validate <schema> <file>                              # unchanged for every other schema
```

### dump_workbook (T4)
`sheets.json` per tab gains `"row_labels": {"6": "وزن پنیر پیتزا", …}` (absent when none). `_read_sheet(data, strings, keep_rows=False, keep_cols=2)` keeps the first 9 rows and every cell of the two left-most non-empty columns. `header_row(head, merges)` still scans rows 1–5 only. `dump_workbook(xlsx_path, structure_md_path, out_dir, reference_tabs=(), ids_tabs=())` writes `rows.tsv` for reference tabs and for ids tabs (tabs whose name matches `sheetsfileid` case-insensitively; the CLI passes them). `init_manifest(sheets_root, dumps)` — `dumps` is `{spreadsheetId: {"sheets": sheets.json dict, "formulas": [rows]}}`; a new row gets proposals per §2.2 and `unresolved: [...]`; `confirmed` = `not unresolved`. `manifest_reconcile(row, dump) -> list[issue]` drops mirror/ids/computing tabs from a confirmed `reference_tabs` and returns run-only issues `reference_tab_is_mirror | reference_tab_is_ids | reference_tab_computes`. CLI `--manifest` prints `warning: <file> skipped (unresolved)` and continues. Helper predicates exported: `is_mirror_tab(formulas_for_tab) -> bool` (exactly one formula, range A1, body a single IMPORT_FROM_SHEET call directly or as a LET result), `is_ids_tab(name) -> bool`, `has_date_header(head_row) -> bool`.

### facts_plan (Phase 2) — package `engine/facts_plan/{__init__,build,assemble,cli}.py`, entry point `facts-plan = "facts_plan.cli:main"`
```python
# build.py
def estimate_tokens(text) -> int                       # ascii/4 + non_ascii/1.5, rounded up
def normalise(formula, *, table_refs) -> Shape          # Shape(text, params: dict, functions: set, refs: list); steps (a)–(f) of §2.3; keeps LET names as param keys
def is_bare_reference(shape_text) -> bool               # "@" or "'…'!@"
def template_signature(tab_name, head_row) -> tuple     # (folded name, code tuple)
def build(root, department, run_dir, recordings, *, rebuild=False) -> dict   # writes skeleton.json, plan.json, units/*/input.md, functions.md; returns {"units": n, "candidates": {...}}
def render_input(unit, skeleton, extras) -> str
# assemble.py
def digest(root, run_dir) -> pathlib.Path              # review/input.md + review/input.sha256
def assemble(root, run_dir, *, review=False) -> dict    # facts-delta.json, assembly.json, gate-b.md
def report(root, run_dir) -> pathlib.Path              # report.md (after apply; reads id-map.json)
def validate_unit(root, run_dir, path) -> list[str]     # used by `validate facts-unit`
# cli.py
def status(root, run_dir, *, new_turn=False) -> dict    # {"stage", "units": [{id,type,state,attempts}], "plan_stale", "elapsed_s", "yield"}
main(): facts-plan build <dept> --run R --recordings a,b [--rebuild] | digest --run R | assemble --run R [--review] | report --run R | status --run R [--new-turn]
```
Provisional ids: `S-rec-<12hex>`, `S-i-<12hex>`, `S-r-<12hex>`, `S-gs-<12hex>` (sha256 of the content the spec names, first 12 hex).

### Run-directory files (Phase 2)
- `skeleton.json`: `{schema_version: 1, department, run, unit_symbols: [...], candidates: [{id, kind, unit, payload}], instances: [{key, spreadsheetId, sheetId, sheet, branch, hidden, template}], imports: [{consumer, source, range, named_range}], issues: [{kind, instance?, description, target?, run_only: bool}]}`
- `plan.json`: `{schema_version: 1, department, hashes: {path: sha256}, units: [{id, type: "workbook|transcript|items|attachment", inputs: [paths], candidates: [ids], nodes: [node ids], est_tokens_in, est_tokens_out}]}` — immutable
- `units/<u>/input.md`, `units/<u>/out.<n>.json` (a `facts-unit` document)
- `review/input.md`, `review/input.sha256`, `review/out.json`
- `facts-delta.json` (facts-delta v2), `assembly.json`: `{dropped: [{skeleton, kind, label, reason_code, unit}], undecided: [{skeleton, kind, label, unit}], provenance: {"T-1": "u-wb-gozaresh"}, review_status: "applied|discarded|absent"}`
- `gate-b.md`, `report.md`, `turn.json` `{started_at}`, `functions.md`

### facts-unit document (schemas/facts-unit.schema.json, T2)
Top: `{schema_version: 1, unit: str, attempt: int, decisions: [...], new: [...]}`. Decision: `skeleton` XOR `entry: {kind, key, scope}`; `action: keep|drop|merge_into|split|contradiction`; `keep` requires `key,title,statement`; `drop|merge_into|split` require `reason_code` ∈ `not_a_fact|date_passthrough|cosmetic|duplicate|has_a_home|insufficient_context|other`; `merge_into` requires `into`; `split` requires `into: [{key,title,statement,data?,takes:[str]}]`; `contradiction` requires `field, resolution: account|fix` and is legal only when `unit == "review"`; optional `aliases[]`, `branches[]`, `processes: [{process, node, quote}]`, `data` (closed per kind, §2.5 tables), any leaf may be `{"value": x, "inferred": true}`. `new[]`: facts-delta v2 entries without `id`, refs `{"ref": "S-…"|"F-…"}`.

### Schemas v2 members (T2), verbatim names
record.data: `medium, role(log|reference|report|config), location, instances[]{key, spreadsheetId, sheetId, sheet, branch, hidden, imports[]{key, source: {ref}|{spreadsheetId, sheet}, range, named_range}}, fields[]{key, title, columns{}, type, unit, unit_raw, description, constraints{enum,readOnly,required,minimum,maximum}, refItems{namespace,resolved_by}, derived{ref}, filled_by, group{key,title}}, header_fields[], sections[], rows[], signatures[], primaryKey[], reconciled_against[], blank_master, grain, cadence, day_boundary, filled_by, approved_by, movement{from,to,reason}, identifier_scheme{}, template_of{ref}, divergence, stub, original_ref(store only)`.
rule.data: `inputs[]{key,title,unit,from: {ref,field?,row?}|{"param": str}|"operator"|"calendar", via{ref}}, outputs[]{key,title,unit,nature,of{ref},per,writes_to{ref,field?},share,value,range{min,max}}, expr, lang(feel|table|text|sheets|gs), text, table{}, original(delta)/original_ref(store), calls[]{ref}, edge_cases[]{input,expected,why}, identifier, applies_to[]{key, record{ref,field}, variant, range, params{}, rows[]{key,row,label,item}}, template_of{ref}, divergence(none|intentional|drift|unknown)`.
item.data: `code, code_absent, category(ingredient|product|packaging|consumable|place|other), group, state(raw|cooked|frozen|prepared), grade, unit, unit_raw, units[]{pack_unit,factor_to_base}, pack{size,unit}, tracked[]{record{ref},value,reason}`.
measurement.data: `of{ref}, quantity(mass|count|volume|duration|money|ratio|other), unit, method, when, by, writes_to{ref,field?}, exceptions`.
note.data: `about[]{ref} (minItems 1), question` (both required).
issue.kind adds: `hand_maintained_index, no_rule_applies, broken_formula, cached_error, leading_offset, unused_mirror, unknown_source, column_offset, per_cell_mirror, ambiguous_row_header, binding_gone`; issue gains `instance` (string) and `engine` (boolean).
source.quote allowed for `voice|comment|sheet|process`. Grammars: `fields[].key`, `inputs[]/outputs[].key`, row cell names → SEGMENT; `instances[].key`, `applies_to[].key`, `imports[].key`, `applies_to[].rows[].key` → KEY.
manifest.schema.json v2: workbook gains `unresolved: [str]` (enum departments|branches|reference_tabs) and `twin_of: str` (a `short`).
facts-run-meta: `units: [{id, type, state, attempts}]`.

### UI (T18)
`ui/src/facts/cards/RuleCard.tsx` gains section «محل اجرا» (bindings table: workbook title · tab · branch · rows · numeric params); `RecordCard.tsx` replaces the location line with «نسخه‌ها» (instances list) and renders «ورودی از» per instance; `ui/src/lib/factsLabels.ts` loses `mirror`/`mirror_of`, gains labels for `instances`, `imports`, `applies_to`, `columns`, the new issue kinds; `ui-backend/inja_ui_backend/facts_store.py` accepts `schema_version` 1 or 2 on read and writes 2. Bundle already carries `row_titles`/`path_labels`; workbook title = the manifest row's `file` without extension until a Persian title exists.
