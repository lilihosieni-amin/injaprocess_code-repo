import asyncio
import json
from pathlib import Path

import argon2
from fastapi.testclient import TestClient
from inja_ui_backend import export_auth
from inja_ui_backend import exports as exports_mod
from inja_ui_backend import pdf as pdf_mod
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import COOKIE_NAME, issue_cookie
from inja_ui_backend.tests_helpers import cfg_for

TEMPLATE = '<!doctype html><script id="inja-export-data">__INJA_EXPORT_DATA__</script>'


def _cfg(data_root, tmp_path, *, template_dir=True, template_files=True, exports=True):
    """`template_dir` is the *setting*; `template_files` is what the build left in it.

    They are separate because they fail for different reasons: an unset
    UI_EXPORT_TEMPLATE_DIR is a missing setting, while a configured directory with
    no `{kind}.html` in it is a build that never ran. Both answer 503, but only
    keeping them apart exercises both guards.
    """
    cfg = cfg_for(data_root)
    tdir = tmp_path / "templates"
    if template_dir:
        tdir.mkdir(exist_ok=True)
        if template_files:
            (tdir / "flowchart.html").write_text(TEMPLATE, encoding="utf-8")
            (tdir / "steps.html").write_text(TEMPLATE, encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__,
                           "export_dir": (tmp_path / "exports") if exports else None,
                           "export_template_dir": tdir if template_dir else None})


def _guard_logs(caplog):
    return [r.getMessage() for r in caplog.records
            if r.name == "inja_ui_backend.routers.exports"]


def _ascii_letters(text):
    """The Latin letters in `text` — a client-facing detail must have none.

    Digits, punctuation and the parenthesised setting names the 503s carry are
    not letters, so this catches prose ("unknown department") without banning
    «(EXPORT_DIR)»-style identifiers where they belong.
    """
    return [c for c in text if "a" <= c.lower() <= "z"]


def _client(cfg):
    c = TestClient(create_app(cfg))
    c.cookies.set(COOKIE_NAME, issue_cookie(cfg, "analyst"))
    return c


def test_export_writes_a_file_and_returns_its_url(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 200
    url = r.json()["url"]
    assert url.startswith("/exports/cooking/flowchart-") and url.endswith(".html")
    # resolved against the mount root, not by re-deriving the layout: the URL has
    # to be the file's own path under EXPORT_DIR or the mount cannot serve it
    written = cfg.export_dir / url[len("/exports/"):]
    assert written.is_file()
    assert "__INJA_EXPORT_DATA__" not in written.read_text(encoding="utf-8")


def test_export_url_is_stable_across_calls(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path))
    first = c.post("/api/departments/cooking/exports/steps").json()["url"]
    second = c.post("/api/departments/cooking/exports/steps").json()["url"]
    assert first == second


def test_export_requires_a_session(data_root, tmp_path):
    c = TestClient(create_app(_cfg(data_root, tmp_path)))   # no cookie
    assert c.post("/api/departments/cooking/exports/steps").status_code == 401


def test_unknown_kind_is_404(data_root, tmp_path, caplog):
    """Persian to the client, the English name of the offending kind to the log.

    `ExportModal` renders `detail` verbatim inside an otherwise Persian dialog,
    so no 404 on this handler may answer in English — the same split the 503
    branches already make.
    """
    c = _client(_cfg(data_root, tmp_path))
    with caplog.at_level("INFO"):
        r = c.post("/api/departments/cooking/exports/poster")
    assert r.status_code == 404
    assert r.json()["detail"] == "نوع خروجی نامعتبر است"
    assert not _ascii_letters(r.json()["detail"])
    assert any("unknown export kind" in m and "poster" in m for m in _guard_logs(caplog))


def test_department_without_an_overview_is_404(data_root, tmp_path, caplog):
    """A registered department with no `overview.json` is a *data* fault.

    This is the likeliest failure of the lot — only two departments have an
    `overview.json` today — so it is also the one a Persian-speaking user is
    most likely to read. The exception keeps its English message for the log.
    """
    c = _client(_cfg(data_root, tmp_path))
    with caplog.at_level("WARNING"):
        r = c.post("/api/departments/dining/exports/flowchart")
    assert r.status_code == 404
    assert r.json()["detail"] == (
        "اطلاعات معرفی این دپارتمان هنوز ثبت نشده است؛ ابتدا معرفی واحد را کامل کنید.")
    assert not _ascii_letters(r.json()["detail"])
    assert any("overview.json" in m and "dining" in m for m in _guard_logs(caplog))


def test_no_404_detail_on_this_handler_reaches_the_user_in_english(data_root, tmp_path):
    """One assertion covering all three 404 guards at once.

    A fourth guard added later in English would pass every test above and still
    put English in a Persian dialog; this one catches it.
    """
    c = _client(_cfg(data_root, tmp_path))
    for path in ("/api/departments/cooking/exports/poster",
                 "/api/departments/marketing/exports/flowchart",
                 "/api/departments/dining/exports/flowchart"):
        r = c.post(path)
        assert r.status_code == 404, path
        assert not _ascii_letters(r.json()["detail"]), path


def test_missing_export_dir_is_503(data_root, tmp_path, caplog):
    """EXPORT_DIR was never set: a deployment fault, so it is logged as well as 503."""
    c = _client(_cfg(data_root, tmp_path, exports=False))
    with caplog.at_level("WARNING"):
        r = c.post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert "EXPORT_DIR" in r.json()["detail"]
    assert any("EXPORT_DIR" in m for m in _guard_logs(caplog))


def test_unconfigured_template_dir_is_503(data_root, tmp_path, caplog):
    """UI_EXPORT_TEMPLATE_DIR was never set — the setting itself is missing."""
    c = _client(_cfg(data_root, tmp_path, template_dir=False))
    with caplog.at_level("WARNING"):
        r = c.post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert "UI_EXPORT_TEMPLATE_DIR" in r.json()["detail"]
    assert any("UI_EXPORT_TEMPLATE_DIR" in m for m in _guard_logs(caplog))


def test_template_file_absent_from_a_configured_dir_is_503(data_root, tmp_path, caplog):
    """The directory is configured and real, but `flowchart.html` was never built.

    Distinct from the unset-directory case above: here the request reaches the
    `is_file()` guard. The assertions name that guard's own answer — "not found",
    not the read fallback's "could not be read" — so deleting the guard and letting
    the read's OSError handler cover for it does not keep this test green.
    """
    cfg = _cfg(data_root, tmp_path, template_files=False)
    assert cfg.export_template_dir.is_dir()
    assert not (cfg.export_template_dir / "flowchart.html").exists()
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert r.json()["detail"] == "قالب خروجی یافت نشد: flowchart.html"
    assert any("the export template is missing" in m and "flowchart.html" in m
               for m in _guard_logs(caplog))


def test_unreadable_template_is_503(data_root, tmp_path, caplog, monkeypatch):
    """The file passes `is_file()` and then the read fails anyway.

    A permissions error, or a deletion racing the check, is still a deployment
    fault: it must not escape as an unlogged 500.
    """
    cfg = _cfg(data_root, tmp_path)
    target = cfg.export_template_dir / "flowchart.html"
    real_read_text = Path.read_text

    def boom(self, *a, **kw):
        if self == target:
            raise PermissionError(13, "Permission denied")
        return real_read_text(self, *a, **kw)

    monkeypatch.setattr(Path, "read_text", boom)
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert any("could not be read" in m and "flowchart.html" in m
               for m in _guard_logs(caplog))


def test_unknown_department_is_404(data_root, tmp_path, caplog):
    """The registry guard runs before any path is built from the URL's `code`."""
    c = _client(_cfg(data_root, tmp_path))
    with caplog.at_level("INFO"):
        r = c.post("/api/departments/marketing/exports/flowchart")
    assert r.status_code == 404
    assert r.json()["detail"] == "دپارتمان یافت نشد"
    assert not _ascii_letters(r.json()["detail"])
    assert any("unknown department" in m and "marketing" in m for m in _guard_logs(caplog))


def test_template_without_a_data_slot_is_503(data_root, tmp_path, caplog):
    """A template that exists but was built wrong is a deployment fault.

    It is not a 404 (the department's data is fine) and not an unhandled 500:
    retrying will never fix it, so it must answer 503 and leave a log line an
    operator can act on.
    """
    cfg = _cfg(data_root, tmp_path)
    (cfg.export_template_dir / "flowchart.html").write_text(
        "<!doctype html><title>no slot here</title>", encoding="utf-8")
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    # the operator-facing English goes to the log; the client gets Persian
    assert r.json()["detail"] == "قالب خروجی نامعتبر است"
    assert any("template" in m and "__INJA_EXPORT_DATA__" in m
               for m in _guard_logs(caplog))


def test_unwritable_export_dir_is_logged_and_leaks_no_path(data_root, tmp_path, caplog):
    """A disk-full or permissions fault on the write is operator-actionable.

    `str(OSError)` carries the offending absolute path, so it belongs in the log
    and never in the response body.
    """
    cfg = _cfg(data_root, tmp_path)
    c = _client(cfg)
    # the department folder the write needs is occupied by a file: the
    # `mkdir(parents=True, exist_ok=True)` inside the atomic write raises OSError
    (cfg.export_dir / "cooking").write_text("not a directory", encoding="utf-8")
    with caplog.at_level("WARNING"):
        r = c.post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 500
    detail = r.json()["detail"]
    assert detail == "نوشتن فایل خروجی انجام نشد"
    assert str(cfg.export_dir) not in detail and "cooking" not in detail
    assert any("could not be written" in m and str(cfg.export_dir) in m
               for m in _guard_logs(caplog))


def test_the_export_route_does_not_shadow_api_404s(data_root, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = _cfg(data_root, tmp_path)
    cfg = cfg.__class__(**{**cfg.__dict__, "static_dir": dist})
    c = TestClient(create_app(cfg))
    # the SPA shell answers deep links…
    assert "inja" in c.get("/departments").text
    # …but an unknown API path stays a JSON 404…
    assert c.get("/api/does-not-exist").status_code == 404
    assert "inja" not in c.get("/api/does-not-exist").text
    # …and an export path is answered by the gate, never by the shell. The
    # session is checked before the file is looked for, so this is 401 rather
    # than 404: whether a given token exists is not something to tell a stranger.
    nope = c.get("/exports/cooking/nope.html")
    assert nope.status_code == 401
    assert "inja" not in nope.text
    # …and past the gate it is still the route answering, not the catch-all: a
    # reader with a session who follows a replaced link is owed a plain 404, and
    # this is the only place that pins it *while the SPA is mounted*.
    c.cookies.set(COOKIE_NAME, issue_cookie(cfg, "analyst"))
    gone = c.get("/exports/cooking/nope.html")
    assert gone.status_code == 404
    assert "inja" not in gone.text


def test_a_real_export_is_served_while_the_spa_is_mounted(data_root, tmp_path):
    """The ordering test above proves it with a *missing* file; this one with a real one.

    A mount registered after the SPA catch-all would answer this with the shell
    and a 200, which a status-only assertion could not tell from success.
    """
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = _cfg(data_root, tmp_path)
    cfg = cfg.__class__(**{**cfg.__dict__, "static_dir": dist})
    c = _client(cfg)
    url = c.post("/api/departments/cooking/exports/flowchart").json()["url"]

    r = c.get(url)
    assert r.status_code == 200
    assert "inja-export-data" in r.text          # the export itself…
    assert "<title>inja</title>" not in r.text   # …not the SPA shell


def _with_spa(cfg, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__, "static_dir": dist})


def _app_logs(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "inja_ui_backend.app"]


def test_a_misconfigured_export_dir_costs_only_the_export_feature(data_root, tmp_path, caplog):
    """EXPORT_DIR points at a path that is really a regular file.

    `mkdir(parents=True, exist_ok=True)` raises on that, and unguarded it would
    take `create_app` — and with it the entire UI — down at startup. The export
    feature must turn itself off instead, and say so in the log.
    """
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("x", encoding="utf-8")
    cfg = _cfg(data_root, tmp_path)
    cfg = _with_spa(cfg.__class__(**{**cfg.__dict__, "export_dir": blocker}), tmp_path)

    with caplog.at_level("ERROR"):
        app = create_app(cfg)                       # must not raise
    c = TestClient(app)
    c.cookies.set(COOKIE_NAME, issue_cookie(cfg, "analyst"))

    # the rest of the UI is up
    assert c.get("/api/auth/me").status_code == 200
    assert "inja" in c.get("/departments").text
    # the export feature answers exactly as it does when EXPORT_DIR is unset
    r = c.post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert "EXPORT_DIR" in r.json()["detail"]
    # …and an old link is a 404, not the admin shell
    assert c.get("/exports/cooking/flowchart-abc.html").status_code == 404
    assert any("EXPORT_DIR" in m and str(blocker) in m for m in _app_logs(caplog))


def test_export_links_are_404_when_exports_are_off(data_root, tmp_path):
    """A bookmarked export link must not turn into the admin login page.

    With no EXPORT_DIR the `/exports` mount is skipped, so the path falls through
    to the SPA catch-all — which would answer the HTML shell with a 200 and leave
    a staff member staring at a login form instead of a plain "gone".
    """
    cfg = _with_spa(_cfg(data_root, tmp_path, exports=False), tmp_path)
    c = TestClient(create_app(cfg))
    # SPA deep links still work…
    assert "inja" in c.get("/departments").text
    # …but nothing under /exports pretends to
    for path in ("/exports/cooking/flowchart-abc.html", "/exports/", "/exports/cooking/"):
        r = c.get(path)
        assert r.status_code == 404, path
        assert "inja" not in r.text, path


def test_payload_in_the_written_file_has_no_pending(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]
    html = (cfg.export_dir / "cooking" / url.rsplit("/", 1)[1]).read_text(encoding="utf-8")
    body = html[html.index(">", html.index("inja-export-data")) + 1: html.rindex("</script>")]
    payload = json.loads(body)
    assert all(p["pending"] == [] for p in payload["processes"])


# --------------------------------------------------------------------------- #
# the PDF rendered beside the HTML (D18, D21)
# --------------------------------------------------------------------------- #

def _with_chromium(cfg, tmp_path):
    """A configured `CHROMIUM_PATH`. The binary is never really run — every test
    below replaces `render_pdf`, which is the only thing that would use it."""
    browser = tmp_path / "chromium-headless-shell"
    browser.write_text("#!/bin/sh\n", encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__, "chromium_path": browser})


def _pdf_path(cfg, code="cooking", kind="flowchart"):
    token = exports_mod.export_token(cfg.session_signing_key, code, kind)
    return exports_mod.export_pdf_path(cfg.export_dir, code, kind, token)


def _plant_a_previous_pdf(cfg, code="cooking", kind="flowchart"):
    """A PDF from an earlier, successful export of the same department+kind.

    The token is derived, not stored, so this is the *exact* path the next export
    will use — which is what makes a stale file possible at all.
    """
    path = _pdf_path(cfg, code, kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"%PDF-1.4 the document as it looked two edits ago")
    return path


def test_export_succeeds_with_no_chromium_configured(data_root, tmp_path, caplog):
    """No browser in the image is a supported deployment, not an error (D21).

    The HTML is the product; the PDF is an enhancement. The response is the same
    shape it has always been — one HTML link, no PDF field (D18).
    """
    cfg = _cfg(data_root, tmp_path)
    assert cfg.chromium_path is None
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 200
    assert set(r.json()) == {"url", "generated_at"}
    assert r.json()["url"].endswith(".html")
    assert not list((cfg.export_dir / "cooking").glob("*.pdf"))
    assert any("cooking" in m and "flowchart" in m and "CHROMIUM_PATH" in m
               for m in _guard_logs(caplog))


def test_export_succeeds_when_the_render_fails(data_root, tmp_path, caplog, monkeypatch):
    """A browser that dies, times out, or prints nothing must not cost the export."""
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)

    def boom(*a, **kw):
        raise pdf_mod.PdfRenderError("the page never set window.__INJA_PRINT_READY__")

    monkeypatch.setattr(pdf_mod, "render_pdf", boom)
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 200
    assert set(r.json()) == {"url", "generated_at"}
    assert (cfg.export_dir / "cooking" / Path(r.json()["url"]).name).is_file()
    assert not list((cfg.export_dir / "cooking").glob("*.pdf"))
    assert any("cooking" in m and "flowchart" in m and "READY" in m
               for m in _guard_logs(caplog))


def test_an_unexpected_error_from_the_renderer_still_publishes_the_export(
        data_root, tmp_path, caplog, monkeypatch):
    """D21 may not rest on a type discipline nothing enforces.

    `render_pdf` drives a subprocess, a socket and a JSON protocol; every layer of
    that can raise something nobody wrote down — a `RuntimeError` from the CDP
    plumbing, a `ValueError` from a malformed frame, a `binascii.Error` from a
    truncated base64 body. Catching only the two types the module *means* to raise
    turns any such surprise into a 500 on an export whose HTML was already written
    and is already being served. The guard is about the export surviving, not about
    which exception the browser layer happens to pick, so it catches all of them —
    and names the type in the log, so a surprise is still diagnosable.
    """
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    stale = _plant_a_previous_pdf(cfg)

    def boom(*a, **kw):
        raise RuntimeError("the CDP socket closed mid-frame")

    monkeypatch.setattr(pdf_mod, "render_pdf", boom)
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 200
    assert set(r.json()) == {"url", "generated_at"}
    assert (cfg.export_dir / "cooking" / Path(r.json()["url"]).name).is_file()
    # the same stale-PDF rule as every other failed render: no PDF at all beats a
    # PDF that disagrees with the document beside it
    assert not stale.exists()
    assert not list((cfg.export_dir / "cooking").glob("*.pdf"))
    assert any("cooking" in m and "flowchart" in m and "RuntimeError" in m
               for m in _guard_logs(caplog))


def test_a_failed_render_removes_the_previous_pdf(data_root, tmp_path, monkeypatch):
    """The sharpest edge in the whole change.

    The token is stable, so the PDF's path never changes between exports. A failed
    render therefore leaves the *previous* PDF sitting beside a *freshly written*
    HTML, and a reader who taps «چاپ / PDF» downloads a document that no longer
    matches the one on their screen — silently, and worse than having no PDF.
    """
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    stale = _plant_a_previous_pdf(cfg)
    before = stale.read_bytes()

    monkeypatch.setattr(pdf_mod, "render_pdf",
                        lambda *a, **kw: (_ for _ in ()).throw(
                            pdf_mod.PdfRenderError("the browser printed nothing")))
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")

    assert r.status_code == 200
    # not "a new one was not written" — the *old* one must be gone
    assert not stale.exists(), (
        f"a stale PDF survived a failed render: {stale.read_bytes()[:40]!r} "
        f"(planted {before[:40]!r}) now sits beside a freshly written HTML")


def test_an_unconfigured_chromium_removes_the_previous_pdf(data_root, tmp_path):
    """Same hazard by a different route: the browser was removed from the image.

    Every later export writes fresh HTML next to a PDF nothing will ever refresh.
    """
    cfg = _cfg(data_root, tmp_path)
    stale = _plant_a_previous_pdf(cfg)
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 200
    assert not stale.exists()


def test_a_pdf_that_cannot_be_unlinked_is_logged_as_an_error(data_root, tmp_path,
                                                             caplog, monkeypatch):
    """The one case the endpoint cannot fix, so it must not pass in silence.

    If the unlink itself fails — a read-only mount, a permissions change — the
    mismatched PDF stays publicly served and only a human can clear it. That is an
    ERROR, not the render's "never mind" warning, and the export still succeeds.
    """
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    stale = _plant_a_previous_pdf(cfg)
    real_unlink = Path.unlink

    def refuse(self, *a, **kw):
        if self.name == stale.name:
            raise PermissionError(13, "Permission denied")
        return real_unlink(self, *a, **kw)

    monkeypatch.setattr(pdf_mod, "render_pdf",
                        lambda *a, **kw: (_ for _ in ()).throw(
                            pdf_mod.PdfRenderError("the browser died")))
    monkeypatch.setattr(Path, "unlink", refuse)
    with caplog.at_level("WARNING"):
        r = _client(cfg).post("/api/departments/cooking/exports/flowchart")

    assert r.status_code == 200
    assert stale.exists()
    errors = [rec.getMessage() for rec in caplog.records
              if rec.name == "inja_ui_backend.routers.exports" and rec.levelname == "ERROR"]
    assert any(stale.name in m and "disagrees" in m for m in errors)


def test_a_successful_render_puts_the_pdf_beside_the_html(data_root, tmp_path, monkeypatch):
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    seen = {}

    def fake_render(chromium, html_path, out_path, **kw):
        seen["chromium"] = chromium
        seen["html"] = Path(html_path)
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"%PDF-1.4 rendered")

    monkeypatch.setattr(pdf_mod, "render_pdf", fake_render)
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")

    assert r.status_code == 200
    html = cfg.export_dir / r.json()["url"][len("/exports/"):]
    pdf = html.with_suffix(".pdf")
    assert pdf.is_file() and pdf.read_bytes() == b"%PDF-1.4 rendered"
    # printed from the document that was just written, not from some other file
    assert seen["html"] == html
    assert seen["chromium"] == cfg.chromium_path
    # …and the response says nothing about it (D18)
    assert set(r.json()) == {"url", "generated_at"}
    assert ".pdf" not in json.dumps(r.json())


def test_no_pdf_is_served_beside_the_new_html_while_the_render_is_still_running(
        data_root, tmp_path, monkeypatch):
    """The crash window, pinned — this is the ordering the whole fix is about.

    `render_pdf` is entered with the fresh HTML already published and the new PDF
    not yet written; the real thing spends ~5 s in there driving a browser. Both
    files are served from an unauthenticated mount the whole time, so whatever this
    fake observes is exactly what a reader would get — and, if the container
    restarts or the OOM killer fires here, what they would keep getting until
    someone re-exported the department by hand.

    So: at that instant the folder must hold the *new* document and no `.pdf` at
    all. Asserted from inside the render rather than after the response, because
    after the response the mismatch has already been cleaned up and the window this
    guards is invisible.
    """
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    stale = _plant_a_previous_pdf(cfg)
    stale_bytes = stale.read_bytes()
    mid_render = {}

    def fake_render(chromium, html_path, out_path, **kw):
        folder = Path(out_path).parent
        mid_render["pdfs"] = sorted(p.name for p in folder.glob("*.pdf"))
        mid_render["html"] = Path(html_path).read_text(encoding="utf-8")
        Path(out_path).write_bytes(b"%PDF-1.4 printed from this very document")

    monkeypatch.setattr(pdf_mod, "render_pdf", fake_render)
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")

    assert r.status_code == 200
    assert mid_render["pdfs"] == [], (
        f"a PDF was still publicly served beside the new HTML mid-render: "
        f"{mid_render['pdfs']} (planted {stale_bytes[:40]!r})")
    # …and the HTML it is printing from really is the new one, so the window being
    # asserted is the render's and not some moment before the document was written
    assert exports_mod.DATA_SLOT not in mid_render["html"]
    assert stale.read_bytes() == b"%PDF-1.4 printed from this very document"


def test_regenerating_prunes_the_previous_pdf(data_root, tmp_path, monkeypatch):
    """An orphan from a rotated signing key is as public as the HTML beside it."""
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    folder = cfg.export_dir / "cooking"
    folder.mkdir(parents=True, exist_ok=True)
    orphan_html = folder / "flowchart-deadbeefdeadbeef.html"
    orphan_pdf = folder / "flowchart-deadbeefdeadbeef.pdf"
    orphan_html.write_text("revoked", encoding="utf-8")
    orphan_pdf.write_bytes(b"%PDF-revoked")

    monkeypatch.setattr(pdf_mod, "render_pdf",
                        lambda c, h, o, **kw: Path(o).write_bytes(b"%PDF-fresh"))
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")

    assert r.status_code == 200
    assert not orphan_html.exists()
    assert not orphan_pdf.exists()
    assert len(list(folder.glob("flowchart-*.pdf"))) == 1


def test_the_render_does_not_run_on_the_event_loop(data_root, tmp_path, monkeypatch):
    """`render_pdf` blocks for seconds to tens of seconds.

    Run on the event loop it would freeze every other request in the process for
    the whole render — including the other bots' traffic. `asyncio.get_running_loop`
    is the exact discriminator: it succeeds only on a thread that *is* running the
    loop, and raises `RuntimeError` in a worker thread.
    """
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    where = {}

    def fake_render(chromium, html_path, out_path, **kw):
        try:
            asyncio.get_running_loop()
            where["on_the_loop"] = True
        except RuntimeError:
            where["on_the_loop"] = False
        Path(out_path).write_bytes(b"%PDF-1.4 rendered")

    monkeypatch.setattr(pdf_mod, "render_pdf", fake_render)
    r = _client(cfg).post("/api/departments/cooking/exports/flowchart")

    assert r.status_code == 200
    assert where["on_the_loop"] is False


# --------------------------------------------------------------------------- #
# the gate in front of the published files (D25–D30)
# --------------------------------------------------------------------------- #

EXPORT_PASSWORD = "throwaway-export-pw"
#: Hashed once for the module: argon2 is deliberately slow, and every test below
#: only needs the setting to be *present*. Never a real credential.
EXPORT_HASH = argon2.PasswordHasher().hash(EXPORT_PASSWORD)
#: Long enough that a 100-byte range is a genuine slice of it.
PDF_BYTES = b"%PDF-1.4 " + b"r" * 500


def _gated(cfg):
    """The deployed shape: an export credential is configured (D28)."""
    return cfg.__class__(**{**cfg.__dict__,
                            "export_username": "guest",
                            "export_password_hash": EXPORT_HASH})


def _publish(data_root, tmp_path, monkeypatch, *, credential=True):
    """Really export cooking/flowchart, PDF included; return the cfg and both URLs.

    The PDF sits at the HTML's path with one extension swapped, which is the whole
    reason the gate has to cover both: `.html` → `.pdf` is a single keystroke past
    a guard that only knows about documents.
    """
    cfg = _with_chromium(_cfg(data_root, tmp_path), tmp_path)
    if credential:
        cfg = _gated(cfg)
    monkeypatch.setattr(pdf_mod, "render_pdf",
                        lambda c, h, o, **kw: Path(o).write_bytes(PDF_BYTES))
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]
    assert url.endswith(".html")
    pdf_url = url[: -len("html")] + "pdf"
    assert (cfg.export_dir / pdf_url[len("/exports/"):]).is_file()
    return cfg, url, pdf_url


def _reader(cfg, cookie=None, value=None):
    c = TestClient(create_app(cfg))
    if cookie:
        c.cookies.set(cookie, value)
    return c


def test_an_export_without_a_session_is_401(data_root, tmp_path, monkeypatch):
    """D25 reverses D6: the link alone is no longer enough for either file."""
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    anon = _reader(cfg)
    for url in (html_url, pdf_url):
        r = anon.get(url)
        assert r.status_code == 401, url
        assert "inja-export-data" not in r.text, url
        assert PDF_BYTES[:20] not in r.content, url


def test_an_export_session_opens_both_files(data_root, tmp_path, monkeypatch):
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))

    doc = c.get(html_url)
    assert doc.status_code == 200
    assert "inja-export-data" in doc.text
    assert doc.headers["content-type"].startswith("text/html")

    pdf = c.get(pdf_url)
    assert pdf.status_code == 200
    assert pdf.content == PDF_BYTES
    # iOS opens the PDF from this header, not from the extension
    assert pdf.headers["content-type"] == "application/pdf"


def test_an_admin_session_opens_both_files(data_root, tmp_path, monkeypatch):
    """D29: an admin should not need the shared password to read what they made."""
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, COOKIE_NAME, issue_cookie(cfg, "analyst"))
    assert c.get(html_url).status_code == 200
    assert c.get(pdf_url).status_code == 200


def test_unset_export_credentials_close_the_gate(data_root, tmp_path, monkeypatch):
    """D30: a missing setting must not republish every department.

    Asserted with a *correctly signed* export cookie as well as with none at all,
    because the failure this guards against is the gate falling open — and a
    cookie this very server minted is the friendliest input it could get.
    """
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch, credential=False)
    assert cfg.export_username is None and cfg.export_password_hash is None
    for client in (_reader(cfg),
                   _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))):
        for url in (html_url, pdf_url):
            assert client.get(url).status_code == 401, url


def test_a_range_request_is_served_as_206(data_root, tmp_path, monkeypatch):
    """The iOS PDF viewer's path, and the one a hand-rolled handler silently drops.

    `StaticFiles` answered ranges; a `Response(body)` would answer 200 with the
    whole file and Safari would show a blank document on the exact device the
    server-rendered PDF exists for.
    """
    cfg, _, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))

    r = c.get(pdf_url, headers={"Range": "bytes=0-99"})
    assert r.status_code == 206
    assert len(r.content) == 100
    assert r.content == PDF_BYTES[:100]
    assert r.headers["content-range"] == f"bytes 0-99/{len(PDF_BYTES)}"


def test_a_range_request_still_needs_a_session(data_root, tmp_path, monkeypatch):
    """The range path must not become a way around the gate it runs behind."""
    cfg, _, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    r = _reader(cfg).get(pdf_url, headers={"Range": "bytes=0-99"})
    assert r.status_code == 401
    assert PDF_BYTES[:20] not in r.content


# --- conditional requests: the second visit does not re-download ------------- #

def test_a_served_export_carries_validators(data_root, tmp_path, monkeypatch):
    """Without an `ETag` and a `Last-Modified` a client has nothing to revalidate
    with, so every later request is a full download by construction."""
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    for url in (html_url, pdf_url):
        r = c.get(url)
        assert r.headers.get("etag"), url
        assert r.headers.get("last-modified"), url


def test_a_served_export_is_private_to_the_reader(data_root, tmp_path, monkeypatch):
    """The file is behind a session now, so no shared cache may hold a copy.

    Nothing in `deploy/` puts a caching proxy in front of this today, so this is
    prevention rather than a hole being closed — but a response with validators
    and no `Cache-Control` is one a shared cache is free to store and hand to the
    next person. `private` keeps the browser revalidation above and forbids that.
    """
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    for url in (html_url, pdf_url):
        assert c.get(url).headers["cache-control"] == "private", url


def test_an_unchanged_export_is_304_for_if_none_match(data_root, tmp_path, monkeypatch):
    """The regression the mount's removal introduced, pinned.

    Export URLs are stable across regenerations, so a reader who reopens a
    department asks for the same ~2 MB file again. `StaticFiles` answered 304;
    on a staff phone over a weak connection that difference is the feature.
    """
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    for url in (html_url, pdf_url):
        etag = c.get(url).headers["etag"]
        again = c.get(url, headers={"If-None-Match": etag})
        assert again.status_code == 304, url
        assert again.content == b"", url
        assert again.headers["etag"] == etag, url


def test_an_unchanged_export_is_304_for_if_modified_since(data_root, tmp_path,
                                                          monkeypatch):
    """The other validator, and the one an old client is likelier to send."""
    cfg, html_url, _ = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    last_modified = c.get(html_url).headers["last-modified"]

    again = c.get(html_url, headers={"If-Modified-Since": last_modified})
    assert again.status_code == 304
    assert again.content == b""


def test_a_changed_export_is_sent_again(data_root, tmp_path, monkeypatch):
    """A 304 keyed on a validator that no longer describes the file would serve a
    reader the previous department documentation out of their own cache."""
    cfg, html_url, _ = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    stale = c.get(html_url).headers["etag"]

    on_disk = cfg.export_dir / html_url[len("/exports/"):]
    on_disk.write_text("<!doctype html>the next export", encoding="utf-8")
    r = c.get(html_url, headers={"If-None-Match": stale})
    assert r.status_code == 200
    assert "the next export" in r.text


def test_a_range_request_survives_a_stale_validator(data_root, tmp_path, monkeypatch):
    """Revalidation must not cost the iOS viewer its byte ranges.

    A PDF viewer resuming a document sends both headers together; answering that
    with a 200 or an empty 304 is how a working viewer breaks.
    """
    cfg, _, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))

    r = c.get(pdf_url, headers={"Range": "bytes=0-99", "If-None-Match": '"not-the-etag"'})
    assert r.status_code == 206
    assert len(r.content) == 100
    assert r.content == PDF_BYTES[:100]


def test_a_conditional_request_still_needs_a_session(data_root, tmp_path, monkeypatch):
    """401 beats 304: the gate is not something a validator can talk past.

    A 304 to a stranger is a smaller leak than the file, but it is still an
    answer about a file they may not read — and the etag comes from the document.
    """
    cfg, html_url, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    known = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    anon = _reader(cfg)
    for url in (html_url, pdf_url):
        r = known.get(url)
        headers = {"If-None-Match": r.headers["etag"],
                   "If-Modified-Since": r.headers["last-modified"]}
        assert anon.get(url, headers=headers).status_code == 401, url


def test_head_still_answers_for_a_published_file(data_root, tmp_path, monkeypatch):
    """`StaticFiles` answered HEAD; a bare `@router.get` would 405 it.

    Clients probe a large download's size and type before fetching it, and a 405
    where a 200 used to be is a regression the gate has no reason to introduce.
    """
    cfg, _, pdf_url = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))

    r = c.head(pdf_url)
    assert r.status_code == 200
    assert r.headers["content-length"] == str(len(PDF_BYTES))
    assert r.content == b""
    # …and it is gated exactly like the GET beside it
    assert _reader(cfg).head(pdf_url).status_code == 401


def test_path_traversal_is_refused(data_root, tmp_path, monkeypatch):
    """`StaticFiles` owned this; the route owns it now.

    httpx normalises a literal `../` out of the URL before it is ever sent, so the
    traversal that actually reaches a server is percent-encoded — Starlette decodes
    it back into the path parameter, and the handler is what has to refuse it.
    """
    cfg, _, _ = _publish(data_root, tmp_path, monkeypatch)
    secret = tmp_path / "secret.txt"
    secret.write_text("not for readers", encoding="utf-8")
    assert secret.resolve().parent == cfg.export_dir.resolve().parent

    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    for url in ("/exports/%2e%2e/secret.txt",
                "/exports/cooking/%2e%2e/%2e%2e/secret.txt"):
        r = c.get(url)
        assert r.status_code == 404, url
        assert "not for readers" not in r.text, url


def test_a_null_byte_in_the_path_is_404(data_root, tmp_path, monkeypatch):
    """`Path.resolve()` raises `ValueError: embedded null byte`, not `OSError`.

    `StaticFiles` answered 404 for this; an unhandled `ValueError` in the one
    function whose job is to resolve untrusted input safely is a 500 and a
    traceback in the log. Both shapes are asserted — a lone NUL and one smuggled
    into an otherwise ordinary filename — because they take different routes
    through the join.
    """
    cfg, _, _ = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    for url in ("/exports/%00", "/exports/ok%00.txt", "/exports/cooking/%00.pdf"):
        assert c.get(url).status_code == 404, url


def test_the_route_refuses_when_the_export_dir_is_unset(data_root, tmp_path, monkeypatch):
    """The handler states its own precondition instead of inheriting it.

    `create_app` registers this router only when EXPORT_DIR is usable, so today
    the handler cannot run without it. That safety lives in another module, one
    unconditional `include_router` away from an `AttributeError` 500 on every
    export request — and the correct answer, "the feature is off, so nothing is
    published here", is the same 404 the SPA catch-all gives in that state.
    """
    cfg, html_url, _ = _publish(data_root, tmp_path, monkeypatch)
    app = create_app(cfg)
    app.state.cfg = cfg.__class__(**{**cfg.__dict__, "export_dir": None})
    c = TestClient(app)
    c.cookies.set(export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    assert c.get(html_url).status_code == 404


def test_a_missing_export_is_404_for_a_reader_with_a_session(data_root, tmp_path,
                                                             monkeypatch):
    """An expired link is "gone", not "broken" — and not the SPA shell either."""
    cfg, _, _ = _publish(data_root, tmp_path, monkeypatch)
    c = _reader(cfg, export_auth.EXPORT_COOKIE, export_auth.issue_cookie(cfg))
    assert c.get("/exports/cooking/flowchart-deadbeefdeadbeef.html").status_code == 404
    assert c.get("/exports/cooking/flowchart-deadbeefdeadbeef.pdf").status_code == 404
    # a directory is not a document
    assert c.get("/exports/cooking").status_code == 404
