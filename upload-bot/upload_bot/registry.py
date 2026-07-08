import json
from pathlib import Path


def department_codes(data_root):
    path = Path(data_root) / "departments" / "registry.json"
    reg = json.loads(path.read_text(encoding="utf-8"))
    return [d["code"] for d in reg["departments"]]


def is_valid_department(code, data_root):
    return code in department_codes(data_root)
