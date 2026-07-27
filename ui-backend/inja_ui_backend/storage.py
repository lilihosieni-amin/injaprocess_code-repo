from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import re
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_LOCKS: dict[str, asyncio.Lock] = {}


def read_json(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_text_atomic(path: Path, text: str) -> None:
    """Write `text` so a reader sees either the old file or the whole new one.

    The single implementation of the write-temp-then-`os.replace` dance, shared by
    `write_json_atomic` and the department export. The temp file is created beside
    the target so the rename stays on one filesystem and is therefore atomic; the
    `finally` clears it on the failure path, where `os.replace` never ran.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)


def write_json_atomic(path: Path, doc: dict) -> None:
    write_text_atomic(path, json.dumps(doc, ensure_ascii=False, indent=2) + "\n")


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


def order_path(root: Path, code: str) -> Path:
    return Path(root) / "departments" / code / "order.json"


def registry_path(root: Path) -> Path:
    return Path(root) / "departments" / "registry.json"


def list_process_files(root: Path, code: str) -> list[Path]:
    """`code`'s process files, in id order.

    Anchored on the department exactly like the engine's `order.active_ids`, so
    the two components cannot disagree about what "the department's process set"
    is. They must not: a stray `dining-007.json` under `cooking/processes/`
    would otherwise be listed and reordered by the UI but called `stale` by the
    `order` CLI, leaving the department permanently un-reorderable behind a
    `409 set mismatch` that reopening the panel cannot clear.
    """
    d = Path(root) / "departments" / code / "processes"
    if not d.is_dir():
        return []
    rx = re.compile(rf"^{re.escape(code)}-\d{{3}}$")
    return sorted(p for p in d.glob("*.json") if rx.match(p.stem))


def ordered_processes(root: Path, code: str) -> list[dict]:
    """`code`'s processes in curated order (ARD §4.6), tombstones last in id order.

    The only implementation of the fallback rule: ids the order does not know are
    appended in id order, ids it names but disk does not have are skipped, and a
    repeated id is kept once. In a consistent data-repo the fallback contributes
    nothing — it is here so a hand-edited or not-yet-migrated repo degrades
    instead of hiding (or doubling) processes.
    """
    docs = {p.stem: read_json(p) for p in list_process_files(root, code)}
    actives = sorted(pid for pid, d in docs.items() if not d.get("tombstoned"))
    tombs = sorted(pid for pid, d in docs.items() if d.get("tombstoned"))

    order = []
    opath = order_path(root, code)
    if opath.is_file():
        try:
            order = [pid for pid in read_json(opath)["order"] if isinstance(pid, str)]
        except (ValueError, OSError, TypeError, KeyError) as e:
            # An unreadable order.json must not take the whole department's list
            # down with it: a 500 here also blocks the only in-UI repair, since
            # the reorder PUT *does* heal the file but the panel cannot be opened
            # on a list that never loads. Fall through to id order.
            logger.warning("%s: falling back to id order — %s is unreadable: %s",
                           code, opath, e)
            order = []

    known = set(actives)
    # dict.fromkeys keeps the first occurrence of a hand-edited duplicate, in place
    seq = list(dict.fromkeys(pid for pid in order if pid in known))
    placed = set(seq)
    seq += [pid for pid in actives if pid not in placed]
    return [docs[pid] for pid in seq + tombs]
