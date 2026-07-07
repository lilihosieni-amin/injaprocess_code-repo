# allocate-id (deterministic CLI — implemented)

Console command: `allocate-id` → `allocate_id.cli:main`


The ONLY source of IDs in the whole system (INV-1, FR-D1/D2), for all three
paths: pipeline, chat, UI.

- Process: `{dept}-{NNN}` · Box: `{process-id}-n{NNN}` · Junction: `{process-id}-j{N}`
- Rule: scan disk, "highest existing number + 1"; no counter file; deleted IDs never reused (ARD §4.1).
