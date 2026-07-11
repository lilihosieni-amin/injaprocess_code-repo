from __future__ import annotations

import subprocess
from pathlib import Path

from .config import Settings


def _git(cfg: Settings, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cfg.data_root), *args],
                          capture_output=True, text=True)


def commit(cfg: Settings, paths: list[Path], pid: str, action: str) -> None:
    if paths:
        r = _git(cfg, "add", "--", *[str(p) for p in paths])
        if r.returncode != 0:
            raise RuntimeError(f"git add failed: {(r.stderr or r.stdout).strip()}")
    # nothing staged -> genuine no-op (not an error)
    if _git(cfg, "diff", "--cached", "--quiet").returncode == 0:
        return
    msg = f"ui-edit({pid}): {action}"
    r = _git(cfg, "-c", f"user.name={cfg.git_author_name}",
             "-c", f"user.email={cfg.git_author_email}",
             "commit", "-q", "-m", msg)
    if r.returncode != 0:
        raise RuntimeError(f"git commit failed: {(r.stderr or r.stdout).strip()}")
