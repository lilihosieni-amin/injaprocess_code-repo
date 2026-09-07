#!/usr/bin/env python3
"""Agent eval for one `quantify` unit (design §7, "Agent eval").

On demand, never in `make test`: it makes a real model call. It dispatches the
report-book unit of a prepared run directory through the SDK, exactly as the
playbook's Stage U does, and asserts the six properties the design names — the
output validates, no two kept rules compute the same thing, a rule that was
bound in several places stays one rule, the three cooking rules carry a FEEL
expression, the prose passes the lint, and the agent read two files and wrote
one.

The last one is the cheap proxy for QF-46: an agent that opened a dump, or went
looking for the store, is an agent that will retype the estate again.

Run from the repo root with the engine venv:
    .venv/bin/python control-bot/testing/quantify_unit_eval.py \\
        <run_dir> u-wb-gozaresh_markazi

`--grade-only` skips the dispatch and grades whatever `out.1.json` is already
in the unit's directory — the half that costs nothing, and the only half a
laptop without the SDK can run.

NOTE: match the ClaudeSDKClient/ClaudeAgentOptions call to the installed
claude_agent_sdk API, as `src/claude/sdk_integration.py` does in the container.
"""
import json
import os
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SCHEMA = REPO / "schemas" / "facts-unit.schema.json"
#: The three the cooking estate's report books must produce as computations,
#: keyed by the unit that owns them: a line-inventory or item unit owns none of
#: them, and asserting them there would be three failures that mean nothing.
MUST_COMPUTE = {"u-wb-gozaresh_markazi": ("masraf_elami", "enheraf",
                                          "masraf_vaqei")}


async def _dispatch(run_dir, unit):
    """One `quantify` unit dispatch; returns the tool names it used, in order."""
    # Imported here, not at module level: `--grade-only` must run on a machine
    # that has the engine venv and no SDK.
    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
    prompt = (
        f"Task: quantify\n"
        f"  mode: unit\n"
        f"  run_dir: {run_dir}\n"
        f"  unit: {unit}\n"
        f"  attempt: 1\n"
        f"  input_path: {run_dir}/units/{unit}/input.md\n"
        f"  schema_path: {SCHEMA}\n"
        f"Nothing runs in the background and no monitor exists; the results "
        f"arrive as tool results in this same turn."
    )
    used = []
    options = ClaudeAgentOptions(
        allowed_tools=["Task", "Read", "Write"],
        permission_mode="bypassPermissions",
        include_partial_messages=False,   # mirror control-bot patch 0004
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for message in client.receive_response():
            for block in getattr(message, "content", None) or []:
                name = getattr(block, "name", None)
                if name:
                    used.append(name)
    return used


def _normalised(expr):
    return "".join(str(expr).split())


def _checks(run_dir, unit, used):
    """Every property that failed, one message each; empty means PASS."""
    out = []
    run_dir = pathlib.Path(run_dir)
    path = run_dir / "units" / unit / "out.1.json"
    if not path.is_file():
        return [f"no output at {path}"]
    env = dict(os.environ)
    # `validate facts-unit` resolves the department's process index against
    # DATA_ROOT; a run directory is always `<root>/runs/facts/<dept>/<stamp>`.
    env.setdefault("DATA_ROOT", str(run_dir.resolve().parents[3]))
    # Invoked as `.venv/bin/python …`, the venv's console scripts are not on
    # PATH; `validate` is the one this needs.
    env["PATH"] = f"{pathlib.Path(sys.executable).parent}{os.pathsep}" \
                  f"{env.get('PATH', '')}"
    proc = subprocess.run(
        ["validate", "facts-unit", str(path), "--run", str(run_dir)],
        capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        # The validator's grouped messages go to stderr, not stdout.
        out.append(f"validate facts-unit exit {proc.returncode}: "
                   f"{proc.stderr.strip()}")

    doc = json.loads(path.read_text(encoding="utf-8"))
    kept = [d for d in doc["decisions"] if d.get("action") == "keep"]
    skeleton = json.loads(
        (run_dir / "skeleton.json").read_text(encoding="utf-8"))
    candidates = {c["id"]: c for c in skeleton["candidates"]}

    exprs = {}
    for d in kept:
        expr = (d.get("data") or {}).get("expr")
        if expr:
            exprs.setdefault(_normalised(expr), []).append(d["key"])
    for shape, keys in exprs.items():
        if len(keys) > 1:
            out.append(f"two kept rules share one expression: {keys} — {shape}")

    for d in doc["decisions"]:
        cand = candidates.get(d.get("skeleton")) or {}
        bound = len((cand.get("payload") or {}).get("applies_to") or [])
        if cand.get("kind") == "rule" and bound >= 2 \
                and d.get("action") == "split":
            # A candidate bound in several places is ONE rule (QF-47); the only
            # way a decision can undo that is by splitting it, and a split is
            # for variants that compute different things, not for two branches.
            out.append(f"{d['skeleton']} had {bound} bindings and was split "
                       f"into {len(d.get('into') or [])}")

    have = {d.get("key") for d in kept}
    for key in MUST_COMPUTE.get(unit, ()):
        match = next((d for d in kept if d.get("key") == key), None)
        if match is None:
            out.append(f"no kept rule keyed {key} (kept: {sorted(have)})")
        elif (match.get("data") or {}).get("lang") != "feel" \
                or not (match.get("data") or {}).get("expr"):
            out.append(f"{key} carries no FEEL expr — `original` alone is not a legal state")

    from merge_facts.content import lint_prose
    symbols = skeleton.get("unit_symbols") or []
    for d in kept:
        for field in ("title", "statement"):
            for message in lint_prose(d.get(field, ""), exemptions=symbols):
                out.append(f"{d['key']}.{field}: {message}")

    if used is not None:
        reads, writes = used.count("Read"), used.count("Write")
        if (reads, writes) != (2, 1):
            out.append(f"the agent used {reads} Read and {writes} Write, not 2 and 1")
    return out


def main():
    argv = [a for a in sys.argv[1:] if a != "--grade-only"]
    grade_only = "--grade-only" in sys.argv[1:]
    if len(argv) != 2:
        print(__doc__)
        return 2
    run_dir, unit = argv
    used = None
    if not grade_only:
        import anyio
        used = anyio.run(_dispatch, run_dir, unit)
    problems = _checks(run_dir, unit, used)
    for message in problems:
        print(f"  - {message}")
    print(f"EVAL {'PASS' if not problems else 'FAIL'}: {unit} "
          f"({len(problems)} problems, tools: "
          f"{'not dispatched' if used is None else used})")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
