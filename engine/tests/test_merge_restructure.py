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


def _committed_with_child(root, parent_pid, child_pid, box_key="n1"):
    """A parent process whose box already points at child_pid, and the child."""
    parent = copy.deepcopy(load_fixture("process.cooking-001.json"))
    parent["id"] = parent_pid
    parent["parent"] = None
    parent["pending"] = []
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n060")
    box["id"] = f"{parent_pid}-n060"
    box["subprocess"] = child_pid
    parent["nodes"] = [n for n in parent["nodes"]
                       if n["id"] in ("start", "end", box["id"])
                       or n["id"].startswith(f"{parent_pid}-")]
    for n in parent["nodes"]:
        for pat in ("cooking-001-n010", "cooking-001-j1"):
            if n["id"] == pat:
                n["id"] = pat.replace("cooking-001", parent_pid)
    parent["edges"] = []
    (root / "departments/cooking/processes" / f"{parent_pid}.json").write_text(
        json.dumps(parent, ensure_ascii=False), encoding="utf-8")

    child = copy.deepcopy(load_fixture("process.cooking-001.json"))
    child["id"] = child_pid
    child["parent"] = {"process": parent_pid, "node": box["id"]}
    child["pending"] = []
    child["nodes"] = [n for n in child["nodes"] if n["id"] in ("start", "end")]
    child["edges"] = []
    (root / "departments/cooking/processes" / f"{child_pid}.json").write_text(
        json.dumps(child, ensure_ascii=False), encoding="utf-8")
    return parent, child


def test_subprocess_links_reparent_existing_child(data_root):
    # cooking-001 (has box -> cooking-050 child); split cooking-001 into a heir that
    # re-adopts cooking-050 under its own new box (temp key "n1").
    _committed_with_child(data_root, "cooking-001", "cooking-050")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("heir-adopts"),
                       "supersedes": ["cooking-001"],
                       "subprocess_links": [{"parent_key": "n1", "child": "cooking-050"}]}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    heir = next(h for h in heirs if h["parent"] is None)
    box = next(n for n in heir["nodes"] if n.get("subprocess") == "cooking-050")
    assert box is not None
    # the child, returned in heirs, now points at the heir
    child = next(h for h in heirs if h["id"] == "cooking-050")
    assert child["parent"] == {"process": heir["id"], "node": box["id"]}
    assert box["icom"] == child["idef0"]           # icom synced


def test_dangling_child_link_is_refused(data_root):
    _committed(data_root, "cooking-001")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("h"), "supersedes": ["cooking-001"],
                       "subprocess_links": [{"parent_key": "n1", "child": "cooking-999"}]}]}
    with pytest.raises(ValueError, match="cooking-999"):
        restructure(plan, RUN, NOW, root=data_root)


def test_superseded_child_retargets_parent_box(data_root):
    # cooking-001 is a parent; cooking-050 is its child. We supersede the CHILD
    # (cooking-050) with a new heir; the parent box must retarget to the heir.
    _committed_with_child(data_root, "cooking-001", "cooking-050")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("new-child"), "supersedes": ["cooking-050"],
                       "subprocess_links": []}]}
    heirs, tombstoned = restructure(plan, RUN, NOW, root=data_root)
    heir_id = heirs[0]["id"]
    # the parent process on disk (or in the returned set) has its box retargeted
    parent = next((h for h in heirs if h["id"] == "cooking-001"), None)
    if parent is None:
        parent = json.loads(
            (data_root / "departments/cooking/processes/cooking-001.json")
            .read_text(encoding="utf-8"))
    box = next(n for n in parent["nodes"] if n.get("type") == "activity"
               and n.get("subprocess") == heir_id)
    assert box is not None
    assert heirs[0]["parent"]["process"] == "cooking-001"


def test_cycle_link_rejected(data_root):
    # a heir whose declared child is actually the heir's own ancestor -> cycle
    _committed_with_child(data_root, "cooking-001", "cooking-050")
    plan = {"department": "cooking",
            "heirs": [{"candidate": _cand("h"), "supersedes": ["cooking-050"],
                       "subprocess_links": [{"parent_key": "n1", "child": "cooking-001"}]}]}
    with pytest.raises(ValueError, match="cycle|ancestor"):
        restructure(plan, RUN, NOW, root=data_root)
