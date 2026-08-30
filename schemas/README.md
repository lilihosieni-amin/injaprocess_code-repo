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
| `order.schema.json` | department process display order (ARD §4.6) | order CLI | UI backend (and the *planned* department export — PRD §12) |
| `segments.schema.json` | classify output (ARD §5.2) | classify agent | checkpoint |
| `run-meta.schema.json` | per-run metadata (ARD §2.2) | process-voice | audit |
| `conflicts.schema.json` | per-run conflicts (ARD §2.2) | merge | Telegram report, UI inbox |
| `consolidation.schema.json` | consolidation review suggestions (design §4.3) | consolidate agent | process-voice Stage 10 |
| `facts.schema.json` | the facts store — envelope + five kinds (quantitative-facts design §6/§7) | merge facts | ui-backend, UI, later runs |
| `facts-delta.schema.json` | agent-proposed changes to the facts store (design §4) | facts extract agent | merge facts |
| `facts-index.schema.json` | flattened, filterable rows over the facts store (design §7) | merge facts | ui-backend, UI |
| `facts-idseq.schema.json` | facts id sequence counter state | allocate-id | allocate-id |
| `facts-run-meta.schema.json` | per-run metadata for a facts pipeline/chat/UI run (design §4) | process-facts | audit |
| `manifest.schema.json` | registered branches and confirmed workbooks the facts store draws from (design §7, QF-33) | maintained by hand / `merge facts` on confirm | facts extract agent, merge facts |
| `manifest-proposal.schema.json` | agent-proposed manifest rows awaiting confirmation (design §7, QF-33) | facts extract agent | human review, `merge facts` |

Golden fixtures conforming to each live in `../tests/fixtures/`. Run `make test`
to validate every fixture against its schema.

**Convention:** stored data uses ISO-8601 UTC timestamps and Latin digits.
Persian numerals and Jalali dates are UI-only presentation (Phase 6).

**Dates (QF-41 — amends the line above for the facts store).** The facts
store is the one place Jalali dates are *stored*, not just displayed:
`valid_from`/`valid_to`/`issues[].from_date`/`issues[].to_date` are Latin-digit
Jalali `YYYY-MM-DD` or `YYYY-MM` (business validity has no natural Gregorian
form in this domain). Every other timestamp — `updated_at`, run directory
stamps, `facts-run-meta.schema.json`'s `started_at`/`finished_at` — stays
ISO-8601 UTC, Latin digits, as everywhere else in the system.

**`schema_version` migration (QF-45).** `facts.schema.json`,
`facts-delta.schema.json`, `facts-index.schema.json` and `manifest.schema.json`
each carry a top-level `schema_version` (currently `1`, `const` in the
schema). A reader refuses a file whose `schema_version` is higher than the
one it knows; it is never silently upgraded. Bumping the constant is only
done alongside an append-only migration note added here:

- **v1** (2026-08-30, Task 1 of quantitative-facts) — initial version:
  envelope + five kinds (`item`, `record`, `measurement`, `rule`, `note`).

**`workbooks[].short` uniqueness (`manifest.schema.json`).** JSON Schema has
no way to assert cross-row uniqueness (no `uniqueItems`-style constraint
over one field of an array of objects), so `manifest.schema.json` only
constrains each `workbooks[].short` to the pattern
`^[a-z][a-z0-9]*(_[a-z0-9]+)*$` — it cannot reject a `short` value repeated
across two workbook rows. `short` must nonetheless be unique across the
whole manifest: it is the workbook shorthand minted keys are built from
(design §7, QF-33), so a collision would silently conflate two workbooks'
facts. `merge facts` (Task 5) and `dump-workbook` (Task 10) are responsible
for enforcing that uniqueness at write/import time.

## Known gaps (to reconcile in later phases)

- **node `source`**: the process schema uses the ARD §4.3 object shape `{created_by, touched_by}`; the UI design prototype currently emits a plain string — the Phase-6 UI must adopt the object shape when it deserializes `process.json`.
