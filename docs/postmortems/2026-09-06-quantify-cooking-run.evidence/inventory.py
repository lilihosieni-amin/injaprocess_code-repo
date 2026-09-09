#!/usr/bin/env python3
"""Inventory the sheets estate + per-department transcripts/attachments.

Sizes work units for a parallel redesign of the `quantify` run.
Self-check: run with --selftest.
"""
import csv, io, json, os, re, sys
from collections import Counter, defaultdict

DATA = "/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo"
SHEETS = os.path.join(DATA, "attachments/sheets")
DUMP = os.path.join(SHEETS, ".dump")
TRANSCRIPTS = os.path.join(DATA, "meetings/transcripts")
DEPTS = os.path.join(DATA, "departments")

# A1-style refs incl. $ anchors, column-only and row-only ranges.
# A1 refs. `<COL>N` is the dumper's own relative-row notation for grouped
# formulas (e.g. "CN-BN"); the lookahead keeps MIN(/LN( from being eaten.
A1 = re.compile(r"\$?\b[A-Z]{1,3}\$?(?:\d{1,7}|N)\b(?!\()|\$?\b[A-Z]{1,3}:\$?[A-Z]{1,3}\b")
NUM = re.compile(r"(?<![A-Za-z0-9_])\d+(?:\.\d+)?(?![A-Za-z0-9_])")
IMPORTY = re.compile(r"IMPORT_FROM_SHEET|IMPORTRANGE")


def shape(f):
    """Normalise a formula to its shape: A1 refs -> @, bare numbers -> #."""
    return NUM.sub("#", A1.sub("@", f))


def tsv(path):
    """Rows of a TSV as dicts; [] when missing. Records are single physical
    lines (embedded newlines are backslash-escaped by the dumper)."""
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))


def dirbytes(d):
    return sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d)) if os.path.isdir(d) else 0


def filebytes(p):
    return os.path.getsize(p) if os.path.exists(p) else 0


def workbooks():
    man = json.load(open(os.path.join(SHEETS, "manifest.json"), encoding="utf-8"))
    out = []
    for w in man["workbooks"]:
        sid = w["spreadsheetId"]
        d = os.path.join(DUMP, sid)
        sj = json.load(open(os.path.join(d, "sheets.json"), encoding="utf-8")) if os.path.exists(os.path.join(d, "sheets.json")) else {"sheets": []}
        tabs = sj["sheets"]
        forms = tsv(os.path.join(d, "formulas.tsv"))
        per_tab_forms = defaultdict(list)
        for r in forms:
            per_tab_forms[r["sheet"]].append(r["formula"] or "")
        import_only = [t for t, fs in per_tab_forms.items()
                       if fs and all(IMPORTY.search(f) for f in fs)]
        files = {f: filebytes(os.path.join(d, f)) for f in
                 ("sheets.json", "formulas.tsv", "rows.tsv", "names.tsv",
                  "cf.tsv", "validations.tsv", "comments.tsv", "meta.json")}
        out.append(dict(
            sid=sid, short=w["short"], depts=w["departments"], branches=w["branches"],
            confirmed=w.get("confirmed"), ref_tabs=w.get("reference_tabs", []),
            tabs=tabs,
            n_tabs=len(tabs),
            n_nonempty=sum(1 for t in tabs if not t.get("empty")),
            n_hidden=sum(1 for t in tabs if t.get("hidden")),
            n_table=sum(1 for t in tabs if t["name"].startswith("Table_")),
            n_forms=len(forms),
            n_shapes=len({shape(r["formula"] or "") for r in forms}),
            n_expanded=sum(int(r.get("count") or 1) for r in forms),
            n_rows=len(tsv(os.path.join(d, "rows.tsv"))),
            n_names=len(tsv(os.path.join(d, "names.tsv"))),
            n_cf=len(tsv(os.path.join(d, "cf.tsv"))),
            n_val=len(tsv(os.path.join(d, "validations.tsv"))),
            n_com=len(tsv(os.path.join(d, "comments.tsv"))),
            import_only=sorted(import_only),
            tabs_with_forms=len(per_tab_forms),
            scripts=[(s, filebytes(os.path.join(SHEETS, s))) for s in w.get("scripts", [])],
            files=files,
            bytes=dirbytes(d),
        ))
    return out


def departments():
    out = {}
    for dept in sorted(os.listdir(DEPTS)):
        p = os.path.join(DEPTS, dept)
        if not os.path.isdir(p):
            continue
        tr = sorted((f, filebytes(os.path.join(TRANSCRIPTS, f)))
                    for f in os.listdir(TRANSCRIPTS)
                    if f.startswith(dept + "-") and f.endswith(".txt"))
        att_dir = os.path.join(p, "attachments")
        att = sorted((f, filebytes(os.path.join(att_dir, f)))
                     for f in os.listdir(att_dir)
                     if os.path.isfile(os.path.join(att_dir, f)) and not f.startswith("."))
        tdir = os.path.join(att_dir, ".text")
        txt = sorted((f, filebytes(os.path.join(tdir, f)))
                     for f in os.listdir(tdir)
                     if f.endswith(".txt")) if os.path.isdir(tdir) else []
        proc = os.path.join(p, "processes")
        out[dept] = dict(transcripts=tr, attachments=att, text=txt,
                         n_processes=len(os.listdir(proc)) if os.path.isdir(proc) else 0,
                         proc_bytes=dirbytes(proc))
    return out


def selftest():
    assert shape("SUM(A1:B20)") == shape("SUM(C5:D99)"), "A1 refs must normalise"
    assert shape("CN-BN") == "@-@"
    assert shape("SUM($A$1:$A$99)*3") == shape("SUM($B$2:$B$7)*8")
    assert shape("IMPORTRANGE(x)") != shape("SUM(A1)")
    assert "MIN(" in shape("MIN(AN,BN)"), shape("MIN(AN,BN)")
    assert shape("MIN(AN,BN)") == shape("MIN(CN,DN)")
    print("selftest ok")


def main():
    wbs = workbooks()
    print("### Workbooks\n")
    hdr = ("short|departments|branches|conf|tabs|nonempty|hidden|Table_*|formula lines|"
           "shapes|expanded cells|rows.tsv|names|cf|valid|comments|import-only tabs|scripts (bytes)|dump bytes")
    print("| " + hdr.replace("|", " | ") + " |")
    print("|" + "---|" * len(hdr.split("|")))
    for w in wbs:
        print("| {short} | {d} | {b} | {c} | {n_tabs} | {n_nonempty} | {n_hidden} | {n_table} | "
              "{n_forms} | {n_shapes} | {n_expanded} | {n_rows} | {n_names} | {n_cf} | {n_val} | "
              "{n_com} | {io} | {sc} | {bytes} |".format(
                  d=",".join(w["depts"]), b=",".join(w["branches"]),
                  c="Y" if w["confirmed"] else "N",
                  io=len(w["import_only"]), sc="; ".join(f"{os.path.basename(s)} ({n})" for s, n in w["scripts"]) or "-",
                  **w))
    tot = lambda k: sum(w[k] for w in wbs)
    print(f"\n**Totals**: {len(wbs)} workbooks, {tot('n_tabs')} tabs, {tot('n_nonempty')} non-empty, "
          f"{tot('n_hidden')} hidden, {tot('n_table')} Table_*, {tot('n_forms')} formula lines, "
          f"{tot('n_shapes')} shapes (per-wb sum), {tot('n_expanded')} expanded formula cells, "
          f"{tot('n_rows')} rows.tsv rows, {tot('n_names')} names, {tot('n_cf')} cf, "
          f"{tot('n_val')} validations, {tot('n_com')} comments, {tot('bytes')} dump bytes")

    allshapes = set()
    for w in wbs:
        d = os.path.join(DUMP, w["sid"])
        allshapes |= {shape(r["formula"] or "") for r in tsv(os.path.join(d, "formulas.tsv"))}
    print(f"**Distinct formula shapes across the whole estate: {len(allshapes)}**")

    print("\n### Per-file bytes\n")
    keys = ["sheets.json", "formulas.tsv", "rows.tsv", "names.tsv", "cf.tsv", "validations.tsv", "comments.tsv", "meta.json"]
    print("| short | " + " | ".join(keys) + " | total |")
    print("|" + "---|" * (len(keys) + 2))
    for w in wbs:
        print("| " + w["short"] + " | " + " | ".join(str(w["files"][k]) for k in keys) + f" | {w['bytes']} |")
    print("| **all** | " + " | ".join(str(sum(w["files"][k] for w in wbs)) for k in keys) + f" | {tot('bytes')} |")

    print("\n### Tabs (rows x cols)\n")
    for w in wbs:
        print(f"\n**{w['short']}** ({w['sid']}) — {w['n_tabs']} tabs")
        print("| tab | rows | cols | hidden | empty | formula lines | shapes | import-only |")
        print("|---|---|---|---|---|---|---|---|")
        d = os.path.join(DUMP, w["sid"])
        pf = defaultdict(list)
        for r in tsv(os.path.join(d, "formulas.tsv")):
            pf[r["sheet"]].append(r["formula"] or "")
        for t in w["tabs"]:
            fs = pf.get(t["name"], [])
            print(f"| {t['name']} | {t.get('rows')} | {t.get('cols')} | "
                  f"{'Y' if t.get('hidden') else ''} | {'Y' if t.get('empty') else ''} | "
                  f"{len(fs)} | {len({shape(f) for f in fs})} | "
                  f"{'Y' if fs and all(IMPORTY.search(f) for f in fs) else ''} |")

    print("\n### Departments\n")
    deps = departments()
    print("| dept | transcripts | transcript bytes | attachments | attach bytes | .text bytes | processes | process bytes |")
    print("|---|---|---|---|---|---|---|---|")
    for k, v in deps.items():
        print(f"| {k} | {len(v['transcripts'])} | {sum(b for _, b in v['transcripts'])} | "
              f"{len(v['attachments'])} | {sum(b for _, b in v['attachments'])} | "
              f"{sum(b for _, b in v['text'])} | {v['n_processes']} | {v['proc_bytes']} |")
    print("\n#### Transcript files\n")
    print("| dept | file | bytes | ~tokens (b/3.5) |")
    print("|---|---|---|---|")
    for k, v in deps.items():
        for f, b in v["transcripts"]:
            print(f"| {k} | {f} | {b} | {round(b/3.5)} |")
    print("\n#### Attachment text caches\n")
    print("| dept | file | bytes | ~tokens |")
    print("|---|---|---|---|")
    for k, v in deps.items():
        for f, b in v["text"]:
            print(f"| {k} | {f} | {b} | {round(b/3.5)} |")

    print("\n### Workbooks shared across departments\n")
    bydept = defaultdict(list)
    for w in wbs:
        for d in w["depts"]:
            bydept[d].append(w["short"])
    print("| dept | workbooks | dump bytes | transcript bytes |")
    print("|---|---|---|---|")
    for d, ws in sorted(bydept.items()):
        db = sum(w["bytes"] for w in wbs if w["short"] in ws)
        tb = sum(b for _, b in deps.get(d, {}).get("transcripts", []))
        print(f"| {d} | {len(ws)}: {', '.join(ws)} | {db} | {tb} |")
    multi = [w for w in wbs if len(w["depts"]) > 1]
    print(f"\nWorkbooks listed under >1 department in the manifest: {len(multi)} "
          f"({', '.join(w['short'] for w in multi) or 'none'})")

    print("\n### Cross-workbook coupling (IMPORT_FROM_SHEET targets)\n")
    print("| workbook | referenced spreadsheetIds (via rows.tsv SheetsFileIds) |")
    print("|---|---|")
    short_by_id = {w["sid"]: w["short"] for w in wbs}
    for w in wbs:
        rr = tsv(os.path.join(DUMP, w["sid"], "rows.tsv"))
        ids = []
        for r in rr:
            for v in r.values():
                if v and re.fullmatch(r"[A-Za-z0-9_-]{40,50}", v.strip()):
                    ids.append(short_by_id.get(v.strip(), v.strip()[:12] + "…"))
        if ids:
            print(f"| {w['short']} | {', '.join(sorted(set(ids)))} |")

    print("\n### Token budget\n")
    dumpb = tot("bytes")
    trb = sum(sum(b for _, b in v["transcripts"]) for v in deps.values())
    txb = sum(sum(b for _, b in v["text"]) for v in deps.values())
    scb = sum(b for w in wbs for _, b in w["scripts"])
    print(f"- dump dirs: {dumpb} bytes -> {round(dumpb/3.5)} tokens")
    print(f"- .gs scripts: {scb} bytes -> {round(scb/3.5)} tokens")
    print(f"- transcripts: {trb} bytes -> {round(trb/3.5)} tokens")
    print(f"- attachment text: {txb} bytes -> {round(txb/3.5)} tokens")
    print(f"- TOTAL raw: {dumpb+scb+trb+txb} bytes -> {round((dumpb+scb+trb+txb)/3.5)} tokens")

    ck = [w for w in wbs if "cooking" in w["depts"]]
    ckb = sum(w["bytes"] for w in ck) + sum(b for w in ck for _, b in w["scripts"])
    cktr = sum(b for _, b in deps["cooking"]["transcripts"])
    cktx = sum(b for _, b in deps["cooking"]["text"])
    print(f"\n**COOKING**: {len(ck)} workbooks, {ckb} dump+script bytes ({round(ckb/3.5)} tok), "
          f"{cktr} transcript bytes ({round(cktr/3.5)} tok), {cktx} attachment-text bytes "
          f"({round(cktx/3.5)} tok) => {round((ckb+cktr+cktx)/3.5)} tokens raw")




def skeleton(w):
    """The digest an agent actually needs: tab list + header row, DISTINCT
    formula shapes (not the 584 copies), distinct cf/validation rules,
    names/rows/comments verbatim. Sample data rows are dropped."""
    d = os.path.join(DUMP, w["sid"])
    L = [f"# {w['short']} {w['sid']} depts={','.join(w['depts'])} branches={','.join(w['branches'])}"]
    forms = tsv(os.path.join(d, "formulas.tsv"))
    pf = defaultdict(list)
    for r in forms:
        pf[r["sheet"]].append(r)
    for t in w["tabs"]:
        hdr = " | ".join((t.get("head") or [[]])[0]) if t.get("head") else ""
        L.append(f"{t['name']}\t{t.get('rows')}x{t.get('cols')}"
                 f"{' HIDDEN' if t.get('hidden') else ''}{' EMPTY' if t.get('empty') else ''}"
                 f"\t{hdr}")
    seen = {}
    for r in forms:
        s = shape(r["formula"] or "")
        e = seen.setdefault(s, [0, 0, set()])
        e[0] += 1
        e[1] += int(r.get("count") or 1)
        e[2].add(r["sheet"])
    for s, (n, cells, tabs_) in seen.items():
        L.append(f"F\t{n}x on {len(tabs_)} tabs ({cells} cells)\t{s}")
    for name, rows in (("N", "names.tsv"), ("R", "rows.tsv"), ("C", "comments.tsv")):
        for r in tsv(os.path.join(d, rows)):
            L.append(name + "\t" + "\t".join(str(v) for v in r.values()))
    for tag, f, keyf in (("CF", "cf.tsv", lambda r: (r["type"], r["formula"], r.get("format"))),
                         ("V", "validations.tsv", lambda r: (r["type"], r["values"]))):
        agg = Counter(keyf(r) for r in tsv(os.path.join(d, f)))
        for k, n in agg.items():
            L.append(f"{tag}\t{n}x\t" + "\t".join(str(x) for x in k))
    return "\n".join(L)


def skel_report():
    wbs = workbooks()
    print("\n### Skeleton vs raw (bytes)\n")
    print("| short | raw dump | skeleton | ratio | raw tok | skel tok |")
    print("|---|---|---|---|---|---|")
    tr = ts = 0
    for w in wbs:
        s = len(skeleton(w).encode())
        tr += w["bytes"]; ts += s
        print(f"| {w['short']} | {w['bytes']} | {s} | {w['bytes']/s:.1f}x | "
              f"{round(w['bytes']/3.5)} | {round(s/3.5)} |")
    print(f"| **all** | {tr} | {ts} | {tr/ts:.1f}x | {round(tr/3.5)} | {round(ts/3.5)} |")
    ck = [w for w in wbs if "cooking" in w["depts"]]
    print(f"\nCOOKING skeleton: {sum(len(skeleton(w).encode()) for w in ck)} bytes "
          f"({round(sum(len(skeleton(w).encode()) for w in ck)/3.5)} tokens) "
          f"vs {sum(w['bytes'] for w in ck)} raw")


# --- work-unit planner -------------------------------------------------
PROMPT_TOK = 18509   # quantify.md 18370B + SKILL.md 39795B + schema 6617B, /3.5
OUT_TOK_PER_ENTRY = 517   # measured mean over the 486 entries actually in the store


def plan(dept, cap=40000, out_cap=64000):
    """Greedy pack of one department's sources into units under `cap` TOTAL
    input tokens (fixed prompt included). Oversized transcripts are split by
    line into equal chunks. ponytail: greedy first-fit, not optimal bin-packing."""
    budget = cap - PROMPT_TOK
    wbs = [w for w in workbooks() if dept in w["depts"]]
    deps = departments()[dept]
    src = []
    for w in wbs:
        t = round(len(skeleton(w).encode()) / 3.5)
        for s, b in w["scripts"]:
            t += round(b / 3.5)
        src.append((f"wb:{w['short']}", t))
    for f, b in deps["transcripts"]:
        t = round(b / 3.5)
        if t <= budget:
            src.append((f"tr:{f}", t))
        else:
            n = -(-t // budget)
            lines = sum(1 for _ in open(os.path.join(TRANSCRIPTS, f), encoding="utf-8", errors="replace"))
            step = -(-lines // n)
            for i in range(n):
                src.append((f"tr:{f}[{i*step+1}-{min((i+1)*step, lines)}]", -(-t // n)))
    for f, b in deps["text"]:
        src.append((f"att:{f}", round(b / 3.5)))
    src.sort(key=lambda x: -x[1])
    units = []
    for name, t in src:
        for u in units:
            if u[0] + t <= budget:
                u[0] += t; u[1].append((name, t)); break
        else:
            units.append([t, [(name, t)]])
    print(f"\n### {dept}: {len(units)} units (cap {cap} tok total, {budget} for data)\n")
    print("| unit | data tok | total in tok | max entries out (64K/517) | sources |")
    print("|---|---|---|---|---|")
    for i, (t, items) in enumerate(units, 1):
        print(f"| {dept[:2].upper()}{i} | {t} | {t+PROMPT_TOK} | {out_cap//OUT_TOK_PER_ENTRY} | "
              + "; ".join(f"{n} ({v})" for n, v in items) + " |")
    print(f"\nTotal data {sum(u[0] for u in units)} tok in {len(units)} units.")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
        skel_report()
        for _d in ("cooking", "cashier", "dining", "logistics", "preparation",
                   "warehouse", "management", "procurement", "accounting"):
            plan(_d)
