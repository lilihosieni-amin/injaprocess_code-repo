"""`facts.schema.json` and `facts-delta.schema.json` — the two halves of one
contract (§3.2, I6). A change that reaches only one of them is the drift these
tests exist to catch."""
import copy

from engine_common import read_json, schema_dir, validate
from merge_facts import KIND_FILES, KINDS, save_store


def _both():
    return [read_json(schema_dir() / name)["$defs"]
            for name in ("facts.schema.json", "facts-delta.schema.json")]


def test_a_set_aside_candidate_s_issue_kind_is_in_both_halves():
    """§3.2 — `oversized` is written by `build` into `skeleton.json` and read by
    the report; the store and the delta both have to admit it."""
    for defs in _both():
        assert "oversized" in defs["issue"]["properties"]["kind"]["anyOf"][0]["enum"]


def test_the_issue_definition_is_one_definition_in_two_files():
    store, delta = _both()
    assert store["issue"] == delta["issue"]


# --------------------------------------------------------------------------- #
# tables as the spine (2026-09-16): four kinds, no items, `home`
#
# `facts_helpers.py` is frozen for the parallel phase, and this module had no
# fixtures of its own beyond `_both()`, so the three below are local.
# --------------------------------------------------------------------------- #

_DATA = {"record": {"medium": "native", "role": "config", "location": {}},
         "measurement": {"quantity": "mass", "unit": "g"},
         "rule": {"inputs": [], "outputs": []},
         "note": {"about": [{"ref": "F-00025"}], "question": "؟"}}


def entry(kind="rule", id="F-00030", **kw):
    """One store-shaped entry of `kind`, minimal and valid."""
    out = {"id": id, "kind": kind, "key": "yek", "title": "عنوان",
           "statement": "جمله", "scope": {"departments": [], "branches": []},
           "source": [], "status": "confirmed", "retired": False,
           "updated_at": "2026-09-16T00:00:00Z",
           "data": copy.deepcopy(_DATA.get(kind, {}))}
    out.update(kw)
    return out


def delta_entry(id="T-1", **kw):
    """The same entry as a delta states it — `status` and `updated_at` are the
    store's own, derived leaves and no delta carries them."""
    e = entry(id=id, **kw)
    del e["status"], e["updated_at"]
    return e


def validates(schema, e):
    try:
        validate(f"{schema}.schema.json", {"schema_version": 2, "entries": [e]})
        return True
    except ValueError:
        return False


def seeded_store(tmp_path, entries):
    """A `facts/` directory holding `entries`, written by the store's own
    writer so `.index.json` is the one `save_store` builds."""
    (tmp_path / "facts").mkdir()
    save_store(tmp_path, {kind: {"schema_version": 2,
                                 "entries": [e for e in entries if e["kind"] == kind]}
                          for kind in KIND_FILES})
    return tmp_path / "facts"


def test_the_store_has_four_kinds_and_no_item():
    assert not validates("facts", entry(kind="item",
                                        data={"category": "ingredient", "unit": "kg"}))
    assert set(KINDS) == {"record", "measurement", "rule", "note"}


def test_a_refitems_column_is_gone_and_text_takes_its_place():
    rec = entry(kind="record", id="F-00025", data={
        "medium": "sheet", "role": "reference", "location": {},
        "fields": [{"key": "qalam", "title": "قلم", "type": "refItems",
                    "refItems": {"namespace": "##"}}]})
    assert not validates("facts", rec)
    rec["data"]["fields"][0] = {"key": "qalam", "title": "قلم", "type": "string"}
    assert validates("facts", rec)


def test_home_is_a_record_ref_on_rules_measurements_and_notes_and_never_on_a_record():
    for kind in ("rule", "measurement", "note"):
        assert validates("facts", entry(kind=kind, home={"ref": "F-00025"}))
        assert validates("facts", entry(kind=kind, home={"ref": "F-00025",
                                                         "field": "vazn"}))
        assert validates("facts", entry(kind=kind, home=None))
        assert not validates("facts", entry(kind=kind, home={"ref": "F-00025",
                                                             "row": "r1"}))
        assert not validates("facts", entry(kind=kind, home={"ref": "cooking-001"}))
        # I2's marker travels with `home`: a person may detach any of the three
        assert validates("facts", entry(kind=kind, home_detached=True))
    assert not validates("facts", entry(kind="record", id="F-00025",
                                        home={"ref": "F-00026"}))
    # …and a table has no placement to detach either (the record branch forbids
    # both members, not just the one)
    assert not validates("facts", entry(kind="record", id="F-00025",
                                        home_detached=True))


def test_the_delta_carries_the_same_home_and_the_same_four_kinds():
    """§3.2: the two halves of one contract. A delta places a new entry under a
    table this same delta creates, so `home` takes a temp id too."""
    assert not validates("facts-delta", delta_entry(
        kind="item", data={"category": "ingredient", "unit": "kg"}))
    assert validates("facts-delta", delta_entry(kind="rule", home={"ref": "T-3"}))
    assert not validates("facts-delta", delta_entry(kind="record",
                                                    home={"ref": "T-3"}))


def test_the_index_row_carries_the_home_record_id(tmp_path):
    store = seeded_store(tmp_path, [
        entry(kind="record", id="F-00025", key="jadval"),
        entry(kind="rule", id="F-00030", home={"ref": "F-00025", "field": "vazn"})])
    rows = read_json(store / ".index.json")["entries"]
    assert next(r for r in rows if r["id"] == "F-00030")["home"] == "F-00025"
    assert next(r for r in rows if r["id"] == "F-00025")["home"] is None


def test_a_placement_note_is_an_issue_kind_in_both_halves():
    for defs in _both():
        assert "placement" in defs["issue"]["properties"]["kind"]["anyOf"][0]["enum"]


def test_what_a_measurement_is_of_is_a_record_or_text(tmp_path):
    """§3.2 — with the item kind gone, a measurement of an ingredient has no
    entry to point at: `of` names a record (and a field or row of it) or says
    in words what is measured. The same for a rule output's `of`."""
    def measured(of):
        return entry(kind="measurement",
                     data={"quantity": "mass", "unit": "g", "of": of})

    for schema, ref in (("facts", "F-00025"), ("facts-delta", "T-3")):
        build = measured if schema == "facts" else (
            lambda of: {k: v for k, v in measured(of).items()
                        if k not in ("status", "updated_at")} | {"id": "T-1"})
        for of in ("کاهو", None, {"ref": ref}, {"ref": ref, "field": "vazn"},
                   {"ref": ref, "row": "kahu"}):
            assert validates(schema, build(of)), (schema, of)
        assert not validates(schema, build({"ref": "cooking-001"}))
        assert not validates(schema, build(7))
    assert validates("facts", entry(kind="rule", data={
        "inputs": [], "outputs": [{"key": "v", "title": "مقدار", "of": "کاهو"}]}))
