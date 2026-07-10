from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

_REQUIRED = ("DATA_ROOT", "SCHEMA_DIR", "UI_USERNAME",
             "UI_PASSWORD_HASH", "SESSION_SIGNING_KEY")


@dataclass(frozen=True)
class Settings:
    data_root: Path
    schema_dir: Path
    ui_username: str
    ui_password_hash: str
    session_signing_key: str
    session_ttl: int
    static_dir: Optional[Path]
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

    static = env.get("UI_STATIC_DIR")
    return Settings(
        data_root=data_root,
        schema_dir=schema_dir,
        ui_username=env["UI_USERNAME"],
        ui_password_hash=env["UI_PASSWORD_HASH"],
        session_signing_key=env["SESSION_SIGNING_KEY"],
        session_ttl=int(env.get("SESSION_TTL", "86400")),
        static_dir=Path(static) if static else None,
        git_author_name=env.get("GIT_AUTHOR_NAME", "ui-edit"),
        git_author_email=env.get("GIT_AUTHOR_EMAIL", "ui-edit@inja.local"),
    )
