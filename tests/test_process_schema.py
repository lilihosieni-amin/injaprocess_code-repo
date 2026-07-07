import copy

from conftest import load_fixture

SCHEMA = "process.schema.json"


def test_golden_process_is_valid(validate):
    assert validate(SCHEMA, load_fixture("process.cooking-001.json")) == []


def test_bad_process_id_rejected(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = "Cooking_1"  # violates ^[a-z]+-[0-9]{3}$
    assert validate(SCHEMA, p) != []


def test_junction_requires_junction_type(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:
        if n["type"] == "junction":
            del n["junctionType"]
    assert validate(SCHEMA, p) != []


def test_activity_extra_field_rejected(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:
        if n["type"] == "activity":
            n["surprise"] = True
            break
    assert validate(SCHEMA, p) != []


def test_pending_original_value_untouched_shape(validate):
    # pending rows carry current + proposed + status (FR-M3)
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["pending"][0]["status"] = "banana"  # not in enum
    assert validate(SCHEMA, p) != []
