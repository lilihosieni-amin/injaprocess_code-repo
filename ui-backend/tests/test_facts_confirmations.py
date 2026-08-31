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
import subprocess

from fastapi.testclient import TestClient
from inja_ui_backend import db, seed
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


def test_tick_on_red_entry_409(data_root, tmp_path):
    """`F-00002`'s `status` is `disputed` — red wins over green (QF-25), and
    the endpoint refuses before it even reaches the fingerprint check."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    entry = _entry(data_root, "records.json", RECORD)
    fp = fact_fingerprint(entry)
    r = client.post(f"/api/confirmations/{RECORD}", json={"fingerprint": fp})
    assert r.status_code == 409
    assert r.json()["detail"] == \
        "دادهٔ قرمز قابل تأیید نیست — اول تعارض یا بی‌پاسخی را رفع کنید"
    assert _events(client, "confirmation.set") == []


def test_tick_on_red_entry_409_even_with_wrong_fingerprint(data_root, tmp_path):
    """Red wins regardless of what fingerprint was echoed — the 409 for a
    disputed/unknown entry is not the stale-fingerprint 409, and must not be
    confused with it by only ever testing the correct print."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.post(f"/api/confirmations/{RECORD}", json={"fingerprint": "0" * 64})
    assert r.status_code == 409
    assert "قرمز" in r.json()["detail"]


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
