"""comments.db is shared by ui-backend (owner, migrator) and the engine CLI
(by SQL). This pins that they agree, from both sides."""
from __future__ import annotations

import pathlib

from comments import cli
from inja_ui_backend import comments_db

_SQL_FILE = (pathlib.Path(__file__).resolve().parents[1]
            / "engine" / "tests" / "comments_schema_v1.sql")


def test_the_cli_expects_the_version_ui_backend_writes():
    assert cli.SCHEMA_VERSION == comments_db.SCHEMA_VERSION


def test_the_engine_test_schema_is_the_real_one():
    sql = _SQL_FILE.read_text(encoding="utf-8")
    assert " ".join(sql.split()) == " ".join(comments_db.MIGRATIONS[0][1].split())


def test_the_cli_resolves_what_ui_backend_created(tmp_path, monkeypatch):
    conn = comments_db.open_comments(tmp_path / "c.db")
    cid = conn.execute(
        "INSERT INTO comments (author_id, author_username, author_name, anchor_kind,"
        " anchor_id, department, snapshot, text, state, created_at, updated_at)"
        " VALUES (1,'u','n','department','dining','dining','{}','t','approved',0,0)").lastrowid
    monkeypatch.setenv("COMMENTS_DB", str(tmp_path / "c.db"))
    assert cli.main(["resolve", f"CMT-{cid}"]) == 0
    got = conn.execute("SELECT state FROM comments WHERE id=?", (cid,)).fetchone()[0]
    assert got == "addressed"
