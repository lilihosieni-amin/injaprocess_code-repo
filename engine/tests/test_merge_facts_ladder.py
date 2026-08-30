import copy
from merge_facts.ladder import merge_entry

SRC_A = {"type": "sheet", "ref": "a.xlsx", "sheet": "پیتزا", "cell": "H6"}
SRC_B = {"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "40"}

def _base():
    return {"id": "F-00001", "kind": "rule", "key": "k", "title": "قدیم",
            "statement": "نوشته اول", "scope": {"departments": [], "branches": []},
            "source": [dict(SRC_A)], "status": "confirmed", "retired": False,
            "updated_at": "2026-09-01T10:00:00Z",
            "data": {"inputs": [], "outputs": [{"key": "v", "title": "و",
                     "unit": "g", "nature": "limit", "value": 5}], "expr": None}}

def test_prose_written_once_never_disputed():
    e = _base()
    inc = copy.deepcopy(e); inc["statement"] = "نوشته دوم"
    merge_entry(e, inc, SRC_B)
    assert e["statement"] == "نوشته اول"          # second wording discarded

def test_fill_empty_scalar():
    e = _base(); e["data"]["expr"] = None
    inc = copy.deepcopy(e); inc["data"]["expr"] = "v = 5"
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["expr"] == "v = 5"
    assert ("data/expr", "fill") in changes

def test_equal_rewrite_is_noop_numbers_as_numbers():
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 5.0
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["outputs"][0]["value"] == 5
    assert all(a == "noop" for _, a in changes if _ == "data/outputs/v/value")

def test_disagreeing_rewrite_materialises_incumbent_then_challenger():
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 4
    merge_entry(e, inc, SRC_B)
    assert e["data"]["outputs"][0]["value"] == 5   # NEVER overwrite
    accounts = e["accounts"]
    assert len(accounts) == 2
    assert accounts[0]["source"] == SRC_A and accounts[0]["value"] == 5
    assert accounts[1]["source"] == SRC_B and accounts[1]["value"] == 4
    assert all(a["status"] == "open" and a["field"] == "data/outputs/v/value"
               for a in accounts)

def test_rereading_same_account_is_a_noop():
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 4
    merge_entry(e, inc, SRC_B)
    n = len(e["accounts"])
    merge_entry(e, copy.deepcopy(inc), SRC_B)
    assert len(e["accounts"]) == n                 # dedup on (field, statement, value, ref, locator)

def test_source_union_on_dedup_key():
    e = _base()
    inc = copy.deepcopy(e); inc["source"] = [dict(SRC_A), dict(SRC_B)]
    merge_entry(e, inc, SRC_B)
    assert len(e["source"]) == 2
    merge_entry(e, copy.deepcopy(inc), SRC_B)
    assert len(e["source"]) == 2

def test_keyed_collection_member_merged_leaf_by_leaf():
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "reference", "location": {},
                 "fields": [{"key": "grams", "title": "گرم", "type": "number",
                             "unit": "g"}],
                 "rows": [{"key": "prod_61__ing_1", "grams": 250}]}
    inc = copy.deepcopy(e)
    inc["data"]["fields"][0]["unit"] = "kg"          # same column, different unit
    inc["data"]["rows"][0]["grams"] = 280            # same row, different grams
    inc["data"]["rows"].append({"key": "prod_61__ing_2", "grams": 40})
    merge_entry(e, inc, SRC_B)
    assert e["data"]["fields"][0]["unit"] == "g"     # disputed, not overwritten
    assert e["data"]["rows"][0]["grams"] == 250
    fields_disputed = {a["field"] for a in e["accounts"]}
    assert "data/fields/grams/unit" in fields_disputed
    assert "data/rows/prod_61__ing_1/grams" in fields_disputed
    assert e["data"]["rows"][1]["key"] == "prod_61__ing_2"   # unmatched member appended

def test_object_field_merged_key_by_key():
    e = _base()
    e["data"]["inputs"] = [{"key": "a", "title": "آ", "unit": "g",
                            "from": {"ref": "F-00031", "field": "end_stock"}}]
    inc = copy.deepcopy(e)
    inc["data"]["inputs"][0]["from"] = {"ref": "F-00031", "field": "start_stock"}
    merge_entry(e, inc, SRC_B)
    assert e["data"]["inputs"][0]["from"]["field"] == "end_stock"   # disputed leaf
    assert any(a["field"] == "data/inputs/a/from/field" for a in e["accounts"])
