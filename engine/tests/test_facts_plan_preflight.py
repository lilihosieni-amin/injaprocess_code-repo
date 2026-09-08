"""`facts-plan preflight` — every engine-built candidate through the engine's
own gate with a bare `keep`, before a department's first run costs a model
anything."""
import json

from facts_plan.preflight import bare_keeps, preflight
from facts_plan_helpers import estate


def _department(tmp_path):
    estate(tmp_path)
    transcripts = tmp_path / "meetings" / "transcripts"
    transcripts.mkdir(parents=True)
    (transcripts / "cooking-1405-05-26.txt").write_text(
        "\n".join(f"سطر {n}: موجودی پنیر پیتزا را آخر شب شمردیم.  "
                  for n in range(1, 40)), encoding="utf-8")
    processes = tmp_path / "departments" / "cooking" / "processes"
    processes.mkdir(parents=True)
    (processes / "cooking-030.json").write_text(json.dumps(
        {"id": "cooking-030", "nodes": [{"id": "cooking-030-n001",
                                         "label": "شمارش موجودی آخر شب"}]}),
        encoding="utf-8")
    (tmp_path / "facts").mkdir()
    (tmp_path / "facts" / "records.json").write_text(json.dumps(
        {"schema_version": 2, "entries": [{
            "id": "F-00001", "kind": "record", "key": "units", "retired": False,
            "valid_to": None, "data": {"rows": [
                {"key": "kg", "retired": False, "valid_to": None},
                {"key": "g", "retired": False, "valid_to": None}]}}]},
        ensure_ascii=False), encoding="utf-8")
    return tmp_path


def test_the_mini_estates_engine_built_candidates_pass_their_own_gate(tmp_path):
    """The invariant the 2026-09-08 runs were missing: nothing the planner
    minted is refused by the gate for a reason a unit could not repair. What
    the unit owes (a rule's inputs, a Persian title for a script's name) is
    counted, not held against the engine."""
    root = _department(tmp_path)
    result = preflight(root, "cooking", ["cooking-1405-05-26"])
    assert result["units"] > 0 and sum(result["candidates"].values()) > 0
    assert result["engine_refused"] == 0, result["lines"]
    assert result["lines"] == []
    # Nothing was written under the estate: the scratch run is gone.
    assert not (root / "runs").exists()


def test_a_bare_keep_names_every_candidate_once():
    skeleton = {"candidates": [
        {"id": "S-rec-000000000001", "kind": "record",
         "payload": {"fields": [{"key": "c_h", "title": "x"}]},
         "render": {"sheet": "پیتزا"}},
        {"id": "S-r-000000000002", "kind": "rule", "payload": {},
         "render": {"output": "انحراف"}}]}
    plan = {"units": [{"id": "u-wb-a", "candidates": ["S-rec-000000000001",
                                                       "S-r-000000000002"]},
                      {"id": "u-tr-x", "candidates": []}]}
    docs = bare_keeps(skeleton, plan)
    assert list(docs) == ["u-wb-a"]
    keys = [d["key"] for d in docs["u-wb-a"]["decisions"]]
    assert len(set(keys)) == 2
    assert docs["u-wb-a"]["decisions"][0]["data"]["fields"][0]["from"] == "c_h"
    assert docs["u-wb-a"]["decisions"][1]["data"] == {"lang": "sheets"}
