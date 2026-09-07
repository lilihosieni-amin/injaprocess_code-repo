import json

from facts_helpers import _root, _seed_units, _const_delta, _write, _run_dir
from merge_facts import load_store
from merge_facts.apply import apply
from merge_facts.revert import revert
from merge_facts.verbs import retire
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
    return {"schema_version": 2, "entries": [
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
    return {"schema_version": 2, "entries": [
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

# --- Task 7 review, C1: `_snapshot` must be once-per-run-dir — two writing- ---
# --- verb calls sharing one run_dir (`_append_delta`'s growing-list design) ---
# --- must not let the second call's snapshot clobber the first's ---

def test_revert_restores_both_entries_when_two_verb_calls_share_one_run_dir(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5, key="a")), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(5, key="b")), _run_dir(root, "2"))
    store = load_store(root)
    a = [x for x in store["rule"]["entries"] if x["key"] == "a"][0]
    b = [x for x in store["rule"]["entries"] if x["key"] == "b"][0]
    run3 = _run_dir(root, "3")
    retire(root, a["id"], None, run3)
    retire(root, b["id"], None, run3)            # SAME run_dir, second call
    revert(root, run3)
    store = load_store(root)
    a2 = [x for x in store["rule"]["entries"] if x["id"] == a["id"]][0]
    b2 = [x for x in store["rule"]["entries"] if x["id"] == b["id"]][0]
    assert a2["retired"] is False and a2["valid_to"] is None
    assert b2["retired"] is False and b2["valid_to"] is None

# --- Task 7 review, I2: adoption is recorded at write time, on the run ---
# --- that adopted — not inferred at revert time by comparing a run's own ---
# --- snapshot against whatever the CURRENT store happens to look like ---

def test_revert_unrelated_run_not_blocked_by_later_adoption(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _workbook_stub_seed()), _run_dir(root, "1"))
    run2 = _run_dir(root, "2")
    unrelated = _const_delta(5, key="unrelated")
    # `_const_delta` builds its title from the key; §5.2 keeps Latin out of one.
    unrelated["entries"][0]["title"] = "تلورانس نامرتبط"
    apply(root, _write(root, "d2.json", unrelated), run2)
    apply(root, _write(root, "d3.json", _real_record_delta()), _run_dir(root, "3"))
    revert(root, run2)               # run2 never touched the stub — must succeed
    store = load_store(root)
    assert [x for x in store["rule"]["entries"] if x["key"] == "unrelated"] == []

# --- Task 7 review, round 2: id-map.json and adopted.json must be write- ---
# --- once per run dir too — a RETRY of the same delta into the SAME run ---
# --- dir must not let a second apply() recompute them from the now- ---
# --- already-written store and silently erase the first call's record. ---
# --- Task 5 (v3 §4) settles it harder: `apply` now REFUSES a run dir that ---
# --- already holds an id-map.json, so `_write_once` is never reached. ---

def test_retried_apply_does_not_erase_id_map_or_adopted_json(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _workbook_stub_seed()), _run_dir(root, "1"))
    run2 = _run_dir(root, "2")
    # Adopts the stub AND mints a fresh id in the same delta, so the first
    # call's id-map.json is genuinely non-empty — not just trivially {} on
    # both calls, which an adoption-only delta would give either way.
    delta = _real_record_delta()
    delta["entries"].append({
        "id": "T-2", "kind": "rule", "key": "unrelated_mint", "title": "قانون",
        "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "1"}],
        "retired": False,
        "data": {"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                 "unit": "g", "nature": "limit", "value": 1}]}})
    d2 = _write(root, "d2.json", delta)
    report1 = apply(root, d2, run2)
    id_map_1 = json.loads((run2 / "id-map.json").read_text())
    adopted_1 = json.loads((run2 / "adopted.json").read_text())
    assert id_map_1 == report1["id_map"] and id_map_1["T-2"]   # the real mint
    assert adopted_1 != []                               # the stub really was adopted

    # `used` (Task 5) is the stronger form of the same protection: the second
    # call never gets as far as recomputing anything, so the two artifacts
    # stand exactly as the first call wrote them.
    with pytest.raises(SystemExit) as retry:
        apply(root, d2, run2)                             # SAME run_dir, SAME delta
    assert retry.value.code == 2
    id_map_2 = json.loads((run2 / "id-map.json").read_text())
    adopted_2 = json.loads((run2 / "adopted.json").read_text())
    assert id_map_2 == id_map_1                            # not silently flipped to {}
    assert adopted_2 == adopted_1                           # not silently flipped to []

    with pytest.raises(SystemExit) as e:
        revert(root, run2)
    assert e.value.code == 2
    assert "adopted workbook stub" in capsys.readouterr().err
