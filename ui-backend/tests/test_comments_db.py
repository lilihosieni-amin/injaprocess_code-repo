import pytest
from inja_ui_backend import comments_db, db
from inja_ui_backend.config import load_settings
from inja_ui_backend.tests_helpers import cfg_for


def test_a_fresh_file_gets_every_table(tmp_path):
    conn = comments_db.open_comments(tmp_path / "comments.db")
    names = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"schema_version", "comments", "comment_events", "outbox"} <= names
    assert conn.execute("SELECT version FROM schema_version").fetchone()[0] == 1


def test_opening_twice_is_idempotent(tmp_path):
    comments_db.open_comments(tmp_path / "c.db").close()
    conn = comments_db.open_comments(tmp_path / "c.db")
    assert db.migrate(conn, comments_db.MIGRATIONS) == comments_db.SCHEMA_VERSION


def test_ids_are_never_reused(tmp_path):
    conn = comments_db.open_comments(tmp_path / "c.db")
    ins = ("INSERT INTO comments (author_id, author_username, author_name, anchor_kind,"
           " anchor_id, department, snapshot, text, state, created_at, updated_at)"
           " VALUES (1,'u','n','department','dining','dining','{}','t','awaiting',0,0)")
    first = conn.execute(ins).lastrowid
    conn.execute("DELETE FROM comments WHERE id = ?", (first,))
    assert conn.execute(ins).lastrowid == first + 1


def test_the_anchor_kind_is_closed(tmp_path):
    conn = comments_db.open_comments(tmp_path / "c.db")
    with pytest.raises(Exception):
        conn.execute(
            "INSERT INTO comments (author_id, author_username, author_name, anchor_kind,"
            " anchor_id, department, snapshot, text, state, created_at, updated_at)"
            " VALUES (1,'u','n','process_list','dining','dining','{}','t','awaiting',0,0)")


def test_the_app_db_migrator_still_reports_its_own_version(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    assert db.migrate(conn) == db.SCHEMA_VERSION


def test_comments_db_defaults_beside_app_db(data_root):
    cfg = cfg_for(data_root)
    assert cfg.comments_db == data_root.parent / "comments.db"


def test_comments_db_inside_data_root_is_refused(data_root):
    env = {"DATA_ROOT": str(data_root), "SCHEMA_DIR": str(cfg_for(data_root).schema_dir),
           "SESSION_SIGNING_KEY": "k", "COMMENTS_DB": str(data_root / "c.db")}
    with pytest.raises(RuntimeError, match="COMMENTS_DB must not be inside DATA_ROOT"):
        load_settings(env)


def test_comments_db_equal_to_app_db_is_refused(data_root, tmp_path):
    env = {"DATA_ROOT": str(data_root), "SCHEMA_DIR": str(cfg_for(data_root).schema_dir),
           "SESSION_SIGNING_KEY": "k", "APP_DB": str(tmp_path / "x.db"),
           "COMMENTS_DB": str(tmp_path / "x.db")}
    with pytest.raises(RuntimeError, match="COMMENTS_DB must not be APP_DB"):
        load_settings(env)
