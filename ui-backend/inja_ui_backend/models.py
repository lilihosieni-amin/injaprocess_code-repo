from pydantic import BaseModel


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
