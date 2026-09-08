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
from dump_workbook import _codes, _reference_tab_proposal, init_manifest
from dump_workbook.cli import main
from engine_common import validate
from fixtures.make_workbook import make_workbook
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


def test_a_placeholder_that_is_no_regex_falls_back_to_the_default(tmp_path):
    """A typo in one member is not a traceback out of every verb that loads
    the estate: the member no engine could compile is the default's."""
    _write(tmp_path, {"schema_version": 1, "branches": [], "workbooks": [],
                      "conventions": {"placeholder_header": "^Column ["}})
    conventions = load(tmp_path)
    assert conventions.placeholder.match("Column 3")


def test_an_estate_that_names_no_tables_matches_no_word(tmp_path):
    """`table_prefix: ""` is «this estate names no tables», not «every word is
    a table name»: an empty alternative in any of the three patterns matched
    everything, and every prose leaf was refused for naming a table."""
    from facts_plan.build import _table_re, _table_reader_re
    from merge_facts.content import artefact_re, lint_prose

    _write(tmp_path, {"schema_version": 1, "branches": [], "workbooks": [],
                      "conventions": {"table_prefix": ""}})
    conventions = load(tmp_path)
    assert conventions.table_prefix == ""
    assert not artefact_re("").search("جدولی که سرلاین پیتزا هر شب پر می‌کند")
    assert artefact_re("").search("pitza.xlsx")
    assert not _table_re("").search("MINUS(J6,H6)")
    assert not _table_reader_re("").search("return x + 1")
    assert _table_reader_re("").search("IMPORTRANGE(x)")
    assert lint_prose("جدولی که سرلاین پیتزا هر شب پر می‌کند.",
                      exemptions=(), conventions=conventions) == []


def test_declared_branch_tokens_are_compared_lower_cased(tmp_path):
    """`strip_branch` folds the name it is given; a token the manifest spells
    in mixed case has to be folded the same way or it never matches."""
    _write(tmp_path, {"schema_version": 1, "branches": [], "workbooks": [],
                      "conventions": {"branch_tokens": ["ChaleBagh"]}})
    assert load(tmp_path).strip_branch("Amar ChaleBagh") == "amar"


def test_a_namespace_the_store_schemas_would_refuse_is_a_manifest_error():
    """`refItems.namespace` is `^[^\\sA-Za-z0-9]{1,3}$` in both store
    schemas, so a manifest that declares `ab` would plan candidates every gate
    then refuses. The manifest is where that is caught."""
    good = {"schema_version": 1, "branches": [], "workbooks": [],
            "conventions": {"code_namespaces": {"@": "sku"}}}
    validate("manifest.schema.json", good)
    for bad in ("ab", "", "@@@@"):
        with pytest.raises(ValueError, match="code_namespaces"):
            validate("manifest.schema.json",
                     dict(good, conventions={"code_namespaces": {bad: "sku"}}))


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
    assert load(tmp_path).strip_branch("انبار کرج") == "انبار"
    # idempotent: the second pass finds them and writes them back unchanged.
    assert init_manifest(sheets)["conventions"] == manifest["conventions"]


def test_the_written_conventions_never_freeze_the_branch_tokens(tmp_path):
    """Stage 1 runs `--init-manifest` before Gate M declares the branches, so a
    written token list would be the two defaults for ever and every branch the
    owner declares afterwards would fold nowhere. `effective` writes no
    `branch_tokens`, `from_manifest` derives them whenever the member is
    absent, and declaring the member is the only way to override that."""
    sheets = tmp_path / "attachments" / "sheets"
    sheets.mkdir(parents=True)
    assert "branch_tokens" not in init_manifest(sheets)["conventions"]

    manifest = json.loads((sheets / "manifest.json").read_text(encoding="utf-8"))
    manifest["branches"] = [{"code": "karaj", "name": "کرج"},
                            {"code": "shiraz", "name": "شیراز"}]
    (sheets / "manifest.json").write_text(json.dumps(manifest,
                                                     ensure_ascii=False),
                                          encoding="utf-8")
    tokens = load(tmp_path).branch_tokens
    assert {"karaj", "کرج", "shiraz", "شیراز"} <= set(tokens)
    assert load(tmp_path).strip_branch("شمارش کرج") == "شمارش"


def test_writing_the_effective_conventions_back_changes_nothing(tmp_path):
    """The property `--init-manifest` has to hold on ANY manifest: what it
    writes is what the reader already answered."""
    for manifest in ({}, {"branches": [{"code": "karaj", "name": "کرج"}]},
                     {"branches": [], "conventions": {"table_prefix": "T_"}}):
        with_written = dict(manifest,
                            conventions=dict(manifest.get("conventions") or {},
                                             **effective(manifest)))
        assert from_manifest(with_written) == from_manifest(manifest)


def test_from_manifest_takes_the_object_as_it_stands():
    assert from_manifest({}).table_prefix == DEFAULT.table_prefix
    assert from_manifest(None).branch_codes == DEFAULT.branch_codes


# --------------------------------------------------------------------------
# the dump's own codes[] (fix round 1)


def test_the_dumps_codes_are_read_in_the_estates_namespace(tmp_path):
    """`codes[]` is what `_reference_tab_proposal` reads a definition table by,
    so a `##`-only scan left an estate with another namespace no codes and no
    reference tab proposed — the failure I6 exists to close."""
    _write(tmp_path, {"schema_version": 1, "branches": [], "workbooks": [],
                      "conventions": {"code_namespaces": {"@": "sku"}}})
    conventions = load(tmp_path)
    head = [["شکر @12", "مقدار"], ["", ""]]
    assert _codes(head, conventions) == ["@12"]
    assert _codes(head) == []                    # …and not in today's estate
    dump = {"formulas": [],
            "sheets": {"sheets": [{"name": "قند", "head": head, "header_row": 1,
                                   "codes": _codes(head, conventions)}]}}
    assert _reference_tab_proposal(dump) == ["قند"]


def test_todays_codes_keep_their_non_digit_tail():
    """The dumper's scan is looser than `code_in_text` on purpose: a tab heads
    itself «گزارش روزانه ##RPT-1», and `test_dump_workbook` pins that. A cached
    `#NAME?` is still not a code."""
    assert _codes([["گزارش روزانه ##RPT-1", "#NAME?"]]) == ["##RPT-1"]
    assert _codes([["پنیر ##1 و پیتزا #61"]]) == ["##1", "#61"]


def test_the_dump_reads_the_manifest_end_to_end(tmp_path, monkeypatch, capsys):
    """The whole wiring in one run: the same workbook dumps its `##RPT-1` under
    today's manifest and nothing at all under one that declares `@` — so the
    codes really do come off the manifest and not off this module."""
    root = tmp_path / "data"
    sheets = root / "attachments" / "sheets"
    make_workbook(sheets / "Amar__Pitza" / "Pitza.xlsx", spreadsheet_id="SID1")
    monkeypatch.setenv("DATA_ROOT", str(root))

    assert main(["--init-manifest"]) == 0
    dumped = json.loads((sheets / ".dump" / "SID1" / "sheets.json").read_text(
        encoding="utf-8"))
    assert {s["name"]: s["codes"] for s in dumped["sheets"]}["آمار"] == ["##RPT-1"]

    manifest = json.loads((sheets / "manifest.json").read_text(encoding="utf-8"))
    manifest["conventions"]["code_namespaces"] = {"@": "sku"}
    (sheets / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False),
                                          encoding="utf-8")
    assert main(["--init-manifest"]) == 0
    dumped = json.loads((sheets / ".dump" / "SID1" / "sheets.json").read_text(
        encoding="utf-8"))
    assert {s["name"]: s["codes"] for s in dumped["sheets"]}["آمار"] == []
    # …and the answer the manifest carries is still the one it carries.
    assert json.loads((sheets / "manifest.json").read_text(
        encoding="utf-8"))["conventions"]["code_namespaces"] == {"@": "sku"}


# --------------------------------------------------------------------------
# I6 itself


#: What no module that reads the estate may carry as a literal any more. The
#: last alternative is the code-namespace regex itself: `dump_workbook._CODE`
#: was `#{1,2}[^\\s#]+` and shipped past the first round of this test, which
#: only looked for words.
_ESTATE_LITERALS = re.compile(
    "چاله باغ|ناهارخوران|chalebagh|naharkhoran|فروردین|Column [0-9]|Table_"
    r"|#\{1,2\}")

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


def _namespace_literals(path):
    """The estate's code namespaces written as string literals.

    `##` counts wherever it stands. A bare `#` does not: it also separates a
    line range (`…c.txt#L1-L20`), heads a cached spreadsheet error (`#NAME?`)
    and marks a normalised number slot — so it counts only where the code
    writes it as a value, which is what `EXAMPLES` did until 2026-09-08.
    """
    tokens = _code_only(path).split("\n")
    return [token for n, token in enumerate(tokens)
            if token.strip("\"'") == "##"
            or (token.strip("\"'") == "#" and n and tokens[n - 1] == ":")]


@pytest.mark.parametrize("module", _READERS)
def test_no_code_namespace_is_written_out_in_the_readers(module):
    """The regex source was the first round of this; the second is the plain
    string. `build.EXAMPLES` shipped a `new[]` paper form whose column was
    `"namespace": "##"`, so the card handed a `@` estate this estate's
    namespace in the one place a unit copies from."""
    found = _namespace_literals(_ENGINE / module)
    assert found == [], f"{module} still carries {sorted(set(found))}"
