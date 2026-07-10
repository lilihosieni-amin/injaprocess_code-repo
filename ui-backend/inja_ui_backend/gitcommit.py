from __future__ import annotations

import subprocess
from pathlib import Path

from .config import Settings


def _git(cfg: Settings, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cfg.data_root), *args],
                          capture_output=True, text=True)


def commit(cfg: Settings, paths: list[Path], pid: str, action: str) -> None:
    if paths:
        _git(cfg, "add", "--", *[str(p) for p in paths])
    # nothing staged -> skip (git commit would fail)
    if _git(cfg, "diff", "--cached", "--quiet").returncode == 0:
        return
    msg = f"ui-edit({pid}): {action}"
    _git(cfg, "-c", f"user.name={cfg.git_author_name}",
         "-c", f"user.email={cfg.git_author_email}",
         "commit", "-q", "-m", msg)
