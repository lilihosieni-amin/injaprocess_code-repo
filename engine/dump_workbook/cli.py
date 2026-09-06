"""`dump-workbook` — two passes over `DATA_ROOT/attachments/sheets/`.

`--init-manifest` runs before Gate M: it dumps every workbook's structure and
fills the manifest's mechanical columns, proposing nothing a person has to
judge. `--manifest` runs after Gate M: it dumps the same structure and, for the
tabs a **confirmed** row names in `reference_tabs[]`, their cells as `rows.tsv`.

A workbook whose manifest row is still unresolved is warned about and skipped:
Gate M never blocks a run (§2.2). A workbook file with no manifest row at all
is still a precondition failure for `--manifest`, reported for every offending
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


def _confirmed_reference_tabs(sheets_root, books):
    """`{xlsx: reference_tabs}` for the rows a person has already confirmed.

    Read leniently and never validated: `--init-manifest` is the pass that
    repairs the manifest, so a manifest it cannot read is a reason to dump
    nothing extra, not a reason to refuse.
    """
    path = sheets_root / "manifest.json"
    if not path.is_file():
        return {}
    try:
        rows = {row["spreadsheetId"]: row
                for row in read_json(path)["workbooks"] if row.get("confirmed")}
    except (ValueError, KeyError, TypeError):
        return {}
    out = {}
    for xlsx in books:
        row = rows.get(read_spreadsheet_id(structure_md_for(xlsx)))
        if row and row.get("reference_tabs"):
            out[xlsx] = row["reference_tabs"]
    return out


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
    if args.init_manifest:
        # Gate M has not run for the workbooks this pass is here for — but if it
        # ran for others, their reference tabs are re-dumped rather than left
        # behind: a directory holding a fresh `sheets.json` and a `rows.tsv`
        # from an older file is worse than one holding neither.
        reference_tabs = _confirmed_reference_tabs(sheets_root, books)
    if args.manifest:
        manifest = _read_manifest(sheets_root)
        rows = {row["spreadsheetId"]: row for row in manifest["workbooks"]}
        failures, skipped = [], []
        for xlsx in books:
            row = rows.get(read_spreadsheet_id(structure_md_for(xlsx)))
            if row is None:
                # Not a question anybody has been asked — the manifest is stale
                # and `--init-manifest` is the pass that repairs it.
                failures.append(f"{xlsx.name}: no manifest row")
            elif row.get("unresolved") or not row.get("confirmed"):
                print(f"dump-workbook: warning: {xlsx.name} skipped (unresolved)",
                      file=sys.stderr)
                skipped.append(xlsx)
            else:
                reference_tabs[xlsx] = row.get("reference_tabs") or []
        if failures:
            for line in failures:
                print(f"dump-workbook: {line}", file=sys.stderr)
            raise SystemExit(2)
        books = [xlsx for xlsx in books if xlsx not in skipped]

    dumps = {}
    for xlsx in books:
        summary = dump_workbook(xlsx, structure_md_for(xlsx), dump_root,
                                reference_tabs=reference_tabs.get(xlsx, ()))
        # `init_manifest` proposes from this same invocation's dump (§2.2) — the
        # summary is what was just written, so nothing is read back off disk.
        dumps[summary["spreadsheetId"]] = {"sheets": {"sheets": summary["sheets"]},
                                           "formulas": summary["formulas"]}
        print(f"{summary['spreadsheetId']}\t{xlsx.name}\t"
              f"{summary['meta']['sheet_count']} tabs")

    if args.init_manifest:
        manifest = init_manifest(sheets_root, dumps)
        unresolved = [row for row in manifest["workbooks"] if row.get("unresolved")]
        print(f"manifest: {len(manifest['workbooks'])} workbooks, "
              f"{len(unresolved)} awaiting Gate M")
    return 0


if __name__ == "__main__":
    sys.exit(main())
