import copy
import json

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import attach_subprocess
from merge.cli import main as merge_main

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _parent():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["pending"] = []
    box = next(n for n in p["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = None                          # a free activity box
    return p


def _child(pid="cooking-050"):
    c = copy.deepcopy(load_fixture("process.cooking-001.json"))
    c["id"] = pid
    c["parent"] = None
    c["pending"] = []
    c["nodes"] = [n for n in c["nodes"] if n["id"] in ("start", "end")]
    c["edges"] = []
    return c


def test_attach_links_parent_and_child():
    parent, child = attach_subprocess(_parent(), "cooking-001-n010", _child(), RUN, NOW)
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert box["subprocess"] == "cooking-050"
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    assert box["icom"] == child["idef0"]              # icom synced
    assert RUN in box["source"]["touched_by"]
    assert parent["updated_at"] == NOW
    validate("process.schema.json", parent)
    validate("process.schema.json", child)


def test_attach_rejects_non_activity_node():
    with pytest.raises(ValueError):
        attach_subprocess(_parent(), "cooking-001-j1", _child(), RUN, NOW)


def test_attach_rejects_occupied_node():
    p = _parent()
    box = next(n for n in p["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = "cooking-099"
    with pytest.raises(ValueError):
        attach_subprocess(p, "cooking-001-n010", _child(), RUN, NOW)


def test_attach_rejects_missing_node():
    with pytest.raises(ValueError):
        attach_subprocess(_parent(), "ghost", _child(), RUN, NOW)


def test_attach_rejects_cycle():
    # parent is itself a child of the would-be child -> attaching the child would cycle
    parent = _parent()
    parent["parent"] = {"process": "cooking-050", "node": "cooking-050-n001"}
    with pytest.raises(ValueError, match="cycle|ancestor"):
        attach_subprocess(parent, "cooking-001-n010", _child("cooking-050"), RUN, NOW)


def _write(root, proc):
    dept = proc["id"].rsplit("-", 1)[0]
    (root / "departments" / dept / "processes" / f"{proc['id']}.json").write_text(
        json.dumps(proc, ensure_ascii=False), encoding="utf-8")


def test_cli_attach_writes_both(data_root):
    _write(data_root, _parent())
    _write(data_root, _child())
    rc = merge_main(["attach-subprocess", "--parent-process", "cooking-001",
                     "--node", "cooking-001-n010", "--child", "cooking-050",
                     "--run", RUN, "--now", NOW])
    assert rc == 0
    parent = json.loads((data_root / "departments/cooking/processes/cooking-001.json")
                        .read_text(encoding="utf-8"))
    child = json.loads((data_root / "departments/cooking/processes/cooking-050.json")
                       .read_text(encoding="utf-8"))
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert box["subprocess"] == "cooking-050"
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
