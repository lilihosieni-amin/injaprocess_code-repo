"""`facts-plan build`'s units: the grouping, the budgets, `plan.json` and the
rendered `input.md` — over synthetic skeletons for the arithmetic and over the
mini estate for the whole orchestrator."""
import json

import pytest
from facts_plan.build import (
    IN_BUDGET,
    MAX_LINE,
    MAX_LINES,
    OUT_BUDGET,
    build,
    estimate_tokens,
    group_key,
    label_of,
    plan_units,
    render_input,
    split_unit,
    transcript_chunks,
    workbook_groups,
    write_plan,
)
from facts_plan_helpers import estate


def _wb(short, directory, twin=None, reference=()):
    return {"spreadsheetId": short.upper(), "short": short, "dir": directory,
            "departments": ["cooking"], "branches": [], "confirmed": True,
            "reference_tabs": list(reference), "twin_of": twin,
            "file": f"{short}.xlsx", "scripts": []}


def test_branch_token_folds_wherever_it_sits():
    assert group_key(_wb("pitza", "MandeShab__ChaleBagh__Amar__Pitza")) == \
        group_key(_wb("amar_pitza", "MandeShab__Naharkhoran__Amar__Pitza"))
    assert group_key(_wb("ash_c", "Ashpazkhane__Ashpazkhne - Chalebagh")) == \
        group_key(_wb("ash_n", "Ashpazkhane__Ashpazkhne - NaharKhoran"))


def test_twin_of_joins_two_groups_and_ids_take_the_lowest_short():
    manifest = {"workbooks": [
        _wb("sokhari", "MandeShab__ChaleBagh__Amar__Sokhari"),
        _wb("fried", "MandeShab__Naharkhoran__Amar__FRIED", twin="sokhari")]}
    groups = workbook_groups(manifest, "cooking")
    assert len(groups) == 1
    assert sorted(w["short"] for w in list(groups.values())[0]) == ["fried", "sokhari"]


def test_unit_ids_and_budgets():
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "pitza__s5", "sheet": "پیتزا"}],
                     "fields": [{"key": "c_a"}, {"key": "c_b"}]}},
        {"id": "S-r-0000000000002", "kind": "rule",
         "payload": {"output": "انحراف",
                     "applies_to": [{"key": "pitza__s5__j__r6"}]}}],
        "instances": [{"key": "pitza__s5", "sheetId": 5}]}
    manifest = {"workbooks": [_wb("pitza", "MandeShab__ChaleBagh__Amar__Pitza")]}
    units = plan_units(skeleton, workbook_groups(manifest, "cooking"),
                       [], [], [])
    assert [u["id"] for u in units] == ["u-wb-pitza"]
    assert units[0]["type"] == "workbook"
    assert units[0]["candidates"] == ["S-r-0000000000002", "S-rec-000000000001"]
    assert units[0]["est_tokens_out"] == 150 + 60 * 2 + 250
    assert skeleton["candidates"][0]["unit"] == "u-wb-pitza"


def test_transcript_chunks_are_line_aligned_and_named_by_first_line():
    text = "\n".join(f"line {n} " + "و" * 400 for n in range(1, 21))
    chunks = transcript_chunks(text, budget=1000)
    assert chunks[0][0] == 1 and len(chunks) > 1
    assert chunks[1][0] == chunks[0][1] + 1            # no line lost, none shared
    units = plan_units({"candidates": [], "instances": []}, {},
                       [("cooking-1405-05-26", "meetings/transcripts/"
                         "cooking-1405-05-26.txt", chunks[0], "x")], [], [])
    assert units[0]["id"] == "u-tr-cooking-1405-05-26-l1"
    assert units[0]["inputs"] == ["meetings/transcripts/cooking-1405-05-26.txt"
                                  f"#L{chunks[0][0]}-L{chunks[0][1]}"]


def test_a_group_over_budget_splits_on_its_tabs_and_keeps_the_axis_in_the_id():
    skeleton = {"candidates": [
        {"id": f"S-rec-00000000000{n}", "kind": "record",
         "payload": {"instances": [{"key": f"gozaresh__s{n}", "sheet": f"t{n}"}],
                     "fields": [{"key": "c_a"}] * 200}} for n in (1, 2)],
        "instances": [{"key": "gozaresh__s1", "sheetId": 1},
                      {"key": "gozaresh__s2", "sheetId": 2}]}
    unit = {"id": "u-wb-gozaresh", "type": "workbook", "inputs": [],
            "candidates": [c["id"] for c in skeleton["candidates"]],
            "nodes": [], "est_tokens_in": 0, "est_tokens_out": 24500}
    parts = split_unit(unit, skeleton, lambda u: "x")
    assert [p["id"] for p in parts] == ["u-wb-gozaresh-s1", "u-wb-gozaresh-s2"]
    assert all(p["est_tokens_out"] <= 20000 for p in parts)


def test_a_template_spanning_two_groups_exits_2(capsys):
    """One template over two workbooks the manifest keeps apart would put its
    candidate in two units. `build` refuses instead, and names the remedy."""
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "sokhari__s1", "sheet": "t"},
                                   {"key": "fried__s1", "sheet": "t"}],
                     "fields": []}}],
        "instances": [{"key": "sokhari__s1", "sheetId": 1},
                      {"key": "fried__s1", "sheetId": 1}]}
    manifest = {"workbooks": [
        _wb("sokhari", "MandeShab__ChaleBagh__Amar__Sokhari"),
        _wb("fried", "MandeShab__Naharkhoran__Amar__FRIED")]}
    with pytest.raises(SystemExit) as excinfo:
        plan_units(skeleton, workbook_groups(manifest, "cooking"), [], [], [])
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "sokhari" in err and "fried" in err and "twin_of" in err


def test_an_unsplittable_group_exits_2(capsys):
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "x__s1"}],
                     "fields": [{"key": "c_a"}] * 400}}],
        "instances": [{"key": "x__s1", "sheetId": 1}]}
    unit = {"id": "u-wb-x", "type": "workbook", "inputs": [],
            "candidates": ["S-rec-000000000001"], "nodes": [],
            "est_tokens_in": 0, "est_tokens_out": 24150}
    with pytest.raises(SystemExit) as excinfo:
        split_unit(unit, skeleton, lambda u: "x")
    assert excinfo.value.code == 2
    assert "u-wb-x" in capsys.readouterr().err


def test_input_md_carries_the_candidates_the_slices_and_both_cards():
    skeleton = {"unit_symbols": ["kg"], "candidates": [
        {"id": "S-r-0000000000002", "kind": "rule", "unit": "u-wb-pitza",
         "payload": {"output": "انحراف", "input_headers": ["مصرف واقعی"],
                     "variants": [{"shape": "MINUS(@,@)"}],
                     "applies_to": [{"key": "pitza__s5__j__r6", "params": {}}]}}],
        "instances": [{"key": "pitza__s5", "sheetId": 5, "sheet": "پیتزا",
                       "branch": "chalebagh"}]}
    unit = {"id": "u-wb-pitza", "type": "workbook", "inputs": [],
            "candidates": ["S-r-0000000000002"], "nodes": [],
            "est_tokens_in": 0, "est_tokens_out": 250}
    text = render_input(unit, skeleton, {"text": "", "context": [],
                                         "reuse": ["F-00002 · item · item_1 · پنیر"],
                                         "processes": ["cooking-030 · n001 · شمارش"],
                                         "field_tables": ["S-rec-… · «پیتزا» · c_a"]})
    assert "S-r-0000000000002 · «انحراف»" in text
    assert "MINUS(@,@)" in text and "1 bindings" in text
    assert "F-00002 · item · item_1 · پنیر" in text
    assert "cooking-030 · n001 · شمارش" in text
    assert "Expression card" in text and "Style card" in text


def test_plan_json_records_the_hashes(tmp_path):
    path = write_plan(tmp_path, "cooking",
                      {"attachments/sheets/.dump/SID/sheets.json": "sha256:ab"},
                      [{"id": "u-wb-pitza", "type": "workbook", "inputs": [],
                        "candidates": [], "nodes": [], "est_tokens_in": 1,
                        "est_tokens_out": 2}])
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["schema_version"] == 1 and doc["department"] == "cooking"
    assert doc["hashes"] == {"attachments/sheets/.dump/SID/sheets.json": "sha256:ab"}


def test_label_of():
    assert label_of({"kind": "item", "payload": {"code": "##1",
                                                 "labels": ["پنیر"]}}) == "##1 پنیر"


def test_build_writes_the_four_artefacts_over_the_mini_estate(tmp_path):
    """The orchestrator end to end: `skeleton.json`, `functions.md`,
    `plan.json` and one `input.md` per unit, every one of them inside the
    budget §2.3 fixes."""
    estate(tmp_path)
    transcripts = tmp_path / "meetings" / "transcripts"
    transcripts.mkdir(parents=True)
    (transcripts / "cooking-1405-05-26.txt").write_text(
        "\n".join(f"سطر {n}: موجودی پنیر پیتزا را آخر شب شمردیم.  "
                  for n in range(1, 40)), encoding="utf-8")
    processes = tmp_path / "departments" / "cooking" / "processes"
    processes.mkdir(parents=True)
    (processes / "cooking-030.json").write_text(json.dumps(
        {"id": "cooking-030", "nodes": [{"id": "cooking-030-n001",
                                         "label": "شمارش موجودی آخر شب"}]}),
        encoding="utf-8")
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"

    out = build(tmp_path, "cooking", run_dir, ["cooking-1405-05-26"])

    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    plan = json.loads((run_dir / "plan.json").read_text(encoding="utf-8"))
    assert (run_dir / "functions.md").read_text(encoding="utf-8").startswith("#")
    assert set(plan) == {"schema_version", "department", "hashes", "units"}
    assert plan["schema_version"] == 1 and plan["department"] == "cooking"
    assert all(h.startswith("sha256:") for h in plan["hashes"].values())
    assert any(rel.endswith("cooking-1405-05-26.txt") for rel in plan["hashes"])
    assert set(plan["units"][0]) == {"id", "type", "inputs", "candidates",
                                     "nodes", "est_tokens_in", "est_tokens_out"}

    # the fixed grouping: each branch pair one unit, the BOM and the mirroring
    # book their own, named after the group's lowest short.
    assert [u["id"] for u in plan["units"] if u["type"] == "workbook"] == [
        "u-wb-gozareshat", "u-wb-mini_bom", "u-wb-mini_kanter_ch",
        "u-wb-mini_pitza_ch"]
    assert {u["type"] for u in plan["units"]} == {"workbook", "transcript",
                                                  "items"}
    assert out == {"units": len(plan["units"]),
                   "candidates": {"item": sum(c["kind"] == "item"
                                              for c in skeleton["candidates"]),
                                  "record": sum(c["kind"] == "record"
                                                for c in skeleton["candidates"]),
                                  "rule": sum(c["kind"] == "rule"
                                              for c in skeleton["candidates"])}}
    # exactly one unit per candidate — neither orphaned nor listed twice.
    placed = [cid for u in plan["units"] for cid in u["candidates"]]
    assert sorted(placed) == sorted(c["id"] for c in skeleton["candidates"])
    assert all(c["unit"] for c in skeleton["candidates"])

    # the ranked process nodes the unit was actually shown
    assert plan["units"][0]["nodes"] == ["cooking-030-n001"]

    for unit in plan["units"]:
        text = (run_dir / "units" / unit["id"] / "input.md").read_text(
            encoding="utf-8")
        lines = text.split("\n")
        assert estimate_tokens(text) <= IN_BUDGET
        assert unit["est_tokens_out"] <= OUT_BUDGET
        assert len(lines) <= MAX_LINES and max(map(len, lines)) <= MAX_LINE
        assert "Expression card" in text and "Style card" in text
    chunk = next(u for u in plan["units"] if u["type"] == "transcript")
    assert chunk["inputs"] == ["meetings/transcripts/cooking-1405-05-26.txt#L1-L39"]
    # a line under the cap is quoted byte for byte, trailing spaces included
    assert "سطر 39: موجودی پنیر پیتزا را آخر شب شمردیم.  \n" in (
        run_dir / "units" / chunk["id"] / "input.md").read_text(encoding="utf-8")

    # §2.3's context row: the bodies of the functions this unit's own
    # candidates call, and no such section for a unit that calls none.
    pitza = (run_dir / "units" / "u-wb-mini_pitza_ch" / "input.md").read_text(
        encoding="utf-8")
    assert "getTotalFoodsIngredient" in pitza and "getIngredientValue(foodIds[i]" in pitza
    items = next(u for u in plan["units"] if u["type"] == "items")
    assert "## توابع" not in (run_dir / "units" / items["id"] / "input.md").read_text(
        encoding="utf-8")
