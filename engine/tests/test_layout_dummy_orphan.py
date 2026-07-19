from layout import GY, SY, _SIZES, grid_positions


def _act(nid):
    return {"id": nid, "type": "activity"}


def _junc(nid):
    return {"id": nid, "type": "junction"}


def _cy(pos, nid, ntype):
    return pos[nid]["y"] + _SIZES[ntype][1] / 2


# --- orphans (dining-027: n009..n012 were in no edge and inflated band 0) -----

def test_orphans_parked_below_and_do_not_widen_flow():
    nodes = [_act("a"), _act("b"), _act("c"), _act("x1"), _act("x2"), _act("x3")]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}]
    pos = grid_positions(nodes, edges)
    # the connected flow is a single clean lane, not widened by the orphans
    assert pos["a"]["y"] == pos["b"]["y"] == pos["c"]["y"]
    # orphans sit below the whole flow, stacked in a column in id order
    for x in ("x1", "x2", "x3"):
        assert pos[x]["y"] > pos["a"]["y"]
    assert pos["x1"]["x"] == pos["x2"]["x"] == pos["x3"]["x"]
    assert pos["x1"]["y"] < pos["x2"]["y"] < pos["x3"]["y"]


def test_orphans_dont_inflate_wrapped_bands():
    # the real dining-027 shape: a chain long enough to wrap into a second band,
    # plus orphans. Orphans must not widen band 0 and shove the wrapped nodes
    # (and the edge feeding them) far down the page.
    chain = [f"n{i:02d}" for i in range(1, 8)]   # 7 deep -> wraps after MAX_COLS
    nodes = [_act(i) for i in chain] + [_act("z1"), _act("z2"), _act("z3")]
    edges = [{"from": a, "to": b} for a, b in zip(chain, chain[1:])]
    pos = grid_positions(nodes, edges)
    # band 0 stays a single lane, so the wrapped node sits just one band down
    assert pos["n06"]["y"] < SY + 2 * GY
    assert min(pos[z]["y"] for z in ("z1", "z2", "z3")) > pos["n06"]["y"]


def test_orphan_does_not_push_first_node_down():
    # the dining-027 symptom: an orphan must not stretch the edge into the flow.
    # With one orphan the connected chain still starts at the top origin lane.
    nodes = [_act("a"), _act("b"), _act("orphan")]
    edges = [{"from": "a", "to": "b"}]
    pos = grid_positions(nodes, edges)
    assert pos["a"]["y"] == SY                       # flow starts at the top, not shoved down
    assert pos["orphan"]["y"] >= pos["b"]["y"] + GY  # parked well clear of the flow


# --- dummy-node routing (dining-027: n003 sat on the j1 -> j2 bypass edge) ----

def test_skip_branch_node_not_on_bypass_edge():
    # a -> j1 -> (n3 -> j2 | j2) -> z : the direct j1->j2 edge spans two layers,
    # so n3 (layer between them) must be pushed off that straight bypass line.
    nodes = [_act("a"), _junc("j1"), _act("n3"), _junc("j2"), _act("z")]
    edges = [{"from": "a", "to": "j1"}, {"from": "j1", "to": "n3"},
             {"from": "n3", "to": "j2"}, {"from": "j1", "to": "j2"},
             {"from": "j2", "to": "z"}]
    pos = grid_positions(nodes, edges)
    j1c = _cy(pos, "j1", "junction")
    j2c = _cy(pos, "j2", "junction")
    n3c = _cy(pos, "n3", "activity")
    assert abs(j1c - j2c) < 40          # the bypass edge runs roughly straight...
    assert abs(n3c - j1c) >= 80         # ...and n3 bulges clearly off it


def test_dummy_nodes_are_not_emitted_as_real_positions():
    nodes = [_act("a"), _junc("j1"), _act("n3"), _junc("j2")]
    edges = [{"from": "a", "to": "j1"}, {"from": "j1", "to": "n3"},
             {"from": "n3", "to": "j2"}, {"from": "j1", "to": "j2"}]
    pos = grid_positions(nodes, edges)
    assert set(pos) == {"a", "j1", "n3", "j2"}   # only real nodes get positions
