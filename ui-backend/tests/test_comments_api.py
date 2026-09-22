"""The comments read and create API (addendum D65, D66, D70, D71, D74, D75).

`people` (conftest) is one shared app.db/comments.db cast: editor, admin (*),
cadmin (dept:cashier), head (Reader supervisor), viewer (reports to head),
other (a Reader off the path).
"""
import json
import sqlite3

from inja_ui_backend.tests_helpers import audit_events as _events

NODE = "cooking-001-n010"


def test_create_on_a_node_routes_and_snapshots(people):
    r = people["viewer"].post("/api/comments", json={
        "anchorKind": "node", "anchorId": NODE, "text": "  این گام جا افتاده  "})
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["id"].startswith("CMT-")
    assert c["text"] == "این گام جا افتاده"
    # departmentName is the registry's name for the department — the one the
    # department board shows — not the overview's display title.
    assert c["anchor"] == {"kind": "node", "id": NODE, "processId": "cooking-001",
                           "department": "cooking", "departmentName": "پخت",
                           "processName": "خرید و پرداخت هزینه",
                           "nodeLabel": "دریافت درخواست خرید", "orphan": False}
    assert c["state"] == "awaiting" and c["waitingWith"] == {"kind": "person", "name": "head"}
    assert c["author"] == {"name": "viewer", "isMe": True, "role": "reader"}


def test_the_editor_may_not_author(people):
    r = people["editor"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "x"})
    assert r.status_code == 403
    assert _events(people["editor"], "access.denied")[-1]["target"] == "dept:cooking"


def test_out_of_scope_anchor_is_404(people):
    r = people["viewer"].post("/api/comments", json={
        "anchorKind": "department", "anchorId": "cashier", "text": "x"})
    assert r.status_code == 404
    assert _events(people["viewer"], "access.denied") == []


def test_unknown_node_is_404(people):
    r = people["viewer"].post("/api/comments", json={
        "anchorKind": "node", "anchorId": "cooking-001-n999", "text": "x"})
    assert r.status_code == 404


def test_text_limits(people):
    base = {"anchorKind": "process", "anchorId": "cooking-001"}
    r = people["viewer"].post("/api/comments", json={**base, "text": "   "})
    assert (r.status_code, r.json()["detail"]) == (422, "متن خالی است")
    r = people["viewer"].post("/api/comments", json={**base, "text": "ا" * 2001})
    assert (r.status_code, r.json()["detail"]) == (422, "متن بیشتر از ۲۰۰۰ نویسه است")
    r = people["viewer"].post("/api/comments", json={**base, "text": "ا" * 2000})
    assert r.status_code == 201


def test_many_open_comments_on_one_anchor_are_fine(people):
    for _ in range(3):
        assert people["viewer"].post("/api/comments", json={
            "anchorKind": "node", "anchorId": NODE, "text": "x"}).status_code == 201


def test_listing_by_process_follows_d66(people):
    people["viewer"].post("/api/comments", json={
        "anchorKind": "node", "anchorId": NODE, "text": "x"})

    def ids(who):
        return [c["id"] for c in people[who].get("/api/comments?process=cooking-001").json()]

    assert len(ids("viewer")) == 1 and len(ids("head")) == 1 and len(ids("admin")) == 1
    assert ids("other") == [] and ids("cadmin") == []
    assert len(ids("editor")) == 1


def test_listing_by_department_lists_only_department_anchors(people):
    people["viewer"].post("/api/comments", json={
        "anchorKind": "process", "anchorId": "cooking-001", "text": "x"})
    people["viewer"].post("/api/comments", json={
        "anchorKind": "department", "anchorId": "cooking", "text": "y"})
    got = people["viewer"].get("/api/comments?department=cooking").json()
    assert [c["text"] for c in got] == ["y"]
    assert got[0]["anchor"]["processId"] is None


def test_detail_of_an_invisible_comment_is_404(people):
    cid = people["viewer"].post("/api/comments", json={
        "anchorKind": "node", "anchorId": NODE, "text": "x"}).json()["id"]
    assert people["other"].get(f"/api/comments/{cid}").status_code == 404
    assert people["head"].get(f"/api/comments/{cid}").json()["trail"][0]["kind"] == "submitted"
    assert people["head"].get("/api/comments/CMT-999").status_code == 404
    assert people["head"].get("/api/comments/nonsense").status_code == 404


def test_inbox_tabs_and_paging(people):
    for i in range(12):
        people["viewer"].post("/api/comments", json={
            "anchorKind": "process", "anchorId": "cooking-001", "text": f"{i}"})
    page1 = people["admin"].get("/api/comments/inbox?tab=all&page=1").json()
    assert (len(page1["items"]), page1["total"], page1["pages"]) == (10, 12, 2)
    page2 = people["admin"].get("/api/comments/inbox?tab=all&page=2").json()
    assert len(page2["items"]) == 2
    assert len(people["head"].get("/api/comments/inbox?tab=waiting").json()["items"]) == 12
    assert people["admin"].get("/api/comments/inbox?tab=waiting").json()["items"] == []
    own = people["viewer"].get("/api/comments/inbox?tab=own").json()
    assert own["total"] == 12 and own["pages"] == 1


def test_created_is_recorded(people):
    cid = people["viewer"].post("/api/comments", json={
        "anchorKind": "department", "anchorId": "cooking", "text": "x"}).json()["id"]
    ev = _events(people["viewer"], "comment.created")[-1]
    assert ev["target"] == cid


def _to_pool(people):
    cid = people["viewer"].post("/api/comments", json={
        "anchorKind": "node", "anchorId": NODE, "text": "x"}).json()["id"]
    assert people["head"].post(f"/api/comments/{cid}/approve", json={}).status_code == 200
    return cid


def _waiting(people, who):
    return [c["id"] for c in people[who].get("/api/comments/inbox?tab=waiting").json()["items"]]


def test_waiting_tab_of_a_pool_comment_follows_coverage(people):
    cid = _to_pool(people)
    assert _waiting(people, "admin") == [cid]          # `*` covers cooking
    assert _waiting(people, "cadmin") == []            # dept:cashier does not
    assert _waiting(people, "editor") == []            # not the Editor's until approved
    assert people["admin"].post(f"/api/comments/{cid}/approve", json={}).status_code == 200
    assert _waiting(people, "editor") == [cid]
    assert _waiting(people, "admin") == []


def test_a_removed_node_reads_as_orphan_on_list_and_detail(people, data_root):
    cid = people["viewer"].post("/api/comments", json={
        "anchorKind": "node", "anchorId": NODE, "text": "x"}).json()["id"]
    path = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    next(n for n in doc["nodes"] if n["id"] == NODE)["removed"] = True
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    listed = people["editor"].get("/api/comments?process=cooking-001").json()
    assert [c["anchor"]["orphan"] for c in listed] == [True]
    assert people["editor"].get(f"/api/comments/{cid}").json()["anchor"]["orphan"] is True


def test_the_telegram_agent_is_shown_by_its_persian_name(people):
    cid = _to_pool(people)
    people["admin"].post(f"/api/comments/{cid}/approve", json={})
    n = int(cid.split("-")[1])
    conn = sqlite3.connect(people["admin"].app.state.cfg.comments_db)
    with conn:  # what the engine's `comments resolve` writes
        conn.execute("UPDATE comments SET state = 'addressed' WHERE id = ?", (n,))
        conn.execute("INSERT INTO comment_events (comment_id, at, kind, user_id, user_name)"
                     " VALUES (?, 1800000000, 'addressed', NULL, 'agent:control-bot')", (n,))
    conn.close()
    c = people["viewer"].get(f"/api/comments/{cid}").json()
    assert c["addressed"]["by"] == "دستیار تلگرام"
    assert c["trail"][-1]["name"] == "دستیار تلگرام"
    assert "agent:control-bot" not in json.dumps(c, ensure_ascii=False)


def test_a_huge_or_newline_id_is_404_not_500(people):
    assert people["head"].get("/api/comments/CMT-99999999999999999999999").status_code == 404
    assert people["head"].get("/api/comments/CMT-1%0A").status_code == 404


def test_an_anchor_id_with_a_trailing_newline_is_404(people):
    for kind, aid in (("node", NODE + "\n"), ("process", "cooking-001\n")):
        r = people["viewer"].post("/api/comments", json={
            "anchorKind": kind, "anchorId": aid, "text": "x"})
        assert r.status_code == 404, (kind, r.text)


def test_closed_comments_leave_the_anchor_lists_but_not_the_inbox(people):
    """Only awaiting and approved comments are listed by process or department;
    addressed, rejected and withdrawn stay on the comments page (inbox, detail)."""
    def new(kind, anchor, text):
        return people["viewer"].post("/api/comments", json={
            "anchorKind": kind, "anchorId": anchor, "text": text}).json()["id"]

    ids = {}
    for kind, anchor in (("process", "cooking-001"), ("department", "cooking")):
        for st in ("awaiting", "approved", "addressed", "rejected", "withdrawn"):
            ids[kind, st] = new(kind, anchor, f"{kind}-{st}")
        for st in ("approved", "addressed"):
            people["head"].post(f"/api/comments/{ids[kind, st]}/approve", json={})
            people["admin"].post(f"/api/comments/{ids[kind, st]}/approve", json={})
        people["editor"].post(f"/api/comments/{ids[kind, 'addressed']}/address", json={})
        people["head"].post(f"/api/comments/{ids[kind, 'rejected']}/reject", json={"reason": "نه"})
        people["viewer"].post(f"/api/comments/{ids[kind, 'withdrawn']}/withdraw")

    for who in ("viewer", "head", "admin", "editor"):
        by_proc = people[who].get("/api/comments?process=cooking-001").json()
        assert sorted(c["state"] for c in by_proc) == ["approved", "awaiting"], who
        by_dept = people[who].get("/api/comments?department=cooking").json()
        assert sorted(c["state"] for c in by_dept) == ["approved", "awaiting"], who

    own = people["viewer"].get("/api/comments/inbox?tab=own").json()
    assert sorted(c["state"] for c in own["items"]) == sorted(
        ["awaiting", "approved", "addressed", "rejected", "withdrawn"] * 2)
    for st in ("addressed", "rejected", "withdrawn"):
        assert people["viewer"].get(f"/api/comments/{ids['process', st]}").json()["state"] == st
