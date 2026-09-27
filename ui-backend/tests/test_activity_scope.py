"""The department and comment reports, and D44's scope rule (addendum D83;
§11 test 28): a scoped `view_audit` holder sees content for their departments
and no access or governance events; a `*` holder sees both."""


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
