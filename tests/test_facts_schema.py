import copy
import json
import pathlib

FIX = pathlib.Path(__file__).parent / "fixtures" / "facts"


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def _wrap(*entries):
    return {"schema_version": 1, "entries": list(entries)}


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


def test_unknown_data_key_passes(validate):
    e = _load("entry-item.json")
    e["data"]["future_field"] = {"anything": 1}
    assert validate("facts.schema.json", _wrap(e)) == []


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
