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

Tiers (spec 2026-09-13-facts-gate-tiers §5B). Every check returns a
`tiers.Finding`, and only a key that stays off the grammar after the safe key
repair is REFUSED (B4/B6). Everything else is a NOTE: marked `inferred` at the
QF-7 path the row names, an `issues[]` entry where the row asks for one, or
`NO_MARK` where the row says "no mark". The REPAIR rows live in
`CONTENT_REPAIRS` at the bottom, which every gate runs before this pass, so a
gate never sees what they fix; a caller that skips them (the standalone
validator) sees it as an unmarked NOTE, never as a refusal.
"""
import functools
import pathlib
import re

from merge_facts import KEY_RE, KIND_ORDER, PROC_ID_RE, SEGMENT_RE, is_open, path_exists
from merge_facts.conventions import DEFAULT as DEFAULT_CONVENTIONS
from merge_facts.tiers import note, refuse

#: A NOTE the row stores with no mark on the entry: no `field_status` path and
#: no `issues[]` entry. It is reported (validator stderr, the unit's own check)
#: and nothing else.
NO_MARK = "none"

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


def _inferred(entry, label, message, path):
    """A NOTE marking `path` inferred — or, where the path does not resolve
    (a member with no key), an issue, so the mark is never dropped silently by
    the `field_status` path repair (B33)."""
    if path_exists(entry, path):
        return note(label, message, path, mark="inferred")
    return note(label, message, path)


def _unmarked(label, message, path=None):
    return note(label, message, path, mark=NO_MARK)


def check_document(doc, kind_of_file, store=None, unit_symbols=None,
                   conventions=DEFAULT_CONVENTIONS):
    """Every content-pass finding for `doc` (`list[tiers.Finding]`, labelled by
    the entry's id or key), empty when it is clean. Never
    raises on a malformed shape — a missing/wrong-typed field is the schema's
    job to have already refused; this pass only adds messages.

    `store`, when given, extends resolution for check #1 ONLY (`calls[]` and
    the aggregate form's table columns — F1/F2) beyond `doc["entries"]`;
    every other check, including #2's unit edges, stays scoped to `doc_by_id`
    exactly as before — passing `store` must not change their behaviour.

    `unit_symbols`, when given, is the run's declared unit symbols
    (`skeleton.json`'s `unit_symbols[]`), exempted from the §5.2 lint's Latin
    rule — every other caller passes none and gets the bare rule.

    `conventions` is the estate's own (§3.1): the item-code namespaces a
    `refItems` cell may spell, and the table prefix §5.2 reads as an artefact.
    Every caller that holds a root passes `conventions.load(root)`; the
    standalone `validate` CLI holds none and gets today's."""
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
        _check_keys(entry, messages, label, conventions)
        _check_process_grammar(entry, messages, label)
        _check_record_shape(entry, messages, label)
        _check_shares(entry, messages, label)
        _check_constant_shape(entry, kind_of_file, messages, label)
        _check_table_shape(entry, messages, label)
        _check_field_status(entry, messages, label)
        _check_reconciled_against(entry, messages, label)
        _check_issue_dates(entry, messages, label)
        _check_source_exclusions(entry, messages, label)
        _check_process_links(entry, messages, label)
        _check_prose(entry, unit_symbols, messages, label, conventions)
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
            messages.append(_inferred(
                entry, label, f"aggregate 'sum over {input_key} of' requires "
                f"{input_key!r}'s from to be {{ref, field}} with no row",
                "data/expr"))

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
            messages.append(_inferred(
                entry, label, f"expr identifier {text!r} is not declared by "
                f"inputs, outputs, a resolvable call, or the aggregate's table "
                f"columns", "data/expr"))

    for tok in TOKEN_RE.finditer(expr):
        s, e = tok.span()
        if any(s >= a and e <= b for a, b, _ in spans):
            continue                      # already handled (or skipped) above
        text = tok.group()
        if text[0].isdigit() or text in KEYWORDS or text in base_allowed:
            continue
        messages.append(_inferred(
            entry, label, f"expr identifier {text!r} is not declared by "
            f"inputs, outputs or a resolvable call", "data/expr"))


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
            messages.append(_inferred(
                entry, label, f"input {inp.get('key')!r} unit {own_unit!r} "
                f"disagrees with {frm.get('ref')}'s {target_unit!r} and names "
                f"no via", f"data/inputs/{inp.get('key')}/unit"))


# --------------------------------------------------------------------------- #
# 3. key patterns + __ reservation; refItems cell values
# --------------------------------------------------------------------------- #

def _fix_segment(key):
    """B4's safe repair: trim, lower-case, spaces and `-` to `_`, repeated `_`
    collapsed. Nothing else — `_qty` or a Persian key stays what it was."""
    return re.sub(r"_{2,}", "_", re.sub(r"[\s\-]+", "_", key.strip().lower()))


def _fix_row_key(key):
    """B6: the same repair per segment, so the `__` joins survive."""
    return "__".join(_fix_segment(part) for part in key.strip().split("__"))


def _renames(keys, pattern, fix):
    """`{old: new}` for every off-grammar string key whose repaired form
    matches `pattern` and is unique among the list's keys after the repair.
    The repair and the check both read this, so they never disagree on which
    key is repairable."""
    fixed = {k: fix(k) for k in keys
             if isinstance(k, str) and not pattern.fullmatch(k)}
    final = [fixed.get(k, k) if isinstance(k, str) else k for k in keys]
    return {k: new for k, new in fixed.items()
            if pattern.fullmatch(new) and final.count(new) == 1}


def _key_findings(members, pattern, fix, messages, label, message):
    """B4/B6: a key the safe repair makes valid is an unmarked NOTE (a gate
    repairs it before it gets here); any other off-grammar key is REFUSED —
    `save_store` validates every key against the grammar (R1) and `edit`
    addresses members by it (R2)."""
    members = [m for m in members if isinstance(m, dict)
               and m.get("key") is not None]
    renames = _renames([m["key"] for m in members], pattern, fix)
    for m in members:
        key = m["key"]
        if not pattern.fullmatch(str(key)):
            text = message.format(key=repr(key))
            messages.append(_unmarked(label, text)
                            if isinstance(key, str) and key in renames
                            else refuse(label, text))


def _check_key_list(members, messages, label, what):
    _key_findings(_list(members), SEGMENT_RE, _fix_segment, messages, label,
                  what + " key {key} is not a minted segment")


def _check_keys(entry, messages, label, conventions=DEFAULT_CONVENTIONS):
    data = entry.get("data") or {}
    _check_key_list(data.get("fields"), messages, label, "field")
    _check_key_list(data.get("header_fields"), messages, label, "header field")
    _check_key_list(data.get("sections"), messages, label, "section")
    _check_key_list(data.get("inputs"), messages, label, "input")
    _check_key_list(data.get("outputs"), messages, label, "output")
    for o in data.get("outputs") or []:
        if isinstance(o, dict) and o.get("per") is not None \
                and not SEGMENT_RE.fullmatch(str(o["per"])):
            messages.append(_unmarked(label, f"output per {o['per']!r} is not "
                                             f"a minted segment"))
    _key_findings(_list(data.get("rows")), KEY_RE, _fix_row_key, messages,
                  label, "row key {key} is not a minted key")
    default_namespace = conventions.item_namespace
    refitem_fields = {f["key"]: (f["refItems"].get("namespace")
                                 or default_namespace)
                      for f in data.get("fields") or []
                      if isinstance(f, dict) and isinstance(f.get("refItems"), dict)
                      and f.get("key")}
    for row in data.get("rows") or []:
        if not isinstance(row, dict):
            continue
        for name, namespace in refitem_fields.items():
            value = row.get(name)
            # A cell names an item either by its key or by the code the
            # sheets write into the text («پنیر پیتزا ##1», «اینجا پیتزا #61»)
            # — the same code `reference_rows` keys the row by. A column of
            # such cells is exactly what `refItems` is for; refusing the code
            # form made a unit that followed its card fail at the cap.
            if isinstance(value, str) and not SEGMENT_RE.fullmatch(value) \
                    and not conventions.matches_code(namespace, value):
                messages.append(_inferred(
                    entry, label, f"refItems cell {name}={value!r} on row "
                    f"{row.get('key')!r} is neither an item key nor a "
                    f"{namespace} code", f"data/fields/{name}/refItems"))


# --------------------------------------------------------------------------- #
# 4. processes[].ref grammar re-assertion (already schema-carried)
# --------------------------------------------------------------------------- #

def _bad_process_ref(label, ref):
    """B8: no process can carry this id, so the link is removed (by
    `repair_process_links`) and the entry keeps an issue quoting it."""
    return note(label, f"processes[] ref {ref!r} does not match the process "
                       f"id grammar",
                fa=f"پیوند به فرایندی با شناسهٔ نادرست «{ref}» ثبت نشد.")


def _check_process_grammar(entry, messages, label):
    for p in entry.get("processes") or []:
        ref = (p or {}).get("ref") if isinstance(p, dict) else None
        if not (isinstance(ref, str) and PROC_ID_RE.fullmatch(ref)):
            messages.append(_bad_process_ref(label, ref))


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
    for collection, members in (("fields", fields),
                                ("header_fields", header_fields)):
        for f in members:
            if f.get("key") in RESERVED_ROW_NAMES:
                messages.append(_inferred(
                    entry, label, f"field key {f['key']!r} is a reserved "
                    f"row-member name", f"data/{collection}/{f['key']}"))
    pk = data.get("primaryKey") or []
    for m in pk:
        if m not in declared_all:
            messages.append(_inferred(entry, label, f"primaryKey member {m!r} "
                                      f"is not a declared field",
                                      "data/primaryKey"))
    # §8's shape — `{fields, reference, reference_fields, transform?}` — and both
    # halves are required: a key naming neither its own columns nor the entry it
    # points at declares no join at all. 84 stored records carried an IMPORT
    # descriptor here instead (`{spreadsheetId, sheet, range, target}`), and the
    # membership loop below read `fk.get("fields") or []`, so an absent `fields`
    # was an empty list and every one of them passed this pass cleanly. A mirror
    # has no `fields[]` to join on in the first place; its `mirror_of` and
    # `import` already say where it comes from.
    for fk in data.get("foreignKeys") or []:
        # B11: `repair_foreign_keys` drops or sets aside all three shapes.
        if not isinstance(fk, dict):
            messages.append(_unmarked(label, "foreignKeys member is not an "
                                             "object"))
            continue
        members = fk.get("fields") if _fk_fields_ok(fk) else []
        if not members:
            messages.append(_unmarked(label, "foreignKeys member declares no "
                                             "fields naming the columns it "
                                             "joins on"))
        if not _fk_reference_ok(fk):
            messages.append(_unmarked(label, "foreignKeys member declares no "
                                             "reference naming the entry it "
                                             "points at"))
        for m in members:
            if m not in declared_all:
                messages.append(_inferred(entry, label, f"foreignKeys field "
                                          f"{m!r} is not a declared field",
                                          "data/foreignKeys"))
    rows = [r for r in data.get("rows") or [] if isinstance(r, dict)]
    for row in rows:
        section = row.get("section")
        if section is not None and section not in declared_sections:
            messages.append(_inferred(
                entry, label, f"row {row.get('key')!r} names undeclared "
                f"section {section!r}", f"data/rows/{row.get('key')}/section"))
        for member in row:
            if member in RESERVED_ROW_NAMES:
                continue
            if member not in declared_fields:
                # B14: the panel draws declared columns only, so the value
                # would go unseen — an issue names the member (once per
                # member, however many rows carry it).
                messages.append(note(
                    label, f"row {row.get('key')!r} member {member!r} is not "
                    f"a declared field",
                    fa=f"ردیف‌های این جدول مقداری به نام «{member}» دارند که "
                       f"جزو فیلدهای تعریف‌شدهٔ جدول نیست."))
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
                    messages.append(_unmarked(
                        label, f"reference row {row.get('key')!r} is missing "
                        f"declared field {key!r}"))


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
            messages.append(_inferred(
                entry, label, f"output {o.get('key')!r} share {share!r} is "
                f"not in (0, 1]", f"data/outputs/{o.get('key')}/share"))
        else:
            shares.append(share)
    if len(shares) > 1 and abs(sum(shares) - 1) > 0.001:
        messages.append(_inferred(entry, label, f"shares sum to {sum(shares)} "
                                  f"not 1 +/- 0.001", "data/outputs"))


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
            # B18: the expr is kept and marked; a bare `lang` with no body is
            # `repair_constant_lang`'s, so it is unmarked here.
            message = "a constant (no inputs) carries expr/lang"
            if data.get("expr") is not None:
                messages.append(_inferred(entry, label, message, "data/expr"))
            elif data.get("table") is None:
                messages.append(_unmarked(label, message))
            else:
                messages.append(_inferred(entry, label, message, "data/lang"))
        for o in outputs:
            if isinstance(o, dict) and not ("value" in o or "range" in o):
                # B19: `repair_constant_value` stores `value: null` («؟»).
                messages.append(_unmarked(label, f"constant output "
                                                 f"{o.get('key')!r} carries "
                                                 f"no value or range"))
    elif inputs:
        if data.get("lang") is None:
            messages.append(_unmarked(label, "a rule with inputs carries no "
                                             "lang"))
        original_key = "original_ref" if kind_of_file == "facts" else "original"
        # A decision table IS the body (§4, I8) — as much one as a formula or
        # the verbatim original, and the only body a table rule ever carries.
        if not (data.get("expr") or data.get(original_key)
                or (data.get("lang") == "table"
                    and isinstance(data.get("table"), dict))):
            messages.append(_unmarked(label, f"a rule with inputs carries no "
                                             f"expr or {original_key}"))
        # B22: a threshold or a target band on a computed output («حد شروع
        # پخت») is legitimate — the rule is gone, not relaxed.


# --------------------------------------------------------------------------- #
# 7 (v3.7). decision-table row shape — §4, I8. The fourth rule body, beside the
# three `_check_constant_shape` admits.
# --------------------------------------------------------------------------- #

def _check_table_shape(entry, messages, label):
    """A `lang: table` rule's rows are FLAT objects keyed by the table's own
    columns. The store schema typed `table` as a bare object, so the engine's
    units wrote flat rows and the UI was built from a mock that nested them as
    `{when, then}`; nothing refused either. Here `table` and `lang` have to
    agree, the table's columns have to be the rule's own declared keys, and a
    row may hold nothing but those columns — including the old nested pair,
    which is named for what it is rather than read as two unknown columns."""
    if entry.get("kind") != "rule":
        return
    data = entry.get("data") or {}
    table = data.get("table")
    if data.get("lang") == "table":
        if not isinstance(table, dict):
            messages.append(_inferred(entry, label, "lang: table carries no "
                                                    "table", "data/lang"))
            return
        if data.get("expr") is not None:
            messages.append(_unmarked(label, "a table rule carries expr — a "
                                             "table has no formula"))
    elif table is not None:
        message = "carries a table but its lang is not table"
        # B25: an absent lang is `repair_table_lang`'s; another body is marked.
        messages.append(_unmarked(label, message)
                        if data.get("lang") is None and isinstance(table, dict)
                        else _inferred(entry, label, message, "data/table"))
        return
    else:
        return
    declared_in = {i.get("key") for i in data.get("inputs") or []
                   if isinstance(i, dict)}
    declared_out = {o.get("key") for o in data.get("outputs") or []
                    if isinstance(o, dict)}
    ins = [k for k in table.get("inputs") or [] if isinstance(k, str)]
    outs = [k for k in table.get("outputs") or [] if isinstance(k, str)]
    for k in ins:
        if k not in declared_in:
            messages.append(_inferred(entry, label, f"table input {k!r} is not "
                                      f"a declared input", "data/table"))
    for k in outs:
        if k not in declared_out:
            messages.append(_inferred(entry, label, f"table output {k!r} is "
                                      f"not a declared output", "data/table"))
    columns = set(ins) | set(outs)
    for n, row in enumerate(table.get("rows") or [], 1):
        if not isinstance(row, dict):
            messages.append(_unmarked(label, f"table row {n} is not an "
                                             f"object"))       # B27
            continue
        if "when" in row or "then" in row:
            message = (f"table row {n} carries when/then — a row is flat, "
                       f"keyed by the table's columns")
            messages.append(_unmarked(label, message) if _flattenable(row)
                            else _inferred(entry, label, message, "data/table"))
            continue
        for k in row:
            if k not in columns:
                messages.append(_unmarked(label, f"table row {n} key {k!r} is "
                                                 f"not a table column"))
        if not any(k in row for k in outs):
            messages.append(_unmarked(label, f"table row {n} names no output"))
    for k in table.get("default") or {}:
        if k not in outs:
            messages.append(_inferred(entry, label, f"table default key {k!r} "
                                      f"is not a table output",
                                      "data/table/default"))


# --------------------------------------------------------------------------- #
# 8. field_status paths exist and hold inferred/informal
# --------------------------------------------------------------------------- #

def _check_field_status(entry, messages, label):
    for path, value in (entry.get("field_status") or {}).items():
        # B32/B33: both are `repair_field_status_*`'s.
        if value not in ("inferred", "informal"):
            messages.append(_unmarked(label, f"field_status {path!r} has value "
                                             f"{value!r}, not "
                                             f"inferred/informal"))
        if not path_exists(entry, path):
            messages.append(_unmarked(label, f"field_status names path "
                                             f"{path!r}, which does not "
                                             f"exist"))


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
            messages.append(_inferred(entry, label, f"reconciled_against cell "
                                      f"field {field!r} is not declared here",
                                      "data/reconciled_against"))
        if row is not None and row not in declared_rows:
            messages.append(_inferred(entry, label, f"reconciled_against cell "
                                      f"row {row!r} is not declared here",
                                      "data/reconciled_against"))


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
                messages.append(_unmarked(label, f"issue {key} {val!r} is not "
                                                 f"a Jalali date"))    # B35


# --------------------------------------------------------------------------- #
# 11. source[].ref exclusions
# --------------------------------------------------------------------------- #

def _check_source_exclusions(entry, messages, label):
    for n, src in enumerate(entry.get("source") or []):
        ref = (src or {}).get("ref") if isinstance(src, dict) else None
        if isinstance(ref, str) and (ref.endswith(".structure.md")
                                     or ref.endswith("NAMED_FUNCTIONS.md")):
            message = (f"source ref {ref!r} may not cite .structure.md or "
                       f"NAMED_FUNCTIONS.md")
            # B36: a dump is re-pointed at its workbook by
            # `repair_generated_sources`; the functions file is kept, marked.
            messages.append(_unmarked(label, message)
                            if ref.endswith(".structure.md")
                            else _inferred(entry, label, message, f"source/{n}"))


# --------------------------------------------------------------------------- #
# 12. processes[] source presence
# --------------------------------------------------------------------------- #

def _cites_process(sources, proc_id):
    return any(isinstance(s, dict) and s.get("type") == "process"
               and isinstance(s.get("ref"), str)
               and s["ref"].endswith(f"{proc_id}.json") for s in sources)


def _check_process_links(entry, messages, label):
    processes = entry.get("processes") or []
    if not processes:
        return
    sources = entry.get("source") or []
    for p in processes:
        proc_id = (p or {}).get("ref") if isinstance(p, dict) else None
        if not proc_id:
            continue
        if not _cites_process(sources, proc_id):
            # B37: `repair_process_links` cites the file or removes the link.
            messages.append(_unmarked(label, f"processes[] link to {proc_id!r} "
                                             f"has no process-type source "
                                             f"naming its file"))


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
    the quotes: the quoted spans fold to `…`, and the fold is the group *key*.
    What is printed is the first body of the group verbatim, specifics and all
    — an agent retrying against `member … is not a declared field` cannot know
    which member, and the accounting review of 2026-09-09 failed the same way
    twice for it. Insertion order is kept, so the output is deterministic.
    """
    groups = {}
    for msg in messages:
        label, sep, body = msg.partition(": ")
        if not sep:
            label, body = "", msg
        groups.setdefault(_QUOTED_RE.sub("…", body), (body, []))[1].append(label)
    out = []
    for first, labels in groups.values():
        shown = ", ".join(labels[:GROUP_IDS_SHOWN])
        tail = " …" if len(labels) > GROUP_IDS_SHOWN else ""
        out.append(f"{first} — {len(labels)} entries: {shown}{tail}")
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
#: «بچ» and «پاس» are not here (B40): in this restaurant they are a batch of
#: sauce and the pass, and the pipeline sense is caught by the words that stay.
PIPELINE_WORDS = ("اسکلت", "بخش از داده‌ها", "واحد کاری",
                  "original", "bindings", "FEEL", "account", "expr")
COLLOQUIAL = ("می‌زنن", "می‌کنن", "داشته باشن", "بگیم", "می‌گیم")
#: Allowed only in a record's own `statement` and a field's `description`.
SHEET_WORDS = ("ستون", "تب", "سلول")
#: The Latin the register keeps: the two words the owner uses untranslated,
#: and `sheet`. Anything else Latin and four letters or longer is a leak.
LATIN_KEPT = frozenset({"csv", "excel", "sheet"})
QUOTE_WORDS = 8

REF_TOKEN_RE = re.compile(REF_TOKEN)
LATIN_WORD_RE = re.compile(r"[A-Za-z]{4,}")
QUOTED_SPAN_RE = re.compile(r"«([^»]*)»")
#: The spreadsheet artefacts a definition must not name. The table prefix is
#: the estate's own (§3.1), so the pattern is built per prefix and kept —
#: `lint_prose` runs over every prose leaf of every entry.
_ARTEFACT = r"\.xlsx\b|\.gs\b|IMPORT_FROM_SHEET|\bLET\(|LAMBDA"


@functools.lru_cache(maxsize=None)
def artefact_re(table_prefix):
    """An estate that names no tables (`table_prefix: ""`) drops the table
    alternative: an empty one matches at every position, and every prose leaf
    of such an estate was refused for naming a table."""
    return re.compile((f"{re.escape(table_prefix)}|" if table_prefix else "")
                      + _ARTEFACT)


def _whole_word_re(words):
    """Persian gives `re` no `\\b` to work with, and these words are short:
    «تب» sits inside «مرتب». So a word counts only when no letter touches it
    on either side."""
    body = "|".join(re.escape(w) for w in words)
    return re.compile(rf"(?<![^\W\d_])(?:{body})(?![^\W\d_])")


PIPELINE_RE = _whole_word_re(PIPELINE_WORDS)
COLLOQUIAL_RE = _whole_word_re(COLLOQUIAL)
SHEET_WORDS_RE = _whole_word_re(SHEET_WORDS)


def lint_prose(text, *, exemptions, allow_sheet_words=False,
               conventions=DEFAULT_CONVENTIONS):
    """§5.2's style card as a check: the findings a sentence earns, empty when
    it is in the register. One finding per rule broken, not one per
    occurrence. Every rule is an unmarked NOTE (B38–B44): style never stops a
    sentence from being stored, and `merge facts audit` lists it.

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
    hit = artefact_re(conventions.table_prefix).search(text)
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
    return [_unmarked("", message) for message in out]


def _check_prose(entry, unit_symbols, messages, label,
                 conventions=DEFAULT_CONVENTIONS):
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
    # §3.3 — where a paper form is kept, who holds it, which external system it
    # lives in: three sentences an owner reads, so three sentences §5.2 lints.
    location = data.get("location")
    if isinstance(location, dict):
        for name in ("kept_at", "holder", "system"):
            targets.append((f"data/location/{name}", location.get(name), False))
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
        for found in lint_prose(text, exemptions=unit_symbols or (),
                                allow_sheet_words=allow_sheet_words,
                                conventions=conventions):
            messages.append(_unmarked(label, f"{path} {found.message}", path))


# --------------------------------------------------------------------------- #
# the REPAIR tier (spec 2026-09-13 §5B) — run by `normalise.normalise_entry`
# before any gate judges the entry. Each repair keeps the meaning, is
# idempotent, and never raises on a malformed shape (the store gate refuses
# those).
# --------------------------------------------------------------------------- #

def _list(value):
    return value if isinstance(value, list) else []


def _dicts(value):
    return [m for m in _list(value) if isinstance(m, dict)]


def _data(entry, kind=None):
    if not isinstance(entry, dict) or (kind and entry.get("kind") != kind):
        return None
    data = entry.get("data")
    return data if isinstance(data, dict) else None


def _to_extra(entry, path, values):
    """Keep `values` unchanged in the envelope's `extra` bag under the QF-7
    path they came from (spec C5). False when the bag cannot take them, and
    the caller then leaves them where they were."""
    extra = entry.setdefault("extra", {})
    if not isinstance(extra, dict) or not isinstance(extra.setdefault(path, []), list):
        return False
    extra[path].extend(values)
    return True


def _swap(values, old, new):
    return [new if v == old else v for v in values]


def _rekey(obj, old, new):
    return {new if k == old else k: v for k, v in obj.items()}


def _rekey_rows(rows, old, new):
    for i, row in enumerate(_list(rows)):
        if isinstance(row, dict) and old in row and new not in row:
            rows[i] = _rekey(row, old, new)


def _rename_member(entry, data, collection, old, new):
    """Everything in the same entry that names the renamed member (B4)."""
    def path(p):
        segs = p.split("/")
        if segs[:3] == ["data", collection, old]:
            segs[2] = new
        elif collection == "fields" and segs[:2] == ["data", "rows"] \
                and segs[3:4] == [old]:
            segs[3] = new
        return "/".join(segs)
    status = entry.get("field_status")
    if isinstance(status, dict):
        entry["field_status"] = {path(p) if isinstance(p, str) else p: v
                                 for p, v in status.items()}
    if collection in ("fields", "header_fields"):
        if isinstance(data.get("primaryKey"), list):
            data["primaryKey"] = _swap(data["primaryKey"], old, new)
        for fk in _dicts(data.get("foreignKeys")):
            if isinstance(fk.get("fields"), list):
                fk["fields"] = _swap(fk["fields"], old, new)
        for ra in _dicts(data.get("reconciled_against")):
            if isinstance(ra.get("cell"), dict) and ra["cell"].get("field") == old:
                ra["cell"]["field"] = new
    if collection == "fields":
        _rekey_rows(data.get("rows"), old, new)
    if collection == "sections":
        for row in _dicts(data.get("rows")):
            if row.get("section") == old:
                row["section"] = new
    if collection in ("inputs", "outputs"):
        table = data.get("table")
        if isinstance(table, dict):
            if isinstance(table.get(collection), list):
                table[collection] = _swap(table[collection], old, new)
            _rekey_rows(table.get("rows"), old, new)
            if collection == "outputs" and isinstance(table.get("default"), dict):
                table["default"] = _rekey(table["default"], old, new)
        # Only a key that is one FEEL token can be named in `expr` at all.
        if isinstance(data.get("expr"), str) and TOKEN_RE.fullmatch(old):
            data["expr"] = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(old)}"
                                  rf"(?![A-Za-z0-9_])", new, data["expr"])


def repair_keys(entry, ctx):
    """B4/B6: the safe key repair, where the result is unique in its list."""
    data = _data(entry)
    if data is None:
        return
    for collection in ("fields", "header_fields", "sections", "inputs", "outputs"):
        members = _dicts(data.get(collection))
        renames = _renames([m.get("key") for m in members], SEGMENT_RE, _fix_segment)
        for old, new in renames.items():
            for m in members:
                if m.get("key") == old:
                    m["key"] = new
            _rename_member(entry, data, collection, old, new)
    rows = _dicts(data.get("rows"))
    for old, new in _renames([r.get("key") for r in rows], KEY_RE, _fix_row_key).items():
        for row in rows:
            if row.get("key") == old:
                row["key"] = new
        for ra in _dicts(data.get("reconciled_against")):
            if isinstance(ra.get("cell"), dict) and ra["cell"].get("row") == old:
                ra["cell"]["row"] = new
        status = entry.get("field_status")
        if isinstance(status, dict):
            prefix = f"data/rows/{old}/"
            entry["field_status"] = {
                f"data/rows/{new}/{p[len(prefix):]}"
                if isinstance(p, str) and p.startswith(prefix) else p: v
                for p, v in status.items()}


def repair_foreign_keys(entry, ctx):
    """B11: a null or empty member is dropped; any other malformed one (in
    practice an import descriptor) is kept unchanged in `extra`."""
    data = _data(entry, "record")
    if data is None or not isinstance(data.get("foreignKeys"), list):
        return
    kept, odd = [], []
    for fk in data["foreignKeys"]:
        if fk in (None, "", [], {}):
            continue
        ok = isinstance(fk, dict) and _fk_fields_ok(fk) and _fk_reference_ok(fk)
        (kept if ok else odd).append(fk)
    if odd and not _to_extra(entry, "data/foreignKeys", odd):
        kept += odd
    data["foreignKeys"] = kept


def repair_constant_lang(entry, ctx):
    """B18: a constant whose `feel`/`table` lang has no body is the store's
    own policy shape, `lang: text`."""
    data = _data(entry, "rule")
    if data is not None and data.get("inputs") == [] \
            and data.get("lang") in ("feel", "table") \
            and data.get("expr") is None and data.get("table") is None:
        data["lang"] = "text"


def repair_constant_value(entry, ctx):
    """B19 (section 9 default): a constant with no number stores
    `value: null`, which the panel shows as a question («؟»)."""
    data = _data(entry, "rule")
    if data is None or data.get("inputs") != []:
        return
    for output in _dicts(data.get("outputs")):
        if "value" not in output and "range" not in output:
            output["value"] = None


def repair_table_lang(entry, ctx):
    """B20/B25: a rule carrying a table object and no lang is a table rule."""
    data = _data(entry, "rule")
    if data is not None and data.get("lang") is None \
            and isinstance(data.get("table"), dict):
        data["lang"] = "table"


def _table_rows(entry):
    data = _data(entry, "rule")
    table = data.get("table") if data is not None else None
    rows = table.get("rows") if isinstance(table, dict) else None
    return (table, rows) if isinstance(rows, list) else (None, None)


def repair_table_rows(entry, ctx):
    """B27: a null or empty row is dropped; another scalar row is kept
    unchanged in `extra` — `row[k]` on it would crash the decision table."""
    table, rows = _table_rows(entry)
    if rows is None:
        return
    odd = [r for r in rows if not isinstance(r, dict) and r not in (None, "", [])]
    if odd and not _to_extra(entry, "data/table/rows", odd):
        return
    table["rows"] = [r for r in rows if isinstance(r, dict)]


def _flattenable(row):
    when, then = row.get("when"), row.get("then")
    return set(row) == {"when", "then"} and isinstance(when, dict) \
        and isinstance(then, dict) and not set(when) & set(then)


def repair_nested_table_rows(entry, ctx):
    """B28: `{when, then}` is `{...when, ...then}` when the two do not clash."""
    _table, rows = _table_rows(entry)
    for i, row in enumerate(rows or []):
        if isinstance(row, dict) and _flattenable(row):
            rows[i] = {**row["when"], **row["then"]}


def _marker(value):
    if isinstance(value, dict):
        value = "inferred" if value.get("inferred") else value.get("value")
    if isinstance(value, str):
        value = value.strip().lower()
    if value in ("inferred", "informal"):
        return value
    if value is None or value is False or value in ("", "confirmed", "stated"):
        return None
    return "inferred"                         # the cautious reading


def repair_field_status_values(entry, ctx):
    """B32: any other non-empty marker is `inferred`; false, null, confirmed
    and stated say nothing and are dropped."""
    status = entry.get("field_status") if isinstance(entry, dict) else None
    if isinstance(status, dict):
        entry["field_status"] = {p: _marker(v) for p, v in status.items()
                                 if _marker(v)}


def repair_field_status_paths(entry, ctx):
    """B33: a status on a path that resolves to nothing means nothing. A path
    that does resolve — `data/fields/<key>/title` on a field that has a
    title — is kept."""
    status = entry.get("field_status") if isinstance(entry, dict) else None
    if isinstance(status, dict):
        entry["field_status"] = {p: v for p, v in status.items()
                                 if isinstance(p, str) and path_exists(entry, p)}


_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def _jalali(text):
    parts = text.translate(_DIGITS).strip().replace("/", "-").split("-")
    if len(parts) not in (2, 3) or not all(p.isdigit() for p in parts):
        return None
    fixed = "-".join([parts[0]] + [p.zfill(2) for p in parts[1:]])
    return fixed if JALALI_RE.fullmatch(fixed) else None


def repair_issue_dates(entry, ctx):
    """B35: Persian digits, `/` and missing zeros are normalised. A date that
    still does not read is removed and its raw text appended to the issue's
    description, so nothing is lost."""
    for issue in _dicts(entry.get("issues") if isinstance(entry, dict) else None):
        for key, word in (("from_date", "از"), ("to_date", "تا")):
            value = issue.get(key)
            if value is None or JALALI_RE.fullmatch(str(value)):
                continue
            fixed = _jalali(str(value))
            description = issue.get("description")
            if fixed:
                issue[key] = fixed
            elif description is None or isinstance(description, str):
                del issue[key]
                issue["description"] = f"{description or ''} ({word} {value})".strip()


def repair_generated_sources(entry, ctx):
    """B36: a generated `<book>.structure.md` is cited as its sibling
    `<book>.xlsx`, a sheet source, with `sheet`/`cell` kept."""
    for source in _dicts(entry.get("source") if isinstance(entry, dict) else None):
        ref = source.get("ref")
        if isinstance(ref, str) and ref.endswith(".structure.md"):
            source["ref"] = ref[:-len(".structure.md")] + ".xlsx"
            source["type"] = "sheet"


def repair_process_links(entry, ctx):
    """B8, then B37. A link off the id grammar is removed with an issue
    quoting it. A link with no citation of its process file gets one when
    `departments/<dept>/processes/<id>.json` exists; otherwise it is removed
    with an issue. With no `root` there is no file to look at, and B37 waits
    for a gate that has one."""
    if not isinstance(entry, dict) or not isinstance(entry.get("processes"), list):
        return None
    label = ctx.get("label") or ""
    out, kept = [], []
    for link in entry["processes"]:
        ref = link.get("ref") if isinstance(link, dict) else None
        if isinstance(ref, str) and PROC_ID_RE.fullmatch(ref):
            kept.append(link)
        else:
            out.append(_bad_process_ref(label, ref))
    root = ctx.get("root")
    if root is not None:
        if entry.get("source") is None:
            entry["source"] = []
        sources = entry["source"]
        for link in list(kept):
            ref = link["ref"]
            if isinstance(sources, list) and _cites_process(sources, ref):
                continue
            path = f"departments/{ref.rsplit('-', 1)[0]}/processes/{ref}.json"
            if isinstance(sources, list) and (pathlib.Path(root) / path).is_file():
                sources.append({"type": "process", "ref": path})
                continue
            kept.remove(link)
            out.append(note(label, f"processes[] link to {ref!r} names no "
                                   f"process file",
                            fa=f"پیوند به فرایند «{ref}» ثبت نشد، چون پروندهٔ "
                               f"این فرایند پیدا نشد."))
    entry["processes"] = kept
    return out


#: The content pass's REPAIR tier, run by `merge_facts.normalise.normalise_entry`
#: in this order (after the store's). `def fn(entry, ctx) -> list[Finding] | None`,
#: mutating `entry`. The key repair runs first, so everything after it reads
#: the repaired keys.
CONTENT_REPAIRS = [
    repair_keys,                    # B4/B6
    repair_foreign_keys,            # B11
    repair_constant_lang,           # B18
    repair_constant_value,          # B19 (section 9 default)
    repair_table_lang,              # B20 + B25
    repair_table_rows,              # B27
    repair_nested_table_rows,       # B28
    repair_field_status_values,     # B32
    repair_field_status_paths,      # B33
    repair_issue_dates,             # B35
    repair_generated_sources,       # B36
    repair_process_links,           # B8 + B37
]
