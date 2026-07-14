# extract-attachment

Convert a department's `.docx` attachments to cached plain text.

```
DATA_ROOT=<data-repo> extract-attachment <department>
```

Reads `departments/<department>/attachments/*.docx`, writes
`departments/<department>/attachments/.text/<name>.txt` (only when the source is new or
changed — mtime-gated), and prints each cached `.txt` path (relative to `DATA_ROOT`) to
stdout. Files that fail to convert are reported to stderr and skipped; exit code is non-zero
if any file was skipped. Deterministic: no network, no model.
