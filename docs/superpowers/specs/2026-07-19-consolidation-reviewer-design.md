# Consolidation reviewer — whole-department over-cut & duplication fixer

**Date:** 2026-07-19
**Source:** domain-expert testing of the set-based pipeline (data-repo commit
`b5ab354` — "26 processes from 3 transcripts" for `dining`), followed by the
expert's manual restructuring on top of it (`dining-027` flat-merge of `001–004`;
`dining-028` mother "سرویس‌دهی به مشتری" linking `005/006/009…` as subprocesses;
`dining-029` payment subprocess).
**Scope:** a **new terminal stage** of the `process-voice` pipeline plus a new
`consolidate` agent. **`classify`, `extract`, `summarize`, and the `merge`/
`allocate-id` engine are deliberately left unchanged** — this round adds a
consolidation lens, it does not re-tune segmentation.
**Deliverable:** prompt/orchestration + one new artifact schema. A new agent prompt
(`.claude/agents/consolidate.md`), new `process-voice` orchestration stages, one new
run artifact (`consolidation.json`) and its validating schema. **No new engine CLI and
no change to any existing process/merge/segment schema** — approved suggestions are
applied with the existing `merge restructure` / `merge attach-subprocess` /
`merge remove` verbs, and post-apply logical-soundness repairs (§4.7) with the existing
`merge update --delta` verb.

---

## 1. Problem

The set-based pipeline captures detail well but **over-cuts**: a single department
shift is segmented into many fine peer processes. In `dining`, three transcripts
produced **26 top-level processes**. The expert's own hand-fixes reveal the intended
shape:

- **Over-fragmentation at one level.** `dining-005/006/008` (welcome → kiosk order →
  seating) is one reception flow; `dining-001–004` is one pre-service prep flow. They
  were emitted as separate peers.
- **Missing hierarchy.** The whole customer journey should read as one **mother**
  process (`سرویس‌دهی به مشتری`) whose steps link to finer **subprocesses** — the
  expert built this by hand as `dining-028`.
- **Node-level duplication.** The same task recurs across processes — `ثبت سفارش در
  کیوسک` in `005`, `006`, `012`; table/tray cleanup split across `015/016/017`.

Per the expert's framing, the duplication is **not** a thing to fix on its own. A task
recurring across **unrelated** processes is legitimate; the same task across **closely
related** processes is a *symptom* that those processes were over-cut. Duplication is
therefore a **signal**, not a target.

## 2. Why not fix `classify`

Segmentation granularity and node richness are **coupled**: fine segments make
`extract` produce dense, detailed nodes. Telling `classify` to emit ~5 coarse
processes would make `extract` flatten each into a shallow box and **lose the granular
steps** the expert values (~95–96% detail capture is the bar). So `classify` stays
fine — it is the detail-capture engine — and consolidation happens **after** the
processes are fully built, restructuring **without discarding any node**. Fine
segmentation is the feature that feeds consolidation, not the bug.

## 3. Approach — a terminal, human-gated, whole-department reviewer

A new `consolidate` agent runs as the **automatic final stage of every
`/process-voice` run**, after `summarize`. It:

1. reads the **whole department, together** — see §4.1;
2. judges overlap **semantically** (no mechanical/CLI detector — rejected as brittle
   against Persian free-text: same task worded two ways looks different, unrelated
   tasks sharing a word look same);
3. emits a **numbered, evidence-cited list of structural suggestions** — flat-merge or
   make-subprocess ("size decides") — and proposes **nothing** without concrete
   evidence;
4. writes that list to a durable run artifact (`consolidation.json`) so it survives
   across many back-and-forth messages;
5. the human **approves suggestions one at a time**; on approval the agent runs the item
   to completion — the structural `merge` verb (§4.4) **plus** the logical-soundness
   repair pass (§4.7) that edits nodes/edges so the result reads coherently — then
   presents the finished process. It changes files **only** through the engine CLIs, and
   **only** to complete an approved item (never before approval, never elsewhere).

**Non-negotiable behaviours** (from the expert, §5): the agent must **stay silent when
the processes are already well-formed** (an empty suggestion set is a first-class,
correct outcome — no hallucinated churn); it must let the user **resolve items
sequentially** and keep the full list in mind between messages; and every message must
be **numbered** with a full problem/action explanation per item.

## 4. Design detail

### 4.1 Reviewer inputs (whole department, in full)

The agent is dispatched with, and reads in full:

- **all transcripts** for the department (the ground truth of what was said);
- **all built processes** from this run (`departments/{dept}/processes/*.json`,
  excluding tombstoned);
- **all attachment text** (`departments/{dept}/.text/*.txt` from `extract-attachment`);
- **all previously-committed processes** in the department (cross-run history — where
  much of the duplication hides).

**Scope is exactly one department — the run's own — read in full.** The reviewer reads
*every* process in `departments/{dept}/` (this run's output plus all prior committed
processes for that department) and never reads any other department. It is not bounded
*within* the department (no "only overlapping processes" cut) — consolidation needs the
whole picture of the one department at once. Cross-run scope within the department
matters: over-fragmentation and duplication accumulate across sessions, so the reviewer
must see that department's prior work, not just this run's output. (Context cost is real
but acceptable on Opus; the agent returns only a path + Persian summary, never pastes
transcripts back — NFR context control, consistent with `classify`.)

### 4.2 What the reviewer does

The agent's **trigger** is structural consolidation, expressed as two suggestion kinds
below. But its **mandate is broader than proposing them**: once an item is approved and
the structural CLI has run, the agent is responsible for leaving the affected processes
**logically sound**, which means it MAY edit node content, add/remove nodes, and
add/remove edges to restore coherent flow (§4.7). Structural consolidation is what
*starts* its work, not a cap on it.

**The two structural suggestion kinds:**

- **`merge`** — N closely-related peer processes are really one. The agent identifies
  the cluster but **does not decide the shape**; at approval time the **user chooses**
  between two shapes (§4.5):
  - **flat** — union the members' nodes into one heir, no hierarchy (like `dining-027`);
  - **mother + subprocess** — a mother process whose nodes link down to the members as
    subprocesses (like `dining-028`).
  The agent MAY note which shape it thinks fits and why (the "size decides" heuristic:
  small cohesive cluster → flat; large, separately-nameable parts → mother+subprocess)
  as a **non-binding recommendation**, but must present both as an explicit choice and
  wait for the user's decision.
- **`attach`** — an existing process is really a subprocess of a node in another
  process. Proposes re-parenting it under a named parent node.

**Still out of scope** (this agent is not a general editor): free-standing content work
unrelated to a consolidation (e.g. "polish every description"), and **splitting** a
process (the opposite of consolidation). Everything the agent edits must be **in service
of an approved merge/attach** — the trigger is always a structural consolidation; the
node/edge edits it then makes exist only to keep that consolidation sound (§4.7).
General editing outside a consolidation remains `chat-edit`'s job.

### 4.3 The suggestion contract — grounding without a detector

Because there is no mechanical detector, hallucination is prevented by a **hard
evidence rule in the suggestion schema**: every suggestion MUST cite

- the **specific process ids** involved (`dining-005`, `dining-006`, …), and
- the **specific recurring/overlapping node(s)** by id and label (e.g.
  `dining-006-n003 «ثبت سفارش در کیوسک»` also appears as `dining-012-n002`), and
- the **transcript span(s)** that show the work is the same.

A suggestion that cannot name concrete overlapping nodes is not allowed to exist. This
turns "these feel similar" into an auditable claim the human can check — and, combined
with the per-item human gate (§4.4), makes a weak suggestion cheap to reject rather
than dangerous to apply.

**`consolidation.json`** (new run artifact, written by the agent to
`runs/{dept}/{stamp}/consolidation.json`):

```json
{
  "department": "dining",
  "generated_from": "runs/dining/20260718-084824",
  "suggestions": [
    {
      "n": 1,
      "kind": "merge",
      "status": "pending",
      "problem": "<Persian: what is wrong and why these are one process>",
      "action": "<Persian: exactly what will be done, for each shape>",
      "recommended_shape": "flat | mother_subprocess",
      "chosen_shape": null,
      "processes": ["dining-005", "dining-006", "dining-008"],
      "evidence": [
        { "node": "dining-006-n003", "label": "ثبت سفارش در کیوسک",
          "also_in": ["dining-005-n007", "dining-012-n002"] },
        { "transcript": "dining-1405-04-11.txt", "text": "<verbatim snippet>" }
      ],
      "repairs": []
    },
    {
      "n": 2,
      "kind": "attach",
      "status": "pending",
      "problem": "…",
      "action": "…",
      "child": "dining-012",
      "parent_process": "dining-006",
      "parent_node": "dining-006-n010",
      "evidence": [ … ]
    }
  ]
}
```

`status` ∈ `pending | approved | rejected | applied`. **An empty `suggestions` array
is a valid, expected, and common output** — see §5.

`consolidation.json` is a **ledger, not a cap.** It records the proposed structural
consolidations (the numbered, human-gated list), each item's evidence and status, and
the `repairs` actually made when the item was applied (§4.7) — for auditability and for
the §4.5 sequential-resolution state. It does **not** enumerate or limit the edits the
agent may make to complete an approved item; `repairs` is an open record of what it did,
not a fixed menu of what it's allowed to do. The schema requires evidence on every
structural suggestion (anti-hallucination, §4.3) but places no ceiling on repair scope.

### 4.4 Apply path — existing CLIs only

The agent never touches files. On approval, the `process-voice` orchestrator runs the
matching engine verb:

| Suggestion | CLI | Notes |
|---|---|---|
| `merge` (flat) | `merge restructure --plan <plan.json> --run …` | plan = `restructure.schema.json`: one heir whose `candidate` is the **assembled union** of the members' nodes, `supersedes: [members]`; originals tombstoned (INV-4) |
| `merge` (mother + subprocess) | `merge restructure` with `subprocess_links` on the heir | reproduces the `dining-028` shape by construction |
| `attach` | `merge attach-subprocess --parent-process P --node N --child C --run …` | pure re-parent of committed ids; no authoring |
| retire w/o heir | `merge remove --process P` | tombstone, never delete |
| **soundness repair** (§4.7) | `merge update --process P --delta <delta.json> --run …` | run *after* the structural verb to fix the seam — `add_edges`/`remove_edges`/`add_nodes`/`revise_nodes`/`enrich_nodes` on the affected parent/child |

**The one new authoring step:** a flat `merge` needs an **heir candidate** — a full
IDEF process body. Today `extract` builds that from a transcript; here it is assembled
from the **existing members' nodes** (union the nodes, drop the recurring duplicate,
carry the edges/junctions). This is LLM work but **grounded** — the members' real nodes
are already in the agent's context, so it re-assembles existing nodes rather than
inventing them. `attach` needs no authoring at all. Assembly happens **at apply time
for the specific approved item**, not up front for the whole list.

### 4.5 Interaction model — numbered, sequential, stateful

- **Numbered Persian report.** When suggestions exist, the checkpoint message lists
  them `۱، ۲، ۳…`, each with **(الف)** the problem, **(ب)** the intended action, and
  **(ج)** the relevant ids when helpful — read straight from `consolidation.json`.
- **One at a time.** The user may spend several messages resolving item 1 (asking
  questions, adjusting scope, approving) before moving to item 2. State lives in
  `consolidation.json` (`status` per item), so the conversation can span many turns and
  even resume later without losing the list. The orchestrator always re-reads the file
  rather than relying on conversational memory.
- **User chooses the shape (merge items).** For a `merge` item, approval is a
  two-part act: the user first picks **flat** vs **mother + subprocess** (the agent may
  state its `recommended_shape` and reasoning, but must ask and wait), then confirms.
  The chosen shape is written to `chosen_shape` before the item is applied, and it
  selects the apply path in §4.4 (flat → `restructure` union heir; mother+subprocess →
  `restructure` heir with `subprocess_links`). `attach` items have no shape choice.
- **Approval runs the item to completion, then shows the result.** Once the user
  approves an item (and picks its shape, for a merge), the agent does **everything** that
  item needs — the structural CLI *and* the full logical-soundness pass (§4.7),
  including any overwrites — **without further prompts**, marks it `applied`, and then
  **presents the finished process(es)** to the user (node flow / short Persian summary,
  ids included) so they can see the completed outcome. Only after that does attention
  move to the next item.
- **Sequential-apply staleness guard.** Applying item 1 can tombstone ids that a later
  item references (e.g. item 2 names `dining-006`, but item 1 merged it into a new
  heir). Therefore, **before applying any item**, the orchestrator re-validates that
  the item's referenced process/node ids still exist and are not tombstoned. If an id
  moved, the item is marked stale and the agent **re-explains it against current
  state** (or withdraws it) before the user acts. Items are never applied blindly from
  a list that may have shifted under them.
- **No auto-apply.** Nothing is applied without explicit per-item approval (INV-5).
  Rejected items are recorded `rejected` and not raised again this run.

### 4.6 Re-runs across runs

The report is **per-run**. Unapplied suggestions are not carried forward as stored
state; instead, the **next run's reviewer re-derives** consolidation from the current
whole-department snapshot. A still-valid over-cut simply reappears; a since-fixed one
does not. This keeps cross-run behaviour stateless and self-correcting while §4.5 keeps
within-run behaviour stateful.

### 4.7 Logical-soundness pass (after every applied structural change)

Re-parenting or merging is not finished when the CLI returns — a structurally-correct
result can still be **logically broken**. So immediately after the structural verb runs
for an approved item, the agent re-reads the affected processes and checks the **seams**,
then edits (via `merge update --delta`) whatever is needed to make the flow read
coherently. This is the part the expert specifically asked for.

**`attach` seam check** (child `C` becomes the subprocess of node `N` in parent `P`):

- **Entry seam.** What flows *into* `N` in `P` (the preceding node/edge and `N`'s input
  ICOM) must line up with `C`'s **first** activity. If `C`'s opening step does not
  continue from what `N` receives, fix it — add a bridging edge/node, adjust `C`'s first
  node, or reconcile the ICOM.
- **Exit seam.** `C`'s **last** activity must produce what the node *after* `N` in `P`
  consumes. If the tail of `C` doesn't lead into `N`'s successor, fix it.
- **Boundary sync.** `merge attach-subprocess` already syncs `N`'s ICOM to `C`'s `idef0`;
  the agent verifies that sync still makes sense and repairs it if the seam edits changed
  the boundary.

**`merge` seam check:**

- *Flat* — after unioning members and dropping the recurring duplicate node, rewire the
  surrounding edges so the result is one continuous flow: no dangling edges left by the
  dropped duplicate, no two parallel copies of the same path, junctions still valid.
- *mother + subprocess* — apply the `attach` entry/exit seam check to **every** mother
  node that links down to a member subprocess.

**What a repair may touch:** `add_edges`, `remove_edges`, `add_nodes` (a bridging step),
`revise_nodes` (relabel/re-describe so the seam reads correctly), `enrich_nodes` (fill an
empty ICOM field). Each repair the agent makes is appended to that item's `repairs[]` in
`consolidation.json` (id + what changed + why) so it's auditable.

**Item-level approval = full completion authority (INV-5).** Approving an item grants
the agent authority to make **every** edit that item needs to be complete — with **no
further prompts**. That explicitly includes **overwriting already-filled node values**
(relabel/re-describe an existing step via `revise_nodes`), adding edges/bridging nodes,
removing dead edges, and filling ICOM — whatever it takes. The agent does not stop to
ask per repair; it finishes the item, then **presents the completed process(es) back to
the user** for review (§4.5).

This is an **intentional, scoped relaxation of INV-5**: INV-5 normally requires human
approval before overwriting any already-filled value; here the **single per-item
approval is that human gate**, authorizing the full set of edits the consolidation
requires. It is bounded — the authority applies only to the processes named by the
approved item and only to edits needed to complete *that* consolidation; it is not a
license to edit elsewhere. Originals are tombstoned, not deleted (INV-4), and every edit
is logged in `repairs[]` and recoverable via git, so a result the user dislikes on
review can be reverted.

The single most important behaviour: **the agent must not manufacture suggestions to
seem useful.** Explicit prompt rules:

- Default to proposing **nothing**. Emit a suggestion **only** when you can name the
  concrete overlapping nodes and transcript evidence required by §4.3.
- Node recurrence across **unrelated** processes is legitimate → **never** suggest on
  it. Only recurrence across **closely related** processes is a signal.
- Uncertain? Do **not** suggest. A missed consolidation is recoverable next run; a
  wrong merge costs the expert real cleanup.
- When nothing qualifies, write `suggestions: []` and send a short Persian "no
  consolidation needed" note — a **success**, not a failure.

This is enforced structurally (schema forbids evidence-free suggestions) and
behaviourally (prompt bias toward silence), and back-stopped by the human gate.

## 6. Files touched

| File | Change |
|---|---|
| `data-repo/.claude/agents/consolidate.md` | **new** — the reviewer agent (inputs §4.1, structural suggestions §4.2, contract §4.3, logical-soundness pass §4.7, silence rules §5) |
| `data-repo/.claude/skills/process-voice/SKILL.md` | **new final stage** — dispatch `consolidate`; render numbered Persian report; per-item approval loop with shape choice + staleness guard (§4.5); apply via existing verbs (§4.4) followed by the seam-repair pass (§4.7, `merge update --delta`) |
| `schemas/consolidation.schema.json` (code-repo) | **new** — validates `consolidation.json` (evidence-required per structural suggestion; open `repairs[]` ledger per item); wired into `validate` + `make test` |

No changes to `classify`, `extract`, `summarize`, `idef-extraction`, `merge`,
`allocate-id`, or any process/UI schema.

## 7. Testing

- **Silence:** on a well-formed department (no over-cut), the agent returns
  `suggestions: []` and the "no consolidation needed" note. (Guard against the failure
  mode the expert named.)
- **Merge detection:** on the `dining` `b5ab354` snapshot, it proposes merging
  `001–004` and consolidating the `005…019` customer journey, each citing the recurring
  kiosk-order / cleanup nodes — matching the expert's manual `027`/`028`.
- **Evidence rule:** a suggestion without concrete node/transcript citations fails
  `consolidation.schema.json` validation.
- **Apply path:** an approved flat `merge` produces a `restructure` plan that
  `merge restructure` accepts; superseded originals are tombstoned; every **distinct**
  member node survives in the heir (only the recurring duplicate is collapsed to one).
- **Staleness guard:** approving item 1 (which tombstones an id referenced by item 2)
  causes item 2 to be re-explained against current state before it can be applied.
- **Seam repair (attach):** after re-parenting `C` under node `N` of `P` where `C`'s
  first node does not continue from `N`'s input, the agent adds the bridging edge/node
  via `merge update --delta`, and the repair is recorded in the item's `repairs[]`.
- **Full completion on one approval:** approving an item runs the structural verb *and*
  every soundness repair — including a `revise_nodes` overwrite of an already-filled node
  label — with no further prompts, then presents the completed process. (Verifies the
  per-item authority of §4.7, not a per-repair gate.)

## 8. Open questions for review

- ~~Flat vs mother+subprocess — agent's call or user's?~~ — **resolved:** the **user
  chooses** per merge item; the agent only recommends (non-binding) and must ask and
  wait. (§4.2, §4.5)
- ~~Context budget / cross-run scope~~ — **resolved:** exactly one department (the
  run's own), read in full; never other departments; not bounded within the
  department. (§4.1)
- ~~Repair auto-apply threshold~~ — **resolved:** one approval per item grants full
  completion authority. The agent makes **every** edit the item needs — including
  overwriting already-filled values — with no further prompts, then presents the
  finished process. This is an intentional, scoped relaxation of INV-5 to per-item
  granularity. (§4.5, §4.7)
