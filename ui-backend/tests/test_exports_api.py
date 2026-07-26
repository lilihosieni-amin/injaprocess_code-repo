import json

from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import COOKIE_NAME, issue_cookie
from inja_ui_backend.tests_helpers import cfg_for

TEMPLATE = '<!doctype html><script id="inja-export-data">__INJA_EXPORT_DATA__</script>'


def _cfg(data_root, tmp_path, *, templates=True, exports=True):
    cfg = cfg_for(data_root)
    tdir = tmp_path / "templates"
    if templates:
        tdir.mkdir(exist_ok=True)
        (tdir / "flowchart.html").write_text(TEMPLATE, encoding="utf-8")
        (tdir / "steps.html").write_text(TEMPLATE, encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__,
                           "export_dir": (tmp_path / "exports") if exports else None,
                           "export_template_dir": tdir if templates else None})


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
    written = cfg.export_dir / "cooking" / url.rsplit("/", 1)[1]
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
    c = _client(_cfg(data_root, tmp_path))
    r = c.post("/api/departments/dining/exports/flowchart")
    assert r.status_code == 404


def test_missing_export_dir_is_503(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path, exports=False))
    r = c.post("/api/departments/cooking/exports/flowchart")
    assert r.status_code == 503
    assert "EXPORT_DIR" in r.json()["detail"]


def test_missing_template_is_503(data_root, tmp_path):
    c = _client(_cfg(data_root, tmp_path, templates=False))
    assert c.post("/api/departments/cooking/exports/flowchart").status_code == 503


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
    assert caplog.records


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


def test_payload_in_the_written_file_has_no_pending(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    url = _client(cfg).post("/api/departments/cooking/exports/flowchart").json()["url"]
    html = (cfg.export_dir / "cooking" / url.rsplit("/", 1)[1]).read_text(encoding="utf-8")
    body = html[html.index(">", html.index("inja-export-data")) + 1: html.rindex("</script>")]
    payload = json.loads(body)
    assert all(p["pending"] == [] for p in payload["processes"])
