from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .config import Settings


class EngineError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.message = message
        self.code = code


def _env(cfg: Settings) -> dict:
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
    os.close(fd)
    Path(name).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return Path(name)


def allocate_process_id(cfg: Settings, department: str) -> str:
    return _run(cfg, ["allocate-id", "process", department]).strip()


def peek_process_id(cfg: Settings, department: str) -> str:
    """Preview the next process id without advancing/persisting the ledger."""
    return _run(cfg, ["allocate-id", "process", department, "--peek"]).strip()


def order_set(cfg: Settings, code: str, sequence: list[str]) -> None:
    """Replace a department's process order (ARD §4.6).

    Raises EngineError; its `.message` starts with "set mismatch:" when the
    given sequence is not exactly the department's active set.
    """
    _run(cfg, ["order", "set", code, "--sequence", ",".join(sequence)])


def order_sync(cfg: Settings, code: str) -> None:
    """Reconcile a department's order.json with what is on disk."""
    _run(cfg, ["order", "sync", code])


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


#: The run directory's own name, and the stamps inside its `meta.json`.
#: UTC in both cases — `facts-run-meta.schema.json` patterns the ISO one and
#: the playbook globs the other.
_STAMP = "%Y%m%d-%H%M%S"
_ISO = "%Y-%m-%dT%H:%M:%SZ"


def facts_run_dir(cfg: Settings, department: str, actor: str) -> Path:
    """`runs/facts/{department}/{stamp}/`, with its initial `meta.json`.

    The run directory is the caller's to make: `merge_facts.verbs` writes
    `facts-before/` and `facts-delta.json` into it and nothing else, so the
    record of *who ran what, when* has no other author.

    **Written before the verb runs, with `finished_at: null` and `merged:
    false`** — the `quantify` playbook's Stage 0 precedent, and the reason it
    gives: a run killed mid-write is then distinguishable from a finished one,
    which is what makes a resume (or a post-mortem) possible at all.
    `finish_facts_run` patches both once the verb has succeeded.

    The three input arrays are empty and `ids_created` is `[]` because a UI
    resolve consumes no recording, attachment or workbook and mints no id: it
    settles a dispute inside an entry that already exists. `delta` names the
    file the verb appends to.

    **The stamp is claimed with an exclusive `mkdir`**, and a second run in the
    same second takes the next suffix. Two calls sharing a directory would have
    the second verb snapshot over the first's `facts-before/` and append to its
    delta — corrupting the record of a store write that has already happened.
    """
    now = datetime.now(timezone.utc)
    base = cfg.data_root / "runs" / "facts" / department
    stamp, n = now.strftime(_STAMP), 0
    while True:
        run = base / (stamp if n == 0 else f"{stamp}-{n}")
        try:
            run.mkdir(parents=True)
            break
        except FileExistsError:
            n += 1
    _write_meta(run, {"department": department, "origin": "ui", "actor": actor,
                      "started_at": now.strftime(_ISO), "finished_at": None,
                      "recordings": [], "attachments": [], "workbooks": [],
                      "delta": "facts-delta.json", "merged": False,
                      "ids_created": []})
    return run


def finish_facts_run(run_dir: Path) -> None:
    """Stamp the run as done — the other half of `facts_run_dir`'s ordering.

    Only after the verb has exited 0: a `meta.json` claiming `merged: true`
    over a store the engine refused to touch is worse than no record at all.
    """
    meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
    meta["finished_at"] = datetime.now(timezone.utc).strftime(_ISO)
    meta["merged"] = True
    _write_meta(run_dir, meta)


def _write_meta(run_dir: Path, meta: dict) -> None:
    (run_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def merge_facts_resolve(cfg: Settings, fact_id: str, field: str, account: str,
                        run_dir: Path) -> None:
    """Settle one disputed field (spec §12): the account is `chosen`, the rest
    on that field `rejected`, and `status` re-derived. All four flags are
    required by the CLI, and `--run` is absolute — the shell-out inherits the
    server's working directory, not `DATA_ROOT`.

    Raises `EngineError` on the engine's exit 2, which the caller answers 422
    with: a failed precondition writes nothing, so there is nothing to undo.
    """
    _run(cfg, ["merge", "facts", "resolve", "--id", fact_id, "--field", field,
               "--account", account, "--run", str(run_dir)])


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
