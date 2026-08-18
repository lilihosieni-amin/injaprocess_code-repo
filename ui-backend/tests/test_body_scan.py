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
  that was never planted, fails loudly instead of passing silently. That guard
  is about the wildcard holder; D22 opened the same hole for the **scoped**
  ones, whose every body is empty until an Editor has confirmed something, so
  `_client_as` confirms this corpus and
  `test_a_reader_is_served_the_confirmed_processes` is where a corpus that
  stopped being confirmed is diagnosed.
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
from inja_ui_backend import db, seed, visibility
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.disclosure import Disclosure
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import confirmations, policy, users
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
    ("cooking-777-n010",
     "a node id from a process outside the caller's scope, named by a link"),
    ("cooking-888",
     "the id of a process outside the caller's scope that is named ONLY by a"
     " link from inside it — no route serves this document at all"),
)

#: The cross-department link, planted **inside** the caller's own department.
#:
#: The corpus used to have none, and that single omission is why the whole class
#: survived to the final review: every process it planted was an island, so the
#: scan could not tell a backend that redacts links from one that hands them out.
#: They are a first-class fact here — `routers/processes.delete_process` sweeps
#: all nine departments precisely because another department's node may name a
#: process as its `subprocess`, or a child may sit elsewhere — so an island
#: corpus is not the shape production is.
#:
#: `FOREIGN_CHILD` deliberately names a document that **does not exist**. What is
#: withheld is the id, not the file: derive the department by loading the
#: referenced process and a caller learns which of their guesses are real from
#: which links survive, which is the disclosure the redaction exists to close.
FOREIGN_PARENT = f"{THEIRS}-777"
FOREIGN_PARENT_NODE = f"{FOREIGN_PARENT}-n010"
FOREIGN_CHILD = f"{THEIRS}-888"

#: The in-department link, planted beside it on `dining-002`.
#:
#: Without it a filter that blanked **every** link would pass every assertion
#: below while quietly taking the sub-process graph away from the people it is
#: for. What is under test is the department an id names, never the presence of
#: a link.
LOCAL_CHILD = f"{MINE}-001"

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

#: The contents of an unresolved proposal on a process **inside** the caller's
#: own department — checked against capability, exactly like `TOMBSTONE_TOKENS`
#: and for a reason of the same shape.
#:
#: D17 puts `pending` in the never-shown block with no switch, and D56 puts even
#: its *count* in the derived-signals row: `/api/pending` answers `[]` to a
#: non-editor and the board omits the `conflicts` key for them — while the two
#: document endpoints served those same callers the proposals themselves. A
#: withheld count beside a served proposal is not a policy, it is an oversight
#: with a test.
#:
#: One sentinel covers both the `proposed` value and the `source` it came from,
#: because `_process` derives the second from the first; a leak of either names
#: it. `current` and `field` are the caller's own actor and the string `actor`,
#: which are legitimate content elsewhere in the same document and so cannot be
#: sentinels — the emptiness of the array is what
#: `test_pending_is_emptied_rather_than_dropped_for_a_non_editor` pins directly.
PENDING_TOKENS: tuple[tuple[str, str], ...] = (
    ("MINEPROPOSED",
     "the proposed value, and the run it came from, of an unresolved proposal"
     " (D17: never shown; D56: not even its count)"),
)

#: The fields D17 hides from a non-editor by default, planted inside the
#: caller's own department.
#:
#: Checked against **capability**, exactly like `TOMBSTONE_TOKENS`, and never
#: added to `FORBIDDEN`: an Editor of dining sees all of these legitimately, so
#: `test_no_role_is_served_anything_outside_its_scope_anywhere_in_any_body`
#: would fail for the `editor` parameter over content that role is entitled to.
#:
#: `MINEA` is `dining-001` and `MINEB` is `dining-002`, so a leak names the
#: document as well as the switch.
HIDDEN_FIELD_TOKENS: tuple[tuple[str, str], ...] = (
    ("MINEASUMMARY", "the process summary of dining-001 (D17: hidden by default)"),
    ("MINEAIDEF0", "the process IDEF0 record of dining-001 (D17: hidden)"),
    ("MINEAKPI", "a process KPI of dining-001 (D17: hidden)"),
    ("MINEAICOM", "a node's ICOM on dining-001 (D17: hidden)"),
    ("MINEASOURCE", "a node's provenance on dining-001 (D17: never shown)"),
    ("MINEBSUMMARY", "the process summary of dining-002"),
)

#: The two D17 shows by default, planted in the same documents.
#:
#: The other direction, and it is the half that stops the filter from becoming
#: 'blank everything': a filter that took these away would satisfy every
#: assertion above while emptying the flowchart for the people it is for.
SHOWN_FIELD_TOKENS: tuple[tuple[str, str], ...] = (
    ("MINEADESC", "a node's description on dining-001 (D17: visible by default)"),
    ("MINEBDESC", "a node's description on dining-002"),
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
             proposed: str, tag: str, parent: dict | None = None,
             subprocess: str | None = None) -> dict:
    """A process of the fixture's shape, with every string under this file's control.

    `tag` is this document's field-sentinel prefix: every field the visibility
    policy can hide carries `{tag}` plus the field's name, so a leak names both
    the document it came from and the switch that should have stopped it.

    Authored rather than copied from `tests/fixtures/process.cooking-001.json`:
    that document contains «انبار» and «حسابداری», which are two departments'
    display names, so a copy of it planted in `dining` would trip this file's own
    token list and read as a backend leak.

    `parent` and `subprocess` are the two links a process can carry, and both are
    parameters rather than constants because a corpus that hard-codes them to
    `None` — which this one did — cannot tell a backend that withholds a
    cross-department link from one that serves it.

    The proposal's `source` is derived from `proposed` so that one sentinel names
    both: a `pending` entry leaks its origin as readily as its value, and two
    tokens for one array would only mean two ways to forget one.
    """
    node = f"{pid}-n010"
    return {
        "id": pid, "department": dept, "name": name,
        "summary": f"{tag}SUMMARY",
        "source": {"type": "manual", "ref": None, "run": None},
        "parent": parent,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [f"{tag}IDEF0"], "controls": [], "outputs": [],
                  "mechanisms": []},
        "kpis": [{"name": f"{tag}KPI"}],
        "nodes": [
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 30, "y": 100}, "layout": "auto"},
            {"id": node, "type": "activity", "label": label, "actor": actor,
             "description": f"{tag}DESC", "subprocess": subprocess,
             "icom": {"inputs": [f"{tag}ICOM"], "controls": [], "outputs": [],
                      "mechanisms": []},
             "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": f"runs/{tag}SOURCE", "touched_by": []}},
            {"id": "end", "type": "end", "label": "پایان",
             "position": {"x": 320, "y": 100}, "layout": "auto"},
        ],
        "edges": [{"from": "start", "to": node, "label": ""},
                  {"from": node, "to": "end", "label": ""}],
        "pending": [{"node": node, "field": "actor", "current": actor,
                     "proposed": proposed, "source": f"runs/{proposed}",
                     "status": "open"}],
    }


#: The three things this corpus plants inside `MINE` that a `MINE` caller is
#: nonetheless not entitled to: the two cross-department links and the contents
#: of an unresolved proposal.
WITHHELD_IN_SCOPE = ("parent", "nodes[].subprocess", "pending")


def _entitled(doc: dict) -> dict:
    """`doc` reduced to what a `MINE` reader may legitimately read.

    The premise test below serialises the in-scope corpus and asserts no
    forbidden token is in it, so that a scan finding one proves a leak rather
    than a substring. That premise used to be free, because everything planted
    in `dining` was content a dining caller could have. It is not free any more:
    the corpus now deliberately plants withheld content **inside** the caller's
    own department — the very thing C1 and C2 were about — so `dining-001.json`
    on disk really does contain `cooking-777`.

    `WITHHELD_IN_SCOPE` is exactly what the backend must blank, so removing it
    here is not special-casing an inconvenience: what is left is the caller's
    entitlement, and a forbidden token found in *that* would still mean the scans
    below prove nothing. The premise test asserts this function did not simply
    empty the document, which is the way this could go quietly wrong.

    A link is dropped only when it names a department other than `MINE` —
    written independently of the implementation, and by the same lexical rule:
    the department is the id's own prefix, and nothing is opened to find out.
    An in-department link is content this caller *is* entitled to, and keeping
    it here is what lets the premise test notice a `_entitled` that has quietly
    become "strip everything".
    """
    def foreign(ref) -> bool:
        return not (isinstance(ref, str) and ref.rsplit("-", 1)[0] == MINE)

    out = {k: v for k, v in doc.items() if k != "pending"}
    if isinstance(doc.get("parent"), dict) and foreign(doc["parent"].get("process")):
        out["parent"] = None
    out["nodes"] = [
        {**n, "subprocess": None}
        if isinstance(n, dict) and n.get("subprocess") is not None
        and foreign(n["subprocess"]) else n
        for n in doc.get("nodes", [])
    ]
    return out


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
                   actor="TOMBACTOR", proposed="TOMBPROPOSED", tag="TOMB")
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

    In scope: a dining overview and two dining processes, each carrying an
    **open** conflict. The conflict is what makes `/api/pending` and the board's
    count say anything at all — without it, a `/api/pending` filtered on `view`
    instead of `edit` would answer `[]` to a Reader and the test asserting `[]`
    would pass on the wrong implementation. `dining-001`'s proposal carries the
    `MINEPROPOSED` sentinel, because the proposal is served by two *document*
    endpoints as well as counted by a third, and the contents were reaching a
    Reader from both while the count was withheld three lines away.

    Also in scope and **linked out of the department**: `dining-001` hangs under
    a node of `cooking-777` and one of its own nodes names `cooking-888` as a
    sub-process. Those are the only reason C1's whole class is testable from
    here; a corpus of islands is what let it survive to the final review.
    `dining-002` carries an in-department link to `dining-001` beside it, so a
    filter that blanked every link fails instead of passing.

    The two links are deliberately **not** each other's mirror — `dining-001`'s
    parent is in cooking while `dining-002` claims it as a sub-process — because
    what is under test is the department each id names, not the consistency of
    the graph, and nothing in this service reads one link to validate the other.

    Also in scope and **tombstoned**: `dining-003`, carrying this file's
    `TOMB…` sentinels. It sits beside two *active* dining processes on purpose —
    a filter that dropped the whole department would satisfy "the reader never
    saw the tombstone" while serving nothing at all, so
    `test_a_tombstoned_process_is_withheld_from_a_reader_and_kept_for_the_editor`
    asserts the two actives are still there. `_client_as` vouches for it like
    everything else in the department, so what withholds it from a reader is the
    tombstone and not an absent confirmation.

    Out of scope: the fixture's `cooking-001`, a second `cooking-777` carrying
    this file's four sentinels, and a `logistics` process so the board has a
    second department to leak.
    """
    _write(data_root, MINE, "overview.json", _overview(MINE, "دپارتمان سالن"))
    _write(data_root, MINE, "processes/dining-001.json",
           _process("dining-001", MINE, name="پذیرایی از مهمان",
                    label="خوش‌آمدگویی", actor="میزبان", proposed="MINEPROPOSED",
                    tag="MINEA",
                    parent={"process": FOREIGN_PARENT, "node": FOREIGN_PARENT_NODE},
                    subprocess=FOREIGN_CHILD))
    _write(data_root, MINE, "processes/dining-002.json",
           _process("dining-002", MINE, name="ترخیص میز",
                    label="تسویه", actor="میزبان", proposed="پیشخدمت",
                    tag="MINEB", subprocess=LOCAL_CHILD))
    _write(data_root, MINE, f"processes/{TOMBSTONED}.json",
           _tombstone(TOMBSTONED, MINE))
    _write(data_root, THEIRS, "processes/cooking-777.json",
           _process("cooking-777", THEIRS, name="LEAKNAME", label="LEAKLABEL",
                    actor="LEAKACTOR", proposed="LEAKPROPOSED", tag="LEAKF"))
    _write(data_root, "logistics", "processes/logistics-005.json",
           _process("logistics-005", "logistics", name="بارگیری",
                    label="تحویل", actor="راننده", proposed="پیک", tag="LOGF"))
    PLANTED_FINGERPRINT.clear()
    for d in (MINE, THEIRS):
        path = data_root / "departments" / d / "processes" / f"{d}-001.json"
        if path.is_file():
            PLANTED_FINGERPRINT[d] = fingerprint(
                json.loads(path.read_text(encoding="utf-8")))
    return data_root


def test_the_in_scope_corpus_carries_no_forbidden_token(corpus):
    """The premise of every scan below: a hit is a leak, never a substring.

    If a token were also part of something the dining caller is entitled to read
    — a department display name inside a Persian word, an id inside a summary —
    the scans would fail for a reason that has nothing to do with the backend.
    This is where that is diagnosed, in one line, instead of in a false alarm.

    "Entitled to read" is `_entitled`, not the raw file: the corpus now plants
    withheld content inside the caller's own department on purpose, so
    `dining-001.json` really does hold `cooking-777` and `MINEPROPOSED`. The
    second assertion is what keeps that from becoming a way to pass — a
    `_entitled` that returned `{}` would satisfy every token check here and
    silence the premise entirely.
    """
    registry = json.loads(
        (corpus / "departments" / "registry.json").read_text(encoding="utf-8"))
    served = json.dumps(
        [_entitled(json.loads(p.read_text(encoding="utf-8")))
         for p in sorted((corpus / "departments" / MINE).rglob("*.json"))]
        # …and the caller's own row of the registry, read rather than restated:
        # the board serves the department's display name, and a copy of it here
        # would stop checking the real one the day the registry changed.
        + [d for d in registry["departments"] if d["code"] == MINE],
        ensure_ascii=False)
    for token, why in FORBIDDEN + PENDING_TOKENS:
        assert token not in served, (
            f"{token!r} ({why}) is part of what a {MINE} caller may legitimately"
            f" read, so a scan finding it proves nothing: pick another token or"
            f" change the fixture")

    for kept in ("dining-001", "dining-002", "پذیرایی از مهمان", "خوش‌آمدگویی",
                 LOCAL_CHILD, "دپارتمان سالن"):
        assert kept in served, (
            f"{kept!r} is gone from the entitled corpus: `_entitled` is stripping"
            f" more than {list(WITHHELD_IN_SCOPE)}, so the absence of every token"
            f" above says nothing about anything")


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
        # D22 — without a confirmation every body a scoped reader gets is empty,
        # and every leak assertion in this file would pass against a backend that
        # leaks freely. `test_a_reader_is_served_the_confirmed_processes` below is
        # what makes that impossible to reintroduce quietly.
        #
        # **The tombstone is confirmed too, and that is the load-bearing line.**
        # `may_serve` and `servable` each hold two clauses — tombstoned, and
        # unconfirmed — and while this loop skipped `dining-003` the record was
        # withheld by the *second* one. Deleting the tombstone clause from either
        # function changed nothing any of the 896 tests could see: every
        # assertion about that id passed because nobody had vouched for it, not
        # because it is a tombstone. `tombstoned` is in `fingerprint.EXCLUDED`,
        # so a `merge` run retiring a process it had already confirmed leaves
        # exactly this row behind — a valid mark under a tombstone — which is the
        # ordinary way production reaches this state and is what the export side
        # already pins
        # (`test_exports.test_a_tombstone_is_absent_even_when_it_carries_a_valid_confirmation`).
        # Written straight to the store because the API refuses it: `POST
        # /api/confirmations/{target}` answers 403 for a tombstone, deliberately,
        # so the store is the only place this shape can be built from.
        for target, rel in ((MINE, "overview.json"),
                            ("dining-001", "processes/dining-001.json"),
                            ("dining-002", "processes/dining-002.json"),
                            (TOMBSTONED, f"processes/{TOMBSTONED}.json")):
            path = data_root / "departments" / MINE / rel
            if not path.is_file():
                continue
            doc = json.loads(path.read_text(encoding="utf-8"))
            confirmations.set_confirmation(conn, target=target,
                                           fingerprint=fingerprint(doc),
                                           by="09190000000", at=1770000000)
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    r = client.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    client.username = username
    # …and its settings, so a test that has to reach round the back of this
    # client — into the same `app.db` the running service reads — can find the
    # file rather than reconstructing the name and hoping the two agree.
    client.cfg = cfg
    return client


def _disclosure_as(data_root, tmp_path, role, *scopes) -> Disclosure:
    """A `Disclosure` for a real account, built without going through HTTP.

    Everything else in this file is an end-to-end sweep, deliberately. This one
    is not, because the question it asks cannot be posed over HTTP: the scope
    grammar has no "may view but may not edit" form for a department, so no
    route will ever hand a caller a document from a department they can see and
    cannot edit. The distinction between `edits(dept)` and "may this caller edit
    at all" is therefore invisible from outside — and it is the distinction the
    whole field policy turns on, so it is asked here directly instead of not at
    all.
    """
    n = next(_seq)
    username = f"0912{n:07d}"
    cfg = _cfg(data_root, tmp_path, n)
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username="09190000000", editor_display_name="e",
              editor_password_hash=hash_password(PW))
    rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
    uid = users.create(conn, username=username, display_name="u",
                       password_hash=hash_password(PW), role_id=rid)
    for s in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                     (uid, s))
    user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return Disclosure(conn, user)


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
    Route("GET", "/api/visibility", None, "/api/visibility", 200),
    #: The user-administration reads (D54). Gated on `manage_users` at `*`, so
    #: every department-scoped caller in this file is answered the uniform 404 —
    #: which is exactly what makes them worth sweeping: these four are the only
    #: endpoints in the service whose success body carries other people's *scope
    #: strings*, and `dept:cooking` in a `dept:dining` reader's payload is the
    #: shape of leak this file exists to find. The `*` holder in
    #: `test_the_sweep_reaches_the_body_each_route_really_serves` is who produces
    #: the real bodies.
    Route("GET", "/api/users", None, "/api/users", 200),
    #: **Id 1 is the seeded Editor**, and deliberately not the caller: `seed.seed`
    #: writes the first `users` row and `_client_as` creates the second, in both
    #: this file and `test_endpoint_matrix.py`. A detail route that 404'd here
    #: would fail `test_the_sweep_reaches_the_body_each_route_really_serves`
    #: rather than quietly scanning an error envelope.
    Route("GET", "/api/users/1", None, "/api/users/{user_id}", 200),
    Route("GET", "/api/users/supervisor-candidates", None,
          "/api/users/supervisor-candidates", 200),
    Route("GET", "/api/roles", None, "/api/roles", 200),
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
    Route("GET", "/api/confirmations?department={d}", None,
          "/api/confirmations", 200),
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

    For `MINE` this is byte-for-byte what `GET /api/processes/{d}-001` **served
    them** — which is the planted document with its cross-department `parent`
    and `subprocess` blanked, because that is all the client was ever given. A
    Save really does carry exactly this and no more, and saving it is what would
    erase those two links on disk if the server did not put back what it
    withheld (`disclosure.Disclosure.restore`;
    `test_a_link_the_editor_never_saw_survives_their_save` pins it).

    For any other department it is a well-formed process document that is simply
    not the one on disk — harmless, because every route naming another
    department is refused before the body is looked at.

    `{}` fails `process.schema.json` on every required property, so `PUT
    /api/processes/{pid}` answered 422 to everyone and its success body — which
    is the largest body this service returns, and the one most likely to carry a
    neighbouring department's id — was never scanned.
    """
    return _process(f"{d}-001", d, name="پذیرایی از مهمان", label="خوش‌آمدگویی",
                    actor="میزبان", proposed="MINEPROPOSED", tag="MINEA")


#: Filled in by the `corpus` fixture: the fingerprint of `{d}-001` **as
#: planted**, per department. The sweep cannot compute one — `Route.body` is a
#: callable of the department alone and has no data root — and it must not
#: hard-code one, because the fixture is where the document is decided.
PLANTED_FINGERPRINT: dict[str, str] = {}


def _the_planted_fingerprint(d: str) -> dict:
    """The body `POST /api/confirmations/{d}-001` needs to succeed.

    An empty string for a department the corpus never planted, which is exactly
    right: every route naming another department is refused before the body is
    looked at.
    """
    return {"fingerprint": PLANTED_FINGERPRINT.get(d, "")}


#: The writes, swept after every read so that what the reads see is the planted
#: corpus rather than whatever a write left behind. The delete is last for the
#: same reason.
DEPT_WRITES = (
    #: First, deliberately: `POST /api/confirmations/{target}` must echo the
    #: document's *current* fingerprint, and every route below this line rewrites
    #: `{d}-001`. `PLANTED_FINGERPRINT` is what the corpus wrote, so it is only
    #: correct while nothing has touched the file yet.
    Route("POST", "/api/confirmations/{d}-001", _the_planted_fingerprint,
          "/api/confirmations/{target}", 200),
    Route("DELETE", "/api/confirmations/{d}-001", None,
          "/api/confirmations/{target}", 200),
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
    #: Left at its default value, so the sweep does not change what every other
    #: test in this file is served. What is scanned is the response body.
    Route("PUT", "/api/visibility/node_actor", {"visible": True},
          "/api/visibility/{field}", 200),
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
    # `*` as well as the department: the visibility policy is global (D16), so
    # its two routes are gated on `*` and a department-scoped Editor is 404'd out
    # of them. This test is about whether each route *can* produce its real body,
    # and `test_visibility_api.py` is where the scope refusal is pinned.
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}", "*")
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
    ("POST", "/api/users"): (
        "the four user-administration **writes** (D13, D14, D15). Excluded as a"
        " group, and for a reason about this file rather than about them: each"
        " one mutates the very `users` and `sessions` rows every other caller in"
        " the sweep depends on — creating an account, re-roling one, replacing a"
        " password, disabling somebody — so a sweep that ran them would be"
        " asserting about a corpus it had just rewritten, and the disable would"
        " revoke sessions mid-sequence. What they could leak they cannot: their"
        " success bodies are the same `_user` projection the four reads above"
        " sweep, built by the same function, and their department-scoped answer"
        " is the same uniform 404. They are pinned end to end in"
        " test_users_api.py — every endpoint for a `*` Reader (403), for a"
        " department Reader (404), for a department Admin (404) and for a"
        " stranger (401) — and their bodies are swept there for the stored"
        " password hash, which is the leak a `SELECT *` row actually carries."),
    ("PATCH", "/api/users/{user_id}"): "see POST /api/users above.",
    ("POST", "/api/users/{user_id}/password"): "see POST /api/users above.",
    ("POST", "/api/users/{user_id}/disabled"): "see POST /api/users above.",
    ("GET", "/exports/{file_path:path}"): (
        "**PARTLY RESOLVED — do not delete this entry without reading D56's "
        "Downloads row.** The scope half is closed: the route now derives "
        "`dept:{code}/report:{kind}` from the requested path and asks "
        "`scopes.contains`, answering the same bare 404 as a missing file when "
        "the caller's scopes do not reach it "
        "(`routers/export_files.py::_may_reach`, pinned by the five tests under "
        "'The download re-derives scope' in test_exports_api.py). Two things are "
        "still open, and both belong to D24/D25 rather than to a body scan: the "
        "**capability** half — downloading is authorised by `export_pdf` (D25), "
        "so a `reader_no_download` holder is still served an artifact of a "
        "department they may read, which makes FR-E7 decorative on this route; "
        "and the **shared export credential**, which carries no identity and "
        "therefore no scope, so a caller holding it alone is still served every "
        "department. D24 retires that credential outright and is what closes it. "
        "Excluded from the sweep here because what this file scans is response "
        "bodies for foreign ids, and this route's body is an opaque file — the "
        "authorisation is the whole question and it is pinned where it lives. "
        "Whoever lands D24: the sweep in this file is still where the rest comes "
        "back."),
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
    pins the actives explicitly, and pins the other way this scan can go quiet:
    the record is confirmed (`_client_as`), so what withholds it here is the
    tombstone rather than D22's second clause.
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


def _stored_mark(client, target: str):
    """The confirmation row for `target`, read out of the store this client's
    service is actually running on.

    A second connection to `client.cfg.app_db`, which is the same file the app
    holds open — the way every other test in this file reaches round the back of
    a running service.
    """
    conn = db.connect(client.cfg.app_db)
    try:
        return confirmations.get(conn, target)
    finally:
        conn.close()


def test_a_tombstoned_process_is_withheld_from_a_reader_and_kept_for_the_editor(
        corpus, tmp_path):
    """Both directions on the two endpoints that serve a process document.

    A tombstone is a *retained* record, not a deletion, so the filter cannot be
    unconditional: the editing app draws it greyed with the only permanent-delete
    affordance there is. Withheld from a Reader, served to an Editor, and the
    department's **active** processes served to both — the third assertion is
    what stops a filter that emptied the list from passing the scan above.

    **And the tombstone carries a valid confirmation**, which is what makes this
    a test about tombstones at all. `may_serve` and `servable` each refuse two
    kinds of record — tombstoned, and unconfirmed — and while `_client_as` left
    `dining-003` unvouched-for, deleting the tombstone clause from either of
    them passed the whole suite: the second clause was doing the work and the
    name of every test here said otherwise. The premise is asserted rather than
    assumed for the same reason `test_the_in_scope_corpus_carries_no_forbidden_token`
    exists — a fixture that quietly stops confirming this record takes both
    assertions below down to vacuity, and this is where that is diagnosed.
    """
    on_disk = json.loads(
        (corpus / "departments" / MINE / "processes" / f"{TOMBSTONED}.json")
        .read_text(encoding="utf-8"))
    assert on_disk.get("tombstoned") is True, (
        f"{TOMBSTONED} is not tombstoned on disk, so nothing below is about a"
        f" tombstone")

    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    mark = _stored_mark(reader, TOMBSTONED)
    assert mark is not None and mark["fingerprint"] == fingerprint(on_disk), (
        f"{TOMBSTONED} carries no valid confirmation, so everything below is"
        f" satisfied by the *unconfirmed* half of the record gate and says"
        f" nothing whatever about the tombstone half: {mark and dict(mark)}")

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


# --------------------------------------------------------------------------
# What is *inside* a document the caller may have (C1, C2)
# --------------------------------------------------------------------------

def _both_boundaries(client, pid: str) -> dict[str, dict]:
    """One process, as each of the two endpoints that serve a document gives it.

    Always as a pair, because the gate is not what is being tested here: both
    routes are ones this caller may have, and a rule applied to one of them is
    the door shut with the window open. That is precisely how the tombstone
    finding arrived — the listing was filtered and the same document stayed
    readable by id.

    Keyed by route so a failure names which of the two disagreed.
    """
    one = client.get(f"/api/processes/{pid}")
    assert one.status_code == 200, one.text
    listed = client.get(f"/api/departments/{MINE}/processes")
    assert listed.status_code == 200, listed.text
    rows = [p for p in listed.json() if p["id"] == pid]
    assert len(rows) == 1, f"{pid} is not in the department listing: {listed.text[:200]}"
    return {"GET /api/processes/{pid}": one.json(),
            "GET /api/departments/{code}/processes": rows[0]}


def _activity(doc: dict) -> dict:
    """The one activity node `_process` plants, which is where `subprocess` is."""
    return next(n for n in doc["nodes"] if n["id"] == f"{doc['id']}-n010")


def test_a_cross_department_link_is_withheld_from_a_reader_and_kept_for_the_wildcard(
        corpus, tmp_path):
    """C1: the gate decides *whether* a document is served, never what is in it.

    `dining-001` is a process this reader is entitled to, served 200 from both
    endpoints — and it names `cooking-777`, one of its nodes, and `cooking-888`
    through links. Unmodified, it tells a caller who is 404'd out of `cooking` a
    process id, a node id and a department code, out of a response the gate was
    right to allow. D56 is "if a user may not see it, it does not appear in
    **any** response to them", and a link is a response.

    Three assertions, and each of them is load-bearing:

    * the links are gone for the reader — the finding itself;
    * the rest of the document is **untouched**, so a fix that blanked the whole
      record, or emptied the department, fails here rather than passing a scan;
    * the *in-department* link on `dining-002` survives, so does a fix that
      simply removed every link.

    And the same document, for a caller entitled to `cooking`, still carries all
    of it — or the filter is unconditional and the sub-process graph is gone for
    the people it is for.
    """
    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    for route, doc in _both_boundaries(reader, f"{MINE}-001").items():
        assert doc["parent"] is None, (
            f"{route} served a reader a parent in another department:"
            f" {doc['parent']}")
        assert _activity(doc)["subprocess"] is None, (
            f"{route} served a reader a sub-process link into another"
            f" department: {_activity(doc)['subprocess']}")
        # …and nothing else moved.
        assert doc["name"] == "پذیرایی از مهمان"
        assert (_activity(doc)["label"], _activity(doc)["actor"]) == (
            "خوش‌آمدگویی", "میزبان"), (
            f"{route} blanked more than the link: a redaction that empties the"
            f" document passes every scan and serves nobody")

    for route, doc in _both_boundaries(reader, f"{MINE}-002").items():
        assert _activity(doc)["subprocess"] == LOCAL_CHILD, (
            f"{route} dropped an in-department sub-process link: what is"
            f" withheld is the department an id names, not the link itself")

    # The pairing that gives the withholding its meaning: the id really is one
    # this caller cannot reach.
    assert reader.get(f"/api/processes/{FOREIGN_PARENT}").status_code == 404

    wild = _client_as(corpus, tmp_path, "editor", "*")
    for route, doc in _both_boundaries(wild, f"{MINE}-001").items():
        assert doc["parent"] == {"process": FOREIGN_PARENT,
                                 "node": FOREIGN_PARENT_NODE}, (
            f"{route} withheld a link from a caller entitled to both"
            f" departments: {doc['parent']}")
        assert _activity(doc)["subprocess"] == FOREIGN_CHILD, (
            f"{route} withheld a sub-process link from a caller entitled to it")


def test_the_board_counts_no_sub_process_the_caller_cannot_see(corpus, tmp_path):
    """The same withheld link, in the badge derived from it (D56).

    `subs` is «۱ زیرفرآیند» on the department card. For a caller who cannot see
    `cooking`, a `1` says *one of your processes hangs under something you may
    not know about* — the derived-signals row, the same clause the `conflicts`
    count next to it is withheld under, and the same reason: the count leaks the
    existence of the withheld thing as surely as the thing does.

    `count` is asserted beside it because a board that had simply stopped
    reading the department would report `subs: 0` too.
    """
    for role in ROLES:
        client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
        row = next(r for r in _board(client) if r["code"] == MINE)
        assert row["count"] == 2, (
            f"the premise is gone for a {role}: {MINE} must still report its two"
            f" active processes, or `subs: 0` means the board stopped reading it")
        assert row["subs"] == 0, (
            f"the board told a {role} that a {MINE} process hangs under"
            f" something in a department they are 404'd out of: {row}")

    wild = _client_as(corpus, tmp_path, "editor", "*")
    assert next(r for r in _board(wild) if r["code"] == MINE)["subs"] == 1, (
        "the caller entitled to both departments lost the badge: what is"
        " withheld is the link they cannot see, not the count itself")


@pytest.mark.parametrize("role", NON_EDITORS)
def test_no_unresolved_proposal_reaches_a_role_that_cannot_edit(corpus, tmp_path,
                                                                role):
    """C2: the whole `pending` array, swept for everyone who cannot resolve one.

    D17 puts `pending` in the never-shown block with no switch. This branch had
    already settled the *count*: `/api/pending` answers these callers `[]` and
    the board omits `conflicts` for them, on the argument — written into
    `routers/departments.py` — that a badge saying "two conflicts" leaks the
    existence of withheld proposals as surely as the proposals do. And then two
    document endpoints served them the proposals: `field`, `current`, `proposed`
    and `source`.

    The caller here is **inside** `dining` and entitled to the department, like
    the tombstone scan above and unlike everything else in this file: scope is
    not what refuses them.
    """
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    leaks = _leaks(client, forbidden=PENDING_TOKENS)
    assert leaks == [], "\n".join(f"  as a {role}: {leak}" for leak in leaks)


def test_the_proposal_scan_finds_every_token_for_someone_who_may_edit(corpus,
                                                                      tmp_path):
    """The proposal tokens, proved to bite — the pairing for the scan above.

    The same sweep as an Editor of `dining`, who is the person a proposal is
    kept for. A token no endpoint serves even to them is a token whose absence
    proves nothing, and this is what would catch the corpus losing its conflict,
    the route table losing the endpoint, or the filter being applied to
    everybody.
    """
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    leaks = _leaks(client, forbidden=PENDING_TOKENS)
    missing = {token for token, _ in PENDING_TOKENS} - {leak.token for leak in leaks}
    assert not missing, (
        f"no endpoint serves {sorted(missing)} even to an Editor of {MINE}, who"
        f" an unresolved proposal is kept for: the fixture, the route table or"
        f" the filter is wrong, and asserting a reader never sees them tests"
        f" nothing")


def test_pending_is_emptied_rather_than_dropped_for_a_non_editor(corpus, tmp_path):
    """Emptied, and the key kept — the shape `exports._public_process` uses.

    Not a detail: `ui/src/flow/adapt.ts` iterates `pending` to count each node's
    conflicts with no guard, so dropping the key turns a withheld proposal into
    a `TypeError` in the reader's browser. The API and the published export now
    say the same thing about the same field, which is the point of following the
    export's shape rather than inventing a second one.
    """
    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    for route, doc in _both_boundaries(reader, f"{MINE}-001").items():
        assert "pending" in doc, f"{route} dropped the pending key entirely"
        assert doc["pending"] == [], f"{route} served a reader {doc['pending']}"

    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    for route, doc in _both_boundaries(editor, f"{MINE}-001").items():
        assert [p["proposed"] for p in doc["pending"]] == ["MINEPROPOSED"], (
            f"{route} took the proposal away from the person who can resolve"
            f" it: {doc['pending']}")


def _on_disk(corpus, pid: str) -> dict:
    return json.loads(
        (corpus / "departments" / MINE / "processes" / f"{pid}.json")
        .read_text(encoding="utf-8"))


def test_a_link_the_editor_never_saw_survives_their_save(corpus, tmp_path):
    """The other half of the redaction: what is withheld cannot be edited away.

    An Editor of `dining` who cannot see `cooking` now loads `dining-001` with
    its cooking parent and sub-process already blanked — and the client saves
    back what it loaded. Without `Disclosure.restore` the very first Save erases
    both links on disk, silently, by someone who never knew they were there, and
    the department the scope boundary exists to protect is the one that loses
    them.

    Paired in the other direction, or "restore everything" would pass: the
    in-department link on `dining-002` is one this caller **can** see, and
    clearing it must really clear it.
    """
    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    loaded = editor.get(f"/api/processes/{MINE}-001").json()
    assert loaded["parent"] is None and _activity(loaded)["subprocess"] is None, (
        "the premise is gone: this Editor was served the links, so a Save that"
        " preserves them proves nothing")

    saved = editor.put(f"/api/processes/{MINE}-001", json=loaded)
    assert saved.status_code == 200, saved.text
    assert saved.json()["parent"] is None, (
        "the save handed back the link it had withheld from the same caller a"
        " moment earlier")

    kept = _on_disk(corpus, f"{MINE}-001")
    assert kept["parent"] == {"process": FOREIGN_PARENT,
                              "node": FOREIGN_PARENT_NODE}, (
        f"a Save by someone who was never shown the parent erased it:"
        f" {kept['parent']}")
    assert _activity(kept)["subprocess"] == FOREIGN_CHILD, (
        "a Save by someone who was never shown the sub-process link erased it")

    two = editor.get(f"/api/processes/{MINE}-002").json()
    assert _activity(two)["subprocess"] == LOCAL_CHILD  # premise
    _activity(two)["subprocess"] = None
    assert editor.put(f"/api/processes/{MINE}-002", json=two).status_code == 200
    assert _activity(_on_disk(corpus, f"{MINE}-002"))["subprocess"] is None, (
        "an in-department link the caller could see was restored anyway: a"
        " blanket restore takes editing links away from everyone")

    # The same, for `parent`, and it takes two saves: a restore has nothing to
    # put back until the link is on disk, so the first save plants an
    # in-department parent and the second clears it. Asserting only the
    # sub-process half left "restore every stored parent, seen or not" alive.
    local_parent = {"process": f"{MINE}-001", "node": f"{MINE}-001-n010"}
    two = editor.get(f"/api/processes/{MINE}-002").json()
    two["parent"] = local_parent
    assert editor.put(f"/api/processes/{MINE}-002", json=two).status_code == 200
    assert _on_disk(corpus, f"{MINE}-002")["parent"] == local_parent

    two = editor.get(f"/api/processes/{MINE}-002").json()
    assert two["parent"] == local_parent, (
        "a parent inside the caller's own department was withheld from them:"
        " what is withheld is the department an id names, not the link")
    two["parent"] = None
    assert editor.put(f"/api/processes/{MINE}-002", json=two).status_code == 200
    assert _on_disk(corpus, f"{MINE}-002")["parent"] is None, (
        "a parent the caller could see was restored anyway: a blanket restore"
        " takes editing links away from everyone")


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


def _reader_bodies(client) -> str:
    """Every read body this caller can obtain, serialised into one string."""
    import json as _json
    out = []
    for route in [_fill(r, u=client.username) for r in GLOBAL_READS] + \
                 [_fill(r, d=MINE, u=client.username) for r in DEPT_READS]:
        r = client.request(route.method, route.path, json=route.body)
        try:
            out.append(_json.dumps(r.json(), ensure_ascii=False))
        except ValueError:
            out.append(r.text)
    return "\n".join(out)


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin"])
def test_no_hidden_field_reaches_a_caller_who_cannot_edit_the_department(
        corpus, tmp_path, role):
    """§11 test 8 — no denylisted field in any response to a non-editor.

    All three non-editing roles, because an Admin holds `manage_users` and
    `view_audit` and still holds no `edit`: the policy is about the capability at
    this department, never about how senior the account is.
    """
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    body = _reader_bodies(client)
    leaked = [f"{token} ({why})" for token, why in HIDDEN_FIELD_TOKENS
              if token in body]
    assert leaked == [], f"as a {role}: " + "; ".join(leaked)


def test_an_editor_of_the_department_is_served_every_one_of_those_fields(
        corpus, tmp_path):
    """The pairing, over the **same corpus**.

    Without it the test above passes against a backend that serves a scoped
    Editor nothing at all — and against one that has quietly stopped planting the
    tokens. Both halves read the same documents; only the caller differs.
    """
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    body = _reader_bodies(client)
    missing = [f"{token} ({why})" for token, why in HIDDEN_FIELD_TOKENS
               if token not in body]
    assert missing == [], (
        "an Editor of their own department was not served: " + "; ".join(missing)
        + " — either the filter is stripping for editors too, or the corpus"
          " stopped planting these")


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin", "editor"])
def test_the_two_fields_d17_shows_by_default_reach_everyone(corpus, tmp_path, role):
    """A filter that blanked everything would pass every assertion above."""
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    body = _reader_bodies(client)
    missing = [f"{token} ({why})" for token, why in SHOWN_FIELD_TOKENS
               if token not in body]
    assert missing == [], f"as a {role}, nothing carried: " + "; ".join(missing)


def test_the_overview_reaches_a_reader_in_full(corpus, tmp_path):
    """D55 — the department information page is shown in its entirety.

    The plan had `updated_at` withheld from a non-editor and this test asserting
    its absence. It is here instead, because the project owner overruled that
    while the filter was being written (`visibility.public_overview`): a
    last-updated date says nothing about what a department does, and
    `ui/src/screens/Overview.tsx` dereferences it with no guard, so dropping it
    was a `NaN/NaN/NaN` on a reader's screen rather than a withheld secret.

    Asserted as two equalities — against the document on disk, and against the
    Editor's own body — so "in full" cannot quietly become "in part": a future
    switch on personnel KPIs would fail here and have to be a decision rather
    than a diff.
    """
    on_disk = json.loads(
        (corpus / "departments" / MINE / "overview.json").read_text(encoding="utf-8"))
    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    theirs = editor.get(f"/api/departments/{MINE}/overview").json()
    mine = reader.get(f"/api/departments/{MINE}/overview").json()
    assert set(theirs) - set(mine) == set(), (
        "the reader's overview lost a key the editor's carries")
    assert mine == theirs
    assert mine == on_disk, (
        "a non-editor's copy of the overview is the document (D55) — the filter"
        " takes nothing away, `updated_at` included")
    # …and the thing D55 names as the likely future candidate is present today.
    assert mine["personnel"][0]["kpi"] == ["رضایت مهمان"]


def test_the_overview_boundary_passes_the_callers_own_stance(corpus, tmp_path,
                                                             monkeypatch):
    """`redact_overview` resolves `editor` per department — inert today, pinned
    anyway.

    `visibility.public_overview` returns the same document for both stances
    (D55: shown in full), so every assertion in this file about an overview body
    is satisfied by a `redact_overview` that passes the constant `True`. Inert is
    not the same as absent: the moment D55 gains its first switch — personnel
    KPIs are the candidate it names — that constant publishes it to every reader,
    and nothing in the suite would be looking at the one boolean that decides it.

    An **argument** spy, and deliberately not an assertion about the two bodies:
    `public_overview` hands an editor the document itself and a non-editor a
    copy, so `is`-comparing them would pin an implementation detail of the filter
    rather than the stance this boundary is responsible for resolving. What
    crosses the boundary is a boolean, so the boolean is what is read — with
    `is`, because `0` and `False` compare equal and only one of them is what
    `edits` returns.

    Both directions, so neither constant survives.
    """
    seen: list[object] = []
    real = visibility.public_overview

    def spy(doc, *, editor):
        seen.append(editor)
        return real(doc, editor=editor)

    monkeypatch.setattr(visibility, "public_overview", spy)

    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    assert reader.get(f"/api/departments/{MINE}/overview").status_code == 200
    assert seen and seen[-1] is False, (
        f"the overview boundary told the filter a non-editor was an editor:"
        f" {seen}")

    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    assert editor.get(f"/api/departments/{MINE}/overview").status_code == 200
    assert seen[-1] is True, (
        f"the overview boundary told the filter an Editor of {MINE} was not one,"
        f" so the stance is a constant in the other direction: {seen}")


#: Every route that returns a process document, by (method, FastAPI template).
#:
#: The list is short enough to read and that is the point: `Disclosure.redact`
#: keeps its signature precisely so this stays six call sites rather than six
#: reimplementations, and "every boundary runs the same rule" is only a property
#: a reader can check if something checks it. Two of the six — `POST
#: /api/processes` and `POST …/relayout` — can disclose nothing through the
#: filter today (the created skeleton names only a parent the caller was gated
#: on, and the relayout body is an echo of what the caller sent), so a bypass
#: there is invisible to every scan in this file. They are exactly the two a
#: refactor would drop.
PROCESS_BOUNDARIES: frozenset[tuple[str, str]] = frozenset({
    ("GET", "/api/processes/{pid}"),
    ("POST", "/api/processes"),
    ("POST", "/api/processes/{pid}/relayout"),
    ("PUT", "/api/processes/{pid}"),
    ("POST", "/api/processes/{pid}/pending/{index}"),
    ("GET", "/api/departments/{code}/processes"),
})

#: And the one that returns a department overview (D55).
OVERVIEW_BOUNDARY = ("GET", "/api/departments/{code}/overview")


def test_every_boundary_that_serves_a_document_runs_the_one_filter(
        corpus, tmp_path, monkeypatch):
    """D18 — one filter, and every boundary reads it.

    Asserted as an **equality** over the whole sweep, so it fails in both
    directions: a boundary that stopped redacting is missing from `seen`, and a
    route that started returning a raw document without joining the list is
    absent from `PROCESS_BOUNDARIES` and fails as an extra. The sweep is an
    Editor's, because an Editor is the only caller every one of these routes
    serves a body to at all.

    The premise is asserted first: a boundary that answered 4xx would call
    nothing and pass this vacuously.
    """
    calls: dict[str, set[tuple[str, str]]] = {"redact": set(), "overview": set()}
    here: list[tuple[str, str]] = []
    redact, redact_overview = Disclosure.redact, Disclosure.redact_overview

    def spy(name, original):
        def wrapper(self, doc, dept):
            calls[name].add(here[-1])
            return original(self, doc, dept)
        return wrapper

    monkeypatch.setattr(Disclosure, "redact", spy("redact", redact))
    monkeypatch.setattr(Disclosure, "redact_overview",
                        spy("overview", redact_overview))

    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    served = set()
    for route in _sweep(client, departments=(MINE,)):
        here.append((route.method, route.template))
        r = client.request(route.method, route.path, json=route.body)
        here.pop()
        if r.status_code == route.expect:
            served.add((route.method, route.template))

    assert PROCESS_BOUNDARIES | {OVERVIEW_BOUNDARY} <= served, (
        "these routes never produced a body on this sweep, so what they did or"
        " did not filter says nothing:"
        f" {sorted((PROCESS_BOUNDARIES | {OVERVIEW_BOUNDARY}) - served)}")
    assert calls["redact"] == PROCESS_BOUNDARIES, (
        f"boundaries that served a process without the filter:"
        f" {sorted(PROCESS_BOUNDARIES - calls['redact'])};"
        f" routes that ran it and are not on the list:"
        f" {sorted(calls['redact'] - PROCESS_BOUNDARIES)}")
    assert calls["overview"] == {OVERVIEW_BOUNDARY}, calls["overview"]


def test_the_field_stance_is_decided_per_department_not_per_caller(corpus, tmp_path):
    """`edits(dept)`, and not "may this caller edit anywhere".

    Every caller in this file holds one scope, and for a one-department caller
    the two questions have the same answer — so the whole file passes, unchanged,
    against a `redact` that asked `editor=bool(self._may_edit)` or hoisted one
    department's answer out of a listing loop. That is the regression this
    project has already shipped once, in the board's conflict count, and
    `test_the_conflict_count_is_decided_per_department_not_per_caller` is what
    caught it there.

    Asked of `Disclosure` directly rather than over HTTP for the reason
    `_disclosure_as` gives: no scope grants view without edit, so no route can
    hand this caller `cooking-777` at all. The filter must still be right about
    it — `exports.py` resolves the same two stances for a department the caller
    never asked for, and Task 10 serves that shape from an unauthenticated link.

    Both directions in **one** `Disclosure`: the same object, the same policy,
    two departments, two answers.
    """
    shown = _disclosure_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    mine = json.loads((corpus / "departments" / MINE / "processes"
                       / "dining-001.json").read_text(encoding="utf-8"))
    theirs = json.loads((corpus / "departments" / THEIRS / "processes"
                         / "cooking-777.json").read_text(encoding="utf-8"))

    ours = shown.redact(mine, MINE)
    assert ours["summary"] == "MINEASUMMARY", (
        "the department this caller may edit lost its hidden fields: the stance"
        " is being read off the caller rather than off the department")
    assert [p["proposed"] for p in ours["pending"]] == ["MINEPROPOSED"]

    other = shown.redact(theirs, THEIRS)
    assert other["summary"] == "", (
        "a document from a department this caller may NOT edit was served"
        " unfiltered: `editor` is being answered per caller, not per department")
    assert _activity(other)["icom"]["inputs"] == []
    assert other["pending"] == []
    # …and the two fields D17 shows by default survive on both, so neither half
    # is satisfied by a filter that blanked everything.
    assert _activity(ours)["description"] == "MINEADESC"
    assert _activity(other)["description"] == "LEAKFDESC"


def test_a_flipped_switch_reaches_the_very_next_response(corpus, tmp_path):
    """The policy is resolved per request — once, and every time.

    `Disclosure.__init__` reads it once so a listing does not re-read it per
    process. The mutant on the other side of that is a module-level cache: the
    policy resolved once per **process** rather than once per request, so an
    Editor's flip changes nothing until the service is restarted. Nothing else
    in the suite would notice, because every other test runs under one policy
    from start to finish.

    Written against `store.policy` directly because the endpoint that flips a
    switch is Task 9's; the store is where the row lands either way, and this is
    the same second connection the running service would see a real flip
    through.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    before = client.get(f"/api/processes/{MINE}-001")
    assert before.status_code == 200, before.text
    assert before.json()["summary"] == "", (
        "the premise is gone: `process_summary` is off by default (D17), so a"
        " reader must start out without it")

    conn = db.connect(client.cfg.app_db)
    try:
        assert policy.set_field(conn, "process_summary", True) is False
    finally:
        conn.close()

    after = client.get(f"/api/processes/{MINE}-001")
    assert after.json()["summary"] == "MINEASUMMARY", (
        "a switch flipped while the service was running did not reach the next"
        " response: the policy is being cached across requests")

    # …and back, so this is a live read rather than a one-way latch.
    conn = db.connect(client.cfg.app_db)
    try:
        assert policy.set_field(conn, "process_summary", False) is True
    finally:
        conn.close()
    assert client.get(f"/api/processes/{MINE}-001").json()["summary"] == ""


def test_the_defaults_are_not_what_the_filter_reads(corpus, tmp_path):
    """`store.policy.current`, never `store.policy.DEFAULTS`.

    The two agree until somebody flips a switch, which is every test but this
    one and the one above — and a `Disclosure` reading `DEFAULTS` would serve
    the same body forever while the policy screen reported the change it had
    stored. Pinned on a field whose default is **on**, so it fails in the
    direction the test above cannot: `node_description` off must actually blank
    a description a reader was receiving a moment earlier.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    assert _activity(client.get(f"/api/processes/{MINE}-001").json())[
        "description"] == "MINEADESC"

    conn = db.connect(client.cfg.app_db)
    try:
        policy.set_field(conn, "node_description", False)
    finally:
        conn.close()

    assert _activity(client.get(f"/api/processes/{MINE}-001").json())[
        "description"] == "", (
        "a switch turned off left the field in the body: the filter is reading"
        " D17's defaults rather than the stored policy")


def test_the_stance_is_read_from_the_request_path_not_from_the_document(corpus,
                                                                        tmp_path):
    """`dept` is `redact`'s argument, never `doc["department"]`.

    The routers derive it from the request path, so it is the very string the
    gate ran on. Nothing revalidates a stored document on read, so a hand-edited
    or half-written file whose `department` disagrees with the directory it sits
    in would otherwise be redacted against a department nobody was gated on —
    the field policy decided by the file's own claim about itself, which is the
    one input an attacker who can write a document controls.

    Unreachable through the API today, and pinned anyway: `redact`'s docstring
    states this in as many words, and a claim in a docstring that no test can
    fail is a claim that stops being true without anyone noticing.
    """
    shown = _disclosure_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    lying = json.loads((corpus / "departments" / THEIRS / "processes"
                        / "cooking-777.json").read_text(encoding="utf-8"))
    lying["department"] = MINE  # the file claims dining; it lives in cooking
    assert shown.redact(lying, THEIRS)["summary"] == "", (
        "the document's own `department` decided the stance: a file that claims"
        " a department the caller may edit is not thereby in it")


def test_a_reader_is_served_the_confirmed_processes(corpus, tmp_path):
    """The premise of every scoped sweep in this file.

    D22 makes an unconfirmed department invisible, so a corpus that forgot to
    confirm anything would give every scoped caller an empty body — and an empty
    body passes every leak assertion here against a backend that leaks freely.
    This is where that is diagnosed.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    listed = client.get(f"/api/departments/{MINE}/processes").json()
    assert [p["id"] for p in listed] == ["dining-001", "dining-002"]
    assert client.get(f"/api/departments/{MINE}/overview").status_code == 200
    # …and the tombstone is still withheld, for its own reason — which it really
    # is: `_client_as` vouches for `dining-003` too, so the 404 below is the
    # tombstone clause and not the confirmation one. The premise is asserted in
    # `test_a_tombstoned_process_is_withheld_from_a_reader_and_kept_for_the_editor`.
    assert client.get(f"/api/processes/{TOMBSTONED}").status_code == 404


# --------------------------------------------------------------------------
# The published bundle — the one body in this file that is not a response
# --------------------------------------------------------------------------

#: The targets `_client_as` vouches for, and therefore the ones a test has to
#: withdraw to make this department unpublishable.
CONFIRMED_TARGETS = (MINE, f"{MINE}-001", f"{MINE}-002")


def _published(client, kind="steps") -> str:
    """`MINE`'s exported document, read off disk as text.

    **The sweep above cannot reach this.** `POST …/exports/{kind}` answers
    `{"url": …, "generated_at": …}`, so `_leaks` walks a URL and a timestamp and
    learns nothing whatever about what was published — while the file it names is
    the largest body this service produces and is served from a route this file
    does not sweep (`NOT_SWEPT`). That gap is how the export came to be the one
    boundary handing a reader an unconfirmed process: every scan in this file was
    green throughout. The route derives and checks a department scope now; what
    it still does not check is `export_pdf`, and the `NOT_SWEPT` entry says which
    half is which.
    """
    r = client.post(f"/api/departments/{MINE}/exports/{kind}")
    assert r.status_code == 200, r.text
    return (client.cfg.export_dir / r.json()["url"][len("/exports/"):]).read_text(
        encoding="utf-8")


def _bundle(text: str) -> dict:
    """The payload `exports.render` embedded in `text`, parsed back to a dict.

    A structural read, for the one assertion a substring search cannot make
    honestly: "this id is somewhere in the page" is satisfied by the id's own
    `"id"` field on a *different* process, so proving a link really landed on
    the node that carries it needs the parsed document, not `in text`.
    """
    marker = '<script id="inja-export-data">'
    start = text.index(marker) + len(marker)
    end = text.index("</script>", start)
    return json.loads(text[start:end])


def test_the_published_bundle_carries_nothing_a_reader_may_not_have(corpus, tmp_path):
    """Every token list in this file, checked against the artifact itself.

    The bundle is built for *this department and nothing else* (D27) and for a
    non-editor, so all four lists apply to it at once — the scope tokens because
    `dining-001` links out of the department, the tombstone and proposal tokens
    because it is not an Editor's document, the hidden-field tokens because D17's
    defaults decide what a published file carries exactly as they decide what a
    response does.

    The caller is a plain `reader`: `export_pdf` is in the default reader role,
    so this is not an Editor's privilege being exercised — it is the route as
    anybody in the restaurant reaches it.

    Paired, and the pairing is the load-bearing half: an empty document satisfies
    every absence above, and this file has been hollowed exactly that way three
    times.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    text = _published(client)

    forbidden = (FORBIDDEN + TOMBSTONE_TOKENS + PENDING_TOKENS
                 + HIDDEN_FIELD_TOKENS + _server_paths(corpus))
    leaked = [f"{token} ({why})" for token, why in forbidden if token in text]
    assert leaked == [], "the published bundle carries: " + "; ".join(leaked)

    # …and it is a real document, not an empty one.
    for kept, why in (("dining-001", "the department's first process"),
                      ("dining-002", "its second"),
                      ("پذیرایی از مهمان", "a process name"),
                      ("خوش‌آمدگویی", "a node label"),
                      ("میزبان", "a node actor (D17: shown by default)"),
                      *SHOWN_FIELD_TOKENS,
                      ("دپارتمان سالن", "the department overview")):
        assert kept in text, (
            f"{kept!r} ({why}) is not in the published bundle: the absences above"
            f" are about a document that carries nothing")

    # `LOCAL_CHILD in text` alone proves nothing about a link: `dining-001` is
    # in the bundle anyway as a published process's own `id`, so that substring
    # check would still pass against a `sees` that blanks every subprocess.
    # Structural, on the parsed payload: the link has to land on the actual
    # node that carries it.
    dining_002 = next(p for p in _bundle(text)["processes"] if p["id"] == "dining-002")
    links = [n.get("subprocess") for n in dining_002["nodes"]]
    assert LOCAL_CHILD in links, (
        f"dining-002 does not genuinely carry a subprocess link to {LOCAL_CHILD}"
        f" — an in-department link must survive the bundle: {links}")


def test_the_export_publishes_nothing_for_a_department_the_gated_routes_refuse(
        corpus, tmp_path):
    """The record gate, asked of the export in the same breath as of the three
    boundaries that already had it.

    This is the finding written down: a `reader` scoped to `dining` over an
    unconfirmed corpus is answered 404 / 404 / `[]` by the overview, the document
    and the listing — and `POST …/exports/steps` used to answer **200** and put
    the process name, every node label and the overview into a file served from a
    publicly mounted folder. The gate decided *whether* the export ran and
    nothing decided what went into it.

    Both directions over one corpus: restoring the marks publishes the department
    again, so the refusal is a decision about confirmation rather than a bundle
    that never contains anything.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    docs = {t: json.loads(
        (corpus / "departments" / MINE / ("overview.json" if t == MINE
                                          else f"processes/{t}.json"))
        .read_text(encoding="utf-8")) for t in CONFIRMED_TARGETS}

    conn = db.connect(client.cfg.app_db)
    try:
        for target in CONFIRMED_TARGETS:
            assert confirmations.revoke(conn, target) is True, (
                f"{target} was not confirmed to begin with, so withdrawing it"
                f" changes nothing and this test is about nothing")
    finally:
        conn.close()

    # the three gated boundaries, exactly as the finding recorded them
    assert client.get(f"/api/departments/{MINE}/overview").status_code == 404
    assert client.get(f"/api/processes/{MINE}-001").status_code == 404
    assert client.get(f"/api/departments/{MINE}/processes").json() == []

    # …and now the fourth
    r = client.post(f"/api/departments/{MINE}/exports/steps")
    assert r.status_code == 409, (
        f"the export published a department every other boundary refuses:"
        f" {r.status_code} {r.text[:200]}")
    published = list(client.cfg.export_dir.rglob("*.html"))
    assert published == [], (
        f"a refused export left a document in the public folder: {published}")

    conn = db.connect(client.cfg.app_db)
    try:
        for target, doc in docs.items():
            confirmations.set_confirmation(conn, target=target,
                                           fingerprint=fingerprint(doc),
                                           by="09190000000", at=1770000000)
    finally:
        conn.close()
    assert "پذیرایی از مهمان" in _published(client), (
        "confirming the department did not publish it: the refusal above is not"
        " about the confirmation")


def test_the_three_confirmation_routes_really_produce_a_body_on_this_sweep(
        corpus, tmp_path):
    """The positive control for the three rows added to the tables above.

    This file has already been hollowed once by exactly this shape: when the
    record gate landed, nine leak assertions passed against a freely-leaking
    backend because a scoped reader's every body had become empty, and an empty
    body satisfies every leak assertion there is. Three more routes joined the
    sweep here, and *their* contribution to it must not be three empty bodies
    nobody notices.

    So both sides are pinned, over the same corpus:

    * the Editor's listing carries real rows — the department, its two active
      processes, a 64-hex fingerprint each — so `_leaks` walking it is walking
      something, and `test_the_scan_finds_every_token_when_the_caller_is_in_scope`
      really does sweep this route for the wildcard holder;
    * a non-editor is refused with **403 and not 404** (they hold `view` on
      dining, so the resource is one they can see and only the action is
      refused), which is what makes their empty result a decision rather than an
      accident;
    * the tombstone is absent from the listing (D17), so no Editor can vouch for
      a document no reader will ever be served.
    """
    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    r = editor.get(f"/api/confirmations?department={MINE}")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert [row["target"] for row in rows] == [MINE, f"{MINE}-001", f"{MINE}-002"], (
        "the confirmation listing served an Editor nothing to walk, so the three"
        " rows added to DEPT_READS/DEPT_WRITES contribute empty bodies to every"
        " sweep in this file")
    assert TOMBSTONED not in {row["target"] for row in rows}, (
        f"{TOMBSTONED} is confirmable: D17 excludes a tombstone entirely, so"
        f" vouching for one vouches for a document no reader can be served")
    assert all(len(row["fingerprint"]) == 64 for row in rows), rows

    for role in NON_EDITORS:
        other = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
        assert other.get(f"/api/confirmations?department={MINE}").status_code == 403, (
            f"a {role} was not refused the confirmation listing with 403 — their"
            f" empty contribution to the sweep is an accident, not a decision")
        assert other.post(f"/api/confirmations/{MINE}-001",
                          json={"fingerprint": PLANTED_FINGERPRINT[MINE]}
                          ).status_code == 403
        assert other.delete(f"/api/confirmations/{MINE}-001").status_code == 403


def test_the_two_visibility_routes_really_produce_a_body_on_this_sweep(corpus,
                                                                       tmp_path):
    """The positive control for the two rows added to the tables above.

    This file has been hollowed once already by exactly this shape: an empty
    body satisfies every leak assertion there is, so two routes that answered
    every caller in this file a `{"detail": …}` would join the sweep, add
    nothing to it, and nobody would notice. The visibility routes are the most
    exposed case yet — they are gated on `*` (D16), which is a scope **no**
    caller in the leak scans holds, so their contribution to those scans really
    is a 404 body and it has to be one on purpose.

    So all three legs are pinned, over the same corpus:

    * the wildcard holder — the one caller `test_the_scan_finds_every_token…`
      sweeps with — receives the whole policy: six switches at D17's defaults
      and a 16-hex version, from both routes. That is a real body for `_leaks`
      to walk;
    * every department-scoped caller is refused **404 and not 403** on both,
      because `*` is outside their scope and D56 says a target they cannot
      reach must be indistinguishable from a typo. That is what makes their
      empty contribution a decision;
    * a non-editor who *does* hold `*` is refused **403**, so the 404 above is
      about scope rather than about the capability.

    And the sweep's own `PUT` leaves the policy where it found it: it sets
    `node_actor` to the value D17 already gives it, so no other test in this
    file is served a different document because this one ran.
    """
    wild = _client_as(corpus, tmp_path, "editor", "*")
    got = wild.get("/api/visibility")
    assert got.status_code == 200, got.text
    body = got.json()
    assert set(body.get("fields", ())) == set(policy.FIELDS), (
        "the policy route served the wildcard holder nothing to walk, so the two"
        " rows added to GLOBAL_READS/GLOBAL_WRITES contribute empty bodies to"
        f" every sweep in this file: {body}")
    assert body["fields"] == policy.DEFAULTS
    assert len(body["version"]) == 16

    put = wild.put("/api/visibility/node_actor", json={"visible": True})
    assert put.status_code == 200, put.text
    assert put.json() == body, (
        "the sweep's PUT changed the policy: every other test in this file would"
        " then be served a different document depending on whether it ran")

    for role in ROLES:
        scoped = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
        for r in (scoped.get("/api/visibility"),
                  scoped.put("/api/visibility/node_actor", json={"visible": True})):
            assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND}), (
                f"a {role} scoped to {MINE} was not 404'd out of the global"
                f" policy — their empty contribution to the sweep is an accident,"
                f" not a decision: {r.status_code} {r.text[:120]}")

    for role in NON_EDITORS:
        holder = _client_as(corpus, tmp_path, role, "*")
        assert holder.get("/api/visibility").status_code == 403, (
            f"a {role} holding `*` was not refused the policy with 403: the 404"
            f" above would then be saying nothing about scope")
        assert holder.put("/api/visibility/node_actor",
                          json={"visible": True}).status_code == 403
