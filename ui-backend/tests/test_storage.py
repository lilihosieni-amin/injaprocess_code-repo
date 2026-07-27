import asyncio
import json

from inja_ui_backend import storage


def test_write_atomic_roundtrip(tmp_path):
    p = tmp_path / "x.json"
    storage.write_json_atomic(p, {"k": "مقدار"})
    assert json.loads(p.read_text(encoding="utf-8")) == {"k": "مقدار"}
    assert p.read_text(encoding="utf-8").endswith("\n")
    # non-ASCII preserved (not \u-escaped)
    assert "مقدار" in p.read_text(encoding="utf-8")


def test_atomic_write_leaves_no_tmp(tmp_path):
    p = tmp_path / "x.json"
    storage.write_json_atomic(p, {"a": 1})
    assert [q.name for q in tmp_path.iterdir()] == ["x.json"]


def test_write_text_atomic_creates_parents_and_leaves_no_tmp(tmp_path):
    p = tmp_path / "dining" / "flowchart-0123456789abcdef.html"
    storage.write_text_atomic(p, "<html>سالن</html>")
    assert p.read_text(encoding="utf-8") == "<html>سالن</html>"
    assert [q.name for q in p.parent.iterdir()] == [p.name]


def test_dept_of_and_paths(tmp_path):
    assert storage.dept_of("cooking-001") == "cooking"
    assert storage.proc_path(tmp_path, "cooking-001").name == "cooking-001.json"


def test_file_lock_serializes_writes(tmp_path):
    p = tmp_path / "c.json"
    storage.write_json_atomic(p, {"n": 0})
    order = []

    async def bump(tag):
        async with storage.file_lock(p):
            cur = storage.read_json(p)["n"]
            await asyncio.sleep(0.01)          # force interleave without the lock
            storage.write_json_atomic(p, {"n": cur + 1})
            order.append(tag)

    async def main():
        await asyncio.gather(*(bump(i) for i in range(5)))

    asyncio.run(main())
    assert storage.read_json(p)["n"] == 5      # no lost updates
    assert sorted(order) == order or len(order) == 5


def _proc(root, code, pid, tombstoned=False):
    d = root / "departments" / code / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": code, "name": pid, "tombstoned": tombstoned}
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


def test_ordered_processes_follows_order_json_then_tombstones(tmp_path):
    root = tmp_path / "data"
    for pid in ("dining-001", "dining-002", "dining-003"):
        _proc(root, "dining", pid)
    _proc(root, "dining", "dining-009", tombstoned=True)
    (root / "departments" / "dining" / "order.json").write_text(
        json.dumps({"order": ["dining-003", "dining-001", "dining-002"]}), encoding="utf-8")

    got = [p["id"] for p in storage.ordered_processes(root, "dining")]
    assert got == ["dining-003", "dining-001", "dining-002", "dining-009"]


def test_ordered_processes_appends_ids_the_order_does_not_know(tmp_path):
    root = tmp_path / "data"
    for pid in ("dining-001", "dining-002"):
        _proc(root, "dining", pid)
    (root / "departments" / "dining" / "order.json").write_text(
        json.dumps({"order": ["dining-002"]}), encoding="utf-8")

    got = [p["id"] for p in storage.ordered_processes(root, "dining")]
    assert got == ["dining-002", "dining-001"]


def test_ordered_processes_survives_an_unreadable_order_file(tmp_path):
    root = tmp_path / "data"
    for pid in ("dining-002", "dining-001"):
        _proc(root, "dining", pid)
    (root / "departments" / "dining" / "order.json").write_text("{ not json", encoding="utf-8")

    got = [p["id"] for p in storage.ordered_processes(root, "dining")]
    assert got == ["dining-001", "dining-002"]   # falls back to id order
