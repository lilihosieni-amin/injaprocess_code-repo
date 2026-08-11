import json

import pytest

from inja_ui_backend import db, seed
from inja_ui_backend.access import (allows, capabilities_of,
                                    reachable_departments, scopes_of)
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _mk(conn, username, role, *scopes):
    rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=rid)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def test_capabilities_come_from_the_role_and_nowhere_else(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    assert capabilities_of(conn, reader) == frozenset(
        {"view", "comment", "export_pdf"})


def test_the_roles_are_strictly_nested(tmp_path):
    conn = _conn(tmp_path)
    r = capabilities_of(conn, _mk(conn, "09120000001", "reader", "*"))
    a = capabilities_of(conn, _mk(conn, "09120000002", "admin", "*"))
    e = capabilities_of(conn, _mk(conn, "09120000003", "editor", "*"))
    assert r < a < e


def test_allows_needs_both_the_capability_and_the_scope(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    assert allows(conn, reader, "view", "dept:dining")
    assert not allows(conn, reader, "view", "dept:cashier")   # scope misses
    assert not allows(conn, reader, "edit", "dept:dining")    # capability misses


def test_a_department_scope_covers_reports_added_later(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    # A report kind nobody has invented yet, in the shape D10 fixes: `[a-z]+`.
    # The brief wrote `report:anything-new` here, which is not a report kind at
    # all — SCOPE_RE rejects the hyphen, exactly as it rejects `dept:dining-annex`
    # — so `contains` refuses that target and the assertion asserted the opposite
    # of what the test's name claims. The spec's grammar wins; the malformed
    # target is kept below, as the refusal it actually is.
    assert allows(conn, reader, "view", "dept:dining/report:inventedlater")
    assert not allows(conn, reader, "view", "dept:dining/report:anything-new")


def test_a_report_scope_never_widens(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining/report:steps")
    assert allows(conn, reader, "view", "dept:dining/report:steps")
    assert not allows(conn, reader, "view", "dept:dining")
    assert not allows(conn, reader, "view", "dept:dining/report:flowchart")


def test_several_scopes_on_one_user(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", "dept:dining", "dept:cashier")
    assert scopes_of(conn, head) == ("dept:cashier", "dept:dining")
    assert allows(conn, head, "view", "dept:dining")
    assert allows(conn, head, "view", "dept:cashier")
    assert not allows(conn, head, "view", "dept:logistics")


def test_reachable_departments(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", "dept:dining", "dept:cashier")
    assert reachable_departments(conn, head, "view") == {"dining", "cashier"}
    everyone = _mk(conn, "09120000002", "admin", "*")
    assert reachable_departments(conn, everyone, "view") is None   # all
    assert reachable_departments(conn, head, "edit") == set()      # no capability


def test_a_disabled_user_is_allowed_nothing(tmp_path):
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining")
    users.set_disabled(conn, reader["id"], True)
    reader = users.by_id(conn, reader["id"])
    assert not allows(conn, reader, "view", "dept:dining")


# The tests above prove less than they look. Every one of them gives its user a
# scope that covers the target it then asks about, so `and` -> `or` in the
# resolution rule survives all but one assertion; and each names one role, so a
# role holding a capability the spec withholds is invisible. Everything below
# exists so that both halves of D12, every cell of the D11 table, and every row
# shape the database can actually hold, fail somewhere.

# A hand transcription of D9 (the nine capabilities) and D11/D50 (the four
# seeded roles), written out rather than imported from `seed.ROLES`: a table
# read out of the implementation pins that the code agrees with itself.
CAPABILITIES = ("view", "comment", "export_pdf", "manage_users", "manage_peers",
                "view_audit", "edit", "confirm", "set_visibility")

D11 = {
    "reader": {"view", "comment", "export_pdf"},
    "reader_no_download": {"view", "comment"},
    "admin": {"view", "comment", "export_pdf",
              "manage_users", "manage_peers", "view_audit"},
    "editor": {"view", "comment", "export_pdf",
               "manage_users", "manage_peers", "view_audit",
               "edit", "confirm", "set_visibility"},
}


@pytest.mark.parametrize("role", sorted(D11))
def test_every_role_against_every_capability_in_both_directions(tmp_path, role):
    # An in-scope target on every row, so the scope half is satisfied throughout
    # and only the capability half can decide the answer. The refusals are the
    # point: `admin` holds no `edit`, `confirm` or `set_visibility`, and
    # `reader_no_download` no `export_pdf` (FR-E7, the reason that role exists).
    conn = _conn(tmp_path)
    user = _mk(conn, "09120000001", role, "dept:dining")
    assert capabilities_of(conn, user) == frozenset(D11[role])
    for cap in CAPABILITIES:
        assert allows(conn, user, cap, "dept:dining") is (cap in D11[role]), cap


def test_capability_alone_grants_nothing_without_a_scope(tmp_path):
    # The other half of the `and`: a full Editor with no scope row reaches
    # nothing anywhere. Under `or` every assertion here answers True.
    conn = _conn(tmp_path)
    nobody = _mk(conn, "09120000001", "editor")
    assert scopes_of(conn, nobody) == ()
    assert capabilities_of(conn, nobody) == frozenset(D11["editor"])
    for cap in CAPABILITIES:
        for target in ["*", "dept:dining", "dept:dining/report:steps"]:
            assert not allows(conn, nobody, cap, target), (cap, target)
    assert reachable_departments(conn, nobody, "view") == set()


def test_a_capability_is_matched_whole_never_by_prefix_or_substring(tmp_path):
    # Membership in a parsed set, not a substring of the stored JSON and not a
    # prefix. `""` is the sharpest of these: it is a substring of every stored
    # row, so any containment test done against the raw column grants it.
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    caps = capabilities_of(conn, admin)
    assert "view" in caps and "view_audit" in caps and "manage_users" in caps
    for near_miss in ["", " ", "v", "vie", "view_", "view ", "VIEW", "viewaudit",
                      "audit", "_audit", "manage", "manage_", "users", "peers",
                      "export", "pdf", "export_pd", "export_pdfs", "comment "]:
        assert near_miss not in caps, near_miss
        assert not allows(conn, admin, near_miss, "*"), near_miss


def test_capabilities_are_read_from_the_capabilities_column(tmp_path):
    # Reading `name` instead raises on the JSON parse; reading any fixed row
    # answers one role's set for all four. The values themselves are pinned
    # against the hand transcription above, never against this query.
    conn = _conn(tmp_path)
    for i, role in enumerate(sorted(D11)):
        user = _mk(conn, f"0912001{i:04d}", role, "*")
        stored = conn.execute("SELECT capabilities FROM roles WHERE name = ?",
                              (role,)).fetchone()[0]
        assert capabilities_of(conn, user) == frozenset(json.loads(stored))


def test_one_users_scopes_are_never_anothers(tmp_path):
    conn = _conn(tmp_path)
    dining = _mk(conn, "09120000001", "reader", "dept:dining")
    cashier = _mk(conn, "09120000002", "reader", "dept:cashier")
    assert scopes_of(conn, dining) == ("dept:dining",)
    assert scopes_of(conn, cashier) == ("dept:cashier",)
    assert not allows(conn, dining, "view", "dept:cashier")
    assert not allows(conn, cashier, "view", "dept:dining")
    # The seeded Editor holds `*`, and it is theirs alone: a scope query that
    # forgot its `user_id` would hand it to both of these.
    assert not allows(conn, dining, "view", "*")
    assert reachable_departments(conn, dining, "view") == {"dining"}
    assert reachable_departments(conn, cashier, "view") == {"cashier"}


def test_the_wildcard_scope_reaches_every_department_and_no_nonsense(tmp_path):
    conn = _conn(tmp_path)
    everyone = _mk(conn, "09120000001", "reader", "*")
    for target in ["*", "dept:dining", "dept:cashier/report:steps",
                   "dept:logistics/report:inventedlater"]:
        assert allows(conn, everyone, "view", target), target
    # A `*` holder is refused a target that names no resource, like everyone
    # else — so the layer above cannot leak who holds the wildcard through its
    # choice of status code.
    for target in ["", "nonsense", "dept:", "dept:dining-annex", "dept:Dining",
                   "dept:dining/report:steps/report:flowchart"]:
        assert not allows(conn, everyone, "view", target), target


JUNK_SCOPES = ["", " ", "nonsense", "dept:", "dept:Dining", "dept:dining ",
               "dept:dining/", "dept:dining/report:", "*/report:steps", "**",
               "dept:dining-annex", "dept:dining/report:steps/report:flowchart"]


@pytest.mark.parametrize("junk", JUNK_SCOPES)
def test_a_scope_row_that_is_not_a_scope_grants_nothing(tmp_path, junk):
    # `user_scopes.scope` is TEXT NOT NULL with no CHECK constraint, so every
    # row here is storable today. A row the grammar refuses must reach nothing —
    # not a department, not a report, not even the malformed string itself — and
    # it must name no department either, or a listing built from
    # `reachable_departments` shows a department where every click then 404s.
    conn = _conn(tmp_path)
    user = _mk(conn, "09120000001", "editor", junk)
    assert scopes_of(conn, user) == (junk,)
    for target in ["*", "dept:dining", "dept:dining/report:steps", junk]:
        assert not allows(conn, user, "view", target), target
    assert reachable_departments(conn, user, "view") == set()


def test_a_junk_scope_row_beside_a_good_one_costs_the_good_one_nothing(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", "dept:dining", "dept:dining-annex")
    assert allows(conn, head, "view", "dept:dining")
    assert not allows(conn, head, "view", "dept:dining-annex")
    assert reachable_departments(conn, head, "view") == {"dining"}


def test_a_role_id_that_resolves_to_nothing_grants_nothing(tmp_path):
    conn = _conn(tmp_path)
    user = _mk(conn, "09120000001", "editor", "*")
    # Foreign keys are enforced per connection (`db.connect` switches them on),
    # so a row pointing at no role survives a restore or any maintenance session
    # that did not. Answering `False` is the fail-closed reading; raising here
    # would turn one bad row into a 500 on every request that user makes.
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute("UPDATE users SET role_id = 4242 WHERE id = ?", (user["id"],))
    conn.execute("PRAGMA foreign_keys=ON")
    user = users.by_id(conn, user["id"])
    assert capabilities_of(conn, user) == frozenset()
    assert not allows(conn, user, "view", "*")
    assert reachable_departments(conn, user, "view") == set()


def test_reachable_departments_names_the_department_of_a_report_scope(tmp_path):
    # A listing aid, not a grant: the report reader must find `dining` in a list
    # of departments to reach their one report, and still may not view the
    # department itself. `allows` is the decision; this is never one.
    conn = _conn(tmp_path)
    reader = _mk(conn, "09120000001", "reader", "dept:dining/report:steps")
    assert reachable_departments(conn, reader, "view") == {"dining"}
    assert not allows(conn, reader, "view", "dept:dining")


def test_reachable_departments_across_mixed_scopes(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader",
               "dept:dining", "dept:cashier/report:steps", "dept:logistics")
    assert reachable_departments(conn, head, "view") == {
        "dining", "cashier", "logistics"}
    # A `*` anywhere in the set is "all departments", whatever else is held.
    everyone = _mk(conn, "09120000002", "reader", "dept:dining", "*")
    assert reachable_departments(conn, everyone, "view") is None
    # ...and only `*` is. A user holding every department the deployment has
    # today is still not a wildcard, because tomorrow's department is not theirs.
    assert reachable_departments(conn, head, "export_pdf") == {
        "dining", "cashier", "logistics"}
    assert reachable_departments(conn, head, "manage_users") == set()


def test_a_disabled_user_holds_nothing_at_all(tmp_path):
    conn = _conn(tmp_path)
    editor = _mk(conn, "09120000001", "editor", "*")
    users.set_disabled(conn, editor["id"], True)
    editor = users.by_id(conn, editor["id"])
    assert capabilities_of(conn, editor) == frozenset()
    assert scopes_of(conn, editor) == ("*",)          # the rows survive...
    for cap in CAPABILITIES:                          # ...and grant nothing
        assert not allows(conn, editor, cap, "*"), cap
    assert reachable_departments(conn, editor, "view") == set()
    # `disabled_at is not None`, not truthiness: `set_disabled` takes its
    # instant from the caller, so a `disabled_at` of 0 is a real disabling.
    users.set_disabled(conn, editor["id"], False)
    users.set_disabled(conn, editor["id"], True, 0)
    editor = users.by_id(conn, editor["id"])
    assert editor["disabled_at"] == 0
    assert capabilities_of(conn, editor) == frozenset()
    assert not allows(conn, editor, "view", "*")
    # Re-enabling restores exactly what the role says; it is a switch, not a
    # one-way door, and nothing about the account was consumed by disabling it.
    users.set_disabled(conn, editor["id"], False)
    editor = users.by_id(conn, editor["id"])
    assert capabilities_of(conn, editor) == frozenset(D11["editor"])
    assert allows(conn, editor, "edit", "dept:dining")
    assert reachable_departments(conn, editor, "view") is None
