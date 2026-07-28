from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

_REQUIRED = ("DATA_ROOT", "SCHEMA_DIR", "SESSION_SIGNING_KEY")


@dataclass(frozen=True)
class Settings:
    data_root: Path
    schema_dir: Path
    ui_username: str
    ui_password_hash: str
    session_signing_key: str
    session_ttl: int
    static_dir: Optional[Path]
    export_dir: Optional[Path]
    export_template_dir: Optional[Path]
    #: The headless browser that prints an export to PDF. Optional, and unset means
    #: exports simply carry no PDF — the same shape as `export_dir` being unset
    #: meaning no export at all. A deployment without the browser in its image must
    #: keep working, so this is never required.
    chromium_path: Optional[Path]
    #: The one shared credential that opens a published export, and nothing else.
    #: Deliberately kept out of `users` so `auth.authenticate` cannot accept it.
    #: Both unset means no one can open an export — never that everyone can.
    export_username: Optional[str]
    export_password_hash: Optional[str]
    git_author_name: str
    git_author_email: str
    users: dict[str, str]


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

    users_file = env.get("UI_USERS_FILE")
    if users_file:
        with open(users_file, encoding="utf-8") as fh:
            users = json.load(fh)
        if not isinstance(users, dict) or not users:
            raise RuntimeError("UI_USERS_FILE must be a non-empty JSON object of username->hash")
        ui_username = ""
        ui_password_hash = ""
    else:
        ui_username = env.get("UI_USERNAME")
        ui_password_hash = env.get("UI_PASSWORD_HASH")
        if not ui_username or not ui_password_hash:
            raise RuntimeError("set UI_USERS_FILE, or both UI_USERNAME and UI_PASSWORD_HASH")
        users = {ui_username: ui_password_hash}

    static = env.get("UI_STATIC_DIR")
    export_dir = env.get("EXPORT_DIR")
    export_templates = env.get("UI_EXPORT_TEMPLATE_DIR")
    chromium = env.get("CHROMIUM_PATH")
    return Settings(
        data_root=data_root,
        schema_dir=schema_dir,
        ui_username=ui_username,
        ui_password_hash=ui_password_hash,
        session_signing_key=env["SESSION_SIGNING_KEY"],
        session_ttl=int(env.get("SESSION_TTL", "86400")),
        static_dir=Path(static) if static else None,
        export_dir=Path(export_dir) if export_dir else None,
        export_template_dir=Path(export_templates) if export_templates else None,
        chromium_path=Path(chromium) if chromium else None,
        export_username=env.get("EXPORT_USERNAME") or None,
        export_password_hash=env.get("EXPORT_PASSWORD_HASH") or None,
        git_author_name=env.get("GIT_AUTHOR_NAME", "ui-edit"),
        git_author_email=env.get("GIT_AUTHOR_EMAIL", "ui-edit@inja.local"),
        users=users,
    )
