"""The bundles a served fact entry needs (spec §17's closing ui-backend bullet).

The load-bearing assertion is one sentence of the spec: *a served entry's
`resolved`, `row_titles` and `path_labels` cover every id, item key, row key
and red path it references, so no screen can fall back to a raw key.*
`test_served_maps_cover_every_key_an_entry_references` is that sentence,
asserted over every entry of a store built to carry one of each shape.

The fixture is hand-written JSON, and deliberately not the `data_root`
fixture's two-entry store: that one is shared with `test_facts_confirmations`,
which indexes its rows by position. (The merge-only rule of QF-2 binds the
live store, not a test fixture.) Its content follows §7's and §9's own
examples — the Italian-pizza BOM, the «مانده شب» form, the `gozaresh_cb`
report rule — so the Persian labels asserted here are the spec's own, not
invented for the test.
"""
import json

import pytest
from inja_ui_backend import facts_store
from inja_ui_backend.store import manifest

MAVAD = "15M2ovUmMavadeAvalie"      # cited by the BOM record   -> read
PITZA = "1dmH8tCqOuqNrPitzaChale"   # cited by a stub only      -> not read
GOZARESH = "1shXFbKyvEkpGozareshM"  # cited by nothing          -> not read

NOW = "2026-08-29T10:00:00Z"


def _entry(fact_id, kind, key, title, data, **rest):
    entry = {"id": fact_id, "kind": kind, "key": key, "title": title,
             "statement": f"بیان {title}",
             "scope": {"departments": ["cooking"], "branches": []},
             "source": [{"type": "sheet", "ref": "attachments/sheets/x.xlsx"}],
             "status": "confirmed", "retired": False, "updated_at": NOW,
             "data": data}
    entry.update(rest)
    return entry


def _item(fact_id, key, title, code, category):
    return _entry(fact_id, "item", key, title,
                  {"code": code, "category": category, "unit": "g"})


#: Four items: §9's `prod_61__ing_41` row composes «اینجا پیتزا — قارچ».
ITEMS = [
    _item("F-00010", "prod_61", "اینجا پیتزا", "#61", "product"),
    _item("F-00011", "ing_1", "پنیر پیتزا", "##1", "ingredient"),
    _item("F-00012", "ing_26", "خمیر پیتزا", "##26", "ingredient"),
    _item("F-00013", "ing_41", "قارچ", "##41", "ingredient"),
]

#: The BOM (§7's reference record): one disputed cell, one `null` cell, one
#: reconciled cell — three distinct sources of a `path_labels` key.
BOM = _entry(
    "F-00020", "record", "mavad__pizza_italian", "پیتزا ایتالیایی",
    {"medium": "sheet", "role": "reference",
     "location": {"spreadsheetId": MAVAD, "sheetId": 2,
                  "sheet": "پیتزا ایتالیایی", "hidden": False},
     "grain": "one row per (product, ingredient)",
     "fields": [
         {"key": "product", "title": "محصول", "type": "string",
          "refItems": {"namespace": "#", "resolved_by": "code"}},
         {"key": "ingredient", "title": "ماده اولیه", "type": "string",
          "refItems": {"namespace": "##", "resolved_by": "code"}},
         {"key": "grams", "title": "گرم", "type": "number", "unit": "g"}],
     "primaryKey": ["product", "ingredient"],
     "rows": [
         {"key": "prod_61__ing_1", "product": "prod_61", "ingredient": "ing_1",
          "grams": 250},
         {"key": "prod_61__ing_26", "product": "prod_61", "ingredient": "ing_26",
          "grams": None},
         {"key": "prod_61__ing_41", "product": "prod_61", "ingredient": "ing_41",
          "grams": 180}],
     "reconciled_against": [
         {"cell": {"field": "grams", "row": "prod_61__ing_41"},
          "against": {"ref": "F-00031", "field": "mushroom_g"}}]},
    status="disputed",
    accounts=[{"id": "a1b2c3d4", "field": "data/rows/prod_61__ing_1/grams",
               "statement": "«۲۵۰ گرم پنیر»", "value": 250,
               "source": {"type": "voice", "ref": "meetings/cooking-1405-05-26.md"},
               "speaker_role": "سرلاین", "status": "open"}],
    processes=[{"ref": "cooking-001"}, {"ref": "cooking-002"}])

#: The «مانده شب» form (§7): fixed rows carrying their own title, and a
#: printed-nothing `unit: null` — the second shape `row_titles` must cover.
FORM = _entry(
    "F-00021", "record", "mande_shab_farangi", "مانده شب فرنگی",
    {"medium": "paper", "role": "log",
     "location": {"path": "departments/cooking/attachments/photo.jpg"},
     "fields": [
         {"key": "start_stock", "title": "مانده اول شب", "type": "number",
          "unit": None},
         {"key": "delta", "title": "اختلاف روز", "type": "number",
          "derived": {"ref": "F-00034"}}],
     "rows": [{"key": "burger", "title": "برگر"},
              {"key": "mini_burger", "title": "مینی برگر"}]},
    status="unknown")

#: The reader: one rule naming five different targets through five edges.
RULE = _entry(
    "F-00030", "rule", "gozaresh_cb__pizza__standard_use", "مصرف استاندارد",
    {"inputs": [{"key": "bom_g", "title": "گرم هر محصول", "unit": "g",
                 "from": {"ref": "F-00020", "field": "grams"},
                 "via": {"ref": "F-00032"}}],
     "outputs": [{"key": "standard_use", "title": "مصرف استاندارد", "unit": "g",
                  "nature": "standard",
                  "writes_to": {"ref": "F-00021", "field": "start_stock"}}],
     "expr": "standard_use = sum over bom_g of (bom_g * 1)", "lang": "feel",
     "calls": [{"ref": "F-00033"}], "port": False, "edge_cases": []},
    accounts=[{"id": "0f0f0f0f", "field": "data/expr",
               "statement": "روایت دوم از فرمول",
               "source": {"type": "voice", "ref": "meetings/x.md"},
               "status": "chosen"}],
    processes=[{"ref": "cooking-003"}])

CONSTANT = _entry("F-00031", "rule", "mushroom_g_per_pizza", "قارچ هر پیتزا",
                  {"inputs": [],
                   "outputs": [{"key": "mushroom_g", "title": "قارچ",
                                "unit": "g", "nature": "standard", "value": 180}],
                   "calls": [], "port": False, "edge_cases": []})
VIA = _entry("F-00032", "rule", "kg_to_g", "تبدیل کیلوگرم به گرم",
             {"inputs": [{"key": "kg", "title": "کیلوگرم", "unit": "kg"}],
              "outputs": [{"key": "g", "title": "گرم", "unit": "g"}],
              "expr": "g = kg * 1000", "lang": "feel", "calls": [],
              "port": False, "edge_cases": []})
CALLED = _entry("F-00033", "rule", "get_value_by_id", "getValueById",
                {"inputs": [{"key": "id", "title": "کد"}],
                 "outputs": [{"key": "value", "title": "مقدار"}],
                 "expr": "value = id", "lang": "feel", "calls": [],
                 "port": True, "edge_cases": []})
DERIVED = _entry("F-00034", "rule", "farangi__delta", "اختلاف روز",
                 {"inputs": [{"key": "start", "title": "اول شب"}],
                  "outputs": [{"key": "delta", "title": "اختلاف"}],
                  "expr": "delta = start", "lang": "feel", "calls": [],
                  "port": False, "edge_cases": []})

#: A measurement writes into the BOM — `writes_to` at the top of `data`,
#: where a rule carries it on an output instead.
MEASUREMENT = _entry(
    "F-00040", "measurement", "pizza_cheese__mass", "وزن پنیر پیتزا",
    {"of": {"ref": "F-00011"}, "quantity": "mass", "unit": "g",
     "method": "ترازو", "when": "پایان شیفت", "by": "سرلاین",
     "writes_to": {"ref": "F-00020", "field": "grams"}})

#: A workbook stub (QF-20): identity and nothing else, so it never makes its
#: workbook "read".
STUB = _entry("F-00050", "record", "ext_1dmh8tcqouqn", "کاربرگ پیتزا",
              {"medium": "sheet", "role": "reference", "stub": True,
               "grain": "workbook", "location": {"spreadsheetId": PITZA}})

ENTRIES = ITEMS + [BOM, FORM, RULE, CONSTANT, VIA, CALLED, DERIVED,
                   MEASUREMENT, STUB]

PROCESSES = [
    {"id": "cooking-001", "department": "cooking", "name": "پخت پیتزا",
     "nodes": [{"id": "n1"}]},
    {"id": "cooking-002", "department": "cooking", "name": "پخت قدیمی",
     "tombstoned": True, "superseded_by": ["cooking-003"], "nodes": []},
    {"id": "cooking-003", "department": "cooking", "name": "پخت تازه",
     "nodes": []},
]

MANIFEST = {
    "schema_version": 1,
    "branches": [{"code": "chalebagh", "name": "چاله‌باغ"},
                 {"code": "naharkhoran", "name": "ناهارخوران"}],
    "workbooks": [
        {"spreadsheetId": MAVAD, "short": "mavad", "confirmed": True},
        {"spreadsheetId": PITZA, "short": "pitza_cb", "confirmed": True},
        {"spreadsheetId": GOZARESH, "short": "gozaresh_cb", "confirmed": True}],
}

_FILES = {"item": "items.json", "record": "records.json",
          "measurement": "measurements.json", "rule": "rules.json",
          "note": "notes.json"}


def _dump(path, doc):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


@pytest.fixture
def root(tmp_path):
    """A DATA_ROOT holding the store above, its processes and its manifest."""
    for kind, filename in _FILES.items():
        _dump(tmp_path / "facts" / filename,
              {"schema_version": 1,
               "entries": [e for e in ENTRIES if e["kind"] == kind]})
    _dump(tmp_path / "facts" / ".index.json",
          {"schema_version": 1,
           "entries": [{"id": e["id"], "kind": e["kind"], "key": e["key"],
                        "title": e["title"], "scope": e["scope"],
                        "status": e["status"], "retired": e["retired"],
                        "updated_at": e["updated_at"]} for e in ENTRIES]})
    for doc in PROCESSES:
        _dump(tmp_path / "departments" / "cooking" / "processes"
              / f"{doc['id']}.json", doc)
    _dump(tmp_path / "attachments" / "sheets" / "manifest.json", MANIFEST)
    return tmp_path


# --------------------------------------------------------------------------- #
# The load-bearing one: nothing an entry references is served as a raw key
# --------------------------------------------------------------------------- #

def _refs_anywhere(node, out):
    """Every `ref` value anywhere in `node`, found without the shape test
    `facts_store` uses — an independent walk, so this test cannot pass by
    agreeing with the implementation it checks."""
    if isinstance(node, dict):
        if isinstance(node.get("ref"), str):
            out.add(node["ref"])
        for value in node.values():
            _refs_anywhere(value, out)
    elif isinstance(node, list):
        for member in node:
            _refs_anywhere(member, out)
    return out


def _referenced(entry):
    """What the served maps must between them cover: ids, item keys, row keys
    and red paths."""
    data = entry["data"]
    ids = {r for r in _refs_anywhere(entry, set())
           if r.startswith(("F-", "T-")) or r.startswith("cooking-")}
    ref_columns = [f["key"] for f in data.get("fields") or [] if "refItems" in f]
    item_keys = {row[column] for row in data.get("rows") or []
                 for column in ref_columns if isinstance(row.get(column), str)}
    row_keys = {row["key"] for row in data.get("rows") or []}
    red = {p for paths in facts_store.red_paths(entry).values() for p in paths}
    red |= {a["field"] for a in entry.get("accounts") or []}
    red |= {f"data/rows/{rc['cell']['row']}/{rc['cell']['field']}"
            for rc in data.get("reconciled_against") or []}
    return ids, item_keys, row_keys, red


@pytest.mark.parametrize("fact_id", [e["id"] for e in ENTRIES])
def test_served_maps_cover_every_key_an_entry_references(root, fact_id):
    """Spec §17: «a served entry's `resolved`, `row_titles` and `path_labels`
    cover every id, item key, row key and red path it references, so no
    screen can fall back to a raw key»."""
    entry = facts_store.load_entry(root, fact_id)
    ids, item_keys, row_keys, red = _referenced(entry)

    resolved = facts_store.resolved_map(root, entry)
    titles = facts_store.row_titles(root, entry)
    labels = facts_store.path_labels(root, entry)

    assert ids <= set(resolved), f"{fact_id}: ids missing from resolved"
    assert item_keys <= set(resolved), f"{fact_id}: item keys missing"
    assert row_keys == set(titles), f"{fact_id}: row keys missing from row_titles"
    assert red <= set(labels), f"{fact_id}: red paths missing from path_labels"

    # Covered means labelled, not merely present.
    for key, label in resolved.items():
        assert label.get("title"), f"{fact_id}: {key} resolved to no title"
    assert all(labels.values()), f"{fact_id}: an empty path label"


def test_resolved_carries_kind_title_and_an_item_code(root):
    resolved = facts_store.resolved_map(root, facts_store.load_entry(root, "F-00020"))
    assert resolved["ing_41"] == {"kind": "item", "title": "قارچ", "code": "##41"}
    assert resolved["F-00031"] == {"kind": "rule", "title": "قارچ هر پیتزا"}
    assert resolved["cooking-001"] == {"kind": "process", "title": "پخت پیتزا"}


def test_resolved_omits_a_dangling_ref(root):
    """A `{ref}` whose target is gone is an omission, never an exception and
    never invented Persian: task 19 and the UI decide what an absent key
    means."""
    entry = facts_store.load_entry(root, "F-00020")
    entry["data"]["reconciled_against"][0]["against"]["ref"] = "F-09999"
    entry["processes"].append({"ref": "cooking-404"})
    resolved = facts_store.resolved_map(root, entry)
    assert "F-09999" not in resolved
    assert "cooking-404" not in resolved


# --------------------------------------------------------------------------- #
# row_titles and path_labels
# --------------------------------------------------------------------------- #

def test_reference_rows_compose_from_ref_items_in_primary_key_order(root):
    titles = facts_store.row_titles(root, facts_store.load_entry(root, "F-00020"))
    assert titles == {"prod_61__ing_1": "اینجا پیتزا — پنیر پیتزا",
                      "prod_61__ing_26": "اینجا پیتزا — خمیر پیتزا",
                      "prod_61__ing_41": "اینجا پیتزا — قارچ"}


def test_a_log_rows_own_title_wins(root):
    titles = facts_store.row_titles(root, facts_store.load_entry(root, "F-00021"))
    assert titles == {"burger": "برگر", "mini_burger": "مینی برگر"}


def test_path_label_of_a_reference_cell_is_column_then_row(root):
    """§17's own example: `data/rows/prod_61__ing_41/grams` → «گرم — اینجا
    پیتزا — قارچ»."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00020"))
    assert labels["data/rows/prod_61__ing_41/grams"] == "گرم — اینجا پیتزا — قارچ"
    assert labels["data/rows/prod_61__ing_26/grams"] == "گرم — اینجا پیتزا — خمیر پیتزا"


def test_path_labels_cover_the_three_sources_and_nothing_else(root):
    """Red paths, account fields and reconciled cells — the entry's other
    paths are not labelled here (task 19 and the UI ask for what they show)."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00020"))
    assert set(labels) == {"data/rows/prod_61__ing_1/grams",    # open account
                           "data/rows/prod_61__ing_26/grams",   # null cell
                           "data/rows/prod_61__ing_41/grams"}   # reconciled


def test_path_label_of_a_column_leaf_names_the_column(root):
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00021"))
    assert labels["data/fields/start_stock/unit"] == "مانده اول شب › واحد"


def test_path_labels_include_a_settled_account_field(root):
    """A `chosen` account is not red, and its field still needs a label — the
    accounts card groups every account under one."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00030"))
    assert labels["data/expr"] == "فرمول"


# --------------------------------------------------------------------------- #
# red_paths
# --------------------------------------------------------------------------- #

def test_red_paths_split_null_leaves_from_open_accounts(root):
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00020")) == {
        "unknown": ["data/rows/prod_61__ing_26/grams"],
        "disputed": ["data/rows/prod_61__ing_1/grams"]}


def test_red_paths_of_a_form_field(root):
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00021")) == {
        "unknown": ["data/fields/start_stock/unit"], "disputed": []}


def test_a_settled_account_is_not_disputed(root):
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00030")) == {
        "unknown": [], "disputed": []}


# --------------------------------------------------------------------------- #
# consumers — one sub-test per edge kind (QF-37's seven)
# --------------------------------------------------------------------------- #

def _consumer_ids(root, fact_id):
    return [c["id"] for c in facts_store.consumers(root, fact_id)]


def test_consumers_finds_an_inputs_from_edge(root):
    assert facts_store.consumers(root, "F-00020") == [
        {"id": "F-00030", "title": "مصرف استاندارد"},
        {"id": "F-00040", "title": "وزن پنیر پیتزا"}]


def test_consumers_finds_a_via_edge(root):
    assert _consumer_ids(root, "F-00032") == ["F-00030"]


def test_consumers_finds_a_calls_edge(root):
    assert _consumer_ids(root, "F-00033") == ["F-00030"]


def test_consumers_finds_a_rule_output_writes_to_edge(root):
    assert _consumer_ids(root, "F-00021") == ["F-00030"]


def test_consumers_finds_a_measurement_writes_to_edge(root):
    """A measurement carries `writes_to` at the top of `data`, not on an
    output — the same edge kind, a different place."""
    assert "F-00040" in _consumer_ids(root, "F-00020")


def test_consumers_finds_a_fields_derived_edge(root):
    assert _consumer_ids(root, "F-00034") == ["F-00021"]


def test_consumers_finds_a_ref_items_cell(root):
    """A `refItems` cell holds the item's **key** (QF-37's one exception), so
    the join is on the target's key, not on its id."""
    assert _consumer_ids(root, "F-00013") == ["F-00020"]


def test_consumers_finds_a_reconciled_against_edge(root):
    assert _consumer_ids(root, "F-00031") == ["F-00020"]


def test_consumers_of_an_unread_entry_is_empty(root):
    assert facts_store.consumers(root, "F-00050") == []
    assert facts_store.consumers(root, "F-09999") == []


# --------------------------------------------------------------------------- #
# process_links
# --------------------------------------------------------------------------- #

def test_process_links_marks_a_tombstoned_process_with_its_heir(root):
    links = facts_store.process_links(root, facts_store.load_entry(root, "F-00020"))
    assert links == [
        {"ref": "cooking-001", "title": "پخت پیتزا", "tombstoned": False,
         "heir": None},
        {"ref": "cooking-002", "title": "پخت قدیمی", "tombstoned": True,
         "heir": "cooking-003"}]


def test_process_links_of_an_absent_file_is_a_value_not_an_exception(root):
    entry = facts_store.load_entry(root, "F-00020")
    entry["processes"] = [{"ref": "dining-404"}]
    assert facts_store.process_links(root, entry) == [
        {"ref": "dining-404", "title": None, "tombstoned": False, "heir": None}]


def test_process_links_of_an_entry_that_links_none(root):
    assert facts_store.process_links(root, facts_store.load_entry(root, "F-00040")) == []


# --------------------------------------------------------------------------- #
# coverage and the manifest
# --------------------------------------------------------------------------- #

def test_coverage_counts_workbooks_a_non_stub_record_cites(root):
    """`PITZA` is named only by a stub — identity and nothing else (QF-20) —
    so it is not read; `GOZARESH` is named by nothing."""
    assert facts_store.coverage(root) == {"read": 1, "total": 3}


def test_manifest_reads_branches_and_counts_workbooks(root):
    assert manifest.branches(root) == MANIFEST["branches"]
    assert manifest.workbook_count(root) == 3
    assert manifest.read_manifest(root)["workbooks"][0]["short"] == "mavad"


# --------------------------------------------------------------------------- #
# An empty deployment: every one of these runs inside request handling
# --------------------------------------------------------------------------- #

def test_an_absent_store_and_manifest_read_as_empty(tmp_path):
    assert facts_store.coverage(tmp_path) == {"read": 0, "total": 0}
    assert manifest.read_manifest(tmp_path) == {"schema_version": 1,
                                                "branches": [], "workbooks": []}
    assert manifest.branches(tmp_path) == []
    assert manifest.workbook_count(tmp_path) == 0
    assert facts_store.consumers(tmp_path, "F-00020") == []
    assert facts_store.resolved_map(tmp_path, BOM) == {}
    assert facts_store.row_titles(tmp_path, BOM) == {
        "prod_61__ing_1": "prod_61__ing_1",
        "prod_61__ing_26": "prod_61__ing_26",
        "prod_61__ing_41": "prod_61__ing_41"}
    assert set(facts_store.path_labels(tmp_path, BOM)) == {
        "data/rows/prod_61__ing_1/grams", "data/rows/prod_61__ing_26/grams",
        "data/rows/prod_61__ing_41/grams"}


def test_a_malformed_store_file_is_skipped_not_raised(root):
    (root / "facts" / "items.json").write_text("{ not json", encoding="utf-8")
    assert facts_store.resolved_map(root, BOM) == {
        "F-00031": {"kind": "rule", "title": "قارچ هر پیتزا"},
        "cooking-001": {"kind": "process", "title": "پخت پیتزا"},
        "cooking-002": {"kind": "process", "title": "پخت قدیمی"}}
