"""The load-bearing test (spec §11 test 9, D56).

A scan of the whole serialised body, not per-field assertions — because the next
leak will be in a field nobody thought to assert on. Every response every role
can obtain is walked to the leaves, keys included, and every string in it is
checked against a list of things that department's caller was never to learn.

**What is asserted here, and what is not.** P0b polices whole records, derived
signals and out-of-scope ids. Field-level stripping (`summary`, `idef0`, `kpis`,
node `icom`) and confirmation-gating are the content-visibility sub-project's and
are deliberately NOT asserted — §11 test 8's "no denylisted field", and §11 test
9's "no unconfirmed process id", arrive with it. What §11 test 9 assigns to *this*
task is the scope half plus one explicit inclusion: **no pending count reaches a
non-editor**, which `test_the_board_serves_no_conflict_count_to_anyone_who_cannot_edit`
below pins.

**Two things a scan of this shape can quietly stop testing, and what holds them:**

* *Scanning nothing.* A caller whose in-scope corpus is empty passes every
  assertion here while the backend leaks freely.
  `test_the_scan_finds_every_token_when_the_caller_is_in_scope`
  runs the identical sweep as a `*` holder and asserts every token in
  `FORBIDDEN` **is** found — so a token no endpoint ever serves, or a fixture
  that was never planted, fails loudly instead of passing silently.
* *Scanning fewer endpoints than exist.* `test_the_scan_exercises_every_api_route`
  compares the table below against the app's own route table, so a fifteenth
  endpoint added later fails this file rather than slipping past it.

A third guard is `test_the_in_scope_corpus_carries_no_forbidden_token`: it makes
"the scoped caller found nothing" mean "nothing leaked" rather than "the token
happened to be a substring of something they were entitled to see".
"""
from __future__ import annotations

import itertools
import json
from typing import NamedTuple

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"

#: The department every caller in this file is scoped to, and the one every
#: assertion is about *not* seeing past.
MINE = "dining"

#: Everything outside it, named once. `THEIRS` is the department the sweep also
#: probes by path — a caller must learn nothing from asking, either.
THEIRS = "cooking"

#: What must never appear in a body served to a `dept:dining` caller, and why.
#:
#: Codes and ids are the obvious half. The four `LEAK…` sentinels are the half
#: that matters: an id or a code can leak *through* a legitimate field (a scope
#: string, an export URL), while a process's name, a node's label, its actor and
#: an unresolved proposal's value have no business anywhere in a dining response
#: at all. They are ASCII on purpose — a failure message naming `LEAKACTOR` says
#: what leaked at a glance, and none of them can be a substring of Persian
#: content the caller *is* entitled to.
FORBIDDEN: tuple[tuple[str, str], ...] = (
    ("cooking", "a department outside the caller's scope"),
    ("پخت", "the display name of a department outside the caller's scope"),
    ("logistics", "a second department outside the caller's scope"),
    ("لجستیک", "the display name of that second department"),
    ("cooking-777", "the id of a process outside the caller's scope"),
    ("LEAKNAME", "the name of a process outside the caller's scope"),
    ("LEAKLABEL", "a node label from a process outside the caller's scope"),
    ("LEAKACTOR", "a node actor from a process outside the caller's scope"),
    ("LEAKPROPOSED", "an unresolved proposal from outside the caller's scope"),
)


# --------------------------------------------------------------------------
# The corpus. `data_root` from conftest carries one process, in `cooking`, and
# no dining anything — so a dining-scoped caller's bodies would all be empty and
# every assertion below would pass on a backend that leaked everything.
# --------------------------------------------------------------------------

def _process(pid: str, dept: str, *, name: str, label: str, actor: str,
             proposed: str) -> dict:
    """A process of the fixture's shape, with every string under this file's control.

    Authored rather than copied from `tests/fixtures/process.cooking-001.json`:
    that document contains «انبار» and «حسابداری», which are two departments'
    display names, so a copy of it planted in `dining` would trip this file's own
    token list and read as a backend leak.
    """
    node = f"{pid}-n010"
    return {
        "id": pid, "department": dept, "name": name,
        "summary": f"{name} — شرح کوتاه",
        "source": {"type": "manual", "ref": None, "run": None},
        "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [],
        "nodes": [
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 30, "y": 100}, "layout": "auto"},
            {"id": node, "type": "activity", "label": label, "actor": actor,
             "description": f"{label} — توضیح", "subprocess": None,
             "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
             "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/x", "touched_by": []}},
            {"id": "end", "type": "end", "label": "پایان",
             "position": {"x": 320, "y": 100}, "layout": "auto"},
        ],
        "edges": [{"from": "start", "to": node, "label": ""},
                  {"from": node, "to": "end", "label": ""}],
        "pending": [{"node": node, "field": "actor", "current": actor,
                     "proposed": proposed, "source": "runs/x", "status": "open"}],
    }


def _overview(dept: str, name: str) -> dict:
    return {
        "department": dept, "name": name,
        "description": f"{name} و وظایف روزانهٔ آن",
        "sub_units": [{"name": "واحد یک", "description": "شرح واحد یک"}],
        "personnel": [{"role": "میزبان", "duties": ["راهنمایی مهمان"],
                       "kpi": ["رضایت مهمان"]}],
        "updated_at": "2026-07-06T10:00:00Z",
    }


def _write(root, dept: str, filename: str, doc: dict) -> None:
    (root / "departments" / dept / filename).write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def corpus(data_root):
    """`data_root` with something real on both sides of the scope boundary.

    In scope: a dining overview and two dining processes, one of them carrying an
    **open** conflict. The conflict is what makes `/api/pending` and the board's
    count say anything at all — without it, a `/api/pending` filtered on `view`
    instead of `edit` would answer `[]` to a Reader and the test asserting `[]`
    would pass on the wrong implementation.

    Out of scope: the fixture's `cooking-001`, a second `cooking-777` carrying
    this file's four sentinels, and a `logistics` process so the board has a
    second department to leak.
    """
    _write(data_root, MINE, "overview.json", _overview(MINE, "دپارتمان سالن"))
    _write(data_root, MINE, "processes/dining-001.json",
           _process("dining-001", MINE, name="پذیرایی از مهمان",
                    label="خوش‌آمدگویی", actor="میزبان", proposed="پیشخدمت"))
    _write(data_root, MINE, "processes/dining-002.json",
           _process("dining-002", MINE, name="ترخیص میز",
                    label="تسویه", actor="میزبان", proposed="پیشخدمت"))
    _write(data_root, THEIRS, "processes/cooking-777.json",
           _process("cooking-777", THEIRS, name="LEAKNAME", label="LEAKLABEL",
                    actor="LEAKACTOR", proposed="LEAKPROPOSED"))
    _write(data_root, "logistics", "processes/logistics-005.json",
           _process("logistics-005", "logistics", name="بارگیری",
                    label="تحویل", actor="راننده", proposed="پیک"))
    return data_root


def test_the_in_scope_corpus_carries_no_forbidden_token(corpus):
    """The premise of every scan below: a hit is a leak, never a substring.

    If a token were also part of something the dining caller is entitled to read
    — a department display name inside a Persian word, an id inside a summary —
    the scans would fail for a reason that has nothing to do with the backend.
    This is where that is diagnosed, in one line, instead of in a false alarm.
    """
    registry = json.loads(
        (corpus / "departments" / "registry.json").read_text(encoding="utf-8"))
    served = json.dumps(
        [json.loads(p.read_text(encoding="utf-8"))
         for p in sorted((corpus / "departments" / MINE).rglob("*.json"))]
        # …and the caller's own row of the registry, read rather than restated:
        # the board serves the department's display name, and a copy of it here
        # would stop checking the real one the day the registry changed.
        + [d for d in registry["departments"] if d["code"] == MINE],
        ensure_ascii=False)
    for token, why in FORBIDDEN:
        assert token not in served, (
            f"{token!r} ({why}) is part of what a {MINE} caller may legitimately"
            f" read, so a scan finding it proves nothing: pick another token or"
            f" change the fixture")


# --------------------------------------------------------------------------
# Clients
# --------------------------------------------------------------------------

def _cfg(data_root, tmp_path, n: int):
    """Settings with the export feature **on**.

    `POST /api/departments/{code}/exports/{kind}` answers 503 with no
    `EXPORT_DIR`, and a 503 body is not the body this endpoint serves in
    production. Configured here so the sweep scans the real
    `{"url": …, "generated_at": …}` — the URL carries a department code, which is
    exactly the shape of thing this file exists to check. `CHROMIUM_PATH` stays
    unset: the PDF is best-effort and never touches the response.
    """
    cfg = cfg_for(data_root, tmp_path / f"app-{n}.db")
    tdir = tmp_path / "templates"
    tdir.mkdir(exist_ok=True)
    for kind in ("steps", "flowchart"):
        (tdir / f"{kind}.html").write_text(
            '<!doctype html><script id="inja-export-data">__INJA_EXPORT_DATA__</script>',
            encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__, "export_dir": tmp_path / "exports",
                            "export_template_dir": tdir})


_seq = itertools.count()


def _client_as(data_root, tmp_path, role, *scopes):
    """A signed-in client for a fresh account with `role` and `scopes`.

    Its own `app.db` per call, because several tests here compare two callers
    over one corpus and a shared store would collide on the username. `base_url`
    is https because the session cookie is `Secure` and the jar will not send it
    over http.
    """
    n = next(_seq)
    # Eleven digits whatever `n` is — `users.create` normalises and the seed's
    # `USERNAME_RE` refuses anything that is not a canonical mobile number, so a
    # counter that widened the string would start failing at account 100.
    username = f"0912{n:07d}"
    cfg = _cfg(data_root, tmp_path, n)
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        for s in scopes:
            conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                         (uid, s))
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    r = client.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    client.username = username
    return client


# --------------------------------------------------------------------------
# Every endpoint that returns a body
# --------------------------------------------------------------------------

class Route(NamedTuple):
    method: str
    path: str          # `{d}` is the department, `{u}` the caller's username
    body: dict | None
    template: str      # the FastAPI path this exercises — see the coverage test


#: Read routes that span every department, so they are swept once rather than
#: once per department.
GLOBAL_READS = (
    Route("GET", "/api/auth/me", None, "/api/auth/me"),
    Route("GET", "/api/departments", None, "/api/departments"),
    Route("GET", "/api/pending", None, "/api/pending"),
)

#: Read routes that name a department. Swept for the caller's own department and
#: for one they cannot reach: the answer to *asking* must leak nothing either.
DEPT_READS = (
    Route("GET", "/api/departments/{d}/overview", None,
          "/api/departments/{code}/overview"),
    Route("GET", "/api/departments/{d}/processes", None,
          "/api/departments/{code}/processes"),
    Route("GET", "/api/departments/{d}/next-id", None,
          "/api/departments/{code}/next-id"),
    Route("GET", "/api/processes/{d}-001", None, "/api/processes/{pid}"),
)

#: The writes, swept after every read so that what the reads see is the planted
#: corpus rather than whatever a write left behind. The delete is last for the
#: same reason.
DEPT_WRITES = (
    Route("POST", "/api/departments/{d}/exports/steps", None,
          "/api/departments/{code}/exports/{kind}"),
    Route("PUT", "/api/departments/{d}/overview", {}, "/api/departments/{code}/overview"),
    Route("PUT", "/api/departments/{d}/order", {"order": []},
          "/api/departments/{code}/order"),
    Route("POST", "/api/processes", {"department": "{d}"}, "/api/processes"),
    Route("POST", "/api/processes/{d}-001/relayout", {},
          "/api/processes/{pid}/relayout"),
    Route("PUT", "/api/processes/{d}-001", {}, "/api/processes/{pid}"),
    Route("POST", "/api/processes/{d}-001/pending/0", {"decision": "reject"},
          "/api/processes/{pid}/pending/{index}"),
    Route("DELETE", "/api/processes/{d}-001", None, "/api/processes/{pid}"),
)

#: The session routes. `logout` is last in the sweep — it ends the session every
#: route before it needed.
GLOBAL_WRITES = (
    Route("POST", "/api/auth/login", {"username": "{u}", "password": PW},
          "/api/auth/login"),
    Route("POST", "/api/auth/password", {"current": PW, "next": "x"},
          "/api/auth/password"),
    Route("POST", "/api/auth/logout", None, "/api/auth/logout"),
)

EVERY_ROUTE = GLOBAL_READS + DEPT_READS + DEPT_WRITES + GLOBAL_WRITES


def _fill_value(value, **kw):
    if isinstance(value, str):
        return value.format(**kw)
    if isinstance(value, dict):
        return {k: _fill_value(v, **kw) for k, v in value.items()}
    return value


def _fill(route: Route, **kw) -> Route:
    """`{d}` → the department, `{u}` → the caller's own username."""
    kw.setdefault("d", "")
    return route._replace(path=_fill_value(route.path, **kw),
                          body=_fill_value(route.body, **kw))


def _sweep(client, departments=(MINE, THEIRS)):
    """Every route, in an order that leaves the reads looking at planted data."""
    seq = [_fill(r, u=client.username) for r in GLOBAL_READS]
    for d in departments:
        seq += [_fill(r, d=d, u=client.username) for r in DEPT_READS]
    for d in departments:
        seq += [_fill(r, d=d, u=client.username) for r in DEPT_WRITES]
    seq += [_fill(r, u=client.username) for r in GLOBAL_WRITES]
    return seq


# --------------------------------------------------------------------------
# The scan itself
# --------------------------------------------------------------------------

def _texts(value, path="$"):
    """Every string in a decoded body, with where it was found — keys included.

    Keys as well as values, because a leak can be a key (`{"cooking": {…}}`), and
    every scalar stringified, because an id can arrive as one field or embedded
    in the middle of a sentence. Depth is unbounded: a field inside a list inside
    an object is reached exactly like a top-level one.
    """
    if isinstance(value, dict):
        for k, v in value.items():
            here = f"{path}.{k}"
            yield here, str(k)
            yield from _texts(v, here)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from _texts(v, f"{path}[{i}]")
    else:
        yield path, "" if value is None else str(value)


class Leak(NamedTuple):
    route: Route
    status: int
    token: str
    why: str
    where: str
    value: str

    def __str__(self) -> str:
        return (f"{self.route.method} {self.route.path} → {self.status} leaked"
                f" {self.token!r} ({self.why}) at {self.where} ="
                f" {self.value[:120]!r}")


def _leaks(client, sequence=None, forbidden=FORBIDDEN) -> list[Leak]:
    """Run the sweep and return every forbidden token found in every body."""
    found: list[Leak] = []
    for route in (sequence if sequence is not None else _sweep(client)):
        r = client.request(route.method, route.path, json=route.body)
        try:
            doc = r.json()
        except ValueError:
            doc = r.text
        pairs = list(_texts(doc))
        raw = json.dumps(doc, ensure_ascii=False)
        for token, why in forbidden:
            hits = [(where, text) for where, text in pairs if token in text]
            if token in raw and not hits:
                # The walker reaches every string a JSON body can hold, so this
                # is unreachable today. It stays because "the scan looked and
                # found nothing" must never be able to mean "the walker did not
                # go there".
                hits = [("$ — somewhere the walker did not reach", raw)]
            found += [Leak(route, r.status_code, token, why, where, text)
                      for where, text in hits]
    return found


ROLES = ("reader", "reader_no_download", "admin", "editor")


@pytest.mark.parametrize("role", ROLES)
def test_no_role_is_served_anything_outside_its_scope_anywhere_in_any_body(
        corpus, tmp_path, role):
    """§11 test 9, for every role there is.

    All four, not the three that read: an Editor scoped to one department holds
    every capability in the model, so scope is the only thing that can refuse
    them — and the write routes' bodies (a created process, a saved document, a
    409's message) are bodies nobody thinks to check.
    """
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    leaks = _leaks(client)
    assert leaks == [], "\n".join(f"  as a {role}: {leak}" for leak in leaks)


def test_a_report_scope_is_served_nothing_of_the_department_either(corpus, tmp_path):
    """The narrowest scope there is, swept the same way.

    `dept:x/report:k` reaches one report and neither the department nor its
    processes, so this caller's every in-scope body is a 404 — which is what
    makes the sweep worth running for them: a 404 with a body that named what was
    refused would be the leak.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}/report:steps")
    leaks = _leaks(client)
    assert leaks == [], "\n".join(f"  as a report reader: {leak}" for leak in leaks)


def test_the_scan_finds_every_token_when_the_caller_is_in_scope(corpus, tmp_path):
    """The scan, proved to bite — permanently, not once by hand.

    The identical sweep as a `*` holder, who is entitled to all of it. Every
    token in `FORBIDDEN` must turn up somewhere: one that does not is a token no
    endpoint ever serves, and asserting its absence for a scoped caller is an
    assertion about nothing. This is what stops the file above from passing
    because the corpus was never planted, because a route table went stale, or
    because a fixture rename silently emptied a department.
    """
    client = _client_as(corpus, tmp_path, "editor", "*")
    seen = {leak.token for leak in _leaks(client)}
    missing = {token for token, _ in FORBIDDEN} - seen
    assert not missing, (
        f"no endpoint serves {sorted(missing)} even to a caller entitled to"
        f" everything, so asserting a scoped caller never sees them tests"
        f" nothing: fix the corpus or the route table")


def _api_routes(app):
    """Every `APIRoute` the app carries, however deeply the version nests them.

    Not `[r for r in app.routes if isinstance(r, APIRoute)]`: since FastAPI 0.139
    `include_router` leaves an `_IncludedRouter` in `app.routes` which holds the
    real routes on its `original_router`, so the flat comprehension finds **none**
    and a coverage test written that way compares against an empty set forever.
    The `assert live` in the test above is what turns that into a failure rather
    than a vacuous pass if the tree changes shape again.
    """
    stack, out = list(app.routes), []
    while stack:
        route = stack.pop()
        stack += list(getattr(route, "routes", ()) or ())
        nested = getattr(route, "original_router", None)
        if nested is not None:
            stack += list(nested.routes)
        if isinstance(route, APIRoute):
            out.append(route)
    return out


def test_the_scan_exercises_every_api_route(corpus, tmp_path):
    """Every endpoint, not the ones somebody listed.

    Compared against the app's own route table, so a fifteenth endpoint fails
    here on the day it is added rather than being quietly unscanned.

    `/api/exports/...` is out: those two routes belong to the export reader's
    separate credential (D25), which is not a session, holds no role and no
    scope, and has its own tests in `test_export_auth.py`. The `/exports/...`
    download itself is likewise not an API response — it serves a published file
    behind that credential.
    """
    app = create_app(_cfg(corpus, tmp_path, next(_seq)))
    live = {(m, route.path) for route in _api_routes(app)
            for m in route.methods if m not in ("HEAD", "OPTIONS")
            if route.path.startswith("/api/")
            and not route.path.startswith("/api/exports/")}
    assert live, ("no routes were found to compare against: this app no longer"
                  " keeps its endpoints where _api_routes looks")
    scanned = {(r.method, r.template) for r in EVERY_ROUTE}
    assert scanned == live, (
        f"unscanned routes: {sorted(live - scanned)};"
        f" scanned routes that no longer exist: {sorted(scanned - live)}")


# --------------------------------------------------------------------------
# The named cases §11 test 9 calls out
# --------------------------------------------------------------------------

def _board(client):
    r = client.get("/api/departments")
    assert r.status_code == 200, r.text
    return r.json()


def test_the_department_list_omits_what_the_caller_cannot_reach(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    assert {d["code"] for d in _board(client)} == {MINE}


def test_the_board_serves_no_conflict_count_to_anyone_who_cannot_edit(corpus,
                                                                     tmp_path):
    """§11 test 9's explicit inclusion: *no pending count reaches a non-editor.*

    D17 puts `pending` (unresolved conflicts) in the never-shown block, never
    switchable; D56's derived-signals row names a `pending` **count** verbatim,
    because a badge saying "one conflict" leaks the existence of a withheld
    proposal as surely as the proposal does. `/api/pending` has been gated on
    `edit` for exactly that reason since it was written — and the board two files
    over was handing every Reader the same number.

    **Omitted, not zeroed.** A zero is still an answer to "how many unresolved
    proposals does this department have", and D56 is "not sent", not "sent
    harmless".

    Paired in both directions. Asserting only the absence is satisfied by a board
    that dropped the field for everyone, which would take the conflict badge away
    from the one person who can act on it.
    """
    for role in ("reader", "reader_no_download", "admin"):
        client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
        for row in _board(client):
            assert "conflicts" not in row, (
                f"the board served a {role} a conflict count: {row}")

    # A report-scoped Editor holds `edit`, and holds it nowhere: `dept:x/report:k`
    # is "somewhere within x" for the listing and reaches nothing for the action,
    # which is the one caller a capability check without a target gets wrong.
    report = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}/report:steps")
    assert [row for row in _board(report) if "conflicts" in row] == []

    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    mine = next(row for row in _board(editor) if row["code"] == MINE)
    assert mine["conflicts"] == 2, (
        "the person who can resolve a conflict is no longer told there is one")


def test_pending_is_empty_rather_than_forbidden_for_someone_without_edit(corpus,
                                                                        tmp_path):
    """200 and `[]`, not 403 — and empty because of `edit`, not because the
    department is bare: `dining-001` and `dining-002` each carry an open conflict,
    so a `/api/pending` filtered on `view` would hand this Reader both rows."""
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    r = client.get("/api/pending")
    assert r.status_code == 200
    assert r.json() == []
    # …and the same request from someone who may edit is not empty, or the
    # assertion above is satisfied by an endpoint that answers `[]` to everyone.
    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    assert {row["process"] for row in editor.get("/api/pending").json()} == {
        "dining-001", "dining-002"}


def test_a_report_scoped_reader_sees_no_department_body_at_all(corpus, tmp_path):
    """A report scope covers neither the department nor its process list (D10).

    Paired with a department-scoped reader, because the conftest corpus alone
    would make this pass for the wrong reason: with no dining overview on disk,
    `GET /api/departments/dining/overview` answers 404 to *everybody*, and the
    404 asserted here would say nothing about scope. `corpus` plants one, so the
    200 below is what gives the 404 above its meaning.
    """
    report = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}/report:steps")
    assert report.get(f"/api/departments/{MINE}/overview").status_code == 404
    assert report.get(f"/api/departments/{MINE}/processes").status_code == 404

    whole = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    assert whole.get(f"/api/departments/{MINE}/overview").status_code == 200
    assert [p["id"] for p in whole.get(f"/api/departments/{MINE}/processes").json()] == [
        "dining-001", "dining-002"]
