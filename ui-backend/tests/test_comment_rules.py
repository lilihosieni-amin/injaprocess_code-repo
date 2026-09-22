import json

import pytest
from inja_ui_backend import comment_rules as R
from inja_ui_backend import comments_db, db, seed
from inja_ui_backend.store import comments as S
from inja_ui_backend.store import users

NOW = 1_800_000_000


@pytest.fixture
def world(tmp_path):
    app = db.connect(tmp_path / "app.db")
    db.migrate(app)
    seed.seed(app, editor_username="09190000000", editor_display_name="ادیتور",
              editor_password_hash="x")
    cc = comments_db.open_comments(tmp_path / "comments.db")
    return app, cc


def mk(app, name, role, *scopes, sup=None, can_sup=False):
    rid = app.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    n = app.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    uid = users.create(app, username=f"0912{n:07d}", display_name=name,
                       password_hash="x", role_id=rid, supervisor_id=sup,
                       can_supervise=can_sup)
    for s in scopes:
        app.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return uid


def editor_id(app):
    return app.execute("SELECT id FROM users WHERE username='09190000000'").fetchone()[0]


def post(app, cc, author_id, dept="dining"):
    author = users.by_id(app, author_id)
    cid = S.insert(cc, author=author, anchor_kind="department", anchor_id=dept,
                   process_id=None, department=dept,
                   snapshot={"department_name": "سالن"}, text="متن", now=NOW)
    R.submit(app, cc, cid, now=NOW)
    return cid


def kinds(cc, cid):
    return [(e["kind"], e["user_name"], json.loads(e["detail"] or "{}").get("reason"))
            for e in S.events(cc, cid)]


def test_kinds(world):
    app, _ = world
    r = mk(app, "r", "reader", "dept:dining")
    a = mk(app, "a", "admin", "*")
    assert R.kind_of(app, users.by_id(app, r)) == "reader"
    assert R.kind_of(app, users.by_id(app, a)) == "admin"
    assert R.kind_of(app, users.by_id(app, editor_id(app))) == "editor"


def test_a_reader_goes_to_their_reader_supervisor_first(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    head = mk(app, "head", "reader", "dept:dining", can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    c = S.get(cc, post(app, cc, viewer))
    assert (c["state"], c["stage"], c["approver_id"]) == ("awaiting", "reader", head)


def test_approval_by_the_reader_supervisor_moves_to_their_supervisor(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    top = mk(app, "top", "reader", "dept:dining", can_sup=True)
    head = mk(app, "head", "reader", "dept:dining", sup=top, can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    cid = post(app, cc, viewer)
    S.event(cc, cid, kind="approved", now=NOW, user_id=head, user_name="head")
    R.advance(app, cc, cid, from_user_id=head, now=NOW)
    assert S.get(cc, cid)["approver_id"] == top


def test_a_supervisor_who_is_an_editor_does_not_skip_the_pool(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=editor_id(app))
    c = S.get(cc, post(app, cc, viewer))
    assert (c["state"], c["stage"]) == ("awaiting", "pool")


def test_a_supervisor_who_is_an_admin_sends_to_the_pool_not_to_them(world):
    app, cc = world
    a = mk(app, "admin", "admin", "*")
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=a)
    c = S.get(cc, post(app, cc, viewer))
    assert (c["stage"], c["approver_id"]) == ("pool", None)


def test_no_supervisor_goes_to_the_pool(world):
    app, cc = world
    mk(app, "admin", "admin", "dept:dining")
    viewer = mk(app, "viewer", "reader", "dept:dining")
    assert S.get(cc, post(app, cc, viewer))["stage"] == "pool"


def test_an_admin_author_is_approved_at_once(world):
    app, cc = world
    a = mk(app, "admin", "admin", "*")
    c = S.get(cc, post(app, cc, a))
    assert (c["state"], c["stage"]) == ("approved", None)


def test_no_covering_admin_delivers_with_the_skip_recorded(world):
    app, cc = world
    mk(app, "cashier admin", "admin", "dept:cashier")
    viewer = mk(app, "viewer", "reader", "dept:dining")
    cid = post(app, cc, viewer)
    assert S.get(cc, cid)["state"] == "approved"
    assert ("delivered", "system", "no_admin") in kinds(cc, cid)


def test_a_disabled_admin_does_not_cover(world):
    app, cc = world
    a = mk(app, "admin", "admin", "*")
    users.set_disabled(app, a, True, now=NOW)
    viewer = mk(app, "viewer", "reader", "dept:dining")
    assert S.get(cc, post(app, cc, viewer))["state"] == "approved"


def test_a_disabled_reader_supervisor_is_skipped_and_recorded(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    top = mk(app, "top", "reader", "dept:dining", can_sup=True)
    head = mk(app, "head", "reader", "dept:dining", sup=top, can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    users.set_disabled(app, head, True, now=NOW)
    cid = post(app, cc, viewer)
    assert S.get(cc, cid)["approver_id"] == top
    assert ("skipped", "head", "disabled") in kinds(cc, cid)


def test_a_cycle_goes_to_the_pool_and_says_so(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    a = mk(app, "a", "reader", "dept:dining", can_sup=True)
    b = mk(app, "b", "reader", "dept:dining", sup=a, can_sup=True)
    app.execute("UPDATE users SET supervisor_id = ? WHERE id = ?", (b, a))  # a↔b
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=a)
    cid = post(app, cc, viewer)
    S.event(cc, cid, kind="approved", now=NOW, user_id=a, user_name="a")
    R.advance(app, cc, cid, from_user_id=a, now=NOW)          # → b
    S.event(cc, cid, kind="approved", now=NOW, user_id=b, user_name="b")
    R.advance(app, cc, cid, from_user_id=b, now=NOW)          # → a again: cycle
    assert S.get(cc, cid)["stage"] == "pool"
    assert ("pooled", "system", "cycle") in kinds(cc, cid)


def test_reconcile_moves_a_comment_from_a_supervisor_disabled_since(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    head = mk(app, "head", "reader", "dept:dining", can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    cid = post(app, cc, viewer)
    users.set_disabled(app, head, True, now=NOW)
    assert R.reconcile(app, cc, now=NOW + 1) == 1
    assert S.get(cc, cid)["stage"] == "pool"


def test_reconcile_delivers_a_pool_comment_whose_last_admin_went(world):
    app, cc = world
    a = mk(app, "admin", "admin", "*")
    viewer = mk(app, "viewer", "reader", "dept:dining")
    cid = post(app, cc, viewer)
    users.set_disabled(app, a, True, now=NOW)
    R.reconcile(app, cc, now=NOW + 1)
    assert S.get(cc, cid)["state"] == "approved"


def test_reconcile_leaves_healthy_comments_alone(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    viewer = mk(app, "viewer", "reader", "dept:dining")
    post(app, cc, viewer)
    assert R.reconcile(app, cc, now=NOW + 1) == 0


def test_reconcile_pools_a_comment_whose_supervisor_became_an_admin(world):
    app, cc = world
    mk(app, "admin", "admin", "*")
    top = mk(app, "top", "reader", "dept:dining", can_sup=True)
    head = mk(app, "head", "reader", "dept:dining", sup=top, can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    cid = post(app, cc, viewer)
    admin_role = app.execute("SELECT id FROM roles WHERE name='admin'").fetchone()[0]
    app.execute("UPDATE users SET role_id = ? WHERE id = ?", (admin_role, head))
    assert R.reconcile(app, cc, now=NOW + 1) == 1
    c = S.get(cc, cid)
    assert c["stage"] == "pool"
    assert ("skipped", "head", "disabled") not in kinds(cc, cid)


def test_a_cycle_with_no_covering_admin_records_both_pooled_and_delivered(world):
    app, cc = world
    mk(app, "cashier admin", "admin", "dept:cashier")
    a = mk(app, "a", "reader", "dept:dining", can_sup=True)
    b = mk(app, "b", "reader", "dept:dining", sup=a, can_sup=True)
    app.execute("UPDATE users SET supervisor_id = ? WHERE id = ?", (b, a))  # a↔b
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=a)
    cid = post(app, cc, viewer)
    S.event(cc, cid, kind="approved", now=NOW, user_id=a, user_name="a")
    R.advance(app, cc, cid, from_user_id=a, now=NOW)          # → b
    S.event(cc, cid, kind="approved", now=NOW, user_id=b, user_name="b")
    R.advance(app, cc, cid, from_user_id=b, now=NOW)          # → a again: cycle, no covering admin
    ks = kinds(cc, cid)
    assert ("pooled", "system", "cycle") in ks
    assert ("delivered", "system", "no_admin") in ks


def test_cmt_ids_round_trip():
    assert R.cmt(42) == "CMT-42"
    assert R.parse_cmt("CMT-42") == 42
    assert R.parse_cmt("cmt-42") is None
    assert R.parse_cmt("CMT-0x2") is None


def test_cmt_ids_are_bounded_and_whole():
    assert R.parse_cmt("CMT-99999999999999999999999") is None
    assert R.parse_cmt("CMT-1\n") is None
    assert R.parse_cmt("CMT-" + "9" * 18) == 10**18 - 1


def test_a_reader_stage_hop_who_is_no_longer_a_reader_cannot_decide(world):
    app, cc = world
    head = mk(app, "head", "reader", "dept:dining", can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    cid = post(app, cc, viewer)
    admin_role = app.execute("SELECT id FROM roles WHERE name='admin'").fetchone()[0]
    app.execute("UPDATE users SET role_id = ? WHERE id = ?", (admin_role, head))  # not reconciled
    a = R.actions(app, cc, users.by_id(app, head), S.get(cc, cid))
    assert not a["approve"] and not a["reject"]


def test_d66_visibility(world):
    app, cc = world
    admin = mk(app, "admin", "admin", "*")
    dining_admin = mk(app, "dining admin", "admin", "dept:dining")
    cashier_admin = mk(app, "cashier admin", "admin", "dept:cashier")
    top = mk(app, "top", "reader", "dept:dining", can_sup=True)
    head = mk(app, "head", "reader", "dept:dining", sup=top, can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    other = mk(app, "other", "reader", "dept:dining")
    cid = post(app, cc, viewer)

    def see(uid):
        return R.can_see(app, cc, users.by_id(app, uid), S.get(cc, cid))

    assert see(viewer) and see(head)                       # author; it waits with head
    assert not see(top) and not see(other)                 # not reached / not on path
    assert see(admin) and see(dining_admin) and not see(cashier_admin)
    assert see(editor_id(app))                             # read-only in flight
    S.event(cc, cid, kind="approved", now=NOW, user_id=head, user_name="head")
    R.advance(app, cc, cid, from_user_id=head, now=NOW)    # → top
    assert see(top) and see(head)                          # head keeps following it


def test_visible_sql_agrees_with_can_see(world):
    app, cc = world
    star_admin = mk(app, "star admin", "admin", "*")
    admin = mk(app, "admin", "admin", "dept:dining")
    cashier_admin = mk(app, "cashier admin", "admin", "dept:cashier")
    report_admin = mk(app, "report admin", "admin", "dept:dining/report:steps")
    top = mk(app, "top", "reader", "dept:dining", can_sup=True)
    head = mk(app, "head", "reader", "dept:dining", sup=top, can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    other = mk(app, "other", "reader", "dept:dining")
    cid = post(app, cc, viewer)
    post(app, cc, admin)
    S.event(cc, cid, kind="approved", now=NOW, user_id=head, user_name="head")
    R.advance(app, cc, cid, from_user_id=head, now=NOW)     # → top; head keeps seeing it
    for uid in (star_admin, admin, cashier_admin, report_admin, top, head, viewer, other,
                editor_id(app)):
        u = users.by_id(app, uid)
        where, params = R.visible_sql(app, u)
        by_sql = {r[0] for r in cc.execute(f"SELECT c.id FROM comments c WHERE {where}", params)}
        by_py = {r["id"] for r in cc.execute("SELECT * FROM comments")
                 if R.can_see(app, cc, u, r)}
        assert by_sql == by_py, uid


def test_actions(world):
    app, cc = world
    admin = mk(app, "admin", "admin", "*")
    cashier_admin = mk(app, "cashier admin", "admin", "dept:cashier")
    head = mk(app, "head", "reader", "dept:dining", can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    cid = post(app, cc, viewer)

    def act(uid):
        return R.actions(app, cc, users.by_id(app, uid), S.get(cc, cid))

    assert act(head)["approve"] and act(head)["reject"]
    assert not act(admin)["approve"]                        # not in the pool yet
    assert act(viewer)["edit"] and act(viewer)["withdraw"]  # no approvals yet
    S.event(cc, cid, kind="approved", now=NOW, user_id=head, user_name="head")
    R.advance(app, cc, cid, from_user_id=head, now=NOW)     # → pool
    assert act(admin)["approve"] and not act(cashier_admin)["approve"]
    assert not act(editor_id(app))["approve"]               # Editors never act in the pool
    assert not act(viewer)["edit"] and not act(viewer)["withdraw"]
    S.set_state(cc, cid, state="approved", now=NOW)
    assert act(editor_id(app))["address"] and not act(admin)["address"]


def test_rejected_is_closed_to_its_author(world):
    app, cc = world
    viewer = mk(app, "viewer", "reader", "dept:dining")
    mk(app, "admin", "admin", "*")
    cid = post(app, cc, viewer)
    S.set_state(cc, cid, state="rejected", now=NOW)
    a = R.actions(app, cc, users.by_id(app, viewer), S.get(cc, cid))
    assert not a["edit"] and not a["withdraw"]


def test_pending_count(world):
    app, cc = world
    admin = mk(app, "admin", "admin", "dept:dining")
    head = mk(app, "head", "reader", "dept:dining", can_sup=True)
    viewer = mk(app, "viewer", "reader", "dept:dining", sup=head)
    loner = mk(app, "loner", "reader", "dept:dining")
    post(app, cc, viewer)                 # waits with head
    post(app, cc, loner)                  # waits in the pool
    post(app, cc, admin)                  # approved at once

    def n(uid):
        return R.pending_count(app, cc, users.by_id(app, uid))

    assert n(head) == 1 and n(admin) == 1 and n(editor_id(app)) == 1 and n(viewer) == 0
