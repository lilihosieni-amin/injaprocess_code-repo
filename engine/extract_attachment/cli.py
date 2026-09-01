import argparse
import sys

from extract_attachment import docx_to_text, run_extract_attachment  # noqa: F401


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract-attachment")
    ap.add_argument("department", nargs="?",
                     help="department name (process-voice Stage 5a's call shape)")
    ap.add_argument("--path", help="DATA_ROOT-relative root, instead of a department's "
                                    "attachments/ dir")
    args = ap.parse_args(argv)

    if bool(args.department) == bool(args.path):  # neither given, or both given
        print("error: give exactly one of department or --path", file=sys.stderr)
        return 2

    try:
        ok, errors = run_extract_attachment(args.department, path=args.path)
    except Exception as e:                # noqa: BLE001 - a structural precondition failure
        print(f"error: {e}", file=sys.stderr)
        return 2

    for path in ok:
        print(path)
    for name, msg in errors:
        print(f"skipped {name}: {msg}", file=sys.stderr)
    return 3 if errors else 0
