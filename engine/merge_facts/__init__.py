"""Core helpers for the facts store. merge facts is the ONLY writer (QF-2)."""
import hashlib
import json
import pathlib
import re

from engine_common import read_json, validate, write_json_atomic

KIND_FILES = {"item": "items.json", "record": "records.json",
              "measurement": "measurements.json", "rule": "rules.json",
              "note": "notes.json"}
KIND_ORDER = ["item", "record", "measurement", "rule", "note"]

# QF-32's key grammars — shared by `apply` (preconditions, key derivation) and
# `content` (Task 9's content pass), hoisted here (Task 9 review, F3) so
# neither redefines them.
SEGMENT_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$")
PROC_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")

# QF-45: the store's version marker. Bumped to 2 with the v3 payload contract
# (design §3.3); `save_store` validates against `facts.schema.json`, which pins
# the same number, so the two can never drift apart silently.
STORE_SCHEMA_VERSION = 2

def facts_dir(root):
    return pathlib.Path(root) / "facts"

def load_store(root):
    out = {}
    for kind, name in KIND_FILES.items():
        p = facts_dir(root) / name
        out[kind] = (read_json(p) if p.exists()
                     else {"schema_version": STORE_SCHEMA_VERSION, "entries": []})
    return out

def canonical_scope(scope):
    scope = scope or {}
    return {"departments": sorted(set(scope.get("departments") or [])),
            "branches": sorted(set(scope.get("branches") or []))}

def is_open(entry):
    """Open = not retired, not closed by a `valid_to`, and not superseded.

    `superseded_by` is read here (§4) because a supersession that carried no
    `valid_from` used to leave `valid_to` null: the predecessor stayed open,
    `find_match` kept matching it, and one key had two live eras.
    """
    return (not entry.get("retired", False) and entry.get("valid_to") is None
            and not entry.get("superseded_by"))

def _sheet_identities(entry):
    """Every (spreadsheetId, sheet) this record occupies — one per `instances[]`
    member (QF-47: one template, one entry, however many tabs it repeats on),
    plus `location` for a record that has no instances (a paper log, a stub, or
    an entry written before v3).

    Deduped, order kept: a v3 record's `location` is derived from one of its own
    `instances[]` and so names a tab the list already holds — and an entry can
    never collide with itself, so the callers that ask "who else claims this
    tab" (`preconditions`) must not be handed the same tab twice."""
    if entry.get("kind") != "record":
        return []
    data = entry.get("data") or {}
    out = []
    for instance in data.get("instances") or []:
        if isinstance(instance, dict) and instance.get("spreadsheetId") \
                and instance.get("sheet"):
            out.append((instance["spreadsheetId"], instance["sheet"]))
    location = data.get("location") or {}
    if location.get("spreadsheetId") and location.get("sheet"):
        out.append((location["spreadsheetId"], location["sheet"]))
    return list(dict.fromkeys(out))

def _nk(entry):
    return (entry["key"], json.dumps(canonical_scope(entry.get("scope")),
                                     sort_keys=True))

def find_match(store, entry):
    """Sheet records match on ANY instance identity first (QF-47), then the
    natural key (kind, key, canonical scope) among open entries.

    §3.2: an instance match whose natural key disagrees is **not** a match —
    `apply` never renames, and `digest` has already reported the pair to the
    reviewer as `template_split`. `apply`'s own precondition then refuses the
    delta rather than minting a second record on one tab. The one exception is
    a stub (QF-20): it is identity and nothing else, and the owning run fills
    it whatever key it carries.
    """
    kind = entry["kind"]
    idents = set(_sheet_identities(entry))
    nk = _nk(entry)
    if idents:
        for e in store[kind]["entries"]:
            if is_open(e) and idents & set(_sheet_identities(e)):
                return e if (_nk(e) == nk or (e.get("data") or {}).get("stub")) \
                    else None
    for e in store[kind]["entries"]:
        if is_open(e) and _nk(e) == nk:
            return e
    return None

def _walk(value, prefix, out, retired):
    if value is None:
        out.append(prefix)
    elif isinstance(value, dict):
        for k, v in value.items():
            _walk(v, f"{prefix}/{k}", out, retired)
    elif isinstance(value, list):
        for member in value:
            if isinstance(member, dict) and "key" in member:
                path = f"{prefix}/{member['key']}"
                if member.get("retired"):
                    # §9: a retired row is withdrawn, not removed. Its subtree
                    # is not walked — the whole path is collected instead, so
                    # the accounts filter below can see it.
                    retired.append(path)
                    continue
                _walk({k: v for k, v in member.items() if k != "key"},
                      path, out, retired)

def _red(entry):
    """`(null paths, retired member prefixes)` — one walk, both answers.

    §9: "Retired rows are omitted by `export`, excluded from the red rollup and
    QF-44's readiness test, and their `null` cells and open accounts leave the
    red set." Both halves of that need the same walk, so it runs once and the
    two callers below take a half each. Retirement is read off the member
    itself (`retired: true`), the same marker `export` and `_unit_row_keys`
    read, and it is not restricted to `rows[]`: any keyed member that carries
    the marker is withdrawn with it.
    """
    nulls, retired = [], []
    _walk(entry.get("data") or {}, "data", nulls, retired)
    return nulls, retired

def null_paths(entry):
    """QF-6: a null leaf inside data is unknown; an absent key is not.

    Counts addressable null leaves per the QF-7 path grammar (dict fields and
    keyed-array members only). A null inside a non-keyed array member has no
    addressable path — it cannot be disputed, resolved, or named in
    field_status — and is deliberately not counted here. Nor is one inside a
    RETIRED member (§9): a withdrawn row's blank cell is not a question anyone
    is still owed an answer to, and counting it left a record with retired rows
    permanently `unknown`. (That used to end "never green, so QF-44's readiness
    never arrives"; since the owner's 2026-09-06 ruling readiness asks only for
    the confirmation, so the stake is now the entry's own colour rather than the
    scope's handover — the exclusion is right either way, and for the first
    reason, not the second.)
    """
    return _red(entry)[0]

def open_accounts(entry):
    """Every open account — minus the ones a retired row took with it (§9).

    The mirror of `null_paths`' own exclusion, and for the same reason: a
    dispute about a cell of a withdrawn row is a dispute about a definition
    nobody reads any more. `facts_store.red_paths` filters the same set on the
    ui-backend side, and the two are pinned against each other.
    """
    _, retired = _red(entry)
    return [a for a in entry.get("accounts") or []
            if isinstance(a, dict) and a.get("status") == "open"
            and not _withdrawn(a.get("field"), retired)]

def _withdrawn(field, retired):
    """Does this QF-7 path name, or sit inside, a retired member?"""
    return isinstance(field, str) and any(
        field == prefix or field.startswith(prefix + "/") for prefix in retired)

def collect_leaves(data, want, skip=frozenset()):
    """Every string leaf named `want` anywhere under `data`, in document order,
    skipping the subtrees whose key is in `skip`.

    Two callers, one walk: `apply`'s unit precondition (`unit`, skipping the
    pack levels §10 excludes) and the audit's `unit_raw` and role checks.
    """
    out = []

    def walk(value, name):
        if name in skip:
            return
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, k)
        elif isinstance(value, list):
            for member in value:
                walk(member, name)
        elif name == want and isinstance(value, str):
            out.append(value)

    for k, v in (data or {}).items():
        walk(v, k)
    return out

def derive_status(entry):
    if open_accounts(entry):
        return "disputed"
    if null_paths(entry):
        return "unknown"
    values = set((entry.get("field_status") or {}).values())
    if "informal" in values:
        return "informal"
    if "inferred" in values:
        return "inferred"
    return "confirmed"

def field_status_counts(entry):
    fs = entry.get("field_status") or {}
    return {"disputed": len(open_accounts(entry)),
            "unknown": len(null_paths(entry)),
            "informal": sum(1 for v in fs.values() if v == "informal"),
            "inferred": sum(1 for v in fs.values() if v == "inferred")}

def _step(value, seg):
    if isinstance(value, dict):
        return value[seg]
    if isinstance(value, list):
        return value[_member_index(value, seg)]
    raise KeyError(seg)

def _member_index(members, seg):
    """Where the member `seg` names sits — by its `key`; for `accounts[]` by
    its `id`; and for a list whose members carry neither (`source[]`) by its
    position, `source/0` (v3.7 §2.2, owner ruling 2026-09-09: a citation is
    editable like any other member)."""
    for i, member in enumerate(members):
        if isinstance(member, dict) and seg in (member.get("key"), member.get("id")):
            return i
    if seg.isdigit() and int(seg) < len(members):
        return int(seg)
    raise KeyError(seg)

def get_path(entry, path):
    value = entry
    for seg in path.split("/"):
        value = _step(value, seg)
    return value

def path_exists(entry, path):
    try:
        get_path(entry, path)
        return True
    except (KeyError, TypeError):
        return False

def _parent(entry, path):
    """The container the last segment of `path` names, and that segment."""
    segs = path.split("/")
    node = entry
    for seg in segs[:-1]:
        node = _step(node, seg)
    return node, segs[-1]

def set_path(entry, path, value):
    """Write `value` at the QF-7 path `path` — the mirror of `get_path`. The
    walk to the parent container is identical (`_step`, segment by segment);
    only the last segment differs, an assignment instead of a read. A missing
    field on a dict parent is created; a missing list member is a KeyError —
    there is nothing to name it by."""
    node, last = _parent(entry, path)
    if isinstance(node, dict):
        node[last] = value
    elif isinstance(node, list):
        node[_member_index(node, last)] = value
    else:
        raise TypeError(f"{path!r} is not addressable")

def remove_path(entry, path):
    """Delete the list member the last segment names (v3.7 §2.2 `remove`)."""
    node, last = _parent(entry, path)
    if not isinstance(node, list):
        raise TypeError(f"{path!r} is not a list member")
    del node[_member_index(node, last)]

def unset_path(entry, path):
    """Delete the dict field the last segment names (v3.7 §2.2 `unset`)."""
    node, last = _parent(entry, path)
    if not isinstance(node, dict):
        raise TypeError(f"{path!r} is not a field")
    del node[last]

def append_path(entry, path, value):
    """Append `value` to the list at `path`, creating it on an existing dict
    parent (v3.7 §2.2 `append`)."""
    node, last = _parent(entry, path)
    if not isinstance(node, dict):
        raise TypeError(f"{path!r} is not a field")
    members = node.setdefault(last, [])
    if not isinstance(members, list):
        raise TypeError(f"{path!r} is not a list")
    members.append(value)

def account_id(field, statement, value, source):
    locator = source.get("cell") or source.get("lines") or source.get("function") \
        or source.get("node") or (str(source.get("page")) if source.get("page") else "")
    blob = f"{field}|{statement}|{'' if value is None else value}|{source.get('ref') or ''}|{locator}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:8]

def build_index(store):
    rows = []
    for kind in KIND_ORDER:
        for e in store[kind]["entries"]:
            rows.append({"id": e["id"], "kind": kind, "key": e["key"],
                         "title": e["title"], "aliases": e.get("aliases") or [],
                         "scope": canonical_scope(e.get("scope")),
                         "status": e["status"],
                         "field_status_counts": field_status_counts(e),
                         "processes": [p["ref"] for p in e.get("processes") or []],
                         "retired": e.get("retired", False),
                         "valid_to": e.get("valid_to"),
                         "stub": bool((e.get("data") or {}).get("stub")),
                         "updated_at": e["updated_at"]})
    return {"schema_version": STORE_SCHEMA_VERSION, "entries": rows}

def save_store(root, store):
    for kind, name in KIND_FILES.items():
        validate("facts.schema.json", store[kind])
    for kind, name in KIND_FILES.items():
        write_json_atomic(facts_dir(root) / name, store[kind])
    write_json_atomic(facts_dir(root) / ".index.json", build_index(store))

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return "sha256:" + h.hexdigest()

def iter_ref_objects(obj):
    """Every nested dict whose keys are a subset of {ref, field, row} with ref
    (QF-37's shape test), in document order.

    Yields EVERY ref-shaped object, including processes[] and supersession
    links (supersedes/superseded_by) — these share the same {ref, field, row}
    shape but a different id namespace (process refs vs. F-/T- refs, per
    QF-37's ^(F-[0-9]{5}|T-[0-9]+)$ pattern). Callers must filter by id prefix
    or scope the call to entry['data'] if they only want fact/transcript refs.
    """
    if isinstance(obj, dict):
        if "ref" in obj and set(obj) <= {"ref", "field", "row"}:
            yield obj
        else:
            for v in obj.values():
                yield from iter_ref_objects(v)
    elif isinstance(obj, list):
        for member in obj:
            yield from iter_ref_objects(member)
