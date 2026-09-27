"""Presence is active time, not time since sign-in (spec D43, addendum D81,
§11 test 27 — the server half; the client half is ui/src/auth/useSession.test.tsx)."""
from inja_ui_backend import db
from inja_ui_backend.store import sessions


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO roles (id, name, capabilities) VALUES (1, 'reader', '[]')")
    conn.execute("INSERT INTO users (id, username, display_name, password_hash, role_id)"
                 " VALUES (1, '09120000001', 'x', 'h', 1)")
    return conn


def _intervals(conn, sid):
    return [(r["started_at"], r["ended_at"]) for r in conn.execute(
        "SELECT started_at, ended_at FROM activity_intervals WHERE session_id = ?"
        " ORDER BY id", (sid,))]


def test_requests_within_five_minutes_extend_one_interval(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, 1, ip="", user_agent="", now=1000)
    for t in (1000, 1060, 1120, 1420):          # 1420 - 1120 = 300: still inside
        assert sessions.resolve(conn, sid, ttl=86400, now=t) is not None
    assert _intervals(conn, sid) == [(1000, 1420)]


def test_a_gap_ends_the_interval_at_its_last_request(tmp_path):
    """A hidden tab sends nothing: the interval ends at 1060, its last request,
    not at 1361 when the gap was noticed."""
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, 1, ip="", user_agent="", now=1000)
    for t in (1000, 1060, 1361, 1400):
        sessions.resolve(conn, sid, ttl=86400, now=t)
    assert _intervals(conn, sid) == [(1000, 1060), (1361, 1400)]


def test_a_refused_session_records_no_presence(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, 1, ip="", user_agent="", now=1000)
    sessions.revoke(conn, sid, now=1001)
    assert sessions.resolve(conn, sid, ttl=86400, now=1002) is None
    assert _intervals(conn, sid) == []


def test_migration_4_adds_the_p3_storage(tmp_path):
    conn = _conn(tmp_path)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(confirmations)")}
    assert "emitted_for_sha" in cols
    tables = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")}
    assert {"activity_intervals", "projection_state", "audit_session"} <= tables
