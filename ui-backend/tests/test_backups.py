"""Twice-daily copies of both SQLite files on the server (spec D8, addendum
D82; §11 test 29)."""
import dataclasses
import os
import sqlite3
import time

import pytest

from inja_ui_backend import backups, comments_db, db
from inja_ui_backend.config import load_settings
from inja_ui_backend.tests_helpers import cfg_for, seed_editor


@pytest.fixture(autouse=True)
def utc(monkeypatch):
    monkeypatch.setenv("TZ", "UTC")
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


def _at(stamp: str) -> float:          # "2026-09-27 12:30" in UTC
    return time.mktime(time.strptime(stamp, "%Y-%m-%d %H:%M"))


@pytest.fixture
def cfg(data_root, tmp_path):
    c = cfg_for(data_root, tmp_path / "app.db", tmp_path / "comments.db")
    seed_editor(c)
    comments_db.open_comments(c.comments_db).close()
    return dataclasses.replace(c, backup_dir=tmp_path / "backups")


def test_the_slot_is_the_latest_scheduled_hour():
    assert backups.slot(_at("2026-09-27 12:30")) == "20260927-1100"
    assert backups.slot(_at("2026-09-27 23:05")) == "20260927-2300"
    assert backups.slot(_at("2026-09-27 03:00")) == "20260926-2300"


def test_a_backup_restores_to_both_files(cfg):
    assert backups.maybe_run(cfg, now=_at("2026-09-27 12:30")) is True
    app = cfg.backup_dir / "app-20260927-1100.db"
    cmts = cfg.backup_dir / "comments-20260927-1100.db"
    assert sqlite3.connect(app).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert sqlite3.connect(cmts).execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0
    assert oct(os.stat(app).st_mode & 0o777) == "0o600"


def test_a_slot_is_taken_once(cfg):
    backups.maybe_run(cfg, now=_at("2026-09-27 12:30"))
    assert backups.maybe_run(cfg, now=_at("2026-09-27 22:59")) is False
    assert backups.maybe_run(cfg, now=_at("2026-09-27 23:00")) is True


def test_rotation_keeps_the_newest_fourteen_of_each(cfg):
    cfg.backup_dir.mkdir()
    for day in range(1, 16):
        for name in ("app", "comments"):
            (cfg.backup_dir / f"{name}-202609{day:02d}-1100.db").write_bytes(b"")
    backups.maybe_run(cfg, now=_at("2026-09-27 12:30"))
    for name in ("app", "comments"):
        kept = sorted(p.name for p in cfg.backup_dir.glob(f"{name}-*.db"))
        assert len(kept) == backups.KEEP and kept[-1] == f"{name}-20260927-1100.db"


def test_no_backup_dir_means_no_backups(cfg):
    assert backups.maybe_run(dataclasses.replace(cfg, backup_dir=None)) is False


def test_a_backup_dir_inside_data_root_is_refused(data_root, tmp_path):
    env = {"DATA_ROOT": str(data_root), "SCHEMA_DIR": str(tmp_path),
           "SESSION_SIGNING_KEY": "k", "APP_DB": str(tmp_path / "app.db"),
           "BACKUP_DIR": str(data_root / "backups")}
    with pytest.raises(RuntimeError, match="BACKUP_DIR must not be inside DATA_ROOT"):
        load_settings(env)
