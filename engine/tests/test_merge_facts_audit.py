"""`merge facts audit` / `merge facts check` — one test per finding code.

Every store here is built through `apply` (and the other writing verbs): the
five facts files are written by the verbs and by nothing else. What the tests
do write by hand is what the verbs never own — process files under
`departments/`, the manifest, a workbook dump and a cited transcript.

`natural_key_dup` is the one code no sequence of verbs can trigger (`apply`
refuses the delta that would create it, and `retire` only closes entries), so
its test does both halves the brief asks for: the reachable near-miss (one key
at two scopes) is asserted **quiet**, and the finding itself is exercised on
the pure function with a store built in memory.
"""
import copy
import datetime
import json
import pathlib
import subprocess
import sys

from facts_helpers import _const_delta, _root, _run_dir, _seed_units, _write

import merge_facts.audit as audit_mod
from merge_facts import load_store
from merge_facts.apply import apply
from merge_facts.audit import audit, check, coverage, flags_over
from merge_facts.verbs import resolve, retire

SCHEMAS = pathlib.Path(__file__).resolve().parents[2] / "schemas"


# --------------------------------------------------------------------------- #
# fixtures
# --------------------------------------------------------------------------- #

def _entry(tid, kind, key, title, data, scope=("cooking",), **extra):
    e = {"id": tid, "kind": kind, "key": key, "title": title, "statement": "شرح",
         "scope": {"departments": list(scope), "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt",
                     "lines": "5"}],
         "retired": False, "data": data}
    e.update(extra)
    return e


def _apply(root, entries, n):
    return apply(root, _write(root, f"d{n}.json",
                              {"schema_version": 2, "entries": entries}),
                 _run_dir(root, n))


def _codes(items):
    return {i["code"] for i in items}


def _of(items, code):
    return [i for i in items if i["code"] == code]


def _process(root, pid, *, nodes=(), tombstoned=False, superseded_by=None,
             actor="مسئول واحد", mechanisms=("ترازو",)):
    """A minimal process file — hand-written fixtures are normal here; only
    `facts/` is verb-only."""
    dept = pid.rsplit("-", 1)[0]
    doc = {"id": pid, "department": dept, "name": "فرایند", "summary": "خلاصه",
           "source": {"type": "manual", "ref": None, "run": None},
           "parent": None,
           "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
           "idef0": {"inputs": [], "controls": [], "outputs": [],
                     "mechanisms": list(mechanisms)},
           "kpis": [], "edges": [], "pending": [],
           "nodes": [{"id": nid, "type": "activity", "label": "کار",
                      "description": "شرح", "actor": actor,
                      "icom": {"inputs": [], "controls": [], "outputs": [],
                               "mechanisms": []},
                      "subprocess": None, "position": {"x": 0, "y": 0},
                      "layout": "auto",
                      "source": {"created_by": "manual", "touched_by": []}}
                     for nid in nodes]}
    if tombstoned:
        doc["tombstoned"] = True
    if superseded_by:
        doc["superseded_by"] = list(superseded_by)
    path = root / "departments" / dept / "processes" / f"{pid}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def _manifest(root, workbooks):
    path = root / "attachments" / "sheets" / "manifest.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["workbooks"] = workbooks
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def _workbook(sid, short):
    return {"spreadsheetId": sid, "dir": f"D__{short}", "file": f"{short}.xlsx",
            "short": short, "scripts": [], "departments": ["cooking"],
            "branches": [], "reference_tabs": [], "confirmed": True}


def _reference_record(tid="T-1", key="mavad__pizza", sid="M", rows=None,
                      sheet="پیتزا"):
    return _entry(tid, "record", key, "ب.او.ام پیتزا", {
        "medium": "sheet", "role": "reference",
        "location": {"spreadsheetId": sid, "sheetId": 2, "sheet": sheet,
                     "hidden": False},
        "grain": "یک ردیف برای هر ماده",
        "fields": [{"key": "code", "title": "کد", "type": "string"},
                   {"key": "grams", "title": "گرم", "type": "number", "unit": "g"}],
        "primaryKey": ["code"],
        "rows": rows if rows is not None else [
            {"code": "prod_61", "grams": 250}, {"code": "prod_62", "grams": 300}]})


def _template(tid="T-1", key="gozaresh_pitza", instance="gz__s11", sid="G",
              sheet="پیتزا"):
    return _entry(tid, "record", key, "گزارش پیتزا", {
        "medium": "sheet", "role": "report",
        "location": {"spreadsheetId": sid, "sheetId": 11, "sheet": sheet,
                     "hidden": False},
        "instances": [{"key": instance, "spreadsheetId": sid, "sheetId": 11,
                       "sheet": sheet, "branch": "chalebagh", "hidden": False}],
        "fields": [{"key": "enheraf", "title": "انحراف", "type": "number",
                    "unit": "g", "columns": {instance: "J"}}]})


def _bound_rule(tid, key, title, binding, rng, expr="v = x", record="T-1"):
    return _entry(tid, "rule", key, title, {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                     "nature": "observed"}],
        "lang": "feel", "expr": expr,
        "applies_to": [{"key": binding, "record": {"ref": record,
                                                   "field": "enheraf"},
                        "variant": 1, "range": rng, "params": {}}]})


def _note(tid, key, statement, about="F-00001"):
    return _entry(tid, "note", key, statement[:60],
                  {"about": [{"ref": about}], "question": "واحدش چیست؟"}) \
        | {"statement": statement}


# --------------------------------------------------------------------------- #
# audit — one test per finding code
# --------------------------------------------------------------------------- #

def test_two_writers_on_overlapping_bindings(tmp_path):
    """§4: keyed on the bindings, not on (ref, field) — two rules computing one
    column of one tab over meeting row ranges is the contradiction; the same
    column in two different row bands is the estate as it is."""
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15"),
                  _bound_rule("T-3", "enheraf_dobare", "انحراف دوباره",
                              "gz__s11__j__r10", "J10:J20", expr="v = x * 2")],
           "1")
    found = _of(audit(root), "two_writers")
    assert len(found) == 1 and "J" in found[0]["message"]


def test_two_writers_is_quiet_on_bands_that_do_not_meet(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J9"),
                  _bound_rule("T-3", "enheraf_payin", "انحراف پایین",
                              "gz__s11__j__r10", "J10:J20", expr="v = x * 2")],
           "1")
    assert "two_writers" not in _codes(audit(root))


def test_two_scripts_writing_rows_into_one_record_are_not_a_duplicate(tmp_path):
    """§7: a sheet-writing script "writes rows into a record" — `writes_to`
    with no `field`. Two of them on one log is the estate as it is; the
    finding §12 names is two rules writing one *field*."""
    root = _root(tmp_path); _seed_units(root)
    record = _entry("T-1", "record", "log_a", "دفتر", {
        "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S", "sheetId": 1, "sheet": "روزانه",
                     "hidden": False},
        "fields": [{"key": "col_x", "title": "ستون", "type": "number", "unit": "g"}]})

    def script(tid, key, title, identifier):
        return _entry(tid, "rule", key, title, {
            "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
            "outputs": [{"key": "rows", "title": "ردیف‌ها", "unit": "g",
                         "nature": "observed", "writes_to": {"ref": "T-1"}}],
            "identifier": identifier, "lang": "gs", "expr": "rows = x"})

    _apply(root, [record, script("T-2", "save_orders", "ثبت سفارش", "saveOrders"),
                  script("T-3", "update_food_count", "به‌روزرسانی شمارش",
                         "updateFoodCount")], "1")
    assert "duplicate_output" not in _codes(audit(root))


def test_duplicate_title_folds_space_zwnj_and_digits(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol_a"); a["entries"][0]["title"] = "تلورانس ۵ گرم"
    b = _const_delta(7, key="tol_b"); b["entries"][0]["title"] = "تلورانس‌۷ گرم"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    apply(root, _write(root, "b.json", b), _run_dir(root, "2"))
    found = _of(audit(root), "duplicate_title")
    ids = {e["id"] for e in load_store(root)["rule"]["entries"]
           if e["key"] in ("tol_a", "tol_b")}
    assert len(found) == 1 and all(i in found[0]["message"] for i in ids)


def test_orphan_ref_deferred_edge_becomes_checkable_when_the_stub_is_filled(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    stub = _entry("T-9", "record", "ext_abc", "کتاب ناشناخته", {
        "stub": True, "grain": "workbook", "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S"}})
    reader = _entry("T-1", "rule", "uses_stub", "خواندن از دور", {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g",
                    "from": {"ref": "T-9", "field": "col_x"}}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g", "nature": "limit"}],
        "lang": "feel", "expr": "v = x"})
    _apply(root, [stub, reader], "1")
    assert "orphan_ref" not in _codes(audit(root))       # deferred while a stub

    real = _entry("T-1", "record", "s__ruzane", "روزانه", {
        "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S", "sheetId": 1, "sheet": "روزانه",
                     "hidden": False},
        "fields": [{"key": "col_y", "title": "ستون", "type": "number", "unit": "g"}]})
    _apply(root, [real], "2")                            # adopts the stub (QF-20)
    found = _of(audit(root), "orphan_ref")
    assert len(found) == 1 and "col_x" in found[0]["message"]


def test_dangling_ref_items_cell_whose_item_is_retired(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    item = _entry("T-1", "item", "ing_1", "پنیر", {"category": "ingredient",
                                                   "unit": "g"})
    record = _entry("T-2", "record", "mavad__pizza", "ب.او.ام", {
        "medium": "sheet", "role": "reference",
        "location": {"spreadsheetId": "M", "sheetId": 2, "sheet": "پیتزا",
                     "hidden": False},
        "fields": [{"key": "ingredient", "title": "ماده", "type": "string",
                    "refItems": {"namespace": "##", "resolved_by": "code"}},
                   {"key": "grams", "title": "گرم", "type": "number", "unit": "g"}],
        "primaryKey": ["ingredient"],
        "rows": [{"ingredient": "T-1", "grams": 250}]})
    report = _apply(root, [item, record], "1")
    assert "dangling_ref_items" not in _codes(audit(root))
    retire(root, report["id_map"]["T-1"], None, _run_dir(root, "2"))
    found = _of(audit(root), "dangling_ref_items")
    assert len(found) == 1 and "ing_1" in found[0]["message"]


def test_process_link_tombstoned_proposes_the_heir(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _process(root, "cooking-003", nodes=["cooking-003-n010"], tombstoned=True,
             superseded_by=["cooking-017"])
    d = _const_delta(5, key="tol")
    d["entries"][0]["processes"] = [{"ref": "cooking-003"}]
    d["entries"][0]["source"].append(
        {"type": "process", "ref": "departments/cooking/processes/cooking-003.json",
         "node": "cooking-003-n010", "quote": "تلورانس"})
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    found = _of(audit(root), "process_link")
    assert len(found) == 1
    assert found[0]["proposal"] == "cooking-017"
    assert "cooking-003" in found[0]["message"]


def test_process_link_node_gone_has_no_heir(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _process(root, "cooking-004", nodes=["cooking-004-n001"])
    d = _const_delta(5, key="tol")
    d["entries"][0]["processes"] = [{"ref": "cooking-004"}]
    d["entries"][0]["source"].append(
        {"type": "process", "ref": "departments/cooking/processes/cooking-004.json",
         "node": "cooking-004-n010", "quote": "تلورانس"})
    apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    found = _of(audit(root), "process_link")
    assert len(found) == 1 and found[0]["proposal"] is None
    assert "cooking-004-n010" in found[0]["message"]


def test_row_gone_needs_a_dump_and_reports_dump_missing_without_one(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_reference_record()], "1")
    codes = _codes(audit(root))
    assert "dump_missing" in codes and "row_gone" not in codes

    dump = root / "attachments" / "sheets" / ".dump" / "M"
    dump.mkdir(parents=True)
    (dump / "rows.tsv").write_text("sheet\trow\tcode\tgrams\nپیتزا\t2\tprod_61\t250\n",
                                   encoding="utf-8")
    found = _of(audit(root), "row_gone")
    assert "dump_missing" not in _codes(audit(root))
    assert len(found) == 1 and "prod_62" in found[0]["message"]


def test_the_dumps_bookkeeping_columns_are_not_cells(tmp_path):
    """`rows.tsv` is one file per workbook: `sheet`, `row`, then the tab's own
    columns (Appendix C). The first two narrow the read and are then dropped —
    a row keyed for the tab name or a row index is not a row that is *in* the
    dump, and reporting it present would hide a withdrawn definition."""
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_reference_record(rows=[
        {"key": "named_for_the_tab", "code": "پیتزا", "grams": 1},
        {"key": "named_for_a_row_index", "code": "2", "grams": 2}])], "1")
    dump = root / "attachments" / "sheets" / ".dump" / "M"
    dump.mkdir(parents=True)
    (dump / "rows.tsv").write_text("sheet\trow\tcode\tgrams\nپیتزا\t2\tprod_61\t250\n",
                                   encoding="utf-8")
    gone = {f["message"] for f in _of(audit(root), "row_gone")}
    assert len(gone) == 2, gone


def test_a_real_dump_of_a_reference_tab_reads_back_row_by_row(tmp_path):
    """The dumper and this reader are one contract: what `dump-workbook` writes
    for a confirmed reference tab is what `audit` narrows and matches."""
    from dump_workbook import dump_workbook
    from fixtures.make_workbook import make_workbook

    root = _root(tmp_path); _seed_units(root)
    book = make_workbook(root / "attachments" / "sheets" / "Mavad" / "M.xlsx",
                         spreadsheet_id="M")
    dump_workbook(book, book.with_name("M.structure.md"),
                  root / "attachments" / "sheets" / ".dump",
                  reference_tabs=["مواد اولیه"])
    rows = audit_mod._dump_rows(root, "M", "مواد اولیه")
    assert [r["کد"] for r in rows] == ["prod_61", "prod_62", "prod_63"]
    assert "sheet" not in rows[0] and "row" not in rows[0]

    _apply(root, [_reference_record(sid="M", sheet="مواد اولیه", rows=[
        {"code": "prod_61", "grams": 250},
        {"code": "prod_99", "grams": 10}])], "1")
    found = _of(audit(root), "row_gone")
    assert len(found) == 1 and "prod_99" in found[0]["message"]


def test_retired_row_live_edges(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    reader = _entry("T-2", "rule", "reads_row", "خواندن مقدار", {
        "inputs": [{"key": "g", "title": "گرم", "unit": "g",
                    "from": {"ref": "T-1", "field": "grams", "row": "prod_61"}}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g", "nature": "observed"}],
        "lang": "feel", "expr": "v = g"})
    _apply(root, [_reference_record(), reader], "1")
    assert "retired_row_live_edges" not in _codes(audit(root))

    retired = _reference_record(rows=[{"key": "prod_61", "retired": True,
                                       "valid_to": "1405-06-01"}])
    _apply(root, [retired], "2")
    found = _of(audit(root), "retired_row_live_edges")
    assert len(found) == 1 and "prod_61" in found[0]["message"]


def test_template_drift(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    base = _entry("T-1", "rule", "tpl", "الگو", {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g", "nature": "observed"}],
        "lang": "feel", "expr": "v = x * 2"})
    inst = _entry("T-2", "rule", "tpl__nk", "نمونهٔ ناهارخوران", {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g", "nature": "observed"}],
        "lang": "feel", "expr": "v = x * 3",
        "template_of": {"ref": "T-1"}, "divergence": "drift"})
    _apply(root, [base, inst], "1")
    found = _of(audit(root), "template_drift")
    assert len(found) == 1 and "v = x * 3" in found[0]["message"]


def test_reconciliation_cell_disagrees_with_the_constant_beyond_one_percent(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    const = _entry("T-2", "rule", "dough_const", "خمیر تک‌پیتزا", {
        "inputs": [], "outputs": [{"key": "dough_g", "title": "خمیر", "unit": "g",
                                   "nature": "standard", "value": 180}]})
    record = _reference_record(rows=[{"code": "prod_61", "grams": 250}])
    record["data"]["reconciled_against"] = [
        {"cell": {"field": "grams", "row": "prod_61"},
         "against": {"ref": "T-2", "field": "dough_g"}}]
    _apply(root, [record, const], "1")
    found = _of(audit(root), "reconciliation")
    assert len(found) == 1 and "250" in found[0]["message"]


def test_component_sum_shares_drift_past_one_percent(tmp_path):
    root = _root(tmp_path); _seed_units(root)

    def yield_rule(outputs):
        # Task 9 content check #1: expr identifiers must be declared by THIS
        # delta's own inputs/outputs — derived from whichever `outputs` this
        # call actually carries, rather than a fixed two-output expr that a
        # later, single-output delta (below) would no longer match.
        assigns = "; ".join(f"{o['key']} = input_kg * {o['share']}"
                            for o in outputs)
        return _entry("T-1", "rule", "butchery", "بازدهی راسته", {
            "inputs": [{"key": "input_kg", "title": "ورودی", "unit": "kg",
                        "from": "operator"}],
            "outputs": outputs, "lang": "feel", "expr": assigns})

    def out(key, title, share):
        return {"key": key, "title": title, "unit": "kg", "nature": "observed",
                "share": share}

    _apply(root, [yield_rule([out("steak", "استیک", 0.5),
                              out("philly", "فیلادلفیا", 0.5)])], "1")
    assert "component_sum" not in _codes(audit(root))
    # a later run adds a third component — each delta is legal on its own, and
    # the store's shares now sum to 1.5
    _apply(root, [yield_rule([out("trimmings", "خرده", 0.5)])], "2")
    found = _of(audit(root), "component_sum")
    assert len(found) == 1 and "1.5" in found[0]["message"]


def test_unconsumed_constant_is_reported_and_a_consumed_one_is_not(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    lonely = _entry("T-1", "rule", "lonely_tol", "تلورانس بی‌مصرف",
                    {"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                                                "unit": "g", "nature": "limit",
                                                "value": 5}]})
    used = _entry("T-2", "rule", "used_tol", "تلورانس مصرف‌شده",
                  {"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                                              "unit": "g", "nature": "limit",
                                              "value": 7}]})
    consumer = _entry("T-3", "rule", "consumer", "مصرف‌کننده", {
        "inputs": [{"key": "t", "title": "تلورانس", "unit": "g",
                    "from": {"ref": "T-2", "field": "v"}}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g", "nature": "observed"}],
        "lang": "feel", "expr": "v = t"})
    _apply(root, [lonely, used, consumer], "1")
    found = _of(audit(root), "unconsumed_constant")
    lonely_id = [e["id"] for e in load_store(root)["rule"]["entries"]
                 if e["key"] == "lonely_tol"][0]
    assert [i["id"] for i in found] == [lonely_id]
    assert found[0]["proposal"] == "info"      # §4: information, not a defect


def test_note_overlap_groups_at_a_third_of_the_tokens(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_note("T-1", "note_aa11bb22cc33",
                        "وزن پنیر پیتزا در پایان شب ثبت نمی‌شود"),
                  _note("T-2", "note_aa11bb22cc34",
                        "وزن پنیر در انبار ثبت نمی‌شود")], "1")
    found = _of(audit(root), "note_overlap")
    assert len(found) == 1            # 5/9 tokens: over 0.35, under the old 0.7


def test_stale_stub_after_three_runs_and_after_thirty_days(tmp_path, monkeypatch):
    root = _root(tmp_path); _seed_units(root)
    stub = _entry("T-9", "record", "ext_abc", "کتاب ناشناخته", {
        "stub": True, "grain": "workbook", "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S"}})
    _apply(root, [stub], "20260902-000000")
    assert "stale_stub" not in _codes(audit(root))

    for stamp in ("20991231-000001", "20991231-000002", "20991231-000003"):
        (root / "runs" / "facts" / "cooking" / stamp).mkdir(parents=True)
    found = _of(audit(root), "stale_stub")
    assert len(found) == 1 and "3" in found[0]["message"]

    for stamp in ("20991231-000001", "20991231-000002", "20991231-000003"):
        (root / "runs" / "facts" / "cooking" / stamp).rmdir()
    assert "stale_stub" not in _codes(audit(root))
    monkeypatch.setattr(audit_mod, "_now", lambda: datetime.datetime.now(
        datetime.timezone.utc) + datetime.timedelta(days=60))
    found = _of(audit(root), "stale_stub")
    assert len(found) == 1 and "30" in found[0]["message"]


def test_natural_key_dup_is_quiet_for_one_key_at_two_scopes(tmp_path):
    """`apply` refuses the delta that would create a duplicate natural key, so
    the reachable shape — one key, two scopes — must stay quiet."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "a.json", _const_delta(5, key="tol")),
          _run_dir(root, "1"))
    universal = _const_delta(5, key="tol")
    universal["entries"][0]["scope"] = {"departments": [], "branches": []}
    universal["entries"][0]["title"] = "تلورانس جهانی"
    apply(root, _write(root, "b.json", universal), _run_dir(root, "2"))
    assert "natural_key_dup" not in _codes(audit(root))


def test_natural_key_dup_reports_two_open_entries_on_one_key(tmp_path):
    """The finding itself, on the store no verb can produce (QF-15)."""
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "a.json", _const_delta(5, key="tol")),
          _run_dir(root, "1"))
    store = load_store(root)
    twin = copy.deepcopy(store["rule"]["entries"][0])
    twin["id"] = "F-09999"
    store["rule"]["entries"].append(twin)
    found = audit_mod._natural_key_dup(audit_mod._Walk(root, store))
    assert [i["code"] for i in found] == ["natural_key_dup"]
    assert "F-09999" in found[0]["message"]


def test_scope_shadow(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    universal = _const_delta(5, key="tol")
    universal["entries"][0]["scope"] = {"departments": [], "branches": []}
    apply(root, _write(root, "a.json", universal), _run_dir(root, "1"))
    scoped = _const_delta(5, key="tol")
    scoped["entries"][0]["title"] = "تلورانس آشپزخانه"
    apply(root, _write(root, "b.json", scoped), _run_dir(root, "2"))
    found = _of(audit(root), "scope_shadow")
    assert len(found) == 1 and "tol" in found[0]["message"]


def test_unknown_role(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _process(root, "cooking-006", nodes=["cooking-006-n001"], actor="مسئول واحد")
    known = _entry("T-1", "measurement", "m_known", "اندازه‌گیری شناخته",
                   {"quantity": "mass", "unit": "g", "by": "مسئول واحد"})
    unknown = _entry("T-2", "measurement", "m_unknown", "اندازه‌گیری ناشناخته",
                     {"quantity": "mass", "unit": "g", "by": "سرلاین"})
    _apply(root, [known, unknown], "1")
    found = _of(audit(root), "unknown_role")
    assert len(found) == 1 and "سرلاین" in found[0]["message"]


def test_findings_are_sorted_and_carry_the_four_keys(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))
    items = audit(root)
    assert items
    for i in items:
        assert set(i) == {"code", "id", "message", "proposal"}
    assert items == sorted(items, key=lambda i: (i["code"], i["id"] or "",
                                                 i["message"]))


# --- v3 detectors ---------------------------------------------------------- #

def test_row_gone_is_quiet_when_one_instance_of_the_template_still_has_it(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _reference_record(sid="M", sheet="پیتزا")
    record["data"]["instances"] = [
        {"key": "m__s2", "spreadsheetId": "M", "sheetId": 2, "sheet": "پیتزا",
         "branch": "chalebagh", "hidden": False},
        {"key": "n__s2", "spreadsheetId": "N", "sheetId": 2, "sheet": "پیتزا",
         "branch": "naharkhoran", "hidden": False}]
    _apply(root, [record], "1")
    for sid, rows in (("M", "پیتزا\t2\tprod_61\t250\n"),
                      ("N", "پیتزا\t2\tprod_61\t250\nپیتزا\t3\tprod_62\t300\n")):
        dump = root / "attachments" / "sheets" / ".dump" / sid
        dump.mkdir(parents=True)
        (dump / "rows.tsv").write_text("sheet\trow\tcode\tgrams\n" + rows,
                                       encoding="utf-8")
    codes = _codes(audit(root))
    assert "row_gone" not in codes and "dump_missing" not in codes


def test_dump_missing_names_the_instance_whose_workbook_has_no_rows(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _reference_record(sid="M", sheet="پیتزا")
    record["data"]["instances"] = [
        {"key": "m__s2", "spreadsheetId": "M", "sheetId": 2, "sheet": "پیتزا",
         "branch": "chalebagh", "hidden": False},
        {"key": "n__s2", "spreadsheetId": "N", "sheetId": 2, "sheet": "پیتزا",
         "branch": "naharkhoran", "hidden": False}]
    _apply(root, [record], "1")
    dump = root / "attachments" / "sheets" / ".dump" / "M"
    dump.mkdir(parents=True)
    (dump / "rows.tsv").write_text(
        "sheet\trow\tcode\tgrams\nپیتزا\t2\tprod_61\t250\nپیتزا\t3\tprod_62\t300\n",
        encoding="utf-8")
    found = _of(audit(root), "dump_missing")
    assert len(found) == 1 and "n__s2" in found[0]["message"]
    assert "row_gone" not in _codes(audit(root))


def _formulas(root, sid, rows):
    dump = root / "attachments" / "sheets" / ".dump" / sid
    dump.mkdir(parents=True, exist_ok=True)
    (dump / "formulas.tsv").write_text(
        "sheet\trange\tgroup\tformula\tcount\tcached\terror\n" + rows,
        encoding="utf-8")


def test_binding_gone_when_the_dump_no_longer_computes_the_range(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15")], "1")
    _formulas(root, "G", "پیتزا\tJ6:J15\t1\t=I6-H6\t10\t5\t\n")
    assert "binding_gone" not in _codes(audit(root))
    _formulas(root, "G", "پیتزا\tK6:K15\t1\t=I6-H6\t10\t5\t\n")
    found = _of(audit(root), "binding_gone")
    assert len(found) == 1 and "J6:J15" in found[0]["message"]


def test_expr_missing_on_a_rule_that_is_bound_but_states_nothing(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    bound = _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6", "J6:J15")
    bound["data"].pop("expr")
    bound["data"]["lang"] = "sheets"
    bound["data"]["original"] = "=I6-H6"        # §5.3: original alone is illegal
    _apply(root, [_template(), bound], "1")
    found = _of(audit(root), "expr_missing")
    assert len(found) == 1 and "enheraf" in found[0]["message"]


def test_equal_expr_two_rules_stating_one_computation_in_one_scope(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15", expr="v = x"),
                  _bound_rule("T-3", "enheraf_lain", "انحراف لاین",
                              "gz__s11__k__r6", "K6:K15", expr="v =  x")], "1")
    found = _of(audit(root), "equal_expr")
    assert len(found) == 1 and "v = x" in found[0]["message"].replace(" ", " ")


def test_duplicate_code_two_items_answering_to_one_code(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_entry("T-1", "item", "ing_1", "پنیر",
                         {"category": "ingredient", "unit": "g", "code": "##1"}),
                  _entry("T-2", "item", "ing_1_dobare", "پنیر پیتزا",
                         {"category": "ingredient", "unit": "g", "code": "##1"})],
           "1")
    found = _of(audit(root), "duplicate_code")
    assert len(found) == 1 and "##1" in found[0]["message"]


def test_edge_disagreement_two_answers_for_one_edge_case(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    rule = _entry("T-1", "rule", "sefaresh", "مقدار سفارش", {
        "inputs": [{"key": "x", "title": "ایکس", "unit": "g", "from": "operator"}],
        "outputs": [{"key": "v", "title": "مقدار", "unit": "g",
                     "nature": "observed"}],
        "lang": "gs", "expr": "v = x", "identifier": "orderQuantity",
        "edge_cases": [{"input": "جمعه", "expected": 2, "why": "روز شلوغ"},
                       {"input": "جمعه", "expected": 3, "why": "بازنویسی"}]})
    _apply(root, [rule], "1")
    found = _of(audit(root), "edge_disagreement")
    assert len(found) == 1 and "جمعه" in found[0]["message"]


def test_no_consumer_only_for_the_item_nothing_reads(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    read = _entry("T-1", "item", "ing_1", "پنیر", {"category": "ingredient",
                                                   "unit": "g"})
    lonely = _entry("T-2", "item", "ing_2", "روغن", {"category": "ingredient",
                                                     "unit": "g"})
    measure = _entry("T-3", "measurement", "vazn_panir", "وزن پنیر",
                     {"of": {"ref": "T-1"}, "quantity": "mass", "unit": "g",
                      "by": "مسئول واحد", "when": "پایان شب"})
    _apply(root, [read, lonely, measure], "1")
    found = _of(audit(root), "no_consumer")
    lonely_id = [e["id"] for e in load_store(root)["item"]["entries"]
                 if e["key"] == "ing_2"][0]
    assert [i["id"] for i in found] == [lonely_id]


def test_quantity_off_enum(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))
    store = load_store(root)
    store["measurement"]["entries"].append({
        "id": "F-09999", "kind": "measurement", "key": "vazn", "title": "وزن",
        "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
        "source": [], "retired": False, "status": "confirmed",
        "updated_at": "2026-09-01T10:00:00Z",
        "data": {"quantity": 215, "unit": "g", "by": "مسئول واحد",
                 "when": "پایان شب"}})
    found = audit_mod._quantity_off_enum(audit_mod._Walk(root, store))
    assert [i["code"] for i in found] == ["quantity_off_enum"]


def test_note_targets_retired(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    item = _entry("T-1", "item", "ing_1", "پنیر", {"category": "ingredient",
                                                   "unit": "g"})
    report = _apply(root, [item], "1")
    item_id = report["id_map"]["T-1"]
    _apply(root, [_note("T-1", "note_aa11bb22cc33", "واحد این قلم روشن نیست",
                        about=item_id)], "2")
    assert "note_targets_retired" not in _codes(audit(root))
    retire(root, item_id, None, _run_dir(root, "3"))
    found = _of(audit(root), "note_targets_retired")
    assert len(found) == 1 and item_id in found[0]["message"]


def test_import_unresolved_only_while_the_source_is_a_locator(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _template()
    record["data"]["instances"][0]["imports"] = [
        {"key": "gz__s11__im1", "source": {"spreadsheetId": "W",
                                           "sheet": "روزانه"},
         "range": "A:X"}]
    _apply(root, [record], "1")
    found = _of(audit(root), "import_unresolved")
    assert len(found) == 1 and "روزانه" in found[0]["message"]


def test_stale_prose_after_a_field_is_settled(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    a = _const_delta(5, key="tol"); a["entries"][0]["statement"] = "حد مجاز نامشخص است"
    apply(root, _write(root, "a.json", a), _run_dir(root, "1"))
    apply(root, _write(root, "b.json", _const_delta(4, key="tol")),
          _run_dir(root, "2"))
    assert "stale_prose" not in _codes(audit(root))       # still disputed
    entry = [e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol"][0]
    chosen = [x for x in entry["accounts"] if x["value"] == 4][0]
    resolve(root, entry["id"], "data/outputs/v/value", chosen["id"],
            _run_dir(root, "3"))
    found = _of(audit(root), "stale_prose")
    assert len(found) == 1 and found[0]["id"] == entry["id"]


def test_flags_over_sees_the_store_and_the_entries_together(tmp_path):
    """§2.6 step 7: `assemble` calls the six disk-free checks over `load_store`
    plus what it is about to write, so its flags and the audit's findings are
    one implementation and cannot drift."""
    root = _root(tmp_path); _seed_units(root)
    _apply(root, [_template(),
                  _bound_rule("T-2", "enheraf", "انحراف", "gz__s11__j__r6",
                              "J6:J15")], "1")
    stored = [e for e in load_store(root)["rule"]["entries"]
              if e["key"] == "enheraf"][0]
    incoming = dict(stored, id="T-4", key="enheraf_lain", title="انحراف لاین")
    flags = flags_over(root, [incoming])
    assert {f["code"] for f in flags} == {"equal_expr", "two_writers"}
    assert all("T-4" in f["message"] for f in flags)
    assert not (root / "facts" / "records.json").with_suffix(".tmp").exists()


# --------------------------------------------------------------------------- #
# check
# --------------------------------------------------------------------------- #

def _cite(root, text="متن اول"):
    p = root / "meetings" / "transcripts" / "c.txt"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    return p


def test_check_reports_a_moved_source(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    transcript = _cite(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))
    assert "source_moved" not in _codes(check(root))
    transcript.write_text("متن بازنویسی‌شده", encoding="utf-8")
    found = _of(check(root), "source_moved")
    assert len(found) == 1 and "meetings/transcripts/c.txt" in found[0]["message"]


def test_check_reports_an_absent_estate_file_under_its_own_code(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    record = _entry("T-1", "record", "g__ruzane", "روزانه", {
        "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S", "sheetId": 1, "sheet": "روزانه",
                     "hidden": False}})
    record["source"] = [{"type": "sheet",
                         "ref": "attachments/sheets/G/G.xlsx", "sheet": "روزانه"}]
    _apply(root, [record], "1")
    found = _of(check(root), "estate_absent")
    assert len(found) == 1 and "G.xlsx" in found[0]["message"]
    assert "source_moved" not in _codes(check(root))


def test_check_uncited_workbook_and_the_coverage_count(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _manifest(root, [_workbook("S1", "cited_wb"), _workbook("S2", "quiet_wb")])
    read = _entry("T-1", "record", "cited__ruzane", "روزانه", {
        "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S1", "sheetId": 1, "sheet": "روزانه",
                     "hidden": False}})
    stub = _entry("T-2", "record", "ext_s2", "کتاب ناشناخته", {
        "stub": True, "grain": "workbook", "medium": "sheet", "role": "log",
        "location": {"spreadsheetId": "S2"}})
    _apply(root, [read, stub], "1")
    found = _of(check(root), "uncited_workbook")
    assert len(found) == 1 and "quiet_wb" in found[0]["message"]  # a stub is not read
    assert coverage(root) == {"read": 1, "total": 2}


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _cli(root, *args):
    return subprocess.run([sys.executable, "-m", "merge.cli", "facts", *args],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": "",
                               "SCHEMA_DIR": str(SCHEMAS), "SYSTEMROOT": ""})


def test_cli_audit_and_check_print_one_line_each_and_exit_zero(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    _manifest(root, [_workbook("S1", "cited_wb"), _workbook("S2", "quiet_wb")])
    _cite(root)
    apply(root, _write(root, "a.json", _const_delta()), _run_dir(root, "1"))

    proc = _cli(root, "audit")
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.splitlines()
    assert lines and any(line.startswith("unconsumed_constant F-") for line in lines)

    proc = _cli(root, "check")
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.splitlines()
    assert lines[-1] == "coverage: 0 of 2 workbooks read"
    assert any(line.startswith("uncited_workbook  ") for line in lines)  # id blank
