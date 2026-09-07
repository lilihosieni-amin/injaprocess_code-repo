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

## Tier 3 — agent eval for one facts unit (on demand)

`quantify_unit_eval.py` dispatches one prepared unit of a facts run through the
SDK and asserts design §7's six properties: the output validates, no two kept
rules share a normalised `expr`, a candidate bound in several places stays one
rule (it is not split), `masraf_elami`/`enheraf`/`masraf_vaqei` carry a FEEL
expression, the prose passes the lint, and the agent used exactly two Reads and
one Write.

    .venv/bin/python control-bot/testing/quantify_unit_eval.py \
        {run_dir} u-wb-gozaresh_markazi

`{run_dir}` is a directory `facts-plan build` has already planned, so the unit
has its `input.md` and `skeleton.json`/`plan.json` are there to grade against.
The three FEEL rules are asserted only for the report-book unit, which is the
unit that owns them; any other unit is graded on the five remaining properties.

PASS = `EVAL PASS`. It costs a real model call, so it is **not** in `make test`
— run it after any change to `data-repo/.claude/agents/quantify.md` or to the
`input.md` rendering, and once per department before the first real run.

`--grade-only` skips the dispatch and grades the `out.1.json` already sitting in
the unit's directory. That half needs no SDK and no model call, which makes it
the check to run over a frozen fixture output after touching the eval itself.
