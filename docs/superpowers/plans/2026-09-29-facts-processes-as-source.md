# Facts runs read the corrected processes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A facts run builds each table's facts from the table itself plus the department's corrected processes (read whole), reads the transcripts only afterwards to fill gaps, sets aside and reports what a transcript contradicts, and every Claude agent runs on Opus 5.5 at effort high.

**Architecture:** `facts-plan build` renders every department's active processes (steps, actors, descriptions, ICOM, outgoing edges with their conditions) into `{run_dir}/processes/<dept>.md`; phase-1 units become one per sheet tab / photo group / document and are told to read their department's file whole (no transcript passages, no 40-label slice); phase-2 transcript units become 2–3 large gap-fillers that see phase 1's entries in full and write what contradicts into a new `contradicted[]` list the report prints. Assembly keeps the form over the process over the transcript and only raises disputes the owner can judge.

**Tech Stack:** Python 3.12 engine (`engine/facts_plan`, `engine/merge_facts`), JSON Schema draft 2020-12 (`schemas/`), pytest, the data-repo's `quantify` agent card and playbook (Markdown), Docker (control-bot image), Claude Code CLI 2.1.284.

**Spec:** `docs/superpowers/specs/2026-09-29-facts-processes-as-source-design.md` — read it first; every task argues from it.

## Global Constraints

- Model string everywhere: `claude-opus-5-5` (no `[1m]` — natively 1M on CLI 2.1.284); effort **high** (`effort: high` frontmatter; `CLAUDE_CODE_EFFORT_LEVEL=high` for the main session).
- Claude Code pin in `deploy/control-bot.Dockerfile`: `2.1.284`.
- Process files: `{run_dir}/processes/<department>.md`, every department, tombstoned processes skipped.
- Budgets: form core `IN_BUDGET = 50000` (unchanged), `OUT_BUDGET = 20000` (unchanged), `TRANSCRIPT_CHUNK = 70000`, `TRANSCRIPT_OUT_RATIO = 0.15`, `PHASE2_IN_BUDGET = 210000`, `RECORDED_BUDGET = 120000`, `MAX_LINES = 4500`, `MAX_LINE = 1900` (unchanged).
- Owner-facing text (`report.md`) is Persian and carries no id, path, `/`, unit id or Latin field name — the acceptance test's `LEAK = re.compile(r"__s|S-|N-|u-|/")` must pass on every line.
- **Isolation (spec §11), binding on every task:** code work only in this worktree (`code-repo/.claude/worktrees/facts-src`, branch `worktree-facts-src`, its own `.venv`); data-repo work only in the clone `…/process dev/data-repo.facts-src` (branch `facts-src`); never touch the main checkouts, `data-repo/.git`, the running local containers (`inja-food-process-local-*`), the server, or push anything. Never `cd` into the main checkout.
- Tests: run only the related suites (engine facts tests, root schema tests, the data-repo hooks tests) — never the whole vitest/e2e sweep.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Paths below are relative to the worktree root unless they start with `<clone>` (= `…/process dev/data-repo.facts-src`). Run engine tests from `engine/` with `../.venv/bin/pytest`.

---

### Task 1: Isolation and the model switch

**Files:**
- Create: `<clone>` (a `git clone` of the data-repo), branch `facts-src`
- Modify: `<clone>/.claude/agents/{classify,consolidate,extract,summarize,quantify}.md` (frontmatter only)
- Modify: `deploy/control-bot.Dockerfile:9-16`

**Interfaces:**
- Produces: the clone at `…/process dev/data-repo.facts-src`; the image `inja-control-bot-facts-src`; the container `inja-facts-src` (sleeping, `/work` = the clone). Tasks 9, 11, 12 use all three.

- [ ] **Step 1: Clone the data-repo without touching its `.git`**

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev"
git clone --no-hardlinks data-repo data-repo.facts-src
git -C data-repo.facts-src switch -c facts-src
```

- [ ] **Step 2: Copy the gitignored workbooks the clone lacks**

The data-repo ignores only `attachments/sheets/**/*.xlsx` (and audio). List them in the original (a read, no write) and copy each:

```bash
cd "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev"
git -C data-repo ls-files -o -i --exclude-standard -- attachments/sheets > /tmp/facts-src-xlsx.txt
while IFS= read -r f; do mkdir -p "data-repo.facts-src/$(dirname "$f")"; cp -p "data-repo/$f" "data-repo.facts-src/$f"; done < /tmp/facts-src-xlsx.txt
find data-repo.facts-src/attachments/sheets -name '*.xlsx' | wc -l
```

Expected: `28`.

- [ ] **Step 3: Switch the five agents to Opus 5.5 at effort high**

In each of `<clone>/.claude/agents/classify.md`, `consolidate.md`, `extract.md`, `summarize.md`, `quantify.md` replace the frontmatter line `model: claude-opus-5[1m]` with the two lines

```yaml
model: claude-opus-5-5
effort: high
```

Check: `grep -n "^model:\|^effort:" <clone>/.claude/agents/*.md` prints exactly five `model: claude-opus-5-5` and five `effort: high`.

- [ ] **Step 4: Commit in the clone**

```bash
git -C "<clone>" add .claude/agents
git -C "<clone>" commit -m "agents: every Claude agent runs claude-opus-5-5 at effort high (natively 1M; Opus 5.5 defaults to medium)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Raise the Claude Code pin**

In `deploy/control-bot.Dockerfile` change `@anthropic-ai/claude-code@2.1.220` to `@anthropic-ai/claude-code@2.1.284`, and append one sentence to the comment block above it: `2.1.284 is the first pin that knows claude-opus-5-5 (native 1M, 128K output — probe 2026-09-29).`

- [ ] **Step 6: Build the separately tagged image**

```bash
docker build -f deploy/control-bot.Dockerfile -t inja-control-bot-facts-src .
```

Expected: `Successfully tagged inja-control-bot-facts-src:latest` (or the buildx equivalent). Never `docker compose … up`, never the `inja-control-bot-local` tag.

- [ ] **Step 7: Start the isolated container**

Find the local credentials volume name first: `docker volume ls --format '{{.Name}}' | grep claude-credentials` (expected: `inja-food-process-local_local-claude-credentials`). Then:

```bash
CLONE="/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo.facts-src"
docker run -d --name inja-facts-src --entrypoint sleep \
  -v "$CLONE:/work" \
  -v "$HOME/.config/gcloud:/root/.config/gcloud:ro" \
  -v "$PWD/schemas:/opt/schemas:ro" \
  -v inja-food-process-local_local-claude-credentials:/root/.claude \
  -e DATA_ROOT=/work -e CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 -e CLAUDE_CODE_EFFORT_LEVEL=high \
  -e BASH_DEFAULT_TIMEOUT_MS=1800000 -e BASH_MAX_TIMEOUT_MS=1800000 \
  -e VERTEX_PROJECT=injafood -e VERTEX_LOCATION=global -e GCS_BUCKET=injafood-transcribe-staging \
  -e GEMINI_MODEL=gemini-3.1-pro-preview -e VERTEX_VISION_MODEL=gemini-3.1-pro-preview \
  -e GOOGLE_APPLICATION_CREDENTIALS=/root/.config/gcloud/application_default_credentials.json \
  -e GOOGLE_CLOUD_PROJECT=injafood \
  inja-control-bot-facts-src infinity
```

`/work`, not `/data`: Claude Code keys its session store by the working directory, so this container's sessions never mix with the running test bot's (`/data`).

- [ ] **Step 8: Prove the model and the window inside the container**

```bash
docker exec -w /work inja-facts-src claude -p "say OK" --model claude-opus-5-5 --output-format json
```

Expected: `"is_error": false` and `modelUsage["claude-opus-5-5"].contextWindow == 1000000`. Then the subagent path:

```bash
docker exec -w /work inja-facts-src claude -p "Use the Task tool once: run the summarize agent with the prompt 'Reply with the single word OK. Do nothing else.' Then reply OK." --model claude-opus-5-5 --allowedTools Task --output-format json
```

Expected: every key of `modelUsage` is `claude-opus-5-5` or a Haiku helper model; no key starts with `claude-opus-5[` and none equals `claude-opus-5`.

- [ ] **Step 9: Commit the pin**

```bash
git add deploy/control-bot.Dockerfile
git commit -m "deploy(control-bot): pin Claude Code 2.1.284, the first that knows claude-opus-5-5

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Process files

**Files:**
- Modify: `engine/facts_plan/build.py` (replace `process_index` at `:1313-1336`; add the functions below next to it)
- Test: `engine/tests/test_facts_plan_processes.py` (create)

**Interfaces:**
- Produces (all in `facts_plan.build`):
  - `ICOM_FA: tuple[tuple[str, str], ...]`
  - `PROCESSES_DIR = "processes"`
  - `process_departments(root) -> list[str]` — sorted codes of `departments/*/` that have a `processes/` dir
  - `process_docs(root, department) -> list[dict]` — the department's readable, non-tombstoned process docs, by file name
  - `process_index(root, department=None) -> list[{"process", "node", "label"}]` — one department, or every department when `department` is `None`
  - `render_process_file(docs) -> str`
  - `write_process_files(root, run_dir) -> dict[str, str]` — `{department: path as a unit is told it}`; removes stale `*.md`
  - `process_file_map(root, run_dir) -> dict[str, str]` — the same mapping read back off the run
  - `department_names(root) -> dict[str, str]` — `{code: Persian name}` from `departments/registry.json`, `{}` when unreadable

- [ ] **Step 1: Write the failing tests**

Create `engine/tests/test_facts_plan_processes.py`:

```python
"""Spec 2026-09-29 §5.1 — the corrected processes as the file a unit reads whole."""
import json

from facts_plan.build import (MAX_LINE, process_file_map, process_index,
                              render_process_file, write_process_files)


def _process(pid, nodes, edges=(), **over):
    doc = {"id": pid, "name": f"فرایند {pid}", "summary": "خلاصه",
           "nodes": nodes, "edges": list(edges)}
    doc.update(over)
    return doc


def _node(nid, label, **over):
    node = {"id": nid, "type": "activity", "label": label, "description": "",
            "actor": "", "icom": {}}
    node.update(over)
    return node


def _write(root, department, doc):
    directory = root / "departments" / department / "processes"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f'{doc["id"]}.json').write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def test_a_step_prints_its_actor_description_icom_and_next_steps():
    doc = _process("preparation-012", [
        _node("preparation-012-n039", "انتقال کنار شینسل خام به سردخانه",
              actor="مسئول لاین مرغ", description="در غذای پرسنل مصرف نمی‌شود.",
              icom={"inputs": ["کنار شینسل خام"], "controls": [],
                    "outputs": ["کنار شینسل منجمد"], "mechanisms": []}),
        _node("preparation-012-n040", "خارج کردن کنار شینسل منجمد")],
        edges=[{"from": "preparation-012-n039", "to": "preparation-012-n040",
                "label": "در صورت رسیدن روز پخت"},
               {"from": "preparation-012-n040", "to": "preparation-012-n999"}])
    text = render_process_file([doc])
    assert text.startswith("# preparation-012 · فرایند preparation-012\n\nخلاصه\n")
    assert "## preparation-012-n039 · انتقال کنار شینسل خام به سردخانه" in text
    assert "مجری: مسئول لاین مرغ" in text
    assert "در غذای پرسنل مصرف نمی‌شود." in text
    assert "ورودی: کنار شینسل خام  خروجی: کنار شینسل منجمد" in text
    assert "کنترل:" not in text                     # an empty ICOM list prints nothing
    assert "بعدی: «خارج کردن کنار شینسل منجمد» — در صورت رسیدن روز پخت" in text
    assert "بعدی: «preparation-012-n999»" in text    # a missing target prints its id


def test_a_long_description_is_folded_under_the_line_bound():
    doc = _process("cooking-001", [_node("cooking-001-n001", "گام",
                                         description="کلمه " * 800)])
    assert max(map(len, render_process_file([doc]).splitlines())) <= MAX_LINE


def test_one_file_per_department_and_tombstoned_or_broken_processes_skipped(tmp_path):
    _write(tmp_path, "preparation",
           _process("preparation-001", [_node("preparation-001-n001", "الف")]))
    _write(tmp_path, "preparation",
           _process("preparation-002", [_node("preparation-002-n001", "ب")],
                    tombstoned=True))
    _write(tmp_path, "warehouse",
           _process("warehouse-001", [_node("warehouse-001-n001", "ج")],
                    tombstoned=True))
    (tmp_path / "departments" / "preparation" / "processes"
     / "preparation-003.json").write_text("{", encoding="utf-8")
    run = tmp_path / "runs" / "facts" / "preparation" / "20260929-100000"
    files = write_process_files(tmp_path, run)
    assert files == {"preparation":
                     "runs/facts/preparation/20260929-100000/processes/preparation.md"}
    text = (run / "processes" / "preparation.md").read_text(encoding="utf-8")
    assert "preparation-001" in text and "preparation-002" not in text
    assert process_file_map(tmp_path, run) == files


def test_a_stale_department_file_is_removed_on_rewrite(tmp_path):
    run = tmp_path / "runs" / "facts" / "preparation" / "20260929-100000"
    (run / "processes").mkdir(parents=True)
    (run / "processes" / "warehouse.md").write_text("کهنه", encoding="utf-8")
    _write(tmp_path, "preparation",
           _process("preparation-001", [_node("preparation-001-n001", "الف")]))
    write_process_files(tmp_path, run)
    assert not (run / "processes" / "warehouse.md").exists()


def test_the_node_index_spans_every_department(tmp_path):
    _write(tmp_path, "preparation",
           _process("preparation-001", [_node("preparation-001-n001", "الف")]))
    _write(tmp_path, "warehouse",
           _process("warehouse-005", [_node("warehouse-005-n002", "ب")]))
    assert {(r["process"], r["node"]) for r in process_index(tmp_path)} == {
        ("preparation-001", "preparation-001-n001"),
        ("warehouse-005", "warehouse-005-n002")}
    assert [r["process"] for r in process_index(tmp_path, "warehouse")] == \
        ["warehouse-005"]
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_processes.py -q`
Expected: FAIL — `ImportError: cannot import name 'process_file_map'` (and the others).

- [ ] **Step 3: Implement**

In `engine/facts_plan/build.py`, replace the whole `process_index` function (`:1313-1336`) with:

```python
#: A step's four IDEF0 lists, in the order and the words a unit reads them.
ICOM_FA = (("inputs", "ورودی"), ("controls", "کنترل"),
           ("outputs", "خروجی"), ("mechanisms", "سازوکار"))

#: `{run_dir}/processes/<department>.md` (spec 2026-09-29 §5.1).
PROCESSES_DIR = "processes"


def process_departments(root):
    """Every department that has a `processes/` directory, sorted — the
    registry is not asked, so a department the owner has not named yet still
    has its steps read."""
    base = pathlib.Path(root) / "departments"
    if not base.is_dir():
        return []
    return sorted(p.name for p in base.iterdir() if (p / "processes").is_dir())


def process_docs(root, department):
    """The department's process documents, by file name — a half-written file
    is no department's stop, and a tombstoned process is history, not content
    (I3; `merge.tombstone` is the only writer of the flag)."""
    out = []
    directory = pathlib.Path(root) / "departments" / department / "processes"
    for path in sorted(directory.glob("*.json")):
        try:
            doc = read_json(path)
        except (OSError, ValueError):
            continue
        if not doc.get("tombstoned"):
            out.append(doc)
    return out


def process_index(root, department=None):
    """`{process, node, label}` for every labelled step — of one department,
    or of every department when `department` is None, which is what a
    citation is checked against since a unit may read any department's
    processes (spec 2026-09-29 §8)."""
    departments = [department] if department else process_departments(root)
    return [{"process": doc["id"], "node": node["id"], "label": node["label"]}
            for d in departments for doc in process_docs(root, d)
            for node in doc.get("nodes") or [] if node.get("label")]


def department_names(root):
    """`{code: Persian name}` off the registry; `{}` when it cannot be read —
    a missing name falls back to the code, never stops a build."""
    try:
        registry = read_json(pathlib.Path(root) / "departments" / "registry.json")
    except (OSError, ValueError):
        return {}
    return {d["code"]: d["name"] for d in registry.get("departments") or []
            if d.get("code") and d.get("name")}


def render_process_file(docs):
    """One department's corrected processes as a unit reads them whole (spec
    2026-09-29 §5.1): per process its name and summary; per step its id and
    label, who does it, the description, the non-empty ICOM lists, and one
    `بعدی:` line per outgoing edge with the edge's condition — the diagram the
    process engineer corrected. Positions, layout and sources are left out."""
    out = []
    for doc in docs:
        out += [f'# {doc["id"]} · {doc.get("name") or ""}'.rstrip(), ""]
        if doc.get("summary"):
            out += _wrap(doc["summary"]) + [""]
        nodes = doc.get("nodes") or []
        label = {n["id"]: n.get("label") or n["id"] for n in nodes}
        outgoing = collections.defaultdict(list)
        for edge in doc.get("edges") or []:
            outgoing[edge.get("from")].append(edge)
        for node in nodes:
            out.append(f'## {node["id"]} · {node.get("label") or ""}'.rstrip())
            if node.get("actor"):
                out.append(f'مجری: {node["actor"]}')
            if node.get("description"):
                out += _wrap(node["description"])
            icom = node.get("icom") or {}
            parts = [f'{fa}: {"، ".join(map(str, icom[key]))}'
                     for key, fa in ICOM_FA if icom.get(key)]
            if parts:
                out += _wrap("  ".join(parts))
            for edge in outgoing.get(node["id"], []):
                target = label.get(edge.get("to"), edge.get("to"))
                out.append(f"بعدی: «{target}»"
                           + (f' — {edge["label"]}' if edge.get("label") else ""))
            out.append("")
    return "\n".join(out)


def _shown_path(root, path):
    """A run file as a unit is told it: relative to the data root when it lies
    under it (the playbook's `runs/facts/…`), else as given."""
    try:
        return str(pathlib.Path(path).resolve()
                   .relative_to(pathlib.Path(root).resolve()))
    except ValueError:
        return str(path)


def write_process_files(root, run_dir):
    """Spec 2026-09-29 §5.1 — every department's file into the run, a file of
    a department with no active process removed, and the mapping a unit's
    `## فرایندها` section prints."""
    directory = pathlib.Path(run_dir) / PROCESSES_DIR
    written = {}
    for department in process_departments(root):
        docs = process_docs(root, department)
        if not docs:
            continue
        path = directory / f"{department}.md"
        write_text_atomic(path, render_process_file(docs))
        written[department] = _shown_path(root, path)
    for stale in directory.glob("*.md") if directory.is_dir() else []:
        if stale.stem not in written:
            stale.unlink()
    return written


def process_file_map(root, run_dir):
    """What `write_process_files` left in the run, read back — for a re-render
    that must not rewrite a file a unit may already be reading."""
    directory = pathlib.Path(run_dir) / PROCESSES_DIR
    return {p.stem: _shown_path(root, p) for p in sorted(directory.glob("*.md"))}
```

`_wrap` is defined further down the module; Python resolves it at call time, so the order is fine.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_processes.py -q`
Expected: `5 passed`. Then `../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate"` — expected: all pass (nothing calls the new functions yet; `process_index(root, dept)` keeps its old meaning).

- [ ] **Step 5: Commit**

```bash
git add engine/facts_plan/build.py engine/tests/test_facts_plan_processes.py
git commit -m "feat(facts-plan): render every department's corrected processes (steps, actors, ICOM, edges and their conditions) into the run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phase-1 units read the processes, not the talk

**Files:**
- Modify: `engine/facts_plan/build.py` — `render_input` (`:2276-2322`), `_renderer` (`:2684-2756`), `refresh_inputs` (`:2836-2882`), `render_phase2_inputs` (`:2812-2833`), `build` (`:2885-2953`); delete `TALK_BUDGET`, `TALK_WINDOW`, `TALK_STEP`, `TALK_HEADING` (`:1422-1424`, keep `RECORDED_BUDGET`/`RECORDED_HEADING`), `anchor_tokens`, `related_talk`, `talk_section` (`:2354-2446`)
- Modify: `engine/facts_plan/assemble.py` — the node index (`:434`), `_shown` (`:941-958`), `_unit_accounts` (`:985-1004`, delete) and its call (`:463`, `:477-478`), `_entry`'s unit-account block (the `if written.get("accounts"):` block and the form-side loop after it, `:1880-1912`), `_process_sources` (`:1589-1601`)
- Modify: `engine/tests/test_facts_plan_fixture.py` (`_build` gains `setup=None`)
- Test: `engine/tests/test_facts_plan_processes.py` (append), `engine/tests/test_facts_plan_assemble.py` (append); delete the talk and unit-account tests listed in Step 6

**Interfaces:**
- Consumes: `write_process_files`, `process_file_map`, `department_names`, `process_index(root)` (Task 2).
- Produces:
  - `PROCESSES_HEADING = "## فرایندها"`
  - `processes_section(department, files, names, others=True) -> list[str]`
  - `_renderer(root, department, estate, skeleton, rendered, conventions=DEFAULT_CONVENTIONS, process_files=None)` → `render(unit, *, recorded=None) -> str` (no `render.full`, no `recordings` parameter)
  - test helper `test_facts_plan_fixture._build(tmp_path, setup=None)` — `setup(root)` runs before `build`

- [ ] **Step 1: Give the fixture builder a setup hook**

In `engine/tests/test_facts_plan_fixture.py`, change `def _build(tmp_path):` to `def _build(tmp_path, setup=None):` and, immediately before `build(root, "cooking", run, ["transcript"])`, add:

```python
    if setup:
        setup(root)
```

- [ ] **Step 2: Write the failing tests**

Append to `engine/tests/test_facts_plan_processes.py`:

```python
from test_facts_plan_fixture import _build


def test_a_form_units_input_lists_the_process_files_and_no_talk(tmp_path):
    def setup(root):
        _write(root, "cooking", _process("cooking-001", [_node("cooking-001-n001", "الف")]))
        _write(root, "warehouse", _process("warehouse-001", [_node("warehouse-001-n001", "ب")]))
    _root, run, _skeleton, plan = _build(tmp_path, setup=setup)
    unit = next(u for u in plan["units"] if u["type"] == "workbook")
    text = (run / "units" / unit["id"] / "input.md").read_text(encoding="utf-8")
    assert "## فرایندها" in text
    assert "runs/facts/cooking/20260906-101500/processes/cooking.md" in text
    # the fixture's registry names only cooking: another department falls back to its code
    assert "runs/facts/cooking/20260906-101500/processes/warehouse.md · warehouse" in text
    assert "گفت‌وگوهای مرتبط" not in text and "## گره‌های فرایند" not in text
    assert (run / "processes" / "warehouse.md").is_file()
    assert "talk" not in unit
    transcript = next(u for u in plan["units"] if u["type"] == "transcript")
    text = (run / "units" / transcript["id"] / "input.md").read_text(encoding="utf-8")
    assert "processes/cooking.md" in text and "processes/warehouse.md" not in text
```

Append to `engine/tests/test_facts_plan_assemble.py`:

```python
def test_a_citation_to_another_departments_step_is_kept_with_its_own_path(tmp_path):
    root = _root(tmp_path)
    directory = root / "departments" / "warehouse" / "processes"
    directory.mkdir(parents=True)
    (directory / "warehouse-005.json").write_text(json.dumps(
        {"id": "warehouse-005", "edges": [],
         "nodes": [{"id": "warehouse-005-n002", "label": "ثبت تحویل"}]},
        ensure_ascii=False), encoding="utf-8")
    record = _record_out()
    record["decisions"][0]["processes"] = [
        {"process": "warehouse-005", "node": "warehouse-005-n002", "quote": "ثبت تحویل"}]
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    entry = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    cited = [{k: s[k] for k in ("type", "ref", "node") if k in s}
             for s in entry["source"] if s["type"] == "process"]
    assert cited == [{"type": "process", "node": "warehouse-005-n002",
                      "ref": "departments/warehouse/processes/warehouse-005.json"}]


def test_an_account_a_unit_writes_is_dropped_by_the_gate(tmp_path):
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["accounts"] = [
        {"path": "data/cadence", "value": "shift",
         "source": {"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "1-5"}}]
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert all("accounts" not in e for e in delta["entries"])
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_processes.py tests/test_facts_plan_assemble.py -q -k "process_files_and_no_talk or another_departments_step or account_a_unit_writes"`
Expected: 3 FAIL (no `## فرایندها`; the citation dropped as «in no process of cooking»; the account kept).

- [ ] **Step 4: Build side**

In `build.py`:

1. Delete `TALK_BUDGET`, `TALK_WINDOW`, `TALK_STEP`, `TALK_HEADING` (keep `RECORDED_BUDGET, RECORDED_HEADING`; Task 5 changes the budget), and the functions `anchor_tokens`, `related_talk`, `talk_section`. Keep `transcripts()` — `_chunks` still reads it; fix its docstring to say only `_chunks` reads it.

2. Add, next to `render_input`:

```python
PROCESSES_HEADING = "## فرایندها"


def processes_section(department, files, names, others=True):
    """Spec 2026-09-29 §5.3 — where a unit reads the corrected processes: its
    own department's file whole; another department's when the table's items
    or columns appear there (a phase-2 unit is given its own only)."""
    lines = [PROCESSES_HEADING, ""]
    own = files.get(department)
    lines += (["فرایندهای این بخش — همه را کامل بخوانید:", f"  {own}"] if own
              else ["این بخش هنوز فرایند فعالی ندارد."])
    rest = [d for d in sorted(files) if d != department]
    if others and rest:
        lines += ["فرایندهای بخش‌های دیگر — اگر اقلام یا ستون‌های این جدول در آن‌ها "
                  "آمده، بخوانید:"]
        lines += [f"  {files[d]} · {names.get(d, d)}" for d in rest]
    return lines
```

3. In `render_input`: delete the two `talk` lines (`if extras.get("talk"): out += ["", talk_section(extras["talk"])]`); remove `("## گره‌های فرایند", "processes")` from the `for title, key in (…)` tuple; directly after that loop add:

```python
    if extras.get("processes"):
        out += [""] + list(extras["processes"])
```

4. Replace `_renderer` with:

```python
def _renderer(root, department, estate, skeleton, rendered,
              conventions=DEFAULT_CONVENTIONS, process_files=None):
    """`render(unit, *, recorded=None) -> input.md`, closed over the estate,
    the store slice and the run's process files so `plan_units` can re-render
    a unit it splits without reading any of them again. What `fits` checks is
    exactly what the unit is handed: the process files are files of their own
    (spec 2026-09-29 §5.3), never part of `input.md`."""
    index = _store_slice(root)
    names = department_names(root)
    files = process_files or {}
    sections = library_sections(estate)
    own = [{"id": c["id"], "kind": c["kind"], "label": label_of(c)}
           for c in skeleton["candidates"] if c["kind"] == "record"]
    instance_by_key = {i["key"]: i for i in skeleton["instances"]}
    by_id = {c["id"]: c for c in skeleton["candidates"]}

    def render(unit, *, recorded=None):
        mine = [by_id[c] for c in unit["candidates"] if c in by_id]
        sids = sorted({instance_by_key[k]["spreadsheetId"]
                       for c in mine for k in candidate_instances(c)
                       if k in instance_by_key})
        text = _unit_text(root, unit)
        tokens = _tokens(" ".join([label_of(c) for c in mine] + [text]))
        phase = unit.get("phase", PHASE_OF[unit["type"]])
        rendered[unit["id"]] = render_input(unit, skeleton, {
            "text": text,
            "functions": called_bodies(
                sections, {name for c in mine
                           for name in (c.get("render") or {}).get("calls") or []}),
            "context": context_items(estate, sids),
            "field_tables": _field_tables(unit, skeleton),
            "reuse": (recorded if recorded is not None
                      else reuse_slice(own, index, department, tokens)),
            "processes": processes_section(department, files, names,
                                           others=phase == 1)}, conventions,
            recorded=recorded is not None)
        return rendered[unit["id"]]

    return render
```

5. `build`: before `rendered = {}` add `process_files = write_process_files(root, run_dir)`; call `_renderer(root, department, estate, skeleton, rendered, conventions, process_files)`; in the inputs loop write `render(unit)` instead of `render.full(unit)`; delete the two comments about `render.full`.

6. `render_phase2_inputs`: build the renderer as `_renderer(root, skeleton["department"], load_estate(root), skeleton, {}, load_conventions(root), process_file_map(root, run_dir))`.

7. `refresh_inputs`: build the renderer with `write_process_files(root, run_dir)` as `process_files`; replace the loop and the `talk_before` bookkeeping with:

```python
    over = []
    for unit in units:
        text = render(unit, recorded=recorded.get(unit["id"]))
        write_text_atomic(run_dir / "units" / unit["id"] / "input.md", text)
        if not fits(unit, text):
            over.append(unit["id"])
            print(f'facts-plan: {unit["id"]} input over budget '
                  f'({estimate_tokens(text)})', file=sys.stderr)
    return {"refreshed": len(units), "over_budget": over}
```

(`recorded` is `{}` for a phase-1 unit, so `.get` gives `None` and the unit gets its reuse slice, exactly as before.)

8. `_plan_recordings` and its docstring stay (they still serve `_chunks`-ordering questions); remove its sentence about `related_talk`.

- [ ] **Step 5: Assembly side**

In `assemble.py`:

1. Line `:434`: `nodes = process_index(root)` (every department). In `_repair`'s A23 note (`:213-215`), change the message to `f'node {citation.get("node")} is in no active process; citation dropped'`.

2. `_shown`: drop the talk half — the body becomes:

```python
    out = []
    for ref in (unit or {}).get("inputs") or []:
        rel, _, span = ref.partition("#")
        bounds = re.fullmatch(r"L([0-9]+)-L([0-9]+)", span)
        if bounds and rel.startswith(TRANSCRIPT_DIR) and rel.endswith(TRANSCRIPT_EXT):
            out.append({"rel": rel, "first": int(bounds.group(1)),
                        "last": int(bounds.group(2))})
    return out
```

and its docstring says: a transcript unit may cite only lines of its own excerpt (spec 2026-09-29 §8); a form unit is shown no talk.

3. Delete `_unit_accounts`; in `_judge_doc` delete `accounts = _unit_accounts(item, ctx["talk"])` and `if accounts: item["accounts"] = accounts`, and the comment above them that speaks of holding accounts over A7. `accounts` is in `ENGINE_OWNED`, so `_repair`'s A7 now strips any a unit writes.

4. In `_entry`, delete the block that starts `if written.get("accounts"):` through the loop that appends the form's own side (`for account in list(entry["accounts"]): … _account(account["field"], {"value": mine, "source": sources[0]})`).

5. `_process_sources`: build the `ref` from the process id's own department prefix:

```python
        source = {"type": "process",
                  "ref": f'departments/{citation["process"].rsplit("-", 1)[0]}/'
                         f'processes/{citation["process"]}.json',
                  "node": citation["node"]}
```

(the `department` parameter becomes unused — remove it and its argument at the call site).

- [ ] **Step 6: Delete the tests whose subject is gone, keep the rest green**

Delete these tests (their subject — related talk or a unit-written account — no longer exists):
- `tests/test_facts_plan_build.py`: `test_related_talk_takes_the_windows_that_name_the_form_and_merges_touching_ones`, `test_related_talk_is_cut_at_the_budget_best_window_first`, `test_the_talk_budget_is_not_halved_by_overlapping_windows`, `test_the_talk_section_heads_each_passage_with_the_date_and_lines`, `test_anchor_tokens_come_from_titles_columns_aliases_and_attachment_heads`, `test_a_form_units_input_ends_with_the_talk_and_the_fit_check_ignores_it`, `test_a_passage_heading_names_the_transcript_an_account_must_cite`, `test_the_plan_records_the_passages_each_unit_was_shown`, `test_each_part_of_a_split_form_unit_gets_its_own_talk`.
- `tests/test_unit_gate_tiers.py`: `test_a_units_voice_account_is_kept_open_and_the_form_value_stays_primary`, `test_an_account_citing_a_passage_the_unit_was_not_shown_is_dropped`, `test_an_account_whose_source_is_not_a_chosen_transcript_is_dropped_silently`, `test_a_transcript_units_account_cites_the_excerpt_it_was_handed`, `test_a_transcript_units_account_outside_its_excerpt_is_dropped`, `test_a_form_unit_is_bound_by_its_passages_and_not_by_its_files`.
- `tests/test_facts_plan_assemble.py`: `test_a_units_account_reaches_the_delta_and_apply_takes_it`, `test_an_account_is_kept_when_it_cites_a_passage_the_unit_was_shown`, `test_an_account_citing_talk_the_unit_never_read_is_dropped`, `test_a_units_account_is_two_sided_so_the_owner_may_keep_the_form`.

Rewrite, keeping their subject:
- `tests/test_facts_plan_assemble.py` `test_a_voice_source_joins_the_form_on_the_entry` and `test_a_voice_source_outside_the_shown_passages_is_dropped`, and `_plan_with_talk`: a voice citation is now admitted only inside a transcript unit's own excerpt — build the plan with the unit's `inputs` = `[f"{TR_REL}#L213-L252"]` instead of a `talk` list, keep the same line numbers and assertions.
- `tests/test_facts_plan_status.py` `test_a_refresh_keeps_the_talk_and_what_phase_one_recorded` → rename `test_a_refresh_keeps_what_phase_one_recorded`; delete its talk assertions, keep the recorded-section ones.
- Any other test the run below reports failing on `render.full`, `unit["talk"]`, `unit["nodes"]` being non-empty, `## گره‌های فرایند`, or `_renderer(..., recordings=…)`: update it to the new shape (`render(unit)`, no `talk`, `nodes == []`, `## فرایندها`, `process_files=`). Do not weaken an assertion whose subject still exists.

- [ ] **Step 7: Run everything related**

Run: `cd engine && ../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate or facts_evidence"`
Expected: all pass, including the three new tests.

- [ ] **Step 8: Commit**

```bash
git add -A engine
git commit -m "feat(facts-plan): a form unit reads its department's processes whole — no related talk, no 40-label slice, no unit-written account; citations checked against every department

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One table per unit, and the photo groups

**Files:**
- Create: `schemas/photo-groups.schema.json`
- Modify: `engine/facts_plan/build.py` — `plan_units` (`:1628-1766`), `build`; add `IMAGE_EXTENSIONS`, `PHOTO_GROUPS`, `department_photos`, `_read_photo_groups`, `attachment_groups`
- Modify: `engine/facts_plan/cli.py` — `_stage` (`:208-219`) and its call in `status`
- Modify: `engine/tests/fixtures/facts-plan/expected.json`, `engine/tests/fixtures/facts-plan/units/*.json`, `engine/tests/fixtures/facts-plan/README.md`
- Test: `engine/tests/test_facts_plan_units.py` (append), `engine/tests/test_facts_plan_status.py` (append), `tests/test_facts_schema.py` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")`, `PHOTO_GROUPS = "photo-groups.json"`
  - `department_photos(root, department) -> list[str]` — data-root-relative photo paths, sorted
  - `attachment_groups(root, department, run_dir, texts) -> list[list[str]]` — sidecar paths per unit: photo groups first, then one per other served attachment
  - `plan_units(skeleton, groups, chunks, attachments, render=…, conventions=…, attachment_groups=None)` — `attachment_groups=None` means one unit per attachment
  - `status(...)["stage"]` may be `"G"`

- [ ] **Step 1: The schema and its test**

Create `schemas/photo-groups.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "photo-groups.schema.json",
  "title": "Photo groups — which of a department's form photos show one table (spec 2026-09-29 §6)",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "groups"],
  "properties": {
    "schema_version": { "const": 1 },
    "groups": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["photos"],
        "properties": {
          "photos": {
            "type": "array", "minItems": 1, "uniqueItems": true,
            "items": { "type": "string", "pattern": "^departments/[a-z]+/attachments/[^/]" }
          },
          "why": { "type": "string" }
        }
      }
    }
  }
}
```

Append to `tests/test_facts_schema.py`:

```python
def test_photo_groups_documents_validate(validate):
    good = {"schema_version": 1, "groups": [
        {"photos": ["departments/preparation/attachments/a.jpg",
                    "departments/preparation/attachments/b.jpg"], "why": "یک جدول"},
        {"photos": ["departments/preparation/attachments/c.jpg"]}]}
    assert validate("photo-groups.schema.json", good) == []
    assert validate("photo-groups.schema.json",
                    {"schema_version": 1, "groups": [{"photos": ["/abs/a.jpg"]}]}) != []
    assert validate("photo-groups.schema.json",
                    {"schema_version": 1, "groups": [{"photos": []}]}) != []
```

Run: `.venv/bin/pytest tests/test_facts_schema.py tests/test_all_schemas_selfvalid.py -q` (from the worktree root). Expected: pass.

- [ ] **Step 2: Write the failing engine tests**

Append to `engine/tests/test_facts_plan_units.py`:

```python
import json as _json

import pytest as _pytest

from facts_plan.build import attachment_groups, candidate_instances
from test_facts_plan_fixture import _build


def _photos(root, department, names):
    adir = root / "departments" / department / "attachments"
    (adir / ".text").mkdir(parents=True, exist_ok=True)
    for name in names:
        (adir / f"{name}.jpg").write_bytes(b"jpg-" + name.encode())
    return [f"departments/{department}/attachments/{n}.jpg" for n in names]


def _sidecars(department, names):
    return [f"departments/{department}/attachments/.text/{n}.image.md" for n in names]


def test_every_workbook_unit_holds_one_tab(tmp_path):
    _root, _run, skeleton, plan = _build(tmp_path)
    sheet_of = {i["key"]: i["sheetId"] for i in skeleton["instances"]}
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    for unit in plan["units"]:
        if unit["type"] != "workbook":
            continue
        tabs = {min((sheet_of.get(k, 0) for k in candidate_instances(by_id[c])),
                    default=0) for c in unit["candidates"]}
        assert len(tabs) == 1, unit["id"]


def test_photos_are_grouped_as_the_grouping_says(tmp_path):
    photos = _photos(tmp_path, "preparation", ["a", "b", "c"])
    texts = _sidecars("preparation", "abc") + [
        "departments/preparation/attachments/.text/f.pdf.md"]
    run = tmp_path / "run"
    run.mkdir()
    (run / "photo-groups.json").write_text(_json.dumps({"schema_version": 1, "groups": [
        {"photos": photos[:2], "why": "یک جدول"}, {"photos": photos[2:]}]}),
        encoding="utf-8")
    assert attachment_groups(tmp_path, "preparation", run, texts) == \
        [texts[:2], [texts[2]], [texts[3]]]


@_pytest.mark.parametrize("groups", [None, "{", [["a"], ["a", "b", "c"]],
                                     [["a", "b"]], [["a", "b", "c", "x"]]])
def test_an_unusable_grouping_gives_every_photo_its_own_unit(tmp_path, groups, capsys):
    _photos(tmp_path, "preparation", ["a", "b", "c"])
    texts = _sidecars("preparation", "abc")
    run = tmp_path / "run"
    run.mkdir()
    if groups == "{":
        (run / "photo-groups.json").write_text("{", encoding="utf-8")
    elif groups is not None:
        (run / "photo-groups.json").write_text(_json.dumps({"schema_version": 1, "groups": [
            {"photos": [f"departments/preparation/attachments/{n}.jpg" for n in g]}
            for g in groups]}), encoding="utf-8")
    assert attachment_groups(tmp_path, "preparation", run, texts) == [[t] for t in texts]
    assert "one unit per photo" in capsys.readouterr().err
```

Append to `engine/tests/test_facts_plan_status.py`:

```python
def test_status_asks_for_the_photo_grouping_before_the_plan(tmp_path):
    adir = tmp_path / "departments" / "preparation" / "attachments"
    adir.mkdir(parents=True)
    (adir / "a.jpg").write_bytes(b"jpg")
    run = tmp_path / "runs" / "facts" / "preparation" / "20260929-100000"
    run.mkdir(parents=True)
    assert status(tmp_path, run)["stage"] == "G"
    (run / "photo-groups.json").write_text("{}", encoding="utf-8")
    assert status(tmp_path, run)["stage"] == "P"


def test_a_department_without_photos_goes_straight_to_the_plan(tmp_path):
    run = tmp_path / "runs" / "facts" / "preparation" / "20260929-100000"
    run.mkdir(parents=True)
    assert status(tmp_path, run)["stage"] == "P"
```

(If `status` is not yet imported in that file, import it: `from facts_plan.cli import status`.)

- [ ] **Step 3: Run them to see them fail**

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_units.py tests/test_facts_plan_status.py -q -k "one_tab or grouping or photo"`
Expected: FAIL (`attachment_groups` missing; workbook units hold several tabs; stage `P` instead of `G`).

- [ ] **Step 4: Implement the planner side**

In `build.py`, add near `_attachment_state` (it already imports from `extract_attachment` locally; do the same):

```python
#: The image files `extract-attachment` describes (its CONVERTERS' image rows).
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
#: Stage G's output (spec 2026-09-29 §6), in the run directory.
PHOTO_GROUPS = "photo-groups.json"


def department_photos(root, department):
    """The department's form photos, data-root-relative and sorted — what the
    group agent groups and what a grouping must cover exactly once."""
    from extract_attachment import find_attachments
    root = pathlib.Path(root)
    adir = root / "departments" / department / "attachments"
    return [str(p.relative_to(root)) for p in find_attachments(adir)
            if p.suffix.lower() in IMAGE_EXTENSIONS]


def _read_photo_groups(path, photos):
    """The group agent's grouping, or None when it cannot be used: missing,
    unparseable, off-schema, or not covering the department's photos exactly
    once (a photo twice, one missing, one that is not this department's)."""
    try:
        doc = read_json(path)
        validate("photo-groups.schema.json", doc)
    except (OSError, ValueError):
        return None
    groups = [list(group["photos"]) for group in doc["groups"]]
    if sorted(p for group in groups for p in group) != sorted(photos):
        return None
    return groups


def attachment_groups(root, department, run_dir, texts):
    """Phase 1's attachment units (spec 2026-09-29 §5.2): one per photo group,
    in the grouping's order, then one per other attachment. `texts` are the
    sidecars `_attachment_state` serves; a photo whose text is not served is
    in no unit (it is already named unread). Without a usable grouping every
    photo is a unit of its own — never a stop."""
    from extract_attachment import cache_path
    root = pathlib.Path(root)
    adir = root / "departments" / department / "attachments"
    served = set(texts)
    photos = department_photos(root, department)
    sidecar = {}
    for rel in photos:
        side = str(cache_path(adir, root / rel).relative_to(root))
        if side in served:
            sidecar[rel] = side
    groups = _read_photo_groups(pathlib.Path(run_dir) / PHOTO_GROUPS, photos)
    if groups is None:
        if photos:
            print("facts-plan: no usable photo-groups.json; one unit per photo",
                  file=sys.stderr)
        groups = [[rel] for rel in photos]
    units = [[sidecar[p] for p in group if p in sidecar] for group in groups]
    taken = set(sidecar.values())
    return [u for u in units if u] + [[t] for t in texts if t not in taken]
```

Add `validate` to the `engine_common` import at the top of `build.py`.

In `plan_units`: add the keyword parameter `attachment_groups=None` and document it in the docstring (one unit per group; `None` means one per attachment). Replace the whole `packed = None … units.append(packed)` loop with:

```python
    for n, group in enumerate(attachment_groups if attachment_groups is not None
                              else [[path] for path in attachments], start=1):
        units.append({"id": f"u-att-{n}", "type": "attachment",
                      "phase": PHASE_OF["attachment"], "inputs": list(group),
                      "candidates": [], "nodes": [], "est_tokens_in": 0,
                      "est_tokens_out": 0})
```

and in the final `for unit in units:` loop replace `out += [unit] if fits(unit, text) else split_unit(…)` with:

```python
        if unit["type"] == "workbook" and len(_axis_parts(unit, skeleton,
                                                          conventions)) > 1:
            # Spec 2026-09-29 §5.2: one table per unit — a workbook splits by
            # tab always, not only over budget; each part is fitted as before.
            out += split_unit(unit, skeleton, render, conventions)
        else:
            out += [unit] if fits(unit, text) \
                else split_unit(unit, skeleton, render, conventions)
```

The F4 invariant below is unchanged: a grouping covers every served attachment exactly once.

In `build`, pass the grouping:

```python
    units = plan_units(skeleton, workbook_groups(…unchanged…), chunks, attachments,
                       render=render, conventions=conventions,
                       attachment_groups=attachment_groups(root, department,
                                                           run_dir, attachments))
```

- [ ] **Step 5: Stage G in `status`**

In `cli.py`:

```python
def _needs_groups(root, run_dir):
    """Stage G (spec 2026-09-29 §6): the department has photos and the run no
    grouping yet. The department is the run directory's parent's name."""
    from facts_plan.build import PHOTO_GROUPS, department_photos
    department = pathlib.Path(run_dir).resolve().parent.name
    return (bool(department_photos(root, department))
            and not (pathlib.Path(run_dir) / PHOTO_GROUPS).is_file())


def _stage(root, run_dir, plan, states):
    """The resume ladder of §6, by artefact presence — nothing is recorded."""
    if plan is None:
        return "G" if _needs_groups(root, run_dir) else "P"
    …the rest unchanged…
```

and in `status` call `_stage(root, run_dir, plan, states)`.

- [ ] **Step 6: Migrate the frozen fixture to the new unit ids**

The cooking fixture's workbook units now split by tab (a probe on 2026-09-29 gave 31 workbook units + 1 transcript unit; e.g. `u-wb-fried` → `u-wb-fried-s1`, `u-wb-fried-s2`; `u-wb-mavade_avalie` → `-s1…-s12`). Write this throwaway script to your scratchpad (never into the repo) and run it once from `engine/` with `../.venv/bin/python <script>`:

```python
"""One-off: re-home the frozen unit outputs and expected.json on the new plan."""
import json
import pathlib
import re
import sys
import tempfile

sys.path.insert(0, "tests")
from test_facts_plan_fixture import FIX, _build  # noqa: E402

_root, _run, _skeleton, plan = _build(pathlib.Path(tempfile.mkdtemp()))
unit_of = {c: u["id"] for u in plan["units"] for c in u["candidates"]}
for path in sorted((FIX / "units").glob("*.json")):
    doc = json.loads(path.read_text(encoding="utf-8"))
    old = doc["unit"]
    parts = {}
    for decision in doc["decisions"]:
        parts.setdefault(unit_of[decision["skeleton"]], []).append(decision)
    new_home = {}
    for n, _entry in enumerate(doc.get("new") or []):
        handle = f"N-{old}-{n}"
        user = next(u for u, ds in parts.items() if handle in json.dumps(ds))
        new_home[n] = user
    for unit, decisions in parts.items():
        mine = [(n, e) for n, e in enumerate(doc.get("new") or []) if new_home[n] == unit]
        renum = {f"N-{old}-{n}": f"N-{unit}-{i}" for i, (n, _e) in enumerate(mine)}
        text = json.dumps({"schema_version": 1, "unit": unit, "attempt": doc["attempt"],
                           "decisions": decisions, "new": [e for _n, e in mine]},
                          ensure_ascii=False, indent=2)
        for a, b in renum.items():
            text = re.sub(re.escape(a) + r"\b", b, text)
        (FIX / "units" / f"{unit}.json").write_text(text + "\n", encoding="utf-8")
    path.unlink()
expected = json.loads((FIX / "expected.json").read_text(encoding="utf-8"))
expected["units"] = [{"id": u["id"], "type": u["type"], "candidates": len(u["candidates"]),
                      "est_tokens_in": u["est_tokens_in"],
                      "est_tokens_out": u["est_tokens_out"]} for u in plan["units"]]
(FIX / "expected.json").write_text(json.dumps(expected, ensure_ascii=False, indent=1) + "\n",
                                   encoding="utf-8")
```

Then: in `README.md` update the «The two unit outputs» section to name the new files (`ls tests/fixtures/facts-plan/units`), and fix every test that names an old unit id (`grep -rn "u-wb-fried\b\|u-wb-mavade_avalie\b\|u-wb-fried\"" tests`) to the new id holding that candidate. `git diff --stat tests/fixtures` must show only `units/`, `expected.json`, `README.md`.

- [ ] **Step 7: Rewrite the packing tests**

`tests/test_facts_plan_build.py` `test_attachments_pack_to_the_budget_and_a_huge_one_goes_alone` → rename `test_each_attachment_is_a_unit_and_a_huge_one_is_named`: with `attachment_groups=None` every attachment is its own `u-att-<n>` unit, and an over-budget one still gets its `oversized` issue. `tests/test_facts_plan_units.py` `test_an_attachment_unit_over_budget_is_named_rather_than_silent` keeps its assertion; adapt only its setup if it relied on packing.

- [ ] **Step 8: Run everything related**

Run: `cd engine && ../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate or facts_evidence"` and `.venv/bin/pytest tests/test_facts_schema.py tests/test_all_schemas_selfvalid.py -q` (worktree root).
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A engine schemas tests
git commit -m "feat(facts-plan): one table per unit — a workbook splits by tab always, photos follow the group agent's grouping (Stage G), one unit per other attachment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Phase 2 — fewer, larger transcript units that see phase 1 whole

**Files:**
- Modify: `engine/facts_plan/build.py` — constants (`:1415-1422`), `transcript_chunks` (`:1472`), `est_tokens_out` (`:1489`), `fits` (`:1529`), `recorded_slice` (`:2449-2485`)
- Modify: `engine/tests/fixtures/facts-plan/expected.json` (`estimator`, `units`), `engine/tests/test_facts_plan_fixture.py` (`test_the_fixture_freezes_the_engines_own_estimator`)
- Test: `engine/tests/test_facts_plan_build.py` (append)

**Interfaces:**
- Produces: `TRANSCRIPT_CHUNK = 70000`, `TRANSCRIPT_OUT_RATIO = 0.15`, `PHASE2_IN_BUDGET = 210000`, `RECORDED_BUDGET = 120000`; `recorded_slice(entries, store_rows, budget=RECORDED_BUDGET) -> list[str]` (same signature, whole entries).

- [ ] **Step 1: Write the failing tests**

Append to `engine/tests/test_facts_plan_build.py`:

```python
from facts_plan.build import fits, recorded_slice


def test_a_transcript_unit_is_held_to_its_own_budget():
    body = "ا" * 1400
    text = "\n".join([body] * 160)            # ≈ 150K tokens by the estimator
    assert fits({"type": "transcript", "est_tokens_out": 0}, text)
    assert not fits({"type": "workbook", "est_tokens_out": 0}, text)


def test_the_recorded_section_prints_every_phase_one_entry_whole():
    entries = [
        {"handle": "S-rec-000000000001", "kind": "record", "key": "list_morgh",
         "title": "لیست مرغ", "statement": "برگهٔ انبار " * 40,
         "data": {"medium": "paper",
                  "location": {"kept_at": "کمد انبار", "holder": "انباردار"},
                  "filled_by": "انباردار", "cadence": "روزانه",
                  "fields": [{"key": "vazn", "title": "وزن", "unit": "kg",
                              "description": "وزن تحویلی"}]}},
        {"handle": "N-u-att-1-0", "kind": "rule", "key": "r", "title": "قاعده",
         "statement": "متن کامل قاعده " * 30, "data": {}}]
    text = "\n".join(recorded_slice(entries, []))
    assert entries[0]["statement"].strip() in text        # not cut at 200 characters
    assert "پرکننده: انباردار" in text and "تناوب: روزانه" in text
    assert "کمد انبار" in text
    assert "ستون vazn (وزن، kg) — وزن تحویلی" in text
    assert entries[1]["statement"].strip() in text
```

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_build.py -q -k "own_budget or whole"` — expected: 2 FAIL.

- [ ] **Step 2: Implement**

Constants:

```python
IN_BUDGET, OUT_BUDGET = 50000, 20000    # owner 2026-09-15: core 50K; output stays the binding cap
MAX_LINES, MAX_LINE = 4500, 1900
EST_OUT = {"rule": 250, "script": 250}
#: Spec 2026-09-29 §5.4: phase 2 fills gaps in 2–3 units, not 10 — an excerpt
#: of 70K, a unit that writes little, and a budget of its own that holds the
#: excerpt and phase 1's entries whole.
TRANSCRIPT_CHUNK, TRANSCRIPT_OUT_RATIO = 70000, 0.15
PHASE2_IN_BUDGET, RECORDED_BUDGET = 210000, 120000
RECORDED_HEADING = "## آنچه تا کنون ثبت شده"
```

`def transcript_chunks(text, budget=TRANSCRIPT_CHUNK):` — body unchanged.

In `est_tokens_out`: `return total + (int(est_tokens_in * TRANSCRIPT_OUT_RATIO) if is_transcript else 0)`.

`fits`:

```python
def fits(unit, text):
    """A form unit against the 50K core, a transcript unit against its own
    budget (spec 2026-09-29 §5.4); the output cap and the Read tool's line
    bounds hold for both."""
    budget = PHASE2_IN_BUDGET if unit["type"] == "transcript" else IN_BUDGET
    lines = text.split("\n")
    return (estimate_tokens(text) <= budget
            and unit["est_tokens_out"] <= OUT_BUDGET
            and len(lines) <= MAX_LINES and max(map(len, lines)) <= MAX_LINE)
```

`recorded_slice`:

```python
def _recorded_lines(entry):
    """One phase-1 entry as a transcript unit reads it — whole (spec
    2026-09-29 §5.4): its handle line, its statement, and for a table where it
    is kept, who fills and approves it, how often, and every column."""
    data = entry.get("data") or {}
    lines = [" · ".join(p for p in [entry["handle"], entry["kind"],
                                    entry.get("key") or "", entry.get("title") or ""] if p)]
    if entry.get("statement"):
        lines += _wrap(f'  {entry["statement"]}')
    if entry["kind"] == "record":
        location = data.get("location") or {}
        where = [str(v) for v in [data.get("medium")]
                 + [location.get(k) for k in ("sheet", "system", "kept_at", "holder")] if v]
        if where:
            lines.append("  " + " · ".join(where))
        for label, key in (("پرکننده", "filled_by"), ("تأییدکننده", "approved_by"),
                           ("تناوب", "cadence")):
            if data.get(key):
                lines.append(f"  {label}: {data[key]}")
        for field in data.get("fields") or []:
            unit = f'، {field["unit"]}' if field.get("unit") else ""
            desc = f' — {field["description"]}' if field.get("description") else ""
            lines += _wrap(f'  ستون {field.get("key")} ({field.get("title") or ""}{unit}){desc}')
    return lines


def recorded_slice(entries, store_rows, budget=RECORDED_BUDGET):
    """Spec §3 phase 2, whole since 2026-09-29: every phase-1 entry as
    `_recorded_lines` prints it, then the store's rows as `reuse_slice` prints
    them. Cut at `budget` by whole entries, phase-1 entries first."""
    lines, spent = [], 0
    for entry in entries:
        block = _recorded_lines(entry)
        cost = estimate_tokens("\n".join(block)) + len(block)
        if spent + cost > budget:
            break
        lines += block
        spent += cost
    for row in store_rows:
        cost = estimate_tokens(row) + 1
        if spent + cost > budget:
            break
        lines.append(row)
        spent += cost
    return lines
```

- [ ] **Step 3: Freeze the new estimator**

In `expected.json` set `"transcript_ratio": 0.15` and add `"transcript_chunk": 70000`, `"phase2_in_budget": 210000`; re-run the `expected["units"]` part of Task 4's script (estimates moved). In `test_the_fixture_freezes_the_engines_own_estimator` import `PHASE2_IN_BUDGET, TRANSCRIPT_CHUNK` and add:

```python
    assert (limits["phase2_in_budget"], limits["transcript_chunk"]) == \
        (PHASE2_IN_BUDGET, TRANSCRIPT_CHUNK)
```

Update `test_every_unit_is_under_both_budgets_and_the_line_bound` to use `limits["phase2_in_budget"]` for a `transcript` unit. Update any test that pinned the old one-line recorded format (`test_a_recorded_record_says_what_it_is_and_where_it_is_kept`, `test_a_transcript_units_recorded_section_replaces_the_reuse_slice`) to the new lines — same facts, new layout.

- [ ] **Step 4: Run everything related**

Run: `cd engine && ../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate or facts_evidence"` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A engine
git commit -m "feat(facts-plan): phase 2 in 70K excerpts with its own 210K budget, writing little, and phase 1's entries shown whole

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `contradicted[]` — what a transcript says against a process is set aside

**Files:**
- Modify: `schemas/facts-unit.schema.json` (top-level `properties`)
- Modify: `engine/facts_plan/assemble.py` — `_judge_doc` (after the decisions/new loop), `_folded`, `_overlay`, `_collect`, `assemble` (the `assembly.json` write); add `_checked_contradiction`, `_named_contradictions`
- Test: `tests/test_facts_schema.py` (append), `engine/tests/test_facts_plan_assemble.py` (append)

**Interfaces:**
- Consumes: `process_departments`, `process_docs` (Task 2), `_cited`, `_shown` (Task 3).
- Produces: `assembly.json["contradicted"]`: list of `{claim, ref, lines, against, unit}` plus `process_name` and `node_label` (against a step) or `entry_title` (against a handle). Task 8 reads exactly these keys.

- [ ] **Step 1: Schema and its test**

In `schemas/facts-unit.schema.json` add to top-level `properties` (lenient on purpose — the gate checks each member and drops a bad one without refusing the unit):

```json
    "contradicted": { "type": "array", "items": { "type": "object" } }
```

Append to `tests/test_facts_schema.py`:

```python
def test_a_unit_may_set_contradicted_claims_aside(validate):
    doc = _unit_doc()
    doc["contradicted"] = [{"claim": "کنار شنیسل خام غذای پرسنل است",
                            "ref": "meetings/transcripts/p.txt", "lines": "3-4",
                            "against": {"process": "preparation-012",
                                        "node": "preparation-012-n039"}}]
    assert validate("facts-unit.schema.json", doc) == []
    doc["contradicted"] = ["نه یک شیء"]
    assert validate("facts-unit.schema.json", doc) != []
```

- [ ] **Step 2: Write the failing engine tests**

Append to `engine/tests/test_facts_plan_assemble.py`:

```python
def _claim(lines="2-3", against=None, ref="meetings/transcripts/c.txt"):
    return {"claim": "کنار شنیسل خام تنها برای غذای پرسنل است", "ref": ref,
            "lines": lines,
            "against": against or {"process": "cooking-001", "node": "cooking-001-n001"}}


def _with_step(root):
    (root / "departments" / "cooking" / "processes" / "cooking-001.json").write_text(
        json.dumps({"id": "cooking-001", "name": "تولید مرغ پیتزا", "edges": [],
                    "nodes": [{"id": "cooking-001-n001", "label": "انتقال به سردخانه"}]},
                   ensure_ascii=False), encoding="utf-8")


def _assembled(root, rule):
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    return json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))


def test_a_contradiction_reaches_the_assembly_with_its_names(tmp_path):
    root = _root(tmp_path)
    _with_step(root)
    rule = _rule_out()
    rule["contradicted"] = [_claim()]
    assert _assembled(root, rule)["contradicted"] == [dict(
        _claim(), unit="u-b", process_name="تولید مرغ پیتزا",
        node_label="انتقال به سردخانه")]


def test_a_short_node_id_is_read_as_its_process_step(tmp_path):
    root = _root(tmp_path)
    _with_step(root)
    rule = _rule_out()
    rule["contradicted"] = [_claim(against={"process": "cooking-001", "node": "n001"})]
    row = _assembled(root, rule)["contradicted"][0]
    assert row["against"] == {"process": "cooking-001", "node": "cooking-001-n001"}


def test_a_contradiction_against_a_recorded_entry_names_its_title(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["contradicted"] = [_claim(against={"ref": "S-rec-000000000001"})]
    row = _assembled(root, rule)["contradicted"][0]
    assert row["entry_title"] == "گزارش شبانهٔ لاین پیتزا"


@pytest.mark.parametrize("bad", [
    {"lines": "30-40"},                                    # outside the excerpt (L1-L20)
    {"ref": "meetings/transcripts/other.txt"},             # not the unit's transcript
    {"against": {"process": "cooking-001", "node": "cooking-001-n999"}},
    {"against": {"ref": "S-rec-999999999999"}},
    {"claim": "  "}])
def test_a_contradiction_the_engine_cannot_check_is_dropped(tmp_path, bad):
    root = _root(tmp_path)
    _with_step(root)
    rule = _rule_out()
    rule["contradicted"] = [dict(_claim(), **bad)]
    assert _assembled(root, rule)["contradicted"] == []
```

(`pytest` — add `import pytest` at the top of the file if it is not there.)

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_assemble.py -q -k contradiction` — expected: FAIL (`KeyError: 'contradicted'`).

- [ ] **Step 3: Implement**

In `assemble.py`:

```python
_NEW_HANDLE = re.compile(r"N-u-[a-z0-9_-]+-[0-9]+")


def _checked_contradiction(item, ctx):
    """Spec 2026-09-29 §8 — one set-aside claim the engine can check, or None
    (REPAIR, no note): a Persian sentence, lines inside this unit's own excerpt
    (the `voice` gate), and against either a live step — a short node id read
    as its process's — or a handle of this run."""
    if not (isinstance(item, dict) and isinstance(item.get("claim"), str)
            and item["claim"].strip()):
        return None
    if not _cited({"type": "voice", "ref": item.get("ref"),
                   "lines": item.get("lines")}, ctx["talk"]):
        return None
    against = item.get("against")
    if not isinstance(against, dict):
        return None
    if "process" in against:
        process, node = str(against.get("process")), str(against.get("node"))
        full = node if node.startswith(f"{process}-") else f"{process}-{node}"
        if f"{process}::{full}" not in ctx["node_ids"]:
            return None
        return dict(item, against={"process": process, "node": full})
    ref = against.get("ref")
    if isinstance(ref, str) and (ref in ctx["candidates"]
                                 or _NEW_HANDLE.fullmatch(ref)):
        return dict(item, against={"ref": ref})
    return None
```

In `_judge_doc`, after the `for where in ("decisions", "new"):` loop and before `if semantics:`:

```python
    doc["contradicted"] = [c for c in (_checked_contradiction(item, ctx)
                                       for item in doc.get("contradicted") or [])
                           if c]
```

In `_folded`, add `"contradicted": list(doc.get("contradicted") or [])` to the `out` dict. In `_overlay`, before `return out`, merge the two attempts without duplicates:

```python
    seen = set()
    out["contradicted"] = []
    for row in (first.get("contradicted") or []) + (later.get("contradicted") or []):
        key = json.dumps(row, ensure_ascii=False, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out["contradicted"].append(row)
```

In `_collect`: add `"contradicted": []` to the initial `state`, and in the per-unit loop:

```python
        state["contradicted"] += [dict(row, unit=unit["id"])
                                  for row in doc.get("contradicted") or []]
```

Add:

```python
def _named_contradictions(root, rows, entries):
    """Each set-aside claim with the names the report prints (spec 2026-09-29
    §9): the step's process name and label, or the phase-1 entry's title."""
    from facts_plan.build import process_departments, process_docs
    steps = {(doc["id"], node["id"]): (doc.get("name") or doc["id"],
                                        node.get("label") or node["id"])
             for department in process_departments(root)
             for doc in process_docs(root, department)
             for node in doc.get("nodes") or []}
    titles = {e["_skeleton"]: e["title"] for e in entries if e.get("_skeleton")}
    out = []
    for row in rows:
        against = row["against"]
        if "process" in against:
            name, label = steps.get((against["process"], against["node"]),
                                    (against["process"], against["node"]))
            out.append(dict(row, process_name=name, node_label=label))
        else:
            out.append(dict(row, entry_title=titles.get(against["ref"], "")))
    return out
```

and in `assemble` add to the `assembly.json` dict:

```python
                       "contradicted": _named_contradictions(
                           root, state.get("contradicted") or [], entries),
```

- [ ] **Step 4: Run everything related**

Run: `cd engine && ../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate or facts_evidence"` and `.venv/bin/pytest tests/test_facts_schema.py -q` (root) — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A engine schemas tests
git commit -m "feat(facts-plan): contradicted[] — a transcript claim against a process step or a recorded entry is set aside, checked and named in the assembly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The form is kept over the process over the meeting, and only judgeable disputes are asked

**Files:**
- Modify: `engine/facts_plan/assemble.py` — `_cross_unit` (`:2450-2496`), `_settle` (`:1511-1546`); add `FORM_SOURCES`, `_keeper_order`, `judgeable`
- Test: `engine/tests/test_facts_plan_assemble.py` (append)

**Interfaces:**
- Produces: `judgeable(path: str) -> bool`; `_keeper_order(entry) -> tuple`.

- [ ] **Step 1: Write the failing tests**

```python
from facts_plan.assemble import _keeper_order, judgeable


@pytest.mark.parametrize("path,expected", [
    ("title", False), ("data/fields/vazn/type", False), ("data/expr", False),
    ("data/lang", False), ("data/outputs/vazn/title", False),
    ("data/inputs/x/from/field", False), ("data/fields/vazn/key", False),
    ("data/filled_by", True), ("data/cadence", True), ("statement", True),
    ("data/outputs/vazn/range/min", True), ("data/outputs/vazn/value", True),
    ("data/outputs/vazn/per", True), ("data/fields/vazn/unit", True)])
def test_only_what_the_owner_can_judge_becomes_a_dispute(path, expected):
    assert judgeable(path) is expected


def test_the_keeper_is_the_form_then_the_process_then_the_meeting():
    def entry(kind, unit):
        return {"source": [{"type": kind}], "_unit": unit, "id": f"T-{unit}"}
    entries = [entry("voice", "u-a"), entry("process", "u-b"),
               entry("photo", "u-c"), entry("chat", "u-0")]
    assert [e["_unit"] for e in sorted(entries, key=_keeper_order)] == \
        ["u-c", "u-b", "u-0", "u-a"]


def test_a_column_type_two_sources_read_differently_is_no_dispute(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [_second_record(fields=[{"key": "masraf_elami", "title": "مصرف اعلامی",
                                           "type": "integer", "unit": "kg"}])]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    record = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert not record.get("accounts")
    assert record["data"]["fields"][0]["type"] == "number"      # the keeper's reading
```

Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_assemble.py -q -k "judge or keeper or column_type"` — expected: FAIL (import error, then an account on `…/type`).

- [ ] **Step 2: Implement**

```python
#: Spec 2026-09-29 §8 — what an entry was read off, strongest first: a form
#: (and everything a sheet carries), then a process step, then the meeting or
#: the chat.
FORM_SOURCES = frozenset({"sheet", "script", "comment", "validation", "cf",
                          "photo", "pdf", "docx"})


def _keeper_order(entry):
    """When two units mint one entry, the one read off a form is kept, then
    one read off a process, then the rest; ties by unit id, then id — today's
    order, which alone let a `u-tr-…` beat a `u-wb-…`."""
    kind = ((entry.get("source") or [{}])[0] or {}).get("type")
    rank = 0 if kind in FORM_SOURCES else 1 if kind == "process" else 2
    return (rank, entry.get("_unit") or "", entry.get("id") or "")


#: A leaf the owner cannot judge from a chat message (spec 2026-09-29 §8).
UNJUDGEABLE_LEAVES = frozenset({"title", "type", "expr", "lang", "key"})
FORMULA_MEMBERS = frozenset({"inputs", "outputs"})
FORMULA_JUDGEABLE = frozenset({"value", "range", "unit", "per"})


def judgeable(path):
    """Whether a disagreement at `path` is worth the owner's answer: never a
    title, a data type, a formula, its language or a key; inside a formula's
    inputs and outputs only a value, a range, a unit or its basis."""
    segs = path.split("/")
    if segs[-1] in UNJUDGEABLE_LEAVES:
        return False
    if len(segs) > 2 and segs[0] == "data" and segs[1] in FORMULA_MEMBERS:
        return any(s in FORMULA_JUDGEABLE for s in segs[3:])
    return True
```

In `_cross_unit`: `members.sort(key=_keeper_order)`, and in the disagreement loop, right after `if path not in mine or mine[path] == value: continue`, add:

```python
                if not judgeable(path):
                    continue            # the keeper's reading stands; nothing is asked
```

In `_settle`, make the `account` branch conditional:

```python
        if decision["resolution"] == "fix":
            set_path(entry, decision["field"], decision["value"])
        elif judgeable(decision["field"]):
            entry.setdefault("accounts", []).extend(
                _account(decision["field"], side) for side in flag["sides"])
```

(an unjudgeable `account` resolution leaves the keeper's value and still clears the flag below).

- [ ] **Step 3: Run everything related**

Run: `cd engine && ../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate or facts_evidence"` — expected: all pass (`test_two_sources_disagreeing_become_two_accounts` and `test_contradiction_account_writes_both_sides` still pass: `data/cadence` and `data/outputs/v/value` are judgeable).

- [ ] **Step 4: Commit**

```bash
git add -A engine
git commit -m "feat(facts-plan): the form is kept over the process over the meeting; a title, type, formula or key never becomes an owner question

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The report's closing section

**Files:**
- Modify: `engine/facts_plan/assemble.py` — `report` (`:3178-3271`); add `PERSIAN_MONTHS`, `_owner_date`, `_contradicted_block`
- Test: `engine/tests/test_facts_plan_report.py` (append)

**Interfaces:**
- Consumes: `assembly.json["contradicted"]` rows (Task 6 keys: `claim`, `ref`, `against`, `process_name`, `node_label`, `entry_title`).
- Produces: `_contradicted_block(rows) -> list[str]`, `_owner_date(recording) -> str`.

- [ ] **Step 1: Write the failing test**

```python
from facts_plan.assemble import _contradicted_block, _owner_date


def test_a_recording_is_named_by_its_date_in_words():
    assert _owner_date("preparation-1405-06-04") == "۴ شهریور ۱۴۰۵"
    assert _owner_date("preparation-1405-05-28-02") == "۲۸ مرداد ۱۴۰۵ (۲)"
    assert _owner_date("bez-tarikh") == "bez-tarikh"


def test_the_set_aside_claims_close_the_report_in_the_owners_words():
    rows = [
        {"claim": "کنار شنیسل خام تنها برای غذای پرسنل است",
         "ref": "meetings/transcripts/preparation-1405-06-04.txt", "lines": "210-218",
         "against": {"process": "preparation-012", "node": "preparation-012-n039"},
         "unit": "u-tr-x", "process_name": "تولید مرغ پیتزا",
         "node_label": "انتقال کنار شینسل خام به سردخانه"},
        {"claim": "وزن هر لقمه سی گرم است",
         "ref": "meetings/transcripts/preparation-1405-05-28-02.txt", "lines": "5",
         "against": {"ref": "S-rec-000000000001"}, "unit": "u-tr-y",
         "entry_title": "فرم تبدیل سینه مرغ"}]
    assert _contradicted_block(rows) == [
        "کنار گذاشته شد چون با فرایندها یا ثبت‌های همین اجرا نمی‌خواند:",
        "  • گفت‌وگوی ۴ شهریور ۱۴۰۵: «کنار شنیسل خام تنها برای غذای پرسنل است» — "
        "فرایند «تولید مرغ پیتزا»، گام «انتقال کنار شینسل خام به سردخانه» خلاف آن را می‌گوید.",
        "  • گفت‌وگوی ۲۸ مرداد ۱۴۰۵ (۲): «وزن هر لقمه سی گرم است» — "
        "با «فرم تبدیل سینه مرغ» نمی‌خواند.",
        ""]
    assert _contradicted_block([]) == []
    for line in _contradicted_block(rows):
        assert not re.search(r"__s|S-|N-|u-|/", line), line
```

(`import re` at the top if the file lacks it.) Run: `cd engine && ../.venv/bin/pytest tests/test_facts_plan_report.py -q -k "date_in_words or close_the_report"` — expected: FAIL (import error).

- [ ] **Step 2: Implement**

```python
PERSIAN_MONTHS = ("فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
                  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند")


def _owner_date(recording):
    """`preparation-1405-06-04-02` → «۴ شهریور ۱۴۰۵ (۲)» — the date in words,
    because the report admits no `/` (spec 2026-09-29 §9)."""
    m = re.search(r"([0-9]{4})-([0-9]{2})-([0-9]{2})(?:-0*([0-9]+))?$", recording)
    if not m or not 1 <= int(m.group(2)) <= 12:
        return recording
    text = (f"{_fa(int(m.group(3)))} {PERSIAN_MONTHS[int(m.group(2)) - 1]} "
            f"{_fa(int(m.group(1)))}")
    return text + (f" ({_fa(int(m.group(4)))})" if m.group(4) else "")


def _contradicted_block(rows):
    """Spec 2026-09-29 §9 — what the meetings said against a process step or a
    recorded entry, set aside, closing the report; nothing when nothing was."""
    if not rows:
        return []
    out = ["کنار گذاشته شد چون با فرایندها یا ثبت‌های همین اجرا نمی‌خواند:"]
    for row in rows:
        said = f'گفت‌وگوی {_owner_date(pathlib.Path(row["ref"]).stem)}'
        if "process" in row["against"]:
            tail = (f'فرایند «{row["process_name"]}»، گام «{row["node_label"]}» '
                    "خلاف آن را می‌گوید.")
        else:
            tail = f'با «{row.get("entry_title") or "ثبتی از همین اجرا"}» نمی‌خواند.'
        out.append(f'  • {said}: «{row["claim"].strip()}» — {tail}')
    out.append("")
    return out
```

In `report`, directly before `path = run_dir / "report.md"`:

```python
    out += _contradicted_block(assembly.get("contradicted") or [])
```

- [ ] **Step 3: Run everything related**

Run: `cd engine && ../.venv/bin/pytest tests/ -q -k "facts_plan or facts_acceptance or unit_gate or facts_evidence"` — expected: all pass (the acceptance test's leak check covers the report).

- [ ] **Step 4: Commit**

```bash
git add -A engine
git commit -m "feat(facts-plan): the report closes with what the meetings said against the processes, in the owner's words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The agent card, the playbook, and their lint (data-repo clone)

**Files (all in `<clone>`):**
- Modify: `.claude/agents/quantify.md`
- Modify: `.claude/skills/quantify/SKILL.md`
- Modify: `.claude/hooks/test_playbook_lint.py`

**Interfaces:**
- Consumes: the engine behaviour of Tasks 3–8 (`## فرایندها`, `contradicted[]`, Stage `G`, `photo-groups.json`).
- Produces: the card sentences the lint pins (below, verbatim).

- [ ] **Step 1: Update the lint first (the failing tests)**

In `.claude/hooks/test_playbook_lint.py`:

Replace `test_the_agent_reads_the_talk_beside_the_form_and_keeps_the_forms_value` with:

```python
def test_the_agent_reads_the_processes_whole_and_they_win_on_practice():
    agent = " ".join(AGENT.read_text(encoding="utf-8").split())
    assert "## فرایندها" in agent
    assert ("the table's columns, rows, printed titles and units are the file's or the "
            "photo's") in agent
    assert "where the processes and the form disagree on any of these, the processes win" in agent
    assert "read it in pages with `offset`/`limit` until the end" in agent
```

Replace `test_the_agent_cites_a_passage_by_the_path_in_its_heading` with:

```python
def test_a_transcript_unit_only_adds_and_sets_a_contradiction_aside():
    agent = " ".join(AGENT.read_text(encoding="utf-8").split())
    assert "**A transcript unit only adds.**" in agent
    assert '"contradicted": [' in agent
    assert "Never write an `account`." in agent
```

Replace `test_the_agent_knows_the_voice_list_and_its_shape` with:

```python
def test_a_transcript_unit_cites_the_lines_it_took_a_fact_from():
    agent = " ".join(AGENT.read_text(encoding="utf-8").split())
    assert ('"voice": [{"ref": "<your excerpt\'s transcript path>", "lines": "a-b"}]'
            ) in agent
```

Add:

```python
def test_group_mode_covers_every_photo_once():
    section = agent_section("`group` mode")
    assert "Every photo appears in exactly one group" in section
    assert "`{run_dir}/photo-groups.json`" in section


def test_stage_g_dispatches_once_and_never_repairs_the_grouping():
    text = " ".join(PLAYBOOK.read_text(encoding="utf-8").split())
    assert "## Stage G — Group the photos" in PLAYBOOK.read_text(encoding="utf-8")
    assert "Never write or repair `photo-groups.json` yourself." in text
```

Keep unchanged (the card must still contain these): `test_the_agent_attaches_speech_to_a_listed_table_before_describing_a_new_one` («## آنچه تا کنون ثبت شده», «describe a new table only when no listed table fits»), `test_review_mode_keeps_the_entry_read_off_a_form` («when two entries merge, the one read off a form is the keeper»), `test_the_agent_cites_the_file_an_entry_was_read_off`, `test_the_agent_looks_at_the_photo_for_structure_and_keeps_the_description`, `test_stage_u_*`.

Run (from the worktree root): `.venv/bin/pytest "../../../../data-repo.facts-src/.claude/hooks" -q` — expected: the new tests FAIL.

- [ ] **Step 2: Rewrite the card (`.claude/agents/quantify.md`)**

1. Frontmatter:

```yaml
---
name: quantify
description: Decide one prepared unit of a facts run — one table (a sheet tab, a group of form photos, a document) or a transcript excerpt — against the candidates the planner already minted, reading the department's corrected processes whole; or group a department's form photos by table; or review the assembled result; or propose the Persian choices for one unresolved workbook row; or apply one chat instruction to one entry. Never mints an id (INV-1), never fabricates, and writes exactly one file.
model: claude-opus-5-5
effort: high
tools: Read, Write, Grep, Glob
---
```

2. Modes table: add the row `| \`group\` | Stage G | the department's photos and their descriptions | \`{run_dir}/photo-groups.json\` |`.

3. Replace the paragraph that begins «In `unit` and `review` mode you read **exactly two files**» with:

```markdown
**What you read.** In `unit` mode: your `input.md`, the schema, the form photos your own headings
name as `عکس:`, and the process files `## فرایندها` lists — your own department's file whole, every
line of it (it is long: read it in pages with `offset`/`limit` until the end), and another
department's file when your table's items or columns appear in it (find out with `Grep` over
`{run_dir}/processes/`, then read what it finds). In `review` mode: your `input.md` and the schema.
You never open a dump, a transcript file, the store, the index or a process `.json` — anything you
need and cannot find in what is listed here is a `drop` with `reason_code: insufficient_context`,
never a search elsewhere.
```

4. Replace the `**\`## گفت‌وگوهای مرتبط\`**` paragraph (the related-talk one) with:

```markdown
**`## فرایندها`** — every unit's input carries it: the paths of this run's process files. Each file
is one department's active processes as the process engineer corrected them — per process its name
and summary; per step its id and label, `مجری:` (who does it), its description, its inputs,
controls, outputs and mechanisms, and `بعدی:` lines, the steps that follow, each with its
condition when it has one. A transcript unit is given its own department's file only.
```

5. Replace the `**\`## آنچه تا کنون ثبت شده\`**` paragraph with:

```markdown
**`## آنچه تا کنون ثبت شده`** — a transcript unit's input carries it: every entry the table units of
this run recorded, whole — its handle, kind, key and title, its statement, and for a table where it
is kept, who fills and approves it, how often, and every column with its unit and description —
then the store's open entries as before.
```

6. In «The unit contract» list: replace the `processes[]` bullet with «`processes[]` names a process id, a node id and a quote — nothing else. The step must be one a process file prints; a node id no file prints is dropped.»; delete the whole «**Form first.**» bullet (with its `voice`/`account` sentences and the line «In both, the lines must lie inside one passage…»); and add these two bullets in its place:

```markdown
- **Forms decide structure; processes decide practice.** For a workbook or attachment unit, the
  table's columns, rows, printed titles and units are the file's or the photo's. Who fills the table
  and who approves it, when and how often, how each column's value is measured and in which step,
  the exceptions, and whether a printed column is still filled at all come from the processes —
  and where the processes and the form disagree on any of these, the processes win. A printed
  column the processes say is no longer filled stays a column; its `description` says it is no
  longer filled and where that value is written now. When two processes disagree with each other,
  write neither as fact: write a `note` on the table (`about` = the table, `question` = both
  readings in Persian). A condition on a `بعدی:` line is an exception of the step it leaves: when
  that step fills or measures something in your table, write the condition as that entry's
  exception. The processes rarely name a table; find what concerns yours by its items and columns.
  For each table deliver: what it is, who fills and approves it, how often (`statement`,
  `filled_by`, `approved_by`, `cadence`); for every column, how its value is measured and recorded —
  in the field's `description`, or as a measurement whose `writes_to`/`home.field` names that
  column; and the rules (formulas, thresholds, constants) and exceptions, each homed on the table.
  Every entry cites the step(s) it came from in `processes[]`, with a short quote. You write no
  `voice` and no `account`.
- **A transcript unit only adds.** Write only what neither the process files nor «آنچه تا کنون ثبت
  شده» already say, as `new[]` entries homed on a listed table, and cite the lines you took each
  from: `"voice": [{"ref": "<your excerpt's transcript path>", "lines": "a-b"}]`, lines inside your
  excerpt. Never write an `account`. A statement of your excerpt that contradicts a process step or
  a recorded entry is not written — it goes to `contradicted[]`:

  ```json
  "contradicted": [{"claim": "کنار شنیسل خام تنها برای غذای پرسنل مصرف می‌شود",
                    "ref": "meetings/transcripts/preparation-1405-06-04.txt", "lines": "210-218",
                    "against": {"process": "preparation-012", "node": "preparation-012-n039"}}]
  ```

  `claim` is one Persian sentence; `ref` and `lines` lie inside your excerpt; `against` is either
  `{process, node}` or `{"ref": "<a handle printed in «آنچه تا کنون ثبت شده»>"}`. The owner reads
  these at the end of the run; one the engine cannot check is dropped.
```

7. In «What is recorded, and reuse», change «…or as an account when it disagrees with a listed value; describe a new table only when no listed table fits.» to «…or, when it disagrees with a listed entry, into `contradicted[]`; describe a new table only when no listed table fits.», and «a process node you cite is validated against the department's whole index» to «a process step you cite is validated against every department's active steps».

8. In «`review` mode», replace the keeper sentence with: «Each entry's digest line names its source kinds; when two entries merge, the one read off a form is the keeper, then one read off a process — a `sheet`, `photo`, `pdf` or `docx` source outranks `process`, and `process` outranks `voice` and `chat`.»

9. Add, before «### `manifest` mode»:

```markdown
### `group` mode

You get `department`, `run_dir` and `schema_path` (`photo-groups.schema.json`). List the
department's photos with `Glob` (`departments/{department}/attachments/*.jpg`, `*.jpeg`, `*.png`,
`*.webp`) and read each one's description,
`departments/{department}/attachments/.text/<the photo's file name without its extension>.image.md`.
Two or more photos are one group when they show one table — the same printed title or header, the
columns or rows continued, the two halves of one page; open the images when the descriptions do
not settle it. Every photo appears in exactly one group; a photo with no partner is a group of one.
Write `{run_dir}/photo-groups.json`:

```json
{"schema_version": 1,
 "groups": [{"photos": ["departments/preparation/attachments/photo-A.jpg",
                        "departments/preparation/attachments/photo-B.jpg"],
             "why": "همان سربرگ؛ ادامهٔ جدول در عکس دوم"}]}
```

Paths relative to the data root, exactly `departments/…` — never absolute. `why` is one Persian line
for the run's record; nobody else reads it.
```

10. «Non-negotiables»: replace «**You never search.** No Glob, no Grep, no second Read. Missing context is `reason_code: insufficient_context`.» with «**You search only where this card says:** `Grep` under `{run_dir}/processes/`, and `Glob` for the photos in `group` mode. Missing context is `reason_code: insufficient_context`.»

11. «Completion»: add the group-mode line `{run_dir}/photo-groups.json — ۱۴ عکس، ۱۱ گروه`.

- [ ] **Step 3: The playbook (`.claude/skills/quantify/SKILL.md`)**

1. Frontmatter `description`: insert «group the form photos,» after «prepare,».
2. Resume ladder: «no skeleton → Stage P (or earlier…)» becomes «no skeleton → Stage G when `status` prints stage `G` (the department has photos and no grouping yet), else Stage P (or earlier…)».
3. End of Stage 2: «Yield check, then Stage P in the same turn.» becomes «Yield check, then `facts-plan status --run {run_dir}` and Stage G or Stage P as it prints, in the same turn.»
4. Insert between Stage 2 and Stage P:

````markdown
## Stage G — Group the photos

Only when `status` prints stage `G`. One `Task`, then Stage P in the same turn:

```
Task: quantify
  mode: group
  department: {department}
  run_dir: {run_dir}
  schema_path: <code-repo>/schemas/photo-groups.schema.json
```

Dispatch it once. Whatever it returns — a grouping, nothing, an error — continue to Stage P:
`build` checks the file and, when it cannot use it, gives every photo its own unit. Never write or
repair `photo-groups.json` yourself.

---
````

5. Stage P: replace «Every attachment — a form photo, a pdf, a docx text — goes into an `attachment` unit of its own (`u-att-1`, `u-att-2`, … in input order, packed to the size budget), never onto a transcript unit.» with «Every sheet tab is a workbook unit of its own; every photo group of Stage G is an `attachment` unit, and every other attachment (a pdf, a docx text) one more — never onto a transcript unit. `build` also writes `{run_dir}/processes/`, the files the units read.»
6. Stage ordering table: add the row `| G | Group photos | \`Task: quantify\` (group) | — |` after the `2` row.

- [ ] **Step 4: Run the lint**

Run (worktree root): `.venv/bin/pytest "../../../../data-repo.facts-src/.claude/hooks" -q` — expected: all pass (the owner-block, command-block and 4-Task checks included).

- [ ] **Step 5: Commit in the clone**

```bash
git -C "<clone>" add .claude
git -C "<clone>" commit -m "quantify: units read the corrected processes whole, transcripts only add and set contradictions aside, Stage G groups the photos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The runbook and the walkthrough say what changed

**Files:**
- Modify: `docs/runbooks/07-facts.md`, `docs/guides/quantitative-facts-walkthrough.md`

- [ ] **Step 1: Runbook**

Append a section `## 13. Processes as the source (2026-09-29)` to `docs/runbooks/07-facts.md` stating, in the runbook's register: the units read `{run_dir}/processes/<dept>.md` (every department; steps, actors, descriptions, ICOM, `بعدی:` edges with conditions); one unit per sheet tab and per photo group (Stage G, `photo-groups.json`, fallback one per photo); phase 2 in 70K excerpts under a 210K budget with phase 1's entries whole; `contradicted[]` and the report's closing section; the keeper order form > process > meeting; the unjudgeable leaves; `claude-opus-5-5` at effort high and the 2.1.284 pin; and that §12's related talk, its 80K budget row and unit-written accounts are **superseded** by this section. In §12, add one line under its heading: «Superseded in part by §13 (2026-09-29): no related talk, no unit-written account.»

- [ ] **Step 2: Walkthrough**

In `docs/guides/quantitative-facts-walkthrough.md`, at the «گفت‌وگوهای مرتبط» passage (`:346`) and the account passage (`:415`), add a boxed note each: «Since 2026-09-29 a form unit is shown no meeting passage; it reads its department's corrected processes whole. A meeting is read afterwards, only to add what nothing recorded, and what it says against a process is listed at the end of the report.»

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/07-facts.md docs/guides/quantitative-facts-walkthrough.md
git commit -m "docs(facts): runbook §13 and the walkthrough — the processes are the source, the meetings only add

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verify without a model — the related suites, lint, and preflight for all nine departments

- [ ] **Step 1: The related suites and ruff**

```bash
cd engine && ../.venv/bin/pytest tests/ -q -k "facts or unit_gate" && cd ..
.venv/bin/pytest tests/test_facts_schema.py tests/test_all_schemas_selfvalid.py -q
.venv/bin/pytest "../../../../data-repo.facts-src/.claude/hooks" -q
.venv/bin/ruff check engine
```

Expected: every suite passes; ruff reports nothing in a file this plan touched; `git diff main --stat` lists only the files the tasks name.

- [ ] **Step 2: Preflight every department against the clone**

For each of `management accounting warehouse procurement cooking preparation dining cashier logistics`:

```bash
DATA_ROOT="/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo.facts-src" .venv/bin/facts-plan preflight <department>
```

Expected: exit 0 for all nine. A department with photos prints `facts-plan: no usable photo-groups.json; one unit per photo` (no Stage G in a preflight) — that is correct.

- [ ] **Step 3: Record the unit counts**

From each preflight's JSON line, note the unit counts per department (the owner cares about cost: every unit re-reads its department's processes). Put them in the ledger for Task 12's report.

---

### Task 12: The acceptance run on Opus 5.5 (isolated container)

**Files:** none committed to code. In `<clone>`, a throwaway branch `facts-src-acceptance` holds the reset and the run; it is never merged.

- [ ] **Step 1: Rebuild the image with the finished engine and recreate only the isolated container**

```bash
docker build -f deploy/control-bot.Dockerfile -t inja-control-bot-facts-src .
docker rm -f inja-facts-src
```

then Task 1 Step 7's `docker run` again, unchanged.

- [ ] **Step 2: Reset preparation's facts on a throwaway branch of the clone**

```bash
git -C "<clone>" switch -c facts-src-acceptance
git -C "<clone>" rm -r -q facts runs/facts
git -C "<clone>" checkout 0340419 -- facts
git -C "<clone>" commit -q -m "acceptance: facts store at the seed (0340419), no fact runs — throwaway, never merged"
```

Check: `facts/records.json` holds only `F-00001` («واحدها»); `facts/.id-seq.json` next id is 2.

- [ ] **Step 3: Run `/quantify preparation` headless**

Output stays inside the container (host-side clients get killed for memory):

```bash
docker exec -d -w /work inja-facts-src sh -c 'claude -p "/quantify preparation" --model claude-opus-5-5 --effort high --allowedTools Read,Write,Edit,Bash,Glob,Grep,Task --disallowedTools AskUserQuestion,ExitPlanMode,EnterPlanMode --max-turns 200 --output-format stream-json --verbose > /tmp/acc-1.jsonl 2>&1'
```

At Gate A (the set checkpoint) and at every yield, continue the same session:

```bash
docker exec -d -w /work inja-facts-src sh -c 'claude -p "تأیید، همهٔ جلسه‌ها و فایل‌ها" --continue --model claude-opus-5-5 --effort high --allowedTools Read,Write,Edit,Bash,Glob,Grep,Task --disallowedTools AskUserQuestion,ExitPlanMode,EnterPlanMode --max-turns 200 --output-format stream-json --verbose > /tmp/acc-2.jsonl 2>&1'
```

(«ادامه بده» for a yield.) Watch with `docker exec inja-facts-src tail -c 2000 /tmp/acc-<n>.jsonl` and `DATA_ROOT=… facts-plan status --run <run>` from the host venv. If the files of a run were touched by hand, resume with a fresh `-p "/quantify preparation"` session, never `--continue`.

- [ ] **Step 4: Check the seven results**

Read the new entries in `<clone>/facts/*.json` and `{run_dir}/report.md`. The run passes only if all hold:

1. Raw schnitzel sides are **not** staff food; they only become cooked pizza chicken (the store has no entry saying they are staff food; the schnitzel-side table or rule says the opposite, citing `preparation-012-n039` or `-013-n056`).
2. Burger has **one** form — «نیمه ساخته برگر» on top, «تبدیل برگر» below (the burger conversion form's record says so; no rule puts burger on the general semi-finished form).
3. The beef-loin conversion form's **Philadelphia** column is no longer filled; Philadelphia goes on the semi-finished form.
4. The **supervisor** fills the spider Excel tables daily from each line's notebook (`filled_by` on the three sheet tables).
5. The spider Excel's **dough** section is not fillable from preparation; flour in and dough out are recorded nowhere.
6. `report.md` has no Latin field name, formula, id, path or `/`; the «کنار گذاشته شد» section appears if `assembly.json` has any `contradicted` row.
7. `plan.json`: every photo in exactly one `u-att-*` unit, every sheet tab its own `u-wb-*` unit; `processes/` holds a file per department.

A failed check is a finding: fix it in the engine or the card (a new task in the ledger), rebuild, reset (Step 2 on a new throwaway branch) and re-run. Record the run's cost (`total_cost_usd` in the last `result` line of each `/tmp/acc-*.jsonl`).

- [ ] **Step 5: Process pipeline smoke on Opus 5.5**

On the same throwaway branch, run `/process-voice` headless for the shortest preparation recording that has a transcript (`ls -S meetings/transcripts/preparation-*.txt | tail -1`), exactly as Step 3 with that command. Expected: the run ends, `validate` passes, and a process file is written or updated. Nothing from it is kept.

- [ ] **Step 6: Report to the owner and stop**

Send lili: the seven results (pass/fail each, with the entry titles that prove them), the report's closing section as the bot would send it, the cost, the unit counts per department from Task 11, and the process-voice smoke result. **Stop here.** Merge, push and deploy are the owner's word (below).

---

## Rollout (only on lili's word — not part of the execution above)

1. Trigger the server's git-push so origin has every server commit: `docker exec inja-food-process-git-push-1 /usr/local/bin/git-push-if-needed.sh` (on the server).
2. Code: check `main` has not moved in a way that conflicts (the comment-authors worktree lands separately), merge `worktree-facts-src` into `main`, push.
3. Data: in the main `data-repo`, fetch branch `facts-src` from the clone and merge **only** it (never `facts-src-acceptance`); push. Restart the local control-bot after the host-side git op (Docker bind-mount cache).
4. Server: pull both repos; rebuild the control-bot image (new Claude Code pin); set `CLAUDE_MODEL=claude-opus-5-5` and `CLAUDE_CODE_EFFORT_LEVEL=high` in `/opt/inja/secrets/control-bot.env`; recreate control-bot only while the bot is idle.
5. Server store: bundle the data-repo, reset preparation's facts to the seed (as Task 12 Step 2, on main), commit, push.
6. Local test bot: set the same two variables in `deploy/local/control-bot.env` before its next recreate.
7. Update memory `runtime-model-opus-5-1m` (the pipeline now runs `claude-opus-5-5`, no suffix, effort high).
8. Clean up: `docker rm -f inja-facts-src`, `docker rmi inja-control-bot-facts-src`, delete the clone and the worktree after the merge.
