"""What may be *inside* a body this service sends (spec D17, D18, D55, D56).

**One filter, applied server-side to every response.** Reports, the flow canvas,
the detail drawer and the department overview all read through it: one
implementation means one place to be wrong and one place tests can pin. The
strip happens in the payload, never in CSS — a reader with dev tools finds
nothing hidden.

Pure. No database, no filesystem, no caller. It takes the policy as a dict, the
"may I be told about this id?" question as a predicate, and one boolean saying
whether this view is an editor's; `disclosure.py` is what turns a request into
those three, and `exports.py` is what turns a department into them. Nothing here
mutates its argument: the stored document is what the writers and the export
read, and this shapes a copy on the way out.

**Two stances, and they are separate questions.**

* `sees` is about **scope**: a `parent` or a node's `subprocess` may name a
  process, a node and a department the caller is 404'd out of, and that is true
  of an Editor of one department as much as of a Reader. So the link rule runs
  for **both** stances.
* `editor` is about **capability at this document's department** — never about
  the caller in general. `dept:a` plus `dept:b/report:k` may edit a and not b,
  and "may this person edit somewhere?" is right for nobody.

**Whole records are a third answer, and they are dropped.** A tombstoned
process (`disclosure.may_serve`) and a soft-deleted **node** are records
somebody deleted, not fields somebody may not read: they are absent, and
anything that references them — an edge naming a dropped node — is absent with
them, because a reference to nothing renders as a hole rather than as less.

**Blanked or dropped, and the rule for choosing.** A field the client
dereferences is blanked; a field nothing reads is dropped. `ui/src/flow/**` is
frozen and dereferences a node's `description`, `actor`, `icom` and
`source.created_by` with no guard, `flow/adapt.ts` iterates `pending`, and
`screens/Summary.tsx` indexes `idef0.controls` and maps `kpis` — dropping any of
those turns a reader's click into a TypeError inside a document that has already
been handed out. The process's own `source`/`created_at`/`updated_at` are read by
nothing under `ui/src/`, and `source.type` is an enum with no honest blank, so
they go.

**Two whitelists, and neither is a blacklist.** `PUBLIC_PROCESS_KEYS` names the
top level, `PUBLIC_NODE_KEYS` names the node, and a key in neither is not in the
body. A blacklist would have been the shorter code and the wrong shape: the node
is where the per-step content lives, a stored document is never revalidated on
read, and Task 10 serves the same shape from an unauthenticated link — so a
field that appears in a file before anyone here has heard of it must arrive
dropped rather than published.

**A node has no KPIs.** `$defs.activityNode` carries `id`, `type`, `label`,
`description`, `actor`, `icom`, `subprocess`, `position`, `layout`, `source` and
`removed` — nothing else. What a node carries is ICOM, which is IDEF0
information and not a performance indicator, so `node_icom` and `process_kpis`
are separate switches.
"""
from __future__ import annotations

from typing import Callable

#: The exact top-level key set a non-editor's copy of a process carries.
#:
#: A **whitelist**, not a blacklist, and pinned by an equality in the tests: a
#: top-level field added to `process.schema.json` next month must have to be let
#: in deliberately rather than start shipping to every reader the day it is
#: written. `process.schema.json` defines five top-level properties this tuple
#: does not name — `created_at`, `source`, `superseded_by`, `tombstoned` and
#: `updated_at` — so all five are dropped. `tombstoned` and `superseded_by` are
#: also the belt to Task 7's braces, which withholds a tombstoned process from a
#: non-editor's query altogether.
PUBLIC_PROCESS_KEYS: tuple[str, ...] = (
    "id", "department", "name", "parent", "edges",
    "summary", "idef0", "kpis", "nodes", "pending",
)

#: The exact key set a non-editor's copy of a **node** carries.
#:
#: A whitelist for the same reason and a stronger one: the node is where the
#: per-step content lives, so this is the tuple that decides what a reader is
#: physically sent about each step of a process.
#:
#: Every property the schema's three node kinds define is named here —
#: `activityNode`'s eleven, plus `junctionNode`'s `junctionType` and
#: `direction` — and a test reads `process.schema.json` and fails when a kind
#: gains one this tuple does not. **Nothing is dropped**, because
#: `ui/src/flow/**` is frozen and no guard can be added there: `adapt.ts`
#: dereferences `id`, `type` and `position` and filters on `removed` — the node
#: it would filter is now dropped from a non-editor's body before it is built
#: (`_public_process`), so what the key does here is keep `removed: false` on the
#: nodes that survive, which the same frozen filter reads. `DetailDrawer.tsx` reads
#: `subprocess`, `junctionType` and `source.created_by` with no guard, the node
#: components render `label` and `actor`, and `useFlowEditor.ts` writes `layout`
#: and `direction` back on Save. What a reader may not have is *blanked*, by
#: `_NODE_SWITCH` and `_empty_node_source`.
PUBLIC_NODE_KEYS: tuple[str, ...] = (
    "id", "type", "label", "description", "actor", "icom", "subprocess",
    "position", "layout", "source", "removed", "junctionType", "direction",
)

#: Which switch governs which process key, and the blank it becomes when off.
_PROCESS_SWITCH: dict[str, tuple[str, Callable[[], object]]] = {}

#: The same for a node's three.
_NODE_SWITCH: dict[str, tuple[str, Callable[[], object]]] = {}


def _empty_icom() -> dict:
    """A fresh, structurally valid but empty ICOM record."""
    return {"inputs": [], "controls": [], "outputs": [], "mechanisms": []}


def _empty_node_source() -> dict:
    """A fresh, structurally valid but empty node provenance record."""
    return {"created_by": "", "touched_by": []}


_PROCESS_SWITCH.update({
    "summary": ("process_summary", str),
    "idef0": ("process_idef0", _empty_icom),
    "kpis": ("process_kpis", list),
})

_NODE_SWITCH.update({
    "description": ("node_description", str),
    "actor": ("node_actor", str),
    "icom": ("node_icom", _empty_icom),
})


def links_only(doc: dict, sees: Callable[[object], bool]) -> dict:
    """`doc` with every link this view may not be told about blanked.

    `parent` names another process **and one of its nodes**, so the whole record
    goes rather than only its `process`: the `node` half is a node id in that
    same department and is exactly as much of a disclosure. `None` is what the
    schema says an unparented process carries, so what the caller receives is a
    shape the client already handles rather than a hole in one.

    The department of a referenced id is read **lexically**, by the caller's
    `sees` predicate, and never by loading the referenced file: read it out of
    the stored document and the answer depends on whether that document is there,
    so a caller learns which of their guesses exist from which links survive.
    """
    out = dict(doc)
    parent = out.get("parent")
    if isinstance(parent, dict) and not sees(parent.get("process")):
        out["parent"] = None
    nodes = out.get("nodes")
    if isinstance(nodes, list):
        out["nodes"] = [
            {**n, "subprocess": None}
            if isinstance(n, dict) and n.get("subprocess") is not None
            and not sees(n.get("subprocess"))
            else n
            for n in nodes
        ]
    return out


def _public_node(node: dict, policy: dict[str, bool]) -> dict:
    """One node reduced to what a non-editor may read.

    A whitelist copy first and the blanks second, so the two questions stay
    separate: `PUBLIC_NODE_KEYS` decides which keys exist at all, and the policy
    decides which of them carry their value. `dict(node)` here instead would make
    this a blacklist — every key nobody named would ship — and the node is the
    part of the document a reader is *least* meant to have in full.

    `if key in out` and not an unconditional write: a junction or a terminal node
    carries none of these three, `process.schema.json` sets
    `additionalProperties: false`, and inventing an empty `actor` on a junction
    would produce a document the validator refuses.
    """
    out = {k: node[k] for k in PUBLIC_NODE_KEYS if k in node}
    for key, (switch, blank) in _NODE_SWITCH.items():
        if key in out and not policy[switch]:
            out[key] = blank()
    if "source" in out:
        out["source"] = _empty_node_source()
    return out


def _soft_deleted(nodes: object) -> set[str]:
    """The ids of the nodes a non-editor is not sent at all.

    Deleting a step in the editing app is a **soft** delete: the node stays in
    the file carrying `removed: true` so a later `merge` can tell «never
    existed» from «taken out» (`ui/src/lib/counts.ts`). It is a whole record
    somebody deleted, and D56's Whole-records row is *"absent from the response
    body, filtered in the query. Never client-side"* — while `ui/src/flow/
    adapt.ts` filtered on `removed` **in the browser**, so the deleted step's
    label, description and actor were on the wire and merely not drawn.

    `n.get("removed")` and never `"removed" in n`: every node the editing app
    has ever written carries the key, and `false` is the answer for almost all
    of them.
    """
    if not isinstance(nodes, list):
        return set()
    return {n["id"] for n in nodes
            if isinstance(n, dict) and n.get("removed")
            and isinstance(n.get("id"), str)}


def _public_process(doc: dict, policy: dict[str, bool]) -> dict:
    """One process reduced to what a non-editor may read."""
    out = {k: doc[k] for k in PUBLIC_PROCESS_KEYS if k in doc}
    for key, (switch, blank) in _PROCESS_SWITCH.items():
        if key in out and not policy[switch]:
            out[key] = blank()
    # A soft-deleted node is dropped, and **so are the edges naming it**. Those
    # are one change, not two: `ui/src/flow/adapt.ts` maps every edge to a
    # `source`/`target` pair with no guard and @xyflow resolves nothing for an
    # endpoint that is not on the canvas, so dropping the node alone would trade
    # a disclosure for a diagram with a hole in it — the failure the whole
    # blank-versus-drop rule exists to avoid, asked of a record instead of a
    # field. `removed` stays in `PUBLIC_NODE_KEYS` for the nodes that survive:
    # they carry `removed: false`, the frozen client reads it, and a key that
    # only ever arrives falsy is still a key it dereferences.
    gone = _soft_deleted(out.get("nodes"))
    if gone:
        out["nodes"] = [n for n in out["nodes"]
                        if not (isinstance(n, dict) and n.get("id") in gone)]
        if isinstance(out.get("edges"), list):
            out["edges"] = [e for e in out["edges"]
                            if not (isinstance(e, dict)
                                    and (e.get("from") in gone
                                         or e.get("to") in gone))]
    # Read off `out` rather than `doc` so this function has one source, its own
    # whitelisted copy: a key `PUBLIC_PROCESS_KEYS` drops cannot return through
    # this line. It is *not* what keeps a withheld `subprocess` out of the body
    # — `links_only` is, it runs first for both stances, and `filtered` hands
    # this function the copy it produced, so `doc["nodes"]` here would be the
    # same nodes and the same bytes.
    #
    # Written unconditionally: `ui/src/flow/adapt.ts` calls `proc.nodes.filter`
    # with no guard, so a half-built document that has no `nodes` must still go
    # out carrying an empty one.
    out["nodes"] = [_public_node(n, policy) if isinstance(n, dict) else n
                    for n in out.get("nodes", [])]
    # Emptied, not dropped: `ui/src/flow/adapt.ts` iterates `pending` to count
    # each node's conflicts with no guard, so the key has to be there; the
    # *contents* must not travel. D17 puts it in the never-shown block with no
    # switch, and D56 puts even its count in the derived-signals row.
    out["pending"] = []
    return out


def filtered(doc: dict, *, policy: dict[str, bool],
             sees: Callable[[object], bool], editor: bool) -> dict:
    """**The** filter. Every body carrying a process document comes through here.

    The link rule runs for both stances; the field rule runs for non-editors
    only, because D17's column is headed "Non-editor default" and an Editor is
    the person the hidden content is *for*.
    """
    out = links_only(doc, sees)
    return out if editor else _public_process(out, policy)


def public_overview(doc: dict, *, editor: bool) -> dict:
    """The department information page — shown **in full** (D55).

    No per-field switches, no policy table, and none planned. The overview is
    *about* a department rather than being the mechanics of a process, and every
    part of it — what the department does, its sub-units, who works there, what
    each role is measured on, and when it was last updated — is what a staff
    member should be able to read. Two gates still apply and neither is field
    visibility: scope, and confirmation (both `disclosure.py`'s).

    `updated_at` stays, unlike the process's own `created_at`/`updated_at`,
    which `_public_process` drops because nothing under `ui/src/` reads them.
    This one is read: `ui/src/screens/Overview.tsx` dereferences
    `data.updated_at` with no guard, and `Overview` in `ui/src/api/types.ts`
    declares it required — drop it here and a non-editor's page renders
    "NaN/NaN/NaN" instead of a date. A last-updated timestamp is not content:
    it says nothing about what the department does, so it is not the kind of
    thing this filter withholds.

    `overview.schema.json` sets `additionalProperties: false` and names exactly
    six properties, every one required and every one dereferenced by
    `ui/src/screens/Overview.tsx` — so there is nothing left for this function
    to drop, and a non-editor's copy is the document.

    If a reason to hide part of the overview ever appears — personnel KPIs being
    the likely candidate — it becomes a new row in `store.policy.FIELDS`, not a
    second mechanism here.
    """
    if editor:
        return doc
    return dict(doc)
