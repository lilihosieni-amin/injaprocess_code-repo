"""The comments read and create API (addendum D65, D66, D70, D71, D74, D75).

`people` (conftest) is one shared app.db/comments.db cast: editor, admin (*),
cadmin (dept:cashier), head (Reader supervisor), viewer (reports to head),
other (a Reader off the path).
"""
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
