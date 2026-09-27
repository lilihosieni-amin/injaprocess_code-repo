from __future__ import annotations

import logging
import subprocess
import threading
import time
from pathlib import Path

from . import db
from .config import Settings

logger = logging.getLogger(__name__)

#: Serialises "commit + record it in `ui_commits`" with a projection pass
#: (`projection.run` takes this same lock): a pass that read `HEAD` between
#: the two would find a `ui-edit` commit with no record yet, and project it as
#: a stranger's commit — permanently, the record being append-only (D45).
# ponytail: process-local — one uvicorn worker (D6); a commit waits for a pass
# already running (seconds at most). A second worker needs a claim in app.db.
LOCK = threading.Lock()


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


def commit(cfg: Settings, paths: list[Path], pid: str, action: str, *,
          actor: str) -> bool:
    """Stage `paths` and commit them as `ui-edit({pid}): {action}`, then record
    the commit in `ui_commits` — True when a commit was made, False for the
    no-op of nothing staged. A caller writes its edit event only on True: a
    save that changed nothing is a decision nobody made (D78).
    """
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
        return False
    with LOCK:
        # D48: the commit says who acted, in an `Acted-By` trailer a person
        # reading `git log` can see. Informational only: anything that can
        # commit to the data-repo can write that trailer too, so the git
        # projection trusts the `ui_commits` row below instead (addendum D80).
        r = _git(cfg, "-c", f"user.name={cfg.git_author_name}",
                 "-c", f"user.email={cfg.git_author_email}",
                 "commit", "-q", "-m", f"ui-edit({pid}): {action}",
                 "-m", f"Acted-By: {actor}")
        if r.returncode != 0:
            raise RuntimeError(f"git commit failed: {(r.stderr or r.stdout).strip()}")
        # ponytail: `HEAD` read right after the commit — a commit another
        # container lands in the milliseconds between would be recorded here
        # instead of ours (ours then projects as a stranger's). Upgrade path:
        # `write-tree` + `commit-tree` + `update-ref HEAD new old`, which names
        # its own sha and fails on a moved HEAD.
        conn = db.connect(cfg.app_db)
        try:
            conn.execute("INSERT INTO ui_commits (sha, actor, at) VALUES (?, ?, ?)",
                         (head(cfg), actor, int(time.time())))
        finally:
            conn.close()
    return True
