"""Confirming a fact entry (spec QF-24, QF-25, QF-27).

The process paths (`test_confirmations_api.py`) are the precedent this file
follows: a fingerprint the caller must echo, 409 on a stale one, a uniform 404
for an out-of-scope or absent target. Two things differ for a fact — a
canonicaliser whose exclusion is top-level-only rather than deep (D21's
`source` is process bookkeeping; a fact's `source` is content), and a gate
that is an AND over every department in `scope.departments` rather than a
single `dept:{code}` string, because `contains` only ever answers one string
at a time.
"""
import copy
import itertools
import json
import shutil
import subprocess

from fastapi.testclient import TestClient
from inja_ui_backend import db, engine, facts_store, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fact_fingerprint
from inja_ui_backend.store import confirmations, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()

RULE = "F-00001"     # cooking-scoped, status confirmed — green-able
RECORD = "F-00002"   # universal (no departments), status disputed — red


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0914{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"facts-{n}.db")
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
    client.username = username
    client.app_db = cfg.app_db
    client.cfg = cfg
    return client


def _events(client, action):
    conn = db.connect(client.app_db)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, target, outcome, detail, session_id"
            " FROM audit_events WHERE action = ? ORDER BY id", (action,))]
    finally:
        conn.close()


def _rules_doc(data_root):
    return json.loads((data_root / "facts" / "rules.json").read_text(encoding="utf-8"))


def _records_doc(data_root):
    return json.loads((data_root / "facts" / "records.json").read_text(encoding="utf-8"))


def _entry(data_root, filename, fact_id):
    doc = json.loads((data_root / "facts" / filename).read_text(encoding="utf-8"))
    return next(e for e in doc["entries"] if e["id"] == fact_id)


# --- the canonicaliser (QF-24: top-level-only exclusion) ---

def test_fact_fingerprint_drops_updated_at_top_level_only(data_root):
    base = _entry(data_root, "rules.json", RULE)

    # Two docs differing only in envelope `updated_at` -> equal prints.
    other_top = copy.deepcopy(base)
    other_top["updated_at"] = "2026-09-02T15:31:07Z"
    assert base["updated_at"] != other_top["updated_at"]
    assert fact_fingerprint(base) == fact_fingerprint(other_top)

    # Differing in `data.updated_at` (a record column, not envelope
    # bookkeeping) -> different prints.
    a = copy.deepcopy(base)
    b = copy.deepcopy(base)
    a["data"]["updated_at"] = "2026-01-01"
    b["data"]["updated_at"] = "2026-01-02"
    assert fact_fingerprint(a) != fact_fingerprint(b)

    # Differing in `source[]` -> different prints: on a fact, `source` is
    # content (the account trail a reviewer vouches for), unlike the process
    # canonicaliser which drops it at every depth.
    c = copy.deepcopy(base)
    d = copy.deepcopy(base)
    c["source"] = [{"type": "sheet", "ref": "a.xlsx"}]
    d["source"] = [{"type": "sheet", "ref": "b.xlsx"}]
    assert fact_fingerprint(c) != fact_fingerprint(d)


# --- _kind ---

def test_kind_is_fact_for_F_ids(data_root, tmp_path):
    """The regex is anchored, not a `startswith` — a department literally
    named `F` (or an id merely beginning with `F-`) must not collide with a
    real 5-digit fact id."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    fp = fact_fingerprint(_entry(data_root, "rules.json", RULE))
    r = client.post(f"/api/confirmations/{RULE}", json={"fingerprint": fp})
    assert r.status_code == 200
    assert r.json()["kind"] == "fact"

    # Not a fact shape: too few digits, too many, wrong letter — falls through
    # to the ordinary process/department classification and is refused as
    # such rather than mistaken for a fact.
    for bogus in ("F-1", "F-000001", "G-00001"):
        r = client.post(f"/api/confirmations/{bogus}", json={"fingerprint": "a" * 64})
        assert r.status_code == 404, bogus


# --- confirming a fact ---

def test_tick_then_store_rewrite_reads_as_not_confirmed(data_root, tmp_path):
    """No facts *listing* route exists yet (task 18) to read `confirmed` off
    of, so this checks the same thing `_row`'s own `ok = stored is not None
    and stored["fingerprint"] == now` checks: the stored mark no longer
    matches the entry's current print, which is `_row`'s exact definition of
    "not confirmed"."""
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    entry = _entry(data_root, "rules.json", RULE)
    fp = fact_fingerprint(entry)
    r = client.post(f"/api/confirmations/{RULE}", json={"fingerprint": fp})
    assert r.status_code == 200
    assert r.json()["confirmed"] is True

    # A `merge` run rewrites the store — simulated here by editing the fixture
    # file directly, exactly as `test_re_confirming_after_an_edit_replaces_the_
    # mark` does for a process.
    doc = _rules_doc(data_root)
    doc["entries"][0]["title"] = "قانون تازه"
    (data_root / "facts" / "rules.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    conn = db.connect(client.app_db)
    try:
        stored = confirmations.get(conn, RULE)
    finally:
        conn.close()
    new_print = fact_fingerprint(_entry(data_root, "rules.json", RULE))
    assert new_print != fp                       # the rewrite really changed it
    assert stored["fingerprint"] != new_print     # so the stored mark no longer matches


def test_retick_stale_fingerprint_409(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    entry = _entry(data_root, "rules.json", RULE)
    fp = fact_fingerprint(entry)
    assert client.post(f"/api/confirmations/{RULE}",
                       json={"fingerprint": fp}).status_code == 200

    doc = _rules_doc(data_root)
    doc["entries"][0]["title"] = "قانون تازه"
    (data_root / "facts" / "rules.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    r = client.post(f"/api/confirmations/{RULE}", json={"fingerprint": fp})
    assert r.status_code == 409
    # One `confirmation.set` from the genuine confirm above; the stale-print
    # retry above is refused before anything is written, so it adds none.
    assert len(_events(client, "confirmation.set")) == 1


def test_tick_on_red_entry_is_allowed(data_root, tmp_path):
    """`F-00002`'s `status` is `disputed`, and it is confirmable anyway.

    **Owner ruling, 2026-09-06:** «each of the quantitative items should be
    confirmable, regardless of whether it has an issue or not.» This replaces
    QF-25's red-over-green refusal, which made the entries most in need of a
    reviewer's attention the only ones a reviewer could not sign — an
    `unknown` leaf is a question for the source, and nothing the reviewer does
    on this screen can answer it.
    """
    client = _client_as(data_root, tmp_path, "editor", "*")
    entry = _entry(data_root, "records.json", RECORD)
    fp = fact_fingerprint(entry)
    r = client.post(f"/api/confirmations/{RECORD}", json={"fingerprint": fp})
    assert r.status_code == 200
    assert len(_events(client, "confirmation.set")) == 1


def test_red_entry_still_refuses_a_stale_fingerprint(data_root, tmp_path):
    """The other half of the ruling, and the reason the old pair of tests is
    replaced rather than deleted: dropping the red refusal must not drop the
    stale-print one underneath it. A red entry confirmed against a print
    nobody read is still 409 — and now says so in the stale-print words, which
    is what tells the two apart."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.post(f"/api/confirmations/{RECORD}", json={"fingerprint": "0" * 64})
    assert r.status_code == 409
    assert "قرمز" not in r.json()["detail"]
    assert _events(client, "confirmation.set") == []


# --- the gate: AND over every department in scope ---

def test_scoped_fact_needs_confirm_on_every_department(data_root, tmp_path):
    """`F-00001` is scoped to `["cooking"]` alone in the fixture, so this
    exercises the AND with a purpose-built two-department entry written
    straight into the fixture files."""
    doc = _rules_doc(data_root)
    entry = copy.deepcopy(doc["entries"][0])
    entry["id"] = "F-00003"
    entry["key"] = "two_dept_rule"
    entry["scope"] = {"departments": ["cooking", "accounting"], "branches": []}
    doc["entries"].append(entry)
    (data_root / "facts" / "rules.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index = json.loads((data_root / "facts" / ".index.json")
                       .read_text(encoding="utf-8"))
    row = copy.deepcopy(index["entries"][0])
    row["id"], row["key"], row["scope"] = "F-00003", "two_dept_rule", entry["scope"]
    index["entries"].append(row)
    (data_root / "facts" / ".index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    fp = fact_fingerprint(entry)

    # Scoped to only one of the two required departments -> out of scope for
    # the other -> uniform 404, same as an id that does not exist.
    cooking_only = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = cooking_only.post("/api/confirmations/F-00003", json={"fingerprint": fp})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})

    # Scoped to both, but the role holds no `confirm` capability -> the
    # resource is visible (an admin already reaches the Panel) but the action
    # is not theirs -> 403, not 404.
    admin_both = _client_as(data_root, tmp_path, "admin",
                            "dept:cooking", "dept:accounting")
    r = admin_both.post("/api/confirmations/F-00003", json={"fingerprint": fp})
    assert r.status_code == 403

    # Scoped to both, and `confirm` is held -> passes.
    editor_both = _client_as(data_root, tmp_path, "editor",
                             "dept:cooking", "dept:accounting")
    r = editor_both.post("/api/confirmations/F-00003", json={"fingerprint": fp})
    assert r.status_code == 200
    assert r.json()["confirmed"] is True

    # No per-department `access.denied` spam for the 404 case above — the
    # loop that finds the miss must not turn one refusal into two audit rows.
    assert _events(cooking_only, "access.denied") == []
    # The single capability miss above *is* recorded, once.
    admin_denied = _events(admin_both, "access.denied")
    assert len(admin_denied) == 1
    assert json.loads(admin_denied[0]["detail"])["capability"] == "confirm"


def test_universal_fact_needs_star(data_root, tmp_path):
    """`F-00002` names no department — a department-scoped holder, however
    broad, cannot confirm it; only `*` can (QF-27)."""
    entry = _entry(data_root, "records.json", RECORD)
    # RECORD is disputed (409 before the gate would even matter), so this
    # uses a green copy of it under its own id to isolate the gate from the
    # red-entry refusal.
    doc = _records_doc(data_root)
    green = copy.deepcopy(entry)
    green["id"] = "F-00004"
    green["key"] = "universal_green"
    green["status"] = "confirmed"
    doc["entries"].append(green)
    (data_root / "facts" / "records.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index = json.loads((data_root / "facts" / ".index.json")
                       .read_text(encoding="utf-8"))
    row = copy.deepcopy(index["entries"][1])
    row["id"], row["key"], row["status"] = "F-00004", "universal_green", "confirmed"
    index["entries"].append(row)
    (data_root / "facts" / ".index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    fp = fact_fingerprint(green)

    dept_only = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = dept_only.post("/api/confirmations/F-00004", json={"fingerprint": fp})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})

    star = _client_as(data_root, tmp_path, "editor", "*")
    r = star.post("/api/confirmations/F-00004", json={"fingerprint": fp})
    assert r.status_code == 200


def test_absent_id_uniform_404(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.post("/api/confirmations/F-09999", json={"fingerprint": "a" * 64})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    assert client.delete("/api/confirmations/F-09999").status_code == 404


def test_absent_facts_store_is_uniform_404_not_500(data_root, tmp_path):
    """Every deployment is in this state until the first `merge facts` run
    (spec §16). The gate (`_fact_departments`) reads `facts/.index.json`
    before any scope decision, so a bare `read_text` there would 500 the
    whole route instead of failing closed — `access.py`'s own rule is that a
    crash is a denial of service and an unanswerable question is a value,
    never an exception.
    """
    shutil.rmtree(data_root / "facts")
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.post(f"/api/confirmations/{RULE}", json={"fingerprint": "a" * 64})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    assert client.delete(f"/api/confirmations/{RULE}").status_code == 404


def test_load_index_absent_file_reads_as_empty_store(tmp_path):
    assert facts_store.load_index(tmp_path) == {"schema_version": 2, "entries": []}


def test_load_entry_tolerates_a_malformed_index_row(data_root):
    """A row missing `id`, or naming a `kind` outside the five the store
    defines, must read as "not found" — `KeyError`, like any other
    exception, is a 500 to whoever is on the other end of the gate."""
    index_path = data_root / "facts" / ".index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["entries"].append({"id": "F-00098", "kind": "not_a_real_kind"})
    index["entries"].append({"kind": "rule"})  # no id at all
    index_path.write_text(json.dumps(index, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    assert facts_store.load_entry(data_root, "F-00098") is None


def test_a_stored_null_scope_is_the_uniform_404_not_a_500(data_root, tmp_path):
    """The store is a file on disk that nothing revalidates on read, so a
    hand-edited or partially-migrated entry can carry `"scope": null`.

    `access.py`'s rule holds inside the confirm gate too: a crash is a denial
    of service, and an unanswerable question is a value. The read routes
    already answered 404 here; the confirm gate answered 500, because its copy
    of the derivation read `entry.get("scope", {})` — which returns the stored
    `None`, not the default. It now calls the read gate's own `_targets`, so
    there is one answer rather than two.
    """
    path = data_root / "facts" / "rules.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["entries"][0]["scope"] = None
    path.write_text(json.dumps(doc, ensure_ascii=False) + "\n", encoding="utf-8")

    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    r = client.post(f"/api/confirmations/{RULE}", json={"fingerprint": "x" * 64})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    # …and it is the *uniform* 404: a `*` holder, who reaches every target
    # there is, is answered the same thing, because a null scope names no
    # department and `_targets`' explicit disjunct makes that `["*"]`… which
    # they do hold. So they get past the gate and are refused by the stale
    # fingerprint instead — the point being that neither caller sees a 500.
    wild = _client_as(data_root, tmp_path, "editor", "*")
    assert wild.post(f"/api/confirmations/{RULE}",
                     json={"fingerprint": "x" * 64}).status_code == 409


# --- the commit-id column ---

def test_commit_id_column_written_at_set_time(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    fp = fact_fingerprint(_entry(data_root, "rules.json", RULE))
    assert client.post(f"/api/confirmations/{RULE}",
                       json={"fingerprint": fp}).status_code == 200

    head = subprocess.run(["git", "-C", str(data_root), "rev-parse", "HEAD"],
                          capture_output=True, text=True, check=True).stdout.strip()
    conn = db.connect(client.app_db)
    try:
        row = conn.execute(
            "SELECT data_repo_commit FROM confirmations WHERE target = ?",
            (RULE,)).fetchone()
    finally:
        conn.close()
    assert row["data_repo_commit"] == head
    assert row["data_repo_commit"] != ""


# --- the confirmation is the panel's mark and nothing else ------------------
#
# Owner ruling, 2026-09-09: *"I only mean that confirm button that's in the UI
# and gets saved in the database — I don't want it to get checked
# automatically."* The v3.7 chat channel (`facts/.confirmations.json`, a run of
# `origin: chat` vouching for what it wrote) is withdrawn; what is left is the
# rule a process has always had, and these are its two halves.

def test_revoke_withdraws_the_mark_and_records_it(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    fp = fact_fingerprint(_entry(data_root, "rules.json", RULE))
    assert client.post(f"/api/confirmations/{RULE}",
                       json={"fingerprint": fp}).status_code == 200

    r = client.delete(f"/api/confirmations/{RULE}")
    assert r.status_code == 200
    assert r.json()["confirmed"] is False
    assert [json.loads(e["detail"])
            for e in _events(client, "confirmation.revoked")] == [{"kind": "fact"}]


def test_a_ledger_file_left_in_the_store_confirms_nothing(data_root, tmp_path):
    """The withdrawn channel, planted exactly as the engine used to write it:
    nothing reads it — not the listing, not the detail, and not the record gate
    that withholds an unconfirmed entry from a non-editor (D22)."""
    entry = facts_store.load_entry(data_root, RULE)
    (data_root / "facts" / ".confirmations.json").write_text(json.dumps(
        {"schema_version": 1, "entries": {RULE: {
            "updated_at": entry["updated_at"], "by": "owner",
            "run": "runs/facts/cooking/20260909-091210",
            "at": "2026-09-09T09:12:31Z"}}}, ensure_ascii=False),
        encoding="utf-8")

    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    assert client.get(f"/api/facts/{RULE}") \
                 .json()["confirmation"]["confirmed"] is False
    rows = {r["id"]: r for r in client.get("/api/facts").json()["entries"]}
    assert rows[RULE]["confirmed"] is False

    admin = _client_as(data_root, tmp_path, "admin", "*")
    assert admin.get(f"/api/facts/{RULE}").status_code == 404
    assert RULE not in [r["id"] for r in admin.get("/api/facts").json()["entries"]]


# --- the tick is set in the panel and nowhere else (owner ruling, 2026-09-09) -

def _edit_via_engine(cfg, fid, statement="بیانیهٔ تازه"):
    """One bot edit, through the **real** `merge facts edit` on a chat-origin
    run — what `edit-fact` does. A stub here would prove nothing: the point of
    the assertion is what the engine writes (or no longer writes) to the store.
    """
    # The five kind files are seeded at the store schema's older version (the
    # service never reads the header; `save_store` validates it and refuses).
    for name in ("items.json", "records.json", "measurements.json",
                 "rules.json", "notes.json"):
        path = cfg.data_root / "facts" / name
        doc = json.loads(path.read_text(encoding="utf-8"))
        doc["schema_version"] = 2
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    run = engine.facts_run_dir(cfg, "cooking", "owner")
    meta = json.loads((run / "meta.json").read_text(encoding="utf-8"))
    meta["origin"] = "chat"
    (run / "meta.json").write_text(json.dumps(meta, ensure_ascii=False),
                                   encoding="utf-8")
    patch = run / "facts-patch.json"
    patch.write_text(json.dumps({"schema_version": 1, "ops": [
        {"op": "set", "path": "statement", "value": statement}]},
        ensure_ascii=False), encoding="utf-8")
    engine._run(cfg, ["merge", "facts", "edit", "--id", fid,
                      "--patch", str(patch), "--run", str(run)])


def test_a_chat_edit_never_confirms_and_revokes_a_stale_panel_mark(data_root,
                                                                   tmp_path):
    """Owner ruling 2026-09-09: only a person in the panel sets the tick. A
    `merge facts edit` re-stamps the entry, so a mark stored for the earlier
    print no longer matches — the row reads unconfirmed until re-confirmed,
    exactly the rule a process has always had."""
    client = _client_as(data_root, tmp_path, "editor", "dept:cooking")
    fp = client.get(f"/api/facts/{RULE}").json()["confirmation"]["fingerprint"]
    assert client.post(f"/api/confirmations/{RULE}",
                       json={"fingerprint": fp}).status_code == 200
    rows = {r["id"]: r for r in client.get("/api/facts").json()["entries"]}
    assert rows[RULE]["confirmed"] is True

    _edit_via_engine(client.cfg, RULE)

    rows = {r["id"]: r for r in client.get("/api/facts").json()["entries"]}
    assert rows[RULE]["confirmed"] is False
    assert client.get(f"/api/facts/{RULE}") \
                 .json()["confirmation"]["confirmed"] is False
