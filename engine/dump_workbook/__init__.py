"""`dump-workbook` — the structural dump of the Google Sheets estate (spec
Appendix C).

An exported `.xlsx` is a zip of XML, and that is all this module treats it as:
`zipfile` + `xml.etree.ElementTree`, so the engine gains no dependency for the
sake of 28 workbooks read a handful of times.

What is dumped, and what is deliberately not: **plain cell values are not**
(QF-1) — the estate's cells are nightly values, not definitions. What comes out
is the shape of each tab (`sheets.json`, rows 1 through `header_row + 4`, plus
every cell of the two left-most non-empty columns (§4) — deep enough for the
header row to be found and a column's type to be sampled), its formulas
with their cached results (`formulas.tsv`), defined names (`names.tsv`),
validations (`validations.tsv`), conditional formats (`cf.tsv`) and cell
comments with the author reduced to a role (`comments.tsv`). The one
exception is a tab a person confirmed in `reference_tabs[]` at Gate M: its cells
*are* definitions (§9), and they land in `rows.tsv`.

Three things here exist because the estate's real exports do:

* Google writes a **shared-formula** master `<f t="shared" ref="B2:B28" si="1">`
  and leaves the followers as bare `si` — and sometimes writes no `<c>` at all
  for a cell inside the range. Counting `<f>` elements therefore under-counts a
  group (by 97 % on `Amadesazi!بازدهی`); the count comes from the `ref` range
  unioned with the follower cells.
* Its own functions survive the export only as
  `IFERROR(__xludf.DUMMYFUNCTION("…"&"…"), cached)` — the source split into
  255-character string literals with the inner quotes doubled. It is joined back
  up, and the cached result is kept beside it.
* Comment authors are people. A threaded comment names only a `personId`, which
  `xl/persons/person.xml` resolves to a display name — that name never leaves
  this module; what is written is a role from the caller's table, or `unknown`.
"""
import hashlib
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

from engine_common import read_json, write_json_atomic, write_text_atomic

SCHEMA_VERSION = 1

# `xl/worksheets/_rels/sheetN.xml.rels` relationship types we follow.
REL_COMMENTS = "/relationships/comments"
REL_THREADED = "/relationships/threadedComment"

_HEAD_ROWS = 5                      # rows searched for a header row
_KEEP_ROWS = 9                      # rows kept: a header at row 5, plus four
_LABEL_COLS = 2                     # left-most non-empty columns kept whole
_CODE = re.compile(r"#{1,2}[^\s#]+")
# `#NAME?` is a cached error, not a code — Google leaves plenty of them behind.
_ERROR_NAME = re.compile(r"^#(REF|NAME|DIV|VALUE|NULL|NUM|N/A|ERROR|GETTING_DATA)",
                         re.I)
_CELL = re.compile(r"^\$?([A-Z]+)\$?([0-9]+)$")
# An A1 reference outside a string literal: `C3`, `$C$3`, `Sheet!AB12`. The
# lookarounds keep `LOG10(` and bare numbers out of it.
_A1 = re.compile(r"(?<![A-Za-z0-9_$.])(\$?)([A-Z]{1,3})(\$?)([0-9]+)"
                 r"(?![0-9A-Za-z_(])")
_LITERAL = re.compile(r'("(?:[^"]|"")*")')
_DUMMY = "__xludf.DUMMYFUNCTION("


# --------------------------------------------------------------------------
# XML helpers — every part in the estate's exports uses a different prefix for
# the same namespaces (`x18tc:ThreadedComments` with the main namespace as the
# default), so nothing here matches on anything but the local name.


def _local(tag):
    return tag.rpartition("}")[2]


def _child(el, name):
    for c in el:
        if _local(c.tag) == name:
            return c
    return None


def _children(el, name):
    return [c for c in el if _local(c.tag) == name]


def _descendants(el, name):
    return [c for c in el.iter() if _local(c.tag) == name]


def _attr(el, name):
    """An attribute by local name — `r:id` is `{…relationships}id`."""
    for key, value in el.attrib.items():
        if _local(key) == name:
            return value
    return None


def _text_of(el):
    """Every `<t>` under an element, joined — a comment or an inline string is
    split into runs whenever part of it is styled."""
    return "".join(t.text or "" for t in _descendants(el, "t"))


def _all_text(el):
    """All text under an element. A legacy comment nests it in `<t>` runs, a
    threaded one puts it straight inside `<text>`; both come out whole."""
    return "" if el is None else "".join(el.itertext())


# --------------------------------------------------------------------------
# cell references


def _col_num(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def _col_letters(n):
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def _split_ref(ref):
    m = _CELL.match(ref.strip())
    if not m:
        return None
    return _col_num(m.group(1)), int(m.group(2))


def _box(ref):
    """`D3:D7` → (col1, row1, col2, row2); a single cell → a 1×1 box."""
    parts = ref.replace("$", "").split(":")
    first = _split_ref(parts[0])
    if first is None:
        return None
    last = _split_ref(parts[-1]) if len(parts) > 1 else first
    if last is None:
        return None
    return (min(first[0], last[0]), min(first[1], last[1]),
            max(first[0], last[0]), max(first[1], last[1]))


# --------------------------------------------------------------------------
# formula text


def normalise_rows(text):
    """Row numbers in A1 references → `N`, so the 27 cells of a shared group are
    one line and not 27 (`(C3/B3)*100` → `(CN/BN)*100`). String literals are left
    alone: a Google source often quotes a range."""
    return "".join(
        part if part.startswith('"') else _A1.sub(r"\1\2\g<3>N", part)
        for part in _LITERAL.split(text))


def _undouble(literal):
    return literal[1:-1].replace('""', '"')


def unwrap_dummyfunction(formula):
    """`IFERROR(__xludf.DUMMYFUNCTION("…"&"…"), cached)` → `(source, cached)`,
    or `None` when the formula is not one of Google's stubs. The literals are
    joined and their doubled quotes halved."""
    start = formula.find(_DUMMY)
    if start < 0:
        return None
    i = start + len(_DUMMY)
    depth, in_string, k = 1, False, i
    while k < len(formula):
        ch = formula[k]
        if in_string:
            if ch == '"':
                if formula[k + 1:k + 2] == '"':
                    k += 1
                else:
                    in_string = False
        elif ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                break
        k += 1
    argument = formula[i:k]
    source = "".join(_undouble(lit) for lit in _LITERAL.findall(argument))
    cached = None
    tail = re.match(r"\s*,\s*(.*?)\s*\)\s*$", formula[k + 1:], re.S)
    if tail:
        cached = tail.group(1)
        if cached.startswith('"') and cached.endswith('"') and len(cached) > 1:
            cached = _undouble(cached)
    return source, cached


def _is_error(value):
    return bool(value) and (value.startswith("#") or value == "Loading...")


def _is_number(value):
    try:
        float(value.replace(",", ""))
        return True
    except (ValueError, AttributeError):
        return False


# --------------------------------------------------------------------------
# TSV


def _cell(value):
    """One TSV field. A Google formula carries newlines and the odd tab, and a
    dump whose grid can be broken by its own content is not a dump."""
    if value is None:
        return ""
    return (str(value).replace("\\", "\\\\").replace("\t", "\\t")
            .replace("\r", "").replace("\n", "\\n"))


def _tsv(header, rows):
    lines = ["\t".join(header)]
    lines += ["\t".join(_cell(v) for v in row) for row in rows]
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# the workbook parts


def _shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return [_text_of(si) for si in _children(root, "si")]


def _rels(zf, part):
    """`{rId: target}` for a part, targets resolved against the part's dir."""
    path = pathlib.PurePosixPath(part)
    rels = f"{path.parent}/_rels/{path.name}.rels"
    if rels not in zf.namelist():
        return {}
    out = {}
    for rel in ET.fromstring(zf.read(rels)):
        target = rel.get("Target", "")
        resolved = (target[1:] if target.startswith("/")
                    else str((path.parent / target).as_posix()))
        while "/../" in resolved:
            resolved = re.sub(r"[^/]+/\.\./", "", resolved, count=1)
        out[rel.get("Id")] = {"target": resolved, "type": rel.get("Type", "")}
    return out


def _cell_value(c, strings):
    kind = c.get("t")
    if kind == "inlineStr":
        holder = _child(c, "is")
        return _text_of(holder) if holder is not None else ""
    if kind == "s":
        v = _child(c, "v")
        try:
            return strings[int(v.text)] if v is not None else ""
        except (ValueError, IndexError):
            return ""
    v = _child(c, "v")
    if v is not None:
        return v.text or ""
    holder = _child(c, "is")
    return _text_of(holder) if holder is not None else ""


def _read_sheet(data, strings, keep_rows=False, keep_cols=_LABEL_COLS):
    """One worksheet part → the pieces the dump needs. Cells are kept for the
    first `_KEEP_ROWS` rows and, in `columns`, for the `keep_cols` left-most
    non-empty columns whole; every cell only with `keep_rows` (a confirmed
    reference tab)."""
    root = ET.fromstring(data)
    dimension = _child(root, "dimension")
    sheet = {"dimension": (dimension.get("ref") if dimension is not None else ""),
             "head": {}, "rows": {}, "columns": {}, "formulas": [], "merges": [],
             "validations": [], "cf": [], "max_row": 0, "max_col": 0,
             "empty": True}
    sheet_data = _child(root, "sheetData")
    for row in _children(sheet_data, "row") if sheet_data is not None else []:
        try:
            r = int(row.get("r"))
        except (TypeError, ValueError):
            continue
        for c in _children(row, "c"):
            ref = c.get("r") or ""
            at = _split_ref(ref)
            if at is None:
                continue
            col, _ = at
            value = _cell_value(c, strings)
            f = _child(c, "f")
            if value != "" or f is not None:
                sheet["empty"] = False
                sheet["max_row"] = max(sheet["max_row"], r)
                sheet["max_col"] = max(sheet["max_col"], col)
            if value != "":
                if r <= _KEEP_ROWS:
                    sheet["head"].setdefault(r, {})[col] = value
                if keep_rows:
                    sheet["rows"].setdefault(r, {})[col] = value
                if keep_cols:
                    # Which two columns are the left-most *non-empty* ones is
                    # only known once the sheet has gone by — a column further
                    # left can turn up at any row. Dropping the right-most as
                    # each new one arrives keeps two columns in memory instead
                    # of the tab (QF-1: none of this is written unless
                    # `row_labels` says the column names rows).
                    sheet["columns"].setdefault(col, {})[r] = value
                    for extra in sorted(sheet["columns"])[keep_cols:]:
                        del sheet["columns"][extra]
            if f is not None:
                sheet["formulas"].append(
                    {"ref": ref, "col": col, "row": r, "value": value,
                     "text": f.text or "", "kind": f.get("t"),
                     "range": f.get("ref"), "si": f.get("si")})
    merges = _child(root, "mergeCells")
    if merges is not None:
        sheet["merges"] = [m.get("ref") for m in _children(merges, "mergeCell")
                           if m.get("ref")]
    validations = _child(root, "dataValidations")
    if validations is not None:
        for dv in _children(validations, "dataValidation"):
            formulas = [(_text_of_formula(dv, name))
                        for name in ("formula1", "formula2")]
            values = " .. ".join(f for f in formulas if f)
            sheet["validations"].append(
                {"range": dv.get("sqref") or "", "type": dv.get("type") or "",
                 "values": values})
    for block in _children(root, "conditionalFormatting"):
        for rule in _children(block, "cfRule"):
            kind = " ".join(filter(None, [rule.get("type"), rule.get("operator")]))
            if rule.get("text"):
                kind += f' "{rule.get("text")}"'
            formula = _child(rule, "formula")
            sheet["cf"].append(
                {"range": block.get("sqref") or "", "type": kind,
                 "formula": (formula.text or "") if formula is not None else "",
                 "dxf": rule.get("dxfId")})
    return sheet


def _text_of_formula(el, name):
    node = _child(el, name)
    return (node.text or "") if node is not None else ""


def _dxf_summaries(zf):
    """`xl/styles.xml`'s differential formats, one short line each — a
    conditional format is only legible with the format it paints."""
    if "xl/styles.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/styles.xml"))
    holder = _child(root, "dxfs")
    out = []
    for dxf in _children(holder, "dxf") if holder is not None else []:
        parts = []
        fill = _child(dxf, "fill")
        pattern = _child(fill, "patternFill") if fill is not None else None
        fg = _child(pattern, "fgColor") if pattern is not None else None
        if fg is not None and fg.get("rgb"):
            parts.append(f"fill={fg.get('rgb')}")
        font = _child(dxf, "font")
        if font is not None:
            colour = _child(font, "color")
            if colour is not None and colour.get("rgb"):
                parts.append(f"color={colour.get('rgb')}")
            if _child(font, "b") is not None:
                parts.append("bold")
        out.append(" ".join(parts))
    return out


def _comments(zf, part, persons, roles):
    """A sheet's comments: threaded ones from `xl/threadedComments/` through the
    sheet `_rels`, and from the legacy `xl/comments*.xml` only those that are not
    a threaded comment's placeholder."""
    out, threaded_cells = [], set()
    rels = _rels(zf, part)
    for rel in rels.values():
        if not rel["type"].endswith(REL_THREADED):
            continue
        if rel["target"] not in zf.namelist():
            continue
        root = ET.fromstring(zf.read(rel["target"]))
        for tc in _descendants(root, "threadedComment"):
            ref = tc.get("ref") or ""
            threaded_cells.add(ref)
            person = tc.get("personId") or ""
            out.append({"cell": ref, "author": _role(person, persons, roles),
                        "text": _all_text(_child(tc, "text"))})
    for rel in rels.values():
        if not rel["type"].endswith(REL_COMMENTS):
            continue
        if rel["target"] not in zf.namelist():
            continue
        root = ET.fromstring(zf.read(rel["target"]))
        holder = _child(root, "authors")
        authors = [a.text or "" for a in _children(holder, "author")] \
            if holder is not None else []
        holder = _child(root, "commentList")
        for comment in _children(holder, "comment") if holder is not None else []:
            try:
                author = authors[int(comment.get("authorId") or 0)]
            except (ValueError, IndexError):
                author = ""
            text = _all_text(_child(comment, "text"))
            if author.startswith("tc=") or text.startswith("[Threaded comment]"):
                continue                      # the threaded one is already read
            ref = comment.get("ref") or ""
            if ref in threaded_cells:
                continue
            out.append({"cell": ref, "author": roles.get(author, "unknown"),
                        "text": text})
    return out


def _role(person_id, persons, roles):
    """A `personId` → a role, or `unknown`. The id is only honoured when this
    workbook's own `person.xml` declares it; the display name that file holds is
    read here and written nowhere (Appendix C, QF-28)."""
    if person_id not in persons:
        return "unknown"
    return roles.get(person_id, "unknown")


def _persons(zf):
    """`personId` → display name. Read so the id can be *replaced*; the name is
    never written to the dump."""
    if "xl/persons/person.xml" not in zf.namelist():
        return {}
    root = ET.fromstring(zf.read("xl/persons/person.xml"))
    return {p.get("id"): p.get("displayName") or ""
            for p in _descendants(root, "person") if p.get("id")}


# --------------------------------------------------------------------------
# derived per-tab structure


def _head_grid(sheet):
    """The first ≤ 9 rows as a rectangle of strings at the tab's full width,
    row 1 first. `dump_workbook` trims it to the header row plus four."""
    if not sheet["head"]:
        return []
    last_row = min(_KEEP_ROWS, max(sheet["max_row"], max(sheet["head"])))
    width = max([sheet["max_col"]]
                + [max(cols) for cols in sheet["head"].values() if cols])
    return [[sheet["head"].get(r, {}).get(c, "") for c in range(1, width + 1)]
            for r in range(1, last_row + 1)]


def _extent(sheet):
    """`A1:H7` — what `<dimension>` would say. Google's exports leave the element
    out, so the used range is measured while the cells go by."""
    if not sheet["max_row"] or not sheet["max_col"]:
        return ""
    return f"A1:{_col_letters(sheet['max_col'])}{sheet['max_row']}"


def _is_title_band(index, row, merges):
    """Is this row a title band — the thing 39 of the estate's 316 tabs carry
    above their header?

    Two things must hold. A merge spanning columns covers the row and **every**
    such merge holds at most one non-empty cell — a real merge keeps only the
    anchor's value, so a merge with a value in each of its cells is a header
    that happens to be merged, not a band. And the row is **sparse**: no more
    non-empty cells than half its width, because a band is a handful of
    captions over a row of titles.

    Merely being merged is not enough — skipping every row a wide merge touched
    voided the header on such tabs, which silently sent `rows.tsv` to letter
    columns and emitted the header as data. Neither is any rule about one merge
    covering most of the row: `Amadesazi!خروجی آماده سازی به انبار` banners six
    captions over 23 columns, five of them merged and the sixth — a
    single-column group — not merged at all. Counting what the row *says* holds
    where counting what the merges *cover* does not.
    """
    bands = 0
    for ref in merges:
        box = _box(ref)
        if not box or not (box[1] <= index <= box[3]) or box[2] - box[0] < 1:
            continue
        inside = [v for col, v in enumerate(row, start=1)
                  if v.strip() and box[0] <= col <= box[2]]
        if len(inside) > 1:
            return False             # a value in every merged cell: a header
        bands += 1
    filled = [v for v in row if v.strip()]
    return bool(bands) and len(filled) * 2 <= len(row)


def header_row(head, merges=()):
    """The first of the first five rows that is mostly non-numeric text — half
    or more of its non-empty cells. Blank rows and title bands are skipped."""
    for index, row in enumerate(head[:_HEAD_ROWS], start=1):
        cells = [v for v in row if v.strip()]
        if not cells or _is_title_band(index, row, merges):
            continue
        text = [v for v in cells if not _is_number(v)]
        if len(text) * 2 >= len(cells):
            return index
    return None


# --------------------------------------------------------------------------
# what a tab is, and what its rows are called

_MONTHS = ("فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
           "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند")
_DATE_WORDS = ("تاریخ", "روز", "ماه", "سال")
_DATE_VALUE = re.compile(r"^\d{1,4}/\d{1,2}/\d{1,4}$")   # 1405/04/18, 16/4/1405
_LABEL_ROWS = 60        # above this a tab logs nightly values, not a table
_LABEL_CHARS = 40       # a label names a thing; longer is a sentence
_IDS_TAB = re.compile(r"sheetsfileids?", re.I)
_BLANKS = re.compile(r"\s|\\n|\\t")


def _one_call(text):
    """`F(a,b)` → `("F", "a,b")` when the whole string is that one call, else
    `None` — `F(a)+1` and `F(a)+G(b)` are not one call."""
    match = re.match(r"([A-Za-z_][A-Za-z0-9_.]*)\(", text)
    if not match:
        return None
    depth, in_string = 0, False
    for i in range(match.end() - 1, len(text)):
        ch = text[i]
        if in_string:
            in_string = ch != '"'
        elif ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return (match.group(1), text[match.end():i]) \
                    if i == len(text) - 1 else None
    return None


def _top_args(inner):
    """A call's arguments, split on the commas at depth zero."""
    out, depth, in_string, current = [], 0, False, ""
    for ch in inner:
        if in_string:
            current += ch
            in_string = ch != '"'
            continue
        if ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            out.append(current)
            current = ""
            continue
        current += ch
    out.append(current)
    return out


def is_mirror_tab(formulas_for_tab):
    """QF-48 — exactly one formula, at A1, whose body is a single
    `IMPORT_FROM_SHEET` call, bare or as a `LET`'s result expression. Such a tab
    is an edge between two records, never a record: it produces no entry and no
    rule. A formula that merely *contains* an import inside a larger
    computation (the salon and sandogh row lookups) is an ordinary rule, which
    is why the body is parsed and not searched. Rows are `_formula_rows`'
    output: `[sheet, range, group, formula, count, cached, error]`.
    """
    if len(formulas_for_tab) != 1:
        return False
    span, text = formulas_for_tab[0][1] or "", formulas_for_tab[0][3] or ""
    if span.replace("$", "") != "A1":
        return False
    call = _one_call(_BLANKS.sub("", text))
    if call and call[0].upper() == "LET":
        call = _one_call(_top_args(call[1])[-1])
    return bool(call) and call[0].upper() == "IMPORT_FROM_SHEET"


def is_ids_tab(name):
    """The tab that maps a named range to a spreadsheetId. The estate spells it
    `SheetsFileIds` and `SheetsFileIDs`; both are the same tab (§2.2)."""
    return bool(_IDS_TAB.fullmatch((name or "").strip()))


def has_date_header(head_row):
    """Does this header row name a date column? «تاریخ», or two of «روز»,
    «ماه», «سال» — a definition table is keyed by a name, a nightly log by a
    date (§2.2). Two of the three rather than «روز» plus one, because
    `Anbar markazi!فرنگی` heads its day column `Column 1` and still logs a
    date."""
    cells = [str(v).strip() for v in (head_row or [])]
    if any("تاریخ" in cell for cell in cells):
        return True
    return sum(any(word in cell for cell in cells)
               for word in ("روز", "ماه", "سال")) >= 2


def _majority(values, test):
    return sum(1 for value in values if test(value)) * 2 > len(values)


def row_labels(sheet, head, header_index):
    """`{row: text}` for the tab's label column, or `{}` — the rows of a small
    table named down its side (§4).

    Only the two columns `_read_sheet` kept are candidates, and only the rows
    below the header: above it sits whatever date block the tab carries. Every
    guard says the same thing from a different side — a label names a thing,
    and whatever changes nightly is a value (QF-1, which §4 amends for this one
    field): a date part (a month name, a `1405/04/18` or `16/4/1405` value, a
    column headed «تاریخ»/«روز»/«ماه»/«سال»), a column of numbers, a column of
    sentences and a column that repeats itself are all values wearing a label's
    hat. The caller adds the two tab-level guards this cannot see: a mirror
    tab's spilled values and an ids tab's range names name the rows of nothing.
    """
    if not sheet["max_row"] or sheet["max_row"] >= _LABEL_ROWS:
        return {}
    header = head[header_index - 1] if header_index else []
    for col in sorted(sheet["columns"]):
        cells = {row: str(value).strip()
                 for row, value in sheet["columns"][col].items()
                 if row > (header_index or 0) and str(value).strip()}
        if not cells:
            continue
        title = header[col - 1] if col <= len(header) else ""
        values = list(cells.values())
        if any(word in title for word in _DATE_WORDS):
            continue
        if not _majority(values, lambda v: not _is_number(v)):
            continue
        if _majority(values,
                     lambda v: v in _MONTHS or bool(_DATE_VALUE.match(v))):
            continue
        if max(len(value) for value in values) > _LABEL_CHARS:
            continue
        if len(set(values)) * 2 < len(values):
            continue
        return {str(row): cells[row] for row in sorted(cells)}
    return {}


def _codes(head):
    """The `##`/`#` codes printed in a tab's first rows — the estate labels its
    tables that way. A cached `#DIV/0!` is not one of them."""
    out = []
    for row in head:
        for value in row:
            if _is_error(value):
                continue
            for code in _CODE.findall(value):
                if code not in out and not _ERROR_NAME.match(code):
                    out.append(code)
    return out


def _formula_rows(name, sheet):
    """One line per shared-formula group and per lone formula, in document
    order. The group's cell count comes from its `ref` range unioned with the
    follower cells — never from a walk over the `<f>` elements."""
    groups, order = {}, []
    for f in sheet["formulas"]:
        if f["kind"] == "shared" and f["si"] is not None:
            group = groups.get(f["si"])
            if group is None:
                group = groups[f["si"]] = {"si": f["si"], "range": None,
                                           "text": None, "cells": [],
                                           "cached": ""}
                order.append(group)
            group["cells"].append((f["col"], f["row"]))
            if f["range"]:
                group["range"], group["text"] = f["range"], f["text"]
            if not group["cached"] and f["value"]:
                group["cached"] = f["value"]
            if group["text"] is None and f["text"]:
                group["text"] = f["text"]
        else:
            order.append({"si": "", "range": f["ref"], "text": f["text"],
                          "cells": [(f["col"], f["row"])], "cached": f["value"]})
    rows = []
    for group in order:
        text = group["text"] or ""
        cached = group["cached"]
        unwrapped = unwrap_dummyfunction(text)
        if unwrapped:
            text, google_cached = unwrapped
            if not cached and google_cached is not None:
                cached = google_cached
        span = group["range"] or (
            _col_letters(group["cells"][0][0]) + str(group["cells"][0][1]))
        box = _box(span) if group["range"] else None
        if box:
            count = (box[2] - box[0] + 1) * (box[3] - box[1] + 1)
            count += sum(1 for col, row in group["cells"]
                         if not (box[0] <= col <= box[2] and box[1] <= row <= box[3]))
        else:
            count = len(group["cells"])
        rows.append([name, span, group["si"], normalise_rows(text), count,
                     cached, cached if _is_error(cached) else ""])
    return rows


def _reference_rows(name, sheet, head_index):
    """A confirmed reference tab's cells, verbatim (§9, QF-28) — the header row
    names the columns, every row below is one line."""
    if not sheet["rows"]:
        return [], []
    header_cells = sheet["rows"].get(head_index, {}) if head_index else {}
    width = max(sheet["max_col"], max(header_cells or [0]))
    # `sheet` and `row` are the file's own two bookkeeping columns; a header cell
    # that says either is renamed so a reader can always trust the first two.
    columns, seen = [], {"sheet": 1, "row": 1}
    for col in range(1, width + 1):
        label = (header_cells.get(col) or "").strip() or _col_letters(col)
        seen[label] = seen.get(label, 0) + 1
        columns.append(label if seen[label] == 1 else f"{label}_{seen[label]}")
    rows = []
    for r in sorted(sheet["rows"]):
        if head_index and r <= head_index:
            continue
        cells = sheet["rows"][r]
        if not any(str(v).strip() for v in cells.values()):
            continue
        rows.append([name, r] + [cells.get(c, "") for c in range(1, width + 1)])
    return columns, rows


# --------------------------------------------------------------------------
# the sibling `.structure.md`


_ID_LINE = re.compile(r"^\s*-\s*spreadsheetId\s*:\s*(.+?)\s*$", re.M)
_EXPORTED = re.compile(r"^\s*-\s*(?:exported|exportedAt|exported_at)\s*:\s*(.+?)\s*$",
                       re.M)


def _bare(value):
    return value.strip().strip("`").strip()


def read_spreadsheet_id(structure_md_path):
    """The first `- spreadsheetId:` line of the sibling `.structure.md` — the
    single claim of that file that is trusted, because nothing else carries it.
    Its absence is exit 2 naming the file (Appendix C)."""
    path = pathlib.Path(structure_md_path)
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    match = _ID_LINE.search(text)
    if not match or not _bare(match.group(1)):
        print(f"dump-workbook: no '- spreadsheetId:' line in {path}",
              file=sys.stderr)
        raise SystemExit(2)
    return _bare(match.group(1))


def read_exported(structure_md_path):
    path = pathlib.Path(structure_md_path)
    if not path.is_file():
        return None
    match = _EXPORTED.search(path.read_text(encoding="utf-8"))
    return _bare(match.group(1)) if match else None


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


# --------------------------------------------------------------------------
# the dump


def dump_workbook(xlsx_path, structure_md_path, out_dir, reference_tabs=(),
                  ids_tabs=(), prev_sheets=None, roles=None):
    """Dump one workbook under `out_dir/{spreadsheetId}/` and report sheetId
    drift on stdout.

    `out_dir` is the `.dump` root, not the per-workbook directory: the id that
    names the directory is read from `structure_md_path` here, so no caller can
    know it beforehand. `reference_tabs` are the tab names a **confirmed**
    manifest row lists — the only tabs whose cells are dumped (QF-1).
    An **ids tab** is dumped to `rows.tsv` too, whether or not any manifest row
    names it: its rows are the only place a named range resolves to a
    spreadsheetId, which is hop two of every import edge (§2.2). It is found by
    name (`is_ids_tab`), because no caller can know a workbook's tab names
    before it is opened; `ids_tabs` names any further tab to dump the same way.
    `roles` maps a `personId` (or a legacy comment's author) to a role string;
    anyone absent from it is `unknown`, which is the default for everyone.
    `prev_sheets` is the previous dump's `{sheetId: name}`; when it is None the
    map is read from the `sheets.json` already in place, so a re-dump reports
    drift without being told anything (QF-29).
    """
    xlsx_path = pathlib.Path(xlsx_path)
    roles = dict(roles or {})
    spreadsheet_id = read_spreadsheet_id(structure_md_path)
    out = pathlib.Path(out_dir) / spreadsheet_id
    wanted = list(reference_tabs or [])

    if prev_sheets is None:
        prev_sheets = {}
        previous = out / "sheets.json"
        if previous.is_file():
            try:
                prev_sheets = {str(s["sheetId"]): s["name"]
                               for s in read_json(previous).get("sheets", [])}
            except (ValueError, KeyError, TypeError):
                prev_sheets = {}
    prev_sheets = {str(k): v for k, v in prev_sheets.items()}

    try:
        zf = zipfile.ZipFile(xlsx_path)
    except zipfile.BadZipFile:
        print(f"dump-workbook: {xlsx_path} is not a workbook (not a zip)",
              file=sys.stderr)
        raise SystemExit(2) from None
    with zf:
        if "xl/workbook.xml" not in zf.namelist():
            print(f"dump-workbook: {xlsx_path} has no xl/workbook.xml",
                  file=sys.stderr)
            raise SystemExit(2)
        strings = _shared_strings(zf)
        persons = _persons(zf)
        dxfs = _dxf_summaries(zf)
        book = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = _rels(zf, "xl/workbook.xml")
        holder = _child(book, "sheets")
        tabs = []
        for index, tab in enumerate(_children(holder, "sheet")
                                    if holder is not None else []):
            rel = rels.get(_attr(tab, "id"), {})
            try:
                sheet_id = int(tab.get("sheetId"))
            except (TypeError, ValueError):
                sheet_id = index + 1
            tabs.append({"index": index, "name": tab.get("name") or "",
                         "sheetId": sheet_id,
                         "hidden": (tab.get("state") or "visible") != "visible",
                         "part": rel.get("target", "")})

        names = []
        holder = _child(book, "definedNames")
        for defined in _children(holder, "definedName") if holder is not None else []:
            local = defined.get("localSheetId")
            scope = "workbook"
            if local is not None:
                try:
                    scope = tabs[int(local)]["name"]
                except (ValueError, IndexError):
                    scope = f"localSheetId={local}"
            names.append([defined.get("name") or "", scope, defined.text or ""])

        sheets, formulas, validations, cf, comments = [], [], [], [], []
        columns, reference_rows = [], []
        for tab in tabs:
            if not tab["part"] or tab["part"] not in zf.namelist():
                # A dangling `r:id`, or a part the zip does not carry. The stub
                # keeps the tab in `sheets.json`, but silence here would make it
                # indistinguishable from a genuinely empty tab — and a confirmed
                # reference tab could go missing without a word.
                print(f"dump-workbook: warning: sheet {tab['name']}: worksheet "
                      "part unresolved — emitted as empty", file=sys.stderr)
                sheets.append({"sheetId": tab["sheetId"], "name": tab["name"],
                               "hidden": tab["hidden"], "dimension": "",
                               "rows": 0, "cols": 0, "head": [],
                               "header_row": None, "codes": [], "empty": True})
                continue
            keep = (tab["name"] in wanted or tab["name"] in (ids_tabs or ())
                    or is_ids_tab(tab["name"]))
            sheet = _read_sheet(zf.read(tab["part"]), strings, keep_rows=keep)
            head = _head_grid(sheet)
            index = header_row(head, sheet["merges"])
            # A tab's head is rows 1 through `header_row + 4`: whatever date
            # block sits above the header, the header, and four rows below it —
            # enough for `build` to sample a column's type. A tab with no header
            # keeps the five rows the header search looked at.
            head = head[:index + 4] if index else head[:_HEAD_ROWS]
            tab_formulas = _formula_rows(tab["name"], sheet)
            entry = {"sheetId": tab["sheetId"], "name": tab["name"],
                     "hidden": tab["hidden"],
                     "dimension": sheet["dimension"] or _extent(sheet),
                     "rows": sheet["max_row"], "cols": sheet["max_col"],
                     "head": head, "header_row": index,
                     "codes": _codes(head), "empty": sheet["empty"]}
            labels = ({} if is_ids_tab(tab["name"]) or is_mirror_tab(tab_formulas)
                      else row_labels(sheet, head, index))
            if labels:
                entry["row_labels"] = labels
            sheets.append(entry)
            formulas += tab_formulas
            validations += [[tab["name"], v["range"], v["type"], v["values"]]
                            for v in sheet["validations"]]
            for rule in sheet["cf"]:
                summary = ""
                if rule["dxf"] is not None:
                    try:
                        summary = dxfs[int(rule["dxf"])]
                    except (ValueError, IndexError):
                        summary = f"dxfId={rule['dxf']}"
                cf.append([tab["name"], rule["range"], rule["type"],
                           rule["formula"], summary])
            comments += [[tab["name"], c["cell"], c["author"], c["text"]]
                         for c in _comments(zf, tab["part"], persons, roles)]
            if keep:
                tab_columns, rows = _reference_rows(tab["name"], sheet, index)
                columns, reference_rows = _merge_columns(
                    columns, reference_rows, tab_columns, rows)

    present = {tab["name"] for tab in tabs}
    missing = [name for name in wanted if name not in present]
    for name in missing + [n for n in (ids_tabs or ()) if n not in present]:
        which = "reference_tabs" if name in wanted else "ids_tabs"
        print(f"dump-workbook: {xlsx_path.name} has no tab named {name!r} — "
              f"{which} is stale", file=sys.stderr)

    drift = []
    for sheet in sheets:
        old = prev_sheets.get(str(sheet["sheetId"]))
        if old is not None and old != sheet["name"]:
            drift.append({"sheetId": sheet["sheetId"], "old": old,
                          "new": sheet["name"]})
            print(f"drift: {old} -> {sheet['name']}")

    meta = {"schema_version": SCHEMA_VERSION, "spreadsheetId": spreadsheet_id,
            "file": xlsx_path.name, "sha256": _sha256(xlsx_path),
            "bytes": xlsx_path.stat().st_size,
            "exported": read_exported(structure_md_path),
            "sheet_count": len(sheets), "reference_tabs": wanted}

    write_json_atomic(out / "sheets.json",
                      {"schema_version": SCHEMA_VERSION,
                       "spreadsheetId": spreadsheet_id,
                       "sheet_count": len(sheets), "sheets": sheets,
                       "previous": prev_sheets})
    write_text_atomic(out / "formulas.tsv", _tsv(
        ["sheet", "range", "group", "formula", "count", "cached", "error"],
        formulas))
    write_text_atomic(out / "names.tsv", _tsv(["name", "scope", "formula"], names))
    write_text_atomic(out / "validations.tsv", _tsv(
        ["sheet", "range", "type", "values"], validations))
    write_text_atomic(out / "cf.tsv", _tsv(
        ["sheet", "range", "type", "formula", "format"], cf))
    write_text_atomic(out / "comments.tsv", _tsv(
        ["sheet", "cell", "author", "text"], comments))
    write_json_atomic(out / "meta.json", meta)
    if columns:
        write_text_atomic(out / "rows.tsv",
                          _tsv(["sheet", "row"] + columns, reference_rows))
    else:
        # This run dumped no reference cells, so any `rows.tsv` here is from an
        # older one — a tab renamed, emptied, or taken out of `reference_tabs[]`.
        # Leaving it would hand `merge facts audit` half of one export and half
        # of another, and it would read the stale half as current.
        (out / "rows.tsv").unlink(missing_ok=True)

    return {"spreadsheetId": spreadsheet_id, "out_dir": str(out),
            "sheets": sheets, "drift": drift, "formulas": formulas,
            "names": names, "validations": validations, "cf": cf,
            "comments": comments, "rows": reference_rows, "meta": meta,
            "missing_reference_tabs": missing}


def _merge_columns(columns, rows, new_columns, new_rows):
    """`rows.tsv` is one file per workbook (`merge facts audit` reads it that
    way, narrowing on the `sheet` column), so two reference tabs with different
    headers share one header line: the union, in first-seen order. A tab fills
    only its own columns."""
    merged = list(columns)
    for name in new_columns:
        if name not in merged:
            merged.append(name)
    index = {name: i for i, name in enumerate(merged)}
    out = []
    for row in rows:
        out.append(row[:2] + _spread(columns, row[2:], index, len(merged)))
    for row in new_rows:
        out.append(row[:2] + _spread(new_columns, row[2:], index, len(merged)))
    return merged, out


def _spread(columns, values, index, width):
    line = [""] * width
    for name, value in zip(columns, values):
        line[index[name]] = value
    return line


# --------------------------------------------------------------------------
# the manifest's mechanical columns (Appendix B)


_SEGMENT = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")


def _slug(text):
    out = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return out if _SEGMENT.match(out) else ""


def _mint_short(directory, stem, taken):
    """A minted segment for the workbook: its file name, then one directory
    segment at a time from the closest outwards — two `Farangi.xlsx` become
    `farangi` and `amar_farangi`, not one 43-character path. Left empty rather
    than proposed twice (Appendix B); Gate M is where a person names it.
    """
    base = _slug(stem)
    candidates = [base]
    prefix = ""
    segments = [s for part in directory.split("/") for s in part.split("__")]
    for segment in reversed(segments):
        piece = _slug(segment)
        if not piece or piece == base:
            continue
        prefix = f"{piece}_{prefix}"
        candidates.append(_slug(f"{prefix}{base}"))
    for candidate in candidates:
        if candidate and candidate not in taken:
            return candidate
    return ""


def workbook_files(sheets_root):
    """Every `.xlsx` under `attachments/sheets/`, caches excluded."""
    sheets_root = pathlib.Path(sheets_root)
    return sorted(p for p in sheets_root.rglob("*.xlsx")
                  if not any(part.startswith(".") for part in
                             p.relative_to(sheets_root).parts))


def structure_md_for(xlsx_path):
    xlsx_path = pathlib.Path(xlsx_path)
    return xlsx_path.with_name(xlsx_path.stem + ".structure.md")


_JUDGEMENT = ("departments", "branches", "reference_tabs")
_BRANCH_CODES = ("chalebagh", "naharkhoran")


def _first_segment(directory):
    """`MandeShab__ChaleBagh__Amar__Pitza` → `MandeShab`. The estate's paths
    join their segments with `__` inside one directory name as often as with
    `/`, so both separate."""
    return next((s for part in (directory or "").split("/")
                 for s in part.split("__") if s), "")


def manifest_reconcile(row, dump):
    """Take out of a row's `reference_tabs` the tabs that cannot be a reference
    record, and say which and why (§2.2).

    Three of the estate's confirmed rows name a tab that is not a table: an ids
    tab, a mirror (QF-48) and a tab that computes — procurement's «مواد حساس»
    and «مواد عادی». A person answered the question that was put at Gate M and
    the question mentioned none of this, so the row is repaired in place and
    silently; the issues come back for the run to report once, and none of them
    makes the row unresolved. `dump` is `{"sheets": <the sheets.json
    document>, "formulas": <the formulas.tsv rows>}`.
    """
    by_tab = {}
    for formula in dump.get("formulas") or []:
        by_tab.setdefault(formula[0], []).append(formula)
    issues, kept = [], []
    for name in row.get("reference_tabs") or []:
        if is_ids_tab(name):
            kind = "reference_tab_is_ids"
        elif is_mirror_tab(by_tab.get(name) or []):
            kind = "reference_tab_is_mirror"
        elif by_tab.get(name):
            kind = "reference_tab_computes"
        else:
            kept.append(name)
            continue
        issues.append({"kind": kind, "sheet": name, "run_only": True,
                       "spreadsheetId": row.get("spreadsheetId")})
    row["reference_tabs"] = kept
    return issues


def _reference_tab_proposal(dump):
    """Tabs that read as definition tables: item codes in the head, no formula
    of their own, no date column in the header (§2.2). The line-inventory and
    sales tabs carry no formulas either, so the no-formula test alone does not
    separate them — the date column does. A mirror always carries its one
    formula, so the same test excludes it."""
    computing = {formula[0] for formula in dump.get("formulas") or []}
    out = []
    for sheet in (dump.get("sheets") or {}).get("sheets") or []:
        head, index = sheet.get("head") or [], sheet.get("header_row")
        if (not sheet.get("codes") or sheet["name"] in computing
                or is_ids_tab(sheet["name"])
                or has_date_header(head[index - 1] if index else [])):
            continue
        out.append(sheet["name"])
    return out


def _propose(row, dump, workbooks):
    """Write §2.2's proposal into each judgement column that is still empty. A
    filled column is never re-proposed, and a proposal that comes out empty
    leaves the column for Gate M to answer."""
    if not row.get("departments"):
        head = _first_segment(row.get("dir"))
        seen = {tuple(w.get("departments") or []) for w in workbooks
                if w is not row and w.get("confirmed")
                and _first_segment(w.get("dir")) == head}
        seen.discard(())
        if len(seen) == 1:
            row["departments"] = list(seen.pop())
    if not row.get("branches"):
        folded = (row.get("dir") or "").lower()
        row["branches"] = [code for code in _BRANCH_CODES if code in folded]
    if not row.get("reference_tabs") and dump:
        row["reference_tabs"] = _reference_tab_proposal(dump)


def init_manifest(sheets_root, dumps=None):
    """Fill the manifest's mechanical columns from the folder, propose the
    judgement columns from the dumps, and write it (§2.2).

    Idempotent, and the two states are different: a **confirmed** row keeps
    every answer it holds — an empty judgement column there is the owner's
    «none», not a gap — and only has its reference tabs reconciled. An
    unconfirmed or new row has its mechanical columns refreshed (a rename is
    mechanical) and a proposal written into every judgement column still empty;
    `unresolved[]` then names the columns no proposal could fill and
    `confirmed` is derived from it, so the two can never disagree. `dumps` is
    `{spreadsheetId: {"sheets": …, "formulas": …}}` from the same invocation's
    dump; a workbook missing from it simply gets no proposal.
    """
    sheets_root = pathlib.Path(sheets_root)
    path = sheets_root / "manifest.json"
    manifest = {"schema_version": SCHEMA_VERSION, "branches": [], "workbooks": []}
    if path.is_file():
        existing = read_json(path)
        manifest["branches"] = existing.get("branches") or []
        manifest["workbooks"] = list(existing.get("workbooks") or [])
    rows = {row.get("spreadsheetId"): row for row in manifest["workbooks"]}
    taken = {row.get("short") for row in manifest["workbooks"] if row.get("short")}

    for xlsx in workbook_files(sheets_root):
        spreadsheet_id = read_spreadsheet_id(structure_md_for(xlsx))
        directory = xlsx.parent.relative_to(sheets_root).as_posix()
        scripts = sorted(f"{directory}/{gs.name}" for gs in xlsx.parent.glob("*.gs"))
        row = rows.get(spreadsheet_id)
        if row is None:
            row = {"spreadsheetId": spreadsheet_id, "short": "",
                   "departments": [], "branches": [], "reference_tabs": [],
                   "unresolved": [], "confirmed": False}
            rows[spreadsheet_id] = row
            manifest["workbooks"].append(row)
        dump = (dumps or {}).get(spreadsheet_id)
        for issue in (manifest_reconcile(row, dump) if dump else []):
            print(f"dump-workbook: warning: {xlsx.name}: {issue['sheet']} is not "
                  f"a reference table ({issue['kind']}) — removed", file=sys.stderr)
        if row.get("confirmed"):
            row["unresolved"] = []
            continue
        row["dir"], row["file"], row["scripts"] = directory, xlsx.name, scripts
        if not row.get("short"):
            row["short"] = _mint_short(directory, xlsx.stem, taken)
            if row["short"]:
                taken.add(row["short"])
        for key in _JUDGEMENT:
            row.setdefault(key, [])
        _propose(row, dump, manifest["workbooks"])
        row["unresolved"] = [key for key in _JUDGEMENT if not row[key]]
        row["confirmed"] = not row["unresolved"]

    write_json_atomic(path, manifest)
    return manifest
