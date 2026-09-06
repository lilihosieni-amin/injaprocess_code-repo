"""Task 9: `validate facts`/`validate facts-delta` content pass — spec §12's
`validate facts` paragraph and the `feel` subset of §7. One test per numbered
check (task-9-brief.md Step 1), each a minimal document, plus the two wiring
points: `validate` CLI (schema pass, then content) and `merge facts apply`'s
precondition pass (Task 5's ponytail marker, now replaced).
"""
import json
import subprocess
import sys
import pathlib

import pytest
from facts_helpers import _const_delta, _root, _run_dir, _seed_units, _write
from merge_facts.apply import apply
from merge_facts.content import check_document, group_messages, lint_prose
from validate.cli import main


# --------------------------------------------------------------------------- #
# helpers — minimal envelopes per kind
# --------------------------------------------------------------------------- #

def _doc(*entries):
    return {"schema_version": 2, "entries": list(entries)}


def _rule(id_="T-1", key="tol", data=None, **extra):
    e = {"id": id_, "kind": "rule", "key": key, "title": "قاعده",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                     "lines": "1"}],
         "retired": False, "data": data or {}}
    e.update(extra)
    return e


def _record(id_="T-1", key="rec", role="log", data=None, **extra):
    base = {"medium": "sheet", "role": role,
           "location": {"spreadsheetId": "S", "sheetId": 1, "sheet": "sh",
                        "hidden": False}}
    if data:
        base.update(data)
    e = {"id": id_, "kind": "record", "key": key, "title": "رکورد",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/S/S.xlsx"}],
         "retired": False, "data": base}
    e.update(extra)
    return e


# --------------------------------------------------------------------------- #
# 1. expr tokeniser
# --------------------------------------------------------------------------- #

def test_expr_undeclared_identifier_fails():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                       "lang": "feel", "expr": "v = x + y"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("y" in m for m in msgs)


def test_expr_declared_identifiers_pass():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                       "lang": "feel", "expr": "v = x + 1"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_expr_only_checked_for_feel_lang():
    # `gs`/`sheets` carry no FEEL identifier grammar over `expr` — the spec
    # ties "validate tokenises every expr" to the `feel` bullet specifically.
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "rows", "title": "r", "unit": "g",
                                   "writes_to": {"ref": "T-9"}}],
                       "lang": "gs", "expr": "rows = someUndeclaredThing(x)"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_aggregate_form_requires_whole_table_edge_with_no_row():
    bom = _record(id_="T-2", key="bom", role="reference",
                  data={"primaryKey": ["product"],
                        "fields": [{"key": "product", "title": "p",
                                   "type": "string"},
                                  {"key": "grams", "title": "g",
                                   "type": "number", "unit": "g"}],
                        "rows": [{"key": "p1", "product": "p1", "grams": 10}]})
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "T-2", "field": "grams",
                                           "row": "p1"}}],
                       "outputs": [{"key": "total", "title": "t", "unit": "g"}],
                       "lang": "feel",
                       "expr": "total = sum over bom_row of (a * b)"})
    msgs = check_document(_doc(bom, rule), "facts-delta")
    assert any("sum over bom_row" in m for m in msgs)


# --- Task 9 review round 2: the from-shape check must fire on EVERY -------- #
# --- aggregate match, even one with no parenthesised body — the F2 --------- #
# --- refactor had accidentally gated it on `_aggregate_spans`, which only -- #
# --- produces a span when `of` is immediately followed by `(` ------------- #

def test_aggregate_without_parens_and_illegal_row_from_fails_shape():
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "T-2", "field": "grams",
                                           "row": "p1"}}],
                       "outputs": [{"key": "total", "title": "t", "unit": "g"}],
                       "lang": "feel",
                       "expr": "total = sum over bom_row of bom_row"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("sum over bom_row" in m for m in msgs)


def test_aggregate_without_parens_and_legal_from_has_no_shape_message():
    bom = _record(id_="T-2", key="bom", role="reference",
                  data={"primaryKey": ["product"],
                        "fields": [{"key": "product", "title": "p",
                                   "type": "string"},
                                  {"key": "grams", "title": "g",
                                   "type": "number", "unit": "g"}],
                        "rows": [{"key": "p1", "product": "p1", "grams": 10}]})
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "T-2", "field": "grams"}}],
                       "outputs": [{"key": "total", "title": "t", "unit": "g"}],
                       "lang": "feel",
                       "expr": "total = sum over bom_row of bom_row"})
    assert check_document(_doc(bom, rule), "facts-delta") == []


def test_aggregate_form_passes_with_whole_table_edge():
    bom = _record(id_="T-2", key="bom", role="reference",
                  data={"primaryKey": ["product"],
                        "fields": [{"key": "product", "title": "p",
                                   "type": "string"},
                                  {"key": "grams", "title": "g",
                                   "type": "number", "unit": "g"}],
                        "rows": [{"key": "p1", "product": "p1", "grams": 10}]})
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "T-2", "field": "grams"}},
                                  # spec §7: "<a>/<b> are columns of that
                                  # table OR INPUTS joined on the row key" —
                                  # declared here as ordinary inputs.
                                  {"key": "a", "title": "a", "unit": "g",
                                   "from": "operator"},
                                  {"key": "b", "title": "b", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "total", "title": "t", "unit": "g"}],
                       "lang": "feel",
                       "expr": "total = sum over bom_row of (a * b)"})
    assert check_document(_doc(bom, rule), "facts-delta") == []


# --- Task 9 review, F2: aggregate body identifiers also allow the ---------- #
# --- referenced record's own declared columns (spec's own BOM example) ---- #

def test_aggregate_form_allows_the_target_records_own_columns():
    # spec §7 verbatim: "standard use = Σ sales × grams per product" over the
    # BOM — `grams` is a COLUMN of the referenced table, not a rule input.
    bom = _record(id_="T-2", key="bom", role="reference",
                  data={"primaryKey": ["product"],
                        "fields": [{"key": "product", "title": "p",
                                   "type": "string"},
                                  {"key": "grams", "title": "g",
                                   "type": "number", "unit": "g"}],
                        "rows": [{"key": "p1", "product": "p1", "grams": 10}]})
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "T-2", "field": "grams"}},
                                  {"key": "sales", "title": "s", "unit": "pcs",
                                   "from": "operator"}],
                       "outputs": [{"key": "standard_use", "title": "su",
                                   "unit": "g"}],
                       "lang": "feel",
                       "expr": "standard_use = sum over bom_row of "
                              "(sales * grams)"})
    assert check_document(_doc(bom, rule), "facts-delta") == []


def test_aggregate_body_identifier_neither_input_nor_column_fails_when_target_resolvable():
    bom = _record(id_="T-2", key="bom", role="reference",
                  data={"primaryKey": ["product"],
                        "fields": [{"key": "product", "title": "p",
                                   "type": "string"},
                                  {"key": "grams", "title": "g",
                                   "type": "number", "unit": "g"}],
                        "rows": [{"key": "p1", "product": "p1", "grams": 10}]})
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "T-2", "field": "grams"}}],
                       "outputs": [{"key": "total", "title": "t", "unit": "g"}],
                       "lang": "feel",
                       "expr": "total = sum over bom_row of (grams * mystery)"})
    msgs = check_document(_doc(bom, rule), "facts-delta")
    assert any("mystery" in m for m in msgs)


def test_aggregate_target_unresolvable_without_store_resolves_with_store():
    store = {"record": {"entries": [
        {"id": "F-00002", "kind": "record", "key": "bom",
         "data": {"medium": "sheet", "role": "reference",
                  "location": {}, "primaryKey": ["product"],
                  "fields": [{"key": "product", "title": "p", "type": "string"},
                             {"key": "grams", "title": "g", "type": "number",
                              "unit": "g"}],
                  "rows": []}}]}}
    rule = _rule(data={"inputs": [{"key": "bom_row", "title": "b", "unit": "g",
                                   "from": {"ref": "F-00002", "field": "grams"}},
                                  {"key": "sales", "title": "s", "unit": "pcs",
                                   "from": "operator"}],
                       "outputs": [{"key": "standard_use", "title": "su",
                                   "unit": "g"}],
                       "lang": "feel",
                       "expr": "standard_use = sum over bom_row of "
                              "(sales * grams)"})
    assert check_document(_doc(rule), "facts-delta") == []           # skipped, unresolvable
    assert check_document(_doc(rule), "facts-delta", store) == []    # resolved via store


def test_unresolved_call_identifier_fails():
    # A `calls[]` member is `{ref}`; when the target is not in this document
    # (cross-store), its key is unknowable here — decision recorded in the
    # task report: the identifier fails rather than being waved through just
    # because `calls` is non-empty.
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g"}],
                       "lang": "feel", "expr": "v = helper_fn()",
                       "calls": [{"ref": "F-09999"}]})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("helper_fn" in m for m in msgs)


def test_intra_document_call_identifier_resolves():
    helper = _rule(id_="T-2", key="helper_fn",
                   data={"inputs": [{"key": "a", "title": "a", "unit": "g",
                                     "from": "operator"}],
                        "outputs": [{"key": "h", "title": "h", "unit": "g"}],
                        "lang": "feel", "expr": "h = a"})
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                       "lang": "feel", "expr": "v = helper_fn(x)",
                       "calls": [{"ref": "T-2"}]})
    assert check_document(_doc(helper, rule), "facts-delta") == []


# --- Task 9 review, F1: `calls[]` also resolves against an optional `store` - #

def test_call_unresolved_without_store_resolves_with_store():
    store = {"rule": {"entries": [
        {"id": "F-00001", "kind": "rule", "key": "helper_fn",
         "data": {"inputs": [{"key": "a", "title": "a", "unit": "g",
                              "from": "operator"}],
                  "outputs": [{"key": "h", "title": "h", "unit": "g"}],
                  "lang": "feel", "expr": "h = a"}}]}}
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                       "lang": "feel", "expr": "v = helper_fn(x)",
                       "calls": [{"ref": "F-00001"}]})
    assert check_document(_doc(rule), "facts-delta") != []           # no store
    assert check_document(_doc(rule), "facts-delta", store) == []    # with store


# --------------------------------------------------------------------------- #
# 2. unit edges intra-file
# --------------------------------------------------------------------------- #

def test_unit_mismatch_without_via_fails():
    record = _record(data={"fields": [{"key": "col", "title": "c",
                                       "type": "number", "unit": "kg"}]})
    rule = _rule(id_="T-2",
                data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                  "from": {"ref": "T-1", "field": "col"}}],
                      "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                      "lang": "feel", "expr": "v = x"})
    msgs = check_document(_doc(record, rule), "facts-delta")
    assert any("kg" in m and "g" in m for m in msgs)


def test_unit_mismatch_with_via_passes():
    record = _record(data={"fields": [{"key": "col", "title": "c",
                                       "type": "number", "unit": "kg"}]})
    rule = _rule(id_="T-2",
                data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                  "from": {"ref": "T-1", "field": "col"},
                                  "via": {"ref": "T-3"}}],
                      "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                      "lang": "feel", "expr": "v = x"})
    assert check_document(_doc(record, rule), "facts-delta") == []


def test_unit_agreeing_passes():
    record = _record(data={"fields": [{"key": "col", "title": "c",
                                       "type": "number", "unit": "g"}]})
    rule = _rule(id_="T-2",
                data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                  "from": {"ref": "T-1", "field": "col"}}],
                      "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                      "lang": "feel", "expr": "v = x"})
    assert check_document(_doc(record, rule), "facts-delta") == []


# --------------------------------------------------------------------------- #
# 3. key patterns + __ reservation; refItems cell values
# --------------------------------------------------------------------------- #

def test_bad_nested_key_pattern_fails():
    record = _record(data={"fields": [{"key": "Not-A-Key", "title": "c",
                                       "type": "number"}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("Not-A-Key" in m for m in msgs)


def test_refitems_cell_not_minted_segment_fails():
    record = _record(role="reference",
                     data={"primaryKey": ["ingredient"],
                           "fields": [{"key": "ingredient", "title": "i",
                                      "type": "string",
                                      "refItems": {"namespace": "##",
                                                  "resolved_by": "code"}},
                                     {"key": "grams", "title": "g",
                                      "type": "number", "unit": "g"}],
                           "rows": [{"key": "row1",
                                    "ingredient": "T-99", "grams": 5}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("refItems" in m for m in msgs)


def test_refitems_cell_minted_segment_passes():
    record = _record(role="reference",
                     data={"primaryKey": ["ingredient"],
                           "fields": [{"key": "ingredient", "title": "i",
                                      "type": "string",
                                      "refItems": {"namespace": "##",
                                                  "resolved_by": "code"}},
                                     {"key": "grams", "title": "g",
                                      "type": "number", "unit": "g"}],
                           "rows": [{"key": "ing_1",
                                    "ingredient": "ing_1", "grams": 5}]})
    assert check_document(_doc(record), "facts-delta") == []


# --------------------------------------------------------------------------- #
# 4. processes[].ref grammar re-assertion
# --------------------------------------------------------------------------- #

def test_processes_ref_bad_grammar_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                processes=[{"ref": "not-a-process-id"}],
                source=[{"type": "process",
                        "ref": "departments/cooking/processes/not-a-process-id.json",
                        "node": "n1", "quote": "q"}])
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("process id grammar" in m for m in msgs)


def test_processes_ref_good_grammar_passes_this_check():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                processes=[{"ref": "cooking-001"}],
                source=[{"type": "process",
                        "ref": "departments/cooking/processes/cooking-001.json",
                        "node": "n1", "quote": "q"}])
    assert check_document(_doc(rule), "facts-delta") == []


# --------------------------------------------------------------------------- #
# 5. primaryKey/foreignKeys/rows[].section membership; reserved names;
#    reference-row field presence
# --------------------------------------------------------------------------- #

def test_reference_row_missing_declared_field_fails():
    record = _record(role="reference",
                     data={"primaryKey": ["code"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"},
                                     {"key": "grams", "title": "g",
                                      "type": "number", "unit": "g"}],
                           "rows": [{"key": "p1", "code": "p1"}]})  # no grams
    msgs = check_document(_doc(record), "facts-delta")
    assert any("grams" in m for m in msgs)


def test_reference_row_with_null_field_passes():
    record = _record(role="reference",
                     data={"primaryKey": ["code"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"},
                                     {"key": "grams", "title": "g",
                                      "type": "number", "unit": "g"}],
                           "rows": [{"key": "p1", "code": "p1",
                                    "grams": None}]})
    assert check_document(_doc(record), "facts-delta") == []


def test_primary_key_member_not_declared_fails():
    record = _record(role="reference",
                     data={"primaryKey": ["missing_col"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"}],
                           "rows": []})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("missing_col" in m for m in msgs)


def test_row_section_not_declared_fails():
    record = _record(data={"fields": [{"key": "item", "title": "i",
                                       "type": "string"}],
                           "rows": [{"key": "r1", "item": "x",
                                    "section": "ghost_section"}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("ghost_section" in m for m in msgs)


def test_row_member_not_a_declared_field_fails():
    record = _record(data={"fields": [{"key": "item", "title": "i",
                                       "type": "string"}],
                           "rows": [{"key": "r1", "item": "x",
                                    "not_a_field": 1}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("not_a_field" in m for m in msgs)


def test_foreign_key_without_its_two_sides_fails():
    # The shape 84 stored records carry, verbatim from `F-00216`: an IMPORT
    # descriptor written into `foreignKeys`, where §8 puts `{fields, reference,
    # reference_fields, transform?}`. The membership loop below iterated
    # `fk.get("fields") or []`, so an absent `fields` was an empty list and the
    # member passed — every one of the 84 validated cleanly and then crashed the
    # screen that drew it. A key that names neither its own columns nor the
    # table it points at declares no join.
    record = _record(role="mirror",
                     data={"mirror_of": {"ref": "F-00193"},
                           "foreignKeys": [{"spreadsheetId": "S",
                                            "sheet": "singlePizza",
                                            "range": "A:X",
                                            "target": {"ref": "F-00193"}}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("foreignKeys" in m for m in msgs)


def test_foreign_key_missing_either_side_alone_fails():
    # The stored 84 lack both halves, so the test above cannot tell which check
    # caught them. One record per half, so each is load-bearing on its own.
    def one(fk):
        return _record(role="reference",
                       data={"fields": [{"key": "code", "title": "c",
                                        "type": "string"}],
                             "rows": [{"key": "p1", "code": "p1"}],
                             "foreignKeys": [fk]})
    no_reference = one({"fields": ["code"], "reference_fields": ["key"]})
    assert any("reference" in m
               for m in check_document(_doc(no_reference), "facts-delta"))
    no_fields = one({"reference": {"ref": "F-00007"},
                     "reference_fields": ["key"]})
    assert any("fields" in m
               for m in check_document(_doc(no_fields), "facts-delta"))


def test_foreign_key_with_both_sides_passes():
    record = _record(role="reference",
                     data={"primaryKey": ["code"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"}],
                           "rows": [{"key": "p1", "code": "p1"}],
                           "foreignKeys": [{"fields": ["code"],
                                            "reference": {"ref": "F-00007"},
                                            "reference_fields": ["key"]}]})
    assert check_document(_doc(record), "facts-delta") == []


def test_reserved_row_name_as_field_key_fails():
    record = _record(data={"fields": [{"key": "unit", "title": "u",
                                       "type": "string"}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("reserved" in m for m in msgs)


# --------------------------------------------------------------------------- #
# 6. shares
# --------------------------------------------------------------------------- #

def test_shares_summing_to_point_nine_fails():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "kg",
                                   "from": "operator"}],
                       "outputs": [{"key": "a", "title": "a", "unit": "kg",
                                   "share": 0.5},
                                  {"key": "b", "title": "b", "unit": "kg",
                                   "share": 0.4}],
                       "lang": "feel", "expr": "a = x * 0.5; b = x * 0.4"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("sum to" in m for m in msgs)


def test_shares_summing_to_one_passes():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "kg",
                                   "from": "operator"}],
                       "outputs": [{"key": "a", "title": "a", "unit": "kg",
                                   "share": 0.6},
                                  {"key": "b", "title": "b", "unit": "kg",
                                   "share": 0.4}],
                       "lang": "feel", "expr": "a = x * 0.6; b = x * 0.4"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_share_out_of_range_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "a", "title": "a",
                                                  "unit": "kg", "share": 1.5,
                                                  "value": 1}]})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("(0, 1]" in m for m in msgs)


# --------------------------------------------------------------------------- #
# 7. constant shape
# --------------------------------------------------------------------------- #

def test_rule_with_inputs_and_value_output_fails():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g",
                                   "value": 5}],
                       "lang": "feel", "expr": "v = x"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("value or range" in m for m in msgs)


def test_constant_with_expr_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 5}],
                       "expr": "v = 5"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("expr/lang" in m for m in msgs)


def test_constant_without_value_or_range_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g"}]})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("value or range" in m for m in msgs)


def test_valid_constant_passes():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": None}]})
    assert check_document(_doc(rule), "facts-delta") == []


def test_valid_computed_rule_with_original_passes():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                       "lang": "sheets", "original": "=X6"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_facts_file_computed_rule_needs_original_ref_not_original():
    rule = _rule(data={"inputs": [{"key": "x", "title": "x", "unit": "g",
                                   "from": "operator"}],
                       "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                       "lang": "feel", "original": "=X6"})   # no expr either
    msgs = check_document(_doc(rule), "facts")
    assert any("original_ref" in m for m in msgs)
    rule["data"]["original_ref"] = "facts/originals/F-00001.txt"
    del rule["data"]["original"]
    assert check_document(_doc(rule), "facts") == []


# --------------------------------------------------------------------------- #
# 8. field_status paths
# --------------------------------------------------------------------------- #

def test_field_status_missing_path_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 5}]},
                field_status={"data/outputs/nope/value": "inferred"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("data/outputs/nope/value" in m for m in msgs)


def test_field_status_existing_path_passes():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 5}]},
                field_status={"data/outputs/v/value": "inferred"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_field_status_bad_value_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 5}]},
                field_status={"data/outputs/v/value": "confirmed"})
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("confirmed" in m for m in msgs)


# --------------------------------------------------------------------------- #
# 9. reconciled_against
# --------------------------------------------------------------------------- #

def test_reconciled_against_undeclared_field_fails():
    record = _record(role="reference",
                     data={"primaryKey": ["code"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"}],
                           "rows": [{"key": "p1", "code": "p1"}],
                           "reconciled_against": [
                               {"cell": {"field": "ghost", "row": "p1"},
                                "against": {"ref": "F-00001", "field": "v"}}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("ghost" in m for m in msgs)


def test_reconciled_against_undeclared_row_fails():
    record = _record(role="reference",
                     data={"primaryKey": ["code"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"}],
                           "rows": [{"key": "p1", "code": "p1"}],
                           "reconciled_against": [
                               {"cell": {"field": "code", "row": "ghost_row"},
                                "against": {"ref": "F-00001", "field": "v"}}]})
    msgs = check_document(_doc(record), "facts-delta")
    assert any("ghost_row" in m for m in msgs)


def test_reconciled_against_declared_here_passes():
    record = _record(role="reference",
                     data={"primaryKey": ["code"],
                           "fields": [{"key": "code", "title": "c",
                                      "type": "string"}],
                           "rows": [{"key": "p1", "code": "p1"}],
                           "reconciled_against": [
                               {"cell": {"field": "code", "row": "p1"},
                                "against": {"ref": "F-00001", "field": "v"}}]})
    assert check_document(_doc(record), "facts-delta") == []


# --------------------------------------------------------------------------- #
# 10. Jalali date patterns
# --------------------------------------------------------------------------- #

def test_bad_from_date_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                issues=[{"kind": "scale", "description": "d", "affects": [],
                        "from_date": "not-a-date"}])
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("not-a-date" in m for m in msgs)


def test_good_from_date_passes():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                issues=[{"kind": "scale", "description": "d", "affects": [],
                        "from_date": "1405-06-01"}])
    assert check_document(_doc(rule), "facts-delta") == []


# --------------------------------------------------------------------------- #
# 11. source[].ref exclusions
# --------------------------------------------------------------------------- #

def test_source_ref_naming_structure_md_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                source=[{"type": "sheet",
                        "ref": "attachments/sheets/Pitza/Pitza.structure.md"}])
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("structure.md" in m for m in msgs)


def test_source_ref_naming_named_functions_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                source=[{"type": "script",
                        "ref": "attachments/sheets/G/NAMED_FUNCTIONS.md"}])
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("NAMED_FUNCTIONS.md" in m for m in msgs)


def test_ordinary_source_ref_passes():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                source=[{"type": "sheet",
                        "ref": "attachments/sheets/Pitza/Pitza.xlsx"}])
    assert check_document(_doc(rule), "facts-delta") == []


# --------------------------------------------------------------------------- #
# 12. processes[] source presence
# --------------------------------------------------------------------------- #

def test_processes_entry_with_no_matching_process_source_fails():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                processes=[{"ref": "cooking-001"}],
                source=[{"type": "voice", "ref": "meetings/transcripts/c.txt",
                        "lines": "1"}])
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("cooking-001" in m for m in msgs)


def test_processes_entry_with_matching_process_source_passes():
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 1}]},
                processes=[{"ref": "cooking-001"}],
                source=[{"type": "process",
                        "ref": "departments/cooking/processes/cooking-001.json",
                        "node": "cooking-001-n010", "quote": "q"}])
    assert check_document(_doc(rule), "facts-delta") == []


# --------------------------------------------------------------------------- #
# wiring: validate CLI
# --------------------------------------------------------------------------- #

def _write_json(tmp_path, obj, name="f.json"):
    p = tmp_path / name
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    return str(p)


def test_validate_cli_content_failure_exits_2_after_schema_passes(tmp_path, capsys):
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 5}],
                       "expr": "v = 5"})   # constant carrying expr — check 7
    f = _write_json(tmp_path, _doc(rule))
    with pytest.raises(SystemExit) as e:
        main(["facts-delta", f])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "expr/lang" in err


def test_validate_cli_content_check_runs_for_facts_schema_too(tmp_path, capsys):
    # the wiring point names two schemas (facts.schema.json AND
    # facts-delta.schema.json) — exercised separately from the delta case
    # above, on a store-shaped envelope (id, status, updated_at all present).
    rule = {
        "id": "F-00001", "kind": "rule", "key": "tol", "title": "قاعده",
        "statement": "s", "scope": {"departments": [], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                    "lines": "1"}],
        "status": "confirmed", "field_status": {}, "retired": False,
        "updated_at": "2026-01-01T00:00:00Z",
        "data": {"inputs": [], "outputs": [{"key": "v", "title": "v",
                                            "unit": "g", "value": 5}],
                "expr": "v = 5"}}   # constant carrying expr — check 7
    f = _write_json(tmp_path, _doc(rule), name="facts.json")
    with pytest.raises(SystemExit) as e:
        main(["facts", f])
    assert e.value.code == 2
    assert "expr/lang" in capsys.readouterr().err


def test_validate_cli_content_pass_exits_0(tmp_path):
    rule = _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "v",
                                                  "unit": "g", "value": 5}]})
    f = _write_json(tmp_path, _doc(rule))
    assert main(["facts-delta", f]) == 0


def test_validate_cli_ignores_content_pass_for_unrelated_schemas(tmp_path):
    # a segments.json wouldn't have `entries` shaped like facts — the content
    # pass must run only for facts/facts-delta schema names.
    from conftest import load_fixture
    f = _write_json(tmp_path, load_fixture("segments.json"), name="s.json")
    assert main(["segments", f]) == 0


# --------------------------------------------------------------------------- #
# wiring: merge facts apply's precondition pass
# --------------------------------------------------------------------------- #

def test_apply_refuses_a_content_violation_and_writes_nothing(tmp_path):
    root = _root(tmp_path)
    _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"]["expr"] = "v = 5"   # constant carrying expr
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    with pytest.raises(SystemExit) as e:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
    assert e.value.code == 2
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after


def test_apply_precondition_message_names_the_content_finding(tmp_path, capsys):
    root = _root(tmp_path)
    _seed_units(root)
    d = _const_delta()
    d["entries"][0]["data"]["expr"] = "v = 5"
    with pytest.raises(SystemExit):
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
    err = capsys.readouterr().err
    assert "precondition failed:" in err and "expr/lang" in err


def test_apply_accepts_a_content_clean_delta(tmp_path):
    root = _root(tmp_path)
    _seed_units(root)
    report = apply(root, _write(root, "d1.json", _const_delta()),
                   _run_dir(root, "1"))
    assert report["id_map"]["T-1"]


def test_cli_apply_via_subprocess_still_ok_with_content_pass(tmp_path):
    root = _root(tmp_path)
    _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    run = _run_dir(root, "20260901-121500")
    proc = subprocess.run([sys.executable, "-m", "merge.cli", "facts", "apply",
                           "--delta", str(d), "--run", str(run)],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": ""}
                          | {"SCHEMA_DIR": str(pathlib.Path(__file__).resolve().parents[2] / "schemas"),
                             "SYSTEMROOT": ""})
    assert proc.returncode == 0, proc.stderr


# --------------------------------------------------------------------------- #
# Task 9 review — F1/F2 locking tests: apply passes its store into
# check_document, so a new delta may call, or aggregate over, an entry an
# EARLIER delta already applied (the common case both findings were about).
# --------------------------------------------------------------------------- #

def test_apply_resolves_calls_against_a_rule_from_an_earlier_delta(tmp_path):
    root = _root(tmp_path)
    _seed_units(root)
    helper_delta = {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "rule", "key": "helper_fn", "title": "کمکی",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                     "lines": "1"}],
         "retired": False,
         "data": {"inputs": [{"key": "a", "title": "a", "unit": "g",
                              "from": "operator"}],
                  "outputs": [{"key": "h", "title": "h", "unit": "g"}],
                  "lang": "feel", "expr": "h = a"}}]}
    r1 = apply(root, _write(root, "d1.json", helper_delta), _run_dir(root, "1"))
    helper_id = r1["id_map"]["T-1"]

    caller_delta = {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "rule", "key": "caller_fn", "title": "صدازننده",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                     "lines": "2"}],
         "retired": False,
         "data": {"inputs": [{"key": "x", "title": "x", "unit": "g",
                              "from": "operator"}],
                  "outputs": [{"key": "v", "title": "v", "unit": "g"}],
                  "lang": "feel", "expr": "v = helper_fn(x)",
                  "calls": [{"ref": helper_id}]}}]}
    r2 = apply(root, _write(root, "d2.json", caller_delta), _run_dir(root, "2"))
    assert r2["id_map"]["T-1"]


def test_apply_resolves_aggregate_table_columns_against_an_earlier_delta(tmp_path):
    root = _root(tmp_path)
    _seed_units(root)
    bom_delta = {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "record", "key": "bom", "title": "بام",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False,
         "data": {"medium": "sheet", "role": "reference",
                  "location": {"spreadsheetId": "M", "sheetId": 1,
                               "sheet": "s", "hidden": False},
                  "primaryKey": ["product"],
                  "fields": [{"key": "product", "title": "p", "type": "string"},
                             {"key": "grams", "title": "g", "type": "number",
                              "unit": "g"}],
                  "rows": []}}]}
    r1 = apply(root, _write(root, "d1.json", bom_delta), _run_dir(root, "1"))
    bom_id = r1["id_map"]["T-1"]

    # spec §7 verbatim: "standard use = Σ sales × grams per product" over the
    # BOM — `grams` is the reference record's own column, not a rule input.
    rule_delta = {"schema_version": 2, "entries": [
        {"id": "T-1", "kind": "rule", "key": "standard_use",
         "title": "مصرف استاندارد", "statement": "s",
         "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                     "lines": "1"}],
         "retired": False,
         "data": {"inputs": [{"key": "bom_row", "title": "r", "unit": "g",
                              "from": {"ref": bom_id, "field": "grams"}},
                             {"key": "sales", "title": "s", "unit": "pcs",
                              "from": "operator"}],
                  "outputs": [{"key": "standard_use", "title": "su",
                              "unit": "g"}],
                  "lang": "feel",
                  "expr": "standard_use = sum over bom_row of "
                         "(sales * grams)"}}]}
    r2 = apply(root, _write(root, "d2.json", rule_delta), _run_dir(root, "2"))
    assert r2["id_map"]["T-1"]


# --------------------------------------------------------------------------- #
# 13. the §5.2 prose lint
# --------------------------------------------------------------------------- #

def _constant(**extra):
    return _rule(data={"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                                                  "unit": "g", "value": 5}]},
                 **extra)


def test_a_statement_naming_a_cell_or_a_file_fails():
    msgs = check_document(_doc(_constant(
        statement="انحراف در J6 نوشته می‌شود و از Pitza.xlsx می‌آید.")),
        "facts-delta")
    assert any("statement" in m and "J6" in m for m in msgs)
    assert any(".xlsx" in m for m in msgs)


def test_a_title_naming_a_table_fails():
    msgs = check_document(_doc(_constant(title="تلورانس Table_BOM")),
                          "facts-delta")
    assert any("title" in m and "Table_" in m for m in msgs)


def test_a_pipeline_word_fails_but_a_word_that_contains_one_passes():
    msgs = check_document(_doc(_constant(
        statement="این مقدار در پاس دوم به دست آمد.")), "facts-delta")
    assert any("پاس" in m for m in msgs)
    assert check_document(_doc(_constant(
        statement="پرسش بی‌پاسخ در پنل تعیین تکلیف می‌شود.")),
        "facts-delta") == []


def test_the_sheet_words_belong_to_a_record_statement_and_a_field_description():
    record = _record(data={"fields": [
        {"key": "masraf", "title": "مصرف", "type": "number", "unit": "g",
         "description": "ستون مصرف اعلامی لاین."}]},
        title="مصرف اعلامی",
        statement="ستون مصرف اعلامی هر شب توسط سرپرست لاین پر می‌شود.")
    assert check_document(_doc(record), "facts-delta") == []
    assert any("ستون" in m and "title" in m for m in check_document(
        _doc(_record(title="ستون مصرف")), "facts-delta"))


def test_a_declared_unit_symbol_is_not_a_latin_leak():
    rule = _constant(statement="هر پرس ۶۰ gram است.")
    assert any("gram" in m for m in check_document(_doc(rule), "facts-delta"))
    assert check_document(_doc(rule), "facts-delta",
                          unit_symbols=["gram"]) == []


def test_a_spoken_ending_and_a_long_quotation_fail():
    assert any("می‌زنن" in m for m in check_document(
        _doc(_constant(statement="آشپزها معمولاً بیشتر می‌زنن.")),
        "facts-delta"))
    assert any("quot" in m for m in check_document(_doc(_constant(
        statement="«یک عدد قارچ حدود ده تا پانزده گرم وزن دارد گاهی»")),
        "facts-delta"))


def test_an_engine_written_issue_description_may_name_the_column():
    issue = {"kind": "column_shift", "affects": [], "engine": True,
             "description": "ستون K6 در نسخهٔ کپی‌شده جا افتاده است."}
    assert check_document(_doc(_constant(issues=[issue])), "facts-delta") == []
    unit_written = {k: v for k, v in issue.items() if k != "engine"}
    assert any("K6" in m for m in check_document(
        _doc(_constant(issues=[unit_written])), "facts-delta"))


def test_the_workbook_stub_marker_is_not_linted_as_prose():
    record = _record(data={"stub": True, "grain": "workbook"})
    assert check_document(_doc(record), "facts-delta") == []
    record["data"]["grain"] = "nightly"
    assert any("grain" in m and "nightly" in m for m in
               check_document(_doc(record), "facts-delta"))


def test_lint_prose_is_empty_for_a_definition_in_the_written_register():
    assert lint_prose("انحراف مصرف هر مادهٔ اولیه در پایان شب برابر است با "
                      "مصرف واقعی منهای مصرف اعلامی لاین.",
                      exemptions=()) == []


def test_group_messages_folds_one_rule_into_one_line():
    a = _constant(id_="T-1", key="tol", statement="انحراف برابر است با J6.")
    b = _constant(id_="T-2", key="tol2", statement="مصرف برابر است با K7.")
    lines = group_messages(check_document(_doc(a, b), "facts-delta"))
    assert len(lines) == 1
    assert lines[0].endswith("— 2 entries: T-1, T-2")


# --------------------------------------------------------------------------- #
# 7 (v3). a policy rule is `lang: text` with no inputs
# --------------------------------------------------------------------------- #

def test_a_policy_rule_with_no_inputs_and_lang_text_passes():
    rule = _rule(data={"inputs": [], "lang": "text",
                       "text": "شمارش آخر شب فقط پس از بستن خط انجام می‌شود.",
                       "outputs": [{"key": "hadd", "title": "حد", "unit": "g",
                                    "value": None}]})
    assert check_document(_doc(rule), "facts-delta") == []
    rule["data"]["lang"] = "feel"
    assert any("expr/lang" in m for m in
               check_document(_doc(rule), "facts-delta"))


# --------------------------------------------------------------------------- #
# 5 (v3). reference rows are checked only where the model typed them
# --------------------------------------------------------------------------- #

def test_a_sheet_records_reference_rows_are_not_checked_for_completeness():
    record = _record(role="reference", data={
        "instances": [{"key": "gozaresh__s1", "spreadsheetId": "S",
                       "sheetId": 1, "sheet": "پیتزا", "branch": "chalebagh",
                       "hidden": False}],
        "primaryKey": ["code"],
        "fields": [{"key": "code", "title": "کد", "type": "string"},
                   {"key": "grams", "title": "گرم", "type": "number",
                    "unit": "g"}],
        "rows": [{"key": "p1", "code": "p1"}]})
    assert check_document(_doc(record), "facts-delta") == []
    del record["data"]["instances"]
    assert any("grams" in m for m in
               check_document(_doc(record), "facts-delta"))


# --------------------------------------------------------------------------- #
# 1 (v3). a parameter input is an ordinary declared identifier
# --------------------------------------------------------------------------- #

def test_a_param_input_is_an_ordinary_declared_identifier():
    rule = _rule(data={"inputs": [
        {"key": "enheraf", "title": "انحراف", "unit": "g", "from": "operator"},
        {"key": "tolerance_gr", "title": "تلورانس", "unit": "g",
         "from": {"param": "tolerancePerFoodGr"}}],
        "outputs": [{"key": "enheraf_ba_tolerance", "title": "انحراف با تلورانس",
                     "unit": "g"}],
        "lang": "feel",
        "expr": "enheraf_ba_tolerance = enheraf - tolerance_gr"})
    assert check_document(_doc(rule), "facts-delta") == []


def test_apply_refuses_a_statement_that_names_a_cell(tmp_path, capsys):
    root = _root(tmp_path)
    _seed_units(root)
    d = _const_delta()
    d["entries"][0]["statement"] = "حد مجاز در J6 نوشته شده است."
    with pytest.raises(SystemExit) as e:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
    assert e.value.code == 2
    assert "J6" in capsys.readouterr().err
