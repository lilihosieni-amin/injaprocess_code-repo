from facts_helpers import (_root, _seed_units, _const_delta, _write, _run_dir,
                           _meta)
from merge_facts import is_open, load_store
from merge_facts.apply import apply
from merge_facts.revert import revert
from merge_facts.apply import _source_path_problems
from merge_facts.verbs import (edit, export, promote, repair_source_refs,
                               resolve, retire)
import pytest

# json: only the two locking tests below need it, to read `.index.json` back
# and to snapshot the five facts files for a byte-identical check.
import itertools
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
    note = {"schema_version": 2, "entries": [{
        "id": "T-1", "kind": "note", "key": "note_ab12cd34ef56",
        "title": "یادداشت", "statement": "هر پرس ۶۰ گرم",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "5"}],
        "retired": False, "data": {"about": [{"ref": "F-00001"}],
                                   "question": "این عدد کجا ثبت می‌شود؟"}}]}
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


# --- coordinator ruling on task-6 review finding I2: promote must never ---
# --- fabricate item/record/measurement data; it refuses, cleanly, instead ---

def _bare_note(root, note_id, key, run_n, data=None):
    note = {"schema_version": 2, "entries": [{
        "id": "T-1", "kind": "note", "key": key,
        "title": "یادداشت", "statement": "s",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "9"}],
        "retired": False,
        "data": data or {"about": [{"ref": "F-00001"}],
                         "question": "این عدد کجا ثبت می‌شود؟"}}]}
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


def test_a_note_cannot_carry_another_kinds_payload(tmp_path):
    # QF-9 closes the note payload to `about[]` + `question`, so the keys
    # `promote` requires for item/record/measurement can never sit on one: those
    # three promotions are now always refused for want of them, and `rule` —
    # whose stubs are empty containers — is the only reachable target.
    root = _root(tmp_path); _seed_units(root)
    note = {"schema_version": 2, "entries": [{
        "id": "T-1", "kind": "note", "key": "note_ab12cd34ef58",
        "title": "یادداشت", "statement": "s",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "9"}],
        "retired": False, "data": {"about": [{"ref": "F-00001"}], "question": "؟",
                                   "category": "ingredient", "unit": "g"}}]}
    # `apply` step 1 is the schema; it raises before any precondition runs, so
    # this is a ValueError out of `validate`, not the exit-2 of a precondition.
    with pytest.raises(ValueError):
        apply(root, _write(root, "dn3.json", note), _run_dir(root, "1"))


def test_promote_note_to_note_is_a_rekey_that_keeps_the_payload(tmp_path):
    # `--kind note` with a new key is a rekey, not a change of kind: the entry
    # stays a note, so QF-9's `about`/`question` — which is what a note IS, and
    # what `noteData` requires — must survive. Clearing them here would make
    # `save_store` refuse the very entry the verb just wrote.
    root = _root(tmp_path); _seed_units(root)
    nid = _bare_note(root, "dn4", "note_ab12cd34ef59", "1")
    promote(root, nid, "note", "note_ff11ee22dd33", _run_dir(root, "2"))
    e = [x for x in load_store(root)["note"]["entries"] if x["id"] == nid][0]
    assert e["key"] == "note_ff11ee22dd33"
    assert e["data"] == {"about": [{"ref": "F-00001"}],
                         "question": "این عدد کجا ثبت می‌شود؟"}


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


def test_resolving_a_unit_clears_the_stale_unit_ref_beside_it(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol"); a["entries"][0]["data"]["outputs"][0]["unit"] = "g"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    b = _const_delta(5, key="tol"); b["entries"][0]["data"]["outputs"][0]["unit"] = "kg"
    apply(root, _write(root, "b.json", b), _run_dir(root, "2"))
    store = load_store(root)
    entry = [e for e in store["rule"]["entries"] if e["key"] == "tol"][0]
    entry["data"]["outputs"][0]["unit_ref"] = {"ref": "F-00001", "row": "g"}
    (root / "facts" / "rules.json").write_text(
        json.dumps(store["rule"], ensure_ascii=False), encoding="utf-8")
    chosen = [x for x in entry["accounts"] if x["value"] == "kg"][0]
    resolve(root, entry["id"], "data/outputs/v/unit", chosen["id"],
            _run_dir(root, "3"))
    after = [e for e in load_store(root)["rule"]["entries"]
             if e["key"] == "tol"][0]["data"]["outputs"][0]
    assert after["unit"] == "kg" and "unit_ref" not in after


def test_resolving_a_unit_to_a_ref_is_refused_and_writes_nothing(tmp_path):
    """The shape `_clear_unit_ref` used to spare — a chosen account whose value
    is a `{ref}` rather than a symbol — cannot reach the store at all: every
    `unit` leaf is `string | null` (facts.schema.json:67, 122, 143, 172, 185,
    204, 217, 269) and every payload is closed. `save_store` validates all five
    files before writing any, so the refusal leaves the store as it was."""
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol"); a["entries"][0]["data"]["outputs"][0]["unit"] = "g"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    b = _const_delta(5, key="tol"); b["entries"][0]["data"]["outputs"][0]["unit"] = "kg"
    apply(root, _write(root, "b.json", b), _run_dir(root, "2"))
    entry = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"][0]
    chosen = [x for x in entry["accounts"] if x["value"] == "kg"][0]
    chosen["value"] = {"ref": "F-00001", "row": "g"}     # a ref where a symbol goes
    path = root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    [e for e in doc["entries"] if e["key"] == "tol"][0]["accounts"] = entry["accounts"]
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    before = {q.name: q.read_bytes() for q in (root / "facts").glob("*.json")}
    with pytest.raises(ValueError):
        resolve(root, entry["id"], "data/outputs/v/unit", chosen["id"],
                _run_dir(root, "3"))
    assert {q.name: q.read_bytes() for q in (root / "facts").glob("*.json")} == before


# --------------------------------------------------------------------------- #
# v3.7 §2 — `merge facts edit`
# --------------------------------------------------------------------------- #

def _chat_run(root, n):
    """A run directory with the `meta.json` `edit` requires (§2.4's chat
    citation points at that file)."""
    run = _run_dir(root, n); _meta(run); return run

def _patch(root, name, ops):
    return _write(root, name, {"schema_version": 1, "ops": ops})

def _rule_entry(root, key="tol"):
    return [x for x in load_store(root)["rule"]["entries"] if x["key"] == key][0]

def _five(root):
    """The five store files as bytes — the 'nothing written' assertion."""
    from merge_facts import KIND_FILES, facts_dir
    return {n: (facts_dir(root) / n).read_bytes() for n in KIND_FILES.values()
            if (facts_dir(root) / n).is_file()}

def test_edit_sets_a_prose_leaf_the_ladder_never_rewrites(tmp_path, monkeypatch):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    run = _chat_run(root, "2")
    # `_now` is second-resolution (QF-41's `iso`), and an apply and an edit in
    # the same second stamp the same string — so the stamp is pinned rather
    # than merely compared, which also says WHOSE clock wrote it.
    monkeypatch.setattr("merge_facts.verbs._now", lambda: "2030-01-01T00:00:00Z")
    edit(root, e["id"], _patch(root, "p.json",
         [{"op": "set", "path": "statement", "value": "حد مجاز انحراف هر پرس"}]), run)
    e2 = _rule_entry(root)
    assert e2["statement"] == "حد مجاز انحراف هر پرس"
    assert e2["updated_at"] == "2030-01-01T00:00:00Z" != e["updated_at"]
    # provenance: one chat source naming the run, and the run's own record
    chat = [s for s in e2["source"] if s["type"] == "chat"]
    assert chat == [{"type": "chat", "ref": "runs/facts/cooking/2/meta.json",
                     "run": "runs/facts/cooking/2"}]
    assert (run / "facts-before" / "rules.json").is_file()
    assert json.loads((run / "facts-delta.json").read_text(encoding="utf-8")) == [
        {"verb": "edit", "args": {"id": e["id"], "patch": "p.json", "ops": 1}}]

def test_edit_set_remove_unset_append_in_order(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    delta = _const_delta(5)
    delta["entries"][0]["aliases"] = ["تلورانس"]
    delta["entries"][0]["data"]["outputs"][0]["per"] = "pizza"
    apply(root, _write(root, "d1.json", delta), _run_dir(root, "1"))
    e = _rule_entry(root)
    edit(root, e["id"], _patch(root, "p.json", [
        {"op": "set", "path": "data/outputs/v/value", "value": 7},
        {"op": "unset", "path": "data/outputs/v/per"},
        {"op": "append", "path": "aliases", "value": "حد مجاز"},
        {"op": "append", "path": "data/outputs",
         "value": {"key": "w", "title": "وزن", "unit": "g", "nature": "limit", "value": 1}},
        {"op": "remove", "path": "data/outputs/w"},
        {"op": "set", "path": "scope/departments", "value": ["cooking", "management"]},
    ]), _chat_run(root, "2"))
    e2 = _rule_entry(root)
    out = e2["data"]["outputs"]
    assert [o["key"] for o in out] == ["v"] and out[0]["value"] == 7 and "per" not in out[0]
    assert e2["aliases"] == ["تلورانس", "حد مجاز"]
    assert e2["scope"]["departments"] == ["cooking", "management"]

@pytest.mark.parametrize("ops, fragment", [
    ([{"op": "set", "path": "key", "value": "other"}], "identity"),
    ([{"op": "set", "path": "id", "value": "F-00099"}], "identity"),
    ([{"op": "set", "path": "status", "value": "confirmed"}], "derived"),
    ([{"op": "remove", "path": "source/9"}], "not found"),
    ([{"op": "remove", "path": "data/outputs/nope"}], "not found"),
    ([{"op": "unset", "path": "data/nope"}], "not found"),
    ([{"op": "append", "path": "data/outputs", "value": {"key": "v", "value": 1}}], "already"),
    ([{"op": "set", "path": "statement", "value": "Table_Mavad را بخوان"}], "names"),
    ([{"op": "set", "path": "data/outputs/v/unit", "value": "stone"}], "unit"),
    ([{"op": "set", "path": "scope/departments", "value": ["nope"]}], "registry"),
    ([{"op": "set", "path": "scope/branches", "value": ["mars"]}], "manifest"),
    ([{"op": "set", "path": "data/outputs/v", "value": {"key": "z", "value": 1}}], "key"),
    # A value of the wrong SHAPE: every one of these used to traceback (exit 1)
    # in a post-loop step that trusted the entry to be shaped as the schema
    # says — the scope check, `_recompute_location`, `_settle`, the prose lint,
    # the `field_status` pruning. The shape is judged once, before any of them.
    ([{"op": "set", "path": "scope", "value": "cooking"}], "facts.schema.json"),
    ([{"op": "set", "path": "data", "value": "x"}], "facts.schema.json"),
    ([{"op": "set", "path": "aliases", "value": 7}], "facts.schema.json"),
    ([{"op": "set", "path": "field_status", "value": "x"}], "facts.schema.json"),
    ([{"op": "set", "path": "accounts", "value": "x"}], "op 1 set accounts"),
    # F3: `retired` is `retire`'s, and only un-retiring comes back through here.
    ([{"op": "set", "path": "retired", "value": True}], "retired: retire is the verb"),
])
def test_edit_refuses_and_writes_nothing(tmp_path, capsys, ops, fragment):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    run = _chat_run(root, "2")
    with pytest.raises(SystemExit) as exc:
        edit(root, e["id"], _patch(root, "p.json", ops), run)
    assert exc.value.code == 2
    assert fragment in capsys.readouterr().err
    assert _five(root) == before
    assert not (run / "facts-before").exists() and not (run / "facts-delta.json").exists()

def test_edit_refuses_a_patch_the_schema_will_not_take(tmp_path, capsys):
    """§2.3 item 1 — `facts-patch.schema.json` is the first gate: a `set`
    without a `value` is an instruction with a hole in it, not an unset."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    with pytest.raises(SystemExit) as exc:
        edit(root, e["id"], _patch(root, "p.json", [{"op": "set", "path": "statement"}]),
             _chat_run(root, "2"))
    assert exc.value.code == 2
    assert "facts-patch.schema.json" in capsys.readouterr().err
    assert _five(root) == before


def test_edit_settles_a_dispute_three_ways(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)                                   # values 5 and 4 on data/outputs/v/value
    # (a) the new value matches an account → chosen, the other rejected
    edit(root, e["id"], _patch(root, "p1.json",
         [{"op": "set", "path": "data/outputs/v/value", "value": 4}]), _chat_run(root, "3"))
    e = _rule_entry(root)
    assert {a["value"]: a["status"] for a in e["accounts"]} == {5: "rejected", 4: "chosen"}
    assert e["status"] == "confirmed"
    # (b) a value no account holds → a chosen chat account is appended, the rest rejected
    e = _disputed_again(root)
    edit(root, e["id"], _patch(root, "p2.json",
         [{"op": "set", "path": "data/outputs/v/value", "value": 9}]), _chat_run(root, "5"))
    e = _rule_entry(root)
    chosen = [a for a in e["accounts"] if a["status"] == "chosen"]
    assert len(chosen) == 1 and chosen[0]["value"] == 9 and chosen[0]["source"]["type"] == "chat"
    assert not [a for a in e["accounts"] if a["status"] == "open"]
    # (c) unset of a disputed path rejects every open account on it
    e = _disputed_again(root)
    edit(root, e["id"], _patch(root, "p3.json",
         [{"op": "set", "path": "data/outputs/v/value", "value": None}]), _chat_run(root, "7"))
    assert not [a for a in _rule_entry(root)["accounts"] if a["status"] == "open"]

_again = itertools.count(101)

def _disputed_again(root):
    """A fresh dispute on the same path after the previous one was settled.

    The value is new each call: `ladder._dispute` dedups an account by
    (field, statement, value, source), so re-applying a value the entry has
    already argued over adds nothing and would leave the path settled.
    """
    n = next(_again)
    apply(root, _write(root, f"d{n}.json", _const_delta(n)), _run_dir(root, str(n)))
    return _rule_entry(root)

def test_edit_preview_prints_current_and_proposed_and_writes_nothing(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    run = _chat_run(root, "2")
    report = edit(root, e["id"], _patch(root, "p.json",
                  [{"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]), run,
                  preview=True)
    out = capsys.readouterr().out
    assert "[1] set statement" in out and "فعلی:" in out and "پیشنهاد:" in out
    assert "حد مجاز" in out and "حد مجاز انحراف" in out and out.rstrip().endswith("OK")
    assert report["problems"] == [] and report["ops"][0]["after"] == "حد مجاز انحراف"
    assert _five(root) == before and not (run / "facts-before").exists()

def test_edit_preview_reports_a_gate_refusal_after_printing_the_op(tmp_path, capsys):
    """§2.5 — the block first, then the gate's own lines on stderr and exit 2:
    a preview that refuses still shows the owner what was proposed."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    run = _chat_run(root, "2")
    with pytest.raises(SystemExit) as exc:
        edit(root, e["id"], _patch(root, "p.json",
             [{"op": "set", "path": "data/outputs/v/unit", "value": "stone"}]),
             run, preview=True)
    assert exc.value.code == 2
    out, err = capsys.readouterr()
    assert "[1] set data/outputs/v/unit" in out and "پیشنهاد: stone" in out
    assert "OK" not in out
    assert "unit 'stone' is declared by no row" in err
    assert _five(root) == before and not (run / "facts-before").exists()


def test_edit_preview_reports_a_refusal_with_exit_2_from_the_cli(tmp_path, capsys, monkeypatch):
    from merge.cli import main as merge_main
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    patch = _patch(root, "p.json", [{"op": "set", "path": "key", "value": "x"}])
    monkeypatch.setenv("DATA_ROOT", str(root))
    with pytest.raises(SystemExit) as exc:
        merge_main(["facts", "edit", "--id", e["id"], "--patch", str(patch),
                    "--run", str(_chat_run(root, "2")), "--preview"])
    assert exc.value.code == 2
    assert "identity" in capsys.readouterr().err

def test_revert_of_an_edit_restores_the_entry(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    run = _chat_run(root, "2")
    edit(root, e["id"], _patch(root, "p.json",
         [{"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]), run)
    revert(root, run)
    e2 = _rule_entry(root)
    assert e2["statement"] == e["statement"] and e2["source"] == e["source"]

def test_edit_refuses_a_wrong_shaped_value_from_the_cli(tmp_path, capsys, monkeypatch):
    """F1 at the CLI: a shape the schema will not take is a refusal, not a
    traceback — exit 2 and `precondition failed:` on stderr like every other."""
    from merge.cli import main as merge_main
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    patch = _patch(root, "p.json", [{"op": "set", "path": "scope", "value": "cooking"}])
    monkeypatch.setenv("DATA_ROOT", str(root))
    with pytest.raises(SystemExit) as exc:
        merge_main(["facts", "edit", "--id", e["id"], "--patch", str(patch),
                    "--run", str(_chat_run(root, "2"))])
    assert exc.value.code == 2
    assert capsys.readouterr().err.startswith("precondition failed:")


def test_edit_un_retires_but_never_retires(tmp_path):
    """§2.3 item 2 — `retire` owns `retired`: it dates the entry, points it at
    an heir and asks the owner first. `edit` may only take the flag back off
    (spec §1's promise that a mistaken retire is undoable)."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    retire(root, e["id"], None, _run_dir(root, "2"))
    assert not is_open(_rule_entry(root))
    edit(root, e["id"], _patch(root, "p.json",
         [{"op": "set", "path": "retired", "value": False},
          {"op": "set", "path": "valid_to", "value": None}]), _chat_run(root, "3"))
    assert is_open(_rule_entry(root))


def test_an_append_settles_nothing(tmp_path):
    """§2.4 names `set` (settles) and `remove`/`unset` (rejects). An `append`
    adds a member and answers no question — every open account survives it,
    the one on the appended path included (`_settle` used to run here and
    would have rejected it as a `remove` does)."""
    from merge_facts import save_store
    from merge_facts.ladder import with_account_id
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)                        # open accounts on data/outputs/v/value
    store = load_store(root)
    entry = [x for x in store["rule"]["entries"] if x["id"] == e["id"]][0]
    entry["accounts"].append(with_account_id(
        {"field": "aliases", "statement": "حد مجاز", "value": "حد مجاز",
         "source": {"type": "chat", "ref": None}, "speaker_role": None,
         "status": "open"}))
    save_store(root, store)
    edit(root, e["id"], _patch(root, "p.json",
         [{"op": "append", "path": "aliases", "value": "حد مجاز"}]), _chat_run(root, "3"))
    e2 = _rule_entry(root)
    assert e2["aliases"] == ["حد مجاز"]
    assert [a["status"] for a in e2["accounts"]] == ["open", "open", "open"]


def test_edit_refuses_a_run_that_carries_no_meta(tmp_path, capsys):
    """The chat citation `edit` unions in points at `{run_dir}/meta.json`, and
    the ledger reads the actor off it: a run without one leaves a dangling
    source and an anonymous vouch."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    with pytest.raises(SystemExit) as exc:
        edit(root, e["id"], _patch(root, "p.json",
             [{"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]),
             _run_dir(root, "2"))
    assert exc.value.code == 2
    assert "run directory carries no meta.json" in capsys.readouterr().err
    assert _five(root) == before


def test_an_accounts_member_is_addressed_by_its_id(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)
    acc = e["accounts"][0]
    from merge_facts import get_path
    assert get_path(e, f"accounts/{acc['id']}") is acc


# --------------------------------------------------------------------------- #
# owner ruling 2026-09-09 — a citation is editable like any other member
# --------------------------------------------------------------------------- #

def test_edit_changes_a_citation_by_position_and_restamps_only_what_it_touched(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(5)
    d["entries"][0]["source"].append(
        {"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "30"})
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    (root / "meetings" / "transcripts" / "d.txt").write_text("y", encoding="utf-8")
    e = _rule_entry(root)
    run = _run_dir(root, "2"); _meta(run)
    edit(root, e["id"], _patch(root, "p.json", [
        {"op": "set", "path": "source/0/ref", "value": "meetings/transcripts/d.txt"},
        {"op": "set", "path": "source/0/lines", "value": "1-2"},
        {"op": "unset", "path": "source/1/lines"},
        {"op": "append", "path": "source",
         "value": {"type": "docx",
                   "ref": "departments/cooking/attachments/p.jpg", "page": 1}},
    ]), run)
    voice = [s for s in _rule_entry(root)["source"] if s["type"] in ("voice", "docx")]
    assert voice[0]["ref"] == "meetings/transcripts/d.txt" and voice[0]["lines"] == "1-2"
    assert voice[0]["run"] == "runs/facts/cooking/2" and voice[0]["hash"].startswith("sha256:")
    assert "lines" not in voice[1] and voice[1]["run"] == "runs/facts/cooking/2"
    assert voice[2]["page"] == 1 and voice[2]["run"] == "runs/facts/cooking/2"


def test_an_untouched_citation_keeps_its_stamp_and_a_removed_one_is_gone(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(5)
    d["entries"][0]["source"].append(
        {"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "30"})
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    e = _rule_entry(root)
    run = _run_dir(root, "2"); _meta(run)
    edit(root, e["id"], _patch(root, "p.json", [{"op": "remove", "path": "source/1"}]), run)
    voice = [s for s in _rule_entry(root)["source"] if s["type"] == "voice"]
    assert [s["lines"] for s in voice] == ["11"]
    assert voice[0]["run"] == "runs/facts/cooking/1" and voice[0]["hash"] == e["source"][0]["hash"]


def test_edit_refuses_a_citation_naming_no_file_and_a_duplicate_citation(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    for n, ops, fragment in (
            ("2", [{"op": "set", "path": "source/0/ref",
                    "value": "meetings/transcripts/nope.txt"}], "names no file"),
            ("3", [{"op": "append", "path": "source",
                    "value": {"type": "voice", "ref": "meetings/transcripts/c.txt",
                              "lines": "11"}}], "already there")):
        run = _run_dir(root, n); _meta(run)
        with pytest.raises(SystemExit) as exc:
            edit(root, e["id"], _patch(root, f"p{n}.json", ops), run)
        assert exc.value.code == 2
        assert _five(root) == before and not (run / "facts-before").exists()
