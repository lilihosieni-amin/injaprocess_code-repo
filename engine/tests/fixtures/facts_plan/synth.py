"""One estate per seed, in the shape `facts-plan build` reads (spec §3.3).

`make_dump.py` writes ONE estate — cooking's, copied cell for cell, so what the
tests assert is what cooking contains. This writes a DIFFERENT one per seed, in
the same dump format and with none of cooking's conventions: other branches,
other code namespaces, other placeholder headers, header rows anywhere in the
first six, Latin tab names beside Persian ones, empty and hidden tabs, mirrors
that resolve and mirrors that do not, reference tabs with and without codes, a
branch twin, and a workbook of a department this run is not planning.

Everything is drawn from `random.Random(seed)` and nothing else, so seed 7 is
the same estate on every machine and in every run.

Two things are held fixed on purpose, because the property (I4/I5) is about the
engine's shapes and not about the stand-in unit's completeness:

* `facts/records.json` always declares `kg` — `preflight._minimal` writes it as
  every item's unit, and a symbol the run never declared is a lint refusal that
  says nothing about the estate;
* workbook 0 is Persian-named and computes nothing, so its unit's bare `keep`
  is a document the gate passes whole and `assemble` always has something to
  assemble. Every other workbook is free to be as awkward as the draw makes it.
"""
import json
import pathlib
import random

from dump_workbook import _codes
from fixtures.facts_plan.make_dump import (SCRIPT, _sheet, _tsv,
                                           make_attachments)
from merge_facts.conventions import from_manifest

BRANCHES = [("chalebagh", "چاله‌باغ"), ("naharkhoran", "ناهارخوران"),
            ("markazi", "مرکزی"), ("shomali", "شمالی"), ("jonubi", "جنوبی")]

DEPARTMENTS = [("cooking", "آشپزخانه"), ("bar", "بار"), ("store", "انبار"),
               ("service", "سالن"), ("bakery", "نانوایی"), ("grill", "کباب‌پز")]

#: `code_namespaces` a manifest may declare — cooking's, and four estates that
#: never heard of `#`.
NAMESPACES = [{"##": "ing", "#": "food"}, {"@": "sku"},
              {"§": "art", "§§": "grp"}, {"#": "item"}, {"~": "mat"}]

#: `placeholder_header` and a text that matches it — the header a dumper writes
#: over a column whose own title is blank.
PLACEHOLDERS = [("^Column [0-9]+$", "Column {}"), ("^ستون [0-9]+$", "ستون {}"),
                ("^col[0-9]+$", "col{}")]
_SAMPLE = dict(PLACEHOLDERS)

FA_TABS = ["پیتزا", "کانتر", "انبار روزانه", "ضایعات", "شمارش شب", "خرید",
           "فروش", "آمار", "گزارش روزانه", "مواد اولیه"]
LAT_TABS = ["Report", "Summary", "Stock", "DailyLog", "Waste", "Counter"]
FA_TITLES = ["نام", "موجودی اول شب", "موجودی آخر شب", "مصرف اعلامی",
             "مصرف واقعی", "انحراف", "تعداد فروش", "قیمت", "واحد", "توضیح",
             "کسری", "تلورانس"]
FA_ITEMS = ["پنیر پیتزا", "خمیر", "سس گوجه", "روغن", "آرد", "شکر", "نمک",
            "مرغ", "گوشت چرخ‌کرده", "قارچ"]
SHORTS = ["pitza", "kanter", "anbar", "amar", "gozaresh", "kharid", "forush"]

#: The store's unit symbols, as `facts/records.json` carries them. `kg` and `g`
#: are always in the drawn set (see the module docstring).
SYMBOLS = [("kg", "mass", 1000, "کیلوگرم"), ("g", "mass", 1, "گرم"),
           ("l", "volume", 1000, "لیتر"), ("ml", "volume", 1, "میلی‌لیتر"),
           ("pcs", "count", 1, "عدد"), ("portion", "count", 1, "پرس"),
           ("pack", "pack", None, "بسته"), ("percent", "dimensionless", 0.01,
                                            "درصد")]

MIRROR = (r'LET(\nsheetName, "{tab}",\ndataRange,"A:D",'
          r"\nIMPORT_FROM_SHEET({name},sheetName,dataRange)\n)")
IMPORT_LAMBDA = ('LAMBDA(id, name, range, IMPORTRANGE("https://x/" & id, '
                 'name & "!" & range))')
KG_LAMBDA = "LAMBDA(weight, DIVIDE(weight,1000))"
FILTER_LAMBDA = "LAMBDA(data, date, FILTER(data, INDEX(data,,1) = date))"
ERRORS = ["", "", "", "#N/A", "#REF!", "#NAME?"]

FORMULA_COLUMNS = ["sheet", "range", "group", "formula", "count", "cached",
                   "error"]


def _letters(col):
    """1 → `A`, 27 → `AA` — a column letter, as a dump spells a range."""
    out = ""
    while col:
        col, rest = divmod(col - 1, 26)
        out = chr(65 + rest) + out
    return out


def _conventions(rnd):
    """A `conventions` object the manifest declares — sometimes empty, so the
    engine's own defaults are exercised too."""
    if rnd.random() < 0.2:
        return {}
    out = {"code_namespaces": rnd.choice(NAMESPACES)}
    if rnd.random() < 0.6:
        out["placeholder_header"] = rnd.choice(PLACEHOLDERS)[0]
    return out


def _head(rnd, conv, *, persian, codes, placeholder):
    """`(head grid, header row index, row labels)` — a tab's first rows as the
    dumper trims them: whatever sits above the header, the header, and the two
    rows under it."""
    index = rnd.randint(1, 6)
    # One draw in eight is a tab far wider than a card comfortably prints —
    # that is the candidate `split_unit` has to set aside rather than stop on.
    width = rnd.randint(20, 40) if rnd.random() < 0.12 else rnd.randint(2, 6)
    grid = [[""] * width for _ in range(index - 1)]
    if index > 2 and rnd.random() < 0.5:            # a date block over the head
        grid[index - 2] = (["", "تاریخ", "روز"] + [""] * width)[:width]
        if index > 3:
            grid[index - 3] = (["", "29", rnd.choice(conv.month_names)]
                               + [""] * width)[:width]
    namespace = conv.item_namespace
    others = sorted(set(conv.code_namespaces) - {namespace}) or [namespace]
    header = ["نام" if persian else "Name"]
    for col in range(2, width + 1):
        draw = rnd.random()
        if placeholder and draw < 0.2:
            header.append(placeholder.format(col))
        elif codes and namespace and draw < 0.55:
            # An estate that declares two namespaces prints both: the item list
            # down one tab, the dish list across another.
            ns = namespace if rnd.random() < 0.7 else rnd.choice(others)
            header.append(f"{rnd.choice(FA_ITEMS)} {ns}{rnd.randint(1, 99)}")
        elif draw < 0.65 and col > 2:
            # A column the tab heads exactly like an earlier one, and a column
            # it heads not at all — both sit in the real estate, and both are
            # a field the planner has to place or refuse by itself.
            header.append(header[-1] if rnd.random() < 0.5 else "")
        elif persian:
            header.append(rnd.choice(FA_TITLES))
        else:
            header.append(rnd.choice(["Qty", "Price", "Waste", "Count"]))
    if rnd.random() < 0.08:
        # A header cell somebody pasted a paragraph into. One rendered line is
        # bounded at 1,900 characters, so this is the candidate no unit can be
        # split small enough to hold — `_set_aside`'s own case (I5).
        header[-1] = "توضیحات " + "شرح این ستون و نحوهٔ پر کردن آن. " * 80
    grid.append(header)
    labels = {}
    # A tab that heads its columns and holds nothing under them: no instance,
    # and no candidate. It must cost the run nothing at all.
    for n in range(0 if rnd.random() < 0.1 else rnd.randint(1, 2)):
        label = rnd.choice(FA_ITEMS)
        if codes and namespace and rnd.random() < 0.5:
            label = f"{label} {namespace}{rnd.randint(1, 99)}"
        labels[str(index + 1 + n)] = label
        grid.append([label] + [str(rnd.randint(0, 90)) for _ in range(width - 1)])
    return grid, index, (labels if rnd.random() < 0.5 else None)


def _tab(rnd, conv, n, name, *, persian, codes, placeholder, formulas):
    """One `sheets.json` entry, the `formulas.tsv` rows under it and the
    `validations.tsv` rows beside it."""
    kind = rnd.random()
    if kind < 0.12:                                  # a tab nobody ever filled
        return {"sheetId": n, "name": name, "hidden": rnd.random() < 0.3,
                "dimension": "", "rows": 0, "cols": 0, "head": [],
                "header_row": None, "codes": [], "empty": True}, [], []
    grid, index, labels = _head(rnd, conv, persian=persian, codes=codes,
                                placeholder=placeholder)
    sheet = _sheet(n, name, grid, index, labels)
    sheet["hidden"] = rnd.random() < 0.15
    sheet["codes"] = _codes(grid, conv)
    rows = []
    if formulas:
        first, last = index + 1, len(grid)
        for col in range(2, len(grid[index - 1]) + 1):
            if rnd.random() > 0.35:
                continue
            letter, error = _letters(col), rnd.choice(ERRORS)
            rows.append([name, f"{letter}{first}:{letter}{last}", str(col),
                         rnd.choice(["MINUS(BN,CN)", "SUM(BN:CN)",
                                     "ROUND(DIVIDE(BN,CN),3)",
                                     "CONVERT_GR_TO_KG(MINUS(BN,CN))"]),
                         last - first + 1,
                         error or str(rnd.randint(0, 9)), error])
    validations = []
    if len(grid) > index and rnd.random() < 0.3:
        letter = _letters(rnd.randint(2, len(grid[index - 1])))
        validations.append([name, f"{letter}{index + 1}:{letter}{len(grid)}",
                            "list", '"0,1,2"'])
    return sheet, rows, validations


def _mirror_tab(n, name, target_tab, target_name):
    """A tab that is one `IMPORT_FROM_SHEET` at A1 — an edge between two
    records, never a record itself."""
    sheet = _sheet(n, name, [["نام", "مقدار"]], 1, None)
    return sheet, [[name, "A1", "",
                    MIRROR.format(tab=target_tab, name=target_name), 1, "نام",
                    ""]]


def _units_record(rnd):
    """`facts/records.json` — the estate's `units` table, whole enough that the
    store `apply` would write still validates."""
    drawn = SYMBOLS[:2] + rnd.sample(SYMBOLS[2:], rnd.randint(1, 4))
    return {"schema_version": 2, "entries": [{
        "id": "F-00001", "kind": "record", "key": "units", "title": "واحدها",
        "statement": "جدول واحدها — نماد، بُعد و ضریب تبدیل به واحد پایه.",
        "scope": {"departments": [], "branches": []},
        "source": [{"type": "chat", "ref": None, "hash": None,
                    "run": "runs/facts/seed/00000000-000000"}],
        "retired": False, "valid_from": None, "valid_to": None,
        "status": "unknown", "updated_at": "2026-09-08T00:00:00Z",
        "data": {"medium": "native", "role": "config", "location": {},
                 "primaryKey": ["symbol"],
                 "fields": [{"key": "symbol", "title": "نماد", "type": "string"},
                            {"key": "dimension", "title": "بُعد", "type": "string"},
                            {"key": "factor_to_base", "title": "ضریب",
                             "type": "number"},
                            {"key": "unit_title", "title": "عنوان",
                             "type": "string"}],
                 "rows": [{"key": s, "symbol": s, "dimension": d,
                           "factor_to_base": f, "unit_title": t}
                          for s, d, f, t in drawn]}}]}


def _write_dump(dump, sheets, formulas, names, rows, validations):
    dump.mkdir(parents=True, exist_ok=True)
    (dump / "sheets.json").write_text(json.dumps(
        {"schema_version": 1, "spreadsheetId": dump.name,
         "sheet_count": len(sheets), "sheets": sheets}, ensure_ascii=False),
        encoding="utf-8")
    _tsv(dump / "formulas.tsv", FORMULA_COLUMNS, formulas)
    _tsv(dump / "names.tsv", ["name", "scope", "formula"], names)
    _tsv(dump / "validations.tsv", ["sheet", "range", "type", "values"],
         validations)
    if rows:
        header = ["sheet", "row"] + sorted({t for _s, _r, cells in rows
                                            for t in cells})
        _tsv(dump / "rows.tsv", header,
             [[sheet, row] + [cells.get(t, "") for t in header[2:]]
              for sheet, row, cells in rows])


def synth_estate(root, seed, *, departments=1, workbooks=3, conventions=None):
    """Write a whole estate under `root` and return what was written.

    `conventions` defaults to a set drawn from the seed (sometimes the engine's
    own); pass a dict to pin one, or `{}` for the defaults alone.
    """
    rnd = random.Random(seed)
    root = pathlib.Path(root)
    depts = rnd.sample(DEPARTMENTS, departments + 1)
    department = depts[0][0]
    branches = rnd.sample(BRANCHES, rnd.randint(1, 3))
    if conventions is None:
        conventions = _conventions(rnd)
    manifest = {"schema_version": 2,
                "branches": [{"code": c, "name": n} for c, n in branches],
                "conventions": conventions, "workbooks": []}
    conv = from_manifest(manifest)
    placeholder = _SAMPLE.get(conv.placeholder.pattern)

    shorts = rnd.sample(SHORTS, min(workbooks + 2, len(SHORTS)))
    written = []
    # Workbook 0 computes nothing and is named in Persian throughout — the one
    # unit whose bare `keep` the gate is sure to pass whole (see the docstring).
    plan = [{"short": shorts[0], "dept": department,
             "branch": [branches[0][0]], "persian": True, "formulas": False,
             "reference": False, "mirror": False}]
    for i in range(1, workbooks):
        # A book of one branch, of both, or of none — an instance's `branch` is
        # the single one or nothing, and both halves are planned.
        plan.append({"short": shorts[i % len(shorts)], "dept": department,
                     "branch": rnd.sample([c for c, _ in branches],
                                          rnd.randint(0, len(branches))),
                     "persian": rnd.random() < 0.7, "formulas": True,
                     "reference": rnd.random() < 0.35,
                     "mirror": rnd.random() < 0.4})
    # The twin: workbook 0's tabs again, another branch, another book — one
    # template with two instances, which is what `plan_units` pairs into a unit.
    twin = dict(plan[0], short=f"{shorts[0]}_twin",
                branch=[branches[min(1, len(branches) - 1)][0]], twin_of=0)
    plan.append(twin)
    for code, _name in depts[1:]:
        plan.append({"short": shorts[-1], "dept": code,
                     "branch": [branches[0][0]], "persian": rnd.random() < 0.5,
                     "formulas": True, "reference": False, "mirror": False})

    heads = {}
    for i, book in enumerate(plan):
        sid = f"S{i:03d}"
        sheets, formulas, names, rows, validations = [], [], [], [], []
        reference_tabs = []
        if "twin_of" in book:
            # Same tab names and the same header texts, two columns over: the
            # twin is a copy of a book, never a copy of a dump.
            for sheet in heads[book["twin_of"]]:
                if not sheet["head"]:
                    sheets.append(dict(sheet))
                    continue
                grid = [[""] * 2 + row for row in sheet["head"]]
                copy = _sheet(sheet["sheetId"], sheet["name"], grid,
                              sheet["header_row"],
                              None if rnd.random() < 0.3
                              else dict(sheet.get("row_labels") or {}))
                copy["codes"] = sheet["codes"]
                sheets.append(copy)
        else:
            names_pool = FA_TABS if book["persian"] else LAT_TABS
            for n, name in enumerate(rnd.sample(names_pool,
                                                rnd.randint(1, 6)), start=1):
                sheet, tab_formulas, tab_validations = _tab(
                    rnd, conv, n, name, persian=book["persian"],
                    codes=rnd.random() < 0.6, placeholder=placeholder,
                    formulas=book["formulas"])
                sheets.append(sheet)
                formulas += tab_formulas
                validations += tab_validations
            names.append(["CONVERT_GR_TO_KG", "workbook", KG_LAMBDA])
            if rnd.random() < 0.4:
                # A tab a defined name reads as a table — the estate's own
                # `Table_` prefix, whatever the manifest spells it.
                table = f"{conv.table_prefix}Src"
                sheets.append(_sheet(len(sheets) + 1, table,
                                     [["نام", "مقدار"], ["پنیر", "1"]], 1, None))
                names.append([table, "workbook", f"{table}!$A:$B"])
            if book["reference"]:
                # A definition table: its rows live in `rows.tsv`, and half the
                # draws give them no code at all — a reference tab whose rows
                # key on nothing is a shape the engine has to survive.
                tab = sheets[0]
                header = tab["head"][tab["header_row"] - 1] if tab["head"] else []
                titles = [t for t in header if t]
                if titles:
                    reference_tabs = [tab["name"]]
                    coded = rnd.random() < 0.5 and conv.item_namespace
                    for r in range(2, rnd.randint(3, 5)):
                        cells = {titles[0]: (
                            f"{rnd.choice(FA_ITEMS)} "
                            f"{conv.item_namespace}{r * 7}" if coded
                            else rnd.choice(FA_ITEMS))}
                        for title in titles[1:]:
                            cells[title] = str(rnd.randint(1, 400))
                        rows.append([tab["name"], r, cells])
                    # A reference workbook is one whose every computing tab is
                    # named; the formulas would take that back.
                    formulas = []
            if book["mirror"]:
                target = sheets[0]["name"]
                ids_name = "SheetsFileIDs"
                # The mirror carries the estate's own table prefix, so a tab
                # that reads it names it — that pair is the import edge.
                mirror = f"{conv.table_prefix}Mirror"
                sheet, tab_formulas = _mirror_tab(
                    len(sheets) + 1, mirror, target, "SheetsFileId_Src")
                sheets.append(sheet)
                formulas += tab_formulas
                names += [["IMPORT_FROM_SHEET", "workbook", IMPORT_LAMBDA],
                          ["FILTER_BY_DATE", "workbook", FILTER_LAMBDA]]
                consumer = next((t for t in sheets if t.get("header_row")), None)
                if consumer and rnd.random() < 0.8:
                    row = consumer["header_row"] + 1
                    formulas.append([consumer["name"], f"Z{row}:Z{row}", "9",
                                     f"FILTER_BY_DATE({mirror},B{row})", 1,
                                     "0", ""])
                if rnd.random() < 0.75:     # a quarter of the mirrors dangle
                    sheets.append(_sheet(len(sheets) + 1, ids_name,
                                         [["Range Name Associated",
                                           "Sheets File Id"],
                                          ["SheetsFileId_Src", "S000"]], 1, None))
                    names.append(["SheetsFileId_Src", "workbook",
                                  f"{ids_name}!$B$2"])
                    rows.append([ids_name, 2, {"Range Name Associated":
                                               "SheetsFileId_Src",
                                               "Sheets File Id": "S000"}])
        heads[i] = sheets
        _write_dump(root / "attachments" / "sheets" / ".dump" / sid, sheets,
                    formulas, names, rows, validations)
        scripts = []
        if book["formulas"] and rnd.random() < 0.5:
            scripts = [f"Book{i}/{book['short']}.gs"]
            path = root / "attachments" / "sheets" / scripts[0]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(SCRIPT, encoding="utf-8")
        # A book the owner never placed: `dump-workbook --manifest` leaves the
        # judgement column open, and the report names it once (§2.1 Stage 2).
        open_row = i > 1 and rnd.random() < 0.15
        if rnd.random() < 0.1:      # a tab the owner named and then renamed
            reference_tabs = reference_tabs + ["تب حذف‌شده"]
        manifest["workbooks"].append(
            {"spreadsheetId": sid, "short": book["short"],
             "departments": [book["dept"]], "branches": book["branch"],
             "reference_tabs": reference_tabs, "confirmed": not open_row,
             "unresolved": ["branches"] if open_row else [],
             "dir": f"Book{i}", "file": f"{book['short']}.xlsx",
             "scripts": scripts})
        written.append({"short": book["short"], "spreadsheetId": sid,
                        "department": book["dept"],
                        "tabs": [s["name"] for s in sheets]})

    sheets_root = root / "attachments" / "sheets"
    sheets_root.mkdir(parents=True, exist_ok=True)
    (sheets_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    # Beside the estate: the department's own paper forms, one file nothing
    # reads and one whose cached text no longer matches its source, the
    # transcript the run is given, the store it starts from, and the two
    # processes a citation is checked against.
    adir = make_attachments(root, department)
    stale = adir / f"فرم-{rnd.randint(10, 99)}.docx"
    stale.write_bytes(b"a form nobody converted yet")   # no cache: not read
    recording = f"{department}-1405-05-26"
    transcripts = root / "meetings" / "transcripts"
    transcripts.mkdir(parents=True, exist_ok=True)
    lines = [f"سرپرست: سطر {n} — {rnd.choice(FA_ITEMS)} را آخر شب شمردیم."
             for n in range(rnd.randint(0, 60))]
    (transcripts / f"{recording}.txt").write_text("\n".join(lines),
                                                  encoding="utf-8")

    facts = root / "facts"
    facts.mkdir(parents=True, exist_ok=True)
    (facts / "records.json").write_text(
        json.dumps(_units_record(rnd), ensure_ascii=False), encoding="utf-8")

    registry = root / "departments" / "registry.json"
    registry.parent.mkdir(parents=True, exist_ok=True)
    registry.write_text(json.dumps(
        {"departments": [{"code": c, "name": n} for c, n in depts]},
        ensure_ascii=False), encoding="utf-8")
    processes = root / "departments" / department / "processes"
    processes.mkdir(parents=True, exist_ok=True)
    (processes / f"{department}-010.json").write_text(json.dumps(
        {"id": f"{department}-010", "nodes": [
            {"id": f"{department}-010-n001", "label": "شمارش موجودی آخر شب"}]},
        ensure_ascii=False), encoding="utf-8")
    (processes / f"{department}-020.json").write_text(json.dumps(
        {"id": f"{department}-020", "tombstoned": True, "nodes": [
            {"id": f"{department}-020-n001", "label": "رویه بازنشسته"}]},
        ensure_ascii=False), encoding="utf-8")

    return {"department": department, "departments": [c for c, _ in depts],
            "branches": [c for c, _ in branches], "conventions": conventions,
            "workbooks": written, "recording": recording,
            "transcript_lines": len(lines),
            "attachments": sorted(p.name for p in adir.iterdir()
                                  if p.is_file())}
