# Attachment ingestion into the voice pipeline — design

**Date:** 2026-07-14
**Status:** Approved (brainstorming) — ready for implementation planning
**Scope:** `code-repo/engine` (new CLI) + `data-repo/.claude` (playbook & agents). No schema change.

---

## Problem

Departments have an `attachments/` folder holding formal reference documents — currently
`.docx` job descriptions (شرح شغل), e.g.:

```
departments/dining/attachments/شرح_شغل_مهماندار.docx
departments/dining/attachments/شرح_شغل_سرپرست_سالن.docx
departments/dining/attachments/شرح_شغل_جونیور.docx
departments/cashier/attachments/شرح_شغل_کارکنان_بخش_صندوق_.docx
```

**Today these files are never read by anything.** The `process-voice` pipeline is
100%-transcript-driven: the `classify`, `extract`, and `summarize` agents only ever receive
`transcript_path`. A `grep -rin attachment data-repo/.claude/` returns zero matches. So the
documents sit in storage and never reach an agent — which is why the user observed that "Claude
didn't send them." This is an unimplemented capability, not a bug.

## Goal

Let a voice run **supplement** its extracted processes with the touched department's attachment
documents, so job-description detail (actors, controls, mechanisms, KPIs) can inform the processes
that voice run is already handling — filling fields the conversation left empty and surfacing
genuine discrepancies for human approval, never overwriting silently.

## Key mechanism: `merge` already owns field semantics (do NOT duplicate in the agent)

The single most important design fact, confirmed in `engine/merge/__init__.py` (build_update,
lines 137–149). When `merge` applies a delta's `enrich_nodes`, for **every** source it already does:

```python
for field, val in en["set"].items():
    cur = n.get(field)
    if is_empty(cur):          # field empty      → fill it, _touch(n, run)
        n[field] = val
        _touch(n, run)
    elif cur != val:           # field already set → pending[] conflict (human decides)
        process["pending"].append(
            {"node": en["id"], "field": field, "current": cur,
             "proposed": val, "source": run, "status": "open"})
```

Therefore the **extract agent never "fills" or "edits" a field** — it only reads its sources and
writes a candidate/delta describing *what the sources say*. `merge` decides empty-fill vs. conflict,
and never silently overwrites (INV-5). Adding an attachment changes **only what the extract/summarize
agents read** — it plugs into this existing machinery with zero new field logic. (v1 of this spec
wrongly placed fill-empty rules in the agent; that section is removed.)

## Scope decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Which agents read attachments | `extract` + `summarize` (NOT `classify`) |
| Entry point | **Supplement-only** — attachments are read during a voice run; no standalone/on-demand run |
| Doc→text | New deterministic `extract-attachment` CLI, cached (convert once) |
| Field authority | Whatever the agent proposes flows through `merge`: empty→fill, conflict→`pending[]` |
| Human approval of doc-driven edits | The existing **Stage 9 conflict/pending report** (and UI inbox), not a new checkpoint |
| Schema | **No change** |

## Non-goals — what we do NOT build (but do not forbid)

- **No standalone / on-demand pipeline mode is built.** We do **not** wire attachments into
  `classify`, add an attachment entry point, or automate creating processes from a document. The
  *only automated* attachment behaviour is the supplement during a voice run.
- **Ad-hoc reading is already possible and is not blocked.** Nothing here forbids a normal chat
  session from reading an attachment when you ask it to. Once the `extract-attachment` CLI exists, a
  runtime session (which has `Bash` + the engine CLIs on PATH) can, on your explicit request,
  convert a `.docx` to text, read it, and even create/update a process from it — by going through
  the **normal `merge` writer**. That path needs **no new development** and stays fully governed by
  the invariants: `merge` is the only writer (hook-enforced), IDs come from `allocate-id` (INV-1),
  conflicts land in `pending[]` for your approval (INV-5), and the session cannot touch code/config
  (INV-2). So "if you want Claude to read a file in a chat, it can" — we simply don't build a
  dedicated feature or automate it.
- **`classify` stays transcript-only** — attachments do not influence automated segmentation.
- **The voice run itself never auto-creates a process from a doc-only activity** — a voice-run
  supplement only enriches processes that run already identified (see Data flow).

---

## Architecture

Three coordinated changes, communicating (as always) only through the filesystem.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. NEW engine CLI:  extract-attachment <dept>                          │
│    departments/<dept>/attachments/*.docx                               │
│        ──(python-docx, once, cached)──►                                │
│    departments/<dept>/attachments/.text/<name>.txt                     │
└──────────────────────────────────────────────────────────────────────┘
                              │ (cached .txt paths, one per line on stdout)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. process-voice playbook:  new Stage 5a "prepare attachments"         │
│    For each touched department: run extract-attachment, collect the    │
│    .text/*.txt paths, pass them into the extract + summarize dispatch. │
└──────────────────────────────────────────────────────────────────────┘
                              │ (attachment_texts: [...])
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. extract & summarize agents:  read the relevant .txt as an ADDED     │
│    source (INV-3, scoped to THIS process). Output flows through merge. │
└──────────────────────────────────────────────────────────────────────┘
```

### Component 1 — `extract-attachment` CLI (code-repo/engine)

A new deterministic CLI mirroring `transcribe`'s conventions.

- **Package:** `engine/extract_attachment/` (`__init__.py`, `cli.py`, `README.md`), registered in
  `engine/pyproject.toml` under `[project.scripts]` as
  `extract-attachment = "extract_attachment.cli:main"` and added to the `packages.find` include list.
- **Signature:** `DATA_ROOT=<data-repo> extract-attachment <dept>`
- **Behavior:**
  1. Resolve root via `engine_common.data_root()` (same helper `transcribe` uses).
  2. Glob `departments/<dept>/attachments/*.docx` (skip `.gitkeep` and the `.text/` cache dir).
  3. Cached output for each doc: `departments/<dept>/attachments/.text/<stem>.txt`.
  4. **Idempotency / caching (explicit user requirement — "convert once, don't redo every run"):**
     convert a doc only if its `.txt` is missing OR the source `.docx` mtime is newer than the
     cached `.txt`. Otherwise reuse the cache.
  5. Convert with `python-docx` (add to `engine/requirements.txt`): concatenate paragraph text and
     table-cell text in document order into a UTF-8 plain-text file.
  6. Print each `.text/*.txt` path (relative to root) to stdout, one per line, so the playbook can
     capture them. Empty department → print nothing, exit 0.
- **Determinism:** same input bytes → same output text. No network, no LLM.

### Component 2 — `process-voice` playbook (data-repo/.claude/skills/process-voice/SKILL.md)

Insert **Stage 5a — prepare attachments**, immediately before the Stage 5 extract sweep, inside the
same turn (turn-discipline: it carries a `Bash` call, so it does not end the turn):

1. For each department touched by the confirmed `new`/`update` segments, run
   `Bash: DATA_ROOT=<data-repo> extract-attachment <dept>` and capture the printed `.txt` paths into
   a per-department `attachment_texts` list (possibly empty).

Then:

- **Stage 5 (extract):** add an `attachment_texts:` parameter to every `extract` `Task` dispatch,
  set to the touched department's list. Empty list ⇒ extract behaves exactly as today.
- **Stage 7 (summarize):** add the same `attachment_texts:` parameter to the `summarize` `Task`.

No change to serial-extract discipline, merge, commit, or the Stage 4 voice checkpoint. Attachment
content flows through the **existing** candidate/delta → `merge` → `pending[]` path unchanged.

### Component 3 — extract & summarize agents (data-repo/.claude/agents/{extract,summarize}.md)

Add an `attachment_texts` input and a short instruction — **no field-fill logic** (merge owns that):

> **Attachment sources.** You are given `attachment_texts` — paths to this department's reference
> documents (e.g. job descriptions). **Before producing your output, read the attachment(s) relevant
> to THIS process's actor/role** (filenames are descriptive, e.g. `شرح_شغل_مهماندار` = host). Treat
> them as an additional source alongside the transcript, under the same rules: no fabrication
> (INV-3), roles not names (ARD §4.4), Persian values. Model only content that belongs to THIS
> process's segment — do not introduce activities from the attachment that this process's transcript
> segment does not cover. Whatever you put in the candidate/delta is applied by `merge` (empty→fill,
> conflict→`pending[]`); you never decide field overwrites yourself.

Reading is **mandatory, not optional** — a vague "these files are available" gets skipped, and the
feature only works if attachments are actually consulted. `summarize` reads the same texts to enrich
the department `overview.json` (which it regenerates wholesale — no field-merge involved).

---

## Data flow & where the human approves

| Situation | Result |
|---|---|
| Transcript leaves a node field empty, attachment informs it | Agent proposes it → `merge` fills it (`_touch(n, run)`). |
| Field already filled, attachment agrees | No change. |
| Field already filled, attachment **differs** | Agent proposes it → `merge` writes a `pending[]` conflict. Surfaced in the **Stage 9 conflict report**; human resolves via `merge accept/reject` or the UI. Original untouched until approved (INV-5). |
| Attachment implies a new node / sub-process for a voice-touched process | Agent adds it (`add_nodes` / `subprocesses`); `merge` allocates IDs (INV-1). Auto-subprocesses appear in the Stage 9 report. |
| Department has no attachments | `attachment_texts` empty; pipeline behaves exactly as today. |
| Attachment describes a process no voice mentioned | Not auto-created by the voice run. (Can still be done ad-hoc on your explicit request via the normal `merge` writer — see Non-goals.) |

**There is no new checkpoint.** Doc-driven field edits are reviewed at the point voice edits already
are: the Stage 9 `pending[]` report / UI inbox. This is what keeps INV-5 intact.

## Provenance (and a v1 limitation)

- No schema change. Processes are still created by voice, so `source.type`
  (`voice|manual|chat|auto`) is untouched.
- `merge` records field touches at **run granularity** via `_touch(n, run)` and stamps `pending[].source`
  with the run id. **v1 limitation:** an attachment-derived fill/conflict is attributed to the *run*,
  not to the specific `.docx` file — so within one run, "voice said X" vs "the job description said X"
  is not separately distinguishable.
- *If finer per-file attribution is wanted later*, extend `merge`/the delta contract to carry an
  optional source tag (e.g. `attachment:<file>`) into `_touch`/`pending[].source`. Deferred; not
  required for v1 and out of scope here.

## Caching & git

- Cached text lives in `departments/<dept>/attachments/.text/`.
- The `.docx` originals are already tracked in `data-repo`. **Recommendation:** also commit the
  `.text/*.txt` cache (small, reproducible, regenerable). Since the pipeline commits run artefacts in
  Stage 8, cache files created during a run get committed with it. (Gitignoring them instead is a
  valid implementation-plan choice — not a design blocker.)

## Error handling

- **Corrupt/unreadable `.docx`:** CLI reports the file to stderr and exits non-zero; the playbook
  surfaces a Persian warning and continues extraction **without** that attachment (a supplement must
  never block the voice run).
- **Missing `.text/` dir:** created by the CLI on first run.
- **`python-docx` not installed:** CLI fails fast with a clear message; dep added to
  `engine/requirements.txt` and `pyproject.toml`.
- **Non-`.docx` file in `attachments/`:** ignored in v1; the CLI logs that it skipped it (no silent
  cap — state what was skipped).

## Testing

- **Engine unit tests** (`engine/tests/test_extract_attachment.py`, mirroring `test_transcribe.py`):
  fixture `.docx` → expected text; idempotency (2nd run reuses cache, no rewrite); re-convert when the
  `.docx` mtime is newer; empty department → empty stdout, exit 0; corrupt doc → non-zero + stderr;
  stdout path-list format. No network.
- **Schema / contract:** `make test` still passes unchanged (no contract change).
- **Manual/agent-level dry run on `dining`:** confirm (a) `.text/` sidecars appear, (b) an empty node
  field gets filled from the host job-description during a voice run, (c) a deliberately conflicting
  value lands in `pending[]` (Stage 9 report) rather than overwriting.

---

## Deliverables checklist

1. `engine/extract_attachment/` package + `pyproject.toml` / `requirements.txt` wiring.
2. `engine/tests/test_extract_attachment.py`.
3. `data-repo/.claude/skills/process-voice/SKILL.md`: Stage 5a + `attachment_texts` in Stages 5 & 7
   + the stage-ordering summary table row.
4. `data-repo/.claude/agents/extract.md` and `summarize.md`: `attachment_texts` input + the
   "attachment sources" instruction (no field-fill logic).
5. `data-repo/CLAUDE.md`: add `extract-attachment` to the Engine-CLIs table.

> Items 3–5 live in `data-repo`, whose runtime CLAUDE.md forbids editing `.claude/**` *at runtime*.
> These are **development-time** edits made here in the dev checkout, not by the Telegram session.
