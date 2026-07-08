import copy
import pytest
from conftest import load_fixture
from engine_common import validate


def test_process_allows_source_type_auto():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["source"] = {"type": "auto", "ref": "cooking-2026-07-06", "run": "runs/cooking-2026-07-06"}
    p["parent"] = {"process": "cooking-002", "node": "cooking-002-n010"}
    validate("process.schema.json", p)  # must not raise


def test_run_meta_allows_auto_subprocess_of():
    m = load_fixture("run-meta.json")
    m = copy.deepcopy(m)
    m["processes"].append({"id": "cooking-004", "status": "new",
                           "auto_subprocess_of": "cooking-001"})
    validate("run-meta.schema.json", m)  # must not raise


def test_run_meta_rejects_unknown_process_key():
    m = copy.deepcopy(load_fixture("run-meta.json"))
    m["processes"].append({"id": "cooking-004", "status": "new", "bogus": 1})
    with pytest.raises(ValueError):
        validate("run-meta.schema.json", m)
