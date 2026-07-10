from __future__ import annotations

from fastapi import FastAPI

from .config import Settings, load_settings
from .routers import auth as auth_router


def create_app(cfg: Settings | None = None) -> FastAPI:
    if cfg is None:
        cfg = load_settings()
    app = FastAPI(title="inja-ui-backend")
    app.state.cfg = cfg
    app.include_router(auth_router.router)
    # departments + processes routers are added in later tasks
    return app
