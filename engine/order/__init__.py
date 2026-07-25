"""Per-department curated process order (ARD §4.6).

The sole writer of `departments/<dept>/order.json`. The file holds exactly the
department's active (non-tombstoned) process ids; position is the array index.
`merge` calls `reconcile` in-process after every verb, and the `order` CLI
exposes the same operations for the UI backend and for ops.
"""
import re

from engine_common import data_root, read_json, validate, write_json_atomic

_PID_RE = re.compile(r"^[a-z]+-\d{3}$")


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
    return list(read_json(path).get("order", []))


def active_ids(dept, root=None):
    """Every non-tombstoned process id in the department, in id order."""
    root = root or data_root()
    d = root / "departments" / dept / "processes"
    if not d.is_dir():
        return []
    out = []
    for f in sorted(d.glob("*.json")):
        if not _PID_RE.match(f.stem):
            continue
        if read_json(f).get("tombstoned"):
            continue
        out.append(f.stem)
    return out


def departments(root=None):
    """The department codes, in registry order."""
    root = root or data_root()
    reg = read_json(root / "departments" / "registry.json")
    return [d["code"] for d in reg["departments"]]


def _dedup(seq):
    seen = set()
    return [p for p in seq if not (p in seen or seen.add(p))]


def _write(dept, sequence, now, root):
    doc = {"department": dept, "order": list(sequence), "updated_at": now}
    validate("order.schema.json", doc)
    write_json_atomic(_order_path(root, dept), doc)
    return doc["order"]


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
    stored = _dedup(read_order(dept, root))

    work = list(stored)
    missing = [pid for pid in actives if pid not in set(work)]
    work.extend(missing)

    seq = [pid for pid in work if pid in known]
    dropped = [pid for pid in stored if pid not in known]
    was = set(stored)
    appended = [pid for pid in seq if pid not in was]
    _write(dept, seq, now, root)
    return appended, dropped


def set_order(dept, sequence, now, root=None):
    """Replace the whole sequence; refuse anything but the exact active set."""
    root = root or data_root()
    actives = active_ids(dept, root)
    given = list(sequence)
    if len(set(given)) != len(given):
        raise OrderMismatch("set mismatch: duplicate ids in sequence")
    missing = [p for p in actives if p not in set(given)]
    stale = [p for p in given if p not in set(actives)]
    if missing or stale:
        raise OrderMismatch(
            f"set mismatch: missing={','.join(missing) or '-'} "
            f"stale={','.join(stale) or '-'}")
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
    return ([p for p in actives if p not in set(stored)],
            [p for p in stored if p not in set(actives)])
