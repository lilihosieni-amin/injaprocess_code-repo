from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings, load_settings
from .routers import auth as auth_router
from .routers import departments as departments_router
from .routers import pending as pending_router
from .routers import processes as processes_router


class SPAStaticFiles(StaticFiles):
    """Serve the built single-page app, falling back to index.html for
    client-side routes.

    The SPA owns its own routing, so a browser refresh on a deep link (e.g.
    ``/processes``) asks the server for a path that is not a real file. Return
    ``index.html`` for those so the client router can render the page — but keep
    real API paths returning a 404 rather than the HTML shell.
    """

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # StaticFiles raises 404 for a missing path; serve the SPA shell for
            # client-side routes, but let real API 404s propagate as JSON.
            if exc.status_code == 404 and not path.startswith("api"):
                return await super().get_response("index.html", scope)
            raise


def create_app(cfg: Settings | None = None) -> FastAPI:
    if cfg is None:
        cfg = load_settings()
    app = FastAPI(title="inja-ui-backend")
    app.state.cfg = cfg
    app.include_router(auth_router.router)
    app.include_router(departments_router.router)
    app.include_router(pending_router.router)
    app.include_router(processes_router.router)
    if cfg.static_dir and cfg.static_dir.is_dir():
        app.mount("/", SPAStaticFiles(directory=str(cfg.static_dir), html=True), name="static")
    return app


app = create_app() if os.environ.get("DATA_ROOT") else None
