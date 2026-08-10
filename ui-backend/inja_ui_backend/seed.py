"""The four seeded roles and the first Editor (spec D11, D50).

Roles come from here and from nowhere else. No API path creates, edits or
deletes one — which is why 'no UI can ever mint a role that edits content' is a
property of the data rather than a check on an account, and cannot be lost by
renaming or replacing an administrator.

The price is that this module is the only recovery path if every Editor account
is lost. That belongs in docs/runbooks/06-changing-users.md.
"""
from __future__ import annotations

import json
import sqlite3

from .phone import USERNAME_RE
from .store import users

NON_DELEGABLE = frozenset({"edit", "confirm", "set_visibility"})

_READER = ["view", "comment", "export_pdf"]
_ADMIN = _READER + ["manage_users", "manage_peers", "view_audit"]
_EDITOR = _ADMIN + ["edit", "confirm", "set_visibility"]

ROLES: dict[str, list[str]] = {
    "reader": _READER,
    # Exists from day one because FR-E7 promises download can be withheld from
    # someone who may still read, and with no per-user overrides a role is the
    # only way to say it. A promise that needs a deploy first is not kept.
    "reader_no_download": ["view", "comment"],
    "admin": _ADMIN,
    "editor": _EDITOR,
}


def seed(conn: sqlite3.Connection, *, editor_username: str,
         editor_display_name: str, editor_password_hash: str) -> None:
    if not USERNAME_RE.fullmatch(editor_username):
        raise ValueError(
            f"editor username must be a canonical mobile number, got {editor_username!r}")

    for name, caps in ROLES.items():
        conn.execute(
            "INSERT INTO roles (name, capabilities) VALUES (?, ?)"
            " ON CONFLICT(name) DO NOTHING",
            (name, json.dumps(sorted(caps))),
        )

    if users.by_username(conn, editor_username) is not None:
        return
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        return

    role_id = conn.execute(
        "SELECT id FROM roles WHERE name = 'editor'").fetchone()[0]
    uid = users.create(conn, username=editor_username,
                       display_name=editor_display_name,
                       password_hash=editor_password_hash, role_id=role_id)
    conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, '*')", (uid,))
