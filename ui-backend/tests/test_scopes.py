import pytest
from inja_ui_backend.scopes import SCOPE_RE, contains, dept_of


@pytest.mark.parametrize("scope,target", [
    ("*", "*"),
    ("*", "dept:dining"),
    ("*", "dept:dining/report:steps"),
    ("dept:dining", "dept:dining"),
    ("dept:dining", "dept:dining/report:steps"),
    ("dept:dining/report:steps", "dept:dining/report:steps"),
])
def test_containment_holds(scope, target):
    assert contains(scope, target)


@pytest.mark.parametrize("scope,target", [
    ("dept:dining", "*"),
    ("dept:dining", "dept:cashier"),
    ("dept:dining", "dept:cashier/report:steps"),
    # A report scope covers neither its department nor a sibling report — this
    # is the asymmetry the whole grammar exists for.
    ("dept:dining/report:steps", "dept:dining"),
    ("dept:dining/report:steps", "dept:dining/report:flowchart"),
    ("dept:dining/report:steps", "*"),
])
def test_containment_does_not_hold(scope, target):
    assert not contains(scope, target)


def test_a_department_prefix_is_not_a_match():
    # 'dining' must not swallow 'dining-annex'.
    assert not contains("dept:dining", "dept:dining-annex")


def test_dept_of():
    assert dept_of("dept:dining") == "dining"
    assert dept_of("dept:dining/report:steps") == "dining"
    assert dept_of("*") is None


def test_scope_regex_rejects_malformed_scopes():
    for good in ["*", "dept:dining", "dept:dining/report:steps"]:
        assert SCOPE_RE.fullmatch(good)
    for bad in ["dept:", "dept:Dining", "report:steps", "dept:dining/report:",
                "dept:dining/", "dept:dining/report:steps/extra"]:
        assert not SCOPE_RE.fullmatch(bad)


# The table above proves less than it looks. Replacing the last line of
# `contains` with a naive `target.startswith(scope)` leaves all twelve
# parametrised rows green — only `test_a_department_prefix_is_not_a_match` dies.
# Everything below exists so that a prefix bug, a folded case, a stripped space
# or a deleted regex anchor fails in several places at once.


@pytest.mark.parametrize("scope,target", [
    # A longer department that merely starts with a granted one.
    ("dept:dining", "dept:dining2"),
    ("dept:dining", "dept:diningannex"),
    ("dept:dining", "dept:dining2/report:steps"),
    # A shorter department that is a prefix of the target's.
    ("dept:din", "dept:dining"),
    ("dept:din", "dept:dining/report:steps"),
    # The same confusion one level down, in the report kind.
    ("dept:dining/report:step", "dept:dining/report:steps"),
    ("dept:dining/report:steps", "dept:dining/report:steps2"),
    ("dept:dining/report:steps", "dept:dining/report:stepsandmore"),
])
def test_a_shared_prefix_grants_nothing(scope, target):
    assert not contains(scope, target)


@pytest.mark.parametrize("scope,target", [
    # A report scope reaches nothing in a department other than its own...
    ("dept:dining/report:steps", "dept:cashier"),
    ("dept:dining/report:steps", "dept:cashier/report:steps"),
    # ...and a department scope reaches no report of another department.
    ("dept:cashier", "dept:dining/report:steps"),
])
def test_no_scope_crosses_into_another_department(scope, target):
    assert not contains(scope, target)


def test_a_department_scope_includes_reports_added_later():
    # Spec D10: a grant on the department is a grant on the department, so a
    # report kind invented next year is covered without regranting.
    assert contains("dept:dining", "dept:dining/report:inventedlater")


def test_a_department_scope_reaches_its_reports_and_nothing_else_below():
    # The step down from a department is `/report:` exactly — not "anything
    # after a slash". The grammar has three levels and no fourth (D10), so a
    # target of an unrecognised shape is refused rather than granted by
    # proximity to one the holder does own.
    #
    # Read what this now binds, not what it once did: since the gate, every
    # target below is a NON-scope and is refused there, before the tail arm is
    # reached. So this pins the gate, and the tail's `+ "/report:"` is left
    # unbindable — weakening it to `+ "/"` is an equivalent mutant precisely
    # because the gate has already reduced `target` to three legal shapes. The
    # stricter form is kept so the line stays correct on its own if the gate
    # ever moves; no test can hold it there.
    assert not contains("dept:dining", "dept:dining/")
    assert not contains("dept:dining", "dept:dining/process:7")
    assert not contains("dept:dining", "dept:dining/reports:steps")
    # `/anything` proves the least of any suffix here: it is the one shape the
    # tail arm's `+ "/report:"` already refuses, so it stayed green while the
    # `/report:`-shaped fourth level below was being granted. The rows in
    # test_no_scope_widens_to_a_fourth_level are the ones that bind this.
    assert not contains("dept:dining/report:steps", "dept:dining/report:steps/anything")


def test_a_report_scope_never_widens():
    # Spec D10, the other half: a new report kind stays invisible to a report
    # scope until it is granted explicitly.
    assert not contains("dept:dining/report:steps", "dept:dining/report:inventedlater")


@pytest.mark.parametrize("scope,target", [
    # The grammar is case-sensitive: nothing is folded, in either argument.
    ("DEPT:dining", "dept:dining"),
    ("dept:dining", "DEPT:dining"),
    ("dept:DINING", "dept:dining"),
    ("dept:dining", "dept:DINING"),
    ("dept:dining/REPORT:steps", "dept:dining/report:steps"),
    # ...and whitespace-significant: nothing is stripped, in either argument.
    ("dept:dining ", "dept:dining"),
    ("dept:dining", "dept:dining "),
    (" dept:dining", "dept:dining"),
    ("dept:dining", " dept:dining/report:steps"),
    # A padded wildcard is not the wildcard.
    (" *", "dept:dining"),
    ("* ", "dept:dining"),
])
def test_containment_folds_and_strips_nothing(scope, target):
    assert not contains(scope, target)


@pytest.mark.parametrize("scope,target", [
    # Both arguments reach this function from a database row or a URL path, so
    # nonsense must answer False rather than raise: a crash is a denial of
    # service, a False fails closed.
    ("", "dept:dining"),
    ("", "*"),
    ("dept:dining", ""),
    ("nonsense", "dept:dining"),
    ("dept:dining", "nonsense"),
    ("dept:dining/report:steps", ""),
    ("/report:steps", "dept:dining/report:steps"),
])
def test_malformed_input_answers_false(scope, target):
    assert not contains(scope, target)


@pytest.mark.parametrize("scope,target", [
    # The grammar is three levels and has no fourth (D10). The tail arm grants
    # a target that starts with `scope + "/report:"`, so the suffix that can
    # actually reach it is a `/report:`-shaped one — these rows, not the
    # `/anything` row above, are what forbid a report scope widening.
    ("dept:dining/report:steps", "dept:dining/report:steps/report:flowchart"),
    ("dept:dining/report:steps", "dept:dining/report:steps/report:steps"),
    # ...and the same shape one level up: a department scope reaches its own
    # reports, but nothing hanging off one of them.
    ("dept:dining", "dept:dining/report:steps/report:flowchart"),
    ("dept:dining", "dept:dining/report:steps/extra"),
    # A fourth-level string is not a scope, so held as one it covers nothing —
    # not even itself. `user_scopes.scope` has no CHECK constraint, so such a
    # row is storable today, and the identity arm granted this one before the
    # gate.
    ("dept:dining/report:steps/report:flowchart",
     "dept:dining/report:steps/report:flowchart"),
    # These two answered False already, via the tail arm; they are here to
    # document that a fourth-level scope confers nothing upward either, and
    # they do NOT bind the finding-1 regression — the rows above do.
    ("dept:dining/report:steps/report:flowchart", "dept:dining/report:steps"),
    ("dept:dining/report:steps/report:flowchart", "dept:dining"),
])
def test_no_scope_widens_to_a_fourth_level(scope, target):
    assert not contains(scope, target)


@pytest.mark.parametrize("scope,target", [
    # Every row here answered True before the SCOPE_RE gate: the first three
    # through the tail arm (target starts with scope + "/report:" when scope is
    # a truncated nonsense string), the rest through the identity arm, which
    # grants any string that equals itself however malformed.
    ("", "/report:steps"),
    ("dept:", "dept:/report:steps"),
    ("dept:dining/report:", "dept:dining/report:/report:steps"),
    ("", ""),
    (" ", " "),
    ("\n", "\n"),
    ("nonsense", "nonsense"),
    ("dept:", "dept:"),
    ("/report:steps", "/report:steps"),
    ("*/report:steps", "*/report:steps"),
    ("**", "**"),
    ("dept:dining/", "dept:dining/"),
    # Identity does not rescue a case fold or a stray space either.
    ("dept:Dining", "dept:Dining"),
    ("DEPT:dining", "DEPT:dining"),
    ("dept:dining ", "dept:dining "),
    (" dept:dining", " dept:dining"),
])
def test_a_malformed_argument_is_never_granted(scope, target):
    # A `False` fails closed; a `True` here opens a department off a bad row.
    assert not contains(scope, target)


@pytest.mark.parametrize("target", [
    "", " ", "\n", "nonsense", "dept:", "dept:/report:steps", "/report:steps",
    "dept:Dining", "dept:dining ", "dept:dining-annex", "dept:dining/",
    "dept:dining/report:steps/report:flowchart", "**", "*/report:steps",
])
def test_the_wildcard_reaches_everything_that_is_a_scope_and_nothing_else(target):
    # The decision: a `*` holder is refused a malformed target like everyone
    # else. There is no resource behind a string that is not a scope, so there
    # is nothing for the wildcard to reach; and once the layer above maps
    # `False` to 404, a uniform answer stops the status code distinguishing the
    # wildcard holder from anyone else.
    assert not contains("*", target)


@pytest.mark.parametrize("target", ["*", "dept:dining", "dept:dining/report:steps",
                                    "dept:cashier/report:inventedlater"])
def test_the_wildcard_still_reaches_every_well_formed_target(target):
    assert contains("*", target)


def test_the_gate_refuses_nothing_that_is_legal():
    # The guard must not have bought fail-closed behaviour by narrowing a real
    # grant. Every legal containment still holds, including the one that
    # matters most: reports invented later stay covered by a department grant,
    # because the gate tests the *shape* of a report kind, not a list of kinds.
    assert contains("dept:dining", "dept:dining/report:inventedlater")
    assert contains("dept:dining", "dept:dining/report:z")
    assert contains("dept:dining", "dept:dining")
    assert contains("dept:dining/report:steps", "dept:dining/report:steps")
    assert contains("*", "*")


def test_dept_of_on_malformed_input():
    for nonsense in ["", " ", "nonsense", "report:steps", "*", "**",
                     "department:dining",
                     # The prefix is 'dept:' including the colon. These start
                     # with the four letters and are still not departments.
                     "dept", "deptx", "depts:dining",
                     # ...and it is case-sensitive.
                     "DEPT:dining", "Dept:dining"]:
        assert dept_of(nonsense) is None, nonsense


def test_dept_of_returns_none_not_empty_string_for_an_empty_code():
    # `is None`, not just falsy. The annotation is `str | None`, and a caller
    # written as `if dept_of(t) is not None:` must not be handed `""` — an
    # empty department is not a department, and `"dept:"` is a string SCOPE_RE
    # rejects but the database will store.
    assert dept_of("dept:") is None
    assert dept_of("dept:/report:steps") is None
    assert dept_of("dept:/") is None


def test_dept_of_strips_nothing():
    # The twin of test_containment_folds_and_strips_nothing: if `dept_of` were
    # to strip and `contains` were not, the two would disagree about which
    # department a target belongs to.
    assert dept_of("dept:dining ") == "dining "
    assert dept_of("dept:dining /report:steps") == "dining "


def test_scope_regex_is_anchored_at_both_ends():
    # Every assertion in test_scope_regex_rejects_malformed_scopes uses
    # `fullmatch`, which is anchored by itself — under it both `^` and `\Z` can
    # be deleted from SCOPE_RE with the suite still green. These use `search`
    # and `match` so that each anchor has an assertion that dies without it.
    assert SCOPE_RE.search("xdept:dining") is None       # dies without `^`
    assert SCOPE_RE.search("dept:x*") is None            # dies without `^`
    assert SCOPE_RE.match("dept:diningX") is None        # dies without `\Z`
    assert SCOPE_RE.match("dept:dining/extra") is None   # dies without `\Z`
    # The end anchor is `\Z`, not `$`: `$` also matches immediately before a
    # trailing newline, so under `$` these two would match and a caller using
    # `.match` would accept a scope with a newline glued to it.
    assert SCOPE_RE.match("dept:dining\n") is None       # dies under `$`
    assert SCOPE_RE.match("*\n") is None                 # dies under `$`


def test_scope_regex_accepts_only_the_three_shapes():
    for good in ["*", "dept:a", "dept:dining", "dept:dining/report:steps",
                 "dept:dining/report:flowchart"]:
        assert SCOPE_RE.fullmatch(good), good
    for bad in [
        "", " ", "x", ".", "**", "*x", "x*", " *", "* ",
        # SCOPE_RE is a `fullmatch` contract; a trailing newline is not a scope.
        "dept:dining\n", "dept:dining ", " dept:dining",
        # Department codes and report kinds are `[a-z]+` — the same shape the
        # frozen process schemas give a department (`^[a-z]+$`).
        "dept:dining2", "dept:dining-annex", "dept:dining_annex",
        "dept:DINING", "DEPT:dining", "dept:dining/report:Steps",
        "dept:dining/report:steps2", "dept:dining/report:steps-extra",
        # No fourth level, and no empty segments.
        "dept:dining/report:steps/report:flowchart",
        "dept:dining//report:steps", "dept:dining/report:steps/",
        "dept:/report:steps", "*/report:steps",
    ]:
        assert not SCOPE_RE.fullmatch(bad), bad
