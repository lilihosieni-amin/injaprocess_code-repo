from merge_facts import tiers
from merge_facts.normalise import normalise_entry


def test_a_legacy_message_string_becomes_a_refusal_with_its_label():
    [f] = tiers.coerce(["decisions[4] S-rec-9f60: field x carries a unit"])
    assert (f.tier, f.label, f.message) == (tiers.REFUSE, "decisions[4] S-rec-9f60",
                                            "field x carries a unit")
    assert tiers.item_of(f) == ("decisions", 4)


def test_findings_pass_through_and_split_by_tier():
    r = tiers.refuse("new[2] tol", "no key")
    n = tiers.note("T-3", "odd unit", path="data/unit", mark="inferred")
    found = tiers.coerce([r, n, "plain message with no label"])
    assert tiers.refusals(found)[0] is r and tiers.notes(found) == [n]
    assert tiers.item_of(r) == ("new", 2) and tiers.item_of(n) is None
    assert tiers.lines([r]) == ["new[2] tol: no key"]


def test_apply_notes_marks_inferred_and_appends_one_shape_issue_idempotently():
    entry = {"data": {"unit": "lb"}}
    found = [tiers.note("T-1", "unit lb undeclared", path="data/unit", mark="inferred"),
             tiers.note("T-1", "odd shape", fa="شکل غیرمعمول"),
             tiers.refuse("T-1", "ignored here")]
    tiers.apply_notes(entry, found)
    tiers.apply_notes(entry, found)
    assert entry["field_status"] == {"data/unit": "inferred"}
    assert entry["issues"] == [{"kind": "shape", "description": "شکل غیرمعمول", "affects": []}]


def test_a_note_without_persian_uses_the_default_description():
    entry = {}
    tiers.apply_notes(entry, [tiers.note("", "x")])
    assert entry["issues"][0]["description"] == tiers.SHAPE_ISSUE_FA


def test_normalise_entry_runs_the_registered_repairs_in_order(monkeypatch):
    from merge_facts import content, preconditions
    calls = []
    monkeypatch.setattr(preconditions, "STORE_REPAIRS", [lambda e, c: calls.append("store")])
    monkeypatch.setattr(content, "CONTENT_REPAIRS",
                        [lambda e, c: calls.append("content") or [tiers.note("", "n")]])
    out = normalise_entry({}, {"label": ""})
    assert calls == ["store", "content"] and [f.message for f in out] == ["n"]


def test_a_shape_note_is_a_legal_issue_in_both_store_schemas():
    """`apply_notes` writes `issues[]` entries of kind `shape`; both store
    contracts must accept them or every NOTE turns into a refusal at write."""
    import json
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[2] / "schemas"
    for name in ("facts.schema.json", "facts-delta.schema.json"):
        text = (root / name).read_text(encoding="utf-8")
        enum_line = next(line for line in text.splitlines() if '"oversized"' in line)
        assert '"shape"' in enum_line, name


def test_a_note_marked_none_is_reported_but_leaves_the_entry_untouched():
    """Spec rows that say "store as written, no mark" (the style lint, B5, B15,
    B19, B21, B24, B29, B30) still report a NOTE so validators and the audit can
    list it, but must not grow a generic shape issue on every entry."""
    entry = {"data": {}}
    tiers.apply_notes(entry, [tiers.note("T-1", "cell reference in prose", mark="none")])
    assert entry == {"data": {}}
    assert tiers.notes([tiers.note("T-1", "x", mark="none")])
