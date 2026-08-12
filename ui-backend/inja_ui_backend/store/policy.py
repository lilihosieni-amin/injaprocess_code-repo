"""The content-visibility policy (spec D16, D17, D19).

**One global policy, and deliberately not a grant.** What is shown of a process
applies identically to every non-editor: not per-role, not per-department, not
per-user. If field visibility were an ordinary capability, anyone holding
`manage_users` could confer it and internal content would leave the system
without an Editor deciding. `set_visibility` is `delegable: false` (D50), so no
role holding it can be created through any API path — stronger than restricting
the action to a privileged account, because it depends on no account's identity.

What varies between users is *which departments and reports they can reach* —
never *which fields*.

**The department overview is not here** (D55). It is shown in its entirety, with
no per-field switches and no policy table; only scope and confirmation gate it.
If a reason to hide part of it ever appears, it becomes new rows in `FIELDS`
rather than a new mechanism.

**A node has no KPIs.** The two KPI fields in the data model are `process.kpis[]`
(here, as `process_kpis`) and `overview.personnel[].kpi[]` (D55's, and not
switchable). What a node carries is ICOM — IDEF0 information, not a performance
indicator — which is why `node_icom` and `process_kpis` are separate switches.

Defaults live in Python and the table holds only what has been *changed*, so
D17's table is stated exactly once. A migration that seeded the defaults would
state them twice, and the day one moved the two would disagree with no test able
to see which was authoritative.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3

#: The six switchable fields of D17, in the order the policy screen lists them:
#: the process's own record first, then a node's.
FIELDS: tuple[str, ...] = (
    "process_summary",
    "process_idef0",
    "process_kpis",
    "node_description",
    "node_actor",
    "node_icom",
)

#: D17's non-editor defaults. They match what the export publishes today, so
#: nothing becomes visible at migration that is not visible now.
DEFAULTS: dict[str, bool] = {
    "process_summary": False,
    "process_idef0": False,
    "process_kpis": False,
    "node_description": True,
    "node_actor": True,
    "node_icom": False,
}


def current(conn: sqlite3.Connection) -> dict[str, bool]:
    """Every switch, resolved: the stored value where there is one, else D17's.

    Keyed off `FIELDS` rather than off the rows, so a row left behind by a switch
    that no longer exists is ignored rather than added to the policy — the
    vocabulary is the code's, and the table is only storage.
    """
    stored = {r["field"]: bool(r["visible"]) for r in
              conn.execute("SELECT field, visible FROM visibility_policy")}
    return {f: stored.get(f, DEFAULTS[f]) for f in FIELDS}


def set_field(conn: sqlite3.Connection, field: str, visible: bool) -> bool:
    """Store `field`'s new value; return the value it replaced.

    The previous value exists nowhere else once the row is written, and D19 wants
    the actor, the field **and both values** — so it is returned here rather than
    re-read by the caller, where a read-after-write would race itself.

    `ValueError` for a field nobody declared, even though the router checks the
    same thing first: this is the data layer, and a guard that only exists in one
    HTTP handler is a guard the second handler forgets.
    """
    if field not in DEFAULTS:
        raise ValueError(f"not a visibility policy field: {field!r}")
    before = current(conn)[field]
    conn.execute(
        "INSERT INTO visibility_policy (field, visible) VALUES (?, ?)"
        " ON CONFLICT(field) DO UPDATE SET visible = excluded.visible",
        (field, 1 if visible else 0))
    return before


def version(conn: sqlite3.Connection) -> str:
    """The policy's identity — 16 hex chars. D27's third key ingredient.

    A **digest of the policy**, not a counter of changes, and the distinction is
    the point: the version exists to say which policy an artifact was built
    under, so switching a field off and back on must return to the old version.
    A counter would force every department's report to be regenerated for a
    change that changed nothing a reader can see.

    Derived from `current`, so it covers exactly the declared fields and a stray
    row cannot move it. `sort_keys=True` pins the digest to the *value* of the
    policy rather than to `FIELDS`' iteration order — cheap defence that costs
    nothing and is redundant today only because `current` always builds this
    dict from the fixed `FIELDS` tuple; it stops being redundant the moment
    anything builds that dict by another route.
    """
    body = json.dumps(current(conn), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]
