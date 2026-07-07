# merge (deterministic CLI — to be implemented)

The heart of determinism (ARD §5.5, §6). Applies extract deltas to
`departments/{dept}/processes/{id}.json`:

- Assigns real IDs via `allocate-id`; preserves existing IDs and positions (FR-M2).
- Enrich only fills EMPTY fields; a change to a filled value becomes a `pending` row (FR-M3).
- Never deletes — only flags removed (FR-D8, INV-4).
- Precondition gate: refuses to run without confirmed segments (ARD §7).
- Runs `layout` for position-less nodes (local re-layout on middle insertion, ARD §6.4).
