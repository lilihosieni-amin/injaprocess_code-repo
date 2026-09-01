"""The policy surface (spec D16, D19)."""
import itertools
import json

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import policy, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0915{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"vis-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        for s in scopes:
            conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                         (uid, s))
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    assert client.post("/api/auth/login",
                       json={"username": username, "password": PW}).status_code == 200
    client.username = username
    client.app_db = cfg.app_db
    return client


def _every_department(data_root) -> list[str]:
    """Every department code the registry knows, read where the router reads it.

    `routers/departments.py` resolves the department list from
    `storage.registry_path(cfg.data_root)` at request time, and `data_root`'s own
    fixture seeds that exact file from `tests/fixtures/registry.json` — so this
    is the live enumeration and not a second list, kept by hand, that could
    silently stop matching it.
    """
    reg = json.loads((data_root / "departments" / "registry.json")
                     .read_text(encoding="utf-8"))
    return [d["code"] for d in reg["departments"]]


def _events(client):
    conn = db.connect(client.app_db)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, target, detail, outcome, session_id"
            " FROM audit_events"
            " WHERE action = 'visibility.policy.changed' ORDER BY id")]
    finally:
        conn.close()


def test_the_policy_reads_back_d17s_defaults(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    body = client.get("/api/visibility").json()
    assert body["fields"] == {
        "process_summary": False, "process_idef0": False, "process_kpis": False,
        "node_description": True, "node_actor": True, "node_icom": False,
        # QF-26's six, defaulting **shown**: they govern the admin's facts view,
        # which is not the reader view D17's column is written about.
        "fact_items": True, "fact_records": True, "fact_measurements": True,
        "fact_rules": True, "fact_notes": True, "fact_sources": True,
    }
    assert len(body["version"]) == 16


def test_reading_the_policy_writes_no_event(data_root, tmp_path):
    """A GET is a read, and D19's record is for changes. An event written on
    every read would fill the audit log with changes that never happened —
    "someone changed the policy" for every screen that merely opened it."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    assert client.get("/api/visibility").status_code == 200
    assert client.get("/api/visibility").status_code == 200
    assert _events(client) == []


def test_changing_a_field_changes_the_policy_and_the_version(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    before = client.get("/api/visibility").json()
    r = client.put("/api/visibility/node_actor", json={"visible": False})
    assert r.status_code == 200
    assert r.json()["fields"]["node_actor"] is False
    assert r.json()["version"] != before["version"]
    assert client.get("/api/visibility").json() == r.json()


def test_the_event_carries_the_actor_the_field_and_both_values(data_root, tmp_path):
    """D19, in as many words: the actor, the field, and **both** values.

    Both, because 'someone changed node_actor' does not say whether the
    restaurant's internal actor names started or stopped being published — which
    is the only thing anyone reading the record wants to know.
    """
    client = _client_as(data_root, tmp_path, "editor", "*")
    client.put("/api/visibility/process_summary", json={"visible": True})
    events = _events(client)
    assert len(events) == 1
    assert events[0]["actor"] == client.username
    assert events[0]["target"] == "process_summary"
    detail = json.loads(events[0]["detail"])
    assert detail == {"field": "process_summary", "before": False, "after": True}


def test_setting_a_field_to_the_value_it_already_has_is_still_recorded(data_root,
                                                                      tmp_path):
    """An act taken is an act recorded. `before == after` in the detail says what
    happened without the reader having to infer it from silence."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    client.put("/api/visibility/node_actor", json={"visible": True})
    detail = json.loads(_events(client)[0]["detail"])
    assert detail == {"field": "node_actor", "before": True, "after": True}


def test_an_unknown_field_is_the_uniform_404(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.put("/api/visibility/node_kpis", json={"visible": True})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    # A node has no KPIs (D17), so there is nothing to switch — and nothing was
    # recorded about a change that did not happen.
    assert _events(client) == []


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin"])
def test_only_a_holder_of_set_visibility_reaches_it(data_root, tmp_path, role):
    """403 rather than 404: `*` is a scope every one of these callers holds here,
    so the resource is one they can see and the refusal is about the action."""
    client = _client_as(data_root, tmp_path, role, "*")
    assert client.get("/api/visibility").status_code == 403
    assert client.put("/api/visibility/node_actor",
                      json={"visible": False}).status_code == 403


def test_a_department_scoped_editor_cannot_change_the_global_policy(data_root,
                                                                    tmp_path):
    """404 — `*` is outside their scope, and one global policy means the answer
    cannot depend on which department they run. A gate on `dept:{code}` would let
    that department's head decide what every other department publishes.

    The caller holds **every** department there is, and not `*` — not one
    department picked at random. A caller scoped to `dept:dining` alone would
    still read 404 if the route were gated on `dept:cooking` instead of `*`: the
    caller is outside that target too, for the wrong reason, and the test would
    pass over a mutant it was written to catch. Holding every `dept:{code}`
    scope closes that gap for all nine at once — whichever department a broken
    gate names, this caller holds it, so only a gate that is truly `*` still
    answers 404 here.
    """
    depts = _every_department(data_root)
    client = _client_as(data_root, tmp_path, "editor",
                        *(f"dept:{code}" for code in depts))
    r = client.put("/api/visibility/node_actor", json={"visible": False})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    assert client.get("/api/visibility").status_code == 404


def test_the_policy_reaches_the_filter(data_root, tmp_path):
    """The endpoint is not a settings screen with nothing behind it (D16, D18):
    one switch, and every non-editor's body changes."""
    editor = _client_as(data_root, tmp_path, "editor", "*")
    stored = policy.current(db.connect(editor.app_db))
    assert stored["node_actor"] is True
    editor.put("/api/visibility/node_actor", json={"visible": False})
    assert policy.current(db.connect(editor.app_db))["node_actor"] is False


# --- Additional tests, written after mutation-testing the implementation ---
# (see task-9-report.md for the full table). The brief's ten tests left five
# mutants alive; these close four of them, and the fifth — the gate keyed on
# `edit` or `confirm` instead of `set_visibility` — is closed by
# `test_endpoint_matrix.py::test_a_role_holding_every_other_capability_is_403`,
# which is where the role that differs on exactly one capability is built.


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin"])
def test_a_caller_refused_by_both_halves_is_404_and_never_403(data_root, tmp_path,
                                                              role):
    """Scope is checked **before** capability, and this is the only shape of
    caller that can tell.

    `test_a_department_scoped_editor_cannot_change_the_global_policy` above uses
    an Editor, who *holds* `set_visibility` — so both orders answer them 404 and
    a gate that asked for the capability first survives it untouched. These
    callers are refused by both halves at once, and only the order decides which
    refusal they are told about: capability-first says 403, which tells someone
    404'd out of every global setting that there is a global setting.

    Paired with `test_only_a_holder_of_set_visibility_reaches_it` above, which is
    the same three roles at `*` being told 403 — so neither test can be satisfied
    by a gate that answers one status to everybody.
    """
    client = _client_as(data_root, tmp_path, role, "dept:dining")
    for r in (client.get("/api/visibility"),
              client.put("/api/visibility/node_actor", json={"visible": False})):
        assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND}), (
            f"a {role} outside `*` and without `set_visibility` was answered"
            f" {r.status_code}: the gate is asking for the capability before the"
            f" scope, and the 403 says the target exists")


def test_the_record_names_the_session_and_says_the_act_succeeded(data_root,
                                                                 tmp_path):
    """Two columns the route writes that nothing else here reads.

    `session_id` is what ties a change to one sign-in of one account — D41's
    record is "who, from where, in which session", and an event carrying `None`
    where the session belongs is a change nobody can trace to a login. `outcome`
    is `ok` because the switch really moved: a route that recorded every write
    as `failed` would leave an activity log in which nothing ever worked, and no
    other assertion in this file looks at it.
    """
    client = _client_as(data_root, tmp_path, "editor", "*")
    assert client.put("/api/visibility/node_icom",
                      json={"visible": True}).status_code == 200
    event = _events(client)[0]
    assert event["outcome"] == "ok"
    assert event["session_id"], (
        "the change was recorded without the session that made it")
    # …and it is the session the caller is actually holding, not a placeholder.
    conn = db.connect(client.app_db)
    try:
        live = {r["id"] for r in conn.execute(
            "SELECT id FROM sessions WHERE revoked_at IS NULL")}
    finally:
        conn.close()
    assert event["session_id"] in live


def test_the_switch_is_stored_before_it_is_recorded_and_opens_no_transaction(
        data_root, tmp_path):
    """Order, and the shared-connection invariant, in one trace.

    **Order**, because an event written first is an event that claims a change
    which the very next statement may fail to make: the record would say the
    policy moved while the table still held the old value, and the audit log —
    the only place D19 puts this — would be the thing that is wrong. Nothing
    else in this file can see the difference: both orders leave the same row and
    the same event behind when the write succeeds, which it always does here.

    **No transaction**, because `db.connect`'s invariant is that one connection
    is shared across FastAPI's threadpool and is safe only while every handler
    is a single autocommitted statement. A *balanced* `BEGIN`/`COMMIT` breaks it
    exactly as much as a stray one — the second worker to arrive either raises
    "cannot start a transaction within a transaction" or has its half-written
    work committed by this one — and `conn.in_transaction` is False by the time
    any assertion could look.

    What this does **not** prove, and cannot: `store.policy.set_field` reads the
    old value and writes the new one in two statements, so two Editors flipping
    the same switch at the same instant can both read the same `before` and
    write two events that disagree with what each of them replaced. Returning
    the previous value from the write narrows that window; only a transaction
    would close it, and a transaction here is the invariant above. The stored
    policy is still whichever write landed last.
    """
    client = _client_as(data_root, tmp_path, "editor", "*")
    conn = client.app.state.db
    statements: list[str] = []
    conn.set_trace_callback(statements.append)
    try:
        assert client.put("/api/visibility/process_idef0",
                          json={"visible": True}).status_code == 200
    finally:
        conn.set_trace_callback(None)

    assert statements, "the trace callback saw nothing; this test proves nothing"
    sql = [" ".join(s.split()) for s in statements]
    stored = [i for i, s in enumerate(sql) if "INSERT INTO visibility_policy" in s]
    recorded = [i for i, s in enumerate(sql) if "INSERT INTO audit_events" in s]
    assert len(stored) == 1, f"the switch was written {len(stored)} times: {sql}"
    assert len(recorded) == 1, f"the change was recorded {len(recorded)} times: {sql}"
    assert stored[0] < recorded[0], (
        "the event was written before the switch: a failed write would leave a"
        " record saying the policy moved when it did not")

    opened = [s for s in sql if s.upper().startswith(
        ("BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE"))]
    assert opened == [], (
        f"this handler opened a transaction on the shared connection: {opened}")
    assert conn.in_transaction is False


def test_undoing_a_switch_gives_back_the_version_it_had(data_root, tmp_path):
    """The version is a **digest of the policy**, never a counter of changes.

    D27 keys the report cache on it, so what it has to answer is "which policy
    was this artifact built under" — and a switch turned off and back on is the
    policy it started as. A counter would answer "how many times has anyone
    touched this", and every department's report would be rebuilt for a change
    that changed nothing a reader can see.

    `test_changing_a_field_changes_the_policy_and_the_version` above only asks
    that the version *moves*, which a counter does too.
    """
    client = _client_as(data_root, tmp_path, "editor", "*")
    start = client.get("/api/visibility").json()["version"]
    off = client.put("/api/visibility/node_actor", json={"visible": False}).json()
    assert off["version"] != start  # premise
    back = client.put("/api/visibility/node_actor", json={"visible": True}).json()
    assert back["version"] == start, (
        "undoing a switch left a different version behind: the version is"
        " counting changes rather than describing the policy")

    # …and setting a field to the value it already holds moves nothing, though
    # it is still recorded (see the event test above).
    again = client.put("/api/visibility/node_actor", json={"visible": True}).json()
    assert again == back
