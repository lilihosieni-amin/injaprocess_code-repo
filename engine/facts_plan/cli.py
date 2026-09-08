"""The `facts-plan` entry point (§2.1's stage table names every verb).

The parser lives here and the verb bodies live in `build.py` and
`assemble.py`, so an unlanded verb exits 2 with one line instead of leaving a
console script that cannot be installed.
"""
import argparse
import calendar
import importlib
import json
import os
import pathlib
import sys
import time

from engine_common import data_root, read_json, write_json_atomic
from merge_facts import sha256_file

VERBS = {"build": ("facts_plan.build", "build"),
         "digest": ("facts_plan.assemble", "digest"),
         "assemble": ("facts_plan.assemble", "assemble"),
         "report": ("facts_plan.assemble", "report"),
         "status": ("facts_plan.cli", "status"),
         "preflight": ("facts_plan.preflight", "preflight")}


def _parser():
    parser = argparse.ArgumentParser(prog="facts-plan")
    sub = parser.add_subparsers(dest="verb", required=True)
    build = sub.add_parser("build")
    build.add_argument("department")
    build.add_argument("--run", required=True)
    build.add_argument("--recordings", default="")
    # `--refresh-inputs` re-renders an existing run's inputs and `--rebuild`
    # replaces the plan; asking for both is asking for two different runs.
    how = build.add_mutually_exclusive_group()
    how.add_argument("--rebuild", action="store_true")
    how.add_argument("--refresh-inputs", action="store_true")
    # `preflight` builds into a scratch directory of its own, so it takes no
    # `--run`: the deterministic half of a first run, before any model.
    preflight = sub.add_parser("preflight")
    preflight.add_argument("department")
    preflight.add_argument("--recordings", default="")
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
    root = data_root()
    if args.verb == "preflight":
        result = verb(root, args.department,
                      [r for r in args.recordings.split(",") if r])
        for line in result.pop("lines"):
            print(f"facts-plan: {line}", file=sys.stderr)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 2 if result["engine_refused"] else 0
    run = pathlib.Path(args.run)
    if args.verb == "build" and args.refresh_inputs:
        from facts_plan.build import refresh_inputs
        result = refresh_inputs(root, run)
    elif args.verb == "build":
        result = verb(root, args.department, run,
                      [r for r in args.recordings.split(",") if r],
                      rebuild=args.rebuild)
    elif args.verb == "assemble":
        result = verb(root, run, review=args.review)
    elif args.verb == "status":
        result = verb(root, run, new_turn=args.new_turn)
    else:
        result = verb(root, run)
    if args.verb == "status":
        # The coordinator reads this table, not a JSON blob: one line per unit,
        # then the run's own line. `status()` still returns the dict.
        for unit in result["units"]:
            print(f'{unit["id"]} · {unit["type"]} · {unit["state"]} · '
                  f'{unit["attempts"]}')
        print(f'stage {result["stage"]} · '
              f'plan_stale {str(result["plan_stale"]).lower()} · '
              f'elapsed_s {result["elapsed_s"]} · '
              f'yield {str(result["yield"]).lower()}')
        return 0
    print(json.dumps(result, ensure_ascii=False, sort_keys=True)
          if isinstance(result, dict) else result)
    return 0


# --------------------------------------------------------------------------
# T13: `status` — stage 0 of §2.1, and the two preconditions `build` shares
# with it. Everything here is read back off the filesystem; the run records no
# state of its own beyond `turn.json`'s one timestamp.

YIELD_AFTER_S = 2400


def _epoch():
    """`SOURCE_DATE_EPOCH` when set, else the clock (§4) — the fixture tests
    move time by moving the variable, and a run never notices."""
    stamp = os.environ.get("SOURCE_DATE_EPOCH")
    return int(stamp) if stamp else int(time.time())


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(_epoch()))


def unit_states(root, run_dir, units, check=None):
    """Every unit's state, derived from the filesystem and nowhere else (§2.3).

    A truncated or unparseable attempt is **deleted** here and costs no
    attempt: a crashed dispatch must not spend one of the two a unit gets.
    `check(path) -> list[str]` is the validator; with none, it is
    `validate facts-unit`'s own pass, which is what makes `done` mean the
    output `assemble` will fold.
    """
    if check is None:
        from facts_plan.assemble import validate_unit
        def check(path):
            return validate_unit(root, run_dir, path)
    run_dir = pathlib.Path(run_dir)
    out = []
    for unit in units:
        attempts = []
        for path in sorted((run_dir / "units" / unit["id"]).glob("out.*.json")):
            try:
                read_json(path)
            except (OSError, ValueError):
                path.unlink(missing_ok=True)
                continue
            attempts.append(path)
        state = "pending"
        if attempts:
            problems = check(attempts[-1]) if check else []
            state = "done" if not problems else ("failed" if len(attempts) >= 2
                                                 else "pending")
        out.append({"id": unit["id"], "type": unit["type"], "state": state,
                    "attempts": len(attempts)})
    return out


def _stale(root, plan):
    """A dump or transcript that moved since `build` read it (§2.3)."""
    for rel, held in (plan or {}).get("hashes", {}).items():
        path = pathlib.Path(root) / rel
        if not path.is_file() or sha256_file(path) != held:
            return True
    return False


def _stage(run_dir, plan, states):
    """The resume ladder of §6, by artefact presence — nothing is recorded."""
    if plan is None:
        return "P"
    if any(s["state"] == "pending" for s in states):
        return "U"
    if not (run_dir / "facts-delta.json").is_file():
        return "R"
    if not (run_dir / "id-map.json").is_file():
        return "B"
    return "6"


def status(root, run_dir, *, new_turn=False):
    """§2.1 Stage 0 — the only engine output the coordinator reads."""
    run_dir = pathlib.Path(run_dir)
    turn = run_dir / "turn.json"
    if new_turn or not turn.is_file():
        write_json_atomic(turn, {"started_at": _now()})
    started = calendar.timegm(time.strptime(read_json(turn)["started_at"],
                                            "%Y-%m-%dT%H:%M:%SZ"))
    plan = read_json(run_dir / "plan.json") \
        if (run_dir / "plan.json").is_file() else None
    states = unit_states(root, run_dir, (plan or {}).get("units") or [])
    elapsed = _epoch() - started
    return {"stage": _stage(run_dir, plan, states), "units": states,
            "plan_stale": _stale(root, plan), "elapsed_s": elapsed,
            "yield": elapsed > YIELD_AFTER_S}


def check_rebuild(root, run_dir, rebuild):
    """§2.3 — a plan whose units have started is never silently replaced: the
    unit ids are a function of the estimate, so a re-estimate would renumber
    the directories a finished unit's output already sits in."""
    path = pathlib.Path(run_dir) / "plan.json"
    if rebuild or not path.is_file():
        return
    done = [u["id"] for u in unit_states(root, run_dir,
                                         read_json(path)["units"])
            if u["state"] == "done"]
    if done:
        print(f"facts-plan: {len(done)} unit(s) already done "
              f"({', '.join(done[:3])}); pass --rebuild to replace the plan",
              file=sys.stderr)
        raise SystemExit(2)
