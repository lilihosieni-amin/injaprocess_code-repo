import json
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = REPO / "tests" / "fixtures"
SCHEMAS = REPO / "schemas"

DEPTS = ["management", "accounting", "warehouse", "procurement", "cooking",
         "preparation", "dining", "cashier", "logistics"]

#: Kind -> facts store file (spec §16's layout — the plural of the kind name).
_FACT_FILES = {"item": "items.json", "record": "records.json",
              "measurement": "measurements.json", "rule": "rules.json",
              "note": "notes.json"}

#: The facts store's two seed entries, hand-written (the merge-only rule of
#: CLAUDE.md's `facts/**` binds the live store, not a test fixture): a
#: green-able cooking-scoped rule and a disputed universal record, matching
#: task 17's brief exactly.
_FACT_ENTRIES = [
    {"id": "F-00001", "kind": "rule", "key": "test_declared_use",
     "title": "قانون آزمایشی", "statement": "بیانیهٔ آزمایشی",
     "scope": {"departments": ["cooking"], "branches": []}, "source": [],
     "status": "confirmed", "retired": False,
     "updated_at": "2026-07-06T10:00:00Z",
     "data": {"inputs": [], "outputs": []}},
    {"id": "F-00002", "kind": "record", "key": "test_monde_shab",
     "title": "رکورد آزمایشی", "statement": "بیانیهٔ آزمایشی",
     "scope": {"departments": [], "branches": []}, "source": [],
     "status": "disputed", "retired": False,
     "updated_at": "2026-07-06T10:00:00Z",
     "data": {"medium": "paper", "role": "log",
              "location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"}}},
]


def _load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def _write_facts_store(root):
    """`facts/`: the five kind files (one seeded per `_FACT_ENTRIES`, the rest
    empty) plus the index row for each — matching how `process.cooking-001.json`
    is seeded above, by hand rather than through `merge facts` (a live store's
    only writer), because this is a served fixture, not the live store."""
    by_kind = {}
    for entry in _FACT_ENTRIES:
        by_kind.setdefault(entry["kind"], []).append(entry)
    for kind, filename in _FACT_FILES.items():
        (root / "facts" / filename).write_text(
            _dump({"schema_version": 1, "entries": by_kind.get(kind, [])}),
            encoding="utf-8")
    index_rows = [
        {"id": e["id"], "kind": e["kind"], "key": e["key"], "title": e["title"],
         "scope": e["scope"], "status": e["status"], "retired": e["retired"],
         "updated_at": e["updated_at"]}
        for e in _FACT_ENTRIES
    ]
    (root / "facts" / ".index.json").write_text(
        _dump({"schema_version": 1, "entries": index_rows}), encoding="utf-8")


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
    (root / "facts").mkdir(parents=True)
    _write_facts_store(root)
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(root), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-q", "-m", "seed"], check=True)
    return root
