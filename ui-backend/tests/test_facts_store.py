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
import re

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
    #: An item whose estate code nobody stated and whose carton count is not
    #: printed: two `null` leaves outside the keyed groups, one at the top of
    #: `data` and one a level down.
    _entry("F-00015", "item", "oil_fry", "روغن سرخ‌کن",
           {"code": None, "code_absent": False, "category": "consumable",
            "unit": "l", "pack": {"size": None, "unit": "pcs"}},
           status="unknown"),
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
    # QF-8: each process link is evidenced by a `process` source naming a
    # node. `n1` is still in the file; `n9` was removed by a restructure.
    source=[{"type": "sheet", "ref": "attachments/sheets/x.xlsx"},
            {"type": "process", "ref": "departments/cooking/processes/cooking-001.json",
             "node": "n1", "quote": "گرم هر ماده در دستور پیتزا"},
            {"type": "process", "ref": "departments/cooking/processes/cooking-001.json",
             "node": "n9", "quote": "وزن‌کشی مواد"}],
    processes=[{"ref": "cooking-001"}, {"ref": "cooking-002"}])

#: The «مانده شب» form (§7): fixed rows carrying their own title, and a
#: printed-nothing `unit: null` — the second shape `row_titles` must cover.
FORM = _entry(
    "F-00021", "record", "mande_shab_farangi", "مانده شب فرنگی",
    {"medium": "paper", "role": "log",
     "location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"},
     "fields": [
         {"key": "start_stock", "title": "مانده اول شب", "type": "number",
          "unit": None},
         {"key": "delta", "title": "اختلاف روز", "type": "number",
          "derived": {"ref": "F-00034"}}],
     # §7's weekday-conditional row, whose condition nobody wrote down: a
     # `null` on a row's own reserved `when`, which Appendix D labels «فقط در»
     # in a row's context and «زمان» in a measurement's.
     "rows": [{"key": "burger", "title": "برگر"},
              # A row's own lifecycle leaf (§9), carrying the key with no
              # value — QF-6's `unknown`, and a red path like any other.
              {"key": "mini_burger", "title": "مینی برگر", "valid_to": None},
              {"key": "staff_sugar", "title": "قند پرسنلی (پنجشنبه‌ها)",
               "when": None}]},
    status="unknown")

#: The BOM's cached copy in the report workbook (§7): `role: mirror`,
#: `mirror_of` the table, and no rows of its own.
MIRROR = _entry(
    "F-00022", "record", "gozaresh_cb__table_ingredients", "نسخهٔ پیوندی مواد اولیه",
    {"medium": "sheet", "role": "mirror", "mirror_of": {"ref": "F-00020"},
     "location": {"spreadsheetId": GOZARESH, "sheetId": 7,
                  "sheet": "Table_Ingredients_Pizza", "hidden": True}})

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

#: A constant, whose single output is *of* an item (§7) and whose value is
#: `informal` — a `field_status` line, which is never red and still needs a
#: label (§14.8).
CONSTANT = _entry("F-00031", "rule", "mushroom_g_per_pizza", "قارچ هر پیتزا",
                  {"inputs": [],
                   "outputs": [{"key": "mushroom_g", "title": "قارچ",
                                "unit": "g", "nature": "standard", "value": 180,
                                "of": {"ref": "F-00013"}}],
                   "calls": [], "port": False, "edge_cases": []},
                  status="informal",
                  field_status={"data/outputs/mushroom_g/value": "informal"})
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
#: The other branch's copy of the reader (QF-4): `template_of` the rule
#: above, with the drift the audit reports.
INSTANCE = _entry(
    "F-00035", "rule", "gozaresh_nk__pizza__standard_use",
    "مصرف استاندارد (ناهارخوران)",
    {"inputs": [{"key": "bom_g", "title": "گرم هر محصول", "unit": "g"}],
     "outputs": [{"key": "standard_use", "title": "مصرف استاندارد", "unit": "g",
                  "nature": "standard"}],
     "expr": "standard_use = bom_g * 1.02", "lang": "feel", "calls": [],
     "template_of": {"ref": "F-00030"}, "divergence": "drift",
     "port": False, "edge_cases": []})

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

#: §11's contested scalar: the incumbent materialised beside the challenger,
#: so the entry is disputed on an **envelope** path — QF-7 lists `title` and
#: `scope` as leaves beside `data/expr`, and `red_paths` carries an account's
#: field with no prefix filter. Nothing else in this store disputes one, which
#: is why the raw pass-through survived a round.
DISPUTED_TITLE = _entry(
    "F-00060", "note", "note_farangi_naming", "نام قلم در فرم انبار", {},
    status="disputed",
    accounts=[{"id": "11112222", "field": "title",
               "statement": "«اسمش توی فرم انبار خمیر آماده است»",
               "source": {"type": "voice", "ref": "meetings/warehouse.md"},
               "speaker_role": "انبار دار", "status": "open"},
              {"id": "33334444", "field": "scope/departments",
               "statement": "«این فقط مال آشپزخانه نیست، انبار هم دارد»",
               "source": {"type": "voice", "ref": "meetings/warehouse.md"},
               "speaker_role": "انبار دار", "status": "open"}])

#: A workbook stub (QF-20): identity and nothing else, so it never makes its
#: workbook "read".
STUB = _entry("F-00050", "record", "ext_1dmh8tcqouqn", "کاربرگ پیتزا",
              {"medium": "sheet", "role": "reference", "stub": True,
               "grain": "workbook", "location": {"spreadsheetId": PITZA}})

ENTRIES = ITEMS + [BOM, FORM, MIRROR, RULE, CONSTANT, VIA, CALLED, DERIVED,
                   INSTANCE, MEASUREMENT, DISPUTED_TITLE, STUB]

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
        {"spreadsheetId": MAVAD, "short": "mavad", "confirmed": True,
         "file": "Mavade Avalie.xlsx"},
        {"spreadsheetId": PITZA, "short": "pitza_cb", "confirmed": True,
         "file": "Pitza.xlsx"},
        {"spreadsheetId": GOZARESH, "short": "gozaresh_cb", "confirmed": True,
         "file": "Gozaresh markazi.xlsx"}],
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


#: The two id grammars, anchored (`fullmatch`, never `startswith`) — a
#: `startswith("cooking-")` filter would quietly exempt a link to any other
#: department from the coverage demand, in the very test that pins it.
_ID_RE = re.compile(r"F-[0-9]{5}|T-[0-9]+|[a-z]+-[0-9]{3}")


def _referenced(entry):
    """What the served maps must between them cover: ids, item keys, row keys
    and red paths."""
    data = entry["data"]
    ids = {r for r in _refs_anywhere(entry, set()) if _ID_RE.fullmatch(r)}
    ref_columns = [f["key"] for f in data.get("fields") or [] if "refItems" in f]
    item_keys = {row[column] for row in data.get("rows") or []
                 for column in ref_columns if isinstance(row.get(column), str)}
    row_keys = {row["key"] for row in data.get("rows") or []}
    red = {p for paths in facts_store.red_paths(entry).values() for p in paths}
    red |= set(entry.get("field_status") or {})
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

    # Covered means *labelled*, not merely present. `path_labels` always emits
    # a key for every path it is given, and a raw path is truthy — so a
    # membership test alone cannot fail on the defect §17 names. The label
    # must differ from the path it labels.
    for key, label in resolved.items():
        assert label.get("title"), f"{fact_id}: {key} resolved to no title"
    for path, label in labels.items():
        assert label and label != path, f"{fact_id}: {path} labelled with itself"


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
    assert titles == {"burger": "برگر", "mini_burger": "مینی برگر",
                      "staff_sugar": "قند پرسنلی (پنجشنبه‌ها)"}


def test_path_label_of_a_reference_cell_is_column_then_row(root):
    """§17's own example: `data/rows/prod_61__ing_41/grams` → «گرم — اینجا
    پیتزا — قارچ»."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00020"))
    assert labels["data/rows/prod_61__ing_41/grams"] == "گرم — اینجا پیتزا — قارچ"
    assert labels["data/rows/prod_61__ing_26/grams"] == "گرم — اینجا پیتزا — خمیر پیتزا"


def test_path_labels_cover_the_four_sources_and_nothing_else(root):
    """Red paths, `field_status` lines, account fields and reconciled cells —
    the entry's other paths are not labelled here (task 19 and the UI ask for
    what they show)."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00020"))
    assert set(labels) == {"data/rows/prod_61__ing_1/grams",    # open account
                           "data/rows/prod_61__ing_26/grams",   # null cell
                           "data/rows/prod_61__ing_41/grams"}   # reconciled


def test_path_labels_include_a_field_status_line(root):
    """§14.8: the استنباطی/عرفی markers are drawn, and a marker beside an
    unlabelled path is the raw-key fallback §17 forbids. An `informal` line is
    never red, so `red_paths` does not carry it."""
    entry = facts_store.load_entry(root, "F-00031")
    assert facts_store.red_paths(entry) == {"unknown": [], "disputed": []}
    assert facts_store.path_labels(root, entry) == {
        "data/outputs/mushroom_g/value": "قارچ › مقدار"}


def test_path_label_of_a_column_leaf_names_the_column(root):
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00021"))
    assert labels["data/fields/start_stock/unit"] == "مانده اول شب › واحد"


def test_path_label_of_a_rows_reserved_leaf_takes_the_rows_reading(root):
    """A row's own `when` is «فقط در» (Appendix D), not the measurement's
    «زمان». The row branch names a declared column for its leaf, and the
    reserved row-structure names — which no `fields[].key` may take — are the
    exception it has to consult the context map for."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00021"))
    assert labels["data/rows/staff_sugar/when"] == "فقط در — قند پرسنلی (پنجشنبه‌ها)"


def test_path_labels_of_leaves_outside_the_keyed_groups(root):
    """The general branch: a payload path that names no column still reads as
    Persian. `data/code` is the canonical one — an item whose estate code
    nobody stated — and `data/pack/size` walks a plain nested object, where
    the whole path used to come back raw."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00015"))
    assert labels == {"data/code": "کد", "data/pack/size": "بسته › تعداد"}


def test_path_labels_include_a_settled_account_field(root):
    """A `chosen` account is not red, and its field still needs a label — the
    accounts card groups every account under one."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00030"))
    assert labels["data/expr"] == "فرمول"


# --------------------------------------------------------------------------- #
# red_paths
# --------------------------------------------------------------------------- #

def test_path_label_of_a_rows_lifecycle_leaf(root):
    """A row's `valid_to` is Appendix D's «معتبر تا» — an envelope-table name
    that is a payload leaf at row level (§9), and read as `valid_to` before
    it was transcribed."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00021"))
    assert labels["data/rows/mini_burger/valid_to"] == "معتبر تا — مینی برگر"


#: §7's reservation: the names a row object keeps for its own structure, which
#: no `fields[].key` may take (`engine/merge_facts/content.py` enforces it).
#: Every one of them can therefore be a `null` leaf of a row.
RESERVED_ROW_NAMES = ("key", "title", "unit", "unit_raw", "section", "when",
                      "open", "retired", "valid_to", "supersedes")


def test_every_reserved_row_name_reads_as_persian(root):
    """The guard against a fifth trip: `_field_title`'s last fallback is the
    ASCII key, so a reserved name missing from Appendix D's transcription
    shows up on a Persian-only screen. `key` is the one exception — QF-7
    addresses a keyed member *by* its key, so `_null_paths` strips it and
    `data/rows/r/key` is not a path that exists."""
    row = {name: None for name in RESERVED_ROW_NAMES}
    row["key"] = "r"
    entry = {"data": {"rows": [row]}}
    labels = facts_store.path_labels(root, entry)

    assert set(labels) == {f"data/rows/r/{n}" for n in RESERVED_ROW_NAMES
                           if n != "key"}
    for path, label in labels.items():
        leaf = path.rsplit("/", 1)[1]
        assert leaf not in label, f"{path} labelled with its own ASCII key"


def test_path_labels_of_an_envelope_path(root):
    """§17 says «every red path», with no `data`-rooted qualifier, and QF-7
    lists `title` and `scope` beside `data/expr`. A disputed title is §11's
    own mechanism, not a hypothetical, so these must read as Persian like any
    payload path. `scope/departments` composes from the two envelope names
    rather than needing a compound label of its own."""
    labels = facts_store.path_labels(root, facts_store.load_entry(root, "F-00060"))
    assert labels == {"title": "عنوان",
                      "scope/departments": "دامنه › دپارتمان‌ها"}


def test_an_envelope_account_is_red(root):
    """The half that makes the label reachable: `red_paths`'s `disputed` is
    every open account's field, whatever it names."""
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00060")) == {
        "unknown": [], "disputed": ["scope/departments", "title"]}


def test_red_paths_split_null_leaves_from_open_accounts(root):
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00020")) == {
        "unknown": ["data/rows/prod_61__ing_26/grams"],
        "disputed": ["data/rows/prod_61__ing_1/grams"]}


def test_red_paths_of_a_form_field(root):
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00021")) == {
        "unknown": ["data/fields/start_stock/unit",
                    "data/rows/mini_burger/valid_to",
                    "data/rows/staff_sugar/when"], "disputed": []}


def test_a_settled_account_is_not_disputed(root):
    assert facts_store.red_paths(facts_store.load_entry(root, "F-00030")) == {
        "unknown": [], "disputed": []}


#: §9's shape: one withdrawn row carrying a blank cell and a dispute on it,
#: one live row carrying a dispute of its own. Hand-written rather than added
#: to the store fixture above, because half the assertions in this file are
#: whole-store equalities that a sixth record would move.
def _retired_row_entry() -> dict:
    return {
        "id": "F-00099", "kind": "record", "key": "bom_retired",
        "title": "جدول با ردیف بازنشسته", "statement": "بیان",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [], "status": "unknown", "retired": False, "updated_at": NOW,
        "accounts": [
            {"id": "aaaaaaaa", "field": "data/rows/dead/grams",
             "statement": "۹", "value": 9, "source": {"type": "chat"},
             "status": "open"},
            {"id": "bbbbbbbb", "field": "data/rows/live/grams",
             "statement": "۸", "value": 8, "source": {"type": "chat"},
             "status": "open"}],
        "data": {"medium": "sheet", "role": "reference", "location": {},
                 "fields": [{"key": "grams", "title": "گرم", "type": "number"}],
                 "rows": [{"key": "dead", "grams": None, "retired": True,
                           "valid_to": "1404-01-01"},
                          {"key": "live", "grams": 180}]}}


def test_a_retired_rows_nulls_and_open_accounts_leave_the_red_set():
    """§9: "Retired rows are omitted by `export`, excluded from the red rollup
    and QF-44's readiness test, and their `null` cells and open accounts leave
    the red set." Counted, they made the record permanently red on a screen
    whose engine-derived `status` said the same — both sides agreed, and both
    were wrong."""
    assert facts_store.red_paths(_retired_row_entry()) == {
        "unknown": [], "disputed": ["data/rows/live/grams"]}


def test_the_same_row_alive_is_red_on_both_counts():
    """The control: the retirement is what does the work above, not a fixture
    that happens to carry no red."""
    entry = _retired_row_entry()
    del entry["data"]["rows"][0]["retired"]
    assert facts_store.red_paths(entry) == {
        "unknown": ["data/rows/dead/grams"],
        "disputed": ["data/rows/dead/grams", "data/rows/live/grams"]}


def test_the_red_set_is_the_engines_own(root):
    """THE SEAM. `facts_store` reimplements the engine's walk rather than
    importing it (CLAUDE.md: the ui-backend never imports the engine package),
    so nothing but this test stops the two drifting — and the red count a
    reviewer reads here is the one `merge facts` derived the entry's `status`
    from. The import is the TEST's, not the service's; `test_invariants.py`
    pins that the package itself stays clean.

    Every entry of the fixture store, plus the retired-row shape §9 turns on.
    """
    from merge_facts import null_paths, open_accounts       # test-only import

    entries = facts_store.load_all(root) + [_retired_row_entry()]
    assert len(entries) > 5
    for entry in entries:
        red = facts_store.red_paths(entry)
        assert red["unknown"] == null_paths(entry), entry["id"]
        assert red["disputed"] == sorted({a["field"] for a in open_accounts(entry)}), \
            entry["id"]


# --------------------------------------------------------------------------- #
# consumers — one sub-test per edge kind (QF-37's seven)
# --------------------------------------------------------------------------- #

def _consumer_ids(root, fact_id):
    return [c["id"] for c in facts_store.consumers(root, fact_id)]


def test_consumers_finds_an_inputs_from_edge(root):
    assert facts_store.consumers(root, "F-00020") == [
        {"id": "F-00022", "title": "نسخهٔ پیوندی مواد اولیه"},  # mirror_of
        {"id": "F-00030", "title": "مصرف استاندارد"},           # inputs[].from
        {"id": "F-00040", "title": "وزن پنیر پیتزا"}]           # writes_to


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
    assert _consumer_ids(root, "F-00013") == ["F-00020",   # a refItems cell
                                              "F-00031"]  # an output's `of`


def test_consumers_finds_a_rule_output_of_edge(root):
    """`outputs[].of` names the item an output is *of* (§7) — a use, and one
    of QF-8's typed edges."""
    assert "F-00031" in _consumer_ids(root, "F-00013")


def test_consumers_finds_a_measurement_of_edge(root):
    """A measurement's `of` is at the top of `data`, like its `writes_to`."""
    assert _consumer_ids(root, "F-00011") == ["F-00020",   # a refItems cell
                                              "F-00040"]  # the measurement's `of`


def test_consumers_finds_a_mirror_of_edge(root):
    """Change the table and its cached copies are affected — a mirror reads
    its source (QF-10)."""
    assert "F-00022" in _consumer_ids(root, "F-00020")


def test_consumers_finds_a_template_of_edge(root):
    """QF-4's branch instance. Without this edge, retiring a template answers
    «nothing depends on this» while its instances still do."""
    assert _consumer_ids(root, "F-00030") == ["F-00035"]


def test_consumers_finds_a_reconciled_against_edge(root):
    assert _consumer_ids(root, "F-00031") == ["F-00020"]


def test_consumers_excludes_lifecycle_links_and_process_refs(root):
    """`supersedes`/`superseded_by` relate two versions of one thing rather
    than one entry using another, and `processes[]` is the other id namespace
    — `process_links` serves it."""
    entry = facts_store.load_entry(root, "F-00035")
    entry["supersedes"] = {"ref": "F-00033"}
    entry["data"].pop("template_of")
    _dump(root / "facts" / "rules.json",
          {"schema_version": 1,
           "entries": [entry if e["id"] == "F-00035" else e
                       for e in ENTRIES if e["kind"] == "rule"]})
    assert _consumer_ids(root, "F-00033") == ["F-00030"]   # the `calls[]` edge only
    assert facts_store.consumers(root, "cooking-001") == []


def test_consumers_of_an_unread_entry_is_empty(root):
    assert facts_store.consumers(root, "F-00050") == []
    assert facts_store.consumers(root, "F-09999") == []


# --------------------------------------------------------------------------- #
# process_links
# --------------------------------------------------------------------------- #

def test_process_links_marks_a_tombstoned_process_with_its_heir(root):
    """And the node a restructure removed since the link was written: `n1` is
    still in `cooking-001`, `n9` is not (§14.7's «گرهٔ ارجاع‌شده حذف شده»,
    which nothing else can see — `validate` checked the node at write time)."""
    links = facts_store.process_links(root, facts_store.load_entry(root, "F-00020"))
    assert links == [
        {"ref": "cooking-001", "title": "پخت پیتزا", "tombstoned": False,
         "heir": None, "missing_nodes": ["n9"]},
        {"ref": "cooking-002", "title": "پخت قدیمی", "tombstoned": True,
         "heir": "cooking-003", "missing_nodes": []}]


def test_process_links_of_an_absent_file_is_a_value_not_an_exception(root):
    entry = facts_store.load_entry(root, "F-00020")
    entry["processes"] = [{"ref": "dining-404"}]
    entry["source"] = [s for s in entry["source"] if s["type"] != "process"]
    assert facts_store.process_links(root, entry) == [
        {"ref": "dining-404", "title": None, "tombstoned": False, "heir": None,
         "missing_nodes": []}]


def test_a_cited_node_that_is_still_there_is_not_missing(root):
    entry = facts_store.load_entry(root, "F-00020")
    entry["source"] = [s for s in entry["source"] if s.get("node") != "n9"]
    assert facts_store.process_links(root, entry)[0]["missing_nodes"] == []


def test_process_links_of_an_entry_that_links_none(root):
    assert facts_store.process_links(root, facts_store.load_entry(root, "F-00040")) == []


# --------------------------------------------------------------------------- #
# coverage and the manifest
# --------------------------------------------------------------------------- #

def test_coverage_counts_workbooks_a_non_stub_record_cites(root):
    """`MAVAD` is read by the BOM and `GOZARESH` by its mirror; `PITZA` is
    named only by a stub — identity and nothing else (QF-20) — so it is not
    read."""
    assert facts_store.coverage(root) == {"read": 2, "total": 3}


def test_manifest_reads_branches_and_counts_workbooks(root):
    assert manifest.branches(root) == MANIFEST["branches"]
    assert manifest.workbook_count(root) == 3
    assert manifest.read_manifest(root)["workbooks"][0]["short"] == "mavad"


def test_an_absent_manifest_hands_out_no_shared_lists(tmp_path):
    """A caller that appends to the empty answer must not reach the next
    caller's — the failure a shallow copy of a module-level default gives, and
    an equality assertion never catches."""
    first = manifest.read_manifest(tmp_path)
    first["workbooks"].append({"spreadsheetId": "x"})
    first["branches"].append({"code": "x", "name": "x"})
    assert manifest.read_manifest(tmp_path) == {"schema_version": 1,
                                                "branches": [], "workbooks": []}
    assert manifest.workbook_count(tmp_path) == 0
    assert manifest.branches(tmp_path) == []


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


def test_workbook_titles_are_the_file_name_without_its_extension(root):
    assert manifest.workbook_titles(root)[MAVAD] == "Mavade Avalie"


def test_binding_labels_name_a_record_instance_and_a_rule_binding(root):
    record = {"id": "F-00300", "kind": "record", "key": "gozaresh_shabane",
              "title": "گزارش شبانه", "statement": "…", "retired": False,
              "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
              "status": "confirmed", "updated_at": NOW,
              "data": {"medium": "sheet", "role": "report", "location": {},
                       "instances": [{"key": "pitza__s0", "spreadsheetId": MAVAD,
                                      "sheetId": 0, "sheet": "پیتزا",
                                      "branch": "chalebagh", "hidden": False}]}}
    rule = {"id": "F-00301", "kind": "rule", "key": "enheraf",
            "title": "انحراف مصرف", "statement": "…", "retired": False,
            "scope": {"departments": ["cooking"], "branches": ["chalebagh"]},
            "status": "confirmed", "updated_at": NOW,
            "data": {"inputs": [], "outputs": [],
                     "applies_to": [{"key": "pitza__s0__j__r6",
                                     "record": {"ref": "F-00300", "field": "c_j"},
                                     "variant": 0, "range": "J6:J15",
                                     "params": {"tolerancePerFoodGr": 5}}]}}
    _dump(root / "facts" / "records.json",
          {"schema_version": 2, "entries": [record]})
    _dump(root / "facts" / "rules.json",
          {"schema_version": 2, "entries": [rule]})
    _dump(root / "facts" / ".index.json",
          {"schema_version": 2,
           "entries": [{"id": e["id"], "kind": e["kind"], "key": e["key"],
                        "title": e["title"], "scope": e["scope"],
                        "status": e["status"], "retired": e["retired"],
                        "updated_at": e["updated_at"]} for e in (record, rule)]})
    one = {"workbook": "Mavade Avalie", "sheet": "پیتزا", "branch": "چاله‌باغ"}
    assert facts_store.binding_labels(root, record) == {"pitza__s0": one}
    assert facts_store.binding_labels(root, rule) == {"pitza__s0__j__r6": one}


def test_a_v2_store_file_reads_exactly_as_a_v1_one_does(root):
    """The marker moves to 2 in the same commit as the schema (§8 step 2); the
    reader has never checked it and must not start now — an entry is an entry."""
    doc = json.loads((root / "facts" / "items.json").read_text(encoding="utf-8"))
    doc["schema_version"] = 2
    _dump(root / "facts" / "items.json", doc)
    assert facts_store.load_entry(root, doc["entries"][0]["id"]) is not None
    assert facts_store.load_index(root / "nothing") == {
        "schema_version": 2, "entries": []}


def test_resolved_carries_a_records_column_titles(root):
    """The panel names the column a `{ref, field}` edge reads, so the record's
    own `data.fields[]` ride in its label — title, or the key where a column
    has no Persian."""
    resolved = facts_store.resolved_map(root, facts_store.load_entry(root, "F-00030"))
    # `inputs[0].from` reads the BOM's «گرم» column; `outputs[0].writes_to`
    # writes the form's «مانده اول شب».
    assert resolved["F-00020"]["fields"]["grams"] == "گرم"
    assert resolved["F-00021"]["fields"]["start_stock"] == "مانده اول شب"
    # A record with no declared columns carries no `fields` key at all, and
    # nothing that is not a record carries one.
    assert "fields" not in resolved["F-00032"]


def test_path_label_of_a_non_sheet_locations_leaves(root):
    """§3.3 — a paper form and an external table have no `path` and no tab;
    where they are is `kept_at`, `holder` and `system`, so Appendix D's labels
    for those three have to be here too or a `field_status` line beside one
    reads as its ASCII key."""
    entry = _entry("F-00099", "record", "mande_shab", "فرم مانده شب",
                   {"medium": "paper", "role": "log",
                    "location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز",
                                 "system": "ERP"}},
                   field_status={"data/location/kept_at": "inferred",
                                 "data/location/holder": "inferred",
                                 "data/location/system": "informal"})
    assert facts_store.path_labels(root, entry) == {
        "data/location/kept_at": "محل › نگهداری",
        "data/location/holder": "محل › مسئول",
        "data/location/system": "محل › سامانه"}


# --------------------------------------------------------------------------- #
# Unit titles — the units record's Persian, served beside the entry
# --------------------------------------------------------------------------- #

def test_unit_titles_are_the_units_records_open_rows(tmp_path):
    units = _entry("F-00001", "record", "units", "واحدها", {
        "medium": "native", "role": "reference", "primaryKey": ["symbol"],
        "fields": [{"key": "symbol", "type": "string"},
                   {"key": "unit_title", "type": "string"}],
        "rows": [
            {"key": "g", "symbol": "g", "unit_title": "گرم"},
            {"key": "percent", "symbol": "percent", "unit_title": "درصد"},
            # A retired symbol is no longer vocabulary, and a row with no
            # Persian names nothing — both stay off the map, so the screen
            # draws their symbol as an island rather than a blank.
            {"key": "old", "symbol": "old", "unit_title": "قدیمی", "retired": True},
            {"key": "bare", "symbol": "bare"},
        ]})
    _dump(tmp_path / "facts" / "records.json",
          {"schema_version": 1, "entries": [units]})
    assert facts_store.unit_titles(tmp_path) == {"g": "گرم", "percent": "درصد"}


def test_unit_titles_of_a_store_with_no_units_record_is_empty(root):
    assert facts_store.unit_titles(root) == {}
