"""`confirmation.invalidated` — written once per transition, only by the
projection (spec D60, addendum D80; §11 test 16b)."""
import json
import subprocess

import pytest

from inja_ui_backend import db, gitcommit, projection
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


def _head(root):
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
    """Made through `gitcommit.commit`, so recorded in `ui_commits`: credited
    to the user recorded there (D80, final review I2)."""
    _confirm_current(cfg, data_root)
    projection.run(cfg)
    _set_name(data_root, "از پنل")
    assert gitcommit.commit(cfg, [_path(data_root)], PID, "save", actor="09121112222")
    projection.run(cfg)
    assert _invalidated(cfg) == [("09121112222", PID)]


def test_a_forged_ui_edit_commit_is_credited_to_its_author_never_its_trailer(
        cfg, data_root):
    """Final review I2: a hand-made commit with the app's subject and an
    `Acted-By` naming a real user is not in `ui_commits` — the staleness it
    causes is its author's, and the named user is never blamed."""
    _confirm_current(cfg, data_root)
    projection.run(cfg)
    _set_name(data_root, "جعلی")
    _commit(data_root, "ui-edit(cooking-001): save", author="ui-edit",
            body="Acted-By: 09121112222")
    projection.run(cfg)
    assert _invalidated(cfg) == [("git:ui-edit", PID)]
    conn = db.connect(cfg.app_db)
    try:
        edited = [r["actor"] for r in conn.execute(
            "SELECT actor FROM audit_events WHERE action = 'process.edited'")]
    finally:
        conn.close()
    assert edited == ["git:ui-edit"]


def test_a_reconfirm_mid_pass_is_not_judged_against_the_old_map(
        cfg, data_root, monkeypatch):
    """Final review M3: a confirmation replaced between the pass building its
    fingerprint map and opening its transaction — possibly for content newer
    than `head` — is left untouched that pass: no announcement, no mark."""
    _confirm_current(cfg, data_root)
    projection.run(cfg)                                          # seeds
    _overview_path(data_root).write_text(
        _overview_path(data_root).read_text(encoding="utf-8") + "\n", encoding="utf-8")
    _commit(data_root, "chat-edit(cooking): unrelated")          # HEAD moves
    real = projection._judgeable

    def judgeable_then_reconfirm(*args):
        out = real(*args)
        _confirm(cfg, PID, "a-newer-fingerprint")               # the race
        return out

    monkeypatch.setattr(projection, "_judgeable", judgeable_then_reconfirm)
    projection.run(cfg)
    assert _invalidated(cfg) == [] and _emitted(cfg, PID) is None


def test_seeding_marks_what_is_already_stale_without_announcing_it(cfg, data_root):
    _confirm(cfg, PID, "not-the-current-fingerprint")
    projection.run(cfg)
    head = subprocess.run(["git", "-C", str(data_root), "rev-parse", "HEAD"],
                          check=True, capture_output=True, text=True).stdout.strip()
    assert _invalidated(cfg) == [] and _emitted(cfg, PID) == head


def _overview_path(root):
    return root / "departments" / "cooking" / "overview.json"


def test_an_uncommitted_write_is_not_judged_until_it_lands(cfg, data_root):
    """Reviewer's reproduction (fix review, D80): a target is fingerprinted at
    `head`, never in the working tree, so a save that has not been committed
    yet cannot make a *different*, already-committed commit take the blame."""
    _confirm_current(cfg, data_root)
    projection.run(cfg)                                          # seeds

    _set_name(data_root, "نوشته نشده")                            # saved, NOT committed
    ov = json.loads(_overview_path(data_root).read_text(encoding="utf-8"))
    ov["name"] = ov.get("name", "") + " ویرایش نامرتبط"
    _overview_path(data_root).write_text(json.dumps(ov, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
    # The app's own commits (`gitcommit.commit`, recorded in `ui_commits`)
    # write no edit event of their own (D78) — only the recorded user is
    # credited with a staleness event, which is exactly what lets this
    # reproduce the reviewer's misattribution without the noise of an
    # unrelated `process.edited`/`department.edited` row in the way.
    assert gitcommit.commit(cfg, [_overview_path(data_root)], "cooking", "save",
                            actor="AAAA")                         # stages only the overview
    unrelated_sha = _head(data_root)
    projection.run(cfg)
    assert _invalidated(cfg) == []                                # not judged yet

    assert gitcommit.commit(cfg, [_path(data_root)], PID, "save", actor="BBBB")
    bbbb_sha = _head(data_root)
    projection.run(cfg)

    rows = _invalidated(cfg)
    assert rows == [("BBBB", PID)]
    conn = db.connect(cfg.app_db)
    try:
        detail = json.loads(conn.execute(
            "SELECT detail FROM audit_events WHERE action = 'confirmation.invalidated'"
        ).fetchone()[0])
    finally:
        conn.close()
    assert detail["commit"] == bbbb_sha
    assert detail["commit"] != unrelated_sha


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
