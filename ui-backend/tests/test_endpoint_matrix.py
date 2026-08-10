"""Every endpoint, read through the permission gate (spec D56, §11 tests 6 and 10).

Fourteen routes. Twelve are gated on one capability at one target; two span
departments and are filtered per row rather than gated, because a list that
refuses outright would take a two-department head's whole screen away over one
department they cannot reach.

The tests come in pairs on purpose. One capability test alone pins nothing: a
route gated on `view` that should be `edit` passes "an editor is not refused",
and a route gated on `edit` that should be `view` passes "a reader is refused".
Only both together name the capability. The same holds for the target — an
out-of-scope 404 alone is satisfied by a route gated on any department the
caller cannot reach, so it is paired with an in-scope non-refusal.
"""
import itertools
import json

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"

#: The twelve gated routes: (method, path, body, the capability each needs).
#: `body` is what a well-formed request carries — a malformed one would be
#: refused by validation on some routes and by the gate on others, and this
#: table exists to compare gates, not validators.
GATED = [
    ("GET", "/api/departments/cooking/overview", None, "view"),
    ("PUT", "/api/departments/cooking/overview", {}, "edit"),
    ("PUT", "/api/departments/cooking/order", {"order": []}, "edit"),
    ("GET", "/api/departments/cooking/processes", None, "view"),
    ("GET", "/api/departments/cooking/next-id", None, "edit"),
    ("POST", "/api/departments/cooking/exports/steps", None, "export_pdf"),
    ("GET", "/api/processes/cooking-001", None, "view"),
    ("POST", "/api/processes", {"department": "cooking"}, "edit"),
    ("DELETE", "/api/processes/cooking-001", None, "edit"),
    ("POST", "/api/processes/cooking-001/relayout", {}, "edit"),
    ("PUT", "/api/processes/cooking-001", {}, "edit"),
    ("POST", "/api/processes/cooking-001/pending/0", {"decision": "reject"}, "edit"),
]

#: The two that filter instead of gating. They span every department, so there is
#: no single target to gate them on.
FILTERED = ["/api/departments", "/api/pending"]

#: A seeded role that does NOT hold each capability, for the refusal direction.
#: `view` has no entry because all four seeded roles hold it (D11) — the only
#: thing that can be asserted about a `view` route is that a Reader reaches it,
#: which is the other half of the pair.
WITHOUT = {"edit": "reader", "export_pdf": "reader_no_download"}

#: A seeded role that DOES hold each capability, for the non-refusal direction.
WITH = {"view": "reader", "export_pdf": "reader", "edit": "editor"}

#: Statuses that mean "the gate refused". Everything else means it let the
#: request through to the handler, whatever the handler then made of it.
REFUSALS = (401, 403, 404)


def _ids(routes):
    return [f"{m} {p}" for m, p, _b, _c in routes]


_accounts = itertools.count()


def _client_as(data_root, tmp_path, role, *scopes):
    """A signed-in client for a fresh account with `role` and `scopes`.

    Its own `app.db` each time, because several tests below compare two callers
    over one `data_root` and a shared store would collide on the username. The
    seeded Editor is created too (`seed.seed` insists on one), but nothing here
    ever signs in as it: every assertion is about the second account.
    """
    n = next(_accounts)
    cfg = cfg_for(data_root, tmp_path / f"app-{n}.db")
    username = f"091200000{n:02d}"
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
    r = client.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    return client


def _call(client, method, path, body):
    return client.request(method, path, json=body)


# --------------------------------------------------------------------------
# The capability each route is gated on — pinned from both sides.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("method,path,body,capability", GATED, ids=_ids(GATED))
def test_a_role_without_the_capability_is_403_on_a_visible_target(
        data_root, tmp_path, method, path, body, capability):
    """403, not 404: the department is in scope, so only the action is refused."""
    role = WITHOUT.get(capability)
    if role is None:
        pytest.skip(f"no seeded role lacks {capability}")
    client = _client_as(data_root, tmp_path, role, "dept:cooking")
    r = _call(client, method, path, body)
    assert r.status_code == 403, (
        f"{method} {path} answered {r.status_code} to a {role} in scope; it is"
        f" supposed to need {capability}, which no {role} holds")


@pytest.mark.parametrize("method,path,body,capability", GATED, ids=_ids(GATED))
def test_a_role_with_the_capability_is_not_refused_in_scope(
        data_root, tmp_path, method, path, body, capability):
    """The other half: over-gating a route is as wrong as under-gating it.

    A `view` route gated on `edit` refuses the Reader who is entitled to it, and
    nothing in the test above notices — every one of its assertions is about a
    refusal. The handler's own answer is not asserted here (some 422, some 409,
    the export 503 for want of an EXPORT_DIR); only that the gate let it run.
    """
    client = _client_as(data_root, tmp_path, WITH[capability], "dept:cooking")
    r = _call(client, method, path, body)
    assert r.status_code not in REFUSALS, (
        f"{method} {path} answered {r.status_code} to a {WITH[capability]} in"
        f" scope who holds {capability}: the route is gated on more than it needs")


# --------------------------------------------------------------------------
# The target each route is gated on.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("method,path,body,capability", GATED, ids=_ids(GATED))
def test_out_of_scope_is_404_never_403(data_root, tmp_path, method, path, body,
                                       capability):
    """An Editor scoped to a different department holds every capability, so
    scope is the only thing that can refuse them — and it must refuse with 404.

    This is also the test that catches a route left on its bare session gate:
    an ungated route answers its handler's status here, never 404.
    """
    client = _client_as(data_root, tmp_path, "editor", "dept:dining")
    r = _call(client, method, path, body)
    assert r.status_code == 404, f"{method} {path} answered {r.status_code}"


@pytest.mark.parametrize("method,path,body,capability", GATED, ids=_ids(GATED))
def test_out_of_scope_and_without_the_capability_is_still_404(
        data_root, tmp_path, method, path, body, capability):
    """Both halves refusing: the 404 has to win over the 403.

    A route that resolved its own permission with `allows` — one bool, one
    status — would answer 403 here and tell a Reader in `dining` that `cooking`
    exists.
    """
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    r = _call(client, method, path, body)
    assert r.status_code == 404, f"{method} {path} answered {r.status_code}"


ALL_FOURTEEN = GATED + [("GET", p, None, None) for p in FILTERED]


@pytest.mark.parametrize("method,path,body,capability", ALL_FOURTEEN,
                         ids=_ids(ALL_FOURTEEN))
def test_a_stranger_still_gets_401_everywhere(data_root, tmp_path, method, path,
                                              body, capability):
    """All fourteen, filtered ones included: 401 belongs to neither half of the
    partition and must not be lost when the session gate becomes a capability
    gate — nor may a filtered route quietly serve a stranger an empty list."""
    cfg = cfg_for(data_root, tmp_path / "app.db")
    client = TestClient(create_app(cfg), base_url=BASE)
    assert _call(client, method, path, body).status_code == 401, f"{method} {path}"


def test_the_export_target_names_the_report_and_not_only_the_department(
        data_root, tmp_path):
    """`dept:{code}/report:{kind}`, both segments, from their own path slots.

    A report-scoped reader reaches their one report and no other. Gating this
    route on `dept:{code}` shuts them out of both; gating it on the department
    alone, or reading `kind` where `code` belongs, lets them into both.
    """
    client = _client_as(data_root, tmp_path, "reader", "dept:cooking/report:steps")
    mine = client.post("/api/departments/cooking/exports/steps")
    assert mine.status_code != 404, (
        f"the granted report answered {mine.status_code}: the gate is not"
        " reading the report kind out of the path")
    assert client.post("/api/departments/cooking/exports/flowchart").status_code == 404
    # …while a department-scoped reader reaches every kind in it (D10).
    whole = _client_as(data_root, tmp_path, "reader", "dept:cooking")
    for kind in ("steps", "flowchart"):
        assert whole.post(f"/api/departments/cooking/exports/{kind}").status_code != 404


def test_the_department_target_is_the_code_in_the_path(data_root, tmp_path):
    """One route, one gate, a different department each request.

    A target hard-coded to one department, or read from the wrong path segment,
    passes every single-department test above and dies here.
    """
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking", "dept:dining")
    assert client.get("/api/departments/cooking/processes").status_code == 200
    assert client.get("/api/departments/dining/processes").status_code == 200
    assert client.get("/api/departments/cashier/processes").status_code == 404
    assert client.get("/api/departments/logistics/processes").status_code == 404


def test_the_create_target_is_the_department_in_the_body(data_root, tmp_path):
    """`POST /api/processes` is the one route whose department is not in the path.

    Every other test on this route creates in `cooking`, so a target hard-coded
    to `dept:cooking` — or one that ignored the body and asked for `*` — passes
    all of them. Only a second department names it. Still lexical: the body is
    the caller's own text, compared against their scopes and against nothing on
    disk.
    """
    client = _client_as(data_root, tmp_path, "editor", "dept:warehouse")
    assert client.post("/api/processes",
                       json={"department": "warehouse"}).status_code == 201
    assert client.post("/api/processes",
                       json={"department": "cooking"}).status_code == 404
    # A department that is no department under the grammar reaches nothing, so
    # it is a 404 like anything else out of scope — never the 400 the handler
    # gives an in-scope caller who names an unregistered department.
    assert client.post("/api/processes",
                       json={"department": "No-Such"}).status_code == 404


def test_the_process_target_is_the_id_prefix_and_not_the_stored_department(
        data_root, tmp_path):
    """Target derivation is lexical: the path decides, never the file.

    A gate that opened the process to read its `department` field would have to
    resolve the resource before deciding, and the status would then be chosen by
    existence rather than by scope. The two are told apart by a file whose
    stored department disagrees with its id — reachable under the id's own
    prefix, and not under the department written inside it.
    """
    doc = json.loads((data_root / "departments" / "cooking" / "processes"
                      / "cooking-001.json").read_text(encoding="utf-8"))
    doc["id"] = "dining-002"
    doc["department"] = "cooking"          # deliberately disagrees with the id
    (data_root / "departments" / "dining" / "processes" / "dining-002.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    dining = _client_as(data_root, tmp_path, "reader", "dept:dining")
    assert dining.get("/api/processes/dining-002").status_code == 200, (
        "the gate read the department out of the file instead of the id")
    cooking = _client_as(data_root, tmp_path, "reader", "dept:cooking")
    assert cooking.get("/api/processes/dining-002").status_code == 404


def test_a_refusal_cannot_be_told_from_a_typo(data_root, tmp_path):
    """Same status AND same body, whether the resource exists or not (D56).

    Every one of these five is refused by the gate, which is the point: the
    caller is outside all of them, so nothing about which ones are real may
    reach them. A route that resolved its resource before the gate would answer
    two of these differently and hand them the other departments' contents.
    """
    client = _client_as(data_root, tmp_path, "editor", "dept:dining")
    probes = [
        ("GET", "/api/processes/cooking-001"),      # exists
        ("GET", "/api/processes/cooking-999"),      # does not
        ("GET", "/api/departments/cooking/overview"),   # exists
        ("GET", "/api/departments/logistics/overview"),  # department without one
        ("GET", "/api/departments/nosuchplace/overview"),  # no such department
    ]
    answers = [client.request(m, p) for m, p in probes]
    for (m, p), r in zip(probes, answers):
        assert r.status_code == 404, f"{m} {p} answered {r.status_code}"
    bodies = {r.json()["detail"] for r in answers}
    assert len(bodies) == 1, (
        f"the 404 body distinguishes these five refusals: {bodies}")


#: In-scope 404s: (method, path, body). Every one of these passes the gate and
#: is refused by the handler's own guard, which is what makes them the other
#: half of the pair above — that test never reaches a handler at all.
IN_SCOPE_MISSES = [
    ("GET", "/api/processes/cooking-999", None),
    ("DELETE", "/api/processes/cooking-999", None),
    ("POST", "/api/processes/cooking-999/pending/0", {"decision": "reject"}),
    ("POST", "/api/processes",
     {"department": "cooking", "parent": {"process": "cooking-999", "node": "n"}}),
    ("POST", "/api/processes",
     {"department": "cooking", "parent": {"process": "cooking-001", "node": "nope"}}),
    ("GET", "/api/departments/logistics/overview", None),
    ("PUT", "/api/departments/nosuchplace/order", {"order": []}),
    ("GET", "/api/departments/nosuchplace/next-id", None),
    ("POST", "/api/departments/cooking/exports/poster", None),
    ("POST", "/api/departments/nosuchplace/exports/steps", None),
]


def test_an_in_scope_miss_answers_exactly_what_the_gate_answers(data_root, tmp_path):
    """The routers' own 404s carry the gate's body, to the byte.

    This is the half that the "typo" test above cannot see. There the caller is
    outside everything, so all five answers come from `requires` and would stay
    identical however the handlers worded theirs. Here the caller is *inside*
    every department they ask about and the handler is the one refusing — so if
    any of these said "process not found" or "unknown department", the pair of
    tests together would let a prober separate "not yours" from "not there",
    which is the scope boundary that the uniform status code just hid.

    `dept:nosuchplace` is a scope naming a department that is not in the
    registry: legal under the grammar, so the gate lets it by and the handler's
    registry guard is what answers. It is how the "unknown department" branches
    are reached at all without a `*` holder.
    """
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking",
                        "dept:logistics", "dept:nosuchplace")
    outside = _client_as(data_root, tmp_path, "editor", "dept:dining")
    gate = outside.get("/api/processes/cooking-001")
    assert gate.status_code == 404

    for method, path, body in IN_SCOPE_MISSES:
        r = client.request(method, path, json=body)
        assert r.status_code == 404, f"{method} {path} answered {r.status_code}"
        assert r.text == gate.text, (
            f"{method} {path} answers a 404 the gate's 404 can be told from:"
            f" {r.text} vs {gate.text}")


def test_a_refused_request_writes_nothing(data_root, tmp_path):
    """The gate runs before the work, not beside it.

    Status codes alone cannot see this: a handler that deleted the file and then
    404'd would satisfy every assertion above. These check the disk.
    """
    client = _client_as(data_root, tmp_path, "editor", "dept:dining")
    procs = data_root / "departments" / "cooking" / "processes"
    proc = procs / "cooking-001.json"
    before = proc.read_text(encoding="utf-8")
    overview = data_root / "departments" / "cooking" / "overview.json"
    overview_before = overview.read_text(encoding="utf-8")
    files_before = sorted(p.name for p in procs.iterdir())

    assert client.delete("/api/processes/cooking-001").status_code == 404
    assert client.put("/api/processes/cooking-001",
                      json={"name": "دستکاری"}).status_code == 404
    assert client.put("/api/departments/cooking/overview",
                      json={"mission": "دستکاری"}).status_code == 404
    assert client.post("/api/processes",
                       json={"department": "cooking"}).status_code == 404
    assert client.post("/api/processes/cooking-001/pending/0",
                       json={"decision": "accept"}).status_code == 404

    assert proc.is_file() and proc.read_text(encoding="utf-8") == before
    assert overview.read_text(encoding="utf-8") == overview_before
    assert sorted(p.name for p in procs.iterdir()) == files_before


# --------------------------------------------------------------------------
# The two that filter rather than gate.
# --------------------------------------------------------------------------

ALL_DEPARTMENTS = {"management", "accounting", "warehouse", "procurement",
                   "cooking", "preparation", "dining", "cashier", "logistics"}


def _codes(client):
    r = client.get("/api/departments")
    assert r.status_code == 200, r.text
    return {d["code"] for d in r.json()}


def test_the_department_list_is_filtered_and_never_refused(data_root, tmp_path):
    """A department the caller cannot reach is absent, not present and greyed.

    Both ends of `reachable_departments` are here, and they are opposites that
    are both falsy: `None` is every department and `set()` is none of them. A
    caller writing `if not depts:` reads one as the other, and exactly one of
    these two assertions catches it whichever way that branch falls.
    """
    assert _codes(_client_as(data_root, tmp_path, "editor", "*")) == ALL_DEPARTMENTS
    assert _codes(_client_as(data_root, tmp_path, "editor")) == set()
    assert _codes(_client_as(data_root, tmp_path, "reader", "dept:cooking")) == {"cooking"}
    two = _client_as(data_root, tmp_path, "reader", "dept:cooking", "dept:dining")
    assert _codes(two) == {"cooking", "dining"}


def test_a_report_scope_still_finds_its_department_in_the_list(data_root, tmp_path):
    """`dept:x/report:k` is "somewhere within x", so x is listed — otherwise the
    holder has no way to navigate to the one report they were granted."""
    client = _client_as(data_root, tmp_path, "reader", "dept:cooking/report:steps")
    assert _codes(client) == {"cooking"}


def _plant_pending(data_root, pid, dept):
    (data_root / "departments" / dept / "processes" / f"{pid}.json").write_text(
        json.dumps({"id": pid, "department": dept, "name": pid, "pending": [
            {"node": f"{pid}-n010", "field": "actor", "current": "الف",
             "proposed": "ب", "source": "runs/x", "status": "open"}]},
            ensure_ascii=False), encoding="utf-8")


def test_pending_is_filtered_by_edit_and_answers_an_empty_list(data_root, tmp_path):
    """`GET /api/pending` needs `edit`, because an unresolved conflict is
    internal bookkeeping and not content (D17) — but it spans departments, so a
    caller with `edit` nowhere gets `[]` rather than a refusal."""
    _plant_pending(data_root, "dining-009", "dining")

    everywhere = _client_as(data_root, tmp_path, "editor", "*")
    assert {r["process"] for r in everywhere.get("/api/pending").json()} == {
        "cooking-001", "dining-009"}

    scoped = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = scoped.get("/api/pending")
    assert r.status_code == 200
    assert {row["process"] for row in r.json()} == {"cooking-001"}

    # A Reader holds `view` everywhere and `edit` nowhere: an empty list, and
    # emphatically not the whole board filtered by `view` instead.
    reader = _client_as(data_root, tmp_path, "reader", "*")
    assert reader.get("/api/pending").status_code == 200
    assert reader.get("/api/pending").json() == []

    # An Editor with no scope row at all: `set()`, not `None`.
    nowhere = _client_as(data_root, tmp_path, "editor")
    assert nowhere.get("/api/pending").json() == []


def test_the_lists_never_name_a_process_outside_the_callers_scope(data_root, tmp_path):
    """The bodies, not just the row count: a filtered list that still carried an
    out-of-scope id in some other field would pass the assertions above."""
    _plant_pending(data_root, "dining-009", "dining")
    scoped = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert "dining" not in scoped.get("/api/pending").text
    assert "dining" not in scoped.get("/api/departments").text
