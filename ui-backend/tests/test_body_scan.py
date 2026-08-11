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

**Three things a scan of this shape can quietly stop testing, and what holds
them:**

* *Scanning nothing.* A caller whose in-scope corpus is empty passes every
  assertion here while the backend leaks freely.
  `test_the_scan_finds_every_token_when_the_caller_is_in_scope`
  runs the identical sweep as a `*` holder and asserts every token in
  `FORBIDDEN` **is** found — so a token no endpoint ever serves, or a fixture
  that was never planted, fails loudly instead of passing silently.
* *Scanning fewer endpoints than exist.* `test_the_scan_exercises_every_api_route`
  compares the table below against the app's own route table, so a fifteenth
  endpoint added later fails this file rather than slipping past it. What it does
  not sweep it names, in `NOT_SWEPT`, with the reason written out.
* *Scanning only error envelopes.* An endpoint sent a request body that cannot
  pass validation answers 422 to everybody, and a 422 is not the body that
  endpoint serves. Every `Route` therefore records the status it answers an
  Editor inside their own department, and
  `test_the_sweep_reaches_the_body_each_route_really_serves` checks it — so a
  sweep that has stopped producing real bodies fails instead of scanning
  `{"detail": …}` eighteen times.

Two token sets are checked, and they are checked in opposite directions.
`FORBIDDEN` is about one caller's scope, so the `*` holder must **find** all of
it; `_server_paths` is about the host, so nobody may see any of it.

A third guard is `test_the_in_scope_corpus_carries_no_forbidden_token`: it makes
"the scoped caller found nothing" mean "nothing leaked" rather than "the token
happened to be a substring of something they were entitled to see".
"""
from __future__ import annotations

import itertools
import json
import sys
from typing import Callable, NamedTuple

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
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

#: The tombstoned process planted **inside** the caller's own department.
TOMBSTONED = f"{MINE}-003"

#: What must never appear in a body served to someone who cannot `edit` this
#: department — and what an Editor must still be served.
#:
#: A second token list rather than four more rows of `FORBIDDEN`, because the two
#: are checked against different callers. `FORBIDDEN` is about *scope*: nobody
#: outside `cooking` may see it and the `*` holder must find all of it. This list
#: is about *capability* at one department both callers hold: an Editor scoped to
#: `dining` sees every one of these legitimately (D17 excludes tombstones from the
#: **non-editor** default and gives no switch), so putting them in `FORBIDDEN`
#: would fail `test_no_role_is_served_anything_outside_its_scope_anywhere_in_any_body`
#: for the `editor` parameter over content that role is entitled to.
#:
#: ASCII sentinels for the same reason as the `LEAK…` ones — a failure naming
#: `TOMBACTOR` says what leaked, and none of them can be a substring of Persian
#: content anybody is entitled to.
TOMBSTONE_TOKENS: tuple[tuple[str, str], ...] = (
    (TOMBSTONED, "the id of a tombstoned process (D17: excluded entirely)"),
    ("TOMBNAME", "the name of a tombstoned process"),
    ("TOMBLABEL", "a node label from a tombstoned process"),
    ("TOMBACTOR", "a node actor from a tombstoned process"),
)


def _server_paths(data_root) -> tuple[tuple[str, str], ...]:
    """A second class of leak the scan was blind to: **the server's own layout.**

    Everything in `FORBIDDEN` is about one caller's scope, so it is checked for
    the scoped callers and deliberately *found* for the `*` holder. An absolute
    path on the host is not like that. It belongs to no department, no role and
    no scope; it is forbidden to everybody, wildcard holder included, and it is
    NFR-12's "internal bookkeeping never leaves the system" at the infrastructure
    layer rather than the content one.

    These are computed rather than listed because both are per-run: the data root
    is under `tmp_path` and `sys.prefix` is whichever virtualenv is executing.
    That is the same reason they cannot live in `FORBIDDEN` — a module constant
    cannot see the fixture.

    What put them here: `POST /api/processes/{pid}/relayout` answers a failed
    layout with `engine.EngineError.message`, which is the CLI's **stderr** — a
    full Python traceback naming `<venv>/bin/layout` and the absolute path of
    every module on the way down, served to any Editor. The old sweep sent that
    route `{}`, hit exactly that path, and walked past it because a server path
    was in no token list. It sends a real document now (see `_a_saved_document`),
    so the 422 is no longer on the swept path — **the endpoint's behaviour is
    unchanged and the traceback is still what a genuine layout failure returns.**
    That is a live finding against `relayout`, not something this file fixed; the
    sentinel below is what makes the whole class visible from here.
    """
    return (
        (str(data_root), "an absolute path to the server's data root"),
        (sys.prefix, "an absolute path to the server's Python environment"),
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


def _tombstone(pid: str, dept: str) -> dict:
    """A retained-but-deleted process, shaped the way `merge.tombstone` leaves one.

    `pending` is emptied deliberately: `/api/pending` is gated on `edit` and does
    not itself skip tombstones, so a conflict left here would show up in the
    Editor's `/api/pending` and quietly change what
    `test_pending_is_empty_rather_than_forbidden_for_someone_without_edit`
    asserts — a fixture changing another test's premise, which is exactly the
    failure this file's docstring is about.
    """
    doc = _process(pid, dept, name="TOMBNAME", label="TOMBLABEL",
                   actor="TOMBACTOR", proposed="TOMBPROPOSED")
    doc["tombstoned"] = True
    doc["superseded_by"] = []
    doc["pending"] = []
    return doc


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

    Also in scope and **tombstoned**: `dining-003`, carrying this file's
    `TOMB…` sentinels. It sits beside two *active* dining processes on purpose —
    a filter that dropped the whole department would satisfy "the reader never
    saw the tombstone" while serving nothing at all, so
    `test_a_tombstoned_process_is_withheld_from_a_reader_and_kept_for_the_editor`
    asserts the two actives are still there.

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
    _write(data_root, MINE, f"processes/{TOMBSTONED}.json",
           _tombstone(TOMBSTONED, MINE))
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
    #: The request body: a literal (with `{d}`/`{u}` filled in), `None`, or a
    #: callable of the department for the ones that have to carry a whole
    #: document. A callable rather than a `{d}`-templated literal because
    #: `str.format` over a process document would have to walk into lists and
    #: would then choke on the first Persian string somebody writes a brace into.
    body: dict | Callable[[str], dict] | None
    template: str      # the FastAPI path this exercises — see the coverage test
    #: **The status this route answers an Editor acting inside their own
    #: department** — i.e. what it looks like when it *works*.
    #:
    #: Recorded per route, and asserted by
    #: `test_the_sweep_reaches_the_body_each_route_really_serves`, because the
    #: sweep's whole value is the bodies it walks and a request body that fails
    #: validation produces no body to walk. Five of these routes used to be sent
    #: `{}` or `{"order": []}` and answered 422/409/400 to every caller, so the
    #: created process, the saved document and the resolved conflict this file's
    #: docstring claims to scan were never once produced. An expected status is
    #: what makes that impossible to reintroduce quietly: an all-422 sweep now
    #: fails loudly instead of scanning error envelopes.
    #:
    #: It is deliberately the *Editor's* status and not a per-role table. Every
    #: other role's refusal (403 for a Reader who may not write, 404 for anything
    #: out of scope) is asserted by shape rather than by number —
    #: `test_every_department_route_refuses_a_department_out_of_scope` for the
    #: 404s, `test_endpoint_matrix.py` for the capability half.
    expect: int


#: Read routes that span every department, so they are swept once rather than
#: once per department.
GLOBAL_READS = (
    Route("GET", "/api/auth/me", None, "/api/auth/me", 200),
    Route("GET", "/api/departments", None, "/api/departments", 200),
    Route("GET", "/api/pending", None, "/api/pending", 200),
)

#: Read routes that name a department. Swept for the caller's own department and
#: for one they cannot reach: the answer to *asking* must leak nothing either.
DEPT_READS = (
    Route("GET", "/api/departments/{d}/overview", None,
          "/api/departments/{code}/overview", 200),
    Route("GET", "/api/departments/{d}/processes", None,
          "/api/departments/{code}/processes", 200),
    Route("GET", "/api/departments/{d}/next-id", None,
          "/api/departments/{code}/next-id", 200),
    Route("GET", "/api/processes/{d}-001", None, "/api/processes/{pid}", 200),
    #: The same route again, on the **tombstoned** id. A second entry on one
    #: template rather than a sweep of its own: `test_the_scan_exercises_every_api_route`
    #: compares sets of (method, template), so the duplicate collapses there and
    #: costs nothing, while every scan in this file walks the body a
    #: `/api/processes/{pid}` request for a retained-but-deleted record returns.
    #: Without it the listing could be filtered and this endpoint could still hand
    #: any reader the whole document (D17, D56) — the door shut and the window
    #: open. `200` is the Editor's answer: they are the one caller a tombstone is
    #: retained *for*.
    Route("GET", "/api/processes/{d}-003", None, "/api/processes/{pid}", 200),
)


def _an_overview(d: str) -> dict:
    """A valid overview document, so `PUT …/overview` saves instead of 422ing."""
    return _overview(d, "دپارتمان")


def _the_whole_order(d: str) -> dict:
    """`MINE`'s active set, in order — the only sequence `order set` accepts.

    `{"order": []}` is a guaranteed 409 (`set mismatch`), which is an error
    envelope and not the `{"order": [...]}` this route really serves.

    **Only `MINE` really has this set**: `corpus` plants `dining-001` and
    `dining-002`, and nothing plants the same pair anywhere else. That is why
    `Route.expect` is asserted for `MINE` alone — for any other department this
    is a well-formed request that legitimately conflicts, which is a fine thing
    to scan and not a success body.
    """
    return {"order": [f"{d}-001", f"{d}-002"]}


def _a_saved_document(d: str) -> dict:
    """What the editor round-trips back on Save.

    For `MINE` this is byte-for-byte the document `corpus` planted at
    `{d}-001`, which is what a Save really carries: the client sends back what
    it loaded. For any other department it is a well-formed process document
    that is simply not the one on disk — harmless, because every route naming
    another department is refused before the body is looked at.

    `{}` fails `process.schema.json` on every required property, so `PUT
    /api/processes/{pid}` answered 422 to everyone and its success body — which
    is the largest body this service returns, and the one most likely to carry a
    neighbouring department's id — was never scanned.
    """
    return _process(f"{d}-001", d, name="پذیرایی از مهمان", label="خوش‌آمدگویی",
                    actor="میزبان", proposed="پیشخدمت")


#: The writes, swept after every read so that what the reads see is the planted
#: corpus rather than whatever a write left behind. The delete is last for the
#: same reason.
DEPT_WRITES = (
    Route("POST", "/api/departments/{d}/exports/steps", None,
          "/api/departments/{code}/exports/{kind}", 200),
    Route("PUT", "/api/departments/{d}/overview", _an_overview,
          "/api/departments/{code}/overview", 200),
    Route("PUT", "/api/departments/{d}/order", _the_whole_order,
          "/api/departments/{code}/order", 200),
    Route("POST", "/api/processes", {"department": "{d}"}, "/api/processes", 201),
    Route("POST", "/api/processes/{d}-001/relayout", _a_saved_document,
          "/api/processes/{pid}/relayout", 200),
    Route("PUT", "/api/processes/{d}-001", _a_saved_document,
          "/api/processes/{pid}", 200),
    Route("POST", "/api/processes/{d}-001/pending/0", {"decision": "reject"},
          "/api/processes/{pid}/pending/{index}", 200),
    Route("DELETE", "/api/processes/{d}-001", None, "/api/processes/{pid}", 200),
)

#: A password long enough to be accepted (`validate_password`'s six-character
#: floor). A one-character `next` answered 400 to every caller, so the sweep
#: never once reached this endpoint's real answer.
NEXT_PW = "test-password-2"

#: The session routes. `logout` is last in the sweep — it ends the session every
#: route before it needed. `password` is after `login` and before `logout` on
#: purpose: it really does change the password now, so anything re-authenticating
#: with `PW` has to have already run.
GLOBAL_WRITES = (
    Route("POST", "/api/auth/login", {"username": "{u}", "password": PW},
          "/api/auth/login", 200),
    Route("POST", "/api/auth/password", {"current": PW, "next": NEXT_PW},
          "/api/auth/password", 204),
    Route("POST", "/api/auth/logout", None, "/api/auth/logout", 200),
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
    body = (route.body(kw["d"]) if callable(route.body)
            else _fill_value(route.body, **kw))
    return route._replace(path=_fill_value(route.path, **kw), body=body)


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
    resolved conflict) are bodies nobody thinks to check. Those bodies are only
    really produced for the Editor; that they *are* produced is
    `test_the_sweep_reaches_the_body_each_route_really_serves`'s job.
    """
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    leaks = _leaks(client, forbidden=FORBIDDEN + _server_paths(corpus))
    assert leaks == [], "\n".join(f"  as a {role}: {leak}" for leak in leaks)


def test_a_report_scope_is_served_nothing_of_the_department_either(corpus, tmp_path):
    """The narrowest scope there is, swept the same way.

    `dept:x/report:k` reaches one report and neither the department nor its
    processes, so this caller's every in-scope body is a 404 — which is what
    makes the sweep worth running for them: a 404 with a body that named what was
    refused would be the leak.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}/report:steps")
    leaks = _leaks(client, forbidden=FORBIDDEN + _server_paths(corpus))
    assert leaks == [], "\n".join(f"  as a report reader: {leak}" for leak in leaks)


def test_the_scan_finds_every_token_when_the_caller_is_in_scope(corpus, tmp_path):
    """The scan, proved to bite — permanently, not once by hand.

    The identical sweep as a `*` holder, who is entitled to all of it. Every
    token in `FORBIDDEN` must turn up somewhere: one that does not is a token no
    endpoint ever serves, and asserting its absence for a scoped caller is an
    assertion about nothing. This is what stops the file above from passing
    because the corpus was never planted, because a route table went stale, or
    because a fixture rename silently emptied a department.

    The server paths are checked here in the other direction, and this is the
    strongest place to check them: a `*` holder is the only caller who reaches
    every route's success body, and a host path is forbidden to them too.
    """
    paths = _server_paths(corpus)
    client = _client_as(corpus, tmp_path, "editor", "*")
    leaks = _leaks(client, forbidden=FORBIDDEN + paths)

    seen = {leak.token for leak in leaks}
    missing = {token for token, _ in FORBIDDEN} - seen
    assert not missing, (
        f"no endpoint serves {sorted(missing)} even to a caller entitled to"
        f" everything, so asserting a scoped caller never sees them tests"
        f" nothing: fix the corpus or the route table")

    on_host = [leak for leak in leaks if leak.token in {t for t, _ in paths}]
    assert on_host == [], "\n".join(
        f"  as a wildcard holder: {leak}" for leak in on_host)


def test_the_sweep_reaches_the_body_each_route_really_serves(corpus, tmp_path):
    """A scan that only ever walked error envelopes is a scan of nothing.

    The sweep's docstrings claim it checks *a created process, a saved document,
    a resolved conflict*. For five of the eighteen routes that was false: the
    table sent `{}`, `{"order": []}` and a one-character password — bodies that
    cannot pass validation — so `PUT …/overview`, `PUT …/order`,
    `POST …/relayout`, `PUT /api/processes/{pid}` and `POST /api/auth/password`
    answered 422, 409, 422, 422 and 400 to *every* role and their success bodies
    were never once produced. A leak planted in `PUT /api/processes/{pid}`'s
    return value survived the entire suite.

    So the expected status is part of the table, and it is checked here for the
    one caller who should reach all of them: an Editor inside their own
    department. `test_the_scan_exercises_every_api_route` pins that the table
    lists every route; this pins that every listed route was actually *served*.
    """
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    wrong = []
    for route in _sweep(client, departments=(MINE,)):
        r = client.request(route.method, route.path, json=route.body)
        if r.status_code != route.expect:
            wrong.append(f"  {route.method} {route.path}: expected"
                         f" {route.expect}, got {r.status_code} — {r.text[:200]}")
    assert not wrong, (
        "these routes never produced the body the sweep exists to walk:\n"
        + "\n".join(wrong))


def test_every_department_route_refuses_a_department_out_of_scope(corpus, tmp_path):
    """The other half of the sweep, and the reason its bodies are all identical.

    For the out-of-scope department every route must answer the one 404 (D56):
    not 403, which would confirm the department exists, and not a 500, which
    would mean the gate ran after something that could fail. Asserted as a status
    rather than only scanned, because `_leaks` finding nothing in a 502's body is
    not evidence of anything.

    `THEIRS` really is there — an overview, two processes, an open conflict, a
    next id — which is what stops these 404s from being the honest answer they
    would be for a department that did not exist.
    `test_the_scan_finds_every_token_when_the_caller_is_in_scope` is the pairing:
    the same routes, for a `*` holder, must serve all of it.
    """
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    wrong = []
    for route in DEPT_READS + DEPT_WRITES:
        filled = _fill(route, d=THEIRS, u=client.username)
        r = client.request(filled.method, filled.path, json=filled.body)
        if (r.status_code, r.json()) != (404, {"detail": NOT_FOUND}):
            wrong.append(f"  {filled.method} {filled.path}: {r.status_code}"
                         f" {r.text[:200]}")
    assert not wrong, (
        "these routes answered a caller outside the department with something"
        " other than the uniform 404:\n" + "\n".join(wrong))


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


#: Routes this file does **not** sweep, each named with the reason, because a
#: silent filter is how an endpoint stops being tested without anybody deciding
#: that it should.
#:
#: The previous shape of this test filtered on `path.startswith("/api/")` and
#: then subtracted `/api/exports/`. The subtraction was at least visible; the
#: prefix filter was not, and it dropped `GET /exports/{file_path:path}` —
#: the one endpoint D56 writes a row about — without a word.
NOT_SWEPT: dict[tuple[str, str], str] = {
    ("POST", "/api/exports/login"): (
        "the way in to the shared export credential (D25): not a session, no "
        "role and no scope, so there is nothing here for a role-parametrised "
        "scan to say. Covered by test_export_login.py."),
    ("POST", "/api/exports/logout"): (
        "the same credential's way out; test_export_login.py."),
    ("GET", "/exports/{file_path:path}"): (
        "**UNRESOLVED, and left unresolved deliberately — do not delete this "
        "entry without reading D56's Downloads row.** The download is gated by "
        "the shared export credential alone, and that credential derives no "
        "department scope, so this endpoint serves any published artifact to "
        "anyone holding it. D56 says: 'The download endpoint re-derives scope on "
        "every request. That the cached artifact exists is not authorisation to "
        "serve it.' The old reason given for skipping it — that it is 'behind "
        "that credential' — is the argument that row rejects. It is excluded "
        "here because it is pre-existing and outside this sub-project's diff, "
        "not because it is settled. Whoever closes it: the sweep in this file is "
        "where it comes back."),
}


def test_the_scan_exercises_every_api_route(corpus, tmp_path):
    """Every endpoint, not the ones somebody listed.

    Compared against the app's own route table, so a fifteenth endpoint fails
    here on the day it is added rather than being quietly unscanned. What is left
    out is left out by name, in `NOT_SWEPT`, with the reason attached — and every
    exclusion is asserted to still exist, so one that is deleted or renamed fails
    here instead of quietly widening the hole.
    """
    app = create_app(_cfg(corpus, tmp_path, next(_seq)))
    every = {(m, route.path) for route in _api_routes(app)
             for m in route.methods if m not in ("HEAD", "OPTIONS")}
    assert every, ("no routes were found to compare against: this app no longer"
                   " keeps its endpoints where _api_routes looks")
    stale = set(NOT_SWEPT) - every
    assert not stale, (
        f"these routes are excluded from the sweep but no longer exist:"
        f" {sorted(stale)} — an exclusion that names nothing hides nothing, and"
        f" the reason attached to it needs re-reading, not deleting")
    live = every - set(NOT_SWEPT)
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


def _open_conflicts(root, dept: str) -> int:
    """Open conflicts in `dept`, counted from disk rather than from the endpoint
    under test."""
    return sum(
        1
        for path in sorted((root / "departments" / dept / "processes").glob("*.json"))
        for p in json.loads(path.read_text(encoding="utf-8")).get("pending", [])
        if p.get("status") == "open")


def test_the_conflict_count_is_decided_per_department_not_per_caller(corpus,
                                                                    tmp_path):
    """One caller, two departments, two different answers.

    Every other caller in this file holds exactly one scope, and for a
    one-department caller "may edit **this** department" and "may edit
    **somewhere**" are the same question — so the whole file passes, unchanged,
    against a board that asks the per-caller one:

        if any(may_edit(f"dept:{x['code']}") for x in reg["departments"]):

    That regression is a real leak with a real holder behind it. An Editor listed
    for `dining` (whole) and for `cooking/report:steps` (one report) appears on
    both rows of the board — `reachable_departments` is "somewhere within" — and
    may edit only the first. Under the per-caller check they would be served
    cooking's pending count: §11 test 9's *no pending count reaches a non-editor*,
    for a department they cannot open a single process in.

    Both directions, in one caller, so neither can be satisfied by a board that
    withholds the field from everybody or serves it to everybody.
    """
    # The count cooking would leak has to exist, or a regression could serve
    # `conflicts: 0` and the absence assertion below would be about nothing.
    assert _open_conflicts(corpus, THEIRS) > 0, (
        f"{THEIRS} carries no open conflict, so there is no count for a"
        f" per-caller filter to leak and this test proves nothing")

    mixed = _client_as(corpus, tmp_path, "editor",
                       f"dept:{MINE}", f"dept:{THEIRS}/report:steps")
    rows = {row["code"]: row for row in _board(mixed)}
    assert set(rows) == {MINE, THEIRS}, (
        f"the premise is gone: this caller must be listed for both {MINE} and"
        f" {THEIRS}, or the two rows cannot disagree — got {sorted(rows)}")
    assert rows[MINE]["conflicts"] == 2, (
        "the department this caller may edit stopped carrying its count")
    assert "conflicts" not in rows[THEIRS], (
        f"the board served a count for {THEIRS}, which this caller may not edit:"
        f" {rows[THEIRS]} — the `edit` question is being asked about the caller"
        f" rather than about the department")


#: Every role in `ROLES` that does not hold `edit`. Spelled as a subtraction of
#: the real capability rather than as a hand-written list, so a role added to
#: `ROLES` later joins the tombstone scan instead of quietly skipping it.
NON_EDITORS = tuple(r for r in ROLES if r != "editor")


@pytest.mark.parametrize("role", NON_EDITORS)
def test_no_tombstoned_process_reaches_a_role_that_cannot_edit(corpus, tmp_path,
                                                               role):
    """§11 test 9's last clause: **no tombstoned process id**, anywhere in any body.

    D17 puts "Tombstoned processes" in the never-shown block — *excluded
    entirely*, switchable ❌ never — and D56's Whole-records row says how:
    *"absent from the response body, filtered in the query. Never client-side."*

    The caller here is **inside** `dining` and entitled to the department: scope
    is not what refuses them, which is what makes this different from every other
    sweep in this file. The tombstone sits between two active dining processes
    they do receive, so "the body was empty" cannot be why nothing was found —
    `test_a_tombstoned_process_is_withheld_from_a_reader_and_kept_for_the_editor`
    pins the actives explicitly.
    """
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    leaks = _leaks(client, forbidden=TOMBSTONE_TOKENS)
    assert leaks == [], "\n".join(f"  as a {role}: {leak}" for leak in leaks)


def test_the_tombstone_scan_finds_every_token_for_someone_who_may_edit(corpus,
                                                                      tmp_path):
    """The tombstone tokens, proved to bite — the pairing for the scan above.

    The same sweep as an Editor scoped to `dining`, who is entitled to all of it.
    Every `TOMBSTONE_TOKENS` entry must turn up somewhere: one that does not is a
    token no endpoint ever serves, and asserting a Reader never sees it is an
    assertion about nothing. This is what stops the scan above from passing
    because the tombstone was never planted, because the route table stopped
    reading it, or because a filter was applied to *everybody* — which would take
    the record away from the only person who can permanently clear it.
    """
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    leaks = _leaks(client, forbidden=TOMBSTONE_TOKENS)
    missing = {token for token, _ in TOMBSTONE_TOKENS} - {leak.token for leak in leaks}
    assert not missing, (
        f"no endpoint serves {sorted(missing)} even to an Editor of {MINE}, who a"
        f" tombstone is retained for: the fixture, the route table or the filter"
        f" is wrong, and asserting a non-editor never sees them tests nothing")


def test_a_tombstoned_process_is_withheld_from_a_reader_and_kept_for_the_editor(
        corpus, tmp_path):
    """Both directions on the two endpoints that serve a process document.

    A tombstone is a *retained* record, not a deletion, so the filter cannot be
    unconditional: the editing app draws it greyed with the only permanent-delete
    affordance there is. Withheld from a Reader, served to an Editor, and the
    department's **active** processes served to both — the third assertion is
    what stops a filter that emptied the list from passing the scan above.
    """
    on_disk = json.loads(
        (corpus / "departments" / MINE / "processes" / f"{TOMBSTONED}.json")
        .read_text(encoding="utf-8"))
    assert on_disk.get("tombstoned") is True, (
        f"{TOMBSTONED} is not tombstoned on disk, so nothing below is about a"
        f" tombstone")

    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    listed = reader.get(f"/api/departments/{MINE}/processes")
    assert listed.status_code == 200, listed.text
    assert [p["id"] for p in listed.json()] == [f"{MINE}-001", f"{MINE}-002"], (
        "the reader must still receive the department's active processes — a"
        " filter that drops everything passes a scan and serves nobody")
    assert reader.get(f"/api/processes/{TOMBSTONED}").status_code == 404, (
        "404 and not 403 (D56's Existence row): a non-editor must not learn that"
        " this id was ever a process")

    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    assert [p["id"] for p in editor.get(f"/api/departments/{MINE}/processes").json()] == [
        f"{MINE}-001", f"{MINE}-002", TOMBSTONED], (
        "the editor lost the tombstone: it is retained for them, last in id"
        " order (ARD §4.6)")
    got = editor.get(f"/api/processes/{TOMBSTONED}")
    assert (got.status_code, got.json()["tombstoned"]) == (200, True)


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
