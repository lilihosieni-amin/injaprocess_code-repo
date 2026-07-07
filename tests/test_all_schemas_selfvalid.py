from conftest import SCHEMA_DIR, load_json
from jsonschema import Draft202012Validator

EXPECTED = {
    "registry.schema.json", "process.schema.json", "candidate.schema.json",
    "delta.schema.json", "overview.schema.json", "segments.schema.json",
    "run-meta.schema.json", "conflicts.schema.json",
}


def test_all_expected_schemas_present():
    found = {p.name for p in SCHEMA_DIR.glob("*.schema.json")}
    assert EXPECTED <= found, f"missing: {EXPECTED - found}"


def test_every_schema_is_self_valid():
    for p in SCHEMA_DIR.glob("*.schema.json"):
        Draft202012Validator.check_schema(load_json(p))
