import pytest
from engine_common import data_root as _data_root
from engine_common import is_empty, read_json, schema_dir, validate, write_json_atomic


def test_data_root_reads_env(data_root):
    assert _data_root().is_dir()


def test_data_root_unset_raises(monkeypatch):
    monkeypatch.delenv("DATA_ROOT", raising=False)
    with pytest.raises(SystemExit):
        _data_root()


def test_schema_dir_finds_process_schema():
    assert (schema_dir() / "process.schema.json").is_file()


def test_write_atomic_roundtrip(tmp_path):
    p = tmp_path / "sub" / "x.json"
    write_json_atomic(p, {"a": 1, "fa": "پخت"})
    assert read_json(p) == {"a": 1, "fa": "پخت"}
    assert p.read_text(encoding="utf-8").endswith("\n")


def test_validate_accepts_good_and_rejects_bad():
    from conftest import load_fixture
    validate("process.schema.json", load_fixture("process.cooking-001.json"))
    with pytest.raises(ValueError):
        validate("process.schema.json", {"id": "bad"})


@pytest.mark.parametrize("v,expected", [
    ("", True), ("  ", True), ("x", False), (None, True),
    ([], True), (["a"], False), ({}, True),
    ({"inputs": [], "controls": [], "outputs": [], "mechanisms": []}, True),
    ({"inputs": ["x"]}, False),
])
def test_is_empty(v, expected):
    assert is_empty(v) is expected


def _rec(n, ftype):
    """A delta record whose one column carries a type the store has no such thing as."""
    return {"kind": "record", "key": f"r{n}", "title": "ت", "statement": "ش",
            "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "chat", "ref": None}], "retired": False,
            "data": {"medium": "sheet", "role": "log", "location": {},
                     "fields": [{"key": "x", "type": ftype}]}}


def _ruleless():
    """A rule with no `outputs` — the second commonest Stage V refusal of the
    2026-09-07 run, and a plain `required` failure rather than a oneOf one."""
    return {"kind": "rule", "key": "q", "title": "ت", "statement": "ش",
            "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "chat", "ref": None}], "retired": False,
            "data": {"inputs": []}}


def test_a_oneof_failure_is_reported_by_field_path_and_grouped():
    """§3.4 — three records failing one rule are one line naming the field and
    the three places; the fourth entry's own rule is a second line. No entry is
    dumped into the message, which is what made the first run unreadable."""
    doc = {"schema_version": 2,
           "entries": [_rec(1, "text"), _rec(2, "text"), _rec(3, "text"), _ruleless()]}
    with pytest.raises(ValueError) as excinfo:
        validate("facts-delta.schema.json", doc)
    lines = str(excinfo.value).splitlines()
    assert lines[0] == "facts-delta.schema.json validation failed:"
    assert lines[1:] == [
        "entries[N].data.fields[N].type: 'text' is not one of "
        "['string', 'number', 'integer', 'boolean', 'date'] (3 places: "
        "entries[0].data.fields[0].type, entries[1].data.fields[0].type, "
        "entries[2].data.fields[0].type)",
        "entries[3].data: 'outputs' is a required property"]
    assert "statement" not in str(excinfo.value)   # no entry body anywhere


def test_a_lone_error_keeps_its_concrete_path():
    doc = {"schema_version": 2, "entries": [_rec(1, "text")]}
    with pytest.raises(ValueError) as excinfo:
        validate("facts-delta.schema.json", doc)
    assert str(excinfo.value).splitlines()[1].startswith(
        "entries[0].data.fields[0].type: 'text' is not one of")
    assert "places:" not in str(excinfo.value)


def test_the_line_cap_holds_at_eighty():
    doc = {"schema_version": 2,
           "entries": [_rec(n, f"text{n}") for n in range(100)]}
    with pytest.raises(ValueError) as excinfo:
        validate("facts-delta.schema.json", doc)
    lines = str(excinfo.value).splitlines()[1:]
    assert len(lines) == 81 and lines[-1] == "… and 20 more"


def test_a_non_object_entry_is_still_a_ValueError():
    """A stray string in `entries` matches every branch vacuously, so `oneOf`
    fails on an entry with no `kind` to look a branch up by. The gate must
    report it, not die of an AttributeError halfway through the message."""
    with pytest.raises(ValueError):
        validate("facts-delta.schema.json", {"schema_version": 2, "entries": ["x"]})


def test_a_valid_document_still_raises_nothing():
    assert validate("facts-delta.schema.json",
                    {"schema_version": 2, "entries": [_rec(1, "string")]}) is None
