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
    refresh_inputs,
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


def test_a_template_spanning_two_groups_makes_them_one_unit():
    """One template over two workbooks the manifest keeps apart IS the twin
    relation: the candidate would sit in two units, so the groups become one,
    named by the lower short — what `twin_of` would have said. Until
    2026-09-08 `build` refused and told the operator to edit the manifest;
    cooking's had been edited, cashier's and the warehouse's had not, and two
    of nine departments could not plan at all."""
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
    units = plan_units(skeleton, workbook_groups(manifest, "cooking"), [], [], [])
    assert [u["id"] for u in units] == ["u-wb-fried"]
    assert units[0]["candidates"] == ["S-rec-000000000001"]
    assert sorted(units[0]["inputs"]) == sorted(
        w["file"] for w in manifest["workbooks"])


def test_a_candidate_no_unit_holds_exits_2(capsys):
    """The plan's other invariant — a candidate decided nowhere is silently
    lost work. It was a bare `assert`, which `python -O` drops and which reads
    as a crash rather than as the refusal every other precondition is."""
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "nowhere__s1", "sheet": "t"}],
                     "fields": []}}],
        "instances": [{"key": "nowhere__s1", "sheetId": 1}]}
    with pytest.raises(SystemExit) as excinfo:
        plan_units(skeleton, workbook_groups({"workbooks": []}, "cooking"),
                   [], [], [])
    assert excinfo.value.code == 2
    assert "S-rec-000000000001" in capsys.readouterr().err


def _two_tabs_one_axis():
    """Two records on ONE instance — so the workbook axis has a single value
    and `split_unit` has nothing left to split on. The first is 400 fields
    wide (24150 out-tokens on its own), the second is one field."""
    return {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"instances": [{"key": "x__s1", "sheet": "بزرگ"}],
                     "fields": [{"key": "c_a"}] * 400}},
        {"id": "S-rec-000000000002", "kind": "record",
         "payload": {"instances": [{"key": "x__s1", "sheet": "کوچک"}],
                     "fields": [{"key": "c_a"}]}}],
        "instances": [{"key": "x__s1", "sheetId": 1}]}


def test_a_unit_with_no_axis_left_sets_its_biggest_candidates_aside():
    """I5 — a table too big to fit a unit costs the owner that table, never the
    run. Until 2026-09-08 `split_unit` exited 2 here and the whole department
    went unplanned for one oversized tab."""
    skeleton = _two_tabs_one_axis()
    unit = {"id": "u-wb-x", "type": "workbook", "inputs": [],
            "candidates": ["S-rec-000000000001", "S-rec-000000000002"],
            "nodes": [], "est_tokens_in": 0, "est_tokens_out": 24360}
    parts = split_unit(unit, skeleton, lambda u: "x")
    assert [p["id"] for p in parts] == ["u-wb-x"]
    assert parts[0]["candidates"] == ["S-rec-000000000002"]   # the small one stays
    assert parts[0]["est_tokens_out"] <= OUT_BUDGET
    issue, = skeleton["issues"]
    assert (issue["kind"], issue["target"], issue["run_only"]) == \
        ("oversized", "S-rec-000000000001", True)
    assert "بزرگ" in issue["description"]     # the label, as the owner reads it


def test_an_attachment_unit_over_budget_is_named_rather_than_silent():
    """An attachment is no candidate: `_axis_parts` has no axis for it and
    `_set_aside` has nothing to step out, so the unit went to the model over
    budget and the owner was told nothing at all. It is still dispatched — a
    file that cannot be split is better read in part than not at all — but the
    run now names the file that made it so, under the same heading as a table
    too big to fit."""
    skeleton = {"candidates": [], "instances": []}
    unit = {"id": "u-attachments", "type": "attachment",
            "inputs": ["departments/cooking/attachments/.text/forms__tahvil.txt"],
            "candidates": [], "nodes": [], "est_tokens_in": 0,
            "est_tokens_out": 0}
    parts = split_unit(unit, skeleton, lambda u: "x" * (IN_BUDGET * 8))
    assert [p["id"] for p in parts] == ["u-attachments"]
    issue, = skeleton["issues"]
    assert (issue["kind"], issue["run_only"]) == ("oversized", True)
    assert "forms/tahvil" in issue["description"]


def test_a_set_aside_candidate_is_in_no_unit_and_trips_no_invariant():
    """The placed/nowhere invariant counts a set-aside candidate as placed
    nowhere on purpose — it is the one candidate no unit may list."""
    skeleton = _two_tabs_one_axis()
    manifest = {"workbooks": [_wb("x", "MandeShab__ChaleBagh__Amar__X")]}
    units = plan_units(skeleton, workbook_groups(manifest, "cooking"), [], [], [])
    assert [u["candidates"] for u in units] == [["S-rec-000000000002"]]
    assert "unit" not in skeleton["candidates"][0]
    assert [i["target"] for i in skeleton["issues"]] == ["S-rec-000000000001"]


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
    (tmp_path / "facts").mkdir()
    (tmp_path / "facts" / "records.json").write_text(json.dumps(
        {"schema_version": 2, "entries": [{
            "id": "F-00001", "kind": "record", "key": "units", "retired": False,
            "valid_to": None, "data": {"rows": [
                {"key": "kg", "retired": False, "valid_to": None},
                {"key": "g", "retired": False, "valid_to": None}]}}]},
        ensure_ascii=False), encoding="utf-8")

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
        # §3.2: every unit is shown the closed payload contract, and it fits
        # inside the same budget the rest of the input does.
        assert "Shape card" in text and "medium=paper: holder*، kept_at*" in text
        # §3.3: and the run's own unit symbols, so no unit invents one.
        assert "## واحدهای مجاز" in text
        assert "`g`" in text and "`kg`" in text
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


def test_refresh_inputs_rewrites_the_inputs_and_touches_nothing_else(
        tmp_path, monkeypatch):
    """A run whose units have started cannot be rebuilt (`check_rebuild`), so a
    card added mid-run reaches it this way: the inputs are re-rendered from the
    plan already on disk, and the plan and the attempts are left alone."""
    estate(tmp_path)
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    build(tmp_path, "cooking", run_dir, [])
    plan_bytes = (run_dir / "plan.json").read_bytes()
    unit = json.loads(plan_bytes.decode("utf-8"))["units"][0]["id"]
    attempt = run_dir / "units" / unit / "out.1.json"
    attempt.write_text('{"schema_version": 2}', encoding="utf-8")
    path = run_dir / "units" / unit / "input.md"
    before = path.read_text(encoding="utf-8")
    path.write_text(before.split("# Shape card")[0], encoding="utf-8")

    result = refresh_inputs(tmp_path, run_dir)

    assert path.read_text(encoding="utf-8") == before
    assert "medium=paper: holder*، kept_at*" in before
    assert result["refreshed"] == len(json.loads(plan_bytes)["units"])
    assert result["over_budget"] == []
    assert (run_dir / "plan.json").read_bytes() == plan_bytes
    assert attempt.read_text(encoding="utf-8") == '{"schema_version": 2}'

    # and the same thing through the verb the coordinator actually types
    from facts_plan.cli import main
    path.write_text("", encoding="utf-8")
    monkeypatch.setenv("DATA_ROOT", str(tmp_path))
    assert main(["build", "cooking", "--run", str(run_dir),
                 "--refresh-inputs"]) == 0
    assert path.read_text(encoding="utf-8") == before


def test_refresh_inputs_and_rebuild_together_are_refused():
    from facts_plan.cli import main
    with pytest.raises(SystemExit) as caught:
        main(["build", "cooking", "--run", "x", "--refresh-inputs", "--rebuild"])
    assert caught.value.code == 2


def _attachment(root, name, text=None):
    """One department attachment, and its `.text/` cache when `text` is given —
    in the exact two files `extract-attachment` writes: `cache_path`'s own
    output and its `.sha256` sidecar, holding the SOURCE file's digest."""
    import hashlib

    from extract_attachment import cache_path
    adir = root / "departments" / "cooking" / "attachments"
    src = adir / name
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(name.encode("utf-8"))
    if text is not None:
        dst = cache_path(adir, src)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")
        (dst.parent / (dst.name + ".sha256")).write_text(
            hashlib.sha256(src.read_bytes()).hexdigest() + "\n", encoding="utf-8")
    return src


def test_an_attachment_with_no_converter_is_an_issue_named_by_its_file(tmp_path):
    """I2 — `extract-attachment` reads the extensions in its dispatch table and
    nothing else, and a file it cannot read is never improvised over."""
    from facts_plan.build import unread_attachments
    _attachment(tmp_path, "چیدمان-انبار.xyz")
    issues = unread_attachments(tmp_path, "cooking")
    assert [i["kind"] for i in issues] == ["unread_attachment"]
    assert issues[0]["target"] == "چیدمان-انبار.xyz"
    assert issues[0]["run_only"] is True and issues[0]["engine"] is True
    assert "چیدمان-انبار.xyz" in issues[0]["description"]
    assert "attachments" not in issues[0]["description"]     # no path, ever


def test_a_supported_attachment_with_no_cached_text_is_an_issue(tmp_path):
    from facts_plan.build import UNREAD_NOT_READY, unread_attachments
    _attachment(tmp_path, "فرم-تحویل.docx")
    issues = unread_attachments(tmp_path, "cooking")
    assert len(issues) == 1
    assert UNREAD_NOT_READY in issues[0]["description"]
    assert "فرم-تحویل.docx" in issues[0]["description"]


def test_a_read_attachment_and_a_workbook_raise_nothing(tmp_path):
    """A converted file, a passthrough one and an `.xlsx` are all accounted
    for: the first by its cache, the second because it needs none, the third by
    the manifest, which names an unplaced workbook in the same block already."""
    from facts_plan.build import unread_attachments
    _attachment(tmp_path, "فرم-تحویل.docx", text="متن فرم")
    _attachment(tmp_path, "شمارش.csv")
    _attachment(tmp_path, "گزارش.xlsx")
    assert unread_attachments(tmp_path, "cooking") == []


def test_a_stale_cached_text_is_an_issue(tmp_path):
    """The gate is `extract-attachment`'s own: a source edited after its text
    was cached has not been read in the form this run would use."""
    from facts_plan.build import unread_attachments
    src = _attachment(tmp_path, "فرم-تحویل.docx", text="متن فرم")
    src.write_bytes(b"a different document")
    assert len(unread_attachments(tmp_path, "cooking")) == 1


def test_a_department_with_no_attachments_dir_raises_nothing(tmp_path):
    from facts_plan.build import unread_attachments
    assert unread_attachments(tmp_path, "cooking") == []


def test_build_records_the_unread_files_in_the_skeleton(tmp_path):
    """End to end over the mini estate: the two unread files reach
    `skeleton.json`, and no unit's `input.md` names either of them."""
    import json as _json
    from facts_plan.build import build
    estate(tmp_path)
    _attachment(tmp_path, "چیدمان-انبار.xyz")
    _attachment(tmp_path, "فرم-تحویل.docx")
    _attachment(tmp_path, "فرم-ضایعات.pdf", text="متن فرم ضایعات")
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260907-101500"

    build(tmp_path, "cooking", run_dir, [])

    skeleton = _json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    unread = [i for i in skeleton["issues"] if i["kind"] == "unread_attachment"]
    assert {i["target"] for i in unread} == {"چیدمان-انبار.xyz",
                                             "فرم-تحویل.docx"}
    everything = "".join(p.read_text(encoding="utf-8")
                         for p in (run_dir / "units").rglob("input.md"))
    assert "چیدمان-انبار" not in everything and "فرم-تحویل" not in everything
    assert "متن فرم ضایعات" in everything          # the one that WAS read


def test_a_stale_cached_text_reaches_no_unit(tmp_path):
    """I2 has two halves and they are one decision. A `.docx` converted once
    and then edited on disk is named unread — and the text cached from the
    version nobody edited must not be handed to a unit behind that sentence,
    which is exactly what a `.text/` glob with no freshness gate did."""
    import json as _json
    from facts_plan.build import build
    estate(tmp_path)
    src = _attachment(tmp_path, "فرم-تحویل.docx", text="نشانهٔ متن کهنه")
    src.write_bytes(b"a different document")
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260907-101500"

    build(tmp_path, "cooking", run_dir, [])

    everything = "".join(p.read_text(encoding="utf-8")
                         for p in (run_dir / "units").rglob("input.md"))
    assert "نشانهٔ متن کهنه" not in everything
    # nor cited by the plan, whose hashes are what a re-render reads back
    assert "فرم-تحویل" not in (run_dir / "plan.json").read_text(encoding="utf-8")
    skeleton = _json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    assert [i["target"] for i in skeleton["issues"]
            if i["kind"] == "unread_attachment"] == ["فرم-تحویل.docx"]


def test_an_unread_file_in_a_subdirectory_is_named_by_its_relative_path(tmp_path):
    """I2 — the walk reaches a form filed in a subdirectory, and the owner is
    told about it by the name they gave it: their own path, not a bare file
    name that could be any of three folders."""
    from facts_plan.build import unread_attachments
    _attachment(tmp_path, "forms/چیدمان-انبار.xyz")
    issues = unread_attachments(tmp_path, "cooking")
    assert [i["target"] for i in issues] == ["forms/چیدمان-انبار.xyz"]
    assert "forms/چیدمان-انبار.xyz" in issues[0]["description"]
    assert "attachments" not in issues[0]["description"]


def test_a_nested_cache_is_served_and_a_stale_nested_one_is_named(tmp_path):
    """Both halves of I2 hold one level down: the fresh nested cache reaches a
    unit under its flattened name, the stale one reaches the owner instead."""
    from facts_plan.build import _attachment_state
    _attachment(tmp_path, "forms/فرم-تحویل.docx", text="متن فرم")
    stale = _attachment(tmp_path, "forms/فرم-ضایعات.pdf", text="متن کهنه")
    stale.write_bytes(b"a different document")
    texts, issues = _attachment_state(tmp_path, "cooking")
    assert texts == ["departments/cooking/attachments/.text/"
                     "forms__فرم-تحویل.txt"]
    assert [i["target"] for i in issues] == ["forms/فرم-ضایعات.pdf"]


def test_an_orphan_cached_text_is_served_to_nobody(tmp_path):
    """`.text/` is a cache, not a source: a file whose original is gone is a
    leftover of some earlier run and no unit is shown it."""
    from facts_plan.build import _attachment_state
    src = _attachment(tmp_path, "فرم-تحویل.docx", text="متن فرم")
    src.unlink()
    assert _attachment_state(tmp_path, "cooking") == ([], [])


def test_a_rule_candidate_names_what_each_parameter_reads():
    """§3.2 — the unit binds an input to `ref_1` and cannot see what `ref_1`
    is. The first run swapped two of them and the store said something false;
    the candidate line now spells every parameter out."""
    skeleton = {"unit_symbols": [], "instances": [], "candidates": [
        {"id": "S-rec-000000000001", "kind": "record", "unit": "u-wb-pitza",
         "payload": {"instances": [{"key": "pitza__s5", "sheet": "پیتزا"}],
                     "fields": [{"key": "c_e", "title": "موجودی آغاز شب"},
                                {"key": "c_f", "title": "مقدار دریافت از انبار"}]}},
        {"id": "S-r-0000000000002", "kind": "rule", "unit": "u-wb-pitza",
         "payload": {"output": "مصرف", "variants": [{"shape": "PLUS(@,@)"}],
                     "applies_to": [{"key": "pitza__s5__j__r6", "params": {
                         "ref_1": {"ref": "S-rec-000000000001", "field": "c_f"},
                         "tolerancePerFoodGr": 5,
                         "table_1": {"table": "Table_Pitza"},
                         "cell_1": {"cell": "CN"},
                         "ref_9": {"ref": "S-rec-000000000009",
                                   "field": "c_a"}}}]}}]}
    unit = {"id": "u-wb-pitza", "type": "workbook", "inputs": [],
            "candidates": ["S-r-0000000000002"], "nodes": [],
            "est_tokens_in": 0, "est_tokens_out": 250}
    text = render_input(unit, skeleton, {})
    assert "params: cell_1، ref_1، ref_9، table_1، tolerancePerFoodGr" in text
    assert "    ref_1 → «پیتزا» ستون f «مقدار دریافت از انبار»" in text
    assert "    tolerancePerFoodGr → 5" in text
    assert "    table_1 → Table_Pitza" in text
    # `_resolve` leaves a locator it cannot tie to a column of this tab's own
    # template as the `{cell}` §2.3 (d) recorded — the cell is what the reader
    # has, and «?» threw it away.
    assert "    cell_1 → CN" in text
    assert "    ref_9 → ?" in text
