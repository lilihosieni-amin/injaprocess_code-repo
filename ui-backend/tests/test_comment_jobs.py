import json

from inja_ui_backend import comment_jobs, comments_db, db
from inja_ui_backend.store import comments as S


def _dbs(tmp_path):
    app = db.connect(tmp_path / "app.db"); db.migrate(app); app.close()
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
