"""`facts-plan build`'s import edges, context, the two slices, `functions.md`
and `skeleton.json`, over the mini estate plus `facts_plan_helpers`' mirroring
workbook."""
import json

import pytest
from facts_plan.build import (
    _col_index,
    _ident,
    _tokens,
    context_items,
    function_library,
    import_edges,
    mirror_names,
    process_index,
    rank,
    reference_tab_issues,
    resolve_source,
    reuse_slice,
    unit_symbols,
    write_skeleton,
)
from facts_plan_helpers import estate as make_estate


@pytest.fixture
def estate(tmp_path):
    return make_estate(tmp_path)


def _kinds(issues):
    return [i["kind"] for i in issues]


def test_three_hops_resolve_the_source_workbook(estate):
    dump = estate["SGOZ"]
    assert resolve_source(dump, "SheetsFileId_Pitza") == "SPCH"
    assert resolve_source(dump, "SheetsFileId_Bom") == "SBOM"
    assert resolve_source(dump, "SheetsFileId_Nowhere") is None


def test_a_mirror_is_named_by_its_defined_name_and_its_table_identifier(estate):
    dump = estate["SGOZ"]
    assert mirror_names(dump, "Table_Pitza") == ["Pitza_Copy", "Table_Pitza"]
    assert mirror_names(dump, "Prep-Waste") == ["Prep_Waste_Table"]


def test_edge_names_its_consumers_and_falls_back_to_a_locator(estate):
    edges, _ = import_edges(estate, {})
    pitza = [e for e in edges if e["named_range"] == "SheetsFileId_Pitza"]
    assert [e["consumer"] for e in pitza] == ["gozareshat__s2", "gozareshat__s8"]
    assert pitza[0]["source"] == {"spreadsheetId": "SPCH", "sheet": "پیتزا"}
    assert pitza[0]["range"] == "A:D"


def test_edge_takes_a_ref_when_the_source_record_exists(estate):
    edges, _ = import_edges(estate, {("SPCH", "پیتزا"): {"ref": "S-rec-0123456789ab"}})
    assert all(e["source"] == {"ref": "S-rec-0123456789ab"} for e in edges
               if e["named_range"] == "SheetsFileId_Pitza")


def test_unknown_source_unused_mirror_and_a_cell_by_cell_copy(estate):
    _, issues = import_edges(estate, {})
    kinds = _kinds(issues)
    assert kinds.count("unknown_source") == 1              # Table_Orphan
    assert [i["instance"] for i in issues if i["kind"] == "unknown_source"] \
        == ["gozareshat__s4"]
    assert sorted(i["instance"] for i in issues
                  if i["kind"] == "unused_mirror") \
        == ["gozareshat__s3", "mini_pitza_ch__s2"]
    assert [i["instance"] for i in issues if i["kind"] == "per_cell_mirror"] \
        == ["gozareshat__s7"]
    assert all(i["run_only"] is False for i in issues)
    assert all(i["description"] for i in issues)


def test_a_department_filter_keeps_another_department_out(estate):
    estate["SGOZ"]["row"]["departments"] = ["management"]
    edges, issues = import_edges(estate, {}, department="cooking")
    assert [e["consumer"] for e in edges] == []
    assert _kinds(issues) == ["unused_mirror"]             # SPCH's Table_Bom


def test_column_shift_lists_named_columns_only_and_leading_offset_fires(estate):
    _, issues = import_edges(estate, {})
    shift = [i for i in issues if i["kind"] == "column_shift"
             and i["instance"] == "gozareshat__s1"]
    assert len(shift) == 1
    assert "موجودی آخر شب" in shift[0]["description"]
    assert "موجودی اول شب" not in shift[0]["description"]  # inside the range
    assert any(i["kind"] == "leading_offset" and i["instance"] == "gozareshat__s1"
               for i in issues)                            # empty first header cell
    # `مواد` is pulled whole, and its header row names its first column.
    assert not [i for i in issues if i["instance"] == "gozareshat__s3"
                and i["kind"] in ("column_shift", "leading_offset")]


def test_a_wrongly_confirmed_reference_tab_is_reported_and_the_row_is_left_alone(
        estate):
    issues = reference_tab_issues(estate, "cooking")
    assert sorted(_kinds(issues)) == ["reference_tab_computes",
                                      "reference_tab_is_ids",
                                      "reference_tab_is_mirror"]
    assert all(i["run_only"] is True for i in issues)
    assert {i["instance"] for i in issues} == {"gozareshat__s2", "gozareshat__s4",
                                              "gozareshat__s5"}
    assert estate["SGOZ"]["row"]["reference_tabs"] == \
        ["مغایرت", "SheetsFileIds", "Table_Orphan"]


def test_context_drops_sign_tests_and_empty_formats(estate):
    items = context_items(estate, ["SGOZ"])
    texts = " ".join(i["text"] for i in items)
    assert "تلورانس ۵ گرم برای هر پرس" in texts             # the comment
    assert "140" in texts                                  # a business threshold
    assert "کسری" in texts                                 # a text match
    assert "greaterThan 0" not in texts                    # a sign test at zero
    assert "12" not in texts                               # no format: not a rule
    assert any(i["kind"] == "note_tab" and "ترازو خراب است" in i["text"]
               for i in items)
    assert {i["kind"] for i in items} == {"comment", "cf", "note_tab"}


def test_reuse_slice_ranks_by_shared_tokens_and_caps():
    index = [{"id": "F-00002", "kind": "item", "key": "item_1", "title": "پنیر پیتزا",
              "aliases": ["وزن پنیر"], "scope": {"departments": ["cooking"]},
              "retired": False},
             {"id": "F-00003", "kind": "item", "key": "item_9", "title": "روغن سرخ‌کردنی",
              "aliases": [], "scope": {"departments": ["cooking"]}, "retired": False},
             {"id": "F-00004", "kind": "item", "key": "item_x", "title": "کاغذ",
              "aliases": [], "scope": {"departments": ["warehouse"]}, "retired": False}]
    own = [{"id": "S-i-0123456789ab", "kind": "item", "label": "##1 پنیر"}]
    lines = reuse_slice(own, index, {"F-00002": "kg"}, "cooking",
                        _tokens("پنیر پیتزا موجودی"), cap=2)
    assert lines[0] == "S-i-0123456789ab · item · ##1 پنیر"
    assert lines[1].startswith("F-00002 · item · item_1 · پنیر پیتزا")
    assert lines[1].endswith("kg")
    assert len(lines) == 3                                 # own + cap
    assert "F-00004" not in " ".join(lines)                # another department


def test_process_index_and_ranking(tmp_path):
    directory = tmp_path / "departments" / "cooking" / "processes"
    directory.mkdir(parents=True)
    (directory / "cooking-030.json").write_text(json.dumps(
        {"id": "cooking-030", "nodes": [
            {"id": "cooking-030-n001", "label": "شمارش موجودی آخر شب"},
            {"id": "cooking-030-j1"}]}), encoding="utf-8")
    rows = process_index(tmp_path, "cooking")
    assert rows == [{"process": "cooking-030", "node": "cooking-030-n001",
                     "label": "شمارش موجودی آخر شب"}]
    assert rank(rows, _tokens("موجودی"), 5, lambda r: r["label"]) == rows
    assert rank(rows, _tokens("چیز دیگری"), 0, lambda r: r["label"]) == []


def test_process_index_skips_a_tombstoned_process(tmp_path):
    """I3 — a tombstoned process is not content: the index a unit is shown, and
    every citation checked against it, must not see a single node of it."""
    directory = tmp_path / "departments" / "cooking" / "processes"
    directory.mkdir(parents=True)
    (directory / "cooking-002.json").write_text(json.dumps(
        {"id": "cooking-002", "tombstoned": True,
         "superseded_by": ["cooking-030"],
         "nodes": [{"id": "cooking-002-n001", "label": "شمارش قدیمی"}]}),
        encoding="utf-8")
    (directory / "cooking-030.json").write_text(json.dumps(
        {"id": "cooking-030",
         "nodes": [{"id": "cooking-030-n001", "label": "شمارش موجودی آخر شب"}]}),
        encoding="utf-8")
    assert process_index(tmp_path, "cooking") == [
        {"process": "cooking-030", "node": "cooking-030-n001",
         "label": "شمارش موجودی آخر شب"}]


def test_function_library_folds_one_body_into_one_section(estate):
    text = function_library(estate)
    assert text.count("## CONVERT_GR_TO_KG") == 1          # one body, two definers
    assert "gozareshat" in text and "mini_pitza_ch" in text
    assert "## getWeekDayCoefficient" in text
    assert "return 1.3;" in text
    assert "مغایرت!F6:F19" in text                         # FILTER_BY_DATE's caller


def test_unit_symbols_and_skeleton_written(tmp_path):
    (tmp_path / "facts").mkdir()
    (tmp_path / "facts" / "records.json").write_text(json.dumps(
        {"schema_version": 2, "entries": [{
            "id": "F-00001", "kind": "record", "key": "units", "retired": False,
            "valid_to": None, "data": {"rows": [
                {"key": "kg", "retired": False, "valid_to": None},
                {"key": "g", "retired": False, "valid_to": None},
                {"key": "old", "retired": True, "valid_to": None}]}}]},
        ensure_ascii=False), encoding="utf-8")
    symbols = unit_symbols(tmp_path)
    assert symbols == ["g", "kg"]
    assert unit_symbols(tmp_path / "nowhere") == []
    path = write_skeleton(tmp_path, "cooking", "20260906-101500", symbols,
                          [{"id": "S-i-0123456789ab", "kind": "item",
                            "unit": "u-items-food1", "payload": {"code": "#1"}}],
                          [], [], [])
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["schema_version"] == 1 and doc["department"] == "cooking"
    assert doc["run"] == "20260906-101500"
    assert doc["unit_symbols"] == ["g", "kg"]
    assert doc["candidates"][0]["id"] == "S-i-0123456789ab"
    assert doc["instances"] == [] and doc["imports"] == [] and doc["issues"] == []


def test_the_private_two_t15_imports():
    assert _col_index("A") == 1 and _col_index("AA") == 27
    assert _ident("MINUS(Salon_Recipts,1)", "Salon_Recipts")
    assert not _ident("MINUS(Salon_Recipts_Chalebagh,1)", "Salon_Recipts")
    assert _ident(r"LET(\nsheetName,1,\nsheetName)", "sheetName")
