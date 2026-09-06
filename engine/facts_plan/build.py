"""`facts-plan build` — candidates, the plan and the units' inputs (§2.3).

The formula normaliser lives here and is private to `build` by the spec's
wording; it is module-level rather than nested so its own tests can reach it.

What it is for: two cells that compute the same thing in different books must
land on the same *shape*, and everything that differs between them — a
tolerance of 5 or 140, the column the tolerance multiplies, the food-id set —
must come out as a **parameter**, so one concept is one entry with many
bindings (QF-47) instead of one entry per cell.
"""
import collections
import hashlib
import math
import pathlib
import re

from dump_workbook import is_ids_tab, is_mirror_tab
from engine_common import read_json

Shape = collections.namedtuple("Shape", "text params functions refs")

# A string literal, Google's doubled-quote escaping included. Every step below
# is a regex over formula *syntax*, so literals are masked out of the way first
# and put back last — a Persian caption in quotes is not syntax.
_LITERAL = re.compile(r'"(?:[^"]|"")*"')
_MASK = re.compile("\x00([0-9]+)\x00")      # a masked literal
_SLOT = re.compile("\x02([0-9]+)\x02")      # a recorded parameter
_WS = re.compile(r"\s+")
_LET = re.compile(r"(?<![A-Za-z0-9_])LET\(")
_FUNC = re.compile(r"(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\(")
# (d) An A1 reference with an optional `'sheet'!`. The row part is `N` because
# `dump-workbook.normalise_rows` already folded a shared group's row numbers.
# The two guards are what keep `MIN(`, `ROUND(` and `CONVERT_GR_TO_KG` whole:
# the lookahead refuses a `(` after the match (so `MIN` in `MIN(` is not a
# reference) and the lookbehind refuses a letter, digit or `_` before it (so the
# `GR` in `CONVERT_GR_TO_KG` is not one either).
_REF = re.compile(
    r"(?:'[^']*'!)?(?<![A-Za-z0-9_$])\$?[A-Z]{1,3}\$?(?:N|[0-9]{1,5})"
    r"(?![A-Za-z0-9_(])(?::\$?[A-Z]{1,3}\$?(?:N|[0-9]{1,5}))?")
_TABLE = re.compile(r"(?<![A-Za-z0-9_])Table_[A-Za-z0-9_]+")
_ARRAY = re.compile(r"\{[^{}]*\}")
_NUMBER = re.compile(r"(?<![A-Za-z0-9_.$\x00\x02])[0-9]+(?:\.[0-9]+)?"
                     r"(?![A-Za-z0-9_.\x00\x02])")
_NUMERIC = re.compile(r"^[0-9]+(?:\.[0-9]+)?$")
_BARE_REF = re.compile(r"'[^']*'!@")


def estimate_tokens(text):
    """§2.3's budget arithmetic: `ascii/4 + non_ascii/1.5`, rounded up."""
    ascii_n = sum(1 for ch in text if ord(ch) < 128)
    return math.ceil(ascii_n / 4 + (len(text) - ascii_n) / 1.5)


def is_bare_reference(shape_text):
    """A cell that only reads another cell computes nothing (§2.3)."""
    return shape_text == "@" or bool(_BARE_REF.fullmatch(shape_text))


def _args(text, i):
    """The spans of the top-level arguments of the call whose `(` is at `i`.
    Literals are already masked, so nothing here has to know about quotes."""
    depth, start, spans = 0, i + 1, []
    for k in range(i, len(text)):
        ch = text[k]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                spans.append((start, k))
                return spans
        elif ch == "," and depth == 1:
            spans.append((start, k))
            start = k + 1
    return spans


def _apply_edits(text, edits):
    """`(start, end, replacement)` triples applied in one left-to-right pass, so
    no edit has to know how much the ones before it moved."""
    out, cut = [], 0
    for start, end, replacement in sorted(edits):
        out.append(text[cut:start])
        out.append(replacement)
        cut = end
    out.append(text[cut:])
    return "".join(out)


def _number(text):
    return float(text) if "." in text else int(text)


def _members(array_text):
    return [_number(p) if _NUMERIC.match(p) else p
            for p in array_text[1:-1].split(",") if p]


def _locator(ref):
    sheet, _, cell = ref.rpartition("!")
    locator = {"cell": cell.replace("$", "")}
    if sheet:
        locator["sheet"] = sheet.strip("'")
    return locator


def _let_rename(text, slot):
    """(b) LET locals become `v1..vn` in binding order, and a local that binds a
    numeric or brace literal lends that literal its own name as the parameter
    key — `tolerancePerFoodGr, 5` is the whole reason a tolerance is readable
    at Gate B without anyone typing it (§2.5).

    A local bound to a *string* is renamed but records nothing: a sheet name is
    not a quantity, and §2.5's parameter table has no place to put one.
    """
    names = []
    for m in _LET.finditer(text):
        args = _args(text, m.end() - 1)
        for k in range(0, len(args) - 1, 2):
            names.append(text[args[k][0]:args[k][1]])
    if not names:
        return text
    alias = {}
    for i, name in enumerate(names, 1):
        if name in alias:
            raise ValueError(
                f"LET binds {name!r} twice in one formula: one alias for two "
                "bindings would drop a parameter silently")
        alias[name] = f"v{i}"
    edits = [(m.start(), m.end(), a)
             for name, a in alias.items()
             for m in re.finditer(r"(?<![A-Za-z0-9_])" + re.escape(name)
                                  + r"(?![A-Za-z0-9_])", text)]
    text = _apply_edits(text, edits)
    back = {a: name for name, a in alias.items()}
    edits = []
    for m in _LET.finditer(text):
        args = _args(text, m.end() - 1)
        for k in range(0, len(args) - 1, 2):
            key = back.get(text[args[k][0]:args[k][1]])
            start, end = args[k + 1]
            value = text[start:end]
            if _NUMERIC.match(value):
                edits.append((start, end, slot("#", _number(value), key)))
            elif value.startswith("{") and value.endswith("}"):
                edits.append((start, end, slot("{#}", _members(value), key)))
    return _apply_edits(text, edits)


def normalise(formula, *, table_refs):
    """§2.3 steps (a)–(f) over one `formulas.tsv` cell.

    `table_refs` maps a `Table_*` name to what its `$T` parameter should record
    — `{"ref": "S-rec-…"}` when the name resolves to a template of this run. A
    reference records a locator; Task 11 resolves the ones that point at a
    column of a template in this run into `{"ref", "field"}`.
    """
    # (a) the dump's escapes, then every whitespace character outside a literal.
    # ponytail: `_cell` also doubles a real backslash, so a formula holding a
    # literal `\n` would lose it here. No cell in the 28-workbook estate does.
    text = formula.replace("\\n", " ").replace("\\t", " ")
    literals = []

    def mask(m):
        literals.append(m.group(0))
        return "\x00%d\x00" % (len(literals) - 1)

    text = _WS.sub("", _LITERAL.sub(mask, text))
    # `LET` is the binding form, not a called function — it would otherwise be
    # in two thirds of the estate's `functions` sets and say nothing.
    functions = frozenset(m.group(1) for m in _FUNC.finditer(text)) - {"LET"}
    slots = []

    def slot(symbol, value, key=None):
        slots.append((symbol, value, key))
        return "\x02%d\x02" % (len(slots) - 1)

    text = _let_rename(text, slot)                                       # (b)
    text = _ARRAY.sub(lambda m: slot("{#}", _members(m.group(0))), text)  # (c)
    text = _REF.sub(lambda m: slot("@", _locator(m.group(0))), text)      # (d)
    text = _TABLE.sub(lambda m: slot("$T", table_refs.get(               # (e)
        m.group(0), {"table": m.group(0)})), text)

    def quoted_table(m):
        body = literals[int(m.group(1))][1:-1]
        if not body.startswith("Table_"):
            return m.group(0)
        return slot("$T", table_refs.get(body, {"table": body}))

    text = _MASK.sub(quoted_table, text)                                 # (e)
    text = _NUMBER.sub(lambda m: slot("#", _number(m.group(0))), text)   # (f)
    text = _MASK.sub(lambda m: literals[int(m.group(1))], text)

    # Keys are minted in text order, so `ref_1` is the left-most reference
    # whatever order the passes above ran in.
    params, counters, refs = {}, {"ref": 0, "table": 0, "p": 0}, []

    def mint(m):
        symbol, value, key = slots[int(m.group(1))]
        if key is None:
            prefix = {"@": "ref", "$T": "table"}.get(symbol, "p")
            counters[prefix] += 1
            key = (f"p{counters['p']}" if prefix == "p"
                   else f"{prefix}_{counters[prefix]}")
        params[key] = value
        if symbol == "@":
            refs.append(value)
        return symbol

    return Shape(_SLOT.sub(mint, text), params, functions, refs)


# --------------------------------------------------------------------------
# the candidates: record templates, their reference rows, and the items

_CODE_IN_TEXT = re.compile(r"#{1,2}[0-9]+")
_PLACEHOLDER = re.compile(r"^Column [0-9]+$")
_MONTHS = ("فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
           "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند")
_BRANCH_TOKENS = ("چاله باغ", "ناهارخوران", "ناهار خوران",
                  "chalebagh", "chale bagh", "naharkhoran", "nahar khoran")
# `formulas.tsv`'s columns, in the order `dump_workbook._formula_rows` writes
# them — `_tsv` hands a row back as a dict, and `is_mirror_tab` reads the list.
_FORMULA_COLUMNS = ("sheet", "range", "group", "formula", "count", "cached",
                    "error")

# §2.3: these six describe a tab that becomes no record or a cell that becomes
# no rule, so they are reported and counted but never attached to an entry.
RUN_ONLY = frozenset({"reference_tab_is_mirror", "reference_tab_is_ids",
                      "reference_tab_computes", "row_labels_ambiguous",
                      "row_labels_partial", "unheaded_formula"})

# One Persian sentence per issue kind — `gate-b.md` and `report.md` print these
# verbatim, so no caller ever composes owner-facing prose (QF-54).
ISSUE_TEXT = {
    "column_offset": "ستون «{field}» در نسخه‌های مختلف در جای یکسانی نیست: {detail}.",
    "cross_record": "فهرست مقادیر مجاز ستون «{field}» بین نسخه‌ها یکی نیست: {detail}.",
    "ambiguous_row_header": "عنوان «{field}» در تب «{sheet}» دوبار تکرار شده و "
                            "سطرها به آن وصل نشدند.",
    "row_labels_partial": "نام سطرها فقط در بعضی نسخه‌ها ثبت شده است: {detail}.",
    "row_labels_ambiguous": "ستون نام سطرها در نسخه‌ها یکسان نیست: {detail}.",
}


def _issue(kind, *, instance=None, target=None, **fields):
    return {"kind": kind, "instance": instance, "target": target,
            "engine": True, "run_only": kind in RUN_ONLY,
            "description": ISSUE_TEXT[kind].format(**fields)}


def _sid(prefix, *parts):
    body = "\x00".join(str(p) for p in parts)
    return f"S-{prefix}-{hashlib.sha256(body.encode('utf-8')).hexdigest()[:12]}"


def _letters(n):
    """1 → `a`, 27 → `aa`. A field key is `c_<letter>`, always lowercase."""
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(97 + rem) + out
    return out


def fold(text):
    return _WS.sub(" ", (text or "").replace("\n", " ")).strip()


def strip_branch(name):
    """The tab name with a branch token removed — «کانتر ناهارخوران» in one book
    and «کانتر» in another are the same tab (QF-47). ZWNJ folds to a space so
    «چاله‌باغ» and «چاله باغ» are one token."""
    folded = fold(name.replace("‌", " ")).lower()
    for token in _BRANCH_TOKENS:
        folded = folded.replace(token, " ")
    return _WS.sub(" ", folded).strip()


def code_key(code):
    """`##1` → `ing_1`, `#71` → `food_71`. A store key is ASCII and matches
    `SEGMENT_RE`; `#` does not (QF-32), so the code itself lives in
    `item.data.code` and this is what a row is keyed by."""
    return (f"ing_{code[2:]}" if code.startswith("##") else f"food_{code[1:]}")


def _is_number(text):
    try:
        float(str(text).replace(",", ""))
        return True
    except (TypeError, ValueError):
        return False


def _tsv(path):
    """A dump TSV as dicts. Nothing is unescaped — `formulas.tsv` keeps the
    `\\n` the dumper wrote, and `normalise` step (a) is what consumes it. A
    short line simply lacks its trailing columns, which is the same as a blank:
    an omission, never an unanswered leaf."""
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines:
        return []
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"))) for line in lines[1:] if line]


def load_estate(root):
    """Every dumped workbook the manifest names, keyed by spreadsheetId.

    The whole estate is loaded because the library and the import hops are
    estate-wide; the department filter lives at the call site, so `build` never
    forgets that candidates are the department's own (§2.3)."""
    sheets_root = pathlib.Path(root) / "attachments" / "sheets"
    estate = {}
    for row in read_json(sheets_root / "manifest.json")["workbooks"]:
        dump = sheets_root / ".dump" / row["spreadsheetId"]
        if not (dump / "sheets.json").exists():
            continue
        estate[row["spreadsheetId"]] = {
            "row": row, "short": row["short"], "sheets_root": sheets_root,
            "sheets": {s["name"]: s
                       for s in read_json(dump / "sheets.json")["sheets"]},
            "formulas": _tsv(dump / "formulas.tsv"),
            "rows": _tsv(dump / "rows.tsv"),
            "names": {n["name"]: n["formula"] for n in _tsv(dump / "names.tsv")},
            "validations": _tsv(dump / "validations.tsv")}
    return estate


def template_signature(tab_name, head_row):
    """(folded tab name, the header row's item codes in order). An empty cell,
    a `Column N` placeholder and an un-coded column contribute nothing."""
    codes = []
    for cell in head_row or []:
        text = fold(cell)
        if text and not _PLACEHOLDER.match(text):
            codes += _CODE_IN_TEXT.findall(text)
    return (strip_branch(tab_name), tuple(codes))


def _label_column(sheet):
    """The column `row_labels` came from. The dumper records the texts but not
    the column; since Task 4 the head reaches four rows past the header, so the
    first label is findable in it."""
    labels = sheet.get("row_labels") or {}
    head = sheet.get("head") or []
    for row in sorted(labels, key=int):
        line = head[int(row) - 1] if int(row) <= len(head) else []
        for col, cell in enumerate(line, start=1):
            if fold(cell) == fold(labels[row]):
                return col
    return None


def header_notes(sheet):
    """The rows above the header row, as the unit sees them.

    A caption over a column that *has* a header names that column («تمام وزن‌ها
    به کیلوگرم است»); a caption over a column with none is the date band, and
    the numbers and month names under it are last night's date.

    ponytail: §2.3 words the third test as an exclusion, which taken literally
    drops the very sentence the same clause promises to keep. It is read here
    as the keeping test. Flip it if a real note ever sits over an unheaded
    column.
    """
    index = sheet.get("header_row")
    head = sheet.get("head") or []
    if not index:
        return []
    header = head[index - 1]
    notes = []
    for line in head[:index - 1]:
        for col, cell in enumerate(line, start=1):
            text = fold(cell)
            if not text or _is_number(text) or text in _MONTHS:
                continue
            if col > len(header) or not fold(header[col - 1]):
                continue
            notes.append({"column": _letters(col), "text": text})
    return notes


def _sheet_formulas(dump, name):
    return [f for f in dump["formulas"] if f.get("sheet") == name]


def _is_mirror(formula_rows):
    """`dump_workbook.is_mirror_tab` reads `_formula_rows`' positional row,
    while `_tsv` hands the same seven columns back as a dict — so the row is
    rebuilt by column name, never by whatever order a dump's header carries."""
    return is_mirror_tab([[row.get(c, "") for c in _FORMULA_COLUMNS]
                          for row in formula_rows])


def _instances(estate, department):
    """One member per (spreadsheetId, tab) that can carry a record. A one-cell
    tab, a tab with no header row, a tab with no row below it, a mirror tab and
    an ids tab produce none (§2.3)."""
    out = []
    for sid, dump in sorted(estate.items()):
        row = dump["row"]
        if department not in (row.get("departments") or []):
            continue
        for name, sheet in sorted(dump["sheets"].items()):
            index = sheet.get("header_row")
            if (sheet.get("empty") or not index or is_ids_tab(name)
                    or _is_mirror(_sheet_formulas(dump, name))
                    or (sheet.get("rows", 0) <= 1 and sheet.get("cols", 0) <= 1)
                    or sheet.get("rows", 0) <= index):
                continue
            branches = row.get("branches") or []
            out.append({
                "key": f"{dump['short']}__s{sheet['sheetId']}",
                "spreadsheetId": sid, "sheetId": sheet["sheetId"], "sheet": name,
                "branch": branches[0] if len(branches) == 1 else None,
                "hidden": bool(sheet.get("hidden")),
                "reference": name in (row.get("reference_tabs") or []),
                "signature": template_signature(
                    name, sheet["head"][index - 1])})
    return sorted(out, key=lambda i: i["key"])


def _groups(instances):
    """Tabs group into one template when the folded names are equal and the code
    lists are equal or one is a NON-EMPTY subset of the other; two tabs in one
    spreadsheet never group, and a reference tab is always alone (§2.3).

    ponytail: a candidate is compared against the group's first member only.
    Instances are visited in ascending key, so the result is deterministic; a
    transitive-closure pass is the upgrade if a third code list ever needs it.
    """
    groups = []
    for inst in instances:
        name, codes = inst["signature"]
        for group in groups:
            head = group[0]
            if (head["signature"][0] != name or head["reference"]
                    or inst["reference"]):
                continue
            if any(g["spreadsheetId"] == inst["spreadsheetId"] for g in group):
                continue
            a, b = set(codes), set(head["signature"][1])
            if a == b or (a and b and (a < b or b < a)):
                group.append(inst)
                break
        else:
            groups.append([inst])
    return groups


def _enum(dump, sheet_name, letter):
    for v in dump["validations"]:
        if v.get("sheet") != sheet_name or v.get("type") != "list":
            continue
        if v.get("range", "").split(":")[0].strip("$").rstrip("0123456789").lower() \
                != letter:
            continue
        return [p.strip() for p in v.get("values", "").strip('"').split(",") if p]
    return None


def _fields(group, estate):
    """One field per header cell, matched across instances by header **text** —
    the same column sits at different letters in two books (kanter and its twin
    are two apart), and `columns` is what records that."""
    fields, order, issues = {}, [], []
    for inst in group:
        dump = estate[inst["spreadsheetId"]]
        sheet = dump["sheets"][inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        label_col = _label_column(sheet)
        for col, cell in enumerate(header, start=1):
            title = fold(cell)
            if _PLACEHOLDER.match(title) or (not title and col != label_col):
                continue
            letter = _letters(col)
            if title not in fields:
                fields[title] = {"key": f"c_{letter}", "title": title or None,
                                 "columns": {}, "type": "string"}
                order.append(title)
            fields[title]["columns"][inst["key"]] = letter
            samples = [row[col - 1] for row in sheet["head"][sheet["header_row"]:]
                       if col <= len(row) and str(row[col - 1]).strip()]
            if samples and all(_is_number(s) for s in samples):
                fields[title]["type"] = "number"
            values = _enum(dump, inst["sheet"], letter)
            if values is not None:
                seen = fields[title].setdefault("_enums", [])
                seen.append((inst["key"], values))
    out = []
    for title in order:
        field = fields[title]
        enums = field.pop("_enums", [])
        if enums:
            keep = [v for v in enums[0][1] if all(v in e for _, e in enums)]
            field["constraints"] = {"enum": keep}
            if any(e != enums[0][1] for _, e in enums):
                issues.append(_issue("cross_record", field=title or "—",
                                     detail=" / ".join(k for k, _ in enums)))
        letters = sorted(set(field["columns"].values()))
        if len(letters) > 1:
            detail = ", ".join(f"{k}: {v}"
                               for k, v in sorted(field["columns"].items()))
            issues.append(_issue("column_offset", field=title or "—",
                                 detail=detail))
        out.append(field)
    return out, issues


def _row_labels(group, estate):
    """Row labels are the template's only when every instance has them and every
    instance's label column carries the same header text (§2.3)."""
    labels, headers, missing = {}, set(), []
    for inst in group:
        sheet = estate[inst["spreadsheetId"]]["sheets"][inst["sheet"]]
        col = _label_column(sheet)
        if not sheet.get("row_labels") or not col:
            missing.append(inst["key"])
            continue
        labels[inst["key"]] = sheet["row_labels"]
        headers.add(fold(sheet["head"][sheet["header_row"] - 1][col - 1]))
    detail = ", ".join(i["key"] for i in group)
    if missing and labels:
        return None, [_issue("row_labels_partial", detail=detail)]
    if len(headers) > 1:
        return None, [_issue("row_labels_ambiguous", detail=detail)]
    return (labels or None), []


def reference_rows(dump, sheet_name, header_row, fields):
    """A reference tab's `rows.tsv` lines, matched to fields by header text.
    `primaryKey` is the column whose cells carry an item code; a cell the dump
    left empty is omitted, so a blank is never an unanswered leaf (QF-46)."""
    titles = [fold(c) for c in header_row if fold(c)]
    issues = [_issue("ambiguous_row_header", sheet=sheet_name, field=t)
              for t in sorted({t for t in titles if titles.count(t) > 1})]
    by_title = {f["title"]: f["key"] for f in fields if f["title"]}
    lines = [r for r in dump["rows"] if r.get("sheet") == sheet_name]
    key_title = next((t for t in titles if t in by_title
                      and any(_CODE_IN_TEXT.search(line.get(t, "") or "")
                              for line in lines)), None)
    rows = []
    for line in lines:
        code = (_CODE_IN_TEXT.search(line.get(key_title, "") or "")
                if key_title else None)
        if not code:
            continue
        row = {"key": code_key(code.group(0))}
        for title, value in line.items():
            if title in by_title and str(value).strip():
                row[by_title[title]] = value
        rows.append(row)
    return rows, ([by_title[key_title]] if key_title else []), issues


def record_templates(estate, department):
    """The record-template candidates, their instances and the issues the
    grouping found. `payload` is exactly the mechanical `data` subset §2.5
    leaves to the engine; `render` is what only `input.md` needs."""
    candidates, instances, issues = [], [], []
    for group in _groups(_instances(estate, department)):
        head_inst = group[0]
        dump = estate[head_inst["spreadsheetId"]]
        sheet = dump["sheets"][head_inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        fields, field_issues = _fields(group, estate)
        labels, label_issues = _row_labels(group, estate)
        tid = _sid("rec", head_inst["signature"][0],
                   *head_inst["signature"][1], head_inst["key"])
        row = dump["row"]
        payload = {
            "medium": "sheet",
            "location": {"path": f"attachments/sheets/{row['dir']}/{row['file']}",
                         "spreadsheetId": head_inst["spreadsheetId"],
                         "sheet": head_inst["sheet"]},
            "instances": [{k: i[k] for k in
                           ("key", "spreadsheetId", "sheetId", "sheet",
                            "branch", "hidden")} for i in group],
            "fields": fields}
        if head_inst["reference"]:
            rows, primary, row_issues = reference_rows(
                dump, head_inst["sheet"], header, fields)
            payload["rows"], payload["primaryKey"] = rows, primary
            issues += row_issues
        candidates.append({"id": tid, "kind": "record", "unit": None,
                           "payload": payload,
                           "render": {"sheet": head_inst["sheet"],
                                      "signature": list(head_inst["signature"]),
                                      "header_notes": header_notes(sheet),
                                      "row_labels": labels,
                                      "reference": head_inst["reference"]}})
        issues += field_issues + label_issues
        for inst in group:
            instances.append(dict(inst, template=tid))
    return candidates, instances, issues


def item_candidates(estate, department, instances):
    """One per distinct code across the department's header rows, its row labels
    and its reference rows' key column. Labels are ordered by how many instances
    carry each, so the unit's first choice is the estate's."""
    seen = collections.defaultdict(lambda: (collections.Counter(), []))
    for inst in instances:
        dump = estate[inst["spreadsheetId"]]
        sheet = dump["sheets"][inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        cells = [(_letters(col), fold(cell))
                 for col, cell in enumerate(header, start=1)]
        label_col = _label_column(sheet)
        cells += [(_letters(label_col), fold(text))
                  for text in (sheet.get("row_labels") or {}).values()
                  if label_col]
        cells += [(None, fold(str(v))) for line in dump["rows"]
                  if line.get("sheet") == inst["sheet"] for v in line.values()]
        for letter, text in cells:
            for code in _CODE_IN_TEXT.findall(text):
                labels, sites = seen[code]
                labels[fold(text.replace(code, ""))] += 1
                if letter and (inst["key"], letter) not in sites:
                    sites.append((inst["key"], letter))
    out = []
    for code in sorted(seen, key=lambda c: (len(c) - len(c.lstrip("#")),
                                            int(c.lstrip("#")))):
        labels, sites = seen[code]
        marker = "##" if code.startswith("##") else "#"
        out.append({"id": _sid("i", "item", marker, code.lstrip("#")),
                    "kind": "item", "unit": None,
                    "payload": {"code": code},
                    "render": {"labels": [t for t, _ in
                                          sorted(labels.items(),
                                                 key=lambda p: (-p[1], p[0])) if t],
                               "sites": sites}})
    return out


# --------------------------------------------------------------------------
# the candidates: rule columns — one per output header, with their variants,
# their bindings and the exclusions (§2.3)

ISSUE_TEXT.update({
    "unheaded_formula": "در تب «{sheet}» ستون {column} فرمول دارد ولی عنوانی "
                        "ندارد؛ سطرهای {rows}.",
    "no_rule_applies": "در تب «{sheet}» خانه‌های {rows} از ستون {column} فقط "
                       "مقدار خانهٔ دیگری را نشان می‌دهند.",
    "broken_formula": "فرمول ستون {column} تب «{sheet}» در محدودهٔ {rows} خطای "
                      "{error} می‌دهد.",
    "cached_error": "آخرین نتیجهٔ ذخیره‌شدهٔ ستون {column} تب «{sheet}» در "
                    "محدودهٔ {rows} خطای {error} است؛ فرمول سر جای خود است.",
    "hand_maintained_index": "فهرست غذاهای ستون {column} تب «{sheet}» داخل خود "
                             "فرمول نگهداری می‌شود، در حالی که همان نگاشت در "
                             "جدول نسخه‌ها هم هست.",
    "per_cell_mirror": "تب «{sheet}» خانه‌به‌خانه از جای دیگری کپی می‌شود.",
})
# §2.3 gives `broken_formula` the spreadsheet's own error kind. A formula
# `normalise` refuses — a `LET` binding one name twice — has none, so this
# stands in its place; the sentence still says what is wrong with the formula.
_REBOUND = "تعریف دوبارهٔ یک نام"

_BROKEN = ("#REF!", "#NUM!")
_CACHED = ("#NAME?", "#N/A", "Loading...")
_CELL_REF = re.compile(r"^\$?([A-Z]{1,3})\$?([0-9]+|N)$")
_GS_FUNCTION = re.compile(r"^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", re.M)
_GS_LOGIC = re.compile(r"[-+*/%]|\bif\s*\(|\?")
# ponytail: "reads a table or a sheet range" as one regex over the body — the
# five spellings the estate uses. A sixth spelling means one more alternative.
_TABLE_READER = re.compile(r"Table_|IMPORT_FROM_SHEET|IMPORTRANGE"
                           r"|getRangeByName|getSheetByName|getRange\(")
# §2.3: the estate names a row's ingredient exactly once, as this LET local.
ITEM_PARAM = "ingredientId"


def _bodies(estate):
    """Every function body in the estate: the named functions from `names.tsv`
    and the script functions from the `.gs` files the manifest points at."""
    out = {}
    for dump in estate.values():
        for name, formula in dump["names"].items():
            if formula.startswith("LAMBDA("):
                out.setdefault(name, formula)
        for script in dump["row"].get("scripts") or []:
            path = dump["sheets_root"] / script
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            starts = [(m.group(1), m.start()) for m in _GS_FUNCTION.finditer(text)]
            for i, (name, start) in enumerate(starts):
                end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
                out.setdefault(name, text[start:end].strip())
    return out


def table_reading_functions(estate):
    """The functions whose body reads a table or a sheet range. §2.3 groups the
    variants of a column that calls one by the *set of called functions*, not by
    shape: their inlined food-id sets vary per row and are not parameters."""
    return frozenset(name for name, body in _bodies(estate).items()
                     if _TABLE_READER.search(body))


def called_names(estate):
    """Every function name anything calls — a cell formula, a named function's
    body or a script body. What is in here is plumbing, not a rule (§2.3)."""
    called = set()
    for dump in estate.values():
        for row in dump["formulas"]:
            text = row.get("formula", "")
            try:
                called |= normalise(text, table_refs={}).functions
            except ValueError:      # a LET binding one name twice — read raw
                called |= {m.group(1) for m in _FUNC.finditer(text)} - {"LET"}
    for body in _bodies(estate).values():
        # The `function name(` header is a declaration, not a call — left in,
        # every script function would call itself and none would be a rule.
        called |= {m.group(1) for m in
                   _FUNC.finditer(_GS_FUNCTION.sub("", body, count=1))}
    return frozenset(called)


def _table_refs(dump, instances):
    """`Table_*` → the template it names, when `names.tsv` resolves it to a tab
    that is an instance of this run; otherwise the bare name."""
    by_sheet = {(i["spreadsheetId"], i["sheet"]): i["template"] for i in instances}
    out = {}
    for name, formula in dump["names"].items():
        sheet = formula.split("!")[0].strip("'") if "!" in formula else None
        template = by_sheet.get((dump["row"]["spreadsheetId"], sheet))
        out[name] = {"ref": template} if template else {"table": name}
    return out


def _column_of(span):
    m = _CELL_REF.match(span.split(":")[0].replace("$", ""))
    return m.group(1).lower() if m else None


def _first_row(span):
    m = _CELL_REF.match(span.split(":")[0].replace("$", ""))
    return int(m.group(2)) if m and m.group(2) != "N" else None


def _rows_of(span):
    parts = span.replace("$", "").split(":")
    first, last = _first_row(parts[0]), _first_row(parts[-1])
    return list(range(first, (last or first) + 1)) if first else []


def _resolve(locator, inst, fields_by_letter):
    """A reference that points at a column of this tab's own template becomes
    `{ref, field}`; anything else stays the locator §2.3 (d) recorded."""
    if locator.get("sheet"):
        return locator
    letter = _column_of(locator["cell"])
    field = fields_by_letter.get((inst["key"], letter))
    return {"ref": inst["template"], "field": field} if field else locator


def rule_columns(estate, department, templates, instances, table_functions):
    """One candidate per output header over the department's non-reference tabs
    (§2.3). Every candidate carries `applies_to[]` — one member per (instance,
    column, row range) — so one concept is one entry however many books run it.
    """
    fields_by_letter, by_template = {}, {t["id"]: t for t in templates}
    for template in templates:
        for field in template["payload"]["fields"]:
            for inst_key, letter in field["columns"].items():
                fields_by_letter[(inst_key, letter)] = field["key"]
    columns, issues = collections.defaultdict(list), []
    for inst in instances:
        template = by_template[inst["template"]]
        if template["render"]["reference"]:
            continue
        dump = estate[inst["spreadsheetId"]]
        sheet = dump["sheets"][inst["sheet"]]
        header = sheet["head"][sheet["header_row"] - 1]
        titles = {_letters(col): fold(cell)
                  for col, cell in enumerate(header, start=1)}
        labels = (template["render"]["row_labels"] or {}).get(inst["key"], {})
        refs = _table_refs(dump, instances)
        shaped = []
        for row in _sheet_formulas(dump, inst["sheet"]):
            try:
                shaped.append((row, normalise(row["formula"], table_refs=refs)))
            except ValueError:      # a LET binding one name twice: no shape
                shaped.append((row, None))
        items = {}
        for row, shape in shaped:
            if shape and ITEM_PARAM in shape.params:
                for number in _rows_of(row["range"]):
                    items.setdefault(number, {})[_column_of(row["range"])] = \
                        "##%s" % shape.params[ITEM_PARAM]
        for row, shape in shaped:
            letter = _column_of(row["range"])
            title = titles.get(letter, "")
            span = f"{inst['sheet']}!{letter}"
            if (not title or _PLACEHOLDER.match(title) or _is_number(title)
                    or title in _MONTHS):
                issues.append(_issue("unheaded_formula", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=(letter or "").upper(),
                                     rows=row["range"]))
                continue
            if shape is None:
                issues.append(_issue("broken_formula", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"],
                                     error=_REBOUND))
                continue
            columns[title].append((inst, row, shape, letter,
                                   _rows_of(row["range"]), labels, items))
    candidates = []
    for title in sorted(columns):
        bindings, variants, blocks = [], [], []
        for inst, row, shape, letter, rows, labels, items in columns[title]:
            error = (row.get("error") or "").strip()
            span = f"{inst['sheet']}!{letter}"
            if error in _BROKEN:
                issues.append(_issue("broken_formula", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"],
                                     error=error))
                continue
            if is_bare_reference(shape.text):
                issues.append(_issue("no_rule_applies", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"]))
                continue
            if error in _CACHED:
                issues.append(_issue("cached_error", instance=inst["key"],
                                     target=span, sheet=inst["sheet"],
                                     column=letter.upper(), rows=row["range"],
                                     error=error))
            reads_a_table = bool(shape.functions & table_functions)
            mark = (sorted(shape.functions) if reads_a_table else shape.text)
            variant = next((v for v in variants if v["mark"] == mark), None)
            if variant is None:
                variant = {"key": f"v{len(variants) + 1}", "mark": mark,
                           "shape": shape.text,
                           "functions": sorted(shape.functions),
                           "table_reader": reads_a_table}
                variants.append(variant)
                blocks.append((row["range"], inst, row["formula"]))
            params = dict(shape.params)
            for key, value in params.items():
                if isinstance(value, dict) and "cell" in value:
                    params[key] = _resolve(value, inst, fields_by_letter)
            first = rows[0] if rows else 1
            bindings.append({
                "key": f"{inst['key']}__{letter}__r{first}",
                "record": {"ref": inst["template"],
                           "field": fields_by_letter.get((inst["key"], letter))},
                "variant": variant["key"], "range": row["range"],
                "params": params,
                "rows": [{"key": f"r{n}", "row": n,
                          "label": labels.get(str(n)),
                          "item": next((items.get(n, {})[c] for c in
                                        sorted(items.get(n, {}))), None)}
                         for n in rows] if labels else []})
        if not bindings:
            continue
        for variant in variants:
            variant.pop("mark")
        original = "\n\n".join(
            f"# {inst['key']}__{_column_of(span)}__r{(_rows_of(span) or [1])[0]}\n"
            + formula.replace("\\n", "\n").replace("\\t", "\t")
            for span, inst, formula in blocks)
        if any(v["table_reader"] for v in variants):
            first_inst, first_letter = columns[title][0][0], columns[title][0][3]
            issues.append(_issue("hand_maintained_index",
                                 instance=first_inst["key"],
                                 sheet=first_inst["sheet"],
                                 column=first_letter.upper()))
        heads = []
        for binding in bindings:
            for value in binding["params"].values():
                if isinstance(value, dict) and value.get("field"):
                    field = next(f for f in by_template[binding["record"]["ref"]]
                                 ["payload"]["fields"] if f["key"] == value["field"])
                    if field["title"] and field["title"] not in heads:
                        heads.append(field["title"])
        candidates.append({
            "id": _sid("r", department, title), "kind": "rule", "unit": None,
            "payload": {"original": original,
                        "applies_to": sorted(bindings, key=lambda b: b["key"])},
            "render": {"output": title, "variants": variants,
                       "input_headers": heads,
                       "calls": sorted({f for v in variants
                                        for f in v["functions"]})}})
    return candidates, issues


def script_rules(estate, department, called):
    """A `.gs` function no sheet formula calls, containing arithmetic or a
    conditional, is a rule candidate in the unit of the workbook that owns the
    script (§2.3). Everything else is library only.

    ponytail: "arithmetic or a conditional" is one regex, so a plumbing routine
    with a loop counter is minted too and the unit drops it under U1. Tighten
    only if the drop rate is what a run complains about.
    """
    out = []
    for _, dump in sorted(estate.items()):
        row = dump["row"]
        if department not in (row.get("departments") or []):
            continue
        for script in row.get("scripts") or []:
            path = dump["sheets_root"] / script
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            starts = [(m.group(1), m.start()) for m in _GS_FUNCTION.finditer(text)]
            for i, (name, start) in enumerate(starts):
                end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
                body = text[start:end].strip()
                if name in called or not _GS_LOGIC.search(body):
                    continue
                out.append({"id": _sid("gs", row["short"], name), "kind": "rule",
                            "unit": None,
                            "payload": {"original": body, "applies_to": []},
                            "render": {"output": name, "variants": [],
                                       "input_headers": [], "calls": [],
                                       "script": script}})
    return out
