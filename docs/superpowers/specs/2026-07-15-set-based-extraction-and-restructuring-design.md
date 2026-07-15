# Set-based extraction & process restructuring

**Date:** 2026-07-15
**Source:** domain-expert testing of the per-recording pipeline; follow-up to
`2026-07-15-extraction-segmentation-and-node-visibility-design.md` (whose prompt
changes are landed and tested).
**Scope:** the pipeline that turns department interview recordings into IDEF0/IDEF3
process models — `process-voice`, `classify`, `extract`, `summarize`,
`idef-extraction`, and the `merge`/`allocate-id` engine + schemas.
**Deliverable:** **not** prompt-only. Schema changes, new engine operations, a new
id-durability mechanism, agent-prompt rewrites, and UI changes. Recommended to be
implemented in three phases (see §9).

---

## 1. Problem

Today the pipeline runs **one recording at a time**. The first recording produces
the baseline set of processes; every later recording is applied to that baseline as
a **patch** (`new`/`update`/`unchanged`).

The domain expert's objection is not that patching is broken — it is that **a single
recording never contains a complete process**. What staff describe in the first
meeting is routinely reworked in the third or fourth: detail added, rules changed,
sequence rearranged. So the pipeline builds its foundation from the *least reliable*
material it has, then spends the rest of the run defending it. Two consequences,
both confirmed in testing:

- **A wrong baseline is never corrected, only extended** — patching cannot undo a
  structural decision made from partial information.
- **Genuinely new processes cannot emerge** — material that should have been
  separate gets attached to the existing structure instead (the de-duplication
  failure).

When the expert bypassed the flow and handed **three recordings in at once**, she
got a materially better result (~95–96% detail capture). **That behaviour — read all
the raw material together — is what this round makes the pipeline's only behaviour.**

## 2. Root cause (file-level attribution)

The "one transcript" assumption is baked in at these points:

- **Run identity is a single voice.** `process-voice/SKILL.md` is invoked as
  `/process-voice <voice>` (one audio basename); `run_dir = runs/{voice}/`;
  `run-meta.schema.json` and `segments.schema.json` both require a single `voice`
  string.
- **`classify.md`** takes one `transcript_path`, reads one transcript;
  `transcript_excerpt` is a slice of that one file; **Step 4 "Align to existing
  boundaries"** locks in the first recording's boundaries — the exact thing that
  must become revisable.
- **`extract.md`** takes one `transcript_path` + one `transcript_excerpt`.
- **`summarize.md`** takes one `transcript_path`.
- **`merge` engine** (`engine/merge/__init__.py`): `source.ref = _voice_ref(run)` is
  a single voice. More importantly, the operation set is `new` / `update` /
  `accept` / `reject` only. `build_update` can `add_nodes`, `add_edges`,
  `enrich_nodes` (fill-empty or raise a `pending` conflict), and `flag_removed`
  (set `removed:true` on a node). **There is no operation to merge two processes,
  split one, remove an edge, revise a committed value, or re-parent a process** —
  so restructuring is impossible and req 5 is genuinely new engine code + schema.
- **`allocate_id/__init__.py`**: `next_process_id` derives the next id by scanning
  existing files for the max ordinal, so a **deleted** process's id can be reused.

## 3. Decisions taken

1. **Unit of work is a SET of transcripts (req 1).** Given either (a) a department —
   the set is all its recordings — or (b) an explicit list. **One path**; a set of
   one is simply the smallest case. No mode/flag/branch for one-vs-many or
   department-vs-list.
2. **Read the raw transcripts, in full, every run. No distillation, ever.** A
   mandatory digest would reintroduce the exact compression failure one layer down
   and unrecoverably. Context budget is handled by running the reasoning agents on
   the **largest-context Opus** and, if a set genuinely exceeds that budget,
   **stopping with an explicit message** — never silently compressing or reverting
   to one-at-a-time.
3. **Gate A — set confirmation (new, blocking)** before any transcription: disclose
   the set and (for the list form) what is being left out; wait for confirmation.
4. **Transcribe-missing reconcile** runs *after* Gate A, only for the confirmed set;
   idempotent; the fresh-transcription "is this verbatim, not summarized?" gate
   applies per newly-produced file.
5. **`supersedes` relation** replaces the scalar `match.existing_id`, expressing the
   full restructuring space (new/update/unchanged/merge/split).
6. **Restructuring: mint new ids, tombstone originals** (`superseded_by`), with
   **full hierarchy redirect** (hierarchy-closed set + declared `subprocess_links`;
   refuse dangling/cycles).
7. **Tombstones are shown in the UI, labelled**, with links to their heirs, and are
   **user-deletable** (a deliberate, human-initiated hard delete — the allowed
   exception to "never delete"; automatic deletion never happens).
8. **IDs are never reused, even after permanent delete** — via a durable per-department
   id ledger.
9. **One behaviour for subset vs. whole-department runs.** No "more conservative on a
   subset" mode: Gate B (human approval before any write) plus the reversibility of
   merge/split make conservatism unnecessary.
10. **Migration is reconcile-in-place** — the restructuring machinery *is* the
    migration; no wipe, no separate tool.
11. **`classify` Step-4 alignment bridge is removed** and replaced with "committed
    boundaries are provisional — propose restructuring, don't align."
12. **Manual (record-less) process input (req 4)** enters as a text evidence file in
    the set; derived processes get `source.type: "manual"`.
13. **Direct conversational edits (no voice).** A user may, without processing any
    recording, instruct a targeted edit of committed work ("change node X's label in
    process Y"). This is a first-class capability that reuses the engine op set, still
    goes through `merge` (never a direct write), is marked `source.type: "chat"`, and
    **is committed to git by Claude**. Every mutation Claude makes to committed data on
    user instruction — pipeline run or chat edit — ends in a commit; nothing is left
    uncommitted.

## 4. Design

### 4.1 The run — one path, department-scoped

Invocation resolves a **set of recordings** for one department:
- **By department** (default): the set = every recording the department has
  (`meetings/transcripts/{dept}-*.txt` ∪ any `{dept}-*` audio without a transcript).
- **By explicit list:** the set = exactly the named recordings; department inferred
  from filenames. The user's selection is authoritative — never silently widened,
  never refused for being incomplete.

Run identity is department-scoped: `run_dir = runs/{department}/{stamp}/`;
`meta.json` records the department and the full transcript set (no single `voice`).

**Stage order** (the read-all spine):

| Stage | Action | Pauses? |
|---|---|---|
| 0 | resolve state / resume (must re-enter at Gate A or Gate B) | — |
| — | resolve the set (dept glob or explicit list) | — |
| **A** | **set-confirmation checkpoint** — list the set + what's left out; wait | **STOP** |
| 1 | transcribe any confirmed recording missing a transcript (idempotent; per-file verbatim gate) | — |
| 2 | init `runs/{department}/{stamp}/meta.json` | — |
| 3 | `classify` reads **all** transcripts in full, segments over the whole set | — |
| **B** | **segmentation/restructure checkpoint** — proposed set + ops + evidence + contradictions; wait | **STOP** |
| 5a | `extract-attachment {dept}` | — |
| 5 | `extract` per desired process (serial), from all its mentions | — |
| 6 | `merge` per artifact (`new`/`update`/`restructure`/`attach-subprocess`/`remove`) | — |
| 7 | `summarize` reads the whole set → `overview.json` | — |
| 8 | finish meta + `git commit` | — |
| 9 | report (auto-subprocesses, conflicts, restructure lineage, completion) | end |

Two legitimate pause points (Gate A, Gate B); everywhere else the orchestrator
continues in one turn (existing turn-discipline rules carry over). Stage 0 resume
must recognise "set resolved, not yet confirmed" (re-enter Gate A) and "classified,
not yet confirmed" (re-enter Gate B).

**Context budget (open Q6).** classify/extract/summarize run on the largest-context
Opus available; a realistic department set (single-to-low-double-digit transcripts;
dining's three are ~240 KB / ~60–80 K tokens) fits comfortably. If a set exceeds the
budget the run **stops and names the set, its size, and the limit**, asking the user
to narrow it or raise the context. No compression, no distillation, no silent
per-transcript degradation exists in the design.

### 4.2 Assembly and de-duplication (req 2)

Because the run reads every transcript raw and together, "assemble a process from all
its mentions" is a `classify` reasoning instruction, not plumbing: sweep the whole
set, gather every mention of a process wherever it appears, emit **one** process for
it — never near-duplicates from the same work described twice. A step mentioned once
in the last session is as real as one mentioned in every session.

The one data change: `segments.transcript_excerpt` (a slice of one file) becomes
**`evidence: [{transcript, text}, …]`** — every mention feeding this process, tagged
with its source transcript. This drives the Gate-B display and tells `extract` which
raw spans to pull across files.

### 4.3 Supersession and contradictions (req 3)

Transcript filenames carry the session date, so the set is orderable. Within a run,
`classify` **resolves later-supersedes-earlier itself** before emitting: a later
session that reworks an earlier description yields one process reflecting the winning
account (prefer the more specific/operational one), not two variants.

- **`update` gains a revise capability.** Today `enrich_nodes` fills empty fields or
  raises a `pending` conflict; it cannot overwrite. Req 3 needs supersession, so the
  delta gains **`revise_nodes: [{id, set}]`** (overwrite specific committed node
  fields, with provenance). Every revision is **shown at Gate B before it is
  written**, so overwrite is safe.
- **Genuine contradictions** the agent cannot resolve by date/specificity are not
  silently picked: they surface at Gate B with both accounts identified, and if left
  unresolved become a `pending` row (existing conflict mechanism).

### 4.4 The `supersedes` relation (replaces the scalar match)

Each *desired* process the run wants the department to have carries
**`supersedes: [committed_id, …]`**:

| `supersedes` | Meaning | Gate-B status |
|---|---|---|
| `[]` | nothing committed matches | **new** |
| `[X]`, changed | one committed process, revised | **update** |
| `[X]`, identical | one committed process, no change | **unchanged** |
| `[X, Y]` | two committed processes are really one | **merge** |
| two desired each list `[X]` | one committed process is really two | **split** |

Plus two explicit op arrays in `segments.json`: **`tombstone: [id]`** (remove, no
heir) and **`attach_subprocess: [{parent_process, parent_node, child}]`**.

### 4.5 Restructuring execution (req 5) — new engine operations

**Update-in-place vs. restructure — the one-to-one test (read this first).** A
committed process is **tombstoned and replaced with a new id only when its *identity*
changes** — i.e. when the mapping between committed and desired processes is **not
one-to-one**: a merge (2+ committed → 1 desired), a split (1 committed → 2+ desired),
or a removal. **Any other change to a process that stays *one* process is an in-place
`update`, never a tombstone** — regardless of how large the change is. Renaming a node,
adding or dropping steps, revising labels/descriptions/actor/icom (`revise_nodes`),
re-routing flow and deleting the stale edge (`remove_edges`), flagging a node removed:
all are deltas applied to the same file, so the process **keeps its id, its node ids
stay stable, and manual UI edits and manual layout positions survive**. Do not tear a
process down and rebuild it just because its contents changed a lot — tombstone +
mint-new is disruptive (id churn, lost node ids/manual edits) and is reserved for
genuine identity change. Implementer test: *count the committed processes on each side
of the mapping — exactly one↔one ⇒ `update`; anything else ⇒ restructure.*

- **`new` (supersedes [])** → `candidate` → `merge new` (existing path).
- **`update` (supersedes [X], 1:1)** → `delta` → `merge update` (existing path, now
  with `revise_nodes` + `remove_edges`).
- **`merge` / `split`** → new verb **`merge restructure`**: builds each heir as a
  fresh full process with **new ids**, **tombstones** every superseded original
  (`superseded_by: [heir_ids]` + tombstoned flag), and **redirects hierarchy
  pointers**.
- **`attach-subprocess`** → new verb: re-parent an **existing** process X under node
  N of process P — sets `X.parent = {P, N}`, `P.node[N].subprocess = X`, syncs
  `N.icom = X.idef0`; validates N is an activity node with no existing sub-process
  and X is not an ancestor of P (no cycle). **X keeps its id** (re-parent, not
  rebuild).
- **`remove`** → new verb: tombstone a committed process with `superseded_by: []`.
  Never a delete.

**Full hierarchy redirect (decision).** Because fresh ids destroy old node identity,
redirect is made tractable by two rules:
1. **Hierarchy-closed restructure set.** The desired set must include *every* process
   whose links are affected (a merged/split process's parent box and/or child
   sub-processes travel with it). Splitting a child sub-process forces its parent box
   to split too (the box boundary *is* its sub-process), so the parent is pulled into
   the same set. If the set would leave a pointer dangling, the engine **refuses and
   names the missing process**. A neighbour that is otherwise unaffected has only its
   single `node.subprocess` pointer retargeted.
2. **Declared `subprocess_links`.** The restructure input carries an explicit map
   (heir temp-node-key → existing child pid, and the inverse for parents); the engine
   executes it deterministically and allocates all real ids (INV-1 preserved).

### 4.6 In-graph editing (req: add-and-connect, edge hygiene)

- **Add new nodes wired to existing nodes** already works: a delta's `add_nodes` +
  `add_edges` may reference **real existing ids** in `from`/`to`. No new mechanism.
- **Edge hygiene (new).** A delta can add edges but not remove one, so inserting a
  node between 1 and 2 leaves a stale `1→2` edge beside `1→new→2`. Fix:
  **`delta.remove_edges: [{from, to}]`**, applied by `merge update` (hard delete —
  edges are structure, not the content INV-4 protects), re-layout afterward. It is
  the **agent's judgment, executed by the engine**: `extract` gains an edge-hygiene
  rule — when you attach a node onto a path or re-route flow, emit the now-redundant
  edge in `remove_edges`; the engine never guesses which edge to drop. Edge changes
  are shown at Gate B.

### 4.7 Tombstone lifecycle & UX

A tombstoned process stays on disk (`superseded_by` + tombstoned flag), is **excluded
from `classify` matching** and from the active board, but is **shown in the UI,
labelled "tombstoned," linked to its heir(s)** and **view-only**. The user may
**permanently delete** a tombstone from the UI — a deliberate hard delete (the allowed
INV-4 exception; nothing is ever deleted automatically or silently). `ui-backend`'s
existing delete path is extended to tombstones rather than a second delete invented.

### 4.8 IDs never reused — durable ledger

Add a per-department **`departments/{dept}/.id-seq.json`** (committed, not gitignored)
holding the highest process ordinal ever allocated. `allocate-id.next_process_id`
becomes **`next = max(scan_of_existing_files, ledger) + 1`, then persist `ledger =
next`** (ledger only moves up). Tombstoning keeps the file (scan sees it);
**permanent delete removes the file but the ledger holds the high-water mark**, so the
ordinal is never handed out again. Node/junction ids are scoped under a process id
(`{pid}-nNNN`, `{pid}-jN`), so a never-reused process id makes its node ids
collision-free too. Guarantee: **monotonic, never reused, across tombstone,
restructure, and permanent delete.**

### 4.9 Access model — unchanged and load-bearing

Agents have **read-only** access to committed `process.json`; **`merge` is the sole
writer** (hook-enforced). An agent reads an old process to learn its real ids, then
**emits a JSON artifact** (`delta` / heir `candidate` / restructure plan / attach /
tombstone) referencing ids it copied verbatim (never invented) plus temp keys for new
nodes; the human approves at Gate B; the deterministic engine writes. Preserved
invariants: INV-1 (only `allocate-id` mints ids; agents never set `superseded_by`,
`position`, `layout`, `source`), INV-3 (no fabrication), INV-4 (never
delete/lose — restructure tombstones), and determinism (id allocation, layout,
redirect, tombstoning are engine code).

### 4.10 Gate-B checkpoint contents

The department's proposed process set, in shift order, each item labelled by op
(new/update/unchanged/merge/split/attach/remove), with: the committed id(s) it
supersedes; attributed evidence (`مستند به: «…» (transcript)`) spanning sessions;
node/edge changes (`revise_nodes`, `remove_edges`); a lineage line for
merge/split/attach; and flagged contradictions with both accounts. Plus, carried from
Gate A, which recordings were left out (list form).

### 4.11 Last round's prompt changes — fit

- 3-parameter segmentation (classify Step 2a), node-visibility/title rules and the
  semantic sub-process criterion (idef-extraction) are transcript-agnostic →
  **slot in unchanged**; the shift-walk fits *better* over a full set.
- **Two touch-points:** Step-4 alignment bridge **fights req 5 → removed** (§4.4/§4.5);
  Step-2a's "a single recording is often partial" phrasing → **generalised to "the
  set may be partial."** Nothing else conflicts.

### 4.12 Direct conversational edits (no voice)

A user may open a chat and, **without processing any recording**, instruct a targeted
edit of committed work — "change node X's label in process Y", "add a step after Z",
"remove that edge", "merge these two processes", "delete this one". This is a
first-class capability that **reuses the entire engine op set** built for the pipeline.

Flow (a new data-repo skill, e.g. `edit-process`):
1. **Read** the target `process.json` (read-only) to obtain its real ids.
2. **Construct the matching engine artifact** in terms of the ids just read (never
   invented): a `delta` (`revise_nodes` for a field/label change, `add_nodes` +
   `add_edges` to insert a step, `remove_edges` for edge hygiene, `flag_removed` to
   drop a node), or a restructure / `attach-subprocess` / `remove` for a structural
   change.
3. **Confirm proportionally.** A simple, non-destructive edit (a field change, adding
   a node/edge) executes directly; a destructive/structural edit (delete/tombstone,
   merge, split, attach) shows a one-line confirmation first — the proportional
   analogue of Gate B.
4. **Run the matching `merge` verb** — the sole writer — which applies the change,
   re-layouts, and preserves all ids and prior manual edits.
5. **Commit to git.** Claude commits with a clear message, e.g.
   `chat-edit({pid}): <summary>`; provenance is `source.type: "chat"` and the touched
   node's `touched_by` records the edit. The deploy `git-push` cron then pushes it,
   exactly like a pipeline commit.
6. **Report** what changed.

This preserves the §4.9 access model exactly: a chat edit **never writes
`process.json` directly** — it goes through `merge` like everything else, so INV-1/3/4
and the hook-enforced sole-writer rule all still hold. The only differences from the
pipeline are the input (a chat instruction, not transcripts) and the absence of the
read-all/segment phase, which a targeted edit needs neither of.

## 5. Open questions — answered

- **Smallest change (Q1):** not tiny, but bounded. "One transcript" is baked into run
  identity + three agents' inputs + two schemas, and req 5 needs new engine ops. The
  diff is moderate and concentrated (§6), not sprawling.
- **Subset behaviour (Q2):** one behaviour — no conservative mode; Gate B +
  reversibility suffice.
- **Re-read duplication (Q3):** re-reading raw is the *enabler* of restructuring, not
  a problem; duplication is prevented by reconciling desired processes against
  committed ones via `supersedes`.
- **Excerpt across files (Q4):** `evidence: [{transcript, text}]`; `extract` receives
  the whole set + the process's evidence + any superseded process.json; only Gate B
  and provenance care which file a span came from.
- **Step-4 bridge (Q5):** removed/replaced (§4.4).
- **Context budget (Q6):** §4.1 — read raw, largest-context Opus, explicit hard-stop,
  no silent fallback.
- **Migration (Q7):** reconcile-in-place; the restructuring machinery is the
  migration (§3, decision 10; §4.5).
- **Checkpoint (Q8):** §4.10.

## 6. Files changed

### Prompt (data-repo)
| File | Change |
|---|---|
| `.claude/skills/process-voice/SKILL.md` | reworked into the set-based orchestrator: set resolution, Gate A, transcribe-missing, read-all, classify-over-set, Gate B, per-process extract, merge incl. restructure/attach/remove, summarize-over-set, commit, report; two gates + resume |
| `.claude/agents/classify.md` | set input; segment over the set; `evidence[]`; `supersedes` + `tombstone`/`attach`; contradictions; **remove Step-4 bridge**, replace with "boundaries provisional, propose restructuring"; generalise Step-2a |
| `.claude/agents/extract.md` | set + attributed evidence + superseded process(es) as input; `revise_nodes`, `remove_edges` (edge-hygiene rule), attach linkage, `subprocess_links` |
| `.claude/agents/summarize.md` | read the whole set |
| `.claude/skills/idef-extraction/SKILL.md` | edge-hygiene / revise / remove_edges / subprocess-link contract (node-visibility rules unchanged) |
| **new** `.claude/skills/edit-process/SKILL.md` | direct conversational edit (no voice): read target, build engine artifact, confirm destructive ops, run `merge`, commit with `source.type: "chat"` (§4.12) |

### Schemas (code-repo/schemas)
| File | Change |
|---|---|
| `segments.schema.json` | `voice` → `department` + `transcripts`; `transcript_excerpt` → `evidence[]`; `match.existing_id` → `supersedes[]`; add `tombstone[]`, `attach_subprocess[]`, contradictions |
| `delta.schema.json` | add `remove_edges[]`, `revise_nodes[]` |
| `process.schema.json` | add optional `superseded_by[]` + tombstoned flag |
| `run-meta.schema.json` | `voice` → `department` + `transcripts`; extend `processes[]` statuses/fields |
| **new** `idseq.schema.json` | the per-dept id ledger (optional validate) |

### Engine (code-repo/engine)
| File | Change |
|---|---|
| `allocate_id/__init__.py` | durable id ledger (`max(scan, ledger)+1`, persist); keep in-batch `reserved=` |
| `merge/__init__.py` + `merge/cli.py` | new verbs `restructure`, `attach-subprocess`, `remove`; `update` gains `remove_edges`+`revise_nodes`; hierarchy-closure/redirect/cycle/dangling validation; re-layout after edge removal |
| `validate/cli.py` | register changed/added schemas |

### UI (code-repo/ui + ui-backend)
| File | Change |
|---|---|
| `ui-backend` | render/serve tombstoned state + `superseded_by`; extend delete path to tombstones |
| `ui` | display tombstoned processes labelled, with heir links + permanent-delete action |

## 7. Non-goals

- No change to node-visibility/title rules or the semantic sub-process *criterion*
  (last round; unchanged).
- No re-architecture of transcription (audio→transcript stays per-recording,
  upstream).
- No automatic deletion of any process — only user-initiated deletion of tombstones.
- No "conservative subset" mode; no per-voice or batch mode.

## 8. Acceptance test (dining: `1405-04-11`, `-04-14`, `-04-15`)

1. **All-at-once, clean slate:** run over the whole dining set → one coherent process
   set assembled from all three, later sessions superseding earlier, no
   near-duplicates; compare against the expert's "three-at-once" gold result.
2. **Convergence one-at-a-time:** run `{04-11}`; then `{04-11, 04-14}`; then all three
   — each later run **restructures** the committed set (force one merge-two-into-one
   and one split-one-into-two) so the end state matches test 1. Proves req 5.
3. **Tombstone lifecycle:** verify `superseded_by`; ids never reused (incl. after
   permanent delete of the highest id); UI shows tombstones labelled; permanent
   delete works.
4. **Gates:** Gate A pauses and accepts set edits; Gate B pauses and accepts
   segmentation/restructure edits; the explicit-list form shows the left-out
   recording.
5. **`attach-subprocess`** (promote an existing process under a node) and
   **edge-hygiene** (insert a node between two; confirm the stale edge is removed)
   are exercised.
6. **Manual input:** add a record-less process by text; verify `source.type:
   "manual"`.
7. **Direct chat edit:** with no voice processed, "change node X's label in process
   Y" → `merge` applies it via a `delta`, `source.type` is `"chat"`, Claude commits
   it (`chat-edit(...)`), and the working tree is clean afterward. A destructive chat
   edit (delete/merge) confirms first.

## 9. Implementation phasing (for `writing-plans`)

One design, three independently-testable phases:

- **Phase 1 — engine + schemas.** Durable id ledger; `delta` `remove_edges`/`revise_nodes`
  and `merge update` support; `merge restructure`/`attach-subprocess`/`remove` with
  hierarchy redirect + tombstones; `process.schema` `superseded_by`; `validate`
  registration; engine tests. (No LLM involved — fully unit-testable.)
- **Phase 2 — set-based orchestration + agent prompts.** `segments`/`run-meta` schema;
  `process-voice` rework (two gates, set resolution, transcribe-reconcile); `classify`
  (set read, `supersedes`, evidence, Step-4 removal); `extract` (set + revise +
  edge-hygiene + attach); `summarize` (set); the `edit-process` skill for direct chat
  edits (§4.12, reuses Phase-1 ops). Validated on the dining set.
- **Phase 3 — UI.** Tombstone display + heir links + permanent delete in `ui`/`ui-backend`.

Each phase gets its own implementation plan.
