# Consolidation merges are built by `extract`, not re-implemented in `consolidate`

**Date:** 2026-07-21
**Source:** live server test — the flat merge of 8 dining processes into `dining-025`
(`f83a36c`) came out **out-of-order and duplicated**, and a later re-test **hung** the bot.
**Scope:** `data-repo` prompts only — `extract.md` (Mode C), `consolidate.md` (drop apply
build), `process-voice/SKILL.md` (Stage 10 merge apply), and a small `idef-extraction`
ordering reinforcement. **No schema/engine change** (`restructure`/`delta`/`merge` already
support this).
**Relation to ADR 0012:** refines it — the consolidation *review* stays; the *apply/build*
mechanism changes from a `consolidate` apply-mode to the existing `extract` restructure path.

---

## 1. Problem

The `dining-025` flat merge (8 members) had two defects and one failure:

- **Order not by timing** — kiosk-order-verification (`n025`/`n026`, an *order-time* step) sat
  at flow position 31–32, *after* serving food; the members' flows were **concatenated**, not
  interleaved on the shift timeline.
- **Duplicated tasks** — table-cleaning survived twice (`n039`, `n046`) from two members.
- **Hang** — a re-test with a stronger "rebuild from scratch" apply rule made the run
  **improvise an ad-hoc `Agent` subagent dispatch** to build the candidate, which **stalled**
  the control-bot mid-run (the ADR 0002–0007 subagent-stall class). The operator had to
  restart the bot.

## 2. Root cause

`extract` **already builds merge heirs** — its **Mode C (RESTRUCTURE)** emits *"each heir as
a fresh full candidate"* and **preloads the whole `idef-extraction` skill** (no-fabrication,
no-duplicate, fields, Persian). `consolidate`'s apply-mode does **not** load `idef-extraction`
and re-implements a *thin* heir-builder inline. So the merge was built by the **reviewer**,
using weaker rules — and, when pushed to "rebuild from scratch," it reached for an ad-hoc
subagent and hung.

**Two builders of one artifact; the weaker one ran the merge.** The fix is to build merges
with the agent that already knows how — through the pipeline's **hardened** extract dispatch
(the same one Stage 5 uses, tuned in ADRs 0003–0007 *not* to stall) — and let `consolidate`
be the reviewer + verifier it is best at.

**No new `merge` agent** — that would be a third copy of "how to build a process."

## 3. Design

### 3.1 `consolidate` = reviewer + soundness (drop the apply build)

- **Review mode — unchanged.** Finds over-cuts, proposes numbered evidence-cited merge/attach
  suggestions (completeness + «کم‌اهمیت‌تر» tiers, N-way clusters).
- **Apply mode — the heir-building is REMOVED.** `consolidate` no longer authors the
  restructure plan. Its apply role is only the **soundness verification** (option 2): after
  `extract` builds and `merge` applies, `consolidate` re-reads the result and checks the
  seam + **timeline order** + **no mother/child (and no flat) duplicate nodes**, emitting a
  repair `delta` when needed. It never dispatches a subagent itself.

### 3.2 `extract` Mode C gains the three merge-specific points (from the audit)

Add to `extract.md` Mode C (and follow `idef-extraction`):

1. **Merge-coverage rule.** For a `restructure` **merge**, read **every** member's full
   `process.json` (a content checklist) **and** all their evidence spans across
   `transcript_paths`. The heir must **cover every distinct step/field of every member —
   including a human's manual UI/chat edits** — nothing lost (extends §6 no-omission to "no
   member content lost"); only genuine duplicates collapse to one node.
2. **Shift-timeline ordering.** Build the combined flow in **true shift-chronological order**
   (import `classify`'s shift-walk: model the shift start→end and place each step at its real
   time, interleaving members) — **never** concatenate one member's whole flow after
   another's.
3. **Self-check (g) + (h).** Extend the "Final self-check": **(g)** the flow reads in shift
   order (no order-time step after a serve-time step); **(h)** every distinct member step is
   present exactly once (cross-member coverage + dedup).
4. **`chosen_shape` input.** For a consolidation-driven merge the dispatch passes
   `chosen_shape` (`flat` | `mother_subprocess`); `extract` builds **flat** (all inline,
   `subprocess_links: []`) or **mother** (high-level flow + `subprocess_links` to the members
   that become children, their detail left in the children).

A small reinforcement to `idef-extraction` §2: state that a flow is placed in **chronological
(timeline) order**, not just "correct chronological position" for a single promoted sentence —
so both new extraction and merges share the rule.

### 3.3 `process-voice` Stage 10 — merge apply routes through `extract`

Replace Stage 10's `merge` apply (which dispatched `consolidate` apply) with the **Stage-5
restructure path**:

1. On an approved `merge` item, dispatch **`extract` `mode: restructure`** with:
   `existing_process_paths` = the member ids' files, `evidence` = the **union** of the
   members' evidence, `transcript_paths`, `attachment_texts`, `chosen_shape`, a fresh `seq`.
   `extract` returns the heir **candidate + `subprocess_links`** (§3.2).
2. The orchestrator assembles the `restructure` plan — `supersedes` = the inlined members
   (all members for flat; the non-child members for mother; a member id is in `supersedes`
   **or** `subprocess_links.child`, never both) — `validate restructure`, then
   `merge restructure`.
3. Dispatch **`consolidate` (soundness)** on the result to verify seam + timeline + dedup and
   emit any repair `delta` (`merge update`).
4. Commit stages `departments`/`runs` only (unchanged). `attach` items are unchanged
   (`merge attach-subprocess` + soundness).

This is a **single, serial, hardened** subagent dispatch (extract) — the ad-hoc `Agent`
dispatch that hung is gone.

## 4. Files touched

| File | Change |
|---|---|
| `data-repo/.claude/agents/extract.md` | Mode C: merge-coverage rule, shift-timeline ordering, self-check (g)+(h), `chosen_shape` input (§3.2) |
| `data-repo/.claude/agents/consolidate.md` | apply-mode: **remove** heir-building; keep only the soundness verification (§3.1) |
| `data-repo/.claude/skills/process-voice/SKILL.md` | Stage 10 `merge` apply → dispatch `extract` restructure + assemble plan + `merge restructure` + `consolidate` soundness (§3.3) |
| `data-repo/.claude/skills/idef-extraction/SKILL.md` | §2: reinforce chronological (timeline) ordering of the flow |

No schema/engine change; no new agent.

## 5. Verification

- **Re-run the `dining-025` merge** (same prompt: merge 5/6/7/8/11/12/13/14, flat) from the
  `4672a33` pre-merge state. Expect: one heir whose flow is in **shift order** (kiosk-order
  steps before serving; farewell last), **no duplicate** table-cleaning, every member's steps
  present — and **no hang** (built via the serial `extract` dispatch).
- **Mother case:** a `mother_subprocess` merge yields a timeline-ordered mother with children
  hung under single container nodes and **no mother node duplicating a child node**.
- **Grep/inspection** that the four edits are present and consistent; `consolidate.md` no
  longer authors a restructure plan.

## 6. Consequences

- ✅ One builder of processes (`extract` + `idef-extraction`); `consolidate` reviews + verifies.
- ✅ Merges are ordered + de-duplicated by the agent that knows the IDEF/chronology rules.
- ✅ The mid-run subagent stall is avoided (hardened serial extract dispatch, not ad-hoc `Agent`).
- 📝 Update ADR 0012 (apply path) and add a short ADR for this delegation.
