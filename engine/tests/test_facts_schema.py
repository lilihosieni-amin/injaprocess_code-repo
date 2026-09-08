"""`facts.schema.json` and `facts-delta.schema.json` — the two halves of one
contract (§3.2, I6). A change that reaches only one of them is the drift these
tests exist to catch."""
import re

from engine_common import read_json, schema_dir

NAMESPACE = {"type": "string", "pattern": r"^[^\sA-Za-z0-9]{1,3}$"}


def _both():
    return [read_json(schema_dir() / name)["$defs"]
            for name in ("facts.schema.json", "facts-delta.schema.json")]


def test_an_estate_declares_its_own_item_code_namespaces():
    """I6 — `##` and `#` are cooking's manifest, not the engine's. An estate
    that declares `@@` or `؛` writes a `refItems` field with it, and an enum of
    two literals refused it before a run could even reach the store."""
    for defs in _both():
        assert defs["field"]["properties"]["refItems"]["properties"][
            "namespace"] == NAMESPACE
    pattern = re.compile(NAMESPACE["pattern"])
    for good in ("#", "##", "@@", "؛", "**"):
        assert pattern.fullmatch(good), good
    for bad in ("", "a", "1", "# ", "####"):
        assert not pattern.fullmatch(bad), bad


def test_a_set_aside_candidate_s_issue_kind_is_in_both_halves():
    """§3.2 — `oversized` is written by `build` into `skeleton.json` and read by
    the report; the store and the delta both have to admit it."""
    for defs in _both():
        assert "oversized" in defs["issue"]["properties"]["kind"]["enum"]


def test_the_issue_definition_is_one_definition_in_two_files():
    store, delta = _both()
    assert store["issue"] == delta["issue"]
