"""§11 write ladder — identical for every caller; there is no owner."""
from merge_facts import account_id

PROSE_LEAVES = frozenset({"statement", "grain", "method", "exceptions",
                          "reason", "why", "description"})
UNION_FIELDS = {"source": lambda s: (s.get("type"), s.get("ref"),
                                     s.get("cell") or s.get("lines") or
                                     s.get("function") or s.get("node") or
                                     s.get("page")),
                "aliases": lambda a: a,
                "processes": lambda p: p.get("ref")}
DEDUP_KEYS = {"accounts": lambda m: (m.get("field"), m.get("statement"),
                                     m.get("value"),
                                     (m.get("source") or {}).get("ref"),
                                     (m.get("source") or {}).get("cell")
                                     or (m.get("source") or {}).get("lines")),
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


def _equal(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b


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

    def _add(statement, value, src):
        member = {"field": path, "statement": str(statement),
                  "value": value, "source": {k: v for k, v in src.items()
                                             if k not in ("hash", "run")},
                  "speaker_role": None, "status": "open"}
        member["id"] = account_id(path, member["statement"], value, member["source"])
        if not any(DEDUP_KEYS["accounts"](member) == DEDUP_KEYS["accounts"](a)
                   for a in accounts):
            accounts.append(member)

    if not any(a.get("field") == path for a in accounts):
        incumbent_src = (existing_entry.get("source") or [{}])[0]
        _add(incumbent_value, incumbent_value, incumbent_src)   # materialise the incumbent
    _add(challenger, challenger, source)
    changes.append((path, "dispute"))


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


def _merge_object(entry, current, incoming, path, source, changes):
    for k, v in incoming.items():
        if isinstance(v, dict) and isinstance(current.get(k), dict):
            _merge_object(entry, current[k], v, f"{path}/{k}", source, changes)
        else:
            _merge_scalar(entry, current, k, f"{path}/{k}", v, source, changes)


def _merge_collection(entry, current, incoming, name, path, source, changes):
    keyfn = DEDUP_KEYS.get(name, lambda m: m.get("key"))
    for member in incoming:
        match = next((m for m in current if keyfn(m) == keyfn(member)), None)
        if match is None:
            current.append(member)
            changes.append((f"{path}/{keyfn(member)}", "append"))
        else:
            _merge_member(entry, match, member, f"{path}/{member.get('key', keyfn(member))}",
                          source, changes)


def _merge_member(entry, current, incoming, path, source, changes):
    for k, v in incoming.items():
        if k == "key":
            continue
        if k in PROSE_LEAVES:
            if k not in current or current.get(k) in (None, ""):
                current[k] = v
                changes.append((f"{path}/{k}", "fill"))
            continue                                   # never disputed, never rewritten
        if _is_keyed_list(v, k):
            current.setdefault(k, [])
            _merge_collection(entry, current[k], v, k, f"{path}/{k}", source, changes)
        elif isinstance(v, dict) and (k in OBJECT_FIELDS or isinstance(current.get(k), dict)):
            current.setdefault(k, {})
            _merge_object(entry, current[k], v, f"{path}/{k}", source, changes)
        else:
            _merge_scalar(entry, current, k, f"{path}/{k}", v, source, changes)


def merge_entry(existing, incoming, incoming_source):
    """Apply §11 to one matched pair. Mutates `existing`; returns [(path, action)]."""
    changes = []
    for name, keyfn in UNION_FIELDS.items():
        current = existing.setdefault(name, [])
        seen = {keyfn(m) for m in current}
        for member in incoming.get(name) or []:
            if keyfn(member) not in seen:
                current.append(member)
                seen.add(keyfn(member))
                changes.append((name, "union"))
    for k, v in incoming.items():
        if k in IMMUTABLE or k in UNION_FIELDS or k == "accounts":
            continue
        if k == "data":
            _merge_member(existing, existing.setdefault("data", {}), v, "data",
                          incoming_source, changes)
        elif k in PROSE_LEAVES:
            if existing.get(k) in (None, ""):
                existing[k] = v
                changes.append((k, "fill"))
        else:
            _merge_scalar(existing, existing, k, k, v, incoming_source, changes)
    # incoming accounts (the agent may state competing readings itself)
    if incoming.get("accounts"):
        _merge_collection(existing, existing.setdefault("accounts", []),
                          incoming["accounts"], "accounts", "accounts",
                          incoming_source, changes)
    return changes
