import pathlib

import pytest


@pytest.fixture
def data_root(tmp_path):
    root = tmp_path / "data"
    for sub in ("departments/cooking/attachments", "departments/dining/attachments",
                "meetings/audio", ".staging"):
        (root / sub).mkdir(parents=True)
    registry = pathlib.Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "registry.json"
    (root / "departments").mkdir(exist_ok=True)
    (root / "departments" / "registry.json").write_text(
        registry.read_text(encoding="utf-8"), encoding="utf-8")
    return root
