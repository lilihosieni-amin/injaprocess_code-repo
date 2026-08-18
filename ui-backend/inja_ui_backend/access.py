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
import logging
import sqlite3
from typing import Callable

from fastapi import Depends, HTTPException, Request

from .auth import client_ip, record, require_session
from .scopes import SCOPE_RE, contains, dept_of

logger = logging.getLogger(__name__)

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

#: The body of every 403 this service answers with.
#:
#: A constant for the opposite reason to `NOT_FOUND`'s. That one is uniform so
#: the caller can learn *nothing* from it; this one is shared so a person who
#: hits the same wall twice — once through `requires` on an API route, once
#: through `routers/export_files` on a download — is told the same thing both
#: times. There is only one fact to state, and it is the same fact: the caller
#: may see this, and may not do this to it.
#:
#: Deliberately no capability name. `access.denied` carries that (D42), and the
#: activity record is where it belongs; on the wire it would tell a caller which
#: permission to go and ask for, which is a map of the permission model handed
#: out one refusal at a time.
FORBIDDEN = "اجازهٔ این کار را ندارید"


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


def log_out_of_scope(request: Request, user: sqlite3.Row, target: str) -> None:
    """Leave a trace of a refusal the caller is told nothing about.

    A 404 for an out-of-scope resource is deliberately indistinguishable from a
    typo (D56), so the only party that can tell the two apart is this process.
    Somebody walking `dept:` codes to find out which departments exist looks,
    from outside, exactly like a member of staff following a stale bookmark —
    and an operator who is never told has nowhere to see the difference.

    **This is not `access.denied`, and must not become it.** D42 puts that event
    on the 403 and says why twice: *"404s are deliberately not recorded — they
    would bury the 403s"*, the 403 being *"the highest-signal event in the
    catalogue"* precisely because it is near-zero volume. §11 test 16d pins the
    absence. The activity record is a report surface with a volume budget (D45);
    the application log is not, and this line is what the second half of that
    trade buys back.

    INFO, not WARNING: a boundary that is indistinguishable from a typo produces
    typo-volume traffic, and a log level that cries wolf is one an operator
    filters out.

    Both values are attacker-chosen — the target comes out of the URL — so both
    are `%r`-quoted and truncated. Unquoted, a newline in a target writes a log
    line of the caller's choosing, which is the same reason
    `export_files._log_failed_login` quotes the username it records.
    """
    logger.info("out of scope: %r asked for %r from %s",
                user["username"], target[:120], client_ip(request))


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

    **`access.denied` (D42) is written on the 403 branch and on that branch
    only.** The event is what D42 calls the highest-signal row in the catalogue:
    a 403 means somebody acted on a resource they *can* see, through a control
    the UI never drew for them, which essentially cannot happen in normal use.
    The 404 branch stays unrecorded by design — a boundary indistinguishable
    from a typo produces typo-volume rows that would bury the 403s — and §11
    test 16d pins both halves. What the 404 branch leaves instead is
    `log_out_of_scope`'s line in the application log, which costs the activity
    record nothing.

    The row carries D41's columns and no invention: `actor` is the signed-in
    user, `session_id` ties it to the sign-in that produced it, `target` is the
    scope string that was refused, and `ip`/`user_agent` come from
    `request_origin` like every other event. `detail` carries the capability,
    because *"denied"* without *"denied what"* cannot tell an attempt to edit
    from an attempt to administer, and D44's permission history is built on
    exactly that distinction.

    Written before the raise, on the shared connection and outside any
    transaction (see `db.connect`), so a refusal cannot be recorded as anything
    else and cannot be lost to the exception on its way out.
    """
    def dependency(request: Request, user=Depends(require_session)):
        conn = request.app.state.db
        resolved = target(request) if callable(target) else target
        if not any(contains(s, resolved) for s in scopes_of(conn, user)):
            log_out_of_scope(request, user, resolved)
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        if capability not in capabilities_of(conn, user):
            # `getattr`, not `request.state.session_id`. `current_user` leaves
            # the id there and `require_session` is a sub-dependency, so on every
            # route in this service it is set by the time this runs — but
            # `starlette.datastructures.State` raises `AttributeError` for a key
            # it does not hold, and a gate that raises answers 500 instead of
            # 403. This module's own rule is that an unanswerable question is a
            # value and never an exception ("a crash is a denial of service"),
            # and the column is nullable, so a row that names no session is
            # strictly better than no row and a stack trace. It is reachable
            # today by overriding `require_session`, which is how
            # `test_a_disabled_row_reaching_the_gate_holds_no_capability`
            # isolates the second lock.
            record(request, "access.denied", actor=user["username"],
                   session_id=getattr(request.state, "session_id", None),
                   target=resolved, outcome="denied",
                   detail={"capability": capability})
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        request.state.user = user
        return user
    return dependency
