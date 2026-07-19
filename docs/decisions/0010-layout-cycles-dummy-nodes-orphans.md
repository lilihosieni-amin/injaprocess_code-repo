# 0010 — Layout: cycle removal, dummy-node edge routing, orphan parking

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-19 |
| **Area** | `code-repo` engine `layout` (`engine/layout/__init__.py`) — used by `merge` re-layout and the `ui-backend` `/relayout` endpoint |
| **Related** | PRD FR-D9/FR-D10; ARD §9 (updated), §8; supersedes the original "later sibling pushed to the lane below" placement |

## Context

The layered layout (ARD §9) produced broken charts on real dining processes. Three
independent root causes, each reproduced on committed data:

- **Rework loops collapse the layout (dining-022).** A single back-edge — e.g.
  `n008 → n007` ("برای بررسی مجدد" / send it back for re-review) — makes the flow cyclic.
  `topo_order`'s Kahn algorithm stalled on the cycle and dumped every downstream node
  (`j1, j2, n007…n011`) via its "cycle leftovers" fallback in **raw id order**. Because
  `grid_positions` computed longest-path layers by iterating that order and only counting
  predecessors already placed, the whole tail collapsed to layers 0/1 → cards piled on top
  of each other and edges ran backwards.
- **A bypass edge is drawn through a node (dining-027).** A junction's straight "skip"
  edge — `j1 → j2` ("سایر روزها") past an optional step — **spans two layers**, and the
  layout drew it as a straight line across the skipped layer, right through the real node
  sitting there (`n003`, the Friday-meeting step).
- **Isolated nodes distort the flow (dining-027).** Four cleaning-task cards
  (`n009…n012`) appear in **no edge at all**. Treated as flow "sources," they piled into
  layer 0, making the first band 5 lanes tall, which shoved the wrapped band (starting at
  `n004`) ~860px down and stretched the connector into it.

## Decision

Extend the deterministic layered layout into a fuller **Sugiyama-style pipeline** (still
LLM-free and deterministic, id-order tie-breaks preserved):

1. **Cycle removal.** A deterministic DFS **rooted at real sources** (in-degree 0, id
   order) classifies the loop-closing back-edge, which is dropped **for placement only**
   (the UI still draws it). Rooting at sources means the edge hidden is the one pointing
   *against* the flow (the rework edge), not a junction's real feeder. Layering then runs on
   a genuine DAG — no more collapse.

2. **Dummy nodes for multi-layer edges.** Any edge spanning more than one layer is routed
   through one placeholder per skipped layer. The placeholder claims a lane (so the edge
   reserves its own space) but **emits no position** — real nodes in that layer are pushed
   off the bypass line.

3. **Symmetric coordinate assignment + crossing reduction.** Each node is placed near its
   neighbours' mean lane with a **one-lane minimum gap**, so a junction's branches
   **straddle it (one up, one down)** — replacing the old "later sibling pushed to the lane
   below." A few barycenter up/down sweeps reduce edge crossings. Small node types
   (junction/start/end) keep the centering nudge.

4. **Orphan parking.** Nodes that appear in no edge are laid out in a **column below** the
   flow, not as first-band sources — so they never widen the first band or stretch the wrap
   connector.

Serpentine band wrap (page-width cap, `MAX_COLS=5`), `layout:manual` preservation, and full
determinism are **unchanged**.

## Rejected / reverted

- **Junction-aware wrapping.** When a junction would fall in the last column of a band, its
  branches wrap into the next band and (because odd bands run right-to-left) can end up
  stacked in the junction's own column, with the fan-out edge running through the nearer
  child (dining-013 `j2`/`n011`). A rule — *"a junction is never left in the last column; it
  drops to the next band with its children, even if that band ends short of 5 columns"* —
  was implemented (per-layer band/column assignment) and **reverted at the owner's
  request**: the visual result wasn't wanted. The standard uniform wrap stays. **Known
  limitation:** a junction at a band boundary can still place a child on its branch edge.

## Consequences

- ✅ Processes with rework loops lay out cleanly — no collapse, overlap, or backward edges.
- ✅ Optional/skip branches no longer sit on the straight bypass edge.
- ✅ Isolated nodes don't distort the main flow.
- ⚠️ Orphan parking is a **layout mitigation, not a data fix** — isolated nodes are real
  committed data that probably belong wired into the flow; that's a data-repo edit, surfaced
  to the user, not something the layout should invent edges for.
- ⚠️ The dining-013 junction-at-band-boundary case is **left unfixed** by owner choice (see
  Rejected).
- 📝 ARD §9 rewritten to describe the pipeline. **PRD unchanged** — FR-D9 (horizontal LTR,
  saved positions, serpentine wrap) still holds; cycle/dummy/orphan handling are algorithm
  details the ARD owns.

## Implementation note

TDD, one root cause at a time (systematic-debugging): each fix started from a failing test
that reproduced the real graph, then the minimal change. New tests `test_layout_cycles.py`
and `test_layout_dummy_orphan.py`; the junction fan-out test in `test_layout_layered.py`
updated from the old asymmetric spread to the symmetric one. Engine suite **145 passing**.
Shipped to `main` (code-repo, commit `64cdcf8`) and deployed to the server via the runbook-03
update (code-only; `data-repo` untouched, verified before/after).

## Lessons

- **The original layout skipped the two classic Sugiyama steps** — cycle removal and dummy
  nodes. Linear demo charts never exposed it; real branchy data with rework loops and skip
  branches needed both.
- **Problems clustered at the serpentine band-wrap seam.** Three separate symptoms all
  traced back to how the wrap interacts with branches — a signal to question the wrap
  itself. Two of three are fixed; the third (junction-at-boundary) was a deliberate
  owner call to leave alone rather than change the documented page-width behaviour.
- **Reproduce on the real committed graph before fixing.** Every root cause was confirmed by
  computing positions for the actual `dining-0NN.json`, not a synthetic guess.
