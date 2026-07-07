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
