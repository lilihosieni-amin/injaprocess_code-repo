# Set-Based Extraction — Phase 1: Engine + Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the deterministic engine everything the set-based / restructuring pipeline needs — a durable per-department id ledger, `delta.remove_edges` / `delta.revise_nodes` in `merge update`, and three new verbs `merge restructure` / `merge attach-subprocess` / `merge remove` (heirs + tombstones + full hierarchy redirect) — plus the schema changes (`process.superseded_by` / `tombstoned`, `delta.remove_edges` / `revise_nodes`, new `restructure.schema.json`, new `idseq.schema.json`) that back them. No LLM, no prompts, no UI: everything here is unit-testable Python + JSON Schema.

**Architecture:** Components communicate only through the filesystem (`data-repo` via `DATA_ROOT`); `merge` is the sole writer of `process.json`; the `allocate-id` CLI is the sole minter of ids. Agents emit JSON artifacts (candidate / delta / restructure plan) referencing ids they read verbatim; the deterministic engine validates against frozen schemas, allocates ids, lays out, and writes. Phase 1 changes only `code-repo/engine/**` and `code-repo/schemas/**`; it defines the **LOCKED CONTRACT** (function names + signatures + CLI verbs) that Phase 2 (orchestration + prompts) and Phase 3 (UI) build against — so the names below are verbatim.

**Tech Stack:** Python 3.11, pytest, JSON Schema (draft 2020-12); engine CLIs installed via `pip install -e engine`.

## Global Constraints

Binding invariants (design §4.9; ARD). Every task must preserve all of them:

- **INV-1 — only `allocate-id` mints ids.** Process ids come from `next_process_id`; node ids from `next_box_id`; junction ids from `next_junction_id`. Agents/plans never invent ids and never set `superseded_by`, `position`, `layout`, or `source`. The engine sets those.
- **INV-3 — no fabrication.** The engine copies values from its inputs; it never invents content.
- **INV-4 — never delete / never lose.** Committed process content is only ever tombstoned, never deleted, by the engine. `remove` = tombstone with no heir. (Edges are *structure*, not the content INV-4 protects, so `remove_edges` hard-deletes an edge — see §4.6.) The only hard delete of a process is a later, human-initiated UI action (Phase 3), never the engine.
- **`merge` is the sole writer of `process.json`.** All mutations flow through `merge/__init__.py`; the CLI reads, calls a pure builder, and writes atomically with `write_json_atomic`.
- **Schemas are draft 2020-12 with `additionalProperties: false`.** New optional fields are added to `properties` only; do not add them to `required` unless stated.
- **Id shapes:** processes `{dept}-NNN` (`^[a-z]+-[0-9]{3}$`), activity/terminal nodes `{pid}-nNNN` (`^[a-z]+-[0-9]{3}-n[0-9]{3}$`), junctions `{pid}-jN` (`^[a-z]+-[0-9]{3}-j[0-9]+$`). A process id is never reused, even after permanent delete (durable ledger, §4.8).
- **Determinism.** Given the same inputs the engine produces byte-identical output: id allocation, layout, redirect, and tombstoning are all deterministic engine code.

---

## Conventions carried from the existing engine (read before editing)

- Tests run from the repo root: `cd code-repo && python -m pytest engine/tests/<file> -q`. `conftest.py` provides the `data_root` fixture (a `tmp_path` `DATA_ROOT` with `departments/cooking/processes`, `meetings/…`, `runs/`) and `load_fixture(name)` reading from `code-repo/tests/fixtures/`.
- `engine_common` provides `data_root()`, `schema_dir()`, `read_json`, `write_json_atomic`, `validate(schema_name, instance)` (raises `ValueError` on mismatch), and `is_empty`.
- `layout` provides `full_relayout(process)` (overwrites *all* node positions, ignores manual), `local_relayout(process, from_index=0)` (re-flows but **skips `layout == "manual"` nodes**, preserving hand positions), and `topo_order(nodes, edges)`.
- `allocate_id.next_process_id(dept, root=None, reserved=())` — file-scan max; `reserved` bumps the counter for multi-allocation within one batch. `next_box_id` / `next_junction_id` scan a process's own nodes.
- `merge/__init__.py`: `_build_process(cand, dept, pid, run, now, parent, source_type) -> (process, keymap)` builds a full process (allocs node ids, maps edges, `full_relayout`). `_attach_subprocesses(...)` links children. `_touch(node, run)` appends `run` to `node["source"]["touched_by"]`. `_sync_icom(parent_node, child_idef0, run)` sets `parent_node["icom"] = child_idef0` and touches.
- `merge/cli.py`: `_proc_path(pid)` → `data_root()/departments/{dept}/processes/{pid}.json`; `_now(v)`; `_require(cond,msg)`; verbs `new` / `update` / `accept` / `reject`.
- `validate/cli.py` takes the schema name as a runtime argument and loads `schema_dir()/<name>.schema.json` on demand — **it does not enumerate schemas**, so there is nothing to "register"; a new schema file dropped into `schemas/` is usable immediately as `validate restructure <file>`. (No code change required there; noted so no one hunts for a registry.)

---

## File Structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `code-repo/schemas/process.schema.json` | Modified | add optional root `tombstoned` (bool) + `superseded_by` (array of process-ids); keep `additionalProperties:false`; do NOT add to `required`. |
| `code-repo/schemas/delta.schema.json` | Modified | add optional `remove_edges` (array of `{from,to}`) + `revise_nodes` (array of `{id, set}`). |
| `code-repo/schemas/restructure.schema.json` | **Created** | the restructure plan: `department`, `heirs[]` each `{candidate, supersedes[], subprocess_links[]}`. |
| `code-repo/schemas/idseq.schema.json` | **Created** | the durable id ledger `{ "process": int≥0 }` (optional validate target). |
| `code-repo/engine/allocate_id/__init__.py` | Modified | `next_process_id` now reads + persists `departments/{dept}/.id-seq.json`; `next = max(scan, ledger, reserved) + 1`, ledger only rises. |
| `code-repo/engine/merge/__init__.py` | Modified | `build_update` applies `revise_nodes` + `remove_edges`; new `tombstone`, `remove_process`, `restructure`, `attach_subprocess`. |
| `code-repo/engine/merge/cli.py` | Modified | new verbs `restructure`, `attach-subprocess`, `remove`; `update` unchanged signature. |
| `code-repo/engine/tests/test_id_ledger.py` | **Created** | ledger durability + monotonicity + in-batch reserved. |
| `code-repo/engine/tests/test_schema_restructure_tombstone.py` | **Created** | schema acceptance/rejection for the new fields + restructure/idseq schemas. |
| `code-repo/engine/tests/test_merge_edit_ops.py` | **Created** | `remove_edges` + `revise_nodes` behaviour in `build_update`. |
| `code-repo/engine/tests/test_merge_tombstone.py` | **Created** | `tombstone` / `remove_process` / `merge remove` CLI. |
| `code-repo/engine/tests/test_merge_restructure.py` | **Created** | `restructure()` core (heirs + tombstone), then hierarchy redirect + closure/cycle. |
| `code-repo/engine/tests/test_merge_attach.py` | **Created** | `attach_subprocess()` + `merge attach-subprocess` CLI. |

---

## Tasks

### Task 1 — Durable id ledger in `allocate-id`

Make process ids monotonic and never reused, even after a file is deleted, by persisting a per-department high-water mark. Keep the existing file-scan and in-batch `reserved=` behaviour.

**Files:**
- `code-repo/engine/allocate_id/__init__.py` (modify)
- `code-repo/engine/tests/test_id_ledger.py` (create)

**Interfaces:**
- **Consumes:** `engine_common.data_root`; `departments/{dept}/.id-seq.json` = `{"process": <int>}` (may be absent).
- **Produces (peek/mint split — resolves the preview-vs-mint conflict):**
  - `next_process_id(dept, root=None, reserved=()) -> str` — the **minter**. `next = max(file_scan_max, ledger_value, reserved_max) + 1`; **persist** `{"process": next}` to `departments/{dept}/.id-seq.json`; ledger only ever increases. `merge` already calls this, so real mints advance the high-water automatically. Signature unchanged; node/junction functions unchanged.
  - `peek_process_id(dept, root=None, reserved=()) -> str` — **stateless preview**. Same `max(file_scan_max, ledger_value, reserved_max) + 1` computation but **does NOT write** the ledger (repeatable). Used by `ui-backend`'s `/next-id` route and any "what id would be next" preview.
- **Cross-phase consumer fix (in scope for this task):** `ui-backend/inja_ui_backend/routers/departments.py`'s `/next-id` route must call `peek_process_id` (not `next_process_id`), so rendering the create form never burns an id. The pre-existing `engine/tests/test_allocate_id.py::test_reserved_ids_bump_the_counter` (which asserts stateless behaviour) moves to `peek_process_id`; `ui-backend/tests/test_departments.py::test_next_id_previews_allocation` passes once the route uses peek.

Steps:

- [ ] **Write failing test.** Create `code-repo/engine/tests/test_id_ledger.py`:
```python
import json

from allocate_id import next_process_id


def _ledger_path(root, dept):
    return root / "departments" / dept / ".id-seq.json"


def _write_proc(root, pid):
    p = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    p.write_text(json.dumps({"id": pid}), encoding="utf-8")


def test_ledger_bootstraps_from_file_scan(data_root):
    _write_proc(data_root, "cooking-001")
    _write_proc(data_root, "cooking-003")
    assert next_process_id("cooking", data_root) == "cooking-004"
    ledger = json.loads(_ledger_path(data_root, "cooking").read_text())
    assert ledger == {"process": 4}


def test_ledger_persists_and_only_increases(data_root):
    assert next_process_id("cooking", data_root) == "cooking-001"
    assert json.loads(_ledger_path(data_root, "cooking").read_text()) == {"process": 1}
    # a second alloc with the first file removed still advances (never reused)
    assert next_process_id("cooking", data_root) == "cooking-002"
    assert json.loads(_ledger_path(data_root, "cooking").read_text()) == {"process": 2}


def test_id_not_reused_after_delete(data_root):
    _write_proc(data_root, "cooking-001")
    assert next_process_id("cooking", data_root) == "cooking-002"          # ledger now 2
    (data_root / "departments/cooking/processes/cooking-001.json").unlink()  # permanent delete
    # scan would say 1, but the ledger holds the high-water mark
    assert next_process_id("cooking", data_root) == "cooking-003"


def test_ledger_ahead_of_scan_wins(data_root):
    _ledger_path(data_root, "cooking").write_text(json.dumps({"process": 9}))
    assert next_process_id("cooking", data_root) == "cooking-010"


def test_reserved_still_bumps_in_batch(data_root):
    assert next_process_id("cooking", data_root, reserved={"cooking-001"}) == "cooking-002"
    assert (
        next_process_id("cooking", data_root, reserved={"cooking-001", "cooking-002"})
        == "cooking-003"
    )
    # other dept ignored in reserved
    assert next_process_id("cooking", data_root, reserved={"dining-009"}) == "cooking-004"
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_id_ledger.py -q`
  Expected: FAILS. `test_ledger_bootstraps_from_file_scan` fails at the ledger read with `FileNotFoundError` (no `.id-seq.json` is written yet); the monotonic/delete tests fail with `AssertionError` because today's scan reuses `cooking-001` after deletion.

- [ ] **Add a peek (stateless) test.** In `test_id_ledger.py`, add:
```python
from allocate_id import peek_process_id


def test_peek_is_stateless_and_repeatable(data_root):
    _write_proc(data_root, "cooking-001")
    assert peek_process_id("cooking", data_root) == "cooking-002"
    assert peek_process_id("cooking", data_root) == "cooking-002"      # no advance
    assert not _ledger_path(data_root, "cooking").is_file()            # no ledger written
    # peek honours reserved without persisting
    assert peek_process_id("cooking", data_root, reserved={"cooking-002"}) == "cooking-003"
```
  Move the stateless `reserved` expectation off the minter: in `engine/tests/test_allocate_id.py`, change `test_reserved_ids_bump_the_counter` to import and call `peek_process_id` (not `next_process_id`) so it keeps asserting stateless behaviour.

- [ ] **Implement minimally.** Edit `code-repo/engine/allocate_id/__init__.py`. Add `import json`, a shared computation, a persisting `next_process_id`, and a stateless `peek_process_id`:
```python
import json
import re

from engine_common import data_root


def _id_seq_path(root, dept):
    return root / "departments" / dept / ".id-seq.json"


def _read_ledger(path):
    if path.is_file():
        try:
            return int(json.loads(path.read_text(encoding="utf-8")).get("process", 0))
        except (ValueError, OSError):
            return 0
    return 0


def _next_ordinal(dept, root, reserved):
    d = root / "departments" / dept / "processes"
    rx = re.compile(rf"^{re.escape(dept)}-(\d{{3}})$")
    mx = 0
    if d.is_dir():
        for f in d.glob("*.json"):
            m = rx.match(f.stem)
            if m:
                mx = max(mx, int(m.group(1)))
    for rid in reserved:
        m = rx.match(rid)
        if m:
            mx = max(mx, int(m.group(1)))
    return max(mx, _read_ledger(_id_seq_path(root, dept))) + 1


def peek_process_id(dept, root=None, reserved=()):
    """Stateless preview — does NOT persist the ledger."""
    root = root or data_root()
    return f"{dept}-{_next_ordinal(dept, root, reserved):03d}"


def next_process_id(dept, root=None, reserved=()):
    """Minter — allocates and persists the ledger high-water mark."""
    root = root or data_root()
    nxt = _next_ordinal(dept, root, reserved)
    ledger_path = _id_seq_path(root, dept)
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps({"process": nxt}) + "\n", encoding="utf-8")
    return f"{dept}-{nxt:03d}"
```
  (`_max_suffix` / `next_box_id` / `next_junction_id` stay exactly as they are.)

- [ ] **Point the preview consumer at peek.** In `code-repo/ui-backend/inja_ui_backend/routers/departments.py`, the `/next-id` route currently calls `next_process_id`; change that call to `peek_process_id` (and update the import). This keeps the create-form preview from burning an id on every render. Do not change anything else in that file.

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_id_ledger.py engine/tests/test_allocate_id.py ui-backend/tests/test_departments.py -q`
  Expected: all pass — the ledger + peek tests, the (now peek-based) stateless reserved test, and the ui-backend `/next-id` preview test.

- [ ] **Commit.**
```
git add engine/allocate_id/__init__.py engine/tests/test_id_ledger.py engine/tests/test_allocate_id.py ui-backend/inja_ui_backend/routers/departments.py
git commit -m "feat(engine): durable id ledger (mint) + peek_process_id (preview)

next_process_id persists a per-department high-water mark so process ids are
never reused, even after permanent delete. peek_process_id previews without
advancing; ui-backend /next-id uses peek so rendering the form burns no id.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 — `process.schema.json`: `tombstoned` + `superseded_by`; `idseq.schema.json`

Add the two optional root fields a tombstone carries, and the ledger schema. Keep `additionalProperties:false`; do not touch `required`.

**Files:**
- `code-repo/schemas/process.schema.json` (modify)
- `code-repo/schemas/idseq.schema.json` (create)
- `code-repo/engine/tests/test_schema_restructure_tombstone.py` (create; extended in Task 7)

**Interfaces:**
- **Produces:** `process.schema.json` accepts optional `"tombstoned": boolean` and `"superseded_by": [ "{dept}-NNN", … ]`; a process without them still validates. `idseq.schema.json` = `{ "process": int≥0 }`, `additionalProperties:false`.

Steps:

- [ ] **Write failing test.** Create `code-repo/engine/tests/test_schema_restructure_tombstone.py`:
```python
import copy

import pytest
from conftest import load_fixture
from engine_common import validate


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_process_without_tombstone_fields_still_valid():
    validate("process.schema.json", _proc())  # optional fields absent -> OK


def test_process_accepts_tombstoned_and_superseded_by():
    p = _proc()
    p["tombstoned"] = True
    p["superseded_by"] = ["cooking-007", "cooking-008"]
    validate("process.schema.json", p)


def test_superseded_by_rejects_bad_id_shape():
    p = _proc()
    p["superseded_by"] = ["cooking7"]           # not {dept}-NNN
    with pytest.raises(ValueError):
        validate("process.schema.json", p)


def test_process_rejects_unknown_root_field():
    p = _proc()
    p["bogus"] = 1
    with pytest.raises(ValueError):
        validate("process.schema.json", p)      # additionalProperties:false intact


def test_idseq_schema_accepts_ledger():
    validate("idseq.schema.json", {"process": 4})


def test_idseq_schema_rejects_negative_and_extra():
    with pytest.raises(ValueError):
        validate("idseq.schema.json", {"process": -1})
    with pytest.raises(ValueError):
        validate("idseq.schema.json", {"process": 1, "extra": True})
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_schema_restructure_tombstone.py -q`
  Expected: `test_process_accepts_tombstoned_and_superseded_by` FAILS (extra properties rejected by `additionalProperties:false`); the two `idseq` tests FAIL with `FileNotFoundError` (schema does not exist yet).

- [ ] **Implement minimally.** In `code-repo/schemas/process.schema.json`, add two keys to the root `properties` object (after `"pending"`, before the closing `}` of `properties`):
```json
    "pending": { "type": "array", "items": { "$ref": "#/$defs/pending" } },
    "tombstoned": { "type": "boolean" },
    "superseded_by": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" }
    }
```
  Create `code-repo/schemas/idseq.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "idseq.schema.json",
  "title": "Per-department id ledger (design §4.8)",
  "type": "object",
  "additionalProperties": false,
  "required": ["process"],
  "properties": {
    "process": { "type": "integer", "minimum": 0 }
  }
}
```

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_schema_restructure_tombstone.py -q`
  Expected: all 6 pass.

- [ ] **Commit.**
```
git add schemas/process.schema.json schemas/idseq.schema.json engine/tests/test_schema_restructure_tombstone.py
git commit -m "feat(schemas): process.tombstoned/superseded_by + idseq ledger schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 — `delta.schema.json`: `remove_edges` + `revise_nodes`

Add the two optional delta arrays the edit ops consume. Optional (not in `required`) so existing deltas still validate.

**Files:**
- `code-repo/schemas/delta.schema.json` (modify)
- `code-repo/engine/tests/test_merge_edit_ops.py` (create; extended in Tasks 4–5)

**Interfaces:**
- **Produces:** `delta.schema.json` accepts optional `"remove_edges": [ {from,to} ]` (`additionalProperties:false`, `required:[from,to]`) and `"revise_nodes": [ {id, set} ]` (`required:[id,set]`, `set` an object).

Steps:

- [ ] **Write failing test.** Create `code-repo/engine/tests/test_merge_edit_ops.py`:
```python
import copy

import pytest
from conftest import load_fixture
from engine_common import validate

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _empty_delta(**over):
    d = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": []}
    d.update(over)
    return d


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_delta_accepts_remove_edges_and_revise_nodes():
    validate("delta.schema.json", _empty_delta(
        remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}],
        revise_nodes=[{"id": "cooking-001-n010", "set": {"label": "x"}}],
    ))


def test_delta_still_valid_without_new_fields():
    validate("delta.schema.json", _empty_delta())


def test_remove_edges_rejects_extra_key():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(
            remove_edges=[{"from": "a", "to": "b", "oops": 1}]))


def test_revise_nodes_requires_id_and_set():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(revise_nodes=[{"id": "x"}]))
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_merge_edit_ops.py -q`
  Expected: `test_delta_accepts_remove_edges_and_revise_nodes` FAILS (`additionalProperties:false` rejects the new keys); `test_remove_edges_rejects_extra_key` / `test_revise_nodes_requires_id_and_set` FAIL because with no schema for the arrays the deltas containing them are already rejected wholesale (wrong reason) — after the fix they must pass for the *right* reason.

- [ ] **Implement minimally.** In `code-repo/schemas/delta.schema.json`, add two keys to the root `properties` (after the `"add_subprocesses"` block, before the closing `}` of `properties`):
```json
    "add_subprocesses": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["parent", "process"],
        "properties": {
          "parent": { "type": "string" },
          "process": { "$ref": "#/$defs/candidateNoSub" }
        }
      }
    },
    "remove_edges": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["from", "to"],
        "properties": { "from": { "type": "string" }, "to": { "type": "string" } }
      }
    },
    "revise_nodes": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "set"],
        "properties": { "id": { "type": "string" }, "set": { "type": "object" } }
      }
    }
```

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_merge_edit_ops.py -q`
  Expected: all 4 pass.

- [ ] **Commit.**
```
git add schemas/delta.schema.json engine/tests/test_merge_edit_ops.py
git commit -m "feat(schemas): delta.remove_edges + delta.revise_nodes (optional)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 — `build_update` applies `remove_edges` (edge hygiene + re-layout)

Drop every edge whose `{from,to}` matches a `remove_edges` entry, then re-flow while preserving manual node positions. This is a hard edge delete (edges are structure, not INV-4 content).

**Files:**
- `code-repo/engine/merge/__init__.py` (modify `build_update`)
- `code-repo/engine/tests/test_merge_edit_ops.py` (extend)

**Interfaces:**
- **Consumes:** `delta.get("remove_edges", [])` — list of `{from,to}`.
- **Produces:** `build_update(process, delta, run, now, root=None) -> (process, children)` (unchanged signature) additionally removes matching edges and re-lays out. Application order within `build_update`: `add_nodes`, `add_edges`, `enrich_nodes`, **revise_nodes** (Task 5), **remove_edges**, `flag_removed`, subprocesses.

Steps:

- [ ] **Write failing test.** Append to `code-repo/engine/tests/test_merge_edit_ops.py`:
```python
from merge import apply_delta


def test_remove_edges_drops_only_matching_edge():
    p = _proc()
    before = len(p["edges"])
    delta = _empty_delta(remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}])
    apply_delta(p, delta, RUN, NOW)
    assert len(p["edges"]) == before - 1
    assert not any(e["from"] == "cooking-001-n010" and e["to"] == "cooking-001-j1"
                   for e in p["edges"])
    # a non-matching edge survives
    assert any(e["from"] == "start" and e["to"] == "cooking-001-n010" for e in p["edges"])


def test_remove_edges_noop_when_absent():
    p = _proc()
    before = len(p["edges"])
    apply_delta(p, _empty_delta(remove_edges=[{"from": "no", "to": "such"}]), RUN, NOW)
    assert len(p["edges"]) == before


def test_remove_edges_preserves_manual_position():
    p = _proc()
    manual = next(n for n in p["nodes"] if n.get("layout") == "manual")  # cooking-001-n060
    pos = dict(manual["position"])
    apply_delta(p, _empty_delta(
        remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}]), RUN, NOW)
    manual2 = next(n for n in p["nodes"] if n["id"] == manual["id"])
    assert manual2["position"] == pos
    validate("process.schema.json", p)
    assert p["updated_at"] == NOW
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_merge_edit_ops.py -q`
  Expected: the three new tests FAIL — `test_remove_edges_drops_only_matching_edge` fails `len == before - 1` because `build_update` ignores `remove_edges` today.

- [ ] **Implement minimally.** In `code-repo/engine/merge/__init__.py`, edit `build_update`. After the `enrich_nodes` loop and before the `flag_removed` loop, insert the `remove_edges` handling (the `revise_nodes` block from Task 5 will land just above it). Then re-flow if edges changed:
```python
    # ... existing enrich_nodes loop ends here ...

    removed_any_edge = False
    drop = {(e["from"], e["to"]) for e in delta.get("remove_edges", [])}
    if drop:
        kept = [e for e in process["edges"] if (e["from"], e["to"]) not in drop]
        removed_any_edge = len(kept) != len(process["edges"])
        process["edges"] = kept

    for fr in delta["flag_removed"]:
        n = byid.get(fr["id"])
        if n is not None:
            n["removed"] = True
            _touch(n, run)
    children = _attach_subprocesses(process, keymap, delta.get("add_subprocesses", []),
                                    run, now, root, "parent")
    if new_ids:
        order = topo_order(process["nodes"], process["edges"])
        local_relayout(process, min(order.index(i) for i in new_ids))
    elif removed_any_edge:
        local_relayout(process, 0)      # re-flow; manual positions are preserved
    process["updated_at"] = now
    validate("process.schema.json", process)
    for c in children:
        validate("process.schema.json", c)
    return process, children
```
  (Only the two new lines — the `removed_any_edge`/`drop` block and the `elif removed_any_edge:` branch — are additions; keep everything else.)

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_merge_edit_ops.py engine/tests/test_merge_delta.py -q`
  Expected: all pass (new edge-hygiene tests + the untouched delta tests).

- [ ] **Commit.**
```
git add engine/merge/__init__.py engine/tests/test_merge_edit_ops.py
git commit -m "feat(engine): build_update applies remove_edges + re-layout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 — `build_update` applies `revise_nodes` (supersession overwrite)

Overwrite named node fields from `set` (unlike `enrich_nodes`, which only fills empties / raises a conflict). Every revision is shown at Gate B before it is written (Phase 2), so overwrite is safe here.

**Files:**
- `code-repo/engine/merge/__init__.py` (modify `build_update`)
- `code-repo/engine/tests/test_merge_edit_ops.py` (extend)

**Interfaces:**
- **Consumes:** `delta.get("revise_nodes", [])` — list of `{id, set}`.
- **Produces:** for each entry, overwrite `node[field] = val` for every `field, val` in `set`, then `_touch(node, run)`. Applied **before** `remove_edges`, **after** `enrich_nodes`. Unknown node id is skipped (mirrors `enrich_nodes` tolerance).

Steps:

- [ ] **Write failing test.** Append to `code-repo/engine/tests/test_merge_edit_ops.py`:
```python
def test_revise_nodes_overwrites_filled_field():
    p = _proc()
    p["pending"] = []
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    assert n["actor"] == "کارپرداز"                 # filled
    apply_delta(p, _empty_delta(
        revise_nodes=[{"id": "cooking-001-n010", "set": {"actor": "انباردار"}}]), RUN, NOW)
    n2 = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    assert n2["actor"] == "انباردار"                # OVERWRITTEN (not a pending row)
    assert not any(r["node"] == "cooking-001-n010" and r["field"] == "actor"
                   for r in p["pending"])
    assert RUN in n2["source"]["touched_by"]


def test_revise_nodes_overwrites_multiple_fields():
    p = _proc()
    apply_delta(p, _empty_delta(revise_nodes=[
        {"id": "cooking-001-n010", "set": {"label": "دریافت", "description": "بازنویسی"}}]),
        RUN, NOW)
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    assert n["label"] == "دریافت" and n["description"] == "بازنویسی"
    validate("process.schema.json", p)


def test_revise_nodes_unknown_id_is_skipped():
    p = _proc()
    apply_delta(p, _empty_delta(revise_nodes=[{"id": "ghost", "set": {"label": "x"}}]),
                RUN, NOW)
    validate("process.schema.json", p)             # no crash, no change
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_merge_edit_ops.py -q`
  Expected: the three `revise_nodes` tests FAIL — `test_revise_nodes_overwrites_filled_field` fails `n2["actor"] == "انباردار"` because `build_update` ignores `revise_nodes` today.

- [ ] **Implement minimally.** In `code-repo/engine/merge/__init__.py` `build_update`, insert the revise loop **between** the `enrich_nodes` loop and the `remove_edges` block from Task 4 (order: enrich → revise → remove_edges):
```python
    # ... enrich_nodes loop ...
    for rn in delta.get("revise_nodes", []):
        n = byid.get(rn["id"])
        if n is None:
            continue
        for field, val in rn["set"].items():
            n[field] = val
        _touch(n, run)
    # ... remove_edges block (Task 4) follows ...
```

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_merge_edit_ops.py engine/tests/test_merge_delta.py -q`
  Expected: all pass.

- [ ] **Commit.**
```
git add engine/merge/__init__.py engine/tests/test_merge_edit_ops.py
git commit -m "feat(engine): build_update applies revise_nodes (supersession overwrite)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 — `tombstone` + `remove_process` + `merge remove` CLI

Add the smallest tombstone primitive and its no-heir wrapper, plus the CLI verb. This is the INV-4-compliant "removal" (tombstone, never delete).

**Files:**
- `code-repo/engine/merge/__init__.py` (add `tombstone`, `remove_process`)
- `code-repo/engine/merge/cli.py` (add `remove` verb)
- `code-repo/engine/tests/test_merge_tombstone.py` (create)

**Interfaces:**
- **Produces:**
  - `tombstone(process, heir_ids, now) -> process` — sets `process["tombstoned"] = True`, `process["superseded_by"] = list(heir_ids)`, `process["updated_at"] = now`.
  - `remove_process(process, now) -> process` — `tombstone(process, [], now)`.
- **CLI:** `merge remove --process <pid> --run <str> [--now]` — read the process file, call `remove_process`, write it back with `write_json_atomic`. (`--run` is accepted for symmetry with the other verbs but `remove_process` takes only `process, now`.)

Steps:

- [ ] **Write failing test.** Create `code-repo/engine/tests/test_merge_tombstone.py`:
```python
import copy
import json

from conftest import load_fixture
from engine_common import validate
from merge import remove_process, tombstone
from merge.cli import main as merge_main

NOW = "2026-07-12T09:00:00Z"


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_tombstone_sets_flags_and_heirs():
    p = _proc()
    out = tombstone(p, ["cooking-007", "cooking-008"], NOW)
    assert out["tombstoned"] is True
    assert out["superseded_by"] == ["cooking-007", "cooking-008"]
    assert out["updated_at"] == NOW
    validate("process.schema.json", out)


def test_remove_process_is_tombstone_with_no_heir():
    p = _proc()
    out = remove_process(p, NOW)
    assert out["tombstoned"] is True
    assert out["superseded_by"] == []
    validate("process.schema.json", out)


def _proc_path(root, pid):
    dept = pid.rsplit("-", 1)[0]
    return root / "departments" / dept / "processes" / f"{pid}.json"


def test_cli_remove_writes_tombstone(data_root):
    path = _proc_path(data_root, "cooking-001")
    path.write_text(json.dumps(_proc(), ensure_ascii=False), encoding="utf-8")
    rc = merge_main(["remove", "--process", "cooking-001",
                     "--run", "runs/x", "--now", NOW])
    assert rc == 0
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["tombstoned"] is True and written["superseded_by"] == []
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_merge_tombstone.py -q`
  Expected: FAILS at import — `ImportError: cannot import name 'tombstone' from 'merge'`.

- [ ] **Implement minimally.** In `code-repo/engine/merge/__init__.py`, add (e.g. after `resolve_pending`):
```python
def tombstone(process, heir_ids, now):
    process["tombstoned"] = True
    process["superseded_by"] = list(heir_ids)
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process


def remove_process(process, now):
    return tombstone(process, [], now)
```
  In `code-repo/engine/merge/cli.py`, update the import and add the verb + branch:
```python
from merge import build_new, build_update, remove_process, resolve_pending
```
  Add the parser (after the `accept`/`reject` loop, before `args = ap.parse_args(argv)`):
```python
    rm = sub.add_parser("remove")
    rm.add_argument("--process", required=True)
    rm.add_argument("--run", required=True)
    rm.add_argument("--now")
```
  Add the branch inside `try:` (before the final `else:  # accept | reject`):
```python
        elif args.cmd == "remove":
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = remove_process(read_json(path), _now(args.now))
            write_json_atomic(path, proc)
            print(f"tombstoned {args.process}")
```

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_merge_tombstone.py -q`
  Expected: all 3 pass.

- [ ] **Commit.**
```
git add engine/merge/__init__.py engine/merge/cli.py engine/tests/test_merge_tombstone.py
git commit -m "feat(engine): tombstone/remove_process core + merge remove CLI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 — `restructure.schema.json` + `restructure()` core (heirs + tombstone, no hierarchy) + `merge restructure` CLI

Build each heir as a fresh full process with new ids and tombstone every superseded original — the merge/split verb, without hierarchy redirect yet (`subprocess_links: []`). Reviewer can accept this independently of Task 8.

**Files:**
- `code-repo/schemas/restructure.schema.json` (create)
- `code-repo/engine/merge/__init__.py` (add `restructure`)
- `code-repo/engine/merge/cli.py` (add `restructure` verb)
- `code-repo/engine/tests/test_schema_restructure_tombstone.py` (extend — schema)
- `code-repo/engine/tests/test_merge_restructure.py` (create — core)

**Interfaces:**
- **Consumes:** a restructure plan validated against `restructure.schema.json`:
```
{ "department": str,
  "heirs": [ { "candidate": <candidate.schema body>,
              "supersedes": [ "{dept}-NNN", … ],
              "subprocess_links": [ {"parent_key": <heir temp node key>, "child": "{dept}-NNN"} ] } ] }
```
- **Produces:** `restructure(plan, run, now, root=None) -> (heirs: list[dict], tombstoned: list[dict])`. For each heir: `next_process_id(dept, root, reserved=<all pids allocated so far this batch>)`, then `_build_process(candidate, dept, pid, run, now, parent=None, source_type="voice")`. Every pid in any heir's `supersedes` is tombstoned via `tombstone(orig, heir_ids_that_supersede_it, now)`. In this task `subprocess_links` is present in the schema but the engine leaves it for Task 8 (tests here pass `[]`).
- **CLI:** `merge restructure --plan <file> --run <str> [--now]` — call `restructure`, `write_json_atomic` every heir and every tombstoned process at `_proc_path`, print `heir <id>` per heir, `tombstoned <id>` per tombstoned, `subprocess <child> node <node>` per applied link (none in this task).

Steps:

- [ ] **Write failing schema test.** Append to `code-repo/engine/tests/test_schema_restructure_tombstone.py`:
```python
def _cand():
    return copy.deepcopy(load_fixture("candidate.json"))


def test_restructure_schema_accepts_minimal_merge_plan():
    validate("restructure.schema.json", {
        "department": "cooking",
        "heirs": [{"candidate": _cand(), "supersedes": ["cooking-001", "cooking-002"],
                   "subprocess_links": []}],
    })


def test_restructure_schema_requires_heirs_and_department():
    with pytest.raises(ValueError):
        validate("restructure.schema.json", {"heirs": []})     # no department
    with pytest.raises(ValueError):
        validate("restructure.schema.json", {"department": "cooking"})  # no heirs


def test_restructure_schema_rejects_unknown_heir_key():
    with pytest.raises(ValueError):
        validate("restructure.schema.json", {
            "department": "cooking",
            "heirs": [{"candidate": _cand(), "supersedes": [], "subprocess_links": [],
                       "oops": 1}]})
```

- [ ] **Write failing core test.** Create `code-repo/engine/tests/test_merge_restructure.py`:
```python
import copy
import json

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import restructure
from merge.cli import main as merge_main

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _cand(name="heir"):
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["process_name"] = name
    return c


def _committed(root, pid):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = pid
    p["parent"] = None
    p["nodes"] = [n for n in p["nodes"]
                  if n["id"] not in ("cooking-001-n060",)]  # drop the child-bearing box
    for n in p["nodes"]:
        if "-" in n["id"] and n["id"] not in ("start", "end"):
            n["id"] = n["id"].replace("cooking-001", pid)
    p["edges"] = [e for e in p["edges"]
                  if "cooking-001-n060" not in (e["from"], e["to"])]
    for e in p["edges"]:
        e["from"] = e["from"].replace("cooking-001", pid)
        e["to"] = e["to"].replace("cooking-001", pid)
    p["pending"] = []
    path = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    path.write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")
    return p


def test_merge_two_into_one_heir(data_root):
    _committed(data_root, "cooking-001")
    _committed(data_root, "cooking-002")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("merged"),
                       "supersedes": ["cooking-001", "cooking-002"],
                       "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    assert len(heirs) == 1 and len(tombstoned) == 2
    assert heirs[0]["id"] == "cooking-003"            # fresh id past the ledger high-water
    for t in tombstoned:
        assert t["tombstoned"] is True
        assert t["superseded_by"] == ["cooking-003"]
        validate("process.schema.json", t)
    validate("process.schema.json", heirs[0])


def test_split_one_into_two_heirs(data_root):
    _committed(data_root, "cooking-001")
    plan = {"department": "cooking",
            "heirs": [
                {"candidate": _cand("part-a"), "supersedes": ["cooking-001"],
                 "subprocess_links": []},
                {"candidate": _cand("part-b"), "supersedes": ["cooking-001"],
                 "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    assert [h["id"] for h in heirs] == ["cooking-002", "cooking-003"]  # distinct fresh ids
    assert len(tombstoned) == 1
    assert sorted(tombstoned[0]["superseded_by"]) == ["cooking-002", "cooking-003"]


def test_restructure_new_only_no_supersedes(data_root):
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("brand-new"), "supersedes": [],
                       "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    assert len(heirs) == 1 and tombstoned == []


def test_cli_restructure_writes_all(data_root):
    _committed(data_root, "cooking-001")
    _committed(data_root, "cooking-002")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("merged"),
                       "supersedes": ["cooking-001", "cooking-002"],
                       "subprocess_links": []}]}
    plan_path = data_root / "runs" / "plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    rc = merge_main(["restructure", "--plan", str(plan_path),
                     "--run", RUN, "--now", NOW])
    assert rc == 0
    heir = json.loads((data_root / "departments/cooking/processes/cooking-003.json")
                      .read_text(encoding="utf-8"))
    assert heir["name"] == "merged"
    t1 = json.loads((data_root / "departments/cooking/processes/cooking-001.json")
                    .read_text(encoding="utf-8"))
    assert t1["tombstoned"] is True and t1["superseded_by"] == ["cooking-003"]
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_schema_restructure_tombstone.py engine/tests/test_merge_restructure.py -q`
  Expected: schema tests FAIL with `FileNotFoundError` (no `restructure.schema.json`); the core test file FAILS at import — `ImportError: cannot import name 'restructure' from 'merge'`.

- [ ] **Implement — schema.** Create `code-repo/schemas/restructure.schema.json`. Reference the frozen candidate body by copying its structural `$defs` (a schema file cannot `$ref` another file here since `validate` loads by name only). To keep it small and authoritative, embed the candidate as `{ "$ref": "#/$defs/candidate" }` where `candidate` mirrors `candidate.schema.json`'s root + `$defs`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "restructure.schema.json",
  "title": "Restructure plan — merge/split heirs + supersession (design §4.5)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "heirs"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "heirs": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["candidate", "supersedes", "subprocess_links"],
        "properties": {
          "candidate": { "$ref": "#/$defs/candidate" },
          "supersedes": {
            "type": "array",
            "items": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" }
          },
          "subprocess_links": {
            "type": "array",
            "items": {
              "type": "object", "additionalProperties": false,
              "required": ["parent_key", "child"],
              "properties": {
                "parent_key": { "type": "string" },
                "child": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" }
              }
            }
          }
        }
      }
    }
  },
  "$defs": {
    "candidate": {
      "type": "object", "additionalProperties": false,
      "required": ["department", "process_name", "summary", "idef0", "kpis", "nodes", "edges"],
      "properties": {
        "department": { "type": "string", "pattern": "^[a-z]+$" },
        "process_name": { "type": "string" },
        "summary": { "type": "string" },
        "idef0": { "$ref": "#/$defs/icom" },
        "kpis": { "type": "array", "items": { "$ref": "#/$defs/kpi" } },
        "nodes": { "type": "array", "items": { "$ref": "#/$defs/node" } },
        "edges": { "type": "array", "items": { "$ref": "#/$defs/edge" } },
        "subprocesses": {
          "type": "array",
          "items": {
            "type": "object", "additionalProperties": false,
            "required": ["parent_key", "process"],
            "properties": {
              "parent_key": { "type": "string" },
              "process": { "$ref": "#/$defs/candidateNoSub" }
            }
          }
        }
      }
    },
    "candidateNoSub": {
      "type": "object", "additionalProperties": false,
      "required": ["department", "process_name", "summary", "idef0", "kpis", "nodes", "edges"],
      "properties": {
        "department": { "type": "string", "pattern": "^[a-z]+$" },
        "process_name": { "type": "string" },
        "summary": { "type": "string" },
        "idef0": { "$ref": "#/$defs/icom" },
        "kpis": { "type": "array", "items": { "$ref": "#/$defs/kpi" } },
        "nodes": { "type": "array", "items": { "$ref": "#/$defs/node" } },
        "edges": { "type": "array", "items": { "$ref": "#/$defs/edge" } }
      }
    },
    "node": {
      "oneOf": [
        {
          "type": "object", "additionalProperties": false,
          "required": ["key", "type", "label", "description", "actor", "icom", "subprocess"],
          "properties": {
            "key": { "type": "string" },
            "type": { "const": "activity" },
            "label": { "type": "string" },
            "description": { "type": "string" },
            "actor": { "type": "string" },
            "icom": { "$ref": "#/$defs/icom" },
            "subprocess": { "type": "null" }
          }
        },
        {
          "type": "object", "additionalProperties": false,
          "required": ["key", "type", "junctionType", "direction"],
          "properties": {
            "key": { "type": "string" },
            "type": { "const": "junction" },
            "junctionType": { "enum": ["AND", "OR", "XOR"] },
            "direction": { "enum": ["split", "join"] }
          }
        }
      ]
    },
    "edge": {
      "type": "object", "additionalProperties": false,
      "required": ["from", "to"],
      "properties": {
        "from": { "type": "string" }, "to": { "type": "string" }, "label": { "type": "string" }
      }
    },
    "icom": {
      "type": "object", "additionalProperties": false,
      "required": ["inputs", "controls", "outputs", "mechanisms"],
      "properties": {
        "inputs": { "type": "array", "items": { "type": "string" } },
        "controls": { "type": "array", "items": { "type": "string" } },
        "outputs": { "type": "array", "items": { "type": "string" } },
        "mechanisms": { "type": "array", "items": { "type": "string" } }
      }
    },
    "kpi": {
      "type": "object", "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string" }, "definition": { "type": "string" },
        "target": { "type": "string" }, "unit": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Implement — `restructure()` core (no hierarchy).** In `code-repo/engine/merge/__init__.py`, add. The hierarchy-redirect body (`subprocess_links`, retarget, closure/cycle) is a Task-8 addition into the marked section; here it is a no-op loop that only raises if a link is declared:
```python
def restructure(plan, run, now, root=None):
    validate("restructure.schema.json", plan)
    dept = plan["department"]
    heirs, alloc = [], set()
    # 1) build every heir with a fresh, ledger-durable pid
    for h in plan["heirs"]:
        pid = next_process_id(dept, root, reserved=alloc)
        alloc.add(pid)
        heir, keymap = _build_process(h["candidate"], dept, pid, run, now,
                                      parent=None, source_type="voice")
        heirs.append({"process": heir, "keymap": keymap, "spec": h})
    heir_pids = [h["process"]["id"] for h in heirs]

    # 2) tombstone every superseded original with the heirs that supersede it
    superseders = {}  # pid -> [heir ids]
    for h in heirs:
        for sup in h["spec"]["supersedes"]:
            superseders.setdefault(sup, []).append(h["process"]["id"])
    tombstoned = []
    for pid, heir_ids in superseders.items():
        path = _proc_file(pid, root)
        if not path.is_file():
            raise ValueError(f"restructure supersedes missing process {pid}")
        orig = read_json(path)
        tombstone(orig, heir_ids, now)
        tombstoned.append(orig)

    # 3) HIERARCHY REDIRECT — Task 8 fills this in (subprocess_links, retarget,
    #    closure + cycle validation). For now, a declared link is not yet supported.
    for h in heirs:
        if h["spec"]["subprocess_links"]:
            raise ValueError("subprocess_links not yet supported")

    result_heirs = [h["process"] for h in heirs]
    for p in result_heirs:
        validate("process.schema.json", p)
    for t in tombstoned:
        validate("process.schema.json", t)
    return result_heirs, tombstoned
```
  Add the `_proc_file` helper near the top of `merge/__init__.py` (the engine module must resolve a process path independently of the CLI):
```python
def _proc_file(pid, root=None):
    from engine_common import data_root
    base = root or data_root()
    dept = pid.rsplit("-", 1)[0]
    return base / "departments" / dept / "processes" / f"{pid}.json"
```
  Add `read_json` to the `engine_common` import at the top of `merge/__init__.py`:
```python
from engine_common import is_empty, read_json, validate
```

- [ ] **Implement — CLI verb.** In `code-repo/engine/merge/cli.py`, extend the import and add the verb. Import:
```python
from merge import (build_new, build_update, remove_process, resolve_pending,
                   restructure)
```
  Parser (near the other `sub.add_parser` calls):
```python
    rs = sub.add_parser("restructure")
    rs.add_argument("--plan", required=True)
    rs.add_argument("--run", required=True)
    rs.add_argument("--now")
```
  Branch inside `try:`:
```python
        elif args.cmd == "restructure":
            _require(pathlib_exists(args.plan), "plan file must exist")
            heirs, tombstoned = restructure(read_json(args.plan), args.run, _now(args.now))
            for h in heirs:
                write_json_atomic(_proc_path(h["id"]), h)
                print(f"heir {h['id']}")
            for t in tombstoned:
                write_json_atomic(_proc_path(t["id"]), t)
                print(f"tombstoned {t['id']}")
            for h in heirs:
                for n in h["nodes"]:
                    if n.get("type") == "activity" and n.get("subprocess"):
                        print(f"subprocess {n['subprocess']} node {n['id']}")
```

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_schema_restructure_tombstone.py engine/tests/test_merge_restructure.py -q`
  Expected: all pass (schema accept/reject + merge/split/new core + CLI writes).

- [ ] **Commit.**
```
git add schemas/restructure.schema.json engine/merge/__init__.py engine/merge/cli.py engine/tests/test_schema_restructure_tombstone.py engine/tests/test_merge_restructure.py
git commit -m "feat(engine): restructure() heirs + tombstones + merge restructure CLI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 — `restructure` hierarchy redirect: `subprocess_links` + closure/cycle validation

Wire heir↔child hierarchy: apply declared `subprocess_links`, retarget a superseded process's parent box to the correct heir, and refuse dangling references or cycles.

**Files:**
- `code-repo/engine/merge/__init__.py` (fill the `# 3) HIERARCHY REDIRECT` section of `restructure`)
- `code-repo/engine/tests/test_merge_restructure.py` (extend)

**Interfaces:**
- **Consumes:** each heir's `subprocess_links: [{parent_key, child}]` (heir temp node key → existing child pid); the committed originals' `parent` fields.
- **Produces:** for each link, set the heir node's `subprocess = child_pid`, load the child, set `child["parent"] = {"process": heir_id, "node": heir_node_id}`, `_sync_icom(heir_node, child["idef0"], run)`, and include the mutated child in the returned `heirs`/written set. For a **superseded process that is itself a child** (`parent` not null), retarget its parent process's node `subprocess` to the heir that supersedes it (a "stable neighbour retarget"). **Closure validation:** if a redirect references a process that is neither in the plan (as heir/superseded) nor a resolvable stable neighbour on disk, raise `ValueError` naming the missing process. **Cycle:** reject a `subprocess_links` child that is an ancestor of its heir (raise `ValueError`).

Steps:

- [ ] **Write failing test.** Append to `code-repo/engine/tests/test_merge_restructure.py`:
```python
def _committed_with_child(root, parent_pid, child_pid, box_key="n1"):
    """A parent process whose box already points at child_pid, and the child."""
    parent = copy.deepcopy(load_fixture("process.cooking-001.json"))
    parent["id"] = parent_pid
    parent["parent"] = None
    parent["pending"] = []
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n060")
    box["id"] = f"{parent_pid}-n060"
    box["subprocess"] = child_pid
    parent["nodes"] = [n for n in parent["nodes"]
                       if n["id"] in ("start", "end", box["id"])
                       or n["id"].startswith(f"{parent_pid}-")]
    for n in parent["nodes"]:
        for pat in ("cooking-001-n010", "cooking-001-j1"):
            if n["id"] == pat:
                n["id"] = pat.replace("cooking-001", parent_pid)
    parent["edges"] = []
    (root / "departments/cooking/processes" / f"{parent_pid}.json").write_text(
        json.dumps(parent, ensure_ascii=False), encoding="utf-8")

    child = copy.deepcopy(load_fixture("process.cooking-001.json"))
    child["id"] = child_pid
    child["parent"] = {"process": parent_pid, "node": box["id"]}
    child["pending"] = []
    child["nodes"] = [n for n in child["nodes"] if n["id"] in ("start", "end")]
    child["edges"] = []
    (root / "departments/cooking/processes" / f"{child_pid}.json").write_text(
        json.dumps(child, ensure_ascii=False), encoding="utf-8")
    return parent, child


def test_subprocess_links_reparent_existing_child(data_root):
    # cooking-001 (has box -> cooking-050 child); split cooking-001 into a heir that
    # re-adopts cooking-050 under its own new box (temp key "n1").
    _committed_with_child(data_root, "cooking-001", "cooking-050")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("heir-adopts"),
                       "supersedes": ["cooking-001"],
                       "subprocess_links": [{"parent_key": "n1", "child": "cooking-050"}]}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    heir = next(h for h in heirs if h["parent"] is None)
    box = next(n for n in heir["nodes"] if n.get("subprocess") == "cooking-050")
    assert box is not None
    # the child, returned in heirs, now points at the heir
    child = next(h for h in heirs if h["id"] == "cooking-050")
    assert child["parent"] == {"process": heir["id"], "node": box["id"]}
    assert box["icom"] == child["idef0"]           # icom synced


def test_dangling_child_link_is_refused(data_root):
    _committed(data_root, "cooking-001")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("h"), "supersedes": ["cooking-001"],
                       "subprocess_links": [{"parent_key": "n1", "child": "cooking-999"}]}]}
    with pytest.raises(ValueError, match="cooking-999"):
        restructure(plan, RUN, NOW, root=data_root)


def test_superseded_child_retargets_parent_box(data_root):
    # cooking-001 is a parent; cooking-050 is its child. We supersede the CHILD
    # (cooking-050) with a new heir; the parent box must retarget to the heir.
    _committed_with_child(data_root, "cooking-001", "cooking-050")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("new-child"), "supersedes": ["cooking-050"],
                       "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    heir_id = heirs[0]["id"]
    # the parent process on disk (or in the returned set) has its box retargeted
    parent = next((h for h in heirs if h["id"] == "cooking-001"), None)
    if parent is None:
        parent = json.loads(
            (data_root / "departments/cooking/processes/cooking-001.json")
            .read_text(encoding="utf-8"))
    box = next(n for n in parent["nodes"] if n.get("type") == "activity"
               and n.get("subprocess") == heir_id)
    assert box is not None
    assert heirs[0]["parent"]["process"] == "cooking-001"


def test_cycle_link_rejected(data_root):
    # a heir whose declared child is actually the heir's own ancestor -> cycle
    _committed_with_child(data_root, "cooking-001", "cooking-050")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("h"), "supersedes": ["cooking-050"],
                       "subprocess_links": [{"parent_key": "n1", "child": "cooking-001"}]}]}
    with pytest.raises(ValueError, match="cycle|ancestor"):
        restructure(plan, RUN, NOW, root=data_root)
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_merge_restructure.py -q`
  Expected: the four new tests FAIL — `test_subprocess_links_reparent_existing_child` hits the Task-7 placeholder `raise ValueError("subprocess_links not yet supported")`; retarget/cycle behaviour is absent.

- [ ] **Implement.** Replace the `# 3) HIERARCHY REDIRECT` placeholder block in `restructure` (in `code-repo/engine/merge/__init__.py`) with the full redirect. Build a set of "known" pids (heirs + superseded), collect side-effected processes into a dict keyed by id so each is written once, and validate closure + cycles:
```python
    # 3) HIERARCHY REDIRECT (design §4.5)
    known = set(heir_pids) | set(superseders)          # in-plan pids
    tomb_by_id = {t["id"]: t for t in tombstoned}
    extra = {}                                         # neighbours mutated in place

    def _load(pid):
        if pid in tomb_by_id:
            return tomb_by_id[pid]
        if pid in extra:
            return extra[pid]
        path = _proc_file(pid, root)
        if not path.is_file():
            raise ValueError(f"restructure references missing process {pid}")
        obj = read_json(path)
        extra[pid] = obj
        return obj

    def _is_ancestor(anc_pid, node_pid):
        # walk node_pid's parent chain; True if anc_pid is reached (would form a cycle)
        seen, cur = set(), node_pid
        while cur is not None and cur not in seen:
            seen.add(cur)
            if cur == anc_pid:
                return True
            obj = _load(cur) if cur != anc_pid else None
            par = (obj or {}).get("parent")
            cur = par["process"] if par else None
        return False

    # 3a) declared subprocess_links: heir temp box adopts an existing child pid
    for h in heirs:
        heir, keymap = h["process"], h["keymap"]
        byid = {n["id"]: n for n in heir["nodes"]}
        for link in h["spec"]["subprocess_links"]:
            node_id = keymap.get(link["parent_key"], link["parent_key"])
            node = byid.get(node_id)
            if node is None or node.get("type") != "activity":
                raise ValueError(
                    f"subprocess_links parent_key '{link['parent_key']}' is not an "
                    f"activity node in heir {heir['id']}")
            child = _load(link["child"])              # raises + names if dangling
            if _is_ancestor(child["id"], heir["id"]):
                raise ValueError(
                    f"subprocess_links would create a cycle: {child['id']} is an "
                    f"ancestor of heir {heir['id']}")
            node["subprocess"] = child["id"]
            child["parent"] = {"process": heir["id"], "node": node_id}
            _sync_icom(node, child["idef0"], run)

    # 3b) a superseded process that IS a child: retarget its parent box to the heir
    for pid, heir_ids in superseders.items():
        orig = tomb_by_id[pid]
        par = orig.get("parent")
        if not par:
            continue
        if len(heir_ids) != 1:
            raise ValueError(
                f"cannot retarget parent of {pid}: it is superseded by "
                f"{heir_ids} (expected exactly one heir)")
        heir_id = heir_ids[0]
        parent_proc = _load(par["process"])           # raises + names if dangling
        pbyid = {n["id"]: n for n in parent_proc["nodes"]}
        pnode = pbyid.get(par["node"])
        if pnode is not None and pnode.get("subprocess") == pid:
            pnode["subprocess"] = heir_id
            heir = next(x["process"] for x in heirs if x["process"]["id"] == heir_id)
            heir["parent"] = {"process": parent_proc["id"], "node": pnode["id"]}
            _sync_icom(pnode, heir["idef0"], run)

    # neighbours we touched but did not tombstone travel back with the heirs
    side_effects = [o for pid, o in extra.items() if pid not in tomb_by_id]
```
  Then extend the return to include the adopted children / retargeted neighbours. Replace the final `result_heirs = ...` / validation / `return` with:
```python
    result_heirs = [h["process"] for h in heirs] + side_effects
    for p in result_heirs:
        validate("process.schema.json", p)
    for t in tombstoned:
        validate("process.schema.json", t)
    return result_heirs, tombstoned
```
  (Note: a `child` adopted via `subprocess_links` is loaded through `_load` into `extra`, so it is already in `side_effects` and returned/written once. `_sync_icom` and `_build_process` are already imported/defined in this module.)

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_merge_restructure.py -q`
  Expected: all pass (core from Task 7 + reparent, dangling refusal, parent retarget, cycle rejection).

- [ ] **Commit.**
```
git add engine/merge/__init__.py engine/tests/test_merge_restructure.py
git commit -m "feat(engine): restructure hierarchy redirect + closure/cycle validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 — `attach_subprocess` + `merge attach-subprocess` CLI

Re-parent an **existing** process X under node N of process P — X keeps its id. Validate N is an activity with no existing sub-process and X is not an ancestor of P.

**Files:**
- `code-repo/engine/merge/__init__.py` (add `attach_subprocess`)
- `code-repo/engine/merge/cli.py` (add `attach-subprocess` verb)
- `code-repo/engine/tests/test_merge_attach.py` (create)

**Interfaces:**
- **Produces:** `attach_subprocess(parent_process, node_id, child_process, run, now) -> (parent, child)` — set `child["parent"] = {"process": parent_process["id"], "node": node_id}`, set the parent's node `subprocess = child["id"]`, `_sync_icom(node, child["idef0"], run)`, `_touch` the node, `parent["updated_at"] = child["updated_at"] = now`. Validate: node exists, is `activity`, has no existing `subprocess`; and `child` is not an ancestor of `parent` (walk `parent`'s `parent` chain; if `child["id"]` appears, raise `ValueError`). Else `ValueError`.
- **CLI:** `merge attach-subprocess --parent-process <pid> --node <nodeid> --child <pid> --run <str> [--now]` — read both process files, call `attach_subprocess`, write both.

Steps:

- [ ] **Write failing test.** Create `code-repo/engine/tests/test_merge_attach.py`:
```python
import copy
import json

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import attach_subprocess
from merge.cli import main as merge_main

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _parent():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["pending"] = []
    box = next(n for n in p["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = None                          # a free activity box
    return p


def _child(pid="cooking-050"):
    c = copy.deepcopy(load_fixture("process.cooking-001.json"))
    c["id"] = pid
    c["parent"] = None
    c["pending"] = []
    c["nodes"] = [n for n in c["nodes"] if n["id"] in ("start", "end")]
    c["edges"] = []
    return c


def test_attach_links_parent_and_child():
    parent, child = attach_subprocess(_parent(), "cooking-001-n010", _child(), RUN, NOW)
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert box["subprocess"] == "cooking-050"
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    assert box["icom"] == child["idef0"]              # icom synced
    assert RUN in box["source"]["touched_by"]
    assert parent["updated_at"] == NOW
    validate("process.schema.json", parent)
    validate("process.schema.json", child)


def test_attach_rejects_non_activity_node():
    with pytest.raises(ValueError):
        attach_subprocess(_parent(), "cooking-001-j1", _child(), RUN, NOW)


def test_attach_rejects_occupied_node():
    p = _parent()
    box = next(n for n in p["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = "cooking-099"
    with pytest.raises(ValueError):
        attach_subprocess(p, "cooking-001-n010", _child(), RUN, NOW)


def test_attach_rejects_missing_node():
    with pytest.raises(ValueError):
        attach_subprocess(_parent(), "ghost", _child(), RUN, NOW)


def test_attach_rejects_cycle():
    # parent is itself a child of the would-be child -> attaching the child would cycle
    parent = _parent()
    parent["parent"] = {"process": "cooking-050", "node": "cooking-050-n001"}
    with pytest.raises(ValueError, match="cycle|ancestor"):
        attach_subprocess(parent, "cooking-001-n010", _child("cooking-050"), RUN, NOW)


def _write(root, proc):
    dept = proc["id"].rsplit("-", 1)[0]
    (root / "departments" / dept / "processes" / f"{proc['id']}.json").write_text(
        json.dumps(proc, ensure_ascii=False), encoding="utf-8")


def test_cli_attach_writes_both(data_root):
    _write(data_root, _parent())
    _write(data_root, _child())
    rc = merge_main(["attach-subprocess", "--parent-process", "cooking-001",
                     "--node", "cooking-001-n010", "--child", "cooking-050",
                     "--run", RUN, "--now", NOW])
    assert rc == 0
    parent = json.loads((data_root / "departments/cooking/processes/cooking-001.json")
                        .read_text(encoding="utf-8"))
    child = json.loads((data_root / "departments/cooking/processes/cooking-050.json")
                       .read_text(encoding="utf-8"))
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert box["subprocess"] == "cooking-050"
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
```

- [ ] **Run it — expect failure.** `cd code-repo && python -m pytest engine/tests/test_merge_attach.py -q`
  Expected: FAILS at import — `ImportError: cannot import name 'attach_subprocess' from 'merge'`.

- [ ] **Implement — engine.** In `code-repo/engine/merge/__init__.py`, add:
```python
def attach_subprocess(parent_process, node_id, child_process, run, now):
    byid = {n["id"]: n for n in parent_process["nodes"]}
    node = byid.get(node_id)
    if node is None or node.get("type") != "activity":
        raise ValueError(f"attach target '{node_id}' is not an activity node in "
                         f"{parent_process['id']}")
    if node.get("subprocess") is not None:
        raise ValueError(f"node {node_id} already has subprocess {node['subprocess']}")
    # cycle guard: child must not be an ancestor of parent
    cur, seen = parent_process.get("parent"), set()
    while cur is not None:
        ppid = cur["process"]
        if ppid == child_process["id"]:
            raise ValueError(
                f"attach would create a cycle: {child_process['id']} is an ancestor "
                f"of {parent_process['id']}")
        if ppid in seen:
            break
        seen.add(ppid)
        cur = read_json(_proc_file(ppid)).get("parent") if _proc_file(ppid).is_file() else None
    child_process["parent"] = {"process": parent_process["id"], "node": node_id}
    node["subprocess"] = child_process["id"]
    _sync_icom(node, child_process["idef0"], run)
    _touch(node, run)
    parent_process["updated_at"] = now
    child_process["updated_at"] = now
    validate("process.schema.json", parent_process)
    validate("process.schema.json", child_process)
    return parent_process, child_process
```

- [ ] **Implement — CLI.** In `code-repo/engine/merge/cli.py`, extend the import:
```python
from merge import (attach_subprocess, build_new, build_update, remove_process,
                   resolve_pending, restructure)
```
  Parser:
```python
    at = sub.add_parser("attach-subprocess")
    at.add_argument("--parent-process", required=True)
    at.add_argument("--node", required=True)
    at.add_argument("--child", required=True)
    at.add_argument("--run", required=True)
    at.add_argument("--now")
```
  Branch inside `try:`:
```python
        elif args.cmd == "attach-subprocess":
            pp = _proc_path(args.parent_process)
            cp = _proc_path(args.child)
            _require(pp.is_file(), f"parent process {args.parent_process} must exist")
            _require(cp.is_file(), f"child process {args.child} must exist")
            parent, child = attach_subprocess(read_json(pp), args.node, read_json(cp),
                                              args.run, _now(args.now))
            write_json_atomic(pp, parent)
            write_json_atomic(cp, child)
            print(f"subprocess {child['id']} node {args.node}")
```
  Note `argparse` maps `--parent-process` to `args.parent_process`.

- [ ] **Run it — expect pass.** `cd code-repo && python -m pytest engine/tests/test_merge_attach.py -q`
  Expected: all pass.

- [ ] **Full-suite regression.** `cd code-repo && python -m pytest engine/tests -q`
  Expected: the entire engine suite passes (new files + all pre-existing `test_merge_*`, `test_allocate_id`, etc. — nothing regressed).

- [ ] **Commit.**
```
git add engine/merge/__init__.py engine/merge/cli.py engine/tests/test_merge_attach.py
git commit -m "feat(engine): attach_subprocess core + merge attach-subprocess CLI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Definition of done (Phase 1)

- [ ] `cd code-repo && python -m pytest engine/tests -q` — full engine suite green.
- [ ] `make test` (if it validates schemas) green — the three touched/new schemas are draft-2020-12 valid.
- [ ] LOCKED CONTRACT satisfied verbatim: functions `next_process_id(dept, root=None, reserved=())`, `build_update(process, delta, run, now, root=None)`, `tombstone(process, heir_ids, now)`, `remove_process(process, now)`, `restructure(plan, run, now, root=None) -> (heirs, tombstoned)`, `attach_subprocess(parent_process, node_id, child_process, run, now) -> (parent, child)`; CLI verbs `merge restructure --plan --run [--now]`, `merge attach-subprocess --parent-process --node --child --run [--now]`, `merge remove --process --run [--now]`; schemas `process.tombstoned`/`superseded_by`, `delta.remove_edges`/`revise_nodes`, `restructure.schema.json`, `idseq.schema.json`.
- [ ] All invariants preserved: ids only from `allocate-id` (durable ledger), `merge` sole writer, never-delete (tombstone only), schemas `additionalProperties:false`.
- [ ] No LLM, prompt, or UI code touched — Phase 1 is engine + schemas only.
