"""The store gate's tiers (spec 2026-09-13-facts-gate-tiers §5C, rows C1–C37,
prerequisites P1–P3): `merge facts apply` writes every entry it can, holds back
only the entry that would break the store, and marks what it stored uncertain.

Every test that stores something also re-validates the five files against
`facts.schema.json` (P1): a NOTE the store schema refused would only move the
failure to `save_store`."""
import copy
import json

import pytest

from engine_common import validate
from facts_helpers import (_const_delta, _meta, _root, _run_dir, _seed_units,
                           _write)
from merge_facts import KIND_ORDER, load_store, save_store
from merge_facts.apply import apply, simulate
from merge_facts.tiers import lines, notes, refusals
from merge_facts.verbs import edit


def _valid_store(root):
    store = load_store(root)
    for kind in KIND_ORDER:
        validate("facts.schema.json", store[kind])
    return store


def _entries(root, kind):
    return _valid_store(root)[kind]["entries"]


def _one(root, kind, key):
    [entry] = [e for e in _entries(root, kind) if e["key"] == key]
    return entry


def _record(key="barge_shab", **data):
    body = {"medium": "paper", "role": "log",
            "location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"},
            "fields": [{"key": "qty", "title": "مقدار", "type": "number",
                        "unit": "g"}]}
    body.update(data)
    return {"id": "T-5", "kind": "record", "key": key, "title": "برگهٔ شب",
            "statement": "برگهٔ شمارش شب.",
            "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "photo",
                        "ref": "departments/cooking/attachments/p.jpg"}],
            "retired": False, "data": body}


def _delta(*entries):
    return {"schema_version": 2, "entries": list(entries)}


def _apply(root, delta, n="1"):
    run = _run_dir(root, n)
    return apply(root, _write(root, f"d{n}.json", delta), run), run


# --------------------------------------------------------------------------- #
# P3 — one refused entry costs that entry, never the delta
# --------------------------------------------------------------------------- #

def test_a_refused_entry_is_held_back_and_the_rest_is_written(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    bad = _const_delta(key="bad")["entries"][0]
    del bad["title"]                                          # C2: R1
    bad["id"] = "T-9"
    good = _const_delta(key="gud")["entries"][0]
    report, run = _apply(root, _delta(bad, good))
    assert [e["key"] for e in _entries(root, "rule")] == ["gud"]
    assert report["created"] == ["F-00002"]
    held = json.loads((run / "held.json").read_text(encoding="utf-8"))
    assert [h["label"] for h in held] == ["T-9"]
    assert any("title" in line for line in held[0]["lines"])
    assert "precondition failed: held back: T-9: " in capsys.readouterr().err
    assert json.loads((run / "touched.json").read_text(encoding="utf-8")) == ["F-00002"]


def test_exit_2_only_when_nothing_at_all_could_be_written(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    bad = _const_delta()["entries"][0]
    del bad["title"]
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    with pytest.raises(SystemExit) as exc:
        _apply(root, _delta(bad))
    assert exc.value.code == 2
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


def test_simulate_returns_the_store_and_findings_by_tier(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    bad = _const_delta(key="bad")["entries"][0]
    bad["id"], bad["scope"]["departments"] = "T-9", ["nowhere"]    # C24: R4
    good = _const_delta(key="gud")["entries"][0]
    good["data"]["outputs"][0]["unit"] = "lb"                      # C28: NOTE
    store, findings = simulate(root, _write(root, "d.json", _delta(bad, good)),
                               _run_dir(root, "1"))
    assert [e["key"] for e in store["rule"]["entries"]] == ["gud"]
    assert any("registry" in line for line in lines(refusals(findings)))
    assert any("lb" in line for line in lines(notes(findings)))


# --------------------------------------------------------------------------- #
# REPAIR rows
# --------------------------------------------------------------------------- #

def test_c4_members_the_engine_owns_are_dropped(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    e = d["entries"][0]
    e["status"], e["updated_at"] = "confirmed", "2020-01-01T00:00:00Z"
    e["source"][0].update({"hash": "sha256:" + "0" * 64, "run": "runs/x"})
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert stored["source"][0]["run"] == "runs/facts/cooking/1"
    assert "extra" not in stored


def test_c5_an_unknown_member_moves_to_extra_by_its_path(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    rec = _record()
    rec["data"]["fields"][0]["note"] = "با ترازو"
    _apply(root, _delta(rec))
    stored = _one(root, "record", "barge_shab")
    assert stored["extra"] == {"data/fields/qty/note": "با ترازو"}
    assert "note" not in stored["data"]["fields"][0]


def test_c6_a_ref_object_is_cut_down_to_its_ref(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"]["outputs"][0]["of"] = {"ref": "F-00001", "why": "x"}
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert stored["data"]["outputs"][0]["of"] == {"ref": "F-00001"}
    assert stored["extra"] == {"data/outputs/v/of/why": "x"}


def test_c7_a_single_member_is_wrapped_and_a_null_list_dropped(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    e = d["entries"][0]
    e["aliases"], e["issues"] = "تلورانس", None
    e["source"] = e["source"][0]
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert stored["aliases"] == ["تلورانس"] and "issues" not in stored
    assert stored["source"][0]["ref"] == "meetings/transcripts/c.txt"


def test_c10_a_computable_required_member_is_filled(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    item = {"id": "T-3", "kind": "item", "key": "ing_1", "title": "پنیر",
            "statement": "پنیر پیتزا.", "scope": {"departments": [], "branches": []},
            "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt"}],
            "data": {}}                                        # no retired, category, unit
    _apply(root, _delta(item))
    stored = _one(root, "item", "ing_1")
    assert stored["retired"] is False
    assert stored["data"] == {"category": None, "unit": None}
    assert stored["status"] == "unknown"                       # QF-6: null is red


def test_c15_a_key_is_normalised_c16_one_still_off_grammar_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    ok = _const_delta(key="Tol Max")["entries"][0]
    bad = _const_delta(key="پنیر")["entries"][0]
    bad["id"], bad["title"] = "T-2", "دیگر"
    _, run = _apply(root, _delta(ok, bad))
    assert [e["key"] for e in _entries(root, "rule")] == ["tol_max"]
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-2"]


def test_c16_an_off_grammar_member_key_holds_back_its_entry_alone(tmp_path):
    """§9 «B4 / B6 / C16: refuse that decision — keys are identity»: a Persian
    column key, and two columns one repair would collide, each hold back only
    their own entry. A spaced key B4 can repair is renamed with its row cell
    and its primaryKey member — the schema repair never renames it blindly."""
    root = _root(tmp_path); _seed_units(root)
    persian = _record("persian", fields=[{"key": "مقدار", "title": "م",
                                          "type": "number"}])
    collide = _record("collide", fields=[{"key": "Qty", "title": "م", "type": "number"},
                                         {"key": "qty", "title": "م", "type": "number"}])
    spaced = _record("spaced", fields=[{"key": "Qty Total", "title": "م",
                                        "type": "number"}],
                     primaryKey=["Qty Total"], rows=[{"key": "r1", "Qty Total": 3}])
    for n, e in enumerate((persian, collide, spaced)):
        e["id"], e["title"] = f"T-{n + 1}", f"برگهٔ {n + 1}"
    _, run = _apply(root, _delta(persian, collide, spaced))
    assert [e["key"] for e in _entries(root, "record")
            if e["key"] in ("persian", "collide", "spaced")] == ["spaced"]
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] \
        == ["T-1", "T-2"]
    data = _one(root, "record", "spaced")["data"]
    assert [f["key"] for f in data["fields"]] == ["qty_total"]
    assert data["primaryKey"] == ["qty_total"]
    assert data["rows"][0]["qty_total"] == 3


def test_c17_a_date_is_normalised_and_c18_a_numeric_string_becomes_a_number(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(value=5)
    e = d["entries"][0]
    e["valid_from"] = "۱۴۰۴/۹/۱"
    e["data"]["outputs"][0]["share"] = "1"
    e["retired"] = "false"
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert stored["valid_from"] == "1404-09-01"
    assert stored["data"]["outputs"][0]["share"] == 1
    assert stored["retired"] is False


def test_c21_the_same_key_twice_in_one_delta_is_folded_into_one(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(5)
    twin = copy.deepcopy(d["entries"][0])
    twin["id"] = "T-2"
    twin["data"]["outputs"][0]["value"] = 6
    d["entries"].append(twin)
    report, _ = _apply(root, d)
    [rule] = _entries(root, "rule")
    assert report["id_map"] == {"T-1": "F-00002"}
    assert sorted(a["value"] for a in rule["accounts"]) == [5, 6]      # disputed


def _sheet(key, title="گزارش روزانه", sheet_id=1):
    return {"id": "T-1", "kind": "record", "key": key, "title": title,
            "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "sheet", "ref": "attachments/sheets/G/G.xlsx"}],
            "retired": False,
            "data": {"medium": "sheet", "role": "log",
                     "location": {"spreadsheetId": "S", "sheetId": sheet_id,
                                  "sheet": "روزانه", "hidden": False}}}


def test_c22_a_tab_already_held_is_applied_to_its_holder(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, _delta(_sheet("g__ruzane")), "1")
    report, _ = _apply(root, _delta(_sheet("g__daily", title="روزانه")), "2")
    [rec] = [e for e in _entries(root, "record") if e["key"] != "units"]
    assert rec["key"] == "g__ruzane" and report["id_map"] == {}
    assert "g__daily" in capsys.readouterr().err


def test_c22_a_tab_claimed_twice_in_one_delta_is_one_record(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    second = _sheet("g__daily", title="روزانه")
    second["id"] = "T-2"
    report, _ = _apply(root, _delta(_sheet("g__ruzane"), second))
    assert [e["key"] for e in _entries(root, "record") if e["key"] != "units"] \
        == ["g__ruzane"]
    assert list(report["id_map"]) == ["T-1"]


def test_c32_a_drive_id_citation_is_repaired_at_the_gate(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    manifest = root / "attachments" / "sheets" / "manifest.json"
    doc = json.loads(manifest.read_text(encoding="utf-8"))
    doc["workbooks"] = [{"spreadsheetId": "12Q9", "dir": "G", "file": "G.gs"}]
    manifest.write_text(json.dumps(doc), encoding="utf-8")
    d = _const_delta()
    d["entries"][0]["source"] = [{"type": "script", "ref": "12Q9"}]
    _apply(root, d)
    assert _one(root, "rule", "tol")["source"][0]["ref"] == "attachments/sheets/G/G.gs"


# --------------------------------------------------------------------------- #
# NOTE rows
# --------------------------------------------------------------------------- #

def test_c11_an_entry_with_no_statement_is_stored_with_a_shape_issue(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    del d["entries"][0]["statement"]
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert stored["statement"] == ""
    assert [i["kind"] for i in stored["issues"]] == ["shape"]


def test_c12_an_account_with_no_source_is_dropped_and_the_entry_lands(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["accounts"] = [{"field": "data/outputs/v/value",
                                    "statement": "۴", "value": 4, "status": "open"}]
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert "accounts" not in stored or stored["accounts"] == []
    assert stored["extra"]["accounts/0"]["value"] == 4
    assert [i["kind"] for i in stored["issues"]] == ["shape"]


def test_c13_a_value_outside_its_vocabulary_is_stored_and_marked(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    rec = _record(role="ledger")
    rec["data"]["fields"][0]["type"] = "float"                  # a synonym
    rec["source"][0]["type"] = "image"                          # a synonym
    _apply(root, _delta(rec))
    stored = _one(root, "record", "barge_shab")
    assert stored["data"]["role"] == "ledger"
    assert stored["field_status"] == {"data/role": "inferred"}
    assert stored["data"]["fields"][0]["type"] == "number"
    assert stored["source"][0]["type"] == "photo"


def test_c13_a_mark_reaches_an_entry_the_delta_merges_into(tmp_path):
    """Review of track S, Critical: a NOTE's `inferred` mark must reach the
    store on a merge, not only on a create — and never overwrite a status the
    stored entry already has. A re-apply stays byte-identical."""
    root = _root(tmp_path); _seed_units(root)
    first = _record()
    first["field_status"] = {"data/fields/qty/title": "informal"}
    _apply(root, _delta(first))
    again = _record(cadence="fortnightly")                      # C13: off-list
    again["field_status"] = {"data/fields/qty/title": "inferred"}
    _apply(root, _delta(again), n="2")
    stored = _one(root, "record", "barge_shab")
    assert stored["data"]["cadence"] == "fortnightly"
    assert stored["field_status"] == {"data/cadence": "inferred",
                                      "data/fields/qty/title": "informal"}
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    _apply(root, _delta(copy.deepcopy(again)), n="3")
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before


def test_c14_an_unknown_account_status_is_stored_open(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["accounts"] = [{
        "field": "data/outputs/v/value", "statement": "۴", "value": 4,
        "source": {"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "3"},
        "status": "pending"}]
    _apply(root, d)
    stored = _one(root, "rule", "tol")
    [account] = stored["accounts"]
    assert account["status"] == "open" and stored["status"] == "disputed"
    assert list(stored["extra"].values()) == ["pending"]


def test_c19_an_object_where_text_belongs_moves_to_extra(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"]["outputs"][0]["title"] = {"fa": "مقدار"}
    _apply(root, d)
    out = _one(root, "rule", "tol")
    assert out["data"]["outputs"][0]["title"] is None
    assert out["extra"] == {"data/outputs/v/title": {"fa": "مقدار"}}


def test_c20_a_quote_on_a_chat_source_is_stored_with_a_note(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["source"].append({"type": "chat", "ref": None, "quote": "x"})
    _, run = _apply(root, d)
    assert _one(root, "rule", "tol")["source"][1]["quote"] == "x"


def test_c25_an_unregistered_branch_is_dropped_c24_a_department_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    ok = _const_delta(key="tol")["entries"][0]
    ok["scope"]["branches"] = ["tehran", "chalebagh"]
    bad = _const_delta(key="tol2")["entries"][0]
    bad["id"], bad["title"], bad["scope"]["departments"] = "T-2", "دوم", ["nope"]
    _, run = _apply(root, _delta(ok, bad))
    stored = _one(root, "rule", "tol")
    assert stored["scope"]["branches"] == ["chalebagh"]
    assert [i["kind"] for i in stored["issues"]] == ["shape"]
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-2"]


def test_c26_a_new_entry_for_another_department_is_created_with_a_note(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, _const_delta(dept="management"))
    stored = _one(root, "rule", "tol")
    assert stored["scope"]["departments"] == ["management"]
    assert [i["kind"] for i in stored["issues"]] == ["shape"]


def test_c27_a_title_twin_is_created_with_a_code_collision_issue(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    first, _ = _apply(root, _const_delta(key="tol"), "1")
    twin = _const_delta(key="other")
    twin["entries"][0]["title"] = "تلورانس tol"
    _apply(root, twin, "2")
    stored = _one(root, "rule", "other")
    [issue] = [i for i in stored["issues"] if i["kind"] == "code_collision"]
    assert issue["affects"] == [{"ref": first["id_map"]["T-1"]}]


def test_c28_an_undeclared_unit_is_stored_marked_and_unit_raw_kept(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    rec = _record()
    rec["data"]["fields"][0].update({"unit": "lb", "unit_raw": "پوند"})
    rec["data"]["fields"].append({"key": "vazn", "title": "وزن", "type": "number",
                                  "unit": "KG"})              # a spelling of `kg`
    _apply(root, _delta(rec))
    stored = _one(root, "record", "barge_shab")
    qty, vazn = stored["data"]["fields"]
    assert (qty["unit"], qty["unit_raw"]) == ("lb", "پوند")
    assert vazn["unit"] == "kg"
    assert stored["field_status"] == {"data/fields/qty/unit": "inferred"}


def test_c29_a_dangling_ref_is_severed_c30_a_note_about_nothing_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"]["outputs"][0]["of"] = {"ref": "F-99999"}
    note_entry = {"id": "T-7", "kind": "note", "key": "note_aa11bb22cc33",
                  "title": "پرسش", "statement": "پرسش.",
                  "scope": {"departments": ["cooking"], "branches": []},
                  "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt"}],
                  "retired": False,
                  "data": {"about": [{"ref": "F-99998"}], "question": "چیست؟"}}
    d["entries"].append(note_entry)
    _, run = _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert "of" not in stored["data"]["outputs"][0]
    assert stored["extra"] == {"data/outputs/v/of": '{"ref": "F-99999"}'}
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-7"]


def test_c31_a_ref_naming_an_undeclared_field_keeps_the_entry_ref(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"]["outputs"][0]["of"] = {"ref": "F-00001", "field": "nadarad"}
    _apply(root, d)
    assert _one(root, "rule", "tol")["data"]["outputs"][0]["of"] == {"ref": "F-00001"}


def test_c33_a_missing_file_is_dropped_when_another_source_remains(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["source"].insert(0, {"type": "voice",
                                         "ref": "meetings/transcripts/nope.txt"})
    only = _const_delta(key="only")["entries"][0]
    only["id"], only["title"] = "T-2", "تنها"
    only["source"] = [{"type": "voice", "ref": "meetings/transcripts/nope.txt"}]
    d["entries"].append(only)
    _, run = _apply(root, d)
    stored = _one(root, "rule", "tol")
    assert [s["ref"] for s in stored["source"]] == ["meetings/transcripts/c.txt"]
    assert [i["kind"] for i in stored["issues"]] == ["shape"]
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-2"]


def test_c35_a_tombstoned_process_is_kept_c34_a_missing_one_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    procs = root / "departments" / "cooking" / "processes"
    (procs / "cooking-002.json").write_text(json.dumps(
        {"id": "cooking-002", "tombstoned": True, "superseded_by": "cooking-001"}),
        encoding="utf-8")
    kept = _const_delta(key="tol")["entries"][0]
    kept["source"].append({"type": "process",
                           "ref": "departments/cooking/processes/cooking-002.json"})
    gone = _const_delta(key="tol2")["entries"][0]
    gone["id"], gone["title"] = "T-2", "دوم"
    gone["source"] = [{"type": "process",
                       "ref": "departments/cooking/processes/cooking-009.json"}]
    _, run = _apply(root, _delta(kept, gone))
    stored = _one(root, "rule", "tol")
    assert len(stored["source"]) == 2 and stored["issues"][0]["kind"] == "shape"
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-2"]


# --------------------------------------------------------------------------- #
# REFUSE rows kept
# --------------------------------------------------------------------------- #

def test_c3_a_fact_id_in_a_delta_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["id"] = "F-00001"
    with pytest.raises(SystemExit):
        _apply(root, d)


def test_c8_a_container_of_the_wrong_type_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"] = "x"
    with pytest.raises(SystemExit):
        _apply(root, d)


def test_c9_a_keyless_row_takes_its_title_or_is_refused(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    titled = _record(rows=[{"title": "burger", "qty": 1}])
    untitled = _record(key="barge_dovom", rows=[{"title": "برگر", "qty": 1}])
    untitled["id"], untitled["title"] = "T-6", "برگهٔ دوم"
    _, run = _apply(root, _delta(titled, untitled))
    assert _one(root, "record", "barge_shab")["data"]["rows"][0]["key"] == "burger"
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-6"]


def test_c37_an_old_off_contract_entry_does_not_block_a_later_apply(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, _const_delta(key="old"), "1")
    path = root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["entries"][0]["data"]["outputs"][0]["unit_ref"] = {"ref": "F-00001"}
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    _apply(root, _const_delta(key="new"), "2")
    assert {e["key"] for e in load_store(root)["rule"]["entries"]} == {"old", "new"}


# --------------------------------------------------------------------------- #
# P2 — edit judges the entry it touched; `extra` survives every road
# --------------------------------------------------------------------------- #

def _edit(root, fid, ops, n):
    run = _run_dir(root, n); _meta(run)
    patch = _write(root, f"p{n}.json", {"schema_version": 1, "ops": ops})
    return edit(root, fid, patch, run)


def test_p2_edit_succeeds_beside_an_off_contract_entry_of_its_kind(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    report, _ = _apply(root, _delta(_const_delta(key="a")["entries"][0],
                                    dict(_const_delta(key="b")["entries"][0],
                                         id="T-2", title="ب")), "1")
    path = root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["entries"][1]["data"]["invented"] = 1                  # b is off-contract
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    _edit(root, report["id_map"]["T-1"],
          [{"op": "set", "path": "statement", "value": "حد مجاز تازه"}], "2")
    [a] = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "a"]
    assert a["statement"] == "حد مجاز تازه"


def test_extra_survives_apply_a_reapply_and_an_edit(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    rec = _record()
    rec["data"]["fields"][0]["note"] = "با ترازو"
    report, _ = _apply(root, _delta(rec), "1")
    again = _record()
    again["data"]["fields"][0]["group"] = "x"                  # wrong type: to extra
    _apply(root, _delta(again), "2")
    fid = report["id_map"]["T-5"]
    _edit(root, fid, [{"op": "set", "path": "statement", "value": "برگهٔ شمارش."}], "3")
    stored = _one(root, "record", "barge_shab")
    assert stored["extra"] == {"data/fields/qty/note": "با ترازو",
                               "data/fields/qty/group": "x"}


def test_edit_marks_an_undeclared_unit_instead_of_refusing(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    report, _ = _apply(root, _const_delta(), "1")
    fid = report["id_map"]["T-1"]
    _edit(root, fid, [{"op": "set", "path": "data/outputs/v/unit", "value": "stone"}], "2")
    stored = _one(root, "rule", "tol")
    assert stored["data"]["outputs"][0]["unit"] == "stone"
    assert stored["field_status"] == {"data/outputs/v/unit": "inferred"}


def test_save_store_accepts_every_shape_the_tiers_store(tmp_path):
    """P1 at the schema: the open vocabularies, the C10 nulls, `extra`, a
    location key foreign to its medium, and an unreadable date."""
    root = _root(tmp_path)
    store = load_store(root)
    store["record"]["entries"].append({
        "id": "F-00001", "kind": "record", "key": "k", "title": "t", "statement": "",
        "scope": {}, "source": [{"type": "sheet", "ref": None, "quote": "q"},
                                {"type": "chat", "ref": None, "quote": "q"}],
        "retired": False, "status": "unknown", "updated_at": "2026-01-01T00:00:00Z",
        "valid_from": "sometime", "extra": {"data/x": [1]},
        "data": {"medium": None, "role": "ledger", "cadence": "hourly",
                 "location": {"kept_at": None, "holder": None, "spreadsheetId": "S"},
                 "fields": [{"key": "f", "type": "decimal2",
                             "refItems": {"namespace": "abc"}}]}})
    save_store(root, store)


def test_edit_takes_the_tiers_apply_takes_c13_c29_c24(tmp_path):
    """Principle 4 at `edit`: the same rows, the same tiers. (`validate
    facts-delta --store` is `simulate`, which is `apply`'s own `_gate`.)"""
    root = _root(tmp_path); _seed_units(root)
    report, _ = _apply(root, _delta(_record()), "1")
    fid = report["id_map"]["T-5"]
    _edit(root, fid, [{"op": "set", "path": "data/role", "value": "ledger"}], "2")
    stored = _one(root, "record", "barge_shab")
    assert stored["data"]["role"] == "ledger"
    assert stored["field_status"] == {"data/role": "inferred"}
    rule, _ = _apply(root, _const_delta(), "3")
    _edit(root, rule["id_map"]["T-1"],
          [{"op": "set", "path": "data/outputs/v/of", "value": {"ref": "F-99999"}}], "4")
    assert "of" not in _one(root, "rule", "tol")["data"]["outputs"][0]
    with pytest.raises(SystemExit):
        _edit(root, fid, [{"op": "set", "path": "scope/departments", "value": ["nope"]}],
              "5")


def test_a_delta_carrying_notes_and_extra_reapplies_byte_identically(tmp_path):
    """§17's idempotency holds for what the tiers add: the marks, the shape
    issue and the preserved bag are unioned, never duplicated."""
    root = _root(tmp_path); _seed_units(root)
    rec = _record(role="ledger")
    rec["data"]["fields"][0]["note"] = "با ترازو"
    del rec["statement"]
    _apply(root, _delta(rec), "1")
    path = root / "facts" / "records.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    for e in doc["entries"]:
        e["updated_at"] = "2000-01-01T00:00:00Z"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    before = path.read_bytes()
    _apply(root, _delta(rec), "2")
    assert path.read_bytes() == before


def _stored_bytes(root):
    return {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}


@pytest.mark.parametrize("row", ["b19", "c10", "c19"])
def test_a_null_a_repair_wrote_never_disputes_a_stored_value(tmp_path, row):
    """Final review C-1: the same entry read again with a member the gate
    fills with null (B19 constant value, C10 computable member, C19 a leaf
    moved to extra) keeps the stored value; no account, not disputed."""
    root = _root(tmp_path); _seed_units(root)
    if row == "c10":
        item = {"id": "T-3", "kind": "item", "key": "ing_1", "title": "پنیر",
                "statement": "پنیر پیتزا.", "scope": {"departments": [], "branches": []},
                "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt"}],
                "retired": False, "data": {"category": "raw", "unit": "g"}}
        _apply(root, _delta(item), "1")
        again = copy.deepcopy(item)
        del again["data"]["unit"]
        kind, key, leaf = "item", "ing_1", lambda e: e["data"]["unit"]
        first = "g"
    else:
        _apply(root, _const_delta(), "1")
        again = _const_delta()["entries"][0]
        out = again["data"]["outputs"][0]
        if row == "b19":
            del out["value"]
            leaf, first = (lambda e: e["data"]["outputs"][0]["value"]), 5
        else:
            out["title"] = {"fa": "مقدار"}
            leaf, first = (lambda e: e["data"]["outputs"][0]["title"]), "مقدار"
        kind, key = "rule", "tol"
    _apply(root, _delta(again), "2")
    stored = _one(root, kind, key)
    assert leaf(stored) == first
    assert "accounts" not in stored and stored.get("status") != "disputed"


def test_a_link_to_a_held_back_entry_leaves_no_temp_id_in_the_store(tmp_path):
    """Final review I-3 (INV-1): `apply` holds back T-1, so the link T-2 had to
    it is severed — the temp id is dropped with a note, never kept in `extra`
    as an object or as text, and the same delta applied again changes nothing."""
    root = _root(tmp_path); _seed_units(root)
    held = _const_delta(key="tol2")["entries"][0]
    held["title"], held["scope"]["departments"] = "دوم", ["nope"]       # C24
    pointing = _const_delta()["entries"][0]
    pointing["id"] = "T-2"
    pointing["data"]["outputs"][0]["of"] = {"ref": "T-1"}
    pointing["data"]["outputs"][0]["writes_to"] = {"ref": "T-1", "field": "x"}
    _, run = _apply(root, _delta(held, pointing), "1")
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == ["T-1"]
    stored = _one(root, "rule", "tol")
    assert "of" not in stored["data"]["outputs"][0]
    assert not any("T-1" in p.read_text(encoding="utf-8")
                   for p in (root / "facts").glob("*.json"))
    assert stored["issues"]
    before = _stored_bytes(root)
    _apply(root, _delta(held, pointing), "2")
    assert _stored_bytes(root) == before


def test_an_id_less_entry_whose_key_a_repair_changes_is_held_back_alone(tmp_path):
    """M-3: a hand-written delta entry with no `id` is labelled by the key it
    carried; C15 normalises that key, and a precondition refusal under the new
    key used to read as document-level and hold back every entry."""
    root = _root(tmp_path); _seed_units(root)
    bad = _const_delta(key="Bad Key")["entries"][0]
    bad["scope"]["departments"] = ["nope"]                          # C24
    good = _const_delta(key="gud")["entries"][0]
    good["data"]["outputs"][0]["unit"] = "lb"                       # C28: a note
    for entry in (bad, good):
        del entry["id"]
    _, run = _apply(root, _delta(bad, good))
    assert [h["label"] for h in json.loads((run / "held.json").read_text())] == \
        ["Bad Key"]
    stored = _one(root, "rule", "gud")
    assert stored["field_status"] == {"data/outputs/v/unit": "inferred"}
