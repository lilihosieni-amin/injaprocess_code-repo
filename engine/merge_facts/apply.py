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
files this verb takes before it writes (once per run directory — see
`_snapshot`'s own docstring); the run directory is the provenance (QF-7) and
also keeps `facts-delta.json`, `id-map.json`, and `adopted.json` — the ids of
every workbook stub (QF-20) this run adopted, always written (`[]` when none),
so `revert` can refuse an adoption without re-deriving it from the store
later, after other runs may have changed what the adopted record looks like
(Task 7 review, I2). `id-map.json` and `adopted.json` are, like the snapshot,
written once per run directory (`_write_once`, Task 7 review round 2): a
RETRY of the same delta into the same run dir must not recompute either from
the now-already-written store and silently erase the first call's true
record — every entry would now read as a hit, not a miss, and an
already-adopted stub has nothing left to adopt.

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
from merge_facts import (KIND_FILES, KIND_ORDER, _sheet_identity, canonical_scope,
                         collect_leaves, derive_status, facts_dir, find_match,
                         is_open, iter_ref_objects, load_store, save_store,
                         sha256_file)
from merge_facts.content import check_document
# `_is_keyed_list` and `keyfn_for` are the ladder's own answers to "is this a
# list merged member by member, and what matches its members" — a successor's
# copy walks the same shapes, so they are borrowed rather than restated. The
# dispute question is the ladder's too: `would_dispute` runs it.
from merge_facts.ladder import (TOP_SKIP, UNION_FIELDS, _is_keyed_list,
                                keyfn_for, merge_entry, would_dispute)

SEGMENT_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$")
FACT_ID_RE = re.compile(r"^F-[0-9]{5}$")
TEMP_ID_RE = re.compile(r"^T-[0-9]+$")
PROC_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")
UNITS_KEY = "units"
UNKNOWN_UNIT = "—"
# §10: `pack` and `item.units[]` carry pack sizes, not units — "which the unit
# check does not walk". The audit's `unit_raw` walk skips the same pair.
PACK_KEYS = frozenset({"pack", "units"})
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
    problems = _preconditions(root, store, entries, run_dir)         # 2
    if problems:
        for msg in problems:
            print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)
    plans, id_map, resolution = _plan(root, store, entries)          # 3
    _rewrite_refs(entries, resolution)                               # 4
    touched, adopted = _upsert(store, plans)                         # 6
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = _finalise(root, store, run_dir, delta_path, id_map, touched, now,
                       adopted)
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
    # Only a reference table's rows are keyed by their primaryKey join (§9). A
    # log's or a config table's rows are minted once and kept as written — the
    # unit table's `g` is a key, not a derivation, and re-keying it under merge
    # would move the rows the unit precondition reads.
    if data.get("role") != "reference":
        return
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


def _unit_symbols(entry):
    """Every symbol this entry cites as a unit (QF-40) — every leaf named
    `unit` under `data`, an item's own default included.

    The one exclusion is the pair §10 names outright: `pack` and `units[]` hold
    pack sizes, "which the unit check does not walk".
    """
    out = collect_leaves(entry.get("data") or {}, "unit", PACK_KEYS)
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


def _natural_key(entry):
    return (entry["kind"], entry.get("key"),
            tuple(entry["scope"]["departments"]), tuple(entry["scope"]["branches"]))


def _preconditions(root, store, entries, run_dir):
    """Human-readable messages, empty when the delta may be written.

    `status`, `source[].hash` and `data.original_ref` need no check here: the
    delta schema has no place for any of them.
    """
    out = []
    # QF-15: two open entries sharing an identity is a store-integrity failure,
    # and a delta carrying both would create it in one write. A sheet record is
    # identified by its (spreadsheetId, sheet) pair as well as by its natural
    # key, and it is the pair that catches a tab written up twice under two
    # keys — which is what a re-derived key would otherwise become.
    seen, sheets = set(), set()
    for entry in entries:
        if not is_open(entry):
            continue
        nk = _natural_key(entry)
        if nk in seen:
            out.append(f"duplicate natural key {entry.get('key')} in delta")
        seen.add(nk)
        ident = _sheet_identity(entry)
        if ident is not None:
            if ident in sheets:
                out.append(f"duplicate sheet identity {ident[0]}/{ident[1]} in delta")
            sheets.add(ident)
    # QF-43: a run creates only in its own department, or at empty scope. It
    # may still *add* to any entry it matches — that is how a cross-department
    # contradiction surfaces, which is QF-2's whole point.
    run_dept = pathlib.Path(run_dir).parent.name
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
            if not set(entry["scope"]["departments"]) <= {run_dept}:  # QF-43
                out.append(f"entry {entry.get('key')} scoped to another department")
            if entry["kind"] != "note":                              # QF-34
                twin = _title_twin(store, entry)
                if twin is not None:
                    out.append(f"{label}: title {entry.get('title')!r} is already "
                               f"{twin['id']}'s in this kind and scope")
        elif match["key"] != entry["key"] and not _is_stub(match):
            out.append(f"{label}: keys are immutable — {match['id']} is keyed "
                       f"{match['key']!r}, this delta carries {entry['key']!r}")
        out.extend(_reference_problems(store, by_temp, entry, label))
    # Task 9: the content pass runs once over the whole delta (its checks are
    # document-wide — e.g. an intra-file unit edge needs the sibling entry),
    # on `entries` as they stand HERE: canonical scope applied, row keys
    # derived and `refItems` cells already substituted by `_derive_keys`, but
    # `{ref}` objects still carrying temp ids (`_rewrite_refs` runs later) —
    # exactly the shape every other precondition above already reasons about.
    out.extend(check_document({"schema_version": 1, "entries": entries},
                              "facts-delta"))
    return out


# --------------------------------------------------------------------------- #
# 3. upsert — an id on a miss only, in KIND_ORDER so a hit is found before a
#    miss mints
# --------------------------------------------------------------------------- #

def _is_supersession(match, incoming, source):
    """§11: a value that would be *disputed* but carries a **later**
    `valid_from` is a successor instead. Jalali is fixed-width (QF-41), so the
    dates compare as strings; an incumbent with no `valid_from` counts as
    earlier. "Would be disputed" is the ladder's own verdict, asked on copies —
    prose never disputes, so a re-worded statement never supersedes."""
    valid_from = incoming.get("valid_from")
    if not valid_from:
        return False
    held = match.get("valid_from")
    if held is not None and str(valid_from) <= str(held):
        return False
    return would_dispute(match, incoming, source)


def _workbook_stub(store, entry):
    """QF-20: the workbook stub standing in for this record's spreadsheet — the
    `ext_…` entry a formula's Drive id created before the workbook joined the
    manifest. Only the **first** real record for that id meets one; adoption
    clears the stub, so later records for the same workbook are new entries."""
    if entry["kind"] != "record":
        return None
    sid = ((entry.get("data") or {}).get("location") or {}).get("spreadsheetId")
    if not sid:
        return None
    for other in store["record"]["entries"]:
        data = other.get("data") or {}
        if (is_open(other) and data.get("stub") and data.get("grain") == "workbook"
                and (data.get("location") or {}).get("spreadsheetId") == sid):
            return other
    return None


def _fill_stub(entry, incoming, identity):
    """§11/QF-20: the owning run adopts a stub outright rather than disputing
    its emptiness — `stub` cleared, `title` and `location` overwritten,
    `source[]` kept (the ladder unions the incoming citation in afterwards).

    `identity` is the workbook case: the stub also hands over its **id**, and
    its `ext_…` key and scope are replaced by the delta's. That, with the
    measurement keys re-derived through it, is one of QF-34's two sanctioned
    key changes.
    """
    before = copy.deepcopy(entry)
    data = entry.setdefault("data", {})
    data.pop("stub", None)
    if identity:
        data.pop("grain", None)
        entry["key"] = incoming["key"]
        entry["scope"] = copy.deepcopy(incoming["scope"])
    if incoming.get("title") is not None:
        entry["title"] = incoming["title"]
    location = (incoming.get("data") or {}).get("location")
    if location is not None:
        data["location"] = copy.deepcopy(location)
    return entry != before


def _strip_stub_markers(incoming):
    """`data.stub`, and `data.grain` where it is the workbook marker rather than
    a record's prose grain, never reach the ladder from a delta — the same
    lifting `data.original` gets. Left in place they would be re-created on the
    entry `_fill_stub` has just cleared, and every re-read would count as a
    change."""
    data = incoming.get("data") or {}
    data.pop("stub", None)
    if data.get("grain") == "workbook":
        data.pop("grain", None)


def _union_sources(entry, incoming):
    """Set-union of `source[]` alone (§11), for a stub delta that meets an
    entry: the citation is all it has to offer."""
    keyfn = UNION_FIELDS["source"]
    current = entry.setdefault("source", [])
    seen = {keyfn(m) for m in current}
    added = False
    for member in incoming.get("source") or []:
        if keyfn(member) not in seen:
            current.append(copy.deepcopy(member))
            seen.add(keyfn(member))
            added = True
    return added


def _first_source(entry):
    return (entry.get("source") or [{}])[0]


def _rederive_measurements(store, record_ids):
    """After an adoption, every measurement keyed through the old record key is
    re-keyed through the new one (QF-20). Yields the entries that moved."""
    for m in store["measurement"]["entries"]:
        writes_to = (m.get("data") or {}).get("writes_to") or {}
        if writes_to.get("ref") not in record_ids:
            continue
        derived = _measurement_key(store, {}, m.get("data") or {})
        if derived and derived != m["key"]:
            m["key"] = derived
            yield m


def _plan(root, store, entries):
    """Decide each entry's target id before anything is merged. `id_map` holds
    only the ids this run mints — it is what `revert` reads to know what the run
    created, so an adoption, which hands over an existing id, is not in it;
    `resolution` additionally maps a temp id onto the entry it hit, so the
    second pass can rewrite refs to it."""
    plans, id_map, resolution = [], {}, {}
    for entry in sorted(entries, key=lambda e: KIND_ORDER.index(e["kind"])):
        match = find_match(store, entry)
        if match is None:
            match = _workbook_stub(store, entry)
            if match is None:
                action, fid = "create", next_fact_id(root)
            else:
                action, fid = "adopt", match["id"]   # the stub's id, no mint
        elif _is_stub(match) or _is_stub(entry):
            # a stub is filled outright, and a stub delta meeting an entry
            # carries no reading to dispute — neither ever supersedes
            action, fid = "merge", match["id"]
        elif _is_supersession(match, entry, _first_source(entry)):
            action, fid = "supersede", next_fact_id(root)
        else:
            action, fid = "merge", match["id"]
        plans.append((action, match, entry, fid))
        if entry.get("id"):
            resolution[entry["id"]] = fid
            if action in ("create", "supersede"):
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
            keyfn = keyfn_for(k)
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
    """Create, merge or supersede. Returns `(touched, adopted)`: one record
    per touched entry — the `original` payload rides along to `_finalise`,
    lifted out of the incoming entry before the ladder could install it
    inline (QF-31) — and `adopted`, the ids of every workbook stub (QF-20)
    this run adopted, which `_finalise` writes to `{run_dir}/adopted.json`
    so `revert` can refuse an adoption without ever re-deriving it."""
    touched, adopted = [], []
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
        elif _is_stub(incoming):
            # A stub delta meeting an existing entry (QF-20): a stub writes
            # nothing but identity, and its title and location are boilerplate
            # rather than a reading — so it adds its citation and nothing else.
            # Re-running it must not re-stub a record the owning run has filled.
            entry = match
            changed = _union_sources(match, incoming)
        else:                                        # merge, or adopt a stub
            entry = match
            filled = (_fill_stub(match, incoming, action == "adopt")
                      if _is_stub(match) else False)
            if action == "adopt":
                adopted.append(match["id"])
            # Only `_fill_stub` and a creation may set the stub markers; the
            # ladder must never re-create the flag it has just cleared.
            _strip_stub_markers(incoming)
            changes = merge_entry(match, incoming, _first_source(incoming))
            changed = filled or any(act != "noop" for _, act in changes)
        touched.append({"entry": entry, "id": fid,
                        "created": action in ("create", "supersede"),
                        "changed": changed, "original": original})
    if adopted:
        # after the whole loop, so a measurement this same delta created is
        # re-keyed too
        known = {id(t["entry"]) for t in touched}
        for m in _rederive_measurements(store, set(adopted)):
            if id(m) not in known:
                touched.append({"entry": m, "id": m["id"], "created": False,
                                "changed": True, "original": None})
    return touched, adopted


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
    them back (§12). The directory is made even when the store is empty.

    Once per run directory (Task 7 review, C1): `verbs.py`'s writing verbs
    can share one run dir across several calls (`_append_delta` grows one
    list there), and each call runs `apply`'s own `_snapshot`. A second call
    must NOT re-copy — the store has already been mutated by the first call
    by the time the second one runs, so re-snapshotting would silently
    overwrite the true "before this run" state with an already-mutated one.
    A `facts-before/` dir that already EXISTS is that guard, tested on
    existence alone (never on its contents) — an existing-but-empty dir is
    itself a valid snapshot, of a store that had no files yet."""
    before = run_dir / "facts-before"
    if before.exists():
        return
    before.mkdir(parents=True)
    for name in KIND_FILES.values():
        path = facts_dir(root) / name
        if path.is_file():
            shutil.copy2(path, before / name)


def _write_once(path, obj):
    """Write `obj` to `path` as JSON, but only the FIRST time (Task 7 review,
    round 2): a run dir reused for a RETRY of the same delta must not let a
    second `apply()` call recompute `id_map`/`adopted` from the now-already-
    written store and silently overwrite the run's true, original record —
    every entry would now be a hit rather than a miss, flipping `id_map` to
    `{}`, and an already-adopted stub has nothing left to adopt, flipping
    `adopted` to `[]` — each erasing exactly the artifact `revert` depends
    on. Tested on existence alone, like `_snapshot`'s own guard (same Task 7
    review, C1). A reused run dir applying a DIFFERENT delta keeps the first
    call's now-stale artifacts; that is an accepted cost, not a bug — reusing
    a run dir at all is unsupported."""
    if path.exists():
        return
    write_json_atomic(path, obj)


def _run_ref(root, run_dir):
    try:
        return run_dir.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(run_dir)


def _finalise(root, store, run_dir, delta_path, id_map, touched, now, adopted):
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
    _write_once(run_dir / "id-map.json", id_map)
    # QF-20, Task 7 review (I2): the ids this run adopted, recorded HERE, at
    # write time, rather than left for `revert` to infer later from store
    # comparison — a later run's own changes to an adopted record would have
    # made that inference wrong. Always written, `[]` when nothing was
    # adopted, so a MISSING file unambiguously means "a run that predates
    # this artifact" rather than "nothing adopted". `_write_once` (Task 7
    # review, round 2): a retried `apply()` into the same run dir must not
    # recompute and silently erase the first call's true record.
    _write_once(run_dir / "adopted.json", sorted(adopted))
    return {"created": created, "updated": updated}
