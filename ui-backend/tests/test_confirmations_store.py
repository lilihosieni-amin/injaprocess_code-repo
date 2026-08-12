from inja_ui_backend import db
from inja_ui_backend.store import confirmations


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    return conn


def test_a_confirmation_round_trips(tmp_path):
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="09120000000", at=1770000000)
    row = confirmations.get(conn, "dining-001")
    assert row["fingerprint"] == "a" * 64
    assert row["confirmed_by"] == "09120000000"
    assert row["confirmed_at"] == 1770000000


def test_an_unconfirmed_target_is_none_not_an_error(tmp_path):
    assert confirmations.get(_conn(tmp_path), "dining-001") is None


def test_re_confirming_replaces_rather_than_accumulates(tmp_path):
    """The whole point of the mark is that there is one answer to 'does the
    current fingerprint match?'. Two rows would give two."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="09120000000", at=1770000000)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="b" * 64,
                                   by="09120000001", at=1770000900)
    assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 1
    row = confirmations.get(conn, "dining-001")
    assert (row["fingerprint"], row["confirmed_by"], row["confirmed_at"]) == (
        "b" * 64, "09120000001", 1770000900)


def test_revoke_reports_whether_there_was_anything_to_revoke(tmp_path):
    """D61 — withdrawing is a deliberate act with an event of its own, so the
    caller has to be able to tell 'I withdrew one' from 'there was none': the
    second must not write a `confirmation.revoked` row about nothing."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining", fingerprint="c" * 64,
                                   by="09120000000", at=1770000000)
    assert confirmations.revoke(conn, "dining") is True
    assert confirmations.get(conn, "dining") is None
    assert confirmations.revoke(conn, "dining") is False


def test_revoke_only_removes_its_own_target(tmp_path):
    """A `DELETE` with no `WHERE` would still return a truthy rowcount and pass
    every other test here — it would just also erase every other department's
    and process's mark. Revoking one target must leave the rest vouched-for."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining", fingerprint="c" * 64,
                                   by="09120000000", at=1)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="d" * 64,
                                   by="09120000000", at=2)
    assert confirmations.revoke(conn, "dining") is True
    assert confirmations.get(conn, "dining") is None
    assert confirmations.get(conn, "dining-001")["fingerprint"] == "d" * 64


def test_a_process_and_a_department_are_separate_targets(tmp_path):
    """One table for both (D20, D55). `dining` and `dining-001` must not collide
    — a department code carries no hyphen and a process id always does, so the
    two namespaces are disjoint and a shared key is unambiguous."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining", fingerprint="c" * 64,
                                   by="09120000000", at=1)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="d" * 64,
                                   by="09120000000", at=2)
    assert confirmations.get(conn, "dining")["fingerprint"] == "c" * 64
    assert confirmations.get(conn, "dining-001")["fingerprint"] == "d" * 64


def test_stored_for_answers_many_targets_in_one_query(tmp_path):
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="u", at=1)
    confirmations.set_confirmation(conn, target="dining-003", fingerprint="c" * 64,
                                   by="u", at=1)
    # dining-002 is deliberately absent, and dining-009 was never asked about:
    # a lookup that returned every row in the table would pass a test that only
    # checked the ones it planted.
    confirmations.set_confirmation(conn, target="dining-009", fingerprint="z" * 64,
                                   by="u", at=1)
    got = confirmations.stored_for(conn, ["dining-001", "dining-002", "dining-003"])
    assert got == {"dining-001": "a" * 64, "dining-003": "c" * 64}


def test_stored_for_asks_nothing_when_there_is_nothing_to_ask(tmp_path):
    """An empty department must not build `... IN ()`, which is a syntax error."""
    assert confirmations.stored_for(_conn(tmp_path), []) == {}


def test_the_writes_open_no_transaction(tmp_path):
    """`db.connect`'s invariant: the app shares one connection across FastAPI's
    threadpool, and it is safe only while no handler opens an explicit
    transaction. Both writes here are single autocommitted statements."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="u", at=1)
    assert not conn.in_transaction
    confirmations.revoke(conn, "dining-001")
    assert not conn.in_transaction
