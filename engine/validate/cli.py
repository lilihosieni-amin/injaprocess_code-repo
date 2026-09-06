import argparse
import sys

from engine_common import data_root, read_json, schema_dir, validate
from merge_facts.apply import simulate
from merge_facts.content import check_document, group_messages

# spec §12's `validate facts` paragraph: "need no engine change beyond a
# content pass after the schema". The schema name (already normalised to its
# `.schema.json` form below) maps onto `check_document`'s `kind_of_file`.
CONTENT_PASS_SCHEMAS = {"facts.schema.json": "facts",
                        "facts-delta.schema.json": "facts-delta"}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="validate")
    ap.add_argument("schema", help="schema name, e.g. 'segments' or 'segments.schema.json'")
    ap.add_argument("file", help="path to the JSON file to validate")
    ap.add_argument("--store", action="store_true",
                    help="facts-delta only: apply it in memory and validate "
                         "the store it would write")
    ap.add_argument("--run", help="the run directory the delta would be "
                                  "applied into (required with --store)")
    args = ap.parse_args(argv)
    name = args.schema if args.schema.endswith(".schema.json") else f"{args.schema}.schema.json"
    if args.store and (name != "facts-delta.schema.json" or not args.run):
        print("validate: --store takes facts-delta and --run <run_dir>",
              file=sys.stderr)
        raise SystemExit(2)
    try:
        instance = read_json(args.file)
    except FileNotFoundError:
        print(f"validate: file not found: {args.file}", file=sys.stderr)
        raise SystemExit(2)
    try:
        validate(name, instance)  # loads schema_dir()/name; raises ValueError on mismatch
    except FileNotFoundError:
        print(f"validate: unknown schema '{name}' in {schema_dir()}", file=sys.stderr)
        raise SystemExit(2)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(2)
    kind_of_file = CONTENT_PASS_SCHEMAS.get(name)
    if kind_of_file:
        if args.store:
            # `simulate`'s own precondition pass runs `check_document` WITH the
            # store, which is strictly the better answer, so the standalone
            # pass is skipped rather than reported twice (§4).
            _store_after, findings = simulate(data_root(), args.file, args.run)
            findings = group_messages(findings)
        else:
            findings = check_document(instance, kind_of_file)
        if findings:
            for msg in findings:
                print(msg, file=sys.stderr)
            raise SystemExit(2)          # same failure surface as a schema mismatch
    print(f"OK: {args.file} conforms to {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
