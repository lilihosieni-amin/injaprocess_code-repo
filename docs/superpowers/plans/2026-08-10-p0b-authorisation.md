# P0b — Authorisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every endpoint answer according to what the caller may reach — and make what is withheld genuinely absent from the response rather than hidden by the screen.

**Architecture:** One resolution function, `allows(user, capability, target)`, over a scope grammar with three strictly-nested shapes. A FastAPI dependency factory replaces the bare session gate on all fourteen endpoints, choosing **404 for a resource outside scope** and **403 for a refused action on a visible one**. The load-bearing test is not a per-field assertion but a **scan of every serialised response body per role**, because the next leak will be in a field nobody thought to assert on.

**Tech Stack:** FastAPI, stdlib `sqlite3`, pytest + `TestClient`. Frontend: React 19 and the F design system.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-multi-user-rbac-design.md` — decisions **D9, D10, D11, D12, D22, D48, D54, D56**, and `§11` tests 1, 6, 7, 9, 10. Where anything here disagrees, the spec wins.
- **Depends on P0a**, which supplies `app.db`, the seeded roles, sessions, and `require_session(request) -> sqlite3.Row` returning the user row.
- **This plan does NOT implement the content-visibility policy.** Field-level stripping (`summary`, `idef0`, `kpis`, node `icom`) and confirmation-gating are **P1**. P0b withholds whole *records* by scope, never fields. Do not add a field filter.
- **Backend tests:** `.venv/bin/pytest ui-backend/tests -q` from the repo root.
- **Frontend tests:** `cd ui && npx vitest run`. Vitest runs `globals: false` — import from `vitest` explicitly.
- **`npm run build` is mandatory frontend verification.**
- **No hex colours, no `text-[…]`/`rounded-[…]`/`shadow-[…]` under `ui/src/**`**, no physical CSS properties — `ui/src/test/guards.test.ts` enforces this.
- **Do not touch** `ui/src/flow/**`, `ui/export/**`, `engine/`, or `data-repo`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/scopes.py` | The scope grammar: parse, `contains`, `dept_of_scope`. Pure, no I/O. |
| `ui-backend/inja_ui_backend/access.py` | `capabilities_of`, `scopes_of`, `allows`, and the `requires()` dependency factory. |
| `ui-backend/tests/test_scopes.py`, `test_access.py`, `test_endpoint_matrix.py`, `test_body_scan.py` | Backend tests, the last being the load-bearing one. |
| `ui/src/auth/can.ts` | `useCan()` — capability checks for drawing, never for deciding. |

**Modified:** every file under `ui-backend/inja_ui_backend/routers/`, plus `ui/src/screens/*` where an affordance must disappear.

---

### Task 1: The scope grammar

**Files:**
- Create: `ui-backend/inja_ui_backend/scopes.py`, `ui-backend/tests/test_scopes.py`

**Interfaces:**
- Produces: `contains(scope: str, target: str) -> bool`, `dept_of(target: str) -> str | None`, `SCOPE_RE`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_scopes.py`:

```python
import pytest

from inja_ui_backend.scopes import SCOPE_RE, contains, dept_of


@pytest.mark.parametrize("scope,target", [
    ("*", "*"),
    ("*", "dept:dining"),
    ("*", "dept:dining/report:steps"),
    ("dept:dining", "dept:dining"),
    ("dept:dining", "dept:dining/report:steps"),
    ("dept:dining/report:steps", "dept:dining/report:steps"),
])
def test_containment_holds(scope, target):
    assert contains(scope, target)


@pytest.mark.parametrize("scope,target", [
    ("dept:dining", "*"),
    ("dept:dining", "dept:cashier"),
    ("dept:dining", "dept:cashier/report:steps"),
    # A report scope covers neither its department nor a sibling report — this
    # is the asymmetry the whole grammar exists for.
    ("dept:dining/report:steps", "dept:dining"),
    ("dept:dining/report:steps", "dept:dining/report:flowchart"),
    ("dept:dining/report:steps", "*"),
])
def test_containment_does_not_hold(scope, target):
    assert not contains(scope, target)


def test_a_department_prefix_is_not_a_match():
    # 'dining' must not swallow 'dining-annex'.
    assert not contains("dept:dining", "dept:dining-annex")


def test_dept_of():
    assert dept_of("dept:dining") == "dining"
    assert dept_of("dept:dining/report:steps") == "dining"
    assert dept_of("*") is None


def test_scope_regex_rejects_malformed_scopes():
    for good in ["*", "dept:dining", "dept:dining/report:steps"]:
        assert SCOPE_RE.fullmatch(good)
    for bad in ["dept:", "dept:Dining", "report:steps", "dept:dining/report:",
                "dept:dining/", "dept:dining/report:steps/extra"]:
        assert not SCOPE_RE.fullmatch(bad)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_scopes.py -q`
Expected: FAIL — no module named `scopes`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/scopes.py`:

```python
"""The scope grammar (spec D10).

    *  ⊃  dept:{code}  ⊃  dept:{code}/report:{kind}

Three shapes, strictly nested. There is deliberately no process-level scope:
department and report cover the stated need, and process-level would multiply
the permission UI for a case that has not arisen.
"""
from __future__ import annotations

import re

SCOPE_RE = re.compile(r"^(?:\*|dept:[a-z]+(?:/report:[a-z]+)?)$")


def dept_of(scope: str) -> str | None:
    if not scope.startswith("dept:"):
        return None
    return scope[len("dept:"):].split("/", 1)[0]


def contains(scope: str, target: str) -> bool:
    """Does `scope` cover `target`?

    Segment-wise, never by string prefix: 'dept:dining' must not swallow
    'dept:dining-annex'.
    """
    if scope == "*":
        return True
    if target == "*":
        return False
    if scope == target:
        return True
    # The only remaining case that can hold is a department scope covering one
    # of its own reports.
    return target.startswith(scope + "/report:")
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_scopes.py -q`
Expected: PASS — 16 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/scopes.py ui-backend/tests/test_scopes.py
git commit -m "feat(backend): the scope grammar, nested three deep

Containment is segment-wise rather than by string prefix, so dept:dining cannot
swallow dept:dining-annex. A report scope covers neither its own department nor
a sibling report — that asymmetry is what the grammar exists for."
```

---

### Task 2: Resolution

**Files:**
- Create: `ui-backend/inja_ui_backend/access.py`, `ui-backend/tests/test_access.py`

**Interfaces:**
- Consumes: `scopes.contains`, the `roles`/`user_scopes` tables.
- Produces: `capabilities_of(conn, user) -> frozenset[str]`, `scopes_of(conn, user) -> tuple[str, ...]`, `allows(conn, user, capability, target) -> bool`, `reachable_departments(conn, user, capability) -> set[str] | None` (`None` meaning "all").

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_access.py`:

```python
import json

from inja_ui_backend import db, seed
from inja_ui_backend.access import (allows, capabilities_of,
                                    reachable_departments, scopes_of)
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _mk(conn, username, role, *scopes):
    rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=rid)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def test_capabilities_come_from_the_role_and_nowhere_else(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    assert capabilities_of(conn, reader) == frozenset(
        {"view", "comment", "export_pdf"})


def test_the_roles_are_strictly_nested(tmp_path):
    conn = _conn(tmp_path)
    r = capabilities_of(conn, _mk(conn, "09120000001", "reader", "*"))
    a = capabilities_of(conn, _mk(conn, "09120000002", "admin", "*"))
    e = capabilities_of(conn, _mk(conn, "09120000003", "editor", "*"))
    assert r < a < e


def test_allows_needs_both_the_capability_and_the_scope(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    assert allows(conn, reader, "view", "dept:dining")
    assert not allows(conn, reader, "view", "dept:cashier")   # scope misses
    assert not allows(conn, reader, "edit", "dept:dining")    # capability misses


def test_a_department_scope_covers_reports_added_later(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    assert allows(conn, reader, "view", "dept:dining/report:anything-new")


def test_a_report_scope_never_widens(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining/report:steps")
    assert allows(conn, reader, "view", "dept:dining/report:steps")
    assert not allows(conn, reader, "view", "dept:dining")
    assert not allows(conn, reader, "view", "dept:dining/report:flowchart")


def test_several_scopes_on_one_user(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", "dept:dining", "dept:cashier")
    assert scopes_of(conn, head) == ("dept:cashier", "dept:dining")
    assert allows(conn, head, "view", "dept:dining")
    assert allows(conn, head, "view", "dept:cashier")
    assert not allows(conn, head, "view", "dept:logistics")


def test_reachable_departments(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", "dept:dining", "dept:cashier")
    assert reachable_departments(conn, head, "view") == {"dining", "cashier"}
    everyone = _mk(conn, "09120000002", "admin", "*")
    assert reachable_departments(conn, everyone, "view") is None   # all
    assert reachable_departments(conn, head, "edit") == set()      # no capability


def test_a_disabled_user_is_allowed_nothing(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    users.set_disabled(conn, reader["id"], True)
    reader = users.by_id(conn, reader["id"])
    assert not allows(conn, reader, "view", "dept:dining")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_access.py -q`
Expected: FAIL — no module named `access`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/access.py`:

```python
"""Permission resolution (spec D12).

    allows(user, capability, target)
      ⟺ user.role.capabilities ∋ capability
      ∧ ∃ s ∈ user.scopes : s contains target

That is the whole rule. There are no per-user overrides — no override table, no
per-user capability list, no deny list. "Why can this person download?" must
have one answer in one place, and the subset comparison delegation depends on
(P0c) is only well-defined when capabilities come from exactly one source.
"""
from __future__ import annotations

import json
import sqlite3

from .scopes import contains, dept_of


def capabilities_of(conn: sqlite3.Connection, user: sqlite3.Row) -> frozenset[str]:
    if user["disabled_at"] is not None:
        return frozenset()
    row = conn.execute("SELECT capabilities FROM roles WHERE id = ?",
                       (user["role_id"],)).fetchone()
    return frozenset(json.loads(row["capabilities"])) if row else frozenset()


def scopes_of(conn: sqlite3.Connection, user: sqlite3.Row) -> tuple[str, ...]:
    rows = conn.execute(
        "SELECT scope FROM user_scopes WHERE user_id = ? ORDER BY scope",
        (user["id"],)).fetchall()
    return tuple(r["scope"] for r in rows)


def allows(conn: sqlite3.Connection, user: sqlite3.Row, capability: str,
           target: str) -> bool:
    if capability not in capabilities_of(conn, user):
        return False
    return any(contains(s, target) for s in scopes_of(conn, user))


def reachable_departments(conn: sqlite3.Connection, user: sqlite3.Row,
                          capability: str) -> set[str] | None:
    """Departments this user may exercise `capability` on.

    None means "every department" — the caller must not turn that into a list,
    because a department added tomorrow is inside a `*` scope today.
    """
    if capability not in capabilities_of(conn, user):
        return set()
    codes: set[str] = set()
    for s in scopes_of(conn, user):
        if s == "*":
            return None
        code = dept_of(s)
        if code:
            codes.add(code)
    return codes
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_access.py -q`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/access.py ui-backend/tests/test_access.py
git commit -m "feat(backend): one resolution rule, and no second rulebook

Capability from the role, scope from the user, and nothing else — no overrides,
no per-user list, no deny list. 'Why can this person download?' has one answer
in one place, which is also what makes the subset comparison in P0c definable.

reachable_departments returns None for a * scope rather than a list, because a
department created tomorrow is already inside it."
```

---

### Task 3: The dependency, and 404 versus 403

**Files:**
- Modify: `ui-backend/inja_ui_backend/access.py`
- Create: `ui-backend/tests/test_requires.py`

**Interfaces:**
- Produces: `requires(capability: str, target: Callable[[Request], str] | str)` returning a FastAPI dependency that resolves the session, checks `allows`, and raises the right status.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_requires.py`:

```python
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from inja_ui_backend.access import requires


def test_out_of_scope_is_404_and_refused_action_is_403(data_root, tmp_path, monkeypatch):
    """The partition, asserted on a throwaway app so no router is involved.

    D56: a 403 on an out-of-scope resource teaches the caller that it exists.
    A 403 is only for an action refused on something they can already see.
    """
    from inja_ui_backend import db, seed
    from inja_ui_backend.auth import hash_password, require_session
    from inja_ui_backend.store import users

    dbp = tmp_path / "app.db"
    conn = db.connect(dbp)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash=hash_password("test-password"))
    rid = conn.execute("SELECT id FROM roles WHERE name='reader'").fetchone()[0]
    uid = users.create(conn, username="09120000001", display_name="r",
                       password_hash=hash_password("test-password"), role_id=rid)
    conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, 'dept:dining')",
                 (uid,))

    app = FastAPI()
    app.state.db = conn

    class Cfg:
        session_ttl = 86400
    app.state.cfg = Cfg()

    @app.get("/visible")
    def visible(_=Depends(requires("view", "dept:dining"))):
        return {"ok": True}

    @app.get("/other-department")
    def other(_=Depends(requires("view", "dept:cashier"))):
        return {"ok": True}

    @app.get("/edit-here")
    def edit_here(_=Depends(requires("edit", "dept:dining"))):
        return {"ok": True}

    client = TestClient(app, base_url="https://testserver")

    # Unauthenticated is 401 — neither of the other two.
    assert client.get("/visible").status_code == 401

    from inja_ui_backend.store import sessions
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=__import__("time").time().__int__())
    client.cookies.set("inja_session", sid)

    assert client.get("/visible").status_code == 200
    # Outside scope: must not reveal that the department exists.
    assert client.get("/other-department").status_code == 404
    # Refused action on something they CAN see.
    assert client.get("/edit-here").status_code == 403
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_requires.py -q`
Expected: FAIL — `cannot import name 'requires'`.

- [ ] **Step 3: Add the dependency factory**

Append to `ui-backend/inja_ui_backend/access.py`:

```python
from typing import Callable

from fastapi import Depends, HTTPException, Request

from .auth import require_session


def requires(capability: str, target: str | Callable[[Request], str]):
    """A dependency that gates an endpoint on one capability at one target.

    The status partition is the point (D56):

      401  no session at all
      404  the target is outside the caller's scope — they must not learn it
           exists, so this is deliberately indistinguishable from a typo
      403  the caller can see the target but may not do this to it

    The natural implementation returns 403 for both refusal cases, which is why
    both directions are pinned by tests.
    """
    def dependency(request: Request, user=Depends(require_session)):
        conn = request.app.state.db
        resolved = target(request) if callable(target) else target
        if not any(contains(s, resolved) for s in scopes_of(conn, user)):
            raise HTTPException(status_code=404, detail="یافت نشد")
        if capability not in capabilities_of(conn, user):
            raise HTTPException(status_code=403, detail="اجازهٔ این کار را ندارید")
        request.state.user = user
        return user
    return dependency
```

Note the ordering: **scope is checked before capability**. Reversed, a Reader asking for another department's process would get 403 and learn the department exists.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_requires.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/access.py ui-backend/tests/test_requires.py
git commit -m "feat(backend): 404 for what you cannot reach, 403 for what you cannot do

Scope is checked before capability. Reversed, asking for another department's
process would answer 403 and teach the caller that the department exists — which
is the disclosure the 404 is there to refuse."
```

---

### Task 4: Every endpoint becomes capability-aware

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/{departments,exports,pending,processes}.py`
- Create: `ui-backend/tests/test_endpoint_matrix.py`

**Interfaces:** no new exports. Each of the fourteen routes swaps `Depends(require_session)` for `Depends(requires(...))`.

**The mapping — use exactly this:**

| Route | Capability | Target |
|---|---|---|
| `GET /api/departments` | `view` | per-row filter, not a gate (see Step 3) |
| `GET /api/departments/{code}/overview` | `view` | `dept:{code}` |
| `PUT /api/departments/{code}/overview` | `edit` | `dept:{code}` |
| `PUT /api/departments/{code}/order` | `edit` | `dept:{code}` |
| `GET /api/departments/{code}/processes` | `view` | `dept:{code}` |
| `GET /api/departments/{code}/next-id` | `edit` | `dept:{code}` |
| `POST /api/departments/{code}/exports/{kind}` | `export_pdf` | `dept:{code}/report:{kind}` |
| `GET /api/pending` | `edit` | per-row filter (see Step 3) |
| `GET /api/processes/{pid}` | `view` | `dept:{dept_of(pid)}` |
| `POST /api/processes` | `edit` | `dept:{body.department}` |
| `DELETE /api/processes/{pid}` | `edit` | `dept:{dept_of(pid)}` |
| `POST /api/processes/{pid}/relayout` | `edit` | `dept:{dept_of(pid)}` |
| `PUT /api/processes/{pid}` | `edit` | `dept:{dept_of(pid)}` |
| `POST /api/processes/{pid}/pending/{index}` | `edit` | `dept:{dept_of(pid)}` |

`GET /api/pending` requires `edit` rather than `view` because unresolved conflicts are on the never-shown list (D17) — they are internal bookkeeping, not content.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_endpoint_matrix.py`:

```python
"""One negative test per capability per endpoint, both directions (spec §11.6)."""
import pytest

from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"

# (method, path, needed_capability)
ROUTES = [
    ("GET", "/api/departments/cooking/overview", "view"),
    ("PUT", "/api/departments/cooking/overview", "edit"),
    ("PUT", "/api/departments/cooking/order", "edit"),
    ("GET", "/api/departments/cooking/processes", "view"),
    ("GET", "/api/departments/cooking/next-id", "edit"),
    ("GET", "/api/pending", "edit"),
    ("GET", "/api/processes/cooking-001", "view"),
    ("DELETE", "/api/processes/cooking-001", "edit"),
    ("POST", "/api/processes/cooking-001/relayout", "edit"),
    ("PUT", "/api/processes/cooking-001", "edit"),
]


def _client_as(data_root, tmp_path, role, *scopes):
    from fastapi.testclient import TestClient
    cfg = cfg_for(data_root, tmp_path / "app.db")
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash=hash_password(PW))
    rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    uid = users.create(conn, username="09120000009", display_name="u",
                       password_hash=hash_password(PW), role_id=rid)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    assert client.post("/api/auth/login",
                       json={"username": "09120000009", "password": PW}).status_code == 200
    return client


@pytest.mark.parametrize("method,path,capability", ROUTES)
def test_a_reader_in_scope_is_refused_every_edit(data_root, tmp_path, method, path,
                                                 capability):
    client = _client_as(data_root, tmp_path, "reader", "dept:cooking")
    r = client.request(method, path, json={})
    if capability == "edit":
        assert r.status_code == 403, f"{method} {path} gave {r.status_code}"
    else:
        assert r.status_code != 403


@pytest.mark.parametrize("method,path,capability", ROUTES)
def test_out_of_scope_is_404_never_403(data_root, tmp_path, method, path, capability):
    # An editor scoped to a DIFFERENT department: they hold every capability, so
    # only scope can refuse them — and it must refuse with 404.
    client = _client_as(data_root, tmp_path, "editor", "dept:dining")
    r = client.request(method, path, json={})
    if path != "/api/pending":          # /api/pending is filtered, not gated
        assert r.status_code == 404, f"{method} {path} gave {r.status_code}"


def test_an_editor_in_scope_is_not_refused(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = client.get("/api/processes/cooking-001")
    assert r.status_code == 200
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_endpoint_matrix.py -q`
Expected: FAIL — every route still admits any signed-in user.

- [ ] **Step 3: Apply the dependency to every route**

Work through the four router files, replacing `_: str = Depends(require_session)` with the mapped `Depends(requires(...))`. Where the target depends on a path parameter, pass a callable:

```python
def _dept_target(request: Request) -> str:
    return f"dept:{request.path_params['code']}"

def _pid_target(request: Request) -> str:
    return f"dept:{storage.dept_of(request.path_params['pid'])}"
```

**Two routes are filters rather than gates**, because they span departments:

- `GET /api/departments` keeps `Depends(require_session)` and filters its result with `reachable_departments(conn, user, "view")` — a `None` result means no filtering. A department the caller cannot reach must be **absent from the list**, not present-and-greyed.
- `GET /api/pending` likewise filters to departments where the caller has `edit`, returning `[]` rather than 403 when they have none anywhere.

- [ ] **Step 4: Run the matrix**

Run: `.venv/bin/pytest ui-backend/tests/test_endpoint_matrix.py -q`
Expected: PASS — 21 tests.

- [ ] **Step 5: Run everything**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: all green. Existing router tests sign in as the seeded Editor with scope `*`, so they are unaffected.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/routers ui-backend/tests/test_endpoint_matrix.py
git commit -m "feat(backend): every endpoint answers according to who is asking

Fourteen routes, each with one capability at one target. The two that span
departments filter rather than gate: a department you cannot reach is absent
from the list, not present and greyed.

/api/pending needs edit rather than view — unresolved conflicts are internal
bookkeeping on the never-shown list, not content."
```

---

### Task 5: The response-body scan

**Files:**
- Create: `ui-backend/tests/test_body_scan.py`

**Interfaces:** none — this is the load-bearing test of the whole sub-project.

- [ ] **Step 1: Write it**

Create `ui-backend/tests/test_body_scan.py`:

```python
"""The load-bearing test (spec §11.9).

A scan of the whole serialised body, not per-field assertions — because the next
leak will be in a field nobody thought to assert on.

P0b polices whole records and out-of-scope ids. Field-level stripping (summary,
idef0, kpis, node icom) is P1 and is deliberately NOT asserted here.
"""
import json

import pytest

from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"

READ_ONLY_PATHS = [
    "/api/departments",
    "/api/departments/dining/overview",
    "/api/departments/dining/processes",
    "/api/pending",
    "/api/auth/me",
]


def _client_as(data_root, tmp_path, role, *scopes):
    from fastapi.testclient import TestClient
    cfg = cfg_for(data_root, tmp_path / "app.db")
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash=hash_password(PW))
    rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    uid = users.create(conn, username="09120000009", display_name="u",
                       password_hash=hash_password(PW), role_id=rid)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    client.post("/api/auth/login", json={"username": "09120000009", "password": PW})
    return client


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin"])
def test_no_out_of_scope_department_appears_anywhere_in_any_body(data_root, tmp_path,
                                                                 role):
    client = _client_as(data_root, tmp_path, role, "dept:dining")
    forbidden = ["cooking", "cashier", "logistics", "warehouse", "accounting",
                 "management", "procurement", "preparation"]
    for path in READ_ONLY_PATHS:
        r = client.get(path)
        if r.status_code != 200:
            continue
        body = json.dumps(r.json(), ensure_ascii=False)
        for code in forbidden:
            assert code not in body, f"{path} leaked {code!r} to a {role}"


def test_a_report_scoped_reader_sees_no_department_body_at_all(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "reader",
                        "dept:dining/report:steps")
    # A report scope covers neither the department nor its process list.
    assert client.get("/api/departments/dining/overview").status_code == 404
    assert client.get("/api/departments/dining/processes").status_code == 404


def test_the_department_list_omits_what_the_caller_cannot_reach(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    body = client.get("/api/departments").json()
    codes = {d["code"] for d in body}
    assert codes == {"dining"}


def test_pending_is_empty_rather_than_forbidden_for_someone_without_edit(data_root,
                                                                        tmp_path):
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    r = client.get("/api/pending")
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Run it**

Run: `.venv/bin/pytest ui-backend/tests/test_body_scan.py -q`
Expected: PASS if Task 4 is complete. **If any assertion fails, the bug is in the backend, not the test** — a body containing a department the caller cannot reach is a leak regardless of what the UI would have rendered.

- [ ] **Step 3: Prove the scan is not vacuous**

Temporarily widen one scope in `_client_as` to `"*"` and confirm the first test **fails**. Revert. Report that you did this — a scan that never fires is worse than no scan.

- [ ] **Step 4: Commit**

```bash
git add ui-backend/tests/test_body_scan.py
git commit -m "test(backend): scan the whole body, not the fields we remembered

Per-field assertions catch the leaks you thought of. This asserts that no
department outside the caller's scope appears anywhere in any response, at any
depth, for every role — because the next leak will be in a field nobody thought
to assert on."
```

---

### Task 6: Capability-aware affordances

**Files:**
- Create: `ui/src/auth/can.ts`, `ui/src/auth/can.test.tsx`
- Modify: the screens that render an edit control

**Interfaces:**
- Produces: `useCan(): (capability: Capability, target?: string) => boolean`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/auth/can.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCan } from './can'
import type { SessionDescriptor } from './session'

const READER: SessionDescriptor = {
  username: '09123456789', displayName: 'س', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

describe('useCan', () => {
  it('answers from capability and scope together', () => {
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('view', 'dept:dining')).toBe(true)
    expect(result.current('view', 'dept:cashier')).toBe(false)
    expect(result.current('edit', 'dept:dining')).toBe(false)
  })

  it('treats a department scope as covering its reports', () => {
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('view', 'dept:dining/report:steps')).toBe(true)
  })

  it('answers capability alone when no target is given', () => {
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('comment')).toBe(true)
    expect(result.current('manage_users')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/auth/can.test.tsx`
Expected: FAIL — cannot resolve `./can`.

- [ ] **Step 3: Write it**

Create `ui/src/auth/can.ts`:

```ts
import { useCallback } from 'react'
import type { Capability, SessionDescriptor } from './session'

/** Does `scope` cover `target`? The twin of the server's scopes.contains. */
export function scopeContains(scope: string, target: string): boolean {
  if (scope === '*') return true
  if (target === '*') return false
  if (scope === target) return true
  return target.startsWith(`${scope}/report:`)
}

/**
 * Decides what to DRAW and nothing else (spec D48). Every endpoint re-derives
 * permission from the session row, so a wrong answer here is a cosmetic bug and
 * never a security one — which is the only reason it is safe to have at all.
 */
export function useCan(session: SessionDescriptor) {
  return useCallback(
    (capability: Capability, target?: string): boolean => {
      if (!session.capabilities.includes(capability)) return false
      if (target === undefined) return true
      return session.scopes.some((s) => scopeContains(s, target))
    },
    [session],
  )
}
```

- [ ] **Step 4: Hide the affordances a reader must not see**

In `ui/src/screens/ProcessList.tsx`, `Overview.tsx`, `Summary.tsx` and `ui/src/flow/FlowScreen.tsx`'s toolbar — wait: **`FlowScreen.tsx` is under `ui/src/flow/` and out of scope.** Leave it entirely. For the three screens, wrap each edit/create/delete control in a `useCan('edit', \`dept:${code}\`)` check so it does not render.

A control that renders and then fails is worse than one that never renders, but the check is cosmetic: the endpoint refuses regardless (Task 4).

- [ ] **Step 5: Verify**

Run: `cd ui && npx vitest run && npx tsc -b && npm run lint && npm run build`
Expected: all green, no new warnings.

- [ ] **Step 6: Commit**

```bash
git add ui/src/auth/can.ts ui/src/auth/can.test.tsx ui/src/screens
git commit -m "feat(ui): draw only what the person can actually do

useCan decides what to render and nothing else. Every endpoint re-derives
permission independently, so a wrong answer here is cosmetic — which is the only
reason it is safe to have."
```

---

### Task 7: The denied and not-found surfaces

**Files:**
- Modify: `ui/src/api/client.ts`, `ui/src/routes.tsx`
- Create: `ui/src/screens/errors.test.tsx`

**Interfaces:** none new — wires F's `DeniedState` and `NotFoundState` to real responses.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/errors.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeniedState, NotFoundState } from '../ui/states'

describe('refusal surfaces', () => {
  it('not-found says nothing about what might exist', () => {
    render(<NotFoundState />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/دسترسی|مدیر|اجازه|محدود|وجود|قابل مشاهده|سرپرست/)
  })

  it('denied names the action, not the resource', () => {
    render(<DeniedState />)
    expect(screen.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd ui && npx vitest run src/screens/errors.test.tsx`
Expected: PASS if F's states are intact — this is a regression guard, not new behaviour. If the import path is wrong, fix the path.

- [ ] **Step 3: Route 403 and 404 to the right surface**

Screens that fetch a single resource render `NotFoundState` on an `ApiError` with status 404 and `DeniedState` on 403. Add that branch wherever a screen currently renders an error.

**Do not add "contact your administrator" to the not-found path.** The UI cannot know whether anything is there, and saying so would answer the question the 404 exists to refuse.

- [ ] **Step 4: Verify and commit**

Run: `cd ui && npx vitest run && npx tsc -b && npm run lint && npm run build`

```bash
git add ui/src
git commit -m "feat(ui): a refusal that reveals nothing

403 renders denied, 404 renders not-found, and the not-found copy stays silent
about whether anything is there — which is the whole reason the server answers
404 instead of 403."
```

---

## Self-Review

**Spec coverage.** D10 → Task 1. D9/D11/D12 → Task 2. D56 → Tasks 3, 5, 7. D48 → Task 6. §11 test 1 → Task 1. §11 test 6 → Task 4. §11 test 9 → Task 5. §11 test 10 → Task 3.

**Deliberately out of scope, named so nobody assumes they were missed:** the content-visibility policy and field stripping (P1); confirmation-gating of unconfirmed content (P1); D54's "a Reader sees no user-administration surface" (P0c, since the user endpoints do not exist yet); delegation and supervisor rules (P0c); the audit events for content reads (P3); `ui/src/flow/FlowScreen.tsx`'s toolbar, which is under the untouchable flow directory and will need its edit controls gated by whichever plan is allowed to modify it.

**One risk worth stating.** Task 4 changes every router in one commit. The endpoint matrix in Task 5's sibling test is what makes that safe, so it must be written first and must fail before the change.

**Placeholder scan.** No "TBD", no "add validation". Every code step shows its code.

**Type consistency.** `requires(capability, target)` takes the same argument shapes in Tasks 3 and 4. `reachable_departments` returns `set | None` in Task 2 and is consumed with a `None` check in Task 4. `scopeContains` in `can.ts` mirrors `contains` in `scopes.py` — if they diverge, the UI draws affordances the server refuses.
