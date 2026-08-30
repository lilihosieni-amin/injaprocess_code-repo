"""Core helpers for the facts store. merge facts is the ONLY writer (QF-2)."""
import hashlib
import json
import pathlib

from engine_common import read_json, validate, write_json_atomic

KIND_FILES = {"item": "items.json", "record": "records.json",
              "measurement": "measurements.json", "rule": "rules.json",
              "note": "notes.json"}
KIND_ORDER = ["item", "record", "measurement", "rule", "note"]

def facts_dir(root):
    return pathlib.Path(root) / "facts"

def load_store(root):
    out = {}
    for kind, name in KIND_FILES.items():
        p = facts_dir(root) / name
        out[kind] = (read_json(p) if p.exists()
                     else {"schema_version": 1, "entries": []})
    return out

def canonical_scope(scope):
    scope = scope or {}
    return {"departments": sorted(set(scope.get("departments") or [])),
            "branches": sorted(set(scope.get("branches") or []))}

def is_open(entry):
    return not entry.get("retired", False) and entry.get("valid_to") is None

def _sheet_identity(entry):
    loc = (entry.get("data") or {}).get("location") or {}
    if entry.get("kind") == "record" and loc.get("spreadsheetId") and loc.get("sheet"):
        return (loc["spreadsheetId"], loc["sheet"])
    return None

def find_match(store, entry):
    """Sheet records match on (spreadsheetId, sheet) first (QF-15), then the
    natural key (kind, key, canonical scope) among open entries."""
    kind = entry["kind"]
    ident = _sheet_identity(entry)
    if ident:
        for e in store[kind]["entries"]:
            if is_open(e) and _sheet_identity(e) == ident:
                return e
    nk = (entry["key"], json.dumps(canonical_scope(entry.get("scope")), sort_keys=True))
    for e in store[kind]["entries"]:
        if is_open(e) and (e["key"], json.dumps(canonical_scope(e.get("scope")),
                                                sort_keys=True)) == nk:
            return e
    return None

def _walk(value, prefix, out):
    if value is None:
        out.append(prefix)
    elif isinstance(value, dict):
        for k, v in value.items():
            _walk(v, f"{prefix}/{k}", out)
    elif isinstance(value, list):
        for member in value:
            if isinstance(member, dict) and "key" in member:
                _walk({k: v for k, v in member.items() if k != "key"},
                      f"{prefix}/{member['key']}", out)

def null_paths(entry):
    """QF-6: a null leaf inside data is unknown; an absent key is not."""
    out = []
    _walk(entry.get("data") or {}, "data", out)
    return out

def derive_status(entry):
    if any(a.get("status") == "open" for a in entry.get("accounts") or []):
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
    return {"disputed": sum(1 for a in entry.get("accounts") or []
                            if a.get("status") == "open"),
            "unknown": len(null_paths(entry)),
            "informal": sum(1 for v in fs.values() if v == "informal"),
            "inferred": sum(1 for v in fs.values() if v == "inferred")}

def _step(value, seg):
    if isinstance(value, dict):
        return value[seg]
    if isinstance(value, list):
        for member in value:
            if isinstance(member, dict) and member.get("key") == seg:
                return member
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
    return {"schema_version": 1, "entries": rows}

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
    (QF-37's shape test), in document order."""
    if isinstance(obj, dict):
        if "ref" in obj and set(obj) <= {"ref", "field", "row"}:
            yield obj
        else:
            for v in obj.values():
                yield from iter_ref_objects(v)
    elif isinstance(obj, list):
        for member in obj:
            yield from iter_ref_objects(member)
