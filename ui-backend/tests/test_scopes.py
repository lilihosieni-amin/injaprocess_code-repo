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
    assert not contains("dept:dining", "dept:dining/")
    assert not contains("dept:dining", "dept:dining/process:7")
    assert not contains("dept:dining", "dept:dining/reports:steps")
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


def test_dept_of_on_malformed_input():
    for nonsense in ["", " ", "nonsense", "report:steps", "*", "**",
                     "department:dining",
                     # The prefix is 'dept:' including the colon. These start
                     # with the four letters and are still not departments.
                     "dept", "deptx", "depts:dining",
                     # ...and it is case-sensitive.
                     "DEPT:dining", "Dept:dining"]:
        assert dept_of(nonsense) is None, nonsense


def test_dept_of_strips_nothing():
    # The twin of test_containment_folds_and_strips_nothing: if `dept_of` were
    # to strip and `contains` were not, the two would disagree about which
    # department a target belongs to.
    assert dept_of("dept:dining ") == "dining "
    assert dept_of("dept:dining /report:steps") == "dining "


def test_scope_regex_is_anchored_at_both_ends():
    # Every assertion in test_scope_regex_rejects_malformed_scopes uses
    # `fullmatch`, which is anchored by itself — under it both `^` and `$` can
    # be deleted from SCOPE_RE with the suite still green. These use `search`
    # and `match` so that each anchor has an assertion that dies without it.
    assert SCOPE_RE.search("xdept:dining") is None       # dies without `^`
    assert SCOPE_RE.search("dept:x*") is None            # dies without `^`
    assert SCOPE_RE.match("dept:diningX") is None        # dies without `$`
    assert SCOPE_RE.match("dept:dining/extra") is None   # dies without `$`


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
