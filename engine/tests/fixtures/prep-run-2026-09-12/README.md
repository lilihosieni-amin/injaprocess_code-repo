# The preparation run of 2026-09-12 — regression fixtures for the unit gate

Copied read-only from the data repo at commit `3c6ede1`
(`quantify(preparation): 160 created, 0 updated`), run
`runs/facts/preparation/20260912-102718`. Nothing here was edited.

| Here | Source in the data repo |
|---|---|
| `run/skeleton.json`, `run/plan.json` | the run's own files |
| `run/units/u-wb-amadesazi/{input.md,out.1.json,out.2.json}` | the Excel unit: attempt 1 refused for a column `group`, attempt 2 for the inferred-number bug (spec F1, F2) |
| `run/units/u-tr-*/out.1.json` | the six meeting units whose first attempt was refused (thresholds on rules with inputs, a null `of` with stray `expr`/`lang`, the word «بچ») |
| `facts/*.json` | the run's `facts-before/` — the store as the run saw it (only the units record) |
| `departments/registry.json`, `departments/preparation/processes/*.json` | as of that commit |
| `attachments/sheets/manifest.json` | as of that commit |

The spec counts seven refused meeting units; the run holds six meeting units
with a refused first attempt (the seventh and eighth refusals were the Excel
unit's two attempts). Transcripts are not copied: the unit gate never opens
them.

`test_unit_gate_tiers.py` builds a temporary data root from this directory
(the run lands at `runs/facts/preparation/20260912-102718`).
