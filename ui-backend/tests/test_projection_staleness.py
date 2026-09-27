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
