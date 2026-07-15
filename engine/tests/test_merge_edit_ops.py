import copy

import pytest
from conftest import load_fixture
from engine_common import validate

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _empty_delta(**over):
    d = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": []}
    d.update(over)
    return d


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_delta_accepts_remove_edges_and_revise_nodes():
    validate("delta.schema.json", _empty_delta(
        remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}],
        revise_nodes=[{"id": "cooking-001-n010", "set": {"label": "x"}}],
    ))


def test_delta_still_valid_without_new_fields():
    validate("delta.schema.json", _empty_delta())


def test_remove_edges_rejects_extra_key():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(
            remove_edges=[{"from": "a", "to": "b", "oops": 1}]))


def test_revise_nodes_requires_id_and_set():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(revise_nodes=[{"id": "x"}]))
