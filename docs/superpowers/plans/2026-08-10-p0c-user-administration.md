# P0c — User Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the right people create, change and disable accounts — under a delegation rule that cannot be used to escalate, with a supervisor chain that comment routing will later depend on, and with every governance action on the record.

**Architecture:** One delegation check, applied identically to creation and to modification, comparing capability sets and scope coverage. Supervisor is a separate axis that grants nothing. The user-administration surface is served only to holders of `manage_users`, so a Reader receives nothing about anyone else's account.

**Tech Stack:** FastAPI, stdlib `sqlite3`, pytest + `TestClient`. Frontend: React 19 and the F design system.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-multi-user-rbac-design.md` — decisions **D11, D13, D14, D15, D42, D50, D51, D52, D53, D54, D57, D58**, and `§11` tests 2, 3, 3a, 4, 7, 17. Where anything here disagrees, the spec wins.
- **Depends on P0a** (store, sessions, seed) **and P0b** (`allows`, `requires`, the scope grammar).
- **Roles are immutable.** No endpoint creates, edits or deletes one. If you find yourself writing a role-writing route, stop — that is D50, and test 17 exists to catch it.
- **There are no per-user overrides.** No capability may be added to or removed from one person. An exception is a seeded role.
- **Backend tests:** `.venv/bin/pytest ui-backend/tests -q`.
- **Frontend tests:** `cd ui && npx vitest run`. `globals: false` — import from `vitest` explicitly. **`npm run build` is mandatory.**
- **No hex colours, no `text-[…]`/`rounded-[…]`/`shadow-[…]` under `ui/src/**`**, no physical CSS properties.
- **Do not touch** `ui/src/flow/**`, `ui/export/**`, `engine/`, or `data-repo`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/delegation.py` | The two checks, the last-Editor guard, and supervisor eligibility. Pure policy, no HTTP. |
| `ui-backend/inja_ui_backend/routers/users.py` | The user-administration endpoints. |
| `ui-backend/tests/test_delegation.py`, `test_supervisors.py`, `test_users_api.py`, `test_reader_sees_no_users.py` | Backend tests. |
| `ui/src/screens/Users.tsx`, `UserDetail.tsx`, `NewUserDialog.tsx`, `SupervisorPicker.tsx` | The administration screens. |
| `ui/src/screens/users.test.tsx` | Their tests. |
| `ui/src/api/users.ts` | The hooks for the new endpoints. |

---

### Task 1: The delegation rule

**Files:**
- Create: `ui-backend/inja_ui_backend/delegation.py`, `ui-backend/tests/test_delegation.py`

**Interfaces:**
- Produces: `may_delegate(conn, actor, *, role_id, scopes) -> str | None` returning an error key or `None`, and `MayNot` error keys as module constants.

**The rule (D13), and nothing more:**

1. `manage_users` is required at all.
2. **Capabilities:** the target's set is a **strict subset** of the actor's — unless the actor holds `manage_peers`, which also permits **equality**.
3. **Scope:** every scope of the target is **contained by** some scope of the actor. Containment, not membership.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_delegation.py`:

```python
import pytest

from inja_ui_backend import db, seed
from inja_ui_backend.delegation import may_delegate
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _role(conn, name):
    return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]


def _mk(conn, username, role, *scopes):
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=_role(conn, role))
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


# (actor_role, target_role, allowed) — the matrix of D13, both directions.
MATRIX = [
    ("reader", "reader", False),
    ("reader", "admin", False),
    ("reader", "editor", False),
    ("admin", "reader", True),
    ("admin", "admin", True),      # manage_peers permits equality
    ("admin", "editor", False),    # Editor is not a subset of Admin
    ("editor", "reader", True),
    ("editor", "admin", True),
    ("editor", "editor", True),
]


@pytest.mark.parametrize("actor_role,target_role,allowed", MATRIX)
def test_the_delegation_matrix(tmp_path, actor_role, target_role, allowed):
    conn = _conn(tmp_path)
    actor = _mk(conn, "09120000001", actor_role, "*")
    err = may_delegate(conn, actor, role_id=_role(conn, target_role), scopes=["*"])
    assert (err is None) is allowed, f"{actor_role} -> {target_role}: {err}"


def test_a_reader_is_refused_because_of_manage_users_not_the_subset_rule(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "*")
    assert may_delegate(conn, reader, role_id=_role(conn, "reader"),
                        scopes=["*"]) == "no_manage_users"


def test_scope_must_be_contained_not_merely_listed(tmp_path):
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    # A report inside the actor's department is fine — containment, not membership.
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:dining/report:steps"]) is None
    # Another department is not.
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:cashier"]) == "scope_not_covered"


def test_a_scoped_admin_cannot_widen_to_everything(tmp_path):
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["*"]) == "scope_not_covered"


def test_an_admin_without_manage_peers_cannot_create_an_equal(tmp_path):
    # reader_no_download is a strict subset of reader, so it is the one pair we
    # can test the strictness with among the seeded roles.
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader_no_download"),
                        scopes=["*"]) is None
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_delegation.py -q`
Expected: FAIL — no module named `delegation`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/delegation.py`:

```python
"""Who may appoint whom (spec D13).

Two independent checks, applied identically to creation and to modification —
modification is judged against the RESULTING user, so nobody can escalate an
existing account past their own.
"""
from __future__ import annotations

import json
import sqlite3

from .access import capabilities_of, scopes_of
from .scopes import contains

NO_MANAGE_USERS = "no_manage_users"
NOT_A_SUBSET = "not_a_subset"
SCOPE_NOT_COVERED = "scope_not_covered"


def _role_capabilities(conn: sqlite3.Connection, role_id: int) -> frozenset[str]:
    row = conn.execute("SELECT capabilities FROM roles WHERE id = ?",
                       (role_id,)).fetchone()
    return frozenset(json.loads(row["capabilities"])) if row else frozenset()


def may_delegate(conn: sqlite3.Connection, actor: sqlite3.Row, *, role_id: int,
                 scopes: list[str]) -> str | None:
    """Return an error key, or None when the actor may do this."""
    actor_caps = capabilities_of(conn, actor)
    if "manage_users" not in actor_caps:
        return NO_MANAGE_USERS

    target_caps = _role_capabilities(conn, role_id)
    if "manage_peers" in actor_caps:
        if not target_caps <= actor_caps:
            return NOT_A_SUBSET
    elif not target_caps < actor_caps:      # strict
        return NOT_A_SUBSET

    actor_scopes = scopes_of(conn, actor)
    for s in scopes:
        if not any(contains(a, s) for a in actor_scopes):
            return SCOPE_NOT_COVERED
    return None
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_delegation.py -q`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/delegation.py ui-backend/tests/test_delegation.py
git commit -m "feat(backend): confer only what you hold, and only where you hold it

Two checks, applied the same way to creating a user and to changing one, because
modification judged against the resulting user is the only version that cannot
be used to escalate an account past your own.

Scope is containment rather than membership: an admin on dining may create a
reader on one of dining's reports, and on nothing else."
```

---

### Task 2: The invariants that keep the system usable

**Files:**
- Modify: `ui-backend/inja_ui_backend/delegation.py`
- Create: `ui-backend/tests/test_invariants.py`

**Interfaces:**
- Produces: `may_modify(conn, actor, target, *, role_id, scopes) -> str | None`, `may_disable(conn, actor, target) -> str | None`, plus keys `SELF_EDIT`, `LAST_EDITOR`, `LAST_STAR_HOLDER`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_invariants.py`:

```python
from inja_ui_backend import db, seed
from inja_ui_backend.delegation import (LAST_EDITOR, SELF_EDIT, may_disable,
                                        may_modify)
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _role(conn, name):
    return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]


def _editor(conn):
    return users.by_username(conn, "09120000000")


def _mk(conn, username, role, *scopes):
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=_role(conn, role))
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def test_nobody_may_edit_their_own_record(tmp_path):
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert may_modify(conn, editor, editor, role_id=editor["role_id"],
                      scopes=["*"]) == SELF_EDIT


def test_an_admin_cannot_disable_an_editor(tmp_path):
    # Disabling is a change to someone's access, so it takes the same checks —
    # otherwise an admin could destroy the only source of edit in one click.
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_disable(conn, admin, _editor(conn)) is not None


def test_an_admin_cannot_re_enable_an_editor_either(tmp_path):
    # Re-enabling restores capabilities the actor does not hold.
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    editor = _editor(conn)
    users.set_disabled(conn, editor["id"], True)
    assert may_disable(conn, admin, users.by_id(conn, editor["id"])) is not None


def test_the_last_active_editor_cannot_be_disabled(tmp_path):
    # D53 pins at least one active * holder, which an Admin satisfies while the
    # system has no edit, confirm or set_visibility at all — and the seed is the
    # only way back.
    conn = _conn(tmp_path)
    second = _mk(conn, "09120000001", "editor", "*")
    editor = _editor(conn)
    # With two editors, disabling one is fine.
    assert may_disable(conn, second, editor) is None
    users.set_disabled(conn, editor["id"], True)
    # Now `second` is the last one, and nobody may take it away.
    other = _mk(conn, "09120000002", "editor", "*")
    assert may_disable(conn, other, second) is None      # still two active
    users.set_disabled(conn, second["id"], True)
    assert may_disable(conn, other, users.by_id(conn, other["id"])) == SELF_EDIT


def test_the_last_editor_cannot_be_demoted(tmp_path):
    conn = _conn(tmp_path)
    second = _mk(conn, "09120000001", "editor", "*")
    editor = _editor(conn)
    users.set_disabled(conn, second["id"], True)
    # `editor` is now the only active Editor; changing its role to admin would
    # leave the system with no source of edit at all.
    assert may_modify(conn, second, editor, role_id=_role(conn, "admin"),
                      scopes=["*"]) in {LAST_EDITOR, SELF_EDIT}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_invariants.py -q`
Expected: FAIL — `cannot import name 'may_modify'`.

- [ ] **Step 3: Extend the module**

Append to `ui-backend/inja_ui_backend/delegation.py`:

```python
SELF_EDIT = "self_edit"
LAST_EDITOR = "last_editor"


def _active_editor_count(conn: sqlite3.Connection, *, excluding: int | None = None) -> int:
    sql = ("SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id"
           " WHERE u.disabled_at IS NULL AND r.name = 'editor'")
    args: list[object] = []
    if excluding is not None:
        sql += " AND u.id != ?"
        args.append(excluding)
    return int(conn.execute(sql, args).fetchone()[0])


def _is_editor(conn: sqlite3.Connection, user: sqlite3.Row) -> bool:
    row = conn.execute("SELECT name FROM roles WHERE id = ?",
                       (user["role_id"],)).fetchone()
    return bool(row and row["name"] == "editor")


def may_modify(conn: sqlite3.Connection, actor: sqlite3.Row, target: sqlite3.Row, *,
               role_id: int, scopes: list[str]) -> str | None:
    """Judged against the RESULTING user, not the current one."""
    if actor["id"] == target["id"]:
        # Changing your own password from your profile is the sole exception,
        # and it does not come through here.
        return SELF_EDIT
    # The actor must be able to confer what the target would end up with...
    err = may_delegate(conn, actor, role_id=role_id, scopes=scopes)
    if err:
        return err
    # ...and must already be able to reach what the target holds now, or an
    # admin could modify someone whose access exceeds their own.
    err = may_delegate(conn, actor, role_id=target["role_id"],
                       scopes=list(scopes_of(conn, target)))
    if err:
        return err
    if (_is_editor(conn, target)
            and not _is_editor_role(conn, role_id)
            and _active_editor_count(conn, excluding=target["id"]) == 0):
        return LAST_EDITOR
    return None


def _is_editor_role(conn: sqlite3.Connection, role_id: int) -> bool:
    row = conn.execute("SELECT name FROM roles WHERE id = ?", (role_id,)).fetchone()
    return bool(row and row["name"] == "editor")


def may_disable(conn: sqlite3.Connection, actor: sqlite3.Row,
                target: sqlite3.Row) -> str | None:
    """Disabling and re-enabling are changes to access, so they take the same
    checks. Otherwise an admin could disable the only Editor — satisfying D53's
    star-holder invariant while leaving the system with no edit, confirm or
    set_visibility, and the seed as the only way back."""
    if actor["id"] == target["id"]:
        return SELF_EDIT
    err = may_delegate(conn, actor, role_id=target["role_id"],
                       scopes=list(scopes_of(conn, target)))
    if err:
        return err
    if (target["disabled_at"] is None and _is_editor(conn, target)
            and _active_editor_count(conn, excluding=target["id"]) == 0):
        return LAST_EDITOR
    return None
```

Add `from .access import scopes_of` to the imports.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_invariants.py -q`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/delegation.py ui-backend/tests/test_invariants.py
git commit -m "feat(backend): the last editor cannot be taken away

Disabling and re-enabling take the same checks as any other change to access —
an admin re-enabling an editor would be restoring capabilities they do not hold.

And at least one active editor must survive. The star-holder invariant does not
imply it: an admin scoped to everything satisfies that rule while the system has
no edit, confirm or set_visibility at all, and the seed is the only way back."
```

---

### Task 3: Supervisor eligibility

**Files:**
- Modify: `ui-backend/inja_ui_backend/delegation.py`
- Create: `ui-backend/tests/test_supervisors.py`

**Interfaces:**
- Produces: `eligible_supervisors(conn, *, scopes) -> list[sqlite3.Row]`, `supervisor_error(conn, target_id, supervisor_id, scopes) -> str | None`.

**The rule (D52):** eligible = **active**, **and** their scope covers every one of the new user's scopes, **and** (`can_supervise` **or** scope `*`). Reject self, disabled, non-covering, and any choice creating a cycle.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_supervisors.py`:

```python
from inja_ui_backend import db, seed
from inja_ui_backend.delegation import eligible_supervisors, supervisor_error
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _role(conn, name):
    return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]


def _mk(conn, username, role, scopes, *, can_supervise=False, supervisor=None):
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=_role(conn, role),
                       supervisor_id=supervisor, can_supervise=can_supervise)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def _names(rows):
    return {r["username"] for r in rows}


def test_a_department_user_may_be_supervised_by_a_head_or_a_star_holder(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    _mk(conn, "09120000002", "reader", ["dept:dining"])          # no flag
    _mk(conn, "09120000003", "reader", ["dept:cashier"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining"])
    assert _names(got) == {"09120000000", head["username"]}


def test_a_report_scoped_user_has_the_same_candidates(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining/report:steps"])
    assert _names(got) == {"09120000000", head["username"]}


def test_a_two_department_user_needs_someone_who_covers_both(tmp_path):
    # The rule, not the deployment's incidental answer: a can_supervise user
    # holding BOTH departments qualifies by exactly the same test.
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    both = _mk(conn, "09120000002", "reader", ["dept:dining", "dept:cashier"],
               can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining", "dept:cashier"])
    assert _names(got) == {"09120000000", both["username"]}


def test_a_star_scoped_user_may_only_be_supervised_by_a_star_holder(tmp_path):
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["*"])
    assert _names(got) == {"09120000000"}


def test_disabled_users_are_never_eligible(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    users.set_disabled(conn, head["id"], True)
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"])) == {"09120000000"}


def test_the_candidate_list_is_never_empty(tmp_path):
    # Because at least one active * holder always survives (D53).
    conn = _conn(tmp_path)
    assert eligible_supervisors(conn, scopes=["dept:logistics"])


def test_a_cycle_is_refused(tmp_path):
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    b = _mk(conn, "09120000002", "reader", ["dept:dining"], can_supervise=True,
            supervisor=a["id"])
    # a -> b would close the loop a -> b -> a.
    assert supervisor_error(conn, a["id"], b["id"], ["dept:dining"]) == "cycle"


def test_self_supervision_is_refused(tmp_path):
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    assert supervisor_error(conn, a["id"], a["id"], ["dept:dining"]) == "self"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_supervisors.py -q`
Expected: FAIL — `cannot import name 'eligible_supervisors'`.

- [ ] **Step 3: Extend the module**

Append to `ui-backend/inja_ui_backend/delegation.py`:

```python
def eligible_supervisors(conn: sqlite3.Connection, *,
                         scopes: list[str]) -> list[sqlite3.Row]:
    """Active, covering every one of the new user's scopes, and either flagged
    can_supervise or scoped to everything (spec D52).

    can_supervise grants no permissions — with no rank in the model there is
    nothing left to infer org position from, so it is asserted about a person
    rather than derived from what they can do.
    """
    out: list[sqlite3.Row] = []
    for row in conn.execute("SELECT * FROM users WHERE disabled_at IS NULL"):
        their = scopes_of(conn, row)
        if not all(any(contains(s, want) for s in their) for want in scopes):
            continue
        if not (row["can_supervise"] or "*" in their):
            continue
        out.append(row)
    return out


def supervisor_error(conn: sqlite3.Connection, target_id: int | None,
                     supervisor_id: int | None, scopes: list[str]) -> str | None:
    if supervisor_id is None:
        # Optional only for someone who sees everything (D51).
        return None if "*" in scopes else "required"
    if target_id is not None and supervisor_id == target_id:
        return "self"
    if not any(r["id"] == supervisor_id for r in eligible_supervisors(conn, scopes=scopes)):
        return "not_eligible"
    # Walk up from the proposed supervisor; if we reach the target, this closes
    # a loop. Two independent edits can create one that neither saw.
    seen: set[int] = set()
    cur = supervisor_id
    while cur is not None and cur not in seen:
        if cur == target_id:
            return "cycle"
        seen.add(cur)
        row = conn.execute("SELECT supervisor_id FROM users WHERE id = ?",
                           (cur,)).fetchone()
        cur = row["supervisor_id"] if row else None
    return None
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_supervisors.py -q`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/delegation.py ui-backend/tests/test_supervisors.py
git commit -m "feat(backend): who may supervise whom, and why it is a separate axis

can_supervise grants nothing. With no rank left in the model there is nothing to
infer org position from, so it is asserted about a person rather than derived
from what they can do — and a reader may supervise a reader.

Eligibility is the rule, not the deployment's answer to it: a user holding both
departments qualifies to supervise a two-department user by exactly the same
test that today only star-holders happen to pass."
```

---

### Task 4: The user endpoints

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/users.py`, `ui-backend/tests/test_users_api.py`
- Modify: `ui-backend/inja_ui_backend/app.py` (register the router **before** the SPA mount), `models.py`

**Interfaces:**
- Produces:
  - `GET /api/users` — list, `manage_users` required
  - `GET /api/users/{id}` — detail
  - `POST /api/users` — create
  - `PATCH /api/users/{id}` — role, scopes, supervisor, `can_supervise`, display name
  - `POST /api/users/{id}/password` — set directly (D15)
  - `POST /api/users/{id}/disabled` — `{disabled: bool}`
  - `GET /api/users/supervisor-candidates?scope=…` — the eligibility list
  - `GET /api/roles` — read-only; **there is no POST, PATCH or DELETE**

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_users_api.py` covering, at minimum:

```python
def test_an_admin_creates_a_reader(...)               # 201, appears in the list
def test_an_admin_cannot_create_an_editor(...)        # 403
def test_a_reader_cannot_reach_the_user_endpoints(... )  # see Task 5
def test_creating_with_a_persian_number_stores_the_canonical_form(...)
def test_a_duplicate_number_is_refused_even_against_a_disabled_account(...)
def test_a_short_password_is_refused(...)
def test_an_admin_sets_another_users_password_and_it_works(...)
def test_setting_a_password_revokes_all_of_that_users_sessions(...)
def test_disabling_revokes_sessions_immediately(...)
def test_nobody_can_modify_their_own_record(...)      # 403
def test_no_endpoint_creates_edits_or_deletes_a_role(...)  # every verb on /api/roles
def test_every_governance_action_is_recorded(...)     # one audit row each
```

Write each out in full following the idiom in `test_endpoint_matrix.py`. **The role-immutability test must exercise POST, PATCH, PUT and DELETE on `/api/roles` and `/api/roles/{id}` and assert 404 or 405 on every one** — that is spec test 17, and it is what makes the capability table a fixed artefact.

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_users_api.py -q`
Expected: FAIL — 404 on every user endpoint.

- [ ] **Step 3: Write the router**

Create `ui-backend/inja_ui_backend/routers/users.py`. Every write path:

1. resolves the actor via `Depends(requires("manage_users", "*"))` — **note the target is `*`**, because user administration is not scoped to a department; a scoped Admin still passes if their scope covers `*`, which by definition only `*` holders do;
2. normalises any incoming username with `phone.normalise_phone` and rejects anything `USERNAME_RE` refuses;
3. calls `may_delegate` / `may_modify` / `may_disable` and maps the error key to 403 with a Persian message;
4. validates the supervisor with `supervisor_error`;
5. performs the write;
6. records the governance event with `auth.record`.

**Setting another user's password revokes all of that user's sessions** and records `password.set_by_admin`. The actor chooses the value; there is no token and no expiring link (D15). Note in a comment that this makes impersonation *detectable* rather than *prevented*, which is why `manage_users` sits only with Editors and `*`-scoped Admins.

`GET /api/roles` returns id, name and capabilities. Do not add any writing verb.

- [ ] **Step 4: Register the router**

In `app.py`, add `users_router.router` to the unconditional registration block — **before** the SPA catch-all mount, which swallows everything registered after it.

- [ ] **Step 5: Run everything**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add ui-backend
git commit -m "feat(backend): user administration, and a role table nothing can write

Every write goes through the same two checks, then the supervisor rule, then the
record. Setting someone's password revokes their sessions and names the actor —
which makes impersonation detectable rather than prevented, and is why
manage_users sits only with editors and star-scoped admins.

/api/roles reads and nothing more. There is no verb that creates, edits or
deletes one, and a test exercises all four to keep it that way."
```

---

### Task 5: A Reader is served nothing about anyone

**Files:**
- Create: `ui-backend/tests/test_reader_sees_no_users.py`

**Interfaces:** none — a guarantee, expressed as tests.

- [ ] **Step 1: Write it**

```python
"""Spec D54 — the boundary is the administration surface, not a name in content.

A Reader gets no user list, no user detail, no supervisor picker. The one place
another person's name legitimately reaches them is inside a comment they are
entitled to read — which does not exist yet, and belongs to P4.
"""


def test_a_reader_is_refused_every_user_endpoint(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    for path in ["/api/users", "/api/users/1", "/api/users/supervisor-candidates"]:
        assert client.get(path).status_code in (403, 404), path


def test_a_readers_own_session_still_tells_them_about_themselves(data_root, tmp_path):
    # Not a leak: it is their own record, and the shell needs it.
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    body = client.get("/api/auth/me").json()
    assert body["username"] == "09120000009"


def test_no_response_to_a_reader_names_another_user(data_root, tmp_path):
    import json
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    for path in ["/api/departments", "/api/departments/dining/overview",
                 "/api/departments/dining/processes", "/api/auth/me"]:
        r = client.get(path)
        if r.status_code != 200:
            continue
        body = json.dumps(r.json(), ensure_ascii=False)
        assert "09120000000" not in body, f"{path} named the editor"
```

Reuse `_client_as` from `test_endpoint_matrix.py` by importing it, or duplicate it — duplication is acceptable here rather than building a shared fixture for two modules.

- [ ] **Step 2: Run, then commit**

Run: `.venv/bin/pytest ui-backend/tests/test_reader_sees_no_users.py -q`

```bash
git add ui-backend/tests/test_reader_sees_no_users.py
git commit -m "test(backend): a reader learns nothing about anyone else

No list, no detail, no picker — and no response they can reach names another
user. Their own descriptor is not a leak; the shell needs it."
```

---

### Task 6: The user list and detail screens

**Files:**
- Create: `ui/src/api/users.ts`, `ui/src/screens/Users.tsx`, `ui/src/screens/UserDetail.tsx`, `ui/src/screens/users.test.tsx`
- Modify: `ui/src/routes.tsx`, `ui/src/shell/PanelShell.tsx` (a link, shown only with `manage_users`)

**Interfaces:**
- Consumes: F's `DataTable`-less primitives — `Card`, `SearchField`, `StatusPill`, `Button`, `Menu`, `Tabs`; `useCan`.
- Produces: routes `/users` and `/users/:id`.

- [ ] **Step 1: Write the failing test**

Cover: the list renders rows with name, role, supervisor and an active/disabled pill; the search filters; a user without `manage_users` never sees the nav link; opening a row shows the detail; the detail's edit controls are absent for someone who cannot manage that user.

Use the fetch-stubbing idiom from `SignIn.test.tsx`.

- [ ] **Step 2–4:** run red, implement, run green.

Build the screens from F's components only — no new primitives, no literals. Disabled users show a `StatusPill` with `tone="neutral"` and the text «غیرفعال»; a user whose supervisor is disabled shows a warning row, since D14 says that gap is surfaced rather than silently repointed.

- [ ] **Step 5: Verify**

Run: `cd ui && npx vitest run && npx tsc -b && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add ui/src
git commit -m "feat(ui): the user list, and a way into one person's record

Built from the design system's parts only. A disabled supervisor is surfaced on
the row rather than quietly reassigned — the gap is visible instead of being
discovered six months later."
```

---

### Task 7: Creating a user, and picking a supervisor

**Files:**
- Create: `ui/src/screens/NewUserDialog.tsx`, `ui/src/screens/SupervisorPicker.tsx`, tests for both
- Modify: `ui/src/screens/Users.tsx`

**Interfaces:** uses F's `Dialog` and `SearchField`.

- [ ] **Step 1: Write the failing test**

Cover:
- the number field is `type="tel" inputMode="numeric" dir="ltr"` and normalises before submitting;
- the role picker offers **only roles the actor may confer** — the server's list filtered by the same subset rule, so an Admin never sees `editor`;
- the supervisor picker shows each candidate **with their scope beside their name** («علی رضایی — سالن», «مریم احمدی — همهٔ دپارتمان‌ها»), because past thirty users the reason someone appears is otherwise invisible;
- the supervisor field is required unless the new user's scope is `*`;
- a password under six characters is refused without calling the API.

- [ ] **Step 2–4:** run red, implement, run green.

- [ ] **Step 5: Verify and commit**

```bash
git add ui/src
git commit -m "feat(ui): create a user, and say why each supervisor is on the list

Candidates carry their scope beside their name. Past thirty users the reason
someone is eligible is otherwise invisible, and picking blindly is how a chain
ends up routed somewhere nobody intended.

The role picker offers only what the actor may confer, so an admin never sees
editor on the list — the server refuses it anyway, but offering it and then
refusing is worse than not offering it."
```

---

### Task 8: The profile screen

**Files:**
- Create: `ui/src/screens/Profile.tsx`, `ui/src/screens/Profile.test.tsx`
- Modify: `ui/src/routes.tsx`, both shells (a link to it)

**Interfaces:** uses `POST /api/auth/password` from P0a.

- [ ] **Step 1: Write the failing test**

Cover: the three fields are labelled; a mismatch between new and repeat is refused client-side; a password under six characters is refused without calling the API; a successful change shows confirmation; the copy states that **only you can change your own password** and that changing it signs out your other devices.

- [ ] **Step 2–4:** run red, implement, run green.

- [ ] **Step 5: Verify and commit**

```bash
git add ui/src
git commit -m "feat(ui): change your own password, and know what it ends

The screen says that changing it signs out your other devices, because it does —
and a security action whose effects are invisible is one people avoid."
```

---

## Self-Review

**Spec coverage.** D13 → Tasks 1, 2. D14/D53 → Task 2. D51/D52 → Tasks 3, 7. D15 → Tasks 4, 8. D50 → Task 4 (`/api/roles` read-only, all four verbs tested). D54 → Task 5. D57/D58 → Tasks 4, 7, 8. D42 governance events → Task 4. §11 tests 2, 3, 3a, 4, 7, 17 → Tasks 1, 2, 3, 4, 5.

**Deliberately out of scope:** comment routing, which is the only consumer of the supervisor chain (P4) — this plan builds the chain and leaves it unused, which is correct and worth stating so nobody thinks it is dead code; the activity **reports** (P3); content-visibility (P1); `upload`/`run_pipeline`, which do not exist as capabilities at all.

**Two risks worth stating.** Tasks 6–8 are the first screens built entirely from F's component set — if a needed primitive is missing, add it to `ui/src/ui/` with its own test rather than inlining a one-off, or the design system stops being one. And Task 4's router is the largest single new surface in P0; its tests should be written before the router, not after, because a permission endpoint that is wrong in the permissive direction fails silently.

**Placeholder scan.** Tasks 6–8 give test *coverage lists* rather than full test bodies, because the screens' markup depends on F components whose exact props the implementer will read at the time. Every backend task carries complete code. This is a deliberate asymmetry, not an omission — if an implementer wants literal test code for the screens, the idiom is in `ui/src/screens/SignIn.test.tsx` from P0a.

**Type consistency.** `may_delegate`/`may_modify`/`may_disable` all return `str | None` error keys, and the router maps keys to messages in one place. `eligible_supervisors` returns rows; `supervisor_error` takes ids. `scopes_of` returns a tuple and is converted with `list(...)` wherever `may_delegate` expects a list.
