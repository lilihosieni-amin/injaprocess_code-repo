# Department Process Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every department an explicit, human-curated display order over its processes, stored in `departments/<code>/order.json`, written only by a new deterministic `order` CLI, editable in the UI, and read-only to the AI runtime.

**Architecture:** A new `engine/order/` package owns all reads and writes of `order.json`. `merge` calls its `reconcile()` once per invocation so the file always equals the department's active (non-tombstoned) process set. `ui-backend` shells out to the `order` CLI for writes (matching how it already calls `allocate-id`/`merge`/`validate`) and returns processes pre-ordered from `GET /processes`, so the UI never sorts. A `data-repo` guard-hook rule blocks the AI runtime from writing the file, exactly like `processes/*.json`.

**Tech Stack:** Python 3.11 + `argparse` + `jsonschema` (engine), FastAPI (backend), React 19 + TypeScript + TanStack Query + Tailwind (UI). No new dependencies in any component.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-department-process-order-design.md`. Read it before Task 1. Decisions are labelled D1–D9 there and referenced by number below.
- **INV-1:** `order.json` is written only by the `order` CLI, never by the language model.
- **INV-2:** `code-repo` and `data-repo` are separate repos with separate commits. Tasks 1–11 and 13 are `code-repo`; Task 12 is `data-repo`.
- **Ordering rule (spec §2.1)** is implemented in **exactly one place** — `ui-backend`'s `list_processes`. The engine keeps the file exact, so `reconcile` does not need it. Do not add a second copy.
- **Active set** = every `departments/<dept>/processes/*.json` whose `tombstoned` is not `true`.
- **Timestamps:** UTC, `%Y-%m-%dT%H:%M:%SZ`. Every mutating `order` verb takes `--now` so tests can pin it, matching `merge`.
- **Schema style:** draft 2020-12, `additionalProperties: false`, `$id` = bare filename.
- **UI copy is Persian.** Reuse the existing `toFa` helper for digits. Match `CreateProcessModal.tsx` for modal shape and Tailwind tokens.
- **No new runtime dependencies.** The reorder UI uses native HTML5 drag events plus ↑/↓ buttons.
- **Test commands (verified — use exactly these):**
  - Whole Python suite: `cd <code-repo> && make test` (or `.venv/bin/python -m pytest -q`).
  - A single **engine** test file needs `PYTHONPATH=engine/tests`, because `engine/tests/*` do
    `from conftest import load_fixture` and a bare explicit path fails with
    `ModuleNotFoundError: No module named 'conftest'`:
    `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_x.py -q`
  - A single **ui-backend** test file needs no prefix: `.venv/bin/pytest ui-backend/tests/test_x.py -q`
  - Frontend: `cd ui && npx vitest run src/path/file.test.tsx`; whole suite `npm test`.
  - `data-repo` hook tests: the system python has no pytest — use the code-repo venv:
    `cd <data-repo> && <code-repo>/.venv/bin/python -m pytest .claude/hooks/test_guard.py -q`
- **Do not stage, commit, or revert these pre-existing untracked leftovers** in `code-repo`:
  `control-bot/chathistorylog.txt`, `deploy/docker-compose.local.yml`, `deploy/local/`. They belong
  to the user's local testing setup. Stage only the files your task's commit step names.

---

## Phase 1 — Documents (no code)

### Task 1: PRD, ARD, ADR and CLAUDE.md

The user requires the reference documents to be updated **before any code changes**. Documentation only — no tests, one commit.

**Files:**
- Modify: `PRD.md` (§7.4 after FR-D11, §7.6 after FR-I6, §10 INV-1, §11 after AC-10, §12)
- Modify: `ARD.md` (new §4.6 after §4.5, §8 CLI table + schema paragraph, §13.2, §14, §15, §17)
- Modify: `CLAUDE.md` (the `engine/` row of the Layout table)
- Create: `docs/decisions/0016-department-process-order.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the requirement ids `FR-D12`, `FR-I7`, `AC-11` and the ARD section number `§4.6`, referenced by later tasks' comments and docstrings.

- [ ] **Step 1: Add FR-D12 to `PRD.md` §7.4**

Insert immediately after the `FR-D11` bullet:

```markdown
- **FR-D12 (process order):** Each department has an explicit order over its processes, decided by a human. This order is what the UI list shows and what the department export follows. It is maintained by the system, never by the language model: a newly created process is added to the end of the order, a retired (tombstoned) process leaves it, and the user can rearrange it at any time in the UI.
```

- [ ] **Step 2: Add FR-I7 to `PRD.md` §7.6**

Insert immediately after the `FR-I6` bullet:

```markdown
- **FR-I7 (reordering processes):** The user can rearrange a department's process order in the UI through a dedicated reorder view, and the change is saved only when they confirm it — like every other edit (see FR-I3). Retired processes take no part in the order and are shown after the ordered ones.
```

- [ ] **Step 3: Extend INV-1 in `PRD.md` §10**

Replace the `INV-1` bullet with:

```markdown
- **INV-1:** No identifier is ever created by the language model; IDs are always generated by the system, uniquely, from a single source. An id, once used, is **never reused** — not even after the process it belonged to is permanently deleted. The same rule governs the **order** of a department's processes: it is written only by the system's own tools, never by the language model.
```

- [ ] **Step 4: Add AC-11 to `PRD.md` §11**

Insert immediately after the `AC-10` bullet:

```markdown
- **AC-11:** After the user rearranges a department's processes in the UI, that order is what the list shows when reopened, it survives a later processing run, and a process created afterwards appears at the end of the order rather than in an arbitrary position.
```

- [ ] **Step 5: Add the export line to `PRD.md` §12**

Insert as a new bullet at the end of the §12 list:

```markdown
- Department process export (a per-department document of all its processes) — it follows the process order of FR-D12, which is why the order is recorded explicitly.
```

- [ ] **Step 6: Add ARD §4.6**

Insert between §4.5 and the `---` that precedes `## 5. Extraction Pipeline`:

````markdown
### 4.6 `order.json` (per department, FR-D12)

```jsonc
{
  "department": "dining",
  "order": ["dining-007", "dining-006", "dining-008"],
  "updated_at": "2026-07-25T12:00:00Z"
}
```

The department's **curated display order** — a human-chosen table of contents for the UI list and for the department export. It carries no claim that one process happens before another in the real world; that information lives in the flows themselves.

- **One flat list per department**, covering root *and* sub-processes, each exactly once. A consumer that wants nesting reads each process's `parent`.
- **Position is the array index.** There are no rank fields to drift.
- **The file equals the active set.** A newly created process is appended; a tombstoned or permanently deleted one is dropped. Tombstones therefore hold no position — the UI shows them after the ordered processes, in id order.
- **A missing `order.json` means "no curated order yet"** and readers fall back to id order. The file is created lazily on the first append, so departments with no processes have no file.
- **Restructure preserves curation:** a heir takes the position of the earliest process it supersedes (lowest index in the existing order), rather than being appended. A new sub-process created by an update is inserted directly after its parent. Anything unplaced goes to the end in id order.
- **Written only by the `order` CLI** (§8) — hook-enforced against the runtime, exactly like `processes/*.json` (INV-1). `merge` calls the same code in-process after every verb, so the pipeline needs no stage of its own.
````

- [ ] **Step 7: Add the `order` row and schema note to ARD §8**

In the CLI table, insert after the `merge` row:

```markdown
| `order` | verbs `show` / `sync` / `set` / `move` / `check`: maintain a department's curated process order (§4.6) — append new, drop tombstoned, heirs inherit their predecessor's position; `set` refuses a sequence that is not exactly the active set |
```

Then append to the end of that section's schema paragraph (the one beginning "Schemas `validate` gained/changed for this round"):

```markdown
The process-order feature adds one further schema — `order.schema.json` (§4.6; a duplicate id or an unknown-shaped entry is schema-invalid).
```

- [ ] **Step 8: Extend ARD §13.2**

Insert as a new bullet after the "Backend jobs" bullet:

```markdown
- **Process order (FR-D12, FR-I7):** `GET /api/departments/{code}/processes` returns processes **already ordered** — the curated order first, then tombstones by id — so the frontend never sorts. Reordering happens in a dedicated compact panel (one short row per process, drag plus ↑/↓ buttons) rather than by dragging the list cards, because a department can hold dozens of processes. Saving `PUT`s the whole sequence; the backend refuses a sequence that is not exactly the active set with **409**, which is what happens when a pipeline run or a second tab added a process while the panel was open. The user is told and the list refreshes.
```

- [ ] **Step 9: Extend ARD §14**

Replace the hooks bullet ("The Section 7 hooks enforce invariants INV-1/INV-2 at the file level (AC-7)") with:

```markdown
- The Section 7 hooks enforce invariants INV-1/INV-2 at the file level (AC-7): the runtime cannot write `departments/**/processes/*.json` (only `merge`), cannot write `departments/**/order.json` (only `order`), and cannot touch `.claude/**` or `CLAUDE.md`.
```

- [ ] **Step 10: Extend ARD §15**

Append to the "When it commits — the three write paths" subsection:

```markdown
`order.json` is never committed on its own: it rides in the **same commit** as the action that changed it — the pipeline's run commit, or the UI's create/delete/reorder commit.
```

- [ ] **Step 11: Add the ARD §17 traceability row**

Add to the traceability table:

```markdown
| FR-D12 | §4.6 `order.json`, §8 `order` CLI, §13.2 reorder panel |
```

- [ ] **Step 12: Update the `engine/` row in `CLAUDE.md`**

Replace `allocate-id`, `merge`, `layout`, `transcribe`, `validate` in the `engine/` row with:

```
`allocate-id`, `merge`, `layout`, `order`, `transcribe`, `validate`
```

- [ ] **Step 13: Write ADR 0016**

Create `docs/decisions/0016-department-process-order.md`:

```markdown
# ADR 0016 — A department's process order is a CLI-written `order.json`, not a field in `overview.json`

**Date:** 2026-07-25
**Status:** accepted
**Context:** PRD FR-D12/FR-I7; ARD §4.6; spec `docs/superpowers/specs/2026-07-25-department-process-order-design.md`

## Context

A department's processes had no meaningful sequence — the UI list rendered them in filename
order. The order matters for reading the list and is a prerequisite for the planned department
export, which cannot guess placement.

## Decision

Store the order in a **separate per-department file**, `departments/<code>/order.json`, written
**only** by a new deterministic `order` CLI, and keep it in sync through a single `reconcile`
hook in `merge`. The AI runtime gets read-only awareness, guard-enforced.

## Why not a `process_order` field in `overview.json`

`overview.json` already has a `PUT` endpoint and a UI edit screen, so it looks like the cheaper
home. But **the `summarize` subagent rewrites `overview.json` on every pipeline run**, so the
language model would clobber the human's curated order on its next pass — defeating the whole
point. It would also mix human curation with AI-generated narrative in one file.

## Why not a tolerant hint file

Letting each reader reconcile drift its own way needs almost no wiring, but then the
"where does a new process go" rule lives in every reader instead of in the data. The UI and the
export could silently disagree, and the file would quietly rot. The export needs a sequence it
can trust without second-guessing, so the file is authoritative and the CLI keeps it exact.

## Why not a `rank` integer per process

Ranks drift: every insertion either renumbers many files — many diffs, many commits — or leaves
gaps that accumulate. And `process.json` is written per-process by `merge`, so no single writer
ever sees the whole sequence at once.

## Consequences

- One new schema, one new CLI, one new hook in `merge`; no new pipeline stage and no new agent
  instruction, because `merge` maintains the file during the existing Stage 6 and the existing
  Stage 8 `git add departments` commits it.
- A restructure heir inherits its predecessor's position, so curation survives merge/split
  (ADR 0009 makes restructuring a normal event, not a rare one).
- Existing data needs a one-time `order sync --all` backfill.
```

- [ ] **Step 14: Commit**

```bash
git add PRD.md ARD.md CLAUDE.md docs/decisions/0016-department-process-order.md
git commit -m "docs(prd,ard): FR-D12/FR-I7 department process order + ADR 0016"
```

---

## Phase 2 — Engine: schema, order module, CLI

### Task 2: `order.schema.json`

**Files:**
- Create: `schemas/order.schema.json`
- Test: `engine/tests/test_schema_order.py`

**Interfaces:**
- Consumes: nothing.
- Produces: schema name `"order.schema.json"`, validated via `engine_common.validate(name, instance)`. Required keys `department`, `order`, `updated_at`.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_schema_order.py`:

```python
import pytest
from engine_common import validate

GOOD = {
    "department": "dining",
    "order": ["dining-007", "dining-006"],
    "updated_at": "2026-07-25T12:00:00Z",
}


def test_minimal_order_doc_is_valid():
    validate("order.schema.json", GOOD)


def test_empty_order_is_valid():
    validate("order.schema.json", {**GOOD, "order": []})


def test_duplicate_ids_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "order": ["dining-001", "dining-001"]})


def test_malformed_id_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "order": ["dining-1"]})


def test_node_id_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "order": ["dining-001-n010"]})


def test_extra_property_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "note": "x"})


def test_missing_updated_at_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {"department": "dining", "order": []})


def test_non_utc_timestamp_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "updated_at": "2026-07-25 12:00:00"})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `make test 2>&1 | tail -20` (or `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_schema_order.py -q`)
Expected: FAIL — every test errors with `FileNotFoundError` for `order.schema.json`.

- [ ] **Step 3: Write the schema**

Create `schemas/order.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "order.schema.json",
  "title": "Department process display order (ARD §4.6)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "order", "updated_at"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "order": {
      "type": "array",
      "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" }
    },
    "updated_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_schema_order.py -q`
Expected: PASS, 8 passed.

- [ ] **Step 5: Add the schema to the schemas README**

In `schemas/README.md`, insert this row into the table immediately after the `overview.schema.json` row:

```markdown
| `order.schema.json` | department process display order (ARD §4.6) | order CLI | UI backend, department export |
```

- [ ] **Step 6: Commit**

```bash
git add schemas/order.schema.json schemas/README.md engine/tests/test_schema_order.py
git commit -m "feat(schemas): order.schema.json — department process display order"
```

---

### Task 3: `order` module — read, active set, reconcile without hints

**Files:**
- Create: `engine/order/__init__.py`
- Test: `engine/tests/test_order.py`

**Interfaces:**
- Consumes: `engine_common.data_root`, `read_json`, `write_json_atomic`, `validate`; schema `order.schema.json` from Task 2.
- Produces, all with `root=None` defaulting to `data_root()`:
  - `read_order(dept, root=None) -> list[str]` — raises `ValueError` when `order` is present but is not a list of strings (never coerces corrupt input)
  - `active_ids(dept, root=None) -> list[str]` (id order; only ids matching `^<dept>-\d{3}$`, so a stray foreign-department file is ignored)
  - `reconcile(dept, now, root=None, heir_hints=None, child_hints=None) -> tuple[list[str], list[str]]` returning `(appended, dropped)`. Writes nothing — and creates no directory — for a department with no processes and no file yet (lazy creation, ARD §4.6), and does not rewrite the file when the sequence is already exactly right (no `updated_at` churn). An existing file whose processes have all been tombstoned *is* rewritten to `"order": []`.
  - `set_order(dept, sequence, now, root=None) -> list[str]`, raising `OrderMismatch`
  - `move(dept, pid, to, now, root=None) -> list[str]` (1-based `to`)
  - `check(dept, root=None) -> tuple[list[str], list[str]]` returning `(missing, stale)`
  - `departments(root=None) -> list[str]` (registry order, never sorted; raises `ValueError` on a malformed registry so the CLI can map it to exit 2)
  - `OrderMismatch(ValueError)` — its message always starts with `set mismatch:`

Hints are implemented in Task 4; this task lands the signature with them accepted and ignored.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_order.py` — 29 tests. Beyond the happy paths they pin the
loud-failure and lazy-creation contract: `test_read_order_without_the_order_key_is_empty`,
`test_read_order_rejects_a_non_list_order`, `test_read_order_rejects_a_string_order`,
`test_active_ids_ignores_a_foreign_department_file`,
`test_reconcile_writes_nothing_for_a_processless_department`,
`test_reconcile_creates_no_directory_for_a_processless_department`,
`test_reconcile_empties_an_existing_file_when_all_are_tombstoned`,
`test_reconcile_does_not_rewrite_when_nothing_changed`,
`test_reconcile_validates_before_writing` and
`test_departments_rejects_a_malformed_registry`. Note that
`test_reconcile_is_idempotent`, `test_reconcile_heals_a_duplicated_hand_edit` and
`test_departments_come_from_the_registry` are deliberately written so they fail if
`reconcile` re-sorts the sequence, if `_dedup` keeps the last occurrence instead of the
first, or if `departments()` sorts.

```python
import json

import pytest
from order import (OrderMismatch, active_ids, check, departments, move,
                   read_order, reconcile, set_order)

NOW = "2026-07-25T12:00:00Z"


def _proc(root, pid, tombstoned=False):
    dept = pid.rsplit("-", 1)[0]
    d = root / "departments" / dept / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": dept}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def _order_file(root, dept):
    return root / "departments" / dept / "order.json"


def _stored(root, dept):
    return json.loads(_order_file(root, dept).read_text(encoding="utf-8"))


def test_read_order_of_missing_file_is_empty(data_root):
    assert read_order("cooking", data_root) == []


def test_read_order_without_the_order_key_is_empty(data_root):
    _order_file(data_root, "cooking").write_text(
        json.dumps({"department": "cooking", "updated_at": NOW}), encoding="utf-8")
    assert read_order("cooking", data_root) == []


def test_read_order_rejects_a_non_list_order(data_root):
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking", "order": 5, "updated_at": NOW}), encoding="utf-8")
    with pytest.raises(ValueError):
        read_order("cooking", data_root)


def test_read_order_rejects_a_string_order(data_root):
    # A bare string must not be silently exploded into single characters.
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking", "order": "cooking-001", "updated_at": NOW}),
        encoding="utf-8")
    with pytest.raises(ValueError):
        read_order("cooking", data_root)


def test_active_ids_skips_tombstones_and_sorts(data_root):
    _proc(data_root, "cooking-003")
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002", tombstoned=True)
    assert active_ids("cooking", data_root) == ["cooking-001", "cooking-003"]


def test_active_ids_ignores_a_foreign_department_file(data_root):
    _proc(data_root, "cooking-001")
    (data_root / "departments" / "cooking" / "processes" / "dining-007.json").write_text(
        json.dumps({"id": "dining-007", "department": "dining"}), encoding="utf-8")
    assert active_ids("cooking", data_root) == ["cooking-001"]


def test_reconcile_creates_the_file_lazily(data_root):
    _proc(data_root, "cooking-001")
    assert not _order_file(data_root, "cooking").is_file()
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == ["cooking-001"] and dropped == []
    doc = _stored(data_root, "cooking")
    assert doc == {"department": "cooking", "order": ["cooking-001"],
                   "updated_at": NOW}


def test_reconcile_writes_nothing_for_a_processless_department(data_root):
    # The processes/ dir exists but is empty: no file, per ARD §4.6 lazy creation.
    assert (data_root / "departments" / "cooking" / "processes").is_dir()
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert not _order_file(data_root, "cooking").is_file()


def test_reconcile_creates_no_directory_for_a_processless_department(data_root):
    assert reconcile("logistics", NOW, root=data_root) == ([], [])
    assert not (data_root / "departments" / "logistics").exists()
    assert not _order_file(data_root, "logistics").is_file()


def test_reconcile_empties_an_existing_file_when_all_are_tombstoned(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    _proc(data_root, "cooking-001", tombstoned=True)
    _proc(data_root, "cooking-002", tombstoned=True)
    # The lazy guard must not swallow this: the file exists, so it gets emptied
    # rather than left stale, otherwise `check` would report permanent drift.
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == [] and dropped == ["cooking-001", "cooking-002"]
    assert _stored(data_root, "cooking")["order"] == []
    assert check("cooking", data_root) == ([], [])


def test_reconcile_does_not_rewrite_when_nothing_changed(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    reconcile("cooking", "2026-07-26T09:30:00Z", root=data_root)
    assert _stored(data_root, "cooking")["updated_at"] == NOW


def test_reconcile_validates_before_writing(data_root):
    _proc(data_root, "cooking-001")
    with pytest.raises(ValueError):
        reconcile("cooking", "25/07/2026", root=data_root)
    assert not _order_file(data_root, "cooking").is_file()


def test_reconcile_appends_new_in_id_order_keeping_curation(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    set_order("cooking", ["cooking-002", "cooking-001"], NOW, root=data_root)
    _proc(data_root, "cooking-004")
    _proc(data_root, "cooking-003")
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == ["cooking-003", "cooking-004"] and dropped == []
    assert read_order("cooking", data_root) == [
        "cooking-002", "cooking-001", "cooking-003", "cooking-004"]


def test_reconcile_drops_tombstoned(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    _proc(data_root, "cooking-001", tombstoned=True)
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == [] and dropped == ["cooking-001"]
    assert read_order("cooking", data_root) == ["cooking-002"]


def test_reconcile_drops_deleted_file(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    (data_root / "departments" / "cooking" / "processes" / "cooking-001.json").unlink()
    _appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert dropped == ["cooking-001"]
    assert read_order("cooking", data_root) == ["cooking-002"]


def test_reconcile_is_idempotent(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    curated = ["cooking-002", "cooking-001"]
    set_order("cooking", curated, NOW, root=data_root)
    # A curated, non-id order must survive reconcile untouched, twice over.
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert read_order("cooking", data_root) == curated
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert read_order("cooking", data_root) == curated


def test_reconcile_heals_a_duplicated_hand_edit(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    # The first occurrence wins, so the duplicate collapses forward, not back.
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking",
         "order": ["cooking-001", "cooking-002", "cooking-001"],
         "updated_at": NOW}), encoding="utf-8")
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-002"]


def test_set_order_replaces_the_sequence(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    assert set_order("cooking", ["cooking-002", "cooking-001"], NOW,
                     root=data_root) == ["cooking-002", "cooking-001"]
    assert read_order("cooking", data_root) == ["cooking-002", "cooking-001"]


def test_set_order_refuses_a_missing_id(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    with pytest.raises(OrderMismatch) as e:
        set_order("cooking", ["cooking-001"], NOW, root=data_root)
    assert str(e.value).startswith("set mismatch:")
    assert "missing=cooking-002" in str(e.value)


def test_set_order_refuses_a_stale_id(data_root):
    _proc(data_root, "cooking-001")
    with pytest.raises(OrderMismatch) as e:
        set_order("cooking", ["cooking-001", "cooking-009"], NOW, root=data_root)
    assert "stale=cooking-009" in str(e.value)


def test_set_order_refuses_a_tombstoned_id(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002", tombstoned=True)
    with pytest.raises(OrderMismatch):
        set_order("cooking", ["cooking-001", "cooking-002"], NOW, root=data_root)


def test_set_order_refuses_duplicates(data_root):
    _proc(data_root, "cooking-001")
    with pytest.raises(OrderMismatch):
        set_order("cooking", ["cooking-001", "cooking-001"], NOW, root=data_root)


def test_move_shifts_the_rest(data_root):
    for n in (1, 2, 3):
        _proc(data_root, f"cooking-00{n}")
    reconcile("cooking", NOW, root=data_root)
    assert move("cooking", "cooking-003", 1, NOW, root=data_root) == [
        "cooking-003", "cooking-001", "cooking-002"]


def test_move_rejects_an_absent_id(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    with pytest.raises(ValueError):
        move("cooking", "cooking-009", 1, NOW, root=data_root)


def test_move_rejects_an_out_of_range_position(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    with pytest.raises(ValueError):
        move("cooking", "cooking-001", 2, NOW, root=data_root)


def test_check_reports_missing_and_stale(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    _proc(data_root, "cooking-002")
    _proc(data_root, "cooking-001", tombstoned=True)
    missing, stale = check("cooking", data_root)
    assert missing == ["cooking-002"] and stale == ["cooking-001"]


def test_check_is_clean_after_reconcile(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    assert check("cooking", data_root) == ([], [])


def test_departments_come_from_the_registry(data_root):
    # Deliberately not alphabetical: registry order is the contract, not sorting.
    (data_root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "dining", "name": "سالن"},
                         {"code": "cooking", "name": "پخت"}]}), encoding="utf-8")
    assert departments(data_root) == ["dining", "cooking"]


def test_departments_rejects_a_malformed_registry(data_root):
    (data_root / "departments" / "registry.json").write_text(
        json.dumps({"departments": [{"name": "x"}]}), encoding="utf-8")
    with pytest.raises(ValueError):
        departments(data_root)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_order.py -q`
Expected: FAIL — collection error, `ModuleNotFoundError: No module named 'order'`.

- [ ] **Step 3: Write the module**

Create `engine/order/__init__.py`:

```python
"""Per-department curated process order (ARD §4.6).

The sole writer of `departments/<dept>/order.json`. The file holds exactly the
department's active (non-tombstoned) process ids; position is the array index.
`merge` calls `reconcile` in-process after every verb, and the `order` CLI
exposes the same operations for the UI backend and for ops.
"""
import re

from engine_common import data_root, read_json, validate, write_json_atomic


class OrderMismatch(ValueError):
    """A given sequence is not exactly the department's active set.

    The message always starts with `set mismatch:` so callers (the CLI, and
    through it the UI backend) can tell this apart from a schema failure.
    """


def _order_path(root, dept):
    return root / "departments" / dept / "order.json"


def read_order(dept, root=None):
    """The stored sequence, or [] when the department has no order.json yet."""
    root = root or data_root()
    path = _order_path(root, dept)
    if not path.is_file():
        return []
    doc = read_json(path)
    if "order" not in doc:
        return []
    seq = doc["order"]
    if not isinstance(seq, list) or not all(isinstance(p, str) for p in seq):
        raise ValueError(f"{path}: 'order' must be a list of process id strings")
    return list(seq)


def active_ids(dept, root=None):
    """Every non-tombstoned process id in the department, in id order."""
    root = root or data_root()
    d = root / "departments" / dept / "processes"
    if not d.is_dir():
        return []
    rx = re.compile(rf"^{re.escape(dept)}-\d{{3}}$")
    out = []
    for f in sorted(d.glob("*.json")):
        if not rx.match(f.stem):
            continue
        if read_json(f).get("tombstoned"):
            continue
        out.append(f.stem)
    return out


def departments(root=None):
    """The department codes, in registry order."""
    root = root or data_root()
    reg = read_json(root / "departments" / "registry.json")
    try:
        return [d["code"] for d in reg["departments"]]
    except (KeyError, TypeError) as e:
        raise ValueError(f"malformed registry.json: {e}") from e


def _dedup(seq):
    seen = set()
    return [p for p in seq if not (p in seen or seen.add(p))]


def _write(dept, sequence, now, root):
    doc = {"department": dept, "order": list(sequence), "updated_at": now}
    validate("order.schema.json", doc)
    write_json_atomic(_order_path(root, dept), doc)
    return doc["order"]


def reconcile(dept, now, root=None, heir_hints=None, child_hints=None):
    """Bring order.json in line with disk. Returns (appended, dropped).

    Appends actives that are missing from the file and drops ids that are
    tombstoned or gone. Idempotent, so it is safe to call after every merge
    verb. `heir_hints` and `child_hints` refine *where* new ids land; see
    Task 4 / design §3.1.
    """
    root = root or data_root()
    actives = active_ids(dept, root)
    known = set(actives)
    raw = read_order(dept, root)
    stored = _dedup(raw)
    was = set(stored)

    work = list(stored)
    present = set(work)
    missing = [pid for pid in actives if pid not in present]
    work.extend(missing)

    seq = [pid for pid in work if pid in known]
    dropped = [pid for pid in stored if pid not in known]
    appended = [pid for pid in seq if pid not in was]

    path = _order_path(root, dept)
    # Lazy: a department with no processes and no file yet stays fileless (ARD §4.6).
    if not seq and not path.is_file():
        return [], []
    # Don't churn updated_at when nothing changed. Compared against the RAW file
    # contents, not the de-duplicated view, so a hand-edited duplicate still heals.
    if seq == raw and path.is_file():
        return [], []
    _write(dept, seq, now, root)
    return appended, dropped


def set_order(dept, sequence, now, root=None):
    """Replace the whole sequence; refuse anything but the exact active set."""
    root = root or data_root()
    actives = active_ids(dept, root)
    given = list(sequence)
    seen = set(given)
    if len(seen) != len(given):
        raise OrderMismatch("set mismatch: duplicate ids in sequence")
    known = set(actives)
    missing = [p for p in actives if p not in seen]
    stale = [p for p in given if p not in known]
    if missing or stale:
        raise OrderMismatch(
            f"set mismatch: missing={','.join(missing) or '-'} "
            f"stale={','.join(stale) or '-'}")
    return _write(dept, given, now, root)


def move(dept, pid, to, now, root=None):
    """Move `pid` to 1-based position `to`, shifting the rest."""
    root = root or data_root()
    seq = _dedup(read_order(dept, root))
    if pid not in seq:
        raise ValueError(f"{pid} is not in {dept}'s order")
    if not 1 <= to <= len(seq):
        raise ValueError(f"position {to} is out of range 1..{len(seq)}")
    seq.remove(pid)
    seq.insert(to - 1, pid)
    return _write(dept, seq, now, root)


def check(dept, root=None):
    """(missing, stale) — an empty pair means the file equals the active set."""
    root = root or data_root()
    actives = active_ids(dept, root)
    stored = read_order(dept, root)
    have = set(stored)
    known = set(actives)
    return ([p for p in actives if p not in have],
            [p for p in stored if p not in known])
```

- [ ] **Step 4: Register the package so imports resolve**

In `engine/pyproject.toml`, add `"order*"` to `[tool.setuptools.packages.find]`'s `include` list, keeping alphabetical order:

```toml
include = ["engine_common*", "allocate_id*", "extract_attachment*", "layout*", "merge*", "order*", "transcribe*", "validate*"]
```

Then reinstall so the new package is importable:

```bash
uv pip install -q --python .venv/bin/python -e ./engine
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_order.py -q`
Expected: PASS, 29 passed.

- [ ] **Step 6: Commit**

```bash
git add engine/order/__init__.py engine/pyproject.toml engine/tests/test_order.py
git commit -m "feat(engine): order module — read, active set, reconcile, set, move, check"
```

---

### Task 4: Placement hints — heirs inherit position, children follow their parent

Implements D7 and D8. Hints are advisory: they only affect ids not already in the sequence, and a hint naming something absent falls through to the append rule, so a hint can never corrupt the file.

**Files:**
- Modify: `engine/order/__init__.py` (the `reconcile` body)
- Test: `engine/tests/test_order_hints.py`

**Interfaces:**
- Consumes: `reconcile` from Task 3.
- Produces: the hint contract used by Task 6 — `heir_hints: {heir_id: [superseded_id, …]}`, `child_hints: {parent_id: [child_id, …]}`.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_order_hints.py`:

```python
import json

from order import reconcile, read_order, set_order

NOW = "2026-07-25T12:00:00Z"


def _proc(root, pid, tombstoned=False):
    dept = pid.rsplit("-", 1)[0]
    d = root / "departments" / dept / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": dept}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def _seed(root, ids):
    for pid in ids:
        _proc(root, pid)
    reconcile("cooking", NOW, root=root)
    set_order("cooking", ids, NOW, root=root)


def test_heir_takes_its_predecessors_position(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    _proc(data_root, "cooking-002", tombstoned=True)
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-004": ["cooking-002"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-003"]


def test_heir_uses_the_lowest_index_not_the_lowest_id(data_root):
    # curated order puts 003 before 001, so 003 is the "earliest" predecessor
    _seed(data_root, ["cooking-003", "cooking-002", "cooking-001"])
    for pid in ("cooking-001", "cooking-003"):
        _proc(data_root, pid, tombstoned=True)
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-004": ["cooking-001", "cooking-003"]})
    assert read_order("cooking", data_root) == ["cooking-004", "cooking-002"]


def test_several_heirs_of_one_predecessor_land_consecutively_in_id_order(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    _proc(data_root, "cooking-002", tombstoned=True)
    _proc(data_root, "cooking-005")
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-005": ["cooking-002"],
                          "cooking-004": ["cooking-002"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-005", "cooking-003"]


def test_heir_hint_for_an_unknown_predecessor_appends(data_root):
    _seed(data_root, ["cooking-001", "cooking-002"])
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-004": ["cooking-099"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-002", "cooking-004"]


def test_heir_hint_never_moves_an_id_already_in_the_order(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-003": ["cooking-001"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-002", "cooking-003"]


def test_new_child_lands_after_its_parent(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-001": ["cooking-004"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-002", "cooking-003"]


def test_several_children_follow_their_parent_in_id_order(data_root):
    _seed(data_root, ["cooking-001", "cooking-002"])
    _proc(data_root, "cooking-005")
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-001": ["cooking-005", "cooking-004"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-005", "cooking-002"]


def test_child_hint_for_an_absent_parent_appends(data_root):
    _seed(data_root, ["cooking-001"])
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-099": ["cooking-004"]})
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-004"]


def test_hints_do_not_stop_unhinted_ids_from_appending(data_root):
    _seed(data_root, ["cooking-001", "cooking-002"])
    _proc(data_root, "cooking-003")
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-001": ["cooking-004"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-002", "cooking-003"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_order_hints.py -q`
Expected: FAIL — the hint tests fail because `reconcile` currently appends everything; e.g. `test_heir_takes_its_predecessors_position` gets `['cooking-001', 'cooking-003', 'cooking-004']`.

- [ ] **Step 3: Implement the hint passes**

In `engine/order/__init__.py`, add this helper immediately above `reconcile`:

```python
def _lowest_index(work, candidates):
    idxs = [work.index(c) for c in candidates if c in work]
    return min(idxs) if idxs else None
```

Then replace these four lines in `reconcile`:

```python
    work = list(stored)
    present = set(work)
    missing = [pid for pid in actives if pid not in present]
    work.extend(missing)
```

with:

```python
    # Insertions happen on `work`, which still holds the ids about to be dropped,
    # so a heir can be placed at its predecessor's index before that id leaves.
    work = list(stored)
    present = set(work)
    missing = [pid for pid in actives if pid not in present]

    # Pass 1 — a heir inherits the lowest index held by anything it supersedes.
    # Sorted by heir id so several heirs of one predecessor land consecutively and
    # deterministically: each insert shifts the predecessor right, so the next
    # heir lands just after the previous one.
    for heir in sorted(heir_hints or {}):
        if heir not in missing:
            continue
        at = _lowest_index(work, heir_hints[heir])
        if at is None:
            continue
        work.insert(at, heir)
        missing.remove(heir)

    # Pass 2 — a new sub-process sits directly after its parent.
    for parent in sorted(child_hints or {}):
        if parent not in work:
            continue
        at = work.index(parent) + 1
        for child in sorted(child_hints[parent]):
            if child not in missing:
                continue
            work.insert(at, child)
            at += 1
            missing.remove(child)

    # Pass 3 — anything still unplaced goes to the end, in id order.
    work.extend(missing)
```

- [ ] **Step 4: Run both order test files to verify they pass**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_order.py engine/tests/test_order_hints.py -q`
Expected: PASS, 38 passed (29 from Task 3 + 9 hint tests). (Task 3's tests must still pass — hints default to `None`, so the no-hint path is unchanged.)

- [ ] **Step 5: Commit**

```bash
git add engine/order/__init__.py engine/tests/test_order_hints.py
git commit -m "feat(engine): order placement hints — heirs inherit position, children follow parent"
```

---

### Task 5: The `order` CLI

**Files:**
- Create: `engine/order/cli.py`
- Modify: `engine/pyproject.toml` (`[project.scripts]`)
- Test: `engine/tests/test_order_cli.py`

**Interfaces:**
- Consumes: everything from Tasks 3–4.
- Produces: the `order` console script with verbs `show`, `sync [--all]`, `set --sequence`, `move --process --to`, `check [--all]`; `--now` on every mutating verb. Exit 2 on any precondition failure. `set`'s stderr on a mismatch starts with `set mismatch:` — Task 7's backend depends on that prefix.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_order_cli.py`:

```python
import json

import pytest
from order.cli import main

NOW = "2026-07-25T12:00:00Z"


def _proc(root, pid, tombstoned=False):
    dept = pid.rsplit("-", 1)[0]
    d = root / "departments" / dept / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": dept}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def _registry(root, codes):
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": c, "name": c} for c in codes]}), encoding="utf-8")


def _order(root, dept):
    p = root / "departments" / dept / "order.json"
    return json.loads(p.read_text(encoding="utf-8"))["order"] if p.is_file() else None


def test_sync_prints_appended_and_dropped(data_root, capsys):
    _proc(data_root, "cooking-001")
    assert main(["sync", "cooking", "--now", NOW]) == 0
    assert capsys.readouterr().out == "+cooking-001\n"
    _proc(data_root, "cooking-001", tombstoned=True)
    _proc(data_root, "cooking-002")
    assert main(["sync", "cooking", "--now", NOW]) == 0
    assert capsys.readouterr().out == "+cooking-002\n-cooking-001\n"


def test_show_prints_one_id_per_line(data_root, capsys):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    main(["sync", "cooking", "--now", NOW])
    capsys.readouterr()
    assert main(["show", "cooking"]) == 0
    assert capsys.readouterr().out == "cooking-001\ncooking-002\n"


def test_show_on_a_missing_file_prints_nothing(data_root, capsys):
    assert main(["show", "cooking"]) == 0
    assert capsys.readouterr().out == ""


def test_set_replaces_the_sequence(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    main(["sync", "cooking", "--now", NOW])
    assert main(["set", "cooking", "--sequence", "cooking-002,cooking-001",
                 "--now", NOW]) == 0
    assert _order(data_root, "cooking") == ["cooking-002", "cooking-001"]


def test_set_mismatch_exits_2_with_the_prefix(data_root, capsys):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    with pytest.raises(SystemExit) as e:
        main(["set", "cooking", "--sequence", "cooking-001", "--now", NOW])
    assert e.value.code == 2
    assert capsys.readouterr().err.startswith("set mismatch:")


def test_move_reorders(data_root):
    for n in (1, 2, 3):
        _proc(data_root, f"cooking-00{n}")
    main(["sync", "cooking", "--now", NOW])
    assert main(["move", "cooking", "--process", "cooking-003", "--to", "1",
                 "--now", NOW]) == 0
    assert _order(data_root, "cooking")[0] == "cooking-003"


def test_move_out_of_range_exits_2(data_root):
    _proc(data_root, "cooking-001")
    main(["sync", "cooking", "--now", NOW])
    with pytest.raises(SystemExit) as e:
        main(["move", "cooking", "--process", "cooking-001", "--to", "5",
              "--now", NOW])
    assert e.value.code == 2


def test_check_is_silent_and_zero_when_consistent(data_root, capsys):
    _proc(data_root, "cooking-001")
    main(["sync", "cooking", "--now", NOW])
    capsys.readouterr()
    assert main(["check", "cooking"]) == 0
    out_err = capsys.readouterr()
    assert out_err.out == ""
    assert out_err.err == ""


def test_check_exits_2_and_reports_drift(data_root, capsys):
    _proc(data_root, "cooking-001")
    main(["sync", "cooking", "--now", NOW])
    _proc(data_root, "cooking-002")
    with pytest.raises(SystemExit) as e:
        main(["check", "cooking"])
    assert e.value.code == 2
    assert "missing: cooking-002" in capsys.readouterr().err


def test_sync_all_walks_the_registry(data_root):
    _registry(data_root, ["cooking", "dining", "logistics"])
    _proc(data_root, "cooking-001")
    _proc(data_root, "dining-001")
    assert main(["sync", "--all", "--now", NOW]) == 0
    assert _order(data_root, "cooking") == ["cooking-001"]
    assert _order(data_root, "dining") == ["dining-001"]
    # a department with no processes gets no file
    assert _order(data_root, "logistics") is None


def test_check_all_exits_2_if_any_department_drifts(data_root):
    _registry(data_root, ["cooking", "dining"])
    _proc(data_root, "cooking-001")
    _proc(data_root, "dining-001")
    main(["sync", "--all", "--now", NOW])
    _proc(data_root, "dining-002")
    with pytest.raises(SystemExit) as e:
        main(["check", "--all"])
    assert e.value.code == 2


def test_sync_without_department_or_all_exits_2(data_root):
    with pytest.raises(SystemExit) as e:
        main(["sync"])
    assert e.value.code == 2


def test_sync_all_exits_2_on_missing_registry(data_root, capsys):
    with pytest.raises(SystemExit) as e:
        main(["sync", "--all"])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "registry" in err
    assert "registry.json" in err


def test_check_all_exits_2_on_missing_registry(data_root, capsys):
    with pytest.raises(SystemExit) as e:
        main(["check", "--all"])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "registry" in err
    assert "registry.json" in err


def test_sync_with_both_department_and_all_exits_2(data_root, capsys):
    with pytest.raises(SystemExit) as e:
        main(["sync", "cooking", "--all"])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "mutually exclusive" in err
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_order_cli.py -q`
Expected: FAIL — collection error, `ModuleNotFoundError: No module named 'order.cli'`.

- [ ] **Step 3: Write the CLI**

Create `engine/order/cli.py`:

```python
import argparse
import sys
from datetime import datetime, timezone

from order import (OrderMismatch, check, departments, move, read_order,
                   reconcile, set_order)


def _now(v):
    return v or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _targets(args):
    return departments() if args.all else [args.department]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="order")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sh = sub.add_parser("show")
    sh.add_argument("department")

    sy = sub.add_parser("sync")
    sy.add_argument("department", nargs="?")
    sy.add_argument("--all", action="store_true")
    sy.add_argument("--now")

    st = sub.add_parser("set")
    st.add_argument("department")
    st.add_argument("--sequence", required=True,
                    help="comma-separated process ids, in the wanted order")
    st.add_argument("--now")

    mv = sub.add_parser("move")
    mv.add_argument("department")
    mv.add_argument("--process", required=True)
    mv.add_argument("--to", type=int, required=True, help="1-based position")
    mv.add_argument("--now")

    ck = sub.add_parser("check")
    ck.add_argument("department", nargs="?")
    ck.add_argument("--all", action="store_true")

    args = ap.parse_args(argv)
    if args.cmd in ("sync", "check"):
        if args.all and args.department:
            print("order: --all and a department name are mutually exclusive",
                  file=sys.stderr)
            raise SystemExit(2)
        if not args.all and not args.department:
            print("order: give a department or --all", file=sys.stderr)
            raise SystemExit(2)

    try:
        if args.cmd == "show":
            for pid in read_order(args.department):
                print(pid)
        elif args.cmd == "sync":
            for dept in _targets(args):
                appended, dropped = reconcile(dept, _now(args.now))
                for pid in appended:
                    print(f"+{pid}")
                for pid in dropped:
                    print(f"-{pid}")
        elif args.cmd == "set":
            seq = [s for s in args.sequence.split(",") if s]
            set_order(args.department, seq, _now(args.now))
        elif args.cmd == "move":
            move(args.department, args.process, args.to, _now(args.now))
        else:  # check
            drifted = False
            for dept in _targets(args):
                missing, stale = check(dept)
                if missing or stale:
                    drifted = True
                    print(f"{dept} missing: {','.join(missing) or '-'} "
                          f"stale: {','.join(stale) or '-'}", file=sys.stderr)
            if drifted:
                raise SystemExit(2)
    except OrderMismatch as e:
        # message already starts with "set mismatch:" — the UI backend keys on it
        print(str(e), file=sys.stderr)
        raise SystemExit(2)
    except FileNotFoundError as e:
        print(f"order: registry not found: {e.filename}", file=sys.stderr)
        raise SystemExit(2)
    except ValueError as e:
        print(f"order: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Note: `OrderMismatch` subclasses `ValueError`, so its `except` clause must come first. `FileNotFoundError` is an `OSError`, unrelated to `ValueError`, so its position relative to the other two `except` clauses does not matter.

- [ ] **Step 4: Register the console script**

In `engine/pyproject.toml`, add to `[project.scripts]`, keeping alphabetical order:

```toml
order = "order.cli:main"
```

Then reinstall so the `order` command appears on PATH:

```bash
uv pip install -q --python .venv/bin/python -e ./engine
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_order_cli.py -q`
Expected: PASS, 15 passed.

- [ ] **Step 6: Verify the console script works end to end**

```bash
.venv/bin/order --help
```
Expected: usage listing the subcommands `show`, `sync`, `set`, `move`, `check`.

- [ ] **Step 7: Commit**

```bash
git add engine/order/cli.py engine/pyproject.toml engine/tests/test_order_cli.py
git commit -m "feat(engine): order CLI — show/sync/set/move/check"
```

---

## Phase 3 — merge keeps the order in sync

### Task 6: The reconcile hook in `merge`

**Files:**
- Modify: `engine/merge/cli.py`
- Test: `engine/tests/test_merge_order.py`

**Interfaces:**
- Consumes: `order.reconcile` (Tasks 3–4); the existing `merge` verb functions.
- Produces: no new public API — after any `merge` invocation, `order.json` equals the active set for every department it touched.

Note on `new`: the parent and its auto-created children are all absent from the order, and ids are minted monotonically (parent first), so plain id-order appending already yields parent-then-children. No hints are needed for that verb.

- [ ] **Step 1: Write the failing test**

Create `engine/tests/test_merge_order.py`. The `_cand`/`_committed` helpers mirror
`engine/tests/test_merge_restructure.py`, and `tests/fixtures/candidate.json` carries no
`subprocesses`, so no auto-created child muddies an assertion that did not ask for one.
Deltas are built inline by `_delta`, grounded in the nodes `_committed` actually leaves on
disk — `tests/fixtures/delta.json` is a *schema* fixture whose node ids belong to no
process on disk, and `build_update` skips unknown ids silently, so reusing it would let an
"order unchanged" assertion pass for the wrong reason:

```python
import copy
import json

from conftest import load_fixture
from merge.cli import main
from order import read_order, reconcile

RUN = "runs/cooking-2026-07-25"
NOW = "2026-07-25T12:00:00Z"


def _cand(name="heir"):
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["process_name"] = name
    return c


def _cand_file(tmp_path, name, seq=1):
    p = tmp_path / f"cand-{seq}.json"
    p.write_text(json.dumps(_cand(name), ensure_ascii=False), encoding="utf-8")
    return str(p)


def _proc_path(root, pid):
    return (root / "departments" / pid.rsplit("-", 1)[0] / "processes"
            / f"{pid}.json")


def _committed(root, pid, pending=False):
    """An existing standalone process on disk, copied from the golden fixture."""
    dept = pid.rsplit("-", 1)[0]
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = pid
    p["department"] = dept
    p["parent"] = None
    p["nodes"] = [n for n in p["nodes"] if n["id"] != "cooking-001-n060"]
    for n in p["nodes"]:
        if n["id"] not in ("start", "end"):
            n["id"] = n["id"].replace("cooking-001", pid)
    p["edges"] = [e for e in p["edges"]
                  if "cooking-001-n060" not in (e["from"], e["to"])]
    for e in p["edges"]:
        e["from"] = e["from"].replace("cooking-001", pid)
        e["to"] = e["to"].replace("cooking-001", pid)
    p["pending"] = [{"node": f"{pid}-n010", "field": "actor",
                     "current": "کارپرداز", "proposed": "انباردار",
                     "source": RUN, "status": "open"}] if pending else []
    _proc_path(root, pid).write_text(json.dumps(p, ensure_ascii=False),
                                     encoding="utf-8")
    return p


def _delta(pid):
    """A minimal update grounded in what `_committed` actually leaves on disk.

    Built inline rather than from `tests/fixtures/delta.json`: that fixture is a
    schema fixture whose node ids are not grounded in any process, and
    `build_update` skips unknown ids silently, so a shared fixture would make an
    "order unchanged" assertion pass for the wrong reason.
    """
    return {
        "add_nodes": [
            {"key": "n1", "type": "activity", "label": "کنترل کیفیت",
             "description": "", "actor": "انباردار",
             "icom": {"inputs": [], "controls": [], "outputs": [],
                      "mechanisms": []},
             "subprocess": None},
        ],
        "add_edges": [{"from": f"{pid}-n010", "to": "n1", "label": ""}],
        "enrich_nodes": [],
        "flag_removed": [],
    }


def _delta_file(tmp_path, doc):
    p = tmp_path / "delta.json"
    p.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return str(p)


def _write_order(root, dept, ids):
    """A curated order.json placed directly on disk, bypassing the order API."""
    path = root / "departments" / dept / "order.json"
    path.write_text(json.dumps({"department": dept, "order": list(ids),
                                "updated_at": NOW}, ensure_ascii=False),
                    encoding="utf-8")


def test_new_appends_the_process(data_root, tmp_path):
    assert main(["new", "--candidate", _cand_file(tmp_path, "الف"),
                 "--department", "cooking", "--run", RUN, "--now", NOW]) == 0
    assert read_order("cooking", data_root) == ["cooking-001"]


def test_new_twice_appends_in_creation_order(data_root, tmp_path):
    main(["new", "--candidate", _cand_file(tmp_path, "الف", 1),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    main(["new", "--candidate", _cand_file(tmp_path, "ب", 2),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-002"]


def test_remove_drops_the_tombstoned_process(data_root, tmp_path):
    main(["new", "--candidate", _cand_file(tmp_path, "الف", 1),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    main(["new", "--candidate", _cand_file(tmp_path, "ب", 2),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    assert main(["remove", "--process", "cooking-001", "--run", RUN,
                 "--now", NOW]) == 0
    assert read_order("cooking", data_root) == ["cooking-002"]


def test_update_leaves_the_order_untouched(data_root, tmp_path):
    _committed(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    before = read_order("cooking", data_root)
    delta = _delta_file(tmp_path, _delta("cooking-001"))
    assert main(["update", "--process", "cooking-001", "--delta", delta,
                 "--run", RUN, "--now", NOW]) == 0
    # a plain update creates no sub-process, so the active set is what it was
    assert read_order("cooking", data_root) == before


def test_update_puts_a_new_subprocess_right_after_its_parent(data_root, tmp_path):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    reconcile("cooking", NOW, root=data_root)

    d = _delta("cooking-001")
    d["add_subprocesses"] = [{"parent": "cooking-001-n010",
                              "process": _cand("child")}]
    assert main(["update", "--process", "cooking-001",
                 "--delta", _delta_file(tmp_path, d),
                 "--run", RUN, "--now", NOW]) == 0

    # the child follows its parent instead of landing at the end, which is only
    # possible because `update` passes child_hints to the sync
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-002", "cooking-003"]


def test_attach_subprocess_reconciles_without_reordering(data_root):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    # a curated order: 002 deliberately ahead of 001, and 003 not listed yet
    _write_order(data_root, "cooking", ["cooking-002", "cooking-001"])

    assert main(["attach-subprocess", "--parent-process", "cooking-001",
                 "--node", "cooking-001-n010", "--child", "cooking-002",
                 "--run", RUN, "--now", NOW]) == 0

    # both ids were already active, so neither moves — 002 stays ahead of the
    # parent it just became a child of — and the sync only appends the unlisted 003
    assert read_order("cooking", data_root) == [
        "cooking-002", "cooking-001", "cooking-003"]


def test_accept_reconciles_without_reordering(data_root):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid, pending=(pid == "cooking-001"))
    # same curated order, same drift: 003 is active on disk but unlisted
    _write_order(data_root, "cooking", ["cooking-002", "cooking-001"])

    assert main(["accept", "--process", "cooking-001", "--index", "0",
                 "--now", NOW]) == 0

    # resolving a pending row changes no process's active state, so the curated
    # positions survive; only the unlisted 003 is appended by the sync
    assert read_order("cooking", data_root) == [
        "cooking-002", "cooking-001", "cooking-003"]


def test_restructure_heir_takes_the_predecessors_position(data_root, tmp_path):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    reconcile("cooking", NOW, root=data_root)
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-002", "cooking-003"]

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(
        {"department": "cooking",
         "heirs": [{"candidate": _cand("merged"),
                    "supersedes": ["cooking-002"],
                    "subprocess_links": []}]}, ensure_ascii=False), encoding="utf-8")
    assert main(["restructure", "--plan", str(plan), "--run", RUN, "--now", NOW]) == 0

    # cooking-004 is the fresh heir id — this fixture has no .id-seq.json, so
    # allocate_id._next_ordinal derives it from the process directory scan — and
    # it must sit where its predecessor cooking-002 was, not at the end
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-003"]


def test_restructure_split_puts_both_heirs_at_the_predecessors_position(data_root, tmp_path):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    reconcile("cooking", NOW, root=data_root)

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(
        {"department": "cooking",
         "heirs": [{"candidate": _cand("part-a"), "supersedes": ["cooking-002"],
                    "subprocess_links": []},
                   {"candidate": _cand("part-b"), "supersedes": ["cooking-002"],
                    "subprocess_links": []}]}, ensure_ascii=False), encoding="utf-8")
    assert main(["restructure", "--plan", str(plan), "--run", RUN, "--now", NOW]) == 0

    # both heirs land consecutively where cooking-002 was, in id order
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-005", "cooking-003"]


def test_restructure_across_departments_reconciles_both(data_root, tmp_path):
    (data_root / "departments" / "prep" / "processes").mkdir(parents=True)
    _committed(data_root, "cooking-001")
    _committed(data_root, "prep-001")
    reconcile("cooking", NOW, root=data_root)
    reconcile("prep", NOW, root=data_root)
    assert read_order("prep", data_root) == ["prep-001"]

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(
        {"department": "cooking",
         "heirs": [{"candidate": _cand("merged"),
                    "supersedes": ["prep-001"],
                    "subprocess_links": []}]}, ensure_ascii=False), encoding="utf-8")
    assert main(["restructure", "--plan", str(plan), "--run", RUN, "--now", NOW]) == 0

    # the heir's position hint names a predecessor in another department, which is
    # a safe no-op: cooking appends the heir at the end...
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-002"]
    # ...while prep, the other touched department, drops the superseded id
    assert read_order("prep", data_root) == []


def test_a_corrupt_order_file_never_fails_the_merge(data_root, tmp_path, capsys):
    """Exit 2 means "nothing happened"; a written merge must never report it."""
    (data_root / "departments" / "cooking" / "order.json").write_text(
        "{ this is not json", encoding="utf-8")

    assert main(["new", "--candidate", _cand_file(tmp_path, "الف"),
                 "--department", "cooking", "--run", RUN, "--now", NOW]) == 0

    assert _proc_path(data_root, "cooking-001").is_file()
    cap = capsys.readouterr()
    assert cap.out.splitlines()[0] == "cooking-001"
    assert "cooking" in cap.err and "order sync cooking" in cap.err
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_merge_order.py -q`
Expected: FAIL — `read_order` returns `[]` because `merge` does not touch `order.json` yet.

- [ ] **Step 3: Add the hook to `merge/cli.py`**

Add to the imports at the top:

```python
from order import reconcile as reconcile_order
```

`_proc_path` re-implemented the department derivation inline; give it a name and reuse it,
then add the sync helper below. Replace the existing `_proc_path` with:

```python
def _dept_of(pid):
    return pid.rsplit("-", 1)[0]


def _proc_path(pid):
    return data_root() / "departments" / _dept_of(pid) / "processes" / f"{pid}.json"


def _sync_order(depts, now, heir_hints=None, child_hints=None):
    """Keep each touched department's order.json equal to its active set (§4.6).

    A failure here warns on stderr and lets the merge stand; it must never
    propagate. By the time we reach the sync the process files are written and
    the id ledger has advanced, so raising would let the `except ValueError` in
    `main` report a *fully applied* merge as exit 2 — this CLI's "precondition
    failed, nothing happened" code (see `_require`). A pipeline that retries on
    exit 2 would then re-run the verb and mint a duplicate process. Every
    realistic failure lands there: a corrupt order.json (`json.JSONDecodeError`
    is a `ValueError`), `read_order`'s malformed-shape `ValueError`, and
    `validate`'s.

    order.json is derived state — `order sync <dept>` rebuilds it from disk, and
    an unreadable one can simply be deleted first — so a warning still leaves a
    complete recovery path. It has to, because the hook widened merge's read
    surface: `active_ids` reads *every* process file in the department, so
    without this one corrupt sibling would make every merge verb in that
    department fatal.
    """
    for dept in sorted(depts):
        try:
            reconcile_order(dept, now, heir_hints=heir_hints, child_hints=child_hints)
        except (ValueError, OSError) as e:
            print(f"merge: warning: the merge is applied but {dept}'s order.json "
                  f"could not be synced: {e}\n"
                  f"merge: run `order sync {dept}` to rebuild it; order.json is "
                  f"derived state, so deleting an unreadable one first is safe",
                  file=sys.stderr)
```

The helper deliberately swallows its own failures. By the time it runs the process files
are written and the id ledger has advanced, so letting a `ValueError` reach `main`'s
handler would report a *fully applied* merge as exit 2 — this CLI's "precondition failed,
nothing happened" code — and a caller that retries on exit 2 would mint a duplicate
process. `order.json` is derived state, so a warning is a complete recovery path.

Hoist the clock so the process files and `order.json` cannot land a second apart when
`--now` is omitted. Immediately after `args = ap.parse_args(argv)`:

```python
    # One clock for the whole invocation: the process files and order.json must
    # not land a second apart when --now is omitted.
    now = _now(args.now)
```

Then, inside the `try:` block, replace every remaining `_now(args.now)` with `now` and add
a sync call at the end of each verb's branch.

`new` — after the existing `for c in children: print(...)` loop:

```python
            _sync_order({args.department}, now)
```

`update` — after its `for c in children: print(...)` loop. The departments and the child
hint come from the ids actually written, not from the CLI argument:

```python
            depts = ({_dept_of(parent["id"])}
                     | {_dept_of(c["id"]) for c in children})
            _sync_order(depts, now,
                        child_hints={parent["id"]: [c["id"] for c in children]})
```

`remove` — after `print(f"tombstoned {args.process}")`:

```python
            _sync_order({_dept_of(args.process)}, now)
```

`restructure` — after the final `for h in heirs:` loop:

```python
            # a heir inherits the position of the earliest process it supersedes
            heir_hints = {}
            for t in tombstoned:
                for heir in t.get("superseded_by", []):
                    heir_hints.setdefault(heir, []).append(t["id"])
            depts = ({_dept_of(h["id"]) for h in heirs}
                     | {_dept_of(t["id"]) for t in tombstoned})
            _sync_order(depts, now, heir_hints=heir_hints)
```

`attach-subprocess` — after `print(f"subprocess {child['id']} node {args.node}")`:

```python
            _sync_order({_dept_of(args.parent_process), _dept_of(args.child)}, now)
```

`accept | reject` — after `write_json_atomic(path, proc)`:

```python
            _sync_order({_dept_of(args.process)}, now)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `PYTHONPATH=engine/tests .venv/bin/python -m pytest engine/tests/test_merge_order.py -q`
Expected: PASS, 11 passed.

- [ ] **Step 5: Run the whole Python suite for regressions**

Run: `make test`
Expected: PASS — all pre-existing `merge` tests included. If a pre-existing merge test now fails because no `registry.json` exists in its fixture, note that `_sync_order` never reads the registry (only `--all` does), so investigate rather than weakening the hook.

- [ ] **Step 6: Commit**

```bash
git add engine/merge/cli.py engine/tests/test_merge_order.py
git commit -m "feat(engine): merge keeps order.json in sync after every verb"
```

---

## Phase 4 — `ui-backend`

### Task 7: `PUT /api/departments/{code}/order`

**Files:**
- Modify: `ui-backend/inja_ui_backend/storage.py`
- Modify: `ui-backend/inja_ui_backend/engine.py`
- Modify: `ui-backend/inja_ui_backend/routers/departments.py`
- Test: `ui-backend/tests/test_order.py`

**Interfaces:**
- Consumes: the `order` CLI (Task 5) via `PATH`; `set` failing with stderr starting `set mismatch:`.
- Produces:
  - `storage.order_path(root, code) -> Path`
  - `engine.order_set(cfg, code, sequence: list[str]) -> None`
  - `engine.order_sync(cfg, code) -> None`
  - `PUT /api/departments/{code}/order`, body `{"order": [ids]}` → `200 {"order": [ids]}`; `404` unknown department, `409` set mismatch, `422` bad body or schema failure.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_order.py`:

```python
import json
import subprocess

import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _auth_client(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def _clone(data_root, pid):
    """Copy the seeded cooking-001 to a second id so the department has two."""
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    for n in doc["nodes"]:
        if n["id"].startswith("cooking-001-"):
            n["id"] = n["id"].replace("cooking-001-", f"{pid}-")
    doc["edges"] = [{**e,
                     "from": e["from"].replace("cooking-001-", f"{pid}-"),
                     "to": e["to"].replace("cooking-001-", f"{pid}-")}
                    for e in doc["edges"]]
    doc["pending"] = []
    (src.parent / f"{pid}.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _order_on_disk(data_root):
    p = data_root / "departments" / "cooking" / "order.json"
    return json.loads(p.read_text(encoding="utf-8"))["order"] if p.is_file() else None


def test_put_order_saves_and_returns(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-002", "cooking-001"]})
    assert r.status_code == 200
    assert r.json() == {"order": ["cooking-002", "cooking-001"]}
    assert _order_on_disk(data_root) == ["cooking-002", "cooking-001"]


def test_put_order_commits_the_file(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    log = subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                          "HEAD"], capture_output=True, text=True).stdout
    assert "ui-edit(cooking): update process order" in log
    assert "departments/cooking/order.json" in log


def test_put_order_missing_id_is_409(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    assert r.status_code == 409
    assert "set mismatch" in r.json()["detail"]


def test_put_order_stale_id_is_409(data_root):
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-001", "cooking-099"]})
    assert r.status_code == 409


def test_put_order_bad_body_is_422(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/cooking/order",
                 json={"order": "cooking-001"}).status_code == 422
    assert c.put("/api/departments/cooking/order",
                 json={"order": [1, 2]}).status_code == 422


def test_put_order_unknown_department_is_404(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/nope/order",
                 json={"order": []}).status_code == 404


def test_put_order_requires_auth(data_root):
    c = TestClient(create_app(cfg_for(data_root)))
    assert c.put("/api/departments/cooking/order",
                 json={"order": []}).status_code == 401
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_order.py -q`
Expected: FAIL — every request returns 405/404 because the route does not exist.

- [ ] **Step 3: Add `order_path` to `storage.py`**

Insert after `overview_path`:

```python
def order_path(root: Path, code: str) -> Path:
    return Path(root) / "departments" / code / "order.json"
```

- [ ] **Step 4: Add the engine wrappers**

In `ui-backend/inja_ui_backend/engine.py`, insert after `peek_process_id`:

```python
def order_set(cfg: Settings, code: str, sequence: list[str]) -> None:
    """Replace a department's process order (ARD §4.6).

    Raises EngineError; its `.message` starts with "set mismatch:" when the
    given sequence is not exactly the department's active set.
    """
    _run(cfg, ["order", "set", code, "--sequence", ",".join(sequence)])


def order_sync(cfg: Settings, code: str) -> None:
    """Reconcile a department's order.json with what is on disk."""
    _run(cfg, ["order", "sync", code])
```

- [ ] **Step 5: Add the route**

In `ui-backend/inja_ui_backend/routers/departments.py`, insert after `put_overview`:

```python
@router.put("/{code}/order")
async def put_order(code: str, body: dict, request: Request,
                    _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")
    sequence = body.get("order")
    if not isinstance(sequence, list) or not all(isinstance(s, str) for s in sequence):
        raise HTTPException(status_code=422,
                            detail="order must be a list of process ids")
    path = storage.order_path(cfg.data_root, code)
    async with storage.file_lock(path):
        try:
            engine.order_set(cfg, code, sequence)
        except engine.EngineError as e:
            # a drifted active set is a conflict, not a bad request
            status = 409 if e.message.startswith("set mismatch") else 422
            raise HTTPException(status_code=status, detail=e.message)
        gitcommit.commit(cfg, [path], code, "update process order")
    return {"order": sequence}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_order.py -q`
Expected: PASS, 7 passed.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/storage.py ui-backend/inja_ui_backend/engine.py \
        ui-backend/inja_ui_backend/routers/departments.py ui-backend/tests/test_order.py
git commit -m "feat(ui-backend): PUT /departments/{code}/order with 409 on set drift"
```

---

### Task 8: Ordered `GET /processes`, and order sync on create/delete

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/departments.py` (`list_processes`)
- Modify: `ui-backend/inja_ui_backend/routers/processes.py` (`create_process`, `delete_process`)
- Modify: `ui-backend/inja_ui_backend/gitcommit.py` (`commit` skips a path that is
  absent from disk *and* untracked — the department that drops to zero actives
  without an `order.json` produces exactly that, see Step 6)
- Test: `ui-backend/tests/test_order.py` (append)
- Test: `ui-backend/tests/test_gitcommit.py` (append)

**Interfaces:**
- Consumes: `storage.order_path`, `engine.order_sync` (Task 7).
- Produces: `GET /api/departments/{code}/processes` returns ordered actives followed by tombstones in id order. This is the **only** implementation of the spec §2.1 fallback rule.

- [ ] **Step 1: Write the failing test**

Append to `ui-backend/tests/test_order.py` (and add `import logging` to its imports):

```python
def _write_order_by_hand(data_root, sequence):
    """An order.json the API would refuse to write — what the fallback rule is for."""
    p = data_root / "departments" / "cooking" / "order.json"
    p.write_text(json.dumps({"department": "cooking", "order": sequence,
                             "updated_at": "2026-07-25T00:00:00Z"},
                            ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _corrupt(path):
    path.write_text("{ not json", encoding="utf-8")


def _track(data_root):
    """Commit what is on disk, so a later deletion of it is a real staged change.

    `_clone` writes straight to disk, outside the git-backed write path.
    """
    subprocess.run(["git", "-C", str(data_root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(data_root), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-q", "-m", "clone"], check=True)


def _commit_count(data_root):
    return int(subprocess.run(["git", "-C", str(data_root), "rev-list", "--count",
                               "HEAD"], capture_output=True, text=True).stdout)


def _head(data_root):
    return subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                           "HEAD"], capture_output=True, text=True).stdout


def _tombstone(data_root, pid):
    p = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["tombstoned"] = True
    doc["superseded_by"] = []
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                 encoding="utf-8")


def test_processes_follow_the_curated_order(data_root):
    _clone(data_root, "cooking-002")
    _clone(data_root, "cooking-003")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-003", "cooking-001", "cooking-002"]})
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-003", "cooking-001", "cooking-002"]


def test_processes_fall_back_to_id_order_without_a_file(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-002"]


def test_processes_skip_an_id_the_disk_does_not_have(data_root):
    """PUT 409s on drift, so only a hand-edited file can carry a stale id."""
    _clone(data_root, "cooking-002")
    _write_order_by_hand(data_root, ["cooking-002", "cooking-404", "cooking-001"])
    c = _auth_client(data_root)
    r = c.get("/api/departments/cooking/processes")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == ["cooking-002", "cooking-001"]


def test_processes_keep_a_repeated_order_entry_once(data_root):
    """A hand-edited duplicate must not list the same process twice."""
    _clone(data_root, "cooking-002")
    _write_order_by_hand(data_root, ["cooking-002", "cooking-001", "cooking-002"])
    c = _auth_client(data_root)
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-002", "cooking-001"]


def test_unordered_actives_land_after_the_ordered_ones(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    # two unplaced ones, cloned in reverse id order, so the tail proves id order
    # rather than creation order
    _clone(data_root, "cooking-004")  # created behind the backend's back
    _clone(data_root, "cooking-003")
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-002", "cooking-001", "cooking-003", "cooking-004"]


def test_tombstones_come_last_in_id_order(data_root):
    _clone(data_root, "cooking-002")
    _clone(data_root, "cooking-003")
    _clone(data_root, "cooking-004")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-004", "cooking-001",
                          "cooking-002", "cooking-003"]})
    # two of them, tombstoned in the opposite order to their ids
    _tombstone(data_root, "cooking-004")
    _tombstone(data_root, "cooking-002")
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-003", "cooking-002", "cooking-004"]


def test_create_appends_to_the_order_in_one_commit(data_root):
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    before = _commit_count(data_root)
    r = c.post("/api/processes", json={"department": "cooking", "name": "نو"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert _order_on_disk(data_root) == ["cooking-001", new_id]
    # exactly one commit — the process and the order cannot have been committed
    # separately under the same action string
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert "departments/cooking/order.json" in log
    assert log.count("create process") == 1


def test_delete_drops_from_the_order_in_one_commit(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    before = _commit_count(data_root)
    assert c.delete("/api/processes/cooking-002").status_code == 200
    assert _order_on_disk(data_root) == ["cooking-001"]
    assert _commit_count(data_root) - before == 1
    assert "departments/cooking/order.json" in _head(data_root)


def test_create_survives_a_failed_order_sync(data_root, caplog):
    """A corrupt sibling poisons `order sync`; the creation must still stand.

    `reconcile` reads every process file in the department, so unguarded this
    500s *after* the new file is on disk and the id ledger has advanced — and
    the retry would then mint the next id and orphan the first.
    """
    _corrupt(data_root / "departments" / "cooking" / "processes" / "cooking-009.json")
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    with caplog.at_level(logging.WARNING):
        r = c.post("/api/processes", json={"department": "cooking", "name": "نو"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert f"ui-edit({new_id}): create process" in log
    assert f"{new_id}.json" in log
    assert _order_on_disk(data_root) is None          # unsynced, so uncommitted
    assert "cooking's order.json could not be synced" in caplog.text


def test_delete_survives_a_failed_order_sync(data_root, caplog):
    """The same guard on the delete path, reached through a corrupt order.json.

    A corrupt sibling *process* file cannot exercise it here: `delete_process`
    reads every sibling itself to unlink references, well before the sync.
    """
    _clone(data_root, "cooking-002")
    _track(data_root)
    _corrupt(data_root / "departments" / "cooking" / "order.json")
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    with caplog.at_level(logging.WARNING):
        assert c.delete("/api/processes/cooking-002").status_code == 200
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert "ui-edit(cooking-002): delete process" in log
    assert "cooking-002.json" in log
    assert "cooking's order.json could not be synced" in caplog.text


def test_delete_of_the_last_process_needs_no_order_file(data_root):
    """The lazy-file case gitcommit's skip exists for (ARD §4.6).

    cooking-001 is the department's only process and there is no order.json; the
    order module writes none for a department that drops to zero actives without
    one, so the path handed to git is absent *and* untracked.
    """
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    assert c.delete("/api/processes/cooking-001").status_code == 200
    assert _order_on_disk(data_root) is None
    assert _commit_count(data_root) - before == 1
    assert "ui-edit(cooking-001): delete process" in _head(data_root)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_order.py -q`
Expected: FAIL on the new tests — `test_processes_follow_the_curated_order` gets id order, and the create/delete tests find the order unchanged.

- [ ] **Step 3: Make `list_processes` order-aware**

In `ui-backend/inja_ui_backend/routers/departments.py`, replace `list_processes` with:

```python
@router.get("/{code}/processes")
def list_processes(code: str, request: Request, _: str = Depends(require_session)):
    """Processes in curated order (ARD §4.6), tombstones last in id order.

    The only implementation of the fallback rule: ids the order does not know
    are appended in id order, ids it names but disk does not have are skipped,
    and a repeated id is kept once. In a consistent data-repo the fallback
    contributes nothing — it is here so a hand-edited or not-yet-migrated repo
    degrades instead of hiding (or doubling) processes.
    """
    cfg = request.app.state.cfg
    docs = {p.stem: storage.read_json(p)
            for p in storage.list_process_files(cfg.data_root, code)}
    actives = sorted(pid for pid, d in docs.items() if not d.get("tombstoned"))
    tombs = sorted(pid for pid, d in docs.items() if d.get("tombstoned"))

    order = []
    opath = storage.order_path(cfg.data_root, code)
    if opath.is_file():
        order = storage.read_json(opath).get("order", [])

    known = set(actives)
    # dict.fromkeys keeps the first occurrence of a hand-edited duplicate, in place
    seq = list(dict.fromkeys(pid for pid in order if pid in known))
    placed = set(seq)
    seq += [pid for pid in actives if pid not in placed]
    return [docs[pid] for pid in seq + tombs]
```

- [ ] **Step 4: Sync the order on create**

`order.json` is derived state, so a failed sync must never cost the caller the
write that is already on disk. Add `import logging` and a module-level
`logger = logging.getLogger(__name__)` to
`ui-backend/inja_ui_backend/routers/processes.py`, and the shared guard both
verbs use — the same reasoning as merge's `_sync_order` (`engine/merge/cli.py`,
commit 43d1397):

```python
def _sync_order(cfg, dept: str, written: list) -> None:
    """Reconcile `dept`'s order.json (ARD §4.6) and stage it — best effort.

    Mirrors merge's `_sync_order` (engine/merge/cli.py) and for the same reason.
    By the time a caller reaches this point the process file is already written
    or already unlinked and the id ledger has advanced, so letting the
    EngineError out would answer a *fully applied* change with a 500 and commit
    nothing: the user's retry mints the next id and orphans the first. And
    `reconcile` reads **every** process file in the department, so without this
    one unreadable sibling would poison every create and delete there.

    order.json is derived state — `order sync <dept>` rebuilds it from disk, and
    an unreadable one can simply be deleted first — so warning and leaving the
    file out of `written` still leaves a complete recovery path.
    """
    try:
        engine.order_sync(cfg, dept)
    except engine.EngineError as e:
        logger.warning("the change is applied but %s's order.json could not be "
                       "synced: %s", dept, e.message)
        return
    written.append(storage.order_path(cfg.data_root, dept))
```

Then, inside `create_process`, replace this block:

```python
        action = (f"create sub-process of {body.parent['process']}"
                  if body.parent else "create process")
        gitcommit.commit(cfg, written, pid, action)
```

with:

```python
        # keep the department's order.json equal to its active set (ARD §4.6),
        # in the same commit as the creation itself
        _sync_order(cfg, body.department, written)
        action = (f"create sub-process of {body.parent['process']}"
                  if body.parent else "create process")
        gitcommit.commit(cfg, written, pid, action)
```

- [ ] **Step 5: Sync the order on delete**

In `delete_process`, replace:

```python
    gitcommit.commit(cfg, written, pid, "delete process")
```

with:

```python
    # a permanently deleted process leaves the order (ARD §4.6)
    _sync_order(cfg, storage.dept_of(pid), written)
    gitcommit.commit(cfg, written, pid, "delete process")
```

- [ ] **Step 6: Let `gitcommit` skip a path git cannot stage**

`delete_process` names the department's `order.json` unconditionally, and the
order module deliberately writes no file for a department that drops to zero
actives without one (Task 3's lazy creation). Deleting the last process in such
a department therefore hands `commit` a path that is absent from disk *and*
never tracked: it matches no pathspec, `git add` aborts on it, and the whole
commit fails — HTTP 500 *after* the process file is already unlinked. Skip
those paths, and name them in a warning so the diagnostic is not lost.

In `ui-backend/inja_ui_backend/gitcommit.py` add `import logging` and a
module-level `logger = logging.getLogger(__name__)`, then replace `commit` with:

```python
def commit(cfg: Settings, paths: list[Path], pid: str, action: str) -> None:
    # A path git can't stage — absent from disk *and* never tracked — has no
    # pathspec `git add` can match, and would abort the whole add, failing a
    # commit for the paths that *do* have something to record. It happens on a
    # real path: `delete_process` always names the department's order.json, and
    # the order module deliberately writes no file for a department that drops
    # to zero actives without one (ARD §4.6) — so deleting the last process in
    # such a department reaches here with an absent, untracked order.json, after
    # the process file is already unlinked. Skip those, and say which.
    stageable, skipped = [], []
    for p in paths:
        (stageable if p.exists() or _tracked(cfg, p) else skipped).append(p)
    if skipped:
        logger.warning("git: nothing to stage for %s — absent and untracked",
                       ", ".join(str(p) for p in skipped))
    if stageable:
        r = _git(cfg, "add", "--", *[str(p) for p in stageable])
        if r.returncode != 0:
            raise RuntimeError(f"git add failed: {(r.stderr or r.stdout).strip()}")
    # nothing staged -> genuine no-op (not an error)
    if _git(cfg, "diff", "--cached", "--quiet").returncode == 0:
        return
    msg = f"ui-edit({pid}): {action}"
    r = _git(cfg, "-c", f"user.name={cfg.git_author_name}",
             "-c", f"user.email={cfg.git_author_email}",
             "commit", "-q", "-m", msg)
    if r.returncode != 0:
        raise RuntimeError(f"git commit failed: {(r.stderr or r.stdout).strip()}")
```

Append to `ui-backend/tests/test_gitcommit.py`, before
`test_commit_raises_on_git_failure` (which must keep passing unchanged — genuine
git failures still raise):

```python
def _status(root):
    """The name-status lines of HEAD, e.g. ["M\tdepartments/.../x.json"]."""
    out = subprocess.run(["git", "-C", str(root), "show", "--name-status",
                          "--format=", "HEAD"], capture_output=True, text=True).stdout
    return [ln for ln in out.splitlines() if ln.strip()]


def _names(root):
    return [ln.split("\t", 1)[1] for ln in _status(root)]
```

```python
def test_commit_skips_an_absent_untracked_path(data_root):
    """The production case: delete's order.json for a department that has none.

    The absent, never-tracked path has no pathspec `git add` can match; it must
    be skipped, and the paths beside it in the same call must still commit.
    """
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    doc = storage.read_json(p)
    doc["name"] = "نام تازه"
    storage.write_json_atomic(p, doc)
    ghost = storage.order_path(data_root, "cooking")   # never written, never tracked
    assert not ghost.exists()
    gitcommit.commit(cfg, [p, ghost], "cooking-001", "save")
    assert "ui-edit(cooking-001): save" in _log(data_root).splitlines()[0]
    assert _names(data_root) == ["departments/cooking/processes/cooking-001.json"]
    assert not ghost.exists()


def test_commit_stages_the_deletion_of_a_tracked_path(data_root):
    """Absent from disk but tracked is not "nothing to stage" — it is a deletion."""
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    p.unlink()
    gitcommit.commit(cfg, [p], "cooking-001", "delete process")
    assert "ui-edit(cooking-001): delete process" in _log(data_root).splitlines()[0]
    assert _status(data_root) == ["D\tdepartments/cooking/processes/cooking-001.json"]
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `.venv/bin/pytest ui-backend/tests/test_order.py ui-backend/tests/test_gitcommit.py -q`
Expected: PASS, 24 passed (18 in `test_order.py`, 6 in `test_gitcommit.py`).

- [ ] **Step 8: Run the whole Python suite for regressions**

Run: `make test`
Expected: PASS. `ui-backend/tests/test_processes_read.py` and `test_departments.py` assert on the process list — if one breaks it is because it assumed filename order, which is now curated order. With no `order.json` in the fixture the two coincide, so any failure is a real bug, not a stale assumption.

- [ ] **Step 9: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/departments.py \
        ui-backend/inja_ui_backend/routers/processes.py \
        ui-backend/inja_ui_backend/gitcommit.py \
        ui-backend/tests/test_order.py ui-backend/tests/test_gitcommit.py
git commit -m "feat(ui-backend): ordered process list; create/delete keep order in sync"
```

---

## Phase 5 — UI

### Task 9: `useSaveOrder` hook and the order type

**Files:**
- Modify: `ui/src/api/types.ts`
- Modify: `ui/src/api/hooks.ts`
- Test: `ui/src/api/hooks.order.test.tsx`

**Interfaces:**
- Consumes: `PUT /api/departments/{code}/order` (Task 7); `fetchJson` and `ApiError` from `../api/client`.
- Produces:
  - `type DepartmentOrder = { order: string[] }` exported from `api/types`
  - `useSaveOrder(code: string)` — a mutation taking `DepartmentOrder`, invalidating `['processes', code]` on settle (success **and** failure, so a 409 refreshes the list).

- [ ] **Step 1: Write the failing test**

Create `ui/src/api/hooks.order.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { createWrapper } from '../test/utils'
import { useSaveOrder } from './hooks'
import { ApiError } from './client'

afterEach(() => vi.restoreAllMocks())

describe('useSaveOrder', () => {
  it('PUTs the sequence to the department order endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-002', 'cooking-001'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-002', 'cooking-001'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/order',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ order: ['cooking-002', 'cooking-001'] }) }))
  })

  it('invalidates the processes query after a 200', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-002', 'cooking-001'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-002', 'cooking-001'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['processes', 'cooking'] })
  })

  it('surfaces a 409 as an ApiError with that status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-003 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-001'] })
    await waitFor(() => expect(result.current.isError).toBe(true))
    const err = result.current.error as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
  })

  it('invalidates the processes query after a 409 too, because it settles on onSettled not onSuccess', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-003 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-001'] })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['processes', 'cooking'] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/api/hooks.order.test.tsx`
Expected: FAIL — `useSaveOrder` is not exported from `./hooks`.

- [ ] **Step 3: Add the type**

Append to `ui/src/api/types.ts`:

```ts
export type DepartmentOrder = { order: string[] }
```

- [ ] **Step 4: Add the hook**

In `ui/src/api/hooks.ts`, add `DepartmentOrder` to the `import type { … } from './types'` list, then append:

```ts
export function useSaveOrder(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DepartmentOrder) =>
      fetchJson<DepartmentOrder>(`/api/departments/${code}/order`, { method: 'PUT', body: JSON.stringify(body) }),
    // onSettled, not onSuccess: a 409 means the active set moved, so the list
    // must refresh on failure too
    onSettled: () => qc.invalidateQueries({ queryKey: ['processes', code] }),
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/api/hooks.order.test.tsx`
Expected: PASS, 4 passed.

- [ ] **Step 6: Commit**

```bash
git add ui/src/api/types.ts ui/src/api/hooks.ts ui/src/api/hooks.order.test.tsx
git commit -m "feat(ui): useSaveOrder mutation for department process order"
```

---

### Task 10: `ReorderModal`

**Files:**
- Create: `ui/src/write/ReorderModal.tsx`
- Test: `ui/src/write/ReorderModal.test.tsx`

**Interfaces:**
- Consumes: `useSaveOrder` (Task 9); `useToast` from `./ToastProvider`; `Button` from `../ui/Button`; `IdBadge` from `../ui/IdBadge`; `toFa` from `../lib/format`; `ApiError` from `../api/client`; `Process` from `../api/types`.
- Produces: `<ReorderModal department departmentName processes onClose />` where `processes: Process[]` is the already-ordered list from `useProcesses`. Tombstones are filtered out internally.

- [ ] **Step 1: Write the failing test**

Create `ui/src/write/ReorderModal.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReorderModal } from './ReorderModal'
import { ToastProvider } from './ToastProvider'
import type { Process } from '../api/types'

afterEach(() => vi.restoreAllMocks())

function proc(id: string, name: string, extra: Partial<Process> = {}): Process {
  return { id, department: 'cooking', name, summary: '', nodes: [], edges: [], pending: [],
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '2026-07-25T12:00:00Z', updated_at: '2026-07-25T12:00:00Z',
    ...extra } as Process
}

const PROCS = [
  proc('cooking-003', 'سه'),
  proc('cooking-001', 'یک'),
  proc('cooking-002', 'دو', { tombstoned: true }),
]

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

describe('ReorderModal', () => {
  it('lists active processes in the given order and excludes tombstones', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    expect(rows.map((r) => r.getAttribute('data-pid'))).toEqual(['cooking-003', 'cooking-001'])
    expect(screen.queryByText('دو')).not.toBeInTheDocument()
  })

  it('moves a row up with the up button', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('moves a row down with the down button', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به پایین' })[0])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('does not move the first row up or the last row down', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'انتقال به بالا' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'انتقال به پایین' })[1]).toBeDisabled()
  })

  it('reorders by drag and drop', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[1])
    fireEvent.dragOver(rows[0])
    fireEvent.drop(rows[0])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('PUTs the full sequence on save and closes', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-001', 'cooking-003'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1])
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/order',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ order: ['cooking-001', 'cooking-003'] }) }))
  })

  it('discards changes on cancel without any request', () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(onClose).toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows the drift notice on a 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-009 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    expect(await screen.findByText(/ترتیب تغییر کرده/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/write/ReorderModal.test.tsx`
Expected: FAIL — cannot resolve `./ReorderModal`.

- [ ] **Step 3: Write the modal**

Create `ui/src/write/ReorderModal.tsx`:

```tsx
import { useState } from 'react'
import { useSaveOrder } from '../api/hooks'
import { ApiError } from '../api/client'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import { toFa } from '../lib/format'
import type { Process } from '../api/types'

const ARROW_CLS = 'w-6 h-6 shrink-0 flex items-center justify-center rounded-lg border border-line text-violet disabled:opacity-30 disabled:cursor-default'

export function ReorderModal({ department, departmentName, processes, onClose }: {
  department: string
  departmentName: string
  processes: Process[]
  onClose: () => void
}) {
  // `processes` arrives already ordered from the backend; tombstones hold no position.
  const [seq, setSeq] = useState<Process[]>(() => processes.filter((p) => !p.tombstoned))
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const save = useSaveOrder(department)
  const toast = useToast()

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= seq.length) return
    const next = [...seq]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    setSeq(next)
  }

  function doSave() {
    save.mutate({ order: seq.map((p) => p.id) }, {
      onSuccess: () => { toast.show('ترتیب فرآیندها ذخیره شد'); onClose() },
      onError: (e) => toast.show(
        e instanceof ApiError && e.status === 409
          ? 'ترتیب تغییر کرده است؛ فهرست به‌روزرسانی شد. دوباره تلاش کنید.'
          : 'ذخیرهٔ ترتیب انجام نشد'),
    })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-50 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[560px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal flex flex-col max-h-[82vh]">
        <div className="px-[22px] py-5 bg-white border-b border-warm shrink-0">
          <div className="font-extrabold text-[17px] text-ink">ترتیب فرآیندهای {departmentName}</div>
          <div className="text-[12px] text-muted mt-0.5">{toFa(seq.length)} فرآیند · ردیف‌ها را بکشید و رها کنید یا از فلش‌ها استفاده کنید.</div>
        </div>

        <div className="p-[22px] overflow-auto flex-1">
          {seq.length === 0 && (
            <div className="text-center py-10 text-faint text-[13px]">فرآیندی برای ترتیب‌دادن وجود ندارد</div>
          )}
          <div className="flex flex-col gap-1.5">
            {seq.map((p, i) => (
              <div
                key={p.id}
                data-testid="reorder-row"
                data-pid={p.id}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null) }}
                onDragEnd={() => setDragFrom(null)}
                className={`bg-white border border-warm rounded-xl px-3 py-2 flex items-center gap-2.5 cursor-grab ${dragFrom === i ? 'border-coral shadow-coral' : ''}`}
              >
                <span className="text-faint text-[15px] leading-none select-none" aria-hidden>⣿</span>
                <span className="font-extrabold text-[12px] text-violet min-w-[20px] text-center">{toFa(i + 1)}</span>
                <IdBadge>{p.id}</IdBadge>
                <span className="font-bold text-[12.5px] text-ink flex-1 min-w-0 truncate">{p.name}</span>
                {p.parent && <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold text-[#B4690E] bg-[#FBEEDC] shrink-0">زیرفرآیند</span>}
                <button aria-label="انتقال به بالا" disabled={i === 0} onClick={() => moveTo(i, i - 1)} className={ARROW_CLS}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                </button>
                <button aria-label="انتقال به پایین" disabled={i === seq.length - 1} onClick={() => moveTo(i, i + 1)} className={ARROW_CLS}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-[22px] py-4 bg-white border-t border-warm flex gap-2.5 shrink-0">
          <Button variant="coral" onClick={doSave} disabled={save.isPending} className="flex-1 py-2.5 text-[13px]">ذخیرهٔ ترتیب</Button>
          <Button variant="ghost" onClick={onClose} className="flex-1 py-2.5 text-[13px]">انصراف</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/write/ReorderModal.test.tsx`
Expected: PASS, 8 passed.

If the `Process` type in the test's `proc()` helper does not compile, read `ui/src/api/types.ts` and match its actual `Process` shape rather than casting more aggressively.

- [ ] **Step 5: Commit**

```bash
git add ui/src/write/ReorderModal.tsx ui/src/write/ReorderModal.test.tsx
git commit -m "feat(ui): ReorderModal — compact drag/arrow panel for process order"
```

---

### Task 11: Wire the modal and position numbers into `ProcessList`

**Files:**
- Modify: `ui/src/screens/ProcessList.tsx`
- Test: `ui/src/screens/ProcessList.test.tsx` (append)

**Interfaces:**
- Consumes: `ReorderModal` (Task 10); the already-ordered `useProcesses(code)`.
- Produces: no new exports — a «ترتیب فرآیندها» button and a position number per active card.

- [ ] **Step 1: Write the failing test**

The existing `ui/src/screens/ProcessList.test.tsx` already defines a `PROCS` array (`cooking-001`,
`cooking-014`, and the tombstoned `cooking-002`, in that order) and a `mock()` helper that serves it
from any `/processes` URL. Reuse both — the backend returns the list already ordered, so `PROCS`
order *is* the curated order. Add `ToastProvider` to the render because `ReorderModal` uses
`useToast`.

Append to the imports at the top of the file:

```tsx
import { ToastProvider } from '../write/ToastProvider'
```

Then append these tests inside the existing `describe('ProcessList', …)` block:

```tsx
  it('numbers active processes in the order the API returned', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    expect(await screen.findByTestId('pos-cooking-001')).toHaveTextContent('۱')
    expect(screen.getByTestId('pos-cooking-014')).toHaveTextContent('۲')
  })

  it('gives a tombstoned process no position number', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.queryByTestId('pos-cooking-002')).not.toBeInTheDocument()
  })

  it('numbering ignores the search filter', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-014' } })
    // cooking-014 keeps position ۲ even though it is now the only visible row
    expect(screen.getByTestId('pos-cooking-014')).toHaveTextContent('۲')
  })

  // the modal calls useToast, so this one test wraps the screen in ToastProvider
  it('opens the reorder panel from the button', async () => {
    mock()
    renderAt('/departments/:code', <ToastProvider><ProcessList /></ToastProvider>, '/departments/cooking')
    fireEvent.click(await screen.findByRole('button', { name: 'ترتیب فرآیندها' }))
    expect(await screen.findByText(/ترتیب فرآیندهای/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-014'])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/screens/ProcessList.test.tsx`
Expected: FAIL — no `pos-*` test ids and no «ترتیب فرآیندها» button.

- [ ] **Step 3: Add the import and state**

In `ui/src/screens/ProcessList.tsx`, add to the imports:

```tsx
import { ReorderModal } from '../write/ReorderModal'
```

Add beside the existing `creating` state:

```tsx
  const [reordering, setReordering] = useState(false)
```

- [ ] **Step 4: Compute positions from the full ordered list**

Immediately after the existing `activityCount` declaration, add:

```tsx
  // Positions come from the full ordered list, not the filtered one, so searching
  // never renumbers. Tombstones hold no position (ARD §4.6).
  const orderPos = new Map<string, number>()
  procs.filter((p) => !p.tombstoned).forEach((p, i) => orderPos.set(p.id, i + 1))
```

- [ ] **Step 5: Add the button**

In the header's button row, insert before the «اطلاعات دپارتمان» button:

```tsx
            <Button variant="ghost" onClick={() => setReordering(true)} className="px-4 py-[11px] text-[13px]">ترتیب فرآیندها</Button>
```

- [ ] **Step 6: Render the position number on each card**

Inside the card, replace this line:

```tsx
                    <IdBadge>{p.id}</IdBadge>
```

with:

```tsx
                    {orderPos.has(p.id) && (
                      <span data-testid={`pos-${p.id}`} className="font-extrabold text-[12px] text-violet min-w-[18px] text-center shrink-0">{toFa(orderPos.get(p.id)!)}</span>
                    )}
                    <IdBadge>{p.id}</IdBadge>
```

- [ ] **Step 7: Render the modal**

Beside the existing `{creating && …}` line, add:

```tsx
      {reordering && <ReorderModal department={code} departmentName={dept?.name ?? ''} processes={procs} onClose={() => setReordering(false)} />}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/screens/ProcessList.test.tsx`
Expected: PASS.

- [ ] **Step 9: Run the full frontend suite and the linter**

```bash
cd ui && npm test && npx tsc --noEmit && npx eslint src
```
Expected: all pass. `ProcessList` must still render tombstones and its search must still work.

- [ ] **Step 10: Commit**

```bash
git add ui/src/screens/ProcessList.tsx ui/src/screens/ProcessList.test.tsx
git commit -m "feat(ui): process list shows order positions and opens the reorder panel"
```

---

## Phase 6 — `data-repo` agent awareness

### Task 12: Guard the file and document it for the runtime

**This task is in the `data-repo` repository, not `code-repo`.** `cd` to the `data-repo` checkout (`../data-repo` relative to `code-repo`) for every step, and commit there.

**Files:**
- Modify: `.claude/hooks/guard.py`
- Modify: `.claude/hooks/test_guard.py`
- Modify: `CLAUDE.md`
- Modify: `.claude/skills/process-voice/SKILL.md`
- Modify: `.claude/skills/edit-process/SKILL.md`

**Interfaces:**
- Consumes: the `order` CLI's existence (Task 5) — referenced in the denial messages and docs.
- Produces: `Write`/`Edit`/mutating-`Bash` against `departments/*/order.json` exits 2; reads still allowed; `overview.json` writes still allowed.

- [ ] **Step 1: Write the failing test**

Append to `.claude/hooks/test_guard.py`:

```python
def test_block_order_write(tmp_path):
    assert run(w("departments/cooking/order.json"), tmp_path) == 2


def test_block_order_write_absolute(tmp_path):
    assert run(w(str(tmp_path / "departments/cooking/order.json")), tmp_path) == 2


def test_block_order_bash_redirect(tmp_path):
    assert run(bash("echo '{}' > departments/cooking/order.json"), tmp_path) == 2


def test_block_order_bash_sed_in_place(tmp_path):
    assert run(bash("sed -i s/a/b/ departments/dining/order.json"), tmp_path) == 2


def test_allow_order_read_bash(tmp_path):
    assert run(bash("cat departments/cooking/order.json"), tmp_path) == 0


def test_allow_order_cli_bash(tmp_path):
    assert run(bash("DATA_ROOT=. order sync cooking"), tmp_path) == 0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `<code-repo>/.venv/bin/python -m pytest .claude/hooks/test_guard.py -q` (system python has no pytest)
Expected: FAIL — the four `test_block_order_*` tests return 0 instead of 2.

- [ ] **Step 3: Add the guard rules**

In `.claude/hooks/guard.py`, add next to the existing regexes:

```python
ORDER_CMD_RE = re.compile(r"departments/[^/\s'\"]+/order\.json")
ORDER_REL_RE = re.compile(r"departments/[^/]+/order\.json")
```

In `_check_write_path`, after the `PROCESSES_REL_RE` check:

```python
    if ORDER_REL_RE.fullmatch(rel):
        _deny(f"order.json is written only by the `order` CLI: {rel} (INV-1)")
```

In the `Bash` branch, after the `PROCESSES_CMD_RE` check:

```python
            if ORDER_CMD_RE.search(cmd):
                _deny("direct write to order.json is forbidden; use the `order` CLI (INV-1)")
```

Also update the module docstring's numbered list — item 1 becomes:

```
  1. No Write/Edit — or Bash redirect — to departments/**/processes/*.json
     (the merge CLI is the only sanctioned writer; its argv never spells the path)
     nor to departments/**/order.json (the order CLI is its only writer).
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `<code-repo>/.venv/bin/python -m pytest .claude/hooks/test_guard.py -q` (system python has no pytest)
Expected: PASS — including the pre-existing `test_allow_overview_write`, which must still return 0.

- [ ] **Step 5: Add the hard rule to `CLAUDE.md`**

In the "Hard rules (also hook-enforced)" list, insert after the `processes/*.json` bullet:

```markdown
- `departments/**/order.json` is written **only** by the `order` CLI — never hand-edit it. It holds
  the department's human-curated process order; read it when you need to know the sequence, but the
  `merge` CLI keeps it in sync by itself, so there is nothing for you to do.
```

- [ ] **Step 6: Note it in the `process-voice` skill**

In `.claude/skills/process-voice/SKILL.md`, at the end of the "### Stage 6 — merge (deterministic)" section, add:

```markdown
**Process order:** `merge` also maintains `departments/{department}/order.json` — the department's
curated process order (ARD §4.6) — appending new processes, dropping tombstoned ones, and giving a
restructure heir its predecessor's position. This is automatic and in-process: **do not** call the
`order` CLI, and never write that file yourself (hook-enforced). Stage 8's `git add departments`
commits it along with everything else.
```

- [ ] **Step 7: Note it in the `edit-process` skill**

In `.claude/skills/edit-process/SKILL.md`, add a matching short note wherever the skill lists what it may and may not write (read the file first and follow its existing structure):

```markdown
**Never write `departments/**/order.json`** — the department's process order is maintained by the
`order` CLI, and `merge` keeps it in sync automatically after every edit you make through it.
```

- [ ] **Step 8: Commit (in `data-repo`)**

```bash
git add .claude/hooks/guard.py .claude/hooks/test_guard.py CLAUDE.md \
        .claude/skills/process-voice/SKILL.md .claude/skills/edit-process/SKILL.md
git commit -m "feat(brain): order.json is read-only to the runtime, written only by the order CLI"
```

---

## Phase 7 — Migration

### Task 13: Backfill the existing departments

**This task writes to the real `data-repo`.** It needs the engine from Phase 2 installed and on PATH.

**Files:**
- Modify: `data-repo/departments/*/order.json` (created by the CLI, not by hand)

**Interfaces:**
- Consumes: the `order` CLI (Task 5).
- Produces: an `order.json` for every department that has processes, seeded in id order.

- [ ] **Step 1: Check the current state**

```bash
cd <code-repo> && DATA_ROOT=<data-repo> .venv/bin/order check --all; echo "exit=$?"
```
Expected: `exit=2` with a `missing:` line for `dining` and `cashier` (the departments that hold processes), because no `order.json` exists yet.

- [ ] **Step 2: Run the backfill**

```bash
DATA_ROOT=<data-repo> .venv/bin/order sync --all
```
Expected: a `+<id>` line per process — 31 for `dining`, plus `cashier`'s — and no `-` lines.

- [ ] **Step 3: Verify consistency**

```bash
DATA_ROOT=<data-repo> .venv/bin/order check --all; echo "exit=$?"
```
Expected: `exit=0`, no output.

- [ ] **Step 4: Verify the files against the schema**

```bash
for f in <data-repo>/departments/*/order.json; do
  DATA_ROOT=<data-repo> .venv/bin/validate order "$f"
done
```
Expected: one `OK: … conforms to order.schema.json` line per file. Departments with no processes have no file, which is correct (§4.6).

- [ ] **Step 5: Commit (in `data-repo`)**

```bash
cd <data-repo>
git add departments/*/order.json
git commit -m "chore(order): backfill department process order in id order"
```

- [ ] **Step 6: Confirm the UI shows the order**

Start the stack and open a department with processes. Expected: the list shows position numbers ۱…۳۱, «ترتیب فرآیندها» opens the panel, dragging a row and saving persists across a reload, and the tombstoned processes appear after the numbered ones with no number.

---

## Verification

Run before declaring the feature done:

```bash
cd <code-repo> && make test && make lint
cd <code-repo>/ui && npm test && npx tsc --noEmit && npx eslint src
cd <data-repo> && <code-repo>/.venv/bin/python -m pytest .claude/hooks/test_guard.py -q
cd <code-repo> && DATA_ROOT=<data-repo> .venv/bin/order check --all
```

All four must pass, the last with exit 0.
