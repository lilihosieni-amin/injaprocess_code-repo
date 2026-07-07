# ARD — Restaurant Process Documentation System (inja food)

| | |
|---|---|
| **Version** | 0.1 (technical draft) |
| **Date** | 2026-07-07 |
| **Status** | Architecture draft, based on locked decisions |
| **Basis document** | PRD v0.2 (references the FR/NFR/INV/AC IDs) |
| **Audience** | Dev team |

> This document defines the "how": topology, paths, schemas, pipeline, execution mechanism, and deployment. The "what/why" requirements live in the PRD.

---

## 1. Architecture Principles

Three principles the whole design is built on:

1. **The filesystem is the only point of connection.** No component talks to another directly over the network. The upload bot writes files, the control bot later sees and processes them, the UI reads from the same disk. This decoupling makes testing and versioning simple.
2. **Intelligence is separate from determinism.** Anything that must be reproducible and error-free (ID generation, applying changes, layout) is done by deterministic code; the LLM only does the reasoning work of extraction. (INV-1)
3. **Runtime is sandboxed.** The runtime session can only access data and cannot change the code or its own logic — not by "promise," but by access restriction and hooks. (INV-2)

### Overview

```
                       ┌──────────────── Telegram ────────────────┐
        User ──────────┤  Upload bot           Control bot         │
                       └──────┬───────────────────┬────────────────┘
                              │ writes             │ drives
                              ▼                     ▼
                    ┌─────────────────┐   ┌────────────────────────┐
                    │  Raw file on    │   │ Claude Code (runtime)  │
                    │  disk           │   │  extraction pipeline   │──► Vertex AI (Gemini)
                    └────────┬────────┘   └───────────┬────────────┘   Anthropic (Opus 4.8)
                             │                        │
                             ▼                        ▼
                    ┌────────────────────────────────────────────┐
                    │        data-repo  (source of truth, Git)    │
                    └───────────────────────┬────────────────────┘
                                            │ reads/writes
                                            ▼
                              ┌──────────────────────────┐
                              │  UI (React Flow) + backend │
                              └──────────────────────────┘
```

---

## 2. Repository Topology

Two completely separate Git repositories. The code/data boundary becomes physical here.

### 2.1 `code-repo` — the application (developed with Superpowers)

```
code-repo/
├── CLAUDE.md                     # development instructions (not extraction)
├── .claude/                      # dev agents/skills (optional)
├── upload-bot/                   # Bot 1 (custom code)
├── control-bot/                  # config & launch profile for claude-code-telegram
├── engine/                       # deterministic CLIs (allocate-id, merge, layout, transcribe)
│   ├── allocate_id/
│   ├── merge/
│   ├── layout/
│   └── transcribe/               # Gemini-on-Vertex call
├── ui/                           # React + React Flow (frontend)
│   └── design/                   # visual design reference (source of truth for look) + support.js
├── ui-backend/                   # thin UI backend (read/write JSON + auth)
├── deploy/                       # docker-compose.yml, Dockerfiles, proxy config
└── config/                       # sample env, no real secrets
```

### 2.2 `data-repo` — data and the extraction "brain"

This is the runtime `PROJECT_ROOT` and `APPROVED_DIRECTORY`.

```
data-repo/
├── CLAUDE.md                     # extraction rules + invariant reminders
├── .claude/
│   ├── skills/
│   │   ├── process-voice/        # orchestration playbook (slash command)
│   │   ├── idef-extraction/      # IDEF0/IDEF3 knowledge + schema (preloaded in extract)
│   │   └── ...
│   └── agents/
│       ├── classify.md
│       ├── extract.md
│       └── summarize.md
├── departments/
│   ├── registry.json             # official list of departments
│   └── {dept}/
│       ├── overview.json         # sub-units, personnel, duties
│       ├── processes/
│       │   └── {process-id}.json
│       └── attachments/          # uploaded documents
├── meetings/
│   ├── audio/                    # raw voice files
│   └── transcripts/              # transcription output, same name as the voice
├── runs/                         # per-run intermediate artifacts (permanent)
│   └── {voice-basename}/
│       ├── segments.json
│       ├── candidates/            # candidate graphs
│       ├── deltas/                # extract deltas (input to merge)
│       ├── conflicts.json
│       └── meta.json
├── .staging/                     # upload buffer until confirmation (in .gitignore)
└── .gitignore
```

The upload bot and the UI backend (whose code lives in `code-repo`) point to `data-repo` via a `DATA_ROOT` environment variable. Three separate processes, one data repository.

---

## 3. The Three Claude Code Session Types

Key point: whether a session is "development" or "runtime" is determined by **how the session is launched**, not by where the files live.

| Session | Directory | Profile | Superpowers |
|---|---|---|---|
| **1. Building the app** | `code-repo` | `APPROVED_DIRECTORY=code-repo` | Enabled (project-scoped) |
| **2. Building the extraction brain** | `data-repo` (manual) | Normal developer session | Disabled |
| **3. Runtime** | `data-repo` | Locked profile (below) | Disabled |

**Runtime profile (session 3):**
- `APPROVED_DIRECTORY = data-repo` — cannot reach the code. (INV-2)
- `AGENTIC_MODE=false` — classic mode (13-command interface: `/new`, `/continue`, `/end`, `/status`, `/cd`, `/ls`, `/pwd`, `/projects`, `/export`, `/actions`, `/git`, …).
- Tool allowlist via `CLAUDE_ALLOWED_TOOLS`, minimum: `Read, Write, Edit, Bash, Glob, Grep, Task` (Bash for calling the CLIs and git; Task for parallel subagents).
- Execution path: SDK first, **CLI as fallback** — if the SDK path doesn't pick up the skills, it automatically switches to the CLI (this bot supports both).
- No plugins loaded (so Superpowers doesn't leak in). `ENABLE_FILE_UPLOADS=false` (uploads only via Bot 1).
- Budget and time: `CLAUDE_TIMEOUT_SECONDS`, `CLAUDE_MAX_TURNS` high; `CLAUDE_MAX_COST_PER_USER`, `CLAUDE_MAX_COST_PER_REQUEST` sized for Opus.
- Runtime hooks active (Section 7).

Superpowers is installed only in `code-repo` and **project-scoped** (not global), so its brainstorm/TDD/worktree/review skills don't leak into sessions 2 and 3. Superpowers is third-party (MIT); its optional telemetry is disabled with `SUPERPOWERS_DISABLE_TELEMETRY`.

---

## 4. Data Model

### 4.1 IDs (INV-1, FR-D1, FR-D2)

- Process: `{dept}-{NNN}` — e.g. `cooking-001`
- Box: `{process-id}-n{NNN}` — e.g. `cooking-001-n010`
- Junction: `{process-id}-j{N}` — e.g. `cooking-001-j1`

Rule: "highest existing number + 1" (scan the disk, no separate/corruptible counter file). Deleted IDs are not reused. Generation only via a single `allocate-id` CLI, for all three paths (pipeline, chat, UI).

### 4.2 Voice filename (FR-U4)

`{depts}-{date}`, where `{depts}` is the selected department codes joined with `_`; a same-day repeat gets a `-02` (and higher) suffix. Examples: `meetings/audio/cooking-2026-07-06.ogg`, `meetings/audio/cooking_dining-2026-07-06.ogg`. Generated by the upload bot's deterministic function.

### 4.3 `process.json` (FR-D3…D11)

```jsonc
{
  "id": "cooking-001",
  "department": "cooking",
  "name": "Purchase & expense payment process",
  "summary": "one-line summary (the one shown at the checkpoint)",
  "source": { "type": "voice", "ref": "cooking-2026-07-06", "run": "runs/cooking-2026-07-06" },
  "parent": null,                         // sub-process: { "process": "...", "node": "..." }
  "created_at": "2026-07-06T10:00:00Z",
  "updated_at": "2026-07-06T10:00:00Z",

  "idef0": {                              // the whole process as one A-0 box
    "inputs": [], "controls": [], "outputs": [], "mechanisms": []
  },
  "kpis": [
    { "name": "...", "definition": "...", "target": "...", "unit": "..." }
  ],

  "nodes": [
    {
      "id": "cooking-001-n010",
      "type": "activity",                 // activity | start | end | junction
      "label": "Receive purchase request",
      "description": "details shown on click",
      "actor": "Procurement officer",
      "icom": { "inputs": [], "controls": [], "outputs": [], "mechanisms": [] },
      "subprocess": null,                 // or a child id, e.g. "cooking-014"
      "position": { "x": 60, "y": 40 },
      "layout": "auto",                   // auto | manual
      "source": { "created_by": "runs/cooking-2026-07-06", "touched_by": ["..."] }
    },
    {
      "id": "cooking-001-j1",
      "type": "junction",
      "junctionType": "XOR",              // AND | OR | XOR
      "direction": "split",               // split | join
      "position": { "x": 260, "y": 40 },
      "layout": "auto"
    }
  ],

  "edges": [
    { "from": "cooking-001-n010", "to": "cooking-001-j1" },
    { "from": "cooking-001-j1", "to": "cooking-001-n020", "label": "if approved" }
  ],

  "pending": [                            // pending conflicts (FR-M3)
    { "node": "cooking-001-n020", "field": "actor",
      "current": "Procurement officer", "proposed": "Warehouse keeper",
      "source": "runs/cooking-2026-07-10", "status": "open" }
  ]
}
```

### 4.4 `overview.json` (per department, FR-P6)

```jsonc
{
  "department": "cooking",
  "name": "Cooking department",
  "sub_units": [ { "name": "...", "description": "..." } ],
  "personnel": [ { "role": "...", "duties": ["..."] } ],
  "updated_at": "..."
}
```

> Individuals' names are not stored — only the **role**. Likewise, `actor` in `process.json` and `mechanisms` in ICOM are always a role/system, not a specific person's name. (Personnel change, roles are stable; and these files go into Git / off-site.) The only place a name may appear is speaker separation in the raw transcript, not the structured model.

### 4.5 `registry.json` (FR-U6, NFR-8)

```jsonc
{
  "departments": [
    { "code": "management",  "name": "مدیریت" },
    { "code": "accounting",  "name": "حسابداری" },
    { "code": "warehouse",   "name": "انبار" },
    { "code": "procurement", "name": "کارپردازی" },
    { "code": "cooking",     "name": "پخت" },
    { "code": "preparation", "name": "آماده‌سازی" },
    { "code": "dining",      "name": "سالن" },
    { "code": "cashier",     "name": "صندوق" },
    { "code": "logistics",   "name": "لجستیک" }
    // adding QC etc. is just one new record
  ]
}
```

*(The `code` values are the English department keys; the `name` values are the Persian display names shown to the user.)*

---

## 5. Extraction Pipeline

Five stages; three LLM subagents (Opus 4.8), two deterministic CLIs.

```
[transcribe]  CLI + Vertex/Gemini + Claude check  → meetings/transcripts/{name}.txt
     │
[classify]    subagent (Opus)       → runs/{name}/segments.json
     │
  ── human checkpoint (Telegram) ──   confirm/correct the process list
     │
[extract]     subagent×N parallel(Opus) → runs/{name}/candidates/*.json
     │
[merge]       deterministic CLI     → departments/{dept}/processes/{id}.json (+ pending)
     │
[summarize]   subagent (Opus)       → departments/{dept}/overview.json
     │
   git commit
```

### 5.1 transcribe (CLI + Vertex/Gemini) — FR-P1, FR-P2

- Input: the voice identifier. First, the matching file in `meetings/audio/` is located/confirmed; if there's no exact match, a conversational prompt (FR-P1). Locating the file is Claude's job; **name generation** is the upload bot's deterministic job — two separate jobs.
- **Idempotency pre-check:** if `meetings/transcripts/{basename}.txt` already exists, Vertex is not called at all.
- **Vertex call:** the `transcribe` CLI transcribes the audio file with a Gemini model on **Vertex AI**.
  - Auth: Application Default Credentials or a GCP service account; the key lives **outside `data-repo`** (in `code-repo/config` or the server env). (Consistent with secret management.)
  - Configurable parameters: `VERTEX_PROJECT`, `VERTEX_LOCATION`, `GEMINI_MODEL` (model version configurable so a version change doesn't break code).
  - Large files are passed via GCS / Vertex file upload (not inline), because the meeting audio is large.
  - **The output must have speaker separation** (like the sample: "گوینده زن:", "گوینده مرد ۱ (آقای مازندرانی):"). The short Gemini system prompt (in `code-repo/engine/transcribe`), output language Persian:

    ```text
    You are a precise audio transcriber. Reproduce ONLY the spoken content of the
    audio file, in Persian.
    Rules:
    - Separate speakers based on the flow of conversation, and start each speaking
      turn with the speaker's label. If the speaker's name is stated in the audio,
      use it (e.g. «گوینده مرد ۱ (آقای مازندرانی):»); otherwise use «گوینده زن:»,
      «گوینده مرد ۱:», «گوینده مرد ۲:», and so on.
    - No timing / timecodes.
    - Do not add any preamble, conclusion, heading, commentary, or sentence of your
      own. The output must be the transcript and nothing else.
    - Do not remove, summarize, or edit anything; reproduce exactly what was said.
    ```
- **Output verification (in this same stage, by Claude) — FR-P2:** after receiving the text from Gemini, Claude verifies it is **only the transcript**. Gemini sometimes adds chrome at the head or tail of the text (real example: the preamble "متن کامل و یکپارچه … خدمت شما:" which must be removed). Claude detects and removes any added preamble/postamble/heading/commentary, and flags it if it sees any sign of content change (summarizing/rewriting). Only the clean, verified text is stored.
- Output: clean Persian text with speakers in `meetings/transcripts/{basename}.txt` (committed).

### 5.2 classify (subagent) — FR-P3

- Input: the path to the text + the tagged departments. **The content does not enter the main session**; the subagent reads the file itself.
- Work: split the text into segments (each segment = one process); match each process against the existing `processes/` and label it with one of three states: **new** / **update** / **unchanged** (already-covered — the segment has nothing beyond what's in the existing process).
- "Unchanged" processes are **not sent to `extract`** (cost savings, especially with Opus); their files stay untouched and they are only reported at the checkpoint.
- Output: `runs/{name}/segments.json` — a list of `{department, process_name, transcript_excerpt, status: "new"|"update"|"unchanged", match: {existing_id|null}}`.

### 5.3 Human checkpoint — FR-P4, INV-5

The playbook shows the list in Telegram, in three categories: "A (new)", "B (update to cooking-003)", "D (unchanged — already covered)", plus any reported automatic sub-processes. The user confirms or corrects. **Override:** if the user doubts an "unchanged" item ("I think it gave more detail this time"), they can move it to "update" right there so it goes to `extract`. On any correction, only `classify` (or, for an override, `extract` of that one process) is re-run; since nothing has been built yet, no ID/file is touched (a cheap loop).

For confirmed "unchanged" processes, the process file stays untouched and only a lightweight record is added to `source.touched_by` (this voice referenced the process but added nothing) so the coverage history stays complete.

### 5.4 extract (subagent×N parallel) — FR-P5, FR-D5

- Each process runs in a separate subagent with its own window, reading only its own segment (context control — NFR-6). Parallel execution with `Task`.
- The `idef-extraction` skill (IDEF0/IDEF3 knowledge + schema + the "no fabrication" rule) is preloaded at the subagent's startup.
- Output: a candidate graph with **temporary keys** for nodes (e.g. `n1`, `n2`); **no final IDs are created by the LLM**. For an "update" process, the output is a delta (Section 6).

### 5.5 merge (deterministic CLI) — FR-P5, FR-M2, INV-1

The heart of determinism. Details in Section 6.

### 5.6 summarize (subagent) — FR-P6

Builds/updates the department's `overview.json` from this run's processes + the text + the existing overview.

### 5.7 End — FR-P7, FR-M4

`git commit` with a message referencing the voice and the affected departments/processes. Then the playbook reports this run's list of **`pending` conflicts** in Telegram; the user can resolve them right there in chat (which applies the same accept/reject to disk), or later in the UI review inbox.

### 5.8 Multi-department voice — FR-P8

`classify` separates the segments per department; the extract/merge/summarize stages run separately for each department.

### 5.9 Re-run — FR-P9

Each run stays in `runs/{voice-basename}/`; a re-run goes to `runs/{voice-basename}/attempt-02/`. This is a free evaluation corpus for improving the agents.

### 5.10 Required Agents & Skills (build checklist)

This list states only **what must be built**; the full prompt/skill text and the `CLAUDE.md` files live in `data-repo/.claude` (the single source of truth, intentionally easy to edit) and are only referenced here.

**Agents (`data-repo/.claude/agents/`):**

| Name | Role | Input → Output | Model |
|---|---|---|---|
| `classify` | segment the text into processes + label new/update/unchanged | text path → `segments.json` | Opus 4.8 |
| `extract` | extract each process's IDEF0/IDEF3 graph (or delta) | one segment → candidate graph/delta | Opus 4.8 |
| `summarize` | build/update the department overview file | run's processes + text → `overview.json` | Opus 4.8 |

**Skills (`data-repo/.claude/skills/`):**

| Name | Type | Role |
|---|---|---|
| `process-voice` | playbook (slash command) | orchestrate the whole pipeline + own the checkpoint and conflict report |
| `idef-extraction` | knowledge (preloaded in `extract`) | IDEF0/IDEF3 rules + the `process.json` schema + the "no fabrication" rule |

**Non-agent (part of the engine, not `.claude`):** `transcribe`, `merge`, `allocate-id`, `layout` — all deterministic CLIs in `code-repo/engine` (Section 8). This list is updated here whenever a new agent/skill is added.

---

## 6. Merge & Conflict Algorithm

### 6.1 Process-level matching (FR-M1)

`classify` proposes "new", "update", or "unchanged" for each process; the human makes the final decision at the checkpoint. "Unchanged" does not go to extract/merge (only a `touched_by` record). This matching is the main barrier against duplicate processes and pointless work.

### 6.2 Box-level delta (FR-M2)

For an "update", the existing `process.json` is given to extract, and the output is a delta that references the existing IDs:

```jsonc
{
  "add_nodes":     [ /* new node with a temporary key */ ],
  "add_edges":     [ /* with temporary/existing keys */ ],
  "enrich_nodes":  [ { "id": "cooking-001-n020", "set": { "description": "...", "icom": {...} } } ],
  "flag_removed":  [ { "id": "cooking-001-n050" } ]
}
```

`merge` (deterministic) does this: assign real IDs to new nodes from `allocate-id`; preserve existing IDs; map temporary edge keys to real IDs; apply enrich only to empty fields (Section 6.3); mark removed (without deleting — FR-D8/INV-4); update `updated_at` and `source.touched_by`.

### 6.3 Conflict policy (FR-M3)

- Empty field or new item → applied automatically.
- Changing a **filled** value → instead of overwriting, a row is recorded in `pending`; the original value is untouched. (`current`/`proposed`/`source`/`status`)
- accept/reject (from chat or UI) → the merge CLI applies the value or closes the row. The original value is never changed automatically. (INV-5)

### 6.4 Layout during merge (FR-D9, FR-D10)

- `layout: manual` nodes are never moved.
- New node at the **tail** → append only.
- New node in the **middle** → a **local** re-layout: from the insertion point downward is re-laid out; upstream and manual nodes are preserved. This re-layout is reported at the checkpoint.
- A full `re-layout` only via an explicit UI button.

### 6.5 Source tracking (FR-D11)

Each node keeps `source.created_by` and `source.touched_by[]` (references into `runs/`).

---

## 7. Orchestration & Reliability

Hybrid model: the playbook drives the coarse flow + checkpoint, but every stage transition is locked by deterministic code and hooks. **The LLM is the worker inside a stage, not the trusted conductor of the whole thing.**

The four-layer ladder (weak → strong):

1. **CLAUDE.md** (`data-repo`): invariants and facts. Baseline, but subject to drift.
2. **The `/process-voice` skill**: an explicit script of the stages; every run starts from this, not from improvisation.
3. **Precondition gating (the main pillar):** each CLI checks its precondition; e.g. `merge` won't run without **confirmed** segments, and `extract` won't run without `classify`'s output. Ordering is imposed by data dependency, not by the model's discipline.
4. **Hooks (hard guarantee — PreToolUse, exit code 2):** the only way to get a 100% guarantee in Claude Code.

**Runtime hooks:**
- Block direct writes to `departments/**/processes/*.json` except via the `merge` CLI. (INV-1, AC-7)
- Block writes/edits to `data-repo/.claude/**` and `data-repo/CLAUDE.md` at runtime. (INV-2, AC-7)
- Block any write outside `data-repo`. (An extra defensive layer on the code/data separation.)

**Context management (NFR-6):** large content never enters the main session window; only file paths and summary artifacts are passed around. Each extract reads only its own segment in its isolated subagent window. State is reloaded from the filesystem, so a compact or a new session loses no data.

---

## 8. The Deterministic Engine (CLIs)

In `code-repo/engine/`, installed as **pinned** CLIs on the server's PATH; outside the runtime `APPROVED_DIRECTORY` (so runtime cannot edit them). The expected version is noted in `data-repo` so it's always clear which data state works with which engine version.

| CLI | Job |
|---|---|
| `allocate-id` | deterministic ID generation ("max + 1") for process/box/junction |
| `merge` | apply delta, assign IDs, preserve id/position, record pending, mark removed |
| `layout` | deterministic serpentine layout (Section 9) |
| `transcribe` | Gemini-on-Vertex call + idempotency pre-check |

The skills/prompts/IDEF rules stay in `data-repo/.claude` (intentionally easy to edit, since they are meant to improve over time). Two separate improvement activities: extraction quality → edit skills in `data-repo`; the deterministic engine → edit CLIs in `code-repo`.

---

## 9. Layout Algorithm (FR-D9)

- Direction: horizontal, left-to-right (LTR).
- **Serpentine (boustrophedon):** row 1 left→right, row 2 right→left, and so on; the inter-row connector is just one step down.
- Input: the graph's topological order. Each row is filled up to the page width, then wraps.
- Branches (after a junction) are laid out near the junction; the automatic layout is a "good starting point," not perfect — and since position is saved and editable, the user tidies it with a few moves and it sticks.
- Deterministic and LLM-free; runs in `merge` (for nodes without a position, or an explicit `re-layout`).

---

## 10. Models & Cost

- All extraction subagents (`classify`, `extract`, `summarize`) run on **Opus 4.8**, even simple tasks (NFR-4). Change point: a single `model` line in that subagent's frontmatter.
- `transcribe`: Gemini on Vertex (model configurable).
- `merge`, `allocate-id`, `layout`: no model (deterministic).
- Budgets (NFR-5) are set to match Opus on parallel runs; since extract is parallel and multi-process, the cost per run can be high.

---

## 11. Upload Bot (custom code)

- Flow: `/start` → choose voice/file → (file: choose one department for the whole batch, send several files, "done", confirm, store in `attachments/`) / (voice: date → multiple departments → send → store in `meetings/audio/`). (FR-U1…U3)
- Deterministic naming by the bot (FR-U4); completion message with a copyable basename (FR-U5).
- Department validation against `registry.json` (FR-U6).
- Staging in `.staging/` until confirmation, then move to the destination (FR-U7).
- A **local Bot API server** (`tdlib/telegram-bot-api`) is required because the voice is > 20 MB and the standard Bot API only downloads up to 20 MB; the local server goes up to 2 GB. (NFR-2)
- The bot only accepts the allowed user's ID (NFR-1); it's custom code and implements the same allowlist. The control bot's upload capability is not used (FR-U8).

---

## 12. Control Bot (`claude-code-telegram`)

The `RichardAtCT/claude-code-telegram` project (Python 3.11+, MIT). Latest tagged version at time of writing: `v1.6.0`.

- Install from a **tagged** version (not main): `uv tool install git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0` (or pip).
- The runtime profile from Section 3.
- `ALLOWED_USERS` contains only the allowed user's ID (NFR-1). (The variable in this bot is `ALLOWED_USERS`, not `ALLOWED_USER_IDS`.)
- Other required variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `APPROVED_DIRECTORY=data-repo`. Auth via the CLI (`claude auth`) or `ANTHROPIC_API_KEY`.
- Clarifying questions raised as conversational turns (FR-C3).
- No custom logic: it passes the message transparently to Claude Code; locating/validating the file is Claude Code's job (the transcribe stage), not the bot's. (FR-C1)
- **Built-in features of this bot that we do NOT use:** its built-in voice transcription (Whisper/Voxtral) — our transcription is Gemini/Vertex in the pipeline; and file upload/extraction — disabled with `ENABLE_FILE_UPLOADS=false`, since every upload is via Bot 1 only (FR-U8).

**References (to read during implementation):**
- Repo: <https://github.com/RichardAtCT/claude-code-telegram>
- Setup & Claude auth: `docs/setup.md`
- Tool allowlist (16 tools): `docs/tools.md`
- Full config reference: `docs/configuration.md` and `.env.example`
- Deployment: `SYSTEMD_SETUP.md` (we use Docker instead — Section 16)

---

## 13. UI — Stack, Backend & Frontend

### 13.1 Tech Stack

**Frontend**
- **Visual design reference (mandatory):** the frontend's look must **exactly** match the reference design at `code-repo/ui/design/Palette_Directions_dc.html` (palette, typography with the Vazirmatn font, and component shapes). This file is the single source of truth for the look; palette/font details are not repeated here to avoid divergence. (The file depends on `./support.js`; keep it alongside.)
- **React + TypeScript**, built with **Vite**.
- Diagram with **`@xyflow/react`** (the new generation of React Flow) for processes/sub-processes/junctions.
- Server data with **TanStack Query** (fetch/cache/refresh); local edit state with React's own state.
- Styling with **Tailwind CSS**.

**Backend (thin service)**
- **FastAPI** on **Uvicorn** (Python 3.11+; same family as the upload bot).
- **No ORM/database**: direct access to the JSON on `DATA_ROOT` with **atomic writes** (temp file + `os.replace`) and a **lightweight per-file lock** so concurrent writes to one process don't clash.
- Calls the engine CLIs (`allocate-id` for manual creation) and `git commit` after each "Save".
- Auth: password hashing with **argon2** (`argon2-cffi`); a **signed** session cookie (JWT or `itsdangerous`) with a secret in env.
- Serving the frontend: FastAPI also serves the Vite-built files (no separate `ui-web` service needed); the proxy only provides TLS.

### 13.2 Behavior

- Maps `nodes` (including junctions) and `edges` directly to the graph. Summary card from `idef0`+`kpis`. Navigation department→process→sub-process→box. (FR-I2)
- **Default mode is view-only (read-only):** the user sees the process and flowchart but nothing is movable/editable. Only by pressing the **"Edit"** button does the editor open and the user enters edit mode (preventing accidental changes).
- **Save is manual, not automatic:** changes (edit/delete/add/reposition) are held in UI memory until the user presses **"Save"**; then the backend writes the JSON at once and makes **one commit** (Section 15). This prevents tiny, numerous commits.
- Backend jobs: read/write JSON, apply edit/delete (flag)/add, reposition (recording `layout: manual`), the `pending` review inbox, and manual process creation (`allocate-id` — FR-I5, FR-D2).
- Auth (NFR-3): the plaintext password is not stored; the hash and signing key are **outside `data-repo`** (stack details in 13.1). Alternative auth: Basic Auth on the reverse proxy.
- The edit loop is independent of both bots, working directly from the JSON on disk.

---

## 14. Security & Access

- Both bots restricted to allowed Telegram IDs (control bot: `ALLOWED_USERS`; upload bot: its own code's allowlist) (NFR-1); an unauthorized ID is rejected without a reply (AC-8).
- The UI with username/password (NFR-3, AC-8).
- Secrets (Vertex service account, password hash, signing key, bot tokens) are all outside `data-repo` and outside Git.
- The Section 7 hooks enforce invariants INV-1/INV-2 at the file level (AC-7).

---

## 15. Versioning, Commit & Push

- **Committed:** `departments/**`, `meetings/audio/**` (or a reference to them), `meetings/transcripts/**`, `runs/**`, `.claude/**`, `CLAUDE.md`.
- **In `.gitignore`:** `.staging/`, secret/env files.
- The extraction brain (`.claude`) is also versioned; improving a skill = a commit, and the next runtime run picks up the new version itself.

### When it commits — the three write paths

No change goes uncommitted; each path commits with a distinct author/message so `git log` shows the origin:

| Path | When | Example message |
|---|---|---|
| Pipeline | one commit at the end of each run (FR-P7) | `pipeline(cooking): 2 processes from cooking-2026-07-06` |
| Chat edit (Claude Code) | after applying each edit | `chat-edit(cooking-001): update actor of n020` |
| UI edit | when the user presses "Save" (one commit for that whole save) | `ui-edit(cooking-001): move nodes` |

Note: in the UI, saving is manual (not autosave on each click), so each "Save" = one JSON write + one commit. (Section 13)

### When it pushes — scheduled (NFR-7)

- Commits are always **local and immediate** (full history on the VPS).
- Push to GitHub **twice a day**, at **11:00** and **23:00**, and **only if there are unpushed commits** (otherwise no push). This serves as an off-site backup; since the system is single-user, the remote does not need to be up to date to the minute.
- Implementation: a scheduled job (cron inside a container or a separate service in the stack) that runs `git push` conditional on new commits existing. Optional: a "Push now" button in the UI for an immediate manual push.

---

## 16. Deployment with Docker (NFR-9)

The whole `code-repo` comes up as **one Docker Compose stack**: a single `docker compose up -d` starts both bots and the UI (and the side services). `restart: unless-stopped` provides the "permanent service" role.

Stack services:

| Service (container) | Role | Notes |
|---|---|---|
| `telegram-bot-api` | local Bot API server (2 GB cap) | `tdlib/telegram-bot-api` image |
| `upload-bot` | Bot 1 (Python) | mounts `data-repo` |
| `control-bot` | Bot 2 (claude-code-telegram) | custom image: Python + **Node/Claude Code CLI** + engine CLIs + git; mounts `data-repo` (as `APPROVED_DIRECTORY`) |
| `ui-backend` | FastAPI backend + serving the built frontend | mounts `data-repo`; calls engine CLIs + git |
| `proxy` | reverse proxy + TLS for the UI | `nginx`/`Caddy` |
| `git-push` | scheduled push to GitHub | cron at 11:00 and 23:00, conditional on new commits (Section 15); mounts `data-repo` + deploy key |

Key Docker notes:

- **`data-repo` is a shared volume** mounted on `upload-bot`, `control-bot`, `ui-backend` — the "only point of connection." It's also accessible on the host so development sessions 1 and 2 can work on it.
- The `control-bot` image is the heaviest: it must have Node and the **Claude Code CLI** and the engine CLIs (on PATH) and git, because Claude Code runs the pipeline and spawns subagents inside this container.
- **`code-repo` is baked into the images, but `data-repo` never is** — so runtime only has access to the data volume (INV-2). The Section 7 hooks are still active inside the container.
- Secrets (bot tokens, Vertex service account, `ANTHROPIC_API_KEY`, UI hash/key) are injected via Docker secrets or an `.env` file outside the repo, not baked into the image.
- **This stack is for running only, not development.** Building the system (sessions 1 and 2 + Superpowers) is done in your own dev environment; after that a tagged Docker image is built and deployed to the server. That is, inside the containers there is no Superpowers and no coding — only the finished product runs. (Another guarantee of INV-2.)

> If a "single container" is preferred over multiple services, these processes could be gathered into one image with a process manager (e.g. `supervisord`); but multi-service Compose is cleaner for isolation and independent restarts.

---

## 17. Requirements Traceability (sample)

| PRD requirement | Where it's realized in the ARD |
|---|---|
| INV-1 (deterministic IDs) | 4.1 + the `allocate-id` CLI + the direct-write-block hook |
| INV-2 (code/data separation) | 3 (locked profile) + 7 (hooks) + 8 (CLIs outside APPROVED_DIRECTORY) |
| FR-P4 (checkpoint) | 5.3 + the `/process-voice` skill |
| FR-M3 (conflict) | 6.3 (`pending`) + 13 (review inbox) |
| FR-D9/10 (layout) | 9 + 6.4 |
| NFR-2 (large file) | 11 (local Bot API server) + 5.1 (Vertex file upload) |
| NFR-6 (context) | 7 (content on disk, isolated subagents) |
| NFR-3 (UI auth) | 13 + 14 |

---

## 18. Open Items

- The exact Gemini-on-Vertex model and how large files are passed (inline vs. GCS) — to be finalized during implementation.
- The exact threshold for automatic sub-process creation (number of sub-steps) — to be tuned based on `runs/`.
- The audio format produced by Telegram and any conversions needed before Vertex.
- The backup strategy for the data repository on the VPS.