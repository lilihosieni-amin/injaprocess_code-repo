"""Serving the published export files, behind the export session (D25).

This replaces the `StaticFiles` mount `/exports` used to be, and it inherits three
jobs that mount was quietly doing. All are load-bearing:

* **Range requests.** `FileResponse` answers them; a plain `Response(body)` does
  not. iOS Safari's PDF viewer fetches by byte range, and that device is the whole
  reason the server-rendered PDF exists — dropping ranges would show a blank
  document to exactly the readers this feature was built for.
* **Conditional requests.** `FileResponse` sets `etag` and `last-modified` but
  never reads the request's `If-None-Match` / `If-Modified-Since`; `StaticFiles`
  did, and answered 304. An export URL is stable across regenerations, so without
  this a reader reopening a department re-downloads the whole ~2 MB document over
  whatever connection a staff phone has.
* **Path containment.** `StaticFiles` refused anything resolving outside its
  directory. Nothing else does that now, so this module does it explicitly.

The router is registered only when `EXPORT_DIR` is usable; with the feature off,
`/exports/...` falls through to the SPA catch-all, which is what turns an old
bookmark into a plain 404 rather than the admin login page (`NOT_SPA_ROUTES`).

The way *in* lives here too: a reader without a session is answered with the small
Persian page below and the two endpoints behind it, never with the SPA (D31). The
SPA is the admin application, and a kitchen staff member following an export link
is not an administrator arriving at the wrong door — they are the reader this page
exists for.
"""
from __future__ import annotations

import html
import posixpath
import re
from urllib.parse import parse_qsl, unquote

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool
from starlette.staticfiles import NotModifiedResponse, StaticFiles

from .. import export_auth
from ..export_auth import EXPORT_COOKIE, require_export_access

router = APIRouter(prefix="/exports")

#: The form and the logout live under `/api` rather than under `/exports`, where
#: the catch-all path parameter below would swallow them.
login_router = APIRouter(prefix="/api/exports")

#: D27, and half of why this credential can never reach the admin panel: with the
#: cookie scoped here the browser does not transmit it to `/api/...` at all. The
#: other half is the signing salt, which is `export_auth`'s.
COOKIE_PATH = "/exports"

#: Where a reader goes when the path they carried cannot be trusted. Under the
#: gate, so someone who has just signed in gets this router's own "nothing is
#: published here" 404 rather than being bounced somewhere else entirely.
_EXPORTS_ROOT = COOKIE_PATH + "/"

#: Borrowed, not reimplemented. `is_not_modified` is the exact comparison the
#: mount used to make — `If-None-Match` against the response's own `etag`, then
#: `If-Modified-Since` against its `last-modified` — and it reads no instance
#: state, so an empty `StaticFiles` is just somewhere to hang it. Reproducing it
#: here would mean re-deriving the etag format `FileResponse` picked, and the two
#: agreeing forever is the whole point.
_conditional = StaticFiles(check_dir=False)


# HEAD as well as GET: `StaticFiles` answered both, and clients probe a large
# download's size before fetching it. `FileResponse` sends the headers alone.
@router.api_route("/{file_path:path}", methods=["GET", "HEAD"])
def serve_export(file_path: str, request: Request):
    """Serve one published file — the document or the PDF beside it.

    The session is checked first, *before* the path is looked at: the `.pdf` and
    the `.html` share a path but for the extension, and whether a given token
    exists is not something to tell a stranger. A reader without one is shown the
    login page rather than refused, so the same first line covers both.
    """
    page = _sign_in_page(request)
    if page is not None:
        return page
    cfg = request.app.state.cfg
    if not cfg.export_dir:
        # `create_app` registers this router only when EXPORT_DIR is usable, so
        # this cannot happen today. Stated here anyway: the alternative is a
        # precondition held up entirely by one `if` in another module, and losing
        # it would turn every export request into an AttributeError 500 rather
        # than the "nothing is published here" the SPA catch-all would have given.
        raise HTTPException(status_code=404)
    root = cfg.export_dir.resolve()
    # `resolve()` on both sides, so a `..` segment that survived URL decoding and
    # a symlink pointing out of the directory are refused by the same check.
    #
    # Both calls are inside the guard because this is the one place untrusted
    # input becomes a filesystem path, and it fails in more ways than a missing
    # file: `resolve()` raises ValueError on an embedded NUL (which a URL can
    # carry as %00), and `stat()` raises OSError if the file is unlinked between
    # the check and the read. `StaticFiles` answered 404 to all of it; an escaping
    # exception here would be a 500 and a traceback for a malformed request.
    #
    # `stat_result` is taken here rather than left to `FileResponse` because
    # otherwise the validators do not exist until the body is streaming, and the
    # conditional check below needs them.
    try:
        target = (root / file_path).resolve()
        publishable = target.is_relative_to(root) and target.is_file()
        stat_result = target.stat() if publishable else None
    except (ValueError, OSError):
        publishable = False
    if not publishable:
        # Deliberately the same bare 404 the mount used to give: a reader who
        # followed a replaced link is owed "gone", and nothing more.
        raise HTTPException(status_code=404)

    # `private`: the file is behind a session now, so a shared cache must never
    # keep a copy to hand to the next person. It still lets the reader's own
    # browser hold one and revalidate it, which is the whole point of the etag.
    #
    # The rest is `StaticFiles.file_response` verbatim in shape, including
    # answering a conditional request that also carries a `Range` with the 304 —
    # a validator that still matches means the client's copy is whole, so there
    # is nothing to send it a slice of.
    response = FileResponse(target, stat_result=stat_result,
                            headers={"Cache-Control": "private"})
    if _conditional.is_not_modified(response.headers, request.headers):
        return NotModifiedResponse(response.headers)
    return response


# --------------------------------------------------------------------------- #
# the way in: the login page and the two endpoints behind it (D31)
# --------------------------------------------------------------------------- #

#: Anything that could break the carried path out of the `Location` header or out
#: of the HTML attribute it is echoed into.
_UNSAFE_NEXT = re.compile(r"[\x00-\x1f\x7f\\]")

#: Self-contained on purpose: every other file this feature publishes stands alone
#: (D3), and a login page pulling a CDN font would be the only network dependency
#: in the system. The palette is the SPA's, so the two doors look related.
_PAGE = """<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ورود به مستندات فرآیندها — اینجا فست‌فود</title>
<style>
body { margin: 0; min-height: 100vh; display: flex; align-items: center;
       justify-content: center; background: #2E1668; color: #2A1D5E;
       font-family: Vazirmatn, Tahoma, system-ui, sans-serif; }
form { box-sizing: border-box; width: min(360px, calc(100% - 32px)); padding: 28px;
       background: #FBF7F1; border-radius: 24px; }
h1 { margin: 0 0 22px; font-size: 18px; text-align: center; }
label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 700;
        color: #4A25A9; }
input { box-sizing: border-box; width: 100%; margin-bottom: 16px; padding: 12px 14px;
        border: 1.5px solid #E3D8F5; border-radius: 12px; background: #fff;
        font: inherit; font-size: 14px; color: #2A1D5E; }
input:focus { outline: none; border-color: #FA5A52; }
button { width: 100%; padding: 14px; border: 0; border-radius: 12px;
         background: #FA5A52; font: inherit; font-size: 15px; font-weight: 700;
         color: #fff; cursor: pointer; }
p.error { margin: 0 0 14px; font-size: 13px; color: #E23D35; }
</style>
</head>
<body>
<form method="post" action="/api/exports/login">
<h1>ورود به مستندات فرآیندها</h1>
<label for="username">نام کاربری</label>
<input id="username" name="username" autocomplete="username" autofocus>
<label for="password">گذرواژه</label>
<input id="password" name="password" type="password" autocomplete="current-password">
__INJA_ERROR__<input type="hidden" name="next" value="__INJA_NEXT__">
<button type="submit">ورود</button>
</form>
</body>
</html>
"""

#: The same answer for a wrong password and for a wrong username, so neither field
#: becomes an oracle for the other.
_ERROR = '<p class="error">نام کاربری یا گذرواژه نادرست است</p>\n'


def _safe_next(raw: str | None) -> str:
    """The path to send a reader to after login, or the export root if the value
    they carried cannot be trusted.

    Only a path *under* `/exports/` is accepted. An absolute URL, a scheme-relative
    `//host/...` and a look-alike `/exportsevil/...` all fail the prefix test.
    Without it the form is an open redirect: it is reachable unauthenticated, and
    the value is a stranger's choice of where a browser goes next.

    The prefix is then re-checked against where the browser will *really* go, which
    is not the text it was handed: `%2e` is `.` under RFC 3986, so a browser decodes
    it and removes the dot segments before it asks. `/exports/%2e%2e/api/auth/me`
    contains no literal `..` and passes any check that reads the string as-is —
    then lands on `/api/auth/me`. Same-origin, so not the open redirect above, but
    it walks straight out of the containment this function is the only guard for,
    so the decoded and normalised form has to clear the prefix as well.
    """
    if not raw or not raw.startswith(_EXPORTS_ROOT) or _UNSAFE_NEXT.search(raw):
        return _EXPORTS_ROOT
    landing = posixpath.normpath(unquote(raw))
    if not landing.startswith(_EXPORTS_ROOT) or _UNSAFE_NEXT.search(landing):
        return _EXPORTS_ROOT
    return raw


def _login_page(next_path: str, *, error: bool = False,
                status_code: int = 200) -> HTMLResponse:
    """The page itself, carrying the document the reader was heading for.

    `next_path` reaches the page from the request, so it is escaped: unescaped it
    would be reflected XSS on the one page in this system that collects a password.
    The error block is substituted first — it holds no markers of its own, and the
    escaped path must not be able to introduce any.

    `no-store` because a cache holding this 200 would hand the form to the next
    reader in place of the document they asked for.
    """
    page = _PAGE.replace("__INJA_ERROR__", _ERROR if error else "")
    page = page.replace("__INJA_NEXT__", html.escape(next_path, quote=True))
    return HTMLResponse(page, status_code=status_code,
                        headers={"Cache-Control": "no-store"})


def _sign_in_page(request: Request) -> HTMLResponse | None:
    """`None` when the reader may read; the login page when they must sign in.

    The 401 is re-raised untouched when no export credential is configured (D30):
    there is nothing to type, so a form would be a lie, and the answer stays what
    it was before this page existed.

    The check is delegated to `require_export_access` rather than reimplemented, so
    the export session, the admin session (D29) and the closed gate keep being one
    decision made in one place — it is only *this* caller that has two answers to
    give, which is why it is no longer a `Depends`.
    """
    cfg = request.app.state.cfg
    try:
        require_export_access(request)
        return None
    except HTTPException:
        if not export_auth.configured(cfg):
            raise
    return _login_page(_safe_next(request.url.path))


def _form_fields(body: bytes) -> dict[str, str]:
    """The submitted fields out of an `application/x-www-form-urlencoded` body.

    Read by hand rather than through `request.form()`, which routes every form
    through `python-multipart` — not a dependency of this service, and not one
    worth adding for three fields. `parse_qsl` is what the urlencoded parser would
    have used anyway. Undecodable bytes become replacement characters instead of an
    exception: anyone can post anything here, and the answer to nonsense is "wrong
    credential", not a traceback.
    """
    return dict(parse_qsl(body.decode("utf-8", "replace"), keep_blank_values=True))


@login_router.post("/login")
async def login(request: Request):
    """Check the one shared credential and, if it holds, put the session in the
    browser and send the reader on to the document they came for."""
    cfg = request.app.state.cfg
    if not export_auth.configured(cfg):
        raise HTTPException(status_code=401, detail="authentication required")
    fields = _form_fields(await request.body())
    target = _safe_next(fields.get("next"))
    # Off the event loop: argon2 is deliberately ~50-100 ms of CPU, and this
    # handler is `async` (it awaits the body), so verifying inline would freeze
    # every other request in the process for that long — the other bots, the admin
    # panel, a reader mid-download. On an unauthenticated endpoint that is a denial
    # of service, not just a slow login. `routers/auth.py` is a plain `def`, which
    # FastAPI already runs in a threadpool for exactly this reason; this is the
    # same property, arranged by hand because the handler cannot be sync.
    if not await run_in_threadpool(export_auth.authenticate, cfg,
                                   fields.get("username", ""),
                                   fields.get("password", "")):
        # No cookie, and the reader keeps their place: the form still points at
        # the document, so a mistyped password costs one retry and not the link.
        return _login_page(target, error=True, status_code=401)
    # 303, so the browser turns this POST into a GET of the document.
    response = RedirectResponse(target, status_code=303)
    response.set_cookie(EXPORT_COOKIE, export_auth.issue_cookie(cfg),
                        path=COOKIE_PATH, httponly=True, samesite="lax",
                        max_age=cfg.session_ttl)
    return response


@login_router.post("/logout")
def logout(response: Response):
    """Drop the export session — scoped exactly as it was set, or the browser
    keeps the only cookie that matters."""
    response.delete_cookie(EXPORT_COOKIE, path=COOKIE_PATH)
    return {"ok": True}
