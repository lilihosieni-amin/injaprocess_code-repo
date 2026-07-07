import json
import pathlib

import pytest

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "tests" / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    """A temp DATA_ROOT with the departments/ skeleton; DATA_ROOT env pointed at it."""
    root = tmp_path / "data"
    for sub in ("departments/cooking/processes", "meetings/audio",
                "meetings/transcripts", "runs"):
        (root / sub).mkdir(parents=True)
    monkeypatch.setenv("DATA_ROOT", str(root))
    return root
