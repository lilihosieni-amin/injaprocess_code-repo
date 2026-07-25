# engine/ — deterministic CLIs (ARD §8)

Seven console scripts, installed editable into the repo `.venv` (`pip install -e engine`,
done automatically by `make test`). All are deterministic and LLM-free except
`transcribe`, which calls Gemini-on-Vertex behind a seam.

| Command | Job | Key rules |
|---|---|---|
| `allocate-id` | the ONLY source of IDs (INV-1) | scan disk, max+1; removed nodes keep their id |
| `extract-attachment` | department `.docx` attachments → cached `.text/*.txt` | idempotent: an up-to-date cache is left alone |
| `layout` | layered flowchart positions (ARD §9) | manual nodes preserved; full vs local re-layout |
| `merge` | apply candidate/delta, resolve pending | enrich empty-only; conflict→pending (FR-M3); flag-removed never deletes (INV-4); validates against schemas/ before write |
| `order` | the department's curated process order (ARD §4.6) | sole writer of `order.json`; `show`/`sync`/`check` read or derive, `set`/`move` curate (UI-only — hook-blocked for the runtime); `set` refuses anything but the exact active set; `--all` sweeps every department and exits 2 if any failed |
| `transcribe` | Gemini-on-Vertex + idempotency pre-check | skips Vertex if transcript exists; raw text to stdout (pipeline cleans) |
| `validate` | check a JSON file against a named schema | `validate <schema> <file>`; exit 2 on mismatch/unknown-schema/missing-file; guards the classify/summarize/playbook outputs no other CLI validates |

Runtime env: `DATA_ROOT` (data location), `SCHEMA_DIR` (optional; defaults to the repo
`schemas/`), and for `transcribe`: `VERTEX_PROJECT`/`VERTEX_LOCATION`/`GEMINI_MODEL` +
GCP credentials outside the repos. The real Vertex call has a deferred integration test
(`-m integration`, skipped) — wire it up when GCP is set up.

Run tests: `make test` (from repo root).
