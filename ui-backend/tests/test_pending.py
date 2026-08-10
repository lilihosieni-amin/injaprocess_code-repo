from inja_ui_backend.tests_helpers import signed_in_client


def _auth_client(data_root):
    # A real sign-in against a seeded Editor. `signed_in_client` uses
    # `https://testserver`, which is load-bearing: the session cookie is `Secure`
    # and the real cookie jar behind `TestClient` will not send one over `http://`.
    c, _ = signed_in_client(data_root, data_root.parent / "app.db")
    return c


def test_pending_aggregates_open_rows_with_index(data_root):
    c = _auth_client(data_root)
    rows = c.get("/api/pending").json()
    assert isinstance(rows, list) and len(rows) >= 1
    r = rows[0]
    assert {"process", "department", "name", "node", "index",
            "field", "current", "proposed", "source", "status"} <= set(r)
    assert r["status"] == "open"
    # index points at the same row inside that process's pending array
    proc = c.get(f"/api/processes/{r['process']}").json()
    assert proc["pending"][r["index"]]["node"] == r["node"]


def test_pending_excludes_resolved(data_root):
    c = _auth_client(data_root)
    before = c.get("/api/pending").json()
    first = before[0]
    c.post(f"/api/processes/{first['process']}/pending/{first['index']}",
           json={"decision": "reject"})
    after = c.get("/api/pending").json()
    assert len(after) == len(before) - 1
