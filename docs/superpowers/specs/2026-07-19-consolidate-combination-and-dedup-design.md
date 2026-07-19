# Consolidate — combination detection & post-combination dedup

**Date:** 2026-07-19
**Source:** first live bot test of the consolidation reviewer on `dining` (pipeline run
`d83d5f7`; consolidation of item 1 at `f8d7113`). Three concrete failures observed.
**Scope:** the `consolidate` agent prompt only — `data-repo/.claude/agents/consolidate.md`.
**No schema, engine, or test-harness change.** Reuses the dedup doctrine already added to
`idef-extraction/SKILL.md` (§2, §7) by the extract-no-duplicate-nodes change (`2c6e168`).

---

## 1. Problem (observed on the dining run)

**P1 — over-cut not caught (missed flat merge).** `dining-001` (3 nodes: entry →
fingerprint → start-prep) is the *opening* of `dining-002`, whose start node
`n001` is the same **"ورود پرسنل و ثبت اثر انگشت"** event. `001` is a prefix of `002`; the
entry step is duplicated across both. Consolidate caught the obvious duplicate-node merges
(010+011, 013+014+015) but **missed** this one — its detection cue is *"a recurring node
across close processes,"* and the shared node here is the **start**, worded differently in
each, on a 3-node stub.

**P2 — attach never proposed (missed decomposition).** `dining-005-n009` =
**"سپردن مدیریت نوبت به هدویتر در صورت پر بودن میزها"**; `dining-007` **is** that
queue-management procedure in full. `007` is the decomposition of `005-n009` — a textbook
**attach**. Consolidate did not propose it: its heuristic is duplicate-node (a *merge*
signal); an attach has a different signal — *a whole process elaborates a single node of
another*, with no node duplication — which the prompt never tells the agent to look for.

**P3 — mother duplicates its subprocess (bad apply).** In the item-1 merge (`011` complaint
+ `010` cancel/refund → mother `021`, child `010`), mother `021` nodes `n004–n007`
(waste-check, reject-if-fault, inform-kitchen, get-approval) **duplicate** child `010` nodes
`n001–n004`. After the mother reaches approval and enters the subprocess, the subprocess
**re-does** the same decision. The decision logic is modeled twice and the child's redundant
front was never trimmed. The `d90f27b` fix addressed the `supersedes`/`subprocess_links`
contradiction but **not** node-level dedup *between a mother and its child*.

## 2. Root cause

All three are gaps in the **`consolidate` agent** (classify stays fine-grained by design):

- Detection is narrowly built around **duplicate nodes** → it finds obvious merges but
  misses (a) prefix/shared-start over-cuts and (b) decomposition/attach relationships.
- Apply-mode enforces "don't inline the child's detail" but never the converse: **a step
  that lives in the child must not also remain in the mother**; and the soundness pass
  checks only the seam, not cross-level duplication.

## 3. Design

Prompt-only, two additions to `data-repo/.claude/agents/consolidate.md`.

### 3.1 Part A — Combination detection: find the "common point" (review mode)

Generalise the review-mode heuristic from *"a recurring node across close processes →
merge"* to: **for genuinely-related process pairs, identify the connection point and
propose the logically-correct shape.** Two combinable relationships:

- **Flat merge — same or continuous work.** Signals: a shared/near-identical **start
  event**; one process is a short **prefix** whose steps reappear at the head of the other;
  or they share several nodes end-to-end. (P1.)
- **Attach / mother+subprocess — decomposition.** Signal: a node `N` in process `Y` whose
  label *names or abstracts* process `X`'s procedure, and `X` reads as `N`'s steps — **no
  node duplication required**. Propose attaching `X` under `Y.N`. (P2.)
- **N-way clustering.** A combination may join **two or more** processes, not just a pair.
  Cluster **transitively**: if `A`~`B` and `B`~`C` are one continuous procedure, emit **one**
  merge `[A, B, C]`, not separate pairwise merges. (Attach stays one child under one node.)

**Relatedness + logic gate (requirement #1).** Combine **only** when the two are genuinely
related **and** the combination is logically sound — a real shared boundary or a real
decomposition. Preserve the precision/silence bias: superficial similarity, or a node
recurring across **unrelated** processes, is **not** a combination. Every suggestion still
cites its concrete connection point — the shared/boundary node, or the elaborated node `N` —
as the required evidence.

### 3.2 Part B — Post-combination dedup: no duplicate nodes in the result (apply + verify)

After applying **any** combination, the agent re-reads the resulting process(es) and
enforces the **same dedup doctrine now in `idef-extraction/SKILL.md`** (§7 "No duplication
across a process and its subprocess" + §2 "One node per task") — DRY: one doctrine, cited by
both `extract` (at build) and `consolidate` (at combine).

- **Mother + subprocess:** any step that lives in the child is **removed from the mother** —
  the mother keeps only the single container node pointing to the child; the child holds
  that detail **once**. Then **trim the child's redundant front** so entering it from the
  mother's container node is logical (the child starts where the mother's container node
  leaves off — it does not re-do the mother's decision). (P3.)
- **Flat:** collapse duplicate nodes to a single copy; a revisit is a **loop-back edge**, not
  a second node.
- **Allowed exception (unchanged):** the mother container node vs. the child's first node
  sit at different abstraction levels and are expected to differ — not a duplicate.
- **Guardrail (INV-3):** collapse only accidental duplicate copies; a step genuinely
  performed at two distinct points, or a loop-back re-check, is kept.

This upgrades the §4.7 soundness pass from *seam-check* to *seam-check **+** cross-level/flat
dedup*, and cites the extract rules by name so the two stay in sync.

### 3.3 Part C — Completeness + the «کم‌اهمیت‌تر» (less-important) tier

Observed in the first live runs: the reviewer surfaced only ~2 suggestions per run and
under-reported (run 1 missed `001+002`, which run 2 later caught). Cause: no explicit
completeness mandate, plus the silence rule dropped every uncertain case entirely. Fix by
replacing the binary silence rule with **completeness + three tiers**, prompt-only:

- **Completeness.** Compare **every** pair of active processes; emit **every** confident
  over-cut as a full suggestion — the main list must be complete, not a sample. Do not stop
  at the first one or two.
- **Three tiers (replaces "uncertain → say nothing"):**
  - **Confident** (all three citations: ids + node id/label + transcript span) → a full
    `suggestions[]` entry (the actionable, numbered list).
  - **Plausible but uncertain** (real-looking overlap, can't fully cite / unclear boundary)
    → **not** a suggestion; a brief one-line note in the agent's **return summary** under a
    «موارد کم‌اهمیت‌تر» list, so the user stays aware and can ask to pursue it. **Brief FYI,
    prompt-only — not stored in `consolidation.json`.**
  - **Baseless** (no citable connection) → nothing (no hallucination — unchanged).
- **Presentation (process-voice Stage 10).** Stage 10c builds the report **from
  `consolidation.json`** (not the agent's short return) and renders **each confident
  suggestion's full `problem`+`action` verbatim** (never summarised) with its ids and
  recommended shape, then the output path, a "no process file changed yet" note, the
  «موارد کم‌اهمیت‌تر» brief list (if any), and the closing apply question. This is the
  detailed report format the domain expert expects; only the «کم‌اهمیت‌تر» items are brief.
  Stage 10b: if the confident list is empty but «کم‌اهمیت‌تر» notes exist, present those and
  ask; only fully-empty → "no consolidation needed". If the user asks to pursue a
  «کم‌اهمیت‌تر» item, re-dispatch `consolidate` (review) — it either promotes it to a full
  suggestion or explains why it still can't be cited.

This keeps precision (only citable cases are actionable; baseless still silent) while adding
recall (every confident case in one pass) and awareness (borderline cases surfaced, not
dropped).

## 4. Files touched

| File | Change |
|---|---|
| `data-repo/.claude/agents/consolidate.md` | review-mode: generalise detection to the two combination relationships + the relatedness/logic gate (Part A); **completeness + three-tier silence** with the «کم‌اهمیت‌تر» return-summary list (Part C); apply-mode + §4.7 soundness: mandatory post-combination dedup (mother/child + flat), cross-referencing the `idef-extraction` §7/§2 rules (Part B) |
| `data-repo/.claude/skills/process-voice/SKILL.md` | Stage 10b/10c: render the agent's «موارد کم‌اهمیت‌تر» list at the end of the report; pursue-flow re-dispatch (Part C) |

No change to `classify`, `extract`, `idef-extraction`, `merge`, `allocate-id`, schemas, or
UI.

## 5. Verification

Prompt-only → grep/inspection + consistency re-read, plus a scenario re-run:

- **Grep:** Part A relationships (flat prefix/shared-start; attach decomposition) and the
  relatedness/logic gate are present in review mode; Part B dedup (mother/child removal +
  child-front trim + flat collapse) is present in apply/soundness and cites the extract
  rules.
- **Consistency re-read:** Part A does not weaken the silence/precision bias (§5 of the
  reviewer spec) — unrelated similarity still yields no suggestion; Part B does not
  contradict the container-box exception or INV-3.
- **Scenario re-run (acceptance):** on the dining set, review mode now (a) proposes
  `001+002` as a flat merge citing the shared start event, and (b) proposes `007` as an
  attach under `dining-005-n009`; and applying the `010/011` mother merge yields a `021`
  whose nodes do **not** duplicate child `010`'s steps (decision lives in one place; the
  child's redundant front is trimmed).
- **Completeness + tier (Part C):** a single review now lists **all** confident over-cuts at
  once (not ~2 per run), and borderline cases appear under a «موارد کم‌اهمیت‌تر» heading at
  the end rather than being dropped; baseless cases still produce nothing.
