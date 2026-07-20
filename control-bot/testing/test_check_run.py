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
