import json
import logging
import os
import time
from pathlib import Path

import pytest
from inja_ui_backend import exports


def _seed_process(root, code, pid, tombstoned=False):
    """Write a process file straight to disk, like tests/test_storage.py's `_proc`."""
    d = root / "departments" / code / "processes"
    d.mkdir(parents=True, exist_ok=True)
    doc = {"id": pid, "department": code, "name": pid, "pending": [{"question": "open"}]}
    if tombstoned:
        doc["tombstoned"] = True
    (d / f"{pid}.json").write_text(json.dumps(doc), encoding="utf-8")


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


def test_build_payload_does_not_mutate_the_source_documents(data_root, monkeypatch):
    source = [{"id": "cooking-001", "pending": [{"question": "open"}]}]
    monkeypatch.setattr(exports.storage, "ordered_processes", lambda root, code: source)

    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")

    assert payload["processes"][0]["pending"] == []
    # the copy is what gets emptied; the caller's dict keeps its own pending
    assert source[0]["pending"] == [{"question": "open"}]


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
