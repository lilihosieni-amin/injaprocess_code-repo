"""`facts-plan preflight <department>` — the deterministic half of a first run,
before any model is asked anything (§6.1 of the v3 design, added 2026-09-08).

It builds the department's run into a scratch directory and pushes every
engine-built candidate through the engine's own unit gate with the smallest
decision a unit could write: a `keep` carrying a key, a title, a statement,
and the one or two members the store demands of the unit per kind. Whatever
the gate refuses beyond those is a shape the engine built and the engine
refuses — the class of defect that killed the raw-materials unit of cooking
in every run until the rows followed the fields' renames, and that no unit
can repair. Two refusals are the unit's to answer and are reported but do not
fail the pre-flight: a member the schema requires the unit to write
(`… is a required property`) and a Latin label the unit must translate
(`title carries the Latin word …`).

Nothing here writes under `DATA_ROOT`: the run is built in a temporary
directory shaped `runs/facts/<department>/<stamp>` so every path-derived
rule holds, and it is removed afterwards.
"""
import collections
import json
import pathlib
import re
import shutil
import tempfile

from facts_plan.assemble import validate_unit
from facts_plan.build import build, label_of

#: What a unit owes and the engine never fills — a refusal matching one of
#: these is reported, not counted against the engine.
#:
#: The title is the whole of the second one. A bare `keep` puts the engine's own
#: mechanical label there — a tab name — because a refusal has to name something
#: the reader can find; the unit writes the real, Persian sentence. So EVERY
#: §5.2 refusal of a bare keep's `title` is the stand-in's, not the estate's:
#: a `Table_Buy` tab (cooking's own `Table_*` tabs are mirrors, so no candidate
#: of the fixture ever carried one as a title) used to make a plannable estate
#: report `engine_refused: 1` and stop the pre-flight.
UNIT_OWED = (re.compile(r"'[^']*' is a required property"),
             re.compile(r": title \S"))

_NON_ASCII = re.compile(r"[^a-z0-9]+")


def _minimal(candidate):
    """The least a unit could write over a candidate and still be judged on
    the engine's shape rather than on its own omissions."""
    kind, payload = candidate["kind"], candidate.get("payload") or {}
    if kind == "record":
        data = {"role": "reference" if payload.get("rows") else "log"}
        fields = payload.get("fields") or []
        if fields:
            data["fields"] = [
                {"from": f["key"], "key": f"f{i}_{_NON_ASCII.sub('_', f['key']).strip('_')}",
                 "type": "string"} for i, f in enumerate(fields)]
        return data
    if kind in ("rule", "script"):
        return {"lang": "sheets"}
    if kind == "item":
        return {"category": "ingredient", "unit": "kg"}
    return {}


def bare_keeps(skeleton, plan):
    """`{unit id: facts-unit document}` — one `keep` per candidate, keys minted
    from the candidate id so two never collide."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    docs = {}
    for unit in plan["units"]:
        if not unit["candidates"]:
            continue
        decisions = []
        for n, cid in enumerate(unit["candidates"]):
            tail = _NON_ASCII.sub("_", cid.lower()).strip("_")[-10:]
            decisions.append({
                "skeleton": cid, "action": "keep", "key": f"k{n}_{tail}",
                "title": label_of(by_id[cid]) or "بدون عنوان",
                "statement": "این مورد از فایل‌های بخش خوانده شده است.",
                "data": _minimal(by_id[cid])})
        docs[unit["id"]] = {"schema_version": 1, "unit": unit["id"],
                            "attempt": 1, "new": [], "decisions": decisions}
    return docs


def preflight(root, department, recordings=()):
    """Build, bare-keep, gate. Returns `{"units", "candidates", "unit_owed",
    "engine_refused", "lines"}` where `lines` are the engine's own refusals,
    grouped by rule with one example each; the CLI exits 2 when any exist."""
    root = pathlib.Path(root)
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="facts-preflight-"))
    try:
        run_dir = scratch / "runs" / "facts" / department / "00000000-000000"
        run_dir.mkdir(parents=True)
        built = build(root, department, run_dir, list(recordings))
        skeleton = json.load(open(run_dir / "skeleton.json", encoding="utf-8"))
        plan = json.load(open(run_dir / "plan.json", encoding="utf-8"))
        owed, refused = 0, collections.OrderedDict()
        for unit_id, doc in bare_keeps(skeleton, plan).items():
            path = run_dir / "units" / unit_id / "out.1.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
            for line in validate_unit(root, run_dir, path):
                if any(p.search(line) for p in UNIT_OWED):
                    owed += 1
                    continue
                rule = re.sub(r"\d+", "N", re.sub(r"'[^']*'", "'…'", line))
                rule = rule.split(": ", 1)[-1][:120]
                refused.setdefault(rule, [0, f"{unit_id}: {line[:200]}"])[0] += 1
        return {"units": built["units"], "candidates": built["candidates"],
                "unit_owed": owed,
                "engine_refused": sum(n for n, _ in refused.values()),
                "lines": [f"{n} × {rule} — e.g. {example}"
                          for rule, (n, example) in refused.items()]}
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
