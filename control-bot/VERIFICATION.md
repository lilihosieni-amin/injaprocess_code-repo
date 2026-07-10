# Phase 4 — Control bot verification record

Maps each launch/run step to the requirement it satisfies. Fill the **Result** column
during the live run (Task 4 of the implementation plan) and complete the summary.

| Env | Value |
|---|---|
| Bot version | claude-code-telegram v1.6.0 |
| Where run | (dev machine / server / Docker — record which) |
| Target | dining-2026-05-06 |
| Date of run | (fill) |

## Checklist

| # | Step | Verifies | Result |
|---|---|---|---|
| 1 | A non-allowlisted Telegram ID sends a message and gets **no reply** | AC-8 (bot half), NFR-1 | |
| 2 | `/new`; send the plain-text process request ("process the voice dining-2026-05-06") | FR-C1 | |
| 3 | Checkpoint process list (A/B/D) appears in chat; user replies to confirm | FR-P4, FR-C3, INV-5 | |
| 4 | Extract → merge → commit produces schema-valid `processes/*.json` with allocated IDs (and the run's `git commit` lands despite `ENABLE_GIT_INTEGRATION=false`) | AC-2, INV-1 | |
| 5 | End-of-run `pending` conflict list is posted in chat | FR-M4 | |
| 6 | An attempted **direct** `processes/*.json` write during the run is blocked by the data-repo hook | AC-7, INV-1/2 | |
| 7 | Inspect the session for Superpowers / dev skills; record present or absent | PLAN §6 exit (empirical) | |

## Superpowers-leak note (step 7)

On this dev machine Superpowers is a **global** plugin (`~/.claude/plugins`).
`setting_sources=["project"]` + `ENABLE_MCP=false` may already keep it out of the runtime
session, but if it leaks locally that is a **dev-machine artifact**: the Phase-7 Docker image
ships without Superpowers, so the guarantee holds in production regardless. Record the observed
local result; do not assert a clean session if it isn't one.

## Summary

- AC-2 end-to-end (deferred from Phase 3) demonstrated over Telegram: (fill: yes/no + commit SHA)
- AC-8 (bot half) — unauthorized ID rejected: (fill)
- FR-C1 / FR-C3 / FR-P4 / FR-M4 — drivable run with checkpoint + conflict list: (fill)
- Superpowers/dev-skill leakage: (fill: absent / leaked-dev-artifact, with Docker resolution)
