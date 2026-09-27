# P3 — Activity Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the activity record — who read what, what changed the content, how long people were present — and the Panel reports that read it back, plus on-server backups of both SQLite files.

**Architecture:** Everything lives in `ui-backend` (D5 forbids mounting `app.db` anywhere else). New event writers hang off the existing `auth.record`; a git projection and a backup job join the existing 30-second background loop in `comment_jobs.loop`; read-only `/api/activity/*` endpoints serve two new Panel screens built from the shipped `DataTable`, `StatTile`, `Pager`, `Dropdown` and `NavTabTray`.

**Tech Stack:** Python 3.11 stdlib `sqlite3`, FastAPI, `git` CLI · React + TypeScript + Vite, TanStack Query, Tailwind tokens, vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-activity-record-addendum.md` (D76–D85), amending `docs/superpowers/specs/2026-08-04-multi-user-rbac-design.md` §8 (D41–D45, D59, D60). Read both before starting any task.

## Global Constraints

- Work in a git worktree (superpowers:using-git-worktrees), never the main checkout — lili debugs from main. The worktree needs its OWN venv: `make .venv/.installed` at the worktree root; `npm ci` in `ui/`.
- Run only the tests a task names (`.venv/bin/pytest ui-backend/tests/<file> -q`, `cd ui && npx vitest run <file>`), not full sweeps, except Task 14's final check.
- `app.db` and anything copied from it is mounted **only** into `ui-backend` (D5, D82).
- The activity record is append-only: no code path may `UPDATE` or `DELETE` `audit_events` (D45).
- No `/api/activity` response ever carries a raw session id (a live one is a bearer credential) or comment text (D44). Sessions appear only as `audit.session_tag(sid)` — 6 hex chars.
- Iran time is fixed UTC+03:30 (`TEHRAN_OFFSET_S = 12600`, no DST since 2022). A "day" is `(at + 12600) // 86400`, on both sides.
- ui-backend never imports the engine (`tests/test_layering.py`).
- UI matches `ui/design/Inja Panel.dc.html` (audit screen L2343–2466, one-user screen L2468–2602) with existing tokens only — no invented colours; nothing already in the shipped UI moves.
- Every user-visible string is Persian. Event labels in Task 12 are proposals lili confirms.
- Commit after every task; end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A deliberate shortcut with a known ceiling carries a `ponytail:` comment naming the ceiling.

## File map

| File | Change | Responsibility |
|---|---|---|
| `ui-backend/inja_ui_backend/db.py` | modify | migration 4 |
| `ui-backend/inja_ui_backend/store/sessions.py` | modify | activity intervals; `revoked_at` |
| `ui-backend/inja_ui_backend/store/audit.py` | modify | `AGENT`, `seen_since`, `session_tag` |
| `ui-backend/inja_ui_backend/store/confirmations.py` | modify | re-confirm clears `emitted_for_sha` |
| `ui-backend/inja_ui_backend/auth.py` | modify | `record_view`, `record_edit`, `record_revoked` |
| `ui-backend/inja_ui_backend/gitcommit.py` | modify | `Acted-By` trailer |
| `ui-backend/inja_ui_backend/facts_store.py` | modify | `first_department` |
| `ui-backend/inja_ui_backend/routers/{processes,departments,facts,auth,users}.py` | modify | call the new writers |
| `ui-backend/inja_ui_backend/projection.py` | create | git → content events, staleness (D79, D80) |
| `ui-backend/inja_ui_backend/backups.py` | create | twice-daily `.backup` + rotation (D82) |
| `ui-backend/inja_ui_backend/comment_jobs.py` | modify | the loop runs projection + backups |
| `ui-backend/inja_ui_backend/config.py` | modify | `BACKUP_DIR` |
| `ui-backend/inja_ui_backend/store/activity.py` | create | catalogue + report queries |
| `ui-backend/inja_ui_backend/routers/activity.py` | create | `/api/activity/*` |
| `ui-backend/inja_ui_backend/app.py` | modify | register the router |
| `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml` | modify | `/backups` mount |
| `ui/src/api/activity.ts` | create | types + hooks |
| `ui/src/auth/useSession.ts` | modify | 60-second heartbeat |
| `ui/src/lib/format.ts` | modify | `dayOf`, `jalaliDay`, `whenFa`, `durationFa` |
| `ui/src/lib/events.ts` | create | event labels, kinds, permission-field wording |
| `ui/src/ui/JalaliCalendar.tsx` | create | month grid day picker |
| `ui/src/screens/Activity.tsx` | create | five tabs |
| `ui/src/screens/UserActivity.tsx` | create | one user |
| `ui/src/routes.tsx`, `ui/src/shell/PanelShell.tsx` | modify | routes, menu entry |
| `ARD.md`, `docs/runbooks/02-secrets-and-auth.md`, `docs/runbooks/05-operations.md` | modify | docs |

---

### Task 1: Migration 4 and presence intervals (D81)

**Files:**
- Modify: `ui-backend/inja_ui_backend/db.py` (append to `MIGRATIONS`; bring the module docstring's table count up to date)
- Modify: `ui-backend/inja_ui_backend/store/sessions.py`
- Modify: `ui-backend/tests/test_db.py` (literal `3`s at ~L232, ~L262, ~L408 → `db.SCHEMA_VERSION`)
- Test: `ui-backend/tests/test_presence.py` (create)

**Interfaces:**
- Produces: tables `activity_intervals(id, session_id, started_at, ended_at)`, `projection_state(id=1, sha)`; column `confirmations.emitted_for_sha`; index `audit_session`; `sessions.IDLE_S = 300`; `sessions.touch_interval(conn, session_id: str, now: int) -> None` (called by `sessions.resolve`).

- [ ] **Step 1: Write the failing test** — `ui-backend/tests/test_presence.py`

```python
"""Presence is active time, not time since sign-in (spec D43, addendum D81,
§11 test 27 — the server half; the client half is ui/src/auth/useSession.test.tsx)."""
from inja_ui_backend import db
from inja_ui_backend.store import sessions


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO roles (id, name, capabilities) VALUES (1, 'reader', '[]')")
    conn.execute("INSERT INTO users (id, username, display_name, password_hash, role_id)"
                 " VALUES (1, '09120000001', 'x', 'h', 1)")
    return conn


def _intervals(conn, sid):
    return [(r["started_at"], r["ended_at"]) for r in conn.execute(
        "SELECT started_at, ended_at FROM activity_intervals WHERE session_id = ?"
        " ORDER BY id", (sid,))]


def test_requests_within_five_minutes_extend_one_interval(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, 1, ip="", user_agent="", now=1000)
    for t in (1000, 1060, 1120, 1420):          # 1420 - 1120 = 300: still inside
        assert sessions.resolve(conn, sid, ttl=86400, now=t) is not None
    assert _intervals(conn, sid) == [(1000, 1420)]


def test_a_gap_ends_the_interval_at_its_last_request(tmp_path):
    """A hidden tab sends nothing: the interval ends at 1060, its last request,
    not at 1361 when the gap was noticed."""
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, 1, ip="", user_agent="", now=1000)
    for t in (1000, 1060, 1361, 1400):
        sessions.resolve(conn, sid, ttl=86400, now=t)
    assert _intervals(conn, sid) == [(1000, 1060), (1361, 1400)]


def test_a_refused_session_records_no_presence(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, 1, ip="", user_agent="", now=1000)
    sessions.revoke(conn, sid, now=1001)
    assert sessions.resolve(conn, sid, ttl=86400, now=1002) is None
    assert _intervals(conn, sid) == []


def test_migration_4_adds_the_p3_storage(tmp_path):
    conn = _conn(tmp_path)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(confirmations)")}
    assert "emitted_for_sha" in cols
    tables = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")}
    assert {"activity_intervals", "projection_state", "audit_session"} <= tables
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_presence.py -q`
Expected: FAIL — `no such table: activity_intervals`.

- [ ] **Step 3: Add migration 4** — append to `MIGRATIONS` in `db.py` after the `(3, ...)` entry:

```python
    (4, """
        -- D81: presence as intervals — one row per stretch of signed-in
        -- requests no more than `sessions.IDLE_S` apart. Not audit events:
        -- one row per working session, extended in place.
        CREATE TABLE activity_intervals (
            id         INTEGER PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id),
            started_at INTEGER NOT NULL,
            ended_at   INTEGER NOT NULL
        );
        CREATE INDEX activity_intervals_session ON activity_intervals (session_id, id);
        -- D77: the 30-minute view window is looked up per session.
        CREATE INDEX audit_session ON audit_events (session_id, at);
        -- D80: the HEAD at which this confirmation going stale was announced,
        -- so the same transition is never announced twice. A notification
        -- marker, never the state: confirmed-ness is always the live
        -- fingerprint comparison (D20).
        ALTER TABLE confirmations ADD COLUMN emitted_for_sha TEXT;
        -- D79: the projection's marker, one row — the last data-repo commit
        -- projected into the activity record.
        CREATE TABLE projection_state (
            id  INTEGER PRIMARY KEY CHECK (id = 1),
            sha TEXT NOT NULL
        );
    """),
```

- [ ] **Step 4: Extend intervals from `sessions.resolve`** — in `store/sessions.py`, add below `issue`:

```python
#: D43/D81: an interval stays open while requests keep arriving within this gap.
IDLE_S = 300


def touch_interval(conn: sqlite3.Connection, session_id: str, now: int) -> None:
    """Extend the session's open activity interval, or open a new one (D81).

    Called on every signed-in request (`resolve`), so an interval ends at its
    last request by construction — D43's "backdated to the last heartbeat",
    with nothing to backdate. The heartbeat is the SPA's 60-second refetch of
    `/api/auth/me`, which TanStack Query pauses while the tab is hidden.
    """
    row = conn.execute(
        "SELECT id, ended_at FROM activity_intervals WHERE session_id = ?"
        " ORDER BY id DESC LIMIT 1", (session_id,)).fetchone()
    if row is not None and now - row["ended_at"] <= IDLE_S:
        conn.execute("UPDATE activity_intervals SET ended_at = ? WHERE id = ?",
                     (now, row["id"]))
    else:
        conn.execute("INSERT INTO activity_intervals (session_id, started_at, ended_at)"
                     " VALUES (?, ?, ?)", (session_id, now, now))
```

and in `resolve`, directly after `conn.execute("UPDATE sessions SET last_seen = ? WHERE id = ?", (now, session_id))`:

```python
    touch_interval(conn, session_id, now)
```

- [ ] **Step 5: Fix the migration literals** — in `tests/test_db.py`, replace each `== 3` that is a *migrate() return or schema_version* assertion (≈L232, L262, L408) with `== db.SCHEMA_VERSION`.

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_presence.py ui-backend/tests/test_db.py ui-backend/tests/test_sessions.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/db.py ui-backend/inja_ui_backend/store/sessions.py ui-backend/tests/test_presence.py ui-backend/tests/test_db.py
git commit -m "feat(activity): migration 4 and presence intervals (D81)"
```

---

### Task 2: `session.revoked` (D78)

**Files:**
- Modify: `ui-backend/inja_ui_backend/store/sessions.py`, `ui-backend/inja_ui_backend/store/audit.py`, `ui-backend/inja_ui_backend/auth.py`, `ui-backend/inja_ui_backend/routers/auth.py` (`change_password`), `ui-backend/inja_ui_backend/routers/users.py` (`set_user_disabled`, `set_user_password`)
- Test: `ui-backend/tests/test_session_revoked.py` (create)

**Interfaces:**
- Produces: `sessions.revoked_at(conn, user_id: int, now: int) -> list[str]`; `audit.session_tag(sid: str | None) -> str | None`; `audit.AGENT = "agent:control-bot"`; `auth.record_revoked(request, *, actor: str, user_id: int, username: str, now: int) -> None`.

- [ ] **Step 1: Write the failing test** — `ui-backend/tests/test_session_revoked.py`

```python
"""`session.revoked` — one row per session an act ended (D42, addendum D78)."""
import json

from fastapi.testclient import TestClient

from inja_ui_backend import db
from inja_ui_backend.auth import COOKIE_NAME
from inja_ui_backend.tests_helpers import _PW, _USERNAME, audit_events, signed_in_client


def _user_id(app_db, display_name):
    conn = db.connect(app_db)
    try:
        return conn.execute("SELECT id FROM users WHERE display_name = ?",
                            (display_name,)).fetchone()[0]
    finally:
        conn.close()


def test_a_password_change_records_each_other_session_it_ended(data_root, tmp_path):
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    other = TestClient(client.app, base_url="https://testserver")
    assert other.post("/api/auth/login",
                      json={"username": _USERNAME, "password": _PW}).status_code == 200
    r = client.post("/api/auth/password", json={"current": _PW, "next": "new-pass-1"})
    assert r.status_code == 204
    client.app_db = cfg.app_db
    rows = audit_events(client, "session.revoked")
    assert len(rows) == 1
    assert rows[0]["actor"] == _USERNAME and rows[0]["target"] == _USERNAME
    tag = json.loads(rows[0]["detail"])["session"]
    assert len(tag) == 6 and other.cookies.get(COOKIE_NAME) not in rows[0]["detail"]


def test_disabling_records_the_sessions_it_ended(people):
    uid = _user_id(people["editor"].app_db, "other")
    r = people["editor"].post(f"/api/users/{uid}/disabled", json={"disabled": True})
    assert r.status_code == 200
    rows = audit_events(people["editor"], "session.revoked")
    assert [row["target"] for row in rows] == ["09150000005"]


def test_an_admin_setting_a_password_records_every_session_it_ended(people):
    uid = _user_id(people["editor"].app_db, "viewer")
    r = people["editor"].post(f"/api/users/{uid}/password", json={"password": "abcdef"})
    assert r.status_code == 204
    assert [row["target"] for row in audit_events(people["editor"], "session.revoked")] \
        == ["09150000004"]
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_session_revoked.py -q`
Expected: FAIL — `assert 0 == 1` (nothing writes `session.revoked`).

- [ ] **Step 3: Store helpers** — `store/sessions.py`, below `revoke_all_for_user`:

```python
def revoked_at(conn: sqlite3.Connection, user_id: int, now: int) -> list[str]:
    """`user_id`'s sessions revoked at exactly `now` — the ones the act that
    just ran with this `now` ended, for their `session.revoked` rows (D78).

    ponytail: keyed on the second, so two acts on one account inside the same
    second would each record both; return ids from the UPDATE (`RETURNING`)
    if that ever matters.
    """
    return [r["id"] for r in conn.execute(
        "SELECT id FROM sessions WHERE user_id = ? AND revoked_at = ? ORDER BY id",
        (user_id, now))]
```

`store/audit.py` — add `import hashlib` at the top, then below the module docstring imports:

```python
#: The Telegram runtime's actor — stamped by the outbox drain (D59) and by the
#: git projection for chat edits (D60), never read from anything it wrote.
AGENT = "agent:control-bot"


def session_tag(session_id: str | None) -> str | None:
    """A session as the record may show it: 6 hex chars of its SHA-256.

    A live session id is a bearer credential, so no report ever returns one;
    the tag still lets a reader see which rows came from the same session.
    """
    if not session_id:
        return None
    return hashlib.sha256(session_id.encode()).hexdigest()[:6]
```

In `comment_jobs.py` replace `AGENT = "agent:control-bot"` with `AGENT = audit.AGENT`.

- [ ] **Step 4: The writer** — `auth.py`, after `record`:

```python
def record_revoked(request: Request, *, actor: str, user_id: int, username: str,
                   now: int) -> None:
    """`session.revoked` for each of `username`'s sessions the act at `now`
    ended (D42, addendum D78) — tagged, never the id itself."""
    for sid in sessions.revoked_at(get_conn(request), user_id, now):
        record(request, "session.revoked", actor=actor,
               session_id=getattr(request.state, "session_id", None),
               target=username, detail={"session": audit.session_tag(sid)})
```

- [ ] **Step 5: Call it**

`routers/auth.py` `change_password` — compute `now` once and pass it:

```python
    now = int(time.time())
    problem = await anyio.to_thread.run_sync(
        functools.partial(apply_password_change, get_conn(request), user,
                          body.current, body.next, now=now,
                          keep_session=request.state.session_id),
        limiter=_VERIFY_LIMITER)
    ...
    record(request, "password.changed", actor=user["username"],
           session_id=request.state.session_id)
    record_revoked(request, actor=user["username"], user_id=user["id"],
                   username=user["username"], now=now)
```

(import `record_revoked` from `..auth` beside `record`.)

`routers/users.py` `set_user_disabled` — inside `if changed:` after the `user.disabled`/`user.enabled` record:

```python
        if body.disabled:
            record_revoked(request, actor=user["username"], user_id=target["id"],
                           username=target["username"], now=now)
```

`set_user_password` — after the `password.set_by_admin` record:

```python
    record_revoked(request, actor=user["username"], user_id=target["id"],
                   username=target["username"], now=now)
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_session_revoked.py ui-backend/tests/test_password.py ui-backend/tests/test_users_api.py ui-backend/tests/test_comment_jobs.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A ui-backend
git commit -m "feat(activity): session.revoked names each session an act ended (D78)"
```

---

### Task 3: View events (D77)

**Files:**
- Modify: `ui-backend/inja_ui_backend/store/audit.py`, `ui-backend/inja_ui_backend/auth.py`, `ui-backend/inja_ui_backend/routers/processes.py` (`get_process`), `ui-backend/inja_ui_backend/routers/departments.py` (`get_overview`, `list_processes`)
- Test: `ui-backend/tests/test_view_events.py` (create)

**Interfaces:**
- Produces: `audit.seen_since(conn, *, session_id, action, target, since) -> bool`; `auth.VIEW_WINDOW_S = 1800`; `auth.record_view(request, user, action: str, target: str) -> None`.

- [ ] **Step 1: Write the failing test** — `ui-backend/tests/test_view_events.py`

```python
"""View events are written by the server, once per session per target per 30
minutes (D42, addendum D77). The `people` cast confirms cooking-001 and the
cooking overview, so a Reader is served both."""
import time

from inja_ui_backend import auth
from inja_ui_backend.tests_helpers import audit_events


def test_opening_a_process_twice_is_one_view(people):
    for _ in range(2):
        assert people["viewer"].get("/api/processes/cooking-001").status_code == 200
    rows = audit_events(people["viewer"], "process.viewed")
    assert [(r["actor"], r["target"]) for r in rows] == [("09150000004", "cooking-001")]


def test_the_department_page_is_one_view_across_its_requests(people):
    people["viewer"].get("/api/departments/cooking/overview")
    people["viewer"].get("/api/departments/cooking/processes")
    assert len(audit_events(people["viewer"], "department.viewed")) == 1


def test_a_second_person_counts_separately(people):
    people["viewer"].get("/api/processes/cooking-001")
    people["other"].get("/api/processes/cooking-001")
    assert len(audit_events(people["viewer"], "process.viewed")) == 2


def test_the_window_reopens_after_thirty_minutes(people, monkeypatch):
    people["viewer"].get("/api/processes/cooking-001")
    later = time.time() + auth.VIEW_WINDOW_S + 1
    monkeypatch.setattr(auth.time, "time", lambda: later)
    people["viewer"].get("/api/processes/cooking-001")
    assert len(audit_events(people["viewer"], "process.viewed")) == 2


def test_a_404_writes_nothing(people):
    assert people["viewer"].get("/api/processes/cashier-001").status_code == 404
    assert audit_events(people["viewer"], "process.viewed") == []
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_view_events.py -q`
Expected: FAIL — empty `process.viewed` lists.

- [ ] **Step 3: The window query** — `store/audit.py`:

```python
def seen_since(conn: sqlite3.Connection, *, session_id: str, action: str,
               target: str, since: int) -> bool:
    """Whether this session already has `action` on `target` after `since` —
    D77's window, served by the `audit_session (session_id, at)` index."""
    return conn.execute(
        "SELECT 1 FROM audit_events WHERE session_id = ? AND at > ?"
        " AND action = ? AND target = ? LIMIT 1",
        (session_id, since, action, target)).fetchone() is not None
```

- [ ] **Step 4: The writer** — `auth.py` (add `import threading` at the top):

```python
#: D77: one view event per session per target inside this window. TanStack
#: Query refetches on focus and remount, so an event per fetch would make
#: "how often" a measure of tab-switching.
VIEW_WINDOW_S = 1800
# ponytail: process-local lock, so the overview and process-list requests a
# department page fires together cannot both pass the check. One uvicorn
# worker (D6); a second worker needs a unique index instead.
_VIEW_LOCK = threading.Lock()


def record_view(request: Request, user: sqlite3.Row, action: str, target: str) -> None:
    """`department.viewed` / `process.viewed`, written when the server answers
    the request a screen makes — never reported by the browser (D77)."""
    sid = request.state.session_id
    now = int(time.time())
    with _VIEW_LOCK:
        if audit.seen_since(get_conn(request), session_id=sid, action=action,
                            target=target, since=now - VIEW_WINDOW_S):
            return
        record(request, action, actor=user["username"], session_id=sid, target=target)
```

- [ ] **Step 5: Call it after the resource is known servable**

- `routers/processes.py` `get_process`: immediately before its final `return`, add `record_view(request, user, "process.viewed", pid)` (import `record_view` from `..auth`).
- `routers/departments.py` `get_overview`: immediately before `return shown.redact_overview(doc, code)`, add `record_view(request, user, "department.viewed", code)`.
- `routers/departments.py` `list_processes`: compute the response into a local, record, return:

```python
    shown = Disclosure(request.app.state.db, user)
    docs = shown.servable(storage.ordered_processes(cfg.data_root, code), code)
    record_view(request, user, "department.viewed", code)
    return [shown.redact(d, code) for d in docs]
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_view_events.py ui-backend/tests/test_departments.py ui-backend/tests/test_access.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A ui-backend
git commit -m "feat(activity): the server writes department and process views, once per 30 minutes (D77)"
```

---

### Task 4: Edits made in the app, and the `Acted-By` trailer (D78)

**Files:**
- Modify: `ui-backend/inja_ui_backend/gitcommit.py`, `ui-backend/inja_ui_backend/auth.py`, `ui-backend/inja_ui_backend/facts_store.py`, `ui-backend/inja_ui_backend/routers/processes.py` (`create_process`, `delete_process`, `save_process`, `resolve`), `ui-backend/inja_ui_backend/routers/departments.py` (`put_overview`, `put_order`), `ui-backend/inja_ui_backend/routers/facts.py` (`resolve_fact` + its docstring)
- Modify: `ui-backend/tests/test_gitcommit.py` (pass `actor=`), `ui-backend/tests/test_facts_write_and_download.py` (`test_a_resolve_runs_the_engine_and_serves_the_settled_entry`)
- Test: `ui-backend/tests/test_edit_events.py` (create)

**Interfaces:**
- Produces: `gitcommit.commit(cfg, paths, pid, action, *, actor: str) -> None` (writes trailer `Acted-By: {actor}`); `auth.record_edit(request, user, action: str, target: str, change: str, **detail) -> None`; `facts_store.first_department(entry: dict | None) -> str | None`.

`POST /api/processes/{pid}/relayout` writes nothing to disk (it returns a laid-out document the client then saves), so it records nothing — Task 10's route table says so.

- [ ] **Step 1: Write the failing test** — `ui-backend/tests/test_edit_events.py`

```python
"""Edits made in the app are recorded with the real user, and their commits
say who acted (addendum D78; D48)."""
import json
import subprocess

from inja_ui_backend.tests_helpers import _USERNAME, audit_events, signed_in_client


def _client(data_root, tmp_path):
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    client.app_db = cfg.app_db
    return client


def _changes(client, action):
    return [(r["target"], json.loads(r["detail"])["change"])
            for r in audit_events(client, action)]


def test_saving_a_process_records_an_update_and_signs_the_commit(data_root, tmp_path):
    client = _client(data_root, tmp_path)
    doc = client.get("/api/processes/cooking-001").json()
    doc["name"] = "نام تازه"
    assert client.put("/api/processes/cooking-001", json=doc).status_code == 200
    assert _changes(client, "process.edited") == [("cooking-001", "updated")]
    trailer = subprocess.run(
        ["git", "-C", str(data_root), "log", "-1",
         "--format=%(trailers:key=Acted-By,valueonly,separator=)"],
        capture_output=True, text=True, check=True).stdout.strip()
    assert trailer == _USERNAME


def test_create_and_delete_record_their_change(data_root, tmp_path):
    client = _client(data_root, tmp_path)
    r = client.post("/api/processes", json={"department": "cooking", "name": "تازه"})
    assert r.status_code == 201
    pid = r.json()["id"]
    assert client.delete(f"/api/processes/{pid}").status_code == 200
    assert _changes(client, "process.edited") == [(pid, "created"), (pid, "deleted")]


def test_overview_and_order_are_department_edits(data_root, tmp_path):
    client = _client(data_root, tmp_path)
    ov = client.get("/api/departments/cooking/overview").json()
    assert client.put("/api/departments/cooking/overview", json=ov).status_code == 200
    assert client.put("/api/departments/cooking/order",
                      json={"order": ["cooking-001"]}).status_code == 200
    assert _changes(client, "department.edited") == [("cooking", "updated"),
                                                     ("cooking", "updated")]
```

(If the delete route answers 204 rather than 200 in this codebase, assert what `tests/test_processes*.py` asserts for it.)

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_edit_events.py -q`
Expected: FAIL — no `process.edited` rows; trailer empty.

- [ ] **Step 3: The trailer** — `gitcommit.commit`:

```python
def commit(cfg: Settings, paths: list[Path], pid: str, action: str, *,
           actor: str) -> None:
```

and replace the message/commit lines at the end with:

```python
    # D48: the commit says who acted. A trailer, so `git log
    # --format=%(trailers:key=Acted-By)` reads it back — the git projection
    # credits a confirmation's going stale to it (addendum D80).
    r = _git(cfg, "-c", f"user.name={cfg.git_author_name}",
             "-c", f"user.email={cfg.git_author_email}",
             "commit", "-q", "-m", f"ui-edit({pid}): {action}",
             "-m", f"Acted-By: {actor}")
```

In `tests/test_gitcommit.py`, add `actor="09120000000"` to all six `gitcommit.commit(...)` calls, and add:

```python
def test_the_commit_carries_an_acted_by_trailer(data_root, tmp_path):
    cfg = cfg_for(data_root, tmp_path / "app.db")
    p = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    p.write_text(p.read_text(encoding="utf-8") + " ", encoding="utf-8")
    gitcommit.commit(cfg, [p], "cooking-001", "save", actor="09121234567")
    body = subprocess.run(["git", "-C", str(data_root), "log", "-1", "--format=%B"],
                          capture_output=True, text=True, check=True).stdout
    assert body.splitlines()[0] == "ui-edit(cooking-001): save"
    assert "Acted-By: 09121234567" in body
```

(match the imports the file already uses for `cfg_for` and `subprocess`.)

- [ ] **Step 4: `first_department` and `record_edit`**

`facts_store.py`, after `load_all`:

```python
def first_department(entry: dict | None) -> str | None:
    """The department a fact's activity-record events are filed under (addendum
    D76): the first, alphabetically, its `scope` names — `None` for a universal
    entry, which makes its events `*`-only under D44. Tolerates the same
    malformed shapes `routers/facts._targets` does."""
    scope = entry.get("scope") if isinstance(entry, dict) else None
    depts = scope.get("departments") if isinstance(scope, dict) else None
    named = sorted(d for d in depts or [] if isinstance(d, str) and d)
    return named[0] if named else None
```

`auth.py`, after `record_view`:

```python
def record_edit(request: Request, user: sqlite3.Row, action: str, target: str,
                change: str, **detail) -> None:
    """`process.edited` / `department.edited` / `fact.edited` for a write made
    in the app (addendum D78). `change` is created, updated or deleted."""
    record(request, action, actor=user["username"],
           session_id=request.state.session_id, target=target,
           detail={"change": change, **detail})
```

- [ ] **Step 5: Call it from every content write** (import `record_edit` from `..auth` in each router)

`routers/processes.py`:
- `create_process`: `gitcommit.commit(cfg, written, pid, action, actor=user["username"])`, then inside the same block:
```python
        record_edit(request, user, "process.edited", pid, "created")
        if body.parent:
            record_edit(request, user, "process.edited", body.parent["process"], "updated")
```
- `delete_process`: rename its `_=Depends(requires("edit", _pid_target))` to `user=Depends(...)`; then:
```python
    gitcommit.commit(cfg, written, pid, "delete process", actor=user["username"])
    for p in written:
        if p.parent.name == "processes" and p.stem != pid:
            record_edit(request, user, "process.edited", p.stem, "updated")
    record_edit(request, user, "process.edited", pid, "deleted")
```
- `save_process`: `gitcommit.commit(cfg, [path], pid, "save", actor=user["username"])` then `record_edit(request, user, "process.edited", pid, "updated")`.
- `resolve` (pending): same with `f"{body.decision} pending #{index}"`, then `record_edit(request, user, "process.edited", pid, "updated")` before its `return`.

`routers/departments.py` — rename `_` to `user` in `put_overview` and `put_order`:
- `put_overview`: `gitcommit.commit(cfg, [path], code, "update overview", actor=user["username"])` then `record_edit(request, user, "department.edited", code, "updated")`.
- `put_order`: `gitcommit.commit(cfg, [path], code, "update process order", actor=user["username"])` then `record_edit(request, user, "department.edited", code, "updated")`.

`routers/facts.py` `resolve_fact`:
```python
        gitcommit.commit(cfg, [cfg.data_root / "facts", run], fid,
                         f"facts resolve {body.field}", actor=user["username"])
        record_edit(request, user, "fact.edited", fid, "updated",
                    department=facts_store.first_department(entry))
```
and replace the docstring paragraph beginning "No activity-record event of its own." with: "`fact.edited` is recorded here with the real user (addendum D78). The run directory stays the record of *why* the store moved; the activity row is the record *that* it moved, by whom."

In `test_a_resolve_runs_the_engine_and_serves_the_settled_entry`, after its existing assertions add (with `audit_events` imported from `inja_ui_backend.tests_helpers`, and `client.app_db` set if the test's client lacks it):
```python
    rows = audit_events(client, "fact.edited")
    assert [(r["target"], json.loads(r["detail"])["change"]) for r in rows] \
        == [(FID, "updated")]
```
where `FID` is the id that test resolves.

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_edit_events.py ui-backend/tests/test_gitcommit.py ui-backend/tests/test_facts_write_and_download.py ui-backend/tests/test_order.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A ui-backend
git commit -m "feat(activity): edits made in the app are recorded, and ui-edit commits say who acted (D78)"
```

---

### Task 5: The git projection — content events (D79)

**Files:**
- Create: `ui-backend/inja_ui_backend/projection.py`
- Test: `ui-backend/tests/test_projection.py` (create)

**Interfaces:**
- Consumes: `gitcommit._git(cfg, *args)`, `gitcommit.head(cfg)`, `audit.record`, `audit.AGENT`, `facts_store.first_department`, `db.connect`, table `projection_state` (Task 1).
- Produces: `projection.run(cfg) -> int` (events written; safe to call concurrently), `projection.SYSTEM = "system:projection"`. Task 6 adds staleness inside `run`; Task 7 calls `run` from the loop; Task 8 calls it before every report.

- [ ] **Step 1: Write the failing tests** — `ui-backend/tests/test_projection.py`

```python
"""Content events projected from the data-repo's git history (spec D60,
addendum D79; §11 test 16b)."""
import json
import subprocess

import pytest

from inja_ui_backend import db, projection
from inja_ui_backend.tests_helpers import cfg_for


@pytest.fixture
def cfg(data_root, tmp_path):
    c = cfg_for(data_root, tmp_path / "app.db")
    conn = db.connect(c.app_db)
    db.migrate(conn)
    conn.close()
    return c


def _git(root, *args):
    return subprocess.run(["git", "-C", str(root), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


def _commit(root, subject, author="deploy", body=None):
    _git(root, "add", "-A")
    args = ["-c", f"user.name={author}", "-c", "user.email=x@x", "commit", "-q",
            "-m", subject]
    if body:
        args += ["-m", body]
    _git(root, *args)
    return _git(root, "rev-parse", "HEAD")


def _rename(root, pid, name):
    p = root / "departments" / pid.rsplit("-", 1)[0] / "processes" / f"{pid}.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["name"] = name
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


def _rows(cfg, action):
    conn = db.connect(cfg.app_db)
    try:
        return [(r["actor"], r["target"], json.loads(r["detail"] or "{}"))
                for r in conn.execute("SELECT actor, target, detail FROM audit_events"
                                      " WHERE action = ? ORDER BY id", (action,))]
    finally:
        conn.close()


def _marker(cfg):
    conn = db.connect(cfg.app_db)
    try:
        return conn.execute("SELECT sha FROM projection_state").fetchone()[0]
    finally:
        conn.close()


def test_the_first_run_seeds_at_head_and_projects_no_history(cfg, data_root):
    _rename(data_root, "cooking-001", "پیش از P3")
    head = _commit(data_root, "chat-edit(cooking-001): old")
    assert projection.run(cfg) == 0
    assert _marker(cfg) == head and _rows(cfg, "process.edited") == []


def test_a_chat_edit_is_the_agents_and_a_second_pass_adds_nothing(cfg, data_root):
    projection.run(cfg)
    _rename(data_root, "cooking-001", "ویرایش چت")
    sha = _commit(data_root, "chat-edit(cooking-001): rename")
    assert projection.run(cfg) == 1
    assert _rows(cfg, "process.edited") == [
        ("agent:control-bot", "cooking-001", {"change": "updated", "commit": sha})]
    assert projection.run(cfg) == 0


def test_a_pipeline_commit_names_its_run(cfg, data_root):
    projection.run(cfg)
    run = data_root / "runs" / "cooking" / "20260927-101500"
    run.mkdir(parents=True)
    (run / "meta.json").write_text("{}", encoding="utf-8")
    _rename(data_root, "cooking-001", "از جلسه")
    _commit(data_root, "pipeline(cooking): 1 processes from 1 transcripts")
    projection.run(cfg)
    assert _rows(cfg, "process.edited")[0][0] == "run:cooking/20260927-101500"


def test_a_quantify_commit_names_exactly_the_facts_it_changed(cfg, data_root):
    projection.run(cfg)
    run = data_root / "runs" / "facts" / "cooking" / "20260927-101500"
    run.mkdir(parents=True)
    (run / "meta.json").write_text("{}", encoding="utf-8")
    path = data_root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["entries"][0]["title"] = "عنوان تازه"                     # F-00001
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    _commit(data_root, "quantify(cooking): 0 created, 1 updated")
    projection.run(cfg)
    rows = _rows(cfg, "fact.edited")
    assert [(a, t, d["change"], d["department"]) for a, t, d in rows] == [
        ("run:facts/cooking/20260927-101500", "F-00001", "updated", "cooking")]


def test_a_ui_edit_commit_writes_no_edit_event(cfg, data_root):
    projection.run(cfg)
    _rename(data_root, "cooking-001", "از پنل")
    _commit(data_root, "ui-edit(cooking-001): save", author="ui-edit",
            body="Acted-By: 09120000000")
    projection.run(cfg)
    assert _rows(cfg, "process.edited") == []


def test_a_persons_commit_is_theirs(cfg, data_root):
    projection.run(cfg)
    _rename(data_root, "cooking-001", "بازنشانی")
    _commit(data_root, "reset(cooking): back to seed", author="lili")
    projection.run(cfg)
    assert _rows(cfg, "process.edited")[0][0] == "git:lili"


def test_overview_and_order_in_one_commit_are_one_department_event(cfg, data_root):
    projection.run(cfg)
    ov = data_root / "departments" / "cooking" / "overview.json"
    ov.write_text(ov.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    (data_root / "departments" / "cooking" / "order.json").write_text(
        '{"order": ["cooking-001"]}\n', encoding="utf-8")
    _commit(data_root, "restructure(cooking): reorder")
    projection.run(cfg)
    assert [(a, t) for a, t, _ in _rows(cfg, "department.edited")] == [
        ("agent:control-bot", "cooking")]


def test_created_and_deleted_processes(cfg, data_root):
    projection.run(cfg)
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    new = src.with_name("cooking-002.json")
    new.write_text(src.read_text(encoding="utf-8").replace("cooking-001", "cooking-002"),
                   encoding="utf-8")
    _commit(data_root, "chat-edit(cooking-002): add")
    new.unlink()
    _commit(data_root, "chat-edit(cooking-002): remove")
    projection.run(cfg)
    assert [(t, d["change"]) for _, t, d in _rows(cfg, "process.edited")] == [
        ("cooking-002", "created"), ("cooking-002", "deleted")]


def test_a_merge_projects_its_commits_once_and_itself_never(cfg, data_root):
    projection.run(cfg)
    _git(data_root, "checkout", "-q", "-b", "side")
    _rename(data_root, "cooking-001", "از شاخه")
    _commit(data_root, "chat-edit(cooking-001): side")
    _git(data_root, "checkout", "-q", "-")
    _git(data_root, "-c", "user.name=lili", "-c", "user.email=x@x",
         "merge", "-q", "--no-ff", "-m", "merge: side", "side")
    projection.run(cfg)
    assert len(_rows(cfg, "process.edited")) == 1


def test_a_rewritten_history_is_recorded_and_reseeded(cfg, data_root):
    projection.run(cfg)
    conn = db.connect(cfg.app_db)
    conn.execute("UPDATE projection_state SET sha = ?", ("0" * 40,))
    conn.close()
    assert projection.run(cfg) == 1
    assert _rows(cfg, "projection.discontinuity")[0][0] == projection.SYSTEM
    assert _marker(cfg) == _git(data_root, "rev-parse", "HEAD")
    assert _rows(cfg, "process.edited") == []
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_projection.py -q`
Expected: FAIL — `ModuleNotFoundError: inja_ui_backend.projection`.

- [ ] **Step 3: Write `projection.py`**

```python
"""Content events projected from the data-repo's git history (spec D60;
addendum D79, D80).

A pipeline `merge` run and a chat edit change content with `ui-backend`
uninvolved. Git already records both, so instead of coupling the engine to the
activity record, this walks `git log` from the last projected commit and writes
one event per id touched per commit, timestamped by the commit.

Runs every 30 seconds in `comment_jobs.loop` and before every activity report.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time

from . import db, facts_store, gitcommit
from .store import audit

log = logging.getLogger(__name__)

#: The actor of the events the projection writes about itself.
SYSTEM = "system:projection"
_PROC = re.compile(r"^departments/([a-z]+)/processes/([a-z]+-[0-9]{3})\.json$")
_DEPT = re.compile(r"^departments/([a-z]+)/(?:overview|order)\.json$")
_FACTS = re.compile(r"^facts/(?:records|measurements|rules|notes)\.json$")
_RUN = re.compile(r"^runs/(facts/)?([a-z]+)/([0-9]{8}-[0-9]{6})/")
#: Commit kinds the Telegram runtime makes (ARD §15 and the data-repo's own
#: history since): each is the agent's, whoever the git author is — the server
#: authors `chat-edit` and `ui-edit` under the same identity.
_AGENT_KINDS = {"chat-edit", "restructure", "audit-fix", "edit-fact"}
_CHANGE = {"A": "created", "M": "updated", "D": "deleted"}
#: One record per commit: sha, commit time, author, subject, Acted-By trailer.
_FMT = "%x1e%H%x1f%ct%x1f%an%x1f%s%x1f%(trailers:key=Acted-By,valueonly,separator=)"
# ponytail: process-local lock — the loop thread and a report request may both
# call run(). One uvicorn worker (D6); a second worker needs a claim in app.db.
_LOCK = threading.Lock()


def _marker(conn) -> str | None:
    row = conn.execute("SELECT sha FROM projection_state WHERE id = 1").fetchone()
    return row["sha"] if row is not None else None


def _set_marker(conn, sha: str) -> None:
    conn.execute("INSERT INTO projection_state (id, sha) VALUES (1, ?)"
                 " ON CONFLICT(id) DO UPDATE SET sha = excluded.sha", (sha,))


def _commits(cfg, since: str) -> list[dict]:
    """Every non-merge commit after `since`, oldest first. `--no-merges` walks
    the commits a merge brings in, each once, and never the merge itself, whose
    diff against its first parent would count them twice."""
    r = gitcommit._git(cfg, "log", "--no-merges", "--reverse", "--no-renames",
                       "--name-status", f"--format={_FMT}", f"{since}..HEAD")
    if r.returncode != 0:
        raise RuntimeError(f"git log failed: {(r.stderr or r.stdout).strip()}")
    out = []
    for block in r.stdout.split("\x1e")[1:]:
        head, _, body = block.partition("\n")
        sha, at, author, subject, acted = head.split("\x1f")
        files = [(line.split("\t", 1)[0][:1], line.split("\t", 1)[1])
                 for line in body.splitlines() if "\t" in line]
        out.append({"sha": sha, "at": int(at), "author": author, "subject": subject,
                    "acted_by": acted.strip(), "files": files})
    return out


def _kind(subject: str) -> str:
    return re.split(r"[(:]", subject, maxsplit=1)[0].strip()


def _actor(c: dict) -> str | None:
    """Who the edit events of commit `c` name — `None` for a `ui-edit` commit,
    whose endpoint already recorded the edit with the real user (D78)."""
    kind = _kind(c["subject"])
    if kind == "ui-edit":
        return None
    if kind in ("pipeline", "quantify"):
        for _, path in c["files"]:
            m = _RUN.match(path)
            if m and bool(m.group(1)) == (kind == "quantify"):
                return f"run:{m.group(1) or ''}{m.group(2)}/{m.group(3)}"
        return f"run:{kind}"        # no run directory in the commit: invent no stamp
    if kind in _AGENT_KINDS:
        return audit.AGENT
    return f"git:{c['author']}"


def _entries_at(cfg, rev: str, path: str) -> dict[str, dict]:
    r = gitcommit._git(cfg, "show", f"{rev}:{path}")
    if r.returncode != 0:
        return {}                   # absent at that revision, or no parent at all
    try:
        doc = json.loads(r.stdout)
    except ValueError:
        return {}
    entries = doc.get("entries") if isinstance(doc, dict) else None
    return {e["id"]: e for e in entries or []
            if isinstance(e, dict) and isinstance(e.get("id"), str)}


def _fact_changes(cfg, sha: str, path: str):
    """(id, change, department) for every entry of `path` commit `sha` changed —
    compared entry by entry, because facts share four aggregate files."""
    before, after = _entries_at(cfg, f"{sha}^", path), _entries_at(cfg, sha, path)
    for fid in sorted(before.keys() | after.keys()):
        b, a = before.get(fid), after.get(fid)
        if b == a:
            continue
        change = "created" if b is None else "deleted" if a is None else "updated"
        yield fid, change, facts_store.first_department(a or b)


def _touched(cfg, c: dict) -> list[tuple[str, str, str, dict]]:
    """(action, target, change, extra) — one per id commit `c` touched. An id
    touched twice in one commit (overview + order; a fact moving between kind
    files) is one event, `updated` when the two changes disagree."""
    found: dict[tuple[str, str], tuple[str, dict]] = {}

    def add(action, target, change, extra):
        key = (action, target)
        if key in found and found[key][0] != change:
            change = "updated"
        found[key] = (change, extra)

    for status, path in c["files"]:
        change = _CHANGE.get(status, "updated")
        if m := _PROC.match(path):
            add("process.edited", m.group(2), change, {})
        elif m := _DEPT.match(path):
            add("department.edited", m.group(1), "updated", {})
        elif _FACTS.match(path):
            for fid, fchange, dept in _fact_changes(cfg, c["sha"], path):
                add("fact.edited", fid, fchange, {"department": dept})
    return [(a, t, ch, ex) for (a, t), (ch, ex) in found.items()]


def _seed(cfg, conn, head: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        _set_marker(conn, head)
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise


def run(cfg) -> int:
    """Project every commit since the marker; return how many events were written."""
    with _LOCK:
        head = gitcommit.head(cfg)
        if not head:
            return 0
        conn = db.connect(cfg.app_db)
        try:
            marker = _marker(conn)
            if marker is None:
                # First start: seeded at HEAD, so months of history are not
                # projected backdated as though it had been watching (D60).
                _seed(cfg, conn, head)
                return 0
            if marker == head:
                return 0
            if gitcommit._git(cfg, "merge-base", "--is-ancestor",
                              marker, head).returncode != 0:
                # A revert, rebase or force-push: do not guess. Record the gap,
                # re-seed, emit nothing for it (D60, addendum D79).
                audit.record(conn, actor=SYSTEM, action="projection.discontinuity",
                             now=int(time.time()), detail={"from": marker, "to": head})
                _seed(cfg, conn, head)
                return 1
            commits = _commits(cfg, marker)
            rows = []
            for c in commits:
                actor = _actor(c)
                if actor is None:
                    continue
                for action, target, change, extra in _touched(cfg, c):
                    rows.append((c["at"], actor, action, target,
                                 {"change": change, "commit": c["sha"], **extra}))
            conn.execute("BEGIN IMMEDIATE")
            try:
                for at, actor, action, target, detail in rows:
                    audit.record(conn, actor=actor, action=action, now=at,
                                 target=target, detail=detail)
                _set_marker(conn, head)
                conn.execute("COMMIT")
            except BaseException:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
            return len(rows)
        finally:
            conn.close()
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_projection.py -q`
Expected: PASS. If `%(trailers:…)` leaves a trailing newline on the header line, `head.split("\x1f")` still yields five fields because the newline belongs to `body`; if a test shows otherwise, strip `head` before splitting.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/projection.py ui-backend/tests/test_projection.py
git commit -m "feat(activity): content events projected from the data-repo's history (D79)"
```

---

### Task 6: A confirmation going stale (D80)

**Files:**
- Modify: `ui-backend/inja_ui_backend/projection.py`, `ui-backend/inja_ui_backend/store/confirmations.py`
- Test: `ui-backend/tests/test_projection_staleness.py` (create); add one test to `ui-backend/tests/test_confirmations_store.py`

**Interfaces:**
- Consumes: `fingerprint.fingerprint`, `fingerprint.fact_fingerprint`, `storage.proc_path`, `storage.overview_path`, `facts_store.load_all`, column `confirmations.emitted_for_sha`.
- Produces: `projection.run` also writes `confirmation.invalidated`; `confirmations.set_confirmation` clears `emitted_for_sha` on every upsert.

- [ ] **Step 1: Write the failing tests** — `ui-backend/tests/test_projection_staleness.py`

```python
"""`confirmation.invalidated` — written once per transition, only by the
projection (spec D60, addendum D80; §11 test 16b)."""
import json
import subprocess

import pytest

from inja_ui_backend import db, projection
from inja_ui_backend.fingerprint import fact_fingerprint, fingerprint
from inja_ui_backend.store import confirmations
from inja_ui_backend.tests_helpers import cfg_for

PID = "cooking-001"


@pytest.fixture
def cfg(data_root, tmp_path):
    c = cfg_for(data_root, tmp_path / "app.db")
    conn = db.connect(c.app_db)
    db.migrate(conn)
    conn.close()
    return c


def _commit(root, subject, author="deploy", body=None):
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    args = ["git", "-C", str(root), "-c", f"user.name={author}", "-c", "user.email=x@x",
            "commit", "-q", "-m", subject] + (["-m", body] if body else [])
    subprocess.run(args, check=True)
    return subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                          capture_output=True, text=True).stdout.strip()


def _path(root):
    return root / "departments" / "cooking" / "processes" / f"{PID}.json"


def _set_name(root, name):
    doc = json.loads(_path(root).read_text(encoding="utf-8"))
    doc["name"] = name
    _path(root).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


def _confirm(cfg, target, fp):
    conn = db.connect(cfg.app_db)
    confirmations.set_confirmation(conn, target=target, fingerprint=fp, by="0912", at=1)
    conn.close()


def _invalidated(cfg):
    conn = db.connect(cfg.app_db)
    try:
        return [(r["actor"], r["target"]) for r in conn.execute(
            "SELECT actor, target FROM audit_events"
            " WHERE action = 'confirmation.invalidated' ORDER BY id")]
    finally:
        conn.close()


def _emitted(cfg, target):
    conn = db.connect(cfg.app_db)
    try:
        return conn.execute("SELECT emitted_for_sha FROM confirmations WHERE target = ?",
                            (target,)).fetchone()[0]
    finally:
        conn.close()


def _confirm_current(cfg, root):
    _confirm(cfg, PID, fingerprint(json.loads(_path(root).read_text(encoding="utf-8"))))


def test_one_event_per_transition_and_none_on_later_passes(cfg, data_root):
    _confirm_current(cfg, data_root)
    original = json.loads(_path(data_root).read_text(encoding="utf-8"))["name"]
    projection.run(cfg)                                          # seeds
    _set_name(data_root, "یک")
    _commit(data_root, "chat-edit(cooking-001): one")
    projection.run(cfg)
    _set_name(data_root, "دو")
    _commit(data_root, "chat-edit(cooking-001): two")
    projection.run(cfg)
    projection.run(cfg)
    assert _invalidated(cfg) == [("agent:control-bot", PID)]
    _set_name(data_root, original)                               # back to what was vouched for
    _commit(data_root, "chat-edit(cooking-001): revert")
    projection.run(cfg)
    assert _emitted(cfg, PID) is None and len(_invalidated(cfg)) == 1
    _set_name(data_root, "سه")
    _commit(data_root, "chat-edit(cooking-001): three")
    projection.run(cfg)
    assert len(_invalidated(cfg)) == 2                           # a new transition


def test_a_save_in_the_app_announces_the_confirmation_it_broke(cfg, data_root):
    _confirm_current(cfg, data_root)
    projection.run(cfg)
    _set_name(data_root, "از پنل")
    _commit(data_root, "ui-edit(cooking-001): save", author="ui-edit",
            body="Acted-By: 09121112222")
    projection.run(cfg)
    assert _invalidated(cfg) == [("09121112222", PID)]


def test_seeding_marks_what_is_already_stale_without_announcing_it(cfg, data_root):
    _confirm(cfg, PID, "not-the-current-fingerprint")
    projection.run(cfg)
    head = subprocess.run(["git", "-C", str(data_root), "rev-parse", "HEAD"],
                          check=True, capture_output=True, text=True).stdout.strip()
    assert _invalidated(cfg) == [] and _emitted(cfg, PID) == head


def test_a_fact_confirmation_goes_stale_too(cfg, data_root):
    path = data_root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    _confirm(cfg, "F-00001", fact_fingerprint(doc["entries"][0]))
    projection.run(cfg)
    doc["entries"][0]["statement"] = "بیان تازه"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    _commit(data_root, "edit-fact(F-00001): statement")
    projection.run(cfg)
    assert _invalidated(cfg) == [("agent:control-bot", "F-00001")]
```

Add to `tests/test_confirmations_store.py` (reuse that file's connection fixture/helper):

```python
def test_reconfirming_clears_the_staleness_marker(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    confirmations.set_confirmation(conn, target="cooking-001", fingerprint="a", by="x", at=1)
    conn.execute("UPDATE confirmations SET emitted_for_sha = 'abc'")
    confirmations.set_confirmation(conn, target="cooking-001", fingerprint="b", by="x", at=2)
    assert conn.execute("SELECT emitted_for_sha FROM confirmations").fetchone()[0] is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_projection_staleness.py ui-backend/tests/test_confirmations_store.py -q`
Expected: FAIL — no `confirmation.invalidated` rows; marker not cleared.

- [ ] **Step 3: Re-confirming clears the marker** — in `store/confirmations.set_confirmation`, extend the `ON CONFLICT` update list with one line:

```python
        " data_repo_commit = excluded.data_repo_commit,"
        " emitted_for_sha = NULL",
```

(the preceding line gains the trailing comma shown).

- [ ] **Step 4: Staleness in the projection** — in `projection.py` add to the imports `from . import storage` and `from .fingerprint import fact_fingerprint, fingerprint`, add `_FACT_ID = re.compile(r"^F-[0-9]{5}$")` beside the other patterns, then add:

```python
def _current(cfg, targets: list[str]) -> dict[str, str | None]:
    """Each confirmation target's fingerprint now — `None` when it is gone.

    The kind test is `routers/confirmations._kind`'s, restated in two lines
    rather than imported: a router is not something the background loop
    depends on. Facts are loaded once for the lot, not once per target.
    """
    facts = None
    out: dict[str, str | None] = {}
    for t in targets:
        if _FACT_ID.fullmatch(t):
            if facts is None:
                facts = {e.get("id"): e for e in facts_store.load_all(cfg.data_root)}
            out[t] = fact_fingerprint(facts[t]) if t in facts else None
        else:
            path = (storage.proc_path(cfg.data_root, t) if "-" in t
                    else storage.overview_path(cfg.data_root, t))
            out[t] = fingerprint(storage.read_json(path)) if path.is_file() else None
    return out


def _staleness(cfg, conn, head: str, credit: dict, fallback: tuple, *,
               announce: bool) -> int:
    """Compare every confirmation with its target's content at HEAD (D80).

    A new mismatch writes `confirmation.invalidated` once — credited to the
    newest commit in the batch that touched the target — and marks the row with
    `emitted_for_sha`. A match clears the mark silently: the content is back to
    what was vouched for. With `announce=False` (seeding) mismatches are marked
    and nothing is written, so old staleness is not announced as new.

    ponytail: measured at HEAD, not per commit — when two commits land within
    one pass the event is credited to the later. Per-commit fingerprints would
    mean reading every confirmed document out of every commit.
    """
    rows = conn.execute(
        "SELECT target, fingerprint, emitted_for_sha FROM confirmations").fetchall()
    now_fp = _current(cfg, [r["target"] for r in rows])
    n = 0
    for r in rows:
        stale = now_fp[r["target"]] != r["fingerprint"]
        if stale and r["emitted_for_sha"] is None:
            if announce:
                sha, at, actor = credit.get(r["target"], fallback)
                audit.record(conn, actor=actor, action="confirmation.invalidated",
                             now=at, target=r["target"], detail={"commit": sha})
                n += 1
            conn.execute("UPDATE confirmations SET emitted_for_sha = ? WHERE target = ?",
                         (head, r["target"]))
        elif not stale and r["emitted_for_sha"] is not None:
            conn.execute("UPDATE confirmations SET emitted_for_sha = NULL WHERE target = ?",
                         (r["target"],))
    return n
```

Change `_seed` to mark what is already stale:

```python
def _seed(cfg, conn, head: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        _staleness(cfg, conn, head, {}, (head, 0, SYSTEM), announce=False)
        _set_marker(conn, head)
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
```

In `run`, replace the commit loop and the transaction body with:

```python
            commits = _commits(cfg, marker)
            rows, credit = [], {}
            for c in commits:
                actor = _actor(c)
                # ui-edit commits write no edit event, but ARE checked for
                # staleness — credited to the person in their Acted-By trailer.
                credited = actor or c["acted_by"] or f"git:{c['author']}"
                for action, target, change, extra in _touched(cfg, c):
                    credit[target] = (c["sha"], c["at"], credited)
                    if actor is not None:
                        rows.append((c["at"], actor, action, target,
                                     {"change": change, "commit": c["sha"], **extra}))
            last = commits[-1] if commits else None
            fallback = ((head, last["at"], _actor(last) or last["acted_by"]
                         or f"git:{last['author']}") if last
                        else (head, int(time.time()), SYSTEM))
            conn.execute("BEGIN IMMEDIATE")
            try:
                for at, actor, action, target, detail in rows:
                    audit.record(conn, actor=actor, action=action, now=at,
                                 target=target, detail=detail)
                n = len(rows) + _staleness(cfg, conn, head, credit, fallback,
                                           announce=True)
                _set_marker(conn, head)
                conn.execute("COMMIT")
            except BaseException:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
            return n
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_projection_staleness.py ui-backend/tests/test_projection.py ui-backend/tests/test_confirmations_store.py ui-backend/tests/test_confirmations_api.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A ui-backend
git commit -m "feat(activity): a confirmation going stale is announced once, at HEAD (D80)"
```

---

### Task 7: The loop runs the projection and the backups (D82); the mount boundary (§11 tests 20, 29)

**Files:**
- Create: `ui-backend/inja_ui_backend/backups.py`
- Modify: `ui-backend/inja_ui_backend/config.py` (`backup_dir`), `ui-backend/inja_ui_backend/comment_jobs.py` (`loop`, module docstring), `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml`
- Test: `ui-backend/tests/test_backups.py`, `ui-backend/tests/test_compose_mounts.py` (create)

**Interfaces:**
- Consumes: `projection.run(cfg)` (Task 5/6).
- Produces: `Settings.backup_dir: Optional[Path]` (env `BACKUP_DIR`; refused inside `DATA_ROOT`); `backups.HOURS = (11, 23)`, `backups.KEEP = 14`, `backups.slot(now: float) -> str`, `backups.maybe_run(cfg, now: float | None = None) -> bool`.

- [ ] **Step 1: Write the failing tests**

`ui-backend/tests/test_backups.py`:

```python
"""Twice-daily copies of both SQLite files on the server (spec D8, addendum
D82; §11 test 29)."""
import dataclasses
import os
import sqlite3
import time

import pytest

from inja_ui_backend import backups, comments_db, db
from inja_ui_backend.config import load_settings
from inja_ui_backend.tests_helpers import cfg_for, seed_editor


@pytest.fixture(autouse=True)
def utc(monkeypatch):
    monkeypatch.setenv("TZ", "UTC")
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


def _at(stamp: str) -> float:          # "2026-09-27 12:30" in UTC
    return time.mktime(time.strptime(stamp, "%Y-%m-%d %H:%M"))


@pytest.fixture
def cfg(data_root, tmp_path):
    c = cfg_for(data_root, tmp_path / "app.db", tmp_path / "comments.db")
    seed_editor(c)
    comments_db.open_comments(c.comments_db).close()
    return dataclasses.replace(c, backup_dir=tmp_path / "backups")


def test_the_slot_is_the_latest_scheduled_hour():
    assert backups.slot(_at("2026-09-27 12:30")) == "20260927-1100"
    assert backups.slot(_at("2026-09-27 23:05")) == "20260927-2300"
    assert backups.slot(_at("2026-09-27 03:00")) == "20260926-2300"


def test_a_backup_restores_to_both_files(cfg):
    assert backups.maybe_run(cfg, now=_at("2026-09-27 12:30")) is True
    app = cfg.backup_dir / "app-20260927-1100.db"
    cmts = cfg.backup_dir / "comments-20260927-1100.db"
    assert sqlite3.connect(app).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert sqlite3.connect(cmts).execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0
    assert oct(os.stat(app).st_mode & 0o777) == "0o600"


def test_a_slot_is_taken_once(cfg):
    backups.maybe_run(cfg, now=_at("2026-09-27 12:30"))
    assert backups.maybe_run(cfg, now=_at("2026-09-27 22:59")) is False
    assert backups.maybe_run(cfg, now=_at("2026-09-27 23:00")) is True


def test_rotation_keeps_the_newest_fourteen_of_each(cfg):
    cfg.backup_dir.mkdir()
    for day in range(1, 16):
        for name in ("app", "comments"):
            (cfg.backup_dir / f"{name}-202609{day:02d}-1100.db").write_bytes(b"")
    backups.maybe_run(cfg, now=_at("2026-09-27 12:30"))
    for name in ("app", "comments"):
        kept = sorted(p.name for p in cfg.backup_dir.glob(f"{name}-*.db"))
        assert len(kept) == backups.KEEP and kept[-1] == f"{name}-20260927-1100.db"


def test_no_backup_dir_means_no_backups(cfg):
    assert backups.maybe_run(dataclasses.replace(cfg, backup_dir=None)) is False


def test_a_backup_dir_inside_data_root_is_refused(data_root, tmp_path):
    env = {"DATA_ROOT": str(data_root), "SCHEMA_DIR": str(tmp_path),
           "SESSION_SIGNING_KEY": "k", "APP_DB": str(tmp_path / "app.db"),
           "BACKUP_DIR": str(data_root / "backups")}
    with pytest.raises(RuntimeError, match="BACKUP_DIR must not be inside DATA_ROOT"):
        load_settings(env)
```

`ui-backend/tests/test_compose_mounts.py`:

```python
"""`app.db` — and every copy of it — is mounted only into ui-backend (spec D5,
addendum D82; §11 test 20). Only this test covers the boundary the outbox and
the backup job exist to preserve."""
import pathlib

import pytest
import yaml

DEPLOY = pathlib.Path(__file__).resolve().parents[2] / "deploy"


@pytest.mark.parametrize("name,sources", [
    ("docker-compose.yml", {"ui-state", "/opt/inja/backups"}),
    ("docker-compose.local.yml", {"local-ui-state", "local-ui-backups"}),
])
def test_app_db_and_its_backups_are_mounted_only_into_ui_backend(name, sources):
    services = yaml.safe_load((DEPLOY / name).read_text(encoding="utf-8"))["services"]
    holders = {svc for svc, spec in services.items()
               for v in spec.get("volumes") or []
               if isinstance(v, str) and v.split(":")[0] in sources}
    assert holders == {"ui-backend"}
    mounted = {v.split(":")[0] for v in services["ui-backend"]["volumes"]
               if isinstance(v, str)}
    assert sources <= mounted
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_backups.py ui-backend/tests/test_compose_mounts.py -q`
Expected: FAIL — no module `backups`; the compose files have no backups mount.

- [ ] **Step 3: `BACKUP_DIR`** — `config.py`: add to `Settings` after `comments_db`:

```python
    #: Where the twice-daily `.backup` copies of both SQLite files go (addendum
    #: D82). Optional: unset — tests, a local run — means no backups.
    backup_dir: Optional[Path]
```

In `load_settings`, before `return Settings(`:

```python
    backup_dir = Path(env["BACKUP_DIR"]) if env.get("BACKUP_DIR") else None
    if backup_dir is not None:
        resolved_bak = backup_dir.resolve()
        if resolved_bak == resolved_root or resolved_root in resolved_bak.parents:
            raise RuntimeError(
                f"BACKUP_DIR must not be inside DATA_ROOT: {resolved_bak} is inside"
                f" {resolved_root}. A backup of app.db holds every password hash;"
                " DATA_ROOT is readable by the pipeline runtime and gets pushed.")
```

and pass `backup_dir=backup_dir,` in the `Settings(...)` call.

- [ ] **Step 4: Write `backups.py`**

```python
"""Twice-daily copies of app.db and comments.db, on the server (spec D8;
addendum D82).

Run by `comment_jobs.loop` inside ui-backend — never a container of its own,
which would have to mount app.db, the one thing D5 forbids. This protects
against a corrupted database or a bad deploy, NOT against losing the host:
NFR-16's off-site half stays unmet, and docs/runbooks/05-operations.md says so.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import time
from pathlib import Path

log = logging.getLogger(__name__)

#: The git-push crontab's hours (`deploy/git-push/crontab`: `0 11,23 * * *`),
#: read in the container's local time as busybox crond reads them.
HOURS = (11, 23)
KEEP = 14


def slot(now: float) -> str:
    """The latest scheduled slot at or before `now`, as `YYYYmmdd-HH00`."""
    t = time.localtime(now)
    past = [h for h in HOURS if h <= t.tm_hour]
    if past:
        return time.strftime("%Y%m%d-", t) + f"{past[-1]:02d}00"
    return time.strftime("%Y%m%d-", time.localtime(now - 86400)) + f"{HOURS[-1]:02d}00"


def _copy(src: Path, dst: Path) -> None:
    """`.backup`, not a file copy: both files are in WAL mode, and a copy taken
    mid-write can be torn. Written beside the target and renamed, so a crash
    never leaves a file that looks finished."""
    tmp = dst.with_suffix(".tmp")
    s, d = sqlite3.connect(str(src)), sqlite3.connect(str(tmp))
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()
    os.chmod(tmp, 0o600)                 # app.db is a file of password hashes
    os.replace(tmp, dst)


def maybe_run(cfg, now: float | None = None) -> bool:
    """Back both files up if the current slot has none yet; keep the newest
    `KEEP` of each. Whether a slot is due is read from the files themselves, so
    a restart neither skips nor repeats one. `app-*` is written last, so its
    presence means the slot is complete."""
    if cfg.backup_dir is None:
        return False
    out = cfg.backup_dir
    out.mkdir(parents=True, exist_ok=True)
    s = slot(time.time() if now is None else now)
    if (out / f"app-{s}.db").exists():
        return False
    _copy(cfg.comments_db, out / f"comments-{s}.db")
    _copy(cfg.app_db, out / f"app-{s}.db")
    for name in ("app", "comments"):
        for old in sorted(out.glob(f"{name}-*.db"))[:-KEEP]:
            old.unlink()
    log.info("state backup %s written to %s", s, out)
    return True
```

- [ ] **Step 5: Run them from the loop** — `comment_jobs.py`: add `from . import backups, projection` to the imports, change the module docstring's first line to `"""Background work: the D59 outbox drain, the D63 reconcile, the git projection (D79) and the state backups (D82).`, and replace `loop` with:

```python
def loop(cfg, stop: threading.Event) -> None:
    """Every `INTERVAL` seconds, until `stop` is set: the comment tick, the git
    projection and the backup check — each guarded, so one failing never stops
    the others."""
    jobs = (("comment tick", tick), ("git projection", projection.run),
            ("state backup", backups.maybe_run))
    while True:
        for name, job in jobs:
            try:
                job(cfg)
            except Exception:                   # keep the loop alive; log and retry
                log.exception("%s failed", name)
        if stop.wait(INTERVAL):
            return
```

- [ ] **Step 6: Mount it** — `deploy/docker-compose.yml`, `ui-backend` service: add to `environment` after `COMMENTS_DB`:

```yaml
      # Twice-daily `.backup` copies of app.db and comments.db (addendum D82).
      # On the host, NOT off-site: see docs/runbooks/05-operations.md.
      BACKUP_DIR: /backups
```

and to `volumes` after `- ui-state:/state`:

```yaml
      # copies of app.db — mounted ONLY here, exactly like ui-state (D5, D82)
      - /opt/inja/backups:/backups
```

`deploy/docker-compose.local.yml`, `ui-backend`: the same `BACKUP_DIR: /backups` line, `- local-ui-backups:/backups` under volumes, and `local-ui-backups:` under the top-level `volumes:` with the comment `# app.db/comments.db backups — ui-backend only (D5, D82).`

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_backups.py ui-backend/tests/test_compose_mounts.py ui-backend/tests/test_config.py ui-backend/tests/test_comment_jobs.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A ui-backend deploy
git commit -m "feat(activity): the loop projects git and backs up both databases on the server (D82)"
```

---

### Task 8: The report API — the `*`-only tabs (D83)

**Files:**
- Create: `ui-backend/inja_ui_backend/store/activity.py`, `ui-backend/inja_ui_backend/routers/activity.py`
- Modify: `ui-backend/inja_ui_backend/app.py` (register before the SPA mount)
- Test: `ui-backend/tests/test_activity_api.py` (create)

**Interfaces:**
- Consumes: `access.requires`, `access.reachable_departments`, `comment_jobs.drain`, `projection.run`, `audit.session_tag`, `sessions.IDLE_S` (not needed), tables from Task 1.
- Produces (JSON, camelCase, times are unix seconds):
  - `GET /api/activity/users` → `ActivityUser[]` = `{id, username, displayName, role, scopes: string[], disabled, logins, failures, sessions, activeSeconds, lastSeen: number|null}`
  - `GET /api/activity/users/{id}?day=&kind=&outcome=&offset=` → `{user: ActivityUser, total, rows: ActivityEvent[], days: {[day: string]: number}, sessions: ActivitySession[]}`; `ActivityEvent = {id, at, action, kind: 'access'|'content'|'governance', target: string|null, ip, userAgent, outcome, session: string|null}`; `ActivitySession = {session, issuedAt, lastSeen, ip, userAgent, activeSeconds, state: 'active'|'revoked'|'expired'}`; page size 6, newest first.
  - `GET /api/activity/failures` → `{username, ip, attempts, first, last}[]`
  - `GET /api/activity/permissions` → `{at, actor, action, subject, before, after}[]` (actor/subject are display names where the username is known)
  - `store/activity.CATALOGUE: dict[str, str]` (event → `access|content|governance`), `store/activity.PERMISSIONS`, `store/activity.TEHRAN_OFFSET_S = 12600`, `store/activity.PAGE = 6`.

- [ ] **Step 1: Write the failing tests** — `ui-backend/tests/test_activity_api.py`

```python
"""The activity reports (addendum D83). `people`: editor (*), admin (*),
cadmin (admin, dept:cashier), head/viewer/other (readers, cooking)."""
import json

from inja_ui_backend import db
from inja_ui_backend.auth import COOKIE_NAME


def _uid(people, name):
    conn = db.connect(people["editor"].app_db)
    try:
        return conn.execute("SELECT id FROM users WHERE display_name = ?",
                            (name,)).fetchone()[0]
    finally:
        conn.close()


def test_every_user_is_listed_with_their_counts(people):
    rows = people["editor"].get("/api/activity/users").json()
    viewer = next(r for r in rows if r["displayName"] == "viewer")
    assert viewer["logins"] == 1 and viewer["sessions"] == 1
    assert viewer["role"] == "reader" and viewer["scopes"] == ["dept:cooking"]
    assert set(viewer) == {"id", "username", "displayName", "role", "scopes", "disabled",
                           "logins", "failures", "sessions", "activeSeconds", "lastSeen"}


def test_one_users_events_filter_and_never_carry_a_session_id(people):
    people["viewer"].get("/api/processes/cooking-001")
    uid = _uid(people, "viewer")
    body = people["editor"].get(f"/api/activity/users/{uid}").json()
    assert [r["action"] for r in body["rows"]] == ["process.viewed", "login.success"]
    assert body["total"] == 2 and sum(body["days"].values()) == 2
    content = people["editor"].get(f"/api/activity/users/{uid}?kind=content").json()
    assert [r["action"] for r in content["rows"]] == ["process.viewed"]
    assert people["editor"].get(f"/api/activity/users/{uid}?outcome=fail").json()["total"] == 0
    sid = people["viewer"].cookies.get(COOKIE_NAME)
    raw = people["editor"].get(f"/api/activity/users/{uid}").text
    assert sid not in raw and len(body["rows"][0]["session"]) == 6
    assert body["sessions"][0]["state"] == "active"


def test_a_bad_filter_is_refused(people):
    uid = _uid(people, "viewer")
    assert people["editor"].get(f"/api/activity/users/{uid}?kind=secret").status_code == 422


def test_failed_sign_ins_group_by_username_and_ip(people):
    for _ in range(2):
        people["other"].post("/api/auth/login",
                             json={"username": "09159999999", "password": "nope-nope"})
    rows = people["editor"].get("/api/activity/failures").json()
    row = next(r for r in rows if r["username"] == "09159999999")
    assert row["attempts"] == 2 and row["first"] <= row["last"]


def test_permission_history_names_people_and_values(people):
    uid = _uid(people, "other")
    people["editor"].post(f"/api/users/{uid}/disabled", json={"disabled": True})
    rows = people["editor"].get("/api/activity/permissions").json()
    assert rows[0] == {"at": rows[0]["at"], "actor": "editor", "action": "user.disabled",
                       "subject": "other", "before": False, "after": True}


def test_the_star_tabs_are_404_to_a_scoped_admin_and_a_reader(people):
    uid = _uid(people, "viewer")
    for who in ("cadmin", "viewer"):
        for path in ("/api/activity/users", f"/api/activity/users/{uid}",
                     "/api/activity/failures", "/api/activity/permissions"):
            assert people[who].get(path).status_code == 404, (who, path)


def test_a_report_drains_and_projects_first(people, monkeypatch):
    from inja_ui_backend import comment_jobs, projection
    calls = []
    monkeypatch.setattr(comment_jobs, "drain", lambda *a: calls.append("drain"))
    monkeypatch.setattr(projection, "run", lambda cfg: calls.append("project"))
    people["editor"].get("/api/activity/users")
    assert calls == ["drain", "project"]
```

(The `people` fixture's usernames are `0915000000N` in cast order.)

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_activity_api.py -q`
Expected: FAIL — 404 on every `/api/activity` path.

- [ ] **Step 3: Write `store/activity.py`**

```python
"""Queries behind the activity reports (spec D44; addendum D83).

Read-only. Nothing here returns a raw session id (a live one is a bearer
credential — `audit.session_tag` instead) or a comment's text (D44).
"""
from __future__ import annotations

import json
import sqlite3

from . import audit

#: D42 as amended by D76 — every event the record holds, by the one-user page's
#: three kinds. `tests/test_activity_catalogue.py` pins it against the writers.
CATALOGUE: dict[str, str] = {
    "login.success": "access", "login.failure": "access", "login.throttled": "access",
    "logout": "access", "session.revoked": "access", "password.changed": "access",
    "access.denied": "access",
    "department.viewed": "content", "process.viewed": "content",
    "report.downloaded": "content", "process.edited": "content",
    "department.edited": "content", "fact.edited": "content",
    "confirmation.set": "content", "confirmation.revoked": "content",
    "confirmation.invalidated": "content",
    "user.created": "governance", "user.modified": "governance",
    "user.disabled": "governance", "user.enabled": "governance",
    "password.set_by_admin": "governance", "role.assigned": "governance",
    "scope.granted": "governance", "scope.revoked": "governance",
    "supervisor.changed": "governance", "supervisor_flag.changed": "governance",
    "visibility.policy.changed": "governance",
    "comment.created": "governance", "comment.edited": "governance",
    "comment.withdrawn": "governance", "comment.approved": "governance",
    "comment.noted": "governance", "comment.rejected": "governance",
    "comment.addressed": "governance", "projection.discontinuity": "governance",
}
#: The permission-history tab: every change to who may do what. `user.modified`
#: is left out — its permission fields each have their own event below, and its
#: remaining field (the display name) is not a permission.
PERMISSIONS = ("user.created", "role.assigned", "scope.granted", "scope.revoked",
               "supervisor.changed", "supervisor_flag.changed", "user.disabled",
               "user.enabled", "password.set_by_admin", "visibility.policy.changed")
#: Iran's fixed UTC+03:30. ponytail: no DST since 2022; a zone change means
#: zoneinfo here and in ui/src/lib/format.ts.
TEHRAN_OFFSET_S = 12600
PAGE = 6
_SIGN_IN_FAILURES = ("login.failure", "login.throttled")


def _in(names) -> str:
    return ",".join("?" * len(names))


def users(conn: sqlite3.Connection, user_id: int | None = None) -> list[dict]:
    where = "WHERE u.id = ?" if user_id is not None else ""
    rows = conn.execute(f"""
        SELECT u.id, u.username, u.display_name, r.name AS role, u.disabled_at,
          (SELECT COUNT(*) FROM audit_events a
            WHERE a.actor = u.username AND a.action = 'login.success') AS logins,
          (SELECT COUNT(*) FROM audit_events a
            WHERE a.actor = u.username AND a.action = 'login.failure') AS failures,
          (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
          (SELECT COALESCE(SUM(i.ended_at - i.started_at), 0) FROM activity_intervals i
            JOIN sessions s ON s.id = i.session_id WHERE s.user_id = u.id) AS active,
          (SELECT MAX(s.last_seen) FROM sessions s WHERE s.user_id = u.id) AS last_seen
        FROM users u JOIN roles r ON r.id = u.role_id {where}
        ORDER BY u.display_name""", (() if user_id is None else (user_id,))).fetchall()
    scopes: dict[int, list[str]] = {}
    for s in conn.execute("SELECT user_id, scope FROM user_scopes ORDER BY scope"):
        scopes.setdefault(s["user_id"], []).append(s["scope"])
    return [{"id": r["id"], "username": r["username"], "displayName": r["display_name"],
             "role": r["role"], "scopes": scopes.get(r["id"], []),
             "disabled": r["disabled_at"] is not None, "logins": r["logins"],
             "failures": r["failures"], "sessions": r["sessions"],
             "activeSeconds": r["active"], "lastSeen": r["last_seen"]} for r in rows]


def user_events(conn: sqlite3.Connection, username: str, *, day: int | None,
                kind: str | None, outcome: str | None, offset: int) -> dict:
    where, args = ["actor = ?"], [username]
    if day is not None:
        start = day * 86400 - TEHRAN_OFFSET_S
        where.append("at >= ? AND at < ?")
        args += [start, start + 86400]
    if kind is not None:
        names = [a for a, k in CATALOGUE.items() if k == kind]
        where.append(f"action IN ({_in(names)})")
        args += names
    if outcome == "ok":
        where.append("outcome = 'ok'")
    elif outcome == "fail":
        where.append("outcome != 'ok'")
    sql = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM audit_events WHERE {sql}",
                         args).fetchone()[0]
    rows = conn.execute(
        f"SELECT id, at, action, target, ip, user_agent, outcome, session_id"
        f" FROM audit_events WHERE {sql} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?",
        [*args, PAGE, offset]).fetchall()
    days = {str(d): n for d, n in conn.execute(
        "SELECT (at + ?) / 86400, COUNT(*) FROM audit_events WHERE actor = ? GROUP BY 1",
        (TEHRAN_OFFSET_S, username))}
    return {"total": total, "days": days, "rows": [
        {"id": r["id"], "at": r["at"], "action": r["action"],
         "kind": CATALOGUE.get(r["action"], "governance"),
         "target": r["target"], "ip": r["ip"],
         "userAgent": r["user_agent"], "outcome": r["outcome"],
         "session": audit.session_tag(r["session_id"])} for r in rows]}


def user_sessions(conn: sqlite3.Connection, user_id: int, *, ttl: int,
                  now: int) -> list[dict]:
    """The one-user page's «نشست‌های این کاربر» card, newest first. The ending
    of an unrevoked session is derived from its age (D42: no `session.expired`)."""
    rows = conn.execute("""
        SELECT s.id, s.issued_at, s.last_seen, s.ip, s.user_agent, s.revoked_at,
          (SELECT COALESCE(SUM(i.ended_at - i.started_at), 0)
             FROM activity_intervals i WHERE i.session_id = s.id) AS active
        FROM sessions s WHERE s.user_id = ? ORDER BY s.issued_at DESC""",
        (user_id,)).fetchall()
    return [{"session": audit.session_tag(r["id"]), "issuedAt": r["issued_at"],
             "lastSeen": r["last_seen"], "ip": r["ip"], "userAgent": r["user_agent"],
             "activeSeconds": r["active"],
             "state": ("revoked" if r["revoked_at"] is not None
                       else "expired" if now - r["issued_at"] >= ttl else "active")}
            for r in rows]


def failures(conn: sqlite3.Connection) -> list[dict]:
    """Sign-in failures by attempted username and address — throttled attempts
    included, since hammering a locked account is exactly the signal (D44)."""
    return [{"username": r["actor"], "ip": r["ip"], "attempts": r["n"],
             "first": r["first"], "last": r["last"]}
            for r in conn.execute(
                f"SELECT actor, ip, COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last"
                f" FROM audit_events WHERE action IN ({_in(_SIGN_IN_FAILURES)})"
                f" GROUP BY actor, ip ORDER BY last DESC", _SIGN_IN_FAILURES)]


def permissions(conn: sqlite3.Connection) -> list[dict]:
    names = {r["username"]: r["display_name"]
             for r in conn.execute("SELECT username, display_name FROM users")}
    by_id = {r["id"]: r["display_name"]
             for r in conn.execute("SELECT id, display_name FROM users")}
    roles = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM roles")}
    out = []
    for r in conn.execute(
            f"SELECT at, actor, action, target, detail FROM audit_events"
            f" WHERE action IN ({_in(PERMISSIONS)}) ORDER BY at DESC, id DESC",
            PERMISSIONS):
        d = json.loads(r["detail"]) if r["detail"] else {}
        a = r["action"]
        before, after = d.get("before"), d.get("after")
        if a == "role.assigned":
            before, after = roles.get(before, before), roles.get(after, after)
        elif a == "supervisor.changed":
            before, after = by_id.get(before, before), by_id.get(after, after)
        elif a == "scope.granted":
            before, after = None, d.get("scope")
        elif a == "scope.revoked":
            before, after = d.get("scope"), None
        elif a == "user.created":
            before, after = None, d.get("role")
        elif a in ("user.disabled", "user.enabled"):
            before, after = a == "user.enabled", a == "user.disabled"
        elif a == "password.set_by_admin":
            before, after = None, None
        out.append({"at": r["at"], "actor": names.get(r["actor"], r["actor"]),
                    "action": a, "subject": names.get(r["target"], r["target"]),
                    "before": before, "after": after})
    return out
```

(`visibility.policy.changed` and `supervisor_flag.changed` already store `before`/`after` booleans and fall through unchanged; the visibility row's subject is the field name, which the client labels.)

- [ ] **Step 4: Write `routers/activity.py`**

```python
"""The activity reports (spec D44; addendum D83). GET only — the record has no
write surface of any kind (D45)."""
from __future__ import annotations

import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .. import comment_jobs, projection
from ..access import NOT_FOUND, reachable_departments, requires
from ..auth import require_session
from ..store import activity

router = APIRouter(prefix="/api/activity")
log = logging.getLogger(__name__)


def _fresh(request: Request) -> None:
    """Drain the outbox and project git first, so a report never reads a stale
    record (D59 rule 4, D79). A failure is logged, not answered: a report one
    pass behind is better than none."""
    cfg = request.app.state.cfg
    try:
        comment_jobs.drain(cfg.app_db, cfg.comments_db)
    except Exception:
        log.exception("outbox drain before a report failed")
    try:
        projection.run(cfg)
    except Exception:
        log.exception("git projection before a report failed")


def star(request: Request, user=Depends(requires("view_audit", "*"))):
    """Access and governance events name no department, so only a `*` holder
    sees them (D44). A scoped holder is 404'd, as for any `*` surface (D56)."""
    _fresh(request)
    return user


def reach(request: Request, user=Depends(require_session)) -> set[str] | None:
    """The departments the caller's `view_audit` covers — `None` for every one.
    No `view_audit` anywhere: the surface does not exist for them (404)."""
    codes = reachable_departments(request.app.state.db, user, "view_audit")
    if codes is not None and not codes:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    _fresh(request)
    return codes


@router.get("/users")
def list_users(request: Request, _=Depends(star)):
    return activity.users(request.app.state.db)


@router.get("/users/{user_id}")
def one_user(request: Request, user_id: int, _=Depends(star),
             day: int | None = None,
             kind: Literal["access", "content", "governance"] | None = None,
             outcome: Literal["ok", "fail"] | None = None,
             offset: int = Query(0, ge=0)):
    conn = request.app.state.db
    found = activity.users(conn, user_id)
    if not found:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    body = activity.user_events(conn, found[0]["username"], day=day, kind=kind,
                                outcome=outcome, offset=offset)
    return {"user": found[0], **body,
            "sessions": activity.user_sessions(
                conn, user_id, ttl=request.app.state.cfg.session_ttl,
                now=int(time.time()))}


@router.get("/failures")
def list_failures(request: Request, _=Depends(star)):
    return activity.failures(request.app.state.db)


@router.get("/permissions")
def list_permissions(request: Request, _=Depends(star)):
    return activity.permissions(request.app.state.db)
```

`reach` is used by Task 9; defining it here keeps both gates side by side.

- [ ] **Step 5: Register it** — `app.py`: `from .routers import activity as activity_router` with the other router imports, and `app.include_router(activity_router.router)` directly after `app.include_router(auth_router.router)` (before the SPA mount — see the comment there).

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_activity_api.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A ui-backend
git commit -m "feat(activity): the users, one-user, failed sign-in and permission reports (D83)"
```

---

### Task 9: The report API — the department, comment and summary endpoints, and scope (§11 test 28)

**Files:**
- Modify: `ui-backend/inja_ui_backend/store/activity.py`, `ui-backend/inja_ui_backend/routers/activity.py`
- Test: `ui-backend/tests/test_activity_scope.py` (create)

**Interfaces:**
- Consumes: `reach` (Task 8), `storage.registry_path`, `storage.proc_path`, `storage.dept_of`, `scopes.dept_of`, `comment_rules.cmt`, `request.app.state.comments_db`.
- Produces:
  - `GET /api/activity/departments` → `{code, name, readers, views, downloads, topProcess: {id, name}|null, lastViewed: number|null}[]`, registry order, only covered departments.
  - `GET /api/activity/comments` → `{ref, department, author, state, stage: 'reader'|'pool'|null, holder: string|null, waitingSince: number|null}[]`, newest first, only covered departments, never text.
  - `GET /api/activity/summary` → `{activeUsers: number|null, views: number, failedSignIns: number|null, commentsAwaiting: number}` — the two `*`-only numbers are `null` for a scoped caller.

- [ ] **Step 1: Write the failing tests** — `ui-backend/tests/test_activity_scope.py`

```python
"""The department and comment reports, and D44's scope rule (addendum D83;
§11 test 28): a scoped `view_audit` holder sees content for their departments
and no access or governance events; a `*` holder sees both."""


def test_readership_counts_views_readers_and_the_top_process(people):
    people["viewer"].get("/api/processes/cooking-001")
    people["viewer"].get("/api/departments/cooking/overview")
    people["other"].get("/api/processes/cooking-001")
    rows = people["editor"].get("/api/activity/departments").json()
    cooking = next(r for r in rows if r["code"] == "cooking")
    assert cooking["views"] == 3 and cooking["readers"] == 2 and cooking["downloads"] == 0
    assert cooking["topProcess"]["id"] == "cooking-001" and cooking["lastViewed"]
    assert len(rows) == 9


def test_comment_flow_shows_the_holder_and_never_the_text(people):
    text = "متن خصوصی کامنت"
    r = people["viewer"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": text})
    assert r.status_code == 201
    res = people["editor"].get("/api/activity/comments")
    row = res.json()[0]
    assert row["state"] == "awaiting" and row["stage"] == "reader"
    assert row["holder"] == "head" and row["waitingSince"]
    assert text not in res.text


def test_a_scoped_admin_sees_only_their_departments(people):
    people["viewer"].get("/api/processes/cooking-001")
    people["viewer"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "x"})
    depts = people["cadmin"].get("/api/activity/departments").json()
    assert [r["code"] for r in depts] == ["cashier"]
    assert people["cadmin"].get("/api/activity/comments").json() == []
    summary = people["cadmin"].get("/api/activity/summary").json()
    assert summary["activeUsers"] is None and summary["failedSignIns"] is None
    assert summary["views"] == 0


def test_a_star_holder_sees_every_number(people):
    summary = people["admin"].get("/api/activity/summary").json()
    assert summary["activeUsers"] == 7 and summary["failedSignIns"] == 0


def test_a_reader_is_404_everywhere(people):
    for path in ("/api/activity/departments", "/api/activity/comments",
                 "/api/activity/summary"):
        assert people["head"].get(path).status_code == 404
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest ui-backend/tests/test_activity_scope.py -q`
Expected: FAIL — 404 on the three paths for everyone.

- [ ] **Step 3: The queries** — `store/activity.py`: add imports `from pathlib import Path`, `from .. import comment_rules, storage`, `from ..scopes import dept_of as scope_dept`, then:

```python
_VIEWS = ("department.viewed", "process.viewed")


def _target_department(action: str, target: str | None) -> str | None:
    if not target:
        return None
    if action == "report.downloaded":
        return scope_dept(target)                  # dept:{code}/report:{kind}
    return storage.dept_of(target) if action == "process.viewed" else target


def departments(conn: sqlite3.Connection, root: Path,
                codes: set[str] | None) -> list[dict]:
    reg = storage.read_json(storage.registry_path(root))["departments"]
    stats = {d["code"]: {"code": d["code"], "name": d.get("name", d["code"]),
                         "readers": set(), "views": 0, "downloads": 0,
                         "top": {}, "lastViewed": None}
             for d in reg if codes is None or d["code"] in codes}
    for r in conn.execute(
            "SELECT action, target, actor, COUNT(*) AS n, MAX(at) AS last"
            " FROM audit_events WHERE action IN (?, ?, 'report.downloaded')"
            " GROUP BY action, target, actor", _VIEWS):
        s = stats.get(_target_department(r["action"], r["target"]))
        if s is None:
            continue
        if r["action"] == "report.downloaded":
            s["downloads"] += r["n"]
            continue
        s["views"] += r["n"]
        s["readers"].add(r["actor"])
        s["lastViewed"] = max(s["lastViewed"] or 0, r["last"])
        if r["action"] == "process.viewed":
            s["top"][r["target"]] = s["top"].get(r["target"], 0) + r["n"]
    out = []
    for s in stats.values():
        top = max(s["top"], key=s["top"].get) if s["top"] else None
        path = storage.proc_path(root, top) if top else None
        name = (storage.read_json(path).get("name") or top) if path and path.is_file() else top
        out.append({"code": s["code"], "name": s["name"], "readers": len(s["readers"]),
                    "views": s["views"], "downloads": s["downloads"],
                    "topProcess": {"id": top, "name": name} if top else None,
                    "lastViewed": s["lastViewed"]})
    return out


def comments(conn: sqlite3.Connection, cc: sqlite3.Connection,
             codes: set[str] | None) -> list[dict]:
    """Where each comment sits — metadata only, never its text (D44)."""
    names = {r["id"]: r["display_name"]
             for r in conn.execute("SELECT id, display_name FROM users")}
    rows = cc.execute("""
        SELECT c.id, c.department, c.author_name, c.state, c.stage, c.approver_id,
          (SELECT MAX(e.at) FROM comment_events e WHERE e.comment_id = c.id) AS moved
        FROM comments c ORDER BY c.id DESC""").fetchall()
    return [{"ref": comment_rules.cmt(r["id"]), "department": r["department"],
             "author": r["author_name"], "state": r["state"], "stage": r["stage"],
             "holder": names.get(r["approver_id"]) if r["stage"] == "reader" else None,
             "waitingSince": r["moved"] if r["state"] in ("awaiting", "approved") else None}
            for r in rows if codes is None or r["department"] in codes]


def summary(conn: sqlite3.Connection, cc: sqlite3.Connection, root: Path,
            codes: set[str] | None) -> dict:
    star = codes is None
    return {
        "activeUsers": (conn.execute("SELECT COUNT(*) FROM users"
                                     " WHERE disabled_at IS NULL").fetchone()[0]
                        if star else None),
        "views": sum(d["views"] for d in departments(conn, root, codes)),
        "failedSignIns": (conn.execute(
            f"SELECT COUNT(*) FROM audit_events WHERE action IN ({_in(_SIGN_IN_FAILURES)})",
            _SIGN_IN_FAILURES).fetchone()[0] if star else None),
        "commentsAwaiting": sum(1 for c in comments(conn, cc, codes)
                                if c["state"] == "awaiting"),
    }
```

(If `registry.json` names a department's Persian title with a key other than `name`, use that key — `GET /api/departments` already serves `name`; read how `routers/departments.list_departments` gets it and match.)

- [ ] **Step 4: The endpoints** — `routers/activity.py`:

```python
@router.get("/departments")
def list_departments(request: Request, codes=Depends(reach)):
    return activity.departments(request.app.state.db,
                                request.app.state.cfg.data_root, codes)


@router.get("/comments")
def list_comments(request: Request, codes=Depends(reach)):
    return activity.comments(request.app.state.db, request.app.state.comments_db, codes)


@router.get("/summary")
def get_summary(request: Request, codes=Depends(reach)):
    return activity.summary(request.app.state.db, request.app.state.comments_db,
                            request.app.state.cfg.data_root, codes)
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_activity_scope.py ui-backend/tests/test_activity_api.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A ui-backend
git commit -m "feat(activity): readership, comment flow and the summary, scoped per D44 (D83)"
```

---

### Task 10: What makes the record mean anything (§11 tests 9, 16, 16c, 18, 19)

**Files:**
- Test: `ui-backend/tests/test_activity_catalogue.py` (create)
- Modify: `ui-backend/tests/test_endpoint_matrix.py` (`GATED`/`FILTERED` tables and the route count in its docstring), `ui-backend/tests/test_body_scan.py` (its route table)

**Interfaces:**
- Consumes: `store/activity.CATALOGUE`, every write route, `create_app`.

- [ ] **Step 1: Write the tests** — `ui-backend/tests/test_activity_catalogue.py`

```python
"""The record's own guarantees (spec §11 tests 16, 16c, 18, 19; addendum D76)."""
import ast
import dataclasses
import pathlib

from fastapi.routing import APIRoute

from inja_ui_backend.app import create_app
from inja_ui_backend.store.activity import CATALOGUE
from inja_ui_backend.tests_helpers import _PW, _USERNAME, cfg_for, seed_editor

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "ui-backend" / "inja_ui_backend"
TESTS = ROOT / "ui-backend" / "tests"

#: §11 test 16: every state-changing route, and what it writes. A new write
#: route fails `test_every_write_route_is_accounted_for` until it is listed here.
WRITES = {
    ("POST", "/api/auth/login"): {"login.success", "login.failure", "login.throttled"},
    ("POST", "/api/auth/logout"): {"logout"},
    ("POST", "/api/auth/password"): {"password.changed", "session.revoked"},
    ("POST", "/api/processes"): {"process.edited"},
    ("PUT", "/api/processes/{pid}"): {"process.edited"},
    ("DELETE", "/api/processes/{pid}"): {"process.edited"},
    ("POST", "/api/processes/{pid}/pending/{index}"): {"process.edited"},
    ("POST", "/api/processes/{pid}/relayout"): set(),          # writes nothing to disk
    ("PUT", "/api/departments/{code}/overview"): {"department.edited"},
    ("PUT", "/api/departments/{code}/order"): {"department.edited"},
    ("POST", "/api/departments/{code}/reports/{kind}"): set(),  # a build; the download records
    ("POST", "/api/facts/{fid}/resolve"): {"fact.edited"},
    ("POST", "/api/confirmations/{target}"): {"confirmation.set"},
    ("DELETE", "/api/confirmations/{target}"): {"confirmation.revoked"},
    ("PUT", "/api/visibility/{field}"): {"visibility.policy.changed"},
    ("POST", "/api/users"): {"user.created"},
    ("PATCH", "/api/users/{user_id}"): {"user.modified", "role.assigned", "scope.granted",
                                        "scope.revoked", "supervisor.changed",
                                        "supervisor_flag.changed"},
    ("POST", "/api/users/{user_id}/disabled"): {"user.disabled", "user.enabled",
                                                "session.revoked"},
    ("POST", "/api/users/{user_id}/password"): {"password.set_by_admin", "session.revoked"},
    ("POST", "/api/comments"): {"comment.created"},
    ("PUT", "/api/comments/{ref}"): {"comment.edited"},
    ("POST", "/api/comments/{ref}/withdraw"): {"comment.withdrawn"},
    ("POST", "/api/comments/{ref}/approve"): {"comment.approved", "comment.noted"},
    ("POST", "/api/comments/{ref}/reject"): {"comment.rejected"},
    ("POST", "/api/comments/{ref}/address"): {"comment.addressed"},
}
#: Written by something other than an endpoint (D42's table, addendum D79/D80).
ELSEWHERE = {"department.viewed", "process.viewed", "report.downloaded", "access.denied",
             "confirmation.invalidated", "projection.discontinuity"}


def _routes(app):
    """Walk included routers too (see test_body_scan's note on FastAPI 0.139)."""
    stack, out = list(app.routes), []
    while stack:
        r = stack.pop()
        if isinstance(r, APIRoute):
            out.append(r)
        stack.extend(getattr(r, "routes", []) or [])
    return out


def _app(data_root, tmp_path):
    return create_app(cfg_for(data_root, tmp_path / "app.db"))


def test_every_write_route_is_accounted_for(data_root, tmp_path):
    writes = {(m, r.path) for r in _routes(_app(data_root, tmp_path))
              for m in r.methods if m in {"POST", "PUT", "PATCH", "DELETE"}}
    assert writes == set(WRITES)


def test_every_catalogued_event_has_a_writer():
    """§11 test 16c: an event named in the catalogue that no code emits — every
    name must appear as a string literal outside the catalogue itself — and the
    reverse: every name the code records is catalogued."""
    catalogue_file = PACKAGE / "store" / "activity.py"
    literals = set()
    for path in PACKAGE.rglob("*.py"):
        if path == catalogue_file:
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                literals.add(node.value)
    assert set(CATALOGUE) <= literals
    assert set(CATALOGUE) == set().union(*WRITES.values()) | ELSEWHERE


def test_every_catalogued_event_is_asserted_by_some_test():
    corpus = "".join(p.read_text(encoding="utf-8") for p in TESTS.glob("test_*.py")
                     if p.name != "test_activity_catalogue.py")
    missing = sorted(name for name in CATALOGUE if f'"{name}"' not in corpus)
    assert missing == []


def test_the_record_is_append_only():
    """§11 test 19 / D45: no code alters or deletes a record row, and the
    report surface is GET-only."""
    for path in PACKAGE.rglob("*.py"):
        text = path.read_text(encoding="utf-8").upper()
        assert "UPDATE AUDIT_EVENTS" not in text and "DELETE FROM AUDIT_EVENTS" not in text, path


def test_the_activity_surface_is_get_only(data_root, tmp_path):
    methods = {m for r in _routes(_app(data_root, tmp_path))
               if r.path.startswith("/api/activity") for m in r.methods}
    assert methods == {"GET"}


def test_the_spa_mount_does_not_swallow_the_activity_routes(data_root, tmp_path):
    """§11 test 18, extended to the new prefix."""
    from fastapi.testclient import TestClient
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>shell</html>", encoding="utf-8")
    cfg = cfg_for(data_root, tmp_path / "app.db")
    seed_editor(cfg)
    c = TestClient(create_app(dataclasses.replace(cfg, static_dir=static)),
                   base_url="https://testserver")
    assert c.post("/api/auth/login",
                  json={"username": _USERNAME, "password": _PW}).status_code == 200
    r = c.get("/api/activity/summary")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
```

- [ ] **Step 2: Run them**

Run: `.venv/bin/pytest ui-backend/tests/test_activity_catalogue.py -q`
Expected: PASS if Tasks 2–9 are complete. A failure names the gap: an unlisted write route, a catalogued name with no writer, an event no test asserts (write that test in the task that owns the writer — e.g. `"logout"`, `"login.throttled"` may only be asserted as variables today; add a one-line assertion where they are already exercised), or a writer outside the catalogue (add it to `CATALOGUE` and to the addendum's D76 table).

- [ ] **Step 3: Extend the two route matrices** — add the seven `/api/activity` routes:
  - `test_endpoint_matrix.py`: add to `GATED` `("GET", "/api/activity/users", None, "view_audit")`, `("GET", "/api/activity/users/1", None, "view_audit")`, `("GET", "/api/activity/failures", None, "view_audit")`, `("GET", "/api/activity/permissions", None, "view_audit")` with target `*` (follow how the `/api/users` rows declare a `*` target), and add `"/api/activity/departments"`, `"/api/activity/comments"`, `"/api/activity/summary"` to `FILTERED`. Update the route counts in its docstring.
  - `test_body_scan.py`: add a `Route("GET", …, 200)` row for each of the seven, for the roles that table exercises, so §11 test 9's scan covers them (no denylisted key, no unconfirmed or tombstoned process id — `topProcess` is taken from views of served processes, so it must pass; if it does not, filter `departments()`'s `top` to processes the caller may be served, with `Disclosure.servable`).

- [ ] **Step 4: Run them**

Run: `.venv/bin/pytest ui-backend/tests/test_endpoint_matrix.py ui-backend/tests/test_body_scan.py ui-backend/tests/test_activity_catalogue.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A ui-backend
git commit -m "test(activity): every write accounted for, every event written, the record append-only"
```

---

### Task 11: The client plumbing — API, heartbeat, formatting, labels, calendar, menu and routes

**Files:**
- Create: `ui/src/api/activity.ts`, `ui/src/lib/events.ts`, `ui/src/ui/JalaliCalendar.tsx`, `ui/src/ui/JalaliCalendar.test.tsx`
- Modify: `ui/src/auth/useSession.ts`, `ui/src/auth/useSession.test.tsx`, `ui/src/lib/format.ts`, `ui/src/lib/format.test.ts`, `ui/src/shell/crumbs.ts`, `ui/src/shell/crumbs.test.ts`, `ui/src/shell/PanelShell.tsx`, `ui/src/shell/shells.test.tsx`, `ui/src/routes.tsx`, `ui/src/screens/Visibility.tsx` (export the field labels)

**Interfaces:**
- Consumes: the Task 8/9 JSON contracts.
- Produces: the types/hooks below; `format.ts` exports `TEHRAN_OFFSET_S`, `dayOf`, `jalaliParts`, `jalaliDay`, `clockFa`, `whenFa`, `durationFa`, `daysSinceFa`; `events.ts` exports `EVENT_LABEL`, `eventLabel`, `uaLabel`, `COMMENT_STATE`, `hopLabel`; `JalaliCalendar.tsx` exports `monthOf`, `JalaliCalendar`, `CalendarFilter`; `Visibility.tsx` exports `POLICY_LABEL: Record<string, string>`. Tasks 12–13 build `ui/src/screens/Activity.tsx` (`export function Activity()`) and `ui/src/screens/UserActivity.tsx` (`export function UserActivity()`); this task registers both routes against those names, so create each file now as `export function Activity() { return null }` / `export function UserActivity() { return null }` placeholders that Tasks 12–13 replace.

- [ ] **Step 1: Write the failing tests**

`ui/src/lib/format.test.ts` — add:

```ts
import { dayOf, durationFa, jalaliDay, whenFa } from './format'

describe('activity time formatting (Iran, UTC+03:30)', () => {
  const at = Date.UTC(2026, 8, 27, 6, 0) / 1000          // 09:30 in Tehran, 5 Mehr 1405
  it('names the Jalali day of a unix time', () => {
    expect(jalaliDay(dayOf(at))).toBe('۱۴۰۵/۰۷/۰۵')
  })
  it('says today and yesterday with a clock, older days as a date', () => {
    expect(whenFa(at, at + 3600)).toBe('امروز، ۰۹:۳۰')
    expect(whenFa(at, at + 86400)).toBe('دیروز، ۰۹:۳۰')
    expect(whenFa(at, at + 3 * 86400)).toBe('۱۴۰۵/۰۷/۰۵')
    expect(whenFa(null)).toBe('—')
  })
  it('writes a duration the way the design does', () => {
    expect(durationFa(11520)).toBe('۳ ساعت و ۱۲ دقیقه')
    expect(durationFa(720)).toBe('۱۲ دقیقه')
    expect(durationFa(0)).toBe('—')
  })
})
```

`ui/src/ui/JalaliCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JalaliCalendar, monthOf } from './JalaliCalendar'
import { dayOf } from '../lib/format'

const MEHR_1 = dayOf(Date.UTC(2026, 8, 23, 12) / 1000)      // 1 Mehr 1405, a Wednesday

describe('JalaliCalendar', () => {
  it('finds the month a day belongs to', () => {
    expect(monthOf(MEHR_1 + 4)).toEqual({ first: MEHR_1, length: 30, y: 1405, m: 7 })
  })
  it('offers only the days that have events, and picks one', async () => {
    const onPick = vi.fn()
    render(<JalaliCalendar days={{ [String(MEHR_1 + 4)]: 3 }} value={null} onPick={onPick} />)
    expect(screen.getByText('مهر ۱۴۰۵')).toBeTruthy()
    expect((screen.getByRole('button', { name: '۴' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '۵' }))
    expect(onPick).toHaveBeenCalledWith(MEHR_1 + 4)
  })
  it('starts the month on its real weekday', () => {
    // 1 Mehr 1405 is a Wednesday — the 5th column of a Saturday-first week
    const { container } = render(
      <JalaliCalendar days={{ [String(MEHR_1)]: 1 }} value={null} onPick={() => {}} />)
    expect(container.querySelectorAll('[data-cal-blank]').length).toBe(4)
  })
})
```

`ui/src/auth/useSession.test.tsx` — add:

```tsx
import { focusManager } from '@tanstack/react-query'

describe('the heartbeat (D43, addendum D81; §11 test 27, client half)', () => {
  it('re-asks every 60 seconds while visible and stops while hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetch = vi.fn(async () => new Response(JSON.stringify(DESCRIPTOR),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderHook(() => useSession(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    focusManager.setFocused(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    focusManager.setFocused(undefined)
    vi.useRealTimers()
  })
})
```

`ui/src/shell/crumbs.test.ts` — add:

```ts
  it('names the activity screens', () => {
    expect(panelCrumbs('/activity', name)).toEqual([{ label: 'گزارش فعالیت کاربران' }])
    expect(panelCrumbs('/activity/users/7', name)).toEqual([
      { label: 'گزارش فعالیت کاربران', to: '/activity' }, { label: 'تاریخچهٔ فعالیت' }])
  })
```

(match the file's existing `name` helper and add `/activity` and `/activity/users/7` to its list(s) of Panel paths at ~L99 and ~L175 if those lists assert every Panel route.)

`ui/src/shell/shells.test.tsx` — add a case beside the existing admin-menu cases: a descriptor holding `view_audit` at `*` sees a link named «گزارش فعالیت کاربران» to `/activity`, positioned after «کاربران» and before «سیاست نمایش محتوا»; a Reader descriptor does not see it. Copy the file's existing pattern for asserting a menu entry.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ui && npx vitest run src/lib/format.test.ts src/ui/JalaliCalendar.test.tsx src/auth/useSession.test.tsx src/shell/crumbs.test.ts src/shell/shells.test.tsx`
Expected: FAIL — missing exports / module; one fetch in 240 s; no activity crumb; no menu entry.

- [ ] **Step 3: Formatting** — `ui/src/lib/format.ts`: change `function toJalali(` to `export function toJalali(` and append:

```ts
/** Iran's fixed UTC+03:30 — the server's `store/activity.TEHRAN_OFFSET_S`.
 *  ponytail: no DST since 2022; a zone change means both sides change. */
export const TEHRAN_OFFSET_S = 12600

/** The server's day number for a unix time — what `/api/activity` keys days by. */
export const dayOf = (at: number): number => Math.floor((at + TEHRAN_OFFSET_S) / 86400)

export function jalaliParts(day: number): [number, number, number] {
  const d = new Date(day * 86400000)
  return toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function jalaliDay(day: number): string {
  const [y, m, d] = jalaliParts(day)
  return `${toFa(y)}/${pad2(m)}/${pad2(d)}`
}

export function clockFa(at: number): string {
  const d = new Date((at + TEHRAN_OFFSET_S) * 1000)
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

/** «امروز، ۱۰:۲۴» · «دیروز، ۲۰:۰۵» · «۱۴۰۵/۰۴/۲۹» — the design's "last seen". */
export function whenFa(at: number | null, now: number = Date.now() / 1000): string {
  if (at === null) return '—'
  const gap = dayOf(now) - dayOf(at)
  if (gap === 0) return `امروز، ${clockFa(at)}`
  if (gap === 1) return `دیروز، ${clockFa(at)}`
  return jalaliDay(dayOf(at))
}

/** «۳ ساعت و ۱۲ دقیقه» · «۵۲ دقیقه» — active time. */
export function durationFa(seconds: number): string {
  if (seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return 'کمتر از یک دقیقه'
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h === 0) return `${toFa(m)} دقیقه`
  return m === 0 ? `${toFa(h)} ساعت` : `${toFa(h)} ساعت و ${toFa(m)} دقیقه`
}

/** «۶ روز» — how long a comment has sat where it is. */
export function daysSinceFa(at: number | null, now: number = Date.now() / 1000): string {
  return at === null ? '—' : `${toFa(Math.max(0, dayOf(now) - dayOf(at)))} روز`
}
```

- [ ] **Step 4: The API** — `ui/src/api/activity.ts`:

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { CommentState } from './comments'

export type EventKind = 'access' | 'content' | 'governance'

export interface ActivityUser {
  id: number; username: string; displayName: string; role: string; scopes: string[]
  disabled: boolean; logins: number; failures: number; sessions: number
  activeSeconds: number; lastSeen: number | null
}
export interface ActivityEvent {
  id: number; at: number; action: string; kind: EventKind; target: string | null
  ip: string; userAgent: string; outcome: string; session: string | null
}
export interface ActivitySession {
  session: string; issuedAt: number; lastSeen: number; ip: string; userAgent: string
  activeSeconds: number; state: 'active' | 'revoked' | 'expired'
}
export interface UserActivity {
  user: ActivityUser; total: number; rows: ActivityEvent[]
  days: Record<string, number>; sessions: ActivitySession[]
}
export interface DeptReadership {
  code: string; name: string; readers: number; views: number; downloads: number
  topProcess: { id: string; name: string } | null; lastViewed: number | null
}
export interface SignInFailure { username: string; ip: string; attempts: number; first: number; last: number }
export interface PermissionChange {
  at: number; actor: string; action: string; subject: string | null
  before: string | boolean | null; after: string | boolean | null
}
export interface CommentFlow {
  ref: string; department: string; author: string; state: CommentState
  stage: 'reader' | 'pool' | null; holder: string | null; waitingSince: number | null
}
export interface ActivitySummary {
  activeUsers: number | null; views: number; failedSignIns: number | null; commentsAwaiting: number
}
export interface EventFilters { day?: number; kind?: EventKind; outcome?: 'ok' | 'fail'; page: number }

/** One page of the one-user list — the server's `store/activity.PAGE`. */
export const EVENTS_PER_PAGE = 6

function list<T>(path: string, enabled: boolean) {
  return { queryKey: ['activity', path], queryFn: () => fetchJson<T>(path), enabled }
}

export const useActivitySummary = (enabled: boolean) =>
  useQuery(list<ActivitySummary>('/api/activity/summary', enabled))
export const useActivityUsers = (enabled = true) =>
  useQuery(list<ActivityUser[]>('/api/activity/users', enabled))
export const useActivityDepartments = (enabled = true) =>
  useQuery(list<DeptReadership[]>('/api/activity/departments', enabled))
export const useActivityPermissions = (enabled = true) =>
  useQuery(list<PermissionChange[]>('/api/activity/permissions', enabled))
export const useActivityComments = (enabled = true) =>
  useQuery(list<CommentFlow[]>('/api/activity/comments', enabled))
export const useActivityFailures = (enabled = true) =>
  useQuery(list<SignInFailure[]>('/api/activity/failures', enabled))

export function useUserActivity(id: string, f: EventFilters, enabled: boolean) {
  const q = new URLSearchParams()
  if (f.day !== undefined) q.set('day', String(f.day))
  if (f.kind) q.set('kind', f.kind)
  if (f.outcome) q.set('outcome', f.outcome)
  if (f.page > 1) q.set('offset', String((f.page - 1) * EVENTS_PER_PAGE))
  const qs = q.toString()
  return useQuery({
    queryKey: ['activity', 'user', id, f],
    queryFn: () => fetchJson<UserActivity>(`/api/activity/users/${id}${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}
```

- [ ] **Step 5: The heartbeat** — `ui/src/auth/useSession.ts`, add to the options object:

```ts
    // D43/D81: the heartbeat. Every signed-in request extends the session's
    // activity interval on the server, and this is the request that keeps
    // arriving while someone is here. TanStack pauses an interval refetch
    // while the tab is hidden (`refetchIntervalInBackground` defaults to
    // false) — which is the whole honesty rule: a screen left open in a back
    // office stops counting. Also picks up a permission change within a minute.
    refetchInterval: 60_000,
```

- [ ] **Step 6: Labels** — `ui/src/lib/events.ts`:

```ts
/** Persian names for the activity record's events (addendum D76). The design's
 *  own strings are kept where it has one; the rest are proposals the owner
 *  confirmed in Task 12 Step 1. */
export const EVENT_LABEL: Record<string, string> = {
  'login.success': 'ورود موفق', 'login.failure': 'ورود ناموفق',
  'login.throttled': 'ورود متوقف‌شده — تلاش زیاد', logout: 'خروج',
  'session.revoked': 'ابطال نشست', 'password.changed': 'تغییر گذرواژه',
  'access.denied': 'اقدام بدون مجوز',
  'department.viewed': 'مشاهدهٔ دپارتمان', 'process.viewed': 'مشاهدهٔ فرآیند',
  'report.downloaded': 'دریافت فایل نمایش', 'process.edited': 'ویرایش فرآیند',
  'department.edited': 'ویرایش دپارتمان', 'fact.edited': 'ویرایش دادهٔ کمّی',
  'confirmation.set': 'تأیید', 'confirmation.revoked': 'پس‌گرفتن تأیید',
  'confirmation.invalidated': 'باطل‌شدن تأیید',
  'user.created': 'ساخت کاربر', 'user.modified': 'ویرایش کاربر',
  'user.disabled': 'غیرفعال‌سازی کاربر', 'user.enabled': 'فعال‌سازی دوبارهٔ کاربر',
  'password.set_by_admin': 'تعیین گذرواژه توسط مدیر', 'role.assigned': 'تغییر نقش',
  'scope.granted': 'افزودن دسترسی', 'scope.revoked': 'گرفتن دسترسی',
  'supervisor.changed': 'تغییر سرپرست', 'supervisor_flag.changed': 'تغییر پرچم سرپرست‌شدن',
  'visibility.policy.changed': 'تغییر سیاست نمایش',
  'comment.created': 'ثبت کامنت', 'comment.edited': 'ویرایش کامنت',
  'comment.withdrawn': 'پس‌گرفتن کامنت', 'comment.approved': 'تأیید کامنت',
  'comment.noted': 'یادداشت روی کامنت', 'comment.rejected': 'رد کامنت',
  'comment.addressed': 'رسیدگی به کامنت', 'projection.discontinuity': 'گسست در تاریخچهٔ داده',
}

export const eventLabel = (action: string): string => EVENT_LABEL[action] ?? action

/** «کروم · ویندوز» — the design's device column.
 *  ponytail: naive user-agent sniffing, good for a label and nothing else. */
export function uaLabel(ua: string): string {
  if (!ua) return '—'
  const browser = /Edg\//.test(ua) ? 'اج' : /Firefox\//.test(ua) ? 'فایرفاکس'
    : /Chrome\//.test(ua) ? 'کروم' : /Safari\//.test(ua) ? 'سافاری' : 'مرورگر'
  const os = /Android/.test(ua) ? 'اندروید' : /iPhone|iPad/.test(ua) ? 'آیفون'
    : /Windows/.test(ua) ? 'ویندوز' : /Mac OS X/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : ''
  return os ? `${browser} · ${os}` : browser
}

/** The comment-flow tab's state pill — the design's ST_OPTS wording. */
export const COMMENT_STATE: Record<string, { label: string; tone: 'warn' | 'info' | 'ok' | 'danger' | 'neutral' }> = {
  awaiting: { label: 'در انتظار تأیید', tone: 'warn' },
  approved: { label: 'رسیده به ادیتور', tone: 'info' },
  addressed: { label: 'رسیدگی‌شده', tone: 'ok' },
  rejected: { label: 'ردشده', tone: 'danger' },
  withdrawn: { label: 'پس‌گرفته', tone: 'neutral' },
}

/** Who holds a comment now — PanelInbox's `waitingWith` wording (D63). */
export function hopLabel(c: { state: string; stage: string | null; holder: string | null }): string {
  if (c.state === 'awaiting') return c.stage === 'pool' ? 'ادمین‌ها' : (c.holder ?? '—')
  if (c.state === 'approved') return 'ادیتور'
  return '—'
}
```

- [ ] **Step 7: The calendar** — `ui/src/ui/JalaliCalendar.tsx`. Build the trigger with the SAME class string as `Dropdown`'s trigger button and the popover with the SAME class string as `Dropdown`'s list (open `ui/src/ui/Dropdown.tsx`, copy both, and reuse its `pushDismissible`/`popDismissible`/`isTopDismissible` Escape + outside-click handling exactly as it does). The popover content follows `Inja Panel.dc.html` L2374–2397 (266px wide, 7-column grid, 30px day cells, radius 8, prev/next chevrons named like `Pager`'s so they point the right way in RTL).

```tsx
import { useEffect, useRef, useState } from 'react'
import { dayOf, jalaliDay, jalaliParts, toFa } from '../lib/format'
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
                'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** The Jalali month `day` falls in: its first day number, its length, year, month.
 *  Walks day numbers rather than converting back from Jalali — `format.ts` only
 *  has Gregorian → Jalali, and a month is at most 31 steps. */
export function monthOf(day: number): { first: number; length: number; y: number; m: number } {
  const [y, m, d] = jalaliParts(day)
  const first = day - (d - 1)
  let length = 29
  while (length < 31 && jalaliParts(first + length)[2] !== 1) length++
  return { first, length, y, m }
}

const latest = (days: Record<string, number>): number | undefined => {
  const keys = Object.keys(days).map(Number)
  return keys.length ? Math.max(...keys) : undefined
}

export function JalaliCalendar({ days, value, onPick }: {
  days: Record<string, number>; value: number | null; onPick: (day: number | null) => void
}) {
  const [anchor, setAnchor] = useState(() => value ?? latest(days) ?? dayOf(Date.now() / 1000))
  const { first, length, y, m } = monthOf(anchor)
  const lead = (new Date(first * 86400000).getUTCDay() + 1) % 7      // Saturday first
  return (
    <div data-cal className="w-cal">
      <div className="flex items-center justify-between mb-s5">
        {/* next month sits on the LEFT in RTL — Pager's rule */}
        <button type="button" aria-label="ماه بعد" onClick={() => setAnchor(first + length)}>‹</button>
        <span className="text-fs-sm font-bold text-ink">{`${MONTHS[m - 1]} ${toFa(y)}`}</span>
        <button type="button" aria-label="ماه قبل" onClick={() => setAnchor(first - 1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-s1 text-center">
        {WEEK.map((w) => <span key={w} className="text-caption text-muted">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} data-cal-blank />)}
        {Array.from({ length }, (_, n) => {
          const day = first + n
          const count = days[String(day)] ?? 0
          const on = value === day
          return (
            <button key={day} type="button" disabled={!count} aria-pressed={on}
              title={count ? `${toFa(count)} رویداد` : 'بدون رویداد'}
              onClick={() => onPick(on ? null : day)}
              className={`h-cal-cell rounded-input text-fs-sm ${on ? 'bg-violet text-white font-bold'
                : count ? 'bg-tile-v2 text-violet font-bold' : 'text-faint'}`}>
              {toFa(n + 1)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A filter-bar trigger that opens the calendar, with «همهٔ تاریخ‌ها» to clear. */
export function CalendarFilter({ days, value, onPick }: {
  days: Record<string, number>; value: number | null; onPick: (day: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const identity = useRef(Symbol('calendar')).current
  useEffect(() => {
    if (!open) return
    pushDismissible(identity)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTopDismissible(identity)) setOpen(false) }
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      popDismissible(identity)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, identity])
  const pick = (d: number | null) => { onPick(d); setOpen(false) }
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(!open)} className={/* Dropdown's trigger classes */ ''}>
        {value === null ? 'همهٔ تاریخ‌ها' : jalaliDay(value)}
      </button>
      {open && (
        <div role="dialog" aria-label="انتخاب روز" className={/* Dropdown's popover classes */ ''}>
          <JalaliCalendar days={days} value={value} onPick={pick} />
          <button type="button" onClick={() => pick(null)}>همهٔ تاریخ‌ها</button>
        </div>
      )}
    </div>
  )
}
```

`w-cal` and `h-cal-cell` are the design's 266px and 30px: before using them, look in `ui/src/styles/tokens.css` / `tailwind.config.js` for existing width/height tokens of those values (the design system may already mint them for this calendar); if none exist, add `--width-cal: 266px` and `--height-cal-cell: 30px` to `tokens.css` beside the other `--width-*` tokens and wire `cal` / `cal-cell` in `tailwind.config.js` the way `list` is wired — tokens.css is the only file that may hold literal values. Replace the `‹`/`›` glyphs with the `Icon` names `Pager.tsx` uses for its two buttons.

- [ ] **Step 8: Crumbs, routes, menu, labels export**

`shell/crumbs.ts`: add `activity: 'گزارش فعالیت کاربران',` to `FLAT`, and beside the `users` detail branch:

```ts
  if (parts[0] === 'activity' && parts[1] === 'users' && parts[2] !== undefined) {
    return [{ label: 'گزارش فعالیت کاربران', to: '/activity' }, { label: 'تاریخچهٔ فعالیت' }]
  }
```

`routes.tsx`: beside `/users` and `/users/:id`, with a comment in the file's style:

```tsx
      { path: '/activity', element: <Activity /> },
      { path: '/activity/users/:id', element: <UserActivity /> },
```

`PanelShell.tsx`: in `adminItems`, between the «کاربران» entry and the «سیاست نمایش محتوا» entry:

```tsx
    ...(session?.capabilities.includes('view_audit')
      ? [{ to: '/activity', label: 'گزارش فعالیت کاربران', hint: 'ورود، خواندن، تغییر دسترسی' }] : []),
```

and replace the comment line `// §6.0's «گزارش فعالیت کاربران» is absent under the same rule: no such screen.` with:

```tsx
  // «گزارش فعالیت کاربران» — any `view_audit` holder, whatever its scope: a
  //   scoped holder is served the department and comment tabs (addendum D83),
  //   so the entry leads somewhere for them too. The screen gates each tab on
  //   the same rule the endpoints apply (D48 — cosmetic; the server refuses).
```

(use whatever the file names the descriptor — `session` above is the name `administrationRefusal(session)` already uses.)

`screens/Visibility.tsx`: below `ROWS` (and the facts rows, if kept in a second array), add:

```tsx
/** The switch names, for the activity record's permission history. */
export const POLICY_LABEL: Record<string, string> =
  Object.fromEntries(ROWS.map((r) => [r.field, r.label]))
```

(include the facts rows too if they live in a separate array.)

- [ ] **Step 9: Run the tests**

Run: `cd ui && npx vitest run src/lib/format.test.ts src/ui/JalaliCalendar.test.tsx src/auth/useSession.test.tsx src/shell/crumbs.test.ts src/shell/shells.test.tsx src/test/theme.test.ts`
Expected: PASS (`theme.test.ts` guards that every class used resolves to a token).

- [ ] **Step 10: Commit**

```bash
git add -A ui
git commit -m "feat(activity): client plumbing — API, heartbeat, Jalali days, labels, menu entry"
```

---

### Task 12: The activity screen — five tabs (D83, D84)

**Files:**
- Create/replace: `ui/src/screens/Activity.tsx`
- Test: `ui/src/screens/Activity.test.tsx` (create)

**Interfaces:**
- Consumes: Task 11's hooks, `EVENT_LABEL`, `COMMENT_STATE`, `hopLabel`, `whenFa`, `durationFa`, `daysSinceFa`, `jalaliDay`, `dayOf`, `CalendarFilter`, `POLICY_LABEL`; shipped `DataTable` (`template="audit"`, `filters`, `pager`), `Pager`, `Dropdown`, `NavTabTray`, `StatTile skin="compact"`, `StatusPill`, `LoadingState`, `LoadFailedScreen`, `RefusalScreen`, `useHistoryState`, `useCan`, `useDepartments`, `useReportNames`, `roleLabel`, `scopeLabel`/`scopesLabel`, `toFa`.

- [ ] **Step 1: Confirm the copy with lili** — before writing the screen, show lili the proposed Persian strings that have no source in the design: every non-design entry of `EVENT_LABEL`, the fifth tab's name «ورود ناموفق» and its footnote, the permission field names, `hopLabel`'s «ادمین‌ها»/«ادیتور», the comment-state pills, and the one-user «تاریخچهٔ فعالیت» crumb. Apply her edits to `events.ts`/`crumbs.ts` before continuing.

- [ ] **Step 2: Write the failing test** — `ui/src/screens/Activity.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Activity } from './Activity'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const CAPS = ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers', 'view_audit'] as const
const ADMIN: SessionDescriptor = { username: '09120000001', displayName: 'مهدی', role: 'admin',
  capabilities: [...CAPS], scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0 }
const SCOPED: SessionDescriptor = { ...ADMIN, scopes: ['dept:cashier'] }
const READER: SessionDescriptor = { ...ADMIN, role: 'reader', capabilities: ['view', 'comment'],
  scopes: ['dept:cooking'] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const now = Math.floor(Date.now() / 1000)
const USERS = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1, username: `0912000000${i}`, displayName: `کاربر ${i + 1}`, role: 'reader',
  scopes: ['dept:cooking'], disabled: false, logins: i, failures: i === 2 ? 3 : 0,
  sessions: i, activeSeconds: 720, lastSeen: now }))

function stub() {
  const gets: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    gets.push(path)
    if (path === '/api/activity/summary') return json(
      session === SCOPED ? { activeUsers: null, views: 4, failedSignIns: null, commentsAwaiting: 1 }
                         : { activeUsers: 7, views: 12, failedSignIns: 5, commentsAwaiting: 2 })
    if (path === '/api/activity/users') return json(USERS)
    if (path === '/api/activity/failures') return json([
      { username: '09129999999', ip: '185.1.1.1', attempts: 6, first: now - 60, last: now }])
    if (path === '/api/activity/departments') return json([
      { code: 'cashier', name: 'صندوق', readers: 0, views: 0, downloads: 0,
        topProcess: null, lastViewed: null }])
    if (path === '/api/departments') return json([{ code: 'cooking', name: 'آشپزخانه', count: 1, subs: 0 },
                                                  { code: 'cashier', name: 'صندوق', count: 1, subs: 0 }])
    if (path === '/api/reports') return json({ reports: [] })
    return json([])
  }))
  return gets
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/activity']}>
        <Routes>
          <Route path="/activity" element={<Activity />} />
          <Route path="/activity/users/:id" element={<p>صفحهٔ کاربر</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>)
}

describe('Activity', () => {
  it('shows a * holder the four counts and five tabs', async () => {
    session = ADMIN; stub(); mount()
    expect(await screen.findByText('۱۲')).toBeTruthy()
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['فعالیت هر کاربر', 'مشاهده دپارتمان', 'تاریخچهٔ مجوزها',
                          'مسیر کامنت‌ها', 'ورود ناموفق'])
  })

  it('pages the users by five and opens one', async () => {
    session = ADMIN; stub(); mount()
    expect(await screen.findByText('کاربر ۱')).toBeTruthy()
    expect(screen.queryByText('کاربر ۶')).toBeNull()
    await userEvent.click(screen.getByText('کاربر ۱'))
    expect(await screen.findByText('صفحهٔ کاربر')).toBeTruthy()
  })

  it('lists failed sign-ins in their own tab', async () => {
    session = ADMIN; stub(); mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'ورود ناموفق' }))
    expect(await screen.findByText('09129999999')).toBeTruthy()
    expect(screen.getByText('۶')).toBeTruthy()
  })

  it('gives a scoped admin two tabs and no *-only counts', async () => {
    session = SCOPED; const gets = stub(); mount()
    expect(await screen.findByText('صندوق')).toBeTruthy()
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['مشاهده دپارتمان', 'مسیر کامنت‌ها'])
    expect(gets).not.toContain('/api/activity/users')
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2))
  })

  it('refuses a reader', async () => {
    session = READER; stub(); mount()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeTruthy()
  })
})
```

(`RefusalScreen status={404}`'s heading is «چیزی اینجا نیست» per `PanelShell`'s comment; if its text differs, assert what `users.test.tsx` asserts for a 404.)

- [ ] **Step 3: Run it to verify it fails**

Run: `cd ui && npx vitest run src/screens/Activity.test.tsx`
Expected: FAIL — the placeholder renders nothing.

- [ ] **Step 4: Write `Activity.tsx`** — page shell and header copy the classes of `Users.tsx` (`data-screen`, `data-col`, `max-w-list`, `data-h1`); the lead paragraph is the design's L2348 sentence verbatim; the four tiles sit in a 4-up grid (`grid grid-cols-4 gap-s6 … max760:grid-cols-2`, the gaps taken from the tokens the design's L2350 12px/20px map to); the tab tray is `NavTabTray wrap`; each tab is its own component mounted only while active, so only its request runs; the footnote is the design's `auditNote` for the tab (L5349–5352), and for «ورود ناموفق» the confirmed Step 1 string.

```tsx
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useDepartments, useReportNames } from '../api/hooks'
import {
  useActivityComments, useActivityDepartments, useActivityFailures, useActivityPermissions,
  useActivitySummary, useActivityUsers,
  type ActivityUser, type CommentFlow, type DeptReadership, type PermissionChange, type SignInFailure,
} from '../api/activity'
import { refusalStatus } from '../api/client'
import { roleLabel } from '../lib/roles'
import { scopeLabel, scopesLabel } from '../lib/scopes'
import { dayOf, daysSinceFa, durationFa, jalaliDay, toFa, whenFa } from '../lib/format'
import { COMMENT_STATE, hopLabel } from '../lib/events'
import { POLICY_LABEL } from './Visibility'
import { DataTable, type TemplatedColumn } from '../ui/DataTable'
import { Dropdown } from '../ui/Dropdown'
import { NavTabTray } from '../ui/NavTabTray'
import { Pager } from '../ui/Pager'
import { StatTile } from '../ui/StatTile'
import { StatusPill } from '../ui/StatusPill'
import { CalendarFilter } from '../ui/JalaliCalendar'
import { LoadFailedScreen, LoadingState } from '../ui/states'
import { RefusalScreen } from './Refusal'
import { useHistoryState } from '../shell/historyState'

type TabId = 'user' | 'read' | 'perm' | 'flow' | 'fails'
/** `star`: access and governance events, served to a `*` holder only (D44). */
const TABS: { id: TabId; label: string; star: boolean }[] = [
  { id: 'user', label: 'فعالیت هر کاربر', star: true },
  { id: 'read', label: 'مشاهده دپارتمان', star: false },
  { id: 'perm', label: 'تاریخچهٔ مجوزها', star: true },
  { id: 'flow', label: 'مسیر کامنت‌ها', star: false },
  { id: 'fails', label: 'ورود ناموفق', star: true },
]
const NOTE: Record<TabId, string> = {
  user: 'زمان فعال از ضربان last_seen انباشته می‌شود، پس حضور واقعی است.',
  read: 'یک ردیف برای هر دپارتمان: آیا کارکنانش رویه را خوانده‌اند.',
  perm: 'هر تغییر دسترسی با عامل، سوژه و مقدار قبل و بعد.',
  flow: 'سرپرستی که روی کامنت نشسته، همین‌جا مرئی می‌شود.',
  fails: 'تلاش با شماره‌هایی که حسابی ندارند هم این‌جا دیده می‌شود.',   // Step 1
}
const PER_PAGE = 5

export function Activity() {
  const session = useSession().data
  const mayReach = useCan(session)
  const any = !!session?.capabilities.includes('view_audit')
  const star = mayReach('view_audit', '*')
  const tabs = TABS.filter((t) => star || !t.star)
  const [picked, setTab] = useHistoryState<TabId>('activity:tab', 'user')
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0]?.id ?? 'read'
  const summary = useActivitySummary(any)
  if (!session) return <div className="flex-1 bg-ink" />
  if (!any) return <RefusalScreen status={404} />
  const refused = refusalStatus(summary.error)
  if (refused) return <RefusalScreen status={refused} />
  const s = summary.data
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v)
  return (
    <div data-screen="activity"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-list mx-auto">
        <h1 data-h1 className="text-title font-extrabold text-role-title-on-field">گزارش فعالیت کاربران</h1>
        <p className="…">{'هر ورود، هر خواندن و هر تغییر دسترسی با نام کنندهٔ آن ثبت می‌شود. این دفتر از هیچ نقشی — از جمله ادیتور — قابل پاک کردن یا تغییر نیست.'}</p>
        <div className="grid grid-cols-4 gap-s6 my-s10 max760:grid-cols-2">
          <StatTile skin="compact" tone="violet" value={n(s?.activeUsers)} label="کاربر فعال" />
          <StatTile skin="compact" tone="ink" value={n(s?.views)} label="بازدید نمایش‌ها" />
          <StatTile skin="compact" tone="conflict" value={n(s?.failedSignIns)} label="ورود ناموفق" />
          <StatTile skin="compact" tone="warn" value={n(s?.commentsAwaiting)} label="کامنت در انتظار" />
        </div>
        <NavTabTray wrap tabs={tabs} value={tab} label="گزارش‌های فعالیت"
          onChange={(id) => setTab(id as TabId)} />
        <div className="mt-s7">
          {tab === 'user' && <UsersTab />}
          {tab === 'read' && <ReadTab />}
          {tab === 'perm' && <PermTab />}
          {tab === 'flow' && <FlowTab />}
          {tab === 'fails' && <FailsTab />}
        </div>
        <p className="…">{NOTE[tab]}</p>
      </div>
    </div>
  )
}

/** Five rows a page over a list already filtered on the client — every list
 *  here is bounded by people or departments, not by events.
 *  ponytail: client-side paging; move it to the server if a tab passes a few
 *  thousand rows. */
function usePaged<T>(key: TabId, rows: T[]) {
  const [page, setPage] = useHistoryState(`activity:${key}:page`, 1)
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const p = Math.min(page, pages)
  const pager = rows.length > PER_PAGE ? (
    <Pager from={(p - 1) * PER_PAGE + 1} to={Math.min(rows.length, p * PER_PAGE)}
      count={rows.length} page={p} pages={pages} onPage={setPage} />
  ) : undefined
  return { shown: rows.slice((p - 1) * PER_PAGE, p * PER_PAGE), pager, reset: () => setPage(1) }
}

/** The filter bar every tab puts in `DataTable`'s `filters` slot, with the row
 *  count at its far end (design L2420). */
function Bar({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-s5 w-full">
      {children}
      <span className="ms-auto text-fs-sm text-muted">{`${toFa(count)} ردیف`}</span>
    </div>
  )
}

function Loading<T>({ q, children }: {
  q: { data?: T; error: unknown; isPending: boolean; refetch: () => unknown }
  children: (data: T) => ReactNode
}) {
  if (q.error) return <LoadFailedScreen message="گزارش بارگذاری نشد." error={q.error}
    onRetry={() => { void q.refetch() }} />
  if (q.isPending || q.data === undefined) return <LoadingState />
  return <>{children(q.data)}</>
}

const opts = (all: string, values: [string, string][]) =>
  [{ value: '', label: all }, ...values.map(([value, label]) => ({ value, label }))]
const uniq = <T,>(xs: T[]) => [...new Set(xs)]
```

Then the five tabs, each following this shape (shown in full for the first; the other four differ only in hook, filters, rows and columns, all listed below):

```tsx
function UsersTab() {
  const q = useActivityUsers()
  const navigate = useNavigate()
  const names = Object.fromEntries((useDepartments().data ?? []).map((d) => [d.code, d.name]))
  const reports = useReportNames()
  const [f, setF] = useHistoryState<{ dept: string; role: string }>('activity:user:f', { dept: '', role: '' })
  return (
    <Loading q={q}>{(users: ActivityUser[]) => {
      const rows = users.filter((u) =>
        (!f.dept || u.scopes.includes('*') || u.scopes.includes(`dept:${f.dept}`)) &&
        (!f.role || u.role === f.role))
      return <UsersTable rows={rows} f={f} setF={setF} users={users} names={names}
        reports={reports} onOpen={(u) => navigate(`/activity/users/${u.id}`)} />
    }}</Loading>
  )
}

function UsersTable({ rows, f, setF, users, names, reports, onOpen }: {
  rows: ActivityUser[]; f: { dept: string; role: string }
  setF: (f: { dept: string; role: string }) => void; users: ActivityUser[]
  names: Record<string, string>; reports: Record<string, string>; onOpen: (u: ActivityUser) => void
}) {
  const { shown, pager, reset } = usePaged('user', rows)
  const set = (k: 'dept' | 'role', v: string) => { setF({ ...f, [k]: v }); reset() }
  const columns: TemplatedColumn<ActivityUser>[] = [
    { key: 'name', head: 'کاربر', grow: true, cell: (u) => (
      <span className="block min-w-0">
        <span className="block truncate text-body font-bold text-ink">{u.displayName}</span>
        <span className="block truncate text-caption text-faint">
          {`${roleLabel(u.role)} · ${scopesLabel(u.scopes, names, reports)}`}</span>
      </span>) },
    { key: 'logins', head: 'ورود', cell: (u) => toFa(u.logins) },
    { key: 'fails', head: 'ناموفق', cell: (u) =>
      <span className={u.failures ? 'text-conflict font-bold' : ''}>{toFa(u.failures)}</span> },
    { key: 'sessions', head: 'نشست', cell: (u) => toFa(u.sessions) },
    { key: 'active', head: 'زمان فعال', cell: (u) =>
      <span className="font-bold text-ink">{durationFa(u.activeSeconds)}</span> },
    { key: 'seen', head: 'آخرین حضور', mobile: false, cell: (u) => whenFa(u.lastSeen) },
  ]
  return (
    <DataTable label="فعالیت هر کاربر" template="audit" rows={shown} rowKey={(u) => String(u.id)}
      onOpen={onOpen} rowLabel={(u) => u.displayName}
      empty="با این فیلترها ردیفی نیست" columns={columns} pager={pager}
      filters={<Bar count={rows.length}>
        <Dropdown label="دپارتمان" hideLabel placeholder="همهٔ دپارتمان‌ها" value={f.dept}
          onChange={(v) => set('dept', v)}
          options={opts('همهٔ دپارتمان‌ها', Object.entries(names))} />
        <Dropdown label="نقش" hideLabel placeholder="همهٔ نقش‌ها" value={f.role}
          onChange={(v) => set('role', v)}
          options={opts('همهٔ نقش‌ها', uniq(users.map((u) => u.role)).map((r) => [r, roleLabel(r)]))} />
      </Bar>} />
  )
}
```

The other four tabs — same `Loading` → filter → `usePaged(key)` → `DataTable template="audit"` shape, `empty="با این فیلترها ردیفی نیست"`, no `onOpen`:

| Tab (`usePaged` key) | Hook | Filters (history slot `activity:{key}:f`) | Columns: head → cell |
|---|---|---|---|
| `read` | `useActivityDepartments` | `dept` (the rows' own codes/names), `seen`: `''` «خوانده‌شده و نخوانده» / `yes` «خوانده‌شده» / `no` «اصلاً باز نشده» (`no` ⇔ `readers === 0`) | «دپارتمان» → `name` + sub-line «هیچ‌کس بازش نکرده» when `views === 0` · «خوانندگان» → `toFa(readers)`, `text-conflict` when 0 · «بازدید» → `toFa(views)` · «دریافت فایل» → `toFa(downloads)` · «بیشترین خوانده‌شده» → `topProcess?.name ?? '—'` · «آخرین بازشدن» → `whenFa(lastViewed)` |
| `perm` | `useActivityPermissions` | `day` via `<CalendarFilter days={count of rows per dayOf(at)} …/>`, `actor`, `subject`, `field` (values from the rows) | «تاریخ» → `jalaliDay(dayOf(at))` · «کنندهٔ تغییر» → `actor` · «سوژه» → `subject`, or «همهٔ غیرادیتورها» for `visibility.policy.changed` · «فیلد» → `fieldLabel(row)` · «قبل ← بعد» → `` `${value(row, row.before)} ← ${value(row, row.after)}` ``, bold · «» → empty |
| `flow` | `useActivityComments` | `dept`, `st` (`COMMENT_STATE` keys) | sorted by `waitingSince` ascending (longest wait first, nulls last) · «کامنت» → `ref` in `font-mono` + sub-line `hopLabel(c)` · «دپارتمان» → department name from `useDepartments` · «نویسنده» → `author` · «وضعیت» → `<StatusPill {...COMMENT_STATE[state]} />` (`tone`/`label`) · «روی میز» → `hopLabel(c)` · «انتظار» → `daysSinceFa(waitingSince)`, `text-conflict` when `state === 'awaiting'` and ≥ 6 days |
| `fails` | `useActivityFailures` | `username`, `ip` (values from the rows, `searchable`) | «نام کاربری» → `username`, `font-mono` `dir="ltr"` · «IP» → `ip`, same · «تلاش» → `toFa(attempts)`, `text-conflict` when ≥ 5 · «نخستین» → `whenFa(first)` · «آخرین» → `whenFa(last)` · «» → empty |

The permission-row helpers, in `Activity.tsx`:

```tsx
const FIELD: Record<string, string> = {
  'role.assigned': 'نقش', 'scope.granted': 'دپارتمان', 'scope.revoked': 'دپارتمان',
  'supervisor.changed': 'سرپرست', 'supervisor_flag.changed': 'پرچم سرپرست‌شدن',
  'user.disabled': 'وضعیت', 'user.enabled': 'وضعیت', 'user.created': 'ساخت حساب',
  'password.set_by_admin': 'گذرواژه',
}
function fieldLabel(r: PermissionChange): string {
  if (r.action === 'visibility.policy.changed')
    return `سیاست نمایش · ${POLICY_LABEL[r.subject ?? ''] ?? r.subject ?? ''}`
  return FIELD[r.action] ?? r.action
}
function value(r: PermissionChange, v: PermissionChange['before'],
               names: Record<string, string>, reports: Record<string, string>): string {
  if (v === null) return '—'
  switch (r.action) {
    case 'role.assigned': case 'user.created': return roleLabel(String(v))
    case 'scope.granted': case 'scope.revoked': return scopeLabel(String(v), names, reports)
    case 'supervisor_flag.changed': return v ? 'دارد' : 'ندارد'
    case 'user.disabled': case 'user.enabled': return v ? 'غیرفعال' : 'فعال'
    case 'visibility.policy.changed': return v ? 'نمایش' : 'پنهان'
    default: return String(v)
  }
}
```

(pass `names`/`reports` into the `perm` tab's cell the way `UsersTab` does; the table row above abbreviates `value(row, x)` for `value(row, x, names, reports)`.)

- [ ] **Step 5: Run the test**

Run: `cd ui && npx vitest run src/screens/Activity.test.tsx src/test/theme.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A ui
git commit -m "feat(activity): the activity screen — five tabs, four counts (D83, D84)"
```

---

### Task 13: The one-user page (D83)

**Files:**
- Create/replace: `ui/src/screens/UserActivity.tsx`
- Test: `ui/src/screens/UserActivity.test.tsx` (create)

**Interfaces:**
- Consumes: `useUserActivity`, `EVENTS_PER_PAGE`, `eventLabel`, `uaLabel`, `CalendarFilter`, format helpers, `DataTable template="activity"`, `StatTile`, `StatusPill`, `Pager`, `Dropdown`, `Card`.

Layout (design L2468–2602): title «تاریخچهٔ فعالیت {displayName}»; meta line `{roleLabel} · {scopesLabel} · آخرین حضور: {whenFa(lastSeen)}`; four compact tiles (value left-aligned per the design's L2475–2482 — if `StatTile` has no such variant, keep its centring and say so in the commit message rather than forking the component); the event table; the sessions card «نشست‌های این کاربر»; the footnote (design L2599 verbatim).

- [ ] **Step 1: Write the failing test** — `ui/src/screens/UserActivity.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserActivity } from './UserActivity'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const ADMIN: SessionDescriptor = { username: '09120000001', displayName: 'مهدی', role: 'admin',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers', 'view_audit'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0 }
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const at = Math.floor(Date.now() / 1000) - 60
const BODY = {
  user: { id: 4, username: '09150000004', displayName: 'نگار مرادی', role: 'reader',
          scopes: ['dept:dining'], disabled: false, logins: 24, failures: 2, sessions: 27,
          activeSeconds: 3120, lastSeen: at },
  total: 8, days: { '20000': 8 },
  rows: [{ id: 2, at, action: 'login.failure', kind: 'access', target: null, ip: '5.120.44.18',
           userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', outcome: 'fail', session: null },
         { id: 1, at, action: 'process.viewed', kind: 'content', target: 'dining-002', ip: '5.120.44.18',
           userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', outcome: 'ok', session: 'a1b2c3' }],
  sessions: [{ session: 'a1b2c3', issuedAt: at - 600, lastSeen: at, ip: '5.120.44.18',
               userAgent: 'Mozilla/5.0 (iPhone) Safari/605', activeSeconds: 540, state: 'active' }],
}

function stub() {
  const gets: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    gets.push(path)
    if (path.startsWith('/api/activity/users/4')) return json(BODY)
    if (path === '/api/departments') return json([{ code: 'dining', name: 'سالن', count: 1, subs: 0 }])
    if (path === '/api/reports') return json({ reports: [] })
    return json({ detail: 'یافت نشد' }, 404)
  }))
  return gets
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={['/activity/users/4']}>
      <Routes><Route path="/activity/users/:id" element={<UserActivity />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
}

describe('UserActivity', () => {
  it('shows the person, their counts, their events and their sessions', async () => {
    session = ADMIN; stub(); mount()
    expect(await screen.findByText('تاریخچهٔ فعالیت نگار مرادی')).toBeTruthy()
    expect(screen.getByText('۲۴')).toBeTruthy()
    expect(screen.getByText('ورود ناموفق', { selector: '[data-event]' })).toBeTruthy()
    expect(screen.getByText('ناموفق')).toBeTruthy()
    expect(screen.getAllByText('کروم · ویندوز').length).toBe(2)
    expect(screen.getByText('نشست‌های این کاربر')).toBeTruthy()
    expect(screen.getByText('سافاری · آیفون', { exact: false })).toBeTruthy()
  })

  it('asks the server for a kind and for the next page', async () => {
    session = ADMIN; const gets = stub(); mount()
    await screen.findByText('تاریخچهٔ فعالیت نگار مرادی')
    await userEvent.click(screen.getByRole('button', { name: 'دسته' }))
    await userEvent.click(screen.getByRole('option', { name: 'محتوا' }))
    await waitFor(() => expect(gets.some((g) => g.includes('kind=content'))).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: /بعدی|صفحهٔ بعد/ }))
    await waitFor(() => expect(gets.some((g) => g.includes('offset=6'))).toBe(true))
  })

  it('is 404 for a scoped holder', async () => {
    session = { ...ADMIN, scopes: ['dept:dining'] }; stub(); mount()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeTruthy()
  })
})
```

(Match the Pager's next-button accessible name and the `Dropdown` trigger/option roles to what `table.test.tsx` and `controls.test.tsx` already query.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ui && npx vitest run src/screens/UserActivity.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `UserActivity.tsx`**

```tsx
import { useParams } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useDepartments, useReportNames } from '../api/hooks'
import { EVENTS_PER_PAGE, useUserActivity, type ActivityEvent, type EventFilters,
         type EventKind } from '../api/activity'
import { refusalStatus } from '../api/client'
import { roleLabel } from '../lib/roles'
import { reportLabel, scopesLabel } from '../lib/scopes'
import { clockFa, dayOf, durationFa, jalaliDay, toFa, whenFa } from '../lib/format'
import { eventLabel, uaLabel } from '../lib/events'
import { Card } from '../ui/Card'
import { DataTable, type TemplatedColumn } from '../ui/DataTable'
import { Dropdown } from '../ui/Dropdown'
import { Pager } from '../ui/Pager'
import { StatTile } from '../ui/StatTile'
import { StatusPill } from '../ui/StatusPill'
import { CalendarFilter } from '../ui/JalaliCalendar'
import { LoadFailedScreen, LoadingState } from '../ui/states'
import { RefusalScreen } from './Refusal'
import { useHistoryState } from '../shell/historyState'

const KINDS: { value: '' | EventKind; label: string }[] = [
  { value: '', label: 'همهٔ دسته‌ها' }, { value: 'access', label: 'دسترسی' },
  { value: 'content', label: 'محتوا' }, { value: 'governance', label: 'راهبری' },
]
const OUTCOMES = [{ value: '', label: 'موفق و ناموفق' }, { value: 'ok', label: 'موفق' },
                  { value: 'fail', label: 'ناموفق' }]
const DOT: Record<string, string> = { access: 'bg-green', content: 'bg-muted', governance: 'bg-violet' }
const SESSION_STATE = { active: 'فعال', revoked: 'ابطال‌شده', expired: 'منقضی' } as const

function target(e: ActivityEvent, names: Record<string, string>,
                reports: Record<string, string>): string {
  if (!e.target) return '—'
  const m = /^dept:([a-z]+)\/report:([a-z]+)$/.exec(e.target)
  if (m) return `${names[m[1]] ?? m[1]} · ${reportLabel(m[2], reports) ?? m[2]}`
  return names[e.target] ?? e.target         // a department code reads as its name
}

export function UserActivity() {
  const { id = '' } = useParams()
  const session = useSession().data
  const star = useCan(session)('view_audit', '*')
  const [f, setF] = useHistoryState<EventFilters>(`activity:u${id}:f`, { page: 1 })
  const q = useUserActivity(id, f, !!session && star)
  const names = Object.fromEntries((useDepartments().data ?? []).map((d) => [d.code, d.name]))
  const reports = useReportNames()
  if (!session) return <div className="flex-1 bg-ink" />
  if (!star) return <RefusalScreen status={404} />
  const refused = refusalStatus(q.error)
  if (refused) return <RefusalScreen status={refused} />
  if (q.error) return <LoadFailedScreen message="تاریخچهٔ فعالیت بارگذاری نشد." error={q.error}
    onRetry={() => { void q.refetch() }} />
  if (!q.data) return <LoadingState />
  const { user, rows, total, days, sessions } = q.data
  const set = (patch: Partial<EventFilters>) => setF({ ...f, ...patch, page: 1 })
  const pages = Math.max(1, Math.ceil(total / EVENTS_PER_PAGE))
  const from = (f.page - 1) * EVENTS_PER_PAGE + 1
  const columns: TemplatedColumn<ActivityEvent>[] = [
    { key: 'at', head: 'تاریخ', cell: (e) => (
      <span className="block"><span className="block text-fs-sm">{jalaliDay(dayOf(e.at))}</span>
        <span className="block text-caption text-faint">{clockFa(e.at)}</span></span>) },
    { key: 'action', head: 'رویداد', grow: true, cell: (e) => (
      <span className="flex items-center gap-s3 min-w-0">
        <span className={`w-dot h-dot rounded-round flex-none ${e.outcome !== 'ok' ? 'bg-conflict' : DOT[e.kind]}`} />
        <span data-event className="truncate">{eventLabel(e.action)}</span></span>) },
    { key: 'target', head: 'هدف', cell: (e) => <span className="truncate">{target(e, names, reports)}</span> },
    { key: 'ip', head: 'IP', mobile: false, cell: (e) =>
      <span dir="ltr" className="font-mono text-fs-sm">{toFa(e.ip || '—')}</span> },
    { key: 'ua', head: 'دستگاه', mobile: false, cell: (e) => uaLabel(e.userAgent) },
    { key: 'out', head: 'نتیجه', cell: (e) =>
      <StatusPill tone={e.outcome === 'ok' ? 'ok' : 'danger'} label={e.outcome === 'ok' ? 'موفق' : 'ناموفق'} /> },
  ]
  const any = f.day !== undefined || !!f.kind || !!f.outcome
  return (
    <div data-screen="user-activity"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-list mx-auto">
        <h1 data-h1 className="text-title font-extrabold text-role-title-on-field">
          {`تاریخچهٔ فعالیت ${user.displayName}`}</h1>
        <p className="…">{`${roleLabel(user.role)} · ${scopesLabel(user.scopes, names, reports)} · آخرین حضور: ${whenFa(user.lastSeen)}`}</p>
        <div className="grid grid-cols-4 gap-s6 my-s10 max760:grid-cols-2">
          <StatTile skin="compact" tone="violet" value={user.logins} label="ورود موفق" />
          <StatTile skin="compact" tone={user.failures ? 'conflict' : 'ink'} value={user.failures} label="ورود ناموفق" />
          <StatTile skin="compact" tone="ink" value={user.sessions} label="نشست" />
          <StatTile skin="compact" tone="ok" value={durationFa(user.activeSeconds)} label="زمان فعال" />
        </div>
        <DataTable label="رویدادهای کاربر" template="activity" rows={rows}
          rowKey={(e) => String(e.id)}
          empty="رویدادی از این دسته ثبت نشده است" columns={columns}
          pager={total > EVENTS_PER_PAGE ? (
            <Pager from={from} to={Math.min(total, from + rows.length - 1)} count={total}
              page={f.page} pages={pages} onPage={(page) => setF({ ...f, page })} />) : undefined}
          filters={<div className="flex flex-wrap items-center gap-s5 w-full">
            <CalendarFilter days={days} value={f.day ?? null}
              onPick={(day) => set({ day: day ?? undefined })} />
            <Dropdown label="دسته" hideLabel placeholder="همهٔ دسته‌ها" value={f.kind ?? ''}
              onChange={(v) => set({ kind: (v || undefined) as EventKind | undefined })} options={KINDS} />
            <Dropdown label="نتیجه" hideLabel placeholder="موفق و ناموفق" value={f.outcome ?? ''}
              onChange={(v) => set({ outcome: (v || undefined) as 'ok' | 'fail' | undefined })} options={OUTCOMES} />
            {any && <button type="button" className="text-conflict underline text-fs-sm"
              onClick={() => setF({ page: 1 })}>پاک کردن فیلترها</button>}
          </div>} />
        <Card className="mt-s10">
          {/* design L2581–2597: header bar, then one row per session */}
          <div className="bg-tile-v4 border-b border-line px-s9 py-s6 font-bold text-ink">نشست‌های این کاربر</div>
          {sessions.length === 0
            ? <p className="text-center text-muted py-s9">نشستی ثبت نشده است</p>
            : sessions.map((s) => (
              <div key={s.session} className="flex items-center justify-between gap-s6 px-s9 py-s6 border-b border-line">
                <span className="min-w-0">
                  <span dir="ltr" className="font-mono text-fs-sm">{s.session}</span>
                  <span className="block text-caption text-faint">
                    {`${whenFa(s.issuedAt)} ← ${whenFa(s.lastSeen)} · ${uaLabel(s.userAgent)} · ${toFa(s.ip)}`}</span>
                </span>
                <span className="text-green font-bold">{durationFa(s.activeSeconds)}</span>
                <span className="text-fs-sm text-muted">{SESSION_STATE[s.state]}</span>
              </div>))}
        </Card>
        <p className="…">{'دفتر رویداد فقط زمان، عامل، نشست، رویداد، هدف، IP، دستگاه و نتیجه را نگه می‌دارد؛ چیزی بیش از این ثبت نمی‌شود. زمان فعال هر نشست از ضربان last_seen انباشته می‌شود، نه از فاصلهٔ ورود تا خروج.'}</p>
      </div>
    </div>
  )
}
```

Every `className` with `…` above takes its classes from the design lines named in the comment, translated to existing tokens as `Users.tsx`/`PanelInbox.tsx` already do; `theme.test.ts` fails on any class that is not a token. Check `bg-muted` exists (else use the token the design's `#8a7db0` maps to).

- [ ] **Step 4: Run the tests**

Run: `cd ui && npx vitest run src/screens/UserActivity.test.tsx src/screens/Activity.test.tsx src/test/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A ui
git commit -m "feat(activity): the one-user page — counts, events by day, kind and outcome, sessions (D83)"
```

---

### Task 14: Docs, the full check, and the running app

**Files:**
- Modify: `ARD.md` (§13.2, §16, §19.7), `docs/runbooks/02-secrets-and-auth.md` (§5 backup), `docs/runbooks/05-operations.md` (Backup & restore), `docs/superpowers/specs/2026-09-27-activity-record-addendum.md` (two corrections), `docs/runbooks/03-deploy.md` (P3 cutover note)

- [ ] **Step 1: The addendum's two corrections** — in D78's table remove `POST /{pid}/relayout` and add a sentence: "Relayout writes nothing to disk — it returns a laid-out document the client then saves — so it records nothing." In D84 item 5 replace the sentence with: "**Phone width:** the tables use `DataTable`'s existing ≤760px collapse (each row becomes a stacked line); the page never scrolls sideways."

- [ ] **Step 2: ARD**
  - §13.2 "Writes are attributed": true now — `ui-edit` commits carry `Acted-By: {username}` (D78).
  - §16: the `state-backup` row becomes "backups — inside `ui-backend`'s background loop (not a container: a container would have to mount `app.db`, D5) at 11:00/23:00 to `/opt/inja/backups`, 14 of each file kept, mode 0600; on the host, **not off-site** — NFR-16 remains unmet for host loss". Update the §16/§18 traceability rows that name `state-backup`.
  - §19.7: add the P3 as-built paragraph — server-written views with the 30-minute window, edit events from endpoints, the git projection with its actor table and `projection.discontinuity`, staleness at HEAD with `emitted_for_sha`, presence intervals with the 60-second visible-only heartbeat, and the five reports with D44's scope rule.

- [ ] **Step 3: Runbooks**
  - `02-secrets-and-auth.md` §5 and `05-operations.md` Backup & restore: replace "not built yet … take the backup by hand" with: where the copies are (`/opt/inja/backups/app-YYYYmmdd-HH00.db`, `comments-…db`), how often, how many are kept, that they are secrets (password hashes; `sudo` to read), that they are **on the same host** — keep the existing by-hand recipe as "getting a copy off the server" (`scp` the newest pair off the host) — and a restore: `docker compose stop ui-backend`; copy the chosen `app-….db` onto the `ui-state` volume as `/state/app.db` (and `comments-….db` onto `ui-comments` as `/comments/comments.db`), deleting any `-wal`/`-shm` beside the target; `docker compose start ui-backend`.
  - `03-deploy.md`: a P3 cutover note — before the first `up` with this release, `sudo mkdir -p /opt/inja/backups && sudo chmod 700 /opt/inja/backups`; only `ui-backend` is rebuilt; migration 4 runs on start (verify: `schema_version` = 4, the four new objects exist, every earlier table's row count unchanged — the P2 practice); the projection seeds itself at the data-repo's HEAD on its first pass, so no history is back-filled.

- [ ] **Step 4: Full check** (the one full sweep in this plan)

Run: `make test` at the worktree root, then `cd ui && npx vitest run && npm run build`.
Expected: all green; the two known `upload-bot/test_app_build.py` failures are pre-existing and unrelated — report them as such, nothing else may fail.

- [ ] **Step 5: See it running** — local Docker stack (`deploy/docker-compose.local.yml`, TEST bots only), after `npm --prefix ui run build` **restart** `ui-backend` (the running container keeps the deleted `ui/dist` otherwise). In Chrome, as the seeded Editor: open «گزارش فعالیت کاربران» from the admin menu; check the four counts, all five tabs, a filter, paging, a row opening the one-user page, its calendar, kind/outcome filters, pager and sessions card; at 390px width check nothing scrolls the page sideways. Compare against `ui/design/Inja Panel.dc.html` side by side; list any visual difference for lili rather than silently "fixing" the design.

- [ ] **Step 6: Commit**

```bash
git add -A ARD.md docs
git commit -m "docs(activity): ARD, runbooks and the addendum describe P3 as built"
```

Then use superpowers:finishing-a-development-branch. Merging, pushing and deploying are lili's decisions — present the options, do not act.
