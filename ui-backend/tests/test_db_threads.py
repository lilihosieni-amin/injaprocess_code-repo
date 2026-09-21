"""The app's store connection under concurrent requests.

One `sqlite3.Connection` shared by FastAPI's threadpool workers interleaves
cursor state at the Python level (SQLite's serialized mode does not cover it):
reproduced as ~5-8% spurious 401/500s (`IndexError` in session resolve) under
24 parallel GETs. Each worker thread must use a connection of its own.
"""
import gc
import os
import threading

import argon2
import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def test_many_threads_on_one_app_all_get_answers(data_root, tmp_path):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__, "app_db": tmp_path / "app.db"})
    app = create_app(cfg)
    conn = db.connect(cfg.app_db)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash=argon2.PasswordHasher().hash("sixchars"))
    conn.close()
    client = TestClient(app, base_url="https://testserver")
    r = client.post("/api/auth/login",
                    json={"username": "09120000000", "password": "sixchars"})
    assert r.status_code == 200, r.text

    codes: list[object] = []
    lock = threading.Lock()
    start = threading.Barrier(24)

    def hammer():
        start.wait()
        for _ in range(25):
            try:
                got: object = client.get("/api/auth/me").status_code
            except Exception as e:  # the bug surfaces as a raised IndexError too
                got = type(e).__name__
            with lock:
                codes.append(got)

    # One event loop, so all 24 threads' requests share one threadpool and
    # therefore contend for whatever connection it hands out.
    with client:
        threads = [threading.Thread(target=hammer) for _ in range(24)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert len(codes) == 600
    assert [c for c in codes if c != 200] == []


@pytest.mark.skipif(not os.path.isdir("/proc/self/fd"), reason="needs /proc")
def test_a_threads_connection_closes_when_the_thread_exits(tmp_path):
    """Refcounting alone must close it: a `sqlite3.Connection` sits in a cycle
    with its statement cache, so without an acyclic owner it waits for the
    cyclic GC, and a threadpool that recycles threads piles up open files."""
    first = db.connect(tmp_path / "x.db")
    db.migrate(first)
    first.close()
    shared = db.PerThread(tmp_path / "x.db")
    gc.collect()
    gc.disable()
    try:
        before = len(os.listdir("/proc/self/fd"))
        for _ in range(50):
            t = threading.Thread(
                target=lambda: shared.execute("SELECT 1").fetchone())
            t.start()
            t.join()
        after = len(os.listdir("/proc/self/fd"))
    finally:
        gc.enable()
    assert after - before < 5, f"{after - before} files left open by 50 threads"
