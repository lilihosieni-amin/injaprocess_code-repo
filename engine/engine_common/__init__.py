import json
import os
import pathlib
import tempfile

from jsonschema import Draft202012Validator


def data_root():
    r = os.environ.get("DATA_ROOT")
    if not r:
        raise SystemExit("DATA_ROOT is not set")
    return pathlib.Path(r)


def schema_dir():
    d = os.environ.get("SCHEMA_DIR")
    if d:
        return pathlib.Path(d)
    # engine/engine_common/__init__.py -> parents[2] == code-repo root
    return pathlib.Path(__file__).resolve().parents[2] / "schemas"


def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def write_json_atomic(path, obj):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


_VALIDATORS = {}


def validate(schema_name, instance):
    v = _VALIDATORS.get(schema_name)
    if v is None:
        schema = read_json(schema_dir() / schema_name)
        Draft202012Validator.check_schema(schema)
        v = Draft202012Validator(schema)
        _VALIDATORS[schema_name] = v
    errors = sorted(v.iter_errors(instance), key=lambda e: list(e.path))
    if errors:
        msg = "; ".join(e.message for e in errors[:5])
        raise ValueError(f"{schema_name} validation failed: {msg}")


def is_empty(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, dict):
        return all(is_empty(v) for v in value.values())
    if isinstance(value, list):
        return len(value) == 0
    return False
