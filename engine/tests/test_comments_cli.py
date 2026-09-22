import json
import pathlib
import sqlite3

import pytest
from comments.cli import main

SCHEMA = (pathlib.Path(__file__).parent / "comments_schema_v1.sql").read_text(
    encoding="utf-8")


@pytest.fixture
def store(tmp_path, monkeypatch):
    path = tmp_path / "comments.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA + "INSERT INTO schema_version VALUES (1);")
    def add(state, dept="dining", text="متن", kind="node", anchor="dining-005-n003"):
        cid = conn.execute(
            "INSERT INTO comments (author_id, author_username, author_name, anchor_kind,"
            " anchor_id, process_id, department, snapshot, text, state, created_at,"
            " updated_at) VALUES (1,'09120000001','سمیرا',?,?,?,?,?,?,?,100,100)",
            (kind, anchor, "dining-005" if kind != "department" else None, dept,
             json.dumps({"department_name": "سالن", "process_name": "پذیرش",
                         "node_label": "خوشامد"}, ensure_ascii=False), text, state)).lastrowid
        conn.execute("INSERT INTO comment_events (comment_id, at, kind, user_id, user_name)"
                     " VALUES (?, 100, 'submitted', 1, 'سمیرا')", (cid,))
        conn.commit()
        return cid
    monkeypatch.setenv("COMMENTS_DB", str(path))
    return conn, add


def test_list_shows_only_approved_by_default(store, capsys):
    _, add = store
    a = add("approved")
    add("awaiting")
    add("approved", dept="cashier")
    assert main(["list", "--department", "dining"]) == 0
    out = capsys.readouterr().out
    assert f"CMT-{a}\t" in out and out.count("CMT-") == 1


def test_list_refuses_a_state_the_cli_may_not_see(store, capsys):
    with pytest.raises(SystemExit) as e:
        main(["list", "--department", "dining", "--status", "awaiting"])
    assert e.value.code == 2


def test_show_prints_text_anchor_author_and_trail(store, capsys):
    _, add = store
    a = add("approved")
    assert main(["show", f"CMT-{a}"]) == 0
    out = capsys.readouterr().out
    for s in (f"CMT-{a}", "متن", "سالن", "پذیرش", "خوشامد", "dining-005-n003", "سمیرا",
             "submitted"):
        assert s in out


def test_show_hides_an_in_flight_comment(store, capsys):
    _, add = store
    a = add("awaiting")
    assert main(["show", f"CMT-{a}"]) == 2
    assert "comments: CMT-" in capsys.readouterr().err


def test_resolve_closes_and_writes_the_outbox(store):
    conn, add = store
    a = add("approved")
    assert main(["resolve", f"CMT-{a}", "--commit", "8f3c1ab", "--note", "اصلاح شد"]) == 0
    assert conn.execute("SELECT state FROM comments WHERE id=?", (a,)).fetchone()[0] == "addressed"
    ev = conn.execute(
        "SELECT user_name, note, detail FROM comment_events WHERE kind='addressed'").fetchone()
    assert ev[0] == "agent:control-bot" and ev[1] == "اصلاح شد" and "8f3c1ab" in ev[2]
    ob = conn.execute("SELECT kind, target, payload FROM outbox").fetchone()
    assert ob[0] == "comment.addressed" and ob[1] == f"CMT-{a}"
    assert "actor" not in json.loads(ob[2])


def test_resolve_twice_is_refused(store):
    _, add = store
    a = add("approved")
    main(["resolve", f"CMT-{a}"])
    assert main(["resolve", f"CMT-{a}"]) == 2


def test_missing_store_is_refused(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("COMMENTS_DB", str(tmp_path / "nope.db"))
    assert main(["list", "--department", "dining"]) == 2
    assert "not initialised" in capsys.readouterr().err


def test_wrong_schema_version_is_refused(store, capsys):
    conn, _ = store
    conn.execute("UPDATE schema_version SET version = 2")
    conn.commit()
    assert main(["list", "--department", "dining"]) == 2


def test_a_sqlite_file_with_no_schema_table_is_refused(tmp_path, monkeypatch, capsys):
    path = tmp_path / "comments.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE unrelated (x INTEGER)")
    conn.commit()
    monkeypatch.setenv("COMMENTS_DB", str(path))
    assert main(["list", "--department", "dining"]) == 2
    assert "not initialised" in capsys.readouterr().err


def test_a_non_sqlite_file_is_refused(tmp_path, monkeypatch, capsys):
    path = tmp_path / "comments.db"
    path.write_text("not a database", encoding="utf-8")
    monkeypatch.setenv("COMMENTS_DB", str(path))
    assert main(["list", "--department", "dining"]) == 2
    assert "not initialised" in capsys.readouterr().err


def test_unset_comments_db_says_so_and_not_a_dot(monkeypatch, capsys):
    monkeypatch.delenv("COMMENTS_DB", raising=False)
    assert main(["list", "--department", "dining"]) == 2
    err = capsys.readouterr().err
    assert "COMMENTS_DB unset" in err
    assert "(.)" not in err


def test_a_huge_or_malformed_ref_is_refused_not_a_traceback(store, capsys):
    for ref in ("CMT-99999999999999999999999", "CMT-1\n", "CMT-01"):
        assert main(["show", ref]) == 2
        assert main(["resolve", ref]) == 2
    assert "not found" in capsys.readouterr().err


def _note(conn):
    return conn.execute("SELECT note FROM comment_events WHERE kind='addressed'").fetchone()[0]


def test_resolve_strips_the_note_and_a_blank_one_is_none(store):
    conn, add = store
    a, b = add("approved"), add("approved")
    assert main(["resolve", f"CMT-{a}", "--note", "  انجام شد  "]) == 0
    assert _note(conn) == "انجام شد"
    conn.execute("DELETE FROM comment_events WHERE kind='addressed'")
    conn.commit()
    assert main(["resolve", f"CMT-{b}", "--note", "   "]) == 0
    assert _note(conn) is None
    assert json.loads(conn.execute("SELECT payload FROM outbox WHERE target=?",
                                   (f"CMT-{b}",)).fetchone()[0])["note"] is None


def test_resolve_refuses_a_note_over_the_cap(store, capsys):
    conn, add = store
    a = add("approved")
    assert main(["resolve", f"CMT-{a}", "--note", "ا" * 2001]) == 2
    assert "2000" in capsys.readouterr().err
    assert conn.execute("SELECT state FROM comments WHERE id=?", (a,)).fetchone()[0] == "approved"
    assert main(["resolve", f"CMT-{a}", "--note", "ا" * 2000]) == 0
