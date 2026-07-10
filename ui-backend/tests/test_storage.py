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
