"""`validate facts-unit <file> --run <run_dir>` — the content pass over one
unit's decisions (§2.5), which is also what `facts-plan status` calls to say
`done` or `failed`."""
import json

import pytest
from facts_plan.assemble import validate_unit
from validate.cli import main


def _run(tmp_path, candidates=("S-r-000000000001",)):
    root = tmp_path
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    (root / "departments" / "cooking" / "processes" / "cooking-030.json").write_text(
        json.dumps({"id": "cooking-030",
                    "nodes": [{"id": "cooking-030-n016", "label": "شمارش"}]}),
        encoding="utf-8")
    run_dir = root / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units" / "u-wb-pitza").mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": ["kg", "portion"],
         "candidates": [{"id": c, "kind": "rule", "unit": "u-wb-pitza",
                         "payload": {"output": "انحراف"}} for c in candidates],
         "instances": [], "imports": [], "issues": []}, ensure_ascii=False),
        encoding="utf-8")
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": [{"id": "u-wb-pitza", "type": "workbook", "inputs": [],
                    "candidates": list(candidates), "nodes": [],
                    "est_tokens_in": 1, "est_tokens_out": 1}]}), encoding="utf-8")
    return root, run_dir


def _doc(**over):
    doc = {"schema_version": 1, "unit": "u-wb-pitza", "attempt": 1,
           "decisions": [{"skeleton": "S-r-000000000001", "action": "keep",
                          "key": "enheraf", "title": "انحراف مصرف",
                          "statement": "انحراف مصرف هر مادهٔ اولیه برابر است با "
                                       "مصرف واقعی منهای مصرف اعلامی لاین.",
                          "data": {"inputs": [], "outputs": []}}],
           "new": []}
    doc.update(over)
    return doc


def _write(run_dir, doc, name="out.1.json"):
    path = run_dir / "units" / "u-wb-pitza" / name
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_a_complete_document_passes(tmp_path):
    root, run_dir = _run(tmp_path)
    assert validate_unit(root, run_dir, _write(run_dir, _doc())) == []


def test_an_undecided_candidate_is_named(tmp_path):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    problems = validate_unit(root, run_dir, _write(run_dir, _doc()))
    assert any("S-r-000000000002" in p and "no decision" in p for p in problems)


def test_a_candidate_decided_twice_and_an_unknown_skeleton(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"].append({"skeleton": "S-r-000000000001", "action": "drop",
                             "reason_code": "cosmetic"})
    doc["decisions"].append({"skeleton": "S-r-000000000009", "action": "drop",
                            "reason_code": "cosmetic"})
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert any("decisions[1]" in p and "twice" in p for p in problems)
    assert any("decisions[2]" in p and "S-r-000000000009" in p for p in problems)


def test_node_citation_checked_against_the_whole_index(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["processes"] = [{"process": "cooking-030",
                                         "node": "n016", "quote": "شمارش"}]
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    doc["decisions"][0]["processes"] = [{"process": "cooking-030",
                                         "node": "n999", "quote": "شمارش"}]
    assert any("n999" in p for p in
               validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")))


def test_provisional_field_ref_shape(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"]["inputs"] = [
        {"key": "a", "from": {"ref": "S-rec-000000000003", "field": "C_H"}}]
    assert any("C_H" in p for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_lint_runs_with_the_unit_symbols_exempted(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["statement"] = "انحراف در خانهٔ H6 نوشته می‌شود."
    assert any("H6" in p for p in validate_unit(root, run_dir, _write(run_dir, doc)))
    doc["decisions"][0]["statement"] = "مصرف بر حسب kg و portion ثبت می‌شود."
    assert validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")) == []


def test_a_unit_written_on_a_non_numeric_field_is_an_error(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"] = {"fields": [{"from": "c_a", "key": "nam",
                                               "type": "string", "unit": "kg"}]}
    assert any("nam" in p and "unit" in p
               for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_review_caps(tmp_path):
    root, run_dir = _run(tmp_path)
    (run_dir / "review").mkdir()
    doc = {"schema_version": 1, "unit": "review", "attempt": 1,
           "decisions": [{"entry": {"kind": "rule", "key": f"k{n}",
                                    "scope": {"departments": ["cooking"],
                                              "branches": []}},
                          "action": "drop", "reason_code": "duplicate"}
                         for n in range(61)],
           "new": []}
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    assert any("60" in p for p in validate_unit(root, run_dir, path))


def test_the_cli_needs_a_run_directory(tmp_path, capsys):
    root, run_dir = _run(tmp_path)
    with pytest.raises(SystemExit) as excinfo:
        main(["facts-unit", str(_write(run_dir, _doc()))])
    assert excinfo.value.code == 2
    assert "--run" in capsys.readouterr().err


def test_the_cli_groups_the_messages_and_exits_2(tmp_path, capsys, monkeypatch):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    monkeypatch.setenv("DATA_ROOT", str(root))
    path = str(_write(run_dir, _doc()))
    with pytest.raises(SystemExit) as excinfo:
        main(["facts-unit", path, "--run", str(run_dir)])
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "S-r-000000000002" in err and "1 entries" in err


def test_the_cli_prints_ok_for_a_document_that_passes(tmp_path, capsys, monkeypatch):
    root, run_dir = _run(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    assert main(["facts-unit", str(_write(run_dir, _doc())),
                 "--run", str(run_dir)]) == 0
    assert capsys.readouterr().out.startswith("OK: ")


def test_a_review_document_is_not_checked_for_completeness(tmp_path):
    root, run_dir = _run(tmp_path)
    (run_dir / "review").mkdir()
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps({"schema_version": 1, "unit": "review",
                                "attempt": 1, "decisions": [], "new": []}),
                    encoding="utf-8")
    assert validate_unit(root, run_dir, path) == []
