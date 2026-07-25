import copy
import json

from conftest import load_fixture
from merge.cli import main
from order import read_order, reconcile

RUN = "runs/cooking-2026-07-25"
NOW = "2026-07-25T12:00:00Z"


def _cand(name="heir"):
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["process_name"] = name
    return c


def _cand_file(tmp_path, name, seq=1):
    p = tmp_path / f"cand-{seq}.json"
    p.write_text(json.dumps(_cand(name), ensure_ascii=False), encoding="utf-8")
    return str(p)


def _proc_path(root, pid):
    return root / "departments" / "cooking" / "processes" / f"{pid}.json"


def _committed(root, pid):
    """An existing standalone process on disk, copied from the golden fixture."""
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = pid
    p["parent"] = None
    p["nodes"] = [n for n in p["nodes"] if n["id"] != "cooking-001-n060"]
    for n in p["nodes"]:
        if n["id"] not in ("start", "end"):
            n["id"] = n["id"].replace("cooking-001", pid)
    p["edges"] = [e for e in p["edges"]
                  if "cooking-001-n060" not in (e["from"], e["to"])]
    for e in p["edges"]:
        e["from"] = e["from"].replace("cooking-001", pid)
        e["to"] = e["to"].replace("cooking-001", pid)
    p["pending"] = []
    _proc_path(root, pid).write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")
    return p


def test_new_appends_the_process(data_root, tmp_path):
    assert main(["new", "--candidate", _cand_file(tmp_path, "الف"),
                 "--department", "cooking", "--run", RUN, "--now", NOW]) == 0
    assert read_order("cooking", data_root) == ["cooking-001"]


def test_new_twice_appends_in_creation_order(data_root, tmp_path):
    main(["new", "--candidate", _cand_file(tmp_path, "الف", 1),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    main(["new", "--candidate", _cand_file(tmp_path, "ب", 2),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-002"]


def test_remove_drops_the_tombstoned_process(data_root, tmp_path):
    main(["new", "--candidate", _cand_file(tmp_path, "الف", 1),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    main(["new", "--candidate", _cand_file(tmp_path, "ب", 2),
          "--department", "cooking", "--run", RUN, "--now", NOW])
    assert main(["remove", "--process", "cooking-001", "--run", RUN,
                 "--now", NOW]) == 0
    assert read_order("cooking", data_root) == ["cooking-002"]


def test_update_leaves_the_order_untouched(data_root, tmp_path):
    _committed(data_root, "cooking-001")
    reconcile("cooking", NOW, root=data_root)
    before = read_order("cooking", data_root)
    delta = tmp_path / "delta.json"
    delta.write_text(json.dumps(load_fixture("delta.json"), ensure_ascii=False),
                     encoding="utf-8")
    assert main(["update", "--process", "cooking-001", "--delta", str(delta),
                 "--run", RUN, "--now", NOW]) == 0
    assert read_order("cooking", data_root) == before


def test_restructure_heir_takes_the_predecessors_position(data_root, tmp_path):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    reconcile("cooking", NOW, root=data_root)
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-002", "cooking-003"]

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(
        {"department": "cooking",
         "heirs": [{"candidate": _cand("merged"),
                    "supersedes": ["cooking-002"],
                    "subprocess_links": []}]}, ensure_ascii=False), encoding="utf-8")
    assert main(["restructure", "--plan", str(plan), "--run", RUN, "--now", NOW]) == 0

    # cooking-004 is the fresh heir id (past the ledger high-water of 003) and it
    # must sit where its predecessor cooking-002 was, not at the end
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-003"]


def test_restructure_split_puts_both_heirs_at_the_predecessors_position(data_root, tmp_path):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    reconcile("cooking", NOW, root=data_root)

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(
        {"department": "cooking",
         "heirs": [{"candidate": _cand("part-a"), "supersedes": ["cooking-002"],
                    "subprocess_links": []},
                   {"candidate": _cand("part-b"), "supersedes": ["cooking-002"],
                    "subprocess_links": []}]}, ensure_ascii=False), encoding="utf-8")
    assert main(["restructure", "--plan", str(plan), "--run", RUN, "--now", NOW]) == 0

    # both heirs land consecutively where cooking-002 was, in id order
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-005", "cooking-003"]
