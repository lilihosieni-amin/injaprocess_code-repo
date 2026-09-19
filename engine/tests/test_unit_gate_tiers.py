"""The unit gate under the three tiers (spec 2026-09-13-facts-gate-tiers, rows
A1–A42 and fixes F1, F2, F3, F5, F6): a refusal costs one decision, a repair is
silent, a note is stored and never retried.

The first block runs on the real preparation run of 2026-09-12 (copied
read-only under `fixtures/prep-run-2026-09-12/`); the rest on the synthetic
runs the gate's older tests already use.
"""
import copy
import json
import pathlib
import re
import shutil

import pytest
from facts_plan.assemble import _judge, assemble, materialise, report, validate_unit
from facts_plan.cli import unit_states
from merge_facts import tiers
from test_facts_plan_assemble import _plan as _a_plan
from test_facts_plan_assemble import FORM, PHOTO, TALK, _two_unit_run
from test_facts_plan_assemble import _record_out, _rule_out, _second_record
from test_facts_plan_assemble import _root as _a_root
from test_facts_plan_assemble import _run as _a_run
from test_facts_plan_assemble import _skeleton as _a_skeleton
from test_facts_plan_assemble import _write_review
from test_validate_facts_unit import _bound_doc, _bound_run, _doc, _paper, _run, _write

from engine_common import read_json, write_json_atomic

PREP = pathlib.Path(__file__).parent / "fixtures" / "prep-run-2026-09-12"
RUN = "runs/facts/preparation/20260912-102718"
MEETINGS = ["u-tr-preparation-1405-05-28-02-l1", "u-tr-preparation-1405-06-01-l425",
            "u-tr-preparation-1405-06-02-02-l1", "u-tr-preparation-1405-06-02-l1",
            "u-tr-preparation-1405-06-04-l1", "u-tr-preparation-1405-06-10-l154"]


def _prep_root(tmp_path):
    """A data root holding the real run: everything but `run/` at its own path,
    `run/` at the run's."""
    for part in ("departments", "attachments", "facts"):
        shutil.copytree(PREP / part, tmp_path / part)
    shutil.copytree(PREP / "run", tmp_path / RUN)
    return tmp_path, tmp_path / RUN


def _built(root, run_dir, path):
    """The entries a document on disk materialises once the gate has repaired it
    — what `assemble` folds."""
    return materialise(root, run_dir, _judge(root, run_dir, path)[0])


def _refused(findings):
    return [f.line() for f in tiers.refusals(findings)]


def _noted(findings):
    return tiers.notes(findings)


def _items(findings):
    return sorted({tiers.item_of(f) for f in tiers.refusals(findings)},
                  key=lambda i: (i is None, i))


# --------------------------------------------------------------------------
# The real run


def test_f1_the_excel_units_retry_has_no_refusal(tmp_path):
    root, run = _prep_root(tmp_path)
    found = validate_unit(root, run, run / "units/u-wb-amadesazi/out.2.json")
    assert _refused(found) == []


def test_f2_a_column_group_is_accepted_and_reaches_the_field(tmp_path):
    root, run = _prep_root(tmp_path)
    path = run / "units/u-wb-amadesazi/out.1.json"
    found = validate_unit(root, run, path)
    assert not [line for line in _refused(found) if "group" in line]
    doc = json.loads(path.read_text(encoding="utf-8"))
    written = {(d["skeleton"], f["key"]): f["group"]
               for d in doc["decisions"]
               for f in (d.get("data") or {}).get("fields") or [] if "group" in f}
    assert len(written) == 31
    fields = {(e["_skeleton"], f["key"]): f.get("group")
              for e in _built(root, run, path)
              for f in e["data"].get("fields") or []}
    assert all(fields[k] == group for k, group in written.items())


@pytest.mark.parametrize("unit", MEETINGS)
def test_each_refused_meeting_unit_lands_with_notes_and_no_refusal(tmp_path, unit):
    root, run = _prep_root(tmp_path)
    assert _refused(validate_unit(root, run, run / "units" / unit / "out.1.json")) == []


# --------------------------------------------------------------------------
# F3 / A42 — a refusal costs one decision


def _refused_measurement(rule=None):
    rule = rule or _rule_out()
    rule["decisions"][1]["key"] = "Vazn!"           # no repair makes it a key
    return rule


def test_f3_one_refused_decision_lands_the_others(tmp_path):
    root = _a_root(tmp_path)
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _refused_measurement()})
    found = validate_unit(root, run_dir, run_dir / "units/u-b/out.1.json")
    assert _items(found) == [("decisions", 1)]
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert sorted(e["key"] for e in delta["entries"]) == \
        ["enheraf", "gozaresh_shabane_pitza"]
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    row = next(u for u in assembly["undecided"] if u["skeleton"] == "S-r-000000000003")
    assert row["reason"] == "refused" and row["refused"]
    plan = json.loads((run_dir / "plan.json").read_text(encoding="utf-8"))
    state = next(s for s in unit_states(root, run_dir, plan["units"])
                 if s["id"] == "u-b")
    assert state["state"] == "done"
    assert state["retry"] == ["decisions[1] S-r-000000000003"]


def test_a42_a_retry_answers_only_the_refused_decision_and_the_two_merge(tmp_path):
    root = _a_root(tmp_path)
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _refused_measurement()})
    retry = _rule_out(attempt=2)
    retry["decisions"] = retry["decisions"][1:]
    out2 = run_dir / "units/u-b/out.2.json"
    out2.write_text(json.dumps(retry, ensure_ascii=False), encoding="utf-8")
    found = validate_unit(root, run_dir, out2)
    assert _refused(found) == []
    assert not [f for f in found if "no decision" in f.line()]   # A17: attempt 1 decided it
    plan = json.loads((run_dir / "plan.json").read_text(encoding="utf-8"))
    state = next(s for s in unit_states(root, run_dir, plan["units"])
                 if s["id"] == "u-b")
    assert state["state"] == "done" and not state.get("retry")
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert sorted(e["key"] for e in delta["entries"]) == \
        ["enheraf", "gozaresh_shabane_pitza", "vazn_panir"]


def test_a42_a_retrys_new_entry_replaces_the_refused_one_by_kind_and_key(tmp_path):
    root = _a_root(tmp_path)
    first = _rule_out(new=[_second_record(key="gozaresh_hafteqi"),
                           _second_record(key="Bad Key!")])
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": first})
    assert _items(validate_unit(root, run_dir, run_dir / "units/u-b/out.1.json")) \
        == [("new", 1)]
    fixed = _second_record(key="bad_key")
    (run_dir / "units/u-b/out.2.json").write_text(json.dumps(
        {"schema_version": 1, "unit": "u-b", "attempt": 2, "decisions": [],
         "new": [fixed]}, ensure_ascii=False), encoding="utf-8")
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert {"gozaresh_hafteqi", "bad_key", "enheraf", "vazn_panir"} <= \
        {e["key"] for e in delta["entries"]}


def test_a42_a_whole_document_refusal_with_an_attempt_left_still_stops(tmp_path, capsys):
    root = _a_root(tmp_path)
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out(schema_version=2)})
    with pytest.raises(SystemExit):
        assemble(root, run_dir)
    assert "u-b" in capsys.readouterr().err


def test_a1_a_third_attempt_is_refused_whole_and_the_first_two_still_land(tmp_path):
    root = _a_root(tmp_path)
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    third = run_dir / "units/u-b/out.3.json"
    third.write_text(json.dumps(_rule_out(), ensure_ascii=False), encoding="utf-8")
    assert _items(validate_unit(root, run_dir, third)) == [None]
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert "enheraf" in {e["key"] for e in delta["entries"]}


# --------------------------------------------------------------------------
# F5 — the report names what was lost


def test_f5_a_lost_workbook_and_an_unplaced_photo_are_named_first(tmp_path):
    root = _a_root(tmp_path)
    plan = _a_plan()
    plan["hashes"] = {
        "departments/cooking/attachments/.text/photo-a.image.md": "sha256:0",
        "departments/cooking/attachments/.text/photo-b.image.md": "sha256:0"}
    plan["units"][0]["inputs"] = ["pitza.xlsx"]
    # The photos themselves, beside the sidecars `build` hashed for the run.
    photos = root / "departments" / "cooking" / "attachments"
    photos.mkdir(parents=True)
    for name in ("photo-a.jpg", "photo-b.png"):
        (photos / name).write_bytes(b"x")
    broken = _record_out()
    broken["schema_version"] = 2
    run_dir = _a_run(root, {"u-a": broken, "u-b": _rule_out()}, plan=plan)
    (run_dir / "units/u-a/out.2.json").write_text(
        json.dumps(broken, ensure_ascii=False), encoding="utf-8")
    assemble(root, run_dir)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["lost_sources"] == [
        {"kind": "workbook", "label": "آشپزخانه", "tables": 1, "formulas": 0},
        {"kind": "attachment", "label": "photo-a.jpg", "tables": 0, "formulas": 0},
        {"kind": "attachment", "label": "photo-b.png", "tables": 0, "formulas": 0}]
    (run_dir / "id-map.json").write_text("{}", encoding="utf-8")
    text = report(root, run_dir).read_text(encoding="utf-8")
    lines = text.splitlines()
    assert lines[2:4] == [
        "فایل اکسل «آشپزخانه» ثبت نشد: ۱ جدول و ۰ فرمول آن بررسی نشد.",
        "۲ عکس فرم بررسی نشد."]
    block = "\n".join(lines[:5])
    assert not re.search(r"[A-Za-z0-9/]|S-|F-|T-", block), block


def test_f5_nothing_lost_writes_an_empty_list_and_no_block(tmp_path):
    root = _a_root(tmp_path)
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["lost_sources"] == []
    (run_dir / "id-map.json").write_text("{}", encoding="utf-8")
    assert "ثبت نشد:" not in report(root, run_dir).read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# F6 — speech-only tables are marked


def test_f6_a_record_read_only_from_speech_has_its_columns_marked(tmp_path):
    root = _a_root(tmp_path)
    spoken = _second_record(key="gozaresh_hafteqi")
    spoken["data"]["fields"] = [{"key": "vazn", "title": "وزن", "type": "number",
                                 "unit": "kg"},
                                {"key": "sharh", "title": "شرح"}]
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out(new=[spoken])})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    status = by_key["gozaresh_hafteqi"].get("field_status") or {}
    assert {p for p in status if p.startswith("data/fields/")} == {
        "data/fields/vazn/title", "data/fields/vazn/type", "data/fields/vazn/unit",
        "data/fields/sharh/title"}
    assert not [p for p in by_key["gozaresh_shabane_pitza"].get("field_status") or {}
                if p.startswith("data/fields/")]


# --------------------------------------------------------------------------
# One test per A-row whose tier changes, at the unit gate


def test_a4_unit_and_attempt_come_from_the_directory_and_the_file_name(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc(unit="u-wb-other")
    del doc["attempt"]
    assert _refused(validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json"))) == []


def test_a5_a_missing_list_is_empty_a_wrong_one_refuses_the_document(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    del doc["new"]
    assert _refused(validate_unit(root, run_dir, _write(run_dir, doc))) == []
    assert _items(validate_unit(root, run_dir, _write(run_dir, _doc(new={})))) == [None]
    doc = _doc()
    doc["decisions"].insert(0, "keep")
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 0)]


def test_a6_an_unknown_member_is_kept_never_refused(tmp_path):
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["note"] = "از جلسه"
    doc["decisions"][0]["data"] = {"role": "log", "fields": [
        {"from": "c_h", "key": "masraf", "type": "number",
         "group": {"key": "morgh", "title": "مرغ"}}]}
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert not [line for line in _refused(found) if "'note'" in line or "group" in line]
    entry = _built(root, run_dir, _write(run_dir, doc))[0]
    assert entry["extra"] == {"note": "از جلسه"}
    assert entry["data"]["fields"][0]["group"] == {"key": "morgh", "title": "مرغ"}


def test_a6_the_kept_member_passes_the_store_too(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["note"] = "از جلسه"
    assert _refused(validate_unit(root, run_dir, _write(run_dir, doc))) == []


def test_a7_members_the_engine_builds_are_dropped(tmp_path):
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0].update({"id": "F-00001", "retired": True,
                                "source": [{"type": "chat", "ref": None}]})
    doc["decisions"][0]["data"] = {"role": "log", "instances": [], "location": {}}
    assert _refused(validate_unit(root, run_dir, _write(run_dir, doc))) == []
    entry = _built(root, run_dir, _write(run_dir, doc))[0]
    assert entry["id"] == "T-1" and entry["retired"] is False
    assert entry["data"]["location"] == {"spreadsheetId": "SID", "sheet": "پیتزا"}
    assert "extra" not in entry


def test_a8_a_key_is_cleaned_before_it_is_judged(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["key"] = " Enheraf Masraf-Lain "
    assert _refused(validate_unit(root, run_dir, _write(run_dir, doc))) == []
    assert _built(root, run_dir, _write(run_dir, doc))[0]["key"] == "enheraf_masraf_lain"
    doc["decisions"][0]["key"] = "انحراف"
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 0)]
    thing = dict(_paper(), kind="thing")
    assert _items(validate_unit(root, run_dir, _write(run_dir, _doc(new=[thing])))) \
        == [("new", 0)]


def test_a9_a_keep_with_no_statement_is_stored_with_a_note(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    del doc["decisions"][0]["statement"]
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert [tiers.item_of(f) for f in _noted(found)] == [("decisions", 0)]
    assert _built(root, run_dir, _write(run_dir, doc))[0]["statement"] == ""


def test_a10_an_unknown_action_refuses_that_decision_only(tmp_path):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    doc = _doc()
    doc["decisions"].append({"skeleton": "S-r-000000000002", "action": "ignore"})
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 1)]
    doc["decisions"][1] = {"entry": {"kind": "rule", "key": "x"}, "action": "contradiction",
                           "field": "data/expr", "resolution": "fix"}
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 1)]


def test_a11_a_missing_reason_code_becomes_other(tmp_path):
    root = _a_root(tmp_path)
    rule = _rule_out()
    rule["decisions"][1] = {"skeleton": "S-r-000000000003", "action": "drop",
                            "reason_code": "no such code"}
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": rule})
    assert _refused(validate_unit(root, run_dir, run_dir / "units/u-b/out.1.json")) == []
    assemble(root, run_dir)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [d["reason_code"] for d in assembly["dropped"]] == ["other"]


def test_a12_a_merge_with_nothing_to_merge_into_refuses_that_decision(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0] = {"skeleton": "S-r-000000000001", "action": "merge_into",
                           "reason_code": "duplicate"}
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 0)]


def test_a13_a_one_part_split_is_a_keep_and_a_part_without_takes_takes_all(tmp_path):
    root, run_dir = _run(tmp_path)
    part = {k: v for k, v in _doc()["decisions"][0].items()
            if k in ("key", "title", "statement", "data")}
    doc = _doc()
    doc["decisions"][0] = {"skeleton": "S-r-000000000001", "action": "split",
                           "reason_code": "other", "into": [dict(part, takes=[])]}
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == [] and _noted(found)
    assert [e["key"] for e in _built(root, run_dir, _write(run_dir, doc))] == ["enheraf"]
    doc["decisions"][0]["into"] = [part, dict(part, key="enheraf_2")]
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == [] and _noted(found)
    assert sorted(e["key"] for e in _built(root, run_dir, _write(run_dir, doc))) == \
        ["enheraf", "enheraf_2"]


def test_a14_both_addresses_keep_the_skeleton(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["entry"] = {"kind": "rule", "key": "enheraf"}
    assert _refused(validate_unit(root, run_dir, _write(run_dir, doc))) == []


def test_a15_an_address_that_is_no_candidate_refuses_that_decision(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"].append({"skeleton": "S-r-000000000009", "action": "drop",
                             "reason_code": "cosmetic"})
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 1)]


def test_a16_a_candidate_decided_twice_keeps_the_first(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"].append(dict(doc["decisions"][0]))
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    doc["decisions"][1] = dict(doc["decisions"][0], key="enheraf_dovom")
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert [tiers.item_of(f) for f in _noted(found)] == [("decisions", 0)]
    assert [e["key"] for e in _built(root, run_dir, _write(run_dir, doc))] == ["enheraf"]


def test_a17_an_undecided_candidate_is_a_note_and_joins_a_retry(tmp_path):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    found = validate_unit(root, run_dir, _write(run_dir, _doc()))
    assert _refused(found) == []
    assert [f.label for f in _noted(found)] == ["S-r-000000000002"]
    units = [{"id": "u-wb-pitza", "type": "workbook"}]
    assert unit_states(root, run_dir, units)[0]["state"] == "done"
    assert not unit_states(root, run_dir, units)[0].get("retry")
    doc = _doc()
    doc["decisions"][0]["key"] = "انحراف"
    _write(run_dir, doc)
    assert unit_states(root, run_dir, units)[0]["retry"] == \
        ["decisions[0] S-r-000000000001", "S-r-000000000002"]


def test_a19_a_link_that_can_be_cut_is_cut_with_a_note(tmp_path):
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {"role": "log", "fields": [
        {"from": "c_h", "key": "masraf", "type": "number",
         "derived": {"ref": "S-r-000000000999"}}]}
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert any("S-r-000000000999" in f.message for f in _noted(found))
    assert _built(root, run_dir, _write(run_dir, doc))[0]["data"]["fields"][0]["derived"] is None


def test_a20_a_link_the_entry_cannot_live_without_refuses_that_decision(tmp_path):
    root, run_dir = _run(tmp_path)
    rule = {"kind": "rule", "key": "qaede", "title": "قاعدهٔ تازه",
            "statement": "قاعده‌ای که بر یک جدول اعمال می‌شود.",
            "data": {"inputs": [], "outputs": [],
                     "applies_to": [{"key": "x",
                                     "record": {"ref": "S-rec-000000000999"}}]}}
    assert _items(validate_unit(root, run_dir, _write(run_dir, _doc(new=[rule])))) \
        == [("new", 0)]


def test_a21_a_provisional_field_is_trimmed_and_lowered(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"]["inputs"] = [
        {"key": "a", "from": {"ref": "S-r-000000000001", "field": "C_H "}}]
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert not [line for line in tiers.lines(found) if "provisional" in line]


def test_a22_a_merge_across_kinds_is_stored_as_its_own_entry(tmp_path):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-rec-000000000002"))
    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    skeleton["candidates"][1]["kind"] = "record"
    (run_dir / "skeleton.json").write_text(json.dumps(skeleton, ensure_ascii=False),
                                           encoding="utf-8")
    doc = _doc()
    doc["decisions"][0].update(action="merge_into", into="S-rec-000000000002",
                               reason_code="duplicate")
    doc["decisions"].append({"skeleton": "S-rec-000000000002", "action": "drop",
                             "reason_code": "cosmetic"})
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert [tiers.item_of(f) for f in _noted(found)] == [("decisions", 0)]
    assert [e["key"] for e in _built(root, run_dir, _write(run_dir, doc))] == ["enheraf"]
    for member in ("key", "title"):
        del doc["decisions"][0][member]
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 0)]


def test_a23_a_citation_to_no_node_is_dropped_with_a_note(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["processes"] = [{"process": "cooking-030", "node": "n999"},
                                        {"node": "n016"}]
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert len(_noted(found)) == 2
    source = _built(root, run_dir, _write(run_dir, doc))[0]["source"]
    assert not [s for s in source if s["type"] == "process"]


def test_a24_a_field_for_no_column_is_a_note(tmp_path):
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {"role": "log", "fields": [
        {"from": "c_h", "key": "masraf", "type": "number"},
        {"from": "c_z", "key": "gomshode", "title": "گمشده"},
        {"from": 7, "key": "haft"}]}
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert len(_noted(found)) == 2
    built = _built(root, run_dir, _write(run_dir, doc))[0]
    assert [f["key"] for f in built["data"]["fields"]] == ["masraf"]
    # M-5: the attributes the unit wrote are kept, not only printed
    assert built["extra"] == {
        "data/fields/c_z": {"from": "c_z", "key": "gomshode", "title": "گمشده"},
        "data/fields/haft": {"from": 7, "key": "haft"}}


def test_a25_data_of_the_wrong_type_refuses_that_decision(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"] = "rule"
    assert _items(validate_unit(root, run_dir, _write(run_dir, doc))) == [("decisions", 0)]


def test_a26_swapped_inputs_are_stored_marked_inferred(tmp_path):
    root, run_dir = _bound_run(tmp_path)
    found = validate_unit(root, run_dir, _write(
        run_dir, _bound_doc("mojudi_avval_shab", "daryaft_az_anbar")))
    assert _refused(found) == []
    marked = {f.path for f in _noted(found) if f.mark == "inferred"}
    assert marked == {"data/inputs/mojudi_avval_shab", "data/inputs/daryaft_az_anbar"}


def test_a27_f1_an_inferred_number_with_a_unit_is_no_finding(tmp_path):
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {"role": "log", "fields": [
        {"from": "c_h", "key": "vazn", "unit": "kg",
         "type": {"value": "number", "inferred": True}}]}
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    doc["decisions"][0]["data"]["fields"][0]["type"] = "string"
    found = validate_unit(root, run_dir, _write(run_dir, doc))
    assert _refused(found) == []
    assert [f.path for f in _noted(found)] == ["data/fields/vazn/unit"]


def test_a34_a_branch_off_the_manifest_is_dropped_with_a_note(tmp_path):
    root = _a_root(tmp_path)
    spoken = _second_record(key="gozaresh_hafteqi")
    spoken["branches"] = ["nowhere", "chalebagh"]
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out(new=[spoken])})
    found = validate_unit(root, run_dir, run_dir / "units/u-b/out.1.json")
    assert _refused(found) == []
    assert any("nowhere" in f.message for f in _noted(found))
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    entry = next(e for e in delta["entries"] if e["key"] == "gozaresh_hafteqi")
    assert entry["scope"]["branches"] == ["chalebagh"]
    # A38 — step 8 stores the note it found on the entry it found it on.
    assert [i["kind"] for i in entry["issues"]] == ["shape"]


def test_a36_a_row_key_comes_from_the_key_columns_or_a_unique_title(tmp_path):
    root, run_dir = _run(tmp_path)
    form = _paper()
    form["data"].update(primaryKey=["shift"],
                        fields=[{"key": "shift", "type": "string"}],
                        rows=[{"shift": "sobh"}, {"title": "Asr"}])
    found = validate_unit(root, run_dir, _write(run_dir, _doc(new=[form])))
    assert _refused(found) == []
    form["data"]["rows"] = [{"title": "شیفت صبح"}]
    assert _items(validate_unit(root, run_dir, _write(run_dir, _doc(new=[form])))) \
        == [("new", 0)]


def test_a36_the_derived_row_keys_reach_the_delta(tmp_path):
    root = _a_root(tmp_path)
    form = _paper(key="mande_shab")
    form["data"].update(primaryKey=["shift"],
                        fields=[{"key": "shift", "type": "string"}],
                        rows=[{"shift": "sobh"}, {"title": "Asr"}, {"title": "Asr"},
                              {"title": "shab", "shift": "شب"}])
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out(new=[form])})
    found = validate_unit(root, run_dir, run_dir / "units/u-b/out.1.json")
    assert _items(found) == [("new", 0)]         # the two «Asr» rows are no key
    form["data"]["rows"] = [{"shift": "sobh"}, {"title": "Asr"},
                            {"title": "shab", "shift": "شب"}]
    (run_dir / "units/u-b/out.1.json").write_text(json.dumps(
        _rule_out(new=[form]), ensure_ascii=False), encoding="utf-8")
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    entry = next(e for e in delta["entries"] if e["key"] == "mande_shab")
    assert [r["key"] for r in entry["data"]["rows"]] == ["sobh", "asr", "shab"]


def test_a41_a_review_decision_the_schema_refuses_holds_back_only_itself(tmp_path):
    root = _a_root(tmp_path)
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    from facts_plan.assemble import digest
    digest(root, run_dir)
    _write_review(run_dir, [
        {"action": "keep", "key": "enheraf", "title": "انحراف تازه",
         "statement": "انحراف مصرف اعلامی است."},
        {"entry": {"kind": "measurement", "key": "vazn_panir"},
         "action": "keep", "key": "vazn_panir", "title": "وزن پنیر ورقه‌ای",
         "statement": "پنیر پیتزا با کیلوگرم وزن می‌شود."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] == [(0, "refused")]
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "vazn_panir")["title"] == "وزن پنیر ورقه‌ای"


def _lost(tmp_path, units, failed, candidates=()):
    from facts_plan.assemble import _lost_sources
    root = _a_root(tmp_path)
    state = {"units": {u["id"]: u for u in units}, "failed": set(failed),
             "department": "cooking", "hashes": {}}
    return _lost_sources(root, {"candidates": list(candidates)}, state)


def test_f5_a_meeting_is_named_once_however_many_chunks_were_lost(tmp_path):
    """M-1 (a, c): two lost chunks of one meeting are one line; a meeting with
    no date in its name is counted, never named by its file."""
    units = [{"id": f"u-tr-{n}", "type": "transcript", "inputs": [ref]}
             for n, ref in enumerate([
                 "meetings/transcripts/cooking-1405-06-01.txt#L1-L200",
                 "meetings/transcripts/cooking-1405-06-01.txt#L201-L400",
                 "meetings/transcripts/voice-note.txt#L1-L50"])]
    lost = _lost(tmp_path, units, ["u-tr-0", "u-tr-1", "u-tr-2"])
    from facts_plan.assemble import _lost_block
    lines = [line for line in _lost_block(lost) if line]
    assert lines == ["بخشی از جلسهٔ «۱۴۰۵/۰۶/۰۱» بررسی نشد.",
                     "بخشی از ۱ جلسهٔ دیگر بررسی نشد."]


def test_f5_a_failed_part_of_a_workbook_whose_sibling_landed_is_a_part(tmp_path):
    """M-1 (b): a split workbook one part of which landed is not wholly lost."""
    units = [{"id": f"u-wb-x-s{n}", "type": "workbook", "inputs": ["pitza.xlsx"]}
             for n in (41, 42, 43)]
    candidates = [{"id": "S-rec-1", "kind": "record", "unit": "u-wb-x-s41"},
                  {"id": "S-rec-2", "kind": "record", "unit": "u-wb-x-s43"}]
    lost = _lost(tmp_path, units, ["u-wb-x-s41", "u-wb-x-s43"], candidates)
    assert len(lost) == 1 and lost[0]["tables"] == 2 and lost[0]["part"] is True
    from facts_plan.assemble import _lost_block
    assert _lost_block(lost)[0].startswith("بخشی از فایل اکسل «")


def test_f5_the_undecided_block_says_how_many_were_not_reviewed(tmp_path):
    """M-1 (c, d): a refused `new[]` entry with no title is named in Persian,
    and the block ends on a count, not «یک بخش از داده‌ها ناتمام ماند»."""
    root = _a_root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "note", "key": "bad key!",
                    "statement": "پرسش بی‌عنوان.",
                    "data": {"about": [{"ref": "S-r-000000000002"}],
                             "question": "چند؟"}}]
    run_dir = _a_run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    (run_dir / "id-map.json").write_text("{}", encoding="utf-8")
    text = report(root, run_dir).read_text(encoding="utf-8")
    assert "بخش از داده‌ها" not in text
    assert "«موردی بی‌عنوان»" in text
    assert "۱ مورد در این اجرا بررسی نشد و در اجرای بعدی تکمیل می‌شود." in text
    assert "bad" not in text


# --------------------------------------------------------------------------
# A unit may account for what it heard (spec 2026-09-15 §3)

VOICE = {"type": "voice", "ref": "meetings/transcripts/preparation-1405-06-01.txt",
         "lines": "213-252"}
#: The decision whose entry `_built` returns first — the run's lowest record
#: skeleton, and so the table the account below argues with.
ACCOUNTED = 5


def _with_account(doc, account):
    doc = copy.deepcopy(doc)
    doc["decisions"][ACCOUNTED]["accounts"] = [account]
    return doc


def _shown(run_dir, unit, passages=({"rel": VOICE["ref"], "first": 213,
                                     "last": 252},)):
    """The passages `build` printed to `unit`, as `plan.json` records them —
    the fixture is a run from before the two phases, and the gate admits a
    citation only inside what the plan says the unit was shown."""
    plan = read_json(run_dir / "plan.json")
    for row in plan["units"]:
        row["talk"] = [dict(p) for p in passages] if row["id"] == unit else []
    write_json_atomic(run_dir / "plan.json", plan)


def test_a_units_voice_account_is_kept_open_and_the_form_value_stays_primary(tmp_path):
    root, run_dir = _prep_root(tmp_path)
    _shown(run_dir, "u-wb-amadesazi")
    path = run_dir / "units" / "u-wb-amadesazi" / "out.1.json"
    doc = _with_account(read_json(path), {"path": "data/fields/c_b/unit",
                                          "value": "g", "source": VOICE})
    write_json_atomic(path, doc)
    entry = _built(root, run_dir, path)[0]
    heard, form = entry["accounts"]
    # the field the unit cited by its printed column key, under the key the
    # unit gave it — an account on `c_b` addresses nothing once it is stored
    assert heard == {"field": "data/fields/tedad_mini_burger/unit", "value": "g",
                     "status": "open", "speaker_role": None,
                     "statement": "مقدار ثبت‌شده برای این خانه: g",
                     "source": VOICE}
    assert entry["data"]["fields"][1]["key"] == "tedad_mini_burger"
    # I1 — and the form's own reading beside it, so `resolve` can keep it.
    assert form["field"] == heard["field"] and form["value"] != "g"
    assert form["source"] == entry["source"][0]
    assert entry["data"]["fields"][1]["unit"] != "g"        # the form's value is the entry's
    assert _refused(validate_unit(root, run_dir, path)) == []


def test_an_account_citing_a_passage_the_unit_was_not_shown_is_dropped(tmp_path):
    """I5 — the run chose the transcript, but this unit was shown lines 213-252
    of it and nothing else; 100-140 is talk it never read."""
    root, run_dir = _prep_root(tmp_path)
    _shown(run_dir, "u-wb-amadesazi")
    path = run_dir / "units" / "u-wb-amadesazi" / "out.1.json"
    clean = _built(root, run_dir, path)[0]
    write_json_atomic(path, _with_account(read_json(path), {
        "path": "data/fields/c_b/unit", "value": "g",
        "source": dict(VOICE, lines="100-140")}))
    findings = _judge(root, run_dir, path)[1]
    assert not _refused(findings) and not _noted(findings)
    assert _built(root, run_dir, path)[0] == clean


def test_an_account_whose_source_is_not_a_chosen_transcript_is_dropped_silently(tmp_path):
    root, run_dir = _prep_root(tmp_path)
    path = run_dir / "units" / "u-wb-amadesazi" / "out.1.json"
    bad = {"path": "data/fields/c_b/unit", "value": "g",
           "source": {"type": "voice", "ref": "meetings/transcripts/made-up.txt",
                      "lines": "1-2"}}
    clean = _built(root, run_dir, path)[0]
    write_json_atomic(path, _with_account(read_json(path), bad))
    findings = _judge(root, run_dir, path)[1]
    entry = _built(root, run_dir, path)[0]
    # Silently: A7 drops an engine-owned member as a REPAIR, so neither the
    # findings nor the entry may carry a trace of the one the unit invented.
    assert not _refused(findings) and not _noted(findings)
    assert "accounts" not in entry
    assert [i for i in entry.get("issues") or [] if i["kind"] == "shape"] == []
    assert bad["path"] not in (entry.get("field_status") or {})
    assert entry == clean


#: The reviewer's reproduction: a transcript unit of the real run, and the one
#: meeting excerpt it was handed whole.
TR_UNIT = "u-tr-preparation-1405-05-28-02-l1"
TR_SPAN = ("meetings/transcripts/preparation-1405-05-28-02.txt", 1, 117)


def _with_new_account(run_dir, account, voice=()):
    """The unit's first `new[]` entry, arguing with a listed value."""
    path = run_dir / "units" / TR_UNIT / "out.1.json"
    doc = read_json(path)
    doc["new"][0]["accounts"] = [account]
    if voice:
        doc["new"][0]["voice"] = list(voice)
    write_json_atomic(path, doc)
    return path


def test_a_transcript_units_account_cites_the_excerpt_it_was_handed(tmp_path):
    """Spec §3 phase 2: a spoken number that disagrees with a listed value is an
    account. A phase-2 unit is shown no `talk` passages — its bound is its own
    `#L…` input span, which is every line it read."""
    root, run_dir = _prep_root(tmp_path)
    rel, _first, _last = TR_SPAN
    path = _with_new_account(run_dir, {"path": "data/quantity", "value": 215,
                                       "source": {"type": "voice", "ref": rel,
                                                  "lines": "10-20"}},
                             voice=[{"ref": rel, "lines": "10-20"}])
    entry = next(e for e in _built(root, run_dir, path)
                 if e["_skeleton"].startswith("N-"))
    heard = next(a for a in entry["accounts"] if a["value"] == 215)
    assert heard["status"] == "open" and heard["source"]["lines"] == "10-20"
    # the `voice` member is the excerpt `_unit_sources` already cites, so the
    # entry carries that meeting once, not twice
    assert [s for s in entry["source"] if s["type"] == "voice"] == \
        [{"type": "voice", "ref": rel, "lines": "1-117"}]
    assert _refused(validate_unit(root, run_dir, path)) == []


@pytest.mark.parametrize("lines,rel", [
    ("100-200", TR_SPAN[0]),                       # past the end of its excerpt
    ("10-20", "meetings/transcripts/preparation-1405-06-01.txt"),   # another meeting
])
def test_a_transcript_units_account_outside_its_excerpt_is_dropped(tmp_path, lines,
                                                                   rel):
    root, run_dir = _prep_root(tmp_path)
    clean = _built(root, run_dir,
                   run_dir / "units" / TR_UNIT / "out.1.json")
    path = _with_new_account(run_dir, {"path": "data/quantity", "value": 215,
                                       "source": {"type": "voice", "ref": rel,
                                                  "lines": lines}})
    findings = _judge(root, run_dir, path)[1]
    assert not _refused(findings) and not _noted(findings)
    assert _built(root, run_dir, path) == clean


def test_a_form_unit_is_bound_by_its_passages_and_not_by_its_files(tmp_path):
    """The other half: a workbook unit's own inputs are `.xlsx` and a photo
    unit's are `.text/` sidecars, so nothing of theirs is a meeting excerpt —
    only the passages `build` recorded for them are."""
    from facts_plan.assemble import _shown
    assert _shown({"inputs": ["attachments/sheets/A/A.xlsx"],
                   "talk": [{"rel": TR_SPAN[0], "first": 213, "last": 252}]}) \
        == [{"rel": TR_SPAN[0], "first": 213, "last": 252}]
    assert _shown({"inputs": ["departments/x/attachments/.text/p.image.md"]}) == []
    assert _shown({"inputs": [f"{TR_SPAN[0]}#L1-L117"]}) == \
        [{"rel": TR_SPAN[0], "first": 1, "last": 117}]


# --------------------------------------------------------------------------
# Task G (2026-09-16): an entry cites the photo it was read off, not every
# photo its unit was handed.

PHOTO_2 = "departments/cooking/attachments/.text/photo-2.image.md"
UNGIVEN = "departments/cooking/attachments/.text/photo-9.image.md"


def _photo_run(tmp_path, entry):
    """The two-photo phase-1 unit writing `entry` as its only `new[]` record —
    `(the entry as it is stored, the findings)`."""
    root, run = _two_unit_run(tmp_path, att_new=[entry], tr_new=[],
                              photos=(PHOTO, PHOTO_2))
    path = run / "units" / "u-att-1" / "out.1.json"
    return _built(root, run, path)[0], _judge(root, run, path)[1]


def test_an_entry_read_off_one_photo_cites_that_photo(tmp_path):
    entry, findings = _photo_run(tmp_path, {**FORM, "from": [PHOTO_2]})
    assert entry["source"] == [{"type": "photo", "ref": PHOTO_2}]
    assert not _refused(findings) and not _noted(findings)


def test_a_from_the_unit_was_never_given_is_dropped_and_every_photo_is_cited(tmp_path):
    """INV-3 at file level, at the A7 tier: a path the unit was not handed is
    a path nobody read, so it is dropped in silence and the entry falls back to
    the unit's own inputs rather than losing its evidence."""
    entry, findings = _photo_run(tmp_path, {**FORM, "from": [UNGIVEN]})
    assert entry["source"] == [{"type": "photo", "ref": PHOTO},
                               {"type": "photo", "ref": PHOTO_2}]
    assert not _refused(findings) and not _noted(findings)
    assert "from" not in entry and UNGIVEN not in json.dumps(entry)


def test_an_entry_with_no_from_still_cites_every_photo_of_its_unit(tmp_path):
    entry, _findings = _photo_run(tmp_path, FORM)
    assert entry["source"] == [{"type": "photo", "ref": PHOTO},
                               {"type": "photo", "ref": PHOTO_2}]


def test_a_new_entrys_voice_citation_reaches_its_sources(tmp_path):
    """The fix wave of 2026-09-15 gated `voice` on a `new[]` entry and then lost
    it: `_pseudo` copies a whitelist of members onto the synthetic decision, and
    `voice` was not on it. A photo unit cites no transcript of its own, so the
    meeting it names is only in `source[]` if the member survived the round
    trip."""
    root, run = _two_unit_run(tmp_path, att_new=[
        {**FORM, "voice": [{"ref": TALK, "lines": "1-3"}]}], tr_new=[])
    plan = read_json(run / "plan.json")
    plan["units"][0]["talk"] = [{"rel": TALK, "first": 1, "last": 3}]
    write_json_atomic(run / "plan.json", plan)
    path = run / "units" / "u-att-1" / "out.1.json"
    entry = _built(root, run, path)[0]
    assert entry["source"] == [{"type": "photo", "ref": PHOTO},
                               {"type": "voice", "ref": TALK, "lines": "1-3"}]
    assert not _refused(_judge(root, run, path)[1])
