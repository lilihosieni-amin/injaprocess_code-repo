"""Per-department curated process order (ARD §4.6).

The sole writer of `departments/<dept>/order.json`. The file holds exactly the
department's active (non-tombstoned) process ids; position is the array index.
`merge` calls `reconcile` in-process after every verb, and the `order` CLI
exposes the same operations for the UI backend and for ops.
"""
import re

from engine_common import data_root, read_json, validate, write_json_atomic


class OrderMismatch(ValueError):
    """A given sequence is not exactly the department's active set.

    The message always starts with `set mismatch:` so callers (the CLI, and
    through it the UI backend) can tell this apart from a schema failure.
    """


def _order_path(root, dept):
    return root / "departments" / dept / "order.json"


def read_order(dept, root=None):
    """The stored sequence, or [] when the department has no order.json yet."""
    root = root or data_root()
    path = _order_path(root, dept)
    if not path.is_file():
        return []
    doc = read_json(path)
    if "order" not in doc:
        return []
    seq = doc["order"]
    if not isinstance(seq, list) or not all(isinstance(p, str) for p in seq):
        raise ValueError(f"{path}: 'order' must be a list of process id strings")
    return list(seq)


def active_ids(dept, root=None):
    """Every non-tombstoned process id in the department, in id order."""
    root = root or data_root()
    d = root / "departments" / dept / "processes"
    if not d.is_dir():
        return []
    rx = re.compile(rf"^{re.escape(dept)}-\d{{3}}$")
    out = []
    for f in sorted(d.glob("*.json")):
        if not rx.match(f.stem):
            continue
        if read_json(f).get("tombstoned"):
            continue
        out.append(f.stem)
    return out


def departments(root=None):
    """The department codes, in registry order."""
    root = root or data_root()
    reg = read_json(root / "departments" / "registry.json")
    try:
        return [d["code"] for d in reg["departments"]]
    except (KeyError, TypeError) as e:
        raise ValueError(f"malformed registry.json: {e}") from e


def _dedup(seq):
    seen = set()
    return [p for p in seq if not (p in seen or seen.add(p))]


def _write(dept, sequence, now, root):
    doc = {"department": dept, "order": list(sequence), "updated_at": now}
    validate("order.schema.json", doc)
    write_json_atomic(_order_path(root, dept), doc)
    return doc["order"]


def _lowest_index(work, candidates):
    idxs = [work.index(c) for c in candidates if c in work]
    return min(idxs) if idxs else None


def reconcile(dept, now, root=None, heir_hints=None, child_hints=None):
    """Bring order.json in line with disk. Returns (appended, dropped).

    Appends actives that are missing from the file and drops ids that are
    tombstoned or gone. Idempotent, so it is safe to call after every merge
    verb. `heir_hints` and `child_hints` refine *where* new ids land; see
    Task 4 / design §3.1.
    """
    root = root or data_root()
    actives = active_ids(dept, root)
    known = set(actives)
    raw = read_order(dept, root)
    stored = _dedup(raw)
    was = set(stored)

    # Insertions happen on `work`, which still holds the ids about to be dropped,
    # so a heir can be placed at its predecessor's index before that id leaves.
    work = list(stored)
    present = set(work)
    missing = [pid for pid in actives if pid not in present]

    # Pass 1 — a heir inherits the lowest index held by anything it supersedes.
    # Sorted by heir id so several heirs of one predecessor land consecutively and
    # deterministically: each insert shifts the predecessor right, so the next
    # heir lands just after the previous one.
    for heir in sorted(heir_hints or {}):
        if heir not in missing:
            continue
        at = _lowest_index(work, heir_hints[heir])
        if at is None:
            continue
        work.insert(at, heir)
        missing.remove(heir)

    # Pass 2 — a new sub-process sits directly after its parent.
    for parent in sorted(child_hints or {}):
        if parent not in work:
            continue
        at = work.index(parent) + 1
        for child in sorted(child_hints[parent]):
            if child not in missing:
                continue
            work.insert(at, child)
            at += 1
            missing.remove(child)

    # Pass 3 — anything still unplaced goes to the end, in id order.
    work.extend(missing)

    seq = [pid for pid in work if pid in known]
    dropped = [pid for pid in stored if pid not in known]
    appended = [pid for pid in seq if pid not in was]

    path = _order_path(root, dept)
    # Lazy: a department with no processes and no file yet stays fileless (ARD §4.6).
    if not seq and not path.is_file():
        return [], []
    # Don't churn updated_at when nothing changed. Compared against the RAW file
    # contents, not the de-duplicated view, so a hand-edited duplicate still heals.
    if seq == raw and path.is_file():
        return [], []
    _write(dept, seq, now, root)
    return appended, dropped


def set_order(dept, sequence, now, root=None):
    """Replace the whole sequence; refuse anything but the exact active set."""
    root = root or data_root()
    actives = active_ids(dept, root)
    given = list(sequence)
    seen = set(given)
    if len(seen) != len(given):
        raise OrderMismatch("set mismatch: duplicate ids in sequence")
    known = set(actives)
    missing = [p for p in actives if p not in seen]
    stale = [p for p in given if p not in known]
    if missing or stale:
        raise OrderMismatch(
            f"set mismatch: missing={','.join(missing) or '-'} "
            f"stale={','.join(stale) or '-'}")
    # Lazy, exactly as in `reconcile`: a department with no processes and no file
    # yet stays fileless (ARD §4.6). Without this, saving the empty reorder panel
    # writes `{"order": []}` and reconcile's no-churn guard then keeps it forever.
    if not given and not actives and not _order_path(root, dept).is_file():
        return []
    return _write(dept, given, now, root)


def move(dept, pid, to, now, root=None):
    """Move `pid` to 1-based position `to`, shifting the rest."""
    root = root or data_root()
    seq = _dedup(read_order(dept, root))
    if pid not in seq:
        raise ValueError(f"{pid} is not in {dept}'s order")
    if not 1 <= to <= len(seq):
        raise ValueError(f"position {to} is out of range 1..{len(seq)}")
    seq.remove(pid)
    seq.insert(to - 1, pid)
    return _write(dept, seq, now, root)


def check(dept, root=None):
    """(missing, stale) — an empty pair means the file equals the active set."""
    root = root or data_root()
    actives = active_ids(dept, root)
    stored = read_order(dept, root)
    have = set(stored)
    known = set(actives)
    return ([p for p in actives if p not in have],
            [p for p in stored if p not in known])
