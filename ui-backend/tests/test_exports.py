import json

import pytest
from inja_ui_backend import exports


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
    payload = exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")
    assert payload["dept"]["department"] == "cooking"
    assert payload["generated_at"] == "2026-07-26T09:00:00Z"
    assert [p["id"] for p in payload["processes"]] == ["cooking-001"]
    assert all(p["pending"] == [] for p in payload["processes"])
    assert all(not p.get("tombstoned") for p in payload["processes"])


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


def test_build_payload_raises_for_a_department_without_an_overview(data_root):
    with pytest.raises(exports.ExportUnavailable):
        exports.build_payload(data_root, "dining", "2026-07-26T09:00:00Z")
