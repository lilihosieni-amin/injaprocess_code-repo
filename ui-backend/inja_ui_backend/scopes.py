"""The scope grammar (spec D10).

    *  ⊃  dept:{code}  ⊃  dept:{code}/report:{kind}

Three shapes, strictly nested. There is deliberately no process-level scope:
department and report cover the stated need, and process-level would multiply
the permission UI for a case that has not arisen.

The security boundary is `contains`: it is the sole answer to "may the holder of
this scope reach this target". The layer above turns a `False` into a 404 and a
refused capability into a 403, so a wrong `True` here silently opens a
department and a wrong `False` locks a head out of their own. Pure string logic —
no I/O, no database, no knowledge of users or roles.

The grammar is case-sensitive and whitespace-significant: `{code}` and `{kind}`
are `[a-z]+` and nothing is folded or stripped. Any normalisation belongs at the
write boundary, because a comparison that folds what validation did not accept
is a comparison that answers a question nobody asked.

`SCOPE_RE` is a `fullmatch` contract, and `\\Z` rather than `$` so that a caller
who reaches for `.match` still cannot slip a trailing newline past it.
"""
from __future__ import annotations

import re

SCOPE_RE = re.compile(r"^(?:\*|dept:[a-z]+(?:/report:[a-z]+)?)\Z")


def dept_of(scope: str) -> str | None:
    """The department a scope belongs to, or `None` if it names none.

    `None`, never `""`: a caller testing `dept_of(t) is not None` must not be
    handed a truthy-looking empty department by a malformed input like
    `"dept:"`. Unlike `contains`, this does not validate against `SCOPE_RE` —
    it is a projection, not the boundary, and it must not fold or strip, so
    that it and `contains` never disagree about which department a target is in.
    """
    if not scope.startswith("dept:"):
        return None
    return scope[len("dept:"):].split("/", 1)[0] or None


def contains(scope: str, target: str) -> bool:
    """Does `scope` cover `target`?

    Both arguments must be well-formed scopes; anything else answers `False`.
    Both arrive from a database row or a URL path — `user_scopes.scope` is
    `TEXT NOT NULL` with no CHECK constraint, so `''` is storable today — and
    this function is the boundary that has to survive a bad row. A malformed
    argument names no resource, so there is nothing to reach and nothing to
    refuse: `False` is both the honest answer and the fail-closed one. It also
    keeps a `*` holder on the same path as everyone else, so the layer above
    cannot leak who holds the wildcard through its choice of status code.

    Past the gate, both arguments are one of exactly three shapes, which is
    what makes the rest of this function short enough to check by eye.
    Containment is then segment-wise, never by string prefix: 'dept:dining'
    must not swallow 'dept:dining-annex'.
    """
    # The `target` half is load-bearing on its own. The `scope` half is not:
    # under this grammar an ill-formed scope can never cover a well-formed
    # target anyway (`True` needs scope == "*", scope == target, or scope a
    # `dept:{code}` prefix of it — all three force a legal scope), so no test
    # can kill it. Kept because "both arguments must be legal scopes" is the
    # rule a reader needs stated, and because it stops being redundant the
    # moment anything below this line changes.
    if not SCOPE_RE.fullmatch(scope) or not SCOPE_RE.fullmatch(target):
        return False
    if scope == "*":
        return True
    # Belt and braces: no test can kill this line, because "*" is one character
    # and the prefix below is at least eight, so the fall-through already
    # answers False for it. Kept because "only `*` reaches `*`" is the rule a
    # reader needs to see stated, not inferred from a length argument.
    if target == "*":
        return False
    if scope == target:
        return True
    # The only remaining case that can hold is a department scope covering one
    # of its own reports — including report kinds invented later, which is why
    # this is a shape test and not a list of known kinds.
    #
    # Weakening `"/report:"` to `"/"` here is the fourth unkillable mutant in
    # this function — the others being the gate's `scope` half, the `*`-target
    # arm, and `fullmatch` -> `search` in the gate. The reason is the same: the
    # gate has already reduced `target` to three shapes, so the two agree on
    # every input. Kept at the stricter form so this line is still correct on
    # its own if the gate above ever moves or the grammar grows a level.
    return target.startswith(scope + "/report:")
