import json

from order import reconcile, read_order, set_order

NOW = "2026-07-25T12:00:00Z"


def _proc(root, pid, tombstoned=False):
    dept = pid.rsplit("-", 1)[0]
    d = root / "departments" / dept / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": dept}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def _seed(root, ids):
    for pid in ids:
        _proc(root, pid)
    reconcile("cooking", NOW, root=root)
    set_order("cooking", ids, NOW, root=root)


def test_heir_takes_its_predecessors_position(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    _proc(data_root, "cooking-002", tombstoned=True)
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-004": ["cooking-002"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-003"]


def test_heir_uses_the_lowest_index_not_the_lowest_id(data_root):
    # curated order puts 003 before 001, so 003 is the "earliest" predecessor
    _seed(data_root, ["cooking-003", "cooking-002", "cooking-001"])
    for pid in ("cooking-001", "cooking-003"):
        _proc(data_root, pid, tombstoned=True)
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-004": ["cooking-001", "cooking-003"]})
    assert read_order("cooking", data_root) == ["cooking-004", "cooking-002"]


def test_several_heirs_of_one_predecessor_land_consecutively_in_id_order(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    _proc(data_root, "cooking-002", tombstoned=True)
    _proc(data_root, "cooking-005")
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-005": ["cooking-002"],
                          "cooking-004": ["cooking-002"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-005", "cooking-003"]


def test_heir_hint_for_an_unknown_predecessor_appends(data_root):
    _seed(data_root, ["cooking-001", "cooking-002"])
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-004": ["cooking-099"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-002", "cooking-004"]


def test_heir_hint_never_moves_an_id_already_in_the_order(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    reconcile("cooking", NOW, root=data_root,
              heir_hints={"cooking-003": ["cooking-001"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-002", "cooking-003"]


def test_new_child_lands_after_its_parent(data_root):
    _seed(data_root, ["cooking-001", "cooking-002", "cooking-003"])
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-001": ["cooking-004"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-002", "cooking-003"]


def test_several_children_follow_their_parent_in_id_order(data_root):
    _seed(data_root, ["cooking-001", "cooking-002"])
    _proc(data_root, "cooking-005")
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-001": ["cooking-005", "cooking-004"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-005", "cooking-002"]


def test_child_hint_for_an_absent_parent_appends(data_root):
    _seed(data_root, ["cooking-001"])
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-099": ["cooking-004"]})
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-004"]


def test_hints_do_not_stop_unhinted_ids_from_appending(data_root):
    _seed(data_root, ["cooking-001", "cooking-002"])
    _proc(data_root, "cooking-003")
    _proc(data_root, "cooking-004")
    reconcile("cooking", NOW, root=data_root,
              child_hints={"cooking-001": ["cooking-004"]})
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-002", "cooking-003"]
