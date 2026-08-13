"""Spec D54 — the boundary is the administration surface, not a name in content.

A Reader gets no user list, no user detail, no supervisor picker and no role
list. The one place another person's name legitimately reaches them is inside a
comment they are entitled to read — which does not exist yet, and belongs to P4.

This file is the negative proof of `test_users_api.py`: that file shows the
administration surface *works* for the people it is for, and this one shows it
is not there at all for everybody else. It creates no production code, which is
exactly the kind of file that can go green while proving nothing, so three
things are done deliberately differently from the obvious way of writing it.

**The two refusal statuses are not interchangeable, and each has one right
caller.** `access.requires` checks scope before capability (D56), so a
`dept:dining` Reader is **404** — out of scope, and they must not learn that a
user-administration surface exists — while a `*`-scoped Reader is **403**: in
scope, and merely refused the action. `assert status in (403, 404)` is satisfied
by either, and is also satisfied by a route that does not exist at all: nothing
here mounts an SPA catch-all, so an unrouted path is a bare Starlette 404. Every
404 below is therefore checked **body and all** against `access.NOT_FOUND` —
Starlette's own 404 says `"Not Found"` and would fail it — and every endpoint is
asserted against both callers, one status each.

**A leak scan whose caller can reach nothing proves nothing.** The corpus plants
a *second* real person — `LEAKPERSON`, number `09365550009` — inside `dining`,
the very department the Reader can see, and gives the Reader a real supervisor
and a real confirmed corpus to read. `test_an_entitled_caller_finds_every_token`
runs the same token list against somebody who *may* see all of it and asserts
every token **is** found, so a token nothing ever serves fails loudly instead of
passing silently; `test_the_readers_surface_is_not_empty` asserts the swept
bodies are the real ones rather than a row of 404s.

**One name does reach the Reader, and it is named here rather than hidden.**
`auth.descriptor` reports the caller's own supervisor by number (D47), so the
head's username is in `/api/auth/me` by design. It is asserted to be there — and
asserted to be nowhere else in the sweep, which is the strongest statement this
file can make about it. Their supervisor's *display name* is not served, and is
in the forbidden list.
"""
from __future__ import annotations

import itertools
import json
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import confirmations, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"

#: The department the Reader holds, and the only one anything is planted in that
#: they may read.
MINE = "dining"

#: Every account this installation carries, as (number, display name).
#:
#: The display names are ASCII sentinels for the reason `test_body_scan.py` uses
#: them: a failure message naming `LEAKPERSON` says what leaked at a glance, and
#: none of them can be a substring of the Persian content anybody here is
#: entitled to read. `test_the_corpus_carries_no_token_the_reader_may_read`
#: checks that claim rather than trusting it.
EDITOR, EDITOR_NAME = "09190000000", "SEEDEDITORNAME"
HEAD, HEAD_NAME = "09121110002", "HEADNAME"
OTHER, OTHER_NAME = "09365550009", "LEAKPERSON"
READER, READER_NAME = "09120000005", "READERNAME"
STAR_READER, STAR_READER_NAME = "09120000006", "STARREADERNAME"
ADMIN, ADMIN_NAME = "09120000007", "ADMINNAME"

#: What no response a `dept:dining` Reader can reach may contain, and why.
#:
#: Every one of these is a fact about a *person*. The two `09365550009` rows are
#: the plainest form — another user of the same department, who is neither the
#: caller nor anyone they are entitled to a fact about. The Editor's number is
#: the sharpest: `confirmations._row` serves `confirmed_by`, so a `GET
#: /api/confirmations` gated on `view` rather than on `confirm` would hand every
#: Reader the number of whoever vouched for their department. The head's
#: *display name* is here while their number is not: D47 puts the supervisor's
#: number in the caller's own descriptor deliberately, and nothing serves a
#: Reader anybody's display name at all.
FORBIDDEN: tuple[tuple[str, str], ...] = (
    (OTHER, "the number of another user of the caller's own department"),
    (OTHER_NAME, "that user's display name"),
    (EDITOR, "the number of the Editor who confirmed this department's records"),
    (EDITOR_NAME, "that Editor's display name"),
    (ADMIN, "the number of an administrator"),
    (ADMIN_NAME, "that administrator's display name"),
    (HEAD_NAME, "the display name of the caller's own supervisor — the session"
                " descriptor names a supervisor by number and nothing serves a"
                " Reader anybody's display name; if `auth.descriptor` ever"
                " starts serving display names this correctly fails, and the"
                " fix is to move this token beside SUPERVISOR_TOKEN rather"
                " than delete it, since a supervisor's *number* legitimately"
                " reaches their own supervisee (D47) while a display name"
                " reaches nobody"),
    (STAR_READER, "the number of a Reader in another scope"),
    (STAR_READER_NAME, "that Reader's display name"),
)

#: The one name that legitimately reaches this caller, and the one route that may
#: carry it. `auth.descriptor` reports `supervisor` as a username (D47) because
#: the shell shows who to ask; every *other* body in the sweep is asserted not to
#: carry it, which is what keeps this exception from becoming a hole.
SUPERVISOR_TOKEN = HEAD
SUPERVISOR_ROUTE = "GET /api/auth/me"

_seq = itertools.count()


# --------------------------------------------------------------------------
# The installation
# --------------------------------------------------------------------------

def _cfg(data_root, tmp_path):
    """Settings with the export feature **on**.

    `POST /api/departments/{code}/exports/{kind}` answers 503 with no
    `EXPORT_DIR`, and a 503 body is not the body that route serves. Configured
    here so the sweep walks the real one — and so the published artifact itself
    can be read off disk and scanned, which is the only place in this file where
    a name could reach a Reader through a *file* rather than through a payload.
    `CHROMIUM_PATH` stays unset: the PDF is best-effort and never touches the
    response.
    """
    cfg = cfg_for(data_root, tmp_path / f"reader-{next(_seq)}.db")
    tdir = tmp_path / "templates"
    tdir.mkdir(exist_ok=True)
    for kind in ("steps", "flowchart"):
        (tdir / f"{kind}.html").write_text(
            '<!doctype html><script id="inja-export-data">__INJA_EXPORT_DATA__</script>',
            encoding="utf-8")
    return cfg.__class__(**{**cfg.__dict__, "export_dir": tmp_path / "exports",
                            "export_template_dir": tdir})


def _plant_dining(data_root) -> None:
    """Something real for the Reader to be served.

    The conftest corpus has one process and one overview, both in `cooking`,
    which is a department this caller cannot reach — so without this every body
    in the sweep would be a 404 or an empty list and every assertion in it would
    hold against a backend that leaked freely. Copied from the fixture with its
    ids rewritten rather than authored here, so the documents stay whatever
    `process.schema.json` currently says they are.
    """
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8").replace("cooking-001",
                                                             f"{MINE}-001"))
    doc["department"] = MINE
    doc["pending"] = []
    (data_root / "departments" / MINE / "processes" / f"{MINE}-001.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    overview = json.loads((data_root / "departments" / "cooking"
                           / "overview.json").read_text(encoding="utf-8"))
    overview["department"] = MINE
    (data_root / "departments" / MINE / "overview.json").write_text(
        json.dumps(overview, ensure_ascii=False), encoding="utf-8")


class World:
    """One installation: five accounts, a readable department, and a confirmer.

    A class rather than a `_client_as` helper because every question here is
    about the *relationship* between two people — what the Reader is served
    about the stranger — so a fixture that could only produce one signed-in
    caller would have every test rebuilding the same five rows.
    """

    def __init__(self, data_root, tmp_path):
        self.data_root = data_root
        self.cfg = _cfg(data_root, tmp_path)
        _plant_dining(data_root)
        with self.conn() as conn:
            db.migrate(conn)
            seed.seed(conn, editor_username=EDITOR,
                      editor_display_name=EDITOR_NAME,
                      editor_password_hash=hash_password(PW))
            self.head = self._add(conn, HEAD, HEAD_NAME, "reader", "dept:dining",
                                  can_supervise=True)
            #: The second person in the caller's own department. Not their
            #: supervisor, so nothing about them is anything the Reader is owed.
            self.other = self._add(conn, OTHER, OTHER_NAME,
                                      "reader_no_download", "dept:dining",
                                      supervisor_id=self.head)
            self.reader = self._add(conn, READER, READER_NAME, "reader",
                                    "dept:dining", supervisor_id=self.head)
            self.star_reader = self._add(conn, STAR_READER, STAR_READER_NAME,
                                         "reader", "*")
            self.admin = self._add(conn, ADMIN, ADMIN_NAME, "admin", "*")
            # D22: without a valid confirmation every body a scoped Reader gets
            # is empty, and every assertion in this file would pass against a
            # backend that leaks everything. The Editor is the confirmer, which
            # is what puts their number in `confirmations._row.confirmed_by` and
            # makes `EDITOR` a token the sweep can actually find.
            for target, rel in ((MINE, "overview.json"),
                                (f"{MINE}-001", f"processes/{MINE}-001.json")):
                doc = json.loads((data_root / "departments" / MINE / rel)
                                 .read_text(encoding="utf-8"))
                confirmations.set_confirmation(conn, target=target,
                                               fingerprint=fingerprint(doc),
                                               by=EDITOR, at=1770000000)
        self.app = create_app(self.cfg)

    @contextmanager
    def conn(self):
        """A connection of the test's own — never the app's. The service holds
        one shared connection and may open no transaction on it (`db.connect`)."""
        conn = db.connect(self.cfg.app_db)
        try:
            yield conn
        finally:
            conn.close()

    def _add(self, conn, username: str, display: str, role: str, *scopes: str,
             can_supervise: bool = False, supervisor_id: int | None = None) -> int:
        """An account written straight to the store, bypassing the API.

        Bypassing on purpose: a file about a Reader being refused every write
        must not need those writes to have worked in order to have anybody to be
        refused about.
        """
        rid = conn.execute("SELECT id FROM roles WHERE name = ?",
                           (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name=display,
                           password_hash=hash_password(PW), role_id=rid,
                           supervisor_id=supervisor_id,
                           can_supervise=can_supervise)
        users.set_scopes(conn, uid, sorted(set(scopes)))
        return uid

    def role_id(self, name: str) -> int:
        with self.conn() as conn:
            return conn.execute("SELECT id FROM roles WHERE name = ?",
                                (name,)).fetchone()[0]

    def row(self, user_id: int) -> dict:
        with self.conn() as conn:
            return dict(users.by_id(conn, user_id))

    def rows(self) -> list[dict]:
        with self.conn() as conn:
            return [dict(r) for r in
                    conn.execute("SELECT * FROM users ORDER BY id")]

    def live_sessions(self, user_id: int) -> int:
        with self.conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE user_id = ?"
                " AND revoked_at IS NULL", (user_id,)).fetchone()[0]

    def sign_in(self, username: str) -> TestClient:
        client = TestClient(self.app, base_url=BASE)
        r = client.post("/api/auth/login",
                        json={"username": username, "password": PW})
        assert r.status_code == 200, r.text
        return client


@pytest.fixture
def world(data_root, tmp_path):
    return World(data_root, tmp_path)


# --------------------------------------------------------------------------
# The administration surface: eight endpoints, two callers, one status each
# --------------------------------------------------------------------------

def _every_user_endpoint(world: World) -> list[tuple[str, str, dict | None]]:
    """All eight, with a body that would really succeed for somebody entitled.

    Well-formed and *acceptable* on purpose: a malformed body is refused by
    validation on some routes and by the gate on others, so a refusal table built
    on one would be comparing validators rather than gates — and the body sweep
    below would walk error envelopes instead of payloads. The disable is last,
    because everything above it needs the account it names to still be live.
    """
    return [
        ("GET", "/api/users", None),
        ("GET", "/api/users/supervisor-candidates", None),
        ("GET", f"/api/users/{world.other}", None),
        ("GET", "/api/roles", None),
        ("POST", "/api/users", {"username": "09129999999", "displayName": "تازه",
                                "password": PW, "roleId": world.role_id("reader"),
                                "scopes": ["*"], "supervisorId": None}),
        ("PATCH", f"/api/users/{world.other}", {"displayName": OTHER_NAME}),
        ("POST", f"/api/users/{world.other}/password", {"password": PW}),
        ("POST", f"/api/users/{world.other}/disabled", {"disabled": True}),
    ]


def test_a_department_reader_is_404_on_every_user_endpoint(world):
    """The scope half of the partition, on the caller who can prove it.

    This Reader is refused by **both** halves — no `manage_users` and no `*` —
    and `requires` checks scope first, so they are answered 404: a department
    head must not learn that user administration is a thing that exists here
    (D54). A caller who merely lacked the scope while holding the capability
    would be answered 404 whichever order the gate checked in, and would pin
    nothing.

    The **body** is asserted, not only the status. Nothing in this test app
    mounts the SPA catch-all, so an unrouted path answers Starlette's own
    `{"detail": "Not Found"}` — which means a status-only assertion here passes
    just as well against a service with no user endpoints at all.
    """
    client = world.sign_in(READER)
    for method, path, body in _every_user_endpoint(world):
        r = client.request(method, path, json=body)
        assert r.status_code == 404, (
            f"{method} {path} answered {r.status_code} to a dept:dining Reader:"
            f" a 403 here says the surface exists and is merely refusing them")
        assert r.json() == {"detail": NOT_FOUND}, (
            f"{method} {path} answered a 404 that is not the gate's own:"
            f" {r.text} — an unrouted path answers this way too")


def test_a_wildcard_reader_is_403_on_every_user_endpoint(world):
    """The capability half, and the other end of the pair.

    `*` puts this caller inside the target, so scope cannot refuse them and only
    `manage_users` can — with 403, because they can see the surface and merely
    may not act. Together with the test above this says *which* of the two
    refusals belongs to whom; either one alone is satisfied by a gate that got
    the other wrong.
    """
    client = world.sign_in(STAR_READER)
    for method, path, body in _every_user_endpoint(world):
        r = client.request(method, path, json=body)
        assert r.status_code == 403, (
            f"{method} {path} answered {r.status_code} to a `*` Reader: a 404"
            f" here means the route is gated on a target they do hold")


def test_neither_refused_reader_writes_anything(world):
    """Status codes alone cannot see this.

    A gate that ran *beside* the work rather than before it — a handler that
    created the account and then refused — satisfies every assertion above. So
    the `users` table is compared row for row across both refused callers, and
    the sessions of the account the disable names are counted: `set_user_disabled`
    revokes every one of them, so a disable that half-happened is visible here
    and nowhere else.

    `OTHER` signs in **before** `live` is captured, so the count this compares
    against is genuinely non-zero. Nothing else in this file ever signs `OTHER`
    in — without this, `live` is `0` because there is nothing to revoke, and
    `live_sessions(world.other) == live` is `0 == 0`, which no disable, half-happened
    or otherwise, can ever fail.
    """
    world.sign_in(OTHER)
    before = world.rows()
    live = world.live_sessions(world.other)
    assert live > 0, (
        "OTHER holds no live session, so the count below cannot see a disable"
        " that revoked it")
    for who in (READER, STAR_READER):
        client = world.sign_in(who)
        for method, path, body in _every_user_endpoint(world):
            client.request(method, path, json=body)
    assert world.rows() == before, "a refused request wrote to the users table"
    assert world.live_sessions(world.other) == live, (
        "a refused disable revoked the target's sessions")


def test_an_unauthenticated_caller_reaches_none_of_it(world):
    """401 belongs to neither half of the partition and must not be lost when a
    session gate becomes a capability gate."""
    client = TestClient(world.app, base_url=BASE)
    for method, path, body in _every_user_endpoint(world):
        r = client.request(method, path, json=body)
        assert r.status_code == 401, f"{method} {path} answered {r.status_code}"


# --------------------------------------------------------------------------
# The surface a Reader *can* reach
# --------------------------------------------------------------------------

def _reader_surface(world: World) -> list[tuple[str, str, dict | None, int]]:
    """Every route a `dept:dining` Reader can address, and what it answers them.

    The status is part of the table for `test_body_scan.py`'s reason: a scan that
    only ever walked error envelopes is a scan of nothing, and five routes there
    were once sent bodies that could not pass validation and answered 422 to
    everybody for months. Here it also carries a claim of its own — that this
    caller really is being *served* (200 on four routes with content behind
    them), so the absence of a name in those bodies means something.

    The eight administration endpoints are appended because a refusal is a
    response a Reader can reach too, and a 404 whose body named what was refused
    would be the leak.
    """
    return [
        ("GET", "/api/auth/me", None, 200),
        ("GET", "/api/departments", None, 200),
        ("GET", f"/api/departments/{MINE}/overview", None, 200),
        ("GET", f"/api/departments/{MINE}/processes", None, 200),
        ("GET", f"/api/processes/{MINE}-001", None, 200),
        # Gated on `edit`, which no Reader holds, and in scope — so 403.
        ("GET", f"/api/departments/{MINE}/next-id", None, 403),
        # `confirm`, likewise — and this is the route whose success body carries
        # `confirmed_by`, i.e. another person's number.
        ("GET", f"/api/confirmations?department={MINE}", None, 403),
        # Filtered rather than gated: `edit` nowhere, so an empty list.
        ("GET", "/api/pending", None, 200),
        # Gated on `set_visibility` at `*`: out of scope, so 404.
        ("GET", "/api/visibility", None, 404),
        # `export_pdf`, which a Reader does hold. Both kinds: the fixture
        # writes a template for each, and `flowchart` is a second, independent
        # render of the same payload rather than a shape covered by `steps`.
        ("POST", f"/api/departments/{MINE}/exports/steps", None, 200),
        ("POST", f"/api/departments/{MINE}/exports/flowchart", None, 200),
        # The writes they may attempt and be refused.
        ("PUT", f"/api/departments/{MINE}/overview", {}, 403),
        ("PUT", f"/api/processes/{MINE}-001", {}, 403),
    ] + [(m, p, b, 404) for m, p, b in _every_user_endpoint(world)]


def _call(client, method, path, body):
    return client.request(method, path, json=body)


def test_the_readers_surface_is_not_empty(world):
    """The premise of every scan below: this caller is really being served.

    A sweep whose every body is `{"detail": "یافت نشد"}` satisfies every leak
    assertion in this file while the backend hands out the whole staff list. The
    statuses are the first half of the guard and the content is the second: the
    board names the department, the listing carries the process, the document
    carries its nodes and the export produces an artifact.
    """
    client = world.sign_in(READER)
    wrong = []
    for method, path, body, expect in _reader_surface(world):
        r = _call(client, method, path, body)
        if r.status_code != expect:
            wrong.append(f"  {method} {path}: expected {expect}, got"
                         f" {r.status_code} — {r.text[:200]}")
    assert not wrong, ("these routes did not answer what this file assumes they"
                       " answer a Reader:\n" + "\n".join(wrong))

    board = client.get("/api/departments").json()
    assert [d["code"] for d in board] == [MINE], board
    assert board[0]["count"] == 1, (
        f"the Reader's own department serves no records: {board}")
    listing = client.get(f"/api/departments/{MINE}/processes").json()
    assert [d["id"] for d in listing] == [f"{MINE}-001"], listing
    doc = client.get(f"/api/processes/{MINE}-001").json()
    assert doc["nodes"], "the process document served is empty"
    assert client.get(f"/api/departments/{MINE}/overview").json()["department"] == MINE


def _texts(value, path="$"):
    """Every string in a decoded body, with where it was found — keys included.

    Keys as well as values, because a leak can be a key, and every scalar
    stringified, because a number can arrive as a field or inside a sentence.
    `test_body_scan.py`'s walker, kept separate rather than imported: that file's
    is about departments and this one's about people, and a shared one would make
    a change for one a change for both.
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


def _leaks(client, calls, tokens) -> list[tuple[str, str]]:
    """Every forbidden token found in every body these calls return.

    `(token, one line saying where)`, because the two callers of this function
    want different halves: the scoped Reader's tests want the lines, and
    `test_an_entitled_caller_finds_every_token` wants the set of tokens that
    were reachable at all.
    """
    found: list[tuple[str, str]] = []
    for method, path, body, _expect in calls:
        r = _call(client, method, path, body)
        try:
            doc = r.json()
        except ValueError:
            doc = r.text
        pairs = list(_texts(doc))
        raw = json.dumps(doc, ensure_ascii=False)
        for token, why in tokens:
            hits = [(where, text) for where, text in pairs if token in text]
            if token in raw and not hits:
                # Unreachable while the walker reaches every string a JSON body
                # can hold. It stays because "the scan looked and found nothing"
                # must never be able to mean "the walker did not go there".
                hits = [("$ — somewhere the walker did not reach", raw)]
            found += [(token,
                       f"{method} {path} → {r.status_code} named {token!r}"
                       f" ({why}) at {where} = {text[:120]!r}")
                      for where, text in hits]
    return found


def test_the_corpus_carries_no_token_the_reader_may_read(world):
    """A hit is a leak, never a substring.

    If a token were also part of something the Reader is entitled to read — a
    number inside a process description, a name inside the registry — the scan
    below would fail for a reason that has nothing to do with the backend, and
    this is where that is diagnosed in one line instead of in a false alarm.
    """
    served = (world.data_root / "departments" / "registry.json").read_text(
        encoding="utf-8")
    for path in sorted((world.data_root / "departments" / MINE).rglob("*.json")):
        served += path.read_text(encoding="utf-8")
    for token, why in FORBIDDEN + ((SUPERVISOR_TOKEN, "the supervisor"),):
        assert token not in served, (
            f"{token!r} ({why}) is part of what a {MINE} Reader may legitimately"
            f" read, so a scan finding it proves nothing: pick another token")


def test_no_response_a_reader_can_reach_names_another_user(world):
    """D54, as one sweep: not the list, not the detail, not the picker — and not
    a name arriving sideways through content, an export or a refusal body.

    The Editor's number is the one to read this test by. It really is stored
    against this department — they are the account that confirmed it — and
    `confirmations._row` serves it as `confirmed_by`, so the only thing keeping
    it away from this caller is that `GET /api/confirmations` is gated on
    `confirm`. `test_an_entitled_caller_finds_every_token` is the proof that the
    sweep would notice if it were not.

    **Both Readers, not only the `dept:dining` one.** The `*`-scoped Reader is a
    Reader too (D54's other half, pinned by `test_a_wildcard_reader_is_403_on_every_user_endpoint`),
    and their refusal on the eight administration endpoints is a 403, not a 404
    — a body a caller with no scope restriction still has to be handed
    something for. A `_refuse` (or a gate) that started interpolating the
    target's own display name into that detail would be a real leak — the
    string is static Persian today, which is exactly why nothing would notice
    if it stopped being static — and it is swept here rather than left to the
    `dept:dining` Reader's sweep above, which never reaches these bodies at all
    (theirs are 404s, refused on scope before capability is ever asked).
    """
    client = world.sign_in(READER)
    leaks = _leaks(client, _reader_surface(world), FORBIDDEN)
    assert leaks == [], "\n".join(f"  {line}" for _, line in leaks)

    star_client = world.sign_in(STAR_READER)
    star_admin_calls = [(m, p, b, 403) for m, p, b in _every_user_endpoint(world)]
    leaks = _leaks(star_client, star_admin_calls, FORBIDDEN)
    assert leaks == [], "\n".join(f"  {line}" for _, line in leaks)


def test_the_published_export_names_nobody_either(world):
    """The artifact on disk, not only the `{"url": …}` that announces it.

    `POST …/exports/{kind}` returns two fields, so a name embedded in the
    published page itself is invisible to the sweep above. The file is read back
    and scanned as text: it carries the department's confirmed documents, and
    "who confirmed them" is exactly the kind of provenance a builder adds to a
    footer without anyone thinking of it as a person's number.

    Both kinds, not only `steps`: the fixture writes a template for `flowchart`
    too, and a leak that only ever lands in one kind's payload would be invisible
    to a sweep that never asks for the other.

    The emptiness guard checks for a **token out of the payload**
    (`f"{MINE}-001"`, the process id `build_payload` embeds), not a length. The
    template's own unsubstituted literal is 74 characters — longer than the
    50-odd of `'<!doctype html><script id="inja-export-data">'` a length
    comparison used to check against — so a length guard passes on a page whose
    `__INJA_EXPORT_DATA__` slot was never replaced at all; asserting the slot is
    gone and a real payload token is present cannot be satisfied by that page.

    Both Readers publish it, not only the `dept:dining` one: the artifact is
    built caller-independently (`build_payload`'s own contract — "the same for
    every caller"), so the two are expected to produce the same bytes, but a
    Reader who never posts an export cannot be the file that notices if that
    guarantee ever quietly grew a caller-specific branch.
    """
    for who in (READER, STAR_READER):
        client = world.sign_in(who)
        for kind in ("steps", "flowchart"):
            r = client.post(f"/api/departments/{MINE}/exports/{kind}")
            assert r.status_code == 200, r.text
            url = r.json()["url"]
            written = world.cfg.export_dir / url[len("/exports/"):]
            page = written.read_text(encoding="utf-8")
            assert "__INJA_EXPORT_DATA__" not in page, (
                f"the published {kind} artifact still carries the unsubstituted"
                f" template slot")
            assert f'"{MINE}-001"' in page, (
                f"the published {kind} artifact carries no process id, so an"
                f" empty payload would pass the checks below")
            for token, why in FORBIDDEN + ((SUPERVISOR_TOKEN, "the caller's supervisor"),):
                assert token not in page, (
                    f"the published {kind} export names {token!r} ({why})")


def test_an_entitled_caller_finds_every_token(world):
    """The scan, proved to bite — permanently, and not once by hand.

    Every token in `FORBIDDEN` must turn up somewhere for somebody who may see
    it. One that does not is a token no endpoint ever serves, and asserting a
    Reader never sees it is an assertion about nothing — which is how a fixture
    that was never planted, a display name that was renamed, or a corpus that
    stopped being confirmed turns this whole file green while proving nothing.

    Two callers, because the tokens are served by two different surfaces: the
    `*` Admin reaches the user-administration reads, and the Editor is the only
    one who reaches `GET /api/confirmations`, which is the sole route in the
    service that names the person who vouched for a document.
    """
    admin_calls = [(m, p, b, 200) for m, p, b in _every_user_endpoint(world)
                   if m == "GET"]
    editor_calls = [("GET", f"/api/confirmations?department={MINE}", None, 200)]
    seen = set()
    for who, calls in ((ADMIN, admin_calls), (EDITOR, editor_calls)):
        client = world.sign_in(who)
        for method, path, body, expect in calls:
            r = _call(client, method, path, body)
            assert r.status_code == expect, (
                f"{method} {path} answered {who} {r.status_code}: this sweep"
                f" produces no body to find anything in")
        seen |= {token for token, _ in _leaks(client, calls, FORBIDDEN)}
    missing = {token for token, _ in FORBIDDEN} - seen
    assert not missing, (
        f"no endpoint serves {sorted(missing)} even to a caller entitled to"
        f" everything, so asserting a Reader never sees them tests nothing:"
        f" fix the corpus or the sweep")


# --------------------------------------------------------------------------
# The caller's own record, and the one name that reaches them
# --------------------------------------------------------------------------

def test_a_readers_own_session_still_tells_them_about_themselves(world):
    """Not a leak: it is their own record, and the shell needs it (D47).

    Read from the fixture, never from a counter. An assertion of the form
    `body["username"] == "09120000009"` is right only while a module-global
    `itertools.count()` shared with every other test in the file happens to sit
    at 9 — and is silently satisfied when the caller's own number *is* the token
    a leak test was scanning for.
    """
    client = world.sign_in(READER)
    body = client.get("/api/auth/me").json()
    assert body["username"] == READER
    assert body["displayName"] == READER_NAME
    assert body["role"] == "reader"
    assert body["scopes"] == [f"dept:{MINE}"]
    assert "manage_users" not in body["capabilities"]
    # Their own record and nobody else's: the descriptor carries no other
    # account's fields, and the one name it does carry is the next test's.
    assert set(body) == {"username", "displayName", "role", "capabilities",
                         "scopes", "supervisor", "canSupervise",
                         "pendingApprovals"}


def test_the_only_other_person_a_reader_is_told_of_is_their_own_supervisor(world):
    """D47's deliberate exception, pinned from both sides.

    The descriptor names the caller's supervisor by number, because the shell
    shows a Reader who to ask. That is the whole of it: the number appears on
    `/api/auth/me` and on no other route this caller can reach, and their
    supervisor's display name appears nowhere at all (it is in `FORBIDDEN`).
    Asserting only the absence would be satisfied by a descriptor that had
    stopped reporting a supervisor; asserting only the presence would be
    satisfied by one that reported it everywhere.
    """
    client = world.sign_in(READER)
    assert client.get("/api/auth/me").json()["supervisor"] == HEAD

    elsewhere = [(m, p, b, e) for m, p, b, e in _reader_surface(world)
                 if f"{m} {p}" != SUPERVISOR_ROUTE]
    leaks = _leaks(client, elsewhere, ((SUPERVISOR_TOKEN, "the supervisor"),))
    assert leaks == [], "\n".join(f"  {line}" for _, line in leaks)


# --------------------------------------------------------------------------
# The stored hash, for anybody at all
# --------------------------------------------------------------------------

def test_no_body_any_caller_can_reach_carries_a_password_hash(world):
    """`SELECT *` rows carry `password_hash`, so a projection is the only guard.

    `users.by_id`, `list_users`' query and `delegation.eligible_supervisors` all
    return the whole row. `routers/users._user` and `._candidate` name their
    fields one at a time for exactly this reason, and a `dict(row)` in either
    would publish the table's hashes to everybody holding `manage_users` — and,
    the day somebody widens a gate, to everybody else.

    Both callers, because they fail differently: the Admin is the one who
    *reaches* the projections, and the Reader is the one for whom a widened gate
    would turn a refusal into a body. Every account's real stored hash is
    checked, not a hash recomputed here: argon2 is salted, so a recomputed one
    would match nothing and the test would pass against a service publishing all
    of them.
    """
    hashes = [(row["password_hash"], f"the stored hash of {row['username']}")
              for row in world.rows()]
    assert len(hashes) == 6 and all(h.startswith("$argon2") for h, _ in hashes), (
        f"the fixture has no argon2 hashes to look for: {hashes}")
    tokens = tuple(hashes) + (("password_hash", "the column name"),
                              ("passwordHash", "its camel-cased form"),
                              ("$argon2", "any argon2 hash at all"))

    reader = world.sign_in(READER)
    leaks = _leaks(reader, _reader_surface(world), tokens)
    admin = world.sign_in(ADMIN)
    leaks += _leaks(admin, [(m, p, b, 0) for m, p, b in _every_user_endpoint(world)],
                    tokens)
    assert leaks == [], "\n".join(f"  {line}" for _, line in leaks)


def test_the_administration_bodies_that_were_swept_were_real_ones(world):
    """The other half of the hash sweep: those eight calls really succeeded.

    A sweep of eight refusals finds no hash in any of them and says nothing at
    all. This is the same guard `test_the_readers_surface_is_not_empty` gives the
    Reader's side, for the caller who reaches the projections that carry the
    risk.
    """
    client = world.sign_in(ADMIN)
    expected = [200, 200, 200, 200, 201, 200, 204, 200]
    got = [_call(client, m, p, b).status_code
           for (m, p, b) in _every_user_endpoint(world)]
    assert got == expected, (
        f"the Admin's sweep did not produce the bodies it exists to walk: {got}")
