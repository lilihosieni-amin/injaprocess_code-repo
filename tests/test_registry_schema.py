from conftest import load_fixture

SCHEMA = "registry.schema.json"


def test_real_registry_is_valid(validate):
    assert validate(SCHEMA, load_fixture("registry.json")) == []


def test_department_requires_code_and_name(validate):
    bad = {"departments": [{"code": "cooking"}]}  # missing name
    assert validate(SCHEMA, bad) != []


def test_rejects_unknown_top_level_key(validate):
    bad = {"departments": [], "extra": 1}
    assert validate(SCHEMA, bad) != []
