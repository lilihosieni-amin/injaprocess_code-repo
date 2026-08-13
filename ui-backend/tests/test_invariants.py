"""The two invariants that keep an installation usable (spec D13, D14, D53).

* **Nobody edits their own record.** One line, and D53 hangs off it: the last
  active `*` holder cannot narrow their own scope or disable their own account,
  so the supervisor and delegation candidate lists are never empty.
* **The last active Editor may be neither disabled nor demoted.** D50 makes the
  seed the only origin of `edit`, `confirm` and `set_visibility`, so an
  installation that loses its last Editor cannot be recovered through any UI.

Two things this file has to be careful about, both learned the hard way:

* **A modification takes two `may_delegate` calls**, one against the resulting
  user and one against the current one, and a test that exercises only one of
  them leaves the other free. Each is pinned by an input where the *other* check
  passes, and the pair is pinned by an input where both fail with different keys.
* **Rows go stale.** `access.capabilities_of` reads `disabled_at` off the row it
  is handed, not from the database, so a row captured before `set_disabled` still
  reports every capability. Every test below re-reads after a write; one that
  does not is a test whose actor is a disabled account the code still treats as
  live, and it will pass against an implementation that checks nothing.

Refusals are asserted by their exact key, never by `is not None`: `may_modify`
has six ways to say no, and `SELF_EDIT` — the one that fires first and on the
widest range of inputs — satisfies an `is not None` written to mean anything.
"""
from __future__ import annotations

import json

from inja_ui_backend import db, seed
from inja_ui_backend.delegation import (
    LAST_EDITOR,
    NOT_A_SUBSET,
    SCOPE_NOT_COVERED,
    SELF_EDIT,
    _other_active_editors,
    _takes_the_last_editor_away,
    may_delegate,
    may_disable,
    may_modify,
)
from inja_ui_backend.store import users


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="e",
              editor_password_hash="h")
    return conn


def _probe_role(conn, name, capabilities):
    """Insert a role the seed does not ship — the idiom `test_delegation.py` sets.

    Same escape hatch, same stored form (`json.dumps(sorted(...))`), same
    restriction: nothing outside this file may use it, and no production path
    mints a role at all (D50).
    """
    conn.execute("INSERT INTO roles (name, capabilities) VALUES (?, ?)",
                 (name, json.dumps(sorted(capabilities))))


def _role(conn, name):
    return conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()[0]


def _editor(conn):
    """The seeded Editor — the only account that exists before a test makes one."""
    return users.by_username(conn, "09120000000")


def _mk(conn, username, role, *scopes):
    uid = users.create(conn, username=username, display_name=username,
                       password_hash="h", role_id=_role(conn, role))
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, s))
    return users.by_id(conn, uid)


def _disable(conn, user):
    """Disable, and hand back a **fresh** row. See the module docstring."""
    users.set_disabled(conn, user["id"], True, now=1770000000)
    return users.by_id(conn, user["id"])


def test_the_two_error_keys_are_pinned_strings():
    """These values, not the names bound to them, are a wire contract.

    Every other test imports the constant, so renaming both values leaves the
    suite green — it would surface only downstream, where the endpoints map each
    key to a Persian message by matching this exact string.
    """
    assert SELF_EDIT == "self_edit"
    assert LAST_EDITOR == "last_editor"


# --------------------------------------------------------------------------
# Nobody edits their own record.
# --------------------------------------------------------------------------

def test_nobody_may_modify_their_own_record(tmp_path):
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert may_modify(conn, editor, editor, role_id=editor["role_id"],
                      scopes=["*"]) == SELF_EDIT


def test_nobody_may_disable_their_own_record(tmp_path):
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert may_disable(conn, editor, editor) == SELF_EDIT


def test_the_self_edit_ban_is_about_identity_not_about_what_changed(tmp_path):
    """Both halves: submitting your own current values is still a self-edit, and
    so is narrowing yourself — a rule that only fired on an *increase* would let
    the last `*` holder scope themselves down to one department and empty every
    candidate list D53 promises is non-empty.
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert may_modify(conn, editor, editor, role_id=editor["role_id"],
                      scopes=["*"]) == SELF_EDIT
    assert may_modify(conn, editor, editor, role_id=editor["role_id"],
                      scopes=["dept:dining"]) == SELF_EDIT


def test_the_last_editor_demoting_themselves_is_refused_as_a_self_edit(tmp_path):
    """The self-edit ban is checked **before** the last-editor guard, and this is
    the input that tells the two orders apart.

    The seeded Editor is the only Editor, so demoting themselves is both a
    self-edit and the loss of the last Editor. `SELF_EDIT` is the honest answer:
    the account is refused because of who is asking, and a caller told
    `LAST_EDITOR` would go looking for a second Editor to appoint, appoint one,
    and be refused all over again.
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert may_modify(conn, editor, editor, role_id=_role(conn, "admin"),
                      scopes=["*"]) == SELF_EDIT


def test_a_self_edit_is_refused_as_a_self_edit_even_when_the_values_also_fail(tmp_path):
    """The identity check runs **first**, and this is what tells the order.

    An Admin submitting their own record with the Editor role fails twice over:
    they are the target, and Editor is not theirs to confer. Checked second, the
    answer would be `NOT_A_SUBSET`, which sends an administrator off to find
    someone senior enough to make the change — when no such person exists,
    because the rule is about who is asking and not about what was asked for.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_modify(conn, admin, admin, role_id=_role(conn, "editor"),
                      scopes=["*"]) == SELF_EDIT


def test_someone_else_may_still_be_modified(tmp_path):
    """The positive control for the identity check.

    Inverted (`!=` for `==`), the ban refuses every edit in the system and
    permits only self-edits; without this test the inversion is invisible,
    because every other case here expects a refusal of some kind.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_modify(conn, _editor(conn), admin, role_id=_role(conn, "reader"),
                      scopes=["*"]) is None


# --------------------------------------------------------------------------
# D13 over a modification: the resulting user *and* the current one.
# --------------------------------------------------------------------------

def test_an_admin_may_not_promote_a_reader_to_editor(tmp_path):
    """The resulting-user check, on the escalation D13 exists to prevent.

    An Admin cannot *create* an Editor, and without this check they could reach
    the same account in two steps by creating a Reader and then promoting it.
    This is the one place in the file where the first `may_delegate` call fails
    with `NOT_A_SUBSET`. `test_the_resulting_user_is_judged_before_the_current_one`
    below also exercises the first call — but on a scope failure, not a
    capability one — and exists to pin the *order* of the two calls, not this key.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    reader = _mk(conn, "09120000002", "reader", "*")
    assert may_modify(conn, admin, reader, role_id=_role(conn, "editor"),
                      scopes=["*"]) == NOT_A_SUBSET


def test_an_admin_may_not_demote_an_editor_to_reader(tmp_path):
    """The current-user check: the actor must already be able to reach what the
    target holds *now*, or an Admin could rewrite an account whose access exceeds
    their own.

    Reader is a subset of Admin, so the resulting-user check passes and only the
    second one stands between an Admin and the Editor's record.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_modify(conn, admin, _editor(conn), role_id=_role(conn, "reader"),
                      scopes=["*"]) == NOT_A_SUBSET


def test_an_admin_may_not_narrow_a_user_whose_scope_exceeds_their_own(tmp_path):
    """The scope half of the same check, which the capability half cannot cover.

    Both roles here are Reader, so the subset comparison passes in both
    directions and only scope separates the two calls: the actor holds
    `dept:dining`, the requested scope is inside it, and the target's current `*`
    is not. Without the current-user check a departmental Admin could take over
    an account with reach across the whole restaurant by narrowing it into their
    own department first.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    wide_reader = _mk(conn, "09120000002", "reader", "*")
    assert may_modify(conn, admin, wide_reader, role_id=_role(conn, "reader"),
                      scopes=["dept:dining"]) == SCOPE_NOT_COVERED


def test_the_resulting_user_is_judged_before_the_current_one(tmp_path):
    """The one input where both checks fail, and with **different** keys.

    Resulting: role Reader (fine for an Admin) scoped `*` (outside the actor's
    `dept:dining`) — `SCOPE_NOT_COVERED`. Current: role Editor (not a subset of
    Admin) scoped `dept:dining` (inside the actor's) — `NOT_A_SUBSET`. Swap the
    two calls' arguments and the answer swaps with them, which no test asserting
    a single failing check can see.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "dept:dining")
    local_editor = _mk(conn, "09120000002", "editor", "dept:dining")
    assert may_modify(conn, admin, local_editor, role_id=_role(conn, "reader"),
                      scopes=["*"]) == SCOPE_NOT_COVERED


def test_an_editor_may_re_role_another_editor(tmp_path):
    """The positive control for both calls: an actor entitled to confer the
    resulting user *and* to reach the current one is refused nothing.

    A second active Editor exists, so the last-editor guard has nothing to say
    either — this is the shape a permitted demotion actually takes.
    """
    conn = _conn(tmp_path)
    second = _mk(conn, "09120000001", "editor", "*")
    assert may_modify(conn, second, _editor(conn), role_id=_role(conn, "admin"),
                      scopes=["*"]) is None


# --------------------------------------------------------------------------
# Disabling, and re-enabling, which is the same decision.
# --------------------------------------------------------------------------

def test_an_admin_may_not_disable_an_editor(tmp_path):
    """Disabling is a change to someone's access, so it takes the same check.

    `NOT_A_SUBSET` by name: an Admin is refused because the Editor's capabilities
    are not theirs to touch, which is a different refusal from the last-editor
    guard and from the self-edit ban.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    assert may_disable(conn, admin, _editor(conn)) == NOT_A_SUBSET


def test_an_admin_may_not_re_enable_an_editor_either(tmp_path):
    """The other direction, and the reason the two are one function: re-enabling
    restores capabilities the actor does not hold (D14).
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    disabled = _disable(conn, _editor(conn))
    assert may_disable(conn, admin, disabled) == NOT_A_SUBSET


def test_an_editor_may_disable_another_editor(tmp_path):
    """The positive control for the disable direction, with an Editor left over.

    Without it, `may_disable` returning a refusal for everything would satisfy
    every other assertion in this section.
    """
    conn = _conn(tmp_path)
    second = _mk(conn, "09120000001", "editor", "*")
    assert may_disable(conn, second, _editor(conn)) is None


def test_an_editor_may_re_enable_a_disabled_editor(tmp_path):
    """The positive control for the enable direction.

    It is the input that separates "may change the disabled flag" from "may
    disable", and the only one that can: every other assertion about this
    function is a refusal, so a `may_disable` that turned every touch of a
    disabled account away — the easiest thing to write once "disabling is
    refused" is in your head — would satisfy all of them and none of this.
    """
    conn = _conn(tmp_path)
    second = _mk(conn, "09120000001", "editor", "*")
    disabled = _disable(conn, _editor(conn))
    assert may_disable(conn, second, disabled) is None


# --------------------------------------------------------------------------
# D53 — the last `*` holder, held up by the self-edit ban and by scope.
# --------------------------------------------------------------------------

def test_the_last_star_holder_cannot_disable_themselves(tmp_path):
    """D53 carries its own test because it is not enforced by a rule of its own.

    The seeded Editor is the only `*` holder. Nothing counts `*` holders
    anywhere; what keeps this one alive is the self-edit ban, so a later
    relaxation of it must fail a test that names D53.
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    assert may_disable(conn, editor, editor) == SELF_EDIT


def test_the_last_star_holder_cannot_be_disabled_by_a_narrower_account(tmp_path):
    """The other half of D53: nobody else can reach them either.

    The actor is a *full* Editor — capabilities are no obstacle, and the
    capability half of `may_delegate` passes — but scoped to one department,
    so the target's `*` lies outside it. Between this and the self-edit ban there
    is no account left that may disable the last `*` holder.
    """
    conn = _conn(tmp_path)
    local_editor = _mk(conn, "09120000001", "editor", "dept:dining")
    assert may_disable(conn, local_editor, _editor(conn)) == SCOPE_NOT_COVERED


# --------------------------------------------------------------------------
# D14 — the last Editor, and why its guard never fires.
# --------------------------------------------------------------------------

def test_only_an_account_that_confers_edit_may_act_on_an_editor(tmp_path):
    """The premise the last-editor guard is unreachable *by*, pinned on its own.

    `delegation._takes_the_last_editor_away` cannot answer True through either
    caller, and the whole proof rests on this one sentence: `may_delegate`
    against an Editor passes only for an actor whose own capabilities include
    the Editor's. The actor is then an active Editor other than the target, so
    a second one always survives.

    Assert the sentence, not the guard. If the subset rule is ever relaxed — a
    "user administrator" role permitted to touch accounts above it, say — this
    goes red and names the guard, instead of the guard quietly becoming the only
    lock in the system and nobody noticing it had never run.
    """
    conn = _conn(tmp_path)
    editor_role = _role(conn, "editor")
    passed = []
    for n, (name, caps) in enumerate(seed.ROLES.items()):
        actor = _mk(conn, f"091200000{n + 10}", name, "*")
        if may_delegate(conn, actor, role_id=editor_role, scopes=["*"]) is None:
            passed.append(name)
            assert seed.NON_DELEGABLE <= frozenset(caps), name
    # The loop above only asserts inside the `if`, so a change that makes
    # `may_delegate` refuse the Editor role for every seeded role — including
    # Editor itself — would leave it green while the premise it exists to state
    # goes untested. Assert which roles actually passed, so "only an account
    # that confers edit may act on one" cannot pass by never being checked.
    assert passed == ["editor"], passed


def test_an_admin_cannot_take_the_last_editor_away_by_either_verb(tmp_path):
    """What actually protects the last Editor in production, stated as one test.

    The refusal is `NOT_A_SUBSET` in both directions and never `LAST_EDITOR`:
    the delegation rule turns an Admin away before the invariant is consulted,
    and the invariant is the second lock behind it. Delete the current-user check
    from `may_modify` and the demotion below comes back `LAST_EDITOR` instead —
    still refused, and by the guard this section is named for.
    """
    conn = _conn(tmp_path)
    admin = _mk(conn, "09120000001", "admin", "*")
    editor = _editor(conn)
    assert may_disable(conn, admin, editor) == NOT_A_SUBSET
    assert may_modify(conn, admin, editor, role_id=_role(conn, "reader"),
                      scopes=["*"]) == NOT_A_SUBSET


def test_the_editor_count_is_by_capability_by_liveness_and_excludes_its_argument(tmp_path):
    """A private helper tested directly, and deliberately.

    The guard it feeds cannot answer "no Editor left" through either public
    function (proof in `delegation.py`), so a test going through them can only
    ever watch it say no. This is the only thing standing between the counting
    rule and silent rot — and the day the premise above moves, the count has to
    already be right rather than be discovered wrong.

    Four mutants, one fixture. `chief` confers exactly what Editor confers under
    another name, so a count reading `roles.name` sees none of it. `scribe`
    confers `edit` and neither of the other two, so a count satisfied by any one
    of the three sees one too many. The disabled Editor is on file but confers
    nothing (`capabilities_of`), so a count without the liveness filter sees one
    too many as well. And the excluded id is the argument's whole purpose.
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    _probe_role(conn, "chief", seed.ROLES["editor"])
    _probe_role(conn, "scribe", ("view", "comment", "edit"))
    chief = _mk(conn, "09120000001", "chief", "*")
    _disable(conn, _mk(conn, "09120000002", "editor", "*"))
    admin = _mk(conn, "09120000003", "admin", "*")
    _mk(conn, "09120000004", "scribe", "*")

    # By capability: `chief` is an Editor in every sense D14 cares about, and
    # `scribe` is not — an installation left with only `scribe` can edit and can
    # confirm nothing it edits.
    assert _other_active_editors(conn, excluding=editor["id"]) == 1
    assert _other_active_editors(conn, excluding=chief["id"]) == 1
    # The Admin is neither counted nor, being excluded, missed: both remain.
    assert _other_active_editors(conn, excluding=admin["id"]) == 2


def test_the_last_editor_guard_decides_every_case_it_is_written_for(tmp_path):
    """The guard's own decision, pinned where it can be observed at all.

    Both callers refuse an Admin long before this predicate runs, and every actor
    who *does* reach it is an active Editor other than the target — which is the
    proof that it never answers True in production, and equally the reason no
    test through `may_modify` or `may_disable` can watch it answer anything but
    False. D14 requires the rule regardless, so its decision is pinned here
    rather than left to be discovered wrong on the day the subset rule moves and
    this becomes the only lock.

    The `is True` / `is False` are deliberate: this returns a bool that two
    callers turn into an error key, and `assert not ...` would accept `None`
    from a mutant that fell off the end of the function.
    """
    conn = _conn(tmp_path)
    _probe_role(conn, "scribe", ("view", "comment", "edit"))
    editor = _editor(conn)
    admin_role = _role(conn, "admin")

    # The seeded Editor is the only one. Demoting them takes the last one away…
    assert _takes_the_last_editor_away(conn, editor, resulting_role_id=admin_role) is True
    # …and so does disabling them, which is what `None` says: the account ends up
    # conferring nothing whatever its role still reads.
    assert _takes_the_last_editor_away(conn, editor, resulting_role_id=None) is True
    # Re-roling them to a role that still confers all three takes nobody away.
    assert _takes_the_last_editor_away(
        conn, editor, resulting_role_id=_role(conn, "editor")) is False
    # …to one conferring `edit` alone, it does: the installation would be left
    # able to edit and unable to confirm a word of it.
    assert _takes_the_last_editor_away(
        conn, editor, resulting_role_id=_role(conn, "scribe")) is True

    # Accounts that never conferred all three are not the guard's business,
    # whether they confer none of them or one.
    admin = _mk(conn, "09120000001", "admin", "*")
    scribe = _mk(conn, "09120000002", "scribe", "*")
    assert _takes_the_last_editor_away(conn, admin, resulting_role_id=None) is False
    assert _takes_the_last_editor_away(conn, scribe, resulting_role_id=None) is False

    # An already-disabled Editor is not counted, so nothing done to them can take
    # the last *active* one away — asserted here, while they are still the only
    # Editor on file, because with a second one alive every answer is False
    # anyway and the clause would be pinned by nothing. This is what lets the
    # same predicate answer for a re-enable.
    assert _takes_the_last_editor_away(
        conn, _disable(conn, editor), resulting_role_id=None) is False

    # And with a second Editor active, the first may be demoted after all — the
    # same call that answered True on the first line of this test.
    users.set_disabled(conn, editor["id"], False)
    editor = users.by_id(conn, editor["id"])
    _mk(conn, "09120000003", "editor", "*")
    assert _takes_the_last_editor_away(conn, editor, resulting_role_id=admin_role) is False


def test_the_guard_is_the_second_lock_when_the_actors_row_is_stale(tmp_path):
    """The belt-and-braces case: a stale actor row, used deliberately.

    `may_delegate`'s docstring warns that `capabilities_of` reads `disabled_at`
    off the row it is handed, not off the database, so a row captured before
    the account was disabled still reports every capability. Both `may_modify`
    and `may_disable` document themselves as depending on a caller who re-reads
    the actor after any write — `auth.current_user` does this in production,
    re-reading per request and refusing a disabled one — but neither function
    can enforce that on its own, and this module deliberately does not know the
    caller has that property.

    So: capture a second Editor's row *before* disabling them (not a hand-built
    dict — a row read straight from `users.by_id`, the way a caller who forgot
    to re-read actually ends up holding one), disable that same account, and
    then act with the stale row. `may_delegate` passes on the strength of the
    stale row (it still says active), which is exactly why `LAST_EDITOR` is a
    second lock and not a restatement of the subset rule: the count inside
    `_takes_the_last_editor_away` reads the database, where the second Editor
    really is gone, and the seeded Editor really is the only one left.
    """
    conn = _conn(tmp_path)
    editor = _editor(conn)
    editor_role = _role(conn, "editor")
    admin_role = _role(conn, "admin")

    second = _mk(conn, "09120000001", "editor", "*")
    stale_second = second  # captured before the write below makes it stale
    users.set_disabled(conn, second["id"], True, now=1770000000)
    # `second` is now disabled in the database; `stale_second` still reports
    # `disabled_at IS NULL`, because it is the same row object read before that
    # write happened.

    # Disabling the seeded Editor, argued for by a stale actor who (per the
    # database) is no longer an Editor at all: the last active Editor would be
    # taken away, and the guard is what stops it.
    assert may_disable(conn, stale_second, editor) == LAST_EDITOR
    # Demoting the seeded Editor to Admin, argued for by the same stale actor:
    # same guard, the other caller.
    assert may_modify(conn, stale_second, editor, role_id=admin_role,
                      scopes=["*"]) == LAST_EDITOR
    # Re-roling the seeded Editor to Editor — a change that keeps them an
    # Editor — is not refused: `_takes_the_last_editor_away` must read the
    # *submitted* `role_id` for the resulting check, not silently treat every
    # call as a disable. (A `resulting_role_id=None` passed by mistake in
    # `may_modify` cannot tell this case apart from the line above, since the
    # count is zero either way — that mutant is caught here, not there.)
    assert may_modify(conn, stale_second, editor, role_id=editor_role,
                      scopes=["*"]) is None


# --------------------------------------------------------------------------
# Carried forward from spec test-plan item 5: no sequence of disable,
# scope-narrowing or role-change may empty the `*` holders. Disabling and
# self-edit are covered above; this is the scope-narrowing half, aimed at
# someone else's last `*`.
# --------------------------------------------------------------------------

def test_the_last_star_holder_cannot_be_narrowed_by_a_narrower_account(tmp_path):
    """D53 by scope-narrowing, not just by disabling.

    Mirrors `test_the_last_star_holder_cannot_be_disabled_by_a_narrower_account`:
    a full Editor scoped to one department cannot narrow the seeded Editor's `*`
    down to that department either, and for the same reason — the current-user
    check in `may_modify` requires the actor to already reach what the target
    holds *now*, and `dept:dining` does not reach `*`.
    """
    conn = _conn(tmp_path)
    local_editor = _mk(conn, "09120000001", "editor", "dept:dining")
    editor_role = _role(conn, "editor")
    assert may_modify(conn, local_editor, _editor(conn), role_id=editor_role,
                      scopes=["dept:dining"]) == SCOPE_NOT_COVERED
