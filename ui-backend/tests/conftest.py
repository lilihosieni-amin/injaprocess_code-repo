import json
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = REPO / "tests" / "fixtures"
SCHEMAS = REPO / "schemas"

DEPTS = ["management", "accounting", "warehouse", "procurement", "cooking",
         "preparation", "dining", "cashier", "logistics"]


def _load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


@pytest.fixture
def data_root(tmp_path):
    """A git-initialised temp DATA_ROOT seeded from golden fixtures."""
    root = tmp_path / "data"
    for d in DEPTS:
        (root / "departments" / d / "processes").mkdir(parents=True)
        (root / "departments" / d / "attachments").mkdir(parents=True)
    (root / "departments" / "registry.json").write_text(
        _dump(_load("registry.json")), encoding="utf-8")
    # one real process + overview to read/edit
    proc = _load("process.cooking-001.json")
    (root / "departments" / "cooking" / "processes" / "cooking-001.json").write_text(
        _dump(proc), encoding="utf-8")
    ov = _load("overview.cooking.json")
    (root / "departments" / "cooking" / "overview.json").write_text(
        _dump(ov), encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(root), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-q", "-m", "seed"], check=True)
    return root
