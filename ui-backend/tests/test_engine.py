import pytest
from inja_ui_backend import engine, ids


def _cfg(data_root):
    from inja_ui_backend.tests_helpers import cfg_for  # created below
    return cfg_for(data_root)


def test_id_pattern_helpers():
    assert ids.is_real_activity_id("cooking-001-n010")
    assert not ids.is_real_activity_id("tmp-1")
    assert ids.is_real_junction_id("cooking-001-j2")
    assert not ids.is_real_junction_id("cooking-001-n010")
    assert ids.is_terminal_id("start") and ids.is_terminal_id("end")


def test_allocate_process_id(data_root):
    cfg = _cfg(data_root)
    assert engine.allocate_process_id(cfg, "warehouse") == "warehouse-001"
    assert engine.allocate_process_id(cfg, "cooking") == "cooking-002"


def test_allocate_box_id_feed_forward(data_root):
    cfg = _cfg(data_root)
    from inja_ui_backend import storage
    doc = storage.read_json(storage.proc_path(data_root, "cooking-001"))
    first = engine.allocate_box_id(cfg, doc)
    doc["nodes"].append({"id": first, "type": "activity", "label": "x",
                         "description": "", "actor": "", "subprocess": None,
                         "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
                         "position": {"x": 0, "y": 0}, "layout": "manual",
                         "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    second = engine.allocate_box_id(cfg, doc)
    assert first != second


def test_validate_rejects_broken_doc(data_root):
    cfg = _cfg(data_root)
    with pytest.raises(engine.EngineError):
        engine.validate_doc(cfg, "process.schema.json", {"id": "bad"})


def test_resolve_pending_accept_applies_proposed(data_root):
    cfg = _cfg(data_root)
    from inja_ui_backend import storage
    p = storage.proc_path(data_root, "cooking-001")
    doc = storage.read_json(p)
    if not doc["pending"]:
        pytest.skip("fixture has no pending row")
    row = doc["pending"][0]
    engine.resolve_pending(cfg, "cooking-001", 0, "accept")
    after = storage.read_json(p)
    node = next(n for n in after["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == row["proposed"]
    assert after["pending"][0]["status"] == "accepted"
