"""Twice-daily copies of app.db and comments.db, on the server (spec D8;
addendum D82).

Run by `comment_jobs.loop` inside ui-backend — never a container of its own,
which would have to mount app.db, the one thing D5 forbids. This protects
against a corrupted database or a bad deploy, NOT against losing the host:
NFR-16's off-site half stays unmet, and docs/runbooks/05-operations.md says so.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import time
from pathlib import Path

log = logging.getLogger(__name__)

#: The git-push crontab's hours (`deploy/git-push/crontab`: `0 11,23 * * *`),
#: read in the container's local time as busybox crond reads them — UTC, since
#: no container sets `TZ`: 11:00/23:00 UTC is 14:30/02:30 in Tehran.
HOURS = (11, 23)
KEEP = 14


def slot(now: float) -> str:
    """The latest scheduled slot at or before `now`, as `YYYYmmdd-HH00`."""
    t = time.localtime(now)
    past = [h for h in HOURS if h <= t.tm_hour]
    if past:
        return time.strftime("%Y%m%d-", t) + f"{past[-1]:02d}00"
    return time.strftime("%Y%m%d-", time.localtime(now - 86400)) + f"{HOURS[-1]:02d}00"


def _copy(src: Path, dst: Path) -> None:
    """`.backup`, not a file copy: both files are in WAL mode, and a copy taken
    mid-write can be torn. Written beside the target and renamed, so a crash
    never leaves a file that looks finished.

    The `.tmp` is created `0600` before sqlite opens it — app.db is a file of
    password hashes, and a crash mid-copy must not leave a world-readable one
    behind (final review M2); `maybe_run` sweeps any such leftover."""
    tmp = dst.with_suffix(".tmp")
    os.close(os.open(tmp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600))
    os.chmod(tmp, 0o600)                 # a leftover from before keeps its old mode
    s, d = sqlite3.connect(str(src)), sqlite3.connect(str(tmp))
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()
    os.replace(tmp, dst)


def maybe_run(cfg, now: float | None = None) -> bool:
    """Back both files up if the current slot has none yet; keep the newest
    `KEEP` of each. Whether a slot is due is read from the files themselves, so
    a restart neither skips nor repeats one. `app-*` is written last, so its
    presence means the slot is complete."""
    if cfg.backup_dir is None:
        return False
    out = cfg.backup_dir
    out.mkdir(parents=True, exist_ok=True)
    s = slot(time.time() if now is None else now)
    if (out / f"app-{s}.db").exists():
        return False
    _copy(cfg.comments_db, out / f"comments-{s}.db")
    _copy(cfg.app_db, out / f"app-{s}.db")
    for name in ("app", "comments"):
        for old in sorted(out.glob(f"{name}-*.db"))[:-KEEP]:
            old.unlink()
    for torn in out.glob("*.tmp"):      # a copy a crash cut short (`_copy`)
        torn.unlink()
    log.info("state backup %s written to %s", s, out)
    return True
