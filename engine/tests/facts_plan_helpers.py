"""The synthetic estate T12–T15 share — T10's mini estate plus `gozareshat`.

`fixtures/facts_plan/make_dump.py` writes five workbooks whose tabs become
templates; the edge, context and library tests need a sixth that becomes almost
none of that: a workbook that *mirrors* other tabs, holds the ids tab those
mirrors resolve through, and carries the colour rules, the cell comment and the
«نیازمندیها و مشکلات» rows §2.3 calls context.

Dumps, not spreadsheets, and `load_estate` is the one loader (T10): this writes
the dump files beside T10's and hands back what `load_estate` reads.
"""
import json

from facts_plan.build import load_estate
from fixtures.facts_plan.make_dump import _sheet, _tsv, make_estate

SID = "SGOZ"

# Two whole-tab mirrors that resolve, one that does not, and a tab copied cell
# by cell — the four cases §2.3's import-edge row names.
MIRROR_PITZA = (r'LET(\nsheetName,"پیتزا",\ndataRange,"A:D",'
                r"\nIMPORT_FROM_SHEET(SheetsFileId_Pitza,sheetName,dataRange)\n)")
MIRROR_BOM = (r'LET(\nsheetName,"مواد",\ndataRange,"A:D",'
              r"\nIMPORT_FROM_SHEET(SheetsFileId_Bom,sheetName,dataRange)\n)")
MIRROR_ORPHAN = 'IMPORT_FROM_SHEET(SheetsFileId_Nowhere,"x","A:B")'

TABS = [
    (1, "Table_Pitza", [["نام", "تاریخ", "روز", "موجودی اول شب"]], 1, None),
    (2, "مغایرت", [["نام", "کسری", "تلورانس"],
                   ["پنیر پیتزا ##1", "0", "0"]], 1, None),
    (3, "Prep-Waste", [["نام", "ضایعات"], ["پنیر پیتزا ##1", "0"]], 1, None),
    (4, "Table_Orphan", [["x", "y"], ["1", "2"]], 1, None),
    (5, "SheetsFileIds", [["Range Name Associated", "Sheets File Id"],
                          ["SheetsFileId_Pitza", "SPCH"]], 1, None),
    (6, "نیازمندیها و مشکلات", [["مشکل", "توضیح"],
                                ["ترازو خراب است", "لاین سوخاری"]], 1, None),
    (7, "کپی سلولی", [["الف", "ب"], ["1", "2"]], 1, None),
    (8, "خلاصه ماهانه", [["ماه", "مجموع"], ["مرداد", "0"]], 1, None),
]

FORMULAS = [
    ["Table_Pitza", "A1", "", MIRROR_PITZA, 1, "نام", ""],
    # Two consumers of the same mirror, one through the tab's own `Table_*`
    # identifier and one through a defined name, so both halves of
    # `mirror_names` are exercised; the first also carries the date logic
    # `leading_offset` waits for.
    ["مغایرت", "F6:F19", "1", "FILTER_BY_DATE(Table_Pitza,date)", 14, "0", ""],
    ["خلاصه ماهانه", "B2", "", "SUM(Pitza_Copy)", 1, "0", ""],
    ["Prep-Waste", "A1", "", MIRROR_BOM, 1, "نام", ""],
    ["Table_Orphan", "A1", "", MIRROR_ORPHAN, 1, "", ""],
    ["کپی سلولی", "B2", "", 'IMPORT_FROM_SHEET(SheetsFileId_Bom,"مواد","A:A")',
     1, "", ""],
    ["کپی سلولی", "B3", "", 'IMPORT_FROM_SHEET(SheetsFileId_Bom,"مواد","B:B")',
     1, "", ""],
]

NAMES = [
    ["Pitza_Copy", "workbook", "Table_Pitza!$A:$D"],
    ["Prep_Waste_Table", "workbook", "'Prep-Waste'!$A:$E"],
    ["SheetsFileId_Pitza", "workbook", "SheetsFileIds!$B$2"],
    ["SheetsFileId_Bom", "workbook", "SheetsFileIds!$B$3"],
    # The same body as `SPCH`'s, spelled with one more space: one section, two
    # definers.
    ["CONVERT_GR_TO_KG", "workbook", "LAMBDA(weight,  DIVIDE(weight,1000))"],
    ["FILTER_BY_DATE", "workbook",
     "LAMBDA(data, date, FILTER(data, INDEX(data,,1) = date))"],
]

ROWS = (["sheet", "row", "Range Name Associated", "Sheets File Id"],
        [["SheetsFileIds", 2, "SheetsFileId_Pitza", "SPCH"],
         ["SheetsFileIds", 3, "SheetsFileId_Bom", "SBOM"]])

CF = [
    ["مغایرت", "G6:G18", "cellIs greaterThan", "0", "color=FFFF0000"],
    ["مغایرت", "K6:K19", "cellIs greaterThan", "140", "color=FFFF0000"],
    ["مغایرت", "L6:L19", "cellIs greaterThan", "12", ""],
    ["مغایرت", "M6:M19", 'containsText containsText "کسری"',
     'NOT(ISERROR(SEARCH(("کسری"),(M6))))', "fill=FFFFFF00"],
]

COMMENTS = [["مغایرت", "F6", "unknown", "تلورانس ۵ گرم برای هر پرس"]]

# All three tabs `manifest_reconcile` takes back out of a confirmed row: one
# that computes, the ids tab, and a mirror.
ROW = {"spreadsheetId": SID, "short": "gozareshat", "departments": ["cooking"],
       "branches": ["chalebagh", "naharkhoran"],
       "reference_tabs": ["مغایرت", "SheetsFileIds", "Table_Orphan"],
       "confirmed": True, "unresolved": [], "dir": "Gozareshat",
       "file": "Gozareshat.xlsx", "scripts": []}


def _add_gozareshat(sheets_root):
    dump = sheets_root / ".dump" / SID
    dump.mkdir(parents=True, exist_ok=True)
    (dump / "sheets.json").write_text(json.dumps(
        {"schema_version": 1, "spreadsheetId": SID, "sheet_count": len(TABS),
         "sheets": [_sheet(*tab) for tab in TABS]},
        ensure_ascii=False), encoding="utf-8")
    _tsv(dump / "formulas.tsv",
         ["sheet", "range", "group", "formula", "count", "cached", "error"],
         FORMULAS)
    _tsv(dump / "names.tsv", ["name", "scope", "formula"], NAMES)
    _tsv(dump / "validations.tsv", ["sheet", "range", "type", "values"], [])
    _tsv(dump / "rows.tsv", *ROWS)
    _tsv(dump / "cf.tsv", ["sheet", "range", "type", "formula", "format"], CF)
    _tsv(dump / "comments.tsv", ["sheet", "cell", "author", "text"], COMMENTS)
    (dump / "meta.json").write_text(json.dumps(
        {"schema_version": 1, "spreadsheetId": SID, "file": ROW["file"],
         "sheet_count": len(TABS)}, ensure_ascii=False), encoding="utf-8")
    path = sheets_root / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["workbooks"].append(dict(ROW))
    path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")


def estate(root):
    """The mini estate plus `gozareshat`, as `load_estate` hands it back."""
    _add_gozareshat(make_estate(root))
    return load_estate(root)
