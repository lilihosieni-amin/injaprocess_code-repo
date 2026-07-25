from __future__ import annotations

import subprocess
from pathlib import Path

from .config import Settings


def _git(cfg: Settings, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cfg.data_root), *args],
                          capture_output=True, text=True)


def _tracked(cfg: Settings, path: Path) -> bool:
    return _git(cfg, "ls-files", "--error-unmatch", "--", str(path)).returncode == 0


def commit(cfg: Settings, paths: list[Path], pid: str, action: str) -> None:
    # A path git can't stage — absent from disk *and* never tracked — has no
    # pathspec `git add` can match, and would abort the whole add. That only
    # happens to a file created outside the git-backed write path (e.g. a
    # test fixture written directly to disk); skip it rather than fail the
    # commit for paths git genuinely has nothing to record.
    stageable = [p for p in paths if p.exists() or _tracked(cfg, p)]
    if stageable:
        r = _git(cfg, "add", "--", *[str(p) for p in stageable])
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
