#!/usr/bin/env python3
"""Tier-1 mechanism probe (spec 2026-07-20, after ADR 0005's A/B repro).

Dispatches 4 parallel Task subagents in ONE message, mirroring the bot's
DEPLOYED options (include_partial_messages=False). Each subagent sleeps ~100 s
(matching the longest real extract) and writes one file. PASS = 4/4 files.

Run INSIDE the control-bot container on the 2-CPU server:
    docker compose exec control-bot python /opt/testing/parallel_task_probe.py
NOTE: adjust the ClaudeSDKClient/ClaudeAgentOptions call to match the installed
claude_agent_sdk API as used in src/claude/sdk_integration.py.
"""
import glob
import os

import anyio
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

OUT = "/tmp/probe_out"
N = 4


async def _run():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*")):
        os.remove(f)
    options = ClaudeAgentOptions(
        allowed_tools=["Task", "Bash"],
        permission_mode="bypassPermissions",
        include_partial_messages=False,  # mirror control-bot patch 0004 (deployed)
    )
    prompt = (
        f"Dispatch {N} Task subagents IN PARALLEL, all in ONE single message, as the "
        f"first thing you do. Subagent i (for i in 1..{N}) must run exactly this Bash "
        f"command and nothing else: sleep 100 && printf ok > {OUT}/agent_$i.txt . "
        f"Wait for all {N} to return. Then stop."
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for _ in client.receive_response():
            pass


def main():
    anyio.run(_run)
    files = glob.glob(os.path.join(OUT, "agent_*.txt"))
    ok = len(files) == N
    print(f"PROBE {'PASS' if ok else 'FAIL'}: {len(files)}/{N} files -> {sorted(files)}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
