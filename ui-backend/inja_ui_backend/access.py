"""Permission resolution (spec D12).

    allows(user, capability, target)
      ⟺ user.role.capabilities ∋ capability
      ∧ ∃ s ∈ user.scopes : s contains target

That is the whole rule. There are no per-user overrides — no override table, no
per-user capability list, no deny list. "Why can this person download?" must
have one answer in one place, and the subset comparison delegation depends on
(P0c) is only well-defined when capabilities come from exactly one source.

This module reads; it decides no HTTP. The 404-versus-403 split (D56) belongs to
the dependency above it, so nothing here raises, and every unanswerable
question — a role row that resolves to nothing, a scope row the grammar refuses,
a capability no role holds — is a `False` rather than an exception. A crash is a
denial of service; a `False` fails closed.

One exception to that, stated rather than hidden: the `json.loads` of a role's
capability list will raise on a malformed row. It is left to raise because the
seed is the only writer and D50 gives no API path that could produce one, so a
malformed row means the database has been edited by hand — a case where failing
loudly beats resolving every capability to absent and quietly locking the
restaurant out.

Containment is never decided here: `scopes.contains` is the sole authority, and
re-deciding any part of it in this module is how the two would come to disagree.
"""
from __future__ import annotations

import json
import sqlite3

from .scopes import SCOPE_RE, contains, dept_of


def capabilities_of(conn: sqlite3.Connection, user: sqlite3.Row) -> frozenset[str]:
    """The capability set of this user's role — the only source there is.

    A disabled account holds none. Its sessions are revoked when it is disabled
    (D14), so this is the second lock rather than the first, and it is here
    rather than in the caller because "disabled" must not be a check any single
    endpoint can forget.
    """
    if user["disabled_at"] is not None:
        return frozenset()
    row = conn.execute("SELECT capabilities FROM roles WHERE id = ?",
                       (user["role_id"],)).fetchone()
    return frozenset(json.loads(row["capabilities"])) if row else frozenset()


def scopes_of(conn: sqlite3.Connection, user: sqlite3.Row) -> tuple[str, ...]:
    """Every scope row of this user, in a stable order. Not validated here.

    `user_scopes.scope` is `TEXT NOT NULL` with no CHECK constraint, so a row
    that is not a scope is storable; it is handed on as stored, because
    `contains` is the boundary that refuses it.
    """
    # `ORDER BY scope` is what makes "a stable order" a promise rather than an
    # accident, and no test can kill it: `user_scopes` is keyed
    # (user_id, scope), so the planner satisfies this `WHERE` from that index
    # and returns scope order anyway. Kept because a caller comparing this
    # tuple must not depend on a query plan.
    rows = conn.execute(
        "SELECT scope FROM user_scopes WHERE user_id = ? ORDER BY scope",
        (user["id"],)).fetchall()
    return tuple(r["scope"] for r in rows)


def allows(conn: sqlite3.Connection, user: sqlite3.Row, capability: str,
           target: str) -> bool:
    """Both halves of D12, and nothing else. Membership is exact, never a prefix.

    A user with no scope rows reaches nothing: `any(())` is `False`, which is
    the honest answer and the fail-closed one.
    """
    if capability not in capabilities_of(conn, user):
        return False
    return any(contains(s, target) for s in scopes_of(conn, user))


def reachable_departments(conn: sqlite3.Connection, user: sqlite3.Row,
                          capability: str) -> set[str] | None:
    """Departments this user may exercise `capability` somewhere within.

    None means "every department" — the caller must not turn that into a list,
    because a department added tomorrow is inside a `*` scope today.

    Test it with `is None`, never for truth. `None` and `set()` are both falsy,
    and they are opposites: `None` is every department, `set()` is none of them.
    A caller writing `if not depts:` reads a wildcard holder as holding nothing,
    or — worse, depending on which way the branch falls — reads someone with no
    departments at all as holding every one.

    "Somewhere within", not "on": a `dept:dining/report:steps` holder is named
    `dining` here and still fails `allows(…, "dept:dining")`, because they must
    find their department in a listing before they can reach their one report.
    This is a listing aid, never a decision — the decision is `allows`.
    """
    if capability not in capabilities_of(conn, user):
        return set()
    codes: set[str] = set()
    for s in scopes_of(conn, user):
        # A row the grammar refuses reaches nothing at all under `contains`, so
        # it must name no department either: `dept_of` is an ungated projection
        # and would happily read `dining` out of a malformed
        # `dept:dining/report:steps/report:x`, listing a department where every
        # click then 404s. Same gate as `contains`, so the two cannot disagree.
        if not SCOPE_RE.fullmatch(s):
            continue
        if s == "*":
            return None
        code = dept_of(s)
        # Unkillable past the gate, and kept for the same reason `contains`
        # keeps its own: the gate leaves exactly `dept:{code}` and
        # `dept:{code}/report:{kind}` here, both of which have a code, so
        # `dept_of` can no longer answer None or "". This line is what stops a
        # `None` entering the set if the gate above ever moves.
        if code:
            codes.add(code)
    return codes
