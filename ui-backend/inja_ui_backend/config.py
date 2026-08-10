from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

_REQUIRED = ("DATA_ROOT", "SCHEMA_DIR", "SESSION_SIGNING_KEY")


@dataclass(frozen=True)
class Settings:
    data_root: Path
    schema_dir: Path
    #: The operational store (accounts, sessions, audit). Defaults to beside
    #: DATA_ROOT rather than inside it — it is operational state and must never
    #: appear in the data-repo working tree.
    app_db: Path
    session_signing_key: str
    session_ttl: int
    #: How many reverse proxies stand in front of this process, and therefore how
    #: many trailing `X-Forwarded-For` entries were written by something other than
    #: the caller (D7). 0 — the default — records the TCP peer and ignores the
    #: header entirely, which is correct for the tests, a local run and any direct
    #: exposure. The deployed stack behind `deploy/Caddyfile` sets 1. See
    #: `auth.client_ip`: too high a number here does not forge anything, but too
    #: high on a *directly* reachable process would let a client dictate the
    #: address recorded against it.
    trusted_proxy_hops: int
    static_dir: Optional[Path]
    export_dir: Optional[Path]
    export_template_dir: Optional[Path]
    #: The headless browser that prints an export to PDF. Optional, and unset means
    #: exports simply carry no PDF — the same shape as `export_dir` being unset
    #: meaning no export at all. A deployment without the browser in its image must
    #: keep working, so this is never required.
    chromium_path: Optional[Path]
    #: The one shared credential that opens a published export, and nothing else.
    #: Deliberately kept out of the user store so `auth.authenticate` cannot accept
    #: it — `authenticate` reads rows from `app_db`, and this pair is never one.
    #: Both unset means no one can open an export — never that everyone can.
    export_username: Optional[str]
    export_password_hash: Optional[str]
    git_author_name: str
    git_author_email: str


def load_settings(env: Optional[Mapping[str, str]] = None) -> Settings:
    env = os.environ if env is None else env
    missing = [k for k in _REQUIRED if not env.get(k)]
    if missing:
        raise RuntimeError("missing required env vars: " + ", ".join(missing))

    data_root = Path(env["DATA_ROOT"])
    if not data_root.is_dir():
        raise RuntimeError(f"DATA_ROOT is not a directory: {data_root}")
    schema_dir = Path(env["SCHEMA_DIR"])
    if not schema_dir.is_dir():
        raise RuntimeError(f"SCHEMA_DIR is not a directory: {schema_dir}")

    # No UI_USERS_FILE, no UI_USERNAME/UI_PASSWORD_HASH: people are rows in
    # `app_db` now (D1), created by `inja-seed` and by the user administration
    # that follows it. A credential in the environment would be a second, unrevocable
    # way in that no session store, no `disabled_at` and no activity record can see,
    # so the fields are gone from `Settings` rather than merely unread.
    static = env.get("UI_STATIC_DIR")
    export_dir = env.get("EXPORT_DIR")
    export_templates = env.get("UI_EXPORT_TEMPLATE_DIR")
    chromium = env.get("CHROMIUM_PATH")
    app_db = Path(env["APP_DB"]) if env.get("APP_DB") else data_root.parent / "app.db"
    # Refuse to start rather than trust prose. Four documents warn against putting
    # the store inside DATA_ROOT and §16 states it as an architectural property, but
    # `APP_DB: /data/app.db` is a natural-looking consolidation — /data is the only
    # other path this service is configured with — and the app would migrate there
    # happily. DATA_ROOT is bind-mounted read-write into `control-bot`, whose Claude
    # Code runtime is confined by hooks that block *writes*, not reads: from that
    # moment the pipeline agent can read every argon2 hash and every live
    # `sessions.id`, and a session id pasted into an `inja_session` cookie
    # authenticates as that person with no further check. It would also enter the
    # data-repo working tree and be committed and pushed. Resolved on both sides so
    # `/data/../data/app.db` and a symlinked DATA_ROOT cannot walk around it.
    resolved_db = app_db.resolve()
    resolved_root = data_root.resolve()
    if resolved_db == resolved_root or resolved_root in resolved_db.parents:
        raise RuntimeError(
            f"APP_DB must not be inside DATA_ROOT: {resolved_db} is inside"
            f" {resolved_root}. The store holds every password hash and every live"
            " session id; DATA_ROOT is readable by the pipeline runtime and is a"
            " git working tree that gets pushed. Put it on its own volume"
            " (the deployed stack uses /state/app.db).")
    return Settings(
        data_root=data_root,
        schema_dir=schema_dir,
        app_db=app_db,
        session_signing_key=env["SESSION_SIGNING_KEY"],
        # `or` and not a default argument: `config/ui-backend.env.example` leaves
        # EXPORT_USERNAME, EXPORT_DIR and UI_STATIC_DIR blank on purpose, so "clear
        # the ones you do not need" is the file's own idiom — and a blank line here
        # reached `int("")`, which is a bare ValueError at startup with no mention of
        # which variable caused it. Blank means unset, as it does everywhere else in
        # this function.
        session_ttl=int(env.get("SESSION_TTL") or "86400"),
        trusted_proxy_hops=int(env.get("TRUSTED_PROXY_HOPS") or "0"),
        static_dir=Path(static) if static else None,
        export_dir=Path(export_dir) if export_dir else None,
        export_template_dir=Path(export_templates) if export_templates else None,
        chromium_path=Path(chromium) if chromium else None,
        export_username=env.get("EXPORT_USERNAME") or None,
        export_password_hash=env.get("EXPORT_PASSWORD_HASH") or None,
        git_author_name=env.get("GIT_AUTHOR_NAME", "ui-edit"),
        git_author_email=env.get("GIT_AUTHOR_EMAIL", "ui-edit@inja.local"),
    )
