"""Who vouched for what, and for which exact bytes (spec D20, D61).

`(target, fingerprint, confirmed_by, confirmed_at)` where target is a process id
or a department code. A target displays as confirmed only while its **current**
fingerprint matches the stored one — so nothing in this module has to be cleared
by an editor, a chat edit or a `merge` run. The row simply stops matching.

Every write here is a single autocommitted statement. That is not an accident:
the app shares one sqlite connection across FastAPI's threadpool workers, and
`db.connect`'s invariant is that no request handler may open an explicit
transaction on it.
"""
from __future__ import annotations

import sqlite3
from typing import Iterable


def set_confirmation(conn: sqlite3.Connection, *, target: str, fingerprint: str,
                     by: str, at: int) -> None:
    """Vouch for `target` at exactly `fingerprint`, replacing any earlier mark.

    Upsert rather than insert, because there is one answer to "does the current
    fingerprint match?" and two rows would give two — one of them stale, which is
    the failure the fingerprint exists to prevent. Re-confirming after an edit is
    the ordinary path, not the exception.
    """
    conn.execute(
        "INSERT INTO confirmations (target, fingerprint, confirmed_by, confirmed_at)"
        " VALUES (?, ?, ?, ?)"
        " ON CONFLICT(target) DO UPDATE SET"
        " fingerprint = excluded.fingerprint,"
        " confirmed_by = excluded.confirmed_by,"
        " confirmed_at = excluded.confirmed_at",
        (target, fingerprint, by, at))


def get(conn: sqlite3.Connection, target: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT target, fingerprint, confirmed_by, confirmed_at"
        " FROM confirmations WHERE target = ?", (target,)).fetchone()


def revoke(conn: sqlite3.Connection, target: str) -> bool:
    """Withdraw the mark. True when there was one to withdraw.

    The boolean is what lets the caller tell D61's two events apart at the point
    they are written: `confirmation.revoked` is *"the editor decided this was
    wrong"*, and recording one for a target that was never confirmed would put a
    decision in the record that nobody made.
    """
    return conn.execute("DELETE FROM confirmations WHERE target = ?",
                        (target,)).rowcount > 0


def stored_for(conn: sqlite3.Connection,
               targets: Iterable[str]) -> dict[str, str]:
    """The stored fingerprint of each of `targets` that has one — one query.

    A listing asks this about every process in a department, and D56 wants the
    unconfirmed ones *filtered rather than post-filtered*: resolving the whole
    department in one statement is what keeps "which records exist for you" a
    single decision rather than 38 round trips inside a loop.

    A target with no row is simply absent from the result, so the caller's
    comparison (`stored.get(pid) == fingerprint(doc)`) is `None == "…"` and fails
    closed for an unconfirmed target and for a nonsense one alike.

    The largest department has 38 processes, so the parameter list is nowhere
    near sqlite's limit (999 on builds before 3.32, 32766 after).
    """
    ids = list(targets)
    if not ids:
        # `IN ()` runs fine on sqlite (zero rows), but an empty department is
        # the common case and this skips a pointless round trip for it — and
        # keeps the function portable to engines that do reject `IN ()`.
        return {}
    marks = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT target, fingerprint FROM confirmations WHERE target IN ({marks})",
        ids)
    return {r["target"]: r["fingerprint"] for r in rows}
