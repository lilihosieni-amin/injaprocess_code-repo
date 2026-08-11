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


def test_migration_2_creates_the_confirmation_and_policy_tables(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    assert db.migrate(conn) == 2
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(confirmations)")}
    assert cols == {"target", "fingerprint", "confirmed_by", "confirmed_at"}
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(visibility_policy)")}
    assert cols == {"field", "visible"}


def test_a_database_at_version_1_upgrades_without_losing_its_rows(tmp_path):
    """The upgrade path, not just the fresh-create path.

    `migrate` runs on every start, so the only interesting case is a store that
    already holds accounts: a migration 2 that dropped or recreated anything from
    migration 1 would take the restaurant's users with it, and a fresh-database
    test cannot see that.
    """
    path = tmp_path / "app.db"
    conn = db.connect(path)
    # Migration 1 alone, as a database shipped before this sub-project.
    version, sql = db.MIGRATIONS[0]
    conn.executescript(f"BEGIN;\n{sql}\nINSERT INTO schema_version (version)"
                       f" VALUES ({version});\nCOMMIT;")
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('editor', '[]')")
    rid = conn.execute("SELECT id FROM roles WHERE name='editor'").fetchone()[0]
    conn.execute("INSERT INTO users (username, display_name, password_hash, role_id)"
                 " VALUES ('09120000000', 'e', 'h', ?)", (rid,))

    assert db.migrate(conn) == 2
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 0


def test_the_system_starts_dark(tmp_path):
    """D23 — no bulk confirmation at migration.

    All 85 existing processes start unconfirmed, so a non-editor sees an empty
    system until an Editor reviews each one. The migration must therefore write
    **no** confirmation rows, and this is where that is pinned: a well-meaning
    `INSERT ... SELECT` added later to "avoid disruption" would make every stored
    document vouched-for by nobody.
    """
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 0
    # And the policy table is empty too: the defaults live in Python (Task 4), so
    # a seeded row would be a second statement of D17's table.
    assert conn.execute("SELECT COUNT(*) FROM visibility_policy").fetchone()[0] == 0


def test_a_confirmation_target_is_unique(tmp_path):
    """One confirmation per target, replaced rather than accumulated (D20).

    Without the primary key, re-confirming after an edit leaves two rows and
    "does the current fingerprint match?" has two answers, one of which is stale.
    """
    import sqlite3

    import pytest
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO confirmations VALUES ('dining-001', 'aa', '0912', 1)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO confirmations VALUES ('dining-001', 'bb', '0912', 2)")


def test_no_column_of_a_confirmation_may_be_missing(tmp_path):
    """A confirmation with a hole in it is worse than no confirmation.

    A null fingerprint matches nothing (D20's comparison is an equality), a null
    `confirmed_by` vouches for the content in nobody's name, and a null
    `confirmed_at` cannot be ordered or aged. Each is a row that looks present in
    a COUNT and answers "who said so?" with silence.

    `target` is in the list on purpose: sqlite lets a NULL sit in a non-INTEGER
    PRIMARY KEY, and lets it sit there many times over, so the key alone does not
    cover it.
    """
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    rows = [
        ("target",       "(NULL, 'aa', '0912', 1)"),
        ("fingerprint",  "('dining-001', NULL, '0912', 1)"),
        ("confirmed_by", "('dining-002', 'aa', NULL, 1)"),
        ("confirmed_at", "('dining-003', 'aa', '0912', NULL)"),
    ]
    for column, values in rows:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(f"INSERT INTO confirmations VALUES {values}")
        assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 0, \
            f"{column} accepted NULL"


def test_a_policy_field_has_one_switch(tmp_path):
    """D16 — one global policy, so one row per field.

    Two rows for `node.description` are two answers to "may a non-editor see
    this?", and the filter would take whichever the query happened to return
    first -- a visibility decision settled by row order.
    """
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO visibility_policy VALUES ('node.description', 0)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO visibility_policy VALUES ('node.description', 1)")
    # A nameless switch governs no field, and sqlite would take any number of
    # them: a NULL is permitted in a non-INTEGER primary key and never collides.
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO visibility_policy VALUES (NULL, 1)")


def test_a_visibility_switch_is_only_on_or_off(tmp_path):
    """The filter reads the column as a boolean, so the column must be one.

    Anything outside {0, 1} is truthy to Python and would read as *visible*: a
    stray 2 or -1 written by a future endpoint would silently publish a field an
    Editor had switched off, which is the one direction of this switch that
    cannot be walked back.
    """
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    for bad in ("2", "-1", "NULL", "'true'"):
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(f"INSERT INTO visibility_policy VALUES ('process.kpis', {bad})")
    conn.execute("INSERT INTO visibility_policy VALUES ('process.kpis', 0)")
    conn.execute("INSERT INTO visibility_policy VALUES ('process.summary', 1)")
    assert conn.execute("SELECT COUNT(*) FROM visibility_policy").fetchone()[0] == 2


def test_migration_2_survives_the_connection_that_wrote_it(tmp_path):
    """Reopen the file: the writing connection is not an honest witness.

    An unwrapped `BEGIN` with no `COMMIT` reads back perfectly on the connection
    that ran it and vanishes when the process restarts -- the container would
    then come up on a database that says version 2 and has neither table. That
    bug has shipped here once.
    """
    path = tmp_path / "app.db"
    conn = db.connect(path)
    db.migrate(conn)
    conn.close()

    again = db.connect(path)
    names = {r[0] for r in again.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"confirmations", "visibility_policy"} <= names
    assert again.execute("SELECT version FROM schema_version").fetchone()[0] == 2
    # And the constraints came back with the tables, not just the column names.
    again.execute("INSERT INTO confirmations VALUES ('dining-001', 'aa', '0912', 1)")
    with pytest.raises(sqlite3.IntegrityError):
        again.execute("INSERT INTO confirmations VALUES ('dining-001', 'bb', '0912', 2)")
    again.close()


def test_the_new_columns_hold_the_types_the_stores_read_back(tmp_path):
    """Declared type is affinity, and affinity is behaviour in SQLite.

    `confirmed_at` declared TEXT would store the seconds as a string: '9' would
    then sort after '10', and a fingerprint compared against a stored integer
    would never match. The store writes and the filter reads without casting, so
    the affinity is the contract.
    """
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    # Values deliberately given in the *other* type, so only affinity converts them.
    conn.execute("INSERT INTO confirmations VALUES ('dining-001', 'aa', 912, '1700000000')")
    row = conn.execute(
        "SELECT typeof(target) t, typeof(fingerprint) f, typeof(confirmed_by) b,"
        " typeof(confirmed_at) a, confirmed_at FROM confirmations").fetchone()
    assert (row["t"], row["f"], row["b"], row["a"]) == ("text", "text", "text", "integer")
    assert row["confirmed_at"] == 1700000000

    conn.execute("INSERT INTO visibility_policy VALUES (1, '0')")
    row = conn.execute(
        "SELECT typeof(field) f, typeof(visible) v, visible FROM visibility_policy"
    ).fetchone()
    assert (row["f"], row["v"], row["visible"]) == ("text", "integer", 0)
