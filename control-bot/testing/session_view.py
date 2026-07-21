#!/usr/bin/env python3
"""session_view.py — read-only viewer for control-bot Claude Code session transcripts.

The control-bot writes one JSON-Lines transcript per session under
`/root/.claude/projects/-data/*.jsonl` (inside the container; a persistent named
volume). Each line is a turn and carries the FULL detail the Telegram chat hides:
every user/assistant message, every agent/subagent (`Task`) call, every
`Bash`/`Read`/`Write`/… tool call, tool results, and `stop_reason`s.

Two modes:
  * list  — no session arg: list sessions (time · id · #turns · first user line),
            newest first, so you can find the tester's run.
  * view  — a session id (or a .jsonl path): render it as a readable log with
            agent/tool calls, results, and anomaly flags.

Runs inside the container (default dir) or against a copied dir with --dir, so you
can also `scp` a transcript off the server and read it locally. Stdlib only.

Examples (on the server):
  # copy this script into the running control-bot, then:
  docker compose exec control-bot python3 /tmp/session_view.py                 # list
  docker compose exec control-bot python3 /tmp/session_view.py <id>            # view
  docker compose exec control-bot python3 /tmp/session_view.py <id> --tools    # only tool/agent calls + stops
  docker compose exec control-bot python3 /tmp/session_view.py <id> --full     # no truncation
  docker compose exec control-bot python3 /tmp/session_view.py <id> --grep متن # only turns whose text matches

Locally on a copied transcript:
  python3 session_view.py --dir ./transcripts             # list
  python3 session_view.py ./transcripts/<id>.jsonl        # view one file
"""
import argparse
import glob
import html as _h
import json
import os
import sys

DEFAULT_DIR = "/root/.claude/projects/-data"
TRUNC = 220  # default per-block truncation

# stop_reason / content signatures that mark a stall or an error (from ADRs 0002-0007/0011)
STALL_MARKERS = (
    "No response requested",
    "Continue from where you left off",
    "Auto-resuming deferred tool",
    "[Tool result missing due to internal error]",
)


def _clip(s, n):
    """Collapse whitespace; append a visible marker when truncated (n is huge under --full)."""
    s = " ".join(str(s).split())
    if len(s) <= n:
        return s
    return s[:n] + f" …[+{len(s) - n} chars — use --full]"


def _read(path):
    rows = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except (ValueError, json.JSONDecodeError):
                continue
    return rows


def _text_of(content):
    """Flatten a message .content (str or list of blocks) to plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                parts.append(b.get("text", ""))
        return " ".join(parts)
    return ""


def _first_user_line(rows):
    for o in rows:
        if o.get("type") != "user":
            continue
        c = _text_of(o.get("message", {}).get("content", ""))
        c = " ".join(c.split())
        # skip injected skill preambles / tool-result echoes
        if not c or c.startswith("Base directory") or "process-voice playbook" in c:
            continue
        return c
    return ""


def cmd_list(directory):
    files = sorted(glob.glob(os.path.join(directory, "*.jsonl")), key=os.path.getmtime, reverse=True)
    if not files:
        print(f"(no .jsonl transcripts in {directory})")
        return 1
    print(f"{'modified':19}  {'turns':>5}  session-id (first user message)")
    print("-" * 78)
    import datetime as _dt
    for f in files:
        rows = _read(f)
        mt = _dt.datetime.utcfromtimestamp(os.path.getmtime(f)).strftime("%Y-%m-%d %H:%M:%S")
        sid = os.path.basename(f)[:-6]  # strip .jsonl
        first = _first_user_line(rows)[:44]
        print(f"{mt}  {len(rows):>5}  {sid[:8]}…  {first}")
    print(f"\n{len(files)} session(s) in {directory}")
    return 0


def _resolve(directory, session):
    if os.path.isfile(session):
        return session
    # match by (prefix of) id
    cands = [f for f in glob.glob(os.path.join(directory, "*.jsonl"))
             if os.path.basename(f).startswith(session)]
    if len(cands) == 1:
        return cands[0]
    if not cands:
        print(f"no session matching '{session}' in {directory}", file=sys.stderr)
    else:
        print(f"'{session}' is ambiguous ({len(cands)} matches); use a longer id", file=sys.stderr)
    return None


def _tool_line(block):
    """One-line summary of a tool_use block."""
    name = block.get("name", "?")
    inp = block.get("input", {}) or {}
    if name in ("Task", "Agent"):
        sub = inp.get("subagent_type") or inp.get("agentType") or ""
        desc = inp.get("description") or inp.get("prompt", "")[:60]
        return f"AGENT {sub or '?'} :: {desc}"
    if name == "Bash":
        return f"Bash :: {(inp.get('description') or inp.get('command', ''))[:100]}"
    if name in ("Read", "Write", "Edit", "NotebookEdit"):
        return f"{name} :: {inp.get('file_path', '')}"
    if name in ("Glob", "Grep"):
        return f"{name} :: {inp.get('pattern', '')} {('in ' + inp['path']) if inp.get('path') else ''}"
    if name == "Skill":
        return f"Skill :: {inp.get('skill', '')} {inp.get('args', '')}"
    # generic
    keys = ", ".join(f"{k}={str(v)[:30]}" for k, v in list(inp.items())[:2])
    return f"{name} :: {keys}"


def _result_text(block):
    c = block.get("content", "")
    if isinstance(c, list):
        c = " ".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text")
    return str(c)


def cmd_view(path, full=False, tools_only=False, grep=None, tail=0):
    rows = _read(path)
    if tail:
        rows = rows[-tail:]
    trunc = 10**9 if full else TRUNC
    print(f"# {os.path.basename(path)}  ({len(rows)} turns)\n")
    stalls = 0
    for o in rows:
        t = o.get("type")
        ts = (o.get("timestamp") or "")[11:19]  # HH:MM:SS
        m = o.get("message", {}) or {}
        stop = m.get("stop_reason")
        content = m.get("content", "")

        # gather blocks
        blocks = content if isinstance(content, list) else [{"type": "text", "text": content}]
        texts, tools, results = [], [], []
        for b in blocks:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "text" and b.get("text", "").strip():
                texts.append(b["text"].strip())
            elif bt == "tool_use":
                tools.append(_tool_line(b))
            elif bt == "tool_result":
                rt = _result_text(b)
                err = b.get("is_error") or any(s in rt for s in STALL_MARKERS)
                results.append(("!" if err else "", rt))
            elif bt == "thinking":
                pass  # skip internal reasoning

        joined = " ".join(texts + [x for _, x in results])
        if grep and grep not in joined and grep not in " ".join(tools):
            continue

        if t == "user":
            for r_err, rt in results:
                flag = "  ⚠STALL/ERR" if r_err else ""
                if not tools_only or r_err:
                    print(f"[{ts}] ← result{flag}: {_clip(rt, trunc)}")
            for tx in texts:
                # human message (or injected)
                label = "USER" if not tx.startswith("Base directory") and "process-voice playbook" not in tx else "user(inject)"
                if not tools_only or label == "USER":
                    print(f"[{ts}] 👤 {label}: {_clip(tx, trunc)}")
        elif t == "assistant":
            for tx in texts:
                if not tools_only:
                    print(f"[{ts}] 🤖 {_clip(tx, trunc)}")
            for tl in tools:
                print(f"[{ts}]    → {_clip(tl, trunc)}")
            # only surface ABNORMAL stops (tool_use/end_turn are the normal cases)
            if stop and stop not in ("end_turn", "tool_use"):
                mark = "  ⚠STALL" if stop == "stop_sequence" else ""
                print(f"[{ts}]      ⚠ stop_reason={stop}{mark}")
            if stop == "stop_sequence":
                stalls += 1
        elif t == "summary":
            print(f"[{ts}] ── (context summary / compaction) ──")

    if stalls:
        print(f"\n⚠ {stalls} assistant turn(s) ended on stop_reason=stop_sequence "
              f"(the control-bot mid-run stall signature — ADRs 0002-0007).")
    return 0


_CSS = """
:root{color-scheme:dark}
body{margin:0;background:#0d1117;color:#e6edf3;line-height:1.75;
 font-family:"Vazirmatn","Segoe UI",Tahoma,"Iranian Sans",Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:14px}
header{position:sticky;top:0;background:#161b22ee;backdrop-filter:blur(4px);
 border-bottom:1px solid #30363d;padding:10px 16px;z-index:9;font-size:14px}
header b{color:#e6edf3}.warn{color:#f85149;font-weight:600}
header a{color:#f0883e;text-decoration:none;margin:0 4px}
.turn{margin:9px 0;padding:7px 12px;border-radius:8px;border:1px solid #30363d;background:#161b22}
.turn.user{border-left:4px solid #58a6ff}
.turn.assistant{border-left:4px solid #3fb950}
.turn.result{border-left:4px solid #8b949e;background:#10151c}
.turn.inject,.turn.summary{border-left:4px solid #d29922;opacity:.75}
.turn.stallrow{border-left:4px solid #f85149;background:#20141480}
.meta{font-size:12px;color:#8b949e;margin-bottom:3px}
.role{font-weight:600;color:#c9d1d9}.ts{color:#6e7681}
.content{white-space:pre-wrap;word-break:break-word}
.tool{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:#d2a8ff;margin:2px 0}
.tool .arrow{color:#8b949e}.tool .agent{color:#f0883e;font-weight:600}
pre.result{white-space:pre-wrap;word-break:break-word;margin:4px 0;padding:8px;
 font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;
 background:#0d1117;border:1px solid #21262d;border-radius:6px;max-height:360px;overflow:auto}
.stall{color:#f85149;font-weight:600}
"""


def _esc(s):
    return _h.escape(str(s), quote=False)


def cmd_html(path, grep=None, tail=0):
    rows = _read(path)
    if tail:
        rows = rows[-tail:]
    turns, stalls = [], []

    def add(cls, meta, inner):
        turns.append(f'<div class="turn {cls}"><div class="meta">{meta}</div>{inner}</div>')

    for o in rows:
        t = o.get("type")
        m = o.get("message", {}) or {}
        ts = _esc((o.get("timestamp") or "")[11:19])
        stop = m.get("stop_reason")
        content = m.get("content", "")
        blocks = content if isinstance(content, list) else [{"type": "text", "text": content}]
        texts, tools, results = [], [], []
        for b in blocks:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "text" and b.get("text", "").strip():
                texts.append(b["text"].strip())
            elif bt == "tool_use":
                tools.append((b.get("name", ""), _tool_line(b)))
            elif bt == "tool_result":
                rt = _result_text(b)
                err = bool(b.get("is_error")) or any(s in rt for s in STALL_MARKERS)
                results.append((err, rt))
        if grep and grep not in " ".join(texts + [x for _, x in results] + [x for _, x in tools]):
            continue

        if t == "user":
            for err, rt in results:
                cls = "result stallrow" if err else "result"
                aid = ""
                if err:
                    sid = f"stall{len(stalls)}"; stalls.append(sid); aid = f' id="{sid}"'
                flag = ' <span class="stall">⚠ STALL/ERR</span>' if err else ""
                add(cls, f'<span class="ts">{ts}</span> ← result{flag}',
                    f'<pre class="result"{aid} dir="auto">{_esc(rt)}</pre>')
            for tx in texts:
                inject = tx.startswith("Base directory") or "process-voice playbook" in tx or tx.startswith("This session is being continued")
                cls = "inject" if inject else "user"
                role = "user (injected)" if inject else "👤 USER"
                add(cls, f'<span class="ts">{ts}</span> <span class="role">{role}</span>',
                    f'<div class="content" dir="auto">{_esc(tx)}</div>')
        elif t == "assistant":
            inner = []
            for tx in texts:
                inner.append(f'<div class="content" dir="auto">{_esc(tx)}</div>')
            for name, tl in tools:
                agent = ' agent' if name in ("Task", "Agent") else ''
                inner.append(f'<div class="tool"><span class="arrow">→</span> <span class="{agent.strip() or "t"}">{_esc(tl)}</span></div>')
            cls = "assistant"
            if stop and stop not in ("end_turn", "tool_use"):
                mark = " ⚠ STALL" if stop == "stop_sequence" else ""
                if stop == "stop_sequence":
                    sid = f"stall{len(stalls)}"; stalls.append(sid); cls = "assistant stallrow"
                    inner.append(f'<div class="stall" id="{sid}">⚠ stop_reason={_esc(stop)}{mark}</div>')
                else:
                    inner.append(f'<div class="stall">⚠ stop_reason={_esc(stop)}</div>')
            if inner:
                add(cls, f'<span class="ts">{ts}</span> <span class="role">🤖 assistant</span>', "".join(inner))
        elif t == "summary":
            add("summary", f'<span class="ts">{ts}</span> ── context summary / compaction ──', "")

    jump = ""
    if stalls:
        links = " ".join(f'<a href="#{s}">#{i+1}</a>' for i, s in enumerate(stalls))
        jump = f' &nbsp; <span class="warn">⚠ {len(stalls)} stall(s):</span> {links}'
    head = (f'<b>{_esc(os.path.basename(path))}</b> &nbsp; {len(rows)} turns{jump}')
    doc = (f'<!doctype html><html><head><meta charset="utf-8">'
           f'<meta name="viewport" content="width=device-width,initial-scale=1">'
           f'<title>{_esc(os.path.basename(path))}</title><style>{_CSS}</style></head>'
           f'<body><header>{head}</header><div class="wrap">{"".join(turns)}</div></body></html>')
    print(doc)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="session_view", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("session", nargs="?", help="session id (or prefix) or a .jsonl path; omit to LIST")
    ap.add_argument("--dir", default=os.environ.get("SESSION_DIR", DEFAULT_DIR),
                    help=f"transcript directory (default {DEFAULT_DIR}, or $SESSION_DIR)")
    ap.add_argument("--full", action="store_true", help="do not truncate text/results")
    ap.add_argument("--tools", action="store_true", dest="tools_only",
                    help="show only agent/tool calls, stops, and human messages")
    ap.add_argument("--grep", help="show only turns whose text/tools contain this substring")
    ap.add_argument("--tail", type=int, default=0, help="only the last N turns")
    ap.add_argument("--html", action="store_true",
                    help="emit a self-contained HTML page (redirect to a .html file, open in a browser)")
    args = ap.parse_args(argv)

    if not args.session:
        return cmd_list(args.dir)
    path = _resolve(args.dir, args.session)
    if not path:
        return 2
    if args.html:
        return cmd_html(path, grep=args.grep, tail=args.tail)
    return cmd_view(path, full=args.full, tools_only=args.tools_only, grep=args.grep, tail=args.tail)


if __name__ == "__main__":
    sys.exit(main())
