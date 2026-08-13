"""The user-administration endpoints (spec D13, D14, D15, D42, D50, D51, D52,
D54, D56, D57, D58; §11 tests 6, 7, 12, 16, 17).

`test_delegation.py`, `test_invariants.py` and `test_supervisors.py` pin the
rules; this file pins the endpoints — that each one *asks*, that it asks the
right question about the right person, that the answer arrives with the status
D56 assigns it, and that what happened is on the record.

Three things this file is deliberately careful about:

* **An out-of-scope test whose caller holds the capability proves nothing.**
  `access.requires` checks scope before capability, and both orders answer 404
  for a caller who is merely out of scope. Only a caller refused by *both* halves
  — a Reader scoped to one department — can show that scope wins, and
  `test_a_reader_outside_the_star_scope_is_404_and_never_403` is that caller. Its
  pair is the Reader who holds `*` and is answered 403.
* **A rewrite needs a second row.** `PATCH …/scopes` replaces a user's scope rows
  with `DELETE FROM user_scopes WHERE user_id = ?`, and a fixture holding one
  user's scopes cannot tell that statement from one with no `WHERE` at all. Every
  test that rewrites scopes seeds two accounts that hold them.
* **Rows are read `SELECT *`.** `users.by_id`, `list_users`' query and
  `delegation.eligible_supervisors` all return the whole row, `password_hash`
  included, so a handler that serialised one would publish the table.
  `test_no_body_this_router_serves_carries_a_password_hash` sweeps every endpoint
  for the stored hash rather than trusting the projections to stay projections.
"""
from __future__ import annotations

import itertools
import json
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, delegation, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import COOKIE_NAME, hash_password
from inja_ui_backend.routers import users as users_router
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
NEW_PW = "another-password"
BASE = "https://testserver"

#: The seeded Editor. `seed.seed` insists on one, and several tests below sign in
#: as it because an Editor is the only account that may act on another Editor.
EDITOR = "09190000000"

_seq = itertools.count()


class World:
    """One installation — its database, its app, and the accounts a test asks for.

    A class rather than a `_client_as` helper because these tests are about the
    *relationship* between two or three accounts (who may appoint whom, whose
    sessions died), so a fixture that can only produce one signed-in caller at a
    time would have every test rebuilding the same three rows.
    """

    def __init__(self, data_root, tmp_path):
        self.cfg = cfg_for(data_root, tmp_path / f"users-{next(_seq)}.db")
        with self.conn() as conn:
            db.migrate(conn)
            seed.seed(conn, editor_username=EDITOR, editor_display_name="تحلیل‌گر",
                      editor_password_hash=hash_password(PW))
        self.app = create_app(self.cfg)

    @contextmanager
    def conn(self):
        """A connection of the test's own — never the app's.

        The service holds one shared connection and may open no transaction on
        it (`db.connect`); a test reaching round the back for a row must not be
        the thing that breaks that.
        """
        conn = db.connect(self.cfg.app_db)
        try:
            yield conn
        finally:
            conn.close()

    def role_id(self, name: str) -> int:
        with self.conn() as conn:
            return conn.execute("SELECT id FROM roles WHERE name = ?",
                                (name,)).fetchone()[0]

    def add(self, username: str, role: str, *scopes: str, display: str = "کاربر",
            can_supervise: bool = False, supervisor_id: int | None = None) -> int:
        """An account written straight to the store, bypassing the API.

        Bypassing on purpose: a test about creating a user through the endpoint
        must not need the endpoint to have worked in order to have anybody to
        sign in as.
        """
        with self.conn() as conn:
            uid = users.create(conn, username=username, display_name=display,
                               password_hash=hash_password(PW),
                               role_id=self.role_id(role),
                               supervisor_id=supervisor_id,
                               can_supervise=can_supervise)
            users.set_scopes(conn, uid, sorted(set(scopes)))
        return uid

    def id_of(self, username: str) -> int:
        with self.conn() as conn:
            return users.by_username(conn, username)["id"]

    def row(self, user_id: int):
        with self.conn() as conn:
            return users.by_id(conn, user_id)

    def scopes_of(self, user_id: int) -> list[str]:
        with self.conn() as conn:
            return [r["scope"] for r in conn.execute(
                "SELECT scope FROM user_scopes WHERE user_id = ? ORDER BY scope",
                (user_id,))]

    def sign_in(self, username: str, password: str = PW) -> TestClient:
        client = TestClient(self.app, base_url=BASE)
        r = client.post("/api/auth/login",
                        json={"username": username, "password": password})
        assert r.status_code == 200, r.text
        return client

    def audit(self) -> list[dict]:
        with self.conn() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM audit_events ORDER BY id")]

    def governance(self) -> list[dict]:
        """The activity record with the sign-ins taken out.

        Every `sign_in` above writes a `login.success`, which is not what any
        test here is asserting about and would otherwise have to be subtracted in
        eleven places.
        """
        return [row for row in self.audit()
                if not row["action"].startswith("login.")]

    def count_users(self) -> int:
        with self.conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]


@pytest.fixture
def world(data_root, tmp_path):
    return World(data_root, tmp_path)


def _new_user(world: World, **over) -> dict:
    body = {"username": "09121110000", "displayName": "کاربر تازه",
            "password": PW, "roleId": world.role_id("reader"),
            "scopes": ["dept:dining"], "supervisorId": None,
            "canSupervise": False}
    body.update(over)
    return body


def _every_endpoint(user_id: int, role_id: int = 1) -> list[tuple[str, str, dict | None]]:
    """Every route this router serves, with a body that really succeeds.

    Well-formed on purpose, and *acceptable* on purpose: a malformed body is
    refused by validation on some routes and by the gate on others, so a refusal
    table built on one would compare validators rather than gates — and the
    body-sweep below would walk eight error envelopes instead of eight payloads.
    The order is the order they may be run in: the disable comes last, because
    everything above it needs the account it targets to still be live.
    """
    return [
        ("GET", "/api/users", None),
        ("GET", "/api/users/supervisor-candidates", None),
        ("GET", f"/api/users/{user_id}", None),
        ("GET", "/api/roles", None),
        ("POST", "/api/users", {"username": "09129999999", "displayName": "تازه",
                                "password": PW, "roleId": role_id,
                                "scopes": ["*"], "supervisorId": None}),
        ("PATCH", f"/api/users/{user_id}", {"displayName": "دستکاری"}),
        ("POST", f"/api/users/{user_id}/password", {"password": NEW_PW}),
        ("POST", f"/api/users/{user_id}/disabled", {"disabled": True}),
    ]


# --------------------------------------------------------------------------
# Creating
# --------------------------------------------------------------------------

def test_an_admin_creates_a_reader(world):
    """The everyday case, end to end: 201, in the list, and able to sign in."""
    world.add("09120000001", "admin", "*")
    head = world.add("09120000002", "reader", "dept:dining", can_supervise=True)
    client = world.sign_in("09120000001")

    r = client.post("/api/users", json=_new_user(world, supervisorId=head))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["username"] == "09121110000"
    assert body["role"] == "reader"
    assert body["scopes"] == ["dept:dining"]
    assert body["supervisor"]["id"] == head
    assert body["supervisor"]["disabled"] is False
    assert body["disabled"] is False

    assert "09121110000" in [u["username"] for u in client.get("/api/users").json()]
    # …and the account really works, which no assertion about the response body
    # can show: the password was hashed and the scope rows were written.
    fresh = world.sign_in("09121110000")
    assert fresh.get("/api/auth/me").json()["scopes"] == ["dept:dining"]


def test_an_admin_cannot_create_an_editor(world):
    """D13's forbidden cell. `Editor ⊄ Admin`, so no `manage_peers` equality
    saves it — and nothing is written."""
    world.add("09120000001", "admin", "*")
    client = world.sign_in("09120000001")
    before = world.count_users()

    r = client.post("/api/users", json=_new_user(
        world, roleId=world.role_id("editor"), scopes=["*"]))
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == users_router.REFUSALS[delegation.NOT_A_SUBSET]
    assert world.count_users() == before, "a refused create still wrote a row"


def test_an_editor_can_create_an_editor_because_of_manage_peers(world):
    """The other half of the same rule, or the test above passes for a router
    that refuses every create."""
    client = world.sign_in(EDITOR)
    r = client.post("/api/users", json=_new_user(
        world, roleId=world.role_id("editor"), scopes=["*"]))
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "editor"


def test_a_scope_the_grammar_refuses_is_refused_at_the_write(world):
    """`user_scopes.scope` is `TEXT NOT NULL` with no CHECK, so a typo is
    storable — and `scopes.contains` answers `False` for it, so the account it
    describes silently reaches nothing.

    400 and a sentence naming the scope, rather than the 403 `may_delegate`
    would give it (a malformed scope is covered by nobody, `*` holders included):
    the caller is inside `*` and holds `manage_users`, so what is wrong here is
    the value they typed, not their permission to type one.

    **SCOPE_NOT_COVERED is unreachable through these endpoints**, and this is the
    nearest thing to it. Every caller who passes the gate holds `*`, and `*`
    covers every scope the grammar admits — so an actor conferring a scope wider
    than their own cannot exist while user administration is `*`-only (D11).
    The rule itself is pinned in `test_delegation.py`, where it can be given a
    narrower actor.
    """
    world.add("09120000001", "admin", "*")
    client = world.sign_in("09120000001")
    before = world.count_users()
    for scope in ("dept:Dining", "dept:dining/", "department:dining", "dept:"):
        r = client.post("/api/users", json=_new_user(world, scopes=[scope]))
        assert r.status_code == 400, f"{scope!r} answered {r.status_code}"
        assert scope in r.json()["detail"]
    assert world.count_users() == before


def test_creating_with_a_persian_number_stores_the_canonical_form(world):
    """D57. Persian keyboards emit `۰۹…`, and an unfolded username is a second
    identity for one person."""
    client = world.sign_in(EDITOR)
    r = client.post("/api/users", json=_new_user(
        world, username="۰۹۱۲ ۱۱۱-۰۰۰۱", scopes=["*"]))
    assert r.status_code == 201, r.text
    assert r.json()["username"] == "09121110001"
    with world.conn() as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM users WHERE username = '09121110001'"
        ).fetchone()[0] == 1
    # …and the canonical form is what signs in.
    world.sign_in("09121110001")


def test_a_number_that_is_no_mobile_number_is_refused(world):
    """`normalise_phone` is a normaliser and not a validator: it answers
    `0cashier` for `cashier`, which is storable and signs in as nothing."""
    client = world.sign_in(EDITOR)
    before = world.count_users()
    for raw in ("cashier", "0912", "091200000012", ""):
        r = client.post("/api/users", json=_new_user(world, username=raw,
                                                     scopes=["*"]))
        assert r.status_code == 400, f"{raw!r} answered {r.status_code}"
    assert world.count_users() == before


def test_a_duplicate_number_is_refused_even_against_a_disabled_account(world):
    """D57: a disabled user keeps their number, so it cannot be handed to
    whoever inherited the line.

    The second attempt spells the same number in Persian digits, which is what
    makes this a test of the *canonical* form rather than of a string equality
    that a keyboard can walk round.
    """
    taken = world.add("09121110002", "reader", "dept:dining")
    with world.conn() as conn:
        users.set_disabled(conn, taken, True, now=1770000000)
    client = world.sign_in(EDITOR)
    before = world.count_users()

    r = client.post("/api/users", json=_new_user(world, username="09121110002",
                                                 scopes=["*"]))
    assert r.status_code == 409, r.text
    r = client.post("/api/users", json=_new_user(world, username="۰۹۱۲۱۱۱۰۰۰۲",
                                                 scopes=["*"]))
    assert r.status_code == 409, r.text
    assert world.count_users() == before


def test_a_short_password_is_refused(world):
    """D58's six-character floor, on both paths that set one."""
    victim = world.add("09121110003", "reader", "dept:dining")
    client = world.sign_in(EDITOR)
    before = world.count_users()

    r = client.post("/api/users", json=_new_user(world, password="abc",
                                                 scopes=["*"]))
    assert r.status_code == 400, r.text
    assert world.count_users() == before

    r = client.post(f"/api/users/{victim}/password", json={"password": "abc"})
    assert r.status_code == 400, r.text
    # …and the old password still works, so the refusal wrote nothing.
    world.sign_in("09121110003")


def test_a_user_who_sees_everything_needs_no_supervisor_and_everyone_else_does(world):
    """D51: the supervisor is optional for a `*` holder and required for the rest."""
    client = world.sign_in(EDITOR)
    ok = client.post("/api/users", json=_new_user(world, username="09121110004",
                                                  scopes=["*"], supervisorId=None))
    assert ok.status_code == 201, ok.text
    assert ok.json()["supervisor"] is None

    r = client.post("/api/users", json=_new_user(world, username="09121110005",
                                                 scopes=["dept:dining"],
                                                 supervisorId=None))
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == users_router.SUPERVISOR_REFUSALS[
        delegation.SUPERVISOR_REQUIRED]


def test_an_ineligible_supervisor_is_refused(world):
    """D52. The chosen person must be active, cover the scopes, and be flagged."""
    unflagged = world.add("09120000004", "reader", "dept:dining")
    narrow = world.add("09120000005", "reader", "dept:dining/report:steps",
                       can_supervise=True)
    client = world.sign_in(EDITOR)
    before = world.count_users()

    for supervisor in (unflagged, narrow):
        r = client.post("/api/users", json=_new_user(world, supervisorId=supervisor))
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == users_router.SUPERVISOR_REFUSALS[
            delegation.NOT_ELIGIBLE]
    assert world.count_users() == before


# --------------------------------------------------------------------------
# Modifying
# --------------------------------------------------------------------------

def test_a_patch_cannot_escalate_a_user_past_the_actor(world):
    """The resulting-user half of D13, through the endpoint.

    Two directions, because either alone leaves the other free: an Admin may not
    promote a Reader into an Editor (the resulting user exceeds them), and may
    not touch an Editor at all (the current one does).
    """
    world.add("09120000001", "admin", "*")
    reader = world.add("09120000002", "reader", "dept:dining")
    editor_id = world.id_of(EDITOR)
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{reader}",
                     json={"roleId": world.role_id("editor")})
    assert r.status_code == 403, r.text
    assert world.row(reader)["role_id"] == world.role_id("reader")

    r = client.patch(f"/api/users/{editor_id}", json={"displayName": "دستکاری"})
    assert r.status_code == 403, r.text
    assert world.row(editor_id)["display_name"] == "تحلیل‌گر"


def test_the_scope_rewrite_touches_only_the_user_it_names(world):
    """`DELETE FROM user_scopes` with no `WHERE` empties the table for everyone.

    Two accounts hold scopes here on purpose: with one, that statement and the
    right one are indistinguishable — and this project has already shipped a
    `DELETE` that wiped a whole table and passed all eight of its tests because
    no fixture had a second row.
    """
    world.add("09120000001", "admin", "*")
    keeper = world.add("09120000002", "reader", "dept:cashier",
                       "dept:cashier/report:steps")
    boss = world.add("09120000003", "reader", "*", can_supervise=True)
    subject = world.add("09120000004", "reader", "dept:dining",
                        supervisor_id=boss)
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{subject}",
                     json={"scopes": ["dept:cooking", "dept:dining"]})
    assert r.status_code == 200, r.text
    assert r.json()["scopes"] == ["dept:cooking", "dept:dining"]
    assert world.scopes_of(subject) == ["dept:cooking", "dept:dining"]
    assert world.scopes_of(keeper) == ["dept:cashier", "dept:cashier/report:steps"], (
        "another user's scope rows were deleted by a rewrite that named this one")
    assert world.scopes_of(world.id_of("09120000001")) == ["*"]


def test_a_patch_that_widens_scopes_re_judges_the_supervisor(world):
    """D52 is about the resulting user too.

    A supervisor eligible for `dept:dining` says nothing about `dept:dining` plus
    `dept:cashier`, so widening the scopes without replacing the supervisor is
    refused — and doing both at once is not.
    """
    world.add("09120000001", "admin", "*")
    head = world.add("09120000002", "reader", "dept:dining", can_supervise=True)
    boss = world.add("09120000003", "reader", "*", can_supervise=True)
    subject = world.add("09120000004", "reader", "dept:dining", supervisor_id=head)
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{subject}",
                     json={"scopes": ["dept:cashier", "dept:dining"]})
    assert r.status_code == 400, r.text
    assert world.scopes_of(subject) == ["dept:dining"]

    r = client.patch(f"/api/users/{subject}",
                     json={"scopes": ["dept:cashier", "dept:dining"],
                           "supervisorId": boss})
    assert r.status_code == 200, r.text
    assert world.scopes_of(subject) == ["dept:cashier", "dept:dining"]


def test_an_untouched_supervisor_is_left_alone_even_when_they_are_disabled(world):
    """D14: subordinates keep pointing at a disabled supervisor, and the screen
    surfaces the gap rather than the server silently repointing it.

    So editing a display name must not be refused because somebody *else's*
    account was disabled last week — and the payload has to carry the fact, or
    no screen can show it.
    """
    world.add("09120000001", "admin", "*")
    head = world.add("09120000002", "reader", "dept:dining", can_supervise=True)
    subject = world.add("09120000004", "reader", "dept:dining", supervisor_id=head)
    with world.conn() as conn:
        users.set_disabled(conn, head, True, now=1770000000)
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{subject}", json={"displayName": "نام تازه"})
    assert r.status_code == 200, r.text
    assert r.json()["displayName"] == "نام تازه"
    assert r.json()["supervisor"]["id"] == head
    assert r.json()["supervisor"]["disabled"] is True


def test_a_supervisor_choice_that_closes_a_loop_is_refused(world):
    """D34: two independent edits can close a loop that neither of them saw."""
    world.add("09120000001", "admin", "*")
    top = world.add("09120000002", "reader", "*", can_supervise=True)
    middle = world.add("09120000003", "reader", "*", can_supervise=True,
                       supervisor_id=top)
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{top}", json={"supervisorId": middle})
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == users_router.SUPERVISOR_REFUSALS[delegation.CYCLE]
    assert world.row(top)["supervisor_id"] is None


def test_a_number_can_be_moved_off_a_disabled_account(world):
    """D57's own answer to "how is a number freed": an administrator edits the
    disabled account first. Uniqueness still holds against every account."""
    world.add("09120000001", "admin", "*")
    left = world.add("09121110006", "reader", "*")
    with world.conn() as conn:
        users.set_disabled(conn, left, True, now=1770000000)
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{left}", json={"username": "09121110007"})
    assert r.status_code == 200, r.text
    assert world.row(left)["username"] == "09121110007"
    # …and the freed number is now available to the new employee.
    r = client.post("/api/users", json=_new_user(world, username="09121110006",
                                                 scopes=["*"]))
    assert r.status_code == 201, r.text
    # …while the one they moved to is not.
    r = client.post("/api/users", json=_new_user(world, username="09121110007",
                                                 scopes=["*"]))
    assert r.status_code == 409, r.text


def test_a_patch_that_changes_nothing_records_nothing(world):
    """A decision nobody made must not appear in the record."""
    world.add("09120000001", "admin", "*")
    subject = world.add("09120000002", "reader", "*")
    client = world.sign_in("09120000001")

    r = client.patch(f"/api/users/{subject}", json={})
    assert r.status_code == 200, r.text
    r = client.patch(f"/api/users/{subject}", json={"displayName": "کاربر"})
    assert r.status_code == 200, r.text
    assert world.governance() == []


# --------------------------------------------------------------------------
# Passwords and disabling
# --------------------------------------------------------------------------

def test_an_admin_sets_another_users_password_and_it_works(world):
    """D15: the administrator chooses the value. No token, no link, no
    round-trip — so the only proof it worked is signing in with it."""
    world.add("09120000001", "admin", "*")
    subject = world.add("09120000002", "reader", "dept:dining")
    client = world.sign_in("09120000001")

    r = client.post(f"/api/users/{subject}/password", json={"password": NEW_PW})
    assert r.status_code == 204, r.text
    assert r.text == "", "204 must carry no body"

    world.sign_in("09120000002", NEW_PW)
    stale = TestClient(world.app, base_url=BASE)
    assert stale.post("/api/auth/login", json={"username": "09120000002",
                                               "password": PW}).status_code == 401


def test_setting_a_password_revokes_all_of_that_users_sessions(world):
    """Every session, not all but one: the tab being kept alive by
    `apply_password_change` is the caller's own, and here the caller is somebody
    else entirely."""
    world.add("09120000001", "admin", "*")
    subject = world.add("09120000002", "reader", "dept:dining")
    phone = world.sign_in("09120000002")
    laptop = world.sign_in("09120000002")
    assert phone.get("/api/auth/me").status_code == 200
    assert laptop.get("/api/auth/me").status_code == 200

    admin = world.sign_in("09120000001")
    assert admin.post(f"/api/users/{subject}/password",
                      json={"password": NEW_PW}).status_code == 204

    assert phone.get("/api/auth/me").status_code == 401
    assert laptop.get("/api/auth/me").status_code == 401
    # …and the administrator's own session is untouched.
    assert admin.get("/api/auth/me").status_code == 200


def test_disabling_revokes_sessions_immediately(world):
    """D14: disabling is immediate. The session that was open a moment ago is
    gone, and the account cannot sign in again."""
    world.add("09120000001", "admin", "*")
    subject = world.add("09120000002", "reader", "dept:dining")
    theirs = world.sign_in("09120000002")
    admin = world.sign_in("09120000001")

    r = admin.post(f"/api/users/{subject}/disabled", json={"disabled": True})
    assert r.status_code == 200, r.text
    assert r.json()["disabled"] is True
    assert theirs.get("/api/auth/me").status_code == 401
    again = TestClient(world.app, base_url=BASE)
    assert again.post("/api/auth/login", json={"username": "09120000002",
                                               "password": PW}).status_code == 401
    with world.conn() as conn:
        live = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
            (subject,)).fetchone()[0]
    assert live == 0


def test_re_enabling_takes_the_same_checks_and_restores_no_session(world):
    """D14, both halves. An Admin may not re-enable an Editor — that would be
    conferring `edit` — and an account that comes back comes back signed out."""
    world.add("09120000001", "admin", "*")
    world.add("09120000002", "editor", "*")
    other_editor = world.id_of("09120000002")
    theirs = world.sign_in("09120000002")
    editor = world.sign_in(EDITOR)
    assert editor.post(f"/api/users/{other_editor}/disabled",
                       json={"disabled": True}).status_code == 200
    assert theirs.get("/api/auth/me").status_code == 401

    admin = world.sign_in("09120000001")
    r = admin.post(f"/api/users/{other_editor}/disabled", json={"disabled": False})
    assert r.status_code == 403, r.text
    assert world.row(other_editor)["disabled_at"] is not None

    r = editor.post(f"/api/users/{other_editor}/disabled", json={"disabled": False})
    assert r.status_code == 200, r.text
    assert world.row(other_editor)["disabled_at"] is None
    # The old session stays revoked: re-enabling restores the account and
    # nothing else.
    assert theirs.get("/api/auth/me").status_code == 401
    world.sign_in("09120000002")


def test_disabling_twice_records_once(world):
    """The permission check still runs on the second request — "may you do this"
    does not depend on whether it would have any effect — but nothing is written
    and nothing is recorded."""
    world.add("09120000001", "admin", "*")
    subject = world.add("09120000002", "reader", "dept:dining")
    admin = world.sign_in("09120000001")

    assert admin.post(f"/api/users/{subject}/disabled",
                      json={"disabled": True}).status_code == 200
    at = world.row(subject)["disabled_at"]
    assert admin.post(f"/api/users/{subject}/disabled",
                      json={"disabled": True}).status_code == 200
    assert world.row(subject)["disabled_at"] == at
    assert [row["action"] for row in world.governance()] == ["user.disabled"]


# --------------------------------------------------------------------------
# The self-edit ban
# --------------------------------------------------------------------------

def test_nobody_can_modify_their_own_record(world):
    """D13, on every write path — **including the password one**.

    The administrator path sets a password without re-verifying the current one,
    because the actor does not know it. Accepting the caller as their own target
    would therefore be a way round `POST /api/auth/password`'s re-verification:
    whoever walked up to an unattended back-office screen could lock the owner
    out instead of merely reading it.
    """
    world.add("09120000001", "admin", "*")
    client = world.sign_in("09120000001")
    me = world.id_of("09120000001")
    message = users_router.REFUSALS[delegation.SELF_EDIT]

    for method, path, body in (
            ("PATCH", f"/api/users/{me}", {"displayName": "دستکاری"}),
            ("POST", f"/api/users/{me}/password", {"password": NEW_PW}),
            ("POST", f"/api/users/{me}/disabled", {"disabled": True})):
        r = client.request(method, path, json=body)
        assert r.status_code == 403, f"{method} {path} answered {r.status_code}"
        assert r.json()["detail"] == message

    row = world.row(me)
    assert row["display_name"] == "کاربر"
    assert row["disabled_at"] is None
    # …and the old password still opens the account, so the refusal wrote nothing.
    world.sign_in("09120000001")


def test_the_self_edit_ban_is_not_about_what_was_submitted(world):
    """Submitting your own current values is still a self-edit.

    A rule that only fired on an *increase* would let the last `*` holder scope
    themselves down to one department and empty every candidate list D53 promises
    is non-empty.
    """
    world.add("09120000001", "admin", "*")
    client = world.sign_in("09120000001")
    me = world.id_of("09120000001")
    r = client.patch(f"/api/users/{me}",
                     json={"roleId": world.role_id("admin"), "scopes": ["*"]})
    assert r.status_code == 403, r.text
    assert world.scopes_of(me) == ["*"]


# --------------------------------------------------------------------------
# Who may reach the surface at all (D54, D56)
# --------------------------------------------------------------------------

def test_a_reader_holding_everything_is_403_on_every_endpoint(world):
    """The capability half. `*` puts them inside the target, so only
    `manage_users` can refuse them — and it must refuse with 403."""
    world.add("09120000001", "reader", "*")
    subject = world.add("09120000002", "reader", "dept:dining")
    client = world.sign_in("09120000001")
    for method, path, body in _every_endpoint(subject):
        r = client.request(method, path, json=body)
        assert r.status_code == 403, f"{method} {path} answered {r.status_code}"


def test_a_reader_outside_the_star_scope_is_404_and_never_403(world):
    """The scope half, and the pair that makes it mean something.

    This caller is refused by **both** halves. `requires` checks scope first, so
    they are answered 404 — a department head must not learn that a user
    administration surface exists at all (D54). Reversed, the same caller would
    be told 403, which is "this exists, but not for you". A test whose
    out-of-scope caller *held* `manage_users` cannot see the difference: both
    orders answer 404 for them.
    """
    world.add("09120000001", "reader", "dept:dining")
    subject = world.add("09120000002", "reader", "dept:dining")
    client = world.sign_in("09120000001")
    for method, path, body in _every_endpoint(subject):
        r = client.request(method, path, json=body)
        assert r.status_code == 404, f"{method} {path} answered {r.status_code}"


def test_a_department_scoped_admin_is_404_too(world):
    """D11: all user administration is at `*` scope.

    A scoped Admin is legal in the model and absent from the deployment, and they
    hold `manage_users` — so a gate that asked for the capability and forgot the
    target would serve them the whole company's accounts.
    """
    world.add("09120000001", "admin", "dept:dining")
    subject = world.add("09120000002", "reader", "dept:dining")
    client = world.sign_in("09120000001")
    for method, path, body in _every_endpoint(subject):
        r = client.request(method, path, json=body)
        assert r.status_code == 404, f"{method} {path} answered {r.status_code}"
    assert world.row(subject)["display_name"] == "کاربر"


def test_a_stranger_is_401_everywhere(world):
    """401 belongs to neither half of the partition and must not be lost."""
    client = TestClient(world.app, base_url=BASE)
    for method, path, body in _every_endpoint(1):
        r = client.request(method, path, json=body)
        assert r.status_code == 401, f"{method} {path} answered {r.status_code}"


def test_a_user_that_is_not_there_answers_the_gates_own_404(world):
    """Same status **and** same body as a refusal, or the prose puts back the
    existence oracle the status code just closed."""
    world.add("09120000001", "admin", "*")
    admin = world.sign_in("09120000001")
    outsider = world.add("09120000002", "reader", "dept:dining")
    refused = world.sign_in("09120000002").get("/api/users")
    assert refused.status_code == 404
    assert outsider

    missing = admin.get("/api/users/99999")
    assert missing.status_code == 404
    assert missing.text == refused.text


# --------------------------------------------------------------------------
# Roles: read-only, and filtered (D50, D56)
# --------------------------------------------------------------------------

def test_no_endpoint_creates_edits_or_deletes_a_role(world):
    """§11 test 17. Every writing verb on both paths, and the table afterwards.

    404 or 405 — never a 200, and never a 403 either, because a 403 would mean a
    route exists and is merely refusing this caller. The caller here is an Editor
    holding every capability there is, so nothing but the absence of the route
    can produce these answers.
    """
    client = world.sign_in(EDITOR)
    with world.conn() as conn:
        before = [dict(r) for r in conn.execute("SELECT * FROM roles ORDER BY id")]

    for path in ("/api/roles", "/api/roles/1", f"/api/roles/{world.role_id('admin')}"):
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            r = client.request(method, path, json={"name": "superuser",
                                                   "capabilities": ["edit"]})
            assert r.status_code in (404, 405), (
                f"{method} {path} answered {r.status_code}: something writes roles")

    with world.conn() as conn:
        after = [dict(r) for r in conn.execute("SELECT * FROM roles ORDER BY id")]
    assert after == before
    assert {r["name"] for r in after} == set(seed.ROLES)


def test_the_role_list_offers_only_what_the_actor_may_confer(world):
    """D56: a list endpoint never returns rows it then declines to render.

    An Admin offered `editor` is offered a choice `POST /api/users` refuses —
    after a name, a number and a password have been typed.
    """
    world.add("09120000001", "admin", "*")
    admin = world.sign_in("09120000001")
    offered = {r["name"] for r in admin.get("/api/roles").json()}
    assert "editor" not in offered
    assert offered == {"reader", "reader_no_download", "admin"}

    editor = world.sign_in(EDITOR)
    assert {r["name"] for r in editor.get("/api/roles").json()} == set(seed.ROLES)
    # …and the shape the picker needs.
    row = next(r for r in editor.get("/api/roles").json() if r["name"] == "reader")
    assert row["capabilities"] == sorted(seed.ROLES["reader"])
    assert row["id"] == world.role_id("reader")


# --------------------------------------------------------------------------
# The supervisor picker
# --------------------------------------------------------------------------

def test_the_candidates_path_is_not_shadowed_by_the_id_route(world):
    """`/api/users/supervisor-candidates` is registered before `/api/users/{id}`.

    Reversed, `{user_id}` swallows it — the path matches `[^/]+` whatever the
    parameter is typed as — and the picker answers 422 forever.
    """
    world.add("09120000001", "admin", "*")
    client = world.sign_in("09120000001")
    r = client.get("/api/users/supervisor-candidates")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_the_candidates_are_the_eligible_ones_with_their_scopes(world):
    """D52, over HTTP: active, covering every wanted scope, and flagged or `*`.

    `exclude` drops the user being edited, whom a picker must not offer as their
    own supervisor.
    """
    world.add("09120000001", "admin", "*")
    head = world.add("09120000002", "reader", "dept:dining", can_supervise=True,
                     display="سرپرست سالن")
    boss = world.add("09120000003", "admin", "*", display="مدیر")
    unflagged = world.add("09120000004", "reader", "dept:dining")
    gone = world.add("09120000005", "reader", "dept:dining", can_supervise=True)
    with world.conn() as conn:
        users.set_disabled(conn, gone, True, now=1770000000)
    client = world.sign_in("09120000001")

    r = client.get("/api/users/supervisor-candidates?scope=dept:dining")
    assert r.status_code == 200, r.text
    got = {row["id"] for row in r.json()}
    assert head in got, "a flagged, covering, active candidate was not offered"
    assert boss in got, "a `*` holder is a candidate whether or not they are flagged"
    assert unflagged not in got
    assert gone not in got

    # The scope beside the name — D52's own requirement for the picker.
    entry = next(row for row in r.json() if row["id"] == head)
    assert entry["displayName"] == "سرپرست سالن"
    assert entry["scopes"] == ["dept:dining"]

    # Two scopes are an intersection over candidates: a user holding both is one
    # user (D10), so the person who supervises them must reach both — which in
    # this installation means the `*` holders and nobody else. `head`, who was
    # the obvious candidate a moment ago, is gone from the list.
    both = client.get(
        "/api/users/supervisor-candidates?scope=dept:dining&scope=dept:cashier")
    everywhere = {boss, world.id_of(EDITOR), world.id_of("09120000001")}
    assert {row["id"] for row in both.json()} == everywhere
    assert head not in everywhere

    excluded = client.get(
        f"/api/users/supervisor-candidates?scope=dept:dining&exclude={head}")
    assert head not in {row["id"] for row in excluded.json()}
    assert boss in {row["id"] for row in excluded.json()}


# --------------------------------------------------------------------------
# What no body may carry
# --------------------------------------------------------------------------

def test_no_body_this_router_serves_carries_a_password_hash(world):
    """Every endpoint, swept for the stored hash itself.

    `users.by_id`, the listing query and `eligible_supervisors` all read
    `SELECT *`, so the hash is one `dict(row)` away from every payload here —
    and `argon2` hashes are long enough that a substring search over the raw
    response text is exact rather than approximate.
    """
    world.add("09120000001", "admin", "*")
    subject = world.add("09120000002", "reader", "dept:dining", can_supervise=True)
    client = world.sign_in("09120000001")
    with world.conn() as conn:
        hashes = [r["password_hash"] for r in conn.execute(
            "SELECT password_hash FROM users")]
    assert hashes and all(h.startswith("$argon2") for h in hashes)

    for method, path, body in _every_endpoint(subject, world.role_id("reader")):
        r = client.request(method, path, json=body)
        assert r.status_code in (200, 201, 204), f"{method} {path}: {r.text}"
        for h in hashes:
            assert h not in r.text, f"{method} {path} served a password hash"
        for key in ("password_hash", "passwordHash", "password"):
            assert key not in r.text, f"{method} {path} served a {key} key"


def test_a_write_runs_in_one_transaction_on_a_connection_of_its_own(world):
    """`db.connect`'s invariant, checked where this router depends on it.

    The service shares one connection across FastAPI's threadpool, and that is
    safe **only** while no handler opens a transaction on it — `db.connect` says
    so, and names creating a user with their scopes and revoking sessions when a
    password changes as the two operations that would break it. So `_write` must
    do three things, and every one of them is invisible to an end-to-end test
    driven by a single-threaded client: use a connection that is *not* the shared
    one, hold an open transaction while the block runs, and roll back when the
    block raises.

    Without the transaction the endpoints still pass every other test in this
    file — a refusal happens before the write on all of today's paths — while a
    creation interrupted between the account and its scope rows would leave a
    user who reaches nothing, which is exactly the half-written state the
    invariant exists to forbid.
    """
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(cfg=world.cfg)))
    subject = world.add("09120000009", "reader", "dept:dining")

    def name_seen_by_another_connection() -> str:
        with world.conn() as other:
            return other.execute("SELECT display_name FROM users WHERE id = ?",
                                 (subject,)).fetchone()[0]

    with users_router._write(request) as conn:
        assert conn is not world.app.state.db, (
            "the write is on the shared connection, which may carry no transaction")
        assert conn.in_transaction, "no transaction was opened"
        conn.execute("UPDATE users SET display_name = 'اول' WHERE id = ?",
                     (subject,))
        assert name_seen_by_another_connection() == "کاربر", (
            "the half-written state is visible to other readers: this write is"
            " not in a transaction")
    assert name_seen_by_another_connection() == "اول"

    with pytest.raises(RuntimeError):
        with users_router._write(request) as conn:
            conn.execute("UPDATE users SET display_name = 'دوم' WHERE id = ?",
                         (subject,))
            raise RuntimeError("a refusal, raised mid-write")
    assert name_seen_by_another_connection() == "اول", (
        "a refused write left its changes behind")


def test_every_delegation_error_key_has_a_persian_message(world):
    """A key the router cannot name reaches the caller as a generic sentence.

    `delegation.py` names ten refusals and each one means something different to
    the person reading it — "you may not appoint at all" and "not this one" are
    not the same instruction. The map is asserted total against the module rather
    than against a list copied out of it, so a key added there fails here.
    """
    keys = {value for name, value in vars(delegation).items()
            if name.isupper() and isinstance(value, str) and not name.startswith("_")}
    mapped = set(users_router.REFUSALS) | set(users_router.SUPERVISOR_REFUSALS)
    assert keys - mapped == set(), f"unmapped delegation keys: {sorted(keys - mapped)}"
    assert mapped - keys == set(), f"messages for keys that do not exist: {mapped - keys}"
    for message in list(users_router.REFUSALS.values()) + list(
            users_router.SUPERVISOR_REFUSALS.values()):
        assert message and message != users_router.GENERIC_REFUSAL
        assert not message.isascii(), f"{message!r} is not Persian"


# --------------------------------------------------------------------------
# The record (D42, §11 test 16)
# --------------------------------------------------------------------------

def test_every_governance_action_is_recorded(world):
    """All ten events D42 names, each written by the path that performs it.

    One PATCH per axis, so that the events can be told apart rather than being
    inferred from one row's detail. Every row is checked for its actor, its
    target, its session and its outcome — a record whose actor is wrong is worse
    than no record, and `session_id` is what ties a row to the sign-in that
    produced it.
    """
    world.add("09120000001", "admin", "*", display="مدیر")
    head = world.add("09120000002", "reader", "dept:dining", can_supervise=True)
    boss = world.add("09120000003", "reader", "*", can_supervise=True)
    client = world.sign_in("09120000001")
    session = client.cookies.get(COOKIE_NAME)
    assert session

    created = client.post("/api/users", json=_new_user(world, supervisorId=boss))
    assert created.status_code == 201, created.text
    uid = created.json()["id"]

    steps = [
        ({"roleId": world.role_id("admin")}, "role.assigned"),
        ({"scopes": ["dept:cashier", "dept:dining"]}, "scope.granted"),
        ({"scopes": ["dept:dining"]}, "scope.revoked"),
        ({"supervisorId": head}, "supervisor.changed"),
        ({"canSupervise": True}, "supervisor_flag.changed"),
    ]
    for body, _expected in steps:
        r = client.patch(f"/api/users/{uid}", json=body)
        assert r.status_code == 200, (body, r.text)

    assert client.post(f"/api/users/{uid}/password",
                       json={"password": NEW_PW}).status_code == 204
    assert client.post(f"/api/users/{uid}/disabled",
                       json={"disabled": True}).status_code == 200
    assert client.post(f"/api/users/{uid}/disabled",
                       json={"disabled": False}).status_code == 200

    rows = world.governance()
    actions = [row["action"] for row in rows]
    assert set(actions) == {
        "user.created", "user.modified", "user.disabled", "user.enabled",
        "password.set_by_admin", "role.assigned", "scope.granted",
        "scope.revoked", "supervisor.changed", "supervisor_flag.changed"}
    # Five modifications, five `user.modified` rows: the umbrella event is per
    # request and the axis events are per axis, and neither replaces the other.
    assert actions.count("user.modified") == len(steps)

    for row in rows:
        assert row["actor"] == "09120000001", (
            f"{row['action']} was recorded against {row['actor']!r}: the actor is"
            " the signed-in session, never anything in the body")
        assert row["target"] == "09121110000", row
        assert row["session_id"] == session, (
            f"{row['action']} carries session {row['session_id']!r}")
        assert row["outcome"] == "ok", row
        assert row["ip"] is not None and row["user_agent"] is not None


def test_the_supervisor_and_the_flag_are_separate_events(world):
    """§11 test 16 names these two explicitly, and asks for them separately.

    Toggling `can_supervise` reshapes who is *eligible* to supervise — it alters
    the org chart — without any user's supervisor field moving, so one combined
    event would miss it entirely. Each direction asserts the **absence** of the
    other, which is the half a single combined event would still pass.
    """
    world.add("09120000001", "admin", "*")
    boss = world.add("09120000002", "reader", "*", can_supervise=True)
    other = world.add("09120000003", "reader", "*", can_supervise=True)
    subject = world.add("09120000004", "reader", "dept:dining", supervisor_id=boss)
    client = world.sign_in("09120000001")

    assert client.patch(f"/api/users/{subject}",
                        json={"canSupervise": True}).status_code == 200
    actions = [r["action"] for r in world.governance()]
    assert "supervisor_flag.changed" in actions
    assert "supervisor.changed" not in actions, (
        "toggling the flag was recorded as a reassignment")

    assert client.patch(f"/api/users/{subject}",
                        json={"supervisorId": other}).status_code == 200
    latest = [r["action"] for r in world.governance()][len(actions):]
    assert "supervisor.changed" in latest
    assert "supervisor_flag.changed" not in latest, (
        "a reassignment was recorded as a flag change")


def test_a_refused_request_is_not_recorded_as_a_governance_event(world):
    """The record is written after the store write, so a refusal cannot claim one.

    `access.denied` (D42) is a different event on a different branch and is not
    this sub-project's to emit; what must not happen is a refusal arriving as
    `user.modified`.
    """
    world.add("09120000001", "admin", "*")
    reader = world.add("09120000002", "reader", "dept:dining")
    client = world.sign_in("09120000001")

    assert client.post("/api/users", json=_new_user(
        world, roleId=world.role_id("editor"), scopes=["*"])).status_code == 403
    assert client.patch(f"/api/users/{reader}",
                        json={"roleId": world.role_id("editor")}).status_code == 403
    assert client.patch(f"/api/users/{world.id_of(EDITOR)}",
                        json={"displayName": "x"}).status_code == 403
    assert world.governance() == []


def test_the_created_users_scopes_and_supervisor_are_in_the_record(world):
    """D44's permission history is "the actor of every change" — a row naming a
    creation without saying what was conferred cannot answer it."""
    world.add("09120000001", "admin", "*")
    boss = world.add("09120000002", "reader", "*", can_supervise=True)
    client = world.sign_in("09120000001")
    assert client.post("/api/users",
                       json=_new_user(world, supervisorId=boss)).status_code == 201

    row = next(r for r in world.governance() if r["action"] == "user.created")
    detail = json.loads(row["detail"])
    assert detail["role"] == "reader"
    assert detail["scopes"] == ["dept:dining"]
    assert detail["supervisor"] == boss
