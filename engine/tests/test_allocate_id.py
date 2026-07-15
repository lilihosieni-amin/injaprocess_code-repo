import json

from allocate_id import next_box_id, next_junction_id, next_process_id, peek_process_id
from conftest import load_fixture


def _write_proc(root, pid):
    p = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    p.write_text(json.dumps({"id": pid}), encoding="utf-8")


def test_first_process_id_is_001(data_root):
    assert next_process_id("cooking", data_root) == "cooking-001"


def test_process_id_is_max_plus_one(data_root):
    _write_proc(data_root, "cooking-001")
    _write_proc(data_root, "cooking-003")
    assert next_process_id("cooking", data_root) == "cooking-004"


def test_box_and_junction_ids_from_nodes():
    p = load_fixture("process.cooking-001.json")  # has n010, n060, j1
    assert next_box_id(p) == "cooking-001-n061"
    assert next_junction_id(p) == "cooking-001-j2"


def test_removed_nodes_still_hold_their_id():
    p = {"id": "cooking-001", "nodes": [
        {"id": "cooking-001-n010", "type": "activity", "removed": True}]}
    # a flagged-removed node keeps its number reserved (never reused)
    assert next_box_id(p) == "cooking-001-n011"


def test_reserved_ids_bump_the_counter(data_root):
    # nothing on disk; reserving cooking-001 forces the next to be 002
    assert peek_process_id("cooking", data_root, reserved={"cooking-001"}) == "cooking-002"
    assert (
        peek_process_id("cooking", data_root, reserved={"cooking-001", "cooking-002"})
        == "cooking-003"
    )
    # other dept ignored
    assert peek_process_id("cooking", data_root, reserved={"dining-009"}) == "cooking-001"
