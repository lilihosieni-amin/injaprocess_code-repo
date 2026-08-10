import json

import pytest

from inja_ui_backend import db, seed
from inja_ui_backend.store import users

# A literal transcription of the spec's D11 table (capability names from D9),
# docs/superpowers/specs/2026-08-04-multi-user-rbac-design.md, plus
# `reader_no_download` = view + comment from D50.
#
# Written out by hand on purpose. Every other assertion here describes a
# *relation* between the roles — nesting, one subtraction — and relations are
# satisfied by whole families of wrong tables: a typo that propagates, a bogus
# capability added to admin and editor together, `manage_users` dropped from
# both, or `reader_no_download` quietly gaining anything `reader` lacks. The
# test and the implementation must have independent sources, so that editing
# one without the other goes red.
D11 = {
    "reader": {"view", "comment", "export_pdf"},
    "reader_no_download": {"view", "comment"},
    "admin": {"view", "comment", "export_pdf",
              "manage_users", "manage_peers", "view_audit"},
    "editor": {"view", "comment", "export_pdf",
               "manage_users", "manage_peers", "view_audit",
               "edit", "confirm", "set_visibility"},
}


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    return conn


def _seed(conn):
    seed.seed(conn, editor_username="09120000000",
              editor_display_name="تحلیل‌گر", editor_password_hash="h")


def test_seeds_four_roles(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    names = {r["name"] for r in conn.execute("SELECT name FROM roles")}
    assert names == {"reader", "reader_no_download", "admin", "editor"}


def _stored_caps(conn):
    return {r["name"]: set(json.loads(r["capabilities"]))
            for r in conn.execute("SELECT name, capabilities FROM roles")}


def test_every_role_holds_exactly_the_capabilities_the_spec_names(tmp_path):
    # Pinned against the transcription above, never against seed.ROLES: a test
    # that compares the module to itself pins that what was defined got stored,
    # not that what was defined is right.
    conn = _conn(tmp_path)
    _seed(conn)
    assert _stored_caps(conn) == D11


def test_no_role_holds_a_capability_the_spec_does_not_define(tmp_path):
    # D9 defines nine and says there is no `upload` and no `run_pipeline`. A
    # capability that no authorisation check will ever consult is a permission
    # the UI can offer and nothing enforces.
    conn = _conn(tmp_path)
    _seed(conn)
    granted = set().union(*_stored_caps(conn).values())
    assert granted == D11["editor"]
    assert len(granted) == 9


def test_roles_are_strictly_nested(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    caps = {r["name"]: set(json.loads(r["capabilities"]))
            for r in conn.execute("SELECT name, capabilities FROM roles")}
    assert caps["reader"] < caps["admin"] < caps["editor"]
    # reader_no_download is a reader minus the download, and nothing else.
    assert caps["reader"] - caps["reader_no_download"] == {"export_pdf"}


def test_only_the_editor_holds_the_non_delegable_capabilities(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    for row in conn.execute("SELECT name, capabilities FROM roles"):
        held = set(json.loads(row["capabilities"])) & seed.NON_DELEGABLE
        assert held == (seed.NON_DELEGABLE if row["name"] == "editor" else set())


def test_the_editor_keeps_comment(tmp_path):
    # D11: removing it would make Reader NOT a subset of Editor, and the editor
    # could then create neither a Reader nor an Admin — every user the system has.
    conn = _conn(tmp_path)
    _seed(conn)
    caps = json.loads(conn.execute(
        "SELECT capabilities FROM roles WHERE name='editor'").fetchone()[0])
    assert "comment" in caps


def test_creates_one_user_scoped_to_everything(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    row = users.by_username(conn, "09120000000")
    assert row is not None and row["supervisor_id"] is None
    scopes = [r[0] for r in conn.execute("SELECT scope FROM user_scopes")]
    assert scopes == ["*"]


def test_seeding_twice_changes_nothing(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    _seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM roles").fetchone()[0] == 4
    # user_scopes is the one table here whose duplicate row is a real failure
    # mode: it has no UNIQUE the roles table's ON CONFLICT leans on.
    assert conn.execute("SELECT COUNT(*) FROM user_scopes").fetchone()[0] == 1


@pytest.mark.parametrize("bad", [
    "analyst",                # normalise_phone turns it into '0analyst'
    "cashier",
    "",                       # normalises to '' — no account at all
    "0912000000",             # ten digits
    "091200000000",           # twelve: `match` would accept the 11-digit prefix
    "02112345678",            # a landline is not a mobile number
])
def test_rejects_a_username_that_is_not_a_mobile_number(tmp_path, bad):
    conn = _conn(tmp_path)
    with pytest.raises(ValueError, match="canonical mobile number"):
        seed.seed(conn, editor_username=bad,
                  editor_display_name="x", editor_password_hash="h")
    # Raised *before* anything was written: a seed that half-ran and then
    # refused would leave a role table nobody asked for behind it.
    assert conn.execute("SELECT COUNT(*) FROM roles").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM user_scopes").fetchone()[0] == 0


@pytest.mark.parametrize("spelling", [
    "09120000000",
    "۰۹۱۲۰۰۰۰۰۰۰",            # Persian digits — what an ordinary keyboard emits
    "٠٩١٢٠٠٠٠٠٠٠",            # Arabic-Indic
    "+98 912 000 0000",
    "0098-912-000-0000",
    " 09120000000\n",
])
def test_accepts_every_spelling_the_login_path_accepts(tmp_path, spelling):
    # D57: normalised before storage and before comparison. Validating the raw
    # input instead would refuse the Editor a number the login path would then
    # happily authenticate — and the seed is the only way to mint that account.
    conn = _conn(tmp_path)
    seed.seed(conn, editor_username=spelling,
              editor_display_name="x", editor_password_hash="h")
    stored = [r[0] for r in conn.execute("SELECT username FROM users")]
    assert stored == ["09120000000"]


def test_the_non_delegable_set_is_exactly_the_three_capabilities():
    # Without this the "only the editor holds them" test is vacuous: an empty
    # NON_DELEGABLE satisfies it for every role in the table.
    assert seed.NON_DELEGABLE == {"edit", "confirm", "set_visibility"}


def test_the_seeded_account_holds_the_editor_role(tmp_path):
    # The point of the seed is the three capabilities no API path can mint; an
    # account wired to any other role recovers nothing.
    conn = _conn(tmp_path)
    _seed(conn)
    row = users.by_username(conn, "09120000000")
    role = conn.execute("SELECT name FROM roles WHERE id = ?",
                        (row["role_id"],)).fetchone()
    assert role["name"] == "editor"


def test_the_seeded_account_keeps_the_name_and_hash_it_was_given(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    row = users.by_username(conn, "09120000000")
    assert row["display_name"] == "تحلیل‌گر"
    assert row["password_hash"] == "h"


def test_the_seed_asserts_no_org_chart_fact(tmp_path):
    # Supervision routes comments and grants nothing; who reports to the first
    # Editor is an operator's decision, not a restart's.
    conn = _conn(tmp_path)
    _seed(conn)
    row = users.by_username(conn, "09120000000")
    assert row["supervisor_id"] is None
    assert row["can_supervise"] == 0


def test_re_seeding_leaves_the_capability_lists_alone(tmp_path):
    conn = _conn(tmp_path)
    _seed(conn)
    _seed(conn)
    caps = {r["name"]: json.loads(r["capabilities"])
            for r in conn.execute("SELECT name, capabilities FROM roles")}
    assert caps == {name: sorted(c) for name, c in seed.ROLES.items()}


def test_re_seeding_does_not_reset_the_live_account(tmp_path):
    # A restart carrying a stale password out of the environment must not
    # silently take the Editor's current one away.
    conn = _conn(tmp_path)
    _seed(conn)
    seed.seed(conn, editor_username="09120000000",
              editor_display_name="دیگری", editor_password_hash="h2")
    row = users.by_username(conn, "09120000000")
    assert row["display_name"] == "تحلیل‌گر"
    assert row["password_hash"] == "h"


def test_a_populated_database_gains_no_second_editor(tmp_path):
    # Seeding a different number into a live system would hand whoever holds the
    # environment variable an Editor account beside the real one.
    conn = _conn(tmp_path)
    _seed(conn)
    seed.seed(conn, editor_username="09120000001",
              editor_display_name="y", editor_password_hash="h2")
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert users.by_username(conn, "09120000001") is None


def test_a_failure_between_the_account_and_its_scope_leaves_neither(
        tmp_path, monkeypatch):
    # The account and its scope are two statements on an autocommit connection.
    # Written unwrapped, a crash in between leaves users=1, user_scopes=0 — and
    # the by_username guard then returns early on every later run, so the Editor
    # keeps no scope at all, forever, on the one account the system cannot
    # recreate through any API path (D50).
    conn = _conn(tmp_path)
    real_create = users.create

    def create_then_die(*args, **kwargs):
        real_create(*args, **kwargs)
        raise RuntimeError("power cut")

    monkeypatch.setattr(seed.users, "create", create_then_die)
    with pytest.raises(RuntimeError, match="power cut"):
        _seed(conn)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM user_scopes").fetchone()[0] == 0
    assert not conn.in_transaction  # not left wedged for the next writer

    # ...and because neither row landed, the retry is a plain first seed.
    monkeypatch.undo()
    _seed(conn)
    row = users.by_username(conn, "09120000000")
    assert row is not None
    scopes = [r[0] for r in conn.execute(
        "SELECT scope FROM user_scopes WHERE user_id = ?", (row["id"],))]
    assert scopes == ["*"]


def test_the_seeded_account_survives_the_connection_that_wrote_it(tmp_path):
    # A transaction opened and never committed reads back perfectly on the
    # connection that opened it — every in-process assertion passes — and then
    # sqlite rolls it back when that connection goes away. The system would come
    # up with four roles and no Editor at all, and the seed already considers
    # itself done.
    conn = _conn(tmp_path)
    _seed(conn)
    conn.close()

    reopened = db.connect(tmp_path / "app.db")
    try:
        assert reopened.execute("SELECT COUNT(*) FROM roles").fetchone()[0] == 4
        row = users.by_username(reopened, "09120000000")
        assert row is not None
        assert [r[0] for r in reopened.execute(
            "SELECT scope FROM user_scopes")] == ["*"]
    finally:
        reopened.close()


def test_the_capability_table_cannot_be_edited_through_what_it_hands_out():
    # ROLES is the access model. A consumer that got the module's own list back
    # could rewrite it for the whole process with one append.
    for name, caps in seed.ROLES.items():
        with pytest.raises(AttributeError):
            caps.append("edit")  # type: ignore[attr-defined]
        assert set(caps) == D11[name]
