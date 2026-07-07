import copy

from conftest import load_fixture

SCHEMA = "delta.schema.json"


def test_delta_is_valid(validate):
    assert validate(SCHEMA, load_fixture("delta.json")) == []


def test_enrich_requires_id_and_set(validate):
    d = copy.deepcopy(load_fixture("delta.json"))
    d["enrich_nodes"].append({"set": {"actor": "x"}})  # missing id
    assert validate(SCHEMA, d) != []


def test_empty_delta_is_valid(validate):
    empty = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": []}
    assert validate(SCHEMA, empty) == []
