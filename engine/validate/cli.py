import argparse
import sys

from engine_common import read_json, schema_dir, validate


def main(argv=None):
    ap = argparse.ArgumentParser(prog="validate")
    ap.add_argument("schema", help="schema name, e.g. 'segments' or 'segments.schema.json'")
    ap.add_argument("file", help="path to the JSON file to validate")
    args = ap.parse_args(argv)
    name = args.schema if args.schema.endswith(".schema.json") else f"{args.schema}.schema.json"
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
    print(f"OK: {args.file} conforms to {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
