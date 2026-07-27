import copy

import pytest
from conftest import load_fixture
from engine_common import validate

RUN = "runs/cooking-2026-07-12"
NOW = "2026-07-12T09:00:00Z"


def _empty_delta(**over):
    d = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": []}
    d.update(over)
    return d


def _proc():
    return copy.deepcopy(load_fixture("process.cooking-001.json"))


def test_delta_accepts_remove_edges_and_revise_nodes():
    validate("delta.schema.json", _empty_delta(
        remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}],
        revise_nodes=[{"id": "cooking-001-n010", "set": {"label": "x"}}],
    ))


def test_delta_still_valid_without_new_fields():
    validate("delta.schema.json", _empty_delta())


def test_remove_edges_rejects_extra_key():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(
            remove_edges=[{"from": "a", "to": "b", "oops": 1}]))


def test_revise_nodes_requires_id_and_set():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(revise_nodes=[{"id": "x"}]))


def test_delta_accepts_set_process():
    validate("delta.schema.json", _empty_delta(
        set_process={"name": "خرید و تدارکات", "summary": "خلاصهٔ تازه."}))


def test_set_process_rejects_unknown_field():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(set_process={"title": "x"}))


def test_set_process_rejects_empty_object():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(set_process={}))


def test_set_process_rejects_malformed_idef0():
    # icom requires all four lists
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(set_process={"idef0": {"inputs": []}}))


from merge import apply_delta


def test_remove_edges_drops_only_matching_edge():
    p = _proc()
    before = len(p["edges"])
    delta = _empty_delta(remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}])
    apply_delta(p, delta, RUN, NOW)
    assert len(p["edges"]) == before - 1
    assert not any(e["from"] == "cooking-001-n010" and e["to"] == "cooking-001-j1"
                   for e in p["edges"])
    # a non-matching edge survives
    assert any(e["from"] == "start" and e["to"] == "cooking-001-n010" for e in p["edges"])


def test_remove_edges_noop_when_absent():
    p = _proc()
    before = len(p["edges"])
    apply_delta(p, _empty_delta(remove_edges=[{"from": "no", "to": "such"}]), RUN, NOW)
    assert len(p["edges"]) == before


def test_remove_edges_preserves_manual_position():
    p = _proc()
    manual = next(n for n in p["nodes"] if n.get("layout") == "manual")  # cooking-001-n060
    pos = dict(manual["position"])
    apply_delta(p, _empty_delta(
        remove_edges=[{"from": "cooking-001-n010", "to": "cooking-001-j1"}]), RUN, NOW)
    manual2 = next(n for n in p["nodes"] if n["id"] == manual["id"])
    assert manual2["position"] == pos
    validate("process.schema.json", p)
    assert p["updated_at"] == NOW


def test_revise_nodes_overwrites_filled_field():
    p = _proc()
    p["pending"] = []
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    assert n["actor"] == "کارپرداز"                 # filled
    apply_delta(p, _empty_delta(
        revise_nodes=[{"id": "cooking-001-n010", "set": {"actor": "انباردار"}}]), RUN, NOW)
    n2 = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    assert n2["actor"] == "انباردار"                # OVERWRITTEN (not a pending row)
    assert not any(r["node"] == "cooking-001-n010" and r["field"] == "actor"
                   for r in p["pending"])
    assert RUN in n2["source"]["touched_by"]


def test_revise_nodes_overwrites_multiple_fields():
    p = _proc()
    apply_delta(p, _empty_delta(revise_nodes=[
        {"id": "cooking-001-n010", "set": {"label": "دریافت", "description": "بازنویسی"}}]),
        RUN, NOW)
    n = next(x for x in p["nodes"] if x["id"] == "cooking-001-n010")
    assert n["label"] == "دریافت" and n["description"] == "بازنویسی"
    validate("process.schema.json", p)


def test_revise_nodes_unknown_id_is_skipped():
    p = _proc()
    apply_delta(p, _empty_delta(revise_nodes=[{"id": "ghost", "set": {"label": "x"}}]),
                RUN, NOW)
    validate("process.schema.json", p)             # no crash, no change


def test_set_process_overwrites_name_and_summary():
    p = _proc()
    assert p["name"] == "خرید و پرداخت هزینه"       # filled
    apply_delta(p, _empty_delta(set_process={
        "name": "خرید و تدارکات", "summary": "خلاصهٔ بازنویسی‌شده."}), RUN, NOW)
    assert p["name"] == "خرید و تدارکات"
    assert p["summary"] == "خلاصهٔ بازنویسی‌شده."
    validate("process.schema.json", p)
    assert p["updated_at"] == NOW


def test_set_process_replaces_idef0_and_kpis():
    p = _proc()
    icom = {"inputs": ["درخواست"], "controls": [], "outputs": ["کالا"], "mechanisms": []}
    kpis = [{"name": "زمان چرخه", "target": "۲ روز"}]
    apply_delta(p, _empty_delta(set_process={"idef0": icom, "kpis": kpis}), RUN, NOW)
    assert p["idef0"] == icom
    assert p["kpis"] == kpis
    validate("process.schema.json", p)


def test_set_process_absent_leaves_process_fields_untouched():
    p = _proc()
    before = (p["name"], p["summary"],
              copy.deepcopy(p["idef0"]), copy.deepcopy(p["kpis"]))
    apply_delta(p, _empty_delta(), RUN, NOW)
    assert (p["name"], p["summary"], p["idef0"], p["kpis"]) == before


def test_set_process_does_not_create_pending_rows():
    p = _proc()
    p["pending"] = []
    apply_delta(p, _empty_delta(set_process={"name": "نام تازه"}), RUN, NOW)
    assert p["pending"] == []          # overwrite semantics, never a pending row


def test_set_process_leaves_nodes_and_edges_alone():
    p = _proc()
    nodes_before = copy.deepcopy(p["nodes"])
    edges_before = copy.deepcopy(p["edges"])
    apply_delta(p, _empty_delta(set_process={"name": "نام تازه"}), RUN, NOW)
    assert p["nodes"] == nodes_before
    assert p["edges"] == edges_before
