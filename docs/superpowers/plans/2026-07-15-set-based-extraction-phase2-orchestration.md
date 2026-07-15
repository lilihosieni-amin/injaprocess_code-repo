# Set-Based Extraction — Phase 2: Orchestration + Agent Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the per-recording pipeline into a **set-based, department-scoped** pipeline that reads every transcript of a department together, proposes restructuring (merge/split/attach/tombstone) against committed work, and pauses only at two gates. Deliver the two consuming schemas (`segments`, `run-meta`) and the five prompt-file reworks (`process-voice`, `classify`, `extract`, `summarize`, `idef-extraction`) plus one new prompt skill (`edit-process`), per design spec §9 Phase 2.

**Architecture:** Two of the changes are **schemas** in `code-repo/schemas` (validated by the `validate` CLI, which auto-loads any `<name>.schema.json` from `SCHEMA_DIR`/`schemas` — no registration code needs editing). Everything else is **markdown prompt files** in `data-repo` (the extraction brain — INV-2), consumed by Claude Code subagents. The engine verbs and Phase-1 schemas (`restructure`, `delta.remove_edges`/`revise_nodes`, `process.tombstoned`/`superseded_by`, the durable id ledger) are a **LOCKED CONTRACT already built in Phase 1** — this plan **consumes them as-is and never rebuilds them**.

**Tech Stack:**
- Schemas: JSON Schema draft 2020-12 in `code-repo/schemas`. Verification is a `python -c json.load` parse plus a `validate`-based positive/negative check against a tiny instance.
- Prompts: Markdown consumed by subagents; no automated semantic test exists. The "failing test → edit → passing test" cycle for a prompt edit is: a baseline `grep -n` proving the old text is present, the edit, then a `grep -n` proving the new text is present and the old text gone, plus a whole-file Read for consistency. This mirrors the style of the landed plan `code-repo/docs/superpowers/plans/2026-07-15-extraction-segmentation-and-node-visibility.md`.

## Global Constraints

- **Repos & branches.**
  - Schema edits are in **code-repo**: `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo`. Before Task 1, create a branch: `git -C "<code-repo>" checkout -b feat/set-based-extraction-phase2` (code-repo is currently on `main`).
  - Prompt edits are in **data-repo**: `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo`. Before Task 3, create a branch: `git -C "<data-repo>" checkout -b feat/set-based-extraction-phase2` (data-repo is currently on `main`).
  - Throughout this plan, `<code-repo>` and `<data-repo>` are the two absolute paths above. Run every prompt `grep`/commit from the data-repo root; run every schema `validate` with `DATA_ROOT`/`SCHEMA_DIR` reachable (the `validate` CLI defaults `SCHEMA_DIR` to `<code-repo>/schemas`).
- **Emitted values stay Persian.** All `label`, `description`, `summary`, `actor`, ICOM, `process_name`, and evidence `text` values the agents emit remain Persian (idef-extraction §preamble, ARD §4.4). Prompt *instructions* are English; only examples/emitted text are Persian.
- **INV-1 — ids are engine-only.** Only `allocate-id` (via `merge`) mints ids; agents never set `superseded_by`, `position`, `layout`, `source`, or any real id. Agents read real ids from `process.json` and copy them verbatim; new nodes use temp keys (`n1`, `j1`, …). Tombstoned processes are **excluded from classify matching**.
- **INV-3 — no fabrication.** Nothing may be invented to fill a template; the segmentation anti-inference guard is INV-3 at the segmentation layer.
- **INV-4 — never delete/lose.** Restructuring **tombstones** originals (`superseded_by` + tombstoned flag); it never deletes. The only hard delete is user-initiated in the UI (Phase 3, out of scope here).
- **`merge` is the sole writer** of `departments/**/processes/*.json` (hook-enforced). Every agent has read-only access to committed `process.json`; a chat edit goes through `merge` exactly like a pipeline run.
- **One path — no per-voice / batch / conservative mode.** A set of one is simply the smallest case; there is no mode/flag/branch for one-vs-many or department-vs-list, and no "more conservative on a subset" behaviour (spec §3 decisions 1, 9).
- **The two gates (Gate A, Gate B) are the only mid-run pauses.** Everywhere else the orchestrator continues in the same turn (the existing turn-discipline rules carry over verbatim). Stage-0 resume must re-enter at Gate A ("set resolved, not confirmed") or Gate B ("classified, not confirmed").
- **Consume Phase 1, do not rebuild.** Engine verbs available and used as-is: `merge new`, `merge update` (delta now supports `remove_edges`, `revise_nodes`), `merge restructure --plan <file> --run <str>`, `merge attach-subprocess --parent-process P --node N --child C --run <str>`, `merge remove --process X --run <str>`. The `restructure.schema.json` plan shape is `{department, heirs:[{candidate, supersedes:[pid], subprocess_links:[{parent_key, child}]}]}`. `process.schema.json` carries optional `tombstoned` + `superseded_by`.

## File Structure

| File | Repo | Responsibility | Task |
|---|---|---|---|
| `schemas/segments.schema.json` | code-repo | `voice`→`department`+`transcripts`; `evidence[]`; `supersedes[]`; `tombstone[]`/`attach_subprocess[]`/`contradictions[]` | Task 1 |
| `schemas/run-meta.schema.json` | code-repo | `voice`→`department`+`transcripts`; status enum + `superseded`/`heir_of` | Task 2 |
| `.claude/agents/classify.md` | data-repo | set input; segment over the set; `evidence[]`; `supersedes`+`tombstone`/`attach`/`contradictions`; **remove Step-4 alignment bridge**; generalise Step-2a; exclude tombstoned; new segments.json shape | Task 3 |
| `.claude/agents/extract.md` | data-repo | set + attributed evidence + superseded/target `process.json`(s); `revise_nodes`, `remove_edges` (edge-hygiene), attach linkage, `subprocess_links`; one-to-one test | Task 4 |
| `.claude/agents/summarize.md` | data-repo | read the whole set of transcripts | Task 5 |
| `.claude/skills/idef-extraction/SKILL.md` | data-repo | edge-hygiene / `revise_nodes` / `remove_edges` / `subprocess_links` contract (node-visibility rules unchanged) | Task 6 |
| `.claude/skills/process-voice/SKILL.md` | data-repo | reworked set-based orchestrator: set resolution, Gate A, transcribe-reconcile, classify-over-set, Gate B, per-process extract, merge incl. restructure/attach/remove, summarize-over-set, commit, report; two gates + Stage-0 resume | Task 7 |
| **new** `.claude/skills/edit-process/SKILL.md` | data-repo | direct conversational edit (no voice): read target, build engine artifact, confirm destructive ops, run `merge`, commit with `source.type:"chat"` (§4.12) | Task 8 |

**Consistency with the previous (landed) round.** The prior plan (`2026-07-15-extraction-segmentation-and-node-visibility.md`) already edited: `classify.md` Step-2a (the 3-parameter boundary method, with "a single recording is often partial") and Step-4 ("Align to existing boundaries"); `extract.md` final self-check; `idef-extraction` §2 ("What goes in the flow") and §7 (semantic sub-process criterion). **This round must edit those exact spots consistently** — Task 3 generalises Step-2a and **removes** the Step-4 alignment bridge; Task 6 adds the edge-hygiene contract alongside the unchanged §2/§7 node-visibility rules; Task 4 extends the same extract self-check. Do **not** reintroduce or contradict the landed node-visibility/segmentation rules.

**Task order.** Schemas first (Tasks 1–2) so the prompts can be written against the final shapes. Then the agent prompts (Tasks 3–6), then the orchestrator (Task 7) which references them, then the standalone `edit-process` skill (Task 8).

---

### Task 1: `segments.schema.json` — set input, evidence, supersedes, op arrays

**Files:**
- Modify: `<code-repo>/schemas/segments.schema.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the exact `segments.json` contract that `classify` (Task 3) writes and `process-voice` (Task 7) reads at Gate B. New top-level keys `department`, `transcripts`; per-segment `evidence[]` + `supersedes[]`; optional top-level `tombstone[]`, `attach_subprocess[]`, `contradictions[]`. Old `voice`, `transcript_excerpt`, `match` are gone.

- [ ] **Step 1: Baseline — prove the old shape is present**

Run: `grep -n "\"voice\"\|transcript_excerpt\|existing_id\|\"match\"" "<code-repo>/schemas/segments.schema.json"`
Expected: matches for `voice` (line ~7 & ~9), `transcript_excerpt` (~14 & ~18), `match` (~14 & ~20), `existing_id` (~22 & ~23).

- [ ] **Step 2: Replace the whole schema body**

The change touches every part of the file; overwrite it wholesale. Write `<code-repo>/schemas/segments.schema.json` with exactly:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "segments.schema.json",
  "title": "Classify output — process segments over a department set (ARD §5.2)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "transcripts", "segments"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "transcripts": { "type": "array", "items": { "type": "string" } },
    "segments": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["department", "process_name", "evidence", "status", "supersedes"],
        "properties": {
          "department": { "type": "string", "pattern": "^[a-z]+$" },
          "process_name": { "type": "string" },
          "evidence": {
            "type": "array",
            "items": {
              "type": "object", "additionalProperties": false,
              "required": ["transcript", "text"],
              "properties": {
                "transcript": { "type": "string" },
                "text": { "type": "string" }
              }
            }
          },
          "status": { "enum": ["new", "update", "unchanged", "merge", "split", "attach", "tombstone"] },
          "supersedes": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "tombstone": { "type": "array", "items": { "type": "string" } },
    "attach_subprocess": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["parent_process", "parent_node", "child"],
        "properties": {
          "parent_process": { "type": "string" },
          "parent_node": { "type": "string" },
          "child": { "type": "string" }
        }
      }
    },
    "contradictions": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["process_name", "accounts"],
        "properties": {
          "process_name": { "type": "string" },
          "accounts": {
            "type": "array",
            "items": {
              "type": "object", "additionalProperties": false,
              "required": ["transcript", "text"],
              "properties": {
                "transcript": { "type": "string" },
                "text": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

Notes for the implementer: `supersedes` is **required** on every segment and may be `[]` (that is the `new` case per §4.4). `status` gains `merge`/`split`/`attach`/`tombstone` — the segment-level op label — while `tombstone`/`attach_subprocess`/`contradictions` are the **optional** top-level op arrays. `additionalProperties:false` is kept at every level.

- [ ] **Step 3: Verify — parses, old gone, new present, and validate accepts/rejects**

Run: `python3 -c "import json; json.load(open('<code-repo>/schemas/segments.schema.json')); print('ok')"`
Expected: `ok`.

Run: `grep -n "transcript_excerpt\|\"match\"\|existing_id" "<code-repo>/schemas/segments.schema.json"`
Expected: no matches (empty output).

Run: `grep -n "\"department\"\|\"transcripts\"\|\"evidence\"\|\"supersedes\"\|\"tombstone\"\|\"attach_subprocess\"\|\"contradictions\"" "<code-repo>/schemas/segments.schema.json"`
Expected: matches for all seven keys.

Positive `validate` check (a minimal valid instance):
```bash
cd "<code-repo>"
printf '%s' '{"department":"dining","transcripts":["dining-1405-04-11.txt"],"segments":[{"department":"dining","process_name":"x","evidence":[{"transcript":"dining-1405-04-11.txt","text":"y"}],"status":"new","supersedes":[]}]}' > /tmp/seg-ok.json
SCHEMA_DIR="<code-repo>/schemas" DATA_ROOT="<code-repo>" validate segments /tmp/seg-ok.json && echo VALID
```
Expected: exits 0, prints `VALID`.

Negative `validate` check (old `voice`/`match` shape must now fail):
```bash
cd "<code-repo>"
printf '%s' '{"voice":"dining","segments":[{"department":"dining","process_name":"x","transcript_excerpt":"y","status":"new","match":{"existing_id":null}}]}' > /tmp/seg-old.json
SCHEMA_DIR="<code-repo>/schemas" DATA_ROOT="<code-repo>" validate segments /tmp/seg-old.json; echo "exit=$?"
```
Expected: non-zero exit (the old shape is rejected — `voice`/`match` are no longer allowed and `department`/`transcripts`/`evidence`/`supersedes` are missing).

- [ ] **Step 4: Commit**

```bash
git -C "<code-repo>" add schemas/segments.schema.json
git -C "<code-repo>" commit -m "$(cat <<'EOF'
feat(schema): segments becomes set-scoped — department+transcripts, evidence[], supersedes[], op arrays

Replaces the per-voice segments contract: top-level voice -> department + transcripts[];
per-segment transcript_excerpt/match -> attributed evidence[] + supersedes[]; status enum
gains merge/split/attach/tombstone; adds optional top-level tombstone[], attach_subprocess[],
and contradictions[]. additionalProperties:false throughout. (spec §4.2-§4.4, §4.10)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `run-meta.schema.json` — department set + restructure statuses

**Files:**
- Modify: `<code-repo>/schemas/run-meta.schema.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the `meta.json` contract `process-voice` (Task 7) writes at Stage 2 and finishes at Stage 8. Top-level `voice`→`department`+`transcripts`; `processes[].status` enum extended; optional `superseded[]` and `heir_of` per process entry.

- [ ] **Step 1: Baseline — prove the old shape is present**

Run: `grep -n "\"voice\"\|\"departments\"\|\"status\"\|auto_subprocess_of" "<code-repo>/schemas/run-meta.schema.json"`
Expected: `voice` (~7 & ~9), `departments` (~7 & ~10), `status` enum (~21), `auto_subprocess_of` (~22).

- [ ] **Step 2: Replace the whole schema body**

Write `<code-repo>/schemas/run-meta.schema.json` with exactly:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "run-meta.schema.json",
  "title": "Per-run metadata (ARD §2.2 runs/{department}/{stamp}/meta.json)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "transcripts", "started_at", "attempt", "processes"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "transcripts": { "type": "array", "items": { "type": "string" } },
    "started_at": { "type": "string", "format": "date-time", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$" },
    "finished_at": { "type": ["string", "null"], "format": "date-time", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$" },
    "attempt": { "type": "integer", "minimum": 1 },
    "processes": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "status"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
          "status": { "enum": ["new", "update", "unchanged", "merge", "split", "attach", "tombstone"] },
          "auto_subprocess_of": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
          "superseded": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" } },
          "heir_of": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" } }
        }
      }
    }
  }
}
```

Notes: `department` replaces the old `departments` array (a run is now scoped to exactly one department — spec §4.1). `transcripts` records the full confirmed set. `status` gains the four restructure verbs. `superseded` (on a `tombstone`/heir entry: the committed ids this entry retires) and `heir_of` (on a heir entry: the committed ids it descends from) are **optional** and only appear on restructure entries.

- [ ] **Step 3: Verify — parses, old gone, new present, validate accepts/rejects**

Run: `python3 -c "import json; json.load(open('<code-repo>/schemas/run-meta.schema.json')); print('ok')"`
Expected: `ok`.

Run: `grep -n "\"voice\"\|\"departments\"" "<code-repo>/schemas/run-meta.schema.json"`
Expected: no matches (empty output).

Run: `grep -n "\"department\"\|\"transcripts\"\|\"superseded\"\|\"heir_of\"\|\"merge\"\|\"tombstone\"" "<code-repo>/schemas/run-meta.schema.json"`
Expected: matches for all six.

Positive `validate` check:
```bash
cd "<code-repo>"
printf '%s' '{"department":"dining","transcripts":["dining-1405-04-11.txt"],"started_at":"2026-07-15T09:00:00Z","finished_at":null,"attempt":1,"processes":[{"id":"dining-004","status":"merge","superseded":["dining-001","dining-002"],"heir_of":["dining-001","dining-002"]}]}' > /tmp/meta-ok.json
SCHEMA_DIR="<code-repo>/schemas" DATA_ROOT="<code-repo>" validate run-meta /tmp/meta-ok.json && echo VALID
```
Expected: exits 0, prints `VALID`.

Negative `validate` check (old `voice`/`departments` shape must fail):
```bash
cd "<code-repo>"
printf '%s' '{"voice":"dining-1405-04-11","departments":["dining"],"started_at":"2026-07-15T09:00:00Z","finished_at":null,"attempt":1,"processes":[]}' > /tmp/meta-old.json
SCHEMA_DIR="<code-repo>/schemas" DATA_ROOT="<code-repo>" validate run-meta /tmp/meta-old.json; echo "exit=$?"
```
Expected: non-zero exit.

- [ ] **Step 4: Commit**

```bash
git -C "<code-repo>" add schemas/run-meta.schema.json
git -C "<code-repo>" commit -m "$(cat <<'EOF'
feat(schema): run-meta becomes department-scoped over a transcript set

voice -> department + transcripts[]; drops departments[] (a run is one department now).
processes[].status enum gains merge/split/attach/tombstone; adds optional superseded[]
and heir_of[] for restructure lineage. (spec §4.1, §4.4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `classify.md` — set input, evidence, supersedes, remove alignment bridge

**Files:**
- Modify: `<data-repo>/.claude/agents/classify.md`

**Interfaces:**
- Consumes: the Task 1 `segments.schema.json` contract (writes it).
- Produces: for `process-voice` (Task 7): `runs/{department}/{stamp}/segments.json` in the new shape, plus a completion summary carrying contradictions/attach/tombstone context for Gate B.

- [ ] **Step 1: Baseline — prove the per-voice text and the alignment bridge are present**

Run: `grep -n "transcript_path\b\|transcript_excerpt\|Align to existing boundaries\|match.existing_id\|A single recording is often partial\|runs/{voice}/segments.json" "<data-repo>/.claude/agents/classify.md"`
Expected: matches for the single-`transcript_path` input, `transcript_excerpt`, the Step-4 "Align to existing boundaries" paragraph, `match.existing_id`, the Step-2a "A single recording is often partial" line, and the `runs/{voice}/segments.json` write path.

- [ ] **Step 2: Rework the description + Role (set framing)**

Find the frontmatter `description` line:

```
description: Segment a meeting transcript into processes and label each new/update/unchanged against existing processes (FR-P3). Assigns each process to its true department from registry.json — the upload tag is only a hint. Reads the transcript itself; returns only the output path and a Persian summary (not the transcript content).
```

Replace with:

```
description: Segment a department's whole transcript set into processes and reconcile each against committed work via supersedes (new/update/unchanged/merge/split/attach/tombstone) (FR-P3). Reads ALL transcripts in full; excludes tombstoned processes from matching; returns only the output path and a Persian summary (not the transcript content).
```

Then find the Role paragraph:

```
You are the **classify** agent for the Inja Food restaurant process-documentation pipeline.
You read a transcript file autonomously, split it into discrete work processes, assign each
process to its true department, compare against existing process records, and write
`runs/{voice}/segments.json`. You never paste the full transcript or the full JSON back to
the caller — only a path and a short Persian summary.
```

Replace with:

```
You are the **classify** agent for the Inja Food restaurant process-documentation pipeline.
You read a department's **entire set of transcripts** autonomously and together, assemble one
process for each distinct work procedure from **all** its mentions across the set, reconcile
each against committed process records via a `supersedes` relation (proposing restructuring —
merge/split/attach/tombstone — rather than aligning to committed boundaries), and write
`runs/{department}/{stamp}/segments.json`. You never paste the full transcripts or the full
JSON back to the caller — only a path and a short Persian summary.
```

- [ ] **Step 3: Replace the Inputs table (set input)**

Find:

```
| Name | Description |
|---|---|
| `transcript_path` | Absolute path to the cleaned transcript file (e.g. `meetings/transcripts/{voice}.txt`) — shared across attempts, never run-relative |
| `voice` | The voice basename, used as the run identifier (e.g. `cooking-1405-04-19`; the date is Shamsi) |
| `tagged_departments` | Comma-separated department codes the uploader tagged (a **hint**, not a constraint) |
```

Replace with:

```
| Name | Description |
|---|---|
| `transcript_paths` | The **full set** of cleaned transcript file paths for this department (e.g. `meetings/transcripts/dining-1405-04-11.txt`, `…-04-14.txt`, `…-04-15.txt`) — shared across attempts, never run-relative. Read **all** of them, in full. |
| `department` | The department code this run is scoped to (e.g. `dining`); the run identifier is `runs/{department}/{stamp}/` |
| `run_dir` | The run-scoped directory to write `segments.json` into (e.g. `runs/dining/{stamp}/`) |
```

- [ ] **Step 4: Rework Step 1 (read all transcripts)**

Find:

```
### Step 1 — Load reference data

1. Read the transcript from `transcript_path` using the **Read** tool.
2. Read `departments/registry.json` using the **Read** tool. Note the nine valid department
   codes: `management`, `accounting`, `warehouse`, `procurement`, `cooking`, `preparation`,
   `dining`, `cashier`, `logistics`. You must use exactly these codes in `department` fields.
```

Replace with:

```
### Step 1 — Load reference data

1. Read **every** transcript in `transcript_paths`, in full, using the **Read** tool. Do not
   sample, summarise, or skim — the whole point of the set is to see all mentions of each
   process together (spec §4.2). Order the set by session date (filenames carry the Shamsi
   date), so a **later** session can supersede an **earlier** one (Step 4).
2. Read `departments/registry.json` using the **Read** tool. Note the nine valid department
   codes: `management`, `accounting`, `warehouse`, `procurement`, `cooking`, `preparation`,
   `dining`, `cashier`, `logistics`. You must use exactly these codes in `department` fields.
```

- [ ] **Step 5: Add the assembly rule + evidence to Step 2**

Find (end of Step 2):

```
For each process, capture a short verbatim `transcript_excerpt` (1–3 sentences) that pins
the passage in the text.
```

Replace with:

```
**Assemble each process from ALL its mentions across the set (de-duplication).** Sweep the
whole set; wherever a process is described — in any transcript, in any session — gather every
mention and emit **one** process for it. Never emit near-duplicates because the same work was
described twice. A step mentioned once in the last session is as real as one mentioned in
every session (spec §4.2).

For each process, capture its **`evidence`** — an array of `{transcript, text}` objects, one
per mention feeding this process, where `transcript` is the source transcript's basename and
`text` is a short verbatim Persian snippet (1–3 sentences). Evidence may span several sessions;
list a mention from each session that contributes. This drives the Gate-B display and tells
`extract` which raw spans to pull across files.
```

- [ ] **Step 6: Generalise Step-2a "single recording is often partial" → "the set may be partial"**

Find (in Step-2a Parameter 1):

```
  The shift-walk is a reasoning aid for **ordering what you actually found**, never a
  template to fill in. A single recording is often partial — it may cover only part of
  the shift, jump around, or describe work out of sequence. You segment and order **only
  work the transcript actually describes**:
```

Replace with:

```
  The shift-walk is a reasoning aid for **ordering what you actually found**, never a
  template to fill in. Even the full set may be partial — together the transcripts may cover
  only part of the shift, jump around, or describe work out of sequence. You segment and order
  **only work the transcripts actually describe**:
```

Then find, in the same Parameter-1 bullet list:

```
  - Order comes from what the speaker says about *when* work happens — not from the
    position of the material in the recording, and not from how the department normally
    operates.
```

Replace with:

```
  - Order comes from what the speakers say about *when* work happens — not from the
    position of the material in the transcripts, not from which session it came from, and
    not from how the department normally operates.
```

- [ ] **Step 7: Rewrite Step 4 — supersedes reconciliation, restructuring, tombstone exclusion (removes the alignment bridge)**

Find the entire Step 4 (from its heading through the end of the "Align to existing boundaries" paragraph, i.e. everything between `### Step 4 — Match against existing processes` and `### Step 5 — Write the output file`):

```
### Step 4 — Match against existing processes (new / update / unchanged)

For each segment:

1. **Glob** `departments/{department}/processes/*.json` to list existing process files for
   that department.
2. **Read** any plausible candidates (filename or a quick grep can help narrow them).
3. Decide `status` and `match.existing_id`:

| Status | Condition | `existing_id` |
|---|---|---|
| `new` | No existing process covers this procedure at all | `null` |
| `update` | An existing process covers it and this voice adds or changes something | `"<id>"` (the existing process ID, e.g. `"cooking-001"`) |
| `unchanged` | An existing process covers it and this voice adds nothing new | `"<id>"` |

Existing processes include **auto-created sub-processes** (those with a non-null `parent` field in their `process.json`). A segment that merely elaborates or adds detail to an already-existing sub-process must be matched to it (`update` or `unchanged` with its `existing_id`) — it must **not** be emitted as `new`.

If the department directory contains no process files (e.g. only a `.gitkeep`), every
segment for that department is `new` with `existing_id: null`.

**Align to existing boundaries.** When an existing process already defines a boundary for
related content (you read it while deciding `update`/`unchanged`), align your segmentation
to that boundary rather than introducing a new split of the same work. This keeps process
boundaries consistent across the several recordings of one department, even though each run
sees only one transcript.
```

Replace with:

```
### Step 4 — Reconcile against committed processes via `supersedes`

Each *desired* process you emit carries a `supersedes` array: the committed process id(s) it
replaces. **Committed boundaries are provisional** — because the whole set is now in view, you
may find the committed structure is wrong. Do **not** align your segmentation to committed
boundaries; instead **propose restructuring** (merge / split) when the set warrants it. The set
reading is the *enabler* of restructuring, not a threat to consistency.

1. **Glob** `departments/{department}/processes/*.json` to list committed process files.
2. **Exclude tombstoned processes from matching.** A committed process whose `process.json` has
   `tombstoned: true` (or a non-empty `superseded_by`) is retired — never match a segment to it,
   never list it in `supersedes`. It stays on disk for the UI; it is invisible to you.
3. **Read** any plausible non-tombstoned candidates (filename or a quick grep can narrow them).
   Also read auto-created sub-processes (non-null `parent`); a segment that only elaborates an
   existing sub-process supersedes **it**, never emerges as `new`.
4. Decide each segment's `status` and `supersedes` by the one-to-one mapping between committed
   and desired processes:

| `supersedes` | Meaning | `status` |
|---|---|---|
| `[]` | nothing committed matches | `new` |
| `[X]`, changed | one committed process, revised | `update` |
| `[X]`, identical | one committed process, no change | `unchanged` |
| `[X, Y]` (one segment) | two committed processes are really one | `merge` |
| two desired segments each list `[X]` | one committed process is really two | `split` |

If the department directory contains no committed process files (e.g. only a `.gitkeep`),
every segment is `new` with `supersedes: []`.

**Resolve later-supersedes-earlier yourself (spec §4.3).** The set is orderable by session date.
When a later session reworks an earlier description of the same process, emit **one** process
reflecting the winning account (prefer the more specific/operational one) — not two variants.

**Genuine contradictions** you cannot resolve by date or specificity are **not** silently
picked: record them in the top-level `contradictions` array (below), with both accounts
identified by transcript, so they surface at Gate B.

**Removal and re-parenting (op arrays).** Beyond per-segment supersession, emit — when the set
warrants — the two top-level op arrays:
- `tombstone`: committed process ids to retire with **no heir** (the work is gone). Never a
  delete; `merge remove` tombstones it (INV-4).
- `attach_subprocess`: `{parent_process, parent_node, child}` entries to re-parent an existing
  committed process `child` under node `parent_node` of `parent_process`. Use real ids read from
  the committed files (INV-1); the engine validates the linkage.
```

- [ ] **Step 8: Rewrite Step 5 — the new `segments.json` shape**

Find the whole Step 5 (from `### Step 5 — Write the output file` through the closing `Use the **Write** tool to save the file.`):

```
### Step 5 — Write the output file

Create directory `runs/{voice}/` if it does not exist, then write `runs/{voice}/segments.json`
with exactly the following shape:

```json
{
  "voice": "<voice basename>",
  "segments": [
    {
      "department": "<registry code>",
      "process_name": "<Persian process name>",
      "transcript_excerpt": "<short verbatim Persian snippet, 1–3 sentences>",
      "status": "new | update | unchanged",
      "match": {
        "existing_id": "<existing process ID string, or null>"
      }
    }
  ]
}
```

Rules:
- `voice` — the voice basename string (e.g. `"cooking-1405-04-19"`; the date is Shamsi).
- Emit `segments` in shift-chronological order (Step 2a, Parameter 1); off-timeline
  processes last.
- `department` — must match `^[a-z]+$` and be a valid code from `registry.json`.
- `process_name` — Persian text extracted from the transcript.
- `transcript_excerpt` — short verbatim snippet in Persian from the transcript (1–3 sentences).
- `status` — exactly one of `"new"`, `"update"`, `"unchanged"` (no other values).
- `match.existing_id` — a string (existing process ID) when status is `update` or
  `unchanged`; `null` when status is `new`.
- Do NOT add extra fields — the schema uses `additionalProperties: false`.

Use the **Write** tool to save the file.
```

Replace with:

````
### Step 5 — Write the output file

Write `{run_dir}/segments.json` (create the directory if needed) with exactly this shape:

```json
{
  "department": "<registry code>",
  "transcripts": ["<transcript basename>", "..."],
  "segments": [
    {
      "department": "<registry code>",
      "process_name": "<Persian process name>",
      "evidence": [
        { "transcript": "<transcript basename>", "text": "<short verbatim Persian snippet>" }
      ],
      "status": "new | update | unchanged | merge | split | attach | tombstone",
      "supersedes": ["<committed process id>", "..."]
    }
  ],
  "tombstone": ["<committed process id>"],
  "attach_subprocess": [
    { "parent_process": "<committed id>", "parent_node": "<real node id>", "child": "<committed id>" }
  ],
  "contradictions": [
    {
      "process_name": "<Persian process name>",
      "accounts": [
        { "transcript": "<transcript basename>", "text": "<verbatim snippet>" }
      ]
    }
  ]
}
```

Rules:
- `department` (top-level) — the run's department code; must match `^[a-z]+$` and be a valid
  `registry.json` code.
- `transcripts` — the basenames of every transcript in the set you read.
- Emit `segments` in shift-chronological order (Step 2a, Parameter 1); off-timeline processes last.
- Each segment's `department` — a valid `registry.json` code (a set for one department may still
  surface segments in a neighbour department; label them by content, Step 3).
- `process_name` — Persian.
- `evidence` — a non-empty array of `{transcript, text}`; every mention feeding this process,
  each `text` a short verbatim Persian snippet, `transcript` its source basename.
- `status` — exactly one of `new`, `update`, `unchanged`, `merge`, `split`, `attach`, `tombstone`
  (per the Step-4 mapping).
- `supersedes` — the committed ids this desired process replaces (Step-4 table); `[]` for `new`.
- `tombstone`, `attach_subprocess`, `contradictions` — the **optional** top-level op arrays from
  Step 4. Omit any that is empty (do not emit an empty array unless it clarifies).
- Do NOT add extra fields — the schema uses `additionalProperties: false` at every level.

Use the **Write** tool to save the file.
````

- [ ] **Step 9: Update Step 6 (return summary), the schema-discipline constraint, and the ID constraint**

Find the Step-6 return list:

```
2. A **Persian one-paragraph summary** containing:
   - Count of segments by status (`new`, `update`, `unchanged`) and their department
     breakdown.
   - Any org-overview-only passages found (titles, roles, org structure) so the
     `summarize` agent knows to pick them up.
   - Any ambiguous or skipped passages and the reason.
```

Replace with:

```
2. A **Persian one-paragraph summary** containing:
   - Count of segments by status (`new`, `update`, `unchanged`, `merge`, `split`, `attach`,
     `tombstone`) and their department breakdown.
   - Restructure lineage for every `merge`/`split`/`attach`/`tombstone` (which committed ids
     are superseded/retired/re-parented) so the orchestrator can render Gate B.
   - Any flagged `contradictions` (process name + that both accounts were recorded).
   - Any org-overview-only passages found (titles, roles, org structure) so the `summarize`
     agent knows to pick them up.
   - Any ambiguous or skipped passages and the reason.
```

Then find, in the Constraints section:

```
- **Schema discipline.** The output JSON must satisfy these rules:
  `additionalProperties: false`, all required fields present, `status` ∈
  `{"new","update","unchanged"}`, `department` matches `^[a-z]+$`.
  The orchestrator runs a deterministic `validate` check on your `segments.json`
  after you finish; if it fails you will be re-dispatched with the errors, so
  follow the shape exactly.
```

Replace with:

```
- **Schema discipline.** The output JSON must satisfy these rules:
  `additionalProperties: false` at every level, all required fields present, `status` ∈
  `{"new","update","unchanged","merge","split","attach","tombstone"}`, every top-level and
  segment `department` matches `^[a-z]+$`, and every segment carries a non-empty `evidence`
  array and a `supersedes` array (`[]` for `new`).
  The orchestrator runs a deterministic `validate` check on your `segments.json`
  after you finish; if it fails you will be re-dispatched with the errors, so
  follow the shape exactly.
```

Then find:

```
- **Do not invent process IDs.** When status is `update` or `unchanged`, use the `id`
  field read from the matching existing process JSON file.
```

Replace with:

```
- **Do not invent process IDs.** Every id in `supersedes`, `tombstone`, and `attach_subprocess`
  is a real committed id read verbatim from a `process.json` (INV-1); never fabricate one.
  Never list a **tombstoned** process (`tombstoned: true` / non-empty `superseded_by`) anywhere.
```

- [ ] **Step 10: Verify — old absent, new present, consistent**

Run: `grep -n "transcript_path\b\|transcript_excerpt\|Align to existing boundaries\|match.existing_id\|A single recording is often partial\|runs/{voice}/segments.json\|\"voice\":" "<data-repo>/.claude/agents/classify.md"`
Expected: **no matches** (all old per-voice / alignment / excerpt / match text is gone).

Run: `grep -n "transcript_paths\|Reconcile against committed processes\|supersedes\|Committed boundaries are provisional\|propose restructuring\|evidence\|the set may be partial\|Even the full set may be partial\|tombstone\|attach_subprocess\|contradictions\|Exclude tombstoned" "<data-repo>/.claude/agents/classify.md"`
Expected: matches for all of them.

Then Read the whole file top-to-bottom and confirm: Step 2a's 3-parameter method is intact (only the "partial" phrasing generalised); Step 4 is the supersedes reconciliation with the mapping table and no "align" language; the tombstone-exclusion rule appears in both Step 4 and Constraints; the `segments.json` shape matches Task 1's schema exactly (keys, `additionalProperties:false`).

- [ ] **Step 11: Commit**

```bash
git -C "<data-repo>" add .claude/agents/classify.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(classify): set-based reconciliation — read all transcripts, supersedes, evidence[]

Inputs become the whole department transcript set; assemble each process from all mentions;
emit attributed evidence[] + supersedes[] + tombstone/attach_subprocess/contradictions.
Removes the Step-4 "align to committed boundaries" bridge (committed boundaries are
provisional -> propose restructuring); generalises Step-2a "single recording partial" ->
"the set may be partial"; excludes tombstoned processes from matching. (spec §4.2-§4.4, §4.11)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `extract.md` — set input, revise/remove_edges/attach/subprocess_links + one-to-one test

**Files:**
- Modify: `<data-repo>/.claude/agents/extract.md`

**Interfaces:**
- Consumes: the `idef-extraction` §5/§7 contract (Task 6 adds the edge-hygiene/revise/remove_edges/subprocess_links parts).
- Produces: for `process-voice` (Task 7): the per-process `candidate`/`delta`/heir artifact. Uses the one-to-one test (spec §4.5) to choose update-vs-restructure inputs.

- [ ] **Step 1: Baseline — prove the per-voice single-excerpt inputs are present**

Run: `grep -n "transcript_excerpt\|enrich_nodes.*flag_removed\|reference those real IDs in\|surrounding context for THIS process only" "<data-repo>/.claude/agents/extract.md"`
Expected: matches for `transcript_excerpt` (Inputs table + Mode A/B references), the Mode-B "reference those real IDs in `add_edges`, `enrich_nodes`, and `flag_removed`" line, and the single-transcript scoping note.

- [ ] **Step 2: Replace the Inputs table + scoping note (set + evidence + superseded process(es))**

Find:

```
| Parameter | Description |
|---|---|
| `department` | Lowercase department slug (e.g. `dining`, `cooking`) |
| `process_name` | Persian name of the process being extracted |
| `transcript_excerpt` | The segment of the transcript that describes this process |
| `transcript_path` | Full path to the source transcript file — read it to obtain surrounding context for THIS process only |
| `voice` | Identifier of the recording/document session (used in output paths) |
| `seq` | Zero-padded ordinal string provided by the dispatch (e.g. `01`, `02`) — NEW process only |
| `mode` | Either `new` or `update` |
| `attachment_texts` | List of cached attachment `.txt` paths for this department (may be empty). Reference documents such as job descriptions. |
| `existing_process_path` | Path to the existing `process.json` — UPDATE mode only |
| `existing_id` | The process ID of the existing process — UPDATE mode only |

Read `transcript_path` to get broader context, but limit your modelling to content that belongs to THIS process's segment (`transcript_excerpt`). Do not model steps from other processes visible in the surrounding transcript.
```

Replace with:

```
| Parameter | Description |
|---|---|
| `department` | Lowercase department slug (e.g. `dining`, `cooking`) |
| `process_name` | Persian name of the process being extracted |
| `evidence` | This process's attributed evidence from `segments.json`: an array of `{transcript, text}` — every mention feeding this process, tagged with its source transcript |
| `transcript_paths` | The **full set** of transcript file paths for the run — read the spans this process's `evidence` points into, across whichever files they live in |
| `run_dir` | The run-scoped directory to write into (e.g. `runs/dining/{stamp}/`) |
| `seq` | Zero-padded ordinal string (e.g. `01`, `02`) — NEW / heir output only |
| `mode` | One of `new`, `update`, `restructure` |
| `attachment_texts` | List of cached attachment `.txt` paths for this department (may be empty). Reference documents such as job descriptions. |
| `existing_process_paths` | Paths to the committed `process.json`(s) this process supersedes — UPDATE (one) and RESTRUCTURE (one or more) modes |
| `existing_id` | The committed process ID being revised in place — UPDATE mode only |

**Read only the spans this process's `evidence` points into**, across whichever transcripts in
`transcript_paths` those mentions live in. Assemble the process from **all** its mentions across
the set (spec §4.2), but do not model steps from other processes visible in the surrounding text.
```

- [ ] **Step 3: Add the one-to-one test (update vs restructure) before Mode A**

Find:

```
## Mode A — NEW process → candidate graph

Use this mode when `mode` is `new` (no existing `process.json`).
```

Replace with:

```
## Update-in-place vs. restructure — the one-to-one test (read first)

Your `mode` follows the mapping between committed and desired processes (spec §4.5):

- **one committed ↔ one desired (or zero committed ↔ one desired):** `update` (or `new`). A
  process is revised **in place** — however large the change — so it **keeps its id, its node
  ids stay stable, and manual UI edits and layout positions survive**. Renaming nodes, adding or
  dropping steps, revising labels/actors/icom (`revise_nodes`), re-routing flow and deleting the
  stale edge (`remove_edges`), flagging a node removed: all are **deltas on the same file**.
- **not one-to-one (2+ committed → 1 desired = merge; 1 committed → 2+ desired = split;
  removal):** `restructure`. Identity changes, so each heir is built as a fresh full candidate
  with **new ids** and the originals are tombstoned by the engine.

Do **not** tear a process down and rebuild it just because its contents changed a lot — tombstone
+ mint-new is disruptive (id churn, lost node ids/manual edits) and is reserved for genuine
identity change. Count the committed processes on each side of the mapping: exactly one↔one ⇒
`update`; anything else ⇒ `restructure`.

## Mode A — NEW process → candidate graph

Use this mode when `mode` is `new` (no existing `process.json`).
```

- [ ] **Step 4: Rework Mode B Step 1 + the delta contract (revise_nodes, remove_edges)**

Find the Mode-B Step 1:

```
### Step 1 — Read the existing process

Read the file at `existing_process_path`. This gives you the real node IDs already allocated. You will reference those real IDs in `add_edges`, `enrich_nodes`, and `flag_removed`. You must never invent a real ID — only copy IDs verbatim from the file you just read.
```

Replace with:

```
### Step 1 — Read the existing process

Read the file at `existing_process_paths` (a single committed `process.json` in UPDATE mode).
This gives you the real node IDs already allocated. You will reference those real IDs in
`add_edges`, `enrich_nodes`, `revise_nodes`, `remove_edges`, and `flag_removed`. You must never
invent a real ID — only copy IDs verbatim from the file you just read.
```

Then find the Mode-B "What to produce" delta object and its bullet list:

```
Emit a single JSON object conforming to the delta contract (see the idef-extraction skill; validated by `merge` on consumption). All four top-level arrays are required (each may be empty):

```json
{
  "add_nodes": [],
  "add_edges": [],
  "enrich_nodes": [],
  "flag_removed": []
}
```

- **`add_nodes`**: new nodes not present in the existing process. Use temp keys (`n1`, `j1`, …). Same activity/junction shapes as in Mode A.
- **`add_edges`**: new edges. `from`/`to` may be a temp key (new node from `add_nodes`) or an existing real ID read from `process.json`. Never invent a real ID.
- **`enrich_nodes`**: updates to existing nodes. Each entry has `id` (real ID from `process.json`) and `set` (partial update object containing only the fields the transcript actually informs — do not repeat unchanged fields).
- **`flag_removed`**: existing node IDs that the voice implies are no longer part of the process. Each entry is `{"id": "<real-id-from-process-json>"}`. The merge CLI sets `removed: true`; the extract agent never deletes nodes.

Enrich only fields the voice actually informs. Incompleteness is fine; fabrication is forbidden.
```

Replace with:

```
Emit a single JSON object conforming to the delta contract (see the idef-extraction skill; validated by `merge` on consumption). All top-level arrays are required (each may be empty):

```json
{
  "add_nodes": [],
  "add_edges": [],
  "enrich_nodes": [],
  "revise_nodes": [],
  "remove_edges": [],
  "flag_removed": []
}
```

- **`add_nodes`**: new nodes not present in the existing process. Use temp keys (`n1`, `j1`, …). Same activity/junction shapes as in Mode A.
- **`add_edges`**: new edges. `from`/`to` may be a temp key (new node from `add_nodes`) or an existing real ID read from `process.json`. Never invent a real ID.
- **`enrich_nodes`**: **fill-empty only** — fills empty fields or raises a `pending` conflict; it cannot overwrite a committed value (existing behaviour). Each entry has `id` (real ID) and `set` (only the fields the set actually informs).
- **`revise_nodes`**: **overwrite** specific committed node fields when the set supersedes the prior account (spec §4.3). Each entry is `{"id": "<real-id>", "set": {…}}` with only the fields being overwritten. Use this — not `enrich_nodes` — when a later session **changes** an already-filled value; every revision is shown at Gate B before it is written, so overwrite is safe. Never invent an id.
- **`remove_edges`**: edges to hard-delete for **edge hygiene** (spec §4.6). Each entry is `{"from": "<id>", "to": "<id>"}` referencing real existing node ids. **When you insert a node onto an existing path or re-route flow, emit the now-redundant edge here** — the engine never guesses which edge to drop, and it re-layouts afterward. Edges are structure, not INV-4 content, so this is a real delete.
- **`flag_removed`**: existing node IDs the set implies are no longer part of the process. Each entry is `{"id": "<real-id>"}`. The merge CLI sets `removed: true`; the extract agent never deletes nodes.

Enrich/revise only fields the set actually informs. Incompleteness is fine; fabrication is forbidden.
```

- [ ] **Step 5: Add the RESTRUCTURE mode (Mode C) after Mode B**

Find the Mode-B "Where to write" block (its end, just before the Sub-processes section):

```
where `{voice}` and `{existing_id}` are the dispatch-provided parameters. Example: if `voice` is `v2026-07-08` and `existing_id` is `cooking-001`, write to `runs/v2026-07-08/deltas/cooking-001.json`.

Create any missing parent directories as needed before writing.

---

## Sub-processes (self-contained, nameable procedures)
```

Replace with:

```
where `{run_dir}` and `{existing_id}` are the dispatch-provided parameters. Example: if `run_dir` is `runs/dining/{stamp}/` and `existing_id` is `cooking-001`, write to `runs/dining/{stamp}/deltas/cooking-001.json`.

Create any missing parent directories as needed before writing.

---

## Mode C — RESTRUCTURE (merge / split) → heir candidate + subprocess_links

Use this mode when `mode` is `restructure` (the mapping between committed and desired processes is
**not** one-to-one). Each heir process is emitted separately with its own `seq`.

### Step 1 — Read every superseded process

Read all committed `process.json` files in `existing_process_paths`. They give you the real node
ids of the originals and their hierarchy pointers (`parent`, and each node's `subprocess`). Copy
ids verbatim; never invent one (INV-1).

### What to produce

Emit a **full candidate body** for this heir (same shape as Mode A: `department`, `process_name`,
`summary`, `idef0`, `kpis`, `nodes`, `edges`, using fresh temp keys `n1`, `j1`, …), plus, when the
heir has hierarchy links, a **`subprocess_links`** array declaring them:

```json
{
  "subprocess_links": [
    { "parent_key": "n3", "child": "<committed child process id>" }
  ]
}
```

- `parent_key` — the heir's temp activity key whose box owns the sub-process link.
- `child` — the **committed** child process id that must re-parent under this heir (read verbatim).

The heir is one entry in the run's restructure **plan** the orchestrator assembles (shape
`{department, heirs:[{candidate, supersedes:[pid], subprocess_links:[…]}]}`) and passes to
`merge restructure`. You emit **only** the heir's `candidate` + its `subprocess_links`; the
orchestrator fills `supersedes` from `segments.json` and the engine mints all real ids, tombstones
the originals, and redirects hierarchy pointers deterministically (INV-1).

**Hierarchy-closed set.** If a superseded process's parent box or child sub-process is affected, it
travels with the restructure — the engine refuses a plan that would leave a pointer dangling and
names the missing process. Declare every affected link in `subprocess_links`.

### Where to write

```
{run_dir}/candidates/{seq}.json
```

---

## Sub-processes (self-contained, nameable procedures)
```

- [ ] **Step 6: Add the edge-hygiene + revise item to the final self-check**

Find the extract final self-check (landed last round):

```
**Final self-check (before writing the output file):** re-scan the transcript excerpt and verify (a) every spoken decision/exception/rework loop is modeled as a junction with exhaustive branches, (b) the graph passes the §2 entry/exit tests, (c) no spoken timing, quantity, tool, or standard was dropped (§6), and (d) the §2 "What goes in the flow" rules hold — no action was demoted into a `description`, every title is readable in isolation, and any node whose title needed «و» to join two actions was split into sequential nodes.
```

Replace with:

```
**Final self-check (before writing the output file):** re-scan this process's evidence spans (across the set) and verify (a) every spoken decision/exception/rework loop is modeled as a junction with exhaustive branches, (b) the graph passes the §2 entry/exit tests, (c) no spoken timing, quantity, tool, or standard was dropped (§6), (d) the §2 "What goes in the flow" rules hold — no action demoted into a `description`, every title readable in isolation, any «و»-joined title split into sequential nodes, and (e) **edge hygiene**: for every node you inserted onto an existing path or every re-routed flow, the now-redundant edge is listed in `remove_edges`, and any committed value a later session changed is in `revise_nodes` (not `enrich_nodes`).
```

- [ ] **Step 7: Verify — old absent, new present, consistent**

Run: `grep -n "transcript_excerpt\|surrounding context for THIS process only\|runs/{voice}/deltas" "<data-repo>/.claude/agents/extract.md"`
Expected: **no matches**.

Run: `grep -n "transcript_paths\|evidence\|one-to-one test\|revise_nodes\|remove_edges\|edge hygiene\|Mode C — RESTRUCTURE\|subprocess_links\|existing_process_paths" "<data-repo>/.claude/agents/extract.md"`
Expected: matches for all.

Then Read the whole file and confirm: the one-to-one test sits before Mode A; Mode B's delta object lists all six arrays; Mode C emits a full candidate + `subprocess_links` and defers `supersedes`/id-minting to the orchestrator/engine (INV-1); the self-check item (e) references `remove_edges`/`revise_nodes`; nothing still says "the transcript" singular where the set is meant.

- [ ] **Step 8: Commit**

```bash
git -C "<data-repo>" add .claude/agents/extract.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(extract): set input + one-to-one test + revise_nodes/remove_edges/restructure

Inputs become the transcript set + this process's attributed evidence + the superseded
process.json(s). Adds the update-vs-restructure one-to-one test (§4.5); the delta gains
revise_nodes (overwrite) and remove_edges (edge hygiene, §4.6); new Mode C emits heir
candidates + subprocess_links for merge/split (engine mints ids, tombstones, redirects).
Extends the final self-check with edge-hygiene + revise checks.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `summarize.md` — read the whole transcript set

**Files:**
- Modify: `<data-repo>/.claude/agents/summarize.md`

**Interfaces:**
- Consumes: nothing new; still reads the run's committed process records + now the whole transcript set.
- Produces: `departments/{dept}/overview.json` (shape unchanged).

- [ ] **Step 1: Baseline — prove the single-transcript input is present**

Run: `grep -n "transcript_path\b\|Read the file at .transcript_path. in full" "<data-repo>/.claude/agents/summarize.md"`
Expected: matches for the `transcript_path` input row and the Step-4 "Read the file at `transcript_path` in full" line.

- [ ] **Step 2: Replace the input row**

Find:

```
| `transcript_path` | Absolute path to the session transcript file |
```

Replace with:

```
| `transcript_paths` | The **full set** of transcript file paths for this department's run |
```

- [ ] **Step 3: Rework Step 4 (read the whole set)**

Find:

```
## Step 4 — Read the transcript

Read the file at `transcript_path` in full.

Extract any additional evidence about sub-units (named sections or stations of the department)
and personnel roles (job titles or functional roles, NOT personal names) that were discussed.
```

Replace with:

```
## Step 4 — Read the whole transcript set

Read **every** file in `transcript_paths`, in full. Do not sample or skim — the overview is
synthesised from all the department's sessions together.

Extract any additional evidence about sub-units (named sections or stations of the department)
and personnel roles (job titles or functional roles, NOT personal names) discussed anywhere in
the set. Later sessions may add or refine sub-units/roles; merge additively (Steps 5–6).
```

- [ ] **Step 4: Verify — old absent, new present, consistent**

Run: `grep -n "transcript_path\b" "<data-repo>/.claude/agents/summarize.md"`
Expected: **no matches**.

Run: `grep -n "transcript_paths\|Read the whole transcript set\|every.*file in .transcript_paths" "<data-repo>/.claude/agents/summarize.md"`
Expected: matches for all.

Then Read the whole file and confirm Steps 5–6 (additive merge of sub-units/personnel) still read correctly against a multi-session evidence set and no other line references a single transcript.

- [ ] **Step 5: Commit**

```bash
git -C "<data-repo>" add .claude/agents/summarize.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(summarize): read the whole department transcript set

transcript_path -> transcript_paths[]; Step 4 reads every session in full and synthesises
sub-units/personnel from the full set. (spec §4.1, §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `idef-extraction/SKILL.md` — edge-hygiene / revise_nodes / remove_edges / subprocess_links contract

**Files:**
- Modify: `<data-repo>/.claude/skills/idef-extraction/SKILL.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the delta-contract additions (`revise_nodes`, `remove_edges`) and the restructure `subprocess_links` shape that `extract` (Task 4) references. **Node-visibility rules (§2) and the semantic sub-process criterion (§7) are unchanged** — only the delta/restructure contract in §5 grows.

- [ ] **Step 1: Baseline — prove §5 has the four-array delta and lacks the new items**

Run: `grep -n "All four top-level arrays are \*\*required\*\*\|### .enrich_nodes.\|### .flag_removed." "<data-repo>/.claude/skills/idef-extraction/SKILL.md"`
Expected: matches (the §5 "four arrays" sentence + the `enrich_nodes`/`flag_removed` subsection headings).

Run: `grep -n "revise_nodes\|remove_edges\|subprocess_links\|Edge hygiene" "<data-repo>/.claude/skills/idef-extraction/SKILL.md"`
Expected: **no matches**.

- [ ] **Step 2: Update the §5 opening delta object to six arrays**

Find:

```
When the transcript updates an **existing process** (a `process.json` already exists), output a single JSON object conforming to the delta contract below (validated by `merge` on consumption). All four top-level arrays are **required** (they may be empty).

```json
{
  "add_nodes": [],
  "add_edges": [],
  "enrich_nodes": [],
  "flag_removed": []
}
```
```

Replace with:

```
When the transcript set updates an **existing process** (a `process.json` already exists), output a single JSON object conforming to the delta contract below (validated by `merge` on consumption). All six top-level arrays are **required** (they may be empty).

```json
{
  "add_nodes": [],
  "add_edges": [],
  "enrich_nodes": [],
  "revise_nodes": [],
  "remove_edges": [],
  "flag_removed": []
}
```
```

- [ ] **Step 3: Insert `revise_nodes` + `remove_edges` subsections after `enrich_nodes`, before `flag_removed`**

Find the `### flag_removed` heading (the §5 subsection):

```
### `flag_removed`

Existing node IDs that the voice implies are no longer part of the process. The `merge` CLI will set `removed: true` on these nodes — it **never deletes** them (INV-4). The extract agent must not delete nodes; it only flags.
```

Replace with (two new subsections, then the original `flag_removed`):

````
### `revise_nodes` (overwrite committed fields — supersession)

`enrich_nodes` fills **empty** fields (or raises a `pending` conflict); it cannot overwrite a value the process already has. When a **later session supersedes** an earlier account (spec §4.3), use `revise_nodes` to overwrite specific committed fields. Each entry:

```json
{
  "id": "<real-id-from-process-json>",
  "set": { "label": "<new Persian label>", "description": "<new Persian description>" }
}
```

- `id` — a real existing node id read verbatim from `process.json` (never invented).
- `set` — only the fields being overwritten (any subset of the node's fields; the §2 node/title rules still govern `label`/`description`).

Every revision is shown at Gate B **before** it is written, so overwrite is safe. Use `enrich_nodes` for fill-empty; use `revise_nodes` only to change an already-filled value.

### `remove_edges` (edge hygiene)

A delta can add edges but cannot otherwise remove one, so inserting a node between `1` and `2` leaves a stale `1→2` edge beside `1→new→2`. Emit the now-redundant edge here:

```json
{ "from": "<real-id>", "to": "<real-id>" }
```

- Both endpoints are **real existing node ids** read from `process.json`.
- **Edge-hygiene rule:** whenever you attach a node onto an existing path, or re-route flow, emit the edge it makes redundant in `remove_edges` — the engine never guesses which edge to drop. `merge update` hard-deletes these edges (edges are structure, not the content INV-4 protects) and re-layouts afterward.

### `flag_removed`

Existing node IDs that the transcript set implies are no longer part of the process. The `merge` CLI will set `removed: true` on these nodes — it **never deletes** them (INV-4). The extract agent must not delete nodes; it only flags.
````

- [ ] **Step 4: Add the restructure `subprocess_links` contract as a new §8**

Find the end of §7 (the last line of the "What merge does with a submitted child" block):

```
**The extract agent never mints a process or subprocess ID. Temp node keys only (INV-1).**
```

Replace with (keep that line, then append §8):

````
**The extract agent never mints a process or subprocess ID. Temp node keys only (INV-1).**

---

## 8. Restructure — heir candidates & `subprocess_links` (merge / split)

When the mapping between committed and desired processes is **not one-to-one** (2+ committed → 1
desired = merge; 1 committed → 2+ desired = split), the change is a **restructure**, not an update
(spec §4.5). The `extract` agent emits each **heir** as a **full candidate body** (§4 shape — fresh
temp keys `n1`, `j1`, …), plus, when the heir owns hierarchy links, a `subprocess_links` array:

```json
{
  "subprocess_links": [
    { "parent_key": "n3", "child": "<committed child process id>" }
  ]
}
```

| Field | Rule |
|---|---|
| `parent_key` | The heir's own temp activity key whose box owns the sub-process link. |
| `child` | The **committed** child process id (read verbatim from disk) that must re-parent under this heir. |

The orchestrator assembles the run's restructure **plan** — `{department, heirs:[{candidate,
supersedes:[pid], subprocess_links:[…]}]}` — and runs `merge restructure`. The agent supplies only
each heir's `candidate` + `subprocess_links`; the **engine** mints every real id, tombstones each
superseded original (`superseded_by` + tombstoned flag), and redirects hierarchy pointers
deterministically. **Hierarchy-closed set:** every process whose links are affected must be in the
plan, or the engine refuses and names the missing one — so declare every affected link here.
`attach-subprocess` (re-parent an existing process, unchanged, under a node) and `remove`
(tombstone with no heir) are separate `merge` verbs the orchestrator runs directly from
`segments.json`'s op arrays; the extract agent does not build artifacts for them. **The agent never
mints an id (INV-1); it copies committed ids verbatim and uses temp keys for new nodes.**
````

- [ ] **Step 5: Verify — new present, node-visibility rules untouched**

Run: `grep -n "revise_nodes\|remove_edges\|Edge-hygiene rule\|subprocess_links\|## 8. Restructure\|All six top-level arrays" "<data-repo>/.claude/skills/idef-extraction/SKILL.md"`
Expected: matches for all.

Run: `grep -c "What goes in the flow\|self-contained, separately-nameable\|One action per node" "<data-repo>/.claude/skills/idef-extraction/SKILL.md"`
Expected: unchanged from before this task (the §2/§7 node-visibility text is untouched) — a non-zero count confirming those sections still exist.

Then Read §5 and §8 and confirm: `revise_nodes` (overwrite) is clearly distinguished from `enrich_nodes` (fill-empty); `remove_edges` carries the edge-hygiene rule and the "re-layout" note; §8 defers all id-minting/tombstoning to the engine (INV-1) and states the hierarchy-closed rule.

- [ ] **Step 6: Commit**

```bash
git -C "<data-repo>" add .claude/skills/idef-extraction/SKILL.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(idef-extraction): delta gains revise_nodes/remove_edges; §8 restructure subprocess_links

§5 delta now has six arrays: adds revise_nodes (overwrite committed fields on supersession)
and remove_edges (edge hygiene when inserting/re-routing). New §8 defines heir candidates +
subprocess_links for merge/split; engine mints ids, tombstones, redirects hierarchy (INV-1).
Node-visibility (§2) and sub-process criterion (§7) unchanged. (spec §4.3, §4.5, §4.6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `process-voice/SKILL.md` — set-based orchestrator with two gates + Stage-0 resume

**Files:**
- Modify: `<data-repo>/.claude/skills/process-voice/SKILL.md`

**Interfaces:**
- Consumes: `classify` (Task 3), `extract` (Task 4), `summarize` (Task 5) contracts; the `segments`/`run-meta` schemas (Tasks 1–2); the Phase-1 `merge` verbs.
- Produces: the run: `runs/{department}/{stamp}/` (meta.json, segments.json, candidates/, deltas/, restructure/), committed to git.

This is a large rework. Because the turn-discipline rules and the merge/summarize/report mechanics are preserved almost verbatim, do it as a set of scoped edits, not a wholesale rewrite. The steps below cover every section that changes; unlisted sections (Turn discipline, the merge-does-subprocess 7 steps, the conflict-report format, timestamps) are **preserved as-is**.

- [ ] **Step 1: Baseline — prove the per-voice orchestrator is present**

Run: `grep -n "process-voice <voice>\|runs/{voice}/meta.json\|## Stage 1 — Locate + transcribe\|## Stage 4 — Human checkpoint\|Per-department fan-out\|transcript_excerpt: {transcript_excerpt}" "<data-repo>/.claude/skills/process-voice/SKILL.md"`
Expected: matches for the `/process-voice <voice>` invocation, the per-voice `runs/{voice}/meta.json`, Stage 1 transcribe, the single Stage-4 checkpoint, the per-department fan-out header, and the per-voice extract dispatch parameters.

- [ ] **Step 2: Rework the invocation line**

Find:

```
**Invocation:** `/process-voice <voice>` where `<voice>` is the audio basename (e.g. `cooking-1405-04-19`; the date part is Shamsi).
```

Replace with:

```
**Invocation:** `/process-voice <department>` (default: the whole department set) **or** `/process-voice <t1> <t2> …` (an explicit list of transcript/audio basenames; the department is inferred from filenames). One path — a set of one is the smallest case; there is **no** per-voice or batch mode. The date part of a basename is Shamsi.
```

- [ ] **Step 3: Update the Turn-discipline gate list to name the two gates**

Find:

```
**The ONLY two legitimate end-of-turn points in a run are:**
1. the **Stage 4 human checkpoint** — you must pause there for the user's confirmation, and
2. the **very end of the run**, after the Stage 9 report.
```

Replace with:

```
**The ONLY legitimate end-of-turn points in a run are:**
1. **Gate A** (set-confirmation checkpoint, before Stage 1) — pause for the user to confirm the set,
2. **Gate B** (segmentation/restructure checkpoint, after Stage 3) — pause for the user to approve
   the proposed process set + restructure ops, and
3. the **very end of the run**, after the Stage 9 report.

Gate A and Gate B are the two mid-run pauses; everywhere else you continue in the **same turn**.
```

- [ ] **Step 4: Replace Stage 0 (department-scoped resume, two re-entry points)**

Find the whole `## Stage 0 — Resolve state / resume` section (from its heading through the `> {run_dir} is the single run-scoped directory …` blockquote):

```
## Stage 0 — Resolve state / resume

1. Check whether `runs/{voice}/meta.json` exists.
2. If it exists AND `finished_at` is `null`, the previous run was interrupted — set `{run_dir}` to `runs/{voice}` and resume it: inspect `processes[]` to determine how far it got (empty + `{run_dir}/segments.json` present → resume at Stage 4; non-empty → resume at Stage 6 for any unmerged segment, then Stages 7–9). Do NOT re-run stages that already completed (idempotency).
3. If `runs/{voice}/meta.json` does not exist, this is a fresh run — set `{run_dir}` to `runs/{voice}` and continue to Stage 1.
4. If `runs/{voice}/meta.json` exists with a non-null `finished_at` (or the user explicitly requests re-processing), this is a re-run — set `{run_dir}` to `runs/{voice}/attempt-NN/` where `NN` is zero-padded and is the lowest integer ≥ 2 whose directory does not yet exist. Continue to Stage 1.

> `{run_dir}` is the single run-scoped directory used for all artefacts in this run (meta.json, segments.json, candidates/, deltas/). The transcript at `meetings/transcripts/{voice}.txt` is shared across attempts and is never run-relative.
```

Replace with:

```
## Stage 0 — Resolve state / resume

`{run_dir}` is `runs/{department}/{stamp}/`, where `{stamp}` is a UTC `YYYYMMDD-HHMMSS`. A run is
scoped to **one department**.

1. Resolve the department: for the department form it is the argument; for the explicit-list form,
   infer it from the transcript basenames (`{dept}-…`). Then look for the most recent
   `runs/{department}/*/meta.json`.
2. **Resume an interrupted run** — `meta.json` exists with `finished_at: null`:
   - `segments.json` **absent** → the set was resolved but not yet confirmed: **re-enter at Gate A**
     (re-resolve the set and re-present it).
   - `segments.json` **present**, `processes[]` empty → classified but not yet approved:
     **re-enter at Gate B** (re-read `segments.json` and re-present it).
   - `processes[]` non-empty → merges started: resume at Stage 6 for any un-merged artifact, then
     Stages 7–9. Do NOT re-run completed stages (idempotency).
3. **Fresh run** — no in-progress `meta.json`: create a new `{run_dir} = runs/{department}/{stamp}/`
   and continue to "Resolve the set".
4. **Re-run** — the user explicitly asks to re-process a finished set: create a new
   `runs/{department}/{stamp}/` with the current timestamp (the timestamp *is* the attempt key —
   there is no `attempt-NN`; each run gets its own stamped dir). Continue to "Resolve the set".

> `{run_dir}` holds all run artefacts (meta.json, segments.json, candidates/, deltas/,
> restructure/). Transcripts at `meetings/transcripts/{basename}.txt` are shared across runs and are
> never run-relative.

---

## Resolve the set

- **Department form:** the set = every recording the department has —
  `meetings/transcripts/{department}-*.txt` **∪** any `meetings/audio/{department}-*` without a
  matching transcript. Glob both.
- **Explicit-list form:** the set = exactly the named basenames. The user's selection is
  **authoritative** — never silently widen it, never refuse it for being incomplete. Note which
  department recordings are being **left out** (glob the department, subtract the named set) to
  disclose at Gate A.

Order the set by Shamsi date in the filename (later sessions supersede earlier ones downstream).

**Context budget.** If the resolved set is so large it would exceed the largest-context Opus budget,
**stop and name the set, its size, and the limit**, asking the user to narrow it or raise the
context. Never compress, distil, or fall back to one-transcript-at-a-time (spec §4.1).
```

- [ ] **Step 5: Insert Gate A before the transcribe stage**

Find:

```
---

## Stage 1 — Locate + transcribe (FR-P1, FR-P2)

1. Glob `meetings/audio/{voice}.*`. If no file matches, list the three closest filenames and ask the user, **in Persian**, which one to use. Stop until they reply.
2. Run the transcription CLI (idempotent — skips Vertex AI if `meetings/transcripts/{voice}.txt` already exists):
   ```
   Bash: DATA_ROOT=<data-repo> transcribe {voice}
   ```
3. On a **fresh transcription** (the transcript file did not exist before):
   - Read stdout. Strip any Gemini preamble, postamble, or section headings injected by the model.
   - If the text appears summarized or rewritten (rather than verbatim speech), flag it to the user and STOP. Do not proceed. When stopping, tell the user (in Persian) their options: «(الف) پردازش را دوباره اجرا کنید تا رونویسی از نو انجام شود؛ یا (ب) یک رونویسِ اصلاح‌شده را به‌صورت دستی در `meetings/transcripts/{voice}.txt` قرار دهید و دوباره اجرا کنید — در این حالت خط لوله به‌دلیل ایدمپوتنسی از Vertex عبور می‌کند و همان فایل شما را استفاده می‌کند.»
   - Write the cleaned text to `meetings/transcripts/{voice}.txt`.
4. Confirm the transcript exists before continuing.
```

Replace with:

```
---

## Gate A — set-confirmation checkpoint (STOP)

Before transcribing anything, disclose the resolved set and pause.

1. Init `{run_dir}` (create the directory) and write an initial `{run_dir}/meta.json` with
   `finished_at: null` and `processes: []` (Stage 2 shape) so Stage-0 resume can re-enter here.
2. Send a Persian checkpoint listing **the set** (every basename, transcript or audio) and, for the
   explicit-list form, **which department recordings are left out**. Example:

   ```
   مجموعهٔ ضبط‌های دپارتمان dining برای این اجرا:
     ۱. dining-1405-04-11
     ۲. dining-1405-04-14
     ۳. dining-1405-04-15 (فاقد رونویس — رونویسی می‌شود)
   (فرم فهرست صریح) موارد کنار گذاشته‌شده: dining-1405-04-20
   تأیید می‌کنید یا مجموعه اصلاح شود؟
   ```

3. **End your turn and wait.** This is Gate A. On the user's reply:
   - **Edit** (add/drop a recording, switch department↔list): **re-resolve the set** ("Resolve the
     set"), re-present Gate A, wait again.
   - **Confirmation** («تأیید» / «بله» / «ok»): proceed to Stage 1 in the next turn.

---

## Stage 1 — Transcribe-missing reconcile (FR-P1, FR-P2)

Runs **after** Gate A, only for the confirmed set. Idempotent. For **each** confirmed recording
that lacks a transcript at `meetings/transcripts/{basename}.txt`:

1. Run the transcription CLI (idempotent — skips Vertex AI if the transcript already exists):
   ```
   Bash: DATA_ROOT=<data-repo> transcribe {basename}
   ```
2. On a **fresh transcription** (the transcript file did not exist before):
   - Read stdout. Strip any Gemini preamble, postamble, or section headings injected by the model.
   - **Per-file verbatim sanity gate:** if the text appears summarized or rewritten (rather than
     verbatim speech), flag it to the user and STOP. When stopping, tell the user (in Persian) their
     options: «(الف) پردازش را دوباره اجرا کنید تا رونویسی از نو انجام شود؛ یا (ب) یک رونویسِ
     اصلاح‌شده را به‌صورت دستی در `meetings/transcripts/{basename}.txt` قرار دهید و دوباره اجرا کنید
     — در این حالت خط لوله به‌دلیل ایدمپوتنسی از Vertex عبور می‌کند و همان فایل شما را استفاده
     می‌کند.»
   - Write the cleaned text to `meetings/transcripts/{basename}.txt`.
3. Confirm every recording in the set now has a transcript before continuing. (Recordings that
   already had a transcript are untouched.) This whole reconcile runs **in one turn** (each
   `transcribe` is a CLI call, not a turn end) — proceed to Stage 2 in the same turn.
```

- [ ] **Step 6: Replace Stage 2 (department-scoped meta.json)**

Find the whole `## Stage 2 — Init run record` section (heading through step 3 / re-validate line):

```
## Stage 2 — Init run record

1. `{run_dir}` was determined in Stage 0; create the directory now if it does not exist.
2. Write `{run_dir}/meta.json` with exactly the shape below
   (always write `finished_at` explicitly — even as `null` — because Stage 0 resume depends on reading this field):
   ```json
   {
     "voice": "<voice>",
     "departments": ["<tag>"],
     "started_at": "<ISO-8601 Z timestamp>",
     "finished_at": null,
     "attempt": 1,
     "processes": []
   }
   ```
   - `departments`: the upload tag(s) extracted from the voice filename or provided by the user.
   - `started_at` / `finished_at`: ISO-8601 with `Z` suffix (e.g. `2026-05-06T09:14:00Z`).
   - `attempt`: the integer taken from Stage 0's `{run_dir}` — `1` for the base run `runs/{voice}/`, or `NN` when `{run_dir}` is `runs/{voice}/attempt-NN/`. (The example above shows the base-run value `1`.)
   - `processes`: start empty; populated after merge in Stage 6.
3. **Validate the record:** `Bash: validate run-meta {run_dir}/meta.json`. If it exits non-zero, fix the meta object you just wrote (the stderr message names the offending field) and re-validate before continuing.
```

Replace with:

```
## Stage 2 — Init / finalise run record

Gate A already wrote an initial `{run_dir}/meta.json`. Now record the confirmed set (write
`finished_at` explicitly as `null` — Stage-0 resume depends on it):

```json
{
  "department": "<department>",
  "transcripts": ["<basename>", "..."],
  "started_at": "<ISO-8601 Z timestamp>",
  "finished_at": null,
  "attempt": 1,
  "processes": []
}
```

- `department`: the run's department code (`^[a-z]+$`).
- `transcripts`: every confirmed transcript basename in the set.
- `started_at` / `finished_at`: ISO-8601 with `Z` suffix (e.g. `2026-07-15T09:14:00Z`).
- `attempt`: `1` (each run gets its own stamped `{run_dir}`; the timestamp is the attempt key).
- `processes`: empty; populated after merge in Stage 6.

**Validate:** `Bash: validate run-meta {run_dir}/meta.json`. On non-zero exit, fix the offending
field (named in stderr) and re-validate before continuing.
```

- [ ] **Step 7: Replace Stage 3 (classify over the set)**

Find the whole `## Stage 3 — classify` section:

```
## Stage 3 — classify

Dispatch the `classify` agent via the `Task` tool as the **first thing you do this turn**. Do
**not** send a status message before it (a prose-only message ends the turn). If you want a status
line, put it in the **same message** as the `Task` call:

```
Task: classify
  transcript_path: meetings/transcripts/{voice}.txt
  voice: {voice}
  tagged_departments: [<tagged departments>]
```

Wait for the task to complete. It writes `{run_dir}/segments.json`.
The segments file categorises every identified process as one of: `new`, `update`, or `unchanged`.

**Validate it:** `Bash: validate segments {run_dir}/segments.json`. If it exits non-zero, re-dispatch the `classify` agent with the stderr error appended to its prompt so it corrects the output, then re-validate. After 2 failed attempts, stop and report the error to the user instead of looping.

**Do NOT end your turn here.** The classify Task returning is not a stopping point — continue immediately, in the **same turn**, into Stage 4 (read `segments.json` and send the checkpoint). Ending your turn right after classify is the "stuck mid-pipeline" bug this playbook forbids.
```

Replace with:

```
## Stage 3 — classify over the set

Dispatch `classify` as the **first thing you do this turn** (no prose-only message first — that
ends the turn; any status line rides in the **same** message as the `Task` call):

```
Task: classify
  transcript_paths: [<every confirmed transcript path in the set>]
  department: {department}
  run_dir: {run_dir}
```

Wait for it to complete. It reads **all** transcripts and writes `{run_dir}/segments.json`, labelling
each desired process `new`/`update`/`unchanged`/`merge`/`split`/`attach`/`tombstone` with
attributed `evidence[]` + `supersedes[]`, plus the top-level `tombstone`/`attach_subprocess`/
`contradictions` op arrays. **Keep its completion message** — the contradictions/lineage summary it
returns feeds Gate B.

**Validate it:** `Bash: validate segments {run_dir}/segments.json`. On non-zero exit, re-dispatch
`classify` with the stderr error appended, then re-validate. After 2 failed attempts, stop and
report to the user instead of looping.

**Do NOT end your turn here.** classify returning is not a stopping point — continue immediately, in
the **same turn**, into Gate B (read `segments.json`, send the checkpoint).
```

- [ ] **Step 8: Replace Stage 4 with Gate B (§4.10 contents)**

Find the whole `## Stage 4 — Human checkpoint (FR-P4)` section, from its heading through the end of its "Handling the user's reply" list (i.e. up to and including the `- **Confirmation** … Proceed to Stage 5.` block, just before `## Stages 5–9 — Per-department fan-out`):

Because this section is long, apply it as a **whole-section replacement**: select everything from the line `## Stage 4 — Human checkpoint (FR-P4)` up to (but not including) the line `## Stages 5–9 — Per-department fan-out (FR-P8)`, and replace it with:

```
## Gate B — segmentation / restructure checkpoint (STOP) (FR-P4)

1. Read `{run_dir}/segments.json`.
2. Present **the department's proposed process set in shift order**, each item labelled by its op
   (`new`/`update`/`unchanged`/`merge`/`split`/`attach`/`tombstone`), with, per spec §4.10:
   - the committed id(s) it **supersedes** (from `supersedes`);
   - **attributed evidence** spanning sessions — for each item, one indented line per session
     mention: `     مستند به: «…» ({transcript})` drawn from that segment's `evidence[]`;
   - a **lineage line** for `merge`/`split`/`attach`/`tombstone` (which committed ids are
     merged/split/re-parented/retired), from the classify return summary + the `tombstone` /
     `attach_subprocess` arrays;
   - **contradictions** the agent flagged — both accounts, each attributed (from the
     `contradictions` array);
   - carried from Gate A (explicit-list form): which recordings were **left out**.
3. Compose the checkpoint in Persian and send it.

**Example (reproduce this structure):**

```
فرایندهای پیشنهادی برای دپارتمان dining (به ترتیب شیفت):
الف) جدید:
  ۱. فرایند سفارش‌گیری سالن
     مستند به: «مشتری سر کیوسک سفارشش را می‌زند…» (dining-1405-04-11)
ب) به‌روزرسانی:
  — «فرایند پخت» ← cooking-002 (بازبینی برچسب یک گره)
     مستند به: «زمان سرخ‌کردن را از هفت به پنج دقیقه بردیم» (dining-1405-04-15)
ج) ادغام:
  — «فرایند تسویه» ← dining-003 + dining-007 (این دو در واقع یک فرایندند)
د) تفکیک:
  — dining-005 ← «آماده‌سازی سالن» + «تمیزکاری پایان‌شب» (یک فرایند در واقع دو تاست)
هـ) الحاق زیرفرایند: dining-009 زیر باکس n4 از فرایند dining-002
و) حذف (سنگ‌قبر): dining-011 (این کار دیگر انجام نمی‌شود)
⚠ تعارض: «فرایند انبار» — دو روایت متفاوت ثبت شد (dining-04-11 و dining-04-14).
موارد کنار گذاشته‌شده: dining-1405-04-20
تأیید می‌کنید یا اصلاحی لازم است؟
```

4. **End your turn and wait.** This is Gate B — the second and last mid-run pause. `{run_dir}/meta.json`
   has `finished_at: null` and `processes: []`; nothing has been written to `departments/**`. On the
   next turn read `{run_dir}/meta.json` to resume (Stage-0 routes here when `segments.json` exists and
   `processes[]` is empty). If the classify return message is no longer in context, re-dispatch
   `classify` (idempotent) to regenerate the summary before composing this checkpoint.

**Handling the user's reply:**

- **Correction** (missed/extra process, wrong op, wrong `supersedes`, contradiction resolved a
  particular way, an item should be merge not update, etc.): re-dispatch **only** `classify` with the
  corrected instructions (nothing in `departments/**` has been written yet), re-validate
  `segments.json`, re-present Gate B, wait again.
- **Confirmation** («تأیید» / «بله» / «ok»): proceed to Stage 5a.
```

- [ ] **Step 9: Rework the Stages 5–9 header (no per-department fan-out — one department per run)**

Find:

```
## Stages 5–9 — Per-department fan-out (FR-P8)

Collect the full set of departments touched by the confirmed segments.
For each department, run the following sub-pipeline independently (Stages 5–8).
Stage 9 (conflict report) runs once after all departments complete.

---

### Stage 5a — prepare attachments (per department)
```

Replace with:

```
## Stages 5–9 — Build the confirmed set (FR-P8)

A run is scoped to **one department**, so there is no per-department fan-out: run Stages 5a–8 once
for `{department}`, then Stage 9. (Segments the set surfaced in a **neighbour** department are rare;
if any exist, handle them by running their own department pipeline separately — do not silently
widen this run.)

---

### Stage 5a — prepare attachments
```

- [ ] **Step 10: Fix the Stage 5a per-department wording**

Find:

```
For each department touched by the confirmed `new`/`update` segments:

```
Bash: DATA_ROOT=<data-repo> extract-attachment {dept}
```
```

Replace with:

```
For this run's department:

```
Bash: DATA_ROOT=<data-repo> extract-attachment {department}
```
```

- [ ] **Step 11: Replace the Stage 5 extract dispatches (set inputs + restructure) and the unchanged note**

Find the two extract dispatch blocks and the surrounding text, from `- **new segment:**` through the `**unchanged segments are NOT extracted.**` paragraph:

```
- **new segment:**
  ```
  Task: extract
    voice: {voice}
    transcript_path: meetings/transcripts/{voice}.txt
    process_name: {process_name}              # from this segment in segments.json
    transcript_excerpt: {transcript_excerpt}  # verbatim excerpt from segments.json
    mode: new
    seq: {seq}           # sequential integer within this run, zero-padded e.g. 01
    department: {dept}
    run_dir: {run_dir}
    attachment_texts: {attachment_texts}   # cached .txt paths for {dept} from Stage 5a (may be empty)
  ```
  The agent writes `{run_dir}/candidates/{seq}.json`.

- **update segment:**
  ```
  Task: extract
    voice: {voice}
    transcript_path: meetings/transcripts/{voice}.txt
    process_name: {process_name}              # from this segment in segments.json
    transcript_excerpt: {transcript_excerpt}  # verbatim excerpt from segments.json
    mode: update
    existing_id: {existing_id}
    existing_process_path: departments/{dept}/processes/{existing_id}.json
    department: {dept}
    run_dir: {run_dir}
    attachment_texts: {attachment_texts}   # cached .txt paths for {dept} from Stage 5a (may be empty)
  ```
  The agent writes `{run_dir}/deltas/{existing_id}.json`.

**unchanged segments are NOT extracted.** Their `process.json` files remain untouched.
They will be recorded in `meta.json.processes` as `{id, status: "unchanged"}` in Stage 8.
```

Replace with:

```
Dispatch one `extract` `Task` per **desired process** that needs an artifact — i.e. every segment
whose `status` is `new`, `update`, `merge`, or `split` (each heir of a merge/split is its own
`restructure` dispatch). Pass the segment's attributed `evidence` and the full set:

- **new segment** (`supersedes: []`):
  ```
  Task: extract
    department: {department}
    process_name: {process_name}           # from this segment
    evidence: {evidence}                   # this segment's evidence[] from segments.json
    transcript_paths: [<every transcript in the set>]
    mode: new
    seq: {seq}                             # zero-padded run ordinal, e.g. 01
    run_dir: {run_dir}
    attachment_texts: {attachment_texts}   # from Stage 5a (may be empty)
  ```
  The agent writes `{run_dir}/candidates/{seq}.json`.

- **update segment** (`supersedes: [X]`, one-to-one):
  ```
  Task: extract
    department: {department}
    process_name: {process_name}
    evidence: {evidence}
    transcript_paths: [<every transcript in the set>]
    mode: update
    existing_id: {X}
    existing_process_paths: [departments/{department}/processes/{X}.json]
    run_dir: {run_dir}
    attachment_texts: {attachment_texts}
  ```
  The agent writes `{run_dir}/deltas/{X}.json`.

- **merge / split heir** (`restructure`): dispatch one `extract` per **heir** (a merge yields one
  heir; a split yields 2+). Pass every superseded `process.json` so the agent has the originals'
  ids:
  ```
  Task: extract
    department: {department}
    process_name: {heir process_name}
    evidence: {evidence}
    transcript_paths: [<every transcript in the set>]
    mode: restructure
    existing_process_paths: [departments/{department}/processes/{S}.json, ...]   # all superseded ids
    seq: {seq}
    run_dir: {run_dir}
    attachment_texts: {attachment_texts}
  ```
  The agent writes each heir to `{run_dir}/candidates/{seq}.json` (a full candidate + its
  `subprocess_links`). Collect, per restructure, the heir candidate paths and each heir's
  `supersedes` (from `segments.json`) — Stage 6 assembles them into a restructure **plan**.

**`unchanged` (`supersedes: [X]`, identical), `tombstone`, and `attach_subprocess` segments are NOT
extracted** — they carry no graph artifact. `unchanged` is recorded in `meta.json` in Stage 8;
`tombstone`/`attach` are executed directly by their own `merge` verbs in Stage 6.
```

- [ ] **Step 12: Replace Stage 6 merge dispatch heads with the new verbs**

Find the Stage-6 opening + the `new`/`update` merge blocks:

```
### Stage 6 — merge (deterministic, per department)

Process each candidate/delta using the `merge` engine CLI.
Never write `departments/**/processes/*.json` any other way — this is hook-enforced.

**For each `new` candidate:**
```
Bash: DATA_ROOT=<data-repo> merge new \
  --candidate {run_dir}/candidates/{seq}.json \
  --department {dept} \
  --run {run_dir}
```
Capture the printed `<id>` (e.g. `warehouse-004`). Record `{id, status: "new"}` for meta.json.

**For each `update` delta:**
```
Bash: DATA_ROOT=<data-repo> merge update \
  --process {existing_id} \
  --delta {run_dir}/deltas/{existing_id}.json \
  --run {run_dir}
```
Record `{existing_id, status: "update"}` for meta.json.
```

Replace with:

```
### Stage 6 — merge (deterministic)

Process every artifact using the `merge` engine CLI — the **sole writer** of
`departments/**/processes/*.json` (hook-enforced). Run the verb matching each segment's op.

**For each `new` candidate:**
```
Bash: DATA_ROOT=<data-repo> merge new \
  --candidate {run_dir}/candidates/{seq}.json \
  --department {department} \
  --run {run_dir}
```
Capture the printed `<id>`. Record `{id, status: "new"}` for meta.json.

**For each `update` delta:**
```
Bash: DATA_ROOT=<data-repo> merge update \
  --process {existing_id} \
  --delta {run_dir}/deltas/{existing_id}.json \
  --run {run_dir}
```
Record `{existing_id, status: "update"}` for meta.json. (`merge update` now also applies the delta's
`revise_nodes` and `remove_edges`, and re-layouts after edge removal — no extra flags needed.)

**For each `merge`/`split` restructure:** assemble the plan file `{run_dir}/restructure/{seq}.json`
in the shape `{department, heirs: [{candidate, supersedes:[pid], subprocess_links:[…]}]}` — one
`heirs[]` entry per heir extracted in Stage 5, `candidate` being that heir's candidate path,
`supersedes` copied from `segments.json`, `subprocess_links` from the heir's artifact. Then:
```
Bash: DATA_ROOT=<data-repo> merge restructure \
  --plan {run_dir}/restructure/{seq}.json \
  --run {run_dir}
```
Capture the printed heir ids and superseded (tombstoned) ids. Record each heir as
`{id, status: "merge"|"split", superseded:[…], heir_of:[…]}` for meta.json.

**For each `attach_subprocess` entry** (from `segments.json`):
```
Bash: DATA_ROOT=<data-repo> merge attach-subprocess \
  --parent-process {parent_process} --node {parent_node} --child {child} \
  --run {run_dir}
```
Record `{id: {child}, status: "attach"}` for meta.json.

**For each `tombstone` id** (from `segments.json`):
```
Bash: DATA_ROOT=<data-repo> merge remove \
  --process {id} --run {run_dir}
```
Record `{id, status: "tombstone"}` for meta.json.
```

- [ ] **Step 13: Point Stage 7 summarize at the set (single department)**

Find the Stage-7 dispatch:

```
### Stage 7 — summarize (per department)

For each department touched in Stage 6, dispatch a `summarize` task — as the **first action of the
turn**, with no standalone status message before it (that would end the turn). Any status line
rides in the **same message** as the `Task` call:
```
Task: summarize
  department: {dept}
  data_root: <data-repo>
  attachment_texts: {attachment_texts}   # cached .txt paths for {dept} from Stage 5a (may be empty)
```
Wait for completion. It writes/updates `departments/{dept}/overview.json`.
```

Replace with:

```
### Stage 7 — summarize over the set

Dispatch a `summarize` task for `{department}` — as the **first action of the turn**, no standalone
status message before it (that ends the turn); any status line rides in the **same message** as the
`Task` call:
```
Task: summarize
  department: {department}
  transcript_paths: [<every transcript in the set>]
  data_root: <data-repo>
  attachment_texts: {attachment_texts}   # from Stage 5a (may be empty)
```
Wait for completion. It reads the whole set and writes/updates `departments/{department}/overview.json`.
```

- [ ] **Step 14: Update Stage 8 (meta finalise + commit) for the new statuses and department scoping**

Find the Stage-8 body:

```
### Stage 8 — Finish run + commit (per department)

1. Update `{run_dir}/meta.json`:
   - Set `finished_at` to the current ISO-8601 Z timestamp.
   - Populate `processes[]` with all entries from Stages 5–6:
     - new merges: `{id: "<dept>-NNN", status: "new"}`
     - update merges: `{id: "<existing_id>", status: "update"}`
     - unchanged segments: `{id: "<existing_id>", status: "unchanged"}`
     - auto-created sub-processes (captured from merge stdout in Stage 6): `{id: "<child-id>", status: "new", auto_subprocess_of: "<parent-id>"}`
   - After updating, re-validate: `Bash: validate run-meta {run_dir}/meta.json` (fix and re-validate on failure) so a malformed record is never committed.

2. Commit the run artefacts:
   ```
   Bash: git -C <data-repo> add -A && \
         git -C <data-repo> commit -m "pipeline({dept}): {N} processes from {voice}"
   ```
   Where `{N}` is the count of new + updated processes (not unchanged) for that department.

   For multiple departments, either commit once per department or include all in one commit message listing each department:
   ```
   pipeline(warehouse+cooking): 3 processes from dining-2026-05-06
   ```
```

Replace with:

```
### Stage 8 — Finish run + commit

1. Update `{run_dir}/meta.json`:
   - Set `finished_at` to the current ISO-8601 Z timestamp.
   - Populate `processes[]` with every entry from Stages 5–6:
     - new: `{id: "<dept>-NNN", status: "new"}`
     - update: `{id: "<existing_id>", status: "update"}`
     - unchanged: `{id: "<existing_id>", status: "unchanged"}`
     - merge/split heirs: `{id: "<heir-id>", status: "merge"|"split", superseded: […], heir_of: […]}`
     - attach: `{id: "<child-id>", status: "attach"}`
     - tombstone: `{id: "<id>", status: "tombstone"}`
     - auto-created sub-processes (from merge stdout): `{id: "<child-id>", status: "new", auto_subprocess_of: "<parent-id>"}`
   - Re-validate: `Bash: validate run-meta {run_dir}/meta.json` (fix and re-validate on failure) so a
     malformed record is never committed.

2. Commit the run artefacts:
   ```
   Bash: git -C <data-repo> add -A && \
         git -C <data-repo> commit -m "pipeline({department}): {N} processes from {K} transcripts"
   ```
   `{N}` = count of new + updated + restructured (merge/split/attach/tombstone) processes (not
   unchanged); `{K}` = size of the set.
```

- [ ] **Step 15: Update Stage 9 (report restructure lineage) and the final completion line**

Find the Stage-9 completion block:

```
5. If there are no conflicts (`pending[]` is empty for all written processes), report completion:
   ```
   پایان موفق اجرا. فرایندهای {voice} پردازش و ثبت شدند.
   ```
```

Replace with:

```
5. **Restructure lineage report (report only — no pause).** For every `merge`/`split`/`attach`/
   `tombstone` recorded in Stage 8, output a Persian line naming the heir(s) and the superseded/
   retired/re-parented committed ids, e.g. «فرایندهای dining-003 و dining-007 در dining-014 ادغام
   شدند (نسخه‌های قبلی سنگ‌قبر شدند).» Tombstones stay on disk, are excluded from future matching,
   and are shown labelled in the UI.

6. If there are no conflicts (`pending[]` is empty for all written processes), report completion:
   ```
   پایان موفق اجرا. مجموعهٔ {K} رونویسِ دپارتمان {department} پردازش و ثبت شد.
   ```
```

- [ ] **Step 16: Rewrite the "Summary of stage ordering" table + key invariants**

Find the whole `## Summary of stage ordering` section through the end of the file (the table + the "Key invariants" list) and replace it with:

```
## Summary of stage ordering

| Stage | Name | Tool/CLI | Pauses? |
|-------|------|----------|---------|
| 0 | Resolve state / resume | Read meta.json | — |
| — | Resolve the set (dept glob or explicit list) | Glob | — |
| **A** | **Set-confirmation checkpoint** | Telegram message | **STOP** |
| 1 | Transcribe-missing reconcile (idempotent; per-file verbatim gate) | `Bash: transcribe` × missing | — |
| 2 | Init / finalise run record | Write meta.json | — |
| 3 | classify over the set | `Task: classify` | — |
| **B** | **Segmentation / restructure checkpoint** | Telegram message | **STOP** |
| 5a | prepare attachments | `Bash: extract-attachment` | — |
| 5 | extract per desired process (**serial**) | `Task: extract` × N | — |
| 6 | merge (`new`/`update`/`restructure`/`attach-subprocess`/`remove`) | `Bash: merge …` | — |
| 7 | summarize over the set | `Task: summarize` | — |
| 8 | Finish + commit | Write meta.json, `git -C` | — |
| 9 | Conflict + restructure-lineage report | `Bash: merge accept/reject` | end |

**Key invariants:**
- `merge` is the ONLY writer of `departments/**/processes/*.json` (hook-enforced); `restructure`,
  `attach-subprocess`, `remove` are engine verbs — never hand-edit process files.
- The run reads **all** transcripts in full (spec §4.1); no distillation, no per-voice/batch mode,
  no conservative-subset mode. A set of one is the smallest case.
- **Gate A and Gate B are the only mid-run pauses.** Everywhere else, continue in the same turn — a
  returning `Task`/CLI is never a stopping point. Never send a prose-only message between stages (a
  message with no tool call ends the turn — the #1 stall); status text rides with the next call.
- Stage-0 resume re-enters at **Gate A** (`segments.json` absent) or **Gate B** (`segments.json`
  present, `processes[]` empty).
- **Extract is strictly serial** — dispatch one `extract` `Task`, await it, then the next; never two
  in one message (the Claude SDK bridge silently drops parallel `Task` batches).
- Tombstoned processes stay on disk, are excluded from classify matching, and are shown labelled in
  the UI (INV-4 — never deleted here; only user-initiated UI delete removes one).
- `{run_dir}/meta.json` with `finished_at: null` always signals a resumable in-progress run. All
  timestamps are ISO-8601 with `Z` suffix.
```

- [ ] **Step 17: Verify — old absent, new present, consistent**

Run: `grep -n "process-voice <voice>\|runs/{voice}\|Per-department fan-out\|transcript_excerpt: {transcript_excerpt}\|\"voice\": \|attempt-NN\|Stage 4 — Human checkpoint\|Stage 5–9 — Per-department" "<data-repo>/.claude/skills/process-voice/SKILL.md"`
Expected: **no matches** (all per-voice / per-department-fan-out / attempt-NN / Stage-4 text is gone).

Run: `grep -n "Gate A\|Gate B\|Resolve the set\|transcript_paths\|Transcribe-missing reconcile\|merge restructure\|attach-subprocess\|merge remove\|restructure/{seq}.json\|Restructure lineage\|Context budget\|runs/{department}/{stamp}" "<data-repo>/.claude/skills/process-voice/SKILL.md"`
Expected: matches for all.

Then Read the whole file top-to-bottom and confirm: exactly two `STOP` gates (A, B); the Turn-discipline section (preserved) now lists three legitimate end-of-turn points; Stage-0 resume names the two re-entry points; every stage that dispatches a `Task`/CLI carries its call (no prose-only stalls introduced); the merge verbs and their flags match the Phase-1 contract; nothing still assumes a single voice or multiple departments per run.

- [ ] **Step 18: Commit**

```bash
git -C "<data-repo>" add .claude/skills/process-voice/SKILL.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(process-voice): set-based department orchestrator with Gate A + Gate B

Reworks the playbook into one path: resolve the department set (glob or explicit list),
Gate A (set confirmation, STOP), transcribe-missing reconcile, classify over the whole set,
Gate B (segmentation/restructure checkpoint, STOP), serial extract per desired process,
merge with new/update/restructure/attach-subprocess/remove, summarize over the set, commit,
restructure-lineage report. Stage-0 resume re-enters at Gate A or Gate B. Turn-discipline
preserved. (spec §4.1, §4.10)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: NEW `edit-process/SKILL.md` — direct conversational edit (no voice) (§4.12)

**Files:**
- Create: `<data-repo>/.claude/skills/edit-process/SKILL.md`

**Interfaces:**
- Consumes: the same engine op set (`merge update` with `revise_nodes`/`remove_edges`/`add_nodes`/`add_edges`/`flag_removed`; `merge restructure`/`attach-subprocess`/`remove`) and the `idef-extraction` delta/restructure contracts (Task 6).
- Produces: a committed edit to `departments/**/processes/*.json` with `source.type: "chat"`, committed by Claude.

- [ ] **Step 1: Baseline — prove the skill does not exist**

Run: `test -e "<data-repo>/.claude/skills/edit-process/SKILL.md" && echo EXISTS || echo ABSENT`
Expected: `ABSENT`.

- [ ] **Step 2: Create the skill**

Write `<data-repo>/.claude/skills/edit-process/SKILL.md` with exactly:

```markdown
---
name: edit-process
description: Apply a direct conversational edit to committed process work with NO voice/transcript — read the target process.json, build the matching engine artifact, confirm destructive ops, run the matching merge verb (the sole writer), and commit with source.type "chat". Reuses the pipeline's engine op set (§4.12).
---

# edit-process playbook

**Invocation:** the user, in chat, instructs a targeted edit of committed work with **no recording
processed** — e.g. «برچسب گره X را در فرایند Y عوض کن», «بعد از مرحلهٔ Z یک مرحله اضافه کن», «آن یال
را حذف کن», «این دو فرایند را ادغام کن», «این فرایند را حذف کن».

This reuses the **entire engine op set** built for the pipeline. It **never writes `process.json`
directly** — every change goes through `merge` (the sole writer, hook-enforced), so INV-1/INV-3/INV-4
all still hold. The only differences from a pipeline run are the input (a chat instruction, not
transcripts) and the absence of the read-all/segment phase (a targeted edit needs neither).

All paths are relative to `<data-repo>` (`DATA_ROOT`). Every engine CLI runs with
`DATA_ROOT=<data-repo>` set.

## Step 1 — Identify the target and read it (read-only)

1. Resolve the target process id(s) from the instruction (ask the user in Persian if ambiguous —
   e.g. list candidate processes by name and id).
2. **Read** each target `departments/{dept}/processes/{id}.json` (read-only) to obtain its **real
   node ids**. You will copy those ids verbatim into the artifact; never invent an id (INV-1). Do
   not match against **tombstoned** processes (`tombstoned: true` / non-empty `superseded_by`).

## Step 2 — Build the matching engine artifact

Choose the artifact by the kind of edit (see the `idef-extraction` skill §5/§8 for exact shapes):

- **Field / label change** → a `delta` with `revise_nodes: [{id, set:{…}}]` (overwrite) — or
  `enrich_nodes` if the field is empty.
- **Insert a step** → a `delta` with `add_nodes` (temp keys `n1`, …) + `add_edges`, and — for **edge
  hygiene** — `remove_edges` for the edge the new node makes redundant.
- **Remove an edge** → a `delta` with `remove_edges: [{from, to}]` (real ids).
- **Drop a node** → a `delta` with `flag_removed: [{id}]` (the engine sets `removed:true`; never
  deletes — INV-4).
- **Merge / split** → a `merge restructure` plan (`{department, heirs:[{candidate, supersedes:[pid],
  subprocess_links:[…]}]}`).
- **Re-parent an existing process under a node** → `merge attach-subprocess`.
- **Delete / retire a process** → `merge remove` (tombstone, never a hard delete).

Write any `delta`/`candidate`/`plan` artifact to a scratch path under `runs/chat/{stamp}/`.

## Step 3 — Confirm proportionally (the analogue of Gate B)

- A **simple, non-destructive** edit (a field change, adding a node/edge) executes **directly** — no
  confirmation pause.
- A **destructive/structural** edit (delete/tombstone, merge, split, attach) shows a **one-line
  Persian confirmation first** and waits for the user's «تأیید». This is the proportional analogue
  of Gate B — destructive-op confirmation, scaled to a single edit.

## Step 4 — Run the matching `merge` verb (the sole writer)

Run exactly the verb matching the artifact, with `--run runs/chat/{stamp}`:

```
Bash: DATA_ROOT=<data-repo> merge update --process {id} --delta {delta} --run runs/chat/{stamp}
Bash: DATA_ROOT=<data-repo> merge restructure --plan {plan} --run runs/chat/{stamp}
Bash: DATA_ROOT=<data-repo> merge attach-subprocess --parent-process {P} --node {N} --child {C} --run runs/chat/{stamp}
Bash: DATA_ROOT=<data-repo> merge remove --process {id} --run runs/chat/{stamp}
```

`merge` applies the change, re-layouts, and **preserves all ids and prior manual edits**. The run
carries `source.type: "chat"` provenance (the engine sets `source`/`touched_by`; the agent never
sets provenance — INV-1).

## Step 5 — Commit to git

Every mutation to committed data ends in a commit — nothing is left uncommitted. Commit with a clear
message keyed to the edit:

```
Bash: git -C <data-repo> add -A && \
      git -C <data-repo> commit -m "chat-edit({id}): <one-line Persian/English summary of the change>"
```

The deploy `git-push` cron pushes it, exactly like a pipeline commit. Confirm the working tree is
clean afterward (`git -C <data-repo> status --porcelain` prints nothing).

## Step 6 — Report

Reply in Persian with what changed (the process id, the node/edge/label affected, and — for a
destructive op — that the original was tombstoned/flagged, not deleted). Do not paste the full
`process.json`.

## Invariants

- **`merge` is the sole writer** — never edit `process.json` directly (hook-enforced).
- **INV-1** — ids are engine-minted; copy committed ids verbatim, use temp keys for new nodes, never
  set `source`/`superseded_by`/`position`/`layout`.
- **INV-3** — no fabrication: model only what the user actually instructed.
- **INV-4** — never delete/lose: node drops are `flag_removed`; process removals are `merge remove`
  (tombstone). The only hard delete is user-initiated in the UI.
- **Provenance** — the resulting change is `source.type: "chat"`; Claude commits it.
```

- [ ] **Step 3: Verify — present and consistent**

Run: `test -e "<data-repo>/.claude/skills/edit-process/SKILL.md" && echo EXISTS`
Expected: `EXISTS`.

Run: `grep -n "source.type\|chat-edit(\|merge restructure\|attach-subprocess\|merge remove\|revise_nodes\|remove_edges\|sole writer\|proportional analogue of Gate B" "<data-repo>/.claude/skills/edit-process/SKILL.md"`
Expected: matches for all.

Then Read the whole file and confirm: it never instructs a direct `process.json` write; every mutating path goes through a `merge` verb; the destructive-op confirmation is present; the commit step ends the flow with a clean working tree; the invariants restate INV-1/3/4 + sole-writer.

- [ ] **Step 4: Commit**

```bash
git -C "<data-repo>" add .claude/skills/edit-process/SKILL.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(edit-process): direct conversational edit skill (no voice) via merge + chat provenance

New skill for targeted edits of committed work with no recording: read target process.json,
build the matching engine artifact (delta revise_nodes/remove_edges/etc., or restructure/
attach-subprocess/remove), confirm destructive ops proportionally, run the matching merge
verb (sole writer), commit with source.type "chat" (chat-edit({id})). Reuses the pipeline
engine op set; INV-1/3/4 + sole-writer preserved. (spec §4.12)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-implementation

No automated semantic tests exist for the prompts; the schema tests are the `validate` positive/
negative checks in Tasks 1–2. After all eight tasks commit, hand back to the user for the spec §8
acceptance tests on the dining set (`1405-04-11`, `-04-14`, `-04-15`): all-at-once vs. one-at-a-time
convergence (forcing one merge and one split), the two gates (Gate A accepts set edits and shows
left-out recordings for the list form; Gate B accepts segmentation/restructure edits), `attach-
subprocess` + edge-hygiene, manual input (`source.type: "manual"`), and a direct chat edit
(`source.type: "chat"`, `chat-edit(…)` commit, clean working tree; a destructive chat edit confirms
first). Phase-1 engine behaviour (id ledger, tombstones, restructure execution) is assumed present
and correct — this phase only exercises it.

**Consumes but does not build (Phase 1 LOCKED CONTRACT):** `merge restructure`/`attach-subprocess`/
`remove`; `delta.remove_edges`/`revise_nodes` + `merge update` support; `restructure.schema.json`;
`process.schema.json` `tombstoned`/`superseded_by`; the durable id ledger. If any of these is not yet
present in the working tree, Phase 1 must land first — Phase 2's prompts reference these verbs/fields
by name.
```
