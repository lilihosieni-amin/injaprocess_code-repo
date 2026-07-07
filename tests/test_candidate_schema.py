import copy

from conftest import load_fixture

SCHEMA = "candidate.schema.json"


def test_candidate_is_valid(validate):
    assert validate(SCHEMA, load_fixture("candidate.json")) == []


def test_final_id_shape_still_allowed_as_temp_key(validate):
    # temp keys are free-form strings; the point is merge assigns real ids later
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["nodes"][0]["key"] = "n99"
    assert validate(SCHEMA, c) == []


def test_missing_process_name_rejected(validate):
    c = copy.deepcopy(load_fixture("candidate.json"))
    del c["process_name"]
    assert validate(SCHEMA, c) != []
