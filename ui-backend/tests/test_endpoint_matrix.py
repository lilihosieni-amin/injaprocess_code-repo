"""Every endpoint, read through the permission gate (spec D56, §11 tests 6 and 10).

Twenty-seven routes. Twenty-five are gated on one capability at one target; two
span departments and are filtered per row rather than gated, because a list that
refuses outright would take a two-department head's whole screen away over one
department they cannot reach.

Fifteen of the twenty-five name a department. The other ten name `*`: the two
visibility routes, because there is one global policy (D16) and so no department
to gate them on, and the eight of the user-administration surface, because all
user administration is at `*` scope (D11) and a department-scoped Admin is meant
to learn nothing about it at all (D54). `_in_scope_for` is what keeps the
in-scope half of every pair below honest about that: a `dept:cooking` caller is
404'd out of a `*` target before their capability is ever looked at, and a 404
arriving where a 403 was expected would read as a mis-gated capability rather
than as the wrong scope.

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
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import confirmations, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"

#: The id of the third account `_client_as` plants — see its docstring.
#:
#: A constant rather than a lookup because the table below is static, and
#: `_client_as` asserts the row it creates really lands on this id: the routes
#: that act on a *person* would otherwise silently retarget the caller (a
#: self-edit, refused 403 by D13) or the seeded Editor (refused 403 by the subset
#: rule) the day somebody adds a row above it, and both refusals look exactly
#: like the mis-gating this file exists to detect.
VICTIM = 3

#: The twenty-five gated routes: (method, path, body, the capability each needs).
#: `body` is what a well-formed request carries — a malformed one would be
#: refused by validation on some routes and by the gate on others, and this
#: table exists to compare gates, not validators.
GATED = [
    #: The confirmation routes' `department` is in the query string rather than
    #: the path, and their target is derived lexically from it exactly as the
    #: two path ones are — so all three belong in this table and not beside the
    #: two that filter. `POST`'s body is well formed and deliberately *stale*:
    #: this file compares gates, and a 409 from the handler is proof the gate
    #: let the request through.
    ("GET", "/api/confirmations?department=cooking", None, "confirm"),
    ("POST", "/api/confirmations/cooking-001", {"fingerprint": "a" * 64},
     "confirm"),
    ("DELETE", "/api/confirmations/cooking-001", None, "confirm"),
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
    #: The two whose target is `*` and not a department: one global policy (D16),
    #: so a gate on `dept:{code}` would let the head of dining decide what
    #: cashier publishes. `_in_scope_for` gives them a caller who holds `*`.
    ("GET", "/api/visibility", None, "set_visibility"),
    ("PUT", "/api/visibility/node_actor", {"visible": True}, "set_visibility"),
    #: The user-administration surface (D54), whose target is `*` for a different
    #: reason: not one global object, but the rule that all user administration
    #: is at `*` scope (D11), so a department Admin holding `manage_users` is
    #: still outside it. The reads are gated as tightly as the writes because
    #: D54's boundary is the surface itself — a Reader is served no list, not a
    #: filtered one.
    #:
    #: `POST /api/users` carries `{}` deliberately: dependencies are solved
    #: before the body is validated, so the gate still speaks first for every
    #: refusal direction, while the in-scope Admin gets a 422 — which is the
    #: handler answering, i.e. proof the gate let them through. A well-formed
    #: body would have to name a role id and a supervisor, which is a fixture
    #: this table cannot carry and a delegation refusal (403) waiting to be
    #: misread as a mis-gating.
    ("GET", "/api/users", None, "manage_users"),
    ("GET", f"/api/users/{VICTIM}", None, "manage_users"),
    ("GET", "/api/users/supervisor-candidates", None, "manage_users"),
    ("GET", "/api/roles", None, "manage_users"),
    ("POST", "/api/users", {}, "manage_users"),
    ("PATCH", f"/api/users/{VICTIM}", {"displayName": "دستکاری"}, "manage_users"),
    ("POST", f"/api/users/{VICTIM}/password", {"password": PW}, "manage_users"),
    ("POST", f"/api/users/{VICTIM}/disabled", {"disabled": True}, "manage_users"),
]

#: The routes above whose target is not a department, so an in-scope caller for
#: them holds `*` rather than `dept:cooking`. Named by path rather than by
#: capability, because it is the *target* that differs and a second route gated
#: on `set_visibility` at a department (there is none today) would belong on the
#: department side of this line.
GLOBAL_TARGET = ("/api/visibility", "/api/visibility/node_actor",
                 "/api/users", f"/api/users/{VICTIM}",
                 "/api/users/supervisor-candidates", "/api/roles",
                 f"/api/users/{VICTIM}/password", f"/api/users/{VICTIM}/disabled")

#: The two that filter instead of gating. They span every department, so there is
#: no single target to gate them on.
FILTERED = ["/api/departments", "/api/pending"]

#: The seeded roles that do NOT hold each capability, for the refusal direction.
#: A tuple, because more than one real role can lack one and each is worth its
#: own pass: the Admin lacking `edit` is D50's promise that an administrator
#: cannot edit content, and it is a different promise from the Reader's.
#:
#: `view` is empty because all four seeded roles hold it (D11), so no real role
#: can be refused it — see `SEEDED_ROLES_CANNOT_TELL` below for the full list of
#: what the four roles cannot distinguish, and for what closes it.
WITHOUT = {"view": (), "edit": ("reader", "admin"),
           "confirm": ("reader", "admin"),
           "set_visibility": ("reader", "admin"),
           "export_pdf": ("reader_no_download",),
           #: Both Reader roles, because D54 is a promise about *Readers* and a
           #: department head is one — the deployment's heads carry the
           #: supervisor tag and no `manage_users` (D11).
           "manage_users": ("reader", "reader_no_download")}

#: The seeded role used for the non-refusal direction — the *narrowest* one that
#: holds the capability, so that the pair says as much as four roles can.
#: `view` is `reader_no_download` rather than `reader` on purpose: a Reader holds
#: `export_pdf` too, so a `view` route mis-gated on `export_pdf` would sail
#: through this half and be refused by nothing.
WITH = {"view": "reader_no_download", "export_pdf": "reader", "edit": "editor",
        "confirm": "editor", "set_visibility": "editor",
        #: The Admin rather than the Editor: it is the narrowest seeded role
        #: holding `manage_users`, and it is also the one that must be able to
        #: act on `VICTIM` — a Reader — under D13's subset rule.
        "manage_users": "admin"}


def _in_scope_for(path: str) -> str:
    """The scope a caller must hold to be *inside* this route's target.

    `dept:cooking` for the sixteen that name a department in their path, and `*`
    for the two that name the global policy: `contains("dept:cooking", "*")` is
    False, so a department-scoped caller is 404'd out of `/api/visibility` by
    scope before their capability is consulted at all. Every in-scope test below
    would then read that 404 as a statement about `set_visibility`, which it is
    not.
    """
    return "*" if path in GLOBAL_TARGET else "dept:cooking"

#: Every capability there is: the Editor's set, which is the union of the four
#: (`seed.ROLES` is the access model, and `_EDITOR` is built from `_ADMIN` from
#: `_READER`).
ALL_CAPABILITIES = frozenset(seed.ROLES["editor"])

#: What the four seeded roles, on their own, cannot distinguish — written down
#: rather than left for the next reader to rediscover from a surviving mutant.
#:
#: A capability is only pinned by a pair of roles that differ *on it*. Among the
#: four:
#:
#:   * `edit`, `confirm` and `set_visibility` are held by the Editor and by
#:     nobody else (D50: non-delegable), so they are held by exactly the same
#:     set of accounts and no seeded role can tell one from another. A route
#:     gated on `confirm` where it should be `edit` behaves identically for
#:     every account that can exist today.
#:   * `view` and `comment` are held by all four, so neither can be told from
#:     the other, and neither can be refused at all.
#:   * `manage_users`, `manage_peers` and `view_audit` are held by the Admin and
#:     the Editor together, so they cannot be told apart either.
#:
#: `test_a_role_holding_every_other_capability_is_403` closes all of it with a
#: role built for the test — see its docstring for why that is legitimate.
SEEDED_ROLES_CANNOT_TELL = (
    ("edit", "confirm", "set_visibility"),
    ("view", "comment"),
    ("manage_users", "manage_peers", "view_audit"),
)

#: Statuses that mean "the gate refused". Everything else means it let the
#: request through to the handler, whatever the handler then made of it.
REFUSALS = (401, 403, 404)


def _ids(routes):
    return [f"{m} {p}" for m, p, _b, _c in routes]


_accounts = itertools.count()


def _confirm_the_whole_corpus(conn, data_root) -> None:
    """Vouch for every document on disk, so this file keeps testing the *gate*.

    D22 withholds an unconfirmed record from anyone without `edit`, and this
    file's non-refusal direction is a **reader** — `WITH["view"]` is
    `reader_no_download` on purpose. Left unconfirmed, every `view` route would
    answer them 404 and
    `test_a_role_with_the_capability_is_not_refused_in_scope` would read that as
    over-gating, which is a diagnosis about the wrong thing entirely. Confirmed
    here so the only reason a caller can be refused below is the one this file
    is about: their capability and their scope.

    Wholesale rather than a list of the three documents that matter today,
    because a test that plants a fourth (`…_the_process_target_is_the_id_prefix…`
    writes one) would otherwise have to remember this exists. The record gate
    only ever *withholds*, so confirming everything cannot turn a refusal these
    tests assert into a 200 — a caller outside the department is refused by the
    scope gate before a confirmation is ever looked up.

    The target is read **lexically**, from the file's own name and directory,
    never from `id`/`department` inside it: that is what the routes do, and one
    of the tests below deliberately plants a document whose stored department
    disagrees with where it lives.
    """
    root = data_root / "departments"
    for dept in sorted(p for p in root.iterdir() if p.is_dir()):
        overview = dept / "overview.json"
        if overview.is_file():
            confirmations.set_confirmation(
                conn, target=dept.name,
                fingerprint=fingerprint(json.loads(
                    overview.read_text(encoding="utf-8"))),
                by="09190000000", at=1770000000)
        for proc in sorted((dept / "processes").glob("*.json")):
            confirmations.set_confirmation(
                conn, target=proc.stem,
                fingerprint=fingerprint(json.loads(
                    proc.read_text(encoding="utf-8"))),
                by="09190000000", at=1770000000)


def _client_as(data_root, tmp_path, role, *scopes, capabilities=None):
    """A signed-in client for a fresh account with `role` and `scopes`.

    Its own `app.db` each time, because several tests below compare two callers
    over one `data_root` and a shared store would collide on the username. The
    seeded Editor is created too (`seed.seed` insists on one), but nothing here
    ever signs in as it: every assertion is about the second account.

    `capabilities` inserts `role` as a **new** role holding exactly those, for
    the one test that needs a capability set the four seeded roles do not
    provide. It is a probe, not a fixture: it writes straight to the table
    `seed` owns, and nothing but that one test may use it.

    A **third** account is planted every time, on `VICTIM`, because eight of the
    gated routes act on a person rather than on a department. It cannot be the
    caller (D13 bans editing your own record) and it cannot be the seeded Editor
    (whose role no Admin may touch, by the subset rule); either substitution
    answers 403 for a reason that has nothing to do with the gate, which is
    precisely what `test_a_role_with_the_capability_is_not_refused_in_scope`
    would then be reading. A Reader scoped to one department, so the Admin who
    holds `manage_users` at `*` may act on it and the assertions stay about the
    gate.
    """
    n = next(_accounts)
    cfg = cfg_for(data_root, tmp_path / f"app-{n}.db")
    username = f"091200000{n:02d}"
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        if capabilities is not None:
            conn.execute("INSERT INTO roles (name, capabilities) VALUES (?, ?)",
                         (role, json.dumps(sorted(capabilities))))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        for s in scopes:
            conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                         (uid, s))
        reader = conn.execute(
            "SELECT id FROM roles WHERE name = 'reader'").fetchone()[0]
        victim = users.create(conn, username="09330000000", display_name="سوژه",
                              password_hash=hash_password(PW), role_id=reader)
        assert victim == VICTIM, (
            f"the planted account landed on id {victim}, not {VICTIM}: the"
            f" user-administration rows of GATED name a person by id and would"
            f" now be pointing at somebody else")
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                     (victim, "dept:cooking"))
        _confirm_the_whole_corpus(conn, data_root)
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
    """403, not 404: the department is in scope, so only the action is refused.

    Every *seeded* role that lacks the capability, not just one — the Admin is
    the interesting half on the `edit` routes, because an administrator who
    could edit content is the failure D50 is written to prevent and a Reader
    passing does not test it.
    """
    roles = WITHOUT[capability]
    if not roles:
        pytest.skip(f"no seeded role lacks {capability}; the route is pinned by"
                    f" test_a_role_holding_every_other_capability_is_403")
    for role in roles:
        client = _client_as(data_root, tmp_path, role, _in_scope_for(path))
        r = _call(client, method, path, body)
        assert r.status_code == 403, (
            f"{method} {path} answered {r.status_code} to a {role} in scope; it"
            f" is supposed to need {capability}, which no {role} holds")


@pytest.mark.parametrize("method,path,body,capability", GATED, ids=_ids(GATED))
def test_a_role_holding_every_other_capability_is_403(
        data_root, tmp_path, method, path, body, capability):
    """*Which* capability — the pair of seeded-role tests can only say "one of".

    `WITH` names a role that holds far more than the capability under test and
    `WITHOUT` one that lacks far more, so together they pin no more than "some
    capability in the first minus the second". Three real mis-gatings survive
    that: `GET /api/departments/{code}/processes` on `export_pdf` instead of
    `view` (which locks every `reader_no_download` holder out of *reading*),
    `GET /api/processes/{pid}` on `comment`, and `PUT /api/processes/{pid}` on
    `confirm`. `SEEDED_ROLES_CANNOT_TELL` above is the full account of why: the
    four roles hold these capabilities in blocks, and a capability is only
    pinned by two roles that differ on exactly it.

    So this test builds the role that differs on exactly it — everything except
    the one under test. Any substitution then passes the gate and the 403 does
    not arrive. It is a probe rather than a claim about a shipping role: no such
    role exists or can be created through any API (D11, D50), and this is not
    asserting one should. What it asserts is that the *gate* names the
    capability the route needs and no other — which is what the route's own
    docstring and the mapping claim, and what stops a fifth role added later
    from silently opening a route it should not.
    """
    client = _client_as(data_root, tmp_path, "all-but-this", _in_scope_for(path),
                        capabilities=ALL_CAPABILITIES - {capability})
    r = _call(client, method, path, body)
    assert r.status_code == 403, (
        f"{method} {path} answered {r.status_code} to a caller in scope holding"
        f" every capability except {capability}: it is gated on something else")


def test_the_seeded_roles_still_cannot_tell_these_capabilities_apart():
    """The premise of the probe test above, checked rather than asserted in prose.

    If a fifth role ever separates `edit` from `confirm`, or `view` from
    `comment`, then the seeded-role pair *can* pin those routes and should — and
    this failing is how anyone finds out, instead of the note above quietly
    going stale. It reads `seed.ROLES`, which is the access model itself.
    """
    # `ALL_CAPABILITIES` is the Editor's set because today it is the union of
    # all four. A role holding something the Editor does not would leave the
    # probe above holding less than "everything but one" and quietly weaken it.
    union = {c for caps in seed.ROLES.values() for c in caps}
    assert union == ALL_CAPABILITIES, (
        f"ALL_CAPABILITIES is no longer every capability: {union ^ ALL_CAPABILITIES}")

    for group in SEEDED_ROLES_CANNOT_TELL:
        for caps in seed.ROLES.values():
            held = {c for c in group if c in caps}
            assert held in (set(), set(group)), (
                f"a seeded role holds {sorted(held)} out of {list(group)}, so"
                f" those capabilities are no longer indistinguishable to the"
                f" seeded-role tests: tighten WITH/WITHOUT and update"
                f" SEEDED_ROLES_CANNOT_TELL")


@pytest.mark.parametrize("method,path,body,capability", GATED, ids=_ids(GATED))
def test_a_role_with_the_capability_is_not_refused_in_scope(
        data_root, tmp_path, method, path, body, capability):
    """The other half: over-gating a route is as wrong as under-gating it.

    A `view` route gated on `edit` refuses the Reader who is entitled to it, and
    nothing in the test above notices — every one of its assertions is about a
    refusal. The handler's own answer is not asserted here (some 422, some 409,
    the export 503 for want of an EXPORT_DIR); only that the gate let it run.
    """
    client = _client_as(data_root, tmp_path, WITH[capability],
                        _in_scope_for(path))
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

    The two visibility routes are exempt, and the exemption is the point: they
    are gated on `*`, which a `dept:dining` Editor also lacks — so they answer
    404 for a reason that has nothing to do with `cooking`, and asserting it here
    would pass for the wrong reason. Their scope refusal is pinned by
    `test_out_of_scope_and_without_the_capability_is_still_404` below, whose
    caller lacks `set_visibility` as well, and by
    `test_a_department_scoped_editor_cannot_change_the_global_policy` in
    `test_visibility_api.py`.
    """
    if path in GLOBAL_TARGET:
        pytest.skip(f"{path} is gated on `*`, not a department: a dept:dining"
                    " caller is 404'd out of it for a reason that has nothing"
                    " to do with `cooking`, and asserting 404 here would pass"
                    " for the wrong reason. Their scope refusal is pinned by"
                    " test_out_of_scope_and_without_the_capability_is_still_404"
                    " below and by test_visibility_api.py::"
                    "test_a_department_scoped_editor_cannot_change_the_global_policy.")
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

    This is the only one of the two out-of-scope tests that says anything about
    the visibility routes, and it is the one that says the most about any route:
    a caller who holds the capability and is merely out of scope is answered 404
    whichever order the gate checks in, so only a caller refused by *both* halves
    can show that scope wins.
    """
    client = _client_as(data_root, tmp_path, "reader", "dept:dining")
    r = _call(client, method, path, body)
    assert r.status_code == 404, f"{method} {path} answered {r.status_code}"


ALL_ROUTES = GATED + [("GET", p, None, None) for p in FILTERED]


@pytest.mark.parametrize("method,path,body,capability", ALL_ROUTES,
                         ids=_ids(ALL_ROUTES))
def test_a_stranger_still_gets_401_everywhere(data_root, tmp_path, method, path,
                                              body, capability):
    """Every route in `ALL_ROUTES`, filtered ones included: 401 belongs to
    neither half of the partition and must not be lost when the session gate
    becomes a capability gate — nor may a filtered route quietly serve a
    stranger an empty list."""
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


def _plant_process(data_root, pid, dept, *, stored_department=None):
    """A second real process, copied from the fixture with its ids rewritten.

    The conftest `data_root` has exactly one process, in `cooking`, which is why
    every earlier test on `POST /api/processes` could only ever reach a parent
    inside the caller's own scope. `stored_department` writes a `department`
    field that disagrees with the id, for the lexical-derivation test.
    """
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8").replace("cooking-001", pid))
    doc["department"] = stored_department or dept
    doc["pending"] = []
    (data_root / "departments" / dept / "processes" / f"{pid}.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def _activity(pid):
    """An activity node with no sub-process yet — the one a parent link may use."""
    return f"{pid}-n010"


def test_a_sub_process_cannot_be_hung_on_a_parent_outside_the_callers_scope(
        data_root, tmp_path):
    """`POST /api/processes` writes to *two* documents, so it needs two targets.

    With `parent` set the handler loads that parent from anywhere on disk and
    sets `node.subprocess` on it. Gated on `body.department` alone, an Editor
    holding one department can therefore write into every other one — the whole
    partition, from a route that looks like it only creates.
    """
    _plant_process(data_root, "dining-002", "dining")
    parent = data_root / "departments" / "dining" / "processes" / "dining-002.json"
    before = parent.read_text(encoding="utf-8")
    cooking = data_root / "departments" / "cooking" / "processes"
    files_before = sorted(p.name for p in cooking.iterdir())

    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = client.post("/api/processes", json={
        "department": "cooking", "name": "زیرفرآیند",
        "parent": {"process": "dining-002", "node": _activity("dining-002")}})

    assert r.status_code == 404, (
        f"a cooking-scoped Editor got {r.status_code} writing into dining")
    assert parent.read_text(encoding="utf-8") == before, (
        "the out-of-scope parent was mutated")
    # …and no orphan child was minted in the department they *do* hold.
    assert sorted(p.name for p in cooking.iterdir()) == files_before


def test_the_parent_link_is_not_an_existence_oracle(data_root, tmp_path):
    """A parent outside the caller's scope answers the same whether it is there.

    This is the sharper half of the leak. Un-gated, the handler answers 400 for
    a real node of the wrong type, 409 for one that already links a sub-process,
    201 for a good one, and 404 only for a parent that is not there — so a
    caller who may create *anywhere at all* could map every process id in all
    nine departments, and via "no such node" versus "not an activity" every node
    id too. That is exactly D56's Existence row.

    Status **and** body: a 404 that said "parent node not found" for one and
    something else for another would put the oracle straight back.
    """
    _plant_process(data_root, "dining-002", "dining")
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    probes = {
        "a real activity node":      {"process": "dining-002",
                                      "node": _activity("dining-002")},
        "a real node, wrong type":   {"process": "dining-002", "node": "start"},
        "a real process, no node":   {"process": "dining-002", "node": "nope"},
        "no such process":           {"process": "dining-777",
                                      "node": _activity("dining-777")},
        "no such department":        {"process": "nosuchplace-001",
                                      "node": "nosuchplace-001-n010"},
    }
    answers = {}
    for label, parent in probes.items():
        r = client.post("/api/processes", json={"department": "cooking",
                                                "name": "x", "parent": parent})
        answers[label] = (r.status_code, r.text)
    assert {v[0] for v in answers.values()} == {404}, answers
    assert len({v[1] for v in answers.values()}) == 1, answers


def test_an_in_scope_parent_still_takes_a_sub_process(data_root, tmp_path):
    """The other half of the pair: the gate must not have closed the feature.

    A second gate that refused every parent, or that asked for the wrong target,
    passes both tests above and breaks sub-processes for everyone. Both shapes
    are here — the parent in another department the caller *also* holds, and the
    everyday one where parent and child share the caller's single department.
    """
    _plant_process(data_root, "dining-002", "dining")
    node = _activity("dining-002")
    both = _client_as(data_root, tmp_path, "editor", "dept:cooking", "dept:dining")
    r = both.post("/api/processes", json={
        "department": "cooking", "name": "زیرفرآیند",
        "parent": {"process": "dining-002", "node": node}})
    assert r.status_code == 201, r.text
    child = r.json()
    assert child["parent"] == {"process": "dining-002", "node": node}
    doc = json.loads((data_root / "departments" / "dining" / "processes"
                      / "dining-002.json").read_text(encoding="utf-8"))
    assert next(n for n in doc["nodes"] if n["id"] == node)["subprocess"] == child["id"]

    one = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert one.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001",
                   "node": _activity("cooking-001")}}).status_code == 201


def test_the_parent_target_is_the_id_prefix_and_not_the_stored_department(
        data_root, tmp_path):
    """The second gate is lexical too, or it is not a gate at all.

    A target read out of the parent *document* has to open the file to decide,
    and a status chosen after the resource is resolved is a status chosen by
    existence — the very oracle the gate was added to close. The two are told
    apart by a parent whose stored `department` says `cooking` while its id says
    `dining`: lexically it is out of a cooking-scoped caller's reach, and a
    file-reading gate would wave them through.
    """
    _plant_process(data_root, "dining-002", "dining", stored_department="cooking")
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = client.post("/api/processes", json={
        "department": "cooking", "name": "x",
        "parent": {"process": "dining-002", "node": _activity("dining-002")}})
    assert r.status_code == 404, (
        "the parent gate read the department out of the file instead of the id")


def test_a_parent_that_names_no_process_reaches_nothing_wildcard_included(
        data_root, tmp_path):
    """`parent` is a free-form dict on the wire, so the target may be underivable.

    It must fail closed — a 404 like any other unreachable target — and never a
    500 or, worse, a skipped gate. Each of these is truthy, so each is a `parent`
    the handler would go on to dereference.

    **The wildcard holder is the half that means anything.** "Reaches nothing"
    has to include `*`, exactly as `contains` promises: a fallback target of `*`
    instead of an unreachable one is invisible to a department-scoped caller —
    `contains("dept:cooking", "*")` is `False`, so they get their 404 either way
    — and hands the one account that holds `*` an ungated call straight into the
    handler's dereference. Only the `*` client can tell the two apart.
    """
    scoped = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    wildcard = _client_as(data_root, tmp_path, "editor", "*")
    for parent in ({"node": "x"}, {"process": None, "node": "x"},
                   {"process": 7, "node": "x"}, {"process": "", "node": "x"}):
        for who, client in (("scoped", scoped), ("wildcard", wildcard)):
            r = client.post("/api/processes",
                            json={"department": "cooking", "parent": parent})
            assert r.status_code == 404, f"{who} {parent} answered {r.status_code}"

    # `{}` is the boundary: falsy, so the handler dereferences nothing and there
    # is no cross-scope write to gate. It is refused by the schema instead, and
    # refusing it at the gate would 404 a caller inside their own department.
    empty = scoped.post("/api/processes", json={"department": "cooking", "parent": {}})
    assert empty.status_code == 422, empty.text


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
    # A parent that names no node at all: the same answer as one that names a
    # node which is not there. This raised KeyError and answered 500.
    ("POST", "/api/processes",
     {"department": "cooking", "parent": {"process": "cooking-001"}}),
    # The registry guard, which used to answer `400 "unknown department"` in
    # English — the one branch here that a prober could read a department out of.
    ("POST", "/api/processes", {"department": "nosuchplace"}),
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


def test_a_report_scope_is_not_served_a_departments_conflicts(data_root, tmp_path):
    """The two list routes filter on different things, and this is the caller
    that shows why.

    `dept:x/report:k` is "somewhere within x": `reachable_departments` names x,
    which is right for the board — the holder has to find x there to navigate to
    the one report they were granted — and wrong for `/api/pending`, where there
    is nothing to navigate to. Every row would name a process they cannot open,
    carry its `node`, `field`, `current` and `proposed`, and then 404 on the
    endpoint that resolves it. D56: a list endpoint never returns rows it then
    declines to render.

    An Editor holding only a report scope is model-legal — nothing in D10 or D11
    ties report scopes to Readers — which is what makes this a check and not a
    note.
    """
    _plant_pending(data_root, "dining-009", "dining")
    client = _client_as(data_root, tmp_path, "editor", "dept:dining/report:steps")

    r = client.get("/api/pending")
    assert r.status_code == 200
    assert r.json() == [], "a report scope was served the department's conflicts"
    # …and it would have been a row this caller is then refused.
    assert client.post("/api/processes/dining-009/pending/0",
                       json={"decision": "reject"}).status_code == 404
    # The board is deliberately the other way: without dining in the list there
    # is no way to reach the report they hold.
    assert _codes(client) == {"dining"}


def test_the_lists_never_name_a_process_outside_the_callers_scope(data_root, tmp_path):
    """The bodies, not just the row count: a filtered list that still carried an
    out-of-scope id in some other field would pass the assertions above."""
    _plant_pending(data_root, "dining-009", "dining")
    scoped = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert "dining" not in scoped.get("/api/pending").text
    assert "dining" not in scoped.get("/api/departments").text
