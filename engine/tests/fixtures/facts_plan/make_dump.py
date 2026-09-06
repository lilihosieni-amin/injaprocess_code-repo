"""A five-workbook mini estate in the shape `facts-plan build` reads.

Not an `.xlsx` in sight: `build` reads *dumps*, so this writes the dump
directly — `manifest.json`, one `.dump/<spreadsheetId>/` per workbook, and the
one `.gs` the manifest names. Every shape here was copied from the real estate
so what the tests assert is what cooking actually contains:

* two branch twins of one tab (`گزارش مرکزی` and `گزارش ناهارخوران` hold the
  same `پیتزا`), which must become one template with two instances;
* an offset twin (`کانتر`'s two copies sit two columns apart), which must
  become one template whose `fields[].columns` differ per instance;
* two tabs in **one** spreadsheet whose names fold together, which must stay
  two templates;
* a code list that is a non-empty subset of another (`آمار`), which groups —
  beside one whose header carries no code at all, which does not;
* a reference tab (`مواد`, the BOM) with its rows and a blank cell;
* a mirror tab (one `IMPORT_FROM_SHEET` at A1) and an ids tab
  (`SheetsFileIDs`), which produce no template at all.
"""
import json
import pathlib
import re

DEPARTMENT = "cooking"
_CODE = re.compile(r"#{1,2}[0-9]+")

PITZA_HEAD = [
    ["", "", "", "", "", "", "", "", "", ""],
    ["", "تاریخ", "", "پیتزا\n(تمام وزن ها به کیلوگرم است)",
     "", "", "", "", "", ""],
    ["", "روز", "ماه", "", "", "", "", "", "", ""],
    ["", "29", "مرداد", "", "", "", "", "", "", ""],
    ["", "", "", "موجودی اول شب", "موجودی آخر شب", "مصرف اعلامی",
     "مصرف واقعی", "انحراف", "تعداد فروش", "انحراف (با تلورانس)"],
    ["پنیر پیتزا ##1", "", "", "0", "0", "0.05", "52.93", "52.88", "315", "51.305"],
    ["خمیر پیتزا ##26", "", "", "0", "0", "0.002", "4.175", "4.17", "45", "3.588"],
    ["سس گوجه ##33", "", "", "0", "0", "0.009", "8.72", "8.71", "116", "8.246"],
]
PITZA_LABELS = {"6": "پنیر پیتزا ##1", "7": "خمیر پیتزا ##26", "8": "سس گوجه ##33"}
ACTUAL_USE = (
    r'LET(\ningredientId, {id},\namFoodIds, {{71, 309}},\namTotal, '
    r'getTotalFoodsIngredient(amFoodIds,ingredientId,SalesData,'
    r'"Table_Ingredients_Pizza",Refresher),\nCONVERT_GR_TO_KG(amTotal)\n)')
TOLERANCE_PER_FOOD = (
    r"LET(\ntolerancePerFoodGr, 5,\ntelorancKg, CONVERT_GR_TO_KG(IN * "
    r"tolerancePerFoodGr),\nMINUS(HN , telorancKg)\n)")
TOLERANCE_PER_KG = (
    r"LET(\ntolerancePerKilogramGr, 140,\nteloranc, MULTIPLY("
    r"tolerancePerKilogramGr,GN),\ntelorancKg, CONVERT_GR_TO_KG(teloranc),"
    r"\nMINUS(HN , telorancKg)\n)")
# A real slip the estate is entitled to hold: one `LET` binding a name twice.
# `normalise` refuses it, so the column is reported and mints nothing.
REBOUND_LET = r"LET(\nteloranc, 1,\nteloranc, 2,\nMINUS(DN , teloranc)\n)"
MIRROR = (r'LET(\nsheetName, "مواد",\ndataRange,"A:D",'
          r'\nIMPORT_FROM_SHEET(SheetsFileId_Bom,sheetName,dataRange)\n)')

SCRIPT = """\
function getTotalFoodsIngredient(foodIds, ingredientId, salesData, namedRange) {
  var table = SpreadsheetApp.getActiveSpreadsheet()
      .getRangeByName(namedRange).getValues();
  var total = 0;
  for (var i = 0; i < foodIds.length; i++) { total = total + table[i][1]; }
  return total;
}

function getWeekDayCoefficient(day) {
  if (day == 5 || day == 6) { return 1.3; }
  return 1;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Actions').addToUi();
}
"""

# (short, spreadsheetId, dir, file, branches, reference_tabs, scripts)
WORKBOOKS = [
    ("mini_pitza_ch", "SPCH", "Mini__Pitza - Chalebagh", "Pitza - Chalebagh.xlsx",
     ["chalebagh"], [], ["Mini__Pitza - Chalebagh/Pitza - Chalebagh.gs"]),
    ("mini_pitza_nk", "SPNK", "Mini__Pitza - NaharKhoran",
     "Pitza - NaharKhoran.xlsx", ["naharkhoran"], [], []),
    ("mini_kanter_ch", "SKCH", "Mini__Kanter - Chalebagh",
     "Kanter - Chalebagh.xlsx", ["chalebagh"], [], []),
    ("mini_kanter_nk", "SKNK", "Mini__Kanter - NaharKhoran",
     "Kanter - NaharKhoran.xlsx", ["naharkhoran"], [], []),
    ("mini_bom", "SBOM", "Mini__Bom", "Bom.xlsx",
     ["chalebagh", "naharkhoran"], ["مواد"], []),
]

# spreadsheetId -> [(sheetId, name, head, header_row, row_labels)]
TABS = {
    "SPCH": [
        (1, "پیتزا", PITZA_HEAD, 5, PITZA_LABELS),
        (2, "Table_Bom", [["نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26",
                           "سس گوجه ##33"]], 1, None),
        (3, "SheetsFileIDs", [["Range Name Associated", "Sheets File Id"],
                              ["SheetsFileId_Bom", "SBOM"]], 1, None),
        (4, "شمارش چاله‌باغ", [["نام", "پنیر پیتزا میکس ##1"]], 1, None),
        (5, "شمارش ناهارخوران", [["نام", "پنیر پیتزا میکس ##1"]], 1, None),
    ],
    "SPNK": [(1, "پیتزا", PITZA_HEAD, 5, PITZA_LABELS)],
    "SKCH": [
        (1, "کانتر", [["نام", "موجودی اول شب", "موجودی آخر شب", "کسری"],
                      ["پنیر پیتزا ##1", "1", "1", "0"]], 1, None),
        (2, "آمار", [["نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26"]], 1, None),
    ],
    "SKNK": [
        (1, "کانتر", [["", "", "نام", "موجودی اول شب", "موجودی آخر شب", "کسری"],
                      ["", "", "پنیر پیتزا ##1", "1", "1", "0"]], 1, None),
        (2, "آمار", [["نام", "پنیر پیتزا ##1"]], 1, None),
    ],
    "SBOM": [
        (1, "مواد", [["نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26",
                      "سس گوجه ##33"]], 1, None),
        (2, "آمار", [["نام", "تعداد"]], 1, None),
    ],
}

# spreadsheetId -> formulas.tsv body rows (sheet, range, group, formula,
# count, cached, error)
FORMULAS = {
    "SPCH": [
        ["پیتزا", "B4", "", r"'تاریخ'!CN", 1, "29", ""],
        ["پیتزا", "C4", "", r"'تاریخ'!DN", 1, "مرداد", ""],
        ["پیتزا", "E6", "", REBOUND_LET, 1, "0", ""],
        ["پیتزا", "F6:F8", "1", "MINUS(DN,EN)", 3, "0.05", ""],
        ["پیتزا", "G6", "", ACTUAL_USE.format(id=1), 1, "52.93", ""],
        ["پیتزا", "G7", "", ACTUAL_USE.format(id=26), 1, "4.175", ""],
        ["پیتزا", "G8", "", ACTUAL_USE.format(id=33), 1, "8.72", ""],
        ["پیتزا", "H6:H8", "2", "MINUS(GN,FN)", 3, "52.88", ""],
        ["پیتزا", "J6", "", TOLERANCE_PER_FOOD, 1, "51.305", ""],
        ["پیتزا", "J7", "", TOLERANCE_PER_KG, 1, "3.588", ""],
        ["پیتزا", "J8", "", "HN", 1, "8.71", ""],
        ["Table_Bom", "A1", "", MIRROR, 1, "نام", ""],
    ],
    "SPNK": [
        ["پیتزا", "F6:F8", "1", "MINUS(DN,EN)", 3, "0.04", ""],
        ["پیتزا", "G6", "", ACTUAL_USE.format(id=1), 1, "40.1", ""],
        ["پیتزا", "H6:H8", "2", "MINUS(GN,FN)", 3, "39.9", ""],
        ["پیتزا", "J6", "", TOLERANCE_PER_FOOD, 1, "38.0", ""],
        ["پیتزا", "J7:J8", "3", "ROUND(DIVIDE(HN,IN),3)", 2, "#NUM!", "#NUM!"],
    ],
    "SKCH": [["کانتر", "D2:D2", "1", "MINUS(BN,CN)", 1, "0.1", ""]],
    "SKNK": [["کانتر", "F2:F2", "1", "MINUS(DN,EN)", 1, "0.2", "#NAME?"]],
    "SBOM": [],
}

# spreadsheetId -> (rows.tsv columns, rows)
ROWS = {
    "SPCH": (["sheet", "row", "Range Name Associated", "Sheets File Id"],
             [["SheetsFileIDs", 2, "SheetsFileId_Bom", "SBOM"]]),
    "SBOM": (["sheet", "row", "نام", "پنیر پیتزا ##1", "خمیر پیتزا ##26",
              "سس گوجه ##33"],
             [["مواد", 2, "پیتزا آمریکایی #71", "215", "260", ""],
              ["مواد", 3, "پیتزا ایتالیایی #61", "180", "", "45"]]),
}

NAMES = {
    "SPCH": [["Table_Bom", "workbook", "Table_Bom!$A:$D"],
             ["SheetsFileId_Bom", "workbook", "SheetsFileIDs!$B$2"],
             ["CONVERT_GR_TO_KG", "workbook", "LAMBDA(weight, DIVIDE(weight,1000))"],
             ["IMPORT_FROM_SHEET", "workbook",
              'LAMBDA(id, name, range, IMPORTRANGE("https://x/" & id, '
              'name & "!" & range))']],
}

# The two twins disagree on one column's list, so the intersection is what the
# template keeps and the difference is a `cross_record` issue.
VALIDATIONS = {
    "SPCH": [["پیتزا", "I6:I8", "list", '"0,1,2"']],
    "SPNK": [["پیتزا", "I6:I8", "list", '"0,1"']],
}


def _tsv(path, header, rows):
    lines = ["\t".join(header)]
    lines += ["\t".join(str(v) for v in row) for row in rows]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _sheet(sheet_id, name, head, header_row, row_labels):
    width = max(len(r) for r in head)
    codes = []
    for row in head:
        for cell in row:
            codes += [c for c in _CODE.findall(cell) if c not in codes]
    sheet = {"sheetId": sheet_id, "name": name, "hidden": False,
             "dimension": f"A1:{chr(64 + width)}{len(head)}",
             # `dump_workbook` writes the tab's own `max_row` here, not the
             # head's height: a head is trimmed to `header_row + 4`, and every
             # tab modelled below carries at least one row under its header.
             "rows": max(len(head), (header_row or 0) + 1),
             "cols": width, "head": head,
             "header_row": header_row, "codes": codes, "empty": False}
    if row_labels:
        sheet["row_labels"] = row_labels
    return sheet


def make_estate(root):
    """Write the mini estate under `root/attachments/sheets/`."""
    sheets_root = pathlib.Path(root) / "attachments" / "sheets"
    workbooks = []
    for short, sid, directory, filename, branches, reference, scripts in WORKBOOKS:
        workbooks.append({"spreadsheetId": sid, "short": short,
                          "departments": [DEPARTMENT], "branches": branches,
                          "reference_tabs": reference, "confirmed": True,
                          "unresolved": [], "dir": directory, "file": filename,
                          "scripts": scripts})
        dump = sheets_root / ".dump" / sid
        dump.mkdir(parents=True, exist_ok=True)
        (dump / "sheets.json").write_text(json.dumps(
            {"schema_version": 1, "spreadsheetId": sid,
             "sheet_count": len(TABS[sid]),
             "sheets": [_sheet(*tab) for tab in TABS[sid]]},
            ensure_ascii=False), encoding="utf-8")
        _tsv(dump / "formulas.tsv",
             ["sheet", "range", "group", "formula", "count", "cached", "error"],
             FORMULAS[sid])
        _tsv(dump / "names.tsv", ["name", "scope", "formula"], NAMES.get(sid, []))
        _tsv(dump / "validations.tsv", ["sheet", "range", "type", "values"],
             VALIDATIONS.get(sid, []))
        if sid in ROWS:
            _tsv(dump / "rows.tsv", *ROWS[sid])
        for script in scripts:
            path = sheets_root / script
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(SCRIPT, encoding="utf-8")
    sheets_root.mkdir(parents=True, exist_ok=True)
    (sheets_root / "manifest.json").write_text(json.dumps(
        {"schema_version": 2,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"},
                      {"code": "naharkhoran", "name": "ناهارخوران"}],
         "workbooks": workbooks}, ensure_ascii=False), encoding="utf-8")
    return sheets_root
