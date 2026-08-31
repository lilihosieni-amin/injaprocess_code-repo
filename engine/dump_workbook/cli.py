"""`dump-workbook` — two passes over `DATA_ROOT/attachments/sheets/`.

`--init-manifest` runs before Gate M: it dumps every workbook's structure and
fills the manifest's mechanical columns, proposing nothing a person has to
judge. `--manifest` runs after Gate M: it dumps the same structure and, for the
tabs a **confirmed** row names in `reference_tabs[]`, their cells as `rows.tsv`.

A workbook file on disk with no manifest row, or an unconfirmed one, is a
precondition failure for `--manifest` (spec §3) — reported for every offending
file at once, before anything is written.
"""
import argparse
import sys

from dump_workbook import (
    dump_workbook,
    init_manifest,
    read_spreadsheet_id,
    structure_md_for,
    workbook_files,
)
from engine_common import data_root, read_json, validate


def _sheets_root():
    root = data_root() / "attachments" / "sheets"
    if not root.is_dir():
        print(f"dump-workbook: no {root}", file=sys.stderr)
        raise SystemExit(2)
    return root


def _read_manifest(sheets_root):
    path = sheets_root / "manifest.json"
    if not path.is_file():
        print(f"dump-workbook: no {path} — run --init-manifest first",
              file=sys.stderr)
        raise SystemExit(2)
    manifest = read_json(path)
    try:
        validate("manifest.schema.json", manifest)
    except ValueError as e:
        print(f"dump-workbook: {e}", file=sys.stderr)
        raise SystemExit(2)
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="dump-workbook",
        description="dump the structure of the sheets estate (spec Appendix C)")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--init-manifest", action="store_true",
                      help="dump structure and fill the manifest's mechanical "
                           "columns (before Gate M)")
    mode.add_argument("--manifest", action="store_true",
                      help="dump structure and the confirmed reference tabs' "
                           "cells (after Gate M)")
    args = ap.parse_args(argv)

    sheets_root = _sheets_root()
    dump_root = sheets_root / ".dump"
    books = workbook_files(sheets_root)

    reference_tabs = {}
    if args.manifest:
        manifest = _read_manifest(sheets_root)
        rows = {row["spreadsheetId"]: row for row in manifest["workbooks"]}
        failures = []
        for xlsx in books:
            row = rows.get(read_spreadsheet_id(structure_md_for(xlsx)))
            if row is None:
                failures.append(f"{xlsx.name}: no manifest row")
            elif not row.get("confirmed"):
                failures.append(f"{xlsx.name}: manifest row is not confirmed "
                                "(Gate M)")
            else:
                reference_tabs[xlsx] = row.get("reference_tabs") or []
        if failures:
            for line in failures:
                print(f"dump-workbook: {line}", file=sys.stderr)
            raise SystemExit(2)

    for xlsx in books:
        summary = dump_workbook(xlsx, structure_md_for(xlsx), dump_root,
                                reference_tabs=reference_tabs.get(xlsx, ()))
        print(f"{summary['spreadsheetId']}\t{xlsx.name}\t"
              f"{summary['meta']['sheet_count']} tabs")

    if args.init_manifest:
        manifest = init_manifest(sheets_root)
        unconfirmed = [row for row in manifest["workbooks"]
                       if not row.get("confirmed")]
        print(f"manifest: {len(manifest['workbooks'])} workbooks, "
              f"{len(unconfirmed)} awaiting Gate M")
    return 0


if __name__ == "__main__":
    sys.exit(main())
