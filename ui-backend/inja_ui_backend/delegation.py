"""Who may appoint whom, and what may never be taken away (spec D13, D14).

    may_delegate(conn, actor, role_id=…, scopes=…)
      ⟺ actor.capabilities ∋ manage_users
      ∧ role(role_id).capabilities ⊂ actor.capabilities
        (⊆ when actor.capabilities ∋ manage_peers)
      ∧ ∀ s ∈ scopes : ∃ a ∈ actor.scopes : a contains s

    may_modify(conn, actor, target, role_id=…, scopes=…)
      ⟺ actor ≠ target
      ∧ may_delegate(actor, role_id, scopes)              — the resulting user
      ∧ may_delegate(actor, target.role, target.scopes)   — the current one
      ∧ ¬ this change takes the last active Editor away

    may_disable(conn, actor, target)
      ⟺ actor ≠ target
      ∧ may_delegate(actor, target.role, target.scopes)
      ∧ ¬ disabling takes the last active Editor away

Two independent checks over one role and one scope list, applied identically to
creating a user and to changing one — a modification is judged against the
**resulting** user, never the delta, because "you may only add what you hold"
lets two permitted edits compose into an account past the editor's own. And
against the current user as well, which is a second check and not a restatement
of the first: the resulting user alone forbids an Admin from creating an Editor
while leaving them free to promote an existing Reader into one, and the current
user alone forbids them from touching an Editor while leaving them free to hand
a Reader every capability there is.

Capability is a strict subset by default: an administrator hands out less than
they hold, so an account cannot clone itself and the number of people who can
appoint does not grow by one every time somebody is appointed. `manage_peers`
is the capability that says otherwise, and it is a capability rather than a rank
precisely so that "may appoint an equal" is one bit in one role row rather than
a comparison between two users.

The two checks are independent on purpose. Capability asks *what* the new
account may do and scope asks *where*; an administrator of one department who
could confer a wider scope than their own would be an administrator of every
department by way of a proxy, and one who could confer capabilities they lack
would be an editor by the same route.

Nothing here knows HTTP, and every refusal is one of the four keys below rather
than a bool — the caller has to say *why* in Persian, and a bool would leave it
guessing between "you may not appoint at all" and "not this one".

One exception, stated rather than hidden: `_role_capabilities`'s `json.loads`
raises on a malformed role row, for the reason `access.py` gives at module
level for the identical read — the seed is the only writer, so a malformed row
means the database was edited by hand, and failing loudly beats resolving a
role to no capabilities and quietly permitting its delegation.

`seed.NON_DELEGABLE` is deliberately **not** consulted *by the delegation rule*.
`edit`, `confirm` and `set_visibility` are withheld by the subset rule itself —
an Admin cannot confer them because the Editor role is not a subset of theirs —
and the reason they can never be conferred by a *new* role is that no code path
mints a role at all (D50, `seed.py`). Re-stating the list there would give that
guarantee a second home and a second place to forget it, and would additionally
forbid the one case D13 permits: an Editor holding `manage_peers` appointing
another Editor. The last-Editor guard below *does* consult it, because it asks
the other question — not "may this be conferred" but "does this installation
still confer it at all", which is the question those three names were coined for.

Containment is never decided here: `scopes.contains` is the sole authority, and
re-deciding any part of it in this module is how the two would come to disagree.
"""
from __future__ import annotations

import json
import sqlite3

from .access import capabilities_of, scopes_of
from .scopes import contains
from .seed import NON_DELEGABLE

#: The actor may not appoint anybody at all.
NO_MANAGE_USERS = "no_manage_users"
#: `role_id` names no row. Its own key rather than a refusal folded into
#: NOT_A_SUBSET, and checked rather than left to the write: `roles` has no row
#: with that id, so the INSERT would die on the foreign key (`db.connect` sets
#: `PRAGMA foreign_keys=ON`) and a caller who mistyped a role id would be told
#: about it with a 500. A missing role is also the one input where the subset
#: rule silently answers the wrong way — an absent row read as the empty set is
#: a subset of everything, so it *permits*.
UNKNOWN_ROLE = "unknown_role"
#: The role confers something the actor does not hold — or exactly what the
#: actor holds, when they lack `manage_peers`.
NOT_A_SUBSET = "not_a_subset"
#: Some requested scope lies outside every scope the actor holds.
SCOPE_NOT_COVERED = "scope_not_covered"
#: The actor and the target are the same account. Nobody edits their own record
#: (D13); changing your own password from the profile page is the sole exception
#: and does not come through here. D53 rests on this key: the last active `*`
#: holder cannot narrow their own scope or disable their own account, so the
#: candidate lists that rule promises are never empty.
SELF_EDIT = "self_edit"
#: The change would leave the installation with no active Editor (D14). D53 does
#: not imply it — an Admin scoped `*` satisfies that rule while the system has no
#: `edit`, `confirm` or `set_visibility` at all — and D50 makes the seed the only
#: way back.
LAST_EDITOR = "last_editor"


def _role_capabilities(conn: sqlite3.Connection,
                       role_id: int) -> frozenset[str] | None:
    """The capabilities of one role, or `None` when there is no such role.

    `None` rather than `frozenset()`, and the distinction is the whole reason
    this function exists separately from `access.capabilities_of`: the empty set
    is a legal answer (a role conferring nothing is storable) and it is a strict
    subset of every non-empty set, so collapsing "no such role" into it turns
    the missing row into a *permission*.

    The `json.loads` is left to raise on a malformed row for the reason
    `access.py` gives at length: the seed is the only writer, so a malformed row
    means the database was edited by hand, and failing loudly beats resolving a
    role to no capabilities and quietly permitting its delegation.
    """
    row = conn.execute("SELECT capabilities FROM roles WHERE id = ?",
                       (role_id,)).fetchone()
    if row is None:
        return None
    return frozenset(json.loads(row["capabilities"]))


def may_delegate(conn: sqlite3.Connection, actor: sqlite3.Row, *, role_id: int,
                 scopes: list[str]) -> str | None:
    """Return an error key, or `None` when the actor may do this.

    `actor` is a row, and `capabilities_of` reads `disabled_at` off **that row**
    rather than from the database — so a row captured before the account was
    disabled still reports every capability. Callers holding a row across a
    write must re-read it; this function cannot do it for them without deciding,
    on its own, that the row it was handed is stale.

    An empty `scopes` is permitted: the loop below is vacuously satisfied, which
    is the honest reading of "every scope is covered" and describes an account
    that reaches nothing at all. Refusing it would be a usefulness rule, not a
    safety one, and it belongs where the request is validated.

    A `scopes` entry the grammar refuses is covered by nothing — `contains`
    answers `False` for a malformed target even to a `*` holder — so it comes
    back SCOPE_NOT_COVERED rather than being conferred unchecked.
    """
    # `capabilities_of`, never a direct read of the role row: it is where the
    # disabled account is resolved to no capabilities, and a disabled
    # administrator who could still appoint people would make D14's revocation
    # a formality.
    actor_caps = capabilities_of(conn, actor)
    if "manage_users" not in actor_caps:
        # First, and before the role is so much as looked up: which role ids
        # exist is not something to tell somebody who may not appoint anybody.
        return NO_MANAGE_USERS

    target_caps = _role_capabilities(conn, role_id)
    if target_caps is None:
        return UNKNOWN_ROLE
    # Reading `manage_peers` off `target_caps` instead is an equivalent mutant,
    # and no test can kill it — over every actor/target capability pair, on any
    # capability model, not only today's. `<=` and `<` differ only when the two
    # sets are equal, and on an equal pair `target_caps` and `actor_caps` are the
    # same set, so the two reads necessarily agree there. On every *unequal*
    # pair the two branches already compute the same thing — `<=` is `<` or
    # `==`, and `==` is false — so which one is picked cannot matter, and the two
    # reads are free to disagree without it showing. This is a theorem of the
    # branch structure (`<` vs `<=`, chosen once), not a fact about
    # `manage_peers` or about which capabilities exist: no capability, present
    # or future, held by only one side can make the two readings diverge. Kept
    # on the actor because D13 is a statement about who is appointing, not
    # because the target-side read would ever score differently. What *would*
    # break this: a third branch, or the `<`/`<=` pair being replaced by
    # something that no longer collapses to one comparison on unequal sets —
    # that is the change to re-check this comment against, not a new
    # capability.
    if "manage_peers" in actor_caps:
        if not target_caps <= actor_caps:
            return NOT_A_SUBSET
    elif not target_caps < actor_caps:      # strict: no cloning yourself
        return NOT_A_SUBSET

    actor_scopes = scopes_of(conn, actor)
    for s in scopes:
        # `any`, not `all`: two scopes are a union, so a holder of `dept:dining`
        # and `dept:cashier` may appoint into either. And the arguments are
        # (holder, requested) in that order — reversed, an admin scoped to one
        # report could appoint across the whole department.
        if not any(contains(a, s) for a in actor_scopes):
            return SCOPE_NOT_COVERED
    return None


def _confers_edit(conn: sqlite3.Connection, role_id: int) -> bool:
    """Does this role carry all three capabilities D50 keeps out of every other?

    By capability, never by `roles.name`. The name is a label; `edit`, `confirm`
    and `set_visibility` are the thing D14 protects, and a rule reading the label
    would answer "no Editor left" about an installation whose seed had grown a
    second edit-conferring role under another name — refusing a change D14
    permits, and deciding it from a string rather than from the capability model
    every other decision in this package is made from. `seed.py` reads the name
    for a neighbouring question and says why it may: it decides whether to seed,
    and never what a request may do.

    All three, not any one: D14 names the three together, and a role conferring
    `edit` without `confirm` leaves an installation that cannot confirm anything.
    Under D50 no such role exists, so this is a statement of which reading is
    meant rather than a case that arises.
    """
    caps = _role_capabilities(conn, role_id)
    # An unknown role confers nothing — the same fail-closed reading as
    # `_role_capabilities`' `None`, and it cannot arise from `may_modify`, whose
    # `may_delegate` call has already answered UNKNOWN_ROLE for that id.
    return caps is not None and NON_DELEGABLE <= caps


def _other_active_editors(conn: sqlite3.Connection, *, excluding: int) -> int:
    """How many active accounts other than `excluding` still confer `edit`.

    Counted in Python rather than in SQL because "confers edit" is a question
    about a JSON array; the SQL that would fit on one line asks
    `roles.name = 'editor'`, which is the wrong question (see `_confers_edit`).

    Disabled accounts are excluded in the `WHERE` clause because a disabled
    account holds no capabilities at all (`access.capabilities_of`) — counting
    one would let the last *active* Editor be taken away by an installation that
    merely still has a disabled Editor on file, which is exactly the state the
    seed's own recovery guard exists for.

    `json.loads` is left to raise on a malformed role row, as everywhere else in
    this module and for the reason `access.py` gives at module level.
    """
    rows = conn.execute(
        "SELECT u.id AS id, r.capabilities AS capabilities FROM users u"
        " JOIN roles r ON r.id = u.role_id WHERE u.disabled_at IS NULL").fetchall()
    return sum(1 for row in rows
               if row["id"] != excluding
               and NON_DELEGABLE <= frozenset(json.loads(row["capabilities"])))


def _takes_the_last_editor_away(conn: sqlite3.Connection, target: sqlite3.Row, *,
                                resulting_role_id: int | None) -> bool:
    """Would this change leave the installation with no active Editor (D14)?

    `resulting_role_id` is `None` when the account is being disabled: a disabled
    account confers nothing whatever its role says. Re-enabling passes `None`
    too and is never refused here, because a target that is currently disabled is
    not one of the Editors being counted — the first line below, not the
    sentinel, is what tells the two directions apart.

    **This never answers True on an input either caller reaches, and the proof
    is four lines.** Both callers run `may_delegate` against the target's *own*
    role before asking, and that passes only when the actor's capabilities are a
    superset of the target's — so if the target confers `edit`, so does the
    actor. The actor is active, because `capabilities_of` resolves a disabled
    account to the empty set and it would have been refused NO_MANAGE_USERS. And
    the actor is not the target, because the self-edit ban is the first line of
    both callers. That makes the actor an active Editor other than the target, so
    the count below is at least one.

    Kept, and kept in load-bearing shape, for the reason `scopes.contains` keeps
    its own unkillable lines: D14 states this rule, a reader needs it stated
    where the decision is made, and it stops being unreachable the moment its
    premise moves. So `test_invariants.py` pins two things rather than pretending
    to reach this from a caller — the premise itself ("only an account that
    confers `edit` may act on one", asserted over the seeded roles), and this
    predicate's own decision, called directly. Relax the subset rule and the
    first goes red naming this guard; get the counting wrong and the second does,
    on the day it starts to matter rather than years later.

    The two `if _takes_the_last_editor_away(...)` lines in the callers are the
    one thing here no test can kill, and deleting either leaves the suite green.
    That is the honest state of it, and the reason the rest is pinned as tightly
    as it is.
    """
    if target["disabled_at"] is not None or not _confers_edit(conn, target["role_id"]):
        return False        # the target is not one of the Editors being counted
    if resulting_role_id is not None and _confers_edit(conn, resulting_role_id):
        return False        # …and it stays one, so nothing is taken away
    return _other_active_editors(conn, excluding=target["id"]) == 0


def may_modify(conn: sqlite3.Connection, actor: sqlite3.Row, target: sqlite3.Row, *,
               role_id: int, scopes: list[str]) -> str | None:
    """Whether `actor` may turn `target` into (`role_id`, `scopes`).

    Two `may_delegate` calls, in this order, and the order is observable: an
    actor who fails both is told about the resulting user, which is the half of
    the request they wrote and can correct.

    `target` and `actor` are rows, and both must be freshly read — see
    `may_delegate` on why a row captured across a write reports the capabilities
    the account used to have.
    """
    if actor["id"] == target["id"]:
        # First, and before anything is looked up: this is a fact about two ids
        # that no set of submitted values can make false, and answering it from
        # the role or the scopes would make "may I edit myself" depend on what I
        # was editing myself into.
        return SELF_EDIT
    # The actor must be able to confer what the target would end up with...
    err = may_delegate(conn, actor, role_id=role_id, scopes=scopes)
    if err:
        return err
    # ...and must already be able to reach what the target holds now, or an
    # Admin could rewrite an account whose access exceeds their own.
    err = may_delegate(conn, actor, role_id=target["role_id"],
                       scopes=list(scopes_of(conn, target)))
    if err:
        return err
    if _takes_the_last_editor_away(conn, target, resulting_role_id=role_id):
        return LAST_EDITOR
    return None


def may_disable(conn: sqlite3.Connection, actor: sqlite3.Row,
                target: sqlite3.Row) -> str | None:
    """Whether `actor` may change whether `target` is disabled — **either way**.

    One function for both verbs because they are one decision (D14). Re-enabling
    restores capabilities, so an Admin permitted to re-enable an Editor would be
    conferring `edit`, which is precisely the escalation D13 exists to prevent.
    The name follows the field it governs, `users.disabled_at`; it is not a
    function about the disabling direction only, and the re-enable direction has
    a test of its own so that the two cannot drift apart.

    No role or scope is submitted, so there is only one `may_delegate` call: the
    resulting user and the current one differ in nothing but the flag.
    """
    if actor["id"] == target["id"]:
        return SELF_EDIT
    err = may_delegate(conn, actor, role_id=target["role_id"],
                       scopes=list(scopes_of(conn, target)))
    if err:
        return err
    if _takes_the_last_editor_away(conn, target, resulting_role_id=None):
        return LAST_EDITOR
    return None
