"""QF-8 "At the tombstone": `merge remove` / `merge restructure` look up
facts/.index.json after a successful tombstone and print one `facts: ...`
line per referencing entry — read-only, nothing written, nothing printed
when the index is absent.

The index here is hand-written test JSON: it is *read*, never written, by
this test, so the "tests go through the verb" guard (which binds the five
facts store files) does not apply to it.
"""
import copy
import json
import subprocess
import sys

from conftest import load_fixture

NOW = "2026-08-30T09:00:00Z"


def _env():
    import os
    return {k: v for k, v in os.environ.items() if k in ("PATH", "SCHEMA_DIR")}


def _run(args, root):
    return subprocess.run([sys.executable, "-m", "merge.cli", *args],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": ""} | _env())


def _proc(pid="cooking-001"):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = pid
    p["parent"] = None
    p["pending"] = []
    return p


def _write_proc(root, pid):
    path = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    path.write_text(json.dumps(_proc(pid), ensure_ascii=False), encoding="utf-8")
    return path


def _row(fid, title, processes):
    return {"id": fid, "kind": "item", "key": "some_key", "title": title,
            "scope": {}, "status": "confirmed", "retired": False,
            "processes": processes, "updated_at": "2026-08-01T00:00:00Z"}


def _write_index(root, rows):
    facts_dir = root / "facts"
    facts_dir.mkdir(parents=True, exist_ok=True)
    (facts_dir / ".index.json").write_text(
        json.dumps({"schema_version": 1, "entries": rows}, ensure_ascii=False),
        encoding="utf-8")


def test_merge_remove_prints_facts_referencing_lines(data_root):
    _write_proc(data_root, "cooking-001")
    _write_index(data_root, [
        _row("F-00001", "پنیر پیتزا", ["cooking-001"]),
        _row("F-00002", "خمیر پیتزا", ["cooking-001", "cooking-099"]),
        _row("F-00003", "سس پیتزا", ["cooking-001"]),
        _row("F-00004", "بی‌ربط", ["cooking-099"]),  # control: must not appear
    ])

    r = _run(["remove", "--process", "cooking-001", "--run", "runs/x",
              "--now", NOW], data_root)

    assert r.returncode == 0, r.stderr
    assert "facts: F-00001 «پنیر پیتزا» → cooking-001" in r.stdout
    assert "facts: F-00002 «خمیر پیتزا» → cooking-001" in r.stdout
    assert "facts: F-00003 «سس پیتزا» → cooking-001" in r.stdout
    assert "F-00004" not in r.stdout
    # remove() always tombstones with no heir (superseded_by == []) — QF-8's
    # heir suffix never fires here, only under restructure.
    assert "heir" not in r.stdout


def test_merge_remove_silent_when_index_absent(data_root):
    _write_proc(data_root, "cooking-001")

    r = _run(["remove", "--process", "cooking-001", "--run", "runs/x",
              "--now", NOW], data_root)

    assert r.returncode == 0, r.stderr
    assert "facts:" not in r.stdout


def test_merge_remove_warns_and_continues_on_corrupt_index(data_root):
    _write_proc(data_root, "cooking-001")
    # a second, untouched active process so the department's order.json is
    # non-lazily written by _sync_order (an all-tombstoned department stays
    # fileless — see order.reconcile's lazy-empty guard) — that write is the
    # proof _sync_order still ran to completion after the corrupt-index warning.
    _write_proc(data_root, "cooking-002")
    facts_dir = data_root / "facts"
    facts_dir.mkdir(parents=True, exist_ok=True)
    (facts_dir / ".index.json").write_text("{not json", encoding="utf-8")

    r = _run(["remove", "--process", "cooking-001", "--run", "runs/x",
              "--now", NOW], data_root)

    assert r.returncode == 0, r.stderr
    assert "tombstoned cooking-001" in r.stdout
    assert "facts:" not in r.stdout
    assert "warning: facts index unreadable" in r.stderr
    assert "Traceback" not in r.stderr
    # the crash this guards against used to land *before* _sync_order in the
    # remove arm, so a corrupt index blocked order.json too — confirm the
    # sync still ran to completion.
    order = json.loads((data_root / "departments/cooking/order.json")
                       .read_text(encoding="utf-8"))
    assert order["order"] == ["cooking-002"]


def test_merge_remove_silent_after_index_deleted(data_root):
    _write_proc(data_root, "cooking-001")
    _write_index(data_root, [_row("F-00001", "پنیر پیتزا", ["cooking-001"])])

    r1 = _run(["remove", "--process", "cooking-001", "--run", "runs/x",
               "--now", NOW], data_root)
    assert r1.returncode == 0, r1.stderr
    assert "facts: F-00001" in r1.stdout

    _write_proc(data_root, "cooking-002")
    (data_root / "facts" / ".index.json").unlink()

    r2 = _run(["remove", "--process", "cooking-002", "--run", "runs/x",
               "--now", NOW], data_root)
    assert r2.returncode == 0, r2.stderr
    assert "facts:" not in r2.stdout


def test_merge_restructure_prints_heir_suffix(data_root):
    _write_proc(data_root, "cooking-001")
    _write_index(data_root, [_row("F-00010", "پنیر پیتزا", ["cooking-001"])])

    cand = copy.deepcopy(load_fixture("candidate.json"))
    cand["process_name"] = "heir"
    plan = {"department": "cooking",
            "heirs": [{"candidate": cand, "supersedes": ["cooking-001"],
                       "subprocess_links": []}]}
    plan_path = data_root / "runs" / "plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")

    r = _run(["restructure", "--plan", str(plan_path), "--run",
              "runs/cooking-2026-08-30", "--now", NOW], data_root)

    assert r.returncode == 0, r.stderr
    assert ("facts: F-00010 «پنیر پیتزا» → cooking-001 (heir cooking-002)"
            in r.stdout)


def test_merge_restructure_prints_heir_suffix_multiple_heirs(data_root):
    _write_proc(data_root, "cooking-001")
    _write_index(data_root, [_row("F-00020", "پنیر پیتزا", ["cooking-001"])])

    cand_a = copy.deepcopy(load_fixture("candidate.json"))
    cand_a["process_name"] = "part-a"
    cand_b = copy.deepcopy(load_fixture("candidate.json"))
    cand_b["process_name"] = "part-b"
    plan = {"department": "cooking",
            "heirs": [
                {"candidate": cand_a, "supersedes": ["cooking-001"],
                 "subprocess_links": []},
                {"candidate": cand_b, "supersedes": ["cooking-001"],
                 "subprocess_links": []}]}
    plan_path = data_root / "runs" / "plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")

    r = _run(["restructure", "--plan", str(plan_path), "--run",
              "runs/cooking-2026-08-30", "--now", NOW], data_root)

    assert r.returncode == 0, r.stderr
    assert ("facts: F-00020 «پنیر پیتزا» → cooking-001 "
            "(heir cooking-002, cooking-003)" in r.stdout)


def test_merge_restructure_silent_when_index_absent(data_root):
    _write_proc(data_root, "cooking-001")

    cand = copy.deepcopy(load_fixture("candidate.json"))
    cand["process_name"] = "heir"
    plan = {"department": "cooking",
            "heirs": [{"candidate": cand, "supersedes": ["cooking-001"],
                       "subprocess_links": []}]}
    plan_path = data_root / "runs" / "plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")

    r = _run(["restructure", "--plan", str(plan_path), "--run",
              "runs/cooking-2026-08-30", "--now", NOW], data_root)

    assert r.returncode == 0, r.stderr
    assert "facts:" not in r.stdout
