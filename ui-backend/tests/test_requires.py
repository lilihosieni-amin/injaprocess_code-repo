"""The 404-versus-403 partition (spec D56, §11 test 10).

Every test here drives a throwaway FastAPI app, so nothing depends on which
endpoints exist today: the subject is `requires` itself.
"""
import time

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from inja_ui_backend import db, seed
from inja_ui_backend.access import requires
from inja_ui_backend.auth import COOKIE_NAME, require_session
from inja_ui_backend.store import sessions, users


def test_out_of_scope_is_404_and_refused_action_is_403(data_root, tmp_path, monkeypatch):
    """The partition, asserted on a throwaway app so no router is involved.

    D56: a 403 on an out-of-scope resource teaches the caller that it exists.
    A 403 is only for an action refused on something they can already see.
    """
    # The brief's text imported `require_session` alongside `hash_password` and
    # never used it; dropped. Everything else in this test is its text.
    from inja_ui_backend import db, seed
    from inja_ui_backend.auth import hash_password
    from inja_ui_backend.store import users

    dbp = tmp_path / "app.db"
    conn = db.connect(dbp)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash=hash_password("test-password"))
    rid = conn.execute("SELECT id FROM roles WHERE name='reader'").fetchone()[0]
    uid = users.create(conn, username="09120000001", display_name="r",
                       password_hash=hash_password("test-password"), role_id=rid)
    conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, 'dept:dining')",
                 (uid,))

    app = FastAPI()
    app.state.db = conn

    class Cfg:
        session_ttl = 86400
    app.state.cfg = Cfg()

    @app.get("/visible")
    def visible(_=Depends(requires("view", "dept:dining"))):
        return {"ok": True}

    @app.get("/other-department")
    def other(_=Depends(requires("view", "dept:cashier"))):
        return {"ok": True}

    @app.get("/edit-here")
    def edit_here(_=Depends(requires("edit", "dept:dining"))):
        return {"ok": True}

    # A target that is not a scope at all — the "typo" side of the body check.
    @app.get("/nonsense-department")
    def nonsense(_=Depends(requires("view", "dept:nosuchplace"))):
        return {"ok": True}

    client = TestClient(app, base_url="https://testserver")

    # Unauthenticated is 401 — neither of the other two.
    assert client.get("/visible").status_code == 401

    from inja_ui_backend.store import sessions
    sid = sessions.issue(conn, uid, ip="", user_agent="", now=__import__("time").time().__int__())
    client.cookies.set("inja_session", sid)

    assert client.get("/visible").status_code == 200
    # Outside scope: must not reveal that the department exists.
    assert client.get("/other-department").status_code == 404
    # Refused action on something they CAN see.
    assert client.get("/edit-here").status_code == 403

    # The BODY has to be uniform too, not just the status. A 404 that says
    # "outside your scope" for a real department and something else for a
    # typo re-opens by prose exactly what the status code closed. Every
    # out-of-scope refusal must be byte-identical, whatever the target was.
    real = client.get("/other-department")
    typo = client.get("/nonsense-department")
    assert typo.status_code == 404
    assert real.json() == typo.json(), (
        "the 404 body distinguishes a real out-of-scope department from a"
        " target that is not a scope at all — the status matched and the"
        " prose leaked")


# Everything below drives the same three-line fixture: one database, one user
# with the scopes the test names, one throwaway app whose routes exist only to
# be refused.

def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _user(conn, username, role, *scopes) -> int:
    rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=rid)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return uid


def _app(conn) -> FastAPI:
    app = FastAPI()
    app.state.db = conn

    class Cfg:
        session_ttl = 86400

    app.state.cfg = Cfg()
    return app


def _client(app, conn=None, uid=None) -> TestClient:
    """A client, signed in as `uid` when one is given. https is load-bearing."""
    client = TestClient(app, base_url="https://testserver")
    if uid is not None:
        client.cookies.set(COOKIE_NAME, sessions.issue(conn, uid, ip="", user_agent="",
                                                       now=int(time.time())))
    return client


def _route(app, path, capability, target):
    @app.get(path, name=path)
    def _endpoint(_=Depends(requires(capability, target))):
        return {"ok": True}


def test_scope_is_checked_before_capability(tmp_path):
    """The mutant this file exists for: swap the two checks and this test dies.

    The brief's own out-of-scope case asks for a capability the Reader *holds*,
    so both orders answer 404 for it. The order is only visible where BOTH
    halves refuse — an action they may not take, on a department they may not
    see — and there the 404 has to win, because a 403 answers the question
    "does dept:cashier exist?" for someone with no business asking it.
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining")
    app = _app(conn)
    _route(app, "/edit-elsewhere", "edit", "dept:cashier")
    _route(app, "/administer-elsewhere", "manage_users", "dept:cashier")
    _route(app, "/edit-a-report-elsewhere", "edit", "dept:cashier/report:steps")
    client = _client(app, conn, uid)

    for path in ["/edit-elsewhere", "/administer-elsewhere",
                 "/edit-a-report-elsewhere"]:
        got = client.get(path).status_code
        assert got == 404, (
            f"{path} answered {got}: capability was checked before scope, so a"
            " Reader who may not edit learns from the 403 that dept:cashier"
            " exists — the existence disclosure D56's 404 is there to refuse")


def test_every_cell_of_the_2x2_gets_its_own_status(tmp_path):
    """One user, one capability held and one not, one department in scope and
    one not — all four cells, plus the unauthenticated row above them.

    Collapsing 404 and 403 into a single "refused" kills this in one direction
    or the other whichever code is chosen, and answering 401 for a refusal kills
    it in both.
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining")
    app = _app(conn)
    _route(app, "/view-here", "view", "dept:dining")            # both halves hold
    _route(app, "/view-elsewhere", "view", "dept:cashier")      # scope refuses
    _route(app, "/edit-here", "edit", "dept:dining")            # capability refuses
    _route(app, "/edit-elsewhere", "edit", "dept:cashier")      # both refuse

    stranger = _client(app)
    for path in ["/view-here", "/view-elsewhere", "/edit-here", "/edit-elsewhere"]:
        assert stranger.get(path).status_code == 401, path
    # A cookie naming no session is still a stranger, not a 404 and not a 403.
    stranger.cookies.set(COOKIE_NAME, "not-a-session-id")
    assert stranger.get("/view-elsewhere").status_code == 401

    client = _client(app, conn, uid)
    assert client.get("/view-here").status_code == 200
    assert client.get("/view-elsewhere").status_code == 404
    assert client.get("/edit-here").status_code == 403
    assert client.get("/edit-elsewhere").status_code == 404


def test_a_user_with_no_scope_at_all_is_404_everywhere(tmp_path):
    """An Editor with no scope row holds every capability and reaches nothing.

    Every answer here is 404 and not 403: `dept:dining` is as unknown to this
    account as a department that does not exist, and the capability it holds
    must not be what decides the code.
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "editor")
    app = _app(conn)
    for i, target in enumerate(["*", "dept:dining", "dept:dining/report:steps"]):
        _route(app, f"/t{i}", "edit", target)
        _route(app, f"/v{i}", "view", target)
    client = _client(app, conn, uid)
    for i in range(3):
        assert client.get(f"/t{i}").status_code == 404, i
        assert client.get(f"/v{i}").status_code == 404, i


def test_a_target_taken_from_the_path_is_resolved_per_request(tmp_path):
    """The callable form: one route, one gate, a different target each request."""
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining")
    app = _app(conn)

    def target_of(request: Request) -> str:
        return f"dept:{request.path_params['code']}"

    @app.get("/departments/{code}")
    def department(_=Depends(requires("view", target_of))):
        return {"ok": True}

    @app.get("/departments/{code}/edit")
    def edit_department(_=Depends(requires("edit", target_of))):
        return {"ok": True}

    client = _client(app, conn, uid)
    assert client.get("/departments/dining").status_code == 200
    assert client.get("/departments/cashier").status_code == 404
    # In scope, so the refusal of the action is a 403 — the callable target is
    # read by the capability arm as well as the scope arm.
    assert client.get("/departments/dining/edit").status_code == 403
    assert client.get("/departments/cashier/edit").status_code == 404
    # A code that is no code: `dept:Dining` and `dept:dining-annex` are refused
    # by the grammar (D10 fixes `{code}` at `[a-z]+`), so they reach nothing and
    # answer like anything else out of scope.
    assert client.get("/departments/Dining").status_code == 404
    assert client.get("/departments/dining-annex").status_code == 404


def test_a_target_that_is_no_scope_is_404_even_for_the_wildcard_holder(tmp_path):
    """Who holds `*` must not be readable from the status a nonsense target gets.

    A wildcard holder short-circuited past `contains` would answer 200 here, or
    403 once the capability arm refused — either way, the shape of the refusal
    would say "this account reaches everything".
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "editor", "*")
    app = _app(conn)
    junk = ["", " ", "nonsense", "dept:", "dept:Dining", "dept:dining ",
            "dept:dining/", "dept:dining/report:", "**", "dept:dining-annex",
            "dept:dining/report:steps/report:flowchart"]
    for i, target in enumerate(junk):
        _route(app, f"/junk{i}", "view", target)
    _route(app, "/real", "view", "dept:dining")
    _route(app, "/star", "view", "*")
    client = _client(app, conn, uid)

    for i, target in enumerate(junk):
        assert client.get(f"/junk{i}").status_code == 404, target
    # ...while the same account reaches every well-formed target.
    assert client.get("/real").status_code == 200
    assert client.get("/star").status_code == 200


def test_a_report_scope_reaches_its_report_and_not_its_department(tmp_path):
    """D10's nesting, seen through the partition.

    The department this reader's scope names is still not theirs to see, so it
    is a 404 and not a 403 — `dept:dining` is a resource, and they are outside
    its scope even though `dept_of` would label them `dining`.
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining/report:steps")
    app = _app(conn)
    _route(app, "/the-report", "view", "dept:dining/report:steps")
    _route(app, "/the-department", "view", "dept:dining")
    _route(app, "/another-report", "view", "dept:dining/report:flowchart")
    _route(app, "/edit-the-report", "edit", "dept:dining/report:steps")
    client = _client(app, conn, uid)

    assert client.get("/the-report").status_code == 200
    assert client.get("/the-department").status_code == 404
    assert client.get("/another-report").status_code == 404
    assert client.get("/edit-the-report").status_code == 403


def test_a_department_scope_reaches_a_report_kind_invented_later(tmp_path):
    # `inventedlater` is `[a-z]+`, which is the shape D10 fixes for a report
    # kind — a hyphenated one would be refused by the grammar and would test the
    # opposite of what this name claims.
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining")
    app = _app(conn)
    _route(app, "/new-report", "view", "dept:dining/report:inventedlater")
    assert _client(app, conn, uid).get("/new-report").status_code == 200


def test_one_users_scope_is_never_anothers(tmp_path):
    """Two accounts on one app: the gate reads the caller's scopes, not a cached
    set and not every row in the table."""
    conn = _conn(tmp_path)
    dining = _user(conn, "09120000001", "reader", "dept:dining")
    cashier = _user(conn, "09120000002", "reader", "dept:cashier")
    app = _app(conn)
    _route(app, "/dining", "view", "dept:dining")
    _route(app, "/cashier", "view", "dept:cashier")
    _route(app, "/everything", "view", "*")

    for uid, mine, theirs in [(dining, "/dining", "/cashier"),
                              (cashier, "/cashier", "/dining")]:
        client = _client(app, conn, uid)
        assert client.get(mine).status_code == 200, mine
        assert client.get(theirs).status_code == 404, theirs
        # The seeded Editor's `*` is the Editor's alone.
        assert client.get("/everything").status_code == 404


# All nine of D9, not six. `confirm` is the one that most needed adding: D11
# gives it to the Editor alone and D50 marks it `delegable: false`, so the row
# that matters is an Admin — who holds every capability but the last three —
# being refused it through the gate.
ROLE_TABLE = {
    "reader": {"view": 200, "comment": 200, "export_pdf": 200,
               "manage_users": 403, "manage_peers": 403, "view_audit": 403,
               "edit": 403, "confirm": 403, "set_visibility": 403},
    "reader_no_download": {"view": 200, "comment": 200, "export_pdf": 403,
                           "manage_users": 403, "manage_peers": 403,
                           "view_audit": 403, "edit": 403, "confirm": 403,
                           "set_visibility": 403},
    "admin": {"view": 200, "comment": 200, "export_pdf": 200,
              "manage_users": 200, "manage_peers": 200, "view_audit": 200,
              "edit": 403, "confirm": 403, "set_visibility": 403},
    "editor": {"view": 200, "comment": 200, "export_pdf": 200,
               "manage_users": 200, "manage_peers": 200, "view_audit": 200,
               "edit": 200, "confirm": 200, "set_visibility": 200},
}


@pytest.mark.parametrize("role", sorted(ROLE_TABLE))
def test_a_refusal_on_a_visible_target_is_403_for_every_role(tmp_path, role):
    """D11 read through the gate, with the target in scope on every row.

    Not one of these may be a 404: the caller can see `dept:dining`, so the only
    thing being refused is the action, and a 404 here would tell a Reader their
    own department had vanished.
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", role, "dept:dining")
    app = _app(conn)
    for cap in ROLE_TABLE[role]:
        _route(app, f"/{cap}", cap, "dept:dining")
    client = _client(app, conn, uid)
    for cap, expected in ROLE_TABLE[role].items():
        assert client.get(f"/{cap}").status_code == expected, cap


def test_a_capability_is_matched_whole(tmp_path):
    """Near-misses of a held capability are refused, and on a visible target so
    that the refusal is a 403 — `""` is the sharpest, being a substring of every
    stored capability row."""
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "admin", "dept:dining")
    app = _app(conn)
    near = ["", " ", "vie", "view ", "VIEW", "view_", "viewaudit", "manage",
            "users", "export_pd", "export_pdfs"]
    for i, cap in enumerate(near):
        _route(app, f"/n{i}", cap, "dept:dining")
    client = _client(app, conn, uid)
    for i, cap in enumerate(near):
        assert client.get(f"/n{i}").status_code == 403, cap


def test_a_disabled_account_is_refused_at_the_session_gate(tmp_path):
    """Disabling ends the session, so a disabled account never reaches the
    partition at all: 401, not 403 and not 404 (D14)."""
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining")
    app = _app(conn)
    _route(app, "/view-here", "view", "dept:dining")
    _route(app, "/view-elsewhere", "view", "dept:cashier")
    client = _client(app, conn, uid)
    assert client.get("/view-here").status_code == 200

    users.set_disabled(conn, uid, True)
    assert client.get("/view-here").status_code == 401
    assert client.get("/view-elsewhere").status_code == 401


def test_a_disabled_row_reaching_the_gate_holds_no_capability(tmp_path):
    """The second lock, on its own.

    `capabilities_of` empties a disabled account whatever its role says, and the
    gate must consult it rather than trust the session that got here. Reached by
    overriding the session gate, because the real one already refuses this row —
    which is the first lock, and is what the test above pins.

    A disabled account keeps its scope rows, so its own department is still
    something it can see: the refusal there is the 403, while another department
    stays a 404. Disabling takes away what you may do, not what you may know
    exists.
    """
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "editor", "dept:dining")
    users.set_disabled(conn, uid, True)
    app = _app(conn)
    _route(app, "/view-here", "view", "dept:dining")
    _route(app, "/view-elsewhere", "view", "dept:cashier")
    app.dependency_overrides[require_session] = lambda: users.by_id(conn, uid)

    client = _client(app)
    assert client.get("/view-here").status_code == 403
    assert client.get("/view-elsewhere").status_code == 404


def test_the_gate_hands_the_endpoint_the_user_and_leaves_it_on_the_request(tmp_path):
    """Every write endpoint has to record who acted (D48), so both handles the
    gate offers are pinned: the return value and `request.state.user`."""
    conn = _conn(tmp_path)
    uid = _user(conn, "09120000001", "reader", "dept:dining")
    app = _app(conn)

    @app.get("/who")
    def who(request: Request, user=Depends(requires("view", "dept:dining"))):
        return {"returned": user["username"],
                "on_request": request.state.user["username"],
                "id": user["id"]}

    body = _client(app, conn, uid).get("/who").json()
    assert body == {"returned": "09120000001", "on_request": "09120000001",
                    "id": uid}
