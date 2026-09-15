"""`facts-plan status` — the unit states, the turn clock and `plan_stale`, all
read back off the filesystem and nowhere else."""
import json

import pytest
from facts_plan.build import (
    RECORDED_HEADING,
    TALK_HEADING,
    build,
    refresh_inputs,
    render_input,
    render_phase2_inputs,
)
from facts_plan.cli import check_rebuild, main, status, unit_states

#: §3's two phases, as `plan.json` carries them: a form unit and the transcript
#: unit that waits for it.
WORKBOOK = {"id": "u-wb-x", "type": "workbook", "phase": 1}
TRANSCRIPT = {"id": "u-tr-m-l1", "type": "transcript", "phase": 2,
              "inputs": ["meetings/transcripts/m.txt#L1-L3"]}


def _run(tmp_path, units=("u-a", "u-b")):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units").mkdir(parents=True)
    rows = [dict({"id": u, "type": "workbook", "inputs": [], "candidates": [],
                  "nodes": [], "est_tokens_in": 1, "est_tokens_out": 1},
                 **(u if isinstance(u, dict) else {"id": u}))
            for u in units]
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": rows}), encoding="utf-8")
    # `unit_states`'s default check is `validate facts-unit`, which reads the
    # run's skeleton — `build` writes both files, so a run dir has both.
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": [], "candidates": [], "instances": [],
         "imports": [], "issues": []}), encoding="utf-8")
    for row in rows:
        (run_dir / "units" / row["id"]).mkdir()
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
    _out(run_dir, "u-a", 1, '{"schema_version": 1, "unit": "u-a", '
                            '"attempt": 1, "decisions": []}')
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


# --------------------------------------------------------------------------
# Form-anchored units (spec 2026-09-15 §3): the transcript units wait while a
# form unit is still open, and are told what the forms recorded when they run.


def _planned(tmp_path, units):
    """A planned run of `units` over the smallest root the phase-2 re-render
    needs — an empty manifest, one three-line meeting — with every unit's
    `input.md` as `build` left it: a core, no recorded section."""
    sheets = tmp_path / "attachments" / "sheets"
    sheets.mkdir(parents=True)
    (sheets / "manifest.json").write_text(json.dumps({"workbooks": []}),
                                          encoding="utf-8")
    talk = tmp_path / "meetings" / "transcripts"
    talk.mkdir(parents=True)
    (talk / "m.txt").write_text("یک\nدو\nسه\n", encoding="utf-8")
    run_dir = _run(tmp_path, units)
    plan = json.loads((run_dir / "plan.json").read_text(encoding="utf-8"))
    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    for unit in plan["units"]:
        (run_dir / "units" / unit["id"] / "input.md").write_text(
            render_input(unit, skeleton, {}), encoding="utf-8")
    return tmp_path, run_dir


@pytest.fixture
def planned_run(tmp_path):
    return _planned(tmp_path, [WORKBOOK, TRANSCRIPT])


@pytest.fixture
def planned_transcripts_only(tmp_path):
    return _planned(tmp_path, [TRANSCRIPT])


def _finish(run_dir, unit):
    """One attempt nothing refuses — the unit is `done`."""
    _out(run_dir, unit, 1, json.dumps({"schema_version": 1, "unit": unit,
                                       "attempt": 1, "decisions": []}))


def _refuse_twice(run_dir, unit):
    """Both attempts refused whole — the unit is `failed` and folds nothing."""
    for attempt in (1, 2):
        _out(run_dir, unit, attempt, json.dumps({"schema_version": 7}))


def test_a_transcript_unit_waits_while_a_form_unit_is_open(planned_run):
    root, run = planned_run
    out = status(root, run)
    assert {u["id"]: u["state"] for u in out["units"]} == {
        "u-wb-x": "pending", "u-tr-m-l1": "waiting"}
    assert out["stage"] == "U" and out["phase"] == 1


def test_phase_two_opens_and_its_inputs_are_rendered_once_phase_one_is_over(
        planned_run):
    root, run = planned_run
    _finish(run, "u-wb-x")
    out = status(root, run)
    assert {u["id"]: u["state"] for u in out["units"]} == {
        "u-wb-x": "done", "u-tr-m-l1": "pending"}
    assert out["phase"] == 2
    text = (run / "units" / "u-tr-m-l1" / "input.md").read_text(encoding="utf-8")
    assert RECORDED_HEADING in text and "## ورودی‌های قابل استفادهٔ مجدد" not in text
    status(root, run)                       # idempotent: nothing is rewritten
    assert (run / "units" / "u-tr-m-l1" / "input.md").read_text(
        encoding="utf-8") == text


def test_a_failed_form_unit_still_opens_phase_two(planned_run):
    root, run = planned_run
    _refuse_twice(run, "u-wb-x")
    out = status(root, run)
    assert next(u["state"] for u in out["units"] if u["id"] == "u-tr-m-l1") \
        == "pending"


def test_a_run_with_only_transcripts_has_no_waiting(planned_transcripts_only):
    root, run = planned_transcripts_only
    assert all(u["state"] == "pending" for u in status(root, run)["units"])


def test_the_cli_prints_a_waiting_unit_like_any_other(planned_run, monkeypatch,
                                                      capsys):
    root, run = planned_run
    monkeypatch.setenv("DATA_ROOT", str(root))
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1000000")
    assert main(["status", "--run", str(run)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[:2] == ["u-wb-x · workbook · pending · 0",
                         "u-tr-m-l1 · transcript · waiting · 0"]
    assert lines[2].startswith("stage U · ")


def test_a_refresh_keeps_the_talk_and_what_phase_one_recorded(tmp_path):
    """§4 — `--refresh-inputs` re-renders a run already planned, and the two
    sections §3 added are part of what it re-renders: the phase-1 talk, whose
    recordings it reads back off `plan.json`, and a phase-2 unit's recorded
    section once `status` has written one."""
    from fixtures.facts_plan.make_dump import make_estate
    root = tmp_path / "e"
    make_estate(root)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "prep-1405-06-01.txt").write_text(
        "\n".join(["شمارش موجودی پیتزا و پنیر را هر روز در جدول می‌نویسیم"] * 20),
        encoding="utf-8")
    run = tmp_path / "run"
    build(root, "cooking", run, ["prep-1405-06-01"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    form = next(u["id"] for u in plan["units"] if u["type"] == "workbook")
    chunk = next(u["id"] for u in plan["units"] if u["type"] == "transcript")

    before = (run / "units" / form / "input.md").read_text(encoding="utf-8")
    assert TALK_HEADING in before
    refresh_inputs(root, run)
    assert (run / "units" / form / "input.md").read_text(encoding="utf-8") \
        == before

    assert render_phase2_inputs(root, run) == [chunk]
    recorded = (run / "units" / chunk / "input.md").read_text(encoding="utf-8")
    assert RECORDED_HEADING in recorded
    refresh_inputs(root, run)
    assert (run / "units" / chunk / "input.md").read_text(encoding="utf-8") \
        == recorded


def test_a_refresh_keeps_the_owners_order_of_two_tied_meetings(tmp_path):
    """`related_talk` breaks a tie by transcript order, so a refresh has to
    recover the order the owner named the meetings in — which is the order the
    transcript units sit in the plan, not `plan.json`'s sorted hashes."""
    from fixtures.facts_plan.make_dump import make_estate
    root = tmp_path / "e"
    make_estate(root)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    line = "شمارش موجودی پیتزا و پنیر را هر روز در جدول می‌نویسیم"
    for stem in ("zeta-1405-06-02", "alpha-1405-06-01"):
        (root / "meetings" / "transcripts" / f"{stem}.txt").write_text(
            "\n".join([line] * 20), encoding="utf-8")
    run = tmp_path / "run"
    # named out of alphabetical order, and saying the same thing, so every
    # window ties and only the order decides which passage prints first
    build(root, "cooking", run, ["zeta-1405-06-02", "alpha-1405-06-01"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    assert [rel for rel in plan["hashes"] if "transcripts" in rel] == \
        ["meetings/transcripts/alpha-1405-06-01.txt",
         "meetings/transcripts/zeta-1405-06-02.txt"]        # hashes are sorted

    form = next(u["id"] for u in plan["units"] if u["type"] == "workbook")
    before = (run / "units" / form / "input.md").read_text(encoding="utf-8")
    assert before.index("۱۴۰۵/۰۶/۰۲") < before.index("۱۴۰۵/۰۶/۰۱")
    refresh_inputs(root, run)
    assert (run / "units" / form / "input.md").read_text(encoding="utf-8") \
        == before


def test_the_phase_is_none_once_every_unit_is_done(planned_run):
    root, run = planned_run
    for unit in ("u-wb-x", "u-tr-m-l1"):
        _finish(run, unit)
    out = status(root, run)
    assert all(u["state"] == "done" for u in out["units"])
    assert out["phase"] is None and out["stage"] == "R"
