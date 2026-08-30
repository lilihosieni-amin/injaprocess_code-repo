# allocate-id (deterministic CLI — implemented)

Console command: `allocate-id` → `allocate_id.cli:main`


The ONLY source of IDs in the whole system (INV-1, FR-D1/D2), for all three
paths: pipeline, chat, UI.

- Process: `{dept}-{NNN}` · Box: `{process-id}-n{NNN}` · Junction: `{process-id}-j{N}` · Fact: `F-{NNNNN}`
- Process rule: scan disk, "highest existing number + 1", cross-checked against a
  per-department counter file (`departments/{dept}/.id-seq.json`); deleted IDs never
  reused (ARD §4.1).
- Fact rule: a single GLOBAL counter file (`facts/.id-seq.json`, shape `{"fact": n}`),
  disjoint from every department ledger — never a key inside a department's file (QF-21).
  `allocate-id fact [--peek]` mints/peeks it the same way `process` does.
