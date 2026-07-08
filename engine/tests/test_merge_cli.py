import json
import subprocess
import sys

from conftest import load_fixture


def _run(args, root):
    return subprocess.run([sys.executable, "-m", "merge.cli", *args],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": ""} | _env())


def _env():
    import os
    return {k: v for k, v in os.environ.items() if k in ("PATH", "SCHEMA_DIR")}


def test_merge_new_cli_writes_valid_process(data_root, tmp_path):
    cand = tmp_path / "candidate.json"
    cand.write_text(json.dumps(load_fixture("candidate.json")), encoding="utf-8")
    r = _run(["new", "--candidate", str(cand), "--department", "cooking",
              "--run", "runs/cooking-2026-07-06", "--now", "2026-07-06T10:00:00Z"],
             data_root)
    assert r.returncode == 0, r.stderr
    out = data_root / "departments/cooking/processes/cooking-001.json"
    assert out.is_file()
    proc = json.loads(out.read_text(encoding="utf-8"))
    assert proc["id"] == "cooking-001"


def test_update_missing_target_fails_precondition(data_root, tmp_path):
    delta = tmp_path / "delta.json"
    delta.write_text(json.dumps(load_fixture("delta.json")), encoding="utf-8")
    r = _run(["update", "--process", "cooking-999", "--delta", str(delta),
              "--run", "runs/x", "--now", "2026-07-06T10:00:00Z"], data_root)
    assert r.returncode == 2  # precondition gate: target process must exist


def test_merge_new_cli_creates_subprocess(data_root, tmp_path):
    import copy
    parent = copy.deepcopy(load_fixture("candidate.json"))
    child = copy.deepcopy(load_fixture("candidate.json"))
    parent["subprocesses"] = [{"parent_key": "n1", "process": child}]
    cand = tmp_path / "candidate.json"
    cand.write_text(json.dumps(parent), encoding="utf-8")
    r = _run(["new", "--candidate", str(cand), "--department", "cooking",
              "--run", "runs/cooking-2026-07-06", "--now", "2026-07-06T10:00:00Z"], data_root)
    assert r.returncode == 0, r.stderr
    assert (data_root / "departments/cooking/processes/cooking-001.json").is_file()
    assert (data_root / "departments/cooking/processes/cooking-002.json").is_file()
    assert "cooking-001" in r.stdout
    assert "subprocess cooking-002 node cooking-001-n001" in r.stdout
