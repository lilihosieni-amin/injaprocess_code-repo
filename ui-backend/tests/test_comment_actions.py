"""The comment actions (addendum D63, D68, D69, D72, D73): approve with an
optional note, reject with a reason, edit, withdraw, address; the badge; and a
user change that strands a waiting comment moves it on.

`people` (conftest) is the shared cast of test_comments_api.py.
"""
import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import audit_events as _events

PW = "test-password"


@pytest.fixture
def second_admin(people):
    """Another `*` Admin, signed in over the same app and databases."""
    conn = db.connect(people["admin"].app_db)
    try:
        rid = conn.execute("SELECT id FROM roles WHERE name = 'admin'").fetchone()[0]
        uid = users.create(conn, username="09159999999", display_name="admin2",
                           password_hash=hash_password(PW), role_id=rid,
                           supervisor_id=None, can_supervise=False)
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, '*')", (uid,))
    finally:
        conn.close()
    client = TestClient(people["admin"].app, base_url="https://testserver")
    r = client.post("/api/auth/login", json={"username": "09159999999", "password": PW})
    assert r.status_code == 200, r.text
    return client


def _user_id(people, name: str) -> int:
    conn = db.connect(people[name].app_db)
    try:
        return conn.execute("SELECT id FROM users WHERE display_name = ?",
                            (name,)).fetchone()[0]
    finally:
        conn.close()


def _role_id(people, name: str) -> int:
    conn = db.connect(people["editor"].app_db)
    try:
        return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]
    finally:
        conn.close()


def _new(people, who="viewer"):
    return people[who].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "x"}).json()["id"]


def test_the_whole_chain_with_notes(people):
    cid = _new(people)
    r = people["head"].post(f"/api/comments/{cid}/approve", json={"note": "درست است"})
    assert r.json()["waitingWith"] == {"kind": "pool"}
    r = people["admin"].post(f"/api/comments/{cid}/approve", json={"note": "فوری"})
    assert r.json()["state"] == "approved"
    c = people["editor"].get(f"/api/comments/{cid}").json()
    assert c["text"] == "x"
    assert [n["text"] for n in c["notes"]] == ["درست است", "فوری"]
    assert len(_events(people["editor"], "comment.noted")) == 2
    assert len(_events(people["editor"], "comment.approved")) == 2
    r = people["editor"].post(f"/api/comments/{cid}/address", json={"note": "اصلاح شد"})
    assert r.json()["state"] == "addressed"
    assert _events(people["editor"], "comment.addressed")[-1]["target"] == cid
    # each person's kind is snapshotted onto their event (D62); system moves have none
    trail = r.json()["trail"]
    assert [(t["kind"], t["role"]) for t in trail] == [
        ("submitted", "reader"), ("assigned", "reader"), ("approved", "reader"),
        ("pooled", None), ("approved", "admin"), ("addressed", "editor")]
    assert r.json()["author"]["role"] == "reader"


def test_an_empty_note_is_no_note(people):
    cid = _new(people)
    people["head"].post(f"/api/comments/{cid}/approve", json={"note": "  "})
    assert people["head"].get(f"/api/comments/{cid}").json()["notes"] == []
    assert _events(people["head"], "comment.noted") == []


def test_a_note_over_the_cap_is_refused(people):
    cid = _new(people)
    r = people["head"].post(f"/api/comments/{cid}/approve", json={"note": "a" * 2001})
    assert r.status_code == 422
    assert people["head"].get(f"/api/comments/{cid}").json()["state"] == "awaiting"


def test_only_the_named_hop_may_approve(people):
    cid = _new(people)
    r = people["admin"].post(f"/api/comments/{cid}/approve", json={})
    assert r.status_code == 403                         # admin sees it, cannot act yet
    assert _events(people["admin"], "access.denied")[-1]["target"] == cid
    assert people["other"].post(f"/api/comments/{cid}/approve", json={}).status_code == 404


def test_the_editor_cannot_act_in_the_pool(people):
    cid = _new(people)
    people["head"].post(f"/api/comments/{cid}/approve", json={})
    assert people["editor"].post(f"/api/comments/{cid}/approve", json={}).status_code == 403
    assert people["editor"].post(f"/api/comments/{cid}/address", json={}).status_code == 403


def test_reject_needs_a_reason_and_closes(people):
    cid = _new(people)
    r = people["head"].post(f"/api/comments/{cid}/reject", json={"reason": " "})
    assert r.status_code == 422
    r = people["head"].post(f"/api/comments/{cid}/reject", json={"reason": "تکراری"})
    assert (r.json()["state"], r.json()["rejectReason"]) == ("rejected", "تکراری")
    assert people["viewer"].put(f"/api/comments/{cid}", json={"text": "y"}).status_code == 403
    assert people["viewer"].post(f"/api/comments/{cid}/withdraw").status_code == 403


def test_edit_restarts_and_is_barred_after_an_approval(people):
    cid = _new(people)
    r = people["viewer"].put(f"/api/comments/{cid}", json={"text": "تازه"})
    assert (r.json()["text"], r.json()["waitingWith"]["name"]) == ("تازه", "head")
    people["head"].post(f"/api/comments/{cid}/approve", json={})
    assert people["viewer"].put(f"/api/comments/{cid}", json={"text": "z"}).status_code == 403


def test_withdraw(people):
    cid = _new(people)
    assert people["viewer"].post(f"/api/comments/{cid}/withdraw").json()["state"] == "withdrawn"
    assert _events(people["viewer"], "comment.withdrawn")[-1]["target"] == cid


def test_two_admins_racing_only_one_wins(people, second_admin):
    cid = _new(people)
    people["head"].post(f"/api/comments/{cid}/approve", json={})
    assert people["admin"].post(f"/api/comments/{cid}/approve", json={}).status_code == 200
    assert second_admin.post(f"/api/comments/{cid}/approve", json={}).status_code == 403


def test_the_badge(people):
    _new(people)
    assert people["head"].get("/api/auth/me").json()["pendingApprovals"] == 1
    assert people["viewer"].get("/api/auth/me").json()["pendingApprovals"] == 0


def test_disabling_the_supervisor_moves_the_comment(people):
    cid = _new(people)
    head_id = _user_id(people, "head")
    r = people["editor"].post(f"/api/users/{head_id}/disabled", json={"disabled": True})
    assert r.status_code == 200, r.text
    c = people["admin"].get(f"/api/comments/{cid}").json()
    assert c["waitingWith"] == {"kind": "pool"}
    # the role is merged beside the reason, never in place of it
    skipped = [t for t in c["trail"] if t["kind"] == "skipped"]
    assert [(t["reason"], t["role"]) for t in skipped] == [("disabled", "reader")]


def test_a_failing_reconcile_never_loses_the_user_change(people, monkeypatch):
    from inja_ui_backend import comment_rules

    def boom(*a, **k):
        raise RuntimeError("comments.db locked")

    monkeypatch.setattr(comment_rules, "reconcile", boom)
    r = people["editor"].post(f"/api/users/{_user_id(people, 'head')}/disabled",
                              json={"disabled": True})
    assert r.status_code == 200, r.text
    assert [e["target"] for e in _events(people["editor"], "user.disabled")] == ["09150000003"]


def test_promoting_the_supervisor_moves_the_comment(people):
    cid = _new(people)
    r = people["editor"].patch(f"/api/users/{_user_id(people, 'head')}",
                               json={"roleId": _role_id(people, "admin")})
    assert r.status_code == 200, r.text
    assert people["admin"].get(f"/api/comments/{cid}").json()["waitingWith"] == {"kind": "pool"}
