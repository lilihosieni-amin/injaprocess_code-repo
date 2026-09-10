"""The facts store over HTTP (spec §17, QF-23, QF-26, QF-39).

Three reads, a resolve and a download — and **still no write of the store**:
`facts/**` is written by `merge facts` and by nothing else (QF-2). The resolve
route makes a run directory, records who is running what in its `meta.json`
and shells the verb; the store change is the engine's, and what is left behind
is the same run record and the same revertibility a chat edit leaves. So every
path in this file reads the store, the confirmation marks in `app.db`, or a
file the store cites.

**The gate is not the one the rest of this service runs, in two ways.**

*The capability arm is an OR, and it refuses with a 404.* Facts are a Panel
surface: they are visible to editors and admins and are not in the reader view
in v1 (QF-23, and §18 records it as a deliberate ceiling). So the question is
not "does this caller hold `view`?" — every seeded role does — but "is this
caller in the Panel at all?", which is `PANEL_CAPABILITIES`, the same set
`ui/src/auth/session.ts` routes a session to a shell with. And the refusal is
the uniform 404 rather than a 403, because a 403 says *there is something here*
to precisely the person who is never to learn that facts exist.

*The scope arm is an AND over every department the entry names* (QF-27). An
entry scoped to `["cooking", "accounting"]` needs reach in both, and a
universal entry — `scope.departments` empty — has no target string `contains`
can answer for, so it requires `*`. That is an explicit disjunct in `_targets`
and never a truthiness accident: an entry that names no department is not an
entry that names any department.

The two arms are `panel_session` and `_reachable`, and both are shared by every
route here so a route added later cannot forget either. `panel_session` is the
cheap one and runs as a dependency, before anything touches the disk;
`_reachable` needs the entry, so it runs where the entry is loaded.

**The two write routes add a third arm, and it is one named capability** —
`edit` for the resolve, `export_pdf` for the download — asked *after* the
Panel gate has spoken. That ordering is what keeps QF-23 intact: a holder of
`view` alone is answered the uniform 404 on all five routes, and only a caller
already inside the Panel can ever be told 403. It is also §17's "an admin
denied on the write routes": an admin reads facts, and writes none.

**An admin is a non-editor**, and the two existing non-editor rules apply
unchanged: `Disclosure.may_serve_fact` withholds an entry with no valid
confirmation (D22, now per entry since confirmation is), and QF-26's switches
hide whole kinds and strip `source[]`. An editor of every department the entry
names sees everything, unconfirmed included — so unconfirmed content is
editor-only by construction.

**Nothing here raises.** `facts_store`'s never-raise discipline is the reason
these routes can read an absent store, an absent manifest or a malformed row
and still answer: an unanswerable question is a value, and a crash inside a
gate is a denial of service (`access.py`'s rule).
"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from .. import engine, facts_store, gitcommit, storage, visibility
from ..access import (
    FORBIDDEN,
    NOT_FOUND,
    capabilities_of,
    log_out_of_scope,
    permits,
    requires_every,
    scopes_of,
)
from ..auth import record, require_session
from ..disclosure import Disclosure
from ..fingerprint import fact_fingerprint
from ..models import ResolveFactBody
from ..scopes import contains
from ..store import confirmations, manifest

router = APIRouter(prefix="/api/facts")

#: QF-37's two id namespaces. Anchored `fullmatch`, never a `startswith`: a
#: department literally named `F` must not collide with a fact id, and a query
#: parameter is the caller's own text.
_FACT_ID_RE = re.compile(r"^F-[0-9]{5}$")
_PROC_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")

#: The capabilities that put a session in the Panel (QF-23, spec F2) — the
#: server-side twin of `ui/src/auth/session.ts`'s `PANEL_CAPABILITIES`, and
#: deliberately the same list rather than a subset: which screens a shell draws
#: and which screens the API will answer for must be one decision.
#:
#: `view`, `comment` and `export_pdf` are *not* here, which is the whole point:
#: a Reader holds all three and reaches no facts route.
PANEL_CAPABILITIES = ("edit", "confirm", "set_visibility", "manage_users",
                      "view_audit")


def panel_session(request: Request, user=Depends(require_session)):
    """Every facts route's first gate: a session, and a place in the Panel.

    One dependency shared by all three routes — and by Task 20's two — so the
    §18 ceiling cannot be forgotten by a route added later. It is the *list*
    that makes it a dependency rather than a per-entry check: a `view`-only
    holder must be answered the uniform 404 there too, not an empty list, since
    an empty list is a statement about the store and a 404 is a statement about
    nothing.

    Deliberately capability-only, with no scope in it. The scope question is
    per entry (`_reachable`), and there is no single target this could ask
    about: `*` would 404 every department-scoped editor off their own facts.
    What it answers is "is this caller in the Panel", and being in the Panel is
    a property of the role, not of a department.

    `log_out_of_scope`, not `access.denied`: this is a 404 branch, and D42's
    rule is that the audit event belongs on the 403 and nowhere else — a
    boundary indistinguishable from a typo produces typo-volume rows that would
    bury the 403s. What it leaves instead is a line in the application log.
    """
    if capabilities_of(request.app.state.db, user).isdisjoint(PANEL_CAPABILITIES):
        log_out_of_scope(request, user, request.url.path)
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return user


def _targets(scope: object) -> list[str]:
    """The scope strings an entry requires — every one of which must be covered.

    `["dept:cooking", "dept:accounting"]` for an entry naming two departments,
    `["*"]` for one naming none. The empty case is an **explicit disjunct**,
    not a fall-through: a universal fact is not "a fact whose department
    happens to be missing", it is a fact that binds the whole restaurant, and
    only a `*` holder may have it.

    THE derivation, not one of two: `routers/confirmations._fact_departments`
    calls this rather than restating it, after its own copy drifted into a 500
    on a stored `"scope": null`. Kept as a plain function of the scope object
    rather than of the request, because this one is asked once per row of a
    listing and the confirm gate's is asked once per request.
    """
    departments = (scope or {}).get("departments") if isinstance(scope, dict) else None
    departments = [d for d in departments or [] if isinstance(d, str)]
    return [f"dept:{d}" for d in departments] if departments else ["*"]


def _reach(conn, user):
    """A predicate over an entry's `_targets`: may this caller reach it?

    `permits` once per Panel capability rather than `allows` per row, for the
    reason `Disclosure` hoists its own two lookups: a listing asks this about
    every entry in the store, and neither the role's capabilities nor the
    user's scopes can change inside one request.

    OR over the capabilities, AND over the departments, and the nesting is not
    interchangeable: `any(all(...))` asks whether *one* Panel capability covers
    *every* department, which is what QF-23 says. `all(any(...))` would let a
    caller who may `edit` cooking and `view_audit` accounting read an entry
    binding both, on the strength of two different permissions neither of which
    reaches the whole entry.
    """
    checks = [permits(conn, user, capability) for capability in PANEL_CAPABILITIES]
    return lambda targets: any(all(check(t) for t in targets) for check in checks)


def _reachable(request: Request, user, fid: str) -> dict:
    """The entry `fid` names, or the uniform 404 — the scope arm of the gate.

    Three refusals, one answer, and that is D56: an id the grammar refuses, an
    id nobody minted and an id this caller is not scoped to must be
    indistinguishable, or the route is an existence oracle for the store.

    Unlike `routers/processes._pid_target` this cannot be lexical — a fact id
    carries no department — so the entry is loaded *before* the scope decision.
    That is the trade QF-27 names and accepts: the read is of a file whose
    existence is never disclosed, because every outcome below answers the same
    404.
    """
    if not _FACT_ID_RE.fullmatch(fid):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    entry = facts_store.load_entry(request.app.state.cfg.data_root, fid)
    # `is_fact` as well as "is there": `load_entry` finds an entry by id inside
    # whichever kind file the index points at, so a hand-edited store can hold
    # one whose own `kind` is not one of the five. `visibility.filtered` would
    # then send it down the *process* branch and hand back a whitelisted husk —
    # `{id, nodes: [], pending: []}` — which is a served body for a document
    # this service cannot shape. Fail closed instead: not a fact, not found.
    if entry is None or not visibility.is_fact(entry):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    targets = _targets(entry.get("scope"))
    if not _reach(request.app.state.db, user)(targets):
        log_out_of_scope(request, user, ",".join(targets))
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return entry


def _served(shown: Disclosure, reach, entry: dict, mark: str | None) -> bool:
    """May this caller be told what `GET /api/facts/{id}` would tell them?

    **The** predicate, and it has exactly two callers: `get_fact`, which is the
    route it describes, and `_neighbour_visibility`, which decides whether a
    neighbour's title may be named. One implementation rather than four
    parallel conditions, because the four it composes — `is_fact`, reach, the
    record gate and the kind switch — are each free to change, and a mask that
    restated them would start disagreeing with the route the first time one did.

    `is_fact` is one of the four and belongs here rather than only in
    `_reachable`: a document whose `kind` is outside the five is one the route
    answers 404 for, so this is not the route's conjunction without it.
    `load_all` hands back whatever is in the five kind files, so a hand-edited
    store really can put such a document in front of the mask.

    `redact_fact` is called for its emptiness alone (`{}` is a kind whose
    switch is off, QF-26's *withheld whole*), and the body it builds is thrown
    away here. That is deliberate: asking "is this kind on?" by building the
    body this caller would receive is what stops the mask from growing its own
    reading of the policy table.

    **Access exactly; existence index-first — and the second half is not a
    literal "would the route return it".** The route reaches an entry through
    `facts_store.load_entry`, which finds the id in `.index.json` and uses the
    row's `kind` to pick a file; `_neighbour_visibility` builds its map from
    `load_all`, which reads the five files directly. An entry present in
    `items.json` but absent from the index is therefore 404 from its own route
    and *named* by the mask. Documented rather than closed, and the ruling
    (2026-08-31) gives three reasons: `load_entry` consults no scope, no
    confirmation and no policy, so what diverges is "does the route find it at
    all" and never who may have it; the divergence needs an index and a store
    that disagree, which only `merge facts` writes and it writes both in one
    `save_store`; and closing it means a file read per neighbour, on a bundle
    that already reads the store twice. Every arm this predicate *does* run —
    scope, the record gate, the kind switch — is the route's own, to the call.
    """
    targets = _targets(entry.get("scope"))
    return (visibility.is_fact(entry)
            and reach(targets)
            and shown.may_serve_fact(entry, targets, mark)
            and bool(shown.redact_fact(entry, targets)))


def _neighbour_visibility(conn, root, shown: Disclosure, reach):
    """`id or item key -> may this caller be told what it names?`

    The user's ruling on the bundle's three resolution maps (2026-08-31):
    **keep the row, hide the name.** An entry the caller cannot reach still
    appears in `consumers`, `resolved` and `processes` — so a count stays
    honest and retiring a fact still looks as unsafe as it is — carrying its id
    and nothing else. What it *is* stays withheld.

    Two id namespaces, one predicate over both (QF-37):

    * a **fact** — an `F-` id, or an item's key, which `resolved` uses as a key
      too (QF-37's one exception) — is named iff `_served` says so, which is
      `is_fact`, reach, `may_serve_fact` and the kind switch in one place;
    * a **process** is named iff `Disclosure.sees` **and**
      `Disclosure.may_serve` both say so — scope *and* the record gate a
      tombstone (D17) or a missing confirmation (D22) closes, which together
      are `GET /api/processes/{pid}`'s own conjunction.

    Each arm is its namespace's route asked whole, and the second one says so
    because it once did not: `sees` alone stood here, defended as "scope and
    not the record gate, which is `sees`' own documented decision" — and that
    defence was wrong. `sees` governs whether a link's *id* travels; the maps
    carry a neighbour's name, tombstone state and heir, which is content, and
    an admin the process route 404s was being handed all three. Half a route's
    conjunction is not a decision about disclosure, it is a gap.

    An item key naming more than one entry — the store admits two items with
    one key under different scopes — is named only if **every** one of them is
    served. Fail closed: the label the map carries is one of them, and there is
    no way to tell which from outside.

    One `load_all` and one `stored_for` for the whole bundle, resolved before
    the maps are walked, so this is not a read per neighbour.

    Returns the pair `(visible, names_a_fact)` — see `names_a_fact` for why the
    second one exists.
    """
    entries = facts_store.load_all(root)
    by_name: dict[str, list[dict]] = {}
    for e in entries:
        if isinstance(e.get("id"), str):
            by_name.setdefault(e["id"], []).append(e)
        if e.get("kind") == "item" and isinstance(e.get("key"), str):
            by_name.setdefault(e["key"], []).append(e)
    stored = confirmations.stored_for(
        conn, [e["id"] for e in entries if isinstance(e.get("id"), str)])

    def visible(name: object) -> bool:
        if not isinstance(name, str):
            return False
        if _PROC_ID_RE.fullmatch(name):
            # Both halves — see the docstring for which, and for what half of
            # them once let through.
            #
            # `{}` for a process with no file, so an absent one answers like an
            # unconfirmed one. That is the route's behaviour rather than a
            # simplification: `get_process` 404s both, and D22 exists so that a
            # non-editor cannot tell "nobody has confirmed this" from "it is
            # gone". Distinguishing them here would hand back the very
            # enumeration that 404 is conflating.
            doc = facts_store._process_doc(root, name)
            return (shown.sees(name)
                    and shown.may_serve(doc or {}, storage.dept_of(name), name))
        found = by_name.get(name)
        return bool(found) and all(
            _served(shown, reach, e, stored.get(e.get("id")))
            for e in found)

    def names_a_fact(value: object) -> bool:
        """Is this string an id or an item key the **store** knows?

        Beside `visible` because the two answer different questions, and
        `_masked_rows` needs both: `visible` is `False` for a name nobody
        minted as much as for one this caller may not be told about, and a
        row's cells are full of strings that are neither — a unit, a date, a
        number. Only a cell that really names an entry can mask a row.
        """
        return isinstance(value, str) and value in by_name

    return visible, names_a_fact


def _masked_rows(entry: dict, titles: dict, visible, names_a_fact) -> set[str]:
    """Row keys whose title is **composed** out of a neighbour this caller may
    not be told about (owner's ruling, extended 2026-08-31).

    A reference table's row has no title of its own: the row *is* its cells, so
    `facts_store.row_titles` builds one out of the titles of the items those
    cells name — «اینجا پیتزا — قارچ» (§9). That is a neighbour's Persian
    reaching the caller by composition rather than through `resolved`, and it
    is the same boundary by a different path, so it takes the same answer:
    masked **whole**, with the marker already approved, and never composed from
    the half the caller may see. A partly-composed row is a screen state the
    design does not draw.

    A row that carries its **own** `title` is not composed — that title is this
    entry's content, and this entry is one the caller was served — so it is
    never masked. Same for a row whose cells resolve to nothing: `row_titles`
    falls back to the row key, which names no neighbour.

    The test is "does any cell of this row name a fact this caller may not be
    told about", over **every** cell rather than over the `refItems` columns in
    `primaryKey` order that `row_titles` actually composes from. Deliberate:
    that column choice is `facts_store`'s private business, and a mask that
    restated it would be the second copy of a rule this round exists to avoid.

    **And a row whose served title is its own key is not masked either.** The
    common way to reach `titles[key] == key` is `row_titles`' fallback, which
    fires when no cell resolved — nothing composed, so marking the row
    restricted would draw «خارج از دسترسی شما» over a label wholly this
    entry's own. The check reads the *output* rather than re-deriving which
    columns compose: that closes the over-masking without restating the column
    rule this function deliberately does not know.

    It is **not** a test for "did this compose". A single-`refItems` row whose
    item's title is byte-equal to the row key composes to the key, and this
    skips it — verified against a built store, so the earlier claim here that
    Persian composition cannot collide with an ASCII minted key was simply
    false: neither `data.rows[].key` nor an item's `title` is constrained to a
    character set by the schema. The guard is right for a stronger reason than
    the one it used to give. What it withholds is a *value*, and the value in
    that case is byte-identical to the map key the caller already holds, so
    nothing crosses the boundary that was not already on the wire. Masking it
    would cost a legible label and buy nothing.

    # ponytail: what survives is a row whose title really did compose and whose
    # *non*-`refItems` cell happens to hold a string equal to some item's key —
    # over-masked, never under-masked, which is the direction that matters.
    # Narrow it by having `facts_store.row_titles` report which rows it
    # composed, if a real store ever trips it.
    """
    out = set()
    for row in (entry.get("data") or {}).get("rows") or []:
        if not isinstance(row, dict):
            continue
        key = row.get("key")
        if not isinstance(key, str) or key not in titles:
            continue
        if isinstance(row.get("title"), str) and row["title"]:
            continue
        if titles[key] == key:
            continue
        if any(names_a_fact(cell) and not visible(cell)
               for cell in row.values()):
            out.add(key)
    return out


#: The marker a masked neighbour carries in place of everything it would have
#: said about itself. A **flag, not a sentence**: «خارج از دسترسی شما» is the
#: UI's, rendered from `lib/factsLabels.ts` (§14 note 9 — labels come from
#: `factsLabels` and the registries, never inline), and QF-32 keeps Persian out
#: of keys. Absent rather than `false` on an unmasked row, so a typed client has
#: to narrow before reading a title it may not have.
_RESTRICTED = "restricted"


def _count(counts: object, name: str) -> int:
    """One of the index row's counts, or zero — never an exception.

    `field_status_counts` is optional in `facts-index.schema.json` and the
    index is a file on disk like any other, so a hand-edited or
    partially-migrated row can carry anything at all here.
    """
    value = counts.get(name) if isinstance(counts, dict) else None
    return value if isinstance(value, int) and not isinstance(value, bool) \
        and value >= 0 else 0


def _red_counts(row: dict, entry: dict) -> dict:
    """`{unknown, disputed}` for the list row's «۲ بی‌پاسخ · ۱ متعارض» (§14
    note 1, QF-25).

    From the **index row** where it carries them: `merge facts` derives
    `field_status_counts` when it writes the store, and the index is the
    flattened listing surface those columns exist for. A row without them —
    only a store this service did not write can produce one — falls back to
    counting `facts_store.red_paths`, which is the same red set the detail
    bundle serves, so the two screens cannot disagree about an entry.

    The two sources count a dispute slightly differently: the engine counts
    open *accounts*, the fallback counts distinct disputed *fields*. They agree
    except where one field carries two open accounts, and the index's reading
    wins because the index is what `merge facts check` reports.
    """
    counts = row.get("field_status_counts")
    if isinstance(counts, dict):
        return {"unknown": _count(counts, "unknown"),
                "disputed": _count(counts, "disputed")}
    red = facts_store.red_paths(entry)
    return {"unknown": len(red["unknown"]), "disputed": len(red["disputed"])}


def _consuming(root, consumes: str | None) -> set[str] | None:
    """The ids `?consumes=` admits, or `None` when the filter is not asked for.

    QF-39's reverse index, computed server-side (`facts_store.consumers`). An
    id the grammar refuses admits nothing rather than everything: a filter that
    silently stops filtering is how a screen shows a caller the whole store.
    """
    if consumes is None:
        return None
    if not _FACT_ID_RE.fullmatch(consumes):
        return set()
    return {c["id"] for c in facts_store.consumers(root, consumes)}


def _links(entry: dict, process: str) -> bool:
    """Does the entry declare a link to this process (QF-8)?

    Read off the entry's own `processes[]` — the same list `process_links`
    resolves — rather than by resolving each link against `departments/**`,
    which would load a process document per row of the listing to answer a
    question the entry already carries.
    """
    if not _PROC_ID_RE.fullmatch(process):
        return False
    return any(isinstance(p, dict) and p.get("ref") == process
               for p in entry.get("processes") or [])


@router.get("")
def list_facts(request: Request, user=Depends(panel_session)):
    """Every entry this caller may be told exists, with its confirmation state.

    Filtered per row rather than gated on one target, like `/api/departments`
    and for the same reason: the store spans every department, and a list that
    refused outright would take a two-department head's whole screen away over
    one entry they cannot reach. What is *not* per row is the Panel question —
    that is `panel_session`, and it answers 404.

    **The confirmation state is resolved in one statement** for the whole
    listing (`confirmations.stored_for`), not one query per row: D56 wants the
    records a caller may see filtered in the query and never client-side, and
    `Disclosure.servable` resolves a department the same way. Each row carries
    the entry's current `fingerprint` beside `confirmed`, for the reason
    `routers/confirmations._row` carries both: a tick drawn from this listing
    has to be pressable, and QF-24 forbids the client computing a print.

    The rows come from `.index.json`, which is what that file is for — the
    flattened, filterable projection of the store — joined to the entries,
    which are the truth. An index row with no entry behind it is dropped rather
    than listed, and every field a *gate* reads (`kind`, `scope`) is taken from
    the entry, because the detail route has only the entry and a row it would
    404 is a dead link drawn by the server itself. The join costs nothing
    extra: the fingerprint, the red fallback and the process filter all need
    the entry anyway.

    **Newest created first** (owner's ruling, 2026-09-09): `allocate-id` mints
    fact ids in creation order and zero-pads them, so id descending *is*
    newest-first — and unlike `updated_at`, which one `merge facts` run stamps
    on many entries at once, it does not reshuffle the screen after a re-run.
    """
    cfg, conn = request.app.state.cfg, request.app.state.db
    root = cfg.data_root
    reach = _reach(conn, user)
    shown = Disclosure(conn, user)
    process = request.query_params.get("process")
    consuming = _consuming(root, request.query_params.get("consumes"))

    # `isinstance` on the index itself, not only on its rows: `load_index`
    # hands back the file as stored, so a `.index.json` that is a JSON array
    # would answer `AttributeError` — a 500 — from inside a read this module
    # promises cannot fail.
    index = facts_store.load_index(root)
    rows = [r for r in (index.get("entries") if isinstance(index, dict) else None) or []
            if isinstance(r, dict) and isinstance(r.get("id"), str)
            and _FACT_ID_RE.fullmatch(r["id"])]
    entries = {e["id"]: e for e in facts_store.load_all(root)
               if isinstance(e.get("id"), str)}
    stored = confirmations.stored_for(conn, [r["id"] for r in rows])

    out = []
    for row in rows:
        entry = entries.get(row["id"])
        # An index row with no entry behind it, or one whose entry is not a
        # fact this service can shape, is dropped rather than listed: a row the
        # detail route would 404 is a dead link drawn by the server itself.
        if entry is None or not visibility.is_fact(entry):
            continue
        if consuming is not None and row["id"] not in consuming:
            continue
        if process is not None and not _links(entry, process):
            continue
        # **The entry decides anything a gate reads; the index supplies the
        # rest.** `.index.json` is derived, so a store written by one version
        # and indexed by another can disagree with it — and the detail route
        # has only the entry. Gating the list on the index row's `scope` would
        # then list a row the detail 404s, which is the dead link the join
        # above exists to prevent; the same holds for `kind`, which is what the
        # QF-26 switch is chosen by.
        targets = _targets(entry.get("scope"))
        mark = stored.get(row["id"])
        # The three withholding rules, in the order they cost: scope, then the
        # record gate, then the kind switch — which is asked by building the
        # body this caller would receive, so "which kinds exist for me" has one
        # implementation shared with the detail route rather than two.
        if not reach(targets):
            continue
        if not shown.may_serve_fact(entry, targets, mark):
            continue
        if not shown.redact_fact(entry, targets):
            continue
        now = fact_fingerprint(entry)
        out.append({
            "id": row["id"],
            "kind": entry.get("kind"),
            "key": row.get("key"),
            "title": row.get("title"),
            "aliases": row.get("aliases") or [],
            "scope": entry.get("scope") or {},
            "status": row.get("status"),
            "retired": bool(row.get("retired")),
            "stub": bool(row.get("stub")),
            "red_counts": _red_counts(row, entry),
            # Both, exactly as `routers/confirmations._row` reports both for a
            # process: `fingerprint` is the entry's **current** print — what a
            # `POST /api/confirmations/{fid}` must echo — and `confirmed` is
            # whether the stored mark equals it. Reporting the pair is what lets
            # a screen show the state and act on it without ever computing a
            # print of its own, which QF-24 forbids the client doing.
            "fingerprint": now,
            # The stored mark and nothing else — the tick is set by a person
            # in the panel (owner ruling, 2026-09-09). An engine write stamps
            # `updated_at` and moves the print, so a bot edit un-confirms the
            # entry by itself, exactly as a `merge` run does for a process.
            "confirmed": mark is not None and mark == now,
            "updated_at": row.get("updated_at"),
        })
    out.sort(key=lambda r: r["id"], reverse=True)
    return {"entries": out, "coverage": facts_store.coverage(root)}


@router.get("/branches")
def list_branches(request: Request, _=Depends(panel_session)):
    """The registered branches (QF-4), from the manifest and from nowhere else.

    **Declared before `/{fid}`**, because FastAPI matches in declaration order
    and `branches` is not an `F-` id: registered the other way round, the
    detail route would claim this path and answer the uniform 404, and the list
    screen would silently lose its branch filter.

    No per-entry scope: a branch belongs to the estate rather than to a
    department, so the Panel gate is the whole of it. An absent manifest is an
    empty list — every deployment is in that state until the first
    `dump-workbook --init-manifest` run.
    """
    return manifest.branches(request.app.state.cfg.data_root)


def _original_text(root: Path, entry: dict) -> str | None:
    """The verbatim body behind `data.original_ref`, or `None`.

    **Owner request, 2026-09-06:** «in section متن اصلی i want to show the file
    data there». QF-31 moves a delta's `data.original` out of the entry into
    `facts/originals/` and leaves an `original_ref` behind, so every entry in a
    real store carries the path and none carries the text — and the screen had
    only the path to draw. A reviewer opening «متن اصلی» was shown the name of a
    file and none of its contents.

    Read here rather than served by a route of its own: there are 140 of these
    and the largest is 1.6 KB, so an endpoint plus a hook, a loading state and
    an error state inside a collapsed panel would be more machinery than the
    thing it fetches.

    **No gate of its own, deliberately.** The inline `data.original` a delta
    carries is already served to exactly the callers who reach this entry, and
    `fact_sources` does not touch it — that switch strips `source[]` and each
    account's `source`, which is where the words came FROM, not the words. A
    second rule here would make one shape of the same field disclose
    differently from the other.

    Containment, because a stored string that has been tampered with is still
    untrusted the moment it becomes a path — `download_source`'s idiom, resolved
    on both sides. Anything outside `facts/originals/` reads as an absence, and
    so does a file that is not there: an `original_ref` naming nothing must not
    take down the whole screen the reviewer came for.
    """
    ref = (entry.get("data") or {}).get("original_ref")
    if not isinstance(ref, str) or not ref:
        return None
    base = (root / "facts" / "originals").resolve()
    try:
        target = (root / ref).resolve()
        if not target.is_relative_to(base) or not target.is_file():
            return None
        return target.read_text(encoding="utf-8")
    except (ValueError, OSError):
        return None


def _bundle(request: Request, user, fid: str) -> dict:
    """One entry, with every map a screen needs to render it without a raw key.

    **The body of `GET /api/facts/{fid}`, and what `POST …/resolve` answers
    with**, which is why it is a function rather than the route. A resolve
    returns the entry *as it now stands* — re-read from disk, re-gated, and
    re-masked — so the screen that settled a dispute is handed the same
    document it would get by asking for it again, rather than a second shape
    assembled by the write path.

    §17's closing promise is that `resolved`, `row_titles` and `path_labels`
    between them cover every id, item key, row key and red path the entry
    references, so no screen can fall back to `prod_61__ing_22`. They are
    computed server-side because the client has neither the store nor the
    `departments/**` tree to compute them from.

    **Three ways to be refused, and all three are the same 404**: the id is not
    in the store or not in this caller's scope (`_reachable`); the entry
    carries no valid confirmation and this caller is not its editor
    (`may_serve_fact`); its kind is switched off for a non-editor
    (`redact_fact` answering `{}`). D56 again — a caller learns which of their
    guesses exist from nothing, the visibility policy included.

    **And the maps name only the neighbours this caller could fetch.** The
    user's ruling (2026-08-31): keep the row, hide the name — see
    `_neighbour_visibility`. The rule is the route's own answer applied to each
    neighbour, so a title appears here exactly when a `GET` of that id would
    have returned the entry behind it.
    """
    conn = request.app.state.db
    root = request.app.state.cfg.data_root
    entry = _reachable(request, user, fid)
    targets = _targets(entry.get("scope"))
    shown = Disclosure(conn, user)
    reach = _reach(conn, user)
    row = confirmations.get(conn, fid)
    mark = row["fingerprint"] if row is not None else None
    now = fact_fingerprint(entry)
    # `_served` and not the three conditions inline, though `_reachable` has
    # already run the first of them: this is the predicate the mask below asks
    # of every neighbour, and the route has to be its first caller or "would a
    # GET of that entry return it" stops being a fact about this route.
    if not _served(shown, reach, entry, mark):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    # The listing's rule for one entry — see `list_facts`.
    confirmed = mark is not None and mark == now
    served = shown.redact_fact(entry, targets)
    visible, names_a_fact = _neighbour_visibility(conn, root, shown, reach)
    titles = facts_store.row_titles(root, entry)
    hidden_rows = _masked_rows(entry, titles, visible, names_a_fact)
    may_confirm = permits(conn, user, "confirm")
    return {
        "entry": served,
        "confirmation": {
            # The entry's **current** print, and what a
            # `POST /api/confirmations/{fid}` must echo — QF-24 forbids the
            # client computing one, and no other route serves a fact's. Beside
            # `confirmed` for the reason `routers/confirmations._row` reports
            # the same pair: the state, and the means to act on it, in one body.
            "fingerprint": now,
            "confirmed": confirmed,
            # What the tick may do, not what it would say: `confirm` at every
            # department the entry names (QF-27), and nothing else. The second
            # half — "and not a red entry", QF-25's red-over-green — was
            # **overturned by the owner on 2026-09-06**: «each of the
            # quantitative items should be confirmable, regardless of whether it
            # has an issue or not.» `POST /api/confirmations/{fid}` dropped the
            # matching 409 in the same change, so this stays what it has always
            # been: the endpoint's own rules, read here so the control is drawn
            # in the state the endpoint will honour.
            "can_confirm": all(may_confirm(t) for t in targets),
        },
        # From the stored entry, never from `served`: the red set, the labels
        # and the reverse index are statements about the content as it is, and
        # `fact_sources` withholds provenance from a body without changing what
        # is disputed or unanswered inside it.
        "red_paths": facts_store.red_paths(entry),
        # The three resolution maps, masked. `facts_store` builds them from the
        # whole store because §17 and QF-39 require them complete — it knows no
        # caller — so the withholding is here, in the layer that does.
        #
        # A masked row keeps **only what makes it a row** — the key of
        # `resolved`, the `id` of a consumer, the `ref` of a process link — and
        # gains `restricted`. Everything else goes, with no per-field
        # judgement: not the title, not an item's estate `code`, not the `kind`.
        # For a process that means `tombstoned`, `heir` and `missing_nodes` go
        # too, and deliberately: a tombstone state is a statement about a
        # process this caller may not see, and `heir` is a bare id disclosure of
        # a process that may be in a third department again. A row that says
        # "there is one more, and it is not yours to read" is the whole of what
        # the ruling asks for.
        "resolved": {name: (label if visible(name) else {_RESTRICTED: True})
                     for name, label in
                     facts_store.resolved_map(root, entry).items()},
        # A composed row title is a neighbour's Persian reaching the caller by
        # another road, so it takes the same marker — whole, never half of a
        # composition (`_masked_rows`).
        "row_titles": {k: (v if k not in hidden_rows else {_RESTRICTED: True})
                       for k, v in titles.items()},
        # And `path_labels` renders «ستون — ردیف» out of those same row
        # titles, so a path that **names** a masked row inherits the mask. The
        # test is segment-wise — does this path name that row — rather than a
        # second reading of QF-7's path grammar.
        "path_labels": {p: (label if hidden_rows.isdisjoint(p.split("/"))
                            else {_RESTRICTED: True})
                        for p, label in
                        facts_store.path_labels(root, entry).items()},
        # The two maps the «محل اجرا» and «نسخه‌ها» sections need and the entry
        # cannot carry: a workbook's title is the manifest's, and a binding's
        # sheet and branch live on the record the rule points at. Unmasked —
        # both are estate structure, not a neighbour's Persian (`resolved` is
        # where a neighbour's name is masked, and these carry no title of one).
        "workbook_titles": manifest.workbook_titles(root),
        "binding_labels": facts_store.binding_labels(root, entry),
        # A unit's Persian is the units record's, and the entry cannot carry it
        # (`ruleOutput` admits no `unit_title`; the entry is fingerprinted).
        "unit_titles": facts_store.unit_titles(root),
        # «متن اصلی» — the body `data.original_ref` names, beside the entry and
        # never inside it: `entry` is what QF-24 fingerprints, and a field
        # arriving from a second file would change the print of every rule in
        # the store at once, un-confirming all of them for a change to nothing.
        "original": _original_text(root, entry),
        "consumers": [c if visible(c.get("id"))
                      else {"id": c.get("id"), _RESTRICTED: True}
                      for c in facts_store.consumers(root, fid)],
        "processes": [p if visible(p.get("ref"))
                      else {"ref": p.get("ref"), _RESTRICTED: True}
                      for p in facts_store.process_links(root, entry)],
    }


def _source_roots(root: Path) -> list[tuple[Path, str | None]]:
    """QF-39's three roots, each with the department it names or `None`.

    **Exactly three, and a fourth is a decision rather than an oversight**: the
    estate's workbooks (`attachments/sheets/`), a department's field material
    (`departments/{dept}/attachments/`) and the transcripts, which are the
    file behind a `voice` source since the audio is not kept. A source citing
    anything else — a process document, a store file, `meetings/audio/` —
    resolves outside all three and is not served.

    The middle root is one per department **read off the tree** rather than off
    the registry, so it is the same set of directories the upload bot writes
    into; a `departments/` that is not there at all raises inside `_source`'s
    guard and answers the same 404 as everything else it refuses.

    The department comes back beside the root because it is the only one of the
    three that names one, and it is what the scope arm asks about. `None` for
    the other two is not "no scope needed" phrased as an absence — the estate's
    workbook roll belongs to no department (QF-4, and `/api/facts/branches`
    takes the same view), and a transcript's path carries no department at all.
    """
    return [(root / "attachments" / "sheets", None),
            (root / "meetings" / "transcripts", None),
            *((d / "attachments", d.name)
              for d in sorted((root / "departments").iterdir()) if d.is_dir())]


def _source(root: Path, raw: str) -> tuple[Path, str | None] | None:
    """The file `raw` names and the department it belongs to, or `None`.

    `resolve()` on **both sides**, `routers/export_files.serve_export`'s idiom
    and for its reasons: a `..` segment that survived URL decoding and a
    symlink pointing out of a root are refused by the same comparison, and an
    absolute path escapes the join rather than the containment — `root / "/etc/
    passwd"` *is* `/etc/passwd`, which is inside no root.

    Everything is inside the guard because this is where untrusted input
    becomes a filesystem path, and it fails in more ways than "not there":
    `resolve()` raises `ValueError` on an embedded NUL (which a URL can carry
    as `%00`) and `OSError` on a symlink loop. An escaping exception here would
    be a 500 and a traceback for a malformed query string.

    Existence is **not** asked. Containment is a property of the path, so the
    refusal below cannot depend on whether the file is there — which is what
    keeps the capability refusal from becoming an existence probe.
    """
    try:
        target = (root / raw).resolve()
        for base, dept in _source_roots(root):
            if target.is_relative_to(base.resolve()):
                return target, dept
    except (ValueError, OSError):
        pass
    return None


def _cited_files(entry: dict):
    """Every file an entry cites: `source[]` and `accounts[].source`.

    Both, because both are provenance and QF-26 strips both together — an
    account's source is the evidence for one side of a dispute, which is
    exactly what the reviewer opening a red row is going to ask for.

    A `ref` that is not a string is skipped rather than guessed at: `sourceLoc`
    allows `null` (a source with no file behind it, a `chat` citation with
    nothing to download), and nothing revalidates a stored entry on read.
    """
    sources = list(entry.get("source") or [])
    sources += [a.get("source") for a in entry.get("accounts") or []
                if isinstance(a, dict)]
    for src in sources:
        if isinstance(src, dict) and isinstance(src.get("ref"), str):
            yield src["ref"]


def _cites(conn, root: Path, user, target: Path) -> bool:
    """Does any entry this caller **may be served** cite `target`?

    The download's disclosure arm, and the user's ruling of 2026-08-31 applied
    to the strongest case there is. That ruling — *keep the row, hide the name*
    — withholds a neighbour's Persian **title** across a scope boundary; a
    route that handed the same caller the whole transcript the neighbour was
    extracted from would contradict it by orders of magnitude. So a file is
    reachable through the entry that cites it, and by no other road.

    **Citation and not scope, because two of the three roots have no
    department to be scoped by.** A workbook's manifest row can name
    `departments: []` and a meeting is cross-departmental by nature, so
    `attachments/sheets/**` and `meetings/transcripts/**` admit no scope
    predicate at all — where the entry that cites them always has one. It is
    also the same discipline as everywhere else in this module: the question is
    `_served`, the route's own answer, asked again rather than restated.

    `redact_fact` **after** `_served`, and reading the citations off the
    *served* body rather than off the stored entry, is what makes QF-26 fall
    out instead of being re-implemented: with `fact_sources` down a non-editor's
    served entry carries no `source[]` and no `accounts[].source`, so it cites
    nothing and the file is 404 — while an editor, whom that switch has never
    governed, still holds a body that cites it. One rule, applied where it
    already lives.

    Nothing here is scoped to the *requested* entry: the caller may have
    arrived from any of the entries citing this file, and requiring the one
    they clicked would mean a fact id in the query string that the design does
    not draw.

    # ponytail: one `resolve()` per cited ref of every served entry, per
    # download — a few thousand path calls on a store far larger than today's.
    # Index refs by resolved path if a download is ever measurably slow.
    """
    shown = Disclosure(conn, user)
    reach = _reach(conn, user)
    entries = facts_store.load_all(root)
    stored = confirmations.stored_for(
        conn, [e["id"] for e in entries if isinstance(e.get("id"), str)])
    for entry in entries:
        if not _served(shown, reach, entry, stored.get(entry.get("id"))):
            continue
        served = shown.redact_fact(entry, _targets(entry.get("scope")))
        for ref in _cited_files(served):
            try:
                if (root / ref).resolve() == target:
                    return True
            except (ValueError, OSError):
                continue
    return False


@router.get("/source")
def download_source(request: Request, user=Depends(panel_session)):
    """One cited file, downloaded — and **never rendered** (QF-39).

    A reviewer's procedure for a red row is to look at the evidence, and the
    Panel has no viewer: every file-backed source is one confirmation popup and
    then a download. So the response is `content-disposition: attachment`
    without exception. Streaming a transcript or a photograph inline would put
    a document nobody gated the *contents* of onto a screen, and «فایل منبع
    دانلود شود؟» would be asking about something that had already happened.

    Four refusals, in D56's order, and only one of them is a 403:

    * **outside the three roots** — the bare uniform 404, exactly as for a
      source whose file has been moved away (`_source`);
    * **outside the caller's department** — the same 404, for the one root that
      names a department (§15: gated by scope *and* by `export_pdf`). Scope
      before capability, or a caller who fails both halves is told 403 about a
      department they were never to learn of;
    * **cited by no entry this caller may be served** — the same 404 again,
      and the arm that actually closes the estate (`_cites`). The other two
      roots name no department, so without it any Panel member holding
      `export_pdf` could pull every meeting transcript and every workbook dump
      in the restaurant — while the *titles* of the entries drawn from them
      stay masked three routes away (the ruling of 2026-08-31). QF-26's
      `fact_sources` is inside this arm rather than beside it: a caller whose
      served body has had its provenance stripped cites nothing, and an editor,
      whom that switch never governed, still does;
    * **without `export_pdf`** — 403, the download split (D25): this caller is
      in the Panel and is being served an entry that cites the file, so what is
      refused is the action, not the knowledge. Recorded as `access.denied`
      (D42) and only here, because that event is high-signal precisely while it
      is rare.

    `Cache-Control: private, no-cache` for `serve_export`'s reason: the file is
    behind a session now, so no shared cache may keep a copy for the next
    person, and the browser must ask before reusing its own.
    """
    conn = request.app.state.db
    root = request.app.state.cfg.data_root.resolve()
    raw = request.query_params.get("path", "")
    found = _source(root, raw)
    if found is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    target, dept = found
    if dept is not None and not any(contains(s, f"dept:{dept}")
                                    for s in scopes_of(conn, user)):
        log_out_of_scope(request, user, f"dept:{dept}")
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    # Before the capability, like every other refusal that is about what this
    # caller may **know**: a 403 for a file no entry of theirs cites would say
    # "this exists" about provenance they are not being shown.
    if not _cites(conn, root, user, target):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if "export_pdf" not in capabilities_of(conn, user):
        # `getattr` for `access._require_capability`'s reason: `State` raises
        # for a key it does not hold, and a gate that raises answers 500
        # instead of 403. Written before the raise, so the refusal cannot be
        # lost to the exception on its way out.
        record(request, "access.denied", actor=user["username"],
               session_id=getattr(request.state, "session_id", None),
               target=raw[:120], outcome="denied",
               detail={"capability": "export_pdf"})
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    try:
        present = target.is_file()
    except OSError:
        present = False
    if not present:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return FileResponse(target, filename=target.name,
                        headers={"Cache-Control": "private, no-cache"})


@router.get("/{fid}")
def get_fact(fid: str, request: Request, user=Depends(panel_session)):
    """One entry and its maps — `_bundle`, which `POST …/resolve` also serves.

    Declared **after** `/source`, because FastAPI matches in declaration order
    and `source` is not an `F-` id: the other way round this route would claim
    that path and answer the uniform 404, and every download would 404 with
    nothing to say why (`list_branches` carries the same note).
    """
    return _bundle(request, user, fid)


def _entry_targets(request: Request) -> list[str] | None:
    """The scope strings the write gate needs for the `F-` id in the path.

    `_targets` of the entry's scope — every department it names, or `["*"]`
    when it names none — and `None` when the id is not one this service can
    serve at all, which `requires_every` turns into the same uniform 404 an
    out-of-scope target gets (D56).

    `is_fact` as well as "is there", for `_reachable`'s reason: an `F-` id
    carrying a kind outside the five is a document this service cannot shape,
    and it must not become a *writable* one merely because its id looked right.

    No grammar check of its own, unlike `_reachable`'s: `load_entry` finds an
    id in `.index.json` and never builds a path out of it, so an id the
    grammar refuses is simply an id the index does not carry — and a second
    copy of the pattern here would be an arm no test could ever see removed.
    """
    fid = request.path_params["fid"]
    entry = facts_store.load_entry(request.app.state.cfg.data_root, fid)
    if entry is None or not visibility.is_fact(entry):
        return None
    return _targets(entry.get("scope"))


def _write_gate(request: Request, user=Depends(panel_session)):
    """The Panel, then `edit` at every department the entry names (QF-27).

    Composed rather than stacked as two dependencies so the order is written
    down where it is read: `panel_session` is the sub-dependency, so it has
    already spoken by the time this body runs. That is what makes the refusal a
    404 for everyone outside the Panel and a 403 only for someone inside it —
    the admin of §17, who reads facts and writes none.

    `requires_every` and not `requires`: an entry may bind several departments
    and `contains` answers one string at a time, so a fact's requirement cannot
    be reduced to the single target `requires` compares. Same call the confirm
    gate makes (`routers/confirmations._confirm_gate`).
    """
    return requires_every("edit", _entry_targets)(request, user)


#: Where a UI run is filed when the entry names no department at all.
#: QF-43's own answer rather than a new one: the bootstrap seeds the universal
#: entries "under `management`", so a universal fact's runs already have a
#: home, and `revert` finds this one where it finds those.
_UNIVERSAL_RUN_DEPARTMENT = "management"

#: A department code as `facts.schema.json` patterns it. Checked here because
#: the run directory is a **path segment** built from a stored value, and the
#: store is a file on disk that nothing revalidates on read.
_DEPT_RE = re.compile(r"^[a-z]+$")


def _run_department(entry: dict) -> str:
    """The department this entry's run directory is filed under.

    The first of its `scope.departments` in sorted order, so a two-department
    entry lands in the same place every time whatever order the store happens
    to hold them in; `management` for an entry that names none.

    A stored value that is not a department code is dropped rather than
    escaped: a run directory is a path, and `..` reaching one is not something
    to leave to the join. That filter is **unkillable past the gate** — a
    department the grammar refuses produces a target no scope contains, `*`
    holders included, so `_write_gate` has already answered 404 — and it is
    kept for the reason `access.reachable_departments` keeps its own: it is
    what stops a malformed value entering a *path* if the gate above ever
    moves, or if a second write verb calls this from somewhere else.
    """
    scope = entry.get("scope")
    departments = scope.get("departments") if isinstance(scope, dict) else None
    named = sorted(d for d in departments or []
                   if isinstance(d, str) and _DEPT_RE.fullmatch(d))
    return named[0] if named else _UNIVERSAL_RUN_DEPARTMENT


@router.post("/{fid}/resolve")
async def resolve_fact(fid: str, body: ResolveFactBody, request: Request,
                       user=Depends(_write_gate)):
    """Settle one disputed field by choosing an account (QF-39, §12).

    **The service never edits `facts/*.json`** (QF-2). It opens a run
    directory, writes the `meta.json` that says who is doing this and when, and
    runs `merge facts resolve` — which snapshots the store into
    `{run_dir}/facts-before/`, installs the chosen account's value, marks the
    losers `rejected`, re-derives `status` and appends what it did to the run's
    delta. The record is therefore the one `merge facts revert` reads, and a
    resolve from the Panel is undone exactly like a resolve from chat.

    **422 for a failed precondition**, carrying the engine's own message: exit
    2 means nothing was written, so there is nothing to roll back and the body
    was well formed — what refused it is the state (the account is not on that
    field, or not on that entry at all). The message is the engine's rather
    than a translation of it, because the account and field it names are the
    two things the caller sent.

    The commit is `gitcommit`'s, over `facts/` and this run directory: the
    store and the record of why it moved land in one commit, which is what a
    confirmation's `data_repo_commit` column is later reconciled against.

    No activity-record event of its own. The run directory *is* the record
    QF-39 asks for — "the run record and the audit trail are the same as from
    chat" — and D42's catalogue is not something a route invents a row in.
    """
    cfg = request.app.state.cfg
    # Loaded again rather than carried out of the gate: `requires_every` hands
    # back the user, not the entry, and the alternative — a gate that stashes a
    # document on `request.state` — is how the thing that was gated and the
    # thing that is written come apart.
    entry = _reachable(request, user, fid)
    # One writer at a time, over the whole store — `routers/processes.save`'s
    # own shape (`async def` plus the lock around the write *and* the commit),
    # and `merge_facts/apply.py` states the assumption it is holding up:
    # "five shared files, one writer, no lock". This route is the only thing
    # that can break it, because FastAPI runs a sync handler in a worker
    # thread and two resolves would then interleave `load_store` →
    # `save_store` — losing an update, and taking two `facts-before/`
    # snapshots of a store the other has already moved, which is a `revert`
    # that restores the wrong bytes.
    #
    # The commit is inside for the reason it is inside there: the run that
    # records why the store moved is written and committed under one lock.
    async with storage.file_lock(cfg.data_root / "facts"):
        run = engine.facts_run_dir(cfg, _run_department(entry),
                                   user["username"])
        try:
            engine.merge_facts_resolve(cfg, fid, body.field, body.account, run)
        except engine.EngineError as e:
            raise HTTPException(status_code=422, detail=e.message)
        engine.finish_facts_run(run)
        # `facts/` is ignored data since 2026-09-10 (owner's ruling), so the
        # store itself is not staged — `git add` on an ignored path fails the
        # whole commit. What is committed is the run: who resolved what, and
        # why. Undoing a store change never needed git anyway; `merge facts
        # revert` restores the run's own `facts-before` snapshot.
        gitcommit.commit(cfg, [run], fid, f"facts resolve {body.field}")
    return _bundle(request, user, fid)
