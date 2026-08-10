import json

from inja_ui_backend import db
from inja_ui_backend.store import audit, sessions, users

TTL = 86400


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('reader', ?)",
                 (json.dumps(["view"]),))
    return conn


def _user(conn, username="09120000001"):
    rid = conn.execute("SELECT id FROM roles").fetchone()[0]
    return users.create(conn, username=username, display_name="آزمون",
                        password_hash="h", role_id=rid)


def test_issue_then_resolve_returns_the_user(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    sid = sessions.issue(conn, uid, ip="1.2.3.4", user_agent="ua", now=1000)
    row = sessions.resolve(conn, sid, ttl=TTL, now=1001)
    assert row is not None and row["user_id"] == uid


def test_resolve_touches_last_seen(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    sessions.resolve(conn, sid, ttl=TTL, now=1500)
    assert conn.execute("SELECT last_seen FROM sessions").fetchone()[0] == 1500


def test_expiry_is_absolute_from_issue_not_sliding_from_last_seen(tmp_path):
    # D7: sliding expiry keyed on last_seen would mean a session with an open
    # tab never ends, and the heartbeat runs while a TAB is open, not while a
    # person is present.
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL - 1) is not None
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL + 1) is None


def test_revoked_session_stops_resolving(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    sessions.revoke(conn, sid, now=1100)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1101) is None


def test_disabling_a_user_kills_their_live_sessions(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    users.set_disabled(conn, uid, True)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1001) is None


def test_revoke_all_can_spare_the_current_session(tmp_path):
    # Changing your own password should not sign you out of the tab you did it in.
    conn = _conn(tmp_path)
    uid = _user(conn)
    keep = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    other = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    n = sessions.revoke_all_for_user(conn, uid, now=1100, except_session=keep)
    assert n == 1
    assert sessions.resolve(conn, keep, ttl=TTL, now=1101) is not None
    assert sessions.resolve(conn, other, ttl=TTL, now=1101) is None


def test_revoke_all_leaves_other_peoples_sessions_alone(tmp_path):
    # One person changing their password must not sign out the restaurant.
    conn = _conn(tmp_path)
    mine = _user(conn, username="09120000001")
    theirs = _user(conn, username="09120000002")
    my_sid = sessions.issue(conn, mine, ip="", user_agent="", now=1000)
    their_sid = sessions.issue(conn, theirs, ip="", user_agent="", now=1000)
    assert sessions.revoke_all_for_user(conn, mine, now=1100) == 1
    assert sessions.resolve(conn, my_sid, ttl=TTL, now=1101) is None
    assert sessions.resolve(conn, their_sid, ttl=TTL, now=1101) is not None


def test_revoke_ends_only_the_session_it_names(tmp_path):
    # Signing out of one device is not signing out of every device.
    conn = _conn(tmp_path)
    uid = _user(conn)
    gone = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    kept = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    sessions.revoke(conn, gone, now=1100)
    assert sessions.resolve(conn, kept, ttl=TTL, now=1101) is not None


def test_revoking_twice_keeps_the_first_revocation_time(tmp_path):
    # When access was taken away is the answer the activity record needs; a
    # later revoke must not overwrite it, nor claim to have ended anything.
    conn = _conn(tmp_path)
    uid = _user(conn)
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    sessions.revoke(conn, sid, now=1100)
    sessions.revoke(conn, sid, now=1200)
    assert conn.execute("SELECT revoked_at FROM sessions").fetchone()[0] == 1100
    assert sessions.revoke_all_for_user(conn, uid, now=1300) == 0


def test_session_ids_are_unguessable_and_distinct(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    ids = {sessions.issue(conn, uid, ip="", user_agent="", now=1000)
           for _ in range(50)}
    assert len(ids) == 50
    assert all(len(i) >= 32 for i in ids)


def test_audit_rows_are_append_only_in_practice(tmp_path):
    conn = _conn(tmp_path)
    audit.record(conn, actor="09120000001", action="login.success", now=1000)
    audit.record(conn, actor="09120000001", action="logout", now=1100)
    rows = conn.execute("SELECT action FROM audit_events ORDER BY id").fetchall()
    assert [r[0] for r in rows] == ["login.success", "logout"]


def test_audit_detail_round_trips_as_json(tmp_path):
    conn = _conn(tmp_path)
    audit.record(conn, actor="?", action="login.failure", now=1,
                 outcome="fail", detail={"reason": "no_such_user"})
    got = conn.execute("SELECT detail FROM audit_events").fetchone()[0]
    assert json.loads(got) == {"reason": "no_such_user"}


# --- the user store -------------------------------------------------------

def test_create_stores_the_canonical_username(tmp_path):
    # D57: only the canonical form is persisted, so a Persian-keyboard signup
    # and a latin-keyboard signup are the same account rather than two.
    conn = _conn(tmp_path)
    uid = _user(conn, username="+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹")
    assert users.by_id(conn, uid)["username"] == "09123456789"


def test_by_username_normalises_before_it_compares(tmp_path):
    # The two spellings differ from each other AND from the canonical form, so
    # dropping the normalisation from either side breaks the lookup.
    conn = _conn(tmp_path)
    uid = _user(conn, username="۰۹۱۲۳۴۵۶۷۸۹")
    row = users.by_username(conn, "0912-345-6789")
    assert row is not None and row["id"] == uid


def test_by_username_is_none_for_a_stranger(tmp_path):
    conn = _conn(tmp_path)
    _user(conn)
    assert users.by_username(conn, "09990000000") is None


def test_set_password_replaces_only_that_users_hash(tmp_path):
    conn = _conn(tmp_path)
    one = _user(conn, username="09120000001")
    two = _user(conn, username="09120000002")
    users.set_password(conn, one, "new-hash")
    assert users.by_id(conn, one)["password_hash"] == "new-hash"
    assert users.by_id(conn, two)["password_hash"] == "h"


def test_set_disabled_false_restores_access(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    users.set_disabled(conn, uid, True)
    users.set_disabled(conn, uid, False)
    assert users.by_id(conn, uid)["disabled_at"] is None
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1001) is not None
