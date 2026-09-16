import copy
from merge_facts.ladder import PLACEMENT_FA, merge_entry, merge_home

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

# --- Fix round (code review findings F1-F6, controller-ruled against spec §11) ---

def test_scope_merges_leaf_by_leaf_not_as_whole_dict_blob():
    # F1: top-level object fields (e.g. scope) must dispatch through the same
    # prose/keyed-list/object/scalar routing as everything else, not fall
    # into _merge_scalar as a single whole-dict blob.
    e = _base()
    inc = copy.deepcopy(e)
    inc["scope"]["branches"] = ["شعبه۲"]
    changes = merge_entry(e, inc, SRC_B)
    assert e["scope"]["branches"] == []                       # never overwritten
    disputes = [c for c in changes if c[1] == "dispute"]
    assert disputes == [("scope/branches", "dispute")]
    accounts = e.get("accounts") or []
    assert all("{'" not in a["statement"] for a in accounts)  # not a dict repr

def test_prose_leaf_nested_in_object_field_is_never_disputed():
    # F2: PROSE_LEAVES applies by leaf name at any depth, including inside
    # object fields (e.g. data.movement.reason), not just at top level/data.
    e = _base()
    e["data"]["movement"] = {"reason": "دلیل اول"}
    inc = copy.deepcopy(e)
    inc["data"]["movement"]["reason"] = "دلیل دوم"
    n_accounts = len(e.get("accounts") or [])
    merge_entry(e, inc, SRC_B)
    assert e["data"]["movement"]["reason"] == "دلیل اول"       # wording kept
    assert len(e.get("accounts") or []) == n_accounts          # no account raised

def test_append_change_path_is_qf7_parseable():
    # F3: an append record's path is <collection>/<key> when the appended
    # member carries a key, else just the collection path (the action word
    # "append" already says it's new; QF-7 paths address keyed arrays only).
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "reference", "location": {},
                 "fields": [{"key": "grams", "title": "گرم", "type": "number",
                             "unit": "g"}],
                 "rows": [{"key": "prod_61__ing_1", "grams": 250}]}
    inc = copy.deepcopy(e)
    inc["data"]["rows"].append({"key": "prod_61__ing_2", "grams": 40})
    inc["accounts"] = [{"field": "x", "statement": "s", "value": 1,
                         "source": dict(SRC_B), "speaker_role": None,
                         "status": "open"}]
    changes = merge_entry(e, inc, SRC_B)
    assert ("data/rows/prod_61__ing_2", "append") in changes
    assert ("accounts", "append") in changes

def test_reread_same_dispute_is_a_noop_not_dispute():
    # F4: a no-op re-read (nothing new materialised into accounts) must not
    # keep reporting "dispute" — only the first pass that actually adds an
    # account is a dispute; a repeat is a noop.
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 4
    merge_entry(e, inc, SRC_B)
    changes = merge_entry(e, copy.deepcopy(inc), SRC_B)
    assert not any(action == "dispute" for _, action in changes)
    assert ("data/outputs/v/value", "noop") in changes

def test_source_union_dedup_includes_sheet():
    # F5: the source union dedup key must include `sheet` — same ref+cell on
    # two different sheets are two distinct sources, not one.
    e = _base()
    src_other_sheet = dict(SRC_A); src_other_sheet["sheet"] = "برگر"
    inc = copy.deepcopy(e); inc["source"] = [dict(SRC_A), src_other_sheet]
    merge_entry(e, inc, SRC_B)
    assert len(e["source"]) == 2

def test_union_field_not_manufactured_when_incoming_lacks_it():
    # F6: the union loop must not setdefault source/aliases/processes to []
    # on every call — only when incoming actually offers a non-empty value.
    e = _base()
    assert "aliases" not in e
    inc = copy.deepcopy(e)                    # inc has no "aliases" key either
    merge_entry(e, inc, SRC_B)
    assert "aliases" not in e

# --- v3: `location` is a derived pointer, not a reading (§4 ladder row) ----- #

def test_location_is_skipped_by_leaf_name_at_any_depth_and_never_disputed():
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "report",
                 "location": {"spreadsheetId": "P1", "sheetId": 11,
                              "sheet": "پیتزا", "hidden": False},
                 "instances": [{"key": "pz__s11", "spreadsheetId": "P1",
                                "sheetId": 11, "sheet": "پیتزا",
                                "branch": "chalebagh", "hidden": False}]}
    inc = copy.deepcopy(e)
    inc["data"]["location"] = {"spreadsheetId": "P2", "sheetId": 12,
                               "sheet": "پیتزا", "hidden": False}
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["location"]["spreadsheetId"] == "P1"   # untouched
    assert e.get("accounts", []) == []                      # never disputed
    assert not any(path.startswith("data/location") for path, _ in changes)


def test_a_derived_leaf_is_skipped_but_its_siblings_still_merge():
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "report", "location": {},
                 "instances": [{"key": "pz__s11", "spreadsheetId": "P1",
                                "sheetId": 11, "sheet": "پیتزا",
                                "branch": "chalebagh", "hidden": False}]}
    inc = copy.deepcopy(e)
    inc["data"]["location"] = {"spreadsheetId": "P2"}
    inc["data"]["instances"].append({"key": "pz__s12", "spreadsheetId": "P2",
                                     "sheetId": 12, "sheet": "پیتزا",
                                     "branch": "naharkhoran", "hidden": False})
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["location"] == {}                       # still derived-only
    assert ("data/instances/pz__s12", "append") in changes


def test_the_preserved_bag_unions_and_a_null_reread_is_no_change():
    """Spec 2026-09-13 C5/C10, owner ruling 2026-09-13 (option b): `extra`
    gains what it does not hold, a newer reading of a held path replaces it
    (and an older run's `path~n` goes), and it is never disputed; a null the
    gate wrote, read again as null, is a noop — not a fill that would restamp
    the entry on every run."""
    existing = {"extra": {"data/x": 1, "data/x~2": 5}, "data": {"category": None},
                "statement": ""}
    incoming = {"extra": {"data/x": 2, "data/y": 3}, "data": {"category": None},
                "statement": ""}
    changes = merge_entry(existing, incoming, {"type": "chat", "ref": None})
    assert existing["extra"] == {"data/x": 2, "data/y": 3}
    assert [c for c in changes if c[1] != "noop"] == [
        ("extra/data/x", "union"), ("extra/data/y", "union")]
    assert merge_entry(existing, incoming, {"type": "chat", "ref": None}) == [
        ("data/category", "noop")]
    assert "accounts" not in existing


def test_an_incoming_null_never_challenges_a_known_value():
    """Final review C-1: a null a gate REPAIR wrote (B19/C10/C19 — "unknown")
    merged onto a stored value changes nothing and opens no dispute."""
    e = _base()
    inc = copy.deepcopy(e)
    inc["data"]["outputs"][0]["value"] = None
    inc["data"]["outputs"][0]["unit"] = None
    before = copy.deepcopy(e)
    changes = merge_entry(e, inc, SRC_B)
    assert e == before
    assert all(action == "noop" for _, action in changes)


# --------------------------------------------------------------------------- #
# `home` — placement, not a fact (owner decision 1, 2026-09-16)
# --------------------------------------------------------------------------- #

def _placed(ref):
    e = _base()
    e["home"] = {"ref": ref} if ref else None
    return e


def test_a_run_never_moves_an_entry_a_person_placed():
    existing, incoming = _placed("F-00025"), _placed("F-00031")
    assert merge_home(existing, incoming) == "F-00031"
    assert existing["home"] == {"ref": "F-00025"}
    assert {"kind": "placement", "description": PLACEMENT_FA,
            "affects": []} in existing["issues"]


def test_an_unplaced_entry_adopts_the_runs_home():
    existing = _placed(None)
    assert merge_home(existing, _placed("F-00031")) is None
    assert existing["home"] == {"ref": "F-00031"}
    assert existing["home"] is not _placed("F-00031")["home"]   # a copy, not the delta's


def test_the_same_home_read_twice_is_not_a_disagreement():
    existing = _placed("F-00025")
    assert merge_home(existing, _placed("F-00025")) is None
    assert merge_home(existing, _placed(None)) is None
    assert "issues" not in existing


def test_merge_entry_notes_the_placement_once_and_unions_an_adoption():
    existing, incoming = _placed("F-00025"), _placed("F-00031")
    assert ("home", "placement") in merge_entry(existing, incoming, SRC_B)
    # a second run reading the same disagreement changes nothing: one issue,
    # and a `noop` so the entry is not re-stamped
    changes = merge_entry(existing, copy.deepcopy(incoming), SRC_B)
    assert ("home", "noop") in changes and ("home", "placement") not in changes
    assert len([i for i in existing["issues"] if i["kind"] == "placement"]) == 1
    unplaced = _placed(None)
    assert ("home", "union") in merge_entry(unplaced, incoming, SRC_B)
