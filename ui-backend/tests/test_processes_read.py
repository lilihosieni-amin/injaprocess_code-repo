from inja_ui_backend.tests_helpers import signed_in_client


def _c(data_root):
    # A real sign-in against a seeded Editor. `signed_in_client` uses
    # `https://testserver`, which is load-bearing: the session cookie is `Secure`
    # and the real cookie jar behind `TestClient` will not send one over `http://`.
    c, _ = signed_in_client(data_root, data_root.parent / "app.db")
    return c


def test_get_process(data_root):
    c = _c(data_root)
    p = c.get("/api/processes/cooking-001").json()
    assert p["id"] == "cooking-001"
    assert "nodes" in p and "edges" in p


def test_get_process_404(data_root):
    c = _c(data_root)
    assert c.get("/api/processes/cooking-999").status_code == 404
