"""`merge facts resolve|retire|promote|export` — the four verbs that mutate an
already-applied entry by hand rather than by re-reading a source (spec §12,
rows 2-5). `apply` is the only verb that reads a delta; these read a decision
an operator (or a downstream tool) already made.

Every *writing* verb (`resolve`, `retire`, `promote`) shares one shape:
`load_store`, find the entry, mutate it, `entry["status"] = derive_status
(entry)`, stamp `updated_at` on the touched entry only, `save_store` (which
rebuilds `.index.json`), and append `{"verb": ..., "args": {...}}` to
`{run_dir}/facts-delta.json` — a run directory each call gets to itself
(never `apply`'s own run dir, whose `facts-delta.json` is the applied delta
verbatim, not a list). `export` is read-only and takes no run directory.

Jalali gap (see the task-6 report for the full note): `retire`'s default
`valid_to` needs "today" in the Jalali calendar, Latin digits, the same
convention `upload_bot.naming.normalize_date` writes. `engine`'s own
`pyproject.toml` does not depend on `jdatetime` — only `upload-bot`'s does —
so `_today_jalali` below borrows it the same defensive way `naming.py` does
(a lazy import, so importing this module never requires the package), but
unlike `naming.py` it is reaching for a dependency `engine` never declared.
It works in this shared dev venv because `jdatetime` leaks in from
`upload-bot`'s install; a standalone `pip install -e engine` deploy would not
have it, and `retire()` would exit 2 pointing at `--date` instead of
silently guessing wrong. `--date` is the escape hatch either way.
"""
import copy
import csv
import pathlib
import sys
from datetime import datetime, timezone

from engine_common import read_json, write_json_atomic
from merge_facts import (
    KIND_FILES,
    KIND_ORDER,
    derive_status,
    is_open,
    load_store,
    save_store,
    set_path,
)
from merge_facts.apply import KEY_RE

_KIND_DATA_STUBS = {
    # The structural keys facts.schema.json's per-kind `oneOf` requires
    # present under `data`, defaulted only when `promote` moves an entry into
    # a kind whose shape it doesn't already have (a note's `data` starts
    # empty). The schema constrains presence, not type, so `None` is a valid
    # placeholder for a scalar the promoting operator hasn't filled in yet.
    "item": {"category": None, "unit": None},
    "record": {"medium": None, "role": None, "location": {}},
    "measurement": {"quantity": None, "unit": None},
    "rule": {"inputs": [], "outputs": []},
    "note": {},
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
    try:
        import jdatetime  # lazy: see the module docstring's Jalali gap note
    except ImportError:
        _fail("no Jalali calendar library is available to compute retire's "
              "default valid_to (engine does not depend on jdatetime) — pass "
              "--date explicitly")
    return jdatetime.date.today().strftime("%Y-%m-%d")


def _append_delta(run_dir, verb, args):
    """`{run_dir}/facts-delta.json` as a growing JSON list of what ran here —
    never the apply-shaped delta object `apply` itself keeps, because these
    verbs are always handed a run directory of their own."""
    path = pathlib.Path(run_dir) / "facts-delta.json"
    doc = read_json(path) if path.exists() else []
    doc.append({"verb": verb, "args": args})
    write_json_atomic(path, doc)


def _under(path, base):
    try:
        pathlib.Path(path).resolve().relative_to(pathlib.Path(base).resolve())
        return True
    except ValueError:
        return False


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
    save_store(root, store)
    _append_delta(run_dir, "retire",
                  {"id": fact_id, "heir": heir, "date": entry["valid_to"]})


def promote(root, fact_id, kind, key, run_dir):
    """Move a note into a real kind, in place: the id stays, the kind and key
    change, and `data` is topped up with whatever bare structural keys that
    kind's schema requires and a note never carried. Only a note is
    promotable, and its hash key never carries over — `key` is always
    required."""
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
    save_store(root, store)
    _append_delta(run_dir, "promote", {"id": fact_id, "kind": kind, "key": key})


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
    if _under(out, root / "facts") or _under(out, root / "runs"):
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
