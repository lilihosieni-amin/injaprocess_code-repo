"""Spec 2026-09-13 facts gate tiers, section 5B — the content pass, one test
per B-row whose tier changes: REFUSE only where a key stays broken after the
safe repair (B4/B6), REPAIR in the exact shape the row names, and NOTE with the
path and mark the row names."""
import copy
import pathlib

from merge_facts import content
from merge_facts.content import NO_MARK, check_document, lint_prose
from merge_facts.conventions import DEFAULT as DEFAULT_CONVENTIONS
from merge_facts.normalise import normalise_entry
from merge_facts.tiers import NOTE, REFUSE


def _doc(*entries):
    return {"schema_version": 2, "entries": list(entries)}


def _rule(data, id_="T-1", key="tol", **extra):
    e = {"id": id_, "kind": "rule", "key": key, "title": "قاعده",
         "statement": "شرح", "scope": {"departments": [], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                     "lines": "1"}],
         "retired": False, "data": data}
    e.update(extra)
    return e


def _record(data, id_="T-1", key="rec", role="log", **extra):
    base = {"medium": "sheet", "role": role,
            "location": {"spreadsheetId": "S", "sheetId": 1, "sheet": "sh",
                         "hidden": False}}
    base.update(data)
    e = {"id": id_, "kind": "record", "key": key, "title": "رکورد",
         "statement": "شرح", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/S/S.xlsx"}],
         "retired": False, "data": base}
    e.update(extra)
    return e


def _computed(**data):
    base = {"inputs": [{"key": "x", "title": "x", "unit": "g",
                        "from": "operator"}],
            "outputs": [{"key": "v", "title": "v", "unit": "g"}],
            "lang": "feel", "expr": "v = x"}
    base.update(data)
    return base


def _table_rule(rows, **data):
    base = {"lang": "table",
            "inputs": [{"key": "goruh", "title": "گروه"}],
            "outputs": [{"key": "mabna", "title": "مبنا"}],
            "table": {"inputs": ["goruh"], "outputs": ["mabna"], "rows": rows}}
    base.update(data)
    return _rule(base)


def _check(*entries, kind="facts-delta", **kw):
    return check_document(_doc(*entries), kind, **kw)


def _only(findings, needle):
    hits = [f for f in findings if needle in f.message]
    assert hits, [f.line() for f in findings]
    return hits


def _assert_note(findings, needle, path, mark):
    for f in _only(findings, needle):
        assert (f.tier, f.path, f.mark) == (NOTE, path, mark), f


def _repair(entry, root=None, label="T-1"):
    ctx = {"root": root, "store": None, "unit_rows": [],
           "conventions": DEFAULT_CONVENTIONS, "label": label}
    return normalise_entry(entry, ctx)


def _no_refusal(findings):
    assert [f for f in findings if f.tier == REFUSE] == []


# --------------------------------------------------------------------------- #
# the declared repair order
# --------------------------------------------------------------------------- #

def test_content_repairs_run_in_the_declared_order():
    assert [fn.__name__ for fn in content.CONTENT_REPAIRS] == [
        "repair_keys",                  # B4/B6
        "repair_foreign_keys",          # B11
        "repair_constant_lang",         # B18
        "repair_constant_value",        # B19 (section 9 default)
        "repair_table_lang",            # B20 + B25
        "repair_table_rows",            # B27
        "repair_nested_table_rows",     # B28
        "repair_field_status_values",   # B32
        "repair_field_status_paths",    # B33
        "repair_issue_dates",           # B35
        "repair_generated_sources",     # B36
        "repair_process_links",         # B8 + B37
    ]


def test_the_repairs_are_idempotent(tmp_path):
    entry = _record({"fields": [{"key": "Qty Total", "title": "q", "type": "number"}],
                     "rows": [{"key": "R 1", "Qty Total": 2}],
                     "foreignKeys": [None, {"spreadsheetId": "S"}]},
                    field_status={"data/fields/Qty Total": True, "nope": "inferred"},
                    issues=[{"kind": "scale", "description": "d", "affects": [],
                             "from_date": "۱۴۰۵/۶/۱"}])
    _repair(entry, tmp_path)
    once = copy.deepcopy(entry)
    _repair(entry, tmp_path)
    assert entry == once


# --------------------------------------------------------------------------- #
# B1–B3
# --------------------------------------------------------------------------- #

def test_b1_an_undeclared_expr_identifier_is_a_note_on_the_expr():
    found = _check(_rule(_computed(expr="v = x + y")))
    _assert_note(found, "'y'", "data/expr", "inferred")
    _no_refusal(found)


def test_b2_an_aggregate_over_a_row_input_is_a_note_on_the_expr():
    rule = _rule(_computed(inputs=[{"key": "b", "title": "b", "unit": "g",
                                    "from": {"ref": "T-2", "field": "g", "row": "p"}}],
                           expr="v = sum over b of b"))
    found = _check(rule)
    _assert_note(found, "sum over b", "data/expr", "inferred")
    _no_refusal(found)


def test_b3_an_input_unit_disagreeing_with_its_source_is_a_note_on_that_unit():
    record = _record({"fields": [{"key": "col", "title": "c", "type": "number",
                                  "unit": "kg"}]})
    rule = _rule(_computed(inputs=[{"key": "x", "title": "x", "unit": "g",
                                    "from": {"ref": "T-1", "field": "col"}}]),
                 id_="T-2")
    found = _check(record, rule)
    _assert_note(found, "disagrees", "data/inputs/x/unit", "inferred")
    _no_refusal(found)


# --------------------------------------------------------------------------- #
# B4 / B6 — the safe key repair, then REFUSE
# --------------------------------------------------------------------------- #

def test_b4_a_spaced_key_is_repaired_everywhere_the_entry_names_it():
    entry = _record({
        "fields": [{"key": "Qty Total", "title": "q", "type": "number"},
                   {"key": "code", "title": "c", "type": "string"}],
        "primaryKey": ["code", "Qty Total"],
        "foreignKeys": [{"fields": ["Qty Total"], "reference": {"ref": "F-00001"}}],
        "rows": [{"key": "r1", "code": "a", "Qty Total": 3}],
        "reconciled_against": [{"cell": {"field": "Qty Total", "row": "r1"},
                                "against": {"ref": "F-00002"}}]},
        field_status={"data/fields/Qty Total/title": "inferred",
                      "data/rows/r1/Qty Total": "inferred"})
    assert _repair(entry) == []
    data = entry["data"]
    assert [f["key"] for f in data["fields"]] == ["qty_total", "code"]
    assert data["primaryKey"] == ["code", "qty_total"]
    assert data["foreignKeys"][0]["fields"] == ["qty_total"]
    assert data["rows"] == [{"key": "r1", "code": "a", "qty_total": 3}]
    assert data["reconciled_against"][0]["cell"]["field"] == "qty_total"
    assert entry["field_status"] == {"data/fields/qty_total/title": "inferred",
                                     "data/rows/r1/qty_total": "inferred"}
    assert _check(entry) == []


def test_b4_an_input_key_repair_rewrites_the_exact_expr_token_and_table():
    rule = _rule({"lang": "feel",
                  "inputs": [{"key": "Qty_In", "title": "q", "from": "operator"}],
                  "outputs": [{"key": "Out-Put", "title": "o"}],
                  "expr": "Out-Put = Qty_In * 2 + Qty_Inner"})
    _repair(rule)
    assert rule["data"]["inputs"][0]["key"] == "qty_in"
    assert rule["data"]["outputs"][0]["key"] == "out_put"
    # `Out-Put` is not one FEEL token, so only the exact token is rewritten.
    assert rule["data"]["expr"] == "Out-Put = qty_in * 2 + Qty_Inner"
    table = _table_rule([{"Goruh": "x", "mabna": "y"}],
                        inputs=[{"key": "Goruh", "title": "g"}])
    table["data"]["table"]["inputs"] = ["Goruh"]
    table["data"]["table"]["default"] = {"mabna": "z"}
    _repair(table)
    assert table["data"]["table"]["inputs"] == ["goruh"]
    assert table["data"]["table"]["rows"] == [{"goruh": "x", "mabna": "y"}]


def test_b4_a_key_that_stays_invalid_after_repair_is_refused():
    for bad in ("_qty", "مقدار", "Qty.Total"):
        entry = _record({"fields": [{"key": bad, "title": "q", "type": "number"}]})
        assert _repair(entry) == []
        assert entry["data"]["fields"][0]["key"] == bad
        found = _only(_check(entry), "is not a minted segment")
        assert [(f.tier, f.label) for f in found] == [(REFUSE, "T-1")]


def test_b4_a_repair_that_would_collide_is_not_made_and_is_refused():
    entry = _record({"fields": [{"key": "Qty", "title": "q", "type": "number"},
                                {"key": "qty", "title": "q2", "type": "number"}]})
    _repair(entry)
    assert [f["key"] for f in entry["data"]["fields"]] == ["Qty", "qty"]
    assert [f.tier for f in _only(_check(entry), "'Qty'")] == [REFUSE]


def test_b4_an_unrepaired_but_repairable_key_is_not_refused():
    # A gate that runs `normalise_entry` first never sees it; one that does not
    # (the standalone validator) must not refuse what the next gate repairs.
    found = _check(_record({"fields": [{"key": "Qty Total", "title": "q"}]}))
    assert [(f.tier, f.mark) for f in _only(found, "Qty Total")] == [(NOTE, NO_MARK)]


def test_b6_a_row_key_is_repaired_segment_by_segment():
    entry = _record({"fields": [{"key": "code", "title": "c", "type": "string"}],
                     "rows": [{"key": "Kala 1__R 6", "code": "a"}],
                     "reconciled_against": [{"cell": {"field": "code",
                                                      "row": "Kala 1__R 6"},
                                             "against": {"ref": "F-00002"}}]},
                    field_status={"data/rows/Kala 1__R 6/code": "inferred"})
    _repair(entry)
    assert entry["data"]["rows"][0]["key"] == "kala_1__r_6"
    assert entry["data"]["reconciled_against"][0]["cell"]["row"] == "kala_1__r_6"
    assert entry["field_status"] == {"data/rows/kala_1__r_6/code": "inferred"}
    bad = _record({"rows": [{"key": "ردیف"}]})
    _repair(bad)
    assert [f.tier for f in _only(_check(bad), "row key")] == [REFUSE]


# --------------------------------------------------------------------------- #
# B5, B7–B17
# --------------------------------------------------------------------------- #

def test_b5_an_output_per_off_the_grammar_is_a_note_with_no_mark():
    found = _check(_rule(_computed(outputs=[{"key": "v", "title": "v",
                                             "per": "Per Day"}])))
    _assert_note(found, "per", None, NO_MARK)


def test_b7_a_refitems_cell_off_the_namespace_is_a_note_on_the_column():
    record = _record({"primaryKey": ["nam"],
                      "fields": [{"key": "nam", "title": "n", "type": "string",
                                  "refItems": {"namespace": "##"}}],
                      "rows": [{"key": "r1", "nam": "پنیر پیتزا"}]}, role="reference")
    found = _check(record)
    _assert_note(found, "refItems cell", "data/fields/nam/refItems", "inferred")
    _no_refusal(found)


def test_b8_a_process_ref_off_the_grammar_is_removed_with_an_issue():
    rule = _rule(_computed(), processes=[{"ref": "Not A Process"},
                                         {"ref": "cooking-001"}],
                 source=[{"type": "process",
                          "ref": "departments/cooking/processes/cooking-001.json"}])
    found = _check(copy.deepcopy(rule))
    _assert_note(found, "process id grammar", None, "issue")
    notes = _repair(rule)
    assert rule["processes"] == [{"ref": "cooking-001"}]
    assert [(n.tier, n.mark) for n in notes] == [(NOTE, "issue")]
    assert "Not A Process" in notes[0].fa
    assert _check(rule) == []


def test_b9_a_reserved_name_as_a_field_key_is_a_note_on_that_field():
    found = _check(_record({"fields": [{"key": "unit", "title": "u"}],
                            "header_fields": [{"key": "title", "title": "t"}]}))
    _assert_note([f for f in found if "'unit'" in f.message], "reserved",
                 "data/fields/unit", "inferred")
    _assert_note([f for f in found if "'title'" in f.message], "reserved",
                 "data/header_fields/title", "inferred")


def test_b10_an_undeclared_primary_key_member_is_a_note_on_the_primary_key():
    found = _check(_record({"primaryKey": ["ghost"],
                            "fields": [{"key": "code", "title": "c"}]}))
    _assert_note(found, "primaryKey member", "data/primaryKey", "inferred")


def test_b11_malformed_foreign_keys_are_dropped_or_kept_in_extra():
    descriptor = {"spreadsheetId": "S", "sheet": "x", "range": "A:X"}
    good = {"fields": ["code"], "reference": {"ref": "F-00007"}}
    entry = _record({"fields": [{"key": "code", "title": "c"}],
                     "foreignKeys": [None, {}, descriptor, "junk", good]})
    found = _check(copy.deepcopy(entry))
    assert found and {(f.tier, f.mark) for f in found} == {(NOTE, NO_MARK)}
    assert _repair(entry) == []
    assert entry["data"]["foreignKeys"] == [good]
    assert entry["extra"] == {"data/foreignKeys": [descriptor, "junk"]}
    assert _check(entry) == []


def test_b12_an_undeclared_join_column_is_a_note_on_foreign_keys():
    found = _check(_record({"fields": [{"key": "code", "title": "c"}],
                            "foreignKeys": [{"fields": ["ghost"],
                                             "reference": {"ref": "F-00007"}}]}))
    _assert_note(found, "foreignKeys field", "data/foreignKeys", "inferred")


def test_b13_an_undeclared_row_section_is_a_note_on_that_section():
    found = _check(_record({"fields": [{"key": "item", "title": "i"}],
                            "rows": [{"key": "r1", "item": "x", "section": "ghost"}]}))
    _assert_note(found, "undeclared section", "data/rows/r1/section", "inferred")


def test_b14_an_undeclared_row_member_is_an_issue_naming_the_member():
    found = _check(_record({"fields": [{"key": "item", "title": "i"}],
                            "rows": [{"key": "r1", "item": "x", "vazn": 1},
                                     {"key": "r2", "item": "y", "vazn": 2}]}))
    hits = _only(found, "'vazn'")
    assert {(f.tier, f.path, f.mark) for f in hits} == {(NOTE, None, "issue")}
    assert len({f.fa for f in hits}) == 1 and "vazn" in hits[0].fa


def test_b15_a_typed_reference_row_missing_a_cell_is_a_note_with_no_mark():
    found = _check(_record({"primaryKey": ["code"],
                            "fields": [{"key": "code", "title": "c"},
                                       {"key": "grams", "title": "g"}],
                            "rows": [{"key": "p1", "code": "p1"}]}, role="reference"))
    _assert_note(found, "missing declared field", None, NO_MARK)


def test_b16_b17_shares_are_notes_on_the_share_and_on_the_outputs():
    found = _check(_rule(_computed(outputs=[
        {"key": "a", "title": "a", "share": 40},
        {"key": "b", "title": "b", "share": 0.5},
        {"key": "c", "title": "c", "share": 0.4}])))
    _assert_note(found, "not in (0, 1]", "data/outputs/a/share", "inferred")
    _assert_note(found, "shares sum", "data/outputs", "inferred")


# --------------------------------------------------------------------------- #
# B18–B22 — the rule body
# --------------------------------------------------------------------------- #

def test_b18_a_constant_with_a_stray_lang_and_no_expr_is_repaired_to_text():
    rule = _rule({"inputs": [], "lang": "feel",
                  "outputs": [{"key": "v", "title": "v", "value": 3}]})
    found = _check(copy.deepcopy(rule))
    assert [(f.tier, f.mark) for f in _only(found, "expr/lang")] == [(NOTE, NO_MARK)]
    assert _repair(rule) == []
    assert rule["data"]["lang"] == "text"
    assert _check(rule) == []


def test_b18_a_constant_carrying_an_expr_keeps_it_with_a_note():
    rule = _rule({"inputs": [], "lang": "feel", "expr": "v = 5",
                  "outputs": [{"key": "v", "title": "v", "value": 5}]})
    _repair(rule)
    assert rule["data"]["lang"] == "feel" and rule["data"]["expr"] == "v = 5"
    _assert_note(_check(rule), "expr/lang", "data/expr", "inferred")


def test_b19_a_constant_with_no_number_stores_value_null():
    rule = _rule({"inputs": [], "outputs": [{"key": "v", "title": "v"},
                                            {"key": "w", "title": "w",
                                             "range": {"min": 1, "max": 2}}]})
    _assert_note(_check(copy.deepcopy(rule)), "carries no value or range",
                 None, NO_MARK)
    _repair(rule)
    assert rule["data"]["outputs"] == [{"key": "v", "title": "v", "value": None},
                                       {"key": "w", "title": "w",
                                        "range": {"min": 1, "max": 2}}]
    assert _check(rule) == []


def test_b20_a_rule_with_inputs_and_no_lang():
    table = _table_rule([{"goruh": "x", "mabna": "y"}])
    del table["data"]["lang"]
    _repair(table)
    assert table["data"]["lang"] == "table"
    assert _check(table) == []
    bare = _rule(_computed())
    del bare["data"]["lang"]
    _repair(bare)
    assert "lang" not in bare["data"]
    _assert_note(_check(bare), "carries no lang", None, NO_MARK)


def test_b21_a_rule_with_inputs_and_no_body_is_a_note_with_no_mark():
    rule = _rule(_computed())
    del rule["data"]["expr"]
    _assert_note(_check(rule), "carries no expr", None, NO_MARK)


def test_b22_a_threshold_on_a_rule_with_inputs_earns_no_finding():
    rule = _rule(_computed(outputs=[{"key": "v", "title": "حد شروع پخت",
                                     "value": 5},
                                    {"key": "w", "title": "w",
                                     "range": {"min": 1, "max": 2}}],
                           expr="v = x; w = x"))
    assert _check(rule) == []


# --------------------------------------------------------------------------- #
# B23–B31 — decision tables
# --------------------------------------------------------------------------- #

def test_b23_lang_table_with_no_table_is_a_note_on_lang():
    rule = _table_rule([])
    del rule["data"]["table"]
    _assert_note(_check(rule), "carries no table", "data/lang", "inferred")


def test_b24_a_table_rule_with_expr_is_a_note_with_no_mark():
    _assert_note(_check(_table_rule([{"goruh": "x", "mabna": "y"}],
                                    expr="mabna = goruh")),
                 "a table rule carries expr", None, NO_MARK)


def test_b25_a_table_with_an_absent_or_other_lang():
    rule = _table_rule([{"goruh": "x", "mabna": "y"}], lang=None)
    _repair(rule)
    assert rule["data"]["lang"] == "table"
    other = _table_rule([{"goruh": "x", "mabna": "y"}], lang="feel",
                        expr="mabna = goruh")
    _repair(other)
    assert other["data"]["lang"] == "feel"
    _assert_note(_check(other), "its lang is not table", "data/table", "inferred")


def test_b26_an_undeclared_table_column_is_a_note_on_the_table():
    rule = _table_rule([{"ruz": "x", "mabna": "y"}])
    rule["data"]["table"]["inputs"] = ["ruz"]
    _assert_note(_check(rule), "is not a declared input", "data/table", "inferred")


def test_b27_null_rows_are_dropped_and_scalar_rows_kept_in_extra():
    row = {"goruh": "x", "mabna": "y"}
    rule = _table_rule([None, row, "", 7, [], "کارتن"])
    assert _check(copy.deepcopy(rule)) and \
        {f.tier for f in _check(copy.deepcopy(rule))} == {NOTE}
    _repair(rule)
    assert rule["data"]["table"]["rows"] == [row]
    assert rule["extra"] == {"data/table/rows": [7, "کارتن"]}
    assert _check(rule) == []


def test_b28_nested_rows_are_flattened_and_a_clash_is_a_note():
    rule = _table_rule([{"when": {"goruh": "x"}, "then": {"mabna": "y"}}])
    _repair(rule)
    assert rule["data"]["table"]["rows"] == [{"goruh": "x", "mabna": "y"}]
    assert _check(rule) == []
    clash = _table_rule([{"when": {"goruh": "x"}, "then": {"goruh": "y"}}])
    _repair(clash)
    assert clash["data"]["table"]["rows"][0] == {"when": {"goruh": "x"},
                                                 "then": {"goruh": "y"}}
    _assert_note(_check(clash), "when/then", "data/table", "inferred")


def test_b29_b30_row_keys_off_the_columns_and_fall_through_rows_are_unmarked():
    found = _check(_table_rule([{"goruh": "x", "vazn": 1}]))
    _assert_note(found, "is not a table column", None, NO_MARK)
    _assert_note(found, "names no output", None, NO_MARK)


def test_b31_a_default_key_off_the_outputs_is_a_note_on_the_default():
    rule = _table_rule([{"goruh": "x", "mabna": "y"}])
    rule["data"]["table"]["default"] = {"ghost": 1}
    _assert_note(_check(rule), "table default key", "data/table/default",
                 "inferred")


# --------------------------------------------------------------------------- #
# B32–B37
# --------------------------------------------------------------------------- #

def test_b32_field_status_markers_are_normalised_or_dropped():
    rule = _rule(_computed(), field_status={
        "data/expr": True, "data/lang": {"value": 5, "inferred": True},
        "data/inputs/x/unit": "Inferred", "data/outputs/v/unit": "informal",
        "data/inputs/x/title": "confirmed", "data/inputs/x/from": False,
        "data/outputs/v/title": None, "data/outputs/v/key": "stated"})
    found = _check(copy.deepcopy(rule))
    _no_refusal(found)
    _repair(rule)
    assert rule["field_status"] == {"data/expr": "inferred",
                                    "data/lang": "inferred",
                                    "data/inputs/x/unit": "inferred",
                                    "data/outputs/v/unit": "informal"}
    assert _check(rule) == []


def test_b33_a_field_status_path_naming_nothing_is_dropped_and_a_real_one_kept():
    record = _record({"fields": [{"key": "qty", "title": "مقدار", "type": "number"}]},
                     field_status={"data/fields/qty/title": "inferred",
                                   "data/fields/qty/type": "inferred",
                                   "data/fields/qty/unit": "inferred",
                                   "data/fields/ghost/title": "inferred"})
    _no_refusal(_check(copy.deepcopy(record)))
    _repair(record)
    assert record["field_status"] == {"data/fields/qty/title": "inferred",
                                      "data/fields/qty/type": "inferred"}


def test_b34_an_undeclared_reconciled_cell_is_a_note():
    record = _record({"fields": [{"key": "code", "title": "c"}],
                      "rows": [{"key": "p1", "code": "p1"}],
                      "reconciled_against": [{"cell": {"field": "ghost", "row": "p1"},
                                              "against": {"ref": "F-00001"}}]})
    _assert_note(_check(record), "ghost", "data/reconciled_against", "inferred")


def test_b35_issue_dates_are_normalised_or_moved_into_the_description():
    rule = _rule(_computed(), issues=[
        {"kind": "scale", "description": "d", "affects": [],
         "from_date": "۱۴۰۵/۶/۱", "to_date": "1405/7"},
        {"kind": "scale", "description": "e", "affects": [],
         "from_date": "not-a-date"}])
    _no_refusal(_check(copy.deepcopy(rule)))
    assert _repair(rule) == []
    assert rule["issues"][0]["from_date"] == "1405-06-01"
    assert rule["issues"][0]["to_date"] == "1405-07"
    assert "from_date" not in rule["issues"][1]
    assert "not-a-date" in rule["issues"][1]["description"]
    assert [f for f in _check(rule) if "Jalali" in f.message] == []


def test_b36_a_structure_dump_citation_becomes_the_workbook():
    rule = _rule(_computed(), source=[
        {"type": "script", "ref": "attachments/sheets/Salon__Salon - Naharkhoran/"
                                  "Salon - Naharkhoran.structure.md", "sheet": "x"},
        {"type": "script", "ref": "attachments/sheets/G/NAMED_FUNCTIONS.md"}])
    _no_refusal(_check(copy.deepcopy(rule)))
    _repair(rule)
    assert rule["source"][0] == {
        "type": "sheet", "sheet": "x",
        "ref": "attachments/sheets/Salon__Salon - Naharkhoran/Salon - Naharkhoran.xlsx"}
    assert rule["source"][1]["ref"].endswith("NAMED_FUNCTIONS.md")
    _assert_note(_check(rule), "NAMED_FUNCTIONS", "source/1", "inferred")


def test_b37_a_process_link_gets_its_citation_or_is_removed(tmp_path):
    proc = tmp_path / "departments" / "cooking" / "processes"
    proc.mkdir(parents=True)
    (proc / "cooking-001.json").write_text("{}", encoding="utf-8")
    rule = _rule(_computed(), processes=[{"ref": "cooking-001"},
                                         {"ref": "cooking-002"}])
    _assert_note(_check(copy.deepcopy(rule)), "no process-type source", None,
                 NO_MARK)
    untouched = copy.deepcopy(rule)
    assert _repair(untouched, root=None) == [] and untouched == rule
    notes = _repair(rule, tmp_path)
    assert rule["processes"] == [{"ref": "cooking-001"}]
    assert rule["source"][-1] == {
        "type": "process", "ref": "departments/cooking/processes/cooking-001.json"}
    assert [(n.tier, n.mark) for n in notes] == [(NOTE, "issue")]
    assert "cooking-002" in notes[0].fa
    assert _check(rule) == []


# --------------------------------------------------------------------------- #
# B38–B44 — the prose lint
# --------------------------------------------------------------------------- #

def test_b38_to_b44_every_lint_rule_is_a_note_with_no_mark():
    text = ("مقدار J6 از Pitza.xlsx در واحد کاری آمده و آشپزها می‌زنن در ستون "
            "Total «یک دو سه چهار پنج شش هفت هشت نه»")
    found = lint_prose(text, exemptions=())
    assert len(found) == 7
    assert {(f.tier, f.label, f.path, f.mark) for f in found} == \
        {(NOTE, "", None, NO_MARK)}
    entry = _rule({"inputs": [], "outputs": [{"key": "v", "title": "v", "value": 1}]},
                  title="Total J6", statement=text)
    found = _check(entry)
    assert found and {(f.tier, f.mark) for f in found} == {(NOTE, NO_MARK)}
    assert {f.path for f in found} == {"title", "statement"}
    assert any(f.line().startswith("T-1: statement names cell or range 'J6'")
               for f in found)


def test_b40_batch_and_pass_are_kitchen_words():
    assert "بچ" not in content.PIPELINE_WORDS and "پاس" not in content.PIPELINE_WORDS
    assert lint_prose("هر بچ سس در پاس دوم آماده می‌شود.", exemptions=()) == []
    style = (pathlib.Path(content.__file__).parents[1] / "facts_plan"
             / "cards" / "style.md").read_text(encoding="utf-8")
    assert "«بچ»" not in style and "«پاس»" not in style
