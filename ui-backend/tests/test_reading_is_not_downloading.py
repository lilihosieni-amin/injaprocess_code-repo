"""§11 test 23 — the read path hands over a payload, never the artifact.

`_built` and `_set_role` come from `test_reports_download` rather than being
written again here: "a built report, and a user re-roled" has one definition in
this suite, and a second copy would drift from it the first time the build
changes.
"""
from .test_reports_download import _built, _set_role


def test_a_view_holder_never_receives_the_artifact_bytes(data_root, tmp_path, monkeypatch):
    """§11 test 23 — asserted on the **body**, not the status code.

    A status-only assertion passes against a handler that streams the file and
    labels it 200, which is exactly the failure D25 describes: the single file
    inlines the whole department, so serving it on the read path hands a reader
    without `export_pdf` the complete artifact and a Ctrl-S.
    """
    people = _built(data_root, tmp_path, monkeypatch)   # cooking/steps is on disk
    _set_role(people["other"], "reader_no_download")
    r = people["other"].get("/api/departments/cooking/reports/steps")
    assert r.status_code == 200
    body = r.content
    assert b"<!doctype" not in body.lower()
    assert b"<script" not in body.lower()
    assert b"%PDF" not in body
    assert r.headers["content-type"].startswith("application/json")
    # …and the file itself is refused
    assert people["other"].get(
        "/api/departments/cooking/reports/steps/file.pdf").status_code == 403
