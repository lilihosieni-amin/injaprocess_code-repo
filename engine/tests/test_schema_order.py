import pytest
from engine_common import validate

GOOD = {
    "department": "dining",
    "order": ["dining-007", "dining-006"],
    "updated_at": "2026-07-25T12:00:00Z",
}


def test_minimal_order_doc_is_valid():
    validate("order.schema.json", GOOD)


def test_empty_order_is_valid():
    validate("order.schema.json", {**GOOD, "order": []})


def test_duplicate_ids_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "order": ["dining-001", "dining-001"]})


def test_malformed_id_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "order": ["dining-1"]})


def test_node_id_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "order": ["dining-001-n010"]})


def test_extra_property_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "note": "x"})


def test_missing_updated_at_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {"department": "dining", "order": []})


def test_non_utc_timestamp_rejected():
    with pytest.raises(ValueError):
        validate("order.schema.json", {**GOOD, "updated_at": "2026-07-25 12:00:00"})
