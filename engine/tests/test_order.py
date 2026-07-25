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


def test_read_order_without_the_order_key_is_empty(data_root):
    _order_file(data_root, "cooking").write_text(
        json.dumps({"department": "cooking", "updated_at": NOW}), encoding="utf-8")
    assert read_order("cooking", data_root) == []


def test_read_order_rejects_a_non_list_order(data_root):
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking", "order": 5, "updated_at": NOW}), encoding="utf-8")
    with pytest.raises(ValueError):
        read_order("cooking", data_root)


def test_read_order_rejects_a_string_order(data_root):
    # A bare string must not be silently exploded into single characters.
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking", "order": "cooking-001", "updated_at": NOW}),
        encoding="utf-8")
    with pytest.raises(ValueError):
        read_order("cooking", data_root)


def test_active_ids_skips_tombstones_and_sorts(data_root):
    _proc(data_root, "cooking-003")
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002", tombstoned=True)
    assert active_ids("cooking", data_root) == ["cooking-001", "cooking-003"]


def test_active_ids_ignores_a_foreign_department_file(data_root):
    _proc(data_root, "cooking-001")
    (data_root / "departments" / "cooking" / "processes" / "dining-007.json").write_text(
        json.dumps({"id": "dining-007", "department": "dining"}), encoding="utf-8")
    assert active_ids("cooking", data_root) == ["cooking-001"]


def test_reconcile_creates_the_file_lazily(data_root):
    _proc(data_root, "cooking-001")
    assert not _order_file(data_root, "cooking").is_file()
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == ["cooking-001"] and dropped == []
    doc = _stored(data_root, "cooking")
    assert doc == {"department": "cooking", "order": ["cooking-001"],
                   "updated_at": NOW}


def test_reconcile_writes_nothing_for_a_processless_department(data_root):
    # The processes/ dir exists but is empty: no file, per ARD §4.6 lazy creation.
    assert (data_root / "departments" / "cooking" / "processes").is_dir()
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert not _order_file(data_root, "cooking").is_file()


def test_reconcile_creates_no_directory_for_a_processless_department(data_root):
    assert reconcile("logistics", NOW, root=data_root) == ([], [])
    assert not (data_root / "departments" / "logistics").exists()
    assert not _order_file(data_root, "logistics").is_file()


def test_reconcile_empties_an_existing_file_when_all_are_tombstoned(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    _proc(data_root, "cooking-001", tombstoned=True)
    _proc(data_root, "cooking-002", tombstoned=True)
    # The lazy guard must not swallow this: the file exists, so it gets emptied
    # rather than left stale, otherwise `check` would report permanent drift.
    appended, dropped = reconcile("cooking", NOW, root=data_root)
    assert appended == [] and dropped == ["cooking-001", "cooking-002"]
    assert _stored(data_root, "cooking")["order"] == []
    assert check("cooking", data_root) == ([], [])


def test_reconcile_does_not_rewrite_when_nothing_changed(data_root):
    _proc(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    reconcile("cooking", "2026-07-26T09:30:00Z", root=data_root)
    assert _stored(data_root, "cooking")["updated_at"] == NOW


def test_reconcile_validates_before_writing(data_root):
    _proc(data_root, "cooking-001")
    with pytest.raises(ValueError):
        reconcile("cooking", "25/07/2026", root=data_root)
    assert not _order_file(data_root, "cooking").is_file()


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
    _proc(data_root, "cooking-002")
    reconcile("cooking", NOW, root=data_root)
    curated = ["cooking-002", "cooking-001"]
    set_order("cooking", curated, NOW, root=data_root)
    # A curated, non-id order must survive reconcile untouched, twice over.
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert read_order("cooking", data_root) == curated
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert read_order("cooking", data_root) == curated


def test_reconcile_heals_a_duplicated_hand_edit(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    # The first occurrence wins, so the duplicate collapses forward, not back.
    _order_file(data_root, "cooking").write_text(json.dumps(
        {"department": "cooking",
         "order": ["cooking-001", "cooking-002", "cooking-001"],
         "updated_at": NOW}), encoding="utf-8")
    assert reconcile("cooking", NOW, root=data_root) == ([], [])
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-002"]


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
    # Deliberately not alphabetical: registry order is the contract, not sorting.
    (data_root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "dining", "name": "سالن"},
                         {"code": "cooking", "name": "پخت"}]}), encoding="utf-8")
    assert departments(data_root) == ["dining", "cooking"]


def test_departments_rejects_a_malformed_registry(data_root):
    (data_root / "departments" / "registry.json").write_text(
        json.dumps({"departments": [{"name": "x"}]}), encoding="utf-8")
    with pytest.raises(ValueError):
        departments(data_root)
