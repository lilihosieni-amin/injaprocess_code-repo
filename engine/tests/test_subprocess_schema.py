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


def _sub_entry():
    child = copy.deepcopy(load_fixture("candidate.json"))  # a valid candidate body
    return {"parent_key": "n1", "process": child}


def test_candidate_accepts_subprocesses():
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["subprocesses"] = [_sub_entry()]
    validate("candidate.schema.json", c)


def test_candidate_rejects_nested_subprocesses():
    c = copy.deepcopy(load_fixture("candidate.json"))
    entry = _sub_entry()
    entry["process"]["subprocesses"] = [_sub_entry()]  # second level — forbidden
    c["subprocesses"] = [entry]
    with pytest.raises(ValueError):
        validate("candidate.schema.json", c)


def test_candidate_without_subprocesses_still_valid():
    validate("candidate.schema.json", load_fixture("candidate.json"))


def test_delta_accepts_add_subprocesses():
    d = copy.deepcopy(load_fixture("delta.json"))
    d["add_subprocesses"] = [
        {"parent": "cooking-001-n020", "process": load_fixture("candidate.json")},
    ]
    validate("delta.schema.json", d)


def test_delta_rejects_nested_subprocesses_in_add():
    d = copy.deepcopy(load_fixture("delta.json"))
    child = copy.deepcopy(load_fixture("candidate.json"))
    child["subprocesses"] = [_sub_entry()]
    d["add_subprocesses"] = [{"parent": "cooking-001-n020", "process": child}]
    with pytest.raises(ValueError):
        validate("delta.schema.json", d)
