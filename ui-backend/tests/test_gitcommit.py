import subprocess

from inja_ui_backend import gitcommit, storage
from inja_ui_backend.tests_helpers import cfg_for


def _log(root):
    return subprocess.run(["git", "-C", str(root), "log", "--oneline"],
                          capture_output=True, text=True).stdout


def _status(root):
    """The name-status lines of HEAD, e.g. ["M\tdepartments/.../x.json"]."""
    out = subprocess.run(["git", "-C", str(root), "show", "--name-status",
                          "--format=", "HEAD"], capture_output=True, text=True).stdout
    return [ln for ln in out.splitlines() if ln.strip()]


def _names(root):
    return [ln.split("\t", 1)[1] for ln in _status(root)]


def test_commit_makes_one_ui_edit_commit(data_root):
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    doc = storage.read_json(p)
    doc["name"] = "نام تازه"
    storage.write_json_atomic(p, doc)
    gitcommit.commit(cfg, [p], "cooking-001", "save")
    top = _log(data_root).splitlines()[0]
    assert "ui-edit(cooking-001): save" in top


def test_commit_noop_when_no_change(data_root):
    cfg = cfg_for(data_root)
    before = len(_log(data_root).splitlines())
    gitcommit.commit(cfg, [], "cooking-001", "save")
    assert len(_log(data_root).splitlines()) == before


def test_commit_noop_when_paths_unchanged(data_root):
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    before = len(_log(data_root).splitlines())
    # re-write byte-identical content, then commit the path: no real change → no-op
    storage.write_json_atomic(p, storage.read_json(p))
    gitcommit.commit(cfg, [p], "cooking-001", "save")
    assert len(_log(data_root).splitlines()) == before


def test_commit_skips_an_absent_untracked_path(data_root):
    """The production case: delete's order.json for a department that has none.

    The absent, never-tracked path has no pathspec `git add` can match; it must
    be skipped, and the paths beside it in the same call must still commit.
    """
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    doc = storage.read_json(p)
    doc["name"] = "نام تازه"
    storage.write_json_atomic(p, doc)
    ghost = storage.order_path(data_root, "cooking")   # never written, never tracked
    assert not ghost.exists()
    gitcommit.commit(cfg, [p, ghost], "cooking-001", "save")
    assert "ui-edit(cooking-001): save" in _log(data_root).splitlines()[0]
    assert _names(data_root) == ["departments/cooking/processes/cooking-001.json"]
    assert not ghost.exists()


def test_commit_stages_the_deletion_of_a_tracked_path(data_root):
    """Absent from disk but tracked is not "nothing to stage" — it is a deletion."""
    cfg = cfg_for(data_root)
    p = storage.proc_path(data_root, "cooking-001")
    p.unlink()
    gitcommit.commit(cfg, [p], "cooking-001", "delete process")
    assert "ui-edit(cooking-001): delete process" in _log(data_root).splitlines()[0]
    assert _status(data_root) == ["D\tdepartments/cooking/processes/cooking-001.json"]


def test_commit_raises_on_git_failure(tmp_path):
    import pytest
    cfg = cfg_for(tmp_path)          # a real dir, but NOT a git repository
    p = tmp_path / "x.json"
    p.write_text("{}", encoding="utf-8")
    with pytest.raises(RuntimeError):
        gitcommit.commit(cfg, [p], "x-001", "save")
