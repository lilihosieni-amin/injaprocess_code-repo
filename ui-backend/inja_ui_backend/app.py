from __future__ import annotations

import dataclasses
import logging
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings, load_settings
from .routers import auth as auth_router
from .routers import departments as departments_router
from .routers import exports as exports_router
from .routers import pending as pending_router
from .routers import processes as processes_router

logger = logging.getLogger(__name__)

#: Path prefixes the SPA shell must never answer for. `api` is the backend's own
#: surface; `exports` is served by a separate mount that is skipped when the
#: feature is off — and a staff member following an old export link is owed a
#: plain 404, not the admin login page.
NOT_SPA_ROUTES = ("api", "exports")


class SPAStaticFiles(StaticFiles):
    """Serve the built single-page app, falling back to index.html for
    client-side routes.

    The SPA owns its own routing, so a browser refresh on a deep link (e.g.
    ``/processes``) asks the server for a path that is not a real file. Return
    ``index.html`` for those so the client router can render the page — but keep
    real API and export paths returning a 404 rather than the HTML shell.
    """

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # StaticFiles raises 404 for a missing path; serve the SPA shell for
            # client-side routes, but let real API and export 404s propagate.
            if exc.status_code == 404 and not path.startswith(NOT_SPA_ROUTES):
                return await super().get_response("index.html", scope)
            raise


def _mount_exports(app: FastAPI, cfg: Settings) -> Settings:
    """Prepare EXPORT_DIR and mount it, or turn the export feature off.

    Mounted ahead of the SPA catch-all: a mount at "/" swallows everything
    registered after it, and its 404 fallback would answer /exports/... with
    index.html. Deliberately unauthenticated — the token in the filename is the
    only guard (D6).

    A misconfigured EXPORT_DIR (an unwritable parent, or a path that is really a
    regular file) must cost the deployment the export feature and nothing else.
    Letting `mkdir` escape would abort `create_app` and take the whole UI down
    over one optional setting. Returning the settings with `export_dir` cleared
    puts the service in exactly the state an unset EXPORT_DIR produces: the
    handler's own 503 answers every export request, in Persian, with a log line.
    """
    if not cfg.export_dir:
        return cfg
    try:
        cfg.export_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.error("EXPORT_DIR is unusable, so exports are disabled: %s: %s",
                     cfg.export_dir, e)
        return dataclasses.replace(cfg, export_dir=None)
    app.mount("/exports", StaticFiles(directory=str(cfg.export_dir)), name="exports")
    return cfg


def create_app(cfg: Settings | None = None) -> FastAPI:
    if cfg is None:
        cfg = load_settings()
    app = FastAPI(title="inja-ui-backend")
    # before `app.state.cfg`: the handlers must see the settings the mount
    # actually succeeded with, not the ones the environment asked for
    cfg = _mount_exports(app, cfg)
    app.state.cfg = cfg
    app.include_router(auth_router.router)
    app.include_router(departments_router.router)
    app.include_router(exports_router.router)
    app.include_router(pending_router.router)
    app.include_router(processes_router.router)
    if cfg.static_dir and cfg.static_dir.is_dir():
        app.mount("/", SPAStaticFiles(directory=str(cfg.static_dir), html=True), name="static")
    return app


app = create_app() if os.environ.get("DATA_ROOT") else None
