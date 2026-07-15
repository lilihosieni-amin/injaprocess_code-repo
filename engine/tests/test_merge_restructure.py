import copy
import json

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import restructure
from merge.cli import main as merge_main

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _cand(name="heir"):
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["process_name"] = name
    return c


def _committed(root, pid):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = pid
    p["parent"] = None
    p["nodes"] = [n for n in p["nodes"]
                  if n["id"] not in ("cooking-001-n060",)]  # drop the child-bearing box
    for n in p["nodes"]:
        if "-" in n["id"] and n["id"] not in ("start", "end"):
            n["id"] = n["id"].replace("cooking-001", pid)
    p["edges"] = [e for e in p["edges"]
                  if "cooking-001-n060" not in (e["from"], e["to"])]
    for e in p["edges"]:
        e["from"] = e["from"].replace("cooking-001", pid)
        e["to"] = e["to"].replace("cooking-001", pid)
    p["pending"] = []
    path = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    path.write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")
    return p


def test_merge_two_into_one_heir(data_root):
    _committed(data_root, "cooking-001")
    _committed(data_root, "cooking-002")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("merged"),
                       "supersedes": ["cooking-001", "cooking-002"],
                       "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    assert len(heirs) == 1 and len(tombstoned) == 2
    assert heirs[0]["id"] == "cooking-003"            # fresh id past the ledger high-water
    for t in tombstoned:
        assert t["tombstoned"] is True
        assert t["superseded_by"] == ["cooking-003"]
        validate("process.schema.json", t)
    validate("process.schema.json", heirs[0])


def test_split_one_into_two_heirs(data_root):
    _committed(data_root, "cooking-001")
    plan = {"department": "cooking",
            "heirs": [
                {"candidate": _cand("part-a"), "supersedes": ["cooking-001"],
                 "subprocess_links": []},
                {"candidate": _cand("part-b"), "supersedes": ["cooking-001"],
                 "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    assert [h["id"] for h in heirs] == ["cooking-002", "cooking-003"]  # distinct fresh ids
    assert len(tombstoned) == 1
    assert sorted(tombstoned[0]["superseded_by"]) == ["cooking-002", "cooking-003"]


def test_restructure_new_only_no_supersedes(data_root):
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("brand-new"), "supersedes": [],
                       "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    assert len(heirs) == 1 and tombstoned == []


def test_cli_restructure_writes_all(data_root):
    _committed(data_root, "cooking-001")
    _committed(data_root, "cooking-002")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("merged"),
                       "supersedes": ["cooking-001", "cooking-002"],
                       "subprocess_links": []}]}
    plan_path = data_root / "runs" / "plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    rc = merge_main(["restructure", "--plan", str(plan_path),
                     "--run", RUN, "--now", NOW])
    assert rc == 0
    heir = json.loads((data_root / "departments/cooking/processes/cooking-003.json")
                      .read_text(encoding="utf-8"))
    assert heir["name"] == "merged"
    t1 = json.loads((data_root / "departments/cooking/processes/cooking-001.json")
                    .read_text(encoding="utf-8"))
    assert t1["tombstoned"] is True and t1["superseded_by"] == ["cooking-003"]
