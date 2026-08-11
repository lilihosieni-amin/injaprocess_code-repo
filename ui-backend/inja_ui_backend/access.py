"""Permission resolution (spec D12).

    allows(user, capability, target)
      ⟺ user.role.capabilities ∋ capability
      ∧ ∃ s ∈ user.scopes : s contains target

That is the whole rule. There are no per-user overrides — no override table, no
per-user capability list, no deny list. "Why can this person download?" must
have one answer in one place, and the subset comparison delegation depends on
(P0c) is only well-defined when capabilities come from exactly one source.

The resolution functions read; they decide no HTTP. Nothing among them raises,
and every unanswerable question — a role row that resolves to nothing, a scope
row the grammar refuses, a capability no role holds — is a `False` rather than an
exception. A crash is a denial of service; a `False` fails closed.

The 404-versus-403 split (D56) is `requires` at the foot of this module, and that
is the only *decision* in this file that knows HTTP exists — `NOT_FOUND` below is
the body it and every router answer 404 with, and it lives beside the rule that
chooses the status for the same reason. It is here rather than in its
own module because it is a two-line reading of the very rule above it, and a
status code chosen a file away from the rule it encodes is a status code that
drifts from it. The direction of the dependency is one-way: `requires` calls the
functions above, and none of them knows a status code exists.

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
from typing import Callable

from fastapi import Depends, HTTPException, Request

from .auth import require_session
from .scopes import SCOPE_RE, contains, dept_of

#: The body of **every** 404 this service answers with — the gate's and every
#: router's alike.
#:
#: A constant rather than a literal repeated in five files, because the status
#: code was only half the job. `requires` answers 404 for "outside your scope"
#: and a router answers 404 for "inside your scope but missing"; if the two carry
#: different prose then the caller's own scope boundary is legible in the words
#: after being made illegible in the number, and D56's existence rule is back
#: where it started. One name, so the two cannot drift apart one router at a
#: time.
#:
#: It is deliberately unhelpful. A 404 here is indistinguishable from a typo by
#: design, and any wording that narrows it — "department", "process", "not yours"
#: — narrows it for the prober too.
NOT_FOUND = "یافت نشد"


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


def permits(conn: sqlite3.Connection, user: sqlite3.Row,
            capability: str) -> Callable[[str], bool]:
    """`allows` with the two lookups done once, for a caller asking about many
    targets.

    The board and `/api/pending` both decide **per department**, so a nine-row
    registry costs eighteen queries per request through `allows` — correct, and
    needlessly so, since neither the role's capabilities nor the user's scopes
    can change inside one request. This resolves both once and returns a
    predicate over targets.

    It is the only implementation of D12's conjunction; `allows` below is this
    function applied to one target, so there is no second copy of the rule to
    drift. **The predicate decides one target at a time and that is the point** —
    a caller who collapses it to "may this person edit anywhere?" has replaced a
    per-department decision with a per-caller one, which is right for nobody and
    wrong for a two-scope holder (`dept:a` plus `dept:b/report:k`) in exactly the
    direction that leaks.
    """
    if capability not in capabilities_of(conn, user):
        return lambda target: False
    scopes = scopes_of(conn, user)
    return lambda target: any(contains(s, target) for s in scopes)


def allows(conn: sqlite3.Connection, user: sqlite3.Row, capability: str,
           target: str) -> bool:
    """Both halves of D12, and nothing else. Membership is exact, never a prefix.

    A user with no scope rows reaches nothing: `any(())` is `False`, which is
    the honest answer and the fail-closed one.

    This checks capability first and `requires` checks scope first. That is not
    an inconsistency to tidy away: here the two halves meet in a `bool`, where
    order cannot matter, while there they choose between 403 and 404, where it
    is the whole point. Rewriting `requires`' scope arm to call this function
    reintroduces the existence disclosure — the tests kill it, and this note is
    so nobody has to learn that from a red suite.
    """
    return permits(conn, user, capability)(target)


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


def requires(capability: str, target: str | Callable[[Request], str]):
    """A dependency that gates an endpoint on one capability at one target.

    The status partition is the point (D56):

      401  no session at all
      404  the target is outside the caller's scope — they must not learn it
           exists, so this is deliberately indistinguishable from a typo
      403  the caller can see the target but may not do this to it

    The natural implementation returns 403 for both refusal cases, which is why
    both directions are pinned by tests.

    **Scope is checked before capability, and the order is the whole point.**
    Reversed, a Reader asking to edit another department's process is refused for
    the capability first and answers 403 — which says "this exists, but not for
    you" about a department they were never to learn of. The disclosure is exactly
    what the 404 is there to refuse, and it is invisible to any test whose
    out-of-scope case happens to use a capability the caller does hold, because
    both orders answer 404 for that one.

    `target` is either a fixed scope string or a function of the request, for the
    endpoints whose target is in the path. It is resolved once, here, so that the
    string the scope check runs on is the string the endpoint was gated on.

    A `target` the grammar refuses reaches nothing under `contains` — including
    for a `*` holder — so it answers 404 like anything else out of scope. That
    keeps a wildcard holder on the same path as everyone else: who holds `*` must
    not be readable from which status a nonsense target comes back as.

    401 is not decided here. `require_session` is a sub-dependency, so FastAPI
    resolves it before this body runs and an unauthenticated caller never reaches
    the partition at all — which is why a stranger cannot use these two codes to
    map anything.

    Read-only, and no explicit transaction: this runs on the connection shared
    across the threadpool (see `db.connect`).

    `access.denied` (D42) is not recorded yet. When it arrives it belongs on the
    403 branch below and never on the 404 — 404s are unrecorded by design,
    because a boundary that is indistinguishable from a typo produces typo-volume
    noise that would bury the 403s.
    """
    def dependency(request: Request, user=Depends(require_session)):
        conn = request.app.state.db
        resolved = target(request) if callable(target) else target
        if not any(contains(s, resolved) for s in scopes_of(conn, user)):
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        if capability not in capabilities_of(conn, user):
            raise HTTPException(status_code=403, detail="اجازهٔ این کار را ندارید")
        request.state.user = user
        return user
    return dependency
