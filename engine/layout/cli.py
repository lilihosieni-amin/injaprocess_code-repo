import argparse

from engine_common import read_json, validate, write_json_atomic
from layout import full_relayout, local_relayout, topo_order


def main(argv=None):
    ap = argparse.ArgumentParser(prog="layout")
    ap.add_argument("process_file")
    ap.add_argument("--from-node", default=None)
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args(argv)
    proc = read_json(args.process_file)
    if args.full or args.from_node is None:
        full_relayout(proc)
    else:
        order = topo_order(proc["nodes"], proc["edges"])
        local_relayout(proc, order.index(args.from_node))
    validate("process.schema.json", proc)
    write_json_atomic(args.process_file, proc)
    return 0
