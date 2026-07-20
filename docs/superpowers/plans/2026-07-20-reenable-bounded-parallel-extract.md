# Re-enable Bounded-Parallel Extract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable Stage-5 extract as bounded batches of 4 `Task`s, kept only if an objective two-tier server test proves the control-bot still never stalls mid-run; otherwise fully reverted.

**Architecture:** Two new Python tools in `control-bot/testing/` (a read-only run pass/fail **checker** and a Tier-1 parallel-`Task` **probe**) gate a one-line-of-behavior change to the `data-repo` process-voice skill. The change is deployed in-place on the 2-CPU server with a `.bak`, exercised by two real dining runs, and either promoted (superseding ADR 0003) or restored — a single git-tracked file either way.

**Tech Stack:** Python 3 (stdlib + `pytest` for the checker; `claude_agent_sdk` for the probe, already installed in the control-bot image), Markdown skill/ADR docs, Docker Compose on the server.

## Global Constraints

- **Only one behavioral change is under test:** Stage-5 dispatch pattern. The 0005/0006/0007 mitigations (`include_partial_messages=False`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, raised budget caps) stay exactly as deployed — do not touch them.
- **Batch size = 4.** Dispatch at most 4 `extract` `Task`s per message. Full N-way fan-out is out of scope for this plan.
- **The SKILL.md edit is made in the separate `data-repo`** (`.claude/skills/process-voice/SKILL.md`), on its own branch, per INV-2 code/data separation. The `control-bot/testing/` tools and all docs are in **`code-repo`** on branch `spec/reenable-parallel-extract`.
- **Pass bar = Tier-1 probe writes 4/4 files, AND 2 consecutive dining runs each satisfy all 3 checker criteria.** Any single failure → revert everything.
- **Checker criteria (verbatim from spec):** (1) completion — `meta.json.finished_at` set, `processes[]` non-empty, one artifact per extract-eligible segment; (2) single turn — no `Continue from where you left off.` resume injection; (3) clean transcript — none of `No response requested.`, `Auto-resuming deferred tool`, `stop_sequence`.
- **Server tests run through the deployed control-bot against the already-empty dining department.** No live data is at risk because dining is reset. The exact server host alias, container/service name, and `/opt` data-repo path are **operator-confirmed at execution** (shown below as `inja` / `control-bot` / `/opt/inja/data-repo` — the values used in ADRs 0003/0006).
- **The A/B probe was originally 3 `Task`s × `sleep 95`; this plan uses 4 × `sleep 100`** to match batch-of-4 and the longest real extract (108 s, ADR 0006).

---

## File Structure

- `code-repo/control-bot/testing/check_run.py` — read-only pass/fail checker (importable + CLI). One responsibility: given a run dir + transcript, return the 3-criteria verdict.
- `code-repo/control-bot/testing/test_check_run.py` — pytest unit tests for the checker, with inline fixtures.
- `code-repo/control-bot/testing/parallel_task_probe.py` — Tier-1 mechanism probe (dispatches 4 parallel `Task`s in-container, counts output files).
- `code-repo/control-bot/testing/README.md` — how/where to run both tools on the server.
- `data-repo/.claude/skills/process-voice/SKILL.md` — Stage-5 edit (serial → batch-of-4).
- `code-repo/docs/decisions/0011-extract-bounded-parallel-batch-of-4.md` — outcome ADR (pass **or** fail variant).
- `code-repo/docs/decisions/README.md` — ADR index row (added in the outcome task).

---

## Task 1: Run pass/fail checker (`check_run.py`) — TDD

**Files:**
- Create: `control-bot/testing/check_run.py`
- Test: `control-bot/testing/test_check_run.py`

**Interfaces:**
- Produces: `evaluate_run(run_dir: str, transcript_path: str) -> tuple[bool, list[tuple[str, bool, str]]]` — returns `(passed, [(check_name, ok, detail), ...])`. Consumed by the operator (CLI) in Task 5 and referenced by the README in Task 2.
- Helper produced: `count_expected_artifacts(run_dir) -> int`, `count_written_artifacts(run_dir) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `control-bot/testing/test_check_run.py`:

```python
import json, os
import pytest
from check_run import evaluate_run, count_expected_artifacts, count_written_artifacts

def _write(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(obj, f)

def _clean_run(tmp_path):
    run = tmp_path / "run"
    _write(str(run / "segments.json"),
           {"segments": [{"status": "new"}, {"status": "update"},
                         {"status": "unchanged"}, {"status": "tombstone"}]})
    _write(str(run / "meta.json"), {"finished_at": "2026-07-20T10:00:00Z",
                                    "processes": ["dining-001"]})
    _write(str(run / "candidates" / "01.json"), {"id": "dining-001"})
    _write(str(run / "deltas" / "dining-000.json"), {"id": "dining-000"})
    return run

def _clean_transcript(tmp_path):
    t = tmp_path / "session.jsonl"
    t.write_text('{"type":"assistant","message":{"stop_reason":"end_turn"}}\n'
                 '{"type":"result","subtype":"success"}\n')
    return t

def test_expected_counts_only_extract_eligible(tmp_path):
    run = _clean_run(tmp_path)
    assert count_expected_artifacts(str(run)) == 2   # new + update, not unchanged/tombstone

def test_written_counts_candidates_plus_deltas(tmp_path):
    run = _clean_run(tmp_path)
    assert count_written_artifacts(str(run)) == 2

def test_clean_run_passes(tmp_path):
    run = _clean_run(tmp_path)
    t = _clean_transcript(tmp_path)
    passed, checks = evaluate_run(str(run), str(t))
    assert passed is True, checks

def test_unfinished_meta_fails_completion(tmp_path):
    run = _clean_run(tmp_path)
    _write(str(run / "meta.json"), {"finished_at": None, "processes": []})
    t = _clean_transcript(tmp_path)
    passed, checks = evaluate_run(str(run), str(t))
    assert passed is False
    assert any(name == "completion" and not ok for name, ok, _ in checks)

def test_missing_artifact_fails_completion(tmp_path):
    run = _clean_run(tmp_path)
    os.remove(str(run / "deltas" / "dining-000.json"))   # 1 written, 2 expected
    t = _clean_transcript(tmp_path)
    passed, checks = evaluate_run(str(run), str(t))
    assert passed is False
    assert any(name == "completion" and not ok for name, ok, _ in checks)

def test_resume_injection_fails_single_turn(tmp_path):
    run = _clean_run(tmp_path)
    t = tmp_path / "session.jsonl"
    t.write_text('{"isMeta":true,"message":{"content":"Continue from where you left off."}}\n')
    passed, checks = evaluate_run(str(run), str(t))
    assert passed is False
    assert any(name == "single_turn" and not ok for name, ok, _ in checks)

def test_stall_signature_fails_clean_transcript(tmp_path):
    run = _clean_run(tmp_path)
    t = tmp_path / "session.jsonl"
    t.write_text('{"type":"assistant","message":{"content":"No response requested."}}\n')
    passed, checks = evaluate_run(str(run), str(t))
    assert passed is False
    assert any(name == "clean_transcript" and not ok for name, ok, _ in checks)

def test_stop_sequence_fails_clean_transcript(tmp_path):
    run = _clean_run(tmp_path)
    t = tmp_path / "session.jsonl"
    t.write_text('{"type":"assistant","message":{"stop_reason":"stop_sequence"}}\n')
    passed, checks = evaluate_run(str(run), str(t))
    assert passed is False
    assert any(name == "clean_transcript" and not ok for name, ok, _ in checks)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd control-bot/testing && python -m pytest test_check_run.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'check_run'` (or import error for the functions).

- [ ] **Step 3: Implement `check_run.py`**

Create `control-bot/testing/check_run.py`:

```python
#!/usr/bin/env python3
"""Read-only pass/fail checker for a process-voice run (spec 2026-07-20).

Verdict = all three criteria pass:
  1. completion       — meta.finished_at set, processes non-empty, one artifact
                        per extract-eligible segment (no silent partial loss).
  2. single_turn      — transcript free of the resume injection (no «ادامه بده»).
  3. clean_transcript — transcript free of the mid-run stall signatures.
"""
import glob
import json
import os
import sys

EXTRACT_STATUSES = {"new", "update", "merge", "split"}
RESUME_INJECTION = "Continue from where you left off."
STALL_TOKENS = ("No response requested.", "Auto-resuming deferred tool", "stop_sequence")


def _load_json(path):
    with open(path) as f:
        return json.load(f)


def count_expected_artifacts(run_dir):
    seg = _load_json(os.path.join(run_dir, "segments.json"))
    segments = seg["segments"] if isinstance(seg, dict) else seg
    return sum(1 for s in segments if s.get("status") in EXTRACT_STATUSES)


def count_written_artifacts(run_dir):
    n = len(glob.glob(os.path.join(run_dir, "candidates", "*.json")))
    n += len(glob.glob(os.path.join(run_dir, "deltas", "*.json")))
    return n


def _check_completion(run_dir):
    meta = _load_json(os.path.join(run_dir, "meta.json"))
    if not meta.get("finished_at"):
        return ("completion", False, "meta.finished_at is null")
    if not meta.get("processes"):
        return ("completion", False, "meta.processes is empty")
    expected = count_expected_artifacts(run_dir)
    written = count_written_artifacts(run_dir)
    if written != expected:
        return ("completion", False, f"artifacts written={written} expected={expected}")
    return ("completion", True, f"finished, {written}/{expected} artifacts")


def _check_single_turn(transcript_text):
    if RESUME_INJECTION in transcript_text:
        return ("single_turn", False, f"resume injection present: {RESUME_INJECTION!r}")
    return ("single_turn", True, "no resume injection")


def _check_clean_transcript(transcript_text):
    hits = [tok for tok in STALL_TOKENS if tok in transcript_text]
    if hits:
        return ("clean_transcript", False, f"stall signatures: {hits}")
    return ("clean_transcript", True, "no stall signatures")


def evaluate_run(run_dir, transcript_path):
    with open(transcript_path) as f:
        transcript_text = f.read()
    checks = [
        _check_completion(run_dir),
        _check_single_turn(transcript_text),
        _check_clean_transcript(transcript_text),
    ]
    passed = all(ok for _, ok, _ in checks)
    return passed, checks


def main(argv):
    if len(argv) != 3:
        print("usage: check_run.py <run_dir> <transcript.jsonl>", file=sys.stderr)
        return 2
    passed, checks = evaluate_run(argv[1], argv[2])
    for name, ok, detail in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd control-bot/testing && python -m pytest test_check_run.py -v`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add control-bot/testing/check_run.py control-bot/testing/test_check_run.py
git commit -m "test(control-bot): add read-only run pass/fail checker for parallel-extract gate"
```

---

## Task 2: Tier-1 parallel-`Task` probe + testing README

**Files:**
- Create: `control-bot/testing/parallel_task_probe.py`
- Create: `control-bot/testing/README.md`

**Interfaces:**
- Consumes: the installed `claude_agent_sdk` (same package the bot uses). The SDK call shape MUST match the container's `src/claude/sdk_integration.py` — confirm the import/usage there before running (Step 2).
- Produces: prints `PROBE PASS: 4/4` or `PROBE FAIL: n/4`; exit 0 on PASS, 1 on FAIL. Consumed by the operator in Task 5.

- [ ] **Step 1: Write the probe**

Create `control-bot/testing/parallel_task_probe.py`:

```python
#!/usr/bin/env python3
"""Tier-1 mechanism probe (spec 2026-07-20, after ADR 0005's A/B repro).

Dispatches 4 parallel Task subagents in ONE message, mirroring the bot's
DEPLOYED options (include_partial_messages=False). Each subagent sleeps ~100 s
(matching the longest real extract) and writes one file. PASS = 4/4 files.

Run INSIDE the control-bot container on the 2-CPU server:
    docker compose exec control-bot python /opt/testing/parallel_task_probe.py
NOTE: adjust the ClaudeSDKClient/ClaudeAgentOptions call to match the installed
claude_agent_sdk API as used in src/claude/sdk_integration.py.
"""
import glob
import os

import anyio
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

OUT = "/tmp/probe_out"
N = 4


async def _run():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*")):
        os.remove(f)
    options = ClaudeAgentOptions(
        allowed_tools=["Task", "Bash"],
        permission_mode="bypassPermissions",
        include_partial_messages=False,  # mirror control-bot patch 0004 (deployed)
    )
    prompt = (
        f"Dispatch {N} Task subagents IN PARALLEL, all in ONE single message, as the "
        f"first thing you do. Subagent i (for i in 1..{N}) must run exactly this Bash "
        f"command and nothing else: sleep 100 && printf ok > {OUT}/agent_$i.txt . "
        f"Wait for all {N} to return. Then stop."
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for _ in client.receive_response():
            pass


def main():
    anyio.run(_run)
    files = glob.glob(os.path.join(OUT, "agent_*.txt"))
    ok = len(files) == N
    print(f"PROBE {'PASS' if ok else 'FAIL'}: {len(files)}/{N} files -> {sorted(files)}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Write the testing README**

Create `control-bot/testing/README.md`:

```markdown
# control-bot/testing — parallel-extract safety gate

Verification-only tooling (not bot runtime code) for the 2026-07-20 spec
"re-enable bounded-parallel extract". Run on the **2-CPU server**, where the
mid-run stall reproduces (it never does on a fast laptop — ADR 0002/0006).

## Tier 1 — mechanism probe (cheap, ~2 min)
Copy `parallel_task_probe.py` into the container and run it:

    docker compose -f deploy/docker-compose.yml cp control-bot/testing/parallel_task_probe.py control-bot:/opt/testing/parallel_task_probe.py
    docker compose -f deploy/docker-compose.yml exec control-bot python /opt/testing/parallel_task_probe.py

PASS = `PROBE PASS: 4/4`. If it fails, the bridge still drops parallel Task
batches under the deployed config — STOP, do not run Tier 2, revert.
First confirm the ClaudeSDKClient/options call matches
`<site-packages>/src/claude/sdk_integration.py` in the container.

## Tier 2 — real run checker
After a `/process-voice dining` run, evaluate it (run dir under
`/data/runs/<voice>/`, transcript under `/root/.claude/projects/-data/*.jsonl`):

    docker compose -f deploy/docker-compose.yml exec control-bot \
      python /opt/testing/check_run.py /data/runs/<voice> /root/.claude/projects/-data/<session>.jsonl

PASS = `RESULT: PASS`. Pass bar for the whole gate = probe 4/4 AND two
consecutive dining runs each `RESULT: PASS`.
```

- [ ] **Step 3: Sanity-check the probe imports locally (no dispatch)**

Run: `cd control-bot/testing && python -c "import ast; ast.parse(open('parallel_task_probe.py').read()); print('syntax ok')"`
Expected: `syntax ok` (the real SDK run happens in-container in Task 5; local box need not have `claude_agent_sdk`).

- [ ] **Step 4: Commit**

```bash
git add control-bot/testing/parallel_task_probe.py control-bot/testing/README.md
git commit -m "test(control-bot): add Tier-1 parallel-Task probe + testing README"
```

---

## Task 3: Edit Stage 5 — serial → bounded batch of 4 (in `data-repo`)

**Files:**
- Modify: `data-repo/.claude/skills/process-voice/SKILL.md` (Stage 5 heading + body ~L286–300; stage table row ~L605; key-invariant ~L624–625; "each serial extract" ~L33)

This task runs in the **data-repo** git repo, not code-repo.

- [ ] **Step 1: Create the data-repo branch**

```bash
cd ../data-repo   # from code-repo; adjust to your data-repo path
git checkout -b reenable-parallel-extract
git log --oneline -1   # note baseline commit for revert
```

- [ ] **Step 2: Replace the Stage 5 heading + first two paragraphs**

In `.claude/skills/process-voice/SKILL.md`, replace this block:

```
### Stage 5 — extract (strictly serial — one agent at a time)

Extract the segments classified as `new`, `update`, `merge`, or `split` **strictly one at a time**. Dispatch a
**single** `extract` `Task`, **wait for it to return**, then dispatch the next — repeat until every
`new`/`update` segment has been extracted. **Never dispatch two `extract` tasks in the same
message** (no parallel or batched `Task` fan-out): the Telegram bot runs on the Claude SDK bridge,
which silently drops all but one of a parallel `Task` batch mid-run, so serial dispatch is
**mandatory** for reliability. This deliberately trades the parallel perf/context benefit for
correctness — the right call for this single-user system.

Do the whole serial sweep **within one turn**: dispatching an agent and awaiting its result is a
tool call, not a turn end, so proceed from one extract to the next (and then on to Stage 6) without
ending your turn. Do **not** send a «⏳ در حال استخراج…» prose-only message (a message with no tool
call ends the turn and stalls the run); if you want a status line, it must ride in the **same
message** as an `extract` `Task` call.
```

with:

```
### Stage 5 — extract (bounded parallel — batches of at most 4)

Extract the segments classified as `new`, `update`, `merge`, or `split` in **bounded parallel
batches of at most 4**. Dispatch **up to 4** `extract` `Task`s **in one message**, **wait for the
whole batch to return**, then dispatch the next batch of up to 4 — repeat until every
`new`/`update`/`merge`/`split` segment has been extracted. **Never dispatch more than 4 `extract`
tasks in the same message.** Bounded batching (not full N-way fan-out) keeps the run within the SDK
bridge's proven-safe envelope (control-bot patches 0004/env; ADR 0011) while recovering most of the
wall-clock lost to serial extract — most of each agent's runtime is model/network wait, so 4-way
concurrency shortens the sweep substantially on the 2-CPU host.

Do the whole batched sweep **within one turn**: dispatching a batch and awaiting its results is a
tool call, not a turn end, so proceed from one batch to the next (and then on to Stage 6) without
ending your turn. Do **not** send a «⏳ در حال استخراج…» prose-only message (a message with no tool
call ends the turn and stalls the run); if you want a status line, it must ride in the **same
message** as an `extract` `Task` batch.
```

- [ ] **Step 3: Update the "last serial extract" line (~L358)**

Replace:

```
After the **last** serial extract task returns, proceed to Stage 6 in the **same turn**.
```

with:

```
After the **last** extract batch returns, proceed to Stage 6 in the **same turn**.
```

- [ ] **Step 4: Update the stage table row (~L605)**

Replace:

```
| 5 | extract per desired process (**serial**) | `Task: extract` × N | — |
```

with:

```
| 5 | extract per desired process (**batches of ≤4**) | `Task: extract` × N (≤4/msg) | — |
```

- [ ] **Step 5: Update the key-invariant (~L624–625)**

Replace:

```
- **Extract is strictly serial** — dispatch one `extract` `Task`, await it, then the next; never two
  in one message (the Claude SDK bridge silently drops parallel `Task` batches).
```

with:

```
- **Extract runs in bounded parallel** — dispatch at most 4 `extract` `Task`s per message, await the
  batch, then the next; never more than 4 in one message (ADR 0011 — full N-way fan-out is dropped by
  the SDK bridge; batches of 4 are proven safe under patches 0004/env).
```

- [ ] **Step 6: Update the "each serial extract" mention (~L33)**

Find the line near L33 containing `each serial extract` and change `each serial extract` to `each extract batch`. (Read the surrounding sentence first — it lists STOP/turn points — and keep the rest of the sentence intact.)

Run: `grep -n "serial" .claude/skills/process-voice/SKILL.md`
Expected: **no remaining matches** (every "serial" reference has been updated).

- [ ] **Step 7: Commit (in data-repo)**

```bash
git add .claude/skills/process-voice/SKILL.md
git commit -m "feat(process-voice): extract in bounded parallel batches of 4 (was strictly serial)

Under test per code-repo spec 2026-07-20; revert if the server gate fails."
```

---

## Task 4: Deploy the changed skill in-place on the server (with `.bak`)

**Files:**
- Server: `/opt/inja/data-repo/.claude/skills/process-voice/SKILL.md` (+ `.bak`)

No code change — operational. Confirm host/container/path first (Global Constraints).

- [ ] **Step 1: Back up the live serial skill**

On the server (`ssh inja`):

```bash
SKILL=/opt/inja/data-repo/.claude/skills/process-voice/SKILL.md
cp -n "$SKILL" "$SKILL.bak"
grep -c "strictly serial" "$SKILL.bak"   # expect >=1 (baseline is serial)
```

- [ ] **Step 2: Copy the batch-of-4 skill onto the server**

From the data-repo `reenable-parallel-extract` branch (laptop):

```bash
scp .claude/skills/process-voice/SKILL.md inja:/opt/inja/data-repo/.claude/skills/process-voice/SKILL.md
```

- [ ] **Step 3: Verify the deployed file is the batch-of-4 version**

On the server:

```bash
grep -c "bounded parallel" /opt/inja/data-repo/.claude/skills/process-voice/SKILL.md   # expect >=1
grep -c "strictly serial" /opt/inja/data-repo/.claude/skills/process-voice/SKILL.md    # expect 0
```

Expected: `bounded parallel` ≥ 1, `strictly serial` = 0, and `SKILL.md.bak` still present.

- [ ] **Step 4: Restart the control-bot so it re-reads the skill at runtime**

On the server, in the deploy dir:

```bash
docker compose -f deploy/docker-compose.yml up -d control-bot
docker compose -f deploy/docker-compose.yml ps control-bot   # confirm running/healthy
```

No image rebuild — the bot reads the skill file at runtime (ADR 0003 deployment note).

---

## Task 5: Execute the test protocol and evaluate (decision gate)

**Files:** none (operational). This task decides Task 6 vs Task 7.

- [ ] **Step 1: Tier-1 probe**

Copy the probe in and run it (see `control-bot/testing/README.md`):

```bash
docker compose -f deploy/docker-compose.yml cp control-bot/testing/parallel_task_probe.py control-bot:/opt/testing/parallel_task_probe.py
docker compose -f deploy/docker-compose.yml exec control-bot python /opt/testing/parallel_task_probe.py
```

Expected: `PROBE PASS: 4/4`.
**If not 4/4 → go straight to Task 7 (revert).** Do not run the dining runs.

- [ ] **Step 2: Dining run #1**

In Telegram, to the deployed control-bot: `/process-voice dining` (use your normal dining invocation). Let it run to completion **without** sending «ادامه بده». Note the run dir printed (`/data/runs/<voice>`).

- [ ] **Step 3: Check run #1**

Copy the checker in (once) and evaluate:

```bash
docker compose -f deploy/docker-compose.yml cp control-bot/testing/check_run.py control-bot:/opt/testing/check_run.py
SESSION=$(docker compose -f deploy/docker-compose.yml exec control-bot bash -lc 'ls -t /root/.claude/projects/-data/*.jsonl | head -1')
docker compose -f deploy/docker-compose.yml exec control-bot python /opt/testing/check_run.py /data/runs/<voice> "$SESSION"
```

Expected: `RESULT: PASS`.
**If `RESULT: FAIL` → go to Task 7 (revert).**

- [ ] **Step 4: Reset dining and dining run #2**

Reset the dining department to empty for a clean second run (mirror the prior "reset dining for fresh test" — clear `departments/dining/processes/*` and the run dir), then repeat Step 2's `/process-voice dining`, again with no «ادامه بده».

- [ ] **Step 5: Check run #2**

Repeat Step 3's checker command against run #2's run dir and latest session.
Expected: `RESULT: PASS`.

- [ ] **Step 6: Decide**

- Probe 4/4 **AND** run #1 PASS **AND** run #2 PASS → **go to Task 6 (promote).**
- Any FAIL at any step → **go to Task 7 (revert).**

---

## Task 6: On PASS — promote (merge + superseding ADR)

**Files:**
- Create: `code-repo/docs/decisions/0011-extract-bounded-parallel-batch-of-4.md`
- Modify: `code-repo/docs/decisions/README.md` (add index row)

- [ ] **Step 1: Write the pass-outcome ADR**

Create `docs/decisions/0011-extract-bounded-parallel-batch-of-4.md`:

```markdown
# 0011 — Extract re-enabled as bounded parallel (batches of 4); supersedes 0003

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-20 |
| **Area** | `data-repo` process-voice `SKILL.md` (Stage 5); gated on `control-bot` server test |
| **Supersedes** | [0003](0003-extract-serial-no-parallel-fan-out.md) |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0005](0005-control-bot-disable-partial-message-streaming.md), [0006](0006-control-bot-disable-background-task-deferral.md) |

## Context

ADR 0003 forced strictly-serial extract because the SDK bridge dropped parallel `Task`
batches. But 0005 (`include_partial_messages=False`) and 0006
(`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`) were later shown to remove that drop. Serial
extract cost ~15–25 min/voice on the 2-CPU host for no remaining reason.

## Decision

Re-enable extract as **bounded parallel batches of at most 4** `Task`s per message
(never full N-way). Verified on the 2-CPU server by a two-tier gate (spec
`docs/superpowers/specs/2026-07-20-reenable-bounded-parallel-extract-design.md`):
a 4×`sleep 100` parallel-`Task` probe wrote 4/4, and **two consecutive** `/process-voice
dining` runs each passed the checker (completion + single-turn + clean transcript).

## Consequences

- ✅ Extract wall-clock drops materially; no mid-run stall in either verification run.
- ✅ Any residual stop is still bounded to a 4-item batch, not the whole run.
- 📝 ARD §5/§7 (NFR-6) updated: parallel extract is realized (bounded to 4), no longer aspirational.
- 📝 0003's serial rule is superseded; batch cap stays 4 pending a separate full-N-way test.
```

- [ ] **Step 2: Add the ADR index row**

In `docs/decisions/README.md`, add after the `[0010]` row:

```
| [0011](0011-extract-bounded-parallel-batch-of-4.md) | Extract **re-enabled as bounded parallel** (batches of ≤4) — 0005/0006 removed the SDK-bridge drop; verified by a 2-tier server gate (probe 4/4 + two clean dining runs); **supersedes 0003** |
```

- [ ] **Step 3: Commit the ADR (code-repo)**

```bash
git add docs/decisions/0011-extract-bounded-parallel-batch-of-4.md docs/decisions/README.md
git commit -m "docs(adr): 0011 — extract re-enabled as bounded parallel (batches of 4), supersedes 0003"
```

- [ ] **Step 4: Land the data-repo change**

```bash
cd ../data-repo
git checkout main && git merge --no-ff reenable-parallel-extract \
  -m "feat(process-voice): extract in bounded parallel batches of 4 (verified, ADR 0011)"
# Ensure the server SKILL.md matches the merged version (already deployed in Task 4).
rm -f /opt/inja/data-repo/.claude/skills/process-voice/SKILL.md.bak   # on server, once satisfied
```

- [ ] **Step 5: Finish the code-repo branch**

Use superpowers:finishing-a-development-branch to merge/PR `spec/reenable-parallel-extract` (spec + plan + testing tools + ADR 0011).

---

## Task 7: On FAIL — revert everything

**Files:**
- Create: `code-repo/docs/decisions/0011-extract-bounded-parallel-batch-of-4.md` (negative variant)
- Modify: `code-repo/docs/decisions/README.md`

- [ ] **Step 1: Restore the serial skill on the server**

On the server:

```bash
SKILL=/opt/inja/data-repo/.claude/skills/process-voice/SKILL.md
cp "$SKILL.bak" "$SKILL"
grep -c "strictly serial" "$SKILL"   # expect >=1 (serial restored)
grep -c "bounded parallel" "$SKILL"  # expect 0
docker compose -f deploy/docker-compose.yml up -d control-bot
```

- [ ] **Step 2: Discard the data-repo branch**

```bash
cd ../data-repo
git checkout main
git branch -D reenable-parallel-extract
```

- [ ] **Step 3: Write the fail-outcome ADR**

Create `docs/decisions/0011-extract-bounded-parallel-batch-of-4.md`:

```markdown
# 0011 — Extract batch-of-4 tested and REVERTED (serial retained)

| | |
|---|---|
| **Status** | Rejected (experiment) |
| **Date** | 2026-07-20 |
| **Area** | `data-repo` process-voice `SKILL.md` (Stage 5) |
| **Related** | [0003](0003-extract-serial-no-parallel-fan-out.md) (retained), [0002](0002-control-bot-pipeline-stall-root-cause.md) |

## Context

Per spec `docs/superpowers/specs/2026-07-20-reenable-bounded-parallel-extract-design.md`,
we tried re-enabling extract as bounded parallel batches of 4 on the 2-CPU server,
gated by a probe + two clean dining runs.

## Result

FAILED at: <probe 4/4 | dining run #1 | dining run #2> — <which criterion, verbatim
checker output>. Batches of 4 still <drop subagents / stall mid-run> under the deployed
config. Reverted to strictly-serial extract (ADR 0003 stands).

## Consequences

- Serial extract retained; ~15–25 min/voice accepted.
- Do not re-chase batch-of-4 without a new mitigation; full N-way is even more exposed.
```

Fill the `<...>` placeholders with the actual failing step and checker output before committing.

- [ ] **Step 4: Commit the negative ADR and index row**

Add the `[0011]` row to `docs/decisions/README.md` describing the reverted experiment, then:

```bash
git add docs/decisions/0011-extract-bounded-parallel-batch-of-4.md docs/decisions/README.md
git commit -m "docs(adr): 0011 — batch-of-4 extract tested and reverted; serial retained"
```

---

## Self-Review

- **Spec coverage:** change under test → Task 3; Tier-1 probe → Task 2 + Task 5 Step 1; in-place deploy with `.bak` → Task 4; two dining runs → Task 5; checker's 3 criteria → Task 1; 2-consecutive pass bar → Task 5 Step 6; revert-on-failure → Task 7; pass/fail ADR → Task 6/Task 7. All covered.
- **Placeholders:** the only intentional `<...>` are runtime values the operator fills (run dir, session file, failing step) — flagged in-step, not plan gaps. Checker and probe code are complete.
- **Type consistency:** `evaluate_run` / `count_expected_artifacts` / `count_written_artifacts` names and the `(passed, [(name, ok, detail)])` shape match between `check_run.py`, its tests, and the README usage. Check names (`completion`, `single_turn`, `clean_transcript`) are identical across implementation and tests.
