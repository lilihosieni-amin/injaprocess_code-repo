import argparse

from allocate_id import next_box_id, next_junction_id, next_process_id, peek_process_id
from engine_common import read_json


def main(argv=None):
    ap = argparse.ArgumentParser(prog="allocate-id")
    sub = ap.add_subparsers(dest="kind", required=True)
    p = sub.add_parser("process")
    p.add_argument("department")
    p.add_argument("--peek", action="store_true",
                   help="preview the next id without persisting the ledger")
    for kind in ("box", "junction"):
        s = sub.add_parser(kind)
        s.add_argument("process_file")
    args = ap.parse_args(argv)
    if args.kind == "process":
        fn = peek_process_id if args.peek else next_process_id
        print(fn(args.department))
    else:
        proc = read_json(args.process_file)
        print(next_box_id(proc) if args.kind == "box" else next_junction_id(proc))
    return 0
