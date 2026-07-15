import json

from allocate_id import next_process_id, peek_process_id


def _ledger_path(root, dept):
    return root / "departments" / dept / ".id-seq.json"


def _write_proc(root, pid):
    p = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    p.write_text(json.dumps({"id": pid}), encoding="utf-8")


def test_ledger_bootstraps_from_file_scan(data_root):
    _write_proc(data_root, "cooking-001")
    _write_proc(data_root, "cooking-003")
    assert next_process_id("cooking", data_root) == "cooking-004"
    ledger = json.loads(_ledger_path(data_root, "cooking").read_text())
    assert ledger == {"process": 4}


def test_ledger_persists_and_only_increases(data_root):
    assert next_process_id("cooking", data_root) == "cooking-001"
    assert json.loads(_ledger_path(data_root, "cooking").read_text()) == {"process": 1}
    # a second alloc with the first file removed still advances (never reused)
    assert next_process_id("cooking", data_root) == "cooking-002"
    assert json.loads(_ledger_path(data_root, "cooking").read_text()) == {"process": 2}


def test_id_not_reused_after_delete(data_root):
    _write_proc(data_root, "cooking-001")
    assert next_process_id("cooking", data_root) == "cooking-002"          # ledger now 2
    (data_root / "departments/cooking/processes/cooking-001.json").unlink()  # permanent delete
    # scan would say 1, but the ledger holds the high-water mark
    assert next_process_id("cooking", data_root) == "cooking-003"


def test_ledger_ahead_of_scan_wins(data_root):
    _ledger_path(data_root, "cooking").write_text(json.dumps({"process": 9}))
    assert next_process_id("cooking", data_root) == "cooking-010"


def test_reserved_still_bumps_in_batch(data_root):
    assert next_process_id("cooking", data_root, reserved={"cooking-001"}) == "cooking-002"
    assert (
        next_process_id("cooking", data_root, reserved={"cooking-001", "cooking-002"})
        == "cooking-003"
    )
    # other dept ignored in reserved
    assert next_process_id("cooking", data_root, reserved={"dining-009"}) == "cooking-004"


def test_peek_is_stateless_and_repeatable(data_root):
    _write_proc(data_root, "cooking-001")
    assert peek_process_id("cooking", data_root) == "cooking-002"
    assert peek_process_id("cooking", data_root) == "cooking-002"      # no advance
    assert not _ledger_path(data_root, "cooking").is_file()            # no ledger written
    # peek honours reserved without persisting
    assert peek_process_id("cooking", data_root, reserved={"cooking-002"}) == "cooking-003"
