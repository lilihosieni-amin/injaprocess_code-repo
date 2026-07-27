import json
import logging
import os
import time
from pathlib import Path

import pytest
from inja_ui_backend import exports

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


def test_token_is_16_hex_chars_and_stable():
    a = exports.export_token("key", "dining", "flowchart")
    b = exports.export_token("key", "dining", "flowchart")
    assert a == b
    assert len(a) == 16
    assert all(c in "0123456789abcdef" for c in a)


def test_token_differs_by_kind_department_and_key():
    base = exports.export_token("key", "dining", "flowchart")
    assert base != exports.export_token("key", "dining", "steps")
    assert base != exports.export_token("key", "cooking", "flowchart")
    assert base != exports.export_token("other", "dining", "flowchart")


def test_build_payload_orders_processes_drops_tombstones_and_empties_pending(data_root):
    # the fixture seeds one live process; a deleted one and a second live one make the
    # tombstone filter load-bearing — `storage.ordered_processes` returns tombstones last
    # rather than dropping them, so this is the only thing keeping a deleted process out
    # of a permanent public document.
    _seed_process(data_root, "cooking", "cooking-002")
    _seed_process(data_root, "cooking", "cooking-009", tombstoned=True)

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")
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
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")

    assert payload["processes"]
    for proc in payload["processes"]:
        assert set(proc) == {"id", "department", "name", "parent",
                             "nodes", "edges", "pending"}, proc["id"]


def test_build_payload_blanks_node_provenance(data_root):
    """A node's `source` names the meeting it came from and who edited it.

    Blanked rather than dropped: `DetailDrawer` renders `source.created_by` with
    no guard, so a missing key is a `TypeError` in a document already handed out.
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")

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

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")

    for proc in payload["processes"]:
        for node in proc["nodes"]:
            if "icom" in node:
                assert node["icom"] == {"inputs": [], "controls": [],
                                        "outputs": [], "mechanisms": []}


def test_no_provenance_survives_anywhere_in_the_payload(data_root):
    """Whatever route a withheld value takes, it must not reach the file."""
    _seed_process(data_root, "cooking", "cooking-002")
    _seed_process(data_root, "cooking", "cooking-009", tombstoned=True)

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")
    body = json.dumps(payload, ensure_ascii=False)

    for secret in SECRETS:
        assert secret not in body, secret


def test_build_payload_keeps_what_the_documents_are_built_on(data_root):
    """The fields that are load-bearing in non-obvious ways.

    Each one is quiet when it breaks: a missing `department` makes the drawer's
    seeded query miss and throw; a missing `pending` makes `toFlowNodes` iterate
    `undefined`; a missing `position` collapses the whole diagram onto one point;
    a missing `removed` puts soft-deleted nodes back into the counts, the bands
    and the printed steps.
    """
    _seed_process(data_root, "cooking", "cooking-002")

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")

    # keys the export's react-query cache and the drawer agree on
    assert payload["dept"]["department"] == "cooking"
    assert proc["department"] == "cooking"
    # present and empty — `toFlowNodes` iterates it
    assert proc["pending"] == []
    assert "parent" in proc

    by_id = {n["id"]: n for n in proc["nodes"]}
    assert len(by_id) == 3, "every node still travels, soft-deleted ones included"
    activity = by_id["cooking-002-n001"]
    assert activity["position"] == {"x": 30, "y": 104}
    assert (activity["label"], activity["actor"], activity["description"]) \
        == ("برداشت", "انباردار", "شرح")
    assert activity["subprocess"] is None
    assert by_id["cooking-002-n002"]["removed"] is True
    assert by_id["cooking-002-j1"]["junctionType"] == "XOR"
    assert proc["edges"] == [{"from": "cooking-002-n001", "to": "cooking-002-j1",
                              "label": "بعد"}]


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

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")

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

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")
    nodes = [n for p in payload["processes"] for n in p["nodes"] if n["type"] == "activity"]

    assert len({id(n["source"]) for n in nodes}) == len(nodes)
    assert len({id(n["icom"]["inputs"]) for n in nodes}) == len(nodes)


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
    with pytest.raises(exports.ExportUnavailable):
        exports.build_payload(data_root, "dining", "2026-07-26T09:00:00Z")
