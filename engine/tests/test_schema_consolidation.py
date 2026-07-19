import copy

import pytest
from engine_common import validate


def _merge_suggestion():
    return {
        "n": 1,
        "kind": "merge",
        "status": "pending",
        "problem": "سه فرایند پذیرش یک فرایندند.",
        "action": "ادغام در یک فرایند سرویس‌دهی.",
        "recommended_shape": "mother_subprocess",
        "chosen_shape": None,
        "processes": ["dining-005", "dining-006", "dining-008"],
        "evidence": [
            {"node": "dining-006-n003", "label": "ثبت سفارش در کیوسک",
             "also_in": ["dining-005-n007", "dining-012-n002"]},
            {"transcript": "dining-1405-04-11.txt", "text": "مشتری در کیوسک سفارش می‌دهد"},
        ],
        "repairs": [],
    }


def _attach_suggestion():
    return {
        "n": 2,
        "kind": "attach",
        "status": "pending",
        "problem": "سفارش تکمیلی زیرفرایندِ ثبت سفارش است.",
        "action": "قراردادن dining-012 زیر نودِ dining-006-n010.",
        "child": "dining-012",
        "parent_process": "dining-006",
        "parent_node": "dining-006-n010",
        "evidence": [
            {"node": "dining-012-n002", "label": "ثبت سفارش تکمیلی در کیوسک",
             "also_in": ["dining-006-n003"]}
        ],
        "repairs": [],
    }


def _doc(*suggestions):
    return {
        "department": "dining",
        "generated_from": "runs/dining/20260718-084824",
        "suggestions": list(suggestions),
    }


def test_accepts_merge_and_attach():
    validate("consolidation.schema.json", _doc(_merge_suggestion(), _attach_suggestion()))


def test_accepts_empty_suggestions():
    # silence is a first-class, valid outcome (spec §5)
    validate("consolidation.schema.json", _doc())


def test_rejects_evidence_free_suggestion():
    s = _merge_suggestion()
    s["evidence"] = []
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_rejects_unknown_top_field():
    d = _doc(_merge_suggestion())
    d["bogus"] = 1
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", d)


def test_rejects_bad_status():
    s = _merge_suggestion()
    s["status"] = "done"
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_rejects_merge_missing_processes():
    s = _merge_suggestion()
    del s["processes"]
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_rejects_bad_process_id_shape():
    s = _merge_suggestion()
    s["processes"] = ["dining5"]  # not {dept}-NNN
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))


def test_accepts_recorded_repair():
    s = _merge_suggestion()
    s["status"] = "applied"
    s["chosen_shape"] = "flat"
    s["repairs"] = [
        {"op": "add_edges", "process": "dining-030",
         "detail": "اتصال آخرین نود خوشامد به اولین نود ثبت سفارش"}
    ]
    validate("consolidation.schema.json", _doc(s))


def test_rejects_bad_repair_op():
    s = _merge_suggestion()
    s["repairs"] = [{"op": "delete_everything", "process": "dining-030", "detail": "x"}]
    with pytest.raises(ValueError):
        validate("consolidation.schema.json", _doc(s))
