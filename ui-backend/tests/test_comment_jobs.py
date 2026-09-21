import json
import threading
from types import SimpleNamespace

from inja_ui_backend import comment_jobs, comment_rules, comments_db, db
from inja_ui_backend.store import comments as S


def _dbs(tmp_path):
    app = db.connect(tmp_path / "app.db")
    db.migrate(app)
    app.close()
    comments_db.open_comments(tmp_path / "c.db").close()
    return tmp_path / "app.db", tmp_path / "c.db"


def _audit(app_db):
    conn = db.connect(app_db)
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM audit_events ORDER BY id")]
    finally:
        conn.close()


def test_drain_copies_with_the_stamped_actor_and_its_own_time(tmp_path):
    app_db, c_db = _dbs(tmp_path)
    cc = comments_db.open_comments(c_db)
    S.outbox_append(cc, kind="comment.addressed", target="CMT-7",
                    payload={"note": "n", "commit": "abc", "actor": "09120000000"}, now=111)
    assert comment_jobs.drain(app_db, c_db) == 1
    row = _audit(app_db)[-1]
    assert (row["actor"], row["action"], row["target"], row["at"]) == (
        "agent:control-bot", "comment.addressed", "CMT-7", 111)
    assert json.loads(row["detail"])["outbox_id"] == 1


def test_replay_is_a_no_op(tmp_path):
    app_db, c_db = _dbs(tmp_path)
    cc = comments_db.open_comments(c_db)
    S.outbox_append(cc, kind="comment.addressed", target="CMT-7", payload={}, now=1)
    comment_jobs.drain(app_db, c_db)
    cc.execute("UPDATE outbox SET drained_at = NULL")          # crash before marking
    comment_jobs.drain(app_db, c_db)
    assert len([r for r in _audit(app_db) if r["action"] == "comment.addressed"]) == 1


def test_a_second_drain_finds_nothing(tmp_path):
    app_db, c_db = _dbs(tmp_path)
    cc = comments_db.open_comments(c_db)
    S.outbox_append(cc, kind="comment.addressed", target="CMT-7", payload={}, now=1)
    comment_jobs.drain(app_db, c_db)
    assert comment_jobs.drain(app_db, c_db) == 0


def test_malformed_payloads_are_drained_and_skipped_without_blocking_later_rows(tmp_path):
    app_db, c_db = _dbs(tmp_path)
    cc = comments_db.open_comments(c_db)
    cc.execute("INSERT INTO outbox (at, kind, target, payload)"
              " VALUES (1, 'comment.addressed', 'CMT-1', '[]')")            # a JSON list
    cc.execute("INSERT INTO outbox (at, kind, target, payload)"
              " VALUES (2, 'comment.addressed', 'CMT-2', 'not json')")      # not JSON at all
    S.outbox_append(cc, kind="comment.addressed", target="CMT-3", payload={}, now=3)
    assert comment_jobs.drain(app_db, c_db) == 1
    rows = cc.execute("SELECT id, drained_at FROM outbox ORDER BY id").fetchall()
    assert all(r["drained_at"] is not None for r in rows)
    addressed = [r for r in _audit(app_db) if r["action"] == "comment.addressed"]
    assert [r["target"] for r in addressed] == ["CMT-3"]


def test_tick_runs_reconcile_even_when_drain_fails(tmp_path, monkeypatch):
    app_db, c_db = _dbs(tmp_path)
    cfg = SimpleNamespace(app_db=app_db, comments_db=c_db)
    calls = []

    def _boom(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(comment_jobs, "drain", _boom)
    monkeypatch.setattr(comment_rules, "reconcile", lambda *a, **k: calls.append(1))
    comment_jobs.tick(cfg)
    assert calls == [1]


def test_an_unallowlisted_kind_is_drained_but_never_recorded(tmp_path):
    app_db, c_db = _dbs(tmp_path)
    cc = comments_db.open_comments(c_db)
    S.outbox_append(cc, kind="comment.mystery", target="CMT-1", payload={}, now=1)
    assert comment_jobs.drain(app_db, c_db) == 0
    row = cc.execute("SELECT drained_at FROM outbox WHERE id = 1").fetchone()
    assert row["drained_at"] is not None
    assert _audit(app_db) == []


def test_loop_runs_once_immediately_and_survives_an_exception(monkeypatch):
    stop = threading.Event()
    calls = []

    def _fake_tick(cfg):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")
        stop.set()

    monkeypatch.setattr(comment_jobs, "tick", _fake_tick)
    monkeypatch.setattr(comment_jobs, "INTERVAL", 0)
    comment_jobs.loop(None, stop)
    assert len(calls) == 2
