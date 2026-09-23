from inja_ui_backend import exports
from inja_ui_backend.tests_helpers import signed_in_client


def test_the_registry_is_the_only_list_of_kinds():
    assert exports.REPORT_IDS == ("flowchart", "steps")
    assert not hasattr(exports, "EXPORT_KINDS"), \
        "EXPORT_KINDS is the hand-synchronised list D26 replaces"


def test_every_entry_carries_the_four_strings():
    for r in exports.REGISTRY:
        assert r.id and r.name and r.short and r.description


def test_the_registry_is_served_to_the_frontend(data_root, tmp_path):
    client, _cfg = signed_in_client(data_root, tmp_path / "app.db")
    r = client.get("/api/reports")
    assert r.status_code == 200, r.text
    assert r.json() == {"reports": [
        {"id": "flowchart", "name": "سند فلوچارت دپارتمان",
         "short": "مستندات کامل",
         "description": "هر فرآیند در یک برگ، به ترتیب سازمان‌یافتهٔ دپارتمان."},
        {"id": "steps", "name": "راهنمای گام‌به‌گام",
         "short": "راهنمای گام‌به‌گام",
         "description": "همان فرآیندها، بازنویسی‌شده به گام‌های شماره‌دار."},
    ]}


def test_the_registry_needs_a_session(data_root, tmp_path):
    from fastapi.testclient import TestClient
    from inja_ui_backend.app import create_app
    from inja_ui_backend.tests_helpers import cfg_for
    client = TestClient(create_app(cfg_for(data_root, tmp_path / "app.db")),
                        base_url="https://testserver")
    assert client.get("/api/reports").status_code == 401
