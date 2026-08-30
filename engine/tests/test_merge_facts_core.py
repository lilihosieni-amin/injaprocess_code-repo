import json

from merge_facts import (KIND_FILES, KIND_ORDER, account_id, build_index,
                         canonical_scope, derive_status, find_match, get_path,
                         is_open, iter_ref_objects, load_store, null_paths,
                         path_exists, save_store)

def _entry(**over):
    e = {"id": "F-00001", "kind": "rule", "key": "k1", "title": "t",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [], "status": "confirmed", "retired": False,
         "updated_at": "2026-09-01T10:00:00Z",
         "data": {"inputs": [], "outputs": [{"key": "v", "title": "و", "unit": "g",
                                             "nature": "limit", "value": 5}]}}
    e.update(over)
    return e

def test_canonical_scope_sorts_and_dedups():
    assert canonical_scope({"departments": ["b", "a", "a"]}) == \
        {"departments": ["a", "b"], "branches": []}

def test_status_ladder_order():
    e = _entry()
    assert derive_status(e) == "confirmed"
    e["field_status"] = {"data/outputs/v/value": "inferred"}
    assert derive_status(e) == "inferred"
    e["field_status"] = {"data/outputs/v/value": "informal"}
    assert derive_status(e) == "informal"
    e["data"]["outputs"][0]["value"] = None
    assert derive_status(e) == "unknown"
    e["accounts"] = [{"id": "00000000", "field": "data/expr", "statement": "x",
                      "source": {"type": "chat", "ref": None}, "status": "open"}]
    assert derive_status(e) == "disputed"          # disputed wins over unknown

def test_null_paths_walks_keyed_arrays_and_rows():
    e = _entry(kind="record", data={
        "medium": "paper", "role": "log", "location": {"path": "p"},
        "fields": [{"key": "start_stock", "title": "م", "type": "number", "unit": None}],
        "rows": [{"key": "burger", "title": "برگر", "grams": None}]})
    assert set(null_paths(e)) == {"data/fields/start_stock/unit",
                                  "data/rows/burger/grams"}

def test_omitted_key_is_not_a_null_path():
    e = _entry()          # no 'identifier', no 'valid_to' inside data
    assert null_paths(e) == []

def test_path_grammar():
    e = _entry(kind="record", data={"medium": "sheet", "role": "reference",
        "location": {}, "fields": [{"key": "grams", "title": "گرم", "unit": "g"}],
        "rows": [{"key": "prod_61__ing_1", "grams": 250}]})
    assert get_path(e, "data/rows/prod_61__ing_1/grams") == 250
    assert path_exists(e, "data/fields/grams/unit")
    assert not path_exists(e, "data/fields/nope/unit")

def test_find_match_prefers_sheet_identity_then_natural_key():
    store = {k: {"schema_version": 1, "entries": []} for k in KIND_ORDER}
    a = _entry(kind="record", key="old_key",
               data={"medium": "sheet", "role": "reference",
                     "location": {"spreadsheetId": "S1", "sheet": "پیتزا"}})
    store["record"]["entries"].append(a)
    probe = _entry(kind="record", key="renamed",
                   data={"medium": "sheet", "role": "reference",
                         "location": {"spreadsheetId": "S1", "sheet": "پیتزا"}})
    assert find_match(store, probe) is a          # matched by (spreadsheetId, sheet)
    b = _entry(kind="rule", key="k1")
    store["rule"]["entries"].append(b)
    assert find_match(store, _entry(kind="rule", key="k1")) is b
    closed = _entry(kind="rule", key="k2", valid_to="1404-01-01")
    store["rule"]["entries"].append(closed)
    assert find_match(store, _entry(kind="rule", key="k2")) is None   # only open entries

def test_account_id_is_stable_8_hex():
    src = {"type": "sheet", "ref": "a.xlsx", "sheet": "پیتزا", "cell": "H6"}
    a = account_id("data/expr", "=X", "y", src)
    assert a == account_id("data/expr", "=X", "y", src) and len(a) == 8

def test_store_roundtrip_and_index(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DIR", str(__import__("pathlib").Path(__file__).resolve().parents[2] / "schemas"))
    store = load_store(tmp_path)                   # all-empty wrappers
    store["rule"]["entries"].append(_entry())
    save_store(tmp_path, store)
    again = load_store(tmp_path)
    assert again["rule"]["entries"][0]["id"] == "F-00001"
    idx = json.loads((tmp_path / "facts" / ".index.json").read_text(encoding="utf-8"))
    row = idx["entries"][0]
    assert row["id"] == "F-00001" and row["kind"] == "rule"
    assert row["field_status_counts"] == {"disputed": 0, "unknown": 0,
                                          "informal": 0, "inferred": 0}

def test_iter_ref_objects_by_shape():
    e = _entry(data={"inputs": [{"key": "a", "title": "آ", "unit": "g",
                                 "from": {"ref": "F-00031", "field": "end_stock"}}],
                     "outputs": [], "calls": [{"ref": "T-2"}]})
    refs = [r["ref"] for r in iter_ref_objects(e)]
    assert refs == ["F-00031", "T-2"]
