"""`facts-plan digest | assemble` (§2.6) — the nine steps over a two-unit run:
the delta, `assembly.json` and the owner's `gate-b.md`.

The skeleton and the units' documents are synthetic (T14's style), but every
shape here is one the landed contracts accept: `facts-unit.schema.json` for a
unit's output, `facts-delta.schema.json` for what `assemble` writes, and
`merge_facts.apply.simulate` for what `apply` would then do with it.
"""
import hashlib
import json
import pathlib

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
            # `pack` is the second symbol these fixtures actually write (the
            # review's `panir_varaqei`), and the assembly now holds an entry's
            # units to this list — a symbol the run never declared is refused
            # here rather than at Stage V.
            "unit_symbols": ["kg", "pack"], "instances": [], "imports": [],
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
    target gains its bindings.

    The target is a rule, as a rule's merge target has to be: `_absorb` moves
    `applies_to`/`instances` across verbatim, and `recordData` has no such key —
    this used to merge the rule into the record and mint an entry
    `facts-delta.schema.json` refuses, which nothing checked until the assembly
    started validating what it writes.
    """
    root = _root(tmp_path)
    skeleton, plan = _skeleton(), _plan()
    twin = json.loads(json.dumps(skeleton["candidates"][1]))     # the rule
    twin["id"] = "S-r-000000000004"
    skeleton["candidates"].append(twin)
    plan["units"][1]["candidates"].append(twin["id"])
    rule = _rule_out()
    kept = dict(rule["decisions"][0], skeleton=twin["id"])
    rule["decisions"][0] = {"skeleton": "S-r-000000000002",
                            "action": "merge_into",
                            "into": twin["id"],
                            "reason_code": "duplicate"}
    rule["decisions"].append(kept)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule},
                   skeleton=skeleton, plan=plan)
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"]] == ["item", "record", "rule"]
    merged = next(e for e in delta["entries"] if e["kind"] == "rule")
    assert [m["key"] for m in merged["data"]["applies_to"]] == ["pitza__s5__j__r6"]


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
    # The flag names the entry it is about — `T-2` is minted for this assembly
    # and nowhere else, so it addresses nothing the reviewer can go and read.
    flag = next(line for line in text.splitlines()
                if line.startswith("unit_drift · "))
    assert flag == "unit_drift · record gozaresh_hafteqi · data/cadence: " \
                   "'nightly' (u-a) vs 'shift' (u-b)"
    assert "T-" not in flag
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


def test_a_review_of_any_size_is_accepted(tmp_path):
    """R6: 61 decisions and 21 rewrites were a refusal of the whole document."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    keep = {"entry": {"kind": "rule", "key": "enheraf"}, "action": "keep",
            "key": "enheraf", "title": "انحراف مصرف",
            "statement": "انحراف مصرف برابر است با مصرف واقعی منهای مصرف اعلامی."}
    _write_review(run_dir, [dict(keep) for _ in range(61)])
    problems = validate_unit(root, run_dir, run_dir / "review" / "out.json")
    assert not any("at most" in p for p in problems)


def test_a_code_a_decision_writes_is_ignored(tmp_path):
    """R4: the cooking review of 2026-09-08 was refused whole for copying the
    engine-owned `code` back in. It passes now and changes nothing."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["data"]["code"] = "##99"
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()})
    assert validate_unit(root, run_dir, run_dir / "units" / "u-a" / "out.1.json") == []
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rec = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert rec["data"].get("code") != "##99"


def test_a_code_the_review_writes_is_ignored_too(tmp_path):
    """R4 on the path it actually broke on: the review copied the item codes
    back into `data`, and the whole document was refused for it. The estate's
    code stands and everything else the reviewer wrote lands."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "item", "key": "item_1"},
                             "action": "keep", "key": "item_1",
                             "title": "پنیر ورقه‌ای",
                             "statement": "پنیر ورقه‌ای که با بسته شمرده می‌شود.",
                             "data": {"code": "##99", "unit": "pack"}}])
    assert validate_unit(root, run_dir, run_dir / "review" / "out.json") == []
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    item = next(e for e in delta["entries"] if e["key"] == "item_1")
    assert item["data"]["code"] == "##1" and item["data"]["unit"] == "pack"


def test_a_digest_over_the_ceiling_stops_the_run(tmp_path, monkeypatch):
    """R7: over the ceiling is a defect that stops, not a run without review."""
    import facts_plan.assemble as A
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    monkeypatch.setattr(A, "DIGEST_CEILING", 10)
    with pytest.raises(SystemExit) as exc:
        digest(root, run_dir)
    assert exc.value.code == 2
    assert not (run_dir / "review" / "input.md").exists()
    assert not (run_dir / "review" / "input.sha256").exists()


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


def test_a_review_address_without_scope_lands_on_the_one_entry_it_names(tmp_path):
    """`entryAddr` makes `scope` optional, and the reviewer of the first real
    run left it out on every decision — kind + key alone must land when it
    names exactly one assembled entry."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf"},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف دیگر",
                             "statement": "انحراف مصرف اعلامی است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف دیگر"


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


def test_a_review_merge_into_folds_a_new_entry_away(tmp_path):
    """The `new[]` handle is a merge source as well as a target: the note the
    reviewer folds into the rule leaves nothing of its own in the delta."""
    root, run_dir, note = _run_with_a_note(tmp_path)
    _write_review(run_dir, [{"entry": {"kind": "note", "key": note["key"],
                                       "scope": note["scope"]},
                             "action": "merge_into", "reason_code": "duplicate",
                             "into": {"kind": "rule", "key": "enheraf",
                                      "scope": {"departments": ["cooking"],
                                                "branches": ["chalebagh"]}}}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"] if e["kind"] == "note"] == []
    assert any(e["key"] == "enheraf" for e in delta["entries"])


def test_a_review_split_reaches_a_new_entry(tmp_path):
    """One `new[]` item the reviewer reads as two — split over the pseudo
    candidate, whose payload each part is written over."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "item", "key": "panir", "title": "پنیر",
                    "statement": "پنیری که آشپز روی پیتزا می‌ریزد.",
                    "data": {"category": "ingredient", "unit": "kg"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "item", "key": "panir",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": []}},
                             "action": "split", "reason_code": "other",
                             "into": [
                                 {"key": "panir_pitza", "title": "پنیر پیتزا",
                                  "statement": "پنیری که با کیلوگرم شمرده "
                                               "می‌شود.",
                                  "takes": ["x"],
                                  "data": {"category": "ingredient",
                                           "unit": "kg"}},
                                 {"key": "panir_varaqei",
                                  "title": "پنیر ورقه‌ای",
                                  "statement": "پنیری که با بسته شمرده می‌شود.",
                                  "takes": ["x"],
                                  "data": {"category": "ingredient",
                                           "unit": "pack"}}]}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    items = {e["key"]: e for e in delta["entries"] if e["kind"] == "item"}
    assert "panir" not in items
    assert items["panir_pitza"]["data"]["unit"] == "kg"
    assert items["panir_varaqei"]["data"]["unit"] == "pack"


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


def test_a_ref_into_an_undecided_candidate_holds_the_entry_back(tmp_path):
    """1a — the candidate is neither kept nor dropped because its unit never
    returned. The entry that points at it is held back with it (§2.6 step 5:
    a gap the report carries), never a wall: on 2026-09-08 one unfinished
    table cost the owner every other entry of a 14-unit run."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-b": _rule_out()})           # u-a never returned
    result = assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"]] == ["item"]   # the rule waits
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = [u for u in assembly["undecided"] if u["skeleton"] == "S-r-000000000002"]
    assert held and held[0]["unit"] == "u-b" \
        and held[0]["waits_for"] == "S-rec-000000000001" \
        and held[0]["waits_for_unit"] == "u-a"
    assert result["undecided"] == 2                       # the record, the rule
    assert set(assembly["provenance"]) == {e["id"] for e in delta["entries"]}
    validate("facts-delta.schema.json", delta)


def test_an_entry_the_assembly_refuses_is_held_back_not_the_run(tmp_path):
    """Step 8 — a rule that calls another unit's rule and uses an identifier
    that rule never declares passes its own gate (the call is `T-0` there, so
    the identifier is exempt) and fails only here. On 2026-09-08 the central
    report's rule did exactly that over the raw-materials table, and the
    whole run was refused for it. Now the rule waits, the rest lands."""
    root = _root(tmp_path)
    _seed_units(root)
    record, rule = _record_out(), _rule_out()
    record["new"] = [_tol_new(5)]                       # u-a mints `tol`
    rule["decisions"][0]["data"]["expr"] = \
        "enheraf = masraf_vaqei - masraf_elami - gram_dar_pors"
    rule["decisions"][0]["data"]["calls"] = [{"ref": "N-u-a-0"}]
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    for unit in ("u-a", "u-b"):
        assert validate_unit(root, run_dir,
                             run_dir / "units" / unit / "out.1.json") == []
    result = assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert "enheraf" not in {e["key"] for e in delta["entries"]}
    assert {e["key"] for e in delta["entries"]} >= {"gozaresh_shabane_pitza", "tol"}
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = next(u for u in assembly["undecided"] if u["unit"] == "u-b")
    assert held["kind"] == "rule" and any("gram_dar_pors" in l for l in held["refused"])
    assert set(assembly["provenance"]) == {e["id"] for e in delta["entries"]}
    assert result["undecided"] == 1
    validate("facts-delta.schema.json", delta)
    assert simulate(root, run_dir / "facts-delta.json", run_dir)[1] == []


def test_holding_a_rule_back_keeps_the_table_whose_column_it_derives():
    """`_hold_back` — a record whose field is `derived` by the waiting rule
    keeps its place with the link left empty; a rule that READS the waiting
    rule waits with it."""
    from facts_plan.assemble import _hold_back
    table = {"id": "T-1", "kind": "record", "key": "gozaresh", "title": "گزارش",
             "_skeleton": "S-rec-1", "_unit": "u-a",
             "data": {"fields": [{"key": "masraf", "derived": {"ref": "T-2"}}]}}
    rule = {"id": "T-2", "kind": "rule", "key": "masraf_vaqei", "title": "مصرف",
            "_skeleton": "S-r-2", "_unit": "u-a", "data": {"inputs": []}}
    reader = {"id": "T-3", "kind": "rule", "key": "enheraf", "title": "انحراف",
              "_skeleton": "S-r-3", "_unit": "u-b",
              "data": {"calls": [{"ref": "T-2"}], "inputs": []}}
    state = {"undecided": [], "provenance": {"T-1": "u-a", "T-2": "u-a",
                                             "T-3": "u-b"}, "flags": []}
    kept = _hold_back([table, rule, reader], state, {"T-2": ["expr identifier x"]})
    assert [e["id"] for e in kept] == ["T-1"]
    assert table["data"]["fields"][0]["derived"] is None
    assert [(u["skeleton"], u["refused"][0][:9]) for u in state["undecided"]] == \
        [("S-r-2", "expr iden"), ("S-r-3", "waits for")]
    assert set(state["provenance"]) == {"T-1"}


def test_a_reference_tables_rows_follow_the_fields_renames(tmp_path):
    """The engine builds a reference table's rows and `primaryKey` over the
    same provisional `c_<letter>` keys its fields carry; when the unit renames
    the fields, the rows and the key rename with them — or the engine's own
    rows fail its own gate, which is what killed the raw-materials unit twice."""
    root = _root(tmp_path)
    _seed_units(root)
    skeleton = _skeleton()
    skeleton["candidates"][0]["payload"].update({
        "role": "reference", "primaryKey": ["c_h"],
        "fields": [{"key": "c_h", "title": "نام", "columns": {"pitza__s5": "H"}},
                   {"key": "c_i", "title": "وزن", "columns": {"pitza__s5": "I"}}],
        "rows": [{"key": "food_1", "c_h": "پنیر پیتزا ##1", "c_i": "250.0"}]})
    record = _record_out()
    record["decisions"][0]["data"] = {
        "role": "reference",
        "fields": [{"from": "c_h", "key": "nam", "type": "string"},
                   {"from": "c_i", "key": "vazn", "type": "number", "unit": "kg"}]}
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()}, skeleton=skeleton)
    assert validate_unit(root, run_dir, run_dir / "units" / "u-a" / "out.1.json") == []
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    table = next(e for e in delta["entries"] if e["kind"] == "record")
    assert table["data"]["primaryKey"] == ["nam"]
    assert table["data"]["rows"] == [{"key": "food_1", "nam": "پنیر پیتزا ##1",
                                      "vazn": "250.0"}]
    assert simulate(root, run_dir / "facts-delta.json", run_dir)[1] == []


def _twinned():
    """The skeleton and plan with a second rule candidate, `S-r-000000000004`,
    in u-a — the only shape in which two units can point `merge_into` at each
    other."""
    skeleton, plan = _skeleton(), _plan()
    twin = json.loads(json.dumps(skeleton["candidates"][1]))     # the rule
    twin["id"], twin["unit"] = "S-r-000000000004", "u-a"
    skeleton["candidates"].append(twin)
    plan["units"][0]["candidates"].append(twin["id"])
    return skeleton, plan


def test_merge_into_a_target_no_unit_kept_holds_the_merger_back(tmp_path):
    """I5 — the target is a rule of u-a's that u-a dropped. The merger waits in
    `undecided[]` naming what it waited for; until 2026-09-08 it stopped the
    whole run."""
    root = _root(tmp_path)
    skeleton, plan = _twinned()
    record = _record_out()
    record["decisions"].append({"skeleton": "S-r-000000000004", "action": "drop",
                                "reason_code": "cosmetic"})
    rule = _rule_out()
    rule["decisions"][0] = {"skeleton": "S-r-000000000002",
                            "action": "merge_into",
                            "into": "S-r-000000000004",
                            "reason_code": "duplicate"}
    run_dir = _run(root, {"u-a": record, "u-b": rule},
                   skeleton=skeleton, plan=plan)
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert {e["kind"] for e in delta["entries"]} == {"record", "item"}
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = next(u for u in assembly["undecided"]
                if u["skeleton"] == "S-r-000000000002")
    assert held["reason"] == "target_dropped" and held["unit"] == "u-b" \
        and held["waits_for"] == "S-r-000000000004" \
        and held["waits_for_unit"] == "u-a"
    validate("facts-delta.schema.json", delta)


def test_a_merge_into_cycle_holds_its_candidates_back_and_the_rest_lands(tmp_path):
    """I5 — two units each merge their rule into the other's. Nobody's target
    exists, so every candidate on the cycle waits and the record and the item
    still land."""
    root = _root(tmp_path)
    skeleton, plan = _twinned()
    record = _record_out()
    record["decisions"].append({"skeleton": "S-r-000000000004",
                                "action": "merge_into",
                                "into": "S-r-000000000002",
                                "reason_code": "duplicate"})
    rule = _rule_out()
    rule["decisions"][0] = {"skeleton": "S-r-000000000002",
                            "action": "merge_into",
                            "into": "S-r-000000000004",
                            "reason_code": "duplicate"}
    run_dir = _run(root, {"u-a": record, "u-b": rule},
                   skeleton=skeleton, plan=plan)
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert {e["kind"] for e in delta["entries"]} == {"record", "item"}
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    cycled = [u for u in assembly["undecided"] if u.get("reason") == "cycle"]
    assert sorted(u["skeleton"] for u in cycled) == \
        ["S-r-000000000002", "S-r-000000000004"]
    assert all(u["refused"][0].startswith("merge_into cycle across units")
               for u in cycled)
    validate("facts-delta.schema.json", delta)


def test_a_ref_to_an_entry_the_store_does_not_hold_waits(tmp_path):
    """I5 — an `F-` ref the store cannot answer is exempt at the unit gate
    (cross-store refs are), so it lands here. The note waits alone."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "note", "key": "x", "title": "پرسش دربارهٔ تلورانس",
                    "statement": "تلورانس انحراف هنوز تعیین نشده است.",
                    "data": {"about": [{"ref": "F-09999"}],
                             "question": "تلورانس چند گرم است؟"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert "note" not in {e["kind"] for e in delta["entries"]}
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = next(u for u in assembly["undecided"] if u["reason"] == "unknown_ref")
    assert held["refused"] == ["ref F-09999 is in no store entry"]
    validate("facts-delta.schema.json", delta)


def test_a_run_that_assembles_nothing_still_stops(tmp_path, capsys):
    """The one true stop (I5): u-a never returned, u-b kept only the rule that
    points at u-a's record, so the hold-back leaves nothing at all. Every
    held-back reason is printed."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][1] = {"skeleton": "S-i-000000000003", "action": "drop",
                            "reason_code": "cosmetic"}
    run_dir = _run(root, {"u-b": rule})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    assert "nothing assembled" in capsys.readouterr().err
    assert not (run_dir / "facts-delta.json").exists()


def test_a_run_that_drops_everything_says_why_it_stopped(tmp_path, capsys):
    """The stop printed one line per held-back candidate and, when nothing was
    held back at all, nothing: a run whose units dropped every candidate exited
    2 in silence and the playbook had no sentence to send."""
    root = _root(tmp_path)
    record, rule = _record_out(), _rule_out()
    record["decisions"] = [{"skeleton": "S-rec-000000000001", "action": "drop",
                            "reason_code": "cosmetic"}]
    rule["decisions"] = [{"skeleton": s, "action": "drop",
                          "reason_code": "cosmetic"}
                         for s in ("S-r-000000000002", "S-i-000000000003")]
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    assert "facts-plan: nothing assembled — 3 candidates, 0 held back" \
        in capsys.readouterr().err


def test_a_column_derived_by_a_waiting_rule_keeps_its_table(tmp_path):
    """The `_hold_back` sever, on `_resolve_refs`' path too: the rule waits for
    an `F-` ref no store entry carries, and the table whose column it computes
    lands with the link emptied instead of waiting with it."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["data"]["fields"][0]["derived"] = \
        {"ref": "S-r-000000000002"}
    rule = _rule_out()
    rule["decisions"][0]["data"]["inputs"][1] = {
        "key": "masraf_vaqei", "unit": "kg", "from": {"ref": "F-09999"}}
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    assert "enheraf" not in by_key                     # the rule waits
    assert by_key["gozaresh_shabane_pitza"]["data"]["fields"][0]["derived"] \
        is None
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [u["reason"] for u in assembly["undecided"]] == ["unknown_ref"]
    validate("facts-delta.schema.json", delta)


def test_an_oversized_attachment_is_named_to_the_owner(tmp_path):
    """`build` raises the issue; this is the other half — an attachment that
    fits in no unit is no candidate, so nothing else in the run would ever name
    it and `gate-b.md` said nothing about the file the unit was over budget
    for."""
    root = _root(tmp_path)
    skeleton = _skeleton()
    skeleton["issues"].append(
        {"kind": "oversized", "instance": None, "target": "forms/tahvil",
         "engine": True, "run_only": True,
         "description": "«forms/tahvil» بزرگ‌تر از آن است که در یک بخش از کار "
                        "جا شود؛ در این اجرا کنار گذاشته شد."})
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()},
                   skeleton=skeleton)
    assemble(root, run_dir)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert {"label": "forms/tahvil", "reason": "oversized", "skeleton": None,
            "kind": "attachment", "unit": None} in assembly["undecided"]
    gate = (run_dir / "gate-b.md").read_text(encoding="utf-8")
    assert "بزرگ‌تر از یک واحد" in gate
    assert "«forms/tahvil»" in gate


def _stop_sites(name):
    """Every stop left in one module: `(function, the ten source lines above
    the raise)`."""
    import facts_plan
    lines = (pathlib.Path(facts_plan.__file__).parent / name) \
        .read_text(encoding="utf-8").splitlines()
    out = []
    for n, line in enumerate(lines):
        if line.strip().startswith(("raise SystemExit(2)", "raise _fail(")):
            function = next(above[4:].split("(")[0]
                            for above in reversed(lines[:n])
                            if above.startswith("def "))
            out.append((function, "\n".join(lines[max(0, n - 10):n])))
    return out


def test_only_the_stops_the_design_keeps_are_left():
    """§3.2 — nine places used to stop a run for one input. Six are left in
    the four modules a run goes through, and each is an engine invariant, a
    run with nothing in it, or a defect the engine cannot work around. A new
    `raise` in any of them fails this test until the design says which row of
    the table it is."""
    kept = [("build.py", "plan_units", "candidate(s) in two units"),
            ("assemble.py", "_outputs", '{unit["id"]}: {message}'),
            ("assemble.py", "digest", "reviewed in slices"),
            ("assemble.py", "assemble",
             "A review's own rewrite is refused outright"),
            ("assemble.py", "assemble", "nothing assembled"),
            ("cli.py", "check_rebuild", "pass --rebuild to replace the plan")]
    found = [(module, function, context)
             for module in ("build.py", "assemble.py", "cli.py", "preflight.py")
             for function, context in _stop_sites(module)]
    assert [(m, f) for m, f, _ in found] == [(m, f) for m, f, _ in kept]
    for (_m, _f, fragment), (_, _, context) in zip(kept, found):
        assert fragment in context, fragment


def test_a_ref_into_a_dropped_candidate_holds_the_entry_back(tmp_path):
    """1a — the rule of one unit reads the record another unit threw away. No
    delta may carry a ref that resolves to nothing, so the rule waits in
    `undecided[]` naming the unit that dropped its target; the rest lands."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0] = {"skeleton": "S-rec-000000000001",
                              "action": "drop", "reason_code": "cosmetic"}
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"]] == ["item"]
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = next(u for u in assembly["undecided"] if u["unit"] == "u-b")
    assert held["waits_for"] == "S-rec-000000000001" \
        and held["waits_for_unit"] == "u-a"
    assert [d["skeleton"] for d in assembly["dropped"]] == ["S-rec-000000000001"]


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


def test_what_the_unit_gate_passes_is_never_refused_downstream(tmp_path):
    """I1 — a document `validate facts-unit` accepts is one `assemble` folds and
    `simulate` applies without a per-entry refusal. A refusal after the unit's
    gate is a defect, and this is the test that says so."""
    root = _root(tmp_path)
    _seed_units(root)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    for unit, name in (("u-a", "u-a"), ("u-b", "u-b")):
        assert validate_unit(root, run_dir,
                             run_dir / "units" / name / "out.1.json") == []
    assemble(root, run_dir)
    delta = run_dir / "facts-delta.json"
    validate("facts-delta.schema.json",
             json.loads(delta.read_text(encoding="utf-8")))
    _store, problems = simulate(root, delta, run_dir)
    assert problems == []


def test_a_messages_own_colon_dot_survives_the_rename():
    """`_renamed` tidies the seam it just made — `<label>:` followed by the
    path's leading `.` — and nothing else on the line. A rule text that carries
    a `:.` of its own keeps it."""
    from facts_plan.assemble import _renamed
    line = 'entries[0].data.location: does not match "^[a-z]+:.[a-z]+$"'
    assert _renamed(line, ["new[0] mande_shab"]) == \
        'new[0] mande_shab: data.location: does not match "^[a-z]+:.[a-z]+$"'


def test_the_sidecar_suffixes_are_the_ones_extract_attachment_writes():
    """`SIDECAR_TYPES` is `CONVERTERS` read backwards by hand — a suffix added
    on one side and not the other reads a real sidecar as a transcript."""
    from extract_attachment import CONVERTERS
    from facts_plan.assemble import SIDECAR_TYPES
    assert set(dict(SIDECAR_TYPES)) == set(CONVERTERS.values())


def test_an_attachment_sidecar_is_cited_by_the_kind_of_file_it_came_from(tmp_path):
    """Ruling 3 — a `.text/` sidecar cites `docx`/`pdf`/`photo` by its suffix;
    only a transcript is `voice`. A photographed form written up as a `new[]`
    record used to claim the meeting's audio as its evidence."""
    root = _root(tmp_path)
    sidecar = "departments/cooking/attachments/.text/form.image.md"
    plan, rule = _plan(), _rule_out()
    plan["units"][1]["inputs"] = [sidecar]
    rule["new"] = [_second_record(key="mande_shab")]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule}, plan=plan)
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "mande_shab")["source"] == \
        [{"type": "photo", "ref": sidecar}]

    plan["units"][1]["inputs"] = ["meetings/transcripts/c.txt#L1-L20"]
    (run_dir / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "mande_shab")["source"][0]["type"] == "voice"


def _tol_new(value):
    """A rule two units mint alike but for one number — step 7's `unit_drift`,
    which no source kind separates and only the reviewer settles (§2.6)."""
    return {"kind": "rule", "key": "tol", "title": "حد مجاز انحراف مصرف",
            "statement": "حد مجاز انحراف مصرف که سرآشپز تعیین کرده است.",
            "data": {"inputs": [],
                     "outputs": [{"key": "v", "title": "حد مجاز",
                                  "unit": "kg", "value": value}]}}


def _drifted_run(tmp_path):
    """A run whose two units read one transcript and wrote one rule a number
    apart, digested so a review may be folded onto it."""
    root = _root(tmp_path)
    record, rule = _record_out(), _rule_out()
    record["new"], rule["new"] = [_tol_new(6)], [_tol_new(5)]
    plan = _plan()
    plan["units"][0]["inputs"] = ["meetings/transcripts/c.txt#L1-L20"]
    run_dir = _run(root, {"u-a": record, "u-b": rule}, plan=plan)
    assert "unit_drift" in digest(root, run_dir).read_text(encoding="utf-8")
    return root, run_dir


def _contradiction(**over):
    return dict({"entry": {"kind": "rule", "key": "tol",
                           "scope": {"departments": ["cooking"], "branches": []}},
                 "action": "contradiction", "field": "data/outputs/v/value",
                 "reason": "واحد دوم عدد را درست خوانده است."}, **over)


def _tol(run_dir):
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    return next(e for e in delta["entries"] if e["key"] == "tol")


def test_contradiction_fix_sets_the_leaf(tmp_path):
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_contradiction(resolution="fix", value=5)])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    rule = _tol(run_dir)
    assert rule["data"]["outputs"][0]["value"] == 5
    assert "accounts" not in rule
    # The reviewer settles the leaf of the entry step 7 kept — it does not
    # unseat it, which is what a `contradiction` folded onto the decisions as
    # if it were a fifth action would do.
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["provenance"][rule["id"]] == "u-a"


def test_contradiction_account_writes_both_sides(tmp_path):
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_contradiction(resolution="account",
                                           reason="هر دو خوانش دفاع‌پذیر است.")])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    rule = _tol(run_dir)
    assert sorted(a["value"] for a in rule["accounts"]) == [5, 6]
    assert all(a["status"] == "open" and "id" not in a
               and a["speaker_role"] is None
               and a["field"] == "data/outputs/v/value"
               and a["source"]["type"] == "voice"
               for a in rule["accounts"])
    assert sorted(a["statement"][-1] for a in rule["accounts"]) == ["۵", "۶"]
    assert rule["data"]["outputs"][0]["value"] == 6      # the keeper's reading
    validate("facts-delta.schema.json",
             json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8")))


def _settled(resolution="fix", address=None):
    """One `unit_drift` and the `contradiction` that settles it, in the shapes
    `_cross_unit` and `_fold_review` build — `flag` deliberately a *different
    object* from the one in `state["flags"]`, because the digest's `_cross_unit`
    pass runs over a deep copy and that is the whole bug."""
    entry = {"kind": "rule", "key": "enheraf", "_unit": "u-a",
             "scope": {"departments": ["cooking"], "branches": []},
             "data": {"outputs": [{"key": "v", "unit": "g"}]}}
    where = {"kind": "rule", "key": "enheraf",
             "scope": {"departments": ["cooking"], "branches": []}}

    def drift():
        return {"code": "unit_drift", "id": "T-1", "message": "…",
                "entry": dict(where), "field": "data/outputs/v/unit",
                "sides": [{"unit": "u-a", "value": "g",
                           "source": {"type": "sheet", "ref": "x"}},
                          {"unit": "u-b", "value": "kg",
                           "source": {"type": "sheet", "ref": "x"}}]}

    decision = {"entry": address or dict(where), "action": "contradiction",
                "field": "data/outputs/v/unit", "resolution": resolution,
                "value": "kg"}
    return [entry], {"flags": [drift(), {"code": "duplicate_title", "id": "T-1",
                                         "message": "…"}],
                     "settled": [(drift(), decision)]}


def test_a_settled_drift_leaves_the_flags(tmp_path):
    from facts_plan.assemble import _settle
    entries, state = _settled()
    _settle(entries, state)
    assert entries[0]["data"]["outputs"][0]["unit"] == "kg"
    assert [f["code"] for f in state["flags"]] == ["duplicate_title"]


def test_a_contradiction_whose_address_the_review_renamed_is_named(capsys):
    from facts_plan.assemble import _settle
    entries, state = _settled(address={"kind": "rule", "key": "enheraf_now",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": []}})
    _settle(entries, state)
    err = capsys.readouterr().err
    assert "facts-plan: review: contradiction on rule/enheraf_now" in err
    assert "not settled" in err
    assert entries[0]["data"]["outputs"][0]["unit"] == "g"   # nothing settled
    assert len(state["flags"]) == 2                          # nothing dropped


def test_a_new_entry_is_referenceable_in_the_same_run(tmp_path):
    """§2.6 step 6's `N-<unit>-<n>` handle resolves like a skeleton id, so a
    unit can mint a `place` item and point at it — a record's `movement` ends
    are place items, and nothing in the sheets mints one."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["data"]["movement"] = {
        "from": {"ref": "N-u-b-0"},                      # another unit's new[]
        "reason": "باقی‌ماندهٔ لاین در پایان شب به انبار برگردانده می‌شود."}
    rule = _rule_out(new=[
        {"kind": "item", "key": "anbar_markazi", "title": "انبار مرکزی",
         "statement": "انباری که اقلام از آنجا به لاین‌ها تحویل می‌شود.",
         "data": {"category": "place", "unit": None}},
        {"kind": "note", "key": "note_placeholder", "title": "ساعت تحویل",
         "statement": "ساعت تحویل اقلام به انبار پرسیده نشده است.",
         "data": {"about": [{"ref": "N-u-b-0"}],          # its own unit's new[]
                  "question": "تحویل شبانه چه ساعتی انجام می‌شود؟"}}])
    run_dir = _run(root, {"u-a": record, "u-b": rule})

    assemble(root, run_dir)

    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    place = by_key["anbar_markazi"]
    assert by_key["gozaresh_shabane_pitza"]["data"]["movement"]["from"] \
        == {"ref": place["id"]}
    note = next(e for e in delta["entries"] if e["kind"] == "note")
    assert note["data"]["about"] == [{"ref": place["id"]}]
    validate("facts-delta.schema.json", delta)


def test_contradiction_on_a_field_with_no_drift_discards_the_review(tmp_path):
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_contradiction(field="data/outputs/v/unit",
                                           resolution="fix", value="kg")])
    assemble(root, run_dir, review=True)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["review_status"] == "discarded"
    assert _tol(run_dir)["data"]["outputs"][0]["value"] == 6


def test_the_review_gate_refuses_what_the_fold_would_discard(tmp_path):
    """I1 for the reviewer: `validate facts-unit review/out.json` names the
    decision the fold would discard the whole document for. The first real run
    lost fifteen sound decisions to two contradictions the digest never
    flagged, and nobody was told."""
    root, run_dir = _drifted_run(tmp_path)
    review = run_dir / "review" / "out.json"
    _write_review(run_dir, [
        {"entry": {"kind": "rule", "key": "nabud"}, "action": "keep",
         "key": "nabud", "title": "قاعدهٔ ناموجود",
         "statement": "قاعده‌ای که هیچ واحدی ننوشته است."},
        _contradiction(field="data/outputs/v/unit", resolution="fix",
                       value="kg")])
    assert validate_unit(root, run_dir, review) == [
        "decisions[0]: entry: rule nabud names 0 assembled entries",
        "decisions[1]: contradiction: no drift flag on data/outputs/v/unit "
        "for rule tol"]
    # The flagged field, addressed without a scope: admitted, then applied.
    settle = _contradiction(resolution="fix", value=5)
    settle["entry"] = {"kind": "rule", "key": "tol"}
    _write_review(run_dir, [settle])
    assert validate_unit(root, run_dir, review) == []
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    assert _tol(run_dir)["data"]["outputs"][0]["value"] == 5


def test_a_call_into_another_units_rule_is_not_an_undeclared_identifier(tmp_path):
    """A `calls[]` ref the gate cannot resolve becomes `T-0`, so every key that
    call declares read as undeclared — a rule the assembly and `simulate` both
    accept was refused at its own gate. An identifier nothing declares still is.
    """
    root = _root(tmp_path)
    _seed_units(root)
    record, rule = _record_out(), _rule_out()
    record["new"] = [_tol_new(5)]                       # u-a mints `tol`
    rule["decisions"][0]["data"]["expr"] = \
        "enheraf = masraf_vaqei - masraf_elami - tol"
    rule["decisions"][0]["data"]["calls"] = [{"ref": "N-u-a-0"}]
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    for unit in ("u-a", "u-b"):
        assert validate_unit(root, run_dir,
                             run_dir / "units" / unit / "out.1.json") == []
    assemble(root, run_dir)
    _store, problems = simulate(root, run_dir / "facts-delta.json", run_dir)
    assert problems == []

    del rule["decisions"][0]["data"]["calls"]
    path = run_dir / "units" / "u-b" / "out.1.json"
    path.write_text(json.dumps(rule, ensure_ascii=False), encoding="utf-8")
    assert any("'tol'" in p for p in validate_unit(root, run_dir, path))


def test_a_merge_into_across_kinds_is_refused_at_the_unit_gate(tmp_path):
    """I1 — `_absorb` moves `applies_to`/`instances` across verbatim, so a rule
    merged into a record mints a record `facts-delta.schema.json` refuses. The
    unit that wrote it is told while it still has an attempt, instead of the
    assembly dying on a shape nobody asked for."""
    root = _root(tmp_path)
    skeleton, plan = _skeleton(), _plan()
    twin = json.loads(json.dumps(skeleton["candidates"][1]))     # the rule
    twin["id"] = "S-r-000000000004"
    skeleton["candidates"].append(twin)
    plan["units"][1]["candidates"].append(twin["id"])
    rule = _rule_out()
    rule["decisions"].append(dict(rule["decisions"][0], skeleton=twin["id"]))
    rule["decisions"][0] = {"skeleton": "S-r-000000000002",
                            "action": "merge_into",
                            "into": "S-rec-000000000001",       # a record
                            "reason_code": "duplicate"}
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule},
                   skeleton=skeleton, plan=plan)
    path = run_dir / "units" / "u-b" / "out.1.json"
    assert any("decisions[0] S-r-000000000002" in p and "merge_into:" in p
               and "a rule cannot merge into a record" in p
               for p in validate_unit(root, run_dir, path))

    rule["decisions"][0]["into"] = twin["id"]                   # a rule
    path.write_text(json.dumps(rule, ensure_ascii=False), encoding="utf-8")
    assert validate_unit(root, run_dir, path) == []


def _review_keep(**field):
    """The reviewer rewriting the record's one column — the shape half of a
    review decision, which no unit gate ever sees."""
    return {"entry": {"kind": "record", "key": "gozaresh_shabane_pitza",
                      "scope": {"departments": ["cooking"],
                                "branches": ["chalebagh"]}},
            "action": "keep", "key": "gozaresh_shabane_pitza",
            "title": "گزارش شبانهٔ لاین پیتزا",
            "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
            "data": {"fields": [dict({"from": "c_h", "key": "masraf_elami"},
                                     **field)]}}


def test_the_review_is_held_to_the_store_contract_too(tmp_path, capsys):
    """Ruling 5 — the review is the one document no unit gate ever saw, so the
    shape check hangs where the assembly reads it: nothing is written and the
    line names the field."""
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_review_keep(type="text")])
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir, review=True)
    assert excinfo.value.code == 2
    assert "data.fields[0].type" in capsys.readouterr().err
    assert not (run_dir / "facts-delta.json").is_file()

    _write_review(run_dir, [_review_keep(type="number")])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"


def test_the_review_gate_holds_the_folded_result_to_the_store_contract(tmp_path):
    """The owner's 2026-09-08 run: the reviewer's document passed its gate,
    then `assemble --review` refused sixteen items — a refusal the reviewer
    never saw while it had an attempt. The gate now folds and lints exactly
    as the assembly does, under the same `review: <key>` labels."""
    root, run_dir = _drifted_run(tmp_path)
    review = run_dir / "review" / "out.json"
    _write_review(run_dir, [_review_keep(type="text")])
    lines = validate_unit(root, run_dir, review)
    assert any(l.startswith("review: gozaresh_shabane_pitza:")
               and "data.fields[0].type" in l for l in lines), lines
    _write_review(run_dir, [_review_keep(type="number")])
    assert validate_unit(root, run_dir, review) == []


def test_a_review_keep_with_partial_data_keeps_the_units_other_members(tmp_path):
    """A reviewer rewriting one member of an item's `data` (its unit) must not
    lose the unit's `category`: `data` merges member by member, as a unit's
    decision merges over a skeleton's payload."""
    root = _root(tmp_path)
    _seed_units(root)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "item", "key": "item_1"},
                             "action": "keep", "key": "item_1",
                             "title": "پنیر پیتزا",
                             "statement": "پنیر پیتزا که با کیلوگرم شمرده می‌شود.",
                             "data": {"unit": {"value": "g", "inferred": True}}}])
    assert validate_unit(root, run_dir, run_dir / "review" / "out.json") == []
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    item = next(e for e in delta["entries"] if e["kind"] == "item")
    assert item["data"]["category"] == "ingredient" and item["data"]["unit"] == "g"
    assert item["field_status"]["data/unit"] == "inferred"
