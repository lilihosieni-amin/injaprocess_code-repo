"""The facts read routes (spec §17, QF-23, QF-26, §14 notes 1 and 5).

The gate matrix §17 states is what this file is mostly about, and it is not the
one every other route in this service runs:

* **The capability arm is an OR and its refusal is a 404.** Facts are a Panel
  surface (QF-23) and are not in the reader view (§18), so the question is not
  "does this caller hold `view`?" but "is this caller in the Panel at all?" —
  any of `PANEL_CAPABILITIES`. A holder of `view` alone is answered the uniform
  404 rather than a 403, because a 403 would say *there are facts here* to
  somebody who is never to learn it.
* **The scope arm is an AND over every department the entry names** (QF-27), so
  a cooking editor does not read an entry that also binds accounting, and a
  universal entry — `scope.departments == []` — is reachable only at `*`.
* An **admin** is a non-editor: `may_serve` withholds an entry with no valid
  confirmation and QF-26's switches hide whole kinds. An **editor** of every
  department the entry names sees everything, unconfirmed included.

`test_endpoint_matrix.py` carries the rows that pin the routes against every
*other* route in the service; what cannot live there is the OR above, because
that file's two 403 tests exist to name one capability. So it lives here.
"""
import copy
import itertools
import json

from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fact_fingerprint
from inja_ui_backend.store import confirmations, policy, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()

RULE = "F-00001"          # cooking, confirmed, consumes the item, links a process
RECORD = "F-00002"        # universal, disputed (red)
ITEM = "F-00003"          # cooking + accounting — the AND case
NOTE = "F-00004"          # dining only
MEASUREMENT = "F-00005"   # cooking, retired + stub

#: The planted store. Hand-written, like `conftest`'s: CLAUDE.md's merge-only
#: rule binds the live `facts/**`, not a served fixture.
ENTRIES = [
    {"id": RULE, "kind": "rule", "key": "test_declared_use",
     "title": "قانون آزمایشی", "aliases": ["مصرف اعلامی"],
     "statement": "بیانیهٔ آزمایشی",
     "scope": {"departments": ["cooking"], "branches": []},
     "source": [{"type": "chat", "ref": "meetings/transcripts/t-01.md"}],
     "accounts": [{"account_id": "a1", "field": "title", "status": "rejected",
                   "statement": "روایت رد شده", "speaker_role": "chef",
                   "source": {"type": "chat",
                              "ref": "meetings/transcripts/t-02.md"}}],
     "processes": [{"ref": "cooking-001", "node": "cooking-001-n010"}],
     "status": "confirmed", "retired": False,
     "updated_at": "2026-07-06T10:00:00Z",
     "data": {"inputs": [{"key": "stock", "title": "موجودی",
                          "from": {"ref": ITEM}}],
              "outputs": []}},
    {"id": RECORD, "kind": "record", "key": "test_monde_shab",
     "title": "رکورد آزمایشی", "statement": "بیانیهٔ آزمایشی",
     "scope": {"departments": [], "branches": []},
     "source": [{"type": "sheet", "ref": "attachments/sheets/w-01.json"}],
     "accounts": [{"account_id": "a2", "field": "data/cadence", "status": "open",
                   "statement": "روایت باز", "speaker_role": "manager",
                   "source": {"type": "chat",
                              "ref": "meetings/transcripts/t-03.md"}}],
     "status": "disputed", "retired": False,
     "updated_at": "2026-07-06T10:00:00Z",
     "data": {"medium": "paper", "role": "log", "grain": None, "location": {}}},
    {"id": ITEM, "kind": "item", "key": "test_ghaarch",
     "title": "قارچ", "scope": {"departments": ["cooking", "accounting"],
                                "branches": []},
     "source": [], "status": "confirmed", "retired": False,
     "updated_at": "2026-07-06T10:00:00Z",
     "data": {"code": "ing_41", "base_unit": "g"}},
    {"id": NOTE, "kind": "note", "key": "test_yaddasht",
     "title": "یادداشت آزمایشی", "statement": "متن یادداشت",
     "scope": {"departments": ["dining"], "branches": []},
     "source": [], "status": "confirmed", "retired": False,
     "updated_at": "2026-07-06T10:00:00Z", "data": {}},
    {"id": MEASUREMENT, "kind": "measurement", "key": "test_andaaze",
     "title": "اندازهٔ آزمایشی",
     "scope": {"departments": ["cooking"], "branches": []},
     "source": [], "status": "confirmed", "retired": True,
     "updated_at": "2026-07-06T10:00:00Z",
     "data": {"quantity": "mass", "unit": "g", "stub": True}},
]

_FILES = {"item": "items.json", "record": "records.json",
          "measurement": "measurements.json", "rule": "rules.json",
          "note": "notes.json"}


def _index_row(entry: dict) -> dict:
    """One index row, built exactly the way `merge_facts.build_index` builds it
    — the flattened columns the list route reads (`field_status_counts`,
    `processes`, `stub`) included, which `conftest`'s two-entry fixture does
    not carry."""
    accounts = entry.get("accounts") or []
    data = entry.get("data") or {}
    return {"id": entry["id"], "kind": entry["kind"], "key": entry["key"],
            "title": entry["title"], "aliases": entry.get("aliases") or [],
            "scope": entry["scope"], "status": entry["status"],
            "field_status_counts": {
                "disputed": sum(1 for a in accounts if a.get("status") == "open"),
                "unknown": sum(1 for k, v in data.items() if v is None),
                "informal": 0, "inferred": 0},
            "processes": [p["ref"] for p in entry.get("processes") or []],
            "retired": entry.get("retired", False),
            "stub": bool(data.get("stub")),
            "updated_at": entry["updated_at"]}


def _plant(data_root, entries=None):
    """Rewrite `facts/` with `entries` (default: `ENTRIES`) and its index."""
    entries = ENTRIES if entries is None else entries
    by_kind = {}
    for entry in entries:
        by_kind.setdefault(entry["kind"], []).append(entry)
    for kind, filename in _FILES.items():
        (data_root / "facts" / filename).write_text(
            json.dumps({"schema_version": 1, "entries": by_kind.get(kind, [])},
                       ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (data_root / "facts" / ".index.json").write_text(
        json.dumps({"schema_version": 1,
                    "entries": [_index_row(e) for e in entries]},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _manifest(data_root, workbooks, branches=()):
    path = data_root / "attachments" / "sheets"
    path.mkdir(parents=True, exist_ok=True)
    (path / "manifest.json").write_text(
        json.dumps({"schema_version": 1, "branches": list(branches),
                    "workbooks": list(workbooks)}, ensure_ascii=False),
        encoding="utf-8")


def _client_as(data_root, tmp_path, role, *scopes, app_db=None):
    """A signed-in client for a fresh account.

    Its own `app.db` by default; `app_db` puts a second caller on the first
    one, for the tests that need two roles to see the same confirmation marks
    and the same visibility policy.
    """
    n = next(_seq)
    username = f"0915{n:07d}"
    cfg = cfg_for(data_root, app_db or tmp_path / f"facts-api-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?",
                           (role,)).fetchone()[0]
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
    return client


def _confirm(client, *fact_ids):
    """Vouch for each entry at its current print, straight at the store.

    A mark is a *precondition* for the tests below, not the thing under test:
    `POST /api/confirmations/{fid}` has its own gate, its own echoed
    fingerprint and its own 409 for a red entry, all of which are
    `test_facts_confirmations.py`'s subject — and half the callers here hold no
    `confirm` at all, which is the point of the assertions rather than an
    obstacle to work around.
    """
    conn = db.connect(client.app_db)
    try:
        for fid in fact_ids:
            entry = next(e for e in ENTRIES if e["id"] == fid)
            confirmations.set_confirmation(
                conn, target=fid, fingerprint=fact_fingerprint(entry),
                by="09190000000", at=1770000000)
    finally:
        conn.close()


def _switch(client, field, visible):
    conn = db.connect(client.app_db)
    try:
        policy.set_field(conn, field, visible)
    finally:
        conn.close()


def _ids(body) -> list[str]:
    return [row["id"] for row in body["entries"]]


# --------------------------------------------------------------------------
# The Panel gate: a `view`-only holder is 404'd off every facts route (§18)
# --------------------------------------------------------------------------

def test_a_view_only_holder_is_404_on_every_facts_route(data_root, tmp_path):
    """Not an empty list and not a 403 — the same body the gate answers with.

    A reader holds `view`, `comment` and `export_pdf` and no Panel capability,
    and is given `*` so that scope cannot be what refuses them: the refusal has
    to be about the surface, which is what QF-23 says and what §18 records as a
    deliberate v1 ceiling.
    """
    client = _client_as(data_root, tmp_path, "reader", "*")
    _plant(data_root)
    for path in ("/api/facts", "/api/facts/branches", f"/api/facts/{RULE}",
                 "/api/facts?consumes=" + ITEM):
        r = client.get(path)
        assert r.status_code == 404, f"{path} answered {r.status_code}"
        assert r.json()["detail"] == NOT_FOUND, path


def test_an_admin_is_in_the_panel_and_reads_facts(data_root, tmp_path):
    """The other half of the OR: `manage_users`/`view_audit` are Panel
    capabilities, so an admin is served — which is what makes the reader's 404
    above a statement about the Panel rather than about capabilities in
    general."""
    client = _client_as(data_root, tmp_path, "admin", "*")
    _plant(data_root)
    _confirm(client, RULE)
    r = client.get("/api/facts")
    assert r.status_code == 200, r.text
    assert RULE in _ids(r.json())


# --------------------------------------------------------------------------
# The scope arm: AND over every department, `*` for a universal entry (QF-27)
# --------------------------------------------------------------------------

def test_an_entry_binding_two_departments_needs_reach_in_both(data_root, tmp_path):
    _plant(data_root)
    one = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    both = _client_as(data_root, tmp_path, "editor", "dept:cooking",
                      "dept:accounting")
    assert one.get(f"/api/facts/{ITEM}").status_code == 404
    assert ITEM not in _ids(one.get("/api/facts").json())
    assert both.get(f"/api/facts/{ITEM}").status_code == 200
    assert ITEM in _ids(both.get("/api/facts").json())


def test_a_universal_entry_is_reachable_only_at_the_wildcard(data_root, tmp_path):
    """`scope.departments == []` has no target string `contains` can answer
    for, so it is `*` or nothing — the explicit disjunct QF-23 asks for, not a
    department that happens to be absent."""
    _plant(data_root)
    scoped = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    wild = _client_as(data_root, tmp_path, "editor", "*")
    assert scoped.get(f"/api/facts/{RECORD}").status_code == 404
    assert RECORD not in _ids(scoped.get("/api/facts").json())
    assert wild.get(f"/api/facts/{RECORD}").status_code == 200
    assert RECORD in _ids(wild.get("/api/facts").json())


def test_the_list_never_names_an_entry_the_detail_route_refuses(data_root, tmp_path):
    """One gate, two routes. A list row the detail 404s is a dead link drawn by
    the server itself, and it is exactly what a per-route copy of the scope rule
    produces the first time the two drift."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    for fid in _ids(client.get("/api/facts").json()):
        assert client.get(f"/api/facts/{fid}").status_code == 200, fid


def test_the_index_row_never_widens_what_the_entry_scopes(data_root, tmp_path):
    """`.index.json` is derived, so it can disagree with the store it indexes —
    a store written by one version and indexed by another. The list is built
    from the index but **gated on the entry**, because the detail route has
    only the entry: gate on the row and the list names an entry the detail
    404s, which is the same dead link the other direction.
    """
    _plant(data_root)
    index = json.loads((data_root / "facts" / ".index.json").read_text(
        encoding="utf-8"))
    row = next(r for r in index["entries"] if r["id"] == NOTE)   # really dining
    row["scope"] = {"departments": ["cooking"], "branches": []}
    (data_root / "facts" / ".index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8")

    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert client.get(f"/api/facts/{NOTE}").status_code == 404
    assert NOTE not in _ids(client.get("/api/facts").json())


# --------------------------------------------------------------------------
# An admin is a non-editor: `may_serve` and QF-26's switches (§14 note 5)
# --------------------------------------------------------------------------

def test_an_admins_list_omits_an_entry_with_no_valid_confirmation(data_root,
                                                                  tmp_path):
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    editor = _client_as(data_root, tmp_path, "editor", "*", app_db=admin.app_db)
    _confirm(admin, RULE)
    assert _ids(admin.get("/api/facts").json()) == [RULE]
    # The editor's list is the control: the entries are all there, so the
    # admin's short list is the record gate and not an empty store.
    assert set(_ids(editor.get("/api/facts").json())) == {e["id"] for e in ENTRIES}


def test_an_admin_is_404d_off_an_entry_with_no_valid_confirmation(data_root,
                                                                  tmp_path):
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    assert admin.get(f"/api/facts/{NOTE}").status_code == 404
    _confirm(admin, NOTE)
    assert admin.get(f"/api/facts/{NOTE}").status_code == 200


def test_a_mark_that_no_longer_matches_is_not_a_confirmation(data_root, tmp_path):
    """D22's rule, per entry (QF-24): a stored mark is only a confirmation while
    its fingerprint still matches the bytes. Any `merge` write moves it."""
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    # The same `app.db`, so the editor's listing reads the mark the admin's
    # store carries — two databases would make the second assertion below pass
    # for the wrong reason.
    editor = _client_as(data_root, tmp_path, "editor", "*", app_db=admin.app_db)
    _confirm(admin, RULE)
    assert admin.get(f"/api/facts/{RULE}").status_code == 200
    assert [r["confirmed"] for r in editor.get("/api/facts").json()["entries"]
            if r["id"] == RULE] == [True]

    moved = copy.deepcopy(ENTRIES)
    next(e for e in moved if e["id"] == RULE)["title"] = "عنوان تازه"
    _plant(data_root, moved)

    # The mark is still in the table; it simply no longer matches the bytes.
    assert admin.get(f"/api/facts/{RULE}").status_code == 404
    assert [r["confirmed"] for r in editor.get("/api/facts").json()["entries"]
            if r["id"] == RULE] == [False]


def test_a_kind_whose_switch_is_off_is_absent_from_an_admins_list(data_root,
                                                                 tmp_path):
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    _confirm(admin, RULE, ITEM, NOTE)
    assert set(_ids(admin.get("/api/facts").json())) == {RULE, ITEM, NOTE}
    _switch(admin, "fact_rules", False)
    assert set(_ids(admin.get("/api/facts").json())) == {ITEM, NOTE}


def test_a_kind_whose_switch_is_off_is_a_404_for_an_admin_and_not_for_an_editor(
        data_root, tmp_path):
    """The switches govern the *non-editor* view (QF-26), exactly as D17's
    column does — an editor is the person the hidden content is for."""
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    # One `app.db`, so both callers read the *same* policy: two databases would
    # leave the editor on the default and the assertion would say nothing.
    editor = _client_as(data_root, tmp_path, "editor", "*", app_db=admin.app_db)
    _confirm(admin, ITEM)
    _switch(admin, "fact_items", False)
    assert admin.get(f"/api/facts/{ITEM}").status_code == 404
    assert editor.get(f"/api/facts/{ITEM}").status_code == 200


def test_with_fact_sources_off_the_served_entry_carries_no_sources(data_root,
                                                                  tmp_path):
    """`source[]` **and** `accounts[].source` (QF-26). The account itself stays
    — the accounts card is how a dispute is settled, and it is the provenance
    behind each account that the switch withholds."""
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    editor = _client_as(data_root, tmp_path, "editor", "*", app_db=admin.app_db)
    _confirm(admin, RULE)
    _switch(admin, "fact_sources", False)

    entry = admin.get(f"/api/facts/{RULE}").json()["entry"]
    assert "source" not in entry
    assert [a.get("source") for a in entry["accounts"]] == [None]
    assert entry["accounts"][0]["speaker_role"] == "chef"   # the account stays
    assert "t-02.md" not in json.dumps(entry, ensure_ascii=False)

    seen = editor.get(f"/api/facts/{RULE}").json()["entry"]
    assert seen["source"] and seen["accounts"][0]["source"]


# --------------------------------------------------------------------------
# The list's shape (§14 note 1) and its envelope
# --------------------------------------------------------------------------

def test_the_list_row_carries_exactly_the_declared_columns(data_root, tmp_path):
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    body = client.get("/api/facts").json()
    row = next(r for r in body["entries"] if r["id"] == RULE)
    assert set(row) == {"id", "kind", "key", "title", "aliases", "scope",
                        "status", "retired", "stub", "red_counts",
                        "fingerprint", "confirmed", "updated_at"}
    assert row["kind"] == "rule" and row["key"] == "test_declared_use"
    assert row["title"] == "قانون آزمایشی" and row["aliases"] == ["مصرف اعلامی"]
    assert row["scope"] == {"departments": ["cooking"], "branches": []}
    assert row["status"] == "confirmed"
    assert row["retired"] is False and row["stub"] is False
    assert row["confirmed"] is False
    assert row["fingerprint"] == fact_fingerprint(
        next(e for e in ENTRIES if e["id"] == RULE))
    assert row["updated_at"] == "2026-07-06T10:00:00Z"


def test_a_red_row_carries_its_two_counts_and_a_stub_row_its_badge(data_root,
                                                                   tmp_path):
    """§14 note 1: the counts sit beside the two-value chip, so they are two
    numbers on the row and never folded into `status`."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    rows = {r["id"]: r for r in client.get("/api/facts").json()["entries"]}
    assert rows[RECORD]["red_counts"] == {"unknown": 1, "disputed": 1}
    assert rows[RULE]["red_counts"] == {"unknown": 0, "disputed": 0}
    assert rows[MEASUREMENT]["stub"] is True
    assert rows[MEASUREMENT]["retired"] is True


def test_the_envelope_carries_the_coverage_line(data_root, tmp_path):
    """`{read, total}` over the manifest's workbooks — a record that names one
    has read it, a store that names none has read none."""
    _plant(data_root)
    _manifest(data_root, [{"spreadsheetId": "w-01"}, {"spreadsheetId": "w-02"}])
    client = _client_as(data_root, tmp_path, "editor", "*")
    assert client.get("/api/facts").json()["coverage"] == {"read": 0, "total": 2}

    located = copy.deepcopy(ENTRIES)
    next(e for e in located if e["id"] == RECORD)["data"]["location"] = {
        "spreadsheetId": "w-01"}
    _plant(data_root, located)
    assert client.get("/api/facts").json()["coverage"] == {"read": 1, "total": 2}


def test_an_absent_facts_store_serves_an_empty_list_and_not_a_500(data_root,
                                                                  tmp_path):
    """A deployment before its first `merge facts` run. `facts_store`'s
    never-raise discipline reaches the routes: an unanswerable question is a
    value, never an exception."""
    for name in list(_FILES.values()) + [".index.json"]:
        (data_root / "facts" / name).unlink()
    (data_root / "facts").rmdir()
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.get("/api/facts")
    assert r.status_code == 200, r.text
    assert r.json() == {"entries": [], "coverage": {"read": 0, "total": 0}}
    assert client.get(f"/api/facts/{RULE}").status_code == 404
    assert client.get("/api/facts/branches").json() == []


def test_a_malformed_store_answers_rather_than_crashing(data_root, tmp_path):
    """`facts_store`'s never-raise discipline reaches the routes.

    Three shapes a hand-edited store can really be in, none of which may reach
    a 500: an index that is not an object at all, a row with no entry behind
    it, and an entry whose own `kind` is outside the five — which
    `visibility.filtered` would otherwise send down the *process* branch and
    hand back as a whitelisted husk.
    """
    _plant(data_root, [e for e in ENTRIES if e["id"] in (RULE, NOTE)])
    client = _client_as(data_root, tmp_path, "editor", "*")

    # An entry the index names but no kind file holds.
    (data_root / "facts" / "notes.json").write_text(
        json.dumps({"schema_version": 1, "entries": []}), encoding="utf-8")
    # And one whose stored `kind` is not a fact kind at all.
    rules = json.loads((data_root / "facts" / "rules.json").read_text(
        encoding="utf-8"))
    rules["entries"][0]["kind"] = "process"
    (data_root / "facts" / "rules.json").write_text(
        json.dumps(rules, ensure_ascii=False), encoding="utf-8")

    r = client.get("/api/facts")
    assert r.status_code == 200, r.text
    assert _ids(r.json()) == []
    assert client.get(f"/api/facts/{RULE}").status_code == 404
    assert client.get(f"/api/facts/{NOTE}").status_code == 404

    (data_root / "facts" / ".index.json").write_text("[]", encoding="utf-8")
    r = client.get("/api/facts")
    assert r.status_code == 200, r.text
    assert _ids(r.json()) == []


# --------------------------------------------------------------------------
# The two filters, through Task 18's reverse walk
# --------------------------------------------------------------------------

def test_the_consumes_filter_returns_the_consuming_rule(data_root, tmp_path):
    """QF-39's reverse index: the rule's `inputs[].from` names the item, so
    asking what consumes the item answers with the rule and nothing else."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    assert _ids(client.get(f"/api/facts?consumes={ITEM}").json()) == [RULE]
    assert _ids(client.get(f"/api/facts?consumes={NOTE}").json()) == []
    # An id the grammar refuses reaches nothing rather than everything.
    assert _ids(client.get("/api/facts?consumes=F-1").json()) == []


def test_the_process_filter_returns_the_entries_that_link_it(data_root, tmp_path):
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    assert _ids(client.get("/api/facts?process=cooking-001").json()) == [RULE]
    assert _ids(client.get("/api/facts?process=dining-002").json()) == []
    assert _ids(client.get("/api/facts?process=nonsense").json()) == []


def test_a_filter_never_widens_the_gate(data_root, tmp_path):
    """The filters narrow a list that has already been scoped; a query
    parameter is not a way back into an entry the caller cannot reach."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:accounting")
    assert _ids(client.get(f"/api/facts?consumes={ITEM}").json()) == []


# --------------------------------------------------------------------------
# The bundle
# --------------------------------------------------------------------------

def test_the_bundle_carries_every_map_a_screen_needs(data_root, tmp_path):
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    body = client.get(f"/api/facts/{RULE}").json()
    assert set(body) == {"entry", "confirmation", "red_paths", "resolved",
                         "row_titles", "path_labels", "consumers", "processes"}
    assert body["entry"]["id"] == RULE
    assert body["confirmation"] == {
        "fingerprint": fact_fingerprint(
            next(e for e in ENTRIES if e["id"] == RULE)),
        "confirmed": False, "can_confirm": True}
    assert body["red_paths"] == {"unknown": [], "disputed": []}
    # The item the rule reads, and the process it cites, both resolved to their
    # Persian titles — §17's "nothing served is a bare key".
    assert body["resolved"][ITEM]["title"] == "قارچ"
    assert body["resolved"]["cooking-001"]["kind"] == "process"
    assert [p["ref"] for p in body["processes"]] == ["cooking-001"]
    assert body["consumers"] == []
    # And the reverse edge, from the item's own bundle.
    item = client.get(f"/api/facts/{ITEM}").json()
    assert [c["id"] for c in item["consumers"]] == [RULE]


def test_a_red_entry_cannot_be_confirmed_and_says_so(data_root, tmp_path):
    """QF-25: red wins over green, so the bundle reports the tick as
    unavailable — the same state the confirm endpoint answers 409 for."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    body = client.get(f"/api/facts/{RECORD}").json()
    # The print is served even for a red entry — the state is reported, and it
    # is the *endpoint* that refuses the tick with 409.
    assert body["confirmation"] == {
        "fingerprint": fact_fingerprint(
            next(e for e in ENTRIES if e["id"] == RECORD)),
        "confirmed": False, "can_confirm": False}
    assert body["red_paths"] == {"unknown": ["data/grain"],
                                 "disputed": ["data/cadence"]}
    assert set(body["path_labels"]) == {"data/grain", "data/cadence"}


def test_an_admin_holds_no_confirm_and_the_bundle_says_so(data_root, tmp_path):
    _plant(data_root)
    admin = _client_as(data_root, tmp_path, "admin", "*")
    _confirm(admin, RULE)
    body = admin.get(f"/api/facts/{RULE}").json()
    assert body["confirmation"] == {
        "fingerprint": fact_fingerprint(
            next(e for e in ENTRIES if e["id"] == RULE)),
        "confirmed": True, "can_confirm": False}


def test_a_served_fingerprint_round_trips_through_the_confirm_endpoint(
        data_root, tmp_path):
    """The point of serving the print at all: the tick has to be **pressable**.

    `POST /api/confirmations/{fid}` refuses any print but the entry's current
    one (409), and QF-24 forbids the client computing one — so a screen can
    only act on a print this service handed it. Both surfaces hand one over
    (which is a pressable tick is a Task 21 design question), so both are
    round-tripped here rather than only the one that happens to be wired first.

    The 200 is the assertion. A hard-coded string, or a print taken from
    anywhere but these two bodies, would answer 409 — which is exactly what
    Task 23 would have hit.
    """
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")

    row = next(r for r in client.get("/api/facts").json()["entries"]
               if r["id"] == RULE)
    r = client.post(f"/api/confirmations/{RULE}",
                    json={"fingerprint": row["fingerprint"]})
    assert r.status_code == 200, r.text
    assert r.json()["confirmed"] is True

    # And the bundle's, on a second entry, so neither surface is passing on the
    # other's work.
    bundle = client.get(f"/api/facts/{ITEM}").json()
    r = client.post(f"/api/confirmations/{ITEM}",
                    json={"fingerprint": bundle["confirmation"]["fingerprint"]})
    assert r.status_code == 200, r.text

    # And the listing now reports both as confirmed — the state the client was
    # shown, the act it performed, and the state it is shown next, all keyed on
    # one string it never computed.
    rows = {x["id"]: x for x in client.get("/api/facts").json()["entries"]}
    assert rows[RULE]["confirmed"] is True and rows[ITEM]["confirmed"] is True


def test_an_id_that_is_not_in_the_store_is_the_uniform_404(data_root, tmp_path):
    """An id nobody minted and an id somebody is not scoped to must be
    indistinguishable (D56) — same status, same body."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    absent = client.get("/api/facts/F-99999")
    outside = client.get(f"/api/facts/{NOTE}")
    nonsense = client.get("/api/facts/not-an-id")
    for r in (absent, outside, nonsense):
        assert r.status_code == 404, r.text
    assert len({r.text for r in (absent, outside, nonsense)}) == 1


# --------------------------------------------------------------------------
# Branches
# --------------------------------------------------------------------------

def test_branches_come_from_the_manifest(data_root, tmp_path):
    """QF-4: the manifest is the only place a branch is declared."""
    _plant(data_root)
    _manifest(data_root, [], branches=[{"code": "shab", "name": "شعبهٔ شب"}])
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.get("/api/facts/branches")
    assert r.status_code == 200, r.text
    assert r.json() == [{"code": "shab", "name": "شعبهٔ شب"}]


def test_branches_is_not_swallowed_by_the_detail_route(data_root, tmp_path):
    """`/branches` is not an `F-` id, so a detail route registered ahead of it
    would answer the uniform 404 and the screen would lose its filter."""
    _plant(data_root)
    _manifest(data_root, [], branches=[{"code": "shab", "name": "شعبهٔ شب"}])
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert client.get("/api/facts/branches").status_code == 200


# --------------------------------------------------------------------------
# Nothing here writes
# --------------------------------------------------------------------------

def test_reading_facts_writes_nothing_to_the_store(data_root, tmp_path):
    """QF-2: `facts/**` is written by `merge facts` and by nothing else, this
    service included."""
    _plant(data_root)
    before = {p.name: p.read_bytes() for p in (data_root / "facts").iterdir()}
    client = _client_as(data_root, tmp_path, "editor", "*")
    client.get("/api/facts")
    client.get(f"/api/facts/{RULE}")
    client.get("/api/facts/branches")
    assert {p.name: p.read_bytes()
            for p in (data_root / "facts").iterdir()} == before
