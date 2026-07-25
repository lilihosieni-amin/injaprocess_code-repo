import json

import pytest
from order.cli import main

NOW = "2026-07-25T12:00:00Z"


def _proc(root, pid, tombstoned=False):
    dept = pid.rsplit("-", 1)[0]
    d = root / "departments" / dept / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": dept}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def _registry(root, codes):
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": c, "name": c} for c in codes]}), encoding="utf-8")


def _order(root, dept):
    p = root / "departments" / dept / "order.json"
    return json.loads(p.read_text(encoding="utf-8"))["order"] if p.is_file() else None


def test_sync_prints_appended_and_dropped(data_root, capsys):
    _proc(data_root, "cooking-001")
    assert main(["sync", "cooking", "--now", NOW]) == 0
    assert capsys.readouterr().out == "+cooking-001\n"
    _proc(data_root, "cooking-001", tombstoned=True)
    _proc(data_root, "cooking-002")
    assert main(["sync", "cooking", "--now", NOW]) == 0
    assert capsys.readouterr().out == "+cooking-002\n-cooking-001\n"


def test_show_prints_one_id_per_line(data_root, capsys):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    main(["sync", "cooking", "--now", NOW])
    capsys.readouterr()
    assert main(["show", "cooking"]) == 0
    assert capsys.readouterr().out == "cooking-001\ncooking-002\n"


def test_show_on_a_missing_file_prints_nothing(data_root, capsys):
    assert main(["show", "cooking"]) == 0
    assert capsys.readouterr().out == ""


def test_set_replaces_the_sequence(data_root):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    main(["sync", "cooking", "--now", NOW])
    assert main(["set", "cooking", "--sequence", "cooking-002,cooking-001",
                 "--now", NOW]) == 0
    assert _order(data_root, "cooking") == ["cooking-002", "cooking-001"]


def test_set_mismatch_exits_2_with_the_prefix(data_root, capsys):
    _proc(data_root, "cooking-001")
    _proc(data_root, "cooking-002")
    with pytest.raises(SystemExit) as e:
        main(["set", "cooking", "--sequence", "cooking-001", "--now", NOW])
    assert e.value.code == 2
    assert capsys.readouterr().err.startswith("set mismatch:")


def test_move_reorders(data_root):
    for n in (1, 2, 3):
        _proc(data_root, f"cooking-00{n}")
    main(["sync", "cooking", "--now", NOW])
    assert main(["move", "cooking", "--process", "cooking-003", "--to", "1",
                 "--now", NOW]) == 0
    assert _order(data_root, "cooking")[0] == "cooking-003"


def test_move_out_of_range_exits_2(data_root):
    _proc(data_root, "cooking-001")
    main(["sync", "cooking", "--now", NOW])
    with pytest.raises(SystemExit) as e:
        main(["move", "cooking", "--process", "cooking-001", "--to", "5",
              "--now", NOW])
    assert e.value.code == 2


def test_check_is_silent_and_zero_when_consistent(data_root, capsys):
    _proc(data_root, "cooking-001")
    main(["sync", "cooking", "--now", NOW])
    capsys.readouterr()
    assert main(["check", "cooking"]) == 0
    assert capsys.readouterr().err == ""


def test_check_exits_2_and_reports_drift(data_root, capsys):
    _proc(data_root, "cooking-001")
    main(["sync", "cooking", "--now", NOW])
    _proc(data_root, "cooking-002")
    with pytest.raises(SystemExit) as e:
        main(["check", "cooking"])
    assert e.value.code == 2
    assert "missing: cooking-002" in capsys.readouterr().err


def test_sync_all_walks_the_registry(data_root):
    _registry(data_root, ["cooking", "dining", "logistics"])
    _proc(data_root, "cooking-001")
    _proc(data_root, "dining-001")
    assert main(["sync", "--all", "--now", NOW]) == 0
    assert _order(data_root, "cooking") == ["cooking-001"]
    assert _order(data_root, "dining") == ["dining-001"]
    # a department with no processes gets no file
    assert _order(data_root, "logistics") is None


def test_check_all_exits_2_if_any_department_drifts(data_root):
    _registry(data_root, ["cooking", "dining"])
    _proc(data_root, "cooking-001")
    _proc(data_root, "dining-001")
    main(["sync", "--all", "--now", NOW])
    _proc(data_root, "dining-002")
    with pytest.raises(SystemExit) as e:
        main(["check", "--all"])
    assert e.value.code == 2


def test_sync_without_department_or_all_exits_2(data_root):
    with pytest.raises(SystemExit) as e:
        main(["sync"])
    assert e.value.code == 2
