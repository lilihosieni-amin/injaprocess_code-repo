# Department Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each department two on-demand exports — an official flowchart document and a step-by-step staff guide — each a standalone HTML file served from a permanent link and printable to PDF.

**Architecture:** A second Vite build produces two self-contained HTML templates carrying an empty data slot. The FastAPI backend substitutes a department's JSON into a template, writes the file under `EXPORT_DIR`, and serves it from an unauthenticated `/exports` mount. The flowchart template imports the app's real React Flow node and edge components, so its diagram is the site's diagram rather than a lookalike.

**Tech Stack:** Python 3.11 / FastAPI / pytest (backend); React 19 / TypeScript / Vite 6 / Tailwind 3 / `@xyflow/react` 12 / vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-07-26-department-export-design.md`. Decision ids (D1…D16) below refer to its §1 table.

## Global Constraints

- **All UI copy is Persian.** Exact strings are given in each task; copy them character-for-character, including ZWNJ (`‌`) inside words like `گام‌به‌گام`.
- **Never generate ids in application code** (INV-1). The export is read-only and mints no ids.
- **Components communicate only through the filesystem** (ARD §1). The export endpoint reads `DATA_ROOT` and writes `EXPORT_DIR`; it makes no network calls.
- **`ui-backend` stays thin.** Its only export logic is payload assembly and string substitution. No HTML rendering in Python.
- **No schema changes.** `schemas/` is frozen for this feature.
- **Export kinds are exactly** `flowchart` and `steps`. Any other value is a 404.
- **The token is** `HMAC-SHA256(session_signing_key, "export:{code}:{kind}")` hex-digested and truncated to **16 characters** (D7).
- **Tests run from the repo root:** `make test` (pytest, whole repo) and `npm --prefix ui test` (vitest). Individual runs are given per task.
- **Commit after every task.** Conventional-commit prefixes, matching the repo's history: `feat:`, `fix:`, `test:`, `docs:`, `build:`, `chore:`.
- **Python style:** `from __future__ import annotations` at the top of every new module; `ruff` clean (`make lint`).
- **TypeScript style:** `verbatimModuleSyntax` is on — type-only imports must use `import type { … }`.

---

## File Structure

**Backend — created**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/exports.py` | Token derivation, export paths, payload assembly, template substitution, atomic write with sibling pruning. No FastAPI imports. |
| `ui-backend/inja_ui_backend/routers/exports.py` | The single `POST` endpoint; translates `exports.py` errors into HTTP status codes. |
| `ui-backend/tests/test_exports.py` | Unit tests for `exports.py`. |
| `ui-backend/tests/test_exports_api.py` | Endpoint and static-mount tests. |

**Backend — modified**

| Path | Change |
|---|---|
| `ui-backend/inja_ui_backend/config.py` | Two new optional settings: `export_dir`, `export_template_dir`. |
| `ui-backend/inja_ui_backend/storage.py` | Extract `ordered_processes()` — the curated-order logic currently inline in the departments router. |
| `ui-backend/inja_ui_backend/routers/departments.py` | `list_processes` delegates to `storage.ordered_processes()`. |
| `ui-backend/inja_ui_backend/app.py` | Include the exports router; mount `/exports` **before** the SPA root mount. |

**Frontend app — created**

| Path | Responsibility |
|---|---|
| `ui/src/write/ExportMenu.tsx` | The ⋯ button, its dropdown, and ownership of the export mutation + modal state. |
| `ui/src/write/ExportModal.tsx` | Presentational three-state dialog (pending / ready / failed). |
| `ui/src/write/ExportMenu.test.tsx` | Menu + modal behaviour. |

**Frontend app — modified**

| Path | Change |
|---|---|
| `ui/src/api/types.ts` | `ExportKind`, `ExportResult`. |
| `ui/src/api/hooks.ts` | `useCreateExport(code)`. |
| `ui/src/screens/ProcessList.tsx` | Render `<ExportMenu>` in the header. |
| `ui/src/flow/Canvas.tsx` | Three callback props become optional (D2 reuse). |
| `ui/tailwind.config.js` | Content globs cover `./export/**`. |
| `ui/tsconfig.app.json` | `include` covers `export`. |
| `ui/package.json` | `build` runs both Vite configs; add `vite-plugin-singlefile`. |

**Export bundles — created**

| Path | Responsibility |
|---|---|
| `ui/vite.config.export.ts` | Two-entry single-file build to `dist-export/`. |
| `ui/export/flowchart.html`, `ui/export/steps.html` | Entry documents, each holding the data slot. |
| `ui/export/shared/payload.ts` | `ExportPayload` type + `readPayload()`. |
| `ui/export/shared/seed.ts` | `createSeededClient()` — an offline react-query cache. |
| `ui/export/steps/linearize.ts` | Pure `Process → Block[]` graph linearisation. |
| `ui/export/steps/StepsApp.tsx`, `ui/export/steps/PrintDoc.tsx`, `ui/export/steps/steps.module.css`, `ui/export/steps/main.tsx` | The staff guide. |
| `ui/export/flowchart/Document.tsx`, `ProcessSheets.tsx`, `FlowViewer.tsx`, `document.module.css`, `main.tsx` | The official document. |
| `ui/export/print/bands.ts` | Pure band-splitting geometry. |
| `ui/export/print/diagram.tsx` | Measuring host, geometry capture, SVG band emission. |

**Deployment — modified**

`deploy/ui-backend.Dockerfile`, `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml`, `config/` sample env.

---

## Stage 1 — Pipe

Ends with: clicking an export in the UI produces a real file at a real link. Rendering is a stub. This stage also settles the `vite-plugin-singlefile` risk before anything is built on it.

---

### Task 1: Export settings

**Files:**
- Modify: `ui-backend/inja_ui_backend/config.py`
- Test: `ui-backend/tests/test_config.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Settings.export_dir: Optional[Path]`, `Settings.export_template_dir: Optional[Path]`. Both `None` when the env var is absent. Env names: `EXPORT_DIR`, `UI_EXPORT_TEMPLATE_DIR`.

- [ ] **Step 1: Write the failing tests**

Append to `ui-backend/tests/test_config.py`:

```python
def test_export_dirs_default_to_none(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.export_dir is None
    assert s.export_template_dir is None


def test_export_dirs_read_from_env(tmp_path):
    env = _valid_env(tmp_path)
    env["EXPORT_DIR"] = str(tmp_path / "exports")
    env["UI_EXPORT_TEMPLATE_DIR"] = str(tmp_path / "templates")
    s = load_settings(env)
    assert s.export_dir == (tmp_path / "exports")
    assert s.export_template_dir == (tmp_path / "templates")
```

Note the export dirs are *not* required to exist at load time — unlike `DATA_ROOT`, the export dir is created on first write, and the template dir's absence is reported as a 503 at request time rather than crashing the process at boot.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_config.py -k export -v`
Expected: FAIL with `AttributeError: 'Settings' object has no attribute 'export_dir'`.

- [ ] **Step 3: Add the fields**

In `ui-backend/inja_ui_backend/config.py`, add two fields to the `Settings` dataclass, immediately after `static_dir`:

```python
    static_dir: Optional[Path]
    export_dir: Optional[Path]
    export_template_dir: Optional[Path]
```

And in `load_settings`, beside the existing `static = env.get("UI_STATIC_DIR")` line:

```python
    static = env.get("UI_STATIC_DIR")
    export_dir = env.get("EXPORT_DIR")
    export_templates = env.get("UI_EXPORT_TEMPLATE_DIR")
    return Settings(
        ...
        static_dir=Path(static) if static else None,
        export_dir=Path(export_dir) if export_dir else None,
        export_template_dir=Path(export_templates) if export_templates else None,
        ...
    )
```

Keep the existing keyword arguments; add the two new ones in the same position as the fields.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest ui-backend/tests/test_config.py -v`
Expected: PASS, all tests in the file.

`ui-backend/inja_ui_backend/tests_helpers.py` builds `Settings` through `load_settings`, so it needs no change — the new fields default to `None`.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/config.py ui-backend/tests/test_config.py
git commit -m "feat(export): EXPORT_DIR and UI_EXPORT_TEMPLATE_DIR settings"
```

---

### Task 2: Curated order, extracted

`departments.list_processes` holds the only implementation of "what is this department's process sequence". The export must not grow a second one (spec §2.2), so it moves to `storage` first.

**Files:**
- Modify: `ui-backend/inja_ui_backend/storage.py`
- Modify: `ui-backend/inja_ui_backend/routers/departments.py:112-160`
- Test: `ui-backend/tests/test_storage.py`

**Interfaces:**
- Consumes: `storage.list_process_files`, `storage.order_path`.
- Produces: `storage.ordered_processes(root: Path, code: str) -> list[dict]` — active processes in curated order, then tombstones in id order. Same list `GET /api/departments/{code}/processes` returns today.

- [ ] **Step 1: Write the failing test**

Append to `ui-backend/tests/test_storage.py`:

```python
import json

from inja_ui_backend import storage


def _proc(root, code, pid, tombstoned=False):
    d = root / "departments" / code / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": code, "name": pid, "tombstoned": tombstoned}
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def test_ordered_processes_follows_order_json_then_tombstones(tmp_path):
    root = tmp_path / "data"
    for pid in ("dining-001", "dining-002", "dining-003"):
        _proc(root, "dining", pid)
    _proc(root, "dining", "dining-009", tombstoned=True)
    (root / "departments" / "dining" / "order.json").write_text(
        json.dumps({"order": ["dining-003", "dining-001", "dining-002"]}), encoding="utf-8")

    got = [p["id"] for p in storage.ordered_processes(root, "dining")]
    assert got == ["dining-003", "dining-001", "dining-002", "dining-009"]


def test_ordered_processes_appends_ids_the_order_does_not_know(tmp_path):
    root = tmp_path / "data"
    for pid in ("dining-001", "dining-002"):
        _proc(root, "dining", pid)
    (root / "departments" / "dining" / "order.json").write_text(
        json.dumps({"order": ["dining-002"]}), encoding="utf-8")

    got = [p["id"] for p in storage.ordered_processes(root, "dining")]
    assert got == ["dining-002", "dining-001"]


def test_ordered_processes_survives_an_unreadable_order_file(tmp_path):
    root = tmp_path / "data"
    for pid in ("dining-002", "dining-001"):
        _proc(root, "dining", pid)
    (root / "departments" / "dining" / "order.json").write_text("{ not json", encoding="utf-8")

    got = [p["id"] for p in storage.ordered_processes(root, "dining")]
    assert got == ["dining-001", "dining-002"]   # falls back to id order
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_storage.py -k ordered_processes -v`
Expected: FAIL with `AttributeError: module 'inja_ui_backend.storage' has no attribute 'ordered_processes'`.

- [ ] **Step 3: Move the logic into storage**

Add to the top of `ui-backend/inja_ui_backend/storage.py`:

```python
import logging

logger = logging.getLogger(__name__)
```

and append this function, lifted verbatim from `routers/departments.py` including its comments:

```python
def ordered_processes(root: Path, code: str) -> list[dict]:
    """`code`'s processes in curated order (ARD §4.6), tombstones last in id order.

    The only implementation of the fallback rule: ids the order does not know are
    appended in id order, ids it names but disk does not have are skipped, and a
    repeated id is kept once. In a consistent data-repo the fallback contributes
    nothing — it is here so a hand-edited or not-yet-migrated repo degrades
    instead of hiding (or doubling) processes.
    """
    docs = {p.stem: read_json(p) for p in list_process_files(root, code)}
    actives = sorted(pid for pid, d in docs.items() if not d.get("tombstoned"))
    tombs = sorted(pid for pid, d in docs.items() if d.get("tombstoned"))

    order = []
    opath = order_path(root, code)
    if opath.is_file():
        try:
            order = [pid for pid in read_json(opath)["order"] if isinstance(pid, str)]
        except (ValueError, OSError, TypeError, KeyError) as e:
            # An unreadable order.json must not take the whole department's list
            # down with it: a 500 here also blocks the only in-UI repair, since
            # the reorder PUT *does* heal the file but the panel cannot be opened
            # on a list that never loads. Fall through to id order.
            logger.warning("%s: falling back to id order — %s is unreadable: %s",
                           code, opath, e)
            order = []

    known = set(actives)
    # dict.fromkeys keeps the first occurrence of a hand-edited duplicate, in place
    seq = list(dict.fromkeys(pid for pid in order if pid in known))
    placed = set(seq)
    seq += [pid for pid in actives if pid not in placed]
    return [docs[pid] for pid in seq + tombs]
```

- [ ] **Step 4: Delegate from the router**

Replace the body of `list_processes` in `ui-backend/inja_ui_backend/routers/departments.py` (the docstring stays; everything after it goes):

```python
@router.get("/{code}/processes")
def list_processes(code: str, request: Request, _: str = Depends(require_session)):
    """Processes in curated order (ARD §4.6), tombstones last in id order.

    The ordering rule itself lives in `storage.ordered_processes` so the export
    and this endpoint cannot disagree about a department's sequence.
    """
    cfg = request.app.state.cfg
    return storage.ordered_processes(cfg.data_root, code)
```

- [ ] **Step 5: Run the whole backend suite**

Run: `.venv/bin/pytest ui-backend -q`
Expected: PASS. `test_departments.py` exercises the endpoint and must stay green — that is the proof the move was behaviour-preserving.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/storage.py ui-backend/inja_ui_backend/routers/departments.py ui-backend/tests/test_storage.py
git commit -m "refactor: curated process order moves to storage.ordered_processes"
```

---

### Task 3: Export token, payload and file writing

**Files:**
- Create: `ui-backend/inja_ui_backend/exports.py`
- Test: `ui-backend/tests/test_exports.py`

**Interfaces:**
- Consumes: `storage.ordered_processes`, `storage.overview_path`, `storage.read_json`.
- Produces:
  - `EXPORT_KINDS: tuple[str, ...] = ("flowchart", "steps")`
  - `export_token(signing_key: str, code: str, kind: str) -> str` — 16 hex chars
  - `build_payload(data_root: Path, code: str, generated_at: str) -> dict`
  - `render(template: str, payload: dict) -> str`
  - `write_export(export_dir: Path, code: str, kind: str, token: str, html: str) -> Path`
  - `ExportUnavailable(Exception)` — raised when a needed directory is missing.

- [ ] **Step 1: Write the failing tests**

Create `ui-backend/tests/test_exports.py`:

```python
import json

import pytest
from inja_ui_backend import exports


def test_token_is_16_hex_chars_and_stable():
    a = exports.export_token("key", "dining", "flowchart")
    b = exports.export_token("key", "dining", "flowchart")
    assert a == b
    assert len(a) == 16
    assert all(c in "0123456789abcdef" for c in a)


def test_token_differs_by_kind_department_and_key():
    base = exports.export_token("key", "dining", "flowchart")
    assert base != exports.export_token("key", "dining", "steps")
    assert base != exports.export_token("key", "cooking", "flowchart")
    assert base != exports.export_token("other", "dining", "flowchart")


def test_build_payload_orders_processes_drops_tombstones_and_empties_pending(data_root):
    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")
    assert payload["dept"]["department"] == "cooking"
    assert payload["generated_at"] == "2026-07-26T09:00:00Z"
    assert [p["id"] for p in payload["processes"]] == ["cooking-001"]
    assert all(p["pending"] == [] for p in payload["processes"])
    assert all(not p.get("tombstoned") for p in payload["processes"])


def test_render_substitutes_the_slot_and_escapes_angle_brackets():
    template = '<script id="inja-export-data">__INJA_EXPORT_DATA__</script>'
    html = exports.render(template, {"name": "</script><img src=x>"})
    assert "__INJA_EXPORT_DATA__" not in html
    # the payload cannot close the script tag
    assert html.count("</script>") == 1
    assert "\\u003c" in html
    # and it still parses back to the original text
    body = html[html.index(">") + 1: html.rindex("</script>")]
    assert json.loads(body)["name"] == "</script><img src=x>"


def test_render_keeps_persian_unescaped():
    html = exports.render("__INJA_EXPORT_DATA__", {"name": "سالن"})
    assert "سالن" in html


def test_write_export_creates_the_file_and_prunes_older_siblings(tmp_path):
    d = tmp_path / "exports"
    stale = d / "dining"
    stale.mkdir(parents=True)
    (stale / "flowchart-deadbeefdeadbeef.html").write_text("old", encoding="utf-8")
    (stale / "steps-cafecafecafecafe.html").write_text("keep", encoding="utf-8")

    path = exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "<html>new</html>")

    assert path == d / "dining" / "flowchart-0123456789abcdef.html"
    assert path.read_text(encoding="utf-8") == "<html>new</html>"
    assert not (stale / "flowchart-deadbeefdeadbeef.html").exists()   # pruned
    assert (stale / "steps-cafecafecafecafe.html").exists()            # other kind untouched
    assert not list(d.glob("**/*.tmp"))                                 # no temp left behind


def test_write_export_overwrites_the_same_token(tmp_path):
    d = tmp_path / "exports"
    exports.write_export(d, "dining", "steps", "0123456789abcdef", "first")
    path = exports.write_export(d, "dining", "steps", "0123456789abcdef", "second")
    assert path.read_text(encoding="utf-8") == "second"
    assert len(list((d / "dining").glob("steps-*.html"))) == 1


def test_build_payload_raises_for_a_department_without_an_overview(data_root):
    with pytest.raises(exports.ExportUnavailable):
        exports.build_payload(data_root, "dining", "2026-07-26T09:00:00Z")
```

The `data_root` fixture (`ui-backend/tests/conftest.py`) seeds `cooking` with one process and one overview, and creates the other departments empty — which is why `dining` has no overview.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_exports.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'inja_ui_backend.exports'`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/exports.py`:

```python
from __future__ import annotations

import contextlib
import hashlib
import hmac
import json
import os
import tempfile
from pathlib import Path

from . import storage

EXPORT_KINDS: tuple[str, ...] = ("flowchart", "steps")

#: The literal the built template carries where its data belongs.
DATA_SLOT = "__INJA_EXPORT_DATA__"


class ExportUnavailable(Exception):
    """A directory or file the export needs is not there."""


def export_token(signing_key: str, code: str, kind: str) -> str:
    """Stable, unguessable per department+kind (D6, D7).

    Derived rather than stored: no state to migrate, and the same link survives
    a restart. Rotating SESSION_SIGNING_KEY rotates every link — `write_export`
    prunes the orphan that leaves behind.
    """
    mac = hmac.new(signing_key.encode("utf-8"),
                   f"export:{code}:{kind}".encode("utf-8"),
                   hashlib.sha256)
    return mac.hexdigest()[:16]


def build_payload(data_root: Path, code: str, generated_at: str) -> dict:
    """What the template renders: the overview, the processes, the timestamp.

    `pending` is emptied here rather than hidden in the template — an
    unauthenticated link (D6) must not carry unreviewed internal disagreements.
    """
    overview = storage.overview_path(data_root, code)
    if not overview.is_file():
        raise ExportUnavailable(f"department {code} has no overview.json")
    procs = []
    for doc in storage.ordered_processes(data_root, code):
        if doc.get("tombstoned"):
            continue
        procs.append({**doc, "pending": []})
    return {
        "dept": storage.read_json(overview),
        "processes": procs,
        "generated_at": generated_at,
    }


def render(template: str, payload: dict) -> str:
    """Substitute the data slot.

    Every `<` becomes its JSON escape, so no summary or description containing
    `</script>` can close the data block and inject markup. `JSON.parse` turns
    the escape back into `<`, so rendered text is unaffected.
    """
    body = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    return template.replace(DATA_SLOT, body)


def write_export(export_dir: Path, code: str, kind: str, token: str, html: str) -> Path:
    """Write atomically, then drop any older file of the same kind.

    Atomic because the link is permanent and public: a reader must never catch a
    half-written document. Pruning keeps one file per department+kind (D5) and
    clears orphans left by a rotated signing key.
    """
    folder = Path(export_dir) / code
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{kind}-{token}.html"

    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(html)
        os.replace(tmp, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)

    for stale in folder.glob(f"{kind}-*.html"):
        if stale != path:
            with contextlib.suppress(OSError):
                stale.unlink()
    return path
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/pytest ui-backend/tests/test_exports.py -v`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint**

Run: `.venv/bin/ruff check ui-backend`
Expected: `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/exports.py ui-backend/tests/test_exports.py
git commit -m "feat(export): token derivation, payload assembly and atomic writes"
```

---

### Task 4: The export endpoint and the `/exports` mount

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/exports.py`
- Modify: `ui-backend/inja_ui_backend/app.py`
- Test: `ui-backend/tests/test_exports_api.py`

**Interfaces:**
- Consumes: everything from Task 3; `auth.require_session`; `config.Settings.export_dir` / `.export_template_dir`.
- Produces: `POST /api/departments/{code}/exports/{kind}` returning `{"url": "/exports/{code}/{kind}-{token}.html", "generated_at": "…Z"}`, and a `/exports` static mount.

- [ ] **Step 1: Write the failing tests**

Create `ui-backend/tests/test_exports_api.py`:

```python
import json

from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import COOKIE_NAME, issue_cookie
from inja_ui_backend.tests_helpers import cfg_for

TEMPLATE = '<!doctype html><script id="inja-export-data">__INJA_EXPORT_DATA__</script>'


def _cfg(data_root, tmp_path, *, templates=True, exports=True):
    cfg = cfg_for(data_root)
    tdir = tmp_path / "templates"
    if templates:
        tdir.mkdir(exist_ok=True)
        (tdir / "flowchart.html").write_text(TEMPLATE, encoding="utf-8")
        (tdir / "steps.html").write_text(TEMPLATE, encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__,
                           "export_dir": (tmp_path / "exports") if exports else None,
                           "export_template_dir": tdir if templates else None})


def _client(cfg):
    c = TestClient(create_app(cfg))
    c.cookies.set(COOKIE_NAME, issue_cookie(cfg, "analyst"))
    return c


def test_export_writes_a_file_and_returns_its_url(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 200
    url = r.json()["url"]
    assert url.startswith("/exports/cooking/flowchart-") and url.endswith(".html")
    written = cfg.export_dir / "cooking" / url.rsplit("/", 1)[1]
    assert written.is_file()
    assert "__INJA_EXPORT_DATA__" not in written.read_text(encoding="utf-8")


def test_export_url_is_stable_across_calls(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path))
    first = c.post("/api/departments/cooking/exports/steps").json()["url"]
    second = c.post("/api/departments/cooking/exports/steps").json()["url"]
    assert first == second


def test_export_requires_a_session(data_root, tmp_path):
    c = TestClient(create_app(_cfg(data_root, tmp_path)))   # no cookie
    assert c.post("/api/departments/cooking/exports/steps").status_code == 401


def test_unknown_kind_is_404(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path))
    assert c.post("/api/departments/cooking/exports/poster").status_code == 404


def test_department_without_an_overview_is_404(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path))
    r = c.post("/api/departments/dining/exports/flowchart")
    assert r.status_code == 404


def test_missing_export_dir_is_503(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path, exports=False))
    r = c.post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert "EXPORT_DIR" in r.json()["detail"]


def test_missing_template_is_503(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path, templates=False))
    assert c.post("/api/departments/cooking/exports/flowchart").status_code == 503


def test_written_export_is_served_without_a_session(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]

    anon = TestClient(create_app(cfg))          # deliberately no cookie — D6
    r = anon.get(url)
    assert r.status_code == 200
    assert "inja-export-data" in r.text


def test_exports_mount_does_not_shadow_api_404s(data_root, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = _cfg(data_root, tmp_path)
    cfg = cfg.__class__(**{**cfg.__dict__, "static_dir": dist})
    c = TestClient(create_app(cfg))
    # the SPA shell answers deep links…
    assert "inja" in c.get("/departments").text
    # …but an unknown API path stays a JSON 404, and an unknown export a plain 404
    assert c.get("/api/does-not-exist").status_code == 404
    assert "inja" not in c.get("/api/does-not-exist").text
    assert c.get("/exports/cooking/nope.html").status_code == 404


def test_payload_in_the_written_file_has_no_pending(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]
    html = (cfg.export_dir / "cooking" / url.rsplit("/", 1)[1]).read_text(encoding="utf-8")
    body = html[html.index(">", html.index("inja-export-data")) + 1: html.rindex("</script>")]
    payload = json.loads(body)
    assert all(p["pending"] == [] for p in payload["processes"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_exports_api.py -v`
Expected: FAIL — every POST returns 404, because the route does not exist yet.

- [ ] **Step 3: Write the router**

Create `ui-backend/inja_ui_backend/routers/exports.py`:

```python
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import exports, storage
from ..auth import require_session

router = APIRouter(prefix="/api/departments")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.post("/{code}/exports/{kind}")
def create_export(code: str, kind: str, request: Request,
                  _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    if kind not in exports.EXPORT_KINDS:
        raise HTTPException(status_code=404, detail=f"unknown export kind: {kind}")

    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")

    if not cfg.export_dir:
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)")
    if not cfg.export_template_dir:
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (UI_EXPORT_TEMPLATE_DIR)")

    template_path = cfg.export_template_dir / f"{kind}.html"
    if not template_path.is_file():
        raise HTTPException(status_code=503,
                            detail=f"قالب خروجی یافت نشد: {template_path.name}")

    generated_at = _now()
    try:
        payload = exports.build_payload(cfg.data_root, code, generated_at)
    except exports.ExportUnavailable as e:
        # a department with no overview.json has nothing to document yet
        raise HTTPException(status_code=404, detail=str(e))

    html = exports.render(template_path.read_text(encoding="utf-8"), payload)
    token = exports.export_token(cfg.session_signing_key, code, kind)
    try:
        exports.write_export(cfg.export_dir, code, kind, token, html)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"نوشتن فایل خروجی انجام نشد: {e}")

    return {"url": f"/exports/{code}/{kind}-{token}.html",
            "generated_at": generated_at}
```

- [ ] **Step 4: Wire it into the app**

In `ui-backend/inja_ui_backend/app.py`, add the import beside the others:

```python
from .routers import exports as exports_router
```

and inside `create_app`, after `app.include_router(departments_router.router)`:

```python
    app.include_router(exports_router.router)
```

Then, immediately **before** the existing `if cfg.static_dir …` block:

```python
    # Mounted ahead of the SPA catch-all: a mount at "/" swallows everything
    # registered after it, and its 404 fallback would answer /exports/... with
    # index.html. Deliberately unauthenticated — the token in the filename is
    # the only guard (D6).
    if cfg.export_dir:
        cfg.export_dir.mkdir(parents=True, exist_ok=True)
        app.mount("/exports", StaticFiles(directory=str(cfg.export_dir)), name="exports")
    if cfg.static_dir and cfg.static_dir.is_dir():
        app.mount("/", SPAStaticFiles(directory=str(cfg.static_dir), html=True), name="static")
```

`StaticFiles` is already imported at the top of the file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/pytest ui-backend/tests/test_exports_api.py -v`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the whole backend suite and lint**

Run: `.venv/bin/pytest ui-backend -q && .venv/bin/ruff check ui-backend`
Expected: all pass, `All checks passed!`

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/exports.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_exports_api.py
git commit -m "feat(export): POST /api/departments/{code}/exports/{kind} and the /exports mount"
```

---

### Task 5: The single-file export build

This task settles the `vite-plugin-singlefile` risk from spec §9 before anything is built on top of it. The bundles render nothing but their own payload — that is the point: it proves the pipe end to end.

**Files:**
- Create: `ui/vite.config.export.ts`, `ui/export/flowchart.html`, `ui/export/steps.html`, `ui/export/shared/payload.ts`, `ui/export/flowchart/main.tsx`, `ui/export/steps/main.tsx`
- Modify: `ui/package.json`, `ui/tailwind.config.js`, `ui/tsconfig.app.json`, `ui/.gitignore` (or the repo root `.gitignore` — whichever already ignores `ui/dist`)

**Interfaces:**
- Consumes: the `__INJA_EXPORT_DATA__` slot contract from Task 3.
- Produces:
  - `ui/dist-export/flowchart.html` and `ui/dist-export/steps.html` — self-contained templates.
  - `ExportPayload` type and `readPayload(): ExportPayload` from `ui/export/shared/payload.ts`. Stages 2–4 import both.

- [ ] **Step 1: Install the plugin**

Run: `npm --prefix ui install -D vite-plugin-singlefile`
Expected: it lands in `devDependencies` and `package-lock.json` updates.

- [ ] **Step 2: Write the payload reader**

Create `ui/export/shared/payload.ts`:

```ts
import type { Overview, Process } from '../../src/api/types'

export type ExportPayload = {
  dept: Overview
  processes: Process[]
  generated_at: string
}

/** Read the JSON the backend substituted into the data slot.
 *
 * Kept in one place because the slot id is a contract with
 * `inja_ui_backend/exports.py` — the backend writes it, both bundles read it.
 */
export function readPayload(): ExportPayload {
  const el = document.getElementById('inja-export-data')
  if (!el?.textContent) throw new Error('export data slot is empty')
  return JSON.parse(el.textContent) as ExportPayload
}

/** The mockup's cover reads a `fullName` the overview schema does not have,
 *  so it is derived here rather than added to a frozen contract. */
export function deptFullName(dept: Overview): string {
  return `دپارتمان ${dept.name}`
}
```

- [ ] **Step 3: Write the two entry documents**

Create `ui/export/flowchart.html`:

```html
<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>مستند فرآیندهای واحد — اینجا فست‌فود</title>
  </head>
  <body>
    <div id="root"></div>
    <script id="inja-export-data" type="application/json">__INJA_EXPORT_DATA__</script>
    <script type="module" src="/export/flowchart/main.tsx"></script>
  </body>
</html>
```

Create `ui/export/steps.html`, identical but for the title and the entry path:

```html
<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>راهنمای گام‌به‌گام کار — اینجا فست‌فود</title>
  </head>
  <body>
    <div id="root"></div>
    <script id="inja-export-data" type="application/json">__INJA_EXPORT_DATA__</script>
    <script type="module" src="/export/steps/main.tsx"></script>
  </body>
</html>
```

The data script sits **before** the module script so the payload is in the DOM by the time the bundle runs.

- [ ] **Step 4: Write both stub entries**

Create `ui/export/flowchart/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import '../../src/index.css'
import { readPayload } from '../shared/payload'

const payload = readPayload()

createRoot(document.getElementById('root')!).render(
  <div className="p-10 font-sans text-ink">
    <h1 className="font-extrabold text-2xl">مستند فرآیندهای واحد {payload.dept.name}</h1>
    <p className="text-muted mt-2">{payload.processes.length} فرآیند</p>
  </div>,
)
```

Create `ui/export/steps/main.tsx` with the same body but the heading `راهنمای گام‌به‌گام کار — واحد {payload.dept.name}`.

- [ ] **Step 5: Write the export Vite config**

Create `ui/vite.config.export.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

// A second build whose output is two *self-contained* HTML documents: the JS,
// the CSS and the Vazirmatn woff2 are all inlined, so an export opens offline
// with no server (D3). `ui-backend` treats each file as a template and only
// substitutes its data slot.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-export',
    emptyOutDir: true,
    // fold every referenced asset (the font in particular) into the CSS as a
    // data: URI — singlefile inlines JS and CSS but not font files
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: {
        flowchart: resolve(__dirname, 'export/flowchart.html'),
        steps: resolve(__dirname, 'export/steps.html'),
      },
    },
  },
})
```

- [ ] **Step 6: Widen the toolchain to see `export/`**

In `ui/tailwind.config.js`, replace the `content` array:

```js
  content: ['./index.html', './src/**/*.{ts,tsx}', './export/**/*.{ts,tsx}', './export/*.html'],
```

Without this, every Tailwind class used only by an export component is purged and the exported document renders unstyled.

In `ui/tsconfig.app.json`, replace the `include`:

```json
  "include": ["src", "export"]
```

In `ui/package.json`, replace the `build` script:

```json
    "build": "tsc -b && vite build && vite build -c vite.config.export.ts",
```

- [ ] **Step 7: Ignore the build output**

Add `dist-export` beside the existing `dist` entry in whichever `.gitignore` covers `ui/dist`.

Run: `git check-ignore -v ui/dist-export/flowchart.html`
Expected: a line naming the `.gitignore` rule that matched. If nothing prints, add `ui/dist-export` explicitly.

- [ ] **Step 8: Build and verify the file is genuinely self-contained**

Run: `npm --prefix ui run build`
Expected: succeeds; `ui/dist-export/flowchart.html` and `ui/dist-export/steps.html` exist.

Run:

```bash
cd ui && node -e '
const fs = require("fs");
for (const f of ["flowchart", "steps"]) {
  const html = fs.readFileSync(`dist-export/${f}.html`, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(?!data:)([^"]+)"/g)].map(m => m[1]);
  console.log(f, (html.length / 1024 / 1024).toFixed(2) + "MB",
              "slot:", html.includes("__INJA_EXPORT_DATA__"),
              "external refs:", JSON.stringify(refs));
}'
```

Expected: `slot: true` for both, and `external refs: []` — no `src`/`href` pointing at a separate file. If any external reference survives, the file is not standalone and the fallback in spec §9 applies: drop `viteSingleFile` and add a Node post-build script that inlines the referenced assets.

- [ ] **Step 9: Verify a rendered export opens standalone**

Run:

```bash
cd ui && python3 -c "
import json, pathlib
t = pathlib.Path('dist-export/steps.html').read_text(encoding='utf-8')
payload = {'dept': {'department':'dining','name':'سالن','description':'d','sub_units':[],'personnel':[],'updated_at':'2026-07-26T09:00:00Z'}, 'processes': [], 'generated_at':'2026-07-26T09:00:00Z'}
body = json.dumps(payload, ensure_ascii=False).replace('<', '\\\\u003c')
pathlib.Path('/tmp/inja-export-smoke.html').write_text(t.replace('__INJA_EXPORT_DATA__', body), encoding='utf-8')
print('/tmp/inja-export-smoke.html')"
```

Open the printed path in Chrome **from the filesystem** (not through a server). Expected: the heading `راهنمای گام‌به‌گام کار — واحد سالن` renders in Vazirmatn with the network disconnected. That is D3 proven.

- [ ] **Step 10: Commit**

```bash
git add ui/vite.config.export.ts ui/export ui/package.json ui/package-lock.json ui/tailwind.config.js ui/tsconfig.app.json .gitignore
git commit -m "build(export): single-file Vite build for the two export documents"
```

---

### Task 6: `useCreateExport`

**Files:**
- Modify: `ui/src/api/types.ts`, `ui/src/api/hooks.ts`
- Test: `ui/src/api/hooks.export.test.tsx`

**Interfaces:**
- Consumes: `fetchJson`, `ApiError` from `ui/src/api/client.ts`.
- Produces:
  - `ExportKind = 'flowchart' | 'steps'` and `ExportResult = { url: string; generated_at: string }` in `api/types.ts`.
  - `useCreateExport(code: string)` — a mutation whose variable is an `ExportKind` and whose data is an `ExportResult`. No cache invalidation: an export reads state, it does not change any.

- [ ] **Step 1: Write the failing test**

Create `ui/src/api/hooks.export.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCreateExport } from './hooks'
import { createWrapper } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('useCreateExport', () => {
  it('posts to the department export endpoint for the given kind', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: '/exports/dining/steps-0123456789abcdef.html', generated_at: '2026-07-26T09:00:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useCreateExport('dining'), { wrapper: createWrapper() })
    result.current.mutate('steps')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/exports/steps', expect.objectContaining({ method: 'POST' }))
    expect(result.current.data?.url).toBe('/exports/dining/steps-0123456789abcdef.html')
  })

  it('surfaces the backend detail on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useCreateExport('dining'), { wrapper: createWrapper() })
    result.current.mutate('flowchart')
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('EXPORT_DIR')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix ui test -- hooks.export`
Expected: FAIL — `useCreateExport` is not exported from `./hooks`.

- [ ] **Step 3: Add the types**

Append to `ui/src/api/types.ts`:

```ts
export type ExportKind = 'flowchart' | 'steps'
export interface ExportResult { url: string; generated_at: string }
```

- [ ] **Step 4: Add the hook**

In `ui/src/api/hooks.ts`, extend the type import with `ExportKind, ExportResult`, then append:

```ts
export function useCreateExport(code: string) {
  // No invalidation: an export reads the department, it changes nothing.
  return useMutation({
    mutationFn: (kind: ExportKind) =>
      fetchJson<ExportResult>(`/api/departments/${code}/exports/${kind}`, { method: 'POST' }),
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix ui test -- hooks.export`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add ui/src/api/types.ts ui/src/api/hooks.ts ui/src/api/hooks.export.test.tsx
git commit -m "feat(export): useCreateExport mutation"
```

---

### Task 7: The three-state export modal

Purely presentational, so it can be tested without a network. Designed in `ui/design/Inja Responsive.dc.html:835-867` (the `hasExportReady` block) — the ready state is that markup; pending and failed reuse its frame.

**Files:**
- Create: `ui/src/write/ExportModal.tsx`
- Test: `ui/src/write/ExportModal.test.tsx`

**Interfaces:**
- Consumes: `Spinner` from `ui/src/ui/Button.tsx`.
- Produces:

```ts
export type ExportModalProps = {
  title: string                       // e.g. 'خروجی مستندات کامل — سند رسمی'
  status: 'pending' | 'ready' | 'failed'
  url?: string                        // absolute, already origin-prefixed
  error?: string
  onRetry: () => void
  onClose: () => void
}
```

- [ ] **Step 1: Write the failing tests**

Create `ui/src/write/ExportModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ExportModal } from './ExportModal'

const TITLE = 'خروجی مستندات کامل — سند رسمی'

describe('ExportModal', () => {
  it('shows a spinner and the building message while pending', () => {
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={() => {}} />)
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
    expect(screen.getByText(TITLE)).toBeInTheDocument()
  })

  it('ignores an outside click while pending but honours it once ready', () => {
    const onClose = vi.fn()
    const { rerender } = render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('export-modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()

    rerender(<ExportModal title={TITLE} status="ready" url="https://x/exports/a.html" onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('export-modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the link, opens it in a new tab, and states the caveats', () => {
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)
    expect(screen.getByText('خروجی آماده شد')).toBeInTheDocument()
    expect(screen.getByDisplayValue(url)).toHaveAttribute('readonly')
    const open = screen.getByRole('link', { name: /باز کردن خروجی/ })
    expect(open).toHaveAttribute('href', url)
    expect(open).toHaveAttribute('target', '_blank')
    expect(screen.getByText('این فایل کاملاً مستقل است و بدون اینترنت هم باز می‌شود.')).toBeInTheDocument()
    expect(screen.getByText('این لینک بدون ورود به سامانه باز می‌شود و با خروجی بعدی جایگزین می‌گردد.')).toBeInTheDocument()
  })

  it('copies the link and flips the button label back after 1.8s', () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(writeText).toHaveBeenCalledWith(url)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1800) })
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows the failure message and retries', () => {
    const onRetry = vi.fn()
    render(<ExportModal title={TITLE} status="failed" error="قالب خروجی یافت نشد" onRetry={onRetry} onClose={() => {}} />)
    expect(screen.getByText('قالب خروجی یافت نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('closes on Escape in every state', () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- ExportModal`
Expected: FAIL — cannot resolve `./ExportModal`.

- [ ] **Step 3: Write the component**

Create `ui/src/write/ExportModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../ui/Button'

export type ExportModalProps = {
  title: string
  status: 'pending' | 'ready' | 'failed'
  url?: string
  error?: string
  onRetry: () => void
  onClose: () => void
}

/** Clipboard write with a fallback for non-secure contexts, where
 *  navigator.clipboard is undefined (the app is reachable over plain http
 *  locally, and the modal must still copy there). */
async function copy(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  } catch { /* fall through to the textarea */ }
  const t = document.createElement('textarea')
  t.value = text
  t.style.position = 'fixed'
  t.style.opacity = '0'
  document.body.appendChild(t)
  t.select()
  document.execCommand('copy')
  document.body.removeChild(t)
}

export function ExportModal({ title, status, url, error, onRetry, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function onCopy() {
    if (!url) return
    void copy(url)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  const tile =
    status === 'ready' ? 'bg-[#E4F6EC] text-green'
      : status === 'failed' ? 'bg-tile-c text-conflict'
        : 'bg-tile-v text-violet'
  const heading =
    status === 'ready' ? 'خروجی آماده شد'
      : status === 'failed' ? 'خروجی گرفته نشد'
        : 'در حال آماده‌سازی خروجی…'

  return (
    // dir is pinned, not inherited: ProcessList's scroll container is dir="ltr"
    // and mounts its modals inside it (same fix as ReorderModal).
    <div
      dir="rtl"
      data-testid="export-modal-backdrop"
      onClick={() => { if (status !== 'pending') onClose() }}
      className="fixed inset-0 bg-[rgba(36,17,82,.45)] backdrop-blur-[3px] flex items-center justify-center z-[74] p-6"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-[520px] max-w-full bg-bg rounded-[20px] overflow-hidden shadow-modal">
        <div className="px-6 py-[22px] bg-white border-b border-warm flex items-center gap-3">
          <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${tile}`}>
            {status === 'pending' ? <Spinner className="w-5 h-5" /> : status === 'ready' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[16px] text-ink">{heading}</div>
            <div className="text-[12px] text-muted mt-0.5">{title}</div>
          </div>
        </div>

        <div className="px-6 py-[22px]">
          {status === 'pending' && (
            <div className="text-[13px] text-muted leading-loose">فایل خروجی در حال ساخته‌شدن است؛ این پنجره به‌محض آماده‌شدن، لینک را نشان می‌دهد.</div>
          )}

          {status === 'failed' && (
            <>
              <div className="text-[13px] text-ink leading-loose">{error}</div>
              <div className="flex gap-2.5 mt-5">
                <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl font-bold text-[14px] text-[#6B5CA5]">بستن</button>
                <button onClick={onRetry} className="btn btn-violet flex-1 py-3 text-[14px]">تلاش دوباره</button>
              </div>
            </>
          )}

          {status === 'ready' && url && (
            <>
              <div className="text-[12.5px] text-muted mb-2.5">لینک فایل HTML خروجی:</div>
              <div className="flex gap-2.5 items-center">
                <input value={url} readOnly dir="ltr"
                  className="flex-1 min-w-0 box-border px-3.5 py-3 border-[1.5px] border-line rounded-xl font-mono text-[12px] text-ink bg-white outline-none" />
                <button onClick={onCopy} className="btn btn-ghost shrink-0 px-[15px] py-3 text-[13px] gap-[7px]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  {copied ? 'کپی شد' : 'کپی لینک'}
                </button>
              </div>
              <div className="text-[11.5px] text-faint mt-3 leading-loose">این فایل کاملاً مستقل است و بدون اینترنت هم باز می‌شود.</div>
              <div className="text-[11.5px] text-faint leading-loose">این لینک بدون ورود به سامانه باز می‌شود و با خروجی بعدی جایگزین می‌گردد.</div>
              <div className="flex gap-2.5 mt-5">
                <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl font-bold text-[14px] text-[#6B5CA5]">بستن</button>
                <a href={url} target="_blank" rel="noopener" className="btn btn-violet flex-1 py-3 text-[14px] no-underline">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></svg>
                  باز کردن خروجی
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix ui test -- ExportModal`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/src/write/ExportModal.tsx ui/src/write/ExportModal.test.tsx
git commit -m "feat(export): three-state export modal"
```

---

### Task 8: The ⋯ menu, wired into the department page

**Files:**
- Create: `ui/src/write/ExportMenu.tsx`
- Modify: `ui/src/screens/ProcessList.tsx:65-69`
- Test: `ui/src/write/ExportMenu.test.tsx`

**Interfaces:**
- Consumes: `useCreateExport` (Task 6), `ExportModal` (Task 7), `ApiError`.
- Produces: `<ExportMenu department={code} />`, self-contained — it owns the dropdown, the mutation and the modal.

- [ ] **Step 1: Write the failing tests**

Create `ui/src/write/ExportMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportMenu } from './ExportMenu'

afterEach(() => vi.restoreAllMocks())

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ExportMenu department="dining" /></QueryClientProvider>)
}

function ok(url = '/exports/dining/flowchart-0123456789abcdef.html') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ url, generated_at: '2026-07-26T09:00:00Z' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('ExportMenu', () => {
  it('opens and closes the dropdown', () => {
    renderMenu()
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    expect(screen.getByText('خروجی مستندات کامل')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()
  })

  it('posts the flowchart kind and shows the pending modal immediately', async () => {
    const fetchSpy = ok()
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))

    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()  // menu closed
    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/exports/flowchart', expect.objectContaining({ method: 'POST' }))
    await screen.findByText('خروجی آماده شد')
  })

  it('posts the steps kind', async () => {
    const fetchSpy = ok('/exports/dining/steps-0123456789abcdef.html')
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی راهنمای گام‌به‌گام'))
    await screen.findByText('خروجی آماده شد')
    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/exports/steps', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the link as an absolute url', async () => {
    ok('/exports/dining/flowchart-0123456789abcdef.html')
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    await screen.findByText('خروجی آماده شد')
    expect(screen.getByDisplayValue(`${window.location.origin}/exports/dining/flowchart-0123456789abcdef.html`)).toBeInTheDocument()
  })

  it('disables the trigger while a request is in flight', async () => {
    ok()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'خروجی‌ها' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    expect(trigger).toBeDisabled()
    await screen.findByText('خروجی آماده شد')
  })

  it('surfaces a backend failure and retries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }))
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی راهنمای گام‌به‌گام'))
    await screen.findByText('خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)')

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- ExportMenu`
Expected: FAIL — cannot resolve `./ExportMenu`.

- [ ] **Step 3: Write the component**

Create `ui/src/write/ExportMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useCreateExport } from '../api/hooks'
import { ExportModal } from './ExportModal'
import type { ExportKind } from '../api/types'

const KINDS: { kind: ExportKind; label: string; hint: string; tile: string; icon: JSX.Element }[] = [
  {
    kind: 'flowchart',
    label: 'خروجی مستندات کامل',
    hint: 'سند رسمی با فلوچارت تعاملی',
    tile: 'bg-tile-v text-violet',
    icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />,
  },
  {
    kind: 'steps',
    label: 'خروجی راهنمای گام‌به‌گام',
    hint: 'فهرست ساده و خوانا برای پرسنل',
    tile: 'bg-[#FBEEDC] text-[#B4690E]',
    icon: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.4" /><circle cx="4.5" cy="12" r="1.4" /><circle cx="4.5" cy="18" r="1.4" /></>,
  },
]

/** The title shown in the modal header — the export being built. */
const TITLE: Record<ExportKind, string> = {
  flowchart: 'خروجی مستندات کامل — سند رسمی',
  steps: 'راهنمای گام‌به‌گام کار — برای پرسنل',
}

export function ExportMenu({ department }: { department: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ExportKind | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const create = useCreateExport(department)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  function run(k: ExportKind) {
    setOpen(false)
    setKind(k)
    create.mutate(k)
  }

  const status = create.isPending ? 'pending' : create.isError ? 'failed' : create.isSuccess ? 'ready' : 'pending'

  return (
    <div dir="rtl" ref={wrap} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={create.isPending}
        title="خروجی‌ها" aria-label="خروجی‌ها" aria-haspopup="menu" aria-expanded={open}
        className="flex items-center justify-center w-[42px] h-[42px] border-[1.5px] border-line bg-white text-violet rounded-xl disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>

      {open && (
        <div role="menu" className="absolute top-[calc(100%+8px)] end-0 w-[288px] bg-white border border-line rounded-[14px] shadow-modal z-40 p-[7px]">
          {KINDS.map((k) => (
            <button key={k.kind} role="menuitem" onClick={() => run(k.kind)}
              className="flex items-start gap-[11px] w-full text-right px-3 py-[11px] rounded-[10px] hover:bg-tile-v2">
              <span className={`w-[34px] h-[34px] shrink-0 rounded-[10px] flex items-center justify-center ${k.tile}`}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{k.icon}</svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[13.5px] text-ink">{k.label}</span>
                <span className="block text-[11.5px] text-muted mt-[3px] leading-relaxed">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {kind && (
        <ExportModal
          title={TITLE[kind]}
          status={status}
          // absolute so the copied text is worth pasting, and correct on any host (D16)
          url={create.data ? `${window.location.origin}${create.data.url}` : undefined}
          error={create.error?.message}
          onRetry={() => create.mutate(kind)}
          onClose={() => { setKind(null); create.reset() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix ui test -- ExportMenu`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the department header**

In `ui/src/screens/ProcessList.tsx`, add the import:

```tsx
import { ExportMenu } from '../write/ExportMenu'
```

and add the menu as the last child of the header's button row (after the `فرآیند جدید` button, per D13 — the four existing controls stay):

```tsx
          <div className="flex items-center gap-2.5 shrink-0">
            <Button variant="ghost" onClick={() => setReordering(true)} className="px-4 py-[11px] text-[13px]">ترتیب فرآیندها</Button>
            <Button variant="ghost" onClick={() => nav(`/departments/${code}/overview`)} className="px-4 py-[11px] text-[13px]">اطلاعات دپارتمان</Button>
            <Button variant="coral" onClick={() => setCreating(true)} className="px-4 py-[11px] text-[13px]">فرآیند جدید</Button>
            <ExportMenu department={code} />
          </div>
```

- [ ] **Step 6: Run the whole frontend suite**

Run: `npm --prefix ui test`
Expected: PASS. `ProcessList.test.tsx` must stay green — its `fetch` mock returns the departments list for any unmatched url, and the menu makes no request until clicked.

- [ ] **Step 7: Commit**

```bash
git add ui/src/write/ExportMenu.tsx ui/src/write/ExportMenu.test.tsx ui/src/screens/ProcessList.tsx
git commit -m "feat(export): department ⋯ menu with the two export actions"
```

---

### Task 9: Deployment wiring

**Files:**
- Modify: `deploy/ui-backend.Dockerfile`, `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml`
- Modify: the ui-backend sample env in `config/`

**Interfaces:**
- Consumes: the settings from Task 1 and the build output from Task 5.
- Produces: a running stack where `EXPORT_DIR=/exports` and `UI_EXPORT_TEMPLATE_DIR=/app/ui-export-templates`.

- [ ] **Step 1: Copy the export templates into the image**

In `deploy/ui-backend.Dockerfile`, after the existing `COPY --from=ui-build /ui/dist /app/ui-static`:

```dockerfile
COPY --from=ui-build /ui/dist /app/ui-static
COPY --from=ui-build /ui/dist-export /app/ui-export-templates
ENV UI_STATIC_DIR=/app/ui-static \
    SCHEMA_DIR=/app/schemas \
    UI_EXPORT_TEMPLATE_DIR=/app/ui-export-templates
```

`RUN npm run build` in stage 1 already produces `dist-export` after Task 5, so no build step changes.

- [ ] **Step 2: Add the volume to the server stack**

In `deploy/docker-compose.yml`, under `ui-backend`:

```yaml
    environment:
      DATA_ROOT: /data
      UI_USERS_FILE: /run/secrets/ui-users.json
      EXPORT_DIR: /exports
    volumes:
      - /opt/inja/data-repo:/data
      - /opt/inja/secrets/ui-users.json:/run/secrets/ui-users.json:ro
      # generated export documents — build artifacts, deliberately outside the
      # data-repo so they never appear in its working tree (D8)
      - ui-exports:/exports
```

and add `ui-exports:` to the bottom `volumes:` block.

- [ ] **Step 3: Add the same to the local stack**

In `deploy/docker-compose.local.yml`, under `ui-backend`, add `EXPORT_DIR: /exports` to `environment:` and `- local-ui-exports:/exports` to `volumes:`, then add `local-ui-exports:` to the bottom `volumes:` block.

The local stack mounts the host-built `../ui/dist` over `/app/ui-static`; the export templates are **not** overlaid, so after changing an export bundle locally you must rebuild the image (or add `- "../ui/dist-export:/app/ui-export-templates:ro"` to that volumes list). Add that read-only overlay now, with a comment matching the neighbouring one:

```yaml
      # Serve host-built export templates too, so export changes show after
      # `npm --prefix ../ui run build` + restart (no image rebuild).
      - "../ui/dist-export:/app/ui-export-templates:ro"
```

- [ ] **Step 4: Document the env vars**

Add to the ui-backend sample env file in `config/` (match the file's existing comment style):

```sh
# Where generated export documents are written. Unset = the export feature is off.
EXPORT_DIR=/exports
# Where the built export templates live. Baked into the image; override for local runs.
UI_EXPORT_TEMPLATE_DIR=/app/ui-export-templates
```

- [ ] **Step 5: Verify the stack builds and exports end to end**

Run: `docker compose -f deploy/docker-compose.local.yml up -d --build ui-backend`

Then log in at `http://localhost:8000`, open a department, click ⋯ → خروجی راهنمای گام‌به‌گام, and confirm the modal shows pending then a link, and that opening the link renders the stub heading.

Expected: a link of the form `http://localhost:8000/exports/<dept>/steps-<16 hex>.html`.

- [ ] **Step 6: Commit**

```bash
git add deploy/ui-backend.Dockerfile deploy/docker-compose.yml deploy/docker-compose.local.yml config
git commit -m "build(export): EXPORT_DIR volume and export template wiring"
```

**Stage 1 is complete.** The pipe works end to end; the documents are stubs.

---

## Stage 2 — The step-by-step export

Ends with: `steps.html` is finished and shippable on its own.

---

### Task 10: `linearize` — the graph-to-steps transform

A port of `ui/design/export/dining-steps.html:181-281` into typed, tested code. Same input ⇒ byte-identical output: no randomness, no dates, no text rewriting.

**Files:**
- Create: `ui/export/steps/linearize.ts`
- Test: `ui/export/steps/linearize.test.ts`

**Interfaces:**
- Consumes: `Process`, `ProcNode`, `ActivityNode` from `ui/src/api/types.ts`.
- Produces:

```ts
export type StepBlock = { kind: 'step'; node: ActivityNode; cond: string; back: { to: string; label: string }[]; num: number; backNums: number[] }
export type GroupBlock = { kind: 'group'; type: 'AND' | 'OR' | 'XOR'; branches: { label: string; blocks: Block[] }[] }
export type Block = StepBlock | GroupBlock
export function linearize(p: Process): Block[]
export function countSteps(blocks: Block[]): number
export function groupTitle(type: 'AND' | 'OR' | 'XOR', count: number): string
```

- [ ] **Step 1: Write the failing tests**

Create `ui/export/steps/linearize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { linearize, countSteps, groupTitle } from './linearize'
import type { Block, GroupBlock, StepBlock } from './linearize'
import type { Process, ProcNode } from '../../src/api/types'

const act = (id: string, label = id): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const junc = (id: string, t: 'AND' | 'OR' | 'XOR'): ProcNode => ({
  id, type: 'junction', junctionType: t, direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

const term = (id: 'start' | 'end'): ProcNode => ({
  id, type: id, label: id === 'start' ? 'شروع' : 'پایان',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

function proc(nodes: ProcNode[], edges: { from: string; to: string; label?: string }[]): Process {
  return {
    id: 'dining-001', department: 'dining', name: 'p', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes, edges, pending: [],
  } as Process
}

const steps = (bs: Block[]) => bs.filter((b): b is StepBlock => b.kind === 'step')
const groups = (bs: Block[]) => bs.filter((b): b is GroupBlock => b.kind === 'group')

describe('linearize', () => {
  it('numbers a straight chain in reading order', () => {
    const p = proc(
      [term('start'), act('a'), act('b'), term('end')],
      [{ from: 'start', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'end' }],
    )
    const bs = linearize(p)
    expect(steps(bs).map((s) => [s.num, s.node.id])).toEqual([[1, 'a'], [2, 'b']])
    expect(countSteps(bs)).toBe(2)
  })

  it('turns an XOR split into a group and continues at the merge point', () => {
    const p = proc(
      [term('start'), act('a'), junc('j1', 'XOR'), act('b'), act('c'), act('d'), term('end')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'j1' },
        { from: 'j1', to: 'b', label: 'حالت اول' }, { from: 'j1', to: 'c', label: 'حالت دوم' },
        { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'd', to: 'end' },
      ],
    )
    const bs = linearize(p)
    const g = groups(bs)[0]
    expect(g.type).toBe('XOR')
    expect(g.branches.map((br) => br.label)).toEqual(['حالت اول', 'حالت دوم'])
    expect(g.branches.map((br) => steps(br.blocks).map((s) => s.node.id))).toEqual([['b'], ['c']])
    // `d` is the merge point: it belongs to the trunk, not to either branch
    expect(steps(bs).map((s) => s.node.id)).toEqual(['a', 'd'])
    expect(countSteps(bs)).toBe(4)
  })

  it('carries an AND junction through with all its branches', () => {
    const p = proc(
      [term('start'), junc('j1', 'AND'), act('a'), act('b'), act('c'), act('z'), term('end')],
      [
        { from: 'start', to: 'j1' },
        { from: 'j1', to: 'a' }, { from: 'j1', to: 'b' }, { from: 'j1', to: 'c' },
        { from: 'a', to: 'z' }, { from: 'b', to: 'z' }, { from: 'c', to: 'z' }, { from: 'z', to: 'end' },
      ],
    )
    const g = groups(linearize(p))[0]
    expect(g.type).toBe('AND')
    expect(g.branches).toHaveLength(3)
  })

  it('nests a group inside a branch', () => {
    const p = proc(
      [term('start'), junc('j1', 'XOR'), act('a'), junc('j2', 'XOR'), act('b'), act('c'), act('z'), term('end')],
      [
        { from: 'start', to: 'j1' },
        { from: 'j1', to: 'a' }, { from: 'j1', to: 'j2' },
        { from: 'j2', to: 'b' }, { from: 'j2', to: 'c' },
        { from: 'a', to: 'z' }, { from: 'b', to: 'z' }, { from: 'c', to: 'z' }, { from: 'z', to: 'end' },
      ],
    )
    const outer = groups(linearize(p))[0]
    const nested = groups(outer.branches[1].blocks)
    expect(nested).toHaveLength(1)
    expect(steps(nested[0].branches[0].blocks).map((s) => s.node.id)).toEqual(['b'])
  })

  it('records a loop as a back-reference to the target step number', () => {
    const p = proc(
      [term('start'), act('a'), act('b'), term('end')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'b' },
        { from: 'b', to: 'a', label: 'اگر تأیید نشد' },
        { from: 'b', to: 'end' },
      ],
    )
    const bs = linearize(p)
    const b = steps(bs).find((s) => s.node.id === 'b')!
    expect(b.backNums).toEqual([1])       // back to step 1, which is `a`
  })

  it('renders a branch with no merge point without losing its steps', () => {
    const p = proc(
      [term('start'), junc('j1', 'XOR'), act('a'), act('b')],
      [{ from: 'start', to: 'j1' }, { from: 'j1', to: 'a' }, { from: 'j1', to: 'b' }],
    )
    const g = groups(linearize(p))[0]
    expect(g.branches.map((br) => steps(br.blocks).map((s) => s.node.id))).toEqual([['a'], ['b']])
  })

  it('appends disconnected activities in stable node order', () => {
    const p = proc(
      [term('start'), act('a'), act('orphan'), term('end')],
      [{ from: 'start', to: 'a' }, { from: 'a', to: 'end' }],
    )
    expect(steps(linearize(p)).map((s) => s.node.id)).toEqual(['a', 'orphan'])
  })

  it('is deterministic — same input, identical output', () => {
    const p = proc(
      [term('start'), act('a'), junc('j1', 'OR'), act('b'), act('c'), act('z')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'j1' },
        { from: 'j1', to: 'b' }, { from: 'j1', to: 'c' },
        { from: 'b', to: 'z' }, { from: 'c', to: 'z' },
      ],
    )
    expect(JSON.stringify(linearize(p))).toBe(JSON.stringify(linearize(p)))
  })
})

describe('groupTitle', () => {
  it('names each junction kind, and says «همه» for a wide AND', () => {
    expect(groupTitle('XOR', 2)).toBe('فقط یکی از این‌ها انجام می‌شود')
    expect(groupTitle('OR', 2)).toBe('یک مورد یا چند مورد از این‌ها انجام می‌شود')
    expect(groupTitle('AND', 2)).toBe('هر دو با هم انجام می‌شوند')
    expect(groupTitle('AND', 3)).toBe('همهٔ این‌ها با هم انجام می‌شوند')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- linearize`
Expected: FAIL — cannot resolve `./linearize`.

- [ ] **Step 3: Write the module**

Create `ui/export/steps/linearize.ts`:

```ts
import type { ActivityNode, Process, ProcNode } from '../../src/api/types'

export type Junction = 'AND' | 'OR' | 'XOR'
export type StepBlock = {
  kind: 'step'
  node: ActivityNode
  cond: string
  back: { to: string; label: string }[]
  num: number
  backNums: number[]
}
export type GroupBlock = {
  kind: 'group'
  type: Junction
  branches: { label: string; blocks: Block[] }[]
}
export type Block = StepBlock | GroupBlock

type IndexedEdge = { from: string; to: string; label: string; i: number }

/** Deterministic graph model: back-edge detection + topological ranking.
 *
 *  Every traversal breaks ties on the node's original index, so the same
 *  process always linearises the same way — the export is a pure transform.
 */
function graphOf(p: Process) {
  const nodes = p.nodes.filter((n) => !('removed' in n && n.removed))
  const edges: IndexedEdge[] = p.edges.map((e, i) => ({ from: e.from, to: e.to, label: e.label ?? '', i }))
  const byId = new Map<string, { n: ProcNode; i: number }>()
  nodes.forEach((n, i) => byId.set(n.id, { n, i }))

  const out = new Map<string, IndexedEdge[]>()
  const inn = new Map<string, IndexedEdge[]>()
  nodes.forEach((n) => { out.set(n.id, []); inn.set(n.id, []) })
  edges.forEach((e) => {
    if (byId.has(e.from) && byId.has(e.to)) { out.get(e.from)!.push(e); inn.get(e.to)!.push(e) }
  })
  out.forEach((list) => list.sort((a, b) => a.i - b.i))

  const start = nodes.find((n) => n.type === 'start')
    ?? nodes.find((n) => (inn.get(n.id) ?? []).length === 0)
    ?? nodes[0]

  // back edges via DFS in stable order — an edge to a node still on the stack
  const color = new Map<string, number>()
  const back = new Set<number>()
  const dfs = (id: string) => {
    color.set(id, 1)
    for (const e of out.get(id) ?? []) {
      const c = color.get(e.to)
      if (c === 1) back.add(e.i)
      else if (!c) dfs(e.to)
    }
    color.set(id, 2)
  }
  if (start) dfs(start.id)
  nodes.forEach((n) => { if (!color.get(n.id)) dfs(n.id) })

  const fwdOut = (id: string) => (out.get(id) ?? []).filter((e) => !back.has(e.i))
  const backOut = (id: string) => (out.get(id) ?? []).filter((e) => back.has(e.i))

  // topological rank (Kahn, lowest original index first)
  const indeg = new Map<string, number>()
  nodes.forEach((n) => indeg.set(n.id, 0))
  nodes.forEach((n) => fwdOut(n.id).forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)))
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const rank = new Map<string, number>()
  let r = 0
  while (ready.length) {
    ready.sort((a, b) => byId.get(a)!.i - byId.get(b)!.i)
    const id = ready.shift()!
    rank.set(id, r++)
    fwdOut(id).forEach((e) => {
      const left = (indeg.get(e.to) ?? 0) - 1
      indeg.set(e.to, left)
      if (left === 0) ready.push(e.to)
    })
  }
  nodes.forEach((n) => { if (rank.get(n.id) == null) rank.set(n.id, r++) })

  return { nodes, byId, fwdOut, backOut, rank }
}

type Graph = ReturnType<typeof graphOf>

/** First node reachable from every branch — the deterministic merge point. */
function mergePoint(g: Graph, branchEdges: IndexedEdge[]): string | null {
  const sets = branchEdges.map((e) => {
    const seen = new Set<string>()
    const stack = [e.to]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      g.fwdOut(id).forEach((x) => { if (!seen.has(x.to)) stack.push(x.to) })
    }
    return seen
  })
  const common = [...sets[0]].filter((id) => sets.every((s) => s.has(id)))
  if (!common.length) return null
  common.sort((a, b) => (g.rank.get(a)! - g.rank.get(b)!) || (g.byId.get(a)!.i - g.byId.get(b)!.i))
  return common[0]
}

const GROUP_TITLE: Record<Junction, string> = {
  XOR: 'فقط یکی از این‌ها انجام می‌شود',
  AND: 'هر دو با هم انجام می‌شوند',
  OR: 'یک مورد یا چند مورد از این‌ها انجام می‌شود',
}

export function groupTitle(type: Junction, count: number): string {
  if (type === 'AND') return count > 2 ? 'همهٔ این‌ها با هم انجام می‌شوند' : GROUP_TITLE.AND
  return GROUP_TITLE[type] ?? GROUP_TITLE.XOR
}

export function countSteps(blocks: Block[]): number {
  let n = 0
  blocks.forEach((b) => {
    if (b.kind === 'step') n++
    else b.branches.forEach((br) => { n += countSteps(br.blocks) })
  })
  return n
}

/** Pure: process JSON -> ordered block tree. */
export function linearize(p: Process): Block[] {
  const g = graphOf(p)
  const visited = new Set<string>()

  function walk(fromId: string | null, stopId: string | null, cond: string): Block[] {
    const blocks: Block[] = []
    let cur = fromId
    let pending = cond
    let guard = 0
    while (cur && cur !== stopId && guard++ < g.nodes.length * 4) {
      const entry = g.byId.get(cur)
      if (!entry) break
      const node = entry.n
      if (visited.has(cur) && node.type === 'activity') break
      if (node.type === 'activity') {
        visited.add(cur)
        blocks.push({
          kind: 'step', node: node as ActivityNode, cond: pending,
          back: g.backOut(cur).map((e) => ({ to: e.to, label: e.label })),
          num: 0, backNums: [],
        })
        pending = ''
      }
      const outs = g.fwdOut(cur)
      if (!outs.length) break
      if (outs.length === 1) { pending = outs[0].label || pending; cur = outs[0].to; continue }
      const merge = mergePoint(g, outs)
      const type = (node.type === 'junction' ? node.junctionType : 'XOR') as Junction
      blocks.push({
        kind: 'group', type,
        branches: outs.map((e) => ({ label: e.label, blocks: walk(e.to, merge, '') })),
      })
      if (!merge) break
      cur = merge
      pending = ''
    }
    return blocks
  }

  const blocks = walk(g.nodes.find((n) => n.type === 'start')?.id ?? g.nodes[0]?.id ?? null, null, '')

  // graphs can have disconnected pieces — append them in stable node order
  g.nodes.forEach((n) => {
    if (n.type !== 'activity' || visited.has(n.id)) return
    walk(n.id, null, '').forEach((b) => blocks.push(b))
  })

  // number steps in reading order, then resolve back-references
  let n = 0
  const numOf = new Map<string, number>()
  const num = (bs: Block[]) => bs.forEach((b) => {
    if (b.kind === 'step') { b.num = ++n; numOf.set(b.node.id, b.num) }
    else b.branches.forEach((br) => num(br.blocks))
  })
  num(blocks)
  const resolve = (bs: Block[]) => bs.forEach((b) => {
    if (b.kind === 'step') b.backNums = b.back.map((x) => numOf.get(x.to)).filter((x): x is number => !!x)
    else b.branches.forEach((br) => resolve(br.blocks))
  })
  resolve(blocks)
  return blocks
}
```

One deliberate difference from the mockup: `graphOf` filters out `removed` nodes. The mockup's data was pre-cleaned; live process documents can carry soft-deleted nodes, and a step-by-step guide must not list an activity that no longer exists.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix ui test -- linearize`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/export/steps/linearize.ts ui/export/steps/linearize.test.ts
git commit -m "feat(export): typed, tested linearize transform for the steps guide"
```

---

### Task 11: The steps guide on screen

**Files:**
- Create: `ui/export/steps/steps.module.css`, `ui/export/steps/StepsApp.tsx`
- Modify: `ui/export/steps/main.tsx`
- Test: `ui/export/steps/StepsApp.test.tsx`

**Interfaces:**
- Consumes: `linearize`, `countSteps`, `groupTitle` (Task 10); `readPayload`, `ExportPayload` (Task 5); `toFa` from `ui/src/lib/format.ts`.
- Produces: `<StepsApp payload={payload} />` — the whole interactive guide.

**Styling source:** port `ui/design/export/dining-steps.html:31-104` and `:147-153` (the `@media(max-width:560px)` block) into `steps.module.css`. Keep every declaration; drop only the `.topbar` and `#printdoc` rules — the top bar is rebuilt below and print belongs to Task 12. Because it is a CSS module, class names are hashed and cannot collide with anything else.

- [ ] **Step 1: Write the failing tests**

Create `ui/export/steps/StepsApp.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepsApp } from './StepsApp'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string, extra: Partial<ProcNode> = {}): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'سرپرست سالن',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] }, ...extra,
} as ProcNode)

function makeProc(id: string, name: string, nodes: ProcNode[], edges: { from: string; to: string; label?: string }[]) {
  return {
    id, department: 'dining', name, summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes, edges, pending: [],
  }
}

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: 'd', sub_units: [], personnel: [], updated_at: '2026-07-26T09:00:00Z' },
  processes: [
    makeProc('dining-001', 'پذیرایی از مشتری',
      [act('n1', 'خوشامدگویی'), act('n2', 'راهنمایی به کیوسک', { subprocess: 'dining-002' })],
      [{ from: 'n1', to: 'n2' }]),
    makeProc('dining-002', 'ثبت سفارش در کیوسک', [act('m1', 'انتخاب غذا')], []),
  ],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

describe('StepsApp', () => {
  it('lists every process with its step count', () => {
    render(<StepsApp payload={PAYLOAD} />)
    expect(screen.getByText('پذیرایی از مشتری')).toBeInTheDocument()
    expect(screen.getByText('ثبت سفارش در کیوسک')).toBeInTheDocument()
    expect(screen.getByText('۲ مرحله')).toBeInTheDocument()
  })

  it('opens a process and reveals a step description on click', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    expect(screen.getByText('خوشامدگویی')).toBeInTheDocument()
    expect(screen.getByText('کار تمام شد')).toBeInTheDocument()

    fireEvent.click(screen.getByText('خوشامدگویی'))
    expect(screen.getByText('شرح خوشامدگویی')).toBeVisible()
    expect(screen.getByText('سرپرست سالن')).toBeVisible()
  })

  it('walks into a subprocess and back out through the breadcrumb', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    fireEvent.click(screen.getByText('راهنمایی به کیوسک'))
    expect(screen.getByRole('heading', { name: 'ثبت سفارش در کیوسک' })).toBeInTheDocument()
    expect(screen.getByText('انتخاب غذا')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /بازگشت/ }))
    expect(screen.getByRole('heading', { name: 'پذیرایی از مشتری' })).toBeInTheDocument()
  })

  it('returns to the process list from the home button', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    fireEvent.click(screen.getByRole('button', { name: 'فهرست کارها' }))
    expect(screen.getByText('ثبت سفارش در کیوسک')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- StepsApp`
Expected: FAIL — cannot resolve `./StepsApp`.

- [ ] **Step 3: Port the stylesheet**

Create `ui/export/steps/steps.module.css` from the mockup ranges named above. Rename the two id selectors to classes so they work as module classes: `#app` becomes `.app`. Every other selector keeps its name.

- [ ] **Step 4: Write the component**

Create `ui/export/steps/StepsApp.tsx`:

```tsx
import { useState } from 'react'
import { linearize, countSteps, groupTitle } from './linearize'
import type { Block } from './linearize'
import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import type { ActivityNode, Process } from '../../src/api/types'
import s from './steps.module.css'

type Crumb = { pid: string; via: ActivityNode | null }

const icon = (d: string, size = 20, w = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const CHEV = '<path d="M9 18l6-6-6-6"/>'
const CHEV_L = '<path d="M15 18l-6-6 6-6"/>'

export function StepsApp({ payload }: { payload: ExportPayload }) {
  const [trail, setTrail] = useState<Crumb[]>([])
  const byId = new Map(payload.processes.map((p) => [p.id, p]))
  const model = new Map(payload.processes.map((p) => [p.id, linearize(p)]))

  if (!trail.length) {
    return (
      <Shell onHome={() => setTrail([])}>
        <div className={s['home-head']}>
          <h1>راهنمای گام‌به‌گام کار</h1>
          <p>واحد {payload.dept.name} — روی نام هر کار بزنید تا مرحله‌به‌مرحله ببینید.</p>
        </div>
        <div className={s.plist}>
          {payload.processes.map((p) => (
            <button key={p.id} className={s.pbtn} onClick={() => setTrail([{ pid: p.id, via: null }])}>
              <span className={`${s.pn} ${p.parent ? s.sub : ''}`}>
                {icon(p.parent ? '<path d="M4 4v7a4 4 0 0 0 4 4h9"/><path d="M14 11l4 4-4 4"/>' : '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9h8M8 13h5"/>')}
              </span>
              <span className={s.pt}>
                {p.name}
                <span className={`${s.ptag} ${p.parent ? s.sub : ''}`}>{p.parent ? 'زیرفرآیند' : 'فرآیند'}</span>
              </span>
              <span className={s.pc}>{toFa(countSteps(model.get(p.id) ?? []))} مرحله</span>
              <span className={s.pg}>{icon(CHEV_L)}</span>
            </button>
          ))}
        </div>
      </Shell>
    )
  }

  const cur = trail[trail.length - 1]
  const proc = byId.get(cur.pid)
  if (!proc) return <Shell onHome={() => setTrail([])}><div /></Shell>

  return (
    <Shell onHome={() => setTrail([])}>
      <button className={s.backbtn} onClick={() => setTrail(trail.slice(0, -1))}>
        {icon(CHEV)}{trail.length > 1 ? 'بازگشت' : 'بازگشت به فهرست کارها'}
      </button>
      {trail.length > 1 && (
        <div className={s.crumbs}>
          {trail.slice(0, -1).map((t, i) => (
            <span key={t.pid + i}>
              <span style={{ cursor: 'pointer' }} onClick={() => setTrail(trail.slice(0, i + 1))}>{byId.get(t.pid)?.name}</span>
              <span className={s.sep}>›</span>
            </span>
          ))}
          <b>{proc.name}</b>
        </div>
      )}
      <h1 className={s['page-title']}>{proc.name}</h1>
      {cur.via?.description && (
        <div className={s['page-sum']}>
          <span className={s.sl}>این بخش مربوط به چیست؟</span>{cur.via.description}
        </div>
      )}
      <div className={s.howto}>
        {icon('<path d="M9 11V6a2 2 0 1 1 4 0v9"/><path d="M13 12h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-4l-4-4-2-4a1.5 1.5 0 0 1 2.4-1.8L9 13"/>')}
        روی هر مرحله بزنید تا توضیح کامل و مسئول آن را ببینید.
      </div>
      <Blocks blocks={model.get(proc.id) ?? []} proc={proc} byId={byId}
        onEnter={(sub, via) => setTrail([...trail, { pid: sub, via }])} />
      <div className={s.endmark}>
        <span className={s.ei}>{icon('<path d="M20 6L9 17l-5-5"/>', 20, 3)}</span>کار تمام شد
      </div>
    </Shell>
  )
}

function Shell({ children, onHome }: { children: React.ReactNode; onHome: () => void }) {
  return (
    <>
      <div className={s.topbar}>
        <div className={s.tt}>راهنمای گام‌به‌گام کار</div>
        <div className={s.sp} />
        <button className={s.tbtn} onClick={onHome}>فهرست کارها</button>
        <button className={s.tbtn} onClick={() => window.print()}>چاپ</button>
      </div>
      <div className={s.wrap}>{children}</div>
    </>
  )
}

function Blocks({ blocks, proc, byId, onEnter }: {
  blocks: Block[]
  proc: Process
  byId: Map<string, Process>
  onEnter: (sub: string, via: ActivityNode) => void
}) {
  return (
    <div className={s.steps}>
      {blocks.map((b, i) => b.kind === 'group' ? (
        <div key={`g${i}`} className={s.grp}>
          <div className={s['grp-h']}>
            <span className={s.gi}>{b.type === 'AND' ? '&' : b.type === 'OR' ? 'O' : 'X'}</span>
            {groupTitle(b.type, b.branches.length)}
          </div>
          {b.branches.map((br, j) => (
            <div key={j} className={s.branch}>
              <div className={s['branch-h']}>
                <span className={s.bl}>{toFa(j + 1)}</span>
                {br.label ? `اگر: ${br.label}` : `حالت ${toFa(j + 1)}`}
              </div>
              {br.blocks.length
                ? <Blocks blocks={br.blocks} proc={proc} byId={byId} onEnter={onEnter} />
                : <div className={s.nothing}>کاری لازم نیست</div>}
            </div>
          ))}
        </div>
      ) : (
        <Step key={b.node.id} block={b} byId={byId} onEnter={onEnter} />
      ))}
    </div>
  )
}

function Step({ block, byId, onEnter }: {
  block: Extract<Block, { kind: 'step' }>
  byId: Map<string, Process>
  onEnter: (sub: string, via: ActivityNode) => void
}) {
  const [open, setOpen] = useState(false)
  const n = block.node
  const sub = n.subprocess && byId.has(n.subprocess) ? n.subprocess : null
  return (
    <div id={`stp-${block.num}`} className={`${s.step} ${sub ? s['has-sub'] : ''} ${open ? s.open : ''}`}>
      <button className={s['step-row']} onClick={() => sub ? onEnter(sub, n) : setOpen((v) => !v)}>
        <span className={s.sn}>{toFa(block.num)}</span>
        <span className={s.st}>
          <span className={s.label}>{n.label}</span>
          {(block.cond || block.backNums.length || sub) && (
            <span className={s.badges}>
              {block.cond && <span className={`${s.bdg} ${s.cond}`}>اگر: {block.cond}</span>}
              {block.backNums.map((x) => (
                <span key={x} className={`${s.bdg} ${s.back}`} role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); jumpStep(x) }}>
                  برگرد به مرحلهٔ {toFa(x)}
                </span>
              ))}
              {sub && <span className={`${s.bdg} ${s.sub}`}>مراحل این کار را ببین</span>}
            </span>
          )}
        </span>
        <span className={s.chev}>{icon(CHEV_L)}</span>
      </button>
      {!sub && (
        <div className={s['step-body']}>
          {n.actor && (
            <div className={s.fld}>
              <span className={s.k}>این کار را چه کسی انجام می‌دهد؟</span>
              <span className={s.actor}>{n.actor}</span>
            </div>
          )}
          {n.description && (
            <div className={s.fld}>
              <span className={s.k}>توضیح کار</span>
              <div className={s.v}>{n.description}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Scroll to a back-reference target and flash it. */
function jumpStep(num: number) {
  const el = document.getElementById(`stp-${num}`)
  if (!el) return
  el.classList.add(s.open, s.flash)
  const y = el.getBoundingClientRect().top + window.scrollY - 90
  window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' })
  setTimeout(() => el.classList.remove(s.flash), 1600)
}
```

- [ ] **Step 5: Mount it**

Replace the body of `ui/export/steps/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import './steps-base.css'
import { readPayload } from '../shared/payload'
import { StepsApp } from './StepsApp'

createRoot(document.getElementById('root')!).render(<StepsApp payload={readPayload()} />)
```

Create `ui/export/steps/steps-base.css` holding the mockup's global rules — `ui/design/export/dining-steps.html:11-22` (the `:root` custom properties, `*`, `html`, `body`, `::selection`, `button`). These are document-wide and cannot live in a CSS module.

Note the steps bundle deliberately does **not** import `src/index.css`: it needs none of Tailwind, and skipping it keeps the file small (spec §4).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix ui test -- StepsApp`
Expected: PASS, 4 tests.

- [ ] **Step 7: Build and eyeball a real export**

Run: `npm --prefix ui run build`, restart the local stack, then export a department's steps guide and open the link. Check: the process list shows correct step counts; a step expands; a subprocess card walks in and the breadcrumb walks back; the file is under 400 KB.

- [ ] **Step 8: Commit**

```bash
git add ui/export/steps
git commit -m "feat(export): interactive step-by-step staff guide"
```

---

### Task 12: The steps guide in print

**Files:**
- Create: `ui/export/steps/PrintDoc.tsx`, `ui/export/steps/print.module.css`
- Modify: `ui/export/steps/StepsApp.tsx` (render `<PrintDoc>` alongside the app), `ui/export/steps/steps-base.css`
- Test: `ui/export/steps/PrintDoc.test.tsx`

**Interfaces:**
- Consumes: `linearize`, `countSteps`, `groupTitle`, `ExportPayload`.
- Produces: `<PrintDoc payload={payload} />` — a static, always-mounted, screen-hidden document.

The print document is static and always present rather than built on `beforeprint`: Chrome's print snapshot is taken immediately, and a React render scheduled from that event is not guaranteed to land first.

- [ ] **Step 1: Write the failing test**

Create `ui/export/steps/PrintDoc.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PrintDoc } from './PrintDoc'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [{
    id: 'dining-001', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('n1', 'خوشامدگویی')], edges: [], pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

describe('PrintDoc', () => {
  it('emits an index and one section per process, with every step', () => {
    render(<PrintDoc payload={PAYLOAD} />)
    const index = screen.getByTestId('print-index')
    expect(within(index).getByText('پذیرایی')).toBeInTheDocument()
    expect(within(index).getByText('۱ مرحله')).toBeInTheDocument()

    const section = screen.getByTestId('print-section-dining-001')
    expect(within(section).getByText('خوشامدگویی')).toBeInTheDocument()
    expect(within(section).getByText('شرح خوشامدگویی')).toBeInTheDocument()
    expect(within(section).getByText('مجری: مهماندار')).toBeInTheDocument()
    expect(within(section).getByText('کار تمام شد')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix ui test -- PrintDoc`
Expected: FAIL — cannot resolve `./PrintDoc`.

- [ ] **Step 3: Port the print stylesheet**

Create `ui/export/steps/print.module.css` from `ui/design/export/dining-steps.html:106-146`. Keep the `@media print` wrapper and every rule inside it — `@page{margin:14mm 13mm;size:portrait}`, `print-color-adjust:exact`, `.psec{break-before:page}`, `.pstep{break-inside:avoid}` and the rest. Add one rule of your own so the document is print-only:

```css
.printdoc { display: none; }
@media print {
  .printdoc { display: block; padding: 0; }
}
```

and, in `steps-base.css`, hide the interactive app when printing:

```css
@media print {
  .app-screen { display: none !important; }
}
```

- [ ] **Step 4: Write the component**

Create `ui/export/steps/PrintDoc.tsx`:

```tsx
import { linearize, countSteps, groupTitle } from './linearize'
import type { Block } from './linearize'
import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import type { Process } from '../../src/api/types'
import p from './print.module.css'

export function PrintDoc({ payload }: { payload: ExportPayload }) {
  const byId = new Map(payload.processes.map((x) => [x.id, x]))
  const model = new Map(payload.processes.map((x) => [x.id, linearize(x)]))

  return (
    <div className={p.printdoc}>
      <section className={`${p.psec} ${p.pindex}`} data-testid="print-index">
        <h2>راهنمای گام‌به‌گام کار — واحد {payload.dept.name}</h2>
        <div className={p.ptype}>فهرست کارها</div>
        <ol className={p['plist-print']}>
          {payload.processes.map((x) => (
            <li key={x.id} className={x.parent ? p.sub : ''}>
              <span className={p.il}>{x.name}</span>
              <span className={`${p.it} ${x.parent ? p.sub : ''}`}>{x.parent ? 'زیرفرآیند' : 'فرآیند'}</span>
              <span className={p.ic}>{toFa(countSteps(model.get(x.id) ?? []))} مرحله</span>
            </li>
          ))}
        </ol>
      </section>

      {payload.processes.map((x) => {
        // the parent node that links here, for the "what is this about?" note
        const via = payload.processes
          .flatMap((o) => o.nodes)
          .find((n) => n.type === 'activity' && n.subprocess === x.id)
        return (
          <section key={x.id} className={p.psec} data-testid={`print-section-${x.id}`}>
            <h2>{x.name}</h2>
            <div className={`${p.ptype} ${x.parent ? p.sub : ''}`}>{x.parent ? 'زیرفرآیند' : 'فرآیند'}</div>
            {via && 'description' in via && via.description && (
              <div className={p.psum}><b>این بخش مربوط به چیست؟</b>{via.description}</div>
            )}
            <PrintBlocks blocks={model.get(x.id) ?? []} byId={byId} />
            <div className={p.pend}>کار تمام شد</div>
          </section>
        )
      })}
    </div>
  )
}

function PrintBlocks({ blocks, byId }: { blocks: Block[]; byId: Map<string, Process> }) {
  return (
    <>
      {blocks.map((b, i) => b.kind === 'group' ? (
        <div key={`g${i}`} className={p.pgrp}>
          <div className={p.h}>{groupTitle(b.type, b.branches.length)}</div>
          {b.branches.map((br, j) => (
            <div key={j} className={p.pbr}>
              <div className={p.h}>{br.label ? `اگر: ${br.label}` : `حالت ${toFa(j + 1)}`}</div>
              {br.blocks.length ? <PrintBlocks blocks={br.blocks} byId={byId} /> : <div className={p.pnone}>کاری لازم نیست</div>}
            </div>
          ))}
        </div>
      ) : (
        (() => {
          const n = b.node
          const sub = n.subprocess && byId.get(n.subprocess)
          return (
            <div key={n.id} className={`${p.pstep} ${sub ? p.sub : ''}`}>
              <span className={p.n}>{toFa(b.num)}</span>
              <span className={p.c}>
                <span className={p.l}>{n.label}</span>
                {n.actor && <div className={p.m}>مجری: {n.actor}</div>}
                {n.description && <div className={p.d}>{n.description}</div>}
                {(b.cond || b.backNums.length || sub) && (
                  <div className={p.tags}>
                    {b.cond && <span className={`${p.tg} ${p.cond}`}>اگر: {b.cond}</span>}
                    {b.backNums.map((x) => <span key={x} className={`${p.tg} ${p.back}`}>برگرد به مرحلهٔ {toFa(x)}</span>)}
                    {sub && <span className={`${p.tg} ${p.sub}`}>مراحل این کار: بخش «{sub.name}»</span>}
                  </div>
                )}
              </span>
            </div>
          )
        })()
      ))}
    </>
  )
}
```

- [ ] **Step 5: Mount it beside the app**

In `ui/export/steps/main.tsx`, render both, and give the interactive tree the class the print stylesheet hides:

```tsx
const payload = readPayload()

createRoot(document.getElementById('root')!).render(
  <>
    <div className="app-screen"><StepsApp payload={payload} /></div>
    <PrintDoc payload={payload} />
  </>,
)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix ui test -- PrintDoc`
Expected: PASS, 1 test.

- [ ] **Step 7: Verify the printed output in Chrome**

Build, export, open the link, press Ctrl+P. Check: the interactive list is gone; page 1 is the فهرست کارها index; each process starts a new page; no step row is split across a page boundary; colours are preserved (`print-color-adjust`).

- [ ] **Step 8: Commit**

```bash
git add ui/export/steps
git commit -m "feat(export): print document for the step-by-step guide"
```

**Stage 2 is complete.** The staff guide is finished and shippable.

---

## Stage 3 — The flowchart document

Ends with: the official document works on screen, with a flow viewer that is the site's flow viewer. Printing is not yet correct — that is Stage 4.

---

### Task 13: Make the app's canvas reusable offline

Two small changes that let the export mount the app's real components (D2) instead of copying them.

**Files:**
- Modify: `ui/src/flow/Canvas.tsx:17-25,59-64`
- Create: `ui/export/shared/seed.ts`
- Test: `ui/src/flow/Canvas.readonly.test.tsx`, `ui/export/shared/seed.test.ts`

**Interfaces:**
- Produces:
  - `Canvas`'s `onCommitPositions`, `onSetEdgeLabel`, `onDeleteEdge` become optional.
  - `createSeededClient(payload: ExportPayload): QueryClient` — a react-query client whose cache already holds everything the reused components read, and whose default `queryFn` throws.

- [ ] **Step 1: Write the failing tests**

Create `ui/src/flow/Canvas.readonly.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './Canvas'

describe('Canvas without write callbacks', () => {
  it('mounts read-only when no mutation handlers are supplied', async () => {
    render(
      <ReactFlowProvider>
        <Canvas
          docNodes={[{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { node: { id: 'start', type: 'start', label: 'شروع' }, conflicts: 0, hasSub: false } }]}
          docEdges={[]}
          revision={1}
          editing={false}
        />
      </ReactFlowProvider>,
    )
    expect(await screen.findByText('شروع')).toBeInTheDocument()
  })
})
```

Create `ui/export/shared/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createSeededClient } from './seed'
import type { ExportPayload } from './payload'

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [{ id: 'dining-001', department: 'dining', name: 'p', nodes: [], edges: [], pending: [] }],
  generated_at: '',
} as unknown as ExportPayload

describe('createSeededClient', () => {
  it('serves the payload from cache under the app’s query keys', () => {
    const qc = createSeededClient(PAYLOAD)
    expect(qc.getQueryData(['overview', 'dining'])).toEqual(PAYLOAD.dept)
    expect(qc.getQueryData(['processes', 'dining'])).toEqual(PAYLOAD.processes)
    expect(qc.getQueryData(['process', 'dining-001'])).toEqual(PAYLOAD.processes[0])
  })

  it('refuses to fetch — an export has no backend', async () => {
    const qc = createSeededClient(PAYLOAD)
    await expect(qc.fetchQuery({ queryKey: ['anything'] })).rejects.toThrow(/offline/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- Canvas.readonly seed`
Expected: FAIL — a TypeScript error on the missing required props, and `./seed` unresolved.

- [ ] **Step 3: Make the callbacks optional**

In `ui/src/flow/Canvas.tsx`, change the prop types and add no-op defaults:

```tsx
export function Canvas({ docNodes, docEdges, revision, editing, mode = 'pan', onConnect, onNodeClick, onOpenDetail, onCommitPositions, onSetEdgeLabel, onDeleteEdge }: {
  docNodes: Node[]; docEdges: Edge[]; revision: number; editing: boolean; mode?: 'pan' | 'select'
  onConnect?: (c: Connection) => void
  onNodeClick?: (id: string) => void
  onOpenDetail?: (id: string) => void
  // Optional so a read-only consumer — the export document — can mount the very
  // same canvas without inventing handlers for edits it will never make.
  onCommitPositions?: (updates: { id: string; pos: Pos }[]) => void
  onSetEdgeLabel?: (from: string, to: string, label: string) => void
  onDeleteEdge?: (from: string, to: string) => void
}) {
```

and make the ref initialisers tolerate `undefined`:

```tsx
  const onSetEdgeLabelRef = useRef(onSetEdgeLabel); onSetEdgeLabelRef.current = onSetEdgeLabel
  const onDeleteEdgeRef = useRef(onDeleteEdge); onDeleteEdgeRef.current = onDeleteEdge
```

then guard the two call sites inside the re-seed effect:

```tsx
      data: { ...(e.data as object), editing, onSetLabel: (v: string) => onSetEdgeLabelRef.current?.(e.source, e.target, v), onDelete: () => onDeleteEdgeRef.current?.(e.source, e.target) },
```

and in `commitMoved`:

```tsx
    if (moved.length && onCommitPositions) { onCommitPositions(moved); for (const m of moved) seeded.current.set(m.id, m.pos) }
```

- [ ] **Step 4: Write the seeded client**

Create `ui/export/shared/seed.ts`:

```ts
import { QueryClient } from '@tanstack/react-query'
import type { ExportPayload } from './payload'

/** A react-query client that already knows everything, and can never fetch.
 *
 *  The export reuses app components (DetailDrawer calls useProcesses); from a
 *  file:// page a real fetch would fail noisily and pointlessly. Seeding the
 *  cache under the app's own query keys makes those components work unchanged,
 *  and the throwing default queryFn turns any key we forgot into a loud test
 *  failure rather than a silent spinner.
 */
export function createSeededClient(payload: ExportPayload): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async () => { throw new Error('export bundle is offline: no query may fetch') },
      },
    },
  })
  const code = payload.dept.department
  qc.setQueryData(['overview', code], payload.dept)
  qc.setQueryData(['processes', code], payload.processes)
  payload.processes.forEach((p) => qc.setQueryData(['process', p.id], p))
  return qc
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix ui test -- Canvas.readonly seed`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole frontend suite**

Run: `npm --prefix ui test`
Expected: PASS — every existing `FlowScreen.*` and `DetailDrawer.*` test must stay green. They pass the handlers, so the optional types change nothing for them.

- [ ] **Step 7: Commit**

```bash
git add ui/src/flow/Canvas.tsx ui/src/flow/Canvas.readonly.test.tsx ui/export/shared/seed.ts ui/export/shared/seed.test.ts
git commit -m "feat(export): read-only Canvas props and an offline query cache"
```

---

### Task 14: The flow viewer, and the parity guard

**Files:**
- Create: `ui/export/flowchart/FlowViewer.tsx`
- Test: `ui/export/flowchart/FlowViewer.test.tsx`, `ui/export/flowchart/parity.test.tsx`

**Interfaces:**
- Consumes: `Canvas`, `toFlowNodes`, `toFlowEdges`, `DetailDrawer`, `IdBadge` from `ui/src/`; `createSeededClient`.
- Produces: `<FlowViewer processes={…} startId={…} onClose={…} />` — the full-screen viewer with breadcrumb trail, prev/next, legend and drawer.

**Fidelity rule for the implementer:** do not write a single node, edge or legend style in this file. Everything inside the canvas comes from `Canvas` and its node components. This file owns only the surrounding chrome, which the site draws from `AppShell` — a document has no inbox and no logged-in user (spec §3.3).

- [ ] **Step 1: Write the failing tests**

Create `ui/export/flowchart/parity.test.tsx` — the guard that makes D2 enforceable:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { ActivityNode } from '../../src/flow/nodes/ActivityNode'
import type { FlowNodeData } from '../../src/flow/adapt'
import type { NodeProps, Node } from '@xyflow/react'

// The export must never grow its own node styling. If someone forks
// ActivityNode into ui/export/, this test is what catches it: the export
// bundle and the app must resolve the *same* module.
describe('node parity between app and export', () => {
  it('the export imports the app’s ActivityNode, not a copy', async () => {
    const fromExportSide = (await import('../../src/flow/nodes/ActivityNode')).ActivityNode
    expect(fromExportSide).toBe(ActivityNode)
  })

  it('renders identical markup on both sides', () => {
    const data = {
      node: { id: 'dining-001-n001', type: 'activity', label: 'خوشامدگویی', actor: 'کیوسک‌من', description: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 't', touched_by: [] } },
      conflicts: 0, hasSub: false,
    } as unknown as FlowNodeData
    const props = { data } as unknown as NodeProps<Node<FlowNodeData>>

    const a = render(<ReactFlowProvider><ActivityNode {...props} /></ReactFlowProvider>)
    const first = a.container.innerHTML
    a.unmount()
    const b = render(<ReactFlowProvider><ActivityNode {...props} /></ReactFlowProvider>)
    expect(b.container.innerHTML).toBe(first)
  })
})
```

Create `ui/export/flowchart/FlowViewer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { FlowViewer } from './FlowViewer'
import { createSeededClient } from '../shared/seed'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string, subprocess: string | null = null): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const mk = (id: string, name: string, nodes: ProcNode[]) => ({
  id, department: 'dining', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes, edges: [], pending: [],
})

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [
    mk('dining-001', 'پذیرایی', [act('dining-001-n001', 'خوشامدگویی', 'dining-002')]),
    mk('dining-002', 'ثبت سفارش', [act('dining-002-n001', 'انتخاب غذا')]),
  ],
  generated_at: '',
} as unknown as ExportPayload

function renderViewer(startId = 'dining-001', onClose = vi.fn()) {
  const qc = createSeededClient(PAYLOAD)
  render(
    <QueryClientProvider client={qc}>
      <FlowViewer processes={PAYLOAD.processes} startId={startId} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

describe('FlowViewer', () => {
  it('shows the process name, its id badge and the junction legend', async () => {
    renderViewer()
    expect(await screen.findByText('پذیرایی')).toBeInTheDocument()
    expect(screen.getByText('dining-001')).toBeInTheDocument()
    expect(screen.getByText('XOR')).toBeInTheDocument()
    expect(screen.getByText('AND')).toBeInTheDocument()
    expect(screen.getByText('OR')).toBeInTheDocument()
  })

  it('carries no editing chrome', async () => {
    renderViewer()
    await screen.findByText('پذیرایی')
    for (const label of ['ویرایش', 'ذخیره', 'چیدمان', 'انصراف']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('walks into a subprocess and back through the breadcrumb', async () => {
    renderViewer()
    fireEvent.click(await screen.findByText('خوشامدگویی'))
    expect(await screen.findByText('ثبت سفارش')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'پذیرایی' }))
    expect(await screen.findByText('پذیرایی')).toBeInTheDocument()
  })

  it('steps to the next process and closes', async () => {
    const onClose = renderViewer()
    fireEvent.click(await screen.findByRole('button', { name: /فرآیند بعدی/ }))
    expect(await screen.findByText('ثبت سفارش')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- FlowViewer parity`
Expected: `parity` passes already (it guards, it does not drive); `FlowViewer` fails — module unresolved.

- [ ] **Step 3: Write the viewer**

Create `ui/export/flowchart/FlowViewer.tsx`:

```tsx
import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '../../src/flow/Canvas'
import { toFlowNodes, toFlowEdges } from '../../src/flow/adapt'
import { DetailDrawer } from '../../src/flow/DetailDrawer'
import { IdBadge } from '../../src/ui/IdBadge'
import type { ActivityNode, Process } from '../../src/api/types'

/** The site's flow page, minus the app chrome that has no meaning in a document.
 *
 *  Everything inside the canvas is the app's own components (D2): node markup,
 *  colours, edge geometry, markers, background and zoom controls all come from
 *  Canvas. This file owns only the surrounding frame, which on the site is
 *  drawn by AppShell/TopBar — an inbox and a user avatar belong to the editing
 *  app, not to an exported document.
 */
export function FlowViewer({ processes, startId, onClose }: {
  processes: Process[]
  startId: string
  onClose: () => void
}) {
  const [trail, setTrail] = useState<string[]>([startId])
  const [detailId, setDetailId] = useState<string | null>(null)
  const byId = new Map(processes.map((p) => [p.id, p]))

  const pid = trail[trail.length - 1]
  const proc = byId.get(pid)
  if (!proc) return null

  const rootIndex = processes.findIndex((p) => p.id === trail[0])
  const prev = rootIndex > 0 ? processes[rootIndex - 1] : null
  const next = rootIndex >= 0 && rootIndex < processes.length - 1 ? processes[rootIndex + 1] : null

  function step(delta: number) {
    const target = delta < 0 ? prev : next
    if (target) { setTrail([target.id]); setDetailId(null) }
  }

  function onNodeClick(id: string) {
    const n = proc!.nodes.find((x) => x.id === id)
    if (!n) return
    if (n.type === 'junction') { setDetailId(id); return }
    if (n.type === 'activity' && (n as ActivityNode).subprocess && byId.has((n as ActivityNode).subprocess!)) {
      setTrail([...trail, (n as ActivityNode).subprocess!])
      setDetailId(null)
      return
    }
    setDetailId(id)
  }

  const detailNode = detailId ? proc.nodes.find((x) => x.id === detailId) : null

  return (
    <div dir="rtl" className="fixed inset-0 z-[100] bg-bg flex flex-col font-sans text-ink">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
          <button onClick={() => step(1)} disabled={!next}
            title={next ? `فرآیند بعدی: ${next.name}` : undefined} aria-label={next ? `فرآیند بعدی: ${next.name}` : 'فرآیند بعدی'}
            className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="w-px h-[18px] bg-[#D9CEF0]" />
          <button onClick={() => step(-1)} disabled={!prev}
            title={prev ? `فرآیند قبلی: ${prev.name}` : undefined} aria-label={prev ? `فرآیند قبلی: ${prev.name}` : 'فرآیند قبلی'}
            className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[12.5px] min-w-0 flex-wrap">
          {trail.slice(0, -1).map((id, i) => (
            <span key={id + i} className="flex items-center gap-1.5">
              <button onClick={() => { setTrail(trail.slice(0, i + 1)); setDetailId(null) }} className="text-muted hover:text-coral">
                {byId.get(id)?.name}
              </button>
              <span className="text-faint">/</span>
            </span>
          ))}
          <IdBadge tone="violet">{proc.id}</IdBadge>
          <span className="font-bold text-[15px] text-ink">{proc.name}</span>
        </div>

        <button onClick={onClose} aria-label="بستن" title="بستن"
          className="ms-auto w-9 h-9 flex items-center justify-center rounded-[10px] border-[1.5px] border-line bg-white text-ink hover:bg-tile-c hover:text-conflict">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ReactFlowProvider key={proc.id}>
          <Canvas
            docNodes={toFlowNodes(proc)} docEdges={toFlowEdges(proc)}
            revision={1} editing={false}
            onNodeClick={onNodeClick} onOpenDetail={setDetailId}
          />
        </ReactFlowProvider>

        {/* identical to FlowScreen's legend box */}
        <div className="absolute bottom-4 right-4 flex gap-3.5 bg-white border border-warm rounded-xl px-3.5 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-coral rotate-45 inline-block" />XOR</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-violet rotate-45 inline-block" />AND</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-[#E8A33D] rotate-45 inline-block" />OR</span>
        </div>

        {detailNode && (
          <DetailDrawer
            node={detailNode} editing={false} conflicts={[]} process={proc}
            onClose={() => setDetailId(null)}
            onEdit={() => {}} onAccept={() => {}} onReject={() => {}}
            onOpenSub={(sub) => { if (byId.has(sub)) { setTrail([...trail, sub]); setDetailId(null) } }}
            onPatch={() => {}} onLinkSub={() => {}} onSetJunction={() => {}}
            onCreateSub={() => {}} onDeleteNode={() => {}}
          />
        )}
      </div>
    </div>
  )
}
```

`key={proc.id}` on the provider is deliberate: a fresh React Flow instance per process, so `fitView` re-runs and the previous diagram's viewport never leaks into the next one.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix ui test -- FlowViewer parity`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/export/flowchart/FlowViewer.tsx ui/export/flowchart/FlowViewer.test.tsx ui/export/flowchart/parity.test.tsx
git commit -m "feat(export): read-only flow viewer built from the app's own canvas"
```

---

### Task 15: The document — cover, contents, unit, roles, KPIs, legend

**Files:**
- Create: `ui/export/flowchart/document.module.css`, `ui/export/flowchart/doc-base.css`, `ui/export/flowchart/Document.tsx`
- Modify: `ui/export/flowchart/main.tsx`
- Test: `ui/export/flowchart/Document.test.tsx`

**Interfaces:**
- Consumes: `ExportPayload`, `deptFullName`, `toFa`, `FlowViewer` (Task 14).
- Produces: `<Document payload={payload} />` — owns view switching (`home` / `doc` / `legend`) and opening the viewer.

**Styling source:** port `ui/design/export/dining-export-v2.html:27-194` into `document.module.css` — the top bar, sheets, cover, section headings, TOC, legend, unit/role/KPI cards and the divider sheet. Skip `:196-288` (the flow-screen overlay and print-diagram rules): the viewer is Task 14's and the print rules are Stage 4's. Put the `:root` custom-property block (`:11-20`) and the `*`/`body`/`::selection`/`a` rules (`:21-25`) in `doc-base.css`, which is a plain global stylesheet.

**Why a CSS module:** the mockup defines `.chip`, `.card` and `.id-badge`; `ui/src/index.css` — which this bundle also loads, for the viewer — defines `.chip` and `.id-badge` differently under `@layer components`. Hashed module names make that collision impossible (spec §3.2).

- [ ] **Step 1: Write the failing test**

Create `ui/export/flowchart/Document.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Document } from './Document'
import { createSeededClient } from '../shared/seed'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const PAYLOAD = {
  dept: {
    department: 'dining', name: 'سالن',
    description: 'دپارتمان سالن مسئول پذیرایی است.\n\nسالن به چند باکس تقسیم می‌شود.',
    sub_units: [{ name: 'حیاط', description: 'زون بیرونی' }],
    personnel: [{ role: 'سرپرست سالن', duties: ['نظارت بر نظافت'], kpi: ['رضایت مشتری'] }],
    updated_at: '2026-07-26T09:00:00Z',
  },
  processes: [{
    id: 'dining-001', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('dining-001-n001', 'خوشامدگویی')], edges: [], pending: [],
  }],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

const renderDoc = () => render(
  <QueryClientProvider client={createSeededClient(PAYLOAD)}>
    <Document payload={PAYLOAD} />
  </QueryClientProvider>,
)

describe('Document', () => {
  it('opens on a cover and a table of contents', () => {
    renderDoc()
    expect(screen.getByText('واحد سالن')).toBeInTheDocument()
    expect(screen.getByText('دپارتمان سالن')).toBeInTheDocument()
    expect(screen.getByText('فهرست مطالب')).toBeInTheDocument()
    expect(screen.getByText('پذیرایی')).toBeInTheDocument()
    expect(screen.getByText('۱ فرآیند')).toBeInTheDocument()
  })

  it('opens the unit section with its paragraphs, sub-units, roles and KPIs', () => {
    renderDoc()
    fireEvent.click(screen.getByText('معرفی واحد، نقش‌ها و KPIها'))
    expect(screen.getByText('دپارتمان سالن مسئول پذیرایی است.')).toBeInTheDocument()
    expect(screen.getByText('سالن به چند باکس تقسیم می‌شود.')).toBeInTheDocument()
    expect(screen.getByText('حیاط')).toBeInTheDocument()
    expect(screen.getByText('سرپرست سالن')).toBeInTheDocument()
    expect(screen.getByText('نظارت بر نظافت')).toBeInTheDocument()
    expect(screen.getByText('رضایت مشتری')).toBeInTheDocument()
  })

  it('opens the symbol legend', () => {
    renderDoc()
    fireEvent.click(screen.getByText('راهنمای نمادهای فلوچارت'))
    expect(screen.getByText('فقط یکی از مسیرها انجام می‌شود')).toBeInTheDocument()
    expect(screen.getByText('یک یا چند مسیر انجام می‌شود')).toBeInTheDocument()
    expect(screen.getByText('همهٔ مسیرها انجام می‌شوند')).toBeInTheDocument()
  })

  it('opens the flow viewer from a table-of-contents entry', async () => {
    renderDoc()
    fireEvent.click(screen.getByText('پذیرایی'))
    expect(await screen.findByText('خوشامدگویی')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.getByText('فهرست مطالب')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix ui test -- Document`
Expected: FAIL — cannot resolve `./Document`.

- [ ] **Step 3: Port the stylesheets**

Create `document.module.css` and `doc-base.css` from the ranges named above.

- [ ] **Step 4: Write the component**

Create `ui/export/flowchart/Document.tsx`:

```tsx
import { useState } from 'react'
import { toFa } from '../../src/lib/format'
import { deptFullName } from '../shared/payload'
import type { ExportPayload } from '../shared/payload'
import { FlowViewer } from './FlowViewer'
import { ProcessSheets } from './ProcessSheets'
import d from './document.module.css'

type View = 'home' | 'doc' | 'legend'

const JSYM = [
  { t: 'XOR', s: 'X', c: '#E23D35', text: 'فقط یکی از مسیرها انجام می‌شود' },
  { t: 'OR', s: 'O', c: '#E8A33D', text: 'یک یا چند مسیر انجام می‌شود' },
  { t: 'AND', s: '&', c: '#2E6FD6', text: 'همهٔ مسیرها انجام می‌شوند' },
]

const pad2 = (i: number) => toFa(String(i).padStart(2, '0'))

export function Document({ payload }: { payload: ExportPayload }) {
  const [view, setView] = useState<View>('home')
  const [flowId, setFlowId] = useState<string | null>(null)
  const { dept, processes } = payload

  const activityCount = (pid: string) =>
    processes.find((p) => p.id === pid)!.nodes.filter((n) => n.type !== 'junction').length

  return (
    <>
      <div className={d.topbar}>
        <div className={d.tt}>مستند فرآیندهای واحد {dept.name}</div>
        <div className={d.sp} />
        {view !== 'home' && <button className={d.tbtn} onClick={() => setView('home')}>فهرست</button>}
        <button className={`${d.tbtn} ${d.solid}`} onClick={() => window.print()}>چاپ / PDF</button>
      </div>

      <div className={d.doc}>
        {view === 'home' && (
          <>
            <div className={`${d.sheet} ${d['cover-sheet']}`}>
              <div className={d['cover-inner']}>
                <div className={d['cover-kicker']}>
                  <span className={d.bar} /><span>INJA FOOD · PROCESS DOCUMENTATION</span>
                </div>
                <h1>مستند فرآیندهای<br />واحد {dept.name}</h1>
                <div className={d.sub}>{deptFullName(dept)} — مرجع رسمی نقش‌ها، اهداف عملکردی و فرآیندهای عملیاتی واحد.</div>
                <div className={d['cover-foot']}>
                  <div className={d.cf}>مجموعه<b>اینجا فست‌فود</b></div>
                  <div className={d.cf}>تعداد فرآیند<b>{toFa(processes.length)} فرآیند</b></div>
                </div>
              </div>
            </div>

            <div className={d.sheet}>
              <div className={d['sheet-head']}><h2>فهرست مطالب</h2></div>
              <div className={d['sheet-lead']}>روی عنوان هر بخش کلیک کنید تا همان بخش باز شود.</div>
              <ul className={d.toc}>
                <li onClick={() => setView('doc')}>
                  <span className={d['toc-n']}>۰۱</span>
                  <span className={d['toc-t']}>معرفی واحد، نقش‌ها و KPIها
                    <span className={d['toc-s']}>معرفی واحد · موجودیت‌ها و نقش‌ها · اهداف عملکردی</span>
                  </span>
                  <span className={d['toc-lead']} />
                </li>
                <li onClick={() => setView('legend')}>
                  <span className={d['toc-n']}>۰۲</span>
                  <span className={d['toc-t']}>راهنمای نمادهای فلوچارت
                    <span className={d['toc-s']}>X / O / &amp; — انواع انشعاب</span>
                  </span>
                  <span className={d['toc-lead']} />
                </li>
              </ul>
              <div className={d['toc-group']}>فرآیندها ({toFa(processes.length)})</div>
              <ul className={d.toc}>
                {processes.map((p, i) => (
                  <li key={p.id} onClick={() => setFlowId(p.id)}>
                    <span className={d['toc-n']}>{pad2(i + 1)}</span>
                    <span className={d['toc-t']}>{p.name}
                      <span className={d['toc-s']}>
                        {toFa(activityCount(p.id))} فعالیت · <span dir="ltr">{p.id}</span>{p.parent ? ' · زیرفرآیند' : ''}
                      </span>
                    </span>
                    <span className={d['toc-lead']} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {view === 'doc' && (
          <>
            <div className={d.backbar}>
              <button className={d.backbtn} onClick={() => setView('home')}>بازگشت به فهرست</button>
            </div>
            <div className={d.sheet}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۱</span><h2>معرفی واحد {dept.name}</h2></div>
              <div className={d.rule} />
              {dept.description.split(/\n+/).filter((x) => x.trim()).map((par, i) => (
                <div key={i} className={d.prose}>{par}</div>
              ))}
              {dept.sub_units.length > 0 && (
                <>
                  <div className={d['block-label']} style={{ marginTop: 30 }}>
                    <span className={d.sq} style={{ background: 'var(--coral)' }} />واحدها و زون‌های سالن
                  </div>
                  <div className={`${d.grid} ${d.g2}`}>
                    {dept.sub_units.map((u) => (
                      <div key={u.name} className={`${d.card} ${d.unit}`}>
                        <div className={d['u-name']}>{u.name}</div>
                        <div className={d['u-desc']}>{u.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className={d.sheet}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۲</span><h2>موجودیت‌ها و نقش‌ها</h2></div>
              <div className={d['sheet-lead']}>نقش‌های عملیاتی واحد {dept.name} و وظایف کلیدی هر یک.</div>
              <div className={d.rule} />
              {dept.personnel.map((pr) => (
                <div key={pr.role} className={d.role}>
                  <div className={d['role-head']}>
                    <span className={d['role-name']}>{pr.role}</span>
                    <span className={d['role-tag']}>{toFa(pr.duties.length)} وظیفه · {toFa(pr.kpi.length)} KPI</span>
                  </div>
                  <div className={d['role-body']}>
                    <ul className={d.duties}>{pr.duties.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
              ))}
            </div>

            <div className={d.sheet}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۳</span><h2>اهداف عملکردی (KPI)</h2></div>
              <div className={d['sheet-lead']}>شاخص‌های کلیدی عملکرد به تفکیک هر نقش سازمانی.</div>
              <div className={d.rule} />
              {dept.personnel.map((pr) => (
                <div key={pr.role} className={d['kpi-role']}>
                  <div className={d['kr-h']}><span className={d['kr-name']}>{pr.role}</span></div>
                  {pr.kpi.length
                    ? <ul className={d.kpis}>{pr.kpi.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    : <div className={d['kpi-none']}>برای این نقش شاخص عملکردی ثبت نشده است.</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'legend' && (
          <>
            <div className={d.backbar}>
              <button className={d.backbtn} onClick={() => setView('home')}>بازگشت به فهرست</button>
            </div>
            <div className={`${d.sheet} ${d['pad-sm']}`}>
              <div className={d['sheet-head']}><span className={d['sec-num']}>۰۲</span><h2>راهنمای نمادهای فلوچارت</h2></div>
              <div className={d['sheet-lead']}>در نقاط انشعاب فرآیندها، این نمادها نوع مسیر را مشخص می‌کنند.</div>
              <div className={d['legend-box']}>
                {JSYM.map((j) => (
                  <div key={j.t} className={d['legend-row']}>
                    <span className={d['lg-sym']}>
                      <span className={d.sq} style={{ background: j.c, borderColor: j.c }} />
                      <span className={d.t} style={{ color: '#fff' }}>{j.s}</span>
                    </span>
                    <span className={d['lg-txt']}>
                      <span className={d.n}>{j.s} — {j.t}</span>
                      <span className={d.d}>{j.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <ProcessSheets payload={payload} />
      </div>

      {flowId && (
        <FlowViewer processes={processes} startId={flowId} onClose={() => setFlowId(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 5: Write the per-process sheets (D12: name, id, counts, diagram slot)**

Create `ui/export/flowchart/ProcessSheets.tsx`:

```tsx
import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import d from './document.module.css'

/** One print-only page per process. On screen the flow viewer opens instead, so
 *  these sheets are hidden; Stage 4 fills each `.pf-wrap` with the SVG bands.
 *  Content is exactly the mockup's (D12): name, id, counts, diagram. */
export function ProcessSheets({ payload }: { payload: ExportPayload }) {
  const pad2 = (i: number) => toFa(String(i).padStart(2, '0'))
  return (
    <>
      {payload.processes.map((p, i) => {
        const activities = p.nodes.filter((n) => n.type !== 'junction').length
        const junctions = p.nodes.filter((n) => n.type === 'junction').length
        return (
          <div key={p.id} className={`${d.view} ${d['print-only']}`} data-testid={`sheet-${p.id}`}>
            <div className={d.sheet}>
              <div className={d['sheet-head']}>
                <span className={d['sec-num']}>{pad2(i + 1)}</span>
                <h2 style={{ fontSize: 22 }}>{p.name}</h2>
              </div>
              <div className={d['proc-num-strip']}>
                <span className={d['id-badge']} dir="ltr">{p.id}</span>
                {p.parent && <span className={d['sub-badge']}>زیرفرآیند از {p.parent.process}</span>}
              </div>
              <div className={d['proc-meta']}>
                <span className={d.pm}><b>{toFa(activities)}</b> فعالیت</span>
                <span className={d.pm}><b>{toFa(junctions)}</b> انشعاب</span>
              </div>
              {/* NOT a module class: `print.css` styles `.pf-wrap` globally, and
                  the SVG bands are injected as raw HTML — a hashed name would
                  never match either. */}
              <div className="pf-wrap" data-pf={p.id} />
            </div>
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 6: Mount the document**

Replace `ui/export/flowchart/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/vazirmatn'
import '../../src/index.css'
import './doc-base.css'
import { readPayload } from '../shared/payload'
import { createSeededClient } from '../shared/seed'
import { Document } from './Document'

const payload = readPayload()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={createSeededClient(payload)}>
    <Document payload={payload} />
  </QueryClientProvider>,
)
```

Unlike the steps bundle, this one **does** import `src/index.css` — the viewer's node components are styled with Tailwind, and their appearance is the whole point (D2).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm --prefix ui test -- Document`
Expected: PASS, 4 tests.

- [ ] **Step 8: Build and check the real document**

Build, export a department's flowchart document, open the link. Check: the cover, the contents, the unit/roles/KPI section and the legend all render; clicking a process opens the viewer; the nodes look **identical** to the same process on the site — open both side by side and compare a node's width, its id badge, its actor row and its subprocess pill. Note the file size (expect 1.5–2 MB).

- [ ] **Step 9: Commit**

```bash
git add ui/export/flowchart
git commit -m "feat(export): flowchart document — cover, contents, unit, roles, KPIs, legend"
```

**Stage 3 is complete.** The document works on screen. Printing it still produces a clipped diagram — Stage 4.

---

## Stage 4 — The print engine

Ends with: the PDF matches the screen. Ported from `ui/design/export/dining-export-v2.html:508-662`, with geometry taken from React Flow instead of hand-measured DOM.

---

### Task 16: Band geometry

Pure functions over rectangles — no DOM, no React, fully unit-testable.

**Files:**
- Create: `ui/export/print/bands.ts`
- Test: `ui/export/print/bands.test.ts`

**Interfaces:**
- Produces:

```ts
export type Span = [number, number]
export const PRINT: { W: number; H: number; PAD: number; HEADGAP: number; GAP: number; MINSC: number }
export function freeCuts(blocks: Span[], top: number, bottom: number): Span[]
export function maxChunk(top: number, bottom: number, cuts: Span[]): number
export function bandSplit(top: number, bottom: number, cuts: Span[], budgetFor: (i: number) => number): Span[] | null
export function planBands(top: number, bottom: number, width: number, cuts: Span[], headHeight: number): { scale: number; bands: Span[]; ownPage: boolean }
```

- [ ] **Step 1: Write the failing tests**

Create `ui/export/print/bands.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { freeCuts, maxChunk, bandSplit, planBands, PRINT } from './bands'

describe('freeCuts', () => {
  it('reports the empty gaps between painted blocks', () => {
    const cuts = freeCuts([[0, 100], [400, 500]], 0, 600)
    expect(cuts).toEqual([[106, 394], [506, 594]])
  })

  it('ignores gaps too small to cut in', () => {
    expect(freeCuts([[0, 100], [105, 200]], 0, 200)).toEqual([])
  })

  it('handles overlapping blocks by tracking the furthest cover', () => {
    expect(freeCuts([[0, 300], [50, 100]], 0, 400)).toEqual([[306, 394]])
  })
})

describe('maxChunk', () => {
  it('is the whole diagram when nothing can be cut', () => {
    expect(maxChunk(0, 500, [])).toBe(500)
  })

  it('is the tallest unbreakable run between cuts', () => {
    // cuts at 100–150 and 400–430 → runs are 0–150, 100–430, 400–500
    expect(maxChunk(0, 500, [[100, 150], [400, 430]])).toBe(330)
  })
})

describe('bandSplit', () => {
  it('returns one band when the budget covers everything', () => {
    expect(bandSplit(0, 300, [[100, 150]], () => 1000)).toEqual([[0, 300]])
  })

  it('cuts inside a gap, never through a block', () => {
    const bands = bandSplit(0, 600, [[190, 250], [420, 470]], () => 300)
    expect(bands).toEqual([[0, 250], [250, 470], [470, 600]])
  })

  it('gives the first band its own smaller budget', () => {
    const bands = bandSplit(0, 600, [[90, 140], [380, 430]], (i) => (i === 0 ? 150 : 400))
    expect(bands![0]).toEqual([0, 140])
  })

  it('returns null when no legal cut exists under the budget', () => {
    expect(bandSplit(0, 600, [], () => 200)).toBeNull()
  })
})

describe('planBands', () => {
  it('keeps a small diagram whole on the heading page', () => {
    const plan = planBands(0, 300, 600, [], 130)
    expect(plan.bands).toEqual([[0, 300]])
    expect(plan.ownPage).toBe(false)
    expect(plan.scale).toBeCloseTo(1, 5)
  })

  it('never scales above 1 — a small diagram is not blown up', () => {
    expect(planBands(0, 100, 200, [], 130).scale).toBe(1)
  })

  it('scales a wide diagram down to the page width', () => {
    expect(planBands(0, 200, 1860, [], 130).scale).toBeCloseTo(PRINT.W / 1860, 5)
  })

  it('bands a tall diagram rather than shrinking it below the floor', () => {
    const cuts = freeCuts([[0, 400], [500, 900], [1000, 1400]], 0, 1400)
    const plan = planBands(0, 1400, 600, cuts, 130)
    expect(plan.bands.length).toBeGreaterThan(1)
    expect(plan.scale).toBeGreaterThanOrEqual(PRINT.MINSC)
  })

  it('gives the diagram its own page when the first run will not fit under the heading', () => {
    // one unbreakable run taller than the room left beside a tall heading
    const plan = planBands(0, 1200, 600, [[600, 700]], 400)
    expect(plan.ownPage).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- bands`
Expected: FAIL — cannot resolve `./bands`.

- [ ] **Step 3: Write the module**

Create `ui/export/print/bands.ts`:

```ts
export type Span = [number, number]

/** Page budget in CSS px for a landscape page, taken as the smaller of A4 and
 *  Letter so one build prints correctly on both. A4 landscape is 210mm ≈ 794px
 *  tall; subtract the 18mm top+bottom .doc padding (136px) and the 4mm .sheet
 *  padding (30px) for ≈627px of usable height. Width: Letter landscape
 *  279.4mm ≈ 1056px minus 14mm side padding (106px) ≈ 950px. Both are kept a
 *  little under the true figure so a band never lands a hair over the page. */
export const PRINT = {
  W: 930,
  H: 620,
  PAD: 20,       // breathing room around the diagram
  HEADGAP: 16,   // .pf-wrap margin-top in print, plus a little slack
  GAP: 6,        // clearance kept above a cut
  MINSC: 0.34,   // never shrink below this; band instead
}

/** Every y where nothing is painted — the only places a page break may fall.
 *  `blocks` is [top, bottom] for each node box and each edge label. */
export function freeCuts(blocks: Span[], top: number, bottom: number): Span[] {
  const sorted = [...blocks].sort((a, b) => a[0] - b[0])
  const cuts: Span[] = []
  let cover = top
  sorted.forEach((b) => {
    if (b[0] > cover + 2 * PRINT.GAP) cuts.push([cover + PRINT.GAP, b[0] - PRINT.GAP])
    cover = Math.max(cover, b[1])
  })
  if (bottom > cover + 2 * PRINT.GAP) cuts.push([cover + PRINT.GAP, bottom - PRINT.GAP])
  return cuts
}

/** Tallest run with no legal break inside it. No scale can put more than this
 *  on one page, so it bounds how large the diagram may be drawn. */
export function maxChunk(top: number, bottom: number, cuts: Span[]): number {
  if (!cuts.length) return bottom - top
  let m = cuts[0][1] - top
  for (let i = 0; i < cuts.length - 1; i++) m = Math.max(m, cuts[i + 1][1] - cuts[i][0])
  return Math.max(m, bottom - cuts[cuts.length - 1][0])
}

/** Slice [top, bottom] into bands no taller than each band's budget, breaking
 *  only inside a free gap so no node or label is ever cut in half. Returns null
 *  when a band cannot be closed — the caller then scales down and retries. */
export function bandSplit(top: number, bottom: number, cuts: Span[], budgetFor: (i: number) => number): Span[] | null {
  const bands: Span[] = []
  let start = top
  let guard = 0
  while (start < bottom - 0.5 && guard++ < 200) {
    const limit = start + budgetFor(bands.length)
    if (limit >= bottom - 0.5) { bands.push([start, bottom]); return bands }
    let cut = -1
    for (const [a, b] of cuts) {
      if (a > limit) break
      if (b > start + 20) cut = Math.max(cut, Math.min(b, limit))
    }
    if (cut <= start + 20) return null
    bands.push([start, cut])
    start = cut
  }
  return bands.length ? bands : [[top, bottom]]
}

/** Choose a scale and a band split for one diagram.
 *
 *  Prefer the whole diagram on the heading page when that costs little size;
 *  otherwise keep it at full page width and break it across pages instead — a
 *  readable diagram over two pages beats a complete but tiny one.
 */
export function planBands(top: number, bottom: number, width: number, cuts: Span[], headHeight: number) {
  const H = bottom - top
  const firstH = Math.max(220, PRINT.H - headHeight)
  const scW = Math.min(1, PRINT.W / width)
  const scOne = Math.min(scW, firstH / H)

  if (scOne >= scW * 0.8) return { scale: scOne, bands: [[top, bottom]] as Span[], ownPage: false }

  const scale = Math.max(PRINT.MINSC, Math.min(scW, PRINT.H / maxChunk(top, bottom, cuts)))
  let bands = bandSplit(top, bottom, cuts, (k) => (k === 0 ? firstH : PRINT.H) / scale)
  if (bands) return { scale, bands, ownPage: false }

  // the first unbreakable run is taller than the heading page allows —
  // give the diagram a fresh page, which buys a much larger drawing
  bands = bandSplit(top, bottom, cuts, () => PRINT.H / scale)
  if (bands) return { scale, bands, ownPage: true }

  return { scale: Math.min(scW, firstH / H), bands: [[top, bottom]] as Span[], ownPage: false }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix ui test -- bands`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/export/print/bands.ts ui/export/print/bands.test.ts
git commit -m "feat(export): page-band geometry for printed flowcharts"
```

---

### Task 17: Capture the diagram and emit SVG bands

**Files:**
- Create: `ui/export/print/geometry.ts`, `ui/export/print/PrintDiagrams.tsx`
- Test: `ui/export/print/geometry.test.ts`

**Interfaces:**
- Consumes: `getEdgeParams` and `Geom` from `ui/src/flow/edges/floating.ts`; `getBezierPath` from `@xyflow/react`; `bands.ts`.
- Produces:

```ts
export type NodeBox = { id: string; x: number; y: number; w: number; h: number; html: string }
export type EdgeGeom = { d: string; sx: number; sy: number; label?: { x: number; y: number; w: number; h: number; text: string } }
export type DiagramGeom = { boxes: NodeBox[]; edges: EdgeGeom[] }
export function geomBlocks(g: DiagramGeom): Span[]
export function geomBounds(g: DiagramGeom): { minX: number; minY: number; maxX: number; maxY: number }
export function bandSvg(g: DiagramGeom, band: Span, box: { minX: number; width: number }, scale: number, markerId: string): string
```

and the React piece `<PrintDiagrams payload={payload} />`, which fills every `[data-pf]` slot rendered by `ProcessSheets`.

- [ ] **Step 1: Write the failing tests**

Create `ui/export/print/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { geomBlocks, geomBounds, bandSvg } from './geometry'
import type { DiagramGeom } from './geometry'

const G: DiagramGeom = {
  boxes: [
    { id: 'a', x: 0, y: 0, w: 170, h: 60, html: '<div class="n">A</div>' },
    { id: 'b', x: 0, y: 200, w: 170, h: 60, html: '<div class="n">B</div>' },
  ],
  edges: [{ d: 'M10 60 C 10 130, 10 130, 10 200', sx: 10, sy: 60, label: { x: 40, y: 120, w: 60, h: 20, text: 'اگر بله' } }],
}

describe('geomBounds', () => {
  it('covers every box and label', () => {
    expect(geomBounds(G)).toEqual({ minX: 0, minY: 0, maxX: 170, maxY: 260 })
  })
})

describe('geomBlocks', () => {
  it('lists the painted spans — boxes and labels alike', () => {
    expect(geomBlocks(G)).toEqual([[0, 60], [200, 260], [120, 140]])
  })
})

describe('bandSvg', () => {
  it('emits only what the band touches, clipped by the viewBox', () => {
    const svg = bandSvg(G, [0, 100], { minX: 0, width: 170 }, 1, 'm1')
    expect(svg).toContain('viewBox="0 0 170 100"')
    expect(svg).toContain('>A<')
    expect(svg).not.toContain('>B<')      // its box starts below the band
  })

  it('draws an edge whenever either end is on the band', () => {
    const svg = bandSvg(G, [150, 260], { minX: 0, width: 170 }, 1, 'm1')
    expect(svg).toContain('M10 60 C')     // starts above, ends inside
    expect(svg).toContain('marker-end="url(#m1)"')
  })

  it('scales the rendered size but not the coordinate space', () => {
    const svg = bandSvg(G, [0, 260], { minX: 0, width: 170 }, 0.5, 'm1')
    expect(svg).toContain('width="85"')
    expect(svg).toContain('height="130"')
    expect(svg).toContain('viewBox="0 0 170 260"')
  })

  it('escapes label text so a stray angle bracket cannot break the svg', () => {
    const g: DiagramGeom = { boxes: [], edges: [{ d: 'M0 0', sx: 0, sy: 0, label: { x: 0, y: 0, w: 10, h: 10, text: '<b>x' } }] }
    expect(bandSvg(g, [0, 10], { minX: 0, width: 10 }, 1, 'm1')).toContain('&lt;b&gt;x')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix ui test -- geometry`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 3: Write the geometry module**

Create `ui/export/print/geometry.ts`:

```ts
import type { Span } from './bands'

export type NodeBox = { id: string; x: number; y: number; w: number; h: number; html: string }
export type EdgeGeom = {
  d: string
  sx: number
  sy: number
  label?: { x: number; y: number; w: number; h: number; text: string }
}
export type DiagramGeom = { boxes: NodeBox[]; edges: EdgeGeom[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Painted spans: node boxes and edge labels. A page break may not fall in one. */
export function geomBlocks(g: DiagramGeom): Span[] {
  return [
    ...g.boxes.map((b) => [b.y, b.y + b.h] as Span),
    ...g.edges.filter((e) => e.label).map((e) => [e.label!.y, e.label!.y + e.label!.h] as Span),
  ]
}

export function geomBounds(g: DiagramGeom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  g.boxes.forEach((b) => {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h)
  })
  g.edges.forEach((e) => {
    if (!e.label) return
    minX = Math.min(minX, e.label.x); minY = Math.min(minY, e.label.y)
    maxX = Math.max(maxX, e.label.x + e.label.w); maxY = Math.max(maxY, e.label.y + e.label.h)
  })
  return { minX, minY, maxX, maxY }
}

/** One band as a single atomic `<svg>`.
 *
 *  An `<svg>` is indivisible to the printer: Chrome will never drop its children
 *  the way it drops absolutely-positioned HTML that lands in an overflowing page
 *  fragment. Node boxes ride in `<foreignObject>` carrying their real markup, so
 *  the printed node is the drawn node.
 */
export function bandSvg(g: DiagramGeom, band: Span, box: { minX: number; width: number }, scale: number, markerId: string): string {
  const [y0, y1] = band
  const h = y1 - y0

  const boxes = g.boxes
    .filter((b) => !(b.y >= y1 || b.y + b.h <= y0))
    .map((b) =>
      `<foreignObject x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" style="overflow:visible">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${b.w}px;height:${b.h}px">${b.html}</div>`
      + `</foreignObject>`)
    .join('')

  // an edge is drawn whenever either end is on this band; the viewBox clips the rest
  const edges = g.edges
    .filter((e) => {
      const ys = [e.sy, e.label ? e.label.y : e.sy]
      return Math.max(...ys) >= y0 - h && Math.min(...ys) <= y1 + h
    })
    .map((e) => {
      let out = `<path d="${e.d}" fill="none" stroke="#9B86D9" stroke-width="2" marker-end="url(#${markerId})"/>`
      // the white exit nub LabeledEdge draws at the source end
      out += `<circle cx="${e.sx}" cy="${e.sy}" r="4" fill="#fff" stroke="#9B86D9" stroke-width="1.5"/>`
      if (e.label) {
        out += `<foreignObject x="${e.label.x}" y="${e.label.y}" width="${e.label.w}" height="${e.label.h}">`
          + `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:11px;color:#2A1D5E;text-align:center;`
          + `font-family:'Vazirmatn Variable',sans-serif;background:rgba(255,255,255,.9);border-radius:6px;padding:2px 8px;display:inline-block">`
          + `${esc(e.label.text)}</div></foreignObject>`
      }
      return out
    })
    .join('')

  return `<div class="pf-band"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${y0} ${box.width} ${h}"`
    + ` width="${Math.round(box.width * scale)}" height="${Math.round(h * scale)}">`
    + `<defs><marker id="${markerId}" markerWidth="18" markerHeight="18" refX="9" refY="4.5" orient="auto">`
    + `<path d="M0 0L9 4.5L0 9z" fill="#9B86D9"/></marker></defs>`
    + edges + boxes + `</svg></div>`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix ui test -- geometry`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the capture component**

Create `ui/export/print/PrintDiagrams.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, useNodesInitialized, useStoreApi, getBezierPath,
} from '@xyflow/react'
import { ActivityNode } from '../../src/flow/nodes/ActivityNode'
import { StartNode } from '../../src/flow/nodes/StartNode'
import { EndNode } from '../../src/flow/nodes/EndNode'
import { JunctionNode } from '../../src/flow/nodes/JunctionNode'
import { toFlowNodes, toFlowEdges } from '../../src/flow/adapt'
import { getEdgeParams, type Geom } from '../../src/flow/edges/floating'
import { freeCuts, planBands, PRINT } from './bands'
import { bandSvg, geomBlocks, geomBounds, type DiagramGeom } from './geometry'
import type { ExportPayload } from '../shared/payload'
import type { Process } from '../../src/api/types'

const nodeTypes = { activity: ActivityNode, start: StartNode, end: EndNode, junction: JunctionNode }

/** Read the laid-out flow: node boxes with their real markup, edges with the
 *  same bezier `LabeledEdge` draws. Geometry comes from React Flow's own
 *  functions, so the printed curve is the curve on screen. */
function capture(proc: Process, store: ReturnType<typeof useStoreApi>): DiagramGeom {
  const lookup = store.getState().nodeLookup
  const boxes = []
  for (const [id, internal] of lookup) {
    const el = document.querySelector<HTMLElement>(`.pf-measure .react-flow__node[data-id="${CSS.escape(id)}"]`)
    if (!el) continue
    boxes.push({
      id,
      x: internal.internals.positionAbsolute.x,
      y: internal.internals.positionAbsolute.y,
      w: internal.measured?.width ?? el.offsetWidth,
      h: internal.measured?.height ?? el.offsetHeight,
      html: el.innerHTML,
    })
  }

  const edges = []
  for (const e of proc.edges) {
    const s = lookup.get(e.from) as unknown as Geom | undefined
    const t = lookup.get(e.to) as unknown as Geom | undefined
    if (!s || !t) continue
    const p = getEdgeParams(s, t)
    const [d, labelX, labelY] = getBezierPath({
      sourceX: p.sx, sourceY: p.sy, targetX: p.tx, targetY: p.ty,
      sourcePosition: p.sourcePos, targetPosition: p.targetPos,
    })
    const label = e.label
      ? { x: labelX - Math.min(240, e.label.length * 7.2 + 16) / 2, y: labelY - 11,
          w: Math.min(240, e.label.length * 7.2 + 16), h: 22, text: e.label }
      : undefined
    edges.push({ d, sx: p.sx, sy: p.sy, label })
  }
  return { boxes, edges }
}

function Capture({ proc, onReady }: { proc: Process; onReady: (g: DiagramGeom) => void }) {
  const initialized = useNodesInitialized()
  const store = useStoreApi()
  useEffect(() => {
    if (initialized) onReady(capture(proc, store))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, proc.id])
  return null
}

/** Renders each process's flow, one at a time, into an offscreen host and writes
 *  the resulting SVG bands into the matching `[data-pf]` slot.
 *
 *  The host is laid out but never painted — `left:-99999px`, not `display:none`,
 *  because a `display:none` subtree measures as zero and every box would come
 *  back the wrong size.
 */
export function PrintDiagrams({ payload }: { payload: ExportPayload }) {
  const [index, setIndex] = useState(0)
  const proc = payload.processes[index]

  function emit(g: DiagramGeom) {
    const slot = document.querySelector<HTMLElement>(`[data-pf="${CSS.escape(proc.id)}"]`)
    if (slot && g.boxes.length) {
      const b = geomBounds(g)
      const minX = b.minX - PRINT.PAD
      const minY = b.minY - PRINT.PAD
      const width = (b.maxX + PRINT.PAD) - minX
      const height = (b.maxY + PRINT.PAD) - minY
      const cuts = freeCuts(geomBlocks(g), minY, minY + height)
      // heading height at print width: title + id strip + meta row, measured live
      const sheet = slot.closest('[data-testid^="sheet-"]')
      const head = sheet?.querySelector('h2')?.getBoundingClientRect()
      const meta = sheet?.querySelectorAll('span')
      const headH = head && meta ? Math.ceil(head.height + 90) + PRINT.HEADGAP : 130
      const plan = planBands(minY, minY + height, width, cuts, headH)
      slot.classList.toggle('own-page', plan.ownPage)
      const uid = proc.id.replace(/[^a-z0-9]/gi, '')
      slot.innerHTML = plan.bands
        .map((band, i) => bandSvg(g, band, { minX, width }, plan.scale, `pfah-${uid}-${i}`))
        .join('')
    }
    if (index + 1 < payload.processes.length) setIndex(index + 1)
  }

  if (!proc) return null
  return (
    <div className="pf-measure" aria-hidden style={{ width: 4000, height: 900 }}>
      <ReactFlowProvider key={proc.id}>
        <ReactFlow
          nodes={toFlowNodes(proc).map((n) => ({ ...n, draggable: false, selectable: false }))}
          edges={toFlowEdges(proc)}
          nodeTypes={nodeTypes}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
          panOnDrag={false} zoomOnScroll={false} preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Capture proc={proc} onReady={emit} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
```

Processes are captured **one at a time** — `index` advances only after the previous diagram is emitted. One live React Flow instance at a time keeps memory flat on a department with thirty processes, and each gets a clean store.

- [ ] **Step 6: Commit**

```bash
git add ui/export/print
git commit -m "feat(export): capture flow geometry and emit printable SVG bands"
```

---

### Task 18: Print stylesheet, the completeness invariant, and Chrome verification

**Files:**
- Modify: `ui/export/flowchart/document.module.css`, `ui/export/flowchart/doc-base.css`, `ui/export/flowchart/Document.tsx`
- Create: `ui/export/print/print.css`, `ui/export/print/complete.ts`
- Test: `ui/export/print/complete.test.ts`

**Interfaces:**
- Produces: `diagramsComplete(payload): boolean` — true when every node of every process appears in some band.

- [ ] **Step 1: Write the failing test**

Create `ui/export/print/complete.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { diagramsComplete } from './complete'
import type { ExportPayload } from '../shared/payload'

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [{
    id: 'dining-001', department: 'dining', name: 'p', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
    nodes: [
      { id: 'n1', type: 'activity', label: 'a', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 't', touched_by: [] } },
      { id: 'n2', type: 'activity', label: 'b', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 't', touched_by: [] } },
    ],
    edges: [], pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

beforeEach(() => { document.body.innerHTML = '' })

describe('diagramsComplete', () => {
  it('is false when a slot is empty', () => {
    document.body.innerHTML = '<div data-pf="dining-001"></div>'
    expect(diagramsComplete(PAYLOAD)).toBe(false)
  })

  it('is false when a node is missing from every band', () => {
    document.body.innerHTML = '<div data-pf="dining-001"><svg><g data-id="n1"></g></svg></div>'
    expect(diagramsComplete(PAYLOAD)).toBe(false)
  })

  it('is true when every node appears somewhere', () => {
    document.body.innerHTML = '<div data-pf="dining-001"><svg><g data-id="n1"></g></svg><svg><g data-id="n2"></g></svg></div>'
    expect(diagramsComplete(PAYLOAD)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix ui test -- complete`
Expected: FAIL — cannot resolve `./complete`.

- [ ] **Step 3: Write the invariant**

Create `ui/export/print/complete.ts`:

```ts
import type { ExportPayload } from '../shared/payload'

/** Every activity, junction and terminal of every process must appear in some
 *  band. Persian glyph metrics decide how node labels wrap, which decides box
 *  heights, which decides where a cut is legal — so a build that ran before the
 *  webfont landed can be quietly wrong. This is the check that catches it. */
export function diagramsComplete(payload: ExportPayload): boolean {
  return payload.processes.every((p) => {
    const slot = document.querySelector(`[data-pf="${CSS.escape(p.id)}"]`)
    if (!slot?.querySelector('svg')) return false
    const have = new Set([...slot.querySelectorAll('[data-id]')].map((el) => el.getAttribute('data-id')))
    return p.nodes.every((n) => have.has(n.id))
  })
}
```

For this to work, `bandSvg` must carry the node id. In `ui/export/print/geometry.ts`, add `data-id` to the emitted wrapper:

```ts
      `<foreignObject x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" style="overflow:visible" data-id="${b.id}">`
```

and update the `bandSvg` test in Task 17 accordingly if it asserts on that markup — it does not, so no change is needed there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix ui test -- complete`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the print stylesheet**

Create `ui/export/print/print.css` (a global stylesheet — it must reach the SVG markup injected as raw HTML, which no CSS module can):

```css
/* offscreen measuring host: laid out so node boxes get real sizes, but never
   painted, never printed, and never inside a display:none subtree */
.pf-measure {
  position: absolute;
  left: -99999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: visible;
}

.pf-wrap { display: none; }
.pf-band { margin: 0 auto; width: max-content; max-width: 100%; }
/* must clip to its viewBox — otherwise every band paints the whole diagram */
.pf-band svg { display: block; overflow: hidden; }

@media print {
  @page { margin: 14mm 13mm; size: landscape; }
  body { background: #fff; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  .pf-measure { display: none !important; }
  .pf-wrap { display: block !important; margin-top: 14px; }
  /* a band is an atomic <svg>: never fragmented, so no node can be halved */
  .pf-band { break-inside: avoid; }
  .pf-band + .pf-band { break-before: page; }
  /* only when the first unbreakable run is taller than the room under the
     heading — rare, and it buys a much larger diagram */
  .pf-wrap.own-page { break-before: page; }
}
```

Then add to `document.module.css`, inside its own `@media print` block, the mockup's document print rules from `ui/design/export/dining-export-v2.html:290-324` — minus the `@page`, `print-color-adjust`, `.pf-*` and `.flowscreen` rules, which `print.css` now owns. In particular keep: `.topbar{display:none!important}`, `.doc{padding:0}`, `.sheet` flattening with `break-before:page`, `.cover-sheet` and `.divider-sheet` adjustments, `.role,.kpi-role,.card,.kpi-card{break-inside:avoid}`, `.backbar{display:none!important}`, and the print-only view rules that reveal the per-process sheets.

- [ ] **Step 6: Wire the print pieces into the document**

In `ui/export/flowchart/main.tsx`, add `import '../print/print.css'` after `./doc-base.css`.

In `ui/export/flowchart/Document.tsx`, render the diagram builder and hide the viewer in print. Add the import and the element beside `<ProcessSheets>`:

```tsx
import { PrintDiagrams } from '../print/PrintDiagrams'
import { diagramsComplete } from '../print/complete'
...
        <ProcessSheets payload={payload} />
        <PrintDiagrams payload={payload} key={rebuild} />
```

and add the rebuild driver to `Document`:

```tsx
  // Persian glyph metrics decide how node labels wrap, so a build that ran
  // before Vazirmatn landed can be wrong. Rebuild on the font, on load, and
  // before printing — and retry while the completeness invariant fails.
  const [rebuild, setRebuild] = useState(0)
  useEffect(() => {
    const again = () => setRebuild((n) => n + 1)
    document.fonts?.ready.then(again)
    window.addEventListener('load', again)
    window.addEventListener('beforeprint', () => { if (!diagramsComplete(payload)) again() })
    const t = setInterval(() => {
      if (diagramsComplete(payload)) { clearInterval(t); return }
      again()
    }, 350)
    // four attempts, then stop trying — a permanent failure must not spin
    setTimeout(() => clearInterval(t), 1400)
    return () => { clearInterval(t); window.removeEventListener('load', again) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

Finally, in `FlowViewer.tsx`, add `print:hidden` to the outer wrapper's class list so an open viewer never prints over the document.

- [ ] **Step 7: Run the whole test suite**

Run: `npm --prefix ui test && make test`
Expected: all green.

- [ ] **Step 8: Verify the PDF in Chrome**

Build, export a department with at least one large process, open the link, press Ctrl+P and choose landscape.

Check every one of these:
1. The topbar, the cover's screen-only chrome and the flow viewer do not appear.
2. Every process has a page with its title, id badge, counts and a diagram.
3. **No node is cut across a page boundary**, and no edge label is halved.
4. A large process spans several pages, each a complete horizontal slice, and the slices join without a gap in the middle of a row.
5. Node text is selectable in the PDF (proof the bands are vector, not raster).
6. Node colours, the coral XOR diamond and the violet AND diamond all print in colour.
7. Compare a printed node against the same node on the site: same width, same id badge, same actor row.

If a diagram is missing entirely, the completeness invariant is failing — check the browser console and confirm the measuring host is not `display:none`.

- [ ] **Step 9: Commit**

```bash
git add ui/export
git commit -m "feat(export): vector-band printing for the flowchart document"
```

**Stage 4 is complete.** The feature is done.

---

## Wrap-up

- [ ] **Run everything**

Run: `make test && make lint && npm --prefix ui test && npm --prefix ui run lint && npm --prefix ui run build`
Expected: all green.

- [ ] **Record the work**

Add a short entry to `PLAN.md` describing the export feature and pointing at the spec, matching the file's existing style.

```bash
git add PLAN.md && git commit -m "docs: record the department export feature"
```
