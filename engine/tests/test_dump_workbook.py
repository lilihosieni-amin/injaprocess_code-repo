"""`dump-workbook` — spec §17's dump-workbook bullet, one test per behaviour.

The fixture in `fixtures/make_workbook.py` is the ground truth for the OOXML
shapes; every element in it was copied from the estate's own export.
"""
import json
import re
import zipfile

import pytest
from dump_workbook import dump_workbook, init_manifest
from dump_workbook.cli import main
from engine_common import validate
from fixtures.make_workbook import DUMMY_SOURCE, LAMBDA_BODY, REFERENCE_ROWS, make_workbook

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


def _estate(tmp_path, books=(("Amar__Pitza", "Pitza.xlsx", "SID1"),
                             ("Amar__Kanter", "Kanter.xlsx", "SID2"))):
    """A DATA_ROOT with `attachments/sheets/{dir}/{file}` for each book."""
    root = tmp_path / "data"
    sheets = root / "attachments" / "sheets"
    for directory, name, sid in books:
        make_workbook(sheets / directory / name, spreadsheet_id=sid)
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


def test_sheets_json_carries_hidden_dimensions_codes_and_the_empty_flag(tmp_path):
    _, out = _dump(tmp_path)
    sheets = {s["name"]: s for s in _json(out / "sheets.json")["sheets"]}
    assert sheets["Refresher"]["hidden"] is True and sheets["Refresher"]["empty"] is True
    assert sheets["آمار"]["hidden"] is False and sheets["آمار"]["empty"] is False
    assert sheets["آمار"]["sheetId"] == 1
    assert sheets["آمار"]["dimension"] == "A1:H7"
    assert sheets["آمار"]["codes"] == ["##RPT-1"]
    assert len(sheets["آمار"]["head"]) == 5


def test_no_plain_cell_of_a_non_reference_tab_reaches_the_dump(tmp_path):
    """QF-1 — with no reference tab confirmed there is no `rows.tsv` at all, and
    a tab\'s cells appear nowhere else. (`sheets.json` keeps the first \u2264 5 rows
    of every tab: Appendix C asks for them, and the header row is found in them.)"""
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


def test_a_tab_not_listed_yields_no_rows_even_when_full_of_numbers(tmp_path):
    _, out = _dump(tmp_path, reference_tabs=["مواد اولیه"])
    text = (out / "rows.tsv").read_text(encoding="utf-8")
    assert "شمارش" not in text and "933" not in text


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
                                 branches=["chalebagh"],
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
    assert third["workbooks"][:len(first["workbooks"])] == first["workbooks"]
    new = third["workbooks"][-1]
    assert new["spreadsheetId"] == "SID3" and new["confirmed"] is False


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
