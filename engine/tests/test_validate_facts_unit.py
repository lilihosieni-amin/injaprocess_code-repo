"""`validate facts-unit <file> --run <run_dir>` — the content pass over one
unit's decisions (§2.5), which is also what `facts-plan status` calls to say
`done` or `failed`."""
import json

import pytest
from facts_plan.assemble import validate_unit
from validate.cli import main

#: What a candidate of each kind mechanically carries, and what a unit's `keep`
#: writes over it — the store's own shapes, since the gate now holds a unit
#: document to `facts-delta.schema.json` (I1). `output` is `render`, never
#: payload: `ruleData` has no such key, and `build.label_of` reads it there.
KINDS = {
    "rule": ({}, {"render": {"output": "انحراف"}}, {"inputs": [], "outputs": []}),
    # `c_h` is the mechanical column a record unit renames: `_rename_fields`
    # merges what the unit wrote onto the columns the dumper found, so a record
    # candidate with no `fields[]` is one whose `fields[]` decision is a no-op.
    "record": ({"medium": "sheet", "role": "log",
                "location": {"spreadsheetId": "SID", "sheet": "پیتزا"},
                "fields": [{"key": "c_h", "title": "مصرف اعلامی"}]},
               {"render": {"sheet": "پیتزا"}}, {"role": "log"}),
}


def _run(tmp_path, candidates=("S-r-000000000001",), kind="rule"):
    root = tmp_path
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    (root / "departments" / "cooking" / "processes" / "cooking-030.json").write_text(
        json.dumps({"id": "cooking-030",
                    "nodes": [{"id": "cooking-030-n016", "label": "شمارش"}]}),
        encoding="utf-8")
    payload, extra, _ = KINDS[kind]
    run_dir = root / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units" / "u-wb-pitza").mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": ["kg", "portion"],
         "candidates": [{"id": c, "kind": kind, "unit": "u-wb-pitza",
                         "payload": dict(payload), **extra}
                        for c in candidates],
         "instances": [], "imports": [], "issues": []}, ensure_ascii=False),
        encoding="utf-8")
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": [{"id": "u-wb-pitza", "type": "workbook", "inputs": [],
                    "candidates": list(candidates), "nodes": [],
                    "est_tokens_in": 1, "est_tokens_out": 1},
                   {"id": "u-wb-other", "type": "workbook", "inputs": [],
                    "candidates": [], "nodes": [],
                    "est_tokens_in": 1, "est_tokens_out": 1}]}), encoding="utf-8")
    return root, run_dir


def _doc(kind="rule", **over):
    doc = {"schema_version": 1, "unit": "u-wb-pitza", "attempt": 1,
           "decisions": [{"skeleton": "S-r-000000000001", "action": "keep",
                          "key": "enheraf", "title": "انحراف مصرف",
                          "statement": "انحراف مصرف هر مادهٔ اولیه برابر است با "
                                       "مصرف واقعی منهای مصرف اعلامی لاین.",
                          "data": dict(KINDS[kind][2])}],
           "new": []}
    doc.update(over)
    return doc


def _write(run_dir, doc, name="out.1.json"):
    path = run_dir / "units" / "u-wb-pitza" / name
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_a_complete_document_passes(tmp_path):
    root, run_dir = _run(tmp_path)
    assert validate_unit(root, run_dir, _write(run_dir, _doc())) == []


def test_an_undecided_candidate_is_named(tmp_path):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    problems = validate_unit(root, run_dir, _write(run_dir, _doc()))
    assert any("S-r-000000000002" in p and "no decision" in p for p in problems)


def test_a_candidate_decided_twice_and_an_unknown_skeleton(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"].append({"skeleton": "S-r-000000000001", "action": "drop",
                             "reason_code": "cosmetic"})
    doc["decisions"].append({"skeleton": "S-r-000000000009", "action": "drop",
                            "reason_code": "cosmetic"})
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert any("decisions[1]" in p and "twice" in p for p in problems)
    assert any("decisions[2]" in p and "S-r-000000000009" in p for p in problems)


def test_a_document_naming_another_unit_is_refused(tmp_path):
    # The unit a document belongs to is the directory it sits in: a document
    # naming a zero-candidate sibling would otherwise decide nothing and pass.
    root, run_dir = _run(tmp_path)
    problems = validate_unit(root, run_dir,
                             _write(run_dir, _doc(unit="u-wb-other", decisions=[])))
    assert any("u-wb-other" in p and "u-wb-pitza" in p for p in problems)
    assert any("S-r-000000000001" in p and "no decision" in p for p in problems)


def test_a_document_outside_a_unit_directory_is_refused(tmp_path):
    root, run_dir = _run(tmp_path)
    path = run_dir / "out.1.json"
    path.write_text(json.dumps(_doc(), ensure_ascii=False), encoding="utf-8")
    assert any("units/" in p for p in validate_unit(root, run_dir, path))


def test_node_citation_checked_against_the_whole_index(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["processes"] = [{"process": "cooking-030",
                                         "node": "n016", "quote": "شمارش"}]
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    doc["decisions"][0]["processes"] = [{"process": "cooking-030",
                                         "node": "n999", "quote": "شمارش"}]
    assert any("n999" in p for p in
               validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")))


def test_a_new_entrys_citation_is_checked_too(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc(new=[{"kind": "note", "key": "shomaresh", "title": "شمارش شبانه",
                     "statement": "شمارش موجودی در پایان شب انجام می‌شود.",
                     "data": {},
                     "processes": [{"process": "cooking-030", "node": "n999"}]}])
    assert any("new[0]" in p and "n999" in p
               for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_provisional_field_ref_shape(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"]["inputs"] = [
        {"key": "a", "from": {"ref": "S-rec-000000000003", "field": "C_H"}}]
    assert any("C_H" in p for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_lint_runs_with_the_unit_symbols_exempted(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["statement"] = "انحراف در خانهٔ H6 نوشته می‌شود."
    assert any("H6" in p for p in validate_unit(root, run_dir, _write(run_dir, doc)))
    doc["decisions"][0]["statement"] = "مصرف بر حسب kg و portion ثبت می‌شود."
    assert validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")) == []


def test_sheet_words_belong_to_a_records_own_statement(tmp_path):
    """QF-50 — `content._check_prose` allows «ستون»/«تب»/«سلول» in a record's
    own `statement` and nowhere else, and the unit-level lint has to say the
    same: a record that follows its card was being refused here, re-dispatched
    with the same message, and its candidates lost to `undecided[]`."""
    sentence = "شمارش هر شب در تب «کانتر» ثبت می‌شود."
    root, run_dir = _run(tmp_path / "rec", kind="record")
    doc = _doc("record")
    doc["decisions"][0]["statement"] = sentence
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    titled = _doc("record")
    titled["decisions"][0]["title"] = sentence
    assert any("title" in p for p in
               validate_unit(root, run_dir, _write(run_dir, titled, "out.2.json")))
    root, run_dir = _run(tmp_path / "rule")
    rule_doc = _doc()
    rule_doc["decisions"][0]["statement"] = sentence
    assert any("statement" in p for p in
               validate_unit(root, run_dir, _write(run_dir, rule_doc)))


def test_a_unit_written_on_a_non_numeric_field_is_an_error(tmp_path):
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {"fields": [{"from": "c_a", "key": "nam",
                                               "type": "string", "unit": "kg"}]}
    assert any("nam" in p and "unit" in p
               for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_review_caps(tmp_path):
    root, run_dir = _run(tmp_path)
    (run_dir / "review").mkdir()
    doc = {"schema_version": 1, "unit": "review", "attempt": 1,
           "decisions": [{"entry": {"kind": "rule", "key": f"k{n}",
                                    "scope": {"departments": ["cooking"],
                                              "branches": []}},
                          "action": "drop", "reason_code": "duplicate"}
                         for n in range(61)],
           "new": []}
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    assert any("60" in p for p in validate_unit(root, run_dir, path))


def test_the_cli_needs_a_run_directory(tmp_path, capsys):
    root, run_dir = _run(tmp_path)
    with pytest.raises(SystemExit) as excinfo:
        main(["facts-unit", str(_write(run_dir, _doc()))])
    assert excinfo.value.code == 2
    assert "--run" in capsys.readouterr().err


def test_the_cli_groups_the_messages_and_exits_2(tmp_path, capsys, monkeypatch):
    root, run_dir = _run(tmp_path, ("S-r-000000000001", "S-r-000000000002"))
    monkeypatch.setenv("DATA_ROOT", str(root))
    path = str(_write(run_dir, _doc()))
    with pytest.raises(SystemExit) as excinfo:
        main(["facts-unit", path, "--run", str(run_dir)])
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "S-r-000000000002" in err and "1 entries" in err


def test_the_cli_prints_ok_for_a_document_that_passes(tmp_path, capsys, monkeypatch):
    root, run_dir = _run(tmp_path)
    monkeypatch.setenv("DATA_ROOT", str(root))
    assert main(["facts-unit", str(_write(run_dir, _doc())),
                 "--run", str(run_dir)]) == 0
    assert capsys.readouterr().out.startswith("OK: ")


def _review(run_dir, decisions, **over):
    doc = {"schema_version": 1, "unit": "review", "attempt": 1,
           "decisions": decisions, "new": []}
    doc.update(over)
    (run_dir / "review").mkdir(exist_ok=True)
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_the_rewrite_cap_is_the_second_one(tmp_path):
    root, run_dir = _run(tmp_path)
    rewrites = [{"entry": {"kind": "rule", "key": f"k{n}"}, "action": "keep",
                 "key": f"k{n}", "title": "انحراف مصرف",
                 "statement": "مصرف واقعی هر شب ثبت می‌شود."} for n in range(21)]
    assert any("rewrites" in p and "20" in p
               for p in validate_unit(root, run_dir, _review(run_dir, rewrites)))
    assert validate_unit(root, run_dir, _review(run_dir, rewrites[:20])) == []


def test_a_schema_error_survives_beside_the_cap_message(tmp_path):
    root, run_dir = _run(tmp_path)
    doc = {"schema_version": 1, "unit": "review",
           "decisions": [{"entry": {"kind": "rule", "key": f"k{n}"},
                          "action": "drop", "reason_code": "duplicate"}
                         for n in range(61)]}      # …and no `attempt`
    path = run_dir / "review" / "out.json"
    (run_dir / "review").mkdir(exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    problems = validate_unit(root, run_dir, path)
    assert any("60" in p for p in problems)
    assert any("attempt" in p for p in problems)


def test_a_review_document_is_not_checked_for_completeness(tmp_path):
    root, run_dir = _run(tmp_path)
    (run_dir / "review").mkdir()
    path = run_dir / "review" / "out.json"
    path.write_text(json.dumps({"schema_version": 1, "unit": "review",
                                "attempt": 1, "decisions": [], "new": []}),
                    encoding="utf-8")
    assert validate_unit(root, run_dir, path) == []


def test_a_field_type_the_store_has_no_such_thing_as_fails_at_the_unit_gate(tmp_path):
    """I1 — 30 of the 2026-09-07 run's 52 Stage V refusals were column types
    written as `text`. The unit that wrote it is told, by field path, while it
    still has an attempt."""
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {
        "role": "log", "fields": [{"from": "c_h", "key": "masraf", "type": "text"}]}
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert any("decisions[0] S-r-000000000001" in p
               and "data.fields[0].type" in p
               and "'text' is not one of" in p for p in problems)
    doc["decisions"][0]["data"]["fields"][0]["type"] = "number"
    assert validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")) == []


def test_a_new_paper_record_without_a_location_fails_at_the_unit_gate(tmp_path):
    """§3.3 + I1 — the two photographed forms of the 2026-09-07 run, refused
    where the unit can still fix them."""
    root, run_dir = _run(tmp_path)
    form = {"kind": "record", "key": "mande_shab", "title": "فرم مانده شب",
            "statement": "فرم کاغذی مانده شب که هر شیفت پر می‌شود.",
            "data": {"medium": "paper", "role": "log"}}
    problems = validate_unit(root, run_dir,
                             _write(run_dir, _doc(new=[form])))
    assert any("new[0]" in p and "'location' is a required property" in p
               for p in problems)
    form["data"]["location"] = {"kept_at": "زونکن دفتر", "holder": "سرآشپز شیفت"}
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[form]), "out.2.json")) == []


def test_a_paper_locations_prose_is_linted(tmp_path):
    """Ruling 2 — `kept_at`/`holder`/`system` are prose leaves, so a location
    written as a cell reference is refused where `title`/`statement` would be."""
    root, run_dir = _run(tmp_path)
    form = {"kind": "record", "key": "mande_shab", "title": "فرم مانده شب",
            "statement": "فرم کاغذی مانده شب که هر شیفت پر می‌شود.",
            "data": {"medium": "paper", "role": "log",
                     "location": {"kept_at": "در سلول J6 دفتر آشپزخانه",
                                  "holder": "سرآشپز شیفت"}}}
    assert any("data/location/kept_at" in p
               for p in validate_unit(root, run_dir,
                                      _write(run_dir, _doc(new=[form]))))
    form["data"]["location"]["kept_at"] = "در دفتر سرآشپز، کشوی اول"
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[form]), "out.2.json")) == []


def test_the_content_pass_runs_over_the_materialised_entries(tmp_path):
    """§3.1 step 3 — `check_document`, the same call `preconditions` makes, so
    a rule whose expr reads an identifier it never declared is refused here and
    not at Stage V."""
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"] = {
        "expr": "enheraf = masraf_vaqei - masraf_elami", "lang": "feel",
        "inputs": [{"key": "masraf_vaqei"}],
        "outputs": [{"key": "enheraf"}]}
    assert any("decisions[0] S-r-000000000001" in p and "masraf_elami" in p
               for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_a_third_attempt_is_refused_by_the_cap(tmp_path):
    """§3.5 — two attempts per unit is the engine's rule, not the
    coordinator's. The 2026-09-07 run reached out.3.json and then asked the
    owner to lift the cap."""
    root, run_dir = _run(tmp_path)
    assert validate_unit(root, run_dir, _write(run_dir, _doc(), "out.3.json")) == \
        ["out.3.json: attempt cap: two per run"]
    assert validate_unit(root, run_dir, _write(run_dir, _doc(), "out.2.json")) == []


def _manifest(root, *branches):
    """The sheets manifest `preconditions` reads branch codes off — absent from
    a bare test estate, and the gate skips the check when it is."""
    (root / "attachments" / "sheets").mkdir(parents=True, exist_ok=True)
    (root / "attachments" / "sheets" / "manifest.json").write_text(json.dumps(
        {"schema_version": 1, "workbooks": [],
         "branches": [{"code": c, "name": c} for c in branches]}), encoding="utf-8")


def _paper(**over):
    form = {"kind": "record", "key": "mande_shab", "title": "فرم مانده شب",
            "statement": "فرم کاغذی مانده شب که هر شیفت پر می‌شود.",
            "data": {"medium": "paper", "role": "log",
                     "location": {"kept_at": "زونکن دفتر",
                                  "holder": "سرآشپز شیفت"}}}
    form.update(over)
    return form


def test_a_branch_the_sheets_manifest_never_heard_of_is_refused_at_the_gate(tmp_path):
    """I1 — `preconditions` checks branch codes outside `check_document`, so an
    invented branch used to pass the unit gate and die at Stage V."""
    root, run_dir = _run(tmp_path)
    _manifest(root, "chalebagh")
    problems = validate_unit(root, run_dir,
                             _write(run_dir, _doc(new=[_paper(branches=["nowhere"])])))
    assert any("new[0] mande_shab" in p and "scope.branches[0]" in p
               and "'nowhere'" in p for p in problems)
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[_paper(branches=["chalebagh"])]),
                                "out.2.json")) == []


def test_a_unit_symbol_the_run_never_declared_is_refused_at_the_gate(tmp_path):
    """QF-40 — the same list `skeleton.json` carries and `preconditions` checks
    against the units record. `lit` is nobody's symbol here."""
    root, run_dir = _run(tmp_path)
    item = {"kind": "item", "key": "panir", "title": "پنیر پیتزا",
            "statement": "پنیر پیتزا که با کیلوگرم شمرده می‌شود.",
            "data": {"category": "ingredient", "unit": "lit"}}
    assert any("new[0] panir" in p and "'lit'" in p
               for p in validate_unit(root, run_dir,
                                      _write(run_dir, _doc(new=[item]))))
    item["data"]["unit"] = "kg"
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[item]), "out.2.json")) == []


def test_a_field_renamed_from_a_column_the_candidate_has_not_got_is_refused(tmp_path):
    """`_rename_fields` walks the MECHANICAL columns, so a `fields[]` member
    whose `from` names none of them was silently dropped — the unit's work
    vanished and nothing said so."""
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {"fields": [
        {"from": "c_h", "key": "masraf", "type": "number"},
        {"from": "c_z", "key": "gomshode", "type": "number"}]}
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert any("decisions[0] S-r-000000000001" in p
               and "data.fields[1].from" in p and "'c_z'" in p for p in problems)
    del doc["decisions"][0]["data"]["fields"][1]
    assert validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")) == []


def _simulate(root, run_dir, doc):
    """What `merge facts apply` would do with the entries this document
    materialises — the other half of I1, from the unit gate's own fixture."""
    from facts_plan.assemble import materialise
    from merge_facts.apply import simulate
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]},
        ensure_ascii=False), encoding="utf-8")
    entries = [{k: v for k, v in e.items() if not k.startswith("_")}
               for e in materialise(root, run_dir, doc)]
    path = run_dir / "facts-delta.json"
    path.write_text(json.dumps({"schema_version": 2, "entries": entries},
                               ensure_ascii=False), encoding="utf-8")
    return simulate(root, path, run_dir)[1]


def test_a_keyless_row_is_refused_unless_the_table_derives_its_keys(tmp_path):
    """I1 — the store requires `rows[].key`; the delta schema cannot, because a
    reference table's keys are derived at apply (`_derive_row_keys`). Every
    other role has to bring its own, and the gate is what says so."""
    root, run_dir = _run(tmp_path)
    form = _paper()
    form["data"]["rows"] = [{"title": "شیفت صبح"}]
    assert "new[0] mande_shab: data.rows[0]: 'key' is a required property" in \
        validate_unit(root, run_dir, _write(run_dir, _doc(new=[form])))
    form["data"]["rows"][0]["key"] = "sobh"
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[form]), "out.2.json")) == []


def test_a_reference_tables_keyless_rows_pass_the_gate_and_the_apply(tmp_path):
    """The other half of the same rule: `role: reference` keys its rows by the
    primaryKey join at apply, so a keyless row there is not a mistake — the
    gate lets it through and `simulate` proves nothing downstream refuses it."""
    root, run_dir = _run(tmp_path)
    table = _paper(key="mavad", title="فهرست مواد",
                   statement="فهرست کاغذی مواد اولیه که در انبار نگه‌داری می‌شود.")
    table["data"].update({"role": "reference", "primaryKey": ["nam"],
                          "fields": [{"key": "nam", "type": "string"}],
                          "rows": [{"nam": "panir"}]})
    doc = _doc(new=[table])
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    assert _simulate(root, run_dir, doc) == []
    # The same table with a key cell `apply` cannot turn into a segment gets no
    # derived key, so the gate must refuse it where the unit can still fix it.
    table["data"]["rows"] = [{"nam": "پنیر"}]
    doc = _doc(new=[table])
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == [
        "new[0] mavad: data.rows[0]: 'key' is a required property"]


def test_a_symbol_this_document_adds_to_the_units_record_is_its_own(tmp_path):
    """QF-40 — `preconditions` checks a symbol against the store's units rows
    PLUS the ones the delta itself declares, so the gate has to do the same or
    a document that extends the table is refused for using what it just added.
    """
    root, run_dir = _run(tmp_path)
    units = {"kind": "record", "key": "units", "title": "واحدها",
             "statement": "جدول واحدها که نماد و بُعد هر واحد را نگه می‌دارد.",
             "data": {"medium": "native", "role": "config", "location": {},
                      "primaryKey": ["symbol"],
                      "fields": [{"key": "symbol", "type": "string"},
                                 {"key": "dimension", "type": "string"}],
                      "rows": [{"key": "lit", "symbol": "lit",
                                "dimension": "volume"}]}}
    item = {"kind": "item", "key": "roghan", "title": "روغن سرخ‌کردنی",
            "statement": "روغن سرخ‌کردنی که با لیتر شمرده می‌شود.",
            "data": {"category": "ingredient", "unit": "lit"}}
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[units, item]))) == []


def test_one_prose_nit_and_one_shape_error_are_one_line_each(tmp_path):
    """Ruling (e) — the gate runs even when something else was found, and the
    decision lint and the content pass say a prose nit in the same words, so it
    is reported once rather than twice with two spellings."""
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["title"] = "گزارش H6"
    doc["decisions"][0]["data"] = {
        "role": "log", "fields": [{"from": "c_h", "key": "masraf", "type": "text"}]}
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert sum("H6" in p for p in problems) == 1
    assert sum("'text' is not one of" in p for p in problems) == 1


def test_status_reports_a_third_attempt_as_failed(tmp_path):
    from facts_plan.cli import unit_states
    root, run_dir = _run(tmp_path)
    for n in (1, 2, 3):
        _write(run_dir, _doc(), f"out.{n}.json")
    states = {s["id"]: s for s in
              unit_states(root, run_dir, [{"id": "u-wb-pitza", "type": "workbook"}])}
    assert states["u-wb-pitza"]["state"] == "failed"


def _process(root, pid, *, tombstoned=False):
    """One process file in the cooking department, live or tombstoned."""
    path = root / "departments" / "cooking" / "processes" / f"{pid}.json"
    doc = {"id": pid, "nodes": [{"id": f"{pid}-n001", "label": "شمارش"}]}
    if tombstoned:
        doc.update({"tombstoned": True, "superseded_by": ["cooking-030"]})
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_a_citation_into_a_tombstoned_process_is_in_no_index(tmp_path):
    """I3 — a tombstoned process is invisible as content, so citing a node of
    it reads exactly like citing a node that never existed."""
    root, run_dir = _run(tmp_path)
    _process(root, "cooking-002", tombstoned=True)
    doc = _doc()
    doc["decisions"][0]["processes"] = [{"process": "cooking-002",
                                         "node": "n001", "quote": "شمارش"}]
    assert "decisions[0] S-r-000000000001: node n001 is in no process of cooking" \
        in validate_unit(root, run_dir, _write(run_dir, doc))


def test_a_source_into_a_process_tombstoned_after_the_build_is_refused(tmp_path):
    """I1 both ways — the run was planned while the process was live, so the
    citation is at the index; the tombstone lands before the gate runs, and the
    materialised entry has to be refused there in the same words `apply` uses.
    """
    root, run_dir = _run(tmp_path)
    _process(root, "cooking-002")
    form = _paper(processes=[{"process": "cooking-002", "node": "n001",
                              "quote": "شمارش"}])
    doc = _doc(new=[form])
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    assert _simulate(root, run_dir, doc) == []
    _process(root, "cooking-002", tombstoned=True)
    line = "source[0]: process cooking-002 is tombstoned"
    assert f"new[0] mande_shab: {line}" in \
        validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json"))
    assert any(p.endswith(line) for p in _simulate(root, run_dir, doc))


def _materialised(root, run_dir, doc, key):
    from facts_plan.assemble import materialise
    return next(e for e in materialise(root, run_dir, doc) if e["key"] == key)


def test_a_new_entrys_hedge_wrappers_are_unwrapped_like_a_decisions(tmp_path):
    """§3.4 — a `new[]` entry's data is the pseudo-candidate's payload, which
    `_entry` used to copy verbatim: four units of the 2026-09-07 run lost an
    attempt to `data.filled_by: {…} is not of type string`."""
    root, run_dir = _run(tmp_path)
    form = _paper()
    form["data"]["filled_by"] = {"value": "سرآشپز", "inferred": True}
    form["data"]["location"] = {"kept_at": {"value": "زونکن دفتر",
                                            "inferred": True},
                                "holder": "سرآشپز"}
    doc = _doc(new=[form])
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    entry = _materialised(root, run_dir, doc, "mande_shab")
    assert entry["data"]["filled_by"] == "سرآشپز"
    assert entry["data"]["location"]["kept_at"] == "زونکن دفتر"
    assert entry["field_status"] == {"data/filled_by": "inferred",
                                     "data/location/kept_at": "inferred"}
    assert _simulate(root, run_dir, doc) == []


def test_a_new_measurements_hedged_by_is_unwrapped(tmp_path):
    """The same hole on the other kind the run hit: `data.by`."""
    root, run_dir = _run(tmp_path)
    measure = {"kind": "measurement", "key": "mande_shab_vazn",
               "title": "وزن مانده شب",
               "statement": "وزن مانده هر ماده در پایان شب با ترازو اندازه "
                            "گرفته می‌شود.",
               "data": {"quantity": "mass", "unit": "kg",
                        "by": {"value": "سرآشپز", "inferred": True}}}
    doc = _doc(new=[measure])
    assert validate_unit(root, run_dir, _write(run_dir, doc)) == []
    entry = _materialised(root, run_dir, doc, "mande_shab_vazn")
    assert entry["data"]["by"] == "سرآشپز"
    assert entry["field_status"] == {"data/by": "inferred"}
