import copy

from conftest import load_fixture


def test_run_meta_valid(validate):
    assert validate("run-meta.schema.json", load_fixture("run-meta.json")) == []


def test_conflicts_valid(validate):
    assert validate("conflicts.schema.json", load_fixture("conflicts.json")) == []


def test_run_meta_requires_department(validate):
    m = copy.deepcopy(load_fixture("run-meta.json"))
    del m["department"]
    assert validate("run-meta.schema.json", m) != []
