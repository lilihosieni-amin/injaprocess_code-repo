"""`merge facts apply` — the one writing entry point of the facts store (QF-2).

Spec §12, row 1. The precondition pass runs over the **whole** delta before the
first byte is written: every problem is printed as `precondition failed: {msg}`
and the run exits 2 with the store untouched, so a pipeline that retries on
exit 2 cannot double-apply.

Idempotency (§17): `updated_at` is stamped only on the entries the run actually
changed — any ladder action other than `noop`, a creation, or a supersession.
Re-reading the same material yields nothing but `noop` actions, so applying one
delta twice leaves the five files byte-identical.

`revert` (§12) restores from `{run_dir}/facts-before/`, the snapshot of the five
files this verb takes before it writes; the run directory is the provenance
(QF-7) and also keeps `facts-delta.json` and `id-map.json`.

ponytail: five shared files, one writer, no lock. If concurrency ever becomes
real, shard by a hash of the key (`facts/{kind}/{NN}.json`) so one key always
lands in one file — never by department, which would reinstate the silent
contradiction QF-2 exists to prevent.
"""
import copy
import pathlib
import re
import shutil
import sys
from datetime import datetime, timezone

from allocate_id import next_fact_id
from engine_common import read_json, validate, write_json_atomic, write_text_atomic
from merge_facts import (KIND_FILES, KIND_ORDER, canonical_scope, derive_status,
                         facts_dir, find_match, is_open, iter_ref_objects,
                         load_store, save_store, sha256_file)
# `_equal` and `_is_keyed_list` are the ladder's own definitions of "the same
# value" and "a list merged member by member". Supersession has to ask the
# ladder's question one step early ("would this dispute?"), and a successor's
# copy has to walk the same shapes, so they are borrowed rather than restated.
from merge_facts.ladder import (DEDUP_KEYS, PROSE_LEAVES, TOP_SKIP, UNION_FIELDS,
                                _equal, _is_keyed_list, merge_entry)

SEGMENT_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$")
FACT_ID_RE = re.compile(r"^F-[0-9]{5}$")
TEMP_ID_RE = re.compile(r"^T-[0-9]+$")
PROC_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")
UNITS_KEY = "units"
UNKNOWN_UNIT = "—"
SUCCESSION_SKIP = TOP_SKIP | frozenset({"supersedes", "superseded_by"})


def apply(root, delta_path, run_dir):
    """Apply one delta to the store. Returns `{created, updated, id_map}`."""
    root, delta_path, run_dir = (pathlib.Path(root), pathlib.Path(delta_path),
                                 pathlib.Path(run_dir))
    delta = read_json(delta_path)
    validate("facts-delta.schema.json", delta)                       # 1
    # The ladder installs incoming subtrees by reference; every entry is copied
    # first so the delta file the run keeps stays exactly what its author wrote.
    entries = [copy.deepcopy(e) for e in delta.get("entries") or []]
    for e in entries:
        e["scope"] = canonical_scope(e.get("scope"))
    store = load_store(root)
    # The keys merge owns (9's step 5) are derived before the match, not after
    # it: a measurement matched on its delta's advisory key would miss its own
    # entry on the next run and mint a duplicate.
    _derive_keys(store, entries)
    problems = _preconditions(root, store, entries)                  # 2
    if problems:
        for msg in problems:
            print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)
    plans, id_map, resolution = _plan(root, store, entries)          # 3
    _rewrite_refs(entries, resolution)                               # 4
    touched = _upsert(store, plans)                                  # 6
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = _finalise(root, store, run_dir, delta_path, id_map, touched, now)
    report["id_map"] = id_map
    return report


# --------------------------------------------------------------------------- #
# 5. the keys merge derives
# --------------------------------------------------------------------------- #

def _lookup(store, by_temp, ref_id):
    """The entry a `{ref}` names — this delta's, or the store's."""
    if ref_id in by_temp:
        return by_temp[ref_id]
    for kind in KIND_ORDER:
        for e in store[kind]["entries"]:
            if e["id"] == ref_id:
                return e
    return None


def _derive_keys(store, entries):
    """QF-32: the two keys `merge` owns, not the agent — a measurement's, and a
    record's row keys. A row key that fails the condition (a paper log's
    `["date", "item"]`) is minted by the agent and kept as written."""
    by_temp = {e["id"]: e for e in entries if e.get("id")}
    for e in entries:
        data = e.get("data") or {}
        if e["kind"] == "record":
            # A refItems cell holds the target item's *key*, not a `{ref}`
            # (QF-37's one exception) — substituted before the row keys are
            # joined, because a primaryKey member may be such a column.
            _substitute_ref_items(store, by_temp, data)
            _derive_row_keys(data)
        elif e["kind"] == "measurement":
            derived = _measurement_key(store, by_temp, data)
            if derived:
                e["key"] = derived


def _substitute_ref_items(store, by_temp, data):
    rows = data.get("rows")
    if not isinstance(rows, list):
        return
    for field in data.get("fields") or []:
        if not (isinstance(field, dict) and field.get("refItems")):
            continue
        name = field.get("key")
        for row in rows:
            cell = row.get(name) if isinstance(row, dict) else None
            if isinstance(cell, str) and (TEMP_ID_RE.fullmatch(cell)
                                          or FACT_ID_RE.fullmatch(cell)):
                target = _lookup(store, by_temp, cell)
                if target is not None:
                    row[name] = target["key"]


def _derive_row_keys(data):
    pk, rows = data.get("primaryKey"), data.get("rows")
    if not (isinstance(pk, list) and pk and isinstance(rows, list)):
        return
    declared = {f.get("key") for f in data.get("fields") or [] if isinstance(f, dict)}
    if not all(m in declared for m in pk):
        return
    for row in rows:
        if not isinstance(row, dict):
            continue
        values = [row.get(m) for m in pk]
        if all(isinstance(v, str) and SEGMENT_RE.fullmatch(v) for v in values):
            row["key"] = "__".join(values)


def _measurement_key(store, by_temp, data):
    of, writes_to = data.get("of"), data.get("writes_to")
    if not (isinstance(of, dict) and isinstance(writes_to, dict)
            and writes_to.get("field")):
        return None
    item = _lookup(store, by_temp, of.get("ref"))
    record = _lookup(store, by_temp, writes_to.get("ref"))
    if item is None or record is None:
        return None
    return f"{item['key']}__{record['key']}__{writes_to['field']}"


# --------------------------------------------------------------------------- #
# 2. preconditions — all of them before the first write
# --------------------------------------------------------------------------- #

def _registered(path, plural):
    try:
        doc = read_json(path)
    except (OSError, ValueError):
        return set()
    return {row.get("code") for row in doc.get(plural) or [] if isinstance(row, dict)}


def _is_stub(entry):
    return bool((entry.get("data") or {}).get("stub"))


def _collect_units(value, name, out, skip):
    if name in skip:
        return
    if isinstance(value, dict):
        for k, v in value.items():
            _collect_units(v, k, out, skip)
    elif isinstance(value, list):
        for member in value:
            _collect_units(member, name, out, skip)
    elif name == "unit" and isinstance(value, str):
        out.append(value)


def _unit_symbols(entry):
    """Every symbol this entry cites as a unit (QF-40).

    `pack` and `units[]` hold pack sizes, which the unit check does not walk,
    and an `item`'s own `data.unit` is a default rather than an authoritative
    citation — `record.fields[].unit` is the authoritative one.
    """
    out, skip = [], frozenset({"pack", "units"})
    for k, v in (entry.get("data") or {}).items():
        if k == "unit" and entry.get("kind") == "item":
            continue
        _collect_units(v, k, out, skip)
    return [s for s in out if s and s != UNKNOWN_UNIT]


def _unit_row_keys(store, entries):
    """The open row keys of the `units` record — the store's, plus this delta's
    (the delta that creates or extends the table declares its own symbols)."""
    keys = set()
    for record in list(store["record"]["entries"]) + list(entries):
        if record.get("kind") != "record" or record.get("key") != UNITS_KEY:
            continue
        for row in (record.get("data") or {}).get("rows") or []:
            if isinstance(row, dict) and row.get("key") and is_open(row):
                keys.add(row["key"])
    return keys


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


def _reference_problems(store, by_temp, entry, label):
    """QF-37: every `{ref}` resolves, and every `field`/`row` it names is
    declared by its target — unless the target is a stub, in which case the
    edge is deferred and becomes checkable when the stub is filled (QF-20)."""
    out = []
    for obj in iter_ref_objects(entry):
        ref = obj.get("ref")
        if not isinstance(ref, str):
            continue
        if not (FACT_ID_RE.fullmatch(ref) or TEMP_ID_RE.fullmatch(ref)):
            if not PROC_ID_RE.fullmatch(ref):     # a process link (QF-8) is fine
                out.append(f"{label}: reference {ref!r} matches no id grammar")
            continue
        target = _lookup(store, by_temp, ref)
        if target is None:
            out.append(f"{label}: reference {ref!r} names no entry in the store "
                       f"or in this delta")
            continue
        if _is_stub(target):
            continue                              # a deferred edge
        field, row = obj.get("field"), obj.get("row")
        if field and field not in _declared_fields(target):
            out.append(f"{label}: {ref} declares no field {field!r}")
        if row and row not in _declared_rows(target):
            out.append(f"{label}: {ref} declares no row {row!r}")
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


def _preconditions(root, store, entries):
    """Human-readable messages, empty when the delta may be written.

    `status`, `source[].hash` and `data.original_ref` need no check here: the
    delta schema has no place for any of them.
    """
    out = []
    by_temp = {e["id"]: e for e in entries if e.get("id")}
    unit_rows = _unit_row_keys(store, entries)
    departments = _registered(root / "departments" / "registry.json", "departments")
    branches = _registered(root / "attachments" / "sheets" / "manifest.json",
                           "branches")
    for entry in entries:
        label = entry.get("id") or entry.get("key")
        if not KEY_RE.fullmatch(entry.get("key") or ""):
            out.append(f"{label}: key {entry.get('key')!r} is not a minted key")
        for dept in entry["scope"]["departments"]:                   # QF-33
            if dept not in departments:
                out.append(f"{label}: department {dept!r} is not in "
                           f"departments/registry.json")
        for branch in entry["scope"]["branches"]:
            if branch not in branches:
                out.append(f"{label}: branch {branch!r} is not in "
                           f"attachments/sheets/manifest.json")
        for symbol in _unit_symbols(entry):                          # QF-40
            if symbol not in unit_rows:
                out.append(f"{label}: unit {symbol!r} is declared by no row of "
                           f"the units record")
        match = find_match(store, entry)
        if match is None:
            if entry["kind"] != "note":                              # QF-34
                twin = _title_twin(store, entry)
                if twin is not None:
                    out.append(f"{label}: title {entry.get('title')!r} is already "
                               f"{twin['id']}'s in this kind and scope")
        elif match["key"] != entry["key"] and not _is_stub(match):
            out.append(f"{label}: keys are immutable — {match['id']} is keyed "
                       f"{match['key']!r}, this delta carries {entry['key']!r}")
        out.extend(_reference_problems(store, by_temp, entry, label))
        # ponytail: content pass wired in Task 9 — merge_facts.content
        # .check_document(entry, "facts-delta.schema.json") lands here, its
        # messages appended to `out` like any other precondition.
    return out


# --------------------------------------------------------------------------- #
# 3. upsert — an id on a miss only, in KIND_ORDER so a hit is found before a
#    miss mints
# --------------------------------------------------------------------------- #

def _leaf_differs(current, incoming, skip):
    """True when some non-prose scalar leaf of `incoming` disagrees with what
    `current` already holds — the ladder's dispute trigger, asked one step
    early so `apply` can supersede instead (§11)."""
    if not isinstance(current, dict):
        return False
    for k, v in incoming.items():
        if k in skip or k in PROSE_LEAVES or k not in current:
            continue
        held = current[k]
        if held is None or held == "":
            continue                                 # a fill, not a disagreement
        if _is_keyed_list(v, k) and isinstance(held, list):
            keyfn = DEDUP_KEYS.get(k, lambda m: m.get("key"))
            for member in v:
                twin = next((m for m in held if keyfn(m) == keyfn(member)), None)
                if twin is not None and _leaf_differs(twin, member, {"key"}):
                    return True
        elif isinstance(v, dict) and isinstance(held, dict):
            if _leaf_differs(held, v, frozenset()):
                return True
        elif not _equal(held, v):
            return True
    return False


def _is_supersession(match, incoming):
    """§11: a differing value that carries a **later** `valid_from` is a
    successor, not a dispute. Jalali is fixed-width (QF-41), so the dates
    compare as strings; an incumbent with no `valid_from` counts as earlier."""
    valid_from = incoming.get("valid_from")
    if not valid_from:
        return False
    held = match.get("valid_from")
    if held is not None and str(valid_from) <= str(held):
        return False
    return _leaf_differs(match, incoming, TOP_SKIP)


def _plan(root, store, entries):
    """Decide each entry's target id before anything is merged. `id_map` holds
    only the ids this run mints — it is what `revert` reads to know what the run
    created; `resolution` additionally maps a temp id onto the entry it hit, so
    the second pass can rewrite refs to it."""
    plans, id_map, resolution = [], {}, {}
    for entry in sorted(entries, key=lambda e: KIND_ORDER.index(e["kind"])):
        match = find_match(store, entry)
        if match is not None and _is_supersession(match, entry):
            action, fid = "supersede", next_fact_id(root)
        elif match is not None:
            action, fid = "merge", match["id"]
        else:
            action, fid = "create", next_fact_id(root)
        plans.append((action, match, entry, fid))
        if entry.get("id"):
            resolution[entry["id"]] = fid
            if action != "merge":
                id_map[entry["id"]] = fid
    return plans, id_map, resolution


def _rewrite_refs(entries, resolution):
    """Second pass: every `{ref}` holding a temp id becomes the real one. The
    `refItems` cells were substituted in `_derive_keys`, where the row keys that
    may be joined out of them are derived."""
    for entry in entries:
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if isinstance(ref, str) and ref in resolution:
                obj["ref"] = resolution[ref]


def _new_entry(incoming, fid):
    entry = copy.deepcopy(incoming)
    entry["id"] = fid
    entry.setdefault("valid_from", None)
    entry.setdefault("valid_to", None)
    entry.setdefault("retired", False)
    entry["status"] = "unknown"          # re-derived in `_finalise`, always
    entry["updated_at"] = None
    return entry


def _overwrite(dst, src, skip):
    """Install `src`'s leaves on `dst`, replacing what is there. Used only on a
    successor's private copy of its predecessor: the incoming values are the
    later truth, so there is nothing to dispute."""
    for k, v in src.items():
        if k in skip:
            continue
        held = dst.get(k)
        if _is_keyed_list(v, k) and isinstance(held, list):
            keyfn = DEDUP_KEYS.get(k, lambda m: m.get("key"))
            for member in v:
                twin = next((m for m in held if keyfn(m) == keyfn(member)), None)
                if twin is None:
                    held.append(copy.deepcopy(member))
                else:
                    _overwrite(twin, member, {"key"})
        elif isinstance(v, dict) and isinstance(held, dict):
            _overwrite(held, v, frozenset())
        else:
            dst[k] = copy.deepcopy(v)


def _successor(match, incoming, fid):
    successor = copy.deepcopy(match)
    successor["id"] = fid
    for name, keyfn in UNION_FIELDS.items():
        members = incoming.get(name) or []
        if not members:
            continue
        current = successor.setdefault(name, [])
        seen = {keyfn(m) for m in current}
        for member in members:
            if keyfn(member) not in seen:
                current.append(copy.deepcopy(member))
                seen.add(keyfn(member))
    _overwrite(successor, incoming, SUCCESSION_SKIP)
    successor["valid_from"] = incoming.get("valid_from")
    successor["valid_to"] = None
    successor["supersedes"] = {"ref": match["id"]}
    successor.pop("superseded_by", None)
    return successor


def _upsert(store, plans):
    """Create, merge or supersede. Returns one record per touched entry; the
    `original` payload rides along to `_finalise`, lifted out of the incoming
    entry before the ladder could install it inline (QF-31)."""
    touched = []
    for action, match, incoming, fid in plans:
        original = (incoming.get("data") or {}).pop("original", None)
        if action == "create":
            entry = _new_entry(incoming, fid)
            store[entry["kind"]]["entries"].append(entry)
            changed = True
        elif action == "supersede":
            entry = _successor(match, incoming, fid)
            store[entry["kind"]]["entries"].append(entry)
            match["valid_to"] = incoming.get("valid_from")
            match["superseded_by"] = {"ref": fid}
            touched.append({"entry": match, "id": match["id"], "created": False,
                            "changed": True, "original": None})
            changed = True
        else:
            entry = match
            source = (incoming.get("source") or [{}])[0]
            changes = merge_entry(match, incoming, source)
            changed = any(act != "noop" for _, act in changes)
        touched.append({"entry": entry, "id": fid,
                        "created": action in ("create", "supersede"),
                        "changed": changed, "original": original})
    return touched


# --------------------------------------------------------------------------- #
# 7-9. originals, hashes, status, updated_at, the five files, the run directory
# --------------------------------------------------------------------------- #

def _store_original(root, entry, fid, original):
    """QF-31: the verbatim body lives in `facts/originals/{id}.txt` and the
    entry keeps a path. Returns True when this run moved or changed it."""
    rel = f"facts/originals/{fid}.txt"
    path = root / rel
    if ((entry.get("data") or {}).get("original_ref") == rel and path.is_file()
            and path.read_text(encoding="utf-8") == original):
        return False
    write_text_atomic(path, original)
    entry.setdefault("data", {})["original_ref"] = rel
    return True


def _hash_of(root, ref):
    """`sha256:…` for a citation whose file is here; `null` for one that is not
    — an estate `.xlsx` lives on the server, and `check` reports it, but its
    absence never fails a write."""
    if not isinstance(ref, str) or not ref:
        return None
    path = root / ref
    return sha256_file(path) if path.is_file() else None


def _stamp_sources(root, entry, run_ref):
    """Hash and run stamp for every citation this run brought in. One already
    stamped is left alone — re-stamping it with a new run directory would
    rewrite an entry nothing changed."""
    for source in entry.get("source") or []:
        if "run" in source:
            continue
        source["hash"] = _hash_of(root, source.get("ref"))
        source["run"] = run_ref


def _snapshot(root, run_dir):
    """The five files as they stand before this run writes — `revert` reads
    them back (§12). The directory is made even when the store is empty."""
    before = run_dir / "facts-before"
    before.mkdir(parents=True, exist_ok=True)
    for name in KIND_FILES.values():
        path = facts_dir(root) / name
        if path.is_file():
            shutil.copy2(path, before / name)


def _run_ref(root, run_dir):
    try:
        return run_dir.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(run_dir)


def _finalise(root, store, run_dir, delta_path, id_map, touched, now):
    run_ref = _run_ref(root, run_dir)
    created, updated = [], []
    for record in touched:
        entry = record["entry"]
        if record["original"] is not None and _store_original(
                root, entry, record["id"], record["original"]):
            record["changed"] = True
        if record["changed"]:
            _stamp_sources(root, entry, run_ref)
        # The stored status may never disagree with the derived one.
        entry["status"] = derive_status(entry)
        if record["changed"]:
            entry["updated_at"] = now
            (created if record["created"] else updated).append(record["id"])
    _snapshot(root, run_dir)
    save_store(root, store)
    kept = run_dir / "facts-delta.json"
    # The pipeline's own delta is already written there (QF-7); a caller from
    # elsewhere — `edit-fact`, the ui-backend — hands us one to copy in.
    if not (kept.exists() and kept.samefile(delta_path)):
        shutil.copy2(delta_path, kept)
    write_json_atomic(run_dir / "id-map.json", id_map)
    return {"created": created, "updated": updated}
