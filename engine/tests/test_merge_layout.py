import copy

from conftest import load_fixture
from layout import grid_positions, topo_order
from merge import apply_delta

RUN, NOW = "runs/cooking-2026-07-10", "2026-07-10T09:00:00Z"


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_tail_append_does_not_move_upstream(data_root):
    p = _proc()
    # make everything auto so we can compare against a clean layered grid
    from layout import full_relayout
    full_relayout(p)
    before = {n["id"]: dict(n["position"]) for n in p["nodes"]}
    last_id = topo_order(p["nodes"], p["edges"])[-1]
    delta = {"add_nodes": [{"key": "t", "type": "activity", "label": "z",
             "description": "", "actor": "", "icom": {"inputs": [], "controls": [],
             "outputs": [], "mechanisms": []}, "subprocess": None}],
             "add_edges": [{"from": last_id, "to": "t"}],
             "enrich_nodes": [], "flag_removed": []}
    apply_delta(p, delta, RUN, NOW)
    for nid, pos in before.items():                 # all pre-existing nodes unmoved
        assert next(n for n in p["nodes"] if n["id"] == nid)["position"] == pos
    # the appended node sits at its layered grid cell
    tnode = next(n for n in p["nodes"] if n.get("label") == "z")
    assert tnode["position"] == grid_positions(p["nodes"], p["edges"])[tnode["id"]]


def test_manual_downstream_survives_middle_insert(data_root):
    p = _proc()
    from layout import full_relayout
    full_relayout(p)
    order = topo_order(p["nodes"], p["edges"])
    # pick an early edge to split; mark the last node manual
    manual = next(n for n in p["nodes"] if n["id"] == order[-1])
    manual["layout"] = "manual"
    manual["position"] = {"x": 999, "y": 999}
    src, dst = order[1], order[2]
    delta = {"add_nodes": [{"key": "m", "type": "activity", "label": "mid",
             "description": "", "actor": "", "icom": {"inputs": [], "controls": [],
             "outputs": [], "mechanisms": []}, "subprocess": None}],
             "add_edges": [{"from": src, "to": "m"}, {"from": "m", "to": dst}],
             "enrich_nodes": [], "flag_removed": []}
    apply_delta(p, delta, RUN, NOW)
    assert manual["position"] == {"x": 999, "y": 999}   # manual preserved
