"""Who may supervise whom (spec D51, D52, D53, spec §11 test 3).

The supervisor axis grants nothing. `can_supervise` is asserted about a person by
a holder of `manage_users`, never derived from what that person may do, so the
tests below are careful to keep the two apart: a `reader_no_download` who carries
the flag is eligible and an Admin who does not is not.

Three things this file has to be careful about, all of them learned elsewhere in
this package:

* **Coverage is `scopes.contains` and nothing else.** Two scopes on a *candidate*
  are a union (either may cover a want), two scopes on the *user being supervised*
  are a conjunction (every one must be covered). The `any`/`all` pair is the
  natural place to get that backwards, so both directions have an input that
  tells them apart, and the report-scope cases pin the argument order.
* **Disabled is read from the database, not from a row.** `access.capabilities_of`
  reads `disabled_at` off the row it is handed; this module's liveness filter is
  a `WHERE` clause, so `set_disabled` alone is enough here and no re-read is
  needed. The sequence test below still re-reads, because it drives
  `may_disable`, which does take a row.
* **D53 is a claim about sequences.** A fixture with one `*` holder in it can
  only assert that the seed exists; it says nothing about whether anything could
  take it away. The two are named apart below.
"""
from __future__ import annotations

from inja_ui_backend import db, seed
from inja_ui_backend.delegation import (
    CYCLE,
    NO_MANAGE_USERS,
    NOT_ELIGIBLE,
    SCOPE_NOT_COVERED,
    SELF_EDIT,
    SUPERVISOR_REQUIRED,
    SUPERVISOR_SELF,
    eligible_supervisors,
    may_disable,
    may_modify,
    supervisor_error,
)
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _role(conn, name):
    return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]


def _editor(conn):
    """The seeded Editor — the only account, and the only `*`, before a test makes one."""
    return users.by_username(conn, "09120000000")


def _mk(conn, username, role, scopes, *, can_supervise=False, supervisor=None):
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=_role(conn, role),
                       supervisor_id=supervisor, can_supervise=can_supervise)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def _names(rows):
    return {r["username"] for r in rows}


def test_the_four_error_keys_are_pinned_strings():
    """These values, not the names bound to them, are a wire contract.

    Every other test here imports the constant and never spells the string, so
    renaming all four values leaves this file green — it would surface only
    downstream, where the endpoints map each key to a Persian message by matching
    the exact string.
    """
    assert SUPERVISOR_REQUIRED == "required"
    assert SUPERVISOR_SELF == "self"
    assert NOT_ELIGIBLE == "not_eligible"
    assert CYCLE == "cycle"


# --------------------------------------------------------------------------
# The eligibility table (D52), one case per row.
# --------------------------------------------------------------------------

def test_a_department_user_may_be_supervised_by_a_head_or_a_star_holder(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    _mk(conn, "09120000002", "reader", ["dept:dining"])          # no flag
    _mk(conn, "09120000003", "reader", ["dept:cashier"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining"])
    assert _names(got) == {"09120000000", head["username"]}


def test_a_report_scoped_user_has_the_same_candidates(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining/report:steps"])
    assert _names(got) == {"09120000000", head["username"]}


def test_a_report_scoped_head_does_not_cover_the_whole_department(tmp_path):
    """The other direction of the same containment, and the one that leaks.

    Together with the test above this pins the argument order: `contains(theirs,
    wanted)`. Reversed, the pair swaps — a head of one report would supervise the
    whole department, and the department head would stop supervising the report.
    """
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:dining/report:steps"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining"])
    assert _names(got) == {"09120000000"}


def test_a_two_department_user_needs_someone_who_covers_both(tmp_path):
    # The rule, not the deployment's incidental answer: a can_supervise user
    # holding BOTH departments qualifies by exactly the same test.
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    both = _mk(conn, "09120000002", "reader", ["dept:dining", "dept:cashier"],
               can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining", "dept:cashier"])
    assert _names(got) == {"09120000000", both["username"]}


def test_one_covered_scope_out_of_two_is_not_enough(tmp_path):
    """The `all`-over-wants half, stated where it cannot be read as anything else.

    The test above asserts a set, so it also fails if `both` goes missing —
    which is the *other* mutant. This one asserts the single-department head is
    absent while a covering candidate exists in the same fixture, so the only
    way to pass it is to require every want to be covered.
    """
    conn = _conn(tmp_path)
    dining_only = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:dining", "dept:cashier"])
    assert dining_only["username"] not in _names(got)
    assert _names(got) == {"09120000000"}


def test_a_candidates_own_scopes_are_a_union(tmp_path):
    """The inner `any`, which the multi-department case alone does not pin.

    `both` covers `dept:cashier` with its second scope and not its first, so an
    `all` written over the candidate's own scopes drops them from a list they
    plainly belong in.
    """
    conn = _conn(tmp_path)
    both = _mk(conn, "09120000001", "reader", ["dept:dining", "dept:cashier"],
               can_supervise=True)
    got = eligible_supervisors(conn, scopes=["dept:cashier"])
    assert _names(got) == {"09120000000", both["username"]}


def test_a_star_scoped_user_may_only_be_supervised_by_a_star_holder(tmp_path):
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    got = eligible_supervisors(conn, scopes=["*"])
    assert _names(got) == {"09120000000"}


def test_coverage_is_segment_wise_not_a_string_prefix(tmp_path):
    """`dept:din` must not swallow `dept:dining`.

    Both are legal scopes and one is a string prefix of the other, so this is the
    input that tells `scopes.contains` from a `startswith` written here.
    """
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:din"], can_supervise=True)
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"])) == {"09120000000"}


def test_a_scope_the_grammar_refuses_is_covered_by_nobody_not_even_a_star_holder(tmp_path):
    """Fail closed, and identically for the `*` holder — see `scopes.contains`.

    The empty list here is not a counter-example to D53: `dept:Dining` is a scope
    no actor may confer either (`may_delegate` answers SCOPE_NOT_COVERED for it),
    so no user can be created holding it and no picker is ever asked about it.
    """
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    assert eligible_supervisors(conn, scopes=["dept:Dining"]) == []


def test_an_empty_scope_list_is_vacuously_covered(tmp_path):
    """Same reading as `may_delegate`'s: "every scope is covered" over none of them.

    It describes an account that reaches nothing, which is a usefulness question
    for the request validator and not a decision about who may supervise.
    """
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    assert _names(eligible_supervisors(conn, scopes=[])) == {"09120000000",
                                                            head["username"]}


# --------------------------------------------------------------------------
# The flag, and only the flag.
# --------------------------------------------------------------------------

def test_eligibility_is_the_flag_and_never_the_role(tmp_path):
    """D51 in one fixture: `can_supervise` grants nothing and is implied by nothing.

    The Admin holds `manage_users` over this department and is *not* a candidate;
    the `reader_no_download` may not even download and is. Any implementation
    that reaches for capabilities — the tempting shortcut once "head of
    department" is in your head — fails both halves.
    """
    conn = _conn(tmp_path)
    _mk(conn, "09120000001", "admin", ["dept:dining"])
    junior = _mk(conn, "09120000002", "reader_no_download", ["dept:dining"],
                 can_supervise=True)
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"])) == {
        "09120000000", junior["username"]}


def test_a_star_holder_is_a_candidate_without_the_flag(tmp_path):
    """The other arm of the disjunction. The seeded Editor carries no flag.

    Asserted about the flag directly, because every other test in this file that
    expects the seeded Editor would also pass if `*` were quietly implemented as
    "the seed is special".
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert editor["can_supervise"] == 0
    starred = _mk(conn, "09120000001", "reader", ["*"])
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"])) == {
        "09120000000", starred["username"]}


def test_disabled_users_are_never_eligible(tmp_path):
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    users.set_disabled(conn, head["id"], True)
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"])) == {"09120000000"}


# --------------------------------------------------------------------------
# The picker's own promises: order, and who is left out of it.
# --------------------------------------------------------------------------

def test_the_candidate_order_is_stable_and_is_not_the_insertion_order(tmp_path):
    """A picker whose first entry moves between two identical requests is a picker
    whose default answer moves with it.

    The three accounts are inserted in an order the sort has to undo, so a
    missing `ORDER BY` — which sqlite answers in rowid order, i.e. insertion
    order — fails rather than passing by accident.
    """
    conn = _conn(tmp_path)
    for name in ("09120000003", "09120000001", "09120000002"):
        _mk(conn, name, "reader", ["dept:dining"], can_supervise=True)
    got = [r["username"] for r in eligible_supervisors(conn, scopes=["dept:dining"])]
    assert got == ["09120000000", "09120000001", "09120000002", "09120000003"]


def test_the_user_being_edited_is_left_out_when_they_are_named(tmp_path):
    """`excluding` is the edit form's argument; the create form has nobody to pass.

    Without it the picker offers the user themselves and `supervisor_error` then
    refuses the only entry the form made look reasonable. It removes exactly one
    id — the second assertion is what stops it from removing a candidate class.
    """
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    other = _mk(conn, "09120000002", "reader", ["dept:dining"], can_supervise=True)
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"])) == {
        "09120000000", head["username"], other["username"]}
    assert _names(eligible_supervisors(conn, scopes=["dept:dining"],
                                       excluding=head["id"])) == {
        "09120000000", other["username"]}


# --------------------------------------------------------------------------
# D53 — the list is never empty, which is a claim about sequences.
# --------------------------------------------------------------------------

def test_the_seeded_star_holder_covers_a_department_nobody_is_on(tmp_path):
    """What a one-row fixture can actually prove: `*` covers a department with no
    users on it, so a brand-new department's first user still has a candidate.

    This is **not** D53. D53 says no sequence of operations can empty the list,
    and the sequence is pinned by the test below plus the self-edit and
    scope-narrowing tests in `test_invariants.py`.
    """
    conn = _conn(tmp_path)
    assert _names(eligible_supervisors(conn, scopes=["dept:logistics"])) == {
        "09120000000"}


def test_no_sequence_of_permitted_edits_can_empty_the_candidate_list(tmp_path):
    """D53 in the shape the rule is actually stated in (spec §11 test 5).

    Every route to removing the last `*` holder is driven through the guard that
    governs it and refused; then the one sequence that *is* permitted — appoint a
    second `*` Editor, disable the first through them — is carried out for real,
    with the list asserted non-empty at every step. The survivor ends up in
    exactly the position the seed was in, which is what makes this a loop nobody
    can walk out of rather than a single lucky fixture.

    `may_disable` and `may_modify` take rows, so the disabled account is re-read
    before it is used as an actor: `capabilities_of` reads `disabled_at` off the
    row, and a stale one would report every capability it used to hold.
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    editor_role = _role(conn, "editor")
    # A full Editor, scoped to one department and flagged: capabilities are no
    # obstacle for them, only scope is.
    local = _mk(conn, "09120000001", "editor", ["dept:dining"], can_supervise=True)

    def candidates():
        return _names(eligible_supervisors(conn, scopes=["dept:dining"]))

    assert candidates() == {"09120000000", "09120000001"}

    # The last `*` holder cannot stand down: not by disabling themselves, not by
    # narrowing their own scope.
    assert may_disable(conn, editor, editor) == SELF_EDIT
    assert may_modify(conn, editor, editor, role_id=editor_role,
                      scopes=["dept:dining"]) == SELF_EDIT
    # Nor can the only other account reach them — `dept:dining` does not cover `*`.
    assert may_disable(conn, local, editor) == SCOPE_NOT_COVERED
    assert may_modify(conn, local, editor, role_id=editor_role,
                      scopes=["dept:dining"]) == SCOPE_NOT_COVERED
    assert candidates() == {"09120000000", "09120000001"}

    # The permitted sequence: a second `*` Editor is appointed, and only then may
    # the first be disabled at all.
    second = _mk(conn, "09120000002", "editor", ["*"])
    assert may_disable(conn, second, editor) is None
    users.set_disabled(conn, editor["id"], True, now=1770000000)
    assert candidates() == {"09120000001", "09120000002"}

    # …and the sequence has moved the lock rather than opened it: the survivor is
    # now the account nobody can reach.
    assert may_disable(conn, second, second) == SELF_EDIT
    assert may_disable(conn, local, second) == SCOPE_NOT_COVERED
    stood_down = users.by_id(conn, editor["id"])
    assert may_disable(conn, stood_down, second) == NO_MANAGE_USERS
    assert candidates() == {"09120000001", "09120000002"}


# --------------------------------------------------------------------------
# The choice itself: self, eligibility, and cycles.
# --------------------------------------------------------------------------

def test_a_supervisor_is_required_unless_the_user_sees_everything(tmp_path):
    """D51: every user has a supervisor, except users scoped `*`, for whom it is
    optional — and `None` here is a submitted value, not an unset field."""
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"])
    assert supervisor_error(conn, a["id"], None, ["dept:dining"]) == SUPERVISOR_REQUIRED
    assert supervisor_error(conn, a["id"], None, ["*"]) is None
    # On the create form there is no target yet, and the rule is unchanged.
    assert supervisor_error(conn, None, None, ["dept:dining"]) == SUPERVISOR_REQUIRED


def test_a_supervisor_outside_the_chain_is_accepted(tmp_path):
    """The positive control. Every other assertion below is a refusal, so without
    this one an implementation refusing every choice would satisfy them all."""
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    staff = _mk(conn, "09120000002", "reader", ["dept:dining"])
    assert supervisor_error(conn, staff["id"], head["id"], ["dept:dining"]) is None
    assert supervisor_error(conn, None, head["id"], ["dept:dining"]) is None


def test_someone_outside_the_list_is_refused_as_not_eligible(tmp_path):
    """Active and covering, but unflagged — the one refusal that is about the
    candidate rather than about the shape of the graph."""
    conn = _conn(tmp_path)
    plain = _mk(conn, "09120000001", "reader", ["dept:dining"])
    staff = _mk(conn, "09120000002", "reader", ["dept:dining"])
    assert supervisor_error(conn, staff["id"], plain["id"],
                            ["dept:dining"]) == NOT_ELIGIBLE


def test_a_disabled_supervisor_is_refused_by_the_same_key(tmp_path):
    """The list and the check cannot disagree, because the check *is* the list."""
    conn = _conn(tmp_path)
    head = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    staff = _mk(conn, "09120000002", "reader", ["dept:dining"])
    users.set_disabled(conn, head["id"], True)
    assert supervisor_error(conn, staff["id"], head["id"],
                            ["dept:dining"]) == NOT_ELIGIBLE


def test_self_supervision_is_refused(tmp_path):
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    assert supervisor_error(conn, a["id"], a["id"], ["dept:dining"]) == SUPERVISOR_SELF


def test_self_is_refused_as_self_even_when_they_are_also_ineligible(tmp_path):
    """The identity check runs first, and this is the input that tells the order.

    An unflagged user proposing themselves fails twice over. Answered
    `not_eligible`, the form would send an administrator off to set
    `can_supervise` on the account — after which the answer would be `self`
    anyway, and the flag would have been set for nothing.
    """
    conn = _conn(tmp_path)
    plain = _mk(conn, "09120000001", "reader", ["dept:dining"])
    assert supervisor_error(conn, plain["id"], plain["id"],
                            ["dept:dining"]) == SUPERVISOR_SELF


def test_a_cycle_is_refused(tmp_path):
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    b = _mk(conn, "09120000002", "reader", ["dept:dining"], can_supervise=True,
            supervisor=a["id"])
    # a -> b would close the loop a -> b -> a.
    assert supervisor_error(conn, a["id"], b["id"], ["dept:dining"]) == CYCLE


def test_a_cycle_three_hops_up_is_refused_too(tmp_path):
    """The walk is a walk, not a look at the candidate's own supervisor.

    a <- b <- c already exists; making c supervise a closes a three-hop loop that
    only shows up two levels above the proposed supervisor. A one-level check
    passes the test above and fails this one.
    """
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    b = _mk(conn, "09120000002", "reader", ["dept:dining"], can_supervise=True,
            supervisor=a["id"])
    c = _mk(conn, "09120000003", "reader", ["dept:dining"], can_supervise=True,
            supervisor=b["id"])
    assert supervisor_error(conn, a["id"], c["id"], ["dept:dining"]) == CYCLE


def test_a_cycle_already_in_the_data_terminates_the_walk(tmp_path):
    """Two independent edits can close a loop this function never saw (D34), so the
    walk has to survive one that is already there.

    The `UPDATE` is deliberate and could not be produced through
    `supervisor_error` — that is the point: routing is specified to be cycle-safe
    *because* assignment-time checks cannot catch every loop. `c` is outside the
    loop, so the honest answer is `None`.

    Without the visited set this test does not go red, it **hangs** — an
    unbounded walk over a graph that can contain a loop wedges the worker thread
    handling the request rather than answering wrongly. That is the failure this
    line exists to prevent, and it is why the assertion is the weaker-looking
    `is None` rather than an error key.
    """
    conn = _conn(tmp_path)
    a = _mk(conn, "09120000001", "reader", ["dept:dining"], can_supervise=True)
    b = _mk(conn, "09120000002", "reader", ["dept:dining"], can_supervise=True,
            supervisor=a["id"])
    conn.execute("UPDATE users SET supervisor_id = ? WHERE id = ?", (b["id"], a["id"]))
    c = _mk(conn, "09120000003", "reader", ["dept:dining"])
    assert supervisor_error(conn, c["id"], a["id"], ["dept:dining"]) is None
