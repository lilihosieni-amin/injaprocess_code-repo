"""`facts-plan digest | assemble` (§2.6) — the nine steps over a two-unit run:
the delta, `assembly.json` and the owner's `gate-b.md`.

The skeleton and the units' documents are synthetic (T14's style), but every
shape here is one the landed contracts accept: `facts-unit.schema.json` for a
unit's output, `facts-delta.schema.json` for what `assemble` writes, and
`merge_facts.apply.simulate` for what `apply` would then do with it.
"""
import copy
import hashlib
import json
import pathlib
import re

import pytest
from facts_helpers import _seed_units
from facts_plan.assemble import (_resolve_refs, assemble, derive_home,
                                 digest, phase_entries, validate_unit)
from facts_plan.build import PLAN_CONTRACT
from merge_facts import tiers
from merge_facts.apply import simulate

from engine_common import validate


def _root(tmp_path):
    (tmp_path / "facts").mkdir()
    for name in ("records", "measurements", "rules", "notes"):
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
                # Nothing in the sheets mints a measurement candidate, but
                # a unit writes measurements and every step below treats one
                # exactly as it treats a record or a rule — so the third
                # candidate of this run is one. A skeleton id carries the
                # prefix of the pass that minted it and says nothing about the
                # kind; `kind` does.
                {"id": "S-r-000000000003", "kind": "measurement", "unit": "u-b",
                 "payload": {}, "render": {"name": "وزن پنیر"}}]}


def _plan():
    return {"schema_version": 1, "department": "cooking", "hashes": {},
            "units": [{"id": u, "type": "workbook", "inputs": i, "nodes": [],
                       "candidates": c, "est_tokens_in": 1, "est_tokens_out": 1}
                      for u, i, c in (
                          ("u-a", [], ["S-rec-000000000001"]),
                          ("u-b", ["meetings/transcripts/c.txt#L1-L20"],
                           ["S-r-000000000002", "S-r-000000000003"]))]}


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
               {"skeleton": "S-r-000000000003", "action": "keep",
                "key": "vazn_panir", "title": "وزن پنیر پیتزا",
                "statement": "پنیر پیتزا با کیلوگرم وزن می‌شود.",
                "data": {"quantity": "mass",
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
    assert by_key["vazn_panir"]["field_status"] == {"data/unit": "inferred"}
    assert by_key["vazn_panir"]["data"]["unit"] == "kg"
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
        [("record", "T-1"), ("measurement", "T-2")]


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
        {"skeleton": "S-r-000000000003", "action": "split", "reason_code": "other",
         "into": [{"key": "vazn_panir", "title": "وزن پنیر پیتزا",
                   "statement": "پنیر پیتزا با کیلوگرم وزن می‌شود.",
                   "data": {"quantity": "mass", "unit": "kg"},
                   "takes": ["pitza__s5"]},
                  {"key": "vazn_panir_varaqei", "title": "وزن پنیر ورقه‌ای",
                   "statement": "پنیر ورقه‌ای با بسته شمرده می‌شود.",
                   "data": {"quantity": "count", "unit": "pack"},
                   "takes": ["pitza__s6"]}]}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert sorted(e["key"] for e in delta["entries"]
                  if e["kind"] == "measurement") == \
        ["vazn_panir", "vazn_panir_varaqei"]


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
    assert [e["kind"] for e in delta["entries"]] == \
        ["record", "measurement", "rule"]
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


def test_a_refused_decision_waits_and_the_assembly_lands(tmp_path):
    """F3 — a decision its gate refuses (here a key no repair makes valid)
    costs that decision: its candidate waits under `refused`, the rest lands."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0]["key"] = "Enheraf!"
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert "enheraf!" not in {e["key"] for e in delta["entries"]}
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(u["skeleton"], u["reason"]) for u in assembly["undecided"]] == \
        [("S-r-000000000002", "refused")]


def test_the_reviewers_own_prose_is_linted_too(tmp_path):
    """Step 8 is the only gate the review passes through. B38: a cell named in
    prose is a style note, so the review's rewrite is stored, not held back."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": ["chalebagh"]}},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف مصرف",
                             "statement": "انحراف در ستون J6:J15 است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["statement"] == "انحراف در ستون J6:J15 است."


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


def test_a_stale_review_stops_the_assembly(tmp_path):
    """R3 — a digest the review no longer matches is redone, never skipped."""
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
    (run_dir / "facts-delta.json").unlink()
    with pytest.raises(SystemExit) as exc:
        assemble(root, run_dir, review=True)
    assert exc.value.code == 2
    assert not (run_dir / "facts-delta.json").exists()
    assert "the digest changed since this review was written" in " ".join(
        tiers.lines(validate_unit(root, run_dir, run_dir / "review" / "out.json")))


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


def test_a_review_address_hitting_nothing_is_held_back_on_its_own(tmp_path):
    """R1 — the bad address is one decision's mistake, not the document's: the
    good decision beside it still lands."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": []}},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف دیگر",
                             "statement": "انحراف مصرف اعلامی است."},
                            {"entry": {"kind": "rule", "key": "enheraf"},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف دیگر",
                             "statement": "انحراف مصرف اعلامی است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف دیگر"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] == [(0, "no_match")]
    assert assembly["review_held"][0]["label"] == "rule enheraf"


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
    problems = tiers.lines(tiers.refusals(validate_unit(root, run_dir, path)))
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


def test_a_measurement_of_words_lands_as_words(tmp_path):
    """What a measurement is `of` may be a ref **or the words** for what it
    measures (spec 2026-09-16 §3.2, `refOrText`). Words are no attachment and
    no table derives from them — but they must survive the walk and reach the
    delta as written, which is what the real cooking run fell over."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "measurement", "key": "vazn_morgh",
                    "title": "وزن مرغ", "statement": "مرغ را انباردار می‌کشد.",
                    "data": {"quantity": "mass", "unit": "kg", "of": "وزن مرغ",
                             "by": "انباردار", "when": "هر شب"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assert "vazn_morgh" in digest(root, run_dir).read_text(encoding="utf-8")
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    measurement = next(e for e in delta["entries"] if e["kind"] == "measurement")
    assert measurement["data"]["of"] == "وزن مرغ"
    assert measurement.get("home") is None
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
    """One `new[]` entry the reviewer reads as two — split over the pseudo
    candidate, whose payload each part is written over."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["new"] = [{"kind": "measurement", "key": "vazn_panir_line",
                    "title": "وزن پنیر لاین",
                    "statement": "پنیر لاین پیتزا هر شب وزن می‌شود.",
                    "data": {"quantity": "mass", "unit": "kg"}}]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "measurement",
                                       "key": "vazn_panir_line",
                                       "scope": {"departments": ["cooking"],
                                                 "branches": []}},
                             "action": "split", "reason_code": "other",
                             "into": [
                                 {"key": "vazn_panir_pitza",
                                  "title": "وزن پنیر پیتزا",
                                  "statement": "پنیر پیتزا با کیلوگرم وزن "
                                               "می‌شود.",
                                  "takes": ["x"],
                                  "data": {"quantity": "mass", "unit": "kg"}},
                                 {"key": "shomaresh_panir_varaqei",
                                  "title": "شمارش پنیر ورقه‌ای",
                                  "statement": "پنیر ورقه‌ای با بسته شمرده "
                                               "می‌شود.",
                                  "takes": ["x"],
                                  "data": {"quantity": "count",
                                           "unit": "pack"}}]}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    parts = {e["key"]: e for e in delta["entries"]
             if e["kind"] == "measurement"}
    assert "vazn_panir_line" not in parts
    assert parts["vazn_panir_pitza"]["data"]["unit"] == "kg"
    assert parts["shomaresh_panir_varaqei"]["data"]["unit"] == "pack"


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
    assert "template_split · T-1 · T-1 (gozaresh_shabane_pitza) and T-2 " \
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
    assert [e["kind"] for e in delta["entries"]] == ["measurement"]  # rule waits
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
    # B1 — the undeclared identifier is a note: the rule lands, its expr marked.
    rule = next(e for e in delta["entries"] if e["key"] == "enheraf")
    assert rule["field_status"]["data/expr"] == "inferred"
    assert result["undecided"] == 0
    validate("facts-delta.schema.json", delta)
    assert tiers.refusals(simulate(root, run_dir / "facts-delta.json", run_dir)[1]) == []


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
    assert {e["kind"] for e in delta["entries"]} == {"record", "measurement"}
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = next(u for u in assembly["undecided"]
                if u["skeleton"] == "S-r-000000000002")
    assert held["reason"] == "target_dropped" and held["unit"] == "u-b" \
        and held["waits_for"] == "S-r-000000000004" \
        and held["waits_for_unit"] == "u-a"
    validate("facts-delta.schema.json", delta)


def test_a_merge_into_cycle_holds_its_candidates_back_and_the_rest_lands(tmp_path):
    """I5 — two units each merge their rule into the other's. Nobody's target
    exists, so every candidate on the cycle waits and the record and the
    measurement still land."""
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
    assert {e["kind"] for e in delta["entries"]} == {"record", "measurement"}
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
    rule["decisions"][1] = {"skeleton": "S-r-000000000003", "action": "drop",
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
                         for s in ("S-r-000000000002", "S-r-000000000003")]
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    with pytest.raises(SystemExit) as excinfo:
        assemble(root, run_dir)
    assert excinfo.value.code == 2
    assert "facts-plan: nothing assembled — 3 candidates, 0 held back" \
        in capsys.readouterr().err


def test_a_column_derived_by_a_waiting_rule_keeps_its_table(tmp_path):
    """The `_hold_back` sever, on `_resolve_refs`' path too: the rule waits for
    a candidate its unit dropped, and the table whose column it computes lands
    with the link emptied instead of waiting with it. (An `F-` ref no store
    entry carries is severed, not waited on — C29, final review I-2.)"""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["data"]["fields"][0]["derived"] = \
        {"ref": "S-r-000000000002"}
    rule = _rule_out()
    rule["decisions"][0]["data"]["inputs"][1] = {
        "key": "masraf_vaqei", "unit": "kg", "from": {"ref": "S-r-000000000003"}}
    rule["decisions"][1] = {"skeleton": "S-r-000000000003", "action": "drop",
                            "reason_code": "cosmetic"}
    run_dir = _run(root, {"u-a": record, "u-b": rule})
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    assert "enheraf" not in by_key                     # the rule waits
    assert by_key["gozaresh_shabane_pitza"]["data"]["fields"][0]["derived"] \
        is None
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [u["reason"] for u in assembly["undecided"]] == ["waits"]
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
    """§3.2 — nine places used to stop a run for one input. Eight are left in
    the four modules a run goes through, and each is an engine invariant, a
    run with nothing in it, or a defect the engine cannot work around. A new
    `raise` in any of them fails this test until the design says which row of
    the table it is.

    v3.8 traded one for three: the review's own rewrite is no longer refused
    outright (R1 holds that decision back), a stale digest stops the run
    instead of being skipped (R3), and a `review:` line no decision owns is a
    defect of the fold loop that would otherwise spin."""
    kept = [("build.py", "plan_units", "candidate(s) in two units"),
            ("assemble.py", "_outputs", '{unit["id"]}: {message}'),
            ("assemble.py", "_fold_review",
             "review: the digest changed since this review was"),
            ("assemble.py", "digest", "reviewed in slices"),
            ("assemble.py", "assemble", "No decision owns the line"),
            ("assemble.py", "assemble", "len(held) == len(entries)"),
            ("assemble.py", "assemble", "nothing assembled"),
            ("cli.py", "check_rebuild", "pass --rebuild to replace the plan")]
    found = [(module, function, context)
             for module in ("build.py", "assemble.py", "cli.py", "preflight.py")
             for function, context in _stop_sites(module)]
    # The context is compared in the same breath as the module and the
    # function: three of the eight rows are `("assemble.py", "assemble")`, so
    # the pair alone cannot tell them apart or catch two of them swapping.
    assert len(found) == len(kept), [(m, f) for m, f, _c in found]
    assert [(m2, f2, fragment in context)
            for (_m, _f, fragment), (m2, f2, context) in zip(kept, found)] == \
        [(m, f, True) for m, f, _c in kept]


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
    assert [e["kind"] for e in delta["entries"]] == ["measurement"]
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    held = next(u for u in assembly["undecided"] if u["unit"] == "u-b")
    assert held["waits_for"] == "S-rec-000000000001" \
        and held["waits_for_unit"] == "u-a"
    assert [d["skeleton"] for d in assembly["dropped"]] == ["S-rec-000000000001"]


def test_a_unit_that_spent_both_attempts_leaves_undecided_candidates(tmp_path):
    """A candidate a unit left undecided waits on its own (A17, a note); the
    unit's other decision lands."""
    root = _root(tmp_path)
    broken = _rule_out()
    broken["decisions"] = broken["decisions"][:1]  # its measurement is undecided
    run_dir = _run(root, {"u-a": _record_out(), "u-b": broken})
    (run_dir / "units" / "u-b" / "out.2.json").write_text(
        json.dumps(broken, ensure_ascii=False), encoding="utf-8")
    assemble(root, run_dir)
    doc = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(u["skeleton"], u["reason"]) for u in doc["undecided"]] == \
        [("S-r-000000000003", "not_decided")]


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
    unit can mint a form the meetings describe and point at it — a record's
    `movement` ends are records of their own, and nothing in the sheets mints
    the paper one."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["data"]["movement"] = {
        "from": {"ref": "N-u-b-0"},                      # another unit's new[]
        "reason": "باقی‌ماندهٔ لاین در پایان شب به انبار برگردانده می‌شود."}
    rule = _rule_out(new=[
        {"kind": "record", "key": "daftar_anbar_markazi",
         "title": "دفتر انبار مرکزی",
         "statement": "دفتر کاغذی انبار مرکزی که تحویل هر قلم به لاین‌ها در آن "
                      "نوشته می‌شود.",
         "data": {"medium": "paper", "role": "log",
                  "location": {"kept_at": "انبار مرکزی",
                               "holder": "انباردار"}}},
        {"kind": "note", "key": "note_placeholder", "title": "ساعت تحویل",
         "statement": "ساعت تحویل اقلام به انبار پرسیده نشده است.",
         "data": {"about": [{"ref": "N-u-b-0"}],          # its own unit's new[]
                  "question": "تحویل شبانه چه ساعتی انجام می‌شود؟"}}])
    run_dir = _run(root, {"u-a": record, "u-b": rule})

    assemble(root, run_dir)

    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    place = by_key["daftar_anbar_markazi"]
    assert by_key["gozaresh_shabane_pitza"]["data"]["movement"]["from"] \
        == {"ref": place["id"]}
    note = next(e for e in delta["entries"] if e["kind"] == "note")
    assert note["data"]["about"] == [{"ref": place["id"]}]
    validate("facts-delta.schema.json", delta)


def test_contradiction_on_a_field_with_no_drift_is_held_back(tmp_path):
    """R1 `no_drift` — the reviewer settled a field no flag named."""
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_contradiction(field="data/outputs/v/unit",
                                           resolution="fix", value="kg")])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["action"], r["reason"]) for r in assembly["review_held"]] \
        == [(0, "contradiction", "no_drift")]
    assert assembly["review_held"][0]["label"] == "حد مجاز انحراف مصرف"
    assert assembly["review_held"][0]["lines"]
    assert _tol(run_dir)["data"]["outputs"][0]["value"] == 6


def test_the_review_gate_refuses_what_the_fold_would_discard(tmp_path):
    """I1 for the reviewer: `validate facts-unit review/out.json` names the
    decision the fold would hold back. The first real run lost fifteen sound
    decisions to two contradictions the digest never flagged, and nobody was
    told."""
    root, run_dir = _drifted_run(tmp_path)
    review = run_dir / "review" / "out.json"
    _write_review(run_dir, [
        {"entry": {"kind": "rule", "key": "nabud"}, "action": "keep",
         "key": "nabud", "title": "قاعدهٔ ناموجود",
         "statement": "قاعده‌ای که هیچ واحدی ننوشته است."},
        _contradiction(field="data/outputs/v/unit", resolution="fix",
                       value="kg")])
    assert tiers.lines(validate_unit(root, run_dir, review)) == [
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
    assert any("'tol'" in p for p in tiers.lines(validate_unit(root, run_dir, path)))


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
               for p in tiers.lines(tiers.refusals(validate_unit(root, run_dir, path))))

    rule["decisions"][0]["into"] = twin["id"]                   # a rule
    path.write_text(json.dumps(rule, ensure_ascii=False), encoding="utf-8")
    assert validate_unit(root, run_dir, path) == []


def _review_keep(**data):
    """The reviewer rewriting a member of the record's `data` — the shape half
    of a review decision, which no unit gate ever sees."""
    return {"entry": {"kind": "record", "key": "gozaresh_shabane_pitza",
                      "scope": {"departments": ["cooking"],
                                "branches": ["chalebagh"]}},
            "action": "keep", "key": "gozaresh_shabane_pitza",
            "title": "گزارش شبانهٔ لاین پیتزا",
            "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
            "data": dict(data)}


def test_the_review_is_held_to_the_store_contract_too(tmp_path):
    """Ruling 5 — the review is the one document no unit gate ever saw, so the
    shape check hangs where the assembly reads it. R2: the line names the
    field, the decision is held back, and the unit's record stands."""
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_review_keep(role="ledger")])
    # C13 — an off-list role is stored as written and marked inferred.
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    record = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert record["data"]["role"] == "ledger"
    assert record["field_status"]["data/role"] == "inferred"

    _write_review(run_dir, [_review_keep(role="report")])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"


def test_a_review_decision_that_would_break_the_store_waits_alone(tmp_path):
    """Spec 2026-09-13 F3 at step 8, with a trigger that stays REFUSE: a
    number where the ladder and the panel iterate the `fields` list (C8, R2).
    That one review decision is held back with its lines; the unit's record
    stands and the review's other decision still folds."""
    root, run_dir = _drifted_run(tmp_path)
    _write_review(run_dir, [_review_keep(fields=7),
                            _contradiction(resolution="fix", value=5)])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] == [(0, "refused")]
    assert any("fields" in line for line in assembly["review_held"][0]["lines"])
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    record = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert [f["key"] for f in record["data"]["fields"]] == ["masraf_elami"]
    assert _tol(run_dir)["data"]["outputs"][0]["value"] == 5


def test_the_review_gate_holds_the_folded_result_to_the_store_contract(tmp_path):
    """The owner's 2026-09-08 run: the reviewer's document passed its gate,
    then `assemble --review` refused sixteen entries — a refusal the reviewer
    never saw while it had an attempt. The gate now folds and lints exactly
    as the assembly does, under the same `review: <key>` labels."""
    root, run_dir = _drifted_run(tmp_path)
    review = run_dir / "review" / "out.json"
    _write_review(run_dir, [_review_keep(role="ledger")])
    found = validate_unit(root, run_dir, review)
    assert tiers.refusals(found) == []                          # C13: a note
    assert any(f.label.startswith("review: gozaresh_shabane_pitza")
               for f in tiers.notes(found)), found
    _write_review(run_dir, [_review_keep(role="report")])
    assert validate_unit(root, run_dir, review) == []


def test_a_review_keep_with_partial_data_keeps_the_units_other_members(tmp_path):
    """A reviewer rewriting one member of a measurement's `data` (its unit)
    must not lose the unit's `quantity`: `data` merges member by member, as a
    unit's decision merges over a skeleton's payload."""
    root = _root(tmp_path)
    _seed_units(root)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "measurement", "key": "vazn_panir"},
                             "action": "keep", "key": "vazn_panir",
                             "title": "وزن پنیر پیتزا",
                             "statement": "پنیر پیتزا با گرم وزن می‌شود.",
                             "data": {"unit": {"value": "g", "inferred": True}}}])
    assert validate_unit(root, run_dir, run_dir / "review" / "out.json") == []
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    entry = next(e for e in delta["entries"] if e["kind"] == "measurement")
    assert entry["data"]["quantity"] == "mass" and entry["data"]["unit"] == "g"
    assert entry["field_status"]["data/unit"] == "inferred"


def test_a_keep_the_contract_refuses_is_held_back_and_the_unit_s_version_kept(tmp_path):
    """R2: the cooking review lost 22 decisions to sixteen entries the fold could
    not store. The decision that fails the lint is held back; the rest apply."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [
        {"entry": {"kind": "rule", "key": "enheraf"}, "action": "keep",
         "key": "enheraf", "title": "انحراف مصرف",
         "statement": "انحراف مصرف برابر است با J6."},          # a cell reference
        {"entry": {"kind": "record", "key": "gozaresh_shabane_pitza"},
         "action": "keep", "key": "gozaresh_shabane_pitza",
         "title": "گزارش شبانهٔ پیتزا",
         "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند."}])
    # B38 — a cell named in prose is a note: both rewrites apply.
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    assert by_key["enheraf"]["statement"] == "انحراف مصرف برابر است با J6."
    assert by_key["gozaresh_shabane_pitza"]["title"] == "گزارش شبانهٔ پیتزا"


def test_a_fields_rewrite_from_the_review_is_held_back(tmp_path):
    """R1 `fields_rewrite`: the accounting review of 2026-09-09."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [
        {"entry": {"kind": "record", "key": "gozaresh_shabane_pitza"},
         "action": "keep", "key": "gozaresh_shabane_pitza",
         "title": "گزارش شبانهٔ پیتزا",
         "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
         "data": {"fields": [{"from": "masraf_elami", "unit": "kg"}]}}])
    lines = tiers.lines(validate_unit(root, run_dir, run_dir / "review" / "out.json"))
    assert lines == ["decisions[0]: fields: a review does not rewrite a record's "
                     "fields (the digest shows minted keys, not column keys)"]
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["review_held"][0]["reason"] == "fields_rewrite"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rec = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert rec["title"] == "گزارش شبانهٔ لاین پیتزا"          # the unit's title


def test_a_review_with_nothing_held_is_applied_and_review_held_is_empty(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf"},
                             "action": "keep", "key": "enheraf",
                             "title": "انحراف دیگر",
                             "statement": "انحراف مصرف اعلامی است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["review_held"] == []


def test_a_review_naming_a_skeleton_no_unit_decided_is_held_back(tmp_path):
    """R1 `unknown_skeleton` — the reviewer addressed a candidate whose unit
    never returned, so there is no decision of this run to rewrite."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-b": _rule_out()})          # u-a never returned
    digest(root, run_dir)
    _write_review(run_dir, [{"skeleton": "S-rec-000000000001", "action": "keep",
                             "key": "gozaresh_shabane_pitza",
                             "title": "گزارش شبانهٔ پیتزا",
                             "statement": "جدولی که سرلاین پیتزا هر شب پر "
                                          "می‌کند."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] \
        == [(0, "unknown_skeleton")]
    assert assembly["review_held"][0]["label"] == "پیتزا"


def test_a_review_address_naming_two_entries_is_ambiguous(tmp_path):
    """R1 `ambiguous` — kind + key alone names two assembled entries, one per
    scope, so the fold cannot know which the reviewer meant."""
    root = _root(tmp_path)
    record, rule = _record_out(), _rule_out()
    # One `new[]` rule per unit under one key but two scopes: the record's unit
    # writes it department-wide, the rule's unit onto the chalebagh tab.
    record["new"] = [_tol_new(6)]
    rule["new"] = [dict(_tol_new(6), branches=["chalebagh"])]
    plan = _plan()
    plan["units"][0]["inputs"] = ["meetings/transcripts/c.txt#L1-L20"]
    run_dir = _run(root, {"u-a": record, "u-b": rule}, plan=plan)
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "tol"},
                             "action": "keep", "key": "tol",
                             "title": "حد مجاز انحراف",
                             "statement": "حد مجاز انحراف را سرآشپز تعیین "
                                          "می‌کند."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] \
        == [(0, "ambiguous")]
    assert assembly["review_held"][0]["label"] == "rule tol"


def test_a_merge_into_whose_target_is_gone_is_held_back(tmp_path):
    """R1 — a `merge_into` is judged on both halves of its address."""
    root, run_dir, note = _run_with_a_note(tmp_path)
    _write_review(run_dir, [{"entry": {"kind": "note", "key": note["key"],
                                       "scope": note["scope"]},
                             "action": "merge_into", "reason_code": "duplicate",
                             "into": {"kind": "rule", "key": "nabud"}}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert [e["kind"] for e in delta["entries"] if e["kind"] == "note"] == ["note"]
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["action"], r["reason"]) for r in assembly["review_held"]] \
        == [(0, "merge_into", "no_match")]
    assert assembly["review_held"][0]["label"] == "پرسش دربارهٔ تلورانس"


def test_a_review_merge_into_that_breaks_its_target_is_held_back(tmp_path):
    """R2 — the entry a `merge_into` changes is the target, not the source the
    merge absorbs away: a target the merge makes unstorable holds that decision
    back and returns to the unit's version, instead of the unit being blamed
    for the reviewer's merge and losing its record to `undecided[]`."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    # A rule merged into a record: `_absorb` moves the rule's `applies_to` onto
    # the record, which `recordData` has no room for. The unit gate refuses this
    # across kinds; a review addresses assembled entries, so it reaches here.
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf"},
                             "action": "merge_into", "reason_code": "duplicate",
                             "into": {"kind": "record",
                                      "key": "gozaresh_shabane_pitza"}}])
    # C5 — `applies_to` on a record is an unknown member: kept in `extra`.
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    record = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert "applies_to" not in record["data"]
    assert any(path.startswith("data/applies_to") for path in record.get("extra") or {})


def test_one_key_in_two_scopes_blames_only_the_decision_that_failed(tmp_path):
    """The lint labels an entry `review: <key>`, and two reviewed entries may
    mint one key in two scopes — so the label carries the scope when the key
    alone would name both, and the sound decision is not held back beside the
    failing one."""
    root = _root(tmp_path)
    record, rule = _record_out(), _rule_out()
    record["new"] = [_tol_new(6)]                              # department-wide
    rule["new"] = [dict(_tol_new(6), branches=["chalebagh"])]  # one tab
    plan = _plan()
    plan["units"][0]["inputs"] = ["meetings/transcripts/c.txt#L1-L20"]
    run_dir = _run(root, {"u-a": record, "u-b": rule}, plan=plan)
    digest(root, run_dir)
    _write_review(run_dir, [
        {"entry": {"kind": "rule", "key": "tol",
                   "scope": {"departments": ["cooking"], "branches": []}},
         "action": "keep", "key": "tol", "title": "حد مجاز انحراف",
         "statement": "حد مجاز انحراف در J6 است."},           # a cell reference
        {"entry": {"kind": "rule", "key": "tol",
                   "scope": {"departments": ["cooking"],
                             "branches": ["chalebagh"]}},
         "action": "keep", "key": "tol", "title": "حد مجاز انحراف چاله‌باغ",
         "statement": "حد مجاز انحراف مصرف را سرآشپز تعیین می‌کند."}])
    # B38 — the cell reference is a note, so neither decision is held back.
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    titles = {json.dumps(e["scope"], sort_keys=True): e["title"]
              for e in delta["entries"] if e["key"] == "tol"}
    assert titles == {
        '{"branches": [], "departments": ["cooking"]}': "حد مجاز انحراف",
        '{"branches": ["chalebagh"], "departments": ["cooking"]}':
            "حد مجاز انحراف چاله‌باغ"}


def test_a_settled_contradiction_that_breaks_the_contract_is_held_back(tmp_path):
    """R2 — the entry a `contradiction` settles is the review's to answer for
    too: the reviewer's own value broke the contract, so that decision is held
    back and the leaf keeps the reading the units agreed to keep."""
    root = _root(tmp_path)
    record, rule = _record_out(), _rule_out()
    record["new"] = [_tol_new(6)]                       # u-a reads the unit kg
    drifted = _tol_new(6)
    drifted["data"]["outputs"][0]["unit"] = "pack"      # u-b reads it as pack
    rule["new"] = [drifted]
    plan = _plan()                     # both units read the same transcript
    plan["units"][0]["inputs"] = ["meetings/transcripts/c.txt#L1-L20"]
    run_dir = _run(root, {"u-a": record, "u-b": rule}, plan=plan)
    assert "unit_drift" in digest(root, run_dir).read_text(encoding="utf-8")
    _write_review(run_dir, [_contradiction(field="data/outputs/v/unit",
                                           resolution="fix", value="lb")])
    # C28 — an undeclared symbol is stored as written with a note.
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    assert _tol(run_dir)["data"]["outputs"][0]["unit"] == "lb"


def test_an_unparseable_review_file_is_held_back_whole_and_named(tmp_path):
    """The other half of the same failure class: a truncated or fenced
    `out.json` used to raise `json.JSONDecodeError` with a traceback. It is
    one fallback row now, and the units' work still lands."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    (run_dir / "review" / "out.json").write_text(
        '{"schema_version": 1, "unit": "review", "decisions": [', encoding="utf-8")
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"], r["label"]) for r in assembly["review_held"]] \
        == [(0, "refused", "—")]
    assert assembly["review_held"][0]["lines"]
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف مصرف"


@pytest.mark.parametrize("bad", [
    # a `contradiction` addressed by `skeleton`: the schema requires `entry`
    {"skeleton": "S-r-000000000002", "action": "contradiction",
     "field": "data/outputs/v/value", "resolution": "fix", "value": 5},
    # neither `entry` nor `skeleton`, so nothing says what it decides
    {"action": "keep", "key": "enheraf", "title": "انحراف تازه",
     "statement": "انحراف مصرف اعلامی است."},
    # a `contradiction` with no `field`: the fold read `decision["field"]` bare
    {"entry": {"kind": "rule", "key": "enheraf"}, "action": "contradiction",
     "resolution": "fix", "value": 5}])
def test_a_schema_invalid_review_decision_is_held_back_alone_and_named(tmp_path, bad):
    """R8 hands the fold the reviewer's second failure, so a document the schema
    refuses is what `assemble --review` must survive. A41: each decision is held
    to the schema on its own, so only the failing one is held back under its
    line, the sound one folds, and nothing raises."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [bad, {"entry": {"kind": "rule", "key": "enheraf"},
                                  "action": "keep", "key": "enheraf",
                                  "title": "انحراف دیگر",
                                  "statement": "انحراف مصرف اعلامی است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] \
        == [(0, "refused")]
    assert all(r["lines"] and r["label"] for r in assembly["review_held"])
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"]
                if e["key"] == "enheraf")["title"] == "انحراف دیگر"   # the review's


def test_a_merge_into_a_skeleton_no_unit_kept_is_held_back(tmp_path):
    """`into` may be a bare skeleton id too. One naming a candidate this run did
    not keep used to fold happily and then die in step 3 as `target_dropped`,
    blamed on the unit that wrote the source and taking its entry with it."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][1] = {"skeleton": "S-r-000000000003", "action": "drop",
                            "reason_code": "cosmetic"}
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf"},
                             "action": "merge_into", "reason_code": "duplicate",
                             "into": "S-r-000000000003"}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] \
        == [(0, "unknown_skeleton")]
    assert assembly["undecided"] == []
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert any(e["key"] == "enheraf" for e in delta["entries"])


def test_two_refused_decisions_are_both_held_in_order(tmp_path):
    """The fold loop runs until no `review:` line is left, and every decision it
    held is in `review_held` once, ordered by its index in the document."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [
        {"entry": {"kind": "rule", "key": "enheraf"}, "action": "keep",
         "key": "enheraf", "title": "انحراف مصرف",
         "statement": "انحراف مصرف برابر است با J6."},
        {"entry": {"kind": "measurement", "key": "vazn_panir"},
         "action": "keep", "key": "vazn_panir", "title": "وزن پنیر ورقه‌ای",
         "statement": "پنیر ورقه‌ای در K7 وزن می‌شود."}])
    # B38 — both cell references are notes: both rewrites apply.
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    assert by_key["enheraf"]["statement"] == "انحراف مصرف برابر است با J6."
    assert by_key["vazn_panir"]["title"] == "وزن پنیر ورقه‌ای"


# --------------------------------------------------------------------------- #
# final review I-1 / I-2 — the fold holds each row to the tier its gate does
# --------------------------------------------------------------------------- #

def _items(run_dir):
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    return {e["key"]: e for e in delta["entries"]}


def test_a_review_keep_with_no_statement_keeps_the_units_statement(tmp_path):
    """I-1: A9 fills a missing statement with "" so the decision passes its
    schema; folded, that "" must not blank the statement the unit wrote."""
    root = _root(tmp_path)
    _seed_units(root)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "measurement", "key": "vazn_panir"},
                             "action": "keep", "key": "vazn_panir",
                             "title": "وزن پنیر پیتزا",
                             "data": {"unit": {"value": "g", "inferred": True}}}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    entry = _items(run_dir)["vazn_panir"]
    assert entry["statement"] == "پنیر پیتزا با کیلوگرم وزن می‌شود."
    assert entry["data"]["unit"] == "g"
    assert "issues" not in entry


def test_a_review_keep_with_no_statement_to_keep_is_empty_and_marked(tmp_path):
    """I-1's other half: when the unit wrote no statement either, the entry is
    stored with "" and the A9/C11 issue — once."""
    root = _root(tmp_path)
    _seed_units(root)
    rule = _rule_out()
    del rule["decisions"][1]["statement"]
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "measurement", "key": "vazn_panir"},
                             "action": "keep", "key": "vazn_panir",
                             "title": "وزن پنیر پیتزا",
                             "data": {"unit": {"value": "g", "inferred": True}}}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    entry = _items(run_dir)["vazn_panir"]
    assert entry["statement"] == ""
    assert [i["kind"] for i in entry["issues"]] == ["shape"]


def _dangling_of_keep():
    keep = copy.deepcopy(_rule_out()["decisions"][0])
    keep.pop("skeleton")
    keep["entry"] = {"kind": "rule", "key": "enheraf"}
    keep["data"] = {"outputs": [{"key": "enheraf", "title": "انحراف", "unit": "kg",
                                 "nature": "observed",
                                 "of": {"ref": "S-rec-999999999999"}}]}
    return keep


def test_a_dangling_link_the_review_gate_cuts_does_not_hold_the_entry(tmp_path):
    """I-2(a), A19: the review gate cuts a link to no candidate with a note;
    the fold cuts it too, so the unit's sound entry lands with the issue
    instead of waiting for a part nobody will finish."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [_dangling_of_keep()])
    found = validate_unit(root, run_dir, run_dir / "review" / "out.json")
    assert tiers.refusals(found) == []
    assert any("link cut" in line for line in tiers.lines(tiers.notes(found)))
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["undecided"] == []
    rule = _items(run_dir)["enheraf"]
    assert rule["data"]["outputs"][0].get("of") is None
    assert [i["kind"] for i in rule["issues"]] == ["shape"]


def test_the_fold_holds_back_exactly_the_decisions_the_review_gate_refuses(tmp_path):
    """I-2 gate parity: A22 (a merge across kinds with no key and title to
    stand on) refuses one decision at the review gate; the fold holds that
    decision back alone, under `refused`, and folds the rest."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [
        _dangling_of_keep(),
        {"skeleton": "S-r-000000000002", "action": "merge_into",
         "into": "S-rec-000000000001", "reason_code": "duplicate"}])
    found = validate_unit(root, run_dir, run_dir / "review" / "out.json")
    gate = sorted({tiers.item_of(f)[1] for f in tiers.refusals(found)
                   if tiers.item_of(f)})
    assert gate == [1]
    assemble(root, run_dir, review=True)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] == \
        [(n, "refused") for n in gate]
    assert assembly["undecided"] == []
    assert "enheraf" in _items(run_dir)


def test_an_f_ref_naming_no_store_entry_is_severed_not_held(tmp_path):
    """I-2(b), C29 at the assembly as at `apply`: a link to an `F-` id the store
    does not hold is cut with a note; the entry lands."""
    root = _root(tmp_path)
    rule = _rule_out()
    rule["decisions"][0]["data"]["outputs"][0]["of"] = {"ref": "F-09999"}
    run_dir = _run(root, {"u-a": _record_out(), "u-b": rule})
    assemble(root, run_dir)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["undecided"] == []
    out = _items(run_dir)["enheraf"]
    assert "of" not in out["data"]["outputs"][0]
    assert out["extra"] == {"data/outputs/enheraf/of": '{"ref": "F-09999"}'}
    assert [i["kind"] for i in out["issues"]] == ["shape"]


def test_a_step_8_refusal_on_an_entry_a_repair_rekeys_holds_that_entry(tmp_path, monkeypatch):
    """M-2: C22 re-keys a sheet record whose tab a stored record holds under
    another key. Step 8's labels are the ones it judged under, so a refusal on
    that entry still maps to it: the entry is held back and the run lands,
    instead of nothing mapping and the whole assembly stopping."""
    import facts_plan.assemble as asm
    root = _root(tmp_path)
    holder = {"id": "F-00001", "kind": "record", "key": "pitza_qadimi",
              "title": "گزارش قدیمی پیتزا", "statement": "جدول قدیمی.",
              "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
              "source": [{"type": "sheet", "ref": "attachments/sheets/Pitza/pitza.xlsx"}],
              "status": "draft", "retired": False,
              "updated_at": "2026-09-01T00:00:00Z",
              "data": {"medium": "sheet", "role": "log",
                       "location": {"spreadsheetId": "SID", "sheet": "پیتزا"},
                       "fields": []}}
    (root / "facts" / "records.json").write_text(json.dumps(
        {"schema_version": 2, "entries": [holder]}, ensure_ascii=False),
        encoding="utf-8")
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    real = asm._contract_problems

    def one_more(root_, entries, named, symbols):
        found = real(root_, entries, named, symbols)
        if len(entries) > 1:          # step 8, not a unit's own gate
            found += [tiers.refuse(label, "step 8 only") for entry, label
                      in zip(entries, named) if entry["key"] == "pitza_qadimi"]
        return found
    monkeypatch.setattr(asm, "_contract_problems", one_more)
    assemble(root, run_dir)
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [u["label"] for u in assembly["undecided"]
            if u.get("refused") == ["step 8 only"]] == ["گزارش شبانهٔ لاین پیتزا"]


def test_a_merged_candidates_bindings_are_copied_not_shared():
    """Prep run 2026-09-13: `_build_entries` runs twice and `_resolve_refs`
    rewrites members in place. A binding `_absorb` shared with the skeleton
    carried the draft pass's temp id into the folded pass, where it named a
    lettuce measurement instead of the yield table."""
    from facts_plan.assemble import _absorb
    member = {"key": "t__s7__k__r2", "record": {"ref": "S-rec-1", "field": "c_k"}}
    candidate = {"payload": {"applies_to": [member]}}
    target = {"data": {"applies_to": [
        {"key": "t__s7__j__r2", "record": {"ref": "S-rec-1", "field": "c_j"}}]}}
    _absorb(target, candidate)
    target["data"]["applies_to"][1]["record"]["ref"] = "T-67"
    assert member["record"]["ref"] == "S-rec-1"


def _sources_of(candidate, decision, unit, by_id=()):
    from facts_plan.assemble import _entry
    state = {"paths": {"sid1": "attachments/sheets/Amadesazi__Amadesazi/Amadesazi.xlsx"},
             "department": "preparation", "units": {unit["id"]: unit},
             "candidates": {c["id"]: c for c in (candidate, *by_id)}, "issues": []}
    return _entry(candidate, decision, state)["source"]


CITATION = {"process": "preparation-026", "node": "preparation-026-n017", "quote": "بازدهی"}
PROCESS_SOURCE = {"type": "process", "ref": "departments/preparation/processes/preparation-026.json",
                  "node": "preparation-026-n017", "quote": "بازدهی"}


def test_a_meeting_fact_citing_a_process_keeps_the_meeting_as_its_source():
    """Owner ruling 2026-09-15: an entry keeps its real origin beside the
    process step it cites — until then a process citation replaced it."""
    unit = {"id": "u-tr-x-l10", "type": "transcript",
            "inputs": ["meetings/transcripts/preparation-1405-06-01.txt#L10-L20"]}
    candidate = {"id": "N-1", "kind": "measurement", "payload": {}}
    decision = {"unit": unit["id"], "action": "keep", "key": "k", "title": "t",
                "processes": [CITATION]}
    assert _sources_of(candidate, decision, unit) == [
        {"type": "voice", "ref": "meetings/transcripts/preparation-1405-06-01.txt",
         "lines": "10-20"}, PROCESS_SOURCE]


def test_a_workbook_formula_cites_the_tab_of_the_table_it_binds():
    """The preparation run's yield formula cited only a process node: a rule
    has no instances of its own, so its sheet is the tab its bindings name."""
    unit = {"id": "u-wb-amadesazi", "type": "workbook",
            "inputs": ["attachments/sheets/Amadesazi__Amadesazi/Amadesazi.xlsx"]}
    table = {"id": "S-rec-1", "kind": "record", "payload": {"instances": [
        {"key": "amadesazi__s7", "spreadsheetId": "sid1", "sheet": "بازدهی"}]}}
    rule = {"id": "S-r-1", "kind": "rule", "payload": {"applies_to": [
        {"key": "amadesazi__s7__j__r2", "record": {"ref": "S-rec-1", "field": "c_j"}},
        {"key": "amadesazi__s7__k__r2", "record": {"ref": "S-rec-1", "field": "c_k"}}]}}
    decision = {"unit": unit["id"], "action": "keep", "key": "k", "title": "t",
                "processes": [CITATION]}
    assert _sources_of(rule, decision, unit, by_id=[table]) == [
        {"type": "sheet", "ref": "attachments/sheets/Amadesazi__Amadesazi/Amadesazi.xlsx",
         "sheet": "بازدهی"}, PROCESS_SOURCE]


# --------------------------------------------------------------------------
# Form-anchored units (spec 2026-09-15 §3): phase 1 decides the forms, phase 2
# reads the transcripts knowing what phase 1 recorded.

FORM = {"kind": "record", "key": "form_tahvil", "title": "فرم تحویل", "statement": "",
        "data": {"medium": "paper", "role": "log",
                 "location": {"kept_at": "آشپزخانه", "holder": "سرپرست"},
                 "fields": [{"key": "vazn", "title": "وزن", "type": "number"}]}}
NOTE = {"kind": "note", "key": "n", "title": "یادداشت", "statement": "هر روز وزن می‌شود",
        "data": {"about": [{"ref": "N-u-att-1-0"}]}}

#: A constant rule a transcript unit writes up. It binds nothing of the estate,
#: so nothing derives its `home` — the unit names it, or it is unattached.
RULE = {"kind": "rule", "key": "saqf", "title": "سقف ضایعات",
        "statement": "ضایعات هر شب از پنج کیلوگرم بیشتر نمی‌شود.",
        "data": {"inputs": [],
                 "outputs": [{"key": "saqf", "title": "سقف ضایعات",
                              "unit": "kg", "nature": "limit", "value": 5}]}}

#: The photographed form phase 1 reads, and the meeting phase 2 reads.
PHOTO = "departments/cooking/attachments/.text/photo-1.image.md"
TALK = "meetings/transcripts/m.txt"


def _two_unit_run(tmp_path, att_new, tr_new, photos=(PHOTO,)):
    """A run of the two phases: `u-att-1` (a photographed form, phase 1) and
    `u-tr-m-l1` (a three-line transcript, phase 2), neither holding a candidate
    of the sheets — everything either writes is a `new[]` entry. `photos` hands
    the phase-1 unit more than one form, which is what a `from` citation is
    for."""
    root = _root(tmp_path)
    for rel in photos:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("فرم تحویل\n", encoding="utf-8")
    (root / TALK).write_text("یک\nدو\nسه\n", encoding="utf-8")
    skeleton = dict(_skeleton(), candidates=[], issues=[], unit_symbols=[])
    plan = {"schema_version": 1, "department": "cooking",
            "hashes": {**{rel: "a" for rel in photos}, TALK: "b"},
            "units": [{"id": "u-att-1", "type": "attachment", "phase": 1,
                       "inputs": list(photos), "nodes": [], "candidates": [],
                       "est_tokens_in": 1, "est_tokens_out": 1},
                      {"id": "u-tr-m-l1", "type": "transcript", "phase": 2,
                       "inputs": [f"{TALK}#L1-L3"], "nodes": [], "candidates": [],
                       "est_tokens_in": 1, "est_tokens_out": 1}]}
    outputs = {unit: {"schema_version": 1, "unit": unit, "attempt": 1,
                      "skeleton_sha256": hashlib.sha256(
                          json.dumps(skeleton, ensure_ascii=False)
                          .encode("utf-8")).hexdigest(),
                      "decisions": [], "new": new}
               for unit, new in (("u-att-1", att_new), ("u-tr-m-l1", tr_new))}
    return root, _run(root, outputs, skeleton=skeleton, plan=plan)


def test_a_phase_two_note_addressed_to_a_phase_one_new_entry_lands_on_it(tmp_path):
    """A photo unit's `new[]` form is `N-u-att-1-0`; a transcript unit's note
    with `about: [{"ref": "N-u-att-1-0"}]` resolves to that form's temp id."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[NOTE])
    assemble(root, run)
    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    form = next(e for e in delta["entries"] if e["key"] == "form_tahvil")
    note = next(e for e in delta["entries"] if e["kind"] == "note")
    assert note["data"]["about"] == [{"ref": form["id"]}]


def test_phase_entries_lists_the_gated_entries_of_the_named_units_with_handles(tmp_path):
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[])
    entries = phase_entries(root, run, ["u-att-1"])
    assert [(e["handle"], e["kind"], e["key"]) for e in entries] == \
        [("N-u-att-1-0", "record", "form_tahvil")]
    assert entries[0]["data"]["fields"][0]["key"] == "vazn"


def test_phase_entries_contributes_nothing_for_a_unit_that_failed(tmp_path):
    """Task C hands it every phase-1 unit, failed ones included: a unit whose
    every attempt is refused whole folds nothing, and no exception is raised."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[])
    for attempt in (1, 2):
        (run / "units" / "u-att-1" / f"out.{attempt}.json").write_text(
            json.dumps({"schema_version": 7}), encoding="utf-8")
    assert phase_entries(root, run, ["u-att-1"]) == []


def test_the_digest_names_each_entrys_source_kinds(tmp_path):
    """The reviewer is told what each entry was read off (spec §3)."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[NOTE])
    text = digest(root, run).read_text(encoding="utf-8")
    assert re.search(r"منابع: (photo|sheet|voice|process)"
                     r"( · (photo|sheet|voice|process))*", text)
    assert "منابع: photo" in text and "منابع: voice" in text


def test_a_units_account_reaches_the_delta_and_apply_takes_it(tmp_path):
    """The other half of the contradiction rule: what the unit heard travels
    to the store as an open account, whose id `apply` mints (INV-1)."""
    root = _root(tmp_path)
    _seed_units(root)
    record = _record_out()
    record["decisions"][0]["accounts"] = [
        {"path": "data/cadence", "value": "weekly",
         "source": {"type": "voice", "ref": "meetings/transcripts/c.txt",
                    "lines": "3-9"}}]
    plan = _plan()
    plan["hashes"] = {"meetings/transcripts/c.txt": "x"}
    # what `build` printed to this unit: the citation has to sit inside it
    plan["units"][0]["talk"] = [{"rel": "meetings/transcripts/c.txt",
                                 "first": 1, "last": 20}]
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()}, plan=plan)
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    entry = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert entry["data"]["cadence"] == "nightly"          # the form's value stays
    assert [(a["field"], a["value"], a["status"]) for a in entry["accounts"]] == \
        [("data/cadence", "weekly", "open"),
         ("data/cadence", "nightly", "open")]             # I1: the form's side
    assert all("id" not in a for a in entry["accounts"])
    validate("facts-delta.schema.json", delta)
    assert tiers.refusals(simulate(root, run_dir / "facts-delta.json", run_dir)[1]) == []


# --------------------------------------------------------------------------
# What a unit may cite of the talk it was shown (spec §3, C1/C2/I1/I5).

TR_REL = "meetings/transcripts/c.txt"


def _plan_with_talk(passages=({"rel": TR_REL, "first": 213, "last": 252},)):
    """The run's plan with `u-a` shown one passage — `build`'s own record of
    what that unit could read, and the only thing the gate checks against."""
    plan = _plan()
    plan["hashes"] = {TR_REL: "x", "meetings/transcripts/other.txt": "y"}
    plan["units"][0]["talk"] = [dict(p) for p in passages]
    return plan


def _voice(lines="220-230", ref=TR_REL):
    return {"type": "voice", "ref": ref, "lines": lines}


def _delta_entry(tmp_path, over, plan=None):
    """One assembled record entry, its decision carrying `over`."""
    root = _root(tmp_path)
    _seed_units(root)
    record = _record_out()
    record["decisions"][0].update(over)
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()},
                   plan=plan or _plan_with_talk())
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    validate("facts-delta.schema.json", delta)
    return root, run_dir, next(e for e in delta["entries"]
                               if e["key"] == "gozaresh_shabane_pitza")


def test_an_account_is_kept_when_it_cites_a_passage_the_unit_was_shown(tmp_path):
    """C1 — the passage heading prints the transcript path, so the citation the
    agent text asks for is one the unit can actually spell."""
    _root_, _run_, entry = _delta_entry(tmp_path, {"accounts": [
        {"path": "data/cadence", "value": "weekly", "source": _voice("220-230")}]})
    assert ("data/cadence", "weekly") in [(a["field"], a["value"])
                                          for a in entry["accounts"]]


@pytest.mark.parametrize("account,plan", [
    # a line range that leaves the passage — half of it was never shown
    ({"path": "data/cadence", "value": "weekly", "source": _voice("200-230")},
     None),
    # a transcript of the run the unit was shown no line of
    ({"path": "data/cadence", "value": "weekly",
      "source": _voice("220-230", "meetings/transcripts/other.txt")}, None),
    # a unit shown no passage at all (a phase-2 unit, or a silent meeting)
    ({"path": "data/cadence", "value": "weekly", "source": _voice("220-230")},
     _plan_with_talk(())),
])
def test_an_account_citing_talk_the_unit_never_read_is_dropped(tmp_path, account,
                                                               plan):
    """I5 — INV-3 at passage level: the engine selects, the unit never searches,
    so a citation to a line it was not handed is dropped (REPAIR, no note)."""
    _root_, _run_, entry = _delta_entry(tmp_path, {"accounts": [account]},
                                        plan=plan)
    assert "accounts" not in entry


def test_a_voice_source_joins_the_form_on_the_entry(tmp_path):
    """C2 — what the talk filled in is cited as the meeting, after the sheet:
    the form stays the anchor and F6 still reads the record off a form."""
    root, run_dir, entry = _delta_entry(tmp_path, {
        "voice": [_voice("220-230")], "data": {"cadence": "nightly"}})
    assert [s["type"] for s in entry["source"]] == ["sheet", "voice"]
    assert entry["source"][1] == {"type": "voice", "ref": TR_REL,
                                  "lines": "220-230"}
    assert "منابع: sheet · voice" in digest(root, run_dir).read_text(
        encoding="utf-8")
    # F6 marks a table nothing but speech shows; this one has a tab.
    assert "inferred" not in json.dumps(entry.get("field_status") or {})


def test_a_voice_source_outside_the_shown_passages_is_dropped(tmp_path):
    """Gated exactly like an account — and, like it, silently."""
    _root_, _run_, entry = _delta_entry(tmp_path, {"voice": [
        _voice("1-9"), {"type": "voice", "ref": TR_REL}]})
    assert [s["type"] for s in entry["source"]] == ["sheet"]


def test_a_units_account_is_two_sided_so_the_owner_may_keep_the_form(tmp_path):
    """I1 — `resolve` writes the chosen account's value at the field, so the
    form's own reading has to be one of the choices; otherwise the owner's only
    answer is to adopt the speech."""
    from merge_facts import load_store
    from merge_facts.apply import apply
    from merge_facts.verbs import resolve
    from facts_helpers import _run_dir
    root, run_dir, entry = _delta_entry(tmp_path, {"accounts": [
        {"path": "data/cadence", "value": "weekly", "source": _voice("220-230")}]})
    assert sorted(a["value"] for a in entry["accounts"]) == ["nightly", "weekly"]
    assert [a["source"]["type"] for a in entry["accounts"]] == ["voice", "sheet"]
    apply(root, run_dir / "facts-delta.json", run_dir)
    stored = next(e for e in load_store(root)["record"]["entries"]
                  if e["key"] == "gozaresh_shabane_pitza")
    assert all(a.get("id") for a in stored["accounts"])      # INV-1: apply mints
    form = next(a for a in stored["accounts"] if a["value"] == "nightly")
    resolve(root, stored["id"], "data/cadence", form["id"], _run_dir(root, "9"))
    kept = next(e for e in load_store(root)["record"]["entries"]
                if e["id"] == stored["id"])
    assert kept["data"]["cadence"] == "nightly"              # the form stands
    assert {a["value"]: a["status"] for a in kept["accounts"]} == \
        {"nightly": "chosen", "weekly": "rejected"}


def test_the_phase_two_input_prints_a_phase_one_entry_by_handle_and_location(
        tmp_path):
    """The seam end to end: a phase-1 `new[]` form folds through `phase_entries`
    and `recorded_slice` into the phase-2 unit's own `input.md`, under the
    handle it may address and the location that tells it apart (I2)."""
    from facts_plan.build import RECORDED_HEADING, render_phase2_inputs
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[])
    assert render_phase2_inputs(root, run) == ["u-tr-m-l1"]
    text = (run / "units" / "u-tr-m-l1" / "input.md").read_text(encoding="utf-8")
    assert RECORDED_HEADING in text
    assert ("N-u-att-1-0 · record · form_tahvil · فرم تحویل · paper · "
            "آشپزخانه · سرپرست · ستون‌ها: vazn (وزن)") in text


# --------------------------------------------------------------------------
# `home` (spec 2026-09-16): every rule, measurement and note names the table it
# belongs to — the unit writes it, or it is derived from the entry's own refs.


def test_home_is_derived_from_bindings_of_and_about():
    assert derive_home({"kind": "rule", "data": {"applies_to": [
        {"key": "a", "record": {"ref": "T-3"}}]}}) == {"ref": "T-3"}
    assert derive_home({"kind": "rule", "data": {"applies_to": [
        {"key": "a", "record": {"ref": "T-3"}},
        {"key": "b", "record": {"ref": "T-4"}}]}}) is None
    assert derive_home({"kind": "measurement",
                        "data": {"of": {"ref": "T-3", "field": "vazn"}}}) \
        == {"ref": "T-3", "field": "vazn"}
    assert derive_home({"kind": "note", "data": {"about": [{"ref": "T-3"}]}}) \
        == {"ref": "T-3"}
    # owner decision 3: the first table it names
    assert derive_home({"kind": "note", "data": {"about": [{"ref": "T-3"},
                                                           {"ref": "T-4"}]}}) \
        == {"ref": "T-3"}
    # what the unit wrote wins over every derivation
    assert derive_home({"kind": "rule", "home": {"ref": "T-9"},
                        "data": {"applies_to": [
                            {"key": "a", "record": {"ref": "T-3"}}]}}) \
        == {"ref": "T-9"}
    # a record is its own place and carries no home; nothing derives one
    assert derive_home({"kind": "record", "data": {"fields": []}}) is None
    assert derive_home({"kind": "measurement", "data": {"of": "وزن مرغ"}}) is None


#: What this run's refs name, for the three assertions that need to know.
KIND_OF_REF = {"T-3": "record", "T-4": "record", "T-5": "rule"}.get


def test_a_notes_home_is_the_first_table_it_names_not_the_first_ref():
    """Owner decision 3 reads «the first record it names»: a note that speaks
    of a rule before the table it is written on belongs to the table."""
    note = {"kind": "note", "data": {"about": [{"ref": "T-5"}, {"ref": "T-3"}]}}
    assert derive_home(note, KIND_OF_REF) == {"ref": "T-3"}
    # …and a note about no table at all stays unattached
    assert derive_home({"kind": "note", "data": {"about": [{"ref": "T-5"}]}},
                       KIND_OF_REF) is None
    # a ref this run cannot place is no reason to skip it (the store severs a
    # home that names no record, and says so)
    assert derive_home({"kind": "note", "data": {"about": [{"ref": "F-09999"}]}},
                       KIND_OF_REF) == {"ref": "F-09999"}


def test_a_rule_bound_to_something_that_is_not_a_table_has_no_home():
    """The rule branch reads `kind_of` too: a binding whose `record.ref` names
    a rule is no table, so it derives nothing — rather than a home the store
    then severs with a note the owner has to read for no reason."""
    def bound(*refs):
        return {"kind": "rule", "data": {"applies_to": [
            {"record": {"ref": r}} for r in refs]}}
    assert derive_home(bound("T-3"), KIND_OF_REF) == {"ref": "T-3"}
    assert derive_home(bound("T-5"), KIND_OF_REF) is None
    # spec §4.1 reads «bindings on exactly one RECORD»: the rule binding is
    # not a second table, so the one table still wins
    assert derive_home(bound("T-5", "T-3"), KIND_OF_REF) == {"ref": "T-3"}
    assert derive_home(bound("T-3", "T-4"), KIND_OF_REF) is None


def test_a_measurement_of_something_that_is_not_a_table_has_no_home():
    assert derive_home({"kind": "measurement", "data": {"of": {"ref": "T-3"}}},
                       KIND_OF_REF) == {"ref": "T-3"}
    assert derive_home({"kind": "measurement", "data": {"of": {"ref": "T-5"}}},
                       KIND_OF_REF) is None


def _homes_run(tmp_path, home):
    """The two-phase run with the transcript unit's rule homed on the photo
    unit's form — the `N-` handle, and the column the form's unit re-keyed."""
    return _two_unit_run(tmp_path, att_new=[FORM], tr_new=[dict(RULE, home=home)])


def test_a_units_home_resolves_through_temp_ids_and_renamed_fields(tmp_path):
    root, run = _homes_run(tmp_path, {"ref": "N-u-att-1-0", "field": "vazn"})
    assemble(root, run)
    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    assert by_key["saqf"]["home"] == {"ref": by_key["form_tahvil"]["id"],
                                      "field": "vazn"}


def test_a_home_naming_a_dropped_candidate_is_cleared_with_a_note_not_held(tmp_path):
    """C29 at the assembly, and never the hold-back: a table this run did not
    keep costs the entry its place, not its landing."""
    root, run = _homes_run(tmp_path, {"ref": "N-u-att-1-0"})
    digest(root, run)
    _write_review(run, [{"entry": {"kind": "record", "key": "form_tahvil",
                                   "scope": {"departments": ["cooking"],
                                             "branches": []}},
                         "action": "drop", "reason_code": "other",
                         "reason": "این فرم در این اجرا ثبت نمی‌شود."}])
    assemble(root, run, review=True)
    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    assembly = json.loads((run / "assembly.json").read_text(encoding="utf-8"))
    rule = next(e for e in delta["entries"] if e["key"] == "saqf")
    # …and unattached: the store's repair pass drops a null envelope member,
    # so an entry with no table carries no `home` at all — «بدون جدول» either
    # way (the contract reads null and absent alike).
    assert rule.get("home") is None
    assert "extra" not in rule
    assert any(i["kind"] == "shape" for i in rule["issues"])
    assert not [u for u in assembly["undecided"] if u.get("label") == RULE["title"]]


def _resolve_state(**over):
    """The slice of `_prepare`'s state `_resolve_refs` reads."""
    return {"dropped": [], "undecided": [], "provenance": {}, "candidates": {},
            "locators": {}, "store_scopes": {}, **over}


def _homed_rule(home, **over):
    return {"kind": "rule", "key": "saqf", "title": "سقف ضایعات",
            "statement": "", "data": {"inputs": [], "outputs": []},
            "home": home, "id": "T-2", "_skeleton": "S-r", "_unit": "u-b",
            "_renames": {}, **over}


def test_resolve_rewrites_a_home_like_any_other_ref():
    """The handle becomes the temp id and the provisional column key becomes
    the one the record's own unit minted — `home` is a ref, so it follows."""
    record = {"kind": "record", "key": "form_tahvil", "title": "فرم", "data": {},
              "id": "T-1", "_skeleton": "N-u-att-1-0", "_unit": "u-att-1",
              "_renames": {"c_a": "vazn"}}
    rule = _homed_rule({"ref": "N-u-att-1-0", "field": "c_a"})
    kept = _resolve_refs([record, rule], _resolve_state())
    assert kept == [record, rule]
    assert rule["home"] == {"ref": "T-1", "field": "vazn"}
    # …and the temp id itself stands: the digest's `homeless` flag names the
    # tables by theirs, so that is what a review's `home` carries.
    reviewed = _homed_rule({"ref": "T-1"}, id="T-3", _skeleton="S-r2")
    assert _resolve_refs([record, reviewed], _resolve_state()) == [record, reviewed]
    assert reviewed["home"] == {"ref": "T-1"}


def test_resolve_clears_a_home_that_names_no_kept_entry_and_keeps_the_entry():
    rule = _homed_rule({"ref": "N-u-att-1-0"})
    state = _resolve_state(dropped=[{"skeleton": "N-u-att-1-0", "unit": "u-att-1"}])
    kept = _resolve_refs([rule], state)
    assert kept == [rule]
    assert rule["home"] is None
    assert [i["kind"] for i in rule["issues"]] == ["shape"]
    assert state["undecided"] == []
    # …and so does a home naming a store entry this store does not hold (C29).
    other = _homed_rule({"ref": "F-09999"})
    assert _resolve_refs([other], _resolve_state()) == [other]
    assert other["home"] is None


def test_a_notes_home_skips_the_rule_it_also_names(tmp_path):
    """The same rule through the whole assembly: the photo unit writes a form
    and a rule, the meeting's note is about both, and the digest shows it under
    the form. (The digest, because an unattached `home` reaches the delta only
    once the store contract carries it — Track S.)"""
    root, run = _two_unit_run(
        tmp_path, att_new=[FORM, RULE],
        tr_new=[dict(NOTE, data={"about": [{"ref": "N-u-att-1-1"},
                                           {"ref": "N-u-att-1-0"}],
                                 "question": "هر روز چه ساعتی وزن می‌شود؟"})])
    text = digest(root, run).read_text(encoding="utf-8")
    line = next(ln for ln in text.splitlines() if ln.startswith("note · "))
    assert "جدول: form_tahvil" in line


def test_the_digest_flags_a_homeless_rule_beside_a_matching_table(tmp_path):
    """The reviewer is told which table a homeless rule reads like, so its
    `keep` can set the `home` the unit left out."""
    root, run = _two_unit_run(
        tmp_path,
        att_new=[dict(FORM, key="form_burger",
                      title="فرم تبدیل آماده‌سازی برگر")],
        tr_new=[dict(RULE, key="saqf_burger",
                     title="سقف ضایعات آماده‌سازی برگر")])
    text = digest(root, run).read_text(encoding="utf-8")
    assert "homeless · " in text
    assert "form_burger" in text.split("homeless")[1][:120]


# --------------------------------------------------------------------------
# Runs on disk are history (spec 2026-09-16 §3.6): a run whose units wrote
# items re-assembles — the items are read away, never refused.

#: What a unit wrote before `item` left the contract.
ITEM = {"kind": "item", "key": "bargar", "title": "برگر ۱۵۰ گرمی",
        "statement": "برگر آمادهٔ ۱۵۰ گرمی.",
        "data": {"category": "product", "unit": "pcs"}}


def test_an_old_runs_item_outputs_are_ignored_with_one_line_not_refused(
        tmp_path, capsys):
    """Before this, every one of them became an `undecided[]` row telling the
    owner «در اجرای بعدی تکمیل می‌شود» about a kind no run will ever mint."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM, ITEM],
                              tr_new=[dict(ITEM, key="mini_bargar"),
                                      RULE])
    result = assemble(root, run)
    err = capsys.readouterr().err
    assert "ignored 2 output(s) of the retired kind 'item'" in err
    assert result["undecided"] == 0 and result["dropped"] == 0
    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    kinds = {e["kind"] for e in delta["entries"]}
    assert kinds == {"record", "rule"} and len(delta["entries"]) == 2
    # …and the emptied `new[]` slot keeps every later handle where it was:
    # the rule is the transcript unit's second entry, and nothing points at
    # the first any more.
    assert [e["key"] for e in delta["entries"]] == ["form_tahvil", "saqf"]


def test_a_stamped_plan_lets_the_gate_answer_for_an_item_it_never_swallows(
        tmp_path, capsys):
    """I1: the filter above is a tolerance for a run that was ALREADY on disk,
    not a standing one. `build` stamps every plan it writes with `contract`,
    and on a stamped plan `item` is an unknown kind like any other: the gate
    refuses it and the owner is told in `undecided[]`. Without this gate the
    filter ran on every future run too, and a unit that wrote `kind: "item"`
    — the word is all over this estate — lost the fact in silence, with one
    English stderr line as the only trace."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM, ITEM], tr_new=[RULE])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    plan["contract"] = PLAN_CONTRACT
    (run / "plan.json").write_text(json.dumps(plan, ensure_ascii=False),
                                   encoding="utf-8")
    result = assemble(root, run)
    assert "retired kind 'item'" not in capsys.readouterr().err
    assert result["undecided"] == 1             # the owner hears about it
    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    assert {e["kind"] for e in delta["entries"]} == {"record", "rule"}


def test_a_decision_about_an_item_candidate_goes_the_same_way(tmp_path):
    """An old skeleton still offers item candidates; the decisions about them
    are read away with them, while an unknown skeleton is still held back."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[RULE])
    skeleton = json.loads((run / "skeleton.json").read_text(encoding="utf-8"))
    skeleton["candidates"] = [{"id": "S-it-1", "kind": "item",
                               "unit": "u-att-1", "payload": {}}]
    (run / "skeleton.json").write_text(
        json.dumps(skeleton, ensure_ascii=False), encoding="utf-8")
    out = json.loads((run / "units" / "u-att-1" / "out.1.json")
                     .read_text(encoding="utf-8"))
    out["decisions"] = [{"skeleton": "S-it-1", "action": "drop",
                         "reason_code": "other", "reason": "قلم است."}]
    (run / "units" / "u-att-1" / "out.1.json").write_text(
        json.dumps(out, ensure_ascii=False), encoding="utf-8")
    result = assemble(root, run)
    assert result["undecided"] == 0
    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    assert {e["kind"] for e in delta["entries"]} == {"record", "rule"}
