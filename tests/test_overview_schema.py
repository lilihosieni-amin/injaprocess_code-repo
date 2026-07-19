import copy

from conftest import load_fixture

SCHEMA = "overview.schema.json"


def test_overview_is_valid(validate):
    assert validate(SCHEMA, load_fixture("overview.cooking.json")) == []


def test_person_requires_role(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    del o["personnel"][0]["role"]
    assert validate(SCHEMA, o) != []


def test_overview_requires_description(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    del o["description"]
    assert validate(SCHEMA, o) != []


def test_overview_allows_empty_description(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    o["description"] = ""
    assert validate(SCHEMA, o) == []


def test_person_requires_kpi(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    del o["personnel"][0]["kpi"]
    assert validate(SCHEMA, o) != []


def test_kpi_allows_empty(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    o["personnel"][0]["kpi"] = []
    assert validate(SCHEMA, o) == []


def test_kpi_must_be_string_array(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    o["personnel"][0]["kpi"] = [123]
    assert validate(SCHEMA, o) != []
