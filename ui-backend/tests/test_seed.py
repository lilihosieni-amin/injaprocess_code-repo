import json

from inja_ui_backend import db, seed
from inja_ui_backend.store import users


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


def test_rejects_a_username_that_is_not_a_mobile_number(tmp_path):
    conn = _conn(tmp_path)
    try:
        seed.seed(conn, editor_username="analyst",
                  editor_display_name="x", editor_password_hash="h")
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_rejects_a_username_carrying_stray_whitespace(tmp_path):
    # The canonical form is the whole form (D57): `$` alone would admit a
    # trailing newline, and the seed would then have validated a string other
    # than the one it stores.
    conn = _conn(tmp_path)
    try:
        seed.seed(conn, editor_username="09120000000\n",
                  editor_display_name="x", editor_password_hash="h")
        raised = False
    except ValueError:
        raised = True
    assert raised


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
