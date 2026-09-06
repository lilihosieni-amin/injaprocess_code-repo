"""`dump-workbook` — spec §17's dump-workbook bullet, one test per behaviour.

The fixture in `fixtures/make_workbook.py` is the ground truth for the OOXML
shapes; every element in it was copied from the estate's own export.
"""
import json
import re
import zipfile

import pytest
from dump_workbook import (
    _head_grid,
    _read_sheet,
    dump_workbook,
    has_date_header,
    header_row,
    init_manifest,
    is_ids_tab,
    is_mirror_tab,
    manifest_reconcile,
    row_labels,
)
from dump_workbook.cli import main
from engine_common import validate
from fixtures.make_workbook import (
    DUMMY_SOURCE,
    LAMBDA_BODY,
    MIRROR_FORMULA,
    REFERENCE_ROWS,
    REPORT_LABELS,
    make_workbook,
)

# --------------------------------------------------------------------------
# helpers


def _tsv(path):
    lines = [ln for ln in path.read_text(encoding="utf-8").split("\n") if ln]
    header = lines[0].split("\t")
    return [dict(zip(header, ln.split("\t"))) for ln in lines[1:]]


def _json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(tmp_path, reference_tabs=(), **kw):
    """Build the fixture workbook and dump it; returns (summary, out_dir)."""
    book = make_workbook(tmp_path / "wb" / "Test.xlsx", **kw)
    out = tmp_path / ".dump"
    summary = dump_workbook(book, book.parent / "Test.structure.md", out,
                            reference_tabs=reference_tabs)
    return summary, out / summary["spreadsheetId"]


def _sheet(columns, max_row):
    """The two members of a `_read_sheet` result that `row_labels` reads."""
    return {"max_row": max_row, "columns": columns}


def _estate(tmp_path, books=(("Amar__Pitza", "Pitza.xlsx", "SID1"),
                             ("Amar__Kanter", "Kanter.xlsx", "SID2")), **kw):
    """A DATA_ROOT with `attachments/sheets/{dir}/{file}` for each book."""
    root = tmp_path / "data"
    sheets = root / "attachments" / "sheets"
    for directory, name, sid in books:
        make_workbook(sheets / directory / name, spreadsheet_id=sid, **kw)
    return root


# --------------------------------------------------------------------------
# formulas.tsv


def test_shared_formula_group_is_counted_from_the_ref_range(tmp_path):
    _, out = _dump(tmp_path)
    rows = [r for r in _tsv(out / "formulas.tsv") if r["group"]]
    assert len(rows) == 1, "one shared group, not one row per cell"
    assert rows[0]["range"] == "D3:D7"
    assert rows[0]["count"] == "5"


def test_a_naive_per_cell_walk_would_undercount_the_group(tmp_path):
    """The fixture's D6 carries no `<c>` at all — the group is 5 cells but only
    4 `<f>` elements exist. A walk over `<f>` under-counts; the ref range does
    not (the real `Amadesazi!بازدهی` group is under-counted by 97 %)."""
    book = make_workbook(tmp_path / "wb" / "Test.xlsx")
    sheet = zipfile.ZipFile(book).read("xl/worksheets/sheet1.xml").decode()
    assert len(re.findall(r'<f t="shared"', sheet)) == 4
    _, out = _dump(tmp_path)
    assert [r["count"] for r in _tsv(out / "formulas.tsv") if r["group"]] == ["5"]


def test_row_numbers_are_normalised_in_the_group_formula(tmp_path):
    _, out = _dump(tmp_path)
    row = next(r for r in _tsv(out / "formulas.tsv") if r["group"])
    assert row["formula"] == "(CN/BN)*100"


def test_the_cached_value_and_the_error_class_travel_with_the_formula(tmp_path):
    _, out = _dump(tmp_path)
    by_range = {r["range"]: r for r in _tsv(out / "formulas.tsv")}
    assert by_range["D3:D7"]["cached"] == "83.9"
    assert by_range["D3:D7"]["error"] == ""
    assert by_range["F3"]["error"] == "#DIV/0!"
    assert by_range["G3"]["error"] == "#NAME?"
    assert by_range["H3"]["error"] == "Loading..."


def test_dummyfunction_is_unwrapped_across_the_and_split(tmp_path):
    _, out = _dump(tmp_path)
    row = next(r for r in _tsv(out / "formulas.tsv") if r["range"] == "E3")
    assert row["formula"] == DUMMY_SOURCE          # quotes un-doubled, halves joined
    assert "__xludf" not in row["formula"]
    assert row["cached"] == "42"


def test_a_formula_never_breaks_the_tsv_grid(tmp_path):
    """Google's split literals carry newlines and the odd tab."""
    _, out = _dump(tmp_path)
    text = (out / "formulas.tsv").read_text(encoding="utf-8")
    widths = {len(ln.split("\t")) for ln in text.split("\n") if ln}
    assert widths == {7}


# --------------------------------------------------------------------------
# names.tsv


def test_lambda_bodies_are_emitted_verbatim_with_workbook_scope(tmp_path):
    _, out = _dump(tmp_path)
    row = next(r for r in _tsv(out / "names.tsv") if r["name"] == "FILTER_BY_DATE")
    assert row["formula"] == LAMBDA_BODY
    assert row["scope"] == "workbook"


def test_sheet_scoped_duplicate_names_are_both_emitted(tmp_path):
    _, out = _dump(tmp_path)
    rows = [r for r in _tsv(out / "names.tsv") if r["name"] == "Kitchen_Dough"]
    assert len(rows) == 2
    assert sorted(r["scope"] for r in rows) == sorted(["آمار", "مواد اولیه"])


# --------------------------------------------------------------------------
# comments.tsv


def test_threaded_comment_text_is_read_and_the_author_is_a_role(tmp_path):
    _, out = _dump(tmp_path)
    rows = _tsv(out / "comments.tsv")
    threaded = next(r for r in rows if r["cell"] == "C4")
    assert threaded["text"] == "تلورانس این ستون ۵ گرم است"
    assert threaded["author"] == "unknown"
    assert threaded["sheet"] == "آمار"
    assert "Ana Saghafian" not in (out / "comments.tsv").read_text(encoding="utf-8")


def test_a_role_table_maps_the_person_id(tmp_path):
    from fixtures.make_workbook import PERSON_ID
    book = make_workbook(tmp_path / "wb" / "Test.xlsx")
    out = tmp_path / ".dump"
    dump_workbook(book, book.parent / "Test.structure.md", out,
                  roles={PERSON_ID: "accounting"})
    rows = _tsv(out / "TESTID01" / "comments.tsv")
    assert next(r for r in rows if r["cell"] == "C4")["author"] == "accounting"


def test_the_legacy_placeholder_is_discarded_and_the_real_one_kept(tmp_path):
    _, out = _dump(tmp_path)
    rows = _tsv(out / "comments.tsv")
    assert [r["cell"] for r in rows] == ["C4", "B5"]
    assert "[Threaded comment]" not in (out / "comments.tsv").read_text("utf-8")
    legacy = next(r for r in rows if r["cell"] == "B5")
    assert legacy["author"] == "unknown" and "Reza" not in legacy["author"]
    assert legacy["text"] == "این عدد دستی وارد می‌شود"


# --------------------------------------------------------------------------
# sheets.json


def test_the_header_row_skips_a_merged_band(tmp_path):
    _, out = _dump(tmp_path)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["آمار"]["header_row"] == 2
    assert sheets["آمار"]["head"][1][:2] == ["کد", "نام"]
    assert sheets["مواد اولیه"]["header_row"] == 1
    assert sheets["شمارش"]["header_row"] is None      # numbers all the way down


def test_without_the_band_row_one_is_the_header(tmp_path):
    _, out = _dump(tmp_path, merged_band_header=False)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["آمار"]["header_row"] == 1


def test_a_merged_header_row_is_still_the_header():
    """Only a title band is skipped. A header that happens to be merged is a
    header — skipping it sent `rows.tsv` to letter columns and emitted the
    header as data."""
    assert header_row([["کد", "نام"], ["1", "2"]], ["A1:B1"]) == 1


def test_a_tall_merge_does_not_void_the_header():
    """A merge down ten rows used to band every row it touched, so no row of
    the head was eligible and the tab lost its header entirely."""
    head = [["کد", "نام", "گرم"], ["prod_61", "پنیر", "250"]]
    assert header_row(head, ["A1:B10"]) == 1


def test_a_title_band_is_skipped_but_only_the_band():
    """One caption across most of the row, nothing beside it: the shape the
    estate's 39 banded tabs have."""
    head = [["گزارش روزانه", "", "", ""], ["کد", "نام", "مقدار", "بازدهی"]]
    assert header_row(head, ["A1:D1"]) == 2
    assert header_row(head, []) == 1                  # without the merge, row 1


def test_two_captions_over_one_row_are_still_a_band():
    """`Anbar!خروجی انبار به آماده سازی` banners «برگر (وزن)» and «مرغ (وزن)»
    over one row and puts the column titles below it — no single merge covers
    that row, so a per-merge test would take the banner for the header."""
    head = [["", "برگر (وزن)", "", "مرغ (وزن)", ""],
            ["تاریخ", "مغز ران", "سردست", "سینه", "فیله"]]
    assert header_row(head, ["B1:C1", "D1:E1"]) == 2


def test_a_band_whose_last_caption_is_not_merged_is_still_a_band():
    """`Amadesazi!خروجی آماده سازی به انبار` banners six captions over 23
    columns and leaves the last — a single-column group — unmerged. A band is
    recognised by being sparse, not by what its merges happen to cover."""
    head = [["", "برگر", "", "سینه مرغ", "", "", "", "گوشت پخته"],
            ["تاریخ", "مینی برگر", "برگر", "لقمه", "وزن", "پیتزا", "کل", "off"]]
    assert header_row(head, ["B1:C1", "D1:G1"]) == 2


def test_a_dense_header_carrying_one_merged_group_is_not_a_band():
    """The other side of sparsity: a row of titles with one merged pair in it
    is a header, and must not be skipped."""
    head = [["تاریخ", "گروه", "", "نام", "وزن"], ["1", "2", "3", "4", "5"]]
    assert header_row(head, ["B1:C1"]) == 1


def test_sheets_json_carries_hidden_dimensions_codes_and_the_empty_flag(tmp_path):
    _, out = _dump(tmp_path)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["Refresher"]["hidden"] is True and sheets["Refresher"]["empty"] is True
    assert sheets["آمار"]["hidden"] is False and sheets["آمار"]["empty"] is False
    assert sheets["آمار"]["sheetId"] == 1
    assert sheets["آمار"]["dimension"] == "A1:H7"
    assert sheets["آمار"]["codes"] == ["##RPT-1"]
    assert len(sheets["آمار"]["head"]) == 6


def test_the_head_is_the_header_row_and_the_four_rows_below_it(tmp_path):
    """§4 — deep enough for `build` to sample a column's type, and no deeper."""
    _, out = _dump(tmp_path, v3_tabs=True)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    report = sheets["گزارش پیتزا"]
    assert report["header_row"] == 5
    assert len(report["head"]) == 9                  # 5 + 4, of the tab's 15
    assert report["head"][5][1] == "پنیر پیتزا"      # row 6, column B
    assert sheets["آمار"]["header_row"] == 2 and len(sheets["آمار"]["head"]) == 6


def test_every_head_row_is_the_tab_s_full_width(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True)
    for sheet in _json(out / "sheets.json")["sheets"]:
        assert {len(row) for row in sheet["head"]} <= {sheet["cols"]}, sheet["name"]


def test_header_row_still_searches_only_the_first_five_rows():
    """The head is nine rows deep now; the header is still found where it was
    or nowhere at all — no estate tab may change its header row (§7)."""
    assert header_row([["1"], ["2"], ["3"], ["4"], ["5"], ["کد", "نام"]]) is None


def test_read_sheet_keeps_every_cell_of_the_two_left_most_non_empty_columns(tmp_path):
    book = make_workbook(tmp_path / "wb" / "Test.xlsx", v3_tabs=True)
    sheet = _read_sheet(zipfile.ZipFile(book).read("xl/worksheets/sheet5.xml"), [])
    assert sorted(sheet["columns"]) == [2, 3]        # column A is empty
    assert sheet["columns"][2][6] == "پنیر پیتزا"    # below the head, and kept
    assert sheet["columns"][2][15] == "خمیر پیتزا"


def test_head_rows_are_padded_to_a_max_col_no_head_row_reaches():
    """`_head_grid` widens to `sheet["max_col"]`, not to the widest head row —
    a formula-only cell far to the right, below the head, still sets the tab's
    width and every head row must reach it."""
    grid = _head_grid({"head": {1: {1: "کد", 2: "نام"}}, "max_row": 12,
                       "max_col": 8})
    assert {len(row) for row in grid} == {8}
    assert grid[0] == ["کد", "نام", "", "", "", "", "", ""]


# --------------------------------------------------------------------------
# row_labels and the three predicates that guard it


def test_row_labels_are_written_for_a_report_tab_and_a_bom_tab(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["گزارش پیتزا"]["row_labels"] == {
        str(6 + i): label for i, label in enumerate(REPORT_LABELS)}
    assert sheets["پیتزا امریکایی"]["row_labels"] == {
        "2": "رستبیف #71", "3": "تگزاس #309", "4": "مخلوط #74"}


def test_no_row_labels_on_a_month_column_a_mirror_or_an_ids_tab(tmp_path):
    """A mirror's spilled values and an ids tab's range names read exactly like
    labels; a month column reads like one too. None of them names a row."""
    _, out = _dump(tmp_path, v3_tabs=True)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    for name in ("موجودی اول شب", "Table_Ingredients_Pizza", "SheetsFileIds"):
        assert "row_labels" not in sheets[name], name


def test_a_column_of_sentences_is_not_a_label_column():
    """`Hesabdari!نیازمندیها و مشکلات` — a label names a thing, a sentence is a
    nightly note (QF-1)."""
    note = "در یخچال از یک طرف افتاده و باید تعمیر شود"
    cells = {r: f"{note} {r}" for r in range(2, 6)}
    assert row_labels(_sheet({2: cells}, 5), [["تاریخ", "مشکل"]], 1) == {}


def test_a_column_that_repeats_itself_is_not_a_label_column():
    cells = {r: "تعمیر" for r in range(2, 6)}
    assert row_labels(_sheet({2: cells}, 5), [["تاریخ", "مشکل"]], 1) == {}


def test_a_month_column_with_no_header_is_still_a_date_part():
    cells = {2: "آذر", 3: "دی", 4: "بهمن", 5: "اسفند"}
    assert row_labels(_sheet({2: cells}, 5), [["", ""]], 1) == {}


def test_a_column_of_dates_in_either_estate_form_is_not_a_label_column():
    cells = {2: "1405/04/18", 3: "16/4/1405", 4: "1405/04/20", 5: "1405/04/21"}
    assert row_labels(_sheet({2: cells}, 5), [["", ""]], 1) == {}


def test_a_tab_over_sixty_rows_gets_no_labels():
    cells = {r: f"قلم {r}" for r in range(2, 61)}
    assert row_labels(_sheet({1: cells}, 60), [["نام"]], 1) == {}


def test_is_mirror_tab_only_for_a_whole_tab_import():
    at_a1 = [["t", "A1", "", MIRROR_FORMULA, 1, "نام", ""]]
    assert is_mirror_tab(at_a1)
    assert not is_mirror_tab([])
    assert not is_mirror_tab([["t", "B2", "", MIRROR_FORMULA, 1, "", ""]])
    assert not is_mirror_tab(at_a1 + [["t", "A2", "", "SUM(AN)", 1, "", ""]])
    assert not is_mirror_tab(                      # an import inside a rule
        [["t", "A1", "", "SUM(IMPORT_FROM_SHEET(A,B,C),1)", 1, "", ""]])


def test_is_ids_tab_takes_both_spellings_the_estate_uses():
    assert is_ids_tab("SheetsFileIds") and is_ids_tab("SheetsFileIDs")
    assert is_ids_tab(" sheetsfileid ")
    assert not is_ids_tab("Table_Ingredients_Pizza")


def test_has_date_header_names_a_date_column():
    assert has_date_header(["تاریخ", "رستبیف #71"])
    assert has_date_header(["روز", "ماه", "سال", "وزن پنیر پیتزا ##1"])
    assert has_date_header(["Column 1", "ماه", "سال"])   # Anbar markazi!فرنگی
    assert not has_date_header(["نام", "پنیر پیتزا ##1"])


def test_no_plain_cell_of_a_non_reference_tab_reaches_the_dump(tmp_path):
    """QF-1 — with no reference tab confirmed there is no `rows.tsv` at all, and
    a tab\'s cells appear nowhere else. (`sheets.json` keeps the header row and
    four rows below it for every tab: the header row is found in them and
    `build` samples types from them.)"""
    _, out = _dump(tmp_path)
    assert not (out / "rows.tsv").exists()
    for name in ("formulas.tsv", "names.tsv", "validations.tsv", "cf.tsv",
                 "comments.tsv", "meta.json"):
        assert "933" not in (out / name).read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# meta.json and the spreadsheetId


def test_meta_carries_the_hash_the_export_time_and_the_sheet_count(tmp_path):
    _, out = _dump(tmp_path)
    meta = _json(out / "meta.json")
    assert meta["sheet_count"] == 4
    assert meta["exported"] == "2026-08-29T10:38:50.643Z"
    assert re.fullmatch(r"[0-9a-f]{64}", meta["sha256"])
    assert meta["file"] == "Test.xlsx"


def test_a_structure_md_without_the_id_line_is_exit_2_naming_the_file(tmp_path, capsys):
    book = make_workbook(tmp_path / "wb" / "Test.xlsx", spreadsheet_id=None)
    with pytest.raises(SystemExit) as e:
        dump_workbook(book, book.parent / "Test.structure.md", tmp_path / ".dump")
    assert e.value.code == 2
    assert "Test.structure.md" in capsys.readouterr().err


def test_a_missing_structure_md_is_exit_2_naming_the_file(tmp_path, capsys):
    book = make_workbook(tmp_path / "wb" / "Test.xlsx", structure_md=False)
    with pytest.raises(SystemExit) as e:
        dump_workbook(book, book.parent / "Test.structure.md", tmp_path / ".dump")
    assert e.value.code == 2
    assert "Test.structure.md" in capsys.readouterr().err


def test_an_unresolved_worksheet_part_is_reported_not_passed_off_as_empty(
        tmp_path, capsys):
    """A dangling `r:id` still yields a stub row — but silently, that stub is
    indistinguishable from a genuinely empty tab, and a confirmed reference tab
    could go missing without a word."""
    _, out = _dump(tmp_path, dangling_rel=True)
    err = capsys.readouterr().err
    assert "worksheet part unresolved" in err and "شمارش" in err
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["شمارش"]["empty"] is True
    assert sheets["مواد اولیه"]["empty"] is False     # the others are unharmed


def test_a_file_that_is_not_a_workbook_is_exit_2_not_a_traceback(tmp_path, capsys):
    """A failed download left under `attachments/sheets/` must stop the run with
    a sentence, not a stack trace out of `zipfile`."""
    make_workbook(tmp_path / "wb" / "Test.xlsx")
    book = tmp_path / "wb" / "Test.xlsx"
    book.write_text("<html>error</html>", encoding="utf-8")
    with pytest.raises(SystemExit) as e:
        dump_workbook(book, book.parent / "Test.structure.md", tmp_path / ".dump")
    assert e.value.code == 2
    assert "Test.xlsx" in capsys.readouterr().err


# --------------------------------------------------------------------------
# drift (QF-29)


def test_a_re_dump_reports_the_sheet_id_drift(tmp_path, capsys):
    book = tmp_path / "wb" / "Test.xlsx"
    md = tmp_path / "wb" / "Test.structure.md"
    out = tmp_path / ".dump"
    make_workbook(book)
    dump_workbook(book, md, out)
    assert "drift:" not in capsys.readouterr().out

    make_workbook(book, sheet_names=["آمار جدید", "مواد اولیه",
                                     "Refresher", "شمارش"])
    summary = dump_workbook(book, md, out)
    printed = capsys.readouterr().out
    assert "drift: آمار -> آمار جدید" in printed
    assert summary["drift"] == [{"sheetId": 1, "old": "آمار", "new": "آمار جدید"}]
    assert _json(out / "TESTID01" / "sheets.json")["previous"]["1"] == "آمار"


def test_an_unchanged_re_dump_reports_no_drift(tmp_path, capsys):
    book = tmp_path / "wb" / "Test.xlsx"
    md = tmp_path / "wb" / "Test.structure.md"
    out = tmp_path / ".dump"
    make_workbook(book)
    dump_workbook(book, md, out)
    capsys.readouterr()
    assert dump_workbook(book, md, out)["drift"] == []
    assert "drift:" not in capsys.readouterr().out


# --------------------------------------------------------------------------
# rows.tsv — the one exception to QF-1


def test_a_reference_tab_yields_rows_tsv_verbatim(tmp_path):
    _, out = _dump(tmp_path, reference_tabs=["مواد اولیه"])
    rows = _tsv(out / "rows.tsv")
    header = (out / "rows.tsv").read_text(encoding="utf-8").split("\n")[0]
    assert header.split("\t") == ["sheet", "row"] + REFERENCE_ROWS[0]
    assert [r["کد"] for r in rows] == ["prod_61", "prod_62", "prod_63"]
    assert rows[0] == {"sheet": "مواد اولیه", "row": "2",
                       "کد": "prod_61", "نام": "پنیر", "گرم": "250"}


def test_a_rows_tsv_does_not_outlive_the_tab_it_was_dumped_from(tmp_path):
    """A tab renamed, emptied, or taken out of `reference_tabs[]` leaves a
    `rows.tsv` that `merge facts audit` would read as current. The run that
    dumps no reference cells removes it."""
    book = tmp_path / "wb" / "Test.xlsx"
    md = tmp_path / "wb" / "Test.structure.md"
    out = tmp_path / ".dump" / "TESTID01"
    make_workbook(book)
    dump_workbook(book, md, tmp_path / ".dump", reference_tabs=["مواد اولیه"])
    assert (out / "rows.tsv").is_file()

    dump_workbook(book, md, tmp_path / ".dump", reference_tabs=[])
    assert not (out / "rows.tsv").exists()
    assert (out / "sheets.json").is_file()            # the rest still written


def test_a_renamed_reference_tab_takes_its_rows_tsv_with_it(tmp_path, capsys):
    book = tmp_path / "wb" / "Test.xlsx"
    md = tmp_path / "wb" / "Test.structure.md"
    out = tmp_path / ".dump" / "TESTID01"
    make_workbook(book)
    dump_workbook(book, md, tmp_path / ".dump", reference_tabs=["مواد اولیه"])
    make_workbook(book, sheet_names=["آمار", "مواد اولیهٔ نو",
                                     "Refresher", "شمارش"])
    dump_workbook(book, md, tmp_path / ".dump", reference_tabs=["مواد اولیه"])
    assert not (out / "rows.tsv").exists()
    assert "reference_tabs is stale" in capsys.readouterr().err


def test_a_tab_not_listed_yields_no_rows_even_when_full_of_numbers(tmp_path):
    _, out = _dump(tmp_path, reference_tabs=["مواد اولیه"])
    text = (out / "rows.tsv").read_text(encoding="utf-8")
    assert "شمارش" not in text and "933" not in text


def test_an_ids_tab_is_dumped_to_rows_tsv_without_being_a_reference_tab(tmp_path):
    """The three hops of an import edge start here: the named range is only in
    this tab, and no manifest row will ever confirm it as a table (§2.2)."""
    _, out = _dump(tmp_path, v3_tabs=True)
    rows = _tsv(out / "rows.tsv")
    assert {r["sheet"] for r in rows} == {"SheetsFileIds"}
    assert [r["Range Name Associated"] for r in rows] == ["SheetsFileId_Pizza",
                                                          "SheetsFileId_Kanter"]
    assert rows[0]["Sheets File Id"] == "SIDPIZZA"


def test_both_estate_spellings_of_the_ids_tab_are_dumped(tmp_path):
    from fixtures.make_workbook import SHEETS, V3_SHEETS
    names = [name for name, _ in SHEETS + V3_SHEETS]
    names[5] = "SheetsFileIDs"
    _, out = _dump(tmp_path, v3_tabs=True, sheet_names=names)
    assert {r["sheet"] for r in _tsv(out / "rows.tsv")} == {"SheetsFileIDs"}


def test_a_reference_tab_and_the_ids_tab_share_one_rows_tsv(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True, reference_tabs=["پیتزا امریکایی"])
    by_sheet = {}
    for row in _tsv(out / "rows.tsv"):
        by_sheet.setdefault(row["sheet"], []).append(row)
    assert sorted(by_sheet) == ["SheetsFileIds", "پیتزا امریکایی"]
    assert by_sheet["پیتزا امریکایی"][0]["نام"] == "رستبیف #71"


def test_no_other_tab_s_cells_ride_along_with_the_ids_rows(tmp_path):
    _, out = _dump(tmp_path, v3_tabs=True)
    text = (out / "rows.tsv").read_text(encoding="utf-8")
    assert "933" not in text and "پنیر پیتزا" not in text    # QF-1 still holds


def test_a_stale_ids_tabs_name_warns_under_its_own_list(tmp_path, capsys):
    """A name given in `ids_tabs` that no tab carries is stale the same way a
    `reference_tabs` name is — and the warning has to say which list to fix."""
    book = tmp_path / "wb" / "Test.xlsx"
    make_workbook(book)
    dump_workbook(book, book.parent / "Test.structure.md", tmp_path / ".dump",
                  ids_tabs=["SheetsFileIds"])
    assert "ids_tabs is stale" in capsys.readouterr().err


# --------------------------------------------------------------------------
# --init-manifest


def test_init_manifest_fills_the_mechanical_columns(tmp_path):
    root = _estate(tmp_path)
    (root / "attachments" / "sheets" / "Amar__Pitza" / "Pitza.gs").write_text(
        "function x() {}", encoding="utf-8")
    manifest = init_manifest(root / "attachments" / "sheets")
    validate("manifest.schema.json", manifest)
    by_id = {w["spreadsheetId"]: w for w in manifest["workbooks"]}
    assert by_id["SID1"]["dir"] == "Amar__Pitza"
    assert by_id["SID1"]["file"] == "Pitza.xlsx"
    assert by_id["SID1"]["short"] == "pitza"
    assert by_id["SID1"]["scripts"] == ["Amar__Pitza/Pitza.gs"]
    assert by_id["SID1"]["confirmed"] is False
    assert by_id["SID1"]["departments"] == [] and by_id["SID1"]["reference_tabs"] == []
    assert manifest["branches"] == []


def test_short_falls_back_to_the_nearest_distinguishing_dir_segment(tmp_path):
    """Two `Farangi.xlsx` under two branches, as the estate really has them."""
    root = _estate(tmp_path, books=(
        ("MandeShab__ChaleBagh__Amar__Farangi", "Farangi.xlsx", "SID1"),
        ("MandeShab__Naharkhoran__Amar__Farangi", "Farangi.xlsx", "SID2")))
    manifest = init_manifest(root / "attachments" / "sheets")
    assert sorted(w["short"] for w in manifest["workbooks"]) == [
        "amar_farangi", "farangi"]


def test_short_is_left_empty_rather_than_proposed_twice(tmp_path):
    """Appendix B: `short` is unique and left empty rather than doubled. All
    three dirs mint the same two candidates, so the third has nowhere to go and
    Gate M has to name it."""
    root = _estate(tmp_path, books=(("A Pitza", "Pitza.xlsx", "SID1"),
                                    ("A-Pitza", "Pitza.xlsx", "SID2"),
                                    ("A.Pitza", "Pitza.xlsx", "SID3")))
    manifest = init_manifest(root / "attachments" / "sheets")
    assert sorted(w["short"] for w in manifest["workbooks"]) == [
        "", "a_pitza_pitza", "pitza"]


def test_init_manifest_is_idempotent_and_touches_nothing_confirmed(tmp_path):
    root = _estate(tmp_path)
    sheets = root / "attachments" / "sheets"
    first = init_manifest(sheets)
    first["workbooks"][0].update(confirmed=True, departments=["cooking"],
                                 branches=["chalebagh"], unresolved=[],
                                 reference_tabs=["مواد اولیه"], short="pitza_cb")
    first["branches"] = [{"code": "chalebagh", "name": "چاله‌باغ"}]
    (sheets / "manifest.json").write_text(json.dumps(first, ensure_ascii=False),
                                          encoding="utf-8")

    again = init_manifest(sheets)
    assert again["workbooks"][0] == first["workbooks"][0]
    assert again["branches"] == first["branches"]
    assert len(again["workbooks"]) == len(first["workbooks"])

    make_workbook(sheets / "Amar__Farangi" / "Farangi.xlsx", spreadsheet_id="SID3")
    third = init_manifest(sheets)
    assert len(third["workbooks"]) == len(first["workbooks"]) + 1
    # …against the second pass, not the first: confirming Kanter as cooking is
    # what §2.2 proposes cooking to its sibling Pitza from, so pass 2 is where
    # the fixpoint is. A new workbook must not disturb either row.
    assert third["workbooks"][:len(again["workbooks"])] == again["workbooks"]
    new = third["workbooks"][-1]
    assert new["spreadsheetId"] == "SID3" and new["confirmed"] is False


def test_manifest_reconcile_drops_the_three_kinds_of_wrong_reference_tab():
    """The owner answered the question that was put at Gate M, and the question
    never mentioned that a tab whose only formula is a whole-tab import is an
    edge (QF-48). The row is repaired in place and silently (§2.2)."""
    row = {"spreadsheetId": "SID1", "confirmed": True,
           "reference_tabs": ["SheetsFileIds", "Table_Ingredients_Pizza",
                              "مواد حساس", "پیتزا امریکایی"]}
    dump = {"sheets": {"sheets": []},
            "formulas": [["Table_Ingredients_Pizza", "A1", "", MIRROR_FORMULA,
                          1, "نام", ""],
                         ["مواد حساس", "G6", "", "MINUS(FN,EN)", 1, "10", ""]]}
    issues = manifest_reconcile(row, dump)
    assert row["reference_tabs"] == ["پیتزا امریکایی"]
    assert row["confirmed"] is True             # reconciled, never re-asked
    assert [(i["kind"], i["sheet"]) for i in issues] == [
        ("reference_tab_is_ids", "SheetsFileIds"),
        ("reference_tab_is_mirror", "Table_Ingredients_Pizza"),
        ("reference_tab_computes", "مواد حساس")]
    assert all(i["run_only"] and i["spreadsheetId"] == "SID1" for i in issues)


def test_init_manifest_proposes_the_bom_tab_and_nothing_dated(tmp_path, monkeypatch,
                                                              capsys):
    """§2.2's reference-tab proposal: item codes, no formulas, no date column.
    The line tab carries codes and no formulas too — the date header is the
    only thing that separates a nightly log from a definition table."""
    root = _estate(tmp_path, v3_tabs=True)
    monkeypatch.setenv("DATA_ROOT", str(root))
    assert main(["--init-manifest"]) == 0
    manifest = _json(root / "attachments" / "sheets" / "manifest.json")
    validate("manifest.schema.json", manifest)
    row = next(w for w in manifest["workbooks"] if w["spreadsheetId"] == "SID1")
    assert row["reference_tabs"] == ["پیتزا امریکایی"]
    assert row["departments"] == [] and row["branches"] == []
    assert row["unresolved"] == ["departments", "branches"]
    assert row["confirmed"] is False


def test_the_branch_token_in_the_path_is_proposed(tmp_path, monkeypatch, capsys):
    root = _estate(tmp_path, books=(
        ("MandeShab__ChaleBagh__Amar__Farangi", "Farangi.xlsx", "SID1"),
        ("Sandogh__Sandogh - NaharKhoran", "Sandogh.xlsx", "SID2")))
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    rows = {w["spreadsheetId"]: w for w in
            _json(root / "attachments" / "sheets" / "manifest.json")["workbooks"]}
    assert rows["SID1"]["branches"] == ["chalebagh"]
    assert rows["SID2"]["branches"] == ["naharkhoran"]
    assert "branches" not in rows["SID1"]["unresolved"]


def test_the_department_is_proposed_only_when_the_confirmed_siblings_agree(
        tmp_path, monkeypatch, capsys):
    """The tree does not determine a department — `…__Amar__Kanter` is cooking
    and `…__Amar__Anbar markazi` is warehouse — so agreement is the whole
    test."""
    root = _estate(tmp_path, books=(("Amar__Pitza", "Pitza.xlsx", "SID1"),
                                    ("Amar__Kanter", "Kanter.xlsx", "SID2"),
                                    ("Anbar__Anbar", "Anbar.xlsx", "SID3")))
    sheets = root / "attachments" / "sheets"
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        if workbook["spreadsheetId"] == "SID1":
            workbook.update(departments=["cooking"], branches=["chalebagh"],
                            reference_tabs=[], unresolved=[], confirmed=True)
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    main(["--init-manifest"])
    rows = {w["spreadsheetId"]: w for w in
            _json(sheets / "manifest.json")["workbooks"]}
    assert rows["SID2"]["departments"] == ["cooking"]   # same first segment
    assert rows["SID3"]["departments"] == []            # a different one


def test_a_confirmed_row_keeps_its_answers_and_is_never_re_proposed(
        tmp_path, monkeypatch, capsys):
    """An empty judgement column on a confirmed row is the owner's «none».
    Re-proposing it would send all 28 estate rows back to Gate M."""
    root = _estate(tmp_path, v3_tabs=True)
    sheets = root / "attachments" / "sheets"
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        workbook.update(departments=["cooking"], branches=["chalebagh"],
                        reference_tabs=[], unresolved=[], confirmed=True)
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    main(["--init-manifest"])
    rows = {w["spreadsheetId"]: w for w in
            _json(sheets / "manifest.json")["workbooks"]}
    assert rows["SID1"]["reference_tabs"] == []
    assert rows["SID1"]["unresolved"] == [] and rows["SID1"]["confirmed"] is True


# --------------------------------------------------------------------------
# the CLI


def test_init_manifest_mode_dumps_structure_but_no_rows(tmp_path, monkeypatch, capsys):
    root = _estate(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    assert main(["--init-manifest"]) == 0
    capsys.readouterr()
    dump = root / "attachments" / "sheets" / ".dump"
    for sid in ("SID1", "SID2"):
        for name in ("sheets.json", "formulas.tsv", "names.tsv",
                     "validations.tsv", "cf.tsv", "comments.tsv", "meta.json"):
            assert (dump / sid / name).is_file(), f"{sid}/{name}"
        assert not (dump / sid / "rows.tsv").exists()
    manifest = _json(root / "attachments" / "sheets" / "manifest.json")
    validate("manifest.schema.json", manifest)
    assert sorted(w["spreadsheetId"] for w in manifest["workbooks"]) == ["SID1", "SID2"]


def test_init_manifest_re_dumps_an_already_confirmed_rows_tsv(tmp_path, monkeypatch,
                                                              capsys):
    """A new workbook sends Gate M round again (§3). The `--init-manifest` that
    precedes it must not leave a `rows.tsv` from an older export beside a
    freshly hashed `meta.json` — a confirmed row's tabs are dumped again."""
    root = _estate(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    sheets = root / "attachments" / "sheets"
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        workbook["confirmed"] = True
        workbook["reference_tabs"] = ["مواد اولیه"]
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    main(["--manifest"])
    rows = (sheets / ".dump" / "SID1" / "rows.tsv").read_text(encoding="utf-8")

    make_workbook(sheets / "Amar__Farangi" / "Farangi.xlsx", spreadsheet_id="SID3")
    capsys.readouterr()
    assert main(["--init-manifest"]) == 0
    assert (sheets / ".dump" / "SID1" / "rows.tsv").read_text(encoding="utf-8") == rows
    assert not (sheets / ".dump" / "SID3" / "rows.tsv").exists()   # not confirmed


def test_manifest_mode_dumps_rows_only_for_confirmed_reference_tabs(
        tmp_path, monkeypatch, capsys):
    root = _estate(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    sheets = root / "attachments" / "sheets"
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    for workbook in manifest["workbooks"]:
        workbook["confirmed"] = True
        if workbook["spreadsheetId"] == "SID1":
            workbook["reference_tabs"] = ["مواد اولیه"]
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    capsys.readouterr()
    assert main(["--manifest"]) == 0
    assert (sheets / ".dump" / "SID1" / "rows.tsv").is_file()
    assert not (sheets / ".dump" / "SID2" / "rows.tsv").exists()


def test_manifest_mode_refuses_an_unconfirmed_row(tmp_path, monkeypatch, capsys):
    root = _estate(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    main(["--init-manifest"])
    capsys.readouterr()
    with pytest.raises(SystemExit) as e:
        main(["--manifest"])
    assert e.value.code == 2
    assert "Pitza.xlsx" in capsys.readouterr().err


def test_manifest_mode_refuses_a_workbook_with_no_row(tmp_path, monkeypatch, capsys):
    root = _estate(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    sheets = root / "attachments" / "sheets"
    main(["--init-manifest"])
    manifest = _json(sheets / "manifest.json")
    manifest["workbooks"] = [w for w in manifest["workbooks"]
                             if w["spreadsheetId"] != "SID2"]
    for workbook in manifest["workbooks"]:
        workbook["confirmed"] = True
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    capsys.readouterr()
    with pytest.raises(SystemExit) as e:
        main(["--manifest"])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "Kanter.xlsx" in err and "manifest" in err


def test_the_cli_needs_exactly_one_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_ROOT", str(_estate(tmp_path)))
    with pytest.raises(SystemExit):
        main([])
    with pytest.raises(SystemExit):
        main(["--init-manifest", "--manifest"])
