"""The department and comment reports, and D44's scope rule (addendum D83;
§11 test 28): a scoped `view_audit` holder sees content for their departments
and no access or governance events; a `*` holder sees both."""
import json
import time

from inja_ui_backend import db
from inja_ui_backend.store import audit


def _uid(people, name):
    conn = db.connect(people["editor"].app_db)
    try:
        return conn.execute("SELECT id FROM users WHERE display_name = ?",
                            (name,)).fetchone()[0]
    finally:
        conn.close()


def _add_unconfirmed_process(data_root, pid, name):
    """A second cooking process, never confirmed — servable to the Editor
    (D22 exempts them) and to nobody else, unlike the fixture's cooking-001."""
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    doc["name"] = name
    (data_root / "departments" / "cooking" / "processes" / f"{pid}.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def test_readership_counts_views_readers_and_the_top_process(people):
    people["viewer"].get("/api/processes/cooking-001")
    people["viewer"].get("/api/departments/cooking/overview")
    people["other"].get("/api/processes/cooking-001")
    rows = people["editor"].get("/api/activity/departments").json()
    cooking = next(r for r in rows if r["code"] == "cooking")
    assert cooking["views"] == 3 and cooking["readers"] == 2 and cooking["downloads"] == 0
    assert cooking["topProcess"]["id"] == "cooking-001" and cooking["lastViewed"]
    assert len(rows) == 9


def test_comment_flow_shows_the_holder_and_never_the_text(people):
    text = "متن خصوصی کامنت"
    r = people["viewer"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": text})
    assert r.status_code == 201
    res = people["editor"].get("/api/activity/comments")
    row = res.json()[0]
    assert row["state"] == "awaiting" and row["stage"] == "reader"
    assert row["holder"] == "head" and row["waitingSince"]
    assert text not in res.text


def test_a_scoped_admin_sees_only_their_departments(people):
    people["viewer"].get("/api/processes/cooking-001")
    people["viewer"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "x"})
    depts = people["cadmin"].get("/api/activity/departments").json()
    assert [r["code"] for r in depts] == ["cashier"]
    assert people["cadmin"].get("/api/activity/comments").json() == []
    summary = people["cadmin"].get("/api/activity/summary").json()
    assert summary["activeUsers"] is None and summary["failedSignIns"] is None
    assert summary["views"] == 0


def test_a_star_holder_sees_every_number(people):
    summary = people["admin"].get("/api/activity/summary").json()
    assert summary["activeUsers"] == 7 and summary["failedSignIns"] == 0


def test_a_reader_is_404_everywhere(people):
    for path in ("/api/activity/departments", "/api/activity/comments",
                 "/api/activity/summary"):
        assert people["head"].get(path).status_code == 404


def test_an_unconfirmed_process_never_surfaces_through_an_admins_report(
        people, data_root):
    """Review round 1: an Editor's view of a process D22 withholds from
    everyone else must not leak that process's id or name through the
    activity record to an Admin who could never open it themselves."""
    _add_unconfirmed_process(data_root, "cooking-002", "SECRET-UNCONFIRMED")
    assert people["editor"].get("/api/processes/cooking-002").status_code == 200
    assert people["admin"].get("/api/processes/cooking-002").status_code == 404

    res = people["admin"].get("/api/activity/departments")
    cooking = next(r for r in res.json() if r["code"] == "cooking")
    assert cooking["topProcess"] is None or cooking["topProcess"]["id"] != "cooking-002"
    assert "SECRET-UNCONFIRMED" not in res.text
    assert "cooking-002" not in res.text


def test_an_editors_own_report_still_counts_their_own_unconfirmed_view(
        people, data_root):
    _add_unconfirmed_process(data_root, "cooking-002", "SECRET-UNCONFIRMED")
    people["editor"].get("/api/processes/cooking-002")
    people["editor"].get("/api/processes/cooking-002")
    rows = people["editor"].get("/api/activity/departments").json()
    cooking = next(r for r in rows if r["code"] == "cooking")
    assert cooking["topProcess"]["id"] == "cooking-002"


def test_an_unconfirmed_processs_id_never_surfaces_on_an_admins_timeline(
        people, data_root):
    """Review round 2: the same D56 leak, on `GET /api/activity/users/{id}` —
    an Admin reading the Editor's own timeline must not learn the id of a
    process the Editor alone may see."""
    _add_unconfirmed_process(data_root, "cooking-002", "SECRET-UNCONFIRMED")
    people["editor"].get("/api/processes/cooking-002")
    eid = _uid(people, "editor")

    res = people["admin"].get(f"/api/activity/users/{eid}")
    assert res.status_code == 200
    targets = [r["target"] for r in res.json()["rows"]]
    assert "cooking-002" not in targets
    assert "cooking-002" not in res.text

    own = people["editor"].get(f"/api/activity/users/{eid}")
    assert "cooking-002" in [r["target"] for r in own.json()["rows"]]


def test_a_withheld_facts_id_never_surfaces_on_an_admins_timeline(people):
    """Final review I3: F-00001 carries no confirmation, so D22 serves it to
    its editors alone. The Editor's `fact.edited` row stays on an Admin's
    read of their timeline — the event happened — but with no target."""
    eid = _uid(people, "editor")
    assert people["admin"].get("/api/facts/F-00001").status_code == 404
    conn = db.connect(people["editor"].app_db)
    try:
        who = conn.execute("SELECT username FROM users WHERE id = ?", (eid,)).fetchone()[0]
        audit.record(conn, actor=who, action="fact.edited", now=int(time.time()),
                     target="F-00001", detail={"change": "updated", "department": "cooking"})
    finally:
        conn.close()

    res = people["admin"].get(f"/api/activity/users/{eid}")
    assert res.status_code == 200
    row = next(r for r in res.json()["rows"] if r["action"] == "fact.edited")
    assert row["target"] is None
    assert "F-0000" not in res.text

    own = people["editor"].get(f"/api/activity/users/{eid}")
    assert "F-00001" in [r["target"] for r in own.json()["rows"]]


def test_a_deleted_processs_id_stays_on_the_timeline_only_for_its_editors(
        people, data_root):
    """Task 10 review round 1 (controller ruling): a process deleted outright
    leaves no file, so there is no document — and no tombstone — to ask. Whoever
    may edit its department keeps its id in the history, as they would keep a
    tombstone (D17); an Admin, who holds no `edit` there, still learns nothing."""
    _add_unconfirmed_process(data_root, "cooking-002", "SECRET-DELETED")
    assert people["editor"].get("/api/processes/cooking-002").status_code == 200
    (data_root / "departments" / "cooking" / "processes" / "cooking-002.json").unlink()
    eid = _uid(people, "editor")

    own = people["editor"].get(f"/api/activity/users/{eid}").json()["rows"]
    row = next((r["id"] for r in own if r["target"] == "cooking-002"), None)
    assert row is not None, own

    res = people["admin"].get(f"/api/activity/users/{eid}")
    assert res.status_code == 200
    assert next(r for r in res.json()["rows"] if r["id"] == row)["target"] is None
    assert "cooking-002" not in res.text


def test_an_editors_comment_is_left_out_of_the_comment_flow_for_non_editors(people):
    """2026-09-29 addendum §5, at the owner's decision: «مسیر کامنت‌ها» does not
    list an Editor's comment to anyone but an Editor, and the summary's count
    follows the list it is derived from. Each person's own activity page is
    left whole — it is the audit of what they did, and it never shows a text."""
    ed = people["editor"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "یادداشت ادیتور"})
    rd = people["viewer"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "x"})
    assert ed.status_code == 201 and rd.status_code == 201
    ed_ref, rd_ref = ed.json()["id"], rd.json()["id"]

    as_admin = {r["ref"] for r in people["admin"].get("/api/activity/comments").json()}
    assert as_admin == {rd_ref}, "an Admin — `*` and holding view_audit — must not see it"
    as_editor = {r["ref"] for r in people["editor"].get("/api/activity/comments").json()}
    assert as_editor == {ed_ref, rd_ref}, "an Editor still sees every comment"

    flow = people["admin"].get("/api/activity/comments").json()
    summary = people["admin"].get("/api/activity/summary").json()
    assert summary["commentsAwaiting"] == sum(1 for r in flow if r["state"] == "awaiting")

    eid = _uid(people, "editor")
    timeline = people["admin"].get(f"/api/activity/users/{eid}").json()["rows"]
    assert ed_ref in [r["target"] for r in timeline], "the per-person audit stays whole"
