"""`validate facts` / `validate facts-delta` content pass (spec §12's
`validate facts` paragraph). Schema carries shape and enum membership;
`check_document` carries what the schema cannot express — cross-field and
cross-entry consistency. Most checks are intra-document only (a `{ref}`
naming an entry that lives in the store rather than in this same document is
left alone — `apply`'s own `_reference_problems` already resolves it); two
of them (the `expr` identifier check's `calls[]` resolution, and the
aggregate form's table-column identifiers, both under #1) ALSO resolve
against an optional `store` (Task 9 review, F1/F2) — the standalone CLI never
has one, so those two stay best-effort there; `apply` passes the store it
already holds, closing the gap for the common case (a new rule calling an
already-applied one).

`doc` is a whole file object (`{"schema_version", "entries"}`) — the delta
`apply` is about to write, or a whole `facts.json`/`facts-delta.json` handed
to `validate` directly — never a single entry, because several checks need
the sibling list: unit edges to another entry in the same file (#2), and an
`expr` identifier resolving to a `calls[]` target's key or an aggregate's
table column (#1) both start from a `{ref}` walk over `doc["entries"]`.
`store` is the same shape `merge_facts.load_store` returns
(`{kind: {"entries": [...]}}`) — never consulted by the two checks above
unless the document alone leaves an identifier or a `{ref}` unresolved, and
never consulted at all by any other check (#2's unit edges stay strictly
intra-file, unchanged from the frozen interface).

`kind_of_file` is `"facts"` or `"facts-delta"` — the one place behaviour
differs is the constant-rule shape (#7): a delta's verbatim body is still
`data.original`; the store's has already been moved to `facts/originals/`
and become `data.original_ref` (§4, QF-31).
"""
import re

from merge_facts import KEY_RE, KIND_ORDER, PROC_ID_RE, SEGMENT_RE, is_open, path_exists

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


def check_document(doc, kind_of_file, store=None, unit_symbols=None):
    """Every content-pass message for `doc`, empty when it may pass. Never
    raises on a malformed shape — a missing/wrong-typed field is the schema's
    job to have already refused; this pass only adds messages.

    `store`, when given, extends resolution for check #1 ONLY (`calls[]` and
    the aggregate form's table columns — F1/F2) beyond `doc["entries"]`;
    every other check, including #2's unit edges, stays scoped to `doc_by_id`
    exactly as before — passing `store` must not change their behaviour.

    `unit_symbols`, when given, is the run's declared unit symbols
    (`skeleton.json`'s `unit_symbols[]`), exempted from the §5.2 lint's Latin
    rule — every other caller passes none and gets the bare rule."""
    entries = doc.get("entries") or []
    doc_by_id = {e["id"]: e for e in entries if isinstance(e, dict) and e.get("id")}
    combined_by_id = dict(doc_by_id)
    if store:
        for kind in KIND_ORDER:
            for e in (store.get(kind) or {}).get("entries") or []:
                combined_by_id.setdefault(e.get("id"), e)
    messages = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        label = entry.get("id") or entry.get("key") or "?"
        _check_expr(entry, combined_by_id, messages, label)
        _check_unit_edges(entry, doc_by_id, messages, label)
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
        _check_prose(entry, unit_symbols, messages, label)
    return messages


# --------------------------------------------------------------------------- #
# 1. expr tokeniser — identifiers, and the one aggregate form
# --------------------------------------------------------------------------- #

def _call_keys(by_id, entry):
    """The keys an `expr` may call, resolved against `calls[]` members whose
    `{ref}` names an entry present in `by_id` — this document's own entries
    always, plus the store's when the caller (`check_document`) was given
    one (Task 9 review, F1: the common QF-12 shared-function case is a NEW
    rule calling one from an EARLIER applied delta, which only the store
    holds). A call that resolves in neither rescues nothing — that identifier
    fails this pass."""
    out = set()
    for call in (entry.get("data") or {}).get("calls") or []:
        if not isinstance(call, dict):
            continue
        target = by_id.get(call.get("ref"))
        if target and target.get("key"):
            out.add(target["key"])
    return out


def _aggregate_spans(expr):
    """`[(start, end, input_key)]` — the half-open character span of each
    `sum over <input> of (...)` aggregate's parenthesised body, found right
    after the `of` (skipping whitespace); `end` is past the matching close
    paren. No span is produced when the form isn't followed by `(...)` at
    all — the `<input>.from` shape check runs separately, unconditionally,
    over every `AGGREGATE_RE` match directly (Task 9 review round 2: gating
    it on this function's output let a malformed `from` on a paren-less
    aggregate pass silently, since no span existed for it to hang the
    message off). This function is only for carving the body out of the
    generic identifier walk, for the aggregates that HAVE one."""
    spans = []
    for m in AGGREGATE_RE.finditer(expr):
        i = m.end()
        while i < len(expr) and expr[i].isspace():
            i += 1
        if i >= len(expr) or expr[i] != "(":
            continue
        depth, j = 0, i
        while j < len(expr):
            if expr[j] == "(":
                depth += 1
            elif expr[j] == ")":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        spans.append((i, j, m.group(1)))
    return spans


def _target_fields(target):
    return {f["key"] for f in (target.get("data") or {}).get("fields") or []
           if isinstance(f, dict) and f.get("key")}


def _aggregate_shape_ok(frm):
    return isinstance(frm, dict) and "ref" in frm and "field" in frm \
        and "row" not in frm


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
    # An input whose `from` is `{"param": "<applies_to params key>"}` (§2.5's
    # tolerance bindings) is declared exactly like any other: the identifier
    # the expression reads is its `key`, and where the value comes from is
    # `applies_to[]`'s business, not the tokeniser's.
    inputs_by_key = {i["key"]: i for i in data.get("inputs") or []
                     if isinstance(i, dict) and i.get("key")}
    outputs = {o["key"] for o in data.get("outputs") or []
              if isinstance(o, dict) and o.get("key")}
    base_allowed = set(inputs_by_key) | outputs | _call_keys(by_id, entry)

    # §7: `<input>`'s `from` must be `{ref, field}` with no `row` — asserted
    # for EVERY aggregate match, unconditionally, independent of whether a
    # parenthesised body follows it (Task 9 review round 2: this used to be
    # gated on `_aggregate_spans`, which only produces a span when `of` is
    # immediately followed by `(`, so a paren-less aggregate with an illegal
    # `row` on its `from` — `sum over bom_row of bom_row` — passed silently).
    for m in AGGREGATE_RE.finditer(expr):
        input_key = m.group(1)
        frm = (inputs_by_key.get(input_key) or {}).get("from")
        if not _aggregate_shape_ok(frm):
            messages.append(f"{label}: aggregate 'sum over {input_key} of' "
                            f"requires {input_key!r}'s from to be "
                            f"{{ref, field}} with no row")

    # The aggregate form (§7): "<a>/<b> are columns of that table or inputs
    # joined on the row key" — so, ONLY inside a `(<a> * <b>)` body that
    # actually follows `of`, the referenced record's declared `fields[].key`
    # are allowed too (F2), resolved through `by_id` (document, then store
    # when `check_document` was given one). A malformed `from` (already
    # messaged above) still gets its body checked against `base_allowed`
    # alone; a well-shaped but unresolvable target (cross-store, no `store`
    # given) skips the body check entirely for that aggregate — `apply`
    # re-runs with `store` and closes the gap.
    spans = _aggregate_spans(expr)
    for start, end, input_key in spans:
        frm = (inputs_by_key.get(input_key) or {}).get("from")
        if _aggregate_shape_ok(frm):
            target = by_id.get(frm["ref"])
            if target is None:
                continue                  # unresolvable — F2: skip this body
            body_allowed = base_allowed | _target_fields(target)
        else:
            body_allowed = base_allowed
        for tok in TOKEN_RE.finditer(expr[start:end]):
            text = tok.group()
            if text[0].isdigit() or text in KEYWORDS or text in body_allowed:
                continue
            messages.append(f"{label}: expr identifier {text!r} is not "
                            f"declared by inputs, outputs, a resolvable "
                            f"call, or the aggregate's table columns")

    for tok in TOKEN_RE.finditer(expr):
        s, e = tok.span()
        if any(s >= a and e <= b for a, b, _ in spans):
            continue                      # already handled (or skipped) above
        text = tok.group()
        if text[0].isdigit() or text in KEYWORDS or text in base_allowed:
            continue
        messages.append(f"{label}: expr identifier {text!r} is not declared "
                        f"by inputs, outputs or a resolvable call")


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

def _fk_fields_ok(fk):
    members = fk.get("fields")
    return (isinstance(members, list) and bool(members)
            and all(isinstance(m, str) for m in members))


def _fk_reference_ok(fk):
    reference = fk.get("reference")
    return isinstance(reference, dict) and bool(reference.get("ref"))


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
    # §8's shape — `{fields, reference, reference_fields, transform?}` — and both
    # halves are required: a key naming neither its own columns nor the entry it
    # points at declares no join at all. 84 stored records carried an IMPORT
    # descriptor here instead (`{spreadsheetId, sheet, range, target}`), and the
    # membership loop below read `fk.get("fields") or []`, so an absent `fields`
    # was an empty list and every one of them passed this pass cleanly. A mirror
    # has no `fields[]` to join on in the first place; its `mirror_of` and
    # `import` already say where it comes from.
    for fk in data.get("foreignKeys") or []:
        if not isinstance(fk, dict):
            messages.append(f"{label}: foreignKeys member is not an object")
            continue
        members = fk.get("fields") if _fk_fields_ok(fk) else []
        if not members:
            messages.append(f"{label}: foreignKeys member declares no fields "
                            f"naming the columns it joins on")
        if not _fk_reference_ok(fk):
            messages.append(f"{label}: foreignKeys member declares no reference "
                            f"naming the entry it points at")
        for m in members:
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
    # v3 §4: only a record the model typed — a paper form, an external system,
    # the native `units` table. A sheet-derived record's rows ARE the dump's,
    # and `build` omits a cell the dump left empty (§2.3), so a missing member
    # is a blank in the sheet, not an unanswered question. `instances[]` is
    # what says the rows came off a dump.
    if data.get("role") == "reference" and not data.get("instances"):
        non_derived = {f["key"] for f in fields if f.get("key") and not f.get("derived")}
        for row in rows:
            if not is_open(row):
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
        # v3 §5.3: a policy with no formula is `lang: text` and no inputs — a
        # rule, not a malformed constant. Only a computed shape contradicts
        # "no inputs": an `expr`, or a `lang` that declares one.
        if data.get("expr") is not None or data.get("lang") in ("feel", "table"):
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


# --------------------------------------------------------------------------- #
# grouped output — one line per rule, never one per cell (§4)
# --------------------------------------------------------------------------- #

_QUOTED_RE = re.compile(r"'[^']*'")
GROUP_IDS_SHOWN = 5


def group_messages(messages):
    """One line per rule the document breaks, with the count and the ids —
    the shape §4 asks for, against the run that relayed 2,068 one-per-cell
    errors nobody could read.

    A message is `"<label>: <rule stated with its specifics quoted>"`, so two
    messages state the same rule exactly when their bodies differ only inside
    the quotes: the quoted spans fold to `…`, and the fold is the group key.
    Insertion order is kept, so the output is deterministic.
    """
    groups = {}
    for msg in messages:
        label, sep, body = msg.partition(": ")
        if not sep:
            label, body = "", msg
        groups.setdefault(_QUOTED_RE.sub("…", body), []).append(label)
    out = []
    for rule, labels in groups.items():
        shown = ", ".join(labels[:GROUP_IDS_SHOWN])
        tail = " …" if len(labels) > GROUP_IDS_SHOWN else ""
        out.append(f"{rule} — {len(labels)} entries: {shown}{tail}")
    return out


# --------------------------------------------------------------------------- #
# 13. the style card (§5.2), mechanically — QF-50
# --------------------------------------------------------------------------- #

#: An A1 reference, with §2.3(d)'s guards: not preceded by an identifier
#: character and not followed by one or by `(`, so `MIN(`, `ROUND(` and every
#: other function name are left alone; optionally sheet-qualified and ranged.
#: The normaliser (`facts_plan.build`) and the agent's style card quote this
#: string verbatim, which is why it is a module constant and not inline.
REF_TOKEN = (r"(?:'[^']+'!)?(?<![A-Za-z0-9_$])\$?[A-Z]{1,3}\$?(?:N|\d{1,5})"
             r"(?![A-Za-z0-9_(])(?::\$?[A-Z]{1,3}\$?(?:N|\d{1,5}))?")
PIPELINE_WORDS = ("پاس", "اسکلت", "بخش از داده‌ها", "واحد کاری", "بچ",
                  "original", "bindings", "FEEL", "account", "expr")
COLLOQUIAL = ("می‌زنن", "می‌کنن", "داشته باشن", "بگیم", "می‌گیم")
#: Allowed only in a record's own `statement` and a field's `description`.
SHEET_WORDS = ("ستون", "تب", "سلول")
#: The Latin the register keeps: the two words the owner uses untranslated,
#: and `sheet`. Anything else Latin and four letters or longer is a leak.
LATIN_KEPT = frozenset({"csv", "excel", "sheet"})
QUOTE_WORDS = 8

REF_TOKEN_RE = re.compile(REF_TOKEN)
ARTEFACT_RE = re.compile(r"\.xlsx\b|\.gs\b|Table_|IMPORT_FROM_SHEET|\bLET\(|LAMBDA")
LATIN_WORD_RE = re.compile(r"[A-Za-z]{4,}")
QUOTED_SPAN_RE = re.compile(r"«([^»]*)»")


def _whole_word_re(words):
    """Persian gives `re` no `\\b` to work with, and these words are short:
    «تب» sits inside «مرتب», «پاس» inside «پاسخ» — which the owner's own
    report uses («بی‌پاسخ»). So a word counts only when no letter touches it
    on either side."""
    body = "|".join(re.escape(w) for w in words)
    return re.compile(rf"(?<![^\W\d_])(?:{body})(?![^\W\d_])")


PIPELINE_RE = _whole_word_re(PIPELINE_WORDS)
COLLOQUIAL_RE = _whole_word_re(COLLOQUIAL)
SHEET_WORDS_RE = _whole_word_re(SHEET_WORDS)


def lint_prose(text, *, exemptions, allow_sheet_words=False):
    """§5.2's style card as a check: the messages a sentence earns, empty when
    it may be stored. One message per rule broken, not one per occurrence.

    QF-50's reason for existing: `title` and `statement` are definitions, and
    a definition that says «ستون J تب پیتزا» is a locator wearing a
    definition's clothes — it stops being true the day the column moves. The
    locator already has a home (`source[]`) and so does the quotation
    (`source[].quote`); what is left is the meaning, which is the field.

    `exemptions` is the run's unit symbols (`skeleton.json`'s
    `unit_symbols[]`) — a symbol the units record declares is vocabulary, not
    a Latin leak. `allow_sheet_words` is QF-50's one exception: «ستون», «تب»
    and «سلول» belong in a record's own `statement` and in a field's
    `description`, which describe a table to someone who will open it.
    """
    if not isinstance(text, str) or not text:
        return []
    out = []
    hit = REF_TOKEN_RE.search(text)
    if hit:
        out.append(f"names cell or range {hit.group()!r} — a locator belongs "
                   f"in source[], not in prose (QF-50)")
    hit = ARTEFACT_RE.search(text)
    if hit:
        out.append(f"names {hit.group()!r} — a file, table or formula name "
                   f"belongs in source[], not in prose (QF-50)")
    # The three Persian rules quote the match literally rather than with `!r`:
    # a ZWNJ («می‌زنن», «بخش از داده‌ها» carry one) is category Cf, so `repr`
    # escapes it to a six-character code — unreadable to the unit that has to
    # fix the sentence. The ASCII quotes are kept so `group_messages` still
    # folds the span. The three rules above match ASCII only: `!r` is fine.
    hit = PIPELINE_RE.search(text)
    if hit:
        out.append(f"uses the pipeline's own word '{hit.group()}', which "
                   f"names nothing in the restaurant")
    hit = COLLOQUIAL_RE.search(text)
    if hit:
        out.append(f"uses the spoken ending '{hit.group()}', not the register "
                   f"of a written procedure")
    if not allow_sheet_words:
        hit = SHEET_WORDS_RE.search(text)
        if hit:
            out.append(f"uses '{hit.group()}', which belongs only to a "
                       f"record's own statement and a field's description "
                       f"(QF-50)")
    kept = LATIN_KEPT | {str(s).lower() for s in exemptions or ()}
    for hit in LATIN_WORD_RE.finditer(text):
        if hit.group().lower() not in kept:
            out.append(f"carries the Latin word {hit.group()!r}")
            break
    for hit in QUOTED_SPAN_RE.finditer(text):
        words = len(hit.group(1).split())
        if words > QUOTE_WORDS:
            out.append(f"quotes {words} words — a quotation belongs in "
                       f"source[].quote, not in a definition")
            break
    return out


def _check_prose(entry, unit_symbols, messages, label):
    """The lint at the field that carries the sentence, so the unit that wrote
    a failing one is the unit told to fix it (QF-50). The targets are §5.2's
    list; an `issues[].description` the ENGINE templated is exempt, because it
    must name the columns that went missing — that is the whole finding."""
    is_record = entry.get("kind") == "record"
    targets = [("title", entry.get("title"), False),
               ("statement", entry.get("statement"), is_record)]
    for i, alias in enumerate(entry.get("aliases") or []):
        targets.append((f"aliases/{i}", alias, False))
    data = entry.get("data") or {}
    for name in ("grain", "method", "exceptions"):
        # `grain: "workbook"` is not prose: it is the workbook-stub marker
        # `apply._workbook_stub` matches on and `_strip_stub_markers` lifts off
        # the delta — and this pass runs from `preconditions`, before that
        # lifting. A record's real, Persian grain is still linted.
        if name == "grain" and data.get(name) == "workbook":
            continue
        targets.append((f"data/{name}", data.get(name), False))
    for field in data.get("fields") or []:
        if isinstance(field, dict):
            targets.append((f"data/fields/{field.get('key')}/description",
                            field.get("description"), True))
    for i, tracked in enumerate(data.get("tracked") or []):
        if isinstance(tracked, dict):
            targets.append((f"data/tracked/{i}/reason", tracked.get("reason"),
                            False))
    for i, issue in enumerate(entry.get("issues") or []):
        if isinstance(issue, dict) and not issue.get("engine"):
            targets.append((f"issues/{i}/description", issue.get("description"),
                            False))
    for path, text, allow_sheet_words in targets:
        for msg in lint_prose(text, exemptions=unit_symbols or (),
                              allow_sheet_words=allow_sheet_words):
            messages.append(f"{label}: {path} {msg}")
