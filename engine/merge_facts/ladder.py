"""§11 write ladder — identical for every caller; there is no owner."""
import copy

from merge_facts import account_id

PROSE_LEAVES = frozenset({"statement", "grain", "method", "exceptions",
                          "reason", "why", "description"})
UNION_FIELDS = {"source": lambda s: (s.get("type"), s.get("ref"), s.get("sheet"),
                                     s.get("cell") or s.get("lines") or
                                     s.get("function") or s.get("node") or
                                     s.get("page")),
                "aliases": lambda a: a,
                "processes": lambda p: p.get("ref")}
DEDUP_KEYS = {"accounts": lambda m: (m.get("field"), m.get("statement"),
                                     m.get("value"),
                                     (m.get("source") or {}).get("ref"),
                                     (m.get("source") or {}).get("sheet"),
                                     (m.get("source") or {}).get("cell")
                                     or (m.get("source") or {}).get("lines")
                                     or (m.get("source") or {}).get("function")
                                     or (m.get("source") or {}).get("node")
                                     or (m.get("source") or {}).get("page")),
              "issues": lambda m: (m.get("kind"), m.get("field"), m.get("from_date")),
              "foreignKeys": lambda m: (tuple(m.get("fields") or []),
                                        (m.get("reference") or {}).get("ref")),
              "signatures": lambda m: m.get("role"),
              "edge_cases": lambda m: m.get("input"),
              "reconciled_against": lambda m: tuple(sorted((m.get("cell") or {}).items())),
              "tracked": lambda m: (m.get("record") or {}).get("ref"),
              "units": lambda m: m.get("pack_unit"),
              "calls": lambda m: m.get("ref")}
OBJECT_FIELDS = frozenset({"from", "via", "writes_to", "derived", "mirror_of",
                           "location", "pack", "movement", "range", "refItems",
                           "constraints", "identifier_scheme", "fix", "of",
                           "template_of", "supersedes", "superseded_by", "scope"})
IMMUTABLE = frozenset({"id", "kind", "key", "status", "updated_at",
                       "field_status", "valid_from", "valid_to", "retired"})
# Top-level fields the ladder never touches directly: identity/lifecycle
# (IMMUTABLE), set-union fields (handled separately, before this dispatch
# runs), and accounts (handled separately, after).
TOP_SKIP = IMMUTABLE | frozenset(UNION_FIELDS) | frozenset({"accounts"})


def keyfn_for(name):
    """The dedup key a member of collection `name` matches on (§11) — every
    keyed collection either has a dedicated matcher or is keyed by `key`."""
    return DEDUP_KEYS.get(name, lambda m: m.get("key"))


def _equal(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b


def _join(path, k):
    return k if not path else f"{path}/{k}"


def _is_keyed_list(v, name):
    """True when `v` is a list this ladder merges member-by-member: either a
    non-empty list of dict members with a natural key (a `key` field, or a
    dedicated DEDUP_KEYS matcher for the collection), or an empty list for a
    field that has a DEDUP_KEYS matcher (so shape can't be read off content)."""
    if not isinstance(v, list):
        return False
    if not v:
        return name in DEDUP_KEYS
    return isinstance(v[0], dict) and (name in DEDUP_KEYS or "key" in v[0])


def _dispute(existing_entry, path, incumbent_value, challenger, source, changes):
    accounts = existing_entry.setdefault("accounts", [])
    added = False

    def _add(statement, value, src):
        nonlocal added
        member = {"field": path, "statement": str(statement),
                  "value": value, "source": {k: v for k, v in src.items()
                                             if k not in ("hash", "run")},
                  "speaker_role": None, "status": "open"}
        member["id"] = account_id(path, member["statement"], value, member["source"])
        if not any(DEDUP_KEYS["accounts"](member) == DEDUP_KEYS["accounts"](a)
                   for a in accounts):
            accounts.append(member)
            added = True

    if not any(a.get("field") == path for a in accounts):
        incumbent_src = (existing_entry.get("source") or [{}])[0]
        _add(incumbent_value, incumbent_value, incumbent_src)   # materialise the incumbent
    _add(challenger, challenger, source)
    # A repeat of an already-recorded dispute adds nothing new — that's a
    # no-op re-read, not a fresh dispute.
    changes.append((path, "dispute" if added else "noop"))


def _merge_scalar(entry, holder, name, path, incoming_value, source, changes):
    current = holder.get(name)
    if name not in holder:
        holder[name] = incoming_value
        changes.append((path, "create"))
    elif current is None or current == "":
        holder[name] = incoming_value
        changes.append((path, "fill"))
    elif _equal(current, incoming_value):
        changes.append((path, "noop"))
    else:
        _dispute(entry, path, current, incoming_value, source, changes)


def _merge_collection(entry, current, incoming, name, path, source, changes):
    keyfn = keyfn_for(name)
    for member in incoming:
        match = next((m for m in current if keyfn(m) == keyfn(member)), None)
        if match is None:
            current.append(member)
            # QF-7 paths address keyed arrays only — a member with a natural
            # `key` gets one; anything else (e.g. an `accounts` entry) is
            # named by its collection alone, the action already says append.
            append_path = f"{path}/{member['key']}" if "key" in member else path
            changes.append((append_path, "append"))
        else:
            _merge_member(entry, match, member,
                          f"{path}/{member.get('key', keyfn(member))}", source, changes)


def _merge_member(entry, current, incoming, path, source, changes, skip=frozenset({"key"})):
    """Dispatch every leaf of `incoming` against `current` per §11: a prose
    leaf (by name, at any depth) fills once and is never disputed or
    rewritten; a keyed list merges member-by-member; a dict-shaped field
    (declared in OBJECT_FIELDS, or already a dict on `current`) recurses
    leaf-by-leaf through this same dispatch; everything else is a scalar
    (create/fill/noop/dispute). Used both for members of a keyed collection
    (default `skip`) and, from `merge_entry`, for a whole entry's top-level
    fields (`skip=TOP_SKIP`) — there is no separate "object merge": an
    object field is just a member with no `key` to skip."""
    for k, v in incoming.items():
        if k in skip:
            continue
        p = _join(path, k)
        if k in PROSE_LEAVES:
            if k not in current or current.get(k) in (None, ""):
                current[k] = v
                changes.append((p, "fill"))
            continue                                   # never disputed, never rewritten
        if _is_keyed_list(v, k):
            current.setdefault(k, [])
            _merge_collection(entry, current[k], v, k, p, source, changes)
        elif isinstance(v, dict) and (k in OBJECT_FIELDS or isinstance(current.get(k), dict)):
            current.setdefault(k, {})
            _merge_member(entry, current[k], v, p, source, changes)
        else:
            _merge_scalar(entry, current, k, p, v, source, changes)


def merge_entry(existing, incoming, incoming_source):
    """Apply §11 to one matched pair. Mutates `existing`; returns [(path, action)]."""
    changes = []
    for name, keyfn in UNION_FIELDS.items():
        incoming_members = incoming.get(name) or []
        if not incoming_members:
            continue                # nothing offered — don't manufacture the key
        current = existing.setdefault(name, [])
        seen = {keyfn(m) for m in current}
        for member in incoming_members:
            if keyfn(member) not in seen:
                current.append(member)
                seen.add(keyfn(member))
                changes.append((name, "union"))
    # Every other top-level field goes through the same leaf dispatch a
    # keyed-collection member gets — prose / keyed-list / object / scalar —
    # so e.g. `scope` disputes leaf-by-leaf (scope/branches) rather than as
    # a whole-dict blob.
    _merge_member(existing, existing, incoming, "", incoming_source, changes, skip=TOP_SKIP)
    # incoming accounts (the agent may state competing readings itself)
    if incoming.get("accounts"):
        _merge_collection(existing, existing.setdefault("accounts", []),
                          incoming["accounts"], "accounts", "accounts",
                          incoming_source, changes)
    return changes


def would_dispute(existing, incoming, incoming_source):
    """Would applying `incoming` raise a dispute? — the question `apply` has to
    ask before it merges, so a differing value carrying a later `valid_from`
    can supersede instead of disputing (§11).

    Answered by running this same ladder on deep copies and looking for a
    `dispute` action, never by a second traversal of its own: a private copy of
    "which leaves disagree" drifts from the one that writes, and those two
    disagreeing is exactly how a filled value would come to be overwritten.
    """
    return any(action == "dispute" for _, action in
               merge_entry(copy.deepcopy(existing), copy.deepcopy(incoming),
                           incoming_source))
