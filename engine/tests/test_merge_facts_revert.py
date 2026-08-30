from facts_helpers import _root, _seed_units, _const_delta, _write, _run_dir
from merge_facts import load_store
from merge_facts.apply import apply
from merge_facts.revert import revert
import pytest

# Scoped to the five store files (KIND_FILES) rather than every "*.json" in
# facts/ — `.id-seq.json` is the *allocator's* ledger, not the store, and the
# ledger is deliberately never decremented by a revert (ids are never reused;
# see test_ids_never_reused_after_revert, which requires exactly that — a
# reverted run's minted id must stay retired, or the very next apply would
# reissue it). `.index.json` is derived and would match either way.
def test_revert_restores_byte_identical_store(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")
             if not p.name.startswith(".")}
    run = _run_dir(root, "20260901-101501")
    apply(root, _write(root, "d1.json", _const_delta()), run)
    revert(root, run)
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")
             if not p.name.startswith(".")}
    assert before == after

def test_revert_reopens_predecessor(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    d = _const_delta(4); d["entries"][0]["valid_from"] = "1405-01-01"
    run2 = _run_dir(root, "2")
    apply(root, _write(root, "d2.json", d), run2)
    revert(root, run2)
    rules = [x for x in load_store(root)["rule"]["entries"] if x["key"] == "tol"]
    assert len(rules) == 1 and rules[0]["valid_to"] is None

def test_revert_refuses_when_later_run_touched_same_paths(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    runA = _run_dir(root, "1")
    apply(root, _write(root, "d1.json", _const_delta(5)), runA)     # writes data/.../value
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "2"))  # disputes same path
    with pytest.raises(SystemExit) as e:
        revert(root, runA)
    assert e.value.code == 2

def test_ids_never_reused_after_revert(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "1")
    r1 = apply(root, _write(root, "d1.json", _const_delta(key="a")), run)
    revert(root, run)
    r2 = apply(root, _write(root, "d2.json", _const_delta(key="b")), _run_dir(root, "2"))
    assert r2["id_map"]["T-1"] != r1["id_map"]["T-1"]

# --- coordinator ruling after Task 7's first pass: revert must REFUSE a ---
# --- workbook-stub-adoption run rather than half-restore it (QF-20) ---

def _workbook_stub_seed():
    src = {"type": "script", "ref": "attachments/sheets/G/G.gs", "function": "pull"}
    return {"schema_version": 1, "entries": [
        {"id": "T-1", "kind": "item", "key": "ing_7", "title": "روغن",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [dict(src)], "retired": False,
         "data": {"category": "ingredient", "unit": "g"}},
        {"id": "T-2", "kind": "record", "key": "ext_9f1c2d3e4a5b",
         "title": "کتاب ناشناخته", "statement": "s",
         "scope": {"departments": ["cooking"], "branches": []},
         "source": [dict(src)], "retired": False,
         "data": {"stub": True, "grain": "workbook", "medium": "sheet",
                  "role": "log", "location": {"spreadsheetId": "W"}}},
        {"id": "T-3", "kind": "measurement", "key": "advisory", "title": "ثبت روغن",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [dict(src)], "retired": False,
         "data": {"of": {"ref": "T-1"}, "quantity": "mass", "unit": "g",
                  "writes_to": {"ref": "T-2", "field": "masraf"}}}]}

def _real_record_delta():
    return {"schema_version": 1, "entries": [
        {"id": "T-1", "kind": "record", "key": "w__ruzane", "title": "روزانه انبار",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/W/W.xlsx"}],
         "retired": False,
         "data": {"medium": "sheet", "role": "log",
                  "location": {"spreadsheetId": "W", "sheetId": 1,
                               "sheet": "روزانه", "hidden": False},
                  "fields": [{"key": "masraf", "title": "مصرف", "type": "number",
                              "unit": "g"}]}}]}

def test_revert_refuses_workbook_stub_adoption(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _workbook_stub_seed()), _run_dir(root, "1"))
    run2 = _run_dir(root, "2")
    apply(root, _write(root, "d2.json", _real_record_delta()), run2)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")
             if not p.name.startswith(".")}
    with pytest.raises(SystemExit) as e:
        revert(root, run2)
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "adopted workbook stub" in err
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")
             if not p.name.startswith(".")}
    assert before == after
