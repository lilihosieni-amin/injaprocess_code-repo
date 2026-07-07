# schemas/ — the frozen JSON data contract (Phase 0)

Machine-checkable JSON Schemas (draft 2020-12) for every data shape the system
exchanges. Enforced by code (the `merge` CLI and the UI backend validate against
these); kept in `code-repo` so runtime (INV-2) cannot weaken validation.

| Schema | Shape | Produced by | Consumed by |
|---|---|---|---|
| `registry.schema.json` | department list (ARD §4.5) | maintained by hand | allocate-id, upload-bot |
| `process.schema.json` | a process (ARD §4.3) | merge | UI backend, UI |
| `candidate.schema.json` | new-process extract graph (ARD §5.4) | extract agent | merge |
| `delta.schema.json` | update delta (ARD §6.2) | extract agent | merge |
| `overview.schema.json` | department overview (ARD §4.4) | summarize agent | UI |
| `segments.schema.json` | classify output (ARD §5.2) | classify agent | checkpoint |
| `run-meta.schema.json` | per-run metadata (ARD §2.2) | process-voice | audit |
| `conflicts.schema.json` | per-run conflicts (ARD §2.2) | merge | Telegram report, UI inbox |

Golden fixtures conforming to each live in `../tests/fixtures/`. Run `make test`
to validate every fixture against its schema.

**Convention:** stored data uses ISO-8601 UTC timestamps and Latin digits.
Persian numerals and Jalali dates are UI-only presentation (Phase 6).
