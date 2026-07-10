from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from .config import Settings


class EngineError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.message = message
        self.code = code


def _env(cfg: Settings) -> dict:
    import os
    import sys

    bindir = os.path.dirname(sys.executable)
    path = os.environ.get("PATH", "")
    parts = path.split(os.pathsep) if path else []
    if bindir not in parts:
        path = bindir + (os.pathsep + path if path else "")
    return {"PATH": path, "DATA_ROOT": str(cfg.data_root), "SCHEMA_DIR": str(cfg.schema_dir)}


def _run(cfg: Settings, args: list[str]) -> str:
    r = subprocess.run(args, capture_output=True, text=True, env=_env(cfg))
    if r.returncode != 0:
        raise EngineError((r.stderr or r.stdout).strip(), r.returncode)
    return r.stdout


def _tmp_doc(doc: dict) -> Path:
    fd, name = tempfile.mkstemp(suffix=".json")
    Path(name).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    import os

    os.close(fd)
    return Path(name)


def allocate_process_id(cfg: Settings, department: str) -> str:
    return _run(cfg, ["allocate-id", "process", department]).strip()


def allocate_box_id(cfg: Settings, working_doc: dict) -> str:
    tmp = _tmp_doc(working_doc)
    try:
        return _run(cfg, ["allocate-id", "box", str(tmp)]).strip()
    finally:
        tmp.unlink(missing_ok=True)


def allocate_junction_id(cfg: Settings, working_doc: dict) -> str:
    tmp = _tmp_doc(working_doc)
    try:
        return _run(cfg, ["allocate-id", "junction", str(tmp)]).strip()
    finally:
        tmp.unlink(missing_ok=True)


def resolve_pending(cfg: Settings, pid: str, index: int, decision: str) -> None:
    _run(cfg, ["merge", decision, "--process", pid, "--index", str(index)])


def validate_doc(cfg: Settings, schema_name: str, doc: dict) -> None:
    tmp = _tmp_doc(doc)
    try:
        _run(cfg, ["validate", schema_name, str(tmp)])
    finally:
        tmp.unlink(missing_ok=True)


def run_layout(cfg: Settings, working_doc: dict) -> dict:
    # `layout <file> --full` repositions in place (prints nothing); read it back.
    tmp = _tmp_doc(working_doc)
    try:
        _run(cfg, ["layout", str(tmp), "--full"])
        return json.loads(tmp.read_text(encoding="utf-8"))
    finally:
        tmp.unlink(missing_ok=True)
