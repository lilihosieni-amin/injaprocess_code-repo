"""The §2.3 normaliser on the shapes the estate actually holds.

Every formula below is copied out of
`attachments/sheets/.dump/1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s/
formulas.tsv` (the `گزارش مرکزی` report book), with its `\\n` escapes intact —
that is the text `build` reads, so that is the text the normaliser is tested on.
"""
import pytest

from facts_plan.build import Shape, estimate_tokens, is_bare_reference, normalise
from facts_plan.cli import main

TOLERANCE_PER_FOOD = (
    r"LET(\ntolerancePerFoodGr, 5,\ntelorancKg, CONVERT_GR_TO_KG(KN * "
    r"tolerancePerFoodGr),\nMINUS(JN , telorancKg)\n)")
TOLERANCE_PER_KG = (
    r"LET(\ntolerancePerKilogramGr, 140,\nteloranc, MULTIPLY("
    r"tolerancePerKilogramGr,IN),\ntelorancKg, CONVERT_GR_TO_KG(teloranc),"
    r"\nMINUS(JN , telorancKg)\n)")
ACTUAL_USE = (
    r'LET(\ningredientId, 1,\namFoodIds, {71, 309, 74},\namTotal, '
    r'getTotalFoodsIngredient(amFoodIds,ingredientId,americanPizzaSalesData,'
    r'"Table_Ingredients_AmericanPizza",Refresher),\nCONVERT_GR_TO_KG(amTotal)\n)')


def test_shape_is_the_named_tuple():
    shape = normalise("MINUS(IN,HN)", table_refs={})
    assert isinstance(shape, Shape)
    assert shape.text == "MINUS(@,@)"


def test_escaped_newlines_equal_the_one_line_form():
    one_line = ("LET(tolerancePerFoodGr, 5, telorancKg, "
                "CONVERT_GR_TO_KG(KN * tolerancePerFoodGr), "
                "MINUS(JN , telorancKg))")
    assert (normalise(TOLERANCE_PER_FOOD, table_refs={}).text
            == normalise(one_line, table_refs={}).text)


def test_spacing_around_an_operator_is_not_a_shape():
    assert (normalise("A1-B1", table_refs={}).text
            == normalise("A1 - B1", table_refs={}).text == "@-@")


def test_let_locals_are_renamed_and_lend_their_names_to_literals():
    shape = normalise(TOLERANCE_PER_FOOD, table_refs={})
    assert shape.text == "LET(v1,#,v2,CONVERT_GR_TO_KG(@*v1),MINUS(@,v2))"
    assert shape.params["tolerancePerFoodGr"] == 5
    assert shape.params["ref_1"] == {"cell": "KN"}
    assert shape.params["ref_2"] == {"cell": "JN"}
    assert shape.refs == [{"cell": "KN"}, {"cell": "JN"}]


def test_the_two_tolerance_forms_are_two_shapes_with_their_own_keys():
    per_kg = normalise(TOLERANCE_PER_KG, table_refs={})
    assert per_kg.text == "LET(v1,#,v2,MULTIPLY(v1,@),v3,CONVERT_GR_TO_KG(v2),MINUS(@,v3))"
    assert per_kg.params["tolerancePerKilogramGr"] == 140
    assert per_kg.params["ref_1"] == {"cell": "IN"}
    assert per_kg.text != normalise(TOLERANCE_PER_FOOD, table_refs={}).text


def test_brace_array_collapses_and_keeps_its_members():
    shape = normalise(ACTUAL_USE, table_refs={})
    assert shape.text == ("LET(v1,#,v2,{#},v3,getTotalFoodsIngredient("
                          "v2,v1,americanPizzaSalesData,$T,Refresher),"
                          "CONVERT_GR_TO_KG(v3))")
    assert shape.params["amFoodIds"] == [71, 309, 74]
    assert shape.params["ingredientId"] == 1


def test_a_quoted_table_name_is_a_table_parameter():
    shape = normalise(ACTUAL_USE, table_refs={
        "Table_Ingredients_AmericanPizza": {"ref": "S-rec-0123456789ab"}})
    assert shape.params["table_1"] == {"ref": "S-rec-0123456789ab"}


def test_a_bare_table_name_is_a_table_parameter():
    shape = normalise("GET_ROW_BY_PERSIAN_DATE(BN,CN,DN,Table_Pizza_First)",
                      table_refs={})
    assert shape.text == "GET_ROW_BY_PERSIAN_DATE(@,@,@,$T)"
    assert shape.params["table_1"] == {"table": "Table_Pizza_First"}
    assert shape.functions == frozenset({"GET_ROW_BY_PERSIAN_DATE"})


@pytest.mark.parametrize("formula, text", [
    ("ROUND(DIVIDE(LN,KN),3)", "ROUND(DIVIDE(@,@),#)"),
    ("MIN(AN,BN)", "MIN(@,@)"),
    ("CONVERT_GR_TO_KG(KN)", "CONVERT_GR_TO_KG(@)"),
])
def test_guarded_function_names_survive(formula, text):
    assert normalise(formula, table_refs={}).text == text


def test_the_n_row_form_of_a_shared_group():
    shape = normalise("MINUS(SUM(FN,EN),GN)", table_refs={})
    assert shape.text == "MINUS(SUM(@,@),@)"
    assert list(shape.params) == ["ref_1", "ref_2", "ref_3"]


def test_an_unnamed_literal_takes_a_positional_key():
    assert normalise("ROUND(DIVIDE(LN,KN),3)", table_refs={}).params["p1"] == 3


def test_bare_references():
    assert is_bare_reference(normalise(r"'تاریخ'!CN", table_refs={}).text)
    assert is_bare_reference("@") and is_bare_reference("'تاریخ'!@")
    assert not is_bare_reference("MINUS(@,@)")


def test_a_sheet_qualified_reference_keeps_its_sheet_in_the_locator():
    shape = normalise(r"'تاریخ'!CN", table_refs={})
    assert shape.params["ref_1"] == {"cell": "CN", "sheet": "تاریخ"}


def test_estimate_tokens_counts_persian_dearer():
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("سلام") == 3


def test_cli_reports_an_unlanded_verb_instead_of_a_traceback(capsys):
    assert main(["status", "--run", "runs/facts/cooking/x"]) == 2
    assert "not implemented" in capsys.readouterr().err
