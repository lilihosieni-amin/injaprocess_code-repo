import argparse

from engine_common import read_json

from allocate_id import next_box_id, next_junction_id, next_process_id


def main(argv=None):
    ap = argparse.ArgumentParser(prog="allocate-id")
    sub = ap.add_subparsers(dest="kind", required=True)
    p = sub.add_parser("process")
    p.add_argument("department")
    for kind in ("box", "junction"):
        s = sub.add_parser(kind)
        s.add_argument("process_file")
    args = ap.parse_args(argv)
    if args.kind == "process":
        print(next_process_id(args.department))
    else:
        proc = read_json(args.process_file)
        print(next_box_id(proc) if args.kind == "box" else next_junction_id(proc))
    return 0
