"""`facts-plan build`'s rule columns over the mini estate.

The three assertions this file exists for: one column that computes the same
thing in two branch books is ONE candidate with two bindings (QF-47); a
tolerance keeps `tolerancePerFoodGr` as a parameter key and its basis column as
a `{ref, field}` (§2.5); and a date pass-through above the header row mints
nothing at all (§2.3).
"""
import pytest
from facts_plan.build import (
    called_names,
    load_estate,
    normalise,
    record_templates,
    rule_columns,
    script_rules,
    table_reading_functions,
)
from fixtures.facts_plan.make_dump import make_estate


@pytest.fixture
def built(tmp_path):
    make_estate(tmp_path)
    estate = load_estate(tmp_path)
    templates, instances, _ = record_templates(estate, "cooking")
    functions = table_reading_functions(estate)
    candidates, issues = rule_columns(estate, "cooking", templates, instances,
                                      functions)
    return estate, templates, instances, candidates, issues


def _by_output(candidates, output):
    return next(c for c in candidates if c["render"]["output"] == output)


def _kinds(issues):
    return [i["kind"] for i in issues]


def test_the_deviation_column_is_one_candidate_bound_in_both_twins(built):
    _, _, _, candidates, _ = built
    deviation = _by_output(candidates, "انحراف")
    assert len(deviation["render"]["variants"]) == 1
    assert deviation["render"]["variants"][0]["shape"] == "MINUS(@,@)"
    assert [b["key"] for b in deviation["payload"]["applies_to"]] == [
        "mini_pitza_ch__s1__h__r6", "mini_pitza_nk__s1__h__r6"]
    assert deviation["payload"]["applies_to"][0]["range"] == "H6:H8"
    assert deviation["render"]["input_headers"] == ["مصرف واقعی", "مصرف اعلامی"]


def test_a_binding_carries_its_rows_with_label_and_item_code(built):
    _, _, _, candidates, _ = built
    binding = _by_output(candidates, "انحراف")["payload"]["applies_to"][0]
    assert binding["rows"] == [
        {"key": "r6", "row": 6, "label": "پنیر پیتزا ##1", "item": "##1"},
        {"key": "r7", "row": 7, "label": "خمیر پیتزا ##26", "item": "##26"},
        {"key": "r8", "row": 8, "label": "سس گوجه ##33", "item": "##33"}]


def test_the_tolerance_keeps_its_let_names_and_a_ref_basis(built):
    _, templates, _, candidates, _ = built
    pitza = next(t for t in templates if t["render"]["sheet"] == "پیتزا")
    tolerance = _by_output(candidates, "انحراف (با تلورانس)")
    assert len(tolerance["render"]["variants"]) == 2
    bindings = {b["key"]: b for b in tolerance["payload"]["applies_to"]}
    per_food = bindings["mini_pitza_ch__s1__j__r6"]["params"]
    assert per_food["tolerancePerFoodGr"] == 5
    assert per_food["ref_1"] == {"ref": pitza["id"], "field": "c_i"}
    per_kg = bindings["mini_pitza_ch__s1__j__r7"]["params"]
    assert per_kg["tolerancePerKilogramGr"] == 140
    assert per_kg["ref_1"] == {"ref": pitza["id"], "field": "c_g"}
    assert bindings["mini_pitza_ch__s1__j__r6"]["variant"] \
        != bindings["mini_pitza_ch__s1__j__r7"]["variant"]


def test_the_offset_twin_binds_the_same_field_key_at_a_different_letter(built):
    _, templates, _, candidates, _ = built
    kanter = next(t for t in templates if t["render"]["sheet"] == "کانتر")
    shortfall = _by_output(candidates, "کسری")
    params = [b["params"]["ref_1"] for b in shortfall["payload"]["applies_to"]]
    assert params == [{"ref": kanter["id"], "field": "c_b"},
                      {"ref": kanter["id"], "field": "c_b"}]


def test_no_binding_ever_carries_a_null_field(built):
    """`facts-delta.schema.json` refuses `record.field: null`, so a lookup that
    misses omits the key. The rule in the FIRST of two like-headed columns is
    the case that used to miss (`مغایرت` at B, its twin at D)."""
    _, _, _, candidates, _ = built
    bindings = [b for c in candidates for b in c["payload"]["applies_to"]]
    assert bindings and all(b["record"].get("field", "") is not None
                            for b in bindings)
    binding = _by_output(candidates, "مغایرت")["payload"]["applies_to"][0]
    assert binding["record"]["field"] == "c_b"


def test_a_date_passthrough_above_the_header_mints_no_candidate(built):
    _, _, _, candidates, issues = built
    assert not any(c["render"]["output"] in ("تاریخ", "روز", "ماه")
                   for c in candidates)
    unheaded = [i for i in issues if i["kind"] == "unheaded_formula"]
    assert {i["target"] for i in unheaded} == {"پیتزا!b", "پیتزا!c"}
    assert all(i["run_only"] for i in unheaded)


def test_a_bare_reference_in_a_computing_column_is_no_rule_applies(built):
    _, _, _, candidates, issues = built
    tolerance = _by_output(candidates, "انحراف (با تلورانس)")
    assert "mini_pitza_ch__s1__j__r8" not in [
        b["key"] for b in tolerance["payload"]["applies_to"]]
    assert "no_rule_applies" in _kinds(issues)


def test_a_num_error_is_excluded_and_a_name_error_is_not(built):
    _, _, _, candidates, issues = built
    tolerance = _by_output(candidates, "انحراف (با تلورانس)")
    assert "mini_pitza_nk__s1__j__r7" not in [
        b["key"] for b in tolerance["payload"]["applies_to"]]
    broken = [i for i in issues if i["kind"] == "broken_formula"]
    assert any("#NUM!" in i["description"] for i in broken)
    shortfall = _by_output(candidates, "کسری")
    assert "mini_kanter_nk__s1__f__r2" in [
        b["key"] for b in shortfall["payload"]["applies_to"]]
    assert "cached_error" in _kinds(issues)


def test_a_formula_that_binds_one_name_twice_is_reported_not_raised(built):
    _, _, _, candidates, issues = built
    assert not any(c["render"]["output"] == "موجودی آخر شب" for c in candidates)
    rebound = [i for i in issues if i["kind"] == "broken_formula"
               and i["target"] == "پیتزا!e"]
    assert len(rebound) == 1
    assert rebound[0]["instance"] == "mini_pitza_ch__s1"
    assert "E6" in rebound[0]["description"]


def test_a_mirror_tab_yields_no_rule(built):
    _, _, _, candidates, _ = built
    assert all("Table_Bom" not in b["key"]
               for c in candidates for b in c["payload"]["applies_to"])


def test_table_reading_variants_group_by_their_called_functions(built):
    estate, _, _, candidates, issues = built
    assert "getTotalFoodsIngredient" in table_reading_functions(estate)
    actual = _by_output(candidates, "مصرف واقعی")
    assert len(actual["render"]["variants"]) == 1
    assert actual["render"]["variants"][0]["functions"] == [
        "CONVERT_GR_TO_KG", "getTotalFoodsIngredient"]
    assert len(actual["payload"]["applies_to"]) == 4
    assert "hand_maintained_index" in _kinds(issues)


def test_a_function_that_reads_its_table_through_a_helper_folds_too(built):
    """The estate's real shape: `getTotalFoodsIngredient` reads no range itself,
    it calls `getIngredientValue`, which does. Read only its own body and the
    «مصرف واقعی» column keeps one variant per inlined food-id set."""
    estate, _, _, candidates, _ = built
    readers = table_reading_functions(estate)
    assert "getIngredientValue" in readers        # reads the range itself
    assert "getTotalFoodsIngredient" in readers   # only through its callee
    assert "getWeekDayCoefficient" not in readers
    shapes = {normalise(f["formula"], table_refs={}).text
              for f in estate["SPCH"]["formulas"] if f["range"].startswith("G")}
    assert len(shapes) == 2                       # one row inlines a scalar
    actual = _by_output(candidates, "مصرف واقعی")
    assert len(actual["render"]["variants"]) == 1
    assert {b["variant"] for b in actual["payload"]["applies_to"]} == {"v1"}


def test_original_is_one_body_headed_by_each_variant_key(built):
    _, _, _, candidates, _ = built
    original = _by_output(candidates, "انحراف (با تلورانس)")["payload"]["original"]
    assert original.startswith("# mini_pitza_ch__s1__j__r6\n")
    assert "tolerancePerFoodGr" in original and "tolerancePerKilogramGr" in original
    assert "\\n" not in original          # the dump's escapes are unescaped here


def test_an_uncalled_script_function_with_a_conditional_is_a_candidate(built):
    estate, _, _, _, _ = built
    rules = {r["render"]["output"]: r
             for r in script_rules(estate, "cooking", called_names(estate))}
    assert set(rules) == {"getWeekDayCoefficient"}
    assert rules["getWeekDayCoefficient"]["id"].startswith("S-gs-")
    assert "day == 5" in rules["getWeekDayCoefficient"]["payload"]["original"]


def test_ids_are_stable_across_two_builds(tmp_path):
    make_estate(tmp_path)

    def run():
        estate = load_estate(tmp_path)
        templates, instances, _ = record_templates(estate, "cooking")
        return [c["id"] for c in rule_columns(
            estate, "cooking", templates, instances,
            table_reading_functions(estate))[0]]

    assert run() == run()
    assert all(i.startswith("S-r-") and len(i) == 16 for i in run())
