from layout import topo_order


def test_linear_order():
    nodes = [{"id": "start"}, {"id": "a"}, {"id": "b"}, {"id": "end"}]
    edges = [{"from": "start", "to": "a"}, {"from": "a", "to": "b"},
             {"from": "b", "to": "end"}]
    assert topo_order(nodes, edges) == ["start", "a", "b", "end"]


def test_branch_keeps_predecessors_before_successors():
    nodes = [{"id": "s"}, {"id": "j"}, {"id": "x"}, {"id": "y"}, {"id": "e"}]
    edges = [{"from": "s", "to": "j"}, {"from": "j", "to": "x"},
             {"from": "j", "to": "y"}, {"from": "x", "to": "e"},
             {"from": "y", "to": "e"}]
    order = topo_order(nodes, edges)
    assert order.index("j") < order.index("x") < order.index("e")
    assert order.index("j") < order.index("y") < order.index("e")


def test_deterministic_tiebreak_uses_id_order():
    nodes = [{"id": "b"}, {"id": "a"}]  # two roots, scrambled array order
    assert topo_order(nodes, []) == ["a", "b"]


def test_tiebreak_is_numeric_not_lexicographic():
    nodes = [{"id": "n010"}, {"id": "n002"}]  # lexicographic would keep n010 first
    assert topo_order(nodes, []) == ["n002", "n010"]


def test_edges_beat_id_order():
    # a late-allocated id spliced mid-flow: edges decide the order, not the id.
    # n008 must NOT be pushed after n003 just because 8 > 3.
    nodes = [{"id": "n002"}, {"id": "n003"}, {"id": "n008"}]
    edges = [{"from": "n002", "to": "n008"}, {"from": "n008", "to": "n003"}]
    assert topo_order(nodes, edges) == ["n002", "n008", "n003"]


def test_cycle_nodes_appended_not_dropped():
    nodes = [{"id": "a"}, {"id": "b"}]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]
    assert sorted(topo_order(nodes, edges)) == ["a", "b"]
