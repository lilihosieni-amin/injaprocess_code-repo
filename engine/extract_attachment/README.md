# extract-attachment

Convert attachments to cached text, dispatched by extension (QF-30). No network, no model
except the Vertex rows below.

```
DATA_ROOT=<data-repo> extract-attachment <department>
DATA_ROOT=<data-repo> extract-attachment --path attachments/sheets
```

`<department>` keeps process-voice Stage 5a's call unchanged — it reads
`departments/<department>/attachments/`. `--path <dir>` roots the scan anywhere else
under `DATA_ROOT` instead (e.g. `attachments/sheets/`); give exactly one of the two.

## Dispatch table

| Extension | Converter | Output |
|---|---|---|
| `.docx` | python-docx | `.text/{stem}.txt` |
| `.pdf` | Vertex Gemini (native PDF input) | `.text/{stem}.pdf.md` |
| `.jpg` `.jpeg` `.png` `.webp` | Vertex Gemini | `.text/{stem}.image.md` |
| `.csv` `.md` `.txt` `.gs` | none — read directly | — |
| `.xlsx` | none — `skipped {name}: workbooks are dumped by dump-workbook from attachments/sheets/` | — |
| anything else | `skipped {name}: {reason}` on stderr | — |

Cached output paths (relative to `DATA_ROOT`) print to stdout, one per line. Every skip —
advisory (unsupported extension, `.xlsx`, missing `vertex` extra) or a genuine conversion
failure — prints `skipped {name}: {reason}` to stderr.

## Cache

Idempotent by file hash: every converted file gets a `{output}.sha256` sidecar beside it in
`.text/`, and a source whose hash still matches its sidecar is never reconverted — merely
touching a file (mtime only) does not burn a fresh Vertex call. This replaces the old
mtime-gated cache; `.docx` uses the same hash gate as the Vertex rows.

## Vertex vision (`.pdf`, images)

Reuses `engine/transcribe`'s client pattern (`google.genai.Client(vertexai=True, project=
VERTEX_PROJECT, location=VERTEX_LOCATION)`), with the model from `VERTEX_VISION_MODEL` — a
pin separate from transcription's `GEMINI_MODEL` so the two can move independently. The
prompt is fixed (`extract_attachment/vision.py:PROMPT`) and asks for: the document title,
header fields, columns with units, fixed rows in order, section and document-number fields,
shaded/read-only cells, signature bands, a verbatim transcription of all printed text, and a
final `handwriting: yes|no` line — the signal that tells a filled-in form apart from a blank
master.

Needs the engine's `vertex` extra (`pip install -e "engine[vertex]"`). Without it, `.pdf` and
image rows are reported as `skipped {name}: vertex extra not installed` — an advisory skip,
not a failure.

## Exit codes

- `0` — every convertible file converted.
- `3` — some files were skipped (advisory: unsupported extension, `.xlsx`, missing `vertex`
  extra, or a genuine per-file conversion failure), but every convertible file converted.
  process-voice Stage 5a relays these `skipped` lines and continues.
- `2` — a real precondition failure with nothing written (e.g. neither `<department>` nor
  `--path` given, or both given).
