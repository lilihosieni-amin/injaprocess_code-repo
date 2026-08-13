"""The delegation rule (spec D13, spec §11 test 2).

Two things this file has to pin that the seeded roles cannot pin by themselves:

* **Strictness.** The subset comparison is strict *unless* the actor holds
  `manage_peers`, and no seeded role holds `manage_users` without it — so with
  the four seeded roles alone the strict arm is unreachable and `<` and `<=`
  are the same function. `_probe_role` below exists for exactly that, and
  `DEPUTY` is the one role that walks down it.
* **The unknown role.** `role_id` arrives from a request body, so "no such
  role" is an input, not an impossibility.
"""
from __future__ import annotations

import json

import pytest
from inja_ui_backend import db, seed
from inja_ui_backend.delegation import (
    NO_MANAGE_USERS,
    NOT_A_SUBSET,
    SCOPE_NOT_COVERED,
    UNKNOWN_ROLE,
    may_delegate,
)
from inja_ui_backend.store import users

#: An Admin minus `manage_peers` — the shape D13's strict arm is written for and
#: the shape `seed.ROLES` does not contain. Kept a strict subset of `admin` and
#: a strict superset of `reader` on purpose, so one probe covers all three
#: directions: it may appoint a Reader, may not appoint its own equal, and may
#: not appoint an Admin.
DEPUTY = ("view", "comment", "export_pdf", "manage_users", "view_audit")


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _probe_role(conn, name, capabilities):
    """Insert a role the seed does not ship, for the cases the seed cannot reach.

    It writes straight to the table `seed` owns, in the stored form `seed` uses
    (`json.dumps(sorted(...))`), and it is a probe rather than a fixture — the
    same escape hatch, for the same reason, as `_client_as(..., capabilities=)`
    in `test_endpoint_matrix.py`. Nothing outside this file may use it, and no
    production path mints a role at all (D50).
    """
    conn.execute("INSERT INTO roles (name, capabilities) VALUES (?, ?)",
                 (name, json.dumps(sorted(capabilities))))


def _role(conn, name):
    return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]


def _mk(conn, username, role, *scopes):
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=_role(conn, role))
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def test_the_four_error_keys_are_pinned_strings():
    """These values, not just the names bound to them, are a wire contract.

    Every other test in this file imports the constant and never spells the
    string, so renaming all four values leaves the rest of the suite green —
    it would only surface downstream, where the endpoints task maps each key
    to a Persian message by matching this exact string.
    """
    assert NO_MANAGE_USERS == "no_manage_users"
    assert UNKNOWN_ROLE == "unknown_role"
    assert NOT_A_SUBSET == "not_a_subset"
    assert SCOPE_NOT_COVERED == "scope_not_covered"


# (actor_role, target_role, allowed) — the matrix of D13, both directions.
MATRIX = [
    ("reader", "reader", False),
    ("reader", "admin", False),
    ("reader", "editor", False),
    ("admin", "reader", True),
    ("admin", "admin", True),      # manage_peers permits equality
    ("admin", "editor", False),    # Editor is not a subset of Admin
    ("editor", "reader", True),
    ("editor", "admin", True),
    ("editor", "editor", True),
]


@pytest.mark.parametrize("actor_role,target_role,allowed", MATRIX)
def test_the_delegation_matrix(tmp_path, actor_role, target_role, allowed):
    conn = _conn(tmp_path)
    actor = _mk(conn, "09120000001", actor_role, "*")
    err = may_delegate(conn, actor, role_id=_role(conn, target_role), scopes=["*"])
    assert (err is None) is allowed, f"{actor_role} -> {target_role}: {err}"


def test_a_reader_is_refused_because_of_manage_users_not_the_subset_rule(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "*")
    assert may_delegate(conn, reader, role_id=_role(conn, "reader"),
                        scopes=["*"]) == NO_MANAGE_USERS


def test_an_admin_is_refused_a_superset_by_the_subset_rule_by_name(tmp_path):
    """`admin -> editor` is False in the matrix; this says *which* False it is.

    The matrix only asserts `err is None`, so any key at all satisfies it there
    and a refusal for the wrong reason reads as a pass.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_delegate(conn, admin, role_id=_role(conn, "editor"),
                        scopes=["*"]) == NOT_A_SUBSET


def test_an_admin_may_create_a_strict_subset_of_itself(tmp_path):
    """`reader_no_download` confers strictly less than `admin`, so it is allowed.

    This says nothing about strictness — the Admin holds `manage_peers`, so it
    would be allowed under `<=` as well. The strict arm is pinned by
    `test_without_manage_peers_an_equal_is_refused` below.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader_no_download"),
                        scopes=["*"]) is None


# --------------------------------------------------------------------------
# Strictness — the arm no seeded role can reach.
# --------------------------------------------------------------------------

def test_without_manage_peers_an_equal_is_refused(tmp_path):
    """The one test that tells `<` from `<=`. Mutate the operator and it goes red."""
    conn = _conn(tmp_path)
    _probe_role(conn, "deputy", DEPUTY)
    deputy = _mk(conn, "09120000001", "deputy", "*")
    assert may_delegate(conn, deputy, role_id=_role(conn, "deputy"),
                        scopes=["*"]) == NOT_A_SUBSET


def test_without_manage_peers_a_strict_subset_is_allowed(tmp_path):
    """Strict, not empty: the refusal above must be about equality alone."""
    conn = _conn(tmp_path)
    _probe_role(conn, "deputy", DEPUTY)
    deputy = _mk(conn, "09120000001", "deputy", "*")
    assert may_delegate(conn, deputy, role_id=_role(conn, "reader"),
                        scopes=["*"]) is None


def test_without_manage_peers_a_superset_is_refused(tmp_path):
    conn = _conn(tmp_path)
    _probe_role(conn, "deputy", DEPUTY)
    deputy = _mk(conn, "09120000001", "deputy", "*")
    assert may_delegate(conn, deputy, role_id=_role(conn, "admin"),
                        scopes=["*"]) == NOT_A_SUBSET


def test_with_manage_peers_an_equal_is_allowed(tmp_path):
    """The other side of the same line: `manage_peers` is what permits equality.

    `admin -> admin` in the matrix asserts this too; stated here beside its
    opposite so that removing the `manage_peers` branch fails a test whose name
    says what was removed.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_delegate(conn, admin, role_id=_role(conn, "admin"),
                        scopes=["*"]) is None


def test_a_peer_holder_may_still_not_exceed_itself(tmp_path):
    """`manage_peers` relaxes `<` to `<=`, and not one step further.

    The actor is `("view", "comment", "manage_users", "manage_peers")` — not
    `reader` plus `manage_peers`: it also needs `manage_users` to reach this
    branch at all, and it drops `export_pdf`, which the branch does not need.
    The target adds `view_audit`, which the actor does not hold, so the actor
    faces a role that is neither its subset nor its equal — the case that
    separates "equality is allowed" from "anything is".
    """
    conn = _conn(tmp_path)
    _probe_role(conn, "peer_reader", ("view", "comment", "manage_users",
                                      "manage_peers"))
    _probe_role(conn, "auditor", ("view", "comment", "view_audit"))
    actor = _mk(conn, "09120000001", "peer_reader", "*")
    assert may_delegate(conn, actor, role_id=_role(conn, "auditor"),
                        scopes=["*"]) == NOT_A_SUBSET


# --------------------------------------------------------------------------
# The role has to exist.
# --------------------------------------------------------------------------

def test_an_unknown_role_is_refused_rather_than_left_to_the_foreign_key(tmp_path):
    """An absent role read as the empty set is a subset of everything.

    So the natural implementation *permits* a create naming a role that does not
    exist, and the refusal then arrives from sqlite's foreign key as a 500.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    absent = conn.execute("SELECT MAX(id) + 1 FROM roles").fetchone()[0]
    assert may_delegate(conn, admin, role_id=absent, scopes=["*"]) == UNKNOWN_ROLE


def test_an_unknown_role_does_not_leak_past_the_manage_users_check(tmp_path):
    """Which role ids exist is not for someone who may appoint nobody."""
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "*")
    absent = conn.execute("SELECT MAX(id) + 1 FROM roles").fetchone()[0]
    assert may_delegate(conn, reader, role_id=absent, scopes=["*"]) == NO_MANAGE_USERS


def test_an_unknown_role_is_reported_even_when_the_scope_would_also_fail(tmp_path):
    """The role lookup runs before the scope loop, not after.

    Both checks fail here — the role does not exist, and `dept:cashier` lies
    outside the actor's `dept:dining` — so this is the one input that tells
    the two orders apart. Hoisting the scope loop above `_role_capabilities`
    (so it runs first) would answer `SCOPE_NOT_COVERED` instead; nothing else
    in this suite pins which one is meant.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    absent = conn.execute("SELECT MAX(id) + 1 FROM roles").fetchone()[0]
    assert may_delegate(conn, admin, role_id=absent,
                        scopes=["dept:cashier"]) == UNKNOWN_ROLE


def test_a_failed_subset_check_is_reported_even_when_the_scope_would_also_fail(tmp_path):
    """The subset check runs before the scope loop, not after.

    `editor` is not a subset of `admin`, and `dept:cashier` lies outside the
    actor's `dept:dining` — both checks fail, so the order between them is
    observable. Hoisting the scope loop above the role lookup (and so above
    this check too) would answer `SCOPE_NOT_COVERED` instead, which would
    make a caller reading `NOT_A_SUBSET` elsewhere in this suite as
    deliberate wrong about that.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    assert may_delegate(conn, admin, role_id=_role(conn, "editor"),
                        scopes=["dept:cashier"]) == NOT_A_SUBSET


# --------------------------------------------------------------------------
# Scope: containment, and the actor's own.
# --------------------------------------------------------------------------

def test_scope_must_be_contained_not_merely_listed(tmp_path):
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    # A report inside the actor's department is fine — containment, not membership.
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:dining/report:steps"]) is None
    # Another department is not.
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:cashier"]) == SCOPE_NOT_COVERED


def test_a_scoped_admin_cannot_widen_to_everything(tmp_path):
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["*"]) == SCOPE_NOT_COVERED


def test_containment_is_segment_wise_not_a_string_prefix(tmp_path):
    """`dept:din` must not swallow `dept:dining`.

    Both are legal scopes and one is a string prefix of the other, so this is
    the case that tells `scopes.contains` from a `startswith` written here.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:din")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:dining"]) == SCOPE_NOT_COVERED


def test_two_scopes_are_a_union_so_either_may_be_conferred(tmp_path):
    """One covering scope is enough — the actor need not hold *every* one."""
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining", "dept:cashier")
    for s in ("dept:dining", "dept:cashier", "dept:cashier/report:steps"):
        assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                            scopes=[s]) is None, s


def test_every_requested_scope_is_checked_not_only_the_first(tmp_path):
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:dining", "dept:cashier"]) == SCOPE_NOT_COVERED


def test_a_scope_the_grammar_refuses_is_covered_by_nothing_not_even_a_wildcard(tmp_path):
    """Fail closed, and identically for the `*` holder — see `scopes.contains`."""
    conn = _conn(tmp_path)
    editor = _mk(conn, "09120000001", "editor", "*")
    assert may_delegate(conn, editor, role_id=_role(conn, "reader"),
                        scopes=["dept:Dining"]) == SCOPE_NOT_COVERED


def test_an_actor_with_no_scopes_confers_none(tmp_path):
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["dept:dining"]) == SCOPE_NOT_COVERED


def test_an_empty_scope_list_is_permitted(tmp_path):
    """Vacuously covered. It describes an account that reaches nothing, which is
    a usefulness question for the request validator, not a safety one here."""
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=[]) is None


# --------------------------------------------------------------------------
# The actor's own standing.
# --------------------------------------------------------------------------

def test_a_disabled_admin_appoints_nobody(tmp_path):
    """`capabilities_of` resolves a disabled account to no capabilities.

    Note the re-read: `capabilities_of` reads `disabled_at` off the **row**, so
    a row fetched before `set_disabled` still reports every capability and this
    test would pass against an implementation that never checks at all.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    users.set_disabled(conn, admin["id"], True, now=1770000000)
    admin = users.by_id(conn, admin["id"])
    assert may_delegate(conn, admin, role_id=_role(conn, "reader"),
                        scopes=["*"]) == NO_MANAGE_USERS
