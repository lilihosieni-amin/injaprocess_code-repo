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
