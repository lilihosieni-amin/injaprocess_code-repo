import argparse
import sys

from extract_attachment import docx_to_text, run_extract_attachment  # noqa: F401


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract-attachment")
    ap.add_argument("department")
    args = ap.parse_args(argv)
    ok, errors = run_extract_attachment(args.department)
    for path in ok:
        print(path)
    for name, msg in errors:
        print(f"skipped {name}: {msg}", file=sys.stderr)
    return 1 if errors else 0
