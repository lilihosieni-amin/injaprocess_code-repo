"""Who may appoint whom (spec D13).

    may_delegate(conn, actor, role_id=…, scopes=…)
      ⟺ actor.capabilities ∋ manage_users
      ∧ role(role_id).capabilities ⊂ actor.capabilities
        (⊆ when actor.capabilities ∋ manage_peers)
      ∧ ∀ s ∈ scopes : ∃ a ∈ actor.scopes : a contains s

Two independent checks over one role and one scope list, applied identically to
creating a user and to changing one — a modification is judged against the
**resulting** user, never the delta, because "you may only add what you hold"
lets two permitted edits compose into an account past the editor's own.

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

Nothing here raises, nothing here knows HTTP, and every refusal is one of the
four keys below rather than a bool — the caller has to say *why* in Persian, and
a bool would leave it guessing between "you may not appoint at all" and "not
this one".

`seed.NON_DELEGABLE` is deliberately **not** consulted. `edit`, `confirm` and
`set_visibility` are withheld by the subset rule itself — an Admin cannot confer
them because the Editor role is not a subset of theirs — and the reason they can
never be conferred by a *new* role is that no code path mints a role at all
(D50, `seed.py`). Re-stating the list here would give that guarantee a second
home and a second place to forget it, and would additionally forbid the one case
D13 permits: an Editor holding `manage_peers` appointing another Editor.

Containment is never decided here: `scopes.contains` is the sole authority, and
re-deciding any part of it in this module is how the two would come to disagree.
"""
from __future__ import annotations

import json
import sqlite3

from .access import capabilities_of, scopes_of
from .scopes import contains

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
    # and no test can kill it: `<=` and `<` differ only when the two sets are
    # equal, and when they are equal the two reads are the same read. Kept on
    # the actor because D13 is a statement about who is appointing — the day a
    # capability is added that only one side holds, the target-side version
    # stops being equivalent and starts being a way to be appointed by someone
    # who was never allowed to.
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
