# 0016 — A department's process order is a CLI-written `order.json`, not a field in `overview.json`

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-25 |
| **Area** | `code-repo`: new `schemas/order.schema.json`, new engine CLI `order`, a `reconcile` hook in `merge`, `ui-backend` ordered list + reorder endpoint, `ui` reorder panel; `data-repo` hook guard |
| **Related** | [0009](0009-set-based-extraction-and-restructuring.md), [0012](0012-consolidation-review-stage.md) |
| **Specs/plans** | `docs/superpowers/specs/2026-07-25-department-process-order-design.md` |
| **Requirements** | PRD FR-D12 / FR-I7 / AC-11, INV-1; ARD §4.6 |

## Context

A department's processes had no meaningful sequence — the UI list rendered them in filename
order. The order matters for reading the list and is a prerequisite for the planned department
export, which cannot guess placement.

## Decision

Store the order in a **separate per-department file**, `departments/<code>/order.json`, written
**only** by a new deterministic `order` CLI, and keep it in sync through a single `reconcile`
hook in `merge`. The AI runtime gets read-only awareness, guard-enforced.

## Why not a `process_order` field in `overview.json`

`overview.json` already has a `PUT` endpoint and a UI edit screen, so it looks like the cheaper
home. But **the `summarize` subagent rewrites `overview.json` on every pipeline run**, so the
language model would clobber the human's curated order on its next pass — defeating the whole
point. It would also mix human curation with AI-generated narrative in one file.

## Why not a tolerant hint file

Letting each reader reconcile drift its own way needs almost no wiring, but then the
"where does a new process go" rule lives in every reader instead of in the data. The UI and the
export could silently disagree, and the file would quietly rot. The export needs a sequence it
can trust without second-guessing, so the file is authoritative and the CLI keeps it exact.

## Why not a `rank` integer per process

Ranks drift: every insertion either renumbers many files — many diffs, many commits — or leaves
gaps that accumulate. And `process.json` is written per-process by `merge`, so no single writer
ever sees the whole sequence at once.

## Consequences

- One new schema, one new CLI, one new hook in `merge`; no new pipeline stage and no new agent
  instruction, because `merge` maintains the file during the existing Stage 6 and the existing
  Stage 8 `git add departments` commits it.
- A restructure heir inherits its predecessor's position, so curation survives merge/split
  (ADR 0009 makes restructuring a normal event, not a rare one).
- Existing data needs a one-time `order sync --all` backfill.
