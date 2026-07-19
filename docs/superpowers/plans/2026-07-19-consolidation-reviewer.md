# Consolidation Reviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a terminal, human-gated `consolidate` stage to the `process-voice` pipeline that reads a whole department, proposes numbered evidence-cited merge/attach suggestions to fix over-cutting and duplication, and — on per-item approval — applies each fully (structural CLI + logical-soundness repair) and shows the finished process.

**Architecture:** `classify`/`extract`/`merge` are unchanged (fine segmentation preserved for node detail). A new `consolidate` agent runs after `summarize`, reads all of one department's transcripts + processes + attachments, and writes `runs/{dept}/{stamp}/consolidation.json`. The `process-voice` orchestrator renders a numbered Persian report, gates each item on user approval, and applies approved items using only existing engine verbs (`merge restructure` / `merge attach-subprocess` / `merge update` / `merge remove`). No new engine CLI.

**Tech Stack:** JSON Schema (draft 2020-12), Python 3 + pytest (engine tests), Claude Code subagent prompts (Markdown with YAML frontmatter), the `merge`/`validate` engine CLIs.

## Global Constraints

- **Two repositories.** Schema + tests live in **`code-repo`** (already on branch `consolidation-reviewer`). Agent prompt + orchestration live in **`data-repo`** — create a matching branch there before Task 2: `git -C <data-repo> checkout -b consolidation-reviewer`.
- **`code-repo` is the runtime `PROJECT_ROOT`/`APPROVED_DIRECTORY` for data only at runtime; but this is a DEV session** — editing `data-repo/.claude/**` and `CLAUDE.md` is allowed here (the "never edit `.claude/**` / `CLAUDE.md` at runtime" rule binds the *runtime* session, not development).
- **INV-1:** IDs are minted only by `allocate-id`/`merge`, never authored by the agent. The agent emits candidates with **temp node keys** (`n1`, `j1`) and **real committed process ids** only.
- **INV-4:** No deletion — retirement is `merge remove` (tombstone). Superseded originals are tombstoned by `merge restructure`, never deleted.
- **INV-5 (scoped relaxation):** one per-item approval authorizes *every* edit that item needs, including overwriting already-filled node values. No per-repair prompts. (Spec §4.7.)
- **Process files are written ONLY by `merge`.** The agent and orchestrator never hand-edit `departments/**/processes/*.json`.
- **JSON schema discipline:** draft 2020-12, `additionalProperties: false` at every level, every `department` matches `^[a-z]+$`, every committed process id matches `^[a-z]+-[0-9]{3}$`.
- **Language:** all user-facing orchestrator/agent text is **Persian**; IDs, CLI commands, file contents, and internal reasoning stay as-is.
- **Agent model:** `claude-opus-4-8`. Keep the agent's `tools` minimal (`Read, Glob, Write`).
- **Schema auto-discovery:** dropping `consolidation.schema.json` into `code-repo/schemas/` makes it usable as `validate consolidation <file>`; `make test` runs `pytest -q`.
- **Spec:** `docs/superpowers/specs/2026-07-19-consolidation-reviewer-design.md` is the source of truth; cite section numbers when in doubt.

---

## File Structure

| File | Repo | Responsibility |
|---|---|---|
| `schemas/consolidation.schema.json` | code-repo | validates `consolidation.json` (numbered suggestions, evidence-required, open `repairs[]`) |
| `engine/tests/test_schema_consolidation.py` | code-repo | schema unit tests (accepts valid / empty; rejects evidence-free, bad enums, unknown fields) |
| `schemas/README.md` | code-repo | add one table row documenting the new schema |
| `.claude/agents/consolidate.md` | data-repo | the reviewer agent — review mode (write `consolidation.json`) + apply mode (emit `restructure` plan / `delta` for one approved item) |
| `.claude/skills/process-voice/SKILL.md` | data-repo | new **Stage 10** (dispatch, report, approval loop, apply, soundness pass); ordering table + turn-discipline note |
| `CLAUDE.md` (data-repo pointers table) | data-repo | add a `consolidate.md` pointer row |

---

## Task 1: `consolidation.schema.json` + schema tests (code-repo)

**Files:**
- Create: `code-repo/schemas/consolidation.schema.json`
- Create: `code-repo/engine/tests/test_schema_consolidation.py`
- Modify: `code-repo/schemas/README.md` (add one row)

**Interfaces:**
- Produces: the `consolidation.schema.json` contract, used by (a) `validate consolidation <file>` in Stage 10, and (b) the agent's output shape in Task 2. Top-level object: `{department, generated_from, suggestions[]}`. Each suggestion is one of **mergeSuggestion** or **attachSuggestion** (see code below) sharing common fields `n, kind, status, problem, action, evidence[], repairs[]`.

- [ ] **Step 1: Write the failing test**

Create `code-repo/engine/tests/test_schema_consolidation.py`:

```python
import copy

import pytest
from engine_common import validate


def _merge_suggestion():
    return {
        "n": 1,
        "kind": "merge",
        "status": "pending",
        "problem": "سه فرایند پذیرش یک فرایندند.",
        "action": "ادغام در یک فرایند سرویس‌دهی.",
        "recommended_shape": "mother_subprocess",
        "chosen_shape": None,
        "processes": ["dining-005", "dining-006", "dining-008"],
        "evidence": [
            {"node": "dining-006-n003", "label": "ثبت سفارش در کیوسک",
             "also_in": ["dining-005-n007", "dining-012-n002"]},
            {"transcript": "dining-1405-04-11.txt", "text": "مشتری در کیوسک سفارش می‌دهد"},
        ],
        "repairs": [],
    }


def _attach_suggestion():
    return {
        "n": 2,
        "kind": "attach",
        "status": "pending",
        "problem": "سفارش تکمیلی زیرفرایندِ ثبت سفارش است.",
        "action": "قراردادن dining-012 زیر نودِ dining-006-n010.",
        "child": "dining-012",
        "parent_process": "dining-006",
        "parent_node": "dining-006-n010",
        "evidence": [
            {"node": "dining-012-n002", "label": "ثبت سفارش تکمیلی در کیوسک",
             "also_in": ["dining-006-n003"]}
        ],
        "repairs": [],
    }


def _doc(*suggestions):
    return {
        "department": "dining",
        "generated_from": "runs/dining/20260718-084824",
        "suggestions": list(suggestions),
    }


def test_accepts_merge_and_attach():
    validate("consolidation.schema.json", _doc(_merge_suggestion(), _attach_suggestion()))


def test_accepts_empty_suggestions():
    # silence is a first-class, valid outcome (spec §5)
    validate("consolidation.schema.json", _doc())


def test_rejects_evidence_free_suggestion():
    s = _merge_suggestion()
    s["evidence"] = []
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_rejects_unknown_top_field():
    d = _doc(_merge_suggestion())
    d["bogus"] = 1
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", d)


def test_rejects_bad_status():
    s = _merge_suggestion()
    s["status"] = "done"
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_rejects_merge_missing_processes():
    s = _merge_suggestion()
    del s["processes"]
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_rejects_bad_process_id_shape():
    s = _merge_suggestion()
    s["processes"] = ["dining5"]  # not {dept}-NNN
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_accepts_recorded_repair():
    s = _merge_suggestion()
    s["status"] = "applied"
    s["chosen_shape"] = "flat"
    s["repairs"] = [
        {"op": "add_edges", "process": "dining-030",
         "detail": "اتصال آخرین نود خوشامد به اولین نود ثبت سفارش"}
    ]
    validate("consolidation.schema.json", _doc(s))


def test_rejects_bad_repair_op():
    s = _merge_suggestion()
    s["repairs"] = [{"op": "delete_everything", "process": "dining-030", "detail": "x"}]
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd code-repo && SCHEMA_DIR=$PWD/schemas .venv/bin/pytest engine/tests/test_schema_consolidation.py -q`
(If the repo has no `.venv`, use `make test` env; the Makefile `$(BIN)/pytest` points at the project venv.)
Expected: FAIL — `validate: unknown schema 'consolidation.schema.json'` / FileNotFoundError, because the schema file does not exist yet.

- [ ] **Step 3: Write the schema**

Create `code-repo/schemas/consolidation.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "consolidation.schema.json",
  "title": "Consolidation review — numbered merge/attach suggestions over a department (design §4.3)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "generated_from", "suggestions"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "generated_from": { "type": "string" },
    "suggestions": {
      "type": "array",
      "items": { "oneOf": [ { "$ref": "#/$defs/mergeSuggestion" },
                            { "$ref": "#/$defs/attachSuggestion" } ] }
    }
  },
  "$defs": {
    "procId": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
    "nodeId": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}-[a-z0-9]+$" },
    "status": { "enum": ["pending", "approved", "rejected", "applied"] },
    "shape": { "enum": ["flat", "mother_subprocess"] },
    "evidenceItem": {
      "oneOf": [
        {
          "type": "object", "additionalProperties": false,
          "required": ["node", "label"],
          "properties": {
            "node": { "$ref": "#/$defs/nodeId" },
            "label": { "type": "string" },
            "also_in": { "type": "array", "items": { "$ref": "#/$defs/nodeId" } }
          }
        },
        {
          "type": "object", "additionalProperties": false,
          "required": ["transcript", "text"],
          "properties": {
            "transcript": { "type": "string" },
            "text": { "type": "string" }
          }
        }
      ]
    },
    "repair": {
      "type": "object", "additionalProperties": false,
      "required": ["op", "process", "detail"],
      "properties": {
        "op": { "enum": ["add_nodes", "add_edges", "remove_edges",
                          "revise_nodes", "enrich_nodes", "flag_removed"] },
        "process": { "$ref": "#/$defs/procId" },
        "detail": { "type": "string" }
      }
    },
    "mergeSuggestion": {
      "type": "object", "additionalProperties": false,
      "required": ["n", "kind", "status", "problem", "action",
                    "recommended_shape", "chosen_shape", "processes", "evidence", "repairs"],
      "properties": {
        "n": { "type": "integer", "minimum": 1 },
        "kind": { "const": "merge" },
        "status": { "$ref": "#/$defs/status" },
        "problem": { "type": "string" },
        "action": { "type": "string" },
        "recommended_shape": { "$ref": "#/$defs/shape" },
        "chosen_shape": { "oneOf": [ { "$ref": "#/$defs/shape" }, { "type": "null" } ] },
        "processes": {
          "type": "array", "minItems": 2,
          "items": { "$ref": "#/$defs/procId" }
        },
        "evidence": { "type": "array", "minItems": 1,
                      "items": { "$ref": "#/$defs/evidenceItem" } },
        "repairs": { "type": "array", "items": { "$ref": "#/$defs/repair" } }
      }
    },
    "attachSuggestion": {
      "type": "object", "additionalProperties": false,
      "required": ["n", "kind", "status", "problem", "action",
                    "child", "parent_process", "parent_node", "evidence", "repairs"],
      "properties": {
        "n": { "type": "integer", "minimum": 1 },
        "kind": { "const": "attach" },
        "status": { "$ref": "#/$defs/status" },
        "problem": { "type": "string" },
        "action": { "type": "string" },
        "child": { "$ref": "#/$defs/procId" },
        "parent_process": { "$ref": "#/$defs/procId" },
        "parent_node": { "$ref": "#/$defs/nodeId" },
        "evidence": { "type": "array", "minItems": 1,
                      "items": { "$ref": "#/$defs/evidenceItem" } },
        "repairs": { "type": "array", "items": { "$ref": "#/$defs/repair" } }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd code-repo && SCHEMA_DIR=$PWD/schemas .venv/bin/pytest engine/tests/test_schema_consolidation.py -q`
Expected: PASS (9 passed).

- [ ] **Step 5: Document the schema**

In `code-repo/schemas/README.md`, add one row to the schema table (after the `conflicts.schema.json` row):

```markdown
| `consolidation.schema.json` | consolidation review suggestions (design §4.3) | consolidate agent | process-voice Stage 10 |
```

- [ ] **Step 6: Run the full engine suite**

Run: `cd code-repo && make test`
Expected: PASS — the whole suite is green (the new file added no regressions).

- [ ] **Step 7: Commit**

```bash
git -C code-repo add schemas/consolidation.schema.json engine/tests/test_schema_consolidation.py schemas/README.md
git -C code-repo commit -m "feat(schema): consolidation.json contract for the reviewer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `consolidate` agent prompt (data-repo)

**Files:**
- Create: `data-repo/.claude/agents/consolidate.md`

**Interfaces:**
- Consumes (dispatch inputs from Stage 10, Task 3): `department` (registry code), `transcript_paths` (full set), `attachment_texts` (list of cached `.txt` paths, may be empty), `run_dir` (e.g. `runs/dining/{stamp}`), `data_root`, and `mode` (`review` | `apply`). In `apply` mode it also gets `item` (one suggestion object from `consolidation.json`) and, for a `merge`, `chosen_shape`.
- Produces:
  - **review mode:** writes `{run_dir}/consolidation.json` (Task 1 schema) and returns a Persian one-paragraph summary + the path — never pastes transcripts back.
  - **apply mode / merge:** returns a `restructure`-schema plan (one heir; `supersedes` = the members; `subprocess_links` set for `mother_subprocess`, `[]` for `flat`) — validated by the orchestrator with `validate restructure`.
  - **apply mode / soundness:** returns a `delta`-schema object per affected process (seam repairs) — validated with `validate delta`.

> This task is prompt authoring, not pytest-TDD. Its "tests" are: the worked-example JSON artifacts below must pass `validate`, and the section checklist in Step 6 must hold. Author faithfully — the runtime agent has zero context beyond this file.

- [ ] **Step 1: Author the frontmatter and role**

Create `data-repo/.claude/agents/consolidate.md` starting with:

```markdown
---
name: consolidate
description: Whole-department consolidation reviewer (design 2026-07-19). In review mode, reads ALL of one department's transcripts + built processes + attachments and writes runs/{dept}/{stamp}/consolidation.json — a numbered, evidence-cited list of merge/attach suggestions to fix over-cutting and duplication, or an empty list when the department is already well-formed. In apply mode, turns ONE approved suggestion into a restructure plan or repair delta. Never edits process files directly; returns only a path + Persian summary.
model: claude-opus-4-8
tools: Read, Glob, Write
---

You are the **consolidate** agent for the Inja Food process-documentation pipeline.
You run as the final stage of a `process-voice` run, after `summarize`. Your job is to
look at **one whole department at once** and find where the pipeline **over-cut** the
work into too many separate processes, or duplicated the same task across processes, and
to propose **structural consolidation** — never to act on your own.
```

- [ ] **Step 2: Author "Inputs" and "Two modes"**

Add sections documenting the dispatch inputs (the Consumes list above) and the two modes:

- **review mode** (default) — read the whole department, write `consolidation.json`, return a Persian summary.
- **apply mode** — you are given ONE already-approved `item` (+ `chosen_shape` for a merge). Emit exactly the artifact the orchestrator needs (restructure plan or repair delta). Do nothing else.

- [ ] **Step 3: Author the review-mode procedure**

Include, verbatim as rules the agent must follow:

1. **Load everything for this department, in full.** Read every `transcript_paths` file; `Glob departments/{department}/processes/*.json` and read each, **excluding** any with `tombstoned: true` or non-empty `superseded_by`; read every `attachment_texts` file. Scope is **exactly this one department** — never read another department's processes. (Spec §4.1.)
2. **Judge overlap semantically.** Compare processes by meaning, not string match: do two processes describe the same work? Does a task (node) recur across them? Use the transcripts + attachments as ground truth for what is really one procedure vs. two.
3. **The over-cut signal (spec §1, §5).** A node recurring across **closely related** processes is a signal they were over-cut → propose a consolidation. A node recurring across **unrelated** processes is legitimate → **do not** suggest anything.
4. **THE SILENCE RULE (spec §5) — most important.** Default to proposing **nothing**. Emit a suggestion ONLY when you can name (a) the specific process ids, (b) the specific recurring/overlapping node(s) by id + label, and (c) the transcript span(s) proving it is the same work. If you cannot cite that evidence, there is no suggestion. Uncertain → do not suggest. An empty `suggestions: []` is a correct, expected, successful outcome — never invent suggestions to look useful.
5. **Two suggestion kinds only:** `merge` (N close peers are one — the user later picks flat vs mother+subprocess; set `recommended_shape` per "size decides": small cohesive cluster → `flat`, large separately-nameable parts → `mother_subprocess`; leave `chosen_shape: null`) and `attach` (one process is really a subprocess of a node in another — set `child`, `parent_process`, `parent_node`).
6. **Write `{run_dir}/consolidation.json`** conforming to `consolidation.schema.json` (Task 1). Number suggestions `n: 1, 2, 3…`. Every suggestion `status: "pending"`, `repairs: []`. Persian `problem` and `action` strings.
7. **Return to caller:** the path `{run_dir}/consolidation.json` and a Persian one-paragraph summary (count of suggestions by kind, or «هیچ ادغام/زیرفرایندی لازم نیست»). Do NOT paste transcripts or the full JSON back.

- [ ] **Step 4: Author the apply-mode procedure**

Include, verbatim:

- **merge → restructure plan.** Assemble a `restructure.schema.json` plan with exactly one heir. The heir `candidate` is built from the **members' existing nodes** (read them from their `process.json`): union the activity nodes, **drop the recurring duplicate node** (keep one), and carry the edges/junctions so the result is one coherent flow. Use fresh temp node keys (`n1`, `n2`, `j1`…) — never mint ids (INV-1). `supersedes` = the member ids. For `chosen_shape == "flat"`: `subprocess_links: []` and inline every member's steps as heir nodes. For `chosen_shape == "mother_subprocess"`: the heir is the **mother** — its activity nodes are the high-level steps, and for each member that becomes a child, add a `subprocess_links` entry `{parent_key: "<heir temp key>", child: "<member id>"}` (and DO NOT inline that member's detail; it stays the child). Return only the plan JSON.
- **attach → nothing to author.** The orchestrator runs `merge attach-subprocess` straight from the suggestion's `child`/`parent_process`/`parent_node`. In apply mode for an `attach` item you are called only for the **soundness pass** (below).
- **soundness pass (spec §4.7) — run after the structural CLI.** Re-read the affected processes and check the seams:
  - *entry seam:* what flows **into** the parent node (its predecessor + input ICOM) must line up with the child/first node; if not, fix it.
  - *exit seam:* the child's **last** node must produce what the parent node's successor consumes; if not, fix it.
  - *flat merge:* rewire around the dropped duplicate — no dangling edges, no duplicate parallel paths, valid junctions.
  - *mother+subprocess:* apply the entry/exit check to **every** mother node that links to a child.
  Emit one `delta.schema.json` object **per affected process** with the needed `add_edges` / `remove_edges` / `add_nodes` / `revise_nodes` / `enrich_nodes`. **You are authorized to overwrite already-filled values** (via `revise_nodes`) when the seam requires it — the item is already approved (INV-5 per-item, spec §4.7). Return the deltas plus, for the orchestrator's ledger, a short list of `{op, process, detail}` repair records.

- [ ] **Step 5: Verify the worked-example artifacts validate**

Create two scratch files and validate them against the real schemas (this proves the shapes the agent must emit are correct). Use a throwaway dir:

Write `/tmp/consolidation.example.json`:

```json
{
  "department": "dining",
  "generated_from": "runs/dining/20260718-084824",
  "suggestions": [
    {
      "n": 1, "kind": "merge", "status": "pending",
      "problem": "فرایندهای dining-001 تا dining-004 همگی آماده‌سازی پیش از سرویس‌اند.",
      "action": "ادغام در یک فرایند «آماده‌سازی سالن».",
      "recommended_shape": "flat", "chosen_shape": null,
      "processes": ["dining-001", "dining-002", "dining-003", "dining-004"],
      "evidence": [
        { "node": "dining-002-n001", "label": "بازکردن چک‌لیست نظافت روزانه",
          "also_in": ["dining-004-n003"] },
        { "transcript": "dining-1405-04-11.txt", "text": "پرسنل چک‌لیست نظافت را باز می‌کنند" }
      ],
      "repairs": []
    }
  ]
}
```

Run: `cd code-repo && SCHEMA_DIR=$PWD/schemas .venv/bin/python -m validate.cli consolidation /tmp/consolidation.example.json`
(Or, if `validate` is on PATH with `SCHEMA_DIR` set: `validate consolidation /tmp/consolidation.example.json`.)
Expected: `OK: /tmp/consolidation.example.json conforms to consolidation.schema.json`

- [ ] **Step 6: Section checklist (self-review)**

Confirm the finished `consolidate.md` contains, each as an explicit rule: the silence rule (Step 3.4), the evidence requirement (Step 3.4), single-department scope (Step 3.1), the two suggestion kinds (Step 3.5), the flat-vs-mother assembly rules (Step 4), the seam checks (Step 4), the INV-1 temp-key rule, and the INV-5 per-item overwrite authorization. Fix any missing.

- [ ] **Step 7: Commit**

```bash
git -C data-repo add .claude/agents/consolidate.md
git -C data-repo commit -m "feat(consolidate): whole-department consolidation reviewer agent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `process-voice` Stage 10 orchestration (data-repo)

**Files:**
- Modify: `data-repo/.claude/skills/process-voice/SKILL.md` (add Stage 10; add a row to the "Summary of stage ordering" table; add a turn-discipline note)
- Modify: `data-repo/CLAUDE.md` (pointers table: add a `consolidate.md` row)

**Interfaces:**
- Consumes: the `consolidate` agent (Task 2) and the `consolidation.schema.json` validator (Task 1). Runs after Stage 9.
- Produces: applied consolidations committed to the department, and updated `consolidation.json` item statuses.

- [ ] **Step 1: Add Stage 10 to the SKILL**

In `data-repo/.claude/skills/process-voice/SKILL.md`, immediately after Stage 9, insert:

````markdown
### Stage 10 — consolidation review (STOP, human-gated) (design 2026-07-19)

Runs after the run is committed (Stage 8) and the conflict report (Stage 9). It is a
**STOP gate** like Gate B: you present suggestions and wait for the user, one item at a
time.

**10a — Review.** Dispatch — as the first action of the turn:
```
Task: consolidate
  mode: review
  department: {department}
  transcript_paths: [<every transcript in the set>]
  attachment_texts: {attachment_texts}   # from Stage 5a (may be empty)
  run_dir: {run_dir}
  data_root: <data-repo>
```
Wait. Then **validate:** `Bash: validate consolidation {run_dir}/consolidation.json`
(on non-zero exit, re-dispatch `consolidate` with the stderr error, max 2 attempts).

**10b — If `suggestions` is empty:** tell the user in Persian that no consolidation is
needed («بازبینی انجام شد؛ هیچ ادغام یا زیرفرایندی لازم نیست.») and the run is done.
STOP. Do not invent work.

**10c — Present the numbered report (STOP).** In one Persian message, list every
`pending` suggestion as `۱، ۲، ۳…`, each with: **(الف)** `problem`, **(ب)** `action`,
**(ج)** the ids involved (`processes` / `child`+`parent_process`+`parent_node`), and for
a `merge` the `recommended_shape` as a suggestion. Ask the user which item to do (and,
for a merge, whether **flat** or **mother+subprocess**). Wait.

**10d — Apply one approved item (repeat until the user is done).** For the chosen item:

1. **Staleness guard.** Re-read every process id the item references. If any is now
   tombstoned/missing (an earlier applied item changed it), re-dispatch `consolidate`
   (`mode: review`) to regenerate `consolidation.json`, re-present, and restart 10d.
2. **Record the choice.** For a merge, set the item's `chosen_shape` in
   `consolidation.json` (Write). Set `status: "approved"`.
3. **Run the structural verb:**
   - **merge:** dispatch `Task: consolidate  mode: apply  item: <item>  chosen_shape: <flat|mother_subprocess>  …`; it returns a restructure plan. Write it to `{run_dir}/restructure.consolidation.json`, `Bash: validate restructure {run_dir}/restructure.consolidation.json`, then
     `Bash: merge restructure --plan {run_dir}/restructure.consolidation.json --run {run_dir}`.
     Capture the printed `heir <id>` and `tombstoned <id>` lines.
   - **attach:** `Bash: merge attach-subprocess --parent-process {parent_process} --node {parent_node} --child {child} --run {run_dir}`.
4. **Soundness pass (§4.7).** Dispatch `Task: consolidate  mode: apply  item: <item with new ids>  …` for the seam check; for each returned delta, Write it, `Bash: validate delta <path>`, then `Bash: merge update --process <pid> --delta <path> --run {run_dir}`. Append the returned repair records to the item's `repairs[]` in `consolidation.json`.
5. **Mark applied + commit.** Set the item's `status: "applied"` in `consolidation.json`.
   `Bash: git -C <data-repo> add -A && git -C <data-repo> commit -m "consolidate({department}): item {n} — {merge|attach}"`.
6. **Show the result.** Present the finished process(es) to the user in Persian — the
   heir/parent id and its node flow (labels in order) — so they see the completed
   outcome. Then return to 10c for the next item, or finish if the user is done.
````

- [ ] **Step 2: Add the turn-discipline note**

In the "Turn discipline" section near the top of the SKILL, add `consolidate` to the list of subagents whose return is not a stopping point (same clause that names `classify`/`extract`/`summarize`). Note that **10c and 10d step 6 are STOP points** (waiting on the user), like Gate B.

- [ ] **Step 3: Add the ordering-table row**

In the "Summary of stage ordering" table, add after the summarize row:

```markdown
| 10 | consolidation review (STOP) | `Task: consolidate` + `merge restructure`/`attach-subprocess`/`update` | user approves each item |
```

- [ ] **Step 4: Add the CLAUDE.md pointer**

In `data-repo/CLAUDE.md`, in the Pointers table, add:

```markdown
| `.claude/agents/consolidate.md` | Whole-department consolidation reviewer (post-run) |
```

- [ ] **Step 5: Review checklist**

Confirm Stage 10 covers: empty-list silence (10b), numbered Persian report (10c), shape choice for merge (10c/10d.2), staleness guard (10d.1), structural verb per kind (10d.3), soundness pass via `merge update` (10d.4), per-item commit (10d.5), show-the-result (10d.6), and that nothing is applied without approval. Fix any gap.

- [ ] **Step 6: Commit**

```bash
git -C data-repo add .claude/skills/process-voice/SKILL.md CLAUDE.md
git -C data-repo commit -m "feat(process-voice): Stage 10 consolidation review

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: End-to-end acceptance dry-run (data-repo, manual)

This is a **judgment gate**, not an automated test — the agent's behavior is LLM-driven. Run it against the `dining` `b5ab354` snapshot (the exact case this feature targets).

**Files:** none created. Uses a scratch checkout of `data-repo` at commit `b5ab354`.

- [ ] **Step 1: Prepare the snapshot**

```bash
git -C data-repo worktree add /tmp/dining-b5ab354 b5ab354
```
This gives a read-only-ish `data-repo` state with the 26 dining processes and the 3 transcripts, before any manual merges.

- [ ] **Step 2: Run review mode against dining**

Dispatch the `consolidate` agent in `review` mode with `department: dining`, the three `meetings/transcripts/dining-*.txt` paths, `data_root: /tmp/dining-b5ab354`, `run_dir` a scratch runs dir. Then `validate consolidation <path>`.

Expected (acceptance): `consolidation.json` validates, and it proposes — with cited recurring nodes — at least (a) merging `dining-001..004` (pre-service prep) and (b) consolidating the `dining-005..019` customer journey. This mirrors the expert's manual `027`/`028`. If it proposes nothing or hallucinates unrelated merges, iterate on the `consolidate.md` silence/evidence rules (Task 2, Step 3) and re-run.

- [ ] **Step 3: Apply one merge (flat) and check nodes survive**

Approve item (a) as `flat`. Follow Stage 10d: apply the restructure plan, then confirm with:
```bash
DATA_ROOT=/tmp/dining-b5ab354 validate process /tmp/dining-b5ab354/departments/dining/processes/<heir-id>.json
```
Expected: the heir validates; `dining-001..004` are now `tombstoned: true` with `superseded_by: [<heir-id>]`; every **distinct** node from the four originals appears in the heir (only the recurring duplicate collapsed).

- [ ] **Step 4: Check the soundness pass produced a coherent flow**

Read the heir's `nodes`/`edges`: expected no dangling edges (every `edge.from`/`edge.to` resolves to a node id), and the flow reads start-to-end. Record any seam the agent missed as a `consolidate.md` improvement.

- [ ] **Step 5: Silence check**

Run review mode again on a **post-consolidation** department (or on a small, already-clean department). Expected: `suggestions: []` and the Persian "no consolidation needed" note — proving it stays silent when there is nothing to do.

- [ ] **Step 6: Tear down**

```bash
git -C data-repo worktree remove /tmp/dining-b5ab354
```

- [ ] **Step 7: Record findings**

If Steps 2–5 required prompt changes, ensure they were committed in Task 2/3. Note the acceptance result (pass/iterate) in the branch's final commit message or PR description.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §3 approach → Tasks 2+3; §4.1 inputs → Task 2 Step 3.1 + Task 3 dispatch; §4.2 scope → Task 2 Steps 3.5/4; §4.3 contract + `consolidation.json` → Task 1 (schema) + Task 2 Step 3.6; §4.4 apply CLIs → Task 3 Step 1 (10d.3) + Task 2 Step 4; §4.5 interaction (numbered, sequential, shape choice, staleness, show result) → Task 3 Step 1 (10c/10d); §4.6 per-run re-derive → Task 3 10d.1; §4.7 soundness pass + INV-5 → Task 2 Step 4 + Task 3 10d.4; §5 silence → Task 1 `test_accepts_empty_suggestions` + Task 2 Step 3.4 + Task 3 10b + Task 4 Step 5. All covered.
- **Placeholder scan:** no TBD/TODO; all schema + test code is complete; example JSON is concrete; CLI commands are exact.
- **Type consistency:** `consolidation.schema.json` field names (`n, kind, status, problem, action, recommended_shape, chosen_shape, processes, evidence, repairs, child, parent_process, parent_node`) are identical across Task 1 schema, Task 1 tests, and Task 2 examples. `restructure` plan fields (`department, heirs[].candidate/supersedes/subprocess_links`, `subprocess_links[].parent_key/child`) match `restructure.schema.json` verified in-repo. Repair `op` enum matches `delta.schema.json`'s verbs (`add_nodes/add_edges/remove_edges/revise_nodes/enrich_nodes/flag_removed`).
