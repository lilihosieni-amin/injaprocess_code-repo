import copy

from conftest import load_fixture
from layout import cell, full_relayout, local_relayout


def test_serpentine_row_directions():
    # PER_ROW=4, SX=40, GX=210 => row0 L->R, row1 R->L
    assert cell(0) == {"x": 40, "y": 90}
    assert cell(3)["x"] == 40 + 3 * 210      # last of row 0 (rightmost)
    assert cell(4)["x"] == 40 + 3 * 210      # first of row 1 (also rightmost => serpentine)
    assert cell(4)["y"] == 90 + 175          # next row down


def test_full_relayout_positions_all_and_sets_auto():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:            # dirty positions/layout
        n["position"] = {"x": -1, "y": -1}
    p["nodes"][3]["layout"] = "manual"
    full_relayout(p)
    assert all(n["position"] != {"x": -1, "y": -1} for n in p["nodes"])
    assert all(n["layout"] == "auto" for n in p["nodes"])  # full overrides manual


def test_local_relayout_preserves_upstream_and_manual():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    from layout import topo_order
    order = topo_order(p["nodes"], p["edges"])
    byid = {n["id"]: n for n in p["nodes"]}
    upstream_id = order[0]
    upstream_pos = dict(byid[upstream_id]["position"])
    # mark a downstream node manual; it must keep its position
    manual_id = order[-1]
    byid[manual_id]["layout"] = "manual"
    manual_pos = dict(byid[manual_id]["position"])
    local_relayout(p, from_index=1)
    assert byid[upstream_id]["position"] == upstream_pos   # upstream untouched
    assert byid[manual_id]["position"] == manual_pos       # manual untouched
