import argparse
import sys
from datetime import datetime, timezone

from engine_common import data_root, read_json, write_json_atomic
from merge import build_new, build_update, remove_process, resolve_pending


def _now(v):
    return v or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _proc_path(pid):
    dept = pid.rsplit("-", 1)[0]
    return data_root() / "departments" / dept / "processes" / f"{pid}.json"


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
    args = ap.parse_args(argv)

    try:
        if args.cmd == "new":
            _require(pathlib_exists(args.candidate), "candidate file must exist")
            parent, children = build_new(read_json(args.candidate), args.department,
                                         args.run, _now(args.now))
            write_json_atomic(_proc_path(parent["id"]), parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            print(parent["id"])
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
        elif args.cmd == "update":
            path = _proc_path(args.process)
            _require(path.is_file(), f"target process {args.process} must exist")
            _require(pathlib_exists(args.delta), "delta file must exist")
            parent, children = build_update(read_json(path), read_json(args.delta),
                                            args.run, _now(args.now))
            write_json_atomic(path, parent)
            for c in children:
                write_json_atomic(_proc_path(c["id"]), c)
            for c in children:
                print(f"subprocess {c['id']} node {c['parent']['node']}")
        elif args.cmd == "remove":
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = remove_process(read_json(path), _now(args.now))
            write_json_atomic(path, proc)
            print(f"tombstoned {args.process}")
        else:  # accept | reject
            path = _proc_path(args.process)
            _require(path.is_file(), f"process {args.process} must exist")
            proc = resolve_pending(read_json(path), args.index, args.cmd, _now(args.now))
            write_json_atomic(path, proc)
    except ValueError as e:
        print(f"merge: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0


def pathlib_exists(p):
    import pathlib
    return pathlib.Path(p).is_file()


if __name__ == "__main__":
    main()
