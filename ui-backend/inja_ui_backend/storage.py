from __future__ import annotations

import asyncio
import contextlib
import json
import os
import tempfile
from pathlib import Path

_LOCKS: dict[str, asyncio.Lock] = {}


def read_json(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json_atomic(path: Path, doc: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)


@contextlib.asynccontextmanager
async def file_lock(path: Path):
    key = str(Path(path).resolve())
    lock = _LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        yield


def dept_of(pid: str) -> str:
    return pid.rsplit("-", 1)[0]


def proc_path(root: Path, pid: str) -> Path:
    return Path(root) / "departments" / dept_of(pid) / "processes" / f"{pid}.json"


def overview_path(root: Path, code: str) -> Path:
    return Path(root) / "departments" / code / "overview.json"


def registry_path(root: Path) -> Path:
    return Path(root) / "departments" / "registry.json"


def list_process_files(root: Path, code: str) -> list[Path]:
    d = Path(root) / "departments" / code / "processes"
    return sorted(d.glob("*.json")) if d.is_dir() else []
