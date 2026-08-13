"""Unconfirmed content is invisible to non-editors (spec D22, D23, D56).

Filtered in the query and never client-side: the record is absent from the
body, and a single process is a 404 — not a 403, which would teach the caller
that a document they may not have exists (D56's Existence row).
"""
import itertools
import json
import time

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.disclosure import Disclosure
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import confirmations, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()


def _proc(pid: str, dept: str, name: str) -> dict:
    return {
        "id": pid, "department": dept, "name": name, "summary": "خلاصه",
        "source": {"type": "manual", "ref": None, "run": None}, "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [],
        "nodes": [{"id": f"{pid}-n010", "type": "activity", "label": "کار",
                   "description": "", "actor": "", "subprocess": None,
                   "icom": {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []},
                   "position": {"x": 60, "y": 60}, "layout": "auto",
                   "source": {"created_by": "ui", "touched_by": []}}],
        "edges": [], "pending": [],
    }


def _overview(dept: str) -> dict:
    return {"department": dept, "name": "سالن", "description": "شرح",
            "sub_units": [], "personnel": [],
            "updated_at": "2026-07-06T10:00:00Z"}


@pytest.fixture
def corpus(data_root):
    """Two dining processes and a dining overview — none of them confirmed."""
    base = data_root / "departments" / "dining"
    (base / "processes" / "dining-001.json").write_text(
        json.dumps(_proc("dining-001", "dining", "پذیرایی"), ensure_ascii=False),
        encoding="utf-8")
    (base / "processes" / "dining-002.json").write_text(
        json.dumps(_proc("dining-002", "dining", "ترخیص"), ensure_ascii=False),
        encoding="utf-8")
    (base / "overview.json").write_text(
        json.dumps(_overview("dining"), ensure_ascii=False), encoding="utf-8")
    return data_root


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0913{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"gate-{n}.db")
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
    assert client.post("/api/auth/login",
                       json={"username": username, "password": PW}).status_code == 200
    client.app_db = cfg.app_db
    client.data_root = data_root
    return client


def _disclosure_as(data_root, tmp_path, role, *scopes):
    """A live connection and a `Disclosure` on it, built without going through HTTP.

    For the one question that cannot be posed over the wire: **how many queries**
    a department costs. Everything else in this file is end to end, deliberately.

    The connection outlives this function — the caller still has to query
    through it and close it — so, unlike `_client_as`'s throwaway setup
    connection, this one cannot be closed unconditionally in a `finally`. What
    it can do is not leak *during setup*: `db.migrate`, `seed.seed` and the two
    inserts below run before anyone holds a reference to `conn` outside this
    function, so an exception among them left nothing for any caller to close.
    """
    n = next(_seq)
    username = f"0913{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"gate-{n}.db")
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
        user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    except Exception:
        conn.close()
        raise
    return conn, Disclosure(conn, user)


def _confirm(client, target: str, path: str) -> None:
    """Vouch for the document at `path` directly in the store.

    Directly, not through the endpoint, because the endpoint is Task 8's and this
    file is about what the *gate* does with a confirmation that exists.
    """
    doc = json.loads((client.data_root / path).read_text(encoding="utf-8"))
    conn = db.connect(client.app_db)
    try:
        confirmations.set_confirmation(conn, target=target,
                                       fingerprint=fingerprint(doc),
                                       by="09190000000", at=int(time.time()))
    finally:
        conn.close()


P1 = "departments/dining/processes/dining-001.json"
OV = "departments/dining/overview.json"


# --- D23: the system starts dark ---

def test_a_reader_sees_an_empty_department_until_something_is_confirmed(corpus,
                                                                        tmp_path):
    """D23 — all 85 existing processes start unconfirmed, so a non-editor sees an
    empty system until an Editor reviews each one."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    assert client.get("/api/departments/dining/processes").json() == []
    assert client.get("/api/processes/dining-001").status_code == 404
    assert client.get("/api/departments/dining/overview").status_code == 404


def test_an_editor_sees_the_unconfirmed_department_in_full(corpus, tmp_path):
    """The pairing. Without it, every assertion above holds against a backend
    that serves nobody anything — the failure this whole file would otherwise
    have no way to notice."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    assert len(client.get("/api/departments/dining/processes").json()) == 2
    assert client.get("/api/processes/dining-001").status_code == 200
    assert client.get("/api/departments/dining/overview").status_code == 200


# --- confirming makes it appear, and only it ---

def test_confirming_one_process_shows_that_one_and_no_other(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    listed = client.get("/api/departments/dining/processes").json()
    assert [p["id"] for p in listed] == ["dining-001"]
    assert client.get("/api/processes/dining-001").status_code == 200
    # dining-002 is still unconfirmed, and its id must not appear anywhere.
    assert client.get("/api/processes/dining-002").status_code == 404
    assert "dining-002" not in json.dumps(listed, ensure_ascii=False)


def test_confirming_the_overview_is_a_separate_decision(corpus, tmp_path):
    """D20/D55 — the target is a process id **or** a department code, and one
    does not imply the other."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    assert client.get("/api/departments/dining/overview").status_code == 404
    _confirm(client, "dining", OV)
    assert client.get("/api/departments/dining/overview").status_code == 200


# --- the mark is a fingerprint, so it self-invalidates ---

def test_editing_a_confirmed_process_hides_it_again(corpus, tmp_path):
    """The whole reason the mark is a fingerprint and not a boolean (D20).

    Nothing clears anything here: the file changes and the stored fingerprint
    stops matching. A boolean would need the UI's Save, a chat edit and a `merge`
    run each to remember, and missing one leaves the mark vouching for something
    stale.
    """
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    assert client.get("/api/processes/dining-001").status_code == 200

    path = corpus / P1
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][0]["position"] = {"x": 61, "y": 60}     # a re-layout, D21
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    assert client.get("/api/processes/dining-001").status_code == 404
    assert client.get("/api/departments/dining/processes").json() == []


def test_a_pipeline_run_touching_provenance_leaves_it_visible(corpus, tmp_path):
    """The other side of D21's exclusions, end to end: ARD §5.3 writes
    `source.touched_by` for processes a run decided were unchanged, and if that
    un-confirmed them a voice run would empty every department head's screen."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    path = corpus / P1
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["source"]["run"] = "runs/chat/20260811-090000"
    doc["updated_at"] = "2026-08-11T09:00:00Z"
    doc["nodes"][0]["source"]["touched_by"] = ["merge"]
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    assert client.get("/api/processes/dining-001").status_code == 200


# --- the refusal reveals nothing ---

def test_an_unconfirmed_process_is_404_and_not_403(corpus, tmp_path):
    """D56's Existence row. A 403 would let a reader enumerate which ids are
    processes an Editor has not got round to yet — and the body must be the one
    uniform 404 too, or the words say what the number stopped saying."""
    from inja_ui_backend.access import NOT_FOUND
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    r = client.get("/api/processes/dining-001")
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})


# --- the derived signals go with the records ---

def test_the_board_counts_only_what_the_caller_can_open(corpus, tmp_path):
    """D56's derived-signals row. A count of three beside a list of one answers
    'how much is being withheld from you', which is the question the filter
    exists to refuse."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 0
    _confirm(client, "dining-001", P1)
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 1
    assert len(client.get("/api/departments/dining/processes").json()) == 1


def test_an_editors_board_still_counts_the_unconfirmed(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 2


def test_the_boards_subs_counts_only_what_the_caller_can_open(corpus, tmp_path):
    """D56's derived-signals row, applied to `subs` rather than `count`.

    No fixture before this one had an unconfirmed process whose *parent* is
    visible, so `subs` — read over `active`, the already-gated set — and a
    mutant reading it over every non-tombstoned document regardless of its own
    confirmation both pass every other test in this file. This is the one that
    tells them apart: a reader in a department where the parent is confirmed
    and the child is not must be served a badge that counts neither the child
    nor a sub-process they cannot open, while an editor's board counts it.
    """
    sub = _proc("dining-005", "dining", "زیرفرآیند")
    sub["parent"] = {"process": "dining-001", "node": "dining-001-n010"}
    (corpus / "departments/dining/processes/dining-005.json").write_text(
        json.dumps(sub, ensure_ascii=False), encoding="utf-8")

    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 1
    # dining-005 is unconfirmed: the badge must not count it just because its
    # parent, dining-001, is one this reader can open.
    assert row["subs"] == 0

    editor = _client_as(corpus, tmp_path, "editor", "dept:dining")
    erow = next(d for d in editor.get("/api/departments").json()
                if d["code"] == "dining")
    assert erow["subs"] == 1


# --- the fourth handed-down debt ---

def test_pending_skips_a_tombstoned_process(corpus, tmp_path):
    """A tombstone's unresolved proposals are proposals about a record D17
    excludes entirely. Edit-gated, so this was never a disclosure — it was an
    Editor being asked to resolve a conflict on a document nobody will read.
    """
    doc = _proc("dining-003", "dining", "باطل")
    doc["tombstoned"] = True
    doc["superseded_by"] = []
    doc["pending"] = [{"node": "dining-003-n010", "field": "actor",
                       "current": "الف", "proposed": "TOMBPROPOSAL",
                       "source": "runs/x", "status": "open"}]
    (corpus / "departments/dining/processes/dining-003.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    live = _proc("dining-004", "dining", "زنده")
    live["pending"] = [{"node": "dining-004-n010", "field": "actor",
                        "current": "ب", "proposed": "LIVEPROPOSAL",
                        "source": "runs/x", "status": "open"}]
    (corpus / "departments/dining/processes/dining-004.json").write_text(
        json.dumps(live, ensure_ascii=False), encoding="utf-8")

    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    body = client.get("/api/pending").json()
    # The live one is present, which is what stops "the tombstone is gone" from
    # meaning "the endpoint returns nothing".
    assert [p["proposed"] for p in body] == ["LIVEPROPOSAL"]


# --- the two mutants the tests above left alive ---

def test_a_whole_department_costs_one_confirmation_query(corpus, tmp_path):
    """D56's *"filtered in the query"*, taken literally — and `servable`'s own
    docstring claims it: *one statement resolves the whole department*.

    `confirmations.stored_for` exists for exactly this and its own test pins that
    **it** runs one statement. That says nothing about its caller: a `servable`
    rewritten as `confirmations.get` inside the comprehension is behaviourally
    identical, passes every other assertion in this file, and turns the largest
    department's listing into 38 round trips on the one connection the whole
    service shares. This is the only thing that can notice.

    Counted with sqlite's own trace callback rather than by inspecting the code,
    so a third way of asking the same question is caught too. The `Disclosure` is
    built before the callback is armed: `permits` and `policy.current` are the
    per-request reads Task 6 hoisted, and they are not what is under test here.

    Half the eight are confirmed and half are not — `== []` alone is satisfied
    by any `servable` that returns nothing, confirmed corpus or not, so the
    assertion here is that batching returns exactly the four confirmed rows and
    none of the other four, not merely that it costs one query to return
    whatever it returns.
    """
    conn, shown = _disclosure_as(corpus, tmp_path, "reader", "dept:dining")
    docs = [_proc(f"dining-{i:03d}", "dining", f"ف{i}") for i in range(1, 9)]
    confirmed = docs[::2]
    for doc in confirmed:
        confirmations.set_confirmation(conn, target=doc["id"],
                                       fingerprint=fingerprint(doc),
                                       by="09190000000", at=int(time.time()))
    statements = []
    conn.set_trace_callback(statements.append)
    try:
        result = shown.servable(docs, "dining")
    finally:
        conn.set_trace_callback(None)
        conn.close()

    assert [d["id"] for d in result] == [d["id"] for d in confirmed], (
        "batching over a mixed corpus did not return exactly the confirmed"
        " rows")

    asked = [s for s in statements if "confirmations" in s]
    assert len(asked) == 1, (
        f"{len(docs)} processes cost {len(asked)} queries against"
        f" `confirmations`: the department is being resolved one document at a"
        f" time.\n" + "\n".join(f"  {s}" for s in asked))
    # …and the one statement really was the batch one, not a single `get` that
    # happened to be all this loop asked for.
    assert " IN (" in asked[0], asked[0]


def test_the_confirmation_target_is_the_routes_and_not_the_documents_own_id(
        corpus, tmp_path):
    """`may_serve`'s third argument, and the reason it has one.

    The same discipline `redact`'s `dept` follows and `_pid_target` states in as
    many words: the string is the one the **route** was gated on, never one read
    out of the file. Nothing revalidates a stored document on read, so a file
    whose `id` disagrees with its own name is a file that decides, by itself,
    which confirmation vouches for it.

    Told apart with a **byte-for-byte copy** of a confirmed process saved under a
    second name, because that is the one case where the two answers differ: the
    fingerprint matches whichever way the target is read, so only the target
    itself can refuse it. Read from the document, `dining-004` inherits
    `dining-001`'s confirmation and a record nobody vouched for is served under
    an id nobody confirmed.
    """
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    assert client.get("/api/processes/dining-001").status_code == 200  # premise

    copy_of_it = (corpus / P1).read_text(encoding="utf-8")
    (corpus / "departments/dining/processes/dining-004.json").write_text(
        copy_of_it, encoding="utf-8")     # still claims `"id": "dining-001"`

    assert client.get("/api/processes/dining-004").status_code == 404, (
        "the gate looked up the confirmation under the id inside the file: a"
        " copy of a confirmed document is not a confirmed document")
