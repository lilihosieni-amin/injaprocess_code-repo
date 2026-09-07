import json

from facts_helpers import _const_delta, _root, _run_dir, _seed_units, _write
from facts_plan.assemble import ISSUE_FA, _disputes, gate_b, report
from facts_plan.build import ISSUE_TEXT
from merge_facts import load_store
from merge_facts.apply import apply


def test_every_issue_kind_has_the_owner_s_words():
    """`report` groups the issues by kind and prints the kind's words. A kind
    `build` can raise and `ISSUE_FA` does not name comes out as «ایراد», which
    tells the owner nothing — so the two tables are held equal here rather than
    by whoever next adds an issue."""
    assert set(ISSUE_FA) == set(ISSUE_TEXT)


def _store(root, entries):
    (root / "facts").mkdir(exist_ok=True)
    for name in ("items", "records", "measurements", "rules", "notes"):
        (root / "facts" / f"{name}.json").write_text(
            json.dumps({"schema_version": 2, "entries": []}), encoding="utf-8")
    (root / "facts" / "rules.json").write_text(
        json.dumps({"schema_version": 2, "entries": entries}, ensure_ascii=False),
        encoding="utf-8")
    (root / "departments").mkdir(exist_ok=True)
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]}),
        encoding="utf-8")
    # `report` names every workbook the pass skipped (§2.1 Stage 2); with no
    # workbook at all there is nothing to name.
    (root / "attachments" / "sheets").mkdir(parents=True, exist_ok=True)
    (root / "attachments" / "sheets" / "manifest.json").write_text(json.dumps(
        {"schema_version": 1, "branches": [], "workbooks": []}),
        encoding="utf-8")


def _plan_files(run_dir):
    """`skeleton.json` and `assembly.json` — what `report` reads beside the
    store and the run's own record of what it touched."""
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": [], "candidates": [], "instances": [], "imports": [],
         "issues": [{"kind": "column_shift", "instance": "pitza__s5",
                     "description": "ستون «قیمت» جا افتاده است",
                     "run_only": False, "target": "S-rec-1"},
                    {"kind": "unheaded_formula", "instance": "pitza__s5",
                     "description": "۲۴ فرمول بالای سطر عنوان",
                     "run_only": True}]}, ensure_ascii=False), encoding="utf-8")
    (run_dir / "assembly.json").write_text(json.dumps(
        {"dropped": [{"skeleton": "S-r-1", "kind": "rule", "label": "تاریخ",
                      "reason_code": "date_passthrough", "unit": "u-a"},
                     {"skeleton": "S-r-2", "kind": "rule", "label": "رنگ",
                      "reason_code": "cosmetic", "unit": "u-a"}],
         "undecided": [{"skeleton": "S-r-3", "kind": "rule", "label": "مغایرت",
                        "unit": "u-b"}],
         "provenance": {"T-1": "u-a"}, "review_status": "discarded"},
        ensure_ascii=False), encoding="utf-8")
    return run_dir


def _run(tmp_path):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    run_dir.mkdir(parents=True)
    _plan_files(run_dir)
    # No `touched.json`: this is a run directory of the shape `apply` wrote
    # before the file existed, and `report` still has to work off the id map.
    (run_dir / "id-map.json").write_text(json.dumps({"T-1": "F-00487"}),
                                         encoding="utf-8")
    return run_dir


def test_report_letters_disputes_and_speaks_persian(tmp_path):
    run_dir = _run(tmp_path)
    _store(tmp_path, [{"id": "F-00487", "kind": "rule", "key": "enheraf",
                       "title": "انحراف مصرف", "statement": "…",
                       "scope": {"departments": ["cooking"], "branches": []},
                       "status": "disputed", "retired": False, "valid_to": None,
                       "updated_at": "2026-09-06T10:00:00Z",
                       "source": [{"type": "sheet", "ref": "x", "sheet": "پیتزا"}],
                       "accounts": [{"id": "a1", "field": "data/outputs/v/value",
                                     "statement": "۲۱۵ گرم", "value": 215,
                                     "status": "open", "source": {"type": "sheet",
                                                                  "ref": "x"}},
                                    {"id": "a2", "field": "data/outputs/v/value",
                                     "statement": "۱۰ عدد", "value": 10,
                                     "status": "open", "source": {"type": "voice",
                                                                  "ref": "y"}}],
                       "data": {"inputs": [], "outputs": [{"key": "v",
                                                           "title": "مقدار",
                                                           "unit": None}]}}])
    text = report(tmp_path, run_dir).read_text(encoding="utf-8")
    assert "گزارش پایان اجرا — آشپزخانه" in text
    assert "اختلاف ۱ — «انحراف مصرف»" in text
    assert "الف) ۲۱۵ گرم" in text and "ب) ۱۰ عدد" in text
    assert "فقط تاریخ را منتقل می‌کرد: ۱ مورد" in text
    assert "ظاهری بود (رنگ و قالب): ۱ مورد" in text
    assert "ستون «قیمت» جا افتاده است" in text
    assert "۲۴ فرمول بالای سطر عنوان" in text          # run-only, still reported
    assert "بازبینی انجام نشد" in text
    assert "۱ مورد بررسی‌نشده" in text
    for banned in ("F-00487", "a1", "S-r-1", "u-a", "merge ", "runs/",
                   "date_passthrough"):
        assert banned not in text


def _account(aid, field, statement, value):
    return {"id": aid, "field": field, "statement": statement, "value": value,
            "status": "open", "source": {"type": "sheet", "ref": "x"}}


def _disputed(accounts):
    return [{"id": "F-00487", "kind": "rule", "key": "enheraf",
             "title": "انحراف مصرف", "statement": "…",
             "scope": {"departments": ["cooking"], "branches": []},
             "status": "disputed", "retired": False, "valid_to": None,
             "updated_at": "2026-09-06T10:00:00Z",
             "source": [{"type": "sheet", "ref": "x", "sheet": "پیتزا"}],
             "accounts": accounts,
             "data": {"inputs": [],
                      "outputs": [{"key": "v", "title": "مقدار", "unit": "g"},
                                  {"key": "w", "title": "حد", "unit": "g"}]}}]


def test_two_disagreed_fields_on_one_entry_are_two_disputes_numbered_alike(tmp_path):
    """The owner answers «۱ الف» at Gate B and the playbook resolves what that
    number names — so a dispute is one FIELD, not one entry and not every other
    account in a flat list, and `gate-b.md` and `report.md` have to number the
    same list the same way."""
    run_dir = _run(tmp_path)
    accounts = [_account("a1", "data/outputs/v/value", "۲۱۵ گرم", 215),
                _account("a2", "data/outputs/v/value", "۱۰ گرم", 10),
                _account("a3", "data/outputs/w/value", "۷ گرم", 7),
                _account("a4", "data/outputs/w/value", "۹ گرم", 9)]
    entries = _disputed(accounts)
    _store(tmp_path, entries)
    text = report(tmp_path, run_dir).read_text(encoding="utf-8")
    assert "اختلاف ۱ — «انحراف مصرف»\n  الف) ۲۱۵ گرم\n  ب) ۱۰ گرم" in text
    assert "اختلاف ۲ — «انحراف مصرف»\n  الف) ۷ گرم\n  ب) ۹ گرم" in text
    assert "ج)" not in text                       # never four sides in one

    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    gate = gate_b(tmp_path, skeleton, entries,
                  {"department": "cooking", "dropped": [], "undecided": []})
    assert "اختلاف بین دو منبع: ۲ مورد" in gate
    assert "۱ — «انحراف مصرف»: الف) ۲۱۵  ب) ۱۰" in gate
    assert "۲ — «انحراف مصرف»: الف) ۷  ب) ۹" in gate


def test_disputes_are_ordered_by_content_not_by_container_order():
    """`gate_b` reads the assembled entries and `report` reads the store, and
    the two are not one list in one order — so the numbering is derived from
    the entry itself (kind, key, scope, field), never from position."""
    first = _disputed([_account("a1", "data/outputs/v/value", "۵", 5),
                       _account("a2", "data/outputs/v/value", "۴", 4)])[0]
    second = dict(first, id="F-00488", key="kasri", title="کسری")
    assert [e["key"] for e, _ in _disputes([first, second])] \
        == [e["key"] for e, _ in _disputes([second, first])] == ["enheraf", "kasri"]


def test_a_run_that_only_merged_still_reports_the_dispute_it_opened(tmp_path):
    """`id-map.json` records the ids a run MINTED — `revert` depends on that
    meaning, and a merge into an existing entry mints none. So a re-run into a
    populated store left the entry the ladder had just disputed out of
    `report.md` altogether: the dispute the owner was shown as «۱» at Gate B
    was gone, and every later number had moved. `touched.json` is the run's
    whole footprint, and `report` reads that."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    run_dir = _run_dir(root, "2")
    apply(root, _write(root, "d2.json", _const_delta(4)), run_dir)
    entry = next(e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol")

    assert json.loads((run_dir / "id-map.json").read_text(encoding="utf-8")) == {}
    assert json.loads((run_dir / "touched.json").read_text(encoding="utf-8")) \
        == [entry["id"]]

    _plan_files(run_dir)
    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    gate = gate_b(root, skeleton, [entry],
                  {"department": "cooking", "dropped": [], "undecided": []})
    assert f'۱ — «{entry["title"]}»' in gate
    text = report(root, run_dir).read_text(encoding="utf-8")
    assert f'اختلاف ۱ — «{entry["title"]}»' in text


def test_a_superseded_predecessor_is_not_in_the_run_the_owner_reads(tmp_path):
    """`touched` holds both sides of a supersession — the successor and the
    predecessor the run closed. Naming the closed one in `report.md` counts it
    as recorded and offers its dead era's dispute for an answer «۱ الف» that
    `resolve` would then write into a closed entry. A run names what it left
    open."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(9)), _run_dir(root, "2"))
    era = _const_delta(4)
    era["entries"][0]["valid_from"] = "1405-01-01"
    run_dir = _run_dir(root, "3")
    apply(root, _write(root, "d3.json", era), run_dir)
    rules = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"]
    old = next(r for r in rules if r["valid_to"] is not None)
    new = next(r for r in rules if r["valid_to"] is None)
    assert len([a for a in old["accounts"] if a["status"] == "open"]) == 2

    assert json.loads((run_dir / "touched.json").read_text(encoding="utf-8")) \
        == [new["id"]]
    _plan_files(run_dir)
    text = report(root, run_dir).read_text(encoding="utf-8")
    assert "ثبت شد: ۱ مورد" in text
    assert "اختلاف" not in text
