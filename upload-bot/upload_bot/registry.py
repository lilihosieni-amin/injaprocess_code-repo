import json
from pathlib import Path


def _load(data_root):
    path = Path(data_root) / "departments" / "registry.json"
    return json.loads(path.read_text(encoding="utf-8"))


def department_codes(data_root):
    return [d["code"] for d in _load(data_root)["departments"]]


def department_choices(data_root):
    """(code, persian_name) pairs in registry order — for building keyboards."""
    return [(d["code"], d["name"]) for d in _load(data_root)["departments"]]


def is_valid_department(code, data_root):
    return code in department_codes(data_root)
