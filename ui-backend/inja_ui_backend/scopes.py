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

`SCOPE_RE` is a `fullmatch` contract. Callers must use `.fullmatch`, never
`.match` or `.search`.
"""
from __future__ import annotations

import re

SCOPE_RE = re.compile(r"^(?:\*|dept:[a-z]+(?:/report:[a-z]+)?)$")


def dept_of(scope: str) -> str | None:
    if not scope.startswith("dept:"):
        return None
    return scope[len("dept:"):].split("/", 1)[0]


def contains(scope: str, target: str) -> bool:
    """Does `scope` cover `target`?

    Segment-wise, never by string prefix: 'dept:dining' must not swallow
    'dept:dining-annex'.
    """
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
    # of its own reports.
    return target.startswith(scope + "/report:")
