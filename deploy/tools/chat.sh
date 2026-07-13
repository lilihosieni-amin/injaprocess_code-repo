#!/bin/sh
# Watch the pipeline agent chat (Claude Code transcript) — like Claude Code in the terminal.
#   chat.sh            follow the newest session live
#   chat.sh --list     list all sessions (incl. subagents)
#   chat.sh <file>     render one transcript (no follow)
#
# Deployed copy lives at /opt/inja/chat.sh on the server. Reads the Claude Code
# session JSONL the control-bot pipeline writes under /root/.claude/projects/-data.
cd /opt/inja/code-repo/deploy
docker compose exec -T control-bot python3 - "${1:-follow}" <<'PY'
import sys,json,glob,os,time
arg=sys.argv[1] if len(sys.argv)>1 else "follow"
D="/root/.claude/projects/-data"
def newest():
    fs=glob.glob(D+"/*.jsonl"); return max(fs,key=os.path.getmtime) if fs else None
if arg=="--list":
    for f in sorted(glob.glob(D+"/**/*.jsonl",recursive=True),key=os.path.getmtime):
        tag="  (subagent)" if "subagents" in f else ""
        print(time.strftime("%H:%M:%S",time.localtime(os.path.getmtime(f))), f"{os.path.getsize(f):>8}", os.path.basename(f)+tag)
    sys.exit()
def render(o):
    typ=o.get("type"); msg=o.get("message") or {}
    if typ in ("queue-operation","summary"): return
    role=msg.get("role") or typ; c=msg.get("content")
    items=[("text",c)] if isinstance(c,str) else [((b or {}).get("type"),b) for b in (c or [])]
    for t,b in items:
        if t=="text":
            txt=b if isinstance(b,str) else b.get("text","")
            if txt.strip(): print(("\n🧑 " if role=="user" else "\n🤖 ")+txt.strip())
        elif t=="thinking":
            th=b.get("thinking","").strip()
            if th: print("💭 "+th[:300])
        elif t=="tool_use":
            print("🔧 "+str(b.get("name"))+"  "+json.dumps(b.get("input",{}),ensure_ascii=False)[:200])
        elif t=="tool_result":
            rc=b.get("content")
            if isinstance(rc,list): rc=" ".join(x.get("text","") for x in rc if isinstance(x,dict))
            rc=str(rc).strip().replace("\n"," ")
            if rc: print("↩  "+rc[:200])
follow = not arg.endswith(".jsonl")
f = newest() if follow else arg
if not f: print("no sessions yet — run the pipeline first"); sys.exit()
print("== "+("following (live) " if follow else "")+os.path.basename(f)+" ==")
with open(f,encoding="utf-8") as fh:
    for line in fh:
        try: render(json.loads(line))
        except: pass
    while follow:
        line=fh.readline()
        if not line: time.sleep(1); continue
        try: render(json.loads(line))
        except: pass
PY
