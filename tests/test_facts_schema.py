import copy
import json
import pathlib

FIX = pathlib.Path(__file__).parent / "fixtures" / "facts"


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def _wrap(*entries):
    return {"schema_version": 2, "entries": list(entries)}


KINDS = ["item", "record", "measurement", "rule", "note"]


def test_one_valid_fixture_per_kind_validates(validate):
    for kind in KINDS:
        assert validate("facts.schema.json", _wrap(_load(f"entry-{kind}.json"))) == []


def test_unknown_envelope_key_fails(validate):
    e = _load("entry-item.json")
    e["provenance"] = "x"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_wrong_kind_payload_fails_on_required(validate):
    e = _load("entry-item.json")
    e["kind"] = "rule"  # item payload lacks inputs/outputs
    assert validate("facts.schema.json", _wrap(e)) != []


def test_unknown_data_key_fails(validate):
    # §3.3: every payload is closed now — an invented key is what cause C looked
    # like in the store (`achieved_count`, `vents_per_carton`, `port_reason`).
    e = _load("entry-item.json")
    e["data"]["future_field"] = {"anything": 1}
    assert validate("facts.schema.json", _wrap(e)) != []


def test_persian_key_fails(validate):
    e = _load("entry-item.json")
    e["key"] = "پنیر"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_doubled_underscore_minted_segment_fails(validate):
    e = _load("entry-item.json")
    e["key"] = "bad___key"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_bare_string_reference_fails(validate):
    e = _load("entry-measurement.json")
    e["data"]["of"] = "F-00003"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_ref_object_with_foreign_key_fails(validate):
    e = _load("entry-measurement.json")
    e["data"]["of"] = {"ref": "F-00003", "note": "x"}
    assert validate("facts.schema.json", _wrap(e)) != []


def test_delta_carrying_status_or_hash_fails(validate):
    d = _load("delta-min.json")
    bad = copy.deepcopy(d)
    bad["status"] = "confirmed"
    assert validate("facts-delta.schema.json", _wrap(bad)) != []
    bad = copy.deepcopy(d)
    bad["source"][0]["hash"] = "sha256:" + "0" * 64
    assert validate("facts-delta.schema.json", _wrap(bad)) != []


def test_delta_minimum_validates(validate):
    assert validate("facts-delta.schema.json", _wrap(_load("delta-min.json"))) == []


def test_idseq_and_index_and_run_meta(validate):
    assert validate("facts-idseq.schema.json", {"fact": 42}) == []
    assert validate("facts-run-meta.schema.json", {
        "department": "cooking", "origin": "pipeline", "actor": "operator",
        "started_at": "2026-09-01T10:15:00Z", "finished_at": None,
        "recordings": [], "attachments": [], "workbooks": [],
        "delta": "runs/facts/cooking/20260901-101500/facts-delta.json",
        "merged": False, "ids_created": []}) == []


def test_manifest_short_pattern_and_confirmed(validate):
    m = {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": [{"spreadsheetId": "1abc", "dir": "D", "file": "F.xlsx",
                        "short": "gozaresh_cb", "scripts": [],
                        "departments": ["management"], "branches": ["chalebagh"],
                        "reference_tabs": [], "confirmed": True}]}
    assert validate("manifest.schema.json", m) == []
    m["workbooks"][0]["short"] = "Bad Short"
    assert validate("manifest.schema.json", m) != []


def test_bad_jalali_date_fails(validate):
    e = _load("entry-rule.json")
    e["valid_from"] = "1404/09/01"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_manifest_proposal_admits_question_mark(validate):
    # Gate M / QF-19: the quantify agent (manifest mode) writes "?" in any
    # of the three judgement lists where it cannot decide.
    p = {
        "1abc": {
            "departments": ["?"],
            "branches": ["chalebagh", "?"],
            "reference_tabs": ["پیتزا"],
            "reasons": {"chalebagh": "دایرکتوری ChaleBagh"}
        }
    }
    assert validate("manifest-proposal.schema.json", p) == []


def test_sheet_record_with_instances_and_imports_validates(validate):
    assert validate("facts.schema.json", _wrap(_load("entry-record-sheet.json"))) == []


def test_role_mirror_fails(validate):
    # QF-48: a mirror is an edge, not a record — the role leaves the vocabulary.
    e = _load("entry-record.json")
    e["data"]["role"] = "mirror"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_a_paper_records_location_is_where_it_is_kept_and_who_holds_it(validate):
    """§3.3 — the paper branch is the controller's `{kept_at, holder}`. Two of
    the 2026-09-07 run's refusals were photographed forms written with no
    `location` at all, which an open `{"type": "object"}` could not refuse."""
    e = _load("entry-record.json")
    e["data"]["location"] = {}
    assert validate("facts.schema.json", _wrap(e)) != []
    e["data"]["location"] = {"kept_at": "زونکن دفتر آشپزخانه",
                             "holder": "سرآشپز شیفت"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"]["path"] = "departments/cooking/attachments/photo.jpg"
    assert validate("facts.schema.json", _wrap(e)) != []      # closed


def test_the_other_three_media_close_too(validate):
    e = _load("entry-record.json")
    e["data"]["medium"] = "external"
    e["data"]["location"] = {"system": "سپیدز", "kept_at": "شمارهٔ رسید"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"system": "سپیدز"}
    assert validate("facts.schema.json", _wrap(e)) != []      # kept_at required
    e["data"]["medium"] = "native"
    e["data"]["location"] = {"kept_at": "خود سامانه"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"holder": "کسی"}
    assert validate("facts.schema.json", _wrap(e)) != []      # closed


def test_the_till_keeps_its_identifier_scheme(validate):
    # Assembler's ruling 1: `external` and `native` carry an optional
    # `identifier_scheme`. The Sepidz till (F-00018 in the UI's store mock) is
    # `external` with nothing else in its location, and the leaf keeps the open
    # shape `recordData.identifier_scheme` already had.
    e = _load("entry-record.json")
    e["data"]["medium"] = "external"
    e["data"]["location"] = {"system": "سپیدز", "kept_at": "شمارهٔ فیش",
                             "identifier_scheme": {"authority": "Sepidz",
                                                   "format": "receipt number",
                                                   "example": "R-140509-0231"}}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["medium"] = "native"
    e["data"]["location"] = {"identifier_scheme": {"authority": "خود سامانه"}}
    assert validate("facts.schema.json", _wrap(e)) == []


def test_a_sheet_records_location_keeps_its_engine_written_shape(validate):
    # `facts_plan.build` writes `{path, spreadsheetId, sheet}` and the dumps
    # that predate it wrote `{spreadsheetId, sheetId, sheet}`; both stay valid,
    # and so does the empty one a `new[]` record is allowed to leave.
    e = _load("entry-record-sheet.json")
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"path": "attachments/sheets/Pitza/pitza.xlsx",
                             "spreadsheetId": "1abc", "sheet": "پیتزا"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"kept_at": "جایی"}
    assert validate("facts.schema.json", _wrap(e)) != []


def test_a_sheet_location_admits_every_key_the_engine_writes(validate):
    """`merge_facts.apply.LOCATION_KEYS` is the only writer of a sheet
    record's location (`_recompute_location`), so the closed branch is exactly
    that tuple plus `build.py`'s `path`. Pinned here because a branch narrower
    than its writer would make `save_store` refuse what `apply` just wrote."""
    from merge_facts.apply import LOCATION_KEYS
    assert set(LOCATION_KEYS) == {"spreadsheetId", "sheetId", "sheet", "hidden"}
    e = _load("entry-record-sheet.json")
    e["data"]["location"] = {"spreadsheetId": "1abc", "sheetId": 0,
                             "sheet": "پیتزا", "hidden": False}
    assert validate("facts.schema.json", _wrap(e)) == []


def test_unread_attachment_is_an_issue_kind(validate):
    # I2 / §3.7: a file `extract-attachment` has no converter for is named,
    # never improvised over.
    e = _load("entry-record.json")
    e["data"]["location"] = {"kept_at": "زونکن", "holder": "سرآشپز"}
    e["issues"] = [{"kind": "unread_attachment", "description": "فایل خوانده نشد",
                    "affects": [{"ref": "F-00002"}]}]
    assert validate("facts.schema.json", _wrap(e)) == []
    assert validate("facts-delta.schema.json", _wrap(
        dict(e, id="T-1", data=dict(e["data"])))) != []       # store-only keys


def test_quote_is_admitted_on_an_attachment_source(validate):
    # Assembler's ruling 3: a form read from a `.docx`, a `.pdf` or a
    # photograph cites its sidecar and may quote it, exactly as a transcript
    # does. `chat` is still refused — nothing quotes an unrecorded remark.
    for kind in ("docx", "pdf", "photo"):
        e = _load("entry-rule.json")
        e["source"].append({"type": kind, "ref": "attachments/form.txt",
                            "quote": "شمارش شب"})
        assert validate("facts.schema.json", _wrap(e)) == [], kind
    e = _load("entry-rule.json")
    e["source"].append({"type": "chat", "ref": None, "quote": "x"})
    assert validate("facts.schema.json", _wrap(e)) != []


#: The keys the store schema and the delta schema are sanctioned to differ in,
#: definition by definition. Everything else is one contract in two files, and
#: the earlier version of the test below compared only the payload defs — which
#: `$ref` `row` rather than spelling it out, so `row`'s divergence was invisible
#: until a keyless row passed the unit gate and died at Stage V.
SANCTIONED = {
    # `merge facts apply` writes these; a unit never sends them. `id` is a
    # minted `factId` in the store and a `tempId` in the delta.
    "envelope": {"id", "status", "updated_at"},
    "account": {"id"},
    "source": {"hash", "run"},
    # a unit hands a rule's verbatim text over as `original`; `apply` writes the
    # file and keeps the path as `original_ref`
    "recordData": {"original", "original_ref"},
    "ruleData": {"original", "original_ref"},
    # the store requires a row key; the delta cannot, because a reference
    # table's keys are the primaryKey join `apply._derive_row_keys` mints.
    # For every other role the unit gate refuses a keyless row
    # (`facts_plan.assemble._contract_problems`).
    "row": {"key"},
}


def test_both_schemas_still_self_validate_and_agree_on_location(validate):
    """The two files are kept in step by hand, so every shared definition is
    compared here, not just the payloads — with the sanctioned differences named
    in `SANCTIONED` above and anything else failing."""
    import json
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[1] / "schemas"
    a = json.loads((root / "facts.schema.json").read_text(encoding="utf-8"))
    b = json.loads((root / "facts-delta.schema.json").read_text(encoding="utf-8"))

    def _shared(schema, name):
        d = dict(schema["$defs"][name])
        drop = SANCTIONED.get(name, set())
        d["properties"] = {k: v for k, v in (d.get("properties") or {}).items()
                           if k not in drop}
        d["required"] = [k for k in d.get("required") or [] if k not in drop]
        return d

    for name in set(a["$defs"]) & set(b["$defs"]) - {"entry"}:
        assert _shared(a, name) == _shared(b, name), name
    # `entry` is the one def with no properties of its own: the delta adds a
    # clause to the same `allOf`, banning the `original_ref` a unit may not send.
    assert b["$defs"]["entry"]["allOf"][:2] == a["$defs"]["entry"]["allOf"]
    assert b["$defs"]["entry"]["allOf"][2:] == \
        [{"properties": {"data": {"not": {"required": ["original_ref"]}}}}]
    assert set(b["$defs"]) - set(a["$defs"]) == {"tempId"}


def test_note_without_about_fails(validate):
    # QF-9: a note points at something and asks something, or it is not a note.
    e = _load("entry-note.json")
    del e["data"]["about"]
    assert validate("facts.schema.json", _wrap(e)) != []


def test_homoglyph_key_fails_under_both_grammars(validate):
    # а is a Cyrillic а. `fields[].key` takes the minted SEGMENT grammar,
    # `instances[].key` the minted KEY grammar; both are ASCII-anchored.
    e = _load("entry-record-sheet.json")
    e["data"]["fields"][0]["key"] = "mаsraf_elami"
    assert validate("facts.schema.json", _wrap(e)) != []
    e = _load("entry-record-sheet.json")
    e["data"]["instances"][0]["key"] = "gozаresh_cb__s0"
    assert validate("facts.schema.json", _wrap(e)) != []


def test_original_as_an_array_fails(validate):
    d = _load("delta-min.json")
    d["data"]["original"] = ["=MINUS(SUM(F6,E6),G6)"]
    assert validate("facts-delta.schema.json", _wrap(d)) != []


def test_delta_carrying_original_ref_fails(validate):
    d = _load("delta-min.json")
    d["data"]["original_ref"] = "facts/originals/F-00042.txt"
    assert validate("facts-delta.schema.json", _wrap(d)) != []


def test_quote_is_admitted_on_voice_and_refused_on_chat(validate):
    e = _load("entry-rule.json")
    e["source"][1]["quote"] = "انحراف را شب‌ها می‌گیریم"
    assert validate("facts.schema.json", _wrap(e)) == []
    e["source"].append({"type": "chat", "ref": None, "quote": "x"})
    assert validate("facts.schema.json", _wrap(e)) != []


def test_rule_applies_to_with_params_validates(validate):
    e = _load("entry-rule.json")
    e["data"]["applies_to"] = [
        {"key": "gozaresh_cb__s0__l__r6", "record": {"ref": "F-00040", "field": "c_l"},
         "variant": 0, "range": "L6:L15",
         "params": {"tolerancePerFoodGr": 5, "ref_1": {"ref": "F-00040", "field": "c_k"}},
         "rows": [{"key": "r6", "row": 6, "label": "پنیر پیتزا", "item": "##1"}]}]
    assert validate("facts.schema.json", _wrap(e)) == []


# --- facts-unit.schema.json (§2.5) ------------------------------------------

def _unit_doc():
    return {
        "schema_version": 1, "unit": "u-wb-gozaresh", "attempt": 1,
        "decisions": [
            {"skeleton": "S-r-0a1b2c3d4e5f", "action": "keep", "key": "enheraf",
             "title": "انحراف مصرف",
             "statement": "انحراف مصرف هر مادهٔ اولیه برابر است با مصرف واقعی منهای مصرف اعلامی.",
             "aliases": ["مغایرت"],
             "data": {"expr": "enheraf = masraf_vaqei - masraf_elami", "lang": "feel",
                      "inputs": [{"key": "masraf_vaqei", "title": "مصرف واقعی", "unit": "kg",
                                  "from": {"ref": "S-rec-aabbccddeeff", "field": "c_h"}}],
                      "outputs": [{"key": "enheraf", "title": "انحراف",
                                   "unit": {"value": "kg", "inferred": True},
                                   "nature": "observed"}]},
             "branches": ["chalebagh"],
             "processes": [{"process": "cooking-030", "node": "n016",
                            "quote": "انحراف را شب‌ها می‌گیریم"}]},
            {"skeleton": "S-r-1111ffff2222", "action": "drop",
             "reason_code": "date_passthrough", "reason": "خواندن تاریخ"},
            {"skeleton": "S-i-222233334444", "action": "merge_into",
             "into": "S-i-555566667777", "reason_code": "duplicate"},
            {"skeleton": "S-rec-888899990000", "action": "keep",
             "key": "gozaresh_shabane_pitza", "title": "گزارش شبانه پیتزا",
             "statement": "جدول گزارش شبانهٔ لاین پیتزا.",
             "data": {"role": "report", "cadence": "nightly",
                      "fields": [{"from": "c_h", "key": "masraf_elami", "unit": "kg",
                                  "description": "ستون مصرف اعلامی"}]}},
            {"skeleton": "S-r-aaaabbbbcccc", "action": "split", "reason_code": "other",
             "reason": "variants compute different things",
             "into": [{"key": "enheraf_pitza", "title": "انحراف پیتزا",
                       "statement": "انحراف لاین پیتزا.", "takes": ["gozaresh_cb__s0__j__r6"]},
                      {"key": "enheraf_ferengi", "title": "انحراف فرنگی",
                       "statement": "انحراف لاین فرنگی.", "takes": ["gozaresh_nk__s1__j__r6"]}]}],
        "new": [{"kind": "note", "key": "note_placeholder", "title": "واحد نامشخص",
                 "statement": "واحد این قلم پرسیده نشده است.",
                 "data": {"about": [{"ref": "S-i-555566667777"}],
                          "question": "واحد شمارش این قلم چیست؟"}}]}


def _review_doc():
    return {"schema_version": 1, "unit": "review", "attempt": 1,
            "decisions": [
                {"entry": {"kind": "rule", "key": "enheraf",
                           "scope": {"departments": ["cooking"], "branches": []}},
                 "action": "keep", "key": "enheraf", "title": "انحراف مصرف",
                 "statement": "بازنویسی‌شده در بازبینی."},
                {"entry": {"kind": "rule", "key": "enheraf_ba_tolerance"},
                 "action": "contradiction", "field": "data/outputs/enheraf/unit",
                 "resolution": "fix", "value": "kg", "reason": "یک طرف آشکارا اشتباه است"}]}


def test_plan_unit_and_review_documents_validate(validate):
    assert validate("facts-unit.schema.json", _unit_doc()) == []
    assert validate("facts-unit.schema.json", _review_doc()) == []


def test_contradiction_only_in_a_review_document(validate):
    d = _unit_doc()
    d["decisions"].append({"skeleton": "S-r-999999999999", "action": "contradiction",
                           "field": "data/expr", "resolution": "account"})
    assert validate("facts-unit.schema.json", d) != []


def test_contradiction_addressed_by_a_skeleton_id_fails(validate):
    # `_fold_review` matches a contradiction against the flags by the entry
    # address, so one addressed by a skeleton id is always discarded — the
    # schema says so rather than letting the whole review die for it.
    d = _review_doc()
    d["decisions"][1].pop("entry")
    d["decisions"][1]["skeleton"] = "S-r-999999999999"
    assert validate("facts-unit.schema.json", d) != []


def test_review_over_sixty_decisions_fails(validate):
    d = _review_doc()
    d["decisions"] = d["decisions"] * 31          # 62
    assert validate("facts-unit.schema.json", d) != []


def test_unit_decision_shapes(validate):
    d = _unit_doc(); d["decisions"][0].pop("statement")
    assert validate("facts-unit.schema.json", d) != []        # keep needs a statement
    d = _unit_doc(); d["decisions"][1].pop("reason_code")
    assert validate("facts-unit.schema.json", d) != []        # drop needs a reason_code
    d = _unit_doc(); d["decisions"][0]["data"]["mirror_of"] = {"ref": "S-rec-aabbccddeeff"}
    assert validate("facts-unit.schema.json", d) != []        # data is closed
    d = _unit_doc(); d["decisions"][0]["skeleton"] = "S-x-0a1b2c3d4e5f"
    assert validate("facts-unit.schema.json", d) != []        # S-<kind>-<12 hex>
    d = _unit_doc(); d["decisions"][0]["entry"] = {"kind": "rule", "key": "enheraf"}
    assert validate("facts-unit.schema.json", d) != []        # skeleton XOR entry
    d = _unit_doc(); d["decisions"][4]["into"] = d["decisions"][4]["into"][:1]
    assert validate("facts-unit.schema.json", d) != []        # a split has two parts


def test_manifest_unresolved_and_twin_of(validate):
    m = {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": [{"spreadsheetId": "1abc", "dir": "D", "file": "F.xlsx",
                        "short": "sokhari", "scripts": [], "departments": [],
                        "branches": ["chalebagh"], "reference_tabs": [],
                        "confirmed": False, "unresolved": ["departments"],
                        "twin_of": "fried"}]}
    assert validate("manifest.schema.json", m) == []
    m["workbooks"][0]["unresolved"] = ["scripts"]
    assert validate("manifest.schema.json", m) != []


def test_run_meta_units(validate):
    meta = {"department": "cooking", "origin": "pipeline", "actor": "operator",
            "started_at": "2026-09-06T10:15:00Z", "finished_at": None,
            "recordings": [], "attachments": [], "workbooks": [],
            "delta": "runs/facts/cooking/20260906-101500/facts-delta.json",
            "merged": False, "ids_created": [],
            "units": [{"id": "u-wb-gozaresh", "type": "workbook",
                       "state": "done", "attempts": 1}]}
    assert validate("facts-run-meta.schema.json", meta) == []
    meta["units"][0]["state"] = "running"
    assert validate("facts-run-meta.schema.json", meta) != []


def _delta_reference_record(row):
    return {"kind": "record", "key": "mavad__pizza", "title": "ب.او.ام",
            "statement": "شرح",
            "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "5"}],
            "retired": False,
            "data": {"medium": "sheet", "role": "reference", "location": {},
                     "fields": [{"key": "code", "type": "string"}],
                     "primaryKey": ["code"], "rows": [row]}}


def test_a_reference_delta_row_needs_no_key_the_stored_row_does(validate):
    # QF-32 requires `rows[].key`, and the store schema holds it to that. The
    # delta cannot: §9's `apply._derive_row_keys` mints a reference row's key
    # from the primaryKey join AFTER the delta has validated — and a `refItems`
    # cell may still be a temp id at that point — so the delta must not demand
    # what its author cannot yet know.
    d = _delta_reference_record({"code": "prod_61"})
    assert validate("facts-delta.schema.json", _wrap(d)) == []
    e = _load("entry-record.json")
    del e["data"]["rows"][0]["key"]
    assert validate("facts.schema.json", _wrap(e)) != []


def test_reconciled_against_cell_is_local_not_a_ref(validate):
    # v2 §9: the pair names a cell of THIS record — `{field, row}`, the shape
    # `content._check_reconciled_against` reads — against another entry's
    # output. A `{ref}` on the near side would name a different record.
    e = _load("entry-record.json")
    e["data"]["reconciled_against"] = [
        {"cell": {"field": "start_stock", "row": "burger"},
         "against": {"ref": "F-00051", "field": "dough_g"}}]
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["reconciled_against"][0]["cell"] = {"ref": "F-00002",
                                                  "field": "start_stock"}
    assert validate("facts.schema.json", _wrap(e)) != []
