import copy

from conftest import load_fixture

SCHEMA = "segments.schema.json"


def test_segments_valid(validate):
    assert validate(SCHEMA, load_fixture("segments.json")) == []


def test_status_enum_enforced(validate):
    s = copy.deepcopy(load_fixture("segments.json"))
    s["segments"][0]["status"] = "maybe"
    assert validate(SCHEMA, s) != []


def test_update_match_id_may_be_null_for_new(validate):
    s = copy.deepcopy(load_fixture("segments.json"))
    # a 'new' segment carries match.existing_id = null
    assert any(seg["status"] == "new" and seg["match"]["existing_id"] is None
               for seg in s["segments"])
