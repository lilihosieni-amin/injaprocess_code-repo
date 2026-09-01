"""A hand-rolled minimal `.xlsx` for the `dump-workbook` tests (spec Appendix C).

Deterministic XML written straight into a zip — no openpyxl, no dependency the
engine does not already have. Every element shape here was copied from the real
export under `EXPORT_FOR_CLAUDE/` (Google Sheets → xlsx), so what the tests
assert is what the estate actually contains:

* `<sheet state="visible|hidden" …>` — Google writes `state` even when visible;
* a shared-formula master `<f t="shared" ref="D3:D7" si="0">` whose group has a
  cell with **no `<c>` element at all** (D6), so a naive per-`<f>` walk counts 4
  where the group holds 5 — the under-count the spec warns about;
* `IFERROR(__xludf.DUMMYFUNCTION("…"&"…"), cached)`, the wrapper Google leaves
  behind for its own functions, split at a `"&"` with the inner quotes doubled;
* a `LAMBDA` defined name and one name declared twice under two `localSheetId`s;
* a threaded comment in `xl/threadedComments/` reached through the sheet
  `_rels`, its author only a `personId` into `xl/persons/person.xml`, plus the
  `tc={guid}` placeholder the legacy `xl/comments1.xml` carries for it and one
  genuine non-threaded legacy comment;
* a merged band above the header row (39 of 316 real tabs have one);
* both string encodings: inline `t="inlineStr"` on the report tab and
  `t="s"` into `xl/sharedStrings.xml` on the reference tab.

`make_workbook(path)` writes `path` (an `.xlsx`) and, unless told otherwise,
the sibling `{stem}.structure.md` the id is read from.
"""
import pathlib
import zipfile

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
PKG_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
DOC_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
TC_NS = "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"
TC_REL = "http://schemas.microsoft.com/office/2017/10/relationships/threadedComment"

XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

# The four tabs, in workbook order. `SHEETS[i]` is (default name, hidden).
SHEETS = [("آمار", False), ("مواد اولیه", False),
          ("Refresher", True), ("شمارش", False)]

PERSON_ID = "{cf96a3a7-d083-45bf-8730-49b8f9c5c7f2}"
THREAD_ID = "{d4fdafda-ba1a-42f1-be7d-a4c6a6f2396b}"

# The Google source hiding inside the DUMMYFUNCTION wrapper, once the `"&"`
# split is joined and the doubled quotes are halved.
DUMMY_SOURCE = 'IMPORT_FROM_SHEET("SheetsFileId_Pizza","برگه!A1:C10")'
# …and the wrapper as Google writes it into `<f>` (before XML escaping).
DUMMY_FORMULA = ('IFERROR(__xludf.DUMMYFUNCTION('
                 '"IMPORT_FROM_SHEET(""SheetsFileId_Pizza"","'
                 '&"""برگه!A1:C10"")"),"#N/A")')
LAMBDA_BODY = ("LAMBDA(data, date, FILTER(data, INDEX(data,,1) = "
               "DATEVALUE(date)))")
# The reference tab's cells, header first — dumped verbatim as `rows.tsv`.
REFERENCE_ROWS = [["کد", "نام", "گرم"],
                  ["prod_61", "پنیر", "250"],
                  ["prod_62", "خمیر", "300"],
                  ["prod_63", "سس", "40"]]


def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _inline(ref, text, style=None):
    s = f' s="{style}"' if style else ""
    return (f'<c r="{ref}"{s} t="inlineStr"><is><t xml:space="preserve">'
            f'{esc(text)}</t></is></c>')


def _num(ref, value):
    return f'<c r="{ref}"><v>{value}</v></c>'


def _shared(ref, si, master_ref=None, formula=None, value=None):
    f = (f'<f t="shared" ref="{master_ref}" si="{si}">{esc(formula)}</f>'
         if master_ref else f'<f t="shared" si="{si}"/>')
    v = f"<v>{esc(value)}</v>" if value is not None else ""
    return f'<c r="{ref}">{f}{v}</c>'


def _formula(ref, formula, value, t=None):
    ta = f' t="{t}"' if t else ""
    return (f'<c r="{ref}"{ta}><f>{esc(formula)}</f>'
            f'<v>{esc(value)}</v></c>')


def _sheet_report(shared_formula, dummyfunction, merged_band_header):
    """Tab 1 — a merged band over row 1, the header on row 2, a shared-formula
    column, the DUMMYFUNCTION import and three cached error classes."""
    rows = [f'<row r="1">{_inline("A1", "گزارش روزانه ##RPT-1")}</row>',
            "<row r=\"2\">" + "".join(
                _inline(c + "2", h) for c, h in
                zip("ABCD", ["کد", "نام", "مقدار", "بازدهی"])) + "</row>"]
    body = []
    for i, r in enumerate(range(3, 8)):          # rows 3..7
        cells = [_inline(f"A{r}", f"prod_6{i + 1}"),
                 _inline(f"B{r}", "قلم"),
                 _num(f"C{r}", 100 + i)]
        if shared_formula and r != 6:            # D6 is absent on purpose
            if r == 3:
                cells.append(_shared("D3", 0, master_ref="D3:D7",
                                     formula="(C3/B3)*100", value="83.9"))
            else:
                cells.append(_shared(f"D{r}", 0, value="0"))
        body.append(f'<row r="{r}">' + "".join(cells) + "</row>")
    extra = []
    if dummyfunction:
        extra.append(_formula("E3", DUMMY_FORMULA, "42", t="str"))
    extra += [_formula("F3", "SUM(Z1:Z9)/0", "#DIV/0!", t="e"),
              _formula("G3", "PERSIAN_WEEKDAY(A3)", "#NAME?", t="e"),
              _formula("H3", "IMPORT_FROM_SHEET(A3)", "Loading...", t="str")]
    body[0] = body[0][:-len("</row>")] + "".join(extra) + "</row>"
    merge = ('<mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>'
             if merged_band_header else "")
    return (f'{XML}<worksheet xmlns="{MAIN}" xmlns:r="{DOC_RELS}">'
            '<dimension ref="A1:H7"/>'
            "<sheetData>" + "".join(rows + body) + "</sheetData>"
            + merge +
            '<dataValidations count="1"><dataValidation type="list" '
            'allowBlank="1" sqref="B3:B7">'
            '<formula1>&quot;الف,ب,ج&quot;</formula1></dataValidation>'
            "</dataValidations>"
            '<conditionalFormatting sqref="D3:D7">'
            '<cfRule type="cellIs" dxfId="1" priority="1" '
            'operator="greaterThan"><formula>100</formula></cfRule>'
            "</conditionalFormatting>"
            "</worksheet>")


def _sheet_reference(strings):
    """Tab 2 — the reference table, its strings in `sharedStrings.xml`."""
    rows = []
    for r, row in enumerate(REFERENCE_ROWS, start=1):
        cells = []
        for c, value in zip("ABC", row):
            if r > 1 and c == "C":
                cells.append(_num(f"{c}{r}", value))
            else:
                cells.append(f'<c r="{c}{r}" t="s"><v>{strings(value)}</v></c>')
        rows.append(f'<row r="{r}">' + "".join(cells) + "</row>")
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:C4"/>'
            "<sheetData>" + "".join(rows) + "</sheetData></worksheet>")


def _sheet_empty():
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:A1"/>'
            "<sheetData/></worksheet>")


def _sheet_numbers():
    """Tab 4 — nothing but numbers, and never named in `reference_tabs`: its
    cells must not reach any dump (QF-1)."""
    rows = []
    for r in range(1, 4):
        cells = [_num(f"{c}{r}", 900 + r * 10 + i)
                 for i, c in enumerate("ABC")]
        rows.append(f'<row r="{r}">' + "".join(cells) + "</row>")
    return (f'{XML}<worksheet xmlns="{MAIN}"><dimension ref="A1:C3"/>'
            "<sheetData>" + "".join(rows) + "</sheetData></worksheet>")


def _workbook(names, lambda_name):
    sheets = "".join(
        f'<sheet state="{"hidden" if hidden else "visible"}" '
        f'name="{esc(name)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>'
        for i, (name, (_, hidden)) in enumerate(zip(names, SHEETS)))
    defined = [f'<definedName name="Refresher">{esc(names[2])}!$A$1</definedName>']
    if lambda_name:
        defined.append(f'<definedName name="FILTER_BY_DATE">'
                       f'{esc(LAMBDA_BODY)}</definedName>')
    # The same name under two sheet scopes — both must be emitted.
    defined.append('<definedName localSheetId="0" name="Kitchen_Dough">'
                   f'{esc(names[0])}!$A:$E</definedName>')
    defined.append('<definedName localSheetId="1" name="Kitchen_Dough">'
                   f"'{esc(names[1])}'!$A:$E</definedName>")
    return (f'{XML}<workbook xmlns="{MAIN}" xmlns:r="{DOC_RELS}">'
            f"<workbookPr/><sheets>{sheets}</sheets>"
            f'<definedNames>{"".join(defined)}</definedNames></workbook>')


def _workbook_rels(dangling_rel=False):
    """`dangling_rel` drops the last tab's relationship, so its `r:id` resolves
    to nothing — a part the dumper cannot open."""
    rels = "".join(
        f'<Relationship Id="rId{i + 1}" Type="{DOC_RELS}/worksheet" '
        f'Target="worksheets/sheet{i + 1}.xml"/>'
        for i in range(len(SHEETS) - (1 if dangling_rel else 0)))
    rels += (f'<Relationship Id="rId90" Type="{DOC_RELS}/styles" '
             'Target="styles.xml"/>'
             f'<Relationship Id="rId91" Type="{DOC_RELS}/sharedStrings" '
             'Target="sharedStrings.xml"/>')
    return f'{XML}<Relationships xmlns="{PKG_RELS}">{rels}</Relationships>'


def _sheet1_rels(threaded_comment):
    rels = [f'<Relationship Id="rId1" Type="{DOC_RELS}/comments" '
            'Target="../comments1.xml"/>']
    if threaded_comment:
        rels.append(f'<Relationship Id="rId2" Type="{TC_REL}" '
                    'Target="../threadedComments/threadedComment1.xml"/>')
    return (f'{XML}<Relationships xmlns="{PKG_RELS}">'
            + "".join(rels) + "</Relationships>")


def _threaded_comments():
    return (f'{XML}<x18tc:ThreadedComments xmlns="{MAIN}" '
            f'xmlns:x18tc="{TC_NS}">'
            f'<x18tc:threadedComment ref="C4" dT="2026-08-18T07:25:43.00" '
            f'personId="{PERSON_ID}" id="{THREAD_ID}" done="0">'
            '<x18tc:text xml:space="preserve">تلورانس این ستون ۵ گرم است'
            "</x18tc:text></x18tc:threadedComment>"
            "</x18tc:ThreadedComments>")


def _persons():
    return (f'{XML}<x18tc:personList xmlns:x18tc="{TC_NS}">'
            f'<x18tc:person displayName="Ana Saghafian" id="{PERSON_ID}" '
            'providerId="google-sheets"/></x18tc:personList>')


def _legacy_comments(threaded_comment):
    """The `tc={guid}` placeholder Excel writes beside a threaded comment (to be
    discarded) and one genuine non-threaded comment (to be kept)."""
    authors, comments = [], []
    if threaded_comment:
        authors.append(f"<author>tc={THREAD_ID}</author>")
        comments.append(
            f'<comment authorId="{len(authors) - 1}" ref="C4"><text>'
            '<t xml:space="preserve">[Threaded comment]\n'
            "Your version of Excel allows you to read this threaded comment.\n"
            "Comment:\n\tتلورانس این ستون ۵ گرم است\n</t></text></comment>")
    authors.append("<author>Reza Karimi</author>")
    comments.append(
        f'<comment authorId="{len(authors) - 1}" ref="B5"><text><r>'
        '<t xml:space="preserve">این عدد دستی وارد می‌شود</t></r>'
        "</text></comment>")
    return (f'{XML}<comments xmlns="{MAIN}">'
            f'<authors>{"".join(authors)}</authors>'
            f'<commentList>{"".join(comments)}</commentList></comments>')


def _styles():
    return (f'{XML}<styleSheet xmlns="{MAIN}">'
            '<dxfs count="2"><dxf><font/><fill><patternFill '
            'patternType="none"/></fill></dxf>'
            '<dxf><font><color rgb="FF9C0006"/><b/></font><fill><patternFill '
            'patternType="solid"><fgColor rgb="FF535FC1"/>'
            "<bgColor rgb=\"FF535FC1\"/></patternFill></fill></dxf></dxfs>"
            "</styleSheet>")


def _content_types(threaded_comment):
    parts = ['<Default Extension="rels" ContentType="application/'
             'vnd.openxmlformats-package.relationships+xml"/>',
             '<Default Extension="xml" ContentType="application/xml"/>',
             '<Override PartName="/xl/workbook.xml" ContentType="application/'
             'vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>']
    for i in range(len(SHEETS)):
        parts.append(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" '
                     'ContentType="application/vnd.openxmlformats-'
                     'officedocument.spreadsheetml.worksheet+xml"/>')
    parts.append('<Override PartName="/xl/sharedStrings.xml" ContentType='
                 '"application/vnd.openxmlformats-officedocument.'
                 'spreadsheetml.sharedStrings+xml"/>')
    parts.append('<Override PartName="/xl/styles.xml" ContentType='
                 '"application/vnd.openxmlformats-officedocument.'
                 'spreadsheetml.styles+xml"/>')
    parts.append('<Override PartName="/xl/comments1.xml" ContentType='
                 '"application/vnd.openxmlformats-officedocument.'
                 'spreadsheetml.comments+xml"/>')
    if threaded_comment:
        parts.append('<Override PartName="/xl/threadedComments/'
                     'threadedComment1.xml" ContentType="application/vnd.ms-'
                     'excel.threadedcomments+xml"/>')
        parts.append('<Override PartName="/xl/persons/person.xml" ContentType='
                     '"application/vnd.ms-excel.person+xml"/>')
    return (f'{XML}<Types xmlns="http://schemas.openxmlformats.org/package/'
            f'2006/content-types">{"".join(parts)}</Types>')


def make_workbook(path, *, shared_formula=True, dummyfunction=True,
                  lambda_name=True, threaded_comment=True,
                  merged_band_header=True, reference_tab=True,
                  structure_md=True, spreadsheet_id="TESTID01",
                  sheet_names=None, exported="2026-08-29T10:38:50.643Z",
                  dangling_rel=False):
    """Write a minimal but standards-shaped `.xlsx` at `path`.

    `sheet_names` overrides the four tab names in workbook order (a renamed tab
    at the same `sheetId` is how the drift test is built). `structure_md=False`
    writes no sibling file; `spreadsheet_id=None` writes one with no
    `- spreadsheetId:` line. Both are exit-2 cases.
    """
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    names = list(sheet_names or [name for name, _ in SHEETS])

    table = {}

    def strings(value):
        return table.setdefault(value, len(table))

    reference = _sheet_reference(strings) if reference_tab else _sheet_empty()
    parts = {
        "[Content_Types].xml": _content_types(threaded_comment),
        "_rels/.rels": (f'{XML}<Relationships xmlns="{PKG_RELS}">'
                        f'<Relationship Id="rId1" Type="{DOC_RELS}/'
                        'officeDocument" Target="xl/workbook.xml"/>'
                        "</Relationships>"),
        "xl/workbook.xml": _workbook(names, lambda_name),
        "xl/_rels/workbook.xml.rels": _workbook_rels(dangling_rel),
        "xl/worksheets/sheet1.xml": _sheet_report(
            shared_formula, dummyfunction, merged_band_header),
        "xl/worksheets/sheet2.xml": reference,
        "xl/worksheets/sheet3.xml": _sheet_empty(),
        "xl/worksheets/sheet4.xml": _sheet_numbers(),
        "xl/worksheets/_rels/sheet1.xml.rels": _sheet1_rels(threaded_comment),
        "xl/comments1.xml": _legacy_comments(threaded_comment),
        "xl/styles.xml": _styles(),
    }
    if threaded_comment:
        parts["xl/threadedComments/threadedComment1.xml"] = _threaded_comments()
        parts["xl/persons/person.xml"] = _persons()
    ordered = sorted(table, key=table.get)
    parts["xl/sharedStrings.xml"] = (
        f'{XML}<sst xmlns="{MAIN}" count="{len(ordered)}" '
        f'uniqueCount="{len(ordered)}">'
        + "".join(f"<si><t>{esc(s)}</t></si>" for s in ordered) + "</sst>")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(parts):
            z.writestr(name, parts[name])

    md = path.parent / (path.stem + ".structure.md")
    if structure_md:
        lines = [f"# {path.stem}", ""]
        if spreadsheet_id:
            lines.append(f"- spreadsheetId: `{spreadsheet_id}`")
        if exported:
            lines.append(f"- exported: {exported}")
        md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    elif md.exists():
        md.unlink()
    return path
