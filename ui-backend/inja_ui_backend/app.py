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
from .routers import export_files as export_files_router
from .routers import exports as exports_router
from .routers import pending as pending_router
from .routers import processes as processes_router

logger = logging.getLogger(__name__)

#: Path prefixes the SPA shell must never answer for. `api` is the backend's own
#: surface; `exports` is served by a separate router that is skipped when the
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


def _configure_logging() -> None:
    """Give this package's own log records somewhere to go.

    Uvicorn's default `LOGGING_CONFIG` configures the `uvicorn*` loggers and
    nothing else, so it leaves the **root** logger with no handlers. Every record
    from `inja_ui_backend.*` then falls through to `logging.lastResort`, whose
    level is WARNING — which silently drops `_log_export_gate`'s startup INFO
    line altogether (verified out of process: `grep -c "export gate"` over real
    uvicorn stderr returned 0), and prints the WARNING lines that do survive with
    no timestamp, no level and no logger name. `export login failed:
    username='staff' from 127.0.0.1` is the only signal an operator has that
    someone is guessing the shared export password, and undated it cannot be
    correlated with anything.

    Guarded, because the point is to configure a root logger nobody else has:
    under pytest, or under a host that ships its own `--log-config`, the existing
    handlers win and this is a no-op. `basicConfig` is itself a no-op when root
    already has handlers; the explicit check keeps that contract visible and
    keeps the `level=` from being read as something that could override a host's
    choice.
    """
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _prepare_exports(cfg: Settings) -> Settings:
    """Prepare EXPORT_DIR, or turn the export feature off.

    A misconfigured EXPORT_DIR (an unwritable parent, or a path that is really a
    regular file) must cost the deployment the export feature and nothing else.
    Letting `mkdir` escape would abort `create_app` and take the whole UI down
    over one optional setting. Returning the settings with `export_dir` cleared
    puts the service in exactly the state an unset EXPORT_DIR produces: the
    handler's own 503 answers every export request, in Persian, with a log line,
    and the serving router below is never registered.
    """
    if not cfg.export_dir:
        return cfg
    try:
        cfg.export_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.error("EXPORT_DIR is unusable, so exports are disabled: %s: %s",
                     cfg.export_dir, e)
        return dataclasses.replace(cfg, export_dir=None)
    return cfg


def _log_export_gate(cfg: Settings) -> None:
    """Say once, at startup, which state the export gate is in — and shout if it
    is in that state by accident.

    `EXPORT_PASSWORD_HAS=` is one keystroke, and it produces the same silence an
    unset pair does: `configured()` is False, every reader gets 401, and nothing
    anywhere says why. It fails safe, which is right, but not *visibly*, and this
    is the first deployment where anyone types these two variables by hand — a 401
    nobody can explain is a long evening.

    Names only. The hash is a secret and the username is not far off, so neither
    value is ever in a log line.
    """
    has_username = bool(cfg.export_username)
    has_hash = bool(cfg.export_password_hash)
    if has_username != has_hash:
        logger.warning(
            "half-configured export credential: %s is set but %s is not, so the "
            "export gate stays shut to everyone but a signed-in UI user — set "
            "both, or neither",
            "EXPORT_USERNAME" if has_username else "EXPORT_PASSWORD_HASH",
            "EXPORT_PASSWORD_HASH" if has_username else "EXPORT_USERNAME")
    if has_username and has_hash:
        logger.info("export gate: a shared export credential is configured, so "
                    "/exports opens for it and for a signed-in UI user")
    else:
        logger.info("export gate: no export credential configured, so /exports "
                    "answers 401 to everyone but a signed-in UI user")


def create_app(cfg: Settings | None = None) -> FastAPI:
    # before anything that logs: `_prepare_exports` and `_log_export_gate` below
    # are the first records this service emits, and they are the ones that were
    # being thrown away.
    _configure_logging()
    if cfg is None:
        cfg = load_settings()
    # No `/docs`, no `/redoc`, no `/openapi.json` — deliberate, not an oversight.
    #
    # FastAPI serves all three by default and serves them *unauthenticated*: the
    # session in this service is a cookie checked inside each handler, not a global
    # dependency, so nothing stands in front of them. Left on, they publish every
    # admin route's path, method, request body and response shape to anyone who
    # asks — and `deploy/Caddyfile` puts this process on the public internet. There
    # are no third-party API consumers here (the only client is the SPA in `ui/`,
    # written against the same repo), so the schema buys nothing and costs that.
    #
    # If you want Swagger back, put it behind the session rather than deleting
    # these three arguments.
    app = FastAPI(title="inja-ui-backend", docs_url=None, redoc_url=None,
                  openapi_url=None)
    # before `app.state.cfg`: the handlers must see the settings the directory
    # preparation actually succeeded with, not the ones the environment asked for
    cfg = _prepare_exports(cfg)
    _log_export_gate(cfg)
    app.state.cfg = cfg
    app.include_router(auth_router.router)
    app.include_router(departments_router.router)
    app.include_router(exports_router.router)
    app.include_router(pending_router.router)
    app.include_router(processes_router.router)
    if cfg.export_dir:
        # Registered ahead of the SPA catch-all below: a mount at "/" swallows
        # everything registered after it, and its 404 fallback would answer
        # /exports/... with index.html. Skipped entirely when the feature is off,
        # so an old link falls through to that catch-all's plain 404.
        app.include_router(export_files_router.router)
        # The way in, on the same switch: with nothing published there is nothing
        # to sign in to, and a login endpoint answering 401 forever would only be
        # somewhere to guess the shared password at.
        app.include_router(export_files_router.login_router)
    if cfg.static_dir and cfg.static_dir.is_dir():
        app.mount("/", SPAStaticFiles(directory=str(cfg.static_dir), html=True), name="static")
    return app


app = create_app() if os.environ.get("DATA_ROOT") else None
