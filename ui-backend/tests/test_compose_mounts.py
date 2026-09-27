"""`app.db` — and every copy of it — is mounted only into ui-backend (spec D5,
addendum D82; §11 test 20). Only this test covers the boundary the outbox and
the backup job exist to preserve."""
import pathlib

import pytest
import yaml

DEPLOY = pathlib.Path(__file__).resolve().parents[2] / "deploy"


@pytest.mark.parametrize("name,sources", [
    ("docker-compose.yml", {"ui-state", "/opt/inja/backups"}),
    ("docker-compose.local.yml", {"local-ui-state", "local-ui-backups"}),
])
def test_app_db_and_its_backups_are_mounted_only_into_ui_backend(name, sources):
    services = yaml.safe_load((DEPLOY / name).read_text(encoding="utf-8"))["services"]
    holders = {svc for svc, spec in services.items()
               for v in spec.get("volumes") or []
               if isinstance(v, str) and v.split(":")[0] in sources}
    assert holders == {"ui-backend"}
    mounted = {v.split(":")[0] for v in services["ui-backend"]["volumes"]
               if isinstance(v, str)}
    assert sources <= mounted
