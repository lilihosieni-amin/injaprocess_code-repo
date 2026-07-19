from collections import defaultdict

from layout import _SIZES, _dag_edges, grid_positions, topo_order


def _act(nid):
    return {"id": nid, "type": "activity"}


def _junc(nid):
    return {"id": nid, "type": "junction"}


def _layers(nodes, edges):
    """Longest-path layer of each node on the cycle-broken DAG (mirrors what
    grid_positions does internally) so tests can assert depth, not raw x —
    which the serpentine wrap legitimately reverses band to band."""
    dedges = _dag_edges(nodes, edges)
    order = topo_order(nodes, dedges)
    preds = defaultdict(list)
    for e in dedges:
        preds[e["to"]].append(e["from"])
    lay = {}
    for nid in order:
        lay[nid] = max((lay[p] + 1 for p in preds[nid]), default=0)
    return lay


def _cy(pos, nid, ntype):
    """Vertical *center* of a node (position is its top-left corner; the small
    junction pill is nudged down so its center lines up with card centers)."""
    return pos[nid]["y"] + _SIZES[ntype][1] / 2


# The dining-022 shape: a linear chain that ends in a review junction with a
# rework loop (n008 -> n007) plus a shortage branch. The back-edge used to make
# topo_order dump every downstream node into raw-id order, collapsing their
# layers to 0/1 so cards piled up and edges ran backwards.
DINING_022_NODES = [_act("n001"), _act("n002"), _act("n003"), _act("n004"),
                    _act("n005"), _act("n006"), _act("n007"), _junc("j1"),
                    _act("n008"), _act("n009"), _junc("j2"), _act("n010"),
                    _junc("j3"), _act("n011")]
DINING_022_EDGES = [
    {"from": "n001", "to": "n002"}, {"from": "n002", "to": "n003"},
    {"from": "n003", "to": "n004"}, {"from": "n004", "to": "n005"},
    {"from": "n005", "to": "n006"}, {"from": "n006", "to": "n007"},
    {"from": "n007", "to": "j1"},
    {"from": "j1", "to": "n008"}, {"from": "j1", "to": "n009"},
    {"from": "n008", "to": "n007"},                 # rework back-edge (the cycle)
    {"from": "n009", "to": "j2"},
    {"from": "j2", "to": "n010"}, {"from": "j2", "to": "j3"},
    {"from": "n010", "to": "j3"}, {"from": "j3", "to": "n011"},
]

# every edge except the rework back-edge should advance the flow forward
_FORWARD_EDGES = [e for e in DINING_022_EDGES
                  if not (e["from"] == "n008" and e["to"] == "n007")]


def test_rework_backedge_removed_for_placement():
    dedges = _dag_edges(DINING_022_NODES, DINING_022_EDGES)
    pairs = {(e["from"], e["to"]) for e in dedges}
    assert ("n008", "n007") not in pairs             # the loop-closer is dropped
    assert len(dedges) == len(DINING_022_EDGES) - 1  # ...and nothing else
    order = {nid: i for i, nid in enumerate(topo_order(DINING_022_NODES, dedges))}
    for f, t in pairs:                               # a genuine topological order
        assert order[f] < order[t]


def test_rework_loop_does_not_collapse_layers():
    # the main chain marches strictly deeper through the junction and out the
    # other side; the back-edge must not drag downstream nodes back to layer 0/1.
    lay = _layers(DINING_022_NODES, DINING_022_EDGES)
    chain = ["n001", "n002", "n003", "n004", "n005", "n006", "n007",
             "j1", "n009", "j2", "j3", "n011"]
    assert all(lay[a] < lay[b] for a, b in zip(chain, chain[1:])), lay
    assert lay["n008"] == lay["n009"]               # junction siblings share a layer


def test_forward_edges_advance_in_depth():
    lay = _layers(DINING_022_NODES, DINING_022_EDGES)
    for e in _FORWARD_EDGES:
        assert lay[e["to"]] > lay[e["from"]], f"{e['from']}->{e['to']} not forward"


def test_no_overlap_with_cycle():
    pos = grid_positions(DINING_022_NODES, DINING_022_EDGES)
    coords = [(round(p["x"], 3), round(p["y"], 3)) for p in pos.values()]
    assert len(set(coords)) == len(coords)


def test_two_way_junction_spreads_symmetrically():
    # a -> j -> (b | c): one child goes up, one down, symmetric about j's lane,
    # separated by more than a card height so they never overlap.
    nodes = [_act("a"), _junc("j"), _act("b"), _act("c")]
    edges = [{"from": "a", "to": "j"},
             {"from": "j", "to": "b"}, {"from": "j", "to": "c"}]
    pos = grid_positions(nodes, edges)
    assert pos["b"]["x"] == pos["c"]["x"]                       # same column
    assert pos["b"]["y"] != pos["c"]["y"]                       # different lanes
    # symmetric around the junction center (mean of the children == junction)
    assert abs((_cy(pos, "b", "activity") + _cy(pos, "c", "activity")) / 2
               - _cy(pos, "j", "junction")) < 1e-6
    assert abs(pos["b"]["y"] - pos["c"]["y"]) >= 90             # clear of overlap


def test_three_way_junction_keeps_middle_and_spreads_outer():
    nodes = [_act("a"), _junc("j"), _act("b"), _act("c"), _act("d")]
    edges = [{"from": "a", "to": "j"}, {"from": "j", "to": "b"},
             {"from": "j", "to": "c"}, {"from": "j", "to": "d"}]
    pos = grid_positions(nodes, edges)
    centers = sorted(_cy(pos, n, "activity") for n in ("b", "c", "d"))
    assert abs(centers[1] - _cy(pos, "j", "junction")) < 1e-6   # middle keeps lane
    assert abs((centers[0] + centers[2]) / 2 - centers[1]) < 1e-6  # outers symmetric
    assert (centers[1] - centers[0]) == (centers[2] - centers[1])  # even spacing


def test_parallel_chains_do_not_swap_lanes():
    # two independent source chains must stay in their own horizontal band
    # (crossing-reduction should not let them braid).
    nodes = [_act("n001"), _act("n002"), _act("n003"),
             _act("n004"), _act("n005"), _act("n006")]
    edges = [{"from": "n001", "to": "n002"}, {"from": "n002", "to": "n003"},
             {"from": "n004", "to": "n005"}, {"from": "n005", "to": "n006"}]
    pos = grid_positions(nodes, edges)
    top = [pos[n]["y"] for n in ("n001", "n002", "n003")]
    bot = [pos[n]["y"] for n in ("n004", "n005", "n006")]
    assert max(top) < min(bot)                                 # bands never cross
