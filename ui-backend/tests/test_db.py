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
