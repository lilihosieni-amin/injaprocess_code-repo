# Automatic Sub-process Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate threshold-based automatic sub-process creation: the `extract` agent emits a child graph for any activity box described with 4+ sequential sub-steps, and the deterministic `merge` CLI mints it as a first-class child process (real `{dept}-{NNN}` ID from `allocate-id`), links parent↔child, syncs the ICOM boundary, lays it out, and reports it — no approval gate.

**Architecture:** Engine is the source of truth (code-repo), brain docs follow (data-repo). `merge` gains a `subprocesses`/`add_subprocesses` path; the process-building core is refactored into `_build_process` and reused for parent + children; `build_new`/`build_update` return `(parent, children)` with `merge_new`/`apply_delta` kept as back-compat wrappers; `next_process_id` gains a `reserved` set so parent+children get sequential IDs before any is written (atomic validate-then-write). Four schemas extend (candidate, delta, process, run-meta). Every invariant holds — INV-1 (only `allocate-id` mints IDs), INV-4 (children orphan not cascade), INV-5 (enrich path still records pending).

**Tech Stack:** Python 3.12, `jsonschema~=4.23`, pytest, ruff. Engine editable-installed into `.venv`; tests via `make test` (root `pytest -q`). Brain docs are Markdown in `data-repo/.claude/`.

## Global Constraints

- **INV-1:** no LLM ever mints an ID. Child process IDs come from `allocate-id` inside `merge`. The extract agent emits **temporary node keys only** in nested child graphs.
- **Threshold:** auto-create ONLY when a box has **4 or more distinct sequential sub-steps**. Below → flag-only (Persian note in `description` + report the node key). Never for minor detail.
- **Single-level nesting only:** a child graph must NOT itself contain `subprocesses`; a child's own qualifying box is flag-only (no recursion). Schema-enforced.
- **ICOM boundary sync (decided):** the child's `idef0` **always** overwrites the parent box's `icom` (the box boundary IS its sub-process). No `pending` row for the sync. (Distinct from the enrich-node path, which still records `pending` on filled-value conflicts, INV-5.)
- **Two repos:** engine/schemas/tests in `code-repo`; brain docs in the sibling `data-repo` (`../data-repo`). Commit per repo. `data-repo` is on branch `main`.
- **Child process record:** `parent = {"process":"<parent-id>","node":"<parent-node-real-id>"}`, `source = {"type":"auto","ref":"<voice>","run":"<run_dir>"}`, child nodes get `position` + `layout:"auto"` from `full_relayout`.
- **Duplicate safety:** if a parent node already has a non-null `subprocess`, `merge` exits non-zero with a clear message (matching an existing sub-process is classify's job upstream).
- **Backward compatibility:** files without the new arrays validate and merge exactly as today; all existing engine tests stay green.
- **CLI stdout contract:** `merge new` prints the parent id (line 1), then one line per child: `subprocess <child-id> node <parent-node-id>`. `merge update` prints only the child lines. Non-zero exit (2) on any validation/precondition error, message on stderr.

**Reused existing code (do not reimplement):** `engine/merge/__init__.py` `_new_node`, `_map_edges`, `_alloc`, `_touch`; `engine/layout` `full_relayout`, `local_relayout`, `topo_order`; `engine_common` `is_empty`, `validate`, `read_json`, `write_json_atomic`; `allocate_id` `next_box_id`, `next_junction_id`, `next_process_id`. Test helpers: `engine/tests/conftest.py` `data_root` fixture + `load_fixture`. Run the FULL suite (`.venv/bin/pytest -q`) — single-file runs break on `from conftest import`.

**Build order:** Task 1 (process + run-meta schemas) → Task 2 (candidate + delta schemas) → Task 3 (`allocate_id` reserved) → Task 4 (`build_new`) → Task 5 (`build_update`) → Task 6 (cli) → Task 7 (brain docs) → Task 8 (E2E + cross-check + commit).

---

### Task 1: Extend `process` and `run-meta` schemas

**Files:**
- Modify: `code-repo/schemas/process.schema.json` (source.type enum)
- Modify: `code-repo/schemas/run-meta.schema.json` (processes item)
- Test: `code-repo/engine/tests/test_subprocess_schema.py` (new)

**Interfaces:**
- Produces: a `process.json` with `source.type:"auto"` validates; a `run-meta.json` whose `processes[]` item has `auto_subprocess_of` validates.

- [ ] **Step 1: Write the failing test**

Create `code-repo/engine/tests/test_subprocess_schema.py`:
```python
import copy
import pytest
from conftest import load_fixture
from engine_common import validate


def test_process_allows_source_type_auto():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["source"] = {"type": "auto", "ref": "cooking-2026-07-06", "run": "runs/cooking-2026-07-06"}
    p["parent"] = {"process": "cooking-002", "node": "cooking-002-n010"}
    validate("process.schema.json", p)  # must not raise


def test_run_meta_allows_auto_subprocess_of():
    m = load_fixture("run-meta.json")
    m = copy.deepcopy(m)
    m["processes"].append({"id": "cooking-004", "status": "new",
                           "auto_subprocess_of": "cooking-001"})
    validate("run-meta.schema.json", m)  # must not raise


def test_run_meta_rejects_unknown_process_key():
    m = copy.deepcopy(load_fixture("run-meta.json"))
    m["processes"].append({"id": "cooking-004", "status": "new", "bogus": 1})
    with pytest.raises(ValueError):
        validate("run-meta.schema.json", m)
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest -q -k subprocess_schema`
Expected: `test_process_allows_source_type_auto` and `test_run_meta_allows_auto_subprocess_of` FAIL (schema rejects `"auto"` / the extra key).

- [ ] **Step 3: Edit `process.schema.json`**

In `code-repo/schemas/process.schema.json`, change the `source.type` enum:
```json
"type": { "enum": ["voice", "manual", "chat", "auto"] },
```

- [ ] **Step 4: Edit `run-meta.schema.json`**

In `code-repo/schemas/run-meta.schema.json`, the `processes` items object — add the optional property (keep `additionalProperties:false`, keep `required:["id","status"]`):
```json
"properties": {
  "id": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
  "status": { "enum": ["new", "update", "unchanged"] },
  "auto_subprocess_of": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `.venv/bin/pytest -q -k subprocess_schema`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add schemas/process.schema.json schemas/run-meta.schema.json engine/tests/test_subprocess_schema.py
git commit -m "schemas: allow source.type=auto (child processes) + auto_subprocess_of in run-meta"
```

---

### Task 2: Extend `candidate` and `delta` schemas (subprocesses)

**Files:**
- Modify: `code-repo/schemas/candidate.schema.json`
- Modify: `code-repo/schemas/delta.schema.json`
- Test: append to `code-repo/engine/tests/test_subprocess_schema.py`

**Interfaces:**
- Produces: candidate with optional top-level `subprocesses: [{parent_key, process}]`; delta with optional `add_subprocesses: [{parent, process}]`; the nested `process` is a full candidate body that MUST NOT contain `subprocesses` (single level).

- [ ] **Step 1: Write the failing tests** (append)

```python
def _sub_entry():
    child = copy.deepcopy(load_fixture("candidate.json"))  # a valid candidate body
    return {"parent_key": "n1", "process": child}


def test_candidate_accepts_subprocesses():
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["subprocesses"] = [_sub_entry()]
    validate("candidate.schema.json", c)


def test_candidate_rejects_nested_subprocesses():
    c = copy.deepcopy(load_fixture("candidate.json"))
    entry = _sub_entry()
    entry["process"]["subprocesses"] = [_sub_entry()]  # second level — forbidden
    c["subprocesses"] = [entry]
    with pytest.raises(ValueError):
        validate("candidate.schema.json", c)


def test_candidate_without_subprocesses_still_valid():
    validate("candidate.schema.json", load_fixture("candidate.json"))


def test_delta_accepts_add_subprocesses():
    d = copy.deepcopy(load_fixture("delta.json"))
    d["add_subprocesses"] = [{"parent": "cooking-001-n020", "process": load_fixture("candidate.json")}]
    validate("delta.schema.json", d)


def test_delta_rejects_nested_subprocesses_in_add():
    d = copy.deepcopy(load_fixture("delta.json"))
    child = copy.deepcopy(load_fixture("candidate.json"))
    child["subprocesses"] = [_sub_entry()]
    d["add_subprocesses"] = [{"parent": "cooking-001-n020", "process": child}]
    with pytest.raises(ValueError):
        validate("delta.schema.json", d)
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest -q -k subprocess_schema`
Expected: the 4 new `candidate`/`delta` subprocess tests FAIL (`additionalProperties:false` rejects the unknown `subprocesses`/`add_subprocesses` keys).

- [ ] **Step 3: Rewrite `candidate.schema.json`**

Replace the file with this (moves nodes/edges into `$defs`, adds `subprocesses` + `$defs/candidateNoSub`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "candidate.schema.json",
  "title": "Extract candidate graph — NEW process, temp keys (ARD §5.4)",
  "type": "object",
  "additionalProperties": false,
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
  },
  "$defs": {
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
            "subprocess": { "type": ["string", "null"] }
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

- [ ] **Step 4: Edit `delta.schema.json`**

Add `add_subprocesses` to `properties` (keep it OUT of `required`), and add `candidateNoSub` + `node`/`edge`/`kpi` to its `$defs` (it already has `$defs/icom`). Add to `properties`:
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
}
```
And add these `$defs` alongside the existing `icom` (copy `candidateNoSub`, `node`, `edge`, `kpi` verbatim from the candidate schema in Step 3 — same in-file refs `#/$defs/icom` etc. resolve within delta.schema.json):
```json
"candidateNoSub": { ... identical to candidate.schema.json §Step 3 ... },
"node": { ... identical ... },
"edge": { ... identical ... },
"kpi": { ... identical ... }
```

- [ ] **Step 5: Run to verify pass**

Run: `.venv/bin/pytest -q -k subprocess_schema`
Expected: all schema tests pass (7 total in this file).
Then run the existing schema self-validation + candidate/delta suites: `.venv/bin/pytest -q -k "schema or candidate or delta"`
Expected: all green (existing `test_candidate_schema.py` / `test_delta_schema.py` still pass — the refactor is behaviour-preserving).

- [ ] **Step 6: Commit**

```bash
git add schemas/candidate.schema.json schemas/delta.schema.json engine/tests/test_subprocess_schema.py
git commit -m "schemas: optional subprocesses (candidate) + add_subprocesses (delta), single-level nesting enforced"
```

---

### Task 3: `next_process_id` reserved set

**Files:**
- Modify: `code-repo/engine/allocate_id/__init__.py:6-16`
- Test: `code-repo/engine/tests/test_allocate_id.py` (append)

**Interfaces:**
- Produces: `next_process_id(dept, root=None, reserved=())` → max over (disk, reserved matching `{dept}-NNN`) + 1. Back-compat: `reserved` defaults empty.

- [ ] **Step 1: Write the failing test** (append to `test_allocate_id.py`)

```python
from allocate_id import next_process_id as _npid


def test_reserved_ids_bump_the_counter(data_root):
    # nothing on disk; reserving cooking-001 forces the next to be 002
    assert _npid("cooking", data_root, reserved={"cooking-001"}) == "cooking-002"
    assert _npid("cooking", data_root, reserved={"cooking-001", "cooking-002"}) == "cooking-003"
    assert _npid("cooking", data_root, reserved={"dining-009"}) == "cooking-001"  # other dept ignored
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest -q -k reserved_ids_bump`
Expected: FAIL — `next_process_id() got an unexpected keyword argument 'reserved'`.

- [ ] **Step 3: Edit `next_process_id`**

Replace the function in `code-repo/engine/allocate_id/__init__.py`:
```python
def next_process_id(dept, root=None, reserved=()):
    root = root or data_root()
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
    return f"{dept}-{mx + 1:03d}"
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest -q -k "reserved_ids_bump or allocate"`
Expected: all allocate-id tests pass.

- [ ] **Step 5: Commit**

```bash
git add engine/allocate_id/__init__.py engine/tests/test_allocate_id.py
git commit -m "allocate-id: next_process_id accepts a reserved set for in-flight sibling allocation"
```

---

### Task 4: `merge` — `build_new` with subprocesses

**Files:**
- Modify: `code-repo/engine/merge/__init__.py` (refactor `merge_new`; add `_build_process`, `_sync_icom`, `_attach_subprocesses`, `build_new`)
- Test: `code-repo/engine/tests/test_merge_subprocess.py` (new)

**Interfaces:**
- Consumes: `next_process_id(dept, root, reserved)` (Task 3); schemas (Tasks 1–2).
- Produces:
  - `build_new(candidate, dept, run, now, root=None) -> (parent_process, [child_process, ...])`
  - `merge_new(candidate, dept, run, now, root=None) -> parent_process` (unchanged return; wrapper over `build_new`)
  - child process: `parent={"process":pid,"node":node_id}`, `source={"type":"auto",...}`, parent node `subprocess=child_id`, parent node `icom` == child `idef0`.

- [ ] **Step 1: Write the failing test**

Create `code-repo/engine/tests/test_merge_subprocess.py`:
```python
import copy
import pytest
from conftest import load_fixture
from engine_common import validate
from merge import build_new, merge_new

RUN = "runs/cooking-2026-07-06"
NOW = "2026-07-06T10:00:00Z"


def _candidate_with_child():
    parent = copy.deepcopy(load_fixture("candidate.json"))  # nodes: n1 (activity), j1 (junction)
    child = copy.deepcopy(load_fixture("candidate.json"))
    child["process_name"] = "زیرفرایند تأیید"
    child["idef0"] = {"inputs": ["درخواست"], "controls": [], "outputs": ["تأیید"], "mechanisms": ["مدیر"]}
    parent["subprocesses"] = [{"parent_key": "n1", "process": child}]
    return parent


def test_build_new_creates_child_and_links(data_root):
    parent, children = build_new(_candidate_with_child(), "cooking", RUN, NOW, root=data_root)
    assert parent["id"] == "cooking-001"
    assert len(children) == 1
    child = children[0]
    assert child["id"] == "cooking-002"                       # sequential from same dept counter
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n001"}
    assert child["source"]["type"] == "auto"
    # parent box points at the child
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n001")
    assert box["subprocess"] == "cooking-002"
    # ICOM boundary sync: parent box icom == child idef0 (child wins)
    assert box["icom"] == child["idef0"]
    validate("process.schema.json", parent)
    validate("process.schema.json", child)


def test_child_nodes_are_laid_out(data_root):
    _, children = build_new(_candidate_with_child(), "cooking", RUN, NOW, root=data_root)
    for n in children[0]["nodes"]:
        assert "position" in n and n["layout"] == "auto"


def test_duplicate_subprocess_on_same_box_rejected(data_root):
    cand = _candidate_with_child()
    cand["subprocesses"].append({"parent_key": "n1", "process": copy.deepcopy(cand["subprocesses"][0]["process"])})
    with pytest.raises(ValueError):
        build_new(cand, "cooking", RUN, NOW, root=data_root)


def test_unknown_parent_key_rejected(data_root):
    cand = _candidate_with_child()
    cand["subprocesses"][0]["parent_key"] = "ghost"
    with pytest.raises(ValueError):
        build_new(cand, "cooking", RUN, NOW, root=data_root)


def test_merge_new_wrapper_returns_parent_only(data_root):
    proc = merge_new(load_fixture("candidate.json"), "cooking", RUN, NOW, root=data_root)
    assert proc["id"] == "cooking-001"          # existing behaviour preserved (no subprocesses)


def test_source_ref_survives_attempt_rerun(data_root):
    # re-run run_dir is runs/<voice>/attempt-NN — ref must be the voice, not "attempt-02"
    parent, children = build_new(_candidate_with_child(), "cooking",
                                 "runs/cooking-2026-07-06/attempt-02", NOW, root=data_root)
    assert parent["source"]["ref"] == "cooking-2026-07-06"
    assert children[0]["source"]["ref"] == "cooking-2026-07-06"
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest -q -k merge_subprocess`
Expected: FAIL — `cannot import name 'build_new' from 'merge'`.

- [ ] **Step 3: Refactor + implement in `engine/merge/__init__.py`**

Add `import re` at the top of `engine/merge/__init__.py`. Replace `merge_new` (lines ~35–57) with the refactored core + new functions (keep `_new_node`/`_alloc`/`_map_edges`/`_touch` as-is). Note `_voice_ref` — a grep confirmed `run.split("/")[-1]` appears ONLY at the old line 40, so this is the single place the re-run `ref` bug lives:
```python
def _voice_ref(run):
    # robust voice basename from a run path: strip a trailing attempt-NN if present
    # (a re-run's run_dir is runs/<voice>/attempt-NN — the last component is NOT the voice)
    parts = run.rstrip("/").split("/")
    if re.fullmatch(r"attempt-\d{2,}", parts[-1]) and len(parts) >= 2:
        return parts[-2]
    return parts[-1]


def _build_process(cand, dept, pid, run, now, parent, source_type):
    process = {"id": pid, "department": dept, "name": cand["process_name"],
               "summary": cand["summary"],
               "source": {"type": source_type, "ref": _voice_ref(run), "run": run},
               "parent": parent, "created_at": now, "updated_at": now,
               "idef0": cand["idef0"], "kpis": cand["kpis"],
               "nodes": [], "edges": [], "pending": []}
    keymap = {}
    for cn in cand["nodes"]:
        nid = _alloc(process, cn)
        keymap[cn["key"]] = nid
        process["nodes"].append(_new_node(cn, nid, run))
    keys = set(keymap)
    for e in cand["edges"]:
        if e["from"] not in keys or e["to"] not in keys:
            raise ValueError(f"candidate edge references unknown node key: {e}")
    process["edges"] = _map_edges(cand["edges"], keymap)
    full_relayout(process)
    return process, keymap


def _sync_icom(parent_node, child_idef0, run):
    # the box boundary IS its sub-process: child idef0 is authoritative (always wins)
    parent_node["icom"] = child_idef0
    _touch(parent_node, run)


def _attach_subprocesses(parent, keymap, entries, run, now, root, ref_field):
    children = []
    dept = parent["department"]
    byid = {n["id"]: n for n in parent["nodes"]}
    for ent in entries:
        ref = ent[ref_field]
        node_id = keymap.get(ref, ref)              # temp key -> real id, or an already-real id
        node = byid.get(node_id)
        if node is None or node.get("type") != "activity":
            raise ValueError(f"subprocess parent '{ref}' is not an activity node in {parent['id']}")
        if node.get("subprocess") is not None:
            raise ValueError(f"node {node_id} already has subprocess {node['subprocess']}; duplicate")
        child_pid = next_process_id(dept, root, reserved={parent["id"]} | {c["id"] for c in children})
        child, _ = _build_process(ent["process"], dept, child_pid, run, now,
                                  parent={"process": parent["id"], "node": node_id},
                                  source_type="auto")
        node["subprocess"] = child_pid
        _sync_icom(node, child["idef0"], run)
        children.append(child)
    return children


def build_new(candidate, dept, run, now, root=None):
    validate("candidate.schema.json", candidate)
    pid = next_process_id(dept, root)
    parent, keymap = _build_process(candidate, dept, pid, run, now,
                                    parent=None, source_type="voice")
    children = _attach_subprocesses(parent, keymap, candidate.get("subprocesses", []),
                                    run, now, root, "parent_key")
    validate("process.schema.json", parent)
    for c in children:
        validate("process.schema.json", c)
    return parent, children


def merge_new(candidate, dept, run, now, root=None):
    return build_new(candidate, dept, run, now, root)[0]
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest -q -k "merge_subprocess or merge_new"`
Expected: new subprocess tests + existing `test_merge_new.py` all pass.

- [ ] **Step 5: Commit**

```bash
git add engine/merge/__init__.py engine/tests/test_merge_subprocess.py
git commit -m "merge: build_new mints auto sub-processes (allocate-id, parent link, icom sync, layout)"
```

---

### Task 5: `merge` — `build_update` with `add_subprocesses`

**Files:**
- Modify: `code-repo/engine/merge/__init__.py` (refactor `apply_delta`; add `build_update`)
- Test: append to `code-repo/engine/tests/test_merge_subprocess.py`

**Interfaces:**
- Consumes: `_attach_subprocesses`, `_build_process` (Task 4).
- Produces:
  - `build_update(process, delta, run, now, root=None) -> (process, [child, ...])`
  - `apply_delta(process, delta, run, now, root=None) -> process` (wrapper; `root` optional, only used when `add_subprocesses` present).

- [ ] **Step 1: Write the failing test** (append)

```python
from merge import build_update


def test_build_update_adds_subprocess_on_existing_node(data_root):
    proc = copy.deepcopy(load_fixture("process.cooking-001.json"))  # has real node cooking-001-n010
    box = next(n for n in proc["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = None
    child = copy.deepcopy(load_fixture("candidate.json"))
    delta = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": [],
             "add_subprocesses": [{"parent": "cooking-001-n010", "process": child}]}
    updated, children = build_update(proc, delta, "runs/cooking-2026-07-10", NOW, root=data_root)
    assert len(children) == 1
    assert children[0]["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    box2 = next(n for n in updated["nodes"] if n["id"] == "cooking-001-n010")
    assert box2["subprocess"] == children[0]["id"]


def test_build_update_rejects_duplicate_child(data_root):
    proc = copy.deepcopy(load_fixture("process.cooking-001.json"))
    box = next(n for n in proc["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = "cooking-099"                         # already has one
    delta = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": [],
             "add_subprocesses": [{"parent": "cooking-001-n010", "process": load_fixture("candidate.json")}]}
    with pytest.raises(ValueError):
        build_update(proc, delta, "runs/x", NOW, root=data_root)
```
(If `process.cooking-001.json` has no `cooking-001-n010` activity node, use whatever activity id it does contain — check the fixture and adjust the id in the test.)

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest -q -k build_update`
Expected: FAIL — `cannot import name 'build_update'`.

- [ ] **Step 3: Refactor `apply_delta` in `engine/merge/__init__.py`**

Rename the existing `apply_delta` body into `build_update` and add the subprocess attach + child validation; keep a thin `apply_delta` wrapper:
```python
def build_update(process, delta, run, now, root=None):
    validate("delta.schema.json", delta)
    keymap, new_ids = {}, []
    for an in delta["add_nodes"]:
        nid = next_box_id(process) if an["type"] == "activity" else next_junction_id(process)
        keymap[an["key"]] = nid
        new_ids.append(nid)
        process["nodes"].append(_new_node(an, nid, run))
    valid_ep = set(keymap) | {n["id"] for n in process["nodes"]}
    for e in delta["add_edges"]:
        if e["from"] not in valid_ep or e["to"] not in valid_ep:
            raise ValueError(f"delta edge references unknown node: {e}")
    process["edges"].extend(_map_edges(delta["add_edges"], keymap))
    byid = {n["id"]: n for n in process["nodes"]}
    for en in delta["enrich_nodes"]:
        n = byid.get(en["id"])
        if n is None:
            continue
        for field, val in en["set"].items():
            cur = n.get(field)
            if is_empty(cur):
                n[field] = val
                _touch(n, run)
            elif cur != val:
                process["pending"].append(
                    {"node": en["id"], "field": field, "current": cur,
                     "proposed": val, "source": run, "status": "open"})
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
    process["updated_at"] = now
    validate("process.schema.json", process)
    for c in children:
        validate("process.schema.json", c)
    return process, children


def apply_delta(process, delta, run, now, root=None):
    return build_update(process, delta, run, now, root)[0]
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest -q -k "merge_subprocess or merge_delta or merge_new or merge_layout or merge_resolve"`
Expected: all merge tests pass (existing `test_merge_delta.py` still green — `apply_delta` behaviour preserved for deltas without `add_subprocesses`).

- [ ] **Step 5: Commit**

```bash
git add engine/merge/__init__.py engine/tests/test_merge_subprocess.py
git commit -m "merge: build_update handles delta add_subprocesses on existing/added nodes"
```

---

### Task 6: `merge` CLI — write children + print IDs + clean errors

**Files:**
- Modify: `code-repo/engine/merge/cli.py`
- Test: append to `code-repo/engine/tests/test_merge_cli.py`

**Interfaces:**
- Consumes: `build_new`, `build_update`.
- Produces: `merge new` writes parent + child files, prints parent id then `subprocess <child-id> node <parent-node-id>` lines; `merge update` prints child lines; any `ValueError` → stderr + exit 2.

- [ ] **Step 1: Write the failing test** (append to `test_merge_cli.py`)

```python
def test_merge_new_cli_creates_subprocess(data_root, tmp_path):
    import copy
    parent = copy.deepcopy(load_fixture("candidate.json"))
    child = copy.deepcopy(load_fixture("candidate.json"))
    parent["subprocesses"] = [{"parent_key": "n1", "process": child}]
    cand = tmp_path / "candidate.json"
    cand.write_text(json.dumps(parent), encoding="utf-8")
    r = _run(["new", "--candidate", str(cand), "--department", "cooking",
              "--run", "runs/cooking-2026-07-06", "--now", "2026-07-06T10:00:00Z"], data_root)
    assert r.returncode == 0, r.stderr
    assert (data_root / "departments/cooking/processes/cooking-001.json").is_file()
    assert (data_root / "departments/cooking/processes/cooking-002.json").is_file()
    assert "cooking-001" in r.stdout
    assert "subprocess cooking-002 node cooking-001-n001" in r.stdout
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest -q -k merge_new_cli_creates_subprocess`
Expected: FAIL (child file not created / stdout lacks the subprocess line).

- [ ] **Step 3: Edit `engine/merge/cli.py`**

Change the import and the `new`/`update` branches:
```python
from merge import apply_delta, build_new, build_update, merge_new, resolve_pending
```
Replace the `if args.cmd == "new"` / `elif args.cmd == "update"` blocks in `main`:
```python
    try:
        if args.cmd == "new":
            _require(pathlib_exists(args.candidate), "candidate file must exist")
            parent, children = build_new(read_json(args.candidate), args.department,
                                         args.run, _now(args.now))
            write_json_atomic(_proc_path(parent["id"]), parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            print(parent["id"])
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
        elif args.cmd == "update":
            path = _proc_path(args.process)
            _require(path.is_file(), f"target process {args.process} must exist")
            _require(pathlib_exists(args.delta), "delta file must exist")
            parent, children = build_update(read_json(path), read_json(args.delta),
                                            args.run, _now(args.now))
            write_json_atomic(path, parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
        else:  # accept | reject
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = resolve_pending(read_json(path), args.index, args.cmd, _now(args.now))
            write_json_atomic(path, proc)
    except ValueError as e:
        print(f"merge: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0
```
(`merge_new`/`apply_delta` remain imported for any other callers; `sys` is already imported.)

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest -q -k merge_cli`
Expected: all CLI tests pass (existing `test_merge_new_cli_writes_valid_process` still green — no subprocesses → no extra lines).

- [ ] **Step 5: Full suite + lint**

Run: `make test` then `.venv/bin/ruff check engine`
Expected: all green; lint clean.

- [ ] **Step 6: Commit**

```bash
git add engine/merge/cli.py engine/tests/test_merge_cli.py
git commit -m "merge cli: write auto-subprocess child files, print child IDs, clean non-zero on ValueError"
```

---

### Task 7: Brain docs (data-repo)

**Files (all under `../data-repo`):**
- Modify: `.claude/skills/idef-extraction/SKILL.md` (§4, §5, §7)
- Modify: `.claude/agents/extract.md` (Sub-process flagging section)
- Modify: `.claude/skills/process-voice/SKILL.md` (Stages 6, 8, 9)
- Modify: `.claude/agents/classify.md` (Step 4, one line)

**Interfaces:**
- Consumes: the schemas/CLI behaviour built in Tasks 1–6 (the docs must match them exactly).

- [ ] **Step 1: idef-extraction §4/§5 — document the contracts**

In `§4` (candidate), after the edge/node shapes add a `#### Sub-processes (subprocesses)` block: OPTIONAL top-level `subprocesses` array; each item `{parent_key: "<temp activity key, e.g. n4>", process: <a full candidate body with its OWN temp keys>}`; the nested `process` must NOT contain `subprocesses` (single level); the parent activity node's own `subprocess` field stays `null` in the candidate — **merge** sets it. Show a minimal JSON example (parent candidate with one `subprocesses` entry).
In `§5` (delta) add the analogous `add_subprocesses` block: `{parent: "<real node id OR a temp key from add_nodes>", process: <full candidate body, no nested subprocesses>}`.
State in both: the extract agent emits temp node keys only; **never** a process/subprocess ID (INV-1).

- [ ] **Step 2: idef-extraction §7 + extract.md — threshold rewrite**

Rewrite §7 (currently "Flag-Only This Phase") to `## 7. Sub-processes (auto-create at threshold)`:
- **Threshold:** emit a child in `subprocesses`/`add_subprocesses` ONLY when a box is genuinely described with **4 or more distinct sequential sub-steps**.
- **Below threshold:** flag-only — put a short Persian note in the box `description` and report the node key to the orchestrator; do NOT create a child.
- **No recursion:** if a child's own box would itself qualify, flag-only on it.
In `extract.md`'s sub-process section, replace the flag-only-only text with the same threshold rule + point to idef-extraction for the contract; keep the "never mint IDs" line.

- [ ] **Step 3: idef-extraction + playbook Stage 6 — merge responsibilities**

Add to idef-extraction (near §5) and `process-voice` **Stage 6** a short "what merge does with sub-processes" list (the 7 steps): resolve the parent node's real id; allocate the child process id via `allocate-id`; write the child as `departments/{dept}/processes/{child-id}.json` with `parent={process,node}` and `source.type:"auto"`; set the parent node `subprocess`; sync the parent box `icom` to the child `idef0` (child wins); lay out the child (serpentine); print `subprocess <child-id> node <parent-node-id>`. Add to Stage 6: **capture the printed child IDs** (parse the `subprocess …` stdout lines) for Stage 8.

- [ ] **Step 4: playbook Stage 8/9 — meta + report**

Stage 8: record each auto-created child in `meta.json.processes` as `{id: "<child-id>", status: "new", auto_subprocess_of: "<parent-id>"}`. Stage 8/9 completion report MUST list every auto-created child in Persian: «زیرفرایند {child-id} به‌صورت خودکار زیرِ باکس {parent-node} از فرایند {parent-id} ساخته شد.» — report only, no approval pause. Note children are ordinary processes: UI-editable, classify-matchable later, user-removable (orphan not cascade, INV-4).

- [ ] **Step 5: classify.md Step 4 — one line**

Add: existing processes include auto-created sub-processes (non-null `parent`); a segment that merely elaborates an existing sub-process must match it (`update`/`unchanged` with its `existing_id`), not be emitted as `new`.

- [ ] **Step 6: Verify docs (greps)**

```bash
cd ../data-repo/.claude
grep -rniE 'subprocesses|add_subprocesses' skills/idef-extraction/SKILL.md   # present in §4 & §5
grep -rniE 'flag-only|flag only' skills/idef-extraction/SKILL.md agents/extract.md  # only as BELOW-threshold behaviour, never the overall policy
grep -rniE 'auto_subprocess_of' skills/process-voice/SKILL.md                 # Stage 8
grep -rniE '4 (or more|\+)|چهار' skills/idef-extraction/SKILL.md agents/extract.md   # threshold stated
grep -rnE '[a-z]+-[0-9]{3}-[nj][0-9]' agents/extract.md || echo NO_FINAL_ID_IN_EXTRACT
```
Confirm: `subprocesses`/`add_subprocesses` documented; "flag-only" survives only as below-threshold; threshold=4 stated; extract still mints no IDs. Re-run the process-voice 9-keyword anchor check; `grep -rniE '\.schema\.json' .claude` stays 0.

- [ ] **Step 7: Commit (data-repo)**

```bash
git -C ../data-repo add .claude/skills/idef-extraction/SKILL.md .claude/agents/extract.md .claude/skills/process-voice/SKILL.md .claude/agents/classify.md
git -C ../data-repo commit -m "brain: auto sub-process policy (threshold 4+, subprocesses/add_subprocesses, merge responsibilities, Stage 8/9 report)"
```

---

### Task 8: End-to-end verification + contract cross-check

**Files:** none (verification + fixups only).

- [ ] **Step 1: Engine suite green**

Run: `make test`
Expected: all pass (incl. `test_subprocess_schema.py`, `test_merge_subprocess.py`), plus lint `.venv/bin/ruff check engine schemas 2>/dev/null || .venv/bin/ruff check engine`.

- [ ] **Step 2: E2E smoke via the real CLI**

```bash
# craft a candidate with a 4-substep child, run merge new against a temp DATA_ROOT
python - <<'PY'
import json, pathlib, copy
base = json.load(open("tests/fixtures/candidate.json"))
child = copy.deepcopy(base); child["process_name"]="زیرفرایند"; \
  child["nodes"]=[{"key":f"n{i}","type":"activity","label":f"گام {i}","description":"","actor":"مسئول","icom":{"inputs":[],"controls":[],"outputs":[],"mechanisms":[]},"subprocess":None} for i in range(1,5)]; \
  child["edges"]=[{"from":f"n{i}","to":f"n{i+1}","label":""} for i in range(1,4)]
base["subprocesses"]=[{"parent_key":"n1","process":child}]
pathlib.Path("/tmp/cand_sub.json").write_text(json.dumps(base, ensure_ascii=False))
PY
rm -rf /tmp/dr && mkdir -p /tmp/dr/departments/cooking/processes
DATA_ROOT=/tmp/dr SCHEMA_DIR=schemas .venv/bin/merge new --candidate /tmp/cand_sub.json \
  --department cooking --run runs/cooking-2026-07-06 --now 2026-07-06T10:00:00Z
# expect stdout: cooking-001  /  subprocess cooking-002 node cooking-001-n001
DATA_ROOT=/tmp/dr SCHEMA_DIR=schemas .venv/bin/validate process /tmp/dr/departments/cooking/processes/cooking-002.json
python -c "import json;c=json.load(open('/tmp/dr/departments/cooking/processes/cooking-002.json'));p=json.load(open('/tmp/dr/departments/cooking/processes/cooking-001.json'));assert c['parent']=={'process':'cooking-001','node':'cooking-001-n001'};assert c['source']['type']=='auto';box=[n for n in p['nodes'] if n['id']=='cooking-001-n001'][0];assert box['subprocess']=='cooking-002';assert box['icom']==c['idef0'];print('E2E_OK')"
```
Expected: child validates; `E2E_OK`.

- [ ] **Step 3: Contract cross-check (docs ↔ schemas)**

Read `data-repo/.claude/skills/idef-extraction/SKILL.md` §4/§5 against `code-repo/schemas/candidate.schema.json` + `delta.schema.json`: field names (`parent_key`, `parent`, `process`), optionality, and the single-level-nesting restriction match. Read the playbook Stage 8 `auto_subprocess_of` against `run-meta.schema.json`. Fix any drift in the docs (data-repo) to match the schemas (code-repo is the source of truth).

- [ ] **Step 4: Summary report**

Report every file changed in each repo and what changed, plus `make test` results and the E2E outcome.

---

## Self-Review

**Spec coverage:** A1 candidate/delta schemas → Task 2; (process+run-meta consequences → Task 1). A2 merge 7 steps → Tasks 4–6 (`_attach_subprocesses` steps 1–7; print in cli). A3 five test groups → Tasks 1,2,4,5,6 (child file+link+icom+seq ids; delta; duplicate reject; schema round-trip incl. nested-reject; layout on child). B1 threshold → Task 7 step 2. B2 contracts → Task 7 step 1. B3 extract rewrite → Task 7 step 2. B4 merge responsibilities → Task 7 step 3. B5 reporting (Stage 8 meta + Persian report, no gate) → Task 7 step 4. B6 classify awareness → Task 7 step 5. PART C → Task 8. INV-1/4/5 in Global Constraints.

**Placeholder scan:** engine code is complete in each step; doc tasks give content contracts + exact greps (prose authoring is the implementation act, matching the Phase-3 plan convention). Task 5 flags a fixture-id check (use the fixture's actual activity id).

**Type/name consistency:** `build_new`/`build_update` return `(parent, children)`; `merge_new`/`apply_delta` return the single process (back-compat, verified by existing tests); `_attach_subprocesses(parent, keymap, entries, run, now, root, ref_field)` used by both with `ref_field` = `"parent_key"` (candidate) / `"parent"` (delta); `next_process_id(dept, root, reserved)`; stdout `subprocess <child-id> node <parent-node-id>` matches the Stage-6 parse and the cli test.
