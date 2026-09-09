"""The precondition pass — every problem the whole delta must have none of,
found before the first byte is written (QF-2, spec §12 row 1).

Lifted out of `apply.py` unchanged (v3 §4) for one reason: `validate
facts-delta --store --run` runs the same pass over the same store shape and
must not import the writer to do it. `apply` imports from here and never the
other way round, so there is no cycle to manage.

The helpers came along because the pass is the only thing that needs them —
`_lookup`, `_is_stub`, `_declared_fields`, `_declared_rows` and the
`FACT_ID_RE`/`TEMP_ID_RE`/`UNITS_KEY`/`UNKNOWN_UNIT`/`PACK_KEYS` constants.
Four of those names are read off `merge_facts.apply` by `audit.py` and one by
`test_merge_facts_verbs.py`; `apply` imports them from here, which re-exports
them, so no caller changes.
"""
import pathlib
import re

from engine_common import read_json
from merge_facts import (KEY_RE, KIND_ORDER, PROC_ID_RE, _sheet_identities,
                         canonical_scope, collect_leaves, find_match, is_open,
                         iter_ref_objects)
from merge_facts.content import check_document
from merge_facts.conventions import load as load_conventions

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


def undeclared_unit_problems(entry, unit_rows, label):
    """QF-40's message for every unit symbol no row of the units record
    declares. Shared with `verbs.edit`'s store gate (v3.7 §2.3 item 4), which
    checks the same rule on an entry a chat instruction just rewrote — one
    writer of the sentence, so the two can never say it differently."""
    return [f"{label}: unit {symbol!r} is declared by no row of the units record"
            for symbol in _unit_symbols(entry) if symbol not in unit_rows]


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
    # `canonical_scope` rather than `entry["scope"][...]`: a delta's entry has
    # been canonicalised by the time this pass runs, but the STORE entry the
    # instance guard below compares against has only the schema's word for it,
    # and the schema requires neither half of `scope`.
    scope = canonical_scope(entry.get("scope"))
    return (entry["kind"], entry.get("key"),
            tuple(scope["departments"]), tuple(scope["branches"]))


#: An estate workbook — the one citation whose absence is not a failure.
#: `.xlsx` exactly, and not "anything under `attachments/sheets/`": the `.gs`
#: scripts and the `.structure.md` dumps live in git beside the binary (QF-44
#: tags them), so only the binary is server-local.
_ESTATE_BINARY = re.compile(r"^attachments/sheets/.+\.xlsx$")


def _source_path_problems(root, entry, label):
    """QF-5's own sentence, finally enforced: *"`ref` is a path relative to
    `data-repo/`… any other unresolvable path fails `apply`"*.

    Nothing implemented it, and `_hash_of` quietly answers `null` for a file
    that is not there — so a citation that named no file at all was written,
    hashed as nothing, and only failed years later at the one place it is
    used. The owner's report of 2026-09-06 is that place: «the worksheets
    aren't downloadable», because `GET /api/facts/source` resolves a ref
    against three roots and a bare Google Drive id is inside none of them.
    575 stored citations carry an id where a path belongs, and 23 more carry a
    path missing its `attachments/sheets/` root.

    `accounts[].source` is checked beside `source[]`: it is the evidence for
    one side of a dispute, drawn on the same screen and fetched through the
    same route, so a broken one fails in exactly the same way.

    Containment as well as existence — a `ref` of `../../etc/passwd` that
    happens to exist is not a citation into this repo.
    """
    problems = []
    sources = list(entry.get("source") or [])
    sources += [a.get("source") for a in entry.get("accounts") or []
                if isinstance(a, dict)]
    for src in sources:
        if not isinstance(src, dict):
            continue
        ref = src.get("ref")
        if not isinstance(ref, str) or not ref:
            continue                      # `chat` cites no file, and says so
        if _ESTATE_BINARY.match(ref):
            continue
        try:
            target = (root / ref).resolve()
            inside = target.is_relative_to(root.resolve()) and target.exists()
        except (ValueError, OSError):
            inside = False
        if not inside:
            problems.append(f"{label}: source ref {ref!r} names no file in "
                            f"this repo — a ref is a path relative to "
                            f"data-repo (QF-5)")
    return problems


def process_source_problems(root, entry):
    """I3 at the source side: a `source[]` member of type `process` whose file
    is tombstoned or gone. One line per member, unprefixed — the caller adds
    the label, because the same check runs under the unit's decision labels at
    the gate and under the entry's id in the pass below (I1).

    `audit._process_link` reports the same two facts as findings on an entry
    already in the store, where a re-point is the answer; here the citation has
    not been written yet, so it is a refusal.
    """
    # `accounts[].source` is walked beside `source[]` for the reason
    # `_source_path_problems` walks it: it is the evidence for one side of a
    # dispute, drawn on the same screen and fetched through the same route.
    out = []
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
        process_id = pathlib.PurePosixPath(ref).stem
        try:
            doc = read_json(pathlib.Path(root) / ref)
        except (OSError, ValueError):
            out.append(f"{where}: process {process_id} has no file")
            continue
        if doc.get("tombstoned"):
            out.append(f"{where}: process {process_id} is tombstoned")
    return out


def preconditions(root, store, entries, run_dir):
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
        for ident in _sheet_identities(entry):
            if ident in sheets:
                out.append(f"duplicate sheet identity {ident[0]}/{ident[1]} in delta")
            sheets.add(ident)
    # QF-43: a run creates only in its own department, or at empty scope. It
    # may still *add* to any entry it matches — that is how a cross-department
    # contradiction surfaces, which is QF-2's whole point.
    run_dept = pathlib.Path(run_dir).parent.name
    by_temp = {e["id"]: e for e in entries if e.get("id")}
    unit_rows = _unit_row_keys(store, entries)
    # §3.2: one open record per instance. `find_match` answers None for an
    # instance match under another key so `apply` never renames — which would
    # leave it free to MINT a second record on the same tab, so the refusal
    # lands here instead, naming both. A stub is exempt: filling it is exactly
    # how a tab acquires its real key (QF-20).
    held_by = {ident: e for e in store["record"]["entries"] if is_open(e)
               for ident in _sheet_identities(e)}
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
        out.extend(undeclared_unit_problems(entry, unit_rows, label))    # QF-40
        match = find_match(store, entry)
        if match is None:
            if not set(entry["scope"]["departments"]) <= {run_dept}:  # QF-43
                out.append(f"entry {entry.get('key')} scoped to another department")
            twin = _title_twin(store, entry)                          # QF-34
            if twin is not None:
                out.append(f"{label}: title {entry.get('title')!r} is already "
                           f"{twin['id']}'s in this kind and scope")
        elif match["key"] != entry["key"] and not _is_stub(match):
            out.append(f"{label}: keys are immutable — {match['id']} is keyed "
                       f"{match['key']!r}, this delta carries {entry['key']!r}")
        for ident in _sheet_identities(entry):
            other = held_by.get(ident)
            if other is None or _is_stub(other) or other is match:
                continue
            if _natural_key(other) != _natural_key(entry):
                out.append(f"{label}: tab {ident[0]}/{ident[1]} already belongs "
                           f"to {other['id']} ({other['key']!r}) — keys are "
                           f"immutable (QF-34)")
        out.extend(_reference_problems(store, by_temp, entry, label))
        out.extend(_source_path_problems(root, entry, label))
        out.extend(f"{label}: {p}" for p in process_source_problems(root, entry))
    # Task 9: the content pass runs once over the whole delta (its checks are
    # document-wide — e.g. an intra-file unit edge needs the sibling entry),
    # on `entries` as they stand HERE: canonical scope applied, row keys
    # derived and `refItems` cells already substituted by `_derive_keys`, but
    # `{ref}` objects still carrying temp ids (`_rewrite_refs` runs later) —
    # exactly the shape every other precondition above already reasons about.
    # `store` (Task 9 review, F1/F2) lets the expr check's `calls[]` and
    # aggregate-table-column resolution reach an entry from an EARLIER
    # applied delta, not just this one — the common QF-12 shared-function case.
    # `unit_rows` is the same list `build.unit_symbols` writes into
    # `skeleton.json` and `validate facts-unit` lints against (QF-40): without
    # it here a statement naming a declared symbol passes both earlier gates
    # and is refused only at Stage V, spending the unit's second attempt on a
    # sentence that was never wrong. `audit._lint_failures` already passes them.
    out.extend(check_document({"schema_version": 1, "entries": entries},
                              "facts-delta", store, unit_symbols=unit_rows,
                              conventions=load_conventions(root)))
    return out
