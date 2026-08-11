from inja_ui_backend.tests_helpers import signed_in_client


def _c(data_root):
    # A real sign-in against a seeded Editor. `signed_in_client` uses
    # `https://testserver`, which is load-bearing: the session cookie is `Secure`
    # and the real cookie jar behind `TestClient` will not send one over `http://`.
    c, _ = signed_in_client(data_root, data_root.parent / "app.db")
    return c


def test_create_process_allocates_id(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={"department": "warehouse", "name": "دریافت کالا"})
    assert r.status_code == 201
    doc = r.json()
    assert doc["id"] == "warehouse-001"
    assert doc["source"]["type"] == "manual"
    assert [n["id"] for n in doc["nodes"]] == ["start", "end"]
    # persisted + readable
    assert c.get("/api/processes/warehouse-001").status_code == 200


def test_create_process_unknown_dept_is_the_uniform_404(data_root):
    """404 and the gate's own body, not a 400 naming the condition (D56).

    The two sibling routes with the same registry guard — `PUT
    /api/departments/{code}/order` and `GET /api/departments/{code}/next-id` —
    have always answered this way. This one answered `400 "unknown department"`,
    in English, which is a statement about the registry that the uniform status
    code exists to refuse: a caller holding `dept:nosuch` (legal under the
    grammar, so the gate lets it by) could tell "there is no such department"
    from "that one is not yours" by the status alone.

    `test_endpoint_matrix.test_an_in_scope_miss_answers_exactly_what_the_gate_answers`
    is the other half — it pins the *body* against the gate's, byte for byte.
    """
    c = _c(data_root)
    r = c.post("/api/processes", json={"department": "nosuch"})
    assert r.status_code == 404
    assert r.json() == {"detail": "یافت نشد"}


def test_subprocess_parent_without_a_node_is_a_404_not_a_500(data_root):
    """A `parent` carrying no `node` names no node, so it matches none.

    `_parent_target` already gives a missing `process` this treatment — it
    resolves to a target nothing reaches, and the gate answers the uniform 404.
    The handler then indexed `parent["node"]` directly and raised a `KeyError`
    out of a well-gated request, which FastAPI answers 500: a malformed body
    from a caller inside their own department became a server error.
    """
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking", "parent": {"process": "cooking-001"}})
    assert r.status_code == 404
    assert r.json() == {"detail": "یافت نشد"}


def test_create_subprocess_links_parent_node(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking", "name": "زیرفرآیند",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert r.status_code == 201
    child = r.json()
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    parent = c.get("/api/processes/cooking-001").json()
    node = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert node["subprocess"] == child["id"]


def test_subprocess_unknown_node_404(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n999"}})
    assert r.status_code == 404


def test_subprocess_non_activity_node_400(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "start"}})  # terminal, not activity
    assert r.status_code == 400


def test_subprocess_already_linked_409(data_root):
    c = _c(data_root)
    first = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert first.status_code == 201
    again = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert again.status_code == 409  # never silently overwrite an existing link


def test_subprocess_unknown_parent_process_404(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-999", "node": "cooking-999-n010"}})
    assert r.status_code == 404
