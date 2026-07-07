from conftest import load_fixture
from engine_common import validate
from merge import merge_new

RUN = "runs/cooking-2026-07-06"
NOW = "2026-07-06T10:00:00Z"


def test_merge_new_builds_valid_process(data_root):
    cand = load_fixture("candidate.json")           # 1 activity (n1) + 1 junction (j1)
    proc = merge_new(cand, "cooking", RUN, NOW, root=data_root)
    validate("process.schema.json", proc)           # raises if invalid
    assert proc["id"] == "cooking-001"
    assert proc["created_at"] == NOW and proc["updated_at"] == NOW
    assert proc["source"] == {"type": "voice", "ref": "cooking-2026-07-06", "run": RUN}


def test_merge_new_allocates_real_ids_not_temp_keys(data_root):
    cand = load_fixture("candidate.json")
    proc = merge_new(cand, "cooking", RUN, NOW, root=data_root)
    ids = [n["id"] for n in proc["nodes"]]
    assert "cooking-001-n001" in ids          # activity temp 'n1' -> real box id
    assert "cooking-001-j1" in ids            # junction temp 'j1' -> real junction id
    assert "n1" not in ids and "j1" not in [n["id"] for n in proc["nodes"]]
    # every edge endpoint is a real node id
    node_ids = set(ids)
    for e in proc["edges"]:
        assert e["from"] in node_ids and e["to"] in node_ids


def test_merge_new_second_process_increments(data_root):
    (data_root / "departments/cooking/processes/cooking-001.json").write_text(
        '{"id": "cooking-001"}', encoding="utf-8")
    proc = merge_new(load_fixture("candidate.json"), "cooking", RUN, NOW,
                     root=data_root)
    assert proc["id"] == "cooking-002"
