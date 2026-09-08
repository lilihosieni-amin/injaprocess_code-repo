"""I6 — the estate's conventions are data (spec §3.1).

Two branch names, the `##`/`#` namespaces, the placeholder header, the month
names and the table prefix were code literals until 2026-09-08: a second estate
with other conventions got fewer candidates and no error. They live in the
manifest now, and the last test here is the one that keeps them there.
"""
import json
import pathlib
import re
import tokenize

import pytest
from dump_workbook import init_manifest
from engine_common import validate
from merge_facts.conventions import (
    DEFAULT,
    DEFAULTS,
    branch_tokens_for,
    effective,
    from_manifest,
    load,
)


def _write(root, manifest):
    sheets = pathlib.Path(root) / "attachments" / "sheets"
    sheets.mkdir(parents=True, exist_ok=True)
    (sheets / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return sheets


# --------------------------------------------------------------------------
# load


def test_no_manifest_is_todays_conventions(tmp_path):
    conventions = load(tmp_path)
    assert conventions.branch_tokens == tuple(DEFAULTS["branch_tokens"])
    assert conventions.branch_codes == ("chalebagh", "naharkhoran")
    assert conventions.code_namespaces == {"##": "ing", "#": "food"}
    assert conventions.month_names == tuple(DEFAULTS["month_names"])
    assert conventions.table_prefix == "Table_"
    assert conventions.placeholder.match("Column 3")
    assert not conventions.placeholder.match("مقدار")
    assert conventions.code_in_text.findall("پنیر ##1 و پیتزا #61") == ["##1", "#61"]
    assert conventions.code_key("##1") == "ing_1"
    assert conventions.code_key("#71") == "food_71"
    assert conventions.strip_branch("کانتر ناهارخوران") == "کانتر"
    assert conventions.strip_branch("کانتر چاله‌باغ") == "کانتر"


def test_a_declared_branch_needs_no_token_list(tmp_path):
    """§3.1 — the tokens default to the branches the manifest already names, so
    a new estate declares its branches once and nothing else."""
    _write(tmp_path, {"schema_version": 1, "workbooks": [],
                      "branches": [{"code": "karaj", "name": "کرج"}]})
    conventions = load(tmp_path)
    assert "karaj" in conventions.branch_tokens
    assert "کرج" in conventions.branch_tokens
    assert conventions.branch_codes == ("karaj",)
    assert conventions.strip_branch("انبار کرج") == "انبار"
    # …and today's spellings stay, so an estate holding both still folds both.
    assert "naharkhoran" in conventions.branch_tokens


def test_branch_tokens_fold_the_zwnj_and_the_space():
    tokens = branch_tokens_for({"branches": [{"code": "ChaleBagh",
                                              "name": "چاله‌باغ"}]})
    assert "chalebagh" in tokens
    assert "چاله باغ" in tokens and "چالهباغ" in tokens


def test_a_declared_namespace_replaces_the_hash_codes(tmp_path):
    _write(tmp_path, {"schema_version": 1, "branches": [], "workbooks": [],
                      "conventions": {"code_namespaces": {"@": "sku"}}})
    conventions = load(tmp_path)
    assert conventions.code_in_text.findall("پنیر @12") == ["@12"]
    assert conventions.code_key("@12") == "sku_12"
    assert conventions.code_slug("@12") == "sku12"
    assert conventions.code_in_cell["@"].search("پنیر @12")
    assert conventions.item_namespace == "@"
    # every other member is still the default: a manifest declares what it
    # differs in, never the whole object.
    assert conventions.table_prefix == "Table_"
    assert conventions.month_names == tuple(DEFAULTS["month_names"])


def test_a_lone_hash_never_matches_inside_a_double_one():
    """`content._CODE_IN_CELL`'s guard, generalised: a cell holding «##1» does
    not answer for the `#` food list."""
    assert not DEFAULT.code_in_cell["#"].search("پنیر پیتزا ##1")
    assert DEFAULT.code_in_cell["#"].search("اینجا پیتزا #61")
    assert DEFAULT.code_in_cell["##"].search("پنیر پیتزا ##1")


def test_declared_members_win_over_the_defaults(tmp_path):
    _write(tmp_path, {"schema_version": 1, "branches": [], "workbooks": [],
                      "conventions": {"branch_tokens": ["shomal"],
                                      "table_prefix": "T_",
                                      "placeholder_header": "^ستون [0-9]+$",
                                      "month_names": ["ژانویه"]}})
    conventions = load(tmp_path)
    assert conventions.branch_tokens == ("shomal",)
    assert conventions.table_prefix == "T_"
    assert conventions.month_names == ("ژانویه",)
    assert conventions.placeholder.match("ستون 2")
    assert not conventions.placeholder.match("Column 2")


def test_a_manifest_that_cannot_be_read_is_not_a_stop(tmp_path):
    sheets = tmp_path / "attachments" / "sheets"
    sheets.mkdir(parents=True)
    (sheets / "manifest.json").write_text("{ not json", encoding="utf-8")
    assert load(tmp_path).table_prefix == "Table_"


# --------------------------------------------------------------------------
# what --init-manifest writes


def test_init_manifest_writes_the_effective_conventions(tmp_path):
    sheets = tmp_path / "attachments" / "sheets"
    sheets.mkdir(parents=True)
    manifest = init_manifest(sheets)
    validate("manifest.schema.json", manifest)
    assert manifest["conventions"] == effective(manifest)
    assert manifest["conventions"]["code_namespaces"] == {"##": "ing", "#": "food"}
    assert manifest["conventions"]["table_prefix"] == "Table_"
    assert json.loads((sheets / "manifest.json").read_text(
        encoding="utf-8"))["conventions"] == manifest["conventions"]


def test_init_manifest_never_rewrites_the_conventions_it_finds(tmp_path):
    sheets = _write(tmp_path, {"schema_version": 1, "workbooks": [],
                               "branches": [{"code": "karaj", "name": "کرج"}],
                               "conventions": {"table_prefix": "T_"}})
    manifest = init_manifest(sheets)
    assert manifest["conventions"] == {"table_prefix": "T_"}
    assert init_manifest(sheets)["conventions"] == {"table_prefix": "T_"}


def test_init_manifest_adds_the_conventions_to_a_confirmed_manifest(tmp_path):
    sheets = _write(tmp_path, {"schema_version": 1, "workbooks": [],
                               "branches": [{"code": "karaj", "name": "کرج"}]})
    manifest = init_manifest(sheets)
    validate("manifest.schema.json", manifest)
    assert "karaj" in manifest["conventions"]["branch_tokens"]
    assert "کرج" in manifest["conventions"]["branch_tokens"]
    # idempotent: the second pass finds them and writes them back unchanged.
    assert init_manifest(sheets)["conventions"] == manifest["conventions"]


def test_from_manifest_takes_the_object_as_it_stands():
    assert from_manifest({}).table_prefix == DEFAULT.table_prefix
    assert from_manifest(None).branch_codes == DEFAULT.branch_codes


# --------------------------------------------------------------------------
# I6 itself


#: What no module that reads the estate may carry as a literal any more.
_ESTATE_LITERALS = re.compile(
    "چاله باغ|ناهارخوران|chalebagh|naharkhoran|فروردین|Column [0-9]|Table_")

_ENGINE = pathlib.Path(__file__).resolve().parents[1]
_READERS = ("facts_plan/build.py", "dump_workbook/__init__.py",
            "merge_facts/content.py")


def _code_only(path):
    """The module with its comments and its triple-quoted strings taken out —
    prose may still name the estate's own spellings; code may not."""
    out = []
    with open(path, "rb") as handle:
        for token in tokenize.tokenize(handle.readline):
            if token.type == tokenize.COMMENT:
                continue
            if token.type == tokenize.STRING and \
                    re.match(r'^[A-Za-z]*("""|\'\'\')', token.string):
                continue
            out.append(token.string)
    return "\n".join(out)


@pytest.mark.parametrize("module", _READERS)
def test_no_estate_literal_survives_in_the_readers(module):
    """I6 — the whole point. A branch name, a month, a placeholder header or a
    table prefix written into one of these modules is this estate's data in the
    engine's code, and the next estate silently gets fewer candidates."""
    found = _ESTATE_LITERALS.findall(_code_only(_ENGINE / module))
    assert found == [], f"{module} still carries {sorted(set(found))}"
