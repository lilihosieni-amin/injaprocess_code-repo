from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from .config import Settings

logger = logging.getLogger(__name__)


def _git(cfg: Settings, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(cfg.data_root), *args],
                          capture_output=True, text=True)


def _tracked(cfg: Settings, path: Path) -> bool:
    return _git(cfg, "ls-files", "--error-unmatch", "--", str(path)).returncode == 0


def head(cfg: Settings) -> str:
    """`git rev-parse HEAD` in the data-repo — the commit id a confirmation is
    taken against (QF-24), so a post-restore reconciliation can tell backup
    skew from genuine drift. `''` when the repo has no commits yet, rather
    than raising: a fresh, uncommitted data-repo is a real state this reads
    against, not an error.
    """
    r = _git(cfg, "rev-parse", "HEAD")
    return r.stdout.strip() if r.returncode == 0 else ""


def commit(cfg: Settings, paths: list[Path], pid: str, action: str) -> None:
    # A path git can't stage — absent from disk *and* never tracked — has no
    # pathspec `git add` can match, and would abort the whole add, failing a
    # commit for the paths that *do* have something to record. It happens on a
    # real path: `delete_process` always names the department's order.json, and
    # the order module deliberately writes no file for a department that drops
    # to zero actives without one (ARD §4.6) — so deleting the last process in
    # such a department reaches here with an absent, untracked order.json, after
    # the process file is already unlinked. Skip those, and say which.
    stageable, skipped = [], []
    for p in paths:
        (stageable if p.exists() or _tracked(cfg, p) else skipped).append(p)
    if skipped:
        logger.warning("git: nothing to stage for %s — absent and untracked",
                       ", ".join(str(p) for p in skipped))
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
