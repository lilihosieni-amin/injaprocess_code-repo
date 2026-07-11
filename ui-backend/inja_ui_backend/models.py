from pydantic import BaseModel


class LoginBody(BaseModel):
    username: str
    password: str


class CreateProcessBody(BaseModel):
    department: str
    name: str | None = None
    parent: dict | None = None  # {"process": str, "node": str} for sub-process


class PendingDecision(BaseModel):
    decision: str  # "accept" | "reject"
