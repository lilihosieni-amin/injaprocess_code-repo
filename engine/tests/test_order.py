import json

import pytest
from order import (OrderMismatch, active_ids, check, departments, move,
                   read_order, reconcile, set_order)

NOW = "2026-07-25T12:00:00Z"


def _proc(root, pid, tombstoned=False):
    dept = pid.rsplit("-", 1)[0]
    d = root / "departments" / dept / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": dept}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def _order_file(root, dept):
    return root / "departments" / dept / "order.json"


def _stored(root, dept):
    return json.loads(_order_file(root, dept).read_text(encoding="utf-8"))


def test_read_order_of_missing_file_is_empty(data_root):
    assert read_order("cooking", data_root) == []


def test_active_ids_skips_tombstones_and_sorts(data_root):
    _proc(data_root, "cooking-003")
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002", tombstoned=True)
    assert active_ids("cooking", data_root) == ["cooking-001", "cooking-003"]


def test_reconcile_creates_the_file_lazily(data_root):
    _proc(data_root, "cooking-001")
    assert not _order_file(data_root, "cooking").is_file()
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == ["cooking-001"] and dropped == []
    doc = _stored(data_root, "cooking")
    assert doc == {"department": "cooking", "order": ["cooking-001"],
                   "updated_at": NOW}


def test_reconcile_appends_new_in_id_order_keeping_curation(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    set_order("cooking", ["cooking-002", "cooking-001"], NOW, root=data_root)
    _proc(data_root, "cooking-004")
    _proc(data_root, "cooking-003")
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == ["cooking-003", "cooking-004"] and dropped == []
    assert read_order("cooking", data_root) == [
        "cooking-002", "cooking-001", "cooking-003", "cooking-004"]


def test_reconcile_drops_tombstoned(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    _proc(data_root, "cooking-001", tombstoned=True)
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == [] and dropped == ["cooking-001"]
    assert read_order("cooking", data_root) == ["cooking-002"]


def test_reconcile_drops_deleted_file(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    (data_root / "departments" / "cooking" / "processes" / "cooking-001.json").unlink()
    _appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert dropped == ["cooking-001"]
    assert read_order("cooking", data_root) == ["cooking-002"]


def test_reconcile_is_idempotent(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    first = read_order("cooking", data_root)
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == [] and dropped == []
    assert read_order("cooking", data_root) == first


def test_reconcile_heals_a_duplicated_hand_edit(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking",
         "order": ["cooking-002", "cooking-002", "cooking-001"],
         "updated_at": NOW}), encoding="utf-8")
    reconcile("cooking", NOW, root=data_root)
    assert read_order("cooking", data_root) == ["cooking-002", "cooking-001"]


def test_set_order_replaces_the_sequence(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    assert set_order("cooking", ["cooking-002", "cooking-001"], NOW,
                     root=data_root) == ["cooking-002", "cooking-001"]
    assert read_order("cooking", data_root) == ["cooking-002", "cooking-001"]


def test_set_order_refuses_a_missing_id(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    with pytest.raises(OrderMismatch) as e:
        set_order("cooking", ["cooking-001"], NOW, root=data_root)
    assert str(e.value).startswith("set mismatch:")
    assert "missing=cooking-002" in str(e.value)


def test_set_order_refuses_a_stale_id(data_root):
    _proc(data_root, "cooking-001")
    with pytest.raises(OrderMismatch) as e:
        set_order("cooking", ["cooking-001", "cooking-009"], NOW, root=data_root)
    assert "stale=cooking-009" in str(e.value)


def test_set_order_refuses_a_tombstoned_id(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002", tombstoned=True)
    with pytest.raises(OrderMismatch):
        set_order("cooking", ["cooking-001", "cooking-002"], NOW, root=data_root)


def test_set_order_refuses_duplicates(data_root):
    _proc(data_root, "cooking-001")
    with pytest.raises(OrderMismatch):
        set_order("cooking", ["cooking-001", "cooking-001"], NOW, root=data_root)


def test_move_shifts_the_rest(data_root):
    for n in (1, 2, 3):
        _proc(data_root, f"cooking-00{n}")
    reconcile("cooking", NOW, root=data_root)
    assert move("cooking", "cooking-003", 1, NOW, root=data_root) == [
        "cooking-003", "cooking-001", "cooking-002"]


def test_move_rejects_an_absent_id(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    with pytest.raises(ValueError):
        move("cooking", "cooking-009", 1, NOW, root=data_root)


def test_move_rejects_an_out_of_range_position(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    with pytest.raises(ValueError):
        move("cooking", "cooking-001", 2, NOW, root=data_root)


def test_check_reports_missing_and_stale(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    _proc(data_root, "cooking-002")
    _proc(data_root, "cooking-001", tombstoned=True)
    missing, stale = check("cooking", data_root)
    assert missing == ["cooking-002"] and stale == ["cooking-001"]


def test_check_is_clean_after_reconcile(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    assert check("cooking", data_root) == ([], [])


def test_departments_come_from_the_registry(data_root):
    (data_root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "پخت"},
                         {"code": "dining", "name": "سالن"}]}), encoding="utf-8")
    assert departments(data_root) == ["cooking", "dining"]
