"""I4 and I5 over estates the engine has never seen (spec §3.3).

Every run until 2026-09-08 was cooking's, and every fixture in this directory
is cooking's estate copied cell for cell. So the two invariants the owner asked
for — *the engine's own candidates pass the engine's own gate*, and *a run stops
only when nothing can be assembled* — were promises about one spreadsheet
estate. `fixtures/facts_plan/synth.py` draws a different one from each seed
(other branches, other code namespaces, other placeholder headers, header rows
anywhere in the first six, Latin tab names, empty, hidden, mirror, reference and
oversized tabs, a branch twin, a workbook nobody has placed and a workbook of
another department), and this runs the whole deterministic half of a first run
over twenty-four of them:

1. `build` either returns or stops with one of §3.2's kept stops — never with a
   traceback, and never with a stop that is not on that list;
2. every candidate it minted passes `validate facts-unit` under the smallest
   `keep` a unit could write, except what the unit itself owes (I4);
3. those documents assemble, the delta validates, and `apply` would take it (I5).

A unit whose bare `keep` the gate refuses for what it owes has both attempts
written, which is what the engine reads as a unit that could not answer: it
becomes a `failed` unit, its candidates wait in `undecided[]`, and the rest of
the run lands. That is the behaviour under test — one unit's silence must not
cost the run.
"""
import json

import pytest
from facts_plan.assemble import assemble, validate_unit
from facts_plan.build import build
from facts_plan.preflight import UNIT_OWED, bare_keeps
from fixtures.facts_plan.synth import synth_estate
from merge_facts.apply import simulate

from engine_common import validate

SEEDS = range(24)

#: §3.2's kept stops, by the fragment each prints. Everything else in that table
#: is now a held-back candidate or entry, so a run that stops for any other
#: reason is the regression this test is here for.
KEPT_STOPS = ("candidate(s) in two units", "in none", "unit(s) already done",
              "attempt cap", "nothing assembled")

#: `{seed: row}` — written by the property below, read by the summary after it.
RUNS = {}


def _bare_keep_gate(root, run_dir):
    """Every unit's smallest `keep` on disk, and what the gate said about it.

    `(refused, owed)`: `refused` are the engine's own — a shape it built and
    then would not accept, which no unit can repair; `owed` are the members and
    the title §3.3 leaves to the unit.
    """
    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    plan = json.loads((run_dir / "plan.json").read_text(encoding="utf-8"))
    refused, owed = [], 0
    for unit, doc in bare_keeps(skeleton, plan).items():
        path = run_dir / "units" / unit / "out.1.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        lines = validate_unit(root, run_dir, path)
        for line in lines:
            if any(pattern.search(line) for pattern in UNIT_OWED):
                owed += 1
            else:
                refused.append(f"{unit}: {line}")
        if lines:
            # Both attempts spent — `_outputs` reads that as the unit that could
            # not answer, and `assemble` finishes without it (§3.2).
            (path.parent / "out.2.json").write_text(
                path.read_text(encoding="utf-8"), encoding="utf-8")
    return refused, owed


@pytest.mark.parametrize("seed", list(SEEDS))
def test_a_generated_estate_plans_gates_and_assembles(seed, tmp_path, capsys):
    estate = synth_estate(tmp_path, seed, departments=2, workbooks=4)
    department = estate["department"]
    run_dir = tmp_path / "runs" / "facts" / department / "20260908-000000"
    run_dir.mkdir(parents=True)

    try:
        built = build(tmp_path, department, run_dir, [estate["recording"]])
    except SystemExit as stop:
        line = capsys.readouterr().err
        assert stop.code == 2, f"seed {seed}: exit {stop.code}: {line}"
        assert "facts-plan: " in line, f"seed {seed}: silent stop"
        assert any(f in line for f in KEPT_STOPS), f"seed {seed}: {line}"
        RUNS[seed] = {"stopped": line.strip().splitlines()[0]}
        return
    except Exception as exc:                    # pragma: no cover — the property
        pytest.fail(f"seed {seed}: build raised {exc!r}")

    refused, owed = _bare_keep_gate(tmp_path, run_dir)
    assert refused == [], f"seed {seed}: the engine refused its own candidates: " \
                          f"{refused[:5]}"

    try:
        result = assemble(tmp_path, run_dir)
    except SystemExit:                          # pragma: no cover — the property
        pytest.fail(f"seed {seed}: assemble stopped — "
                    f"{capsys.readouterr().err.strip()[-500:]}")

    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    validate("facts-delta.schema.json", delta)
    _store, problems = simulate(tmp_path, run_dir / "facts-delta.json", run_dir)
    assert problems == [], f"seed {seed}: apply would refuse this delta: " \
                           f"{problems[:2]}"

    RUNS[seed] = {"candidates": sum(built["candidates"].values()),
                  "units": built["units"], "held_back": result["undecided"],
                  "entries": result["entries"], "unit_owed": owed}


def test_at_most_three_of_the_twenty_four_estates_stop():
    """I5's headline number: a stop is the exception, not the shape of the run.

    Skipped when the property above did not run over every seed, so a `-k`
    selection of one seed does not read as a failure of all of them.
    """
    if len(RUNS) < len(SEEDS):
        pytest.skip("the property did not run over every seed")
    table = "\n".join(
        f"  seed {seed:2d}: " + (row["stopped"] if "stopped" in row else
                                 f'{row["candidates"]:3d} candidates, '
                                 f'{row["units"]} units, '
                                 f'{row["held_back"]} held back, '
                                 f'{row["entries"]} entries')
        for seed, row in sorted(RUNS.items()))
    stopped = [seed for seed, row in RUNS.items() if "stopped" in row]
    assert len(stopped) < 4, f"{len(stopped)} of {len(SEEDS)} estates could not " \
                             f"be planned at all:\n{table}"
    assert all(row.get("entries") for row in RUNS.values() if "stopped" not in row), \
        f"an estate assembled nothing:\n{table}"
