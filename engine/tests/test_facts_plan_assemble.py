"""`facts-plan digest | assemble` (§2.6) — the nine steps over a two-unit run:
the delta, `assembly.json` and the owner's `gate-b.md`.

The skeleton and the units' documents are synthetic (T14's style), but every
shape here is one the landed contracts accept: `facts-unit.schema.json` for a
unit's output, `facts-delta.schema.json` for what `assemble` writes, and
`merge_facts.apply.simulate` for what `apply` would then do with it.
"""
import hashlib
import json

import pytest
from facts_helpers import _seed_units
from facts_plan.assemble import assemble, digest, validate_unit
from merge_facts.apply import simulate

from engine_common import validate


def _root(tmp_path):
    (tmp_path / "facts").mkdir()
    for name in ("items", "records", "measurements", "rules", "notes"):
        (tmp_path / "facts" / f"{name}.json").write_text(
            json.dumps({"schema_version": 2, "entries": []}), encoding="utf-8")
    (tmp_path / "departments").mkdir()
    (tmp_path / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]}),
        encoding="utf-8")
    (tmp_path / "departments" / "cooking" / "processes").mkdir(parents=True)
    # The estate the sources resolve against: `assemble` turns a candidate's
    # `spreadsheetId` into the workbook's path through this manifest, and
    # `preconditions` reads the branch codes off it.
    (tmp_path / "attachments" / "sheets").mkdir(parents=True)
    (tmp_path / "attachments" / "sheets" / "manifest.json").write_text(json.dumps(
        {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": [{"spreadsheetId": "SID", "short": "pitza",
                        "dir": "Pitza", "file": "pitza.xlsx"}]},
        ensure_ascii=False), encoding="utf-8")
    (tmp_path / "meetings" / "transcripts").mkdir(parents=True)
    (tmp_path / "meetings" / "transcripts" / "c.txt").write_text(
        "x", encoding="utf-8")
    return tmp_path


def _skeleton():
    return {"schema_version": 1, "department": "cooking", "run": "r",
            "unit_symbols": ["kg"], "instances": [], "imports": [],
            "issues": [{"kind": "column_shift", "instance": "pitza__s5",
                        "description": "ستون «قیمت» جا افتاده است",
                        "run_only": False, "target": "S-rec-000000000001"}],
            "candidates": [
                {"id": "S-rec-000000000001", "kind": "record", "unit": "u-a",
                 "payload": {"medium": "sheet", "role": "log",
                             "location": {"spreadsheetId": "SID", "sheet": "پیتزا"},
                             "instances": [{"key": "pitza__s5",
                                            "spreadsheetId": "SID",
                                            "sheetId": 5, "sheet": "پیتزا",
                                            "branch": "chalebagh",
                                            "hidden": False}],
                             "fields": [{"key": "c_h", "title": "مصرف اعلامی",
                                         "columns": {"pitza__s5": "H"}}]}},
                {"id": "S-r-000000000002", "kind": "rule", "unit": "u-b",
                 "payload": {"original": "MINUS(J6,H6)",
                             "applies_to": [{"key": "pitza__s5__j__r6",
                                             "record": {"ref": "S-rec-000000000001",
                                                        "field": "c_h"},
                                             "variant": 0, "range": "J6:J15",
                                             "params": {}}]},
                 "render": {"output": "انحراف", "variants": []}},
                {"id": "S-i-000000000003", "kind": "item", "unit": "u-b",
                 "payload": {"code": "##1"},
                 "render": {"labels": ["پنیر"]}}]}


def _plan():
    return {"schema_version": 1, "department": "cooking", "hashes": {},
            "units": [{"id": u, "type": "workbook", "inputs": i, "nodes": [],
                       "candidates": c, "est_tokens_in": 1, "est_tokens_out": 1}
                      for u, i, c in (
                          ("u-a", [], ["S-rec-000000000001"]),
                          ("u-b", ["meetings/transcripts/c.txt#L1-L20"],
                           ["S-r-000000000002", "S-i-000000000003"]))]}


def _run(tmp_path, outputs, skeleton=None, plan=None):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units").mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(
        json.dumps(skeleton or _skeleton(), ensure_ascii=False), encoding="utf-8")
    (run_dir / "plan.json").write_text(json.dumps(plan or _plan()),
                                       encoding="utf-8")
    for unit, doc in outputs.items():
        (run_dir / "units" / unit).mkdir(exist_ok=True)
        (run_dir / "units" / unit / "out.1.json").write_text(
            json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return run_dir


def _record_out():
    return {"schema_version": 1, "unit": "u-a", "attempt": 1, "new": [],
            "decisions": [{"skeleton": "S-rec-000000000001", "action": "keep",
                           "key": "gozaresh_shabane_pitza",
                           "title": "گزارش شبانهٔ لاین پیتزا",
                           "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
                           "data": {"role": "log", "cadence": "nightly",
                                    "fields": [{"from": "c_h",
                                                "key": "masraf_elami",
                                                "type": "number", "unit": "kg"}]}}]}


def _rule_out(**over):
    doc = {"schema_version": 1, "unit": "u-b", "attempt": 1, "new": [],
           "decisions": [
               {"skeleton": "S-r-000000000002", "action": "keep",
                "key": "enheraf", "title": "انحراف مصرف",
                "statement": "انحراف مصرف برابر است با مصرف واقعی منهای مصرف "
                             "اعلامی لاین.",
                "data": {"expr": "enheraf = masraf_vaqei - masraf_elami",
                         "lang": "feel",
                         "inputs": [{"key": "masraf_elami",
                                     "from": {"ref": "S-rec-000000000001",
                                              "field": "c_h"}},
                                    {"key": "masraf_vaqei", "unit": "kg",
                                     "from": "operator"}],
                         "outputs": [{"key": "enheraf", "title": "انحراف",
                                      "unit": "kg", "nature": "observed"}]}},
               {"skeleton": "S-i-000000000003", "action": "keep",
                "key": "item_1", "title": "پنیر پیتزا",
                "statement": "پنیر پیتزا که با کیلوگرم شمرده می‌شود.",
                "data": {"category": "ingredient",
                         "unit": {"value": "kg", "inferred": True}}}]}
    doc.update(over)
    return doc


def _second_record(key="gozaresh_shabane_pitza", **over):
    """A record another unit writes up under a key some unit already minted —
    the cross-unit collision of step 7, from a transcript rather than a tab."""
    entry = {"kind": "record", "key": key,
             "title": "گزارش شبانه (نگارش دوم)",
             "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
             "branches": ["chalebagh"],
             "data": {"medium": "sheet", "role": "log", "location": {},
                      "cadence": "nightly"}}
    entry["data"].update(over)
    return entry


def test_refs_and_field_keys_resolved_and_delta_written(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    out = assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    record, rule = by_key["gozaresh_shabane_pitza"], by_key["enheraf"]
    assert rule["data"]["inputs"][0]["from"] == {"ref": record["id"],
                                                 "field": "masraf_elami"}
    assert rule["data"]["applies_to"][0]["record"] == {"ref": record["id"],
                                                       "field": "masraf_elami"}
    assert record["data"]["fields"][0]["columns"] == {"pitza__s5": "H"}
    assert record["data"]["fields"][0]["title"] == "مصرف اعلامی"
    assert by_key["item_1"]["field_status"] == {"data/unit": "inferred"}
    assert by_key["item_1"]["data"]["unit"] == "kg"
    assert record["scope"] == {"departments": ["cooking"],
                               "branches": ["chalebagh"]}
    assert record["issues"][0]["kind"] == "column_shift"
    assert record["issues"][0]["engine"] is True
    assert record["issues"][0]["affects"] == [{"ref": record["id"]}]
    assert record["source"] == [{"type": "sheet",
                                 "ref": "attachments/sheets/Pitza/pitza.xlsx",
                                 "sheet": "پیتزا"}]
    assert out["review_status"] == "absent"


def test_a_rule_takes_the_branches_of_the_records_it_binds(tmp_path):
    """§3.2 — a rule sits on the tabs its bindings name, which is how the
    review's `entry: {kind, key, scope}` address finds it."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rule = next(e for e in delta["entries"] if e["key"] == "enheraf")
    assert rule["scope"] == {"departments": ["cooking"],
                             "branches": ["chalebagh"]}


def test_ids_are_minted_in_kind_order(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [(e["kind"], e["id"]) for e in delta["entries"]][:2] == \
        [("item", "T-1"), ("record", "T-2")]


def test_drop_and_failed_unit_land_in_assembly_json(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0] = {"skeleton": "S-r-000000000002", "action": "drop",
                            "reason_code": "date_passthrough"}
    run_dir = _run(root, {"u-b": rule})           # u-a never returned
    assemble(root, run_dir)
    doc = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert doc["dropped"] == [{"skeleton": "S-r-000000000002", "kind": "rule",
                               "label": "انحراف",
                               "reason_code": "date_passthrough", "unit": "u-b"}]
    assert [u["skeleton"] for u in doc["undecided"]] == ["S-rec-000000000001"]
    assert doc["provenance"]["T-1"] == "u-b"


def test_merge_into_and_split(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"] = rule["decisions"][:1] + [
        {"skeleton": "S-i-000000000003", "action": "split", "reason_code": "other",
         "into": [{"key": "item_1", "title": "پنیر پیتزا",
                   "statement": "پنیر پیتزا که با کیلوگرم شمرده می‌شود.",
                   "data": {"category": "ingredient", "unit": "kg"},
                   "takes": ["pitza__s5"]},
                  {"key": "item_2", "title": "پنیر ورقه‌ای",
                   "statement": "پنیر ورقه‌ای که با بسته شمرده می‌شود.",
                   "data": {"category": "ingredient", "unit": "pack"},
                   "takes": ["pitza__s6"]}]}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert sorted(e["key"] for e in delta["entries"] if e["kind"] == "item") == \
        ["item_1", "item_2"]


def test_merge_into_moves_the_bindings_and_mints_no_entry(tmp_path):
    """Step 3 — the merged candidate leaves nothing of its own behind, and the
    target gains its bindings."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0] = {"skeleton": "S-r-000000000002",
                            "action": "merge_into",
                            "into": "S-rec-000000000001",
                            "reason_code": "duplicate"}
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"]] == ["item", "record"]
    record = next(e for e in delta["entries"] if e["kind"] == "record")
    assert [m["key"] for m in record["data"]["applies_to"]] == ["pitza__s5__j__r6"]


def test_two_units_one_key_merge_with_the_lowest_units_prose(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [_second_record()]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    titles = [e["title"] for e in delta["entries"]
              if e["key"] == "gozaresh_shabane_pitza"]
    assert titles == ["گزارش شبانهٔ لاین پیتزا"]        # u-a wins, u-b's wording flagged


def test_two_sources_disagreeing_become_two_accounts(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [_second_record(cadence="shift")]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    record = next(e for e in delta["entries"]
                  if e["key"] == "gozaresh_shabane_pitza")
    assert len(record["accounts"]) == 2
    assert {a["field"] for a in record["accounts"]} == {"data/cadence"}
    assert all(a["status"] == "open" and a["speaker_role"] is None
               and "id" not in a for a in record["accounts"])
    assert all(a["source"]["ref"] for a in record["accounts"])
    assert {a["source"]["type"] for a in record["accounts"]} == {"sheet", "voice"}


def test_one_artefact_two_readings_is_unit_drift_not_an_account(tmp_path):
    """Step 7's other half: same source kind, so nobody is quoting a different
    document — the reviewer settles it, `apply` never sees an account."""
    root = _root(tmp_path)
    record, rule = _record_out(), _rule_out()
    record["new"] = [_second_record(key="gozaresh_hafteqi")]
    rule["new"] = [_second_record(key="gozaresh_hafteqi", cadence="shift")]
    plan = _plan()                     # both units read the same transcript
    plan["units"][0]["inputs"] = ["meetings/transcripts/c.txt#L1-L20"]
    run_dir = _run(root, {"u-a": record, "u-b": rule}, plan=plan)
    text = digest(root, run_dir).read_text(encoding="utf-8")
    assert "unit_drift · T-2 · data/cadence" in text
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert all("accounts" not in e for e in delta["entries"])


def test_a_lint_failure_refuses_the_assembly(tmp_path, capsys):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0]["statement"] = "انحراف در ستون J6:J15 نوشته می‌شود."
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    assert "u-b" in capsys.readouterr().err
    assert not (run_dir / "facts-delta.json").exists()


def test_the_reviewers_own_prose_is_linted_too(tmp_path, capsys):
    """Step 8 is the only gate the review passes through: its rewrites reach
    the delta without a unit's `facts-unit` pass ever seeing them."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": ["chalebagh"]}},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف مصرف",
                             "statement": "انحراف در ستون J6:J15 است."}])
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir, review=True)
    assert excinfo.value.code == 2
    assert "enheraf: statement" in capsys.readouterr().err


def test_a_note_key_is_stable_across_runs(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "note", "key": "x", "title": "پرسش دربارهٔ تلورانس",
                    "statement": "تلورانس انحراف هنوز تعیین نشده است.",
                    "data": {"about": [{"ref": "S-r-000000000002"}],
                             "question": "تلورانس چند گرم است؟"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    first = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    note = next(e for e in first["entries"] if e["kind"] == "note")
    key = note["key"]
    assert key.startswith("note_") and len(key) == len("note_") + 12
    assert note["data"]["about"] == [{"ref": "T-3"}]
    assert note["source"] == [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                               "lines": "1-20"}]
    assemble(root, run_dir)
    second = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e["key"] for e in second["entries"] if e["kind"] == "note") == key


def _write_review(run_dir, decisions):
    (run_dir / "review" / "out.json").write_text(json.dumps(
        {"schema_version": 1, "unit": "review", "attempt": 1, "new": [],
         "decisions": decisions}, ensure_ascii=False), encoding="utf-8")


def test_digest_then_a_stale_review_is_discarded(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    path = digest(root, run_dir)
    assert "کپی جدول" not in path.read_text(encoding="utf-8")
    held = (run_dir / "review" / "input.sha256").read_text(encoding="utf-8").strip()
    assert held == hashlib.sha256(path.read_bytes()).hexdigest()
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": ["chalebagh"]}},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف مصرف مواد اولیه",
                             "statement": "انحراف مصرف برابر است با مصرف واقعی "
                                          "منهای مصرف اعلامی."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف مصرف مواد اولیه"
    (run_dir / "review" / "input.sha256").write_text("0" * 64, encoding="utf-8")
    assert assemble(root, run_dir, review=True)["review_status"] == "discarded"


def test_a_review_address_hitting_nothing_discards_the_document(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": []}},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف دیگر",
                             "statement": "انحراف مصرف اعلامی است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "discarded"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف مصرف"


def test_gate_b_is_persian_and_carries_no_locator(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    text = (run_dir / "gate-b.md").read_text(encoding="utf-8")
    assert text.startswith("خلاصهٔ اعداد آشپزخانه — برای تأیید")
    assert "انحراف مصرف" in text and "تأیید می‌کنید؟" in text
    for banned in ("S-r-", "T-1", "u-b", "merge ", "runs/", "facts-delta",
                   "pitza__s5", "J6:J15", "cooking", "chalebagh"):
        assert banned not in text


def _two_rule_skeleton():
    """Two rule columns bound to one record — the co-referencing temp entries
    step 7's flags have to reason across."""
    skeleton = _skeleton()
    twin = json.loads(json.dumps(skeleton["candidates"][1]))
    twin["id"] = "S-r-000000000004"
    skeleton["candidates"].append(twin)
    return skeleton


def test_flags_cross_two_temp_entries_that_reference_each_other(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"].append(dict(rule["decisions"][0],
                                  skeleton="S-r-000000000004",
                                  key="enheraf_dovom",
                                  title="انحراف مصرف مرغ",
                                  statement="انحراف مصرف مرغ برابر است با مصرف "
                                            "واقعی منهای مصرف اعلامی."))
    plan = _plan()
    plan["units"][1]["candidates"].append("S-r-000000000004")
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule},
                   skeleton=_two_rule_skeleton(), plan=plan)
    text = digest(root, run_dir).read_text(encoding="utf-8")
    assert "two_writers · T-3 · T-3 (pitza__s5__j__r6) and T-4 " \
           "(pitza__s5__j__r6) both write column J of pitza__s5" in text
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    record = next(e for e in delta["entries"] if e["kind"] == "record")
    assert [e["data"]["applies_to"][0]["record"]["ref"]
            for e in delta["entries"] if e["kind"] == "rule"] == \
        [record["id"], record["id"]]


def test_wrapper_variants_is_flagged_for_the_reviewer(tmp_path):
    """§2.6 step 7's run-scoped flag: two readings of one column that differ
    only by the unit conversion wrapped around them."""
    root = _root(tmp_path)
    skeleton = _skeleton()
    skeleton["candidates"][1]["render"]["variants"] = [
        {"key": "v1", "shape": "MINUS(@,@)", "functions": ["MINUS"],
         "table_reader": False},
        {"key": "v2", "shape": "CONVERT_GR_TO_KG(MINUS(@,@))",
         "functions": ["CONVERT_GR_TO_KG", "MINUS"], "table_reader": False}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()},
                   skeleton=skeleton)
    text = digest(root, run_dir).read_text(encoding="utf-8")
    assert "wrapper_variants · T-3" in text


def test_a_review_document_in_a_unit_directory_is_refused(tmp_path):
    """The residual T14 left: a `review` document sitting in `units/<id>/`
    skipped both the directory check and the completeness check, so a unit
    could be `done` having decided nothing."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    path = run_dir / "units" / "u-a" / "out.1.json"
    path.write_text(json.dumps(dict(_record_out(), unit="review"),
                               ensure_ascii=False), encoding="utf-8")
    problems = validate_unit(root, run_dir, path)
    assert len(problems) == 1 and "units/u-a" in problems[0]


def _note_new():
    return {"kind": "note", "key": "x", "title": "پرسش دربارهٔ تلورانس",
            "statement": "تلورانس انحراف هنوز تعیین نشده است.",
            "data": {"about": [{"ref": "S-r-000000000002"}],
                     "question": "تلورانس چند گرم است؟"}}


def _run_with_a_note(tmp_path):
    """A run whose `u-b` reports one `new[]` note, assembled once so the test
    knows the key §3.1 minted for it and the scope §3.2 gave it."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [_note_new()]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    note = next(e for e in delta["entries"] if e["kind"] == "note")
    digest(root, run_dir)
    return root, run_dir, note


def test_a_new_entry_takes_the_scope_of_what_it_is_about(tmp_path):
    """§3.2 — a `new` entry takes the union of the scopes of the entries it
    attaches to; the note's only `about[]` target is the rule, which sits on
    the چاله‌باغ tab."""
    _root_, _run_dir, note = _run_with_a_note(tmp_path)
    assert note["scope"] == {"departments": ["cooking"],
                             "branches": ["chalebagh"]}


def test_a_new_entry_attached_to_nothing_is_department_wide(tmp_path):
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "measurement", "key": "vazn_panir",
                    "title": "وزن پنیر", "statement": "پنیر را سرآشپز می‌کشد.",
                    "data": {"quantity": "mass", "unit": "kg",
                             "by": "سرآشپز", "when": "هر شب"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    measurement = next(e for e in delta["entries"] if e["kind"] == "measurement")
    assert measurement["scope"] == {"departments": ["cooking"], "branches": []}


def test_a_review_drop_removes_a_new_entry(tmp_path):
    """Step 0 — a `new[]` entry is addressed exactly like a candidate, so the
    reviewer's four actions reach the notes and measurements too."""
    root, run_dir, note = _run_with_a_note(tmp_path)
    _write_review(run_dir, [{"entry": {"kind": "note", "key": note["key"],
                                       "scope": note["scope"]},
                             "action": "drop", "reason_code": "duplicate"}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"] if e["kind"] == "note"] == []
    doc = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [d["reason_code"] for d in doc["dropped"]] == ["duplicate"]


def test_a_review_rewrite_reaches_a_new_entry(tmp_path):
    root, run_dir, note = _run_with_a_note(tmp_path)
    _write_review(run_dir, [{"entry": {"kind": "note", "key": note["key"],
                                       "scope": note["scope"]},
                             "action": "keep", "key": note["key"],
                             "title": "پرسش دربارهٔ حد مجاز انحراف",
                             "statement": "حد مجاز انحراف هنوز تعیین نشده است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    fresh = next(e for e in delta["entries"] if e["kind"] == "note")
    assert fresh["title"] == "پرسش دربارهٔ حد مجاز انحراف"
    assert fresh["key"] == note["key"]      # §3.1 mints it from about[] + question


def test_two_records_on_one_tab_are_flagged_template_split(tmp_path):
    """§2.6 step 7 / §3.2 — `find_match` will not rename and `apply` refuses
    the pair, so the reviewer hears about it here."""
    root = _root(tmp_path)
    skeleton = _skeleton()
    twin = json.loads(json.dumps(skeleton["candidates"][0]))
    twin["id"], twin["unit"] = "S-rec-000000000005", "u-b"
    skeleton["candidates"].append(twin)
    plan = _plan()
    plan["units"][1]["candidates"].append("S-rec-000000000005")
    rule = _rule_out()
    rule["decisions"].append(dict(_record_out()["decisions"][0],
                                  skeleton="S-rec-000000000005",
                                  key="gozaresh_shabane_digar",
                                  title="گزارش شبانهٔ دیگر"))
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule},
                   skeleton=skeleton, plan=plan)
    text = digest(root, run_dir).read_text(encoding="utf-8")
    assert "template_split · T-2 · T-2 (gozaresh_shabane_pitza) and T-3 " \
           "(gozaresh_shabane_digar) both claim SID/پیتزا" in text


def test_a_ref_into_an_undecided_candidate_names_both_units(tmp_path, capsys):
    """1a — the candidate is neither kept nor dropped because its unit never
    returned; the message still has to say which unit that was."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-b": _rule_out()})           # u-a never returned
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "u-b: ref S-rec-000000000001 names a candidate unit u-a" in err


def test_merge_into_a_dropped_target_names_both_units(tmp_path, capsys):
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0] = {"skeleton": "S-rec-000000000001",
                              "action": "drop", "reason_code": "cosmetic"}
    rule = _rule_out()
    rule["decisions"][0] = {"skeleton": "S-r-000000000002",
                            "action": "merge_into",
                            "into": "S-rec-000000000001",
                            "reason_code": "duplicate"}
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "unit u-b" in err and "unit u-a" in err


def test_a_ref_into_a_dropped_candidate_names_both_units(tmp_path, capsys):
    """1a — the rule of one unit reads the record another unit threw away, and
    no delta may be written on a ref that resolves to nothing."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0] = {"skeleton": "S-rec-000000000001",
                              "action": "drop", "reason_code": "cosmetic"}
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "u-b" in err and "u-a" in err
    assert not (run_dir / "facts-delta.json").exists()


def test_a_unit_that_spent_both_attempts_leaves_undecided_candidates(tmp_path):
    """A `failed` unit is a gap the report carries (§2.6 step 5), not a wall:
    only a unit still owed an attempt refuses the assembly."""
    root = _root(tmp_path)
    broken = _rule_out()
    broken["decisions"] = broken["decisions"][:1]     # its item is undecided
    run_dir = _run(root, {"u-a": _record_out(), "u-b": broken})
    (run_dir / "units" / "u-b" / "out.2.json").write_text(
        json.dumps(broken, ensure_ascii=False), encoding="utf-8")
    assemble(root, run_dir)
    doc = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert sorted(u["skeleton"] for u in doc["undecided"]) == \
        ["S-i-000000000003", "S-r-000000000002"]


def test_the_delta_is_schema_valid_and_survives_a_simulated_apply(tmp_path):
    root = _root(tmp_path)
    _seed_units(root)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = run_dir / "facts-delta.json"
    validate("facts-delta.schema.json",
             json.loads(delta.read_text(encoding="utf-8")))
    _store, problems = simulate(root, delta, run_dir)
    assert problems == []
