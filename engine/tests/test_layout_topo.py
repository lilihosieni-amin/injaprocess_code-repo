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


def test_deterministic_tiebreak_uses_input_order():
    nodes = [{"id": "b"}, {"id": "a"}]  # two roots, no edges
    assert topo_order(nodes, []) == ["b", "a"]


def test_cycle_nodes_appended_not_dropped():
    nodes = [{"id": "a"}, {"id": "b"}]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]
    assert sorted(topo_order(nodes, edges)) == ["a", "b"]
