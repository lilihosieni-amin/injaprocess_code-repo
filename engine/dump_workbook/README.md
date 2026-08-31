# dump-workbook

Dump the structure of the Google Sheets estate under
`DATA_ROOT/attachments/sheets/` (design spec Appendix C).

```
DATA_ROOT=<data-repo> dump-workbook --init-manifest    # before Gate M
DATA_ROOT=<data-repo> dump-workbook --manifest         # after  Gate M
```

Both passes walk every `.xlsx` under `attachments/sheets/` (dot-directories —
`.dump/`, `.text/` — excluded) and write one directory per workbook under
`attachments/sheets/.dump/{spreadsheetId}/`. `stdlib` only: an `.xlsx` is a zip
of XML, so `zipfile` and `xml.etree.ElementTree` are the whole toolkit and the
engine gains no dependency.

## Output

| file | columns / content |
|---|---|
| `sheets.json` | per tab: `sheetId`, `name`, `hidden`, `dimension`, `rows`, `cols`, the first ≤ 5 rows verbatim (`head`), `header_row`, the `##`/`#` `codes` printed in them, `empty`; plus `previous`, the last dump's `{sheetId: name}` |
| `formulas.tsv` | `sheet`, `range`, `group`, `formula`, `count`, `cached`, `error` |
| `names.tsv` | `name`, `scope` (`workbook` or the sheet a `localSheetId` names), `formula` |
| `validations.tsv` | `sheet`, `range`, `type`, `values` |
| `cf.tsv` | `sheet`, `range`, `type` (rule type + operator), `formula`, `format` |
| `comments.tsv` | `sheet`, `cell`, `author` (a role or `unknown` — never a name), `text` |
| `meta.json` | `sha256`, `bytes`, `file`, `exported` (from the `.structure.md`), `sheet_count`, `reference_tabs` |
| `rows.tsv` | `sheet`, `row`, one column per header cell — **only** for the tabs a confirmed manifest row names in `reference_tabs[]` |

`spreadsheetId` comes from the first `- spreadsheetId:` line of the sibling
`{stem}.structure.md` — the one claim of that file that is trusted, because
nothing else carries it. Its absence is **exit 2** naming the file.

Plain cell values are **not** dumped (QF-1): the estate's cells are nightly
values, not definitions. The exception is a reference tab, whose cells *are*
definitions (§9) — which is why `reference_tabs[]` is confirmed by a person at
Gate M and not by a heuristic, and why `rows.tsv` is the only file here that
enters git carrying values.

## What the two passes do

`--init-manifest` dumps structure only and fills the manifest's **mechanical**
columns — `spreadsheetId`, `dir`, `file`, `short`, `scripts` — from the folder.
It is idempotent: a confirmed row is left untouched, an unconfirmed one has its
mechanical columns refreshed, and a workbook with no row is appended with
`confirmed: false`. The judgement columns (`departments`, `branches`,
`reference_tabs`) are proposed by the `quantify` agent and confirmed at Gate M;
nothing here writes them.

`short` is minted from the file name, and on a collision from one directory
segment at a time working outwards (`farangi`, then `amar_farangi`). When every
candidate is taken it is left **empty** rather than proposed twice (Appendix B)
— an empty `short` does not satisfy `manifest.schema.json`, which is the point:
Gate M has to name it.

`--manifest` runs after Gate M. It refuses the whole run — **exit 2**, before
anything is written — when any workbook on disk has no manifest row or an
unconfirmed one (§3), and otherwise dumps the same structure plus `rows.tsv` for
each confirmed row's reference tabs. A `reference_tabs[]` entry naming a tab the
workbook no longer has is a warning on stderr, not a failure: a rename is what
the drift line and `merge facts audit` are for, and one stale name should not
cost the estate its dump.

Two failure modes exit 2 rather than raising: a file that is not a zip or has no
`xl/workbook.xml` (a failed download left in place), and a `.structure.md` with
no id line.

## Re-export and drift (QF-29)

A re-exported workbook replaces its file in place and `dump-workbook` is rerun.
The previous dump's `{sheetId: name}` map is read back out of the `sheets.json`
already in place; every pair whose name changed is printed as
`drift: {old} -> {new}` on stdout and returned in the summary. The export
numbers tabs positionally, so an insertion or a deletion shifts them and this is
how it is noticed.

## Notes on the shapes this reads

Copied from the estate's own exports, and covered by
`engine/tests/fixtures/make_workbook.py`:

- **Shared formulas.** A group is one `<f t="shared" ref="D3:D7" si="0">` master
  and bare-`si` followers — and Google sometimes writes no `<c>` at all for a
  cell inside the range. The count comes from the `ref` range unioned with the
  follower cells; counting `<f>` elements under-counts `Amadesazi!بازدهی` by
  96 % (27 cells, one element). Row numbers in the group's formula are
  normalised (`(C3/B3)*100` → `(CN/BN)*100`) so one group is one line.
- **`__xludf.DUMMYFUNCTION`.** Google's own functions survive the export only as
  `IFERROR(__xludf.DUMMYFUNCTION("…"&"…"), cached)`, the source split into
  255-character literals with the inner quotes doubled. It is joined back up and
  the cached result kept beside it.
- **Threaded comments.** Text from `xl/threadedComments/*` reached through the
  sheet `_rels`; the author is a `personId` this workbook's `xl/persons/person.xml`
  declares, mapped through the caller's role table (`dump_workbook(..., roles=…)`)
  and `unknown` for everyone else — the display name in that file is read and
  written nowhere. The legacy `xl/comments*.xml` contributes only genuinely
  non-threaded comments; the `tc={guid}` / `[Threaded comment]` placeholders it
  carries for the threaded ones are discarded.
- **The header row** is the first of the first five rows that is mostly
  non-numeric text (half or more of its non-empty cells). Blank rows and merged
  title bands are skipped — 39 of the estate's 316 tabs have one above the
  header.
- **`<dimension>`** is absent from every Google export, so `dimension` falls back
  to the measured extent (`A1:K34`, matching the `.structure.md`'s `34×11`).

## The TSV grid

A Google formula carries newlines and the odd tab, so every field is escaped:
`\` → `\\`, tab → `\t`, newline → `\n`, `\r` dropped. Every line of every file
has exactly as many fields as its header. `rows.tsv` is **one file per
workbook** — `merge facts audit` reads it that way, narrowing on the `sheet`
column — so two reference tabs with different headers share one header line, the
union of theirs in first-seen order, and each row fills only its own columns. A
header cell that says `sheet` or `row` is renamed (`sheet_2`) so those two
bookkeeping columns are always unambiguous.

## Python API

```python
from dump_workbook import dump_workbook, init_manifest

summary = dump_workbook(xlsx, structure_md, dump_root,
                        reference_tabs=("مواد اولیه",), prev_sheets=None,
                        roles={})
manifest = init_manifest(sheets_root)      # writes manifest.json, returns it
```

`dump_workbook`'s third argument is the `.dump` **root**, not the per-workbook
directory: the id that names that directory is read from `structure_md` inside
the call, so no caller can know it beforehand. The summary carries
`spreadsheetId`, `out_dir`, `drift`, and every table it wrote.
