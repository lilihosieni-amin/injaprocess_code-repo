"""Confirming and withdrawing (spec D20, D61, §11 test 16's shape)."""
import itertools
import json
import time

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()


def _proc(pid: str, dept: str) -> dict:
    return {
        "id": pid, "department": dept, "name": "پذیرایی", "summary": "خلاصه",
        "source": {"type": "manual", "ref": None, "run": None}, "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [],
        "nodes": [{"id": f"{pid}-n010", "type": "activity", "label": "کار",
                   "description": "", "actor": "", "subprocess": None,
                   "icom": {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []},
                   "position": {"x": 60, "y": 60}, "layout": "auto",
                   "source": {"created_by": "ui", "touched_by": []}}],
        "edges": [], "pending": [],
    }


@pytest.fixture
def corpus(data_root):
    base = data_root / "departments" / "dining"
    for pid in ("dining-001", "dining-002"):
        (base / "processes" / f"{pid}.json").write_text(
            json.dumps(_proc(pid, "dining"), ensure_ascii=False), encoding="utf-8")
    tomb = _proc("dining-003", "dining")
    tomb["tombstoned"] = True
    tomb["superseded_by"] = []
    (base / "processes" / "dining-003.json").write_text(
        json.dumps(tomb, ensure_ascii=False), encoding="utf-8")
    (base / "overview.json").write_text(json.dumps(
        {"department": "dining", "name": "سالن", "description": "شرح",
         "sub_units": [], "personnel": [],
         "updated_at": "2026-07-06T10:00:00Z"}, ensure_ascii=False),
        encoding="utf-8")
    return data_root


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0914{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"cnf-{n}.db")
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


def _events(client, action):
    conn = db.connect(client.app_db)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, target, outcome, detail, session_id"
            " FROM audit_events WHERE action = ? ORDER BY id", (action,))]
    finally:
        conn.close()


def _row(client, target):
    body = client.get("/api/confirmations?department=dining").json()
    return next(r for r in body if r["target"] == target)


# --- the listing hands out the fingerprint the POST has to echo ---

def test_the_listing_names_every_confirmable_target_and_none_confirmed_yet(corpus,
                                                                          tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    body = client.get("/api/confirmations?department=dining").json()
    assert {r["target"] for r in body} == {"dining", "dining-001", "dining-002"}
    # The tombstone is absent: it is excluded entirely (D17), so confirming it
    # would vouch for a document no reader can ever be served.
    assert "dining-003" not in {r["target"] for r in body}
    assert {r["kind"] for r in body} == {"department", "process"}
    assert all(r["confirmed"] is False for r in body)
    assert all(len(r["fingerprint"]) == 64 for r in body)


def test_the_listing_hands_out_the_documents_current_fingerprint(corpus, tmp_path):
    """Computed server-side and echoed by the client, so the definition of a
    confirmation exists in exactly one language."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    doc = json.loads((corpus / "departments/dining/processes/dining-001.json")
                     .read_text(encoding="utf-8"))
    assert _row(client, "dining-001")["fingerprint"] == fingerprint(doc)


def test_the_listing_survives_a_department_with_processes_and_no_overview(data_root,
                                                                          tmp_path):
    """`logistics` gets a process below but no `overview.json` — the same gap
    `test_departments.py` pins for it directly. The department row is only
    built `if overview.is_file()`; every other department this file ever asks
    about (`dining`, `cooking`, via the `corpus` fixture) has one, so that
    guard's absence would be invisible to the rest of the suite. Without it
    this is an unhandled `FileNotFoundError` — a 500 from a route that is
    already behind the `confirm` gate.
    """
    (data_root / "departments" / "logistics" / "processes" / "logistics-001.json"
     ).write_text(json.dumps(_proc("logistics-001", "logistics"), ensure_ascii=False),
                 encoding="utf-8")
    client = _client_as(data_root, tmp_path, "editor", "dept:logistics")
    r = client.get("/api/confirmations?department=logistics")
    assert r.status_code == 200
    assert [row["target"] for row in r.json()] == ["logistics-001"]


# --- confirming ---

def test_confirming_records_who_and_what(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining-001")["fingerprint"]
    before = time.time()
    r = client.post("/api/confirmations/dining-001", json={"fingerprint": fp})
    after = time.time()
    assert r.status_code == 200
    assert r.json()["confirmed"] is True
    assert r.json()["confirmed_by"] == client.username
    # `confirmed_at` is part of the row shape the brief specifies and a later
    # task renders it; a stamp from the moment of the write, not `None` and not
    # the epoch, is what makes it worth having.
    assert r.json()["confirmed_at"] is not None
    assert before - 1 <= r.json()["confirmed_at"] <= after + 1
    assert _row(client, "dining-001")["confirmed"] is True

    events = _events(client, "confirmation.set")
    assert len(events) == 1
    assert events[0]["actor"] == client.username
    assert events[0]["target"] == "dining-001"
    # `ok`, because the write succeeded. Asserted rather than left to the
    # column's default: an event that records a refusal as a success, or a
    # success as a refusal, is a record that answers "who vouched for this?"
    # wrongly — and nothing else in the suite reads this column.
    assert events[0]["outcome"] == "ok"
    assert json.loads(events[0]["detail"])["fingerprint"] == fp
    # These are the first content-mutating audit events in the service, and
    # tying a confirmation to the session that made it is what the audit
    # decisions buy — the same hole the `outcome` column was in one fix ago.
    assert events[0]["session_id"] is not None


def test_a_department_overview_is_confirmed_the_same_way(corpus, tmp_path):
    """D61 — both apply to either target, which is exactly why the events are
    `confirmation.set`/`confirmation.revoked` and not `process.confirmed`: the
    latter cannot describe confirming a department overview."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining")["fingerprint"]
    assert client.post("/api/confirmations/dining",
                       json={"fingerprint": fp}).status_code == 200
    events = _events(client, "confirmation.set")
    assert events[0]["target"] == "dining"
    # `kind` in the detail has to come from the target's own shape
    # (`_kind`), not a value that happens to be right for every process this
    # file otherwise confirms — a department target is `"department"`, never
    # `"process"`.
    assert json.loads(events[0]["detail"])["kind"] == "department"


def test_confirming_a_fingerprint_that_is_not_the_current_one_is_refused(corpus,
                                                                        tmp_path):
    """A confirmation vouches for the exact bytes an Editor read (D20). If the
    document moved under them — a pipeline run, another Editor's Save — the mark
    they are about to set would describe a document nobody has reviewed."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    r = client.post("/api/confirmations/dining-001", json={"fingerprint": "0" * 64})
    assert r.status_code == 409
    assert _row(client, "dining-001")["confirmed"] is False
    # Refused before anything was written, so there is no event either.
    assert _events(client, "confirmation.set") == []


def test_re_confirming_after_an_edit_replaces_the_mark(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    first = _row(client, "dining-001")["fingerprint"]
    client.post("/api/confirmations/dining-001", json={"fingerprint": first})

    path = corpus / "departments/dining/processes/dining-001.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][0]["label"] = "کار تازه"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    row = _row(client, "dining-001")
    assert row["confirmed"] is False and row["fingerprint"] != first
    client.post("/api/confirmations/dining-001",
                json={"fingerprint": row["fingerprint"]})
    assert _row(client, "dining-001")["confirmed"] is True
    conn = db.connect(client.app_db)
    try:
        assert conn.execute("SELECT COUNT(*) FROM confirmations"
                            " WHERE target='dining-001'").fetchone()[0] == 1
    finally:
        conn.close()


def test_a_tombstoned_target_cannot_be_confirmed(corpus, tmp_path):
    """The listing excludes a tombstone (D17) precisely so nobody ever vouches
    for a document no reader can be served — `list_confirmations`'s own
    comment says so. The write side has to agree: an Editor who already knows
    a tombstoned id (from an earlier listing, before it was retired) must not
    be able to confirm what the listing was built to keep unconfirmable.

    403, not 404: `dining-003` is on disk and in scope — `confirm` is never
    granted without `edit` (`seed._EDITOR`), so this same Editor may already
    read it whole from `GET /api/processes/dining-003`. What they may not do
    is vouch for it, which is "can see the target but may not do this to it" —
    403's definition in `access.py`'s partition, not 404's.
    """
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    tomb = json.loads((corpus / "departments/dining/processes/dining-003.json")
                      .read_text(encoding="utf-8"))
    fp = fingerprint(tomb)
    r = client.post("/api/confirmations/dining-003", json={"fingerprint": fp})
    assert r.status_code == 403
    assert _events(client, "confirmation.set") == []
    # Withdrawing agrees too: there is nothing on this target for an Editor to
    # act on either way.
    assert client.delete("/api/confirmations/dining-003").status_code == 403


def test_a_live_document_is_still_confirmable(corpus, tmp_path):
    """Regression pin for the fix above: the new 403 is for tombstones
    specifically, and `_load` must not have grown a blanket refusal."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining-001")["fingerprint"]
    assert client.post("/api/confirmations/dining-001",
                       json={"fingerprint": fp}).status_code == 200


# --- withdrawing (D61) ---

def test_withdrawing_emits_revoked_and_not_invalidated(corpus, tmp_path):
    """D61 — withdrawing is deliberate and gets its own event.

    `confirmation.invalidated` is what happens when content changes and the
    fingerprint stops matching. Same visible outcome, different fact, and the
    record has to be able to tell 'the editor decided this was wrong' from 'a
    pipeline run touched it'. Nothing here may emit the second.
    """
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining-001")["fingerprint"]
    client.post("/api/confirmations/dining-001", json={"fingerprint": fp})

    r = client.delete("/api/confirmations/dining-001")
    assert r.status_code == 200 and r.json()["confirmed"] is False
    revoked = _events(client, "confirmation.revoked")
    assert len(revoked) == 1
    assert revoked[0]["actor"] == client.username
    assert revoked[0]["target"] == "dining-001"
    assert revoked[0]["outcome"] == "ok"
    assert revoked[0]["session_id"] is not None
    # `detail=` is not optional decoration: dropping it from the write leaves
    # nothing here to notice, since every other assertion in this file about a
    # `confirmation.revoked` row reads `target`, not `detail`.
    assert json.loads(revoked[0]["detail"])["kind"] == "process"
    assert _events(client, "confirmation.invalidated") == []


def test_withdrawing_something_that_was_never_confirmed_records_nothing(corpus,
                                                                        tmp_path):
    """A decision nobody made must not appear in the record."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    assert client.delete("/api/confirmations/dining-002").status_code == 200
    assert _events(client, "confirmation.revoked") == []


# --- the gate ---

def test_an_admin_may_not_confirm_though_they_can_see_the_department(corpus,
                                                                     tmp_path):
    """403, not 404: an Admin holds `view` on dining, so the resource is one they
    can already see and the refusal is about the action (D56)."""
    client = _client_as(corpus, tmp_path, "admin", "dept:dining")
    r = client.post("/api/confirmations/dining-001", json={"fingerprint": "a" * 64})
    assert r.status_code == 403
    assert client.get("/api/confirmations?department=dining").status_code == 403


def test_a_target_in_another_department_is_404_whether_it_exists_or_not(corpus,
                                                                       tmp_path):
    """The gate is lexical, so a real target and an invented one answer alike."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    for target in ("cooking-001", "cooking-999", "cooking"):
        r = client.post(f"/api/confirmations/{target}", json={"fingerprint": "a" * 64})
        assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND}), target
        assert client.delete(f"/api/confirmations/{target}").status_code == 404
    assert client.get("/api/confirmations?department=cooking").status_code == 404


def test_a_caller_refused_by_both_halves_is_404_and_never_403(corpus, tmp_path):
    """Out of scope **and** without the capability: the 404 has to win.

    Every other out-of-scope case in this file uses an Editor, who holds
    `confirm` — so scope is the only thing that can refuse them, and both orders
    of the gate's two checks answer 404. That is exactly the blind spot
    `access.requires`' docstring names, and it is why these three routes are
    pinned here as well as in the endpoint matrix: check capability first and an
    Admin scoped to `dining` asking about `cooking` is answered 403, which says
    *"this exists, but not for you"* about a department they were never to learn
    of. Paired with
    `test_an_admin_may_not_confirm_though_they_can_see_the_department`, which is
    the same Admin inside their own department getting the 403 that is due.
    """
    client = _client_as(corpus, tmp_path, "admin", "dept:dining")
    assert client.get("/api/confirmations?department=cooking").status_code == 404
    r = client.post("/api/confirmations/cooking-001", json={"fingerprint": "a" * 64})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    assert client.delete("/api/confirmations/cooking-001").status_code == 404


def test_a_malformed_target_reaches_nothing_even_for_a_wildcard_holder(corpus,
                                                                       tmp_path):
    """`dining-001-x` derives `dept:dining-001`, which the grammar refuses — so
    who holds `*` must not be readable from which status a nonsense target gets."""
    client = _client_as(corpus, tmp_path, "editor", "*")
    assert client.post("/api/confirmations/dining-001-x",
                       json={"fingerprint": "a" * 64}).status_code == 404
    assert client.get("/api/confirmations").status_code == 404          # no department
    assert client.get("/api/confirmations?department=").status_code == 404


def test_confirming_a_process_that_is_not_on_disk_is_the_uniform_404(corpus,
                                                                    tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    r = client.post("/api/confirmations/dining-404", json={"fingerprint": "a" * 64})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})


def test_a_duplicated_department_parameter_cannot_desync_the_gate_from_the_listing(
        corpus, tmp_path):
    """The gate (`_query_scope`) and the handler (`list_confirmations`) both
    read `request.query_params.get("department", "")` — that is what keeps
    them agreeing on which target was gated and which was listed. Starlette's
    `QueryParams.get` keeps the *last* occurrence of a repeated key
    (`ImmutableMultiDict` builds `self._dict` from `{k: v for k, v in items}`,
    so a later `department=` simply overwrites an earlier one).

    Put the department the caller is scoped to *last*, so the gate reads it
    and passes. If the handler ever read a *different* occurrence — the first,
    say, via `getlist("department")[0]` — it would list a department the gate
    never checked: a caller scoped to `dept:dining` alone would gate on
    `dining` and be handed `cooking`'s rows.
    """
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    r = client.get("/api/confirmations?department=cooking&department=dining")
    assert r.status_code == 200
    assert {row["target"] for row in r.json()} == {"dining", "dining-001", "dining-002"}
