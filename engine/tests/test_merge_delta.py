import copy

import pytest
from conftest import load_fixture
from engine_common import validate
from merge import apply_delta

RUN = "runs/cooking-2026-07-10"
NOW = "2026-07-10T09:00:00Z"


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_enrich_fills_empty_field_only(data_root):
    p = _proc()
    p["pending"] = []                           # isolate: start with no prior conflicts
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    n["description"] = ""                      # empty -> should be filled
    delta = {"add_nodes": [], "add_edges": [], "flag_removed": [],
             "enrich_nodes": [{"id": "cooking-001-n010",
                               "set": {"description": "filled now"}}]}
    apply_delta(p, delta, RUN, NOW)
    assert n["description"] == "filled now"
    assert not p["pending"]                     # no conflict, it was empty
    assert RUN in n["source"]["touched_by"]


def test_filled_value_change_becomes_pending_not_overwrite(data_root):
    p = _proc()
    p["pending"] = []                           # isolate: start with no prior conflicts
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    original = n["actor"]                        # 'کارپرداز' (filled)
    delta = {"add_nodes": [], "add_edges": [], "flag_removed": [],
             "enrich_nodes": [{"id": "cooking-001-n010",
                               "set": {"actor": "انباردار"}}]}
    apply_delta(p, delta, RUN, NOW)
    assert n["actor"] == original               # ORIGINAL UNTOUCHED (FR-M3)
    row = next(r for r in p["pending"] if r["node"] == "cooking-001-n010"
               and r["field"] == "actor")
    assert row["current"] == original and row["proposed"] == "انباردار"
    assert row["status"] == "open" and row["source"] == RUN


def test_flag_removed_marks_not_deletes(data_root):
    p = _proc()
    before = len(p["nodes"])
    delta = {"add_nodes": [], "add_edges": [], "enrich_nodes": [],
             "flag_removed": [{"id": "cooking-001-n060"}]}
    apply_delta(p, delta, RUN, NOW)
    assert len(p["nodes"]) == before            # nothing deleted (INV-4)
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n060")
    assert n["removed"] is True


def test_add_node_gets_new_id_and_preserves_existing(data_root):
    p = _proc()
    existing_ids = {n["id"] for n in p["nodes"]}
    existing_pos = {n["id"]: dict(n["position"]) for n in p["nodes"]
                    if n.get("layout") == "manual"}
    delta = {"add_nodes": [{"key": "n1", "type": "activity", "label": "کنترل کیفیت",
                            "description": "", "actor": "انباردار",
                            "icom": {"inputs": [], "controls": [], "outputs": [],
                                     "mechanisms": []}, "subprocess": None}],
             "add_edges": [{"from": "cooking-001-n060", "to": "n1"}],
             "enrich_nodes": [], "flag_removed": []}
    apply_delta(p, delta, RUN, NOW)
    validate("process.schema.json", p)
    new = [n for n in p["nodes"] if n["id"] not in existing_ids]
    assert len(new) == 1 and new[0]["id"].startswith("cooking-001-n")
    # temp key mapped in the edge
    assert any(e["to"] == new[0]["id"] for e in p["edges"])
    # a manual node's position is preserved
    for nid, pos in existing_pos.items():
        assert next(n for n in p["nodes"] if n["id"] == nid)["position"] == pos
    assert p["updated_at"] == NOW


def test_apply_delta_rejects_dangling_edge(data_root):
    p = _proc()
    delta = {"add_nodes": [], "add_edges": [{"from": "cooking-001-n060", "to": "ghost-id-999"}],
             "enrich_nodes": [], "flag_removed": []}
    with pytest.raises(ValueError):
        apply_delta(p, delta, RUN, NOW)
