"""The facts write route and the source download (spec §17, QF-2, QF-39).

Two routes, and the same Panel gate the three reads carry — a `view`-only
holder is answered the uniform 404 on both, because a 403 says *there is
something here* to precisely the person who is never to learn that facts
exist (QF-23, §18).

What is new here is the second arm, and it is a **named capability** rather
than the reads' OR: `edit` at every department the entry names (QF-27) for the
resolve, `export_pdf` for the download (QF-39, §15). So an **admin** — in the
Panel, and never an editor — is refused 403 on both, which is §17's "an admin
denied on the write routes" and the one thing the read routes could not say.

**The service never edits `facts/*.json`** (QF-2). The resolve route creates a
run directory, writes its `meta.json`, and shells `merge facts resolve`; the
store change is the engine's, the run record is the same one a chat edit
leaves, and `revert` can undo it. `test_the_service_never_writes_the_store_itself`
is that rule as an assertion: with the engine stubbed out to do nothing, the
five kind files come back byte-identical.

**Nothing is ever rendered inline** (QF-39). Every source is a download, so
`content-disposition: attachment` is asserted beside the status on every one
of the three roots — a transcript streamed inline is the failure this route
exists to prevent, and it would pass a status-only test.
"""
import itertools
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, engine, seed
from inja_ui_backend.access import FORBIDDEN, NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fact_fingerprint
from inja_ui_backend.store import confirmations, policy, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()

COOKING = "F-00001"   # cooking-scoped, one field disputed by two open accounts
DINING = "F-00002"    # dining-scoped, disputed — the out-of-scope case
FIELD = "data/base_unit"
CHOSEN = "a1b2c3d4"
OTHER = "e5f6a7b8"

_FILES = {"item": "items.json", "record": "records.json",
          "measurement": "measurements.json", "rule": "rules.json",
          "note": "notes.json"}


def _entry(fid, dept, key, title):
    """One disputed entry a real `merge facts resolve` accepts.

    Hand-written, like `conftest`'s (CLAUDE.md's merge-only rule binds the live
    `facts/**`, not a served fixture) — but **schema-valid**, because one of
    the tests below runs the engine for real and `save_store` validates every
    kind file it writes.
    """
    return {
        "id": fid, "kind": "item", "key": key, "title": title,
        "statement": "بیانیهٔ آزمایشی",
        "scope": {"departments": [dept], "branches": []},
        "source": [{"type": "chat",
                    "ref": "meetings/transcripts/cooking-1405-06-01.txt"}],
        "accounts": [
            {"id": CHOSEN, "field": FIELD, "statement": "روایت آشپز",
             "value": "kg", "speaker_role": "chef", "status": "open",
             "source": {"type": "chat",
                        "ref": "meetings/transcripts/cooking-1405-06-01.txt"}},
            {"id": OTHER, "field": FIELD, "statement": "روایت انباردار",
             "value": "g", "speaker_role": "storekeeper", "status": "open",
             "source": {"type": "chat",
                        "ref": "meetings/transcripts/cooking-1405-06-02.txt"}},
        ],
        "status": "disputed", "retired": False,
        "updated_at": "2026-07-06T10:00:00Z",
        "data": {"category": "ingredient", "unit": "kg", "base_unit": "g"},
    }


ENTRIES = [_entry(COOKING, "cooking", "test_ghaarch", "قارچ"),
           _entry(DINING, "dining", "test_livaan", "لیوان")]

#: A **universal** entry — `scope.departments` empty, so it binds the whole
#: restaurant and is reachable only at `*` (QF-4, QF-27). Planted only by the
#: test that asks where its run directory goes.
UNIVERSAL = {**_entry("F-00003", "cooking", "test_jahaani", "جهانی"),
             "scope": {"departments": [], "branches": []}}


def _plant(data_root, entries=None):
    """The store and its index, as `merge_facts.build_index` would write them."""
    entries = ENTRIES if entries is None else entries
    by_kind = {}
    for entry in entries:
        by_kind.setdefault(entry["kind"], []).append(entry)
    for kind, filename in _FILES.items():
        (data_root / "facts" / filename).write_text(
            json.dumps({"schema_version": 1, "entries": by_kind.get(kind, [])},
                       ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (data_root / "facts" / ".index.json").write_text(
        json.dumps({"schema_version": 1, "entries": [
            {"id": e["id"], "kind": e["kind"], "key": e["key"],
             "title": e["title"], "aliases": [], "scope": e["scope"],
             "status": e["status"],
             "field_status_counts": {"disputed": 2, "unknown": 0,
                                     "informal": 0, "inferred": 0},
             "processes": [], "retired": False, "stub": False,
             "updated_at": e["updated_at"]} for e in entries]},
            ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _store(data_root) -> dict:
    """The five kind files as text — for the "nothing here writes them" pin."""
    return {name: (data_root / "facts" / name).read_text(encoding="utf-8")
            for name in _FILES.values()}


def _client_as(data_root, tmp_path, role, *scopes, capabilities=None):
    """A signed-in client for a fresh account (`test_facts_api._client_as`).

    `capabilities` inserts `role` as a **new** role holding exactly those: no
    seeded role is both in the Panel and short of `export_pdf` (the Editor and
    the Admin hold it, the two Readers hold no Panel capability at all), so the
    download's 403 has no seeded caller and only a built one can pin it. A
    probe, not a claim about a shipping role (D11, D50).
    """
    n = next(_seq)
    username = f"0917{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"facts-write-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        if capabilities is not None:
            conn.execute("INSERT INTO roles (name, capabilities) VALUES (?, ?)",
                         (role, json.dumps(sorted(capabilities))))
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
    client.cfg = cfg
    client.username = username
    return client


def _confirm(client, fid):
    """Vouch for an entry at the store, so a **non-editor** may be served it.

    D22 withholds an entry carrying no valid confirmation from anyone without
    `edit` on it, and the admin below is a non-editor — so without this their
    404 on the read route would be about the missing mark rather than about
    the Panel, and the 403 on the write route would have nothing to contrast
    with. Straight at the store, not through `POST /api/confirmations/{fid}`,
    which answers 409 for a red entry (QF-25) and is another file's subject.
    """
    conn = db.connect(client.cfg.app_db)
    try:
        entry = next(e for e in ENTRIES if e["id"] == fid)
        confirmations.set_confirmation(conn, target=fid,
                                       fingerprint=fact_fingerprint(entry),
                                       by="09190000000", at=1770000000)
    finally:
        conn.close()


def _runs(data_root, dept="cooking"):
    base = data_root / "runs" / "facts" / dept
    return sorted(p for p in base.iterdir()) if base.is_dir() else []


def _meta(run):
    return json.loads((run / "meta.json").read_text(encoding="utf-8"))


def _resolve(client, fid=COOKING, field=FIELD, account=CHOSEN):
    return client.post(f"/api/facts/{fid}/resolve",
                       json={"field": field, "account": account})


# --------------------------------------------------------------------------
# POST /api/facts/{fid}/resolve — the engine writes, the service does not
# --------------------------------------------------------------------------

def test_a_resolve_runs_the_engine_and_serves_the_settled_entry(data_root,
                                                                tmp_path):
    """End to end, with the **real** `merge facts resolve` behind it.

    A stub can be handed the wrong flag names for ever and never notice; this
    is the only test that pins the argv contract (`--id --field --account
    --run`, all four required) against the engine itself, and the run
    directory the verb writes into.

    What comes back is the same bundle `GET /api/facts/{fid}` serves, re-read
    after the write: the chosen account's value is installed at the disputed
    path, the loser is `rejected`, and with no open account left the entry is
    no longer red (§12's `resolve` row).
    """
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = _resolve(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["entry"]["status"] == "confirmed"
    assert body["entry"]["data"]["base_unit"] == "kg"
    assert body["red_paths"]["disputed"] == []
    statuses = {a["id"]: a["status"] for a in body["entry"]["accounts"]}
    assert statuses == {CHOSEN: "chosen", OTHER: "rejected"}
    # …and the store on disk really moved, which is the engine's doing.
    items = json.loads(
        (data_root / "facts" / "items.json").read_text(encoding="utf-8"))
    assert items["entries"][0]["data"]["base_unit"] == "kg"
    # …and both halves are committed. The store and the run directory that
    # says why it moved land in one commit, which is what a confirmation's
    # `data_repo_commit` column is later reconciled against (QF-24); a store
    # left dirty is a change the next `merge` run would carry into somebody
    # else's commit.
    dirty = subprocess.run(["git", "-C", str(data_root), "status", "--porcelain"],
                           capture_output=True, text=True).stdout
    assert dirty == "", f"left uncommitted:\n{dirty}"


def test_the_run_directory_records_a_ui_run(data_root, tmp_path):
    """`runs/facts/{dept}/{stamp}/meta.json`, `origin: "ui"` — the run record
    and the audit trail are the same as from chat (QF-39).

    Every one of `facts-run-meta.schema.json`'s eleven required fields, because
    the schema is what a later `revert` or a resume reads this file under, and
    a `meta.json` short of one of them is a run directory no tool can open.
    """
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert _resolve(client).status_code == 200
    runs = _runs(data_root)
    assert len(runs) == 1, runs
    meta = _meta(runs[0])
    assert meta["origin"] == "ui"
    assert meta["department"] == "cooking"
    assert meta["actor"] == client.username
    assert meta["delta"] == "facts-delta.json"
    assert meta["recordings"] == meta["attachments"] == meta["workbooks"] == []
    assert meta["ids_created"] == []
    assert meta["merged"] is True
    iso = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
    assert iso.fullmatch(meta["started_at"]), meta["started_at"]
    assert iso.fullmatch(meta["finished_at"]), meta["finished_at"]
    assert set(meta) == {"department", "origin", "actor", "started_at",
                         "finished_at", "recordings", "attachments",
                         "workbooks", "delta", "merged", "ids_created"}
    # The verb's own half of the directory, which `revert` needs.
    assert (runs[0] / "facts-before" / "items.json").is_file()
    assert (runs[0] / "facts-delta.json").is_file()


def test_the_run_meta_is_written_before_the_verb_and_finished_after(
        data_root, tmp_path, monkeypatch):
    """The ordering that makes a crashed run distinguishable from a finished one.

    `meta.json` lands with `finished_at: null` and `merged: false` **before**
    the verb is invoked — the `quantify` playbook's Stage 0 precedent — and is
    patched only once the verb has succeeded. Written afterwards instead, a run
    killed mid-write leaves a directory with a store change in it and no record
    that anything was attempted.
    """
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    seen = {}

    def fake_run(cfg, args):
        seen.update(_meta(pathlib.Path(args[args.index("--run") + 1])))
        return ""

    monkeypatch.setattr(engine, "_run", fake_run)
    assert _resolve(client).status_code == 200
    assert seen["finished_at"] is None, seen
    assert seen["merged"] is False, seen
    meta = _meta(_runs(data_root)[0])
    assert meta["finished_at"] is not None
    assert meta["merged"] is True


def test_a_second_run_in_the_same_second_gets_its_own_directory(data_root,
                                                                tmp_path):
    """Two resolves a second apart must not share a run directory: the verb
    snapshots into `{run_dir}/facts-before/` and appends to its
    `facts-delta.json`, so a second call into a populated directory corrupts
    the record of the first — *after* the store write has already happened.

    The stamp that is already taken is planted rather than raced for, so this
    asserts the collision arm every time rather than whenever two requests
    happen to land in one second.
    """
    cfg = cfg_for(data_root, tmp_path / "unused.db")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    taken = data_root / "runs" / "facts" / "cooking" / stamp
    taken.mkdir(parents=True)
    run = engine.facts_run_dir(cfg, "cooking", "09190000000")
    assert run != taken
    assert not (taken / "meta.json").exists(), (
        "the run directory that was already there was written into")
    assert (run / "meta.json").is_file()


def test_a_universal_entrys_run_is_filed_under_management(data_root, tmp_path,
                                                          monkeypatch):
    """A run directory is per department and a universal entry names none, so
    the question has to be answered somewhere — and QF-43 already answered it:
    the bootstrap seeds the universal entries "under `management`", so their
    later runs are found where those are rather than under a tenth directory
    that is no department at all.

    The engine is stubbed here because what is under test is the *filing*, and
    a real run would have to be a real dispute in a second fixture."""
    _plant(data_root, ENTRIES + [UNIVERSAL])
    client = _client_as(data_root, tmp_path, "editor", "*")
    monkeypatch.setattr(engine, "_run", lambda cfg, args: "")
    assert _resolve(client, fid=UNIVERSAL["id"]).status_code == 200
    assert _runs(data_root, "cooking") == []
    runs = _runs(data_root, "management")
    assert len(runs) == 1, runs
    assert _meta(runs[0])["department"] == "management"


def test_a_failed_precondition_is_422_carrying_the_engines_message(
        data_root, tmp_path, monkeypatch):
    """Exit 2 with nothing written is the engine's whole contract, so the
    service has nothing to undo — it forwards the message and answers 422:
    the body was well formed and the **state** refused it."""
    _plant(data_root)
    before = _store(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    message = "precondition failed: account 00000000 not found on F-00001"

    def fake_run(cfg, args):
        raise engine.EngineError(message, 2)

    monkeypatch.setattr(engine, "_run", fake_run)
    r = _resolve(client, account="00000000")
    assert r.status_code == 422, r.text
    assert r.json()["detail"] == message
    assert _store(data_root) == before


def test_the_service_never_writes_the_store_itself(data_root, tmp_path,
                                                   monkeypatch):
    """QF-2 as an assertion: `facts/**` is written by `merge facts` and by
    nothing else. With the shell-out stubbed to do nothing at all, a 200 that
    moved a single byte of the store would mean this route had a second,
    private way to write it."""
    _plant(data_root)
    before = _store(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    monkeypatch.setattr(engine, "_run", lambda cfg, args: "")
    assert _resolve(client).status_code == 200
    assert _store(data_root) == before


def test_the_resolve_route_reaches_the_engine_with_all_four_flags(
        data_root, tmp_path, monkeypatch):
    """The argv, read off the call rather than off the outcome — so a flag
    dropped for one that happens to default is visible here."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    calls = []

    def fake_run(cfg, args):
        calls.append(args)
        return ""

    monkeypatch.setattr(engine, "_run", fake_run)
    assert _resolve(client).status_code == 200
    args = calls[0]
    assert args[:3] == ["merge", "facts", "resolve"]
    assert args[args.index("--id") + 1] == COOKING
    assert args[args.index("--field") + 1] == FIELD
    assert args[args.index("--account") + 1] == CHOSEN
    assert args[args.index("--run") + 1] == str(_runs(data_root)[0])


def test_a_view_only_holder_cannot_reach_the_resolve_route(data_root, tmp_path):
    """The Panel gate, and the uniform 404 — never a 403, which would tell a
    holder of `view` alone that `F-00001` is a thing that exists (QF-23)."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "reader", "*")
    r = _resolve(client)
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == NOT_FOUND
    assert _runs(data_root) == []


def test_an_admin_is_denied_on_the_write_route(data_root, tmp_path):
    """§17's clause. An admin is in the Panel — `manage_users` and
    `view_audit` — so they read facts and are answered 200 by the detail
    route; what they may not do is write one, and 403 is *"you can see this
    and may not do this to it"* (D56)."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "admin", "*")
    _confirm(client, COOKING)
    assert client.get(f"/api/facts/{COOKING}").status_code == 200
    r = _resolve(client)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == FORBIDDEN
    assert _runs(data_root) == []


def test_an_editor_outside_the_entrys_scope_is_404(data_root, tmp_path):
    """The AND over the entry's departments (QF-27), refusing with the same
    404 the read routes give: an editor of cooking is not the editor of a
    dining entry, and must not learn from the status that it is there."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = _resolve(client, fid=DINING)
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == NOT_FOUND
    assert _runs(data_root, "dining") == []


#: A document the index calls an item and whose own `kind` is outside the five
#: — what a hand-edited or partially-migrated store can hold, and what
#: `visibility.is_fact` refuses.
ODD = "F-00009"


def _plant_a_non_fact(data_root):
    items = data_root / "facts" / "items.json"
    doc = json.loads(items.read_text(encoding="utf-8"))
    doc["entries"].append({**ENTRIES[0], "id": ODD, "key": "test_ajib",
                           "kind": "weird"})
    items.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    index = data_root / "facts" / ".index.json"
    rows = json.loads(index.read_text(encoding="utf-8"))
    rows["entries"].append(
        {"id": ODD, "kind": "item", "key": "test_ajib", "title": "عجیب",
         "aliases": [], "scope": {"departments": ["cooking"], "branches": []},
         "status": "disputed",
         "field_status_counts": {"disputed": 2, "unknown": 0, "informal": 0,
                                 "inferred": 0},
         "processes": [], "retired": False, "stub": False,
         "updated_at": "2026-07-06T10:00:00Z"})
    index.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")


@pytest.mark.parametrize("role", ["editor", "admin"])
@pytest.mark.parametrize("fid",
                         ["F-99999", "F-1", "cooking-001", "F-00001x", ODD])
def test_nothing_the_service_cannot_serve_is_writable(data_root, tmp_path,
                                                      role, fid):
    """D56: an id the grammar refuses, an id nobody minted, a document that is
    not a fact and an id this caller is not scoped to are one answer, or the
    route is an existence oracle for the store.

    **The admin is the half that matters**, and both callers hold `*` so that
    scope cannot be what refuses them. A gate that resolved an unknown id to
    `["*"]` instead of to "no such entry" — or that let a document whose kind
    is outside the five through — would pass its scope arm for this caller and
    answer **403**, which says *there is something here* about an id nobody
    ever minted. The editor half is the same claim from the side that would
    have been allowed to write.
    """
    _plant(data_root)
    _plant_a_non_fact(data_root)
    client = _client_as(data_root, tmp_path, role, "*")
    r = _resolve(client, fid=fid)
    assert r.status_code == 404, f"{fid} answered {r.status_code} to a {role}"
    assert r.json()["detail"] == NOT_FOUND


# --------------------------------------------------------------------------
# GET /api/facts/source — the download, and nothing rendered (QF-39)
# --------------------------------------------------------------------------

#: The three roots, one file in each. Exactly three: a source that resolves
#: anywhere else is not a source this route serves.
SOURCES = {
    "attachments/sheets/gozareshat/w-01.json": '{"tab": "پیتزا"}',
    "departments/cooking/attachments/form-01.txt": "عکس فرم",
    "meetings/transcripts/cooking-1405-06-01.txt": "متن جلسه",
}


def _plant_sources(data_root):
    for rel, text in SOURCES.items():
        path = data_root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def _get(client, path):
    return client.get("/api/facts/source", params={"path": path})


@pytest.mark.parametrize("rel", sorted(SOURCES))
def test_a_file_under_each_root_downloads_as_an_attachment(data_root, tmp_path,
                                                           rel):
    """One click, one download, and **nothing rendered** (QF-39).

    `content-disposition: attachment` is asserted beside the status because it
    is the whole of the rule: a transcript or a photo served inline is a
    viewer, and the Panel does not have one. A status-only test passes on a
    route that renders every one of these in the browser.
    """
    _plant(data_root)
    _plant_sources(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = _get(client, rel)
    assert r.status_code == 200, r.text
    assert r.headers["content-disposition"].startswith("attachment"), (
        f"{rel} was served with {r.headers.get('content-disposition')!r}")
    assert r.text == SOURCES[rel]


@pytest.mark.parametrize("rel", [
    "../../etc/passwd",
    "/etc/passwd",
    "departments/cooking/attachments/../../processes/cooking-001.json",
    "attachments/sheets/../../facts/items.json",
    "meetings/audio/cooking-1405-06-01.ogg",
    "facts/items.json",
    "departments/cooking/processes/cooking-001.json",
    "",
])
def test_nothing_outside_the_three_roots_is_served(data_root, tmp_path, rel):
    """`resolve()` on both sides, so a `..` that survived URL decoding and a
    symlink out of the root are refused by the same check — and refused with
    the **bare 404** a missing file gets, never a 403: a caller learns nothing
    from a refusal about what is on the other side of it."""
    _plant(data_root)
    _plant_sources(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    assert _get(client, rel).status_code == 404, rel


def test_the_download_needs_export_pdf(data_root, tmp_path):
    """The download split (D25, §15): `reader_no_download` exists precisely so
    that download can be withheld, and QF-39's evidence is a download.

    403 and not 404: this caller is in the Panel and may read the entry that
    cites the file, so what is refused is the action. Recorded as
    `access.denied` (D42) — the highest-signal row in the catalogue, because
    it means somebody acted through a control the UI never drew for them.
    """
    _plant(data_root)
    _plant_sources(data_root)
    client = _client_as(data_root, tmp_path, "panel-no-download", "*",
                        capabilities={"edit", "view"})
    r = _get(client, "meetings/transcripts/cooking-1405-06-01.txt")
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == FORBIDDEN
    conn = db.connect(client.cfg.app_db)
    try:
        rows = conn.execute(
            "SELECT actor, action, outcome, detail FROM audit_events"
            " WHERE action = 'access.denied'").fetchall()
    finally:
        conn.close()
    assert len(rows) == 1, [tuple(row) for row in rows]
    assert rows[0]["actor"] == client.username
    assert rows[0]["outcome"] == "denied"
    assert json.loads(rows[0]["detail"])["capability"] == "export_pdf"


def test_a_view_only_holder_cannot_reach_the_download(data_root, tmp_path):
    """A Reader holds `export_pdf` — and is still 404'd, because the Panel gate
    speaks first (QF-23, §18). Without it this route is a file server over the
    transcripts of every department, open to anyone who may download a PDF."""
    _plant(data_root)
    _plant_sources(data_root)
    client = _client_as(data_root, tmp_path, "reader", "*")
    r = _get(client, "meetings/transcripts/cooking-1405-06-01.txt")
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == NOT_FOUND


def test_with_fact_sources_off_the_download_is_404(data_root, tmp_path):
    """QF-26: with the switch off, `source[]` is stripped from every served
    body and this route answers 404 — the provenance is not served by this
    deployment, and a route that still handed the file over would be the strip
    undone by a second request."""
    _plant(data_root)
    _plant_sources(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    rel = "meetings/transcripts/cooking-1405-06-01.txt"
    assert _get(client, rel).status_code == 200
    conn = db.connect(client.cfg.app_db)
    try:
        policy.set_field(conn, "fact_sources", False)
    finally:
        conn.close()
    r = _get(client, rel)
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == NOT_FOUND


def test_an_attachment_is_gated_on_the_department_in_its_path(data_root,
                                                              tmp_path):
    """The scope half (§15: *gated by scope and by `export_pdf`*).

    `departments/{dept}/attachments/**` is the one root that names a
    department, so it takes one: a dining editor is answered the uniform 404
    for cooking's field material, and the pair is what makes that a statement
    about the department rather than about the file being absent.
    """
    _plant(data_root)
    _plant_sources(data_root)
    rel = "departments/cooking/attachments/form-01.txt"
    dining = _client_as(data_root, tmp_path, "editor", "dept:dining")
    r = _get(dining, rel)
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == NOT_FOUND
    cooking = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert _get(cooking, rel).status_code == 200
