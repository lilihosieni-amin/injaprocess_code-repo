# P0a — Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single shared credential with real per-person accounts — a SQLite store, seeded roles, server-side revocable sessions, mobile-number sign-in, and the activity events those produce.

**Architecture:** A new `app.db` beside the existing JSON data, reached through stdlib `sqlite3` with no ORM — the project already refuses one for process content, and this store has four tables and no relational complexity worth a dependency. Sessions become rows, so access can be revoked; the cookie carries an opaque id and nothing else. Schema is a list of numbered migrations applied at startup, so the same code creates a fresh database and upgrades an existing one.

**Tech Stack:** FastAPI, stdlib `sqlite3`, `argon2-cffi` (already a dependency), `itsdangerous` (already, for signing the opaque session id), pytest + `TestClient`. Frontend: React 19 + the F design system.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-multi-user-rbac-design.md` — decisions **D1, D5, D6, D7, D15, D41, D42, D50, D56, D57, D58** and `§10` (migration). Where anything here disagrees, the spec wins.
- **This plan does NOT implement authorisation.** Capabilities and scopes are stored and returned, never enforced — every endpoint keeps behaving exactly as it does today. Enforcement is P0b. Do not add capability checks to routers.
- **Username is `^09\d{9}$`** and nothing else (D57). Input is normalised before storage and before comparison.
- **Password minimum is six characters.** No other rule (D58).
- **Backend tests:** run from the repo root with the root venv — `.venv/bin/pytest ui-backend/tests -q`. There are **250 passing** today. `ui-backend/.venv` lacks pytest; do not use it.
- **Frontend tests:** `cd ui && npx vitest run`. **491 passing** today. Vitest runs `globals: false` — import `describe`/`it`/`expect` from `vitest` explicitly.
- **`npm run build` is mandatory frontend verification.** Three bugs in the previous sub-project were invisible to vitest and tsc and visible only to a real build.
- **No hex colours, no `text-[…]`/`rounded-[…]`/`shadow-[…]` under `ui/src/**`**, no physical CSS properties. `ui/src/test/guards.test.ts` enforces this and polices `src/auth/`, `src/shell/`, `src/styles/`, `src/ui/`.
- **Do not touch** `ui/src/flow/**`, `ui/export/**`, `engine/`, or anything under `data-repo`.
- **Existing test idiom** (`ui-backend/tests/test_auth.py`): build a `Settings` with `cfg_for(data_root)`, mutate by `cfg.__class__(**{**cfg.__dict__, ...})`, then `TestClient(create_app(cfg), base_url="https://testserver")`. **The `https://` base URL is load-bearing** — the cookie is `Secure`, and TestClient's jar will not send it over `http://`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/db.py` | Connection factory, WAL setup, the numbered migration list, `migrate()`. The only module that knows SQL DDL. |
| `ui-backend/inja_ui_backend/store/users.py` | User row read/write: create, fetch by username, fetch by id, set password, enable/disable. No HTTP, no policy. |
| `ui-backend/inja_ui_backend/store/sessions.py` | Session row lifecycle: issue, resolve, touch, revoke, revoke-all-for-user. |
| `ui-backend/inja_ui_backend/store/audit.py` | Append-only event writer. One function, deliberately narrow. |
| `ui-backend/inja_ui_backend/phone.py` | `to_latin_digits`, `normalise_phone` — the server twin of `ui/src/lib/digits.ts`. |
| `ui-backend/inja_ui_backend/seed.py` | Creates the four roles and the first Editor. The only origin of non-delegable capabilities. |
| `ui-backend/tests/test_db.py`, `test_phone.py`, `test_sessions.py`, `test_auth_multiuser.py`, `test_seed.py` | New backend tests. |
| `ui/src/screens/SignIn.tsx` | The sign-in screen. |
| `ui/src/screens/SignIn.test.tsx` | Its tests. |
| `ui/src/auth/useSession.ts` | `useSession()` — the real `GET /api/auth/me`, replacing the placeholder. |

**Modified:** `ui-backend/inja_ui_backend/auth.py` (rewritten), `config.py` (`app_db` path), `app.py` (migrate + seed at startup), `routers/auth.py` (rewritten), `ui-backend/requirements.txt` + `pyproject.toml` (no new deps expected — confirm), `ui/src/routes.tsx` (drop the placeholder), `ui/src/auth/RequireAuth.tsx`, `ui/src/api/hooks.ts`, `ui/src/api/types.ts`.

**Deleted:** `ui/src/screens/Login.tsx` and its route (replaced by `SignIn.tsx`).

---

### Task 1: The database module and its migrations

**Files:**
- Create: `ui-backend/inja_ui_backend/db.py`, `ui-backend/tests/test_db.py`
- Modify: `ui-backend/inja_ui_backend/config.py`

**Interfaces:**
- Consumes: `Settings` from `config.py`.
- Produces: `connect(path: Path) -> sqlite3.Connection`, `migrate(conn) -> int` returning the schema version reached, and `SCHEMA_VERSION: int`. `Settings` gains `app_db: Path`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_db.py`:

```python
import sqlite3

from inja_ui_backend.db import SCHEMA_VERSION, connect, migrate


def test_migrate_creates_every_table(tmp_path):
    conn = connect(tmp_path / "app.db")
    assert migrate(conn) == SCHEMA_VERSION
    names = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"schema_version", "roles", "users", "user_scopes",
            "sessions", "audit_events"} <= names


def test_migrate_is_idempotent(tmp_path):
    path = tmp_path / "app.db"
    conn = connect(path)
    migrate(conn)
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('x', '[]')")
    conn.commit()
    conn.close()

    again = connect(path)
    assert migrate(again) == SCHEMA_VERSION      # no error, no reset
    assert again.execute("SELECT COUNT(*) FROM roles").fetchone()[0] == 1


def test_wal_is_enabled(tmp_path):
    conn = connect(tmp_path / "app.db")
    assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"


def test_foreign_keys_are_enforced(tmp_path):
    conn = connect(tmp_path / "app.db")
    migrate(conn)
    # A session must belong to a real user; the FK is what makes revoking on
    # delete meaningful rather than leaving orphan rows behind.
    try:
        conn.execute(
            "INSERT INTO sessions (id, user_id, issued_at, last_seen, ip, user_agent)"
            " VALUES ('s1', 999, 1, 1, '', '')")
        conn.commit()
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised


def test_usernames_are_unique_across_disabled_accounts(tmp_path):
    # D57: a disabled user keeps their number, so a recycled line cannot inherit
    # a former employee's identity.
    conn = connect(tmp_path / "app.db")
    migrate(conn)
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('reader', '[]')")
    rid = conn.execute("SELECT id FROM roles").fetchone()[0]
    conn.execute(
        "INSERT INTO users (username, display_name, password_hash, role_id, disabled_at)"
        " VALUES ('09120000001', 'A', 'h', ?, 123)", (rid,))
    conn.commit()
    try:
        conn.execute(
            "INSERT INTO users (username, display_name, password_hash, role_id)"
            " VALUES ('09120000001', 'B', 'h', ?)", (rid,))
        conn.commit()
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_db.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'inja_ui_backend.db'`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/db.py`:

```python
"""The operational store (spec D1, D6).

stdlib sqlite3, no ORM. The project already refuses an ORM for process content;
this store has four tables and no relational complexity that would justify a
dependency. Schema is a list of numbered migrations so the same code path
creates a fresh database and upgrades an existing one.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

# Every migration is (version, sql). Append only — never edit a shipped one.
MIGRATIONS: list[tuple[int, str]] = [
    (1, """
        CREATE TABLE schema_version (version INTEGER NOT NULL);

        CREATE TABLE roles (
            id           INTEGER PRIMARY KEY,
            name         TEXT NOT NULL UNIQUE,
            capabilities TEXT NOT NULL          -- JSON array of capability names
        );

        CREATE TABLE users (
            id            INTEGER PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE, -- canonical ^09\\d{9}$ (D57)
            display_name  TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role_id       INTEGER NOT NULL REFERENCES roles(id),
            supervisor_id INTEGER REFERENCES users(id),
            can_supervise INTEGER NOT NULL DEFAULT 0,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            disabled_at   INTEGER
        );

        CREATE TABLE user_scopes (
            user_id INTEGER NOT NULL REFERENCES users(id),
            scope   TEXT NOT NULL,              -- '*' | 'dept:x' | 'dept:x/report:k'
            PRIMARY KEY (user_id, scope)
        );

        CREATE TABLE sessions (
            id         TEXT PRIMARY KEY,        -- opaque; the cookie carries only this
            user_id    INTEGER NOT NULL REFERENCES users(id),
            issued_at  INTEGER NOT NULL,
            last_seen  INTEGER NOT NULL,
            ip         TEXT NOT NULL,
            user_agent TEXT NOT NULL,
            revoked_at INTEGER
        );

        CREATE TABLE audit_events (
            id         INTEGER PRIMARY KEY,
            at         INTEGER NOT NULL,
            actor      TEXT NOT NULL,           -- username, or 'agent:...' / 'run:...'
            session_id TEXT,
            action     TEXT NOT NULL,
            target     TEXT,
            ip         TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',
            outcome    TEXT NOT NULL DEFAULT 'ok',
            detail     TEXT                     -- JSON, for reason/before/after
        );
        CREATE INDEX audit_at ON audit_events (at);
        CREATE INDEX audit_actor ON audit_events (actor, at);
    """),
]

SCHEMA_VERSION = MIGRATIONS[-1][0]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.row_factory = sqlite3.Row
    # WAL so a reader never blocks the writer; foreign keys are off by default in
    # sqlite and the session/user relationship depends on them.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _current_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).fetchone()
    if row is None:
        return 0
    got = conn.execute("SELECT version FROM schema_version").fetchone()
    return got[0] if got else 0


def migrate(conn: sqlite3.Connection) -> int:
    version = _current_version(conn)
    for target, sql in MIGRATIONS:
        if target <= version:
            continue
        conn.executescript(sql)
        conn.execute("DELETE FROM schema_version")
        conn.execute("INSERT INTO schema_version (version) VALUES (?)", (target,))
        version = target
    return version
```

- [ ] **Step 4: Add the path to `Settings`**

In `ui-backend/inja_ui_backend/config.py`, add `app_db: Path` to the `Settings` dataclass fields, and in `load_settings` build it as:

```python
    app_db = Path(env["APP_DB"]) if env.get("APP_DB") else data_root.parent / "app.db"
```

placing it in the `Settings(...)` construction. Default it beside `DATA_ROOT` rather than inside it — the store is operational state and must never enter the data-repo working tree.

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_db.py -q`
Expected: PASS — 5 tests.

- [ ] **Step 6: Confirm nothing else broke**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: 255 passed (250 + 5). If `cfg_for` fails because `Settings` gained a required field, fix `tests_helpers.py` to supply `app_db` — that is expected and in scope.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/db.py ui-backend/inja_ui_backend/config.py ui-backend/tests/test_db.py ui-backend/inja_ui_backend/tests_helpers.py
git commit -m "feat(backend): the operational store, as numbered migrations

stdlib sqlite3 and no ORM — the project already refuses one for process content
and this store has four tables. Migrations are a list so one code path both
creates a fresh database and upgrades an existing one.

The database lives beside DATA_ROOT rather than inside it: it is operational
state and must never appear in the data-repo working tree."
```

---

### Task 2: Phone-number normalisation

**Files:**
- Create: `ui-backend/inja_ui_backend/phone.py`, `ui-backend/tests/test_phone.py`

**Interfaces:**
- Produces: `to_latin_digits(s: str) -> str`, `normalise_phone(s: str) -> str`, `USERNAME_RE: re.Pattern`.

This is the server twin of `ui/src/lib/digits.ts`. **Read that file first and mirror its behaviour exactly** — if the two disagree, one person can hold two identities, which is the whole reason D57 specifies normalisation.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_phone.py`:

```python
import pytest

from inja_ui_backend.phone import USERNAME_RE, normalise_phone, to_latin_digits


def test_folds_persian_digits():
    assert to_latin_digits("۰۹۱۲۳۴۵۶۷۸۹") == "09123456789"


def test_folds_arabic_indic_digits():
    assert to_latin_digits("٠٩١٢٣٤٥٦٧٨٩") == "09123456789"


def test_leaves_other_text_alone():
    assert to_latin_digits("cashier-013") == "cashier-013"


@pytest.mark.parametrize("raw", [
    "09123456789",
    "0912 345 6789",
    "0912-345-6789",
    "(0912) 3456789",
    "+989123456789",
    "00989123456789",
    "989123456789",
    "+۹۸۹۱۲۳۴۵۶۷۸۹",
    # The shape a non-technical user actually types when told to add a country
    # code: they prepend it to the number they already know, zero and all.
    "+98 0912 345 6789",
    "0098 0912 345 6789",
    "98 0912 345 6789",
    "+۹۸۰۹۱۲۳۴۵۶۷۸۹",
])
def test_every_spelling_lands_on_one_canonical_form(raw):
    assert normalise_phone(raw) == "09123456789"


def test_does_not_mistake_a_subscriber_98_for_a_country_code():
    assert normalise_phone("09891234567") == "09891234567"


def test_empty_input_stays_empty():
    assert normalise_phone("") == ""
    assert normalise_phone("   ") == ""


def test_username_regex_accepts_only_the_canonical_form():
    assert USERNAME_RE.fullmatch("09123456789")
    assert not USERNAME_RE.fullmatch("9123456789")     # missing leading zero
    assert not USERNAME_RE.fullmatch("091234567890")   # too long
    assert not USERNAME_RE.fullmatch("08123456789")    # not a mobile prefix
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_phone.py -q`
Expected: FAIL — no module named `phone`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/phone.py`:

```python
"""Canonical Iranian mobile numbers (spec D57).

The twin of ui/src/lib/digits.ts. If the two ever disagree, the same person can
hold two account identities, which is precisely what the canonical form exists
to prevent — so changes here need the same change there, and vice versa.
"""
from __future__ import annotations

import re

USERNAME_RE = re.compile(r"^09\d{9}$")

_PERSIAN = "۰۱۲۳۴۵۶۷۸۹"
_ARABIC = "٠١٢٣٤٥٦٧٨٩"
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate(_PERSIAN)}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate(_ARABIC)})

_SEPARATORS = re.compile(r"[\s\-()]")
_COUNTRY_CODE = re.compile(r"^(?:\+98|0098|98)")


def to_latin_digits(s: str) -> str:
    """Fold Persian and Arabic-Indic digits to ASCII.

    Not optional in a Persian-language product: ordinary keyboards emit ۰۹…, and
    a username that reaches storage unfolded is a different string from the same
    number typed on a latin keyboard.
    """
    return s.translate(_DIGIT_MAP)


def normalise_phone(raw: str) -> str:
    digits = _SEPARATORS.sub("", to_latin_digits(raw))
    if not digits:
        return ""
    # Strip a country code however it was written, then any trunk zeros it was
    # prepended to, then restore exactly one.
    national = _COUNTRY_CODE.sub("", digits).lstrip("0")
    return f"0{national}" if national else ""
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_phone.py -q`
Expected: PASS — 18 tests (12 parametrised + 6).

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/phone.py ui-backend/tests/test_phone.py
git commit -m "feat(backend): canonical mobile numbers, folded before storage

The server twin of digits.ts. Persian keyboards emit ۰۹…, and a country code
prepended to a number that kept its leading zero is how someone told to 'add
+98' actually types it — both have to land on one string, or one person holds
two identities."
```

---

### Task 3: The user and session stores

**Files:**
- Create: `ui-backend/inja_ui_backend/store/__init__.py` (empty), `store/users.py`, `store/sessions.py`, `store/audit.py`, `ui-backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `db.connect`, `db.migrate`.
- Produces:
  - `users.create(conn, *, username, display_name, password_hash, role_id, supervisor_id=None, can_supervise=False) -> int`
  - `users.by_username(conn, username) -> sqlite3.Row | None`, `users.by_id(conn, user_id) -> sqlite3.Row | None`
  - `users.set_password(conn, user_id, password_hash) -> None`, `users.set_disabled(conn, user_id, disabled: bool) -> None`
  - `sessions.issue(conn, user_id, *, ip, user_agent, now) -> str`
  - `sessions.resolve(conn, session_id, *, ttl, now) -> sqlite3.Row | None` — returns `None` for unknown, revoked, expired, or belonging to a disabled user; touches `last_seen` on success
  - `sessions.revoke(conn, session_id, now) -> None`, `sessions.revoke_all_for_user(conn, user_id, now, *, except_session=None) -> int`
  - `audit.record(conn, *, actor, action, now, session_id=None, target=None, ip="", user_agent="", outcome="ok", detail=None) -> None`

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_sessions.py`:

```python
import json

from inja_ui_backend import db
from inja_ui_backend.store import audit, sessions, users

TTL = 86400


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('reader', ?)",
                 (json.dumps(["view"]),))
    return conn


def _user(conn, username="09120000001"):
    rid = conn.execute("SELECT id FROM roles").fetchone()[0]
    return users.create(conn, username=username, display_name="آزمون",
                        password_hash="h", role_id=rid)


def test_issue_then_resolve_returns_the_user(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    sid = sessions.issue(conn, uid, ip="1.2.3.4", user_agent="ua", now=1000)
    row = sessions.resolve(conn, sid, ttl=TTL, now=1001)
    assert row is not None and row["user_id"] == uid


def test_resolve_touches_last_seen(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    sessions.resolve(conn, sid, ttl=TTL, now=1500)
    assert conn.execute("SELECT last_seen FROM sessions").fetchone()[0] == 1500


def test_expiry_is_absolute_from_issue_not_sliding_from_last_seen(tmp_path):
    # D7: sliding expiry keyed on last_seen would mean a session with an open
    # tab never ends, and the heartbeat runs while a TAB is open, not while a
    # person is present.
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL - 1) is not None
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL + 1) is None


def test_revoked_session_stops_resolving(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    sessions.revoke(conn, sid, now=1100)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1101) is None


def test_disabling_a_user_kills_their_live_sessions(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    users.set_disabled(conn, uid, True)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1001) is None


def test_revoke_all_can_spare_the_current_session(tmp_path):
    # Changing your own password should not sign you out of the tab you did it in.
    conn = _conn(tmp_path)
    uid = _user(conn)
    keep = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    other = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    n = sessions.revoke_all_for_user(conn, uid, now=1100, except_session=keep)
    assert n == 1
    assert sessions.resolve(conn, keep, ttl=TTL, now=1101) is not None
    assert sessions.resolve(conn, other, ttl=TTL, now=1101) is None


def test_session_ids_are_unguessable_and_distinct(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    ids = {sessions.issue(conn, uid, ip="", user_agent="", now=1000)
           for _ in range(50)}
    assert len(ids) == 50
    assert all(len(i) >= 32 for i in ids)


def test_audit_rows_are_append_only_in_practice(tmp_path):
    conn = _conn(tmp_path)
    audit.record(conn, actor="09120000001", action="login.success", now=1000)
    audit.record(conn, actor="09120000001", action="logout", now=1100)
    rows = conn.execute("SELECT action FROM audit_events ORDER BY id").fetchall()
    assert [r[0] for r in rows] == ["login.success", "logout"]


def test_audit_detail_round_trips_as_json(tmp_path):
    conn = _conn(tmp_path)
    audit.record(conn, actor="?", action="login.failure", now=1,
                 outcome="fail", detail={"reason": "no_such_user"})
    got = conn.execute("SELECT detail FROM audit_events").fetchone()[0]
    assert json.loads(got) == {"reason": "no_such_user"}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_sessions.py -q`
Expected: FAIL — no module named `inja_ui_backend.store`.

- [ ] **Step 3: Write `store/users.py`**

Create `ui-backend/inja_ui_backend/store/__init__.py` (empty) and `store/users.py`:

```python
"""User rows. No policy, no HTTP — delegation rules live in P0c."""
from __future__ import annotations

import sqlite3


def create(conn: sqlite3.Connection, *, username: str, display_name: str,
           password_hash: str, role_id: int, supervisor_id: int | None = None,
           can_supervise: bool = False) -> int:
    cur = conn.execute(
        "INSERT INTO users (username, display_name, password_hash, role_id,"
        " supervisor_id, can_supervise) VALUES (?, ?, ?, ?, ?, ?)",
        (username, display_name, password_hash, role_id, supervisor_id,
         1 if can_supervise else 0),
    )
    return int(cur.lastrowid)


def by_username(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def by_id(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def set_password(conn: sqlite3.Connection, user_id: int, password_hash: str) -> None:
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                 (password_hash, user_id))


def set_disabled(conn: sqlite3.Connection, user_id: int, disabled: bool) -> None:
    conn.execute("UPDATE users SET disabled_at = ? WHERE id = ?",
                 (_now() if disabled else None, user_id))


def _now() -> int:
    import time
    return int(time.time())
```

- [ ] **Step 4: Write `store/sessions.py`**

```python
"""Session rows (spec D7).

A session is a row so it can be revoked, so 'who is here now' is answerable, and
so presence can be measured. The cookie carries this id and nothing else.
"""
from __future__ import annotations

import secrets
import sqlite3


def issue(conn: sqlite3.Connection, user_id: int, *, ip: str, user_agent: str,
          now: int) -> str:
    sid = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (id, user_id, issued_at, last_seen, ip, user_agent)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (sid, user_id, now, now, ip, user_agent),
    )
    return sid


def resolve(conn: sqlite3.Connection, session_id: str, *, ttl: int,
            now: int) -> sqlite3.Row | None:
    """Return the session row, or None if it cannot be used.

    Expiry is ABSOLUTE from issued_at, never sliding from last_seen: the
    heartbeat runs while a tab is open, not while a person is present, so a
    sliding window would make 'signed in' unbounded for anyone who leaves the
    app open.
    """
    row = conn.execute(
        "SELECT s.*, u.disabled_at AS user_disabled_at FROM sessions s"
        " JOIN users u ON u.id = s.user_id WHERE s.id = ?", (session_id,)
    ).fetchone()
    if row is None or row["revoked_at"] is not None:
        return None
    if row["user_disabled_at"] is not None:
        return None
    if now - row["issued_at"] >= ttl:
        return None
    conn.execute("UPDATE sessions SET last_seen = ? WHERE id = ?", (now, session_id))
    return row


def revoke(conn: sqlite3.Connection, session_id: str, now: int) -> None:
    conn.execute(
        "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
        (now, session_id))


def revoke_all_for_user(conn: sqlite3.Connection, user_id: int, now: int, *,
                        except_session: str | None = None) -> int:
    sql = ("UPDATE sessions SET revoked_at = ? WHERE user_id = ?"
           " AND revoked_at IS NULL")
    args: list[object] = [now, user_id]
    if except_session is not None:
        sql += " AND id != ?"
        args.append(except_session)
    return int(conn.execute(sql, args).rowcount)
```

- [ ] **Step 5: Write `store/audit.py`**

```python
"""The activity record (spec D41, D45).

Append-only by construction: this module offers no update and no delete, and no
endpoint anywhere exposes one. A record the top user can rewrite records nothing.
"""
from __future__ import annotations

import json
import sqlite3


def record(conn: sqlite3.Connection, *, actor: str, action: str, now: int,
           session_id: str | None = None, target: str | None = None,
           ip: str = "", user_agent: str = "", outcome: str = "ok",
           detail: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_events (at, actor, session_id, action, target, ip,"
        " user_agent, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (now, actor, session_id, action, target, ip, user_agent, outcome,
         json.dumps(detail, ensure_ascii=False) if detail is not None else None),
    )
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_sessions.py -q`
Expected: PASS — 9 tests.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/store ui-backend/tests/test_sessions.py
git commit -m "feat(backend): sessions become rows, so access can be taken away

A signed blob carrying a username cannot be revoked, cannot answer who is here
now, and cannot measure presence. Expiry is absolute from issue rather than
sliding from last_seen, because the heartbeat runs while a tab is open, not
while a person is.

The audit module offers no update and no delete. That is the point of it."
```

---

### Task 4: The seed

**Files:**
- Create: `ui-backend/inja_ui_backend/seed.py`, `ui-backend/tests/test_seed.py`

**Interfaces:**
- Consumes: `db`, `store.users`.
- Produces: `ROLES: dict[str, list[str]]`, `NON_DELEGABLE: frozenset[str]`, `seed(conn, *, editor_username, editor_display_name, editor_password_hash) -> None`.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_seed.py`:

```python
import json

from inja_ui_backend import db, seed
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    return conn


def _seed(conn):
    seed.seed(conn, editor_username="09120000000",
              editor_display_name="تحلیل‌گر", editor_password_hash="h")


def test_seeds_four_roles(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    names = {r["name"] for r in conn.execute("SELECT name FROM roles")}
    assert names == {"reader", "reader_no_download", "admin", "editor"}


def test_roles_are_strictly_nested(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    caps = {r["name"]: set(json.loads(r["capabilities"]))
            for r in conn.execute("SELECT name, capabilities FROM roles")}
    assert caps["reader"] < caps["admin"] < caps["editor"]
    # reader_no_download is a reader minus the download, and nothing else.
    assert caps["reader"] - caps["reader_no_download"] == {"export_pdf"}


def test_only_the_editor_holds_the_non_delegable_capabilities(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    for row in conn.execute("SELECT name, capabilities FROM roles"):
        held = set(json.loads(row["capabilities"])) & seed.NON_DELEGABLE
        assert held == (seed.NON_DELEGABLE if row["name"] == "editor" else set())


def test_the_editor_keeps_comment(tmp_path):
    # D11: removing it would make Reader NOT a subset of Editor, and the editor
    # could then create neither a Reader nor an Admin — every user the system has.
    conn = _conn(tmp_path)
    _seed(conn)
    caps = json.loads(conn.execute(
        "SELECT capabilities FROM roles WHERE name='editor'").fetchone()[0])
    assert "comment" in caps


def test_creates_one_user_scoped_to_everything(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    row = users.by_username(conn, "09120000000")
    assert row is not None and row["supervisor_id"] is None
    scopes = [r[0] for r in conn.execute("SELECT scope FROM user_scopes")]
    assert scopes == ["*"]


def test_seeding_twice_changes_nothing(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    _seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM roles").fetchone()[0] == 4


def test_rejects_a_username_that_is_not_a_mobile_number(tmp_path):
    conn = _conn(tmp_path)
    try:
        seed.seed(conn, editor_username="analyst",
                  editor_display_name="x", editor_password_hash="h")
        raised = False
    except ValueError:
        raised = True
    assert raised
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_seed.py -q`
Expected: FAIL — no module named `seed`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/seed.py`:

```python
"""The four seeded roles and the first Editor (spec D11, D50).

Roles come from here and from nowhere else. No API path creates, edits or
deletes one — which is why 'no UI can ever mint a role that edits content' is a
property of the data rather than a check on an account, and cannot be lost by
renaming or replacing an administrator.

The price is that this module is the only recovery path if every Editor account
is lost. That belongs in docs/runbooks/06-changing-users.md.
"""
from __future__ import annotations

import json
import sqlite3

from .phone import USERNAME_RE
from .store import users

NON_DELEGABLE = frozenset({"edit", "confirm", "set_visibility"})

_READER = ["view", "comment", "export_pdf"]
_ADMIN = _READER + ["manage_users", "manage_peers", "view_audit"]
_EDITOR = _ADMIN + ["edit", "confirm", "set_visibility"]

ROLES: dict[str, list[str]] = {
    "reader": _READER,
    # Exists from day one because FR-E7 promises download can be withheld from
    # someone who may still read, and with no per-user overrides a role is the
    # only way to say it. A promise that needs a deploy first is not kept.
    "reader_no_download": ["view", "comment"],
    "admin": _ADMIN,
    "editor": _EDITOR,
}


def seed(conn: sqlite3.Connection, *, editor_username: str,
         editor_display_name: str, editor_password_hash: str) -> None:
    if not USERNAME_RE.fullmatch(editor_username):
        raise ValueError(
            f"editor username must be a canonical mobile number, got {editor_username!r}")

    for name, caps in ROLES.items():
        conn.execute(
            "INSERT INTO roles (name, capabilities) VALUES (?, ?)"
            " ON CONFLICT(name) DO NOTHING",
            (name, json.dumps(sorted(caps))),
        )

    if users.by_username(conn, editor_username) is not None:
        return
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        return

    role_id = conn.execute(
        "SELECT id FROM roles WHERE name = 'editor'").fetchone()[0]
    uid = users.create(conn, username=editor_username,
                       display_name=editor_display_name,
                       password_hash=editor_password_hash, role_id=role_id)
    conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, '*')", (uid,))
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_seed.py -q`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/seed.py ui-backend/tests/test_seed.py
git commit -m "feat(backend): four seeded roles, and the only Editor there will be

Roles come from the seed and from nowhere else, so 'no UI path can mint a role
that edits content' is a property of the data rather than a check on an account
— it survives renaming, adding or replacing an administrator.

Reader (no download) is seeded from the start rather than added later, because
the promise that download can be withheld from someone who may still read is
otherwise unkeepable without a deploy.

The Editor keeps `comment`: removing it would make Reader not a subset of
Editor, and the Editor could then create neither a Reader nor an Admin."
```

---

### Task 5: Authentication rewritten

**Files:**
- Modify: `ui-backend/inja_ui_backend/auth.py` (rewrite), `ui-backend/inja_ui_backend/app.py`
- Create: `ui-backend/tests/test_auth_multiuser.py`

**Interfaces:**
- Consumes: `db`, `phone`, `store.users`, `store.sessions`, `store.audit`, `seed`.
- Produces: `COOKIE_NAME`, `verify_hash`, `hash_password`, `authenticate(conn, username, password) -> tuple[Row | None, str]` returning `(user, reason)` where reason is `ok`/`bad_password`/`no_such_user`/`disabled`, `require_session(request) -> sqlite3.Row`, `get_conn(request) -> sqlite3.Connection`.

**`require_session` keeps its name and its `Depends` usage so the fourteen existing routers need no change in this plan.** It now returns the user row instead of a username string; routers that bind it to `_` are unaffected.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_auth_multiuser.py`:

```python
import time

import argon2
from fastapi.testclient import TestClient

from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for

BASE_URL = "https://testserver"   # the cookie is Secure; http:// silently drops it
PW = "sixchars"


def _client(data_root, tmp_path):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__, "app_db": tmp_path / "app.db"})
    app = create_app(cfg)
    return TestClient(app, base_url=BASE_URL), cfg


def _seeded(data_root, tmp_path):
    client, cfg = _client(data_root, tmp_path)
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="تحلیل‌گر",
              editor_password_hash=argon2.PasswordHasher().hash(PW))
    conn.close()
    return client, cfg


def test_sign_in_sets_a_session_cookie_and_me_returns_the_user(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/login",
                    json={"username": "09120000000", "password": PW})
    assert r.status_code == 200
    assert client.cookies.get("inja_session")
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == "09120000000"
    assert body["role"] == "editor"
    assert "edit" in body["capabilities"]
    assert body["scopes"] == ["*"]


def test_a_persian_typed_number_signs_in(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/login",
                    json={"username": "۰۹۱۲۰۰۰۰۰۰۰", "password": PW})
    assert r.status_code == 200


def test_a_country_code_with_the_leading_zero_signs_in(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/login",
                    json={"username": "+98 0912 000 0000", "password": PW})
    assert r.status_code == 200


def test_wrong_password_unknown_number_and_disabled_look_identical(data_root, tmp_path):
    # D56: the response must not distinguish them. The RECORD does.
    client, cfg = _seeded(data_root, tmp_path)
    wrong = client.post("/api/auth/login",
                        json={"username": "09120000000", "password": "nope123"})
    unknown = client.post("/api/auth/login",
                          json={"username": "09129999999", "password": PW})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_the_record_distinguishes_them(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "09120000000",
                                         "password": "nope123"})
    client.post("/api/auth/login", json={"username": "09129999999",
                                         "password": PW})
    conn = db.connect(cfg.app_db)
    reasons = [r["detail"] for r in conn.execute(
        "SELECT detail FROM audit_events WHERE action = 'login.failure' ORDER BY id")]
    assert "bad_password" in reasons[0]
    assert "no_such_user" in reasons[1]


def test_a_successful_sign_in_is_recorded(data_root, tmp_path):
    # Today nothing records one — "no line marking the moment guessing stops
    # being guessing".
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "09120000000", "password": PW})
    conn = db.connect(cfg.app_db)
    n = conn.execute(
        "SELECT COUNT(*) FROM audit_events WHERE action='login.success'").fetchone()[0]
    assert n == 1


def test_an_unknown_username_costs_the_same_time_as_a_wrong_password(data_root, tmp_path):
    # D56: returning instantly on a miss is a timing oracle, and with phone
    # numbers as usernames it answers "does this person work here?".
    client, _ = _seeded(data_root, tmp_path)

    def elapsed(username, password):
        start = time.perf_counter()
        client.post("/api/auth/login",
                    json={"username": username, "password": password})
        return time.perf_counter() - start

    known = min(elapsed("09120000000", "nope123") for _ in range(3))
    miss = min(elapsed("09129999999", "nope123") for _ in range(3))
    # A dummy-hash verify costs ~58ms; an early return costs microseconds.
    assert miss > known / 4


def test_logout_revokes_the_session(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "09120000000", "password": PW})
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_me_without_a_cookie_is_401(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    assert client.get("/api/auth/me").status_code == 401


def test_a_forged_cookie_is_refused(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    client.cookies.set("inja_session", "not-a-real-session-id")
    assert client.get("/api/auth/me").status_code == 401


def test_a_short_password_cannot_be_used_at_all(data_root, tmp_path):
    # D58: six characters, and nothing else.
    from inja_ui_backend.auth import validate_password
    assert validate_password("sixchr") is None
    assert validate_password("five5") is not None
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_auth_multiuser.py -q`
Expected: FAIL — `Settings` has no `app_db` yet at the call site, or `validate_password` is missing.

- [ ] **Step 3: Rewrite `auth.py`**

Replace `ui-backend/inja_ui_backend/auth.py` entirely:

```python
"""Per-person authentication (spec D7, D15, D56, D57, D58)."""
from __future__ import annotations

import sqlite3
import time

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request

from .phone import normalise_phone
from .store import audit, sessions, users

COOKIE_NAME = "inja_session"
MIN_PASSWORD_LENGTH = 6

_ph = PasswordHasher()

# Verified against on the miss path so an unknown number costs the same as a
# wrong password. Without it, sign-in is a timing oracle — and with phone
# numbers as usernames it answers "does this person work here?" (D56).
_DUMMY_HASH = _ph.hash("a-password-nobody-has")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_hash(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def validate_password(password: str) -> str | None:
    """Return an error message, or None when acceptable.

    Six characters, no complexity rule, no expiry, no reuse check (D58). Every
    rule beyond a length floor trades a real cost in passwords written down
    against a benefit the evidence has not supported for a decade.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"گذرواژه باید دست‌کم {MIN_PASSWORD_LENGTH} نویسه باشد"
    return None


def authenticate(conn: sqlite3.Connection, username: str,
                 password: str) -> tuple[sqlite3.Row | None, str]:
    """Return (user, reason). Reason is recorded, never returned to the caller."""
    canonical = normalise_phone(username)
    row = users.by_username(conn, canonical) if canonical else None
    if row is None:
        verify_hash(_DUMMY_HASH, password)      # constant-time miss path
        return None, "no_such_user"
    if not verify_hash(row["password_hash"], password):
        return None, "bad_password"
    if row["disabled_at"] is not None:
        return None, "disabled"
    return row, "ok"


def get_conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def require_session(request: Request) -> sqlite3.Row:
    """The session gate. Returns the USER row.

    Named and used exactly as before, so the fourteen routers that bind it to
    `_` need no change here. Capability enforcement is P0b.
    """
    conn = get_conn(request)
    sid = request.cookies.get(COOKIE_NAME)
    row = sessions.resolve(conn, sid, ttl=request.app.state.cfg.session_ttl,
                           now=int(time.time())) if sid else None
    if row is None:
        raise HTTPException(status_code=401, detail="authentication required")
    user = users.by_id(conn, row["user_id"])
    if user is None:
        raise HTTPException(status_code=401, detail="authentication required")
    request.state.session_id = row["id"]
    return user


def record(request: Request, action: str, **kw) -> None:
    audit.record(get_conn(request), action=action, now=int(time.time()),
                 ip=(request.client.host if request.client else ""),
                 user_agent=request.headers.get("user-agent", ""), **kw)
```

- [ ] **Step 4: Open the database at startup**

In `ui-backend/inja_ui_backend/app.py`'s `create_app`, after `app.state.cfg = cfg`, add:

```python
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    app.state.db = conn
```

with `from . import db` at the top. Do **not** seed here — seeding is an operator action with credentials, covered in Task 6.

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_auth_multiuser.py -q`
Expected: PASS — 11 tests. The timing test compares minimums over three runs; if it is flaky on a loaded machine, raise the run count rather than weakening the ratio.

- [ ] **Step 6: Confirm the old suite**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: `ui-backend/tests/test_auth.py` **fails** — it exercises the removed single-credential path. Delete that file: its multi-user cases are superseded by `test_auth_multiuser.py`, and its single-user cases test a mechanism that no longer exists. Every other test must stay green; they use `require_session` only through a signed-in client, so they need a session. If they fail on authentication, that is expected and Task 6 fixes it by giving `tests_helpers` a signed-in client factory.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/auth.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_auth_multiuser.py
git rm ui-backend/tests/test_auth.py
git commit -m "feat(backend): people sign in, and the record says who

Wrong password, unknown number and disabled account are one response and three
recorded reasons. An unknown number also costs a full argon2 verify against a
dummy hash: returning early is a timing oracle, and with phone numbers as
usernames it answers whether someone works here.

A successful sign-in is recorded for the first time. Until now only failures
were, and only on the export gate — there was no line marking the moment
guessing stops being guessing."
```

---

### Task 6: The seed CLI and a signed-in test client

**Files:**
- Modify: `ui-backend/inja_ui_backend/seed.py` (add `main`), `ui-backend/inja_ui_backend/tests_helpers.py`, `ui-backend/pyproject.toml`

**Interfaces:**
- Produces: a console entry point `inja-seed`, and `tests_helpers.signed_in_client(data_root, app_db) -> tuple[TestClient, Settings]` used by every existing router test.

- [ ] **Step 1: Write the failing test**

Add to `ui-backend/tests/test_seed.py`:

```python
def test_the_cli_seeds_and_refuses_a_weak_password(tmp_path, capsys):
    from inja_ui_backend.seed import main
    dbp = tmp_path / "app.db"
    assert main(["--db", str(dbp), "--username", "09120000000",
                 "--name", "تحلیل‌گر", "--password", "sixchr"]) == 0
    conn = db.connect(dbp)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1

    assert main(["--db", str(tmp_path / "b.db"), "--username", "09120000001",
                 "--name", "x", "--password", "five5"]) == 2
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_seed.py -q`
Expected: FAIL — `cannot import name 'main'`.

- [ ] **Step 3: Add the CLI**

Append to `ui-backend/inja_ui_backend/seed.py`:

```python
def main(argv: list[str] | None = None) -> int:
    """Create the store and its first Editor. The only origin of `edit`."""
    import argparse
    from pathlib import Path

    from . import db as _db
    from .auth import hash_password, validate_password

    p = argparse.ArgumentParser(prog="inja-seed")
    p.add_argument("--db", required=True)
    p.add_argument("--username", required=True, help="mobile number, e.g. 09123456789")
    p.add_argument("--name", required=True)
    p.add_argument("--password", required=True)
    args = p.parse_args(argv)

    problem = validate_password(args.password)
    if problem:
        print(problem)
        return 2

    conn = _db.connect(Path(args.db))
    _db.migrate(conn)
    try:
        seed(conn, editor_username=args.username, editor_display_name=args.name,
             editor_password_hash=hash_password(args.password))
    except ValueError as exc:
        print(str(exc))
        return 2
    return 0
```

and register it in `ui-backend/pyproject.toml` under `[project.scripts]`:

```toml
inja-seed = "inja_ui_backend.seed:main"
```

- [ ] **Step 4: Give the existing tests a signed-in client**

Replace `ui-backend/inja_ui_backend/tests_helpers.py` with:

```python
"""Test-only helpers. Not imported by production code."""
from __future__ import annotations

from pathlib import Path

from .config import load_settings

_PW = "test-password"


def cfg_for(data_root: Path, app_db: Path | None = None):
    env = {
        "DATA_ROOT": str(data_root),
        "SCHEMA_DIR": str(Path(__file__).resolve().parents[2] / "schemas"),
        "SESSION_SIGNING_KEY": "k",
        "APP_DB": str(app_db if app_db is not None else data_root.parent / "app.db"),
    }
    return load_settings(env)


def signed_in_client(data_root: Path, app_db: Path):
    """A TestClient already holding an Editor session.

    Every router test needs a session now. The https base URL is load-bearing:
    the cookie is Secure and TestClient's jar will not send it over http.
    """
    from fastapi.testclient import TestClient

    from . import db, seed
    from .app import create_app
    from .auth import hash_password

    cfg = cfg_for(data_root, app_db)
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="تحلیل‌گر",
              editor_password_hash=hash_password(_PW))
    conn.close()

    client = TestClient(create_app(cfg), base_url="https://testserver")
    r = client.post("/api/auth/login",
                    json={"username": "09120000000", "password": _PW})
    assert r.status_code == 200, r.text
    return client, cfg
```

Note `load_settings` must now accept the `UI_USERS_FILE`/`UI_USERNAME` requirement being gone — remove that branch from `config.py`, since users live in the database. Keep `users`, `ui_username`, `ui_password_hash` off `Settings` entirely.

- [ ] **Step 5: Migrate the existing router tests**

Every test module that builds its own client (`test_departments.py`, `test_processes_read.py`, and the rest — find them with `grep -l "TestClient" ui-backend/tests`) switches to `signed_in_client(data_root, tmp_path / "app.db")`. Their assertions do not change; only the client construction does.

- [ ] **Step 6: Run everything**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: all green. The count will be roughly 250 − (deleted `test_auth.py` cases) + 27 new.

- [ ] **Step 7: Commit**

```bash
git add ui-backend
git commit -m "feat(backend): a seed command, and every test signs in

The store's first Editor is created by an operator with a password, not by
application code — the seed is the only origin of edit, confirm and
set_visibility, and therefore the only way back if every Editor account is lost.

Router tests now go through a real sign-in rather than a fabricated cookie,
which is the only way they still prove anything once sessions are rows."
```

---

### Task 7: The sign-in screen

**Files:**
- Create: `ui/src/screens/SignIn.tsx`, `ui/src/screens/SignIn.test.tsx`
- Delete: `ui/src/screens/Login.tsx`
- Modify: `ui/src/routes.tsx`, `ui/src/api/hooks.ts`, `ui/src/api/types.ts`

**Interfaces:**
- Consumes: `Button`, `SearchField`-style input patterns, `ErrorState` copy conventions from the F design system; `normalisePhone` from `ui/src/lib/digits.ts`.
- Produces: the `/login` route rendering `SignIn`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/SignIn.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignIn } from './SignIn'
import { createWrapper } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: unknown = {}) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('SignIn', () => {
  it('labels the number field and marks it as a phone number', () => {
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const field = screen.getByLabelText('شمارهٔ موبایل')
    expect(field).toHaveAttribute('type', 'tel')
    expect(field).toHaveAttribute('inputMode', 'numeric')
    expect(field).toHaveAttribute('dir', 'ltr')
  })

  it('sends the number in canonical form however it was typed', async () => {
    const spy = mockFetch(200, { username: '09123456789' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '۰۹۱۲۳۴۵۶۷۸۹')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.username).toBe('09123456789')
  })

  it('shows one message for every kind of refusal', async () => {
    mockFetch(401, { detail: 'authentication required' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    // The screen must not distinguish wrong-password from unknown-number: the
    // server deliberately does not, and copy that guessed would undo it.
    const msg = await screen.findByRole('alert')
    expect(msg.textContent).toMatch(/شماره یا گذرواژه/)
    expect(msg.textContent).not.toMatch(/وجود ندارد|غیرفعال|نادرست است/)
  })

  it('refuses to submit a password under six characters without calling the API', async () => {
    const spy = mockFetch(200)
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'five5')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(spy).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('disables the button while the request is in flight', async () => {
    let release: (v: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { release = r })))
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(screen.getByRole('button')).toBeDisabled()
    release(new Response('{}', { status: 200 }))
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/screens/SignIn.test.tsx`
Expected: FAIL — cannot resolve `./SignIn`.

- [ ] **Step 3: Write the screen**

Create `ui/src/screens/SignIn.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { normalisePhone } from '../lib/digits'
import { useLogin } from '../api/hooks'

const MIN_PASSWORD = 6

export function SignIn() {
  const numberId = useId()
  const passwordId = useId()
  const [number, setNumber] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const login = useLogin()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) {
      setError(`گذرواژه باید دست‌کم ${MIN_PASSWORD} نویسه باشد.`)
      return
    }
    try {
      await login.mutateAsync({ username: normalisePhone(number), password })
      navigate('/departments', { replace: true })
    } catch {
      // One message for every refusal. The server deliberately does not tell
      // wrong-password from unknown-number apart, and copy that guessed would
      // undo that.
      setError('شماره یا گذرواژه درست نیست.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-login-bg p-6">
      <Card className="w-full max-w-list p-8">
        <h1 className="text-title font-extrabold text-ink m-0">ورود به سامانه</h1>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={numberId} className="text-caption font-bold text-muted">
              شمارهٔ موبایل
            </label>
            <input
              id={numberId}
              type="tel"
              inputMode="numeric"
              dir="ltr"
              maxLength={13}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="min-h-touch px-4 rounded-control border border-line bg-card text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={passwordId} className="text-caption font-bold text-muted">
              گذرواژه
            </label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-touch px-4 rounded-control border border-line bg-card text-body text-ink"
            />
          </div>

          {error && (
            <p role="alert" className="text-body text-conflict m-0">{error}</p>
          )}

          <Button type="submit" variant="violet" className="px-4"
                  loading={login.isPending} loadingLabel="در حال ورود…">
            ورود
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Point `useLogin` at the new body and swap the route**

In `ui/src/api/hooks.ts`, confirm `useLogin` posts `{username, password}` to `/api/auth/login` — it already does. In `ui/src/routes.tsx`, replace the `Login` import and its route element with `SignIn`, and delete `ui/src/screens/Login.tsx`.

- [ ] **Step 5: Run the tests**

Run: `cd ui && npx vitest run src/screens/SignIn.test.tsx src/test/guards.test.ts`
Expected: PASS — 5 SignIn cases; guards stay green. If a guard fails on a literal, replace it with a token class rather than widening the allowlist.

- [ ] **Step 6: Full frontend verification**

Run: `cd ui && npx vitest run && npx tsc -b && npm run lint && npm run build`
Expected: all green, no new warnings. `Login.test.tsx` (if it exists) must be deleted alongside the screen.

- [ ] **Step 7: Commit**

```bash
git add ui/src/screens/SignIn.tsx ui/src/screens/SignIn.test.tsx ui/src/routes.tsx
git rm ui/src/screens/Login.tsx
git commit -m "feat(ui): sign in with a mobile number

The field normalises before it sends, so a number typed with Persian digits or
a country code is the same account as one typed plainly.

One message for every refusal. The server will not tell a wrong password from an
unknown number, and a screen that guessed would give away what the server
deliberately withholds."
```

---

### Task 8: The real session descriptor

**Files:**
- Create: `ui/src/auth/useSession.ts`
- Modify: `ui/src/auth/RequireAuth.tsx`, `ui/src/routes.tsx`, `ui/src/api/hooks.ts`, `ui/src/api/types.ts`
- Modify: `ui/src/shell/shells.test.tsx`

**Interfaces:**
- Consumes: `SessionDescriptor` from `ui/src/auth/session.ts` (built in F, currently unused in anger).
- Produces: `useSession()` returning `{ data, isPending, isError }` over `GET /api/auth/me`; `RequireAuth` renders the shell only once a real descriptor is in hand.

**This removes the placeholder descriptor `routes.tsx` has carried since F — the single seam between the two sub-projects.**

- [ ] **Step 1: Write the failing test**

Create `ui/src/auth/useSession.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequireAuth } from './RequireAuth'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const DESCRIPTOR = {
  username: '09123456789', displayName: 'سحر بیات', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: '09120000000', canSupervise: false, pendingApprovals: 0,
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>محتوا</p>} />
          </Route>
          <Route path="/login" element={<p>صفحهٔ ورود</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RequireAuth', () => {
  it('sends an unauthenticated visitor to sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    mount()
    expect(await screen.findByText('صفحهٔ ورود')).toBeInTheDocument()
  })

  it('renders the reader shell for a reader descriptor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(DESCRIPTOR), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { container } = mount()
    await waitFor(() =>
      expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument())
    expect(screen.getByText('محتوا')).toBeInTheDocument()
  })

  it('renders the panel shell for a descriptor holding a panel capability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ...DESCRIPTOR, role: 'editor', capabilities: [...DESCRIPTOR.capabilities, 'edit'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { container } = mount()
    await waitFor(() =>
      expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/auth/useSession.test.tsx`
Expected: FAIL — `RequireAuth` renders `<Outlet/>` with no shell and takes no descriptor.

- [ ] **Step 3: Write `useSession`**

Create `ui/src/auth/useSession.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../api/client'
import type { SessionDescriptor } from './session'

/** The real GET /api/auth/me (spec D47). Replaces F's placeholder descriptor. */
export function useSession() {
  return useQuery<SessionDescriptor>({
    queryKey: ['session'],
    queryFn: () => fetchJson<SessionDescriptor>('/api/auth/me'),
    retry: false,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 4: Rewrite `RequireAuth` to own the shell**

Replace `ui/src/auth/RequireAuth.tsx`:

```tsx
import { Navigate } from 'react-router-dom'
import { useSession } from './useSession'
import { AppShell } from '../shell/AppShell'

export function RequireAuth() {
  const { data, isPending, isError } = useSession()
  // A blank frame rather than a spinner: this resolves in one request and a
  // flash of loading chrome on every navigation is worse than nothing.
  if (isPending) return <div />
  if (isError || !data) return <Navigate to="/login" replace />
  return <AppShell session={data} />
}
```

Then in `ui/src/routes.tsx`, delete the placeholder `SessionDescriptor` constant and its comment, and remove `AppShell` from the route tree — `RequireAuth` now renders it, so the route config becomes `element: <RequireAuth />` with the screens as its direct children.

- [ ] **Step 5: Update the shell test for the new ownership**

`ui/src/shell/shells.test.tsx` builds `AppShell` directly with a descriptor; that still works and should stay. Confirm it passes unchanged.

- [ ] **Step 6: Verify**

Run: `cd ui && npx vitest run && npx tsc -b && npm run lint && npm run build`
Expected: all green. Confirm with `grep -rn "placeholder" ui/src/routes.tsx` that the stand-in descriptor is gone.

- [ ] **Step 7: Commit**

```bash
git add ui/src/auth ui/src/routes.tsx
git commit -m "feat(ui): the shell is chosen by the real session

Removes the placeholder descriptor routes.tsx has carried since the frontend
system landed — the one seam between that sub-project and this one. The shell
now follows from what the signed-in person can actually do."
```

---

### Task 9: Password change, and what it revokes

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/auth.py`
- Create: `ui-backend/tests/test_password.py`

**Interfaces:**
- Produces: `POST /api/auth/password` taking `{current, next}`, returning 204.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_password.py`:

```python
from inja_ui_backend import db
from inja_ui_backend.tests_helpers import signed_in_client

PW = "test-password"


def test_changing_your_password_needs_the_current_one(data_root, tmp_path):
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    r = client.post("/api/auth/password", json={"current": "wrong1", "next": "newpass"})
    assert r.status_code == 400


def test_the_new_password_must_clear_the_floor(data_root, tmp_path):
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    r = client.post("/api/auth/password", json={"current": PW, "next": "five5"})
    assert r.status_code == 400


def test_changing_it_works_and_the_old_one_stops(data_root, tmp_path):
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    assert client.post("/api/auth/password",
                       json={"current": PW, "next": "brandnew"}).status_code == 204
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login",
                       json={"username": "09120000000", "password": PW}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"username": "09120000000", "password": "brandnew"}).status_code == 200


def test_it_revokes_other_sessions_but_not_the_one_you_used(data_root, tmp_path):
    # "We think this account is compromised, change the password" has to mean
    # something — but it should not sign you out of the tab you did it in.
    app_db = tmp_path / "app.db"
    first, cfg = signed_in_client(data_root, app_db)
    second, _ = signed_in_client(data_root, app_db)   # a second device
    assert second.get("/api/auth/me").status_code == 200

    assert first.post("/api/auth/password",
                      json={"current": PW, "next": "brandnew"}).status_code == 204
    assert first.get("/api/auth/me").status_code == 200
    assert second.get("/api/auth/me").status_code == 401


def test_the_change_is_recorded(data_root, tmp_path):
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    client.post("/api/auth/password", json={"current": PW, "next": "brandnew"})
    conn = db.connect(cfg.app_db)
    n = conn.execute(
        "SELECT COUNT(*) FROM audit_events WHERE action='password.changed'").fetchone()[0]
    assert n == 1
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_password.py -q`
Expected: FAIL — 404 on `/api/auth/password`.

- [ ] **Step 3: Add the endpoint**

In `ui-backend/inja_ui_backend/routers/auth.py`, add a pydantic body to `models.py`:

```python
class PasswordBody(BaseModel):
    current: str
    next: str
```

and the route:

```python
@router.post("/password", status_code=204)
def change_password(body: PasswordBody, request: Request,
                    user=Depends(require_session)):
    conn = get_conn(request)
    if not verify_hash(user["password_hash"], body.current):
        raise HTTPException(status_code=400, detail="گذرواژهٔ فعلی درست نیست")
    problem = validate_password(body.next)
    if problem:
        raise HTTPException(status_code=400, detail=problem)

    now = int(time.time())
    users.set_password(conn, user["id"], hash_password(body.next))
    # Revoke every OTHER session: a changed password has to end the attacker's
    # access, but not the tab the user changed it in.
    sessions.revoke_all_for_user(conn, user["id"], now,
                                 except_session=request.state.session_id)
    record(request, "password.changed", actor=user["username"],
           session_id=request.state.session_id)
    return Response(status_code=204)
```

Add the imports the file needs.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_password.py -q`
Expected: PASS — 5 tests.

- [ ] **Step 5: Full backend verification**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/auth.py ui-backend/inja_ui_backend/models.py ui-backend/tests/test_password.py
git commit -m "feat(backend): changing a password ends every other session

Otherwise 'we think this account is compromised, change the password'
accomplishes nothing — the attacker's session outlives the credential it came
from. The tab you changed it in survives, because signing yourself out of it is
just an annoyance."
```

---

### Task 10: Deployment and the runbook

**Files:**
- Modify: `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml`, `config/ui-backend.env.example`, `docs/runbooks/06-changing-users.md`, `docs/runbooks/02-secrets-and-auth.md`
- Delete: `config/ui-users.example.json`

**Interfaces:** none — configuration and documentation.

- [ ] **Step 1: Add the state volume**

In `deploy/docker-compose.yml`, add a named volume `ui-state` and mount it on `ui-backend` at `/state`, with `APP_DB=/state/app.db` in that service's `environment` block. Remove `UI_USERS_FILE` and the `ui-users.json` secret mount. Mirror the change in `deploy/docker-compose.local.yml`.

- [ ] **Step 2: Update the sample env**

In `config/ui-backend.env.example`, delete `UI_USERNAME`, `UI_PASSWORD_HASH` and `UI_USERS_FILE`; add `APP_DB` with a comment saying it must live outside `DATA_ROOT` so the operational store never enters the data-repo working tree. Delete `config/ui-users.example.json`.

- [ ] **Step 3: Write the runbook section**

In `docs/runbooks/06-changing-users.md`, replace the UI-users section with:

- how to seed the first Editor: `docker compose run --rm ui-backend inja-seed --db /state/app.db --username 09123456789 --name "…" --password "…"`
- that **the seed is the only origin of `edit`, `confirm` and `set_visibility`**, so it is also the only recovery path if every Editor account is lost
- that usernames are mobile numbers in canonical `09XXXXXXXXX` form, unique across disabled accounts, and that freeing a number means editing the disabled account first
- that `ui-users.json` is gone and is **not** migrated: its entries are bare names that cannot become phone numbers, and there are two of them

In `docs/runbooks/02-secrets-and-auth.md`, replace the argon2-hash-generation recipe with a pointer to `inja-seed`, and note that **`app.db` needs the backup job** described in ARD §16 — `git-push` does not cover it, and without it NFR-7 is false for users, sessions and the activity record.

- [ ] **Step 4: Verify the compose files parse**

Run: `docker compose -f deploy/docker-compose.yml config -q && docker compose -f deploy/docker-compose.local.yml config -q`
Expected: no output, exit 0. If Docker is unavailable in this environment, say so in the report rather than skipping silently.

- [ ] **Step 5: Commit**

```bash
git add deploy config docs/runbooks
git rm config/ui-users.example.json
git commit -m "chore(deploy): a state volume, and the seed becomes the way in

app.db lives outside DATA_ROOT so the operational store never enters the
data-repo working tree. ui-users.json is deleted rather than migrated: its two
entries are bare names that cannot become phone numbers, and creating them by
hand takes five minutes.

The runbook now records that the seed is the only origin of edit, confirm and
set_visibility — and therefore the only way back if every Editor account is
lost."
```

---

## Self-Review

**Spec coverage.** D1/D6 → Task 1. D57 → Task 2. D7 → Task 3 (absolute expiry, revocation, disabled users). D41/D42 partial → Task 3 and Task 5 (the access events; content and governance events belong to P0b/P0c and P3). D11/D50 → Task 4. D15 partial → Task 9 (self-service change; admin-set passwords are P0c). D56 → Task 5 (identical responses, constant-time miss). D58 → Task 5. D47 → Task 8. §10 migration → Tasks 4, 6, 10.

**Deliberately out of scope, and named so nobody assumes they were missed:** all capability and scope *enforcement* (P0b); `allows()` and scope containment (P0b); delegation, `manage_peers`, supervisor eligibility and the user-administration screens (P0c); admin-set passwords (P0c); content and governance audit events (P0b, P0c, P3); the audit reports themselves (P3); presence and heartbeats (P3); the `state-backup` job (P3, though the runbook flags it here).

**Placeholder scan.** No "TBD", no "add validation", no "similar to Task N". Every code step shows its code.

**Type consistency.** `sessions.resolve` returns a row with `user_id` in Tasks 3 and 5. `authenticate` returns `(row, reason)` in Task 5 and is consumed that way in `routers/auth.py`. `SessionDescriptor` field names in Task 8's test match `ui/src/auth/session.ts` exactly (`displayName`, `canSupervise`, `pendingApprovals`). `signed_in_client` returns `(client, cfg)` in Task 6 and is destructured that way in Tasks 9's tests.

**One risk worth stating.** Task 6 migrates every existing router test to a signed-in client. That is the largest single change to existing code in this plan and the most likely place to lose coverage by accident — the tests' assertions must not change, only their client construction.
