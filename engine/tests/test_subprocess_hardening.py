import copy

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import _new_node, build_new

RUN = "runs/cooking-2026-07-06"
NOW = "2026-07-06T10:00:00Z"


def test_candidate_node_rejects_subprocess_string():
    # a fabricated child id on a candidate node must be schema-rejected (INV-1)
    c = copy.deepcopy(load_fixture("candidate.json"))
    for n in c["nodes"]:
        if n["type"] == "activity":
            n["subprocess"] = "cooking-042"
    with pytest.raises(ValueError):
        validate("candidate.schema.json", c)


def test_delta_add_node_rejects_subprocess_string():
    d = copy.deepcopy(load_fixture("delta.json"))
    for n in d["add_nodes"]:
        if n["type"] == "activity":
            n["subprocess"] = "cooking-042"
    with pytest.raises(ValueError):
        validate("delta.schema.json", d)


def test_new_node_forces_subprocess_null():
    # defensive: even if a value slipped past validation, merge must not trust it
    cand_node = {"key": "n1", "type": "activity", "label": "x", "description": "",
                 "actor": "y",
                 "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
                 "subprocess": "cooking-042"}
    node = _new_node(cand_node, "cooking-001-n001", RUN)
    assert node["subprocess"] is None


def test_build_new_still_sets_real_subprocess_on_parent(data_root):
    # regression guard: nulling on copy must not break the auto-subprocess link,
    # which _attach_subprocesses sets AFTER _new_node runs
    parent = copy.deepcopy(load_fixture("candidate.json"))
    child = copy.deepcopy(load_fixture("candidate.json"))
    parent["subprocesses"] = [{"parent_key": "n1", "process": child}]
    p, children = build_new(parent, "cooking", RUN, NOW, root=data_root)
    box = next(n for n in p["nodes"] if n["id"] == "cooking-001-n001")
    assert box["subprocess"] == children[0]["id"]
