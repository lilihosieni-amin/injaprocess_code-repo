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
import shutil
import sys
from datetime import datetime, timezone
from functools import partial

import jdatetime
from allocate_id import next_fact_id, peek_fact_id
from engine_common import (read_json, validate, write_json_atomic,
                           write_text_atomic)
# `KEY_RE` and `PROC_ID_RE` are unused here and imported anyway: `verbs.py`
# and `audit.py` read them off this module.
from merge_facts import (KEY_RE, KIND_FILES, KIND_ORDER, PROC_ID_RE,
                         SEGMENT_RE, canonical_scope, derive_status, facts_dir,
                         find_match, is_open, iter_ref_objects, load_store,
                         save_store, sha256_file)
# `_is_keyed_list` and `keyfn_for` are the ladder's own answers to "is this a
# list merged member by member, and what matches its members" — a successor's
# copy walks the same shapes, so they are borrowed rather than restated. The
# dispute question is the ladder's too: `would_dispute` runs it.
from merge_facts.ladder import (TOP_SKIP, UNION_FIELDS, _is_keyed_list,
                                keyfn_for, merge_entry, with_account_id,
                                would_dispute)
# The precondition pass and the helpers that moved with it (v3 §4). Imported,
# not re-declared — and re-exported by being imported.
from merge_facts.preconditions import (FACT_ID_RE, PACK_KEYS, TEMP_ID_RE,
                                       UNITS_KEY, UNKNOWN_UNIT,
                                       _declared_fields, _declared_rows,
                                       _is_stub, _lookup,
                                       _source_path_problems, preconditions)

SUCCESSION_SKIP = TOP_SKIP | frozenset({"supersedes", "superseded_by"})

#: The leaves `location` keeps once it is derived from `instances[0]` (§4).
LOCATION_KEYS = ("spreadsheetId", "sheetId", "sheet", "hidden")


def apply(root, delta_path, run_dir):
    """Apply one delta to the store. Returns `{created, updated, id_map}`."""
    root, delta_path, run_dir = (pathlib.Path(root), pathlib.Path(delta_path),
                                 pathlib.Path(run_dir))
    if used(run_dir):
        print(f"precondition failed: run directory {run_dir} has already "
              f"applied a delta — its id-map.json is the record of it",
              file=sys.stderr)
        raise SystemExit(2)
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
    problems = preconditions(root, store, entries, run_dir)          # 2
    if problems:
        for msg in problems:
            print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)
    # `partial`, not the bare `next_fact_id`: `_plan` calls its minter with no
    # arguments, and a bare `next_fact_id()` would resolve the root from
    # DATA_ROOT instead of the one this call was handed.
    plans, id_map, resolution = _plan(root, store, entries,
                                      partial(next_fact_id, root))   # 3
    _rewrite_refs(entries, resolution)                               # 4
    touched, adopted = _upsert(store, plans)                         # 6
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    _stamp(root, store, touched, now)                                # 7
    originals = [(root / t["original_ref"], t["original"]) for t in touched
                 if t.get("original_ref")]
    _write(root, store, run_dir, delta_path, id_map, touched, adopted,
           originals)                                                # 8-9
    return {"created": [t["id"] for t in touched if t["changed"] and t["created"]],
            "updated": [t["id"] for t in touched
                        if t["changed"] and not t["created"]],
            "id_map": id_map}


def used(run_dir):
    """§4: a run directory `apply` has already written into, and refuses a
    second delta from — marked by either of the two artefacts `_write` leaves,
    the `facts-before/` snapshot it takes first or the `id-map.json` it writes
    last.

    The postmortem reproduced what the absence of this cost: two applies into
    one run dir both exit 0, `id-map.json` keeps only the first call's map
    (`_write_once`) while `facts-delta.json` is overwritten by the second, so
    `revert` strands every id the second call minted. The snapshot is read
    here too (Task 5 review) because `id-map.json` is written AFTER
    `save_store`: a crash in that window leaves a mutated store behind an
    unmarked run dir, and the retry would apply the same delta a second time.
    Marking on the FIRST artefact instead closes that window — at the cost of
    refusing a retry of a run that crashed before `save_store`, which is the
    safe side of a question `revert` can answer and a double apply cannot.

    A retry AFTER a precondition failure is unaffected — nothing at all is
    written until the preconditions pass, snapshot included. `resolve`,
    `retire` and the repairs take their own run dirs and never come through
    `apply`.
    """
    run_dir = pathlib.Path(run_dir)
    return (run_dir / "id-map.json").exists() or (run_dir / "facts-before").exists()


def _today_jalali():
    """Today as QF-41's business date — Latin-digit Jalali. `verbs.retire`
    imports this one rather than keeping its own, so the two dates a run can
    write into `valid_to` come from a single definition."""
    return jdatetime.date.today().strftime("%Y-%m-%d")


def _recompute_location(entry):
    """§4: `location` is a derived pointer — the first `instances[]` member in
    ascending instance-key order. The ladder skips the leaf (`ladder.DERIVED`),
    so this is its one writer. A record with no instances (paper, external,
    native, a stub) keeps the location its delta gave it."""
    data = entry.get("data") or {}
    instances = [i for i in data.get("instances") or [] if isinstance(i, dict)]
    if not instances:
        return False
    first = min(instances, key=lambda i: i.get("key") or "")
    location = {k: first[k] for k in LOCATION_KEYS if k in first}
    if data.get("location") == location:
        return False
    data["location"] = location
    return True


class _MemoryMinter:
    """`next_fact_id` with the ledger left alone. `validate --store --run`
    must leave `facts/.id-seq.json` byte-identical — it is a preview, not a
    run — so it mints from a counter seeded off the ledger through the public
    peek and never writes back."""

    def __init__(self, root):
        self._next = peek_fact_id(root)

    def __call__(self):
        fid = self._next
        self._next = f"F-{int(fid[2:]) + 1:05d}"
        return fid


def simulate(root, delta_path, run_dir, now="2026-01-01T00:00:00Z"):
    """The whole of `apply` on a copy of the store, writing nothing. Returns
    `(store_after, problems)`; `problems` is empty exactly when this delta may
    be applied.

    §4: a delta that reaches Gate B must be one `apply` cannot refuse, and the
    2026-09-02 run proved that validating the delta alone does not establish
    that — the store it would WRITE is what `apply` validates on the way out.
    So this runs the same pipeline over `copy.deepcopy(load_store(root))` with
    an in-memory minter, stamps the derived leaves, and validates the result
    against `facts.schema.json`.

    The delta's own schema is the caller's first step (`validate` runs it
    before this, `apply` runs it itself); this starts where both leave off.
    """
    root, delta_path = pathlib.Path(root), pathlib.Path(delta_path)
    delta = read_json(delta_path)
    entries = [copy.deepcopy(e) for e in delta.get("entries") or []]
    for e in entries:
        e["scope"] = canonical_scope(e.get("scope"))
    # `load_store` re-parses from disk, so the copy guards nothing today; it
    # states the guarantee rather than resting on that.
    store = copy.deepcopy(load_store(root))
    _derive_keys(store, entries)
    problems = preconditions(root, store, entries, run_dir)
    if problems:
        return store, problems
    plans, _id_map, resolution = _plan(root, store, entries,
                                       _MemoryMinter(root))
    _rewrite_refs(entries, resolution)
    touched, _adopted = _upsert(store, plans)
    _stamp(root, store, touched, now)
    for kind in KIND_ORDER:
        try:
            validate("facts.schema.json", store[kind])
        except ValueError as exc:
            problems.append(f"{kind}: the store this delta would write is "
                            f"invalid: {exc}")
    return store, problems


# --------------------------------------------------------------------------- #
# 5. the keys merge derives
# --------------------------------------------------------------------------- #


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
# 3. upsert — an id on a miss only, in KIND_ORDER so a hit is found before a
#    miss mints
# --------------------------------------------------------------------------- #

def _is_supersession(match, incoming, source):
    """§11: a value that would be *disputed* but carries a **later**
    `valid_from` — or a delta that names the match in `supersedes` outright —
    is a successor instead. Jalali is fixed-width (QF-41), so the dates compare
    as strings; an incumbent with no `valid_from` counts as earlier. "Would be
    disputed" is the ladder's own verdict, asked on copies — prose never
    disputes, so a re-worded statement never supersedes."""
    declared = (incoming.get("supersedes") or {}).get("ref") == match["id"]
    valid_from = incoming.get("valid_from")
    if not valid_from and not declared:
        return False
    held = match.get("valid_from")
    if valid_from and held is not None and str(valid_from) <= str(held):
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


def _plan(root, store, entries, minter):
    """Decide each entry's target id before anything is merged. `id_map` holds
    only the ids this run mints — it is what `revert` reads to know what the run
    created, so an adoption, which hands over an existing id, is not in it;
    `resolution` additionally maps a temp id onto the entry it hit, so the
    second pass can rewrite refs to it.

    `minter` is the id source (§4): `apply` passes the ledger's, `simulate` an
    in-memory counter. `root` is kept in the signature because the plan reads
    as "for this store under this root"; nothing here uses it any more.
    """
    plans, id_map, resolution = [], {}, {}
    for entry in sorted(entries, key=lambda e: KIND_ORDER.index(e["kind"])):
        match = find_match(store, entry)
        if match is None:
            match = _workbook_stub(store, entry)
            if match is None:
                action, fid = "create", minter()
            else:
                action, fid = "adopt", match["id"]   # the stub's id, no mint
        elif _is_stub(match) or _is_stub(entry):
            # a stub is filled outright, and a stub delta meeting an entry
            # carries no reading to dispute — neither ever supersedes
            action, fid = "merge", match["id"]
        elif _is_supersession(match, entry, _first_source(entry)):
            action, fid = "supersede", minter()
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
    if entry.get("accounts"):
        # QF-43: a delta may declare accounts on an entry it creates, and the
        # delta schema omits `accounts[].id` — the ladder's minter fills it in,
        # exactly as it does for an account merged onto an existing entry.
        entry["accounts"] = [with_account_id(a) for a in entry["accounts"]]
    entry.setdefault("valid_from", None)
    entry.setdefault("valid_to", None)
    entry.setdefault("retired", False)
    entry["status"] = "unknown"          # re-derived in `_stamp`, always
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
    # §11: the superseded era's accounts do NOT come along. An account is a
    # competing reading of the *old* value, and the successor's value is a
    # different one — so an inherited account is a dispute that is not the
    # successor's, which would (a) be born `disputed` and never confirmable and
    # (b) hand `resolve` a dead era's number to write over the live one
    # (`verbs.resolve` installs `chosen["value"]` whatever its status). Settled
    # ones are dropped for that same second reason, and nothing is lost: the
    # predecessor keeps every one of them, and `supersedes`/`superseded_by`
    # link the two. What the successor may carry is the incoming delta's own
    # accounts — competing readings of the NEW era, stated by this very run.
    accounts = [with_account_id(a) for a in incoming.get("accounts") or []]
    if accounts:
        successor["accounts"] = accounts
    else:
        successor.pop("accounts", None)
    successor["valid_from"] = incoming.get("valid_from")
    successor["valid_to"] = None
    successor["supersedes"] = {"ref": match["id"]}
    successor.pop("superseded_by", None)
    return successor


def _upsert(store, plans):
    """Create, merge or supersede. Returns `(touched, adopted)`: one record
    per touched entry — the `original` payload rides along to `_stamp`,
    lifted out of the incoming entry before the ladder could install it
    inline (QF-31) — and `adopted`, the ids of every workbook stub (QF-20)
    this run adopted, which `_write` writes to `{run_dir}/adopted.json`
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
            # §4: a supersession that names no `valid_from` still closes the
            # predecessor — with the run's own date, so an era always has an
            # end and `is_open` never sees two live ones for a key.
            match["valid_to"] = incoming.get("valid_from") or _today_jalali()
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
        if _recompute_location(entry):
            changed = True
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


def _stamp(root, store, touched, now):
    """The derived half of what used to be `_finalise`: `data.original_ref`,
    `status` and `updated_at` — and not one byte on disk.

    Split off (§4) so `validate facts-delta --store --run` can run the whole
    apply in memory and validate the store it WOULD write. These are exactly
    the leaves `facts.schema.json` requires: a store validated before this ran
    fails on every creation's null `updated_at` and proves nothing.

    A record whose verbatim body must move to `facts/originals/` gets its
    `original_ref` here and the path recorded on the touched record; `_write`
    puts the bytes there. `store` is the subject of the two lines above and is
    named for that; nothing here reads it.
    """
    for record in touched:
        entry = record["entry"]
        if record["original"] is not None:
            rel = f"facts/originals/{record['id']}.txt"
            path = root / rel
            if not ((entry.get("data") or {}).get("original_ref") == rel
                    and path.is_file()
                    and path.read_text(encoding="utf-8") == record["original"]):
                record["original_ref"] = rel     # `_write` writes the body
                record["changed"] = True
            entry.setdefault("data", {})["original_ref"] = rel
        # The stored status may never disagree with the derived one.
        entry["status"] = derive_status(entry)
        if record["changed"]:
            entry["updated_at"] = now


def _write(root, store, run_dir, delta_path, id_map, touched, adopted, originals):
    """The writing half: the originals `_stamp` named, the source stamps, the
    snapshot, the five files, and the run directory's own records. Nothing
    here derives anything — `_stamp` has run, and `validate --store --run`
    stops before this line is reached."""
    run_ref = _run_ref(root, run_dir)
    for path, body in originals:
        write_text_atomic(path, body)
    for record in touched:
        if record["changed"]:
            _stamp_sources(root, record["entry"], run_ref)
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
    # this artifact" rather than "nothing adopted".
    _write_once(run_dir / "adopted.json", sorted(adopted))
