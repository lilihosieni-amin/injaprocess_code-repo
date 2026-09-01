import json
import pathlib
import sys

import pytest

# Shared test helpers (e.g. `facts_helpers`) live beside the test modules and
# are imported bare (`from facts_helpers import ...`), not as `tests.
# facts_helpers` — the package dotted path exists only to keep this
# directory's `test_*.py` names from colliding with same-named files under
# the other `testpaths` roots. Put this directory itself on sys.path so the
# bare import resolves.
_HERE = pathlib.Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

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
