import copy

import pytest
from conftest import load_fixture
from engine_common import validate


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_process_without_tombstone_fields_still_valid():
    validate("process.schema.json", _proc())  # optional fields absent -> OK


def test_process_accepts_tombstoned_and_superseded_by():
    p = _proc()
    p["tombstoned"] = True
    p["superseded_by"] = ["cooking-007", "cooking-008"]
    validate("process.schema.json", p)


def test_superseded_by_rejects_bad_id_shape():
    p = _proc()
    p["superseded_by"] = ["cooking7"]           # not {dept}-NNN
    with pytest.raises(ValueError):
        validate("process.schema.json", p)


def test_process_rejects_unknown_root_field():
    p = _proc()
    p["bogus"] = 1
    with pytest.raises(ValueError):
        validate("process.schema.json", p)      # additionalProperties:false intact


def test_idseq_schema_accepts_ledger():
    validate("idseq.schema.json", {"process": 4})


def test_idseq_schema_rejects_negative_and_extra():
    with pytest.raises(ValueError):
        validate("idseq.schema.json", {"process": -1})
    with pytest.raises(ValueError):
        validate("idseq.schema.json", {"process": 1, "extra": True})
