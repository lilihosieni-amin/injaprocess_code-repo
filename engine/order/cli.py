import argparse
import sys
from datetime import datetime, timezone

from order import (OrderMismatch, check, departments, move, read_order,
                   reconcile, set_order)


def _now(v):
    return v or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _targets(args):
    return departments() if args.all else [args.department]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="order")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sh = sub.add_parser("show")
    sh.add_argument("department")

    sy = sub.add_parser("sync")
    sy.add_argument("department", nargs="?")
    sy.add_argument("--all", action="store_true")
    sy.add_argument("--now")

    st = sub.add_parser("set")
    st.add_argument("department")
    st.add_argument("--sequence", required=True,
                    help="comma-separated process ids, in the wanted order")
    st.add_argument("--now")

    mv = sub.add_parser("move")
    mv.add_argument("department")
    mv.add_argument("--process", required=True)
    mv.add_argument("--to", type=int, required=True, help="1-based position")
    mv.add_argument("--now")

    ck = sub.add_parser("check")
    ck.add_argument("department", nargs="?")
    ck.add_argument("--all", action="store_true")

    args = ap.parse_args(argv)
    if args.cmd in ("sync", "check") and not args.all and not args.department:
        print("order: give a department or --all", file=sys.stderr)
        raise SystemExit(2)

    try:
        if args.cmd == "show":
            for pid in read_order(args.department):
                print(pid)
        elif args.cmd == "sync":
            for dept in _targets(args):
                appended, dropped = reconcile(dept, _now(args.now))
                for pid in appended:
                    print(f"+{pid}")
                for pid in dropped:
                    print(f"-{pid}")
        elif args.cmd == "set":
            seq = [s for s in args.sequence.split(",") if s]
            set_order(args.department, seq, _now(args.now))
        elif args.cmd == "move":
            move(args.department, args.process, args.to, _now(args.now))
        else:  # check
            drifted = False
            for dept in _targets(args):
                missing, stale = check(dept)
                if missing or stale:
                    drifted = True
                    print(f"{dept} missing: {','.join(missing) or '-'} "
                          f"stale: {','.join(stale) or '-'}", file=sys.stderr)
            if drifted:
                raise SystemExit(2)
    except OrderMismatch as e:
        # message already starts with "set mismatch:" — the UI backend keys on it
        print(str(e), file=sys.stderr)
        raise SystemExit(2)
    except ValueError as e:
        print(f"order: {e}", file=sys.stderr)
        raise SystemExit(2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
