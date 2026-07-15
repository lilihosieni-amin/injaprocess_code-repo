import json

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


def test_departments_list_has_nine_with_counts(data_root):
    c = _auth_client(data_root)
    rows = c.get("/api/departments").json()
    assert len(rows) == 9
    cooking = next(r for r in rows if r["code"] == "cooking")
    assert cooking["count"] == 1 and cooking["name"]
    # cooking-001 has no parent (0 sub-processes) and one open pending (1 conflict)
    assert cooking["subs"] == 0 and cooking["conflicts"] == 1
    empty = next(r for r in rows if r["code"] == "logistics")
    assert empty["count"] == 0 and empty["subs"] == 0 and empty["conflicts"] == 0


def test_get_overview(data_root):
    c = _auth_client(data_root)
    ov = c.get("/api/departments/cooking/overview").json()
    assert ov["department"] == "cooking"


def test_get_overview_missing_404(data_root):
    c = _auth_client(data_root)
    assert c.get("/api/departments/logistics/overview").status_code == 404


def test_put_overview_validates_and_commits(data_root):
    c = _auth_client(data_root)
    ov = c.get("/api/departments/cooking/overview").json()
    ov["name"] = "دپارتمان پخت (ویرایش)"
    r = c.put("/api/departments/cooking/overview", json=ov)
    assert r.status_code == 200
    assert c.get("/api/departments/cooking/overview").json()["name"].endswith("(ویرایش)")


def test_put_overview_invalid_422(data_root):
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/overview", json={"department": "cooking"})
    assert r.status_code == 422


def test_process_list(data_root):
    c = _auth_client(data_root)
    procs = c.get("/api/departments/cooking/processes").json()
    assert any(p["id"] == "cooking-001" for p in procs)


def test_next_id_previews_allocation(data_root):
    c = _auth_client(data_root)
    r = c.get("/api/departments/cooking/next-id")
    assert r.status_code == 200
    nid = r.json()["next_id"]
    assert nid.startswith("cooking-")
    # stateless: a second call returns the same id (nothing was written)
    assert c.get("/api/departments/cooking/next-id").json()["next_id"] == nid


def test_next_id_unknown_department_404(data_root):
    c = _auth_client(data_root)
    assert c.get("/api/departments/nope/next-id").status_code == 404


def _write_tombstone(data_root, pid="cooking-002"):
    # Minimal tombstoned doc placed straight on disk (not through the write route,
    # which would schema-validate). Copies the golden process, flips the flag.
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    doc["tombstoned"] = True
    doc["superseded_by"] = ["cooking-050"]
    dst = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def test_tombstoned_process_excluded_from_counts(data_root):
    _write_tombstone(data_root)
    c = _auth_client(data_root)
    rows = c.get("/api/departments").json()
    cooking = next(r for r in rows if r["code"] == "cooking")
    # only the active cooking-001 counts; the tombstone (which also carries the
    # golden's open pending) must not inflate count or conflicts
    assert cooking["count"] == 1
    assert cooking["conflicts"] == 1


def test_tombstoned_process_still_listed(data_root):
    _write_tombstone(data_root)
    c = _auth_client(data_root)
    procs = c.get("/api/departments/cooking/processes").json()
    tomb = next(p for p in procs if p["id"] == "cooking-002")
    assert tomb["tombstoned"] is True and tomb["superseded_by"] == ["cooking-050"]
