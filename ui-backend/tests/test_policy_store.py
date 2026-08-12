import pytest
from inja_ui_backend import db
from inja_ui_backend.store import policy


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    return conn


def test_the_defaults_are_exactly_d17s_table(tmp_path):
    """The whole point of the defaults is that nothing becomes visible at
    migration that is not visible today, so they are pinned as an equality
    rather than as six `in` checks — a seventh field added without a decision
    fails here."""
    assert policy.current(_conn(tmp_path)) == {
        "node_description": True,
        "node_actor": True,
        "process_summary": False,
        "process_idef0": False,
        "process_kpis": False,
        "node_icom": False,
    }
    assert set(policy.FIELDS) == set(policy.DEFAULTS)
    assert len(policy.FIELDS) == 6


def test_an_absent_row_reads_as_its_default(tmp_path):
    conn = _conn(tmp_path)
    policy.set_field(conn, "process_summary", True)
    got = policy.current(conn)
    assert got["process_summary"] is True
    # The other five never got a row and must still answer.
    assert got["node_actor"] is True and got["node_icom"] is False


def test_set_field_returns_the_value_it_replaced(tmp_path):
    """D19 records the actor, the field and **both values**. The previous value
    exists nowhere else once the row is written, so the writer has to hand it
    back or the event can only ever say half of what D19 asks for."""
    conn = _conn(tmp_path)
    assert policy.set_field(conn, "node_actor", False) is True     # was the default
    assert policy.set_field(conn, "node_actor", True) is False     # was the stored 0
    assert policy.set_field(conn, "node_actor", True) is True      # unchanged


def test_an_unknown_field_is_refused_at_the_data_layer(tmp_path):
    conn = _conn(tmp_path)
    with pytest.raises(ValueError):
        policy.set_field(conn, "node_kpis", True)
    # A node has no KPIs (D17): `process.kpis[]` and `overview.personnel[].kpi[]`
    # are the only two KPI fields in the model, and neither is a node's.
    assert "node_kpis" not in policy.FIELDS
    assert conn.execute("SELECT COUNT(*) FROM visibility_policy").fetchone()[0] == 0


def test_a_stray_row_for_a_field_that_no_longer_exists_is_ignored(tmp_path):
    """`FIELDS` is the vocabulary, the table is only storage. A row left behind
    by a removed switch must not appear in the policy or in its version, or a
    hand-edited database would change what every report contains."""
    conn = _conn(tmp_path)
    conn.execute("INSERT INTO visibility_policy (field, visible) VALUES ('gone', 1)")
    assert "gone" not in policy.current(conn)


def test_the_version_changes_when_the_policy_changes(tmp_path):
    """§11 test 22's first clause, at the store. If this fails, a cached report
    is served under a policy it was not built under — a content leak, not a
    stale page."""
    conn = _conn(tmp_path)
    before = policy.version(conn)
    policy.set_field(conn, "node_actor", False)
    assert policy.version(conn) != before


def test_the_version_is_the_policy_and_not_its_history(tmp_path):
    """Undoing a change returns the old version, and that is correct rather than
    a weakness: the version exists to say **which policy an artifact was built
    under**, and a report built under 'actor visible' is still right for 'actor
    visible'. A counter would force a re-render of every department for a change
    that changed nothing."""
    conn = _conn(tmp_path)
    before = policy.version(conn)
    policy.set_field(conn, "node_actor", False)
    policy.set_field(conn, "node_actor", True)
    assert policy.version(conn) == before


def test_the_version_is_stable_across_connections(tmp_path):
    """A digest over the policy, never over anything per-process: two workers
    must key the same artifact the same way."""
    conn = _conn(tmp_path)
    policy.set_field(conn, "process_kpis", True)
    v = policy.version(conn)
    other = db.connect(tmp_path / "app.db")
    assert policy.version(other) == v
    assert len(v) == 16 and all(c in "0123456789abcdef" for c in v)


def test_the_write_opens_no_transaction(tmp_path):
    conn = _conn(tmp_path)
    policy.set_field(conn, "process_kpis", True)
    assert not conn.in_transaction


# --- Additional tests, written after mutation testing the implementation ---
# (see task-4-report.md for the full mutation table). The brief's nine tests
# left several mutants alive; these close the gaps.


def test_set_field_does_not_touch_any_other_fields_row(tmp_path):
    """A `set_field` that writes without a `WHERE`/conflict target on `field`
    would rewrite every row to the same value. Seeding two fields first is
    what makes this test able to see that — asserting on just one field is
    structurally blind to a whole-table write."""
    conn = _conn(tmp_path)
    policy.set_field(conn, "node_actor", False)
    policy.set_field(conn, "node_icom", True)
    got = policy.current(conn)
    assert got["node_actor"] is False
    assert got["node_icom"] is True
    # Nothing else was ever written, so the rest must still be the defaults.
    assert got["process_summary"] is False
    assert got["process_idef0"] is False
    assert got["process_kpis"] is False
    assert got["node_description"] is True
    rows = conn.execute(
        "SELECT field, visible FROM visibility_policy ORDER BY field").fetchall()
    assert [(r["field"], r["visible"]) for r in rows] == [
        ("node_actor", 0), ("node_icom", 1)]


def test_current_returns_python_bools_not_sqlite_ints(tmp_path):
    """SQLite has no boolean type; `bool(0)`/`bool(1)` must happen in
    `current`, or a `0`/`1` leaks out as an `int` and `is True`/`is False`
    checks elsewhere in the codebase silently stop working."""
    conn = _conn(tmp_path)
    policy.set_field(conn, "node_actor", False)
    got = policy.current(conn)
    for value in got.values():
        assert value is True or value is False


def test_defaults_match_d17_independently_transcribed(tmp_path):
    """Transcribed from D17 independently of the implementation, per the
    project's own warning that a test which reads its expected value from the
    code under test cannot catch a transcription error in that code."""
    d17 = {
        "process_summary": False,
        "process_idef0": False,
        "process_kpis": False,
        "node_description": True,
        "node_actor": True,
        "node_icom": False,
    }
    assert policy.DEFAULTS == d17


def test_version_is_16_lowercase_hex_chars_at_the_defaults(tmp_path):
    conn = _conn(tmp_path)
    v = policy.version(conn)
    assert isinstance(v, str)
    assert len(v) == 16
    assert all(c in "0123456789abcdef" for c in v)


def test_version_does_not_change_when_a_field_is_set_to_its_current_value(tmp_path):
    """Setting a field to the value it already has changes nothing a reader
    can see, so the version — a digest of the policy, not a log of writes —
    must not move."""
    conn = _conn(tmp_path)
    before = policy.version(conn)
    # node_actor's default is True; setting it to True writes a row but
    # changes no observable value.
    policy.set_field(conn, "node_actor", True)
    assert policy.version(conn) == before


def test_version_is_consistent_with_current_across_many_flips(tmp_path):
    """Guards against an iteration-order-dependent digest: two connections
    that reach the same `current()` after different sequences of flips must
    still agree on `version()`."""
    conn_a = _conn(tmp_path / "a")
    conn_b = _conn(tmp_path / "b")

    for field, value in [
        ("process_summary", True), ("node_icom", True),
        ("process_kpis", True), ("node_actor", False),
    ]:
        policy.set_field(conn_a, field, value)

    for field, value in [
        ("node_actor", False), ("process_kpis", True),
        ("node_icom", True), ("process_summary", True),
    ]:
        policy.set_field(conn_b, field, value)

    assert policy.current(conn_a) == policy.current(conn_b)
    assert policy.version(conn_a) == policy.version(conn_b)
