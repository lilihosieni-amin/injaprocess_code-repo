import json

from facts_plan.assemble import report


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


def _run(tmp_path):
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260906-101500"
    run_dir.mkdir(parents=True)
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
