# Attachment Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a voice run supplement its extracted processes with the touched department's `.docx` attachment documents, by adding a deterministic `extract-attachment` CLI and feeding the cached text into the existing `extract` and `summarize` agents.

**Architecture:** A new `extract-attachment` engine CLI converts `departments/<dept>/attachments/*.docx` to cached `.text/<name>.txt` (idempotent, mtime-gated). The `process-voice` playbook runs it per touched department (new Stage 5a) and passes the resulting `.txt` paths into the `extract` and `summarize` `Task` dispatches. The agents read those files as an additional source; all field semantics stay in the existing `merge` CLI (empty→fill, conflict→`pending[]`). No schema change.

**Tech Stack:** Python ≥3.11 (engine CLIs), `python-docx` for `.docx` parsing, pytest for tests. Playbook/agents are Markdown in `data-repo/.claude`.

## Global Constraints

- **Two separate git repositories.** Engine code + tests live in **`code-repo`** (this repo). The playbook, agents, and runtime `CLAUDE.md` live in **`data-repo`** (`../data-repo`, its own git repo). Commit each task's changes in the repo that owns those files.
- **Deterministic CLI (ARD §7):** `extract-attachment` makes no network calls and uses no LLM. Same input bytes → same output text.
- **Mirror `transcribe` conventions:** pure functions in the package `__init__.py`, a thin `cli.py:main` that reads env and prints. Inject the conversion callable so tests need no real parsing (same pattern as `FakeTranscriber`).
- **`engine_common.data_root()`** resolves `DATA_ROOT` (raises `SystemExit` if unset). Reuse it — do not re-read the env var directly.
- **New dependency:** `python-docx~=1.1` (import name `docx`). Add to `engine/pyproject.toml` `dependencies` **and** `engine/requirements.txt`. `requirements-dev.txt` already installs `-e ./engine`, so the test venv picks it up automatically.
- **No schema change.** `make test` (runs `pytest -q` in the uv venv) must stay green.
- **Persian for all user-facing playbook text** (INV — data-repo CLAUDE.md). Internal IDs/paths/CLI commands stay ASCII.
- **Invariants untouched:** `merge` remains the only writer of `departments/**/processes/*.json` (INV-1/hook), no fabrication (INV-3), human approval for filled-field overwrites via `pending[]` (INV-5).

---

## File Structure

**code-repo (Tasks 1–2):**
- Create `engine/extract_attachment/__init__.py` — pure conversion + cache logic (`find_docx`, `docx_to_text`, `needs_conversion`, `run_extract_attachment`, path helpers).
- Create `engine/extract_attachment/cli.py` — `main()` entry point.
- Create `engine/extract_attachment/README.md` — one-paragraph CLI doc (mirrors other engine READMEs).
- Create `engine/tests/test_extract_attachment.py` — unit tests.
- Modify `engine/pyproject.toml` — register the script, package include, dependency.
- Modify `engine/requirements.txt` — add `python-docx`.

**data-repo (Tasks 3–4):**
- Modify `.claude/skills/process-voice/SKILL.md` — new Stage 5a + `attachment_texts` param in Stages 5 & 7 + summary table row.
- Modify `.claude/agents/extract.md` — `attachment_texts` input + "attachment sources" instruction.
- Modify `.claude/agents/summarize.md` — `attachment_texts` input + instruction.
- Modify `CLAUDE.md` — add `extract-attachment` to the Engine-CLIs table.

---

### Task 1: `extract-attachment` core module

**Files:**
- Create: `engine/extract_attachment/__init__.py`
- Test: `engine/tests/test_extract_attachment.py`

**Interfaces:**
- Consumes: `engine_common.data_root()` (existing).
- Produces (relied on by Task 2):
  - `attachments_dir(root, dept) -> pathlib.Path`
  - `text_dir(root, dept) -> pathlib.Path`  (the `.text/` cache dir)
  - `find_docx(root, dept) -> list[pathlib.Path]`  (sorted `*.docx`, `[]` if none/dir missing)
  - `docx_to_text(path) -> str`  (paragraphs + table cells joined by `\n`, trailing newline)
  - `needs_conversion(src, dst) -> bool`  (`True` if `dst` missing or `src` mtime newer)
  - `run_extract_attachment(dept, root=None, convert=None) -> tuple[list[str], list[tuple[str, str]]]`
    returns `(ok_rel_paths, errors)` where `ok_rel_paths` are `.txt` paths relative to `root`
    (POSIX, sorted by source name) and `errors` is `[(filename, message), …]`. `convert`
    defaults to `docx_to_text`; injectable for tests.

- [ ] **Step 1: Write the failing tests**

Create `engine/tests/test_extract_attachment.py`:

```python
import os

import pytest
from extract_attachment import (
    docx_to_text,
    find_docx,
    needs_conversion,
    run_extract_attachment,
    text_dir,
)


def _mk_attachments(root, dept):
    d = root / "departments" / dept / "attachments"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_docx(path, paragraphs):
    from docx import Document
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    doc.save(str(path))


class CountingConvert:
    """Injectable stand-in for docx_to_text — counts calls, ignores file bytes."""
    def __init__(self, text="متن نمونه"):
        self.calls = 0
        self.text = text

    def __call__(self, path):
        self.calls += 1
        return self.text + "\n"


def test_real_docx_converts_to_text(data_root):
    adir = _mk_attachments(data_root, "dining")
    _write_docx(adir / "host.docx", ["شرح شغل مهماندار", "وظیفه: پذیرش مشتری"])
    ok, errors = run_extract_attachment("dining", root=data_root)
    assert errors == []
    txt = text_dir(data_root, "dining") / "host.txt"
    assert txt.exists()
    body = txt.read_text(encoding="utf-8")
    assert "شرح شغل مهماندار" in body and "پذیرش مشتری" in body
    assert ok == ["departments/dining/attachments/.text/host.txt"]


def test_idempotent_reuses_cache(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "host.docx").write_bytes(b"dummy")
    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    dst = text_dir(data_root, "dining") / "host.txt"
    first_mtime = dst.stat().st_mtime
    run_extract_attachment("dining", root=data_root, convert=conv)  # cache newer than src
    assert conv.calls == 1                      # not re-converted
    assert dst.stat().st_mtime == first_mtime   # not rewritten


def test_reconverts_when_docx_is_newer(data_root):
    adir = _mk_attachments(data_root, "dining")
    src = adir / "host.docx"
    src.write_bytes(b"dummy")
    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    dst = text_dir(data_root, "dining") / "host.txt"
    # make the source newer than the cache
    future = dst.stat().st_mtime + 10
    os.utime(src, (future, future))
    run_extract_attachment("dining", root=data_root, convert=conv)
    assert conv.calls == 2                      # re-converted


def test_empty_department_returns_empty(data_root):
    _mk_attachments(data_root, "dining")        # dir exists, no .docx
    ok, errors = run_extract_attachment("dining", root=data_root)
    assert ok == [] and errors == []


def test_missing_attachments_dir_returns_empty(data_root):
    ok, errors = run_extract_attachment("nosuchdept", root=data_root)
    assert ok == [] and errors == []


def test_corrupt_docx_is_recorded_as_error(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "bad.docx").write_bytes(b"not a real docx")

    def boom(path):
        raise ValueError("bad zip")

    ok, errors = run_extract_attachment("dining", root=data_root, convert=boom)
    assert ok == []
    assert errors == [("bad.docx", "bad zip")]


def test_find_docx_sorted_and_skips_text_dir(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "b.docx").write_bytes(b"x")
    (adir / "a.docx").write_bytes(b"x")
    (adir / ".gitkeep").write_bytes(b"")
    (adir / ".text").mkdir()
    (adir / ".text" / "old.docx").write_bytes(b"x")   # must NOT be picked up
    names = [p.name for p in find_docx(data_root, "dining")]
    assert names == ["a.docx", "b.docx"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest engine/tests/test_extract_attachment.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'extract_attachment'` (and, until Task 2 installs it, `python-docx` may be missing → the real-docx test errors on `import docx`). Both confirm the code doesn't exist yet.

- [ ] **Step 3: Write the module**

Create `engine/extract_attachment/__init__.py`:

```python
from engine_common import data_root


def attachments_dir(root, dept):
    return root / "departments" / dept / "attachments"


def text_dir(root, dept):
    return attachments_dir(root, dept) / ".text"


def find_docx(root, dept):
    adir = attachments_dir(root, dept)
    # glob on a missing directory yields nothing; .text/ is a subdir so *.docx
    # at this level never descends into it.
    return sorted(p for p in adir.glob("*.docx") if p.is_file())


def docx_to_text(path):
    from docx import Document  # lazy — keeps import cost out of the fast paths
    doc = Document(str(path))
    lines = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                lines.append(cell.text)
    return "\n".join(lines).strip() + "\n"


def needs_conversion(src, dst):
    return (not dst.exists()) or (src.stat().st_mtime > dst.stat().st_mtime)


def run_extract_attachment(dept, root=None, convert=None):
    root = root or data_root()
    convert = convert or docx_to_text
    tdir = text_dir(root, dept)
    ok, errors = [], []
    for src in find_docx(root, dept):
        dst = tdir / (src.stem + ".txt")
        try:
            if needs_conversion(src, dst):
                tdir.mkdir(parents=True, exist_ok=True)
                dst.write_text(convert(src), encoding="utf-8")
            ok.append(dst.relative_to(root).as_posix())
        except Exception as e:  # one bad doc must not sink the rest (supplement)
            errors.append((src.name, str(e)))
    return ok, errors
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest engine/tests/test_extract_attachment.py -v`
Expected: PASS for all tests **except** possibly `test_real_docx_converts_to_text` if `python-docx` is not yet installed. If that one errors on `import docx`, install it now (`pip install "python-docx~=1.1"`) — Task 2 makes this permanent — then re-run; all green.

- [ ] **Step 5: Commit (code-repo)**

```bash
git add engine/extract_attachment/__init__.py engine/tests/test_extract_attachment.py
git commit -m "feat(engine): extract-attachment core — docx→cached text, idempotent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `extract-attachment` CLI, packaging, and dependency

**Files:**
- Create: `engine/extract_attachment/cli.py`
- Create: `engine/extract_attachment/README.md`
- Modify: `engine/pyproject.toml` (scripts, packages include, dependency)
- Modify: `engine/requirements.txt`
- Test: `engine/tests/test_extract_attachment.py` (append CLI tests)

**Interfaces:**
- Consumes: `run_extract_attachment` from Task 1.
- Produces: console command `extract-attachment <department>` → prints ok `.txt` paths to stdout (one per line), errors to stderr (`skipped <file>: <msg>`), exit `1` if any errors else `0`.

- [ ] **Step 1: Write the failing CLI tests (append to the test file)**

Append to `engine/tests/test_extract_attachment.py`:

```python
from extract_attachment.cli import main as cli_main


def test_cli_prints_ok_paths_and_exits_zero(data_root, capsys):
    adir = _mk_attachments(data_root, "dining")
    _write_docx(adir / "host.docx", ["شرح شغل"])
    rc = cli_main(["dining"])
    out = capsys.readouterr()
    assert rc == 0
    assert out.out.strip() == "departments/dining/attachments/.text/host.txt"


def test_cli_reports_errors_and_exits_nonzero(data_root, capsys, monkeypatch):
    adir = _mk_attachments(data_root, "dining")
    (adir / "bad.docx").write_bytes(b"nope")

    def boom(path):
        raise ValueError("bad zip")

    monkeypatch.setattr("extract_attachment.cli.docx_to_text", boom, raising=False)
    rc = cli_main(["dining"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "bad.docx" in err
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest engine/tests/test_extract_attachment.py -k cli -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'extract_attachment.cli'`.

- [ ] **Step 3: Write `cli.py`**

Create `engine/extract_attachment/cli.py`:

```python
import argparse
import sys

from extract_attachment import docx_to_text, run_extract_attachment  # noqa: F401


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract-attachment")
    ap.add_argument("department")
    args = ap.parse_args(argv)
    ok, errors = run_extract_attachment(args.department)
    for path in ok:
        print(path)
    for name, msg in errors:
        print(f"skipped {name}: {msg}", file=sys.stderr)
    return 1 if errors else 0
```

> Note: `docx_to_text` is imported into `cli` so the error test can monkeypatch
> `extract_attachment.cli.docx_to_text`. `run_extract_attachment` uses its own module-level
> reference, so also verify manually that a real corrupt file surfaces an error (Step 6).

- [ ] **Step 4: Register the CLI, package, and dependency**

Modify `engine/pyproject.toml`:

```toml
[project]
name = "inja-engine"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["jsonschema~=4.23", "python-docx~=1.1"]
```

```toml
[project.scripts]
allocate-id = "allocate_id.cli:main"
extract-attachment = "extract_attachment.cli:main"
layout = "layout.cli:main"
merge = "merge.cli:main"
transcribe = "transcribe.cli:main"
validate = "validate.cli:main"
```

```toml
[tool.setuptools.packages.find]
include = ["engine_common*", "allocate_id*", "extract_attachment*", "layout*", "merge*", "transcribe*", "validate*"]
```

Modify `engine/requirements.txt` — add under the existing comment block:

```
# extract-attachment: docx → text (pure-python, no network)
python-docx~=1.1
```

Create `engine/extract_attachment/README.md`:

```markdown
# extract-attachment

Convert a department's `.docx` attachments to cached plain text.

```
DATA_ROOT=<data-repo> extract-attachment <department>
```

Reads `departments/<department>/attachments/*.docx`, writes
`departments/<department>/attachments/.text/<name>.txt` (only when the source is new or
changed — mtime-gated), and prints each cached `.txt` path (relative to `DATA_ROOT`) to
stdout. Files that fail to convert are reported to stderr and skipped; exit code is non-zero
if any file was skipped. Deterministic: no network, no model.
```

- [ ] **Step 5: Reinstall the engine so the console script and dependency register**

Run: `pip install -e engine` (or `make test` recreates the venv from `requirements-dev.txt`, which installs `-e ./engine` and pulls `python-docx`).
Expected: completes without error; `python-docx` installed.

- [ ] **Step 6: Run the full suite + a real end-to-end check**

Run: `python -m pytest engine/tests/test_extract_attachment.py -v`
Expected: PASS (all tests, including `test_real_docx_converts_to_text`).

Run: `make test`
Expected: whole engine suite green — no schema regressions.

Manual end-to-end (uses the real committed docx in `data-repo`):
Run: `DATA_ROOT=../data-repo extract-attachment dining`
Expected stdout (one per line):
```
departments/dining/attachments/.text/شرح_شغل_سرپرست_سالن.txt
departments/dining/attachments/.text/شرح_شغل_جونیور.txt
departments/dining/attachments/.text/شرح_شغل_مهماندار.txt
```
And those `.txt` files exist with Persian text. (Order is by filename; exact order may differ — verify the three files appear.)

- [ ] **Step 7: Commit (code-repo)**

```bash
git add engine/extract_attachment/cli.py engine/extract_attachment/README.md \
        engine/pyproject.toml engine/requirements.txt engine/tests/test_extract_attachment.py
git commit -m "feat(engine): extract-attachment CLI + packaging + python-docx dep

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Playbook — Stage 5a + `attachment_texts` wiring (data-repo)

**Files:**
- Modify: `../data-repo/.claude/skills/process-voice/SKILL.md`
- Modify: `../data-repo/CLAUDE.md` (Engine-CLIs table row)

**Interfaces:**
- Consumes: the `extract-attachment <dept>` CLI (Task 2) and its stdout contract.
- Produces: an `attachment_texts` list per touched department, passed into the Stage 5 `extract` and Stage 7 `summarize` dispatches (consumed by Task 4's agents).

> No automated test — these are playbook edits. Verification is a grep check that the wiring is present and internally consistent, per Step 4.

- [ ] **Step 1: Add Stage 5a before the Stage 5 extract sweep**

In `.claude/skills/process-voice/SKILL.md`, immediately **before** `### Stage 5 — extract`, insert:

````markdown
### Stage 5a — prepare attachments (per department)

Before extracting, convert each touched department's attachment documents to cached text so the
`extract` and `summarize` agents can read them. This runs **in the same turn** as the extract
sweep (it carries a `Bash` call, so it does not end the turn — see Turn discipline).

For each department touched by the confirmed `new`/`update` segments:

```
Bash: DATA_ROOT=<data-repo> extract-attachment {dept}
```

- Capture stdout: each line is a cached `.txt` path relative to `<data-repo>`. Collect them into
  a per-department list `attachment_texts` (an empty list if the command printed nothing).
- If the command exits non-zero, it still printed the paths it *could* convert on stdout — use
  those. Note any `skipped …` lines from stderr and, at the end of the run, mention them to the
  user in Persian (e.g. «پیوستِ {نام فایل} خوانده نشد و نادیده گرفته شد.»). A failed attachment
  must **never** block extraction — attachments are a supplement.

`attachment_texts` is passed into every `extract` task (Stage 5) and the `summarize` task
(Stage 7) for that department.
````

- [ ] **Step 2: Add `attachment_texts` to the Stage 5 extract dispatches**

In `### Stage 5 — extract`, add the parameter to **both** the `new` and `update` dispatch blocks
(the last parameter in each `Task: extract` block):

For the **new** block, after `run_dir: {run_dir}` add:
```
    attachment_texts: {attachment_texts}   # cached .txt paths for {dept} from Stage 5a (may be empty)
```

For the **update** block, after `run_dir: {run_dir}` add:
```
    attachment_texts: {attachment_texts}   # cached .txt paths for {dept} from Stage 5a (may be empty)
```

- [ ] **Step 3: Add `attachment_texts` to the Stage 7 summarize dispatch + update tables**

In `### Stage 7 — summarize`, add to the `Task: summarize` block after `data_root: <data-repo>`:
```
  attachment_texts: {attachment_texts}   # cached .txt paths for {dept} from Stage 5a (may be empty)
```

In the **"Summary of stage ordering"** table, add a row after the Stage 4 row:
```
| 5a | prepare attachments | `Bash: extract-attachment` | yes |
```

In `../data-repo/CLAUDE.md`, add a row to the **Engine CLIs** table:
```
| `extract-attachment` | Convert a department's `.docx` attachments to cached `.text/*.txt` (idempotent) |
```

- [ ] **Step 4: Verify the wiring is present and consistent**

Run: `grep -n "attachment_texts\|Stage 5a\|extract-attachment" ../data-repo/.claude/skills/process-voice/SKILL.md ../data-repo/CLAUDE.md`
Expected: `Stage 5a` heading + `extract-attachment` Bash call present; `attachment_texts` appears in the new-extract block, the update-extract block, and the summarize block (≥3 dispatch occurrences plus the Stage 5a definition); the stage-ordering table has the `5a` row; `CLAUDE.md` has the `extract-attachment` row.

Also re-read the "Turn discipline" section and confirm Stage 5a is described as running in the same turn as extract (no prose-only status message added).

- [ ] **Step 5: Commit (data-repo)**

```bash
git -C ../data-repo add .claude/skills/process-voice/SKILL.md CLAUDE.md
git -C ../data-repo commit -m "feat(pipeline): Stage 5a prepares attachments; pass attachment_texts to extract+summarize

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Agents — read `attachment_texts` as an added source (data-repo)

**Files:**
- Modify: `../data-repo/.claude/agents/extract.md`
- Modify: `../data-repo/.claude/agents/summarize.md`

**Interfaces:**
- Consumes: the `attachment_texts` dispatch parameter from Task 3.
- Produces: no new output contract — the agents still write the same candidate/delta (extract) and `overview.json` (summarize). Attachment content flows through the existing `merge` logic.

> No automated test — agent-definition edits. Verification is a grep check (Step 3) plus the manual dry-run already listed in the spec's Testing section, run during execution review.

- [ ] **Step 1: Update `extract.md`**

In the **Inputs** table (`## Inputs (provided by the dispatch)`), add a row after `mode`:
```
| `attachment_texts` | List of cached attachment `.txt` paths for this department (may be empty). Reference documents such as job descriptions. |
```

Add a new section immediately **after** the Inputs table (before `## Mode A`):

````markdown
## Attachment sources (fill-empty is merge's job — not yours)

`attachment_texts` lists this department's reference documents (e.g. job descriptions;
filenames are descriptive — `شرح_شغل_مهماندار` = host, `شرح_شغل_سرپرست_سالن` = floor supervisor).

**Before producing your output, Read the attachment(s) relevant to THIS process's actor/role.**
Reading is required, not optional. Treat them as an additional source alongside the transcript,
under the same rules: no fabrication (INV-3), roles not names (ARD §4.4), Persian values.

- Model only content that belongs to THIS process's segment. Do **not** introduce activities from
  an attachment that this process's transcript segment does not cover.
- You never decide field overwrites. Put what the sources inform into the candidate/delta as usual;
  the `merge` CLI applies it (empty field → filled; already-filled field with a different value →
  `pending[]` conflict for the human). Do not try to pre-empt or skip that.
- If `attachment_texts` is empty, proceed exactly as before.
````

- [ ] **Step 2: Update `summarize.md`**

In the **Inputs** table (`## Inputs`), add a row after `transcript_path`:
```
| `attachment_texts` | List of cached attachment `.txt` paths for this department (may be empty). |
```

Add a sentence to the relevant synthesis step (where it reads the run's processes/transcript),
e.g. after Step 2 add a short step:

````markdown
## Step 2a — Read department attachments (if any)

If `attachment_texts` is non-empty, Read those files. They are reference documents (e.g. job
descriptions) for this department. Use them as additional evidence for sub-units, personnel roles,
and duties — under the same rules: no fabrication (INV-3), roles never personal names (ARD §4.4),
Persian values. If the list is empty, skip this step.
````

- [ ] **Step 3: Verify**

Run: `grep -n "attachment_texts" ../data-repo/.claude/agents/extract.md ../data-repo/.claude/agents/summarize.md`
Expected: `attachment_texts` appears in the Inputs table and the new instruction section of **both** agents.

- [ ] **Step 4: Commit (data-repo)**

```bash
git -C ../data-repo add .claude/agents/extract.md .claude/agents/summarize.md
git -C ../data-repo commit -m "feat(agents): extract+summarize read attachment_texts as an added source

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- New `extract-attachment` CLI (docx→cached txt, idempotent, deterministic) → Tasks 1–2. ✅
- Caching / convert-once (mtime-gated) → Task 1 `needs_conversion` + tests. ✅
- python-docx dependency + packaging/script registration → Task 2. ✅
- Playbook Stage 5a + `attachment_texts` in Stages 5 & 7 + summary table + CLAUDE.md row → Task 3. ✅
- extract + summarize read attachments; **no** fill-empty logic in the agent (merge owns it) → Task 4. ✅
- Reading mandatory; scoped to this process (no doc-only processes in a voice run) → Task 4 Step 1. ✅
- Error handling (corrupt doc skipped, run not blocked; stderr + non-zero exit) → Task 1 (`errors`), Task 2 (CLI), Task 3 Step 1 (playbook continues). ✅
- Empty department → empty list, pipeline unchanged → Task 1 tests + Task 3/4 "empty" clauses. ✅
- No schema change; `make test` green → Task 2 Step 6. ✅
- Provenance is run-level (v1 limitation) — no code needed; documented in spec, nothing to build. ✅ (intentionally no task)
- Caching commit-vs-gitignore left open in spec → cache files land under `attachments/.text/`; the pipeline's existing Stage 8 `git add -A` will commit them. No extra task; if the team prefers gitignoring, that is a one-line `.gitignore` change outside this plan.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code and edit step shows the actual content. ✅

**Type consistency:** `run_extract_attachment(dept, root=None, convert=None) -> (ok, errors)` is defined in Task 1 and consumed with that exact shape in Task 2's `cli.py` and tests. `text_dir`, `find_docx`, `docx_to_text`, `needs_conversion` names match across module, tests, and CLI. `attachment_texts` is the identical parameter name in Tasks 3 (dispatch) and 4 (agent inputs). ✅
