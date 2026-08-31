"""`validate facts` / `validate facts-delta` content pass (spec §12's
`validate facts` paragraph). Schema carries shape and enum membership;
`check_document` carries what the schema cannot express — cross-field and
cross-entry consistency **within one file**. Cross-store resolution (a `{ref}`
naming an entry that lives in the store rather than in this same document) is
`apply`'s job (its own `_reference_problems`), not this pass's — every check
below is answered by walking `doc["entries"]` alone.

`doc` is a whole file object (`{"schema_version", "entries"}`) — the delta
`apply` is about to write, or a whole `facts.json`/`facts-delta.json` handed
to `validate` directly — never a single entry, because two checks need the
sibling list: unit edges to another entry in the same file (#2), and an
`expr` identifier resolving to a `calls[]` target's key (#1) both require
looking a `{ref}` up among `doc["entries"]`.

`kind_of_file` is `"facts"` or `"facts-delta"` — the one place behaviour
differs is the constant-rule shape (#7): a delta's verbatim body is still
`data.original`; the store's has already been moved to `facts/originals/`
and become `data.original_ref` (§4, QF-31).
"""
import re

from merge_facts import path_exists

SEGMENT_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$")
PROC_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")
JALALI_RE = re.compile(r"^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$")

# §7 FEEL subset keywords — never checked against inputs/outputs/calls.
KEYWORDS = frozenset({"if", "then", "else", "and", "or", "not", "min", "max",
                      "sum", "abs", "round", "over", "of"})
TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?")
AGGREGATE_RE = re.compile(r"\bsum\s+over\s+([A-Za-z_][A-Za-z0-9_]*)\s+of\b")

# §7/§9: the names a row object reserves for its own structure — no declared
# field or header field may take one, and any other row member must be one.
RESERVED_ROW_NAMES = frozenset({"key", "title", "unit", "unit_raw", "section",
                                "when", "open", "retired", "valid_to",
                                "supersedes"})


def check_document(doc, kind_of_file):
    """Every content-pass message for `doc`, empty when it may pass. Never
    raises on a malformed shape — a missing/wrong-typed field is the schema's
    job to have already refused; this pass only adds messages."""
    entries = doc.get("entries") or []
    by_id = {e["id"]: e for e in entries if isinstance(e, dict) and e.get("id")}
    messages = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        label = entry.get("id") or entry.get("key") or "?"
        _check_expr(entry, by_id, messages, label)
        _check_unit_edges(entry, by_id, messages, label)
        _check_keys(entry, messages, label)
        _check_process_grammar(entry, messages, label)
        _check_record_shape(entry, messages, label)
        _check_shares(entry, messages, label)
        _check_constant_shape(entry, kind_of_file, messages, label)
        _check_field_status(entry, messages, label)
        _check_reconciled_against(entry, messages, label)
        _check_issue_dates(entry, messages, label)
        _check_source_exclusions(entry, messages, label)
        _check_process_links(entry, messages, label)
    return messages


# --------------------------------------------------------------------------- #
# 1. expr tokeniser — identifiers, and the one aggregate form
# --------------------------------------------------------------------------- #

def _call_keys(by_id, entry):
    """The keys an `expr` may call, resolved only against `calls[]` members
    whose `{ref}` names an entry present in THIS document — a call whose
    target lives in the store rather than the delta is unresolved here (that
    is cross-store, apply's job), and an identifier that depends on it fails
    this pass. Decision recorded in the task report: the brief is silent on
    this exact edge, so an unresolved call rescues nothing."""
    out = set()
    for call in (entry.get("data") or {}).get("calls") or []:
        if not isinstance(call, dict):
            continue
        target = by_id.get(call.get("ref"))
        if target and target.get("key"):
            out.add(target["key"])
    return out


def _check_expr(entry, by_id, messages, label):
    data = entry.get("data") or {}
    expr = data.get("expr")
    # The identifier grammar below is the FEEL subset (§7); `table`, `text`,
    # `sheets` and `gs` carry no such grammar over `expr` (`sheets`/`gs` are
    # "verbatim forms kept only in original_ref"), so this check is scoped to
    # `lang: feel` — the spec ties "validate tokenises every expr" to the
    # `feel` bullet specifically.
    if not isinstance(expr, str) or not expr or data.get("lang") != "feel":
        return
    inputs = {i["key"] for i in data.get("inputs") or []
             if isinstance(i, dict) and i.get("key")}
    outputs = {o["key"] for o in data.get("outputs") or []
              if isinstance(o, dict) and o.get("key")}
    allowed = inputs | outputs | _call_keys(by_id, entry)
    for tok in TOKEN_RE.finditer(expr):
        text = tok.group()
        if text[0].isdigit() or text in KEYWORDS or text in allowed:
            continue
        messages.append(f"{label}: expr identifier {text!r} is not declared "
                        f"by inputs, outputs or a resolvable call")
    for m in AGGREGATE_RE.finditer(expr):
        input_key = m.group(1)
        input_def = next((i for i in data.get("inputs") or []
                          if isinstance(i, dict) and i.get("key") == input_key), None)
        frm = (input_def or {}).get("from")
        if not (isinstance(frm, dict) and "ref" in frm and "field" in frm
                and "row" not in frm):
            messages.append(f"{label}: aggregate 'sum over {input_key} of' "
                            f"requires {input_key!r}'s from to be "
                            f"{{ref, field}} with no row")


# --------------------------------------------------------------------------- #
# 2. unit edges intra-file
# --------------------------------------------------------------------------- #

def _target_unit(target, field, row):
    if target.get("kind") == "record":
        data = target.get("data") or {}
        if row is not None:
            row_obj = next((r for r in data.get("rows") or []
                            if isinstance(r, dict) and r.get("key") == row), None)
            if row_obj and row_obj.get("unit"):
                return row_obj["unit"]
        for coll in ("fields", "header_fields"):
            for f in data.get(coll) or []:
                if isinstance(f, dict) and f.get("key") == field:
                    return f.get("unit")
        return None
    if target.get("kind") == "rule":
        outputs = (target.get("data") or {}).get("outputs") or []
        if field:
            for o in outputs:
                if isinstance(o, dict) and o.get("key") == field:
                    return o.get("unit")
        elif len(outputs) == 1 and isinstance(outputs[0], dict):
            return outputs[0].get("unit")
    return None


def _check_unit_edges(entry, by_id, messages, label):
    if entry.get("kind") != "rule":
        return
    for inp in (entry.get("data") or {}).get("inputs") or []:
        if not isinstance(inp, dict) or inp.get("via") is not None:
            continue
        frm = inp.get("from")
        if not isinstance(frm, dict):
            continue                              # "operator" / "calendar"
        target = by_id.get(frm.get("ref"))
        if target is None:
            continue                              # cross-store — apply's job
        target_unit = _target_unit(target, frm.get("field"), frm.get("row"))
        own_unit = inp.get("unit")
        if target_unit and own_unit and target_unit != own_unit:
            messages.append(f"{label}: input {inp.get('key')!r} unit "
                            f"{own_unit!r} disagrees with {frm.get('ref')}'s "
                            f"{target_unit!r} and names no via")


# --------------------------------------------------------------------------- #
# 3. key patterns + __ reservation; refItems cell values
# --------------------------------------------------------------------------- #

def _check_key_list(members, messages, label, what):
    for m in members or []:
        if isinstance(m, dict) and m.get("key") is not None \
                and not SEGMENT_RE.fullmatch(str(m["key"])):
            messages.append(f"{label}: {what} key {m['key']!r} is not a "
                            f"minted segment")


def _check_keys(entry, messages, label):
    data = entry.get("data") or {}
    _check_key_list(data.get("fields"), messages, label, "field")
    _check_key_list(data.get("header_fields"), messages, label, "header field")
    _check_key_list(data.get("sections"), messages, label, "section")
    _check_key_list(data.get("inputs"), messages, label, "input")
    _check_key_list(data.get("outputs"), messages, label, "output")
    for o in data.get("outputs") or []:
        if isinstance(o, dict) and o.get("per") is not None \
                and not SEGMENT_RE.fullmatch(str(o["per"])):
            messages.append(f"{label}: output per {o['per']!r} is not a "
                            f"minted segment")
    for row in data.get("rows") or []:
        if isinstance(row, dict) and row.get("key") is not None \
                and not KEY_RE.fullmatch(str(row["key"])):
            messages.append(f"{label}: row key {row['key']!r} is not a "
                            f"minted key")
    refitem_fields = {f["key"] for f in data.get("fields") or []
                      if isinstance(f, dict) and f.get("refItems") and f.get("key")}
    for row in data.get("rows") or []:
        if not isinstance(row, dict):
            continue
        for name in refitem_fields:
            value = row.get(name)
            if isinstance(value, str) and not SEGMENT_RE.fullmatch(value):
                messages.append(f"{label}: refItems cell {name}={value!r} "
                                f"on row {row.get('key')!r} is not a minted "
                                f"segment")


# --------------------------------------------------------------------------- #
# 4. processes[].ref grammar re-assertion (already schema-carried)
# --------------------------------------------------------------------------- #

def _check_process_grammar(entry, messages, label):
    for p in entry.get("processes") or []:
        ref = (p or {}).get("ref") if isinstance(p, dict) else None
        if not (isinstance(ref, str) and PROC_ID_RE.fullmatch(ref)):
            messages.append(f"{label}: processes[] ref {ref!r} does not "
                            f"match the process id grammar")


# --------------------------------------------------------------------------- #
# 5. primaryKey/foreignKeys/rows[].section membership; reserved row names;
#    every non-derived declared field present on every open reference row
# --------------------------------------------------------------------------- #

def _row_open(row):
    return not row.get("retired", False) and row.get("valid_to") is None


def _check_record_shape(entry, messages, label):
    if entry.get("kind") != "record":
        return
    data = entry.get("data") or {}
    fields = [f for f in data.get("fields") or [] if isinstance(f, dict)]
    header_fields = [f for f in data.get("header_fields") or [] if isinstance(f, dict)]
    declared_fields = {f["key"] for f in fields if f.get("key")}
    declared_header = {f["key"] for f in header_fields if f.get("key")}
    declared_all = declared_fields | declared_header
    declared_sections = {s["key"] for s in data.get("sections") or []
                         if isinstance(s, dict) and s.get("key")}
    for f in fields + header_fields:
        if f.get("key") in RESERVED_ROW_NAMES:
            messages.append(f"{label}: field key {f['key']!r} is a reserved "
                            f"row-member name")
    pk = data.get("primaryKey") or []
    for m in pk:
        if m not in declared_all:
            messages.append(f"{label}: primaryKey member {m!r} is not a "
                            f"declared field")
    for fk in data.get("foreignKeys") or []:
        if not isinstance(fk, dict):
            continue
        for m in fk.get("fields") or []:
            if m not in declared_all:
                messages.append(f"{label}: foreignKeys field {m!r} is not a "
                                f"declared field")
    rows = [r for r in data.get("rows") or [] if isinstance(r, dict)]
    for row in rows:
        section = row.get("section")
        if section is not None and section not in declared_sections:
            messages.append(f"{label}: row {row.get('key')!r} names "
                            f"undeclared section {section!r}")
        for member in row:
            if member in RESERVED_ROW_NAMES:
                continue
            if member not in declared_fields:
                messages.append(f"{label}: row {row.get('key')!r} member "
                                f"{member!r} is not a declared field")
    if data.get("role") == "reference":
        non_derived = {f["key"] for f in fields if f.get("key") and not f.get("derived")}
        for row in rows:
            if not _row_open(row):
                continue
            for key in sorted(non_derived):
                if key not in row:
                    messages.append(f"{label}: reference row "
                                    f"{row.get('key')!r} is missing declared "
                                    f"field {key!r}")


# --------------------------------------------------------------------------- #
# 6. shares in (0,1], summing to 1 +/- 0.001 when more than one carries share
# --------------------------------------------------------------------------- #

def _check_shares(entry, messages, label):
    if entry.get("kind") != "rule":
        return
    outputs = (entry.get("data") or {}).get("outputs") or []
    shares = []
    for o in outputs:
        if not (isinstance(o, dict) and "share" in o and o.get("share") is not None):
            continue
        share = o["share"]
        if not (isinstance(share, (int, float)) and not isinstance(share, bool)
                and 0 < share <= 1):
            messages.append(f"{label}: output {o.get('key')!r} share "
                            f"{share!r} is not in (0, 1]")
        else:
            shares.append(share)
    if len(shares) > 1 and abs(sum(shares) - 1) > 0.001:
        messages.append(f"{label}: shares sum to {sum(shares)} not 1 +/- 0.001")


# --------------------------------------------------------------------------- #
# 7. constant shape
# --------------------------------------------------------------------------- #

def _check_constant_shape(entry, kind_of_file, messages, label):
    if entry.get("kind") != "rule":
        return
    data = entry.get("data") or {}
    inputs = data.get("inputs")
    outputs = data.get("outputs") or []
    if inputs == []:
        if data.get("expr") is not None or data.get("lang") is not None:
            messages.append(f"{label}: a constant (no inputs) carries "
                            f"expr/lang")
        for o in outputs:
            if isinstance(o, dict) and not ("value" in o or "range" in o):
                messages.append(f"{label}: constant output {o.get('key')!r} "
                                f"carries no value or range")
    elif inputs:
        if data.get("lang") is None:
            messages.append(f"{label}: a rule with inputs carries no lang")
        original_key = "original_ref" if kind_of_file == "facts" else "original"
        if not (data.get("expr") or data.get(original_key)):
            messages.append(f"{label}: a rule with inputs carries no expr "
                            f"or {original_key}")
        for o in outputs:
            if isinstance(o, dict) and ("value" in o or "range" in o):
                messages.append(f"{label}: output {o.get('key')!r} of a "
                                f"rule with inputs carries value or range")


# --------------------------------------------------------------------------- #
# 8. field_status paths exist and hold inferred/informal
# --------------------------------------------------------------------------- #

def _check_field_status(entry, messages, label):
    for path, value in (entry.get("field_status") or {}).items():
        if value not in ("inferred", "informal"):
            messages.append(f"{label}: field_status {path!r} has value "
                            f"{value!r}, not inferred/informal")
        if not path_exists(entry, path):
            messages.append(f"{label}: field_status names path {path!r}, "
                            f"which does not exist")


# --------------------------------------------------------------------------- #
# 9. reconciled_against: cell declared here
# --------------------------------------------------------------------------- #

def _check_reconciled_against(entry, messages, label):
    if entry.get("kind") != "record":
        return
    data = entry.get("data") or {}
    declared_fields = {f["key"] for f in data.get("fields") or []
                       if isinstance(f, dict) and f.get("key")}
    declared_rows = {r["key"] for r in data.get("rows") or []
                     if isinstance(r, dict) and r.get("key")}
    for ra in data.get("reconciled_against") or []:
        cell = (ra or {}).get("cell") or {} if isinstance(ra, dict) else {}
        field, row = cell.get("field"), cell.get("row")
        if field is not None and field not in declared_fields:
            messages.append(f"{label}: reconciled_against cell field "
                            f"{field!r} is not declared here")
        if row is not None and row not in declared_rows:
            messages.append(f"{label}: reconciled_against cell row "
                            f"{row!r} is not declared here")


# --------------------------------------------------------------------------- #
# 10. Jalali date patterns (already schema-carried)
# --------------------------------------------------------------------------- #

def _check_issue_dates(entry, messages, label):
    for issue in entry.get("issues") or []:
        if not isinstance(issue, dict):
            continue
        for key in ("from_date", "to_date"):
            val = issue.get(key)
            if val is not None and not JALALI_RE.fullmatch(str(val)):
                messages.append(f"{label}: issue {key} {val!r} is not a "
                                f"Jalali date")


# --------------------------------------------------------------------------- #
# 11. source[].ref exclusions
# --------------------------------------------------------------------------- #

def _check_source_exclusions(entry, messages, label):
    for src in entry.get("source") or []:
        ref = (src or {}).get("ref") if isinstance(src, dict) else None
        if isinstance(ref, str) and (ref.endswith(".structure.md")
                                     or ref.endswith("NAMED_FUNCTIONS.md")):
            messages.append(f"{label}: source ref {ref!r} may not cite "
                            f".structure.md or NAMED_FUNCTIONS.md")


# --------------------------------------------------------------------------- #
# 12. processes[] source presence
# --------------------------------------------------------------------------- #

def _check_process_links(entry, messages, label):
    processes = entry.get("processes") or []
    if not processes:
        return
    sources = entry.get("source") or []
    for p in processes:
        proc_id = (p or {}).get("ref") if isinstance(p, dict) else None
        if not proc_id:
            continue
        cited = any(isinstance(s, dict) and s.get("type") == "process"
                   and isinstance(s.get("ref"), str)
                   and s["ref"].endswith(f"{proc_id}.json") for s in sources)
        if not cited:
            messages.append(f"{label}: processes[] link to {proc_id!r} has "
                            f"no process-type source naming its file")
