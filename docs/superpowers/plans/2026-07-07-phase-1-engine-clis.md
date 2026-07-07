# Phase 1 — Deterministic Engine CLIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four deterministic engine CLIs — `allocate-id`, `layout`, `merge`, `transcribe` — the trust anchor (INV-1) that turns extract-agent output into valid `process.json` on disk, generates all IDs, lays out flowcharts, and transcribes audio. Everything is built test-first against the Phase-0 schemas and fixtures.

**Architecture:** One installable Python package under `engine/` exposing four console scripts. `allocate-id`, `layout`, `merge` are pure stdlib + `jsonschema` (validate every output against `schemas/` before writing). `transcribe` calls Gemini-on-Vertex behind a `Transcriber` seam (a fake in unit tests; the real Vertex call is a deferred, skipped integration test since GCP isn't set up). All state lives on disk under `DATA_ROOT`; writes are atomic (temp file + `os.replace`). The LLM never generates an ID (INV-1), never deletes (INV-4 — removals are flagged), and never overwrites a filled value (FR-M3 — conflicts become `pending` rows).

**Tech Stack:** Python 3.12 (ARD floor 3.11+), `jsonschema` (already a dev dep), `google-genai~=1.16` (optional extra, lazy-imported), pytest, ruff. Reuses the Phase-0 `make test`/`.venv` harness.

## Global Constraints

- **Python:** 3.11+. Determinism is mandatory: no `Date.now()`/`random`. Timestamps (`created_at`/`updated_at`) are passed in as an ISO-8601 UTC string parameter (`now`); CLIs default it to `datetime.now(timezone.utc)`, tests pass a fixed value.
- **IDs only via `allocate-id`** (INV-1): process `^[a-z]+-[0-9]{3}$`, box `^[a-z]+-[0-9]{3}-n[0-9]{3}$`, junction `^[a-z]+-[0-9]{3}-j[0-9]+$`. Rule: scan disk, "highest existing number + 1"; never a counter file. Flagged-removed nodes still occupy their ID (they remain in the file), so IDs are never reused (INV-4).
- **No fabrication / no overwrite (FR-M3, INV-3):** `enrich` fills only EMPTY fields; changing a FILLED value creates a `pending` row `{node, field, current, proposed, source, status:"open"}` and leaves the original untouched.
- **No deletion (INV-4):** `flag_removed` sets `removed: true` on the node; nothing is ever removed from `nodes`/`edges`.
- **Validate before write:** every `process.json` written by `merge` must pass `schemas/process.schema.json`; inputs are validated against their schema (`candidate`/`delta`) before use.
- **Atomic writes:** temp file in the target dir + `os.replace`.
- **`DATA_ROOT`** from env (per `config/engine.env.example`); schemas found via `SCHEMA_DIR` env or a dev fallback to the repo `schemas/`.
- **Layout constants** (mirror the design prototype `buildData()` for visual consistency): `PER_ROW=4`, `SX=40`, `SY=90`, `GX=210`, `GY=175`; serpentine (boustrophedon) — row 0 L→R, row 1 R→L, one step down between rows. `layout: manual` nodes are never moved except on an explicit full re-layout.
- **Package layout:** `engine/` is the project; subpackages `engine_common/`, `allocate_id/`, `layout/`, `merge/`, `transcribe/`; console scripts wired in `engine/pyproject.toml`. Tests in `engine/tests/`, run by the root `make test`.

**Build order (dependencies flow downward):** Task 1 (package + shared IO) → Task 2 (schema extension: `removed`) → Task 3 (`allocate-id`) → Tasks 4–5 (`layout`: topo + serpentine) → Tasks 6–9 (`merge`) → Task 10 (`transcribe`) → Task 11 (wrap-up). `merge` depends on `allocate-id` + `layout`; `transcribe` is independent.

---

### Task 1: engine package skeleton + shared IO helpers

**Files:**
- Create: `engine/pyproject.toml`
- Create: `engine/engine_common/__init__.py`
- Create: `engine/tests/__init__.py`
- Create: `engine/tests/conftest.py`
- Create: `engine/tests/test_common.py`
- Modify: `requirements-dev.txt` (add `-e ./engine`)
- Modify: `pyproject.toml` (root — add `engine/tests` to testpaths)

**Interfaces:**
- Produces (`engine_common`): `data_root() -> Path`, `schema_dir() -> Path`, `read_json(path)`, `write_json_atomic(path, obj)`, `validate(schema_name, instance)` (raises `ValueError` on failure), `is_empty(value) -> bool`.

- [ ] **Step 1: Create the package manifest**

`engine/pyproject.toml`:
```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "inja-engine"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["jsonschema~=4.23"]

[project.optional-dependencies]
vertex = ["google-genai~=1.16"]

[project.scripts]
allocate-id = "allocate_id.cli:main"
layout = "layout.cli:main"
merge = "merge.cli:main"
transcribe = "transcribe.cli:main"

[tool.setuptools.packages.find]
include = ["engine_common*", "allocate_id*", "layout*", "merge*", "transcribe*"]
```

- [ ] **Step 2: Write the failing test**

`engine/tests/__init__.py`: empty file.

`engine/tests/conftest.py`:
```python
import json
import pathlib

import pytest

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "tests" / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    """A temp DATA_ROOT with the departments/ skeleton; DATA_ROOT env pointed at it."""
    root = tmp_path / "data"
    for sub in ("departments/cooking/processes", "meetings/audio",
                "meetings/transcripts", "runs"):
        (root / sub).mkdir(parents=True)
    monkeypatch.setenv("DATA_ROOT", str(root))
    return root
```

`engine/tests/test_common.py`:
```python
import pathlib

import pytest

from engine_common import (data_root, is_empty, read_json, schema_dir,
                           validate, write_json_atomic)


def test_data_root_reads_env(data_root):
    assert data_root().is_dir()


def test_data_root_unset_raises(monkeypatch):
    monkeypatch.delenv("DATA_ROOT", raising=False)
    with pytest.raises(SystemExit):
        data_root()


def test_schema_dir_finds_process_schema():
    assert (schema_dir() / "process.schema.json").is_file()


def test_write_atomic_roundtrip(tmp_path):
    p = tmp_path / "sub" / "x.json"
    write_json_atomic(p, {"a": 1, "fa": "پخت"})
    assert read_json(p) == {"a": 1, "fa": "پخت"}
    assert p.read_text(encoding="utf-8").endswith("\n")


def test_validate_accepts_good_and_rejects_bad():
    from conftest import load_fixture
    validate("process.schema.json", load_fixture("process.cooking-001.json"))
    with pytest.raises(ValueError):
        validate("process.schema.json", {"id": "bad"})


@pytest.mark.parametrize("v,expected", [
    ("", True), ("  ", True), ("x", False), (None, True),
    ([], True), (["a"], False), ({}, True),
    ({"inputs": [], "controls": [], "outputs": [], "mechanisms": []}, True),
    ({"inputs": ["x"]}, False),
])
def test_is_empty(v, expected):
    assert is_empty(v) is expected
```

- [ ] **Step 3: Wire the harness and run to verify it fails**

Append to `requirements-dev.txt`:
```
-e ./engine
```
In root `pyproject.toml`, change `testpaths = ["tests"]` to `testpaths = ["tests", "engine/tests"]`.

Run: `make clean && make test`
Expected: FAIL — `ModuleNotFoundError: No module named 'engine_common'` (package has no code yet).

- [ ] **Step 4: Implement `engine_common`**

`engine/engine_common/__init__.py`:
```python
import json
import os
import pathlib
import tempfile

from jsonschema import Draft202012Validator


def data_root():
    r = os.environ.get("DATA_ROOT")
    if not r:
        raise SystemExit("DATA_ROOT is not set")
    return pathlib.Path(r)


def schema_dir():
    d = os.environ.get("SCHEMA_DIR")
    if d:
        return pathlib.Path(d)
    # engine/engine_common/__init__.py -> parents[2] == code-repo root
    return pathlib.Path(__file__).resolve().parents[2] / "schemas"


def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def write_json_atomic(path, obj):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


_VALIDATORS = {}


def validate(schema_name, instance):
    v = _VALIDATORS.get(schema_name)
    if v is None:
        schema = read_json(schema_dir() / schema_name)
        Draft202012Validator.check_schema(schema)
        v = Draft202012Validator(schema)
        _VALIDATORS[schema_name] = v
    errors = sorted(v.iter_errors(instance), key=lambda e: list(e.path))
    if errors:
        msg = "; ".join(e.message for e in errors[:5])
        raise ValueError(f"{schema_name} validation failed: {msg}")


def is_empty(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, dict):
        return all(is_empty(v) for v in value.values())
    if isinstance(value, list):
        return len(value) == 0
    return False
```

- [ ] **Step 5: Run to verify it passes**

Run: `make test`
Expected: PASS (engine `test_common` + all Phase-0 tests).

- [ ] **Step 6: Commit**

```bash
git add engine/pyproject.toml engine/engine_common engine/tests requirements-dev.txt pyproject.toml
git commit -m "feat(engine): package skeleton + shared IO/validate helpers"
```

---

### Task 2: process.schema extension — optional `removed` flag on nodes

**Files:**
- Modify: `schemas/process.schema.json` (add optional `removed` boolean to each node variant)
- Modify: `tests/test_process_schema.py` (add a test that `removed: true` validates)

**Interfaces:**
- Produces: the process contract now permits `removed: true` on any node, which `merge` (Task 7) sets for `flag_removed` (INV-4). Absent = not removed.

**Context:** `merge`'s `flag_removed` must mark a node without deleting it, but the current node variants use `additionalProperties: false` and have no such field. This adds it. It's optional, so all existing fixtures stay valid.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_process_schema.py`:
```python
def test_node_removed_flag_allowed(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:
        if n["type"] == "activity":
            n["removed"] = True
            break
    assert validate(SCHEMA, p) == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL on `test_node_removed_flag_allowed` — `additionalProperties: false` rejects `removed`.

- [ ] **Step 3: Add `removed` to each node variant**

In `schemas/process.schema.json`, add `"removed": { "type": "boolean" }` to the `properties` of `activityNode`, `terminalNode`, and `junctionNode` (do NOT add it to `required`). Leave `additionalProperties: false` as-is.

- [ ] **Step 4: Run to verify it passes**

Run: `make test`
Expected: PASS (new test + all prior).

- [ ] **Step 5: Commit**

```bash
git add schemas/process.schema.json tests/test_process_schema.py
git commit -m "feat(schema): optional node 'removed' flag for merge flag_removed (INV-4)"
```

---

### Task 3: allocate-id

**Files:**
- Create: `allocate_id/__init__.py` (i.e. `engine/allocate_id/__init__.py`)
- Create: `engine/allocate_id/cli.py`
- Create: `engine/tests/test_allocate_id.py`

**Interfaces:**
- Consumes: `engine_common.data_root`.
- Produces: `next_process_id(dept, root=None) -> str`, `next_box_id(process, pid=None) -> str`, `next_junction_id(process, pid=None) -> str`, and `main()` for the `allocate-id` console script.

- [ ] **Step 1: Write the failing test**

`engine/tests/test_allocate_id.py`:
```python
import json

from allocate_id import next_box_id, next_junction_id, next_process_id
from conftest import load_fixture


def _write_proc(root, pid):
    p = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    p.write_text(json.dumps({"id": pid}), encoding="utf-8")


def test_first_process_id_is_001(data_root):
    assert next_process_id("cooking", data_root()) == "cooking-001"


def test_process_id_is_max_plus_one(data_root):
    _write_proc(data_root(), "cooking-001")
    _write_proc(data_root(), "cooking-003")
    assert next_process_id("cooking", data_root()) == "cooking-004"


def test_box_and_junction_ids_from_nodes():
    p = load_fixture("process.cooking-001.json")  # has n010, n060, j1
    assert next_box_id(p) == "cooking-001-n061"
    assert next_junction_id(p) == "cooking-001-j2"


def test_removed_nodes_still_hold_their_id():
    p = {"id": "cooking-001", "nodes": [
        {"id": "cooking-001-n010", "type": "activity", "removed": True}]}
    # a flagged-removed node keeps its number reserved (never reused)
    assert next_box_id(p) == "cooking-001-n011"
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL — `ModuleNotFoundError: No module named 'allocate_id'`.

- [ ] **Step 3: Implement `allocate_id`**

`engine/allocate_id/__init__.py`:
```python
import re

from engine_common import data_root


def next_process_id(dept, root=None):
    root = root or data_root()
    d = root / "departments" / dept / "processes"
    rx = re.compile(rf"^{re.escape(dept)}-(\d{{3}})$")
    mx = 0
    if d.is_dir():
        for f in d.glob("*.json"):
            m = rx.match(f.stem)
            if m:
                mx = max(mx, int(m.group(1)))
    return f"{dept}-{mx + 1:03d}"


def _max_suffix(process, pattern):
    rx = re.compile(pattern)
    mx = 0
    for n in process.get("nodes", []):
        m = rx.match(n.get("id", ""))
        if m:
            mx = max(mx, int(m.group(1)))
    return mx


def next_box_id(process, pid=None):
    pid = pid or process["id"]
    mx = _max_suffix(process, rf"^{re.escape(pid)}-n(\d{{3}})$")
    return f"{pid}-n{mx + 1:03d}"


def next_junction_id(process, pid=None):
    pid = pid or process["id"]
    mx = _max_suffix(process, rf"^{re.escape(pid)}-j(\d+)$")
    return f"{pid}-j{mx + 1}"
```

`engine/allocate_id/cli.py`:
```python
import argparse

from engine_common import read_json
from allocate_id import next_box_id, next_junction_id, next_process_id


def main(argv=None):
    ap = argparse.ArgumentParser(prog="allocate-id")
    sub = ap.add_subparsers(dest="kind", required=True)
    p = sub.add_parser("process")
    p.add_argument("department")
    for kind in ("box", "junction"):
        s = sub.add_parser(kind)
        s.add_argument("process_file")
    args = ap.parse_args(argv)
    if args.kind == "process":
        print(next_process_id(args.department))
    else:
        proc = read_json(args.process_file)
        print(next_box_id(proc) if args.kind == "box" else next_junction_id(proc))
    return 0
```

- [ ] **Step 4: Run to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/allocate_id engine/tests/test_allocate_id.py
git commit -m "feat(engine): allocate-id CLI (process/box/junction, max+1, no reuse)"
```

---

### Task 4: layout — topological order

**Files:**
- Create: `layout/__init__.py` (i.e. `engine/layout/__init__.py`)
- Create: `engine/tests/test_layout_topo.py`

**Interfaces:**
- Produces: `topo_order(nodes, edges) -> list[str]` — deterministic topological order of node IDs (ties broken by original node order; leftover cycle nodes appended in original order).

- [ ] **Step 1: Write the failing test**

`engine/tests/test_layout_topo.py`:
```python
from layout import topo_order


def test_linear_order():
    nodes = [{"id": "start"}, {"id": "a"}, {"id": "b"}, {"id": "end"}]
    edges = [{"from": "start", "to": "a"}, {"from": "a", "to": "b"},
             {"from": "b", "to": "end"}]
    assert topo_order(nodes, edges) == ["start", "a", "b", "end"]


def test_branch_keeps_predecessors_before_successors():
    nodes = [{"id": "s"}, {"id": "j"}, {"id": "x"}, {"id": "y"}, {"id": "e"}]
    edges = [{"from": "s", "to": "j"}, {"from": "j", "to": "x"},
             {"from": "j", "to": "y"}, {"from": "x", "to": "e"},
             {"from": "y", "to": "e"}]
    order = topo_order(nodes, edges)
    assert order.index("j") < order.index("x") < order.index("e")
    assert order.index("j") < order.index("y") < order.index("e")


def test_deterministic_tiebreak_uses_input_order():
    nodes = [{"id": "b"}, {"id": "a"}]  # two roots, no edges
    assert topo_order(nodes, []) == ["b", "a"]


def test_cycle_nodes_appended_not_dropped():
    nodes = [{"id": "a"}, {"id": "b"}]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]
    assert sorted(topo_order(nodes, edges)) == ["a", "b"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL — `ModuleNotFoundError: No module named 'layout'`.

- [ ] **Step 3: Implement `topo_order`**

`engine/layout/__init__.py`:
```python
import heapq
from collections import defaultdict


def topo_order(nodes, edges):
    ids = [n["id"] for n in nodes]
    idx = {i: k for k, i in enumerate(ids)}
    succ = defaultdict(list)
    indeg = {i: 0 for i in ids}
    for e in edges:
        if e["from"] in indeg and e["to"] in indeg:
            succ[e["from"]].append(e["to"])
            indeg[e["to"]] += 1
    ready = [idx[i] for i in ids if indeg[i] == 0]
    heapq.heapify(ready)  # smallest input-index first => stable tiebreak
    out, seen = [], set()
    while ready:
        nid = ids[heapq.heappop(ready)]
        if nid in seen:
            continue
        seen.add(nid)
        out.append(nid)
        for t in succ[nid]:
            indeg[t] -= 1
            if indeg[t] == 0:
                heapq.heappush(ready, idx[t])
    for i in ids:  # cycle leftovers, original order
        if i not in seen:
            out.append(i)
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/layout/__init__.py engine/tests/test_layout_topo.py
git commit -m "feat(engine): deterministic topological order for layout"
```

---

### Task 5: layout — serpentine positions + CLI

**Files:**
- Modify: `engine/layout/__init__.py` (add constants, `cell`, `full_relayout`, `local_relayout`)
- Create: `engine/layout/cli.py`
- Create: `engine/tests/test_layout_serpentine.py`

**Interfaces:**
- Consumes: `topo_order`, `engine_common` IO.
- Produces: `cell(k) -> {"x","y"}`, `full_relayout(process)` (repositions every node by topo order, sets `layout:"auto"`), `local_relayout(process, from_index)` (repositions from `from_index` onward, skipping `layout:"manual"`), and `main()` for the `layout` console script (`layout <process.json> [--from-node ID] [--full]`, writes in place).

- [ ] **Step 1: Write the failing test**

`engine/tests/test_layout_serpentine.py`:
```python
import copy

from conftest import load_fixture
from layout import cell, full_relayout, local_relayout


def test_serpentine_row_directions():
    # PER_ROW=4, SX=40, GX=210 => row0 L->R, row1 R->L
    assert cell(0) == {"x": 40, "y": 90}
    assert cell(3)["x"] == 40 + 3 * 210      # last of row 0 (rightmost)
    assert cell(4)["x"] == 40 + 3 * 210      # first of row 1 (also rightmost => serpentine)
    assert cell(4)["y"] == 90 + 175          # next row down


def test_full_relayout_positions_all_and_sets_auto():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:            # dirty positions/layout
        n["position"] = {"x": -1, "y": -1}
    p["nodes"][3]["layout"] = "manual"
    full_relayout(p)
    order = [n["id"] for n in p["nodes"]]
    assert all(n["position"] != {"x": -1, "y": -1} for n in p["nodes"])
    assert all(n["layout"] == "auto" for n in p["nodes"])  # full overrides manual


def test_local_relayout_preserves_upstream_and_manual():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    from layout import topo_order
    order = topo_order(p["nodes"], p["edges"])
    byid = {n["id"]: n for n in p["nodes"]}
    upstream_id = order[0]
    upstream_pos = dict(byid[upstream_id]["position"])
    # mark a downstream node manual; it must keep its position
    manual_id = order[-1]
    byid[manual_id]["layout"] = "manual"
    manual_pos = dict(byid[manual_id]["position"])
    local_relayout(p, from_index=1)
    assert byid[upstream_id]["position"] == upstream_pos   # upstream untouched
    assert byid[manual_id]["position"] == manual_pos       # manual untouched
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL — `ImportError: cannot import name 'cell'`.

- [ ] **Step 3: Implement layout positioning**

Append to `engine/layout/__init__.py`:
```python
PER_ROW = 4
SX, SY, GX, GY = 40, 90, 210, 175


def cell(k):
    row, col = divmod(k, PER_ROW)
    if row % 2 == 1:
        col = PER_ROW - 1 - col
    return {"x": SX + col * GX, "y": SY + row * GY}


def full_relayout(process):
    order = topo_order(process["nodes"], process["edges"])
    byid = {n["id"]: n for n in process["nodes"]}
    for k, nid in enumerate(order):
        n = byid[nid]
        n["position"] = cell(k)
        n["layout"] = "auto"


def local_relayout(process, from_index=0):
    order = topo_order(process["nodes"], process["edges"])
    byid = {n["id"]: n for n in process["nodes"]}
    for k in range(from_index, len(order)):
        n = byid[order[k]]
        if n.get("layout") == "manual":
            continue
        n["position"] = cell(k)
```

`engine/layout/cli.py`:
```python
import argparse

from engine_common import read_json, validate, write_json_atomic
from layout import full_relayout, local_relayout, topo_order


def main(argv=None):
    ap = argparse.ArgumentParser(prog="layout")
    ap.add_argument("process_file")
    ap.add_argument("--from-node", default=None)
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args(argv)
    proc = read_json(args.process_file)
    if args.full or args.from_node is None:
        full_relayout(proc)
    else:
        order = topo_order(proc["nodes"], proc["edges"])
        local_relayout(proc, order.index(args.from_node))
    validate("process.schema.json", proc)
    write_json_atomic(args.process_file, proc)
    return 0
```

- [ ] **Step 4: Run to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/layout engine/tests/test_layout_serpentine.py
git commit -m "feat(engine): serpentine layout (full + local re-layout) + layout CLI"
```

---

### Task 6: merge — create a new process from a candidate graph

**Files:**
- Create: `merge/__init__.py` (i.e. `engine/merge/__init__.py`)
- Create: `engine/tests/test_merge_new.py`

**Interfaces:**
- Consumes: `allocate_id`, `layout`, `engine_common`.
- Produces: `merge_new(candidate, dept, run, now, root=None) -> process(dict)` — validates the candidate, allocates a process ID and node IDs (INV-1), maps temp edge keys to real IDs, lays out (full serpentine), and validates the result against `process.schema.json`. Does NOT write to disk (Task 9's CLI does).

- [ ] **Step 1: Write the failing test**

`engine/tests/test_merge_new.py`:
```python
from conftest import load_fixture
from engine_common import validate
from merge import merge_new

RUN = "runs/cooking-2026-07-06"
NOW = "2026-07-06T10:00:00Z"


def test_merge_new_builds_valid_process(data_root):
    cand = load_fixture("candidate.json")           # 1 activity (n1) + 1 junction (j1)
    proc = merge_new(cand, "cooking", RUN, NOW, root=data_root())
    validate("process.schema.json", proc)           # raises if invalid
    assert proc["id"] == "cooking-001"
    assert proc["created_at"] == NOW and proc["updated_at"] == NOW
    assert proc["source"] == {"type": "voice", "ref": "cooking-2026-07-06", "run": RUN}


def test_merge_new_allocates_real_ids_not_temp_keys(data_root):
    cand = load_fixture("candidate.json")
    proc = merge_new(cand, "cooking", RUN, NOW, root=data_root())
    ids = [n["id"] for n in proc["nodes"]]
    assert "cooking-001-n001" in ids          # activity temp 'n1' -> real box id
    assert "cooking-001-j1" in ids            # junction temp 'j1' -> real junction id
    assert "n1" not in ids and "j1" not in [n["id"] for n in proc["nodes"]]
    # every edge endpoint is a real node id
    node_ids = set(ids)
    for e in proc["edges"]:
        assert e["from"] in node_ids and e["to"] in node_ids


def test_merge_new_second_process_increments(data_root):
    (data_root() / "departments/cooking/processes/cooking-001.json").write_text(
        '{"id": "cooking-001"}', encoding="utf-8")
    proc = merge_new(load_fixture("candidate.json"), "cooking", RUN, NOW,
                     root=data_root())
    assert proc["id"] == "cooking-002"
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL — `ModuleNotFoundError: No module named 'merge'`.

- [ ] **Step 3: Implement `merge_new`**

`engine/merge/__init__.py`:
```python
from allocate_id import next_box_id, next_junction_id, next_process_id
from engine_common import validate
from layout import full_relayout


def _new_node(cand_node, nid, run):
    if cand_node["type"] == "activity":
        return {"id": nid, "type": "activity", "label": cand_node["label"],
                "description": cand_node["description"], "actor": cand_node["actor"],
                "icom": cand_node["icom"], "subprocess": cand_node["subprocess"],
                "position": {"x": 0, "y": 0}, "layout": "auto",
                "source": {"created_by": run, "touched_by": []}}
    return {"id": nid, "type": "junction", "junctionType": cand_node["junctionType"],
            "direction": cand_node["direction"], "position": {"x": 0, "y": 0},
            "layout": "auto"}


def _alloc(process, cand_node):
    if cand_node["type"] == "activity":
        return next_box_id(process)
    return next_junction_id(process)


def _map_edges(edges, keymap):
    out = []
    for e in edges:
        ne = {"from": keymap.get(e["from"], e["from"]),
              "to": keymap.get(e["to"], e["to"])}
        if e.get("label"):
            ne["label"] = e["label"]
        out.append(ne)
    return out


def merge_new(candidate, dept, run, now, root=None):
    validate("candidate.schema.json", candidate)
    pid = next_process_id(dept, root)
    process = {"id": pid, "department": dept, "name": candidate["process_name"],
               "summary": candidate["summary"],
               "source": {"type": "voice", "ref": run.split("/")[-1], "run": run},
               "parent": None, "created_at": now, "updated_at": now,
               "idef0": candidate["idef0"], "kpis": candidate["kpis"],
               "nodes": [], "edges": [], "pending": []}
    keymap = {}
    for cn in candidate["nodes"]:
        nid = _alloc(process, cn)            # sees nodes appended so far -> n001, n002...
        keymap[cn["key"]] = nid
        process["nodes"].append(_new_node(cn, nid, run))
    process["edges"] = _map_edges(candidate["edges"], keymap)
    full_relayout(process)
    validate("process.schema.json", process)
    return process
```

- [ ] **Step 4: Run to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/merge/__init__.py engine/tests/test_merge_new.py
git commit -m "feat(engine): merge_new — candidate graph -> valid process (INV-1)"
```

---

### Task 7: merge — apply an update delta (enrich / conflict / flag-removed)

**Files:**
- Modify: `engine/merge/__init__.py` (add `apply_delta`)
- Create: `engine/tests/test_merge_delta.py`

**Interfaces:**
- Produces: `apply_delta(process, delta, run, now) -> process` — adds nodes (new IDs), maps temp edge keys, enriches EMPTY fields only, records conflicts as `pending` rows (FR-M3), flags removed nodes (`removed:true`, INV-4), updates `touched_by`/`updated_at`, and re-lays out from the earliest new node (Task 8 refines the layout call). Preserves existing IDs and positions (FR-M2).

- [ ] **Step 1: Write the failing test**

`engine/tests/test_merge_delta.py`:
```python
import copy

from conftest import load_fixture
from engine_common import validate
from merge import apply_delta

RUN = "runs/cooking-2026-07-10"
NOW = "2026-07-10T09:00:00Z"


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_enrich_fills_empty_field_only(data_root):
    p = _proc()
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    n["description"] = ""                      # empty -> should be filled
    delta = {"add_nodes": [], "add_edges": [], "flag_removed": [],
             "enrich_nodes": [{"id": "cooking-001-n010",
                               "set": {"description": "filled now"}}]}
    apply_delta(p, delta, RUN, NOW)
    assert n["description"] == "filled now"
    assert not p["pending"]                     # no conflict, it was empty
    assert RUN in n["source"]["touched_by"]


def test_filled_value_change_becomes_pending_not_overwrite(data_root):
    p = _proc()
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    original = n["actor"]                        # 'کارپرداز' (filled)
    delta = {"add_nodes": [], "add_edges": [], "flag_removed": [],
             "enrich_nodes": [{"id": "cooking-001-n010",
                               "set": {"actor": "انباردار"}}]}
    apply_delta(p, delta, RUN, NOW)
    assert n["actor"] == original               # ORIGINAL UNTOUCHED (FR-M3)
    row = next(r for r in p["pending"] if r["node"] == "cooking-001-n010"
               and r["field"] == "actor")
    assert row["current"] == original and row["proposed"] == "انباردار"
    assert row["status"] == "open" and row["source"] == RUN


def test_flag_removed_marks_not_deletes(data_root):
    p = _proc()
    before = len(p["nodes"])
    delta = {"add_nodes": [], "add_edges": [], "enrich_nodes": [],
             "flag_removed": [{"id": "cooking-001-n060"}]}
    apply_delta(p, delta, RUN, NOW)
    assert len(p["nodes"]) == before            # nothing deleted (INV-4)
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n060")
    assert n["removed"] is True


def test_add_node_gets_new_id_and_preserves_existing(data_root):
    p = _proc()
    existing_ids = {n["id"] for n in p["nodes"]}
    existing_pos = {n["id"]: dict(n["position"]) for n in p["nodes"]
                    if n.get("layout") == "manual"}
    delta = {"add_nodes": [{"key": "n1", "type": "activity", "label": "کنترل کیفیت",
                            "description": "", "actor": "انباردار",
                            "icom": {"inputs": [], "controls": [], "outputs": [],
                                     "mechanisms": []}, "subprocess": None}],
             "add_edges": [{"from": "cooking-001-n060", "to": "n1"}],
             "enrich_nodes": [], "flag_removed": []}
    apply_delta(p, delta, RUN, NOW)
    validate("process.schema.json", p)
    new = [n for n in p["nodes"] if n["id"] not in existing_ids]
    assert len(new) == 1 and new[0]["id"].startswith("cooking-001-n")
    # temp key mapped in the edge
    assert any(e["to"] == new[0]["id"] for e in p["edges"])
    # a manual node's position is preserved
    for nid, pos in existing_pos.items():
        assert next(n for n in p["nodes"] if n["id"] == nid)["position"] == pos
    assert p["updated_at"] == NOW
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL — `ImportError: cannot import name 'apply_delta'`.

- [ ] **Step 3: Implement `apply_delta`**

Append to `engine/merge/__init__.py`:
```python
from allocate_id import next_box_id, next_junction_id  # (already imported above)
from engine_common import is_empty
from layout import local_relayout, topo_order


def _touch(node, run):
    if "source" in node:
        tb = node["source"].setdefault("touched_by", [])
        if run not in tb:
            tb.append(run)


def apply_delta(process, delta, run, now):
    validate("delta.schema.json", delta)
    keymap, new_ids = {}, []
    for an in delta["add_nodes"]:
        nid = next_box_id(process) if an["type"] == "activity" \
            else next_junction_id(process)
        keymap[an["key"]] = nid
        new_ids.append(nid)
        process["nodes"].append(_new_node(an, nid, run))
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

    if new_ids:
        order = topo_order(process["nodes"], process["edges"])
        local_relayout(process, min(order.index(i) for i in new_ids))
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process
```

- [ ] **Step 4: Run to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/merge/__init__.py engine/tests/test_merge_delta.py
git commit -m "feat(engine): merge apply_delta — enrich/conflict/flag-removed (FR-M2/M3, INV-4)"
```

---

### Task 8: merge — layout on update (tail append vs. middle local re-layout)

**Files:**
- Create: `engine/tests/test_merge_layout.py`

**Interfaces:**
- Consumes: `apply_delta` (Task 7) — this task adds no new code if Task 7's `local_relayout(min new index)` already yields correct tail-vs-middle behavior; it PINS that behavior with tests. If a test fails, fix `apply_delta`'s layout call minimally (documented in Step 3).

- [ ] **Step 1: Write the failing/pinning test**

`engine/tests/test_merge_layout.py`:
```python
import copy

from conftest import load_fixture
from layout import cell, topo_order
from merge import apply_delta

RUN, NOW = "runs/cooking-2026-07-10", "2026-07-10T09:00:00Z"


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_tail_append_does_not_move_upstream(data_root):
    p = _proc()
    # make everything auto so we can compare against a clean serpentine
    from layout import full_relayout
    full_relayout(p)
    before = {n["id"]: dict(n["position"]) for n in p["nodes"]}
    last_id = topo_order(p["nodes"], p["edges"])[-1]
    delta = {"add_nodes": [{"key": "t", "type": "activity", "label": "z",
             "description": "", "actor": "", "icom": {"inputs": [], "controls": [],
             "outputs": [], "mechanisms": []}, "subprocess": None}],
             "add_edges": [{"from": last_id, "to": "t"}],
             "enrich_nodes": [], "flag_removed": []}
    apply_delta(p, delta, RUN, NOW)
    for nid, pos in before.items():                 # all pre-existing nodes unmoved
        assert next(n for n in p["nodes"] if n["id"] == nid)["position"] == pos
    # the appended node sits at the next serpentine cell
    order = topo_order(p["nodes"], p["edges"])
    tnode = next(n for n in p["nodes"] if n["label"] == "z")
    assert tnode["position"] == cell(order.index(tnode["id"]))


def test_manual_downstream_survives_middle_insert(data_root):
    p = _proc()
    from layout import full_relayout
    full_relayout(p)
    order = topo_order(p["nodes"], p["edges"])
    # pick an early edge to split; mark the last node manual
    manual = next(n for n in p["nodes"] if n["id"] == order[-1])
    manual["layout"] = "manual"
    manual["position"] = {"x": 999, "y": 999}
    src, dst = order[1], order[2]
    delta = {"add_nodes": [{"key": "m", "type": "activity", "label": "mid",
             "description": "", "actor": "", "icom": {"inputs": [], "controls": [],
             "outputs": [], "mechanisms": []}, "subprocess": None}],
             "add_edges": [{"from": src, "to": "m"}, {"from": "m", "to": dst}],
             "enrich_nodes": [], "flag_removed": []}
    apply_delta(p, delta, RUN, NOW)
    assert manual["position"] == {"x": 999, "y": 999}   # manual preserved
```

- [ ] **Step 2: Run the tests**

Run: `make test`
Expected: PASS if Task 7's layout call is correct. If `test_manual_downstream_survives_middle_insert` or `test_tail_append_does_not_move_upstream` fails, proceed to Step 3.

- [ ] **Step 3: Fix `apply_delta` layout only if a test failed**

If a test failed, the cause is the `local_relayout(min new index)` moving upstream/manual nodes. Confirm `local_relayout` (Task 5) skips `layout == "manual"` and only touches indices `>= from_index`. The expected behavior: tail append → `min new index` is at the end → only the new node is positioned; middle insert → repositions from the insert point down, skipping manual. No change should be needed; if one is, keep it to `engine/layout/__init__.py:local_relayout` and re-run.

- [ ] **Step 4: Commit**

```bash
git add engine/tests/test_merge_layout.py engine/layout/__init__.py
git commit -m "test(engine): pin merge layout — tail-append vs middle-insert, manual preserved"
```

---

### Task 9: merge — accept/reject pending + preconditions + CLI

**Files:**
- Modify: `engine/merge/__init__.py` (add `resolve_pending`, `check_preconditions`)
- Create: `engine/merge/cli.py`
- Create: `engine/tests/test_merge_resolve.py`
- Create: `engine/tests/test_merge_cli.py`

**Interfaces:**
- Produces: `resolve_pending(process, index, decision, now) -> process` (`decision` ∈ {"accept","reject"}; accept writes `proposed` into the node field and sets row `status:"accepted"`; reject sets `status:"rejected"`; original untouched until accept — INV-5), `check_preconditions(...)` (raises `SystemExit(2)` on unmet gates), and `main()` for the `merge` console script with subcommands `new`, `update`, `accept`, `reject`.

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_merge_resolve.py`:
```python
import copy

from conftest import load_fixture
from merge import resolve_pending

NOW = "2026-07-11T09:00:00Z"


def _proc_with_pending():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))  # has 1 open pending
    return p


def test_accept_applies_proposed_and_closes(data_root):
    p = _proc_with_pending()
    row = p["pending"][0]
    node = next(n for n in p["nodes"] if n["id"] == row["node"])
    resolve_pending(p, 0, "accept", NOW)
    assert node[row["field"]] == row["proposed"]
    assert p["pending"][0]["status"] == "accepted"
    assert p["updated_at"] == NOW


def test_reject_closes_without_changing_node(data_root):
    p = _proc_with_pending()
    row = p["pending"][0]
    node = next(n for n in p["nodes"] if n["id"] == row["node"])
    before = node.get(row["field"])
    resolve_pending(p, 0, "reject", NOW)
    assert node.get(row["field"]) == before
    assert p["pending"][0]["status"] == "rejected"
```

> Note: the `process.cooking-001.json` fixture's open `pending` row targets node `cooking-001-n020`, which is not among the fixture's nodes. Before Step 1, add a matching node to the fixture OR point the test at an existing node. Simplest: in this test, set `p["pending"][0]["node"] = "cooking-001-n010"` and `field="actor"` after loading, so accept has a real node to write. Do that in `_proc_with_pending()`.

`engine/tests/test_merge_cli.py`:
```python
import json
import subprocess
import sys

from conftest import load_fixture


def _run(args, root):
    return subprocess.run([sys.executable, "-m", "merge.cli", *args],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": ""} | _env())


def _env():
    import os
    return {k: v for k, v in os.environ.items() if k in ("PATH", "SCHEMA_DIR")}


def test_merge_new_cli_writes_valid_process(data_root, tmp_path):
    cand = tmp_path / "candidate.json"
    cand.write_text(json.dumps(load_fixture("candidate.json")), encoding="utf-8")
    r = _run(["new", "--candidate", str(cand), "--department", "cooking",
              "--run", "runs/cooking-2026-07-06", "--now", "2026-07-06T10:00:00Z"],
             data_root())
    assert r.returncode == 0, r.stderr
    out = data_root() / "departments/cooking/processes/cooking-001.json"
    assert out.is_file()
    proc = json.loads(out.read_text(encoding="utf-8"))
    assert proc["id"] == "cooking-001"


def test_update_missing_target_fails_precondition(data_root, tmp_path):
    delta = tmp_path / "delta.json"
    delta.write_text(json.dumps(load_fixture("delta.json")), encoding="utf-8")
    r = _run(["update", "--process", "cooking-999", "--delta", str(delta),
              "--run", "runs/x", "--now", "2026-07-06T10:00:00Z"], data_root())
    assert r.returncode == 2  # precondition gate: target process must exist
```

- [ ] **Step 2: Run to verify they fail**

Run: `make test`
Expected: FAIL — `resolve_pending` / `merge.cli` do not exist.

- [ ] **Step 3: Implement resolve + preconditions + CLI**

Append to `engine/merge/__init__.py`:
```python
def resolve_pending(process, index, decision, now):
    row = process["pending"][index]
    if row["status"] != "open":
        raise ValueError(f"pending row {index} already {row['status']}")
    if decision == "accept":
        byid = {n["id"]: n for n in process["nodes"]}
        node = byid.get(row["node"])
        if node is not None:
            node[row["field"]] = row["proposed"]
        row["status"] = "accepted"
    elif decision == "reject":
        row["status"] = "rejected"
    else:
        raise ValueError("decision must be 'accept' or 'reject'")
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process
```

`engine/merge/cli.py`:
```python
import argparse
import sys
from datetime import datetime, timezone

from engine_common import data_root, read_json, write_json_atomic
from merge import apply_delta, merge_new, resolve_pending


def _now(v):
    return v or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _proc_path(pid):
    dept = pid.rsplit("-", 1)[0]
    return data_root() / "departments" / dept / "processes" / f"{pid}.json"


def _require(cond, msg):
    if not cond:
        print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="merge")
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new")
    n.add_argument("--candidate", required=True)
    n.add_argument("--department", required=True)
    n.add_argument("--run", required=True)
    n.add_argument("--now")
    u = sub.add_parser("update")
    u.add_argument("--process", required=True)
    u.add_argument("--delta", required=True)
    u.add_argument("--run", required=True)
    u.add_argument("--now")
    for name in ("accept", "reject"):
        r = sub.add_parser(name)
        r.add_argument("--process", required=True)
        r.add_argument("--index", type=int, required=True)
        r.add_argument("--now")
    args = ap.parse_args(argv)

    if args.cmd == "new":
        _require(pathlib_exists(args.candidate), "candidate file must exist")
        proc = merge_new(read_json(args.candidate), args.department, args.run,
                         _now(args.now))
        write_json_atomic(_proc_path(proc["id"]), proc)
        print(proc["id"])
    elif args.cmd == "update":
        path = _proc_path(args.process)
        _require(path.is_file(), f"target process {args.process} must exist")
        _require(pathlib_exists(args.delta), "delta file must exist")
        proc = apply_delta(read_json(path), read_json(args.delta), args.run,
                           _now(args.now))
        write_json_atomic(path, proc)
    else:  # accept | reject
        path = _proc_path(args.process)
        _require(path.is_file(), f"process {args.process} must exist")
        proc = resolve_pending(read_json(path), args.index, args.cmd, _now(args.now))
        write_json_atomic(path, proc)
    return 0


def pathlib_exists(p):
    import pathlib
    return pathlib.Path(p).is_file()
```

- [ ] **Step 4: Run to verify they pass**

Run: `make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/merge engine/tests/test_merge_resolve.py engine/tests/test_merge_cli.py
git commit -m "feat(engine): merge accept/reject pending + preconditions + CLI (INV-5)"
```

---

### Task 10: transcribe — idempotency + Vertex seam (real call deferred)

**Files:**
- Create: `transcribe/__init__.py` (i.e. `engine/transcribe/__init__.py`)
- Create: `engine/transcribe/cli.py`
- Create: `engine/tests/test_transcribe.py`

**Interfaces:**
- Produces: `PROMPT` (the ARD §5.1 Persian speaker-separation prompt), `find_audio(root, basename) -> Path`, `transcript_path(root, basename) -> Path`, `run_transcribe(basename, transcriber, root=None) -> (text, called_vertex: bool)` where `transcriber` is any object with `.transcribe(audio_path) -> str` (the seam), and `main()` for the `transcribe` console script. The real `VertexTranscriber` lazily imports `google.genai`; unit tests use a fake and NEVER import it.

- [ ] **Step 1: Write the failing test**

`engine/tests/test_transcribe.py`:
```python
import pytest

from transcribe import find_audio, run_transcribe, transcript_path


class FakeTranscriber:
    def __init__(self):
        self.calls = 0

    def transcribe(self, audio_path):
        self.calls += 1
        return "گوینده مرد ۱: سلام"


def test_idempotency_skips_vertex_when_transcript_exists(data_root):
    root = data_root()
    (root / "meetings/audio/cooking-2026-07-06.ogg").write_bytes(b"x")
    transcript_path(root, "cooking-2026-07-06").write_text("cached", encoding="utf-8")
    fake = FakeTranscriber()
    text, called = run_transcribe("cooking-2026-07-06", fake, root=root)
    assert text == "cached" and called is False and fake.calls == 0


def test_calls_transcriber_when_no_transcript(data_root):
    root = data_root()
    (root / "meetings/audio/cooking-2026-07-06.ogg").write_bytes(b"x")
    fake = FakeTranscriber()
    text, called = run_transcribe("cooking-2026-07-06", fake, root=root)
    assert called is True and fake.calls == 1 and "گوینده" in text


def test_missing_audio_raises(data_root):
    with pytest.raises(FileNotFoundError):
        find_audio(data_root(), "does-not-exist")


@pytest.mark.integration
@pytest.mark.skip(reason="real Vertex call — needs GCP creds; run manually when set up")
def test_real_vertex_transcription():
    pass
```

- [ ] **Step 2: Run to verify it fails**

Run: `make test`
Expected: FAIL — `ModuleNotFoundError: No module named 'transcribe'`.

- [ ] **Step 3: Implement transcribe**

`engine/transcribe/__init__.py`:
```python
from engine_common import data_root

PROMPT = """You are a precise audio transcriber. Reproduce ONLY the spoken content of the
audio file, in Persian.
Rules:
- Separate speakers based on the flow of conversation, and start each speaking
  turn with the speaker's label. If the speaker's name is stated in the audio,
  use it (e.g. «گوینده مرد ۱ (آقای مازندرانی):»); otherwise use «گوینده زن:»,
  «گوینده مرد ۱:», «گوینده مرد ۲:», and so on.
- No timing / timecodes.
- Do not add any preamble, conclusion, heading, commentary, or sentence of your
  own. The output must be the transcript and nothing else.
- Do not remove, summarize, or edit anything; reproduce exactly what was said."""


def transcript_path(root, basename):
    return root / "meetings" / "transcripts" / f"{basename}.txt"


def find_audio(root, basename):
    matches = sorted((root / "meetings" / "audio").glob(f"{basename}.*"))
    if not matches:
        raise FileNotFoundError(f"no audio for {basename} in meetings/audio/")
    return matches[0]


def run_transcribe(basename, transcriber, root=None):
    root = root or data_root()
    tp = transcript_path(root, basename)
    if tp.exists():                       # idempotency pre-check (FR-P2)
        return tp.read_text(encoding="utf-8"), False
    audio = find_audio(root, basename)
    return transcriber.transcribe(str(audio)), True


class VertexTranscriber:
    """Real Gemini-on-Vertex transcriber. Lazy-imports google.genai so unit
    tests (which use a fake) never require the dependency or credentials."""

    def __init__(self, project, location, model):
        self.project, self.location, self.model = project, location, model

    def transcribe(self, audio_path):
        from google import genai                      # lazy
        client = genai.Client(vertexai=True, project=self.project,
                              location=self.location)
        uploaded = client.files.upload(file=audio_path)   # large files via upload
        resp = client.models.generate_content(
            model=self.model, contents=[PROMPT, uploaded])
        return resp.text
```

`engine/transcribe/cli.py`:
```python
import argparse
import os

from transcribe import VertexTranscriber, run_transcribe


def main(argv=None):
    ap = argparse.ArgumentParser(prog="transcribe")
    ap.add_argument("basename")
    args = ap.parse_args(argv)
    tr = VertexTranscriber(os.environ.get("VERTEX_PROJECT"),
                           os.environ.get("VERTEX_LOCATION"),
                           os.environ.get("GEMINI_MODEL"))
    text, _called = run_transcribe(args.basename, tr)
    print(text, end="")   # raw transcript to stdout; the pipeline (Phase 3) cleans + stores
    return 0
```

- [ ] **Step 4: Register the `integration` marker**

In root `pyproject.toml` under `[tool.pytest.ini_options]`, add:
```toml
markers = ["integration: real external calls (Vertex); skipped by default"]
```

- [ ] **Step 5: Run to verify it passes**

Run: `make test`
Expected: PASS (fake-based tests pass; the real-Vertex test is skipped).

- [ ] **Step 6: Commit**

```bash
git add engine/transcribe engine/tests/test_transcribe.py pyproject.toml
git commit -m "feat(engine): transcribe — idempotency + Vertex seam (real call deferred)"
```

---

### Task 11: Wrap-up — engine docs, version pin, PLAN reconciliation

**Files:**
- Modify: `engine/allocate_id/README.md`, `engine/layout/README.md`, `engine/merge/README.md`, `engine/transcribe/README.md` (mark implemented; note the command + entry point)
- Create: `engine/README.md` (how to install/test; the four commands; determinism/INV notes)
- Modify: `PLAN.md` §3 (Phase 1) — note it's implemented; transcribe real-Vertex deferred
- Modify: `CLAUDE.md` (engine row already lists the four CLIs — add "installed via `pip install -e engine`; `SCHEMA_DIR` locates schemas at runtime")

**Interfaces:** none (docs only).

- [ ] **Step 1: Write `engine/README.md`**

`engine/README.md`:
```markdown
# engine/ — deterministic CLIs (ARD §8)

Four console scripts, installed editable into the repo `.venv` (`pip install -e engine`,
done automatically by `make test`). All are deterministic and LLM-free except
`transcribe`, which calls Gemini-on-Vertex behind a seam.

| Command | Job | Key rules |
|---|---|---|
| `allocate-id` | the ONLY source of IDs (INV-1) | scan disk, max+1; removed nodes keep their id |
| `layout` | serpentine flowchart positions (ARD §9) | manual nodes preserved; full vs local re-layout |
| `merge` | apply candidate/delta, resolve pending | enrich empty-only; conflict→pending (FR-M3); flag-removed never deletes (INV-4); validates against schemas/ before write |
| `transcribe` | Gemini-on-Vertex + idempotency pre-check | skips Vertex if transcript exists; raw text to stdout (pipeline cleans) |

Runtime env: `DATA_ROOT` (data location), `SCHEMA_DIR` (optional; defaults to the repo
`schemas/`), and for `transcribe`: `VERTEX_PROJECT`/`VERTEX_LOCATION`/`GEMINI_MODEL` +
GCP credentials outside the repos. The real Vertex call has a deferred integration test
(`-m integration`, skipped) — wire it up when GCP is set up.

Run tests: `make test` (from repo root).
```

- [ ] **Step 2: Update the four CLI READMEs**

In each of `engine/{allocate_id,layout,merge,transcribe}/README.md`, change the heading from "(… — to be implemented)" to "(implemented)" and add one line naming the console command and entry point (e.g. ``allocate-id`` → ``allocate_id.cli:main``).

- [ ] **Step 3: Reconcile PLAN.md and CLAUDE.md**

In `PLAN.md` §3 (Phase 1), append to the Exit criteria: "Implemented in `docs/superpowers/plans/2026-07-07-phase-1-engine-clis.md`; `transcribe`'s real Vertex call is a deferred integration test (GCP not yet set up)." In `CLAUDE.md`, extend the `engine/` row to note `pip install -e engine` and `SCHEMA_DIR`.

- [ ] **Step 4: Verify and commit**

Run: `make test && make lint`
Expected: all green.
```bash
git add engine PLAN.md CLAUDE.md
git commit -m "docs(engine): mark CLIs implemented; README + PLAN/CLAUDE reconciliation"
```

---

## Self-Review

**Spec coverage (against PLAN.md §3 and ARD §4.1/§5.1/§5.5/§6/§9):**
- `allocate-id` (ARD §4.1, INV-1): Task 3 — process/box/junction, max+1, removed-nodes-hold-id. ✅
- `layout` serpentine + manual-preserve + full/local re-layout (ARD §9, FR-D9/D10): Tasks 4–5, pinned by Task 8. ✅
- `merge` new + delta + enrich/conflict/flag-removed + accept/reject + preconditions (ARD §5.5/§6, FR-M2/M3, INV-4/5): Tasks 6–9. ✅
- `transcribe` idempotency + Vertex seam + Persian prompt, real call deferred (ARD §5.1, FR-P2, NFR-2): Task 10. ✅
- Atomic writes, validate-before-write, DATA_ROOT: Task 1. ✅
- Contract gap (node `removed`) discovered and closed: Task 2. ✅

**Placeholder scan:** no TBD/TODO; every step has complete code. The one prose caveat (Task 9 Step 1 note about the fixture's pending row targeting a non-existent node) is a concrete instruction, not a placeholder — the implementer sets `node/field` to an existing node in the test helper. ✅

**Type consistency:** `_new_node`/`_map_edges`/`_touch` defined in Task 6/7 and reused in later tasks; `merge_new`/`apply_delta`/`resolve_pending` signatures match the CLI in Task 9; `topo_order`/`cell`/`full_relayout`/`local_relayout` names are stable across Tasks 4/5/7/8; `run_transcribe(basename, transcriber, root)` matches the fake and the CLI. ✅

**Known gaps flagged for later phases (not Phase-1 defects):**
- Start/end terminal nodes: the candidate/delta schemas express only activity/junction, so `merge` does not synthesize `start`/`end` terminals (avoids fabrication, INV-3). If the extract agent (Phase 3) should emit terminals, the candidate/delta schemas need a terminal variant — a Phase-3 contract follow-up. `merge` already handles arbitrary node types generically where it copies them.
- The "confirmed segments" gate (ARD §7) is represented here as file-existence/precondition checks in `merge`; the full human-confirmation gate is enforced by the Phase-3 playbook + Phase-7 hooks.
- `pending` rows are addressed by index in the CLI; a stable identifier can be added if the Phase-5 UI needs it.
- Node `source` object shape vs. the UI prototype's string (carried over from the Phase-0 review) remains a Phase-6 reconciliation item.
