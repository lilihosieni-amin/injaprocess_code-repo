"""The record's own guarantees (spec §11 tests 16, 16c, 18, 19; addendum D76)."""
import ast
import dataclasses
import pathlib

from fastapi.routing import APIRoute
from inja_ui_backend.app import create_app
from inja_ui_backend.store.activity import CATALOGUE
from inja_ui_backend.tests_helpers import _PW, _USERNAME, cfg_for, seed_editor

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "ui-backend" / "inja_ui_backend"
TESTS = ROOT / "ui-backend" / "tests"

#: §11 test 16: every state-changing route, and what it writes. A new write
#: route fails `test_every_write_route_is_accounted_for` until it is listed here.
WRITES = {
    ("POST", "/api/auth/login"): {"login.success", "login.failure", "login.throttled"},
    ("POST", "/api/auth/logout"): {"logout"},
    ("POST", "/api/auth/password"): {"password.changed", "session.revoked"},
    ("POST", "/api/processes"): {"process.edited"},
    ("PUT", "/api/processes/{pid}"): {"process.edited"},
    ("DELETE", "/api/processes/{pid}"): {"process.edited"},
    ("POST", "/api/processes/{pid}/pending/{index}"): {"process.edited"},
    ("POST", "/api/processes/{pid}/relayout"): set(),          # writes nothing to disk
    ("PUT", "/api/departments/{code}/overview"): {"department.edited"},
    ("PUT", "/api/departments/{code}/order"): {"department.edited"},
    ("POST", "/api/departments/{code}/reports/{kind}"): set(),  # a build; the download records
    ("POST", "/api/facts/{fid}/resolve"): {"fact.edited"},
    ("POST", "/api/confirmations/{target}"): {"confirmation.set"},
    ("DELETE", "/api/confirmations/{target}"): {"confirmation.revoked"},
    ("PUT", "/api/visibility/{field}"): {"visibility.policy.changed"},
    ("POST", "/api/users"): {"user.created"},
    ("PATCH", "/api/users/{user_id}"): {"user.modified", "role.assigned", "scope.granted",
                                        "scope.revoked", "supervisor.changed",
                                        "supervisor_flag.changed"},
    ("POST", "/api/users/{user_id}/disabled"): {"user.disabled", "user.enabled",
                                                "session.revoked"},
    ("POST", "/api/users/{user_id}/password"): {"password.set_by_admin", "session.revoked"},
    ("POST", "/api/comments"): {"comment.created"},
    ("PUT", "/api/comments/{ref}"): {"comment.edited"},
    ("POST", "/api/comments/{ref}/withdraw"): {"comment.withdrawn"},
    ("POST", "/api/comments/{ref}/restore"): {"comment.restored"},
    ("POST", "/api/comments/{ref}/approve"): {"comment.approved", "comment.noted"},
    ("POST", "/api/comments/{ref}/reject"): {"comment.rejected"},
    ("POST", "/api/comments/{ref}/address"): {"comment.addressed"},
}
#: Written by something other than an endpoint (D42's table, addendum D79/D80).
ELSEWHERE = {"department.viewed", "process.viewed", "report.downloaded", "access.denied",
             "confirmation.invalidated", "projection.discontinuity"}


def _routes(app):
    """Walk included routers too (see test_body_scan's note on FastAPI 0.139:
    the real routes hang off an `_IncludedRouter`'s `original_router`)."""
    stack, out = list(app.routes), []
    while stack:
        r = stack.pop()
        if isinstance(r, APIRoute):
            out.append(r)
        stack.extend(getattr(r, "routes", []) or [])
        nested = getattr(r, "original_router", None)
        if nested is not None:
            stack.extend(nested.routes)
    return out


def _app(data_root, tmp_path):
    return create_app(cfg_for(data_root, tmp_path / "app.db"))


def test_every_write_route_is_accounted_for(data_root, tmp_path):
    writes = {(m, r.path) for r in _routes(_app(data_root, tmp_path))
              for m in r.methods if m in {"POST", "PUT", "PATCH", "DELETE"}}
    assert writes == set(WRITES)


def test_every_catalogued_event_has_a_writer():
    """§11 test 16c: an event named in the catalogue that no code emits — every
    name must appear as a string literal outside the catalogue itself — and the
    catalogue equals the routes' table plus `ELSEWHERE`.

    The reverse — every name the code *records* is catalogued — cannot be read
    off literals: `audit.record` guards nothing and two writers pass the action
    through a variable (`comment_jobs.drain`, `projection`). It is asserted
    against the rows themselves, after the `*` Editor's full sweep in
    `test_body_scan.py::test_the_scan_finds_every_token_when_the_caller_is_in_scope`."""
    catalogue_file = PACKAGE / "store" / "activity.py"
    literals = set()
    for path in PACKAGE.rglob("*.py"):
        if path == catalogue_file:
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                literals.add(node.value)
    assert set(CATALOGUE) <= literals
    assert set(CATALOGUE) == set().union(*WRITES.values()) | ELSEWHERE


def test_every_catalogued_event_is_asserted_by_some_test():
    corpus = "".join(p.read_text(encoding="utf-8") for p in TESTS.glob("test_*.py")
                     if p.name != "test_activity_catalogue.py")
    missing = sorted(name for name in CATALOGUE if f'"{name}"' not in corpus)
    assert missing == []


def test_the_record_is_append_only():
    """§11 test 19 / D45: no code alters or deletes a record row, and the
    report surface is GET-only."""
    for path in PACKAGE.rglob("*.py"):
        text = path.read_text(encoding="utf-8").upper()
        assert "UPDATE AUDIT_EVENTS" not in text and "DELETE FROM AUDIT_EVENTS" not in text, path


def test_the_activity_surface_is_get_only(data_root, tmp_path):
    methods = {m for r in _routes(_app(data_root, tmp_path))
               if r.path.startswith("/api/activity") for m in r.methods}
    assert methods == {"GET"}


def test_the_spa_mount_does_not_swallow_the_activity_routes(data_root, tmp_path):
    """§11 test 18, extended to the new prefix."""
    from fastapi.testclient import TestClient
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>shell</html>", encoding="utf-8")
    cfg = cfg_for(data_root, tmp_path / "app.db")
    seed_editor(cfg)
    c = TestClient(create_app(dataclasses.replace(cfg, static_dir=static)),
                   base_url="https://testserver")
    assert c.post("/api/auth/login",
                  json={"username": _USERNAME, "password": _PW}).status_code == 200
    # The positive control: the mount really is live, so the JSON below is the
    # route winning over it and not `static_dir` having quietly stopped mounting.
    assert "shell" in c.get("/some-client-route").text
    r = c.get("/api/activity/summary")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
