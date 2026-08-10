import json
import time

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


def test_issue_records_who_is_here_and_from_where(tmp_path):
    # These two columns are the whole answer to "who is signed in, from where",
    # which is the first question a security review asks. Swapped, they answer
    # it backwards, and the browser string would be read as an address.
    conn = _conn(tmp_path)
    uid = _user(conn)
    sid = sessions.issue(conn, uid, ip="1.2.3.4", user_agent="Firefox/1", now=1000)
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    assert row["ip"] == "1.2.3.4"
    assert row["user_agent"] == "Firefox/1"
    # A session starts its life having just been seen.
    assert row["issued_at"] == 1000
    assert row["last_seen"] == 1000
    assert row["revoked_at"] is None


def test_resolve_touches_last_seen(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    sessions.resolve(conn, sid, ttl=TTL, now=1500)
    assert conn.execute("SELECT last_seen FROM sessions").fetchone()[0] == 1500


def test_resolve_touches_only_the_session_it_resolved(tmp_path):
    # One open tab must not make every other device look present; presence is
    # measured per session, not per person.
    conn = _conn(tmp_path)
    uid = _user(conn)
    here = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    idle = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    sessions.resolve(conn, here, ttl=TTL, now=1500)
    seen = dict(conn.execute(
        "SELECT id, last_seen FROM sessions").fetchall())
    assert seen[here] == 1500
    assert seen[idle] == 1000


def test_expiry_is_absolute_from_issue_not_sliding_from_last_seen(tmp_path):
    # D7: sliding expiry keyed on last_seen would mean a session with an open
    # tab never ends, and the heartbeat runs while a TAB is open, not while a
    # person is present.
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL - 1) is not None
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL + 1) is None


def test_a_session_is_dead_at_exactly_ttl_seconds_old(tmp_path):
    # The boundary is stated, not accidental: TTL is how long a session lasts,
    # so the moment it is TTL old it is over. Probing only TTL-1 and TTL+1
    # leaves the one instant that decides '>=' from '>' unsaid.
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1000 + TTL) is None


def test_revoked_session_stops_resolving(tmp_path):
    conn = _conn(tmp_path)
    sid = sessions.issue(conn, _user(conn), ip="", user_agent="", now=1000)
    sessions.revoke(conn, sid, now=1100)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1101) is None
    # The heartbeat has to sit AFTER the rejection guards. Hoisted above them it
    # would mark revoked, disabled and expired sessions as freshly present —
    # corrupting the one question the row exists to answer.
    assert conn.execute("SELECT last_seen FROM sessions").fetchone()[0] == 1000


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
    # WHEN access was taken away, not merely that it was: any non-NULL value
    # ends the session, so the timestamp itself is unbound unless asserted.
    assert conn.execute("SELECT revoked_at FROM sessions WHERE id = ?",
                        (my_sid,)).fetchone()[0] == 1100


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


def test_audit_detail_is_sql_null_when_there_is_nothing_to_say(tmp_path):
    # Not the JSON text "null". An event with no detail must be findable with
    # `WHERE detail IS NULL`, which the string would silently exclude.
    conn = _conn(tmp_path)
    audit.record(conn, actor="09120000001", action="logout", now=1000)
    assert conn.execute("SELECT detail FROM audit_events").fetchone()[0] is None
    assert conn.execute(
        "SELECT COUNT(*) FROM audit_events WHERE detail IS NULL").fetchone()[0] == 1
    # The DEFAULT outcome, not the one a caller passes. Every login success and
    # logout omits the argument; a default of "fail" would write the whole
    # activity record as failures and no test that passes one would notice.
    assert conn.execute("SELECT outcome FROM audit_events").fetchone()[0] == "ok"


def test_audit_detail_stores_persian_as_persian(tmp_path):
    # Asserted on the RAW stored text, not the parsed value: \uXXXX escapes
    # round-trip through json.loads perfectly well and would leave the activity
    # record unreadable and ungreppable in a Persian-language product.
    conn = _conn(tmp_path)
    audit.record(conn, actor="09120000001", action="user.disable", now=1000,
                 detail={"reason": "کارمند رفت"})
    got = conn.execute("SELECT detail FROM audit_events").fetchone()[0]
    assert "کارمند رفت" in got
    assert "\\u" not in got


def test_audit_records_every_column_it_was_given(tmp_path):
    # The activity record answers who did what to whom, from where, and how it
    # went. A column silently dropped or transposed answers a different question.
    conn = _conn(tmp_path)
    audit.record(conn, actor="09120000001", action="user.disable", now=1234,
                 session_id="sess-1", target="09120000002", ip="10.0.0.9",
                 user_agent="Firefox/1", outcome="denied")
    row = conn.execute("SELECT * FROM audit_events").fetchone()
    assert row["at"] == 1234
    assert row["actor"] == "09120000001"
    assert row["session_id"] == "sess-1"
    assert row["action"] == "user.disable"
    assert row["target"] == "09120000002"
    assert row["ip"] == "10.0.0.9"
    assert row["user_agent"] == "Firefox/1"
    assert row["outcome"] == "denied"


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


def test_create_records_the_supervisor_graph(tmp_path):
    # supervisor_id and can_supervise ARE the delegation graph P0c reads. An
    # inverted flag makes every dishwasher a supervisor; a dropped supervisor_id
    # makes nobody anyone's report. Neither is visible from a default-args user.
    conn = _conn(tmp_path)
    rid = conn.execute("SELECT id FROM roles").fetchone()[0]
    boss = users.create(conn, username="09120000001", display_name="مدیر",
                        password_hash="h1", role_id=rid, can_supervise=True)
    staff = users.create(conn, username="09120000002", display_name="کارمند",
                         password_hash="h2", role_id=rid, supervisor_id=boss)

    boss_row = users.by_id(conn, boss)
    assert boss_row["can_supervise"] == 1
    assert boss_row["supervisor_id"] is None
    assert boss_row["display_name"] == "مدیر"
    assert boss_row["password_hash"] == "h1"
    assert boss_row["role_id"] == rid

    staff_row = users.by_id(conn, staff)
    assert staff_row["can_supervise"] == 0
    assert staff_row["supervisor_id"] == boss
    assert staff_row["display_name"] == "کارمند"
    assert staff_row["password_hash"] == "h2"
    assert staff_row["role_id"] == rid


def test_disabling_one_person_leaves_everyone_else_signed_in(tmp_path):
    # Firing one cook must not sign out the restaurant. resolve() joins on
    # disabled_at, so an unscoped disable would end every live session at once.
    conn = _conn(tmp_path)
    gone = _user(conn, username="09120000001")
    stays = _user(conn, username="09120000002")
    stays_sid = sessions.issue(conn, stays, ip="", user_agent="", now=1000)
    users.set_disabled(conn, gone, True)
    assert users.by_id(conn, gone)["disabled_at"] is not None
    assert users.by_id(conn, stays)["disabled_at"] is None
    assert sessions.resolve(conn, stays_sid, ttl=TTL, now=1001) is not None


def test_set_disabled_false_restores_access(tmp_path):
    conn = _conn(tmp_path)
    uid = _user(conn)
    users.set_disabled(conn, uid, True)
    users.set_disabled(conn, uid, False)
    assert users.by_id(conn, uid)["disabled_at"] is None
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=1000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=1001) is not None


def test_set_disabled_stores_the_instant_it_was_given(tmp_path):
    # Every other write in these stores takes its instant from the caller. This
    # one read the wall clock, which made the single timestamp deciding whether a
    # person can sign in the one timestamp no test could pin — and guaranteed the
    # `user.disabled` activity event named a different instant than the row.
    conn = _conn(tmp_path)
    uid = _user(conn)
    users.set_disabled(conn, uid, True, 1234567)
    assert users.by_id(conn, uid)["disabled_at"] == 1234567


def test_set_disabled_falls_back_to_the_wall_clock(tmp_path):
    # The branch a default is only ever bound by. Asserted against the REAL
    # clock, never against a value a mock handed back: a default of None, 0 or a
    # constant would satisfy any test that reads back what it injected, and
    # `disabled_at = 0` is a falsy-but-present timestamp — an account disabled in
    # 1970 that every "is it None" check still reads as disabled, and every
    # "when" reads as absurd.
    conn = _conn(tmp_path)
    uid = _user(conn)
    before = int(time.time())
    users.set_disabled(conn, uid, True)
    after = int(time.time())
    stored = users.by_id(conn, uid)["disabled_at"]
    assert isinstance(stored, int)
    assert before <= stored <= after


def test_an_instant_of_zero_is_honoured_not_treated_as_absent(tmp_path):
    # The falsy-timestamp trap the test above argues against, actually pinned:
    # `now or _now()` reads 0 as "not supplied" and silently substitutes today,
    # so the one value that proves the caller's instant is used is the one value
    # no other test passes.
    conn = _conn(tmp_path)
    uid = _user(conn)
    users.set_disabled(conn, uid, True, 0)
    assert users.by_id(conn, uid)["disabled_at"] == 0


def test_re_enabling_writes_null_even_when_an_instant_is_supplied(tmp_path):
    # `now` says WHEN access was taken away. Re-enabling takes nothing away, so
    # the column must go back to NULL — resolve() joins on `disabled_at IS NULL`,
    # and any non-NULL value there keeps the person locked out forever.
    conn = _conn(tmp_path)
    uid = _user(conn)
    users.set_disabled(conn, uid, True, 1000)
    users.set_disabled(conn, uid, False, 2000)
    assert users.by_id(conn, uid)["disabled_at"] is None
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=3000)
    assert sessions.resolve(conn, sid, ttl=TTL, now=3001) is not None


def test_set_disabled_with_an_instant_still_touches_only_one_person(tmp_path):
    # The unscoped UPDATE that would disable the whole restaurant, on the new
    # four-argument path as well as the old three-argument one.
    conn = _conn(tmp_path)
    gone = _user(conn, username="09120000001")
    stays = _user(conn, username="09120000002")
    users.set_disabled(conn, gone, True, 1000)
    assert users.by_id(conn, gone)["disabled_at"] == 1000
    assert users.by_id(conn, stays)["disabled_at"] is None
