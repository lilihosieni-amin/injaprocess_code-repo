import copy

from conftest import load_fixture
from layout import GX, MAX_COLS, SX, SY, full_relayout, grid_positions, local_relayout, topo_order


def _act(nid):
    return {"id": nid, "type": "activity"}


def _junc(nid):
    return {"id": nid, "type": "junction"}


def _chain_edges(ids):
    return [{"from": a, "to": b} for a, b in zip(ids, ids[1:])]


def test_linear_chain_is_one_left_to_right_lane():
    ids = ["a", "b", "c", "d", "e"]               # exactly one full band (MAX_COLS)
    pos = grid_positions([_act(i) for i in ids], _chain_edges(ids))
    assert all(pos[i]["y"] == pos["a"]["y"] for i in ids)          # single lane
    xs = [pos[i]["x"] for i in ids]
    assert xs == sorted(xs) and len(set(xs)) == len(xs)            # strictly rightward
    assert xs[1] - xs[0] == GX                                     # column pitch


def test_long_chain_wraps_into_serpentine_bands():
    # 12 sequential steps -> bands of 5 / 5 / 2; the page never gets wider
    # than MAX_COLS columns (FR-D9), and odd bands run right-to-left.
    ids = [f"n{k:02d}" for k in range(1, 13)]
    pos = grid_positions([_act(i) for i in ids], _chain_edges(ids))
    xs = {i: pos[i]["x"] for i in ids}
    ys = {i: pos[i]["y"] for i in ids}
    # band 1 (n01..n05): one lane, left -> right
    assert len({ys[i] for i in ids[:5]}) == 1
    assert [xs[i] for i in ids[:5]] == sorted(xs[i] for i in ids[:5])
    # band 2 (n06..n10): strictly below band 1 and REVERSED (right -> left)
    assert all(ys[i] > ys["n01"] for i in ids[5:10])
    assert [xs[i] for i in ids[5:10]] == sorted((xs[i] for i in ids[5:10]), reverse=True)
    assert xs["n06"] == xs["n05"]        # wrap starts directly under the last column
    # band 3 (n11, n12): below band 2, forward again
    assert ys["n11"] > ys["n06"]
    assert xs["n11"] < xs["n12"]
    assert xs["n11"] == xs["n10"]        # under band 2's final column
    # page-width cap: never wider than MAX_COLS columns
    assert max(xs.values()) <= SX + (MAX_COLS - 1) * GX


def test_branch_fans_out_vertically_after_junction():
    # a -> j -> (b | c), b -> d
    nodes = [_act("a"), _junc("j"), _act("b"), _act("c"), _act("d")]
    edges = _chain_edges(["a", "j"]) + [
        {"from": "j", "to": "b"}, {"from": "j", "to": "c"}, {"from": "b", "to": "d"},
    ]
    pos = grid_positions(nodes, edges)
    assert pos["b"]["x"] == pos["c"]["x"]          # siblings share a column
    assert pos["b"]["y"] != pos["c"]["y"]          # ...on different lanes
    # the two branches spread symmetrically around the junction lane (one up,
    # one down) instead of one branch keeping the main lane. Compare centers:
    # the junction pill is nudged down so its center aligns with card centers.
    jc = pos["j"]["y"] + 44 / 2
    bc, cc = pos["b"]["y"] + 76 / 2, pos["c"]["y"] + 76 / 2
    assert abs((bc + cc) / 2 - jc) < 1e-6
    assert pos["d"]["y"] == pos["b"]["y"]          # chain continues on its lane
    assert pos["d"]["x"] > pos["b"]["x"]           # and keeps moving right


def test_feeder_source_sits_left_of_its_target_on_same_lane():
    # later-recorded feeder n007 -> n001 (the dining-006 shape)
    nodes = [_act("n001"), _act("n002"), _act("n007")]
    edges = [{"from": "n007", "to": "n001"}, {"from": "n001", "to": "n002"}]
    pos = grid_positions(nodes, edges)
    assert pos["n007"]["x"] < pos["n001"]["x"] < pos["n002"]["x"]
    assert pos["n007"]["y"] == pos["n001"]["y"] == pos["n002"]["y"]


def test_late_inserted_node_sits_between_its_edge_neighbors():
    # a node added later gets a high id (n008) but its edges splice it
    # mid-flow: n002 -> n008 -> n003. Edges drive placement; the id must
    # not banish it to the end of the chart.
    nodes = [_act("n001"), _act("n002"), _act("n003"), _act("n008")]
    edges = [{"from": "n001", "to": "n002"}, {"from": "n002", "to": "n008"},
             {"from": "n008", "to": "n003"}]
    pos = grid_positions(nodes, edges)
    assert pos["n002"]["x"] < pos["n008"]["x"] < pos["n003"]["x"]   # between, in x
    assert pos["n008"]["y"] == pos["n002"]["y"] == pos["n003"]["y"]  # same lane


def test_multiple_sources_take_lanes_in_id_order():
    nodes = [_act("n006"), _act("n001"), _act("n003")]   # scrambled array order
    pos = grid_positions(nodes, [])
    assert pos["n001"]["y"] < pos["n003"]["y"] < pos["n006"]["y"]
    assert pos["n001"]["x"] == pos["n003"]["x"] == pos["n006"]["x"]


def test_no_two_nodes_share_a_position():
    # the dining-012 shape that produced overlapping cards: a chain plus
    # two disconnected feeders converging on n001
    nodes = [_act(f"n00{k}") for k in range(1, 8)]
    edges = [{"from": "n002", "to": "n003"}, {"from": "n003", "to": "n004"},
             {"from": "n004", "to": "n005"}, {"from": "n006", "to": "n001"},
             {"from": "n007", "to": "n001"}]
    pos = grid_positions(nodes, edges)
    coords = [(p["x"], p["y"]) for p in pos.values()]
    assert len(set(coords)) == len(coords)


def test_junction_is_centered_within_its_column():
    # junctions are much smaller than activity cards; they get a centering nudge
    nodes = [_act("a"), _junc("j"), _act("b")]
    pos = grid_positions(nodes, _chain_edges(["a", "j", "b"]))
    assert SX + GX < pos["j"]["x"] < SX + 2 * GX    # nudged right, inside its column
    assert pos["j"]["y"] > pos["a"]["y"]            # nudged down toward card middle
    assert pos["j"]["y"] < pos["a"]["y"] + SY       # ...but nowhere near the next lane


def test_grid_positions_is_deterministic():
    nodes = [_act("a"), _junc("j"), _act("b"), _act("c")]
    edges = [{"from": "a", "to": "j"}, {"from": "j", "to": "b"}, {"from": "j", "to": "c"}]
    assert grid_positions(nodes, edges) == grid_positions(copy.deepcopy(nodes), copy.deepcopy(edges))


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
