import json

from merge_facts import (KIND_FILES, KIND_ORDER, account_id, build_index,
                         canonical_scope, derive_status, field_status_counts,
                         find_match, get_path, is_open, iter_ref_objects,
                         load_store, null_paths, open_accounts, path_exists,
                         save_store)

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

def _retired_row_entry():
    """§9's shape: one withdrawn row with a blank cell and a dispute on it,
    one live row with a dispute of its own."""
    e = _entry(kind="record", data={
        "medium": "sheet", "role": "reference", "location": {},
        "fields": [{"key": "grams", "title": "گرم", "type": "number"}],
        "rows": [{"key": "dead", "grams": None, "retired": True,
                  "valid_to": "1404-01-01"},
                 {"key": "live", "grams": 180}]})
    e["accounts"] = [
        {"id": "aaaaaaaa", "field": "data/rows/dead/grams", "statement": "۹",
         "value": 9, "source": {"type": "chat", "ref": None}, "status": "open"},
        {"id": "bbbbbbbb", "field": "data/rows/live/grams", "statement": "۸",
         "value": 8, "source": {"type": "chat", "ref": None}, "status": "open"}]
    return e

def test_a_retired_rows_nulls_and_open_accounts_leave_the_red_set():
    """§9: "Retired rows are omitted by `export`, excluded from the red rollup
    and QF-44's readiness test, and their `null` cells and open accounts leave
    the red set."

    Counted, a withdrawn row's blank cell made the record permanently
    `unknown` — never green, so QF-44's readiness could not arrive and the
    entry could not be confirmed.
    """
    e = _retired_row_entry()
    assert null_paths(e) == []                       # the dead row's blank cell
    assert [a["id"] for a in open_accounts(e)] == ["bbbbbbbb"]
    assert derive_status(e) == "disputed"            # …on the LIVE row only
    assert field_status_counts(e) == {"disputed": 1, "unknown": 0,
                                      "informal": 0, "inferred": 0}

def test_the_same_row_alive_is_red_on_both_counts():
    """The control: everything above must be the retirement doing the work,
    not a fixture that happens to have no red in it."""
    e = _retired_row_entry()
    del e["data"]["rows"][0]["retired"]
    assert null_paths(e) == ["data/rows/dead/grams"]
    assert len(open_accounts(e)) == 2
    assert derive_status(e) == "disputed"
    assert field_status_counts(e)["unknown"] == 1

def test_a_record_whose_only_red_is_retired_goes_green():
    """QF-44's readiness test in one line: the entry a re-dump withdrew rows
    from must be able to reach `confirmed`."""
    e = _retired_row_entry()
    e["accounts"] = [e["accounts"][0]]               # the dead row's alone
    assert derive_status(e) == "confirmed"

def test_path_grammar():
    e = _entry(kind="record", data={"medium": "sheet", "role": "reference",
        "location": {}, "fields": [{"key": "grams", "title": "گرم", "unit": "g"}],
        "rows": [{"key": "prod_61__ing_1", "grams": 250}]})
    assert get_path(e, "data/rows/prod_61__ing_1/grams") == 250
    assert path_exists(e, "data/fields/grams/unit")
    assert not path_exists(e, "data/fields/nope/unit")

def test_find_match_matches_any_instance_and_refuses_a_renamed_one():
    store = {k: {"schema_version": 2, "entries": []} for k in KIND_ORDER}
    a = _entry(kind="record", key="gozaresh_pitza",
               data={"medium": "sheet", "role": "report",
                     "location": {"spreadsheetId": "P1", "sheet": "پیتزا"},
                     "instances": [
                         {"key": "pz__s11", "spreadsheetId": "P1",
                          "sheetId": 11, "sheet": "پیتزا"},
                         {"key": "pz__s12", "spreadsheetId": "P2",
                          "sheetId": 12, "sheet": "پیتزا"}]})
    store["record"]["entries"].append(a)
    second = _entry(kind="record", key="gozaresh_pitza",
                    data={"medium": "sheet", "role": "report",
                          "location": {"spreadsheetId": "P2", "sheet": "پیتزا"},
                          "instances": [{"key": "pz__s12", "spreadsheetId": "P2",
                                         "sheetId": 12, "sheet": "پیتزا"}]})
    assert find_match(store, second) is a       # matched on the second instance
    renamed = _entry(kind="record", key="gozaresh_shabane_pitza",
                     data={"medium": "sheet", "role": "report",
                           "location": {"spreadsheetId": "P2", "sheet": "پیتزا"},
                           "instances": [{"key": "pz__s12", "spreadsheetId": "P2",
                                          "sheetId": 12, "sheet": "پیتزا"}]})
    assert find_match(store, renamed) is None   # §3.2: not a match, never a rename
    b = _entry(kind="rule", key="k1")
    store["rule"]["entries"].append(b)
    assert find_match(store, _entry(kind="rule", key="k1")) is b
    closed = _entry(kind="rule", key="k2", valid_to="1404-01-01")
    store["rule"]["entries"].append(closed)
    assert find_match(store, _entry(kind="rule", key="k2")) is None   # only open
    superseded = _entry(kind="rule", key="k3", superseded_by={"ref": "F-00099"})
    store["rule"]["entries"].append(superseded)
    assert find_match(store, _entry(kind="rule", key="k3")) is None   # §4: closed

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

def test_null_in_non_keyed_array_is_not_a_red_path():
    """Ruling on Finding 1 (2026-08-31 review): a null inside a non-keyed
    array member has no addressable path per the QF-7 grammar (only dict
    fields and keyed-array members are addressable) — it cannot be disputed,
    resolved, or named in field_status, so it is deliberately not a red
    `unknown` path."""
    e = _entry(data={"calls": [{"ref": "T-2", "qty": None}]})
    assert null_paths(e) == []
    assert derive_status(e) == "confirmed"

def test_iter_ref_objects_yields_process_refs_too():
    """Ruling on Finding 2 (2026-08-31 review): iter_ref_objects yields EVERY
    ref-shaped object, including processes[] and supersession links, mixing
    the fact/transcript id namespace (F-/T-) with the process namespace —
    callers must filter by id prefix (per QF-37's
    ^(F-[0-9]{5}|T-[0-9]+)$) or scope the call to entry['data'] if they only
    want fact/transcript refs."""
    e = _entry(processes=[{"ref": "cooking-001"}], supersedes={"ref": "F-00002"})
    refs = [r["ref"] for r in iter_ref_objects(e)]
    assert "cooking-001" in refs
    assert "F-00002" in refs
