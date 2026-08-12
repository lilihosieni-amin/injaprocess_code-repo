import json
import logging
import os
import time
from pathlib import Path

import pytest
from inja_ui_backend import exports
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import policy

#: Values a public export must never carry. Every one is planted somewhere in
#: `_seed_process`'s document, and `test_no_provenance_survives_anywhere` greps
#: the serialised payload for all of them at once — so a field re-added by any
#: route, not only the ones named in the per-field tests, fails the suite.
SECRETS = (
    "meetings/20260722-standup.m4a",     # source.ref — a recording
    "runs/chat/20260722-050015",         # source.run and node source.created_by
    "خلاصهٔ داخلی",                        # summary
    "ui-edit",                           # node source.touched_by — who edited what
    "دستور پخت محرمانه",                    # idef0 / node icom entry
    "حاشیهٔ سود",                          # kpi name
    "2026-07-22T05:00:15Z",              # created_at / updated_at
)


def _icom(tag):
    return {"inputs": [f"دستور پخت محرمانه {tag}"], "controls": [], "outputs": [], "mechanisms": []}


def _seed_process(root, code, pid, tombstoned=False):
    """Write a process file straight to disk, like tests/test_storage.py's `_proc`.

    Shaped like `process.schema.json` rather than minimally, because what
    `build_payload` has to do is *drop* fields — a stub document with none of
    them cannot tell a working whitelist from a missing one.
    """
    d = root / "departments" / code / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {
        "id": pid,
        "department": code,
        "name": pid,
        "summary": "خلاصهٔ داخلی این فرآیند",
        "source": {"type": "voice", "ref": "meetings/20260722-standup.m4a",
                   "run": "runs/chat/20260722-050015"},
        "parent": None,
        "created_at": "2026-07-22T05:00:15Z",
        "updated_at": "2026-07-22T05:00:15Z",
        "idef0": _icom("A"),
        "kpis": [{"name": "حاشیهٔ سود", "target": "۲۰٪"}],
        "nodes": [
            {"id": f"{pid}-n001", "type": "activity", "label": "برداشت", "description": "شرح",
             "actor": "انباردار", "icom": _icom("B"), "subprocess": None,
             "position": {"x": 30, "y": 104}, "layout": "auto",
             "source": {"created_by": "runs/chat/20260722-050015",
                        "touched_by": ["ui-edit"]}},
            {"id": f"{pid}-n002", "type": "activity", "label": "حذف‌شده", "description": "",
             "actor": "", "icom": _icom("C"), "subprocess": None,
             "position": {"x": 300, "y": 104}, "layout": "manual", "removed": True,
             "source": {"created_by": "runs/chat/20260722-050015", "touched_by": []}},
            {"id": f"{pid}-j1", "type": "junction", "junctionType": "XOR",
             "direction": "split", "position": {"x": 600, "y": 104}, "layout": "auto"},
        ],
        "edges": [{"from": f"{pid}-n001", "to": f"{pid}-j1", "label": "بعد"}],
        "pending": [{"node": f"{pid}-n001", "field": "label", "current": "الف",
                     "proposed": "ب", "source": "runs/chat/20260722-050015",
                     "status": "open"}],
    }
    if tombstoned:
        doc["tombstoned"] = True
        doc["superseded_by"] = ["cooking-001"]
    (d / f"{pid}.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def _all_confirmed(root, code: str) -> dict[str, str]:
    """Every process and the overview of `code`, confirmed at what is on disk.

    The bundle publishes only confirmed content (D22), so a payload test with no
    confirmations would assert things about an empty list — and would pass
    against a `build_payload` that had stopped filtering anything at all.
    """
    from inja_ui_backend import storage
    out = {}
    ov = storage.overview_path(root, code)
    if ov.is_file():
        out[code] = fingerprint(storage.read_json(ov))
    for path in storage.list_process_files(root, code):
        doc = storage.read_json(path)
        out[doc["id"]] = fingerprint(doc)
    return out


def _payload(root, code="cooking", at="2026-07-26T09:00:00Z", pol=None, confirmed=None):
    return exports.build_payload(
        root, code, at,
        policy=dict(policy.DEFAULTS) if pol is None else pol,
        confirmed=_all_confirmed(root, code) if confirmed is None else confirmed)


def test_build_payload_orders_processes_drops_tombstones_and_empties_pending(data_root):
    # the fixture seeds one live process; a deleted one and a second live one make the
    # tombstone filter load-bearing — `storage.ordered_processes` returns tombstones last
    # rather than dropping them, so this is the only thing keeping a deleted process out
    # of a permanent public document.
    _seed_process(data_root, "cooking", "cooking-002")
    _seed_process(data_root, "cooking", "cooking-009", tombstoned=True)

    payload = _payload(data_root)
    assert payload["dept"]["department"] == "cooking"
    assert payload["generated_at"] == "2026-07-26T09:00:00Z"
    ids = [p["id"] for p in payload["processes"]]
    assert ids == ["cooking-001", "cooking-002"]
    assert "cooking-009" not in ids
    assert all(p["pending"] == [] for p in payload["processes"])
    assert all(not p.get("tombstoned") for p in payload["processes"])


def test_build_payload_ships_exactly_the_keys_the_documents_render(data_root):
    """The whitelist, pinned as an equality.

    An equality and not a set of `not in`s: the export link is unauthenticated,
    so the interesting failure is a field nobody thought to name — one added to
    `process.schema.json` next month and copied straight into a public file.
    This fails on that too, and the fix is to decide, here, whether a document
    renders it.

    The set grew by three — `summary`, `idef0` and `kpis` — and that is the point
    of P1 rather than a regression. They arrive **blanked** under D17's defaults
    and populated the moment an Editor switches one on, which is exactly what
    makes D27's policy-versioned cache key necessary: the same department, the
    same content, a different document.
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = _payload(data_root)

    assert payload["processes"]
    for proc in payload["processes"]:
        assert set(proc) == {"id", "department", "name", "parent", "edges",
                             "summary", "idef0", "kpis", "nodes", "pending"}, proc["id"]


def test_the_bundle_carries_no_node_key_the_whitelist_does_not_name(data_root):
    """The node whitelist, from the published side of it.

    `exports` used to keep a **blacklist** here (`out = dict(node)`), so a node
    key nobody had heard of shipped from an unauthenticated link on the day it
    was written — while the API's copy of the same node, built by
    `visibility.PUBLIC_NODE_KEYS`, dropped it. One filter now, and this is the
    assertion that says so from the file's own end: an unlisted key planted on
    disk must not reach the bundle.
    """
    from inja_ui_backend import visibility

    _seed_process(data_root, "cooking", "cooking-002")
    path = data_root / "departments" / "cooking" / "processes" / "cooking-002.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][0]["internal_note"] = "SHOULDNOTSHIP"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    payload = _payload(data_root)

    assert "SHOULDNOTSHIP" not in json.dumps(payload, ensure_ascii=False)
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")
    for node in proc["nodes"]:
        assert set(node) <= set(visibility.PUBLIC_NODE_KEYS), node
    # …and the node it was planted on really is in the bundle, or the absence
    # above is about a document that never travelled.
    assert any(n["id"] == "cooking-002-n001" for n in proc["nodes"])


def test_build_payload_blanks_node_provenance(data_root):
    """A node's `source` names the meeting it came from and who edited it.

    Blanked rather than dropped: `DetailDrawer` renders `source.created_by` with
    no guard, so a missing key is a `TypeError` in a document already handed out.
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = _payload(data_root)

    seen = 0
    for proc in payload["processes"]:
        for node in proc["nodes"]:
            if node["type"] != "activity":
                continue
            seen += 1
            assert node["source"] == {"created_by": "", "touched_by": []}
    assert seen, "no activity node was checked — the fixture stopped exercising this"


def test_build_payload_blanks_node_icom(data_root):
    """The drawer's ICOM block is gated off in the export (`showIcom={false}`).

    The gate is one JSX prop with a default of *true*, not a guarantee, and
    `ActivityNode.icom` is required — so the value goes and the shape stays.
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = _payload(data_root)

    for proc in payload["processes"]:
        for node in proc["nodes"]:
            if "icom" in node:
                assert node["icom"] == {"inputs": [], "controls": [],
                                        "outputs": [], "mechanisms": []}


def test_no_provenance_survives_anywhere_in_the_payload(data_root):
    """Whatever route a withheld value takes, it must not reach the file."""
    _seed_process(data_root, "cooking", "cooking-002")
    _seed_process(data_root, "cooking", "cooking-009", tombstoned=True)

    payload = _payload(data_root)
    body = json.dumps(payload, ensure_ascii=False)

    for secret in SECRETS:
        assert secret not in body, secret


def test_build_payload_keeps_what_the_documents_are_built_on(data_root):
    """The fields that are load-bearing in non-obvious ways.

    Each one is quiet when it breaks: a missing `department` makes the drawer's
    seeded query miss and throw; a missing `pending` makes `toFlowNodes` iterate
    `undefined`; a missing `position` collapses the whole diagram onto one point.

    **The soft-deleted node itself no longer travels**, and that is the one line
    of this test that changed with P1: `visibility.filtered` drops a removed node
    for a non-editor (it is a record somebody deleted, D56's Whole-records row)
    and drops every edge naming one with it. The export's three consumers —
    `flow/adapt.ts`, `steps/linearize.ts` and `print/complete.ts` — each filtered
    `removed` in the browser, so what changes for them is that their filter now
    has nothing to do; what changes for a reader with dev tools is that the
    deleted step's label is no longer in the file.
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = _payload(data_root)
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")

    # keys the export's react-query cache and the drawer agree on
    assert payload["dept"]["department"] == "cooking"
    assert proc["department"] == "cooking"
    # present and empty — `toFlowNodes` iterates it
    assert proc["pending"] == []
    assert "parent" in proc

    by_id = {n["id"]: n for n in proc["nodes"]}
    assert set(by_id) == {"cooking-002-n001", "cooking-002-j1"}, (
        "the live nodes must all travel, and the soft-deleted one must not")
    activity = by_id["cooking-002-n001"]
    assert activity["position"] == {"x": 30, "y": 104}
    assert (activity["label"], activity["actor"], activity["description"]) \
        == ("برداشت", "انباردار", "شرح")
    assert activity["subprocess"] is None
    assert by_id["cooking-002-j1"]["junctionType"] == "XOR"
    assert proc["edges"] == [{"from": "cooking-002-n001", "to": "cooking-002-j1",
                              "label": "بعد"}]


def test_a_soft_deleted_node_and_its_edges_do_not_reach_the_bundle(data_root):
    """The whole-record rule, on the surface it matters most.

    A published file is read by anyone holding the link, so a deleted step's
    label sitting in it and merely not drawn is the same disclosure the API's
    version of this rule closes. The edges go with the node: `flow/adapt.ts`
    maps `e.from`/`e.to` with no guard and @xyflow resolves nothing for an
    endpoint that is not on the canvas, so half a fix is a diagram with a hole.
    """
    _seed_process(data_root, "cooking", "cooking-002")
    path = data_root / "departments" / "cooking" / "processes" / "cooking-002.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][1]["label"] = "GONESTEP"
    doc["edges"].append({"from": "cooking-002-n002", "to": "cooking-002-j1",
                         "label": "از حذف‌شده"})
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    payload = _payload(data_root)
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")

    assert "GONESTEP" not in json.dumps(payload, ensure_ascii=False)
    assert "cooking-002-n002" not in [n["id"] for n in proc["nodes"]]
    assert all("cooking-002-n002" not in (e["from"], e["to"]) for e in proc["edges"])
    # …and the edge between two live nodes is still there, or this is 'drop every
    # edge' and the diagram is a row of unconnected boxes.
    assert {"from": "cooking-002-n001", "to": "cooking-002-j1",
            "label": "بعد"} in proc["edges"]


def test_build_payload_does_not_mutate_the_source_documents(data_root, monkeypatch):
    source = [{
        "id": "cooking-001",
        "pending": [{"question": "open"}],
        "summary": "خلاصهٔ داخلی",
        "nodes": [{"id": "n1", "type": "activity", "icom": _icom("B"),
                   "source": {"created_by": "runs/chat/20260722-050015",
                              "touched_by": ["ui-edit"]}}],
    }]
    monkeypatch.setattr(exports.storage, "ordered_processes", lambda root, code: source)

    # Confirmed at the *stub's* bytes, not the fixture's: `ordered_processes` is
    # what the payload reads, so a `confirmed` map built from disk would name a
    # fingerprint this document does not have and publish nothing at all.
    payload = _payload(data_root, confirmed={**_all_confirmed(data_root, "cooking"),
                                             "cooking-001": fingerprint(source[0])})

    assert payload["processes"][0]["pending"] == []
    assert payload["processes"][0]["nodes"][0]["source"]["created_by"] == ""
    # the copy is what is trimmed; the caller's own dicts are untouched
    assert source[0]["pending"] == [{"question": "open"}]
    assert source[0]["summary"] == "خلاصهٔ داخلی"
    assert source[0]["nodes"][0]["source"]["touched_by"] == ["ui-edit"]
    assert source[0]["nodes"][0]["icom"]["inputs"] == ["دستور پخت محرمانه B"]


def test_blanked_records_are_not_shared_between_nodes(data_root):
    """Each blanked value is its own object, so nothing can alias into another."""
    _seed_process(data_root, "cooking", "cooking-002")

    payload = _payload(data_root)
    nodes = [n for p in payload["processes"] for n in p["nodes"] if n["type"] == "activity"]

    assert len({id(n["source"]) for n in nodes}) == len(nodes)
    assert len({id(n["icom"]["inputs"]) for n in nodes}) == len(nodes)


def test_the_bundle_carries_no_cross_department_link(data_root):
    """The debt P0b handed over, closed.

    The artifact is cached and shared (D27), so it cannot depend on which Editor
    pressed Export. The rule is caller-independent instead: the bundle is built
    for a reader who may see *this department and nothing else*, which costs
    nothing — a link out of the bundle was never followable inside it.
    """
    _seed_process(data_root, "cooking", "cooking-002")
    path = data_root / "departments" / "cooking" / "processes" / "cooking-002.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["parent"] = {"process": "dining-777", "node": "dining-777-n010"}
    doc["nodes"][0]["subprocess"] = "dining-888"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    payload = _payload(data_root)
    text = json.dumps(payload, ensure_ascii=False)
    assert "dining-777" not in text and "dining-888" not in text
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")
    assert proc["parent"] is None
    assert proc["nodes"][0]["subprocess"] is None


def test_an_in_department_sub_process_link_survives_the_bundle(data_root):
    """The other direction, or the fix is 'blank every link', which takes the
    sub-process graph away from the people it is for.

    On a **live** node: the brief's version planted it on `nodes[1]`, which is
    the soft-deleted one, so the link it asserted on would now be dropped with
    its node and the test would be pinning the wrong rule — and would have gone
    green again the day somebody blanked every link.
    """
    _seed_process(data_root, "cooking", "cooking-002")
    path = data_root / "departments" / "cooking" / "processes" / "cooking-002.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][0]["subprocess"] = "cooking-001"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    payload = _payload(data_root)
    assert "cooking-001" in json.dumps(payload, ensure_ascii=False)
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")
    assert proc["nodes"][0]["subprocess"] == "cooking-001"


def test_the_bundle_publishes_only_confirmed_processes(data_root):
    """D22 — reports render only confirmed processes."""
    _seed_process(data_root, "cooking", "cooking-002")
    confirmed = _all_confirmed(data_root, "cooking")
    del confirmed["cooking-002"]
    payload = _payload(data_root, confirmed=confirmed)
    assert [p["id"] for p in payload["processes"]] == ["cooking-001"]


def test_a_process_whose_content_moved_is_no_longer_published(data_root):
    """The mark is a fingerprint, and the bundle is not a second opinion."""
    confirmed = _all_confirmed(data_root, "cooking")
    confirmed["cooking-001"] = "0" * 64
    assert _payload(data_root, confirmed=confirmed)["processes"] == []


def test_a_department_whose_overview_is_unconfirmed_cannot_be_published(data_root):
    """The overview is confirmed like anything else (D20, D55), and a bundle that
    published an unreviewed introduction would be the one page every reader opens
    first."""
    confirmed = _all_confirmed(data_root, "cooking")
    del confirmed["cooking"]
    with pytest.raises(exports.Unconfirmed):
        _payload(data_root, confirmed=confirmed)


def test_a_tombstone_is_absent_even_when_it_carries_a_valid_confirmation(data_root):
    """The two record-gate clauses are separate, and the tombstone one has no
    switch and no exemption (D17).

    Confirming a tombstone is not reachable through the API — `POST
    /api/confirmations/{target}` refuses one — but nothing revalidates the store
    on read, and a mark left behind by a process that was tombstoned *after* it
    was vouched for is the ordinary way this row exists. So the tombstone filter
    may not be reachable only through "it happens to be unconfirmed".
    """
    _seed_process(data_root, "cooking", "cooking-009", tombstoned=True)
    confirmed = _all_confirmed(data_root, "cooking")
    assert "cooking-009" in confirmed, (
        "the tombstone is not in the confirmed map, so this test is about the"
        " confirmation filter rather than about the tombstone one")

    payload = _payload(data_root, confirmed=confirmed)
    assert [p["id"] for p in payload["processes"]] == ["cooking-001"]


def test_the_policy_decides_what_the_bundle_carries(data_root):
    """§11 test 8 for the artifact, and the reason the cache key needs the policy
    version: the same department and the same content produce two documents.

    `_seed_process` is what plants the summary — the conftest fixture's own
    `cooking-001` carries different prose — so without it the `not in` above
    would pass against a payload that had never had the field, which is this
    project's recurring defect species and not a test.
    """
    _seed_process(data_root, "cooking", "cooking-002")
    on_disk = json.loads(
        (data_root / "departments" / "cooking" / "processes" / "cooking-002.json")
        .read_text(encoding="utf-8"))
    assert on_disk["summary"] == "خلاصهٔ داخلی این فرآیند", "the premise is gone"

    hidden = _payload(data_root)
    shown = _payload(data_root, pol={**policy.DEFAULTS, "process_summary": True})
    assert "خلاصهٔ داخلی این فرآیند" not in json.dumps(hidden, ensure_ascii=False)
    assert "خلاصهٔ داخلی این فرآیند" in json.dumps(shown, ensure_ascii=False)


def test_the_overview_travels_in_full(data_root):
    """D55 — the department information page is published in its entirety.

    The plan had `updated_at` withheld here. It is not: the project owner
    overruled that while `visibility.public_overview` was being written, and this
    file follows the one filter rather than keeping a second opinion about the
    overview — which is the whole point of the task.
    """
    from inja_ui_backend import storage

    payload = _payload(data_root)
    assert payload["dept"] == storage.read_json(
        storage.overview_path(data_root, "cooking"))
    assert payload["dept"]["description"]


# --- the cache key (§11 test 22) ---

KEY = dict(process_fingerprints=["a" * 64, "b" * 64],
           overview_fingerprint="c" * 64, policy_version="d" * 16)


def test_the_key_is_16_hex_chars_and_stable():
    a = exports.report_key("key", "dining", "flowchart", **KEY)
    assert a == exports.report_key("key", "dining", "flowchart", **KEY)
    assert len(a) == 16 and all(c in "0123456789abcdef" for c in a)


def test_the_key_changes_when_the_visibility_policy_changes():
    """The clause that is a content leak if it fails, not a stale page: the
    payload is built by the filter, so a cached artifact must not survive the
    switch that changed what it contains."""
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key("key", "dining", "flowchart",
                                      **{**KEY, "policy_version": "e" * 16})


def test_the_key_changes_when_a_process_is_confirmed_or_edited():
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key(
        "key", "dining", "flowchart",
        **{**KEY, "process_fingerprints": ["a" * 64, "b" * 64, "f" * 64]})
    assert base != exports.report_key(
        "key", "dining", "flowchart",
        **{**KEY, "process_fingerprints": ["a" * 64, "f" * 64]})


def test_the_key_changes_when_the_department_is_reordered():
    """order.json is the document's table of contents: a reorder changes what the
    reader receives while changing no process."""
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key(
        "key", "dining", "flowchart",
        **{**KEY, "process_fingerprints": ["b" * 64, "a" * 64]})


def test_the_key_changes_when_the_overview_changes():
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key("key", "dining", "flowchart",
                                      **{**KEY, "overview_fingerprint": "e" * 64})


def test_the_key_still_differs_by_department_kind_and_signing_key():
    """The properties `export_token` had, kept: the folder is publicly mounted
    and the filename is still a guard until D24 removes that surface."""
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key("key", "dining", "steps", **KEY)
    assert base != exports.report_key("key", "cooking", "flowchart", **KEY)
    assert base != exports.report_key("other", "dining", "flowchart", **KEY)


def test_the_key_separates_a_split_fingerprint_list_from_its_merge():
    """The NUL between parts, pinned with inputs that would actually collide.

    Unreachable through every other test above — every part here is
    fixed-length hex, so no real fingerprint list can ever equal another
    part's bytes — but the property the delimiter buys is real: without it,
    `mac.update` for `["a"*64, "b"*64]` and for `["a"*64 + "b"*64]` consume the
    identical byte stream (`a`*64 immediately followed by `b`*64 either way),
    and the two keys would collide.
    """
    split = exports.report_key("key", "dining", "flowchart",
                               process_fingerprints=["a" * 64, "b" * 64],
                               overview_fingerprint="c" * 64,
                               policy_version="d" * 16)
    merged = exports.report_key("key", "dining", "flowchart",
                                process_fingerprints=["a" * 64 + "b" * 64],
                                overview_fingerprint="c" * 64,
                                policy_version="d" * 16)
    assert split != merged


def test_cross_task_contract_constants():
    # Tasks 4 and 5 bind to both of these; a typo surfaces downstream only as a blank export
    assert exports.EXPORT_KINDS == ("flowchart", "steps")
    assert exports.DATA_SLOT == "__INJA_EXPORT_DATA__"


def test_render_substitutes_the_slot_and_escapes_angle_brackets():
    template = '<script id="inja-export-data">__INJA_EXPORT_DATA__</script>'
    html = exports.render(template, {"name": "</script><img src=x>"})
    assert "__INJA_EXPORT_DATA__" not in html
    # the payload cannot close the script tag
    assert html.count("</script>") == 1
    assert "\\u003c" in html
    # and it still parses back to the original text
    body = html[html.index(">") + 1: html.rindex("</script>")]
    assert json.loads(body)["name"] == "</script><img src=x>"


def test_render_keeps_persian_unescaped():
    html = exports.render("__INJA_EXPORT_DATA__", {"name": "سالن"})
    assert "سالن" in html


def test_render_raises_when_the_template_has_no_data_slot():
    with pytest.raises(exports.ExportUnavailable) as excinfo:
        exports.render("<html><body>built without the slot</body></html>", {"a": 1})
    assert exports.DATA_SLOT in str(excinfo.value)


def test_write_export_creates_the_file_and_prunes_older_siblings(tmp_path):
    d = tmp_path / "exports"
    stale = d / "dining"
    stale.mkdir(parents=True)
    (stale / "flowchart-deadbeefdeadbeef.html").write_text("old", encoding="utf-8")
    (stale / "steps-cafecafecafecafe.html").write_text("keep", encoding="utf-8")

    path = exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "<html>new</html>")

    assert path == d / "dining" / "flowchart-0123456789abcdef.html"
    assert path.read_text(encoding="utf-8") == "<html>new</html>"
    assert not (stale / "flowchart-deadbeefdeadbeef.html").exists()   # pruned
    assert (stale / "steps-cafecafecafecafe.html").exists()            # other kind untouched
    assert not list(d.glob("**/*.tmp"))                                 # no temp left behind


def test_write_export_overwrites_the_same_token(tmp_path):
    d = tmp_path / "exports"
    exports.write_export(d, "dining", "steps", "0123456789abcdef", "first")
    path = exports.write_export(d, "dining", "steps", "0123456789abcdef", "second")
    assert path.read_text(encoding="utf-8") == "second"
    assert len(list((d / "dining").glob("steps-*.html"))) == 1


def test_write_export_warns_when_a_stale_sibling_cannot_be_pruned(tmp_path, monkeypatch, caplog):
    d = tmp_path / "exports"
    folder = d / "dining"
    folder.mkdir(parents=True)
    stale = folder / "flowchart-deadbeefdeadbeef.html"
    stale.write_text("revoked", encoding="utf-8")

    real_unlink = Path.unlink

    def refuse(self, *a, **kw):
        if self.name == stale.name:
            raise OSError(13, "Permission denied")
        return real_unlink(self, *a, **kw)

    monkeypatch.setattr(Path, "unlink", refuse)

    with caplog.at_level(logging.WARNING):
        exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "new")

    # the revoked export is still being served, so it must not vanish silently
    assert stale.exists()
    assert any(stale.name in r.getMessage() for r in caplog.records)


def test_write_export_sweeps_orphan_temp_files(tmp_path):
    d = tmp_path / "exports"
    folder = d / "dining"
    folder.mkdir(parents=True)
    orphan = folder / "tmpdeadbeef.tmp"
    orphan.write_text("half-written department payload", encoding="utf-8")
    old = time.time() - 2 * exports.TMP_SWEEP_AGE_S
    os.utime(orphan, (old, old))
    inflight = folder / "tmpcafecafe.tmp"
    inflight.write_text("another writer, mid-write", encoding="utf-8")

    exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "new")

    assert not orphan.exists()
    assert inflight.exists()   # a live write is not yanked out from under another process


def test_write_export_failure_leaves_no_tmp_and_spares_the_existing_file(tmp_path):
    d = tmp_path / "exports"
    folder = d / "dining"
    folder.mkdir(parents=True)
    existing = folder / "flowchart-deadbeefdeadbeef.html"
    existing.write_text("previous", encoding="utf-8")

    with pytest.raises(TypeError):
        exports.write_export(d, "dining", "flowchart", "0123456789abcdef", None)

    assert not list(d.glob("**/*.tmp"))
    assert existing.read_text(encoding="utf-8") == "previous"
    assert not (folder / "flowchart-0123456789abcdef.html").exists()


def test_build_payload_raises_for_a_department_without_an_overview(data_root):
    """Exactly `ExportUnavailable`, not its subclass `Unconfirmed`.

    `pytest.raises(ExportUnavailable)` alone is satisfied by either: a mutant
    that asks the confirmation question before the file-existence one would
    raise `Unconfirmed` for a department with no `confirmed` entry — which
    `dining` has none of either way — and this would still go green.
    """
    with pytest.raises(exports.ExportUnavailable) as excinfo:
        _payload(data_root, "dining")
    assert type(excinfo.value) is exports.ExportUnavailable, (
        f"raised {type(excinfo.value).__name__}, not ExportUnavailable itself —"
        f" this is the missing-overview branch, not the unconfirmed one")


def test_export_pdf_path_sits_beside_the_html(tmp_path):
    """Same folder, same stem, `.pdf` — the document's own print button builds
    its href by swapping the extension, so the two names cannot drift apart."""
    d = tmp_path / "exports"
    html = exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "<html>x</html>")
    pdf = exports.export_pdf_path(d, "dining", "flowchart", "0123456789abcdef")
    assert pdf == html.with_suffix(".pdf")
    assert pdf.parent == html.parent
    assert pdf.name == "flowchart-0123456789abcdef.pdf"


def test_write_export_prunes_stale_pdf_siblings(tmp_path):
    """A rotated signing key orphans a `.pdf` exactly as it orphans a `.html`.

    Without this the old PDF stays in the publicly served folder forever, still
    reachable by anyone holding the revoked link — the very thing the `.html`
    prune exists to prevent.
    """
    d = tmp_path / "exports"
    folder = d / "dining"
    folder.mkdir(parents=True)
    (folder / "flowchart-deadbeefdeadbeef.html").write_text("old", encoding="utf-8")
    (folder / "flowchart-deadbeefdeadbeef.pdf").write_bytes(b"%PDF-old")
    (folder / "steps-cafecafecafecafe.pdf").write_bytes(b"%PDF-other-kind")

    exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "<html>new</html>")

    assert not (folder / "flowchart-deadbeefdeadbeef.pdf").exists()   # pruned
    assert (folder / "steps-cafecafecafecafe.pdf").exists()           # other kind untouched


def test_write_export_removes_the_current_tokens_pdf(tmp_path):
    """The PDF at *this* token's path goes too, and that is the point of it.

    The token is derived, not stored, so that path is the same on every export.
    Whatever sits there when this function is called was printed from the document
    this call is overwriting: from the moment the new HTML lands it is a PDF that
    disagrees with the page beside it, and both are served from the same public
    folder one extension apart.

    Nothing else clears it in time. The render that refreshes it runs *after* this
    returns and takes seconds (~5 s measured), and the endpoint's own unlink (D21)
    runs later still — so a container restart or the OOM killer anywhere in that
    window used to make the mismatch permanent, until someone re-exported that
    department by hand. Removing it here costs those seconds with no PDF, during
    which the document's «چاپ / PDF» button falls back to `window.print()`: a
    missing PDF degrades visibly, a wrong one does not.
    """
    d = tmp_path / "exports"
    folder = d / "dining"
    folder.mkdir(parents=True)
    previous = folder / "flowchart-0123456789abcdef.pdf"
    previous.write_bytes(b"%PDF-the document as it looked last week")

    exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "<html>new</html>")

    assert not previous.exists()
    assert not list(folder.glob("*.pdf"))


def test_the_previous_pdf_is_gone_before_the_new_html_lands(tmp_path, monkeypatch):
    """Ordering, not just the end state — that is the whole finding.

    A crash is only dangerous in the gap between the two writes, so the invariant
    has to hold at every instant, not merely once `write_export` returns. The HTML
    is what a reader loads and the PDF is one extension away from it, so the PDF
    must go first: the worst state reachable at any point is then "old document,
    no PDF", never "new document, old PDF".
    """
    d = tmp_path / "exports"
    folder = d / "dining"
    folder.mkdir(parents=True)
    previous = folder / "flowchart-0123456789abcdef.pdf"
    previous.write_bytes(b"%PDF-last week")

    seen = {}
    real = exports.storage.write_text_atomic

    def observe(path, text):
        seen["pdf_still_there"] = previous.exists()
        return real(path, text)

    monkeypatch.setattr(exports.storage, "write_text_atomic", observe)
    exports.write_export(d, "dining", "flowchart", "0123456789abcdef", "<html>new</html>")

    assert seen["pdf_still_there"] is False, (
        "the previous export's PDF was still on disk when the new HTML was written")
