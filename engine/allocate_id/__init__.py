import re

from engine_common import data_root


def next_process_id(dept, root=None, reserved=()):
    root = root or data_root()
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
    return f"{dept}-{mx + 1:03d}"


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
