# Guard hook: block only real writes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `data-repo/.claude/hooks/guard.py` from blocking read-only Bash commands, without weakening the "merge/order CLI is the sole writer" protection it exists to enforce.

**Architecture:** One file, one function. Replace the "any mutation token anywhere + any protected path anywhere" heuristic with two precise checks: (a) a write **verb** that takes the file as an argument, and (b) a redirect whose **target** is the protected path.

**Tech Stack:** Python 3, stdlib `re` only. The hook is a `PreToolUse` script executed per tool call.

## Global Constraints

- The files are `<data-repo>/.claude/hooks/guard.py` and its test suite
  `<data-repo>/.claude/hooks/test_guard.py` — **both in data-repo, not code-repo.**
  That is not a filing choice: `<data-repo>/.claude/settings.json:7` registers the hook as
  `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/guard.py"`, and the runtime's project dir is
  `/data` (the data-repo mount, `APPROVED_DIRECTORY`). A copy in code-repo would never be
  executed, and there is none. All of `.claude/**` — agents, skills, hooks, settings — is the
  runtime brain and is versioned with data-repo; code-repo holds the engine CLIs, bots and UI.
  So this change is a **data-repo commit**, exactly like today's `extract.md` / `consolidate.md`
  prompt edits.
- **Task 2 comes first** (TDD): the tests are written and shown to fail before Task 1 edits the guard.
- It is **live-mounted** into the container (`../../data-repo:/data`) and re-executed per tool call, so a fix takes effect on `git pull` — **no image rebuild**.
- Do not commit or push without the user's approval (standing rule).
- Scope is Problem 1 only. Do **not** touch the `transcribe`/`google-genai` gap (Problem 2) or the blocked-memory-writes noise (Problem 3).

## Root cause (evidence from session `defff4aa`)

`guard.py:90-94` blocks when `MUTATION_RE` matches **anywhere** AND a protected path appears **anywhere** — the two are never correlated. `MUTATION_RE` starts with `>>?`, so a bare `>` counts as "mutation". Three real blocks, none of which wrote anything:

| Blocked command | The `>` that matched | Reality |
|---|---|---|
| `cat departments/logistics/order.json 2>/dev/null` | `2>/dev/null` | stderr → /dev/null |
| `python3 -c "… print(e['from'],'->',e['to']) …"` | **`'->'` inside a Python string** | not a redirect at all |
| `layout --full …/cashier-034.json 2>&1 \| head` | `2>&1` | fd duplication |

## Decision — `layout` becomes an explicit write verb

`engine/layout/cli.py:20` ends in `write_json_atomic(args.process_file, proc)` — the standalone `layout` CLI **writes the process file in place**. Today the guard blocks it only *by accident*, when the command happens to contain a `>`; a bare `layout departments/**/processes/x.json` has always been allowed and does bypass `merge`.

Fixing the redirect logic without addressing this would **weaken** protection (the `2>&1` case above would start being allowed). So `layout` joins the write-verb list. This is safe:

- `merge` re-layouts internally, so the pipeline never needs standalone `layout` on a committed file.
- The UI backend calls `layout` on a **temp** file (`ui-backend/.../engine.py`), which is not a protected path and stays allowed.

If you would rather keep `layout` allowed, say so and I will drop it from the verb list — but then a bare `layout <committed file>` remains an open write path.

---

### Task 1: Replace the Bash write-detection logic

**Files:**
- Modify: `<data-repo>/.claude/hooks/guard.py`

- [ ] **Step 1: Replace `MUTATION_RE` with a verb list + a redirect-target regex**

Replace this line (currently line 30):

```python
MUTATION_RE = re.compile(r"(>>?|\btee\b|\bsed\b[^|]*\s-i|\bperl\b[^|]*\s-i|\bcp\b|\bmv\b|\brm\b|\btruncate\b|\bdd\b)")
```

with:

```python
# A bare `>` is NOT evidence of a write: `2>/dev/null`, `2>&1` and even a
# `'->'` inside a quoted string all contain one, and all three were blocking
# read-only commands (session defff4aa). So writes are detected two ways:
#   - WRITE_VERB_RE: commands that take the file as an ARGUMENT.
#     `layout` is here because layout/cli.py write_json_atomic()s the process
#     file in place, which would otherwise bypass merge (INV-1).
#   - REDIRECT_RE: capture what each redirect actually TARGETS, and test that
#     target — not the whole command — against the protected paths.
WRITE_VERB_RE = re.compile(
    r"\btee\b|\bsed\b[^|]*\s-i|\bperl\b[^|]*\s-i|\bcp\b|\bmv\b|\brm\b"
    r"|\btruncate\b|\bdd\b|\blayout\b")
REDIRECT_RE = re.compile(r"[0-9]?>>?\s*(&?[^\s;&|<>()]+)")
```

- [ ] **Step 2: Rewrite the Bash branch to correlate verb/redirect with the path**

Replace this block (currently lines 90-97):

```python
        if MUTATION_RE.search(cmd):
            if PROCESSES_CMD_RE.search(cmd):
                _deny("direct write to processes/*.json is forbidden; use the merge CLI (INV-1)")
            if ORDER_CMD_RE.search(cmd):
                _deny("direct write to order.json is forbidden; use the `order` CLI (INV-1)")
            if CLAUDE_CMD_RE.search(cmd):
                _deny("runtime cannot edit .claude/** or CLAUDE.md (INV-2)")
        return 0
```

with:

```python
        redirect_targets = REDIRECT_RE.findall(cmd)
        has_write_verb = bool(WRITE_VERB_RE.search(cmd))

        def _writes_to(path_re):
            """True only when the command actually writes a protected path:
            a write verb taking it as an argument, or a redirect INTO it."""
            if has_write_verb and path_re.search(cmd):
                return True
            return any(path_re.search(t) for t in redirect_targets)

        if _writes_to(PROCESSES_CMD_RE):
            _deny("direct write to processes/*.json is forbidden; use the merge CLI (INV-1)")
        if _writes_to(ORDER_CMD_RE):
            _deny("direct write to order.json is forbidden; use the `order` CLI (INV-1)")
        if _writes_to(CLAUDE_CMD_RE):
            _deny("runtime cannot edit .claude/** or CLAUDE.md (INV-2)")
        return 0
```

Everything else in the file — the `Write`/`Edit` branch, `_check_write_path`, and `ORDER_CURATE_RE` (which is deliberately *not* gated on mutation) — is unchanged.

- [ ] **Step 3: Syntax check**

Run: `python3 -m py_compile <data-repo>/.claude/hooks/guard.py`
Expected: no output.

---

### Task 2: Extend the existing test suite (TDD — write these BEFORE Task 1)

`<data-repo>/.claude/hooks/test_guard.py` already exists: **26 tests, all passing**, with helpers `run()`, `w()` and `bash()`. It is not reached by code-repo's `make test` (`testpaths` covers code-repo only) and data-repo has no Makefile/CI, so it is run manually:

```
cd <data-repo>/.claude/hooks && <code-repo>/.venv/bin/pytest test_guard.py -q
```

**Why the bug survived 26 tests:** every existing read case uses a *bare* command (`cat departments/cooking/processes/cooking-001.json`). None exercises a redirect, so no test ever produced a `>` alongside a protected path.

- [ ] **Step 1: Append the regression tests, in the file's existing style**

```python
# --- reads that contain a `>` are still reads (session defff4aa) -------------
# A bare `>` is not evidence of a write: a stderr redirect, an fd duplication
# and an arrow inside a quoted string all contain one, and all three were
# blocking read-only commands in production.

def test_allow_read_with_stderr_redirect(tmp_path):
    assert run(bash("cat departments/cooking/order.json 2>/dev/null | head -60"), tmp_path) == 0


def test_allow_read_with_fd_duplication(tmp_path):
    assert run(bash("layout --full /tmp/candidate.json 2>&1 | head -60"), tmp_path) == 0


def test_allow_python_read_printing_an_arrow(tmp_path):
    cmd = ("python3 -c \"import json;"
           "d=json.load(open('departments/cooking/processes/cooking-001.json'));"
           "print(d['edges'][0]['from'],'->',d['edges'][0]['to'])\"")
    assert run(bash(cmd), tmp_path) == 0


def test_allow_grep_into_devnull(tmp_path):
    assert run(bash("grep label departments/cooking/processes/cooking-001.json 2>/dev/null"),
               tmp_path) == 0


# --- real writes must still be blocked --------------------------------------

def test_block_cp_onto_process(tmp_path):
    assert run(bash("cp /tmp/x.json departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_block_rm_process(tmp_path):
    assert run(bash("rm departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_block_append_into_order(tmp_path):
    assert run(bash("echo x >> departments/cooking/order.json"), tmp_path) == 2


def test_block_redirect_into_process_with_stderr_too(tmp_path):
    # the real write is the stdout redirect; the 2>/dev/null must not mask it
    assert run(bash("merge_debug 2>/dev/null > departments/cooking/processes/cooking-001.json"),
               tmp_path) == 2


# --- `layout` writes the process file in place (engine/layout/cli.py) --------

def test_block_layout_on_committed_process(tmp_path):
    assert run(bash("layout --full departments/cooking/processes/cooking-001.json"), tmp_path) == 2


def test_allow_layout_on_temp_file(tmp_path):
    assert run(bash("layout --full /tmp/candidate.json"), tmp_path) == 0
```

- [ ] **Step 2: Run them against the UNCHANGED guard and watch the right ones fail**

Run: `cd <data-repo>/.claude/hooks && <code-repo>/.venv/bin/pytest test_guard.py -q`
Expected failures, and only these:
`test_allow_read_with_stderr_redirect`, `test_allow_read_with_fd_duplication`,
`test_allow_python_read_printing_an_arrow`, `test_allow_grep_into_devnull`,
`test_block_layout_on_committed_process`.
Everything else — including all 26 originals — must still pass. This is the proof the diagnosis is right.

- [ ] **Step 3: Apply Task 1, then re-run**

Expected: **36 passed**, 0 failed. Any originally-passing test that now fails is a protection regression — stop and fix before deploying.

---

### Task 3: Deploy (only after the user approves)

- [ ] **Step 1: Commit + push data-repo** (ask first — standing rule)
- [ ] **Step 2: Pull on the server**

Run: `ssh inja 'cd /opt/inja/data-repo && git pull --ff-only origin main'`
Check for divergence first — the server pushes on a cron and does not pull, so a rebase may be needed (this has happened twice).

- [ ] **Step 3: Confirm it is live — no rebuild needed**

`guard.py` is on the `/data` mount and re-executed per tool call, so the pull alone activates it. Verify in the container:
`ssh inja 'cd /opt/inja/code-repo/deploy && docker compose exec -T control-bot grep -c REDIRECT_RE /data/.claude/hooks/guard.py'` → expect `1`.

---

## Out of scope

- **Problem 2** — `transcribe` fails with `ModuleNotFoundError: No module named 'google'` because the Dockerfile installs `/opt/engine` without the `[vertex]` extra. Needs a Dockerfile change **and** Vertex credentials; unaddressed here.
- **Problem 3** — blocked writes to `/root/.claude/projects/-data/memory/*.md`. The guard is right to refuse (outside the repo); the noise comes from Claude Code's memory feature being enabled with nowhere legal to write.
- **Problem 4** — `run_in_background` unsupported by the SDK bridge. Model/harness mismatch, self-recovering.
