import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    bot_token: str
    allowed_user_id: int
    data_root: Path
    api_base_url: str | None = None

    @classmethod
    def from_env(cls, env=None):
        env = env if env is not None else os.environ

        def req(key):
            v = env.get(key)
            if not v:
                raise SystemExit(f"{key} is not set")
            return v

        return cls(
            bot_token=req("TELEGRAM_BOT_TOKEN"),
            allowed_user_id=int(req("ALLOWED_USER_ID")),
            data_root=Path(req("DATA_ROOT")),
            api_base_url=(env.get("TELEGRAM_API_BASE_URL") or None),
        )
