import json
from pathlib import Path

from fastapi.testclient import TestClient
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


def test_unknown_kind_is_404(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path))
    assert c.post("/api/departments/cooking/exports/poster").status_code == 404


def test_department_without_an_overview_is_404(data_root, tmp_path):
    """A registered department with no `overview.json` is a *data* fault.

    The detail is asserted, not just the status: three different guards on this
    handler answer 404 (unknown kind, unknown department, no overview) and only
    the detail says which one spoke.
    """
    c = _client(_cfg(data_root, tmp_path))
    r = c.post("/api/departments/dining/exports/flowchart")
    assert r.status_code == 404
    assert "overview" in r.json()["detail"]


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


def test_unknown_department_is_404(data_root, tmp_path):
    """The registry guard runs before any path is built from the URL's `code`."""
    c = _client(_cfg(data_root, tmp_path))
    r = c.post("/api/departments/marketing/exports/flowchart")
    assert r.status_code == 404
    assert r.json()["detail"] == "unknown department"


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


def test_written_export_is_served_without_a_session(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]

    anon = TestClient(create_app(cfg))          # deliberately no cookie — D6
    r = anon.get(url)
    assert r.status_code == 200
    assert "inja-export-data" in r.text


def test_exports_mount_does_not_shadow_api_404s(data_root, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = _cfg(data_root, tmp_path)
    cfg = cfg.__class__(**{**cfg.__dict__, "static_dir": dist})
    c = TestClient(create_app(cfg))
    # the SPA shell answers deep links…
    assert "inja" in c.get("/departments").text
    # …but an unknown API path stays a JSON 404, and an unknown export a plain 404
    assert c.get("/api/does-not-exist").status_code == 404
    assert "inja" not in c.get("/api/does-not-exist").text
    assert c.get("/exports/cooking/nope.html").status_code == 404


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


def test_payload_in_the_written_file_has_no_pending(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]
    html = (cfg.export_dir / "cooking" / url.rsplit("/", 1)[1]).read_text(encoding="utf-8")
    body = html[html.index(">", html.index("inja-export-data")) + 1: html.rindex("</script>")]
    payload = json.loads(body)
    assert all(p["pending"] == [] for p in payload["processes"])
