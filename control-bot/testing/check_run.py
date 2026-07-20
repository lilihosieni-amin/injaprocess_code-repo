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
