import copy

from conftest import load_fixture

SCHEMA = "segments.schema.json"


def test_segments_valid(validate):
    assert validate(SCHEMA, load_fixture("segments.json")) == []


def test_status_enum_enforced(validate):
    s = copy.deepcopy(load_fixture("segments.json"))
    s["segments"][0]["status"] = "maybe"
    assert validate(SCHEMA, s) != []


def test_new_segment_supersedes_nothing(validate):
    s = copy.deepcopy(load_fixture("segments.json"))
    # a 'new' segment references no existing process, i.e. supersedes == []
    assert any(seg["status"] == "new" and seg["supersedes"] == []
               for seg in s["segments"])
