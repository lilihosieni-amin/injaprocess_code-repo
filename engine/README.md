# engine/ — deterministic CLIs (ARD §8)

Four console scripts, installed editable into the repo `.venv` (`pip install -e engine`,
done automatically by `make test`). All are deterministic and LLM-free except
`transcribe`, which calls Gemini-on-Vertex behind a seam.

| Command | Job | Key rules |
|---|---|---|
| `allocate-id` | the ONLY source of IDs (INV-1) | scan disk, max+1; removed nodes keep their id |
| `layout` | serpentine flowchart positions (ARD §9) | manual nodes preserved; full vs local re-layout |
| `merge` | apply candidate/delta, resolve pending | enrich empty-only; conflict→pending (FR-M3); flag-removed never deletes (INV-4); validates against schemas/ before write |
| `transcribe` | Gemini-on-Vertex + idempotency pre-check | skips Vertex if transcript exists; raw text to stdout (pipeline cleans) |

Runtime env: `DATA_ROOT` (data location), `SCHEMA_DIR` (optional; defaults to the repo
`schemas/`), and for `transcribe`: `VERTEX_PROJECT`/`VERTEX_LOCATION`/`GEMINI_MODEL` +
GCP credentials outside the repos. The real Vertex call has a deferred integration test
(`-m integration`, skipped) — wire it up when GCP is set up.

Run tests: `make test` (from repo root).
