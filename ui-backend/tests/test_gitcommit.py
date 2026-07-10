import subprocess

from inja_ui_backend import gitcommit, storage
from inja_ui_backend.tests_helpers import cfg_for


def _log(root):
    return subprocess.run(["git", "-C", str(root), "log", "--oneline"],
                          capture_output=True, text=True).stdout


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
