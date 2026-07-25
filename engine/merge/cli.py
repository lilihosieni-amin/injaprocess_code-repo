import argparse
import sys
from datetime import datetime, timezone

from engine_common import data_root, read_json, write_json_atomic
from merge import (attach_subprocess, build_new, build_update, remove_process,
                   resolve_pending, restructure)
from order import reconcile as reconcile_order


def _now(v):
    return v or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dept_of(pid):
    return pid.rsplit("-", 1)[0]


def _proc_path(pid):
    return data_root() / "departments" / _dept_of(pid) / "processes" / f"{pid}.json"


def _sync_order(depts, now, heir_hints=None, child_hints=None):
    """Keep each touched department's order.json equal to its active set (§4.6).

    A failure here warns on stderr and lets the merge stand; it must never
    propagate. By the time we reach the sync the process files are written and
    the id ledger has advanced, so raising would let the `except ValueError` in
    `main` report a *fully applied* merge as exit 2 — this CLI's "precondition
    failed, nothing happened" code (see `_require`). A pipeline that retries on
    exit 2 would then re-run the verb and mint a duplicate process. Every
    realistic failure lands there: a corrupt order.json (`json.JSONDecodeError`
    is a `ValueError`), `read_order`'s malformed-shape `ValueError`, and
    `validate`'s.

    order.json is derived state — `order sync <dept>` rebuilds it from disk, and
    an unreadable one can simply be deleted first — so a warning still leaves a
    complete recovery path. It has to, because the hook widened merge's read
    surface: `active_ids` reads *every* process file in the department, so
    without this one corrupt sibling would make every merge verb in that
    department fatal.
    """
    for dept in sorted(depts):
        try:
            reconcile_order(dept, now, heir_hints=heir_hints, child_hints=child_hints)
        except (ValueError, OSError) as e:
            print(f"merge: warning: the merge is applied but {dept}'s order.json "
                  f"could not be synced: {e}\n"
                  f"merge: run `order sync {dept}` to rebuild it; order.json is "
                  f"derived state, so deleting an unreadable one first is safe",
                  file=sys.stderr)


def _require(cond, msg):
    if not cond:
        print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="merge")
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("new")
    n.add_argument("--candidate", required=True)
    n.add_argument("--department", required=True)
    n.add_argument("--run", required=True)
    n.add_argument("--now")
    u = sub.add_parser("update")
    u.add_argument("--process", required=True)
    u.add_argument("--delta", required=True)
    u.add_argument("--run", required=True)
    u.add_argument("--now")
    for name in ("accept", "reject"):
        r = sub.add_parser(name)
        r.add_argument("--process", required=True)
        r.add_argument("--index", type=int, required=True)
        r.add_argument("--now")
    rm = sub.add_parser("remove")
    rm.add_argument("--process", required=True)
    rm.add_argument("--run", required=True)
    rm.add_argument("--now")
    rs = sub.add_parser("restructure")
    rs.add_argument("--plan", required=True)
    rs.add_argument("--run", required=True)
    rs.add_argument("--now")
    at = sub.add_parser("attach-subprocess")
    at.add_argument("--parent-process", required=True)
    at.add_argument("--node", required=True)
    at.add_argument("--child", required=True)
    at.add_argument("--run", required=True)
    at.add_argument("--now")
    args = ap.parse_args(argv)

    # One clock for the whole invocation: the process files and order.json must
    # not land a second apart when --now is omitted.
    now = _now(args.now)

    try:
        if args.cmd == "new":
            _require(pathlib_exists(args.candidate), "candidate file must exist")
            parent, children = build_new(read_json(args.candidate), args.department,
                                         args.run, now)
            write_json_atomic(_proc_path(parent["id"]), parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            print(parent["id"])
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
            _sync_order({args.department}, now)
        elif args.cmd == "update":
            path = _proc_path(args.process)
            _require(path.is_file(), f"target process {args.process} must exist")
            _require(pathlib_exists(args.delta), "delta file must exist")
            parent, children = build_update(read_json(path), read_json(args.delta),
                                            args.run, now)
            write_json_atomic(path, parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
            depts = ({_dept_of(parent["id"])}
                     | {_dept_of(c["id"]) for c in children})
            _sync_order(depts, now,
                        child_hints={parent["id"]: [c["id"] for c in children]})
        elif args.cmd == "remove":
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = remove_process(read_json(path), now)
            write_json_atomic(path, proc)
            print(f"tombstoned {args.process}")
            _sync_order({_dept_of(args.process)}, now)
        elif args.cmd == "restructure":
            _require(pathlib_exists(args.plan), "plan file must exist")
            heirs, tombstoned = restructure(read_json(args.plan), args.run, now)
            for h in heirs:
                write_json_atomic(_proc_path(h["id"]), h)
                print(f"heir {h['id']}")
            for t in tombstoned:
                write_json_atomic(_proc_path(t["id"]), t)
                print(f"tombstoned {t['id']}")
            for h in heirs:
                for n in h["nodes"]:
                    if n.get("type") == "activity" and n.get("subprocess"):
                        print(f"subprocess {n['subprocess']} node {n['id']}")
            # a heir inherits the position of the earliest process it supersedes
            heir_hints = {}
            for t in tombstoned:
                for heir in t.get("superseded_by", []):
                    heir_hints.setdefault(heir, []).append(t["id"])
            depts = ({_dept_of(h["id"]) for h in heirs}
                     | {_dept_of(t["id"]) for t in tombstoned})
            _sync_order(depts, now, heir_hints=heir_hints)
        elif args.cmd == "attach-subprocess":
            pp = _proc_path(args.parent_process)
            cp = _proc_path(args.child)
            _require(pp.is_file(), f"parent process {args.parent_process} must exist")
            _require(cp.is_file(), f"child process {args.child} must exist")
            parent, child = attach_subprocess(read_json(pp), args.node, read_json(cp),
                                              args.run, now)
            write_json_atomic(pp, parent)
            write_json_atomic(cp, child)
            print(f"subprocess {child['id']} node {args.node}")
            _sync_order({_dept_of(args.parent_process), _dept_of(args.child)}, now)
        else:  # accept | reject
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = resolve_pending(read_json(path), args.index, args.cmd, now)
            write_json_atomic(path, proc)
            _sync_order({_dept_of(args.process)}, now)
    except ValueError as e:
        print(f"merge: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0


def pathlib_exists(p):
    import pathlib
    return pathlib.Path(p).is_file()


if __name__ == "__main__":
    main()
