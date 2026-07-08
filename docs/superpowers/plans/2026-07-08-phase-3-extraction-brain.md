# Phase 3 — Extraction Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the `data-repo` extraction brain — the `idef-extraction` and `process-voice` skills, the `classify`/`extract`/`summarize` agents, `CLAUDE.md`, and the runtime `PreToolUse` hooks — that orchestrate the frozen Phase-1 engine CLIs into the five-stage pipeline (ARD §5), then verify the mechanics against the real `dining-2026-05-06` transcript.

**Architecture:** A state-file-anchored playbook (`process-voice`) drives the coarse flow and owns the Telegram human-checkpoint + conflict report; three Opus subagents do the reasoning (classify/extract/summarize); the deterministic engine CLIs (`merge`, `allocate-id`, `layout`, `transcribe`) do everything that must be reproducible; and `PreToolUse` hooks are the hard guarantee for INV-1/INV-2. All reasoning artifacts land on disk (`runs/{voice}/…`) so the pipeline resumes across the checkpoint turn (NFR-6).

**Tech Stack:** Claude Code agents/skills (Markdown + YAML frontmatter, `model: opus`); a Python 3 hook script (`guard.py`, stdlib only) tested with pytest; the existing `code-repo/.venv` engine CLIs invoked with `DATA_ROOT=../data-repo`.

## Global Constraints

- **Target repo is `data-repo`, a sibling of `code-repo`.** From the `code-repo` working dir it is `../data-repo`. Every deliverable in this plan is created under `../data-repo/`; every commit is `git -C ../data-repo …`. This plan document itself lives in `code-repo`. **Do not** commit data-repo deliverables into code-repo.
- **Do not modify `code-repo/schemas/**` or `code-repo/engine/**`** — the Phase-1 contract and CLIs are frozen. Agents must **target** the schemas, never redefine them divergently.
- **INV-1 (deterministic IDs):** agents emit **temporary node keys only** (`n1`, `n2`, `j1`) — never final IDs like `cooking-001-n010`. Final IDs come only from `allocate-id`, invoked inside `merge`.
- **INV-3 (no fabrication):** fill fields only from actual transcript content; empty strings/arrays are acceptable; never invent to complete a template.
- **Roles not names (ARD §4.4):** `actor` and ICOM `mechanisms` are always a role or system (e.g. «کارپرداز»), never a person's name.
- **Language:** all user-facing agent output (checkpoint lists, `process_name`, `label`, `summary`, descriptions) is **Persian**. Stored structural data stays per-schema: Latin IDs, ISO-8601 `Z` timestamps, department `code` in `[a-z]+`.
- **Classify scope:** the upload tag is a **hint**; assign every process to its **true** department from `registry.json` (FR-P8 / AC-4).
- **Sub-processes:** **flag only**, do not auto-create nested processes this phase (ARD §18).
- **Model:** every agent frontmatter is `model: opus` (NFR-4).
- **Frozen contract shapes (copy field names verbatim; do not invent fields):**
  - `segments.json` → `{ voice, segments:[ { department, process_name, transcript_excerpt, status:"new|update|unchanged", match:{ existing_id:string|null } } ] }`
  - candidate (new) → `{ department, process_name, summary, idef0:{inputs,controls,outputs,mechanisms}, kpis:[{name,definition?,target?,unit?}], nodes:[activity{key,type:"activity",label,description,actor,icom,subprocess} | junction{key,type:"junction",junctionType:"AND|OR|XOR",direction:"split|join"}], edges:[{from,to,label?}] }`
  - delta (update) → `{ add_nodes:[…same node shapes…], add_edges:[{from,to,label?}], enrich_nodes:[{id,set:{…}}], flag_removed:[{id}] }`
  - `runs/{voice}/meta.json` → `{ voice, departments:[code], started_at, finished_at:string|null, attempt:int≥1, processes:[{id:"<dept>-NNN", status}] }`
- **Engine CLI signatures (already installed in `code-repo/.venv`):**
  - `transcribe <basename>` — idempotent; prints transcript to stdout.
  - `allocate-id process <dept>` | `allocate-id box <process_file>` | `allocate-id junction <process_file>`
  - `merge new --candidate <f> --department <dept> --run <run> [--now <iso>]` → prints new `<id>`
  - `merge update --process <id> --delta <f> --run <run> [--now]`
  - `merge accept|reject --process <id> --index <n> [--now]`
  - All CLIs need `DATA_ROOT` set; `merge` validates against the schemas before writing and exits `2` on precondition failure.
- **Runtime tool allowlist (ARD §3):** the playbook (main session) may use `Read, Write, Edit, Bash, Glob, Grep, Task`. Subagents get a narrower `tools:` set (specified per task).

**Build order:** Task 1 (transcript cleanup) → Task 2 (idef-extraction, needed by extract) → Tasks 3–5 (agents) → Task 6 (playbook) → Task 7 (CLAUDE.md) → Task 8 (hooks, independent) → Task 9 (live verification, needs 1–8). Task 8 may be done any time after Task 1.

---

### Task 1: Clean the stored test transcript (one-time data fix)

The manually-placed `dining-2026-05-06.txt` still carries a two-line Gemini preamble
(`در ادامه، متن کامل و خام این مکالمه … تقدیم شما می‌شود:`) that the transcribe stage would
normally strip (ARD §5.1). Remove it once so the classify run sees only spoken content.

**Files:**
- Modify: `../data-repo/meetings/transcripts/dining-2026-05-06.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: a transcript whose first line is the first real speaker turn (`مرد ۱: …`).

- [ ] **Step 1: Inspect the preamble to confirm exactly what to remove**

Run: `head -3 ../data-repo/meetings/transcripts/dining-2026-05-06.txt`
Expected: the first 2 lines are the Gemini preamble sentence (ending `…تقدیم شما می‌شود:`), then a blank line, then `مرد ۱: …`.

- [ ] **Step 2: Remove the preamble up to and including the blank line before the first turn**

Open the file with the Edit tool and delete the leading preamble block (the sentence
that spans the first two lines **and** the blank line that follows it), so the file now
begins with `مرد ۱: مانی توی زمینه‌های …`. Do not alter any spoken content.

- [ ] **Step 3: Verify the file now starts at the first speaker turn**

Run: `head -1 ../data-repo/meetings/transcripts/dining-2026-05-06.txt`
Expected: a line beginning with `مرد ۱:` (no preamble).
Run: `grep -c 'تقدیم شما می‌شود' ../data-repo/meetings/transcripts/dining-2026-05-06.txt`
Expected: `0`.

- [ ] **Step 4: Commit (in data-repo)**

```bash
git -C ../data-repo add meetings/transcripts/dining-2026-05-06.txt meetings/audio/dining-2026-05-06.m4a
git -C ../data-repo commit -m "data: add dining-2026-05-06 audio + transcript (preamble stripped)"
```
(The 60 MB `.m4a` is currently untracked; committing it here matches ARD §15 "meetings/audio committed.")

---

### Task 2: `idef-extraction` skill (extraction knowledge)

The knowledge file preloaded into `extract`. It is prose, but its **content contract** is
exact; verification is a set of grep checks that the required anchors are present and that no
final-ID pattern leaked in as an example.

**Files:**
- Modify: `../data-repo/.claude/skills/idef-extraction/SKILL.md` (replace the stub)

**Interfaces:**
- Consumes: the frozen candidate/delta shapes (Global Constraints).
- Produces: a skill named `idef-extraction` that `extract` (Task 4) preloads.

- [ ] **Step 1: Write the frontmatter**

```markdown
---
name: idef-extraction
description: IDEF0/IDEF3 extraction knowledge — the candidate/delta output contract, the no-fabrication rule (INV-3), and roles-not-names (ARD §4.4). Preloaded by the extract agent.
---
```

- [ ] **Step 2: Author the body covering every required section**

The body MUST contain, each as its own heading, in Persian-friendly but English-structured prose:

1. **IDEF0 / ICOM** — define `inputs` (مصرف‌شونده), `controls` (قید/قاعده), `outputs`, `mechanisms` (منبع/نقش انجام‌دهنده). State that `mechanisms` and each activity's `actor` are a **role or system, never a person's name**.
2. **IDEF3** — activities (boxes), directed edges, and junctions with `junctionType` ∈ `AND|OR|XOR` and `direction` ∈ `split|join`. Give a one-line meaning for each junction type.
3. **Temporary keys (INV-1)** — nodes use author-chosen temp keys `n1,n2,…` (activities) and `j1,j2,…` (junctions); edges reference those keys (or, for updates, existing real IDs); **never emit a final ID** like `cooking-001-n010`.
4. **Candidate contract (new process)** — reproduce the field list from Global Constraints exactly; note every activity node needs all of `key,type,label,description,actor,icom,subprocess` and every junction needs `key,type,junctionType,direction`; `icom`/`idef0` always have the four ICOM arrays (may be empty); `subprocess` is `null` this phase.
5. **Delta contract (update)** — `add_nodes`/`add_edges`/`enrich_nodes`/`flag_removed`; `enrich_nodes[].set` may set only the fields being enriched; `flag_removed` lists existing IDs that the voice implies are gone (merge flags, never deletes — INV-4).
6. **No fabrication (INV-3)** — fill only from transcript content; leave fields empty when unsaid; do not pad ICOM or KPIs. Include the sentence: "ناقص‌بودن اشکالی ندارد؛ جعل اطلاعات ممنوع است."
7. **Sub-processes (flag-only)** — when a box is genuinely several distinct sequential sub-steps, keep `subprocess: null` but mention the candidate in the node `description` and report it to the orchestrator; do NOT invent a child process.

- [ ] **Step 3: Structural verification (anchors present, no leaked final IDs)**

Run:
```bash
cd ../data-repo/.claude/skills/idef-extraction
grep -Eq 'inputs' SKILL.md && grep -Eq 'controls' SKILL.md && grep -Eq 'outputs' SKILL.md && grep -Eq 'mechanisms' SKILL.md && echo ICOM_OK
grep -Eq 'AND\|OR\|XOR|AND.*OR.*XOR' SKILL.md && echo JUNCTIONS_OK
grep -Eq 'INV-3|no fabrication|جعل' SKILL.md && echo NOFAB_OK
```
Expected: `ICOM_OK`, `JUNCTIONS_OK`, `NOFAB_OK`.

Run (must find NO final-ID example): `grep -En '[a-z]+-[0-9]{3}-[nj][0-9]' SKILL.md || echo NO_FINAL_IDS`
Expected: `NO_FINAL_IDS`.

- [ ] **Step 4: Commit**

```bash
git -C ../data-repo add .claude/skills/idef-extraction/SKILL.md
git -C ../data-repo commit -m "brain(idef-extraction): author IDEF0/IDEF3 knowledge + output contract"
```

---

### Task 3: `classify` agent

Segments the transcript into processes and labels each new/update/unchanged, assigning true
departments (tag = hint). Reads files itself; content never enters the main session (NFR-6).

**Files:**
- Modify: `../data-repo/.claude/agents/classify.md` (replace the stub)

**Interfaces:**
- Consumes: transcript path + tagged departments (passed in the dispatch prompt); `../data-repo/departments/registry.json`; existing `departments/{dept}/processes/*.json`.
- Produces: `runs/{voice}/segments.json` valid against `segments.schema.json`; returns to the caller only a one-paragraph summary + the output path (not the transcript content).

- [ ] **Step 1: Write the frontmatter**

```markdown
---
name: classify
description: Segment a meeting transcript into processes and label each new/update/unchanged against existing processes (FR-P3). Assigns each process to its true department. Reads the transcript itself; returns only a path + summary.
model: opus
tools: Read, Grep, Glob, Write
---
```

- [ ] **Step 2: Author the body — inputs & procedure**

Body MUST specify:
- **Input:** the dispatch gives a `transcript path`, the `voice basename`, and the `tagged departments` (a hint). Read the transcript with Read. Read `departments/registry.json` for the valid department `code`s.
- **Segmentation:** split the conversation into distinct *processes* (a repeatable work procedure), not topics. An org-overview passage that only lists structure/roles is NOT a process — capture it for `summarize`, not as a segment (note it in the return summary).
- **True-department assignment:** set each segment's `department` to the registry `code` the process actually belongs to, regardless of the upload tag. When the content spans departments beyond the tag, that is expected (FR-P8).
- **Matching (new/update/unchanged):** for each process, Glob `departments/{department}/processes/*.json` and Read candidates; set `status` + `match.existing_id`:
  - `new` — no existing process covers it (`existing_id: null`).
  - `update` — an existing process covers it and the voice adds/changes something (`existing_id: "<id>"`).
  - `unchanged` — an existing process covers it and the voice adds nothing new (`existing_id: "<id>"`).
- **transcript_excerpt:** a short verbatim snippet (1–3 sentences) locating the process in the text.

- [ ] **Step 3: Author the body — output**

- Write the result to `runs/{voice}/segments.json` in the exact `segments.schema.json` shape (Global Constraints). Create the `runs/{voice}/` dir if missing.
- Return to the caller ONLY: the output path + a Persian one-paragraph summary of counts per status and any org-overview-only material found. Do not paste the transcript or the full JSON back.

- [ ] **Step 4: Structural verification**

Run:
```bash
cd ../data-repo/.claude/agents
grep -Eq 'segments\.json' classify.md && grep -Eq 'registry\.json' classify.md && echo IO_OK
grep -Eq 'new|update|unchanged' classify.md && grep -Eq 'existing_id' classify.md && echo STATUS_OK
grep -Eq 'true department|واقعی|hint|tag' classify.md && echo SCOPE_OK
```
Expected: `IO_OK`, `STATUS_OK`, `SCOPE_OK`.

- [ ] **Step 5: Commit**

```bash
git -C ../data-repo add .claude/agents/classify.md
git -C ../data-repo commit -m "brain(classify): author segmentation + new/update/unchanged agent"
```

---

### Task 4: `extract` agent

Per-process subagent (dispatched in parallel by the playbook). Reads only its own segment,
preloads `idef-extraction`, emits a candidate (new) or delta (update) with temp keys only.

**Files:**
- Modify: `../data-repo/.claude/agents/extract.md` (replace the stub)

**Interfaces:**
- Consumes: one segment `{department, process_name, transcript_excerpt}`, the transcript path, the `voice`, and (for updates) an existing `process.json` path; the `idef-extraction` skill (Task 2).
- Produces: for `new` → `runs/{voice}/candidates/{seq}.json` (candidate.schema.json); for `update` → `runs/{voice}/deltas/{existing_id}.json` (delta.schema.json). Returns the output path + a one-line summary.

- [ ] **Step 1: Write the frontmatter**

```markdown
---
name: extract
description: Extract one process into an IDEF0/IDEF3 candidate graph (new) or a delta (update), using temporary node keys only (INV-1) and never fabricating (INV-3). Preloads idef-extraction.
model: opus
tools: Read, Write
---
```

- [ ] **Step 2: Author the body — knowledge preload + inputs**

- State up front: "Preload and follow the `idef-extraction` skill for all IDEF0/IDEF3 rules and the exact output contract."
- **Input:** the dispatch gives the `department`, `process_name`, `transcript_excerpt`, the full `transcript path` (to read surrounding context for THIS process only), the `voice`, and — for updates — the path to the existing `process.json`.

- [ ] **Step 3: Author the body — new vs update output**

- **New process:** emit a candidate graph. Every activity node has `key,type:"activity",label,description,actor,icom{inputs,controls,outputs,mechanisms},subprocess:null`; junctions have `key,type:"junction",junctionType,direction`. `idef0` is the process-level ICOM; `kpis` only if the voice states measurable targets (else `[]`). Write to `runs/{voice}/candidates/{seq}.json` where `{seq}` is a zero-padded ordinal the dispatch provides (e.g. `01`).
- **Update process:** Read the existing `process.json`, then emit a delta that references existing real IDs in `add_edges`/`enrich_nodes`/`flag_removed` and temp keys for `add_nodes`. Enrich only fields the voice actually informs. Write to `runs/{voice}/deltas/{existing_id}.json`.
- **Temp keys only (INV-1):** never write a final ID for a *new* node. **No fabrication (INV-3).** **Roles not names.**
- Return: the output path + a Persian one-line summary (node/edge counts).

- [ ] **Step 4: Structural verification**

Run:
```bash
cd ../data-repo/.claude/agents
grep -Eq 'idef-extraction' extract.md && echo PRELOAD_OK
grep -Eq 'candidates/|deltas/' extract.md && echo OUT_OK
grep -Eq 'temporary|temp key|n1|INV-1' extract.md && grep -Eq 'INV-3|fabricat|جعل' extract.md && echo INV_OK
grep -En '[a-z]+-[0-9]{3}-[nj][0-9]' extract.md && echo LEAK || echo NO_FINAL_ID_EXAMPLES
```
Expected: `PRELOAD_OK`, `OUT_OK`, `INV_OK`, `NO_FINAL_ID_EXAMPLES` (no `LEAK`).

- [ ] **Step 5: Commit**

```bash
git -C ../data-repo add .claude/agents/extract.md
git -C ../data-repo commit -m "brain(extract): author IDEF0/IDEF3 candidate + delta agent"
```

---

### Task 5: `summarize` agent

Builds/updates a department's `overview.json` from the run's processes + transcript + existing
overview. Roles not names.

**Files:**
- Modify: `../data-repo/.claude/agents/summarize.md` (replace the stub)

**Interfaces:**
- Consumes: a `department` code, the run's process IDs for that department, the transcript path, and the existing `departments/{dept}/overview.json` (if any).
- Produces: `departments/{dept}/overview.json` valid against `overview.schema.json` (shape: `{ department, name, sub_units:[{name,description}], personnel:[{role,duties:[…]}], updated_at }`). Returns the path + a one-line summary.

- [ ] **Step 1: Write the frontmatter**

```markdown
---
name: summarize
description: Build or update a department's overview.json (sub-units, personnel roles, duties) from a run's processes and transcript (FR-P6). Roles never personal names.
model: opus
tools: Read, Glob, Write
---
```

- [ ] **Step 2: Author the body**

- **Input:** `department`, the run's process IDs (Read those `process.json` files), the transcript path, and the existing `overview.json` (Read if present — merge additively, don't drop prior content the voice didn't contradict).
- **Output fields:** `department` (code), `name` (Persian display name from `registry.json`), `sub_units` (each `{name,description}`), `personnel` (each `{role, duties:[…]}` — **roles, never names**), `updated_at` (ISO-8601 `Z`).
- **No fabrication (INV-3):** include only sub-units/roles/duties the transcript or existing overview support.
- Write to `departments/{dept}/overview.json`. Return the path + a Persian one-line summary.

- [ ] **Step 3: Structural verification**

Run:
```bash
cd ../data-repo/.claude/agents
grep -Eq 'overview\.json' summarize.md && grep -Eq 'sub_units|personnel|duties' summarize.md && echo FIELDS_OK
grep -Eq 'role|نقش' summarize.md && grep -Eq 'never|نام|not.*name' summarize.md && echo ROLES_OK
```
Expected: `FIELDS_OK`, `ROLES_OK`.

- [ ] **Step 4: Commit**

```bash
git -C ../data-repo add .claude/agents/summarize.md
git -C ../data-repo commit -m "brain(summarize): author department overview agent"
```

---

### Task 6: `process-voice` playbook skill

The orchestrator: drives the five stages, owns the human checkpoint and the conflict report,
and uses `runs/{voice}/meta.json` as resumable state (decision 2).

**Files:**
- Modify: `../data-repo/.claude/skills/process-voice/SKILL.md` (replace the stub)

**Interfaces:**
- Consumes: an identifier (voice basename); the `classify`/`extract`/`summarize` agents (Tasks 3–5) via `Task`; the engine CLIs via `Bash`.
- Produces: `departments/{dept}/processes/*.json` (via `merge`), `overview.json` (via `summarize`), an updated `runs/{voice}/meta.json`, and a git commit per run.

- [ ] **Step 1: Write the frontmatter**

```markdown
---
name: process-voice
description: Orchestrate the full voice→IDEF pipeline — transcribe, classify, human checkpoint, extract, merge, summarize, commit, and the end-of-run conflict report. Resumes from runs/{voice}/meta.json.
---
```

- [ ] **Step 2: Author the body — stages 0–3 (locate → classify)**

Document, as a numbered playbook the runtime follows literally:
0. **Resolve state first:** if `runs/{voice}/meta.json` exists with `finished_at: null`, resume from the stage its contents imply (segments present but no processes → we are at/after the checkpoint). This is how the checkpoint pause is survived.
1. **Locate + transcribe (FR-P1/P2):** confirm `meetings/audio/{voice}.*` exists; on no exact match, ask the user conversationally with the closest `glob` matches. Run `Bash: DATA_ROOT=<data-repo> transcribe {voice}` — idempotent (skips Vertex if the transcript exists). On a *fresh* transcription, strip any Gemini preamble/postamble/heading before writing `meetings/transcripts/{voice}.txt`; if the text looks summarized/rewritten, flag it and stop.
2. **Init run:** create `runs/{voice}/` (a re-run goes to `runs/{voice}/attempt-NN/` — FR-P9) and write `meta.json` with `started_at` (ISO `Z`), `departments` (the tag), `attempt`, `processes: []`.
3. **classify:** dispatch the `classify` agent via `Task` with the transcript path, voice, and tagged departments. It writes `segments.json`.

- [ ] **Step 3: Author the body — stage 4 (human checkpoint)**

- Read `runs/{voice}/segments.json`. Present the list in Telegram in Persian, grouped:
  - **الف) جدید** (new) — process names.
  - **ب) به‌روزرسانی** (update) — `«{process_name}» → {existing_id}`.
  - **د) بدون تغییر** (unchanged — already covered) — names + ids.
  - Any **flagged sub-process candidates** and any **departments beyond the upload tag**.
- Include a concrete example so the format is unambiguous:
  ```
  فرایندهای شناسایی‌شده از صدای dining-2026-05-06:
  الف) جدید:
    ۱. فرایند انبارداری (warehouse)
    ۲. فرایند سفارش‌گیری سالن (dining)
  ب) به‌روزرسانی:
    — «فرایند پخت» → cooking-002
  د) بدون تغییر:
    — کنترل موجودی → warehouse-003
  ⚠ این صدا با برچسب «dining» بود ولی به warehouse و cooking هم مربوط شد.
  تأیید می‌کنید یا اصلاحی لازم است؟
  ```
- **Then end your turn and wait** for the user. Do not proceed to extract in the same turn.
- On a **correction** (missed process, wrong split/merge, move an `unchanged`→`update`): re-dispatch **only** `classify` (or, for a single override, re-dispatch that one `extract`). Nothing is built yet, so no ID/file is touched.
- On **confirm:** proceed to stage 5.

- [ ] **Step 4: Author the body — stages 5–9 (extract → merge → summarize → commit → conflicts), per department**

5. **extract (parallel):** for each **new/update** segment dispatch an `extract` `Task` (new gets a `{seq}`; update gets its `existing_id` + the existing `process.json` path). Run them in parallel. **unchanged** segments are NOT extracted: their `process.json` stays untouched and they are recorded only in `meta.json.processes` as `unchanged` (the "already-covered" coverage record, ARD §5.3).
6. **merge (deterministic):** for each candidate: `Bash: DATA_ROOT=<data-repo> merge new --candidate runs/{voice}/candidates/{seq}.json --department {dept} --run runs/{voice}` → capture the printed `<id>`. For each delta: `merge update --process {existing_id} --delta runs/{voice}/deltas/{existing_id}.json --run runs/{voice}`. Never write `processes/*.json` any other way (the hooks enforce this).
7. **summarize:** per department touched, dispatch a `summarize` `Task` → `overview.json`.
8. **Finish + commit:** update `runs/{voice}/meta.json` (`finished_at`, `processes:[{id,status}]`), then `Bash: git -C <data-repo> add -A && git -C <data-repo> commit -m "pipeline({dept}): {N} processes from {voice}"` (ARD §15). For multiple departments, one line per department or one combined message listing each.
9. **Conflict report (FR-M4):** Read each written `process.json`'s `pending[]`; present the **list** (current vs proposed vs source) in Telegram. The user may resolve inline — `Bash: merge accept --process {id} --index {n}` / `merge reject …` — or defer to the UI inbox. The original value is never auto-changed.

**Multi-department fan-out (FR-P8):** run stages 5–8 separately per department.

- [ ] **Step 5: Structural verification**

Run:
```bash
cd ../data-repo/.claude/skills/process-voice
for kw in transcribe classify 'end your turn' 'merge new' 'merge update' summarize 'git -C' pending meta.json; do
  grep -Eiq "$kw" SKILL.md && echo "OK: $kw" || echo "MISSING: $kw"; done
```
Expected: `OK:` for every keyword, no `MISSING:`.

- [ ] **Step 6: Commit**

```bash
git -C ../data-repo add .claude/skills/process-voice/SKILL.md
git -C ../data-repo commit -m "brain(process-voice): author pipeline playbook + checkpoint + conflict report"
```

---

### Task 7: `CLAUDE.md` (runtime invariants + facts)

The weak-baseline rung (ARD §7): what the runtime session must always know.

**Files:**
- Modify: `../data-repo/CLAUDE.md` (replace the stub)

**Interfaces:**
- Consumes: nothing.
- Produces: the runtime session's baseline instructions.

- [ ] **Step 1: Author the body**

MUST state, concisely:
- **Invariants:** INV-1 (IDs only from `allocate-id`), INV-2 (runtime cannot change code/config), INV-3 (no fabrication), INV-4 (no auto deletion — flag only), INV-5 (human approval before creation and before changing filled values).
- **Hard rules:** `departments/**/processes/*.json` is written **only** by the `merge` CLI; never edit `.claude/**` or this `CLAUDE.md` at runtime; never write outside this repo. (These are also hook-enforced.)
- **Roles not names** in `actor`/`mechanisms`/`personnel`.
- **Pipeline entry point:** run `/process-voice <identifier>`; the playbook owns the checkpoint + conflict report.
- **Pointers:** `.claude/skills/` (`process-voice`, `idef-extraction`) and `.claude/agents/` (`classify`, `extract`, `summarize`).
- **Engine note:** the CLIs (`allocate-id`, `merge`, `layout`, `transcribe`) live outside this repo on PATH; needs `DATA_ROOT` set to this repo.

- [ ] **Step 2: Structural verification**

Run:
```bash
cd ../data-repo
for kw in INV-1 INV-2 INV-3 INV-4 INV-5 merge allocate-id process-voice; do
  grep -Eq "$kw" CLAUDE.md && echo "OK: $kw" || echo "MISSING: $kw"; done
grep -Eiq 'stub|to be authored|placeholder' CLAUDE.md && echo STILL_STUB || echo NOT_STUB
```
Expected: `OK:` for every keyword; `NOT_STUB`.

- [ ] **Step 3: Commit**

```bash
git -C ../data-repo add CLAUDE.md
git -C ../data-repo commit -m "brain(CLAUDE.md): author runtime invariants + pipeline facts"
```

---

### Task 8: Runtime hooks (`guard.py` + `settings.json`) — TDD

The hard guarantee (ARD §7, PreToolUse exit code 2). Pure stdlib; tested by feeding mock
payloads to the script and asserting exit codes. This is the AC-7 mechanism.

**Files:**
- Create: `../data-repo/.claude/hooks/guard.py`
- Create: `../data-repo/.claude/hooks/test_guard.py`
- Create: `../data-repo/.claude/settings.json`

**Interfaces:**
- Consumes: a Claude Code PreToolUse payload on stdin: `{ tool_name, tool_input:{ file_path?|command? }, cwd? }`; the data-repo root from `$CLAUDE_PROJECT_DIR` (fallback: payload `cwd`, then `os.getcwd()`).
- Produces: exit `0` (allow) or exit `2` (block, reason on stderr).

- [ ] **Step 1: Write the failing tests**

Create `../data-repo/.claude/hooks/test_guard.py`:
```python
import json
import subprocess
import sys
from pathlib import Path

GUARD = str(Path(__file__).with_name("guard.py"))


def run(payload, root):
    p = subprocess.run(
        [sys.executable, GUARD],
        input=json.dumps(payload),
        text=True, capture_output=True,
        env={"CLAUDE_PROJECT_DIR": str(root), "PATH": "/usr/bin:/bin"},
    )
    return p.returncode


def w(path):   # a Write tool payload
    return {"tool_name": "Write", "tool_input": {"file_path": path}}


def bash(cmd):
    return {"tool_name": "Bash", "tool_input": {"command": cmd}}


def test_allow_transcript_write(tmp_path):
    assert run(w("meetings/transcripts/dining-2026-05-06.txt"), tmp_path) == 0


def test_allow_overview_write(tmp_path):
    assert run(w("departments/cooking/overview.json"), tmp_path) == 0


def test_allow_runs_write(tmp_path):
    assert run(w("runs/dining-2026-05-06/segments.json"), tmp_path) == 0


def test_block_processes_write(tmp_path):
    assert run(w("departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_block_claude_dir_write(tmp_path):
    assert run(w(".claude/agents/classify.md"), tmp_path) == 2


def test_block_claude_md_edit(tmp_path):
    assert run({"tool_name": "Edit", "tool_input": {"file_path": "CLAUDE.md"}}, tmp_path) == 2


def test_block_outside_repo_write(tmp_path):
    assert run(w("/etc/passwd"), tmp_path) == 2


def test_allow_bash_read_processes(tmp_path):
    assert run(bash("cat departments/cooking/processes/cooking-001.json"), tmp_path) == 0


def test_allow_bash_merge(tmp_path):
    assert run(bash("merge new --candidate runs/x/candidates/01.json --department cooking --run runs/x"), tmp_path) == 0


def test_block_bash_redirect_into_processes(tmp_path):
    assert run(bash("echo '{}' > departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_block_bash_sed_claude(tmp_path):
    assert run(bash("sed -i s/a/b/ .claude/agents/classify.md"), tmp_path) == 2
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `../../.venv/bin/python -m pytest ../data-repo/.claude/hooks/test_guard.py -q` (from `code-repo`: `.venv/bin/python -m pytest ../data-repo/.claude/hooks/test_guard.py -q`)
Expected: FAIL / ERROR — `guard.py` does not exist yet.

- [ ] **Step 3: Write `guard.py`**

Create `../data-repo/.claude/hooks/guard.py`:
```python
#!/usr/bin/env python3
"""Runtime PreToolUse guard for the data-repo brain (ARD §7).

Reads a Claude Code PreToolUse payload on stdin. Exit 0 = allow, exit 2 = block
(the stderr reason is shown to the model). Enforces:
  1. No Write/Edit — or Bash redirect — to departments/**/processes/*.json
     (the merge CLI is the only sanctioned writer; its argv never spells the path).
  2. No write/edit to .claude/** or CLAUDE.md at runtime (INV-2).
  3. No Write/Edit outside the data-repo root.
The Bash guard is intentionally conservative: it blocks commands that BOTH mutate
and reference a protected path; use the Read tool for reads. Broad out-of-repo
Bash writes are additionally constrained by the runtime APPROVED_DIRECTORY (ARD §3).
"""
import json
import os
import re
import sys
from pathlib import Path

PROCESSES_CMD_RE = re.compile(r"departments/[^/\s'\"]+/processes/[^/\s'\"]+\.json")
CLAUDE_CMD_RE = re.compile(r"(^|[\s'\"/=])\.claude(/|[\s'\"]|$)|CLAUDE\.md")
MUTATION_RE = re.compile(r"(>>?|\btee\b|\bsed\b[^|]*\s-i|\bcp\b|\bmv\b|\brm\b|\btruncate\b|\bdd\b)")
PROCESSES_REL_RE = re.compile(r"departments/[^/]+/processes/[^/]+\.json")


def _deny(msg):
    print(f"BLOCKED by data-repo guard: {msg}", file=sys.stderr)
    raise SystemExit(2)


def _root(payload):
    return Path(os.environ.get("CLAUDE_PROJECT_DIR")
                or payload.get("cwd")
                or os.getcwd()).resolve()


def _check_write_path(target, root):
    p = Path(target)
    if not p.is_absolute():
        p = root / p
    p = p.resolve()
    if p != root and root not in p.parents:
        _deny(f"write outside data-repo: {p}")
    rel = p.relative_to(root).as_posix()
    if rel == "CLAUDE.md" or rel == ".claude" or rel.startswith(".claude/"):
        _deny(f"runtime cannot edit brain config: {rel} (INV-2)")
    if PROCESSES_REL_RE.fullmatch(rel):
        _deny(f"processes/*.json is written only by the merge CLI: {rel} (INV-1)")


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # unparseable payloads fall through (matcher already scopes to mutating tools)
    tool = payload.get("tool_name", "")
    ti = payload.get("tool_input") or {}
    root = _root(payload)

    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        target = ti.get("file_path") or ti.get("notebook_path")
        if target:
            _check_write_path(str(target), root)
        return 0

    if tool == "Bash":
        cmd = ti.get("command", "") or ""
        if MUTATION_RE.search(cmd):
            if PROCESSES_CMD_RE.search(cmd):
                _deny("direct write to processes/*.json is forbidden; use the merge CLI (INV-1)")
            if CLAUDE_CMD_RE.search(cmd):
                _deny("runtime cannot edit .claude/** or CLAUDE.md (INV-2)")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest ../data-repo/.claude/hooks/test_guard.py -q`
Expected: PASS (11 passed).

- [ ] **Step 5: Wire `settings.json`**

Create `../data-repo/.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
        "hooks": [
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard.py\"" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Verify settings.json is valid JSON**

Run: `.venv/bin/python -c "import json; json.load(open('../data-repo/.claude/settings.json')); print('SETTINGS_OK')"`
Expected: `SETTINGS_OK`.

- [ ] **Step 7: Commit**

```bash
git -C ../data-repo add .claude/hooks/guard.py .claude/hooks/test_guard.py .claude/settings.json
git -C ../data-repo commit -m "brain(hooks): PreToolUse guard for INV-1/INV-2 + tests + settings"
```

---

### Task 9: Live verification against the real `dining` transcript

Produces the actual AC-2/3/4/7 mechanical evidence in-session (non-Telegram). The full
Telegram-driven run is Phase 4. Run each agent by dispatching a `Task` subagent with the
**authored prompt file's content** as the instructions, pointed at the real data-repo paths.

**Files:**
- Create (evidence, transient): `../data-repo/runs/dining-2026-05-06/…` and `departments/**/processes/*.json`, `overview.json` produced by the run.

**Interfaces:**
- Consumes: everything from Tasks 1–8; the `code-repo/.venv` CLIs; `DATA_ROOT=../data-repo`.
- Produces: committed process/overview files + a verification log; no new code.

- [ ] **Step 1: Verify transcribe idempotency (FR-P2 / AC-3 half)**

Run: `DATA_ROOT=../data-repo .venv/bin/transcribe dining-2026-05-06 | head -c 120`
Expected: prints the start of the existing transcript (`مرد ۱: …`) WITHOUT calling Vertex (no credentials error). Confirms the idempotency pre-check.

- [ ] **Step 2: Run classify on the real transcript**

Dispatch a `Task` subagent using the body of `../data-repo/.claude/agents/classify.md` as its
instructions, with: transcript `= ../data-repo/meetings/transcripts/dining-2026-05-06.txt`,
voice `= dining-2026-05-06`, tagged departments `= [dining]`, registry
`= ../data-repo/departments/registry.json`. Have it write
`../data-repo/runs/dining-2026-05-06/segments.json`.

- [ ] **Step 3: Validate segments.json against the frozen schema**

Run:
```bash
DATA_ROOT=../data-repo SCHEMA_DIR=schemas .venv/bin/python -c "
from engine_common import read_json, validate
validate('segments.schema.json', read_json('../data-repo/runs/dining-2026-05-06/segments.json'))
print('SEGMENTS_VALID')"
```
Expected: `SEGMENTS_VALID`. Then eyeball that departments are assigned by content (expect warehouse/cooking/dining/etc., not only `dining`) — evidence for AC-4/decision 3.

- [ ] **Step 4: Run extract on one `new` segment + validate the candidate**

Pick one `new` segment from `segments.json`. Dispatch a `Task` using the body of
`../data-repo/.claude/agents/extract.md` (which itself preloads `idef-extraction`), pointed at
that segment; have it write `../data-repo/runs/dining-2026-05-06/candidates/01.json`. Then:
```bash
DATA_ROOT=../data-repo SCHEMA_DIR=schemas .venv/bin/python -c "
from engine_common import read_json, validate
c = read_json('../data-repo/runs/dining-2026-05-06/candidates/01.json')
validate('candidate.schema.json', c)
assert all(not (n.get('id','').count('-')>=2) for n in c['nodes']), 'final ID leaked'
print('CANDIDATE_VALID_NO_FINAL_IDS')"
```
Expected: `CANDIDATE_VALID_NO_FINAL_IDS`.

- [ ] **Step 5: merge the candidate → real process.json (AC-2 mechanics)**

Run (use the candidate's `department`):
```bash
DATA_ROOT=../data-repo SCHEMA_DIR=schemas .venv/bin/merge new \
  --candidate ../data-repo/runs/dining-2026-05-06/candidates/01.json \
  --department <dept-from-candidate> \
  --run runs/dining-2026-05-06
```
Expected: prints an allocated id like `<dept>-001`; `../data-repo/departments/<dept>/processes/<dept>-001.json` now exists (merge validated it against `process.schema.json` before writing).

- [ ] **Step 6: Verify the hooks actually block (AC-7)**

Run (expect exit 2 both, using the real guard):
```bash
cd ../data-repo
echo '{"tool_name":"Write","tool_input":{"file_path":"departments/dining/processes/dining-001.json"}}' \
  | CLAUDE_PROJECT_DIR=. python3 .claude/hooks/guard.py; echo "processes-write exit=$?"
echo '{"tool_name":"Edit","tool_input":{"file_path":".claude/agents/classify.md"}}' \
  | CLAUDE_PROJECT_DIR=. python3 .claude/hooks/guard.py; echo "claude-edit exit=$?"
cd ../code-repo
```
Expected: both print `exit=2`.

- [ ] **Step 7: Re-run classify → the just-built process is `unchanged` (AC-3)**

Re-dispatch `classify` as in Step 2 (now that `<dept>-001.json` exists). Confirm that the
segment for that process comes back `status: "unchanged"` with `match.existing_id` set — no
duplicate, no rework.

- [ ] **Step 8: Commit the evidence + a short verification note**

```bash
git -C ../data-repo add -A
git -C ../data-repo commit -m "pipeline(<dept>): verification run from dining-2026-05-06"
```
Record the observed results (schema-valid segments/candidate, allocated id, both hook exits = 2, re-run `unchanged`) in the plan's task checkboxes or a note under `docs/runbooks/`.

- [ ] **Step 9: Update PLAN.md Phase 3 status**

Edit `code-repo/PLAN.md` §5 to note Phase 3 is implemented (brain authored + hooks tested +
mechanics verified against `dining-2026-05-06`), with AC-2/3/4 fully driven end-to-end deferred
to Phase 4 (control bot), consistent with the traceability table. Commit in `code-repo`:
```bash
git -C . add PLAN.md docs/superpowers/plans/2026-07-08-phase-3-extraction-brain.md
git -C . commit -m "docs(phase-3): mark extraction brain implemented; link plan"
```

---

## Self-Review

**Spec coverage** (spec §4 components + §7 validation):
- idef-extraction → Task 2 ✓ · classify → Task 3 ✓ · extract → Task 4 ✓ · summarize → Task 5 ✓ · process-voice → Task 6 ✓ · CLAUDE.md → Task 7 ✓ · hooks → Task 8 ✓ · transcript cleanup (decision 5) → Task 1 ✓ · validation plan (AC-2/3/4/7) → Task 9 ✓.
- Decisions: (1) validate-from-transcript → Task 9; (2) state-file playbook → Task 6 step 2.0 + meta.json; (3) tag=hint → Task 3 + Task 9 step 3; (4) flag-only sub-process → Tasks 2/4; (5) preamble → Task 1; (6) Persian output → Global Constraints + Task 6 checkpoint example.

**Placeholder scan:** no "TBD/TODO/handle appropriately". Prose files (Tasks 2–7) specify exact content contracts + example fragments + runnable grep verification rather than verbatim final prose — the prose authoring is the implementation act; the contract and checks are complete. `guard.py`/tests/`settings.json` are given in full.

**Type/name consistency:** `runs/{voice}/segments.json`, `candidates/{seq}.json`, `deltas/{existing_id}.json`, `meta.json` field names, and CLI flags match the frozen schemas and the verified CLI signatures throughout. Hook function names (`_check_write_path`, `_root`, `_deny`) and regexes are consistent between `guard.py` and the tests' expected exit codes.

**Note on Task 9 execution:** it dispatches the authored agent prompts as `Task` subagents from this (code-repo) session rather than through a data-repo-rooted runtime, because the real runtime harness is Phase 4. This proves prompt quality + schema-conformance now; it does not exercise the Telegram turn-taking (that is Phase 4, per PLAN.md's AC-2 "driven via Phase 4").
