"""Serving the published export files, behind the export session (D25).

This replaces the `StaticFiles` mount `/exports` used to be, and it inherits two
jobs that mount was quietly doing. Both are load-bearing:

* **Range requests.** `FileResponse` answers them; a plain `Response(body)` does
  not. iOS Safari's PDF viewer fetches by byte range, and that device is the whole
  reason the server-rendered PDF exists — dropping ranges would show a blank
  document to exactly the readers this feature was built for.
* **Path containment.** `StaticFiles` refused anything resolving outside its
  directory. Nothing else does that now, so this module does it explicitly.

The router is registered only when `EXPORT_DIR` is usable; with the feature off,
`/exports/...` falls through to the SPA catch-all, which is what turns an old
bookmark into a plain 404 rather than the admin login page (`NOT_SPA_ROUTES`).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ..export_auth import require_export_access

router = APIRouter(prefix="/exports")


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
    root = cfg.export_dir.resolve()
    # `resolve()` on both sides, so a `..` segment that survived URL decoding and
    # a symlink pointing out of the directory are refused by the same check.
    target = (root / file_path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        # Deliberately the same bare 404 the mount used to give: a reader who
        # followed a replaced link is owed "gone", and nothing more.
        raise HTTPException(status_code=404)
    return FileResponse(target)
