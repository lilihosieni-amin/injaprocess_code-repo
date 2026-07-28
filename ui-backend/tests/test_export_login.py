"""The Persian login page in front of the published exports (D27, D30, D31).

A separate file from `test_exports_api.py` — that one is already ~940 lines and
is about *serving* the files; this one is about the page a reader without a
session is shown instead, and the two endpoints behind it.

The Persian strings are written out here rather than imported from the router on
purpose: a test that asserts `router.TITLE in page` passes whatever the copy is
turned into, which is exactly the mistake to avoid on a page no reviewer of this
repo can proof-read from the code alone.
"""
import asyncio
import logging
import threading
import time

import anyio
import argon2
import httpx
from fastapi.testclient import TestClient
from inja_ui_backend import export_auth
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import COOKIE_NAME, issue_cookie
from inja_ui_backend.tests_helpers import cfg_for

EXPORT_PASSWORD = "throwaway-export-pw"
#: Hashed once for the module: argon2 is deliberately slow. Never a real credential.
EXPORT_HASH = argon2.PasswordHasher().hash(EXPORT_PASSWORD)

DOCUMENT = '<!doctype html><script id="inja-export-data">{}</script>'
PDF_BYTES = b"%PDF-1.4 " + b"r" * 500

# The copy, byte for byte.
TITLE = "ورود به مستندات فرآیندها"
#: The browser tab, shaped like the SPA's own `index.html` title. The brand carries
#: a ZWNJ (U+200C) inside «فست‌فود», which is where this page needs one.
DOCUMENT_TITLE = TITLE + " — اینجا فست‌فود"
USERNAME_LABEL = "نام کاربری"
PASSWORD_LABEL = "گذرواژه"
SUBMIT = "ورود"
WRONG_CREDENTIAL = "نام کاربری یا گذرواژه نادرست است"


def _cfg(data_root, tmp_path, *, credential=True):
    cfg = cfg_for(data_root)
    fields = {**cfg.__dict__, "export_dir": tmp_path / "exports"}
    if credential:
        fields.update(export_username="guest", export_password_hash=EXPORT_HASH)
    return cfg.__class__(**fields)


def _publish(cfg):
    """A document and the PDF beside it, at the shape of path the exporter writes."""
    folder = cfg.export_dir / "cooking"
    folder.mkdir(parents=True, exist_ok=True)
    html = folder / "flowchart-abc123def456.html"
    html.write_text(DOCUMENT, encoding="utf-8")
    html.with_suffix(".pdf").write_bytes(PDF_BYTES)
    return f"/exports/cooking/{html.name}", f"/exports/cooking/{html.stem}.pdf"


def _with_spa(cfg, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "index.html").write_text(
        '<!doctype html><title>inja</title><div id="root"></div>', encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__, "static_dir": dist})


def _reader(cfg):
    return TestClient(create_app(cfg))


# --- the page a reader without a session is shown ---------------------------- #

def test_an_unauthenticated_export_answers_the_login_page(data_root, tmp_path):
    """D31: a staff member following a link is owed a form, not a bare JSON 401.

    Both files, because the PDF is one keystroke from the HTML and a gate that
    only knows about documents is not a gate.
    """
    cfg = _cfg(data_root, tmp_path)
    html_url, pdf_url = _publish(cfg)
    anon = _reader(cfg)
    for url in (html_url, pdf_url):
        r = anon.get(url)
        assert r.status_code == 200, url
        assert r.headers["content-type"].startswith("text/html"), url
        assert TITLE in r.text, url
        assert USERNAME_LABEL in r.text and PASSWORD_LABEL in r.text, url
        assert f"<button type=\"submit\">{SUBMIT}</button>" in r.text, url
        assert f"<title>{DOCUMENT_TITLE}</title>" in r.text, url
        assert "‌" in r.text, url          # the ZWNJ survives the round trip
        assert '<html lang="fa" dir="rtl">' in r.text, url
        # …and none of the document it is standing in front of
        assert "inja-export-data" not in r.text, url
        assert PDF_BYTES[:20] not in r.content, url


def test_the_login_page_is_not_the_spa(data_root, tmp_path):
    """D31 again, with the admin application actually mounted.

    The SPA is the admin panel; a kitchen staff member must never be handed it.
    """
    cfg = _with_spa(_cfg(data_root, tmp_path), tmp_path)
    html_url, _ = _publish(cfg)
    r = _reader(cfg).get(html_url)
    assert r.status_code == 200
    assert TITLE in r.text
    assert "<title>inja</title>" not in r.text
    assert 'id="root"' not in r.text


def test_the_login_page_is_self_contained(data_root, tmp_path):
    """No CDN font, no external stylesheet, no script — the rest of this feature
    is strict about standalone output and the login page is not the exception."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    page = _reader(cfg).get(html_url).text
    for forbidden in ("http://", "https://", "<script", "<link", "<img"):
        assert forbidden not in page, forbidden


def test_the_login_page_is_never_stored(data_root, tmp_path):
    """A cache holding this 200 would serve the form in place of the document to
    the very next reader, who by then has a session."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    assert _reader(cfg).get(html_url).headers["cache-control"] == "no-store"


def test_the_login_page_cannot_be_framed(data_root, tmp_path):
    """The one page in the system that collects a password is the one page that
    must not load inside someone else's.

    Framed, it is a clickjacking target: an invisible copy over a page the reader
    already trusts collects the shared credential with the real form's own pixels.
    Asserted on the error re-render too, because that is a login page as much as
    the first one is.

    Both spellings: `X-Frame-Options` is what every current browser honours, and
    `frame-ancestors` is the standards-track one that replaces it.
    """
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    first = c.get(html_url)
    assert first.headers["x-frame-options"] == "DENY"
    assert first.headers["content-security-policy"] == "frame-ancestors 'none'"
    refused = c.post("/api/exports/login",
                     data={"username": "guest", "password": "wrong", "next": html_url},
                     follow_redirects=False)
    assert refused.status_code == 401
    assert refused.headers["x-frame-options"] == "DENY"
    assert refused.headers["content-security-policy"] == "frame-ancestors 'none'"


def test_unset_credentials_answer_401_and_never_the_page(data_root, tmp_path):
    """D30: with no credential configured there is nothing to type, so a login
    page would be a lie. The gate stays shut and says so."""
    cfg = _cfg(data_root, tmp_path, credential=False)
    assert cfg.export_username is None and cfg.export_password_hash is None
    html_url, pdf_url = _publish(cfg)
    anon = _reader(cfg)
    for url in (html_url, pdf_url):
        r = anon.get(url)
        assert r.status_code == 401, url
        assert TITLE not in r.text, url
    posted = anon.post("/api/exports/login",
                       data={"username": "guest", "password": EXPORT_PASSWORD,
                             "next": html_url})
    assert posted.status_code == 401
    assert "set-cookie" not in posted.headers


def test_an_admin_session_never_sees_the_login_page(data_root, tmp_path):
    """D29: an admin already sees everything, credential or no credential."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    c.cookies.set(COOKIE_NAME, issue_cookie(cfg, "analyst"))
    r = c.get(html_url)
    assert r.status_code == 200
    assert "inja-export-data" in r.text
    assert TITLE not in r.text


# --- the requested path travels through the form ----------------------------- #

def test_the_form_carries_the_requested_path(data_root, tmp_path):
    """Login must land the reader on the document they tapped, not a generic page."""
    cfg = _cfg(data_root, tmp_path)
    html_url, pdf_url = _publish(cfg)
    anon = _reader(cfg)
    for url in (html_url, pdf_url):
        assert f'name="next" value="{url}"' in anon.get(url).text, url


def test_the_requested_path_is_escaped(data_root, tmp_path):
    """Everything from the request that reaches the page is attacker-supplied.

    Unescaped, the carried path is a reflected-XSS hole on a page whose whole job
    is to collect a password.
    """
    cfg = _cfg(data_root, tmp_path)
    _publish(cfg)
    r = _reader(cfg).get('/exports/cooking/x"><script>alert(1)</script>.html')
    assert r.status_code == 200
    assert "<script>alert(1)</script>" not in r.text
    assert '"><script' not in r.text
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in r.text
    assert "&quot;" in r.text


# --- POST /api/exports/login -------------------------------------------------- #

def test_the_right_credential_opens_the_document_it_was_asked_for(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    r = c.post("/api/exports/login",
               data={"username": "guest", "password": EXPORT_PASSWORD, "next": html_url},
               follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == html_url
    # the cookie the browser now holds really does open the document
    served = c.get(html_url)
    assert served.status_code == 200
    assert "inja-export-data" in served.text


def test_the_cookie_is_scoped_to_the_export_path(data_root, tmp_path):
    """D27, and half of why this credential can never reach the admin panel: the
    browser does not transmit the cookie to `/api/...` at all."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    r = c.post("/api/exports/login",
               data={"username": "guest", "password": EXPORT_PASSWORD, "next": html_url},
               follow_redirects=False)
    raw = r.headers["set-cookie"].lower()
    assert raw.startswith(export_auth.EXPORT_COOKIE.lower() + "=")
    assert "path=/exports" in raw
    assert "httponly" in raw
    assert "samesite=lax" in raw
    assert f"max-age={cfg.session_ttl}" in raw
    assert COOKIE_NAME not in r.headers["set-cookie"]
    # …and the property that scoping exists for, exercised through a real cookie jar
    assert c.get(html_url).status_code == 200
    assert c.get("/api/auth/me").status_code == 401


def test_the_pdf_is_reached_the_same_way(data_root, tmp_path):
    """One path, two extensions: the login round trip must land on either."""
    cfg = _cfg(data_root, tmp_path)
    _, pdf_url = _publish(cfg)
    c = _reader(cfg)
    r = c.post("/api/exports/login",
               data={"username": "guest", "password": EXPORT_PASSWORD, "next": pdf_url},
               follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == pdf_url
    served = c.get(pdf_url)
    assert served.status_code == 200
    assert served.content == PDF_BYTES


def test_a_wrong_password_re_renders_with_a_persian_error_and_no_cookie(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    r = c.post("/api/exports/login",
               data={"username": "guest", "password": "not-the-password", "next": html_url},
               follow_redirects=False)
    assert r.status_code == 401
    assert WRONG_CREDENTIAL in r.text
    assert "set-cookie" not in r.headers
    # the reader keeps their place: the form still points at the document
    assert f'name="next" value="{html_url}"' in r.text
    # and nothing was let through
    assert c.get(html_url).status_code == 200
    assert "inja-export-data" not in c.get(html_url).text


def test_a_wrong_username_is_refused_the_same_way(data_root, tmp_path):
    """A wrong username is refused with the same page, status and empty headers as
    a wrong password: the *body* names neither field.

    Only that. `export_auth.authenticate` returns on a username mismatch before it
    reaches argon2, so the two cases differ in response *time* — a separate
    question, in Task 1's module, which this test does not speak to.
    """
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    r = _reader(cfg).post(
        "/api/exports/login",
        data={"username": "analyst", "password": EXPORT_PASSWORD, "next": html_url},
        follow_redirects=False)
    assert r.status_code == 401
    assert WRONG_CREDENTIAL in r.text
    assert "set-cookie" not in r.headers


def test_a_hostile_next_is_not_followed(data_root, tmp_path):
    """Without this the form is an open redirect wearing a login page.

    Every one of these is answered with the export root instead — refused, not
    followed — and none of them ever appears in a `Location`.
    """
    cfg = _cfg(data_root, tmp_path)
    _publish(cfg)
    c = _reader(cfg)
    for hostile in ("https://evil.example/x",
                    "//evil.example/x",
                    "http:/evil.example",
                    "/api/auth/me",
                    "/exportsevil/x.html",
                    "/exports/../../etc/passwd",
                    # percent-encoded dot segments: the browser decodes `%2e` back
                    # to `.` and removes the segments before it asks, so a check
                    # that only looks at the literal text is one decode behind it.
                    # (On the wire these arrive as `%252e`, one encoding up.)
                    "/exports/%2e%2e/api/auth/me",
                    "/exports/%2E%2E/%2e%2e/etc/passwd",
                    "/exports/x.html\r\nSet-Cookie: a=b"):
        r = c.post("/api/exports/login",
                   data={"username": "guest", "password": EXPORT_PASSWORD, "next": hostile},
                   follow_redirects=False)
        assert r.status_code == 303, hostile
        assert r.headers["location"] == "/exports/", hostile
        assert "evil.example" not in r.headers["location"], hostile
    # …and where they are sent instead is a plain "nothing is published here",
    # which is the whole reason that default is under the gate rather than at `/`
    assert c.get("/exports/").status_code == 404


def test_the_password_check_does_not_run_on_the_event_loop(data_root, tmp_path,
                                                           monkeypatch):
    """argon2 is deliberately slow — ~50-100 ms of CPU, by design.

    Run on the event loop that is not one slow request, it is every other request
    in the process frozen for the duration: the other bots' traffic, the admin
    panel, a reader mid-download. And this endpoint is unauthenticated, so a
    handful of concurrent POSTs would be a denial of service written in one line.

    `asyncio.get_running_loop` is the exact discriminator the PDF render already
    uses for the same reason (`test_the_render_does_not_run_on_the_event_loop`):
    it succeeds only on the thread running the loop and raises in a worker.
    """
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    real_authenticate = export_auth.authenticate
    where = {}

    def watched(*args, **kwargs):
        try:
            asyncio.get_running_loop()
            where["on_the_loop"] = True
        except RuntimeError:
            where["on_the_loop"] = False
        return real_authenticate(*args, **kwargs)

    monkeypatch.setattr(export_auth, "authenticate", watched)
    r = _reader(cfg).post(
        "/api/exports/login",
        data={"username": "guest", "password": EXPORT_PASSWORD, "next": html_url},
        follow_redirects=False)

    assert r.status_code == 303          # the check really ran, and passed
    assert where["on_the_loop"] is False


def test_concurrent_password_checks_are_capped(data_root, tmp_path, monkeypatch):
    """The cost of this endpoint has a ceiling, and the ceiling is small.

    One argon2 verify is 64 MiB of scratch memory and ~60 ms of CPU (measured on
    this machine: `time_cost=3, memory_cost=65536 KiB, parallelism=4`, 61 ms). It
    is unauthenticated and it is the URL handed to the widest audience in the
    system, on a 3.7 GB host shared with the two bots and with no rate limiting in
    front of it.

    Off the event loop is not enough on its own: AnyIO's default thread limiter
    allows 40, which would be ~2.5 GB of argon2 scratch — and it is the *same*
    limiter Starlette gives every sync route handler, file serving included, so
    saturating it stalls the downloads this gate exists to protect. Hence a
    limiter of this endpoint's own.

    Driven through `httpx.ASGITransport` rather than `TestClient`, which is
    synchronous and cannot have two requests in flight at once.
    """
    cfg = _cfg(data_root, tmp_path)
    _publish(cfg)
    app = create_app(cfg)
    real_authenticate = export_auth.authenticate
    seen = {"now": 0, "peak": 0}
    counter = threading.Lock()

    def watched(*args, **kwargs):
        with counter:
            seen["now"] += 1
            seen["peak"] = max(seen["peak"], seen["now"])
        try:
            time.sleep(0.05)     # long enough that a burst really overlaps
            return real_authenticate(*args, **kwargs)
        finally:
            with counter:
                seen["now"] -= 1

    monkeypatch.setattr(export_auth, "authenticate", watched)

    async def burst():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://export.test") as c:
            await asyncio.gather(*[
                c.post("/api/exports/login",
                       data={"username": "guest", "password": "wrong"})
                for _ in range(6)])

    anyio.run(burst)
    assert seen["peak"] >= 1, "the checks never ran, so nothing was measured"
    assert seen["peak"] <= 2, seen["peak"]


def test_a_failed_login_is_logged_as_a_warning(data_root, tmp_path, caplog):
    """One shared, human-memorable password, no lockout, and a link handed to a
    whole kitchen: guessing is the attack, and an operator who is never told about
    a single failure cannot notice it happening.

    The attempted username is in the line on purpose — it is not a secret, it is
    handed out with the link, and it is what separates a mistyped password from
    someone walking the namespace. The attempted *password* is never in the line,
    and neither field may forge a second one: both are attacker-supplied, so the
    username is repr'd and truncated.
    """
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    with caplog.at_level(logging.INFO):
        r = _reader(cfg).post(
            "/api/exports/login",
            data={"username": "guest\nfake log line", "password": "not-the-password",
                  "next": html_url},
            follow_redirects=False)
    assert r.status_code == 401
    warnings = [rec for rec in caplog.records if rec.levelno == logging.WARNING]
    assert len(warnings) == 1, [rec.getMessage() for rec in warnings]
    line = warnings[0].getMessage()
    assert "export login failed" in line
    assert "guest" in line
    assert "not-the-password" not in line
    assert "\n" not in line


def test_a_successful_login_is_not_logged_as_a_warning(data_root, tmp_path, caplog):
    """Or the signal the test above pins is buried in the normal case."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    with caplog.at_level(logging.INFO):
        r = _reader(cfg).post(
            "/api/exports/login",
            data={"username": "guest", "password": EXPORT_PASSWORD, "next": html_url},
            follow_redirects=False)
    assert r.status_code == 303
    assert [rec.getMessage() for rec in caplog.records
            if rec.levelno >= logging.WARNING] == []


def test_an_oversized_body_is_refused(data_root, tmp_path):
    """Unauthenticated and reads a body, so the body needs a ceiling.

    The three fields of this form are a few hundred bytes; anything approaching a
    megabyte is someone spending the service's memory, not someone signing in.
    Caddy caps the request at 1 MB in front of this in production, but Caddy is
    not in the loop for the local stack, so the handler holds its own line.
    """
    cfg = _cfg(data_root, tmp_path)
    _publish(cfg)
    r = _reader(cfg).post(
        "/api/exports/login",
        content=b"username=guest&password=" + b"a" * 200_000,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 413
    assert "set-cookie" not in r.headers


def test_a_body_at_the_normal_size_still_signs_in(data_root, tmp_path):
    """The ceiling must sit far above any real form. A `next` at the longest shape
    the exporter produces, and the credential, still get through."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    r = c.post("/api/exports/login",
               data={"username": "guest", "password": EXPORT_PASSWORD, "next": html_url},
               follow_redirects=False)
    assert r.status_code == 303
    assert len(f"username=guest&password={EXPORT_PASSWORD}&next={html_url}") < 512


def test_a_missing_next_still_logs_the_reader_in(data_root, tmp_path):
    """A form posted without the field is a bug, not a reason to refuse a password."""
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    r = c.post("/api/exports/login",
               data={"username": "guest", "password": EXPORT_PASSWORD},
               follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/exports/"
    assert c.get(html_url).status_code == 200


def test_a_malformed_body_is_refused_without_a_traceback(data_root, tmp_path):
    """Anyone can post anything at this endpoint; nothing there may be a 500."""
    cfg = _cfg(data_root, tmp_path)
    _publish(cfg)
    r = _reader(cfg).post("/api/exports/login", content=b"\xff\xfe not a form",
                          headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 401
    assert "set-cookie" not in r.headers


# --- POST /api/exports/logout -------------------------------------------------- #

def test_logout_clears_the_session(data_root, tmp_path):
    cfg = _cfg(data_root, tmp_path)
    html_url, _ = _publish(cfg)
    c = _reader(cfg)
    c.post("/api/exports/login",
           data={"username": "guest", "password": EXPORT_PASSWORD, "next": html_url},
           follow_redirects=False)
    assert "inja-export-data" in c.get(html_url).text

    out = c.post("/api/exports/logout")
    assert out.status_code == 200
    # cleared at the path it was set on, or the browser keeps the one that counts
    assert "path=/exports" in out.headers["set-cookie"].lower()
    after = c.get(html_url)
    assert "inja-export-data" not in after.text
    assert TITLE in after.text
