"""`facts-plan status` — the unit states, the turn clock and `plan_stale`, all
read back off the filesystem and nowhere else."""
import json

import pytest
from facts_plan.cli import check_rebuild, main, status, unit_states


def _run(tmp_path, units=("u-a", "u-b")):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units").mkdir(parents=True)
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": [{"id": u, "type": "workbook", "inputs": [], "candidates": [],
                    "nodes": [], "est_tokens_in": 1, "est_tokens_out": 1}
                   for u in units]}), encoding="utf-8")
    for u in units:
        (run_dir / "units" / u).mkdir()
    return run_dir


def _out(run_dir, unit, n, text):
    (run_dir / "units" / unit / f"out.{n}.json").write_text(text, encoding="utf-8")


def test_new_turn_stamps_and_yield_flips_at_2400(tmp_path, monkeypatch):
    run_dir = _run(tmp_path)
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1000000")
    status(tmp_path, run_dir, new_turn=True)
    assert json.loads((run_dir / "turn.json").read_text())["started_at"] \
        .endswith("Z")
    monkeypatch.setenv("SOURCE_DATE_EPOCH", str(1000000 + 2399))
    assert status(tmp_path, run_dir)["yield"] is False
    monkeypatch.setenv("SOURCE_DATE_EPOCH", str(1000000 + 2401))
    out = status(tmp_path, run_dir)
    assert out["yield"] is True and out["elapsed_s"] == 2401


def test_truncated_output_is_deleted_and_costs_no_attempt(tmp_path):
    run_dir = _run(tmp_path)
    _out(run_dir, "u-a", 1, '{"schema_version": 1, "unit": "u-a", "attempt": 1,')
    states = {s["id"]: s for s in unit_states(tmp_path, run_dir,
                                              [{"id": "u-a", "type": "workbook"}])}
    assert states["u-a"] == {"id": "u-a", "type": "workbook", "state": "pending",
                             "attempts": 0}
    assert not (run_dir / "units" / "u-a" / "out.1.json").exists()


def test_two_refused_attempts_are_failed_one_is_pending(tmp_path):
    run_dir = _run(tmp_path)
    _out(run_dir, "u-a", 1, "{}")
    refuse = lambda path: ["no"]
    units = [{"id": "u-a", "type": "workbook"}]
    assert unit_states(tmp_path, run_dir, units, check=refuse)[0]["state"] == "pending"
    _out(run_dir, "u-a", 2, "{}")
    state = unit_states(tmp_path, run_dir, units, check=refuse)[0]
    assert state["state"] == "failed" and state["attempts"] == 2
    assert unit_states(tmp_path, run_dir, units,
                       check=lambda path: [])[0]["state"] == "done"


def test_the_cli_prints_one_line_per_unit_then_the_summary(tmp_path, monkeypatch,
                                                           capsys):
    run_dir = _run(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(tmp_path))
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1000000")
    assert main(["status", "--run", str(run_dir)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[:2] == ["u-a · workbook · pending · 0",
                         "u-b · workbook · pending · 0"]
    assert lines[2] == "stage U · plan_stale false · elapsed_s 0 · yield false"


def test_check_rebuild_refuses_a_plan_whose_unit_is_done(tmp_path, capsys):
    run_dir = _run(tmp_path)
    check_rebuild(tmp_path, run_dir, False)             # nothing has run yet
    _out(run_dir, "u-a", 1, '{"schema_version": 1, "unit": "u-a"}')
    with pytest.raises(SystemExit) as excinfo:
        check_rebuild(tmp_path, run_dir, False)
    assert excinfo.value.code == 2
    assert "--rebuild" in capsys.readouterr().err
    check_rebuild(tmp_path, run_dir, True)              # …which says replace it


def test_plan_stale_when_a_dump_moved(tmp_path, monkeypatch):
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1000000")
    run_dir = _run(tmp_path)
    dump = tmp_path / "attachments" / "sheets" / ".dump" / "SID"
    dump.mkdir(parents=True)
    (dump / "sheets.json").write_text("{}", encoding="utf-8")
    plan = json.loads((run_dir / "plan.json").read_text())
    from merge_facts import sha256_file
    plan["hashes"] = {"attachments/sheets/.dump/SID/sheets.json":
                      sha256_file(dump / "sheets.json")}
    (run_dir / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    assert status(tmp_path, run_dir)["plan_stale"] is False
    (dump / "sheets.json").write_text('{"x": 1}', encoding="utf-8")
    assert status(tmp_path, run_dir)["plan_stale"] is True
