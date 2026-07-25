import json
import logging
import subprocess

import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _auth_client(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def _clone(data_root, pid):
    """Copy the seeded cooking-001 to a second id so the department has two."""
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    for n in doc["nodes"]:
        if n["id"].startswith("cooking-001-"):
            n["id"] = n["id"].replace("cooking-001-", f"{pid}-")
    doc["edges"] = [{**e,
                     "from": e["from"].replace("cooking-001-", f"{pid}-"),
                     "to": e["to"].replace("cooking-001-", f"{pid}-")}
                    for e in doc["edges"]]
    doc["pending"] = []
    (src.parent / f"{pid}.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _order_on_disk(data_root):
    p = data_root / "departments" / "cooking" / "order.json"
    return json.loads(p.read_text(encoding="utf-8"))["order"] if p.is_file() else None


def test_put_order_saves_and_returns(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-002", "cooking-001"]})
    assert r.status_code == 200
    assert r.json() == {"order": ["cooking-002", "cooking-001"]}
    assert _order_on_disk(data_root) == ["cooking-002", "cooking-001"]


def test_put_order_commits_the_file(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    log = subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                          "HEAD"], capture_output=True, text=True).stdout
    assert "ui-edit(cooking): update process order" in log
    assert "departments/cooking/order.json" in log


def test_put_order_missing_id_is_409(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    assert r.status_code == 409
    assert "set mismatch" in r.json()["detail"]


def test_put_order_stale_id_is_409(data_root):
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-001", "cooking-099"]})
    assert r.status_code == 409


def test_put_order_bad_body_is_422(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/cooking/order",
                 json={"order": "cooking-001"}).status_code == 422
    assert c.put("/api/departments/cooking/order",
                 json={"order": [1, 2]}).status_code == 422


def test_put_order_unknown_department_is_404(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/nope/order",
                 json={"order": []}).status_code == 404


def test_put_order_requires_auth(data_root):
    c = TestClient(create_app(cfg_for(data_root)))
    assert c.put("/api/departments/cooking/order",
                 json={"order": []}).status_code == 401


def _write_order_by_hand(data_root, sequence):
    """An order.json the API would refuse to write — what the fallback rule is for."""
    p = data_root / "departments" / "cooking" / "order.json"
    p.write_text(json.dumps({"department": "cooking", "order": sequence,
                             "updated_at": "2026-07-25T00:00:00Z"},
                            ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _corrupt(path):
    path.write_text("{ not json", encoding="utf-8")


def _track(data_root):
    """Commit what is on disk, so a later deletion of it is a real staged change.

    `_clone` writes straight to disk, outside the git-backed write path.
    """
    subprocess.run(["git", "-C", str(data_root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(data_root), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-q", "-m", "clone"], check=True)


def _commit_count(data_root):
    return int(subprocess.run(["git", "-C", str(data_root), "rev-list", "--count",
                               "HEAD"], capture_output=True, text=True).stdout)


def _head(data_root):
    return subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                           "HEAD"], capture_output=True, text=True).stdout


def _tombstone(data_root, pid):
    p = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["tombstoned"] = True
    doc["superseded_by"] = []
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                 encoding="utf-8")


def test_processes_follow_the_curated_order(data_root):
    _clone(data_root, "cooking-002")
    _clone(data_root, "cooking-003")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-003", "cooking-001", "cooking-002"]})
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-003", "cooking-001", "cooking-002"]


def test_processes_fall_back_to_id_order_without_a_file(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-002"]


def test_processes_skip_an_id_the_disk_does_not_have(data_root):
    """PUT 409s on drift, so only a hand-edited file can carry a stale id."""
    _clone(data_root, "cooking-002")
    _write_order_by_hand(data_root, ["cooking-002", "cooking-404", "cooking-001"])
    c = _auth_client(data_root)
    r = c.get("/api/departments/cooking/processes")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == ["cooking-002", "cooking-001"]


def test_processes_keep_a_repeated_order_entry_once(data_root):
    """A hand-edited duplicate must not list the same process twice."""
    _clone(data_root, "cooking-002")
    _write_order_by_hand(data_root, ["cooking-002", "cooking-001", "cooking-002"])
    c = _auth_client(data_root)
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-002", "cooking-001"]


def test_unordered_actives_land_after_the_ordered_ones(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    # two unplaced ones, cloned in reverse id order, so the tail proves id order
    # rather than creation order
    _clone(data_root, "cooking-004")  # created behind the backend's back
    _clone(data_root, "cooking-003")
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-002", "cooking-001", "cooking-003", "cooking-004"]


def test_tombstones_come_last_in_id_order(data_root):
    _clone(data_root, "cooking-002")
    _clone(data_root, "cooking-003")
    _clone(data_root, "cooking-004")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-004", "cooking-001",
                          "cooking-002", "cooking-003"]})
    # two of them, tombstoned in the opposite order to their ids
    _tombstone(data_root, "cooking-004")
    _tombstone(data_root, "cooking-002")
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-003", "cooking-002", "cooking-004"]


def test_create_appends_to_the_order_in_one_commit(data_root):
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    before = _commit_count(data_root)
    r = c.post("/api/processes", json={"department": "cooking", "name": "نو"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert _order_on_disk(data_root) == ["cooking-001", new_id]
    # exactly one commit — the process and the order cannot have been committed
    # separately under the same action string
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert "departments/cooking/order.json" in log
    assert log.count("create process") == 1


def test_delete_drops_from_the_order_in_one_commit(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    before = _commit_count(data_root)
    assert c.delete("/api/processes/cooking-002").status_code == 200
    assert _order_on_disk(data_root) == ["cooking-001"]
    assert _commit_count(data_root) - before == 1
    assert "departments/cooking/order.json" in _head(data_root)


def test_create_survives_a_failed_order_sync(data_root, caplog):
    """A corrupt sibling poisons `order sync`; the creation must still stand.

    `reconcile` reads every process file in the department, so unguarded this
    500s *after* the new file is on disk and the id ledger has advanced — and
    the retry would then mint the next id and orphan the first.
    """
    _corrupt(data_root / "departments" / "cooking" / "processes" / "cooking-009.json")
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    with caplog.at_level(logging.WARNING):
        r = c.post("/api/processes", json={"department": "cooking", "name": "نو"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert f"ui-edit({new_id}): create process" in log
    assert f"{new_id}.json" in log
    assert _order_on_disk(data_root) is None          # unsynced, so uncommitted
    assert "cooking's order.json could not be synced" in caplog.text


def test_delete_survives_a_failed_order_sync(data_root, caplog):
    """The same guard on the delete path, reached through a corrupt order.json.

    A corrupt sibling *process* file cannot exercise it here: `delete_process`
    reads every sibling itself to unlink references, well before the sync.
    """
    _clone(data_root, "cooking-002")
    _track(data_root)
    _corrupt(data_root / "departments" / "cooking" / "order.json")
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    with caplog.at_level(logging.WARNING):
        assert c.delete("/api/processes/cooking-002").status_code == 200
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert "ui-edit(cooking-002): delete process" in log
    assert "cooking-002.json" in log
    assert "cooking's order.json could not be synced" in caplog.text


def test_delete_of_the_last_process_needs_no_order_file(data_root):
    """The lazy-file case gitcommit's skip exists for (ARD §4.6).

    cooking-001 is the department's only process and there is no order.json; the
    order module writes none for a department that drops to zero actives without
    one, so the path handed to git is absent *and* untracked.
    """
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    assert c.delete("/api/processes/cooking-001").status_code == 200
    assert _order_on_disk(data_root) is None
    assert _commit_count(data_root) - before == 1
    assert "ui-edit(cooking-001): delete process" in _head(data_root)


# --- the engine runs as a subprocess: an unrunnable CLI raises OSError ---------

def _order_cli_missing(monkeypatch, name):
    """Make one engine helper raise what a missing console script really raises.

    `order` is brand-new in this branch, so a partial deploy or a checkout that
    skipped the editable reinstall leaves it off PATH and `subprocess.run`
    raises `FileNotFoundError` — an `OSError`, never an `EngineError`.
    """
    from inja_ui_backend import engine as engine_mod

    def boom(*a, **kw):
        raise FileNotFoundError(2, "No such file or directory", "order")

    monkeypatch.setattr(engine_mod, name, boom)


def test_create_survives_an_unrunnable_order_cli(data_root, caplog, monkeypatch):
    """The half-apply this branch already fixed twice, reached through OSError.

    Unguarded the 500 lands *after* the process file is written and the id
    ledger has advanced, so the user's retry mints the next id and orphans the
    first.
    """
    _order_cli_missing(monkeypatch, "order_sync")
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    with caplog.at_level(logging.WARNING):
        r = c.post("/api/processes", json={"department": "cooking", "name": "نو"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert _commit_count(data_root) - before == 1
    log = _head(data_root)
    assert f"ui-edit({new_id}): create process" in log
    assert f"{new_id}.json" in log
    assert _order_on_disk(data_root) is None
    assert "cooking's order.json could not be synced" in caplog.text


def test_delete_survives_an_unrunnable_order_cli(data_root, caplog, monkeypatch):
    _clone(data_root, "cooking-002")
    _track(data_root)
    _order_cli_missing(monkeypatch, "order_sync")
    c = _auth_client(data_root)
    before = _commit_count(data_root)
    with caplog.at_level(logging.WARNING):
        assert c.delete("/api/processes/cooking-002").status_code == 200
    assert _commit_count(data_root) - before == 1
    assert "ui-edit(cooking-002): delete process" in _head(data_root)
    assert "cooking's order.json could not be synced" in caplog.text


def test_put_order_with_an_unrunnable_order_cli_is_a_clean_500(data_root, monkeypatch):
    """Nothing is written here, so the job is only to refuse legibly."""
    _order_cli_missing(monkeypatch, "order_set")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    assert r.status_code == 500
    assert "order" in r.json()["detail"]
    assert _order_on_disk(data_root) is None


# --- the order.json READ path ------------------------------------------------

def test_processes_survive_a_corrupt_order_file(data_root, caplog):
    """A corrupt order.json must not take the whole department's list down.

    A 500 here also blocks the only in-UI repair: the reorder PUT rewrites the
    file, but the modal cannot be opened on a list that never loads.
    """
    _clone(data_root, "cooking-002")
    _corrupt(data_root / "departments" / "cooking" / "order.json")
    c = _auth_client(data_root)
    with caplog.at_level(logging.WARNING):
        r = c.get("/api/departments/cooking/processes")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == ["cooking-001", "cooking-002"]
    assert "order.json" in caplog.text
    # and the modal's PUT still heals the file
    assert c.put("/api/departments/cooking/order",
                 json={"order": ["cooking-002", "cooking-001"]}).status_code == 200


def test_processes_survive_an_order_file_of_the_wrong_shape(data_root, caplog):
    p = data_root / "departments" / "cooking" / "order.json"
    p.write_text(json.dumps(["cooking-001"]), encoding="utf-8")
    c = _auth_client(data_root)
    with caplog.at_level(logging.WARNING):
        r = c.get("/api/departments/cooking/processes")
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == ["cooking-001"]


# --- backend and engine must agree about the department's process set ---------

def _misfile(data_root, dept, pid):
    """Drop a foreign-department process file into `dept`'s processes/ dir."""
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    doc["department"] = pid.rsplit("-", 1)[0]
    doc["nodes"] = []
    doc["edges"] = []
    doc["pending"] = []
    (data_root / "departments" / dept / "processes" / f"{pid}.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def test_a_misfiled_process_is_not_in_the_department_list(data_root):
    """`active_ids` anchors ids on the department; the backend must agree.

    Otherwise the list offers an id the `order` CLI calls stale, and the
    department is stuck behind `409 set mismatch` — reopening the modal
    produces the same rejected list.
    """
    _clone(data_root, "cooking-002")
    _misfile(data_root, "cooking", "dining-007")
    c = _auth_client(data_root)
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-002"]
    # the sequence the modal would send is exactly the CLI's active set
    assert c.put("/api/departments/cooking/order",
                 json={"order": ids}).status_code == 200


def test_a_misfiled_process_is_not_counted_on_the_board(data_root):
    _misfile(data_root, "cooking", "dining-007")
    c = _auth_client(data_root)
    counts = {d["code"]: d["count"] for d in c.get("/api/departments").json()}
    assert counts["cooking"] == 1


# --- the --sequence wire format ----------------------------------------------

def test_put_order_rejects_an_id_holding_a_comma(data_root):
    """The backend joins on commas and the CLI splits on them: a comma inside an
    id would silently store a *different* sequence than the one requested."""
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-001,cooking-002"]})
    assert r.status_code == 422
    assert _order_on_disk(data_root) is None


def test_put_order_rejects_an_empty_id(data_root):
    """The CLI drops empty splits, so this would store a shorter sequence."""
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order", json={"order": ["cooking-001", ""]})
    assert r.status_code == 422
    assert _order_on_disk(data_root) is None


def test_put_order_rejects_a_malformed_id(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/cooking/order",
                 json={"order": ["Cooking-1"]}).status_code == 422
    assert c.put("/api/departments/cooking/order",
                 json={"order": ["../../etc/passwd"]}).status_code == 422
