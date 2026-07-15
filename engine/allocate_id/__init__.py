import json
import re

from engine_common import data_root


def _id_seq_path(root, dept):
    return root / "departments" / dept / ".id-seq.json"


def _read_ledger(path):
    if path.is_file():
        try:
            return int(json.loads(path.read_text(encoding="utf-8")).get("process", 0))
        except (ValueError, OSError):
            return 0
    return 0


def _next_ordinal(dept, root, reserved):
    d = root / "departments" / dept / "processes"
    rx = re.compile(rf"^{re.escape(dept)}-(\d{{3}})$")
    mx = 0
    if d.is_dir():
        for f in d.glob("*.json"):
            m = rx.match(f.stem)
            if m:
                mx = max(mx, int(m.group(1)))
    for rid in reserved:
        m = rx.match(rid)
        if m:
            mx = max(mx, int(m.group(1)))
    return max(mx, _read_ledger(_id_seq_path(root, dept))) + 1


def peek_process_id(dept, root=None, reserved=()):
    """Stateless preview — does NOT persist the ledger."""
    root = root or data_root()
    return f"{dept}-{_next_ordinal(dept, root, reserved):03d}"


def next_process_id(dept, root=None, reserved=()):
    """Minter — allocates and persists the ledger high-water mark."""
    root = root or data_root()
    nxt = _next_ordinal(dept, root, reserved)
    ledger_path = _id_seq_path(root, dept)
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps({"process": nxt}) + "\n", encoding="utf-8")
    return f"{dept}-{nxt:03d}"


def _max_suffix(process, pattern):
    rx = re.compile(pattern)
    mx = 0
    for n in process.get("nodes", []):
        m = rx.match(n.get("id", ""))
        if m:
            mx = max(mx, int(m.group(1)))
    return mx


def next_box_id(process, pid=None):
    pid = pid or process["id"]
    mx = _max_suffix(process, rf"^{re.escape(pid)}-n(\d{{3}})$")
    return f"{pid}-n{mx + 1:03d}"


def next_junction_id(process, pid=None):
    pid = pid or process["id"]
    mx = _max_suffix(process, rf"^{re.escape(pid)}-j(\d+)$")
    return f"{pid}-j{mx + 1}"
