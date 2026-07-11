from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import Settings, load_settings
from .routers import auth as auth_router
from .routers import departments as departments_router
from .routers import pending as pending_router
from .routers import processes as processes_router


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
        app.mount("/", StaticFiles(directory=str(cfg.static_dir), html=True), name="static")
    return app


app = create_app() if os.environ.get("DATA_ROOT") else None
