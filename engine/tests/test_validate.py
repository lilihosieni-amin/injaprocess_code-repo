import copy
import json

import pytest
from conftest import load_fixture
from validate.cli import main


def _write(tmp_path, obj, name="f.json"):
    p = tmp_path / name
    p.write_text(json.dumps(obj), encoding="utf-8")
    return str(p)


def test_valid_segments_passes(tmp_path):
    f = _write(tmp_path, load_fixture("segments.json"))
    assert main(["segments", f]) == 0


def test_invalid_segments_exits_2(tmp_path):
    bad = copy.deepcopy(load_fixture("segments.json"))
    bad["segments"][0]["status"] = "bogus"  # not in the status enum
    f = _write(tmp_path, bad)
    with pytest.raises(SystemExit) as e:
        main(["segments", f])
    assert e.value.code == 2


def test_short_and_full_name_equivalent(tmp_path):
    f = _write(tmp_path, load_fixture("segments.json"))
    assert main(["segments", f]) == 0
    assert main(["segments.schema.json", f]) == 0


def test_unknown_schema_exits_2(tmp_path):
    f = _write(tmp_path, {"anything": 1})
    with pytest.raises(SystemExit) as e:
        main(["definitely-not-a-schema", f])
    assert e.value.code == 2


def test_missing_file_exits_2():
    with pytest.raises(SystemExit) as e:
        main(["segments", "/no/such/file.json"])
    assert e.value.code == 2
