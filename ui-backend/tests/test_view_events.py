"""View events are written by the server, once per session per target per 30
minutes (D42, addendum D77). The `people` cast confirms cooking-001 and the
cooking overview, so a Reader is served both."""
import time

from inja_ui_backend import auth
from inja_ui_backend.tests_helpers import audit_events


def test_opening_a_process_twice_is_one_view(people):
    for _ in range(2):
        assert people["viewer"].get("/api/processes/cooking-001").status_code == 200
    rows = audit_events(people["viewer"], "process.viewed")
    assert [(r["actor"], r["target"]) for r in rows] == [("09150000004", "cooking-001")]


def test_the_department_page_is_one_view_across_its_requests(people):
    people["viewer"].get("/api/departments/cooking/overview")
    people["viewer"].get("/api/departments/cooking/processes")
    assert len(audit_events(people["viewer"], "department.viewed")) == 1


def test_a_second_person_counts_separately(people):
    people["viewer"].get("/api/processes/cooking-001")
    people["other"].get("/api/processes/cooking-001")
    assert len(audit_events(people["viewer"], "process.viewed")) == 2


def test_the_window_reopens_after_thirty_minutes(people, monkeypatch):
    people["viewer"].get("/api/processes/cooking-001")
    later = time.time() + auth.VIEW_WINDOW_S + 1
    monkeypatch.setattr(auth.time, "time", lambda: later)
    people["viewer"].get("/api/processes/cooking-001")
    assert len(audit_events(people["viewer"], "process.viewed")) == 2


def test_a_404_writes_nothing(people):
    assert people["viewer"].get("/api/processes/cashier-001").status_code == 404
    assert audit_events(people["viewer"], "process.viewed") == []
