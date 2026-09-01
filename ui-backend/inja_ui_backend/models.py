from pydantic import BaseModel, Field


class LoginBody(BaseModel):
    username: str
    password: str


class PasswordBody(BaseModel):
    current: str
    next: str


class CreateProcessBody(BaseModel):
    department: str
    name: str | None = None
    parent: dict | None = None  # {"process": str, "node": str} for sub-process


class PendingDecision(BaseModel):
    decision: str  # "accept" | "reject"


class ConfirmBody(BaseModel):
    #: The fingerprint the caller was shown for this exact document.
    #:
    #: Echoed rather than recomputed by the client: canonical JSON in the browser
    #: would have to agree with Python's byte for byte over Persian text, and the
    #: definition of a confirmation would then live in two languages. It is also
    #: the concurrency check — an Editor confirming a document that moved under
    #: them is refused rather than left vouching for bytes they never read.
    fingerprint: str


class ResolveFactBody(BaseModel):
    """Which account settles which disputed field (spec §12's `resolve` row).

    Both values are handed to `merge facts resolve` and to nothing else — the
    service never edits `facts/*.json` itself (QF-2) — so the engine is what
    decides whether this account is on this field and refuses (exit 2, nothing
    written) when it is not.

    `field` is a QF-7 path (`data/rows/row_ing_41/grams`) and is deliberately
    unpatterned here: the grammar is the engine's, and a second reading of it
    in this file would start disagreeing with the first. `account` **is**
    patterned, because it is the one value with a fixed shape — the first eight
    hex of `merge_facts.account_id`'s digest — and an anchored check is what
    keeps unbounded caller text out of the argv the shell-out builds.
    """
    field: str
    account: str = Field(pattern=r"^[0-9a-f]{8}$")


class VisibilityBody(BaseModel):
    visible: bool


class CreateUserBody(BaseModel):
    """A new account (spec D13, D15, D51, D57, D58).

    `scopes` defaults to the empty list rather than being required: an account
    that reaches nothing is storable and is what a scope-less Admin can confer,
    and `may_delegate` reads an empty list as vacuously covered. It is not a
    default anybody wants — the form always sends one — but refusing it here
    would be a usefulness rule dressed as a safety one.
    """
    username: str
    displayName: str
    password: str
    roleId: int
    scopes: list[str] = []
    #: `None` is a *choice* — "this user has no supervisor" — and is legal only
    #: for a `*`-scoped user (D51). `supervisor_error` is the authority.
    supervisorId: int | None = None
    canSupervise: bool = False


class PatchUserBody(BaseModel):
    """A partial modification. **Absent is not `None`.**

    Every field is optional and defaults to `None`, so the handler reads
    `model_fields_set` rather than the values: `{"supervisorId": null}` clears a
    supervisor and `{}` leaves it alone, and a handler that could not tell them
    apart would silently un-parent every user whose display name was edited.
    """
    username: str | None = None
    displayName: str | None = None
    roleId: int | None = None
    scopes: list[str] | None = None
    supervisorId: int | None = None
    canSupervise: bool | None = None


class SetPasswordBody(BaseModel):
    """What an administrator sets someone else's password to (D15).

    One field, because there is no token and no round-trip: the holder of
    `manage_users` chooses the value and tells the person. `current` has no
    meaning here — it is the *target's* password being replaced, and the actor
    does not know it. That is `PasswordBody`'s (self-service) shape and this is
    deliberately not it.
    """
    password: str


class DisabledBody(BaseModel):
    """Both directions of D14 in one field, because they are one decision.

    A `POST .../disabled` with `false` re-enables. Two endpoints would be two
    places to forget that re-enabling restores capabilities and takes the same
    checks — which is exactly the escalation D13 exists to prevent.
    """
    disabled: bool
