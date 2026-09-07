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
import json
import math
import pathlib
import re
import sys
import textwrap

from dump_workbook import is_ids_tab, is_mirror_tab, manifest_reconcile
from engine_common import (read_json, schema_dir, write_json_atomic,
                           write_text_atomic)
from merge_facts import is_open, sha256_file

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

# §2.3: these describe a tab that becomes no record, a cell that becomes no
# rule, or (§3.7) a file nothing read, so they are reported and counted but
# never attached to an entry.
RUN_ONLY = frozenset({"reference_tab_is_mirror", "reference_tab_is_ids",
                      "reference_tab_computes", "row_labels_ambiguous",
                      "row_labels_partial", "unheaded_formula",
                      "unread_attachment"})

# One Persian sentence per issue kind — `gate-b.md` and `report.md` print these
# verbatim, so no caller ever composes owner-facing prose (QF-54).
ISSUE_TEXT = {
    "column_offset": "ستون «{field}» در نسخه‌های مختلف در جای یکسانی نیست: {detail}.",
    "cross_record": "فهرست مقادیر مجاز ستون «{field}» بین نسخه‌ها یکی نیست: {detail}.",
    "ambiguous_row_header": "عنوان «{field}» در تب «{sheet}» روی بیش از یک "
                            "ستون تکرار شده است: {detail}.",
    "row_labels_partial": "نام سطرها فقط در بعضی نسخه‌ها ثبت شده است: {detail}.",
    "row_labels_ambiguous": "ستون نام سطرها در نسخه‌ها یکسان نیست: {detail}.",
}


def _issue(kind, *, instance=None, target=None, **fields):
    return {"kind": kind, "instance": instance, "target": target,
            "engine": True, "run_only": kind in RUN_ONLY,
            "description": ISSUE_TEXT[kind].format(**fields)}


def _where(inst, estate):
    """One tab as the **owner** names it: the workbook's file title, its branch
    in Persian, and the tab name. `instance` on the issue is the key the engine
    matches on; `description` reaches `gate-b.md` and `report.md`, so nothing in
    it may be an id (§2.7). Two books of one line share a file title, which is
    why the branch is here."""
    dump = estate[inst["spreadsheetId"]]
    book = pathlib.Path(dump["row"].get("file") or "").stem
    branch = "، ".join(dump.get("branches_fa") or [])
    return (f"«{book}»" + (f" ({branch})" if branch else "")
            + f' تب «{inst["sheet"]}»')


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
    manifest = read_json(sheets_root / "manifest.json")
    # The branch's own Persian name, carried per workbook so an owner-facing
    # issue description can say which of two identically named books it means
    # without naming an instance key (§2.7).
    branch_names = {b["code"]: b["name"] for b in manifest.get("branches") or []}
    estate = {}
    for row in manifest["workbooks"]:
        dump = sheets_root / ".dump" / row["spreadsheetId"]
        if not (dump / "sheets.json").exists():
            continue
        estate[row["spreadsheetId"]] = {
            "row": row, "short": row["short"], "sheets_root": sheets_root,
            "branches_fa": [branch_names.get(c, c)
                            for c in row.get("branches") or []],
            "sheets": {s["name"]: s
                       for s in read_json(dump / "sheets.json")["sheets"]},
            "formulas": _tsv(dump / "formulas.tsv"),
            "rows": _tsv(dump / "rows.tsv"),
            "names": {n["name"]: n["formula"] for n in _tsv(dump / "names.tsv")},
            "validations": _tsv(dump / "validations.tsv"),
            # The context §2.3 lists (T12) and the dump's own bookkeeping. A
            # dump written before these files existed simply has none.
            "cf": _tsv(dump / "cf.tsv"),
            "comments": _tsv(dump / "comments.tsv"),
            "meta": (read_json(dump / "meta.json")
                     if (dump / "meta.json").exists() else {})}
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
    named = {inst["key"]: _where(inst, estate) for inst in group}
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
            # A tab may head two of its own columns alike — `gozareshat!مغایرت`
            # heads both G and K «مغایرت». Keyed by title alone the second one
            # overwrote the first's letter, so the first column lost its field
            # and the rule bound to it was left with none: an occurrence of a
            # title this instance already has mints a field of its own.
            occurrence = 0
            while (title, occurrence) in fields \
                    and inst["key"] in fields[(title, occurrence)]["columns"]:
                occurrence += 1
            ident = (title, occurrence)
            if ident not in fields:
                fields[ident] = {"key": f"c_{letter}", "title": title or None,
                                 "columns": {}, "type": "string"}
                order.append(ident)
            if occurrence:
                before = fields[(title, occurrence - 1)]["columns"][inst["key"]]
                issues.append(_issue("ambiguous_row_header",
                                     instance=inst["key"], sheet=inst["sheet"],
                                     field=title or "—",
                                     detail="، ".join((before.upper(),
                                                       letter.upper()))))
            fields[ident]["columns"][inst["key"]] = letter
            samples = [row[col - 1] for row in sheet["head"][sheet["header_row"]:]
                       if col <= len(row) and str(row[col - 1]).strip()]
            if samples and all(_is_number(s) for s in samples):
                fields[ident]["type"] = "number"
            values = _enum(dump, inst["sheet"], letter)
            if values is not None:
                seen = fields[ident].setdefault("_enums", [])
                seen.append((inst["key"], values))
    out = []
    for ident in order:
        field, title = fields[ident], ident[0]
        enums = field.pop("_enums", [])
        if enums:
            keep = [v for v in enums[0][1] if all(v in e for _, e in enums)]
            field["constraints"] = {"enum": keep}
            if any(e != enums[0][1] for _, e in enums):
                issues.append(_issue("cross_record", field=title or "—",
                                     detail="، ".join(named[k]
                                                      for k, _ in enums)))
        letters = sorted(set(field["columns"].values()))
        if len(letters) > 1:
            detail = "، ".join(f"{named[k]}: {v}"
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
    detail = "، ".join(_where(i, estate) for i in group)
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
    repeated = collections.defaultdict(list)
    for col, cell in enumerate(header_row, start=1):
        if fold(cell):
            repeated[fold(cell)].append(_letters(col).upper())
    issues = [_issue("ambiguous_row_header", sheet=sheet_name, field=title,
                     detail="، ".join(letters))
              for title, letters in sorted(repeated.items()) if len(letters) > 1]
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
            for name, body in _script_functions(path.read_text(encoding="utf-8")):
                out.setdefault(name, body)
    return out


def _calls(body):
    """The names a body calls. A `function name(` header is a declaration, not
    a call — left in, every script function would call itself."""
    return {m.group(1)
            for m in _FUNC.finditer(_GS_FUNCTION.sub("", body, count=1))}


def table_reading_functions(estate):
    """The functions that read a table or a sheet range — their own body does,
    or something they call does. §2.3 groups the variants of a column that
    calls one by the *set of called functions*, not by shape: their inlined
    food-id sets vary per row and are not parameters. The estate reads its
    tables one hop away (`getTotalFoodsIngredient` → `getIngredientValue` →
    `getRangeByName`), so the relation has to be the closure or the sentence
    catches almost nothing."""
    bodies = _bodies(estate)
    calls = {name: _calls(body) for name, body in bodies.items()}
    readers = {n for n, b in bodies.items() if _TABLE_READER.search(b)}
    while True:
        grown = readers | {n for n, c in calls.items() if c & readers}
        if grown == readers:
            return frozenset(readers)
        readers = grown


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
        called |= _calls(body)
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
            # `facts-delta.schema.json` refuses `field: null`, and a delta that
            # carries one is refused whole at Stage V — a lookup that misses
            # leaves the key out and the binding names the record alone.
            field = fields_by_letter.get((inst["key"], letter))
            bindings.append({
                "key": f"{inst['key']}__{letter}__r{first}",
                "record": {"ref": inst["template"],
                           **({"field": field} if field else {})},
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
            for name, body in _script_functions(path.read_text(encoding="utf-8")):
                if name in called or not _GS_LOGIC.search(body):
                    continue
                out.append({"id": _sid("gs", row["short"], name), "kind": "rule",
                            "unit": None,
                            "payload": {"original": body, "applies_to": []},
                            "render": {"output": name, "variants": [],
                                       "input_headers": [], "calls": [],
                                       "script": script}})
    return out


# --------------------------------------------------------------------------
# T12: import edges, context, the two slices, the function library and the
# skeleton (§2.3). Comparison folding is `fold` above; nothing here redeclares
# it, and nothing here reads a file the estate does not already carry.

ISSUE_TEXT.update({
    "unused_mirror": "تب «{sheet}» کپی می‌گیرد ولی هیچ فرمولی از آن نمی‌خواند.",
    "unknown_source": "تب «{sheet}» از فایلی کپی می‌گیرد که در فهرست فایل‌ها "
                      "نیست.",
    "column_shift": "ستون‌های «{columns}» در کپی تب «{sheet}» جا افتاده‌اند.",
    "leading_offset": "ستون اول جدول مبدأ («{sheet}») نام ندارد و ستون‌های "
                      "تاریخ یکی جابه‌جا خوانده می‌شوند.",
    "reference_tab_is_mirror": "تب «{sheet}» در «{workbook}» جدول مرجع علامت "
                               "خورده بود ولی فقط کپی جدولی در جای دیگر است.",
    "reference_tab_is_ids": "تب «{sheet}» در «{workbook}» جدول مرجع علامت خورده "
                            "بود ولی فهرست شناسهٔ فایل‌هاست.",
    "reference_tab_computes": "تب «{sheet}» در «{workbook}» جدول مرجع علامت "
                              "خورده بود ولی خودش فرمول دارد.",
})

# A maximal run of identifier characters. `name in _IDENT_TOKEN.findall(text)`
# is `_ident(text, name)` for every name at once, which is what keeps the
# consumer scan and the caller scan linear in the estate rather than
# names × formulas.
_IDENT_TOKEN = re.compile(r"[A-Za-z0-9_]+")


def _plain(formula):
    """`normalise` step (a) alone: the dump's `\\n`/`\\t` escapes as spaces.

    Without it the estate's own spelling — `LET(\\nsheetName,"خمیر",` — reads
    as the single identifier `nsheetName`, and every identifier that opens a
    line of a `LET` goes unseen."""
    return formula.replace("\\n", " ").replace("\\t", " ")


def _tokens(text):
    """The words a slice ranks on — folded, and short ones dropped so «و» and
    «به» do not decide which entry the unit gets to reuse."""
    return {t for t in re.split(r"\W+", fold(text).casefold()) if len(t) > 2}


def _col_index(letters):
    """`A` → 1, `AA` → 27 — the inverse of `_letters`."""
    n = 0
    for ch in letters.upper():
        n = n * 26 + ord(ch) - 64
    return n


def _ident(formula, name):
    """Does `formula` name `name` as an identifier — not as a fragment of a
    longer one (`Salon_Recipts_Chalebagh` must not match `Salon_Recipts`)? The
    dump's escapes go first, or the `n` of a `\\n` counts as a leading letter
    and a name at the head of a `LET` line is never found."""
    return re.search(rf"(?<![A-Za-z0-9_]){re.escape(name)}(?![A-Za-z0-9_])",
                     _plain(formula)) is not None


# --------------------------------------------------------------------------
# import edges (QF-48) — a mirror tab is an edge, never an entry.

_IMPORT_CALL = re.compile(r"IMPORT_FROM_SHEET\s*\(\s*([^,()]+?)\s*,\s*"
                          r"([^,()]+?)\s*,\s*([^,()]+?)\s*\)")
_IDS_CELL = re.compile(r"^'?([^'!]+?)'?!\$?([A-Z]{1,3})\$?([0-9]+)$")
_WHOLE_TAB = re.compile(r"^'?([^'!]+?)'?!\$?[A-Z]{0,3}\$?[0-9]*"
                        r"(?::\$?[A-Z]{0,3}\$?[0-9]*)?$")
_DATE_FN = re.compile(r"FORMAT_PERSIAN_DATE|FILTER_BY_DATE|"
                      r"GET_(?:CELL_VALUE|ROW)_BY_PERSIAN_DATE")


def _import_only(row):
    """`is_mirror_tab`'s body test without its A1 test — a cell whose whole
    formula is one `IMPORT_FROM_SHEET`. On a tab that is not a whole mirror
    such a cell copies one cell, which is §2.3's `per_cell_mirror`."""
    probe = [row.get(c, "") for c in _FORMULA_COLUMNS]
    probe[1] = "A1"
    return is_mirror_tab([probe])


def _argument(formula, arg):
    """An `IMPORT_FROM_SHEET` argument as a value: a quoted literal is itself,
    a bare identifier is the literal the same `LET` bound to it — the estate
    always writes `sheetName,"خمیر"` and passes `sheetName`."""
    arg = arg.strip()
    if arg.startswith('"'):
        return arg.strip('"')
    m = re.search(rf'(?<![A-Za-z0-9_]){re.escape(arg)}\s*,\s*"([^"]*)"', formula)
    return m.group(1) if m else arg


def _column_name(dump, tab, letters):
    """`rows.tsv` names its columns by header text, so a `$B$7` is read back
    through the header row of the same tab; an empty header cell falls back to
    the column letter, exactly as `dump_workbook._reference_rows` does."""
    sheet = dump["sheets"].get(tab) or {}
    head = sheet.get("head") or []
    header = sheet.get("header_row")
    row = head[header - 1] if header and header <= len(head) else []
    index = _col_index(letters)
    return (row[index - 1].strip() if index <= len(row) else "") or letters


def resolve_source(dump, named_range):
    """The three hops of §2.3: a named range → a cell of the ids tab → the
    spreadsheetId that cell holds. `None` when any hop misses."""
    m = _IDS_CELL.match((dump["names"].get(named_range) or "").strip())
    if not m:
        return None
    tab, letters, row = m.group(1), m.group(2), m.group(3)
    column = _column_name(dump, tab, letters)
    for line in dump["rows"]:
        if line.get("sheet") == tab and str(line.get("row")) == row:
            return (line.get(column) or "").strip() or None
    return None


def mirror_names(dump, tab):
    """The names a consumer formula can call a mirror by — a whole-tab defined
    name, plus the tab's own name when it is a `Table_*` identifier (§2.3(e)
    rewrites that one to `$T`). Nothing else reaches a mirrored table."""
    out = set()
    for name, formula in dump["names"].items():
        m = _WHOLE_TAB.match(formula.strip())
        if m and m.group(1) == tab:
            out.add(name)
    if tab.startswith("Table_"):
        out.add(tab)
    return sorted(out)


def _range_columns(rng, width):
    """`A:D` → `(1, 4)`; a range naming no column covers the whole header."""
    letters = re.findall(r"[A-Z]{1,3}", (rng or "").upper())
    if not letters:
        return 1, width
    return _col_index(letters[0]), _col_index(letters[-1])


def _range_issues(source_dump, sheet_name, rng, instance, date_logic):
    """What the pull drops, and whether it starts one column late (§2.3). An
    empty or `Column \\d+` header is not a named column, so dropping it costs
    the consumer nothing and raises nothing."""
    sheet = (source_dump or {}).get("sheets", {}).get(sheet_name)
    if not sheet or not sheet.get("header_row"):
        return []
    header = (sheet["head"] or [[]])[sheet["header_row"] - 1]
    first, last = _range_columns(rng, len(header))
    dropped = [h.strip() for i, h in enumerate(header, start=1)
               if not first <= i <= last and h.strip()
               and not _PLACEHOLDER.match(h.strip())]
    out = []
    if dropped:
        out.append(_issue("column_shift", instance=instance, sheet=sheet_name,
                          columns="»، «".join(dropped)))
    lead = header[0].strip() if header else ""
    if date_logic and first == 1 and (not lead or _PLACEHOLDER.match(lead)):
        out.append(_issue("leading_offset", instance=instance, sheet=sheet_name))
    return out


def import_edges(estate, refs, department=None):
    """`(imports[], issues[])` for every mirror tab of the department (QF-48).

    `refs` maps `(spreadsheetId, sheet)` onto the ref the source record already
    has — `S-rec-…` for a template of this run, `F-…` for one in the store; a
    pair missing from it leaves the edge on its locator, which every reader
    accepts (§10). One member is written per consumer instance, because that is
    where `imports[]` lives on the entry. A mirror and the formulas that read
    it always sit in one workbook, so `department` filters the outer loop while
    the whole estate stays available for the source side of a hop.
    """
    edges, issues = [], []
    for sid, dump in sorted(estate.items()):
        if department is not None and \
                department not in (dump["row"].get("departments") or []):
            continue
        short = dump["short"]
        by_tab, scan = {}, []
        for row in dump["formulas"]:
            by_tab.setdefault(row.get("sheet"), []).append(row)
            scan.append((row.get("sheet"), row,
                         set(_IDENT_TOKEN.findall(_plain(row.get("formula", ""))))))
        for tab, sheet in sorted(dump["sheets"].items()):
            rows = by_tab.get(tab, [])
            here = f'{short}__s{sheet["sheetId"]}'
            if not _is_mirror(rows):
                if any(_import_only(row) for row in rows):
                    issues.append(_issue("per_cell_mirror", instance=here,
                                         sheet=tab))
                continue
            text = _plain(rows[0].get("formula", ""))
            call = _IMPORT_CALL.search(text)
            if call is None:
                continue
            named_range = call.group(1).strip()
            source_id = resolve_source(dump, named_range)
            if source_id is None or source_id not in estate:
                issues.append(_issue("unknown_source", instance=here, sheet=tab))
                continue
            source_sheet = _argument(text, call.group(2))
            rng = _argument(text, call.group(3))
            names = set(mirror_names(dump, tab))
            reading = [(name, row) for name, row, idents in scan
                       if name != tab and idents & names]
            consumers = sorted({f'{short}__s{dump["sheets"][name]["sheetId"]}'
                                for name, _ in reading if name in dump["sheets"]})
            if not consumers:
                issues.append(_issue("unused_mirror", instance=here, sheet=tab))
            source = refs.get((source_id, source_sheet)) \
                or {"spreadsheetId": source_id, "sheet": source_sheet}
            for consumer in consumers:
                edges.append({"consumer": consumer, "source": source,
                              "range": rng, "named_range": named_range})
            issues += _range_issues(estate.get(source_id), source_sheet, rng,
                                    here,
                                    any(_DATE_FN.search(row.get("formula", ""))
                                        for _, row in reading))
    return edges, issues


def reference_tab_issues(estate, department=None):
    """§2.2's three `reference_tab_*` findings, over a **copy** of each manifest
    row: the estate on disk is already reconciled, so a real run finds nothing,
    but a row confirmed before its tab became a mirror still has to reach
    `skeleton.json` once. The row itself is never repaired from here — that is
    `dump-workbook`'s job, and `build` only reports."""
    out = []
    for sid, dump in sorted(estate.items()):
        row = dump["row"]
        if department is not None and \
                department not in (row.get("departments") or []):
            continue
        copy = {**row, "reference_tabs": list(row.get("reference_tabs") or [])}
        for issue in manifest_reconcile(copy, {
                "sheets": {"sheets": list(dump["sheets"].values())},
                "formulas": [[f.get(c, "") for c in _FORMULA_COLUMNS]
                             for f in dump["formulas"]]}):
            sheet = dump["sheets"].get(issue["sheet"]) or {}
            out.append(_issue(
                issue["kind"], sheet=issue["sheet"],
                instance=f'{dump["short"]}__s{sheet.get("sheetId")}',
                workbook=pathlib.Path(row.get("file") or "").stem))
    return out


# --------------------------------------------------------------------------
# context, the two slices, the library

_NEEDS_TAB = fold("نیازمندیها و مشکلات")


def _business_threshold(row):
    """A colour rule earns its place when it matches text or compares against a
    number that is not zero — a sign test at zero is formatting, not a rule."""
    kind = row.get("type", "")
    if "containsText" in kind or '"' in kind:
        return True
    try:
        return float(row.get("formula", "")) != 0
    except ValueError:
        return False


def context_items(estate, sids):
    """The context §2.3 lists — cell comments, the conditional formats that
    carry a business threshold, and the «نیازمندیها و مشکلات» rows. A sign test
    at zero and a rule with no format are filtered out here, so the model never
    spends a decision on them, and none of this is ever a candidate."""
    out = []
    for sid in sorted(sids):
        dump = estate[sid]
        for row in dump["comments"]:
            out.append({"kind": "comment", "sheet": row.get("sheet", ""),
                        "where": row.get("cell", ""),
                        "text": row.get("text", "")})
        for row in dump["cf"]:
            if row.get("format", "").strip() and _business_threshold(row):
                out.append({"kind": "cf", "sheet": row.get("sheet", ""),
                            "where": row.get("range", ""),
                            "text": f'{row.get("type", "")} '
                                    f'{row.get("formula", "")} → {row["format"]}'})
        for name, sheet in sorted(dump["sheets"].items()):
            if fold(name) != _NEEDS_TAB:
                continue
            for line in sheet.get("head") or []:
                text = " | ".join(c for c in line if c.strip())
                if text:
                    out.append({"kind": "note_tab", "sheet": name,
                                "where": "", "text": text})
    return out


def rank(rows, tokens, cap, text):
    """First `cap` rows by tokens shared with the unit, ties by the caller's own
    order — which is why the reuse slice sorts its rows by id first (§2.3)."""
    scored = sorted(enumerate(rows),
                    key=lambda pair: (-len(tokens & _tokens(text(pair[1]))),
                                      pair[0]))
    return [row for _, row in scored[:cap]]


def reuse_slice(own, index, item_units, department, tokens, cap=40):
    """This run's own record and item candidates first, unranked, then the
    store's open entries in this department or the universal scope, ranked and
    capped. The unit reuses a key off these lines or mints a new one; it never
    searches (§2.4)."""
    lines = [f'{c["id"]} · {c["kind"]} · {c["label"]}' for c in own]
    rows = sorted((r for r in index
                   if not r.get("retired")
                   and department in ((r.get("scope") or {}).get("departments")
                                      or [department])),
                  key=lambda r: r["id"])
    for row in rank(rows, tokens, cap,
                    lambda r: " ".join([r["title"], r["key"]]
                                       + (r.get("aliases") or []))):
        lines.append(" · ".join(x for x in [
            row["id"], row["kind"], row["key"], row["title"],
            "، ".join(row.get("aliases") or []), item_units.get(row["id"])] if x))
    return lines


def process_index(root, department):
    """`{process, node, label}` for every labelled node of the department's
    processes — the whole index a citation is checked against; the unit sees a
    ranked slice of it (§2.3)."""
    out = []
    directory = pathlib.Path(root) / "departments" / department / "processes"
    for path in sorted(directory.glob("*.json")):
        doc = read_json(path)
        for node in doc.get("nodes") or []:
            if node.get("label"):
                out.append({"process": doc["id"], "node": node["id"],
                            "label": node["label"]})
    return out


def _script_functions(text):
    """`[(name, body)]` from a `.gs` file — each `function name(` header up to
    the next one, which is how the estate's four scripts are written."""
    starts = [(m.group(1), m.start()) for m in _GS_FUNCTION.finditer(text)]
    return [(name, text[start:(starts[i + 1][1] if i + 1 < len(starts)
                               else len(text))].strip())
            for i, (name, start) in enumerate(starts)]


def _add_section(sections, name, kind, definer, body):
    """One section per (folded body, name) — that is what makes one function
    defined in nine workbooks one section with nine definers."""
    section = sections.setdefault(("".join(body.split()), name),
                                  {"name": name, "kind": kind, "definers": [],
                                   "body": body})
    if definer not in section["definers"]:
        section["definers"].append(definer)


def function_library(estate):
    """`functions.md`'s body (§3.4) — one section per distinct body over the
    whole estate: name, kind, definers, callers, the verbatim body. The estate
    already knows where its scripts are, so this takes no second argument."""
    sections = library_sections(estate)
    names = {s["name"] for s in sections.values()}
    calls = {name: [] for name in names}
    for sid, dump in sorted(estate.items()):
        for row in dump["formulas"]:
            hits = names & set(_IDENT_TOKEN.findall(_plain(row.get("formula", ""))))
            for name in sorted(hits):
                calls[name].append(f'{dump["short"]} · '
                                   f'{row.get("sheet")}!{row.get("range")}')
    out = ["# کتابخانهٔ توابع", "",
           "این فایل توسط `facts-plan build` ساخته می‌شود و هیچ ورودی‌ای در "
           "انبارهٔ داده‌ها ندارد.", ""]
    for section in sorted(sections.values(),
                          key=lambda s: (s["name"], s["body"])):
        out += [f'## {section["name"]} ({section["kind"]})', "",
                "تعریف‌شده در: " + "، ".join(section["definers"]), "",
                "فراخوانی: " + ("، ".join(calls[section["name"]][:20]) or "—"), "",
                "```", section["body"], "```", ""]
    return "\n".join(out)


# --------------------------------------------------------------------------
# what the store lends the build

def unit_symbols(root):
    """The open row keys of the `units` record — the lint's exemption list
    (§2.3), and one of the only two payload facts `build` reads off the store."""
    try:
        doc = read_json(pathlib.Path(root) / "facts" / "records.json")
    except (OSError, ValueError):
        return []
    for entry in doc.get("entries") or []:
        if entry.get("key") == "units" and is_open(entry):
            return sorted(r["key"] for r in (entry.get("data") or {}).get("rows")
                          or [] if r.get("key") and is_open(r))
    return []


def write_skeleton(run_dir, department, run, symbols, candidates, instances,
                   imports, issues):
    """`skeleton.json` — the only place the mechanical payload lives (§2.3);
    `plan.json` carries ids alone."""
    path = pathlib.Path(run_dir) / "skeleton.json"
    write_json_atomic(path, {"schema_version": 1, "department": department,
                             "run": run, "unit_symbols": symbols,
                             "candidates": candidates, "instances": instances,
                             "imports": imports, "issues": issues})
    return path


# --------------------------------------------------------------------------
# T13: units of work (QF-51) — the grouping is fixed, not packed.

_BRANCH_TOKEN = re.compile(r"chale ?bagh|nahar ?khoran", re.I)
IN_BUDGET, OUT_BUDGET = 20000, 20000
MAX_LINES, MAX_LINE = 1800, 1900
EST_OUT = {"item": 120, "rule": 250, "script": 250}


def group_key(row):
    """The workbook group §2.3 fixes: the manifest `dir` with the branch token
    taken out **wherever it sits** — the estate spells it as its own segment
    (`MandeShab__ChaleBagh__Amar__Kanter`) and inside one (`Ashpazkhne -
    Chalebagh`), and both spellings have to land on one group."""
    bare = _BRANCH_TOKEN.sub("", row["dir"])
    return re.sub(r"[_\s-]+", "_", bare).strip("_").lower()


def is_reference_workbook(row, dump):
    """Every computing or tabular tab is a confirmed reference tab — the BOM
    book. It groups alone: its templates have no branch twin to merge with."""
    named = set(row.get("reference_tabs") or [])
    computing = {f.get("sheet") for f in dump["formulas"]}
    rest = [name for name, sheet in dump["sheets"].items()
            if not sheet.get("empty") and name not in named
            and not is_ids_tab(name) and name in computing]
    return bool(named) and not rest


def workbook_groups(manifest, department, reference_only=()):
    """`{group key: [manifest rows]}` — the fixed grouping, the `twin_of` pairs
    the estate needs for the two unnamed twins, and a reference workbook alone.

    ponytail: `twin_of` is resolved in one pass over pairs; the estate has two
    twins and no chains, and a union-find for two pairs is a joke.
    """
    rows = [w for w in manifest["workbooks"]
            if department in (w.get("departments") or []) and w.get("confirmed")]
    key_of = {w["short"]: (w["short"] if w["short"] in reference_only
                           else group_key(w)) for w in rows}
    for w in rows:
        twin = w.get("twin_of")
        if twin in key_of:
            key_of[w["short"]] = key_of[twin] = min(key_of[w["short"]],
                                                    key_of[twin])
    groups = {}
    for w in sorted(rows, key=lambda r: r["short"]):
        groups.setdefault(key_of[w["short"]], []).append(w)
    return groups


def transcript_chunks(text, budget=18000):
    """Line-aligned chunks under `budget` (§2.3). The rendered input carries the
    cards and the slices too, so a chunk's own budget is below the unit's."""
    lines = text.splitlines()
    if not lines:
        return [(1, 1)]
    chunks, first, size = [], 1, 0
    for n, line in enumerate(lines, start=1):
        cost = estimate_tokens(line) + 1
        if size and size + cost > budget:
            chunks.append((first, n - 1))
            first, size = n, 0
        size += cost
    chunks.append((first, len(lines)))
    return chunks


def est_tokens_out(candidates, est_tokens_in, is_transcript):
    """§2.3's estimator. The constants are frozen in `expected.json` (§7), so a
    retune shows up as a fixture diff and never as a silent resize."""
    total = 0
    for c in candidates:
        if c["kind"] == "record":
            total += 150 + 60 * len(c["payload"].get("fields") or [])
        else:
            total += EST_OUT[c["kind"]]
    return total + (int(est_tokens_in * 0.4) if is_transcript else 0)


def _view(candidate):
    """A candidate's `payload` laid over its `render` extras. The payload is
    exactly the mechanical `data` subset §2.5 leaves to the engine, so a rule's
    output header and variants and an item's labels live in `render` — only
    `input.md` needs them. Everything that reads one candidate *as a person
    sees it* wants the two merged, the payload winning."""
    return {**(candidate.get("render") or {}), **candidate["payload"]}


def label_of(candidate):
    """The candidate as a person reads it in a list — a record by its tab, a
    rule by the column header it computes, an item by its code."""
    payload = _view(candidate)
    if candidate["kind"] == "record":
        return (payload.get("instances") or [{}])[0].get("sheet", "")
    if candidate["kind"] == "item":
        return f'{payload.get("code", "")} ' \
               f'{(payload.get("labels") or [""])[0]}'.strip()
    return payload.get("output") or payload.get("name") or ""


def candidate_instances(candidate):
    """The instance keys a candidate sits on — a record's own, a rule's through
    its bindings, whose key is `<instance>__<column>__r<row>`."""
    payload = candidate["payload"]
    if candidate["kind"] == "record":
        return [i["key"] for i in payload.get("instances") or []]
    return ["__".join(m["key"].split("__")[:2])
            for m in payload.get("applies_to") or []]


def _code_slug(code):
    """`##1` → `ing1`, `#1` → `food1` — a unit id becomes a directory name and a
    log line, and `#` belongs in neither."""
    digits = code.lstrip("#")
    return ("ing" if code.startswith("##") else "food") + digits


def fits(unit, text):
    lines = text.split("\n")
    return (estimate_tokens(text) <= IN_BUDGET
            and unit["est_tokens_out"] <= OUT_BUDGET
            and len(lines) <= MAX_LINES and max(map(len, lines)) <= MAX_LINE)


def _axis_parts(unit, skeleton):
    """`[(axis, [candidate ids])]` — the natural sub-axis of a unit over
    budget: a workbook by the tab its candidates sit on, items by half their
    code range, a transcript by half its line range."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    if unit["type"] == "workbook":
        sheet_of = {i["key"]: i["sheetId"] for i in skeleton["instances"]}
        parts = {}
        for cid in unit["candidates"]:
            keys = candidate_instances(by_id[cid])
            axis = f's{min((sheet_of.get(k, 0) for k in keys), default=0)}'
            parts.setdefault(axis, []).append(cid)
        return sorted(parts.items())
    if unit["type"] == "items":
        ids = sorted(unit["candidates"])
        half = len(ids) // 2
        if not half:
            return []
        return [(_code_slug(by_id[part[0]]["payload"]["code"]), part)
                for part in (ids[:half], ids[half:])]
    first, last = (int(n[1:]) for n in
                   unit["inputs"][0].rsplit("#", 1)[1].split("-"))
    if last <= first:
        return []
    middle = (first + last) // 2
    path = unit["inputs"][0].rsplit("#", 1)[0]
    return [(f"l{a}", [f"{path}#L{a}-L{b}"])
            for a, b in ((first, middle), (middle + 1, last))]


def split_unit(unit, skeleton, render):
    """A unit over a bound splits along its axis and each part is named after
    it (`u-wb-gozaresh-s41`); a part with one axis value left cannot split, and
    `build` exits 2 rather than dispatch a unit that will be truncated."""
    parts = _axis_parts(unit, skeleton)
    if len(parts) < 2:
        print(f"facts-plan: unit {unit['id']} is over budget and has no axis "
              "left to split on", file=sys.stderr)
        raise SystemExit(2)
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    out = []
    for axis, members in parts:
        if unit["type"] == "workbook":
            part = dict(unit, id=f'{unit["id"]}-{axis}', candidates=members)
        elif unit["type"] == "items":
            part = dict(unit, id=f"u-items-{axis}", candidates=members)
        else:
            head = unit["id"].rsplit("-l", 1)[0]
            part = dict(unit, id=f"{head}-{axis}", inputs=members)
        text = render(part)
        part["est_tokens_in"] = estimate_tokens(text)
        part["est_tokens_out"] = est_tokens_out(
            [by_id[c] for c in part["candidates"]], part["est_tokens_in"],
            part["type"] == "transcript")
        out += [part] if fits(part, text) else split_unit(part, skeleton, render)
    return out


def plan_units(skeleton, groups, chunks, items, attachments, render=lambda u: ""):
    """`plan.json`'s `units[]` (§2.3) and, as a side effect, each candidate's
    `unit` — the two have to agree, so one function writes both.

    `chunks` is `[(recording, path, (first, last), text)]`, `items` the item
    candidate ids in code order, `attachments` the cached `.text`/`.md` paths;
    they are appended to the last transcript unit, or become one unit when the
    owner chose no recording (§2.3).
    """
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    units = []
    instance_book = {i["key"]: i["key"].split("__")[0]
                     for i in skeleton.get("instances") or []}
    key_of_short = {w["short"]: key for key, rows in groups.items() for w in rows}
    # A script rule sits on no instance: it belongs to the workbook whose
    # manifest row names the `.gs` file its body was read out of (§2.3).
    key_of_script = {s: key for key, rows in groups.items()
                     for w in rows for s in w.get("scripts") or []}
    members = collections.defaultdict(list)
    for cid, candidate in sorted(by_id.items()):
        homes = {}
        for instance in candidate_instances(candidate):
            short = instance_book.get(instance)
            if short in key_of_short:
                homes.setdefault(key_of_short[short], short)
        if len(homes) > 1:
            first, second = sorted(homes.values())[:2]
            print(f"facts-plan: candidate {cid} sits in both {first} and "
                  f"{second}, which the manifest keeps in two groups — one "
                  f"decision cannot live in two units; set twin_of on "
                  f"{first}/{second} in the manifest", file=sys.stderr)
            raise SystemExit(2)
        home = next(iter(homes), None) or key_of_script.get(
            (candidate.get("render") or {}).get("script"))
        if home:
            members[home].append(cid)
    for key, rows in sorted(groups.items()):
        mine = sorted(w["short"] for w in rows)
        if members.get(key):
            units.append({"id": f"u-wb-{mine[0]}", "type": "workbook",
                          "inputs": [w["file"] for w in rows],
                          "candidates": sorted(members[key]), "nodes": [],
                          "est_tokens_in": 0, "est_tokens_out": 0})
    for recording, path, (first, last), text in chunks:
        units.append({"id": f"u-tr-{recording}-l{first}", "type": "transcript",
                      "inputs": [f"{path}#L{first}-L{last}"], "candidates": [],
                      "nodes": [], "est_tokens_in": estimate_tokens(text),
                      "est_tokens_out": 0})
    if items:
        units.append({"id": f"u-items-{_code_slug(by_id[items[0]]['payload']['code'])}",
                      "type": "items", "inputs": [], "candidates": list(items),
                      "nodes": [], "est_tokens_in": 0, "est_tokens_out": 0})
    if attachments:
        transcripts = [u for u in units if u["type"] == "transcript"]
        if transcripts:
            transcripts[-1]["inputs"] += list(attachments)
        else:
            units.append({"id": "u-attachments", "type": "attachment",
                          "inputs": list(attachments), "candidates": [],
                          "nodes": [], "est_tokens_in": 0, "est_tokens_out": 0})
    out = []
    for unit in units:
        unit["est_tokens_out"] = est_tokens_out(
            [by_id[c] for c in unit["candidates"]], unit["est_tokens_in"],
            unit["type"] == "transcript")
        text = render(unit)
        unit["est_tokens_in"] = max(unit["est_tokens_in"], estimate_tokens(text))
        out += [unit] if fits(unit, text) else split_unit(unit, skeleton, render)
    for unit in out:
        for cid in unit["candidates"]:
            by_id[cid]["unit"] = unit["id"]
    # The plan's one invariant, checked in both directions: a candidate
    # decided twice contradicts itself at assemble, and one decided nowhere is
    # silently lost work.
    placed = collections.Counter(cid for unit in out for cid in unit["candidates"])
    twice = sorted(cid for cid, n in placed.items() if n > 1)
    nowhere = sorted(set(by_id) - set(placed))
    if twice or nowhere:
        print(f"facts-plan: {len(twice)} candidate(s) in two units {twice[:3]}, "
              f"{len(nowhere)} in none {nowhere[:3]}", file=sys.stderr)
        raise SystemExit(2)
    return out


def write_plan(run_dir, department, hashes, units):
    """`plan.json` — immutable build output: ids, budgets, and the digests
    `status` re-checks to report `plan_stale`."""
    path = pathlib.Path(run_dir) / "plan.json"
    write_json_atomic(path, {"schema_version": 1, "department": department,
                             "hashes": hashes, "units": units})
    return path


# --------------------------------------------------------------------------
# what a unit is allowed to know: `units/<u>/input.md` and the two cards (§2.4)

_CARDS = pathlib.Path(__file__).resolve().parent / "cards"


def library_sections(estate):
    """`{(folded body, name): section}` over the whole estate — what
    `functions.md` renders in full, and what a unit's input quotes the few
    lines of. One pass, two readers."""
    sections = {}
    for sid, dump in sorted(estate.items()):
        for name, formula in sorted(dump["names"].items()):
            if formula.lstrip().upper().startswith("LAMBDA("):
                _add_section(sections, name, "named", dump["short"], formula)
        for script in dump["row"].get("scripts") or []:
            path = dump["sheets_root"] / script
            if not path.exists():
                continue
            for name, body in _script_functions(path.read_text(encoding="utf-8")):
                _add_section(sections, name, "script", script, body)
    return sections


def called_bodies(sections, names):
    """The library sections a unit's own candidates call, verbatim (§2.3's
    context row) — the unit is deciding the caller, so it must be able to read
    what the caller computes without opening a file.

    ponytail: direct calls only. The estate's one two-hop chain
    (`getTotalFoodsIngredient` → `getIngredientValue`) is the reason the
    variant grouping exists at all, and pulling closures in would put the whole
    66 K library in a 20 K unit. Widen it if a unit ever drops for it.
    """
    names = set(names)
    return [f'### {s["name"]} ({s["kind"]})\n```\n{s["body"]}\n```'
            for _, s in sorted(sections.items()) if s["name"] in names]


def cards():
    """The expression and style cards, verbatim (§2.4). Files in the package,
    not string literals: the prompt is reviewable as prose, and a test can diff
    the expression card against the checker it was transcribed from."""
    return ((_CARDS / "expression.md").read_text(encoding="utf-8"),
            (_CARDS / "style.md").read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# the shape card (§3.2) — the store's closed contract, rendered from the schema
# it is checked against. The 2026-09-07 run refused 52 entries on shape alone
# because the unit was shown the expression and style cards and never the
# payload; a card typed out by hand would have drifted from the checker inside
# a release, so this is generated and the test holds it to the schema.

#: The `$defs` name of each kind's payload, in the order the card prints them.
KIND_DATA = {"item": "itemData", "record": "recordData",
             "measurement": "measurementData", "rule": "ruleData",
             "note": "noteData"}

#: The Persian word for each kind — the section headings are read by a model
#: writing Persian prose, so the heading names the thing in both languages.
KIND_FA = {"item": "قلم", "record": "جدول یا فرم", "measurement": "اندازه‌گیری",
           "rule": "قاعده", "note": "یادداشت"}

#: Every kind a unit may write. §2.5's `new[]` row restricts no unit to a kind
#: — the frozen `u-wb-fried.json` mints two `place` items from a workbook unit —
#: so every unit is shown all five.
WRITABLE_KINDS = ("item", "record", "measurement", "rule", "note")

#: `$defs` that are one line wherever they appear. Spelling `ref` out at each of
#: its twenty sites tripled the card and taught nothing the first site did not.
TERSE = {"ref": '{"ref": "S-…"} (+ field, row)',
         "refOrNull": '{"ref": "S-…"} یا null',
         "procRef": '{"ref": "cooking-030"}',
         "localCell": "{field, row}",
         "mintedKey": "key", "mintedSegment": "segment",
         "factId": "F-00001", "jalali": "1405-05-26",
         "iso": "2026-09-07T10:00:00Z"}


def _def_name(node):
    """The `$defs` name a node refers to, or `None` for an inline node."""
    return (node.get("$ref") or "").rsplit("/", 1)[-1] or None


def _deref(node, defs, seen):
    """The definition a `$ref` names, unless it is one of the short forms or one
    this branch already spelled out — those stay a `$ref` for `_atom` to print,
    which is also what stops a recursive `$defs` graph from recursing."""
    name = _def_name(node)
    if name and name not in TERSE and name not in seen:
        return defs[name], seen | {name}
    return node, seen


def _atom(node, seen):
    """One line's worth of a node, or `None` when it needs a block of its own."""
    name = _def_name(node)
    if name in TERSE:
        return TERSE[name]
    if name:
        return f"→ {name}، مثل بالا"
    if "enum" in node:
        return "یکی از: " + " | ".join("null" if v is None else str(v)
                                       for v in node["enum"])
    if node.get("oneOf"):
        parts = [_atom(branch, seen) for branch in node["oneOf"]]
        return " یا ".join(parts) if all(p is not None for p in parts) else None
    if node.get("properties"):
        return None
    kind = node.get("type")
    if kind == "array":
        return None
    return " | ".join(kind) if isinstance(kind, list) else (kind or "any")


def _block(node, defs, indent, seen):
    """Every key of one closed object, sorted, required ones marked `*`."""
    required = set(node.get("required") or [])
    out = []
    for key, sub in sorted((node.get("properties") or {}).items()):
        mark = "*" if key in required else " "
        sub, sub_seen = _deref(sub, defs, seen)
        tail = ""
        if sub.get("type") == "array":
            tail = "[]"
            sub, sub_seen = _deref(sub.get("items") or {}, defs, sub_seen)
        atom = _atom(sub, sub_seen)
        if atom is not None:
            out.append(f"{indent}{mark} {key}{tail}: {atom}")
            continue
        if sub.get("oneOf"):
            # A leaf the schema gives more than one shape (`ruleInput.from`):
            # every shape is spelled, because the one the card leaves out is the
            # one the unit invents a key for.
            out.append(f"{indent}{mark} {key}{tail}: یکی از این شکل‌ها —")
            for choice in sub["oneOf"]:
                choice, choice_seen = _deref(choice, defs, sub_seen)
                one = _atom(choice, choice_seen)
                if one is not None:
                    out.append(f"{indent}    - {one}")
                else:
                    out.append(f"{indent}    -")
                    out += _block(choice, defs, indent + "      ", choice_seen)
            continue
        out.append(f"{indent}{mark} {key}{tail}:")
        out += _block(sub, defs, indent + "    ", sub_seen)
    return out


def _location_lines(record, indent):
    """§3.3's `location`, one line per `medium` — read off the `if`/`then` pairs
    the schema chooses the shape with, never a table typed here."""
    out = [f"{indent}`location` بر حسب `medium`:"]
    for branch in record.get("allOf") or []:
        medium = ((branch.get("if") or {}).get("properties")
                  or {}).get("medium", {}).get("const")
        shape = ((branch.get("then") or {}).get("properties") or {}).get("location")
        if not medium or not shape:
            continue
        required = set(shape.get("required") or [])
        out.append(f"{indent}  medium={medium}: " + "، ".join(
            key + ("*" if key in required else "")
            for key in sorted(shape.get("properties") or {})))
    return out


#: Three `new[]` entries a unit can copy — a paper form (the case the first run
#: had no shape for), a measurement, and a rule reading its parameters. A test
#: validates all three against `facts-delta.schema.json`, so an example the
#: schema would refuse cannot ship.
EXAMPLES = [
    {"kind": "record", "key": "form_tahvil_anbar",
     "title": "فرم تحویل کالا از انبار",
     "statement": "فرم کاغذی که هنگام تحویل هر قلم از انبار به لاین پر می‌شود و "
                  "مقدار تحویلی و تحویل‌گیرنده را ثبت می‌کند.",
     "data": {"medium": "paper", "role": "log",
              "location": {"kept_at": "دفتر انبار", "holder": "سرپرست انبار"},
              "cadence": "daily", "grain": "هر تحویل",
              "filled_by": "انباردار", "approved_by": "سرپرست آشپزخانه",
              "blank_master": True,
              "fields": [
                  {"key": "tarikh", "title": "تاریخ", "type": "date"},
                  {"key": "qalam", "title": "نام کالا", "type": "string",
                   "refItems": {"namespace": "##", "resolved_by": "title"}},
                  {"key": "meqdar", "title": "مقدار", "type": "number",
                   "unit": "kg"},
                  {"key": "tahvil_girande", "title": "تحویل‌گیرنده",
                   "type": "string"}],
              "signatures": [{"role": "انباردار"},
                             {"role": "سرپرست آشپزخانه"}],
              "primaryKey": ["tarikh", "qalam"]}},
    {"kind": "measurement", "key": "vazn_morgh_vorudi",
     "title": "وزن مرغ ورودی",
     "statement": "وزن هر محموله مرغ هنگام تحویل با ترازوی انبار اندازه گرفته "
                  "می‌شود و در فرم تحویل ثبت می‌شود.",
     "data": {"quantity": "mass", "unit": "kg",
              "method": "ترازوی دیجیتال انبار", "when": "هنگام تحویل محموله",
              "by": "انباردار",
              "exceptions": "محموله‌های بسته‌بندی‌شده با وزن چاپی دوباره وزن "
                            "نمی‌شوند."}},
    {"kind": "rule", "key": "enheraf_ba_tolerance",
     "title": "انحراف مصرف با تلورانس",
     "statement": "انحراف مصرف هر ماده اولیه پس از کسر تلورانس مجاز به دست "
                  "می‌آید؛ مقدار مثبت یعنی مصرف بیش از انتظار بوده است.",
     "data": {"lang": "feel",
              "expr": "enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis",
              "inputs": [
                  {"key": "enheraf", "title": "انحراف مصرف", "unit": "kg"},
                  {"key": "tolerance_gr", "title": "تلورانس", "unit": "g",
                   "from": {"param": "tolerancePerFoodGr"}},
                  {"key": "basis", "title": "مبنای تلورانس",
                   "from": {"param": "ref_1"}}],
              "outputs": [{"key": "enheraf_ba_tolerance",
                           "title": "انحراف با تلورانس", "unit": "kg",
                           "nature": "observed"}]}}]


def shape_card(kinds, schema):
    """The shape section (§3.2) for `kinds`, rendered from `schema`.

    The agent's rule, stated at the top of the card: a key not listed here is
    refused. Everything below the heading is generated — the key lists, the
    required marks, the enums, the column types, `location` per medium — so the
    card and `validate facts-unit` cannot disagree.
    """
    defs = schema["$defs"]
    wanted = set(kinds)
    out = ["# Shape card", "",
           "قرارداد بستهٔ انبار، ساخته‌شده از همان طرحواره‌ای که خروجی این واحد",
           "در برابر آن بررسی می‌شود. کلیدی که اینجا نیامده باشد پذیرفته",
           "نمی‌شود؛ هیچ کلیدی ساخته نمی‌شود و مقداری بیرون از فهرست مجاز هم",
           "رد می‌شود.",
           "`*` یعنی کلید الزامی است؛ `key` یک کلید ضرب‌شده (`a_b__c_d`) و",
           "`segment` یک بخش از آن (`a_b`) است.", ""]
    for kind, data_def in KIND_DATA.items():
        if kind not in wanted:
            continue
        data = defs[data_def]
        out += [f"## {kind} — data ({KIND_FA[kind]})", ""]
        out += _block(data, defs, "", {data_def})
        if kind == "record":
            out += [""] + _location_lines(data, "")
        out.append("")
    out += ["## نمونه‌های کامل `new[]`", ""]
    for example in EXAMPLES:
        if example["kind"] in wanted:
            out += ["```json",
                    json.dumps(example, ensure_ascii=False, indent=2),
                    "```", ""]
    return "\n".join(out)


def shape_section():
    """`shape_card` over the schema on disk, for every kind a unit may write.

    The **delta** schema, not the store's: a unit writes a delta entry and
    `validate_unit` validates it against `facts-delta.schema.json`, so that is
    the contract it is held to. The two payload definitions are the same one
    everywhere but `original`/`original_ref` — a unit hands over a rule's
    verbatim text as `original` and `merge facts apply` is what turns it into
    the store's `original_ref` — and a card off the store schema would show the
    unit a key its own gate refuses.

    ponytail: the schema is re-read once per unit (fifteen 12 KB reads a run).
    Cache it when a build ever spends measurable time here.
    """
    return shape_card(WRITABLE_KINDS,
                      read_json(schema_dir() / "facts-delta.schema.json"))


def _render_candidate(candidate, skeleton):
    payload, kind = _view(candidate), candidate["kind"]
    if kind in ("rule", "script"):
        variants = payload.get("variants") or [{}]
        params = sorted({k for m in payload.get("applies_to") or []
                         for k in (m.get("params") or {})})
        # One shape per line: the estate's five-variant columns run to nearly
        # 4,000 characters joined, and §2.3's 1,900-character line is a bound
        # no split can relieve — the axis divides candidates, never a line.
        return "\n".join(
            [f'{candidate["id"]} · «{label_of(candidate)}» · '
             f'{len(variants)} variant · '
             f'{len(payload.get("applies_to") or [])} bindings · '
             f'params: {"، ".join(params) or "—"}']
            + [f'    {v.get("shape", "")}' for v in variants])
    if kind == "record":
        instances = "، ".join(f'{i["key"]} ({i.get("branch") or "—"})'
                              for i in payload.get("instances") or [])
        fields = "، ".join(
            f'{f["key"]}={f.get("title") or "—"}[{f.get("type") or "?"}]'
            for f in payload.get("fields") or [])
        notes = " | ".join(f'{n["column"]}: {n["text"]}'
                           for n in payload.get("header_notes") or [])
        # `row_labels` is per instance (`{instance key: {row: label}}`); one
        # tab's two branch copies label the same rows, so the union reads once.
        labels = {f"r{row}={label}"
                  for mapping in (payload.get("row_labels") or {}).values()
                  for row, label in mapping.items()}
        return (f'{candidate["id"]} · «{label_of(candidate)}» · {instances}\n'
                f'    fields: {fields}\n'
                f'    header notes: {notes or "—"}\n'
                f'    row labels: {"، ".join(sorted(labels)) or "—"}')
    return (f'{candidate["id"]} · {payload.get("code")} · '
            f'{"، ".join(payload.get("labels") or [])}')


def render_input(unit, skeleton, extras):
    """`units/<u>/input.md` — everything the unit is allowed to know (§2.3). It
    reads this file and the schema, and nothing else: what is not here is a
    `drop` with `insufficient_context`, never a search (§2.4)."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    expression, style = cards()
    out = [f'# {unit["id"]}', "",
           f'نوع: {unit["type"]} — {len(unit["candidates"])} نامزد تصمیم', "",
           "## نامزدها", ""]
    out += [_render_candidate(by_id[c], skeleton) for c in unit["candidates"]] or ["—"]
    if extras.get("text"):
        out += ["", "## متن", "", extras["text"]]
    if extras.get("functions"):
        # No section at all when the unit's candidates call nothing — an empty
        # heading is one more thing to read and nothing to decide.
        out += ["", "## توابع فراخوانی‌شده", ""] + list(extras["functions"])
    for title, key in (("## زمینه", "context"), ("## جدول‌های مرتبط", "field_tables"),
                       ("## ورودی‌های قابل استفادهٔ مجدد", "reuse"),
                       ("## گره‌های فرایند", "processes")):
        rows = [r if isinstance(r, str)
                else f'{r["kind"]} · {r["sheet"]}!{r["where"]} · {r["text"]}'
                for r in extras.get(key) or []]
        out += ["", title, ""] + (rows or ["—"])
    # §3.2: the contract goes after the expression card and before the style
    # card — how to write the value, then what the shape may be, then how the
    # prose beside it reads.
    out += ["", expression, "", shape_section(), "", style]
    return "\n".join(out)


# --------------------------------------------------------------------------
# the orchestrator (§2.3) — `facts-plan build <department> --run <run_dir>`.
# Everything above is a pure function of what it is handed; this is the one
# place that reads the estate and writes the run directory.


def _chunks(root, recordings):
    """`[(recording, path, (first, last), text)]` — the chosen transcripts,
    each cut into line-aligned chunks, in the order the owner named them."""
    out = []
    for recording in recordings:
        rel = f"meetings/transcripts/{recording}.txt"
        path = pathlib.Path(root) / rel
        if not path.is_file():
            print(f"facts-plan: no transcript for {recording}", file=sys.stderr)
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        for first, last in transcript_chunks("\n".join(lines)):
            out.append((recording, rel, (first, last),
                        "\n".join(lines[first - 1:last])))
    return out


def _attachment_texts(root, department):
    """The department's cached attachment texts (`extract-attachment`'s
    `.text/`), never the originals — `build` reads no `.docx` and no image."""
    root = pathlib.Path(root)
    directory = root / "departments" / department / "attachments" / ".text"
    return [str(p.relative_to(root)) for p in sorted(directory.glob("*"))
            if p.suffix in (".txt", ".md")]


#: §3.7's two halves of one sentence. One issue kind, two reasons: the owner is
#: told the file was not read and why, in words that name no path, no dispatch
#: table and no extension they did not type themselves.
UNREAD_NO_READER = "سامانه فایل‌هایی از این نوع را نمی‌خواند"
UNREAD_NOT_READY = "متن این فایل هنوز آماده نشده بود"

ISSUE_TEXT.update({
    "unread_attachment": "فایل «{file}» در این اجرا خوانده نشد؛ {why}.",
})


def unread_attachments(root, department):
    """Invariant I2 — every department attachment this run will not read, as an
    issue, sorted by file name.

    `extract-attachment` reads the extensions in its dispatch table and nothing
    else, and the 2026-09-02 run improvised over the rest. A file outside the
    table, or one inside it whose cached text is missing or stale, is named to
    the owner once and left out of every unit — `_attachment_texts` globs the
    `.text/` cache, so an unread file is already invisible to a unit; this is
    what makes it visible to the owner.

    `.csv`/`.md`/`.txt`/`.gs` need no conversion and `.xlsx` belongs to
    `dump-workbook`, whose unplaced rows are named under the very same heading
    (§2.1 Stage 2) — naming an `.xlsx` here would be the same file twice.
    """
    from extract_attachment import (CONVERTERS, PASSTHROUGH_EXTENSIONS,
                                    find_attachments, needs_conversion)
    adir = pathlib.Path(root) / "departments" / department / "attachments"
    out = []
    for src in find_attachments(adir):
        ext = src.suffix.lower()
        if ext in PASSTHROUGH_EXTENSIONS or ext == ".xlsx":
            continue
        suffix = CONVERTERS.get(ext)
        if suffix is None:
            why = UNREAD_NO_READER
        elif needs_conversion(src, adir / ".text" / (src.stem + suffix)):
            why = UNREAD_NOT_READY
        else:
            continue
        # `target` is the file's own name, never a path: it is what `gate-b.md`
        # and `report.md` print, and §2.7 admits no path in either.
        out.append(_issue("unread_attachment", target=src.name,
                          file=src.name, why=why))
    return out


def _wrap(line):
    """One transcript line is one speaker's turn, and the estate's longest runs
    to 5,924 characters — §2.3 bounds a rendered line at 1,900, and the split
    axis divides lines, never a line. So a line **over the cap** is folded on
    word boundaries: every word and its order survive, and the chunk's `#L`
    span still names the source file's own lines. Every other line — nearly
    all of them — is quoted byte for byte, trailing spaces included.

    ponytail: `textwrap` at a fixed width, not a token-aware filler. Widen it
    if a reader ever complains; nothing downstream reads a column.
    """
    if len(line) <= MAX_LINE:
        return [line]
    return textwrap.wrap(line, width=1500, break_long_words=False,
                         break_on_hyphens=False) or [""]


def _unit_text(root, unit):
    """The text a unit carries: its transcript chunk's lines and any attachment
    appended to it, wrapped and otherwise verbatim. A workbook unit's `inputs`
    name `.xlsx` files, which are not text and are never read."""
    root, parts = pathlib.Path(root), []
    for ref in unit["inputs"]:
        rel, _, span = ref.partition("#")
        path = root / rel
        if path.suffix not in (".txt", ".md") or not path.is_file():
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        if span:
            first, last = (int(n[1:]) for n in span.split("-"))
            lines = lines[first - 1:last]
        parts.append("\n".join(w for line in lines for w in _wrap(line)))
    return "\n\n".join(parts)


def _store_slice(root):
    """`(the index rows, {item id: its unit})` — the only two things §2.3 lets
    `build` read off the store, and a store that does not exist yet lends
    neither."""
    def load(name):
        try:
            return read_json(pathlib.Path(root) / "facts" / name)
        except (OSError, ValueError):
            return {}
    index = load(".index.json").get("entries") or []
    units = {e["id"]: (e.get("data") or {}).get("unit")
             for e in load("items.json").get("entries") or []
             if (e.get("data") or {}).get("unit")}
    return index, units


def _field_tables(unit, skeleton):
    """§2.3's one-line field table for every template **outside** this unit
    that one of its bindings or import edges points at — the only place the
    unit sees a field key it did not mint itself."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    mine = [by_id[c] for c in unit["candidates"] if c in by_id]
    wanted, keys = set(), {k for c in mine for k in candidate_instances(c)}
    for candidate in mine:
        for member in candidate["payload"].get("applies_to") or []:
            wanted.add((member.get("record") or {}).get("ref"))
            wanted |= {v.get("ref") for v in (member.get("params") or {}).values()
                       if isinstance(v, dict)}
    for edge in skeleton.get("imports") or []:
        if edge["consumer"] in keys and isinstance(edge.get("source"), dict):
            wanted.add(edge["source"].get("ref"))
    lines = []
    for ref in sorted(wanted - set(unit["candidates"]) - {None}):
        template = by_id.get(ref)
        if not template or template["kind"] != "record":
            continue
        fields = _view(template).get("fields") or []
        lines.append(f'{ref} · «{label_of(template)}» · ' + "، ".join(
            f'{f["key"]}={f.get("title") or "—"}' for f in fields))
    return lines


def _hashes(root, estate, texts):
    """The digests `plan.json` carries and `status` re-checks (§2.3): every
    dump file the estate was loaded from, plus every transcript chunk or
    cached attachment a unit quotes."""
    root = pathlib.Path(root)
    sheets_root = root / "attachments" / "sheets"
    paths = [sheets_root / "manifest.json"]
    for sid in sorted(estate):
        paths += sorted((sheets_root / ".dump" / sid).glob("*"))
    paths += [root / rel for rel in sorted(set(texts))]
    return {str(p.relative_to(root)): sha256_file(p)
            for p in paths if p.is_file()}


def _renderer(root, department, estate, skeleton, rendered):
    """`render(unit) -> input.md`, closed over the estate, the process index and
    the store slice so `plan_units` can re-render a unit it splits without
    reading any of them again.

    `build` and `refresh_inputs` share it: the second re-runs it over a plan
    already on disk, which is the only way a card added mid-run reaches a run
    whose units have started (§4).
    """
    index, item_units = _store_slice(root)
    nodes = process_index(root, department)
    sections = library_sections(estate)
    own = [{"id": c["id"], "kind": c["kind"], "label": label_of(c)}
           for c in skeleton["candidates"] if c["kind"] in ("record", "item")]
    instance_by_key = {i["key"]: i for i in skeleton["instances"]}
    by_id = {c["id"]: c for c in skeleton["candidates"]}

    def render(unit):
        mine = [by_id[c] for c in unit["candidates"] if c in by_id]
        sids = sorted({instance_by_key[k]["spreadsheetId"]
                       for c in mine for k in candidate_instances(c)
                       if k in instance_by_key})
        text = _unit_text(root, unit)
        tokens = _tokens(" ".join([label_of(c) for c in mine] + [text]))
        ranked = rank(nodes, tokens, 40, lambda n: n["label"])
        # `nodes[]` records the slice the unit was actually shown, so a
        # citation can be read back against what it could see (§2.3).
        unit["nodes"] = [n["node"] for n in ranked]
        rendered[unit["id"]] = render_input(unit, skeleton, {
            "text": text,
            "functions": called_bodies(
                sections, {name for c in mine
                           for name in (c.get("render") or {}).get("calls") or []}),
            "context": context_items(estate, sids),
            "field_tables": _field_tables(unit, skeleton),
            "reuse": reuse_slice(own, index, item_units, department, tokens),
            "processes": [f'{n["process"]} · {n["node"]} · {n["label"]}'
                          for n in ranked]})
        return rendered[unit["id"]]

    return render


def refresh_inputs(root, run_dir):
    """§4 — re-render every `units/<u>/input.md` of a run already planned.

    `check_rebuild` rightly refuses `--rebuild` once a unit is done, because
    the unit ids are a function of the estimate and a re-estimate would
    renumber the directories a finished output sits in. So a card added
    mid-run arrives this way instead: the plan and every attempt are left
    byte for byte as they are, nothing splits, and a unit whose input no
    longer `fits` is *reported* — the decision to split it is the plan
    author's, not this verb's.
    """
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    units = read_json(run_dir / "plan.json")["units"]
    render = _renderer(root, skeleton["department"], load_estate(root),
                       skeleton, {})
    over = []
    for unit in units:
        text = render(unit)
        write_text_atomic(run_dir / "units" / unit["id"] / "input.md", text)
        if not fits(unit, text):
            over.append(unit["id"])
            print(f'facts-plan: {unit["id"]} input over budget '
                  f'({estimate_tokens(text)})', file=sys.stderr)
    return {"refreshed": len(units), "over_budget": over}


def build(root, department, run_dir, recordings, *, rebuild=False):
    """§2.3 end to end: the candidates, `skeleton.json`, `functions.md`,
    `plan.json` and one `units/<u>/input.md`. Returns what the coordinator
    prints — `{"units": n, "candidates": {kind: count}}`.

    Nothing here writes to the store and nothing asks a model anything; the
    only mutable output is the run directory, and a plan whose units have
    already run is refused unless `--rebuild` says otherwise.
    """
    from facts_plan.cli import check_rebuild  # cli imports build lazily
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    check_rebuild(root, run_dir, rebuild)

    estate = load_estate(root)
    manifest = read_json(root / "attachments" / "sheets" / "manifest.json")
    templates, instances, issues = record_templates(estate, department)
    items = item_candidates(estate, department, instances)
    rules, rule_issues = rule_columns(estate, department, templates, instances,
                                      table_reading_functions(estate))
    scripts = script_rules(estate, department, called_names(estate))
    imports, import_issues = import_edges(
        estate, {(i["spreadsheetId"], i["sheet"]): {"ref": i["template"]}
                 for i in instances}, department)
    issues += (rule_issues + import_issues
               + reference_tab_issues(estate, department)
               + unread_attachments(root, department))
    candidates = templates + items + rules + scripts
    skeleton = {"unit_symbols": unit_symbols(root), "candidates": candidates,
                "instances": instances, "imports": imports}

    rendered = {}
    render = _renderer(root, department, estate, skeleton, rendered)

    chunks = _chunks(root, recordings)
    attachments = _attachment_texts(root, department)
    units = plan_units(skeleton, workbook_groups(manifest, department, [
        w["short"] for w in manifest["workbooks"]
        if w["spreadsheetId"] in estate
        and is_reference_workbook(w, estate[w["spreadsheetId"]])]),
        chunks, [c["id"] for c in items], attachments, render=render)

    # After `plan_units`, not before: `skeleton.json`'s candidates carry the
    # unit they were planned into, and that is what `plan_units` assigns.
    write_skeleton(run_dir, department, run_dir.name, skeleton["unit_symbols"],
                   candidates, instances, imports, issues)
    write_text_atomic(run_dir / "functions.md", function_library(estate))
    write_plan(run_dir, department,
               _hashes(root, estate, [rel for _, rel, _, _ in chunks] + attachments),
               units)
    for unit in units:
        write_text_atomic(run_dir / "units" / unit["id"] / "input.md",
                          rendered.get(unit["id"]) or render(unit))
    counts = collections.Counter(c["kind"] for c in candidates)
    return {"units": len(units), "candidates": dict(sorted(counts.items()))}
