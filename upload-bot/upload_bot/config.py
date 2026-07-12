import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    bot_token: str
    allowed_user_ids: frozenset[int]
    data_root: Path
    api_base_url: str | None = None
    proxy_url: str | None = None

    @classmethod
    def from_env(cls, env=None):
        env = env if env is not None else os.environ

        def req(key):
            v = env.get(key)
            if not v:
                raise SystemExit(f"{key} is not set")
            return v

        raw = env.get("ALLOWED_USER_IDS") or env.get("ALLOWED_USER_ID")
        if not raw:
            raise SystemExit("ALLOWED_USER_IDS is not set")
        ids = frozenset(int(p) for p in raw.split(",") if p.strip())
        if not ids:
            raise SystemExit("ALLOWED_USER_IDS has no valid ids")

        return cls(
            bot_token=req("TELEGRAM_BOT_TOKEN"),
            allowed_user_ids=ids,
            data_root=Path(req("DATA_ROOT")),
            api_base_url=(env.get("TELEGRAM_API_BASE_URL") or None),
            proxy_url=(env.get("TELEGRAM_PROXY") or None),
        )
