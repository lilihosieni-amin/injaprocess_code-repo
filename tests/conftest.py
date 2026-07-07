import json
import pathlib

import pytest
from jsonschema import Draft202012Validator

REPO = pathlib.Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO / "schemas"
FIXTURE_DIR = pathlib.Path(__file__).resolve().parent / "fixtures"


def load_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_fixture(name: str):
    return load_json(FIXTURE_DIR / name)


@pytest.fixture
def validate():
    """Return a function (schema_name, instance) -> list of validation errors.

    Empty list means the instance conforms to the schema.
    """
    def _validate(schema_name: str, instance):
        schema = load_json(SCHEMA_DIR / schema_name)
        Draft202012Validator.check_schema(schema)  # schema itself must be valid
        v = Draft202012Validator(schema)
        return sorted(v.iter_errors(instance), key=lambda e: list(e.path))
    return _validate
