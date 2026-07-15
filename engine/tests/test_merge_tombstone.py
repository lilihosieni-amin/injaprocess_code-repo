import copy
import json

from conftest import load_fixture
from engine_common import validate
from merge import remove_process, tombstone
from merge.cli import main as merge_main

NOW = "2026-07-12T09:00:00Z"


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_tombstone_sets_flags_and_heirs():
    p = _proc()
    out = tombstone(p, ["cooking-007", "cooking-008"], NOW)
    assert out["tombstoned"] is True
    assert out["superseded_by"] == ["cooking-007", "cooking-008"]
    assert out["updated_at"] == NOW
    validate("process.schema.json", out)


def test_remove_process_is_tombstone_with_no_heir():
    p = _proc()
    out = remove_process(p, NOW)
    assert out["tombstoned"] is True
    assert out["superseded_by"] == []
    validate("process.schema.json", out)


def _proc_path(root, pid):
    dept = pid.rsplit("-", 1)[0]
    return root / "departments" / dept / "processes" / f"{pid}.json"


def test_cli_remove_writes_tombstone(data_root):
    path = _proc_path(data_root, "cooking-001")
    path.write_text(json.dumps(_proc(), ensure_ascii=False), encoding="utf-8")
    rc = merge_main(["remove", "--process", "cooking-001",
                     "--run", "runs/x", "--now", NOW])
    assert rc == 0
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["tombstoned"] is True and written["superseded_by"] == []
