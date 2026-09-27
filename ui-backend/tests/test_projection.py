"""Content events projected from the data-repo's git history (spec D60,
addendum D79; §11 test 16b)."""
import json
import subprocess

import pytest

from inja_ui_backend import db, gitcommit, projection
from inja_ui_backend.tests_helpers import cfg_for


@pytest.fixture
def cfg(data_root, tmp_path):
    c = cfg_for(data_root, tmp_path / "app.db")
    conn = db.connect(c.app_db)
    db.migrate(conn)
    conn.close()
    return c


def _git(root, *args):
    return subprocess.run(["git", "-C", str(root), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


def _commit(root, subject, author="deploy", body=None):
    _git(root, "add", "-A")
    args = ["-c", f"user.name={author}", "-c", "user.email=x@x", "commit", "-q",
            "-m", subject]
    if body:
        args += ["-m", body]
    _git(root, *args)
    return _git(root, "rev-parse", "HEAD")


def _proc(root, pid):
    return root / "departments" / pid.rsplit("-", 1)[0] / "processes" / f"{pid}.json"


def _rename(root, pid, name):
    p = _proc(root, pid)
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["name"] = name
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


def _rows(cfg, action):
    conn = db.connect(cfg.app_db)
    try:
        return [(r["actor"], r["target"], json.loads(r["detail"] or "{}"))
                for r in conn.execute("SELECT actor, target, detail FROM audit_events"
                                      " WHERE action = ? ORDER BY id", (action,))]
    finally:
        conn.close()


def _marker(cfg):
    conn = db.connect(cfg.app_db)
    try:
        return conn.execute("SELECT sha FROM projection_state").fetchone()[0]
    finally:
        conn.close()


def test_the_first_run_seeds_at_head_and_projects_no_history(cfg, data_root):
    _rename(data_root, "cooking-001", "پیش از P3")
    head = _commit(data_root, "chat-edit(cooking-001): old")
    assert projection.run(cfg) == 0
    assert _marker(cfg) == head and _rows(cfg, "process.edited") == []


def test_a_chat_edit_is_the_agents_and_a_second_pass_adds_nothing(cfg, data_root):
    projection.run(cfg)
    _rename(data_root, "cooking-001", "ویرایش چت")
    sha = _commit(data_root, "chat-edit(cooking-001): rename")
    assert projection.run(cfg) == 1
    assert _rows(cfg, "process.edited") == [
        ("agent:control-bot", "cooking-001", {"change": "updated", "commit": sha})]
    assert projection.run(cfg) == 0


def test_a_pipeline_commit_names_its_run(cfg, data_root):
    projection.run(cfg)
    run = data_root / "runs" / "cooking" / "20260927-101500"
    run.mkdir(parents=True)
    (run / "meta.json").write_text("{}", encoding="utf-8")
    _rename(data_root, "cooking-001", "از جلسه")
    _commit(data_root, "pipeline(cooking): 1 processes from 1 transcripts")
    projection.run(cfg)
    assert _rows(cfg, "process.edited")[0][0] == "run:cooking/20260927-101500"


def test_a_quantify_commit_names_exactly_the_facts_it_changed(cfg, data_root):
    projection.run(cfg)
    run = data_root / "runs" / "facts" / "cooking" / "20260927-101500"
    run.mkdir(parents=True)
    (run / "meta.json").write_text("{}", encoding="utf-8")
    path = data_root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["entries"][0]["title"] = "عنوان تازه"                     # F-00001
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    _commit(data_root, "quantify(cooking): 0 created, 1 updated")
    projection.run(cfg)
    rows = _rows(cfg, "fact.edited")
    assert [(a, t, d["change"], d["department"]) for a, t, d in rows] == [
        ("run:facts/cooking/20260927-101500", "F-00001", "updated", "cooking")]


def test_the_apps_own_commit_writes_no_edit_event(cfg, data_root):
    """D80 (final review I2): made through `gitcommit.commit`, so recorded in
    `ui_commits` — its endpoint wrote the edit event, the projection writes
    none."""
    projection.run(cfg)
    _rename(data_root, "cooking-001", "از پنل")
    assert gitcommit.commit(cfg, [_proc(data_root, "cooking-001")], "cooking-001",
                            "save", actor="09120000000")
    projection.run(cfg)
    assert _rows(cfg, "process.edited") == []


def test_an_unrecorded_ui_edit_commit_is_an_ordinary_commit(cfg, data_root):
    """Final review I2: subject, author and `Acted-By` trailer are all
    forgeable by anything that can commit to the data-repo. Not made by
    `gitcommit.commit`, so not in `ui_commits` — its author's, like any
    stranger's commit, and the trailer is never read."""
    projection.run(cfg)
    _rename(data_root, "cooking-001", "جعلی")
    sha = _commit(data_root, "ui-edit(cooking-001): save", author="ui-edit",
                  body="Acted-By: 09121112222")
    projection.run(cfg)
    assert _rows(cfg, "process.edited") == [
        ("git:ui-edit", "cooking-001", {"change": "updated", "commit": sha})]


def test_a_consolidate_commit_is_the_agents(cfg, data_root):
    """Final review I1: Gate C's commits (`consolidate({dept}): item {n} —
    {merge|attach}`) are the pipeline agent's, whoever authored them."""
    projection.run(cfg)
    _rename(data_root, "cooking-001", "ادغام")
    _commit(data_root, "consolidate(cooking): item 1 — merge", author="deploy")
    projection.run(cfg)
    assert _rows(cfg, "process.edited")[0][0] == "agent:control-bot"


def test_a_revert_takes_the_kind_it_reverts(cfg, data_root):
    """Final review I1: `Revert "X"` is the agent's when X is an agent kind,
    and otherwise its author's — never trusted as the app's or a run's."""
    projection.run(cfg)
    _rename(data_root, "cooking-001", "یک")
    _commit(data_root, 'Revert "chat-edit(cooking-001): x"', author="deploy")
    _rename(data_root, "cooking-001", "دو")
    sha = _commit(data_root, 'Revert "ui-edit(cooking-001): save"', author="lili")
    projection.run(cfg)
    rows = _rows(cfg, "process.edited")
    assert [a for a, _, _ in rows] == ["agent:control-bot", "git:lili"]
    assert rows[1] == ("git:lili", "cooking-001", {"change": "updated", "commit": sha})


def test_a_persons_commit_is_theirs(cfg, data_root):
    projection.run(cfg)
    _rename(data_root, "cooking-001", "بازنشانی")
    _commit(data_root, "reset(cooking): back to seed", author="lili")
    projection.run(cfg)
    assert _rows(cfg, "process.edited")[0][0] == "git:lili"


def test_overview_and_order_in_one_commit_are_one_department_event(cfg, data_root):
    projection.run(cfg)
    ov = data_root / "departments" / "cooking" / "overview.json"
    ov.write_text(ov.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    (data_root / "departments" / "cooking" / "order.json").write_text(
        '{"order": ["cooking-001"]}\n', encoding="utf-8")
    _commit(data_root, "restructure(cooking): reorder")
    projection.run(cfg)
    assert [(a, t) for a, t, _ in _rows(cfg, "department.edited")] == [
        ("agent:control-bot", "cooking")]


def test_created_and_deleted_processes(cfg, data_root):
    projection.run(cfg)
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    new = src.with_name("cooking-002.json")
    new.write_text(src.read_text(encoding="utf-8").replace("cooking-001", "cooking-002"),
                   encoding="utf-8")
    _commit(data_root, "chat-edit(cooking-002): add")
    new.unlink()
    _commit(data_root, "chat-edit(cooking-002): remove")
    projection.run(cfg)
    assert [(t, d["change"]) for _, t, d in _rows(cfg, "process.edited")] == [
        ("cooking-002", "created"), ("cooking-002", "deleted")]


def test_a_merge_projects_its_commits_once_and_itself_never(cfg, data_root):
    projection.run(cfg)
    _git(data_root, "checkout", "-q", "-b", "side")
    _rename(data_root, "cooking-001", "از شاخه")
    _commit(data_root, "chat-edit(cooking-001): side")
    _git(data_root, "checkout", "-q", "-")
    _git(data_root, "-c", "user.name=lili", "-c", "user.email=x@x",
         "merge", "-q", "--no-ff", "-m", "merge: side", "side")
    projection.run(cfg)
    assert len(_rows(cfg, "process.edited")) == 1


def test_a_commit_landing_between_head_read_and_log_is_not_duplicated(cfg, data_root, monkeypatch):
    projection.run(cfg)
    _rename(data_root, "cooking-001", "الف")
    sha_a = _commit(data_root, "chat-edit(cooking-001): a")
    monkeypatch.setattr(projection.gitcommit, "head", lambda cfg: sha_a)
    assert projection.run(cfg) == 1
    assert _rows(cfg, "process.edited") == [
        ("agent:control-bot", "cooking-001", {"change": "updated", "commit": sha_a})]
    assert _marker(cfg) == sha_a

    monkeypatch.undo()
    _rename(data_root, "cooking-001", "ب")
    sha_b = _commit(data_root, "chat-edit(cooking-001): b")
    assert projection.run(cfg) == 1
    rows = _rows(cfg, "process.edited")
    assert [d["commit"] for _, _, d in rows] == [sha_a, sha_b]


def test_a_pipeline_commit_names_the_newest_matching_run_not_leftovers(cfg, data_root):
    projection.run(cfg)
    for dept, stamp in [("cashier", "20260101-000000"), ("chat", "20260101-000000"),
                        ("cooking", "20260927-101500"), ("cooking", "20260927-111500")]:
        run = data_root / "runs" / dept / stamp
        run.mkdir(parents=True)
        (run / ("x.json" if dept == "chat" else "meta.json")).write_text(
            "{}", encoding="utf-8")
    _rename(data_root, "cooking-001", "از جلسه")
    _commit(data_root, "pipeline(cooking): 1 processes from 1 transcripts")
    projection.run(cfg)
    assert _rows(cfg, "process.edited")[0][0] == "run:cooking/20260927-111500"


def test_an_unreadable_head_in_a_repository_is_said_not_swallowed(
        cfg, data_root, monkeypatch, caplog):
    """Final review M7: `.git` is there but git reads no HEAD — git failing in
    the container (e.g. `safe.directory`), which would otherwise stop every
    content event silently."""
    monkeypatch.setattr(projection.gitcommit, "head", lambda cfg: "")
    with caplog.at_level("WARNING", logger="inja_ui_backend.projection"):
        assert projection.run(cfg) == 0
    assert "cannot read HEAD" in caplog.text


def test_a_rewritten_history_is_recorded_and_reseeded(cfg, data_root):
    projection.run(cfg)
    conn = db.connect(cfg.app_db)
    conn.execute("UPDATE projection_state SET sha = ?", ("0" * 40,))
    conn.close()
    assert projection.run(cfg) == 1
    assert _rows(cfg, "projection.discontinuity")[0][0] == projection.SYSTEM
    assert _marker(cfg) == _git(data_root, "rev-parse", "HEAD")
    assert _rows(cfg, "process.edited") == []
