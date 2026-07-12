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
