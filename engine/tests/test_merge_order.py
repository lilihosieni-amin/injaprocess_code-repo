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
    return (root / "departments" / pid.rsplit("-", 1)[0] / "processes"
            / f"{pid}.json")


def _committed(root, pid, pending=False):
    """An existing standalone process on disk, copied from the golden fixture."""
    dept = pid.rsplit("-", 1)[0]
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = pid
    p["department"] = dept
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
    p["pending"] = [{"node": f"{pid}-n010", "field": "actor",
                     "current": "کارپرداز", "proposed": "انباردار",
                     "source": RUN, "status": "open"}] if pending else []
    _proc_path(root, pid).write_text(json.dumps(p, ensure_ascii=False),
                                     encoding="utf-8")
    return p


def _delta(pid):
    """A minimal update grounded in what `_committed` actually leaves on disk.

    Built inline rather than from `tests/fixtures/delta.json`: that fixture is a
    schema fixture whose node ids are not grounded in any process, and
    `build_update` skips unknown ids silently, so a shared fixture would make an
    "order unchanged" assertion pass for the wrong reason.
    """
    return {
        "add_nodes": [
            {"key": "n1", "type": "activity", "label": "کنترل کیفیت",
             "description": "", "actor": "انباردار",
             "icom": {"inputs": [], "controls": [], "outputs": [],
                      "mechanisms": []},
             "subprocess": None},
        ],
        "add_edges": [{"from": f"{pid}-n010", "to": "n1", "label": ""}],
        "enrich_nodes": [],
        "flag_removed": [],
    }


def _delta_file(tmp_path, doc):
    p = tmp_path / "delta.json"
    p.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return str(p)


def _write_order(root, dept, ids):
    """A curated order.json placed directly on disk, bypassing the order API."""
    path = root / "departments" / dept / "order.json"
    path.write_text(json.dumps({"department": dept, "order": list(ids),
                                "updated_at": NOW}, ensure_ascii=False),
                    encoding="utf-8")


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
    delta = _delta_file(tmp_path, _delta("cooking-001"))
    assert main(["update", "--process", "cooking-001", "--delta", delta,
                 "--run", RUN, "--now", NOW]) == 0
    # a plain update creates no sub-process, so the active set is what it was
    assert read_order("cooking", data_root) == before


def test_update_puts_a_new_subprocess_right_after_its_parent(data_root, tmp_path):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    reconcile("cooking", NOW, root=data_root)

    d = _delta("cooking-001")
    d["add_subprocesses"] = [{"parent": "cooking-001-n010",
                              "process": _cand("child")}]
    assert main(["update", "--process", "cooking-001",
                 "--delta", _delta_file(tmp_path, d),
                 "--run", RUN, "--now", NOW]) == 0

    # the child follows its parent instead of landing at the end, which is only
    # possible because `update` passes child_hints to the sync
    assert read_order("cooking", data_root) == [
        "cooking-001", "cooking-004", "cooking-002", "cooking-003"]


def test_attach_subprocess_reconciles_without_reordering(data_root):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid)
    # a curated order: 002 deliberately ahead of 001, and 003 not listed yet
    _write_order(data_root, "cooking", ["cooking-002", "cooking-001"])

    assert main(["attach-subprocess", "--parent-process", "cooking-001",
                 "--node", "cooking-001-n010", "--child", "cooking-002",
                 "--run", RUN, "--now", NOW]) == 0

    # both ids were already active, so neither moves — 002 stays ahead of the
    # parent it just became a child of — and the sync only appends the unlisted 003
    assert read_order("cooking", data_root) == [
        "cooking-002", "cooking-001", "cooking-003"]


def test_accept_reconciles_without_reordering(data_root):
    for pid in ("cooking-001", "cooking-002", "cooking-003"):
        _committed(data_root, pid, pending=(pid == "cooking-001"))
    # same curated order, same drift: 003 is active on disk but unlisted
    _write_order(data_root, "cooking", ["cooking-002", "cooking-001"])

    assert main(["accept", "--process", "cooking-001", "--index", "0",
                 "--now", NOW]) == 0

    # resolving a pending row changes no process's active state, so the curated
    # positions survive; only the unlisted 003 is appended by the sync
    assert read_order("cooking", data_root) == [
        "cooking-002", "cooking-001", "cooking-003"]


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

    # cooking-004 is the fresh heir id — this fixture has no .id-seq.json, so
    # allocate_id._next_ordinal derives it from the process directory scan — and
    # it must sit where its predecessor cooking-002 was, not at the end
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


def test_restructure_across_departments_reconciles_both(data_root, tmp_path):
    (data_root / "departments" / "prep" / "processes").mkdir(parents=True)
    _committed(data_root, "cooking-001")
    _committed(data_root, "prep-001")
    reconcile("cooking", NOW, root=data_root)
    reconcile("prep", NOW, root=data_root)
    assert read_order("prep", data_root) == ["prep-001"]

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(
        {"department": "cooking",
         "heirs": [{"candidate": _cand("merged"),
                    "supersedes": ["prep-001"],
                    "subprocess_links": []}]}, ensure_ascii=False), encoding="utf-8")
    assert main(["restructure", "--plan", str(plan), "--run", RUN, "--now", NOW]) == 0

    # the heir's position hint names a predecessor in another department, which is
    # a safe no-op: cooking appends the heir at the end...
    assert read_order("cooking", data_root) == ["cooking-001", "cooking-002"]
    # ...while prep, the other touched department, drops the superseded id
    assert read_order("prep", data_root) == []


def test_a_corrupt_order_file_never_fails_the_merge(data_root, tmp_path, capsys):
    """Exit 2 means "nothing happened"; a written merge must never report it."""
    (data_root / "departments" / "cooking" / "order.json").write_text(
        "{ this is not json", encoding="utf-8")

    assert main(["new", "--candidate", _cand_file(tmp_path, "الف"),
                 "--department", "cooking", "--run", RUN, "--now", NOW]) == 0

    assert _proc_path(data_root, "cooking-001").is_file()
    cap = capsys.readouterr()
    assert cap.out.splitlines()[0] == "cooking-001"
    assert "cooking" in cap.err and "order sync cooking" in cap.err
