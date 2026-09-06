from facts_helpers import _root, _seed_units, _const_delta, _write, _run_dir
from merge_facts import load_store
from merge_facts.apply import apply
from merge_facts.content import check_document
from merge_facts.revert import revert
from merge_facts.apply import _source_path_problems
from merge_facts.verbs import (export, promote, repair_foreign_keys,
                               repair_source_refs, resolve, retire)
import pytest

# json: only the two locking tests below need it, to read `.index.json` back
# and to snapshot the five facts files for a byte-identical check.
import json

def _disputed(root):
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "2"))
    e = [x for x in load_store(root)["rule"]["entries"] if x["key"] == "tol"][0]
    return e

def test_resolve_marks_chosen_rejects_rest_confirms_field(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)
    chosen = [a for a in e["accounts"] if a["value"] == 4][0]
    resolve(root, e["id"], "data/outputs/v/value", chosen["id"], _run_dir(root, "3"))
    e = [x for x in load_store(root)["rule"]["entries"] if x["id"] == e["id"]][0]
    states = {a["value"]: a["status"] for a in e["accounts"]}
    assert states == {5: "rejected", 4: "chosen"}
    assert e["data"]["outputs"][0]["value"] == 4        # the chosen account lands
    assert e["status"] == "confirmed"

def test_retire_sets_flags_and_refuses_retired_heir(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5, key="a")), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(5, key="b")), _run_dir(root, "2"))
    store = load_store(root)
    a = [x for x in store["rule"]["entries"] if x["key"] == "a"][0]
    b = [x for x in store["rule"]["entries"] if x["key"] == "b"][0]
    retire(root, a["id"], b["id"], _run_dir(root, "3"))
    a2 = [x for x in load_store(root)["rule"]["entries"] if x["id"] == a["id"]][0]
    assert a2["retired"] and a2["valid_to"] and a2["superseded_by"]["ref"] == b["id"]
    with pytest.raises(SystemExit):
        retire(root, b["id"], a["id"], _run_dir(root, "4"))   # heir is retired

def test_promote_keeps_id_recomputes_key_refuses_collision(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    note = {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "note", "key": "note_ab12cd34ef56",
        "title": "یادداشت", "statement": "هر پرس ۶۰ گرم",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "5"}],
        "retired": False, "data": {}}]}
    r = apply(root, _write(root, "dn.json", note), _run_dir(root, "1"))
    nid = r["id_map"]["T-1"]
    promote(root, nid, "rule", "portion_g_roast_beef", _run_dir(root, "2"))
    store = load_store(root)
    assert not any(e["id"] == nid for e in store["note"]["entries"])
    e = [x for x in store["rule"]["entries"] if x["id"] == nid][0]
    assert e["key"] == "portion_g_roast_beef" and e["kind"] == "rule"
    with pytest.raises(SystemExit):                         # promote without --key where minted
        promote(root, nid, "note", None, _run_dir(root, "3"))

def test_export_reference_record_csv(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    out = export(root, "units", tmp_path / "u.csv", include_retired=False)
    text = out.read_text(encoding="utf-8")
    assert text.splitlines()[0] == "key,symbol,dimension,factor_to_base,unit_title"
    assert "g,g,mass,1," in text
    with pytest.raises(SystemExit):
        export(root, "units", root / "facts" / "u.csv", include_retired=False)  # under facts/


# --- repair-foreign-keys: the one write that removes, and why it has to be ---
# --- a verb at all (the ladder has no action that takes a key back out) ---

def _with_foreign_keys(root, members):
    """`units` in the store, carrying `members` on `foreignKeys` — written
    straight into the file because no supported path can put them there.
    A delta cannot: `apply` runs the content pass, which refuses the shape
    outright. That is the point — the store's 84 predate the check, and the
    only way to reproduce their arrival is to bypass the door that now stops
    them."""
    path = root / "facts" / "records.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    entry = [e for e in doc["entries"] if e["key"] == "units"][0]
    entry["data"]["foreignKeys"] = members
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return entry["id"]


# `F-00216`'s member, verbatim: an IMPORT descriptor written where §8 puts a
# foreign key.
_IMPORT_DESCRIPTOR = {"spreadsheetId": "1AIjH", "sheet": "singlePizza",
                      "range": "A:X", "target": {"ref": "F-00193"}}
_REAL_KEY = {"fields": ["symbol"], "reference": {"ref": "F-00001"},
             "reference_fields": ["key"]}


def test_repair_drops_the_malformed_member_and_keeps_the_declared_one(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    fid = _with_foreign_keys(root, [_IMPORT_DESCRIPTOR, _REAL_KEY])
    assert repair_foreign_keys(root, _run_dir(root, "20260902-101500")) == [(fid, 1)]
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["data"]["foreignKeys"] == [_REAL_KEY]      # the real one survives


def test_repair_drops_the_collection_with_its_last_member(tmp_path):
    # A record left holding `foreignKeys: []` would still say it joins
    # something. Nothing is what it has.
    root = _root(tmp_path); _seed_units(root)
    fid = _with_foreign_keys(root, [_IMPORT_DESCRIPTOR])
    repair_foreign_keys(root, _run_dir(root, "20260902-101500"))
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert "foreignKeys" not in e["data"]


def test_repair_leaves_a_clean_store_untouched_byte_for_byte(tmp_path):
    # Idempotence, and the guard against a repair that "tidies" anything else:
    # a second run must find nothing and write nothing at all.
    root = _root(tmp_path); _seed_units(root)
    _with_foreign_keys(root, [_IMPORT_DESCRIPTOR])
    repair_foreign_keys(root, _run_dir(root, "20260902-101500"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    run_two = _run_dir(root, "20260902-101600")
    assert repair_foreign_keys(root, run_two) == []
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before
    # And no snapshot either: a run directory holding `facts-before/` with no
    # delta beside it is a live `revert` target that would restore a store from
    # after this repair — undoing whatever came next instead of undoing this.
    assert not (run_two / "facts-delta.json").exists()
    assert not (run_two / "facts-before").exists()


def test_repair_is_revertible_from_its_own_snapshot(tmp_path):
    # The reason this is a verb rather than a script: it leaves a run
    # directory `revert` can undo, like every other writing verb.
    root = _root(tmp_path); _seed_units(root)
    fid = _with_foreign_keys(root, [_IMPORT_DESCRIPTOR])
    run = _run_dir(root, "20260902-101500")
    repair_foreign_keys(root, run)
    revert(root, run)
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["data"]["foreignKeys"] == [_IMPORT_DESCRIPTOR]


def test_repair_leaves_the_store_passing_the_pass_that_refused_it(tmp_path):
    # The two are wired to one predicate; this is the assertion that they
    # actually agree on a real store rather than in principle.
    root = _root(tmp_path); _seed_units(root)
    _with_foreign_keys(root, [_IMPORT_DESCRIPTOR])
    doc = json.loads((root / "facts" / "records.json").read_text(encoding="utf-8"))
    assert any("foreignKeys" in m for m in check_document(doc, "facts"))
    repair_foreign_keys(root, _run_dir(root, "20260902-101500"))
    doc = json.loads((root / "facts" / "records.json").read_text(encoding="utf-8"))
    assert [m for m in check_document(doc, "facts") if "foreignKeys" in m] == []


# --- coordinator ruling on task-6 review finding I2: promote must never ---
# --- fabricate item/record/measurement data; it refuses, cleanly, instead ---

def _bare_note(root, note_id, key, run_n, data=None):
    note = {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "note", "key": key,
        "title": "یادداشت", "statement": "s",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "9"}],
        "retired": False, "data": data or {}}]}
    r = apply(root, _write(root, f"{note_id}.json", note), _run_dir(root, run_n))
    return r["id_map"]["T-1"]


def test_promote_to_item_refuses_missing_category_and_unit_nothing_written(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    nid = _bare_note(root, "dn2", "note_ab12cd34ef57", "1")
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    with pytest.raises(SystemExit) as exc:
        promote(root, nid, "item", "ing_new", _run_dir(root, "2"))
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "category" in err and "unit" in err           # message names the missing keys
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after                               # five files byte-identical


def test_promote_to_item_succeeds_when_data_already_has_category_and_unit(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    nid = _bare_note(root, "dn3", "note_ab12cd34ef58", "1",
                     data={"category": "ingredient", "unit": "g"})
    promote(root, nid, "item", "ing_olive_oil", _run_dir(root, "2"))
    store = load_store(root)
    e = [x for x in store["item"]["entries"] if x["id"] == nid][0]
    assert e["id"] == nid and e["kind"] == "item" and e["key"] == "ing_olive_oil"
    index = json.loads((root / "facts" / ".index.json").read_text(encoding="utf-8"))
    row = [r for r in index["entries"] if r["id"] == nid][0]
    assert row["kind"] == "item"


# --- repair-source-refs: a citation is a PATH (QF-5), and 598 of the ---
# --- store's were an id or a path that had lost its root             ---

WORKBOOK = {"spreadsheetId": "12Q9yQ", "short": "kitchen", "dir": "K__Kitchen",
            "file": "Kitchen.xlsx", "departments": ["cooking"], "branches": [],
            "reference_tabs": [], "confirmed": True, "scripts": []}


def _estate(root):
    """The manifest row and the files behind it, as `dump-workbook` leaves
    them: the workbook directory holds the binary and its script."""
    man = root / "attachments" / "sheets" / "manifest.json"
    doc = json.loads(man.read_text(encoding="utf-8"))
    doc["workbooks"] = [WORKBOOK]
    man.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    d = root / "attachments" / "sheets" / "K__Kitchen"
    d.mkdir()
    (d / "Kitchen.xlsx").write_bytes(b"x")
    (d / "Kitchen.gs").write_text("x", encoding="utf-8")


def _cite(root, ref, kind="sheet"):
    """`units` in the store citing `ref` — written into the file, because
    `apply` now refuses exactly this shape at the door. That is the point: the
    store's 598 predate the check."""
    path = root / "facts" / "records.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    entry = [e for e in doc["entries"] if e["key"] == "units"][0]
    entry["source"] = [{"type": kind, "ref": ref, "hash": None, "run": "r"}]
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return entry["id"]


def test_repair_turns_a_drive_id_into_the_workbook_path(tmp_path):
    root = _root(tmp_path); _seed_units(root); _estate(root)
    fid = _cite(root, "12Q9yQ")
    repaired, stuck = repair_source_refs(root, _run_dir(root, "20260902-101500"))
    assert (repaired, stuck) == ([(fid, 1)], [])
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["source"][0]["ref"] == "attachments/sheets/K__Kitchen/Kitchen.xlsx"


def test_repair_gives_a_rootless_path_its_root(tmp_path):
    # The other 23: a real path, written without `attachments/sheets/` in
    # front of it. Expressed as "does prefixing name a file" rather than as a
    # rule about `.gs`, so it is the file on disk that decides.
    root = _root(tmp_path); _seed_units(root); _estate(root)
    fid = _cite(root, "K__Kitchen/Kitchen.gs", kind="script")
    repair_source_refs(root, _run_dir(root, "20260902-101500"))
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["source"][0]["ref"] == "attachments/sheets/K__Kitchen/Kitchen.gs"


def test_repair_leaves_a_ref_it_cannot_place_and_reports_it(tmp_path):
    """A repair that guessed would cite evidence nobody checked. An id the
    manifest does not carry is left exactly as it is and named to the caller,
    which is the difference between a repair and a rewrite."""
    root = _root(tmp_path); _seed_units(root); _estate(root)
    fid = _cite(root, "notAnIdWeKnow")
    repaired, stuck = repair_source_refs(root, _run_dir(root, "20260902-101500"))
    assert repaired == []
    assert stuck == [(fid, "notAnIdWeKnow")]
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["source"][0]["ref"] == "notAnIdWeKnow"


def test_repair_leaves_a_citation_that_already_resolves_alone(tmp_path):
    root = _root(tmp_path); _seed_units(root); _estate(root)
    _cite(root, "meetings/transcripts/c.txt", kind="voice")
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    run = _run_dir(root, "20260902-101500")
    assert repair_source_refs(root, run) == ([], [])
    assert {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")} == before
    assert not (run / "facts-before").exists()


def test_repair_does_not_stamp_a_hash_it_never_computed(tmp_path):
    """`hash` was `null` because the file could not be found, and filling it
    here would record this repair run as the reader of a file it never opened.
    `merge facts check` re-hashes every citation and is what should fill it."""
    root = _root(tmp_path); _seed_units(root); _estate(root)
    fid = _cite(root, "12Q9yQ")
    repair_source_refs(root, _run_dir(root, "20260902-101500"))
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["source"][0]["hash"] is None
    assert e["source"][0]["run"] == "r"


def test_repair_is_revertible_and_its_result_passes_apply_s_own_check(tmp_path):
    """The two ends: `revert` puts the broken ref back, and what the repair
    wrote is what `apply`'s QF-5 precondition would now accept — the check and
    the repair agreeing on one definition of a good citation."""
    root = _root(tmp_path); _seed_units(root); _estate(root)
    fid = _cite(root, "12Q9yQ")
    run = _run_dir(root, "20260902-101500")
    repair_source_refs(root, run)
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert _source_path_problems(root, e, "x") == []
    revert(root, run)
    e = [x for x in load_store(root)["record"]["entries"] if x["id"] == fid][0]
    assert e["source"][0]["ref"] == "12Q9yQ"
