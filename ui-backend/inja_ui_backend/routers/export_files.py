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
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.staticfiles import NotModifiedResponse, StaticFiles

from ..export_auth import require_export_access

router = APIRouter(prefix="/exports")

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
def serve_export(file_path: str, request: Request,
                 _: None = Depends(require_export_access)):
    """Serve one published file — the document or the PDF beside it.

    The session is checked by the dependency, so it is checked *before* the path
    is looked at: the `.pdf` and the `.html` share a path but for the extension,
    and whether a given token exists is not something to tell a stranger.
    """
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
