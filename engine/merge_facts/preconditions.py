"""The store gate (spec 2026-09-13-facts-gate-tiers §5C, rows C1–C37): what
`merge facts apply`, `validate facts-delta --store` and `merge facts edit` do
to an entry before the first byte is written.

Every rule here is one of three tiers (§4). A REPAIR puts the entry into the
accepted shape without changing its meaning (`STORE_REPAIRS`, run by
`normalise.normalise_entry`); a NOTE stores the entry and marks it (a
`tiers.note`, which `tiers.apply_notes` writes as `field_status` or a `shape`
issue); a REFUSE costs that one entry (a `tiers.refuse`). `preconditions`
returns findings, never raises, and never refuses a whole delta for one entry.

Lifted out of `apply.py` (v3 §4) so `validate facts-delta --store --run` runs
the same pass without importing the writer; `apply` imports from here and never
the other way round. Four helper names are still read off `merge_facts.apply`
by `audit.py` and the tests; `apply` re-exports them.

**The repair pass reads the schema, not a copy of it.** The two store schemas
are the contract; `repair_shape` validates an entry against a *strict view* of
them — every open vocabulary (`anyOf: [<closed form>, {"type": …}]`, C13/C17)
closed again — and fixes what each error names, one at a time: an unknown
member moves to `extra` (C5/C6), a wrappable container is wrapped (C7), a
computable required member is filled (C10), an incomplete member is severed
into `extra` (C11), a key or a date is normalised (C15/C17), a scalar is
converted (C18) or moved aside (C19), a word outside its vocabulary is mapped
to its synonym or marked (C13). What it cannot fix it leaves; the per-entry
schema check that follows refuses it (C2, C8, C9, C16).
"""
import functools
import json
import pathlib
import re

from jsonschema import Draft202012Validator

from engine_common import read_json, schema_dir
from merge_facts import (KEY_RE, KIND_ORDER, PROC_ID_RE, _sheet_identities,
                         canonical_scope, find_match, is_open, iter_ref_objects,
                         load_store)
from merge_facts.content import check_document
from merge_facts.conventions import load as load_conventions
from merge_facts.ladder import merge_entry
from merge_facts.tiers import coerce, note, refuse

FACT_ID_RE = re.compile(r"^F-[0-9]{5}$")
TEMP_ID_RE = re.compile(r"^T-[0-9]+$")
UNITS_KEY = "units"
UNKNOWN_UNIT = "—"
# §10: `pack` and `item.units[]` carry pack sizes, not units — "which the unit
# check does not walk". The audit's `unit_raw` walk skips the same pair.
PACK_KEYS = frozenset({"pack", "units"})


def _lookup(store, by_temp, ref_id):
    """The entry a `{ref}` names — this delta's, or the store's."""
    if ref_id in by_temp:
        return by_temp[ref_id]
    for kind in KIND_ORDER:
        for e in store[kind]["entries"]:
            if e["id"] == ref_id:
                return e
    return None


def _registered(path, plural):
    try:
        doc = read_json(path)
    except (OSError, ValueError):
        return set()
    return {row.get("code") for row in doc.get(plural) or [] if isinstance(row, dict)}


def _is_stub(entry):
    data = entry.get("data")
    return isinstance(data, dict) and bool(data.get("stub"))


def _shaped(entry):
    """An entry whose `data` (and `location`, when present) are objects — the
    only shape the identity and unit repairs may walk before the per-entry
    schema check has refused the rest."""
    data = entry.get("data") if isinstance(entry, dict) else None
    return isinstance(data, dict) and isinstance(data.get("location", {}), dict)


def _member_seg(member, n):
    """A list member's QF-7 segment: its `key`, else its `id`, else its index
    (`merge_facts._member_index` reads them in the same order)."""
    if isinstance(member, dict):
        for name in ("key", "id"):
            if isinstance(member.get(name), str) and member[name]:
                return member[name]
    return str(n)


def _unit_holders(value, where="data"):
    """`(holder, QF-7 path of its unit)` for every object carrying a string
    `unit` under `data`, skipping the pack levels §10 excludes."""
    if isinstance(value, dict):
        if isinstance(value.get("unit"), str):
            yield value, f"{where}/unit"
        for k, v in value.items():
            if k not in PACK_KEYS:
                yield from _unit_holders(v, f"{where}/{k}")
    elif isinstance(value, list):
        for n, member in enumerate(value):
            yield from _unit_holders(member, f"{where}/{_member_seg(member, n)}")


def _unit_symbols(entry):
    """Every symbol this entry cites as a unit (QF-40). `facts_plan.assemble`
    lints its decisions with it."""
    return [h["unit"] for h, _ in _unit_holders(entry.get("data") or {})
            if h["unit"] and h["unit"] != UNKNOWN_UNIT]


def registered_scope(root):
    """The department and branch codes the estate registers (QF-33)."""
    root = pathlib.Path(root)
    return (_registered(root / "departments" / "registry.json", "departments"),
            _registered(root / "attachments" / "sheets" / "manifest.json",
                        "branches"))


def scope_findings(entry, departments, branches, label):
    """QF-33. C24: a department outside the registry is REFUSED (R4 — it is
    the access boundary). C25: a branch outside the manifest is dropped from
    the scope with a NOTE — branches only filter the panel."""
    scope = entry.get("scope") if isinstance(entry.get("scope"), dict) else {}
    out = [refuse(label, f"department {d!r} is not in departments/registry.json")
           for d in scope.get("departments") or [] if d not in departments]
    unknown = [b for b in scope.get("branches") or [] if b not in branches]
    if unknown:
        scope["branches"] = [b for b in scope["branches"] if b in branches]
        out += [note(label, f"branch {b!r} is not in attachments/sheets/manifest.json;"
                            f" dropped from the scope") for b in unknown]
    return out


def undeclared_unit_findings(entry, unit_rows, label):
    """C28's NOTE: a unit symbol no row of the units record declares is stored
    as written, its `unit_raw` kept, and the leaf marked inferred. The spelling
    repair (`repair_unit_spelling`) has already run."""
    return [note(label, f"unit {h['unit']!r} is declared by no row of the units record",
                 path=where, mark="inferred")
            for h, where in _unit_holders(entry.get("data") or {})
            if h["unit"] and h["unit"] != UNKNOWN_UNIT and h["unit"] not in unit_rows]


def _unit_row_keys(store, entries):
    """The open row keys of the `units` record — the store's, plus this delta's
    (the delta that creates or extends the table declares its own symbols)."""
    return {row["key"] for row in _unit_rows(store, entries)}


def _unit_rows(store, entries):
    out = []
    for record in list(store["record"]["entries"] if store else []) + list(entries):
        if not (isinstance(record, dict) and record.get("kind") == "record"
                and record.get("key") == UNITS_KEY
                and isinstance(record.get("data"), dict)):
            continue
        for row in record["data"].get("rows") or []:
            if isinstance(row, dict) and isinstance(row.get("key"), str) \
                    and row["key"] and is_open(row):
                out.append(row)
    return out


def _declared_fields(entry):
    data = entry.get("data") or {}
    out = set()
    for name in ("fields", "header_fields", "outputs"):
        for member in data.get(name) or []:
            if isinstance(member, dict) and member.get("key"):
                out.add(member["key"])
    return out


def _declared_rows(entry):
    return {r["key"] for r in (entry.get("data") or {}).get("rows") or []
            if isinstance(r, dict) and r.get("key")}


# --------------------------------------------------------------------------- #
# paths inside an entry, and the preserved bag
# --------------------------------------------------------------------------- #

def _get(entry, path):
    node = entry
    for p in path:
        node = node[p]
    return node


def _qf7(entry, path):
    node, segs = entry, []
    for p in path:
        if isinstance(p, int):
            segs.append(_member_seg(node[p], p))
        else:
            segs.append(p)
        node = node[p] if isinstance(node, (dict, list)) else None
    return "/".join(segs)


def _stash(entry, where, value):
    """C5: keep `value` in the envelope's `extra`, keyed by its QF-7 path. A
    second value for a path already held gets `~2`, `~3` — nothing is
    overwritten."""
    if any(True for _ in iter_ref_objects(value)):
        # a `{ref}` kept as an object would still be read as a link — its
        # temp id rewritten, its target resolved (INV-1, C6) — so it is text
        value = json.dumps(value, ensure_ascii=False, sort_keys=True)
    bag = entry.setdefault("extra", {})
    key, n = where, 1
    while key in bag:
        n += 1
        key = f"{where}~{n}"
    bag[key] = value


def _sever(entry, path, label, why):
    """Move the member at `path` out of the entry into `extra`, with a NOTE."""
    where = _qf7(entry, path)
    value = _get(entry, path)
    del _get(entry, path[:-1])[path[-1]]
    _stash(entry, where, value)
    return True, [note(label, f"{where}: {why}; kept in extra", path=where)]


# --------------------------------------------------------------------------- #
# the shape repair — the schema's own errors, fixed one at a time
# --------------------------------------------------------------------------- #

OPEN = "x-open"
DATA_DEFS = {"item": "itemData", "record": "recordData",
             "measurement": "measurementData", "rule": "ruleData",
             "note": "noteData"}
_VALIDATORS = {}

#: C13's fixed synonym map — applied only when the word is outside its
#: vocabulary and the synonym is inside it.
SYNONYMS = {"int": "integer", "float": "number", "decimal": "number",
            "text": "string", "bool": "boolean", "spreadsheet": "sheet",
            "sheets": "sheet", "audio": "voice", "image": "photo"}

#: C8: a member of the wrong type here is refused, not moved — code iterates
#: or indexes it (spec §6).
CONTAINERS = frozenset({"data", "location", "table", "default", "movement",
                        "constraints", "refItems", "pack", "range", "scope",
                        "field_status", "extra", "columns", "params",
                        "identifier_scheme"})

#: C2/C3: identity leaves no repair touches.
IDENTITY = (["kind"], ["key"], ["title"], ["id"])

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_NONE = object()


def _strict(node):
    """The schema with every open vocabulary closed again: an `anyOf` whose
    second member is a bare `{"type": …}` is the open form of its first."""
    if isinstance(node, list):
        return [_strict(n) for n in node]
    if not isinstance(node, dict):
        return node
    node = {k: _strict(v) for k, v in node.items()}
    branches = node.get("anyOf")
    if isinstance(branches, list) and len(branches) == 2 and list(branches[1]) == ["type"]:
        rest = {k: v for k, v in node.items() if k != "anyOf"}
        node = {**rest, **branches[0], OPEN: True}
    return node


def _validators(schema_name):
    key = (str(schema_dir()), schema_name)
    if key not in _VALIDATORS:
        defs = _strict(read_json(schema_dir() / schema_name))["$defs"]
        _VALIDATORS[key] = {
            name: Draft202012Validator({"$defs": defs, "$ref": f"#/$defs/{name}"})
            for name in ("envelope", *DATA_DEFS.values())}
    return _VALIDATORS[key]


def _errors(entry, schema_name):
    found = [([], e) for e in _validators(schema_name)["envelope"].iter_errors(entry)]
    data_def = DATA_DEFS.get(entry.get("kind"))
    if data_def and isinstance(entry.get("data"), dict):
        found += [(["data"], e) for e in
                  _validators(schema_name)[data_def].iter_errors(entry["data"])]
    out = [(prefix + list(e.absolute_path), e) for prefix, e in found]
    return sorted(out, key=lambda pe: ("/".join(map(str, pe[0])), pe[1].validator))


def _convert(value, want):
    """C18: a scalar the engine can read as the wanted type, or `_NONE`."""
    if isinstance(value, bool):
        return ("true" if value else "false") if "string" in want else _NONE
    if isinstance(value, (int, float)):
        if "integer" in want and float(value).is_integer():
            return int(value)
        return str(value) if "string" in want else _NONE
    if isinstance(value, str):
        s = value.strip().translate(_DIGITS)
        if "boolean" in want and s.lower() in ("true", "false"):
            return s.lower() == "true"
        if ("integer" in want or "number" in want) and re.fullmatch(r"-?[0-9]+", s):
            return int(s)
        if "number" in want and re.fullmatch(r"-?[0-9]*\.[0-9]+", s):
            return float(s)
    return _NONE


def normalise_key(value, pattern=KEY_RE.pattern):
    """C15: trim, lower-case, spaces and `-` to `_`, repeated `_` collapsed —
    to `__` under the minted-KEY grammar, whose separator it is."""
    s = re.sub(r"[\s\-]+", "_", value.strip().translate(_DIGITS).lower())
    s = re.sub(r"_{3,}", "__", s) if "__" in pattern else re.sub(r"_+", "_", s)
    return s.strip("_")


def _candidates(value, pattern):
    """C15/C17: the spellings a pattern miss may have meant, in order."""
    s = value.strip().translate(_DIGITS)
    yield s
    if "[a-z]" in pattern:
        yield normalise_key(value, pattern)
    date = re.fullmatch(r"([0-9]{4})[/-]([0-9]{1,2})(?:[/-]([0-9]{1,2}))?", s)
    if date:
        yield "-".join([date[1]] + [p.zfill(2) for p in date.groups()[1:] if p])
    yield re.sub(r"[Ll\s]", "", s.replace("–", "-").replace("—", "-"))


def _named(ctx, value):
    return any(obj.get("ref") == value for e in ctx.get("entries") or []
               if isinstance(e, dict) for obj in iter_ref_objects(e))


def _owned(path, name):
    """C4: a member the engine writes itself, dropped from a delta."""
    names = [p for p in path if isinstance(p, str)]
    return ((not path and name in ("status", "updated_at"))
            or (names[-1:] == ["source"] and name in ("hash", "run"))
            or (names == ["accounts"] and name == "id")
            or (path == ["data"] and name == "original_ref"))


def _fill(entry, path, owner, name, label):
    """C10 (a value the engine can compute) or C11 (sever what is incomplete)."""
    target = _get(entry, path)
    if owner == "entry":
        if name == "statement":
            target[name] = ""
            return True, [note(label, "the entry has no statement", path="statement")]
        if name in ("source", "retired"):
            target[name] = [] if name == "source" else False
            return True, []
        return None                                     # C2: identity
    if owner == "data":
        if name == "about":
            return None                                 # C30
        if name in ("inputs", "outputs"):
            target[name] = []
            if name == "inputs" and (target.get("expr") or target.get("table")):
                return True, [note(label, "a rule with a body names no inputs",
                                   path="data/inputs", mark="inferred")]
            return True, []
        target[name] = {} if name == "location" else None   # `_recompute_location`
        return True, []
    fills = {("location", "kept_at"): None, ("location", "holder"): None,
             ("location", "system"): None, ("accounts", "status"): "open",
             ("issues", "affects"): [], ("source", "ref"): None}
    if (owner, name) in fills:
        target[name] = fills[(owner, name)]
        return True, []
    if path[:2] == ["data", "rows"] or owner == "instances":
        return None                                     # C9: identity
    return _sever(entry, path, label, f"{name!r} is missing")


def _retype(entry, path, owner, value, want, schema, label):
    want = [want] if isinstance(want, str) else list(want)
    if path in IDENTITY:
        return None
    converted = _convert(value, want)
    if converted is not _NONE:
        _get(entry, path[:-1])[path[-1]] = converted
        return True, []
    if value is None:                                   # C7: absent is allowed
        del _get(entry, path[:-1])[path[-1]]
        return True, []
    if "array" in want:
        if isinstance(value, (dict, str)):              # C7: wrap
            _get(entry, path[:-1])[path[-1]] = [value]
            return True, []
        return None                                     # C8
    if "object" in want:
        if owner in CONTAINERS or isinstance(path[-1], int):
            return None                                 # C8
        return _sever(entry, path, label, "is not an object")
    if schema.get(OPEN) and isinstance(value, str):
        return False, [note(label, f"{_qf7(entry, path)}: {value!r} is not a "
                                   f"{'/'.join(want)}", path=_qf7(entry, path),
                            mark="inferred")]
    where = _qf7(entry, path)                           # C19
    _stash(entry, where, value)
    if "null" in want:
        _get(entry, path[:-1])[path[-1]] = None
    else:
        del _get(entry, path[:-1])[path[-1]]
    return True, [note(label, f"{where}: a {type(value).__name__} where a "
                              f"{'/'.join(want)} goes; kept in extra", path=where)]


def _branch(entry, path, err, ctx, label, delta):
    """A `oneOf` miss: fix the branch the value's own type fits, fewest errors
    first; a value no branch fits is severed (C19/C29)."""
    by = {}
    for sub in err.context:
        by.setdefault(sub.relative_schema_path[0], []).append(sub)
    fits = []
    for i in range(len(err.validator_value)):
        subs = by.get(i, [])
        if not subs:
            return None                                 # matched twice
        if any(not s.path and (s.validator == "type" or (
                s.validator in ("enum", "const") and not s.schema.get(OPEN)))
               for s in subs):
            continue
        fits.append((len(subs), i))
    if fits:
        subs = by[min(fits)[1]]
        for sub in sorted(subs, key=lambda s: "/".join(map(str, s.path))):
            result = _fix(entry, path + list(sub.path), sub, ctx, label, delta)
            if result is not None:
                return result
        return None
    if err.instance is None:
        del _get(entry, path[:-1])[path[-1]]
        return True, []
    return _sever(entry, path, label, "matches none of its shapes")


#: The member lists whose keys the content pass renames across the entry (B4, B6).
RENAMED_KEYS = frozenset({"fields", "header_fields", "sections", "inputs",
                          "outputs", "rows"})


def _content_owned(path):
    """A pattern miss the content pass owns, left alone here: a B4/B6 member
    key (renamed, with every place the entry names it, only when unique — a
    blind rename here would orphan its cells or collide with a sibling; what
    stays off-grammar is refused, C16), a `processes[]` ref (B8: removed with
    an issue quoting it) and an issue date (B35: moved into the description)."""
    return ((len(path) == 4 and path[0] == "data" and path[1] in RENAMED_KEYS
             and path[3] == "key")
            or (len(path) == 3 and path[0] == "processes" and path[2] == "ref")
            or (len(path) == 3 and path[0] == "issues"
                and path[2] in ("from_date", "to_date")))


def _fix(entry, path, err, ctx, label, delta):
    """One schema error → `(changed, findings)`, or `None` for a refusal."""
    value, rule, schema = err.instance, err.validator, err.schema
    names = [p for p in path if isinstance(p, str)]
    owner = names[-1] if names else "entry"
    if rule == "pattern" and _content_owned(path):
        return None
    if names[:1] == ["field_status"]:
        return None                                     # the content pass's (B32)
    if rule == "additionalProperties":                  # C4, C5, C6
        where = _qf7(entry, path)
        props = schema.get("properties") or {}
        patterns = list(schema.get("patternProperties") or {})
        for k in [k for k in value if k not in props
                  and not any(re.search(p, k) for p in patterns)]:
            member = value.pop(k)
            if not (delta and _owned(path, k)):
                _stash(entry, f"{where}/{k}" if where else k, member)
        return True, []
    if rule == "required":
        missing = [n for n in err.validator_value if n not in value]
        return _fill(entry, path, owner, missing[0], label) if missing else None
    if rule == "type":
        return _retype(entry, path, owner, value, err.validator_value, schema, label)
    if rule == "enum" and path:
        target = _get(entry, path[:-1])
        word = value.strip().lower() if isinstance(value, str) else None
        for candidate in (word, SYNONYMS.get(word)):
            if candidate is not None and candidate != value \
                    and candidate in err.validator_value:
                target[path[-1]] = candidate            # C13: the synonym map
                return True, []
        where = _qf7(entry, path)
        if names[:1] == ["accounts"] and owner == "status":      # C14
            _stash(entry, where, value)
            target[path[-1]] = "open"
            return True, [note(label, f"{where}: account status {value!r} is not "
                                      f"open/chosen/rejected; stored open", path=where)]
        if schema.get(OPEN):                            # C13
            return False, [note(label, f"{where}: {value!r} is outside its vocabulary",
                                path=where, mark="inferred")]
        return None
    if rule == "pattern" and isinstance(value, str):
        target = _get(entry, path[:-1])
        for candidate in _candidates(value, err.validator_value):
            if candidate != value and re.search(err.validator_value, candidate):
                target[path[-1]] = candidate            # C15, C17
                return True, []
        where = _qf7(entry, path)
        if schema.get(OPEN):                            # C17: stored as written
            return False, [note(label, f"{where}: {value!r} is not in its format",
                                path=where, mark="inferred")]
        if path == ["id"] and delta and not FACT_ID_RE.fullmatch(value) \
                and not _named(ctx, value):             # C3
            del entry["id"]
            return True, []
        if owner == "ref" and len(path) > 1:            # C29: an unreadable ref
            return _sever(entry, path[:-1], label,
                          f"reference {value!r} matches no id grammar")
        return None                                     # C16
    if rule in ("oneOf", "anyOf"):
        return _branch(entry, path, err, ctx, label, delta)
    if rule == "not" and path == ["data"]:              # C4: `data.original_ref`
        value.pop("original_ref", None)
        return True, []
    return None


def repair_shape(entry, ctx):
    """C4–C7, C10–C15, C17–C19: fix the strict schema's errors one at a time,
    re-reading them after every change. What is left, the per-entry schema
    check refuses."""
    if not isinstance(entry, dict):
        return []
    schema_name = ctx.get("schema") or "facts-delta.schema.json"
    delta = schema_name == "facts-delta.schema.json"
    label = ctx.get("label") or entry.get("id") or entry.get("key") or ""
    found, spent = [], set()
    while True:
        for path, err in _errors(entry, schema_name):
            mark = (tuple(path), err.validator,
                    json.dumps(err.instance, sort_keys=True, ensure_ascii=False,
                               default=str)[:300])
            if mark in spent:
                continue
            result = _fix(entry, path, err, ctx, label, delta)
            if result is None or not result[0]:
                spent.add(mark)
                found += result[1] if result else []
                continue
            found += result[1]
            break
        else:
            return found


def _natural_key(entry):
    scope = canonical_scope(entry.get("scope"))
    return (entry["kind"], entry.get("key"),
            tuple(scope["departments"]), tuple(scope["branches"]))


def repair_tab_holder(entry, ctx):
    """C22 against the store: a tab an open record already holds under another
    key — the delta is applied to that holder, keeping its key and scope, and
    the incoming ones are noted. A stub holder is exempt (QF-20)."""
    store = ctx.get("store")
    if not store or not _shaped(entry) or entry.get("kind") != "record" \
            or not isinstance(entry.get("scope", {}), dict):
        return []
    for ident in _sheet_identities(entry):
        holder = next((e for e in store["record"]["entries"]
                       if is_open(e) and ident in _sheet_identities(e)), None)
        if holder is None or _is_stub(holder) or holder.get("id") == entry.get("id") \
                or _natural_key(holder) == _natural_key(entry):
            continue
        incoming = (entry.get("key"), canonical_scope(entry.get("scope")))
        entry["key"], entry["scope"] = holder["key"], canonical_scope(holder.get("scope"))
        return [note(ctx.get("label") or "",
                     f"tab {ident[0]}/{ident[1]} already belongs to {holder['id']} "
                     f"({holder['key']!r}); applied to it — this delta carried key "
                     f"{incoming[0]!r} and scope {incoming[1]}", mark="none")]
    return []


def repair_unit_spelling(entry, ctx):
    """C28's repair: an undeclared unit spelling that case-folds to exactly one
    declared row's key, symbol or title is replaced by that row's key."""
    if not _shaped(entry):
        return []
    store = ctx.get("store")
    if store is None and ctx.get("root") is not None:
        store = load_store(ctx["root"])
    # `unit_rows` is the set of declared symbols (row keys); the rest of a row
    # — its symbol and title — is read off the units record itself
    rows = _unit_rows(store, ctx.get("entries") or [])
    rows += [{"key": k} for k in ctx.get("unit_rows") or []]
    declared = {r["key"] for r in rows}
    for holder, _where in _unit_holders(entry["data"]):
        symbol = holder["unit"]
        if not symbol or symbol in declared or symbol == UNKNOWN_UNIT:
            continue
        folded = symbol.strip().casefold()
        hits = {r["key"] for r in rows
                if folded in {str(r[k]).strip().casefold()
                              for k in ("key", "symbol", "unit_title") if r.get(k)}}
        if len(hits) == 1:
            holder["unit"] = hits.pop()
    return []


#: An estate workbook — the one citation whose absence is not a failure.
#: `.xlsx` exactly: the `.gs` scripts and the `.structure.md` dumps live in git
#: beside the binary (QF-44 tags them), so only the binary is server-local.
_ESTATE_BINARY = re.compile(r"^attachments/sheets/.+\.xlsx$")


def repaired_ref(root, manifest_by_id, ref):
    """The path QF-5 requires for a `ref` that names no file, or `None`: a
    bare Drive spreadsheet id the manifest maps to its workbook, or a path that
    lost its `attachments/sheets/` root. Anything else is left as it is — a
    repair that guessed would cite evidence nobody checked."""
    if (root / ref).exists():
        return None
    workbook = manifest_by_id.get(ref)
    if workbook and workbook.get("dir") and workbook.get("file"):
        return f"attachments/sheets/{workbook['dir']}/{workbook['file']}"
    rooted = f"attachments/sheets/{ref}"
    return rooted if (root / rooted).is_file() else None


def _citations(entry):
    sources = [s for s in entry.get("source") or []] \
        if isinstance(entry.get("source"), list) else []
    accounts = entry.get("accounts") if isinstance(entry.get("accounts"), list) else []
    return sources + [a.get("source") for a in accounts if isinstance(a, dict)]


def repair_source_refs(entry, ctx):
    """C32: `merge facts repair-source-refs`' own fix, applied at the gate."""
    if ctx.get("root") is None or not isinstance(entry, dict):
        return []
    root = pathlib.Path(ctx["root"])
    try:
        workbooks = read_json(root / "attachments" / "sheets" / "manifest.json").get(
            "workbooks") or []
    except (OSError, ValueError, AttributeError):
        workbooks = []
    by_id = {w["spreadsheetId"]: w for w in workbooks
             if isinstance(w, dict) and w.get("spreadsheetId")}
    for src in _citations(entry):
        ref = src.get("ref") if isinstance(src, dict) else None
        if isinstance(ref, str) and ref and not _ESTATE_BINARY.match(ref):
            try:
                fixed = repaired_ref(root, by_id, ref)
            except (OSError, ValueError):
                fixed = None
            if fixed:
                src["ref"] = fixed
    return []


#: The store gate's REPAIR tier, run by `merge_facts.normalise.normalise_entry`
#: before `content.CONTENT_REPAIRS`. `def fn(entry, ctx) -> list[Finding] | None`.
STORE_REPAIRS = [repair_shape, repair_tab_holder, repair_unit_spelling,
                 repair_source_refs]


def fold_twins(entries):
    """C21 and the in-delta half of C22: a second open entry with the same
    natural key, or claiming a tab the first already claims, is folded into
    the first through the ladder — as if it came in the next run. Refs to the
    folded entry's temp id follow it. Returns `(entries, notes)`."""
    out, found, renamed = [], [], {}
    for entry in entries:
        twin = next((o for o in out if is_open(o) and is_open(entry) and (
            _natural_key(o) == _natural_key(entry)
            or set(_sheet_identities(o)) & set(_sheet_identities(entry)))), None)
        if twin is None:
            out.append(entry)
            continue
        if _natural_key(twin) != _natural_key(entry):
            found.append(note(twin.get("id") or twin["key"],
                              f"{entry.get('id') or entry['key']} claims the same tab "
                              f"under key {entry['key']!r} and scope {entry['scope']}; "
                              f"folded into this entry", mark="none"))
            entry = {**entry, "key": twin["key"], "scope": twin["scope"]}
        merge_entry(twin, entry, (entry.get("source") or [{}])[0])
        if entry.get("id") and twin.get("id"):
            renamed[entry["id"]] = twin["id"]
    for entry in out:
        for obj in iter_ref_objects(entry):
            if obj.get("ref") in renamed:
                obj["ref"] = renamed[obj["ref"]]
    return out, found


# --------------------------------------------------------------------------- #
# the document pass — findings about entries in their store
# --------------------------------------------------------------------------- #

#: A `{ref}` that fills one of these slots is its member's reason to exist, so
#: a dangling one severs the member, not the ref (C29 → C11).
REQUIRED_SLOTS = {("applies_to", "record"), ("tracked", "record"),
                  ("reconciled_against", "against"), ("imports", "source")}


def _ref_sites(node, path):
    if isinstance(node, dict):
        if "ref" in node and set(node) <= {"ref", "field", "row"}:
            yield path, node
            return
        for k, v in node.items():
            yield from _ref_sites(v, path + [k])
    elif isinstance(node, list):
        for n, member in enumerate(node):
            yield from _ref_sites(member, path + [n])


def reference_findings(store, by_temp, entry, label, fields=True):
    """QF-37. C29: a `{ref}` whose id is unreadable or names nothing is severed
    into `extra` with a NOTE (its whole member, when it fills a required slot).
    C30: a note whose every `about` dangles is REFUSED (R3). C31 (`fields`): a
    `field`/`row` its target does not declare is dropped, the entry-level ref
    kept. A stub target defers every check (QF-20)."""
    sites = list(_ref_sites(entry, []))
    out, dangling = [], []
    for path, obj in sites:
        ref = obj.get("ref")
        if not isinstance(ref, str):
            continue
        if not (FACT_ID_RE.fullmatch(ref) or TEMP_ID_RE.fullmatch(ref)):
            if not PROC_ID_RE.fullmatch(ref):           # a process link (QF-8)
                dangling.append((path, f"reference {ref!r} matches no id grammar"))
            continue
        target = _lookup(store, by_temp, ref)
        if target is None:
            dangling.append((path, f"reference {ref!r} names no entry in the store "
                                   f"or in this delta"))
            continue
        if _is_stub(target) or not fields:
            continue
        for part, declared in (("field", _declared_fields(target)),
                               ("row", _declared_rows(target))):
            if obj.get(part) and obj[part] not in declared:
                where = _qf7(entry, path)
                _stash(entry, f"{where}/{part}", obj.pop(part))
                out.append(note(label, f"{ref} declares no {part} at {where}; "
                                       f"the link keeps the entry", path=where))
    about = [p for p, _ in sites if p[:2] == ["data", "about"]]
    if about and len([p for p, _ in dangling if p[:2] == ["data", "about"]]) == len(about):
        return [refuse(label, "every data.about reference names nothing — a note "
                              "must be about something (QF-9)")]
    for path, why in reversed(dangling):
        if len(path) >= 3 and (path[-3], path[-1]) in REQUIRED_SLOTS:
            path = path[:-1]
        out += _sever(entry, path, label, why)[1]
    return out


def _title_twin(store, entry):
    """QF-34's exact-match guard: an open entry of the same kind and canonical
    scope whose title byte-equals this one's.

    ponytail: Persian is compared byte-wise here, by decision — no NFC, ZWNJ,
    ی/ي or digit folding. A re-typed title reads as a new one; the audit's
    look-alike report is the backstop.
    """
    for other in store[entry["kind"]]["entries"]:
        if (is_open(other) and other.get("title") == entry.get("title")
                and canonical_scope(other.get("scope")) == entry["scope"]):
            return other
    return None


def _citation_state(root, ref):
    """`ok`, `missing` or `outside` for one `ref` (QF-5). A `chat` citation
    names no file and says so; an estate `.xlsx` is server-local."""
    if not isinstance(ref, str) or not ref or _ESTATE_BINARY.match(ref):
        return "ok"
    try:
        target = (root / ref).resolve()
        if not target.is_relative_to(root.resolve()):
            return "outside"
        return "ok" if target.exists() else "missing"
    except (ValueError, OSError):
        return "outside"


def _source_path_problems(root, entry, label):
    """QF-5's sentence — *"`ref` is a path relative to `data-repo/`… any other
    unresolvable path fails `apply`"* — as one line per broken citation, for
    `source[]` and `accounts[].source` alike (the evidence for one side of a
    dispute, drawn on the same screen through the same route). The store gate
    reads the same verdicts through `source_findings`, which tiers them."""
    root = pathlib.Path(root)
    return [f"{label}: source ref {src['ref']!r} names no file in this repo — a "
            f"ref is a path relative to data-repo (QF-5)"
            for src in _citations(entry)
            if isinstance(src, dict) and _citation_state(root, src.get("ref")) != "ok"]


def source_findings(root, entry, label):
    """C33 (spec §9 default). A citation outside the repo is REFUSED (R4). A
    citation to a file that is not there is dropped into `extra` with a NOTE
    while another citation remains, and REFUSED when none would (INV-3). An
    account whose evidence is missing is dropped the same way (C12)."""
    root = pathlib.Path(root)
    out = []
    sources = entry.get("source") if isinstance(entry.get("source"), list) else []
    states = [_citation_state(root, s.get("ref")) if isinstance(s, dict) else "ok"
              for s in sources]
    missing = [n for n, state in enumerate(states) if state == "missing"]
    for n, state in enumerate(states):
        if state == "outside" or (missing and len(missing) == len(sources)
                                  and state == "missing"):
            out.append(refuse(label, f"source ref {sources[n]['ref']!r} names no file "
                                     f"in this repo — a ref is a path relative to "
                                     f"data-repo (QF-5)"))
    if not out:
        for n in reversed(missing):
            ref = sources[n]["ref"]
            out += _sever(entry, ["source", n], label,
                          f"source ref {ref!r} names no file in this repo; dropped "
                          f"while another citation remains")[1]
    accounts = entry.get("accounts") if isinstance(entry.get("accounts"), list) else []
    for n in reversed(range(len(accounts))):
        src = accounts[n].get("source") if isinstance(accounts[n], dict) else None
        state = _citation_state(root, src.get("ref")) if isinstance(src, dict) else "ok"
        if state == "outside":
            out.append(refuse(label, f"accounts source ref {src['ref']!r} points "
                                     f"outside this repo (QF-5)"))
        elif state == "missing":
            out += _sever(entry, ["accounts", n], label,
                          f"the account's source ref {src['ref']!r} names no file")[1]
    return out


def _process_sources(root, entry):
    """`(where, process id, document or None)` for every `process` citation,
    `accounts[].source` walked beside `source[]`."""
    labelled = [(f"source[{n}]", src)
                for n, src in enumerate(entry.get("source") or [])]
    labelled += [(f"accounts[{n}].source", a.get("source"))
                 for n, a in enumerate(entry.get("accounts") or [])
                 if isinstance(a, dict)]
    for where, src in labelled:
        if not isinstance(src, dict) or src.get("type") != "process":
            continue
        ref = src.get("ref")
        if not isinstance(ref, str) or not ref:
            continue
        try:
            doc = read_json(pathlib.Path(root) / ref)
        except (OSError, ValueError):
            doc = None
        yield where, pathlib.PurePosixPath(ref).stem, doc


def process_source_problems(root, entry):
    """I3 at the source side, one unprefixed line per `process` citation whose
    file is tombstoned or gone — the unit gate's wording (`facts_plan.assemble`
    adds its own label). The store gate tiers the same two facts in
    `process_findings`."""
    return [f"{where}: process {pid} has no file" if doc is None
            else f"{where}: process {pid} is tombstoned"
            for where, pid, doc in _process_sources(root, entry)
            if doc is None or (isinstance(doc, dict) and doc.get("tombstoned"))]


def process_findings(root, entry, label):
    """C34: a cited process file that is gone is REFUSED (R4). C35: one that is
    tombstoned is kept with a NOTE naming its heir — it was true when made."""
    out = []
    for where, pid, doc in _process_sources(root, entry):
        if doc is None:
            out.append(refuse(label, f"{where}: process {pid} has no file"))
        elif isinstance(doc, dict) and doc.get("tombstoned"):
            heir = doc.get("superseded_by")
            fa = (f"فرایندی که این مورد به آن استناد می‌کند بازنشسته شده است؛ "
                  f"جایگزین آن: {heir}" if heir else None)
            out.append(note(label, f"{where}: process {pid} is tombstoned", fa=fa))
    return out


#: C20: the citation types a quote belongs on. The location keys each medium
#: reads are the schema's own (`recordData.allOf`, `_medium_location`).
QUOTABLE = frozenset({"voice", "comment", "sheet", "process", "docx", "pdf", "photo"})


def _medium_location(medium):
    """The `location` keys the schema lists for `medium` — every key the
    location object admits when the medium names no branch."""
    return _medium_locations(str(schema_dir()), medium)


@functools.lru_cache(maxsize=None)
def _medium_locations(where, medium):
    record = read_json(pathlib.Path(where) / "facts.schema.json")["$defs"]["recordData"]
    for branch in record.get("allOf") or []:
        if ((branch.get("if") or {}).get("properties") or {}).get(
                "medium", {}).get("const") == medium:
            return set(branch["then"]["properties"]["location"]["properties"])
    return set(record["properties"]["location"]["properties"])


def shape_findings(entry, label):
    """C20: a shape rule tying two members together is a NOTE — the panel
    reads each `location` key on its own, and no card reads `quote`."""
    out = []
    data = entry.get("data") or {}
    if entry.get("kind") == "record" and isinstance(data.get("location"), dict):
        foreign = sorted(set(data["location"]) - _medium_location(data.get("medium")))
        if foreign:
            out.append(note(label, f"location keys {foreign} do not belong to medium "
                                   f"{data.get('medium')!r}", path="data/location",
                            mark="inferred"))
    for n, src in enumerate(entry.get("source") or []):
        if isinstance(src, dict) and "quote" in src and src.get("type") not in QUOTABLE:
            out.append(note(label, f"source[{n}] of type {src.get('type')!r} carries "
                                   f"a quote", path=f"source/{n}", mark="inferred"))
    return out


def keyless_row_findings(entry, label):
    """C9: a record row with no key after `apply._derive_row_keys` (the table's
    key columns, then its title) is REFUSED — the ladder matches rows by key."""
    rows = (entry.get("data") or {}).get("rows") if entry.get("kind") == "record" else None
    return [refuse(label, f"data.rows[{n}] has no key, and neither the table's key "
                          f"columns nor its title give one (QF-32)")
            for n, row in enumerate(rows or [])
            if isinstance(row, dict) and not row.get("key")]


def preconditions(root, store, entries, run_dir):
    """Every finding about `entries` in their store, by tier. `entries` have
    passed `normalise_entry` and the per-entry schema check, carry canonical
    scopes and derived keys, and may be changed in place: a NOTE that severs
    (C25, C29, C31, C33) does it here."""
    root = pathlib.Path(root)
    out = []
    # QF-43: a run creates in its own department — or, now, anywhere it names
    # with a note (C26); it may still add to any entry it matches.
    run_dept = pathlib.Path(run_dir).parent.name
    by_temp = {e["id"]: e for e in entries if e.get("id")}
    unit_rows = _unit_row_keys(store, entries)
    held_by = {ident: e for e in store["record"]["entries"] if is_open(e)
               for ident in _sheet_identities(e)}
    departments, branches = registered_scope(root)
    for entry in entries:
        label = entry.get("id") or entry.get("key")
        out += keyless_row_findings(entry, label)                  # C9
        out += scope_findings(entry, departments, branches, label)  # C24, C25
        out += undeclared_unit_findings(entry, unit_rows, label)    # C28
        out += shape_findings(entry, label)                         # C20
        match = find_match(store, entry)
        if match is None:
            if not set(entry["scope"]["departments"]) <= {run_dept}:   # C26
                out.append(note(label, f"a new entry scoped to "
                                       f"{entry['scope']['departments']} from a "
                                       f"{run_dept} run"))
            twin = _title_twin(store, entry)                            # C27
            if twin is not None:
                issue = {"kind": "code_collision",
                         "description": "عنوان این مورد با موردی دیگر از همین نوع و "
                                        "دامنه یکی است.",
                         "affects": [{"ref": twin["id"]}]}
                if issue not in entry.setdefault("issues", []):
                    entry["issues"].append(issue)
                # the `code_collision` issue is the record; the note is the log
                out.append(note(label, f"title {entry.get('title')!r} is already "
                                       f"{twin['id']}'s in this kind and scope",
                                mark="none"))
        # C22's safety net: `repair_tab_holder` re-keys onto the holder, so an
        # entry reaching here under another key did not pass the repair.
        for ident in _sheet_identities(entry):
            other = held_by.get(ident)
            if other is None or _is_stub(other) or other is match:
                continue
            if _natural_key(other) != _natural_key(entry):
                out.append(refuse(label, f"tab {ident[0]}/{ident[1]} already belongs "
                                         f"to {other['id']} ({other['key']!r})"))
        out += reference_findings(store, by_temp, entry, label)     # C29–C31
        out += source_findings(root, entry, label)                  # C33
        out += process_findings(root, entry, label)                 # C34, C35
    # C36: the content pass, once over the whole delta (its checks are
    # document-wide), with the store for `calls[]` resolution and the run's
    # unit symbols for the Latin rule (QF-40). Its tiers are its own.
    out += coerce(check_document({"schema_version": 1, "entries": entries},
                                 "facts-delta", store, unit_symbols=unit_rows,
                                 conventions=load_conventions(root)))
    return out
