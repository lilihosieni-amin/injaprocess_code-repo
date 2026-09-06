"""`facts-plan build`'s record templates, reference rows and items, over the
mini estate in `fixtures/facts_plan/make_dump.py`."""
import json
import re

import pytest
from facts_plan.build import (
    build,
    code_key,
    header_notes,
    item_candidates,
    load_estate,
    record_templates,
    reference_rows,
    strip_branch,
    template_signature,
)
from fixtures.facts_plan.make_dump import make_estate


@pytest.fixture
def estate(tmp_path):
    make_estate(tmp_path)
    return load_estate(tmp_path)


def _by_sheet(candidates, sheet):
    return [c for c in candidates if c["render"]["sheet"] == sheet]


def test_signature_folds_the_branch_token_and_reads_the_header_codes():
    assert strip_branch("شمارش چاله‌باغ") == "شمارش"
    assert template_signature("کانتر ناهارخوران", ["نام", "کسری"]) == ("کانتر", ())
    assert template_signature("آمار", ["نام", "پنیر پیتزا ##1", "Column 3"]) \
        == ("آمار", ("##1",))


def test_two_branch_twins_are_one_template_with_two_instances(estate):
    candidates, instances, _ = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")
    assert len(pitza) == 1
    assert [i["key"] for i in pitza[0]["payload"]["instances"]] \
        == ["mini_pitza_ch__s1", "mini_pitza_nk__s1"]
    assert pitza[0]["payload"]["location"]["spreadsheetId"] == "SPCH"
    assert {i["branch"] for i in pitza[0]["payload"]["instances"]} \
        == {"chalebagh", "naharkhoran"}
    assert sum(1 for i in instances if i["template"] == pitza[0]["id"]) == 2


def test_a_mirror_tab_and_an_ids_tab_are_not_templates(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    sheets = {c["render"]["sheet"] for c in candidates}
    assert "Table_Bom" not in sheets and "SheetsFileIDs" not in sheets
    assert len(candidates) == 7


def test_two_tabs_in_one_spreadsheet_never_share_a_template(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    counting = [c for c in candidates
                if c["render"]["signature"][0] == "شمارش"]
    assert len(counting) == 2


def test_a_non_empty_subset_groups_and_an_empty_code_list_does_not(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    amar = [c for c in candidates if c["render"]["signature"][0] == "آمار"]
    grouped = [c for c in amar if len(c["payload"]["instances"]) == 2]
    assert len(amar) == 2 and len(grouped) == 1
    assert [i["key"] for i in grouped[0]["payload"]["instances"]] \
        == ["mini_kanter_ch__s2", "mini_kanter_nk__s2"]


def test_the_offset_twin_keeps_one_field_and_records_the_offset(estate):
    candidates, _, issues = record_templates(estate, "cooking")
    kanter = _by_sheet(candidates, "کانتر")[0]
    first = next(f for f in kanter["payload"]["fields"]
                 if f["title"] == "موجودی اول شب")
    assert first["columns"] == {"mini_kanter_ch__s1": "b",
                                "mini_kanter_nk__s1": "d"}
    assert first["key"] == "c_b"
    assert any(i["kind"] == "column_offset" for i in issues)


def test_enum_is_the_intersection_and_the_difference_is_cross_record(estate):
    candidates, _, issues = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")[0]
    sales = next(f for f in pitza["payload"]["fields"]
                 if f["title"] == "تعداد فروش")
    assert sales["constraints"]["enum"] == ["0", "1"]
    assert any(i["kind"] == "cross_record" for i in issues)


def test_the_label_column_becomes_a_titleless_field_and_the_labels_are_kept(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")[0]
    label = next(f for f in pitza["payload"]["fields"] if f["key"] == "c_a")
    assert label["title"] is None
    assert pitza["render"]["row_labels"]["mini_pitza_ch__s1"]["6"] \
        == "پنیر پیتزا ##1"
    assert next(f for f in pitza["payload"]["fields"]
                if f["title"] == "انحراف")["type"] == "number"


def test_header_notes_keep_the_unit_sentence_and_drop_the_date_band(estate):
    sheet = estate["SPCH"]["sheets"]["پیتزا"]
    assert header_notes(sheet) == [
        {"column": "d", "text": "پیتزا (تمام وزن ها به کیلوگرم است)"}]


def test_reference_rows_are_keyed_by_code_and_omit_a_blank(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    bom = _by_sheet(candidates, "مواد")[0]
    assert bom["payload"]["primaryKey"] == ["c_a"]
    rows = {r["key"]: r for r in bom["payload"]["rows"]}
    assert set(rows) == {"food_71", "food_61"}
    assert rows["food_71"] == {"key": "food_71", "c_a": "پیتزا آمریکایی #71",
                               "c_b": "215", "c_c": "260"}
    assert "c_d" not in rows["food_71"]      # the dump's blank is an omission
    assert code_key("##1") == "ing_1"


def test_a_repeated_header_inside_one_tab_is_reported(estate):
    header = ["نام", "پنیر پیتزا ##1", "نام"]
    fields = [{"key": "c_a", "title": "نام"}, {"key": "c_b", "title": "پنیر پیتزا ##1"}]
    _, _, issues = reference_rows(estate["SBOM"], "مواد", header, fields)
    assert [i["kind"] for i in issues] == ["ambiguous_row_header"]


def test_items_are_one_per_code_with_labels_by_instance_count(estate):
    _, instances, _ = record_templates(estate, "cooking")
    items = {c["payload"]["code"]: c for c in
             item_candidates(estate, "cooking", instances)}
    assert set(items) == {"##1", "##26", "##33", "#71", "#61"}
    assert items["##1"]["render"]["labels"] == ["پنیر پیتزا", "پنیر پیتزا میکس"]
    assert ("mini_bom__s1", "b") in items["##1"]["render"]["sites"]


#: What an owner-facing sentence may never contain — an instance key, a
#: skeleton or `new[]` handle, a unit id, or a path (data-repo § Language).
LEAK = re.compile(r"__s|S-|N-|u-|/")


def test_no_issue_description_names_an_id_or_a_path(tmp_path):
    """Every `ISSUE_TEXT` kind, rendered over the mini estate. `description`
    reaches `gate-b.md` and `report.md` verbatim, so a column letter and a tab
    name are all the locating it may do."""
    from facts_plan.build import ISSUE_TEXT, _row_labels
    from facts_plan_helpers import estate as whole_estate

    root = tmp_path / "e"
    est = whole_estate(root)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "x.txt").write_text(
        "سطر ۱: موجودی را شمردیم.\n", encoding="utf-8")
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    run = root / "runs" / "facts" / "cooking" / "20260906-101500"
    build(root, "cooking", run, ["x"])
    issues = json.loads((run / "skeleton.json").read_text(
        encoding="utf-8"))["issues"]

    # The three kinds the mini estate cannot raise through `build`.
    _, instances, _ = record_templates(est, "cooking")
    by_key = {i["key"]: i for i in instances}
    labelled = [i for i in instances
                if est[i["spreadsheetId"]]["sheets"][i["sheet"]].get("row_labels")]
    issues += _row_labels([labelled[0], by_key["mini_kanter_ch__s1"]], est)[1]
    sheet = est[labelled[1]["spreadsheetId"]]["sheets"][labelled[1]["sheet"]]
    sheet["head"][sheet["header_row"] - 1][0] = "ردیف"      # a second header
    issues += _row_labels(labelled[:2], est)[1]
    issues += reference_rows(est["SBOM"], "مواد", ["نام", "نام"], [])[2]

    assert {i["kind"] for i in issues} == set(ISSUE_TEXT)
    for issue in issues:
        assert not LEAK.search(issue["description"]), issue


def test_ids_are_stable_across_two_builds(tmp_path):
    make_estate(tmp_path)
    first = record_templates(load_estate(tmp_path), "cooking")
    second = record_templates(load_estate(tmp_path), "cooking")
    assert [c["id"] for c in first[0]] == [c["id"] for c in second[0]]
    assert all(c["id"].startswith("S-rec-") and len(c["id"]) == 18
               for c in first[0])
