# 0012 — Consolidation review: a terminal, human-gated, whole-department pass

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-19 |
| **Area** | `data-repo` new agent `.claude/agents/consolidate.md` + `process-voice/SKILL.md` (new Stage 10); `code-repo` new `schemas/consolidation.schema.json` |
| **Related** | [0008](0008-segmentation-node-visibility-semantic-subprocess.md), [0009](0009-set-based-extraction-and-restructuring.md), [0013](0013-no-duplicate-nodes-doctrine.md) |
| **Specs/plans** | `docs/superpowers/specs/2026-07-19-consolidation-reviewer-design.md`, `…/2026-07-19-consolidate-combination-and-dedup-design.md` (+ matching plans) |
| **Refined by** | `docs/superpowers/specs/2026-07-21-merge-via-extract-delegation-design.md` (apply path) |

> **Update (2026-07-21) — apply path.** Consolidation *review* is unchanged, but the merge
> *build* no longer happens in `consolidate`'s apply-mode. Live testing showed the inline
> heir-builder produced **out-of-order and duplicated** merges and, pushed to "rebuild from
> scratch," made the run improvise an `Agent` subagent dispatch that **stalled** the
> control-bot. Merges are now built by **`extract` (restructure mode)** — the hardened,
> `idef-extraction`-backed builder that already builds classify-driven merges — dispatched by
> Stage 10 (and by `edit-process` for chat merges); `consolidate` apply-mode is now
> **soundness verification only**. See the 2026-07-21 design.

## Context

By design `classify` segments **fine** — fine segments make `extract` produce dense,
detailed nodes (~95–96% detail capture; ADR 0008/0009). The cost of that choice is
**over-cutting**: a single department shift gets chopped into many peer processes, and the
same task recurs across them. The first live dining run produced **26 processes from 3
transcripts** (`data-repo` b5ab354); the domain expert then hand-fixed it into a few
"mother + subprocess" and flat-merged processes (her `dining-027`/`028`), revealing the
intended coarser shape.

Coarsening `classify` was rejected: granularity and node richness are coupled, so fewer
segments would flatten `extract`'s detail. The fix therefore belongs **after** the processes
are fully built — restructuring **without discarding any node**.

## Decision

Add a new **terminal, human-gated, whole-department consolidation review** as the final
stage of every `/process-voice` run (Stage 10, after `summarize`/commit). `classify`,
`extract`, and `merge` are **unchanged**.

**New `consolidate` agent (Opus 4.8; tools `Read, Glob, Write`).** Two modes:

- **review** — reads the whole department (all transcripts + all non-tombstoned processes +
  attachments), judges overlap **semantically** (no mechanical/CLI detector — rejected as
  brittle against Persian free-text), and writes `runs/{dept}/{stamp}/consolidation.json`: a
  numbered, **evidence-cited** list of suggestions, or an empty list. It never edits files.
- **apply** — turns ONE approved suggestion into a `restructure` plan or a repair `delta`.

**Two suggestion kinds, found by their combination point:**

- **`merge`** — several processes are one continuous procedure (shared start / prefix /
  shared nodes). May join **2+** processes (**N-way transitive clustering** — `A~B~C` is one
  `merge [A,B,C]`, not pairwise splits). The user picks the shape per item: **flat** (union
  the nodes) or **mother + subprocess** (`028`-style).
- **`attach`** — one whole process is the **decomposition of a single node** of another
  (the node's label abstracts the child's procedure); re-parent it under that node.

**Completeness + three silence tiers.** Scan every pair/cluster; report **every** confident
over-cut in one pass (numbered ۱،۲،۳…); list **plausible-but-uncertain** cases briefly under
a «موارد کم‌اهمیت‌تر» heading (letter-labelled الف،ب،پ… to stay distinct); stay silent only
on the genuinely **baseless** (no hallucination — ADR 0008 silence bias preserved).

**Human gate + apply.** Each item is approved individually (a new post-run STOP gate, like
Gate B). Applying uses **only existing engine verbs** — `merge restructure` /
`attach-subprocess` / `remove` / `update` (no new CLI) — followed by a **soundness pass**
that fixes the seam and removes cross-level/flat duplicate nodes (the no-duplicate doctrine,
ADR 0013). INV-5 is **relaxed to per-item**: one approval authorizes every edit that item
needs, including overwriting already-filled values, then the finished process is shown back.

**New schema** `consolidation.schema.json` validates the artifact; an evidence-free
suggestion is schema-invalid (anti-hallucination enforced structurally).

**Apply commits scope to data.** Stage-8 and Stage-10 commits use
`git add departments runs`, **not** `git add -A` — a plain `-A` during an apply once swept
uncommitted `.claude` prompt edits into a data commit.

## Verification

- **Dry-run** on the dining `b5ab354` snapshot: proposed exactly the expert's manual
  `001–004` prep merge and the `005–019` customer-journey consolidation with cited recurring
  nodes, left the standalone tail alone (no hallucinated merges), applied a flat merge into a
  validated heir with every distinct node preserved, and stayed silent on a clean department.
- **Live server runs** exercised the numbered report, the «کم‌اهمیت‌تر» tier, N-way grouping
  (`[001,002,004]`), and attach (`007` under `005-n009`).

## Consequences

- ✅ Over-cutting/duplication is fixed after the fact, so `classify` keeps its detail-rich
  fine segmentation; no node is discarded in a consolidation.
- ✅ Restructuring stays advisory + human-gated (INV-4/INV-5 honoured, per-item).
- 📝 ARD §5 (pipeline gains Stage 10), §5.3 (a third, post-run gate), §5.10 (new
  `consolidate` agent), §8 (`consolidation.schema.json`).
- ⚠️ Behaviour is LLM-judged (semantic overlap); the human gate + evidence citations are the
  correctness backstop. A missed consolidation is recoverable on the next run; a wrong one
  costs the operator real cleanup — hence the strong precision/silence bias.

## Lessons

- Detail-rich extraction and clean top-level structure pull in opposite directions; solving
  the second **after** the build (a review pass) beats compromising the first.
- Node recurrence across *closely-related* processes is a reliable over-cut signal; across
  *unrelated* processes it is legitimate and must be left alone.
- `git add -A` inside a data-writing stage is a foot-gun in a shared checkout — scope adds.
