"""`merge facts resolve|retire|promote|export|repair-foreign-keys|repair-source-refs`
— the verbs
that mutate an already-applied entry by hand rather than by re-reading a source
(spec §12, rows 2-5). `apply` is the only verb that reads a delta; these read a
decision an operator (or a downstream tool) already made.

The two `repair-*` verbs are the ones that take no entry id, and they exist for
one reason between them: §11's ladder can only create, fill, dispute, append and
union. It cannot take a key back out (`repair-foreign-keys`) and it cannot
rewrite a value in place (`repair-source-refs` — a corrected `ref` is a
different member of a union field, so a delta would add a second citation beside
the broken one). QF-2 leaves `merge facts` the only thing allowed to write
`facts/**` at all, so what a delta cannot express has to be a verb or nothing.
Each one's own docstring carries the bug it was written for and why `revert`
could not serve instead.

Every *writing* verb (`resolve`, `retire`, `promote`, and both `repair-*`)
shares one shape:
`load_store`, find the entry, mutate it, `entry["status"] = derive_status
(entry)`, stamp `updated_at` on the touched entry only, snapshot the five
files to `{run_dir}/facts-before/` (`apply`'s own `_snapshot`, Task 5 — taken
right before the write, same as `apply`'s), `save_store` (which rebuilds
`.index.json`), and append `{"verb": ..., "args": {...}}` to
`{run_dir}/facts-delta.json` — a run directory each call gets to itself
(never `apply`'s own run dir, whose `facts-delta.json` is the applied delta
verbatim, not a list). The snapshot is what lets `revert` (Task 7) undo one of
these calls the same way it undoes an `apply`. `export` is read-only and
takes no run directory.

`retire`'s default `valid_to` is "today" in the Jalali calendar, Latin
digits — QF-41's stored business-date type, the same convention
`upload_bot.naming.normalize_date` writes. `engine/pyproject.toml` declares
`jdatetime` (a coordinator ruling on task 6: this is core engine behaviour, a
standalone `pip install -e engine` must compute it without upload-bot alongside
it), so it is imported at module level like any other dependency. `--date`
stays as an explicit override for a caller that needs a specific date on the
record rather than the day the verb ran.
"""
import copy
import csv
import pathlib
import sys
from datetime import datetime, timezone

import jdatetime
from engine_common import read_json, under, write_json_atomic
from merge_facts import (
    KIND_FILES,
    KIND_ORDER,
    derive_status,
    is_open,
    load_store,
    save_store,
    set_path,
)
# `_snapshot` is `apply`'s own (Task 5): the five files as they stand right
# before a write, kept at `{run_dir}/facts-before/` so `revert` (Task 7) can
# restore an entry wholesale. Every *writing* verb here needs the same
# snapshot for the same reason — its run directory is just as revertible as
# an `apply` run's, and the controller ruling for `revert` treats a verbs
# run's `args["id"]` targets as ordinary matched entries, which only works if
# there is something to restore them from.
from merge_facts.apply import KEY_RE, _snapshot
from merge_facts.audit import _manifest
from merge_facts.content import foreign_key_declares_a_join

_KIND_DATA_STUBS = {
    # Neutral containers `promote` may inject — empty, so nothing is
    # fabricated: `rule`'s `inputs`/`outputs` start as empty lists (a later
    # apply or edit fills them), and `note`'s own `data` needs nothing extra.
    # item/record/measurement are deliberately absent: their schema-required
    # keys (`_KIND_REQUIRED_KEYS` below) are facts about the world — category,
    # unit, medium, role, location, quantity — and `promote` must never guess
    # at one. A note promoted to one of those three kinds is only accepted
    # when its own `data` already carries them.
    "rule": {"inputs": [], "outputs": []},
    "note": {},
}

_KIND_REQUIRED_KEYS = {
    "item": ("category", "unit"),
    "record": ("medium", "role", "location"),
    "measurement": ("quantity", "unit"),
}


def _fail(msg):
    print(f"precondition failed: {msg}", file=sys.stderr)
    raise SystemExit(2)


def _find(store, fact_id):
    for kind in KIND_ORDER:
        for e in store[kind]["entries"]:
            if e["id"] == fact_id:
                return kind, e
    return None, None


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today_jalali():
    return jdatetime.date.today().strftime("%Y-%m-%d")


def _append_delta(run_dir, verb, args):
    """`{run_dir}/facts-delta.json` as a growing JSON list of what ran here —
    never the apply-shaped delta object `apply` itself keeps, because these
    verbs are always handed a run directory of their own."""
    path = pathlib.Path(run_dir) / "facts-delta.json"
    doc = read_json(path) if path.exists() else []
    doc.append({"verb": verb, "args": args})
    write_json_atomic(path, doc)


def resolve(root, fact_id, field, account_id, run_dir):
    """Settle one disputed field: `account_id` is `chosen`, every other
    account on the SAME `field` is `rejected`, and its value is written into
    the disputed path — the only place a resolved value is ever installed
    outside the write ladder."""
    root = pathlib.Path(root)
    store = load_store(root)
    _, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    accounts = entry.get("accounts") or []
    chosen = next((a for a in accounts if a["id"] == account_id), None)
    if chosen is None:
        _fail(f"account {account_id} not found on {fact_id}")
    if chosen.get("field") != field:
        _fail(f"account {account_id} is on field {chosen.get('field')!r}, "
              f"not {field!r}")
    chosen["status"] = "chosen"
    for a in accounts:
        if a is not chosen and a.get("field") == field:
            a["status"] = "rejected"
    set_path(entry, field, chosen.get("value"))
    entry["status"] = derive_status(entry)
    entry["updated_at"] = _now()
    _snapshot(root, pathlib.Path(run_dir))
    save_store(root, store)
    _append_delta(run_dir, "resolve",
                  {"id": fact_id, "field": field, "account": account_id})


def retire(root, fact_id, heir, run_dir, date=None):
    """`retired: true`, `valid_to` set (today's Jalali date unless `date` is
    given), and `superseded_by` pointed at `heir` when there is one. A
    retired heir is refused outright — retiring into a dead end would let the
    chain of `superseded_by` refs go nowhere."""
    root = pathlib.Path(root)
    store = load_store(root)
    _, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    if heir is not None:
        _, heir_entry = _find(store, heir)
        if heir_entry is None:
            _fail(f"heir {heir} not found")
        if heir_entry.get("retired"):
            _fail(f"heir {heir} is itself retired")
    entry["retired"] = True
    entry["valid_to"] = date or _today_jalali()
    if heir is not None:
        entry["superseded_by"] = {"ref": heir}
    entry["status"] = derive_status(entry)
    entry["updated_at"] = _now()
    _snapshot(root, pathlib.Path(run_dir))
    save_store(root, store)
    _append_delta(run_dir, "retire",
                  {"id": fact_id, "heir": heir, "date": entry["valid_to"]})


def promote(root, fact_id, kind, key, run_dir):
    """Move a note into a real kind, in place: the id stays, the kind and key
    change. `data` gets only neutral, empty containers a promote may add
    without inventing a fact (see `_KIND_DATA_STUBS`) — for item/record/
    measurement, the note's own `data` must already carry the target kind's
    schema-required keys, or promotion is refused. Only a note is promotable,
    and its hash key never carries over — `key` is always required."""
    root = pathlib.Path(root)
    store = load_store(root)
    src_kind, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    if src_kind != "note":
        _fail(f"{fact_id} is a {src_kind}, not a note — only notes are promotable")
    if kind not in KIND_FILES:
        _fail(f"kind {kind!r} is not a recognised kind")
    if not key or not KEY_RE.fullmatch(key):
        _fail(f"key {key!r} is not a minted key")
    if any(e["key"] == key and is_open(e) for e in store[kind]["entries"]):
        _fail(f"key {key!r} is already used by an open entry of kind {kind!r}")
    required = _KIND_REQUIRED_KEYS.get(kind)
    if required is not None:
        data = entry.get("data") or {}
        missing = [k for k in required if k not in data]
        if missing:
            _fail(f"promoting to {kind} requires data keys {', '.join(missing)}")
    store["note"]["entries"].remove(entry)
    entry["kind"] = kind
    entry["key"] = key
    data = entry.setdefault("data", {})
    for k, default in _KIND_DATA_STUBS.get(kind, {}).items():
        data.setdefault(k, copy.deepcopy(default) if isinstance(default, (list, dict))
                        else default)
    entry["status"] = derive_status(entry)
    entry["updated_at"] = _now()
    store[kind]["entries"].append(entry)
    # Belt: every precondition above is checked before this point, but a
    # residual schema failure (a shape `_KIND_REQUIRED_KEYS` doesn't cover)
    # must still exit clean rather than traceback. `save_store` validates
    # all five files before writing any, so the store is untouched either way.
    try:
        _snapshot(root, pathlib.Path(run_dir))
        save_store(root, store)
    except ValueError as e:
        _fail(str(e))
    _append_delta(run_dir, "promote", {"id": fact_id, "kind": kind, "key": key})


def repair_foreign_keys(root, run_dir):
    """Drop every `foreignKeys` member that declares no join, and the empty
    collection with the last of them. Returns `[(id, dropped)]`, entry order.

    **Why a verb and not a delta.** §11's ladder creates, fills, disputes,
    appends and unions; it has no action that removes, so no delta can take a
    key back out — and QF-2 leaves `merge facts` as the only thing permitted to
    write `facts/**` at all. `revert` cannot serve either: the 84 members this
    was written for came in across nine departments' seeding runs, whose ids
    later runs also touch, and reverting them would undo the estate rather than
    the defect.

    What counts as malformed is `content.foreign_key_declares_a_join` and
    nothing local, so this verb and the pass that refuses the shape cannot
    drift apart.

    `status` is deliberately NOT re-derived. A member declaring no join is not
    a value anyone gave, so it cannot be what QF-6 reads; recomputing here
    would let an unrelated status flip ride along inside a repair, on entries
    nobody was looking at. `updated_at` IS stamped on each touched entry, the
    way every writing verb stamps it — and QF-24 excludes it from a fact's
    fingerprint, so the stamp alone un-confirms nothing. **The drop itself
    does**: `data` is content, so an entry someone had confirmed comes back
    unconfirmed, which is the fingerprint working rather than failing.
    """
    root = pathlib.Path(root)
    store = load_store(root)
    repaired = []
    for kind in KIND_ORDER:
        for entry in store[kind]["entries"]:
            data = entry.get("data") or {}
            members = data.get("foreignKeys")
            if not isinstance(members, list):
                continue
            kept = [m for m in members if foreign_key_declares_a_join(m)]
            if len(kept) == len(members):
                continue
            if kept:
                data["foreignKeys"] = kept
            else:
                del data["foreignKeys"]
            entry["updated_at"] = _now()
            repaired.append((entry["id"], len(members) - len(kept)))
    # Idempotent: a second run finds nothing, and writes nothing — no
    # snapshot, no store write, no delta record. A run directory with no
    # `facts-delta.json` is one `revert` has nothing to undo, which is the
    # honest description of a repair that changed nothing.
    if repaired:
        _snapshot(root, pathlib.Path(run_dir))
        save_store(root, store)
        # One record per entry, `args["id"]` singular — the shape `revert`
        # already reads off a verbs run. A single record listing every id
        # would leave this the one verb its own `revert` silently skips.
        for fid, dropped in repaired:
            _append_delta(run_dir, "repair-foreign-keys",
                          {"id": fid, "dropped": dropped})
    return repaired


def _repaired_ref(root, manifest_by_id, ref):
    """The path QF-5 requires for a `ref` that names no file, or `None`.

    Two shapes, both read off what is actually on disk rather than guessed:

    * a bare Google Drive **spreadsheet id** — the manifest maps it to the
      workbook's directory and file, which is the whole reason the manifest
      carries `dir` and `file` beside `spreadsheetId`;
    * a path that **lost its root** — `Gozaresh markazi/Gozaresh markazi.gs`
      instead of `attachments/sheets/Gozaresh markazi/…`. Written as "does
      prefixing the estate root name a file that exists" rather than as a rule
      about `.gs`, because it is the same slip whatever the extension.

    Anything else answers `None` and is left exactly as it is. A repair that
    guessed would put a citation on an entry pointing at evidence nobody
    checked, which is worse than the broken one it replaced.
    """
    if (root / ref).exists():
        return None                                  # already a real path
    workbook = manifest_by_id.get(ref)
    if workbook and workbook.get("dir") and workbook.get("file"):
        return f"attachments/sheets/{workbook['dir']}/{workbook['file']}"
    rooted = f"attachments/sheets/{ref}"
    return rooted if (root / rooted).is_file() else None


def repair_source_refs(root, run_dir):
    """Rewrite every `source[].ref` that names no file into the path QF-5
    requires. Returns `[(id, rewritten)]`, entry order.

    **The bug this exists for.** QF-5 says a `ref` is a path relative to
    `data-repo/` and that an unresolvable one fails `apply` — but nothing
    implemented that until 2026-09-06, and `_hash_of` answers `null` for a file
    that is not there rather than complaining. So 575 citations were written
    holding a bare Drive spreadsheet id and 23 holding a path with its
    `attachments/sheets/` root missing, all hashed as nothing. They failed at
    the single place a ref is ever used: `GET /api/facts/source` resolves it
    against three roots, an id is inside none of them, and the reviewer gets
    «File wasn't available on site» — the owner's report.

    A verb for `repair-foreign-keys`' reasons: §11's ladder cannot rewrite a
    value in place (a corrected `ref` is a different member of a union field,
    so a delta would ADD a second citation beside the broken one), and QF-2
    admits no other writer of `facts/**`.

    `hash` and `run` are deliberately left alone. The hash was `null` because
    the file could not be found, and re-hashing here would stamp this repair
    run as the reader of a file it never opened — `merge facts check` re-hashes
    every citation and is the thing that should fill them, on its own terms.
    """
    root = pathlib.Path(root)
    store = load_store(root)
    by_id = {w["spreadsheetId"]: w for w in _manifest(root).get("workbooks") or []
             if isinstance(w, dict) and w.get("spreadsheetId")}
    repaired, unrepairable = [], []
    for kind in KIND_ORDER:
        for entry in store[kind]["entries"]:
            done = 0
            sources = list(entry.get("source") or [])
            sources += [a.get("source") for a in entry.get("accounts") or []
                        if isinstance(a, dict)]
            for src in sources:
                if not isinstance(src, dict):
                    continue
                ref = src.get("ref")
                if not isinstance(ref, str) or not ref:
                    continue
                fixed = _repaired_ref(root, by_id, ref)
                if fixed is None:
                    if not (root / ref).exists():
                        unrepairable.append((entry["id"], ref))
                    continue
                src["ref"] = fixed
                done += 1
            if done:
                entry["updated_at"] = _now()
                repaired.append((entry["id"], done))
    if repaired:
        _snapshot(root, pathlib.Path(run_dir))
        save_store(root, store)
        for fid, n in repaired:
            _append_delta(run_dir, "repair-source-refs", {"id": fid, "rewritten": n})
    return repaired, unrepairable


def export(root, record_key, out, include_retired):
    """A reference or config record's rows as CSV: `key` plus its declared
    `fields[].key`, in declaration order. A retired row (`retired` is one of
    the reserved row-member names Task 9's content check validates) is
    skipped unless `include_retired`. `out` may not land under `facts/` or
    `runs/` — both are the store's own territory, not an export drop point."""
    root, out = pathlib.Path(root), pathlib.Path(out)
    store = load_store(root)
    entry = next((e for e in store["record"]["entries"]
                 if e["key"] == record_key and is_open(e)), None)
    if entry is None:
        _fail(f"no open record {record_key!r}")
    role = (entry.get("data") or {}).get("role")
    if role not in ("reference", "config"):
        _fail(f"record {record_key!r} has role {role!r}, not reference/config")
    if under(out, root / "facts") or under(out, root / "runs"):
        _fail(f"export path {out} must not be under facts/ or runs/")
    fields = [f["key"] for f in (entry.get("data") or {}).get("fields") or []
             if isinstance(f, dict) and f.get("key")]
    rows = (entry.get("data") or {}).get("rows") or []
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["key"] + fields)
        for row in rows:
            if not include_retired and row.get("retired"):
                continue
            writer.writerow([row.get("key")] + [row.get(k) for k in fields])
    return out
