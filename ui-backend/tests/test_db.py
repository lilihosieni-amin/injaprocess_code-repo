import sqlite3

import pytest
from inja_ui_backend import db
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


def test_a_failed_migration_leaves_the_database_recoverable(tmp_path, monkeypatch):
    """A migration that dies partway must take its own tables down with it.

    Otherwise schema_version exists but is empty, every later start re-runs
    migration 1, and the container crash-loops on "table already exists" until
    somebody deletes the file by hand.
    """
    path = tmp_path / "app.db"
    version, sql = db.MIGRATIONS[0]
    # The same migration plus a statement that cannot succeed -- it fails only
    # after the real DDL above it has already run.
    monkeypatch.setattr(
        db, "MIGRATIONS", [(version, sql + "\nCREATE TABLE roles (boom INTEGER);")])

    conn = connect(path)
    with pytest.raises(sqlite3.OperationalError):
        migrate(conn)
    assert conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall() == []
    conn.close()

    monkeypatch.undo()
    again = connect(path)
    assert migrate(again) == SCHEMA_VERSION
    names = {r[0] for r in again.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"schema_version", "roles", "users", "user_scopes",
            "sessions", "audit_events"} <= names
    again.close()


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


def test_connect_creates_the_parent_directory(tmp_path):
    """The database lives beside DATA_ROOT, in a directory a fresh deployment has
    no reason to have created yet."""
    path = tmp_path / "state" / "operational" / "app.db"
    assert not path.parent.exists()
    conn = connect(path)
    assert path.parent.is_dir()
    assert migrate(conn) == SCHEMA_VERSION
    conn.close()
    assert path.is_file()


def test_rows_are_addressable_by_column_name(tmp_path):
    """The store modules read row["username"], not row[1] -- a plain tuple would
    satisfy every index-based test in this file and still break them."""
    conn = connect(tmp_path / "app.db")
    migrate(conn)
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('reader', '[\"x\"]')")
    row = conn.execute("SELECT id, name, capabilities FROM roles").fetchone()
    assert isinstance(row, sqlite3.Row)
    assert row["name"] == "reader"
    assert row["capabilities"] == '["x"]'
    conn.close()


def test_statements_commit_without_an_explicit_commit(tmp_path):
    """Autocommit is contract: callers write single statements and expect them
    durable, with no transaction left dangling for the next request to inherit."""
    path = tmp_path / "app.db"
    conn = connect(path)
    migrate(conn)
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('reader', '[]')")
    assert conn.in_transaction is False

    # A second connection is the only honest witness that the row reached disk.
    other = connect(path)
    assert other.execute("SELECT COUNT(*) FROM roles").fetchone()[0] == 1
    other.close()
    conn.close()


def test_a_blocked_writer_waits_rather_than_failing_at_once(tmp_path):
    """Two workers share one file; with no wait a concurrent writer fails
    immediately with "database is locked".

    This pins the effective wait, not the PRAGMA: sqlite3.connect's own default
    (timeout=5.0) sets the same 5000ms, so deleting the PRAGMA line alone does
    not change behaviour -- but lowering either source does, and this catches it.
    """
    conn = connect(tmp_path / "app.db")
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    conn.close()
