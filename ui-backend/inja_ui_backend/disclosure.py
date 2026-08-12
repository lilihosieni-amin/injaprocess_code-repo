"""What may be *inside* a document the caller is allowed to have (D17, D56).

`access.requires` decides **whether** a process document is served. Nothing
between that gate and `return doc` decided **what was in it**, and two things in
a process are addressed to somebody else:

* **Cross-department links.** `parent` names another process and one of its
  nodes; a node's `subprocess` names another process. Both may live in a
  department the caller is 404'd out of — `routers/processes.delete_process`
  sweeps all nine departments precisely because they can. A `dept:dining` reader
  served `dining-001` unmodified therefore learns a process id, a node id and a
  department code from outside their scope, out of a 200 the gate was right to
  allow.
* **`pending`.** Unresolved proposals are D17 never-shown bookkeeping with no
  switch, and D56 puts even their *count* in the derived-signals row. The board
  withholds the count and `/api/pending` withholds the rows from anyone who
  cannot `edit` that department — while the two document endpoints handed the
  same caller the proposals themselves, `field`, `current`, `proposed` and
  `source` included.

Two rules, one module, because they are the same rule at the same boundaries:
*a body carries only what its reader may be told.* Applied by every route that
returns a process document, so "we fixed the two we found" cannot be the shape
of it.

**Three rules now.** The third is D17's field policy, and it is not written here
either: `visibility.py` holds the shape and this module holds the *caller* —
which department they may edit, and which ids they may be told about. Everything
that decides what a body contains lives in exactly one function, and this is the
only module that resolves a request into its arguments.

**Every department here is derived lexically from an id** —
`storage.dept_of(pid)` is `pid.rsplit("-", 1)[0]`, pure string arithmetic — and
never by loading the referenced file. That is the same rule the routers' targets
follow (`routers/processes._pid_target`) and it is load-bearing for the same
reason: read the department out of the referenced document and the answer
depends on whether that document is there, so a caller learns which of their
guesses exist from which links survive. A reference to nothing at all is refused
exactly like a reference to a department the caller cannot see.

Nothing here mutates its argument. The stored document is what the writers and
the export read; this shapes a *copy* on the way out, and disk is never touched.

The redaction and the restore below are two halves of one decision and must stay
in one file: `redact` is what makes a hidden link invisible, and `restore` is
what stops the editor's next Save from erasing on disk the link they were never
shown. Split them and the second is a mystery.
"""
from __future__ import annotations

import sqlite3

from . import storage, visibility
from .access import permits
from .store import policy


class Disclosure:
    """One caller's answer to "may I be told this?", resolved once per request.

    `permits` rather than `allows` for the same reason the department board uses
    it: a listing runs this question over every process and every node, and
    neither the role's capabilities nor the user's scopes can change inside one
    request. Two lookups here, none in the loop.

    Both questions are asked **per department and never per caller** — `sees` of
    the referenced id, `edits` of the document's own — which is the distinction a
    holder of `dept:a` plus `dept:b/report:k` makes visible and a "may this
    person edit anywhere?" check gets wrong in the direction that leaks.
    """

    def __init__(self, conn: sqlite3.Connection, user: sqlite3.Row) -> None:
        self._may_view = permits(conn, user, "view")
        self._may_edit = permits(conn, user, "edit")
        # One read of the policy per request, for the same reason `permits`
        # hoists its two lookups: a listing runs the filter over every process
        # in a department, and the policy cannot change inside one request.
        self._policy = policy.current(conn)

    def sees(self, ref: object) -> bool:
        """May this caller be told that a process named `ref` exists?

        `ref` is an id out of a link, so it is whatever the document holds:
        `None` for an absent link, and — since nothing revalidates a stored
        document on read — possibly a number or a malformed string. Anything
        that is not a string names no department and reaches nothing, and
        `dept_of` of a string with no `-` is the string itself, which the scope
        grammar refuses. Both are `False`: fail closed, and one answer for
        "outside your scope" and "not a reference at all".
        """
        return isinstance(ref, str) and self._may_view(f"dept:{storage.dept_of(ref)}")

    def edits(self, dept: str) -> bool:
        """May this caller edit `dept`? The question `pending` and tombstones
        both turn on."""
        return self._may_edit(f"dept:{dept}")

    def redact(self, doc: dict, dept: str) -> dict:
        """`doc` as this caller may receive it. `dept` is the document's own.

        `dept` is passed in rather than read from `doc["id"]` or
        `doc["department"]`, and that is deliberate: the routers derive it from
        the request path, so it is the very string the gate ran on. A
        hand-edited file whose `id` disagrees with its location would otherwise
        be redacted against a department nobody was gated on.

        The shaping itself is `visibility.filtered` and nothing here — D18 wants
        one filter over every response, and a second copy of the rule in this
        module is how the API and the published bundle would come to disagree
        about what a reader may have.
        """
        return visibility.filtered(doc, policy=self._policy, sees=self.sees,
                                   editor=self.edits(dept))

    def redact_overview(self, doc: dict, dept: str) -> dict:
        """The department information page as this caller may receive it (D55).

        Shown in full. It carries no ids, so there is no link rule to run and
        `sees` never enters — which is exactly why it is a separate two-line
        method rather than a flag on `redact`: a shared entry point would have
        to decide, per call, which of the two shapes it was looking at, from a
        dict that says nothing about which it is.

        `visibility.public_overview` drops nothing today, `updated_at`
        included — the project owner's ruling, and `visibility.py` carries the
        reasoning. That is not a reason to return the document raw: the stance
        is passed anyway, so the day a row of D55 does become switchable this
        boundary is already reading the one filter rather than being the one
        that has to be remembered.
        """
        return visibility.public_overview(doc, editor=self.edits(dept))

    def restore(self, incoming: dict, on_disk: dict | None) -> dict:
        """Put back every link this caller was never shown.

        `redact` blanks a `parent` or a `subprocess` that names a department the
        caller may not view — so an Editor of `dining` who cannot see `cooking`
        loads `dining-001` with its cooking parent already gone, and their next
        Save round-trips that absence straight onto disk. The link would be
        erased by someone who never knew it was there, and the neighbouring
        department the scope exists to protect would be the one to lose it.

        So: **a link that is withheld is a link that cannot be edited.** The
        on-disk value wins for exactly the references `redact` would have
        hidden, and for nothing else — every link the caller *can* see stays
        theirs to change, which is what stops this from being a blanket refusal
        to edit links at all.

        Read-only for the caller and invisible to them: the response is redacted
        afterwards, so the restored link never appears in it.
        """
        if not isinstance(on_disk, dict):
            return incoming
        out = dict(incoming)
        parent = on_disk.get("parent")
        if isinstance(parent, dict) and not self.sees(parent.get("process")):
            out["parent"] = parent
        stored = {n["id"]: n for n in on_disk.get("nodes", [])
                  if isinstance(n, dict) and isinstance(n.get("id"), str)}
        nodes = out.get("nodes")
        if isinstance(nodes, list):
            restored = []
            for node in nodes:
                was = stored.get(node.get("id")) if isinstance(node, dict) else None
                ref = was.get("subprocess") if isinstance(was, dict) else None
                if ref is not None and not self.sees(ref):
                    node = {**node, "subprocess": ref}
                restored.append(node)
            out["nodes"] = restored
        return out
