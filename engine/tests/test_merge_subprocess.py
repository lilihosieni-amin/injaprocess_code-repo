import copy

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import build_new, build_update, merge_new

RUN = "runs/cooking-2026-07-06"
NOW = "2026-07-06T10:00:00Z"


def _candidate_with_child():
    parent = copy.deepcopy(load_fixture("candidate.json"))  # nodes: n1 (activity), j1 (junction)
    child = copy.deepcopy(load_fixture("candidate.json"))
    child["process_name"] = "زیرفرایند تأیید"
    child["idef0"] = {
        "inputs": ["درخواست"], "controls": [], "outputs": ["تأیید"], "mechanisms": ["مدیر"],
    }
    parent["subprocesses"] = [{"parent_key": "n1", "process": child}]
    return parent


def test_build_new_creates_child_and_links(data_root):
    parent, children = build_new(_candidate_with_child(), "cooking", RUN, NOW, root=data_root)
    assert parent["id"] == "cooking-001"
    assert len(children) == 1
    child = children[0]
    assert child["id"] == "cooking-002"                       # sequential from same dept counter
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n001"}
    assert child["source"]["type"] == "auto"
    # parent box points at the child
    box = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n001")
    assert box["subprocess"] == "cooking-002"
    # ICOM boundary sync: parent box icom == child idef0 (child wins)
    assert box["icom"] == child["idef0"]
    validate("process.schema.json", parent)
    validate("process.schema.json", child)


def test_child_nodes_are_laid_out(data_root):
    _, children = build_new(_candidate_with_child(), "cooking", RUN, NOW, root=data_root)
    for n in children[0]["nodes"]:
        assert "position" in n and n["layout"] == "auto"


def test_duplicate_subprocess_on_same_box_rejected(data_root):
    cand = _candidate_with_child()
    cand["subprocesses"].append({
        "parent_key": "n1",
        "process": copy.deepcopy(cand["subprocesses"][0]["process"]),
    })
    with pytest.raises(ValueError):
        build_new(cand, "cooking", RUN, NOW, root=data_root)


def test_unknown_parent_key_rejected(data_root):
    cand = _candidate_with_child()
    cand["subprocesses"][0]["parent_key"] = "ghost"
    with pytest.raises(ValueError):
        build_new(cand, "cooking", RUN, NOW, root=data_root)


def test_merge_new_wrapper_returns_parent_only(data_root):
    proc = merge_new(load_fixture("candidate.json"), "cooking", RUN, NOW, root=data_root)
    assert proc["id"] == "cooking-001"          # existing behaviour preserved (no subprocesses)


def test_source_ref_survives_attempt_rerun(data_root):
    # re-run run_dir is runs/<voice>/attempt-NN — ref must be the voice, not "attempt-02"
    parent, children = build_new(_candidate_with_child(), "cooking",
                                 "runs/cooking-2026-07-06/attempt-02", NOW, root=data_root)
    assert parent["source"]["ref"] == "cooking-2026-07-06"
    assert children[0]["source"]["ref"] == "cooking-2026-07-06"


def test_build_update_adds_subprocess_on_existing_node(data_root):
    proc = copy.deepcopy(load_fixture("process.cooking-001.json"))  # has real node cooking-001-n010
    box = next(n for n in proc["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = None
    child = copy.deepcopy(load_fixture("candidate.json"))
    delta = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": [],
             "add_subprocesses": [{"parent": "cooking-001-n010", "process": child}]}
    updated, children = build_update(proc, delta, "runs/cooking-2026-07-10", NOW, root=data_root)
    assert len(children) == 1
    assert children[0]["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    box2 = next(n for n in updated["nodes"] if n["id"] == "cooking-001-n010")
    assert box2["subprocess"] == children[0]["id"]


def test_build_update_rejects_duplicate_child(data_root):
    proc = copy.deepcopy(load_fixture("process.cooking-001.json"))
    box = next(n for n in proc["nodes"] if n["id"] == "cooking-001-n010")
    box["subprocess"] = "cooking-099"                         # already has one
    delta = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": [],
             "add_subprocesses": [
                 {"parent": "cooking-001-n010", "process": load_fixture("candidate.json")},
             ]}
    with pytest.raises(ValueError):
        build_update(proc, delta, "runs/x", NOW, root=data_root)
