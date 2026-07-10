# Phase 5 — UI Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the thin FastAPI backend that serves the process-documentation JSON from `data-repo`, mutates it through the deterministic engine CLIs with one git commit per Save, authenticates a single user, and serves the built frontend.

**Architecture:** A stateless FastAPI/Uvicorn app. It never invents data: all IDs come from `allocate-id`, all conflict resolution from `merge accept/reject`, all layout from the `layout` CLI, all schema checks from `validate`. Files are written atomically (temp + `os.replace`) under a per-file async lock; each write operation ends in exactly one `git commit`. Response/request bodies are the frozen-schema JSON verbatim — the frontend owns all presentation.

**Tech Stack:** Python 3.11+, FastAPI ~0.116, Uvicorn ~0.35, argon2-cffi ~25.1, itsdangerous ~2.2, pytest ~8.3 + httpx (TestClient). Engine CLIs (`allocate-id`, `merge`, `layout`, `validate`) invoked as console commands installed via `pip install -e ./engine`.

**Spec:** `docs/superpowers/specs/2026-07-10-phase-5-ui-backend-design.md`

## Global Constraints

- **Contract is verbatim frozen-schema JSON** — no field renames or reshaping on read or write (`schemas/process.schema.json`, `overview.schema.json`, `registry.schema.json`).
- **INV-1** — every new id (process, box, junction) comes from the `allocate-id` CLI; the backend never constructs an id string itself.
- **INV-4/INV-5** — node deletion is a `removed:true` flag; a `pending` proposal is applied only on an explicit `accept`.
- **One commit per write operation**, message `ui-edit(<id>): <action>` (ARD §15). Commit only *after* a successful atomic write. No `git push` here (Phase 7).
- **Atomic writes** (temp file in the same dir + `os.replace`) under a **per-file async lock**.
- **Path is authoritative on PUT** — `id`/`department` come from the URL; body values are ignored.
- **Auth** — single user from env; argon2 hash; plaintext never stored, logged, or returned.
- **Engine CLI env** — every CLI invocation passes `DATA_ROOT`, `SCHEMA_DIR`, and `PATH` in its environment.
- **Python package name:** `inja_ui_backend` (directory `ui-backend/inja_ui_backend/`). JSON always written UTF-8 with `ensure_ascii=False` and a trailing newline.
- **Lint:** ruff (`line-length=100`, rules `E,F,I`) must pass; `make test` must stay green.

---

## File Structure

```
ui-backend/
  pyproject.toml                       # installable package "inja-ui-backend", console dep on engine
  requirements.txt                     # runtime deps (already present; extend)
  inja_ui_backend/
    __init__.py
    config.py        # Settings dataclass loaded+validated from env
    storage.py       # paths, atomic write, per-file async locks, JSON I/O
    engine.py        # subprocess wrappers: allocate-id / merge / layout / validate
    gitcommit.py     # stage paths + one commit (ui-edit author/message)
    auth.py          # argon2 verify, signed cookie, require_session dependency
    models.py        # Pydantic request bodies
    ids.py           # id-pattern helpers (real vs temp)
    app.py           # create_app(): mount routers + static; module-level `app`
    routers/
      __init__.py
      auth.py        # /api/auth/{login,logout,me}
      departments.py # /api/departments, overview get/put, process list
      processes.py   # process get/create/save/delete/relayout/pending
  tests/
    conftest.py      # temp DATA_ROOT (git-init) seeded from golden fixtures; TestClient
    test_config.py
    test_storage.py
    test_engine.py
    test_gitcommit.py
    test_auth.py
    test_departments.py
    test_processes_read.py
    test_processes_create.py
    test_processes_save.py
    test_processes_delete.py
    test_processes_relayout.py
    test_processes_pending.py
    test_static.py
config/ui-backend.env.example          # extend env surface
requirements-dev.txt                   # add -e ./ui-backend + test deps
pyproject.toml (root)                  # add ui-backend/tests to testpaths
```

---

### Task 1: Package scaffold + config

**Files:**
- Create: `ui-backend/pyproject.toml`, `ui-backend/inja_ui_backend/__init__.py`, `ui-backend/inja_ui_backend/config.py`
- Modify: `requirements-dev.txt`, `pyproject.toml` (root), `ui-backend/requirements.txt`
- Test: `ui-backend/tests/test_config.py`, `ui-backend/tests/conftest.py`

**Interfaces:**
- Produces: `inja_ui_backend.config.Settings` (frozen dataclass) with fields `data_root: Path`, `schema_dir: Path`, `ui_username: str`, `ui_password_hash: str`, `session_signing_key: str`, `session_ttl: int` (seconds), `static_dir: Path | None`, `git_author_name: str`, `git_author_email: str`.
- Produces: `inja_ui_backend.config.load_settings(env: Mapping[str,str] | None = None) -> Settings` — reads `os.environ` by default; raises `RuntimeError` listing every missing required var.

- [ ] **Step 1: Add the package manifest**

Create `ui-backend/pyproject.toml`:

```toml
[project]
name = "inja-ui-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi~=0.116",
    "uvicorn[standard]~=0.35",
    "argon2-cffi~=25.1",
    "itsdangerous~=2.2",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["inja_ui_backend*"]
```

Create empty `ui-backend/inja_ui_backend/__init__.py`.

- [ ] **Step 2: Wire dev install + test discovery**

Append to `requirements-dev.txt` (after `-e ./upload-bot`):

```
-e ./ui-backend
httpx~=0.27
```

In root `pyproject.toml`, change `testpaths` to include the backend:

```toml
testpaths = ["upload-bot/tests", "tests", "engine/tests", "ui-backend/tests"]
```

- [ ] **Step 3: Write the failing test**

Create `ui-backend/tests/test_config.py`:

```python
import pytest

from inja_ui_backend.config import load_settings


def _valid_env(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "schemas").mkdir()
    return {
        "DATA_ROOT": str(tmp_path / "data"),
        "SCHEMA_DIR": str(tmp_path / "schemas"),
        "UI_USERNAME": "analyst",
        "UI_PASSWORD_HASH": "$argon2id$dummy",
        "SESSION_SIGNING_KEY": "s3cr3t",
    }


def test_load_settings_reads_all_fields(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.ui_username == "analyst"
    assert s.data_root == (tmp_path / "data")
    assert s.session_ttl == 86400  # default one day
    assert s.static_dir is None      # not provided


def test_missing_required_var_raises_listing_it(tmp_path):
    env = _valid_env(tmp_path)
    del env["SESSION_SIGNING_KEY"]
    with pytest.raises(RuntimeError, match="SESSION_SIGNING_KEY"):
        load_settings(env)


def test_missing_data_root_dir_raises(tmp_path):
    env = _valid_env(tmp_path)
    env["DATA_ROOT"] = str(tmp_path / "nope")
    with pytest.raises(RuntimeError, match="DATA_ROOT"):
        load_settings(env)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_config.py -q`
Expected: FAIL (`ModuleNotFoundError: inja_ui_backend.config`). If the module import itself errors because the package isn't installed, first run `uv pip install -q --python .venv/bin/python -r requirements-dev.txt`.

- [ ] **Step 5: Implement config**

Create `ui-backend/inja_ui_backend/config.py`:

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

_REQUIRED = ("DATA_ROOT", "SCHEMA_DIR", "UI_USERNAME",
             "UI_PASSWORD_HASH", "SESSION_SIGNING_KEY")


@dataclass(frozen=True)
class Settings:
    data_root: Path
    schema_dir: Path
    ui_username: str
    ui_password_hash: str
    session_signing_key: str
    session_ttl: int
    static_dir: Optional[Path]
    git_author_name: str
    git_author_email: str


def load_settings(env: Optional[Mapping[str, str]] = None) -> Settings:
    env = os.environ if env is None else env
    missing = [k for k in _REQUIRED if not env.get(k)]
    if missing:
        raise RuntimeError("missing required env vars: " + ", ".join(missing))

    data_root = Path(env["DATA_ROOT"])
    if not data_root.is_dir():
        raise RuntimeError(f"DATA_ROOT is not a directory: {data_root}")
    schema_dir = Path(env["SCHEMA_DIR"])
    if not schema_dir.is_dir():
        raise RuntimeError(f"SCHEMA_DIR is not a directory: {schema_dir}")

    static = env.get("UI_STATIC_DIR")
    return Settings(
        data_root=data_root,
        schema_dir=schema_dir,
        ui_username=env["UI_USERNAME"],
        ui_password_hash=env["UI_PASSWORD_HASH"],
        session_signing_key=env["SESSION_SIGNING_KEY"],
        session_ttl=int(env.get("SESSION_TTL", "86400")),
        static_dir=Path(static) if static else None,
        git_author_name=env.get("GIT_AUTHOR_NAME", "ui-edit"),
        git_author_email=env.get("GIT_AUTHOR_EMAIL", "ui-edit@inja.local"),
    )
```

- [ ] **Step 6: Create the shared test fixture**

Create `ui-backend/tests/conftest.py`:

```python
import json
import subprocess
import pathlib

import pytest

REPO = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = REPO / "tests" / "fixtures"
SCHEMAS = REPO / "schemas"

DEPTS = ["management", "accounting", "warehouse", "procurement", "cooking",
         "preparation", "dining", "cashier", "logistics"]


def _load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def data_root(tmp_path):
    """A git-initialised temp DATA_ROOT seeded from golden fixtures."""
    root = tmp_path / "data"
    for d in DEPTS:
        (root / "departments" / d / "processes").mkdir(parents=True)
        (root / "departments" / d / "attachments").mkdir(parents=True)
    (root / "departments" / "registry.json").write_text(
        json.dumps(_load("registry.json"), ensure_ascii=False), encoding="utf-8")
    # one real process + overview to read/edit
    proc = _load("process.cooking-001.json")
    (root / "departments" / "cooking" / "processes" / "cooking-001.json").write_text(
        json.dumps(proc, ensure_ascii=False), encoding="utf-8")
    ov = _load("overview.cooking.json")
    (root / "departments" / "cooking" / "overview.json").write_text(
        json.dumps(ov, ensure_ascii=False), encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(root), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-q", "-m", "seed"], check=True)
    return root
```

- [ ] **Step 7: Run config tests to verify pass**

Run: `.venv/bin/pytest ui-backend/tests/test_config.py -q`
Expected: PASS (3 passed).

- [ ] **Step 8: Commit**

```bash
git add ui-backend/pyproject.toml ui-backend/inja_ui_backend requirements-dev.txt pyproject.toml ui-backend/tests
git commit -m "phase-5(ui-backend): package scaffold + env config"
```

---

### Task 2: storage — atomic write, per-file lock, JSON I/O

**Files:**
- Create: `ui-backend/inja_ui_backend/storage.py`
- Test: `ui-backend/tests/test_storage.py`

**Interfaces:**
- Produces: `read_json(path: Path) -> dict`
- Produces: `write_json_atomic(path: Path, doc: dict) -> None` — temp file in same dir + `os.replace`; UTF-8, `ensure_ascii=False`, 2-space indent, trailing newline.
- Produces: `async file_lock(path: Path)` — async context manager serializing writes to one absolute path (process-wide registry of `asyncio.Lock`).
- Produces: `proc_path(root, pid) -> Path`, `dept_of(pid) -> str`, `overview_path(root, code) -> Path`, `registry_path(root) -> Path`, `list_process_files(root, code) -> list[Path]`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_storage.py`:

```python
import asyncio
import json

from inja_ui_backend import storage


def test_write_atomic_roundtrip(tmp_path):
    p = tmp_path / "x.json"
    storage.write_json_atomic(p, {"k": "مقدار"})
    assert json.loads(p.read_text(encoding="utf-8")) == {"k": "مقدار"}
    assert p.read_text(encoding="utf-8").endswith("\n")
    # non-ASCII preserved (not \u-escaped)
    assert "مقدار" in p.read_text(encoding="utf-8")


def test_atomic_write_leaves_no_tmp(tmp_path):
    p = tmp_path / "x.json"
    storage.write_json_atomic(p, {"a": 1})
    assert [q.name for q in tmp_path.iterdir()] == ["x.json"]


def test_dept_of_and_paths(tmp_path):
    assert storage.dept_of("cooking-001") == "cooking"
    assert storage.proc_path(tmp_path, "cooking-001").name == "cooking-001.json"


def test_file_lock_serializes_writes(tmp_path):
    p = tmp_path / "c.json"
    storage.write_json_atomic(p, {"n": 0})
    order = []

    async def bump(tag):
        async with storage.file_lock(p):
            cur = storage.read_json(p)["n"]
            await asyncio.sleep(0.01)          # force interleave without the lock
            storage.write_json_atomic(p, {"n": cur + 1})
            order.append(tag)

    async def main():
        await asyncio.gather(*(bump(i) for i in range(5)))

    asyncio.run(main())
    assert storage.read_json(p)["n"] == 5      # no lost updates
    assert sorted(order) == order or len(order) == 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_storage.py -q`
Expected: FAIL (`ModuleNotFoundError` / attribute errors).

- [ ] **Step 3: Implement storage**

Create `ui-backend/inja_ui_backend/storage.py`:

```python
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import tempfile
from pathlib import Path

_LOCKS: dict[str, asyncio.Lock] = {}


def read_json(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json_atomic(path: Path, doc: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)


@contextlib.asynccontextmanager
async def file_lock(path: Path):
    key = str(Path(path).resolve())
    lock = _LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        yield


def dept_of(pid: str) -> str:
    return pid.rsplit("-", 1)[0]


def proc_path(root: Path, pid: str) -> Path:
    return Path(root) / "departments" / dept_of(pid) / "processes" / f"{pid}.json"


def overview_path(root: Path, code: str) -> Path:
    return Path(root) / "departments" / code / "overview.json"


def registry_path(root: Path) -> Path:
    return Path(root) / "departments" / "registry.json"


def list_process_files(root: Path, code: str) -> list[Path]:
    d = Path(root) / "departments" / code / "processes"
    return sorted(d.glob("*.json")) if d.is_dir() else []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_storage.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/storage.py ui-backend/tests/test_storage.py
git commit -m "phase-5(ui-backend): atomic JSON writes + per-file async lock"
```

---

### Task 3: engine — subprocess wrappers for the CLIs

**Files:**
- Create: `ui-backend/inja_ui_backend/engine.py`, `ui-backend/inja_ui_backend/ids.py`
- Test: `ui-backend/tests/test_engine.py`

**Interfaces:**
- Produces (`ids.py`): `is_real_activity_id(s)`, `is_real_junction_id(s)`, `is_terminal_id(s)` (`start`/`end`) — regex helpers.
- Produces (`engine.py`), all sync (routers call them via `asyncio.to_thread`), each raises `EngineError(message, code)` on non-zero exit:
  - `allocate_process_id(cfg, department) -> str`
  - `allocate_box_id(cfg, working_doc) -> str` (writes `working_doc` to a temp file, calls `allocate-id box <tmp>`)
  - `allocate_junction_id(cfg, working_doc) -> str`
  - `resolve_pending(cfg, pid, index, decision) -> None` (`merge accept|reject`)
  - `run_layout(cfg, working_doc) -> dict` (returns repositioned doc)
  - `validate_doc(cfg, schema_name, doc) -> None`
- Produces: `EngineError(Exception)` with `.message: str` and `.code: int`.

> Note (contract already confirmed): `allocate-id box/junction`, `validate`, and `layout` read a **file path**; `merge accept/reject` and `allocate-id process` resolve via `DATA_ROOT`. The `layout` CLI signature is `layout <process_file> [--full] [--from-node ID]`; it **writes the repositioned doc back in place** and prints nothing (it also `validate`s against `process.schema.json`, so the doc handed to it must be schema-valid). Therefore `run_layout` writes the working doc to a temp file, runs `layout <tmp> --full`, and reads the temp file back.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_engine.py`:

```python
import json

import pytest

from inja_ui_backend import engine, ids
from inja_ui_backend.config import load_settings


def _cfg(data_root):
    from inja_ui_backend.tests_helpers import cfg_for  # created below
    return cfg_for(data_root)


def test_id_pattern_helpers():
    assert ids.is_real_activity_id("cooking-001-n010")
    assert not ids.is_real_activity_id("tmp-1")
    assert ids.is_real_junction_id("cooking-001-j2")
    assert not ids.is_real_junction_id("cooking-001-n010")
    assert ids.is_terminal_id("start") and ids.is_terminal_id("end")


def test_allocate_process_id(data_root):
    cfg = _cfg(data_root)
    assert engine.allocate_process_id(cfg, "warehouse") == "warehouse-001"
    assert engine.allocate_process_id(cfg, "cooking") == "cooking-002"


def test_allocate_box_id_feed_forward(data_root):
    cfg = _cfg(data_root)
    from inja_ui_backend import storage
    doc = storage.read_json(storage.proc_path(data_root, "cooking-001"))
    first = engine.allocate_box_id(cfg, doc)
    doc["nodes"].append({"id": first, "type": "activity", "label": "x",
                         "description": "", "actor": "", "subprocess": None,
                         "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
                         "position": {"x": 0, "y": 0}, "layout": "manual",
                         "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    second = engine.allocate_box_id(cfg, doc)
    assert first != second


def test_validate_rejects_broken_doc(data_root):
    cfg = _cfg(data_root)
    with pytest.raises(engine.EngineError):
        engine.validate_doc(cfg, "process.schema.json", {"id": "bad"})


def test_resolve_pending_accept_applies_proposed(data_root):
    cfg = _cfg(data_root)
    from inja_ui_backend import storage
    p = storage.proc_path(data_root, "cooking-001")
    doc = storage.read_json(p)
    if not doc["pending"]:
        pytest.skip("fixture has no pending row")
    row = doc["pending"][0]
    engine.resolve_pending(cfg, "cooking-001", 0, "accept")
    after = storage.read_json(p)
    node = next(n for n in after["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == row["proposed"]
    assert after["pending"][0]["status"] == "accepted"
```

Create `ui-backend/inja_ui_backend/tests_helpers.py` (a tiny importable helper so tests build a `Settings` pointed at the temp root):

```python
from inja_ui_backend.config import load_settings

REPO_SCHEMAS = None  # resolved lazily


def cfg_for(data_root):
    import pathlib
    schemas = pathlib.Path(__file__).resolve().parents[2] / "schemas"
    return load_settings({
        "DATA_ROOT": str(data_root),
        "SCHEMA_DIR": str(schemas),
        "UI_USERNAME": "analyst",
        "UI_PASSWORD_HASH": "$argon2id$dummy",
        "SESSION_SIGNING_KEY": "k",
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_engine.py -q`
Expected: FAIL (module/attribute errors).

- [ ] **Step 3: Implement ids + engine**

Create `ui-backend/inja_ui_backend/ids.py`:

```python
import re

_ACT = re.compile(r"^[a-z]+-[0-9]{3}-n[0-9]{3}$")
_JUNC = re.compile(r"^[a-z]+-[0-9]{3}-j[0-9]+$")


def is_real_activity_id(s: str) -> bool:
    return bool(_ACT.match(s))


def is_real_junction_id(s: str) -> bool:
    return bool(_JUNC.match(s))


def is_terminal_id(s: str) -> bool:
    return s in ("start", "end")
```

Create `ui-backend/inja_ui_backend/engine.py`:

```python
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from .config import Settings


class EngineError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.message = message
        self.code = code


def _env(cfg: Settings) -> dict:
    import os
    base = {k: v for k, v in os.environ.items() if k == "PATH"}
    base["DATA_ROOT"] = str(cfg.data_root)
    base["SCHEMA_DIR"] = str(cfg.schema_dir)
    return base


def _run(cfg: Settings, args: list[str]) -> str:
    r = subprocess.run(args, capture_output=True, text=True, env=_env(cfg))
    if r.returncode != 0:
        raise EngineError((r.stderr or r.stdout).strip(), r.returncode)
    return r.stdout


def _tmp_doc(doc: dict) -> Path:
    fd, name = tempfile.mkstemp(suffix=".json")
    Path(name).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    import os
    os.close(fd)
    return Path(name)


def allocate_process_id(cfg: Settings, department: str) -> str:
    return _run(cfg, ["allocate-id", "process", department]).strip()


def allocate_box_id(cfg: Settings, working_doc: dict) -> str:
    tmp = _tmp_doc(working_doc)
    try:
        return _run(cfg, ["allocate-id", "box", str(tmp)]).strip()
    finally:
        tmp.unlink(missing_ok=True)


def allocate_junction_id(cfg: Settings, working_doc: dict) -> str:
    tmp = _tmp_doc(working_doc)
    try:
        return _run(cfg, ["allocate-id", "junction", str(tmp)]).strip()
    finally:
        tmp.unlink(missing_ok=True)


def resolve_pending(cfg: Settings, pid: str, index: int, decision: str) -> None:
    _run(cfg, ["merge", decision, "--process", pid, "--index", str(index)])


def validate_doc(cfg: Settings, schema_name: str, doc: dict) -> None:
    tmp = _tmp_doc(doc)
    try:
        _run(cfg, ["validate", schema_name, str(tmp)])
    finally:
        tmp.unlink(missing_ok=True)


def run_layout(cfg: Settings, working_doc: dict) -> dict:
    # `layout <file> --full` repositions in place (prints nothing); read it back.
    tmp = _tmp_doc(working_doc)
    try:
        _run(cfg, ["layout", str(tmp), "--full"])
        return json.loads(tmp.read_text(encoding="utf-8"))
    finally:
        tmp.unlink(missing_ok=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_engine.py -q`
Expected: PASS (5 passed; `test_resolve_pending_accept_applies_proposed` **skips** because the fixture has no pending row yet — Task 12 adds one and exercises accept/reject fully).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/engine.py ui-backend/inja_ui_backend/ids.py ui-backend/inja_ui_backend/tests_helpers.py ui-backend/tests/test_engine.py
git commit -m "phase-5(ui-backend): engine CLI wrappers (allocate-id/merge/validate/layout)"
```

---

### Task 4: gitcommit — one commit per write

**Files:**
- Create: `ui-backend/inja_ui_backend/gitcommit.py`
- Test: `ui-backend/tests/test_gitcommit.py`

**Interfaces:**
- Produces: `commit(cfg, paths: list[Path], pid: str, action: str) -> None` — stages exactly `paths` (relative to `data_root`), commits `ui-edit(<pid>): <action>` with the configured author/committer. No-op if nothing changed (returns without raising).

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_gitcommit.py`:

```python
import subprocess

from inja_ui_backend import gitcommit, storage
from inja_ui_backend.tests_helpers import cfg_for


def _log(root):
    return subprocess.run(["git", "-C", str(root), "log", "--oneline"],
                          capture_output=True, text=True).stdout


def test_commit_makes_one_ui_edit_commit(data_root):
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    doc = storage.read_json(p)
    doc["name"] = "نام تازه"
    storage.write_json_atomic(p, doc)
    gitcommit.commit(cfg, [p], "cooking-001", "save")
    top = _log(data_root).splitlines()[0]
    assert "ui-edit(cooking-001): save" in top


def test_commit_noop_when_no_change(data_root):
    cfg = cfg_for(data_root)
    before = len(_log(data_root).splitlines())
    gitcommit.commit(cfg, [], "cooking-001", "save")
    assert len(_log(data_root).splitlines()) == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_gitcommit.py -q`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Implement gitcommit**

Create `ui-backend/inja_ui_backend/gitcommit.py`:

```python
from __future__ import annotations

import subprocess
from pathlib import Path

from .config import Settings


def _git(cfg: Settings, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cfg.data_root), *args],
                          capture_output=True, text=True)


def commit(cfg: Settings, paths: list[Path], pid: str, action: str) -> None:
    if paths:
        _git(cfg, "add", "--", *[str(p) for p in paths])
    # nothing staged -> skip (git commit would fail)
    if _git(cfg, "diff", "--cached", "--quiet").returncode == 0:
        return
    msg = f"ui-edit({pid}): {action}"
    _git(cfg, "-c", f"user.name={cfg.git_author_name}",
         "-c", f"user.email={cfg.git_author_email}",
         "commit", "-q", "-m", msg)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_gitcommit.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/gitcommit.py ui-backend/tests/test_gitcommit.py
git commit -m "phase-5(ui-backend): one ui-edit commit per write"
```

---

### Task 5: auth + app factory + auth router (AC-8)

**Files:**
- Create: `ui-backend/inja_ui_backend/auth.py`, `ui-backend/inja_ui_backend/app.py`, `ui-backend/inja_ui_backend/routers/__init__.py`, `ui-backend/inja_ui_backend/routers/auth.py`
- Test: `ui-backend/tests/test_auth.py`

**Interfaces:**
- Produces (`auth.py`): `verify_password(cfg, password) -> bool`; `issue_cookie(cfg, username) -> str`; `read_cookie(cfg, token) -> str | None` (username or None on bad/expired); `require_session(request) -> str` FastAPI dependency returning the username, raising `HTTPException(401)` otherwise; constant `COOKIE_NAME = "inja_session"`.
- Produces (`app.py`): `create_app(cfg: Settings | None = None) -> FastAPI`; module-level `app = create_app()` guarded so import without env doesn't crash tests (lazy: only build from env when run as server).
- App stores `cfg` on `app.state.cfg`; `require_session` reads it from `request.app.state.cfg`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_auth.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _client(data_root, password="pw"):
    cfg = cfg_for(data_root)
    # replace the dummy hash with a real argon2 hash of `password`
    real = argon2.PasswordHasher().hash(password)
    cfg = cfg.__class__(**{**cfg.__dict__, "ui_password_hash": real,
                           "ui_username": "analyst"})
    return TestClient(create_app(cfg))


def test_login_required_returns_401(data_root):
    c = _client(data_root)
    assert c.get("/api/departments").status_code == 401


def test_wrong_password_401(data_root):
    c = _client(data_root)
    r = c.post("/api/auth/login", json={"username": "analyst", "password": "nope"})
    assert r.status_code == 401


def test_correct_login_sets_cookie_and_unlocks(data_root):
    c = _client(data_root)
    r = c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    assert r.status_code == 200
    assert "inja_session" in r.cookies
    assert c.get("/api/auth/me").json()["username"] == "analyst"


def test_hash_is_not_plaintext(data_root):
    cfg = cfg_for(data_root)
    assert cfg.ui_password_hash != "pw"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_auth.py -q`
Expected: FAIL (no `app`/`auth` modules).

- [ ] **Step 3: Implement auth**

Create `ui-backend/inja_ui_backend/auth.py`:

```python
from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import Settings

COOKIE_NAME = "inja_session"
_ph = PasswordHasher()


def verify_password(cfg: Settings, password: str) -> bool:
    try:
        return _ph.verify(cfg.ui_password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def _serializer(cfg: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(cfg.session_signing_key, salt="inja-session")


def issue_cookie(cfg: Settings, username: str) -> str:
    return _serializer(cfg).dumps({"u": username})


def read_cookie(cfg: Settings, token: str) -> str | None:
    try:
        data = _serializer(cfg).loads(token, max_age=cfg.session_ttl)
        return data.get("u")
    except (BadSignature, SignatureExpired):
        return None


def require_session(request: Request) -> str:
    cfg: Settings = request.app.state.cfg
    token = request.cookies.get(COOKIE_NAME)
    user = read_cookie(cfg, token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="authentication required")
    return user
```

Create `ui-backend/inja_ui_backend/routers/__init__.py` (empty).

Create `ui-backend/inja_ui_backend/routers/auth.py`:

```python
from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import COOKIE_NAME, issue_cookie, require_session, verify_password
from ..models import LoginBody

router = APIRouter(prefix="/api/auth")


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    cfg = request.app.state.cfg
    if body.username != cfg.ui_username or not verify_password(cfg, body.password):
        raise HTTPException(status_code=401, detail="invalid credentials")
    response.set_cookie(COOKIE_NAME, issue_cookie(cfg, body.username),
                        httponly=True, samesite="lax", max_age=cfg.session_ttl)
    return {"username": body.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    user = require_session(request)
    return {"username": user}
```

Create `ui-backend/inja_ui_backend/models.py`:

```python
from pydantic import BaseModel


class LoginBody(BaseModel):
    username: str
    password: str


class CreateProcessBody(BaseModel):
    department: str
    name: str | None = None
    parent: dict | None = None  # {"process": str, "node": str} for sub-process


class PendingDecision(BaseModel):
    decision: str  # "accept" | "reject"
```

Create `ui-backend/inja_ui_backend/app.py`:

```python
from __future__ import annotations

from fastapi import FastAPI

from .config import Settings, load_settings
from .routers import auth as auth_router


def create_app(cfg: Settings | None = None) -> FastAPI:
    if cfg is None:
        cfg = load_settings()
    app = FastAPI(title="inja-ui-backend")
    app.state.cfg = cfg
    app.include_router(auth_router.router)
    # departments + processes routers are added in later tasks
    return app
```

> Do **not** add a module-level `app = create_app()` yet — it would call `load_settings()` at import time and break tests. It is added in Task 13 behind an env guard.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_auth.py -q`
Expected: PASS (4 passed). `/api/departments` returns 401 because the dependency exists even though the route is added later — if the route is absent it returns 404; adjust the first test to hit `/api/auth/me` (also 401 without cookie) so it is order-independent:

```python
def test_login_required_returns_401(data_root):
    c = _client(data_root)
    assert c.get("/api/auth/me").status_code == 401
```

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/auth.py ui-backend/inja_ui_backend/app.py ui-backend/inja_ui_backend/models.py ui-backend/inja_ui_backend/routers ui-backend/tests/test_auth.py
git commit -m "phase-5(ui-backend): argon2 auth + signed session cookie (AC-8)"
```

---

### Task 6: departments router — list, overview get/put, process list

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/departments.py`
- Modify: `ui-backend/inja_ui_backend/app.py` (include the router)
- Test: `ui-backend/tests/test_departments.py`

**Interfaces:**
- Consumes: `storage`, `engine.validate_doc`, `gitcommit.commit`, `require_session`.
- Produces routes: `GET /api/departments`, `GET /api/departments/{code}/overview`, `PUT /api/departments/{code}/overview`, `GET /api/departments/{code}/processes`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_departments.py`:

```python
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


def test_departments_list_has_nine_with_counts(data_root):
    c = _auth_client(data_root)
    rows = c.get("/api/departments").json()
    assert len(rows) == 9
    cooking = next(r for r in rows if r["code"] == "cooking")
    assert cooking["count"] == 1 and cooking["name"]


def test_get_overview(data_root):
    c = _auth_client(data_root)
    ov = c.get("/api/departments/cooking/overview").json()
    assert ov["department"] == "cooking"


def test_get_overview_missing_404(data_root):
    c = _auth_client(data_root)
    assert c.get("/api/departments/logistics/overview").status_code == 404


def test_put_overview_validates_and_commits(data_root):
    c = _auth_client(data_root)
    ov = c.get("/api/departments/cooking/overview").json()
    ov["name"] = "دپارتمان پخت (ویرایش)"
    r = c.put("/api/departments/cooking/overview", json=ov)
    assert r.status_code == 200
    assert c.get("/api/departments/cooking/overview").json()["name"].endswith("(ویرایش)")


def test_put_overview_invalid_422(data_root):
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/overview", json={"department": "cooking"})
    assert r.status_code == 422


def test_process_list(data_root):
    c = _auth_client(data_root)
    procs = c.get("/api/departments/cooking/processes").json()
    assert any(p["id"] == "cooking-001" for p in procs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_departments.py -q`
Expected: FAIL (routes 404 / module missing).

- [ ] **Step 3: Implement departments router**

Create `ui-backend/inja_ui_backend/routers/departments.py`:

```python
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import engine, gitcommit, storage
from ..auth import require_session

router = APIRouter(prefix="/api/departments")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("")
def list_departments(request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        out.append({"code": d["code"], "name": d["name"],
                    "count": len(storage.list_process_files(cfg.data_root, d["code"]))})
    return out


@router.get("/{code}/overview")
def get_overview(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    path = storage.overview_path(cfg.data_root, code)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="overview not found")
    return storage.read_json(path)


@router.put("/{code}/overview")
async def put_overview(code: str, body: dict, request: Request,
                       _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    body["department"] = code
    body["updated_at"] = _now()
    try:
        engine.validate_doc(cfg, "overview.schema.json", body)
    except engine.EngineError as e:
        raise HTTPException(status_code=422, detail=e.message)
    path = storage.overview_path(cfg.data_root, code)
    async with storage.file_lock(path):
        storage.write_json_atomic(path, body)
        gitcommit.commit(cfg, [path], code, "update overview")
    return body


@router.get("/{code}/processes")
def list_processes(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    return [storage.read_json(p) for p in storage.list_process_files(cfg.data_root, code)]
```

Modify `ui-backend/inja_ui_backend/app.py` — add the import and `include_router`:

```python
from .routers import auth as auth_router
from .routers import departments as departments_router
...
    app.include_router(auth_router.router)
    app.include_router(departments_router.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_departments.py -q`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/departments.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_departments.py
git commit -m "phase-5(ui-backend): departments list + overview get/put + process list"
```

---

### Task 7: processes router — read a process

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/processes.py`
- Modify: `ui-backend/inja_ui_backend/app.py`
- Test: `ui-backend/tests/test_processes_read.py`

**Interfaces:**
- Produces route: `GET /api/processes/{pid}` → full doc or 404. Router object `router` (prefix `/api/processes`) that Tasks 8–12 extend.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_processes_read.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_get_process(data_root):
    c = _c(data_root)
    p = c.get("/api/processes/cooking-001").json()
    assert p["id"] == "cooking-001"
    assert "nodes" in p and "edges" in p


def test_get_process_404(data_root):
    c = _c(data_root)
    assert c.get("/api/processes/cooking-999").status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_read.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the router with the read route**

Create `ui-backend/inja_ui_backend/routers/processes.py`:

```python
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import engine, gitcommit, storage
from ..auth import require_session

router = APIRouter(prefix="/api/processes")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(cfg, pid):
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="process not found")
    return path, storage.read_json(path)


@router.get("/{pid}")
def get_process(pid: str, request: Request, _: str = Depends(require_session)):
    _, doc = _load(request.app.state.cfg, pid)
    return doc
```

Modify `ui-backend/inja_ui_backend/app.py` to include `processes_router.router`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_read.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/processes.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_processes_read.py
git commit -m "phase-5(ui-backend): read a process"
```

---

### Task 8: create process + sub-process (INV-1)

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/processes.py`
- Test: `ui-backend/tests/test_processes_create.py`

**Interfaces:**
- Consumes: `engine.allocate_process_id`, `models.CreateProcessBody`, `_load`.
- Produces: `POST /api/processes` → new doc (top-level or sub-process). Helper `_skeleton(pid, department, name, parent) -> dict`. Sub-process parent guards (checked before allocation): parent process missing → 404; parent node missing → 404; parent node not an activity → 400; parent node already links a sub-process → 409.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_processes_create.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_create_process_allocates_id(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={"department": "warehouse", "name": "دریافت کالا"})
    assert r.status_code == 201
    doc = r.json()
    assert doc["id"] == "warehouse-001"
    assert doc["source"]["type"] == "manual"
    assert [n["id"] for n in doc["nodes"]] == ["start", "end"]
    # persisted + readable
    assert c.get("/api/processes/warehouse-001").status_code == 200


def test_create_process_unknown_dept_400(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={"department": "nosuch"})
    assert r.status_code == 400


def test_create_subprocess_links_parent_node(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking", "name": "زیرفرآیند",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert r.status_code == 201
    child = r.json()
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    parent = c.get("/api/processes/cooking-001").json()
    node = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert node["subprocess"] == child["id"]


def test_subprocess_unknown_node_404(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n999"}})
    assert r.status_code == 404


def test_subprocess_non_activity_node_400(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "start"}})  # terminal, not activity
    assert r.status_code == 400


def test_subprocess_already_linked_409(data_root):
    c = _c(data_root)
    first = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert first.status_code == 201
    again = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert again.status_code == 409  # never silently overwrite an existing link
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_create.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement create**

Add to `ui-backend/inja_ui_backend/routers/processes.py`:

```python
from fastapi import Response

from ..models import CreateProcessBody


def _skeleton(pid: str, department: str, name: str, parent: dict | None) -> dict:
    now = _now()
    return {
        "id": pid, "department": department,
        "name": name or "فرآیند جدید", "summary": "",
        "source": {"type": "manual", "ref": None, "run": None},
        "parent": parent, "created_at": now, "updated_at": now,
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [], "pending": [],
        "nodes": [
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 60, "y": 120}, "layout": "manual"},
            {"id": "end", "type": "end", "label": "پایان",
             "position": {"x": 320, "y": 120}, "layout": "manual"},
        ],
        "edges": [{"from": "start", "to": "end", "label": ""}],
    }


@router.post("", status_code=201)
async def create_process(body: CreateProcessBody, request: Request, response: Response,
                         _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if body.department not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=400, detail="unknown department")

    # Guard the parent link BEFORE allocating anything, mirroring merge's guards,
    # so a rejected request never leaves an orphan child file.
    ppath = pdoc = pnode = None
    if body.parent:
        ppath, pdoc = _load(cfg, body.parent["process"])          # 404 if parent missing
        pnode = next((n for n in pdoc["nodes"] if n["id"] == body.parent["node"]), None)
        if pnode is None:
            raise HTTPException(status_code=404, detail="parent node not found")
        if pnode.get("type") != "activity":
            raise HTTPException(status_code=400, detail="parent node must be an activity")
        if pnode.get("subprocess") is not None:
            raise HTTPException(status_code=409, detail="parent node already links a sub-process")

    pid = engine.allocate_process_id(cfg, body.department)
    child = _skeleton(pid, body.department, body.name, body.parent)
    try:
        engine.validate_doc(cfg, "process.schema.json", child)
    except engine.EngineError as e:
        raise HTTPException(status_code=422, detail=e.message)

    child_path = storage.proc_path(cfg.data_root, pid)
    written = [child_path]
    async with storage.file_lock(child_path):
        storage.write_json_atomic(child_path, child)
        if body.parent:
            pnode["subprocess"] = pid
            pdoc["updated_at"] = _now()
            engine.validate_doc(cfg, "process.schema.json", pdoc)
            storage.write_json_atomic(ppath, pdoc)
            written.append(ppath)
        action = (f"create sub-process of {body.parent['process']}"
                  if body.parent else "create process")
        gitcommit.commit(cfg, written, pid, action)
    return child
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_create.py -q`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/processes.py ui-backend/tests/test_processes_create.py
git commit -m "phase-5(ui-backend): manual process + sub-process creation via allocate-id"
```

---

### Task 9: Save path (PUT) — allocation feed-forward, layout stamping, validate, commit

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/processes.py`
- Create: `ui-backend/inja_ui_backend/save.py` (the pure Save-transform, unit-tested without HTTP)
- Test: `ui-backend/tests/test_processes_save.py`

**Interfaces:**
- Produces (`save.py`): `allocate_new_node_ids(cfg, doc: dict) -> tuple[dict, dict]` — replaces every temp-keyed node id with a real `allocate-id` id (feed-forward), rewrites `edges[].from/to`, and returns `(new_doc, remap)`. Reused by relayout (Task 11).
- Produces (`save.py`): `prepare_save(cfg, pid, incoming: dict, on_disk: dict | None) -> dict` — returns the finished doc ready to write. Steps: force id/department from `pid`; call `allocate_new_node_ids`; **force `layout:"manual"` only on the newly-created nodes** (trust the incoming `layout` on all others — no position-diff heuristic); stamp `updated_at` + `source.touched_by`; preserve `created_at`.
- Produces route: `PUT /api/processes/{pid}`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_processes_save.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_save_ignores_body_id_and_department(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    doc["id"] = "hacked-999"
    doc["department"] = "management"
    doc["name"] = "ذخیره‌شده"
    r = c.put("/api/processes/cooking-001", json=doc)
    assert r.status_code == 200
    saved = r.json()
    assert saved["id"] == "cooking-001" and saved["department"] == "cooking"
    assert saved["name"] == "ذخیره‌شده"


def test_save_allocates_new_node_ids_and_rewrites_edges(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    doc["nodes"].append({
        "id": "tmp-A", "type": "activity", "label": "فعالیت تازه",
        "description": "", "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 900, "y": 500}, "layout": "manual",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-A", "label": ""})
    r = c.put("/api/processes/cooking-001", json=doc)
    assert r.status_code == 200
    saved = r.json()
    new_ids = [n["id"] for n in saved["nodes"] if n["id"].endswith(("n060", "n070", "n080"))]
    assert any(nid.startswith("cooking-001-n") for nid in new_ids)
    assert not any(n["id"] == "tmp-A" for n in saved["nodes"])
    assert not any(e["to"] == "tmp-A" for e in saved["edges"])


def test_save_forces_manual_on_new_node_only_and_trusts_incoming(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    pre_ids = {n["id"] for n in doc["nodes"]}  # every existing real id (before adding temp)
    # An existing node the client reports as auto stays auto (server trusts the client);
    # inferring manual from a move would freeze it against future merges.
    existing = next(n for n in doc["nodes"] if n["id"] == "cooking-001-n010")
    existing["layout"] = "auto"
    existing["position"] = {"x": existing["position"]["x"] + 50, "y": existing["position"]["y"]}
    # A brand-new node must come back pinned manual regardless of what was sent.
    doc["nodes"].append({
        "id": "tmp-M", "type": "activity", "label": "تازه", "description": "",
        "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 700, "y": 400}, "layout": "auto",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-M", "label": ""})
    saved = c.put("/api/processes/cooking-001", json=doc).json()
    kept = next(n for n in saved["nodes"] if n["id"] == "cooking-001-n010")
    assert kept["layout"] == "auto"                       # trusted, not forced to manual
    created = [n for n in saved["nodes"] if n["id"] not in pre_ids]  # tmp-M, now a real id
    assert len(created) == 1 and created[0]["layout"] == "manual"


def test_save_invalid_doc_422_leaves_file_unchanged(data_root):
    c = _c(data_root)
    before = c.get("/api/processes/cooking-001").json()
    bad = {"id": "cooking-001", "department": "cooking", "nodes": "not-a-list"}
    r = c.put("/api/processes/cooking-001", json=bad)
    assert r.status_code == 422
    assert c.get("/api/processes/cooking-001").json() == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_save.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the Save transform**

Create `ui-backend/inja_ui_backend/save.py`:

```python
from __future__ import annotations

import datetime

from . import engine, ids, storage


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_new_node(node: dict) -> bool:
    nid, ntype = node["id"], node.get("type")
    if ids.is_terminal_id(nid):
        return False
    if ntype == "junction":
        return not ids.is_real_junction_id(nid)
    return not ids.is_real_activity_id(nid)


def allocate_new_node_ids(cfg, doc: dict) -> tuple[dict, dict]:
    """Replace temp-keyed node ids with real allocate-id ids (feed-forward) and
    rewrite edges. Returns (new_doc, remap). Only calls allocate-id; writes nothing."""
    remap: dict[str, str] = {}
    working = {**doc, "nodes": []}
    resolved = []
    for node in doc.get("nodes", []):
        if _is_new_node(node):
            if node.get("type") == "junction":
                new_id = engine.allocate_junction_id(cfg, working)
            else:
                new_id = engine.allocate_box_id(cfg, working)
            remap[node["id"]] = new_id
            node = {**node, "id": new_id}
        resolved.append(node)
        working["nodes"] = resolved  # next allocation sees the id we just assigned
    new_doc = {**doc, "nodes": resolved}
    if remap:
        new_doc["edges"] = [{**e, "from": remap.get(e["from"], e["from"]),
                             "to": remap.get(e["to"], e["to"])}
                            for e in doc.get("edges", [])]
    return new_doc, remap


def prepare_save(cfg, pid: str, incoming: dict, on_disk: dict | None) -> dict:
    doc = dict(incoming)
    doc["id"] = pid
    doc["department"] = storage.dept_of(pid)

    # 1) allocate real ids for temp nodes + rewrite edges
    doc, remap = allocate_new_node_ids(cfg, doc)
    new_ids = set(remap.values())

    # 2) trust the incoming layout; force "manual" ONLY on newly-created nodes.
    #    (No position-diff heuristic: a full relayout returns layout:"auto", and
    #    inferring "manual" from a move would freeze every node against future merges.)
    for node in doc["nodes"]:
        if node["id"] in new_ids:
            node["layout"] = "manual"

    # 3) provenance
    doc["updated_at"] = _now()
    doc["created_at"] = (on_disk or {}).get("created_at", doc.get("created_at", doc["updated_at"]))
    disk_nodes = {n["id"]: n for n in (on_disk or {}).get("nodes", [])}
    for node in doc["nodes"]:
        if node.get("type") != "activity":
            continue
        changed = node["id"] in new_ids or disk_nodes.get(node["id"]) != node
        if changed:
            src = node.setdefault("source", {"created_by": "ui-edit", "touched_by": []})
            tb = src.setdefault("touched_by", [])
            if "ui-edit" not in tb:
                tb.append("ui-edit")
    return doc
```

- [ ] **Step 4: Add the PUT route**

Add to `ui-backend/inja_ui_backend/routers/processes.py`:

```python
from .. import save as save_mod


@router.put("/{pid}")
async def save_process(pid: str, body: dict, request: Request,
                       _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    path = storage.proc_path(cfg.data_root, pid)
    on_disk = storage.read_json(path) if path.is_file() else None
    async with storage.file_lock(path):
        doc = save_mod.prepare_save(cfg, pid, body, on_disk)
        try:
            engine.validate_doc(cfg, "process.schema.json", doc)
        except engine.EngineError as e:
            raise HTTPException(status_code=422, detail=e.message)
        storage.write_json_atomic(path, doc)
        gitcommit.commit(cfg, [path], pid, "save")
    return doc
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_save.py -q`
Expected: PASS (4 passed). If `test_save_allocates_new_node_ids...` asserts on specific suffixes that don't match `allocate-id`'s stepping, relax it to: `assert saved` has one more real activity id than `before` and no `tmp-` ids remain.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/save.py ui-backend/inja_ui_backend/routers/processes.py ui-backend/tests/test_processes_save.py
git commit -m "phase-5(ui-backend): Save path — id allocation, layout:manual, validate, commit"
```

---

### Task 10: delete process — hard delete + unlink

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/processes.py`
- Test: `ui-backend/tests/test_processes_delete.py`

**Interfaces:**
- Produces: `DELETE /api/processes/{pid}` → `{"deleted": pid}`; nulls `nodes[].subprocess == pid` and `parent.process == pid` across all departments; one commit.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_processes_delete.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_delete_removes_file(data_root):
    c = _c(data_root)
    # cooking-001 node n060 links subprocess cooking-014 in the fixture; create it first
    sub = c.post("/api/processes", json={
        "department": "cooking", "name": "زیر",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}}).json()
    r = c.delete(f"/api/processes/{sub['id']}")
    assert r.status_code == 200
    assert c.get(f"/api/processes/{sub['id']}").status_code == 404


def test_delete_unlinks_parent_node(data_root):
    c = _c(data_root)
    sub = c.post("/api/processes", json={
        "department": "cooking", "name": "زیر",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}}).json()
    c.delete(f"/api/processes/{sub['id']}")
    parent = c.get("/api/processes/cooking-001").json()
    node = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert node["subprocess"] is None


def test_delete_missing_404(data_root):
    c = _c(data_root)
    assert c.delete("/api/processes/cooking-999").status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_delete.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement delete**

Add to `ui-backend/inja_ui_backend/routers/processes.py`:

```python
@router.delete("/{pid}")
async def delete_process(pid: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="process not found")

    reg = storage.read_json(storage.registry_path(cfg.data_root))
    written = []
    path.unlink()
    written.append(path)
    for d in reg["departments"]:
        for fp in storage.list_process_files(cfg.data_root, d["code"]):
            doc = storage.read_json(fp)
            changed = False
            for n in doc.get("nodes", []):
                if n.get("subprocess") == pid:
                    n["subprocess"] = None
                    changed = True
            if doc.get("parent") and doc["parent"].get("process") == pid:
                doc["parent"] = None
                changed = True
            if changed:
                doc["updated_at"] = _now()
                storage.write_json_atomic(fp, doc)
                written.append(fp)
    gitcommit.commit(cfg, written, pid, "delete process")
    return {"deleted": pid}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_delete.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/processes.py ui-backend/tests/test_processes_delete.py
git commit -m "phase-5(ui-backend): hard delete process + unlink references"
```

---

### Task 11: relayout — compute-only via layout CLI

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/processes.py`
- Test: `ui-backend/tests/test_processes_relayout.py`

**Interfaces:**
- Consumes: `save.allocate_new_node_ids` (Task 9).
- Produces: `POST /api/processes/{pid}/relayout` (body = full working doc) → repositioned doc; **no write, no commit**. Realizes temp-keyed node ids first (the `layout` CLI validates against the schema, so temp ids would 422), then runs `layout --full`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_processes_relayout.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_relayout_returns_doc_without_persisting(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    on_disk_before = c.get("/api/processes/cooking-001").json()
    r = c.post("/api/processes/cooking-001/relayout", json=doc)
    assert r.status_code == 200
    out = r.json()
    assert len(out["nodes"]) == len(doc["nodes"])
    # unchanged on disk (compute-only)
    assert c.get("/api/processes/cooking-001").json() == on_disk_before


def test_relayout_with_unsaved_temp_node_does_not_422(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    on_disk_before = c.get("/api/processes/cooking-001").json()
    doc["nodes"].append({
        "id": "tmp-Z", "type": "activity", "label": "z", "description": "",
        "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 0, "y": 0}, "layout": "manual",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-Z", "label": ""})
    r = c.post("/api/processes/cooking-001/relayout", json=doc)
    assert r.status_code == 200                     # temp id realized before layout, not 422
    out = r.json()
    assert not any(n["id"] == "tmp-Z" for n in out["nodes"])   # got a real allocate-id id
    assert not any(e["to"] == "tmp-Z" for e in out["edges"])
    assert c.get("/api/processes/cooking-001").json() == on_disk_before  # still no persistence
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_relayout.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement relayout**

Add to `ui-backend/inja_ui_backend/routers/processes.py`:

```python
@router.post("/{pid}/relayout")
def relayout(pid: str, body: dict, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    body["id"] = pid
    body["department"] = storage.dept_of(pid)
    # Realize temp-keyed new nodes so the layout CLI's schema check passes. Stateless:
    # nothing is written; these real ids ride back to the editor and are kept at Save.
    doc, _remap = save_mod.allocate_new_node_ids(cfg, body)
    try:
        return engine.run_layout(cfg, doc)
    except engine.EngineError as e:
        raise HTTPException(status_code=422, detail=e.message)
```

> `save_mod` is already imported in `processes.py` (Task 9). No new import needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_relayout.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/processes.py ui-backend/tests/test_processes_relayout.py
git commit -m "phase-5(ui-backend): compute-only relayout via layout CLI"
```

---

### Task 12: conflict inbox — accept/reject via merge (AC-6)

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/processes.py`
- Test: `ui-backend/tests/test_processes_pending.py`

**Interfaces:**
- Consumes: `engine.resolve_pending`, `models.PendingDecision`.
- Produces: `POST /api/processes/{pid}/pending/{index}` (body `{decision}`) → updated doc; `merge` non-zero → 409.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_processes_pending.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def _first_open(doc):
    for i, row in enumerate(doc["pending"]):
        if row["status"] == "open":
            return i, row
    return None, None


def test_accept_applies_proposal_and_commits(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, row = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    out = c.post(f"/api/processes/cooking-001/pending/{i}",
                 json={"decision": "accept"}).json()
    node = next(n for n in out["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == row["proposed"]
    assert out["pending"][i]["status"] == "accepted"


def test_reject_leaves_node_and_flags_row(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, row = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    node_before = next(n for n in doc["nodes"] if n["id"] == row["node"])[row["field"]]
    out = c.post(f"/api/processes/cooking-001/pending/{i}",
                 json={"decision": "reject"}).json()
    node = next(n for n in out["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == node_before
    assert out["pending"][i]["status"] == "rejected"


def test_double_resolve_409(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, _ = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    c.post(f"/api/processes/cooking-001/pending/{i}", json={"decision": "accept"})
    again = c.post(f"/api/processes/cooking-001/pending/{i}", json={"decision": "accept"})
    assert again.status_code == 409
```

> **Fixture prerequisite (do this first — the shared fixture currently has `"pending": []`).**
> Edit `tests/fixtures/process.cooking-001.json`, replacing `"pending": []` with an `open`
> row targeting the fixture's real activity node `cooking-001-n010` (field `actor`, current
> value `کارپرداز`):
>
> ```json
> "pending": [
>   { "node": "cooking-001-n010", "field": "actor",
>     "current": "کارپرداز", "proposed": "انباردار",
>     "source": "runs/cooking-2026-07-06", "status": "open" }
> ]
> ```
>
> This row satisfies `pending` in `process.schema.json` (`node, field, current, proposed,
> source, status`). Because the fixture is shared, after editing run
> `.venv/bin/pytest tests -q` and confirm `test_process_schema.py` still passes (the row is
> schema-valid), then run the full `make test`.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_pending.py -q`
Expected: FAIL (route missing).

- [ ] **Step 3: Implement the pending route**

Add to `ui-backend/inja_ui_backend/routers/processes.py`:

```python
from ..models import PendingDecision


@router.post("/{pid}/pending/{index}")
async def resolve(pid: str, index: int, body: PendingDecision, request: Request,
                  _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    if body.decision not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="decision must be accept|reject")
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="process not found")
    async with storage.file_lock(path):
        try:
            engine.resolve_pending(cfg, pid, index, body.decision)
        except engine.EngineError as e:
            raise HTTPException(status_code=409, detail=e.message)
        gitcommit.commit(cfg, [path], pid, f"{body.decision} pending #{index}")
        return storage.read_json(path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_processes_pending.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/processes.py ui-backend/tests/test_processes_pending.py tests/fixtures/process.cooking-001.json
git commit -m "phase-5(ui-backend): conflict inbox accept/reject via merge (AC-6)"
```

---

### Task 13: static serving, server entrypoint, env example, README, make-test

**Files:**
- Modify: `ui-backend/inja_ui_backend/app.py`, `config/ui-backend.env.example`
- Create: `ui-backend/README.md`, `ui-backend/tests/test_static.py`

**Interfaces:**
- Produces: static mount at `/` serving `cfg.static_dir` when set and present; module-level `app` built lazily only when `DATA_ROOT` is in the environment (so `import inja_ui_backend.app` stays safe in tests).

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_static.py`:

```python
import argon2
from fastapi.testclient import TestClient

from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def test_static_served_when_configured(data_root, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw"),
                           "static_dir": dist})
    c = TestClient(create_app(cfg))
    r = c.get("/")
    assert r.status_code == 200 and "inja" in r.text


def test_no_static_dir_is_fine(data_root):
    cfg = cfg_for(data_root)
    c = TestClient(create_app(cfg))
    # API still works; no crash from missing static
    assert c.get("/api/auth/me").status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_static.py -q`
Expected: FAIL (`/` 404).

- [ ] **Step 3: Implement static mount + lazy app**

Modify `ui-backend/inja_ui_backend/app.py`:

```python
import os

from fastapi.staticfiles import StaticFiles
...

def create_app(cfg: Settings | None = None) -> FastAPI:
    if cfg is None:
        cfg = load_settings()
    app = FastAPI(title="inja-ui-backend")
    app.state.cfg = cfg
    app.include_router(auth_router.router)
    app.include_router(departments_router.router)
    app.include_router(processes_router.router)
    if cfg.static_dir and cfg.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(cfg.static_dir), html=True), name="static")
    return app


app = create_app() if os.environ.get("DATA_ROOT") else None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_static.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Extend the env example**

Replace `config/ui-backend.env.example` with:

```
# UI backend — SAMPLE, no real secrets (ARD §13)
DATA_ROOT=/path/to/data-repo
# where the frozen JSON schemas live (code-repo/schemas), for the engine CLIs
SCHEMA_DIR=/path/to/code-repo/schemas
# single UI user
UI_USERNAME=
# argon2 hash of the UI password (never the plaintext) — NFR-3
UI_PASSWORD_HASH=
# secret for signing the session cookie
SESSION_SIGNING_KEY=
# session lifetime in seconds (default 86400)
SESSION_TTL=86400
# built frontend directory (ui/dist); may be absent until Phase 6
UI_STATIC_DIR=
# author identity for ui-edit commits
GIT_AUTHOR_NAME=ui-edit
GIT_AUTHOR_EMAIL=ui-edit@inja.local
```

- [ ] **Step 6: Write the README runbook**

Create `ui-backend/README.md` with: purpose (one paragraph), install (`pip install -e ui-backend`; engine CLIs must be on PATH via `pip install -e engine`), required env (point to `config/ui-backend.env.example`), how to generate an argon2 hash (`python -c "import argon2,sys;print(argon2.PasswordHasher().hash(sys.argv[1]))" mypassword`), run (`uvicorn inja_ui_backend.app:app --host 0.0.0.0 --port 8000`), and the API route table from the spec §4.

- [ ] **Step 7: Full suite + lint**

Run: `make test && make lint`
Expected: all green; ruff clean. Fix any import-order/line-length issues ruff reports.

- [ ] **Step 8: Commit**

```bash
git add ui-backend/inja_ui_backend/app.py config/ui-backend.env.example ui-backend/README.md ui-backend/tests/test_static.py
git commit -m "phase-5(ui-backend): static serving + server entrypoint + env/runbook"
```

---

## Self-Review

**Spec coverage:**
- §1 purpose / thin service — Tasks 1–13. ✅
- §2 verbatim schema contract — enforced by validating against `process/overview.schema.json` and never reshaping (Tasks 6, 8, 9). ✅
- §3 module layout — realized file-for-file. ✅
- §4 API surface — auth (T5), departments+overview (T6), read (T7), create/sub (T8), save (T9), delete (T10), relayout (T11), pending (T12), static (T13). ✅
- §5 Save path (path-authoritative id/dept, temp-id feed-forward allocation, edge rewrite, `layout:"manual"` forced **only on new nodes** / incoming layout trusted, provenance, validate, atomic write, commit) — Task 9 + `save.py` (`allocate_new_node_ids` + `prepare_save`). ✅
- §6 create/sub-process **with merge-mirroring parent guards (404/400/409)** — Task 8. ✅
- §7 delete + unlink — Task 10. ✅
- §8 compute-only relayout, **temp-ids realized before `layout` to avoid a schema 422** — Task 11. ✅
- §9 pending accept/reject via merge, status flips, 409 on re-resolve — Task 12. ✅
- §10 storage/concurrency/git/errors — Tasks 2, 4; error codes used across routers (400/401/404/409/422). ✅
- §11 auth — Task 5. ✅
- §12 env surface — Tasks 1, 13. ✅
- §13 testing + exit criteria (AC-6 T12, AC-8 T5, concurrency T2). ✅

**Placeholder scan:** no TBD/TODO; every code step shows complete code. The only deferred detail is the `layout` CLI's exact invocation, which Task 3 Step 1 resolves by reading `engine/layout/cli.py` before implementing — flagged, not hand-waved.

**Type consistency:** `Settings` fields, `EngineError(.message,.code)`, `require_session`, `storage.proc_path/dept_of/file_lock/write_json_atomic/read_json`, `engine.allocate_*`/`resolve_pending`/`validate_doc`/`run_layout`, `save.prepare_save`, and the `router` objects are named identically across every task that references them. Cookie name `inja_session` and `COOKIE_NAME` agree.

**Open verification (call out during execution):** (1) `layout` CLI I/O contract (Task 3 Step 1); (2) the shared `process.cooking-001.json` fixture must contain an `open` pending row for Task 12 — add one if absent and re-run the root `tests/` suite.
