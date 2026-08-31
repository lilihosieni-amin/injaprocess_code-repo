"""Reading the facts store over HTTP (spec §17, QF-23, QF-26, QF-39).

Three reads, one gate, and no writes: `facts/**` is written by `merge facts`
and by nothing else (QF-2), so every path in this file is a read of the store
plus the confirmation marks in `app.db`.

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

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import facts_store, storage, visibility
from ..access import NOT_FOUND, capabilities_of, log_out_of_scope, permits
from ..auth import require_session
from ..disclosure import Disclosure
from ..fingerprint import fact_fingerprint
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

    Same derivation as `routers/confirmations._fact_departments`, which is the
    confirm gate's; kept as a plain function of the scope object rather than of
    the request, because this one is asked once per row of a listing.
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
    """Would `GET /api/facts/{id}` hand this entry to this caller?

    **The** predicate, and it has exactly two callers: `get_fact`, which is the
    route it describes, and `_neighbour_visibility`, which decides whether a
    neighbour's title may be named. One implementation rather than three
    parallel conditions, because the three it composes — reach, the record gate
    and the kind switch — are each free to change, and a mask that restated
    them would start disagreeing with the route the first time one did.

    `redact_fact` is called for its emptiness alone (`{}` is a kind whose
    switch is off, QF-26's *withheld whole*), and the body it builds is thrown
    away here. That is deliberate: asking "is this kind on?" by building the
    body this caller would receive is what stops the mask from growing its own
    reading of the policy table.

    `is_fact` is the fourth arm, and it belongs here and not only in
    `_reachable`: a document whose `kind` is outside the five is one the route
    answers 404 for, so this is not "the detail route's conjunction" without
    it. `load_all` hands back whatever is in the five kind files, so a
    hand-edited store really can put such a document in front of the mask.
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
      too (QF-37's one exception) — is named iff `_served` says its own detail
      route would serve it. That composes reach, `may_serve_fact` and the kind
      switch in one place;
    * a **process** is named iff `Disclosure.sees` says so, which is the
      service's existing rule for a referenced process id and the same one
      `visibility.links_only` runs over a `parent` or a `subprocess`. It is
      scope and not the record gate, which is `sees`' own documented decision
      and not a gap here.

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
            # `GET /api/processes/{pid}`'s own conjunction, both halves:
            # `sees` for the scope gate, `may_serve` for the record gate a
            # tombstone or a missing confirmation closes (D17, D22). `sees`
            # alone was the first version and it was wrong in exactly the way
            # this round's rule forbids — the process route 404'd an admin off
            # a tombstoned `dining-002` while this bundle handed them its
            # name, its tombstone state and its heir id.
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
            _served(shown, reach, e, stored.get(e.get("id"))) for e in found)

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

    **And a row whose title never composed is not masked either.** When no cell
    resolves to an item, `row_titles` falls back to the row's own key, so
    `titles[key] == key` says "nothing was composed here" — and marking such a
    row restricted would draw «خارج از دسترسی شما» over a label that is wholly
    this entry's own. The check reads the *output* rather than re-deriving which
    columns compose, which is the whole point: it closes the over-masking
    without restating the column rule this function deliberately does not know.
    A genuinely composed title cannot collide with it — composition joins
    Persian titles with « — » and a row key is an ASCII minted key.

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
            "confirmed": mark is not None and mark == now,
            "updated_at": row.get("updated_at"),
        })
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


@router.get("/{fid}")
def get_fact(fid: str, request: Request, user=Depends(panel_session)):
    """One entry, with every map a screen needs to render it without a raw key.

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
            "confirmed": mark is not None and mark == now,
            # What the tick may do, not what it would say: `confirm` at every
            # department the entry names (QF-27), and not a red entry — which
            # `POST /api/confirmations/{fid}` answers 409 for, because red wins
            # over green (QF-25). Both halves are the endpoint's own rules, read
            # here so the control is drawn in the state the endpoint will
            # honour.
            "can_confirm": (all(may_confirm(t) for t in targets)
                            and entry.get("status") not in ("disputed", "unknown")),
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
        "consumers": [c if visible(c.get("id"))
                      else {"id": c.get("id"), _RESTRICTED: True}
                      for c in facts_store.consumers(root, fid)],
        "processes": [p if visible(p.get("ref"))
                      else {"ref": p.get("ref"), _RESTRICTED: True}
                      for p in facts_store.process_links(root, entry)],
    }
