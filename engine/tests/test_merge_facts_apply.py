import copy, json, pathlib, subprocess, sys

import pytest

from engine_common import read_json, validate
from facts_helpers import _const_delta, _root, _run_dir, _seed_units, _units_delta, _write
from merge_facts import account_id, is_open, load_store
from merge_facts.apply import apply, simulate, used
from validate.cli import main as validate_main

def test_create_then_idempotent_reapply_is_byte_identical(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    apply(root, d, _run_dir(root, "20260901-101501"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    apply(root, d, _run_dir(root, "20260901-101502"))
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after

def test_ids_allocated_only_on_miss_and_id_map_written(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    report = apply(root, _write(root, "d1.json", _const_delta()), run)
    assert report["id_map"]["T-1"] == "F-00002"          # F-00001 was units
    assert json.loads((run / "id-map.json").read_text())["T-1"] == "F-00002"
    report2 = apply(root, _write(root, "d2.json", _const_delta(value=5)),
                    _run_dir(root, "20260901-101502"))
    assert report2["id_map"] == {}                        # hit burns no id

def test_disagreeing_value_disputes_never_overwrites(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "2"))
    store = load_store(root)
    e = [x for x in store["rule"]["entries"] if x["key"] == "tol"][0]
    assert e["data"]["outputs"][0]["value"] == 5
    assert e["status"] == "disputed"
    assert len([a for a in e["accounts"] if a["status"] == "open"]) == 2

def test_later_valid_from_supersedes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    d = _const_delta(4)
    d["entries"][0]["valid_from"] = "1405-01-01"
    apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    store = load_store(root)
    rules = [x for x in store["rule"]["entries"] if x["key"] == "tol"]
    old = [r for r in rules if r["valid_to"] is not None][0]
    new = [r for r in rules if r["valid_to"] is None][0]
    assert new["supersedes"]["ref"] == old["id"]
    assert old["superseded_by"]["ref"] == new["id"]
    assert new["data"]["outputs"][0]["value"] == 4

def test_unregistered_branch_or_department_refused_nothing_written(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(); d["entries"][0]["scope"]["branches"] = ["tehran"]
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after

def test_unit_symbol_must_be_declared_and_message_names_it(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(); d["entries"][0]["data"]["outputs"][0]["unit"] = "lb"
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False
    except SystemExit:
        pass
    assert "lb" in capsys.readouterr().err

def test_title_guard_same_kind_and_scope(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5, key="tol")), _run_dir(root, "1"))
    d = _const_delta(5, key="other_key")
    d["entries"][0]["title"] = "تلورانس tol"      # byte-equal title, new key
    try:
        apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
        assert False
    except SystemExit as e:
        assert e.code == 2

def test_original_moves_to_originals(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    e = d["entries"][0]
    e["data"]["inputs"] = [{"key": "x", "title": "ایکس", "unit": "g",
                            "from": "operator"}]
    del e["data"]["outputs"][0]["value"]   # Task 9 content check #7: a rule
                                            # with inputs carries no output value
    e["data"]["expr"] = "v = x"
    e["data"]["lang"] = "feel"
    e["data"]["original"] = "=X6"
    report = apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    fid = report["id_map"]["T-1"]
    assert (root / "facts" / "originals" / f"{fid}.txt").read_text() == "=X6"
    store = load_store(root)
    entry = [x for x in store["rule"]["entries"] if x["id"] == fid][0]
    assert entry["data"]["original_ref"] == f"facts/originals/{fid}.txt"
    assert "original" not in entry["data"]

def test_dependency_order_item_record_measurement_in_one_delta(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    delta = {"schema_version": 2, "entries": [
        {"id": "T-3", "kind": "measurement", "key": "advisory",
         "title": "ثبت وزنی", "statement": "s",
         "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "1"}],
         "retired": False,
         "data": {"of": {"ref": "T-1"}, "quantity": "mass", "unit": "g",
                  "writes_to": {"ref": "T-2", "field": "end_stock"}}},
        {"id": "T-1", "kind": "item", "key": "ing_15", "title": "بیکن",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "2"}],
         "retired": False, "data": {"category": "ingredient", "unit": "g"}},
        {"id": "T-2", "kind": "record", "key": "mande_shab", "title": "مانده شب",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "photo", "ref": "departments/cooking/attachments/p.jpg"}],
         "retired": False,
         "data": {"medium": "paper", "role": "log", "location": {"path": "x"},
                  "fields": [{"key": "end_stock", "title": "مانده آخر",
                              "type": "number", "unit": "g"}]}}]}
    report = apply(root, _write(root, "d1.json", delta), _run_dir(root, "1"))
    store = load_store(root)
    m = store["measurement"]["entries"][0]
    assert m["key"] == "ing_15__mande_shab__end_stock"     # derived by merge
    assert m["data"]["of"]["ref"] == report["id_map"]["T-1"]
    assert m["data"]["writes_to"]["ref"] == report["id_map"]["T-2"]

def test_row_keys_derived_on_reference_record(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    delta = {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "item", "key": "prod_61", "title": "پیتزا",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False, "data": {"category": "product", "unit": "pcs"}},
        {"id": "T-2", "kind": "item", "key": "ing_1", "title": "پنیر",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False, "data": {"category": "ingredient", "unit": "g"}},
        {"id": "T-4", "kind": "record", "key": "mavad__pizza", "title": "BOM",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False,
         "data": {"medium": "sheet", "role": "reference",
                  "location": {"spreadsheetId": "S", "sheetId": 2, "sheet": "پیتزا",
                               "hidden": False},
                  "primaryKey": ["product", "ingredient"],
                  "fields": [
                      {"key": "product", "title": "محصول", "type": "string",
                       "refItems": {"namespace": "#", "resolved_by": "code"}},
                      {"key": "ingredient", "title": "ماده", "type": "string",
                       "refItems": {"namespace": "##", "resolved_by": "code"}},
                      {"key": "grams", "title": "گرم", "type": "number", "unit": "g"}],
                  "rows": [{"key": "r1", "product": "prod_61",
                            "ingredient": "ing_1", "grams": 250}]}}]}
    apply(root, _write(root, "d1.json", delta), _run_dir(root, "1"))
    store = load_store(root)
    rec = [e for e in store["record"]["entries"] if e["key"] == "mavad__pizza"][0]
    assert rec["data"]["rows"][0]["key"] == "prod_61__ing_1"   # derived, delta's advisory

def test_cli_apply_via_subprocess(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    run = _run_dir(root, "20260901-121500")
    proc = subprocess.run([sys.executable, "-m", "merge.cli", "facts", "apply",
                           "--delta", str(d), "--run", str(run)],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": ""}
                          | {"SCHEMA_DIR": str(pathlib.Path(__file__).resolve().parents[2] / "schemas"),
                             "SYSTEMROOT": ""})
    assert proc.returncode == 0, proc.stderr


# --- checklist items the §17 cases above do not reach ---------------------- #

def _stub_delta():
    return {"schema_version": 2, "entries": [
        {"id": "T-9", "kind": "record", "key": "ext_abc", "title": "کتاب ناشناخته",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "script", "ref": "attachments/sheets/G/G.gs"}],
         "retired": False,
         "data": {"stub": True, "grain": "workbook", "medium": "sheet",
                  "role": "log", "location": {"spreadsheetId": "S"}}},
        {"id": "T-1", "kind": "rule", "key": "uses_stub", "title": "خواندن از دور",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "script", "ref": "attachments/sheets/G/G.gs",
                     "function": "f"}],
         "retired": False,
         "data": {"inputs": [{"key": "x", "title": "ایکس", "unit": "g",
                              "from": {"ref": "T-9", "field": "col_x"}}],
                  "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                               "nature": "limit"}],
                  "lang": "feel", "expr": "v = x"}}]}


def test_run_directory_keeps_the_delta_the_id_map_and_a_before_snapshot(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    d = _write(root, "d1.json", _const_delta())
    apply(root, d, run)
    assert json.loads((run / "facts-delta.json").read_text(encoding="utf-8")) \
        == json.loads(d.read_text(encoding="utf-8"))
    assert json.loads((run / "id-map.json").read_text(encoding="utf-8")) == \
        {"T-1": "F-00002"}
    before = run / "facts-before"                      # Task 7's revert reads it
    assert sorted(p.name for p in before.glob("*.json")) == [
        "items.json", "measurements.json", "notes.json", "records.json",
        "rules.json"]
    # the snapshot is the store as it stood BEFORE this run
    assert json.loads((before / "rules.json").read_text(encoding="utf-8"))["entries"] == []


def test_delta_already_in_the_run_directory_is_kept_pristine(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    d = run / "facts-delta.json"          # where the pipeline itself writes it
    d.write_text(json.dumps(_const_delta(), ensure_ascii=False), encoding="utf-8")
    report = apply(root, d, run)
    assert report["created"] == ["F-00002"]
    written = json.loads(d.read_text(encoding="utf-8"))
    assert written["entries"][0]["id"] == "T-1"          # not rewritten in place


def _freeze(root, name="rules.json", when="2000-01-01T00:00:00Z"):
    """Stamp a time no clock in this test can produce, so a second apply that
    rewrites an untouched entry cannot hide inside the same wall-clock second
    as the first (`updated_at` has one-second resolution)."""
    def _rewrite(path, ids=None):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for e in doc["entries"]:
            if ids is None or e["id"] in ids:
                e["updated_at"] = when
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
        return {e["id"] for e in doc["entries"]}

    ids = _rewrite(root / "facts" / name)
    _rewrite(root / "facts" / ".index.json", ids)   # the index carries it too
    return when


def test_delta_carrying_an_original_is_idempotent(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    del d["entries"][0]["data"]["outputs"][0]["value"]   # Task 9 content check
                                                          # #7: inputs != [] ⇒
                                                          # no output value
    d["entries"][0]["data"].update({"inputs": [{"key": "x", "title": "ایکس",
                                                "unit": "g", "from": "operator"}],
                                    "expr": "v = x", "lang": "feel",
                                    "original": "=X6"})
    p = _write(root, "d1.json", d)
    apply(root, p, _run_dir(root, "1"))
    _freeze(root)
    before = {q.name: q.read_bytes() for q in (root / "facts").glob("*.json")}
    apply(root, p, _run_dir(root, "2"))
    after = {q.name: q.read_bytes() for q in (root / "facts").glob("*.json")}
    assert before == after


def test_deferred_edge_into_a_stub_is_allowed(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    report = apply(root, _write(root, "d1.json", _stub_delta()), _run_dir(root, "1"))
    rule = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "uses_stub"][0]
    assert rule["data"]["inputs"][0]["from"]["ref"] == report["id_map"]["T-9"]


def test_reference_to_no_entry_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _stub_delta()
    d["entries"] = [d["entries"][1]]                   # the stub itself is gone
    d["entries"][0]["data"]["inputs"][0]["from"] = {"ref": "F-99999"}
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2


def test_key_is_immutable_for_a_matched_sheet_record(tmp_path):
    root = _root(tmp_path); _seed_units(root)

    def sheet_record(key):
        return {"schema_version": 2, "entries": [
            {"id": "T-1", "kind": "record", "key": key, "title": "گزارش روزانه",
             "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
             "source": [{"type": "sheet", "ref": "attachments/sheets/G/G.xlsx"}],
             "retired": False,
             "data": {"medium": "sheet", "role": "log",
                      "location": {"spreadsheetId": "S", "sheetId": 1,
                                   "sheet": "روزانه", "hidden": False}}}]}

    apply(root, _write(root, "d1.json", sheet_record("g__ruzane")), _run_dir(root, "1"))
    try:
        apply(root, _write(root, "d2.json", sheet_record("g__daily")),
              _run_dir(root, "2"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2


def test_updated_at_moves_only_when_the_run_changes_the_entry(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta(key="tol"))
    apply(root, d, _run_dir(root, "1"))
    frozen = _freeze(root)
    apply(root, d, _run_dir(root, "2"))                  # the same delta again
    assert load_store(root)["rule"]["entries"][0]["updated_at"] == frozen
    apply(root, _write(root, "d2.json", _const_delta(4, key="tol")),
          _run_dir(root, "3"))                           # now it disputes
    entry = load_store(root)["rule"]["entries"][0]
    assert entry["updated_at"] != frozen
    assert entry["status"] == "disputed"


# --- QF-43 scope creation, QF-20 stubs, QF-15 duplicate natural key -------- #

def test_creating_for_another_department_is_refused_but_adding_to_it_is_not(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    try:                                        # a cooking run, an accounting fact
        apply(root, _write(root, "dx.json", _const_delta(dept="management")),
              _run_dir(root, "9"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before
    mrun = root / "runs" / "facts" / "management" / "1"      # its own run may
    mrun.mkdir(parents=True)
    apply(root, _write(root, "dm.json", _const_delta(dept="management")), mrun)
    apply(root, _write(root, "d2.json", _const_delta(4, dept="management")),
          _run_dir(root, "3"))                  # and cooking may contradict it
    entry = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"][0]
    assert entry["status"] == "disputed"
    assert len([a for a in entry["accounts"] if a["status"] == "open"]) == 2


def _record_stub_delta(stub=True):
    data = {"medium": "sheet", "role": "log",
            "location": {"spreadsheetId": "S", "sheetId": 3, "sheet": "روزانه",
                         "hidden": False}}
    if stub:
        data["stub"] = True
    else:
        data["location"]["sheetId"] = 4          # the positional hint drifted
        data["fields"] = [{"key": "end_stock", "title": "مانده", "type": "number",
                           "unit": "g"}]
    return {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "record", "key": "s__ruzane",
         "title": "برگه" if stub else "گزارش روزانه", "statement": "s",
         "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/S/S.xlsx"}],
         "retired": False, "data": data}]}


def test_record_stub_is_created_once_and_filled_once_with_no_key_change(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    created = apply(root, _write(root, "d1.json", _record_stub_delta()),
                    _run_dir(root, "1"))
    fid = created["id_map"]["T-1"]
    filled = apply(root, _write(root, "d2.json", _record_stub_delta(stub=False)),
                   _run_dir(root, "2"))
    assert filled["id_map"] == {} and filled["updated"] == [fid]   # no second entry
    records = [e for e in load_store(root)["record"]["entries"] if e["id"] == fid]
    assert len(records) == 1
    rec = records[0]
    assert rec["key"] == "s__ruzane"                     # QF-34: no key change
    assert "stub" not in rec["data"]
    assert rec["title"] == "گزارش روزانه"                 # overwritten outright
    assert rec["data"]["location"]["sheetId"] == 4        # and so is location
    assert rec["data"]["fields"][0]["key"] == "end_stock"
    assert rec.get("accounts", []) == []                 # the empty stub disputed nothing
    assert rec["status"] == "confirmed"


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


def test_workbook_stub_is_adopted_and_measurement_keys_are_rederived(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    seed = apply(root, _write(root, "d1.json", _workbook_stub_seed()),
                 _run_dir(root, "1"))
    stub_id, measurement_id = seed["id_map"]["T-2"], seed["id_map"]["T-3"]
    store = load_store(root)
    assert store["measurement"]["entries"][0]["key"] == \
        "ing_7__ext_9f1c2d3e4a5b__masraf"
    report = apply(root, _write(root, "d2.json", _real_record_delta()),
                   _run_dir(root, "2"))
    assert report["id_map"] == {}                        # the stub's id is reused
    assert set(report["updated"]) == {stub_id, measurement_id}
    store = load_store(root)
    records = [e for e in store["record"]["entries"] if e["id"] == stub_id]
    assert len(records) == 1 and len(store["record"]["entries"]) == 2   # units + it
    rec = records[0]
    assert rec["key"] == "w__ruzane"                     # QF-34's other key change
    assert "stub" not in rec["data"] and "grain" not in rec["data"]
    assert rec["data"]["fields"][0]["key"] == "masraf"
    assert store["measurement"]["entries"][0]["key"] == "ing_7__w__ruzane__masraf"


def test_duplicate_natural_key_in_one_delta_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    twin = copy.deepcopy(d["entries"][0])
    twin["id"], twin["title"] = "T-2", "تلورانس دیگر"     # same kind, key and scope
    d["entries"].append(twin)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


def test_duplicate_sheet_identity_in_one_delta_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _record_stub_delta(stub=False)
    twin = copy.deepcopy(d["entries"][0])                # same tab, second key
    twin["id"], twin["key"] = "T-2", "s__ruzane_dobare"
    twin["title"] = "همان تب، کلید دیگر"
    d["entries"].append(twin)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


# --- a stub delta re-read, minted row keys, and the ladder's dispute verdict - #

def test_stub_delta_reapplied_is_byte_identical(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _record_stub_delta())
    apply(root, d, _run_dir(root, "1"))
    _freeze(root, "records.json")
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    apply(root, d, _run_dir(root, "2"))
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after


def test_a_stale_stub_delta_never_restubs_a_filled_record(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    stub = _write(root, "d1.json", _record_stub_delta())
    apply(root, stub, _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _record_stub_delta(stub=False)),
          _run_dir(root, "2"))
    _freeze(root, "records.json")
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    apply(root, stub, _run_dir(root, "3"))           # the old stub delta, again
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after
    rec = [e for e in load_store(root)["record"]["entries"]
           if e["key"] == "s__ruzane"][0]
    assert "stub" not in rec["data"]
    assert rec["title"] == "گزارش روزانه"             # the stale title disputed nothing
    assert rec.get("accounts", []) == [] and rec["status"] == "confirmed"
    index = json.loads((root / "facts" / ".index.json").read_text(encoding="utf-8"))
    assert [r for r in index["entries"] if r["id"] == rec["id"]][0]["stub"] is False


def _log_record_delta():
    return {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "record", "key": "barge_shab", "title": "برگه شب",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "photo",
                     "ref": "departments/cooking/attachments/p.jpg"}],
         "retired": False,
         "data": {"medium": "paper", "role": "log", "location": {"path": "x"},
                  "primaryKey": ["item"],
                  "fields": [{"key": "item", "title": "قلم", "type": "string"},
                             {"key": "qty", "title": "تعداد", "type": "number",
                              "unit": "g"}],
                  "rows": [{"key": "row_one", "item": "borger", "qty": 1},
                           {"key": "row_two", "item": "pitza", "qty": 2}]}}]}


def test_minted_row_keys_on_a_log_record_survive(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _log_record_delta())
    apply(root, d, _run_dir(root, "1"))
    apply(root, d, _run_dir(root, "2"))              # and a second apply too
    rec = [e for e in load_store(root)["record"]["entries"]
           if e["key"] == "barge_shab"][0]
    assert [r["key"] for r in rec["data"]["rows"]] == ["row_one", "row_two"]


def test_config_table_row_keys_are_not_rederived(tmp_path):
    root = _root(tmp_path)
    d = _units_delta()
    d["entries"][0]["data"]["rows"] = [
        {"key": "gram", "symbol": "g", "dimension": "mass",
         "factor_to_base": 1, "unit_title": "گرم"}]
    apply(root, _write(root, "d0.json", d), _run_dir(root, "0"))
    rec = load_store(root)["record"]["entries"][0]
    assert rec["data"]["rows"][0]["key"] == "gram"   # not re-keyed to `g`


def test_prose_only_change_with_a_later_valid_from_does_not_supersede(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    d = _const_delta(5)
    d["entries"][0]["statement"] = "حد مجاز، به بیان دیگر"
    d["entries"][0]["valid_from"] = "1405-01-01"
    apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    rules = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"]
    assert len(rules) == 1                           # prose never disputes ...
    assert rules[0]["statement"] == "حد مجاز"        # ... and is never rewritten
    assert rules[0]["valid_to"] is None


# --------------------------------------------------------------------------- #
# accounts: whose era they belong to, and where their id comes from
# --------------------------------------------------------------------------- #

VALUE_PATH = "data/outputs/v/value"


def _account(value, lines="12"):
    """One account as a DELTA writes it — no `id`: `facts-delta.schema.json`
    omits `accounts[].id` on purpose (the agent mints no ids, INV-1)."""
    return {"field": VALUE_PATH, "statement": str(value), "value": value,
            "source": {"type": "voice", "ref": "meetings/transcripts/c.txt",
                       "lines": lines},
            "status": "open"}


def _tol(store):
    return [e for e in store["rule"]["entries"] if e["key"] == "tol"]


def test_a_successor_does_not_inherit_the_superseded_eras_accounts(tmp_path):
    """§11: an account is a competing reading of the value the successor has
    just replaced, so it stays with the predecessor.

    Inherited, it made the successor `disputed` on a dispute that is not its
    own — never confirmable, since the confirm gate refuses a red entry — and
    it handed `resolve` the dead era's number to install over the live one.
    """
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(9)), _run_dir(root, "2"))
    d = _const_delta(12); d["entries"][0]["valid_from"] = "1405-01-01"
    apply(root, _write(root, "d3.json", d), _run_dir(root, "3"))

    rules = _tol(load_store(root))
    old = [r for r in rules if r["valid_to"] is not None][0]
    new = [r for r in rules if r["valid_to"] is None][0]
    assert new.get("accounts", []) == []
    assert new["status"] == "confirmed"              # not born disputed
    assert new["data"]["outputs"][0]["value"] == 12
    # …and the predecessor keeps its own, which is where the record lives on.
    assert [a["value"] for a in old["accounts"]] == [5, 9]
    assert all(a["status"] == "open" for a in old["accounts"])
    assert old["status"] == "disputed"


def test_a_successor_keeps_the_accounts_its_own_delta_states(tmp_path):
    """The other half: dropping the old era's accounts must not swallow the
    competing readings the superseding run itself brought."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    d = _const_delta(12)
    d["entries"][0]["valid_from"] = "1405-01-01"
    d["entries"][0]["accounts"] = [_account(11)]
    apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    new = [r for r in _tol(load_store(root)) if r["valid_to"] is None][0]
    assert [a["value"] for a in new["accounts"]] == [11]
    assert new["accounts"][0]["id"] == account_id(
        VALUE_PATH, "11", 11, _account(11)["source"])


def test_a_delta_carrying_an_account_applies_and_the_id_is_minted(tmp_path):
    """QF-43: a run may add an account to any entry. The delta schema omits
    `accounts[].id` and `facts.schema.json` requires one, so `save_store`
    refused the whole run — exit 2, nothing written — until the ladder minted
    it, on a create and on a merge alike."""
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(5)
    d["entries"][0]["accounts"] = [_account(4)]
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))      # create
    entry = _tol(load_store(root))[0]
    minted = account_id(VALUE_PATH, "4", 4, _account(4)["source"])
    assert [a["id"] for a in entry["accounts"]] == [minted]

    d2 = _const_delta(5)
    d2["entries"][0]["accounts"] = [_account(3, lines="13")]
    apply(root, _write(root, "d2.json", d2), _run_dir(root, "2"))     # merge
    entry = _tol(load_store(root))[0]
    assert [a["id"] for a in entry["accounts"]] == [
        minted, account_id(VALUE_PATH, "3", 3, _account(3, lines="13")["source"])]


# --- QF-5: a `source[].ref` is a PATH relative to data-repo, and an ---
# --- unresolvable one fails apply — except an estate .xlsx, which is ---
# --- server-local and whose absence is `check`'s report to make      ---

def _cited(ref, kind="sheet"):
    d = _const_delta(5)
    d["entries"][0]["source"] = [{"type": kind, "ref": ref}]
    return d


def test_a_source_ref_that_is_not_a_path_fails_apply(tmp_path, capsys):
    """The shape 575 stored citations carry: a bare Google Drive spreadsheet
    id where QF-5 puts a path. It resolves to no file, so the Panel's one
    download route can serve nothing for it — «File wasn't available on site»,
    the owner's report of 2026-09-06. QF-5 has always said this fails `apply`;
    until now nothing implemented it, which is how they were written."""
    root = _root(tmp_path); _seed_units(root)
    with pytest.raises(SystemExit):
        apply(root, _write(root, "d.json",
                           _cited("12Q9yQLrfJaWkasZfeK8ACp131CBgjhJ8mRkvQYC04P8")),
              _run_dir(root, "1"))
    assert "source" in capsys.readouterr().err


def test_a_missing_estate_xlsx_still_applies(tmp_path):
    """The one exemption, and it has to be tested or the check above would be
    satisfied by refusing everything: an `.xlsx` under `attachments/sheets/`
    is server-local and not in git, so its absence is reported by `check` as
    "estate not present" and never fails a write."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d.json", _cited("attachments/sheets/M/M.xlsx")),
          _run_dir(root, "1"))
    assert _tol(load_store(root))[0]["source"][0]["hash"] is None


def test_a_missing_script_beside_it_does_not_get_the_exemption(tmp_path):
    """`.gs` and `.structure.md` live in git beside the workbook, so only the
    binary is exempt. Written because the natural way to implement the rule —
    "anything under attachments/sheets/" — passes the test above while leaving
    23 of the store's broken citations unrefused."""
    root = _root(tmp_path); _seed_units(root)
    with pytest.raises(SystemExit):
        apply(root, _write(root, "d.json",
                           _cited("attachments/sheets/M/M.gs", kind="script")),
              _run_dir(root, "1"))


def test_an_accounts_source_is_checked_too(tmp_path):
    """`accounts[].source` is evidence for one side of a dispute and is cited
    on the same screen through the same route, so it takes the same rule."""
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(5)
    d["entries"][0]["accounts"] = [_account(4)]
    d["entries"][0]["accounts"][0]["source"] = {"type": "sheet", "ref": "nowhere/x.xlsx"}
    with pytest.raises(SystemExit):
        apply(root, _write(root, "d.json", d), _run_dir(root, "1"))


# --- v3 §4: the precondition module, the in-memory apply, the used guard --- #

def test_simulate_leaves_the_store_and_the_id_ledger_byte_identical(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    ledger = root / "facts" / ".id-seq.json"
    before_ledger = ledger.read_bytes()
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    d = _write(root, "d1.json", _const_delta())
    run_dir = _run_dir(root, "20260901-101501")
    store, problems = simulate(root, d, run_dir)
    assert problems == []
    assert ledger.read_bytes() == before_ledger        # minted in memory only
    assert list(run_dir.iterdir()) == []               # and nothing in the run dir
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before
    assert [e["id"] for e in store["rule"]["entries"]] == ["F-00002"]


def test_a_declared_unit_symbol_in_a_statement_survives_the_content_pass(tmp_path):
    """QF-40's symbols are the run's own vocabulary. `preconditions` already
    computes them for its unit check, and the content pass has to be handed the
    same list — otherwise a statement naming one is a Latin leak at Stage V,
    after `validate facts-unit` and `assemble` both passed it, and the unit
    burns its second attempt on a sentence that was never wrong."""
    root = _root(tmp_path); _seed_units(root)
    delta = _units_delta()
    delta["entries"][0]["data"]["rows"].append(
        {"key": "portion", "symbol": "portion", "dimension": "count",
         "factor_to_base": 1, "unit_title": "پرس"})
    rule = _const_delta()["entries"][0]
    rule["id"], rule["statement"] = "T-2", "حد مجاز برای هر portion است."
    delta["entries"].append(rule)
    d = _write(root, "d1.json", delta)
    assert simulate(root, d, _run_dir(root, "20260901-101501"))[1] == []


def test_simulate_catches_a_store_schema_failure_the_delta_passes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    validate("facts-delta.schema.json", read_json(d))       # the delta is fine
    # `_upsert` leaves every creation with `updated_at: null`, which
    # `facts.schema.json` refuses — only `_stamp` turns it into a timestamp.
    # That is why the derived half was split off the writing half, and why
    # `--store --run` validates the STORE the delta would write, not the delta.
    _, problems = simulate(root, d, _run_dir(root, "20260901-101501"),
                           now="the ninth of Shahrivar")
    assert any("would write is invalid" in p for p in problems)
    store, problems = simulate(root, d, _run_dir(root, "20260901-101502"))
    assert problems == []
    assert store["rule"]["entries"][0]["updated_at"] == "2026-01-01T00:00:00Z"


def test_apply_refuses_a_second_delta_into_a_used_run_directory(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    apply(root, _write(root, "d1.json", _const_delta()), run)
    assert used(run)
    assert not used(_run_dir(root, "20260901-101502"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    with pytest.raises(SystemExit) as e:
        apply(root, _write(root, "d2.json", _const_delta(key="tol2")), run)
    assert e.value.code == 2
    assert "already" in capsys.readouterr().err
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after


def test_validate_store_run_groups_one_rule_into_one_line(tmp_path, capsys,
                                                          monkeypatch):
    root = _root(tmp_path); _seed_units(root)
    monkeypatch.setenv("DATA_ROOT", str(root))
    d = _const_delta()
    d["entries"][0]["scope"]["branches"] = ["tehran"]       # not in the manifest
    second = copy.deepcopy(d["entries"][0])
    second.update({"id": "T-2", "key": "tol2", "title": "تلورانس دوم"})
    d["entries"].append(second)
    path = _write(root, "dx.json", d)
    run = _run_dir(root, "20260901-101501")
    with pytest.raises(SystemExit) as e:
        validate_main(["facts-delta", str(path), "--store", "--run", str(run)])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert err.count("is not in attachments/sheets/manifest.json") == 1
    assert "2 entries: T-1, T-2" in err


# --- v3: record templates, instance identity, the used marker -------------- #

_TABS = {"pz__s10": ("P0", 10, "chalebagh"), "pz__s11": ("P1", 11, "chalebagh"),
         "pz__s12": ("P2", 12, "naharkhoran")}


def _template_delta(key="gozaresh_shabane_pitza", instances=("pz__s11", "pz__s12"),
                    branches=("chalebagh", "naharkhoran"), location="pz__s12"):
    """A v3 record template (QF-47): one entry, one `instances[]` member per tab
    it repeats on. `location` is still required by the delta schema, and is
    written here as the WRONG instance on purpose — `apply` recomputes it."""
    members = [{"key": k, "spreadsheetId": _TABS[k][0], "sheetId": _TABS[k][1],
                "sheet": "پیتزا", "branch": _TABS[k][2], "hidden": False}
               for k in instances]
    pointed = _TABS[location]
    return {"schema_version": 2, "entries": [{
        "id": "T-1", "kind": "record", "key": key,
        "title": "گزارش شبانهٔ پیتزا",
        "statement": "گزارش هر شب لاین پیتزا را ثبت می‌کند.",
        "scope": {"departments": ["cooking"], "branches": list(branches)},
        "source": [{"type": "sheet", "ref": "attachments/sheets/G/G.xlsx",
                    "sheet": "پیتزا"}],
        "retired": False,
        "data": {"medium": "sheet", "role": "report",
                 "location": {"spreadsheetId": pointed[0], "sheetId": pointed[1],
                              "sheet": "پیتزا", "hidden": False},
                 "instances": members,
                 "fields": [{"key": "masraf_elami", "title": "مصرف اعلامی",
                             "type": "number", "unit": "g",
                             "columns": {k: "H" for k in instances}}]}}]}


def _record(root, key="gozaresh_shabane_pitza"):
    return [e for e in load_store(root)["record"]["entries"] if e["key"] == key][0]


def test_a_template_scoped_to_both_branches_applies_and_location_is_derived(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _template_delta()), _run_dir(root, "1"))
    rec = _record(root)
    assert rec["scope"]["branches"] == ["chalebagh", "naharkhoran"]
    assert [i["key"] for i in rec["data"]["instances"]] == ["pz__s11", "pz__s12"]
    # the first instance in ascending key order, not the delta's own pointer
    assert rec["data"]["location"] == {"spreadsheetId": "P1", "sheetId": 11,
                                       "sheet": "پیتزا", "hidden": False}


def test_a_second_run_over_another_instance_extends_and_raises_no_account(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _template_delta()), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json",
                       _template_delta(instances=("pz__s10", "pz__s11"),
                                       location="pz__s10")),
          _run_dir(root, "2"))
    rec = _record(root)
    assert len(load_store(root)["record"]["entries"]) == 2      # units + it
    assert [i["key"] for i in rec["data"]["instances"]] == \
        ["pz__s11", "pz__s12", "pz__s10"]
    assert rec["data"]["location"]["spreadsheetId"] == "P0"     # recomputed
    assert rec.get("accounts", []) == []                        # §4: no dispute
    assert rec["status"] == "confirmed"


def test_an_instance_match_under_another_key_is_refused_nothing_written(tmp_path,
                                                                        capsys):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _template_delta()), _run_dir(root, "1"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    d = _template_delta(key="gozaresh_pitza")
    # A DIFFERENT title as well as a different key: the same-title road is the
    # title twin's (QF-34), and it would refuse this delta before the instance
    # guard was ever asked — hiding the one §3.2 case this test is for.
    d["entries"][0]["title"] = "گزارش پیتزا"
    with pytest.raises(SystemExit) as exc:
        apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "already belongs to" in err                  # the instance guard's
    assert "in this kind and scope" not in err          # not the title twin's
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


def test_a_crash_before_the_id_map_still_marks_the_run_directory(tmp_path,
                                                                 monkeypatch):
    """Task 5 review: `used` keyed on `id-map.json` alone, and `_write` writes
    that AFTER `save_store` — so a crash in between left a mutated store in a
    run directory nothing marked, and the retry applied the same delta twice.
    The snapshot is the FIRST artefact `_write` makes, so it is the marker."""
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    # The id ledger is deliberately out of this comparison: a crashed run burns
    # the id it minted, which is the cheap half. The five store files are the
    # expensive half, and they must not have moved.
    def _store_files():
        return {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")
                if p.name != ".id-seq.json"}

    before = _store_files()

    def _boom(*_a, **_k):
        raise OSError("no space left on device")

    monkeypatch.setattr("merge_facts.apply.save_store", _boom)
    with pytest.raises(OSError):
        apply(root, _write(root, "d1.json", _const_delta(key="tol2")), run)
    assert (run / "facts-before").exists()                      # the snapshot
    assert not (run / "id-map.json").exists()                   # never reached
    assert _store_files() == before
    assert used(run)
    monkeypatch.undo()
    with pytest.raises(SystemExit) as exc:
        apply(root, _write(root, "d2.json", _const_delta(key="tol2")), run)
    assert exc.value.code == 2


def _note_delta(key, title):
    return {"schema_version": 2, "entries": [{
        "id": "T-1", "kind": "note", "key": key, "title": title,
        "statement": "واحد این مقدار در جدول واحدها نیامده است.",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                    "lines": "7"}],
        "retired": False,
        "data": {"about": [{"ref": "F-00001"}],
                 "question": "واحد این مقدار چیست؟"}}]}


def test_the_title_twin_guard_covers_notes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "n1.json", _note_delta("note_aa11bb22cc33", "واحد نامعلوم")),
          _run_dir(root, "1"))
    with pytest.raises(SystemExit) as exc:
        apply(root, _write(root, "n2.json",
                           _note_delta("note_aa11bb22cc34", "واحد نامعلوم")),
              _run_dir(root, "2"))
    assert exc.value.code == 2


def test_a_supersession_with_no_valid_from_closes_with_the_run_date(tmp_path):
    import jdatetime
    root = _root(tmp_path); _seed_units(root)
    first = apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    old_id = first["id_map"]["T-1"]
    d = _const_delta(4)
    d["entries"][0]["supersedes"] = {"ref": old_id}      # no valid_from at all
    apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    rules = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"]
    old = [r for r in rules if r["id"] == old_id][0]
    new = [r for r in rules if r["id"] != old_id][0]
    assert old["valid_to"] == jdatetime.date.today().strftime("%Y-%m-%d")
    assert old["superseded_by"]["ref"] == new["id"]
    assert not is_open(old) and is_open(new)
    assert new["data"]["outputs"][0]["value"] == 4


def test_is_open_is_false_once_superseded_by_is_set():
    assert is_open({"retired": False, "valid_to": None})
    assert not is_open({"retired": False, "valid_to": None,
                        "superseded_by": {"ref": "F-00009"}})


def _bound_rule_delta():
    """A v3 rule: `applies_to[]` bindings the engine wrote, one parameter that
    is a column reference, and an input reading that parameter (§2.5)."""
    return {"schema_version": 2, "entries": [{
        "id": "T-2", "kind": "rule", "key": "enheraf_ba_tolerance",
        "title": "انحراف با تلورانس",
        "statement": "انحراف مصرف پس از کسر تلورانس هر پرس محاسبه می‌شود.",
        "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
        "source": [{"type": "sheet", "ref": "attachments/sheets/G/G.xlsx",
                    "sheet": "پیتزا", "cell": "L6"}],
        "retired": False,
        "data": {"inputs": [
                     {"key": "enheraf", "title": "انحراف", "unit": "g",
                      "from": {"ref": "T-1", "field": "masraf_elami"}},
                     {"key": "tolerance_gr", "title": "تلورانس", "unit": "g",
                      "from": {"param": "tolerancePerFoodGr"}}],
                 "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                              "nature": "observed"}],
                 "lang": "feel", "expr": "v = enheraf - tolerance_gr",
                 "applies_to": [
                     {"key": "pz__s11__l__r6", "record": {"ref": "T-1",
                                                          "field": "masraf_elami"},
                      "variant": 1, "range": "L6:L15",
                      "params": {"tolerancePerFoodGr": 5,
                                 "ref_1": {"ref": "T-1", "field": "masraf_elami"}},
                      "rows": [{"key": "r6", "row": 6, "label": "پنیر پیتزا",
                                "item": "##1"}]}]}}]}


def test_apply_accepts_the_v3_rule_members_and_checks_their_field_refs(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _template_delta(instances=("pz__s11",), branches=("chalebagh",),
                        location="pz__s11")
    d["entries"].append(_bound_rule_delta()["entries"][0])
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    rule = [e for e in load_store(root)["rule"]["entries"]
            if e["key"] == "enheraf_ba_tolerance"][0]
    record_id = _record(root)["id"]
    binding = rule["data"]["applies_to"][0]
    assert binding["record"]["ref"] == record_id                  # temp id rewritten
    assert binding["params"]["ref_1"]["ref"] == record_id         # inside params too
    assert binding["params"]["tolerancePerFoodGr"] == 5
    assert rule["data"]["inputs"][1]["from"] == {"param": "tolerancePerFoodGr"}

    bad = _template_delta(instances=("pz__s11",), branches=("chalebagh",),
                          location="pz__s11")
    rule_entry = _bound_rule_delta()["entries"][0]
    rule_entry["data"]["applies_to"][0]["params"]["ref_1"]["field"] = "nadarad"
    bad["entries"].append(rule_entry)
    with pytest.raises(SystemExit) as exc:
        apply(root, _write(root, "d2.json", bad), _run_dir(root, "2"))
    assert exc.value.code == 2
