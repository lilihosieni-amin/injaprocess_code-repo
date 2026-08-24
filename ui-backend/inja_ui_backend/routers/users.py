"""User administration (spec D13, D14, D15, D42, D50, D51, D52, D54, D57, D58).

The HTTP face of `delegation.py`, and nothing more. That module decides who may
appoint whom and raises nothing; this one turns each of its error keys into a
status code and a Persian sentence, and writes the governance record. No rule is
re-decided here — a second copy of "may an Admin create an Editor" is how the two
would come to disagree.

**The whole surface is gated on `manage_users` at `*`.** User administration is
not scoped to a department (D11): a scoped Admin passes only if some scope of
theirs covers `*`, which by the grammar means holding `*` itself. The reads are
gated as tightly as the writes, because D54's boundary is the administration
*surface* — a Reader is served no list, no detail and no picker, not a filtered
one.

That target also decides the status a refusal carries (D56, `access.requires`):
scope is checked before capability, so an Admin scoped to one department is
answered **404** — they may not learn that user administration is a thing that
exists here — while a Reader holding `*` is answered **403**, because they can
see the surface and merely may not act. The pair is only pinned by a caller
refused by *both* halves; `test_users_api.py` has one.

**Every write runs on a connection of its own.** Creating a user and their scopes
is two-or-more statements that must land together, as is replacing a password
and revoking that person's sessions — and `db.connect`'s invariant forbids an
explicit transaction on the shared connection, naming these two operations
outright. So each write opens its own connection, does its reading *and* its
writing inside one `BEGIN IMMEDIATE`, and closes it. That also re-reads the actor
inside the transaction: `access.capabilities_of` reads `disabled_at` off the row
it is handed rather than from the database, so a row captured before a write can
report capabilities the account no longer has.

**Its reading includes the delegation check, and that is the point of the shape.**
A check made outside the transaction it authorises is a check that can be
overtaken: read the target, decide the actor may touch them, and by the time the
write lands somebody else has made them an Editor. So `_target`, `_actor` and the
`delegation` call sit inside the same `BEGIN IMMEDIATE` as the statements they
permit — on all four writes, the password one included, where the ~61 ms argon2
hash used to sit between the check and the write and made that window the easiest
one in this module to lose a race in. The hash is computed first, outside the
transaction; nothing that *decides* is.

**The record is written after the store write, never before.** A failed write
must not leave a row claiming it succeeded, so `record` is called after the
transaction has committed — the idiom `routers/confirmations.py` sets.

**Impersonation is detectable, not prevented (D15).** A holder of `manage_users`
can set someone's password and then sign in as them. Nothing here closes that,
and nothing can while the administrator chooses the value: what it does instead
is make the fact permanent — `password.set_by_admin` names the actor and the
target — which is why `manage_users` sits only with Editors and `*`-scoped
Admins, and why an out-of-band channel is the thing that would actually close it
(§13).

**Roles are read here and written nowhere (D50).** `GET /api/roles` is the only
verb this module offers on the role table, and there is deliberately no
`/api/roles/{id}` at all, so every other verb on either path answers 404 or 405
from the framework rather than from a guard somebody could delete.
"""
from __future__ import annotations

import functools
import json
import sqlite3
import time
from contextlib import contextmanager

import anyio
import anyio.to_thread
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import db
from ..access import NOT_FOUND, requires, scopes_of
from ..auth import VERIFY_LIMITER, hash_password, record, validate_password
from ..delegation import (
    CYCLE,
    LAST_EDITOR,
    NO_MANAGE_USERS,
    NOT_A_SUBSET,
    NOT_ELIGIBLE,
    SCOPE_NOT_COVERED,
    SELF_EDIT,
    SUPERVISOR_REQUIRED,
    SUPERVISOR_SELF,
    UNKNOWN_ROLE,
    eligible_supervisors,
    may_delegate,
    may_disable,
    may_modify,
    supervisor_error,
)
from ..models import CreateUserBody, DisabledBody, PatchUserBody, SetPasswordBody
from ..phone import USERNAME_RE, normalise_phone
from ..scopes import SCOPE_RE
from ..store import sessions, users

router = APIRouter(prefix="/api/users")
#: Its own router because the path is `/api/roles` and this module's prefix is
#: not. Both are registered in `app.py`, and both before the SPA mount.
roles_router = APIRouter(prefix="/api/roles")

#: Every refusal `delegation.py` can name, in Persian. One entry per key, and
#: `test_users_api.py` asserts the map is total — a key added there and forgotten
#: here would otherwise reach a caller as a bare fallback, which is a sentence
#: that cannot be acted on.
#:
#: `UNKNOWN_ROLE` is a 403 like the rest and not a 404 or a 400, deliberately:
#: `GET /api/roles` already answers, filtered, with every role this actor may
#: confer, so "no such role" and "not one of yours" are the same fact from where
#: the caller stands — and answering them differently would tell them how many
#: roles exist outside their own subset.
#:
#: `LAST_EDITOR` is here even though a freshly-read actor row cannot reach it
#: (see `delegation._takes_the_last_editor_away`, which proves the count is at
#: least one whenever the actor's row is telling the truth). The guard's
#: reachability condition is a **stale** actor row, and while every write below
#: re-reads the actor inside its own transaction, a message it can never need is
#: much cheaper than a `KeyError` on the day it does.
REFUSALS: dict[str, str] = {
    NO_MANAGE_USERS: "اجازهٔ مدیریت کاربران را ندارید",
    UNKNOWN_ROLE: "این نقش در دسترس شما نیست",
    NOT_A_SUBSET: "نمی‌توانید دسترسی‌ای بیشتر از دسترسی خودتان به کسی بدهید",
    SCOPE_NOT_COVERED: "این دامنه بیرون از دسترسی شماست",
    SELF_EDIT: "کسی نمی‌تواند حساب خودش را تغییر دهد؛"
               " گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید",
    LAST_EDITOR: "این تنها ویرایشگر فعال سامانه است و دسترسی‌اش را"
                 " نمی‌توان برداشت",
}

#: The supervisor rule's own keys. **400, not 403**, and the split is the point:
#: these say the submitted *value* is wrong — a supervisor who is not eligible,
#: or a choice that closes a loop — while every key above says the *actor* may
#: not do this at all. An administrator told 403 for picking the wrong person
#: from a list goes looking for a permission they already have.
SUPERVISOR_REFUSALS: dict[str, str] = {
    SUPERVISOR_REQUIRED: "برای کاربری که به همهٔ دپارتمان‌ها دسترسی ندارد"
                         " باید سرپرست انتخاب کنید",
    SUPERVISOR_SELF: "کسی نمی‌تواند سرپرست خودش باشد",
    NOT_ELIGIBLE: "این شخص نمی‌تواند سرپرست این کاربر باشد",
    CYCLE: "این انتخاب زنجیرهٔ سرپرستی را حلقه می‌کند",
}

#: What a caller is told when a key reaches the map that is not in it. Unreachable
#: while the totality test above passes, and it is a sentence rather than a
#: `KeyError` because a 500 on a *refusal* would be a refusal that looks like an
#: outage.
GENERIC_REFUSAL = "اجازهٔ این کار را ندارید"

#: The two sentences a bad *value* earns, shared by the cleaners below and by
#: `NULL_REFUSALS`, so that clearing a field and mistyping it are answered with
#: one sentence rather than two that drift apart.
NOT_A_NUMBER = "نام کاربری باید یک شمارهٔ موبایل معتبر باشد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹"
NO_DISPLAY_NAME = "نام کاربر را بنویسید"

#: What an explicit `null` means on `PATCH /api/users/{id}`, field by field.
#:
#: `null` is a value the caller wrote and not an absent field — the handler reads
#: `model_fields_set`, so the two are told apart — which means it has to *mean*
#: something, and the rule is one line: **`null` is accepted on exactly the field
#: where "no value" is a state an account can be in.** That is `supervisorId`,
#: which is why it is absent from this map: D51 makes "no supervisor" legal for a
#: `*`-scoped user, `{"supervisorId": null}` is how a screen clears one, and
#: `supervisor_error` is the authority on when that is allowed. Every other field
#: names something a user always has — a number, a name, a role, a scope list
#: (the empty one is `[]`, which is a list and not a `null`) and a yes/no flag —
#: so a `null` there is a form that lost its value, and the answer is the 400 that
#: says which one.
#:
#: Refused **before** the transaction opens, with the other value refusals: a body
#: that cannot be acted on should not take sqlite's write lock to find that out.
#:
#: This is a decision, not a repair of one crash: three of these fields used to
#: reach `.strip()` or a `for` loop on `None` and be answered 500 — an outage's
#: answer to somebody who merely cleared a field — and `canSupervise` was quietly
#: read as `False`, which is worse, because it wrote something nobody asked for.
NULL_REFUSALS: dict[str, str] = {
    "username": NOT_A_NUMBER,
    "displayName": NO_DISPLAY_NAME,
    # A 400 rather than the 403 `UNKNOWN_ROLE` an unknown *id* earns, and the
    # difference is real: "no such role" and "not one of yours" are the same fact
    # from where the caller stands and must not be told apart, while `null` is
    # neither of them — it is no role id at all, so answering it 403 would tell
    # somebody who submitted nothing that their permissions are what is wrong.
    "roleId": "نقش کاربر را انتخاب کنید",
    "scopes": "دامنه‌های دسترسی را مشخص کنید؛ «هیچ دامنه‌ای» یک فهرست خالی است",
    "canSupervise": "مشخص کنید که این کاربر می‌تواند سرپرست باشد یا نه",
}


def _refuse(key: str) -> None:
    raise HTTPException(status_code=403, detail=REFUSALS.get(key, GENERIC_REFUSAL))


def _refuse_supervisor(key: str) -> None:
    raise HTTPException(status_code=400,
                        detail=SUPERVISOR_REFUSALS.get(key, GENERIC_REFUSAL))


@contextmanager
def _write(request: Request):
    """A connection of this request's own, carrying one explicit transaction.

    `db.connect`'s invariant is that no handler may open a transaction on the
    **shared** connection, and it names these very operations — "creating a user
    and their scopes together, or revoking every other session when a password
    changes" — as what would break it. Its own guidance is what this is: anything
    needing atomicity across statements opens its own connection and uses it on
    one thread. `seed.py` does the same thing for the same reason, and says so at
    the point where it opens one.

    `BEGIN IMMEDIATE` rather than a bare `BEGIN`: the write lock is taken up
    front, so a transaction that reads (the delegation checks) and then writes
    cannot fail to upgrade half way through and lose the reads it decided on.
    Every check therefore sees the database as the write will leave it, and the
    duplicate-username check cannot be overtaken between looking and inserting.

    A refusal raised inside the block rolls back, which is what makes "a refused
    request writes nothing" a property of the shape rather than of remembering.
    """
    conn = db.connect(request.app.state.cfg.app_db)
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        # Leave the file usable rather than wedged, exactly as `db.migrate` and
        # `seed.seed` do — and, because an HTTPException travels this path too,
        # undo everything a refused request had already written.
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()


def _actor(conn: sqlite3.Connection, user: sqlite3.Row) -> sqlite3.Row:
    """The actor's row, re-read inside the write transaction.

    `require_session` read one at the start of the request and refused a disabled
    account, so in production this is a second lock rather than the first. It is
    here because `capabilities_of` reads `disabled_at` off the row it is handed:
    a row that was fresh when the request arrived is not a row that is fresh now,
    and every decision below is made from this one.
    """
    row = users.by_id(conn, user["id"])
    if row is None:
        # The account vanished mid-request. Nothing deletes users today (D14
        # disables), so this is unreachable — and it is a 401 rather than a 500
        # because "you are no longer anybody" is a fact about the session.
        raise HTTPException(status_code=401, detail="authentication required")
    return row


def _target(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    """The account being acted on, or the uniform 404.

    `NOT_FOUND`, byte for byte what the gate answers, so that "no such user" and
    "not yours to see" cannot be told apart by the prose after being made
    indistinguishable by the number.
    """
    row = users.by_id(conn, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return row


def _brief(conn: sqlite3.Connection, row: sqlite3.Row | None) -> dict | None:
    """A supervisor as they appear on somebody else's record.

    `disabled` travels with the name because D14 refuses to repoint subordinates
    when a supervisor is disabled — the gap is surfaced instead — and the screen
    cannot surface what the payload does not carry.
    """
    if row is None:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "disabled": row["disabled_at"] is not None,
    }


def _user(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    """One account as this router reports it — **a named field at a time**.

    Never `dict(row)`. `users` rows are read with `SELECT *` here and in
    `delegation.eligible_supervisors`, so `password_hash` is in every one of
    them; a serialiser that walked the row would publish the whole table's
    hashes to anybody holding `manage_users`, and the day a column is added it
    would publish that too. The allow-list is the guarantee, and
    `test_users_api.py` scans every body this module returns for the stored hash.
    """
    role = conn.execute("SELECT id, name, capabilities FROM roles WHERE id = ?",
                        (row["role_id"],)).fetchone()
    supervisor = (users.by_id(conn, row["supervisor_id"])
                  if row["supervisor_id"] is not None else None)
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "roleId": row["role_id"],
        # `None` for a role row that is not there. Unreachable — `role_id` is
        # `NOT NULL REFERENCES roles(id)` with `PRAGMA foreign_keys=ON` — and the
        # alternative is a 500 on a listing because one row is odd.
        "role": role["name"] if role is not None else None,
        "capabilities": json.loads(role["capabilities"]) if role is not None else [],
        "scopes": list(scopes_of(conn, row)),
        "supervisor": _brief(conn, supervisor),
        "canSupervise": bool(row["can_supervise"]),
        "disabled": row["disabled_at"] is not None,
        "createdAt": row["created_at"],
    }


def _candidate(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    """One entry of the supervisor picker.

    A projection of its own rather than `_user`, and shorter than it: a picker
    needs the name, what that person IS, and nothing else. It runs over
    `eligible_supervisors`' `SELECT *` rows, which carry `password_hash`, so the
    allow-list is the guarantee here exactly as it is in `_user`.

    **`role` travels as of the owner's ruling** — *"in the 'Supervisor'
    dropdown, the person's name and role should be displayed. There's no need to
    display their department."* D52's argument for the scope was that past thirty
    users the reason somebody is on the list is otherwise invisible; the owner
    has read the list and decided the role answers that better. It does: the list
    is already filtered to people whose departments cover this account's, so the
    department beside each name is the same fact repeated, while «مدیر» against
    «خواننده» is the distinction an administrator is actually choosing between.

    `scopes` STAYS on the wire. It is not decoration for the label — the edit
    form re-asks eligibility from it, and `SupervisorPicker` reads it to decide
    whether a stored supervisor is still on the list. What changed is what the
    picker DRAWS.

    One query per candidate, like `_user`'s. A picker is a page of names, not a
    report, and a join here would be a second way of reading a row this module
    already knows how to read.
    """
    role = conn.execute("SELECT name FROM roles WHERE id = ?",
                        (row["role_id"],)).fetchone()
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        # `None` for a role row that is not there — unreachable under
        # `NOT NULL REFERENCES roles(id)`, and the alternative is a 500 on a
        # whole picker because one row is odd. `_user` answers the same way.
        "role": role["name"] if role is not None else None,
        "scopes": list(scopes_of(conn, row)),
        "canSupervise": bool(row["can_supervise"]),
    }


def _clean_scopes(raw: list[str]) -> list[str]:
    """The scopes as they will be stored: validated, de-duplicated, ordered.

    Validated **here**, at the write boundary, because `user_scopes.scope` is
    `TEXT NOT NULL` with no CHECK constraint and `scopes.contains` — the
    boundary that has to survive a bad row — answers `False` for anything the
    grammar refuses. Stored unvalidated, a typo is an account that silently
    reaches nothing; refused here, it is a sentence the administrator can act on.

    De-duplicated because `user_scopes` is keyed `(user_id, scope)`, so the same
    scope twice is an `IntegrityError` rather than a stored list. Sorted so that
    two requests differing only in the order they listed their scopes produce the
    same rows and the same `scope.granted` record.
    """
    for scope in raw:
        if not SCOPE_RE.fullmatch(scope):
            raise HTTPException(
                status_code=400,
                detail=f"«{scope}» دامنهٔ معتبری نیست")
    return sorted(set(raw))


def _clean_username(raw: str) -> str:
    """The canonical mobile number, or a 400 (D57).

    Normalised before it is validated, never after: `users.create` stores
    `normalise_phone(username)`, so validating the raw string would check one
    string and store another — and would refuse `۰۹۱۲…` and `+98 912 …`, both of
    which sign-in accepts.
    """
    username = normalise_phone(raw)
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(status_code=400, detail=NOT_A_NUMBER)
    return username


def _clean_display_name(raw: str) -> str:
    display = raw.strip()
    if not display:
        raise HTTPException(status_code=400, detail=NO_DISPLAY_NAME)
    return display


def _refuse_nulls(body: PatchUserBody) -> None:
    """400 for every field on which an explicit `null` is not a value.

    See `NULL_REFUSALS` for which fields those are and why `supervisorId` is not
    among them. Only fields the caller actually wrote are looked at: every field
    of `PatchUserBody` defaults to `None`, so reading the values alone would
    refuse `{}` — the request that changes nothing — on five counts.
    """
    for field, message in NULL_REFUSALS.items():
        if field in body.model_fields_set and getattr(body, field) is None:
            raise HTTPException(status_code=400, detail=message)


# --------------------------------------------------------------------------
# Reads
# --------------------------------------------------------------------------

@roles_router.get("")
def list_roles(request: Request, user=Depends(requires("manage_users", "*"))):
    """The roles this actor may confer — **filtered here, not on the screen**.

    D56: a list endpoint never returns rows it then declines to render. An Admin
    offered `editor` in a picker is offered a choice the create endpoint refuses,
    and the refusal arrives after they have typed a name, a number and a
    password. So the same rule that would refuse the write decides the list, by
    calling it rather than by restating it.

    `scopes=[]` is what makes this the capability question alone: `may_delegate`
    reads an empty scope list as vacuously covered, so what is left is exactly
    the subset rule — including `manage_peers`' equality case, which is why an
    Editor sees `editor` here and an Admin sees `admin` but not `editor`.

    Roles are seeded and never written (D50). There is no POST, PATCH, PUT or
    DELETE on this path or on any path below it, and `test_users_api.py`
    exercises all four on both to keep it that way.
    """
    conn = request.app.state.db
    out = []
    for row in conn.execute(
            "SELECT id, name, capabilities FROM roles ORDER BY id").fetchall():
        if may_delegate(conn, user, role_id=row["id"], scopes=[]) is None:
            out.append({"id": row["id"], "name": row["name"],
                        "capabilities": json.loads(row["capabilities"])})
    return out


@router.get("")
def list_users(request: Request, _=Depends(requires("manage_users", "*"))):
    """Every account, ordered by username.

    Unfiltered, and that is not an oversight: this surface is gated on `*`, so
    everybody who reaches it reaches every department already. Ordered by
    `username` rather than by `display_name` because names are not unique, so
    ordering by one leaves ties to the query plan and moves rows between two
    identical requests.
    """
    conn = request.app.state.db
    return [_user(conn, row) for row in
            conn.execute("SELECT * FROM users ORDER BY username").fetchall()]


@router.get("/supervisor-candidates")
def list_supervisor_candidates(request: Request,
                               _=Depends(requires("manage_users", "*"))):
    """Who may be offered as the supervisor of a user holding these scopes (D52).

    **Registered before `/{user_id}`, and the order is load-bearing**: FastAPI
    matches routes in registration order and `{user_id}` would otherwise swallow
    this path and answer 422 for a literal that is not a number. Declared first
    in this module, which is what decides it.

    `scope` may repeat — a head of two departments needs somebody who covers
    both — and is read straight off the query string rather than declared, the
    idiom `routers/confirmations.py` sets: a declared parameter is validated
    beside the dependencies and could answer 422 where the gate should have
    spoken first.

    `exclude` is the id of the user being edited, whom a picker must not offer as
    their own supervisor. Absent on the create form, where there is no id yet —
    `eligible_supervisors` takes `excluding` as a required keyword precisely so
    that omission is a decision rather than a default. A value that is not a
    number excludes nobody rather than 422ing, because it can only come from a
    client bug and the honest answer to "exclude nothing" is the whole list.
    """
    conn = request.app.state.db
    scopes = _clean_scopes([s for s in request.query_params.getlist("scope") if s])
    raw = request.query_params.get("exclude", "")
    excluding = int(raw) if raw.isdigit() else None
    return [_candidate(conn, row) for row in
            eligible_supervisors(conn, scopes=scopes, excluding=excluding)]


@router.get("/{user_id}")
def get_user(user_id: int, request: Request,
             _=Depends(requires("manage_users", "*"))):
    conn = request.app.state.db
    return _user(conn, _target(conn, user_id))


# --------------------------------------------------------------------------
# Writes
# --------------------------------------------------------------------------

def _create(request: Request, actor_row: sqlite3.Row, body: CreateUserBody,
            *, username: str, display_name: str, scopes: list[str]) -> int:
    """Everything `POST /api/users` does to the database, on one thread.

    The argon2 hash is computed **before** the transaction opens: it is ~61 ms,
    and holding sqlite's write lock for it would serialise every other write in
    the service behind one account creation.
    """
    password_hash = hash_password(body.password)
    with _write(request) as conn:
        actor = _actor(conn, actor_row)
        err = may_delegate(conn, actor, role_id=body.roleId, scopes=scopes)
        if err:
            _refuse(err)
        # After the delegation check and before the write. `target_id` is None
        # because the user does not exist yet, so self and cycles are unaskable
        # — there is no id to close a loop through.
        err = supervisor_error(conn, None, body.supervisorId, scopes)
        if err:
            _refuse_supervisor(err)
        # **Including disabled accounts** (D57): a disabled user keeps their
        # number so it cannot be handed to whoever inherited the line, and
        # `by_username` reads the whole table rather than the active part of it.
        # Inside the transaction, so the answer cannot be overtaken by a
        # concurrent create between the look and the INSERT.
        if users.by_username(conn, username) is not None:
            raise HTTPException(status_code=409,
                                detail="این شماره از پیش ثبت شده است")
        user_id = users.create(conn, username=username, display_name=display_name,
                               password_hash=password_hash, role_id=body.roleId,
                               supervisor_id=body.supervisorId,
                               can_supervise=body.canSupervise)
        users.set_scopes(conn, user_id, scopes)
    return user_id


@router.post("", status_code=201)
async def create_user(body: CreateUserBody, request: Request,
                      user=Depends(requires("manage_users", "*"))):
    """Create an account (D13, D15, D51, D57, D58).

    `async` + `to_thread.run_sync` under `auth.VERIFY_LIMITER`, the shape
    `routers/auth.py` uses and for its reason: this handler runs an argon2 hash,
    ~64 MiB and ~61 ms, and as a plain `def` forty of them could sit on the
    default threadpool at once — ~2.5 GB on a 3.7 GB host, on the very pool every
    other sync route in this service runs on.

    The cheap refusals are answered before the thread is entered, so a mistyped
    number costs no argon2 slot. They are also, deliberately, answered before the
    delegation check: the caller is inside `*` by the time they are here, so
    there is nothing about the installation for the order to disclose, and being
    told "this is not a mobile number" beats being told nothing until the number
    has been fixed.
    """
    username = _clean_username(body.username)
    display_name = _clean_display_name(body.displayName)
    problem = validate_password(body.password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    scopes = _clean_scopes(body.scopes)

    user_id = await anyio.to_thread.run_sync(
        functools.partial(_create, request, user, body, username=username,
                          display_name=display_name, scopes=scopes),
        limiter=VERIFY_LIMITER)

    conn = request.app.state.db
    created = _user(conn, users.by_id(conn, user_id))
    # After the write, so nothing can record an account that was not created.
    # One event, not five: `role.assigned`, `scope.granted` and the two
    # supervisor events describe a *change* to an existing account, and a
    # creation is not a change — its whole shape is in this row's detail.
    record(request, "user.created", actor=user["username"],
           session_id=request.state.session_id, target=created["username"],
           detail={"role": created["role"], "scopes": created["scopes"],
                   "supervisor": body.supervisorId,
                   "canSupervise": created["canSupervise"]})
    return created


@router.patch("/{user_id}")
def modify_user(user_id: int, body: PatchUserBody, request: Request,
                user=Depends(requires("manage_users", "*"))):
    """Change an existing account (D13, D14, D51, D57).

    **Judged against the resulting user**, which is `may_modify`'s business and
    not restated here: an absent field resolves to what the row already holds, so
    the pair of checks sees the account as it will be and as it is.

    The supervisor is re-validated only when the supervisor or the scopes moved,
    and that boundary is D14's. A supervisor who has since been disabled is left
    where they are — subordinates keep pointing at them, and the screen surfaces
    the gap with a reassign action — so validating an unchanged edge on every
    request would make it impossible to correct somebody's display name until
    their supervisor had been replaced. When the scopes move, the edge is
    re-judged against the new ones, because an eligibility that held for
    `dept:dining` says nothing about `dept:dining` plus `dept:cashier`.

    **An absent field and an explicit `null` are different requests**, which is
    what `model_fields_set` is read for, and `NULL_REFUSALS` says what the second
    of them means on each field: `{"supervisorId": null}` clears a supervisor and
    every other `null` is a 400.

    No argon2 here, so this is a plain `def` on the default threadpool — the
    password is not one of the fields, and setting somebody else's is its own
    endpoint with its own event and its own revocation rule.
    """
    fields = body.model_fields_set
    # Before the transaction: a value that cannot be acted on is not worth
    # sqlite's write lock, and `_clean_scopes`/`_clean_username` below are
    # answering the same class of question from inside it only because they need
    # the row to compare against.
    _refuse_nulls(body)
    with _write(request) as conn:
        actor = _actor(conn, user)
        target = _target(conn, user_id)
        before_scopes = list(scopes_of(conn, target))

        role_id = body.roleId if "roleId" in fields else target["role_id"]
        scopes = (_clean_scopes(body.scopes) if "scopes" in fields
                  else before_scopes)
        # Both checks, in delegation's order, before anything is looked at
        # further: the resulting user and the current one.
        err = may_modify(conn, actor, target, role_id=role_id, scopes=scopes)
        if err:
            _refuse(err)

        supervisor_id = (body.supervisorId if "supervisorId" in fields
                         else target["supervisor_id"])
        if supervisor_id != target["supervisor_id"] or scopes != before_scopes:
            err = supervisor_error(conn, target["id"], supervisor_id, scopes)
            if err:
                _refuse_supervisor(err)

        username = (_clean_username(body.username) if "username" in fields
                    else target["username"])
        if username != target["username"]:
            # D57 again, and this is the path that frees a number: an
            # administrator edits the disabled account that still holds it.
            # Uniqueness is checked against every account, disabled ones
            # included, inside this transaction.
            clash = users.by_username(conn, username)
            if clash is not None and clash["id"] != target["id"]:
                raise HTTPException(status_code=409,
                                    detail="این شماره از پیش ثبت شده است")
        display_name = (_clean_display_name(body.displayName)
                        if "displayName" in fields else target["display_name"])
        can_supervise = (bool(body.canSupervise) if "canSupervise" in fields
                         else bool(target["can_supervise"]))

        users.update(conn, target["id"], username=username,
                     display_name=display_name, role_id=role_id,
                     supervisor_id=supervisor_id, can_supervise=can_supervise)
        if scopes != before_scopes:
            users.set_scopes(conn, target["id"], scopes)

        # Assembled inside the transaction, from the row as it was, and emitted
        # after it commits. Reading `before` afterwards would race itself and
        # could only ever report the new value twice.
        was = dict(username=target["username"], displayName=target["display_name"],
                   roleId=target["role_id"], supervisorId=target["supervisor_id"],
                   canSupervise=bool(target["can_supervise"]))
        now_is = dict(username=username, displayName=display_name, roleId=role_id,
                      supervisorId=supervisor_id, canSupervise=can_supervise)
        changed = {k: {"before": was[k], "after": now_is[k]}
                   for k in was if was[k] != now_is[k]}
        if scopes != before_scopes:
            changed["scopes"] = {"before": before_scopes, "after": scopes}

    conn = request.app.state.db
    who = username
    if changed:
        # `user.modified` is the umbrella and says what moved; the four events
        # below are the axes D42 names separately, because a report asking "who
        # changed this person's role" must not have to parse a detail blob.
        # Nothing at all is recorded when nothing moved — a decision nobody made
        # must not appear in the record.
        record(request, "user.modified", actor=user["username"],
               session_id=request.state.session_id, target=who,
               detail={"changed": changed})
    if "roleId" in changed:
        record(request, "role.assigned", actor=user["username"],
               session_id=request.state.session_id, target=who,
               detail={"before": changed["roleId"]["before"],
                       "after": changed["roleId"]["after"]})
    for scope in sorted(set(scopes) - set(before_scopes)):
        record(request, "scope.granted", actor=user["username"],
               session_id=request.state.session_id, target=who,
               detail={"scope": scope})
    for scope in sorted(set(before_scopes) - set(scopes)):
        record(request, "scope.revoked", actor=user["username"],
               session_id=request.state.session_id, target=who,
               detail={"scope": scope})
    if "supervisorId" in changed:
        record(request, "supervisor.changed", actor=user["username"],
               session_id=request.state.session_id, target=who,
               detail={"before": changed["supervisorId"]["before"],
                       "after": changed["supervisorId"]["after"]})
    if "canSupervise" in changed:
        # **Its own event, never folded into `supervisor.changed`** (D42).
        # Toggling this bit reshapes who is *eligible* to supervise — it alters
        # the org chart — without any user's supervisor field moving, so one
        # combined event would miss it entirely.
        record(request, "supervisor_flag.changed", actor=user["username"],
               session_id=request.state.session_id, target=who,
               detail={"before": changed["canSupervise"]["before"],
                       "after": changed["canSupervise"]["after"]})
    return _user(conn, users.by_id(conn, target["id"]))


@router.post("/{user_id}/disabled")
def set_user_disabled(user_id: int, body: DisabledBody, request: Request,
                      user=Depends(requires("manage_users", "*"))):
    """Disable or re-enable an account (D14).

    One endpoint for both directions because they are one decision:
    `may_disable` governs each, since re-enabling restores capabilities and an
    Admin permitted to re-enable an Editor would be conferring `edit`.

    Disabling revokes every session that account holds, in the same transaction,
    so there is no instant in which the row says disabled and a session still
    opens. Re-enabling revokes nothing and restores nothing: sessions revoked at
    disable stay revoked, and the supervisor edge is whatever it was.

    A request that asks for the state the account is already in writes nothing
    and records nothing — the permission check still runs, because "may you do
    this" must not depend on whether it would have any effect.
    """
    now = int(time.time())
    with _write(request) as conn:
        actor = _actor(conn, user)
        target = _target(conn, user_id)
        err = may_disable(conn, actor, target)
        if err:
            _refuse(err)
        changed = (target["disabled_at"] is not None) != body.disabled
        if changed:
            users.set_disabled(conn, target["id"], body.disabled, now)
            if body.disabled:
                # Every session, with no exception: the self-edit ban means the
                # target is never the caller, so there is no tab of their own to
                # spare (which is what `apply_password_change` spares, and why
                # that call passes `except_session` and this one does not).
                sessions.revoke_all_for_user(conn, target["id"], now)

    conn = request.app.state.db
    if changed:
        record(request, "user.disabled" if body.disabled else "user.enabled",
               actor=user["username"], session_id=request.state.session_id,
               target=target["username"], detail={"at": now})
    return _user(conn, users.by_id(conn, user_id))


def _set_password(request: Request, actor_row: sqlite3.Row, user_id: int,
                  password: str, now: int) -> sqlite3.Row:
    """Everything `POST /api/users/{id}/password` does to the database, one thread.

    `_create`'s shape, for `_create`'s reason and one more of its own. The argon2
    hash is computed **before** the transaction opens: it is ~61 ms, and holding
    sqlite's write lock for it would serialise every other write in the service
    behind one password reset.

    **Everything that decides is inside the transaction, with the writes it
    permits.** Read outside one, `may_modify` authorises the account as it was
    rather than as it is: an Admin sets a Reader's password, another
    administrator promotes that Reader to Editor while the hash is being
    computed, and the write lands on an account the Admin may not touch — leaving
    them holding an Editor's password. The hash *is* that window, so the check
    cannot be on the far side of it. `BEGIN IMMEDIATE` takes the write lock
    before the reads, so the promotion either happened before this check saw it
    or waits until after this write.

    The two writes D15 requires then land as one. Order between them is not a
    decision, because there is no instant at which either is visible alone: this
    is the atomicity `apply_password_change` cannot have (it runs on the shared
    connection, which may carry no transaction) and has to trade a race against a
    half-state for. Every session of the target's, with no exception — the
    self-edit ban means the caller is somebody else, so there is no session of
    theirs to keep.

    Returns the target's row, as it was read here. The record names that person,
    and reading them again afterwards would be a second, unserialised read of a
    row this call has just written.
    """
    password_hash = hash_password(password)
    with _write(request) as conn:
        actor = _actor(conn, actor_row)
        target = _target(conn, user_id)
        # Against the target's **current** role and scopes: nothing about their
        # access is changing, so the resulting user is the current one — and the
        # check that fires first on a self-target is `SELF_EDIT`, which is what
        # keeps this endpoint from being a way round the self-edit ban.
        err = may_modify(conn, actor, target, role_id=target["role_id"],
                         scopes=list(scopes_of(conn, target)))
        if err:
            _refuse(err)
        sessions.revoke_all_for_user(conn, target["id"], now)
        users.set_password(conn, target["id"], password_hash)
    return target


@router.post("/{user_id}/password", status_code=204)
async def set_user_password(user_id: int, body: SetPasswordBody, request: Request,
                            user=Depends(requires("manage_users", "*"))):
    """Set somebody else's password directly (D15).

    No token, no expiring link, no round-trip: the holder of `manage_users`
    chooses the value and tells the person. This deployment is fed by Telegram
    and has no channel to deliver a link over, so a link nobody can receive would
    be worse than a spoken password — and the account it protects is reachable by
    the same administrator either way.

    **This makes impersonation detectable rather than prevented.** Anyone holding
    `manage_users` can set a password and then sign in as that person; nothing
    here stops them. What is guaranteed is that the fact is permanent —
    `password.set_by_admin` names the actor, the target and the session — and
    that a sign-in shortly afterwards is a visible pattern. It is why
    `manage_users` sits only with Editors and `*`-scoped Admins (D11), and why
    closing it needs an out-of-band channel rather than a bigger check here.

    Bound by the same two checks as any other modification, via `may_modify`
    against the target's **current** role and scopes — and bound by them *inside
    the transaction that writes*, which is `_set_password`'s subject and this
    module's rule for every write. Changing your own password is
    `POST /api/auth/password`, which re-verifies the current one; this path does
    not, and must therefore never accept the caller as its own target.

    Only the password rule is answered before the thread is entered. It is the
    one refusal here that needs no database at all, so it costs no argon2 slot;
    the target's existence and the delegation check are deliberately *not*
    hoisted out to join it, because out here they would be answered from an
    unserialised read. The price is that a refused request has paid for a hash —
    the same price `_create` pays, on a surface `*`-scoped holders of
    `manage_users` are the only callers of.
    """
    problem = validate_password(body.password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)

    now = int(time.time())
    target = await anyio.to_thread.run_sync(
        functools.partial(_set_password, request, user, user_id, body.password, now),
        limiter=VERIFY_LIMITER)

    record(request, "password.set_by_admin", actor=user["username"],
           session_id=request.state.session_id, target=target["username"],
           detail={"sessions_revoked": True})
    return Response(status_code=204)
