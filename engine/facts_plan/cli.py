"""The `facts-plan` entry point (§2.1's stage table names every verb).

The parser lives here and the verb bodies live in `build.py` and
`assemble.py`, so an unlanded verb exits 2 with one line instead of leaving a
console script that cannot be installed.
"""
import argparse
import importlib
import json
import pathlib
import sys

from engine_common import data_root

VERBS = {"build": ("facts_plan.build", "build"),
         "digest": ("facts_plan.assemble", "digest"),
         "assemble": ("facts_plan.assemble", "assemble"),
         "report": ("facts_plan.assemble", "report"),
         "status": ("facts_plan.cli", "status")}


def _parser():
    parser = argparse.ArgumentParser(prog="facts-plan")
    sub = parser.add_subparsers(dest="verb", required=True)
    build = sub.add_parser("build")
    build.add_argument("department")
    build.add_argument("--run", required=True)
    build.add_argument("--recordings", default="")
    build.add_argument("--rebuild", action="store_true")
    for name in ("digest", "assemble", "report", "status"):
        verb = sub.add_parser(name)
        verb.add_argument("--run", required=True)
    sub.choices["assemble"].add_argument("--review", action="store_true")
    sub.choices["status"].add_argument("--new-turn", action="store_true")
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    module, name = VERBS[args.verb]
    verb = getattr(importlib.import_module(module), name, None)
    if verb is None:
        print(f"facts-plan {args.verb}: not implemented in this build",
              file=sys.stderr)
        return 2
    root, run = data_root(), pathlib.Path(args.run)
    if args.verb == "build":
        result = verb(root, args.department, run,
                      [r for r in args.recordings.split(",") if r],
                      rebuild=args.rebuild)
    elif args.verb == "assemble":
        result = verb(root, run, review=args.review)
    elif args.verb == "status":
        result = verb(root, run, new_turn=args.new_turn)
    else:
        result = verb(root, run)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True)
          if isinstance(result, dict) else result)
    return 0
