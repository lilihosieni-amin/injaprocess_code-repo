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
import math
import re

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
