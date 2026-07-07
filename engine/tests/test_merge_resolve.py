import copy

import pytest
from conftest import load_fixture
from merge import resolve_pending

NOW = "2026-07-11T09:00:00Z"


def _proc_with_pending():
    # the golden fixture has empty pending; build one targeting a real node
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["pending"].append({"node": "cooking-001-n010", "field": "actor",
                         "current": "کارپرداز", "proposed": "انباردار",
                         "source": "runs/cooking-2026-07-10", "status": "open"})
    return p


def test_accept_applies_proposed_and_closes(data_root):
    p = _proc_with_pending()
    row = p["pending"][0]
    node = next(n for n in p["nodes"] if n["id"] == row["node"])
    resolve_pending(p, 0, "accept", NOW)
    assert node[row["field"]] == row["proposed"]
    assert p["pending"][0]["status"] == "accepted"
    assert p["updated_at"] == NOW


def test_reject_closes_without_changing_node(data_root):
    p = _proc_with_pending()
    row = p["pending"][0]
    node = next(n for n in p["nodes"] if n["id"] == row["node"])
    before = node.get(row["field"])
    resolve_pending(p, 0, "reject", NOW)
    assert node.get(row["field"]) == before
    assert p["pending"][0]["status"] == "rejected"


def test_accept_unknown_node_raises(data_root):
    p = _proc_with_pending()
    p["pending"][0]["node"] = "cooking-001-nZZZ"  # not a real node
    with pytest.raises(ValueError):
        resolve_pending(p, 0, "accept", NOW)


def test_re_resolve_closed_row_raises(data_root):
    p = _proc_with_pending()
    resolve_pending(p, 0, "accept", NOW)
    with pytest.raises(ValueError):
        resolve_pending(p, 0, "reject", NOW)
