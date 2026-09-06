"""Shared facts-store test fixtures — a bare (non-dotted) module so any
`engine/tests/test_*.py` can `from facts_helpers import ...` it directly
(`conftest.py` puts this directory on `sys.path` for exactly that import).

Moved out of `test_merge_facts_apply.py` (Task 6) so `test_merge_facts_verbs.py`
can reuse the same store/run-dir/delta scaffolding rather than re-typing it.
"""
import json

from merge_facts.apply import apply


def _root(tmp_path):
    (tmp_path / "facts").mkdir()
    (tmp_path / "departments").mkdir()
    (tmp_path / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"},
                         {"code": "management", "name": "مدیریت"}]}),
        encoding="utf-8")
    (tmp_path / "attachments" / "sheets").mkdir(parents=True)
    (tmp_path / "attachments" / "sheets" / "manifest.json").write_text(json.dumps(
        {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": []}), encoding="utf-8")
    # The files these fixtures' deltas cite, actually present.
    #
    # QF-5 has always said a `source[].ref` is a path relative to `data-repo/`
    # and that an unresolvable one fails `apply` — but nothing implemented it,
    # so every delta here could cite a transcript that was never written. When
    # the check went in (2026-09-06, after 575 stored citations turned out to
    # hold a bare Drive id where a path belongs), these fixtures were the first
    # thing it caught, which is the point: a fixture that cites what does not
    # exist cannot exercise the rule that says it must.
    #
    # `attachments/sheets/M/M.xlsx` is deliberately NOT created — an estate
    # `.xlsx` is server-local and its absence is `check`'s report, never a
    # precondition failure, so its being missing here is what keeps that
    # exemption honest.
    (tmp_path / "meetings" / "transcripts").mkdir(parents=True)
    (tmp_path / "meetings" / "transcripts" / "c.txt").write_text("x", encoding="utf-8")
    (tmp_path / "attachments" / "sheets" / "G").mkdir()
    (tmp_path / "attachments" / "sheets" / "G" / "G.gs").write_text("x", encoding="utf-8")
    (tmp_path / "departments" / "cooking" / "attachments").mkdir(parents=True)
    (tmp_path / "departments" / "cooking" / "attachments" / "p.jpg").write_bytes(b"x")
    (tmp_path / "departments" / "cooking" / "processes").mkdir()
    (tmp_path / "departments" / "cooking" / "processes" / "cooking-001.json").write_text(
        "{}", encoding="utf-8")
    return tmp_path


def _run_dir(tmp_path, n="20260901-101500"):
    d = tmp_path / "runs" / "facts" / "cooking" / n
    d.mkdir(parents=True)
    return d


def _units_delta():
    return {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "record", "key": "units", "title": "واحدها",
        "statement": "جدول واحدها", "scope": {"departments": [], "branches": []},
        "source": [{"type": "chat", "ref": None}], "retired": False,
        "data": {"medium": "native", "role": "config", "location": {},
                 "primaryKey": ["symbol"],
                 "fields": [{"key": "symbol", "title": "نماد", "type": "string"},
                            {"key": "dimension", "title": "بُعد", "type": "string"},
                            {"key": "factor_to_base", "title": "ضریب", "type": "number"},
                            {"key": "unit_title", "title": "عنوان", "type": "string"}],
                 "rows": [{"key": "g", "symbol": "g", "dimension": "mass",
                           "factor_to_base": 1, "unit_title": "گرم"},
                          {"key": "kg", "symbol": "kg", "dimension": "mass",
                           "factor_to_base": 1000, "unit_title": "کیلوگرم"},
                          {"key": "pcs", "symbol": "pcs", "dimension": "count",
                           "factor_to_base": 1, "unit_title": "عدد"}]}}]}


def _const_delta(value=5, key="tol", dept="cooking"):
    return {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "rule", "key": key, "title": "تلورانس " + key,
        "statement": "حد مجاز", "scope": {"departments": [dept], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "11"}],
        "retired": False,
        "data": {"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                 "unit": "g", "nature": "limit", "value": value}]}}]}


def _write(tmp_path, name, delta):
    p = tmp_path / name
    p.write_text(json.dumps(delta, ensure_ascii=False), encoding="utf-8")
    return p


def _seed_units(root):
    apply(root, _write(root, "d0.json", _units_delta()), _run_dir(root, "20260901-000000"))
