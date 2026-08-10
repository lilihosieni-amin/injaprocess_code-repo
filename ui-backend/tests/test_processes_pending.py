from inja_ui_backend.tests_helpers import signed_in_client


def _c(data_root):
    # A real sign-in against a seeded Editor. `signed_in_client` uses
    # `https://testserver`, which is load-bearing: the session cookie is `Secure`
    # and the real cookie jar behind `TestClient` will not send one over `http://`.
    c, _ = signed_in_client(data_root, data_root.parent / "app.db")
    return c


def _first_open(doc):
    for i, row in enumerate(doc["pending"]):
        if row["status"] == "open":
            return i, row
    return None, None


def test_accept_applies_proposal_and_commits(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, row = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    out = c.post(f"/api/processes/cooking-001/pending/{i}",
                 json={"decision": "accept"}).json()
    node = next(n for n in out["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == row["proposed"]
    assert out["pending"][i]["status"] == "accepted"


def test_reject_leaves_node_and_flags_row(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, row = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    node_before = next(n for n in doc["nodes"] if n["id"] == row["node"])[row["field"]]
    out = c.post(f"/api/processes/cooking-001/pending/{i}",
                 json={"decision": "reject"}).json()
    node = next(n for n in out["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == node_before
    assert out["pending"][i]["status"] == "rejected"


def test_double_resolve_409(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, _ = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    c.post(f"/api/processes/cooking-001/pending/{i}", json={"decision": "accept"})
    again = c.post(f"/api/processes/cooking-001/pending/{i}", json={"decision": "accept"})
    assert again.status_code == 409
