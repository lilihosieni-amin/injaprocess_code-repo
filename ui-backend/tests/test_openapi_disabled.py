"""The interactive API docs and the OpenAPI schema are not served.

`FastAPI()` publishes `/docs`, `/redoc` and `/openapi.json` by default, and it
publishes them *unauthenticated* — the auth in this service is a cookie checked
inside each handler, not a global dependency, so nothing stands in front of those
three routes. On a host whose only published port is 443 that means every admin
route's path, method, request body and response shape is readable by anyone who
asks. This service has no third-party API consumers, so the schema buys nothing
and costs that.

Asserted as a real 404 rather than "the Swagger HTML is absent", because with the
SPA mounted the catch-all answers an unrouted path with the app shell and a 200 —
a body that contains no Swagger markers either. `test_exports_api.py` draws the
same distinction for `/exports`; both cases are covered below.
"""
import warnings

from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for

#: Every default FastAPI puts up for free.
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")

#: Markers that would only appear if the schema or one of its viewers were served.
SCHEMA_MARKERS = ("openapi", "swagger", "redoc", "/api/auth/login")


def _cfg(data_root, tmp_path, *, exports=True):
    cfg = cfg_for(data_root)
    fields = dict(cfg.__dict__)
    if exports:
        fields["export_dir"] = tmp_path / "exports"
    return cfg.__class__(**fields)


def _with_spa(cfg, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "index.html").write_text(
        '<!doctype html><title>inja</title><div id="root"></div>', encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__, "static_dir": dist})


def test_the_docs_and_the_schema_are_404_to_an_anonymous_caller(data_root, tmp_path):
    """No session, no static mount: the three paths are simply not routed."""
    c = TestClient(create_app(_cfg(data_root, tmp_path)))
    for path in DOC_PATHS:
        r = c.get(path)
        assert r.status_code == 404, path
        body = r.text.lower()
        for marker in SCHEMA_MARKERS:
            assert marker not in body, (path, marker)


def test_the_schema_is_still_gone_with_the_spa_mounted(data_root, tmp_path):
    """The shape production actually runs in.

    With `static_dir` set, an unrouted path is answered by the SPA catch-all with
    the app shell and a 200 — so the 404 above is not what a reader sees here, and
    a test that only checked the status would be checking the mount, not the fix.
    What must hold either way is that no route hands out the schema.
    """
    cfg = _with_spa(_cfg(data_root, tmp_path), tmp_path)
    c = TestClient(create_app(cfg))
    for path in DOC_PATHS:
        r = c.get(path)
        # whatever answers, it is the SPA shell and nothing describing the API
        assert '<div id="root"></div>' in r.text, path
        assert "/api/auth/login" not in r.text, path
        assert "swagger" not in r.text.lower(), path
        assert "paths" not in r.text.lower(), path


def test_asking_for_the_docs_raises_no_warning(data_root, tmp_path):
    """Generating the schema warns, and now nothing generates it.

    `serve_export` is registered with `api_route(methods=["GET", "HEAD"])`, which
    is one route carrying two methods; `get_openapi` emits an operation per method
    but derives the operation ID from the route, so the second one collides with
    the first.

    Measured against this file's parent commit, one fresh app per request:

        exports=True  /docs         200 []
        exports=True  /redoc        200 []
        exports=True  /openapi.json 200 ['Duplicate Operation ID
                                          serve_export_exports__file_path__head']
        exports=False /openapi.json 200 []

    So it is exactly one `UserWarning`, it names `…__head` (not `…__get`), it
    fires on the request that *builds* the schema rather than on `/docs` — which
    only returns the HTML that then fetches it — and it needs `EXPORT_DIR` set,
    because the export router is registered on that switch.

    Both configurations are asserted, so this cannot pass merely because the
    router carrying the duplicate was never mounted.
    """
    for exports in (True, False):
        cfg = _cfg(data_root, tmp_path, exports=exports)
        c = TestClient(create_app(cfg))
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            for path in DOC_PATHS:
                c.get(path)
        duplicates = [str(w.message) for w in caught
                      if "Duplicate Operation ID" in str(w.message)]
        assert duplicates == [], (exports, duplicates)


def test_the_api_itself_is_unchanged(data_root, tmp_path):
    """Turning the documentation off must not turn a route off.

    The 401 is the whole surface an anonymous caller should get; it is also proof
    that `/api/auth/me` is still routed rather than falling through to the same
    404 the docs now give.
    """
    c = TestClient(create_app(_cfg(data_root, tmp_path)))
    assert c.get("/api/auth/me").status_code == 401


def test_no_route_object_serves_the_schema(data_root, tmp_path):
    """Belt and braces, read off the app rather than over HTTP: FastAPI registers
    the three routes from `docs_url` / `redoc_url` / `openapi_url`, so the way to
    show they are off is that no route claims those paths."""
    app = create_app(_cfg(data_root, tmp_path))
    assert app.openapi_url is None
    assert app.docs_url is None
    assert app.redoc_url is None
    assert {getattr(r, "path", None) for r in app.routes} & set(DOC_PATHS) == set()
