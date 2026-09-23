"""The download — who may have the built bytes, and how they are served.

Two halves, and both are load-bearing. The first is the gate: `access.requires`
asks scope before capability (D56), so a department the caller may not learn of
answers the same bare 404 a never-built report does, and someone who can see the
department but holds no `export_pdf` gets a 403 and an `access.denied` row. The
second is serving parity with the static mount this route replaced — ranges,
conditional requests, HEAD and `Cache-Control` — which nothing else in the suite
would notice the loss of, because every one of them is invisible to a test that
only asks for the whole file once.

These tests are the designed replacement for the sections `test_reports_api.py`
lost when the download moved off `/exports`: its own gate section, its scope
section and its capability section all published through the endpoint that is
gone.
"""
import dataclasses
from pathlib import Path

from inja_ui_backend import db, pdf as pdf_mod
from inja_ui_backend.access import FORBIDDEN, NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import audit_events, cfg_for, comment_people

PDF = "/api/departments/cooking/reports/steps/file.pdf"
FLOWCHART = "/api/departments/cooking/reports/flowchart/file.pdf"


def _people(data_root, tmp_path):
    """`comment_people`, with the export settings a build needs.

    The template directory holds the two slot-carrying stubs `test_reports_api`
    writes, and `export_dir` is a directory of its own under `tmp_path`.
    """
    tdir = tmp_path / "templates"
    tdir.mkdir()
    for kind in ("flowchart", "steps"):
        (tdir / f"{kind}.html").write_text(
            '<!doctype html><script id="inja-export-data">__INJA_EXPORT_DATA__</script>',
            encoding="utf-8")
    return comment_people(data_root, tmp_path, export_dir=tmp_path / "exports",
                          export_template_dir=tdir)


def _built(data_root, tmp_path, monkeypatch):
    """Everybody from `_people`, with cooking/steps actually on disk.

    `comment_people` already confirms `cooking-001` and the cooking overview, so
    the department is publishable; the render is stubbed because a real chromium
    is neither present nor the subject — what is under test is who may have the
    bytes, not how they were printed.
    """
    people = _people(data_root, tmp_path)
    monkeypatch.setattr(pdf_mod, "render_pdf",
                        lambda _chromium, _html, out: out.write_bytes(b"%PDF-1.4\n" + b"x" * 512))
    # The stub is not enough on its own: `_render_pdf_beside` does not reach
    # `render_pdf` at all with CHROMIUM_PATH unset, and would leave the build
    # with an HTML document and no PDF beside it. The value is never opened, so
    # it only has to be there. One app behind all six clients, so one replace
    # covers them all.
    app = people["editor"].app
    app.state.cfg = dataclasses.replace(app.state.cfg,
                                        chromium_path=Path("/nonexistent/chromium"))
    r = people["editor"].post("/api/departments/cooking/reports/steps")
    assert r.status_code == 200, r.text
    return people


def _set_role(client, role: str) -> None:
    conn = db.connect(client.app_db)
    try:
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        conn.execute("UPDATE users SET role_id = ? WHERE display_name = 'other'", (rid,))
        conn.commit()
    finally:
        conn.close()


def _set_scope(client, scope: str) -> None:
    """Replace `other`'s scopes with exactly one, so a narrow grant can be asked
    what it reaches. Written to the store directly for `_set_role`'s reason: the
    subject is the download, not the endpoint that grants."""
    conn = db.connect(client.app_db)
    try:
        uid = conn.execute("SELECT id FROM users WHERE display_name = 'other'").fetchone()[0]
        conn.execute("DELETE FROM user_scopes WHERE user_id = ?", (uid,))
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, scope))
        conn.commit()
    finally:
        conn.close()


def _unconfirm(client, target: str) -> None:
    """Withdraw one confirmation — `store/confirmations.py:60`'s own statement,
    run here because what is under test is the download, not the endpoint that
    revokes."""
    conn = db.connect(client.app_db)
    try:
        conn.execute("DELETE FROM confirmations WHERE target = ?", (target,))
        conn.commit()
    finally:
        conn.close()


def test_the_pdf_is_served_to_an_export_pdf_holder(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    r = people["viewer"].get(PDF)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
    assert r.headers["cache-control"] == "private, no-cache"


def test_the_served_file_carries_both_validators(data_root, tmp_path, monkeypatch):
    """Without them there is nothing for a conditional request to match, and the
    304 below would be a test of the request headers alone."""
    people = _built(data_root, tmp_path, monkeypatch)
    r = people["viewer"].get(PDF)
    assert r.headers["etag"] and r.headers["last-modified"]


def test_head_answers_without_a_body(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    r = people["viewer"].head(PDF)
    assert r.status_code == 200 and r.content == b""


def test_a_conditional_request_is_answered_304(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    etag = people["viewer"].get(PDF).headers["etag"]
    r = people["viewer"].get(PDF, headers={"If-None-Match": etag})
    assert r.status_code == 304 and r.content == b""


def test_an_if_modified_since_request_is_answered_304(data_root, tmp_path, monkeypatch):
    """The other half of what the mount did. A browser that stored only the date
    revalidates with this header and no etag, and a check that read `If-None-Match`
    alone would send it the whole document again."""
    people = _built(data_root, tmp_path, monkeypatch)
    since = people["viewer"].get(PDF).headers["last-modified"]
    r = people["viewer"].get(PDF, headers={"If-Modified-Since": since})
    assert r.status_code == 304 and r.content == b""


def test_a_range_request_is_answered_206(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    r = people["viewer"].get(PDF, headers={"Range": "bytes=0-9"})
    assert r.status_code == 206 and len(r.content) == 10


def test_the_html_artifact_is_served_on_the_same_terms(data_root, tmp_path, monkeypatch):
    """Both extensions (D25): the standalone HTML is what ARD §13.4 falls back to
    when a render fails, so a route that served only `.pdf` would lose the
    department's document on exactly the deployment that has no browser."""
    people = _built(data_root, tmp_path, monkeypatch)
    r = people["viewer"].get("/api/departments/cooking/reports/steps/file.html")
    assert r.status_code == 200 and "inja-export-data" in r.text


def test_reader_no_download_is_refused_and_recorded(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    _set_role(people["other"], "reader_no_download")
    r = people["other"].get(PDF)
    assert r.status_code == 403 and r.json()["detail"] == FORBIDDEN
    assert audit_events(people["other"], "access.denied")[-1]["target"] \
        == "dept:cooking/report:steps"


def test_another_department_is_not_found_and_not_recorded(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    before = len(audit_events(people["viewer"], "access.denied"))
    r = people["viewer"].get("/api/departments/dining/reports/steps/file.pdf")
    assert r.status_code == 404 and r.json()["detail"] == NOT_FOUND
    assert len(audit_events(people["viewer"], "access.denied")) == before


def test_a_report_grant_reaches_that_report_and_no_other(data_root, tmp_path, monkeypatch):
    """D10's narrow shape, asked of two artifacts that both exist.

    Both are built first, so the refusal below cannot be the "never built" 404
    wearing the gate's clothes — `viewer`, who holds the whole department, is
    served the very file `other` is refused.
    """
    people = _built(data_root, tmp_path, monkeypatch)
    assert people["editor"].post(
        "/api/departments/cooking/reports/flowchart").status_code == 200
    _set_scope(people["other"], "dept:cooking/report:steps")
    assert people["other"].get(PDF).status_code == 200
    assert people["other"].get(FLOWCHART).status_code == 404
    assert people["viewer"].get(FLOWCHART).status_code == 200


def test_a_wildcard_holder_reaches_a_department_no_scope_row_names(
        data_root, tmp_path, monkeypatch):
    """`*` is a containment answer, not a list of departments: `admin` holds no
    `dept:cooking` row at all and is served it, while `cadmin` — every capability
    `admin` has, scoped to one other department — is not."""
    people = _built(data_root, tmp_path, monkeypatch)
    assert people["admin"].get(PDF).status_code == 200
    assert people["cadmin"].get(PDF).status_code == 404


def test_a_report_that_was_never_built_is_not_found(data_root, tmp_path):
    # `_people`, not `_built`: everything is configured and confirmed and the
    # artifact simply is not there yet. Without the export settings this would
    # pass on the unconfigured branch instead, which is a different 404.
    people = _people(data_root, tmp_path)
    assert people["viewer"].get(PDF).status_code == 404


def test_content_moving_makes_the_built_file_unreachable(data_root, tmp_path, monkeypatch):
    """D28 — a report is always current. A confirmation change moves the key,
    so yesterday's artifact is not served under today's URL."""
    people = _built(data_root, tmp_path, monkeypatch)
    assert people["viewer"].get(PDF).status_code == 200
    _unconfirm(people["viewer"], "cooking-001")
    assert people["viewer"].get(PDF).status_code == 404


def test_downloading_is_recorded_with_its_format(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    people["viewer"].get(PDF)
    rows = audit_events(people["viewer"], "report.downloaded")
    assert rows[-1]["target"] == "dept:cooking/report:steps"
    assert '"format": "pdf"' in rows[-1]["detail"]


def test_an_unknown_extension_is_not_found(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    assert people["viewer"].get(
        "/api/departments/cooking/reports/steps/file.exe").status_code == 404


def test_a_malformed_path_is_refused_rather_than_raised(data_root, tmp_path, monkeypatch):
    """Traversal and an embedded NUL, asked by the caller who reaches furthest.

    The file name is computed now, so neither can become a path segment — but
    both still arrive as `{code}`, and what must not happen is a 500 with a
    traceback where the mount used to answer 404. Asked as `admin` (`*`) because
    a department-scoped caller would be stopped by the gate before any of this
    and the test would prove nothing about the handler.
    """
    admin = _built(data_root, tmp_path, monkeypatch)["admin"]
    for code in ("%2e%2e", "coo%00king", "%2e%2e%2f%2e%2e"):
        r = admin.get(f"/api/departments/{code}/reports/steps/file.pdf")
        assert r.status_code == 404, (code, r.status_code)


def test_the_export_credential_is_gone(data_root, tmp_path):
    import importlib
    import pytest
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("inja_ui_backend.export_auth")
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("inja_ui_backend.routers.export_files")


def test_the_old_public_surface_answers_nothing(data_root, tmp_path, monkeypatch):
    people = _built(data_root, tmp_path, monkeypatch)
    for path in ("/exports/cooking/steps-abc.html", "/api/exports/login",
                 "/api/exports/logout"):
        assert people["viewer"].get(path).status_code in (404, 405), path
    assert people["viewer"].post("/api/exports/login",
                                 data={"username": "x", "password": "y"}
                                 ).status_code in (404, 405)


def _registration_order(app) -> list[str]:
    """Every route's path in registration order, with the SPA mount as `static`.

    Not `[r.path for r in app.routes]`: since FastAPI 0.139 `include_router`
    leaves an `_IncludedRouter` in `app.routes` whose `path` is `None` and whose
    real routes hang off `original_router` (`test_body_scan._api_routes` learned
    the same thing). A comparison written the flat way finds no report route at
    all and passes on an empty list.
    """
    order: list[str] = []
    for route in app.routes:
        nested = getattr(getattr(route, "original_router", None), "routes", None)
        if nested is None:
            order.append(getattr(route, "path", "") or getattr(route, "name", ""))
        else:
            order += [r.path for r in nested]
    return order


def test_the_spa_mount_cannot_swallow_the_report_routes(data_root, tmp_path):
    """§11 test 18, for the three report routes. `app.mount("/")` is a catch-all
    and swallows everything registered after it; for an `/api/...` path its
    fallback is the same bare 404 the gate gives a caller who may not learn the
    surface exists, so a report route on the wrong side of it would look like a
    permission problem on every screen rather than an outage."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__, "static_dir": dist,
                           "export_dir": tmp_path / "exports"})
    order = _registration_order(create_app(cfg))
    mount = order.index("static")
    for p in ("/api/reports", "/api/departments/{code}/reports/{kind}",
              "/api/departments/{code}/reports/{kind}/file.{ext}"):
        assert p in order, f"{p} is not registered at all"
        assert order.index(p) < mount, f"{p} is registered after the SPA mount"
